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

export interface LatencyDataPoint {
  minute: number; // 0 to 60 (or -60 to 0)
  timeLabel: string; // e.g. "-55m", "-10m", "Now"
  timestamp: string; // e.g. "14:32:00"
  timeAgo: string; // e.g. "32 mins ago" or "Just now"
  latencyMs: number;
  baselineMs: number;
  driftThresholdMs: number;
  status: 'normal' | 'deviation' | 'drift';
}

export interface Agent {
  id: string;
  name: string;
  version?: string;
  model?: string;
  status: AgentStatus;
  latencyAvgMs: number;
  costPerHour?: number;
  successRate: number;
  totalTraces24h: number;
  description: string;
  framework?: string;
  driftScore: number; // 0 to 1
  driftStatus: 'normal' | 'deviation' | 'drift';
  lastActive: string;
  tools?: string[];
  latencyHistory60m?: LatencyDataPoint[];
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
  durationMs: number;
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

export interface Trace {
  id: string;
  agentId: string;
  agentName: string;
  sessionId?: string;
  rootSpanId: string;
  status: 'ok' | 'warning' | 'error';
  durationMs: number;
  totalTokens: number;
  cost?: number;
  timestamp: string;
  inputPreview: string;
  outputPreview: string;
  spans: Span[];
  tags?: string[];
  errorSummary?: string;
  driftDetected?: boolean;
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

export interface DriftProfile {
  agentId: string;
  agentName: string;
  driftMagnitude: number; // 0 to 1
  clusterDivergence?: number;
  parameterDrift?: number;
  semanticDrift: number;
  toolCallDrift: number;
  baselineSampleCount: number;
  currentSampleCount: number;
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
