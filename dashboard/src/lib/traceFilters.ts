/**
 * Filtering, searching and sorting of the trace list: pure functions, so the rules can be tested
 * and explained apart from the view that shows them (TracesView.tsx).
 *
 * The owner's design offers filters by status, by duration range and six sort orders. What was
 * changed from the owner's version is how a missing value is treated: a trace whose duration or
 * token count was never recorded is not a fast trace or a zero-token trace, so it never matches a
 * duration bracket and sorts after every measured one.
 */
import type { Trace, TraceStatus } from '../types';
import { parseDateTimeToMs } from '../utils/dateUtils';
import { TRACE_STATUS_RANK } from './traceStatus';

// 'unknown' is a status of its own (a trace whose spans and alerts are not loaded yet), so it can
// be filtered for and counted, and it is never folded into 'ok'.
export type TraceStatusFilter = 'all' | TraceStatus;
export type TraceDurationPreset = 'all' | 'fast' | 'moderate' | 'slow' | 'long' | 'custom';
export type TraceSortOption =
  | 'timestamp-desc'
  | 'timestamp-asc'
  | 'duration-desc'
  | 'duration-asc'
  | 'status-priority'
  | 'tokens-desc';

/** The duration brackets offered in the filter menu (labels are the owner's). */
export const TRACE_DURATION_PRESETS: {
  id: TraceDurationPreset;
  label: string;
  badge: string;
  sublabel: string;
}[] = [
  { id: 'all', label: 'All Durations', badge: 'Any', sublabel: 'No latency bounds' },
  { id: 'fast', label: 'Fast (< 500ms)', badge: '< 500ms', sublabel: 'Sub-half second' },
  { id: 'moderate', label: 'Normal (500ms – 1,500ms)', badge: '500–1500ms', sublabel: 'Standard execution' },
  { id: 'slow', label: 'Elevated (1,500ms – 3,000ms)', badge: '1.5–3.0s', sublabel: 'Potential lag' },
  { id: 'long', label: 'Critical (> 3,000ms)', badge: '> 3.0s', sublabel: 'Bottlenecks & slow runs' },
];

/** The sort orders offered in the menus (labels are the owner's). */
export const TRACE_SORT_OPTIONS: {
  id: TraceSortOption;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  { id: 'timestamp-desc', label: 'Newest First (Time ↓)', shortLabel: 'Newest First', description: 'Reverse-chronological order' },
  { id: 'timestamp-asc', label: 'Oldest First (Time ↑)', shortLabel: 'Oldest First', description: 'Chronological order' },
  { id: 'duration-desc', label: 'Longest Duration (Latency ↓)', shortLabel: 'Duration (High → Low)', description: 'Triage slowest executions first' },
  { id: 'duration-asc', label: 'Shortest Duration (Latency ↑)', shortLabel: 'Duration (Low → High)', description: 'Fastest executions first' },
  { id: 'status-priority', label: 'Status Priority (Error → Warning → OK)', shortLabel: 'Status Priority', description: 'Triage failed traces immediately' },
  { id: 'tokens-desc', label: 'Total Tokens (Usage ↓)', shortLabel: 'Tokens (High → Low)', description: 'Largest token consumption' },
];

export interface TraceFilterState {
  /** Only this agent's traces (set when the reader came from the Agents tab). */
  agentId?: string;
  status: TraceStatusFilter;
  durationPreset: TraceDurationPreset;
  /** The custom bounds are text because they come from input fields; blank means "no bound". */
  customMinDuration: string;
  customMaxDuration: string;
  search: string;
  sort: TraceSortOption;
}

/**
 * Whether the trace has a recorded duration. adapters.ts leaves durationMs undefined for a trace
 * with neither end_time nor a span latency. 0 and NaN also count as unknown (a real trace is
 * never 0 ms), which keeps the rule true for a trace built by hand or by an older caller.
 */
export function hasDuration(t: Trace): boolean {
  return t.durationMs != null && Number.isFinite(t.durationMs) && t.durationMs > 0;
}

/** Whether the agent has a span in the trace. A multi-agent trace belongs to each of its agents,
 *  not only to the first span's; before the spans load, agentId (the service name) is all there is. */
function hasAgent(t: Trace, agentId: string): boolean {
  return t.agentIds ? t.agentIds.includes(agentId) : t.agentId === agentId;
}

/** True when the trace falls in the chosen duration bracket. Unknown durations match only 'all'. */
export function matchesDuration(
  t: Trace,
  preset: TraceDurationPreset,
  customMin = '',
  customMax = '',
): boolean {
  if (preset === 'all') return true;
  if (!hasDuration(t)) return false;
  const d = t.durationMs;
  switch (preset) {
    case 'fast':
      return d < 500;
    case 'moderate':
      return d >= 500 && d <= 1500;
    case 'slow':
      return d > 1500 && d <= 3000;
    case 'long':
      return d > 3000;
    case 'custom': {
      // A blank or non-numeric bound is ignored rather than read as 0.
      const min = customMin.trim() !== '' ? parseFloat(customMin) : NaN;
      const max = customMax.trim() !== '' ? parseFloat(customMax) : NaN;
      if (!Number.isNaN(min) && d < min) return false;
      if (!Number.isNaN(max) && d > max) return false;
      return true;
    }
  }
}

/** Case-insensitive match of the search text against id, agent, status, input and tags. */
function matchesSearch(t: Trace, search: string): boolean {
  const q = search.toLowerCase().trim();
  if (q === '') return true;
  return (
    t.id.toLowerCase().includes(q) ||
    t.agentName.toLowerCase().includes(q) ||
    t.agentId.toLowerCase().includes(q) ||
    (t.agentIds ?? []).some((id) => id.toLowerCase().includes(q)) ||
    t.status.toLowerCase().includes(q) ||
    t.inputPreview.toLowerCase().includes(q) ||
    (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
  );
}

/** Newest first, ties broken by id so the order is stable between refreshes. */
const newestFirst = (a: Trace, b: Trace): number => {
  const ta = parseDateTimeToMs(a.timestamp);
  const tb = parseDateTimeToMs(b.timestamp);
  return ta !== tb ? tb - ta : b.id.localeCompare(a.id);
};

/** Applies every filter, then the sort order. Returns a new array. */
export function filterAndSortTraces(traces: Trace[], f: TraceFilterState): Trace[] {
  const list = traces.filter(
    (t) =>
      (!f.agentId || hasAgent(t, f.agentId)) &&
      (f.status === 'all' || t.status === f.status) &&
      matchesDuration(t, f.durationPreset, f.customMinDuration, f.customMaxDuration) &&
      matchesSearch(t, f.search),
  );

  // Status priority puts errors first, then warnings, then ok, then unknown (TRACE_STATUS_RANK).
  const rank: Record<string, number> = TRACE_STATUS_RANK;
  return list.sort((a, b) => {
    switch (f.sort) {
      case 'duration-desc':
      case 'duration-asc': {
        // A trace with no recorded duration goes last in either direction, and two of them
        // are ordered by time (comparing two undefined durations would give NaN).
        if (hasDuration(a) !== hasDuration(b)) return hasDuration(a) ? -1 : 1;
        if (hasDuration(a) && a.durationMs !== b.durationMs) {
          return f.sort === 'duration-desc' ? b.durationMs! - a.durationMs! : a.durationMs! - b.durationMs!;
        }
        return newestFirst(a, b);
      }
      case 'tokens-desc': {
        const ta = a.totalTokens;
        const tb = b.totalTokens;
        if ((ta === undefined) !== (tb === undefined)) return ta === undefined ? 1 : -1;
        if (ta !== undefined && tb !== undefined && ta !== tb) return tb - ta;
        return newestFirst(a, b);
      }
      case 'status-priority': {
        const pa = rank[a.status] ?? 3;
        const pb = rank[b.status] ?? 3;
        return pa !== pb ? pa - pb : newestFirst(a, b);
      }
      case 'timestamp-asc':
        return -newestFirst(a, b);
      default:
        return newestFirst(a, b);
    }
  });
}

export interface TraceCounts {
  status: { all: number; ok: number; warning: number; error: number; unknown: number };
  duration: { all: number; fast: number; moderate: number; slow: number; long: number; unknown: number };
}

/** How many traces each status and duration bracket holds, within one agent's scope if given. */
export function countTraces(traces: Trace[], agentId?: string): TraceCounts {
  const scope = traces.filter((t) => !agentId || hasAgent(t, agentId));
  const inBracket = (p: TraceDurationPreset) => scope.filter((t) => matchesDuration(t, p)).length;
  return {
    status: {
      all: scope.length,
      ok: scope.filter((t) => t.status === 'ok').length,
      warning: scope.filter((t) => t.status === 'warning').length,
      error: scope.filter((t) => t.status === 'error').length,
      unknown: scope.filter((t) => t.status === 'unknown').length,
    },
    duration: {
      all: scope.length,
      fast: inBracket('fast'),
      moderate: inBracket('moderate'),
      slow: inBracket('slow'),
      long: inBracket('long'),
      unknown: scope.filter((t) => !hasDuration(t)).length,
    },
  };
}
