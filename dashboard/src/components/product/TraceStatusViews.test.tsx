/** Renders the Traces and Overview views from traces built by the adapters, and checks what a
 *  visitor reads: a trace with a HIGH alert is not "ok", an unknown duration is a dash and never
 *  "0ms", an unloaded trace says unknown, and the Overview's copy button reports what happened. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TracesView } from './TracesView';
import { OverviewView } from './OverviewView';
import { ActiveContextPanel } from './ActiveContextPanel';
import { toAgents, toSpans, toTrace } from '../../lib/adapters';
import type { Agent as ApiAgent, AlertItem, SpanDetail, TraceListItem } from '../../lib/api';

// The Overview calls an Anime.js entrance animation from an effect; it has nothing to do with
// these checks and needs layout that jsdom does not have.
vi.mock('../../utils/liquidHoverAnime', () => ({
  triggerCardEntranceAnimation: () => {},
  prefersReducedMotion: () => true,
}));

const row = (id: string, over: Partial<TraceListItem> = {}): TraceListItem =>
  ({ trace_id: id, service_name: 'svc', start_time: '2026-10-27T10:00:00', end_time: null, status: 'completed', ...over }) as TraceListItem;

// A span with no latency, as the drift scenario's spans are.
const span = (over: Partial<SpanDetail> = {}): SpanDetail =>
  ({
    span_id: 's1',
    parent_span_id: null,
    agent_id: 'planner',
    agent_role: null,
    event_type: 'agent_execution',
    span_kind: 'AGENT',
    start_time: '2026-10-27T10:00:00.000Z',
    latency_ms: null,
    status: 'success',
    model: null,
    tokens_in: null,
    tokens_out: null,
    tool_name: null,
    error_message: null,
    input_summary: 'what is the capital',
    output_summary: 'Paris',
    evaluation: null,
    ...over,
  }) as unknown as SpanDetail;

const highAlert = {
  id: 1, alert_type: 'GROUNDING_FAILURE', severity: 'HIGH', message: 'Grounding failure', agent_id: 'planner',
  trace_id: 't-flagged', span_id: 's1', acknowledged: false, resolved: false, created_at: '2026-10-27T10:00:00', details: null,
} as AlertItem;

const flagged = toTrace(
  row('t-flagged'),
  toSpans([span({ span_id: 'a', agent_id: 'planner' }), span({ span_id: 'b', agent_id: 'retriever' })], 't-flagged'),
  [highAlert],
);
const entry = toTrace(row('t-entry', { start_time: '2026-10-27T09:00:00' }));
const traces = [flagged, entry];

// Strip tags so the assertions read the visible text.
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const noop = () => {};

describe('TracesView with traces whose status and duration are not all known', () => {
  const html = text(
    renderToStaticMarkup(
      <TracesView traces={traces} onSelectTrace={noop} onSelectSpan={noop} onCurateToDataset={noop} />,
    ),
  );

  it('counts the HIGH-alert trace as Error and the unloaded one as Unknown, none as OK', () => {
    expect(html).toContain('Error (1)');
    expect(html).toContain('Unknown (1)');
    expect(html).toContain('OK (0)');
  });

  it('prints no 0ms, no NaN and no undefined for a trace or span with no recorded duration', () => {
    expect(html).not.toMatch(/\b0 ?ms\b/);
    expect(html).not.toMatch(/NaN/);
    expect(html).not.toMatch(/undefined/);
    expect(html).toContain('—');
  });

  it('names a multi-agent trace as one, with its count', () => {
    expect(html).toContain('multi-agent (2)');
  });

  it('labels the unloaded trace unknown in its row', () => {
    expect(html).toMatch(/unknown/i);
  });
});

describe('OverviewView', () => {
  const apiAgent = {
    agent_id: 'planner', agent_role: null, pipeline_id: null, first_seen: '2026-10-27T09:00:00', last_seen: '2026-10-27T10:00:00',
    total_spans: 7, total_errors: 0, error_rate: 0, avg_latency_ms: null, avg_risk_score: null, current_asi: null,
  } as ApiAgent;
  const agents = toAgents([apiAgent], []);

  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const mount = async () => {
    await act(async () => {
      root.render(
        <OverviewView
          agents={agents}
          traces={traces}
          incidents={[]}
          driftProfiles={[]}
          onSelectAgent={noop}
          onSelectTrace={noop}
          onSelectIncident={noop}
          onNavigateTab={noop}
        />,
      );
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('shows the span total under its new name and no 0ms or NaN for traces without a duration', async () => {
    await mount();
    const out = text(container.innerHTML);
    expect(out).toContain('Spans Ingested');
    expect(out).not.toMatch(/\b0 ?ms\b/);
    expect(out).not.toMatch(/NaN|undefined/);
    // The unloaded trace's dot is not the green OK dot.
    const dots = Array.from(container.querySelectorAll('span[title^="unknown:"]'));
    expect(dots).toHaveLength(1);
    expect(dots[0].className).not.toContain('emerald');
    const errorDots = Array.from(container.querySelectorAll('span[title^="error:"]'));
    expect(errorDots).toHaveLength(1);
  });

  const copyButton = () => container.querySelector('button[aria-label="Copy Trace ID t-flagged"]') as HTMLButtonElement;

  it('copies the trace id through copyTextToClipboard, and says Copied only when it worked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await mount();
    await act(async () => copyButton().click());
    expect(writeText).toHaveBeenCalledWith('t-flagged');
    expect(copyButton().textContent).toContain('Copied');
  });

  it('falls back to the hidden textarea when navigator.clipboard is missing (plain http)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    await mount();
    await act(async () => copyButton().click());
    expect(exec).toHaveBeenCalledWith('copy');
    expect(copyButton().textContent).toContain('Copied');
  });

  it('does not say Copied when both routes fail', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(false);
    await mount();
    await act(async () => copyButton().click());
    expect(copyButton().textContent).not.toContain('Copied');
  });
});

describe('TracesView timeline and flame graph for a trace with no recorded durations', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom has no scrollIntoView; the view calls it from effects.
    Element.prototype.scrollIntoView = () => {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('draws faded markers instead of NaN-wide bars, and prints dashes instead of 0ms', async () => {
    await act(async () => {
      root.render(
        <TracesView traces={traces} selectedTrace={flagged} selectedSpan={flagged.spans[0]} onSelectTrace={noop} onSelectSpan={noop} onCurateToDataset={noop} />,
      );
    });
    const tab = (title: string) => container.querySelector(`button[title^="${title}"]`) as HTMLButtonElement;

    await act(async () => tab('Timeline Lanes').click());
    const timeline = container.innerHTML;
    expect(timeline).toContain('Total Duration: —');
    expect(timeline).not.toMatch(/NaN|Infinity/);
    // Each span of the unmeasured trace is a marker with the explanation as its tooltip.
    expect(timeline.match(/Latency not recorded: this marks where the span starts/g)).toHaveLength(2);

    await act(async () => tab('Flame Graph').click());
    const flame = text(container.innerHTML);
    expect(flame).not.toMatch(/NaN|Infinity|undefined/);
    expect(flame).not.toMatch(/\b0 ?ms\b/);
  });
});

describe('ActiveContextPanel for a selected trace', () => {
  const render = (selectedTrace: typeof flagged) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return renderToStaticMarkup(
      <ActiveContextPanel
        currentTab="traces"
        onSelectTab={noop}
        selectedTrace={selectedTrace}
        onClearSelection={noop}
        onSelectAgent={noop}
        onSelectTrace={noop}
        isOpen
        onToggleOpen={noop}
        isPinned
        onTogglePin={noop}
      />,
    );
  };

  it('prints a dash for latency and tokens that were not recorded, and the real status', () => {
    const out = text(render(flagged));
    // The Latency and Tokens tiles: the tokens tile used to print nothing at all.
    expect(out).toMatch(/Latency —/);
    expect(out).toMatch(/Tokens —/);
    expect(out).not.toMatch(/0 ?ms|NaN|undefined/);
    expect(out).toMatch(/error/);
  });

  it('shows the unloaded trace as unknown, in the dashed chip and not the green one', () => {
    const html = render(entry);
    expect(text(html)).toMatch(/unknown/);
    const chip = html.match(/<span title="Unknown[^"]*" class="([^"]*)"/);
    expect(chip?.[1]).toContain('border-dashed');
    expect(chip?.[1]).not.toContain('emerald');
  });
});
