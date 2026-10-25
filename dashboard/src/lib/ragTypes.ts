/** Types for the RAG Chatbot frontend and the chat service contract (demo/chat_server.py). */

/** One try of one model for an agent's step. outcome is "ok" or why it failed or was skipped. */
export interface RagAttempt {
  provider: string;
  model: string;
  outcome: string;
  ms: number;
  status?: number;
}

export interface RagAgentExecution {
  agent: 'retriever' | 'verifier' | 'answerer' | string;
  model: string;
  /** The provider that answered (groq, cerebras, nvidia, pollinations, openrouter). */
  provider?: string;
  output: string;
  latency_ms: number;
  /** Every try for this step, the answering one last; more than one means a failover. */
  attempts?: RagAttempt[];
}

export interface ChatRequest {
  message: string;
  session_id: string;
}

export interface ChatResponse {
  session_id: string;
  trace_id?: string;
  reply?: string;
  verifier_verdict?: string;
  retrieved?: string[];
  agents?: RagAgentExecution[];
  /** Measured by the service: the search, and the whole turn. Absent when it did not say. */
  search_ms?: number;
  total_ms?: number;
  error?: string;
  /** Why the turn failed or was refused, a stable word (see chatErrorTitle in ragApi.ts). */
  code?: string;
  /** Seconds until a refused turn may be tried again, when the service said. */
  retry_after?: number;
}

/** One line of POST /chat/stream. A turn ends with exactly one done or error event. */
export type ChatStreamEvent =
  | { type: 'start'; session_id: string; trace_id: string; agents: string[]; turn_budget_seconds?: number }
  | { type: 'retrieved'; retrieved: string[]; search_ms: number }
  | { type: 'agent_start'; agent: string }
  | ({ type: 'agent_done' } & RagAgentExecution)
  | ({ type: 'done' } & ChatResponse)
  | ({ type: 'error' } & ChatResponse);

/** What the stream has reported so far for a turn that is still running. */
export interface TurnProgress {
  traceId?: string;
  retrieved?: string[];
  searchMs?: number;
  /** The agent whose call is running now, if any. */
  running?: string;
  done: RagAgentExecution[];
}

/** GET /chat/health. status is "ready" only when a turn would run now. */
export interface ChatHealth {
  status: 'ready' | 'loading' | 'paused' | 'failed' | string;
  embedding?: string;
  providers?: string[];
  agents?: string[];
  message?: string;
  limits?: {
    ip_turns_per_minute: number;
    ip_turns_per_day: number;
    daily_turn_cap: number;
    max_input_chars: number;
    turn_budget_seconds: number;
  };
  usage?: { turns_today: number; daily_cap: number; running: number };
}

export interface CorpusResponse {
  documents: string[];
}

export interface ChatTurn {
  id: string;
  timestamp: string;
  userMessage: string;
  response?: ChatResponse;
  status: 'running' | 'completed' | 'error';
  errorMessage?: string;
  traceId?: string;
  groundingScore?: number | null; // From answerer span via AgentPulse polling
  groundingStatus?: 'pending' | 'evaluated' | 'unmeasured';
  groundingLabel?: string | null;
  groundingEvaluationStage?: string | null;
  /** Filled from the stream while the turn runs. */
  progress?: TurnProgress;
}

export type PipelineAgent = 'retriever' | 'verifier' | 'answerer';

/** One agent's reading from AgentPulse's /v1/drift. Null means not measured, never zero. */
export interface AgentDriftReading {
  windowDistance: number | null;
  asi: number | null;
}

export interface RagSessionStats {
  turnsSent: number;
  spansSent: number;
  spansEvaluated: number;
  spansPending: number;
  errors: number;
}
