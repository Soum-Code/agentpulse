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
  toExperiments,
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
  it('counts the spans the drift detector saw, and knows when there is no record', () => {
    const entry = (over: Partial<DriftEntry>): DriftEntry => ({
      agent_id: 'researcher', current_asi: null, latest_centroid_distance: 0.1,
      latest_window_centroid_distance: null, baseline_size: 0, ...over,
    });
    // baseline_size is the count before the latest record, so + 1.
    expect(toAgents([agent()], [entry({ baseline_size: 2 })])[0].driftSpansSeen).toBe(3);
    // The very first span: count 0 before it, its own distance 0.0.
    expect(toAgents([agent()], [entry({ baseline_size: 0, latest_centroid_distance: 0 })])[0].driftSpansSeen).toBe(1);
    // GET /v1/drift sends baseline_size 0 and null distances when no drift record exists.
    expect(toAgents([agent()], [entry({ baseline_size: 0, latest_centroid_distance: null })])[0].driftSpansSeen).toBeUndefined();
    expect(toAgents([agent()], [])[0].driftSpansSeen).toBeUndefined();
  });

  it('reports success rate as a percentage', () => {
    // Regression: this was once returned as a 0-1 fraction while the roster
    // compared it against 90 and appended '%', so a perfectly healthy agent
    // rendered as "1%" and was flagged as failing.
    expect(toAgents([agent({ error_rate: 0 })], [])[0].successRate).toBe(100);
    expect(toAgents([agent({ error_rate: 0.25 })], [])[0].successRate).toBe(75);
  });

  it('names the lifetime span count totalSpans, not a 24h trace count', () => {
    expect(toAgents([agent({ total_spans: 42 })], [])[0].totalSpans).toBe(42);
    expect((toAgents([agent()], [])[0] as unknown as Record<string, unknown>).totalTraces24h).toBeUndefined();
  });

  it('rounds the success rate to one decimal', () => {
    // (1 - 0.1667) * 100 is 83.33000000000001 in floating point, and three views printed
    // it raw. The API rounds error_rate to four decimals; one decimal of percent is enough.
    expect(toAgents([agent({ error_rate: 0.1667 })], [])[0].successRate).toBe(83.3);
    expect(toAgents([agent({ error_rate: 0.3333 })], [])[0].successRate).toBe(66.7);
  });

  it('leaves latency and role absent when the API has none', () => {
    const [a] = toAgents([agent({ avg_latency_ms: null, agent_role: null })], []);
    expect(a.latencyAvgMs).toBeUndefined();
    expect(a.description).toBeUndefined();
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
  it('keeps an unrecorded latency apart from 0', () => {
    // The drift scenario's spans carry no latency_ms, and the Traces view printed "0ms" for
    // each. durationMs used to be `?? 0` here (with a second field, latencyMs, for printing);
    // it is now the one field, and it stays undefined when nothing was recorded.
    const [none, some] = toSpans([span({ span_id: 'a', latency_ms: null }), span({ span_id: 'b', latency_ms: 12.5 })], 't1');
    expect(none.durationMs).toBeUndefined();
    expect(some.durationMs).toBe(12.5);
    // A latency that really is 0 is a measurement and is kept.
    expect(toSpans([span({ latency_ms: 0 })], 't1')[0].durationMs).toBe(0);
  });

  it('counts any status other than success as an error, as the backend does', () => {
    // ingest.py: "Any other value counts as an error for the agent's error count."
    for (const status of ['failed', 'timeout', 'FAILED']) {
      expect(toSpans([span({ status })], 't1')[0].status, status).toBe('error');
    }
    expect(toSpans([span({ status: 'success' })], 't1')[0].status).toBe('ok');
    expect(toSpans([span({ status: 'SUCCESS' })], 't1')[0].status).toBe('ok');
  });

  it('warns on a contradicted verdict even when the risk score is at or below 0.5', () => {
    const evaluation = (verdict: string | null, risk: number) =>
      ({ grounding_score: risk, tool_claim_score: null, overall_risk_score: risk, label: 'low_risk', evaluation_stage: 'stage2', grounding_verdict: verdict }) as SpanDetail['evaluation'];
    expect(toSpans([span({ evaluation: evaluation('contradicted', 0.43) })], 't1')[0].status).toBe('warning');
    // The other two verdicts stay ok at a low score: 'unverifiable' is not a failure (riskTone.ts).
    expect(toSpans([span({ evaluation: evaluation('unverifiable', 0.3) })], 't1')[0].status).toBe('ok');
    expect(toSpans([span({ evaluation: evaluation('supported', 0.05) })], 't1')[0].status).toBe('ok');
    expect(toSpans([span({ evaluation: evaluation(null, 0.6) })], 't1')[0].status).toBe('warning');
  });

  it('does not turn a token side that was not reported into 0', () => {
    const [onlyIn] = toSpans([span({ tokens_in: 5, tokens_out: null })], 't1');
    expect(onlyIn.tokens?.prompt).toBe(5);
    expect(onlyIn.tokens?.completion).toBeUndefined();
    expect(onlyIn.tokens?.total).toBe(5);
    const [onlyOut] = toSpans([span({ tokens_in: null, tokens_out: 7 })], 't1');
    expect(onlyOut.tokens?.prompt).toBeUndefined();
    expect(onlyOut.tokens?.completion).toBe(7);
    // A reported 0 is a measurement.
    expect(toSpans([span({ tokens_in: 0, tokens_out: 0 })], 't1')[0].tokens).toEqual({ prompt: 0, completion: 0, total: 0 });
  });

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

  it('puts the NLI verdict on the grounding card without changing its score or pass flag', () => {
    // A neutral-only output scores about 0.3: low risk, so it passes, and it is unverifiable.
    const [s] = toSpans(
      [
        span({
          evaluation: {
            grounding_score: 0.305,
            evaluation_stage: 'stage2',
            grounding_verdict: 'unverifiable',
          },
        } as never),
      ],
      't1',
    );
    const grounding = s.evaluatorResults?.[0];
    expect(grounding?.verdict).toBe('unverifiable');
    expect(grounding?.score).toBe(0.305);
    expect(grounding?.passed).toBe(true);
    expect(grounding?.reason).toContain('Verdict: Unverifiable');
    expect(grounding?.reason).toContain('neither supports nor contradicts');
  });

  it('names only the engine when the backend sent no verdict', () => {
    // The similarity-only fallback, a skipped row and a backend older than this field.
    for (const evaluation of [
      { grounding_score: 0.3, evaluation_stage: 'stage1', grounding_verdict: null },
      { grounding_score: 0.3, evaluation_stage: 'stage2' },
    ]) {
      const [s] = toSpans([span({ evaluation } as never)], 't1');
      expect(s.evaluatorResults?.[0].verdict).toBeUndefined();
      expect(s.evaluatorResults?.[0].reason).not.toContain('Verdict');
    }
  });
});

describe('toTrace', () => {
  it('reports drift only when a DRIFT_DETECTED alert exists', () => {
    const t = { trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00' } as TraceListItem;
    expect(toTrace(t, [], []).driftDetected).toBe(false);
    expect(toTrace(t, [], [alert({ alert_type: 'DRIFT_DETECTED' })]).driftDetected).toBe(true);
    expect(toTrace(t, [], [alert({ alert_type: 'GROUNDING_FAILURE' })]).driftDetected).toBe(false);
  });

  it('leaves drift and alerts unknown for a trace that is only a list entry', () => {
    // GET /v1/traces carries no alerts. Passing none must not read as "no drift, no alerts".
    const t = { trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00' } as TraceListItem;
    const entry = toTrace(t);
    expect(entry.alerts).toBeUndefined();
    expect(entry.driftDetected).toBeUndefined();
    expect(toTrace(t, [], []).alerts).toEqual([]);
  });

  it('keeps the alerts the trace detail lists', () => {
    const t = { trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00' } as TraceListItem;
    const [mapped] = toTrace(t, [], [alert({ id: 9, alert_type: 'GROUNDING_FAILURE', span_id: null })]).alerts!;
    expect(mapped).toEqual({
      id: 9,
      alertType: 'GROUNDING_FAILURE',
      severity: 'HIGH',
      message: 'Grounding failure for agent',
      agentId: 'researcher',
      spanId: undefined,
      acknowledged: false,
      resolved: false,
      createdAt: '2026-09-14T10:00:00',
    });
  });

  it('leaves the grounding score absent when the trace has no risk score', () => {
    const t = { trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00' } as TraceListItem;
    expect(toTrace(t, [], []).groundingScore).toBeUndefined();
  });
});

describe('toTrace status', () => {
  const row = (over: Partial<TraceListItem> = {}): TraceListItem =>
    ({ trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00', end_time: null, status: 'completed', ...over }) as TraceListItem;
  // A clean span the evaluator has scored (an unscored one keeps the trace unknown, M1).
  const okSpans = () => toSpans([span({ evaluation: { overall_risk_score: 0.1 } as any })], 't1');

  it('is unknown, not ok, while the trace is only a list entry', () => {
    // Regression: a list entry used to be 'ok' because the API's "completed" fell through the
    // old ternary to 'ok', whatever alerts the trace had.
    expect(toTrace(row()).status).toBe('unknown');
    expect(toTrace(row(), okSpans()).status).toBe('unknown');
  });

  it('is ok only once the alerts are loaded and nothing is wrong', () => {
    expect(toTrace(row(), okSpans(), []).status).toBe('ok');
  });

  it('is unknown while a span has no evaluation row yet, even with no alerts (M1)', () => {
    const unscored = toSpans([span({ evaluation: null as any })], 't1');
    expect(unscored[0].evaluated).toBe(false);
    expect(toTrace(row(), unscored, []).status).toBe('unknown');
  });

  it('is error for a HIGH alert on a trace whose spans all succeeded', () => {
    // The Telemetry Lab's hallucination scenario: clean span status, HIGH alerts.
    const a = alert({ severity: 'HIGH' });
    expect(toTrace(row(), okSpans(), [a]).status).toBe('error');
    expect(toTrace(row(), okSpans(), [alert({ severity: 'high' })]).status).toBe('error');
    expect(toTrace(row(), okSpans(), [alert({ severity: 'CRITICAL' })]).status).toBe('error');
    // Acknowledged or resolved does not undo what the detector found.
    expect(toTrace(row(), okSpans(), [alert({ severity: 'HIGH', acknowledged: true, resolved: true })]).status).toBe('error');
  });

  it('is warning for an alert below HIGH, and for a risky span', () => {
    expect(toTrace(row(), okSpans(), [alert({ severity: 'MEDIUM', alert_type: 'DRIFT_DETECTED' })]).status).toBe('warning');
    const risky = toSpans([span({ evaluation: { grounding_score: 0.6, tool_claim_score: null, overall_risk_score: 0.6, label: 'medium_risk', evaluation_stage: 'stage2' } })], 't1');
    expect(toTrace(row(), risky, []).status).toBe('warning');
  });

  it('is error when a span failed, with no alert needed', () => {
    const failed = toSpans([span({ status: 'error' })], 't1');
    expect(toTrace(row(), failed, []).status).toBe('error');
  });

  it('keeps what the list row already shows, with no alerts loaded', () => {
    expect(toTrace(row({ status: 'error' })).status).toBe('error');
    expect(toTrace(row({ status: 'ERROR' })).status).toBe('error');
    // A trace still running is not finished, as before.
    expect(toTrace(row({ status: 'running' })).status).toBe('warning');
    expect(toTrace(row({ status: 'running' }), okSpans(), [alert({ severity: 'HIGH' })]).status).toBe('error');
  });
});

describe('toTrace measurements', () => {
  const row = (over: Partial<TraceListItem> = {}): TraceListItem =>
    ({ trace_id: 't1', service_name: 'svc', start_time: '2026-09-14T10:00:00', end_time: null, status: 'completed', ...over }) as TraceListItem;

  it('leaves the duration undefined when the API gave no end time and no span a latency', () => {
    expect(toTrace(row()).durationMs).toBeUndefined();
    const noLatency = toSpans([span({ latency_ms: null })], 't1');
    expect(toTrace(row(), noLatency, []).durationMs).toBeUndefined();
  });

  it('measures the duration from end_time, else from the span that ends last', () => {
    expect(toTrace(row({ end_time: '2026-09-14T10:00:02' })).durationMs).toBe(2000);
    const spans = toSpans(
      [
        span({ span_id: 'a', start_time: '2026-09-14T10:00:00.000Z', latency_ms: 100 }),
        span({ span_id: 'b', start_time: '2026-09-14T10:00:00.500Z', latency_ms: 300 }),
      ],
      't1',
    );
    expect(toTrace(row(), spans, []).durationMs).toBe(800);
  });

  it('does not report a zero or negative wall time as a duration', () => {
    expect(toTrace(row({ end_time: '2026-09-14T10:00:00' })).durationMs).toBeUndefined();
    expect(toTrace(row({ end_time: '2026-09-14T09:59:00' })).durationMs).toBeUndefined();
    expect(toTrace(row({ end_time: 'not a date' })).durationMs).toBeUndefined();
  });

  it('sums tokens over the spans that reported any, and keeps a real 0', () => {
    expect(toTrace(row(), toSpans([span()], 't1'), []).totalTokens).toBeUndefined();
    const some = toSpans([span({ span_id: 'a', tokens_in: 4, tokens_out: 6 }), span({ span_id: 'b' })], 't1');
    expect(toTrace(row(), some, []).totalTokens).toBe(10);
    const zero = toSpans([span({ tokens_in: 0, tokens_out: 0 })], 't1');
    expect(toTrace(row(), zero, []).totalTokens).toBe(0);
  });

  it('names a multi-agent trace after all its agents, not the first span\'s', () => {
    const spans = toSpans(
      [
        span({ span_id: 'a', agent_id: 'planner' }),
        span({ span_id: 'b', agent_id: 'retriever' }),
        span({ span_id: 'c', agent_id: 'planner' }),
        span({ span_id: 'd', agent_id: 'answerer' }),
      ],
      't1',
    );
    const t = toTrace(row(), spans, []);
    expect(t.agentName).toBe('multi-agent (3)');
    // agentId stays the first span's agent: the views find the agent card with it.
    expect(t.agentId).toBe('planner');
    expect(t.agentIds).toEqual(['planner', 'retriever', 'answerer']);
  });

  it('keeps the agent name for a one-agent trace, and the service name before the spans load', () => {
    const one = toTrace(row(), toSpans([span({ agent_id: 'planner' })], 't1'), []);
    expect(one.agentName).toBe('planner');
    expect(one.agentIds).toEqual(['planner']);
    const entry = toTrace(row());
    expect(entry.agentName).toBe('svc');
    expect(entry.agentIds).toBeUndefined();
  });
});

describe('toExperiments', () => {
  it('names a result file by its file name and leaves every score absent', () => {
    // The shape GET /v1/experiments sends for a file under experiments/results/.
    const [e] = toExperiments([
      { file: 'ablation_results.json', timestamp: '2026-09-18 17:34:03 UTC', model: null, dataset: null, data: {} },
    ]);
    expect(e.id).toBe('ablation_results.json');
    expect(e.name).toBe('ablation_results.json');
    expect(e.sourceFile).toBe('ablation_results.json');
    expect(e.createdAt).toBe('2026-09-18 17:34:03 UTC');
    expect(e.datasetName).toBe('');
    for (const k of ['winRate', 'baselineScore', 'candidateScore', 'runCount', 'insights', 'comparisonDiffs', 'model'] as const) {
      expect(e[k], k).toBeUndefined();
    }
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

  it('leaves the spans-before-latest count unknown when there is no drift record (S3)', () => {
    const base = { agent_id: 'researcher', current_asi: null, latest_centroid_distance: null };
    expect(toDriftProfiles([{ ...base, baseline_size: null }])[0].baselineSampleCount).toBeUndefined();
    expect(toDriftProfiles([base])[0].baselineSampleCount).toBeUndefined();
    expect(toDriftProfiles([{ ...base, baseline_size: 14 }])[0].baselineSampleCount).toBe(14);
  });

  it('does not invent a current-window size', () => {
    // currentSampleCount was a hard-coded 0, shown as "Active Sample: 0". The API does not
    // report how full the current window is, so it stays absent.
    const [p] = toDriftProfiles([
      { agent_id: 'researcher', current_asi: null, latest_centroid_distance: 0.1, latest_window_centroid_distance: 0.1 },
    ]);
    expect(p.currentSampleCount).toBeUndefined();
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
