/**
 * What the header's live pill says. It used to read "LIVE" with a pulsing green dot whenever the user had
 * not paused the refresh, even while the API could not be reached (review finding honesty-8): "live" has to
 * mean "the last poll succeeded".
 */
import type { FeedStatus } from './stateModel';

export type LiveTone = 'live' | 'connecting' | 'offline' | 'paused';

export interface LiveBadge {
  tone: LiveTone;
  label: string;
  /** Tooltip: says what the state means. */
  title: string;
}

/**
 * `autoRefresh` is the user's toggle (poll every 10 s or not); `feed` is how the last poll went.
 * Paused wins (nothing is being polled, so there is nothing to report); otherwise the feed decides.
 */
export function liveBadge(autoRefresh: boolean, feed: FeedStatus): LiveBadge {
  if (!autoRefresh) {
    return { tone: 'paused', label: 'REFRESH PAUSED', title: 'The console is not refreshing. Click to resume the 10 s refresh.' };
  }
  if (feed === 'pending') {
    return { tone: 'connecting', label: 'CONNECTING', title: 'Waiting for the first answer from the AgentPulse API.' };
  }
  if (feed === 'unreachable' || feed === 'error') {
    return { tone: 'offline', label: 'OFFLINE \u00b7 retrying 10s', title: 'The last request to the AgentPulse API failed; it is tried again every 10 s.' };
  }
  return { tone: 'live', label: 'LIVE \u00b7 10s', title: 'The last poll succeeded; the console refreshes every 10 s. Click to pause.' };
}
