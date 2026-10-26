import { describe, it, expect } from 'vitest';
import { pickAllowed, pickColor } from './useAppTheme';

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
});
