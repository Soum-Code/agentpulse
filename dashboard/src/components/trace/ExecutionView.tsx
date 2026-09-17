import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownRight, Route, TrendingUp } from 'lucide-react';
import type { SpanDetail } from '../../lib/api';
import {
  buildTree,
  flattenTree,
  formatMs,
  signalSpanIds,
  type SpanFlag,
  type Timeline,
  type TraceFindings,
} from '../../lib/trace';
import { EmptyState, Skeleton, cx } from '../ui';
import { SpanRow } from './SpanRow';

type Mode = 'signal' | 'all';

/**
 * The execution view — the centre of the workspace.
 *
 * It opens narrowed to what the trace's own evaluations flag as worth
 * attention, with the count of everything withheld stated on screen and one
 * click away. Progressive disclosure has to be reversible and visible, or it
 * is just hiding data.
 */
export function ExecutionView({
  spans,
  timeline,
  findings,
  selectedSpanId,
  onSelectSpan,
  focusAgentId,
  isLoading,
  error,
  onRetry,
  hasTrace,
}: {
  spans: SpanDetail[];
  timeline: Timeline;
  findings: TraceFindings | null;
  selectedSpanId: string | null;
  onSelectSpan: (span: SpanDetail) => void;
  focusAgentId: string | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  hasTrace: boolean;
}) {
  const [mode, setMode] = useState<Mode>('signal');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const tree = useMemo(() => buildTree(spans), [spans]);
  // Memoised so an absent `findings` does not hand a fresh Map to the
  // dependency arrays below on every render.
  const flags = useMemo(() => findings?.flags ?? new Map<string, SpanFlag[]>(), [findings]);

  const signalIds = useMemo(() => signalSpanIds(tree, flags), [tree, flags]);

  const rows = useMemo(() => {
    const flat = flattenTree(tree, collapsed);
    return mode === 'all' ? flat : flat.filter((n) => signalIds.has(n.span.span_id));
  }, [tree, collapsed, mode, signalIds]);

  const allRowCount = useMemo(() => flattenTree(tree, new Set<string>()).length, [tree]);
  const hiddenCount = mode === 'signal' ? Math.max(0, spans.length - signalIds.size) : 0;

  // Keep keyboard focus on a row that still exists after a mode or collapse
  // change, otherwise arrow keys would land nowhere.
  useEffect(() => {
    if (focusedId && !rows.some((r) => r.span.span_id === focusedId)) {
      setFocusedId(rows[0]?.span.span_id ?? null);
    }
  }, [rows, focusedId]);

  const activeId = focusedId ?? selectedSpanId ?? rows[0]?.span.span_id ?? null;

  const moveFocus = useCallback(
    (nextId: string | null) => {
      if (!nextId) return;
      setFocusedId(nextId);
      rowRefs.current.get(nextId)?.focus();
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return;
    const index = rows.findIndex((r) => r.span.span_id === activeId);
    const current = index >= 0 ? rows[index] : null;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(rows[Math.min(rows.length - 1, index + 1)]?.span.span_id ?? null);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(rows[Math.max(0, index - 1)]?.span.span_id ?? null);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(rows[0].span.span_id);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(rows[rows.length - 1].span.span_id);
        break;
      case 'ArrowRight':
        if (current?.children.length && collapsed.has(current.span.span_id)) {
          e.preventDefault();
          toggle(current.span.span_id);
        } else if (current?.children.length) {
          e.preventDefault();
          moveFocus(rows[index + 1]?.span.span_id ?? null);
        }
        break;
      case 'ArrowLeft':
        if (current?.children.length && !collapsed.has(current.span.span_id)) {
          e.preventDefault();
          toggle(current.span.span_id);
        } else if (current) {
          e.preventDefault();
          const parent = [...rows.slice(0, index)].reverse().find((r) => r.depth < current.depth);
          moveFocus(parent?.span.span_id ?? null);
        }
        break;
      default:
        break;
    }
  };

  const toggle = (spanId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });

  const jumpToShift = () => {
    const target = findings?.primaryShift?.toSpanId;
    if (!target) return;
    const span = spans.find((s) => s.span_id === target);
    if (!span) return;
    if (mode === 'signal' && !signalIds.has(target)) setMode('all');
    onSelectSpan(span);
    setFocusedId(target);
    requestAnimationFrame(() => {
      rowRefs.current.get(target)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Execution">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[13px] font-semibold text-ink">Execution</h2>
          <span className="font-mono text-[11px] tnum text-ink-faint">
            {rows.length}
            {mode === 'signal' && allRowCount !== rows.length && ` of ${allRowCount}`} shown
          </span>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Detail level">
          {(
            [
              ['signal', 'Signal'],
              ['all', 'All spans'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={cx(
                'rounded px-2 py-1 text-[11px] transition-colors',
                mode === id
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-faint hover:bg-surface-3/60 hover:text-ink-dim',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Where behaviour changed — derived from consecutive evaluated spans. */}
      {findings?.primaryShift && !isLoading && !error && (
        <button
          onClick={jumpToShift}
          className="flex w-full items-center gap-2.5 border-b border-line bg-state-warn/[0.05] px-4 py-2 text-left transition-colors hover:bg-state-warn/[0.09]"
        >
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-state-warn" aria-hidden="true" />
          <span className="text-[12px] text-ink-dim">
            Evaluated risk rose{' '}
            <span className="font-mono tnum text-state-warn">
              {findings.primaryShift.from.toFixed(2)} → {findings.primaryShift.to.toFixed(2)}
            </span>{' '}
            between consecutive evaluated spans
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />
            Go to span
          </span>
        </button>
      )}

      {/* Time axis. Rendered only when the spans carry real clock values. */}
      {timeline.basis === 'wall-clock' && rows.length > 0 && !isLoading && !error && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(104px,26%)] gap-4 border-b border-line px-3 py-1.5 pr-3">
          <span className="text-[10px] text-ink-faint">Span</span>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 justify-between font-mono text-[10px] tnum text-ink-faint">
              <span>0</span>
              <span>{formatMs(timeline.windowMs / 2)}</span>
              <span>{formatMs(timeline.windowMs)}</span>
            </div>
            <span className="w-16 shrink-0 text-right text-[10px] text-ink-faint">dur</span>
            <span className="w-10 shrink-0 text-right text-[10px] text-ink-faint">risk</span>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-ink-dim">Unable to load this trace</p>
            <p className="mx-auto mt-1 max-w-md font-mono text-[11px] text-ink-faint">{error}</p>
            <button
              onClick={onRetry}
              className="mt-4 rounded border border-line-strong bg-surface-2 px-3 py-1.5 text-xs text-ink transition-colors hover:border-signal/40 hover:bg-surface-3"
            >
              Try again
            </button>
          </div>
        ) : !hasTrace ? (
          <EmptyState
            icon={<Route className="h-7 w-7" />}
            title="No traces yet"
            hint="Connect an agent or run a controlled pipeline to create the first trace."
          />
        ) : spans.length === 0 ? (
          <EmptyState
            icon={<Route className="h-7 w-7" />}
            title="This trace has no spans"
            hint="The trace record exists but no spans were returned for it."
          />
        ) : (
          <>
            <div role="tree" aria-label="Span hierarchy" onKeyDown={onKeyDown}>
              {rows.map((node) => {
                const id = node.span.span_id;
                return (
                  <SpanRow
                    key={id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(id, el);
                      else rowRefs.current.delete(id);
                    }}
                    span={node.span}
                    depth={node.depth}
                    detached={node.detached}
                    hasChildren={node.children.length > 0}
                    collapsed={collapsed.has(id)}
                    selected={selectedSpanId === id}
                    focused={focusedId === id}
                    flags={flags.get(id) ?? []}
                    timeline={timeline}
                    isFocusAgent={Boolean(focusAgentId) && node.span.agent_id === focusAgentId}
                    onSelect={() => {
                      setFocusedId(id);
                      onSelectSpan(node.span);
                    }}
                    onToggleCollapse={() => toggle(id)}
                    tabIndex={activeId === id ? 0 : -1}
                  />
                );
              })}
            </div>

            {mode === 'signal' && hiddenCount > 0 && (
              <button
                onClick={() => setMode('all')}
                className="w-full px-4 py-3 text-left text-[12px] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-dim"
              >
                {hiddenCount} further {hiddenCount === 1 ? 'span' : 'spans'} recorded with no
                findings — show all
              </button>
            )}

            {timeline.basis === 'none' && (
              <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
                No span in this trace carries a usable start time, so no timeline is drawn.
                Durations are shown where latency was recorded.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Structural placeholder only — no fabricated span names, times or scores. */
function LoadingSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-live="polite" aria-busy="true">
      <p className="pb-1 text-xs text-ink-faint">Loading trace…</p>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(0,1fr)_minmax(104px,26%)] items-center gap-4"
          style={{ paddingLeft: `${(i % 3) * 16}px` }}
        >
          <div style={{ width: `${58 - (i % 3) * 9}%` }}>
            <Skeleton className="h-3.5" />
          </div>
          <Skeleton className="h-1.5" />
        </div>
      ))}
    </div>
  );
}
