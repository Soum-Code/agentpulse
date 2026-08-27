/** API client for AgentPulse backend */

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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
  details: Record<string, any> | null;
}

export const api = {
  getMetrics: () => fetchApi<Metrics>('/v1/metrics'),
  getHealth: () => fetchApi<{ status: string; models: Record<string, boolean>; version: string }>('/v1/health'),
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
  simulatePipeline: (scenario: string = 'clean', query: string = 'Multi-agent LLM reasoning') =>
    fetchApi<{ accepted: number; message: string }>('/v1/simulate', {
      method: 'POST',
      body: JSON.stringify({ scenario, query }),
    }),
  getExperiments: () =>
    fetchApi<{ experiments: any[]; file_experiments: any[] }>('/v1/experiments'),
  getDatasets: () =>
    fetchApi<{ datasets: any[] }>('/v1/datasets'),
  getDatasetCases: (name: string) =>
    fetchApi<any>(`/v1/datasets/${name}`),
  curateCase: (datasetName: string, payload: any) =>
    fetchApi<{ status: string; message: string; case: any }>(`/v1/datasets/${datasetName}/cases`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
