/** Live telemetry for the product views, polled from a running AgentPulse. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { keepLoadedDetail, loadFullTrace } from './traceDetail';
import { escalateFromAlertFeed } from './traceStatus';
import {
  DriftEntry,
  toAgents,
  toDatasets,
  toDriftProfiles,
  toExperiments,
  toIncidents,
  toTrace,
} from './adapters';
import { Feed, feedFromError } from './stateModel';
import type { Agent, Dataset, DriftProfile, Experiment, Incident, Trace } from '../types';

const POLL_MS = 10000;
// Traces are fetched as a list, then hydrated one at a time; spans only come
// from the per-trace endpoint.
const TRACE_PAGE = 50;
const HYDRATE_LIMIT = 12;

export interface TelemetryState {
  agents: Agent[];
  traces: Trace[];
  incidents: Incident[];
  driftProfiles: DriftProfile[];
  datasets: Dataset[];
  experiments: Experiment[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  /** The same answer as `loading`/`error`, in the five-state model: read numbers through
   *  datumFromFeed(feed, ...) so none is shown as 0 or blank while the API is down. */
  feed: Feed;
  /** When the last SUCCESSFUL poll finished (ms since epoch); null until one has. */
  lastOkAt: number | null;
  refresh: () => void;
}

/**
 * Polls the AgentPulse API for the console's data every POLL_MS.
 * `paused` stops the automatic refresh (the header's live toggle); a manual refresh() still works.
 */
export function useTelemetry(paused = false): TelemetryState {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [driftProfiles, setDriftProfiles] = useState<DriftProfile[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Why the last poll failed, classified as unreachable (no answer) or error (API said no).
  const [failure, setFailure] = useState<Feed | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);

  // The traces on screen, readable from inside load() without making it depend on them.
  const tracesRef = useRef<Trace[]>([]);
  tracesRef.current = traces;

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

    async function load() {
      try {
        const [agentsRes, driftRes, alertsRes, tracesRes] = await Promise.all([
          api.getAgents(),
          api.getDrift(),
          api.getAlerts(TRACE_PAGE),
          api.getTraces(TRACE_PAGE, 0),
        ]);
        if (cancelled || !mounted.current) return;

        const driftEntries = (driftRes.agents ?? []) as DriftEntry[];
        setAgents(toAgents(agentsRes.agents ?? [], driftEntries));
        setDriftProfiles(toDriftProfiles(driftEntries));
        setIncidents(toIncidents(alertsRes.alerts ?? []));

        // Show the list immediately, then fill in spans for the newest traces. A list entry has no
        // alerts, so its status is unknown, except where the alert feed above already names it.
        // `shown` keeps the detail loaded by an earlier poll for a trace until the new detail
        // arrives, so statuses do not flip to unknown and back every ten seconds.
        const alertFeed = alertsRes.alerts ?? [];
        const listed = (tracesRes.traces ?? []).map((t) => escalateFromAlertFeed(toTrace(t), alertFeed));
        const shown = keepLoadedDetail(listed, tracesRef.current);
        setTraces(shown);
        setConnected(true);
        setError(null);
        setFailure(null);
        setLastOkAt(Date.now());
        setLoading(false);

        const hydrated = await Promise.all(
          listed.slice(0, HYDRATE_LIMIT).map(async (shallow, i) => {
            try {
              return await loadFullTrace(shallow);
            } catch {
              return shown[i];
            }
          }),
        );
        if (cancelled || !mounted.current) return;
        setTraces([...hydrated, ...shown.slice(HYDRATE_LIMIT)]);
      } catch (err) {
        if (cancelled || !mounted.current) return;
        setConnected(false);
        setError(err instanceof Error ? err.message : 'Failed to reach AgentPulse');
        setFailure(feedFromError(err));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Catalogue endpoints change rarely, so they load once per refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ds, ex] = await Promise.all([api.getDatasets(), api.getExperiments()]);
        if (cancelled || !mounted.current) return;
        setDatasets(toDatasets(ds.datasets ?? []));
        setExperiments(toExperiments(ex.file_experiments ?? []));
      } catch {
        // Catalogue failure must not blank the live views.
      }
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

  // pending until the first answer; after that the last poll's outcome.
  const feed: Feed = loading ? { status: 'pending' } : failure ?? { status: 'ready' };

  return {
    agents,
    traces,
    incidents,
    driftProfiles,
    datasets,
    experiments,
    loading,
    error,
    connected,
    feed,
    lastOkAt,
    refresh,
  };
}
