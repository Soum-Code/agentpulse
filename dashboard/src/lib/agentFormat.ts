/** How agent figures are printed on the Agents roster, the context panel, the command
 *  palette and the Drift view.
 *
 * Rule: a value the backend did not measure prints as an em dash, never as 0, "NaN" or an
 * empty string. The live Agents view printed `NaNms`, `ms avg` with no number and `Δ ()`
 * because the components read optional fields as if they were always there.
 */
import type { Agent } from '../types';
import { DRIFT_THRESHOLD } from './adapters';
import { summarizeDrift } from './overviewStats';

export const DASH = '—';

// How many outputs the drift detector needs before it reports a window distance:
// the baseline is an agent's first 20 outputs (min_samples_for_alert, backend/app/services/
// drift.py:116) and the current window its latest 12 (mean_window, drift.py:124).
export const DRIFT_BASELINE_OUTPUTS = 20;
export const DRIFT_CURRENT_WINDOW_OUTPUTS = 12;

/** True only for a real, finite number (rules out undefined, null and NaN). */
function measured(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

/** Latency in whole milliseconds, e.g. "22 ms", or a dash when there is none. */
export function formatLatencyMs(ms: number | null | undefined): string {
  return measured(ms) ? `${Math.round(ms)} ms` : DASH;
}

/** Success rate with at most one decimal, e.g. "83.3%" or "100%", or a dash. */
export function formatSuccessRate(pct: number | null | undefined): string {
  return measured(pct) ? `${Number(pct.toFixed(1))}%` : DASH;
}

/** Below 90% OK is shown in red. An unknown rate is not "low". */
export function isLowSuccess(pct: number | null | undefined): boolean {
  return measured(pct) && pct < 90;
}

/** A drift distance with three decimals, or a dash when it has not been computed. */
export function formatDistance(distance: number | null | undefined): string {
  return measured(distance) ? distance.toFixed(3) : DASH;
}

/** Width of a 0-100% bar for a distance; 0 when unknown so no bar is drawn. */
export function distanceBarPct(distance: number | null | undefined): number {
  if (!measured(distance)) return 0;
  return Math.min(Math.max(distance * 100, 0), 100);
}

/** True when a window distance is over the threshold DRIFT_DETECTED uses. */
export function isOverDriftThreshold(distance: number | null | undefined): boolean {
  return measured(distance) && distance > DRIFT_THRESHOLD;
}

/** Which of the two drift pools is still filling for an agent with no window distance:
 *  'baseline' under 20 spans seen, 'window' at 20 or more (the baseline should be full and the
 *  latest-12 window is what is missing), 'unknown' with no drift record. */
export type DriftWait = 'baseline' | 'window' | 'unknown';

export function driftWait(agent: Pick<Agent, 'driftSpansSeen'>): DriftWait {
  const n = agent.driftSpansSeen;
  if (n == null) return 'unknown';
  return n < DRIFT_BASELINE_OUTPUTS ? 'baseline' : 'window';
}

/** The roster's drift badge text: the status once a window distance exists, otherwise which
 *  pool is still filling. It used to say "no baseline" even when only the window was missing. */
export function driftStatusLabel(agent: Pick<Agent, 'driftStatus' | 'driftSpansSeen'>): string {
  if (agent.driftStatus) return agent.driftStatus;
  const wait = driftWait(agent);
  if (wait === 'baseline') return `baseline ${agent.driftSpansSeen}/${DRIFT_BASELINE_OUTPUTS}`;
  if (wait === 'window') return 'window filling';
  return 'no drift data';
}

/** One sentence for the inspector when there is no window distance, naming what is missing. */
export function driftWaitSentence(agent: Pick<Agent, 'driftSpansSeen'>): string {
  const wait = driftWait(agent);
  if (wait === 'baseline') {
    return `The baseline is still filling: ${agent.driftSpansSeen} of the first ${DRIFT_BASELINE_OUTPUTS} outputs seen. After that, the latest ${DRIFT_CURRENT_WINDOW_OUTPUTS} outputs form the current window.`;
  }
  if (wait === 'window') {
    return `The baseline (first ${DRIFT_BASELINE_OUTPUTS} outputs) should be full; the current window of the latest ${DRIFT_CURRENT_WINDOW_OUTPUTS} is still filling.`;
  }
  return `No drift record yet. A distance needs the first ${DRIFT_BASELINE_OUTPUTS} evaluated outputs as a baseline and the latest ${DRIFT_CURRENT_WINDOW_OUTPUTS} as the current window.`;
}

/** One line under the roster heading, built from the loaded agents. Replaces a typed-in
 *  "4 active swarms · LangGraph, LangGraph & Custom Orchestrators" that matched nothing.
 *  Agents without a window distance are split by which pool is still filling. */
export function rosterSummary(agents: Agent[]): string {
  if (agents.length === 0) return 'No agents have sent a span yet';
  const { drifting } = summarizeDrift(agents);
  const waiting = agents.filter((a) => a.driftStatus == null);
  const windowFilling = waiting.filter((a) => driftWait(a) === 'window').length;
  const baselineFilling = waiting.length - windowFilling;
  const parts = [
    `${agents.length} ${agents.length === 1 ? 'agent' : 'agents'} seen`,
    `${drifting} drifting`,
  ];
  if (baselineFilling > 0) parts.push(`${baselineFilling} still building a drift baseline`);
  if (windowFilling > 0) parts.push(`${windowFilling} with the drift window still filling`);
  return parts.join(' · ');
}

/** The command palette's agent subtitle: only the parts that exist. Framework and model
 *  have no source in the span schema, so they are usually absent. */
export function agentSubtitle(agent: Agent): string {
  const parts = [
    agent.framework,
    agent.model,
    measured(agent.latencyAvgMs) ? `${formatLatencyMs(agent.latencyAvgMs)} avg` : undefined,
    measured(agent.successRate) ? `${formatSuccessRate(agent.successRate)} OK` : undefined,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(' · ') : 'No latency or success rate recorded yet';
}
