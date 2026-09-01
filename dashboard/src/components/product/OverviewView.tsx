import React from 'react';
import { Bot, AlertTriangle, TrendingDown, Activity, ArrowRight, Clock, ShieldCheck, Zap } from 'lucide-react';
import { Agent, Trace, Incident, DriftProfile } from '../../types';

interface OverviewViewProps {
  agents: Agent[];
  traces: Trace[];
  incidents: Incident[];
  driftProfiles: DriftProfile[];
  onSelectAgent: (agent: Agent) => void;
  onSelectTrace: (trace: Trace) => void;
  onSelectIncident: (incident: Incident) => void;
  onNavigateTab: (tab: any) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  agents,
  traces,
  incidents,
  driftProfiles,
  onSelectAgent,
  onSelectTrace,
  onSelectIncident,
  onNavigateTab
}) => {
  // Aggregate KPIs
  const totalTraces = agents.reduce((acc, a) => acc + (a.totalTraces24h ?? 0), 0);
  const divergences = agents.map(a => a.driftScore).filter((v): v is number => v != null);
  const maxDivergence = divergences.length ? Math.max(...divergences) : null;
  const latencies = agents.map(a => a.latencyAvgMs).filter((v): v is number => v != null);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length)
    : null;
  const criticalIncidents = incidents.filter(i => i.severity === 'critical').length;
  // Only agents whose drift windows filled AND exceeded the threshold. An
  // absent driftStatus means 'not yet measurable', not 'drifting'.
  const driftingAgents = agents.filter(a => a.driftStatus === 'drift').length;
  const unmeasuredAgents = agents.filter(a => a.driftStatus == null).length;

  return (
    <div className="space-y-8 pb-28">
      {/* Top Section: System Pulse & Aggregate Density Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: 24h Trace Volume */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-3">
            <span className="font-sans font-medium tracking-wider text-[11px] text-neutral-400 uppercase liquid-card-label">
              Spans Ingested
            </span>
            <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-neutral-200">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none drop-shadow-xs liquid-card-metric">
            {totalTraces.toLocaleString()}
          </div>
          <div className="text-xs font-mono tabular-nums text-neutral-300 mt-3.5 flex items-center space-x-2 pt-2.5 border-t border-white/[0.08]">
            <span className="text-neutral-400 font-sans text-[11px] liquid-card-label">across {agents.length} agents, all time</span>
          </div>
        </div>

        {/* KPI 2: Avg Latency */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-3">
            <span className="font-sans font-medium tracking-wider text-[11px] text-neutral-400 uppercase liquid-card-label">
              Avg Inference Latency
            </span>
            <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-neutral-200">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none drop-shadow-xs liquid-card-metric">
            {avgLatency ?? String.fromCharCode(8212)} <span className="text-base text-neutral-400 font-normal">ms</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-neutral-300 mt-3.5 flex items-center space-x-2 pt-2.5 border-t border-white/[0.08]">
            <span className="text-neutral-400 font-sans liquid-card-label">mean of {latencies.length} agents reporting latency</span>
          </div>
        </div>

        {/* KPI 3: Active Incidents */}
        <div
          onClick={() => onNavigateTab('incidents')}
          className={`ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden cursor-pointer group ${
            criticalIncidents > 0
              ? 'hover:border-rose-400/60 hover:shadow-[0_0_30px_rgba(244,63,94,0.22)]'
              : 'hover:border-white/30'
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="font-sans font-medium tracking-wider text-[11px] text-rose-300/90 uppercase liquid-card-label">
              Active Incidents
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none flex items-baseline space-x-2 drop-shadow-xs liquid-card-metric">
            <span>{incidents.length}</span>
            <span className="text-xs font-sans text-rose-300/90 font-medium">({criticalIncidents} critical)</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-rose-300/90 mt-3.5 flex items-center space-x-1.5 font-medium pt-2.5 border-t border-rose-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            <span className="text-[11px] font-sans text-rose-200/80">{criticalIncidents} of {incidents.length} at high severity</span>
          </div>
        </div>

        {/* KPI 4: Behavioral Drift */}
        <div
          onClick={() => onNavigateTab('drift')}
          className={`ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden cursor-pointer group ${
            driftingAgents > 0
              ? 'hover:border-amber-400/60 hover:shadow-[0_0_30px_rgba(245,158,11,0.22)]'
              : 'hover:border-white/30'
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="font-sans font-medium tracking-wider text-[11px] text-amber-300/90 uppercase liquid-card-label">
              Behavioral Drift
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none flex items-baseline space-x-2 drop-shadow-xs liquid-card-metric">
            <span>{driftingAgents}</span>
            <span className="text-xs font-sans text-amber-300/90 font-medium">of {agents.length - unmeasuredAgents} measurable</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-amber-300/90 mt-3.5 font-medium pt-2.5 border-t border-amber-500/25 flex items-center justify-between">
            <span className="text-[11px] font-sans text-neutral-400 liquid-card-label">Max divergence:</span>
            <span className="font-mono tabular-nums font-medium text-[10px] bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 uppercase tracking-wider">{maxDivergence != null ? `${maxDivergence.toFixed(3)} Δ` : String.fromCharCode(8212)}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Swarm Roster (Left) & Navigable Trace Scatter/List (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent Roster with Liquid Glass Header & Cards */}
        <div className="lg:col-span-7 ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="px-5 py-4 border-b border-white/[0.12] flex items-center justify-between bg-white/[0.04] backdrop-blur-xl">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-white/[0.08] text-white border border-white/[0.14] shadow-xs">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-sans font-medium text-white tracking-wide liquid-card-title">
                  Autonomous Agent Swarm Roster
                </h3>
                <p className="text-xs font-sans text-neutral-400 mt-0.5 liquid-card-label">
                  Real-time telemetry, framework bindings &amp; execution profiles
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('agents')}
              className="text-xs font-sans font-medium text-neutral-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.14] flex items-center space-x-1.5 transition-all shadow-xs"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3.5 space-y-3">
            {agents.map((agent) => {
              return (
                <div
                  key={agent.id}
                  onClick={() => {
                    onSelectAgent(agent);
                    onNavigateTab('agents');
                  }}
                  className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer transition-all duration-300 relative group gap-3.5 overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center space-x-3.5 min-w-0">
                    {/* Semantic State Dot */}
                    <div className="shrink-0 text-sm font-mono flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.12] shadow-xs">
                      {agent.status === 'idle' && <span className="text-neutral-500">○</span>}
                      {agent.status === 'running' && <span className="text-emerald-400 font-bold drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]">◉</span>}
                      {agent.status === 'warning' && <span className="text-amber-400/90 font-bold drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]">◉</span>}
                      {agent.status === 'critical' && <span className="text-rose-400/90 font-bold animate-pulse drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]">◉</span>}
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-sans font-medium text-white truncate flex items-center space-x-2 tracking-tight liquid-card-title">
                        <span className="group-hover:text-emerald-300 transition-colors">{agent.name}</span>
                        {agent.driftStatus !== 'normal' && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
                        )}
                      </div>
                      <div className="text-xs font-sans text-neutral-400 flex items-center space-x-2 mt-1 liquid-card-label">
                        <span className="text-neutral-200 font-mono text-[10px] font-medium px-2 py-0.5 rounded bg-white/[0.08] border border-white/[0.12] uppercase tracking-wider">
                          {agent.framework}
                        </span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-neutral-300 font-mono text-[11px]">{agent.model}</span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-neutral-400 font-mono text-[11px]">{agent.version}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-5 shrink-0 text-right font-mono text-xs pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/[0.08]">
                    <div>
                      <div className="text-sm font-mono tabular-nums text-neutral-100 font-medium tracking-tight liquid-card-metric">{agent.latencyAvgMs}ms</div>
                      <div className="text-[10px] font-sans text-neutral-400 uppercase tracking-widest font-normal mt-0.5 liquid-card-label">avg latency</div>
                    </div>
                    <div>
                      <div className={`text-sm font-mono tabular-nums font-medium tracking-tight liquid-card-metric ${agent.successRate < 90 ? 'text-rose-400/90' : 'text-emerald-400/90'}`}>
                        {agent.successRate}%
                      </div>
                      <div className="text-[10px] font-sans text-neutral-400 uppercase tracking-widest font-normal mt-0.5 liquid-card-label">success rate</div>
                    </div>
                    <div>
                      <div
                        className={`text-[10px] font-mono tabular-nums font-medium uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-xs ${
                          agent.driftStatus === 'normal'
                            ? 'border-white/[0.12] text-neutral-200 bg-white/[0.06]'
                            : agent.driftStatus === 'deviation'
                            ? 'border-amber-500/40 text-amber-300 bg-amber-500/20 shadow-[0_0_14px_rgba(245,158,11,0.15)]'
                            : 'border-rose-500/40 text-rose-300 bg-rose-500/20 shadow-[0_0_14px_rgba(244,63,94,0.15)]'
                        }`}
                      >
                        {(agent.driftStatus ?? "no baseline").toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Incident Stream & Failure-First Drill-Down */}
        <div className="lg:col-span-5 space-y-4">
          <div className="ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
            <div className="px-5 py-4 border-b border-white/[0.12] flex items-center justify-between bg-white/[0.04] backdrop-blur-xl">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-300" />
                </div>
                <div>
                  <h3 className="text-sm font-sans font-medium text-white tracking-wide liquid-card-title">
                    Active Incidents
                  </h3>
                  <p className="text-xs font-sans text-neutral-400 mt-0.5 liquid-card-label">
                    Failure-first automated triage spine
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigateTab('incidents')}
                className="text-xs font-sans font-medium text-neutral-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.14] flex items-center space-x-1.5 transition-all shadow-xs"
              >
                <span>All Incidents</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3.5 space-y-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => {
                    onSelectIncident(incident);
                    onNavigateTab('incidents');
                  }}
                  className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-xl p-4 cursor-pointer transition-all duration-300 space-y-2.5 relative group overflow-hidden hover:border-rose-400/50 hover:shadow-[0_0_24px_rgba(244,63,94,0.18)]"
                >
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-medium tracking-wider uppercase ${
                        incident.severity === 'critical'
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-500/45'
                          : 'bg-amber-500/25 text-amber-300 border border-amber-500/45'
                      }`}
                    >
                      {incident.severity}
                    </span>
                    <span className="text-neutral-400 text-[11px] font-mono tabular-nums liquid-card-label">{incident.detectedAt}</span>
                  </div>

                  <div className="text-sm font-sans font-medium text-white group-hover:text-rose-300 transition-colors leading-snug tracking-tight liquid-card-title">
                    {incident.title}
                  </div>

                  <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed font-sans liquid-card-label">
                    {incident.summary}
                  </p>

                  <div className="flex items-center justify-between text-xs text-neutral-400 pt-2.5 border-t border-white/[0.08]">
                    <span className="text-neutral-200 font-sans font-medium">{incident.agentName}</span>
                    <span className="text-rose-300/90 font-mono tabular-nums font-medium text-[10px] uppercase tracking-wider bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/30">
                      {incident.affectedRunsCount} runs affected
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Navigable Interactive Trace Scatter Plot */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3 pb-4 border-b border-white/[0.12]">
          <div>
            <h3 className="text-sm font-sans font-medium text-white tracking-wide flex items-center space-x-2 liquid-card-title">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Navigable Trace Latency &amp; Token Scatter</span>
            </h3>
            <p className="text-xs text-neutral-400 font-sans mt-1 liquid-card-label">
              Click any execution point to pivot directly into the trace waterfall &amp; span root-cause.
            </p>
          </div>
          <div className="flex items-center space-x-4 text-xs font-sans text-neutral-300">
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              <span className="font-medium text-neutral-200">OK</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
              <span className="font-medium text-neutral-200">Warning</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
              <span className="font-medium text-neutral-200">Error</span>
            </span>
          </div>
        </div>

        {/* Visual Trace Scatter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          {traces.map((trace) => (
            <div
              key={trace.id}
              onClick={() => {
                onSelectTrace(trace);
                onNavigateTab('traces');
              }}
              className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-xl p-4 cursor-pointer transition-all duration-300 space-y-2.5 relative group overflow-hidden hover:border-white/35 hover:shadow-[0_0_24px_rgba(255,255,255,0.08)]"
            >
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-xs font-mono tabular-nums font-medium text-white tracking-wider group-hover:text-emerald-300 transition-colors">{trace.id}</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    trace.status === 'error'
                      ? 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse'
                      : trace.status === 'warning'
                      ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]'
                      : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                  }`}
                />
              </div>

              <div className="text-xs text-neutral-300 line-clamp-2 font-sans leading-relaxed liquid-card-label">
                {trace.inputPreview}
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-neutral-400 pt-2.5 border-t border-white/[0.08] liquid-card-metric">
                <span className="font-medium text-neutral-200">{trace.durationMs}ms</span>
                <span>{trace.totalTokens != null ? `${trace.totalTokens.toLocaleString()} tok` : String.fromCharCode(8212)}</span>
                <span className="text-neutral-200 font-medium">{trace.cost != null ? `$${trace.cost.toFixed(4)}` : String.fromCharCode(8212)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
