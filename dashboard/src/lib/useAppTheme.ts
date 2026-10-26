/**
 * The console's visual preferences in one place: colour palette (butter / dark / chalk), the
 * surface preset or custom colour chosen inside each palette, Calm mode and text density.
 *
 * Every choice is remembered in localStorage, so it survives a reload, and is applied to <html>
 * (data attributes + CSS variables, see applyThemeVariables) before the browser paints.
 *
 * App.tsx calls this once and spreads the result into the header, settings page, command palette
 * and background canvas, so they all show and change the same state.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type {
  ButterSurfacePreset,
  ChalkSurfacePreset,
  ColorPalette,
  DarkSurfacePreset,
  TextDensity,
} from '../types';
import {
  BUTTER_PRESETS,
  CHALK_PRESETS,
  DARK_PRESETS,
  applyThemeVariables,
  normalizeHex,
} from './colorPalettes';

// localStorage keys. They are the same ones the landing page already used for the chalk surface,
// so a choice made on the landing page carries over into the console.
const KEYS = {
  palette: 'agentpulse_palette',
  darkPreset: 'agentpulse_dark_preset',
  darkColor: 'agentpulse_dark_custom_color',
  butterPreset: 'agentpulse_butter_preset',
  butterColor: 'agentpulse_butter_custom_color',
  chalkPreset: 'agentpulse_chalk_surface',
  chalkColor: 'agentpulse_chalk_custom_color',
  calm: 'agentpulse_calm_mode',
  density: 'agentpulse_text_density',
} as const;

const PALETTES: readonly ColorPalette[] = ['butter', 'dark', 'chalk'];
const DARK_IDS = [...DARK_PRESETS.map((p) => p.id), 'custom'];
const BUTTER_IDS = [...BUTTER_PRESETS.map((p) => p.id), 'custom'];
const CHALK_IDS = [...CHALK_PRESETS.map((p) => p.id), 'custom'];

/** Reads a stored string; any storage failure (private mode, disabled storage) reads as "nothing stored". */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes a value; a storage failure only means the choice is not remembered, so it is ignored. */
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
}

/** A stored value if it is one of `allowed`, otherwise `fallback` (stale or hand-edited storage cannot break the theme). */
export function pickAllowed<T extends string>(stored: string | null, allowed: readonly string[], fallback: T): T {
  return stored !== null && allowed.includes(stored) ? (stored as T) : fallback;
}

/**
 * Calm mode (the grey "Deep Zen" look) only exists for the Dark palette. It forces a dark page, so
 * with Chalk or Butter it left dark text on a dark page (review finding ux-tests-2). The choice is
 * remembered, but it only takes effect while the Dark palette is active.
 */
export function effectiveCalm(storedCalm: boolean, palette: ColorPalette): boolean {
  return storedCalm && palette === 'dark';
}

/** A stored colour as a clean "#rrggbb", otherwise `fallback`. */
export function pickColor(stored: string | null, fallback: string): string {
  return normalizeHex(stored) ?? fallback;
}

export interface AppTheme {
  palette: ColorPalette;
  onSelectPalette: (palette: ColorPalette) => void;
  darkPreset: DarkSurfacePreset;
  onSelectDarkPreset: (preset: DarkSurfacePreset) => void;
  darkCustomColor: string;
  onSelectDarkCustomColor: (hex: string) => void;
  butterPreset: ButterSurfacePreset;
  onSelectButterPreset: (preset: ButterSurfacePreset) => void;
  butterCustomColor: string;
  onSelectButterCustomColor: (hex: string) => void;
  chalkSurface: ChalkSurfacePreset;
  onSelectChalkPreset: (preset: ChalkSurfacePreset) => void;
  chalkCustomColor: string;
  onSelectChalkCustomColor: (hex: string) => void;
  /** True only while Calm mode is on AND the Dark palette is active (see effectiveCalm). */
  isCalmMode: boolean;
  /** Undefined unless the Dark palette is active: Calm mode is not offered in Chalk or Butter. */
  onToggleCalmMode?: () => void;
  textDensity: TextDensity;
  onChangeTextDensity: (density: TextDensity) => void;
}

export function useAppTheme(): AppTheme {
  const [palette, setPalette] = useState<ColorPalette>(() => pickAllowed(readStored(KEYS.palette), PALETTES, 'dark'));
  const [darkPreset, setDarkPreset] = useState<DarkSurfacePreset>(() =>
    pickAllowed(readStored(KEYS.darkPreset), DARK_IDS, 'obsidian-void'),
  );
  const [darkCustomColor, setDarkCustomColor] = useState(() => pickColor(readStored(KEYS.darkColor), '#06070a'));
  const [butterPreset, setButterPreset] = useState<ButterSurfacePreset>(() =>
    pickAllowed(readStored(KEYS.butterPreset), BUTTER_IDS, 'canary-gold'),
  );
  const [butterCustomColor, setButterCustomColor] = useState(() => pickColor(readStored(KEYS.butterColor), '#faf5e6'));
  const [chalkSurface, setChalkSurface] = useState<ChalkSurfacePreset>(() =>
    pickAllowed(readStored(KEYS.chalkPreset), CHALK_IDS, 'classic-white'),
  );
  const [chalkCustomColor, setChalkCustomColor] = useState(() => pickColor(readStored(KEYS.chalkColor), '#f6f8fb'));
  const [isCalmMode, setIsCalmMode] = useState(() => readStored(KEYS.calm) === 'true');
  const [textDensity, setTextDensity] = useState<TextDensity>(() =>
    readStored(KEYS.density) === 'compact' ? 'compact' : 'comfortable',
  );

  // Picking a custom colour also switches that palette to its 'custom' preset.
  const selectDarkColor = useCallback((hex: string) => {
    setDarkPreset('custom');
    setDarkCustomColor(hex);
  }, []);
  const selectButterColor = useCallback((hex: string) => {
    setButterPreset('custom');
    setButterCustomColor(hex);
  }, []);
  const selectChalkColor = useCallback((hex: string) => {
    setChalkSurface('custom');
    setChalkCustomColor(hex);
  }, []);

  // Apply the active palette to <html> and remember the choices. A layout effect runs before the
  // browser paints, so switching never shows one frame of the old colours.
  useLayoutEffect(() => {
    const preset = palette === 'dark' ? darkPreset : palette === 'butter' ? butterPreset : chalkSurface;
    const custom = palette === 'dark' ? darkCustomColor : palette === 'butter' ? butterCustomColor : chalkCustomColor;
    const root = document.documentElement;
    root.setAttribute('data-palette', palette);
    root.setAttribute('data-palette-preset', preset);
    if (palette === 'chalk') root.setAttribute('data-chalk-surface', chalkSurface);
    else root.removeAttribute('data-chalk-surface');
    applyThemeVariables(palette, preset, custom);

    writeStored(KEYS.palette, palette);
    writeStored(KEYS.darkPreset, darkPreset);
    writeStored(KEYS.darkColor, darkCustomColor);
    writeStored(KEYS.butterPreset, butterPreset);
    writeStored(KEYS.butterColor, butterCustomColor);
    writeStored(KEYS.chalkPreset, chalkSurface);
    writeStored(KEYS.chalkColor, chalkCustomColor);
  }, [palette, darkPreset, darkCustomColor, butterPreset, butterCustomColor, chalkSurface, chalkCustomColor]);

  // Text density is a class and a data attribute on <html> so any component's CSS can follow it.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-density', textDensity);
    root.classList.toggle('density-compact', textDensity === 'compact');
    root.classList.toggle('density-comfortable', textDensity !== 'compact');
    writeStored(KEYS.density, textDensity);
  }, [textDensity]);

  useEffect(() => writeStored(KEYS.calm, String(isCalmMode)), [isCalmMode]);
  const onToggleCalmMode = useCallback(() => setIsCalmMode((prev) => !prev), []);

  return useMemo(
    () => ({
      palette,
      onSelectPalette: setPalette,
      darkPreset,
      onSelectDarkPreset: setDarkPreset,
      darkCustomColor,
      onSelectDarkCustomColor: selectDarkColor,
      butterPreset,
      onSelectButterPreset: setButterPreset,
      butterCustomColor,
      onSelectButterCustomColor: selectButterColor,
      chalkSurface,
      onSelectChalkPreset: setChalkSurface,
      chalkCustomColor,
      onSelectChalkCustomColor: selectChalkColor,
      isCalmMode: effectiveCalm(isCalmMode, palette),
      onToggleCalmMode: palette === 'dark' ? onToggleCalmMode : undefined,
      textDensity,
      onChangeTextDensity: setTextDensity,
    }),
    [
      palette, darkPreset, darkCustomColor, butterPreset, butterCustomColor, chalkSurface,
      chalkCustomColor, isCalmMode, textDensity, onToggleCalmMode, selectDarkColor,
      selectButterColor, selectChalkColor,
    ],
  );
}
