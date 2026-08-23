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

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np

logger = logging.getLogger("agentpulse.drift")


@dataclass
class DriftResult:
    """Result of drift analysis for a single span."""

    centroid_distance: Optional[float] = None
    tool_drift: Optional[float] = None
    quality_drift: Optional[float] = None
    error_rate_delta: Optional[float] = None
    stability_index: Optional[float] = None  # ASI ∈ [0, 100]
    baseline_size: int = 0
    is_bootstrapping: bool = False
    is_frozen: bool = False
    baseline_version: int = 1
    details: str = ""


class DriftDetector:
    """Per-agent drift detection with controlled baseline management policies."""

    def __init__(
        self,
        window_size: int = 100,
        min_samples_for_alert: int = 20,
        drift_threshold: float = 0.3,
        ema_alpha: float = 0.05,
    ) -> None:
        self._window_size = window_size
        self._min_samples_for_alert = min_samples_for_alert
        self._drift_threshold = drift_threshold
        self._ema_alpha = ema_alpha

        # Per-agent state
        self._centroids: dict[str, np.ndarray] = {}
        self._sample_counts: dict[str, int] = {}
        self._risk_history: dict[str, list[float]] = {}
        self._tool_distributions: dict[str, dict[str, int]] = {}
        self._error_counts: dict[str, list[bool]] = {}
        self._frozen_agents: set[str] = set()
        self._baseline_versions: dict[str, int] = {}

        # Guards all read-modify-write access to the per-agent state above.
        # `analyze()` now runs on a thread-pool worker (see ingest.py), so
        # two spans for the same agent_id can race on the same dicts/arrays.
        self._lock = threading.Lock()

    def freeze_baseline(self, agent_id: str) -> bool:
        """Freeze baseline centroid for an agent to prevent contamination."""
        with self._lock:
            if agent_id in self._centroids:
                self._frozen_agents.add(agent_id)
                logger.info("Baseline frozen for agent: %s", agent_id)
                return True
            return False

    def unfreeze_baseline(self, agent_id: str) -> bool:
        """Unfreeze baseline centroid for an agent."""
        with self._lock:
            self._frozen_agents.discard(agent_id)
            logger.info("Baseline unfrozen for agent: %s", agent_id)
            return True

    def reset_baseline(self, agent_id: str) -> None:
        """Reset baseline calibration for an agent."""
        with self._lock:
            self._reset_baseline_locked(agent_id)

    def _reset_baseline_locked(self, agent_id: str) -> None:
        self._centroids.pop(agent_id, None)
        self._sample_counts[agent_id] = 0
        self._risk_history.pop(agent_id, None)
        self._tool_distributions.pop(agent_id, None)
        self._error_counts.pop(agent_id, None)
        self._frozen_agents.discard(agent_id)
        self._baseline_versions[agent_id] = self._baseline_versions.get(agent_id, 1) + 1
        logger.info("Baseline reset for agent: %s (v%d)", agent_id, self._baseline_versions[agent_id])

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
            if embedding is not None:
                result.centroid_distance = self._update_embedding_drift(
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

            # 5. Compute ASI
            result.stability_index = self._compute_asi(result)

            # Update sample count
            self._sample_counts[agent_id] = count + 1

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

        if agent_id not in self._centroids:
            self._centroids[agent_id] = embedding.copy()
            return 0.0

        centroid = self._centroids[agent_id]

        # Cosine distance
        dot = np.dot(embedding, centroid)
        norm_e = np.linalg.norm(embedding)
        norm_c = np.linalg.norm(centroid)

        if norm_e == 0 or norm_c == 0:
            distance = 1.0
        else:
            similarity = dot / (norm_e * norm_c)
            distance = 1.0 - float(np.clip(similarity, -1.0, 1.0))

        # Update centroid with EMA only if not frozen
        if not is_frozen:
            self._centroids[agent_id] = (
                (1 - self._ema_alpha) * centroid + self._ema_alpha * embedding
            )

        return round(distance, 6)

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

        if len(history) > self._window_size:
            history[:] = history[-self._window_size:]

        if len(history) < 10:
            return 0.0

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

        dist = self._tool_distributions[agent_id]
        dist[tool_name] = dist.get(tool_name, 0) + 1

        total = sum(dist.values())
        if total < 10:
            return 0.0

        probs = np.array([c / total for c in dist.values()])
        entropy = -np.sum(probs * np.log2(probs + 1e-10))
        max_entropy = np.log2(len(dist)) if len(dist) > 1 else 1.0

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

        errors = self._error_counts[agent_id]
        errors.append(is_error)

        if len(errors) > self._window_size:
            errors[:] = errors[-self._window_size:]

        if len(errors) < 10:
            return 0.0

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

        if not signals:
            return None

        total_weight = sum(weights)
        weighted_sum = sum(s * w for s, w in zip(signals, weights))
        asi = (weighted_sum / total_weight) * 100

        return round(max(0.0, min(100.0, asi)), 1)

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

    def serialize_centroid(self, agent_id: str) -> bytes | None:
        """Serialize centroid for database storage."""
        with self._lock:
            if agent_id not in self._centroids:
                return None
            return self._centroids[agent_id].tobytes()

    def load_centroid(self, agent_id: str, data: bytes, sample_count: int) -> None:
        """Load a centroid from database."""
        with self._lock:
            self._centroids[agent_id] = np.frombuffer(data, dtype=np.float32).copy()
            self._sample_counts[agent_id] = sample_count

    def touched_agent_ids(self, agent_ids: set[str]) -> set[str]:
        """Filter `agent_ids` down to those this detector currently has a centroid for."""
        with self._lock:
            return {a for a in agent_ids if a in self._centroids}
