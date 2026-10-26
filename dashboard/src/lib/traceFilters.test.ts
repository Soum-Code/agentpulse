import { describe, it, expect } from 'vitest';
import type { Trace } from '../types';
import {
  TraceFilterState,
  countTraces,
  filterAndSortTraces,
  hasDuration,
  matchesDuration,
} from './traceFilters';

// A trace with only the fields the filters read; the rest is filler.
function trace(id: string, over: Partial<Trace> = {}): Trace {
  return {
    id,
    agentId: 'a1',
    agentName: 'Agent One',
    rootSpanId: 's',
    status: 'ok',
    durationMs: 800,
    timestamp: '2026-10-01T10:00:00Z',
    inputPreview: 'hello',
    outputPreview: '',
    spans: [],
    ...over,
  };
}

const base: TraceFilterState = {
  status: 'all',
  durationPreset: 'all',
  customMinDuration: '',
  customMaxDuration: '',
  search: '',
  sort: 'timestamp-desc',
};
const ids = (l: Trace[]) => l.map((t) => t.id);

describe('duration', () => {
  it('treats 0 ms as unknown and never as a fast trace', () => {
    expect(hasDuration(trace('x', { durationMs: 0 }))).toBe(false);
    expect(matchesDuration(trace('x', { durationMs: 0 }), 'fast')).toBe(false);
    expect(matchesDuration(trace('x', { durationMs: 0 }), 'all')).toBe(true);
    expect(matchesDuration(trace('x', { durationMs: NaN }), 'fast')).toBe(false);
  });

  it('puts each measured duration in exactly one bracket, boundaries included', () => {
    const at = (d: number) => (['fast', 'moderate', 'slow', 'long'] as const).filter((p) => matchesDuration(trace('x', { durationMs: d }), p));
    expect(at(499)).toEqual(['fast']);
    expect(at(500)).toEqual(['moderate']);
    expect(at(1500)).toEqual(['moderate']);
    expect(at(1501)).toEqual(['slow']);
    expect(at(3000)).toEqual(['slow']);
    expect(at(3001)).toEqual(['long']);
  });

  it('custom bounds ignore a blank or non-numeric side instead of reading it as 0', () => {
    const t = trace('x', { durationMs: 900 });
    expect(matchesDuration(t, 'custom', '', '')).toBe(true);
    expect(matchesDuration(t, 'custom', '1000', '')).toBe(false);
    expect(matchesDuration(t, 'custom', '', '800')).toBe(false);
    expect(matchesDuration(t, 'custom', 'abc', '1000')).toBe(true);
    expect(matchesDuration(t, 'custom', '800', '1000')).toBe(true);
  });
});

describe('filterAndSortTraces', () => {
  const list = [
    trace('t1', { status: 'ok', durationMs: 300, totalTokens: 50, timestamp: '2026-10-01T10:00:00Z' }),
    trace('t2', { status: 'error', durationMs: 4000, totalTokens: 900, timestamp: '2026-10-01T11:00:00Z', agentId: 'a2', agentName: 'Agent Two' }),
    trace('t3', { status: 'warning', durationMs: 0, timestamp: '2026-10-01T12:00:00Z', inputPreview: 'Find the capital' }),
    trace('t4', { status: 'ok', durationMs: 1000, totalTokens: 200, timestamp: '2026-10-01T09:00:00Z', tags: ['Billing'] }),
  ];

  it('defaults to newest first', () => {
    expect(ids(filterAndSortTraces(list, base))).toEqual(['t3', 't2', 't1', 't4']);
  });

  it('does not mutate its input', () => {
    const copy = list.slice();
    filterAndSortTraces(list, { ...base, sort: 'duration-asc' });
    expect(list).toEqual(copy);
  });

  it('filters by agent, status, duration and search together', () => {
    expect(ids(filterAndSortTraces(list, { ...base, agentId: 'a2' }))).toEqual(['t2']);
    expect(ids(filterAndSortTraces(list, { ...base, status: 'ok' }))).toEqual(['t1', 't4']);
    expect(ids(filterAndSortTraces(list, { ...base, durationPreset: 'fast' }))).toEqual(['t1']);
    expect(ids(filterAndSortTraces(list, { ...base, search: 'capital' }))).toEqual(['t3']);
    expect(ids(filterAndSortTraces(list, { ...base, search: 'BILLING' }))).toEqual(['t4']);
    expect(ids(filterAndSortTraces(list, { ...base, status: 'ok', durationPreset: 'moderate' }))).toEqual(['t4']);
  });

  it('a trace with no recorded duration is in no bracket, so the filtered list drops it', () => {
    for (const p of ['fast', 'moderate', 'slow', 'long'] as const) {
      expect(ids(filterAndSortTraces(list, { ...base, durationPreset: p }))).not.toContain('t3');
    }
  });

  it('sorts by duration with unknown durations last in both directions', () => {
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'duration-desc' }))).toEqual(['t2', 't4', 't1', 't3']);
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'duration-asc' }))).toEqual(['t1', 't4', 't2', 't3']);
  });

  it('sorts by tokens with unrecorded tokens last, not as zero', () => {
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'tokens-desc' }))).toEqual(['t2', 't4', 't1', 't3']);
  });

  it('sorts status priority error, warning, ok, newest first inside a rank', () => {
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'status-priority' }))).toEqual(['t2', 't3', 't1', 't4']);
  });

  it('sorts oldest first', () => {
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'timestamp-asc' }))).toEqual(['t4', 't1', 't2', 't3']);
  });
});

describe('countTraces', () => {
  it('counts per status and per bracket and reports how many have no duration', () => {
    const list = [
      trace('a', { durationMs: 100 }),
      trace('b', { durationMs: 0, status: 'error' }),
      trace('c', { durationMs: 2000, agentId: 'a2', status: 'warning' }),
    ];
    const all = countTraces(list);
    expect(all.status).toEqual({ all: 3, ok: 1, warning: 1, error: 1 });
    expect(all.duration).toMatchObject({ all: 3, fast: 1, slow: 1, unknown: 1 });
    expect(countTraces(list, 'a2').status.all).toBe(1);
  });
});
