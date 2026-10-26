/**
 * The 5 Datum States for AgentPulse Observability.
 * 
 * In AgentPulse, every datum is in exactly one of five states:
 * - pending: requested, not yet evaluated
 * - measured: real value measured by the system
 * - unmeasured: the system does not produce it (renders em-dash "—" + tooltip reason)
 * - unreachable: the service did not answer (identifies which service and how to start it)
 * - error: the service answered with a failure (displays the error message)
 * 
 * Rule: There is no sixth state called "default".
 */

export type DatumStatus = 'pending' | 'measured' | 'unmeasured' | 'unreachable' | 'error';

export interface Datum<T = any> {
  status: DatumStatus;
  value?: T;
  reason?: string;
  service?: string;
  instruction?: string;
  error?: string;
}

export const datum = {
  measured: <T>(value: T): Datum<T> => ({
    status: 'measured',
    value,
  }),
  pending: <T = any>(reason = 'Evaluating in worker...'): Datum<T> => ({
    status: 'pending',
    reason,
  }),
  unmeasured: <T = any>(reason = 'not exposed by the API yet'): Datum<T> => ({
    status: 'unmeasured',
    reason,
  }),
  unreachable: <T = any>(service: string, instruction: string): Datum<T> => ({
    status: 'unreachable',
    service,
    instruction,
  }),
  error: <T = any>(error: string): Datum<T> => ({
    status: 'error',
    error,
  }),
};

/**
 * Feeds: how a poll of the API turns into datum states.
 *
 * A "feed" is one thing the console fetches (the telemetry lists, /v1/platform, ...). It is
 * pending until its first answer, then either ready, unreachable (nothing answered, or a gateway
 * answered for a dead backend) or error (the API answered with a failure). Every number the
 * console shows is read through datumFromFeed(), so a number can never be shown as "0" or a
 * blank while its feed is down: it is one of the five states, always.
 */
export type FeedStatus = 'pending' | 'ready' | 'unreachable' | 'error';

export interface Feed {
  status: FeedStatus;
  /** For 'unreachable' and 'error': what to show the reader. */
  message?: string;
}

/** The API's own name in tooltips, and the command that brings it up when it is down. */
export const API_SERVICE = 'AgentPulse API';
export const API_START_HINT = 'python -m uvicorn app.main:app --app-dir backend (and python -m app.worker for evaluation)';

/**
 * Sorts a failed request into 'unreachable' or 'error'.
 * Unreachable = the request never got an answer (a network failure is a TypeError from fetch) or a
 * gateway answered 502/503/504 because the backend behind it is down. Anything else is the API
 * itself answering with a failure, whose message is shown as is.
 */
export function feedFromError(err: unknown): Feed {
  const message = err instanceof Error ? err.message : 'Failed to reach AgentPulse';
  const status = (err as { status?: unknown } | null)?.status;
  if (err instanceof TypeError) return { status: 'unreachable', message };
  if (status === 502 || status === 503 || status === 504) return { status: 'unreachable', message };
  return { status: 'error', message };
}

/**
 * Turns one value of a feed into a datum.
 *
 * - feed pending     -> pending
 * - feed unreachable -> unreachable (names the service and how to start it)
 * - feed error       -> error (with the API's message)
 * - feed ready       -> measured when `read()` yields a finite number or a non-null value,
 *                       otherwise unmeasured with `unmeasuredReason` (why the system has no value).
 *
 * `read` is a function so it is not evaluated at all while the feed is not ready.
 */
export function datumFromFeed<T>(
  feed: Feed,
  read: () => T | null | undefined,
  unmeasuredReason: string,
): Datum<T> {
  if (feed.status === 'pending') return datum.pending<T>();
  if (feed.status === 'unreachable') return datum.unreachable<T>(API_SERVICE, API_START_HINT);
  if (feed.status === 'error') return datum.error<T>(feed.message || 'The API answered with an error');
  const value = read();
  // NaN and Infinity are not measurements; they come from a division by zero somewhere upstream.
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return datum.unmeasured<T>(unmeasuredReason);
  }
  return datum.measured(value);
}
