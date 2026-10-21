import { afterEach, describe, expect, it, vi } from 'vitest';
import { RagApiClient } from './ragApi';

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
});
