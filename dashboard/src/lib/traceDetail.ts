/** Loads the full detail of traces that so far are only list entries.
 *
 * useTelemetry fetches spans for the newest traces only. The rest stay list entries with no
 * spans, no alerts and no scores, which is nothing a trace export should pass off as the trace.
 */
import { api } from './api';
import { toSpans, toTrace } from './adapters';
import type { Trace } from '../types';

export async function loadFullTrace(trace: Trace): Promise<Trace> {
  // alerts is set exactly when the detail was loaded
  if (trace.alerts !== undefined) return trace;
  const full = await api.getTrace(trace.id);
  return toTrace(full.trace, toSpans(full.spans ?? [], trace.id), full.alerts ?? []);
}

/** Same, for a list. Rejects if any trace cannot be loaded, so a caller never exports a half-empty set. */
export function loadFullTraces(traces: Trace[]): Promise<Trace[]> {
  return Promise.all(traces.map(loadFullTrace));
}

/**
 * Puts back the detail already loaded for a trace while a poll refreshes the list.
 *
 * Every poll rebuilds the list from GET /v1/traces, whose entries have no spans and no alerts, and
 * then re-fetches the newest few. Without this, those few would drop to 'unknown' (and lose their
 * duration and tokens) for the moment between the two, on every poll. A trace that was never
 * loaded stays a list entry. Newer detail replaces this as soon as it arrives.
 */
export function keepLoadedDetail(listed: Trace[], previous: Trace[]): Trace[] {
  const loaded = new Map(previous.filter((t) => t.alerts !== undefined).map((t) => [t.id, t]));
  return listed.map((t) => loaded.get(t.id) ?? t);
}

/**
 * The selected trace as the latest poll has it. App keeps the selection as a copy taken when it
 * was clicked, so a trace scored or alerted after that kept its old status and scores in the
 * inspector. A poll's loaded copy of the same trace replaces it; a list entry (no detail) never
 * replaces a loaded selection.
 */
export function freshSelectedTrace(traces: Trace[], selected: Trace | undefined): Trace | undefined {
  if (!selected) return selected;
  return traces.find((t) => t.id === selected.id && t.alerts !== undefined) ?? selected;
}
