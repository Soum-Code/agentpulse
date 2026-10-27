// In short: the small pieces of logic the chat view shows, kept out of the components so they can
// be tested. formatLatency, providerAndModel, failoverCount, failoverNote and unavailableReason
// moved here unchanged from ChatConsole.tsx; noticeTone and stageState are new and only decide how
// a state is drawn, never what it says.
import type { RagAgentExecution, TurnProgress } from '../../lib/ragTypes';
import { isRefusal } from '../../lib/ragApi';

/** The three agents, in the order a turn runs them. */
export const STAGES = ['retriever', 'verifier', 'answerer'] as const;

// In short: a time the service reported, as "775ms" or "1.6s"; a missing one is a dash, never 0.
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/** "groq · openai/gpt-oss-20b", or the model alone when the service did not name a provider. */
export function providerAndModel(exec: RagAgentExecution | undefined): string {
  if (!exec) return '—';
  return exec.provider ? `${exec.provider} · ${exec.model}` : exec.model;
}

/** How many tries failed before the one that answered, as reported by the service. */
export function failoverCount(exec: RagAgentExecution | undefined): number {
  return Math.max(0, (exec?.attempts?.length ?? 1) - 1);
}

// In short: "after 2 failovers" when the service reported failed tries before the answer, else "".
export function failoverNote(exec: RagAgentExecution | undefined): string {
  const n = failoverCount(exec);
  return n > 0 ? `after ${n} failover${n === 1 ? '' : 's'}` : '';
}

/** Why sending is not possible right now, or null when it is. */
export function unavailableReason(status: { ok: boolean; status: string; message?: string } | undefined): string | null {
  if (!status || status.ok) return null;
  if (status.message) return status.message;
  if (status.status === 'checking') return 'Checking the chat service...';
  return `The chat service is not reachable right now (${status.status}); it may be restarting. This page checks again every few seconds.`;
}

export type NoticeTone = 'warn' | 'err';

// In short: how loud a turn that did not complete is drawn. A refusal (a visitor or site limit, a
// pause, a cold start, a question too long), every provider at its limit, or the visitor's own
// Stop is a notice (amber): nothing broke, waiting or rewording helps. Anything else, including no
// answer at all from the service, is a failure (rose). Only the colour depends on this; the title
// and the sentence are still chatErrorTitle's and the service's own words.
export function noticeTone(code: string | undefined): NoticeTone {
  if (isRefusal(code) || code === 'providers_busy' || code === 'aborted') return 'warn';
  return 'err';
}

export type StageState = 'waiting' | 'running' | 'done';

// In short: where one step of a running turn is, from the stream events only. 'search' is done once
// the service reported what it retrieved; an agent is done when its agent_done arrived, running
// while its agent_start is the latest, and waiting otherwise. Nothing is guessed from time.
export function stageState(progress: TurnProgress | undefined, stage: 'search' | (typeof STAGES)[number]): StageState {
  if (stage === 'search') {
    if (progress?.retrieved) return 'done';
    return 'running';
  }
  if (progress?.done.some((a) => a.agent === stage)) return 'done';
  if (progress?.running === stage) return 'running';
  return 'waiting';
}

// In short: true when the visitor asked the system for less motion (used for scrolling; CSS
// handles the animations). False where matchMedia does not exist (tests, old browsers).
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
