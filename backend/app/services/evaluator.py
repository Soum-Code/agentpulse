"""Orchestrates the full evaluation pipeline for a span.

Coordinates: grounding → tool-claim → disagreement → drift → risk aggregation → alerts.
"""

from __future__ import annotations

import json
import logging
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


@dataclass
class EvaluationResult:
    """Complete evaluation result for a single span."""

    # Individual signals
    grounding: Optional[GroundingResult] = None
    tool_claim: Optional[ToolClaimResult] = None
    disagreement: Optional[DisagreementResult] = None
    drift: Optional[DriftResult] = None

    # Composite risk score
    overall_risk_score: Optional[float] = None
    risk_label: Optional[str] = None  # "low_risk", "medium_risk", "high_risk"

    # Evaluation Metadata
    evaluator_name: str = "deberta_minilm_cascade"
    model_name: str = "cross-encoder/nli-deberta-v3-small"
    model_version: str = "v1.0"
    config_version: str = "v1.0"
    threshold_version: str = "v1.0"

    # Triggered alerts
    alerts: list[PendingAlert] = field(default_factory=list)


# Calibrated prototype weights for composite risk
RISK_WEIGHTS = {
    "grounding": 0.40,
    "tool_claim": 0.25,
    "disagreement": 0.20,
    "semantic": 0.15,
}


class EvaluationPipeline:
    """Orchestrates all evaluation steps for incoming spans."""

    def __init__(
        self,
        drift_detector: DriftDetector,
        alert_engine: AlertEngine,
    ) -> None:
        self._drift = drift_detector
        self._alerts = alert_engine

    @property
    def drift_detector(self) -> DriftDetector:
        return self._drift

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
        result = EvaluationResult()

        # 1. Grounding check
        if input_text and output_text:
            result.grounding = evaluate_grounding(input_text, output_text)

        # 2. Tool-claim validation
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
        if prior_agent_outputs and output_text:
            trace_res = evaluate_against_prior_agents(
                current_agent_id=agent_id,
                current_output=output_text,
                prior_outputs=prior_agent_outputs,
            )
            if trace_res and trace_res.flagged_pairs:
                result.disagreement = max(
                    trace_res.flagged_pairs, key=lambda r: r.disagreement_score
                )
            elif trace_res:
                # Nothing flagged: report the closest comparison made, so a
                # clean check is still recorded rather than looking like the
                # step was skipped entirely.
                result.disagreement = DisagreementResult(
                    disagreement_score=trace_res.max_disagreement_score,
                    source_agent_id=upstream_agent_id or "trace",
                    target_agent_id=agent_id,
                    is_disagreement=False,
                    explanation=trace_res.explanation,
                    contradiction_prob=trace_res.max_disagreement_score,
                )
        elif upstream_output and output_text and upstream_agent_id:
            result.disagreement = evaluate_inter_agent_disagreement(
                source_agent_id=upstream_agent_id,
                source_output=upstream_output,
                target_agent_id=agent_id,
                target_output=output_text,
            )

        # 4. Drift analysis
        embedding = get_embedding(output_text) if output_text else None
        is_error = status != "success"

        grounding_risk = (
            result.grounding.grounding_score if result.grounding else None
        )

        result.drift = self._drift.analyze(
            agent_id=agent_id,
            embedding=embedding,
            risk_score=grounding_risk,
            tool_name=tool_calls[0].get("tool_name") if tool_calls else None,
            is_error=is_error,
        )

        # 5. Risk aggregation
        result.overall_risk_score = self._aggregate_risk(result)
        result.risk_label = self._classify_risk(result.overall_risk_score)

        # 6. Alert evaluation
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
        signals = []
        weights = []

        if result.grounding and result.grounding.grounding_score is not None:
            signals.append(result.grounding.grounding_score)
            weights.append(RISK_WEIGHTS["grounding"])

        if result.tool_claim and result.tool_claim.tool_claim_score is not None:
            signals.append(result.tool_claim.tool_claim_score)
            weights.append(RISK_WEIGHTS["tool_claim"])

        if result.disagreement and result.disagreement.disagreement_score is not None:
            signals.append(result.disagreement.disagreement_score)
            weights.append(RISK_WEIGHTS["disagreement"])

        if not signals:
            return None

        total_weight = sum(weights)
        if total_weight == 0:
            return None

        weighted_sum = sum(s * w for s, w in zip(signals, weights))
        return round(weighted_sum / total_weight, 4)

    def _classify_risk(self, score: Optional[float]) -> Optional[str]:
        if score is None:
            return None
        if score > 0.7:
            return "high_risk"
        elif score > 0.4:
            return "medium_risk"
        return "low_risk"
