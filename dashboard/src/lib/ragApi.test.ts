import { afterEach, describe, expect, it, vi } from 'vitest';
import { NdjsonParser, RagApiClient, chatErrorTitle, isRefusal, isRetryable } from './ragApi';
import type { ChatStreamEvent } from './ragTypes';

// The RAG view once answered an unreachable service with an invented corpus and an
// invented trace id (SESSION_HANDOFF 28.4). An unreachable service must surface as
// an error, and a missing trace id must stay missing.
describe('RagApiClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws from getCorpus when the service is unreachable, with no substitute list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(new RagApiClient('http://x').getCorpus()).rejects.toThrow();
  });

  it('throws from getCorpus on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(new RagApiClient('http://x').getCorpus()).rejects.toThrow('502');
  });

  it('returns an error turn with no trace id when the service sends a non-JSON error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new SyntaxError('not json')),
      }),
    );
    const turn = await new RagApiClient('http://x').sendChat('hi', 's1');
    expect(turn.error).toBe('HTTP 502: Bad Gateway');
    expect(turn.trace_id).toBeUndefined();
    expect(turn.agents).toEqual([]);
  });

  it('passes a reply without a trace id through unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ session_id: 's1', reply: 'ok' }) }),
    );
    const turn = await new RagApiClient('http://x').sendChat('hi', 's1');
    expect(turn.reply).toBe('ok');
    expect(turn.trace_id).toBeUndefined();
  });

  it('calls /chat on its own origin by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ documents: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await new RagApiClient('').getCorpus();
    expect(fetchMock.mock.calls[0][0]).toBe('/chat/corpus');
  });
});

describe('checkHealth', () => {
  afterEach(() => vi.unstubAllGlobals());

  const health = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) });

  it('is ok only when the service says ready', async () => {
    vi.stubGlobal('fetch', health(200, { status: 'ready', limits: { ip_turns_per_minute: 3 } }));
    const ready = await new RagApiClient('').checkHealth();
    expect(ready.ok).toBe(true);
    expect(ready.health?.limits?.ip_turns_per_minute).toBe(3);
  });

  it('passes the pause message on', async () => {
    vi.stubGlobal('fetch', health(503, { status: 'paused', message: 'Back on Monday.' }));
    expect(await new RagApiClient('').checkHealth()).toMatchObject({ ok: false, status: 'paused', message: 'Back on Monday.' });
  });

  it("treats the site's HTML shell as unreachable, not as a healthy service", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('<!doctype html>')) }),
    );
    expect(await new RagApiClient('').checkHealth()).toEqual({ ok: false, status: 'unreachable' });
  });
});

describe('NdjsonParser', () => {
  it('parses lines however the chunks split them', () => {
    const parser = new NdjsonParser();
    expect(parser.push('{"type":"st')).toEqual([]);
    expect(parser.push('art","n":1}\n{"type":"retrieved"}\n{"ty')).toEqual([
      { type: 'start', n: 1 },
      { type: 'retrieved' },
    ]);
    expect(parser.push('pe":"done"}\n')).toEqual([{ type: 'done' }]);
    expect(parser.flush()).toEqual([]);
  });

  it('skips blank lines and parses a last line without a newline on flush', () => {
    const parser = new NdjsonParser();
    expect(parser.push('\n\n{"a":1}\n\n{"b":2}')).toEqual([{ a: 1 }]);
    expect(parser.flush()).toEqual([{ b: 2 }]);
  });

  it('throws on a line that is not JSON rather than skipping it', () => {
    expect(() => new NdjsonParser().push('not json\n')).toThrow();
  });
});

// A Response whose body arrives in the given chunks, as fetch gives it.
function streamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return { ok: status === 200, status, statusText: '', body, json: () => Promise.reject(new Error('stream')) };
}

const agent = (name: string, provider = 'groq') => ({
  agent: name,
  provider,
  model: 'openai/gpt-oss-20b',
  output: `${name} said`,
  latency_ms: 120,
  attempts: [{ provider, model: 'openai/gpt-oss-20b', outcome: 'ok', ms: 120 }],
});

describe('sendChatStream', () => {
  afterEach(() => vi.unstubAllGlobals());

  const lines = (events: object[]) => events.map((e) => JSON.stringify(e) + '\n').join('');

  it('reports every event in order and resolves with the done event', async () => {
    const done = {
      type: 'done',
      session_id: 's1',
      trace_id: 't1',
      reply: 'answerer said',
      verifier_verdict: 'verifier said',
      retrieved: ['A', 'B', 'C'],
      agents: [agent('retriever'), agent('verifier'), agent('answerer')],
      search_ms: 30,
      total_ms: 400,
    };
    const text = lines([
      { type: 'start', session_id: 's1', trace_id: 't1', agents: ['retriever', 'verifier', 'answerer'] },
      { type: 'retrieved', retrieved: ['A', 'B', 'C'], search_ms: 30 },
      { type: 'agent_start', agent: 'retriever' },
      { type: 'agent_done', ...agent('retriever') },
      { type: 'agent_start', agent: 'verifier' },
      { type: 'agent_done', ...agent('verifier') },
      { type: 'agent_start', agent: 'answerer' },
      { type: 'agent_done', ...agent('answerer') },
      done,
    ]);
    // Split mid-line on purpose: a chunk boundary is not a line boundary.
    const chunks = [text.slice(0, 50), text.slice(50, 333), text.slice(333)];
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(chunks));
    vi.stubGlobal('fetch', fetchMock);

    const seen: ChatStreamEvent[] = [];
    const turn = await new RagApiClient('').sendChatStream('q', 's1', (e) => seen.push(e));

    expect(fetchMock.mock.calls[0][0]).toBe('/chat/stream');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ message: 'q', session_id: 's1' });
    expect(seen.map((e) => e.type)).toEqual([
      'start', 'retrieved', 'agent_start', 'agent_done', 'agent_start', 'agent_done', 'agent_start', 'agent_done', 'done',
    ]);
    expect(turn.reply).toBe('answerer said');
    expect(turn.total_ms).toBe(400);
    expect(turn.agents?.map((a) => a.provider)).toEqual(['groq', 'groq', 'groq']);
    expect('type' in turn).toBe(false);
  });

  it('resolves with the error event, keeping the stages that finished', async () => {
    const text = lines([
      { type: 'start', session_id: 's1', trace_id: 't1', agents: [] },
      { type: 'agent_done', ...agent('retriever') },
      {
        type: 'error',
        code: 'provider_failed',
        error: 'No model provider answered the verifier step.',
        session_id: 's1',
        trace_id: 't1',
        agents: [agent('retriever')],
      },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([text])));
    const turn = await new RagApiClient('').sendChatStream('q', 's1', () => {});
    expect(turn.code).toBe('provider_failed');
    expect(turn.error).toContain('verifier');
    expect(turn.agents?.map((a) => a.agent)).toEqual(['retriever']);
    expect(turn.trace_id).toBe('t1');
  });

  it('returns a refusal before the stream as an error turn with its code and retry time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () =>
          Promise.resolve({ code: 'rate_limited', error: 'That is 3 questions in a minute.', retry_after: 42, agents: [] }),
      }),
    );
    const onEvent = vi.fn();
    const turn = await new RagApiClient('').sendChatStream('q', 's1', onEvent);
    expect(onEvent).not.toHaveBeenCalled();
    expect(turn).toMatchObject({ code: 'rate_limited', retry_after: 42, agents: [], error: 'That is 3 questions in a minute.' });
    expect(turn.trace_id).toBeUndefined();
  });

  it('reports a stream that ends early without inventing the rest', async () => {
    const text = lines([
      { type: 'start', session_id: 's1', trace_id: 't1', agents: [] },
      { type: 'agent_done', ...agent('retriever') },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([text])));
    const turn = await new RagApiClient('').sendChatStream('q', 's1', () => {});
    expect(turn.code).toBe('stream_ended');
    expect(turn.reply).toBeUndefined();
    expect(turn.trace_id).toBe('t1');
    expect(turn.agents?.map((a) => a.agent)).toEqual(['retriever']);
  });
});

describe('error codes', () => {
  it('give a heading for each code the service sends', () => {
    expect(chatErrorTitle('rate_limited')).toBe('Limit reached');
    expect(chatErrorTitle('daily_cap')).toBe('Limit reached');
    expect(chatErrorTitle('paused')).toBe('Chat paused');
    expect(chatErrorTitle('provider_failed')).toBe('Provider failed');
    expect(chatErrorTitle('providers_busy')).toBe('Providers at their limit');
    expect(chatErrorTitle('budget_exceeded')).toBe('Turn ran out of time');
    expect(chatErrorTitle(undefined)).toBe('Pipeline failure');
  });

  it('offer a retry for failures that pass by themselves, and not for the daily limits or a pause', () => {
    expect(isRetryable('providers_busy', true)).toBe(true);
    expect(isRetryable('provider_failed', true)).toBe(true);
    expect(isRetryable('budget_exceeded', true)).toBe(true);
    expect(isRetryable('loading', true)).toBe(true);
    expect(isRetryable(undefined, false)).toBe(true);
    expect(isRetryable('daily_cap', true)).toBe(false);
    expect(isRetryable('paused', true)).toBe(false);
    expect(isRetryable('message_too_long', true)).toBe(false);
  });

  it('tell a refusal before any agent ran from a failure partway', () => {
    expect(isRefusal('rate_limited')).toBe(true);
    expect(isRefusal('paused')).toBe(true);
    expect(isRefusal('message_too_long')).toBe(true);
    expect(isRefusal('provider_failed')).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
  });
});
