import { describe, it, expect } from 'vitest';
import type { ApiReadiness, EvaluatorReadiness, PlatformHealth } from './api';
import { describeBanner, serverErrorRate, summariseStatus } from './platformStats';

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

describe('summariseStatus label follows the final level', () => {
  it('a healthy platform with a failed readiness check is failing, not operational', () => {
    expect(summariseStatus({ platform: platform('healthy'), ready: ready(false, ['database down']), evaluator: null }).label).toBe('failing');
  });

  it('a healthy platform with no live evaluator worker is degraded, not operational', () => {
    const s = summariseStatus({ platform: platform('healthy'), ready: ready(true), evaluator: evaluator({ ready: false, workers_alive: 0 }) });
    expect(s.level).toBe('warn');
    expect(s.label).toBe('degraded');
  });

  it('keeps the platform own word when it agrees with the level', () => {
    expect(summariseStatus({ platform: platform('backlogged'), ready: ready(true), evaluator: evaluator() }).label).toBe('backlogged');
    expect(summariseStatus({ platform: platform('failing'), ready: null, evaluator: null }).label).toBe('failing');
  });
});

describe('describeBanner', () => {
  const ok = summariseStatus({ platform: platform('healthy'), ready: ready(true), evaluator: evaluator() });

  it('prints the all-clear only when all three endpoints answered and the summary is ok', () => {
    const b = describeBanner({ platform: 'ready', ready: 'ready', evaluator: 'ready' }, ok);
    expect(b.level).toBe('ok');
    expect(b.headline).toContain('ALL SYSTEMS OPERATIONAL');
    expect(b.detail).toContain('No degradation reported');
  });

  it('is PARTIAL, never operational, when an endpoint did not answer but the others look fine', () => {
    const b = describeBanner({ platform: 'error', ready: 'ready', evaluator: 'unreachable' }, summariseStatus({ platform: null, ready: ready(true), evaluator: null }));
    expect(b.level).toBe('unknown');
    expect(b.headline).toBe('SYSTEM STATUS: PARTIAL');
    expect(b.headline).not.toContain('OPERATIONAL');
    expect(b.detail).toContain('/v1/platform');
    expect(b.detail).toContain('/v1/health/evaluator');
    expect(b.detail).not.toContain('No degradation');
  });

  it('a pending endpoint counts as not answered', () => {
    expect(describeBanner({ platform: 'ready', ready: 'pending', evaluator: 'ready' }, ok).headline).toBe('SYSTEM STATUS: PARTIAL');
  });

  it('is CHECKING while nothing has answered yet and UNREACHABLE when everything failed', () => {
    expect(describeBanner({ platform: 'pending', ready: 'pending', evaluator: 'pending' }, ok).headline).toBe('SYSTEM STATUS: CHECKING');
    expect(describeBanner({ platform: 'error', ready: 'unreachable', evaluator: 'error' }, ok)).toMatchObject({ level: 'bad', headline: 'SYSTEM STATUS: API UNREACHABLE' });
  });

  it('keeps a real warning or failure and adds what did not answer', () => {
    const bad = summariseStatus({ platform: platform('healthy'), ready: ready(false, ['database down']), evaluator: null });
    const b = describeBanner({ platform: 'ready', ready: 'ready', evaluator: 'error' }, bad);
    expect(b.level).toBe('bad');
    expect(b.headline).toBe('SYSTEM STATUS: FAILING');
    expect(b.detail).toContain('database down');
    expect(b.detail).toContain('/v1/health/evaluator');
  });
});

