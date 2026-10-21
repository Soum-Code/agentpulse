import { describe, expect, it } from 'vitest';
import { liveEvaluationTiming } from './evalTiming';
import type { PlatformHealth } from './api';

function health(timing: PlatformHealth['evaluation_timing']): PlatformHealth {
  return {
    state: 'healthy',
    reasons: [],
    evaluation_queue: { depth: 0, backlog_threshold: 100 },
    workers: {},
    evaluation_timing: timing,
  };
}

describe('liveEvaluationTiming', () => {
  it('shows the median with its sample size', () => {
    const line = liveEvaluationTiming(
      health({ sample_size: 40, evaluation_ms: { p50: 253.8, p95: 417.3 } }),
      false,
    );
    expect(line.value).toBe('254 ms median');
    expect(line.caption).toContain('last 40 evaluated spans');
    expect(line.caption).toContain('p95 417 ms');
  });

  it('is an em dash, never zero, when nothing was sampled', () => {
    const empty = liveEvaluationTiming(
      health({ sample_size: 0, evaluation_ms: { p50: null, p95: null } }),
      false,
    );
    expect(empty.value).toBe('—');
    expect(empty.caption).toContain('has not evaluated');
    expect(liveEvaluationTiming(health(undefined), false).value).toBe('—');
  });

  it('is an em dash with a reason when the API could not be read', () => {
    expect(liveEvaluationTiming(null, true).caption).toContain('could not be read');
    expect(liveEvaluationTiming(null, false).value).toBe('—');
  });
});
