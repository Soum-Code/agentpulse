"""Two limits the system used to hit silently.

Both were found by an external review. Neither changes a score; both make a
failure mode observable that previously produced ordinary-looking output.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from agentpulse.config import AgentPulseConfig
from agentpulse.schemas.events import SpanPayload
from agentpulse.transport import AsyncTransport
from agentpulse.utils import generate_span_id, generate_trace_id


def _span() -> SpanPayload:
    return SpanPayload(
        trace_id=generate_trace_id(),
        span_id=generate_span_id(),
        agent_id="agent",
    )


def _transport(limit: int) -> AsyncTransport:
    # batch_size high enough that enqueue never tries to schedule a flush; the
    # point of these tests is the path where nothing drains the buffer.
    config = AgentPulseConfig(endpoint="http://localhost:9", batch_size=10**9)
    config.max_buffered_spans = limit
    return AsyncTransport(config)


class TestBufferIsBounded:
    """The transport buffer was an unbounded list.

    Normally harmless -- a failed send goes to the fallback file rather than
    staying in memory -- but `_ensure_transport` returns quietly when there is
    no running event loop, and then the flush task never starts. Every span
    then accumulated in the agent's own process with nothing sent and nothing
    said, which is the one failure an observability SDK must not have.
    """

    def test_buffer_stops_growing_at_the_limit(self):
        t = _transport(50)
        for _ in range(200):
            t.enqueue(_span())
        assert t.stats["buffered"] == 50

    def test_dropped_spans_are_counted_rather_than_lost_quietly(self):
        t = _transport(50)
        for _ in range(200):
            t.enqueue(_span())
        # 150 over the ceiling, and the count says so. A silent drop would make
        # an empty console look merely idle.
        assert t.stats["total_dropped"] == 150

    def test_the_newest_spans_are_the_ones_kept(self):
        """If telemetry is backing up, recent spans are the useful ones."""
        t = _transport(3)
        ids = [generate_span_id() for _ in range(6)]
        for span_id in ids:
            t.enqueue(SpanPayload(trace_id=generate_trace_id(), span_id=span_id, agent_id="a"))
        kept = [s.span_id for s in t._buffer]
        assert kept == ids[-3:]

    def test_nothing_is_dropped_below_the_limit(self):
        t = _transport(100)
        for _ in range(99):
            t.enqueue(_span())
        assert t.stats["total_dropped"] == 0
        assert t.stats["buffered"] == 99

    def test_overflow_is_reported_once_not_per_span(self, caplog):
        """Per-span would be noise, and noise is how this stayed invisible."""
        t = _transport(5)
        with caplog.at_level(logging.WARNING, logger="agentpulse.transport"):
            for _ in range(500):
                t.enqueue(_span())
        overflow = [r for r in caplog.records if "buffer reached" in r.message]
        assert len(overflow) == 1

    def test_enqueue_never_raises_into_the_agent(self):
        """Whatever else happens, the wrapped agent keeps running."""
        t = _transport(1)
        for _ in range(50):
            t.enqueue(_span())  # would fail the test by raising


class TestNliTruncationIsReported:
    """DeBERTa reads at most 512 tokens of premise and hypothesis combined.

    Past that the rest of the premise is dropped and the score is computed from
    evidence the model never saw -- a long retrieved context can have its
    supporting passage cut off, and the claim then reads as unsupported. The
    call returned a normal-looking score either way.
    """

    def test_the_limit_is_named_rather_than_repeated(self):
        from app.services.grounding import MAX_NLI_TOKENS

        assert MAX_NLI_TOKENS == 512

    def test_a_result_defaults_to_not_truncated(self):
        from app.services.grounding import GroundingResult

        r = GroundingResult(
            grounding_score=0.1, entailment_prob=0.9, contradiction_prob=0.05,
            neutral_prob=0.05, label="entailment", evaluation_stage="stage2",
            latency_ms=1.0,
        )
        assert r.input_truncated is False
        assert r.input_tokens is None

    def test_truncation_is_reported_once_per_process(self, caplog):
        from app.services import evaluation_runner as runner
        from app.services.grounding import GroundingResult

        def result(truncated: bool, tokens: int):
            g = GroundingResult(
                grounding_score=0.5, entailment_prob=0.3, contradiction_prob=0.3,
                neutral_prob=0.4, label="neutral", evaluation_stage="stage2",
                latency_ms=1.0, input_tokens=tokens, input_truncated=truncated,
            )
            return type("R", (), {"grounding": g})()

        runner._warned_truncated = False
        with caplog.at_level(logging.WARNING, logger="agentpulse.evaluation_runner"):
            for _ in range(20):
                runner._warn_if_truncated_once(result(True, 2719))
        hits = [r for r in caplog.records if "512-token window" in r.message]
        assert len(hits) == 1
        assert "2719" in hits[0].getMessage()

    def test_nothing_is_said_when_the_premise_fits(self, caplog):
        from app.services import evaluation_runner as runner
        from app.services.grounding import GroundingResult

        g = GroundingResult(
            grounding_score=0.1, entailment_prob=0.9, contradiction_prob=0.05,
            neutral_prob=0.05, label="entailment", evaluation_stage="stage2",
            latency_ms=1.0, input_tokens=19, input_truncated=False,
        )
        runner._warned_truncated = False
        with caplog.at_level(logging.WARNING, logger="agentpulse.evaluation_runner"):
            runner._warn_if_truncated_once(type("R", (), {"grounding": g})())
        assert not [r for r in caplog.records if "512-token window" in r.message]

    def test_a_skipped_grounding_step_is_not_mistaken_for_truncation(self):
        """Grounding is absent whenever capture is off; that is a different fault."""
        from app.services import evaluation_runner as runner

        runner._warned_truncated = False
        runner._warn_if_truncated_once(type("R", (), {"grounding": None})())
        assert runner._warned_truncated is False
