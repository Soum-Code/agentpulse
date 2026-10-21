import { describe, it, expect } from 'vitest';
import { riskTone, riskLabel, riskTextClasses, riskBadgeClasses } from './riskTone';

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
