/**
 * Trace Workspace derivation layer.
 *
 * Every value produced here is computed from fields that
 * `GET /v1/traces/{trace_id}` actually returns. Nothing is synthesised: if
 * the data needed for a derivation is absent, the derivation returns null or
 * an explicitly "unavailable" shape rather than a plausible-looking number.
 *
 * This module is deliberately free of React so the rules that decide what an
 * engineer is shown stay testable and stay in one place.
 */

import type { SpanDetail } from './api';

/* ─── Execution order ──────────────────────────────────────────────────
   The backend returns spans ordered by start_time. Several spans routinely
   share a timestamp (the SDK stamps a batch together), and span_id is random
   hex, so any re-sort that falls back to span_id reorders siblings
   arbitrarily. We therefore tie-break on the index the backend gave us —
   explicitly, rather than relying on Array.prototype.sort stability. */

export function toExecutionOrder(spans: SpanDetail[]): SpanDetail[] {
  return spans
    .map((span, index) => ({ span, index }))
    .sort((a, b) => {
      const ta = parseTime(a.span.start_time);
      const tb = parseTime(b.span.start_time);
      if (ta !== null && tb !== null && ta !== tb) return ta - tb;
      if (ta === null && tb !== null) return 1;
      if (ta !== null && tb === null) return -1;
      return a.index - b.index;
    })
    .map((entry) => entry.span);
}

/** Epoch milliseconds, or null when the value is absent or unparseable. */
export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/* ─── Hierarchy ────────────────────────────────────────────────────────── */

export interface SpanNode {
  span: SpanDetail;
  depth: number;
  children: SpanNode[];
  /** True when this span's parent_span_id points outside the returned set. */
  detached: boolean;
}

const NULL_PARENT = '0000000000000000';

/**
 * Builds the parent/child tree. Spans whose parent is missing from the
 * response are surfaced as detached roots rather than dropped — a partial
 * trace is a fact about the data, not something to hide.
 */
export function buildTree(spans: SpanDetail[]): SpanNode[] {
  const ordered = toExecutionOrder(spans);
  const present = new Set(ordered.map((s) => s.span_id));
  const childrenOf = new Map<string, SpanDetail[]>();
  const roots: { span: SpanDetail; detached: boolean }[] = [];

  for (const span of ordered) {
    const parent = span.parent_span_id;
    const hasParent = Boolean(parent) && parent !== NULL_PARENT;
    if (!hasParent) {
      roots.push({ span, detached: false });
    } else if (!present.has(parent as string)) {
      roots.push({ span, detached: true });
    } else {
      const siblings = childrenOf.get(parent as string) ?? [];
      siblings.push(span);
      childrenOf.set(parent as string, siblings);
    }
  }

  // Guards against a self- or mutually-referencing parent chain, which would
  // otherwise recurse until the stack gives out.
  const visited = new Set<string>();

  function attach(span: SpanDetail, depth: number, detached: boolean): SpanNode {
    visited.add(span.span_id);
    const children = (childrenOf.get(span.span_id) ?? [])
      .filter((child) => !visited.has(child.span_id))
      .map((child) => attach(child, depth + 1, false));
    return { span, depth, children, detached };
  }

  return roots.map((root) => attach(root.span, 0, root.detached));
}

/** Depth-first walk honouring a set of collapsed span ids. */
export function flattenTree(nodes: SpanNode[], collapsed: ReadonlySet<string>): SpanNode[] {
  const out: SpanNode[] = [];
  const walk = (node: SpanNode) => {
    out.push(node);
    if (!collapsed.has(node.span.span_id)) node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/* ─── Timeline ─────────────────────────────────────────────────────────
   A waterfall is only meaningful against real clock values. When no span
   carries a usable start_time the timeline reports basis 'none' and the UI
   omits the bars entirely. The alternative — laying spans end to end by
   summed latency — invents an ordering the data does not support. */

export interface Timeline {
  basis: 'wall-clock' | 'none';
  /** Epoch ms of the earliest span start. Meaningless when basis is 'none'. */
  t0: number;
  /** Wall-clock width of the trace in ms. At least 1 to stay divisible. */
  windowMs: number;
}

export function computeTimeline(spans: SpanDetail[]): Timeline {
  let t0 = Infinity;
  let end = -Infinity;

  for (const span of spans) {
    const start = parseTime(span.start_time);
    if (start === null) continue;
    t0 = Math.min(t0, start);
    end = Math.max(end, start + (span.latency_ms ?? 0));
  }

  if (!Number.isFinite(t0)) return { basis: 'none', t0: 0, windowMs: 1 };
  return { basis: 'wall-clock', t0, windowMs: Math.max(end - t0, 1) };
}

export interface SpanBar {
  /** Left edge as a percentage of the trace window. */
  leftPct: number;
  /** Width as a percentage of the trace window, before any minimum. */
  widthPct: number;
}

/**
 * Bar geometry for one span, or null when the span lacks the timestamp or
 * latency needed to place it. Callers render an explicit "no timing" marker
 * in that case rather than a zero-width bar that reads as instantaneous.
 */
export function computeBar(span: SpanDetail, timeline: Timeline): SpanBar | null {
  if (timeline.basis === 'none') return null;
  const start = parseTime(span.start_time);
  if (start === null || span.latency_ms === null || span.latency_ms === undefined) return null;

  const leftPct = clampPct(((start - timeline.t0) / timeline.windowMs) * 100);
  const rawWidth = (span.latency_ms / timeline.windowMs) * 100;
  return { leftPct, widthPct: clampPct(rawWidth, 100 - leftPct) };
}

function clampPct(value: number, max = 100): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

/* ─── Where behaviour changed ──────────────────────────────────────────
   The workspace's central question is "where did this trace turn". We answer
   it arithmetically: the largest rise in evaluated risk between two
   consecutively evaluated spans.

   This is an observation about recorded scores, not a causal claim. Spans
   without an evaluation are skipped rather than treated as zero — absent is
   not the same as safe. */

export interface RiskShift {
  fromSpanId: string;
  toSpanId: string;
  from: number;
  to: number;
  delta: number;
}

/** Rises smaller than this are ordinary variation, not a turn worth flagging. */
export const RISK_SHIFT_MIN_DELTA = 0.15;

export function findRiskShifts(orderedSpans: SpanDetail[]): RiskShift[] {
  const evaluated = orderedSpans.filter(
    (s) => typeof s.evaluation?.overall_risk_score === 'number',
  );
  const shifts: RiskShift[] = [];

  for (let i = 1; i < evaluated.length; i++) {
    const prev = evaluated[i - 1];
    const curr = evaluated[i];
    const from = prev.evaluation!.overall_risk_score as number;
    const to = curr.evaluation!.overall_risk_score as number;
    const delta = to - from;
    if (delta >= RISK_SHIFT_MIN_DELTA) {
      shifts.push({ fromSpanId: prev.span_id, toSpanId: curr.span_id, from, to, delta });
    }
  }

  return shifts.sort((a, b) => b.delta - a.delta);
}

/* ─── Why a span is worth opening ──────────────────────────────────────── */

export type SpanFlag = 'error' | 'risk-peak' | 'risk-shift' | 'slowest';

export const FLAG_LABEL: Record<SpanFlag, string> = {
  error: 'Failed',
  'risk-peak': 'Highest evaluated risk',
  'risk-shift': 'Risk rose here',
  slowest: 'Longest span',
};

export interface TraceFindings {
  /** Flags per span id. Only spans with at least one flag appear. */
  flags: Map<string, SpanFlag[]>;
  /** Largest qualifying risk rise, or null when fewer than two spans were evaluated. */
  primaryShift: RiskShift | null;
  riskPeakSpanId: string | null;
  slowestSpanId: string | null;
  errorSpanIds: string[];
  evaluatedCount: number;
}

export function analyseTrace(orderedSpans: SpanDetail[]): TraceFindings {
  const flags = new Map<string, SpanFlag[]>();
  const add = (spanId: string, flag: SpanFlag) => {
    const list = flags.get(spanId) ?? [];
    if (!list.includes(flag)) list.push(flag);
    flags.set(spanId, list);
  };

  const errorSpanIds = orderedSpans.filter(isFailed).map((s) => s.span_id);
  errorSpanIds.forEach((id) => add(id, 'error'));

  let riskPeakSpanId: string | null = null;
  let peak = -Infinity;
  let evaluatedCount = 0;
  for (const span of orderedSpans) {
    const score = span.evaluation?.overall_risk_score;
    if (typeof score !== 'number') continue;
    evaluatedCount++;
    if (score > peak) {
      peak = score;
      riskPeakSpanId = span.span_id;
    }
  }
  // A peak of zero risk is not a finding; every span is equally clean.
  if (riskPeakSpanId && peak > 0) add(riskPeakSpanId, 'risk-peak');
  else riskPeakSpanId = null;

  // "Longest" only means something when there is something to be longer than.
  const timed = orderedSpans.filter((s) => typeof s.latency_ms === 'number');
  let slowestSpanId: string | null = null;
  if (timed.length > 1) {
    slowestSpanId = timed.reduce((a, b) =>
      (b.latency_ms as number) > (a.latency_ms as number) ? b : a,
    ).span_id;
    add(slowestSpanId, 'slowest');
  }

  const shifts = findRiskShifts(orderedSpans);
  const primaryShift = shifts[0] ?? null;
  if (primaryShift) add(primaryShift.toSpanId, 'risk-shift');

  return { flags, primaryShift, riskPeakSpanId, slowestSpanId, errorSpanIds, evaluatedCount };
}

export function isFailed(span: SpanDetail): boolean {
  const status = (span.status || '').toLowerCase();
  return Boolean(span.error_message) || (status !== '' && status !== 'success' && status !== 'ok');
}

/* ─── Progressive disclosure ───────────────────────────────────────────
   Signal view shows flagged spans plus every ancestor needed to keep the
   hierarchy readable — hiding a parent would misrepresent the shape of the
   execution. The count of what is withheld is always reported, so the view
   narrows attention without concealing that it has done so. */

export function signalSpanIds(nodes: SpanNode[], flags: Map<string, SpanFlag[]>): Set<string> {
  const keep = new Set<string>();

  const walk = (node: SpanNode, ancestors: string[]): boolean => {
    const selfMatches = flags.has(node.span.span_id);
    let branchMatches = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.span.span_id])) branchMatches = true;
    }
    if (selfMatches || branchMatches) {
      keep.add(node.span.span_id);
      ancestors.forEach((id) => keep.add(id));
      return true;
    }
    return false;
  };

  nodes.forEach((node) => walk(node, []));
  // With no findings at all, a signal view would be empty and useless; fall
  // back to the roots so the trace still has a visible shape.
  if (keep.size === 0) nodes.forEach((node) => keep.add(node.span.span_id));
  return keep;
}

/* ─── Evaluator maturity ───────────────────────────────────────────────
   Published capability tiers. Shown next to every evaluator result so an
   experimental signal is never read as a production-certified verdict. */

export type MaturityTier = 'Beta' | 'Experimental';

export const EVALUATOR_MATURITY: Record<'grounding' | 'tool_claim', {
  label: string;
  tier: MaturityTier;
  note: string;
}> = {
  grounding: {
    label: 'Grounding',
    tier: 'Beta',
    note: 'NLI cascade over retrieved premises.',
  },
  tool_claim: {
    label: 'Tool-claim',
    tier: 'Experimental',
    note: 'Deterministic claim matching. Extracts nothing from agents that do not narrate tool use.',
  },
};

/* ─── Field availability ───────────────────────────────────────────────
   The trace endpoint returns a fixed span projection. Several fields the
   database holds are not part of it. Rather than rendering a permanent
   em dash and leaving the engineer to guess whether the value is missing or
   simply not sent, the inspector states which of the two it is. */

export type Availability =
  | { state: 'present' }
  | { state: 'empty' }
  | { state: 'not-exposed'; reason: string };

export function availability(value: unknown): Availability {
  if (value === null || value === undefined || value === '') return { state: 'empty' };
  return { state: 'present' };
}

/** Fields the span projection in `GET /v1/traces/{trace_id}` does not include. */
export const NOT_EXPOSED = {
  payload:
    'The trace endpoint returns no raw input or output fields for spans. Payload capture is opt-in via AGENTPULSE_CAPTURE_INPUTS; this view does not receive that setting and does not infer it.',
  toolDetail:
    'Tool arguments and result summaries are stored on the span but are not part of this endpoint’s response.',
} as const;

/* ─── Formatting ───────────────────────────────────────────────────────── */

export const DASH = '—';

export function formatMs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return DASH;
  if (ms >= 60_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = (ms % 60_000) / 1000;
    return `${minutes}m ${seconds.toFixed(1)}s`;
  }
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(1)}ms`;
}

export function formatClock(value: string | null | undefined): string {
  const ms = parseTime(value);
  if (ms === null) return DASH;
  return new Date(ms).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTimestamp(value: string | null | undefined): string {
  const ms = parseTime(value);
  if (ms === null) return DASH;
  return new Date(ms).toLocaleString();
}

/** Offset from trace start, e.g. "+124.0ms". */
export function formatOffset(span: SpanDetail, timeline: Timeline): string {
  if (timeline.basis === 'none') return DASH;
  const start = parseTime(span.start_time);
  if (start === null) return DASH;
  return `+${formatMs(start - timeline.t0)}`;
}

/** Short, human-readable span identity. Falls back through the fields the
 *  projection actually carries rather than inventing a display name. */
export function spanTitle(span: SpanDetail): string {
  if (span.tool_name) return span.tool_name;
  if (span.event_type) return span.event_type.replace(/_/g, ' ');
  if (span.span_kind) return span.span_kind.toLowerCase();
  return span.span_id.slice(0, 12);
}

export type SpanCategory = 'tool' | 'model' | 'agent';

export function spanCategory(span: SpanDetail): SpanCategory {
  if (span.tool_name || (span.span_kind || '').toUpperCase() === 'TOOL') return 'tool';
  if (span.model || span.event_type === 'llm_generation') return 'model';
  return 'agent';
}
