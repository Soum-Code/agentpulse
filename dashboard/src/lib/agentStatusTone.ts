/**
 * Badge colours for an agent's status (adapters.ts agentStatus): critical is rose, warning is
 * amber, and idle/running stay neutral. Only 'warning' used to be amber, so a CRITICAL agent
 * was painted green.
 */
import type { AgentStatus } from '../types';

export function agentStatusBadgeClasses(status: AgentStatus): string {
  if (status === 'critical') return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  if (status === 'warning') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-white/[0.06] text-neutral-300 border-white/[0.15]';
}
