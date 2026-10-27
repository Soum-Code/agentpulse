/** Trace status: how it is derived, and that the list, the filters, the counts and the exports
 *  all read the same answer for the same trace. */
import { describe, expect, it } from 'vitest';
import type { AlertItem, SpanDetail, TraceListItem } from './api';
import type { Trace } from '../types';
import { toSpans, toTrace } from './adapters';
import { countTraces, filterAndSortTraces, type TraceFilterState } from './traceFilters';
import {
  TRACE_STATUS_RANK,
  deriveTraceStatus,
  escalateFromAlertFeed,
  isHighSeverity,
  traceStatusTitle,
} from './traceStatus';
import { formatTraceForExport, formatTracesAsCsv } from '../utils/traceExport';

const row = (id: string, over: Partial<TraceListItem> = {}): TraceListItem =>
  ({ trace_id: id, service_name: 'svc', start_time: '2026-10-27T10:00:00', end_time: null, status: 'completed', ...over }) as TraceListItem;

const span = (over: Partial<SpanDetail> = {}): SpanDetail =>
  ({
    span_id: 's1',
    parent_span_id: null,
    agent_id: 'researcher',
    event_type: 'agent_execution',
    start_time: '2026-10-27T10:00:00.000Z',
    latency_ms: 10,
    status: 'success',
    model: null,
    tokens_in: null,
    tokens_out: null,
    tool_name: null,
    error_message: null,
    evaluation: null,
    ...over,
  }) as unknown as SpanDetail;

// A clean span the evaluator has scored; span() alone has no evaluation row, which is unknown (M1).
const scored = () => span({ evaluation: { overall_risk_score: 0.1 } as any });

const alert = (over: Partial<AlertItem> = {}): AlertItem =>
  ({
    id: 1,
    alert_type: 'GROUNDING_FAILURE',
    severity: 'HIGH',
    message: 'm',
    agent_id: 'researcher',
    trace_id: 't1',
    span_id: 's1',
    created_at: '2026-10-27T10:00:00',
    acknowledged: false,
    resolved: false,
    ...over,
  }) as unknown as AlertItem;

describe('isHighSeverity', () => {
  it('is HIGH or CRITICAL in any case, and nothing else', () => {
    for (const s of ['HIGH', 'high', 'CRITICAL', 'Critical']) expect(isHighSeverity(s), s).toBe(true);
    for (const s of ['MEDIUM', 'warning', 'LOW', '', null, undefined]) expect(isHighSeverity(s), String(s)).toBe(false);
  });
});

describe('deriveTraceStatus', () => {
  const ok = { status: 'ok' as const };

  it('is unknown with nothing wrong known and the alerts not loaded', () => {
    expect(deriveTraceStatus({ apiStatus: 'completed', spans: [] })).toBe('unknown');
    expect(deriveTraceStatus({ apiStatus: 'completed', spans: [ok] })).toBe('unknown');
    expect(deriveTraceStatus({ apiStatus: undefined, spans: [] })).toBe('unknown');
  });

  it('is ok only when the alerts are loaded and empty', () => {
    expect(deriveTraceStatus({ apiStatus: 'completed', spans: [ok], alerts: [] })).toBe('ok');
  });

  it('is unknown, not ok, while a span is not scored yet (M1)', () => {
    expect(deriveTraceStatus({ spans: [ok, { status: 'ok', evaluated: false }], alerts: [] })).toBe('unknown');
    expect(deriveTraceStatus({ spans: [{ status: 'ok', evaluated: true }], alerts: [] })).toBe('ok');
    // A known problem still wins over the unscored span.
    expect(deriveTraceStatus({ spans: [{ status: 'error', evaluated: false }], alerts: [] })).toBe('error');
    expect(deriveTraceStatus({ spans: [{ status: 'ok', evaluated: false }], alerts: [{ severity: 'MEDIUM' }] })).toBe('warning');
    expect(traceStatusTitle('unknown')).toContain('not scored');
  });

  it('takes the worst of the API status, the spans and the alerts', () => {
    expect(deriveTraceStatus({ spans: [ok, { status: 'warning' }], alerts: [] })).toBe('warning');
    expect(deriveTraceStatus({ spans: [{ status: 'warning' }, { status: 'error' }], alerts: [] })).toBe('error');
    expect(deriveTraceStatus({ spans: [ok], alerts: [{ severity: 'MEDIUM' }] })).toBe('warning');
    expect(deriveTraceStatus({ spans: [ok], alerts: [{ severity: 'MEDIUM' }, { severity: 'HIGH' }] })).toBe('error');
    expect(deriveTraceStatus({ apiStatus: 'RUNNING', spans: [ok], alerts: [] })).toBe('warning');
    expect(deriveTraceStatus({ apiStatus: 'running', spans: [ok], alerts: [{ severity: 'high' }] })).toBe('error');
  });

  it('knows a problem without the alerts, but never knows "fine" without them', () => {
    expect(deriveTraceStatus({ apiStatus: 'error', spans: [] })).toBe('error');
    expect(deriveTraceStatus({ apiStatus: 'running', spans: [] })).toBe('warning');
    expect(deriveTraceStatus({ spans: [{ status: 'error' }] })).toBe('error');
  });

  it('ranks errors first and unknown last', () => {
    expect(TRACE_STATUS_RANK.error).toBeLessThan(TRACE_STATUS_RANK.warning);
    expect(TRACE_STATUS_RANK.warning).toBeLessThan(TRACE_STATUS_RANK.ok);
    expect(TRACE_STATUS_RANK.ok).toBeLessThan(TRACE_STATUS_RANK.unknown);
  });

  it('has a tooltip sentence for every status', () => {
    for (const s of ['ok', 'warning', 'error', 'unknown'] as const) expect(traceStatusTitle(s).length).toBeGreaterThan(10);
    expect(traceStatusTitle('unknown')).toContain('not loaded');
  });
});

describe('escalateFromAlertFeed', () => {
  const entry = (id: string, over: Partial<Trace> = {}): Trace => ({ ...toTrace(row(id)), ...over });

  it('marks a list entry named in the alert feed, and leaves the others unknown', () => {
    const feed = [alert({ trace_id: 't1', severity: 'HIGH' }), alert({ id: 2, trace_id: 't2', severity: 'MEDIUM' })];
    expect(escalateFromAlertFeed(entry('t1'), feed).status).toBe('error');
    expect(escalateFromAlertFeed(entry('t2'), feed).status).toBe('warning');
    // Not being in a capped feed proves nothing.
    expect(escalateFromAlertFeed(entry('t3'), feed).status).toBe('unknown');
  });

  it('never makes a worse status better, and never touches a loaded trace', () => {
    const feed = [alert({ trace_id: 't1', severity: 'MEDIUM' })];
    expect(escalateFromAlertFeed(entry('t1', { status: 'error' }), feed).status).toBe('error');
    const loaded = toTrace(row('t1'), toSpans([scored()], 't1'), []);
    expect(escalateFromAlertFeed(loaded, feed)).toBe(loaded);
    expect(loaded.status).toBe('ok');
  });
});

describe('one trace with a HIGH alert reads the same everywhere', () => {
  // The case the Telemetry Lab's hallucination scenario produces: every span succeeded and the
  // evaluator raised HIGH alerts. This used to be 'ok' in the list, the filters and the exports.
  const flagged = toTrace(row('t-flagged'), toSpans([span()], 't-flagged'), [alert({ trace_id: 't-flagged', severity: 'HIGH' })]);
  const clean = toTrace(row('t-clean'), toSpans([scored()], 't-clean'), []);
  const notLoaded = toTrace(row('t-entry'));
  const traces = [flagged, clean, notLoaded];

  const base: TraceFilterState = {
    status: 'all', durationPreset: 'all', customMinDuration: '', customMaxDuration: '', search: '', sort: 'timestamp-desc',
  };
  const ids = (l: Trace[]) => l.map((t) => t.id);

  it('is error in the adapter, the filters and the counts', () => {
    expect(flagged.status).toBe('error');
    expect(ids(filterAndSortTraces(traces, { ...base, status: 'error' }))).toEqual(['t-flagged']);
    expect(ids(filterAndSortTraces(traces, { ...base, status: 'ok' }))).toEqual(['t-clean']);
    expect(ids(filterAndSortTraces(traces, { ...base, status: 'unknown' }))).toEqual(['t-entry']);
    expect(countTraces(traces).status).toEqual({ all: 3, ok: 1, warning: 0, error: 1, unknown: 1 });
  });

  it('is error in the JSON export and the CSV, and an unloaded trace exports no status at all', () => {
    expect(formatTraceForExport(flagged).trace.status).toBe('error');
    expect(formatTraceForExport(notLoaded).trace.status).toBeNull();

    const [headerLine, ...rows] = formatTracesAsCsv(traces).split('\n');
    const parse = (line: string) => line.slice(1, -1).split('","');
    const col = parse(headerLine).indexOf('Status');
    expect(rows.map((r) => parse(r)[col])).toEqual(['error', 'ok', '']);
  });

  it('puts error first and unknown last in status-priority order', () => {
    expect(ids(filterAndSortTraces(traces, { ...base, sort: 'status-priority' }))).toEqual(['t-flagged', 't-clean', 't-entry']);
  });
});
