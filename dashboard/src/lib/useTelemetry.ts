/** Live telemetry for the product views, polled from a running AgentPulse. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import {
  DriftEntry,
  toAgents,
  toDatasets,
  toDriftProfiles,
  toExperiments,
  toIncidents,
  toSpans,
  toTrace,
} from './adapters';
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
  refresh: () => void;
}

export function useTelemetry(): TelemetryState {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [driftProfiles, setDriftProfiles] = useState<DriftProfile[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
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

        // Show the list immediately, then fill in spans for the newest traces.
        const listed = (tracesRes.traces ?? []).map((t) => toTrace(t));
        setTraces(listed);
        setConnected(true);
        setError(null);
        setLoading(false);

        const hydrated = await Promise.all(
          listed.slice(0, HYDRATE_LIMIT).map(async (shallow, i) => {
            try {
              const full = await api.getTrace(shallow.id);
              return toTrace(full.trace, toSpans(full.spans ?? [], shallow.id), full.alerts ?? []);
            } catch {
              return listed[i];
            }
          }),
        );
        if (cancelled || !mounted.current) return;
        setTraces([...hydrated, ...listed.slice(HYDRATE_LIMIT)]);
      } catch (err) {
        if (cancelled || !mounted.current) return;
        setConnected(false);
        setError(err instanceof Error ? err.message : 'Failed to reach AgentPulse');
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
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

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
    refresh,
  };
}
