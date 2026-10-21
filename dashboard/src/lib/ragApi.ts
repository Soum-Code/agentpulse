/** Client for the RAG FastAPI service (default :8100, demo/chatbot/app.py).
 *
 * - POST /chat: { message, session_id }
 * - GET /corpus: { documents: [...] }
 *
 * Nothing here substitutes a result. When the service is unreachable the caller
 * gets an error to show, because a made-up turn or corpus makes the question this
 * view exists to answer ("is AgentPulse really monitoring a live conversation?")
 * impossible to answer, and looks answered (SESSION_HANDOFF 28.4).
 */

import type { ChatRequest, ChatResponse, CorpusResponse } from './ragTypes';

const DEFAULT_RAG_BASE_URL = import.meta.env.VITE_RAG_API_URL || 'http://localhost:8100';

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

  /** The titles the service can retrieve from. Throws when it cannot say. */
  async getCorpus(): Promise<CorpusResponse> {
    const res = await fetch(`${this.baseUrl}/corpus`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`GET /corpus returned HTTP ${res.status}`);
    return (await res.json()) as CorpusResponse;
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

    // A proxy error page is not JSON; fall through to the HTTP status below.
    const data = (await res.json().catch(() => ({}))) as Partial<ChatResponse>;

    if (!res.ok) {
      // The service answers errors with the partial turn it completed, so keep that.
      return {
        session_id: sessionId,
        trace_id: data.trace_id,
        error: data.error || `HTTP ${res.status}: ${res.statusText}`,
        agents: data.agents ?? [],
      };
    }

    return data as ChatResponse;
  }
}

export const ragApi = new RagApiClient();
