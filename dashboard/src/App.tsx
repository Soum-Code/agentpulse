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
  Database, FlaskConical, PlusCircle, BookmarkCheck, ArrowUpRight, Route, Wrench,
  ChevronRight, ChevronDown, Info
} from 'lucide-react';
import { SideRail, type NavPage } from './components/SideRail';
import {
  cx, Tile, TileHead, Eyebrow, SectionHead, StatusBadge, RiskPill,
  Meter, Stat, EmptyState, riskTone, asiTone, toneText, Waveform,
  type RiskTone,
} from './components/ui';

// ─── Types & Enums ─────────────────────────────────────────────────────

type ReasoningStrategy = 'ALL' | 'DIRECT' | 'COT' | 'AOT';

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

/** An agent's headline status is the worse of its two independent signals.
 *  ASI measures behavioural stability, grounding risk measures whether the
 *  output is supported -- an agent can be perfectly stable at being wrong
 *  (high ASI, high risk). Badging that "healthy" because stability is fine
 *  would read as safe at a glance, which is exactly the failure this tool
 *  exists to catch. Thresholds stay defined only in asiTone/riskTone. */
function agentStatus(asi: number | null, risk: number | null): string {
  const tones: RiskTone[] = [];
  if (asi !== null) tones.push(asiTone(asi));
  if (risk !== null) tones.push(riskTone(risk));
  if (tones.includes('bad')) return 'critical';
  if (tones.includes('warn')) return 'watch';
  return 'healthy';
}

/** How many agents to show before collapsing the rest into a count.
 *  Deployments can carry dozens of agents; a wall of them is unreadable
 *  and buries the ones that need attention. */
const TOPOLOGY_VISIBLE_LIMIT = 10;

function AgentTopologySection({
  agents, selectedAgentId, onSelectAgent
}: {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}) {
  // Riskiest first: this panel exists to surface what needs attention, and
  // the API returns no ordering guarantee. Agents with no score yet sort
  // last rather than being treated as healthy.
  const ranked = useMemo(
    () => [...agents].sort((a, b) => (b.avg_risk_score ?? -1) - (a.avg_risk_score ?? -1)),
    [agents],
  );
  const visible = ranked.slice(0, TOPOLOGY_VISIBLE_LIMIT);
  const hiddenCount = ranked.length - visible.length;

  return (
    <Tile className="p-4" hover={false} index={4}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight">Agent fleet</h2>
          <p className="text-xs text-ink-dim mt-0.5">
            Every reporting agent, ordered by grounding risk
          </p>
        </div>
        <div className="hidden md:block shrink-0 text-right">
          <Eyebrow>Status = worse of stability and risk</Eyebrow>
        </div>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-7 h-7" />}
          title="No agents reporting"
          hint="Agents appear here once the SDK sends its first span."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {visible.map((agent) => {
              const isSelected = selectedAgentId === agent.agent_id;
              const asi = agent.current_asi;
              const risk = agent.avg_risk_score;

              return (
                <button
                  key={agent.agent_id}
                  onClick={() => onSelectAgent(agent.agent_id)}
                  aria-pressed={isSelected}
                  className={cx(
                    'relative tile bracket p-3 text-left cursor-pointer',
                    isSelected ? 'tile-active bracket-on' : 'tile-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Eyebrow>{agent.total_errors > 0 ? `${agent.total_errors} errors` : 'No errors'}</Eyebrow>
                    <StatusBadge status={agentStatus(asi, risk)} />
                  </div>

                  <div className="text-[13px] font-semibold text-ink leading-tight truncate">
                    {agent.agent_id}
                  </div>
                  <div className="text-2xs font-mono text-ink-faint mt-0.5 truncate">
                    {agent.agent_role ?? 'Role not reported'}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-line grid grid-cols-3 gap-1">
                    <div>
                      <Eyebrow>ASI</Eyebrow>
                      <div className={cx(
                        'font-mono text-xs font-semibold tnum mt-0.5',
                        asi === null ? 'text-ink-faint' : toneText(asiTone(asi)),
                      )}>
                        {asi === null ? '—' : asi.toFixed(0)}
                      </div>
                    </div>
                    <div>
                      <Eyebrow>Risk</Eyebrow>
                      <div className={cx(
                        'font-mono text-xs font-semibold tnum mt-0.5',
                        risk === null ? 'text-ink-faint' : toneText(riskTone(risk)),
                      )}>
                        {risk === null ? '—' : risk.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <Eyebrow>Spans</Eyebrow>
                      <div className="font-mono text-xs font-semibold tnum mt-0.5 text-ink-dim">
                        {agent.total_spans}
                      </div>
                    </div>
                  </div>

                  {risk !== null && <Meter value={risk} className="mt-2.5" />}
                </button>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <p className="text-2xs font-mono text-ink-faint mt-2.5">
              {hiddenCount} more {hiddenCount === 1 ? 'agent' : 'agents'} with lower risk not shown
            </p>
          )}
        </>
      )}
    </Tile>
  );
}

// ─── 3. Trace Waterfall & Step Timeline ────────────────────────────────

interface SpanTreeNode {
  span: SpanDetail;
  depth: number;
  children: SpanTreeNode[];
}

function buildSpanTree(spans: SpanDetail[]): SpanTreeNode[] {
  const spanIdMap = new Set(spans.map((s) => s.span_id));
  const childrenMap = new Map<string, SpanDetail[]>();
  const rootSpans: SpanDetail[] = [];

  for (const span of spans) {
    const pId = span.parent_span_id;
    const isRoot = !pId || pId === '0000000000000000' || !spanIdMap.has(pId);
    if (isRoot) {
      rootSpans.push(span);
    } else {
      const list = childrenMap.get(pId) || [];
      list.push(span);
      childrenMap.set(pId, list);
    }
  }

  // Fallback: if somehow no root was identified but spans exist, treat all as top-level
  if (rootSpans.length === 0 && spans.length > 0) {
    return spans.map((s) => ({ span: s, depth: 0, children: [] }));
  }

  function attachChildren(span: SpanDetail, depth: number): SpanTreeNode {
    const children = childrenMap.get(span.span_id) || [];
    return {
      span,
      depth,
      children: children.map((c) => attachChildren(c, depth + 1)),
    };
  }

  return rootSpans.map((r) => attachChildren(r, 0));
}

function SpanTreeView({
  spans,
  selectedSpanId,
  onSelectSpan,
  totalDurationMs,
  minStartTime,
}: {
  spans: SpanDetail[];
  selectedSpanId?: string | null;
  onSelectSpan: (span: SpanDetail) => void;
  totalDurationMs: number;
  minStartTime: number;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (spanId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  const tree = useMemo(() => buildSpanTree(spans), [spans]);

  const visibleNodes = useMemo(() => {
    const result: SpanTreeNode[] = [];
    function walk(node: SpanTreeNode) {
      result.push(node);
      if (!collapsedIds.has(node.span.span_id)) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }
    for (const root of tree) {
      walk(root);
    }
    return result;
  }, [tree, collapsedIds]);

  return (
    <div className="space-y-1">
      {visibleNodes.map(({ span, depth, children }) => {
        const isSelected = selectedSpanId === span.span_id;
        const hasChildren = children.length > 0;
        const isCollapsed = collapsedIds.has(span.span_id);

        // Compute inline timeline bar
        const spanStart = span.start_time ? new Date(span.start_time).getTime() : minStartTime;
        const offsetMs = Math.max(0, spanStart - minStartTime);
        const latMs = span.latency_ms ?? 0;
        const leftPct = Math.min(100, Math.max(0, (offsetMs / totalDurationMs) * 100));
        const widthPct = Math.min(100 - leftPct, Math.max(3, (latMs / totalDurationMs) * 100));

        const riskScore = span.evaluation?.overall_risk_score;
        const barTone = riskScore !== null && riskScore !== undefined ? riskTone(riskScore) : 'ok';
        const barColor = barTone === 'bad' ? 'bg-state-bad' : barTone === 'warn' ? 'bg-state-warn' : 'bg-state-ok';

        const isTool = Boolean(span.tool_name || span.span_kind === 'TOOL');
        const isLlm = span.event_type === 'llm_generation' || Boolean(span.model);

        return (
          <button
            key={span.span_id}
            onClick={() => onSelectSpan(span)}
            aria-selected={isSelected}
            className={cx(
              'w-full tile p-2.5 text-left cursor-pointer transition-all duration-150 relative',
              isSelected ? 'tile-active bracket-on' : 'tile-hover',
            )}
            style={{ paddingLeft: `${Math.max(10, depth * 18 + 10)}px` }}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Expand / Collapse Chevron */}
                {hasChildren ? (
                  <span
                    onClick={(e) => toggleCollapse(span.span_id, e)}
                    role="button"
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? 'Expand child spans' : 'Collapse child spans'}
                    className="p-0.5 rounded text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </span>
                ) : (
                  <span className="w-3.5 h-3.5 shrink-0 opacity-0" aria-hidden="true" />
                )}

                {/* Span Type Icon */}
                <span className="shrink-0 text-ink-faint">
                  {isTool ? (
                    <Wrench className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
                  ) : isLlm ? (
                    <Cpu className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
                  ) : (
                    <GitFork className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
                  )}
                </span>

                {/* Agent & Span identifiers */}
                <span className="font-mono text-xs font-semibold text-ink capitalize truncate">
                  @{span.agent_id}
                </span>

                {span.agent_role && (
                  <span className="text-2xs font-mono text-ink-faint truncate hidden sm:inline">
                    {span.agent_role}
                  </span>
                )}

                {span.tool_name && (
                  <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded border border-line bg-surface-3 text-ink-dim text-2xs font-mono">
                    <Wrench className="w-2.5 h-2.5" aria-hidden="true" />
                    {span.tool_name}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="font-mono text-2xs tnum text-ink-faint">
                  {span.latency_ms !== null ? `${span.latency_ms.toFixed(1)}ms` : '—'}
                </span>
                <RiskScorePill score={riskScore} />
              </div>
            </div>

            {/* Inline Relative Duration Bar */}
            <div className="w-full h-1.5 rounded-full bg-surface-3 relative overflow-hidden">
              <div
                className={cx('absolute top-0 bottom-0 rounded-full', barColor)}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TraceWaterfallSection({
  traces,
  selectedTraceId,
  onSelectTraceId,
  spans,
  selectedSpanId,
  onSelectSpan,
  isLoading,
  error,
}: {
  traces: TraceListItem[];
  selectedTraceId: string | null;
  onSelectTraceId: (id: string) => void;
  spans: SpanDetail[];
  selectedSpanId?: string | null;
  onSelectSpan: (span: SpanDetail) => void;
  isLoading: boolean;
  error: string | null;
}) {
  // Compute trace timeline metrics
  const { totalDurationMs, minStartTime } = useMemo(() => {
    if (spans.length === 0) return { totalDurationMs: 1, minStartTime: 0 };
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let sumLatency = 0;

    for (const s of spans) {
      const start = s.start_time ? new Date(s.start_time).getTime() : 0;
      const lat = s.latency_ms ?? 0;
      sumLatency += lat;
      if (start > 0) {
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, start + lat);
      }
    }

    const calculated = maxEnd > minStart ? maxEnd - minStart : sumLatency || 1;
    return {
      totalDurationMs: Math.max(calculated, 1),
      minStartTime: minStart === Infinity ? 0 : minStart,
    };
  }, [spans]);

  return (
    <Tile className="p-4" hover={false} index={5}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-line">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink tracking-tight">Active Trace Waterfall</h2>
            {isLoading && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-mono text-signal bg-signal/10 border border-signal/25">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                Loading
              </span>
            )}
          </div>
          <p className="text-2xs font-mono text-ink-faint mt-0.5 truncate">
            TRACE REPOSITORY &bull; {traces.length} RECORDED SESSIONS
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Real Trace Picker Dropdown */}
          <div className="flex items-center gap-1.5">
            <Eyebrow className="hidden md:inline">Trace</Eyebrow>
            <select
              value={selectedTraceId || ''}
              onChange={(e) => onSelectTraceId(e.target.value)}
              aria-label="Select active trace"
              className="bg-surface-2 border border-line hover:border-line-strong text-ink font-mono text-xs rounded px-2.5 py-1 outline-none focus:border-signal/50 transition-colors cursor-pointer max-w-[200px] truncate"
            >
              {traces.length === 0 ? (
                <option value="">No traces available</option>
              ) : (
                traces.map((t) => (
                  <option key={t.trace_id} value={t.trace_id}>
                    {t.trace_id.slice(0, 16)}… ({t.total_spans} spans)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="text-right pl-3 border-l border-line">
            <Eyebrow>Total Duration</Eyebrow>
            <div className="font-mono text-xs font-semibold tnum text-ink">
              {spans.length > 0 ? `${totalDurationMs.toFixed(1)}ms` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* State rendering: Loading / Error / Empty / Tree */}
      {isLoading ? (
        <div className="py-12 px-4 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 text-signal animate-spin" aria-hidden="true" />
          <p className="text-xs font-mono text-ink-dim">Retrieving trace telemetry...</p>
        </div>
      ) : error ? (
        <div className="p-6 text-center space-y-2 border border-state-bad/25 bg-state-bad/[0.04] rounded">
          <p className="text-xs font-mono font-semibold text-state-bad">Failed to load trace details</p>
          <p className="text-2xs font-mono text-ink-faint">{error}</p>
        </div>
      ) : traces.length === 0 ? (
        <EmptyState
          icon={<Route className="w-7 h-7" />}
          title="No traces recorded"
          hint="Send telemetry through the SDK or trigger a scenario in Telemetry Lab."
        />
      ) : spans.length === 0 ? (
        <EmptyState
          icon={<Route className="w-7 h-7" />}
          title="No spans in selected trace"
          hint={selectedTraceId ? `Trace ${selectedTraceId} contains no recorded spans.` : 'Select a trace to inspect.'}
        />
      ) : (
        <SpanTreeView
          spans={spans}
          selectedSpanId={selectedSpanId}
          onSelectSpan={onSelectSpan}
          totalDurationMs={totalDurationMs}
          minStartTime={minStartTime}
        />
      )}
    </Tile>
  );
}

// ─── 4. Evidence Inspector Panel (Side-by-Side Dual Pane) ──────────────

function EvidenceInspectorPanel({
  selectedSpan,
  agents,
  isLoading,
}: {
  selectedSpan?: SpanDetail | null;
  agents: Agent[];
  isLoading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'evidence' | 'tools' | 'eval' | 'drift'>('evidence');

  const agentData = useMemo(() => {
    if (!selectedSpan) return null;
    return agents.find((a) => a.agent_id === selectedSpan.agent_id) || null;
  }, [selectedSpan, agents]);

  return (
    <Tile className="p-4 flex flex-col h-full space-y-3.5" hover={false} index={6}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink tracking-tight">Evidence &amp; Grounding Inspector</h2>
          {selectedSpan && (
            <span className="px-1.5 py-0.5 rounded border border-line bg-surface-3 text-ink-dim font-mono text-2xs">
              {selectedSpan.span_id}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-dim mt-0.5">
          Span-level evaluation cascade, tool arguments, and telemetry
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-line text-xs font-mono">
        <button
          onClick={() => setActiveTab('evidence')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'evidence' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Evidence
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'tools' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => setActiveTab('eval')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'eval' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Eval Cascade
        </button>
        <button
          onClick={() => setActiveTab('drift')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'drift' ? 'border-signal text-signal' : 'border-transparent text-ink-faint hover:text-ink-dim'
          }`}
        >
          Drift Signal
        </button>
      </div>

      {/* Tab Content Body with strict null safety */}
      <div className="flex-1 overflow-y-auto space-y-3 text-xs font-mono">
        {isLoading ? (
          <div className="py-12 px-4 flex flex-col items-center justify-center text-ink-faint space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin text-signal" aria-hidden="true" />
            <p className="text-2xs">Loading span evidence...</p>
          </div>
        ) : !selectedSpan ? (
          <div className="py-12 px-4 text-center text-ink-faint">
            <p className="text-xs">No span selected</p>
            <p className="text-2xs mt-1">Select a span from the waterfall to inspect its evaluated evidence.</p>
          </div>
        ) : activeTab === 'evidence' ? (
          <div className="space-y-3 font-sans">
            {/* Privacy capture state notice */}
            <div className="tile p-3 bg-surface-2 border-line space-y-1.5">
              <div className="flex items-center gap-1.5 text-2xs font-mono uppercase tracking-wider text-ink-faint font-semibold">
                <Lock className="w-3 h-3 text-ink-faint" aria-hidden="true" />
                <span>Payload Capture Notice</span>
              </div>
              <p className="text-ink-dim text-xs leading-relaxed">
                Raw input/output capture is off for this deployment (
                <code className="font-mono text-2xs text-ink">AGENTPULSE_CAPTURE_INPUTS=false</code>).
                Payload contents are protected by default privacy configuration.
              </p>
            </div>

            {/* Error message conditional render */}
            {selectedSpan.error_message && (
              <div className="tile p-3 border-state-bad/30 bg-state-bad/[0.06] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-mono text-state-bad uppercase font-bold">Execution Error</span>
                  <StatusBadge status="critical" />
                </div>
                <p className="text-state-bad font-mono text-xs leading-relaxed">
                  {selectedSpan.error_message}
                </p>
              </div>
            )}

            {/* Span metadata summary */}
            <div className="tile p-3 space-y-2 font-mono text-xs">
              <Eyebrow>Execution Overview</Eyebrow>
              <div className="flex justify-between items-center text-ink-dim">
                <span>Status</span>
                <StatusBadge status={selectedSpan.status} />
              </div>
              <div className="flex justify-between items-center text-ink-dim">
                <span>Event Type</span>
                <span className="text-ink">{selectedSpan.event_type}</span>
              </div>
              {selectedSpan.latency_ms !== null && (
                <div className="flex justify-between items-center text-ink-dim">
                  <span>Latency</span>
                  <span className="tnum text-ink font-semibold">{selectedSpan.latency_ms.toFixed(1)}ms</span>
                </div>
              )}
              {selectedSpan.model && (
                <div className="flex justify-between items-center text-ink-dim">
                  <span>Model</span>
                  <span className="text-ink">{selectedSpan.model}</span>
                </div>
              )}
              {(selectedSpan.tokens_in !== null || selectedSpan.tokens_out !== null) && (
                <div className="flex justify-between items-center text-ink-dim">
                  <span>Tokens (In / Out)</span>
                  <span className="tnum text-ink">
                    {selectedSpan.tokens_in !== null ? selectedSpan.tokens_in : '—'} /{' '}
                    {selectedSpan.tokens_out !== null ? selectedSpan.tokens_out : '—'}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'tools' ? (
          selectedSpan.tool_name ? (
            <div className="tile p-3 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-ink-dim">Tool Name</span>
                <span className="text-signal font-semibold">{selectedSpan.tool_name}</span>
              </div>
              {selectedSpan.tool_args && (
                <div>
                  <Eyebrow>Arguments</Eyebrow>
                  <pre className="mt-1 p-2 rounded bg-surface border border-line text-2xs text-ink-dim overflow-x-auto whitespace-pre-wrap">
                    {selectedSpan.tool_args}
                  </pre>
                </div>
              )}
              {selectedSpan.tool_result_summary && (
                <div>
                  <Eyebrow>Result Summary</Eyebrow>
                  <p className="mt-1 text-xs text-ink-dim leading-relaxed">
                    {selectedSpan.tool_result_summary}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="tile p-4 text-center text-xs font-mono text-ink-faint">
              No external tool invocation recorded for this span.
            </div>
          )
        ) : activeTab === 'eval' ? (
          selectedSpan.evaluation ? (
            <div className="tile p-3 space-y-2.5 font-mono text-xs">
              {selectedSpan.evaluation.evaluation_stage && (
                <div className="flex justify-between items-center">
                  <span className="text-ink-dim">Evaluation Stage</span>
                  <span className="text-ink font-semibold">{selectedSpan.evaluation.evaluation_stage}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-ink-dim">Grounding Score</span>
                <span className="tnum font-semibold text-ink">
                  {selectedSpan.evaluation.grounding_score !== null
                    ? selectedSpan.evaluation.grounding_score.toFixed(4)
                    : '—'}
                </span>
              </div>
              {selectedSpan.evaluation.tool_claim_score !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-ink-dim">Tool Claim Score</span>
                  <span className="tnum font-semibold text-ink">
                    {selectedSpan.evaluation.tool_claim_score.toFixed(4)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-line">
                <span className="text-ink-dim">Overall Risk</span>
                <RiskScorePill score={selectedSpan.evaluation.overall_risk_score} />
              </div>
              {selectedSpan.evaluation.label && (
                <div className="flex justify-between items-center">
                  <span className="text-ink-dim">Classification Label</span>
                  <span className="px-1.5 py-0.5 rounded text-2xs font-semibold uppercase bg-surface-3 text-ink">
                    {selectedSpan.evaluation.label}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="tile p-4 text-center text-xs font-mono text-ink-faint">
              No evaluation record associated with this span.
            </div>
          )
        ) : (
          agentData ? (
            <div className="tile p-3 space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-ink-dim">Reporting Agent</span>
                <span className="text-signal font-semibold capitalize">@{agentData.agent_id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-dim">Agent Stability Index (ASI)</span>
                <span
                  className={cx(
                    'font-semibold tnum',
                    agentData.current_asi !== null ? toneText(asiTone(agentData.current_asi)) : 'text-ink-faint',
                  )}
                >
                  {agentData.current_asi !== null ? `${agentData.current_asi.toFixed(1)}/100` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-dim">Fleet Avg Risk</span>
                <RiskScorePill score={agentData.avg_risk_score} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-dim">Total Errors</span>
                <span className="tnum font-semibold text-ink">{agentData.total_errors}</span>
              </div>
            </div>
          ) : (
            <div className="tile p-4 text-center text-xs font-mono text-ink-faint">
              Agent telemetry unavailable for @{selectedSpan.agent_id}.
            </div>
          )
        )}
      </div>
    </Tile>
  );
}

// ─── 5. Incident Inbox & Trace Curation Modal ──────────────────────────

// ─── 5. Incident Inbox & Trace Curation Modal ──────────────────────────

function IncidentInboxView({
  alerts,
  onCurateTrace,
  onAcknowledgeAlert,
  acknowledgingAlertIds,
  actionError,
  actionSuccess,
  onDismissError,
}: {
  alerts: AlertItem[];
  onCurateTrace: (al: AlertItem) => void;
  onAcknowledgeAlert: (alertId: number) => Promise<void>;
  acknowledgingAlertIds: Set<number>;
  actionError: string | null;
  actionSuccess: string | null;
  onDismissError: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'ACKNOWLEDGED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARN'>('ALL');

  const filteredAlerts = useMemo(() => {
    return alerts.filter((al) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesMsg = al.message.toLowerCase().includes(q);
        const matchesType = al.alert_type.toLowerCase().includes(q);
        const matchesAgent = al.agent_id ? al.agent_id.toLowerCase().includes(q) : false;
        const matchesTrace = al.trace_id ? al.trace_id.toLowerCase().includes(q) : false;
        if (!matchesMsg && !matchesType && !matchesAgent && !matchesTrace) return false;
      }

      // Status filter
      if (statusFilter === 'OPEN' && al.acknowledged) return false;
      if (statusFilter === 'ACKNOWLEDGED' && !al.acknowledged) return false;

      // Severity filter
      const sev = al.severity.toUpperCase();
      if (severityFilter === 'CRITICAL' && sev !== 'HIGH' && sev !== 'CRITICAL') return false;
      if (severityFilter === 'WARN' && sev !== 'WARNING' && sev !== 'WARN') return false;

      return true;
    });
  }, [alerts, searchQuery, statusFilter, severityFilter]);

  const openCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="space-y-4">
      <SectionHead
        title="Incident Inbox"
        sub="Storm-suppressed anomalies, grounding contradictions and evaluated tool mismatches"
        right={
          <div className="flex items-center gap-2">
            <Eyebrow>{openCount} open</Eyebrow>
            <span className="text-ink-faint">&bull;</span>
            <Eyebrow>{alerts.length} total</Eyebrow>
          </div>
        }
      />

      {/* Action Notification Banners */}
      {actionError && (
        <div className="tile p-3 border-state-bad/40 bg-state-bad/[0.08] flex items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-state-bad">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={onDismissError}
            aria-label="Dismiss error"
            className="text-state-bad/70 hover:text-state-bad cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="tile p-3 border-state-ok/40 bg-state-ok/[0.08] flex items-center gap-2 text-xs font-mono text-state-ok">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{actionSuccess}</span>
        </div>
      )}

      <Tile className="p-3 space-y-3" hover={false} index={0}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search message, alert type, agent, trace ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter incidents"
              className="w-full pl-8.5 pr-8 py-1.5 bg-surface-2 border border-line focus:border-signal/50 rounded font-mono text-xs text-ink placeholder:text-ink-faint outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs font-mono cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status & Severity Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 text-2xs font-mono">
            <span className="text-ink-faint uppercase text-2xs">Status:</span>
            <div className="inline-flex rounded border border-line/60 overflow-hidden">
              {(['ALL', 'OPEN', 'ACKNOWLEDGED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cx(
                    'px-2.5 py-1 transition-colors cursor-pointer',
                    statusFilter === s
                      ? 'bg-surface-3 text-ink font-semibold'
                      : 'bg-surface text-ink-faint hover:text-ink'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            <span className="text-ink-faint uppercase text-2xs ml-2">Severity:</span>
            <div className="inline-flex rounded border border-line/60 overflow-hidden">
              {(['ALL', 'CRITICAL', 'WARN'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={cx(
                    'px-2.5 py-1 transition-colors cursor-pointer',
                    severityFilter === sev
                      ? 'bg-surface-3 text-ink font-semibold'
                      : 'bg-surface text-ink-faint hover:text-ink'
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Tile>

      <Tile className="overflow-hidden" hover={false} index={1}>
        {filteredAlerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-7 h-7" />}
            title="No matching incidents"
            hint={
              alerts.length === 0
                ? 'No alerts raised by the evaluator. Trigger an anomalous run in Telemetry Lab to generate incidents.'
                : 'No incidents match the active search or filter criteria.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Severity</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Status</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Type</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Agent</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Trace</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Observed Anomaly</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal"><Eyebrow>Timestamp</Eyebrow></th>
                  <th className="px-4 py-2.5 font-normal text-right"><Eyebrow>Actions</Eyebrow></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {filteredAlerts.map((al) => {
                  const isHigh = al.severity.toUpperCase() === 'HIGH' || al.severity.toUpperCase() === 'CRITICAL';
                  const isAcknowledging = acknowledgingAlertIds.has(al.id);

                  return (
                    <tr key={al.id} className="hover:bg-surface-3/60 transition-colors">
                      {/* Severity (strict semantic risk colors, never cyan) */}
                      <td className="px-4 py-2.5">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-2xs font-mono font-medium',
                            isHigh
                              ? 'bg-state-bad/10 text-state-bad border-state-bad/25'
                              : 'bg-state-warn/10 text-state-warn border-state-warn/25'
                          )}
                        >
                          <span
                            className={cx(
                              'w-1.5 h-1.5 rounded-full',
                              isHigh ? 'bg-state-bad' : 'bg-state-warn'
                            )}
                            aria-hidden="true"
                          />
                          {al.severity}
                        </span>
                      </td>

                      {/* Status (real lifecycle state only: OPEN / ACKNOWLEDGED / RESOLVED) */}
                      <td className="px-4 py-2.5 font-mono text-2xs">
                        {al.resolved ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-state-ok bg-state-ok/10 border border-state-ok/25">
                            RESOLVED
                          </span>
                        ) : al.acknowledged ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-ink-faint bg-surface-3 border border-line">
                            ACKNOWLEDGED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-state-warn bg-state-warn/10 border border-state-warn/25 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-state-warn animate-pulse" aria-hidden="true" />
                            OPEN
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 font-mono text-ink">{al.alert_type}</td>

                      <td className="px-4 py-2.5 font-mono text-signal">
                        {al.agent_id ? `@${al.agent_id}` : '—'}
                      </td>

                      <td className="px-4 py-2.5 font-mono text-ink-dim">
                        {al.trace_id ? `${al.trace_id.slice(0, 14)}…` : '—'}
                      </td>

                      <td className="px-4 py-2.5 text-ink max-w-sm">
                        <span className="line-clamp-2">{al.message}</span>
                      </td>

                      <td className="px-4 py-2.5 font-mono tnum text-ink-faint text-2xs">
                        {new Date(al.created_at).toLocaleString()}
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Acknowledge Action */}
                          {al.acknowledged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-2xs font-mono text-ink-faint">
                              <Check className="w-3 h-3 text-state-ok" aria-hidden="true" />
                              Acknowledged
                            </span>
                          ) : (
                            <button
                              disabled={isAcknowledging}
                              onClick={() => onAcknowledgeAlert(al.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line hover:border-line-strong bg-surface-2 hover:bg-surface-3 text-ink text-2xs font-mono font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              title="Acknowledge this incident alert"
                            >
                              {isAcknowledging ? (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-signal" aria-hidden="true" />
                                  <span>Acknowledging…</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3 text-state-ok" aria-hidden="true" />
                                  <span>Acknowledge</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Curate Case Action */}
                          <button
                            onClick={() => onCurateTrace(al)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-signal/30 bg-signal/10 text-signal hover:bg-signal/20 text-2xs font-mono font-semibold transition-colors cursor-pointer"
                            title="Curate incident telemetry into evaluation dataset"
                          >
                            <BookmarkCheck className="w-3 h-3" aria-hidden="true" />
                            <span>Curate case</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
  isOpen,
  alert,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  alert: AlertItem | null;
  onClose: () => void;
  onSave: (datasetName: string, payload: any) => Promise<void>;
}) {
  const [caseId, setCaseId] = useState('');
  const [query, setQuery] = useState('');
  const [claim, setClaim] = useState('');
  const [evidence, setEvidence] = useState('');
  const [classification, setClassification] = useState('CONTRADICTED');
  const [targetDataset, setTargetDataset] = useState('v1.0_curated');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (alert) {
      setCaseId(`curated_${alert.trace_id?.slice(0, 8) || 'trace'}_${Date.now().toString().slice(-4)}`);
      setQuery('Multi-agent query session');
      setClaim(alert.message || '');
      setEvidence(alert.details ? JSON.stringify(alert.details) : 'Verified reference premise context');
      setClassification('CONTRADICTED');
      setTargetDataset('v1.0_curated');
      setNotes(`Curated from incident #${alert.id} (${alert.alert_type})`);
      setValidationError(null);
      setSubmitError(null);
    }
  }, [alert]);

  if (!isOpen || !alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    // Validate only fields actually required by backend CurateCaseRequest:
    // case_id, input_query, agent_claim
    if (!caseId.trim()) {
      setValidationError('Case ID is required.');
      return;
    }
    if (!query.trim()) {
      setValidationError('Input query is required.');
      return;
    }
    if (!claim.trim()) {
      setValidationError('Agent claim is required.');
      return;
    }

    setSaving(true);
    try {
      await onSave(targetDataset, {
        case_id: caseId.trim(),
        input_query: query.trim(),
        agent_claim: claim.trim(),
        evidence: evidence.trim() || null,
        expected_classification: classification,
        expected_failure_type: alert.alert_type,
        is_failure: classification !== 'SUPPORTED',
        trace_id: alert.trace_id || null,
        span_id: alert.span_id || null,
        domain: 'production_incident',
        operator_notes: notes.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to curate case into dataset');
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
        className="glass max-w-lg w-full p-6 space-y-4 shadow-2xl"
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

        {/* Validation Error Banner */}
        {validationError && (
          <div className="tile p-2.5 border-state-bad/40 bg-state-bad/[0.08] text-2xs font-mono text-state-bad flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Backend Submit Error Banner */}
        {submitError && (
          <div className="tile p-2.5 border-state-bad/40 bg-state-bad/[0.08] text-2xs font-mono text-state-bad flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-mono">
          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
              Case ID <span className="text-state-bad">*</span>
            </label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              placeholder="e.g. curated_case_01"
            />
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
              Input Query <span className="text-state-bad">*</span>
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              placeholder="Multi-agent prompt or query"
            />
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
              Agent Claim <span className="text-state-bad">*</span>
            </label>
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={2}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors font-sans"
              placeholder="Asserted claim or observation"
            />
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
              Source Evidence Context
            </label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors font-sans"
              placeholder="Verified premise context (optional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
                Classification
              </label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              >
                <option value="CONTRADICTED">CONTRADICTED</option>
                <option value="UNSUPPORTED">UNSUPPORTED</option>
                <option value="SUPPORTED">SUPPORTED</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
                Target Dataset
              </label>
              <input
                type="text"
                value={targetDataset}
                onChange={(e) => setTargetDataset(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
              Operator Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-ink focus:border-signal/50 transition-colors"
              placeholder="Triage rationale or notes"
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

// ─── 9. Recorded Execution Replay / Trace Playback ─────────────────────

function RecordedTracePlaybackView({
  traces,
  agents,
}: {
  traces: TraceListItem[];
  agents: Agent[];
}) {
  const [selectedTraceId, setSelectedTraceId] = useState<string>(
    traces.length > 0 ? traces[0].trace_id : ''
  );
  const [spans, setSpans] = useState<SpanDetail[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Sync default trace if initial selection was empty
  useEffect(() => {
    if (!selectedTraceId && traces.length > 0) {
      setSelectedTraceId(traces[0].trace_id);
    }
  }, [traces, selectedTraceId]);

  // Load trace recorded spans with strict failure hygiene & immediate state clearing
  useEffect(() => {
    if (!selectedTraceId) {
      setSpans([]);
      setCurrentStepIdx(0);
      setIsPlaying(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setFetchError(null);
    setIsPlaying(false);
    // Immediate state hygiene: clear previous playback state so stale data is never shown
    setSpans([]);
    setCurrentStepIdx(0);

    api.getTrace(selectedTraceId)
      .then((res) => {
        if (!isMounted) return;
        const rawSpans = res.spans || [];
        // Sort spans strictly chronologically by start_time
        const sorted = [...rawSpans].sort((a, b) => {
          const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
          const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
          return timeA - timeB;
        });
        setSpans(sorted);
        setCurrentStepIdx(0);
      })
      .catch((err) => {
        if (!isMounted) return;
        setSpans([]);
        setCurrentStepIdx(0);
        setFetchError(err?.message || 'Failed to load recorded trace spans.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTraceId]);

  // Playback timer stepping through recorded spans
  useEffect(() => {
    let timer: any;
    if (isPlaying && spans.length > 1) {
      timer = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= spans.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500 / playbackSpeed);
    } else if (isPlaying && spans.length <= 1) {
      setIsPlaying(false);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, spans.length]);

  const currentSpan: SpanDetail | null = spans[currentStepIdx] || null;

  // Relative timing offsets
  const firstStartTime =
    spans.length > 0 && spans[0].start_time ? new Date(spans[0].start_time).getTime() : null;

  const getRelativeOffset = (s: SpanDetail) => {
    if (!firstStartTime || !s.start_time) return null;
    const currentMs = new Date(s.start_time).getTime();
    if (isNaN(currentMs) || isNaN(firstStartTime)) return null;
    const diffSec = Math.max(0, (currentMs - firstStartTime) / 1000);
    return `T+${diffSec.toFixed(1)}s`;
  };

  // Compute timeline metrics for SpanTreeView
  const { totalDurationMs, minStartTime } = useMemo(() => {
    if (spans.length === 0) return { totalDurationMs: 1, minStartTime: 0 };
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let sumLatency = 0;

    for (const s of spans) {
      const start = s.start_time ? new Date(s.start_time).getTime() : 0;
      const lat = s.latency_ms ?? 0;
      if (start > 0) {
        if (start < minStart) minStart = start;
        if (start + lat > maxEnd) maxEnd = start + lat;
      }
      sumLatency += lat;
    }

    const duration =
      minStart !== Infinity && maxEnd !== -Infinity && maxEnd > minStart
        ? maxEnd - minStart
        : Math.max(sumLatency, 1);

    return {
      totalDurationMs: Math.max(duration, 1),
      minStartTime: minStart !== Infinity ? minStart : 0,
    };
  }, [spans]);

  const selectedTraceItem = traces.find((t) => t.trace_id === selectedTraceId);

  return (
    <div className="space-y-4">
      <SectionHead
        title="Recorded Execution Replay / Trace Playback"
        sub="Chronological timeline playback of recorded spans across multi-agent execution sessions"
        right={
          selectedTraceItem && (
            <div className="flex items-center gap-2">
              <Eyebrow>{selectedTraceItem.total_spans} recorded spans</Eyebrow>
              {selectedTraceItem.overall_risk_score !== null && (
                <>
                  <span className="text-ink-faint">&bull;</span>
                  <RiskScorePill score={selectedTraceItem.overall_risk_score} label="Trace Risk" />
                </>
              )}
            </div>
          )
        }
      />

      {/* Prominent Mandatory Disclosure Banner */}
      <div className="tile p-3 border-line bg-surface-2 flex items-center gap-2.5 text-xs font-mono text-ink-dim">
        <Info className="w-4 h-4 text-signal shrink-0" aria-hidden="true" />
        <span>
          <strong className="text-ink font-semibold">Recorded span playback.</strong> Full causal state re-execution is not currently supported.
        </span>
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="tile p-3 border-state-bad/40 bg-state-bad/[0.08] flex items-center gap-2 text-xs font-mono text-state-bad">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Trace Selector & Playback Control Bar */}
      <Tile className="p-4 space-y-4" hover={false} index={0}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Real Trace Selector Dropdown */}
          <div className="flex items-center gap-2.5">
            <label htmlFor="playback-trace-selector" className="text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint">
              Trace:
            </label>
            <select
              id="playback-trace-selector"
              value={selectedTraceId}
              onChange={(e) => setSelectedTraceId(e.target.value)}
              className="bg-surface-2 border border-line focus:border-signal/50 rounded px-2.5 py-1.5 text-xs font-mono text-ink outline-none cursor-pointer transition-colors max-w-sm sm:max-w-md"
            >
              {traces.map((t) => (
                <option key={t.trace_id} value={t.trace_id}>
                  {t.trace_id.slice(0, 16)}… ({t.service_name || t.pipeline_id || 'session'}) &bull; {t.total_spans} spans
                </option>
              ))}
            </select>
          </div>

          {/* Stepper Controls & Speed Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentStepIdx(Math.max(0, currentStepIdx - 1))}
                disabled={currentStepIdx === 0 || spans.length === 0}
                aria-label="Previous recorded span"
                className="p-1.5 rounded border border-line bg-surface-2 text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <SkipBack className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={spans.length <= 1}
                className="px-3 py-1.5 rounded border border-signal/35 bg-signal/15 hover:bg-signal/25 text-signal font-mono text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>

              <button
                onClick={() => setCurrentStepIdx(Math.min(spans.length - 1, currentStepIdx + 1))}
                disabled={currentStepIdx >= spans.length - 1 || spans.length === 0}
                aria-label="Next recorded span"
                className="p-1.5 rounded border border-line bg-surface-2 text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <SkipForward className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="h-4 w-px bg-line/60 mx-1" aria-hidden="true" />

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
                      playbackSpeed === sp ? 'bg-signal/15 text-signal' : 'text-ink-faint hover:text-ink-dim'
                    )}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chronological Timeline Scrubber Track */}
        {spans.length > 0 ? (
          <div className="space-y-1.5 pt-2 border-t border-line/60">
            <div className="flex items-center justify-between text-2xs font-mono text-ink-faint">
              <span>RECORDED TIMELINE SEQUENCE</span>
              <span className="tnum font-semibold text-ink">
                SPAN {String(currentStepIdx + 1).padStart(2, '0')} / {String(spans.length).padStart(2, '0')}
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {spans.map((s, idx) => {
                const isCurrent = idx === currentStepIdx;
                const offset = getRelativeOffset(s);
                const isErr = s.status.toUpperCase() === 'ERROR';

                return (
                  <button
                    key={s.span_id}
                    onClick={() => setCurrentStepIdx(idx)}
                    className={cx(
                      'tile p-2.5 text-left shrink-0 w-44 transition-all cursor-pointer rounded',
                      isCurrent
                        ? 'tile-active border-signal/60 bg-signal/5 ring-1 ring-signal/40'
                        : 'opacity-65 hover:opacity-100'
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 text-2xs font-mono">
                      <span className={cx('font-semibold', isCurrent ? 'text-signal' : 'text-ink-faint')}>
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-ink-faint">{offset || '—'}</span>
                    </div>

                    <div className="font-mono text-xs font-semibold text-ink truncate mt-1">
                      @{s.agent_id}
                    </div>

                    <div className="text-2xs font-mono text-ink-dim truncate mt-0.5">
                      {s.event_type}
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-line/40 text-2xs font-mono">
                      <span className={isErr ? 'text-state-bad font-semibold' : 'text-state-ok'}>
                        {s.status}
                      </span>
                      <span className="text-ink-faint tnum">
                        {s.latency_ms !== null ? `${s.latency_ms.toFixed(0)}ms` : '—'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </Tile>

      {/* Main Playback & Inspection Area */}
      {isLoading ? (
        <Tile className="p-8 flex items-center justify-center text-xs font-mono text-ink-dim" hover={false} index={1}>
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-signal" aria-hidden="true" />
            <span>Loading recorded spans for playback…</span>
          </div>
        </Tile>
      ) : spans.length === 0 ? (
        <Tile className="overflow-hidden" hover={false} index={1}>
          <EmptyState
            icon={<Route className="w-7 h-7" />}
            title="No recorded spans available"
            hint="The selected trace does not contain recorded spans or trace telemetry is unavailable."
          />
        </Tile>
      ) : currentSpan ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Recorded Span Detail & Topology Tree Context */}
          <div className="lg:col-span-2 space-y-4">
            <Tile className="p-5 space-y-4" hover={false} index={1}>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded border border-signal/25 bg-signal/10 text-signal font-mono text-2xs font-semibold tnum">
                      SPAN {String(currentStepIdx + 1).padStart(2, '0')} / {String(spans.length).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-semibold text-ink font-mono">
                      @{currentSpan.agent_id}{' '}
                      <span className="text-ink-faint font-normal">
                        ({currentSpan.agent_role || 'Unspecified role'})
                      </span>
                    </h3>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-2xs font-mono text-ink-faint">
                    <Eyebrow>Chronology offset {getRelativeOffset(currentSpan) || '—'}</Eyebrow>
                    <span>&bull;</span>
                    <span className="tnum">
                      Start: {currentSpan.start_time ? new Date(currentSpan.start_time).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                </div>

                {currentSpan.evaluation?.overall_risk_score !== null &&
                currentSpan.evaluation?.overall_risk_score !== undefined ? (
                  <RiskScorePill score={currentSpan.evaluation.overall_risk_score} label="Span Risk" />
                ) : (
                  <span className="text-2xs font-mono text-ink-faint border border-line px-2 py-0.5 rounded bg-surface">
                    Risk: —
                  </span>
                )}
              </div>

              {/* Execution Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="tile p-2.5 space-y-1">
                  <span className="text-2xs text-ink-faint uppercase tracking-wider block">Latency</span>
                  <span className="font-semibold text-ink tnum">
                    {currentSpan.latency_ms !== null ? `${currentSpan.latency_ms.toFixed(1)} ms` : '—'}
                  </span>
                </div>
                <div className="tile p-2.5 space-y-1">
                  <span className="text-2xs text-ink-faint uppercase tracking-wider block">Model</span>
                  <span className="font-semibold text-ink truncate block">
                    {currentSpan.model || '—'}
                  </span>
                </div>
                <div className="tile p-2.5 space-y-1">
                  <span className="text-2xs text-ink-faint uppercase tracking-wider block">Tokens In</span>
                  <span className="font-semibold text-ink tnum">
                    {currentSpan.tokens_in !== null ? currentSpan.tokens_in.toLocaleString() : '—'}
                  </span>
                </div>
                <div className="tile p-2.5 space-y-1">
                  <span className="text-2xs text-ink-faint uppercase tracking-wider block">Tokens Out</span>
                  <span className="font-semibold text-ink tnum">
                    {currentSpan.tokens_out !== null ? currentSpan.tokens_out.toLocaleString() : '—'}
                  </span>
                </div>
              </div>

              {/* Observed Action & Tool Invocation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="tile p-3 space-y-2">
                  <Eyebrow>Observed Node Event</Eyebrow>
                  <p className="text-ink text-xs font-mono font-semibold">{currentSpan.event_type}</p>
                  <div className="text-2xs font-mono text-ink-dim flex items-center gap-2">
                    <span>Kind: {currentSpan.span_kind}</span>
                    <span>&bull;</span>
                    <span>Span ID: {currentSpan.span_id}</span>
                  </div>
                  {currentSpan.tool_name && (
                    <div className="mt-2 pt-2 border-t border-line/50">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-signal/25 bg-signal/10 text-signal text-2xs font-mono font-semibold">
                        <Wrench className="w-3 h-3" aria-hidden="true" />
                        {currentSpan.tool_name}
                      </span>
                      {currentSpan.tool_args && (
                        <p className="text-2xs font-mono text-ink-dim mt-1.5 line-clamp-2">
                          Args: {currentSpan.tool_args}
                        </p>
                      )}
                      {currentSpan.tool_result_summary && (
                        <p className="text-2xs font-mono text-ink-faint mt-1 line-clamp-2">
                          Result: {currentSpan.tool_result_summary}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className={cx(
                    'tile p-3 space-y-2',
                    currentSpan.error_message ? 'border-state-bad/30 bg-state-bad/[0.06]' : ''
                  )}
                >
                  <Eyebrow className={currentSpan.error_message ? 'text-state-bad' : undefined}>
                    Execution Status &amp; Error Signal
                  </Eyebrow>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        'w-2 h-2 rounded-full',
                        currentSpan.status.toUpperCase() === 'ERROR' ? 'bg-state-bad' : 'bg-state-ok'
                      )}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-mono font-semibold text-ink">{currentSpan.status}</span>
                  </div>
                  <p
                    className={cx(
                      'text-xs leading-relaxed font-mono',
                      currentSpan.error_message ? 'text-state-bad' : 'text-ink-faint'
                    )}
                  >
                    {currentSpan.error_message || 'Span executed with no recorded runtime error.'}
                  </p>
                </div>
              </div>
            </Tile>

            {/* Hierarchical Tree Context for the Trace */}
            <Tile className="p-4 space-y-3" hover={false} index={2}>
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-line">
                <Eyebrow>Full Trace Topology (Active Playback Node Highlighted)</Eyebrow>
                <span className="text-2xs font-mono text-ink-faint">
                  Click any span in tree to jump timeline
                </span>
              </div>
              <SpanTreeView
                spans={spans}
                selectedSpanId={currentSpan.span_id}
                totalDurationMs={totalDurationMs}
                minStartTime={minStartTime}
                onSelectSpan={(s) => {
                  const idx = spans.findIndex((x) => x.span_id === s.span_id);
                  if (idx !== -1) setCurrentStepIdx(idx);
                }}
              />
            </Tile>
          </div>

          {/* Right Column: Evidence Inspector with Grounding Cascade & Agent Telemetry */}
          <div className="lg:col-span-1">
            <EvidenceInspectorPanel
              selectedSpan={currentSpan}
              agents={agents}
              isLoading={isLoading}
            />
          </div>
        </div>
      ) : null}
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
        className="glass max-w-lg w-full p-3 space-y-2.5"
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

// ─── 13. Traces Forensic View ───────────────────────────────────────────

function TracesForensicView({
  traces,
  agents,
}: {
  traces: TraceListItem[];
  agents: Agent[];
}) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICAL' | 'WARN' | 'OK'>('ALL');
  const [traceDetail, setTraceDetail] = useState<{ trace: TraceListItem; spans: SpanDetail[]; alerts: AlertItem[] } | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<SpanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default selection to first trace
  useEffect(() => {
    if (!selectedTraceId && traces.length > 0) {
      setSelectedTraceId(traces[0].trace_id);
    }
  }, [traces, selectedTraceId]);

  // Fetch selected trace detail with strict failure hygiene
  useEffect(() => {
    if (!selectedTraceId) {
      setTraceDetail(null);
      setSelectedSpan(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    // State hygiene: immediately clear previous spans and selection
    setTraceDetail(null);
    setSelectedSpan(null);

    api.getTrace(selectedTraceId)
      .then((res) => {
        if (!isMounted) return;
        setTraceDetail(res);
        if (res.spans && res.spans.length > 0) {
          const sorted = [...res.spans].sort(
            (a, b) => (b.evaluation?.overall_risk_score ?? -1) - (a.evaluation?.overall_risk_score ?? -1)
          );
          setSelectedSpan(sorted[0] || res.spans[0]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to retrieve trace session');
        setTraceDetail(null);
        setSelectedSpan(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTraceId]);

  // Filter traces strictly against real fields on TraceListItem
  const filteredTraces = useMemo(() => {
    return traces.filter((t) => {
      // Search matching trace_id, pipeline_id, service_name
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = t.trace_id.toLowerCase().includes(q);
        const matchesPipeline = t.pipeline_id ? t.pipeline_id.toLowerCase().includes(q) : false;
        const matchesService = t.service_name ? t.service_name.toLowerCase().includes(q) : false;
        if (!matchesId && !matchesPipeline && !matchesService) return false;
      }

      // Status/risk filter
      if (statusFilter === 'CRITICAL') {
        const isHighRisk = t.overall_risk_score !== null && t.overall_risk_score > 0.7;
        const isError = t.status.toLowerCase() === 'error' || t.status.toLowerCase() === 'critical';
        return isHighRisk || isError;
      }
      if (statusFilter === 'WARN') {
        return t.overall_risk_score !== null && t.overall_risk_score >= 0.4 && t.overall_risk_score <= 0.7;
      }
      if (statusFilter === 'OK') {
        const isLowRisk = t.overall_risk_score !== null && t.overall_risk_score < 0.4;
        const isSuccess = t.status.toLowerCase() === 'success' || t.status.toLowerCase() === 'ok';
        return isLowRisk || isSuccess;
      }
      return true;
    });
  }, [traces, searchQuery, statusFilter]);

  // Compute duration metrics for selected trace spans
  const { detailTotalDurationMs, detailMinStartTime } = useMemo(() => {
    const spans = traceDetail?.spans || [];
    if (spans.length === 0) return { detailTotalDurationMs: 1, detailMinStartTime: 0 };
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let sumLatency = 0;

    for (const s of spans) {
      const start = s.start_time ? new Date(s.start_time).getTime() : 0;
      const lat = s.latency_ms ?? 0;
      sumLatency += lat;
      if (start > 0) {
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, start + lat);
      }
    }

    const calculated = maxEnd > minStart ? maxEnd - minStart : sumLatency || 1;
    return {
      detailTotalDurationMs: Math.max(calculated, 1),
      detailMinStartTime: minStart === Infinity ? 0 : minStart,
    };
  }, [traceDetail?.spans]);

  return (
    <div className="space-y-4">
      <SectionHead
        title="Execution Traces & Forensics"
        sub="Deep inspection of multi-agent span hierarchies, evaluated grounding claims, and execution trees"
        right={<Eyebrow>{filteredTraces.length} / {traces.length} traces</Eyebrow>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Trace List Filter & Master View */}
        <div className="lg:col-span-4 space-y-3">
          <Tile className="p-3 space-y-3" hover={false} index={0}>
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search trace ID, pipeline, service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter execution traces"
                className="w-full pl-8.5 pr-8 py-1.5 bg-surface-2 border border-line focus:border-signal/50 rounded font-mono text-xs text-ink placeholder:text-ink-faint outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs font-mono"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Buttons */}
            <div className="grid grid-cols-4 gap-1 text-2xs font-mono">
              {(['ALL', 'CRITICAL', 'WARN', 'OK'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={cx(
                    'py-1 text-center rounded border transition-colors cursor-pointer uppercase',
                    statusFilter === filter
                      ? 'bg-surface-3 border-line-strong text-ink font-semibold'
                      : 'border-line/60 text-ink-faint hover:text-ink hover:border-line'
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
          </Tile>

          {/* Master Trace List */}
          <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filteredTraces.length === 0 ? (
              <Tile className="p-6 text-center text-xs font-mono text-ink-faint" hover={false} index={1}>
                No traces match the active filter criteria.
              </Tile>
            ) : (
              filteredTraces.map((t) => {
                const isSelected = selectedTraceId === t.trace_id;
                return (
                  <button
                    key={t.trace_id}
                    onClick={() => setSelectedTraceId(t.trace_id)}
                    aria-selected={isSelected}
                    className={cx(
                      'w-full tile p-3 text-left cursor-pointer transition-all duration-150',
                      isSelected ? 'tile-active bracket-on' : 'tile-hover',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-semibold text-signal truncate">
                        {t.trace_id.slice(0, 18)}…
                      </span>
                      <RiskScorePill score={t.overall_risk_score} />
                    </div>

                    <div className="flex items-center justify-between text-2xs font-mono text-ink-dim">
                      <span className="truncate max-w-[150px]">{t.pipeline_id || t.service_name || 'Unavailable'}</span>
                      <span className="tnum shrink-0 text-ink-faint">{t.total_spans} spans</span>
                    </div>

                    <div className="flex items-center justify-between text-2xs font-mono text-ink-faint mt-1 pt-1 border-t border-line/40">
                      <span>{t.status}</span>
                      <span className="tnum">{new Date(t.start_time).toLocaleTimeString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Forensic Span Tree & Inspector */}
        <div className="lg:col-span-8 space-y-4">
          {isLoading ? (
            <Tile className="p-12 flex flex-col items-center justify-center space-y-3" hover={false} index={1}>
              <RefreshCw className="w-6 h-6 text-signal animate-spin" aria-hidden="true" />
              <p className="text-xs font-mono text-ink-dim">Loading trace session telemetry...</p>
            </Tile>
          ) : error ? (
            <Tile className="p-6 text-center space-y-2 border border-state-bad/30 bg-state-bad/[0.04]" hover={false} index={1}>
              <p className="text-xs font-mono font-semibold text-state-bad">Failed to retrieve trace session</p>
              <p className="text-2xs font-mono text-ink-faint">{error}</p>
            </Tile>
          ) : !traceDetail ? (
            <Tile className="p-12 text-center" hover={false} index={1}>
              <EmptyState
                icon={<Route className="w-7 h-7" />}
                title="No trace selected"
                hint="Select an execution session from the left to inspect its span tree and claims."
              />
            </Tile>
          ) : (
            <div className="space-y-4">
              {/* Selected Trace Header Card */}
              <Tile className="p-4 space-y-2.5" hover={false} index={1}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-line">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Eyebrow>Trace ID</Eyebrow>
                      <span className="font-mono text-xs font-semibold text-signal truncate">
                        {traceDetail.trace.trace_id}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-2xs font-mono text-ink-dim">
                      <span>Service: <strong className="text-ink">{traceDetail.trace.service_name}</strong></span>
                      <span>&bull;</span>
                      <span>Pipeline: <strong className="text-ink">{traceDetail.trace.pipeline_id || 'Unavailable'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <Eyebrow>Total Duration</Eyebrow>
                      <div className="font-mono text-xs font-semibold tnum text-ink">
                        {detailTotalDurationMs.toFixed(1)}ms
                      </div>
                    </div>
                    <div className="pl-3 border-l border-line">
                      <RiskScorePill score={traceDetail.trace.overall_risk_score} label="Session Risk" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-2xs font-mono text-ink-faint pt-0.5">
                  <span>Start: {new Date(traceDetail.trace.start_time).toLocaleString()}</span>
                  <span>Recorded Spans: {traceDetail.spans.length}</span>
                </div>
              </Tile>

              {/* Side-by-side: Span Tree and Evidence Inspector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Span Tree Explorer */}
                <Tile className="p-4 flex flex-col h-full space-y-3" hover={false} index={2}>
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-ink tracking-tight">Span Hierarchy</h3>
                      <p className="text-2xs font-mono text-ink-faint">
                        {traceDetail.spans.length} spans recorded in session
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[580px] pr-1">
                    {traceDetail.spans.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono text-ink-faint">
                        No recorded spans found for this trace.
                      </div>
                    ) : (
                      <SpanTreeView
                        spans={traceDetail.spans}
                        selectedSpanId={selectedSpan?.span_id}
                        onSelectSpan={setSelectedSpan}
                        totalDurationMs={detailTotalDurationMs}
                        minStartTime={detailMinStartTime}
                      />
                    )}
                  </div>
                </Tile>

                {/* Evidence & Grounding Inspector (Reused primitive!) */}
                <div className="h-full">
                  <EvidenceInspectorPanel
                    selectedSpan={selectedSpan}
                    agents={agents}
                    isLoading={false}
                  />
                </div>
              </div>
            </div>
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
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [activeSpans, setActiveSpans] = useState<SpanDetail[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<SpanDetail | null>(null);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
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
  // Rolling buffer of real polled composite-risk values for the waveform
  // readout -- capped so the trace covers a fixed recent window rather than
  // growing unbounded over a long-lived session.
  const [riskHistory, setRiskHistory] = useState<number[]>([]);
  // In-flight alert IDs to prevent duplicate writes
  const [acknowledgingAlertIds, setAcknowledgingAlertIds] = useState<Set<number>>(new Set());
  // Explicit notification error & success banners for incident operations
  const [incidentActionError, setIncidentActionError] = useState<string | null>(null);
  const [incidentActionSuccess, setIncidentActionSuccess] = useState<string | null>(null);

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
      // Bound to a local so the null-narrowing survives into the updater
      // closure -- TypeScript won't carry it through otherwise.
      const risk = m.avg_risk_score;
      if (typeof risk === 'number') {
        setRiskHistory((prev) => [...prev, risk].slice(-60));
      }
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

  // Set default trace when traces load
  useEffect(() => {
    if (!selectedTraceId && traces.length > 0) {
      setSelectedTraceId(traces[0].trace_id);
    }
  }, [traces, selectedTraceId]);

  // Load trace detail whenever selectedTraceId changes (with strict failure hygiene)
  useEffect(() => {
    if (!selectedTraceId) {
      setActiveSpans([]);
      setSelectedSpan(null);
      return;
    }

    let isMounted = true;
    setIsTraceLoading(true);
    setTraceError(null);
    // Immediate state hygiene: clear previous spans so stale data is never shown
    setActiveSpans([]);
    setSelectedSpan(null);

    api.getTrace(selectedTraceId)
      .then((res) => {
        if (!isMounted) return;
        const spans = res.spans || [];
        setActiveSpans(spans);
        if (spans.length > 0) {
          // Select riskiest span by default, or first span
          const sortedByRisk = [...spans].sort(
            (a, b) => (b.evaluation?.overall_risk_score ?? -1) - (a.evaluation?.overall_risk_score ?? -1)
          );
          setSelectedSpan(sortedByRisk[0] || spans[0]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setTraceError(err.message || 'Failed to fetch trace details');
        setActiveSpans([]);
        setSelectedSpan(null);
      })
      .finally(() => {
        if (isMounted) setIsTraceLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTraceId]);

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

  const handleAcknowledgeAlert = async (alertId: number) => {
    // Constraint 3: Prevent duplicate writes while in flight
    if (acknowledgingAlertIds.has(alertId)) return;

    // Constraint 1: Check alert existence
    const previousAlerts = [...alerts];
    const targetAlert = alerts.find((a) => a.id === alertId);
    if (!targetAlert || targetAlert.acknowledged) return;

    // Constraint 2: Pending -> optimistic acknowledged state
    setAcknowledgingAlertIds((prev) => new Set(prev).add(alertId));
    setIncidentActionError(null);
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));

    try {
      await api.acknowledgeAlert(alertId);
      setIncidentActionSuccess(`Alert #${alertId} acknowledged.`);
      setTimeout(() => setIncidentActionSuccess(null), 4000);
    } catch (err: any) {
      // Constraint 2: Revert optimistic state on backend failure & show explicit error
      setAlerts(previousAlerts);
      setIncidentActionError(`Failed to acknowledge alert #${alertId}: ${err?.message || 'Server error'}`);
      setTimeout(() => setIncidentActionError(null), 6000);
    } finally {
      setAcknowledgingAlertIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  };

  const handleSaveCuratedCase = async (datasetName: string, payload: any) => {
    // Constraint 5 & 8: Real backend call & confirmation
    const res = await api.curateCase(datasetName, payload);
    setIncidentActionSuccess(res.message || `Case '${payload.case_id}' curated into '${datasetName}'.`);
    setTimeout(() => setIncidentActionSuccess(null), 4000);
    loadData();
  };

  const openIncidentsCount = alerts.filter(a => !a.acknowledged).length;

  const PAGE_META: Record<NavPage, { title: string; sub: string }> = {
    'overview': { title: 'Fleet Overview', sub: 'LIVE AGENT TOPOLOGY / GROUNDING RISK' },
    'traces': { title: 'Execution Traces', sub: 'MULTI-AGENT SESSIONS / GROUNDING AUDITS' },
    'incidents': { title: 'Incident Inbox', sub: 'TRIGGERED ALERTS / TRIAGE QUEUE' },
    'incident-replay': { title: 'Recorded Execution Replay / Trace Playback', sub: 'RECORDED SPAN CHRONOLOGY / TIMELINE PLAYBACK' },
    'drift': { title: 'Drift & Stability', sub: 'CENTROID DISTANCE / AGENT STABILITY INDEX' },
    'experiments': { title: 'Experiments', sub: 'ABLATION / REASONING STRATEGY BENCHMARKS' },
    'datasets': { title: 'Datasets', sub: 'CURATED EVALUATION CASES' },
    'telemetry-lab': { title: 'Telemetry Lab', sub: 'SCENARIO SIMULATION' },
  };
  const meta = PAGE_META[currentPage];

  return (
    <div className="min-h-screen flex bg-void text-ink font-sans">
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
            {/* Signature readout: composite risk as a live trace, not a static number */}
            <Waveform points={riskHistory} label="Composite risk" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat
                index={0}
                label="Total traces"
                value={metrics?.total_traces ?? 0}
                foot={<Eyebrow>{metrics?.total_spans ?? 0} spans evaluated</Eyebrow>}
              />
              <Stat
                index={1}
                label="Open incidents"
                value={openIncidentsCount}
                tone={openIncidentsCount > 0 ? 'bad' : 'ok'}
                foot={<Eyebrow>{alerts.length} total alerts</Eyebrow>}
              />
              <Stat
                index={2}
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
                  traces={traces}
                  selectedTraceId={selectedTraceId}
                  onSelectTraceId={setSelectedTraceId}
                  spans={activeSpans}
                  selectedSpanId={selectedSpan?.span_id}
                  onSelectSpan={setSelectedSpan}
                  isLoading={isTraceLoading}
                  error={traceError}
                />
              </div>

              <div className="lg:col-span-1">
                <EvidenceInspectorPanel
                  selectedSpan={selectedSpan}
                  agents={agents}
                  isLoading={isTraceLoading}
                />
              </div>
            </div>
          </div>
        ) : currentPage === 'traces' ? (
          <TracesForensicView traces={traces} agents={agents} />
        ) : currentPage === 'incidents' ? (
          <IncidentInboxView
            alerts={alerts}
            onCurateTrace={(al) => setCuratingAlert(al)}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            acknowledgingAlertIds={acknowledgingAlertIds}
            actionError={incidentActionError}
            actionSuccess={incidentActionSuccess}
            onDismissError={() => setIncidentActionError(null)}
          />
        ) : currentPage === 'incident-replay' ? (
          <RecordedTracePlaybackView traces={traces} agents={agents} />
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
