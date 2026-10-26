import React from 'react';
import { Activity, BarChart3, Clock, Cpu, Gauge, Layers, RefreshCw, Server, Zap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Percentiles } from '../../lib/api';
import { ProductTab } from '../../types';
import { usePlatformStatus } from '../../lib/usePlatformStatus';
import { serverErrorRate } from '../../lib/platformStats';
import { Datum, datum, datumFromFeed } from '../../lib/stateModel';
import { DatumDisplay } from '../rag/DatumDisplay';
import { SystemStatusBanner } from './SystemStatusBanner';

/**
 * The Performance tab: the owner's APM layout (status banner, four golden-signal tiles, a chart
 * surface, a split grid), filled only with what this instance measures about itself.
 *
 * Source of every number: GET /v1/platform (and /v1/health/*, in the banner). The owner's version was
 * built on a mock file of per-endpoint metrics (p99, Apdex, status-code mix, a probe button that
 * made up a result, a 24 h time series). The API measures none of that: its request middleware
 * records a duration and a status code but not the route, and keeps no history. Those parts are
 * shown as "not measured" with the reason instead of invented, and the owner's fourth tile (Apdex,
 * which needs a response-time target nobody configured) is the evaluation queue instead.
 */

interface PerformanceViewProps {
  onNavigateTab?: (tab: ProductTab) => void;
  /** Pauses the automatic 10 s refresh (the header's live toggle). */
  paused?: boolean;
}

/** A tile of the golden-signals row. */
const Tile: React.FC<{
  title: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  footer: React.ReactNode;
}> = ({ title, icon, value, footer }) => (
  <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden anime-tab-card">
    <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
    <div className="flex items-center justify-between text-neutral-400 text-xs mb-2.5">
      <span className="font-sans font-medium tracking-wider text-[11px] uppercase">{title}</span>
      {icon}
    </div>
    <div className="font-mono text-3xl font-black tracking-tight text-white">{value}</div>
    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.08]">
      {footer}
    </div>
  </div>
);

/** A titled card with a grid of labelled figures. */
const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <div className="ios-liquid-card border-glow-subtle rounded-2xl p-5 font-mono relative overflow-hidden anime-tab-card">
    <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
    <h3 className="text-xs uppercase tracking-wider text-neutral-300 font-semibold">{title}</h3>
    {note && <p className="text-[10px] text-neutral-400 mt-1 leading-relaxed">{note}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">{children}</div>
  </div>
);

const Stat: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">{label}</div>
    <div className="text-lg text-neutral-100 font-semibold mt-1 tabular-nums">{children}</div>
    {hint && <div className="text-[10px] text-neutral-400 mt-0.5">{hint}</div>}
  </div>
);

/** Seconds as "2h 5m", "7m" or "40s"; a dash is never needed because the caller passes a datum. */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ onNavigateTab, paused = false }) => {
  const status = usePlatformStatus(paused);
  const { platform } = status;
  const feed = platform.feed;
  const p = platform.data;

  const rc = p?.runtime_counters;
  const apiC = rc?.api;
  const ing = rc?.ingestion;
  const timing = p?.evaluation_timing;
  const rel = p?.reliability;
  const queue = p?.evaluation_queue;

  /** One number of /v1/platform as a datum: measured, or why it is not. */
  const d = <T,>(read: () => T | null | undefined, reason: string): Datum<T> => datumFromFeed(feed, read, reason);
  const sinceStart = 'The API reports no value yet; the counters start at zero on every API restart.';

  // The chart rows: only the timings that have a value are drawn, so a missing one is a missing bar,
  // never a bar of height 0.
  const pair = (label: string, v?: Percentiles) => ({ label, p50: v?.p50 ?? undefined, p95: v?.p95 ?? undefined });
  const chartRows = [
    pair('Queue wait', timing?.queue_wait_ms),
    pair('Evaluation', timing?.evaluation_ms),
    pair('End to end', timing?.end_to_end_ms),
  ].filter((r) => r.p50 !== undefined || r.p95 !== undefined);

  const errRate = d(() => serverErrorRate(apiC), 'no request has been counted since the API started');

  return (
    <div className="space-y-6 pb-28">
      {/* Header: what this tab is, refresh, shortcut to the traces */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-4 sm:p-5 relative overflow-hidden anime-tab-card">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <Gauge className="w-5 h-5 text-neutral-400" />
              <h2 className="font-mono text-sm font-semibold tracking-wider text-white uppercase">
                Performance Metrics (APM)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-300 border border-white/[0.12]">
                GET /v1/platform
              </span>
            </div>
            <p className="text-sm text-neutral-300 font-sans leading-relaxed max-w-2xl">
              What this instance measures about itself: API latency and error counters, the evaluation queue
              and its timings, ingestion and workers. Refreshed every 10 seconds
              {status.updatedAt ? `, last at ${new Date(status.updatedAt).toLocaleTimeString()}` : ''}.
            </p>
          </div>
          <div className="flex items-center space-x-2.5 self-start lg:self-center">
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('traces')}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-mono text-neutral-200 flex items-center space-x-1.5 transition-colors"
              >
                <Activity className="w-3 h-3" />
                <span>Open traces</span>
              </button>
            )}
            <button
              onClick={status.refresh}
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-mono text-neutral-200 flex items-center space-x-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* System status: platform state, API readiness, evaluator workers (three endpoints) */}
      <SystemStatusBanner status={status} />

      {/* Golden signals: four tiles, each number read through the feed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          title="API latency p50"
          icon={<Clock className="w-4 h-4 text-emerald-400" />}
          value={<DatumDisplay datum={d(() => apiC?.latency_ms?.p50, 'no request latency has been sampled yet')} format="latency" className="!text-white" />}
          footer={
            <>
              <span>p95 <DatumDisplay datum={d(() => apiC?.latency_ms?.p95, 'not sampled yet')} format="latency" /></span>
              <span>p99 <DatumDisplay datum={d(() => apiC?.latency_ms?.p99, 'not sampled yet')} format="latency" /></span>
            </>
          }
        />
        <Tile
          title="Server errors (5xx)"
          icon={<Zap className="w-4 h-4 text-amber-400" />}
          value={<DatumDisplay datum={errRate} format="percentage" className="!text-white" />}
          footer={
            <>
              <span><DatumDisplay datum={d(() => apiC?.server_errors_total, sinceStart)} format="count" /> errors</span>
              <span>of <DatumDisplay datum={d(() => apiC?.requests_total, sinceStart)} format="count" /> requests</span>
            </>
          }
        />
        <Tile
          title="Throughput (1 min)"
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
          value={
            <>
              <DatumDisplay datum={d(() => apiC?.requests_per_sec_1m, sinceStart)} className="!text-white" />
              <span className="font-mono text-xs text-neutral-400 ml-1.5 font-normal">req/s</span>
            </>
          }
          footer={
            <>
              <span>spans <DatumDisplay datum={d(() => ing?.spans_per_sec_1m, sinceStart)} />/s</span>
              <span>up <DatumDisplay datum={d(() => (rc?.uptime_seconds != null ? formatUptime(rc.uptime_seconds) : null), 'uptime not reported')} /></span>
            </>
          }
        />
        <Tile
          title="Evaluation queue"
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          value={<DatumDisplay datum={d(() => queue?.depth, 'the platform check reports no queue depth')} format="count" className="!text-white" />}
          footer={
            <>
              <span>limit <DatumDisplay datum={d(() => queue?.backlog_threshold, 'no threshold reported')} format="count" /></span>
              <span>workers <DatumDisplay datum={d(() => p?.workers?.alive, 'no worker count reported')} format="count" /></span>
            </>
          }
        />
      </div>

      {/* Chart surface: evaluation pipeline timings, the only timing series the API keeps */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-5 sm:p-6 relative overflow-hidden anime-tab-card">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 mb-1">
          <BarChart3 className="w-4 h-4 text-neutral-400" />
          <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
            Evaluation pipeline timing
          </h3>
        </div>
        <p className="text-xs text-neutral-300 font-sans mb-4">
          {timing?.sample_size != null
            ? `Over the last ${timing.sample_size} evaluated spans, in milliseconds. Queue wait is time spent waiting for a worker; evaluation is the models themselves.`
            : 'Per-stage timings of evaluated spans.'}
        </p>
        <div className="h-[270px] w-full">
          {chartRows.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" ms" width={70} />
                <Tooltip formatter={(v: number) => `${v} ms`} />
                <Legend />
                <Bar dataKey="p50" name="p50" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="p95" name="p95" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-center font-mono text-xs text-neutral-400">
              <span className="inline-flex items-center gap-2">
                <DatumDisplay
                  datum={
                    feed.status === 'ready'
                      ? datum.unmeasured('No span has been evaluated yet, so there are no timings.')
                      : d(() => null, '')
                  }
                />
                {feed.status === 'ready' ? 'No evaluated spans yet.' : 'Waiting for /v1/platform.'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Split grid: what the API does not measure (left), what it does (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 ios-liquid-card border-glow-subtle rounded-2xl p-5 font-mono relative overflow-hidden anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-neutral-400" />
            <h3 className="text-xs uppercase tracking-wider text-neutral-300 font-semibold">Not measured by this API</h3>
          </div>
          <ul className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-neutral-300 font-sans">
            <li className="flex items-start gap-2">
              <DatumDisplay datum={datum.unmeasured('The request middleware records a duration and a status code, not the route.')} />
              <span><b className="font-semibold">Per-endpoint latency, throughput and status codes.</b> The middleware does not record which route a request hit.</span>
            </li>
            <li className="flex items-start gap-2">
              <DatumDisplay datum={datum.unmeasured('The API keeps counters since start and one rolling minute, no history.')} />
              <span><b className="font-semibold">Time series and 5-minute error rates.</b> Only totals since the API started and a 1-minute rate exist.</span>
            </li>
            <li className="flex items-start gap-2">
              <DatumDisplay datum={datum.unmeasured('No response-time target is configured, so no Apdex can be computed.')} />
              <span><b className="font-semibold">Apdex.</b> It needs a response-time target; none is configured.</span>
            </li>
            <li className="flex items-start gap-2">
              <DatumDisplay datum={datum.unmeasured('Nothing probes endpoints; a probe result would be invented.')} />
              <span><b className="font-semibold">Endpoint probes and dependency topology.</b> No probe runs, so none is shown.</span>
            </li>
          </ul>
          {rc?.note && <p className="text-[10px] text-neutral-400 mt-4 leading-relaxed">{rc.note}</p>}
        </div>

        <div className="lg:col-span-7 space-y-4">
          <Panel title="Ingestion" note="Counted since the API started.">
            <Stat label="Spans accepted"><DatumDisplay datum={d(() => ing?.spans_accepted_total, sinceStart)} format="count" /></Stat>
            <Stat label="Spans failed"><DatumDisplay datum={d(() => ing?.spans_failed_total, sinceStart)} format="count" /></Stat>
            <Stat label="Duplicates"><DatumDisplay datum={d(() => ing?.spans_duplicate_total, sinceStart)} format="count" /></Stat>
            <Stat label="Jobs enqueued"><DatumDisplay datum={d(() => ing?.jobs_enqueued_total, sinceStart)} format="count" /></Stat>
            <Stat label="Enqueue failures"><DatumDisplay datum={d(() => ing?.enqueue_failures_total, sinceStart)} format="count" /></Stat>
          </Panel>

          <Panel title="Queue and reliability" note="All evaluation jobs the database knows about.">
            <Stat label="Queued"><DatumDisplay datum={d(() => queue?.by_status?.queued, 'not reported')} format="count" /></Stat>
            <Stat label="Running"><DatumDisplay datum={d(() => queue?.by_status?.running, 'not reported')} format="count" /></Stat>
            <Stat label="Succeeded"><DatumDisplay datum={d(() => queue?.by_status?.succeeded, 'not reported')} format="count" /></Stat>
            <Stat label="Dead letter"><DatumDisplay datum={d(() => queue?.by_status?.dead_letter, 'not reported')} format="count" /></Stat>
            <Stat label="Failure rate"><DatumDisplay datum={d(() => rel?.failure_rate, 'no job has run yet')} format="percentage" /></Stat>
            <Stat label="Retries"><DatumDisplay datum={d(() => rel?.retry_count, 'not reported')} format="count" /></Stat>
          </Panel>

          <Panel title="Workers" note="Evaluation workers that report a heartbeat.">
            <Stat label="Alive"><DatumDisplay datum={d(() => p?.workers?.alive, 'not reported')} format="count" /></Stat>
            <Stat label="Stale" hint={p?.workers?.stale_after_seconds != null ? `after ${p.workers.stale_after_seconds}s` : undefined}>
              <DatumDisplay datum={d(() => p?.workers?.stale, 'not reported')} format="count" />
            </Stat>
            <Stat label="Registered"><DatumDisplay datum={d(() => p?.workers?.registered, 'not reported')} format="count" /></Stat>
          </Panel>
        </div>
      </div>

      <p className="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
        <Cpu className="w-3 h-3" /> Source: /v1/platform, /v1/health/ready, /v1/health/evaluator. Nothing on this tab is computed in the browser except the 5xx share (errors ÷ requests).
      </p>
    </div>
  );
};
