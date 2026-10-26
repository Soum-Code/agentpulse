import React from 'react';
import { API_SERVICE, API_START_HINT, datum, Feed } from '../../lib/stateModel';
import { DatumDisplay } from '../rag/DatumDisplay';

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
