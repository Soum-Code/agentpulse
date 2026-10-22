/** The live evaluation timing line for the console, read from GET /v1/platform.
 *
 * A figure the API did not return is an em dash with the reason beside it. It is
 * never "0 ms": a missing measurement shown as zero reads as an instant
 * evaluator, which is the opposite of what an empty queue means.
 */

import type { PlatformHealth } from './api';

export interface TimingLine {
  /** What to show as the headline value. */
  value: string;
  /** Where the value came from, or why there is none. */
  caption: string;
}

export function liveEvaluationTiming(
  health: PlatformHealth | null,
  failed: boolean,
): TimingLine {
  if (failed) {
    return { value: '—', caption: 'No live figure: /v1/platform could not be read.' };
  }
  if (!health) {
    return { value: '—', caption: 'Reading /v1/platform…' };
  }
  const timing = health.evaluation_timing;
  const p50 = timing?.evaluation_ms?.p50;
  if (!timing || !timing.sample_size || p50 == null || !Number.isFinite(p50)) {
    return { value: '—', caption: 'No live figure: this instance has not evaluated a span yet.' };
  }
  const p95 = timing.evaluation_ms?.p95;
  const tail = p95 != null && Number.isFinite(p95) ? `, p95 ${Math.round(p95)} ms` : '';
  return {
    value: `${Math.round(p50)} ms median`,
    caption: `Live: time per span on the worker, over the last ${timing.sample_size} evaluated spans${tail}.`,
  };
}
