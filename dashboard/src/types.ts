/** View models for the console.
 *
 * Fields the AgentPulse API does not produce are optional, not required.
 *
 * These were first written against mock telemetry, where every field has a
 * value because somebody typed one. Required is fine there and wrong here:
 * `adapters.ts` maps real responses and leaves anything the backend never
 * measured undefined, on the rule that an invented value is indistinguishable
 * from a measured one. Marking them required makes the compiler demand the
 * invention -- and a component that then reads them crashes the console.
 */
import type { GroundingVerdict } from './lib/api';

export type DesignMode = 'rag' | 'public' | 'product';
export type ColorPalette = 'butter' | 'dark' | 'chalk';
export type ChalkSurfacePreset = 'classic-white' | 'sepia-slate' | 'emerald-graphite' | 'custom';

export interface ChalkSurfaceConfig {
  id: ChalkSurfacePreset;
  name: string;
  subtitle: string;
  hex: string;
  cardBg: string;
  borderColor: string;
  textColor: string;
  moteColor: string;
}

export type TextDensity = 'compact' | 'comfortable';
export type ChronologicalSortOrder = 'reverse-chronological' | 'chronological';

export type ProductTab =
  | 'overview'
  | 'agents'
  | 'traces'
  | 'performance'
  | 'incidents'
  | 'drift'
  | 'rag-monitor'
  | 'replay'
  | 'experiments'
  | 'datasets'
  | 'telemetry-lab'
  | 'settings';

export type AgentStatus = 'idle' | 'running' | 'warning' | 'critical';

// The LatencyDataPoint type and the latencyHistory60m field were removed on 2026-10-25: the
// API keeps one moving-average latency per agent and no per-minute history, so the only
// thing that ever filled them was a Math.random() generator (utils/latencyTelemetry.ts).
export interface Agent {
  id: string;
  name: string;
  version?: string;
  model?: string;
  status: AgentStatus;
  /** avg_latency_ms from GET /v1/agents: a moving average (each new span counts 5%), or
   *  undefined when the backend has no latency for the agent. */
  latencyAvgMs?: number;
  costPerHour?: number;
  /** Percentage, 0-100, rounded to one decimal (1 - error_rate). */
  successRate: number;
  totalTraces24h: number;
  /** agent_role from the API; undefined when the SDK did not send one. */
  description?: string;
  framework?: string;
  /** latest_window_centroid_distance; undefined until the baseline (first 20 outputs) and the
   *  current window (latest 12) have both filled. A cosine distance, so 0 to 2. */
  driftScore?: number;
  /** 'drift' above the 0.30 threshold, 'normal' at or below it, undefined with no baseline.
   *  adapters.ts never produces 'deviation'; it stays in the union for older callers. */
  driftStatus?: 'normal' | 'deviation' | 'drift';
  lastActive: string;
  tools?: string[];
}

export type SpanType = 'agent' | 'tool' | 'model' | 'evaluator' | 'retrieval';
export type SpanStatus = 'ok' | 'warning' | 'error';

export interface EvaluatorResult {
  id: string;
  name: string;
  score: number; // 0 - 1
  threshold: number;
  passed: boolean;
  maturity: 'GA' | 'BETA' | 'EXPERIMENTAL';
  reason: string;
  /** Grounding only: what the NLI model concluded. Not a risk score; see riskTone.ts. */
  verdict?: GroundingVerdict;
  evidenceQuote?: string;
  claimsCount?: number;
  groundedRatio?: number;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  type: SpanType;
  status: SpanStatus;
  startOffsetMs: number;
  /** For layout (bar widths, sums): latency_ms, or 0 when the SDK sent none. Print latencyMs. */
  durationMs: number;
  /** The span's recorded latency_ms; undefined when it was not recorded. What the views print. */
  latencyMs?: number;
  agentLane?: string;
  model?: string;
  prompt?: string;
  completion?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolOutput?: Record<string, any> | string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: number;
  error?: string;
  evaluatorResults?: EvaluatorResult[];
  evidence?: {
    observed: string;
    measured: string;
    explained: string;
  };
}

/** An alert raised on a trace, as GET /v1/traces/{id} lists it. */
export interface TraceAlert {
  id: number;
  alertType: string;
  severity: string;
  message: string;
  agentId?: string;
  spanId?: string;
  acknowledged: boolean;
  resolved: boolean;
  createdAt: string;
}

export interface Trace {
  id: string;
  agentId: string;
  agentName: string;
  sessionId?: string;
  rootSpanId: string;
  status: 'ok' | 'warning' | 'error';
  durationMs: number;
  // Undefined when no span reported tokens. adapters.ts leaves it unset, so it is optional here.
  totalTokens?: number;
  cost?: number;
  timestamp: string;
  inputPreview: string;
  outputPreview: string;
  spans: Span[];
  tags?: string[];
  errorSummary?: string;
  driftDetected?: boolean;
  // Set once the trace detail has been loaded, and then it is the full list, possibly empty.
  // Undefined means only the list entry is known, so spans is empty because it was not
  // fetched and not because the trace has none.
  alerts?: TraceAlert[];
  // The trace's overall_risk_score: 0 is safe, 1 is risky, despite the name.
  groundingScore?: number;
}

export interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  agentId: string;
  agentName: string;
  traceId: string;
  spanId?: string;
  detectedAt: string;
  status: 'open' | 'investigating' | 'resolved';
  rootCause?: string;
  summary: string;
  affectedRunsCount?: number;
  suggestedAction?: string;
}

export interface DriftPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  cluster: 'baseline' | 'deviation' | 'drift';
  traceId: string;
  agentId: string;
  timestamp: string;
  label: string;
}

// The three distances are optional because GET /v1/drift returns null for an agent with no
// drift record, and the window distance stays null until both windows fill. The view prints
// an em dash for each one that is missing, never 0.
export interface DriftProfile {
  agentId: string;
  agentName: string;
  /** latest_window_centroid_distance: what DRIFT_DETECTED reads (alert above 0.30). */
  driftMagnitude?: number;
  clusterDivergence?: number;
  parameterDrift?: number;
  /** latest_centroid_distance: one output against the agent's running average. */
  semanticDrift?: number;
  /** latest_tool_drift: how evenly the agent spreads its calls over its tools (0 to 1). */
  toolCallDrift?: number;
  /** baseline_size: how many of the agent's spans had been analysed before the latest record. */
  baselineSampleCount: number;
  currentSampleCount?: number;
  points: DriftPoint[];
  driftReason: string;
}

export interface DatasetItem {
  id: string;
  input: string;
  expectedOutput?: string;
  originTraceId: string;
  originSpanId?: string;
  curatedAt: string;
  notes?: string;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  items: DatasetItem[];
}

export interface Experiment {
  id: string;
  name: string;
  datasetId: string;
  datasetName: string;
  baselineModel?: string;
  candidateModel?: string;
  baselineScore?: number;
  candidateScore?: number;
  winRate?: number; // percentage
  evaluators: string[];
  status: 'completed' | 'running';
  runCount?: number;
  createdAt: string;
  insights?: string;
  comparisonDiffs?: {
    itemId: string;
    input: string;
    baselineOutput: string;
    candidateOutput: string;
    baselineScore: number;
    candidateScore: number;
    evaluatorNotes: string;
  }[];
}

export interface ContextBreadcrumb {
  agentId?: string;
  agentName?: string;
  traceId?: string;
  spanId?: string;
  viewName?: string;
}

export interface TelemetryProject {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  apiKey: string;
  environment: 'production' | 'staging' | 'development';
  createdAt: string;
  agentCount?: number;
  traceCount?: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAnonymous: boolean;
}
