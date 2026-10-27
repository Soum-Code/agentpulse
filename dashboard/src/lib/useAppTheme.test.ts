import { describe, it, expect } from 'vitest';
import { effectiveCalm, pickAllowed, pickColor, pickLight } from './useAppTheme';

describe('useAppTheme helpers', () => {
  it('pickAllowed keeps a known stored value', () => {
    expect(pickAllowed('chalk', ['butter', 'dark', 'chalk'], 'dark')).toBe('chalk');
  });

  it('pickAllowed falls back for null, unknown and hand-edited values', () => {
    expect(pickAllowed(null, ['butter', 'dark', 'chalk'], 'dark')).toBe('dark');
    expect(pickAllowed('neon', ['butter', 'dark', 'chalk'], 'dark')).toBe('dark');
    expect(pickAllowed('', ['butter', 'dark', 'chalk'], 'dark')).toBe('dark');
  });

  it('pickColor returns a clean #rrggbb for 3-digit, 6-digit and 8-digit storage', () => {
    expect(pickColor('#ABC', '#000000')).toBe('#aabbcc');
    expect(pickColor('#1A0933', '#000000')).toBe('#1a0933');
    expect(pickColor('#1a093380', '#000000')).toBe('#1a0933');
  });

  it('pickColor falls back for anything that is not a colour', () => {
    expect(pickColor(null, '#faf5e6')).toBe('#faf5e6');
    expect(pickColor('javascript:alert(1)', '#faf5e6')).toBe('#faf5e6');
    expect(pickColor('#12', '#faf5e6')).toBe('#faf5e6');
  });

  it('Calm mode only takes effect with the Dark palette', () => {
    expect(effectiveCalm(true, 'dark')).toBe(true);
    expect(effectiveCalm(true, 'chalk')).toBe(false);
    expect(effectiveCalm(true, 'butter')).toBe(false);
    expect(effectiveCalm(false, 'dark')).toBe(false);
  });

  it('pickLight drops a dark colour for a light palette', () => {
    expect(pickLight('#101820', '#f6f8fb')).toBe('#f6f8fb');
    expect(pickLight('#e9e4f0', '#f6f8fb')).toBe('#e9e4f0');
  });
});
