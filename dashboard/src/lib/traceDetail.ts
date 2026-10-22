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
