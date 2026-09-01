import React, { useState } from 'react';
import { TrendingDown, Activity, Bot, ArrowRight, Layers, Sparkles, Filter, Crosshair } from 'lucide-react';
import { DriftProfile, Agent } from '../../types';

interface DriftViewProps {
  driftProfiles: DriftProfile[];
  agents: Agent[];
  selectedAgentId?: string;
  onNavigateToTrace: (traceId: string) => void;
}

export const DriftView: React.FC<DriftViewProps> = ({
  driftProfiles,
  agents,
  selectedAgentId,
  onNavigateToTrace
}) => {
  const [activeProfileId, setActiveProfileId] = useState<string>(
    selectedAgentId || driftProfiles[0]?.agentId || 'agent-sql-synthesizer'
  );
  const [driftSubView, setDriftSubView] = useState<'spatial' | 'matrix'>('spatial');

  const currentProfile = driftProfiles.find(p => p.agentId === activeProfileId) || driftProfiles[0];

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <TrendingDown className="w-5 h-5 text-amber-400" />
            <span>Behavioral & Trajectory Drift Analysis</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Detect semantic embedding divergence, parameter shift, and ungrounded execution paths
          </p>
        </div>

        {/* Sub-view toggle */}
        <div className="flex items-center space-x-2 bg-neutral-900 border border-neutral-800 p-1 rounded-lg">
          <button
            onClick={() => setDriftSubView('spatial')}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
              driftSubView === 'spatial' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Vector Embedding Map
          </button>
          <button
            onClick={() => setDriftSubView('matrix')}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
              driftSubView === 'matrix' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Parameter & Metric Matrix
          </button>
        </div>
      </div>

      {/* Agent Selector Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none font-mono text-xs">
        {driftProfiles.map((p) => (
          <button
            key={p.agentId}
            onClick={() => setActiveProfileId(p.agentId)}
            className={`px-3.5 py-2 rounded-xl border shrink-0 transition-colors ${
              activeProfileId === p.agentId
                ? 'bg-neutral-800 text-white border-neutral-600 font-semibold'
                : 'surface-solid text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850'
            }`}
          >
            <span>{p.agentName.split(' ')[0]} {p.agentName.split(' ')[1]}</span>
            <span className="ml-2 text-rose-400 font-bold">({p.driftMagnitude} Δ)</span>
          </button>
        ))}
      </div>

      {/* Main Drift Workspace */}
      {currentProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Drift Metrics & Breakdown */}
          <div className="lg:col-span-4 space-y-4">
            <div className="ios-liquid-card border-glow-subtle rounded-2xl p-5 space-y-4 font-mono text-xs relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
              <div>
                <span className="text-[10px] uppercase text-neutral-400 font-bold tracking-wider">AGGREGATE DRIFT MAGNITUDE</span>
                <div className="text-3xl font-black text-rose-400 mt-1 drop-shadow-xs">
                  {currentProfile.driftMagnitude} Δ
                </div>
                <p className="text-[11px] text-neutral-300 mt-1.5 leading-relaxed">
                  {currentProfile.driftReason}
                </p>
              </div>

              {/* Sub-component meters */}
              <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-400">Semantic Embedding Drift:</span>
                    <span className="text-rose-400 font-semibold">{currentProfile.semanticDrift} Δ</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                    <div className="h-full bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.8)]" style={{ width: `${currentProfile.semanticDrift * 100}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-400">Tool Argument / Parameter Drift:</span>
                    <span className="text-amber-400 font-semibold">{currentProfile.parameterDrift} Δ</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                    <div className="h-full bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)]" style={{ width: `${currentProfile.parameterDrift * 100}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-400">Tool Call Frequency Divergence:</span>
                    <span className="text-amber-400 font-semibold">{currentProfile.toolCallDrift} Δ</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                    <div className="h-full bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)]" style={{ width: `${currentProfile.toolCallDrift * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[10px] text-neutral-400 border-t border-white/[0.06]">
                <span>Baseline Runs: <strong className="text-neutral-200">{currentProfile.baselineSampleCount}</strong></span>
                <span>Active Sample: <strong className="text-neutral-200">{currentProfile.currentSampleCount}</strong></span>
              </div>
            </div>

            {/* Drift Sample Cluster Points (Navigable to Traces) */}
            <div className="ios-liquid-card border-glow-subtle rounded-2xl p-4 space-y-2 font-mono text-xs relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
              <div className="text-neutral-300 uppercase tracking-wider text-[10px] font-bold pb-2 border-b border-white/[0.08]">
                Sample Execution Points ({currentProfile.points.length})
              </div>

              <div className="space-y-1.5 pt-1">
                {currentProfile.points.map((pt) => (
                  <div
                    key={pt.id}
                    onClick={() => onNavigateToTrace(pt.traceId)}
                    className="p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/80 hover:border-neutral-600 hover:bg-neutral-900 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-neutral-200">{pt.label}</div>
                      <div className="text-[10px] text-neutral-500">Trace: {pt.traceId} · {pt.timestamp}</div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        pt.cluster === 'baseline'
                          ? 'text-neutral-400 bg-neutral-900'
                          : pt.cluster === 'deviation'
                          ? 'text-amber-400 bg-amber-950/60'
                          : 'text-rose-400 bg-rose-950/60'
                      }`}
                    >
                      {pt.cluster}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: 2D Embedding Vector Canvas or Matrix View */}
          <div className="lg:col-span-8">
            {driftSubView === 'spatial' ? (
              <div className="h-[520px] rounded-2xl ios-liquid-card border-glow-subtle relative overflow-hidden flex flex-col p-6">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.12]">
                  <div className="font-mono text-xs text-white font-semibold flex items-center space-x-2">
                    <Crosshair className="w-4 h-4 text-rose-400" />
                    <span>2D Embedding Space Vector Scatter (UMAP Projection)</span>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Click points below to inspect execution spans
                  </span>
                </div>

                {/* Vector Canvas */}
                <div className="flex-1 relative my-4 rounded-xl bg-[#040507] border border-neutral-800/60 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:28px_28px]" />

                  {/* Golden Baseline Hull */}
                  <div className="absolute left-[15%] top-[35%] w-52 h-44 rounded-full bg-emerald-500/5 border border-emerald-500/20 flex flex-col items-center justify-center p-4">
                    <span className="text-[10px] font-mono font-bold text-emerald-400">Golden Baseline Region</span>
                    <span className="text-[9px] font-mono text-emerald-500/70">5,000 verified runs</span>
                  </div>

                  {/* Deviation Boundary */}
                  <div className="absolute left-[38%] top-[25%] w-36 h-36 rounded-full bg-amber-500/5 border border-amber-500/20 flex flex-col items-center justify-center p-2">
                    <span className="text-[10px] font-mono font-bold text-amber-400">Deviation Zone</span>
                    <span className="text-[9px] font-mono text-amber-500/70">12-30% Δ</span>
                  </div>

                  {/* Outlier Drift Cluster */}
                  <div className="absolute right-[12%] top-[20%] w-48 h-48 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex flex-col items-center justify-center p-4 animate-pulse">
                    <span className="text-[10px] font-mono font-bold text-rose-300">Critical Drift Cluster</span>
                    <span className="text-[9px] font-mono text-rose-400/80">&gt; 50% Δ Divergence</span>
                  </div>

                  {/* Interactive Scatter Points */}
                  {currentProfile.points.map((pt, idx) => {
                    const posX = pt.cluster === 'baseline' ? 22 + (idx * 5) : pt.cluster === 'deviation' ? 45 + (idx * 6) : 75 + (idx * 4);
                    const posY = pt.cluster === 'baseline' ? 45 + ((idx % 3) * 6) : pt.cluster === 'deviation' ? 35 + ((idx % 2) * 8) : 32 + ((idx % 3) * 10);
                    
                    return (
                      <button
                        key={pt.id}
                        onClick={() => onNavigateToTrace(pt.traceId)}
                        style={{ left: `${posX}%`, top: `${posY}%` }}
                        className={`absolute w-4 h-4 rounded-full border-2 transition-all transform hover:scale-150 z-20 flex items-center justify-center ${
                          pt.cluster === 'baseline'
                            ? 'bg-emerald-500 border-white shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                            : pt.cluster === 'deviation'
                            ? 'bg-amber-400 border-black shadow-[0_0_10px_rgba(251,191,36,0.8)]'
                            : 'bg-rose-500 border-white shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-bounce'
                        }`}
                        title={`${pt.label} (${pt.traceId})`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-neutral-400 pt-2 border-t border-neutral-800/80">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span>Golden Baseline</span>
                  </span>
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span>Deviation Zone</span>
                  </span>
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <span>Critical Drift Outliers</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="surface-solid rounded-xl p-6 border border-neutral-800 space-y-6 font-mono text-xs">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Detailed Divergence Analysis
                </h3>
                <div className="p-4 bg-neutral-950 rounded-lg border border-neutral-800 space-y-2">
                  <div className="text-neutral-400 font-semibold">1. Prompt Cache Desynchronization</div>
                  <p className="text-neutral-300 leading-relaxed">
                    Following the warehouse schema migration from v2 to v3, the model's in-context few-shot prompts retained deprecated column references, triggering a 28% syntax rejection rate on generated Trino SQL queries.
                  </p>
                </div>
                <div className="p-4 bg-neutral-950 rounded-lg border border-neutral-800 space-y-2">
                  <div className="text-neutral-400 font-semibold">2. Tool Argument Formatting Divergence</div>
                  <p className="text-neutral-300 leading-relaxed">
                    Tool invocations to <code>sql_dry_run_explain</code> shifted from single-partition filters to unbounded cross-joins on 14% of analytical requests.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
