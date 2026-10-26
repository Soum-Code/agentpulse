import { describe, it, expect } from 'vitest';
import type { SpanDetail } from './api';
import { allEvaluated, spanToLedgerRow } from './ragLedger';

function span(over: Partial<SpanDetail> = {}): SpanDetail {
  return {
    span_id: 's1',
    parent_span_id: null,
    agent_id: 'answerer',
    agent_role: null,
    event_type: 'llm_call',
    span_kind: 'llm',
    latency_ms: 420,
    status: 'ok',
    error_message: null,
    model: 'm',
    tokens_in: 100,
    tokens_out: 20,
    tool_name: null,
    start_time: '2026-10-26T10:00:00',
    evaluation: null,
    ...over,
  } as SpanDetail;
}
const evaluated = (e: Partial<NonNullable<SpanDetail['evaluation']>> = {}): SpanDetail['evaluation'] => ({
  grounding_score: 0.12,
  tool_claim_score: null,
  overall_risk_score: 0.12,
  label: 'low_risk',
  evaluation_stage: 'stage2',
  grounding_verdict: 'supported',
  ...e,
});

describe('spanToLedgerRow', () => {
  it('shows an unscored span as pending while waiting and unmeasured once settled', () => {
    expect(spanToLedgerRow(span(), false).groundingRisk.status).toBe('pending');
    const settled = spanToLedgerRow(span(), true);
    expect(settled.groundingRisk.status).toBe('unmeasured');
    expect(settled.groundingRisk.reason).toMatch(/not scored/);
    expect(settled.stage.status).toBe('unmeasured');
  });

  it('measures a scored span, keeping the score as a risk and the verdict apart', () => {
    const row = spanToLedgerRow(span({ evaluation: evaluated({ grounding_score: 0.31, grounding_verdict: 'unverifiable' }) }), true);
    expect(row.groundingRisk).toEqual({ status: 'measured', value: 0.31 });
    expect(row.verdict).toBe('unverifiable');
    expect(row.stage).toEqual({ status: 'measured', value: 'stage2' });
  });

  it('a zero grounding score is a measurement, not a missing value', () => {
    expect(spanToLedgerRow(span({ evaluation: evaluated({ grounding_score: 0 }) }), true).groundingRisk).toEqual({ status: 'measured', value: 0 });
  });

  it('an evaluated span with no tool claim says so instead of showing 0', () => {
    const row = spanToLedgerRow(span({ evaluation: evaluated({ tool_claim_score: null }) }), true);
    expect(row.toolClaimRisk.status).toBe('unmeasured');
    expect(row.toolClaimRisk.reason).toMatch(/no tool call/);
  });

  it('reports a missing latency or token count as unmeasured, never 0', () => {
    const row = spanToLedgerRow(span({ latency_ms: null, tokens_in: null, tokens_out: null }), true);
    expect(row.latencyMs.status).toBe('unmeasured');
    expect(row.tokens.status).toBe('unmeasured');
  });

  it('sums input and output tokens and prefers the role over the agent id', () => {
    const row = spanToLedgerRow(span({ agent_role: 'Answerer', tokens_in: 100, tokens_out: 20 }), true);
    expect(row.tokens).toEqual({ status: 'measured', value: 120 });
    expect(row.role).toBe('Answerer');
    expect(spanToLedgerRow(span(), true).role).toBe('answerer');
  });
});

describe('allEvaluated', () => {
  it('is false for no spans and for any unscored span, true when all are scored', () => {
    expect(allEvaluated([])).toBe(false);
    expect(allEvaluated([span({ evaluation: evaluated() }), span()])).toBe(false);
    expect(allEvaluated([span({ evaluation: evaluated() })])).toBe(true);
  });
});
