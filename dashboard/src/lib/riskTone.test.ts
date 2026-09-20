import { describe, it, expect } from 'vitest';
import { riskTone, riskLabel, riskTextClasses, riskBadgeClasses } from './riskTone';

describe('riskTone', () => {
  it('maps scores to emerald, amber, and rose', () => {
    expect(riskTone(0.95)).toBe('emerald');
    expect(riskTone(0.80)).toBe('emerald');
    expect(riskTone(0.79)).toBe('amber');
    expect(riskTone(0.50)).toBe('amber');
    expect(riskTone(0.49)).toBe('rose');
    expect(riskTone(0.12)).toBe('rose');
  });

  it('maps missing, null, or undefined values to muted without inventing values', () => {
    expect(riskTone(null)).toBe('muted');
    expect(riskTone(undefined)).toBe('muted');
    expect(riskTone(NaN)).toBe('muted');
  });

  it('provides consistent labels and styling classes', () => {
    expect(riskLabel(0.92)).toBe('Supported');
    expect(riskLabel(0.65)).toBe('Uncertain');
    expect(riskLabel(0.31)).toBe('Contradiction');
    expect(riskLabel(null)).toBe('Pending');

    expect(riskTextClasses(0.9)).toContain('text-emerald-400');
    expect(riskTextClasses(0.6)).toContain('text-amber-400');
    expect(riskTextClasses(0.3)).toContain('text-rose-400');
    expect(riskTextClasses(null)).toContain('text-neutral-400');
  });
});
