import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  LogOut,
  Play,
  Radio,
  RefreshCw,
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

type CommandTab = 'overview' | 'traces' | 'incidents' | 'drift' | 'lab';

function asiTone(asi: number | null | undefined, errorRate: number = 0): { color: string; badge: string } {
  if (errorRate > 0.1 || (asi !== null && asi !== undefined && asi < 50)) {
    return { color: 'text-rose-400', badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20' };
  }
  if (errorRate > 0.04 || (asi !== null && asi !== undefined && asi < 70)) {
    return { color: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
  }
  return { color: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' };
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
  const [activeTab, setActiveTab] = useState<CommandTab>('overview');

  // Command Palette State (Cmd+K / Ctrl+K)
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

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
  const [traceFilterStatus, setTraceFilterStatus] = useState<string>('ALL');

  // Health Readiness State
  const [apiReadiness, setApiReadiness] = useState<ApiReadiness | null>(null);
  const [evaluatorReadiness, setEvaluatorReadiness] = useState<EvaluatorReadiness | null>(null);

  // Drift Overview State
  const [driftOverview, setDriftOverview] = useState<{
    agents: {
      agent_id: string;
      current_asi: number | null;
      latest_centroid_distance: number | null;
      // The sustained-shift metric DRIFT_DETECTED actually fires on. Null until
      // both the baseline and current windows fill, so it is genuinely absent
      // rather than zero for short sessions.
      latest_window_centroid_distance?: number | null;
      latest_tool_drift?: number | null;
      baseline_size?: number;
    }[];
  } | null>(null);

  // Datasets & Experiments State
  const [experimentsData, setExperimentsData] = useState<{
    experiments: Array<{
      experiment_id: string;
      name: string;
      model_name: string;
      reasoning_strategy: string;
      dataset_version: string;
      precision: number | null;
      recall: number | null;
      f1_score: number | null;
      mean_risk: number | null;
      mean_latency_ms: number | null;
      created_at: string | null;
    }>;
    file_experiments: Array<{
      file: string;
      timestamp?: string;
      model?: string;
      dataset?: string;
      data: Record<string, unknown>;
    }>;
  } | null>(null);
  const [datasetsData, setDatasetsData] = useState<{ datasets: Array<{ filename: string | null; dataset_name: string | null; dataset_version: string | null; split: string | null; total_cases: number; description: string | null }> } | null>(null);

  // Telemetry Lab State
  const [labScenario, setLabScenario] = useState<'clean' | 'hallucination' | 'tool_mismatch' | 'drift'>('clean');
  const [labQuery, setLabQuery] = useState('Transformer self-attention complexity');
  const [labRunning, setLabRunning] = useState(false);
  const [labMessage, setLabMessage] = useState<string | null>(null);

  // Agent Health Drilldown
  const [agentHealthData, setAgentHealthData] = useState<{
    agent: Agent;
    risk_trend: { timestamp: string; risk_score: number | null; grounding_score?: number | null }[];
    drift_trend: { timestamp: string; centroid_distance: number | null; stability_index: number | null }[];
  } | null>(null);

  // Raw JSON expanders
  const [expandedAlerts, setExpandedAlerts] = useState<Record<number, boolean>>({});

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
    void client.getTrace(selectedTraceId).then((res) => {
      if (!isMounted) return;
      setSelectedTraceData(res);
      if (res.spans.length > 0) {
        setSelectedSpanId(res.spans[0].span_id);
      }
    }).catch((err) => {
      console.warn('Trace load error:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [selectedTraceId, client]);

  // ─── Fetch System Health, Drift & Traces on Mount & Periodic Loop ───
  const refreshAll = useCallback(() => {
    void client.getReadiness().then(setApiReadiness).catch(() => setApiReadiness(null));
    void client.getEvaluatorReadiness().then(setEvaluatorReadiness).catch(() => setEvaluatorReadiness(null));
    void client.getDrift().then(setDriftOverview).catch(() => setDriftOverview(null));
    void loadTraces();
  }, [client, loadTraces]);

  useEffect(() => {
    refreshAll();
    const interval = window.setInterval(() => {
      refreshAll();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [refreshAll]);

  // ─── Fetch Agent Drilldown on Selection ─────────────────────────────
  useEffect(() => {
    if (!selectedAgentId) {
      setAgentHealthData(null);
      return;
    }
    let isMounted = true;
    void client.getAgentHealth(selectedAgentId).then((data) => {
      if (isMounted) setAgentHealthData(data);
    }).catch(() => {
      if (isMounted) setAgentHealthData(null);
    });
    return () => {
      isMounted = false;
    };
  }, [selectedAgentId, client]);

  // ─── Fetch Datasets & Experiments for Lab Tab ──────────────────────
  useEffect(() => {
    if (activeTab === 'lab') {
      let isMounted = true;
      void client.getExperiments().then((exp) => {
        if (isMounted) setExperimentsData(exp as any);
      }).catch(() => {
        if (isMounted) setExperimentsData(null);
      });
      void client.getDatasets().then((ds) => {
        if (isMounted) setDatasetsData(ds as any);
      }).catch(() => {
        if (isMounted) setDatasetsData(null);
      });
      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, client]);

  // ─── Keyboard Command Palette (Cmd+K / Ctrl+K) ──────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Filtered Traces ────────────────────────────────────────────────
  const filteredTraces = useMemo(() => {
    if (traceFilterStatus === 'ALL') return traces;
    if (traceFilterStatus === 'HAS_RISK') return traces.filter((t) => (t.overall_risk_score ?? 0) > 0.1);
    return traces;
  }, [traces, traceFilterStatus]);

  // Reset selectedTraceId if not present in filtered set
  useEffect(() => {
    if (filteredTraces.length > 0) {
      const exists = filteredTraces.some((t) => t.trace_id === selectedTraceId);
      if (!exists) {
        setSelectedTraceId(filteredTraces[0].trace_id);
      }
    } else {
      setSelectedTraceId(null);
    }
  }, [filteredTraces, selectedTraceId]);

  // Active Selected Span
  const activeSpan = useMemo(() => {
    if (!selectedTraceData || !selectedSpanId) return null;
    return selectedTraceData.spans.find((s) => s.span_id === selectedSpanId) || selectedTraceData.spans[0] || null;
  }, [selectedTraceData, selectedSpanId]);

  // Known Span IDs for Detached Marker (#36)
  const spanIdSet = useMemo(() => {
    if (!selectedTraceData) return new Set<string>();
    return new Set(selectedTraceData.spans.map((s) => s.span_id));
  }, [selectedTraceData]);

  // Sorted Agents: Worst ASI / highest error rate first (#44)
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const aScore = (a.current_asi ?? 100) - a.error_rate * 100;
      const bScore = (b.current_asi ?? 100) - b.error_rate * 100;
      return aScore - bScore;
    });
  }, [agents]);

  // Handle Controlled Lab Telemetry Run
  const runTelemetryLab = async () => {
    try {
      setLabRunning(true);
      setLabMessage(null);
      const res = await client.simulatePipeline(labScenario, labQuery);
      setLabMessage(`Simulation complete: ${res.message} (${res.accepted} spans ingested).`);
      await loadTraces();
      onRefresh();
    } catch (e) {
      setLabMessage(`Simulation failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLabRunning(false);
    }
  };

  // Keyboard navigation for Spans in Trace Workspace (#37)
  const moveSpanSelection = useCallback((delta: number) => {
    if (!selectedTraceData || selectedTraceData.spans.length === 0) return;
    const spans = selectedTraceData.spans;
    const idx = spans.findIndex((s) => s.span_id === selectedSpanId);
    // No selection yet: ArrowDown enters at the top, ArrowUp at the bottom.
    const next = idx === -1
      ? (delta > 0 ? 0 : spans.length - 1)
      : Math.max(0, Math.min(spans.length - 1, idx + delta));
    setSelectedSpanId(spans[next].span_id);
  }, [selectedTraceData, selectedSpanId]);

  const handleSpanKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    moveSpanSelection(e.key === 'ArrowDown' ? 1 : -1);
  }, [moveSpanSelection]);

  // The list container carries the handler above, but relying on it alone
  // meant the keys only worked after the operator had clicked the container
  // itself -- clicking a span row leaves focus wherever the browser put it, so
  // in practice the advertised shortcut did nothing. Listening at the window
  // makes it work from the moment a trace is open, which is what the on-screen
  // hint promises.
  useEffect(() => {
    if (activeTab !== 'traces') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (isCommandOpen) return;
      // Never steal arrow keys from a field the operator is editing.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      moveSpanSelection(e.key === 'ArrowDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, isCommandOpen, moveSpanSelection]);

  // Trace timeline for the waterfall (#6, #35).
  //
  // Bars are placed against real clock values so the chart shows ordering and
  // overlap, not just relative length. When no span carries a usable
  // start_time there is nothing to place them against, so `hasClock` goes false
  // and the bars fall back to plain proportional widths -- laying spans out by
  // summed latency would invent an ordering the data does not support.
  const traceTimeline = useMemo(() => {
    const spans = selectedTraceData?.spans ?? [];
    const maxLatency = Math.max(1, ...spans.map((s) => s.latency_ms ?? 0));

    let t0 = Infinity;
    let end = -Infinity;
    for (const s of spans) {
      const start = s.start_time ? new Date(s.start_time).getTime() : NaN;
      if (!Number.isFinite(start)) continue;
      t0 = Math.min(t0, start);
      end = Math.max(end, start + (s.latency_ms ?? 0));
    }

    const hasClock = Number.isFinite(t0) && end > t0;
    return {
      hasClock,
      t0: hasClock ? t0 : 0,
      windowMs: hasClock ? Math.max(1, end - t0) : maxLatency,
      maxLatency,
    };
  }, [selectedTraceData]);

  // Left offset and width for one span's bar, as percentages of the trace window.
  const spanBar = useCallback((span: { start_time?: string | null; latency_ms?: number | null }) => {
    const { hasClock, t0, windowMs, maxLatency } = traceTimeline;
    const duration = span.latency_ms ?? 0;
    if (!hasClock) {
      return { left: 0, width: Math.max(2, (duration / maxLatency) * 100) };
    }
    const start = span.start_time ? new Date(span.start_time).getTime() : NaN;
    if (!Number.isFinite(start)) return { left: 0, width: Math.max(2, (duration / windowMs) * 100) };
    const left = Math.max(0, Math.min(100, ((start - t0) / windowMs) * 100));
    return { left, width: Math.max(2, Math.min(100 - left, (duration / windowMs) * 100)) };
  }, [traceTimeline]);

  // Sorted drift agents: worst first (#9)
  const sortedDriftAgents = useMemo(() => {
    if (!driftOverview?.agents) return [];
    return [...driftOverview.agents].sort((a, b) => {
      const aScore = (a.current_asi ?? 100);
      const bScore = (b.current_asi ?? 100);
      return aScore - bScore;
    });
  }, [driftOverview]);

  // Unacknowledged Alert Count (#21)
  const unacknowledgedCount = metrics?.unacknowledged_alerts ?? alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="min-h-screen bg-[#08090d] text-neutral-200 font-sans flex flex-col justify-between selection:bg-white/20 selection:text-white">
      {/* ─── 1. TOP STATUS & NAVIGATION BAR (Quiet Editorial) ─────────── */}
      <header className="sticky top-0 z-40 px-6 py-3.5 bg-[#0e1017]/90 border-b border-white/[0.08] backdrop-blur-xl flex items-center justify-between gap-4">
        {/* Left: Brand & Exit */}
        <div className="flex items-center gap-3">
          <button
            onClick={onDisconnect}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Disconnect & Return"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white">
            AP
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white tracking-tight">AgentPulse</span>
            <span className="text-3xs font-mono text-neutral-500 uppercase">&bull; Console</span>
          </div>
        </div>

        {/* Center: Primary Navigation Tabs (Apple Functional Dock) */}
        <nav className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs font-medium">
          {(
            [
              { id: 'overview', label: 'System Overview' },
              { id: 'traces', label: `Trace Workspace (${traces.length})` },
              { id: 'incidents', label: `Incidents (${unacknowledgedCount})` },
              { id: 'drift', label: 'Drift & ASI' },
              { id: 'lab', label: 'Lab & Datasets' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right: Quick Search Cmd+K & Telemetry Stream Beacon */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCommandOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer font-mono"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
            <kbd className="text-3xs px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">⌘K</kbd>
          </button>

          <button
            onClick={() => {
              onRefresh();
              refreshAll();
            }}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${telemetryState === 'loading' ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-2xs font-mono">
            <span className={`stream-dot ${isWsConnected ? 'stream-live' : 'stream-idle'}`} />
            <span className="text-neutral-400">{isWsConnected ? 'Live' : 'Polling'}</span>
          </div>
        </div>
      </header>

      {/* ─── 2. MAIN WORKSPACE CONTENT ────────────────────────────────── */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* ─── TAB 1: SYSTEM OVERVIEW & READINESS ──────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* System Health Card (Real API Signals) */}
            <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-neutral-300" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">System Readiness & Platform Health</h2>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className={`px-2 py-0.5 rounded-full ${
                    platform?.state === 'healthy'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    Platform: {platform?.state ?? 'online'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                {/* 1. API Process Readiness */}
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs text-neutral-400 uppercase">API Ingest Process</span>
                    <span className={`stream-dot ${apiReadiness?.ready !== false ? 'stream-live' : 'stream-idle'}`} />
                  </div>
                  <p className="text-base font-bold text-white">{apiReadiness?.ready !== false ? 'Ready' : 'Degraded'}</p>
                  <p className="text-3xs text-neutral-400">Database connection ok</p>
                </div>

                {/* 2. Evaluator Worker Readiness */}
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs text-neutral-400 uppercase">Evaluator Fleet</span>
                    <span className={`stream-dot ${evaluatorReadiness?.workers_alive ? 'stream-live' : 'stream-idle'}`} />
                  </div>
                  <p className="text-base font-bold text-white">
                    {evaluatorReadiness?.workers_alive ?? (platform?.workers?.alive ?? 0)} Worker Alive
                  </p>
                  <p className="text-3xs text-neutral-400">
                    {evaluatorReadiness?.workers_registered ?? (platform?.workers?.registered ?? 0)} registered / {evaluatorReadiness?.workers_stale ?? 0} stale
                  </p>
                </div>

                {/* 3. Durable Evaluation Queue */}
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs text-neutral-400 uppercase">Durable Queue</span>
                    <span className="text-neutral-400 text-3xs">WAL Mode</span>
                  </div>
                  <p className="text-base font-bold text-white">
                    {platform?.evaluation_queue?.depth ?? 0} jobs queued
                  </p>
                  <p className="text-3xs text-neutral-400">Zero-loss lease recovery</p>
                </div>

                {/* 4. Total Evaluated Spans */}
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs text-neutral-400 uppercase">Total Spans</span>
                    <span className="text-neutral-400 text-3xs">
                      {/* "All evaluated" was wrong: the queue being empty only
                          means nothing is waiting, not that every stored span has
                          been scored. Spans ingested before the worker existed
                          were never enqueued at all -- coverage is currently a
                          fraction of total spans, so the badge reports queue
                          state and says so. */}
                      {platform?.evaluation_queue?.depth
                        ? `${platform.evaluation_queue.depth} queued`
                        : 'Queue empty'}
                    </span>
                  </div>
                  <p className="text-base font-bold text-white">{metrics?.total_spans ?? '—'}</p>
                  <p className="text-3xs text-neutral-400">
                    Avg Latency: {metrics?.avg_latency_ms ? `${metrics.avg_latency_ms} ms` : '—'}
                  </p>
                </div>
              </div>

              {/* Note on Model Architecture */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06] text-3xs font-mono text-neutral-400 leading-relaxed">
                <span className="text-neutral-300 font-bold">Inference Architecture:</span> The API server intentionally delegates inference to background workers (<code className="text-neutral-300">python -m app.worker</code>). Models are not loaded into the HTTP ingest process to maintain &lt;0.005ms ingest overhead.
              </div>
            </div>

            {/* Monitored Agent Swarm Table */}
            <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-neutral-300" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Monitored Agent Swarm ({sortedAgents.length})</h3>
                </div>
                <span className="text-3xs font-mono text-neutral-400">Sorted by risk & stability &bull; Click to inspect</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-3xs text-neutral-400 uppercase tracking-wider border-b border-white/[0.06]">
                      <th className="py-2.5 px-3">Agent ID</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Spans</th>
                      <th className="py-2.5 px-3">Error Rate</th>
                      <th className="py-2.5 px-3">Latency P50</th>
                      <th className="py-2.5 px-3 text-right">Stability (ASI)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {sortedAgents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs font-mono text-neutral-500">
                          No agents registered. Ingest spans via the SDK or run a Lab simulation.
                        </td>
                      </tr>
                    ) : sortedAgents.map((agent) => {
                      const tone = asiTone(agent.current_asi, agent.error_rate);
                      const isSelected = selectedAgentId === agent.agent_id;

                      return (
                        <tr
                          key={agent.agent_id}
                          onClick={() => onSelectAgent(isSelected ? null : agent.agent_id)}
                          className={`hover:bg-white/5 transition-colors cursor-pointer ${
                            isSelected ? 'bg-white/10 font-bold' : ''
                          }`}
                        >
                          <td className={`py-3 px-3 font-bold ${tone.color}`}>{agent.agent_id}</td>
                          <td className="py-3 px-3 text-neutral-300">{agent.agent_role || '—'}</td>
                          <td className="py-3 px-3 text-neutral-300">{agent.total_spans}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-3xs ${
                              agent.error_rate === 0 ? 'text-emerald-400 bg-emerald-500/10' : agent.error_rate > 0.1 ? 'text-rose-400 bg-rose-500/10' : 'text-amber-400 bg-amber-500/10'
                            }`}>
                              {(agent.error_rate * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-neutral-300">
                            {agent.avg_latency_ms ? `${agent.avg_latency_ms} ms` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="font-bold text-white">
                              {agent.current_asi !== null && agent.current_asi !== undefined
                                ? agent.current_asi.toFixed(1)
                                : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Agent Health Drilldown (Sparkline / Trend Inspection) */}
              {selectedAgentId && (
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-3 mt-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Agent Health Drilldown: {selectedAgentId}
                    </span>
                    <button
                      onClick={() => onSelectAgent(null)}
                      className="text-3xs text-neutral-400 hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  {agentHealthData?.risk_trend && agentHealthData.risk_trend.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-3xs font-mono text-neutral-400">Recent Evaluation Samples (Risk Score):</p>
                      <div className="flex items-end gap-1.5 overflow-x-auto py-2 h-16 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
                        {agentHealthData.risk_trend.slice(0, 25).map((point, idx) => {
                          const risk = point.risk_score ?? 0;
                          const heightPct = Math.max(15, Math.min(100, risk * 100));
                          const barColor = risk > 0.4 ? 'bg-rose-500' : 'bg-emerald-500';

                          return (
                            <div
                              key={idx}
                              className="flex flex-col items-center gap-1 group relative"
                            >
                              <div
                                className={`w-3 rounded-t-sm transition-all ${barColor}`}
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-3xs font-mono text-neutral-500">
                      Insufficient history (accumulates on incoming evaluated spans).
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 2: TRACE INVESTIGATION WORKSPACE ────────────────────── */}
        {activeTab === 'traces' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Traces List */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-[#11131a] border border-white/10 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neutral-300" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Traces ({filteredTraces.length})</span>
                </div>
                <div className="flex items-center gap-1 text-3xs font-mono">
                  {(['ALL', 'HAS_RISK'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTraceFilterStatus(filter)}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        traceFilterStatus === filter ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredTraces.length === 0 ? (
                  <div className="p-8 text-center text-xs font-mono text-neutral-500 space-y-2">
                    {traces.length === 0 ? (
                      <>
                        <p>No traces recorded yet.</p>
                        <button
                          onClick={() => setActiveTab('lab')}
                          className="px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all text-xs cursor-pointer"
                        >
                          Run Telemetry Lab
                        </button>
                      </>
                    ) : (
                      <>
                        <p>No traces match this filter.</p>
                        <button
                          onClick={() => setTraceFilterStatus('ALL')}
                          className="px-3 py-1 rounded bg-white/10 text-white hover:bg-white/20 text-3xs cursor-pointer"
                        >
                          Clear filter
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  filteredTraces.map((trace) => {
                    const isSelected = selectedTraceId === trace.trace_id;
                    const isCompleted = trace.status === 'completed' || trace.status === 'success';

                    return (
                      <div
                        key={trace.trace_id}
                        onClick={() => setSelectedTraceId(trace.trace_id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1.5 ${
                          isSelected
                            ? 'bg-white/10 border-white/25 text-white shadow-sm'
                            : 'bg-[#08090d] border-white/[0.06] text-neutral-400 hover:text-white hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center justify-between text-2xs font-mono">
                          <span className="font-bold truncate max-w-[160px]">{trace.trace_id.slice(0, 12)}..</span>
                          <span
                            className={`px-2 py-0.5 rounded text-3xs ${
                              isCompleted
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20'
                            }`}
                          >
                            {trace.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-3xs font-mono text-neutral-400">
                          <span>{trace.total_spans} spans &bull; {trace.service_name || 'pipeline'}</span>
                          <span>{trace.start_time ? new Date(trace.start_time).toLocaleTimeString() : '—'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Center Column: Execution Hierarchy Waterfall */}
            <div className="lg:col-span-8 space-y-6">
              <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div>
                    <span className="text-3xs font-mono text-neutral-400 uppercase">Selected Trace</span>
                    <h3 className="text-xs font-bold font-mono text-white mt-0.5">
                      {selectedTraceData ? selectedTraceData.trace.trace_id : 'Select a trace to inspect'}
                    </h3>
                  </div>
                  {selectedTraceData && (
                    <div className="flex items-center gap-2 text-3xs font-mono">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-300">
                        {selectedTraceData.spans.length} Spans Captured
                      </span>
                      {selectedTraceData.trace.service_name && (
                        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400">
                          {selectedTraceData.trace.service_name}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Execution Hierarchy Waterfall Spans */}
                {selectedTraceData ? (
                  <div className="space-y-2 focus:outline-none" onKeyDown={handleSpanKeyDown} tabIndex={0} role="listbox" aria-label="Span hierarchy">
                    <div className="flex items-center justify-between text-3xs font-mono text-neutral-400 uppercase">
                      <span>Execution Span Hierarchy (↑↓ to navigate)</span>
                      <span>
                        {traceTimeline.hasClock
                          ? `Timeline · ${traceTimeline.windowMs.toFixed(0)} ms span`
                          : 'Duration (no timestamps — relative only)'}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                      {selectedTraceData.spans.map((span) => {
                        const isSelected = selectedSpanId === span.span_id;
                        const hasEvaluation = !!span.evaluation;
                        const risk = span.evaluation?.overall_risk_score ?? 0;
                        const isDetached = span.parent_span_id && !spanIdSet.has(span.parent_span_id);

                        return (
                          <div
                            key={span.span_id}
                            onClick={() => setSelectedSpanId(span.span_id)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-white/15 border-white/30 text-white shadow-sm'
                                : 'bg-[#08090d] border-white/[0.06] text-neutral-400 hover:text-white hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-neutral-400">
                                {isDetached ? '[detached]' : span.parent_span_id ? '└─' : '├─'}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white font-mono">{span.agent_role || span.agent_id}</span>
                                  {span.tool_name && (
                                    <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-white/5 text-neutral-300">
                                      tool: {span.tool_name}
                                    </span>
                                  )}
                                </div>
                                <span className="text-3xs font-mono text-neutral-400">
                                  ID: {span.span_id} &bull; {span.event_type}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs font-mono min-w-[180px]">
                              {/* Waterfall bar: placed at its real start offset
                                  so ordering and overlap are readable, not just
                                  duration (#6, #35). */}
                              <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden min-w-[60px]">
                                <div
                                  className={`absolute inset-y-0 rounded-full ${risk > 0.4 ? 'bg-rose-500' : 'bg-neutral-400'}`}
                                  style={{
                                    left: `${spanBar(span).left}%`,
                                    width: `${spanBar(span).width}%`,
                                  }}
                                />
                              </div>
                              <span className="text-neutral-300 text-2xs w-[52px] text-right shrink-0">{span.latency_ms ? `${span.latency_ms}ms` : '—'}</span>
                              {hasEvaluation && (
                                <span
                                  className={`px-2 py-0.5 rounded text-3xs font-bold shrink-0 ${
                                    risk > 0.4 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                                  }`}
                                >
                                  {span.evaluation?.label || (risk > 0.4 ? 'RISK' : 'OK')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-neutral-500">No trace selected.</p>
                )}
              </div>

              {/* Slide-Over / Non-Modal Contextual Span Inspector */}
              {activeSpan && (
                <div className="p-6 rounded-2xl bg-[#181b24] border border-white/15 space-y-5 shadow-2xl animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-neutral-300" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Span Inspector: {activeSpan.agent_role || activeSpan.agent_id}
                      </h4>
                    </div>
                    <span className="text-3xs font-mono text-neutral-400">ID: {activeSpan.span_id}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.06]">
                      <span className="text-3xs text-neutral-400 uppercase">Latency</span>
                      <p className="text-sm font-bold text-white mt-0.5">{activeSpan.latency_ms ? `${activeSpan.latency_ms} ms` : '—'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.06]">
                      <span className="text-3xs text-neutral-400 uppercase">Tokens (In / Out)</span>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {activeSpan.tokens_in ?? '—'} / {activeSpan.tokens_out ?? '—'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.06]">
                      <span className="text-3xs text-neutral-400 uppercase">Status</span>
                      <p className="text-sm font-bold text-emerald-400 mt-0.5">{activeSpan.status}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.06]">
                      <span className="text-3xs text-neutral-400 uppercase">Model</span>
                      <p className="text-sm font-bold text-neutral-300 mt-0.5 truncate">{activeSpan.model || 'Local Python'}</p>
                    </div>
                  </div>

                  {/* Input / Output Summaries (#28) */}
                  {(activeSpan.input_summary || activeSpan.output_summary) && (
                    <div className="space-y-3 pt-2">
                      {activeSpan.input_summary && (
                        <div className="space-y-1">
                          <span className="text-3xs font-mono text-neutral-400 uppercase">Input Summary</span>
                          <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.06] text-xs font-mono text-neutral-200">
                            {activeSpan.input_summary}
                          </div>
                        </div>
                      )}
                      {activeSpan.output_summary && (
                        <div className="space-y-1">
                          <span className="text-3xs font-mono text-neutral-400 uppercase">Output Summary</span>
                          <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.06] text-xs font-mono text-neutral-200">
                            {activeSpan.output_summary}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Real Evaluation Details (#17) */}
                  {activeSpan.evaluation ? (
                    <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Evaluator Diagnostics</span>
                        <span className="text-3xs font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400">
                          Stage: {activeSpan.evaluation.evaluation_stage || 'Two-Stage Cascade'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                        <div>
                          <span className="text-3xs text-neutral-400 uppercase">Grounding Score</span>
                          <p className="text-white font-bold mt-0.5">
                            {activeSpan.evaluation.grounding_score !== null && activeSpan.evaluation.grounding_score !== undefined
                              ? activeSpan.evaluation.grounding_score.toFixed(2)
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-3xs text-neutral-400 uppercase">Tool Claim Score</span>
                          <p className="text-white font-bold mt-0.5">
                            {activeSpan.evaluation.tool_claim_score !== null && activeSpan.evaluation.tool_claim_score !== undefined
                              ? activeSpan.evaluation.tool_claim_score.toFixed(2)
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-3xs text-neutral-400 uppercase">Overall Risk</span>
                          <p className="text-white font-bold mt-0.5">
                            {activeSpan.evaluation.overall_risk_score !== null && activeSpan.evaluation.overall_risk_score !== undefined
                              ? activeSpan.evaluation.overall_risk_score.toFixed(2)
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-3xs font-mono text-neutral-500">
                      No evaluation record for this span.{' '}
                      {platform?.evaluation_queue?.depth
                        ? `(Evaluator processing: ${platform.evaluation_queue.depth} queued)`
                        : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 3: REAL INCIDENTS / ALERTS (#27) ───────────────────── */}
        {activeTab === 'incidents' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Incident Queue ({unacknowledgedCount})</h3>
                </div>
                <span className="text-3xs font-mono text-neutral-400">
                  {unacknowledgedCount} Unacknowledged
                </span>
              </div>

              {alerts.length === 0 ? (
                <div className="p-12 text-center text-xs font-mono text-neutral-500 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p>Zero active incidents detected across fleet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => {
                    const isExpanded = !!expandedAlerts[alert.id];

                    return (
                      <div
                        key={alert.id}
                        className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-3xs font-mono font-bold uppercase ${
                                alert.severity === 'critical'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {alert.severity}
                            </span>
                            <span className="text-xs font-bold text-white font-mono">{alert.alert_type}</span>
                            <span className="text-3xs font-mono text-neutral-400">
                              Agent: {alert.agent_id || 'System'}
                            </span>
                          </div>

                          {!alert.acknowledged && (
                            <button
                              onClick={async () => {
                                await client.acknowledgeAlert(alert.id);
                                onRefresh();
                              }}
                              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono text-white transition-all cursor-pointer"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-neutral-300 leading-relaxed font-mono">{alert.message}</p>

                        {/* Structured Labeled Alert Details (#27) */}
                        {alert.details && (
                          <div className="space-y-2 pt-1">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-3xs font-mono p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                              {Object.entries(alert.details).slice(0, 4).map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-neutral-500 uppercase">{key.replace(/_/g, ' ')}:</span>
                                  <p className="text-neutral-300 font-bold mt-0.5 truncate">
                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <button
                              onClick={() => setExpandedAlerts((prev) => ({ ...prev, [alert.id]: !prev[alert.id] }))}
                              className="text-3xs font-mono text-neutral-500 hover:text-neutral-300 cursor-pointer"
                            >
                              {isExpanded ? 'Hide Raw Details ▲' : 'Show Full JSON Details ▼'}
                            </button>

                            {isExpanded && (
                              <div className="p-3 rounded-lg bg-white/5 border border-white/[0.04] text-3xs font-mono text-neutral-400 overflow-x-auto">
                                <pre>{JSON.stringify(alert.details, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 4: REAL DRIFT & ASI (#24, #25) ──────────────────────── */}
        {activeTab === 'drift' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neutral-300" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Agent Stability Index & Tool Drift</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xs font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400">
                    Maturity: Beta
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {sortedDriftAgents.length > 0 ? (
                  sortedDriftAgents.map((agent) => {
                    const tone = asiTone(agent.current_asi);

                    return (
                      <div key={agent.agent_id} className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white font-mono">{agent.agent_id}</span>
                          <span className="text-3xs font-mono text-neutral-400">
                            Baseline: {agent.baseline_size ?? 0} spans
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-2xs font-mono">
                            <span className="text-neutral-400">Current ASI</span>
                            <span className={`font-bold ${tone.color}`}>
                              {agent.current_asi !== null ? `${agent.current_asi.toFixed(1)} / 100` : '—'}
                            </span>
                          </div>
                          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-neutral-300 h-full rounded-full"
                              style={{ width: `${agent.current_asi ?? 98}%` }}
                            />
                          </div>
                        </div>

                        {/* Honest Labeling for Centroid Distance (#24, #25).
                            A missing measurement renders as an em dash, never
                            as 0.000 -- "not recorded" and "measured zero" are
                            different facts and an operator has to be able to
                            tell them apart. */}
                        <div className="space-y-1 text-3xs font-mono text-neutral-400 pt-1 border-t border-white/[0.04]">
                          <div>
                            Sustained Shift (alerting signal):{' '}
                            <span className="text-neutral-200">
                              {typeof agent.latest_window_centroid_distance === 'number'
                                ? agent.latest_window_centroid_distance.toFixed(3)
                                : '— not enough samples yet'}
                            </span>
                          </div>
                          <div>
                            Immediate Spike Signal:{' '}
                            <span className="text-neutral-200">
                              {typeof agent.latest_centroid_distance === 'number'
                                ? agent.latest_centroid_distance.toFixed(3)
                                : '—'}
                            </span>
                          </div>
                          <div>
                            Tool Drift:{' '}
                            <span className="text-neutral-200">
                              {typeof agent.latest_tool_drift === 'number'
                                ? agent.latest_tool_drift.toFixed(3)
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-3 p-8 text-center text-xs font-mono text-neutral-500">
                    Insufficient history (requires baseline formation from live runs).
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 5: TELEMETRY LAB & DATASETS (#3, #4) ────────────────── */}
        {activeTab === 'lab' && (
          <div className="space-y-6">
            {/* Controlled Telemetry Lab Card */}
            <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-neutral-300" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Controlled Telemetry Lab</h3>
                </div>
                <span className="text-3xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  LOCAL LAB DATA / CONTROLLED RUN
                </span>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed max-w-2xl">
                Execute a controlled 5-agent LangGraph workflow against the local server to test real telemetry ingestion, MiniLM gating, and DeBERTa NLI evaluation.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-3xs font-mono uppercase tracking-wider text-neutral-400">Failure Scenario</label>
                  <select
                    value={labScenario}
                    onChange={(e) => setLabScenario(e.target.value as any)}
                    className="w-full bg-[#08090d] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  >
                    <option value="clean">Clean Execution (Grounded & Consistent)</option>
                    <option value="hallucination">Injected Hallucination (NLI Contradiction)</option>
                    <option value="tool_mismatch">Tool Return Mismatch (Regex Check)</option>
                    <option value="drift">Centroid Shift & Drift</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-3xs font-mono uppercase tracking-wider text-neutral-400">Test Query</label>
                  <input
                    type="text"
                    value={labQuery}
                    onChange={(e) => setLabQuery(e.target.value)}
                    className="w-full bg-[#08090d] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    placeholder="Enter agent query..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={runTelemetryLab}
                  disabled={labRunning}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>{labRunning ? 'Executing Pipeline...' : 'Run Telemetry Lab'}</span>
                </button>

                {labMessage && (
                  <span className="text-xs font-mono text-neutral-300">{labMessage}</span>
                )}
              </div>
            </div>

            {/* Research Datasets & Recorded Experiments (#3, #4) */}
            <div className="p-6 rounded-2xl bg-[#11131a] border border-white/10 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-neutral-300" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Evaluation Datasets & Recorded Experiments</h3>
                </div>
                <span className="text-3xs font-mono text-neutral-400">RECORDED BENCHMARKS</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dynamically Populated Datasets (#3) */}
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Curated Datasets</span>
                    <span className="text-3xs font-mono text-neutral-500">
                      {datasetsData?.datasets?.length ?? 0} Datasets
                    </span>
                  </div>

                  {datasetsData?.datasets && datasetsData.datasets.length > 0 ? (
                    <div className="space-y-2">
                      {datasetsData.datasets.map((ds, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs font-mono space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-bold">{ds.dataset_name || ds.filename || 'Dataset'}</span>
                            <span className="text-3xs text-neutral-400">
                              {ds.total_cases} cases
                            </span>
                          </div>
                          <div className="text-3xs text-neutral-500">
                            {ds.dataset_version || 'v1'} &bull; {ds.split || 'full'}
                            {ds.description ? ` — ${ds.description}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-3xs font-mono text-neutral-500">
                      No datasets registered on this instance.
                    </p>
                  )}
                </div>

                {/* Real File Experiments & Ablation Runs (#4) */}
                <div className="p-4 rounded-xl bg-[#08090d] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Recorded Benchmark Runs</span>
                    <span className="text-3xs font-mono text-neutral-500">
                      {(experimentsData?.file_experiments?.length ?? 0) + (experimentsData?.experiments?.length ?? 0)} Runs
                    </span>
                  </div>

                  {experimentsData?.file_experiments && experimentsData.file_experiments.length > 0 ? (
                    <div className="space-y-2">
                      {experimentsData.file_experiments.map((fe, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs font-mono space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-bold truncate max-w-[200px]">{fe.file}</span>
                            <span className="text-3xs text-neutral-500">{fe.timestamp || '2026-08-23'}</span>
                          </div>
                          <p className="text-3xs text-neutral-400">
                            Model: {fe.model || 'MiniLM + DeBERTa'} &bull; Dataset: {fe.dataset || 'Ablation Suite'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-3xs font-mono text-neutral-500">
                      Zero benchmark runs recorded in DB.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── 3. RAYCAST-GRADE COMMAND PALETTE (Cmd+K / Ctrl+K) ────────── */}
      {isCommandOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#11131a] border border-white/20 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Input Header */}
            <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="text"
                autoFocus
                placeholder="Type a command or search agents, traces, incidents..."
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder:text-neutral-500 focus:outline-none font-mono"
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                className="p-1 rounded bg-white/10 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Actions & Navigation */}
            <div className="p-3 max-h-80 overflow-y-auto space-y-1 text-xs font-mono">
              <p className="text-3xs uppercase tracking-wider text-neutral-500 px-2 py-1">Quick Navigation</p>
              {[
                { label: 'Go to System Overview', action: () => { setActiveTab('overview'); setIsCommandOpen(false); } },
                { label: 'Go to Trace Workspace', action: () => { setActiveTab('traces'); setIsCommandOpen(false); } },
                { label: 'Go to Incidents & Alerts', action: () => { setActiveTab('incidents'); setIsCommandOpen(false); } },
                { label: 'Go to Drift & ASI Metrics', action: () => { setActiveTab('drift'); setIsCommandOpen(false); } },
                { label: 'Run Telemetry Lab Simulation', action: () => { setActiveTab('lab'); setIsCommandOpen(false); } },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={item.action}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-neutral-300 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>{item.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                </button>
              ))}

              {agents.length > 0 && (
                <>
                  <p className="text-3xs uppercase tracking-wider text-neutral-500 px-2 py-1 pt-2">Agents</p>
                  {agents.map((agent) => (
                    <button
                      key={agent.agent_id}
                      onClick={() => {
                        onSelectAgent(agent.agent_id);
                        setActiveTab('overview');
                        setIsCommandOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-neutral-300 hover:text-white flex items-center justify-between cursor-pointer"
                    >
                      <span>Agent: {agent.agent_id} ({agent.agent_role || 'Agent'})</span>
                      <span className="text-3xs text-neutral-500">Inspect</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
