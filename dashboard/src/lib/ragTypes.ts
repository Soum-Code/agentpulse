/** Types for the RAG Chatbot frontend and FastAPI (:8100) backend contract. */

export interface RagAgentExecution {
  agent: 'retriever' | 'verifier' | 'answerer' | string;
  model: string;
  output: string;
  latency_ms: number;
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
  error?: string;
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
}

export interface RagSessionStats {
  turnsSent: number;
  spansSent: number;
  spansEvaluated: number;
  spansPending: number;
  errors: number;
}
