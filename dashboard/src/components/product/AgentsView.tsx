import React, { useState } from 'react';
import { Bot, Terminal, Activity, ArrowRight, ShieldCheck, Wrench, Search, ChevronRight } from 'lucide-react';
import { Agent, Trace } from '../../types';

interface AgentsViewProps {
  agents: Agent[];
  selectedAgent?: Agent;
  onSelectAgent: (agent: Agent) => void;
  onNavigateToTraces: (agentId: string) => void;
  onNavigateToDrift: (agentId: string) => void;
}

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
    (a.framework ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.model ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-28">
      {/* Search and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Bot className="w-5 h-5 text-neutral-400" />
            <span>Autonomous Agent Roster</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            4 active swarms &nbsp;·&nbsp; LangGraph, CrewAI, LlamaIndex & Custom Orchestrators
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter agents by name, framework, or model..."
            className="w-full bg-[#0d0e12] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
      </div>

      {/* Main Split Layout: Agent List (Left) + Detailed Agent Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Agent Cards */}
        <div className="lg:col-span-5 space-y-3">
          {filteredAgents.map((agent) => {
            const isSelected = currentAgent?.id === agent.id;

            return (
              <div
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-250 relative overflow-hidden group ${
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
                      <div className="text-[11px] font-mono text-neutral-400 mt-0.5 flex items-center space-x-2">
                        <span className="text-neutral-200 font-semibold px-1.5 py-0.2 rounded bg-white/[0.06] border border-white/[0.1]">{agent.framework}</span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-neutral-300">{agent.model}</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase shadow-xs ${
                      agent.driftStatus === 'normal'
                        ? 'border-white/[0.12] text-neutral-300 bg-white/[0.06]'
                        : agent.driftStatus === 'deviation'
                        ? 'border-amber-500/40 text-amber-300 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                        : 'border-rose-500/40 text-rose-300 bg-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                    }`}
                  >
                    {agent.driftStatus}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span className="text-neutral-300 font-medium">{agent.totalTraces24h != null ? `${agent.totalTraces24h.toLocaleString()} traces/24h` : String.fromCharCode(8212)}</span>
                  <span className="text-neutral-300 font-medium">{agent.latencyAvgMs}ms avg</span>
                  <span className={agent.successRate < 90 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {agent.successRate}% OK
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Selected Agent Deep Dive */}
        {currentAgent && (
          <div className="lg:col-span-7 glass-morphism-v2 border-glow-subtle rounded-2xl overflow-hidden relative">
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
                  Architecture & Responsibility
                </span>
                <p className="text-xs text-neutral-300 leading-relaxed font-mono">
                  {currentAgent.description}
                </p>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">FRAMEWORK</span>
                  <span className="text-white font-bold mt-1 block">{currentAgent.framework}</span>
                </div>
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">CORE MODEL</span>
                  <span className="text-white font-bold mt-1 block">{currentAgent.model}</span>
                </div>
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">VERSION</span>
                  <span className="text-white font-bold mt-1 block">{currentAgent.version}</span>
                </div>
                <div className="p-3 rounded-xl ios-liquid-row border border-white/[0.12]">
                  <span className="text-neutral-400 block text-[10px]">EST. HOURLY COST</span>
                  <span className="text-emerald-400 font-bold mt-1 block">{currentAgent.costPerHour != null ? `$${currentAgent.costPerHour.toFixed(2)}/hr` : String.fromCharCode(8212)}</span>
                </div>
              </div>

              {/* Tools Inventory */}
              <div>
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-2 flex items-center space-x-1.5">
                  <Wrench className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Bound Tool Handlers ({(currentAgent.tools ?? []).length})</span>
                </span>
                <div className="flex flex-wrap gap-2">
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

              {/* Drift & Anomaly Assessment */}
              <div className="p-4 rounded-xl ios-liquid-row border border-white/[0.12] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-400">Drift Anomaly Index:</span>
                  <span
                    className={`font-semibold ${
                      currentAgent.driftScore > 0.5
                        ? 'text-rose-400'
                        : currentAgent.driftScore > 0.2
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {currentAgent.driftScore} Δ ({currentAgent.driftStatus})
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/[0.08]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      currentAgent.driftScore > 0.5
                        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : currentAgent.driftScore > 0.2
                        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                        : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    }`}
                    style={{ width: `${Math.min(currentAgent.driftScore * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
