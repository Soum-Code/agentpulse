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

// In short: the sum of the stage times the service reported, used when it did not send the turn's
// own total. Null (shown as a dash) when no stage ran or any stage that ran has no time: before
// 27 Oct a missing time counted as 0, so a refused turn read "Total: 0ms", an unknown shown as zero.
export function stageTimeSum(agents: RagAgentExecution[]): number | null {
  if (agents.length === 0 || agents.some((a) => a.latency_ms == null || !Number.isFinite(a.latency_ms))) return null;
  return agents.reduce((sum, a) => sum + a.latency_ms, 0);
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

export interface EvaluatorBadge {
  tone: 'ok' | 'err' | 'unknown';
  label: string;
  title: string;
}

// In short: what the monitor's evaluator badge says. Only an answer from /v1/health/evaluator can
// say "offline" (0 workers, including its 503 body). Not asked yet, or the API not reachable, is
// unknown: the worker may be fine, so it is never drawn as offline (review S4).
export function evaluatorBadge(
  readiness: { workers_alive: number } | null,
  unreachable: boolean,
): EvaluatorBadge {
  if (!readiness) {
    return unreachable
      ? {
          tone: 'unknown',
          label: 'Evaluator unknown',
          title: 'Could not reach the AgentPulse API on /v1/health/evaluator, so the worker state is unknown.',
        }
      : { tone: 'unknown', label: 'Evaluator: checking…', title: 'The evaluator health has not answered yet.' };
  }
  if (readiness.workers_alive > 0) {
    return { tone: 'ok', label: `Worker alive (${readiness.workers_alive})`, title: `${readiness.workers_alive} worker(s) registered and ready` };
  }
  return { tone: 'err', label: 'Evaluator offline', title: 'No evaluator worker alive. Grounding evaluations will not run.' };
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
