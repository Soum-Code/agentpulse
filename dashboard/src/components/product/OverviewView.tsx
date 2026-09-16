import React, { useState, useEffect } from 'react';
import { Bot, AlertTriangle, TrendingDown, Activity, ArrowRight, Clock, ShieldCheck, Zap, Copy, Check, ChevronRight, Layers, Cpu, Shield, Gauge } from 'lucide-react';
import { Agent, Trace, Incident, DriftProfile, Span } from '../../types';
import { triggerCardEntranceAnimation } from '../../utils/liquidHoverAnime';

interface OverviewViewProps {
  agents: Agent[];
  traces: Trace[];
  incidents: Incident[];
  driftProfiles: DriftProfile[];
  onSelectAgent: (agent: Agent) => void;
  onSelectTrace: (trace: Trace) => void;
  onSelectSpan?: (span: Span) => void;
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
  onSelectSpan,
  onSelectIncident,
  onNavigateTab
}) => {
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  const handleCopyTraceId = (e: React.MouseEvent, traceId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(traceId);
    setCopiedTraceId(traceId);
    setTimeout(() => {
      setCopiedTraceId(prev => (prev === traceId ? null : prev));
    }, 2000);
  };

  // Aggregate KPIs
  const totalTraces = agents.reduce((acc, a) => acc + a.totalTraces24h, 0);
  const avgLatency = Math.round(agents.reduce((acc, a) => acc + a.latencyAvgMs, 0) / agents.length);
  const criticalIncidents = incidents.filter(i => i.severity === 'critical').length;
  const driftingAgents = agents.filter(a => a.driftStatus !== 'normal').length;

  useEffect(() => {
    triggerCardEntranceAnimation();
  }, [traces.length, incidents.length]);

  return (
    <div className="space-y-8 pb-28">
      {/* Engine Architecture & Evaluator Status Banner */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-4.5 sm:p-5 relative overflow-hidden bg-gradient-to-r from-emerald-950/20 via-black/60 to-cyan-950/20 anime-tab-card">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Primary Requested Status Badge */}
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-mono text-[11px] font-semibold tracking-wide uppercase shadow-[0_0_12px_rgba(52,211,153,0.18)]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 phosphor-emerald animate-pulse" />
                <span>No LLM Dependency</span>
              </div>
              <span className="text-neutral-500 text-xs hidden sm:inline">|</span>
              <span className="text-xs font-mono font-medium text-neutral-300 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Local CPU Inference · MiniLM + DeBERTa</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.06] border border-white/[0.1] text-neutral-300">
                0 Tokens / Zero API Bills
              </span>
            </div>
            <p className="text-xs font-sans text-neutral-300 leading-relaxed max-w-3xl">
              <strong className="text-white font-medium">AgentPulse never calls an LLM to judge.</strong> Your models stay outside the system. All grounding, inter-agent contradiction, and drift evaluations execute locally on CPU using small transformer classifiers with 203ms median latency.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono text-xs pt-1 lg:pt-0 border-t lg:border-t-0 border-white/[0.08]">
            <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-right">
              <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Grounding Model</div>
              <div className="text-white font-semibold mt-0.5">DeBERTa-v3-small</div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-right">
              <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Embedding Engine</div>
              <div className="text-cyan-300 font-semibold mt-0.5">all-MiniLM-L6-v2</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Section: System Pulse & Aggregate Density Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: 24h Trace Volume */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden group tactile-press anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-3">
            <span className="font-sans font-medium tracking-wider text-[11px] text-neutral-400 uppercase liquid-card-label">
              24h Trace Volume
            </span>
            <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-neutral-200">
              <Activity className="w-3.5 h-3.5 text-emerald-400 phosphor-emerald" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none drop-shadow-xs liquid-card-metric">
            {totalTraces.toLocaleString()}
          </div>
          <div className="text-xs font-mono tabular-nums text-neutral-300 mt-3.5 flex items-center space-x-2 pt-2.5 border-t border-white/[0.08]">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-emerald-300 font-medium text-[10px] uppercase tracking-wider tabular-nums phosphor-emerald">
              +14.2%
            </span>
            <span className="text-neutral-400 font-sans text-[11px] liquid-card-label">vs nominal baseline</span>
          </div>
        </div>

        {/* KPI 2: Avg Latency */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden group tactile-press anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-3">
            <span className="font-sans font-medium tracking-wider text-[11px] text-neutral-400 uppercase liquid-card-label">
              Avg Inference Latency
            </span>
            <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-neutral-200">
              <Clock className="w-3.5 h-3.5 text-cyan-400 phosphor-cyan" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none drop-shadow-xs liquid-card-metric">
            {avgLatency} <span className="text-base text-neutral-400 font-normal">ms</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-neutral-300 mt-3.5 flex items-center space-x-2 pt-2.5 border-t border-white/[0.08]">
            <span className="text-neutral-400 font-sans liquid-card-label">p95: <span className="text-neutral-200 font-mono tabular-nums font-medium">1,840ms</span></span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-400 font-sans liquid-card-label">p99: <span className="text-neutral-200 font-mono tabular-nums font-medium">2,840ms</span></span>
          </div>
        </div>

        {/* KPI 3: Active Incidents */}
        <div
          onClick={() => onNavigateTab('incidents')}
          className={`ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden cursor-pointer group tactile-press anime-tab-card ${
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
              <AlertTriangle className="w-3.5 h-3.5 phosphor-rose" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none flex items-baseline space-x-2 drop-shadow-xs liquid-card-metric">
            <span>{incidents.length}</span>
            <span className="text-xs font-sans text-rose-300/90 font-medium">({criticalIncidents} critical)</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-rose-300/90 mt-3.5 flex items-center space-x-1.5 font-medium pt-2.5 border-t border-rose-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 phosphor-rose animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            <span className="text-[11px] font-sans text-rose-200/80">Schema drift &amp; OCR alerts active</span>
          </div>
        </div>

        {/* KPI 4: Behavioral Drift */}
        <div
          onClick={() => onNavigateTab('drift')}
          className={`ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden cursor-pointer group tactile-press anime-tab-card ${
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
              <TrendingDown className="w-3.5 h-3.5 phosphor-amber" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-mono tabular-nums font-medium text-white tracking-tight leading-none flex items-baseline space-x-2 drop-shadow-xs liquid-card-metric">
            <span>{driftingAgents}</span>
            <span className="text-xs font-sans text-amber-300/90 font-medium">flagged swarms</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-amber-300/90 mt-3.5 font-medium pt-2.5 border-t border-amber-500/25 flex items-center justify-between">
            <span className="text-[11px] font-sans text-neutral-400 liquid-card-label">Max divergence:</span>
            <span className="font-mono tabular-nums font-medium text-[10px] bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 uppercase tracking-wider phosphor-amber">0.88 Δ (Cluster #3)</span>
          </div>
        </div>
      </div>

      {/* APM Performance Metrics Spotlight Bar (Datadog Live Telemetry) */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-4 sm:p-5 relative overflow-hidden bg-gradient-to-r from-neutral-900/90 via-neutral-900/60 to-emerald-950/20 anime-tab-card">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-sans font-semibold text-white">
                  Datadog APM Golden Signals
                </h4>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-mono text-emerald-300 uppercase tracking-wider">
                  Live Endpoints
                </span>
              </div>
              <p className="text-xs font-sans text-neutral-400 mt-0.5">
                Real-time endpoint response times, error rates (1.42%), and cluster throughput across 8 critical gateways.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4 self-start md:self-center shrink-0">
            <div className="hidden lg:flex items-center space-x-4 text-xs font-mono border-r border-white/[0.1] pr-4">
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase">Throughput</span>
                <span className="text-white font-bold">1,245 rps</span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase">p95 Latency</span>
                <span className="text-emerald-400 font-bold">1,120ms</span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase">Apdex</span>
                <span className="text-cyan-300 font-bold">0.94 / 1.0</span>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('performance')}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-emerald-300 hover:text-emerald-200 text-xs font-mono font-medium transition-all flex items-center space-x-2 shadow-xs cursor-pointer group"
            >
              <span>Explore Performance Metrics</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Swarm Roster (Left) & Navigable Trace Scatter/List (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent Roster with Liquid Glass Header & Cards */}
        <div className="lg:col-span-7 ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative anime-tab-card">
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
                  className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer relative group gap-3.5 overflow-hidden anime-tab-row"
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
                        {agent.driftStatus.toUpperCase()}
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
          <div className="ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative anime-tab-card">
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
              {incidents.map((incident) => {
                const matchedAgent = agents.find(a => a.id === incident.agentId);
                const matchedTrace = traces.find(t => t.id === incident.traceId);
                const matchedSpan = matchedTrace?.spans.find(s => s.id === incident.spanId) || matchedTrace?.spans[0];

                return (
                  <div
                    key={incident.id}
                    onClick={() => {
                      onSelectIncident(incident);
                      onNavigateTab('incidents');
                    }}
                    className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-xl p-4 cursor-pointer space-y-2.5 relative group overflow-hidden hover:border-rose-400/50 hover:shadow-[0_0_24px_rgba(244,63,94,0.18)] anime-tab-row"
                  >
                    <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Header Area: Inline Breadcrumb Navigation Bar & Severity Badge */}
                    <div className="space-y-2 pb-1.5 border-b border-white/[0.08]">
                      {/* Breadcrumb Navigation: Agent -> Trace -> Span */}
                      <nav
                        aria-label={`Hierarchy path for incident ${incident.id}`}
                        className="flex items-center space-x-1 text-[10px] font-mono min-w-0 overflow-hidden"
                      >
                        {/* 1. Agent Tier */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (matchedAgent) onSelectAgent(matchedAgent);
                            onNavigateTab('agents');
                          }}
                          className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-emerald-500/20 text-neutral-300 hover:text-emerald-300 border border-white/[0.08] hover:border-emerald-500/40 transition-all shrink-0 max-w-[90px] truncate"
                          title={`Agent: ${incident.agentName} (Click to inspect Agent)`}
                        >
                          <Bot className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                          <span className="truncate">{incident.agentName.split(' ')[0]}</span>
                        </button>

                        <ChevronRight className="w-2.5 h-2.5 text-neutral-500 shrink-0" />

                        {/* 2. Trace Tier */}
                        {incident.traceId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (matchedTrace) onSelectTrace(matchedTrace);
                              onNavigateTab('traces');
                            }}
                            className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-cyan-500/20 text-neutral-200 hover:text-cyan-300 border border-white/[0.08] hover:border-cyan-500/40 transition-all shrink-0 max-w-[85px] truncate font-medium"
                            title={`Trace: ${incident.traceId} (Click to open Trace)`}
                          >
                            <Activity className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                            <span className="truncate">{incident.traceId.replace('trace-', '')}</span>
                          </button>
                        ) : (
                          <span className="text-neutral-500 text-[9px]">no trace</span>
                        )}

                        {/* 3. Span Tier */}
                        {incident.spanId && (
                          <>
                            <ChevronRight className="w-2.5 h-2.5 text-neutral-500 shrink-0" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (matchedTrace) onSelectTrace(matchedTrace);
                                if (matchedSpan && onSelectSpan) onSelectSpan(matchedSpan);
                                onNavigateTab('traces');
                              }}
                              className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 hover:border-rose-500/50 transition-all shrink-0 min-w-0 max-w-[95px] truncate"
                              title={`Span: ${incident.spanId} (Click to inspect failing Span)`}
                            >
                              <Zap className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                              <span className="truncate">{matchedSpan?.name || incident.spanId}</span>
                            </button>
                          </>
                        )}
                      </nav>

                      {/* Incident Severity Status Row */}
                      <div className="flex items-center justify-between text-xs pt-0.5">
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
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Navigable Interactive Trace Scatter Plot */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 relative overflow-hidden anime-tab-card">
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
          {traces.map((trace) => {
            const primarySpan =
              trace.spans.find(s => s.status === 'error') ||
              trace.spans.find(s => s.status === 'warning') ||
              trace.spans.find(s => s.id === trace.rootSpanId) ||
              trace.spans[0];
            const matchedAgent = agents.find(a => a.id === trace.agentId);

            return (
              <div
                key={trace.id}
                onClick={() => {
                  onSelectTrace(trace);
                  onNavigateTab('traces');
                }}
                className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-xl p-4 cursor-pointer space-y-2.5 relative group overflow-hidden hover:border-white/35 hover:shadow-[0_0_24px_rgba(255,255,255,0.08)] anime-tab-row"
              >
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity" />
                
                {/* Header Area: Inline Hierarchical Breadcrumb Navigation Bar */}
                <div className="space-y-2 pb-2 border-b border-white/[0.08]">
                  {/* Inline Breadcrumb Navigation: Agent -> Trace -> Span */}
                  <nav
                    aria-label={`Hierarchy navigation path for ${trace.id}`}
                    className="flex items-center space-x-1 text-[10px] font-mono min-w-0 overflow-hidden"
                  >
                    {/* 1. Agent Segment */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (matchedAgent) onSelectAgent(matchedAgent);
                        onNavigateTab('agents');
                      }}
                      className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-emerald-500/20 text-neutral-300 hover:text-emerald-300 border border-white/[0.08] hover:border-emerald-500/40 transition-all shrink-0 max-w-[85px] truncate"
                      title={`Agent: ${trace.agentName} (Click to navigate to Agent)`}
                    >
                      <Bot className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{trace.agentName.split(' ')[0]}</span>
                    </button>

                    <ChevronRight className="w-2.5 h-2.5 text-neutral-500 shrink-0" />

                    {/* 2. Trace Segment */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTrace(trace);
                        onNavigateTab('traces');
                      }}
                      className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-cyan-500/20 text-neutral-200 hover:text-cyan-300 border border-white/[0.08] hover:border-cyan-500/40 transition-all shrink-0 max-w-[80px] truncate font-medium"
                      title={`Trace: ${trace.id} (Click to open Trace waterfall)`}
                    >
                      <Activity className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{trace.id.replace('trace-', '')}</span>
                    </button>

                    <ChevronRight className="w-2.5 h-2.5 text-neutral-500 shrink-0" />

                    {/* 3. Span Segment */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTrace(trace);
                        if (primarySpan && onSelectSpan) onSelectSpan(primarySpan);
                        onNavigateTab('traces');
                      }}
                      className={`flex items-center space-x-1 px-1.5 py-0.5 rounded border transition-all shrink-0 min-w-0 max-w-[95px] truncate ${
                        primarySpan?.status === 'error'
                          ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/35 hover:border-rose-500/50'
                          : primarySpan?.status === 'warning'
                          ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/35 hover:border-amber-500/50'
                          : 'bg-white/[0.05] hover:bg-amber-500/20 text-neutral-300 hover:text-amber-300 border-white/[0.08] hover:border-amber-500/40'
                      }`}
                      title={`Span: ${primarySpan?.name || 'root'} (${primarySpan?.durationMs || trace.durationMs}ms - Click to inspect Span)`}
                    >
                      <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                      <span className="truncate">{primarySpan?.name || 'root'}</span>
                    </button>
                  </nav>

                  {/* Trace ID, One-Click Copy Badge & Status Pill */}
                  <div className="flex items-center justify-between text-xs font-mono pt-0.5">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="text-xs font-mono tabular-nums font-medium text-white tracking-wider group-hover:text-emerald-300 transition-colors truncate">{trace.id}</span>
                      <button
                        onClick={(e) => handleCopyTraceId(e, trace.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition-all border shrink-0 ${
                          copiedTraceId === trace.id
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                            : 'bg-white/[0.06] border-white/[0.12] text-neutral-300 hover:text-white hover:bg-white/[0.14] hover:border-white/25'
                        }`}
                        title="One-click Copy Trace ID"
                        aria-label={`Copy Trace ID ${trace.id}`}
                      >
                        {copiedTraceId === trace.id ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-300" />
                            <span className="text-[9px] font-sans font-medium text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span className="text-[9px] font-sans text-neutral-300">Copy ID</span>
                          </>
                        )}
                      </button>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ml-1.5 ${
                        trace.status === 'error'
                          ? 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse'
                          : trace.status === 'warning'
                          ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]'
                          : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                      }`}
                    />
                  </div>
                </div>

                <div className="text-xs text-neutral-300 line-clamp-2 font-sans leading-relaxed liquid-card-label">
                  {trace.inputPreview}
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-neutral-400 pt-2.5 border-t border-white/[0.08] liquid-card-metric">
                  <span className="font-medium text-neutral-200">{trace.durationMs}ms</span>
                  <span>{trace.totalTokens.toLocaleString()} tok</span>
                  <span className="text-neutral-200 font-medium">${trace.cost.toFixed(4)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
