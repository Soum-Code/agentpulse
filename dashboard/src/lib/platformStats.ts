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

  // The label follows the FINAL level. It used to come from the platform's own state alone, so a healthy
  // platform with a failed readiness check read 'operational' on a red banner (review finding honesty-7).
  // The platform's own word (backlogged, starting, ...) is kept when it already agrees with the level.
  const platformLevel: StatusLevel | null = !platform ? null : platform.state === 'healthy' ? 'ok' : platform.state === 'failing' ? 'bad' : 'warn';
  const label =
    level === 'ok' ? 'operational' : platform && platformLevel === level ? platform.state : level === 'bad' ? 'failing' : 'degraded';
  return { level, label, reasons };
}

export type BannerLevel = StatusLevel | 'unknown';

export interface BannerModel {
  level: BannerLevel;
  /** The headline, e.g. 'SYSTEM STATUS: ALL SYSTEMS OPERATIONAL'. */
  headline: string;
  /** The line under it: reasons, which endpoint did not answer, or the all-clear. */
  detail: string;
}

type FeedState = 'pending' | 'ready' | 'unreachable' | 'error';

/**
 * Everything the status banner says, from what the three endpoints returned.
 *
 * The all-clear ('ALL SYSTEMS OPERATIONAL' and 'No degradation reported') is printed only when all three
 * endpoints answered and their summary is ok. If any did not answer the status is partial: the banner says
 * which one, and does not claim health from the ones that did (review finding honesty-3: /v1/platform and
 * the evaluator probe failing while the public readiness probe answered gave a green banner).
 */
export function describeBanner(
  feeds: { platform: FeedState; ready: FeedState; evaluator: FeedState },
  summary: StatusSummary,
): BannerModel {
  const entries: [string, FeedState][] = [
    ['/v1/platform', feeds.platform],
    ['/v1/health/ready', feeds.ready],
    ['/v1/health/evaluator', feeds.evaluator],
  ];
  const states = entries.map(([, s]) => s);
  if (states.every((s) => s === 'pending')) {
    return { level: 'unknown', headline: 'SYSTEM STATUS: CHECKING', detail: 'Waiting for the first answer from the health endpoints.' };
  }
  if (states.every((s) => s === 'unreachable' || s === 'error')) {
    return { level: 'bad', headline: 'SYSTEM STATUS: API UNREACHABLE', detail: 'None of the health endpoints answered.' };
  }
  const missing = entries.filter(([, s]) => s !== 'ready').map(([name]) => name);
  const missingNote = missing.length ? `${missing.join(' and ')} did not answer, so the status is not fully known.` : '';
  const reasons = summary.reasons.join(' \u00b7 ');
  if (summary.level !== 'ok') {
    return {
      level: summary.level,
      headline: `SYSTEM STATUS: ${summary.label.toUpperCase()}`,
      detail: [reasons, missingNote].filter(Boolean).join(' \u00b7 '),
    };
  }
  if (missing.length > 0) {
    return { level: 'unknown', headline: 'SYSTEM STATUS: PARTIAL', detail: missingNote };
  }
  return { level: 'ok', headline: 'SYSTEM STATUS: ALL SYSTEMS OPERATIONAL', detail: 'No degradation reported by the platform check.' };
}
