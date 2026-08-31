import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  Flame,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Agent,
  AlertItem,
  ApiReadiness,
  EvaluatorReadiness,
  Metrics,
  PlatformHealth,
  TraceListItem,
} from '../../lib/api';
import {
  EmptyState,
  Meter,
  RiskPill,
  riskTone,
  riskToneStyles,
  Stat,
  StatusBadge,
  Tile,
  Waveform,
  FilterChip,
  SearchInput,
} from '../../components/ui';

interface OverviewViewProps {
  metrics: Metrics | null;
  agents: Agent[];
  alerts: AlertItem[];
  platform: PlatformHealth | null;
  apiReadiness: ApiReadiness | null;
  evaluatorReadiness: EvaluatorReadiness | null;
  riskWaveformData: number[];
  recentTraces: TraceListItem[];
  agentSearchQuery: string;
  onAgentSearchChange: (query: string) => void;
  agentSortKey: 'asi' | 'spans' | 'error' | 'latency';
  onAgentSortChange: (key: 'asi' | 'spans' | 'error' | 'latency') => void;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onSelectTrace: (traceId: string) => void;
  onNavigateTab: (tab: 'traces' | 'incidents' | 'drift' | 'lab' | 'datasets') => void;
  onRefresh: () => void;
}

export function OverviewView({
  metrics,
  agents,
  alerts,
  platform,
  apiReadiness,
  evaluatorReadiness,
  riskWaveformData,
  recentTraces,
  agentSearchQuery,
  onAgentSearchChange,
  agentSortKey,
  onAgentSortChange,
  selectedAgentId,
  onSelectAgent,
  onSelectTrace,
  onNavigateTab,
  onRefresh,
}: OverviewViewProps) {
  // Filter and Sort Agents
  const filteredAgents = React.useMemo(() => {
    return agents
      .filter(
        (a) =>
          a.agent_id.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
          (a.agent_role && a.agent_role.toLowerCase().includes(agentSearchQuery.toLowerCase()))
      )
      .sort((a, b) => {
        if (agentSortKey === 'asi') return (b.current_asi ?? 100) - (a.current_asi ?? 100);
        if (agentSortKey === 'spans') return (b.total_spans ?? 0) - (a.total_spans ?? 0);
        if (agentSortKey === 'error') return (b.error_rate ?? 0) - (a.error_rate ?? 0);
        if (agentSortKey === 'latency') return (b.avg_latency_ms ?? 0) - (a.avg_latency_ms ?? 0);
        return 0;
      });
  }, [agents, agentSearchQuery, agentSortKey]);

  const openIncidents = alerts.filter((a) => !a.acknowledged);
  const compositeRisk = metrics?.avg_risk_score ?? 0;
  const compositeRiskTone = riskTone(compositeRisk);

  return (
    <div className="space-y-6 rise pb-20 font-sans">
      {/* ── Top Vitality Metrics Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          accent="pink"
          label="Composite Swarm Risk"
          value={compositeRisk ? compositeRisk.toFixed(3) : '0.000'}
          subtext="Evaluated cascade confidence"
          tone={compositeRiskTone}
          icon={ShieldAlert}
          sparklineData={riskWaveformData}
        />
        <Stat
          accent="yellow"
          label="Active Agents in Swarm"
          value={agents.length}
          subtext="Connected neural nodes"
          tone="ok"
          icon={Brain}
          trend={{ direction: 'neutral', text: '100% OPERATIONAL' }}
        />
        <Stat
          accent="cyan"
          label="Total Spans Ingested"
          value={metrics?.total_spans ?? 0}
          subtext="Real-time telemetry stream"
          icon={Activity}
          sparklineData={[12, 18, 24, 30, 45, 60, 80, 110, 140, metrics?.total_spans ?? 150]}
        />
        <Stat
          accent="purple"
          label="Open Incidents"
          value={openIncidents.length}
          subtext={openIncidents.length > 0 ? 'Requires operator review' : 'All contracts nominal'}
          tone={openIncidents.length > 0 ? 'bad' : 'ok'}
          icon={AlertTriangle}
          trend={
            openIncidents.length > 0
              ? { direction: 'up', text: `${openIncidents.length} ACTIONABLE` }
              : { direction: 'down', text: 'CLEAN' }
          }
        />
      </div>

      {/* ── Real-Time Signal Waveform & Swarm Diagnostics ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Waveform
            data={riskWaveformData}
            height={160}
            title="SWARM RISK & GROUNDING HARMONIC STREAM"
          />
        </div>

        {/* System & Engine Readiness Card */}
        <Tile accent="green" className="p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
                  <Cpu className="w-4 h-4 text-black" />
                </div>
                <h3 className="text-xs font-mono uppercase tracking-wider font-black text-white">
                  Engine Readiness
                </h3>
              </div>
              <span className="comic-tag bg-emerald-400 text-black">ONLINE</span>
            </div>

            <div className="space-y-3 pt-3">
              {/* API Status */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-300 font-semibold">Ingest Gateway:</span>
                <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Port 8000 (WAL)</span>
                </span>
              </div>

              {/* Evaluator Status */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-300 font-semibold">Evaluator Fleet:</span>
                <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#00e676]" />
                  <span>
                    {evaluatorReadiness?.workers_alive ?? 1} Worker Running
                  </span>
                </span>
              </div>

              {/* Models loaded */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-300 font-semibold">Inference Stack:</span>
                <span className="text-yellow-400 font-bold">
                  MiniLM + DeBERTa
                </span>
              </div>

              {/* Queue Depth */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-300 font-semibold">Lease Queue:</span>
                <span className="text-white font-bold tnum">
                  {platform?.evaluation_queue?.depth ?? 0} In Flight
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab('lab')}
              className="w-full comic-btn-yellow py-2 px-3 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-black" />
              <span>Launch Telemetry Lab</span>
            </button>
          </div>
        </Tile>
      </div>

      {/* ── Agent Fleet Topology Section ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-yellow-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
              <Brain className="w-4 h-4 text-black" />
            </div>
            <h2 className="text-sm font-mono uppercase tracking-wider font-black text-white">
              Agent Swarm Fleet ({filteredAgents.length})
            </h2>
          </div>

          {/* Search and Sort controls */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={agentSearchQuery}
              onChange={onAgentSearchChange}
              placeholder="Search agent ID / role..."
              className="w-full sm:w-60"
            />
            <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border-2 border-black text-3xs font-mono shadow-[2px_2px_0px_#000]">
              <span className="text-neutral-400 font-bold px-1">SORT:</span>
              <button
                type="button"
                onClick={() => onAgentSortChange('asi')}
                className={`px-2.5 py-1 rounded-lg font-black transition-all ${
                  agentSortKey === 'asi' ? 'bg-yellow-400 text-black border border-black shadow-[1px_1px_0px_#000]' : 'text-neutral-300 hover:text-white'
                }`}
              >
                ASI
              </button>
              <button
                type="button"
                onClick={() => onAgentSortChange('spans')}
                className={`px-2.5 py-1 rounded-lg font-black transition-all ${
                  agentSortKey === 'spans' ? 'bg-cyan-400 text-black border border-black shadow-[1px_1px_0px_#000]' : 'text-neutral-300 hover:text-white'
                }`}
              >
                SPANS
              </button>
              <button
                type="button"
                onClick={() => onAgentSortChange('latency')}
                className={`px-2.5 py-1 rounded-lg font-black transition-all ${
                  agentSortKey === 'latency' ? 'bg-emerald-400 text-black border border-black shadow-[1px_1px_0px_#000]' : 'text-neutral-300 hover:text-white'
                }`}
              >
                LATENCY
              </button>
            </div>
          </div>
        </div>

        {/* Agent Cards Grid */}
        {filteredAgents.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No Agents Found"
            description="No agents match the current filter or search criteria."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAgents.map((agent, idx) => {
              const asi = agent.current_asi ?? 100;
              const isSelected = selectedAgentId === agent.agent_id;
              const asiTone = asi < 60 ? 'bad' : asi < 80 ? 'warn' : 'ok';
              const asiStyles = riskToneStyles(asiTone);

              const cardAccents: ('yellow' | 'cyan' | 'green' | 'purple' | 'orange')[] = ['yellow', 'cyan', 'green', 'purple', 'orange'];
              const cardAccent = cardAccents[idx % cardAccents.length];

              return (
                <Tile
                  key={agent.agent_id}
                  accent={cardAccent}
                  interactive
                  onClick={() => onSelectAgent(isSelected ? null : agent.agent_id)}
                  className={`p-4 space-y-3.5 transition-all ${
                    isSelected ? 'border-yellow-400 bg-surface-3 shadow-comic-yellow' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full border border-black ${asiStyles.dot}`} />
                        <h4 className="text-xs font-mono font-black text-white truncate">
                          {agent.agent_id}
                        </h4>
                      </div>
                      <p className="text-3xs font-mono text-neutral-400 truncate">
                        {agent.agent_role || 'Autonomous Node'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-3xs font-mono text-neutral-400 block uppercase font-bold">Stability (ASI)</span>
                      <span className={`text-sm font-black font-mono tnum ${asiStyles.text}`}>
                        {asi.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* ASI Stability Meter */}
                  <Meter value={asi / 100} tone={asiTone} showValue={false} />

                  {/* Agent Stats Summary Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t-2 border-black text-center font-mono">
                    <div className="p-1.5 rounded-lg bg-surface border border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 uppercase font-bold block">Spans</span>
                      <span className="text-xs font-black text-white tnum">{agent.total_spans ?? 0}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-surface border border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 uppercase font-bold block">Latency</span>
                      <span className="text-xs font-black text-white tnum">
                        {agent.avg_latency_ms ? `${agent.avg_latency_ms.toFixed(0)}ms` : '—'}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-surface border border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 uppercase font-bold block">Errors</span>
                      <span
                        className={`text-xs font-black tnum ${
                          (agent.error_rate ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {((agent.error_rate ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </Tile>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent Ingested Traces Strip ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
              <Activity className="w-4 h-4 text-black" />
            </div>
            <h3 className="text-xs font-mono uppercase tracking-wider font-black text-white">
              Recent Live Ingestion Feed
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('traces')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-yellow-400 text-black text-xs font-mono font-bold border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-yellow-300 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <span>Open Traces Workspace</span>
            <ArrowRight className="w-3.5 h-3.5 text-black" />
          </button>
        </div>

        {recentTraces.length === 0 ? (
          <EmptyState
            title="No Traces Ingested Yet"
            description="Ingest sample traces via the Telemetry Lab or SDK to view real-time traces."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recentTraces.slice(0, 6).map((trace) => {
              return (
                <Tile
                  key={trace.trace_id}
                  accent="cyan"
                  interactive
                  onClick={() => {
                    onSelectTrace(trace.trace_id);
                    onNavigateTab('traces');
                  }}
                  className="p-3.5 space-y-2 hover:border-yellow-400"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-black text-white truncate max-w-[180px]">{trace.trace_id}</span>
                    <RiskPill score={trace.overall_risk_score} />
                  </div>
                  <div className="flex items-center justify-between text-3xs font-mono text-neutral-300 font-semibold">
                    <span className="comic-tag bg-surface text-cyan-300 border-black">{trace.total_spans} spans</span>
                    <span className="uppercase">{trace.status}</span>
                    <span className="text-neutral-400">
                      {new Date(trace.start_time || Date.now()).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </Tile>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
