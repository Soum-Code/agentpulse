/** Counts for the Overview cards, each read from data the console already loaded.
 *
 * An agent's driftStatus is 'drift' or 'normal' once its window metric exists, and
 * undefined until then (adapters.ts leaves it absent rather than guess 'normal').
 * An agent with no baseline yet is neither drifting nor stable, so it is counted
 * on its own and never as flagged. ('deviation' is in the type, but nothing in
 * adapters.ts produces it, so it is not counted as drifting either.)
 */
import type { Agent, Incident } from '../types';

export interface DriftSummary {
  /** Agents beyond the drift threshold. */
  drifting: number;
  /** Agents whose baseline and current windows have not both filled. */
  noBaseline: number;
  /** The drifting agent with the largest window centroid distance, or null when none is drifting. */
  maxDrift: { agentId: string; distance: number } | null;
}

export function summarizeDrift(agents: Agent[]): DriftSummary {
  let drifting = 0;
  let noBaseline = 0;
  let maxDrift: DriftSummary['maxDrift'] = null;

  for (const agent of agents) {
    if (agent.driftStatus === 'drift') {
      drifting += 1;
      // driftScore is latest_window_centroid_distance, the metric the drift alert fires on
      const distance = agent.driftScore;
      if (distance != null && Number.isFinite(distance) && (maxDrift === null || distance > maxDrift.distance)) {
        maxDrift = { agentId: agent.id, distance };
      }
    } else if (agent.driftStatus === undefined || agent.driftStatus === null) {
      noBaseline += 1;
    }
  }

  return { drifting, noBaseline, maxDrift };
}

export interface IncidentBreakdown {
  open: number;
  investigating: number;
  resolved: number;
}

/** Alerts by state: open, acknowledged ('investigating'), and resolved. */
export function breakDownIncidents(incidents: Incident[]): IncidentBreakdown {
  const out: IncidentBreakdown = { open: 0, investigating: 0, resolved: 0 };
  for (const incident of incidents) {
    if (incident.status === 'resolved') out.resolved += 1;
    else if (incident.status === 'investigating') out.investigating += 1;
    else out.open += 1;
  }
  return out;
}
