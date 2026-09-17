import { EyeOff } from 'lucide-react';
import type { SpanDetail } from '../../lib/api';
import { DASH, NOT_EXPOSED } from '../../lib/trace';
import { SectionLabel } from './EvaluationSection';

/**
 * Evidence for the selected span.
 *
 * Evidence is the part of AgentPulse most easily faked, so this section shows
 * only values present in the trace response and names what is absent — and,
 * where it matters, whether it is absent because the span has no such value or
 * because the endpoint does not return it. Those are different facts and an
 * engineer deciding whether to trust a score needs to tell them apart.
 */
export function EvidenceSection({ span }: { span: SpanDetail }) {
  const recorded: { label: string; value: string | null; mono?: boolean }[] = [
    { label: 'Agent', value: span.agent_id, mono: true },
    { label: 'Role', value: span.agent_role },
    { label: 'Model', value: span.model, mono: true },
    {
      label: 'Tokens in / out',
      value:
        span.tokens_in === null && span.tokens_out === null
          ? null
          : `${span.tokens_in ?? DASH} / ${span.tokens_out ?? DASH}`,
      mono: true,
    },
    { label: 'Tool', value: span.tool_name, mono: true },
  ];

  return (
    <section aria-label="Evidence">
      <SectionLabel>Evidence</SectionLabel>

      <dl className="mt-2.5 space-y-1.5">
        {recorded.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[11px] text-ink-faint">{item.label}</dt>
            <dd
              className={
                item.value
                  ? `truncate text-[11px] text-ink-dim${item.mono ? ' font-mono' : ''}`
                  : 'font-mono text-[11px] text-ink-faint'
              }
              title={item.value ?? undefined}
            >
              {item.value ?? DASH}
            </dd>
          </div>
        ))}
      </dl>

      {span.error_message && (
        <div className="mt-2.5 rounded border border-state-bad/30 bg-state-bad/[0.06] p-2.5">
          <p className="text-[11px] font-semibold text-state-bad">Recorded error</p>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-state-bad/90">
            {span.error_message}
          </p>
        </div>
      )}

      {/* Stated explicitly rather than left as a silent em dash: an engineer
          reading a grounding score needs to know the payload it was computed
          over is not something this view can show them. */}
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <div className="flex items-center gap-1.5">
          <EyeOff className="h-3 w-3 text-ink-faint" aria-hidden="true" />
          <span className="text-[11px] text-ink-dim">Not available here</span>
        </div>
        <Unavailable title="Raw input / output">{NOT_EXPOSED.payload}</Unavailable>
        <Unavailable title="Tool arguments and result">{NOT_EXPOSED.toolDetail}</Unavailable>
      </div>
    </section>
  );
}

function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-line bg-surface-2/60 p-2.5">
      <p className="text-[11px] text-ink-dim">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{children}</p>
    </div>
  );
}
