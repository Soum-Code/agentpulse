import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, ArrowRight, Bot, Activity, CheckCircle2, ChevronRight, Wrench, RefreshCw, Check } from 'lucide-react';
import { Incident, Agent, Trace } from '../../types';

interface IncidentsViewProps {
  incidents: Incident[];
  selectedIncident?: Incident;
  onSelectIncident: (incident: Incident) => void;
  onNavigateToTrace: (traceId: string) => void;
  onNavigateToAgent: (agentId: string) => void;
  onResolveIncident: (incidentId: string) => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onNavigateToTrace,
  onNavigateToAgent,
  onResolveIncident
}) => {
  const currentIncident = selectedIncident || incidents[0];

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <span>Failure-First Incident Investigation</span>
        </h2>
        <p className="text-xs font-mono text-neutral-400 mt-1">
          Honeycomb model: Problem → Context → Agent → Trace → Root Cause Analysis
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-3">
          {incidents.map((incident) => {
            const isSelected = currentIncident?.id === incident.id;

            return (
              <div
                key={incident.id}
                onClick={() => onSelectIncident(incident)}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-250 space-y-2 relative overflow-hidden group ${
                  isSelected
                    ? 'ios-liquid-card border-glow-subtle border-white/40 shadow-[0_0_30px_rgba(255,255,255,0.08)]'
                    : 'ios-liquid-row text-neutral-300'
                }`}
              >
                {isSelected && (
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                )}
                <div className="flex items-center justify-between text-xs font-mono">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      incident.severity === 'critical'
                        ? 'bg-rose-500/15 text-rose-300/90 border border-rose-500/25'
                        : 'bg-amber-500/15 text-amber-300/90 border border-amber-500/25'
                    }`}
                  >
                    {incident.severity.toUpperCase()}
                  </span>
                  <span className="text-neutral-400 text-[11px]">{incident.detectedAt}</span>
                </div>

                <div className="text-xs font-bold text-white font-mono">
                  {incident.title}
                </div>

                <p className="text-[11px] text-neutral-300 line-clamp-2 leading-relaxed">
                  {incident.summary}
                </p>

                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.06]">
                  <span className="text-neutral-200">{incident.agentName.split(' ')[0]}</span>
                  <span className="text-rose-400/90 font-medium">{incident.affectedRunsCount} affected runs</span>
                </div>
              </div>
            );
          })}
        </div>

        {currentIncident && (
          <div className="lg:col-span-7 ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
            <div className="px-6 py-4 border-b border-white/[0.12] flex items-center justify-between bg-white/[0.04] backdrop-blur-xl">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block font-medium">
                  INCIDENT DIAGNOSIS · {currentIncident.id}
                </span>
                <h3 className="text-sm font-bold text-white font-mono mt-0.5">
                  {currentIncident.title}
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onResolveIncident(currentIncident.id)}
                  className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-mono font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark Resolved</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 font-mono text-xs">
              <div className="space-y-1.5 border-l-2 border-rose-500/80 pl-4">
                <div className="text-[10px] uppercase text-neutral-400 font-medium">1. Problem Summary</div>
                <div className="text-sm font-semibold text-white">{currentIncident.title}</div>
                <p className="text-neutral-300 leading-relaxed">{currentIncident.summary}</p>
              </div>

              <div className="space-y-1.5 border-l-2 border-white/20 pl-4">
                <div className="text-[10px] uppercase text-neutral-400 font-medium">2. Originating Agent &amp; Swarm Context</div>
                <div className="flex items-center justify-between bg-white/[0.03] p-3.5 rounded-xl border border-white/[0.08]">
                  <div>
                    <span className="text-white font-semibold block">{currentIncident.agentName}</span>
                    <span className="text-neutral-400 text-[11px]">ID: {currentIncident.agentId}</span>
                  </div>
                  <button
                    onClick={() => onNavigateToAgent(currentIncident.agentId)}
                    className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.12] text-neutral-200 text-xs flex items-center space-x-1 border border-white/[0.08] hover:border-white/20 transition-colors"
                  >
                    <span>Inspect Agent</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 border-l-2 border-amber-500/80 pl-4">
                <div className="text-[10px] uppercase text-neutral-400 font-medium">3. Failing Execution Trace</div>
                <div className="flex items-center justify-between bg-white/[0.03] p-3.5 rounded-xl border border-white/[0.08]">
                  <div>
                    <span className="text-white font-semibold block">Trace {currentIncident.traceId}</span>
                    <span className="text-neutral-400 text-[11px]">Flagged Span: {currentIncident.spanId || 'Root'}</span>
                  </div>
                  <button
                    onClick={() => onNavigateToTrace(currentIncident.traceId)}
                    className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.12] text-neutral-200 text-xs flex items-center space-x-1 border border-white/[0.08] hover:border-white/20 transition-colors"
                  >
                    <span>Jump to Trace Waterfall</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 border-l-2 border-rose-500/80 pl-4">
                <div className="text-[10px] uppercase text-neutral-400 font-medium">4. Root Cause Discrepancy</div>
                <div className="p-3.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-200/95 leading-relaxed">
                  {currentIncident.rootCause}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="text-[10px] uppercase text-neutral-400 font-semibold flex items-center space-x-1.5">
                  <Wrench className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Recommended Remedial Action</span>
                </div>
                <p className="text-neutral-300 leading-relaxed">
                  {currentIncident.suggestedAction}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
