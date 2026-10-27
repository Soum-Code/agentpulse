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
    expect(all.status).toEqual({ all: 3, ok: 1, warning: 1, error: 1, unknown: 0 });
    expect(all.duration).toMatchObject({ all: 3, fast: 1, slow: 1, unknown: 1 });
    expect(countTraces(list, 'a2').status.all).toBe(1);
  });
});

describe('traces with no recorded duration (durationMs undefined)', () => {
  // adapters.ts now leaves durationMs undefined instead of 0.
  const noDuration = (id: string, over: Partial<Trace> = {}) => trace(id, { durationMs: undefined, ...over });

  it('has no duration, matches only All, and is in no bracket', () => {
    const t = noDuration('x');
    expect(hasDuration(t)).toBe(false);
    expect(matchesDuration(t, 'all')).toBe(true);
    for (const p of ['fast', 'moderate', 'slow', 'long'] as const) expect(matchesDuration(t, p), p).toBe(false);
    expect(matchesDuration(t, 'custom', '', '')).toBe(false);
    expect(countTraces([t]).duration).toMatchObject({ all: 1, fast: 0, moderate: 0, slow: 0, long: 0, unknown: 1 });
  });

  it('sorts last in both directions, mixed with 0, and two of them by time without NaN', () => {
    const list = [
      noDuration('u-old', { timestamp: '2026-10-01T08:00:00Z' }),
      trace('zero', { durationMs: 0, timestamp: '2026-10-01T09:00:00Z' }),
      trace('slow', { durationMs: 3000, timestamp: '2026-10-01T10:00:00Z' }),
      noDuration('u-new', { timestamp: '2026-10-01T11:00:00Z' }),
      trace('fast', { durationMs: 100, timestamp: '2026-10-01T12:00:00Z' }),
    ];
    // Unknown ones (undefined and 0) after every measured one; among themselves newest first.
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'duration-desc' }))).toEqual(['slow', 'fast', 'u-new', 'zero', 'u-old']);
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'duration-asc' }))).toEqual(['fast', 'slow', 'u-new', 'zero', 'u-old']);
  });
});

describe('unknown status', () => {
  const list = [
    trace('ok1', { status: 'ok', timestamp: '2026-10-01T10:00:00Z' }),
    trace('unk1', { status: 'unknown', timestamp: '2026-10-01T11:00:00Z' }),
    trace('err1', { status: 'error', timestamp: '2026-10-01T09:00:00Z' }),
    trace('unk2', { status: 'unknown', timestamp: '2026-10-01T12:00:00Z' }),
    trace('warn1', { status: 'warning', timestamp: '2026-10-01T08:00:00Z' }),
  ];

  it('can be filtered for, and is not part of OK', () => {
    expect(ids(filterAndSortTraces(list, { ...base, status: 'unknown' }))).toEqual(['unk2', 'unk1']);
    expect(ids(filterAndSortTraces(list, { ...base, status: 'ok' }))).toEqual(['ok1']);
  });

  it('is counted on its own', () => {
    expect(countTraces(list).status).toEqual({ all: 5, ok: 1, warning: 1, error: 1, unknown: 2 });
  });

  it('comes after OK in status priority', () => {
    expect(ids(filterAndSortTraces(list, { ...base, sort: 'status-priority' }))).toEqual(['err1', 'warn1', 'ok1', 'unk2', 'unk1']);
  });

  it('is found by searching for the word', () => {
    expect(ids(filterAndSortTraces(list, { ...base, search: 'unknown' }))).toEqual(['unk2', 'unk1']);
  });
});

describe('multi-agent traces', () => {
  const multi = trace('m1', { agentId: 'planner', agentName: 'multi-agent (3)', agentIds: ['planner', 'retriever', 'answerer'] });
  const single = trace('s1', { agentId: 'retriever', agentName: 'retriever', agentIds: ['retriever'] });
  const entry = trace('e1', { agentId: 'svc', agentName: 'svc' });
  const list = [multi, single, entry];

  it('belongs to every agent that has a span in it, not only the first span\'s', () => {
    expect(ids(filterAndSortTraces(list, { ...base, agentId: 'retriever' }))).toEqual(['s1', 'm1']);
    expect(ids(filterAndSortTraces(list, { ...base, agentId: 'answerer' }))).toEqual(['m1']);
    expect(ids(filterAndSortTraces(list, { ...base, agentId: 'planner' }))).toEqual(['m1']);
    expect(countTraces(list, 'retriever').status.all).toBe(2);
  });

  it('still matches a list entry by its service name', () => {
    expect(ids(filterAndSortTraces(list, { ...base, agentId: 'svc' }))).toEqual(['e1']);
  });

  it('is found by searching for any of its agents', () => {
    expect(ids(filterAndSortTraces(list, { ...base, search: 'answerer' }))).toEqual(['m1']);
  });
});
