/** The assumptions behind the landing page's LLM-judge cost estimate.
 *
 * They are named constants so the figure shown beside the result is computed
 * from the assumptions shown beside it, rather than typed twice and left to
 * drift. None of the prices is measured: they are inputs the visitor can check.
 */

export const JUDGE_ASSUMPTIONS = {
  inputTokens: 1200,
  outputTokens: 80,
  inputUsdPerMillion: 2.5,
  outputUsdPerMillion: 10,
} as const;

/** One Standard_B2als_v2 (2 vCPU, 4 GB): the VM AgentPulse is deployed on, at
 *  the Central India retail price recorded in deploy/azure/README.md. VM only. */
export const VM_USD_PER_MONTH = 24.67;

export const DAYS_PER_MONTH = 30;

export function judgeCostPerSpan(): number {
  const a = JUDGE_ASSUMPTIONS;
  return (a.inputTokens * a.inputUsdPerMillion + a.outputTokens * a.outputUsdPerMillion) / 1_000_000;
}

export function monthlyJudgeCost(dailySpans: number): number {
  return Math.round(dailySpans * DAYS_PER_MONTH * judgeCostPerSpan());
}
