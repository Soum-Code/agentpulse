import { AlertTriangle, ArrowUpRight, Check, Circle } from 'lucide-react';
import type { Agent, SpanDetail, TraceListItem } from '../../lib/api';
import {
  DASH,
  formatMs,
  formatTimestamp,
  type TraceFindings,
  type Timeline,
} from '../../lib/trace';
import { cx, riskTone, toneText } from '../ui';

/**
 * Trace context strip.
 *
 * Deliberately quiet: it is orientation, not the investigation. It states the
 * few facts an engineer needs to know they are looking at the right trace, and
 * one derived sentence summarising what the spans contain.
 *
 * Labels are sentence case here rather than the dashboard's usual uppercase
 * Eyebrow — a header read on every visit should not shout.
 */
export function TraceHeader({
  trace,
  spans,
  findings,
  timeline,
  focusAgent,
}: {
  trace: TraceListItem | null;
  spans: SpanDetail[];
  findings: TraceFindings | null;
  timeline: Timeline;
  focusAgent: Agent | null;
}) {
  const agentCount = new Set(spans.map((s) => s.agent_id)).size;
  const risk = trace?.overall_risk_score;
  const failed = findings?.errorSpanIds.length ?? 0;

  return (
    <header className="border-b border-line bg-surface/60 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          {/* The trace id is the subject of this screen, so it leads. The page
              title lives in the application top bar and is not repeated. */}
          <div className="flex items-center gap-2.5">
            <h2 className="truncate font-mono text-[13px] font-medium text-ink">
              {trace ? trace.trace_id : DASH}
            </h2>
            {trace && <TraceStatus status={trace.status} />}
          </div>

          {/* One derived sentence. Every number in it is counted from the
              returned spans, so it stays true for a partial or empty trace. */}
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
            {trace ? summarise(spans.length, agentCount, findings, failed) : 'No trace selected.'}
          </p>
        </div>

        <dl className="flex flex-wrap items-start gap-x-7 gap-y-3">
          <Field label="Duration">
            {timeline.basis === 'wall-clock' ? formatMs(timeline.windowMs) : DASH}
          </Field>
          <Field label="Spans">{trace ? String(spans.length) : DASH}</Field>
          <Field label="Started">{trace ? formatTimestamp(trace.start_time) : DASH}</Field>
          <Field label="Service">{trace?.service_name || DASH}</Field>
          <Field
            label="Session risk"
            tone={typeof risk === 'number' ? toneText(riskTone(risk)) : undefined}
          >
            {typeof risk === 'number' ? risk.toFixed(3) : DASH}
          </Field>
        </dl>
      </div>

      {focusAgent && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded border border-signal/25 bg-signal/[0.07] px-2 py-1 text-[11px] text-ink-dim">
          <ArrowUpRight className="h-3 w-3 text-signal" aria-hidden="true" />
          Opened from <span className="font-mono text-signal">@{focusAgent.agent_id}</span>
          <span className="text-ink-faint">
            · showing traces where this agent produced a span
          </span>
        </p>
      )}
    </header>
  );
}

function summarise(
  spanCount: number,
  agentCount: number,
  findings: TraceFindings | null,
  failed: number,
): string {
  if (spanCount === 0) return 'This trace returned no spans.';

  const parts: string[] = [
    `${spanCount} ${spanCount === 1 ? 'span' : 'spans'} across ${agentCount} ${
      agentCount === 1 ? 'agent' : 'agents'
    }.`,
  ];

  if (findings) {
    if (findings.evaluatedCount === 0) {
      parts.push('None have been evaluated yet.');
    } else if (findings.evaluatedCount < spanCount) {
      parts.push(`${findings.evaluatedCount} evaluated.`);
    }

    if (findings.primaryShift) {
      parts.push(
        `Evaluated risk rose ${findings.primaryShift.from.toFixed(2)} → ${findings.primaryShift.to.toFixed(
          2,
        )} partway through.`,
      );
    }
  }

  if (failed > 0) parts.push(`${failed} failed.`);

  return parts.join(' ');
}

function TraceStatus({ status }: { status: string }) {
  const value = (status || '').toLowerCase();
  const running = value === 'running';
  const ok = value === 'completed' || value === 'success' || value === 'ok';
  const Icon = ok ? Check : running ? Circle : AlertTriangle;

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]',
        ok && 'border-state-ok/25 bg-state-ok/10 text-state-ok',
        running && 'border-line-strong bg-surface-3 text-ink-dim',
        !ok && !running && 'border-state-warn/25 bg-state-warn/10 text-state-warn',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {status || 'unknown'}
    </span>
  );
}

function Field({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className={cx('mt-0.5 font-mono text-xs tnum', tone ?? 'text-ink')}>{children}</dd>
    </div>
  );
}
