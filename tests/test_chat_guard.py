"""Tests for demo/chat_guard.py: the limits, the kill switch and which IP a turn counts against."""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from demo.chat_guard import (
    DEFAULT_PAUSE_MESSAGE,
    GuardSettings,
    TurnLimiter,
    check_message,
    check_pause,
    clean_session_id,
    client_ip,
    parse_networks,
)

DOCKER = parse_networks("172.16.0.0/12")


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def _noon():
    return datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc).timestamp()


# Which IP a turn counts against: the TCP peer, unless that peer is a trusted proxy.
class TestClientIp:
    def test_without_a_trusted_proxy_the_header_is_ignored(self):
        assert client_ip("203.0.113.9", "1.2.3.4", []) == "203.0.113.9"
        assert client_ip("203.0.113.9", "1.2.3.4", DOCKER) == "203.0.113.9"

    def test_behind_caddy_the_forwarded_address_is_the_client(self):
        assert client_ip("172.18.0.5", "198.51.100.7", DOCKER) == "198.51.100.7"

    def test_a_spoofed_entry_to_the_left_does_not_win(self):
        # Caddy trusts no proxy in front of itself, so it replaces the header; but if a hop
        # ever appended instead, the rightmost untrusted entry is still the one it saw.
        assert client_ip("172.18.0.5", "6.6.6.6, 198.51.100.7", DOCKER) == "198.51.100.7"

    def test_trusted_hops_are_skipped(self):
        assert client_ip("172.18.0.5", "198.51.100.7, 172.18.0.9", DOCKER) == "198.51.100.7"

    def test_a_malformed_header_falls_back_to_the_nearest_trusted_hop(self):
        assert client_ip("172.18.0.5", "not-an-ip", DOCKER) == "172.18.0.5"
        assert client_ip("172.18.0.5", "", DOCKER) == "172.18.0.5"

    def test_ipv6(self):
        assert client_ip("::1", "2001:db8::1", parse_networks("::1")) == "2001:db8::1"

    def test_a_bad_trusted_proxy_setting_fails_at_start(self):
        with pytest.raises(ValueError):
            parse_networks("172.16.0.0/12, nonsense")


# The question itself: empty and oversize ones are refused; session ids are cleaned.
class TestMessage:
    def test_empty_and_blank_are_refused(self):
        for text in ("", "   \n "):
            refusal = check_message(text, GuardSettings())
            assert (refusal.status, refusal.code) == (400, "empty_message")

    def test_oversize_is_refused_with_the_limit_in_the_message(self):
        refusal = check_message("x" * 501, GuardSettings(max_input_chars=500))
        assert (refusal.status, refusal.code) == (400, "message_too_long")
        assert "500" in refusal.message and "501" in refusal.message
        assert check_message("x" * 500, GuardSettings(max_input_chars=500)) is None

    def test_session_ids_are_short_plain_tokens(self):
        make = lambda: "sess_new"  # noqa: E731
        assert clean_session_id("sess_abc-1", make) == "sess_abc-1"
        assert clean_session_id(None, make) == "sess_new"
        assert clean_session_id("<script>", make) == "sess_new"
        assert clean_session_id("a" * 65, make) == "sess_new"


# The kill switch: the env flag and the flag file, which works without a restart.
class TestPause:
    def test_running_by_default(self):
        assert check_pause(GuardSettings()) is None

    def test_the_env_flag_pauses(self):
        refusal = check_pause(GuardSettings.from_env({"CHAT_PAUSED": "1"}))
        assert (refusal.status, refusal.code, refusal.message) == (503, "paused", DEFAULT_PAUSE_MESSAGE)

    def test_the_flag_file_pauses_and_resumes_without_a_restart(self, tmp_path):
        flag = tmp_path / "paused"
        settings = GuardSettings.from_env({"CHAT_PAUSE_FILE": str(flag)})
        assert check_pause(settings) is None
        flag.write_text("")
        assert check_pause(settings).message == DEFAULT_PAUSE_MESSAGE
        flag.write_text("Back on Monday.\n")
        assert check_pause(settings).message == "Back on Monday."
        flag.unlink()
        assert check_pause(settings) is None


# The per-IP minute and day, the site's day, and the turns running at once.
class TestLimiter:
    # In short: admit a turn for this IP and, if it was admitted, let it end, as the server
    # does when the turn is over. Returns what admit() returned.
    @staticmethod
    def _turn(limiter, ip):
        refusal = limiter.admit(ip)
        if refusal is None:
            limiter.finish(ip)
        return refusal

    def test_per_ip_per_minute(self):
        clock = Clock(_noon())
        limiter = TurnLimiter(GuardSettings(ip_per_minute=2, max_concurrent=10), clock)
        assert self._turn(limiter, "a") is None
        assert self._turn(limiter, "a") is None
        refusal = limiter.admit("a")
        assert (refusal.status, refusal.code) == (429, "rate_limited")
        assert 1 <= refusal.retry_after <= 61
        # Another visitor is not affected, and the first one can ask again a minute later.
        assert limiter.admit("b") is None
        clock.t += 61
        assert limiter.admit("a") is None

    def test_per_ip_per_day_resets_at_utc_midnight(self):
        clock = Clock(_noon())
        limiter = TurnLimiter(GuardSettings(ip_per_minute=100, ip_per_day=3, max_concurrent=10), clock)
        for _ in range(3):
            assert self._turn(limiter, "a") is None
            clock.t += 61
        refusal = limiter.admit("a")
        assert refusal.code == "rate_limited" and "today" in refusal.message
        assert refusal.retry_after == pytest.approx(12 * 3600 - 3 * 61, abs=2)
        clock.t = datetime(2026, 10, 26, 0, 0, 1, tzinfo=timezone.utc).timestamp()
        assert limiter.admit("a") is None

    def test_the_global_daily_cap_covers_every_visitor_and_says_when_it_resets(self):
        clock = Clock(_noon())
        limiter = TurnLimiter(GuardSettings(daily_cap=3, max_concurrent=10), clock)
        assert [limiter.admit(ip) for ip in "abc"] == [None, None, None]
        refusal = limiter.admit("d")
        assert (refusal.status, refusal.code) == (429, "daily_cap")
        assert "at 00:00 UTC, in 12 h 0 min" in refusal.message
        assert refusal.retry_after == 12 * 3600
        assert limiter.usage() == {"turns_today": 3, "daily_cap": 3, "running": 3}

    def test_concurrent_turns_are_capped_and_freed_by_finish(self):
        limiter = TurnLimiter(GuardSettings(max_concurrent=1), Clock(_noon()))
        assert limiter.admit("a") is None
        assert limiter.admit("b").code == "busy"
        limiter.finish("a")
        assert limiter.admit("b") is None

    def test_one_ip_runs_one_turn_at_a_time(self):
        # A second tab or a double-click from the same IP waits for its first turn, while
        # another visitor is not held up by it.
        limiter = TurnLimiter(GuardSettings(max_concurrent=5), Clock(_noon()))
        assert limiter.admit("a") is None
        refusal = limiter.admit("a")
        assert (refusal.status, refusal.code) == (429, "busy")
        assert "still being answered" in refusal.message
        assert limiter.admit("b") is None
        limiter.finish("a")
        assert limiter.admit("a") is None
        assert limiter.usage()["running"] == 2

    def test_a_refused_request_is_not_counted(self):
        limiter = TurnLimiter(GuardSettings(max_concurrent=1, ip_per_day=5), Clock(_noon()))
        limiter.admit("a")
        assert limiter.admit("a").code == "busy"
        assert limiter.usage()["turns_today"] == 1


# The defaults are sized for a handful of examiners, and the kill switch is off unless it is
# turned on on purpose: an empty or "0" value must never hide the demo.
def test_defaults_suit_a_few_examiners_and_leave_the_chat_on():
    s = GuardSettings.from_env({})
    assert (s.ip_per_minute, s.ip_per_day, s.daily_cap) == (5, 40, 300)
    assert s.ip_per_minute >= 5 and s.ip_per_day >= 20
    for value in ("", "0", "false", "no", "off"):
        assert check_pause(GuardSettings.from_env({"CHAT_PAUSED": value})) is None


def test_settings_come_from_the_environment():
    s = GuardSettings.from_env(
        {
            "CHAT_IP_TURNS_PER_MINUTE": "5",
            "CHAT_IP_TURNS_PER_DAY": "50",
            "CHAT_DAILY_TURN_CAP": "999",
            "CHAT_MAX_CONCURRENT_TURNS": "4",
            "CHAT_MAX_INPUT_CHARS": "800",
            "CHAT_TRUSTED_PROXIES": "10.0.0.0/8, 172.16.0.0/12",
        }
    )
    assert (s.ip_per_minute, s.ip_per_day, s.daily_cap, s.max_concurrent, s.max_input_chars) == (
        5, 50, 999, 4, 800,
    )
    assert [str(n) for n in s.trusted_proxies] == ["10.0.0.0/8", "172.16.0.0/12"]
