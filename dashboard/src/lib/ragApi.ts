/** Client for the RAG chat service (demo/chat_server.py).
 *
 * - POST /chat/stream: { message, session_id } -> one JSON event per line as each stage finishes
 * - POST /chat: the same turn as one JSON object
 * - GET /chat/health: whether a turn would run now, and the limits
 * - GET /chat/corpus: { documents: [...] }
 *
 * The base URL is empty by default, so the page calls /chat on its own origin: on the public
 * site Caddy routes /chat* to the chat service. Locally, set VITE_RAG_API_URL (for example
 * http://localhost:8100), or run `npm run dev`, which proxies /chat to that port.
 *
 * Nothing here substitutes a result. When the service is unreachable the caller
 * gets an error to show, because a made-up turn or corpus makes the question this
 * view exists to answer ("is AgentPulse really monitoring a live conversation?")
 * impossible to answer, and looks answered (SESSION_HANDOFF 28.4).
 */

import type {
  ChatHealth,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  CorpusResponse,
} from './ragTypes';

const DEFAULT_RAG_BASE_URL = import.meta.env.VITE_RAG_API_URL || '';

/** Splits a newline-delimited JSON stream into objects, however the bytes arrive in chunks. */
export class NdjsonParser {
  private buffer = '';

  /** Add a chunk of text; returns every complete line in it, parsed. */
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // The last piece has no newline after it yet; keep it for the next chunk.
    this.buffer = lines.pop() ?? '';
    return lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
  }

  /** The stream ended: parse whatever is left (a last line without a newline). */
  flush(): unknown[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest ? [JSON.parse(rest)] : [];
  }
}

/** A short heading for an error code from the service. Unknown codes get a generic one. */
export function chatErrorTitle(code: string | undefined): string {
  switch (code) {
    case 'rate_limited':
    case 'daily_cap':
    case 'busy':
      return 'Limit reached';
    case 'paused':
      return 'Chat paused';
    case 'loading':
      return 'Chat starting up';
    case 'providers_busy':
      return 'Providers at their limit';
    case 'provider_failed':
      return 'Provider failed';
    case 'stream_ended':
      return 'Connection dropped';
    case 'aborted':
      return 'Stopped';
    case 'budget_exceeded':
      return 'Turn ran out of time';
    case 'empty_message':
    case 'message_too_long':
      return 'Question not accepted';
    default:
      return 'Pipeline failure';
  }
}

/** True for a refusal before any agent ran, as opposed to a turn that failed partway. */
export function isRefusal(code: string | undefined): boolean {
  return ['rate_limited', 'daily_cap', 'busy', 'paused', 'loading', 'unavailable', 'empty_message', 'message_too_long'].includes(
    code ?? '',
  );
}

/** Codes for a failure that can pass by itself, where sending the same question again makes
 * sense: every provider busy or failing, the turn's time running out, a cold start, a cut
 * connection. Not the daily limits, a pause, or a question refused for its length. */
const RETRYABLE = new Set(['providers_busy', 'provider_failed', 'budget_exceeded', 'busy', 'loading', 'stream_ended', 'aborted', 'internal']);

/** True when the page should offer a Retry button. No response at all (the network failed or
 * the turn was aborted) is worth a retry too. */
export function isRetryable(code: string | undefined, hadResponse: boolean): boolean {
  return !hadResponse || RETRYABLE.has(code ?? '');
}

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

  /** ok only when the service says a turn would run now. A body that is not the service's
   * JSON (the site's HTML shell, a proxy error page) means it is not reachable. */
  async checkHealth(): Promise<{ ok: boolean; status: string; message?: string; health?: ChatHealth }> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/health`, { signal: AbortSignal.timeout(4000) });
      const health = (await res.json().catch(() => null)) as ChatHealth | null;
      if (!health || typeof health.status !== 'string') {
        return { ok: false, status: res.ok ? 'unreachable' : `HTTP ${res.status}` };
      }
      return { ok: health.status === 'ready', status: health.status, message: health.message, health };
    } catch {
      return { ok: false, status: 'unreachable' };
    }
  }

  /** The titles the service can retrieve from. Throws when it cannot say. */
  async getCorpus(): Promise<CorpusResponse> {
    const res = await fetch(`${this.baseUrl}/chat/corpus`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`GET /chat/corpus returned HTTP ${res.status}`);
    const data = (await res.json()) as CorpusResponse;
    if (!Array.isArray(data.documents)) throw new Error('GET /chat/corpus did not return a document list');
    return data;
  }

  /** The turn as one response, without progress. */
  async sendChat(
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const res = await this.post('/chat', message, sessionId, signal);
    // A proxy error page is not JSON; fall through to the HTTP status below.
    const data = (await res.json().catch(() => ({}))) as Partial<ChatResponse>;
    if (!res.ok) return errorTurn(res, data, sessionId);
    return data as ChatResponse;
  }

  /** The turn as a stream: onEvent gets every event as it arrives, and the promise resolves
   * with the turn's final state (the done event, or the error event with what had finished). */
  async sendChatStream(
    message: string,
    sessionId: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    let res: Response;
    try {
      res = await this.post('/chat/stream', message, sessionId, signal);
    } catch (err) {
      // Stopped before the service answered at all: nothing had started that the page knows of.
      if (isAbort(err)) return { session_id: sessionId, agents: [], code: 'aborted', error: STOPPED_TEXT };
      throw err;
    }
    // Refusals (limits, pause, a bad question) come before the stream, as plain JSON.
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Partial<ChatResponse>;
      return errorTurn(res, data, sessionId);
    }

    const parser = new NdjsonParser();
    let final: ChatResponse | undefined;
    // What the stream had reported, for the case where it stops without a final event.
    let traceId: string | undefined;
    const agents: NonNullable<ChatResponse['agents']> = [];
    let retrieved: string[] | undefined;

    const handle = (raw: unknown) => {
      const event = raw as ChatStreamEvent;
      if (event.type === 'start') traceId = event.trace_id;
      if (event.type === 'retrieved') retrieved = event.retrieved;
      if (event.type === 'agent_done') {
        const { type: _type, ...agent } = event;
        agents.push(agent);
      }
      if (event.type === 'done' || event.type === 'error') {
        const { type: _type, ...turn } = event;
        final = { ...turn, session_id: turn.session_id ?? sessionId };
      }
      onEvent(event);
    };

    // What the stream had reported so far, as a turn that ended early with this code and text.
    // The trace id and the finished stages are real (their spans were sent), so they are kept;
    // nothing that had not arrived is filled in.
    const partial = (code: string, error: string): ChatResponse => ({
      session_id: sessionId,
      trace_id: traceId,
      agents,
      retrieved,
      code,
      error,
    });

    // The read loop. reader.read() rejects when the connection is cut mid-stream (a container
    // restart, a crash, a mobile network blip) or when the visitor presses Cancel; either
    // way the turn so far is reported, not thrown away with the browser's raw error text.
    try {
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true })).forEach(handle);
        }
        parser.push(decoder.decode()).forEach(handle);
      } else {
        // No readable body in this environment: the events arrive all at once at the end.
        parser.push(await res.text()).forEach(handle);
      }
      parser.flush().forEach(handle);
    } catch (err) {
      if (final) return final;
      return isAbort(err) ? partial('aborted', STOPPED_TEXT) : partial('stream_ended', DROPPED_TEXT);
    }

    if (final) return final;
    // The stream closed cleanly but before the turn's last event.
    return partial('stream_ended', DROPPED_TEXT);
  }

  private post(path: string, message: string, sessionId: string, signal?: AbortSignal): Promise<Response> {
    const payload: ChatRequest = { message, session_id: sessionId };
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  }
}

const DROPPED_TEXT =
  'The connection dropped while the answer was being written. The stages that finished are shown, and their spans are in AgentPulse.';
const STOPPED_TEXT = 'You stopped this turn. The stages that finished before that are shown.';

/** True for the error fetch and a stream reader throw when the request's AbortSignal fires. */
function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

/** A failed or refused turn. The service answers errors with the partial turn it completed,
 * so that is kept; a body that is not its JSON leaves only the HTTP status to report. */
function errorTurn(res: Response, data: Partial<ChatResponse>, sessionId: string): ChatResponse {
  return {
    session_id: sessionId,
    trace_id: data.trace_id,
    error: data.error || `HTTP ${res.status}: ${res.statusText}`,
    code: data.code,
    retry_after: data.retry_after,
    agents: data.agents ?? [],
    retrieved: data.retrieved,
    total_ms: data.total_ms,
  };
}

export const ragApi = new RagApiClient();
