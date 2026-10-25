import React, { useState } from 'react';
import { TrendingDown, Crosshair } from 'lucide-react';
import { DriftProfile, Agent } from '../../types';
import { DRIFT_THRESHOLD } from '../../lib/adapters';
import {
  DRIFT_BASELINE_OUTPUTS,
  DRIFT_CURRENT_WINDOW_OUTPUTS,
  distanceBarPct,
  formatDistance,
  isOverDriftThreshold,
} from '../../lib/agentFormat';

interface DriftViewProps {
  driftProfiles: DriftProfile[];
  agents: Agent[];
  selectedAgentId?: string;
  onNavigateToTrace: (traceId: string) => void;
}

/** The Drift tab. Every number is read from GET /v1/drift through toDriftProfiles
 *  (lib/adapters.ts); a distance the backend has not computed prints as an em dash.
 *
 *  Removed on 2026-10-25 because nothing in the API produces them: "5,000 verified runs",
 *  "12-30% Δ", "> 50% Δ Divergence", a "Parameter Drift" meter, "Active Sample: 0", and a
 *  "Detailed Divergence Analysis" (a 28% SQL rejection rate, 14% cross-joins) that was shown
 *  for every agent whatever its data. */
export const DriftView: React.FC<DriftViewProps> = ({
  driftProfiles,
  selectedAgentId,
}) => {
  const [activeProfileId, setActiveProfileId] = useState<string>(
    selectedAgentId || driftProfiles[0]?.agentId || ''
  );
  const [driftSubView, setDriftSubView] = useState<'spatial' | 'matrix'>('spatial');

  const currentProfile = driftProfiles.find(p => p.agentId === activeProfileId) || driftProfiles[0];

  // Colour for a window distance: rose over the alert threshold, emerald at or under it,
  // grey when there is no distance yet.
  const distanceTone = (d?: number) =>
    d == null ? 'text-neutral-500' : isOverDriftThreshold(d) ? 'text-rose-400' : 'text-emerald-400';

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <TrendingDown className="w-5 h-5 text-amber-400" />
            <span>Behavioral Drift</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Per agent: the mean embedding of its latest {DRIFT_CURRENT_WINDOW_OUTPUTS} outputs against the mean of its
            first {DRIFT_BASELINE_OUTPUTS}. DRIFT_DETECTED fires above a cosine distance of {DRIFT_THRESHOLD.toFixed(2)}.
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
            How it is measured
          </button>
          <button
            onClick={() => setDriftSubView('matrix')}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
              driftSubView === 'matrix' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            All agents (table)
          </button>
        </div>
      </div>

      {driftProfiles.length === 0 && (
        <p className="text-xs font-mono text-neutral-500">No agent has a drift record yet.</p>
      )}

      {/* Agent Selector Bar: the window distance next to each name, a dash until it exists. */}
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
            <span>{p.agentName}</span>
            <span className={`ml-2 font-bold ${distanceTone(p.driftMagnitude)}`}>({formatDistance(p.driftMagnitude)} Δ)</span>
          </button>
        ))}
      </div>

      {/* Main Drift Workspace */}
      {currentProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: the selected agent's measured distances */}
          <div className="lg:col-span-4 space-y-4">
            <div className="ios-liquid-card border-glow-subtle rounded-2xl p-5 space-y-4 font-mono text-xs relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
              <div>
                <span className="text-[10px] uppercase text-neutral-400 font-bold tracking-wider">WINDOW CENTROID DISTANCE</span>
                <div className={`text-3xl font-black mt-1 drop-shadow-xs ${distanceTone(currentProfile.driftMagnitude)}`}>
                  {formatDistance(currentProfile.driftMagnitude)} Δ
                </div>
                <p className="text-[11px] text-neutral-300 mt-1.5 leading-relaxed">
                  {currentProfile.driftReason}
                </p>
              </div>

              {/* The other two numbers GET /v1/drift returns. Neither raises an alert. */}
              <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-400">Per-output distance:</span>
                    <span className="text-neutral-200 font-semibold">{formatDistance(currentProfile.semanticDrift)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                    <div className="h-full bg-neutral-400 rounded-full" style={{ width: `${distanceBarPct(currentProfile.semanticDrift)}%` }} />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    The latest output against the agent&rsquo;s running average. Noisy from output to output, so no alert reads it.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-400">Tool-use spread:</span>
                    <span className="text-neutral-200 font-semibold">{formatDistance(currentProfile.toolCallDrift)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                    <div className="h-full bg-neutral-400 rounded-full" style={{ width: `${distanceBarPct(currentProfile.toolCallDrift)}%` }} />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    0 when one tool does every call, 1 when calls are spread evenly over the agent&rsquo;s tools; 0 until it has made 10 tool calls.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[10px] text-neutral-400 border-t border-white/[0.06]">
                {/* baseline_size counts the agent's spans analysed before its latest drift record. */}
                <span>Spans before latest record: <strong className="text-neutral-200">{currentProfile.baselineSampleCount}</strong></span>
                <span>Alert above: <strong className="text-neutral-200">{DRIFT_THRESHOLD.toFixed(2)}</strong></span>
              </div>
            </div>
          </div>

          {/* Right Column: a labelled schematic of the rule, or every agent's numbers. */}
          <div className="lg:col-span-8">
            {driftSubView === 'spatial' ? (
              <div className="h-[520px] rounded-2xl ios-liquid-card border-glow-subtle relative overflow-hidden flex flex-col p-6">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.12]">
                  <div className="font-mono text-xs text-white font-semibold flex items-center space-x-2">
                    <Crosshair className="w-4 h-4 text-rose-400" />
                    <span>Drift schematic &mdash; no projection: the API exposes distances, not coordinates</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300">
                    Illustrative, not measured
                  </span>
                </div>

                {/* Two pools and the distance between their means, as drift.py computes it.
                    The positions are a drawing; only the rule in the labels is real. */}
                <div className="flex-1 relative my-4 rounded-xl bg-[#040507] border border-neutral-800/60 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:28px_28px]" />

                  <div className="absolute left-[12%] top-[30%] w-52 h-44 rounded-full bg-emerald-500/5 border border-emerald-500/20 flex flex-col items-center justify-center p-4 text-center">
                    <span className="text-[10px] font-mono font-bold text-emerald-400">Baseline</span>
                    <span className="text-[9px] font-mono text-emerald-500/70">mean of the agent&rsquo;s first {DRIFT_BASELINE_OUTPUTS} outputs</span>
                  </div>

                  <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                    <line x1="38%" y1="50%" x2="62%" y2="42%" stroke="#f43f5e" strokeWidth="2" strokeDasharray="5 5" />
                  </svg>

                  <div className="absolute right-[12%] top-[22%] w-48 h-48 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex flex-col items-center justify-center p-4 text-center">
                    <span className="text-[10px] font-mono font-bold text-rose-300">Current window</span>
                    <span className="text-[9px] font-mono text-rose-400/80">mean of its latest {DRIFT_CURRENT_WINDOW_OUTPUTS} outputs</span>
                  </div>

                  <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 text-[10px] font-mono text-neutral-300 text-center px-3">
                    cosine distance between the two means &rarr; DRIFT_DETECTED above {DRIFT_THRESHOLD.toFixed(2)}
                  </div>
                </div>

                <p className="text-[11px] font-mono text-neutral-400 pt-2 border-t border-neutral-800/80 leading-relaxed">
                  The distance stays empty until both pools are full, so an agent with fewer than{' '}
                  {DRIFT_BASELINE_OUTPUTS + DRIFT_CURRENT_WINDOW_OUTPUTS} evaluated outputs has none. The embeddings come
                  from MiniLM-L6-v2 on CPU.
                </p>
              </div>
            ) : (
              <div className="surface-solid rounded-xl p-6 border border-neutral-800 space-y-4 font-mono text-xs overflow-x-auto">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Every agent, as GET /v1/drift returns it
                </h3>
                <table className="w-full text-left">
                  <thead className="text-[10px] uppercase text-neutral-400">
                    <tr>
                      <th className="py-2 pr-4">Agent</th>
                      <th className="py-2 pr-4">Window distance</th>
                      <th className="py-2 pr-4">Per-output</th>
                      <th className="py-2 pr-4">Tool spread</th>
                      <th className="py-2 pr-4">Spans before latest</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-200">
                    {driftProfiles.map((p) => (
                      <tr key={p.agentId} className="border-t border-neutral-800/80">
                        <td className="py-2 pr-4">{p.agentName}</td>
                        <td className={`py-2 pr-4 font-bold ${distanceTone(p.driftMagnitude)}`}>{formatDistance(p.driftMagnitude)}</td>
                        <td className="py-2 pr-4">{formatDistance(p.semanticDrift)}</td>
                        <td className="py-2 pr-4">{formatDistance(p.toolCallDrift)}</td>
                        <td className="py-2 pr-4">{p.baselineSampleCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
