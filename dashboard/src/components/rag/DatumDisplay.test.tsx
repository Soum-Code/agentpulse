import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatumDisplay } from './DatumDisplay';
import { datum, datumFromFeed } from '../../lib/stateModel';

// Renders to a string: enough to prove which of the five states shows and that no NaN/undefined leaks.
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('DatumDisplay', () => {
  it('pending shows "Pending" and the reason as a tooltip', () => {
    const out = html(<DatumDisplay datum={datum.pending('worker evaluating')} />);
    expect(out).toContain('Pending');
    expect(out).toContain('title="worker evaluating"');
  });

  it('unmeasured shows an em dash, never 0, with the reason for screen readers and the tooltip', () => {
    const out = html(<DatumDisplay datum={datum.unmeasured('the API does not report p99')} format="latency" />);
    expect(out).toContain('—');
    expect(out).toContain('the API does not report p99');
    expect(out).not.toMatch(/\b0 ms\b/);
  });

  it('unreachable names the service and how to start it', () => {
    const out = html(<DatumDisplay datum={datum.unreachable('Chat service', 'uvicorn x:app')} />);
    expect(out).toContain('Unreachable');
    expect(out).toContain('Chat service unreachable. Run: uvicorn x:app');
  });

  it('error shows the message the service gave', () => {
    const out = html(<DatumDisplay datum={datum.error('502 Bad Gateway')} />);
    expect(out).toContain('502 Bad Gateway');
  });

  it('measured formats: latency, percentage, count, risk', () => {
    expect(html(<DatumDisplay datum={datum.measured(151.19)} format="latency" />)).toContain('151 ms');
    expect(html(<DatumDisplay datum={datum.measured(0.1234)} format="percentage" />)).toContain('12.3%');
    expect(html(<DatumDisplay datum={datum.measured(12345)} format="count" />)).toContain('12,345');
    const risk = html(<DatumDisplay datum={datum.measured(0.82)} format="risk" />);
    expect(risk).toContain('0.820');
    expect(risk).toContain('Unsupported'); // 0.82 is a high RISK, not "high support"
    expect(risk).toContain('rose');
  });

  it('a low risk score reads as supported and green, not as a failure', () => {
    const out = html(<DatumDisplay datum={datum.measured(0.05)} format="risk" />);
    expect(out).toContain('Supported');
    expect(out).toContain('emerald');
  });

  it('measured but non-finite numbers render a dash, never NaN or Infinity', () => {
    for (const bad of [NaN, Infinity]) {
      for (const format of ['latency', 'percentage', 'count', 'risk'] as const) {
        const out = html(<DatumDisplay datum={datum.measured(bad)} format={format} />);
        expect(out).not.toContain('NaN');
        expect(out).not.toContain('Infinity');
        expect(out).toContain('—');
      }
    }
  });

  it('a feed that is down never renders as a measured number', () => {
    const down = datumFromFeed({ status: 'unreachable' }, () => 0, 'n/a');
    expect(html(<DatumDisplay datum={down} format="count" />)).toContain('Unreachable');
  });

  it('stage: names each evaluation stage, says "Not scored" for a skipped span, shows any other word as is', () => {
    expect(html(<DatumDisplay datum={datum.measured('stage2')} format="stage" />)).toContain('Stage 2 (NLI)');
    expect(html(<DatumDisplay datum={datum.measured('stage1')} format="stage" />)).toContain('Stage 1 (similarity fallback)');
    const skipped = html(<DatumDisplay datum={datum.measured('skipped')} format="stage" />);
    expect(skipped).toContain('Not scored');
    expect(skipped).not.toContain('Stage 1');
    expect(html(<DatumDisplay datum={datum.measured('stage9')} format="stage" />)).toContain('stage9');
  });
});
