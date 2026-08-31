import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Database,
  FlaskConical,
  HelpCircle,
  Layers,
  LayoutGrid,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Route,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import {
  Agent,
  AgentPulseConnection,
  AlertItem,
  ApiClient,
  ApiReadiness,
  EvaluatorReadiness,
  Metrics,
  PlatformHealth,
  SpanDetail,
  TraceListItem,
} from '../lib/api';
import { NavigationDock, NavTabId } from '../components/NavigationDock';
import { OverviewView } from './command/OverviewView';
import { TracesWorkspaceView } from './command/TracesWorkspaceView';
import { IncidentsControlView } from './command/IncidentsControlView';
import { DriftMatrixView } from './command/DriftMatrixView';
import { LabPlaygroundView } from './command/LabPlaygroundView';
import { DatasetsExperimentsView } from './command/DatasetsExperimentsView';
import { AgentDiagnosticsDrawer } from './command/AgentDiagnosticsDrawer';

export type TelemetryState = 'idle' | 'loading' | 'ready' | 'error';

interface CommandSurfaceProps {
  metrics: Metrics | null;
  agents: Agent[];
  alerts: AlertItem[];
  platform: PlatformHealth | null;
  client: ApiClient;
  telemetryState: TelemetryState;
  telemetryError: string | null;
  hoveredAgentId: string | null;
  selectedAgentId: string | null;
  isWsConnected: boolean;
  onHoverAgent: (agentId: string | null) => void;
  onSelectAgent: (agentId: string | null) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

export function CommandSurface({
  metrics,
  agents,
  alerts,
  platform,
  client,
  telemetryState,
  telemetryError,
  hoveredAgentId,
  selectedAgentId,
  isWsConnected,
  onHoverAgent,
  onSelectAgent,
  onRefresh,
  onDisconnect,
}: CommandSurfaceProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Command Palette (Cmd+K / Ctrl+K)
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  // Overview Search & Filters
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [agentSortKey, setAgentSortKey] = useState<'asi' | 'spans' | 'error' | 'latency'>('asi');

  // Traces Workspace State
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedTraceData, setSelectedTraceData] = useState<{
    trace: TraceListItem;
    spans: SpanDetail[];
    alerts: AlertItem[];
  } | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  // Health Readiness State
  const [apiReadiness, setApiReadiness] = useState<ApiReadiness | null>(null);
  const [evaluatorReadiness, setEvaluatorReadiness] = useState<EvaluatorReadiness | null>(null);
  const [driftOverview, setDriftOverview] = useState<{
    agents: {
      agent_id: string;
      current_asi: number | null;
      latest_centroid_distance: number | null;
      latest_window_centroid_distance?: number | null;
      latest_tool_drift?: number | null;
      baseline_size?: number;
    }[];
  } | null>(null);

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Risk over time, read off the traces the API actually returned. Most traces
  // carry no score until an evaluator has processed them, so this series is
  // short whenever coverage is thin; the Overview shows an empty state rather
  // than padding it out.
  const riskWaveformData = useMemo(() => {
    const scored: number[] = [];
    for (const trace of traces) {
      if (trace.overall_risk_score !== null && trace.overall_risk_score !== undefined) {
        scored.push(trace.overall_risk_score);
      }
    }
    // getTraces returns newest first; the chart reads left-to-right in time.
    return scored.reverse();
  }, [traces]);

  // ─── Load Traces ───────────────────────────────────────────────────
  const loadTraces = useCallback(async () => {
    try {
      setTraceLoading(true);
      const res = await client.getTraces(50, 0);
      setTraces(res.traces || []);
      if (res.traces.length > 0 && !selectedTraceId) {
        setSelectedTraceId(res.traces[0].trace_id);
      }
    } catch (e) {
      console.warn('Failed to load traces:', e);
    } finally {
      setTraceLoading(false);
    }
  }, [client, selectedTraceId]);

  // ─── Fetch Selected Trace Detail ───────────────────────────────────
  useEffect(() => {
    if (!selectedTraceId) {
      setSelectedTraceData(null);
      setSelectedSpanId(null);
      return;
    }

    let isMounted = true;
    void client
      .getTrace(selectedTraceId)
      .then((res) => {
        if (!isMounted) return;
        setSelectedTraceData(res);
        if (res.spans.length > 0) {
          setSelectedSpanId(res.spans[0].span_id);
        }
      })
      .catch((err) => {
        console.warn('Trace load error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTraceId, client]);

  // ─── Fetch Health Readiness & Drift ────────────────────────────────
  const refreshAuxiliary = useCallback(() => {
    void client.getReadiness().then(setApiReadiness).catch(() => setApiReadiness(null));
    void client.getEvaluatorReadiness().then(setEvaluatorReadiness).catch(() => setEvaluatorReadiness(null));
    void client.getDrift().then(setDriftOverview).catch(() => setDriftOverview(null));
    void loadTraces();
  }, [client, loadTraces]);

  useEffect(() => {
    refreshAuxiliary();
    const interval = window.setInterval(() => {
      refreshAuxiliary();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [refreshAuxiliary]);

  // ─── Global Keyboard Shortcuts (Cmd+K / Ctrl+K) ───────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsCommandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openIncidentsCount = alerts.filter((a) => !a.acknowledged).length;
  const activeAgent = agents.find((a) => a.agent_id === selectedAgentId);

  return (
    <div className="relative min-h-screen bg-void text-ink font-sans flex flex-col selection:bg-signal/30 selection:text-white ai-grid-bg">
      {/* ── Top Fixed Navigation Bar ── */}
      <header className="sticky top-0 z-30 w-full glass-header px-4 lg:px-8 py-3 flex items-center justify-between border-b-2 border-black shadow-comic">
        {/* Brand & Mode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-yellow-400 border-2 border-black flex items-center justify-center font-black text-sm text-black shadow-[2px_2px_0px_#000]">
              AP
            </div>
            <div>
              <span className="text-base font-black tracking-tight text-white block font-mono">
                Agent<span className="text-yellow-400">Pulse</span>
              </span>
              <span className="text-3xs font-mono text-neutral-400 font-bold uppercase tracking-wider block">
                Observability Command Deck
              </span>
            </div>
          </div>

          <span className="hidden sm:inline-block w-px h-5 bg-white/20 mx-2" />

          {/* WebSocket Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-surface-2 border-2 border-black text-3xs font-mono font-bold shadow-[2px_2px_0px_#000]">
            <span
              className={`stream-dot ${
                isWsConnected ? 'stream-live' : 'stream-warning'
              }`}
            />
            <span className="text-neutral-300">
              {isWsConnected ? 'STREAM ACTIVE' : 'STREAM CONNECTING'}
            </span>
          </div>
        </div>

        {/* Center/Right Actions */}
        <div className="flex items-center gap-3">
          {/* Command Palette Trigger Button */}
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border-2 border-black text-xs font-mono font-bold text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-yellow-400" />
            <span>Search agents, traces...</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-black border border-white/20 text-3xs text-yellow-400 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => {
              onRefresh();
              refreshAuxiliary();
              showToast('Refreshed swarm telemetry.');
            }}
            className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 border-2 border-black text-neutral-300 hover:text-yellow-400 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            title="Refresh All Telemetry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Disconnect Action */}
          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface-2 hover:bg-rose-950 border-2 border-black text-neutral-300 hover:text-rose-400 text-xs font-mono font-bold shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            title="Disconnect & Switch Instance"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </header>

      {/* ── Main View Container ── */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewView
            metrics={metrics}
            agents={agents}
            alerts={alerts}
            platform={platform}
            apiReadiness={apiReadiness}
            evaluatorReadiness={evaluatorReadiness}
            riskWaveformData={riskWaveformData}
            recentTraces={traces}
            agentSearchQuery={agentSearchQuery}
            onAgentSearchChange={setAgentSearchQuery}
            agentSortKey={agentSortKey}
            onAgentSortChange={setAgentSortKey}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
            onSelectTrace={(traceId) => {
              setSelectedTraceId(traceId);
              setActiveTab('traces');
            }}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onRefresh={() => {
              onRefresh();
              refreshAuxiliary();
            }}
          />
        )}

        {activeTab === 'traces' && (
          <TracesWorkspaceView
            traces={traces}
            traceLoading={traceLoading}
            selectedTraceId={selectedTraceId}
            selectedTraceData={selectedTraceData}
            selectedSpanId={selectedSpanId}
            onSelectTrace={setSelectedTraceId}
            onSelectSpan={setSelectedSpanId}
            onRefreshTraces={loadTraces}
            client={client}
            showToast={showToast}
          />
        )}

        {activeTab === 'incidents' && (
          <IncidentsControlView
            alerts={alerts}
            client={client}
            onSelectTrace={(traceId) => {
              setSelectedTraceId(traceId);
              setActiveTab('traces');
            }}
            onNavigateTab={(tab) => setActiveTab(tab)}
            showToast={showToast}
          />
        )}

        {activeTab === 'drift' && (
          <DriftMatrixView
            agents={agents}
            driftOverview={driftOverview}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
            onRefresh={refreshAuxiliary}
          />
        )}

        {activeTab === 'lab' && (
          <LabPlaygroundView
            client={client}
            onSelectTrace={(traceId) => {
              setSelectedTraceId(traceId);
              setActiveTab('traces');
            }}
            onNavigateTab={(tab) => setActiveTab(tab)}
            showToast={showToast}
          />
        )}

        {activeTab === 'datasets' && (
          <DatasetsExperimentsView client={client} showToast={showToast} />
        )}
      </main>

      {/* ── Slide-Over Agent Diagnostics Drawer ── */}
      {selectedAgentId && (
        <AgentDiagnosticsDrawer
          agentId={selectedAgentId}
          agent={activeAgent}
          client={client}
          onClose={() => onSelectAgent(null)}
          onFilterTracesByAgent={(agentId) => {
            setActiveTab('traces');
            onSelectAgent(null);
          }}
        />
      )}

      {/* ── Floating Navigation Dock ── */}
      <NavigationDock
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        openIncidentsCount={openIncidentsCount}
      />

      {/* ── Toast Notification Banner (Comic Speech Bubble) ── */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-yellow-400 border-2 border-black text-black font-mono text-xs font-black shadow-comic-lg animate-pop flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-black shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Command Palette Modal (Cmd+K / Ctrl+K) ── */}
      {isCommandOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4"
          onClick={() => setIsCommandOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl bg-surface-2 border-2 border-black p-5 space-y-4 shadow-comic-xl animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-2 border-b-2 border-black pb-3">
              <Search className="w-4 h-4 text-yellow-400" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Jump to Agent, Trace, or Workspace..."
                className="w-full bg-transparent text-sm font-mono text-white placeholder-neutral-500 focus:outline-none font-bold"
              />
              <kbd className="text-3xs font-mono text-black font-black px-2 py-0.5 rounded-md bg-yellow-400 border border-black shadow-[1px_1px_0px_#000]">
                ESC
              </kbd>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <p className="text-3xs font-mono uppercase text-neutral-400 font-bold px-2 py-1">Quick Navigation</p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  setIsCommandOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-yellow-400 hover:text-black border border-transparent hover:border-black text-left text-neutral-200 font-bold transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <LayoutGrid className="w-4 h-4 text-yellow-400 group-hover:text-black" />
                  <span>Overview & Vitality Hub</span>
                </div>
                <span className="text-3xs px-2 py-0.5 rounded bg-black text-white border border-white/20">Tab 1</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('traces');
                  setIsCommandOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-cyan-400 hover:text-black border border-transparent hover:border-black text-left text-neutral-200 font-bold transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Route className="w-4 h-4 text-cyan-400" />
                  <span>Trace Waterfall & Inspector</span>
                </div>
                <span className="text-3xs px-2 py-0.5 rounded bg-black text-white border border-white/20">Tab 2</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('incidents');
                  setIsCommandOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-pink-500 hover:text-white border border-transparent hover:border-black text-left text-neutral-200 font-bold transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-pink-500" />
                  <span>Incident Control Center</span>
                </div>
                <span className="text-3xs px-2 py-0.5 rounded bg-black text-white border border-white/20">Tab 3</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('drift');
                  setIsCommandOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-orange-500 hover:text-white border border-transparent hover:border-black text-left text-neutral-200 font-bold transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-orange-400" />
                  <span>Drift & Stability Matrix</span>
                </div>
                <span className="text-3xs px-2 py-0.5 rounded bg-black text-white border border-white/20">Tab 4</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('lab');
                  setIsCommandOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-purple-400 hover:text-black border border-transparent hover:border-black text-left text-neutral-200 font-bold transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span>Telemetry Simulation Lab</span>
                </div>
                <span className="text-3xs px-2 py-0.5 rounded bg-black text-white border border-white/20">Tab 5</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
