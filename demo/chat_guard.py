"""Abuse controls for the public chat: who is asking, how often, how much, and whether the
owner has paused it.

Every turn spends free-tier quota that the whole site shares, so a turn is admitted only if:

    the chat is not paused        CHAT_PAUSED=1, or the file CHAT_PAUSE_FILE exists. The file
                                  is checked on every request, so the owner can pause and
                                  resume a running container with `touch` and `rm`; whatever
                                  text the file holds is shown to visitors instead of the
                                  default message
    the message is acceptable     not empty, at most CHAT_MAX_INPUT_CHARS characters
    this IP has turns left        CHAT_IP_TURNS_PER_MINUTE and CHAT_IP_TURNS_PER_DAY
    the site has turns left       CHAT_DAILY_TURN_CAP, all visitors together
    a slot is free                CHAT_MAX_CONCURRENT_TURNS turns run at the same time

Days are UTC days. The counters live in memory: restarting the container resets them, which
is the price of not needing a database for this.

The client's IP is the TCP peer, unless that peer is a trusted proxy (CHAT_TRUSTED_PROXIES,
addresses or CIDR ranges). Only then is X-Forwarded-For read, from the right, skipping
entries that are themselves trusted proxies. So a visitor who sends their own X-Forwarded-For
cannot pick the IP they are counted as: Caddy, the one trusted proxy, replaces the header with
the address it saw (it trusts no proxy in front of itself), and a request that does not come
through a trusted proxy has the header ignored.
"""

# ABOUT THIS FILE
# ---------------
# Used by demo/chat_server.py, which calls check_pause(), check_message(), client_ip()
# and TurnLimiter.admit() before it spends anything on a turn. No FastAPI code here, so the
# rules can be tested on their own: tests/test_chat_guard.py.

from __future__ import annotations

import ipaddress
import os
import re
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional, Union

IPNetwork = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]
IPAddress = Union[ipaddress.IPv4Address, ipaddress.IPv6Address]

DEFAULT_PAUSE_MESSAGE = "The live chat is paused right now. Please come back later."

# A session id is echoed back to the browser and recorded nowhere else; anything that is not
# a short plain token is replaced rather than passed along.
_SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


# In short: a whole number from the environment, or the default when it is unset or not a
# number. A typo in a limit must not stop the service from starting.
def _env_int(env: dict[str, str], name: str, default: int) -> int:
    try:
        return int(env.get(name) or default)
    except ValueError:
        return default


# In short: True only for an explicit yes (1, true, yes, on). Anything else, empty included,
# is no, so the kill switch is off unless the owner turned it on on purpose.
def _truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


# In short: parse "a, b/24, c" into networks. A single address becomes a /32 (or /128). An entry that
# does not parse is a configuration mistake and raises, so it is caught at start-up rather
# than silently trusting nothing (or everything).
def parse_networks(value: Optional[str]) -> list[IPNetwork]:
    nets: list[IPNetwork] = []
    for part in (value or "").split(","):
        part = part.strip()
        if part:
            nets.append(ipaddress.ip_network(part, strict=False))
    return nets


# In short: every limit, with defaults sized for a handful of examiners trying the site at
# once (5 questions a minute and 25 a day each) and a site-wide day that stays inside the free
# quotas when the Groq and Cerebras keys are set. The arithmetic is in deploy/azure/README.md
# ("Limits"): a turn is three calls and at most about 1,700 tokens, so 300 turns is about
# 510K tokens and 900 requests a day, against Groq's 200K tokens and 1,000 requests and
# Cerebras' 2M tokens (two models) a day.
@dataclass
class GuardSettings:
    ip_per_minute: int = 5
    ip_per_day: int = 25
    daily_cap: int = 300
    max_concurrent: int = 2
    max_input_chars: int = 500
    trusted_proxies: list[IPNetwork] = field(default_factory=list)
    paused: bool = False
    pause_file: Optional[str] = None

    # In short: the limits from the environment. CHAT_PAUSED is off unless it is set to 1,
    # true, yes or on, so a forgotten or empty value never hides the demo.
    @classmethod
    def from_env(cls, env: Optional[dict[str, str]] = None) -> "GuardSettings":
        env = dict(os.environ) if env is None else env
        return cls(
            ip_per_minute=_env_int(env, "CHAT_IP_TURNS_PER_MINUTE", 5),
            ip_per_day=_env_int(env, "CHAT_IP_TURNS_PER_DAY", 25),
            daily_cap=_env_int(env, "CHAT_DAILY_TURN_CAP", 300),
            max_concurrent=_env_int(env, "CHAT_MAX_CONCURRENT_TURNS", 2),
            max_input_chars=_env_int(env, "CHAT_MAX_INPUT_CHARS", 500),
            trusted_proxies=parse_networks(env.get("CHAT_TRUSTED_PROXIES")),
            paused=_truthy(env.get("CHAT_PAUSED")),
            pause_file=env.get("CHAT_PAUSE_FILE") or None,
        )


# Why a request was turned away. status is the HTTP status, code a stable word the dashboard
# switches on, message the sentence a visitor reads, retry_after seconds (or None).
@dataclass
class Refusal:
    status: int
    code: str
    message: str
    retry_after: Optional[int] = None

    # In short: the refusal as the JSON body the page reads.
    def as_dict(self) -> dict:
        out = {"code": self.code, "error": self.message}
        if self.retry_after is not None:
            out["retry_after"] = self.retry_after
        return out


# In short: the kill switch. Returns the pause message, or None when the chat is running.
# The file is looked at on every call, which is what lets the owner pause a running container
# with `touch` and resume it with `rm`, without a restart. Its text, if any, replaces the
# default message (at most 300 characters); a file that cannot be read still counts as a
# pause, because it exists and the owner meant it.
def pause_message(settings: GuardSettings) -> Optional[str]:
    if settings.pause_file and os.path.exists(settings.pause_file):
        try:
            with open(settings.pause_file, encoding="utf-8", errors="replace") as fh:
                text = fh.read(300).strip()
        except OSError:
            text = ""
        return text or DEFAULT_PAUSE_MESSAGE
    if settings.paused:
        return DEFAULT_PAUSE_MESSAGE
    return None


# In short: the pause as a 503 refusal, or None when the chat is running.
def check_pause(settings: GuardSettings) -> Optional[Refusal]:
    message = pause_message(settings)
    return Refusal(503, "paused", message) if message else None


# In short: refuse an empty or blank question, and one longer than CHAT_MAX_INPUT_CHARS, with a
# sentence that says which, before any model is asked.
def check_message(message: str, settings: GuardSettings) -> Optional[Refusal]:
    if not message.strip():
        return Refusal(400, "empty_message", "Type a question first.")
    if len(message) > settings.max_input_chars:
        return Refusal(
            400,
            "message_too_long",
            f"Questions are limited to {settings.max_input_chars} characters; "
            f"this one has {len(message)}.",
        )
    return None


# In short: the caller's session id if it is a short plain token, otherwise a new one.
def clean_session_id(value: Optional[str], make: Callable[[], str]) -> str:
    return value if value and _SESSION_ID.match(value) else make()


# In short: text as an IP address, or None when it is not one.
def _parse_ip(text: str) -> Optional[IPAddress]:
    try:
        return ipaddress.ip_address(text.strip())
    except ValueError:
        return None


# In short: True when the address is inside one of the trusted proxy ranges.
def _trusted(ip: IPAddress, trusted: list[IPNetwork]) -> bool:
    return any(ip in net for net in trusted)


# In short: the IP a turn is counted against. In: the TCP peer's address (None when unknown), the
# X-Forwarded-For header (None when absent) and the trusted proxies. Out: an address as text.
def client_ip(peer: Optional[str], forwarded_for: Optional[str], trusted: list[IPNetwork]) -> str:
    peer_ip = _parse_ip(peer) if peer else None
    if peer_ip is None:
        return peer or "unknown"
    if not forwarded_for or not _trusted(peer_ip, trusted):
        return str(peer_ip)
    # From the right: the last entry was added by the proxy nearest to us. Walk left past
    # every proxy we trust; the first address that is not one is the client. A malformed
    # entry stops the walk, and the last trusted hop is used: nothing to its left is reliable.
    nearest = peer_ip
    for part in reversed(forwarded_for.split(",")):
        ip = _parse_ip(part)
        if ip is None:
            break
        if not _trusted(ip, trusted):
            return str(ip)
        nearest = ip
    return str(nearest)


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


class TurnLimiter:
    """Counts turns per IP and for the whole site, and the turns running right now.

    admit() either records a turn and returns None, or returns the Refusal. A turn counts
    when it is admitted, whether or not a provider answers it: otherwise a request that makes
    every provider fail would cost nothing to repeat. finish() must be called once for every
    admitted turn, to free its concurrency slot. Used only from the event loop, so no lock.
    """

    def __init__(self, settings: GuardSettings, clock: Callable[[], float] = time.time):
        self.settings = settings
        self._clock = clock
        self._minute: dict[str, deque[float]] = {}
        self._day = ""
        self._day_by_ip: dict[str, int] = {}
        self._day_total = 0
        self.running = 0

    # In short: on the first call of a new UTC day, start the daily counts again from zero.
    def _roll_day(self, now: float) -> None:
        day = _utc_day(now)
        if day != self._day:
            self._day, self._day_by_ip, self._day_total = day, {}, 0

    # In short: the rate-limit check. Either record a turn for this IP and return None, or
    # return why not. The site's day is checked first (it is the same answer for everyone),
    # then this IP's day, its last minute, and the turns running right now.
    def admit(self, ip: str) -> Optional[Refusal]:
        s = self.settings
        now = self._clock()
        self._roll_day(now)
        to_midnight = _seconds_to_utc_midnight(now)

        if self._day_total >= s.daily_cap:
            return Refusal(
                429,
                "daily_cap",
                "The live chat has answered all the questions it can for today. "
                f"It starts again {_reset_text(to_midnight)}.",
                to_midnight,
            )
        if self._day_by_ip.get(ip, 0) >= s.ip_per_day:
            return Refusal(
                429,
                "rate_limited",
                f"You have asked {s.ip_per_day} questions today, the most one visitor can. "
                f"It resets {_reset_text(to_midnight)}.",
                to_midnight,
            )
        # This IP's last minute: drop the turns older than 60 s, then count what is left.
        recent = self._minute.setdefault(ip, deque())
        while recent and recent[0] <= now - 60.0:
            recent.popleft()
        if len(recent) >= s.ip_per_minute:
            wait = max(1, int(recent[0] + 60.0 - now) + 1)
            return Refusal(
                429,
                "rate_limited",
                f"That is {s.ip_per_minute} questions in a minute. Try again in {wait} s.",
                wait,
            )
        if self.running >= s.max_concurrent:
            return Refusal(
                429,
                "busy",
                "Other visitors' questions are running right now. Try again in a few seconds.",
                5,
            )

        recent.append(now)
        self._day_by_ip[ip] = self._day_by_ip.get(ip, 0) + 1
        self._day_total += 1
        self.running += 1
        # Forget IPs whose minute window is empty, so the map does not grow with every visitor.
        if len(self._minute) > 5000:
            self._minute = {k: v for k, v in self._minute.items() if v and v[-1] > now - 60.0}
        return None

    # In short: free the concurrency slot of a turn that has ended, however it ended.
    def finish(self) -> None:
        self.running = max(0, self.running - 1)

    # In short: what /health shows: today's count and cap, and the turns running now. No IPs.
    def usage(self) -> dict:
        self._roll_day(self._clock())
        return {
            "turns_today": self._day_total,
            "daily_cap": self.settings.daily_cap,
            "running": self.running,
        }
