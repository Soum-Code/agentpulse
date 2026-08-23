"""Alert engine with rule evaluation, deduplication, and cooldown.

Design:
- Rules are threshold-based (configurable)
- Deduplication prevents identical alerts within cooldown window
- Alert storm suppression limits total alerts per hour
- Webhook dispatch for external notifications (optional)
"""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import aiohttp

logger = logging.getLogger("agentpulse.alerting")


@dataclass
class AlertRule:
    """A single alert rule definition."""

    alert_type: str
    severity: str
    condition_field: str
    threshold: float
    comparison: str = "gt"  # "gt", "lt", "gte", "lte"
    message_template: str = ""
    enabled: bool = True
    cooldown_seconds: int = 900


@dataclass
class PendingAlert:
    """An alert that has been triggered and is ready for persistence."""

    alert_type: str
    severity: str
    message: str
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    agent_id: Optional[str] = None
    details: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AlertEngine:
    """Evaluates alert rules against evaluation and drift results."""

    def __init__(
        self,
        hallucination_threshold: float = 0.7,
        drift_threshold: float = 0.3,
        asi_low_threshold: float = 50.0,
        cooldown_seconds: int = 900,
        max_per_hour: int = 50,
        webhook_url: str = "",
    ) -> None:
        self._rules = self._build_default_rules(
            hallucination_threshold,
            drift_threshold,
            asi_low_threshold,
        )
        self._cooldown_seconds = cooldown_seconds
        self._max_per_hour = max_per_hour
        self._webhook_url = webhook_url

        # Deduplication state
        self._last_fired: dict[str, float] = {}  # (type+agent) → timestamp
        self._hourly_count: int = 0
        self._hour_start: float = time.time()

    def evaluate(
        self,
        trace_id: str | None = None,
        span_id: str | None = None,
        agent_id: str | None = None,
        risk_score: float | None = None,
        grounding_score: float | None = None,
        tool_claim_score: float | None = None,
        centroid_distance: float | None = None,
        stability_index: float | None = None,
        error_rate_delta: float | None = None,
        disagreement_score: float | None = None,
    ) -> list[PendingAlert]:
        """Evaluate all rules against provided metrics.
        
        Returns list of alerts that should be fired (after dedup/cooldown).
        """
        self._reset_hourly_counter()

        if self._hourly_count >= self._max_per_hour:
            logger.warning("Alert storm suppression active: %d alerts this hour", self._hourly_count)
            return []

        metrics = {
            "risk_score": risk_score,
            "grounding_score": grounding_score,
            "tool_claim_score": tool_claim_score,
            "centroid_distance": centroid_distance,
            "stability_index": stability_index,
            "error_rate_delta": error_rate_delta,
            "disagreement_score": disagreement_score,
        }

        alerts = []
        for rule in self._rules:
            if not rule.enabled:
                continue

            value = metrics.get(rule.condition_field)
            if value is None:
                continue

            triggered = self._check_threshold(value, rule.threshold, rule.comparison)
            if not triggered:
                continue

            # Deduplication check
            dedup_key = f"{rule.alert_type}:{agent_id or 'global'}"
            if self._is_in_cooldown(dedup_key, rule.cooldown_seconds):
                continue

            alert = PendingAlert(
                alert_type=rule.alert_type,
                severity=rule.severity,
                message=rule.message_template.format(
                    value=round(value, 3),
                    threshold=rule.threshold,
                    agent_id=agent_id or "unknown",
                ),
                trace_id=trace_id,
                span_id=span_id,
                agent_id=agent_id,
                details={
                    "condition_field": rule.condition_field,
                    "value": round(value, 4),
                    "threshold": rule.threshold,
                    **{k: round(v, 4) for k, v in metrics.items() if v is not None},
                },
            )
            alerts.append(alert)
            self._last_fired[dedup_key] = time.time()
            self._hourly_count += 1

        return alerts

    async def dispatch_webhook(self, alert: PendingAlert) -> bool:
        """Send alert to configured webhook URL."""
        if not self._webhook_url:
            return False

        try:
            payload = {
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "message": alert.message,
                "agent_id": alert.agent_id,
                "trace_id": alert.trace_id,
                "details": alert.details,
                "timestamp": alert.created_at.isoformat(),
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self._webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status < 300:
                        return True
                    logger.warning("Webhook failed: HTTP %d", resp.status)
                    return False

        except Exception as exc:
            logger.error("Webhook dispatch error: %s", exc)
            return False

    def _check_threshold(
        self, value: float, threshold: float, comparison: str,
    ) -> bool:
        if comparison == "gt":
            return value > threshold
        elif comparison == "lt":
            return value < threshold
        elif comparison == "gte":
            return value >= threshold
        elif comparison == "lte":
            return value <= threshold
        return False

    def _is_in_cooldown(self, key: str, cooldown: int) -> bool:
        last = self._last_fired.get(key)
        if last is None:
            return False
        return (time.time() - last) < cooldown

    def _reset_hourly_counter(self) -> None:
        now = time.time()
        if now - self._hour_start > 3600:
            self._hourly_count = 0
            self._hour_start = now

    def _build_default_rules(
        self,
        hallucination_threshold: float,
        drift_threshold: float,
        asi_low: float,
    ) -> list[AlertRule]:
        return [
            AlertRule(
                alert_type="HIGH_HALLUCINATION_RISK",
                severity="HIGH",
                condition_field="risk_score",
                threshold=hallucination_threshold,
                comparison="gt",
                message_template="High hallucination risk detected for agent '{agent_id}': risk={value} (threshold={threshold})",
            ),
            AlertRule(
                alert_type="GROUNDING_FAILURE",
                severity="HIGH",
                condition_field="grounding_score",
                threshold=hallucination_threshold,
                comparison="gt",
                message_template="Grounding failure for agent '{agent_id}': grounding_risk={value} (threshold={threshold})",
            ),
            AlertRule(
                alert_type="TOOL_CLAIM_MISMATCH",
                severity="HIGH",
                condition_field="tool_claim_score",
                threshold=0.3,
                comparison="gt",
                message_template="Tool-claim mismatch for agent '{agent_id}': mismatch_rate={value} (threshold={threshold})",
            ),
            AlertRule(
                alert_type="DRIFT_DETECTED",
                severity="MEDIUM",
                condition_field="centroid_distance",
                threshold=drift_threshold,
                comparison="gt",
                message_template="Drift detected for agent '{agent_id}': distance={value} (threshold={threshold})",
            ),
            AlertRule(
                alert_type="ASI_DROP",
                severity="MEDIUM",
                condition_field="stability_index",
                threshold=asi_low,
                comparison="lt",
                message_template="Agent stability dropped for '{agent_id}': ASI={value} (threshold={threshold})",
            ),
            AlertRule(
                alert_type="ERROR_RATE_SPIKE",
                severity="HIGH",
                condition_field="error_rate_delta",
                threshold=0.2,
                comparison="gt",
                message_template="Error rate spike for agent '{agent_id}': delta={value} (threshold={threshold})",
            ),
        ]
