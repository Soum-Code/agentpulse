/** What the backend has stored for one Telemetry Lab run (GET /v1/simulate/{trace_id}).
 *
 * Every score is null until the worker has written it, and stays null when the
 * evaluator did not compute it for that span (a span with no tool call has no
 * tool-claim score; the first agent of a trace has nothing earlier to disagree
 * with). Null is shown as "not available" -- never as zero.
 */

export interface ScenarioSpanResult {
  span_id: string;
  agent_id: string;
  /** False until the worker has scored this span. */
  evaluated: boolean;
  grounding_score: number | null;
  tool_claim_score: number | null;
  disagreement_score: number | null;
  overall_risk_score: number | null;
  /** The agent's drift distance right after this span; null until the baseline and current windows are full. */
  window_centroid_distance: number | null;
}

export interface ScenarioAlert {
  alert_type: string;
  severity: string;
  agent_id: string | null;
  span_id: string | null;
  message: string;
}

export interface ScenarioResult {
  trace_id: string;
  spans: ScenarioSpanResult[];
  alerts: ScenarioAlert[];
}

export const scoredCount = (result: ScenarioResult): number =>
  result.spans.filter((s) => s.evaluated).length;

/** True once every span of the run has been scored by the worker. */
export const isComplete = (result: ScenarioResult): boolean =>
  result.spans.length > 0 && scoredCount(result) === result.spans.length;

/** The drift distance on the last span of the run, or null when that span has none.
 *  An earlier span's value is not carried forward: it would be a different moment. */
export const finalWindowDistance = (result: ScenarioResult): number | null =>
  result.spans.length > 0
    ? result.spans[result.spans.length - 1].window_centroid_distance
    : null;

/** For each alert type the scenario is meant to trigger, did the API return one? */
export const expectedAlertChecks = (
  expected: string[],
  result: ScenarioResult,
): { type: string; agents: string[] }[] =>
  expected.map((type) => ({
    type,
    agents: result.alerts.filter((a) => a.alert_type === type).map((a) => a.agent_id ?? 'unknown'),
  }));

/** A stored score for display, to the four decimals the API stores; null is shown as an em dash, not as 0. */
export const formatScore = (value: number | null): string =>
  value === null ? '—' : value.toFixed(4);
