/**
 * Polls the three health endpoints the Performance view and the status banner are built on:
 *   GET /v1/platform          queue, timing, counters, workers  -> `platform`
 *   GET /v1/health/ready      is the API itself ready (database check) -> `ready`
 *   GET /v1/health/evaluator  is a worker alive to evaluate spans -> `evaluator`
 *
 * Each one is its own feed (pending / ready / unreachable / error, see stateModel.ts), because one
 * can fail while the others answer; a number read from a failed feed is shown as such and never
 * as 0. Pass `paused` to stop the automatic refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiReadiness, EvaluatorReadiness, PlatformHealth } from './api';
import { Feed, feedFromError } from './stateModel';

const POLL_MS = 10000;

export interface Fetched<T> {
  feed: Feed;
  data: T | null;
}

export interface PlatformStatus {
  platform: Fetched<PlatformHealth>;
  ready: Fetched<ApiReadiness>;
  evaluator: Fetched<EvaluatorReadiness>;
  /** When the last poll finished (ms since epoch), or null before the first one. */
  updatedAt: number | null;
  refresh: () => void;
}

const pending = <T,>(): Fetched<T> => ({ feed: { status: 'pending' }, data: null });

/** Turns the outcome of one request into a Fetched. A failed request keeps the last good data out of view on purpose. */
function settle<T>(result: PromiseSettledResult<T>): Fetched<T> {
  return result.status === 'fulfilled'
    ? { feed: { status: 'ready' }, data: result.value }
    : { feed: feedFromError(result.reason), data: null };
}

export function usePlatformStatus(paused = false): PlatformStatus {
  const [platform, setPlatform] = useState<Fetched<PlatformHealth>>(pending);
  const [ready, setReady] = useState<Fetched<ApiReadiness>>(pending);
  const [evaluator, setEvaluator] = useState<Fetched<EvaluatorReadiness>>(pending);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // allSettled: one endpoint failing must not hide the answers of the others.
      const [p, r, e] = await Promise.allSettled([
        api.getPlatformHealth(),
        api.getReadiness(),
        api.getEvaluatorReadiness(),
      ]);
      if (cancelled || !mounted.current) return;
      setPlatform(settle(p));
      setReady(settle(r));
      setEvaluator(settle(e));
      setUpdatedAt(Date.now());
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, paused]);

  return { platform, ready, evaluator, updatedAt, refresh };
}
