"""The limits on the public Telemetry Lab (POST /v1/simulate).

The public site lets this one write through without the write password, and nginx adds the
server's API key to it, so the backend has to refuse what should not run. These tests check, in
order: which address a request is counted under (and that a visitor's own X-Forwarded-For cannot
change it), the counting rules with a clock the test moves by hand, the queue-depth reader against
a real database, and the route itself: the 429 reply, its header and body, and that nothing else
became public.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.config import settings
from app.main import create_app
from app.services import simulate_guard
from app.services.simulate_guard import (
    BUSY_RETRY_SECONDS,
    DEFAULT_TRUSTED_PROXIES,
    SimulateGuard,
    SimulateSettings,
    client_ip,
    parse_networks,
)

TRUSTED = parse_networks(DEFAULT_TRUSTED_PROXIES)
NGINX = "172.18.0.5"  # what the backend sees as the TCP peer on the compose network


def utc(year, month, day, hour=0, minute=0, second=0) -> float:
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc).timestamp()


class Clock:
    """A clock the test moves by hand."""

    def __init__(self, now: float):
        self.now = now

    def __call__(self) -> float:
        return self.now


async def idle_queue() -> int:
    return 0


def guard(clock, **limits) -> SimulateGuard:
    return SimulateGuard(SimulateSettings(**limits), clock=clock)


def admit(g: SimulateGuard, ip: str, depth=idle_queue):
    return asyncio.run(g.admit(ip, depth))


# --- which address a request is counted under -----------------------------------------------


def test_a_request_that_came_straight_from_the_internet_is_counted_as_its_peer():
    # No proxy in between: the header is the visitor's own and is ignored.
    assert client_ip("203.0.113.9", "6.6.6.6", TRUSTED) == "203.0.113.9"
    assert client_ip("203.0.113.9", None, TRUSTED) == "203.0.113.9"


def test_behind_the_proxies_the_visitor_is_the_address_caddy_wrote():
    # Caddy replaces any X-Forwarded-For with the address it saw; nginx passes it on.
    assert client_ip(NGINX, "203.0.113.9", TRUSTED) == "203.0.113.9"


def test_a_visitors_own_header_in_front_of_the_real_one_changes_nothing():
    """The leftmost entry is the one a visitor can write. Reading from the right ignores it."""
    for fake in ("6.6.6.6", "1.1.1.1, 2.2.2.2", "10.0.0.1", "garbage", ""):
        assert client_ip(NGINX, f"{fake}, 203.0.113.9", TRUSTED) == "203.0.113.9", fake


def test_a_proxy_added_after_caddy_is_skipped_too():
    # If nginx ever appends its peer (Caddy's address) the visitor is still the one before it.
    assert client_ip(NGINX, "203.0.113.9, 172.18.0.3", TRUSTED) == "203.0.113.9"
    assert client_ip(NGINX, "6.6.6.6, 203.0.113.9, 172.18.0.3", TRUSTED) == "203.0.113.9"


def test_a_malformed_entry_stops_the_walk_at_the_last_trusted_hop():
    assert client_ip(NGINX, "203.0.113.9, not-an-ip", TRUSTED) == NGINX
    assert client_ip(NGINX, "junk, 172.18.0.3", TRUSTED) == "172.18.0.3"


def test_an_unknown_or_unparseable_peer_is_not_trusted_with_a_header():
    assert client_ip(None, "6.6.6.6", TRUSTED) == "unknown"
    assert client_ip("testclient", "6.6.6.6", TRUSTED) == "testclient"


def test_with_no_trusted_proxy_the_header_is_never_read():
    assert client_ip(NGINX, "203.0.113.9", []) == NGINX


def test_one_ipv6_network_is_one_visitor_and_ipv4_in_ipv6_is_the_ipv4_address():
    # A visitor on IPv6 usually holds a whole /64: new addresses must not mean new allowances.
    a = client_ip(NGINX, "2001:db8:1:2::1", TRUSTED)
    b = client_ip(NGINX, "2001:db8:1:2:ffff:ffff:ffff:ffff", TRUSTED)
    other = client_ip(NGINX, "2001:db8:1:3::1", TRUSTED)
    assert a == b == "2001:db8:1:2::/64"
    assert other != a
    assert client_ip(NGINX, "::ffff:203.0.113.9", TRUSTED) == "203.0.113.9"


# --- the counting rules ---------------------------------------------------------------------


def test_one_ip_gets_six_runs_an_hour_and_the_seventh_waits_for_the_oldest_to_age_out():
    clock = Clock(utc(2026, 11, 3, 10, 0, 0))
    g = guard(clock)
    for i in range(6):
        clock.now += 60  # one run a minute: 10:00:00 is the first, so it ages out at 11:00:00
        assert admit(g, "203.0.113.9") is None, i

    refusal = admit(g, "203.0.113.9")
    # It is 10:06:00 and the first run was at 10:01:00, so that run ages out at 11:01:00: 55 minutes.
    assert (refusal.code, refusal.retry_after) == ("ip_hour_limit", 55 * 60)
    assert refusal.message == (
        "You have run 6 scenarios in the last hour, the most one visitor can. Try again in 55 min."
    )

    # Another visitor is not affected.
    assert admit(g, "198.51.100.4") is None


def test_the_hour_window_resets_when_the_oldest_run_is_an_hour_old():
    clock = Clock(utc(2026, 11, 3, 10, 0, 0))
    g = guard(clock, ip_per_hour=2)
    assert admit(g, "203.0.113.9") is None            # 10:00:00
    clock.now += 600
    assert admit(g, "203.0.113.9") is None            # 10:10:00
    assert admit(g, "203.0.113.9").retry_after == 3000  # until 11:00:00

    clock.now = utc(2026, 11, 3, 10, 59, 59)
    assert admit(g, "203.0.113.9").retry_after == 1     # one second short: still refused
    clock.now = utc(2026, 11, 3, 11, 0, 0)
    assert admit(g, "203.0.113.9") is None              # the 10:00:00 run is an hour old: one slot is free
    assert admit(g, "203.0.113.9").code == "ip_hour_limit"


def test_the_per_ip_daily_limit_resets_at_utc_midnight():
    clock = Clock(utc(2026, 11, 3, 0, 0, 0))
    g = guard(clock, ip_per_hour=1000, ip_per_day=30, daily_cap=1000)
    for _ in range(30):
        assert admit(g, "203.0.113.9") is None
        clock.now += 60  # 30 minutes in all, so the hour limit is not what stops it

    clock.now = utc(2026, 11, 3, 18, 48, 0)
    refusal = admit(g, "203.0.113.9")
    assert (refusal.code, refusal.retry_after) == ("ip_day_limit", 5 * 3600 + 12 * 60)
    assert refusal.message == (
        "You have run 30 scenarios today, the most one visitor can. "
        "It resets at 00:00 UTC, in 5 h 12 min."
    )

    clock.now = utc(2026, 11, 4, 0, 0, 0)
    assert admit(g, "203.0.113.9") is None


def test_the_daily_cap_is_for_the_whole_site_and_resets_at_utc_midnight():
    clock = Clock(utc(2026, 11, 3, 20, 0, 0))
    g = guard(clock, ip_per_hour=1000, ip_per_day=1000, daily_cap=300)
    for i in range(300):
        assert admit(g, f"203.0.{i // 250}.{i % 250 + 1}") is None

    refusal = admit(g, "198.51.100.77")  # a visitor who has not run anything today
    assert (refusal.code, refusal.retry_after) == ("daily_cap", 4 * 3600)
    assert refusal.message == (
        "The Telemetry Lab has run all the scenarios it can for today. "
        "It starts again at 00:00 UTC, in 4 h 0 min."
    )
    assert g.usage()["runs_today"] == 300

    clock.now = utc(2026, 11, 4, 0, 0, 1)
    assert admit(g, "198.51.100.77") is None
    assert g.usage()["runs_today"] == 1


def test_a_deep_queue_refuses_without_costing_the_visitor_a_run():
    clock = Clock(utc(2026, 11, 3, 10, 0, 0))
    g = guard(clock, ip_per_hour=1, max_queue_depth=100)

    async def deep() -> int:
        return 100

    async def almost() -> int:
        return 99

    refusal = admit(g, "203.0.113.9", deep)
    assert (refusal.code, refusal.retry_after) == ("busy", BUSY_RETRY_SECONDS)
    assert refusal.message == "The evaluator is still scoring earlier runs. Try again in 30 s."
    assert g.usage()["runs_today"] == 0

    # Not recorded, so the one run this visitor is allowed an hour is still theirs.
    assert admit(g, "203.0.113.9", almost) is None
    assert admit(g, "203.0.113.9", almost).code == "ip_hour_limit"


def test_the_counts_are_checked_again_after_the_queue_was_read():
    """Two requests from one IP both pass the first check while the queue is being read."""
    clock = Clock(utc(2026, 11, 3, 10, 0, 0))
    g = guard(clock, ip_per_hour=1)

    async def both():
        async def slow() -> int:
            await asyncio.sleep(0.01)
            return 0
        return await asyncio.gather(g.admit("203.0.113.9", slow), g.admit("203.0.113.9", slow))

    first, second = asyncio.run(both())
    assert sorted(r is None for r in (first, second)) == [False, True]
    assert g.usage()["runs_today"] == 1


@pytest.mark.parametrize("name", ["ip_per_hour", "ip_per_day", "daily_cap", "max_queue_depth"])
def test_a_limit_of_zero_closes_the_lab(name):
    g = guard(Clock(utc(2026, 11, 3, 10, 0, 0)), **{name: 0})
    assert admit(g, "203.0.113.9") is not None
    assert g.usage()["runs_today"] == 0


def test_memory_holds_only_ips_that_ran_something_and_forgets_them():
    clock = Clock(utc(2026, 11, 3, 10, 0, 0))
    g = guard(clock, ip_per_hour=1)
    # Refused requests are not stored: 50 visitors who are turned away leave nothing behind.
    for i in range(50):
        admit(g, f"203.0.113.{i}", lambda: asyncio.sleep(0, result=10**6))
    assert g.usage()["ips_today"] == 0 and g.usage()["ips_last_hour"] == 0

    for i in range(50):
        assert admit(g, f"203.0.113.{i}") is None
    assert g.usage()["ips_last_hour"] == 50

    clock.now += 3601  # an hour later the per-hour list is empty again, the day's counts stay
    admit(g, "198.51.100.1")
    assert g.usage()["ips_last_hour"] == 1
    assert g.usage()["ips_today"] == 51

    clock.now = utc(2026, 11, 4, 0, 0, 0)  # a new day drops the day's counts as well
    admit(g, "198.51.100.1")
    assert g.usage() == {"runs_today": 1, "daily_cap": 300, "ips_today": 1, "ips_last_hour": 1}


# --- the settings ---------------------------------------------------------------------------


def test_the_defaults_are_the_documented_ones():
    s = SimulateSettings.from_env({})
    assert (s.ip_per_hour, s.ip_per_day, s.daily_cap, s.max_queue_depth) == (6, 30, 300, 100)
    assert [str(n) for n in s.trusted_proxies] == [
        "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7",
    ]


def test_every_limit_can_be_set_and_a_typo_falls_back_to_the_default():
    s = SimulateSettings.from_env({
        "AGENTPULSE_SIMULATE_IP_PER_HOUR": "20",
        "AGENTPULSE_SIMULATE_IP_PER_DAY": "many",
        "AGENTPULSE_SIMULATE_DAILY_CAP": "-5",
        "AGENTPULSE_SIMULATE_MAX_QUEUE_DEPTH": "",
        "AGENTPULSE_SIMULATE_TRUSTED_PROXIES": "192.0.2.0/24, 203.0.113.7",
    })
    assert (s.ip_per_hour, s.ip_per_day, s.daily_cap, s.max_queue_depth) == (20, 30, 0, 100)
    assert [str(n) for n in s.trusted_proxies] == ["192.0.2.0/24", "203.0.113.7/32"]

    broken = SimulateSettings.from_env({"AGENTPULSE_SIMULATE_TRUSTED_PROXIES": "10.0.0.0/8, nonsense"})
    assert [str(n) for n in broken.trusted_proxies] == [str(n) for n in TRUSTED]


# --- the queue-depth reader, against a real database ----------------------------------------


@pytest.mark.asyncio
async def test_queue_depth_counts_queued_and_running_jobs_and_nothing_else(tmp_path):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlmodel import SQLModel

    from app.services import job_queue

    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'q.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async with AsyncSession(engine, expire_on_commit=False) as session:
        assert await simulate_guard.queue_depth(session) == 0

        for i in range(5):
            await job_queue.enqueue_job(
                session, trace_id="t", span_id=f"s{i}", agent_id="a", payload={},
            )
        await session.commit()
        assert await simulate_guard.queue_depth(session) == 5

        # One claimed (running) still counts; a finished one does not.
        first = await job_queue.claim_next(session, worker_id="w")
        second = await job_queue.claim_next(session, worker_id="w")
        assert await simulate_guard.queue_depth(session) == 5
        await job_queue.mark_succeeded(session, first.id)
        await job_queue.mark_failed(session, second.id, error="x", retryable=False)
        assert await simulate_guard.queue_depth(session) == 3
    await engine.dispose()


# --- the route ------------------------------------------------------------------------------


def lab_client(peer: str = NGINX, **limits):
    """A client whose requests arrive from `peer`, the way nginx's do, on a fresh app."""
    app = create_app()
    app.state.simulate_guard = SimulateGuard(SimulateSettings(**limits))
    transport = httpx.ASGITransport(app=app, client=(peer, 54321))
    client = httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={"X-API-Key": settings.api_key},
    )
    return app, client


@pytest.fixture(autouse=True)
def no_queue_in_route_tests(monkeypatch):
    """The route tests do not need a database queue; one test below makes it deep."""
    monkeypatch.setattr(simulate_guard, "evaluation_queue_depth", idle_queue)


@pytest.mark.asyncio
async def test_the_seventh_run_from_one_visitor_is_a_429_with_a_retry_after_and_a_stable_body():
    app, client = lab_client()
    async with client:
        from app.database import init_db
        await init_db()
        visitor = {"X-Forwarded-For": "203.0.113.9"}
        for _ in range(6):
            ok = await client.post("/v1/simulate", json={"scenario": "disagreement"}, headers=visitor)
            assert ok.status_code == 200 and ok.json()["accepted"] == 2

        refused = await client.post("/v1/simulate", json={"scenario": "disagreement"}, headers=visitor)

    assert refused.status_code == 429
    body = refused.json()
    assert set(body) == {"detail", "code", "retry_after"}
    assert body["code"] == "ip_hour_limit"
    assert body["detail"].startswith("You have run 6 scenarios in the last hour, the most one visitor can.")
    assert 1 <= body["retry_after"] <= 3600
    assert refused.headers["Retry-After"] == str(body["retry_after"])
    assert refused.headers["content-type"] == "application/json"


@pytest.mark.asyncio
async def test_a_refused_run_writes_nothing():
    from sqlalchemy import func
    from sqlmodel import select

    from app.database import get_session, init_db
    from app.models import Trace

    await init_db()

    async def traces() -> int:
        async with get_session() as session:
            return (await session.execute(
                select(func.count()).select_from(Trace).where(Trace.service_name == "simulation_studio")
            )).scalar_one()

    app, client = lab_client(ip_per_hour=1)
    async with client:
        await client.post("/v1/simulate", json={"scenario": "disagreement"})
        before = await traces()
        refused = await client.post("/v1/simulate", json={"scenario": "drift"})
        assert refused.status_code == 429
        assert await traces() == before


@pytest.mark.asyncio
async def test_a_visitor_cannot_dodge_the_limit_with_their_own_x_forwarded_for():
    app, client = lab_client(ip_per_hour=2)
    async with client:
        from app.database import init_db
        await init_db()
        codes = []
        for i in range(5):
            # Caddy writes the real address last; the visitor changes everything before it.
            fake = f"6.6.6.{i}, 198.51.{i}.1"
            reply = await client.post(
                "/v1/simulate", json={"scenario": "disagreement"},
                headers={"X-Forwarded-For": f"{fake}, 203.0.113.9"},
            )
            codes.append(reply.status_code)
    assert codes == [200, 200, 429, 429, 429]


@pytest.mark.asyncio
async def test_two_x_forwarded_for_headers_are_read_as_one_list_from_the_right():
    app, client = lab_client(ip_per_hour=1)
    async with client:
        from app.database import init_db
        await init_db()
        one = await client.post(
            "/v1/simulate", json={"scenario": "disagreement"},
            headers=[("X-Forwarded-For", "203.0.113.9")],
        )
        # A second header in front of the real one does not make a second visitor of them.
        again = await client.post(
            "/v1/simulate", json={"scenario": "disagreement"},
            headers=[("X-Forwarded-For", "6.6.6.6"), ("X-Forwarded-For", "203.0.113.9")],
        )
    assert (one.status_code, again.status_code) == (200, 429)


@pytest.mark.asyncio
async def test_a_visitor_cannot_poison_the_limit_of_someone_else():
    """Writing another visitor's address into the header does not use up that visitor's runs."""
    app, client = lab_client(ip_per_hour=1)
    async with client:
        from app.database import init_db
        await init_db()
        victim = "198.51.100.200"
        # The attacker sends the victim's address on the left, their own (written by Caddy) last.
        for _ in range(3):
            await client.post(
                "/v1/simulate", json={"scenario": "disagreement"},
                headers={"X-Forwarded-For": f"{victim}, 203.0.113.9"},
            )
        ok = await client.post(
            "/v1/simulate", json={"scenario": "disagreement"}, headers={"X-Forwarded-For": victim},
        )
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_a_request_not_sent_by_a_trusted_proxy_cannot_choose_its_address_at_all():
    # Straight from the internet (a public peer): the header is ignored, the peer is counted.
    app, client = lab_client(peer="203.0.113.9", ip_per_hour=1)
    async with client:
        from app.database import init_db
        await init_db()
        first = await client.post(
            "/v1/simulate", json={"scenario": "disagreement"}, headers={"X-Forwarded-For": "6.6.6.1"},
        )
        second = await client.post(
            "/v1/simulate", json={"scenario": "disagreement"}, headers={"X-Forwarded-For": "6.6.6.2"},
        )
    assert (first.status_code, second.status_code) == (200, 429)


@pytest.mark.asyncio
async def test_the_daily_cap_answers_everyone_with_the_same_429():
    app, client = lab_client(daily_cap=1)
    async with client:
        from app.database import init_db
        await init_db()
        await client.post(
            "/v1/simulate", json={"scenario": "disagreement"}, headers={"X-Forwarded-For": "203.0.113.1"},
        )
        refused = await client.post(
            "/v1/simulate", json={"scenario": "disagreement"}, headers={"X-Forwarded-For": "203.0.113.2"},
        )
    assert refused.status_code == 429
    assert refused.json()["code"] == "daily_cap"
    assert refused.headers["Retry-After"] == str(refused.json()["retry_after"])


@pytest.mark.asyncio
async def test_a_deep_evaluation_queue_answers_busy_and_a_shorter_one_does_not(monkeypatch):
    depth = {"now": 100}

    async def current() -> int:
        return depth["now"]

    monkeypatch.setattr(simulate_guard, "evaluation_queue_depth", current)
    app, client = lab_client(max_queue_depth=100)
    async with client:
        from app.database import init_db
        await init_db()
        busy = await client.post("/v1/simulate", json={"scenario": "disagreement"})
        depth["now"] = 99
        fine = await client.post("/v1/simulate", json={"scenario": "disagreement"})
    assert busy.status_code == 429
    assert busy.json() == {
        "detail": "The evaluator is still scoring earlier runs. Try again in 30 s.",
        "code": "busy",
        "retry_after": 30,
    }
    assert busy.headers["Retry-After"] == "30"
    assert fine.status_code == 200


@pytest.mark.asyncio
async def test_the_real_queue_reader_is_used_by_the_route(monkeypatch):
    """Without the stub from the fixture above, the route reads evaluation_jobs itself."""
    monkeypatch.undo()  # drops the autouse stub; the real evaluation_queue_depth runs
    seen = []
    real = simulate_guard.queue_depth

    async def spy(session):
        seen.append(await real(session))
        return seen[-1]

    monkeypatch.setattr(simulate_guard, "queue_depth", spy)
    app, client = lab_client(max_queue_depth=10**9)
    async with client:
        from app.database import init_db
        await init_db()
        reply = await client.post("/v1/simulate", json={"scenario": "disagreement"})
    assert reply.status_code == 200
    assert len(seen) == 1 and seen[0] >= 0


@pytest.mark.asyncio
async def test_a_query_longer_than_500_characters_is_a_422_and_costs_no_run():
    app, client = lab_client(ip_per_hour=1)
    async with client:
        from app.database import init_db
        await init_db()
        too_long = await client.post("/v1/simulate", json={"scenario": "clean", "query": "x" * 501})
        longest = await client.post("/v1/simulate", json={"scenario": "clean", "query": "x" * 500})
    assert too_long.status_code == 422
    assert longest.status_code == 200


@pytest.mark.asyncio
async def test_nothing_else_became_public_or_limited(monkeypatch):
    """The route still needs the key, ingest is not limited by this file, reads are unchanged."""
    app = create_app()
    app.state.simulate_guard = SimulateGuard(SimulateSettings(ip_per_hour=0, daily_cap=0))
    transport = httpx.ASGITransport(app=app, client=(NGINX, 1))
    monkeypatch.setattr(settings, "local_dev_mode", False)
    from app.database import init_db
    await init_db()

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as anonymous:
        # No key: the key check comes first, as before, for the Lab and for everything else.
        assert (await anonymous.post("/v1/simulate", json={"scenario": "clean"})).status_code == 401
        assert (await anonymous.post("/v1/ingest", json={"spans": []})).status_code == 401
        assert (await anonymous.get("/v1/alerts")).status_code == 401
        assert (await anonymous.post("/v1/keys", json={"owner_id": "x"})).status_code == 401

    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={"X-API-Key": settings.api_key},
    ) as keyed:
        # The Lab is closed (limits of 0), yet ingest, which this file does not touch, works.
        assert (await keyed.post("/v1/simulate", json={"scenario": "clean"})).status_code == 429
        ingest = await keyed.post(
            "/v1/ingest",
            json={"service_name": "guard-test", "spans": [
                {"trace_id": "guard-t", "span_id": "guard-s-1", "agent_id": "guard-agent"},
            ]},
        )
        assert ingest.status_code == 202
        assert (await keyed.get("/v1/simulate/does-not-exist")).status_code == 404


@pytest.mark.asyncio
async def test_only_demo_traces_under_the_fixed_service_name_are_written():
    from sqlalchemy import func
    from sqlmodel import select

    from app.database import get_session, init_db
    from app.models import Trace
    from app.routers.ingest import SIMULATION_SERVICE

    app, client = lab_client()
    async with client:
        await init_db()
        reply = await client.post(
            "/v1/simulate",
            json={"scenario": "clean", "service_name": "someone-elses-service", "trace_id": "mine"},
        )
        assert reply.status_code == 200
        trace_id = reply.json()["trace_id"]

    async with get_session() as session:
        stored = (await session.execute(select(Trace).where(Trace.trace_id == trace_id))).scalar_one()
        mine = (await session.execute(
            select(func.count()).select_from(Trace).where(Trace.trace_id == "mine")
        )).scalar_one()
    assert stored.service_name == SIMULATION_SERVICE == "simulation_studio"
    assert mine == 0  # the extra fields in the body were ignored, not used
