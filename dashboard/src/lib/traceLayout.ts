/**
 * Where a span's bar goes in the Traces timeline lanes (a pure function, so it can be tested).
 *
 * The lane is as wide as the trace's duration. When the trace has no duration there is no scale,
 * and when the span recorded no latency there is no length: those bars are a short marker, drawn
 * faded, so they show where a span starts and do not pretend to know how long it ran. (They were
 * `NaN%` wide before, because 0 / 0 is NaN.)
 */
export interface BarPlacement {
  leftPct: number;
  widthPct: number;
  /** False for a marker: the span or the trace has no recorded duration, so the width is not a measurement. */
  measured: boolean;
}

const MIN_WIDTH_PCT = 6;
const MAX_LEFT_PCT = 95;

export function barPlacement(
  startOffsetMs: number,
  spanMs: number | undefined,
  traceMs: number | undefined,
): BarPlacement {
  const hasScale = traceMs != null && Number.isFinite(traceMs) && traceMs > 0;
  const leftPct = hasScale ? Math.min((startOffsetMs / traceMs) * 100, MAX_LEFT_PCT) : 0;
  if (!hasScale || spanMs == null || !Number.isFinite(spanMs)) {
    return { leftPct, widthPct: MIN_WIDTH_PCT, measured: false };
  }
  return { leftPct, widthPct: Math.max((spanMs / traceMs) * 100, MIN_WIDTH_PCT), measured: true };
}
