import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { api, type Agent, type SpanDetail, type TraceListItem } from '../lib/api';
import {
  analyseTrace,
  computeTimeline,
  toExecutionOrder,
  type SpanFlag,
} from '../lib/trace';
import { ExecutionView } from '../components/trace/ExecutionView';
import { SpanInspector } from '../components/trace/SpanInspector';
import { TraceHeader } from '../components/trace/TraceHeader';
import { TraceStream } from '../components/trace/TraceStream';

export interface TraceFocus {
  traceId?: string | null;
  agentId?: string | null;
}

/**
 * Trace Workspace.
 *
 * One connected surface rather than three panels: the stream narrows the
 * question, the execution view answers "what happened and where did it turn",
 * and the inspector answers "on what evidence" without taking the execution
 * context off screen.
 *
 * All data comes from `GET /v1/traces/{trace_id}` through the existing client.
 * Nothing here synthesises spans, timings, payloads or scores.
 */
export function TraceWorkspace({
  traces,
  agents,
  focus,
}: {
  traces: TraceListItem[];
  agents: Agent[];
  focus: TraceFocus | null;
}) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(focus?.traceId ?? null);
  const [spans, setSpans] = useState<SpanDetail[]>([]);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [streamOpen, setStreamOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const isWide = useIsWide();

  // Arriving from an incident or the command surface selects that trace.
  useEffect(() => {
    if (focus?.traceId) setSelectedTraceId(focus.traceId);
  }, [focus?.traceId]);

  useEffect(() => {
    if (!selectedTraceId && traces.length > 0) setSelectedTraceId(traces[0].trace_id);
  }, [traces, selectedTraceId]);

  useEffect(() => {
    if (!selectedTraceId) {
      setSpans([]);
      setSelectedSpanId(null);
      setError(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);
    // Clear before the request resolves so a failed or slow load can never
    // leave the previous trace on screen looking like the current one.
    setSpans([]);
    setSelectedSpanId(null);

    api
      .getTrace(selectedTraceId)
      .then((res) => {
        if (!active) return;
        const ordered = toExecutionOrder(res.spans ?? []);
        setSpans(ordered);

        // Open on the span the trace's own findings point at, so the default
        // selection is one the inspector can justify.
        const findings = analyseTrace(ordered);
        const target =
          findings.primaryShift?.toSpanId ??
          findings.riskPeakSpanId ??
          findings.errorSpanIds[0] ??
          ordered[0]?.span_id ??
          null;
        setSelectedSpanId(target);
        if (target && isWide) setInspectorOpen(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSpans([]);
        setSelectedSpanId(null);
        setError(err instanceof Error ? err.message : 'The trace request failed.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
    // isWide is read for the initial inspector state only; re-running this on
    // a viewport change would refetch the trace for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTraceId, reloadToken]);

  const trace = useMemo(
    () => traces.find((t) => t.trace_id === selectedTraceId) ?? null,
    [traces, selectedTraceId],
  );

  const timeline = useMemo(() => computeTimeline(spans), [spans]);
  const findings = useMemo(() => (spans.length > 0 ? analyseTrace(spans) : null), [spans]);

  const selectedSpan = useMemo(
    () => spans.find((s) => s.span_id === selectedSpanId) ?? null,
    [spans, selectedSpanId],
  );

  const selectedFlags: SpanFlag[] = selectedSpanId
    ? (findings?.flags.get(selectedSpanId) ?? [])
    : [];

  const focusAgent = useMemo(
    () => (focus?.agentId ? (agents.find((a) => a.agent_id === focus.agentId) ?? null) : null),
    [agents, focus?.agentId],
  );

  const handleSelectSpan = useCallback((span: SpanDetail) => {
    setSelectedSpanId(span.span_id);
    setInspectorOpen(true);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TraceHeader
        trace={trace}
        spans={spans}
        findings={findings}
        timeline={timeline}
        focusAgent={focusAgent}
      />

      <div className="flex min-h-0 flex-1">
        {streamOpen ? (
          <div className="hidden w-[248px] shrink-0 border-r border-line md:block">
            <TraceStream
              traces={traces}
              selectedTraceId={selectedTraceId}
              onSelect={(id) => {
                setSelectedTraceId(id);
                if (!isWide) setInspectorOpen(false);
              }}
              onCollapse={() => setStreamOpen(false)}
            />
          </div>
        ) : (
          <div className="hidden shrink-0 border-r border-line md:block">
            <button
              onClick={() => setStreamOpen(true)}
              aria-label="Expand trace list"
              title="Expand trace list"
              className="p-2.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Below the stream's breakpoint the list collapses, but changing
              trace has to stay possible — so it becomes a single control
              rather than disappearing. */}
          <div className="border-b border-line px-3 py-2 md:hidden">
            <label className="sr-only" htmlFor="trace-select">
              Select trace
            </label>
            <select
              id="trace-select"
              value={selectedTraceId ?? ''}
              onChange={(e) => {
                setSelectedTraceId(e.target.value);
                setInspectorOpen(false);
              }}
              className="w-full rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs text-ink outline-none transition-colors focus:border-signal/50"
            >
              {traces.length === 0 ? (
                <option value="">No traces recorded</option>
              ) : (
                traces.map((t) => (
                  <option key={t.trace_id} value={t.trace_id}>
                    {t.trace_id.slice(0, 18)} · {t.total_spans} spans
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="min-h-0 flex-1">
            <ExecutionView
              spans={spans}
              timeline={timeline}
              findings={findings}
              selectedSpanId={selectedSpanId}
              onSelectSpan={handleSelectSpan}
              focusAgentId={focus?.agentId ?? null}
              isLoading={isLoading}
              error={error}
              onRetry={() => setReloadToken((n) => n + 1)}
              hasTrace={traces.length > 0}
            />
          </div>
        </div>

        {isWide && inspectorOpen && (
          <div className="w-[336px] shrink-0 border-l border-line">
            <SpanInspector
              span={selectedSpan}
              flags={selectedFlags}
              timeline={timeline}
              onClose={() => setInspectorOpen(false)}
              variant="column"
            />
          </div>
        )}
      </div>

      {/* Below the column breakpoint the inspector slides over. No backdrop:
          the execution view stays legible and clickable behind it. */}
      {!isWide && inspectorOpen && selectedSpan && (
        <SpanInspector
          span={selectedSpan}
          flags={selectedFlags}
          timeline={timeline}
          onClose={() => setInspectorOpen(false)}
          variant="overlay"
        />
      )}
    </div>
  );
}

/** Tracks the breakpoint at which the inspector can hold its own column. */
function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}
