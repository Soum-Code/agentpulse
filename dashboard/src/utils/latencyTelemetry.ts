import { Agent, LatencyDataPoint } from '../types';

/**
 * Generates 60 minutes of minute-by-minute latency telemetry for an agent,
 * modeling realistic baseline noise, drift divergence, and spike behaviors.
 */
export function generate60MinLatencyData(agent: Agent): LatencyDataPoint[] {
  const points: LatencyDataPoint[] = [];
  const base = agent.latencyAvgMs;
  const driftScore = agent.driftScore; // 0 to 1
  const driftStatus = agent.driftStatus;

  // Reference now timestamp
  const now = new Date();

  // Thresholds
  const baselineMs = Math.round(base * (driftStatus === 'drift' ? 0.65 : driftStatus === 'deviation' ? 0.85 : 0.98));
  const driftThresholdMs = Math.round(baselineMs * 1.35); // 35% above baseline triggers deviation

  for (let min = 60; min >= 0; min -= 2) {
    const pointTime = new Date(now.getTime() - min * 60 * 1000);
    const hours = String(pointTime.getHours()).padStart(2, '0');
    const minutes = String(pointTime.getMinutes()).padStart(2, '0');
    const seconds = String(pointTime.getSeconds()).padStart(2, '0');
    const timestamp = `${hours}:${minutes}:${seconds}`;

    const timeLabel = min === 0 ? 'Now' : `-${min}m`;
    const timeAgo = min === 0 ? 'Just now' : `${min}m ago`;
    const progress = (60 - min) / 60; // 0 at -60m, 1 at Now

    let latency = baselineMs;
    // Base Gaussian-like random jitter
    const jitter = (Math.sin(min * 0.4) * 0.5 + (Math.random() - 0.5)) * (base * 0.08);

    if (driftStatus === 'normal') {
      // Steady behavior with minimal drift
      latency = Math.max(50, Math.round(baselineMs + jitter + (driftScore * base * 0.1 * progress)));
    } else if (driftStatus === 'deviation') {
      // Moderate progressive upward drift after -30m
      const driftCurve = Math.pow(progress, 1.8);
      const spike = (min <= 15 && min % 6 === 0) ? base * 0.35 : 0;
      latency = Math.max(100, Math.round(baselineMs + (driftScore * base * 0.6 * driftCurve) + jitter + spike));
    } else {
      // Severe 'drift' (e.g., SQL synthesizer / runaway loops)
      // Exponential divergence in the last 40 minutes
      const severeCurve = Math.pow(progress, 2.4);
      const isRecentSpike = min <= 20 && (min % 4 === 0 || min === 0);
      const spike = isRecentSpike ? base * 0.45 : 0;
      latency = Math.max(150, Math.round(baselineMs + (driftScore * base * 1.4 * severeCurve) + jitter + spike));
    }

    let status: 'normal' | 'deviation' | 'drift' = 'normal';
    if (latency > baselineMs * 1.6 || (driftStatus === 'drift' && min <= 25)) {
      status = 'drift';
    } else if (latency > driftThresholdMs || (driftStatus === 'deviation' && min <= 20)) {
      status = 'deviation';
    }

    points.push({
      minute: 60 - min,
      timeLabel,
      timestamp,
      timeAgo,
      latencyMs: latency,
      baselineMs,
      driftThresholdMs,
      status
    });
  }

  return points;
}

export interface Latency60mSummary {
  currentMs: number;
  baselineMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  driftDeltaPct: number;
  driftThresholdMs: number;
  anomalyCount: number;
}

export function computeLatency60mSummary(data: LatencyDataPoint[]): Latency60mSummary {
  if (!data || data.length === 0) {
    return {
      currentMs: 0,
      baselineMs: 0,
      p95Ms: 0,
      minMs: 0,
      maxMs: 0,
      driftDeltaPct: 0,
      driftThresholdMs: 0,
      anomalyCount: 0
    };
  }

  const values = data.map(d => d.latencyMs);
  const sorted = [...values].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  
  const current = data[data.length - 1].latencyMs;
  const initial = data[0].latencyMs;
  const baseline = data[0].baselineMs;
  const threshold = data[0].driftThresholdMs;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const deltaPct = initial > 0 ? Math.round(((current - initial) / initial) * 100) : 0;
  const anomalyCount = data.filter(d => d.latencyMs > threshold).length;

  return {
    currentMs: current,
    baselineMs: baseline,
    p95Ms: sorted[p95Index],
    minMs: min,
    maxMs: max,
    driftDeltaPct: deltaPct,
    driftThresholdMs: threshold,
    anomalyCount
  };
}
