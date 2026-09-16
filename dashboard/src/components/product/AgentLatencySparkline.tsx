import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  XAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { Agent, LatencyDataPoint } from '../../types';
import { generate60MinLatencyData, computeLatency60mSummary } from '../../utils/latencyTelemetry';
import { TrendingUp, AlertTriangle, ShieldCheck, ShieldAlert, Activity, ArrowUpRight, Clock } from 'lucide-react';

interface AgentLatencySparklineProps {
  agent: Agent;
  variant?: 'compact' | 'detailed';
  className?: string;
  height?: number;
}

export const AgentLatencySparkline: React.FC<AgentLatencySparklineProps> = ({
  agent,
  variant = 'compact',
  className = '',
  height
}) => {
  const data: LatencyDataPoint[] = React.useMemo(() => {
    return agent.latencyHistory60m || generate60MinLatencyData(agent);
  }, [agent]);

  const summary = React.useMemo(() => computeLatency60mSummary(data), [data]);

  // Color selection based on drift status
  const isDrift = agent.driftStatus === 'drift';
  const isDeviation = agent.driftStatus === 'deviation';

  const strokeColor = isDrift ? '#f43f5e' : isDeviation ? '#f59e0b' : '#10b981';
  const gradientId = `latency-grad-${agent.id}-${variant}`;
  const fillStartColor = isDrift ? 'rgba(244, 63, 94, 0.45)' : isDeviation ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.3)';
  const fillEndColor = isDrift ? 'rgba(244, 63, 94, 0.0)' : isDeviation ? 'rgba(245, 158, 11, 0.0)' : 'rgba(16, 185, 129, 0.0)';

  // Calculate safe Y-axis domain
  const yMin = Math.max(0, Math.floor(summary.minMs * 0.8));
  const yMax = Math.ceil(summary.maxMs * 1.15);

  if (variant === 'compact') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center space-x-1 text-neutral-400">
            <Activity className="w-3 h-3 text-neutral-500" />
            <span>60m Latency Drift</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span
              className={`font-semibold flex items-center ${
                summary.driftDeltaPct > 50
                  ? 'text-rose-400 phosphor-rose'
                  : summary.driftDeltaPct > 15
                  ? 'text-amber-400 phosphor-amber'
                  : 'text-emerald-400 phosphor-emerald'
              }`}
            >
              {summary.driftDeltaPct > 0 ? `+${summary.driftDeltaPct}%` : `${summary.driftDeltaPct}%`}
              {summary.driftDeltaPct > 15 && <ArrowUpRight className="w-2.5 h-2.5 ml-0.5" />}
            </span>
            <span className="text-neutral-500">({summary.currentMs}ms)</span>
          </div>
        </div>

        {/* Compact Sparkline Container */}
        <div className="w-full h-12 bg-black/40 rounded-lg p-1 border border-white/[0.06] overflow-hidden relative group">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fillStartColor} />
                  <stop offset="100%" stopColor={fillEndColor} />
                </linearGradient>
              </defs>
              <YAxis domain={[yMin, yMax]} hide />
              <ReferenceLine
                y={summary.baselineMs}
                stroke="#ffffff"
                strokeOpacity={0.15}
                strokeDasharray="2 2"
              />
              {summary.anomalyCount > 0 && (
                <ReferenceLine
                  y={summary.driftThresholdMs}
                  stroke={isDrift ? '#f43f5e' : '#f59e0b'}
                  strokeOpacity={0.3}
                  strokeDasharray="3 3"
                />
              )}
              <Tooltip
                isAnimationActive={false}
                allowEscapeViewBox={{ x: true, y: true }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as LatencyDataPoint;
                    const diff = d.latencyMs - d.baselineMs;
                    const diffPct = Math.round((diff / d.baselineMs) * 100);
                    return (
                      <div className="bg-[#0b0c10]/95 backdrop-blur-md border border-white/25 rounded-lg px-2.5 py-1.5 shadow-2xl text-[10px] font-mono text-white pointer-events-none z-50 min-w-[130px]">
                        <div className="flex items-center justify-between space-x-2 text-neutral-400 pb-1 border-b border-white/10">
                          <span className="font-semibold text-neutral-300">{d.timestamp}</span>
                          <span className="text-[9px] text-neutral-400">{d.timeAgo}</span>
                        </div>
                        <div className="flex items-center justify-between space-x-2 pt-1">
                          <span className="text-neutral-400">Latency:</span>
                          <span className="font-bold text-white text-xs">{d.latencyMs.toLocaleString()} ms</span>
                        </div>
                        <div className="flex items-center justify-between space-x-2 text-[9px] pt-0.5">
                          <span className="text-neutral-400">vs Base:</span>
                          <span
                            className={`font-semibold ${
                              diff > 0
                                ? diffPct > 35
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {diff > 0 ? `+${diff}ms (+${diffPct}%)` : `${diff}ms (${diffPct}%)`}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="latencyMs"
                stroke={strokeColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                activeDot={{
                  r: 3.5,
                  stroke: '#ffffff',
                  strokeWidth: 1.5,
                  fill: strokeColor
                }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Sparkline Baseline Indicator */}
          <div className="absolute bottom-1 right-2 pointer-events-none text-[8px] font-mono text-neutral-500 opacity-60">
            base: {summary.baselineMs}ms
          </div>
        </div>
      </div>
    );
  }

  // Detailed view for Inspector Deep Dive
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Detailed Telemetry Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">CURRENT LATENCY</span>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-white font-bold text-sm">{summary.currentMs}ms</span>
            <span
              className={`text-[10px] ${
                summary.driftDeltaPct > 40
                  ? 'text-rose-400'
                  : summary.driftDeltaPct > 15
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              ({summary.driftDeltaPct > 0 ? `+${summary.driftDeltaPct}%` : `${summary.driftDeltaPct}%`})
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">60m P95 LATENCY</span>
          <span className="text-white font-bold text-sm mt-1 block">{summary.p95Ms}ms</span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">BASELINE TARGET</span>
          <span className="text-neutral-300 font-bold text-sm mt-1 block">{summary.baselineMs}ms</span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">DRIFT STATUS</span>
          <div className="flex items-center space-x-1.5 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isDrift ? 'bg-rose-400 phosphor-rose animate-pulse' : isDeviation ? 'bg-amber-400 phosphor-amber' : 'bg-emerald-400 phosphor-emerald'
              }`}
            />
            <span
              className={`text-xs font-bold uppercase ${
                isDrift ? 'text-rose-400 phosphor-rose' : isDeviation ? 'text-amber-400 phosphor-amber' : 'text-emerald-400 phosphor-emerald'
              }`}
            >
              {agent.driftStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Main Detailed Chart Canvas */}
      <div className="p-4 rounded-xl bg-black/40 border border-white/[0.1] space-y-2 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-neutral-400" />
            <span className="text-white font-semibold uppercase tracking-wider text-[11px]">
              60-Minute Latency Drift Trajectory
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[10px] text-neutral-400">
            <div className="flex items-center space-x-1">
              <div className="w-2.5 h-0.5 bg-white/40 border-dashed" />
              <span>Baseline ({summary.baselineMs}ms)</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2.5 h-0.5 bg-amber-500/80 border-dashed" />
              <span>Threshold ({summary.driftThresholdMs}ms)</span>
            </div>
            {summary.anomalyCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300 font-semibold">
                {summary.anomalyCount} Spikes
              </span>
            )}
          </div>
        </div>

        <div className="w-full h-48 sm:h-56 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fillStartColor} />
                  <stop offset="100%" stopColor={fillEndColor} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="timeLabel"
                stroke="#52525b"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
              />
              <YAxis
                domain={[yMin, yMax]}
                stroke="#52525b"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
                unit="ms"
              />
              <ReferenceLine
                y={summary.baselineMs}
                stroke="#ffffff"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
                label={{
                  value: `Target ${summary.baselineMs}ms`,
                  position: 'insideBottomLeft',
                  fill: '#a1a1aa',
                  fontSize: 9
                }}
              />
              <ReferenceLine
                y={summary.driftThresholdMs}
                stroke={isDrift ? '#f43f5e' : '#f59e0b'}
                strokeOpacity={0.45}
                strokeDasharray="4 4"
                label={{
                  value: `SLA Alert ${summary.driftThresholdMs}ms`,
                  position: 'insideTopRight',
                  fill: isDrift ? '#f43f5e' : '#f59e0b',
                  fontSize: 9
                }}
              />
              <Tooltip
                isAnimationActive={false}
                allowEscapeViewBox={{ x: true, y: true }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as LatencyDataPoint;
                    const diff = d.latencyMs - d.baselineMs;
                    const diffPct = Math.round((diff / d.baselineMs) * 100);
                    return (
                      <div className="bg-[#0b0c10]/95 backdrop-blur-md border border-white/20 rounded-xl p-3 shadow-2xl text-xs font-mono text-white space-y-1.5 min-w-[200px]">
                        <div className="flex items-center justify-between space-x-3 text-neutral-400 text-[11px] pb-1.5 border-b border-white/10">
                          <span className="flex items-center space-x-1.5">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <span className="text-white font-bold">{d.timestamp}</span>
                          </span>
                          <span className="text-neutral-400 font-medium">{d.timeAgo}</span>
                        </div>
                        <div className="flex items-center justify-between space-x-3 pt-0.5">
                          <span className="text-neutral-300">Exact Latency:</span>
                          <span className="font-bold text-white text-sm tracking-wide">{d.latencyMs.toLocaleString()} ms</span>
                        </div>
                        <div className="flex items-center justify-between space-x-3 text-[11px]">
                          <span className="text-neutral-400">Baseline Variance:</span>
                          <span
                            className={`font-semibold ${
                              diff > 0 ? (diffPct > 35 ? 'text-rose-400' : 'text-amber-400') : 'text-emerald-400'
                            }`}
                          >
                            {diff > 0 ? `+${diff.toLocaleString()}ms (+${diffPct}%)` : `${diff.toLocaleString()}ms (${diffPct}%)`}
                          </span>
                        </div>
                        <div className="pt-1 flex items-center justify-between text-[10px] border-t border-white/[0.06]">
                          <span className="text-neutral-400">Drift Status:</span>
                          <span
                            className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] flex items-center space-x-1 ${
                              d.status === 'drift'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : d.status === 'deviation'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                d.status === 'drift'
                                  ? 'bg-rose-400 animate-pulse'
                                  : d.status === 'deviation'
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                              }`}
                            />
                            <span>{d.status}</span>
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="latencyMs"
                stroke={strokeColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                activeDot={{
                  r: 5,
                  stroke: '#ffffff',
                  strokeWidth: 2,
                  fill: strokeColor
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Diagnostic Annotation based on drift state */}
        <div className="pt-2 border-t border-white/[0.08] text-[11px] font-mono text-neutral-300 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            {isDrift ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : isDeviation ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>
              {isDrift
                ? 'Severe performance divergence detected: Response latency drifted +140% above historical baseline.'
                : isDeviation
                ? 'Moderate performance degradation: Latency variance exceeded allowable warning threshold in the last 20m.'
                : 'Optimal operating trajectory: Measured latency closely tracks baseline SLA target.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
