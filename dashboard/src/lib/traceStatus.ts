/**
 * What a trace's status is, in one place, so the Traces list, its filters and counts, the
 * Overview dots, the command palette and the CSV/JSON exports all read the same answer.
 *
 * The backend gives a trace no verdict of its own. GET /v1/traces sends only "running" or
 * "completed" (backend/app/models.py allows "error" in a comment, but nothing ever sets it), so
 * a trace the evaluator flagged looked "ok". What the API does send is, per trace, the status and
 * scores of every span (GET /v1/traces/{id}) and the alerts raised on the trace. The status is
 * the worst of those, and 'unknown' while they have not been loaded.
 */
import type { SpanStatus, Trace, TraceStatus } from '../types';

/** HIGH is the highest severity the alerting rules produce; CRITICAL is accepted in case a rule ever uses it. */
export function isHighSeverity(severity: string | null | undefined): boolean {
  const s = severity?.toLowerCase();
  return s === 'high' || s === 'critical';
}

export interface TraceStatusInput {
  /** The trace row's own status from the API: "running" or "completed". */
  apiStatus?: string | null;
  /** `evaluated: false` marks a span the evaluator has not scored yet (no evaluation row). */
  spans: { status: SpanStatus; evaluated?: boolean }[];
  /** The alerts GET /v1/traces/{id} lists. Undefined means the detail was not loaded, which is
   *  not the same as "no alerts". */
  alerts?: { severity: string }[];
}

/**
 * error   - a span failed, or the trace has a HIGH or CRITICAL alert (HIGH_HALLUCINATION_RISK,
 *           GROUNDING_FAILURE, TOOL_CLAIM_MISMATCH, ERROR_RATE_SPIKE). Matches Incidents, where
 *           the same severities are shown as critical.
 * warning - still running, a span scored as risky, or any other alert (the MEDIUM ones: drift,
 *           stability drop).
 * ok      - the detail was loaded, every span was scored, and nothing above applies.
 * unknown - nothing wrong is known but the alerts were not loaded, or a span is still waiting
 *           for the evaluator (its alerts are only written once it is scored), so "ok" would
 *           be a guess.
 *
 * An alert counts whether or not it was acknowledged or resolved: the status says what the
 * detectors found, and closing the alert does not undo the finding.
 */
export function deriveTraceStatus({ apiStatus, spans, alerts }: TraceStatusInput): TraceStatus {
  const api = apiStatus?.toUpperCase();
  if (api === 'ERROR') return 'error';
  if (spans.some((s) => s.status === 'error')) return 'error';
  if (alerts?.some((a) => isHighSeverity(a.severity))) return 'error';

  if (api === 'RUNNING') return 'warning';
  if (spans.some((s) => s.status === 'warning')) return 'warning';
  if (alerts && alerts.length > 0) return 'warning';

  if (alerts === undefined) return 'unknown';
  // A span with no evaluation row yet has not been measured; the trace is not "ok" until it is.
  if (spans.some((s) => s.evaluated === false)) return 'unknown';
  return 'ok';
}

/** Sort rank, worst first. Unknown is ranked after ok: it is never promoted above a known status. */
export const TRACE_STATUS_RANK: Record<TraceStatus, number> = { error: 0, warning: 1, ok: 2, unknown: 3 };

/** One short sentence for a tooltip on a status label. */
export function traceStatusTitle(status: TraceStatus): string {
  switch (status) {
    case 'error':
      return 'A span failed, or the trace has a HIGH alert';
    case 'warning':
      return 'Still running, a span scored as risky, or the trace has an alert below HIGH';
    case 'ok':
      return 'Trace detail loaded and scored: no failed span and no alert';
    default:
      return 'Unknown: the spans and alerts of this trace are not loaded yet, or a span is not scored yet';
  }
}

/**
 * A list entry (alerts not loaded) whose id appears in the alert feed the console already polls
 * (GET /v1/alerts, newest 50). The feed is capped, so it can show that a trace is in trouble but
 * never that it is fine: a trace in the feed gets at least 'warning', and 'error' if one of its
 * alerts is HIGH; a trace that is not in it stays as it was (unknown). A trace whose detail was
 * loaded is returned unchanged, because its own alert list is complete.
 */
export function escalateFromAlertFeed(
  trace: Trace,
  feed: { trace_id: string | null; severity: string }[],
): Trace {
  if (trace.alerts !== undefined) return trace;
  const mine = feed.filter((a) => a.trace_id === trace.id);
  if (mine.length === 0) return trace;
  const fromFeed: TraceStatus = mine.some((a) => isHighSeverity(a.severity)) ? 'error' : 'warning';
  // Never turn a worse status into a better one.
  return TRACE_STATUS_RANK[fromFeed] < TRACE_STATUS_RANK[trace.status] ? { ...trace, status: fromFeed } : trace;
}
