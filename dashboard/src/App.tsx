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
  Database, FlaskConical, PlusCircle, BookmarkCheck, ArrowUpRight, Route, Wrench
} from 'lucide-react';
import { SideRail, type NavPage } from './components/SideRail';
import {
  cx, Tile, TileHead, Eyebrow, SectionHead, StatusBadge, RiskPill,
  Meter, Stat, EmptyState, riskTone,
} from './components/ui';

// ─── Types & Enums ─────────────────────────────────────────────────────

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

// StatusBadge and RiskPill now live in components/ui.tsx so the semantic
// risk thresholds have a single definition shared across every view.
const RiskScorePill = RiskPill;

// ─── 1. Global Navigation & Compact Health Strip ────────────────────────

function TopBar({
  title, sub, metrics, agents, openIncidentsCount, activeStrategy, onSelectStrategy,
}: {
  title: string;
  sub: string;
  metrics: Metrics | null;
  agents: Agent[];
  openIncidentsCount: number;
  activeStrategy: ReasoningStrategy;
  onSelectStrategy: (s: ReasoningStrategy) => void;
}) {
  const avgRisk = metrics?.avg_risk_score ?? 0;
  const avgAsi = agents.length > 0
    ? agents.reduce((acc, a) => acc + (a.current_asi ?? 100), 0) / agents.length
    : 100;

  return (
    <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-md border-b border-line">
      <div className="h-14 px-6 flex items-center justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-tight text-ink truncate">{title}</h1>
          <p className="text-2xs font-mono text-ink-faint truncate">{sub}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Eyebrow className="hidden lg:inline">Strategy</Eyebrow>
          <div className="flex items-center gap-0.5 p-0.5 rounded border border-line bg-surface-2">
            {(['ALL', 'DIRECT', 'COT', 'AOT'] as ReasoningStrategy[]).map((s) => (
              <button
                key={s}
                onClick={() => onSelectStrategy(s)}
                aria-pressed={activeStrategy === s}
                className={cx(
                  'px-2 py-1 rounded text-2xs font-mono font-semibold cursor-pointer transition-colors',
                  activeStrategy === s
                    ? 'bg-signal/15 text-signal'
                    : 'text-ink-faint hover:text-ink-dim',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fleet readout strip */}
      <div className="px-6 py-2 border-t border-line/70 flex flex-wrap items-center gap-x-7 gap-y-1.5">
        <Readout label="Agents" value={String(agents.length)} />
        <Readout label="Traces" value={String(metrics?.total_traces ?? 0)} />
        <Readout
          label="Composite risk"
          value={avgRisk.toFixed(3)}
          tone={avgRisk > 0.7 ? 'bad' : avgRisk > 0.4 ? 'warn' : 'ok'}
        />
        <Readout
          label="System ASI"
          value={`${avgAsi.toFixed(0)}/100`}
          tone={avgAsi >= 70 ? 'ok' : 'warn'}
        />
        <Readout
          label="Open incidents"
          value={String(openIncidentsCount)}
          tone={openIncidentsCount > 0 ? 'bad' : undefined}
        />
        <div className="ml-auto text-2xs font-mono text-ink-faint">
          EVALUATOR <span className="text-ink-dim">DeBERTa-v3 + MiniLM cascade</span>
        </div>
      </div>
    </header>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneCls = tone === 'bad' ? 'text-state-bad' : tone === 'warn' ? 'text-state-warn' : tone === 'ok' ? 'text-state-ok' : 'text-ink';
  return (
    <div className="flex items-center gap-2">
      <Eyebrow>{label}</Eyebrow>
      <span className={cx('font-mono text-xs font-semibold tnum', toneCls)}>{value}</span>
    </div>
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
    <Tile className="p-4" hover={false} index={4}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight">Agent Execution Topology</h2>
          <p className="text-xs text-ink-dim mt-0.5">
            Live DAG pipeline with risk propagation and agent stability index
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3.5 shrink-0">
          {[
            { c: 'bg-state-ok', l: 'ASI ≥ 70' },
            { c: 'bg-state-warn', l: 'ASI 50–69' },
            { c: 'bg-state-bad', l: 'ASI < 50' },
          ].map((k) => (
            <span key={k.l} className="flex items-center gap-1.5">
              <span className={cx('w-1.5 h-1.5 rounded-full', k.c)} aria-hidden="true" />
              <Eyebrow>{k.l}</Eyebrow>
            </span>
          ))}
        </div>
      </div>

      {/* DAG flow. Chevrons between nodes convey execution direction, which a
          plain grid of cards does not. */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
        {TOPOLOGY_NODES.map((node, index) => {
          const liveAgent = agentMap.get(node.id);
          const isSelected = selectedAgentId === node.id;
          const asi = liveAgent?.current_asi ?? 98.4;
          const risk = liveAgent?.avg_risk_score ?? 0.04;
          const spansCount = liveAgent?.total_spans ?? 24;
          const status = asi < 50 ? 'critical' : asi < 70 ? 'watch' : 'healthy';

          return (
            <button
              key={node.id}
              onClick={() => onSelectAgent(node.id)}
              aria-pressed={isSelected}
              className={cx(
                'relative tile bracket p-3 text-left cursor-pointer',
                isSelected ? 'tile-active bracket-on' : 'tile-hover',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <Eyebrow>Node {String(index + 1).padStart(2, '0')}</Eyebrow>
                <StatusBadge status={status} />
              </div>

              <div className="text-[13px] font-semibold text-ink leading-tight">{node.name}</div>
              <div className="text-2xs font-mono text-ink-faint mt-0.5">{node.role}</div>

              <div className="mt-3 pt-2.5 border-t border-line grid grid-cols-3 gap-1">
                <div>
                  <Eyebrow>ASI</Eyebrow>
                  <div className={cx(
                    'font-mono text-xs font-semibold tnum mt-0.5',
                    asi >= 70 ? 'text-state-ok' : asi >= 50 ? 'text-state-warn' : 'text-state-bad',
                  )}>
                    {asi.toFixed(0)}
                  </div>
                </div>
                <div>
                  <Eyebrow>Risk</Eyebrow>
                  <div className={cx(
                    'font-mono text-xs font-semibold tnum mt-0.5',
                    risk > 0.7 ? 'text-state-bad' : risk > 0.4 ? 'text-state-warn' : 'text-ink-dim',
                  )}>
                    {risk.toFixed(2)}
                  </div>
                </div>
                <div>
                  <Eyebrow>Spans</Eyebrow>
                  <div className="font-mono text-xs font-semibold tnum mt-0.5 text-ink-dim">{spansCount}</div>
                </div>
              </div>

              <Meter value={risk} className="mt-2.5" />
            </button>
          );
        })}
      </div>
    </Tile>
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
    <Tile className="p-4" hover={false} index={5}>
      <div className="flex items-center justify-between gap-4 pb-2.5 mb-2.5 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight">Active Trace Waterfall</h2>
          <p className="text-2xs font-mono text-ink-faint mt-0.5">
            TRACE <span className="text-signal">tr_e2e_research_48821</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <Eyebrow>Total duration</Eyebrow>
          <div className="font-mono text-xs font-semibold tnum text-ink">483ms</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {SAMPLE_WATERFALL_SPANS.map((span) => {
          const leftPercent = (span.startMs / totalDuration) * 100;
          const widthPercent = Math.max((span.durationMs / totalDuration) * 100, 3);
          const isSelected = selectedSpanId === span.id;
          const barColor =
            span.riskScore > 0.7 ? 'bg-state-bad'
              : span.riskScore > 0.4 ? 'bg-state-warn'
                : 'bg-state-ok';

          return (
            <button
              key={span.id}
              onClick={() => onSelectSpan(span)}
              aria-pressed={isSelected}
              className={cx(
                'w-full tile p-2.5 text-left cursor-pointer',
                isSelected ? 'tile-active' : 'tile-hover',
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-semibold text-ink capitalize truncate">
                    @{span.agent}
                  </span>
                  <span className="text-2xs font-mono text-ink-faint truncate">{span.role}</span>
                  {span.toolUsed && (
                    <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded border border-signal/25 bg-signal/10 text-signal text-2xs font-mono">
                      <Wrench className="w-2.5 h-2.5" aria-hidden="true" />
                      {span.toolUsed}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="font-mono text-2xs tnum text-ink-faint">{span.durationMs}ms</span>
                  <RiskScorePill score={span.riskScore} />
                </div>
              </div>

              {/* Timeline bar positioned along the trace's total duration */}
              <div className="w-full h-1.5 rounded-full bg-surface-3 relative overflow-hidden">
                <div
                  className={cx('absolute top-0 bottom-0 rounded-full', barColor)}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </Tile>
  );
}

// ─── 4. Evidence Inspector Panel (Side-by-Side Dual Pane) ──────────────

function EvidenceInspectorPanel({ selectedSpan }: { selectedSpan?: WaterfallSpan | null }) {
  const [activeTab, setActiveTab] = useState<'evidence' | 'tools' | 'eval' | 'drift' | 'meta'>('evidence');

  return (
    <Tile className="p-4 flex flex-col h-full space-y-4" hover={false} index={6}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink tracking-tight">Evidence &amp; Grounding Inspector</h2>
          <Eyebrow>{selectedSpan?.id || 'sp-03'}</Eyebrow>
        </div>
        <p className="text-xs text-ink-dim mt-0.5">Verifies model claims against source premise documents</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-line text-xs font-mono">
        <button
          onClick={() => setActiveTab('evidence')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'evidence' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Evidence
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'tools' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => setActiveTab('eval')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'eval' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Eval Cascade
        </button>
        <button
          onClick={() => setActiveTab('drift')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'drift' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Drift Signal
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto space-y-3 text-xs">
        {activeTab === 'evidence' ? (
          <div className="space-y-3">
            <div className="tile p-3 space-y-1">
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
          <div className="tile p-3 space-y-2 font-mono text-xs">
            <div className="text-ink-dim">Tool name: <span className="text-signal font-semibold">support_kb_search</span></div>
            <div className="text-ink-dim">
              Claimed count: <span className="text-state-bad font-semibold tnum">14</span>
              {' · '}Actual returned: <span className="text-state-ok font-semibold tnum">3</span>
            </div>
            <div className="text-slate-500 text-[11px]">Verdict: Deterministic tool count mismatch detected.</div>
          </div>
        ) : activeTab === 'eval' ? (
          <div className="tile p-3 space-y-2 font-mono text-xs">
            <div>MiniLM Similarity: <span className="text-slate-200">0.241</span> (Threshold: 0.70)</div>
            <div>DeBERTa Contradiction: <span className="text-rose-400 font-bold">0.985</span></div>
            <div>Composite Risk: <span className="text-rose-400 font-bold">0.920 (HIGH_RISK)</span></div>
          </div>
        ) : (
          <div className="tile p-3 space-y-2 font-mono text-xs">
            <div>Centroid Distance: <span className="text-amber-400 font-bold">0.420</span></div>
            <div>Agent Stability Index (ASI): <span className="text-amber-400 font-bold">48/100</span></div>
          </div>
        )}
      </div>
    </Tile>
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
    <div>
      <SectionHead
        title="Incident Inbox"
        sub="Storm-suppressed anomalies, grounding contradictions and tool mismatches"
        right={<Eyebrow>{alerts.length} alerts</Eyebrow>}
      />

      <Tile className="overflow-hidden" hover={false} index={0}>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-7 h-7" />}
            title="No active incidents"
            hint="Alerts raised by the evaluator appear here for triage and can be curated into the evaluation dataset."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Severity</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Type</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Agent</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Trace</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Message</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal text-right"><Eyebrow>Actions</Eyebrow></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {alerts.map((al) => (
                  <tr key={al.id} className="hover:bg-surface-3/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={cx(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-2xs font-mono font-medium',
                        al.severity === 'HIGH'
                          ? 'bg-state-bad/10 text-state-bad border-state-bad/25'
                          : 'bg-state-warn/10 text-state-warn border-state-warn/25',
                      )}>
                        <span className={cx(
                          'w-1.5 h-1.5 rounded-full',
                          al.severity === 'HIGH' ? 'bg-state-bad' : 'bg-state-warn',
                        )} aria-hidden="true" />
                        {al.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink">{al.alert_type}</td>
                    <td className="px-4 py-2.5 font-mono text-signal capitalize">@{al.agent_id}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-faint">{al.trace_id?.slice(0, 12)}…</td>
                    <td className="px-4 py-2.5 text-ink-dim max-w-md truncate">{al.message}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => onCurateTrace(al)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-signal/30 bg-signal/10 text-signal hover:bg-signal/20 text-2xs font-mono font-semibold transition-colors cursor-pointer"
                      >
                        <BookmarkCheck className="w-3 h-3" aria-hidden="true" />
                        Curate case
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
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
    <div
      className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Curate incident into dataset"
        onClick={(e) => e.stopPropagation()}
        className="tile bracket-on max-w-lg w-full p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-signal" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink tracking-tight">Curate Incident into Dataset</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-faint hover:text-ink cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-mono">
          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">Case ID</label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">Agent Claim</label>
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={2}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors font-sans"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">Source Evidence</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">Classification</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              >
                <option value="SUPPORTED">SUPPORTED</option>
                <option value="UNSUPPORTED">UNSUPPORTED</option>
                <option value="CONTRADICTED">CONTRADICTED</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">Target Dataset</label>
              <input
                type="text"
                value="v1.0_curated"
                disabled
                className="w-full bg-surface/60 border border-line rounded px-3 py-1.5 text-ink-faint cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">Operator Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-line bg-surface-2 text-ink-dim hover:text-ink hover:border-line-strong cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded border border-signal/35 bg-signal/15 hover:bg-signal/25 text-signal font-semibold disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {saving ? 'Curating…' : 'Save to dataset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 7. Experiments View ───────────────────────────────────────────────

function ExperimentsView() {
  // Values below are the measured results committed in experiments/results/*.json.
  // They are a static snapshot of the last recorded run, not live figures --
  // an earlier version of this view showed sub-millisecond latencies that came
  // from a deterministic fallback generator rather than real model inference.
  const strategyData = [
    { strategy: 'DIRECT', risk: 0.424, contraRate: 0.133, latencyMs: 11564.1, tokensIn: 53.1, tokensOut: 37.5 },
    { strategy: 'COT', risk: 0.283, contraRate: 0.127, latencyMs: 45422.7, tokensIn: 88.1, tokensOut: 186.4 },
    { strategy: 'AOT', risk: 0.233, contraRate: 0.000, latencyMs: 85215.2, tokensIn: 543.4, tokensOut: 319.7 },
  ];

  const baselinesData = [
    { name: 'A — MiniLM embedding only', precision: '0.733', recall: '0.846', f1: '0.786', fpr: '0.235', fnr: '0.154', lat: '27.8ms' },
    { name: 'B — DeBERTa NLI only', precision: '0.929', recall: '1.000', f1: '0.963', fpr: '0.059', fnr: '0.000', lat: '188.1ms' },
    { name: 'C — MiniLM + DeBERTa cascade', precision: '0.929', recall: '1.000', f1: '0.963', fpr: '0.059', fnr: '0.000', lat: '215.9ms' },
    { name: 'D — NLI + tool-claim validation', precision: '0.929', recall: '1.000', f1: '0.963', fpr: '0.059', fnr: '0.000', lat: '188.1ms' },
    { name: 'E — NLI + inter-agent disagreement', precision: '0.929', recall: '1.000', f1: '0.963', fpr: '0.059', fnr: '0.000', lat: '373.5ms' },
    { name: 'F — NLI + drift signal', precision: '0.448', recall: '1.000', f1: '0.619', fpr: '0.941', fnr: '0.000', lat: '207.7ms' },
    { name: 'G — Full AgentPulse pipeline', precision: '0.929', recall: '1.000', f1: '0.963', fpr: '0.059', fnr: '0.000', lat: '241.6ms' },
  ];

  const compoundingNodes = [
    { node: 'A — Planner', control: 0.495, intervention: 0.495 },
    { node: 'B — Injected fault', control: 1.000, intervention: 1.000 },
    { node: 'C — Verifier', control: 0.992, intervention: 0.009 },
    { node: 'D — Analyst', control: 0.992, intervention: 0.001 },
    { node: 'E — Writer', control: 0.992, intervention: 0.001 },
  ];

  return (
    <div className="space-y-5">
      <SectionHead
        title="Reproducible Experiments & Benchmarks"
        sub="Reasoning strategies and component ablation, measured on the held-out v1.0_test split"
        right={<Eyebrow>Snapshot of last recorded run</Eyebrow>}
      />

      {/* Strategy comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {strategyData.map((s, i) => (
          <Tile key={s.strategy} className="p-4" index={i}>
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-line">
              <span className="font-mono text-xs font-semibold text-ink">{s.strategy}</span>
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded border border-signal/25 bg-signal/10 text-signal">
                Qwen3-8B Q4_K_M
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Eyebrow>Mean risk</Eyebrow>
                <div className="font-mono text-sm font-semibold tnum text-ink mt-0.5">{s.risk.toFixed(3)}</div>
                <Meter value={s.risk} className="mt-1.5" />
              </div>
              <div>
                <Eyebrow>Contradiction rate</Eyebrow>
                <div className="font-mono text-sm font-semibold tnum text-ink mt-0.5">
                  {(s.contraRate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <Eyebrow>Mean latency</Eyebrow>
                <div className="font-mono text-xs font-semibold tnum text-ink-dim mt-0.5">
                  {(s.latencyMs / 1000).toFixed(1)}s
                </div>
              </div>
              <div>
                <Eyebrow>Tokens in / out</Eyebrow>
                <div className="font-mono text-xs font-semibold tnum text-ink-dim mt-0.5">
                  {s.tokensIn.toFixed(0)} / {s.tokensOut.toFixed(0)}
                </div>
              </div>
            </div>
          </Tile>
        ))}
      </div>

      <Tile className="p-3.5 border-state-warn/25 bg-state-warn/[0.04]" hover={false} index={3}>
        <div className="flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-state-warn shrink-0 mt-px" aria-hidden="true" />
          <p className="text-xs text-ink-dim leading-relaxed">
            <span className="text-ink font-medium">Grounding risk is inconclusive on this sample.</span>{' '}
            The spread between strategy means (0.191) is smaller than the largest within-strategy
            standard deviation (0.377), so no strategy can be declared better on grounding risk here.
            The measured difference that does hold: AOT spends roughly 8.5&times; DIRECT&apos;s output tokens.
          </p>
        </div>
      </Tile>

      {/* Ablation table */}
      <Tile className="overflow-hidden" hover={false} index={4}>
        <TileHead
          label="Component ablation — held-out v1.0_test (30 cases)"
          right={<Eyebrow>Thresholds selected on dev</Eyebrow>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="px-4 py-2.5 font-normal"><Eyebrow>Configuration</Eyebrow></th>
                <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>Precision</Eyebrow></th>
                <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>Recall</Eyebrow></th>
                <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>F1</Eyebrow></th>
                <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>FPR</Eyebrow></th>
                <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>FNR</Eyebrow></th>
                <th className="px-4 py-2.5 font-normal text-right"><Eyebrow>Latency</Eyebrow></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {baselinesData.map((b) => {
                const isFull = b.name.startsWith('G');
                const underperforms = parseFloat(b.f1) < 0.963;
                return (
                  <tr key={b.name} className={cx('font-mono', isFull && 'bg-signal/[0.06]')}>
                    <td className={cx('px-4 py-2.5', isFull ? 'text-ink font-semibold' : 'text-ink-dim')}>
                      {b.name}
                    </td>
                    <td className="px-4 py-2.5 text-center tnum text-ink-dim">{b.precision}</td>
                    <td className="px-4 py-2.5 text-center tnum text-ink-dim">{b.recall}</td>
                    <td className={cx(
                      'px-4 py-2.5 text-center tnum font-semibold',
                      underperforms ? 'text-state-warn' : 'text-state-ok',
                    )}>
                      {b.f1}
                    </td>
                    <td className={cx(
                      'px-4 py-2.5 text-center tnum',
                      parseFloat(b.fpr) > 0.5 ? 'text-state-bad' : 'text-ink-faint',
                    )}>
                      {b.fpr}
                    </td>
                    <td className="px-4 py-2.5 text-center tnum text-ink-faint">{b.fnr}</td>
                    <td className="px-4 py-2.5 text-right tnum text-ink-dim">{b.lat}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-line">
          <p className="text-2xs text-ink-faint leading-relaxed">
            Config F scores below the plain NLI-only baseline: the drift detector&apos;s cold-start
            centroid flags most non-failure cases on this non-temporal data (FPR 0.941). Reported
            rather than hidden.
          </p>
        </div>
      </Tile>

      {/* Compounding error */}
      <Tile className="p-4" hover={false} index={5}>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink tracking-tight">
            Downstream propagation — control vs intervention
          </h3>
          <p className="text-xs text-ink-dim mt-0.5">
            An ungrounded claim is injected at Node B; the intervention condition adds a verifier at Node C
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {compoundingNodes.map((cn) => (
            <div key={cn.node} className="tile p-3">
              <Eyebrow>{cn.node}</Eyebrow>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-2xs font-mono text-ink-faint mb-1">Unmitigated</div>
                  <RiskScorePill score={cn.control} />
                </div>
                <div>
                  <div className="text-2xs font-mono text-ink-faint mb-1">Verifier active</div>
                  <RiskScorePill score={cn.intervention} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-2xs text-ink-faint mt-3 leading-relaxed">
          Node A reads ~0.495 despite being unmodified: DeBERTa NLI classifies a premise compared
          against itself as neutral rather than entailment. Treat its absolute value as an
          imperfect baseline; the before/after comparison from Node C onward is unaffected.
        </p>
      </Tile>
    </div>
  );
}

// ─── 8. Datasets View ──────────────────────────────────────────────────

function DatasetsView() {
  // Counts match datasets/v1.0_*.json after the expansion documented in
  // scripts/expand_dataset.py (50 original cases + 23 constructed = 73).
  const datasets = [
    { version: 'v1.0_dev', split: 'dev', cases: 21, domain: 'Threshold selection only' },
    { version: 'v1.0_val', split: 'val', cases: 22, domain: 'Validation' },
    { version: 'v1.0_test', split: 'test', cases: 30, domain: 'Held out for reporting' },
    { version: 'v1.0_curated', split: 'production', cases: 1, domain: 'Curated from live incidents' },
  ];

  return (
    <div className="space-y-5">
      <SectionHead
        title="Versioned Evaluation Datasets"
        sub="Ground-truth splits used for threshold selection and held-out reporting"
        right={<Eyebrow>73 cases total</Eyebrow>}
      />

      {/* Label provenance. Stated precisely: these labels come from two
          independent LLM-as-judge passes, not human annotation. */}
      <Tile className="p-4" hover={false} index={0}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Label agreement</Eyebrow>
            <p className="text-xs text-ink-dim mt-1.5 leading-relaxed">
              The original 50 cases were labelled by{' '}
              <span className="text-ink">two independent LLM-as-judge passes</span>, not human
              annotators, reaching Cohen&apos;s κ = 0.922. The 23 cases added later are correct by
              construction and are excluded from that figure. See{' '}
              <span className="font-mono text-signal">LABEL_AGREEMENT_REPORT.md</span>.
            </p>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded border border-state-ok/25 bg-state-ok/10 text-state-ok font-mono text-2xs font-semibold tnum">
            κ 0.922
          </span>
        </div>
      </Tile>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {datasets.map((d, i) => (
          <Tile key={d.version} className="p-4" index={i + 1}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-ink">{d.version}</span>
              <span className="text-2xs font-mono uppercase px-1.5 py-0.5 rounded bg-surface-3 text-ink-dim">
                {d.split}
              </span>
            </div>
            <div className="mt-3">
              <Eyebrow>Cases</Eyebrow>
              <div className="font-mono text-xl font-semibold tnum text-ink mt-0.5">{d.cases}</div>
            </div>
            <p className="text-2xs text-ink-faint mt-2">{d.domain}</p>
          </Tile>
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
      <SectionHead
        title="Time-Scrub Incident Replay Debugger"
        sub="Step-by-step causal investigation of failure propagation across agent DAG nodes"
      />

      {/* Control Bar */}
      <Tile className="p-4 space-y-3" hover={false} index={0}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStepIdx(Math.max(0, currentStepIdx - 1))}
              disabled={currentStepIdx === 0}
              aria-label="Previous step"
              className="p-1.5 rounded border border-line bg-surface-2 text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <SkipBack className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded border border-signal/35 bg-signal/15 hover:bg-signal/25 text-signal font-mono text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
            </button>
            <button
              onClick={() => setCurrentStepIdx(Math.min(SAMPLE_REPLAY_STEPS.length - 1, currentStepIdx + 1))}
              disabled={currentStepIdx === SAMPLE_REPLAY_STEPS.length - 1}
              aria-label="Next step"
              className="p-1.5 rounded border border-line bg-surface-2 text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <SkipForward className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Eyebrow>Speed</Eyebrow>
            <div className="flex items-center gap-0.5 p-0.5 rounded border border-line bg-surface-2">
              {[0.5, 1, 2].map((sp) => (
                <button
                  key={sp}
                  onClick={() => setPlaybackSpeed(sp)}
                  aria-pressed={playbackSpeed === sp}
                  className={cx(
                    'px-2 py-0.5 rounded text-2xs font-mono font-semibold cursor-pointer transition-colors',
                    playbackSpeed === sp ? 'bg-signal/15 text-signal' : 'text-ink-faint hover:text-ink-dim',
                  )}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step Track */}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {SAMPLE_REPLAY_STEPS.map((s, idx) => (
            <div
              key={s.agent}
              onClick={() => setCurrentStepIdx(idx)}
              className={cx(
                'tile p-2.5 text-left cursor-pointer',
                idx === currentStepIdx ? 'tile-active' : idx < currentStepIdx ? 'tile-hover' : 'tile-hover opacity-45',
              )}
            >
              <div className="flex justify-between items-center gap-1">
                <Eyebrow>{s.timeLabel}</Eyebrow>
                <StatusBadge status={s.status} />
              </div>
              <div className="font-mono font-semibold text-ink text-xs mt-1.5 capitalize truncate">@{s.agent}</div>
            </div>
          ))}
        </div>
      </Tile>

      {/* Step Detail Card */}
      <Tile className="p-5 space-y-4" hover={false} index={1}>
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-line">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded border border-signal/25 bg-signal/10 text-signal font-mono text-2xs font-semibold tnum">
                STEP {String(currentStepIdx + 1).padStart(2, '0')} / {String(SAMPLE_REPLAY_STEPS.length).padStart(2, '0')}
              </span>
              <h3 className="text-sm font-semibold text-ink font-mono capitalize">
                @{step.agent} <span className="text-ink-faint font-normal">({step.role})</span>
              </h3>
            </div>
            <div className="mt-1"><Eyebrow>Time offset {step.timeLabel}</Eyebrow></div>
          </div>
          <RiskScorePill score={step.riskScore} label="Risk" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="tile p-3 space-y-2">
            <Eyebrow>Observed node action</Eyebrow>
            <p className="text-ink-dim text-xs leading-relaxed">{step.event}</p>
            {step.toolUsed && (
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border border-signal/25 bg-signal/10 text-signal text-2xs font-mono">
                <Wrench className="w-2.5 h-2.5" aria-hidden="true" />
                {step.toolUsed}
              </span>
            )}
          </div>

          <div className={cx(
            'tile p-3 space-y-2',
            step.evidence && 'border-state-bad/30 bg-state-bad/[0.06]',
          )}>
            <Eyebrow className={step.evidence ? 'text-state-bad' : undefined}>
              Evidence &amp; grounding flag
            </Eyebrow>
            <p className={cx('text-xs leading-relaxed', step.evidence ? 'text-state-bad' : 'text-ink-faint')}>
              {step.evidence || 'No grounding or contradiction flags observed on this step.'}
            </p>
          </div>
        </div>
      </Tile>
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
    <div className="space-y-5">
      <SectionHead
        title="Agent Drift & Stability"
        sub="Embedding centroid shift, tool entropy change and Agent Stability Index"
      />

      <Tile className="p-5" hover={false} index={0}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-semibold text-ink tracking-tight">
            Centroid distance vs drift threshold
          </h3>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-px bg-signal" aria-hidden="true" />
              <Eyebrow>Current</Eyebrow>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-px bg-state-ok" aria-hidden="true" />
              <Eyebrow>Baseline</Eyebrow>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-px bg-state-bad" aria-hidden="true" />
              <Eyebrow>Threshold 0.30</Eyebrow>
            </span>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={driftTimelineData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2333" vertical={false} />
              <XAxis
                dataKey="span" stroke="#5d6782" textAnchor="middle" tickLine={false}
                axisLine={{ stroke: '#1e2333' }}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              />
              <YAxis
                stroke="#5d6782" domain={[0, 0.6]} tickLine={false}
                axisLine={{ stroke: '#1e2333' }}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f121c', border: '1px solid #2b3247',
                  borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono',
                }}
                labelStyle={{ color: '#9aa4bd' }}
              />
              <ReferenceLine y={0.30} stroke="#fb7185" strokeDasharray="4 4" />
              <Line
                type="monotone" dataKey="current" stroke="#22d3ee" strokeWidth={2}
                name="Current centroid distance" dot={{ r: 2.5, fill: '#22d3ee' }}
              />
              <Line
                type="monotone" dataKey="baseline" stroke="#34d399" strokeWidth={1.5}
                strokeDasharray="3 3" name="Baseline" dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-2xs text-ink-faint mt-3 leading-relaxed">
          Illustrative series. Measured drift results with graded shifts and negative controls are in
          <span className="font-mono text-ink-dim"> DRIFT_EXPERIMENT_REPORT.md</span>.
        </p>
      </Tile>
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
    <div className="space-y-5">
      <SectionHead
        title="Telemetry Simulation Lab"
        sub="Inject controlled synthetic anomaly workloads to exercise detection triggers"
        right={isRunning ? <StatusBadge status="running" /> : undefined}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {scenarios.map((sc, i) => (
          <Tile key={sc.id} className="p-5 flex flex-col justify-between gap-4" index={i}>
            <div>
              <h3 className="text-sm font-semibold text-ink tracking-tight">{sc.title}</h3>
              <p className="text-xs text-ink-dim mt-1 leading-relaxed">{sc.desc}</p>
            </div>
            <button
              onClick={() => onRunScenario(sc.id)}
              disabled={isRunning}
              className="w-full py-2 rounded border border-signal/35 bg-signal/15 hover:bg-signal/25 text-signal font-mono text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isRunning
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <Zap className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{isRunning ? 'Injecting traces…' : 'Trigger scenario'}</span>
            </button>
          </Tile>
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

  // The ESC affordance is shown in the input, so it has to actually work.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-start justify-center pt-24 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="tile bracket-on max-w-lg w-full p-3 space-y-2.5 shadow-2xl"
      >
        <div className="flex items-center gap-2.5 px-3 py-2 rounded border border-line bg-surface">
          <Search className="w-4 h-4 text-ink-faint shrink-0" aria-hidden="true" />
          <input
            type="text"
            placeholder="Type a command or search actions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="bg-transparent text-ink text-xs font-mono outline-none w-full placeholder:text-ink-faint"
          />
          <kbd className="text-2xs font-mono text-ink-faint border border-line rounded px-1 py-px shrink-0">
            ESC
          </kbd>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-faint">No matching actions.</p>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => { onSelectAction(a.id); onClose(); }}
                className="w-full text-left px-3 py-2 rounded text-xs font-mono text-ink-dim hover:bg-signal/12 hover:text-ink flex items-center justify-between gap-3 cursor-pointer transition-colors"
              >
                <span className="truncate">{a.label}</span>
                <Eyebrow>{a.category}</Eyebrow>
              </button>
            ))
          )}
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

  // Must match the backend route in backend/app/routers/websocket.py
  // (@router.websocket("/v1/ws/live")) — a bare /v1/ws does not exist.
  const wsUrl =
    import.meta.env.VITE_WS_URL ||
    (import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') + '/v1/ws/live'
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/v1/ws/live`);
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

  const PAGE_META: Record<NavPage, { title: string; sub: string }> = {
    'overview': { title: 'Fleet Overview', sub: 'LIVE AGENT TOPOLOGY / GROUNDING RISK' },
    'traces': { title: 'Execution Traces', sub: 'MULTI-AGENT SESSIONS / GROUNDING AUDITS' },
    'incidents': { title: 'Incident Inbox', sub: 'TRIGGERED ALERTS / TRIAGE QUEUE' },
    'incident-replay': { title: 'Replay Debugger', sub: 'STEP-THROUGH FAULT PROPAGATION' },
    'drift': { title: 'Drift & Stability', sub: 'CENTROID DISTANCE / AGENT STABILITY INDEX' },
    'experiments': { title: 'Experiments', sub: 'ABLATION / REASONING STRATEGY BENCHMARKS' },
    'datasets': { title: 'Datasets', sub: 'CURATED EVALUATION CASES' },
    'telemetry-lab': { title: 'Telemetry Lab', sub: 'SCENARIO SIMULATION' },
  };
  const meta = PAGE_META[currentPage];

  return (
    <div className="min-h-screen flex bg-void text-ink font-sans">
      <div className="deck-field" aria-hidden="true" />
      <div className="deck-wash" aria-hidden="true" />

      <SideRail
        current={currentPage}
        onNavigate={setCurrentPage}
        openIncidents={openIncidentsCount}
        isConnected={isConnected}
        onOpenPalette={() => setIsCommandPaletteOpen(true)}
      />

      <div className="flex-1 min-w-0 relative z-10 flex flex-col">
        <TopBar
          title={meta.title}
          sub={meta.sub}
          metrics={metrics}
          agents={agents}
          openIncidentsCount={openIncidentsCount}
          activeStrategy={activeStrategy}
          onSelectStrategy={setActiveStrategy}
        />

      {/* Main Workspace Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {currentPage === 'overview' ? (
          <div className="space-y-5">
            {/* Bento: headline signals sized by importance */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat
                index={0}
                label="Composite risk"
                value={metrics?.avg_risk_score ?? 0}
                decimals={3}
                tone={riskTone(metrics?.avg_risk_score ?? 0)}
                foot={<Meter value={metrics?.avg_risk_score ?? 0} />}
              />
              <Stat
                index={1}
                label="Total traces"
                value={metrics?.total_traces ?? 0}
                foot={<Eyebrow>{metrics?.total_spans ?? 0} spans evaluated</Eyebrow>}
              />
              <Stat
                index={2}
                label="Open incidents"
                value={openIncidentsCount}
                tone={openIncidentsCount > 0 ? 'bad' : 'ok'}
                foot={<Eyebrow>{alerts.length} total alerts</Eyebrow>}
              />
              <Stat
                index={3}
                label="Active agents"
                value={agents.length}
                foot={<Eyebrow>{traces.length} recent traces</Eyebrow>}
              />
            </div>

            <AgentTopologySection
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => setSelectedAgentId(id)}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
          <div>
            <SectionHead
              title="Execution Traces"
              sub="Multi-agent execution sessions and grounding audits"
              right={<Eyebrow>{traces.length} traces</Eyebrow>}
            />

            <Tile className="overflow-hidden" hover={false} index={0}>
              {traces.length === 0 ? (
                <EmptyState
                  icon={<Route className="w-7 h-7" />}
                  title="No traces captured yet"
                  hint="Send spans through the SDK, or run a scenario from Telemetry Lab, and they will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-line bg-surface">
                        <th className="px-4 py-2.5 font-normal"><Eyebrow>Trace ID</Eyebrow></th>
                        <th className="px-4 py-2.5 font-normal"><Eyebrow>Pipeline</Eyebrow></th>
                        <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>Spans</Eyebrow></th>
                        <th className="px-4 py-2.5 font-normal text-center"><Eyebrow>Risk</Eyebrow></th>
                        <th className="px-4 py-2.5 font-normal text-right"><Eyebrow>Timestamp</Eyebrow></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {traces.map((t) => (
                        <tr key={t.trace_id} className="hover:bg-surface-3/60 cursor-pointer transition-colors">
                          <td className="px-4 py-2.5 font-mono text-signal">{t.trace_id}</td>
                          <td className="px-4 py-2.5 text-ink-dim">{t.pipeline_id || 'research_pipeline'}</td>
                          <td className="px-4 py-2.5 text-center font-mono tnum text-ink">{t.total_spans}</td>
                          <td className="px-4 py-2.5 text-center"><RiskScorePill score={t.overall_risk_score} /></td>
                          <td className="px-4 py-2.5 text-right font-mono tnum text-ink-faint">
                            {new Date(t.start_time).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tile>
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
    </div>
  );
}

export default App;
