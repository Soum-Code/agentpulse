/** Tests for the REST-to-view-model mapping.
 *
 * This file carries a rule at the top: "every field is either read from the API
 * or left undefined. Nothing is filled in with a plausible-looking default,
 * because a value the backend never measured would be indistinguishable from
 * one it did."
 *
 * That rule is not enforceable by types -- `number | undefined` accepts a
 * cheerful `0` just as happily as a real measurement. It is enforceable by
 * tests, so most of what follows checks that absent stays absent. Several of
 * these cases are regressions: the severity comparison, the success-rate scale
 * and the waterfall offsets were each wrong in a shipped build.
 */

import { describe, expect, it } from 'vitest';
import {
  toAgents,
  toDriftProfiles,
  toIncidents,
  toSpans,
  toTrace,
  type DriftEntry,
} from './adapters';
import type { Agent as ApiAgent, AlertItem, SpanDetail, TraceListItem } from './api';

const agent = (over: Partial<ApiAgent> = {}): ApiAgent =>
  ({
    agent_id: 'researcher',
    agent_role: null,
    total_spans: 12,
    avg_latency_ms: 40,
    error_rate: 0,
    current_asi: null,
    avg_risk_score: null,
    last_seen: '2026-09-14T10:00:00',
    ...over,
  }) as ApiAgent;

const span = (over: Partial<SpanDetail> = {}): SpanDetail =>
  ({
    span_id: 's1',
    parent_span_id: null,
    agent_id: 'researcher',
    event_type: 'agent_execution',
    start_time: '2026-09-14T10:00:00.000Z',
    latency_ms: 10,
    status: 'success',
    model: null,
    tokens_in: null,
    tokens_out: null,
    tool_name: null,
    tool_result_summary: null,
    input_summary: null,
    output_summary: null,
    error_message: null,
    evaluation: null,
    ...over,
  }) as unknown as SpanDetail;

const alert = (over: Partial<AlertItem> = {}): AlertItem =>
  ({
    id: 1,
    alert_type: 'GROUNDING_FAILURE',
    severity: 'HIGH',
    message: 'Grounding failure for agent',
    agent_id: 'researcher',
    trace_id: 't1',
    span_id: 's1',
    created_at: '2026-09-14T10:00:00',
    acknowledged: false,
    resolved: false,
    ...over,
  }) as unknown as AlertItem;

describe('toAgents', () => {
  it('reports success rate as a percentage', () => {
    // Regression: this was once returned as a 0-1 fraction while the roster
    // compared it against 90 and appended '%', so a perfectly healthy agent
    // rendered as "1%" and was flagged as failing.
    expect(toAgents([agent({ error_rate: 0 })], [])[0].successRate).toBe(100);
    expect(toAgents([agent({ error_rate: 0.25 })], [])[0].successRate).toBe(75);
  });

  it('leaves drift absent until the backend has a window distance', () => {
    const [a] = toAgents([agent()], []);
    expect(a.driftScore).toBeUndefined();
    expect(a.driftStatus).toBeUndefined();
  });

  it('distinguishes "no drift measured yet" from "measured, and normal"', () => {
    // The distinction the whole rule exists for. Window drift needs 32
    // evaluated spans before it produces a number; reporting that gap as
    // 'normal' would claim a measurement that was never taken.
    const pending: DriftEntry = {
      agent_id: 'researcher',
      current_asi: null,
      latest_centroid_distance: 0.9,
      latest_window_centroid_distance: null,
    };
    const measured: DriftEntry = { ...pending, latest_window_centroid_distance: 0.1 };

    expect(toAgents([agent()], [pending])[0].driftStatus).toBeUndefined();
    expect(toAgents([agent()], [measured])[0].driftStatus).toBe('normal');
  });

  it('flags drift on the window distance, not the spike distance', () => {
    // centroid_distance flagged 91.7% of unchanged operation at this
    // threshold; the sustained-shift metric is what the alert fires on, and
    // the roster must agree with the alert rather than contradict it.
    const spikeOnly: DriftEntry = {
      agent_id: 'researcher',
      current_asi: null,
      latest_centroid_distance: 1.8,
      latest_window_centroid_distance: 0.05,
    };
    const [a] = toAgents([agent()], [spikeOnly]);
    expect(a.driftStatus).toBe('normal');
    expect(a.status).not.toBe('critical');
  });

  it('marks an agent critical when sustained drift exceeds the threshold', () => {
    const drifting: DriftEntry = {
      agent_id: 'researcher',
      current_asi: null,
      latest_centroid_distance: 0.1,
      latest_window_centroid_distance: 0.42,
    };
    expect(toAgents([agent()], [drifting])[0].status).toBe('critical');
  });

  it('omits fields the AgentPulse schema has no source for', () => {
    const [a] = toAgents([agent()], []) as unknown as Record<string, unknown>[];
    for (const field of ['version', 'model', 'framework', 'tools', 'costPerHour']) {
      expect(a[field]).toBeUndefined();
    }
  });
});

describe('toIncidents', () => {
  it('matches severity case-insensitively', () => {
    // Regression: the backend stores 'HIGH' and this compared against 'high',
    // so 46 high-severity incidents rendered as 0 critical on the overview.
    expect(toIncidents([alert({ severity: 'HIGH' })])[0].severity).toBe('critical');
    expect(toIncidents([alert({ severity: 'high' })])[0].severity).toBe('critical');
    expect(toIncidents([alert({ severity: 'MEDIUM' })])[0].severity).toBe('warning');
  });

  it('derives status from acknowledged and resolved', () => {
    expect(toIncidents([alert()])[0].status).toBe('open');
    expect(toIncidents([alert({ acknowledged: true })])[0].status).toBe('investigating');
    expect(toIncidents([alert({ resolved: true })])[0].status).toBe('resolved');
  });

  it('uses the detector\'s own message rather than inventing a root cause', () => {
    const [i] = toIncidents([alert({ message: 'distance=0.879' })]) as unknown as Record<
      string,
      unknown
    >[];
    expect(i.summary).toBe('distance=0.879');
    expect(i.rootCause).toBeUndefined();
    expect(i.suggestedAction).toBeUndefined();
  });
});

describe('toSpans', () => {
  it('measures offsets from the earliest span, not from the first in the array', () => {
    // Regression: the waterfall rendered from array order, so a span that
    // started earlier but arrived later got a negative offset and was drawn
    // off the left edge of the chart.
    const spans = toSpans(
      [
        span({ span_id: 'late', start_time: '2026-09-14T10:00:05.000Z' }),
        span({ span_id: 'early', start_time: '2026-09-14T10:00:00.000Z' }),
      ],
      't1',
    );
    const byId = Object.fromEntries(spans.map((s) => [s.id, s]));
    expect(byId.early.startOffsetMs).toBe(0);
    expect(byId.late.startOffsetMs).toBe(5000);
    expect(spans.every((s) => s.startOffsetMs >= 0)).toBe(true);
  });

  it('compares span status case-insensitively', () => {
    expect(toSpans([span({ status: 'ERROR' })], 't1')[0].status).toBe('error');
    expect(toSpans([span({ status: 'error' })], 't1')[0].status).toBe('error');
  });

  it('omits the token block entirely when no counts were recorded', () => {
    // Zeroes here would read as "this call used no tokens", which is a claim.
    expect(toSpans([span()], 't1')[0].tokens).toBeUndefined();
    expect(toSpans([span({ tokens_in: 5, tokens_out: 7 })], 't1')[0].tokens).toEqual({
      prompt: 5,
      completion: 7,
      total: 12,
    });
  });

  it('produces no evaluator cards when the span was never evaluated', () => {
    expect(toSpans([span()], 't1')[0].evaluatorResults).toBeUndefined();
  });

  it('shows only the signals the evaluator actually scored', () => {
    const [s] = toSpans(
      [span({ evaluation: { grounding_score: 0.9, evaluation_stage: 'stage2' } } as never)],
      't1',
    );
    expect(s.evaluatorResults).toHaveLength(1);
    expect(s.evaluatorResults?.[0].name).toBe('Grounding');
    expect(s.evaluatorResults?.[0].passed).toBe(false);
  });
});

describe('toTrace', () => {
  it('reports drift only when a DRIFT_DETECTED alert exists', () => {
    const t = { trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00' } as TraceListItem;
    expect(toTrace(t, [], []).driftDetected).toBe(false);
    expect(toTrace(t, [], [alert({ alert_type: 'DRIFT_DETECTED' })]).driftDetected).toBe(true);
    expect(toTrace(t, [], [alert({ alert_type: 'GROUNDING_FAILURE' })]).driftDetected).toBe(false);
  });

  it('leaves the grounding score absent when the trace has no risk score', () => {
    const t = { trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00' } as TraceListItem;
    expect(toTrace(t, [], []).groundingScore).toBeUndefined();
  });
});

describe('toDriftProfiles', () => {
  it('says the windows have not filled rather than implying stability', () => {
    // "Within baseline bounds" for an agent with no measurement would be a
    // reassurance the backend never gave.
    const [p] = toDriftProfiles([
      {
        agent_id: 'researcher',
        current_asi: null,
        latest_centroid_distance: null,
        latest_window_centroid_distance: null,
      },
    ]);
    expect(p.driftReason).toMatch(/have not filled/i);
    expect(p.driftMagnitude).toBeUndefined();
  });

  it('quotes the measured distance when it exceeds the threshold', () => {
    const [p] = toDriftProfiles([
      {
        agent_id: 'researcher',
        current_asi: null,
        latest_centroid_distance: 0.2,
        latest_window_centroid_distance: 0.879,
      },
    ]);
    expect(p.driftReason).toContain('0.879');
    expect(p.driftMagnitude).toBe(0.879);
  });

  it('leaves the scatter plot empty because the backend exposes no coordinates', () => {
    const [p] = toDriftProfiles([
      {
        agent_id: 'researcher',
        current_asi: null,
        latest_centroid_distance: 0.2,
        latest_window_centroid_distance: 0.1,
      },
    ]);
    expect(p.points).toEqual([]);
  });
});
