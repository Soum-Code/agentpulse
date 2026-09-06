import React, { useState } from 'react';
import {
  Bot,
  Layers,
  Activity,
  AlertTriangle,
  Flame,
  Clock,
  Coins,
  ChevronRight,
  X,
  Pin,
  PinOff,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Database,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  Copy,
  Check,
  Zap,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { Agent, Trace, Span, Incident, ProductTab } from '../../types';

interface ActiveContextPanelProps {
  currentTab: ProductTab;
  onSelectTab: (tab: ProductTab) => void;
  selectedAgent?: Agent;
  selectedTrace?: Trace;
  selectedSpan?: Span;
  selectedIncident?: Incident;
  onClearSelection: () => void;
  onSelectAgent: (agent: Agent) => void;
  onSelectTrace: (trace: Trace) => void;
  onSelectSpan?: (span: Span) => void;
  onCurateToDataset?: (span: Span, trace: Trace) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}

export const ActiveContextPanel: React.FC<ActiveContextPanelProps> = ({
  currentTab,
  onSelectTab,
  selectedAgent,
  selectedTrace,
  selectedSpan,
  selectedIncident,
  onClearSelection,
  onCurateToDataset,
  isOpen,
  onToggleOpen,
  isPinned,
  onTogglePin
}) => {
  const [copied, setCopied] = useState(false);
  const [curatedSuccess, setCuratedSuccess] = useState(false);

  // Derive effective agent info from trace if selectedAgent is not explicitly provided
  const effectiveAgentName = selectedAgent?.name || selectedTrace?.agentName;
  const effectiveAgentFramework = selectedAgent?.framework;
  const effectiveAgentModel = selectedAgent?.model;
  const effectiveAgentStatus = selectedAgent?.status || (selectedTrace?.status === 'error' ? 'error' : 'running');

  const hasAnyContext = !!(selectedAgent || selectedTrace || selectedSpan || selectedIncident);

  const depthLevel = (selectedAgent ? 1 : 0) + (selectedTrace ? 1 : 0) + (selectedSpan ? 1 : 0) + (selectedIncident ? 1 : 0);

  const handleCopyInvestigationReport = () => {
    const report = [
      `=== AGENTPULSE INVESTIGATION CONTEXT ===`,
      `Timestamp: ${new Date().toISOString()}`,
      `Current View: ${currentTab.toUpperCase()}`,
      effectiveAgentName ? `Agent: ${effectiveAgentName} (${effectiveAgentFramework || 'Autonomous Swarm'} - ${effectiveAgentModel || 'Default Model'})` : null,
      selectedIncident ? `Incident: [${selectedIncident.severity.toUpperCase()}] ${selectedIncident.id} - "${selectedIncident.title}"` : null,
      selectedTrace ? `Trace: ${selectedTrace.id} | Duration: ${selectedTrace.durationMs}ms | Tokens: ${selectedTrace.totalTokens} | Status: ${selectedTrace.status.toUpperCase()} | Cost: ${selectedTrace.cost != null ? '$' + selectedTrace.cost.toFixed(4) : 'n/a'}` : null,
      selectedSpan ? `Span: ${selectedSpan.id} (${selectedSpan.name}) | Type: ${selectedSpan.type} | Duration: ${selectedSpan.durationMs}ms` : null,
      selectedSpan?.prompt ? `Span Prompt Preview: ${selectedSpan.prompt.slice(0, 180)}...` : null,
      selectedSpan?.completion ? `Span Completion Preview: ${selectedSpan.completion.slice(0, 180)}...` : null,
      selectedSpan?.evidence ? `Grounding Evidence: ${selectedSpan.evidence.explained}` : null
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleTriggerCurate = () => {
    if (selectedSpan && selectedTrace && onCurateToDataset) {
      onCurateToDataset(selectedSpan, selectedTrace);
      setCuratedSuccess(true);
      setTimeout(() => setCuratedSuccess(false), 2400);
    }
  };

  if (!isOpen) {
    return (
      <aside
        aria-label="Active Context Summary"
        className="fixed bottom-24 right-4 sm:right-6 z-30 transition-all duration-300 ease-out"
      >
        <button
          onClick={onToggleOpen}
          className="glass-morphism-v2 border-glow-subtle px-3.5 py-2 rounded-xl flex items-center space-x-2.5 text-xs font-mono text-white shadow-xl hover:border-white/40 group relative overflow-hidden"
          title="Open Active Context Investigation Panel"
        >
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
          <span className="font-sans font-medium text-neutral-200 group-hover:text-white transition-colors">
            Active Context
          </span>
          {hasAnyContext && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-mono text-[10px] tabular-nums font-bold">
              {depthLevel} active
            </span>
          )}
          <Maximize2 className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-colors ml-1" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Active Context Investigation Workspace"
      className={`transition-all duration-300 ease-in-out z-20 ${
        isPinned
          ? 'w-full lg:w-80 shrink-0'
          : 'fixed top-16 right-4 sm:right-6 bottom-24 w-80 sm:w-96 shadow-2xl z-40'
      }`}
    >
      <div className="glass-morphism-v2 border-glow-subtle rounded-2xl h-full max-h-[calc(100vh-6.5rem)] flex flex-col relative overflow-hidden border border-white/[0.16] shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

        <div className="px-4 py-3 border-b border-white/[0.12] bg-white/[0.04] backdrop-blur-xl flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
            <h2 className="text-xs font-sans font-medium uppercase tracking-wider text-white liquid-card-title flex items-center space-x-1.5">
              <span>Investigation Context</span>
            </h2>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={onTogglePin}
              className={`p-1.5 rounded-lg border transition-all text-neutral-400 hover:text-white ${
                isPinned
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-white/[0.06] border-white/[0.1] hover:bg-white/[0.12]'
              }`}
              title={isPinned ? 'Unpin side panel' : 'Pin side panel into layout grid'}
            >
              {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={onToggleOpen}
              className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-neutral-400 hover:text-white hover:bg-white/[0.12] transition-all"
              title="Minimize panel"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-black/30 border-b border-white/[0.08] flex items-center space-x-1.5 text-[11px] font-mono overflow-x-auto scrollbar-none shrink-0">
          <span className="text-neutral-400 liquid-card-label font-sans text-[10px] uppercase tracking-wider shrink-0">
            Flow:
          </span>
          <span
            onClick={() => onSelectTab('agents')}
            className={`cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
              effectiveAgentName ? 'text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/25' : 'text-neutral-500'
            }`}
          >
            Agent
          </span>
          <ChevronRight className="w-3 h-3 text-neutral-600 shrink-0" />
          <span
            onClick={() => onSelectTab('traces')}
            className={`cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
              selectedTrace ? 'text-cyan-300 font-bold bg-cyan-500/10 border border-cyan-500/25' : 'text-neutral-500'
            }`}
          >
            Trace
          </span>
          <ChevronRight className="w-3 h-3 text-neutral-600 shrink-0" />
          <span
            onClick={() => onSelectTab('traces')}
            className={`cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
              selectedSpan ? 'text-purple-300 font-bold bg-purple-500/10 border border-purple-500/25' : 'text-neutral-500'
            }`}
          >
            Span
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
          {!hasAnyContext ? (
            <div className="text-center py-8 px-3 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.1] flex items-center justify-center mx-auto text-neutral-400">
                <Sparkles className="w-5 h-5 text-neutral-400" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-sans font-medium text-neutral-200">
                  No Active Entities Selected
                </div>
                <p className="text-[11px] font-sans text-neutral-400 leading-relaxed liquid-card-label">
                  Select any Agent, Trace, or Execution Span in the workspace to pin real-time telemetry diagnostics here.
                </p>
              </div>
              <button
                onClick={() => onSelectTab('traces')}
                className="mt-2 text-xs font-sans font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 px-3 py-1.5 rounded-lg transition-all"
              >
                Explore Live Traces ↗
              </button>
            </div>
          ) : (
            <>
              {effectiveAgentName && (
                <div className="ios-liquid-card border-glow-subtle rounded-xl p-3.5 border border-white/[0.12] space-y-2.5 relative group overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-60" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5 liquid-card-label">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Active Agent</span>
                    </span>
                    <button
                      onClick={() => onSelectTab('agents')}
                      className="text-[10px] font-sans text-neutral-400 hover:text-white flex items-center space-x-1 transition-colors"
                      title="Open in Agents view"
                    >
                      <span>inspect</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-sans font-medium text-white tracking-tight liquid-card-title flex items-center justify-between">
                      <span className="truncate">{effectiveAgentName}</span>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          effectiveAgentStatus === 'warning'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        {effectiveAgentStatus}
                      </span>
                    </div>
                    <div className="text-[11px] font-sans text-neutral-400 flex items-center space-x-2 liquid-card-label">
                      {effectiveAgentFramework && (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-200">
                          {effectiveAgentFramework}
                        </span>
                      )}
                      {effectiveAgentModel && (
                        <span className="font-mono text-[11px] text-neutral-300 truncate">
                          {effectiveAgentModel}
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedAgent && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.08] text-[11px]">
                      <div>
                        <div className="text-[10px] font-sans text-neutral-400 uppercase tracking-widest liquid-card-label">
                          Avg Latency
                        </div>
                        <div className="text-neutral-200 font-mono tabular-nums font-medium liquid-card-metric">
                          {selectedAgent.latencyAvgMs}ms
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-neutral-400 uppercase tracking-widest liquid-card-label">
                          Success Rate
                        </div>
                        <div className="text-emerald-400 font-mono tabular-nums font-medium liquid-card-metric">
                          {selectedAgent.successRate}%
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedAgent?.driftStatus !== 'normal' && selectedAgent?.driftScore && (
                    <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-[11px]">
                      <span className="text-amber-300/90 font-sans flex items-center space-x-1">
                        <TrendingDown className="w-3 h-3" />
                        <span>Behavioral Drift</span>
                      </span>
                      <button
                        onClick={() => onSelectTab('drift')}
                        className="text-[10px] font-mono tabular-nums text-amber-300 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                      >
                        {selectedAgent.driftScore} Δ
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedTrace && (
                <div className="ios-liquid-card border-glow-subtle rounded-xl p-3.5 border border-white/[0.12] space-y-2.5 relative group overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-60" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5 liquid-card-label">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Active Trace</span>
                    </span>
                    <button
                      onClick={() => onSelectTab('traces')}
                      className="text-[10px] font-sans text-neutral-400 hover:text-white flex items-center space-x-1 transition-colors"
                      title="Open in Trace waterfall"
                    >
                      <span>waterfall</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-mono tabular-nums font-bold text-white tracking-wider flex items-center justify-between">
                      <span>{selectedTrace.id}</span>
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.5 rounded border ${
                          selectedTrace.status === 'error'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : selectedTrace.status === 'warning'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        {selectedTrace.status}
                      </span>
                    </div>
                    <p className="text-[11px] font-sans text-neutral-300 line-clamp-2 leading-relaxed liquid-card-label">
                      {selectedTrace.inputPreview}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/[0.08] text-[10px] font-mono tabular-nums">
                    <div className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06]">
                      <div className="text-[9px] font-sans text-neutral-400 uppercase tracking-widest liquid-card-label">
                        Latency
                      </div>
                      <div className="text-neutral-200 font-medium">{selectedTrace.durationMs}ms</div>
                    </div>
                    <div className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06]">
                      <div className="text-[9px] font-sans text-neutral-400 uppercase tracking-widest liquid-card-label">
                        Tokens
                      </div>
                      <div className="text-neutral-200 font-medium">{selectedTrace.totalTokens}</div>
                    </div>
                    <div className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06]">
                      <div className="text-[9px] font-sans text-neutral-400 uppercase tracking-widest liquid-card-label">
                        Cost
                      </div>
                      <div className="text-neutral-200 font-medium">{selectedTrace.cost != null ? `$${selectedTrace.cost.toFixed(4)}` : String.fromCharCode(8212)}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
                    <button
                      onClick={() => onSelectTab('replay')}
                      className="w-full text-xs font-sans font-medium text-neutral-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all shadow-xs"
                    >
                      <RotateCcw className="w-3 h-3 text-cyan-400" />
                      <span>Replay in Simulator ↗</span>
                    </button>
                  </div>
                </div>
              )}

              {selectedSpan && (
                <div className="ios-liquid-card border-glow-subtle rounded-xl p-3.5 border border-white/[0.12] space-y-2.5 relative group overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-60" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-purple-400 flex items-center space-x-1.5 liquid-card-label">
                      <Flame className="w-3.5 h-3.5" />
                      <span>Active Span Inspector</span>
                    </span>
                    <span className="font-mono text-[9px] text-neutral-400 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.1]">
                      {selectedSpan.type}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-white tracking-tight truncate">
                      {selectedSpan.name}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-neutral-400 flex items-center space-x-2">
                      <span>Offset: {selectedSpan.startOffsetMs}ms</span>
                      <span>·</span>
                      <span className="text-neutral-200 font-bold">Span: {selectedSpan.durationMs}ms</span>
                    </div>
                  </div>

                  {selectedSpan.evidence && (
                    <div className="p-2 rounded bg-purple-500/10 border border-purple-500/25 space-y-1">
                      <div className="text-[9px] font-sans font-medium uppercase tracking-wider text-purple-300 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Evaluator & Grounding Evidence</span>
                      </div>
                      <p className="text-[10px] font-sans text-purple-200/90 leading-relaxed">
                        {selectedSpan.evidence.explained}
                      </p>
                    </div>
                  )}

                  {onCurateToDataset && selectedTrace && (
                    <div className="pt-2 border-t border-white/[0.08]">
                      <button
                        onClick={handleTriggerCurate}
                        className={`w-full text-xs font-sans font-medium py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all shadow-xs border ${
                          curatedSuccess
                            ? 'bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
                            : 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/40 text-purple-200 hover:text-white'
                        }`}
                      >
                        {curatedSuccess ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Curated to Golden Dataset!</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-3 h-3 text-purple-400" />
                            <span>Curate Span to Dataset</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedIncident && (
                <div className="ios-liquid-card border-glow-subtle rounded-xl p-3.5 border border-rose-500/30 space-y-2.5 relative group overflow-hidden bg-rose-950/20">
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none opacity-60" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-rose-300 flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Linked Incident</span>
                    </span>
                    <button
                      onClick={() => onSelectTab('incidents')}
                      className="text-[10px] font-sans text-rose-300 hover:text-white flex items-center space-x-1 transition-colors"
                    >
                      <span>triage</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-sans font-medium text-white tracking-tight">
                      {selectedIncident.title}
                    </div>
                    <p className="text-[10px] font-sans text-rose-200/80 line-clamp-2 leading-relaxed">
                      {selectedIncident.summary}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-3 border-t border-white/[0.12] bg-white/[0.04] backdrop-blur-xl flex items-center justify-between shrink-0 gap-2">
          {hasAnyContext && (
            <button
              onClick={handleCopyInvestigationReport}
              className="flex-1 text-[11px] font-sans font-medium text-neutral-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] px-2.5 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all shadow-xs"
              title="Copy formatted investigation summary to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-300">Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-neutral-400" />
                  <span>Copy Report</span>
                </>
              )}
            </button>
          )}

          {hasAnyContext && (
            <button
              onClick={onClearSelection}
              className="text-[11px] font-sans font-medium text-neutral-400 hover:text-rose-300 bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 px-2.5 py-1.5 rounded-lg transition-all"
              title="Reset all active selections"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
