import React from 'react';
import { API_SERVICE, API_START_HINT, datum, Feed } from '../../lib/stateModel';
import { DatumDisplay } from '../rag/DatumDisplay';

/**
 * A one-line notice above a view that is still showing its last good data after a later poll failed.
 * The reader sees that the numbers are old, from when, and can retry, instead of the view disappearing.
 */
export const StaleDataBanner: React.FC<{ feed: Feed; lastOkAt: number | null; onRetry: () => void }> = ({ feed, lastOkAt, onRetry }) => (
  <div
    role="alert"
    className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 font-mono text-xs text-rose-200"
  >
    <span>
      {feed.status === 'unreachable' ? `Cannot reach ${API_SERVICE}.` : `${API_SERVICE} answered with an error.`}{' '}
      Showing the data from {lastOkAt ? new Date(lastOkAt).toLocaleTimeString() : 'the last successful poll'}; it is tried again every 10 s.
      {feed.message ? ` (${feed.message})` : ''}
    </span>
    <button onClick={onRetry} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-100">
      Retry now
    </button>
  </div>
);

interface FeedStatusPanelProps {
  feed: Feed;
  onRetry: () => void;
}

/**
 * Full-width notice shown instead of the views while the telemetry feed is not usable.
 * It is the page-level form of the datum states: pending (first poll still running),
 * unreachable (nothing answered: says which service and how to start it) and error
 * (the API answered with a failure: shows its message). A ready feed renders nothing.
 * Showing this, rather than empty views, stops "nothing answered" from reading as "no problems".
 */
export const FeedStatusPanel: React.FC<FeedStatusPanelProps> = ({ feed, onRetry }) => {
  if (feed.status === 'ready') return null;

  if (feed.status === 'pending') {
    return (
      <div
        className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs text-neutral-400 space-y-3"
        role="status"
      >
        <DatumDisplay datum={datum.pending('Waiting for the first answer from the AgentPulse API')} />
        <p>Loading telemetry from AgentPulse...</p>
      </div>
    );
  }

  const unreachable = feed.status === 'unreachable';
  return (
    <div className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs space-y-2" role="alert">
      <p className="text-rose-300">
        {unreachable ? `Cannot reach ${API_SERVICE}.` : `${API_SERVICE} answered with an error.`}
      </p>
      {feed.message && <p className="text-neutral-400">{feed.message}</p>}
      {unreachable && (
        <p className="text-neutral-500">
          Start it with: <code className="text-neutral-300">{API_START_HINT}</code>
        </p>
      )}
      <button
        onClick={onRetry}
        className="mt-3 px-4 py-2 rounded-xl bg-white/10 text-neutral-100 hover:bg-white/20"
      >
        Retry
      </button>
    </div>
  );
};
