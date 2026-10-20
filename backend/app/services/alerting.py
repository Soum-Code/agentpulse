"""Alert engine with rule evaluation, deduplication, and cooldown.

Design:
- Rules are threshold-based (configurable)
- Deduplication prevents identical alerts within cooldown window
- Alert storm suppression limits total alerts per hour
- Webhook dispatch for external notifications (optional)
"""

# WHAT THIS FILE IS FOR
# It decides when to raise an alert. After a span is scored, AlertEngine.evaluate()
# takes the scores (risk, grounding, drift, stability and so on) and compares each one
# with a threshold. A score that crosses its threshold becomes a PendingAlert.
# Two limits stop alert floods: a cooldown (the same alert type for the same agent does
# not repeat for a while) and a cap on how many alerts may fire per hour.
# Note: dispatch_webhook() exists, but no code in backend/app calls it, so no webhook is
# sent today.
#
# HOW IT FITS IN
# evaluator.py calls AlertEngine.evaluate() once per span. evaluation_runner.py then
# saves every PendingAlert as an Alert row in the database. main.py and worker.py build
# the engine from the settings in config.py.

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# aiohttp = an async HTTP client; used here only to send the webhook request.
import aiohttp

logger = logging.getLogger("agentpulse.alerting")


# One rule says: "raise an alert of this type when <metric> is above/below <threshold>".
# comparison picks the test: "gt" is >, "lt" is <, "gte" is >=, "lte" is <=.
# cooldown_seconds: how long the same alert type stays quiet for the same agent.
@dataclass
class AlertRule:
    """A single alert rule definition."""

    alert_type: str
    severity: str
    # Name of the metric to test. It must be a key of the `metrics` dict in evaluate().
    condition_field: str
    threshold: float
    comparison: str = "gt"  # "gt", "lt", "gte", "lte"
    # Text for the alert. It may use the names {value}, {threshold} and {agent_id}.
    message_template: str = ""
    enabled: bool = True
    cooldown_seconds: int = 900


# An alert that has fired but is not saved yet. evaluation_runner.py copies each one
# into an Alert row. `details` holds the numbers behind it, saved there as JSON.
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


# Holds the rule list plus the memory needed for the cooldown and the hourly cap.
class AlertEngine:
    """Evaluates alert rules against evaluation and drift results."""

    # hallucination_threshold: used by two rules (overall risk and grounding score).
    # drift_threshold: for the window-drift rule. asi_low_threshold: ASI_DROP fires below it.
    # max_per_hour: most alerts allowed per hour. webhook_url: where dispatch_webhook posts.
    # cooldown_seconds: stored in self._cooldown_seconds but never read. Each rule uses its
    # own cooldown_seconds (900), so changing this argument has no effect today.
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
        # _last_fired: when each alert last fired, keyed "<alert_type>:<agent id>".
        # _hourly_count and _hour_start: how many alerts fired since the current hour began.
        # All of this lives in this process's memory only, so a restart clears it.
        self._last_fired: dict[str, float] = {}  # (type+agent) → timestamp
        self._hourly_count: int = 0
        self._hour_start: float = time.time()

    # Main entry point. In: the span's ids and its scores. A score is None when it was not
    # computed for this span. Out: the alerts that passed the cooldown and the hourly cap.
    def evaluate(
        self,
        trace_id: str | None = None,
        span_id: str | None = None,
        agent_id: str | None = None,
        risk_score: float | None = None,
        grounding_score: float | None = None,
        tool_claim_score: float | None = None,
        centroid_distance: float | None = None,
        window_centroid_distance: float | None = None,
        stability_index: float | None = None,
        error_rate_delta: float | None = None,
        disagreement_score: float | None = None,
    ) -> list[PendingAlert]:
        """Evaluate all rules against provided metrics.
        
        Returns list of alerts that should be fired (after dedup/cooldown).
        """
        # Step 1: if more than an hour has passed since the count began, start it again at 0.
        self._reset_hourly_counter()

        # Step 2: storm suppression. If this hour's cap is already reached, return nothing.
        # The cap is checked once per call, so one call can still go a little past it.
        if self._hourly_count >= self._max_per_hour:
            logger.warning("Alert storm suppression active: %d alerts this hour", self._hourly_count)
            return []

        # Step 3: gather every score in one dict. A rule finds its score by the name stored
        # in its condition_field.
        metrics = {
            "risk_score": risk_score,
            "grounding_score": grounding_score,
            "tool_claim_score": tool_claim_score,
            "centroid_distance": centroid_distance,
            "window_centroid_distance": window_centroid_distance,
            "stability_index": stability_index,
            "error_rate_delta": error_rate_delta,
            "disagreement_score": disagreement_score,
        }

        # Step 4: test every rule. A rule is skipped when it is switched off, or when its
        # score is None (not computed for this span; None is never treated as zero).
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

            # Step 5: cooldown. The key is the alert type plus the agent id ("global" when
            # there is none), so one agent's alert does not silence another agent's.
            # Deduplication check
            dedup_key = f"{rule.alert_type}:{agent_id or 'global'}"
            if self._is_in_cooldown(dedup_key, rule.cooldown_seconds):
                continue

            # Step 6: build the alert. The message fills in the rule's template. `details`
            # holds the score that tripped the rule and every score that was available,
            # rounded to 4 decimal places.
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
            # Remember when it fired (this starts the cooldown) and count it for the cap.
            self._last_fired[dedup_key] = time.time()
            self._hourly_count += 1

        return alerts

    # Sends one alert as JSON to webhook_url. Returns True if the server answered with an
    # HTTP status below 300, otherwise False. Returns False at once when no URL is set.
    # Nothing in backend/app calls this method today.
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

            # A new HTTP session for each alert. The whole request may take at most 5 seconds
            # (ClientTimeout total=5).
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

        # Any error (network down, timeout, bad URL) is caught here. It is logged and
        # returned as False, so the caller gets False instead of an exception.
        except Exception as exc:
            logger.error("Webhook dispatch error: %s", exc)
            return False

    # Compares one score with a rule's threshold. "gt" means value > threshold, "lt" is <,
    # "gte" is >=, "lte" is <=. Any other word returns False, so that rule never fires.
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

    # True if this key fired less than `cooldown` seconds ago. A key that never fired is
    # not in cooldown.
    def _is_in_cooldown(self, key: str, cooldown: int) -> bool:
        last = self._last_fired.get(key)
        if last is None:
            return False
        return (time.time() - last) < cooldown

    # The hourly count is a fixed block of time, not a sliding window. Once more than
    # 3600 seconds have passed since _hour_start, the count goes back to 0 and a new
    # block starts. This is only checked when evaluate() runs.
    def _reset_hourly_counter(self) -> None:
        now = time.time()
        if now - self._hour_start > 3600:
            self._hourly_count = 0
            self._hour_start = now

    # Builds the fixed list of rules. Six are active. Their thresholds come from the
    # constructor, except TOOL_CLAIM_MISMATCH (0.3) and ERROR_RATE_SPIKE (0.2), which are
    # written directly in the rules below. Called once, from __init__.
    def _build_default_rules(
        self,
        hallucination_threshold: float,
        drift_threshold: float,
        asi_low: float,
    ) -> list[AlertRule]:
        return [
            # Overall risk (a weighted mix of the separate scores) is above the threshold.
            AlertRule(
                alert_type="HIGH_HALLUCINATION_RISK",
                severity="HIGH",
                condition_field="risk_score",
                threshold=hallucination_threshold,
                comparison="gt",
                message_template="High hallucination risk detected for agent '{agent_id}': risk={value} (threshold={threshold})",
            ),
            # The grounding score alone (0 = safe, 1 = risky) is above the same threshold.
            AlertRule(
                alert_type="GROUNDING_FAILURE",
                severity="HIGH",
                condition_field="grounding_score",
                threshold=hallucination_threshold,
                comparison="gt",
                message_template="Grounding failure for agent '{agent_id}': grounding_risk={value} (threshold={threshold})",
            ),
            # The tool-claim score is above 0.3. The score is the share of the agent's tool
            # claims that did not match the tool records (0 = all matched, 1 = none did).
            AlertRule(
                alert_type="TOOL_CLAIM_MISMATCH",
                severity="HIGH",
                condition_field="tool_claim_score",
                threshold=0.3,
                comparison="gt",
                message_template="Tool-claim mismatch for agent '{agent_id}': mismatch_rate={value} (threshold={threshold})",
            ),
            # In short: this rule uses the gap between the baseline average and the recent
            # average of the agent's output embeddings, not the distance of one output.
            # Fires on `window_centroid_distance`, not `centroid_distance`.
            #
            # `centroid_distance` compares a single output against an EMA
            # centroid, which on 500 real agent sessions flagged 91.7% of
            # UNCHANGED operation at this same threshold -- a multi-step agent
            # legitimately says something different at every step, so the rule
            # was close to always firing. The windowed-mean field compares
            # pooled baseline against pooled recent behaviour: measured once on
            # a held-out split, 1.5% false alarms and 92% detection at this
            # threshold, AUC 0.991.
            #
            # The threshold is unchanged -- it was never the problem.
            #
            # `window_centroid_distance` is None until both windows fill, and a
            # None metric skips the rule, so the detector stays silent rather
            # than guessing on short traces. That is deliberate: it means no
            # alert on roughly 75% of sessions in the corpus measured.
            # See DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md section 11.
            AlertRule(
                alert_type="DRIFT_DETECTED",
                severity="MEDIUM",
                condition_field="window_centroid_distance",
                threshold=drift_threshold,
                comparison="gt",
                message_template="Drift detected for agent '{agent_id}': distance={value} (threshold={threshold})",
            ),
            # The stability index (ASI, 0 to 100) falls BELOW the threshold ("lt" = less than).
            AlertRule(
                alert_type="ASI_DROP",
                severity="MEDIUM",
                condition_field="stability_index",
                threshold=asi_low,
                comparison="lt",
                message_template="Agent stability dropped for '{agent_id}': ASI={value} (threshold={threshold})",
            ),
            # The error rate of the newer half of the recent spans minus that of the older half
            # is above 0.2 (see _update_error_drift in drift.py).
            AlertRule(
                alert_type="ERROR_RATE_SPIKE",
                severity="HIGH",
                condition_field="error_rate_delta",
                threshold=0.2,
                comparison="gt",
                message_template="Error rate spike for agent '{agent_id}': delta={value} (threshold={threshold})",
            ),
            # In short: no active rule uses disagreement_score. The AlertRule shown in the
            # comment below is switched off (it is only text).
            # `disagreement_score` was already being passed into evaluate()'s
            # metrics dict but no rule referenced it, so a cross-agent
            # contradiction could never raise an alert on its own. It also
            # cannot reach an operator through HIGH_HALLUCINATION_RISK:
            # disagreement carries weight 0.20 in the composite against
            # grounding's 0.40, so a near-certain contradiction alongside a
            # clean grounding score aggregates to ~0.33 — under both the 0.4
            # medium-risk band and that rule's 0.7 threshold. Observed on a real
            # trace: a 0.9999 disagreement produced label="low_risk", no alert.
            #
            # The threshold matches the disagreement engine's own flagging
            # threshold (disagreement.py's default 0.6), so this alerts exactly
            # when the engine says a disagreement occurred, rather than
            # introducing a second, independently-drifting cutoff.
            #
            # WITHDRAWN 2026-09-20. The rule above is kept as a comment rather
            # than deleted, because the reasoning that motivated it is still
            # correct: without it a cross-agent contradiction cannot reach an
            # operator at all. What changed is that the signal it fires on does
            # not carry the information the alert claims.
            #
            #     AlertRule(
            #         alert_type="AGENT_DISAGREEMENT",
            #         severity="HIGH",
            #         condition_field="disagreement_score",
            #         threshold=0.6,
            #         comparison="gt",
            #         message_template=(
            #             "Agents disagree within trace for '{agent_id}': "
            #             "contradiction={value} (threshold={threshold})"
            #         ),
            #     ),
            #
            # Measured in SESSION_HANDOFF.md 24.9.4-24.9.5. The score's apparent
            # discriminative power came from comparing the planner agent's
            # output -- a list of sub-questions -- against a later agent's
            # statement. A question has no truth value, so that NLI comparison
            # is ill-posed and returns arbitrary values: paraphrases of one
            # statement, meaning preserved, spread 0.948-0.984, and 10 of 34
            # landed on the opposite side of this 0.6 threshold from their
            # anchor.
            #
            # Excluding the planner removes the instability completely (spreads
            # fall to 0.001-0.005) and takes the signal with it: AUC for
            # refusal-vs-acceptance falls from 0.980 to 0.457, which is chance.
            # That is also the mechanism behind Section 14, where disagreement
            # detected 0 of 10 independently labelled contradictions on real
            # traces and no cause was found at the time.
            #
            # `disagreement_score` is still computed, persisted and shown --
            # only the alert is withdrawn. Restoring this rule requires a
            # comparison that runs between spans asserting something about the
            # same proposition, which is a different feature from the one that
            # exists, and re-measuring the AUC on that version first.
        ]
