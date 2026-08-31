/** Typed REST client for a single AgentPulse instance. */

export interface AgentPulseConnection {
  baseUrl: string;
  apiKey?: string;
}

export interface ApiReadiness {
  ready: boolean;
  checks: {
    database?: { ok: boolean; detail?: string };
  };
  reasons: string[];
}

export interface EvaluatorReadiness {
  ready: boolean;
  workers_alive: number;
  workers_registered: number;
  workers_stale: number;
  degraded: boolean;
  reasons: string[];
}

export interface PlatformHealth {
  state: 'healthy' | 'degraded' | 'backlogged' | 'failing' | 'starting';
  reasons: string[];
  evaluation_queue: {
    depth: number;
    backlog_threshold: number;
    by_status?: {
      queued?: number;
      running?: number;
      succeeded?: number;
      failed?: number;
      dead_letter?: number;
    };
  };
  workers: {
    alive?: number;
    registered?: number;
  };
}

export interface Metrics {
  total_traces: number;
  total_spans: number;
  total_agents: number;
  unacknowledged_alerts: number;
  avg_risk_score: number | null;
  avg_latency_ms: number | null;
  error_rate: number;
  total_errors: number;
}

export interface TraceListItem {
  trace_id: string;
  pipeline_id: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  total_spans: number;
  overall_risk_score: number | null;
  service_name: string;
}

export interface SpanDetail {
  span_id: string;
  parent_span_id: string | null;
  agent_id: string;
  agent_role: string | null;
  event_type: string;
  span_kind: string;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tool_name: string | null;
  tool_args?: string | null;
  tool_result_summary?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  start_time: string;
  evaluation: {
    grounding_score: number | null;
    tool_claim_score: number | null;
    overall_risk_score: number | null;
    label: string | null;
    evaluation_stage: string | null;
  } | null;
}

export interface Agent {
  agent_id: string;
  agent_role: string | null;
  pipeline_id: string | null;
  first_seen: string;
  last_seen: string;
  total_spans: number;
  total_errors: number;
  error_rate: number;
  avg_latency_ms: number | null;
  avg_risk_score: number | null;
  current_asi: number | null;
}

export interface AlertItem {
  id: number;
  alert_type: string;
  severity: string;
  message: string;
  agent_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  acknowledged: boolean;
  resolved: boolean;
  created_at: string;
  details: Record<string, unknown> | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function requestUrl(baseUrl: string, path: string): string {
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function websocketUrlFor(connection: AgentPulseConnection): string {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  const resolvedBase = baseUrl || window.location.origin;
  return `${resolvedBase.replace(/^http/, 'ws')}/v1/ws/live`;
}

export function createApiClient(connection: AgentPulseConnection) {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  const apiKey = connection.apiKey?.trim();

  async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (apiKey) {
      headers.set('X-API-Key', apiKey);
    }

    const response = await fetch(requestUrl(baseUrl, path), { ...options, headers });
    if (!response.ok) {
      if (response.status === 503) {
        try {
          return (await response.json()) as T;
        } catch {
          // ignore parse failure and throw
        }
      }
      throw new ApiError(`API request failed: ${response.status} ${response.statusText}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  return {
    getReadiness: () => fetchApi<ApiReadiness>('/v1/health/ready'),
    getEvaluatorReadiness: () => fetchApi<EvaluatorReadiness>('/v1/health/evaluator'),
    getPlatformHealth: () => fetchApi<PlatformHealth>('/v1/platform'),
    getMetrics: () => fetchApi<Metrics>('/v1/metrics'),
    getTraces: (limit = 50, offset = 0) =>
      fetchApi<{ traces: TraceListItem[]; total: number }>(`/v1/traces?limit=${limit}&offset=${offset}`),
    getTrace: (traceId: string) =>
      fetchApi<{ trace: TraceListItem; spans: SpanDetail[]; alerts: AlertItem[] }>(`/v1/traces/${traceId}`),
    getAgents: () => fetchApi<{ agents: Agent[] }>('/v1/agents'),
    getAgentHealth: (agentId: string) =>
      fetchApi<{
        agent: Agent;
        risk_trend: { timestamp: string; risk_score: number | null }[];
        drift_trend: { timestamp: string; centroid_distance: number | null; stability_index: number | null }[];
      }>(`/v1/agents/${agentId}/health`),
    getDrift: () =>
      fetchApi<{
        agents: {
          agent_id: string;
          current_asi: number | null;
          latest_centroid_distance: number | null;
          // Null until the baseline and current windows both fill.
          latest_window_centroid_distance?: number | null;
          latest_tool_drift?: number | null;
          baseline_size?: number;
        }[];
      }>('/v1/drift'),
    getAlerts: (limit = 50) => fetchApi<{ alerts: AlertItem[] }>(`/v1/alerts?limit=${limit}`),
    acknowledgeAlert: (id: number) =>
      fetchApi<{ status: string }>(`/v1/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ acknowledged: true }),
      }),
    simulatePipeline: (scenario = 'clean', query = 'Multi-agent LLM reasoning') =>
      fetchApi<{ accepted: number; message: string }>('/v1/simulate', {
        method: 'POST',
        body: JSON.stringify({ scenario, query }),
      }),
    ingestSpans: (spans: unknown[]) =>
      fetchApi<{ accepted: number; failed: number; message: string; errors: string[] }>('/v1/ingest', {
        method: 'POST',
        body: JSON.stringify({ spans }),
      }),
    getExperiments: () => fetchApi<{ experiments: unknown[]; file_experiments: unknown[] }>('/v1/experiments'),
    getDatasets: () => fetchApi<{ datasets: unknown[] }>('/v1/datasets'),
    getDatasetCases: (name: string) => fetchApi<unknown>(`/v1/datasets/${name}`),
    curateCase: (datasetName: string, payload: unknown) =>
      fetchApi<{ status: string; message: string; case: unknown }>(`/v1/datasets/${datasetName}/cases`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// Preserves development-proxy behaviour until a connection is explicitly selected.
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL || '',
  apiKey: import.meta.env.VITE_API_KEY || '',
});
