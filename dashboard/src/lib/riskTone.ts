/** Shared risk severity tone calculator.
 *
 * Operational rule from AgentPulse design system:
 * 1. Brand — navigation, links, focus rings. Cyan family only.
 * 2. Risk severity — anything the evaluator scored. Emerald / amber / rose only,
 *    always from this shared riskTone(score), never a per-component palette.
 *
 * Evaluated grounding score:
 * - >= 0.80: Emerald (Supported / High Grounding / Low Risk)
 * - >= 0.50 and < 0.80: Amber (Borderline / Moderate Grounding / Warning)
 * - < 0.50: Rose (Refuted / Contradiction / High Risk)
 * - null/undefined: Muted (Pending / Unmeasured)
 */

export type RiskTone = 'emerald' | 'amber' | 'rose' | 'muted';

export function riskTone(score: number | null | undefined): RiskTone {
  if (score == null || !Number.isFinite(score)) {
    return 'muted';
  }
  if (score >= 0.8) return 'emerald';
  if (score >= 0.5) return 'amber';
  return 'rose';
}

export function riskLabel(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return 'Pending';
  if (score >= 0.8) return 'Supported';
  if (score >= 0.5) return 'Uncertain';
  return 'Contradiction';
}

export function riskBadgeClasses(score: number | null | undefined): string {
  const tone = riskTone(score);
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
    case 'amber':
      return 'bg-amber-950/60 text-amber-300 border-amber-500/40';
    case 'rose':
      return 'bg-rose-950/60 text-rose-300 border-rose-500/40';
    case 'muted':
    default:
      return 'bg-neutral-900/80 text-neutral-400 border-neutral-700/50';
  }
}

export function riskTextClasses(score: number | null | undefined): string {
  const tone = riskTone(score);
  switch (tone) {
    case 'emerald':
      return 'text-emerald-400';
    case 'amber':
      return 'text-amber-400';
    case 'rose':
      return 'text-rose-400';
    case 'muted':
    default:
      return 'text-neutral-400';
  }
}

export function riskDotClasses(score: number | null | undefined): string {
  const tone = riskTone(score);
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-400 phosphor-emerald';
    case 'amber':
      return 'bg-amber-400 phosphor-amber';
    case 'rose':
      return 'bg-rose-400 phosphor-rose';
    case 'muted':
    default:
      return 'bg-neutral-500';
  }
}
