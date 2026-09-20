import React, { useState, useEffect } from 'react';
import {
  DesignMode,
  ProductTab,
  Agent,
  Trace,
  Span,
  Incident,
  DriftProfile,
  Dataset,
  Experiment,
  ColorPalette,
  ChalkSurfacePreset
} from './types';
import { useTelemetry } from './lib/useTelemetry';
import { api } from './lib/api';

import { PublicExperience } from './components/public/PublicExperience';
import { LiquidBackgroundCanvas } from './components/public/LiquidBackgroundCanvas';

import { ProductHeader } from './components/product/ProductHeader';
import { FloatingDock } from './components/product/FloatingDock';
import { CommandPalette } from './components/product/CommandPalette';
import { OverviewView } from './components/product/OverviewView';
import { AgentsView } from './components/product/AgentsView';
import { TracesView } from './components/product/TracesView';
import { IncidentsView } from './components/product/IncidentsView';
import { DriftView } from './components/product/DriftView';
import { ExperimentsView } from './components/product/ExperimentsView';
import { DatasetsView } from './components/product/DatasetsView';
import { ReplayView } from './components/product/ReplayView';
import { TelemetryLabView } from './components/product/TelemetryLabView';
import { PerformanceView } from './components/product/PerformanceView';
import { SettingsView } from './components/product/SettingsView';
import { ShortcutsHelpModal } from './components/product/ShortcutsHelpModal';
import { ActiveContextPanel } from './components/product/ActiveContextPanel';
import { initLiquidCardSpringListener } from './utils/liquidHoverAnime';
import { initChalkMoteProximityListener } from './utils/chalkMoteProximity';
import { AuthModal } from './components/product/AuthModal';
import { ProjectSelectorModal } from './components/product/ProjectSelectorModal';
import { RagChatbotApp } from './components/rag/RagChatbotApp';
import { auth, onAuthStateChanged, subscribeToUserProjects } from './lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import type { TelemetryProject } from './types';
import { ExternalLink } from 'lucide-react';

export default function App() {
  // 'product' is the primary AgentPulse console frontend.
  // 'rag' is the fullscreen dedicated RAG monitor & drift verification split-screen.
  // 'public' is the marketing landing page.
  const [mode, setMode] = useState<DesignMode>('product');
  const [palette, setPalette] = useState<ColorPalette>('dark');
  const [isCalmMode, setIsCalmMode] = useState<boolean>(false);
  const [chalkSurface, setChalkSurface] = useState<ChalkSurfacePreset>('classic-white');

  const [productTab, setProductTab] = useState<ProductTab>('overview');

  // Context-Preserving selection states (The Most Important UX Pattern: Agent A ↳ Trace 483 ↳ Span 7)
  const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>(undefined);
  const [selectedTrace, setSelectedTrace] = useState<Trace | undefined>(undefined);
  const [selectedSpan, setSelectedSpan] = useState<Span | undefined>(undefined);
  const [selectedIncident, setSelectedIncident] = useState<Incident | undefined>(undefined);

  // Active Context Side-Panel open & pinned states
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [isContextPanelPinned, setIsContextPanelPinned] = useState(true);

  // Core telemetry, polled from the running AgentPulse instance.
  const {
    agents,
    traces,
    incidents,
    driftProfiles,
    datasets,
    experiments,
    loading: telemetryLoading,
    error: telemetryError,
    connected,
    refresh: refreshTelemetry,
  } = useTelemetry();

  // Sign-in and project selection.
  //
  // Firebase handles identity; the AgentPulse backend does not know about users
  // and is not being asked to. What it does know about is keys: creating a
  // project calls POST /v1/keys with the Firebase uid as its owner, and the key
  // that comes back is one the API will actually accept. Before this, the
  // console generated a key-shaped string locally, showed it with a copy
  // button, and every use of it returned 401.
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [projects, setProjects] = useState<TelemetryProject[]>([]);
  const [activeProject, setActiveProject] = useState<TelemetryProject | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);

  // Pointer-driven card spring and chalk-dust dispersion. Both attach one
  // document-level listener and return their own teardown; the components they
  // drive arrived with the frontend merge.
  useEffect(() => {
    const cleanupLiquid = initLiquidCardSpringListener();
    const cleanupChalkMotes = initChalkMoteProximityListener();
    return () => {
      cleanupLiquid();
      cleanupChalkMotes();
    };
  }, []);

  useEffect(() => onAuthStateChanged(auth, setCurrentUser), []);

  useEffect(() => {
    if (!currentUser) {
      setProjects([]);
      setActiveProject(null);
      return;
    }
    return subscribeToUserProjects(currentUser.uid, (projs) => {
      setProjects(projs);
      setActiveProject((curr) =>
        curr && projs.some((p) => p.id === curr.id)
          ? projs.find((p) => p.id === curr.id) ?? null
          : projs[0] ?? null,
      );
    });
  }, [currentUser]);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  const [isSimulatingLive, setIsSimulatingLive] = useState(true);

  // Global Keyboard shortcut listener (Cmd+K, ?, chord navigation 'g' + key)
  useEffect(() => {
    let chordKey: string | null = null;
    let chordTimer: any = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      // Cmd+K / Ctrl+K toggle command palette anywhere
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (isShortcutsHelpOpen) {
          setIsShortcutsHelpOpen(false);
          return;
        }
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
          return;
        }
      }

      // Don't trigger single-key global shortcuts while typing in input fields
      if (isInputActive) return;

      // Question mark '?' toggles keyboard shortcuts cheat sheet
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsHelpOpen(prev => !prev);
        return;
      }

      // 'g' key chord navigation (VIM style)
      if (e.key.toLowerCase() === 'g' && !chordKey) {
        chordKey = 'g';
        clearTimeout(chordTimer);
        chordTimer = setTimeout(() => {
          chordKey = null;
        }, 1200);
        return;
      }

      if (chordKey === 'g') {
        const k = e.key.toLowerCase();
        chordKey = null;
        clearTimeout(chordTimer);

        if (k === 'o') {
          e.preventDefault();
          setProductTab('overview');
        } else if (k === 't') {
          e.preventDefault();
          setProductTab('traces');
        } else if (k === 'a') {
          e.preventDefault();
          setProductTab('agents');
        } else if (k === 'i') {
          e.preventDefault();
          setProductTab('incidents');
        } else if (k === 'd') {
          e.preventDefault();
          setProductTab('drift');
        } else if (k === 'r') {
          e.preventDefault();
          setProductTab('replay');
        } else if (k === 'e') {
          e.preventDefault();
          setProductTab('experiments');
        } else if (k === 's') {
          e.preventDefault();
          setProductTab('settings');
        } else if (k === 'l') {
          e.preventDefault();
          setProductTab('telemetry-lab');
        } else if (k === 'c') {
          e.preventDefault();
          setIsContextPanelOpen(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(chordTimer);
    };
  }, [isShortcutsHelpOpen, isCommandPaletteOpen]);

  // The former synthetic telemetry pulse was removed: it fabricated traces,
  // latencies and evaluator evidence that never came from the backend.

  // Handler: curate a span into the benchmark dataset. Field names must match
  const handleCurateToDataset = async (span: Span, trace: Trace) => {
    try {
      const risk = trace.groundingScore;
      await api.curateCase('AgentPulse Benchmark', {
        case_id: `curated_${span.id}`,
        input_query: span.prompt ?? trace.inputPreview ?? '',
        agent_claim: span.completion ?? trace.outputPreview ?? '',
        evidence: typeof span.toolOutput === 'string' ? span.toolOutput : undefined,
        expected_classification: risk != null && risk > 0.5 ? 'REFUTED' : 'SUPPORTED',
        is_failure: risk != null && risk > 0.5,
        trace_id: trace.id,
        span_id: span.id,
        operator_notes: `Curated from trace ${trace.id} (agent ${span.agentLane ?? trace.agentId}).`,
      });
      refreshTelemetry();
    } catch (err) {
      console.warn('Curation failed:', err);
    }
  };

  // Handler: run a scenario in the backend simulator. The resulting spans come
  // back through the normal telemetry poll once the worker has evaluated them.
  //
  // Deliberately does not catch. This runs because someone pressed a button, so
  // a refusal has to reach them; swallowing it into console.warn is what made
  // the Lab look like it worked while the API was answering 422.
  const handleRunScenario = async (scenario: string, query: string) => {
    const result = await api.simulatePipeline(scenario, query);
    refreshTelemetry();
    return result;
  };

  // Handler: acknowledge an incident against the alerts API.
  const handleResolveIncident = async (incidentId: string) => {
    try {
      await api.acknowledgeAlert(Number(incidentId));
      refreshTelemetry();
    } catch (err) {
      console.warn('Acknowledge failed:', err);
    }
  };

  const handleClearSelection = () => {
    setSelectedAgent(undefined);
    setSelectedTrace(undefined);
    setSelectedSpan(undefined);
    setSelectedIncident(undefined);
  };

  if (mode === 'rag') {
    return (
      <RagChatbotApp
        onOpenConsole={() => {
          setMode('product');
          setProductTab('overview');
        }}
        onSelectTab={(tab) => {
          setMode('product');
          setProductTab(tab);
        }}
        onToggleFullscreen={() => {
          setMode('product');
          setProductTab('rag-monitor');
        }}
        palette={palette}
        isCalmMode={isCalmMode}
        chalkSurface={chalkSurface}
      />
    );
  }

  if (mode === 'public') {
    return (
      <PublicExperience
        onEnterProduct={() => {
          setMode('product');
          setProductTab('overview');
        }}
      />
    );
  }
  const appBgClass = isCalmMode
    ? 'bg-[#0e1219] text-[#E2E8F0]'
    : palette === 'butter'
    ? 'bg-[#FAF6EF] text-[#2C2825]'
    : palette === 'chalk'
    ? 'bg-[#18191B] text-[#E0E2EC]'
    : 'bg-[#06070a] text-[#F5F5F7]';

  return (
    <div className={`min-h-screen ${appBgClass} selection:bg-neutral-800 selection:text-white flex flex-col relative overflow-x-hidden transition-colors duration-200`}>
      <LiquidBackgroundCanvas palette={palette} chalkSurface={chalkSurface} className="fixed inset-0 pointer-events-none opacity-45 z-0" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <ProductHeader
          currentTab={productTab}
          onSelectTab={setProductTab}
          selectedAgent={selectedAgent}
          selectedTrace={selectedTrace}
          selectedSpan={selectedSpan}
          selectedIncident={selectedIncident}
          onClearSelection={handleClearSelection}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          currentUser={currentUser}
          activeProject={activeProject}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenProjectSelector={() => setIsProjectSelectorOpen(true)}
          onSwitchToPublic={() => setMode('public')}
          onSwitchToRag={() => setMode('rag')}
          isSimulatingLive={isSimulatingLive}
          onToggleLive={() => setIsSimulatingLive(prev => !prev)}
          onOpenShortcutsModal={() => setIsShortcutsHelpOpen(true)}
          isContextPanelOpen={isContextPanelOpen}
          onToggleContextPanel={() => setIsContextPanelOpen(prev => !prev)}
          palette={palette}
          onSelectPalette={setPalette}
          isCalmMode={isCalmMode}
          onToggleCalmMode={() => setIsCalmMode(prev => !prev)}
        />

        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 flex flex-col lg:flex-row gap-6 items-start">
          <main className="flex-1 min-w-0 w-full">
            {/* The views index into these collections directly, so hold them
                back until the first poll resolves rather than rendering an
                empty shell that reads as "no problems found". */}
            {telemetryLoading && (
              <div className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs text-neutral-400">
                Loading telemetry from AgentPulse...
              </div>
            )}

            {!telemetryLoading && telemetryError && (
              <div className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs space-y-2">
                <p className="text-rose-300">Cannot reach AgentPulse.</p>
                <p className="text-neutral-400">{telemetryError}</p>
                <button
                  onClick={refreshTelemetry}
                  className="mt-3 px-4 py-2 rounded-xl bg-white/10 text-neutral-100 hover:bg-white/20"
                >
                  Retry
                </button>
              </div>
            )}

            {!telemetryLoading && !telemetryError && agents.length === 0 && traces.length === 0 && (
              <div className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs text-neutral-400">
                Connected, but this instance has no telemetry yet. Send spans through the SDK
                or run a scenario in the Telemetry Lab.
              </div>
            )}

            {!telemetryLoading && !telemetryError && (agents.length > 0 || traces.length > 0) && (
            <>
            {productTab === 'overview' && (
              <OverviewView
                agents={agents}
                traces={traces}
                incidents={incidents}
                driftProfiles={driftProfiles}
                onSelectAgent={(agent) => {
                  setSelectedAgent(agent);
                  setProductTab('agents');
                  setIsContextPanelOpen(true);
                }}
                onSelectTrace={(trace) => {
                  setSelectedTrace(trace);
                  setProductTab('traces');
                  setIsContextPanelOpen(true);
                }}
                onSelectIncident={(incident) => {
                  setSelectedIncident(incident);
                  setProductTab('incidents');
                  setIsContextPanelOpen(true);
                }}
                onNavigateTab={(tab) => setProductTab(tab)}
              />
            )}

            {productTab === 'agents' && (
              <AgentsView
                agents={agents}
                selectedAgent={selectedAgent}
                onSelectAgent={(agent) => {
                  setSelectedAgent(agent);
                  setIsContextPanelOpen(true);
                }}
                onNavigateToTraces={(agentId) => {
                  const targetAgent = agents.find(a => a.id === agentId);
                  setSelectedAgent(targetAgent);
                  setProductTab('traces');
                  setIsContextPanelOpen(true);
                }}
                onNavigateToDrift={(agentId) => {
                  const targetAgent = agents.find(a => a.id === agentId);
                  setSelectedAgent(targetAgent);
                  setProductTab('drift');
                  setIsContextPanelOpen(true);
                }}
              />
            )}

            {productTab === 'traces' && (
              <TracesView
                traces={traces}
                selectedTrace={selectedTrace}
                selectedSpan={selectedSpan}
                onSelectTrace={(trace) => {
                  setSelectedTrace(trace);
                  setIsContextPanelOpen(true);
                }}
                onSelectSpan={(span) => {
                  setSelectedSpan(span);
                  setIsContextPanelOpen(true);
                }}
                onCurateToDataset={handleCurateToDataset}
                filterAgentId={selectedAgent?.id}
                onOpenShortcutsModal={() => setIsShortcutsHelpOpen(true)}
              />
            )}

            {productTab === 'incidents' && (
              <IncidentsView
                incidents={incidents}
                selectedIncident={selectedIncident}
                onSelectIncident={(incident) => {
                  setSelectedIncident(incident);
                  setIsContextPanelOpen(true);
                }}
                onNavigateToTrace={(traceId) => {
                  const foundTrace = traces.find(t => t.id === traceId);
                  if (foundTrace) setSelectedTrace(foundTrace);
                  setProductTab('traces');
                  setIsContextPanelOpen(true);
                }}
                onNavigateToAgent={(agentId) => {
                  const foundAgent = agents.find(a => a.id === agentId);
                  if (foundAgent) setSelectedAgent(foundAgent);
                  setProductTab('agents');
                  setIsContextPanelOpen(true);
                }}
                onResolveIncident={handleResolveIncident}
              />
            )}

            {productTab === 'drift' && (
              <DriftView
                driftProfiles={driftProfiles}
                agents={agents}
                selectedAgentId={selectedAgent?.id}
                onNavigateToTrace={(traceId) => {
                  const foundTrace = traces.find(t => t.id === traceId);
                  if (foundTrace) setSelectedTrace(foundTrace);
                  setProductTab('traces');
                  setIsContextPanelOpen(true);
                }}
              />
            )}

            {productTab === 'replay' && (
              <ReplayView
                traces={traces}
                selectedTrace={selectedTrace}
                onSelectTrace={(trace) => {
                  setSelectedTrace(trace);
                  setIsContextPanelOpen(true);
                }}
              />
            )}

            {productTab === 'experiments' && (
              <ExperimentsView
                experiments={experiments}
                datasets={datasets}
              />
            )}

            {productTab === 'datasets' && (
              <DatasetsView
                datasets={datasets}
                onNavigateToExperiments={() => setProductTab('experiments')}
              />
            )}

            {productTab === 'telemetry-lab' && (
              <TelemetryLabView onRunScenario={handleRunScenario} />
            )}

            {productTab === 'performance' && (
              <PerformanceView />
            )}

            {productTab === 'settings' && (
              <SettingsView
                isCalmMode={isCalmMode}
                onToggleCalmMode={() => setIsCalmMode(prev => !prev)}
                currentUser={currentUser}
                activeProject={activeProject}
                onOpenProjectSelector={() => setIsProjectSelectorOpen(true)}
                onOpenAuth={() => setIsAuthModalOpen(true)}
              />
            )}

            {productTab === 'rag-monitor' && (
              <div className="w-full space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 phosphor-cyan animate-pulse" />
                      <h2 className="text-base font-bold text-white uppercase tracking-tight font-mono">
                        RAG Live Multi-Agent Monitor & Drift Verification
                      </h2>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono font-semibold">
                        LIVE STREAM
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 font-mono mt-0.5">
                      Sequential multi-agent chat execution, asynchronous NLI grounding entailment, and 32-span sliding window drift.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setMode('rag')}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 transition-all text-xs font-mono font-semibold flex items-center space-x-1.5 shadow-sm"
                      title="Switch to Fullscreen Dedicated Split-Screen Monitor"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Full-Screen View</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-[#06070a] h-[740px] max-h-[82vh]">
                  <RagChatbotApp
                    embedded={true}
                    onOpenConsole={() => setProductTab('overview')}
                    onSelectTab={(t) => setProductTab(t)}
                    onToggleFullscreen={() => setMode('rag')}
                    palette={palette}
                    isCalmMode={isCalmMode}
                    chalkSurface={chalkSurface}
                  />
                </div>
              </div>
            )}
            </>
            )}
          </main>

          {productTab !== 'rag-monitor' && (
            <ActiveContextPanel
              currentTab={productTab}
              onSelectTab={setProductTab}
              selectedAgent={selectedAgent}
              selectedTrace={selectedTrace}
              selectedSpan={selectedSpan}
              selectedIncident={selectedIncident}
              onClearSelection={handleClearSelection}
              onSelectAgent={setSelectedAgent}
              onSelectTrace={setSelectedTrace}
              onSelectSpan={setSelectedSpan}
              onCurateToDataset={handleCurateToDataset}
              isOpen={isContextPanelOpen}
              onToggleOpen={() => setIsContextPanelOpen(prev => !prev)}
              isPinned={isContextPanelPinned}
              onTogglePin={() => setIsContextPanelPinned(prev => !prev)}
            />
          )}
        </div>

      <FloatingDock
        currentTab={productTab}
        onSelectTab={setProductTab}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsHelpOpen(true)}
        incidentCount={incidents.length}
        driftWarningCount={agents.filter(a => a.driftStatus !== 'normal').length}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={setProductTab}
        onSelectAgent={(agent) => {
          setSelectedAgent(agent);
          setProductTab('agents');
        }}
        onSelectTrace={(trace) => {
          setSelectedTrace(trace);
          setProductTab('traces');
        }}
        onSelectIncident={(incident) => {
          setSelectedIncident(incident);
          setProductTab('incidents');
        }}
        agents={agents}
        traces={traces}
        incidents={incidents}
        onSwitchToPublic={() => setMode('public')}
      />

      <ShortcutsHelpModal
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
      />

      <ProjectSelectorModal
        isOpen={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        currentUser={currentUser}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={(proj) => {
          setActiveProject(proj);
          setIsProjectSelectorOpen(false);
        }}
        onOpenAuth={() => {
          setIsProjectSelectorOpen(false);
          setIsAuthModalOpen(true);
        }}
      />
      </div>
    </div>
  );
}
