import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Zap,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Flame,
  ArrowUpRight,
  Radio,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { ApiEndpointMetrics, ProductTab } from '../../types';

export interface RollingErrorSample {
  id: string;
  timestamp: number;
  timeLabel: string;
  errorRate: number; // in %
  totalRps: number;
  isSpike?: boolean;
}

export interface SystemStatusBannerProps {
  currentErrorRate: number;
  rolling5mErrorRate: number;
  threshold?: number;
  rollingHistory: RollingErrorSample[];
  endpoints: ApiEndpointMetrics[];
  isSpikeSimulated: boolean;
  isMitigating: boolean;
  mitigationMessage: string | null;
  onTriggerSpike: () => void;
  onRestoreNormal: () => void;
  onAutoMitigate: () => void;
  onNavigateToTrace?: (traceId: string) => void;
  onNavigateTab?: (tab: ProductTab) => void;
}

export const SystemStatusBanner: React.FC<SystemStatusBannerProps> = ({
  currentErrorRate,
  rolling5mErrorRate,
  threshold = 5.0,
  rollingHistory,
  endpoints,
  isSpikeSimulated,
  isMitigating,
  mitigationMessage,
  onTriggerSpike,
  onRestoreNormal,
  onAutoMitigate,
  onNavigateToTrace,
  onNavigateTab
}) => {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);

  const isDegraded = rolling5mErrorRate > threshold;
  const excess = Math.max(0, Math.round((rolling5mErrorRate - threshold) * 100) / 100);
  const degradedEndpoints = endpoints.filter(ep => ep.errorRate > threshold);
  const operationalCount = endpoints.length - degradedEndpoints.length;

  // Gauge percentage (0 to 10% scale)
  const gaugePercent = Math.min(100, Math.max(0, (rolling5mErrorRate / 10) * 100));
  const thresholdMarkPercent = (threshold / 10) * 100; // 50% on a 10% scale

  // Sample trace for drill-down
  const sampleTraceId = 'tr-7921';

  return (
    <div className="space-y-4">
      {/* 1. Real-Time 'System Status' Notification Banner */}
      <div
        id="system-status-banner"
        className={`ios-liquid-card rounded-2xl p-4.5 sm:p-5 relative overflow-hidden transition-all duration-300 ${
          isDegraded
            ? 'border border-rose-500/50 bg-gradient-to-r from-rose-950/40 via-neutral-900/80 to-amber-950/20 shadow-[0_0_25px_rgba(244,63,94,0.18)]'
            : 'border border-emerald-500/30 bg-gradient-to-r from-emerald-950/25 via-neutral-900/70 to-neutral-900/60 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Status Headline & Description */}
          <div className="flex items-start sm:items-center space-x-3.5">
            {/* Status Beacon */}
            <div
              className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                isDegraded
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 phosphor-rose'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {isDegraded ? (
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-2">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        isDegraded ? 'bg-rose-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                        isDegraded
                          ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                          : 'bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                      }`}
                    />
                  </span>

                  <h3
                    className={`font-mono text-sm font-bold tracking-wider uppercase ${
                      isDegraded ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {isDegraded
                      ? 'SYSTEM STATUS: SERVICE DEGRADATION DETECTED'
                      : 'SYSTEM STATUS: ALL SYSTEMS OPERATIONAL'}
                  </h3>
                </div>

                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border ${
                    isDegraded
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-semibold'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}
                >
                  {isDegraded ? 'Threshold Breached (>5.0%)' : 'Nominal SLO Range'}
                </span>

                <span className="text-[11px] font-mono text-neutral-400 flex items-center space-x-1">
                  <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                  <span>Rolling 5-Min Window</span>
                </span>
              </div>

              <p className="text-xs text-neutral-300 mt-1 font-sans leading-relaxed">
                {isDegraded ? (
                  <span className="text-rose-200">
                    Warning: Fleet API error rate over the rolling 5-minute window is currently{' '}
                    <strong className="font-mono font-bold text-rose-400">{rolling5mErrorRate.toFixed(2)}%</strong>{' '}
                    (exceeding the 5.00% critical threshold by +{excess.toFixed(2)}%).
                  </span>
                ) : (
                  <span>
                    Continuous telemetry monitoring across {endpoints.length} critical gateways. Real-time fleet error
                    rate is <strong className="font-mono text-emerald-300">{rolling5mErrorRate.toFixed(2)}%</strong>{' '}
                    (within the 5.00% operational ceiling).
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Real-Time Metrics Chips & Progress Gauge */}
          <div className="flex flex-wrap items-center gap-3 xl:gap-4 self-start xl:self-center">
            {/* Live Instant vs Rolling Comparison Tile */}
            <div className="bg-black/40 border border-white/[0.1] rounded-xl px-3.5 py-2 flex items-center space-x-4 text-xs font-mono">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase block tracking-wider">
                  Instant Error
                </span>
                <span
                  className={`font-bold ${
                    currentErrorRate > threshold ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {currentErrorRate.toFixed(2)}%
                </span>
              </div>

              <div className="h-6 w-[1px] bg-white/[0.1]" />

              <div>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    Rolling 5m Avg
                  </span>
                  <span className="text-[9px] text-neutral-400">/ 5.0%</span>
                </div>
                <span
                  className={`font-bold text-sm ${
                    isDegraded ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {rolling5mErrorRate.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Threshold Progress Bar */}
            <div className="bg-black/40 border border-white/[0.1] rounded-xl px-3.5 py-2 w-44 sm:w-52">
              <div className="flex justify-between items-center text-[10px] font-mono mb-1.5">
                <span className="text-neutral-400">5m Error Gauge</span>
                <span
                  className={`font-semibold ${
                    isDegraded ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {rolling5mErrorRate.toFixed(2)}% / 5.0%
                </span>
              </div>
              <div className="relative h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                {/* 5% Threshold reference line */}
                <div
                  className="absolute top-0 bottom-0 w-[1.5px] bg-white/70 z-10"
                  style={{ left: `${thresholdMarkPercent}%` }}
                  title="5.0% Degradation Threshold"
                />
                {/* Active progress bar */}
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isDegraded
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                      : rolling5mErrorRate > 3.0
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${gaugePercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-mono text-neutral-400 mt-1">
                <span>0%</span>
                <span className="text-rose-400 font-semibold">5% Limit</span>
                <span>10%</span>
              </div>
            </div>

            {/* Interactive Simulation / Mitigation Controls */}
            <div className="flex items-center space-x-2">
              {isDegraded ? (
                <>
                  <button
                    id="auto-mitigate-btn"
                    onClick={onAutoMitigate}
                    disabled={isMitigating}
                    className="px-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/35 text-cyan-300 hover:text-cyan-200 text-xs font-mono font-medium transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isMitigating ? 'animate-spin' : ''}`} />
                    <span>{isMitigating ? 'Mitigating...' : 'Auto-Mitigate'}</span>
                  </button>

                  <button
                    id="restore-normal-btn"
                    onClick={onRestoreNormal}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-white/[0.15] text-neutral-200 hover:text-white text-xs font-mono font-medium transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Reset Normal</span>
                  </button>
                </>
              ) : (
                <button
                  id="simulate-spike-btn"
                  onClick={onTriggerSpike}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 hover:text-rose-200 text-xs font-mono font-medium transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer group"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span>Simulate Spike (&gt;5%)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Temporary Mitigation Status Toast */}
        {mitigationMessage && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono flex items-center space-x-2 animate-fadeIn">
            <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span>{mitigationMessage}</span>
          </div>
        )}
      </div>

      {/* 2. 'Service Degradation' Warning Card (Triggered if rolling 5m error rate > 5%) */}
      <AnimatePresence>
        {isDegraded && (
          <motion.div
            id="service-degradation-card"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="ios-liquid-card rounded-2xl p-5 sm:p-6 relative overflow-hidden border border-rose-500/50 bg-gradient-to-br from-rose-950/40 via-neutral-900/95 to-amber-950/20 shadow-[0_0_35px_rgba(244,63,94,0.18)]"
          >
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

            {/* Alert Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-rose-500/20">
              <div className="flex items-start sm:items-center space-x-3.5">
                <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 phosphor-rose shrink-0">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2.5">
                    <h4 className="text-base font-sans font-bold text-white tracking-tight">
                      Service Degradation Warning
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase font-bold tracking-wider">
                      Rolling 5m Error Rate: {rolling5mErrorRate.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 font-sans mt-1">
                    Fleet API error rate over the rolling 5-minute window has exceeded the{' '}
                    <strong className="text-rose-400 font-mono">5.00% critical degradation threshold</strong>{' '}
                    by <strong className="text-rose-400 font-mono">+{excess.toFixed(2)}%</strong>. Gateway request
                    dropouts and latency spikes detected.
                  </p>
                </div>
              </div>

              {/* Quick Actions in Header */}
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 hover:text-white text-xs font-mono transition-colors flex items-center space-x-1"
                >
                  <span>{isDetailsExpanded ? 'Collapse' : 'Details'}</span>
                  {isDetailsExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Detailed Degradation Breakdown (Expandable) */}
            {isDetailsExpanded && (
              <div className="mt-5 space-y-5">
                {/* 3-Column Diagnostic Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metric Tile 1: 5m Window Rate */}
                  <div className="bg-black/50 border border-rose-500/25 rounded-xl p-4">
                    <div className="flex items-center justify-between text-neutral-400 text-xs mb-1 font-mono">
                      <span>5m Rolling Average</span>
                      <span className="text-rose-400 font-bold">CRITICAL</span>
                    </div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-3xl font-mono font-black text-rose-400">
                        {rolling5mErrorRate.toFixed(2)}%
                      </span>
                      <span className="text-xs font-mono text-neutral-400">vs 5.0% Limit</span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-rose-300/90 flex items-center space-x-1">
                      <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                      <span>+{excess.toFixed(2)}% above SLO margin</span>
                    </div>
                  </div>

                  {/* Metric Tile 2: Impacted Gateways */}
                  <div className="bg-black/50 border border-rose-500/25 rounded-xl p-4">
                    <div className="flex items-center justify-between text-neutral-400 text-xs mb-1 font-mono">
                      <span>Breached Endpoints</span>
                      <span className="text-amber-400 font-bold">{degradedEndpoints.length} Gateway(s)</span>
                    </div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-3xl font-mono font-black text-amber-300">
                        {degradedEndpoints.length}
                      </span>
                      <span className="text-xs font-mono text-neutral-400">of {endpoints.length} total</span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-neutral-300">
                      Primary drop: Model Gateway (HTTP 504 / 429)
                    </div>
                  </div>

                  {/* Metric Tile 3: SLO Burn Rate */}
                  <div className="bg-black/50 border border-rose-500/25 rounded-xl p-4">
                    <div className="flex items-center justify-between text-neutral-400 text-xs mb-1 font-mono">
                      <span>SLO Burn Rate</span>
                      <span className="text-rose-400 font-bold">4.6x Rate</span>
                    </div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-3xl font-mono font-black text-white">
                        4.6<span className="text-base font-normal text-rose-400">x</span>
                      </span>
                      <span className="text-xs font-mono text-neutral-400">vs 1.0x baseline</span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-neutral-400">
                      Error budget burn: ~14.2% / hour
                    </div>
                  </div>
                </div>

                {/* Breached Endpoints List */}
                <div className="bg-black/40 border border-white/[0.08] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 text-xs font-mono">
                    <div className="flex items-center space-x-2">
                      <Flame className="w-4 h-4 text-rose-400" />
                      <span className="text-white font-semibold uppercase tracking-wider">
                        Gateways Exceeding 5.0% Threshold
                      </span>
                    </div>
                    <span className="text-neutral-400 text-[11px]">
                      Sorted by error severity
                    </span>
                  </div>

                  <div className="space-y-2">
                    {degradedEndpoints.map(ep => (
                      <div
                        key={ep.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-rose-500/20 hover:border-rose-500/40 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {ep.method}
                          </span>
                          <span className="font-mono text-xs text-white font-medium truncate">
                            {ep.path}
                          </span>
                          <span className="text-[11px] font-sans text-neutral-400 truncate hidden md:inline">
                            • {ep.service}
                          </span>
                        </div>

                        <div className="flex items-center space-x-4 shrink-0 text-xs font-mono">
                          <div>
                            <span className="text-neutral-400 text-[10px] block">Error Rate</span>
                            <span className="text-rose-400 font-bold">{ep.errorRate.toFixed(2)}%</span>
                          </div>
                          <div>
                            <span className="text-neutral-400 text-[10px] block">Throughput</span>
                            <span className="text-white">{ep.throughputRps.toFixed(1)} rps</span>
                          </div>
                          <div>
                            <span className="text-neutral-400 text-[10px] block">Top Code</span>
                            <span className="text-rose-300">HTTP 504</span>
                          </div>
                          {onNavigateToTrace && (
                            <button
                              onClick={() => onNavigateToTrace('tr-7921')}
                              className="px-2 py-1 rounded bg-white/[0.08] hover:bg-white/[0.14] text-[11px] text-neutral-200 hover:text-white transition-colors"
                              title="Inspect failing execution trace"
                            >
                              Trace
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5-Minute Window Telemetry Timeline (Last 10 Samples) */}
                <div className="bg-black/40 border border-white/[0.08] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2 text-xs font-mono">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-neutral-300 uppercase tracking-wider">
                        Rolling 5-Minute Error Sample Timeline
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-[11px]">
                      <span className="flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-neutral-400">&gt;5% Breach</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-neutral-400">&lt;5% Nominal</span>
                      </span>
                      <span className="text-rose-400 font-semibold border-l border-white/[0.1] pl-3">
                        Threshold: 5.0%
                      </span>
                    </div>
                  </div>

                  {/* Micro-sparkbar ledger */}
                  <div className="grid grid-cols-10 gap-1.5 pt-2">
                    {rollingHistory.slice(-10).map((sample, idx) => {
                      const isBreach = sample.errorRate > threshold;
                      const heightPercent = Math.min(100, Math.max(15, (sample.errorRate / 10) * 100));
                      return (
                        <div
                          key={sample.id || idx}
                          className="flex flex-col items-center group relative cursor-pointer"
                        >
                          <div className="h-14 w-full bg-neutral-900/80 rounded-md flex items-end p-1 border border-white/[0.06]">
                            <div
                              className={`w-full rounded transition-all ${
                                isBreach
                                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                                  : 'bg-emerald-500/80'
                              }`}
                              style={{ height: `${heightPercent}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-neutral-400 mt-1 truncate">
                            {sample.timeLabel.split(':').slice(1).join(':')}
                          </span>

                          {/* Hover Tooltip */}
                          <div className="absolute bottom-full mb-2 hidden group-hover:block z-30 px-2 py-1 bg-neutral-900 border border-white/[0.2] rounded text-[10px] font-mono text-white whitespace-nowrap shadow-lg">
                            <span className="text-neutral-400">{sample.timeLabel}:</span>{' '}
                            <strong className={isBreach ? 'text-rose-400' : 'text-emerald-400'}>
                              {sample.errorRate.toFixed(2)}%
                            </strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mitigation Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center space-x-2.5">
                    <button
                      id="action-auto-mitigate"
                      onClick={onAutoMitigate}
                      disabled={isMitigating}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-mono font-bold transition-all flex items-center space-x-2 shadow-[0_0_15px_rgba(244,63,94,0.3)] cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 ${isMitigating ? 'animate-spin' : ''}`} />
                      <span>{isMitigating ? 'Executing Mitigation...' : 'Auto-Throttle & Failover'}</span>
                    </button>

                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab('traces')}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-neutral-200 hover:text-white text-xs font-mono font-medium transition-colors flex items-center space-x-1.5"
                      >
                        <span>Inspect Breached Traces</span>
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={onRestoreNormal}
                    className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-white/[0.12] text-neutral-300 hover:text-white text-xs font-mono transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Clear Spike / Restore Baseline</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
