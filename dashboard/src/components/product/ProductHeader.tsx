import React from 'react';
import { ChevronRight, Radio, Search, ExternalLink, X, Keyboard, PanelRight, Moon, Sun, Layers, User, LogIn, ChevronDown, Sparkles } from 'lucide-react';
import { ProductTab, Agent, Trace, Span, Incident, TelemetryProject } from '../../types';
import { User as FirebaseUser } from 'firebase/auth';

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
  isCalmMode?: boolean;
  onToggleCalmMode?: () => void;
  currentUser?: FirebaseUser | null;
  activeProject?: TelemetryProject | null;
  onOpenAuth?: () => void;
  onOpenProjectSelector?: () => void;
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
  isCalmMode = false,
  onToggleCalmMode,
  currentUser,
  activeProject,
  onOpenAuth,
  onOpenProjectSelector
}) => {
  // Derive effective agent name if trace is present but selectedAgent wasn't explicitly set
  const effectiveAgentName = selectedAgent?.name || selectedTrace?.agentName;
  const effectiveAgentId = selectedAgent?.id || selectedTrace?.agentId;

  const hasContextHierarchy = !!(effectiveAgentName || selectedTrace || selectedSpan || selectedIncident);

  return (
    <header className="sticky top-0 z-30 ios-ultra-thin ios-ultra-thin-header px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs font-mono relative">
      {/* Top Specular Beam */}
      <div className="absolute inset-x-0 top-0 h-[1px] liquid-specular-beam pointer-events-none" />

      {/* Context-Preserving Breadcrumb Spine (Hierarchy: Agent A > Trace 483 > Span 7) */}
      <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-none min-w-0 pr-4 z-10">
        {/* Brand Root: Redirects to Website */}
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

        {/* Tab Level / Overview Reset */}
        <button
          onClick={() => {
            onClearSelection();
            onSelectTab('overview');
          }}
          className="text-neutral-400 hover:text-white capitalize transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
          title={`Active view: ${currentTab}. Click to return to Overview.`}
        >
          {currentTab === 'performance' ? 'Performance Metrics (APM)' : currentTab.replace('-', ' ')}
        </button>

        {/* Hierarchy Level 1: Agent */}
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

        {/* Hierarchy Incident Context (if viewing incident) */}
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

        {/* Hierarchy Level 2: Trace */}
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

        {/* Hierarchy Level 3: Span */}
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

        {/* Clear Context button if hierarchy is active */}
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

      {/* Right Controls */}
      <div className="flex items-center space-x-2.5 shrink-0 z-10">
        {/* Live Simulator Pulsar */}
        <button
          onClick={onToggleLive}
          className={`flex items-center space-x-2 px-3 py-1 rounded-lg border text-[11px] font-mono transition-all tactile-press ${
            isSimulatingLive
              ? 'liquid-glass-emerald text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-white/[0.03] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06]'
          }`}
          title="Toggle live synthetic telemetry stream"
        >
          <Radio className={`w-3 h-3 ${isSimulatingLive ? 'text-emerald-400 phosphor-emerald animate-pulse' : 'text-neutral-500'}`} />
          <span className="hidden sm:inline font-semibold">{isSimulatingLive ? 'LIVE INGESTION' : 'STREAM PAUSED'}</span>
        </button>

        {/* Cmd+K Quick Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-2 liquid-glass-pill text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg transition-all tactile-press"
          title="Open Command Palette (Cmd+K / Ctrl+K)"
        >
          <Search className="w-3 h-3 text-neutral-400" />
          <span className="hidden md:inline">Jump to...</span>
          <kbd className="keycap-bevel text-neutral-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
            ⌘K
          </kbd>
        </button>

        {/* Active Context Panel Toggle */}
        {onToggleContextPanel && (
          <button
            onClick={onToggleContextPanel}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all tactile-press ${
              isContextPanelOpen
                ? 'liquid-glass-pill text-emerald-300 border-emerald-500/40 bg-emerald-500/15'
                : 'liquid-glass-pill text-neutral-300 hover:text-white'
            }`}
            title="Toggle Active Context Side Panel"
          >
            <PanelRight className={`w-3.5 h-3.5 ${isContextPanelOpen ? 'text-emerald-400' : 'text-neutral-400'}`} />
            <span className="hidden xl:inline font-sans text-xs">Active Context</span>
            {hasContextHierarchy && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 phosphor-emerald animate-pulse" />
            )}
          </button>
        )}

        {/* Calm Mode (Deep Zen Theme) Toggle */}
        {onToggleCalmMode && (
          <button
            onClick={onToggleCalmMode}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all tactile-press ${
              isCalmMode
                ? 'liquid-glass-pill text-neutral-200 border-neutral-600 bg-neutral-800/80 shadow-[0_0_12px_rgba(255,255,255,0.06)]'
                : 'liquid-glass-pill text-neutral-300 hover:text-white'
            }`}
            title={`Calm Mode: ${isCalmMode ? 'Active (Deep Zen Grayscale)' : 'Inactive (High-Contrast Dark)'}. Click to toggle.`}
            aria-label="Toggle Calm Mode Deep Zen Theme"
          >
            <Moon className={`w-3.5 h-3.5 ${isCalmMode ? 'text-neutral-300' : 'text-neutral-400'}`} />
            <span className="hidden xl:inline font-sans text-xs">
              {isCalmMode ? 'Deep Zen' : 'Calm'}
            </span>
          </button>
        )}

        {/* Global Keyboard Shortcuts Cheat Sheet Button */}
        {onOpenShortcutsModal && (
          <button
            onClick={onOpenShortcutsModal}
            className="flex items-center space-x-1.5 liquid-glass-pill text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg transition-all tactile-press"
            title="Keyboard Shortcuts Cheat Sheet (Press ?)"
          >
            <Keyboard className="w-3.5 h-3.5 text-neutral-400" />
            <kbd className="keycap-bevel text-neutral-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
              ?
            </kbd>
          </button>
        )}

        {/* Project Selector Trigger */}
        {onOpenProjectSelector && (
          <button
            onClick={onOpenProjectSelector}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 transition-all tactile-press text-xs font-mono"
            title="Switch or create Agent Telemetry Project in Firestore"
          >
            <Layers className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline font-bold truncate max-w-[120px]">
              {activeProject ? activeProject.name : 'Default Project'}
            </span>
            <ChevronDown className="w-3 h-3 text-amber-400/70" />
          </button>
        )}

        {/* Auth / Profile Trigger */}
        {onOpenAuth && (
          <button
            onClick={onOpenAuth}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all tactile-press text-xs font-mono ${
              currentUser
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:text-white hover:bg-white/10'
            }`}
            title={currentUser ? `Signed in as ${currentUser.displayName || currentUser.email || 'Developer'}` : 'Sign In with Firebase'}
          >
            {currentUser ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-400/30 border border-emerald-400 flex items-center justify-center text-[9px] font-bold text-emerald-200">
                  {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                </div>
                <span className="hidden md:inline truncate max-w-[110px]">
                  {currentUser.displayName || (currentUser.isAnonymous ? 'Guest' : 'Developer')}
                </span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5 text-amber-300" />
                <span className="font-semibold text-amber-300">Sign In</span>
              </>
            )}
          </button>
        )}

        {/* Switch to Public Website view */}
        <button
          onClick={onSwitchToPublic}
          className="text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/[0.08] transition-colors flex items-center space-x-1 border border-transparent hover:border-white/[0.12] tactile-press"
          title="Switch to Editorial Public Landing"
        >
          <span className="hidden lg:inline font-medium">Public Site</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
};
