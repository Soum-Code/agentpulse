/**
 * Small pure helpers behind the Performance view and the system status banner. They turn the raw
 * answers of /v1/platform, /v1/health/ready and /v1/health/evaluator into the few things those
 * screens show, so the rules can be tested without rendering anything.
 */
import type { ApiReadiness, EvaluatorReadiness, PlatformHealth } from './api';

type ApiCounters = NonNullable<NonNullable<PlatformHealth['runtime_counters']>['api']>;

/**
 * Share of API requests that ended in a 5xx, 0 to 1, counted since the API process started
 * (the counters reset on restart; the backend says so in its own note). Null when no request has
 * been counted yet: 0 errors out of 0 requests is "nothing measured", not "0 % errors".
 */
export function serverErrorRate(api: ApiCounters | undefined): number | null {
  const total = api?.requests_total;
  const errors = api?.server_errors_total;
  if (total == null || errors == null || !Number.isFinite(total) || !Number.isFinite(errors)) return null;
  if (total <= 0) return null;
  return Math.min(1, errors / total);
}

export type StatusLevel = 'ok' | 'warn' | 'bad';

export interface StatusSummary {
  level: StatusLevel;
  /** Platform state in words: "operational", "backlogged", "degraded", "starting", "failing". */
  label: string;
  /** Why the level is not ok: every reason the three endpoints gave, in order, without duplicates. */
  reasons: string[];
}

/**
 * One reading of the instance from the three health endpoints.
 *
 * bad  = the platform says it is failing, or the API says it is not ready (database check failed).
 * warn = backlogged / degraded / starting, or the evaluator has no live worker or a degraded one.
 * ok   = everything that answered says it is fine.
 * An endpoint that did not answer is passed as null and simply adds nothing; the caller shows
 * "unreachable" for it separately.
 */
export function summariseStatus(input: {
  platform: PlatformHealth | null;
  ready: ApiReadiness | null;
  evaluator: EvaluatorReadiness | null;
}): StatusSummary {
  const { platform, ready, evaluator } = input;
  const reasons: string[] = [];
  const add = (list?: string[]) => list?.forEach((r) => !reasons.includes(r) && reasons.push(r));
  add(platform?.reasons);
  if (ready && !ready.ready) add(ready.reasons);
  if (evaluator && (!evaluator.ready || evaluator.degraded)) add(evaluator.reasons);

  let level: StatusLevel = 'ok';
  if (platform && platform.state !== 'healthy') level = platform.state === 'failing' ? 'bad' : 'warn';
  if (ready && !ready.ready) level = 'bad';
  if (level !== 'bad' && evaluator && (!evaluator.ready || evaluator.degraded)) level = 'warn';

  const label = platform ? (platform.state === 'healthy' ? 'operational' : platform.state) : level === 'ok' ? 'operational' : level === 'bad' ? 'failing' : 'degraded';
  return { level, label, reasons };
}
