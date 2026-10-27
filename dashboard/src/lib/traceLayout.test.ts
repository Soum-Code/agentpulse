import { describe, expect, it } from 'vitest';
import { barPlacement } from './traceLayout';

describe('barPlacement', () => {
  it('scales a bar to the trace when the span and the trace both have a duration', () => {
    expect(barPlacement(250, 500, 1000)).toEqual({ leftPct: 25, widthPct: 50, measured: true });
  });

  it('keeps the bar inside the lane and at least 6% wide, as before', () => {
    expect(barPlacement(990, 5, 1000)).toEqual({ leftPct: 95, widthPct: 6, measured: true });
  });

  it('draws a faded marker, with no NaN, when the span recorded no latency', () => {
    const bar = barPlacement(250, undefined, 1000);
    expect(bar).toEqual({ leftPct: 25, widthPct: 6, measured: false });
  });

  it('draws markers at the left edge, with no NaN or Infinity, when the trace has no duration', () => {
    for (const traceMs of [undefined, 0, NaN]) {
      const bar = barPlacement(250, 40, traceMs);
      expect(bar, String(traceMs)).toEqual({ leftPct: 0, widthPct: 6, measured: false });
    }
  });

  it('treats a span latency of 0 as measured', () => {
    expect(barPlacement(0, 0, 1000)).toEqual({ leftPct: 0, widthPct: 6, measured: true });
  });
});
