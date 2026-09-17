import React, { useEffect, useState } from 'react';
import { Gauge, AlertTriangle, RefreshCw } from 'lucide-react';
import { api, PlatformHealth, Percentiles } from '../../lib/api';

/** Operational metrics for this instance, read from /v1/platform.
 *
 * The previous version of this file was 1,110 lines of per-endpoint APM -- p50
 * through p99, throughput and a status-code breakdown for each route -- backed
 * by `../../data/mockPerformanceMetrics`, a module that was never committed. It
 * therefore did not compile, was imported nowhere, and the tab that navigates
 * here rendered nothing.
 *
 * Per-endpoint metrics cannot be shown honestly, because they are not measured:
 * RequestMetricsMiddleware records a duration and a status code and does not
 * record the path. So this view reports what the instance does measure, and
 * says plainly where a number is missing rather than filling it in.
 */

const POLL_MS = 10000;

function num(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function ms(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${num(value, 1)} ms`;
}

function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">{label}</div>
    <div className="text-lg text-neutral-100 font-semibold mt-1 tabular-nums">{value}</div>
    {hint && <div className="text-[10px] text-neutral-500 mt-0.5">{hint}</div>}
  </div>
);

const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => (
  <div className="ios-liquid-card border-glow-subtle rounded-2xl p-5 font-mono relative overflow-hidden">
    <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
    <h3 className="text-xs uppercase tracking-wider text-neutral-300 font-semibold">{title}</h3>
    {note && <p className="text-[10px] text-neutral-500 mt-1 leading-relaxed">{note}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">{children}</div>
  </div>
);

const PercentileRow: React.FC<{ label: string; p: Percentiles | undefined }> = ({ label, p }) => (
  <>
    <Stat label={`${label} p50`} value={ms(p?.p50)} />
    <Stat label={`${label} p95`} value={ms(p?.p95)} />
  </>
);

export const PerformanceView: React.FC = () => {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getPlatformHealth();
        if (cancelled) return;
        setHealth(data);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Could not read /v1/platform');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const rc = health?.runtime_counters;
  const apiC = rc?.api;
  const ing = rc?.ingestion;
  const timing = health?.evaluation_timing;
  const rel = health?.reliability;
  const q = health?.evaluation_queue;

  return (
    <div className="space-y-6 pb-28">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Gauge className="w-5 h-5 text-neutral-400" />
            <span>Performance</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            What this instance measures about itself, polled every 10 seconds
          </p>
        </div>
        <button
          onClick={() => setTick((t) => t + 1)}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-mono text-neutral-200 flex items-center space-x-1.5 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.07] p-4 font-mono text-xs text-rose-300 flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {!health && !error && (
        <div className="font-mono text-xs text-neutral-400">Reading /v1/platform…</div>
      )}

      {health && (
        <>
          <Panel
            title={`State: ${health.state}`}
            note={
              health.reasons?.length
                ? health.reasons.join(' · ')
                : 'No degradation reported by the platform check.'
            }
          >
            <Stat label="Uptime" value={duration(rc?.uptime_seconds)} />
            <Stat label="Workers alive" value={num(health.workers?.alive)} />
            <Stat
              label="Workers stale"
              value={num(health.workers?.stale)}
              hint={
                health.workers?.stale_after_seconds != null
                  ? `stale after ${health.workers.stale_after_seconds}s`
                  : undefined
              }
            />
            <Stat label="Queue depth" value={num(q?.depth)} hint={`threshold ${num(q?.backlog_threshold)}`} />
          </Panel>

          <Panel
            title="API"
            note="Instance-wide. Per-endpoint figures are absent because the request middleware records a duration and a status code, not the path."
          >
            <Stat label="Requests" value={num(apiC?.requests_total)} />
            <Stat label="Req/sec (1m)" value={num(apiC?.requests_per_sec_1m, 2)} />
            <Stat label="Server errors" value={num(apiC?.server_errors_total)} />
            <Stat
              label="Latency p50"
              value={ms(apiC?.latency_ms?.p50)}
              hint={apiC?.latency_ms?.samples != null ? `${apiC.latency_ms.samples} samples` : undefined}
            />
            <Stat label="Latency p95" value={ms(apiC?.latency_ms?.p95)} />
            <Stat label="Latency p99" value={ms(apiC?.latency_ms?.p99)} />
          </Panel>

          <Panel title="Ingestion">
            <Stat label="Spans accepted" value={num(ing?.spans_accepted_total)} />
            <Stat label="Spans failed" value={num(ing?.spans_failed_total)} />
            <Stat label="Duplicates" value={num(ing?.spans_duplicate_total)} />
            <Stat label="Spans/sec (1m)" value={num(ing?.spans_per_sec_1m, 2)} />
            <Stat label="Jobs enqueued" value={num(ing?.jobs_enqueued_total)} />
            <Stat label="Enqueue failures" value={num(ing?.enqueue_failures_total)} />
          </Panel>

          <Panel
            title="Evaluation pipeline"
            note={
              timing?.sample_size != null
                ? `Over the last ${timing.sample_size} evaluated spans. Queue wait is time spent waiting for a worker; evaluation is the models themselves.`
                : 'No evaluated spans sampled yet.'
            }
          >
            <PercentileRow label="Queue wait" p={timing?.queue_wait_ms} />
            <PercentileRow label="Evaluation" p={timing?.evaluation_ms} />
            <PercentileRow label="End to end" p={timing?.end_to_end_ms} />
          </Panel>

          <Panel title="Queue and reliability">
            <Stat label="Queued" value={num(q?.by_status?.queued)} />
            <Stat label="Running" value={num(q?.by_status?.running)} />
            <Stat label="Succeeded" value={num(q?.by_status?.succeeded)} />
            <Stat label="Dead letter" value={num(q?.by_status?.dead_letter)} />
            <Stat label="Jobs completed" value={num(rel?.jobs_completed)} hint={`of ${num(rel?.jobs_total)}`} />
            <Stat label="Terminal failures" value={num(rel?.terminal_failures)} />
            <Stat label="Failure rate" value={rel?.failure_rate != null ? `${num(rel.failure_rate * 100, 2)}%` : '—'} />
            <Stat label="Retries" value={num(rel?.retry_count)} />
          </Panel>

          {rc?.note && (
            <p className="font-mono text-[11px] text-neutral-500 leading-relaxed max-w-3xl">{rc.note}</p>
          )}
        </>
      )}
    </div>
  );
};
