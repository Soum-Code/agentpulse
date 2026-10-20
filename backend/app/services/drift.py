"""Drift detection engine with Agent Stability Index (ASI) & Baseline Policy Management.

Tracks multiple drift signals:
1. Output semantic drift (embedding centroid distance)
2. Tool-use drift (distribution entropy)
3. Quality drift (risk score trend)
4. Error rate drift

ASI is a composite monitoring indicator ∈ [0, 100].
ASI is NOT a scientifically validated ground-truth metric — it's an operational signal.

Baseline management policies:
- Minimum sample count / cold-start protection (default: 20 samples before alerts)
- Baseline freeze option: lock centroid to prevent degraded drift from contaminating baseline
- Baseline reset mechanism: wipe and recalibrate baseline on demand
- Baseline versioning & configuration tracking
"""

# WHAT THIS FILE IS FOR
# For each agent it remembers how the agent's outputs have looked so far, and says how much
# the newest span differs from that history (this is "drift"). An embedding is a list of
# numbers that stands for the meaning of a text. The file tracks these signals:
#   centroid_distance         how far one output is from the agent's running average
#   window_centroid_distance  how far the average of the latest outputs is from the average
#                             of the first outputs; the DRIFT_DETECTED alert reads this one
#   quality_drift             did the risk score rise over time
#   tool_drift                how evenly the agent's tool calls are spread over its tools
#   error_rate_delta          did the share of failed spans rise
# From some of these it builds the ASI (Agent Stability Index), a 0 to 100 number.
# Everything is kept in memory, per agent. Saving to the database is done elsewhere.
#
# HOW IT FITS IN
# evaluator.py calls DriftDetector.analyze() once per span. main.py and worker.py create the
# detector and load saved baselines into it; evaluation_runner.py saves them back with the
# serialize_* methods. alerting.py compares the numbers with its thresholds; evaluator.py
# passes them across.

from __future__ import annotations

import logging
# threading.Lock lets only one thread at a time change the shared per-agent data.
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# numpy = fast maths on arrays of numbers; here it holds the embedding vectors.
import numpy as np

logger = logging.getLogger("agentpulse.drift")


# What analyze() returns for one span. A signal is None when it could not be computed (for
# example no embedding was given). baseline_size is how many spans of this agent were seen
# before this one. is_bootstrapping is True while that count is below min_samples_for_alert;
# it is only a flag, nothing in backend/app uses it to hold back an alert.
@dataclass
class DriftResult:
    """Result of drift analysis for a single span."""

    # Cosine distance between this output's embedding and the agent's running-average
    # centroid. 0.0 for the agent's very first output. Range 0 to 2 (see
    # _update_embedding_drift).
    centroid_distance: Optional[float] = None
    # In plain words: the distance between the average of the agent's first outputs and the
    # average of its latest outputs. It is None until both averages are ready. With the
    # default settings (20 first, 12 latest) the first value appears on the 32nd embedding.
    # Distance between the baseline window mean and the current window mean.
    #
    # `centroid_distance` above compares ONE output against an EMA centroid,
    # which measures a multi-step agent's normal step-to-step variety far more
    # than it measures drift: on 500 real agent sessions it flagged 91.7% of
    # unchanged operation at the 0.30 threshold. Comparing window means instead
    # averages that variety out -- same threshold, same embedding, 6.8% false
    # alarms and AUC 0.9532 against real content change.
    # See DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md sections 6 and 10.
    #
    # The two are kept side by side because they detect different things.
    # Pooling deliberately absorbs a single sharp output -- one embedding in the
    # opposite direction scores 2.0 here and ~0.0 under the window mean -- so
    # `centroid_distance` remains the spike signal and this is the sustained
    # shift signal. Neither replaces the other.
    window_centroid_distance: Optional[float] = None
    # Spread of the agent's tool calls over its tools: 0 = one tool only, 1 = all used equally.
    # It is not compared with an earlier period. 0.0 until 10 tool calls were counted.
    tool_drift: Optional[float] = None
    # How far the newer half of the recent risk scores has risen above the older half
    # (never below 0). The evaluator passes the grounding score as the "risk score".
    quality_drift: Optional[float] = None
    # Same idea for errors: share of failed spans in the newer half minus the older half.
    error_rate_delta: Optional[float] = None
    # The ASI: see _compute_asi for how it is built.
    stability_index: Optional[float] = None  # ASI ∈ [0, 100]
    baseline_size: int = 0
    is_bootstrapping: bool = False
    is_frozen: bool = False
    baseline_version: int = 1
    details: str = ""


# One detector object watches ALL agents. The data for each agent sits in dicts that are
# keyed by the agent id.
class DriftDetector:
    """Per-agent drift detection with controlled baseline management policies."""

    # window_size: how many recent risk scores and error flags to keep per agent.
    # min_samples_for_alert: how many spans count as "cold start", and how many embeddings
    #   make up the baseline average.
    # drift_threshold: stored, but not read anywhere in this file (alerting.py has its own).
    # ema_alpha: how far the running-average centroid moves toward each new output
    #   (0.05 = 5%). EMA = exponential moving average: newer values weigh more.
    # mean_window: how many of the latest outputs make up the "current" average.
    def __init__(
        self,
        window_size: int = 100,
        min_samples_for_alert: int = 20,
        drift_threshold: float = 0.3,
        ema_alpha: float = 0.05,
        # Selected on the development split of an external real-trace corpus
        # and validated once on held-out: false alarms 1.5%, detection 92%,
        # AUC 0.991 at the shipped 0.30 threshold. The threshold itself was
        # not tuned. See experiments/drift_production_validation.py and
        # DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md section 11.
        mean_window: int = 12,
    ) -> None:
        self._window_size = window_size
        self._min_samples_for_alert = min_samples_for_alert
        self._drift_threshold = drift_threshold
        self._ema_alpha = ema_alpha

        # Size of the current window for the windowed-mean comparison. Kept
        # separate from `min_samples_for_alert`: that governs how much history
        # the BASELINE needs, this governs how many recent outputs define
        # CURRENT behaviour, and tying them together starves short traces (at
        # 20 only 37 of 500 real sessions ever accumulated a full window).
        self._mean_window = mean_window

        # Per-agent state
        # Every dict below is keyed by agent id (_frozen_agents is a set of agent ids).
        # _centroids: the EMA centroid. _sample_counts: spans seen so far (every span counts,
        # also one with no embedding). _risk_history and _error_counts: the newest risk
        # scores and error flags, newest last. _tool_distributions: how many times each tool
        # name was used. _frozen_agents: agents whose baseline is locked.
        # _baseline_versions: starts at 1 and goes up by 1 on every reset.
        self._centroids: dict[str, np.ndarray] = {}
        # Baseline window: running sum + count over the bootstrap period, then
        # frozen. Kept as a sum so the mean is exact rather than EMA-weighted.
        self._baseline_sums: dict[str, np.ndarray] = {}
        self._baseline_counts: dict[str, int] = {}
        # Rolling window of the most recent embeddings, for the current mean.
        self._recent_embeddings: dict[str, list[np.ndarray]] = {}
        self._sample_counts: dict[str, int] = {}
        self._risk_history: dict[str, list[float]] = {}
        self._tool_distributions: dict[str, dict[str, int]] = {}
        self._error_counts: dict[str, list[bool]] = {}
        self._frozen_agents: set[str] = set()
        self._baseline_versions: dict[str, int] = {}

        # Guards all read-modify-write access to the per-agent state above.
        # `analyze()` now runs on a thread-pool worker (see ingest.py), so
        # two spans for the same agent_id can race on the same dicts/arrays.
        # Today the thread pool is in worker.py, reached through run_in_executor in
        # evaluation_runner.execute_job. Its pool has one thread and the worker runs one job
        # at a time, so analyze() calls do not overlap today. The lock matters if that changes.
        self._lock = threading.Lock()

    # Frozen means the centroid stops moving and the baseline average stops growing; the
    # recent-outputs window still updates. Returns False if the agent has no centroid yet.
    # No code in backend/app calls this today.
    def freeze_baseline(self, agent_id: str) -> bool:
        """Freeze baseline centroid for an agent to prevent contamination."""
        with self._lock:
            if agent_id in self._centroids:
                self._frozen_agents.add(agent_id)
                logger.info("Baseline frozen for agent: %s", agent_id)
                return True
            return False

    # Always returns True, even if the agent was not frozen. Not called in backend/app.
    def unfreeze_baseline(self, agent_id: str) -> bool:
        """Unfreeze baseline centroid for an agent."""
        with self._lock:
            self._frozen_agents.discard(agent_id)
            logger.info("Baseline unfrozen for agent: %s", agent_id)
            return True

    # Takes the lock, then wipes the agent's memory with the helper below. Not called in
    # backend/app.
    def reset_baseline(self, agent_id: str) -> None:
        """Reset baseline calibration for an agent."""
        with self._lock:
            self._reset_baseline_locked(agent_id)

    # Forgets everything stored for this agent, sets its span count back to 0 (so it starts
    # a new cold start), unfreezes it and raises its baseline version by 1. "_locked" in the
    # name means the CALLER must already hold self._lock; this method does not take it.
    def _reset_baseline_locked(self, agent_id: str) -> None:
        self._centroids.pop(agent_id, None)
        self._baseline_sums.pop(agent_id, None)
        self._baseline_counts.pop(agent_id, None)
        self._recent_embeddings.pop(agent_id, None)
        self._sample_counts[agent_id] = 0
        self._risk_history.pop(agent_id, None)
        self._tool_distributions.pop(agent_id, None)
        self._error_counts.pop(agent_id, None)
        self._frozen_agents.discard(agent_id)
        self._baseline_versions[agent_id] = self._baseline_versions.get(agent_id, 1) + 1
        logger.info("Baseline reset for agent: %s (v%d)", agent_id, self._baseline_versions[agent_id])

    # In: the agent id, plus what is known about this span: the output's embedding (or None),
    # a risk score (the evaluator passes the grounding score), the name of the first tool
    # called, and whether the span failed. Out: a DriftResult. It also updates the agent's
    # memory, so calling it twice for the same span counts that span twice.
    def analyze(
        self,
        agent_id: str,
        embedding: np.ndarray | None = None,
        risk_score: float | None = None,
        tool_name: str | None = None,
        is_error: bool = False,
    ) -> DriftResult:
        """Analyze drift for a single span against the agent's baseline.

        Holds `self._lock` for the full call: this may run concurrently for
        the same agent_id on different thread-pool workers, and the sample
        count / centroid / histories must be read and updated atomically
        relative to each other, not just individually.
        """
        with self._lock:
            # Read the agent's state BEFORE this span is added. `count` = spans seen so far.
            count = self._sample_counts.get(agent_id, 0)
            is_bootstrapping = count < self._min_samples_for_alert
            is_frozen = agent_id in self._frozen_agents
            version = self._baseline_versions.get(agent_id, 1)

            result = DriftResult(
                baseline_size=count,
                is_bootstrapping=is_bootstrapping,
                is_frozen=is_frozen,
                baseline_version=version,
            )

            # 1. Embedding drift
            # Two signals come from the same embedding: its distance from the running-average
            # centroid, and the distance between the baseline average and the recent average.
            if embedding is not None:
                result.centroid_distance = self._update_embedding_drift(
                    agent_id, embedding, is_frozen=is_frozen
                )
                result.window_centroid_distance = self._update_window_drift(
                    agent_id, embedding, is_frozen=is_frozen
                )

            # 2. Quality drift
            if risk_score is not None:
                result.quality_drift = self._update_quality_drift(
                    agent_id, risk_score,
                )

            # 3. Tool-use drift
            if tool_name:
                result.tool_drift = self._update_tool_drift(agent_id, tool_name)

            # 4. Error rate drift
            result.error_rate_delta = self._update_error_drift(agent_id, is_error)

            # error_rate_delta is always a number here, so the ASI below always has at least
            # one signal to work with.
            # 5. Compute ASI
            # (It uses centroid_distance, quality_drift, tool_drift and error_rate_delta, but
            # not window_centroid_distance.)
            result.stability_index = self._compute_asi(result)

            # Update sample count
            # (Every span counts, also one without an embedding.)
            self._sample_counts[agent_id] = count + 1

            # A readable note is set only while bootstrapping or frozen; otherwise `details`
            # stays empty.
            if is_bootstrapping:
                result.details = (
                    f"Cold-start calibration: {count + 1}/{self._min_samples_for_alert} samples. "
                    "Baseline establishing."
                )
            elif is_frozen:
                result.details = f"Baseline frozen at v{version}. Centroid updates locked."

        return result

    def _update_embedding_drift(
        self,
        agent_id: str,
        embedding: np.ndarray,
        is_frozen: bool = False,
    ) -> float:
        """Update centroid and compute distance to it."""
        embedding = embedding.flatten()

        # The agent's first output becomes its centroid, and its distance is 0.0.
        if agent_id not in self._centroids:
            self._centroids[agent_id] = embedding.copy()
            return 0.0

        centroid = self._centroids[agent_id]

        # Cosine distance
        # Cosine similarity = dot product divided by the two vector lengths. It is 1 when the
        # vectors point the same way, 0 when unrelated, -1 when opposite. Distance = 1 minus
        # similarity, so it runs from 0 (same) to 2 (opposite). np.clip forces the similarity
        # into -1..1, so rounding errors cannot push the distance below 0 or above 2.
        dot = np.dot(embedding, centroid)
        norm_e = np.linalg.norm(embedding)
        norm_c = np.linalg.norm(centroid)

        # A vector of length 0 has no direction, so the distance is set to 1.0 ("unrelated").
        if norm_e == 0 or norm_c == 0:
            distance = 1.0
        else:
            similarity = dot / (norm_e * norm_c)
            distance = 1.0 - float(np.clip(similarity, -1.0, 1.0))

        # Update centroid with EMA only if not frozen
        # New centroid = (1 - ema_alpha) * old centroid + ema_alpha * this output. The distance
        # above was measured against the OLD centroid, before this update.
        if not is_frozen:
            self._centroids[agent_id] = (
                (1 - self._ema_alpha) * centroid + self._ema_alpha * embedding
            )

        return round(distance, 6)

    def _update_window_drift(
        self,
        agent_id: str,
        embedding: np.ndarray,
        is_frozen: bool = False,
    ) -> float | None:
        """Distance between the baseline window mean and the current window mean.

        Both sides are plain means, not EMA-weighted, matching the
        `pooled_session` construction validated in
        DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md section 10.

        Returns None until BOTH pools are ready. Two conditions, each of which
        was a measured bug before it was added:

        1. The baseline window must be full. Reporting 0.0 while it fills is
           indistinguishable from a genuine no-drift measurement.
        2. The current window must be full. A "mean" over one or two samples is
           just an individual output, which is the per-output noise this metric
           exists to remove -- reporting partial windows measured a 26% false
           alarm rate against 5% once they were withheld.

        The two pools are DISJOINT: baseline embeddings never enter the current
        window. Sharing them dilutes the current mean toward the baseline and
        suppresses real drift, which is what the validated `pooled_session`
        construction avoided by pooling the two sides separately.
        """
        embedding = embedding.flatten()

        # baseline_count = how many embeddings are already in this agent's baseline pool.
        baseline_count = self._baseline_counts.get(agent_id, 0)

        # Phase 1: fill the baseline. A frozen agent stops accumulating, so
        # whatever it had is what it keeps.
        # The pool is kept as a running SUM of embeddings; the mean is the sum divided by the
        # count. The first embedding starts the sum (as a float64 copy), the rest are added.
        # While the pool is filling there is no distance yet, so return None.
        if baseline_count < self._min_samples_for_alert and not is_frozen:
            if agent_id not in self._baseline_sums:
                self._baseline_sums[agent_id] = embedding.astype(np.float64).copy()
            else:
                self._baseline_sums[agent_id] += embedding
            self._baseline_counts[agent_id] = baseline_count + 1
            return None

        # Reached with an empty baseline only if the agent is frozen (or min_samples is 0):
        # there is nothing to compare with.
        if baseline_count == 0:
            return None

        # Phase 2: accumulate post-baseline outputs only.
        # Keep only the newest mean_window embeddings (`del recent[:-n]` deletes all but the
        # last n). Until the window is full there is no answer yet.
        recent = self._recent_embeddings.setdefault(agent_id, [])
        recent.append(embedding.copy())
        if len(recent) > self._mean_window:
            del recent[:-self._mean_window]

        if len(recent) < self._mean_window:
            return None

        # Phase 3: both pools are ready. Baseline mean = sum / count. Current mean = plain
        # average of the recent embeddings. Then the cosine distance between the two means,
        # worked out as in _update_embedding_drift (1.0 if either has length 0).
        baseline_mean = self._baseline_sums[agent_id] / baseline_count
        current_mean = np.mean(recent, axis=0)

        norm_b = np.linalg.norm(baseline_mean)
        norm_c = np.linalg.norm(current_mean)
        if norm_b == 0 or norm_c == 0:
            return 1.0

        similarity = float(np.dot(baseline_mean, current_mean) / (norm_b * norm_c))
        return round(1.0 - float(np.clip(similarity, -1.0, 1.0)), 6)

    def _update_quality_drift(
        self,
        agent_id: str,
        risk_score: float,
    ) -> float:
        """Track risk score trend — detect quality regression."""
        if agent_id not in self._risk_history:
            self._risk_history[agent_id] = []

        history = self._risk_history[agent_id]
        history.append(risk_score)

        # Keep only the newest window_size scores (the list is cut in place).
        if len(history) > self._window_size:
            history[:] = history[-self._window_size:]

        # Fewer than 10 scores is too few to see a trend, so report no drift (0.0).
        if len(history) < 10:
            return 0.0

        # Split the history into an older half and a newer half. The drift is how much the
        # newer half's average is ABOVE the older half's. A fall in risk counts as 0.0.
        midpoint = len(history) // 2
        historical_mean = np.mean(history[:midpoint])
        recent_mean = np.mean(history[midpoint:])

        drift = max(0.0, float(recent_mean - historical_mean))
        return round(drift, 4)

    def _update_tool_drift(
        self,
        agent_id: str,
        tool_name: str,
    ) -> float:
        """Track tool usage distribution entropy."""
        if agent_id not in self._tool_distributions:
            self._tool_distributions[agent_id] = {}

        # dist maps tool name -> how many times it was used. Count this call.
        dist = self._tool_distributions[agent_id]
        dist[tool_name] = dist.get(tool_name, 0) + 1

        # Fewer than 10 counted calls is too few, so report 0.0.
        total = sum(dist.values())
        if total < 10:
            return 0.0

        # probs = each tool's share of all calls. Entropy = -sum(p * log2(p)): it is 0 when one
        # tool does all the calls and grows as the calls spread over more tools. The tiny
        # 1e-10 is added so log2 is never given exactly 0.
        probs = np.array([c / total for c in dist.values()])
        entropy = -np.sum(probs * np.log2(probs + 1e-10))
        # The largest entropy possible for this many tools is log2(number of tools). With one
        # tool log2(1) would be 0, so 1.0 is used instead.
        max_entropy = np.log2(len(dist)) if len(dist) > 1 else 1.0

        # Dividing gives a number from 0 to 1.
        normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0.0
        return round(float(normalized_entropy), 4)

    def _update_error_drift(
        self,
        agent_id: str,
        is_error: bool,
    ) -> float:
        """Track error rate delta."""
        if agent_id not in self._error_counts:
            self._error_counts[agent_id] = []

        # errors is a list of True/False flags (True = the span failed), newest last.
        errors = self._error_counts[agent_id]
        errors.append(is_error)

        if len(errors) > self._window_size:
            errors[:] = errors[-self._window_size:]

        # Fewer than 10 flags is too few, so report 0.0.
        if len(errors) < 10:
            return 0.0

        # Error rate = share of True flags. Compare the older half with the newer half. A
        # fall in the rate counts as 0.0. (sum() counts the True values.)
        midpoint = len(errors) // 2
        historical_rate = sum(errors[:midpoint]) / midpoint
        recent_rate = sum(errors[midpoint:]) / (len(errors) - midpoint)

        delta = max(0.0, recent_rate - historical_rate)
        return round(delta, 4)

    def _compute_asi(self, result: DriftResult) -> float | None:
        """Compute Agent Stability Index (ASI).
        
        ASI ∈ [0, 100] is an explainable composite heuristic:
          100 = perfectly stable (no drift detected)
            0 = highly unstable (maximum drift on all signals)
            
        Component Weights:
          - Output semantic stability: 0.35
          - Quality / risk stability:  0.30
          - Tool-use stability:        0.15
          - Error-rate stability:      0.20
        """
        # Step 1: turn each signal that exists into a "stability" from 0 (bad) to 1 (good):
        # stability = 1 - signal * multiplier, never below 0. With the multipliers below,
        # stability reaches 0 when centroid_distance or tool_drift reaches 1, when
        # quality_drift reaches 0.5, and when error_rate_delta reaches 0.2.
        signals = []
        weights = []

        if result.centroid_distance is not None:
            stability = max(0.0, 1.0 - result.centroid_distance)
            signals.append(stability)
            weights.append(0.35)

        if result.quality_drift is not None:
            stability = max(0.0, 1.0 - result.quality_drift * 2)
            signals.append(stability)
            weights.append(0.30)

        if result.tool_drift is not None:
            stability = max(0.0, 1.0 - result.tool_drift)
            signals.append(stability)
            weights.append(0.15)

        if result.error_rate_delta is not None:
            stability = max(0.0, 1.0 - result.error_rate_delta * 5)
            signals.append(stability)
            weights.append(0.20)

        # No signal at all means no ASI. (analyze() always supplies error_rate_delta, so in
        # practice this does not happen.)
        if not signals:
            return None

        # Step 2: weighted average of the stabilities. Dividing by total_weight means that
        # when a signal is missing, the weights of the others are scaled to add up to 1 again.
        # Then multiply by 100, keep the result between 0 and 100, and round to 1 decimal.
        total_weight = sum(weights)
        weighted_sum = sum(s * w for s, w in zip(signals, weights))
        asi = (weighted_sum / total_weight) * 100

        return round(max(0.0, min(100.0, asi)), 1)

    # A small summary of what is remembered for one agent. evaluation_runner.py reads the
    # sample count from it when it saves baselines.
    def get_baseline_info(self, agent_id: str) -> dict:
        """Get baseline metadata for an agent."""
        with self._lock:
            return {
                "agent_id": agent_id,
                "sample_count": self._sample_counts.get(agent_id, 0),
                "has_centroid": agent_id in self._centroids,
                "is_frozen": agent_id in self._frozen_agents,
                "baseline_version": self._baseline_versions.get(agent_id, 1),
                "risk_history_length": len(self._risk_history.get(agent_id, [])),
                "tools_tracked": list(self._tool_distributions.get(agent_id, {}).keys()),
                "is_bootstrapping": self._sample_counts.get(agent_id, 0) < self._min_samples_for_alert,
            }

    # Returns the centroid as raw bytes (numpy tobytes) to store in the baselines table, or
    # None if the agent has no centroid. load_centroid reads the bytes back as float32, so
    # the round trip is only right when the centroid itself is float32.
    def serialize_centroid(self, agent_id: str) -> bytes | None:
        """Serialize centroid for database storage."""
        with self._lock:
            if agent_id not in self._centroids:
                return None
            return self._centroids[agent_id].tobytes()

    # Puts a saved centroid back and restores the span count with it, so the agent does not
    # go through the cold start again. It does not restore the window baseline; that is
    # load_window_baseline.
    def load_centroid(self, agent_id: str, data: bytes, sample_count: int) -> None:
        """Load a centroid from database."""
        with self._lock:
            self._centroids[agent_id] = np.frombuffer(data, dtype=np.float32).copy()
            self._sample_counts[agent_id] = sample_count

    # Returns (the running sum of the baseline embeddings as float64 bytes, how many there
    # are), or None if there is nothing to save. evaluation_runner.py stores it as a
    # "window_baseline_pool" row.
    def serialize_window_baseline(self, agent_id: str) -> tuple[bytes, int] | None:
        """Serialize the window-drift baseline pool for database storage.

        Separate from `serialize_centroid`: the EMA centroid and this pool are
        different structures feeding different signals, and only the centroid was
        ever persisted. Restoring the centroid alone brings back the spike metric
        but leaves `window_centroid_distance` -- the signal DRIFT_DETECTED
        actually fires on -- cold for `min_samples_for_alert` fresh samples after
        every restart, which is the opposite of what the restore exists to do.

        The running sum is stored rather than the mean, so the count stays
        meaningful and accumulation resumes exactly where it stopped.
        """
        with self._lock:
            if agent_id not in self._baseline_sums:
                return None
            count = self._baseline_counts.get(agent_id, 0)
            if count <= 0:
                return None
            return self._baseline_sums[agent_id].astype(np.float64).tobytes(), count

    # In: the bytes and the count that serialize_window_baseline produced. worker.py calls
    # this at start-up; main.py (the API) does not.
    def load_window_baseline(self, agent_id: str, data: bytes, count: int) -> None:
        """Restore the window-drift baseline pool from database.

        Only the baseline side is restored. The current window
        (`_recent_embeddings`) is deliberately left empty: it holds the most
        recent `mean_window` outputs, and outputs from before a restart are no
        longer "current". Re-warming those few samples is correct; re-warming the
        entire baseline from scratch was not.
        """
        with self._lock:
            self._baseline_sums[agent_id] = np.frombuffer(data, dtype=np.float64).copy()
            self._baseline_counts[agent_id] = count

    # evaluation_runner.persist_drift_baselines uses this to skip agents that have nothing
    # to save.
    def touched_agent_ids(self, agent_ids: set[str]) -> set[str]:
        """Filter `agent_ids` down to those this detector currently has a centroid for."""
        with self._lock:
            return {a for a in agent_ids if a in self._centroids}
