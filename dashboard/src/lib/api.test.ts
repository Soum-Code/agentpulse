/** Tests for the REST client's URL construction and error handling.
 *
 * The same-origin rule here is the one that decides whether a deployed
 * dashboard works at all. When baseUrl is empty the client must request a
 * relative path, so the browser resolves it against whatever origin served the
 * page and nginx proxies it onward. An absolute URL baked in at build time
 * points every visitor's browser at their own machine instead of the server --
 * which is exactly what shipped until a `.env` was found leaking into the
 * Docker build context. These tests are what stops that returning silently.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, websocketUrlFor } from './api';

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
}) {
  // The parameters are declared so `mock.calls` is typed as the tuple these
  // tests index into, rather than an empty one.
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? 'OK',
    json: async () => response.body ?? {},
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const lastCall = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls[fn.mock.calls.length - 1];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request URLs', () => {
  it('requests a relative path when no base URL is configured', () => {
    const fetchMock = mockFetch({ body: { total_traces: 0 } });
    createApiClient({ baseUrl: '', apiKey: '' }).getMetrics();

    const [url] = lastCall(fetchMock);
    expect(url).toBe('/v1/metrics');
    expect(url.startsWith('http')).toBe(false);
  });

  it('never emits localhost when the base URL is empty', () => {
    // The specific failure that shipped: a bundle built with
    // VITE_API_URL=http://localhost:8000 sent every visitor's browser to their
    // own machine, and the dashboard rendered empty for everyone but the
    // developer.
    const fetchMock = mockFetch({ body: {} });
    const api = createApiClient({ baseUrl: '', apiKey: '' });
    api.getMetrics();
    api.getTraces(10, 0);
    api.getAgents();

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('localhost');
    }
  });

  it('prefixes an absolute base URL when one is configured', () => {
    const fetchMock = mockFetch({ body: {} });
    createApiClient({ baseUrl: 'https://pulse.example.com', apiKey: '' }).getMetrics();

    expect(lastCall(fetchMock)[0]).toBe('https://pulse.example.com/v1/metrics');
  });

  it('strips trailing slashes rather than producing a doubled one', () => {
    const fetchMock = mockFetch({ body: {} });
    createApiClient({ baseUrl: 'https://pulse.example.com///', apiKey: '' }).getMetrics();

    expect(lastCall(fetchMock)[0]).toBe('https://pulse.example.com/v1/metrics');
  });

  it('passes query parameters through', () => {
    const fetchMock = mockFetch({ body: { traces: [], total: 0 } });
    createApiClient({ baseUrl: '', apiKey: '' }).getTraces(25, 50);

    expect(lastCall(fetchMock)[0]).toBe('/v1/traces?limit=25&offset=50');
  });
});

describe('authentication header', () => {
  it('sends the key when one is configured', () => {
    const fetchMock = mockFetch({ body: {} });
    createApiClient({ baseUrl: '', apiKey: 'secret-key' }).getMetrics();

    const headers = lastCall(fetchMock)[1]?.headers as Headers;
    expect(headers.get('X-API-Key')).toBe('secret-key');
  });

  it('sends no key header when none is configured', () => {
    const fetchMock = mockFetch({ body: {} });
    createApiClient({ baseUrl: '', apiKey: '' }).getMetrics();

    const headers = lastCall(fetchMock)[1]?.headers as Headers;
    expect(headers.has('X-API-Key')).toBe(false);
  });

  it('ignores a key that is only whitespace', () => {
    const fetchMock = mockFetch({ body: {} });
    createApiClient({ baseUrl: '', apiKey: '   ' }).getMetrics();

    const headers = lastCall(fetchMock)[1]?.headers as Headers;
    expect(headers.has('X-API-Key')).toBe(false);
  });
});

describe('websocketUrlFor', () => {
  it('falls back to the serving origin when no base URL is set', () => {
    // Same reasoning as the REST path: a hardcoded host would point the socket
    // at the developer's machine.
    expect(websocketUrlFor({ baseUrl: '', apiKey: '' })).toBe(
      `${window.location.origin.replace(/^http/, 'ws')}/v1/ws/live`,
    );
  });

  it('upgrades https to wss, not to ws', () => {
    expect(websocketUrlFor({ baseUrl: 'https://pulse.example.com', apiKey: '' })).toBe(
      'wss://pulse.example.com/v1/ws/live',
    );
  });

  it('maps http to ws', () => {
    expect(websocketUrlFor({ baseUrl: 'http://localhost:8000', apiKey: '' })).toBe(
      'ws://localhost:8000/v1/ws/live',
    );
  });
});

describe('error handling', () => {
  it('returns the body of a 503 instead of throwing', () => {
    // The readiness endpoints answer 503 with the reason in the body. Throwing
    // would discard exactly the information the operator needs, and the UI
    // would show a generic failure instead of "no evaluator worker alive".
    const body = { ready: false, reasons: ['no worker alive'] };
    mockFetch({ ok: false, status: 503, body });

    return expect(
      createApiClient({ baseUrl: '', apiKey: '' }).getEvaluatorReadiness(),
    ).resolves.toEqual(body);
  });

  it('throws with the status code on other failures', async () => {
    mockFetch({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(
      createApiClient({ baseUrl: '', apiKey: '' }).getMetrics(),
    ).rejects.toMatchObject({ name: 'ApiError', status: 401 });
  });
});
