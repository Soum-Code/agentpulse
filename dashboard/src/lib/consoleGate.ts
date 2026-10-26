/**
 * What the console shows for the state of the telemetry feed.
 *
 * Before: any failed 10 s poll replaced the open view with an error panel, so one blip dropped the view's
 * local state (a search box, an open popover, the chat transcript) and hid views that have their own data
 * source (review finding ux-tests-4). Now the panel blocks only until the FIRST successful poll; after that
 * a failure keeps the view and its last good data on screen and adds a "stale" banner above it.
 */
import type { FeedStatus } from './stateModel';

export interface ConsoleGate {
  /** Replace the view with the pending / unreachable / error panel. */
  blockWithPanel: boolean;
  /** Keep the view but say its data is stale (a later poll failed). */
  showStaleBanner: boolean;
}

/**
 * `needsTelemetry`: the view reads the agent and trace lists (Overview, Traces ...). The others (Telemetry
 * Lab, APM, Settings, the RAG monitor) have their own sources and always render.
 * `loadedOnce`: a poll has succeeded at some point, so there is data to keep showing.
 */
export function consoleGate(feed: FeedStatus, needsTelemetry: boolean, loadedOnce: boolean): ConsoleGate {
  const failed = feed === 'unreachable' || feed === 'error';
  return {
    blockWithPanel: needsTelemetry && feed !== 'ready' && !loadedOnce,
    showStaleBanner: failed && loadedOnce,
  };
}
