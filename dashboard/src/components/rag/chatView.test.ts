import { describe, it, expect } from 'vitest';
import {
  failoverNote,
  formatLatency,
  noticeTone,
  providerAndModel,
  stageState,
  unavailableReason,
} from './chatView';
import type { RagAgentExecution, TurnProgress } from '../../lib/ragTypes';

const exec = (over: Partial<RagAgentExecution> = {}): RagAgentExecution => ({
  agent: 'retriever',
  model: 'openai/gpt-oss-20b',
  provider: 'groq',
  output: 'text',
  latency_ms: 775,
  ...over,
});

describe('formatLatency', () => {
  it('shows a dash, never 0, when the service reported no time', () => {
    expect(formatLatency(undefined)).toBe('—');
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(Number.NaN)).toBe('—');
  });
  it('shows ms under a second and seconds above', () => {
    expect(formatLatency(775)).toBe('775ms');
    expect(formatLatency(1608)).toBe('1.6s');
  });
});

describe('providerAndModel and failoverNote', () => {
  it('names the provider when the service did, else the model alone', () => {
    expect(providerAndModel(exec())).toBe('groq · openai/gpt-oss-20b');
    expect(providerAndModel(exec({ provider: undefined }))).toBe('openai/gpt-oss-20b');
    expect(providerAndModel(undefined)).toBe('—');
  });
  it('counts only the failed tries before the answering one', () => {
    expect(failoverNote(exec())).toBe('');
    const tries = [
      { provider: 'groq', model: 'a', outcome: 'rate_limited', ms: 120 },
      { provider: 'nvidia', model: 'b', outcome: 'ok', ms: 900 },
    ];
    expect(failoverNote(exec({ attempts: tries }))).toBe('after 1 failover');
  });
});

describe('unavailableReason', () => {
  it('is null when the service is ready', () => {
    expect(unavailableReason({ ok: true, status: 'ready' })).toBeNull();
  });
  it("uses the service's own sentence first", () => {
    expect(unavailableReason({ ok: false, status: 'paused', message: 'The chat is paused.' })).toBe('The chat is paused.');
  });
  it('says it is checking, or that the service is not reachable', () => {
    expect(unavailableReason({ ok: false, status: 'checking' })).toBe('Checking the chat service...');
    expect(unavailableReason({ ok: false, status: 'unreachable' })).toContain('not reachable');
  });
});

describe('noticeTone', () => {
  it('draws refusals, busy providers and a user stop as a notice', () => {
    for (const code of ['rate_limited', 'daily_cap', 'busy', 'paused', 'loading', 'unavailable', 'message_too_long', 'providers_busy', 'aborted']) {
      expect(noticeTone(code)).toBe('warn');
    }
  });
  it('draws real failures, and no answer at all, as a failure', () => {
    for (const code of ['provider_failed', 'budget_exceeded', 'stream_ended', 'internal', undefined]) {
      expect(noticeTone(code)).toBe('err');
    }
  });
});

describe('stageState', () => {
  const progress = (p: Partial<TurnProgress>): TurnProgress => ({ done: [], ...p });

  it('reads search as running until the service reports what it retrieved', () => {
    expect(stageState(undefined, 'search')).toBe('running');
    expect(stageState(progress({ retrieved: ['SQLite WAL'], searchMs: 12 }), 'search')).toBe('done');
  });
  it('marks an agent done, running or waiting from the stream events only', () => {
    const p = progress({ running: 'verifier', done: [exec({ agent: 'retriever' })] });
    expect(stageState(p, 'retriever')).toBe('done');
    expect(stageState(p, 'verifier')).toBe('running');
    expect(stageState(p, 'answerer')).toBe('waiting');
  });
  it('never calls a stage done before its agent_done arrived', () => {
    expect(stageState(progress({}), 'answerer')).toBe('waiting');
  });
});
