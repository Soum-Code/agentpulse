import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { SpanDetail } from '../../lib/api';
import {
  DASH,
  FLAG_LABEL,
  formatMs,
  formatOffset,
  formatTimestamp,
  spanTitle,
  type SpanFlag,
  type Timeline,
} from '../../lib/trace';
import { EvaluationSection, SectionLabel } from './EvaluationSection';
import { EvidenceSection } from './EvidenceSection';
import { cx } from '../ui';

/**
 * The inspector.
 *
 * Non-modal by design: the execution view stays visible and interactive
 * alongside it, because the question being asked is nearly always "how does
 * this span compare to the ones around it".
 *
 * It opens with why the span is worth attention rather than with a field dump.
 * A panel that leads with `span_id` makes the engineer do the triage the tool
 * was supposed to do.
 */
export function SpanInspector({
  span,
  flags,
  timeline,
  onClose,
  variant,
}: {
  span: SpanDetail | null;
  flags: SpanFlag[];
  timeline: Timeline;
  onClose: () => void;
  variant: 'column' | 'overlay';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!span) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [span, onClose]);

  if (!span) {
    return (
      <aside
        className="hidden h-full min-h-0 flex-col items-center justify-center px-6 text-center lg:flex"
        aria-label="Span inspector"
      >
        <p className="text-[13px] text-ink-dim">No span selected</p>
        <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-ink-faint">
          Select a span in the execution view to inspect its evidence and evaluation.
        </p>
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      aria-label={`Inspector for ${spanTitle(span)}`}
      className={cx(
        'flex h-full min-h-0 flex-col bg-surface',
        variant === 'overlay' &&
          'inspector-enter fixed inset-y-0 right-0 z-40 w-[min(24rem,90vw)] border-l border-line shadow-lift',
      )}
    >
      {/* Glass is reserved for floating and contextual surfaces; the inspector
          header qualifies, the scrolling body does not. */}
      <div className="glass sticky top-0 z-10 flex items-start justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{spanTitle(span)}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">{span.span_id}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {flags.length > 0 && (
          <section aria-label="Why this span">
            <SectionLabel>Why this span</SectionLabel>
            <ul className="mt-2 space-y-1">
              {flags.map((flag) => (
                <li key={flag} className="flex items-start gap-2 text-[12px] text-ink-dim">
                  <span
                    className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ink-faint"
                    aria-hidden="true"
                  />
                  {FLAG_LABEL[flag]}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Span">
          <SectionLabel>Span</SectionLabel>
          <dl className="mt-2.5 space-y-1.5">
            <Row label="Status" value={span.status || DASH} />
            <Row label="Event type" value={span.event_type || DASH} />
            <Row label="Kind" value={span.span_kind || DASH} />
            <Row label="Duration" value={formatMs(span.latency_ms)} />
            <Row label="Offset" value={formatOffset(span, timeline)} />
            <Row label="Start time" value={formatTimestamp(span.start_time)} />
            <Row label="Parent" value={span.parent_span_id || DASH} truncate />
          </dl>
        </section>

        <EvidenceSection span={span} />

        <EvaluationSection span={span} />
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  const missing = value === DASH;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] text-ink-faint">{label}</dt>
      <dd
        className={cx(
          'font-mono text-[11px] tnum',
          truncate && 'truncate',
          missing ? 'text-ink-faint' : 'text-ink-dim',
        )}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
