import { describe, it, expect } from 'vitest';
import { summarizeDrift, breakDownIncidents } from './overviewStats';
import type { Agent, Incident } from '../types';

const agent = (id: string, driftStatus?: Agent['driftStatus'], driftScore?: number): Agent => ({
  id,
  name: id,
  status: 'idle',
  latencyAvgMs: 10,
  successRate: 100,
  totalSpans: 1,
  description: '',
  driftScore,
  driftStatus,
  lastActive: '2026-10-21T08:44:42',
});

const incident = (id: string, status: Incident['status'], severity: Incident['severity'] = 'warning'): Incident => ({
  id,
  title: 'DRIFT DETECTED',
  severity,
  agentId: 'a',
  agentName: 'a',
  traceId: 't',
  detectedAt: '2026-10-21T08:44:42',
  status,
  summary: '',
});

describe('summarizeDrift', () => {
  it('does not count an agent with no baseline as drifting', () => {
    // The console used to count every agent whose driftStatus was not 'normal', and an
    // agent with no baseline has driftStatus undefined: ten fresh agents read as ten flagged.
    const agents = Array.from({ length: 10 }, (_, i) => agent(`a${i}`));
    expect(summarizeDrift(agents)).toEqual({ drifting: 0, noBaseline: 10, maxDrift: null });
  });

  it('counts only agents beyond the threshold as drifting', () => {
    const agents = [agent('calm', 'normal', 0.05), agent('moving', 'drift', 0.42), agent('fresh')];
    const summary = summarizeDrift(agents);
    expect(summary.drifting).toBe(1);
    expect(summary.noBaseline).toBe(1);
  });

  it('reports the largest window distance among the drifting agents, with its agent', () => {
    const agents = [
      agent('a', 'drift', 0.42),
      agent('b', 'drift', 0.91),
      agent('c', 'drift', 0.55),
      agent('quiet', 'normal', 0.2),
    ];
    expect(summarizeDrift(agents).maxDrift).toEqual({ agentId: 'b', distance: 0.91 });
  });

  it('ignores the distance of an agent that is not drifting', () => {
    // A 'normal' agent can never be the maximum, whatever its score is.
    const agents = [agent('calm', 'normal', 0.29), agent('moving', 'drift', 0.31)];
    expect(summarizeDrift(agents).maxDrift).toEqual({ agentId: 'moving', distance: 0.31 });
  });

  it('has no maximum when nothing is drifting, and none to invent', () => {
    expect(summarizeDrift([]).maxDrift).toBeNull();
    expect(summarizeDrift([agent('calm', 'normal', 0.1)]).maxDrift).toBeNull();
  });

  it('counts a drifting agent with no usable distance without making one up', () => {
    const summary = summarizeDrift([agent('odd', 'drift', undefined), agent('nan', 'drift', NaN)]);
    expect(summary.drifting).toBe(2);
    expect(summary.maxDrift).toBeNull();
  });
});

describe('breakDownIncidents', () => {
  it('counts alerts by state', () => {
    const incidents = [
      incident('1', 'open'),
      incident('2', 'open'),
      incident('3', 'investigating'),
      incident('4', 'resolved'),
    ];
    expect(breakDownIncidents(incidents)).toMatchObject({ open: 2, investigating: 1, resolved: 1 });
  });

  it('counts as active only what is not resolved', () => {
    // The card used to count every alert, resolved ones included, under "Active Incidents".
    const incidents = [
      incident('1', 'open', 'critical'),
      incident('2', 'investigating', 'critical'),
      incident('3', 'resolved', 'critical'),
      incident('4', 'resolved', 'warning'),
      incident('5', 'open', 'warning'),
    ];
    const counts = breakDownIncidents(incidents);
    expect(counts.active).toBe(3);
    expect(counts.activeCritical).toBe(2);
    expect(counts.resolved).toBe(2);
  });

  it('is all zero when there are no alerts', () => {
    expect(breakDownIncidents([])).toEqual({ open: 0, investigating: 0, resolved: 0, active: 0, activeCritical: 0 });
  });
});
