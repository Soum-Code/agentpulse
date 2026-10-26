import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  DesignMode,
  ProductTab,
  Agent,
  Trace,
  Span,
  Incident,
  TelemetryProject,
} from './types';
import { useTelemetry } from './lib/useTelemetry';
import { useAppTheme } from './lib/useAppTheme';
import { summarizeDrift, breakDownIncidents } from './lib/overviewStats';
import { api } from './lib/api';
import { CHORD_WINDOW_MS } from './utils/keyboard';
import { loadFullTrace } from './lib/traceDetail';
import { datumFromFeed } from './lib/stateModel';

import { PublicExperience } from './components/public/PublicExperience';
import { LiquidBackgroundCanvas } from './components/public/LiquidBackgroundCanvas';

import { ProductHeader } from './components/product/ProductHeader';
import { FloatingDock } from './components/product/FloatingDock';
import { CommandPalette } from './components/product/CommandPalette';
import { FeedStatusPanel } from './components/product/FeedStatusPanel';
import { ViewErrorBoundary } from './components/product/ViewErrorBoundary';
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
import { AnimeTabTransitionContainer } from './components/product/AnimeTabTransitionContainer';
import { initLiquidCardSpringListener, triggerCardEntranceAnimation } from './utils/liquidHoverAnime';
import { initChalkMoteProximityListener } from './utils/chalkMoteProximity';
import { AuthModal } from './components/product/AuthModal';
import { ProjectSelectorModal } from './components/product/ProjectSelectorModal';
import { RagChatbotApp } from './components/rag/RagChatbotApp';
import { auth, onAuthStateChanged, subscribeToUserProjects } from './lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

/** A short message shown in the corner after a keyboard action (acknowledge an incident). */
interface Toast {
  title: string;
  isWarning?: boolean;
}

export default function App() {
  // 'public' is the marketing page, 'product' is the console.
  // 'rag' is the fullscreen dedicated RAG monitor & drift verification split-screen.
  const [mode, setMode] = useState<DesignMode>('public');
  const [productTab, setProductTab] = useState<ProductTab>('overview');

  // Palette, surface presets, Calm mode and text density (remembered in localStorage).
  const theme = useAppTheme();
  const { palette, isCalmMode, chalkSurface, textDensity } = theme;
  const activePreset =
    palette === 'dark' ? theme.darkPreset : palette === 'butter' ? theme.butterPreset : chalkSurface;

  // Context-Preserving selection states (The Most Important UX Pattern: Agent A ↳ Trace 483 ↳ Span 7)
  const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>(undefined);
  const [selectedTrace, setSelectedTrace] = useState<Trace | undefined>(undefined);
  const [selectedSpan, setSelectedSpan] = useState<Span | undefined>(undefined);
  const [selectedIncident, setSelectedIncident] = useState<Incident | undefined>(undefined);

  // Only the newest traces arrive with their spans (useTelemetry). Selecting an older one picks up a
  // list entry with no spans, scores or alerts, so load its detail and swap it in.
  useEffect(() => {
    if (!selectedTrace || selectedTrace.alerts !== undefined) return;
    let cancelled = false;
    loadFullTrace(selectedTrace)
      .then((full) => {
        if (!cancelled) setSelectedTrace((current) => (current?.id === full.id ? full : current));
      })
      .catch((err) => console.warn(`Could not load trace ${selectedTrace.id}:`, err));
    return () => {
      cancelled = true;
    };
  }, [selectedTrace]);

  // Active Context Side-Panel open & pinned states
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [isContextPanelPinned, setIsContextPanelPinned] = useState(true);

  // The header's live toggle. On = the console re-reads the API every 10 s; off = it stops until
  // the toggle is switched back (or Retry is pressed). It does not generate any data.
  const [isLive, setIsLive] = useState(true);

  // Core telemetry, polled from the running AgentPulse instance.
  const {
    agents,
    traces,
    incidents,
    driftProfiles,
    datasets,
    experiments,
    feed,
    refresh: refreshTelemetry,
  } = useTelemetry(!isLive);

  // Sign-in and project selection.
  //
  // Firebase handles identity; the AgentPulse backend does not know about users
  // and is not being asked to. What it does know about is keys: creating a
  // project calls POST /v1/keys with the Firebase uid as its owner, and the key
  // that comes back is one the API will actually accept. The key is shown once
  // and never stored (see lib/firebase.ts).
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [projects, setProjects] = useState<TelemetryProject[]>([]);
  const [activeProject, setActiveProject] = useState<TelemetryProject | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);

  // Pointer-driven card spring and chalk-dust dispersion. Both attach one
  // document-level listener and return their own teardown.
  useEffect(() => {
    const cleanupLiquid = initLiquidCardSpringListener();
    const cleanupChalkMotes = initChalkMoteProximityListener();
    return () => {
      cleanupLiquid();
      cleanupChalkMotes();
    };
  }, []);

  // Cards of the new view slide in one after another when the tab (or mode) changes.
  useEffect(() => {
    const timer = setTimeout(() => triggerCardEntranceAnimation(null, true), 45);
    return () => clearTimeout(timer);
  }, [productTab, mode]);

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
  const [toast, setToast] = useState<Toast | null>(null);

  // Show a toast for a few seconds; a newer toast replaces an older one and restarts the timer.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (next: Toast, ms = 3200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // The keyboard listener is attached once per modal state, so it reads the selected incident
  // through a ref instead of re-attaching on every selection.
  const selectedIncidentRef = useRef(selectedIncident);
  selectedIncidentRef.current = selectedIncident;
  const acknowledgeRef = useRef<(id: string) => void>(() => {});

  // Global Keyboard shortcut listener (Cmd+K, Cmd+Shift+R, ?, chord navigation 'g' + key)
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

      // Cmd+Shift+R / Ctrl+Shift+R: acknowledge the incident that is selected (never a guessed one:
      // this is a write to the alerts API). Only in the console and not while typing: on the landing
      // page, in the chat and in a text field the chord must stay the browser's hard reload, which a
      // viewer needs after a redeploy to get past a cached bundle.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        if (mode !== 'product' || isInputActive) return;
        e.preventDefault();
        const target = selectedIncidentRef.current;
        if (target) {
          acknowledgeRef.current(target.id);
        } else {
          showToast({ title: 'No incident selected. Select one in Overview or Incidents first.', isWarning: true }, 3000);
        }
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
        }, CHORD_WINDOW_MS);
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
        } else if (k === 'z') {
          e.preventDefault();
          theme.onToggleCalmMode?.(); // undefined outside the Dark palette: Calm mode is not offered there
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(chordTimer);
    };
  }, [mode, isShortcutsHelpOpen, isCommandPaletteOpen, theme.onToggleCalmMode]);

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

  // Handler: read back what the worker has stored for a Lab run. Does not catch either; the
  // Lab shows an unreachable API as an error.
  const handleReadScenario = (traceId: string) => api.getScenarioResult(traceId);

  // Handler: acknowledge an incident against the alerts API (PATCH /v1/alerts/{id}). The toast
  // reports what the API said, not what was hoped for.
  const handleResolveIncident = async (incidentId: string) => {
    const title = incidents.find((i) => i.id === incidentId)?.title ?? `alert ${incidentId}`;
    try {
      await api.acknowledgeAlert(Number(incidentId));
      setSelectedIncident((curr) => (curr?.id === incidentId ? undefined : curr));
      showToast({ title: `Acknowledged: ${title}` });
      refreshTelemetry();
    } catch (err) {
      console.warn('Acknowledge failed:', err);
      showToast({ title: `Could not acknowledge: ${err instanceof Error ? err.message : title}`, isWarning: true }, 4500);
    }
  };
  acknowledgeRef.current = handleResolveIncident;

  // Views that read the agent/trace lists show the "no telemetry yet" notice on an empty instance.
  // The others do not depend on them: the Telemetry Lab is how an empty instance gets its first
  // telemetry, and APM, Settings and the RAG monitor have their own sources.
  const hasTelemetry = agents.length > 0 || traces.length > 0;
  const needsTelemetry = !['telemetry-lab', 'performance', 'settings', 'rag-monitor'].includes(productTab);

  const handleClearSelection = () => {
    setSelectedAgent(undefined);
    setSelectedTrace(undefined);
    setSelectedSpan(undefined);
    setSelectedIncident(undefined);
  };

  // The dock badges are counts of real alerts and drifting agents. They are read through the
  // feed: while it is pending or down the badge is hidden instead of showing a made-up 0.
  const incidentBadge = datumFromFeed(feed, () => breakDownIncidents(incidents).active, 'no alerts feed');
  const driftBadge = datumFromFeed(feed, () => summarizeDrift(agents).drifting, 'no drift feed');

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

  return (
    <div
      data-density={textDensity}
      data-palette={palette}
      data-palette-preset={activePreset}
      data-chalk-surface={palette === 'chalk' ? chalkSurface : undefined}
      className={`min-h-screen ${
        palette === 'butter'
          ? 'palette-butter bg-[var(--butter-surface-bg,#faf5e6)] text-neutral-950 selection:bg-amber-300 selection:text-black'
          : palette === 'chalk'
          ? 'palette-chalk bg-[var(--chalk-surface-bg,#f6f8fb)] text-neutral-900 selection:bg-neutral-300 selection:text-black'
          : 'palette-dark bg-[var(--dark-surface-bg,#06070a)] text-[#F5F5F7] selection:bg-neutral-800 selection:text-white'
      } flex flex-col relative overflow-x-hidden transition-colors duration-200 ${
        isCalmMode ? 'calm-mode-zen' : ''
      } ${textDensity === 'compact' ? 'density-compact' : 'density-comfortable'}`}
    >
      {/* Interactive liquid background that follows the palette and preset */}
      <LiquidBackgroundCanvas
        palette={palette}
        darkPreset={theme.darkPreset}
        darkCustomColor={theme.darkCustomColor}
        butterPreset={theme.butterPreset}
        butterCustomColor={theme.butterCustomColor}
        chalkSurface={chalkSurface}
        chalkCustomColor={theme.chalkCustomColor}
        className="fixed inset-0 pointer-events-none opacity-45 z-0"
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        <ProductHeader
          {...theme}
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
          isSimulatingLive={isLive}
          feedStatus={feed.status}
          onToggleLive={() => setIsLive(prev => !prev)}
          onOpenShortcutsModal={() => setIsShortcutsHelpOpen(true)}
          isContextPanelOpen={isContextPanelOpen}
          onToggleContextPanel={() => setIsContextPanelOpen(prev => !prev)}
        />

        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 flex flex-col lg:flex-row gap-6 items-start">
          <main className="flex-1 min-w-0 w-full">
            {/* The views index into these collections directly, so hold them back until the
                first poll resolves rather than rendering an empty shell that reads as "no
                problems found". */}
            <FeedStatusPanel feed={feed} onRetry={refreshTelemetry} />

            {feed.status === 'ready' && !hasTelemetry && needsTelemetry && (
              <div className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs text-neutral-400">
                Connected, but this instance has no telemetry yet. Send spans through the SDK
                or run a scenario in the Telemetry Lab.
              </div>
            )}

            {feed.status === 'ready' && (hasTelemetry || !needsTelemetry) && (
            <ViewErrorBoundary key={productTab} viewName={productTab.replace('-', ' ')}>
            <AnimeTabTransitionContainer activeTab={productTab}>
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
              <TelemetryLabView onRunScenario={handleRunScenario} onReadResult={handleReadScenario} />
            )}

            {productTab === 'performance' && (
              <PerformanceView />
            )}

            {productTab === 'settings' && (
              <SettingsView
                isCalmMode={isCalmMode}
                onToggleCalmMode={theme.onToggleCalmMode}
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
            </AnimeTabTransitionContainer>
            </ViewErrorBoundary>
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
              onResolveIncident={handleResolveIncident}
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
        incidentCount={incidentBadge.status === 'measured' ? incidentBadge.value : 0}
        driftWarningCount={driftBadge.status === 'measured' ? driftBadge.value : 0}
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
        selectedIncident={selectedIncident}
        onResolveIncident={handleResolveIncident}
        agents={agents}
        traces={traces}
        incidents={incidents}
        onSwitchToPublic={() => setMode('public')}
        isCalmMode={isCalmMode}
        onToggleCalmMode={theme.onToggleCalmMode}
        textDensity={textDensity}
        onChangeTextDensity={theme.onChangeTextDensity}
        palette={palette}
        onSelectPalette={theme.onSelectPalette}
      />

      <ShortcutsHelpModal
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
      />

      {/* Corner feedback after an incident is acknowledged (button, palette or Cmd+Shift+R) */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200" role="status">
          <div className={`px-4 py-2.5 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center space-x-3 font-mono text-xs ${
            toast.isWarning
              ? 'bg-amber-950/85 border-amber-500/40 text-amber-200'
              : 'bg-[#0a1f18]/90 border-emerald-500/50 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
          }`}>
            {toast.isWarning ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-white flex items-center space-x-2">
                <span>{toast.isWarning ? 'Notice' : 'Incident acknowledged'}</span>
                <kbd className="px-1.5 py-0.5 text-[9px] rounded bg-white/10 text-white/90 border border-white/20">⌘⇧R</kbd>
              </div>
              <div className="text-[11px] opacity-90 truncate max-w-sm mt-0.5">{toast.title}</div>
            </div>
          </div>
        </div>
      )}

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
