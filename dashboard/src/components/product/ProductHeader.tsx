import React from 'react';
import { ChevronRight, Radio, Search, ExternalLink, X, Keyboard, PanelRight } from 'lucide-react';
import { ProductTab, Agent, Trace, Span, Incident } from '../../types';

interface ProductHeaderProps {
  currentTab: ProductTab;
  onSelectTab: (tab: ProductTab) => void;
  selectedAgent?: Agent;
  selectedTrace?: Trace;
  selectedSpan?: Span;
  selectedIncident?: Incident;
  onClearSelection: () => void;
  onOpenCommandPalette: () => void;
  onSwitchToPublic: () => void;
  isSimulatingLive: boolean;
  onToggleLive: () => void;
  onOpenShortcutsModal?: () => void;
  isContextPanelOpen?: boolean;
  onToggleContextPanel?: () => void;
}

export const ProductHeader: React.FC<ProductHeaderProps> = ({
  currentTab,
  onSelectTab,
  selectedAgent,
  selectedTrace,
  selectedSpan,
  selectedIncident,
  onClearSelection,
  onOpenCommandPalette,
  onSwitchToPublic,
  isSimulatingLive,
  onToggleLive,
  onOpenShortcutsModal,
  isContextPanelOpen,
  onToggleContextPanel,
}) => {
  // Derive effective agent name if trace is present but selectedAgent wasn't explicitly set
  const effectiveAgentName = selectedAgent?.name || selectedTrace?.agentName;
  const effectiveAgentId = selectedAgent?.id || selectedTrace?.agentId;

  const hasContextHierarchy = !!(effectiveAgentName || selectedTrace || selectedSpan || selectedIncident);

  return (
    <header className="sticky top-0 z-30 ios-ultra-thin ios-ultra-thin-header px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs font-mono relative">
      <div className="absolute inset-x-0 top-0 h-[1px] liquid-specular-beam pointer-events-none" />

      <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-none min-w-0 pr-4 z-10">
        <button
          onClick={() => {
            onClearSelection();
            onSwitchToPublic();
          }}
          className="flex items-center space-x-2 font-bold text-white hover:text-emerald-300 transition-all uppercase tracking-wider shrink-0 group px-2 py-1 -ml-2 rounded-lg hover:bg-white/[0.08] border border-transparent hover:border-white/[0.14]"
          title="Return to Public Website (AgentPulse Home)"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
          <span className="text-white group-hover:text-emerald-300 transition-colors font-mono tracking-tight font-black">
            AgentPulse
          </span>
          <span className="text-[10px] text-neutral-400 group-hover:text-emerald-200 font-normal lowercase tracking-normal hidden sm:inline">
            ↗ site
          </span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />

        <button
          onClick={() => {
            onClearSelection();
            onSelectTab('overview');
          }}
          className="text-neutral-400 hover:text-white capitalize transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
          title={`Active view: ${currentTab}. Click to return to Overview.`}
        >
          {currentTab.replace('-', ' ')}
        </button>

        {effectiveAgentName && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            <button
              onClick={() => {
                onSelectTab('agents');
              }}
              className="text-neutral-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] px-2.5 py-0.5 rounded-lg border border-white/[0.12] hover:border-white/[0.28] transition-all shrink-0 flex items-center space-x-1.5 shadow-xs"
              title="Jump to Agent view"
            >
              <span className="text-neutral-400">Agent:</span>
              <span className="text-white font-medium truncate max-w-[140px] sm:max-w-[200px]">
                {effectiveAgentName}
              </span>
            </button>
          </>
        )}

        {selectedIncident && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            <button
              onClick={() => {
                onSelectTab('incidents');
              }}
              className={`px-2.5 py-0.5 rounded-lg border transition-all shrink-0 flex items-center space-x-1.5 ${
                selectedIncident.severity === 'critical'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300/90 hover:bg-rose-500/25'
                  : selectedIncident.severity === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300/90 hover:bg-amber-500/25'
                  : 'bg-white/[0.06] border-white/[0.12] text-neutral-200 hover:bg-white/[0.12]'
              }`}
              title="Jump to Incident"
            >
              <span className="opacity-75">Incident:</span>
              <span className="font-semibold">{selectedIncident.id}</span>
            </button>
          </>
        )}

        {selectedTrace && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            <button
              onClick={() => {
                onSelectTab('traces');
              }}
              className={`px-2.5 py-0.5 rounded-lg border transition-all shrink-0 flex items-center space-x-1.5 ${
                selectedTrace.status === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300/90 hover:bg-rose-500/25'
                  : selectedTrace.status === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300/90 hover:bg-amber-500/25'
                  : 'bg-white/[0.06] border-white/[0.14] text-neutral-100 hover:bg-white/[0.12] hover:border-white/[0.3]'
              }`}
              title="Jump to Trace waterfall"
            >
              <span className="text-neutral-400">Trace:</span>
              <span className="font-bold">{selectedTrace.id}</span>
            </button>
          </>
        )}

        {selectedSpan && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            <span
              className={`px-2.5 py-0.5 rounded-lg border shrink-0 flex items-center space-x-1.5 ${
                selectedSpan.status === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300/90'
                  : selectedSpan.status === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300/90'
                  : 'bg-white/[0.1] border-white/[0.22] text-white font-medium shadow-xs'
              }`}
              title={`Span ID: ${selectedSpan.id}`}
            >
              <span className="text-neutral-400">Span:</span>
              <span className="truncate max-w-[120px] sm:max-w-[180px]">{selectedSpan.name}</span>
            </span>
          </>
        )}

        {hasContextHierarchy && (
          <button
            onClick={onClearSelection}
            className="text-neutral-400 hover:text-white p-1 hover:bg-white/[0.08] rounded-md transition-colors shrink-0 ml-1"
            title="Clear active context drilldown"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center space-x-2.5 shrink-0 z-10">
        <button
          onClick={onToggleLive}
          className={`flex items-center space-x-2 px-3 py-1 rounded-lg border text-[11px] font-mono transition-all ${
            isSimulatingLive
              ? 'liquid-glass-emerald text-emerald-200'
              : 'bg-white/[0.03] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06]'
          }`}
          title="Toggle live synthetic telemetry stream"
        >
          <Radio className={`w-3 h-3 ${isSimulatingLive ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'}`} />
          <span className="hidden sm:inline font-semibold">{isSimulatingLive ? 'LIVE INGESTION' : 'STREAM PAUSED'}</span>
        </button>

        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-2 liquid-glass-pill text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg transition-all"
          title="Open Command Palette (Cmd+K / Ctrl+K)"
        >
          <Search className="w-3 h-3 text-neutral-400" />
          <span className="hidden md:inline">Jump to...</span>
          <kbd className="bg-black/60 text-neutral-200 px-1.5 py-0.5 rounded border border-white/[0.14] text-[10px] font-mono font-bold">
            ⌘K
          </kbd>
        </button>

        {onToggleContextPanel && (
          <button
            onClick={onToggleContextPanel}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
              isContextPanelOpen
                ? 'liquid-glass-pill text-emerald-300 border-emerald-500/40 bg-emerald-500/15'
                : 'liquid-glass-pill text-neutral-300 hover:text-white'
            }`}
            title="Toggle Active Context Side Panel"
          >
            <PanelRight className={`w-3.5 h-3.5 ${isContextPanelOpen ? 'text-emerald-400' : 'text-neutral-400'}`} />
            <span className="hidden xl:inline font-sans text-xs">Active Context</span>
            {hasContextHierarchy && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        )}

        {onOpenShortcutsModal && (
          <button
            onClick={onOpenShortcutsModal}
            className="flex items-center space-x-1.5 liquid-glass-pill text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg transition-all"
            title="Keyboard Shortcuts Cheat Sheet (Press ?)"
          >
            <Keyboard className="w-3.5 h-3.5 text-neutral-400" />
            <kbd className="bg-black/60 text-neutral-200 px-1.5 py-0.5 rounded border border-white/[0.14] text-[10px] font-mono font-bold">
              ?
            </kbd>
          </button>
        )}

        <button
          onClick={onSwitchToPublic}
          className="text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/[0.08] transition-colors flex items-center space-x-1 border border-transparent hover:border-white/[0.12]"
          title="Switch to Editorial Public Landing"
        >
          <span className="hidden lg:inline font-medium">Public Site</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
};
