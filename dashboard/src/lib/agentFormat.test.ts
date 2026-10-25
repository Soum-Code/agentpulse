/** Tests for the agent formatters. The live Agents view printed `NaNms`, `ms avg` with no
 *  number and `Δ ()`; every case below pins the em dash that replaces a missing value. */
import { describe, expect, it } from 'vitest';
import {
  DASH,
  agentSubtitle,
  distanceBarPct,
  driftStatusLabel,
  formatDistance,
  formatLatencyMs,
  formatSuccessRate,
  isLowSuccess,
  isOverDriftThreshold,
  rosterSummary,
} from './agentFormat';
import type { Agent } from '../types';

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: 'a',
  name: 'a',
  status: 'idle',
  successRate: 100,
  totalTraces24h: 1,
  lastActive: '2026-10-25T08:00:00',
  ...over,
});

describe('formatLatencyMs', () => {
  it('rounds a measured latency to whole milliseconds', () => {
    expect(formatLatencyMs(22.4)).toBe('22 ms');
    expect(formatLatencyMs(0)).toBe('0 ms');
  });

  it('prints a dash for undefined, null and NaN, never "NaN ms"', () => {
    expect(formatLatencyMs(undefined)).toBe(DASH);
    expect(formatLatencyMs(null)).toBe(DASH);
    expect(formatLatencyMs(NaN)).toBe(DASH);
  });
});

describe('formatSuccessRate', () => {
  it('keeps at most one decimal and drops a trailing .0', () => {
    expect(formatSuccessRate(83.33000000000001)).toBe('83.3%');
    expect(formatSuccessRate(100)).toBe('100%');
  });

  it('prints a dash when the rate is not a number', () => {
    expect(formatSuccessRate(undefined)).toBe(DASH);
    expect(formatSuccessRate(NaN)).toBe(DASH);
  });

  it('only calls a real rate below 90 low', () => {
    expect(isLowSuccess(89.9)).toBe(true);
    expect(isLowSuccess(90)).toBe(false);
    expect(isLowSuccess(undefined)).toBe(false);
    expect(isLowSuccess(NaN)).toBe(false);
  });
});

describe('drift distance helpers', () => {
  it('prints three decimals or a dash', () => {
    expect(formatDistance(0.973421)).toBe('0.973');
    expect(formatDistance(undefined)).toBe(DASH);
    expect(formatDistance(null)).toBe(DASH);
  });

  it('draws no bar for an unknown distance and caps the bar at 100%', () => {
    expect(distanceBarPct(undefined)).toBe(0);
    expect(distanceBarPct(0.25)).toBe(25);
    expect(distanceBarPct(1.6)).toBe(100);
  });

  it('uses the same 0.30 threshold as the DRIFT_DETECTED alert, strictly above', () => {
    expect(isOverDriftThreshold(0.3)).toBe(false);
    expect(isOverDriftThreshold(0.31)).toBe(true);
    expect(isOverDriftThreshold(undefined)).toBe(false);
  });

  it('names a missing status "no baseline" rather than leaving the badge empty', () => {
    expect(driftStatusLabel(undefined)).toBe('no baseline');
    expect(driftStatusLabel('drift')).toBe('drift');
  });
});

describe('rosterSummary', () => {
  it('counts what was loaded instead of a typed-in "4 active swarms"', () => {
    const agents = [
      agent({ id: 'x', driftStatus: 'drift', driftScore: 0.9 }),
      agent({ id: 'y', driftStatus: 'normal', driftScore: 0.1 }),
      agent({ id: 'z' }),
    ];
    expect(rosterSummary(agents)).toBe('3 agents seen · 1 drifting · 1 with no drift baseline yet');
  });

  it('says so when there are no agents', () => {
    expect(rosterSummary([])).toBe('No agents have sent a span yet');
  });
});

describe('agentSubtitle', () => {
  it('leaves out the parts that were never recorded', () => {
    // Regression: the command palette printed "undefined · undefined · undefinedms avg".
    expect(agentSubtitle(agent({ latencyAvgMs: 21.6, successRate: 75 }))).toBe('22 ms avg · 75% OK');
    expect(agentSubtitle(agent({ successRate: 100 }))).toBe('100% OK');
    expect(agentSubtitle(agent({ successRate: NaN }))).toBe('No latency or success rate recorded yet');
  });
});
