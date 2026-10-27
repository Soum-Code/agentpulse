import React, { useState } from 'react';
import { Bot, ArrowRight, Wrench, Search, Gauge } from 'lucide-react';
import { Agent } from '../../types';
import { DRIFT_THRESHOLD } from '../../lib/adapters';
import {
  DASH,
  distanceBarPct,
  driftStatusLabel,
  driftWaitSentence,
  formatDistance,
  formatLatencyMs,
  formatSuccessRate,
  isLowSuccess,
  isOverDriftThreshold,
  rosterSummary,
} from '../../lib/agentFormat';
import { formatRelativeTime } from '../../utils/dateUtils';

interface AgentsViewProps {
  agents: Agent[];
  selectedAgent?: Agent;
  onSelectAgent: (agent: Agent) => void;
  onNavigateToTraces: (agentId: string) => void;
  onNavigateToDrift: (agentId: string) => void;
}

/** The Agents tab: a roster of every agent the API has seen (left) and the selected agent's
 *  measured figures (right). Every number here comes from GET /v1/agents and GET /v1/drift
 *  through lib/adapters.ts; a missing one prints as an em dash. */
export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  selectedAgent,
  onSelectAgent,
  onNavigateToTraces,
  onNavigateToDrift
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const currentAgent = selectedAgent || agents[0];

  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    // framework and model have no source in the AgentPulse span schema, so the
    // adapter leaves them undefined. Searching used to throw on the first agent
    // that came from real data rather than from the mock file.
    (a.framework ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.model ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-28">
      {/* Search and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anime-tab-card">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Bot className="w-5 h-5 text-neutral-400" />
            <span>Agent Roster</span>
          </h2>
          {/* Counted from the loaded agents. It used to read "4 active swarms · LangGraph,
              LangGraph & Custom Orchestrators" whatever the data said. */}
          <p className="text-xs font-mono text-neutral-400 mt-1">
            {rosterSummary(agents)}
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter agents by name..."
            className="w-full bg-[#0d0e12] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
      </div>

      {/* Main Split Layout: Agent List (Left) + Detailed Agent Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: one card per agent */}
        <div className="lg:col-span-5 space-y-3">
          {filteredAgents.map((agent) => {
            const isSelected = currentAgent?.id === agent.id;

            return (
              <div
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-250 relative overflow-hidden group anime-tab-row ${
                  isSelected
                    ? 'glass-morphism-v2 border-glow-subtle border-white/40 shadow-[0_0_30px_rgba(255,255,255,0.08)]'
                    : 'ios-liquid-row text-neutral-300'
                }`}
              >
                {isSelected && (
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                )}
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5 text-base font-mono">
                      {agent.status === 'idle' && <span className="text-neutral-500">○</span>}
                      {agent.status === 'running' && <span className="text-emerald-400 font-bold drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]">◉</span>}
                      {agent.status === 'warning' && <span className="text-amber-400 font-bold drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]">◉</span>}
                      {agent.status === 'critical' && <span className="text-rose-400 font-bold animate-pulse drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]">◉</span>}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-white font-mono group-hover:text-emerald-300 transition-colors">
                        {agent.name}
                      </div>
                      {/* Framework and model are shown only when they exist; they have no
                          source in the span schema, so this is usually the agent's role. */}
                      <div className="text-[11px] font-mono text-neutral-400 mt-0.5 flex items-center space-x-2">
                        {agent.framework && (
                          <span className="text-neutral-200 font-semibold px-1.5 py-0.2 rounded bg-white/[0.06] border border-white/[0.1]">{agent.framework}</span>
                        )}
                        {agent.model && <span className="text-neutral-300">{agent.model}</span>}
                        {!agent.framework && !agent.model && (
                          <span className="text-neutral-500">{agent.description ? `role: ${agent.description}` : 'no role, framework or model recorded'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Drift badge. An agent with no baseline yet used to fall through to the
                      rose "drift" styling with an empty label. */}
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase shadow-xs ${
                      agent.driftStatus === 'drift'
                        ? 'border-rose-500/40 text-rose-300 bg-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                        : agent.driftStatus === 'deviation'
                        ? 'border-amber-500/40 text-amber-300 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                        : agent.driftStatus === 'normal'
                        ? 'border-white/[0.12] text-neutral-300 bg-white/[0.06]'
                        : 'border-dashed border-white/[0.14] text-neutral-500 bg-transparent'
                    }`}
                  >
                    {driftStatusLabel(agent)}
                  </span>
                </div>

                {/* The 60-minute latency sparkline that sat here was drawn from Math.random()
                    (utils/latencyTelemetry.ts, now deleted): the API has no latency history. */}
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span className="text-neutral-300 font-medium">{agent.totalSpans.toLocaleString()} spans ingested</span>
                  <span className="text-neutral-300 font-medium">{formatLatencyMs(agent.latencyAvgMs)} avg</span>
                  <span className={isLowSuccess(agent.successRate) ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {formatSuccessRate(agent.successRate)} OK
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Selected Agent Deep Dive */}
        {currentAgent && (
          <div className="lg:col-span-7 glass-morphism-v2 border-glow-subtle rounded-2xl overflow-hidden relative anime-tab-card">
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
            {/* Inspector Header */}
            <div className="px-6 py-4 border-b border-white/[0.12] flex items-center justify-between bg-white/[0.04] backdrop-blur-xl">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block font-semibold">
                  AGENT RUNTIME INSPECTOR
                </span>
                <h3 className="text-sm font-bold text-white font-mono mt-0.5">
                  {currentAgent.name}
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onNavigateToTraces(currentAgent.id)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-neutral-200 text-xs font-mono flex items-center space-x-1.5 transition-colors border border-white/[0.14] shadow-xs"
                >
                  <span>Filter Traces</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onNavigateToDrift(currentAgent.id)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-neutral-200 text-xs font-mono flex items-center space-x-1.5 transition-colors border border-white/[0.14] shadow-xs"
                >
                  <span>Drift Model</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Inspector Body */}
            <div className="p-6 space-y-6">
              <div>
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                  Role
                </span>
                {/* agent_role is the only descriptive text the backend stores. */}
                <p className="text-xs text-neutral-300 leading-relaxed font-mono">
                  {currentAgent.description ?? <span className="text-neutral-600">Not recorded &mdash; the SDK sent no agent_role for this agent</span>}
                </p>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">FRAMEWORK</span>
                  <span className="text-white font-bold mt-1 block">
                    {currentAgent.framework ?? <span className="text-neutral-600">&mdash;</span>}
                  </span>
                </div>
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">CORE MODEL</span>
                  <span className="text-white font-bold mt-1 block">
                    {currentAgent.model ?? <span className="text-neutral-600">&mdash;</span>}
                  </span>
                </div>
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">VERSION</span>
                  {/* Neither version nor cost has a source in the span schema. The
                      adapter leaves both undefined; rendering them anyway printed
                      "undefined" and threw on .toFixed. An em dash says "not
                      recorded" without implying a value was measured and lost. */}
                  <span className="text-white font-bold mt-1 block">
                    {currentAgent.version ?? <span className="text-neutral-600">&mdash;</span>}
                  </span>
                </div>
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">EST. HOURLY COST</span>
                  <span className="text-emerald-400 font-bold mt-1 block">
                    {currentAgent.costPerHour !== undefined
                      ? `$${currentAgent.costPerHour.toFixed(2)}/hr`
                      : <span className="text-neutral-600">&mdash;</span>}
                  </span>
                </div>
              </div>

              {/* Measured figures. This replaces a "60-minute latency drift" chart, a "+140%"
                  diagnosis and a "baseline SLA" that were generated in the browser: the API
                  keeps one moving average per agent and no per-minute history to chart. */}
              <div>
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-2 flex items-center space-x-1.5">
                  <Gauge className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Measured figures</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Latency (moving avg)</span>
                    <span className="text-white font-bold text-sm mt-1 block">{formatLatencyMs(currentAgent.latencyAvgMs)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Success rate</span>
                    <span className={`font-bold text-sm mt-1 block ${isLowSuccess(currentAgent.successRate) ? 'text-rose-400' : 'text-white'}`}>
                      {formatSuccessRate(currentAgent.successRate)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Spans ingested</span>
                    <span className="text-white font-bold text-sm mt-1 block">{currentAgent.totalSpans.toLocaleString()}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Last seen</span>
                    {/* formatRelativeTime reads the backend's zone-less UTC time correctly and
                        answers 'N/A' when it cannot; that becomes a dash here. */}
                    <span className="text-white font-bold text-sm mt-1 block">
                      {formatRelativeTime(currentAgent.lastActive).replace(/^N\/A$/, DASH)}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] font-mono text-neutral-500 mt-2 leading-relaxed">
                  Latency is a moving average kept per agent: each new span counts 5% and the old
                  average 95%. No per-minute history is stored, so no latency chart is drawn.
                  Success rate is the share of spans not reported as errors, over all spans.
                </p>
              </div>

              {/* Tools Inventory */}
              <div>
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-2 flex items-center space-x-1.5">
                  <Wrench className="w-3.5 h-3.5 text-neutral-400" />
                  {/* A dash, not "(0)": the count is unknown, not zero. */}
                  <span>Bound Tool Handlers ({currentAgent.tools?.length ?? DASH})</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {/* The backend records a tool name per span, not a roster per
                      agent, so this list is empty against real data rather than
                      short. Saying so beats an empty box that reads as "this
                      agent calls no tools". */}
                  {(currentAgent.tools ?? []).length === 0 && (
                    <span className="font-mono text-xs text-neutral-600">
                      Not recorded &mdash; tool names are attached to spans, not to agents
                    </span>
                  )}
                  {(currentAgent.tools ?? []).map((tool) => (
                    <span
                      key={tool}
                      className="px-2.5 py-1 rounded-lg ios-liquid-row border border-white/[0.12] font-mono text-xs text-neutral-200 font-semibold shadow-xs"
                    >
                      {tool}()
                    </span>
                  ))}
                </div>
              </div>

              {/* Drift: the window centroid distance, coloured against the 0.30 threshold the
                  DRIFT_DETECTED alert uses (it used to be coloured at invented 0.2 / 0.5 cuts). */}
              <div className="p-4 rounded-xl ios-liquid-row border border-white/[0.12] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-400">Window centroid distance (alert above {DRIFT_THRESHOLD.toFixed(2)}):</span>
                  <span
                    className={`font-semibold ${
                      currentAgent.driftScore == null
                        ? 'text-neutral-500'
                        : isOverDriftThreshold(currentAgent.driftScore)
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {formatDistance(currentAgent.driftScore)} ({driftStatusLabel(currentAgent)})
                  </span>
                </div>
                <div className="relative w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/[0.08]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOverDriftThreshold(currentAgent.driftScore)
                        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    }`}
                    style={{ width: `${distanceBarPct(currentAgent.driftScore)}%` }}
                  />
                  {/* Tick at the alert threshold. */}
                  <div className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: `${DRIFT_THRESHOLD * 100}%` }} />
                </div>
                {/* Says which pool is still filling (baseline or window), from the spans the
                    drift detector has seen; it used to say "no baseline" in both cases. */}
                {currentAgent.driftScore == null && (
                  <p className="text-[11px] font-mono text-neutral-500">
                    No distance yet. {driftWaitSentence(currentAgent)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
