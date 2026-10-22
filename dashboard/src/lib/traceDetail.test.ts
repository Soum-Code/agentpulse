import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({ api: { getTrace: vi.fn() } }));

import { api } from './api';
import { loadFullTrace, loadFullTraces } from './traceDetail';
import type { Trace } from '../types';

const entry = (id: string): Trace => ({
  id,
  agentId: 'svc',
  agentName: 'svc',
  rootSpanId: '',
  status: 'ok',
  durationMs: 0,
  timestamp: '2026-10-21T08:44:42',
  inputPreview: '',
  outputPreview: '',
  spans: [],
});

const detail = (id: string) => ({
  trace: { trace_id: id, service_name: 'svc', start_time: '2026-10-21T08:44:42', end_time: null, status: 'completed', total_spans: 1, overall_risk_score: 0.4, pipeline_id: null },
  spans: [
    {
      span_id: `${id}-s1`, parent_span_id: null, agent_id: 'analyst', agent_role: null, event_type: 'agent_execution',
      span_kind: 'agent', latency_ms: 12, status: 'success', error_message: null, model: null, tokens_in: 30, tokens_out: 5,
      tool_name: null, input_summary: 'in', output_summary: 'out', start_time: '2026-10-21T08:44:42', evaluation: null,
    },
  ],
  alerts: [],
});

describe('loadFullTrace', () => {
  // Braces matter: mockReset() returns the mock, and a function returned from beforeEach is run
  // as that test's cleanup, which called the mock again after the test.
  beforeEach(() => {
    vi.mocked(api.getTrace).mockReset();
  });

  it('fetches the detail of a list entry and maps spans, tokens, scores and alerts', async () => {
    vi.mocked(api.getTrace).mockResolvedValue(detail('t1') as never);
    const full = await loadFullTrace(entry('t1'));

    expect(api.getTrace).toHaveBeenCalledWith('t1');
    expect(full.spans).toHaveLength(1);
    expect(full.totalTokens).toBe(35);
    expect(full.groundingScore).toBe(0.4);
    expect(full.alerts).toEqual([]);
  });

  it('does not fetch a trace whose detail is already loaded', async () => {
    const loaded: Trace = { ...entry('t2'), alerts: [] };
    expect(await loadFullTrace(loaded)).toBe(loaded);
    expect(api.getTrace).not.toHaveBeenCalled();
  });

  it('rejects when the API fails, so nothing half-empty gets exported', async () => {
    vi.mocked(api.getTrace).mockRejectedValue(new Error('API request failed: 500'));
    await expect(loadFullTrace(entry('t3'))).rejects.toThrow('500');
    await expect(loadFullTraces([entry('t3')])).rejects.toThrow('500');
  });

  it('loads only the entries that need it', async () => {
    vi.mocked(api.getTrace).mockImplementation(async (id: string) => detail(id) as never);
    const out = await loadFullTraces([entry('a'), { ...entry('b'), alerts: [] }, entry('c')]);
    expect(out.map((t) => t.spans.length)).toEqual([1, 0, 1]);
    expect(vi.mocked(api.getTrace).mock.calls.map((c) => c[0])).toEqual(['a', 'c']);
  });
});
