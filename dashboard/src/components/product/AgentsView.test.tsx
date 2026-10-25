/** Renders the Agents and Drift views from real-shaped API rows (through the adapters) and
 *  checks the text a visitor would read: no NaN, no "undefined", no number left blank, and
 *  none of the figures that used to be typed in or generated in the browser. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentsView } from './AgentsView';
import { DriftView } from './DriftView';
import { toAgents, toDriftProfiles, type DriftEntry } from '../../lib/adapters';
import type { Agent as ApiAgent } from '../../lib/api';

// Two agents as GET /v1/agents returns them: one with no latency and no drift record yet
// (the case that printed NaNms on the live site), one that has drifted.
const apiAgents = [
  {
    agent_id: 'fresh_agent',
    agent_role: null,
    pipeline_id: null,
    first_seen: '2026-10-25T08:00:00',
    last_seen: '2026-10-25T08:05:00',
    total_spans: 3,
    total_errors: 1,
    error_rate: 0.3333,
    avg_latency_ms: null,
    avg_risk_score: null,
    current_asi: null,
  },
  {
    agent_id: 'drift_demo_agent',
    agent_role: 'support',
    pipeline_id: null,
    first_seen: '2026-10-25T08:00:00',
    last_seen: '2026-10-25T08:06:00',
    total_spans: 32,
    total_errors: 0,
    error_rate: 0,
    avg_latency_ms: 21.6,
    avg_risk_score: 0.3,
    current_asi: 71.2,
  },
] as ApiAgent[];

const drift: DriftEntry[] = [
  { agent_id: 'fresh_agent', current_asi: null, latest_centroid_distance: null, latest_window_centroid_distance: null, latest_tool_drift: null, baseline_size: 0 },
  { agent_id: 'drift_demo_agent', current_asi: 71.2, latest_centroid_distance: 0.61, latest_window_centroid_distance: 0.9731, latest_tool_drift: null, baseline_size: 31 },
];

// Strip tags so the assertions read the visible text, as a visitor would.
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const noop = () => {};

afterEach(() => vi.restoreAllMocks());

describe('AgentsView with real-shaped data', () => {
  const agents = toAgents(apiAgents, drift);

  const render = (selected = agents[0]) =>
    text(
      renderToStaticMarkup(
        <AgentsView
          agents={agents}
          selectedAgent={selected}
          onSelectAgent={noop}
          onNavigateToTraces={noop}
          onNavigateToDrift={noop}
        />,
      ),
    );

  it('prints no NaN, no undefined and no unit without a number', () => {
    for (const selected of agents) {
      const out = render(selected);
      expect(out).not.toMatch(/NaN/);
      expect(out).not.toMatch(/undefined/);
      // "ms" must follow a number: the old roster printed "ms avg" with nothing before it.
      expect(out).not.toMatch(/(?<!\d )ms avg/);
      expect(out).not.toMatch(/(?<!\d ?)\bms\b/);
      expect(out).not.toMatch(/Δ \(\)/);
    }
  });

  it('shows the measured values and a dash for the missing ones', () => {
    const out = render(agents[1]);
    expect(out).toContain('22 ms avg');
    expect(out).toContain('— avg');
    expect(out).toContain('66.7% OK');
    expect(out).toContain('0.973 (drift)');
    expect(out).toContain('2 agents seen · 1 drifting · 1 with no drift baseline yet');
  });

  it('explains a missing drift distance instead of printing a blank', () => {
    const out = render(agents[0]);
    expect(out).toContain('— (no baseline)');
    expect(out).toContain('first 20 evaluated outputs');
  });

  it('no longer shows the typed-in header or the generated latency chart', () => {
    const out = render(agents[1]);
    for (const gone of ['4 active swarms', 'LangGraph', '60m Latency', '60-Minute', '+140%', 'baseline SLA', 'CURRENT LATENCY']) {
      expect(out).not.toContain(gone);
    }
  });

  it('draws nothing from Math.random', () => {
    // The old chart's points came from Math.random(); rendering must not call it at all.
    const spy = vi.spyOn(Math, 'random');
    render(agents[1]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DriftView with real-shaped data', () => {
  const profiles = toDriftProfiles(drift);

  const render = () => {
    const html = renderToStaticMarkup(
      <DriftView
        driftProfiles={profiles}
        agents={toAgents(apiAgents, drift)}
        selectedAgentId={profiles[0].agentId}
        onNavigateToTrace={noop}
      />,
    );
    return { html, out: text(html) };
  };

  it('prints a dash for a distance that does not exist yet, and no NaN', () => {
    const { out } = render();
    expect(out).not.toMatch(/NaN|undefined/);
    expect(out).toContain('(— Δ)');
    expect(out).toContain('(0.973 Δ)');
    expect(out).toContain('Drift windows have not filled yet');
  });

  it('no longer shows the figures nothing in the API produces', () => {
    const { out } = render();
    for (const gone of ['5,000 verified runs', '12-30%', '> 50%', '&gt; 50%', '28%', '14%', 'Active Sample', 'Parameter Drift']) {
      expect(out).not.toContain(gone);
    }
    expect(out).toContain('Illustrative, not measured');
  });

  it('draws no bar wider than its value allows', () => {
    // A NaN width rendered as "width:NaN%"; an unknown distance must give 0%.
    const { html } = render();
    expect(html).not.toMatch(/width:\s*NaN/);
  });
});
