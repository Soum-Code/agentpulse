import { describe, it, expect } from 'vitest';
import {
  riskTone,
  riskLabel,
  riskTextClasses,
  riskBadgeClasses,
  verdictLabel,
  verdictTooltip,
  verdictBadgeClasses,
} from './riskTone';

// The evaluator's scores are risks: 0.0 is safe, 1.0 is risky.
describe('riskTone', () => {
  it('reads low scores as safe and high scores as risky', () => {
    expect(riskTone(0)).toBe('emerald');
    expect(riskTone(0.05)).toBe('emerald');
    expect(riskTone(0.4)).toBe('emerald');
    expect(riskTone(0.41)).toBe('amber');
    expect(riskTone(0.7)).toBe('amber');
    expect(riskTone(0.71)).toBe('rose');
    expect(riskTone(0.95)).toBe('rose');
  });

  it('maps missing, null, or undefined values to muted without inventing values', () => {
    expect(riskTone(null)).toBe('muted');
    expect(riskTone(undefined)).toBe('muted');
    expect(riskTone(NaN)).toBe('muted');
  });

  it('provides consistent labels and styling classes', () => {
    expect(riskLabel(0.08)).toBe('Supported');
    expect(riskLabel(0.55)).toBe('Uncertain');
    expect(riskLabel(0.92)).toBe('Unsupported');
    expect(riskLabel(null)).toBe('Pending');

    expect(riskTextClasses(0.1)).toContain('text-emerald-400');
    expect(riskTextClasses(0.5)).toContain('text-amber-400');
    expect(riskTextClasses(0.9)).toContain('text-rose-400');
    expect(riskTextClasses(null)).toContain('text-neutral-400');
    expect(riskBadgeClasses(0.9)).toContain('text-rose-300');
  });
});

// The grounding verdict is what the NLI model concluded. It is not a risk: a neutral-only
// output scores about 0.3 (contradiction + 0.3 * neutral), reads low_risk, and is "unverifiable".
describe('grounding verdict', () => {
  it('labels the three classes and shows nothing when there is no verdict', () => {
    expect(verdictLabel('contradicted')).toBe('Contradicted');
    expect(verdictLabel('unverifiable')).toBe('Unverifiable');
    expect(verdictLabel('supported')).toBe('Supported');
    expect(verdictLabel(null)).toBeNull();
    expect(verdictLabel(undefined)).toBeNull();
    expect(verdictTooltip(null)).toBeNull();
    expect(verdictTooltip(undefined)).toBeNull();
  });

  it('keeps contradicted rose and supported emerald, as the risk badge does', () => {
    expect(verdictBadgeClasses('contradicted')).toBe(riskBadgeClasses(0.9));
    expect(verdictBadgeClasses('supported')).toBe(riskBadgeClasses(0.1));
  });

  it('paints unverifiable neutral, never amber or rose, because it is not a risk', () => {
    const classes = verdictBadgeClasses('unverifiable');
    expect(classes).toContain('text-neutral-300');
    expect(classes).not.toMatch(/amber|rose|emerald/);
    // The same output scores 0.3: low risk and emerald. The verdict is the separate signal.
    expect(riskTone(0.3)).toBe('emerald');
  });

  it('explains in one line that unverifiable means the evidence could not settle it', () => {
    const tip = verdictTooltip('unverifiable');
    expect(tip).toBe('The evidence neither supports nor contradicts this output, so it could not be checked.');
    expect(tip).not.toMatch(/\n/);
    expect(verdictTooltip('contradicted')).toContain('contradicts');
    expect(verdictTooltip('supported')).toContain('supports');
  });
});
