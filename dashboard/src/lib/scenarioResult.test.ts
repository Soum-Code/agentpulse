import { describe, expect, it } from 'vitest';
import {
  expectedAlertChecks,
  finalWindowDistance,
  formatScore,
  isComplete,
  type ScenarioResult,
  type ScenarioSpanResult,
} from './scenarioResult';

const span = (over: Partial<ScenarioSpanResult> = {}): ScenarioSpanResult => ({
  span_id: 's',
  agent_id: 'a',
  evaluated: true,
  grounding_score: null,
  tool_claim_score: null,
  disagreement_score: null,
  overall_risk_score: null,
  window_centroid_distance: null,
  ...over,
});

const run = (spans: ScenarioSpanResult[], alerts: ScenarioResult['alerts'] = []): ScenarioResult => ({
  trace_id: 't',
  spans,
  alerts,
});

describe('isComplete', () => {
  it('waits for every span, and never counts an empty run as done', () => {
    expect(isComplete(run([span(), span({ evaluated: false })]))).toBe(false);
    expect(isComplete(run([span(), span()]))).toBe(true);
    expect(isComplete(run([]))).toBe(false);
  });
});

describe('finalWindowDistance', () => {
  it('reads only the last span, so an earlier value is not passed off as the final one', () => {
    const result = run([span({ window_centroid_distance: 0.9 }), span()]);
    expect(finalWindowDistance(result)).toBeNull();
    expect(finalWindowDistance(run([span(), span({ window_centroid_distance: 0.968 })]))).toBe(0.968);
  });
});

describe('expectedAlertChecks', () => {
  it('lists the agents an expected alert fired for, and none when it did not fire', () => {
    const result = run([span()], [
      { alert_type: 'GROUNDING_FAILURE', severity: 'HIGH', agent_id: 'verifier', span_id: 'x', message: 'm' },
    ]);
    expect(expectedAlertChecks(['GROUNDING_FAILURE', 'DRIFT_DETECTED'], result)).toEqual([
      { type: 'GROUNDING_FAILURE', agents: ['verifier'] },
      { type: 'DRIFT_DETECTED', agents: [] },
    ]);
  });
});

describe('formatScore', () => {
  it('shows null as a dash and keeps a real zero', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(0)).toBe('0.0000');
  });
});
