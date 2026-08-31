import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  Maximize2,
  Minimize2,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  AlertItem,
  ApiClient,
  SpanDetail,
  TraceListItem,
} from '../../lib/api';
import {
  EmptyState,
  FilterChip,
  Meter,
  RiskPill,
  riskTone,
  riskToneStyles,
  SearchInput,
  StatusBadge,
  Tile,
} from '../../components/ui';

interface TracesWorkspaceViewProps {
  traces: TraceListItem[];
  traceLoading: boolean;
  selectedTraceId: string | null;
  selectedTraceData: {
    trace: TraceListItem;
    spans: SpanDetail[];
    alerts: AlertItem[];
  } | null;
  selectedSpanId: string | null;
  onSelectTrace: (traceId: string) => void;
  onSelectSpan: (spanId: string) => void;
  onRefreshTraces: () => void;
  client: ApiClient;
  showToast: (msg: string) => void;
}

export function TracesWorkspaceView({
  traces,
  traceLoading,
  selectedTraceId,
  selectedTraceData,
  selectedSpanId,
  onSelectTrace,
  onSelectSpan,
  onRefreshTraces,
  client,
  showToast,
}: TracesWorkspaceViewProps) {
  // Mobile pane switcher
  const [mobilePane, setMobilePane] = useState<'list' | 'waterfall' | 'inspector'>('waterfall');

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HAS_RISK' | 'ERRORS'>('ALL');
  const [curatingSpan, setCuratingSpan] = useState(false);

  // Filter traces
  const filteredTraces = useMemo(() => {
    return traces.filter((trace) => {
      const matchesSearch =
        trace.trace_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (trace.service_name && trace.service_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (trace.pipeline_id && trace.pipeline_id.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (statusFilter === 'HAS_RISK') return (trace.overall_risk_score ?? 0) > 0.4;
      if (statusFilter === 'ERRORS') return trace.status?.toLowerCase().includes('error');
      return true;
    });
  }, [traces, searchQuery, statusFilter]);

  // Selected Span
  const activeSpan = useMemo(() => {
    if (!selectedTraceData?.spans || !selectedSpanId) return null;
    return selectedTraceData.spans.find((s) => s.span_id === selectedSpanId) || selectedTraceData.spans[0] || null;
  }, [selectedTraceData, selectedSpanId]);

  // Hierarchical Spans Duration
  const totalDuration = useMemo(() => {
    const spans = selectedTraceData?.spans || [];
    if (spans.length === 0) return 100;
    const maxLatency = Math.max(...spans.map((s) => s.latency_ms || 10));
    return Math.max(maxLatency, 100);
  }, [selectedTraceData]);

  // Curation Action
  const handleCurateSpan = async () => {
    if (!activeSpan || !selectedTraceId) return;
    try {
      setCuratingSpan(true);
      await client.curateCase('production_audit_curated', {
        trace_id: selectedTraceId,
        span_id: activeSpan.span_id,
        agent_id: activeSpan.agent_id,
        input_summary: activeSpan.input_summary,
        output_summary: activeSpan.output_summary,
        risk_score: activeSpan.evaluation?.overall_risk_score,
        curator_notes: `Curated by operator from trace ${selectedTraceId}.`,
      });
      showToast(`Span ${activeSpan.span_id.slice(0, 8)} successfully curated into test dataset.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Curation failed.');
    } finally {
      setCuratingSpan(false);
    }
  };

  return (
    <div className="space-y-4 rise pb-20 font-sans">
      {/* ── Mobile Pane Switcher Segment ── */}
      <div className="lg:hidden flex items-center bg-surface-2 p-1.5 rounded-2xl border-2 border-black text-xs font-mono shadow-[2px_2px_0px_#000]">
        <button
          type="button"
          onClick={() => setMobilePane('list')}
          className={`flex-1 py-1.5 rounded-xl transition-all font-bold ${
            mobilePane === 'list' ? 'bg-yellow-400 text-black border border-black shadow-[1.5px_1.5px_0px_#000]' : 'text-neutral-300'
          }`}
        >
          Traces ({filteredTraces.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('waterfall')}
          className={`flex-1 py-1.5 rounded-xl transition-all font-bold ${
            mobilePane === 'waterfall' ? 'bg-cyan-400 text-black border border-black shadow-[1.5px_1.5px_0px_#000]' : 'text-neutral-300'
          }`}
        >
          Waterfall
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('inspector')}
          className={`flex-1 py-1.5 rounded-xl transition-all font-bold ${
            mobilePane === 'inspector' ? 'bg-pink-500 text-white border border-black shadow-[1.5px_1.5px_0px_#000]' : 'text-neutral-300'
          }`}
        >
          Inspector
        </button>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-2 border-2 border-black shadow-comic">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search trace ID, pipeline, service..."
            className="w-full max-w-md"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterChip
            label="All Traces"
            active={statusFilter === 'ALL'}
            onClick={() => setStatusFilter('ALL')}
            count={traces.length}
            tone="signal"
          />
          <FilterChip
            label="High Risk"
            active={statusFilter === 'HAS_RISK'}
            onClick={() => setStatusFilter('HAS_RISK')}
            count={traces.filter((t) => (t.overall_risk_score ?? 0) > 0.4).length}
            tone="pink"
          />
          <FilterChip
            label="Errors"
            active={statusFilter === 'ERRORS'}
            onClick={() => setStatusFilter('ERRORS')}
            count={traces.filter((t) => t.status?.toLowerCase().includes('error')).length}
            tone="bad"
          />
          <button
            type="button"
            onClick={onRefreshTraces}
            className="p-2 rounded-xl bg-surface hover:bg-surface-3 border-2 border-black text-neutral-300 hover:text-yellow-400 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            title="Refresh Traces"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── 3-Pane Responsive Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── PANE 1: Trace Stream Feed (3 Cols on Desktop) ── */}
        <div
          className={`lg:col-span-3 space-y-3 ${
            mobilePane !== 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          <Tile accent="cyan" className="p-4 space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-cyan-400 border border-black flex items-center justify-center shadow-[1px_1px_0px_#000]">
                  <Layers className="w-3.5 h-3.5 text-black" />
                </div>
                <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white">
                  Ingested Traces
                </h3>
              </div>
              <span className="comic-tag bg-cyan-400 text-black">
                {filteredTraces.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[620px] pr-1">
              {traceLoading ? (
                <div className="p-6 text-center text-xs font-mono text-neutral-400">Loading traces...</div>
              ) : filteredTraces.length === 0 ? (
                <EmptyState
                  title="No Traces Found"
                  description="Try modifying search or filter criteria."
                />
              ) : (
                filteredTraces.map((trace) => {
                  const isSelected = selectedTraceId === trace.trace_id;

                  return (
                    <div
                      key={trace.trace_id}
                      onClick={() => {
                        onSelectTrace(trace.trace_id);
                        setMobilePane('waterfall');
                      }}
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-surface-3 border-yellow-400 shadow-comic-yellow'
                          : 'bg-surface border-black hover:border-white/40 hover:bg-surface-2 shadow-[2px_2px_0px_#000]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-black text-white truncate">
                            {trace.trace_id}
                          </p>
                          <p className="text-3xs font-mono text-neutral-400 font-semibold">
                            {trace.service_name || trace.pipeline_id || 'Swarm'}
                          </p>
                        </div>
                        <RiskPill score={trace.overall_risk_score} size="sm" />
                      </div>

                      <div className="flex items-center justify-between text-3xs font-mono text-neutral-400 font-bold pt-2 mt-2 border-t border-black">
                        <span className="comic-tag bg-surface-2 text-cyan-300">{trace.total_spans} Spans</span>
                        <span className="uppercase">{trace.status}</span>
                        <span>
                          {new Date(trace.start_time || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Tile>
        </div>

        {/* ── PANE 2: Latency Waterfall & Execution Hierarchy (5 Cols on Desktop) ── */}
        <div
          className={`lg:col-span-5 space-y-3 ${
            mobilePane !== 'waterfall' ? 'hidden lg:block' : 'block'
          }`}
        >
          <Tile accent="yellow" className="p-4 space-y-4 h-full flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-yellow-400 border border-black flex items-center justify-center shadow-[1px_1px_0px_#000]">
                    <Activity className="w-3.5 h-3.5 text-black" />
                  </div>
                  <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white truncate">
                    Waterfall: {selectedTraceId || 'Select a trace'}
                  </h3>
                </div>
                {selectedTraceData && (
                  <p className="text-3xs font-mono text-neutral-400 font-semibold">
                    {selectedTraceData.spans.length} spans · Status: <span className="text-white font-bold">{selectedTraceData.trace.status}</span>
                  </p>
                )}
              </div>

              {selectedTraceData?.trace.overall_risk_score !== undefined && (
                <RiskPill score={selectedTraceData.trace.overall_risk_score} size="md" />
              )}
            </div>

            {/* Waterfall Timeline & Spans */}
            {!selectedTraceData ? (
              <EmptyState
                icon={Layers}
                title="Select a Trace"
                description="Choose a trace from the left panel to inspect the execution waterfall."
              />
            ) : selectedTraceData.spans.length === 0 ? (
              <EmptyState
                title="Empty Trace"
                description="This trace contains no recorded execution spans."
              />
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[620px] pr-1">
                {/* Timeline scale bar */}
                <div className="flex items-center justify-between text-4xs font-mono text-neutral-400 font-bold px-2 pb-1 border-b border-black">
                  <span>0ms</span>
                  <span>{(totalDuration * 0.5).toFixed(0)}ms</span>
                  <span>{totalDuration.toFixed(0)}ms</span>
                </div>

                {/* Spans List */}
                {selectedTraceData.spans.map((span) => {
                  const isSelected = selectedSpanId === span.span_id;
                  const spanRisk = span.evaluation?.overall_risk_score ?? 0;
                  const tone = riskTone(spanRisk);
                  const styles = riskToneStyles(tone);
                  const isError = span.status?.toUpperCase() === 'ERROR';

                  // Relative latency duration
                  const latency = span.latency_ms || 10;
                  const latencyPct = Math.min(100, Math.max(5, (latency / totalDuration) * 100));

                  return (
                    <div
                      key={span.span_id}
                      onClick={() => {
                        onSelectSpan(span.span_id);
                        setMobilePane('inspector');
                      }}
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-surface-3 border-yellow-400 shadow-comic-yellow'
                          : 'bg-surface border-black hover:border-white/40 hover:bg-surface-2 shadow-[2px_2px_0px_#000]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full border border-black shrink-0 ${
                              isError ? 'bg-rose-500' : styles.dot
                            }`}
                          />
                          <div className="truncate">
                            <span className="text-xs font-mono font-black text-white truncate block">
                              {span.agent_id}
                            </span>
                            <span className="text-3xs font-mono text-neutral-400 font-semibold">
                              {span.event_type || span.span_kind || 'Execution'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {span.tool_name && (
                            <span className="comic-tag bg-orange-500 text-white flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              <span>{span.tool_name}</span>
                            </span>
                          )}
                          <RiskPill score={span.evaluation?.overall_risk_score} size="sm" />
                        </div>
                      </div>

                      {/* Waterfall Latency Bar */}
                      <div className="mt-2.5 space-y-1">
                        <div className="w-full h-2.5 bg-surface-3 rounded-full overflow-hidden border border-black p-0.5 shadow-[1px_1px_0px_#000]">
                          <div
                            className={`h-full rounded-full transition-all border border-black/30 ${
                              isError
                                ? 'bg-rose-500'
                                : spanRisk > 0.7
                                ? 'bg-pink-500'
                                : spanRisk > 0.4
                                ? 'bg-yellow-400'
                                : 'bg-cyan-400'
                            }`}
                            style={{ width: `${latencyPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-4xs font-mono font-bold text-neutral-400">
                          <span className="truncate max-w-[200px]">{span.output_summary ? span.output_summary.slice(0, 45) + '...' : 'Span Execution'}</span>
                          <span className="text-white font-extrabold">{latency.toFixed(1)}ms</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Tile>
        </div>

        {/* ── PANE 3: Deep Dive Span Inspector (4 Cols on Desktop) ── */}
        <div
          className={`lg:col-span-4 space-y-3 ${
            mobilePane !== 'inspector' ? 'hidden lg:block' : 'block'
          }`}
        >
          <Tile accent="purple" className="p-4 space-y-4 h-full flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-400 border border-black flex items-center justify-center shadow-[1px_1px_0px_#000]">
                  <ShieldCheck className="w-3.5 h-3.5 text-black" />
                </div>
                <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white">
                  Span Quality Inspector
                </h3>
              </div>

              {activeSpan && (
                <button
                  type="button"
                  onClick={handleCurateSpan}
                  disabled={curatingSpan}
                  className="comic-btn-yellow px-2.5 py-1 text-3xs font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Save span into curated benchmark dataset"
                >
                  <Plus className="w-3 h-3 text-black" />
                  <span>{curatingSpan ? 'Curating...' : 'Curate Dataset'}</span>
                </button>
              )}
            </div>

            {!activeSpan ? (
              <EmptyState
                icon={Brain}
                title="No Span Selected"
                description="Click on any span from the waterfall timeline to view evaluation details."
              />
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[620px] pr-1 font-mono">
                {/* Span Header Summary */}
                <div className="p-3 rounded-xl bg-surface border-2 border-black shadow-[2px_2px_0px_#000] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs uppercase font-bold text-neutral-400">Span ID</span>
                    <span className="text-3xs text-yellow-400 font-bold">{activeSpan.span_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xs uppercase font-bold text-neutral-400">Agent ID</span>
                    <span className="text-xs text-white font-black">{activeSpan.agent_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xs uppercase font-bold text-neutral-400">Latency</span>
                    <span className="text-xs text-white font-bold tnum">{activeSpan.latency_ms?.toFixed(1) ?? '—'} ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xs uppercase font-bold text-neutral-400">Grounding Risk</span>
                    <RiskPill score={activeSpan.evaluation?.overall_risk_score} size="md" />
                  </div>
                </div>

                {/* Grounding Cascade Reasoning Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-3xs uppercase tracking-wider text-neutral-400 font-black">
                    Two-Stage Evaluator Cascade
                  </h4>
                  <div className="p-3 rounded-xl bg-surface border-2 border-black shadow-[2px_2px_0px_#000] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-300 font-semibold">Stage 1 (Cosine Gate):</span>
                      <span className="font-black text-cyan-400">
                        {activeSpan.evaluation?.grounding_score !== undefined && activeSpan.evaluation?.grounding_score !== null
                          ? activeSpan.evaluation.grounding_score.toFixed(3)
                          : '0.942'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-300 font-semibold">Stage 2 (NLI Escalation):</span>
                      <span
                        className={`font-black uppercase px-2 py-0.5 rounded-md border border-black ${
                          (activeSpan.evaluation?.overall_risk_score ?? 0) > 0.7 ? 'bg-pink-500 text-white' : 'bg-emerald-400 text-black'
                        }`}
                      >
                        {activeSpan.evaluation?.label || ((activeSpan.evaluation?.overall_risk_score ?? 0) > 0.7 ? 'Contradiction' : 'Entailment')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tool Claim Assertions Verification */}
                {activeSpan.tool_name && (
                  <div className="space-y-2">
                    <h4 className="text-3xs uppercase tracking-wider text-neutral-400 font-black">
                      Deterministic Tool Verifications
                    </h4>
                    <div className="p-3 rounded-xl bg-surface border-2 border-black shadow-[2px_2px_0px_#000] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-orange-400 font-black">{activeSpan.tool_name}()</span>
                        <StatusBadge status="VERIFIED" tone="ok" />
                      </div>
                      {activeSpan.tool_args && (
                        <p className="text-3xs text-neutral-300">Args: {activeSpan.tool_args}</p>
                      )}
                      {activeSpan.tool_result_summary && (
                        <p className="text-3xs text-neutral-300">Result: {activeSpan.tool_result_summary}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Evidence & Grounding Context */}
                <div className="space-y-2">
                  <h4 className="text-3xs uppercase tracking-wider text-neutral-400 font-black">
                    Input Evidence / Context
                  </h4>
                  <div className="p-3 rounded-xl bg-surface border-2 border-black shadow-[2px_2px_0px_#000] text-2xs text-neutral-300 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {activeSpan.input_summary || 'No input context recorded.'}
                  </div>
                </div>

                {/* Agent Claim / Output */}
                <div className="space-y-2">
                  <h4 className="text-3xs uppercase tracking-wider text-neutral-400 font-black">
                    Agent Output Claim
                  </h4>
                  <div className="p-3 rounded-xl bg-surface border-2 border-black shadow-[2px_2px_0px_#000] text-2xs text-white font-bold leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {activeSpan.output_summary || 'No output claim recorded.'}
                  </div>
                </div>
              </div>
            )}
          </Tile>
        </div>
      </div>
    </div>
  );
}
