/** Shared risk severity tone calculator.
 *
 * Operational rule from AgentPulse design system:
 * 1. Brand — navigation, links, focus rings. Cyan family only.
 * 2. Risk severity — anything the evaluator scored. Emerald / amber / rose only,
 *    always from this shared riskTone(score), never a per-component palette.
 *
 * Every score the evaluator produces runs from 0.0 (safe) to 1.0 (risky), so low is
 * good. grounding_score is contradiction_prob + 0.5 * neutral_prob and
 * overall_risk_score is a weighted average of such scores (backend/app/services/
 * grounding.py and evaluator.py). The cut-offs below are the backend's own labels:
 * - > 0.70: Rose (high_risk / Unsupported)
 * - > 0.40 and <= 0.70: Amber (medium_risk / Uncertain)
 * - <= 0.40: Emerald (low_risk / Supported)
 * - null/undefined: Muted (Pending / Unmeasured)
 *
 * An earlier version read the number as support (>= 0.80 was "Supported"), which
 * painted ungrounded answers green and grounded ones red.
 */

export type RiskTone = 'emerald' | 'amber' | 'rose' | 'muted';

export function riskTone(score: number | null | undefined): RiskTone {
  if (score == null || !Number.isFinite(score)) {
    return 'muted';
  }
  if (score > 0.7) return 'rose';
  if (score > 0.4) return 'amber';
  return 'emerald';
}

export function riskLabel(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return 'Pending';
  if (score > 0.7) return 'Unsupported';
  if (score > 0.4) return 'Uncertain';
  return 'Supported';
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
