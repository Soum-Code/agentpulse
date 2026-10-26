import { describe, it, expect } from 'vitest';
import type { ApiReadiness, EvaluatorReadiness, PlatformHealth } from './api';
import { serverErrorRate, summariseStatus } from './platformStats';

const platform = (state: PlatformHealth['state'], reasons: string[] = []): PlatformHealth =>
  ({ state, reasons, evaluation_queue: { depth: 0, backlog_threshold: 750 }, workers: {} }) as PlatformHealth;
const ready = (ok: boolean, reasons: string[] = []): ApiReadiness => ({ ready: ok, checks: {}, reasons });
const evaluator = (over: Partial<EvaluatorReadiness> = {}): EvaluatorReadiness => ({
  ready: true,
  workers_alive: 1,
  workers_registered: 1,
  workers_stale: 0,
  degraded: false,
  reasons: [],
  ...over,
});

describe('serverErrorRate', () => {
  it('is errors over requests', () => {
    expect(serverErrorRate({ requests_total: 200, server_errors_total: 5 })).toBeCloseTo(0.025);
  });

  it('is null, not 0, when nothing has been counted', () => {
    expect(serverErrorRate({ requests_total: 0, server_errors_total: 0 })).toBeNull();
    expect(serverErrorRate({})).toBeNull();
    expect(serverErrorRate(undefined)).toBeNull();
  });

  it('is 0 when requests were counted and none failed, and never above 1', () => {
    expect(serverErrorRate({ requests_total: 578, server_errors_total: 0 })).toBe(0);
    expect(serverErrorRate({ requests_total: 2, server_errors_total: 9 })).toBe(1);
  });

  it('ignores non-finite counters', () => {
    expect(serverErrorRate({ requests_total: NaN, server_errors_total: 1 })).toBeNull();
  });
});

describe('summariseStatus', () => {
  it('is ok when everything that answered is fine', () => {
    const s = summariseStatus({ platform: platform('healthy'), ready: ready(true), evaluator: evaluator() });
    expect(s).toEqual({ level: 'ok', label: 'operational', reasons: [] });
  });

  it('is bad when the platform is failing or the API is not ready', () => {
    expect(summariseStatus({ platform: platform('failing', ['no workers']), ready: null, evaluator: null }).level).toBe('bad');
    const notReady = summariseStatus({ platform: platform('healthy'), ready: ready(false, ['database down']), evaluator: null });
    expect(notReady.level).toBe('bad');
    expect(notReady.reasons).toEqual(['database down']);
  });

  it('is warn when backlogged, degraded, starting, or the evaluator has no live worker', () => {
    expect(summariseStatus({ platform: platform('backlogged', ['queue deep']), ready: null, evaluator: null })).toMatchObject({ level: 'warn', label: 'backlogged' });
    expect(summariseStatus({ platform: platform('starting'), ready: null, evaluator: null }).level).toBe('warn');
    const noWorker = summariseStatus({ platform: platform('healthy'), ready: ready(true), evaluator: evaluator({ ready: false, workers_alive: 0, reasons: ['no live worker'] }) });
    expect(noWorker.level).toBe('warn');
    expect(noWorker.reasons).toEqual(['no live worker']);
  });

  it('lists each reason once even if two endpoints repeat it', () => {
    const s = summariseStatus({ platform: platform('degraded', ['worker stale']), ready: null, evaluator: evaluator({ ready: false, reasons: ['worker stale', 'x'] }) });
    expect(s.reasons).toEqual(['worker stale', 'x']);
  });

  it('a bad level is not lowered by a warning from another endpoint', () => {
    const s = summariseStatus({ platform: platform('healthy'), ready: ready(false, ['db']), evaluator: evaluator({ degraded: true }) });
    expect(s.level).toBe('bad');
  });
});
