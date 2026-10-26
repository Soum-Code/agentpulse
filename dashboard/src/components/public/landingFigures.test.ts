/** Guards against the unsourced figures coming back.
 *
 * The court review (2026-10-25) and the skills review found these on the live site with no
 * file in the repo behind them. Some sit behind a toggle the static renderer never opens
 * (the landing page's "Analytical Breakdown"), so this test reads the source text instead of
 * the rendered page. A sync from another editor (the AI Studio route overwrote main once,
 * SESSION_HANDOFF.md section 28) would bring them back silently; this makes it loud.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The source with its comments removed: the comments that explain a fix quote the old
// figure on purpose, and only the code and the visible text matter here.
const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// Each entry: a file and strings that had no source and were removed from it.
const REMOVED: Array<[string, string[]]> = [
  ['./PublicExperience.tsx', [
    '0.74 Δ', '0.84 Δ', '74.8%', 'flagged 142', '142 flagged', 'Cluster #3', 'Cosine Sim &gt; 0.94',
    '12% Parameter Spread', 'Discrepancy: 0.89', 'v2.4 research baseline', 'Zero Regression',
    'Automated guardrail re-anchoring', 'Exact AST &amp; JSON Schema', 'inter-agent contradiction trees',
    'without redaction or loss', 'AST parser', 'From Normal to Deviation to Drift',
    // The 10.2 pooled-session prototype's figures, once credited to the shipped detector.
    '6.8%', '82.5%', 'Warehouse catalog confirmed',
  ]],
  ['./EnterpriseArchDiagram.tsx', ['SDK errors re-run the agent']],
  ['../product/OverviewView.tsx', ['inter-agent contradiction, and drift evaluations', '203ms median latency', 'no baseline yet']],
  ['../product/ExperimentsView.tsx', ['Run Experiment Batch', 'Running Benchmark Matrix', 'Deterministic Regression Loop']],
  ['../product/FloatingDock.tsx', ['Braintrust/Langfuse']],
  ['../../lib/agentFormat.ts', ["'no baseline'", 'with no drift baseline yet']],
  ['../product/DriftView.tsx', ['5,000 verified runs', '12-30% Δ', '50% Δ Divergence', '28% syntax rejection', '14% of analytical', 'so no alert reads it']],
  ['../product/AgentsView.tsx', ['4 active swarms', 'LangGraph, LangGraph', 'AgentLatencySparkline']],
  ['../product/CommandPalette.tsx', ['+35% visible trace rows', 'cost burn', 'Braintrust / Langfuse', '${trace.durationMs}ms · ${trace.totalTokens} tokens']],
  ['../product/TelemetryLabView.tsx', ['near 0.50']],
];

describe('figures with no source stay removed', () => {
  for (const [file, strings] of REMOVED) {
    it(`${file} carries none of them`, () => {
      const src = read(file);
      for (const s of strings) expect(src, s).not.toContain(s);
    });
  }

  it('nothing imports the deleted random latency generator', () => {
    // utils/latencyTelemetry.ts built a "60-minute latency" series from Math.random().
    for (const file of ['../product/AgentsView.tsx', '../product/DriftView.tsx', '../product/ActiveContextPanel.tsx']) {
      expect(read(file)).not.toContain('latencyTelemetry');
    }
  });
});
