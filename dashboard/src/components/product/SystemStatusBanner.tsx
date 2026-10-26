import React from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { PlatformStatus } from '../../lib/usePlatformStatus';
import { serverErrorRate, summariseStatus } from '../../lib/platformStats';
import { API_START_HINT, Datum, datumFromFeed } from '../../lib/stateModel';
import { DatumDisplay } from '../rag/DatumDisplay';

interface SystemStatusBannerProps {
  status: PlatformStatus;
}

/** One labelled figure in the banner's chip row. */
const Chip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] min-w-[7.5rem]">
    <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">{label}</div>
    <div className="text-sm mt-0.5 font-mono tabular-nums">{children}</div>
  </div>
);

/**
 * The owner's "System Status" banner, driven by the real health endpoints.
 *
 * The owner's version was a demo: buttons to trigger a fake error spike, a made-up 5-minute rolling
 * error rate, a hard-coded sample trace and a list of "degraded gateways". None of that exists in the
 * API, so none of it is here. What is here, all read from the API:
 *   - the platform state and its reasons (/v1/platform),
 *   - whether the API is ready (/v1/health/ready),
 *   - whether an evaluation worker is alive (/v1/health/evaluator),
 *   - the share of requests that ended in a 5xx since the API started (/v1/platform counters).
 * While an endpoint has not answered, or cannot be reached, its figure says so (DatumDisplay).
 */
export const SystemStatusBanner: React.FC<SystemStatusBannerProps> = ({ status }) => {
  const { platform, ready, evaluator } = status;
  const feeds = [platform.feed, ready.feed, evaluator.feed];
  const allPending = feeds.every((f) => f.status === 'pending');
  const noneAnswered = feeds.every((f) => f.status === 'unreachable' || f.status === 'error');

  const summary = summariseStatus({ platform: platform.data, ready: ready.data, evaluator: evaluator.data });
  const level = allPending ? 'unknown' : noneAnswered ? 'bad' : summary.level;

  const headline = allPending
    ? 'SYSTEM STATUS: CHECKING'
    : noneAnswered
    ? 'SYSTEM STATUS: API UNREACHABLE'
    : summary.level === 'ok'
    ? 'SYSTEM STATUS: ALL SYSTEMS OPERATIONAL'
    : `SYSTEM STATUS: ${summary.label.toUpperCase()}`;

  const tone =
    level === 'ok'
      ? 'border-emerald-500/30 from-emerald-950/25 text-emerald-300'
      : level === 'warn'
      ? 'border-amber-500/40 from-amber-950/30 text-amber-300'
      : level === 'bad'
      ? 'border-rose-500/50 from-rose-950/40 text-rose-300'
      : 'border-white/15 from-neutral-900/60 text-neutral-300';

  // The figures in the chip row, each in one of the five datum states.
  const apiReady: Datum<string> = datumFromFeed(ready.feed, () => (ready.data ? (ready.data.ready ? 'ready' : 'not ready') : null), 'no answer');
  const workers: Datum<string> = datumFromFeed(
    evaluator.feed,
    () => (evaluator.data ? `${evaluator.data.workers_alive} of ${evaluator.data.workers_registered} alive` : null),
    'no answer',
  );
  const queue: Datum<number> = datumFromFeed(platform.feed, () => platform.data?.evaluation_queue?.depth, 'the platform check reports no queue depth');
  const errRate: Datum<number> = datumFromFeed(
    platform.feed,
    () => serverErrorRate(platform.data?.runtime_counters?.api),
    'no request has been counted since the API started',
  );

  const Icon = level === 'ok' ? ShieldCheck : level === 'unknown' ? ShieldQuestion : ShieldAlert;

  return (
    <div
      id="system-status-banner"
      role="status"
      className={`ios-liquid-card rounded-2xl p-4 sm:p-5 relative overflow-hidden border bg-gradient-to-r via-neutral-900/70 to-neutral-900/60 ${tone}`}
    >
      <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5 min-w-0">
          <div className="p-2.5 rounded-xl shrink-0 border border-current/30 bg-current/10">
            <Icon className={`w-5 h-5 ${level === 'bad' ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase">{headline}</h3>
            <p className="text-xs font-mono text-neutral-300 mt-1 leading-relaxed">
              {allPending
                ? 'Waiting for the first answer from the health endpoints.'
                : noneAnswered
                ? `Start it with: ${API_START_HINT}`
                : summary.reasons.length > 0
                ? summary.reasons.join(' · ')
                : 'No degradation reported by the platform check.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip label="API"><DatumDisplay datum={apiReady} /></Chip>
          <Chip label="Evaluator"><DatumDisplay datum={workers} /></Chip>
          <Chip label="Queue depth"><DatumDisplay datum={queue} format="count" /></Chip>
          <Chip label="5xx since start"><DatumDisplay datum={errRate} format="percentage" /></Chip>
        </div>
      </div>
    </div>
  );
};

