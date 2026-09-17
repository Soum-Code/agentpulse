import { useMemo, useState } from 'react';
import { PanelLeftClose, Search } from 'lucide-react';
import type { TraceListItem } from '../../lib/api';
import { DASH, formatClock } from '../../lib/trace';
import { cx, riskTone, toneText } from '../ui';

type RiskFilter = 'all' | 'elevated' | 'failed';

/**
 * The trace stream.
 *
 * Not a table: each row is a short stack of trace identity over its signal, so
 * the eye lands on which trace is worth opening rather than scanning columns.
 * Colour is spent only where it carries meaning — the risk figure and the
 * selected row. Everything at rest is monochrome.
 */
export function TraceStream({
  traces,
  selectedTraceId,
  onSelect,
  onCollapse,
}: {
  traces: TraceListItem[];
  selectedTraceId: string | null;
  onSelect: (traceId: string) => void;
  onCollapse?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RiskFilter>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return traces.filter((t) => {
      if (q) {
        const haystack = `${t.trace_id} ${t.pipeline_id ?? ''} ${t.service_name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filter === 'elevated') {
        return typeof t.overall_risk_score === 'number' && t.overall_risk_score > 0.4;
      }
      if (filter === 'failed') {
        const status = (t.status || '').toLowerCase();
        return status !== 'completed' && status !== 'success' && status !== 'running';
      }
      return true;
    });
  }, [traces, query, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter traces"
          aria-label="Filter traces"
          className="w-full bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-faint"
        />
        {onCollapse && (
          <button
            onClick={onCollapse}
            aria-label="Collapse trace list"
            title="Collapse trace list"
            className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className="flex items-center gap-1 border-b border-line px-3 py-2"
        role="group"
        aria-label="Trace filter"
      >
        {(
          [
            ['all', 'All'],
            ['elevated', 'Elevated risk'],
            ['failed', 'Failed'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={cx(
              'rounded px-2 py-1 text-[11px] transition-colors',
              filter === id
                ? 'bg-surface-3 text-ink'
                : 'text-ink-faint hover:bg-surface-3/60 hover:text-ink-dim',
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[11px] tnum text-ink-faint">
          {visible.length}
          {visible.length !== traces.length && `/${traces.length}`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-ink-faint">
            {traces.length === 0 ? 'No traces recorded.' : 'No traces match this filter.'}
          </p>
        ) : (
          <ul>
            {visible.map((trace) => {
              const selected = trace.trace_id === selectedTraceId;
              const risk = trace.overall_risk_score;
              return (
                <li key={trace.trace_id}>
                  <button
                    onClick={() => onSelect(trace.trace_id)}
                    aria-current={selected ? 'true' : undefined}
                    className={cx(
                      'relative w-full border-b border-line/60 px-3 py-2.5 text-left',
                      'transition-colors duration-150',
                      selected ? 'bg-signal/[0.07]' : 'hover:bg-surface-2',
                    )}
                  >
                    <span
                      className={cx(
                        'absolute inset-y-0 left-0 w-[2px] transition-colors duration-150',
                        selected ? 'bg-signal' : 'bg-transparent',
                      )}
                      aria-hidden="true"
                    />

                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cx(
                          'truncate font-mono text-xs',
                          selected ? 'text-ink' : 'text-ink-dim',
                        )}
                      >
                        {trace.trace_id.slice(0, 18)}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tnum text-ink-faint">
                        {formatClock(trace.start_time)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <span className="text-ink-faint">
                        {trace.total_spans} {trace.total_spans === 1 ? 'span' : 'spans'}
                      </span>
                      <span className="text-ink-faint/50" aria-hidden="true">
                        ·
                      </span>
                      <span className="truncate text-ink-faint">
                        {trace.pipeline_id || trace.service_name || DASH}
                      </span>
                      <span
                        className={cx(
                          'ml-auto shrink-0 font-mono tnum',
                          typeof risk === 'number' ? toneText(riskTone(risk)) : 'text-ink-faint',
                        )}
                      >
                        {typeof risk === 'number' ? risk.toFixed(2) : DASH}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
