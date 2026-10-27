/**
 * The "agent ledger" of the RAG monitor: one row per span of the selected chat turn, read from
 * GET /v1/traces/{id}. Each figure is a datum in one of the five states (stateModel.ts), so a span
 * the evaluator has not scored yet reads "pending", one it does not score reads "unmeasured" with
 * the reason, and nothing is ever shown as a made-up 0.
 *
 * Pure functions only, so the rules are tested apart from the component that draws them.
 */
import type { SpanDetail, GroundingVerdict } from './api';
import { Datum, datum } from './stateModel';

export interface LedgerRow {
  spanId: string;
  /** The agent's role as the SDK reported it, else its id. */
  role: string;
  model: string | null;
  latencyMs: Datum<number>;
  tokens: Datum<number>;
  /** Grounding score: a RISK, 0 safe to 1 risky (riskTone.ts reads it that way). */
  groundingRisk: Datum<number>;
  /** 'stage1' (embedding gate) or 'stage2' (NLI), as the evaluator recorded it. */
  stage: Datum<string>;
  /** What the NLI model concluded; null when the row is not a real NLI result. */
  verdict: GroundingVerdict | null;
  /** Tool-claim check: the agent's claim against the tool's real result, also a risk. */
  toolClaimRisk: Datum<number>;
  /** The text the evaluator compared (input) and the output it judged (claim). */
  evidence: string | null;
  claim: string | null;
}

const present = (n: number | null | undefined) => typeof n === 'number' && Number.isFinite(n);

/**
 * Turns one span into a ledger row.
 * `settled` says whether waiting is over: while false, a missing evaluation is "pending"; once true
 * (the trace has stopped changing, or the wait ran out) it is "unmeasured".
 */
export function spanToLedgerRow(span: SpanDetail, settled: boolean): LedgerRow {
  const ev = span.evaluation;
  const missing = <T,>(reason: string): Datum<T> => (settled ? datum.unmeasured<T>(reason) : datum.pending<T>());

  const tokensTotal = (span.tokens_in ?? 0) + (span.tokens_out ?? 0);
  const hasTokens = present(span.tokens_in) || present(span.tokens_out);

  return {
    spanId: span.span_id,
    role: span.agent_role || span.agent_id,
    model: span.model,
    latencyMs: present(span.latency_ms) ? datum.measured(span.latency_ms as number) : datum.unmeasured('the SDK did not report a latency for this span'),
    tokens: hasTokens ? datum.measured(tokensTotal) : datum.unmeasured('no token counts were reported for this span'),
    groundingRisk: ev && present(ev.grounding_score)
      ? datum.measured(ev.grounding_score as number)
      : ev
      ? datum.unmeasured('this span was evaluated without a grounding score (it needs both an input and an output text to compare)')
      : missing('the evaluator has not scored this span'),
    // The worker writes evaluation_stage 'skipped' when grounding had nothing to compare (it needs both an
    // input and an output text, e.g. a span whose model call failed). That is "not scored", not a stage.
    stage:
      ev && ev.evaluation_stage === 'skipped'
        ? datum.unmeasured('the evaluator skipped this span: grounding needs both an input and an output text')
        : ev && ev.evaluation_stage
        ? datum.measured(ev.evaluation_stage)
        : ev
        ? datum.unmeasured('the evaluator recorded no stage')
        : missing('the evaluator has not scored this span'),
    verdict: ev?.grounding_verdict ?? null,
    toolClaimRisk: ev && present(ev.tool_claim_score)
      ? datum.measured(ev.tool_claim_score as number)
      : ev
      ? datum.unmeasured('no tool call to check on this span')
      : missing('the evaluator has not scored this span'),
    evidence: span.input_summary ?? null,
    claim: span.output_summary ?? null,
  };
}

/** The three agents a chat turn runs, in order; what to wait for while the chat has not said which ran. */
export const TURN_AGENTS = ['retriever', 'verifier', 'answerer'] as const;

/**
 * True when every span has an evaluation and every agent in `expectedAgents` has a span, i.e. there is
 * nothing left to wait for. The spans arrive one by one, so the retriever and verifier can both be
 * scored before the answerer's span exists; without the expected agents that read as "all done" and the
 * ledger printed "None raised." too early.
 */
export function allEvaluated(spans: SpanDetail[], expectedAgents: readonly string[] = []): boolean {
  if (spans.length === 0 || !spans.every((s) => s.evaluation !== null)) return false;
  return expectedAgents.every((agent) => spans.some((s) => s.agent_id === agent));
}

export type AlertsReading = 'list' | 'none' | 'unknown-running' | 'unknown-timeout';

/**
 * How to describe the alerts of a trace. "None raised" is only true once every span has been scored: before
 * that the evaluator may still raise one (review finding honesty-5: after a timeout with unscored spans the
 * ledger said "None raised", which reads as "the evaluator found nothing").
 */
export function alertsReading(
  alertCount: number,
  spans: SpanDetail[],
  settled: boolean,
  expectedAgents: readonly string[] = [],
): AlertsReading {
  if (alertCount > 0) return 'list';
  // "None" also needs every expected agent's span to be here, not only the ones that arrived.
  if (allEvaluated(spans, expectedAgents)) return 'none';
  return settled ? 'unknown-timeout' : 'unknown-running';
}

