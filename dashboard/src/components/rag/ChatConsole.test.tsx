import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatConsole } from './ChatConsole';
import type { ChatTurn } from '../../lib/ragTypes';

// In short: renders the chat to a string and checks what the restyle must not change: the honest
// sentences, which turns offer Retry, the tone of each notice, and that a missing time is a dash.
const noop = () => {};
const render = (turns: ChatTurn[], extra: Partial<React.ComponentProps<typeof ChatConsole>> = {}) =>
  renderToStaticMarkup(
    <ChatConsole
      turns={turns}
      onSendMessage={async () => {}}
      onCancelInFlight={noop}
      isInFlight={false}
      inFlightElapsedSeconds={0}
      onSelectTrace={noop}
      sessionId="sess_abc123"
      onResetSession={noop}
      onRetry={noop}
      chatStatus={{ ok: true, status: 'ready' }}
      {...extra}
    />,
  );

const turn = (over: Partial<ChatTurn>): ChatTurn => ({
  id: 't1',
  timestamp: '2026-10-27T03:00:00Z',
  userMessage: 'how does SQLite WAL improve concurrency?',
  status: 'completed',
  ...over,
});

describe('ChatConsole', () => {
  it('shows the sample questions and a labelled field when there are no turns', () => {
    const out = render([]);
    expect(out).toContain('who won the 2022 football world cup?');
    expect(out).toContain('aria-label="Message"');
    expect(out).toContain('role="log"');
  });

  it('draws a refusal as a notice, with the "no agent ran" line and no Retry', () => {
    const out = render([
      turn({
        status: 'error',
        errorMessage: 'That is 5 questions in a minute. Try again in 40 s.',
        response: { reply: '', agents: [], trace_id: '', session_id: 's', error: 'x', code: 'rate_limited', retry_after: 40 } as ChatTurn['response'],
      }),
    ]);
    expect(out).toContain('rag-note-warn');
    expect(out).not.toContain('rag-note-err');
    expect(out).toContain('Limit reached');
    expect(out).toContain('No agent ran, so nothing was sent to AgentPulse for this question.');
    expect(out).toContain('Try again in about 40 s.');
    expect(out).not.toContain('>Retry<');
  });

  it('draws a real failure as an error and offers Retry', () => {
    const out = render([
      turn({
        status: 'error',
        errorMessage: 'No model provider could answer the retriever step right now.',
        response: { reply: '', agents: [], trace_id: 'abc', session_id: 's', error: 'x', code: 'provider_failed' } as ChatTurn['response'],
        traceId: 'abc',
      }),
    ]);
    expect(out).toContain('rag-note-err');
    expect(out).toContain('Provider failed');
    expect(out).toContain('Retry');
    expect(out).toContain('Completed 0 of 3 agent stages before it ended.');
  });

  it('shows an unreported stage time as a dash, never as 0ms', () => {
    const out = render([
      turn({
        response: {
          reply: 'An answer.',
          trace_id: 'abc',
          session_id: 's',
          agents: [{ agent: 'retriever', model: 'm', provider: 'groq', output: 'o', latency_ms: Number.NaN }],
        } as ChatTurn['response'],
        traceId: 'abc',
      }),
    ]);
    expect(out).toContain('—');
    expect(out).not.toContain('0ms');
    expect(out).toContain('Unreached');
  });

  it('puts the reason Send is disabled in visible text', () => {
    const out = render([], { chatStatus: { ok: false, status: 'paused', message: 'The live chat is paused right now.' } });
    expect(out).toContain('role="status"');
    expect(out).toContain('The live chat is paused right now.');
    expect(out).toContain('rag-note-warn');
  });
});
