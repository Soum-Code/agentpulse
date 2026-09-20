/** Client for the RAG FastAPI service (default :8100).
 *
 * Implements:
 * - POST /chat: { message, session_id }
 * - GET /corpus: { documents: [...] }
 *
 * Also provides a sequential simulation runner so the RAG interface is
 * fully testable and operational even before the user starts their local
 * :8100 process.
 */

import type { ChatRequest, ChatResponse, CorpusResponse, RagAgentExecution } from './ragTypes';

const DEFAULT_RAG_BASE_URL = import.meta.env.VITE_RAG_API_URL || 'http://localhost:8100';

export const DEFAULT_CORPUS_DOCUMENTS: string[] = [
  'SQLite Write-Ahead Logging (WAL) Architecture',
  'Multi-Version Concurrency Control (MVCC) in Embedded Storage Engines',
  'B-Tree Page Splitting, Buffer Pool Contention, and Disk I/O Latency',
  'Crash Recovery, Checkpointing, and Log Sequence Numbers in SQLite',
  'Reader-Writer Lock Contention in Shared Cache and In-Memory Databases',
  'Atomic Commit Protocols, POSIX fcntl Locks, and OS Sync Primitives',
];

export class RagApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_RAG_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  async checkHealth(): Promise<{ ok: boolean; status: string; documentsCount?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/corpus`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as CorpusResponse;
        return { ok: true, status: 'online', documentsCount: data.documents?.length };
      }
      return { ok: false, status: `HTTP ${res.status}` };
    } catch {
      return { ok: false, status: 'unreachable' };
    }
  }

  async getCorpus(): Promise<CorpusResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/corpus`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        return (await res.json()) as CorpusResponse;
      }
    } catch {
      // Return default corpus if service is unreachable
    }
    return { documents: DEFAULT_CORPUS_DOCUMENTS };
  }

  async sendChat(
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const payload: ChatRequest = {
      message,
      session_id: sessionId,
    };

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    const data = (await res.json()) as ChatResponse;

    if (!res.ok) {
      // Backend returned HTTP error, but contract specifies it returns partial turn details
      return {
        session_id: sessionId,
        trace_id: data.trace_id,
        error: data.error || `HTTP ${res.status}: ${res.statusText}`,
        agents: data.agents ?? [],
      };
    }

    return data;
  }
}

export const ragApi = new RagApiClient();

/** Helper to generate realistic simulated turns when backend is not running or in simulator mode */
export async function simulateSequentialTurn(
  message: string,
  sessionId: string,
  options: {
    simulateFailure?: boolean;
    onProgress?: (stage: 'retriever' | 'verifier' | 'answerer', elapsedMs: number) => void;
  } = {},
): Promise<ChatResponse> {
  const traceId = 'tr_' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
  const startTime = Date.now();

  // Stage 1: Retriever
  options.onProgress?.('retriever', 0);
  await new Promise((r) => setTimeout(r, 1200));

  const retrievedDocs = [
    'SQLite Write-Ahead Logging (WAL) Architecture',
    'Crash Recovery, Checkpointing, and Log Sequence Numbers in SQLite',
    'Reader-Writer Lock Contention in Shared Cache and In-Memory Databases',
  ];

  const retrieverAgent: RagAgentExecution = {
    agent: 'retriever',
    model: 'mistralai/mistral-nemotron',
    output: `Retrieved 3 documents with embedding cosine similarities [0.892, 0.841, 0.793] matching query terms: "${message.substring(0, 40)}..."`,
    latency_ms: 1240,
  };

  if (options.simulateFailure) {
    // Simulate verifier crashing
    options.onProgress?.('verifier', Date.now() - startTime);
    await new Promise((r) => setTimeout(r, 900));
    return {
      session_id: sessionId,
      trace_id: traceId,
      error: 'EmptyCompletion: verifier model google/gemma-4-31b-it dropped context stream after 900ms',
      agents: [retrieverAgent],
      retrieved: retrievedDocs,
    };
  }

  // Stage 2: Verifier
  options.onProgress?.('verifier', Date.now() - startTime);
  await new Promise((r) => setTimeout(r, 1600));

  const verifierAgent: RagAgentExecution = {
    agent: 'verifier',
    model: 'google/gemma-4-31b-it',
    output: `Verified: The retrieved WAL documentation strictly entails that WAL writes changes to an append-only log file rather than the main database page file, allowing readers to access snapshot isolation without holding table locks.`,
    latency_ms: 1620,
  };

  // Stage 3: Answerer
  options.onProgress?.('answerer', Date.now() - startTime);
  await new Promise((r) => setTimeout(r, 1400));

  let replyText = '';
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('wal') || lowerMsg.includes('sqlite') || lowerMsg.includes('concurrency')) {
    replyText = `SQLite's Write-Ahead Logging (WAL) dramatically improves read/write concurrency through three architectural mechanisms:

1. **Separation of Concerns via Append-Only Log**: Instead of overwriting main database pages directly (which required an exclusive database lock in rollback journal mode), changes are appended to an auxiliary \`-wal\` file.
2. **Non-Blocking Readers & Writers**: A writer appends newly dirtied pages to the WAL while readers simultaneously access earlier page versions either in the main file or prior WAL frames. Writers do not block readers, and readers do not block writers.
3. **Checkpointing**: In the background or at configured thresholds (default 1,000 pages), SQLite runs a checkpoint operation to transfer modified pages back to the main database file without disrupting active query sessions.`;
  } else if (lowerMsg.includes('crash') || lowerMsg.includes('recovery')) {
    replyText = `During a crash before a commit record is flushed to disk:

- **Uncommitted Frames**: Any WAL frames written without a valid commit marker are simply ignored during the next recovery scan.
- **Log Sequence Number (LSN) Invariant**: SQLite detects torn writes or uncommitted transactions during startup by reading the WAL header and checksumming frames sequentially. The main database remains untouched and byte-identical to the last valid transaction.`;
  } else {
    replyText = `Based on the retrieved system architecture documents:

${message}

WAL and append-only commit logs eliminate mutual exclusion between query threads by decoupling the persistent checkpoint state from the active mutable state. Readers operate on an immutable snapshot determined by the end-of-log boundary at query initiation.`;
  }

  const answererAgent: RagAgentExecution = {
    agent: 'answerer',
    model: 'deepseek-ai/deepseek-v4-flash-0731',
    output: replyText,
    latency_ms: 1410,
  };

  return {
    session_id: sessionId,
    trace_id: traceId,
    reply: replyText,
    verifier_verdict: 'Yes. The evidence explains and entails non-blocking concurrent reads.',
    retrieved: retrievedDocs,
    agents: [retrieverAgent, verifierAgent, answererAgent],
  };
}
