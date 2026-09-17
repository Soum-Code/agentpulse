import type { SpanDetail } from '../../lib/api';
import { DASH, EVALUATOR_MATURITY, type MaturityTier } from '../../lib/trace';
import { Meter, cx, riskTone, toneText } from '../ui';

/**
 * Evaluation results for the selected span.
 *
 * Every evaluator carries its published maturity tier. A score with no
 * indication of how well established the evaluator is reads as a verdict, and
 * two of AgentPulse's four signals are not at that standard.
 */
export function EvaluationSection({ span }: { span: SpanDetail }) {
  const evaluation = span.evaluation;

  if (!evaluation) {
    return (
      <section aria-label="Evaluation">
        <SectionLabel>Evaluation</SectionLabel>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
          No evaluation has been recorded for this span. Spans are queued for evaluation
          separately from ingestion, so a recently captured span may not have been scored yet.
        </p>
      </section>
    );
  }

  const overall = evaluation.overall_risk_score;

  return (
    <section aria-label="Evaluation">
      <SectionLabel>Evaluation</SectionLabel>

      <div className="mt-2.5 rounded border border-line bg-surface-2 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-ink-dim">Overall risk</span>
          <span
            className={cx(
              'font-mono text-lg font-semibold tnum leading-none',
              typeof overall === 'number' ? toneText(riskTone(overall)) : 'text-ink-faint',
            )}
          >
            {typeof overall === 'number' ? overall.toFixed(3) : DASH}
          </span>
        </div>
        {typeof overall === 'number' && <Meter value={overall} className="mt-2.5" />}

        <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          <Row label="Classification">
            {evaluation.label ? (
              <span className="rounded bg-surface-3 px-1.5 py-px text-[11px] text-ink">
                {evaluation.label}
              </span>
            ) : (
              DASH
            )}
          </Row>
          <Row label="Stage">{evaluation.evaluation_stage || DASH}</Row>
        </dl>
      </div>

      <div className="mt-2.5 space-y-2">
        <Evaluator
          meta={EVALUATOR_MATURITY.grounding}
          score={evaluation.grounding_score}
        />
        <Evaluator
          meta={EVALUATOR_MATURITY.tool_claim}
          score={evaluation.tool_claim_score}
        />
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
        Drift and inter-agent disagreement are evaluated per agent and per trace rather than
        per span, so they do not appear here.
      </p>
    </section>
  );
}

function Evaluator({
  meta,
  score,
}: {
  meta: { label: string; tier: MaturityTier; note: string };
  score: number | null | undefined;
}) {
  const scored = typeof score === 'number';
  return (
    <div className="rounded border border-line bg-surface-2 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink">{meta.label}</span>
          <MaturityChip tier={meta.tier} />
        </div>
        <span
          className={cx(
            'font-mono text-xs tnum',
            scored ? toneText(riskTone(score as number)) : 'text-ink-faint',
          )}
        >
          {scored ? (score as number).toFixed(4) : DASH}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
        {scored ? meta.note : 'This evaluator did not produce a score for this span.'}
      </p>
    </div>
  );
}

function MaturityChip({ tier }: { tier: MaturityTier }) {
  return (
    <span
      className={cx(
        'rounded border px-1.5 py-px text-[10px] leading-4',
        tier === 'Beta'
          ? 'border-line-strong bg-surface-3 text-ink-dim'
          : 'border-state-warn/25 bg-state-warn/[0.07] text-state-warn',
      )}
      title={
        tier === 'Beta'
          ? 'Beta: validated, with documented limits.'
          : 'Experimental: not validated for production decisions.'
      }
    >
      {tier}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12px] font-semibold text-ink">{children}</h3>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="font-mono text-[11px] text-ink-dim">{children}</dd>
    </div>
  );
}
