"""Orchestrates the full evaluation pipeline for a span.

Coordinates: grounding → tool-claim → disagreement → drift → risk aggregation → alerts.
"""

# ---- What this file is for ---------------------------------------------------
# This is the scoring pipeline. For ONE span it runs every check (grounding, tool
# claims, disagreement between agents, drift), merges the grounding and tool-claim scores
# into a single risk number between 0 and 1 (disagreement and drift are reported
# separately), gives that number a label (low, medium or high), and asks the alert engine
# which alert rules fire. The answer is a plain object, EvaluationResult.
# This file does not read or write the database.
#
# How it fits in: app/worker.py builds one EvaluationPipeline, and
# services/evaluation_runner.py calls its `evaluate_span` for every job and saves the
# result. This file uses grounding.py, tool_claim.py, disagreement.py, drift.py and
# alerting.py from the same folder.
# ------------------------------------------------------------------------------

from __future__ import annotations

import json
import logging
# field(default_factory=list) gives every result its own new list (see EvaluationResult).
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.services.grounding import evaluate_grounding, get_embedding, GroundingResult
from app.services.tool_claim import (
    ToolCallRecord,
    ToolClaimResult,
    evaluate_tool_claims,
)
from app.services.disagreement import (
    DisagreementResult,
    evaluate_against_prior_agents,
    evaluate_inter_agent_disagreement,
)
from app.services.drift import DriftDetector, DriftResult
from app.services.alerting import AlertEngine, PendingAlert

logger = logging.getLogger("agentpulse.evaluator")


# In short: a box that holds every score for one span. A field stays None when its check
# did not run (for example no text, no tool call, or no earlier agent in the trace).
@dataclass
class EvaluationResult:
    """Complete evaluation result for a single span."""

    # Individual signals
    grounding: Optional[GroundingResult] = None
    tool_claim: Optional[ToolClaimResult] = None
    disagreement: Optional[DisagreementResult] = None
    drift: Optional[DriftResult] = None

    # Composite risk score
    # overall_risk_score is a number from 0 (low risk) to 1 (high risk), made by
    # _aggregate_risk. It is None when no check produced a score. risk_label comes from it.
    overall_risk_score: Optional[float] = None
    risk_label: Optional[str] = None  # "low_risk", "medium_risk", "high_risk"

    # Evaluation Metadata
    # These fixed default texts are saved with every evaluation (persist_results in
    # evaluation_runner.py). They are not read from settings, so changing the configured
    # model name in settings does not change them. The name says "cascade", but
    # grounding.py runs both of its models on every span; the first does not gate the second.
    evaluator_name: str = "deberta_minilm_cascade"
    model_name: str = "cross-encoder/nli-deberta-v3-small"
    # v1.1 = the NLI output order is read from the model config (see _nli_label_index in
    # grounding.py). Rows stored as v1.0 have entailment_prob and neutral_prob swapped, and
    # with them grounding_score, overall_risk_score, the risk label and the alerts fired
    # from them. Nothing filters by this field; it only tells the two kinds of rows apart.
    model_version: str = "v1.1"
    # v1.1 = overall_risk_score averages only grounding and the tool-claim score of spans
    # that had a claim to check (v1.0 also averaged in disagreement at weight 0.20 and a
    # no-claim tool check as 0.0), and a trace whose pairs were all gated as off-topic stores
    # no disagreement_score instead of 0.0. Nothing filters by this field either.
    config_version: str = "v1.1"
    threshold_version: str = "v1.0"

    # Triggered alerts
    alerts: list[PendingAlert] = field(default_factory=list)


# Calibrated prototype weights for composite risk
# How much each signal counts in the risk average (_aggregate_risk). A bigger weight
# means that signal pulls the average harder. Note: "semantic" (0.15) and "disagreement"
# (0.20) are never read. _aggregate_risk only uses grounding and tool_claim. Disagreement
# and drift are not part of the risk number at all; they are reported separately.
RISK_WEIGHTS = {
    "grounding": 0.40,
    "tool_claim": 0.25,
    "disagreement": 0.20,
    "semantic": 0.15,
}


# One pipeline object is shared by all spans. It keeps two things between spans: the
# DriftDetector (each agent's "normal" behaviour, held in memory) and the AlertEngine
# (the alert rules, plus when each alert last fired and how many fired this hour).
class EvaluationPipeline:
    """Orchestrates all evaluation steps for incoming spans."""

    def __init__(
        self,
        drift_detector: DriftDetector,
        alert_engine: AlertEngine,
    ) -> None:
        # Both objects are built by the caller (app/worker.py) and passed in. We only
        # keep references to them.
        self._drift = drift_detector
        self._alerts = alert_engine

    # Read-only access to the detector. evaluation_runner.py uses it after each job to
    # save the agent's drift baselines to the database.
    @property
    def drift_detector(self) -> DriftDetector:
        return self._drift

    # Main entry point: one span's data in, one EvaluationResult out. It is plain
    # synchronous code (no await). evaluation_runner.py runs it in a worker thread.
    def evaluate_span(
        self,
        span_id: str,
        trace_id: str,
        agent_id: str,
        input_text: Optional[str] = None,
        output_text: Optional[str] = None,
        upstream_agent_id: Optional[str] = None,
        upstream_output: Optional[str] = None,
        prior_agent_outputs: Optional[list[tuple[str, str]]] = None,
        tool_calls: Optional[list[dict]] = None,
        status: str = "success",
    ) -> EvaluationResult:
        """Run the full evaluation pipeline on a span.

        Steps:
        1. Grounding check (NLI: input vs. output claim)
        2. Tool-claim validation (claims vs. actual tool executions)
        3. Inter-agent disagreement check
        4. Drift analysis (embedding centroid, tool entropy, quality trend)
        5. Risk aggregation (weighted ensemble)
        6. Alert evaluation (threshold checks + deduplication)

        Args:
            prior_agent_outputs: (agent_id, output_text) for agents earlier in
                this trace, in trace order. When supplied, step 3 compares this
                span against all of them rather than only its immediate
                upstream, which is what lets a contradiction between
                non-adjacent agents be detected at all. Callers must pass only
                agents that precede this span, and must scope them to this
                trace. When omitted, the single-upstream path runs unchanged.
        """
        # Start with an empty result. Each step below fills in its own part.
        result = EvaluationResult()

        # 1. Grounding check
        # Needs BOTH texts: input_text is the evidence the agent saw, output_text is what
        # it said. The score runs from 0 (output is supported) to 1 (not supported).
        if input_text and output_text:
            result.grounding = evaluate_grounding(input_text, output_text)

        # 2. Tool-claim validation
        # Needs the output text and at least one recorded tool call. It compares what the
        # agent SAYS a tool did with what the tool really did. First, each dict from the
        # caller is turned into a ToolCallRecord (a small typed record).
        if output_text and tool_calls:
            tool_records = [
                ToolCallRecord(
                    tool_name=tc.get("tool_name", ""),
                    tool_args=tc.get("tool_args"),
                    result_summary=tc.get("result_summary"),
                    result_count=tc.get("result_count"),
                    status=tc.get("status", "success"),
                )
                for tc in tool_calls
            ]
            result.tool_claim = evaluate_tool_claims(output_text, tool_records)

        # 3. Inter-agent disagreement check.
        #
        # Trace-wide when the caller supplies earlier agents, otherwise the
        # original immediate-upstream comparison. `result.disagreement` stays a
        # single DisagreementResult in both cases -- the worst contradicting
        # pair -- so risk aggregation, persistence and alerting keep reading
        # one `disagreement_score` and need no changes.
        # Path A (trace-wide): the caller gave us earlier agents. Compare this output with
        # each earlier output from a different agent (at most the last 12; off-topic ones
        # are skipped), using NLI (a model that says if two texts contradict).
        if prior_agent_outputs and output_text:
            trace_res = evaluate_against_prior_agents(
                current_agent_id=agent_id,
                current_output=output_text,
                prior_outputs=prior_agent_outputs,
            )
            # trace_res is None when no pair could be compared (for example every earlier
            # output comes from this same agent, or the NLI model is not loaded). Then no
            # disagreement is stored.
            # Some pairs contradict: keep the worst one. max() with key= picks the pair
            # with the highest disagreement_score.
            if trace_res and trace_res.flagged_pairs:
                result.disagreement = max(
                    trace_res.flagged_pairs, key=lambda r: r.disagreement_score
                )
            elif trace_res and trace_res.pairs_evaluated > trace_res.pairs_gated_low_relevance:
                # Nothing flagged: report the closest comparison made, so a
                # clean check is still recorded rather than looking like the
                # step was skipped entirely.
                # This result is not a real pair, so source_agent_id is the upstream
                # agent if one was given, otherwise the word "trace". The highest score of
                # the pairs that were really compared is stored as both
                # disagreement_score and contradiction_prob. When every pair was gated as
                # off-topic nothing was compared, so no 0.0 ("aligned") is stored for it.
                result.disagreement = DisagreementResult(
                    disagreement_score=trace_res.max_disagreement_score,
                    source_agent_id=upstream_agent_id or "trace",
                    target_agent_id=agent_id,
                    is_disagreement=False,
                    explanation=trace_res.explanation,
                    contradiction_prob=trace_res.max_disagreement_score,
                )
        # Path B (original): used when no list of earlier agents was given. Compare this
        # output only with the single upstream agent's output. evaluation_runner.py never
        # reaches this path: it passes an upstream only together with the list.
        elif upstream_output and output_text and upstream_agent_id:
            result.disagreement = evaluate_inter_agent_disagreement(
                source_agent_id=upstream_agent_id,
                source_output=upstream_output,
                target_agent_id=agent_id,
                target_output=output_text,
            )

        # 4. Drift analysis
        # Drift = this agent's outputs changing compared with its own past behaviour.
        # The embedding is a list of numbers standing for the meaning of the output (None
        # if there is no output text, the embedding model is not loaded, or it fails).
        embedding = get_embedding(output_text) if output_text else None
        # Any status other than "success" counts as an error for the error-rate signal.
        is_error = status != "success"

        # The grounding score is passed to the drift detector as this span's "risk". It
        # is used there for the quality-drift signal.
        grounding_risk = (
            result.grounding.grounding_score if result.grounding else None
        )

        # analyze() compares this span with the agent's stored baseline, updates that
        # baseline (unless it is frozen), and returns the drift numbers (including the ASI,
        # a 0-100 stability number). Only the FIRST tool call's name is used for the
        # tool-use signal.
        result.drift = self._drift.analyze(
            agent_id=agent_id,
            embedding=embedding,
            risk_score=grounding_risk,
            tool_name=tool_calls[0].get("tool_name") if tool_calls else None,
            is_error=is_error,
        )

        # 5. Risk aggregation
        # Merge the scores into one number, then turn that number into a text label.
        result.overall_risk_score = self._aggregate_risk(result)
        result.risk_label = self._classify_risk(result.overall_risk_score)

        # 6. Alert evaluation
        # Hand all the scores to the alert engine. It checks each alert rule against its
        # threshold, skips rules whose value is None, applies the per-agent cooldown and
        # an hourly cap, and returns the alerts that should be saved. Each
        # `x if result.y else None` below passes None when that check did not run.
        result.alerts = self._alerts.evaluate(
            trace_id=trace_id,
            span_id=span_id,
            agent_id=agent_id,
            risk_score=result.overall_risk_score,
            grounding_score=(
                result.grounding.grounding_score if result.grounding else None
            ),
            tool_claim_score=(
                result.tool_claim.tool_claim_score if result.tool_claim else None
            ),
            centroid_distance=(
                result.drift.centroid_distance if result.drift else None
            ),
            window_centroid_distance=(
                result.drift.window_centroid_distance if result.drift else None
            ),
            stability_index=(
                result.drift.stability_index if result.drift else None
            ),
            error_rate_delta=(
                result.drift.error_rate_delta if result.drift else None
            ),
            disagreement_score=(
                result.disagreement.disagreement_score if result.disagreement else None
            ),
        )

        return result

    def _aggregate_risk(self, result: EvaluationResult) -> Optional[float]:
        """Weighted ensemble of individual risk signals."""
        # Step 1: collect the scores that exist, with one weight each (two lists kept in
        # step). All three signals use the same scale: 0 = fine, 1 = bad. So they can be
        # averaged. A signal that did not run is simply left out.
        signals = []
        weights = []

        if result.grounding and result.grounding.grounding_score is not None:
            signals.append(result.grounding.grounding_score)
            weights.append(RISK_WEIGHTS["grounding"])

        # A tool-claim result with no claims scores 0.0 meaning "nothing was checked", not
        # "checked and clean", so it only counts once at least one claim was extracted.
        if result.tool_claim and result.tool_claim.total_claims > 0:
            signals.append(result.tool_claim.tool_claim_score)
            weights.append(RISK_WEIGHTS["tool_claim"])

        # Disagreement is not averaged in: it measured at chance (AUC 0.457 without the
        # planner) and its alert is withdrawn in alerting.py. The score is still stored
        # and shown, it just does not move the risk number.

        # Step 2: no signal at all means there is no risk score to give.
        if not signals:
            return None

        # Safety check against dividing by zero. With the current weights (all above 0)
        # and at least one signal, the total can not be 0.
        total_weight = sum(weights)
        if total_weight == 0:
            return None

        # Step 3: weighted average = (sum of score x weight) / (sum of the weights used),
        # rounded to 4 decimals. zip() pairs each score with its weight. Dividing by the
        # weights actually used means a missing signal does not drag the result toward 0.
        weighted_sum = sum(s * w for s, w in zip(signals, weights))
        return round(weighted_sum / total_weight, 4)

    def _classify_risk(self, score: Optional[float]) -> Optional[str]:
        """Turn a risk number into a label. No score gives None.

        Above 0.7 is "high_risk", above 0.4 is "medium_risk", anything else is
        "low_risk". A score of exactly 0.7 is therefore medium, and exactly 0.4 is low.
        The cut-off numbers are written directly in this code.
        """
        if score is None:
            return None
        if score > 0.7:
            return "high_risk"
        elif score > 0.4:
            return "medium_risk"
        return "low_risk"
