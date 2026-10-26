import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CHALK_PRESETS,
  DARK_PRESETS,
  BUTTER_PRESETS,
  getPresetConfig,
  getLuminance,
  getContrastRatio,
  getBlendedContrastRatio,
  getChalkTextMetrics,
  applyThemeVariables,
  normalizeHex,
  hexAlpha,
} from './colorPalettes';

describe('colorPalettes', () => {
  let mockStyle: Record<string, string> = {};
  const originalDocument = globalThis.document;

  beforeEach(() => {
    mockStyle = {};
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => {
            mockStyle[k] = v;
          },
          getPropertyValue: (k: string) => mockStyle[k] || '',
        },
        removeAttribute: () => {},
        setAttribute: () => {},
      },
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  });

  describe('presets configuration', () => {
    it('has multi-color presets defined for chalk, dark, and butter', () => {
      expect(CHALK_PRESETS.length).toBeGreaterThanOrEqual(4);
      expect(DARK_PRESETS.length).toBeGreaterThanOrEqual(4);
      expect(BUTTER_PRESETS.length).toBeGreaterThanOrEqual(4);
    });

    it('returns preset config by id for each palette', () => {
      expect(getPresetConfig('chalk', 'blueprint-mist')?.name).toBe('Blueprint Mist');
      expect(getPresetConfig('dark', 'midnight-sapphire')?.name).toBe('Midnight Sapphire');
      expect(getPresetConfig('butter', 'amber-honey')?.name).toBe('Toasted Amber Honey');
    });

    it('computes relative luminance and contrast ratio accurately', () => {
      const whiteLum = getLuminance('#ffffff');
      const blackLum = getLuminance('#000000');
      expect(whiteLum).toBeCloseTo(1, 1);
      expect(blackLum).toBeCloseTo(0, 1);

      const contrast = getContrastRatio('#ffffff', '#000000');
      expect(contrast).toBeCloseTo(21, 0);
    });
  });

  describe('Chalk Text Legibility & WCAG 2.1 AA Compliance', () => {
    it('computes blended contrast ratio with alpha opacity correctly', () => {
      const solidContrast = getBlendedContrastRatio('15, 23, 42', 1.0, '#f6f8fb');
      expect(solidContrast).toBeGreaterThan(15.0);

      const mutedContrast = getBlendedContrastRatio('15, 23, 42', 0.68, '#f6f8fb');
      // Must be >= 4.5:1 for WCAG 2.1 AA
      expect(mutedContrast).toBeGreaterThanOrEqual(4.5);
    });

    it('ensures all chalk surface presets meet WCAG 2.1 AA contrast requirements', () => {
      const presets = ['classic-white', 'sepia-slate', 'emerald-graphite', 'blueprint-mist'];

      presets.forEach((presetId) => {
        const metrics = getChalkTextMetrics(presetId);

        // Muted text must satisfy WCAG 2.1 AA normal text contrast (>= 4.5:1)
        expect(metrics.contrastRatioMuted).toBeGreaterThanOrEqual(4.5);

        // Secondary text must satisfy WCAG 2.1 AA (and AAA >= 7:1)
        expect(metrics.contrastRatioSecondary).toBeGreaterThanOrEqual(7.0);

        // Primary text must achieve exceptional high-contrast readability (>= 12:1)
        expect(metrics.contrastRatioPrimary).toBeGreaterThanOrEqual(12.0);

        expect(metrics.isWcagAACompliant).toBe(true);
        expect(metrics.textPrimary).toContain('rgba(');
        expect(metrics.textSecondary).toContain('rgba(');
        expect(metrics.textMuted).toContain('rgba(');
      });
    });

    it('dynamically scales opacity for blueprint-mist to compensate for darker cyan background', () => {
      const classicMetrics = getChalkTextMetrics('classic-white');
      const blueprintMetrics = getChalkTextMetrics('blueprint-mist');

      // Blueprint Mist has a deeper cyan tone (#e7eff7 vs #f6f8fb), requiring higher opacity for legibility
      expect(blueprintMetrics.opacityMuted).toBeGreaterThan(classicMetrics.opacityMuted);
      expect(blueprintMetrics.contrastRatioMuted).toBeGreaterThanOrEqual(4.5);
    });

    it('dynamically adjusts opacity and maintains WCAG 2.1 AA for custom chalk colors', () => {
      // Testing with a pale lavender custom surface
      const customMetrics = getChalkTextMetrics('custom', '#e9e4f0');
      expect(customMetrics.isWcagAACompliant).toBe(true);
      expect(customMetrics.contrastRatioMuted).toBeGreaterThanOrEqual(4.5);
      expect(customMetrics.contrastRatioPrimary).toBeGreaterThanOrEqual(10.0);
    });
  });

  describe('applyThemeVariables', () => {
    it('applies dark preset tokens dynamically to documentElement style', () => {
      applyThemeVariables('dark', 'midnight-sapphire');

      expect(mockStyle['--theme-bg']).toBe('#030712');
      expect(mockStyle['--theme-accent']).toBe('#3b82f6');
      expect(mockStyle['--dark-surface-bg']).toBe('#030712');
      expect(mockStyle['--lg-card-border']).toBeTruthy();
      expect(mockStyle['--lg-pill-bg']).toBeTruthy();
    });

    it('applies butter preset tokens dynamically to documentElement style', () => {
      applyThemeVariables('butter', 'canary-gold');

      expect(mockStyle['--theme-bg']).toBe('#faf5e6');
      expect(mockStyle['--theme-accent']).toBe('#d97706');
      expect(mockStyle['--butter-surface-bg']).toBe('#faf5e6');
      expect(mockStyle['--theme-text-primary']).toBe('#1c1917');
    });

    it('applies chalk preset tokens dynamically including opacity variables to documentElement style', () => {
      applyThemeVariables('chalk', 'sepia-slate');

      expect(mockStyle['--theme-bg']).toBe('#f5efe4');
      expect(mockStyle['--theme-accent']).toBe('#b45309');
      expect(mockStyle['--chalk-surface-bg']).toBe('#f5efe4');
      expect(mockStyle['--theme-text-primary']).toBe('#0f172a');

      // Chalk dynamic text opacity variables
      expect(mockStyle['--chalk-text-base-rgb']).toBe('35, 24, 15');
      expect(mockStyle['--chalk-text-opacity-primary']).toBe('0.97');
      expect(mockStyle['--chalk-text-opacity-secondary']).toBe('0.84');
      expect(mockStyle['--chalk-text-opacity-muted']).toBe('0.7');
      expect(mockStyle['--chalk-text-primary']).toBe('rgba(35, 24, 15, 0.97)');
      expect(mockStyle['--chalk-text-secondary']).toBe('rgba(35, 24, 15, 0.84)');
      expect(mockStyle['--chalk-text-muted']).toBe('rgba(35, 24, 15, 0.7)');
      expect(mockStyle['--theme-text-opacity-primary']).toBe('0.97');
      expect(mockStyle['--theme-text-opacity-secondary']).toBe('0.84');
      expect(mockStyle['--theme-text-opacity-muted']).toBe('0.7');
    });

    it('applies classic-white chalk preset variables properly', () => {
      applyThemeVariables('chalk', 'classic-white');

      expect(mockStyle['--chalk-surface-bg']).toBe('#f6f8fb');
      expect(mockStyle['--chalk-text-base-rgb']).toBe('15, 23, 42');
      expect(mockStyle['--chalk-text-opacity-primary']).toBe('0.96');
      expect(mockStyle['--chalk-text-opacity-secondary']).toBe('0.82');
      expect(mockStyle['--chalk-text-opacity-muted']).toBe('0.68');
      expect(mockStyle['--chalk-text-primary']).toBe('rgba(15, 23, 42, 0.96)');
    });

    it('applies custom user-specified colors seamlessly', () => {
      applyThemeVariables('dark', 'custom', '#1a0933');

      expect(mockStyle['--theme-bg']).toBe('#1a0933');
      expect(mockStyle['--dark-surface-bg']).toBe('#1a0933');
      expect(mockStyle['--lg-card-bg']).toContain('#1a0933');
    });
  });
  describe('hex handling (3-digit and 8-digit colours)', () => {
    it('normalises every valid hex form to an opaque #rrggbb', () => {
      expect(normalizeHex('#abc')).toBe('#aabbcc');
      expect(normalizeHex('ABC')).toBe('#aabbcc');
      expect(normalizeHex('#abcd')).toBe('#aabbcc'); // short form with alpha: alpha dropped
      expect(normalizeHex('#1A0933')).toBe('#1a0933');
      expect(normalizeHex('#1a093380')).toBe('#1a0933'); // 8 digits: alpha dropped
      expect(normalizeHex(' #fff ')).toBe('#ffffff');
    });

    it('rejects text that is not a hex colour', () => {
      expect(normalizeHex('')).toBeNull();
      expect(normalizeHex('#12')).toBeNull();
      expect(normalizeHex('#12345')).toBeNull();
      expect(normalizeHex('#1234567')).toBeNull();
      expect(normalizeHex('#ggg')).toBeNull();
      expect(normalizeHex('red')).toBeNull();
      expect(normalizeHex(undefined)).toBeNull();
    });

    it('appends an alpha suffix only to a normalised base', () => {
      expect(hexAlpha('#abc', 'f0')).toBe('#aabbccf0');
      expect(hexAlpha('#1a093380', 'ea')).toBe('#1a0933ea');
    });

    it('reads a 3-digit hex the same as its 6-digit form in luminance and contrast', () => {
      expect(getLuminance('#fff')).toBeCloseTo(getLuminance('#ffffff'), 6);
      expect(getLuminance('#abc')).toBeCloseTo(getLuminance('#aabbcc'), 6);
      expect(getContrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
    });

    it('getBlendedContrastRatio parses 3-digit text and background (it used to ignore them)', () => {
      // Before the fix a 3-digit background fell back to the classic-white default, so these two
      // differed; with the fix they are the same colour and the same ratio.
      const short = getBlendedContrastRatio('#000', 0.7, '#abc');
      const long = getBlendedContrastRatio('#000000', 0.7, '#aabbcc');
      expect(short).toBeCloseTo(long, 6);
      // And a dark 3-digit background must differ from the white default the old code assumed.
      const darkBg = getBlendedContrastRatio('#fff', 1, '#012');
      expect(darkBg).toBeGreaterThan(10);
    });

    it('custom 3-digit colour yields valid six-digit CSS in every alpha-suffixed token', () => {
      for (const palette of ['chalk', 'butter', 'dark'] as const) {
        mockStyle = {};
        applyThemeVariables(palette, 'custom', '#abc');
        const all = Object.values(mockStyle).join(' ');
        // No colour in the output may be 4/5/7/9/10 digits long: that is invalid CSS and is dropped.
        const hexes = all.match(/#[0-9a-fA-F]+/g) ?? [];
        for (const h of hexes) {
          expect([4, 7, 9]).toContain(h.length); // "#rgb", "#rrggbb", "#rrggbbaa"
        }
        expect(mockStyle['--theme-bg']).toBe('#aabbcc');
        expect(all).toContain('#aabbccf0'.slice(0, 7)); // base normalised
      }
    });

    it('custom 8-digit colour does not become a 10-digit colour', () => {
      applyThemeVariables('dark', 'custom', '#1a093380');
      expect(mockStyle['--theme-bg']).toBe('#1a0933');
      expect(mockStyle['--lg-header-bg']).toContain('#1a0933f0');
      expect(Object.values(mockStyle).join(' ')).not.toMatch(/#[0-9a-fA-F]{10}/);
    });

    it('an invalid custom colour falls back to the first preset instead of writing bad CSS', () => {
      applyThemeVariables('chalk', 'custom', 'not-a-colour');
      expect(mockStyle['--theme-bg']).toBe(CHALK_PRESETS[0].bgHex);
      applyThemeVariables('dark', 'custom', '#12');
      expect(mockStyle['--theme-bg']).toBe(DARK_PRESETS[0].bgHex);
    });

    it('chalk text metrics accept a 3-digit custom colour and stay WCAG AA', () => {
      const m = getChalkTextMetrics('custom', '#eef');
      expect(m.isWcagAACompliant).toBe(true);
      expect(m.contrastRatioMuted).toBeGreaterThanOrEqual(4.5);
    });
  });
});
