/** Renders the Experiments view from real-shaped GET /v1/experiments entries (through
 *  toExperiments). Before 2026-10-26 the first real entry threw a TypeError on
 *  `comparisonDiffs.map` and blanked the whole console, and every card printed "NaN%". */
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ExperimentsView } from './ExperimentsView';
import { toExperiments } from '../../lib/adapters';

// Two result files as the API lists them: no scores, no diffs, some fields null.
const raw = [
  { file: 'ablation_results.json', timestamp: '2026-09-18 17:34:03 UTC', model: null, dataset: null, data: {} },
  { file: 'llm_judge_comparison.json', timestamp: null, model: 'qwen3-8b', dataset: 'v1.0_test', data: {} },
];

// Visible text only, as a visitor would read it.
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// React's act() needs this flag in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

describe('ExperimentsView with real-shaped data', () => {
  it('renders without throwing and prints no NaN or empty percentages', () => {
    const out = text(renderToStaticMarkup(<ExperimentsView experiments={toExperiments(raw)} datasets={[]} />));
    expect(out).not.toMatch(/NaN|undefined/);
    expect(out).not.toContain('+% Win Rate');
    expect(out).not.toMatch(/(?<![\d—] ?)%/);
    expect(out).toContain('Baseline: —');
    expect(out).toContain('Items evaluated: —');
    expect(out).toContain('ablation_results.json');
    expect(out).toContain('Model: qwen3-8b');
  });

  it('has no button that pretends to run an experiment', () => {
    const out = text(renderToStaticMarkup(<ExperimentsView experiments={toExperiments(raw)} datasets={[]} />));
    expect(out).not.toContain('Run Experiment Batch');
    expect(out).not.toContain('Running Benchmark Matrix');
  });

  it('says so when there are no results', () => {
    const out = text(renderToStaticMarkup(<ExperimentsView experiments={[]} datasets={[]} />));
    expect(out).toContain('No experiment results are available');
  });

  it('selects the first entry when the list arrives after the view mounted', async () => {
    // useTelemetry loads experiments after the agents, so the view first renders with [].
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ExperimentsView experiments={[]} datasets={[]} />);
    });
    await act(async () => {
      root.render(<ExperimentsView experiments={toExperiments(raw)} datasets={[]} />);
    });
    expect(container.textContent).toContain('EXPERIMENT RESULT');
    expect(container.textContent).toContain('experiments/results/ablation_results.json');
    await act(async () => root.unmount());
  });
});
