import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, Metrics, TraceListItem, Agent, AlertItem, SpanDetail } from './lib/api';
import { useWebSocket } from './hooks/useWebSocket';
import {
  AreaChart, Area, LineChart, Line, ScatterChart, Scatter, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis
} from 'recharts';
import {
  Activity, ShieldAlert, Cpu, GitFork, CheckCircle2,
  AlertTriangle, Flame, ArrowRight, Play, Pause, SkipForward, SkipBack,
  Sparkles, Compass, Search, Terminal, Zap, Bug, Clock,
  Filter, Command, Lock, Server, Check, X, Layers, RefreshCw, Eye,
  Database, FlaskConical, PlusCircle, BookmarkCheck, ArrowUpRight
} from 'lucide-react';

// ─── Types & Enums ─────────────────────────────────────────────────────

type NavPage = 'overview' | 'traces' | 'incidents' | 'drift' | 'telemetry-lab' | 'incident-replay' | 'experiments' | 'datasets';
type ReasoningStrategy = 'ALL' | 'DIRECT' | 'COT' | 'AOT';

interface IncidentStep {
  timeOffset: number;
  timeLabel: string;
  agent: string;
  role: string;
  status: 'healthy' | 'watch' | 'critical';
  riskScore: number;
  event: string;
  evidence?: string;
  toolUsed?: string;
}

// ─── Status & Badge Components ─────────────────────────────────────────

function StatusBadge({ status }: { status: 'healthy' | 'watch' | 'critical' | 'running' | 'success' | 'error' | string }) {
  const s = status.toLowerCase();
  if (s === 'healthy' || s === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>HEALTHY</span>
      </span>
    );
  }
  if (s === 'watch' || s === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        <span>WATCH</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
      <span>CRITICAL</span>
    </span>
  );
}

function RiskScorePill({ score, label }: { score: number | null | undefined; label?: string }) {
  if (score === null || score === undefined) {
    return <span className="font-mono text-xs text-slate-500">—</span>;
  }
  const isHigh = score > 0.7;
  const isMed = score > 0.4 && score <= 0.7;
  const colorCls = isHigh
    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    : isMed
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border ${colorCls}`}>
      <span>{score.toFixed(3)}</span>
      {label && <span className="text-[10px] text-slate-400 uppercase">({label})</span>}
    </span>
  );
}

// ─── 1. Global Navigation & Compact Health Strip ────────────────────────

function TopControlBar({
  currentPage, onNavigate, metrics, agents, openIncidentsCount, isConnected, onOpenCommandPalette,
  activeStrategy, onSelectStrategy
}: {
  currentPage: NavPage;
  onNavigate: (p: NavPage) => void;
  metrics: Metrics | null;
  agents: Agent[];
  openIncidentsCount: number;
  isConnected: boolean;
  onOpenCommandPalette: () => void;
  activeStrategy: ReasoningStrategy;
  onSelectStrategy: (s: ReasoningStrategy) => void;
}) {
  const avgRisk = metrics?.avg_risk_score ?? 0;
  const avgAsi = agents.length > 0
    ? agents.reduce((acc, a) => acc + (a.current_asi ?? 100), 0) / agents.length
    : 100;

  return (
    <header className="bg-[#0c0e14] border-b border-slate-800 sticky top-0 z-40">
      {/* Primary App Bar */}
      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Brand & Tabs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-mono font-bold text-xs">
              AP
            </div>
            <span className="font-semibold text-slate-100 text-sm tracking-tight font-sans">
              AgentPulse <span className="text-slate-500 font-mono text-xs font-normal">/ Control Plane</span>
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 text-xs font-medium">
            <button
              onClick={() => onNavigate('overview')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                currentPage === 'overview' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => onNavigate('traces')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                currentPage === 'traces' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Traces
            </button>
            <button
              onClick={() => onNavigate('incidents')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                currentPage === 'incidents' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Incidents</span>
              {openIncidentsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold">
                  {openIncidentsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => onNavigate('incident-replay')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                currentPage === 'incident-replay' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Replay Debugger
            </button>
            <button
              onClick={() => onNavigate('drift')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                currentPage === 'drift' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Drift & Stability
            </button>
            <button
              onClick={() => onNavigate('experiments')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 text-indigo-400 ${
                currentPage === 'experiments' ? 'bg-slate-800 font-semibold' : 'hover:text-indigo-300'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Experiments</span>
            </button>
            <button
              onClick={() => onNavigate('datasets')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 text-emerald-400 ${
                currentPage === 'datasets' ? 'bg-slate-800 font-semibold' : 'hover:text-emerald-300'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Datasets</span>
            </button>
            <button
              onClick={() => onNavigate('telemetry-lab')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 text-amber-400 ${
                currentPage === 'telemetry-lab' ? 'bg-slate-800 font-semibold' : 'hover:text-amber-300'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Telemetry Lab</span>
            </button>
          </nav>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {/* Strategy Selector */}
          <div className="flex items-center gap-1 bg-[#141824] border border-slate-800 px-1.5 py-0.5 rounded">
            <span className="text-[10px] text-slate-500 pr-1">STRATEGY:</span>
            {(['ALL', 'DIRECT', 'COT', 'AOT'] as ReasoningStrategy[]).map((strat) => (
              <button
                key={strat}
                onClick={() => onSelectStrategy(strat)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  activeStrategy === strat ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {strat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            <span>{isConnected ? 'LIVE WS' : 'SYNC POLLING'}</span>
          </div>

          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 bg-[#141824] hover:bg-slate-800 border border-slate-800 px-2.5 py-1 rounded text-slate-300 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Search actions</span>
            <kbd className="bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-400 border border-slate-700 font-mono">⌘K</kbd>
          </button>
        </div>
      </div>

      {/* Global Compact Health Strip */}
      <div className="bg-[#090b10] border-t border-slate-800/60 px-6 py-1.5 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span>AGENTS:</span>
            <span className="font-semibold text-slate-200">{agents.length || 5} active</span>
          </div>
          <div className="flex items-center gap-2">
            <span>TRACES:</span>
            <span className="font-semibold text-slate-200">{metrics?.total_traces ?? 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>COMPOSITE RISK:</span>
            <span className={`font-semibold ${avgRisk > 0.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {avgRisk.toFixed(3)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>SYSTEM ASI:</span>
            <span className={`font-semibold ${avgAsi >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {avgAsi.toFixed(0)}/100
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>OPEN INCIDENTS:</span>
            <span className={`font-semibold ${openIncidentsCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {openIncidentsCount}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Evaluated Model: <span className="text-slate-300">Qwen 2.5 7B Instruct</span> (Cascade NLI)
        </div>
      </div>
    </header>
  );
}

// ─── 2. Agent Topology (Aggregated & Expanded Views) ───────────────────

const TOPOLOGY_NODES = [
  { id: 'researcher', name: 'Researcher', role: 'Query Planner', description: 'Decomposes user queries into sub-searches' },
  { id: 'retriever', name: 'Retriever', role: 'Paper Indexer', description: 'Simulates academic corpus retrieval' },
  { id: 'verifier', name: 'Verifier', role: 'Claim Verifier', description: 'Checks claims against source premises' },
  { id: 'analyst', name: 'Analyst', role: 'Synthesis Engine', description: 'Synthesizes reasoning over verified facts' },
  { id: 'writer', name: 'Writer', role: 'Report Author', description: 'Drafts publication-ready summary document' },
];

function AgentTopologySection({
  agents, selectedAgentId, onSelectAgent
}: {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}) {
  const agentMap = useMemo(() => new Map(agents.map(a => [a.agent_id, a])), [agents]);

  return (
    <div className="bg-[#11141f] border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100 font-sans tracking-tight">Agent Execution Topology</h2>
          <p className="text-xs text-slate-400">Live DAG pipeline with real-time risk propagation & ASI health status</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>ASI ≥ 70</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>ASI 50-69</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>ASI &lt; 50</span>
          </div>
        </div>
      </div>

      {/* DAG Flow */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
        {TOPOLOGY_NODES.map((node, index) => {
          const liveAgent = agentMap.get(node.id);
          const isSelected = selectedAgentId === node.id;
          const asi = liveAgent?.current_asi ?? 98.4;
          const risk = liveAgent?.avg_risk_score ?? 0.04;
          const spansCount = liveAgent?.total_spans ?? 24;

          const status = asi < 50 ? 'critical' : asi < 70 ? 'watch' : 'healthy';

          return (
            <div
              key={node.id}
              onClick={() => onSelectAgent(node.id)}
              className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-[#161b2b] shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500'
                  : 'border-slate-800 bg-[#0e111a] hover:border-slate-700 hover:bg-[#131724]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-slate-500 font-bold">NODE 0{index + 1}</span>
                <StatusBadge status={status} />
              </div>

              <div className="font-semibold text-slate-100 text-sm font-sans">{node.name}</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">{node.role}</div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">ASI</span>
                  <span className={`font-bold ${asi >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {asi.toFixed(0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">RISK</span>
                  <span className={`font-bold ${risk > 0.5 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {risk.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">SPANS</span>
                  <span className="font-bold text-slate-300">{spansCount}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 3. Trace Waterfall & Step Timeline ────────────────────────────────

interface WaterfallSpan {
  id: string;
  agent: string;
  role: string;
  startMs: number;
  durationMs: number;
  riskScore: number;
  status: string;
  eventType: string;
  toolUsed?: string;
  claim?: string;
}

const SAMPLE_WATERFALL_SPANS: WaterfallSpan[] = [
  { id: 'sp-01', agent: 'researcher', role: 'Query Planner', startMs: 0, durationMs: 42, riskScore: 0.05, status: 'success', eventType: 'agent_start' },
  { id: 'sp-02', agent: 'retriever', role: 'Paper Indexer', startMs: 44, durationMs: 110, riskScore: 0.08, status: 'success', eventType: 'tool_call', toolUsed: 'academic_search_api' },
  { id: 'sp-03', agent: 'verifier', role: 'Claim Verifier', startMs: 156, durationMs: 88, riskScore: 0.92, status: 'error', eventType: 'llm_generation', claim: 'Zhang et al. (2024) proven that 300,000 customers experienced quantum synchronization.' },
  { id: 'sp-04', agent: 'analyst', role: 'Synthesis Engine', startMs: 246, durationMs: 140, riskScore: 0.98, status: 'error', eventType: 'agent_end' },
  { id: 'sp-05', agent: 'writer', role: 'Report Author', startMs: 388, durationMs: 95, riskScore: 0.95, status: 'error', eventType: 'agent_end' },
];

function TraceWaterfallSection({
  selectedSpanId, onSelectSpan
}: {
  selectedSpanId?: string;
  onSelectSpan: (span: WaterfallSpan) => void;
}) {
  const totalDuration = 490;

  return (
    <div className="bg-[#11141f] border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-100 font-sans tracking-tight">Active Trace Waterfall</h2>
          <p className="text-xs text-slate-400 font-mono">Trace ID: <span className="text-indigo-400 font-bold">tr_e2e_research_48821</span></p>
        </div>
        <div className="text-xs font-mono text-slate-400">
          TOTAL DURATION: <span className="text-slate-200 font-bold">483ms</span>
        </div>
      </div>

      <div className="space-y-2 pt-2">
        {SAMPLE_WATERFALL_SPANS.map((span) => {
          const leftPercent = (span.startMs / totalDuration) * 100;
          const widthPercent = Math.max((span.durationMs / totalDuration) * 100, 3);
          const isSelected = selectedSpanId === span.id;

          return (
            <div
              key={span.id}
              onClick={() => onSelectSpan(span)}
              className={`p-2.5 rounded border text-xs font-mono cursor-pointer transition-colors ${
                isSelected
                  ? 'border-indigo-500 bg-[#161b2b]'
                  : 'border-slate-800/80 bg-[#0e111a] hover:bg-[#131724]'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 capitalize">@{span.agent}</span>
                  <span className="text-slate-500">({span.role})</span>
                  {span.toolUsed && (
                    <span className="text-cyan-400 text-[10px] font-bold px-1 rounded bg-cyan-950/40 border border-cyan-800/30">
                      🔧 {span.toolUsed}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">{span.durationMs}ms</span>
                  <RiskScorePill score={span.riskScore} />
                </div>
              </div>

              {/* Timeline Bar */}
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden relative">
                <div
                  className={`absolute top-0 bottom-0 rounded-full ${
                    span.riskScore > 0.7
                      ? 'bg-rose-500'
                      : span.riskScore > 0.3
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4. Evidence Inspector Panel (Side-by-Side Dual Pane) ──────────────

function EvidenceInspectorPanel({ selectedSpan }: { selectedSpan?: WaterfallSpan | null }) {
  const [activeTab, setActiveTab] = useState<'evidence' | 'tools' | 'eval' | 'drift' | 'meta'>('evidence');

  return (
    <div className="bg-[#11141f] border border-slate-800 rounded-lg p-4 flex flex-col h-full space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100 font-sans tracking-tight">Evidence & Grounding Inspector</h2>
          <span className="text-[10px] font-mono text-slate-500">Span: {selectedSpan?.id || 'sp-03'}</span>
        </div>
        <p className="text-xs text-slate-400">Verifies model claims against source premise documents</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 text-xs font-mono">
        <button
          onClick={() => setActiveTab('evidence')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'evidence' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Evidence
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'tools' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => setActiveTab('eval')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'eval' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Eval Cascade
        </button>
        <button
          onClick={() => setActiveTab('drift')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'drift' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Drift Signal
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto space-y-3 text-xs">
        {activeTab === 'evidence' ? (
          <div className="space-y-3">
            <div className="p-3 rounded bg-[#0e111a] border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Source Premise Context</span>
              <p className="text-slate-300 font-sans text-xs leading-relaxed">
                "The database query executed in 45ms and returned 3 verified customer profile records."
              </p>
            </div>

            <div className="p-3 rounded bg-rose-950/20 border border-rose-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-rose-400 uppercase font-bold">Agent Asserted Claim</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">UNGROUNDED</span>
              </div>
              <p className="text-rose-200 font-sans text-xs leading-relaxed">
                "Zhang et al. (2024) proven that 300,000 customers experienced instant quantum telemetry synchronization."
              </p>
            </div>
          </div>
        ) : activeTab === 'tools' ? (
          <div className="p-3 rounded bg-[#0e111a] border border-slate-800 space-y-2 font-mono text-xs">
            <div className="text-slate-400">Tool Name: <span className="text-cyan-400 font-bold">support_kb_search</span></div>
            <div className="text-slate-400">Claimed Count: <span className="text-rose-400 font-bold">14</span> | Actual Returned: <span className="text-emerald-400 font-bold">3</span></div>
            <div className="text-slate-500 text-[11px]">Verdict: Deterministic tool count mismatch detected.</div>
          </div>
        ) : activeTab === 'eval' ? (
          <div className="p-3 rounded bg-[#0e111a] border border-slate-800 space-y-2 font-mono text-xs">
            <div>MiniLM Similarity: <span className="text-slate-200">0.241</span> (Threshold: 0.70)</div>
            <div>DeBERTa Contradiction: <span className="text-rose-400 font-bold">0.985</span></div>
            <div>Composite Risk: <span className="text-rose-400 font-bold">0.920 (HIGH_RISK)</span></div>
          </div>
        ) : (
          <div className="p-3 rounded bg-[#0e111a] border border-slate-800 space-y-2 font-mono text-xs">
            <div>Centroid Distance: <span className="text-amber-400 font-bold">0.420</span></div>
            <div>Agent Stability Index (ASI): <span className="text-amber-400 font-bold">48/100</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 5. Incident Inbox & Trace Curation Modal ──────────────────────────

function IncidentInboxView({
  alerts, onCurateTrace
}: {
  alerts: AlertItem[];
  onCurateTrace: (al: AlertItem) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Incident Inbox</h2>
        <p className="text-xs text-slate-400">Storm-suppressed anomalies, grounding contradictions & tool mismatches</p>
      </div>

      <div className="bg-[#11141f] border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-xs font-mono text-left">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800 bg-[#0e111a]">
              <th className="p-3">Severity</th>
              <th className="p-3">Type</th>
              <th className="p-3">Agent</th>
              <th className="p-3">Trace ID</th>
              <th className="p-3">Message</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-500">
                  No active incidents recorded.
                </td>
              </tr>
            ) : (
              alerts.map((al) => (
                <tr key={al.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      al.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {al.severity}
                    </span>
                  </td>
                  <td className="p-3 font-semibold text-slate-200">{al.alert_type}</td>
                  <td className="p-3 text-indigo-400 capitalize">@{al.agent_id}</td>
                  <td className="p-3 text-slate-400">{al.trace_id?.slice(0, 12)}...</td>
                  <td className="p-3 text-slate-300 font-sans truncate max-w-md">{al.message}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => onCurateTrace(al)}
                      className="px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <BookmarkCheck className="w-3 h-3" />
                      <span>Curate Case</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 6. Curate Case Modal ──────────────────────────────────────────────

function CurateCaseModal({
  isOpen, alert, onClose, onSave
}: {
  isOpen: boolean;
  alert: AlertItem | null;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}) {
  const [caseId, setCaseId] = useState('');
  const [query, setQuery] = useState('');
  const [claim, setClaim] = useState('');
  const [evidence, setEvidence] = useState('');
  const [classification, setClassification] = useState('CONTRADICTED');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (alert) {
      setCaseId(`curated_${alert.trace_id?.slice(0, 8) || 'trace'}_${Date.now().toString().slice(-4)}`);
      setQuery('Multi-agent LLM query');
      setClaim(alert.message);
      setEvidence('Verified reference premise context');
      setClassification('CONTRADICTED');
      setNotes(`Curated by operator from Incident #${alert.id} (${alert.alert_type})`);
    }
  }, [alert]);

  if (!isOpen || !alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        case_id: caseId,
        input_query: query,
        agent_claim: claim,
        evidence: evidence,
        expected_classification: classification,
        expected_failure_type: alert.alert_type,
        is_failure: classification !== 'SUPPORTED',
        trace_id: alert.trace_id,
        span_id: alert.span_id,
        domain: 'production_incident',
        operator_notes: notes,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#11141f] border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-slate-100 font-sans">Curate Incident into Dataset</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-mono">
          <div>
            <label className="text-slate-400 block mb-1">Case ID</label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="w-full bg-[#090b10] border border-slate-800 rounded px-3 py-1.5 text-slate-200"
              required
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Agent Claim</label>
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={2}
              className="w-full bg-[#090b10] border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-sans"
              required
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Source Evidence</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              className="w-full bg-[#090b10] border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Classification</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className="w-full bg-[#090b10] border border-slate-800 rounded px-3 py-1.5 text-slate-200"
              >
                <option value="SUPPORTED">SUPPORTED</option>
                <option value="UNSUPPORTED">UNSUPPORTED</option>
                <option value="CONTRADICTED">CONTRADICTED</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Target Dataset</label>
              <input
                type="text"
                value="v1.0_curated"
                disabled
                className="w-full bg-[#090b10]/60 border border-slate-800 rounded px-3 py-1.5 text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Operator Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#090b10] border border-slate-800 rounded px-3 py-1.5 text-slate-200"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
            >
              {saving ? 'Curating...' : 'Save to Dataset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 7. Experiments View ───────────────────────────────────────────────

function ExperimentsView() {
  const strategyData = [
    { strategy: 'DIRECT', risk: 0.309, contraRate: 0.375, latency: 0.06, tokensIn: 34, tokensOut: 11 },
    { strategy: 'COT', risk: 0.163, contraRate: 0.250, latency: 0.05, tokensIn: 66, tokensOut: 12 },
    { strategy: 'AOT', risk: 0.363, contraRate: 0.375, latency: 0.15, tokensIn: 352, tokensOut: 87 },
  ];

  const baselinesData = [
    { name: 'Baseline A (No Semantic)', precision: '0.000', recall: '0.000', f1: '0.000', fpr: '0.000', fnr: '1.000', lat: '0.00ms' },
    { name: 'Baseline B (Sampled 25%)', precision: '0.000', recall: '0.000', f1: '0.000', fpr: '0.000', fnr: '1.000', lat: '53.89ms' },
    { name: 'Baseline C (Embedding Only)', precision: '0.833', recall: '1.000', f1: '0.909', fpr: '0.333', fnr: '0.000', lat: '21.13ms' },
    { name: 'Baseline D (NLI Without Drift)', precision: '1.000', recall: '0.600', f1: '0.750', fpr: '0.000', fnr: '0.400', lat: '70.57ms' },
    { name: 'AgentPulse (Full Cascade)', precision: '1.000', recall: '0.200', f1: '0.333', fpr: '0.000', fnr: '0.800', lat: '89.45ms' },
  ];

  const compoundingNodes = [
    { node: 'Node A (Planner)', risk: 0.335, status: 'healthy' },
    { node: 'Node B (Injected Fault)', risk: 1.000, status: 'critical' },
    { node: 'Node C (Verifier)', risk: 0.003, status: 'healthy' },
    { node: 'Node D (Analyst)', risk: 0.003, status: 'healthy' },
    { node: 'Node E (Writer)', risk: 0.003, status: 'healthy' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Reproducible Experiments & Benchmarks</h2>
        <p className="text-xs text-slate-400">Comparative evaluations of reasoning strategies (Direct vs CoT vs AoT) and baseline systems</p>
      </div>

      {/* Strategy Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {strategyData.map((s) => (
          <div key={s.strategy} className="bg-[#11141f] border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-sm text-slate-100 font-mono">{s.strategy} Strategy</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                Qwen 2.5 7B
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-500 text-[10px] block">MEAN RISK</span>
                <span className="font-bold text-slate-200">{s.risk.toFixed(3)}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">CONTRA RATE</span>
                <span className="font-bold text-rose-400">{(s.contraRate * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">AVG TOKENS IN</span>
                <span className="font-bold text-slate-200">{s.tokensIn}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">AVG TOKENS OUT</span>
                <span className="font-bold text-slate-200">{s.tokensOut}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Baselines Table */}
      <div className="bg-[#11141f] border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 font-sans">Baselines vs. AgentPulse Evaluation (v1.0_test)</h3>
        </div>
        <table className="w-full text-xs font-mono text-left">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800 bg-[#0e111a]">
              <th className="p-3">System / Baseline</th>
              <th className="p-3 text-center">Precision</th>
              <th className="p-3 text-center">Recall</th>
              <th className="p-3 text-center">F1-Score</th>
              <th className="p-3 text-center">FPR</th>
              <th className="p-3 text-center">FNR</th>
              <th className="p-3 text-right">Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {baselinesData.map((b, i) => (
              <tr key={b.name} className={i === baselinesData.length - 1 ? 'bg-indigo-950/20 font-bold' : ''}>
                <td className="p-3 text-slate-200">{b.name}</td>
                <td className="p-3 text-center text-emerald-400">{b.precision}</td>
                <td className="p-3 text-center text-indigo-400">{b.recall}</td>
                <td className="p-3 text-center text-slate-200">{b.f1}</td>
                <td className="p-3 text-center text-slate-400">{b.fpr}</td>
                <td className="p-3 text-center text-slate-400">{b.fnr}</td>
                <td className="p-3 text-right text-slate-300">{b.lat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5-Node Compounding Error Section */}
      <div className="bg-[#11141f] border border-slate-800 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 font-sans">5-Node Compounding Error Downstream Propagation</h3>
          <p className="text-xs text-slate-400">Observes how an injected ungrounded claim at Node B is mitigated by downstream verifiers</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
          {compoundingNodes.map((cn) => (
            <div key={cn.node} className="p-3 rounded border border-slate-800 bg-[#0e111a] space-y-1.5 font-mono text-xs">
              <span className="text-[10px] text-slate-500 block truncate">{cn.node}</span>
              <RiskScorePill score={cn.risk} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 8. Datasets View ──────────────────────────────────────────────────

function DatasetsView() {
  const datasets = [
    { version: 'v1.0_dev', split: 'dev', cases: 5, domain: 'Research & Support' },
    { version: 'v1.0_val', split: 'val', cases: 5, domain: 'Diagnostics & Telemetry' },
    { version: 'v1.0_test', split: 'test', cases: 8, domain: 'Multi-Agent Benchmark' },
    { version: 'v1.0_curated', split: 'production', cases: 1, domain: 'Curated Production Incidents' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Versioned Evaluation Datasets</h2>
        <p className="text-xs text-slate-400">Standardized ground-truth test splits with human inter-annotator agreement</p>
      </div>

      {/* Reliability Banner */}
      <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
        <div>
          <span className="text-xs font-mono font-bold text-emerald-400 block">HUMAN ANNOTATION RELIABILITY</span>
          <p className="text-xs text-slate-300 font-sans mt-0.5">
            Inter-Annotator Agreement: <span className="font-bold font-mono text-emerald-300">Cohen's Kappa κ = 1.00</span> across dev, val, and test splits.
          </p>
        </div>
        <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
          GOLD STANDARD
        </span>
      </div>

      {/* Dataset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {datasets.map((d) => (
          <div key={d.version} className="bg-[#11141f] border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-100 font-mono">{d.version}</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {d.split}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400">Total Cases: <span className="text-slate-200 font-bold">{d.cases}</span></div>
            <div className="text-xs text-slate-500 font-sans">{d.domain}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 9. Incident Replay Trace Debugger ──────────────────────────────────

const SAMPLE_REPLAY_STEPS: IncidentStep[] = [
  { timeOffset: 0.0, timeLabel: 'T+00.0s', agent: 'researcher', role: 'Query Planner', status: 'healthy', riskScore: 0.04, event: 'Decomposed user goal into 3 sub-queries.' },
  { timeOffset: 0.8, timeLabel: 'T+00.8s', agent: 'retriever', role: 'Paper Indexer', status: 'healthy', riskScore: 0.08, event: 'Queried academic index; fetched 3 abstracts.', toolUsed: 'academic_search_api' },
  { timeOffset: 1.5, timeLabel: 'T+01.5s', agent: 'verifier', role: 'Claim Verifier', status: 'critical', riskScore: 0.92, event: 'Citation verification discrepancy against retrieved corpus.', evidence: 'Contradiction: Claim cites Zhang (2024), absent from index.' },
  { timeOffset: 2.2, timeLabel: 'T+02.2s', agent: 'analyst', role: 'Synthesis Engine', status: 'critical', riskScore: 0.98, event: 'Downstream hallucination amplification.', evidence: 'Ungrounded synthesis of quantum consciousness claims.' },
  { timeOffset: 3.4, timeLabel: 'T+03.4s', agent: 'writer', role: 'Report Author', status: 'critical', riskScore: 0.95, event: 'Report generated containing fabricated claims.', evidence: 'Final synthesis failed grounding verification.' },
];

function IncidentReplayDebugger() {
  const [currentStepIdx, setCurrentStepIdx] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const step = SAMPLE_REPLAY_STEPS[currentStepIdx];

  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= SAMPLE_REPLAY_STEPS.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1400 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Time-Scrub Incident Replay Debugger</h2>
        <p className="text-xs text-slate-400">Step-by-step causal investigation of failure propagation across agent DAG nodes</p>
      </div>

      {/* Control Bar */}
      <div className="bg-[#11141f] border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStepIdx(Math.max(0, currentStepIdx - 1))}
              disabled={currentStepIdx === 0}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
            </button>
            <button
              onClick={() => setCurrentStepIdx(Math.min(SAMPLE_REPLAY_STEPS.length - 1, currentStepIdx + 1))}
              disabled={currentStepIdx === SAMPLE_REPLAY_STEPS.length - 1}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span>SPEED:</span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-2 py-0.5 rounded text-[11px] ${playbackSpeed === s ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-400'}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Step Track */}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {SAMPLE_REPLAY_STEPS.map((s, idx) => (
            <div
              key={s.agent}
              onClick={() => setCurrentStepIdx(idx)}
              className={`p-2.5 rounded border text-left cursor-pointer transition-colors ${
                idx === currentStepIdx
                  ? 'border-indigo-500 bg-slate-800'
                  : idx < currentStepIdx
                    ? 'border-slate-800 bg-[#0e111a] opacity-80'
                    : 'border-slate-800/60 bg-[#0e111a]/40 opacity-40'
              }`}
            >
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>{s.timeLabel}</span>
                <StatusBadge status={s.status} />
              </div>
              <div className="font-mono font-bold text-slate-200 text-xs mt-1 capitalize">@{s.agent}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Step Detail Card */}
      <div className="bg-[#11141f] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold">
                STEP 0{currentStepIdx + 1} / 05
              </span>
              <h3 className="text-sm font-bold text-slate-100 font-mono capitalize">
                @{step.agent} ({step.role})
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">TIME OFFSET: {step.timeLabel}</p>
          </div>
          <RiskScorePill score={step.riskScore} label="Risk" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 rounded bg-[#0e111a] border border-slate-800 space-y-1.5">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Observed Node Action</span>
            <p className="text-slate-200 font-sans text-xs leading-relaxed">{step.event}</p>
            {step.toolUsed && (
              <p className="text-cyan-400 text-xs pt-1">🔧 Tool Call: <span className="font-bold">{step.toolUsed}</span></p>
            )}
          </div>

          <div className={`p-3 rounded border space-y-1.5 ${
            step.evidence ? 'bg-rose-950/20 border-rose-500/30 text-rose-200' : 'bg-[#0e111a] border-slate-800 text-slate-400'
          }`}>
            <span className="text-[10px] uppercase font-bold">Evidence & Grounding Flag</span>
            <p className="font-sans text-xs leading-relaxed">{step.evidence || 'No grounding or contradiction flags observed on this step.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 10. Drift Center View ─────────────────────────────────────────────

function DriftCenterView({ agents }: { agents: Agent[] }) {
  const driftTimelineData = [
    { span: 'T-40', baseline: 0.10, current: 0.11, threshold: 0.30 },
    { span: 'T-30', baseline: 0.10, current: 0.12, threshold: 0.30 },
    { span: 'T-20', baseline: 0.10, current: 0.15, threshold: 0.30 },
    { span: 'T-10', baseline: 0.10, current: 0.28, threshold: 0.30 },
    { span: 'T-00', baseline: 0.10, current: 0.42, threshold: 0.30 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Agent Drift & Stability Radar</h2>
        <p className="text-xs text-slate-400">Embedding centroid shifts, tool entropy changes & Agent Stability Index (ASI)</p>
      </div>

      <div className="bg-[#11141f] border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-100 font-sans">Centroid Distance Shift vs. Threshold (0.30)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={driftTimelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="span" stroke="#64748b" textAnchor="middle" />
              <YAxis stroke="#64748b" domain={[0, 0.6]} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
              <ReferenceLine y={0.30} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: 'Drift Threshold (0.30)', fill: '#f43f5e', fontSize: 10 }} />
              <Line type="monotone" dataKey="current" stroke="#818cf8" strokeWidth={2} name="Current Centroid Dist" />
              <Line type="monotone" dataKey="baseline" stroke="#10b981" strokeWidth={1.5} strokeDasharray="3 3" name="Baseline" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── 11. Telemetry Lab Studio ──────────────────────────────────────────

function TelemetryLabStudio({
  onRunScenario, isRunning
}: {
  onRunScenario: (scenario: string) => Promise<void>;
  isRunning: boolean;
}) {
  const scenarios = [
    { id: 'clean', title: 'Clean Grounded Pipeline', desc: 'Runs normal compliant retrieval & synthesis with 0 grounding flags.' },
    { id: 'hallucination', title: 'Hallucination & Count Drift', desc: 'Simulates ungrounded claims and tool count discrepancies.' },
    { id: 'tool_mismatch', title: 'Tool Claim Contradiction', desc: 'Simulates fabricated tool arguments & execution mismatch.' },
    { id: 'disagreement', title: 'Inter-Agent Contradiction', desc: 'Simulates diametrically opposed assertions between Verifier and Analyst.' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Telemetry Simulation Lab</h2>
        <p className="text-xs text-slate-400">Inject controlled synthetic anomaly workloads to test detection triggers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((sc) => (
          <div key={sc.id} className="bg-[#11141f] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 font-sans">{sc.title}</h3>
              <p className="text-xs text-slate-400 font-sans mt-1 leading-relaxed">{sc.desc}</p>
            </div>
            <button
              onClick={() => onRunScenario(sc.id)}
              disabled={isRunning}
              className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isRunning ? 'Injecting Traces...' : 'Trigger Scenario'}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 12. Command Palette Modal ─────────────────────────────────────────

function CommandPalette({
  isOpen, onClose, onSelectAction
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (id: string) => void;
}) {
  const [search, setSearch] = useState('');

  const actions = [
    { id: 'nav-overview', label: 'Navigate: Overview Control Plane', category: 'Navigation' },
    { id: 'nav-traces', label: 'Navigate: Execution Traces', category: 'Navigation' },
    { id: 'nav-incidents', label: 'Navigate: Incident Inbox', category: 'Navigation' },
    { id: 'nav-replay', label: 'Navigate: Incident Replay Debugger', category: 'Navigation' },
    { id: 'nav-drift', label: 'Navigate: Drift & Stability Matrix', category: 'Navigation' },
    { id: 'nav-experiments', label: 'Navigate: Experiments & Benchmarks', category: 'Navigation' },
    { id: 'nav-datasets', label: 'Navigate: Datasets & Annotation', category: 'Navigation' },
    { id: 'sim-hallucination', label: 'Simulate: Inject Hallucination Anomaly', category: 'Simulation' },
    { id: 'sim-clean', label: 'Simulate: Run Clean Trace', category: 'Simulation' },
  ];

  const filtered = actions.filter(a => a.label.toLowerCase().includes(search.toLowerCase()));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 p-4">
      <div className="bg-[#11141f] border border-slate-800 rounded-xl max-w-lg w-full p-4 space-y-3 shadow-2xl">
        <div className="flex items-center gap-2.5 px-3 py-2 bg-[#090b10] border border-slate-800 rounded-lg">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Type a command or search actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="bg-transparent text-slate-200 text-xs font-mono outline-none w-full"
          />
          <kbd className="text-[10px] font-mono text-slate-500">ESC</kbd>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => { onSelectAction(a.id); onClose(); }}
              className="w-full text-left px-3 py-2 rounded text-xs font-mono text-slate-300 hover:bg-indigo-600 hover:text-white flex items-center justify-between transition-colors"
            >
              <span>{a.label}</span>
              <span className="text-[10px] text-slate-500 uppercase">{a.category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Application Container ────────────────────────────────────────

export function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('overview');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>('verifier');
  const [selectedSpan, setSelectedSpan] = useState<WaterfallSpan | null>(SAMPLE_WATERFALL_SPANS[2]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isRunningLab, setIsRunningLab] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<ReasoningStrategy>('ALL');

  // Curate Modal
  const [curatingAlert, setCuratingAlert] = useState<AlertItem | null>(null);

  // Live Data
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const wsUrl =
    import.meta.env.VITE_WS_URL ||
    (import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') + '/v1/ws'
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/v1/ws`);
  const { lastMessage, isConnected } = useWebSocket(wsUrl);

  const loadData = useCallback(async () => {
    try {
      const [m, a, t, al] = await Promise.all([
        api.getMetrics(),
        api.getAgents(),
        api.getTraces(50),
        api.getAlerts(50),
      ]);
      setMetrics(m);
      setAgents(a.agents);
      setTraces(t.traces);
      setAlerts(al.alerts);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, [loadData]);
  useEffect(() => { if (lastMessage) loadData(); }, [lastMessage, loadData]);

  // Keyboard shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRunScenario = async (scenario: string) => {
    setIsRunningLab(true);
    try {
      await api.simulatePipeline(scenario, 'Multimodal agent reasoning');
      setTimeout(() => {
        loadData();
        setIsRunningLab(false);
      }, 1200);
    } catch (e) {
      console.error(e);
      setIsRunningLab(false);
    }
  };

  const handleCommandPaletteAction = (actionId: string) => {
    if (actionId === 'nav-overview') setCurrentPage('overview');
    else if (actionId === 'nav-traces') setCurrentPage('traces');
    else if (actionId === 'nav-incidents') setCurrentPage('incidents');
    else if (actionId === 'nav-replay') setCurrentPage('incident-replay');
    else if (actionId === 'nav-drift') setCurrentPage('drift');
    else if (actionId === 'nav-experiments') setCurrentPage('experiments');
    else if (actionId === 'nav-datasets') setCurrentPage('datasets');
    else if (actionId === 'sim-hallucination') handleRunScenario('hallucination');
    else if (actionId === 'sim-clean') handleRunScenario('clean');
  };

  const handleSaveCuratedCase = async (payload: any) => {
    await api.curateCase('v1.0_curated', payload);
  };

  const openIncidentsCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#090b10] text-slate-200 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top App Bar & Compact Health Strip */}
      <TopControlBar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        metrics={metrics}
        agents={agents}
        openIncidentsCount={openIncidentsCount}
        isConnected={isConnected}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        activeStrategy={activeStrategy}
        onSelectStrategy={setActiveStrategy}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {currentPage === 'overview' ? (
          <div className="space-y-6">
            <AgentTopologySection
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => setSelectedAgentId(id)}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TraceWaterfallSection
                  selectedSpanId={selectedSpan?.id}
                  onSelectSpan={(span) => setSelectedSpan(span)}
                />
              </div>

              <div className="lg:col-span-1">
                <EvidenceInspectorPanel selectedSpan={selectedSpan} />
              </div>
            </div>
          </div>
        ) : currentPage === 'traces' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-sans tracking-tight">Execution Traces</h2>
              <p className="text-xs text-slate-400">Multi-agent execution sessions and grounding audits</p>
            </div>

            <div className="bg-[#11141f] border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800 bg-[#0e111a]">
                    <th className="p-3">Trace ID</th>
                    <th className="p-3">Pipeline</th>
                    <th className="p-3 text-center">Spans</th>
                    <th className="p-3 text-center">Risk Score</th>
                    <th className="p-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {traces.map((t) => (
                    <tr key={t.trace_id} className="hover:bg-slate-800/40 cursor-pointer">
                      <td className="p-3 text-indigo-400 font-bold">{t.trace_id}</td>
                      <td className="p-3 text-slate-300">{t.pipeline_id || 'research_pipeline'}</td>
                      <td className="p-3 text-center text-slate-200">{t.total_spans}</td>
                      <td className="p-3 text-center"><RiskScorePill score={t.overall_risk_score} /></td>
                      <td className="p-3 text-right text-slate-500">{new Date(t.start_time).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : currentPage === 'incidents' ? (
          <IncidentInboxView
            alerts={alerts}
            onCurateTrace={(al) => setCuratingAlert(al)}
          />
        ) : currentPage === 'incident-replay' ? (
          <IncidentReplayDebugger />
        ) : currentPage === 'drift' ? (
          <DriftCenterView agents={agents} />
        ) : currentPage === 'experiments' ? (
          <ExperimentsView />
        ) : currentPage === 'datasets' ? (
          <DatasetsView />
        ) : currentPage === 'telemetry-lab' ? (
          <TelemetryLabStudio onRunScenario={handleRunScenario} isRunning={isRunningLab} />
        ) : null}
      </main>

      {/* Trace Curation Modal */}
      <CurateCaseModal
        isOpen={curatingAlert !== null}
        alert={curatingAlert}
        onClose={() => setCuratingAlert(null)}
        onSave={handleSaveCuratedCase}
      />

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={handleCommandPaletteAction}
      />
    </div>
  );
}

export default App;
