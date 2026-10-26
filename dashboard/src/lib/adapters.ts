/** Maps AgentPulse REST responses onto the UI's view models.
 *
 * Rule for this file: every field is either read from the API or left
 * undefined. Nothing is filled in with a plausible-looking default, because a
 * value the backend never measured would be indistinguishable from one it did.
 */

import type {
  Agent as ApiAgent,
  AlertItem,
  SpanDetail,
  TraceListItem,
} from './api';
import type {
  Agent,
  AgentStatus,
  Dataset,
  DriftProfile,
  EvaluatorResult,
  Experiment,
  Incident,
  Span,
  SpanType,
  SpanStatus,
  Trace,
  TraceAlert,
} from '../types';
import { verdictLabel, verdictTooltip } from './riskTone';

export interface DriftEntry {
  agent_id: string;
  current_asi: number | null;
  latest_centroid_distance: number | null;
  latest_window_centroid_distance?: number | null;
  latest_tool_drift?: number | null;
  baseline_size?: number;
}

// Matches AGENTPULSE_DRIFT_THRESHOLD in backend/app/config.py. Exported so the Agents and
// Drift views colour and explain a distance against the same number the alert uses.
export const DRIFT_THRESHOLD = 0.3;

function agentStatus(agent: ApiAgent, drift?: DriftEntry): AgentStatus {
  const window = drift?.latest_window_centroid_distance;
  if (window != null && window > DRIFT_THRESHOLD) return 'critical';
  if (agent.error_rate > 0.25) return 'critical';
  if (agent.error_rate > 0) return 'warning';
  const asi = drift?.current_asi ?? agent.current_asi;
  if (asi != null && asi < 80) return 'warning';
  return 'idle';
}

// How many of the agent's spans the drift detector had seen, the latest included. baseline_size
// is the count before the latest record, hence + 1. GET /v1/drift answers baseline_size 0 with
// both distances null for an agent that has no drift record at all: that is unknown, not 1.
// The count includes spans with no output text, which add nothing to the embedding pools, so
// "20 or more" means the baseline should be full, not that it certainly is.
function driftSpansSeen(d?: DriftEntry): number | undefined {
  if (!d || d.baseline_size == null) return undefined;
  if (d.baseline_size === 0 && d.latest_centroid_distance == null && d.latest_window_centroid_distance == null) {
    return undefined;
  }
  return d.baseline_size + 1;
}

export function toAgents(apiAgents: ApiAgent[], drift: DriftEntry[]): Agent[] {
  const byId = new Map(drift.map((d) => [d.agent_id, d]));
  return apiAgents.map((a) => {
    const d = byId.get(a.agent_id);
    const window = d?.latest_window_centroid_distance;
    return {
      id: a.agent_id,
      name: a.agent_id,
      // agent_role is the only descriptive label the backend records.
      description: a.agent_role ?? undefined,
      status: agentStatus(a, d),
      latencyAvgMs: a.avg_latency_ms ?? undefined,
      // Percentage: the roster compares this against 90 and appends '%'. Rounded to one
      // decimal here, because (1 - 0.1667) * 100 is 83.33000000000001 in floating point and
      // three views printed it raw.
      successRate: Math.round((1 - a.error_rate) * 1000) / 10,
      lastActive: a.last_seen,
      // Lifetime span count, not a 24h trace window; the card is labelled
      // 'Spans Ingested' to match what this actually is.
      totalTraces24h: a.total_spans,
      // Null until an agent's baseline and current drift windows both fill.
      driftScore: window ?? undefined,
      driftStatus:
        window == null ? undefined : window > DRIFT_THRESHOLD ? 'drift' : 'normal',
      driftSpansSeen: driftSpansSeen(d),
      // version, model, framework, tools and costPerHour have no source in
      // the AgentPulse schema and stay absent.
    };
  });
}

function spanType(span: SpanDetail): SpanType {
  if (span.tool_name) return 'tool';
  if (span.evaluation) return 'evaluator';
  if (span.model) return 'model';
  return 'agent';
}

function spanStatus(span: SpanDetail): SpanStatus {
  if (span.status?.toUpperCase() === 'ERROR') return 'error';
  const risk = span.evaluation?.overall_risk_score;
  if (risk != null && risk > 0.5) return 'warning';
  return 'ok';
}

/** Signal cards for the inspector, built only from scores the backend stored.
 *  Maturity tiers mirror how the project documents each signal. */
function evaluatorResults(span: SpanDetail): EvaluatorResult[] | undefined {
  const e = span.evaluation;
  if (!e) return undefined;
  const out: EvaluatorResult[] = [];
  if (e.grounding_score != null) {
    const engine =
      e.evaluation_stage === 'stage2' ? 'DeBERTa-v3 NLI cross-encoder' : 'MiniLM cosine gate';
    // The verdict is what the NLI model concluded, next to the risk score and not part of
    // it: a neutral-only output scores about 0.3 (low risk) and is 'unverifiable'. It is
    // absent for the similarity-only fallback, so the reason then names only the engine.
    const verdict = e.grounding_verdict ?? undefined;
    out.push({
      id: `${span.span_id}-grounding`,
      name: 'Grounding',
      score: e.grounding_score,
      threshold: 0.7,
      passed: e.grounding_score <= 0.7,
      maturity: 'BETA',
      reason: verdict
        ? `${engine}. Verdict: ${verdictLabel(verdict)}. ${verdictTooltip(verdict)}`
        : engine,
      verdict,
    });
  }
  if (e.tool_claim_score != null) {
    out.push({
      id: `${span.span_id}-toolclaim`,
      name: 'Tool Claim',
      score: e.tool_claim_score,
      threshold: 0,
      passed: e.tool_claim_score === 0,
      maturity: 'EXPERIMENTAL',
      reason: 'Regex claim extraction against recorded tool results',
    });
  }
  return out.length ? out : undefined;
}

export function toSpans(spans: SpanDetail[], traceId: string): Span[] {
  const starts = spans
    .map((s) => Date.parse(s.start_time))
    .filter((t) => Number.isFinite(t));
  const t0 = starts.length ? Math.min(...starts) : 0;

  return spans.map((s) => {
    const start = Date.parse(s.start_time);
    const tokens =
      s.tokens_in != null || s.tokens_out != null
        ? {
            prompt: s.tokens_in ?? 0,
            completion: s.tokens_out ?? 0,
            total: (s.tokens_in ?? 0) + (s.tokens_out ?? 0),
          }
        : undefined;

    return {
      id: s.span_id,
      traceId,
      parentSpanId: s.parent_span_id ?? undefined,
      name: s.event_type || s.agent_id,
      type: spanType(s),
      status: spanStatus(s),
      startOffsetMs: Number.isFinite(start) ? start - t0 : 0,
      // durationMs stays a number because the waterfall lays bars out with it; latencyMs keeps
      // "not recorded" apart from 0 so the views print a dash instead of "0ms".
      durationMs: s.latency_ms ?? 0,
      latencyMs: s.latency_ms ?? undefined,
      agentLane: s.agent_id,
      model: s.model ?? undefined,
      prompt: s.input_summary ?? undefined,
      completion: s.output_summary ?? undefined,
      toolName: s.tool_name ?? undefined,
      toolOutput: s.tool_result_summary ?? undefined,
      tokens,
      error: s.error_message ?? undefined,
      evaluatorResults: evaluatorResults(s),
      // cost and evidence have no backend source.
    };
  });
}

function toTraceAlert(a: AlertItem): TraceAlert {
  return {
    id: a.id,
    alertType: a.alert_type,
    severity: a.severity,
    message: a.message,
    agentId: a.agent_id ?? undefined,
    spanId: a.span_id ?? undefined,
    acknowledged: a.acknowledged,
    resolved: a.resolved,
    createdAt: a.created_at,
  };
}

/** Pass `alerts` only when the trace detail was loaded. Without it the trace is a list entry:
 *  its alerts and drift flag are unknown, not empty and not false. */
export function toTrace(
  t: TraceListItem,
  spans: Span[] = [],
  alerts?: AlertItem[],
): Trace {
  const duration =
    t.end_time && t.start_time
      ? Math.max(0, Date.parse(t.end_time) - Date.parse(t.start_time))
      : spans.reduce((acc, s) => Math.max(acc, s.startOffsetMs + s.durationMs), 0);

  const totalTokens = spans.reduce((acc, s) => acc + (s.tokens?.total ?? 0), 0);
  const status = t.status?.toUpperCase();

  return {
    id: t.trace_id,
    agentId: spans[0]?.agentLane ?? t.service_name,
    agentName: spans[0]?.agentLane ?? t.service_name,
    rootSpanId: spans[0]?.id ?? '',
    status: status === 'ERROR' ? 'error' : status === 'RUNNING' ? 'warning' : 'ok',
    durationMs: duration,
    totalTokens: totalTokens || undefined,
    timestamp: t.start_time,
    inputPreview: spans[0]?.prompt ?? '',
    outputPreview: spans[spans.length - 1]?.completion ?? '',
    spans,
    driftDetected: alerts ? alerts.some((a) => a.alert_type === 'DRIFT_DETECTED') : undefined,
    alerts: alerts?.map(toTraceAlert),
    groundingScore: t.overall_risk_score ?? undefined,
    // sessionId, cost and tags have no backend source.
  };
}

export function toIncidents(alerts: AlertItem[]): Incident[] {
  return alerts.map((a) => {
    const sev = a.severity?.toLowerCase();
    return {
      id: String(a.id),
      title: a.alert_type.replace(/_/g, ' '),
      severity: sev === 'critical' || sev === 'high' ? 'critical' : sev === 'medium' || sev === 'warning' ? 'warning' : 'info',
      agentId: a.agent_id ?? '',
      agentName: a.agent_id ?? 'unknown',
      traceId: a.trace_id ?? '',
      spanId: a.span_id ?? undefined,
      detectedAt: a.created_at,
      status: a.resolved ? 'resolved' : a.acknowledged ? 'investigating' : 'open',
      // The alert message is the detector's own explanation.
      summary: a.message,
      // rootCause, suggestedAction and affectedRunsCount are not produced by
      // the alerting service.
    };
  });
}

export function toDriftProfiles(drift: DriftEntry[]): DriftProfile[] {
  return drift.map((d) => ({
    agentId: d.agent_id,
    agentName: d.agent_id,
    driftMagnitude: d.latest_window_centroid_distance ?? undefined,
    semanticDrift: d.latest_centroid_distance ?? undefined,
    toolCallDrift: d.latest_tool_drift ?? undefined,
    baselineSampleCount: d.baseline_size ?? 0,
    // currentSampleCount is left absent: the API does not report how full the current
    // window is (it used to be a hard-coded 0, printed as "Active Sample: 0").
    // The backend exposes distances, not the embedding coordinates a
    // scatter plot would need.
    points: [],
    driftReason:
      d.latest_window_centroid_distance == null
        ? 'Drift windows have not filled yet'
        : d.latest_window_centroid_distance > DRIFT_THRESHOLD
        ? `Sustained window centroid distance ${d.latest_window_centroid_distance.toFixed(3)} exceeds ${DRIFT_THRESHOLD}`
        : 'Within baseline bounds',
    // clusterDivergence and parameterDrift are not computed by the service.
  }));
}

export function toDatasets(raw: unknown[]): Dataset[] {
  return (raw as Record<string, any>[]).map((d, i) => ({
    id: String(d.dataset_name ?? i),
    name: String(d.dataset_name ?? 'unnamed'),
    description: d.dataset_version ? `Version ${d.dataset_version}` : '',
    itemCount: Number(d.total_cases ?? 0),
    createdAt: String(d.created_at ?? ''),
    updatedAt: String(d.updated_at ?? d.created_at ?? ''),
    tags: d.dataset_version ? [String(d.dataset_version)] : [],
    items: [],
  }));
}

/** One entry per experiment from GET /v1/experiments. For a result file the API sends the
 *  file name, and the file's own timestamp, model and dataset when it has them (each may be
 *  null). The file name is used as the id and the name, so each card says which file it is. */
export function toExperiments(raw: unknown[]): Experiment[] {
  return (raw as Record<string, any>[]).map((e, i) => ({
    id: String(e.file ?? e.run_id ?? e.experiment_id ?? `run-${i + 1}`),
    name: String(e.name ?? e.experiment_name ?? e.file ?? e.model ?? `run ${i + 1}`),
    sourceFile: e.file ?? undefined,
    model: e.model ?? e.model_name ?? undefined,
    datasetId: String(e.dataset ?? e.dataset_version ?? ''),
    datasetName: String(e.dataset ?? e.dataset_version ?? ''),
    evaluators: [],
    status: 'completed',
    createdAt: String(e.timestamp ?? e.created_at ?? ''),
    // Scores, win rate, run count, insights and per-item diffs vary by result file and are
    // not exposed in a single shape, so they are left absent; ExperimentsView prints a dash.
  }));
}
