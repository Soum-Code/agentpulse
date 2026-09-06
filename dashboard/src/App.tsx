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
  Experiment
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
import { SettingsView } from './components/product/SettingsView';
import { ShortcutsHelpModal } from './components/product/ShortcutsHelpModal';
import { ActiveContextPanel } from './components/product/ActiveContextPanel';

export default function App() {
  // 'public' is the marketing page, 'product' is the console.
  const [mode, setMode] = useState<DesignMode>('public');

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
  const handleInjectSyntheticTrace = async (scenario: string, query?: string) => {
    try {
      await api.simulatePipeline(scenario, query ?? 'Telemetry Lab run');
      refreshTelemetry();
    } catch (err) {
      console.warn('Simulation failed:', err);
    }
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
    <div className="min-h-screen bg-[#06070a] text-[#F5F5F7] selection:bg-neutral-800 selection:text-white flex flex-col relative overflow-x-hidden">
      <LiquidBackgroundCanvas palette="dark" className="fixed inset-0 pointer-events-none opacity-45 z-0" />

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
          onSwitchToPublic={() => setMode('public')}
          isSimulatingLive={isSimulatingLive}
          onToggleLive={() => setIsSimulatingLive(prev => !prev)}
          onOpenShortcutsModal={() => setIsShortcutsHelpOpen(true)}
          isContextPanelOpen={isContextPanelOpen}
          onToggleContextPanel={() => setIsContextPanelOpen(prev => !prev)}
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
              <TelemetryLabView
                agents={agents}
                onInjectSyntheticTrace={handleInjectSyntheticTrace}
              />
            )}

            {productTab === 'settings' && (
              <SettingsView />
            )}
            </>
            )}
          </main>

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
      </div>
    </div>
  );
}
