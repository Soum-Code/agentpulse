"""Limits for the public Telemetry Lab: who may start a scenario, how often, and when to wait.

POST /v1/simulate is the one write the public site lets through without the write password
(deploy/azure/Caddyfile). nginx adds the server's own API key to it, so the backend has to be
the one that says no. A run is admitted only if:

    this IP has runs left      AGENTPULSE_SIMULATE_IP_PER_HOUR and AGENTPULSE_SIMULATE_IP_PER_DAY
    the site has runs left     AGENTPULSE_SIMULATE_DAILY_CAP, all visitors together
    the evaluator can keep up  fewer than AGENTPULSE_SIMULATE_MAX_QUEUE_DEPTH jobs queued or
                               running in evaluation_jobs

Days are UTC days. The counters live in this process's memory, so a restart sets them to zero;
that is the price of needing no table for it. A limit of 0 refuses every run, which is also the
way to close the Lab without touching Caddy.

The visitor's IP is the TCP peer, unless that peer is a trusted proxy
(AGENTPULSE_SIMULATE_TRUSTED_PROXIES, addresses or CIDR ranges). Only then is X-Forwarded-For
read, from the right, skipping entries that are themselves trusted proxies. So a visitor who
sends their own X-Forwarded-For cannot pick the address they are counted as: Caddy replaces
the header with the address it saw, and a request that did not come through a trusted proxy
has the header ignored. This is the rule of client_ip() in demo/chat_guard.py, copied here
because the backend image does not contain demo/.
"""

# WHAT THIS FILE IS FOR
# The rules behind the 429 answers of POST /v1/simulate. No FastAPI route is defined here, and
# the clock and the queue-depth reader are passed in, so every rule can be tested on its own
# (tests/test_simulate_guard.py).
#
# HOW IT FITS IN
# routers/ingest.py calls check_simulate_request(request) at the top of simulate_pipeline.
# This file reads the queue size through services/platform_health.py (job_state_counts, the same
# count /v1/platform shows) and nothing else of the database.

from __future__ import annotations

import ipaddress
import logging
import math
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional, Union

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("agentpulse.simulate_guard")

IPNetwork = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]
IPAddress = Union[ipaddress.IPv4Address, ipaddress.IPv6Address]

# The ranges Docker gives its networks. The backend publishes no port on the Azure VM, so the
# only thing that talks to it is the dashboard's nginx, which is one of these.
DEFAULT_TRUSTED_PROXIES = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"

# How long the "evaluator is busy" answer tells a visitor to wait. A fixed, short time: the
# queue drains in well under a minute (one worker scores about 3.9 spans a second,
# experiments/results/throughput_benchmark.json), and with no worker running it does not drain,
# so the answer stays "busy" for as long as the worker is down, which is what should happen.
BUSY_RETRY_SECONDS = 30


# In short: a whole number from the environment, or the default when it is unset or not a
# number. A typo in a limit must not stop the backend from starting. A negative number is 0.
def _env_int(env: dict[str, str], name: str, default: int) -> int:
    try:
        return max(0, int(env.get(name) or default))
    except ValueError:
        logger.error("%s is not a whole number; using %d", name, default)
        return default


# In short: parse "a, b/24, c" into networks. A single address becomes a /32 (or /128).
def parse_networks(value: str) -> list[IPNetwork]:
    nets: list[IPNetwork] = []
    for part in value.split(","):
        part = part.strip()
        if part:
            nets.append(ipaddress.ip_network(part, strict=False))
    return nets


# In short: every limit, with the defaults the Telemetry Lab starts with. 6 runs an hour and 30
# a day per visitor is enough to try each of the five scenarios once and repeat one; a campus
# network puts several examiners behind one IP, so raise the hourly one for the viva
# (deploy/azure/README.md, "Telemetry Lab"). 300 runs a day for the site is at most 300 x 32 = 9,600 spans for the one
# worker, about 41 minutes of scoring at 3.88 spans a second. 100 queued jobs is about 26
# seconds of work and room for three drift runs (32 spans each); a fresh run is refused once 100
# or more jobs are waiting.
@dataclass
class SimulateSettings:
    ip_per_hour: int = 6
    ip_per_day: int = 30
    daily_cap: int = 300
    max_queue_depth: int = 100
    trusted_proxies: list[IPNetwork] = field(
        default_factory=lambda: parse_networks(DEFAULT_TRUSTED_PROXIES)
    )

    # In short: the limits from the environment. An unset or empty trusted-proxy list means the
    # default above; an entry that does not parse is logged and the default is used, so a typo
    # cannot take the backend down.
    @classmethod
    def from_env(cls, env: Optional[dict[str, str]] = None) -> "SimulateSettings":
        env = dict(os.environ) if env is None else env
        try:
            proxies = parse_networks(env.get("AGENTPULSE_SIMULATE_TRUSTED_PROXIES") or DEFAULT_TRUSTED_PROXIES)
        except ValueError:
            logger.error("AGENTPULSE_SIMULATE_TRUSTED_PROXIES does not parse; using the default")
            proxies = parse_networks(DEFAULT_TRUSTED_PROXIES)
        return cls(
            ip_per_hour=_env_int(env, "AGENTPULSE_SIMULATE_IP_PER_HOUR", 6),
            ip_per_day=_env_int(env, "AGENTPULSE_SIMULATE_IP_PER_DAY", 30),
            daily_cap=_env_int(env, "AGENTPULSE_SIMULATE_DAILY_CAP", 300),
            max_queue_depth=_env_int(env, "AGENTPULSE_SIMULATE_MAX_QUEUE_DEPTH", 100),
            trusted_proxies=proxies,
        )


# Why a run was turned away. code is a stable word, message the sentence a visitor reads,
# retry_after the seconds until it is worth trying again.
@dataclass
class Refusal:
    code: str
    message: str
    retry_after: int

    # In short: the 429 answer. The text is under "detail", the key FastAPI's own errors use,
    # so a client that already shows API errors shows this one; Retry-After is the standard header.
    def response(self) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": self.message, "code": self.code, "retry_after": self.retry_after},
            headers={"Retry-After": str(self.retry_after)},
        )


# In short: text as an IP address, or None when it is not one. An IPv4 address written the IPv6
# way (::ffff:1.2.3.4) is read as the IPv4 address, so one visitor has one spelling.
def _parse_ip(text: str) -> Optional[IPAddress]:
    try:
        ip = ipaddress.ip_address(text.strip())
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    return ip


# In short: True when the address is inside one of the trusted proxy ranges.
def _trusted(ip: IPAddress, trusted: list[IPNetwork]) -> bool:
    return any(ip in net for net in trusted)


# In short: the key a visitor is counted under. An IPv4 address is its own key. An IPv6 visitor
# usually holds a whole /64, so counting each address would let one machine pick a new IP for
# every run; the key is the /64 instead.
def _bucket(ip: IPAddress) -> str:
    if isinstance(ip, ipaddress.IPv6Address):
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


# In short: the visitor a request is counted as. In: the TCP peer's address (None when unknown),
# every X-Forwarded-For header joined with commas (None when absent) and the trusted proxies.
# Out: the counting key. Same walk as client_ip() in demo/chat_guard.py.
def client_ip(peer: Optional[str], forwarded_for: Optional[str], trusted: list[IPNetwork]) -> str:
    peer_ip = _parse_ip(peer) if peer else None
    if peer_ip is None:
        return peer or "unknown"
    if not forwarded_for or not _trusted(peer_ip, trusted):
        return _bucket(peer_ip)
    # From the right: the last entry was added by the proxy nearest to us. Walk left past
    # every proxy we trust; the first address that is not one is the visitor. A malformed
    # entry stops the walk, and the last trusted hop is used: nothing to its left is reliable.
    nearest = peer_ip
    for part in reversed(forwarded_for.split(",")):
        ip = _parse_ip(part)
        if ip is None:
            break
        if not _trusted(ip, trusted):
            return _bucket(ip)
        nearest = ip
    return _bucket(nearest)


# In short: the UTC date of a timestamp, the key the daily counters reset on.
def _utc_day(now: float) -> str:
    return datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")


# In short: seconds from a timestamp to the next 00:00 UTC, when the daily counters reset.
def _seconds_to_utc_midnight(now: float) -> int:
    current = datetime.fromtimestamp(now, timezone.utc)
    midnight = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - current).total_seconds()))


# In short: when the daily limits reset, as a visitor reads it: "at 00:00 UTC, in 5 h 12 min".
def _reset_text(seconds: int) -> str:
    hours, minutes = divmod(max(1, (seconds + 59) // 60), 60)
    left = f"{hours} h {minutes} min" if hours else f"{minutes} min"
    return f"at 00:00 UTC, in {left}"


# In short: a wait as a visitor reads it: "45 s" below a minute, otherwise whole minutes.
def _wait_text(seconds: int) -> str:
    return f"{seconds} s" if seconds < 60 else f"{(seconds + 59) // 60} min"


# In short: how many evaluation jobs are waiting or being scored right now. The same counts as
# /v1/platform shows (job_state_counts), one grouped query on an indexed column.
async def queue_depth(session: AsyncSession) -> int:
    from app.services.platform_health import job_state_counts

    counts = await job_state_counts(session)
    return counts["queued"] + counts["running"]


# In short: queue_depth() on a fresh session. An error is not caught: if the database cannot be
# read the run is not started, and the visitor gets the usual 500.
async def evaluation_queue_depth() -> int:
    from app.database import get_session

    async with get_session() as session:
        return await queue_depth(session)


class SimulateGuard:
    """Counts Telemetry Lab runs per IP and for the whole site, and checks the queue.

    admit() either records a run and returns None, or returns the Refusal. A refused request is
    never recorded, so being turned away costs a visitor nothing. Used only from the event
    loop, and the recording step has no await in it, so no lock is needed.

    Memory is bounded by the daily cap: an IP is stored only when a run was admitted, and an
    IP whose last run is over an hour old is dropped on the next call.
    """

    # In short: start with no runs counted. The clock can be replaced, which is how the tests
    # move time forward without waiting an hour.
    def __init__(self, settings: SimulateSettings, clock: Callable[[], float] = time.time):
        self.settings = settings
        self._clock = clock
        # IP -> times of its runs in the last hour (oldest first).
        self._hour: dict[str, deque[float]] = {}
        self._day = ""
        self._day_by_ip: dict[str, int] = {}
        self._day_total = 0

    # In short: on the first call of a new UTC day, start the daily counts again from zero.
    def _roll_day(self, now: float) -> None:
        day = _utc_day(now)
        if day != self._day:
            self._day, self._day_by_ip, self._day_total = day, {}, 0

    # In short: forget the runs older than an hour, and the IPs that have none left.
    def _forget_old(self, now: float) -> None:
        for ip in list(self._hour):
            runs = self._hour[ip]
            while runs and runs[0] <= now - 3600.0:
                runs.popleft()
            if not runs:
                del self._hour[ip]

    # In short: the counting rules, in order: the site's day (the same answer for everyone),
    # then this IP's day, then this IP's last hour. Nothing is recorded here.
    def _refusal(self, ip: str, now: float) -> Optional[Refusal]:
        s = self.settings
        self._roll_day(now)
        self._forget_old(now)
        to_midnight = _seconds_to_utc_midnight(now)

        if self._day_total >= s.daily_cap:
            return Refusal(
                "daily_cap",
                "The Telemetry Lab has run all the scenarios it can for today. "
                f"It starts again {_reset_text(to_midnight)}.",
                to_midnight,
            )
        if self._day_by_ip.get(ip, 0) >= s.ip_per_day:
            return Refusal(
                "ip_day_limit",
                f"You have run {s.ip_per_day} scenarios today, the most one visitor can. "
                f"It resets {_reset_text(to_midnight)}.",
                to_midnight,
            )
        recent = self._hour.get(ip)
        if len(recent or ()) >= s.ip_per_hour:
            # With a limit of 0 there is no oldest run; the wait is then a full hour.
            wait = max(1, math.ceil(recent[0] + 3600.0 - now)) if recent else 3600
            return Refusal(
                "ip_hour_limit",
                f"You have run {s.ip_per_hour} scenarios in the last hour, the most one visitor "
                f"can. Try again in {_wait_text(wait)}.",
                wait,
            )
        return None

    # In short: record one admitted run for this IP.
    def _record(self, ip: str, now: float) -> None:
        self._hour.setdefault(ip, deque()).append(now)
        self._day_by_ip[ip] = self._day_by_ip.get(ip, 0) + 1
        self._day_total += 1

    # In short: the whole check for one request. The counts come first (no database), then the
    # queue size; the counts are checked once more after the queue was read, because other
    # requests ran while this one waited for the database, and only then is the run recorded.
    async def admit(
        self, ip: str, depth: Callable[[], Awaitable[int]],
    ) -> Optional[Refusal]:
        refusal = self._refusal(ip, self._clock())
        if refusal is not None:
            return refusal
        if await depth() >= self.settings.max_queue_depth:
            return Refusal(
                "busy",
                "The evaluator is still scoring earlier runs. "
                f"Try again in {_wait_text(BUSY_RETRY_SECONDS)}.",
                BUSY_RETRY_SECONDS,
            )
        now = self._clock()
        refusal = self._refusal(ip, now)
        if refusal is not None:
            return refusal
        self._record(ip, now)
        return None

    # In short: what is counted right now, for tests and for a log line. No IPs.
    def usage(self) -> dict:
        now = self._clock()
        self._roll_day(now)
        self._forget_old(now)
        return {
            "runs_today": self._day_total,
            "daily_cap": self.settings.daily_cap,
            "ips_today": len(self._day_by_ip),
            "ips_last_hour": len(self._hour),
        }


# In short: the guard of this app, made the first time it is needed. It hangs on app.state, so
# every app object (and every test that builds its own) has its own counters.
def guard_for(request: Request) -> SimulateGuard:
    guard = getattr(request.app.state, "simulate_guard", None)
    if guard is None:
        guard = SimulateGuard(SimulateSettings.from_env())
        request.app.state.simulate_guard = guard
    return guard


# In short: called at the top of POST /v1/simulate. Returns the 429 response to send, or None
# when the run may go ahead (and has been counted).
async def check_simulate_request(request: Request) -> Optional[JSONResponse]:
    guard = guard_for(request)
    peer = request.client.host if request.client else None
    # Every X-Forwarded-For header, in the order they arrived, as one comma list.
    forwarded = ", ".join(request.headers.getlist("x-forwarded-for")) or None
    ip = client_ip(peer, forwarded, guard.settings.trusted_proxies)
    refusal = await guard.admit(ip, evaluation_queue_depth)
    return refusal.response() if refusal is not None else None
