import { forwardRef } from 'react';
import { ChevronDown, ChevronRight, Cpu, GitBranch, Unlink, Wrench } from 'lucide-react';
import type { SpanDetail } from '../../lib/api';
import {
  DASH,
  FLAG_LABEL,
  computeBar,
  formatMs,
  formatOffset,
  isFailed,
  spanCategory,
  spanTitle,
  type SpanFlag,
  type Timeline,
} from '../../lib/trace';
import { cx, riskTone, toneText } from '../ui';

const CATEGORY_ICON = { tool: Wrench, model: Cpu, agent: GitBranch } as const;

/**
 * One execution step: hierarchy, identity, findings and timing in a single
 * row.
 *
 * Tree and waterfall are the same object here rather than two panes that have
 * to be kept in sync. Splitting them is what turns a trace back into a table —
 * the engineer ends up reading a row on the left and hunting for its bar on
 * the right instead of seeing one thing.
 */
export const SpanRow = forwardRef<
  HTMLDivElement,
  {
    span: SpanDetail;
    depth: number;
    detached: boolean;
    hasChildren: boolean;
    collapsed: boolean;
    selected: boolean;
    focused: boolean;
    flags: SpanFlag[];
    timeline: Timeline;
    isFocusAgent: boolean;
    onSelect: () => void;
    onToggleCollapse: () => void;
    tabIndex: number;
  }
>(function SpanRow(
  {
    span,
    depth,
    detached,
    hasChildren,
    collapsed,
    selected,
    focused,
    flags,
    timeline,
    isFocusAgent,
    onSelect,
    onToggleCollapse,
    tabIndex,
  },
  ref,
) {
  const Icon = CATEGORY_ICON[spanCategory(span)];
  const bar = computeBar(span, timeline);
  const risk = span.evaluation?.overall_risk_score;
  const failed = isFailed(span);

  // At most one flag is given colour. Showing four coloured chips on one row
  // is how a findings list turns back into noise.
  const leadFlag: SpanFlag | null = flags.includes('error')
    ? 'error'
    : flags.includes('risk-shift')
      ? 'risk-shift'
      : flags.includes('risk-peak')
        ? 'risk-peak'
        : (flags[0] ?? null);

  const barTone =
    failed ? 'bg-state-bad' : typeof risk === 'number' ? BAR_TONE[riskTone(risk)] : 'bg-ink-faint/45';

  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-label={ariaLabel(span, flags)}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cx(
        'group relative grid cursor-pointer grid-cols-[minmax(0,1fr)_minmax(104px,26%)] items-center',
        'gap-4 border-b border-line/40 py-2 pr-3 outline-none transition-colors duration-150',
        selected ? 'bg-signal/[0.07]' : 'hover:bg-surface-2',
        focused && !selected && 'bg-surface-2',
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      {/* Selection rail. The only cyan on a resting row. */}
      <span
        className={cx(
          'absolute inset-y-0 left-0 w-[2px] transition-colors duration-150',
          selected ? 'bg-signal' : 'bg-transparent',
        )}
        aria-hidden="true"
      />

      {/* Hierarchy guide: a hairline per ancestor level, so nesting reads as
          continuous structure rather than indentation alone. */}
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="absolute inset-y-0 w-px bg-line/70"
          style={{ left: `${19 + i * 16}px` }}
          aria-hidden="true"
        />
      ))}

      <div className="flex min-w-0 items-center gap-2">
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            tabIndex={-1}
            aria-label={collapsed ? 'Expand child spans' : 'Collapse child spans'}
            className="-ml-1 shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}

        <Icon
          className={cx(
            'h-3.5 w-3.5 shrink-0 transition-colors',
            selected ? 'text-signal' : 'text-ink-faint',
          )}
          aria-hidden="true"
        />

        {/* Identity takes the slack and truncates last. The chips beside it are
            short and fixed; a title clipped to one character tells the engineer
            nothing, which is what happens if this shrinks first. */}
        <span
          className={cx(
            'min-w-0 flex-1 truncate text-[13px]',
            span.tool_name && 'font-mono text-xs',
            selected ? 'text-ink' : 'text-ink-dim group-hover:text-ink',
          )}
          title={spanTitle(span)}
        >
          {spanTitle(span)}
        </span>

        <span
          className={cx(
            'max-w-[10rem] shrink-0 truncate font-mono text-[11px]',
            isFocusAgent ? 'text-signal' : 'text-ink-faint',
          )}
          title={isFocusAgent ? 'The agent you arrived from' : undefined}
        >
          @{span.agent_id}
        </span>

        {detached && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1 py-px text-[10px] text-ink-faint"
            title="This span's parent is not part of this trace response"
          >
            <Unlink className="h-2.5 w-2.5" aria-hidden="true" />
            <span className="hidden xl:inline">detached</span>
          </span>
        )}

        {leadFlag && <FlagChip flag={leadFlag} />}
      </div>

      {/* Timeline lane */}
      <div className="flex items-center gap-3">
        <div className="relative h-4 min-w-0 flex-1" title={formatOffset(span, timeline)}>
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line/60" aria-hidden="true" />
          {bar ? (
            <span
              className={cx(
                'absolute top-1/2 h-[5px] -translate-y-1/2 rounded-sm transition-opacity',
                barTone,
                selected ? 'opacity-100' : 'opacity-80',
              )}
              style={{ left: `${bar.leftPct}%`, width: `max(2px, ${bar.widthPct}%)` }}
              aria-hidden="true"
            />
          ) : (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-faint"
              aria-hidden="true"
            >
              no timing
            </span>
          )}
        </div>

        <span
          className={cx(
            'w-16 shrink-0 text-right font-mono text-[11px] tnum',
            selected ? 'text-ink' : 'text-ink-faint',
          )}
        >
          {formatMs(span.latency_ms)}
        </span>

        <span
          className={cx(
            'w-10 shrink-0 text-right font-mono text-[11px] tnum',
            typeof risk === 'number' ? toneText(riskTone(risk)) : 'text-ink-faint',
          )}
          title={typeof risk === 'number' ? 'Evaluated overall risk' : 'Not evaluated'}
        >
          {typeof risk === 'number' ? risk.toFixed(2) : DASH}
        </span>
      </div>
    </div>
  );
});

const BAR_TONE = { ok: 'bg-state-ok/70', warn: 'bg-state-warn', bad: 'bg-state-bad' } as const;

const FLAG_STYLE: Record<SpanFlag, string> = {
  error: 'border-state-bad/30 bg-state-bad/10 text-state-bad',
  'risk-shift': 'border-state-warn/30 bg-state-warn/10 text-state-warn',
  'risk-peak': 'border-state-warn/25 bg-state-warn/[0.07] text-state-warn',
  slowest: 'border-line-strong bg-surface-3 text-ink-dim',
};

function FlagChip({ flag }: { flag: SpanFlag }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded border px-1.5 py-px text-[10px] leading-4',
        FLAG_STYLE[flag],
      )}
    >
      {FLAG_LABEL[flag]}
    </span>
  );
}

/** Status is carried in the label as well as in colour, per non-colour-only. */
function ariaLabel(span: SpanDetail, flags: SpanFlag[]): string {
  const parts = [spanTitle(span), `agent ${span.agent_id}`, `status ${span.status || 'unknown'}`];
  const risk = span.evaluation?.overall_risk_score;
  parts.push(typeof risk === 'number' ? `risk ${risk.toFixed(2)}` : 'not evaluated');
  parts.push(`duration ${formatMs(span.latency_ms)}`);
  flags.forEach((f) => parts.push(FLAG_LABEL[f]));
  return parts.join(', ');
}
