import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Moon, Sun, Palette, SlidersHorizontal, Check, RotateCcw, X } from 'lucide-react';
import {
  ColorPalette,
  DarkSurfacePreset,
  ButterSurfacePreset,
  ChalkSurfacePreset,
} from '../../types';
import {
  CHALK_PRESETS,
  DARK_PRESETS,
  BUTTER_PRESETS,
  CHALK_SWATCHES,
  DARK_SWATCHES,
  BUTTER_SWATCHES,
  getContrastRatio,
  normalizeHex,
} from '../../lib/colorPalettes';

interface UnifiedPaletteBarProps {
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
  compact?: boolean;
  className?: string;
}

/**
 * The palette switcher: Butter / Dark / Chalk, the four tint presets of the active palette, and a
 * custom-colour popover (curated swatches, a native picker, a hex field and a WCAG contrast
 * readout). It is purely controlled: App.tsx owns the state and applies it via applyThemeVariables.
 */
export const UnifiedPaletteBar: React.FC<UnifiedPaletteBarProps> = ({
  palette,
  onSelectPalette,
  darkPreset,
  onSelectDarkPreset,
  darkCustomColor,
  onSelectDarkCustomColor,
  butterPreset,
  onSelectButterPreset,
  butterCustomColor,
  onSelectButterCustomColor,
  chalkSurface,
  onSelectChalkPreset,
  chalkCustomColor,
  onSelectChalkCustomColor,
  compact = false,
  className = '',
}) => {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  // What the user is typing in the hex field. The app only receives a colour once the draft is a
  // complete valid hex; before that (e.g. "#a") nothing is applied, so the theme never flickers to
  // a fallback and the colour picker never gets an invalid value.
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  // Close custom popover on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsCustomOpen(false);
      }
    };
    if (isCustomOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [isCustomOpen]);

  // Active presets based on current palette
  const activePresetId =
    palette === 'dark' ? darkPreset : palette === 'butter' ? butterPreset : chalkSurface;

  const currentPresets =
    palette === 'dark'
      ? DARK_PRESETS
      : palette === 'butter'
      ? BUTTER_PRESETS
      : CHALK_PRESETS;

  const currentSwatches =
    palette === 'dark'
      ? DARK_SWATCHES
      : palette === 'butter'
      ? BUTTER_SWATCHES
      : CHALK_SWATCHES;

  const activeCustomColor =
    palette === 'dark'
      ? darkCustomColor
      : palette === 'butter'
      ? butterCustomColor
      : chalkCustomColor;

  const handleSelectPreset = (id: string) => {
    if (palette === 'dark') onSelectDarkPreset(id as DarkSurfacePreset);
    else if (palette === 'butter') onSelectButterPreset(id as ButterSurfacePreset);
    else onSelectChalkPreset(id as ChalkSurfacePreset);
  };

  const handleCustomColorChange = (hex: string) => {
    if (palette === 'dark') onSelectDarkCustomColor(hex);
    else if (palette === 'butter') onSelectButterCustomColor(hex);
    else onSelectChalkCustomColor(hex);
  };

  const handleResetCurrentPalette = () => {
    if (palette === 'dark') {
      onSelectDarkPreset('obsidian-void');
      onSelectDarkCustomColor('#06070a');
    } else if (palette === 'butter') {
      onSelectButterPreset('canary-gold');
      onSelectButterCustomColor('#faf5e6');
    } else {
      onSelectChalkPreset('classic-white');
      onSelectChalkCustomColor('#f6f8fb');
    }
  };

  // Determine contrast rating for active custom color
  const referenceText = palette === 'dark' ? '#f8fafc' : '#0f172a';
  const contrastScore = getContrastRatio(activeCustomColor, referenceText);
  // WCAG 2.1 thresholds for normal text: 4.5:1 is level AA, 7:1 is level AAA.
  const contrastLevel = contrastScore >= 7 ? 'AAA' : contrastScore >= 4.5 ? 'AA' : null;

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-1.5 font-mono text-xs select-none ${className}`}
    >
      {/* 1. Core Palette Tri-Switch */}
      <div
        className={`flex items-center p-0.5 rounded-full border shadow-xs transition-all ${
          palette === 'butter'
            ? 'bg-amber-100/90 border-amber-300 text-neutral-900'
            : palette === 'chalk'
            ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
            : 'bg-white/[0.06] border-white/[0.14] text-neutral-300 backdrop-blur-md'
        }`}
      >
        <button
          onClick={() => onSelectPalette('butter')}
          className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 font-bold cursor-pointer ${
            palette === 'butter'
              ? 'bg-amber-400 text-neutral-950 font-black shadow-xs scale-102'
              : palette === 'chalk'
              ? 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/60'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Buttermax Canary Yellow Palette"
          aria-label="Switch to Butter Palette"
        >
          <Sparkles className="w-3 h-3 text-amber-600" />
          <span>Butter</span>
        </button>

        <button
          onClick={() => onSelectPalette('dark')}
          className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 cursor-pointer ${
            palette === 'dark'
              ? 'bg-white text-neutral-950 font-bold shadow-xs scale-102'
              : palette === 'butter'
              ? 'text-neutral-700 hover:text-black hover:bg-black/5'
              : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/60'
          }`}
          title="Obsidian Dark Palette"
          aria-label="Switch to Dark Palette"
        >
          <Moon className="w-3 h-3 text-indigo-400" />
          <span>Dark</span>
        </button>

        <button
          onClick={() => onSelectPalette('chalk')}
          // Only the ACTIVE chalk button is a dark pill with white text. data-keep-white forces white text in
          // the light palettes, so an inactive Chalk button in Butter had white text on a cream bar (1.1:1).
          data-keep-white={palette === 'chalk' ? 'true' : undefined}
          className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 cursor-pointer ${
            palette === 'chalk'
              ? 'bg-neutral-900 !text-white font-bold shadow-xs scale-102'
              : palette === 'butter'
              ? 'text-neutral-700 hover:text-black hover:bg-black/5'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Studio Chalk Light Palette"
          aria-label="Switch to Chalk Palette"
        >
          <Sun className="w-3 h-3 text-amber-400" />
          <span className={palette === 'chalk' ? '!text-white font-bold' : ''}>Chalk</span>
        </button>
      </div>

      {/* 2. Sub-Color Preset Bar for the Active Palette */}
      <div
        className={`flex items-center p-0.5 rounded-full border shadow-2xs transition-all ${
          palette === 'butter'
            ? 'bg-amber-50/90 border-amber-200 text-neutral-800'
            : palette === 'chalk'
            ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
            : 'bg-white/[0.04] border-white/[0.10] text-neutral-300 backdrop-blur-md'
        }`}
      >
        <span
          className={`text-[10px] uppercase font-bold px-1.5 hidden ${
            compact ? 'lg:inline' : 'sm:inline'
          } ${
            palette === 'butter'
              ? 'text-amber-800'
              : palette === 'chalk'
              ? 'text-neutral-500'
              : 'text-neutral-400'
          }`}
        >
          Tint:
        </span>

        {currentPresets.map((preset) => {
          const isSelected = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset.id)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
                isSelected
                  ? palette === 'butter'
                    ? 'bg-amber-300 text-neutral-950 font-bold shadow-xs scale-102'
                    : palette === 'chalk'
                    ? 'bg-white text-neutral-950 font-bold shadow-xs scale-102 border border-neutral-300'
                    : 'bg-white/20 text-white font-bold shadow-xs scale-102 border border-white/20'
                  : palette === 'butter'
                  ? 'text-amber-900/80 hover:text-black hover:bg-amber-200/50'
                  : palette === 'chalk'
                  ? 'text-neutral-700 hover:text-black hover:bg-neutral-200/50'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.08]'
              }`}
              title={`${preset.name} — ${preset.subtitle}`}
              aria-label={`Select ${preset.name}`}
            >
              <span
                className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                style={{ backgroundColor: preset.bgHex }}
              />
              <span className={compact ? 'hidden xl:inline' : 'hidden md:inline'}>
                {preset.label}
              </span>
            </button>
          );
        })}

        {/* Custom Hex Picker Toggle */}
        <button
          onClick={() => setIsCustomOpen(!isCustomOpen)}
          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
            activePresetId === 'custom'
              ? palette === 'butter'
                ? 'bg-amber-300 text-black font-bold shadow-xs'
                : palette === 'chalk'
                ? 'bg-white text-black font-bold shadow-xs border border-neutral-300'
                : 'bg-white/20 text-white font-bold shadow-xs border border-white/20'
              : palette === 'butter'
              ? 'text-amber-900/80 hover:text-black'
              : palette === 'chalk'
              ? 'text-neutral-700 hover:text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Open Custom Color Swatches & Hex Tool"
          aria-expanded={isCustomOpen}
        >
          {activePresetId === 'custom' ? (
            <span
              className="w-2 h-2 rounded-full border border-black/20 shrink-0"
              style={{ backgroundColor: activeCustomColor }}
            />
          ) : (
            <Palette className="w-3 h-3" />
          )}
          <span className="hidden sm:inline">Custom</span>
        </button>
      </div>

      {/* 3. Custom Color Popover Drawer */}
      {isCustomOpen && (
        <div
          className={`absolute top-full right-0 mt-2 w-80 sm:w-88 rounded-2xl border shadow-2xl p-4 z-50 animate-in fade-in-0 zoom-in-95 duration-150 backdrop-blur-2xl ${
            palette === 'butter'
              ? 'bg-[#fef9e8]/95 border-amber-300 text-neutral-900 shadow-amber-950/15'
              : palette === 'chalk'
              ? 'bg-white/95 border-neutral-300 text-neutral-900 shadow-slate-900/15'
              : 'bg-[#0d1017]/95 border-white/[0.16] text-white shadow-black/80'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between pb-3 border-b ${
              palette === 'butter'
                ? 'border-amber-200'
                : palette === 'chalk'
                ? 'border-neutral-200'
                : 'border-white/[0.10]'
            }`}
          >
            <div className="flex items-center space-x-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  palette === 'butter'
                    ? 'bg-amber-200 text-amber-900'
                    : palette === 'chalk'
                    ? 'bg-neutral-100 text-neutral-800'
                    : 'bg-white/[0.08] text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold font-mono uppercase tracking-tight">
                  {palette.toUpperCase()} Color Tinting
                </h4>
                <p
                  className={`text-[10px] ${
                    palette === 'butter'
                      ? 'text-amber-800/80'
                      : palette === 'chalk'
                      ? 'text-neutral-500'
                      : 'text-neutral-400'
                  }`}
                >
                  Refine background caustics & contrast
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsCustomOpen(false)}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                palette === 'butter'
                  ? 'hover:bg-amber-200 text-amber-800'
                  : palette === 'chalk'
                  ? 'hover:bg-neutral-100 text-neutral-500'
                  : 'hover:bg-white/[0.10] text-neutral-400 hover:text-white'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Curated Swatches */}
          <div className="py-3 space-y-2">
            <span
              className={`text-[10px] uppercase font-bold tracking-wider ${
                palette === 'butter'
                  ? 'text-amber-900'
                  : palette === 'chalk'
                  ? 'text-neutral-600'
                  : 'text-neutral-400'
              }`}
            >
              Curated Swatches
            </span>
            <div className="grid grid-cols-3 gap-2">
              {currentSwatches.map((swatch) => {
                const isSelected =
                  activePresetId === 'custom' &&
                  activeCustomColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    onClick={() => {
                      handleSelectPreset('custom');
                      handleCustomColorChange(swatch.hex);
                    }}
                    className={`flex items-center space-x-2 p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? palette === 'butter'
                          ? 'border-amber-500 bg-amber-200/60 font-bold ring-1 ring-amber-400'
                          : palette === 'chalk'
                          ? 'border-neutral-900 bg-neutral-100 font-bold ring-1 ring-neutral-900'
                          : 'border-white bg-white/[0.12] font-bold ring-1 ring-white'
                        : palette === 'butter'
                        ? 'border-amber-200 bg-white/60 hover:bg-white'
                        : palette === 'chalk'
                        ? 'border-neutral-200 bg-neutral-50 hover:bg-white'
                        : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-black/20 shrink-0 shadow-2xs"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <span className="text-[11px] truncate">{swatch.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hex Input & Native Picker */}
          <div
            className={`pt-3 border-t flex items-center justify-between gap-3 ${
              palette === 'butter'
                ? 'border-amber-200'
                : palette === 'chalk'
                ? 'border-neutral-200'
                : 'border-white/[0.10]'
            }`}
          >
            <div className="flex items-center space-x-2 flex-1">
              <input
                ref={colorInputRef}
                type="color"
                value={activeCustomColor}
                onChange={(e) => {
                  handleSelectPreset('custom');
                  handleCustomColorChange(e.target.value);
                }}
                className="w-8 h-8 rounded-lg border cursor-pointer bg-transparent shrink-0"
                title="Click to choose custom spectrum color"
              />
              <div className="relative flex-1">
                <input
                  type="text"
                  value={hexDraft ?? activeCustomColor}
                  onChange={(e) => {
                    const typed = e.target.value;
                    if (!/^#?[0-9A-Fa-f]{0,6}$/.test(typed)) return;
                    setHexDraft(typed);
                    // Apply only a complete colour (3 or 6 digits), normalised to #rrggbb.
                    const complete = typed.replace('#', '').length === 3 || typed.replace('#', '').length === 6;
                    const hex = complete ? normalizeHex(typed) : null;
                    if (hex) {
                      handleSelectPreset('custom');
                      handleCustomColorChange(hex);
                    }
                  }}
                  onBlur={() => setHexDraft(null)}
                  placeholder="#000000"
                  maxLength={7}
                  className={`w-full px-2.5 py-1 rounded-lg border font-mono text-xs uppercase focus:outline-none focus:ring-1 ${
                    palette === 'butter'
                      ? 'bg-white border-amber-300 text-neutral-900 focus:ring-amber-500'
                      : palette === 'chalk'
                      ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:ring-neutral-900'
                      : 'bg-black/40 border-white/[0.16] text-white focus:ring-white'
                  }`}
                />
              </div>
            </div>

            {/* Reset Button */}
            <button
              onClick={handleResetCurrentPalette}
              title="Reset to default palette preset"
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                palette === 'butter'
                  ? 'border-amber-300 hover:bg-amber-200 text-amber-900'
                  : palette === 'chalk'
                  ? 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                  : 'border-white/[0.14] hover:bg-white/[0.08] text-neutral-300'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Contrast & Accessibility Indicator */}
          <div
            className={`mt-3 pt-2 text-[10px] flex items-center justify-between border-t ${
              palette === 'butter'
                ? 'border-amber-200/80 text-amber-800'
                : palette === 'chalk'
                ? 'border-neutral-200 text-neutral-500'
                : 'border-white/[0.08] text-neutral-400'
            }`}
          >
            <span>WCAG Contrast: {contrastScore.toFixed(1)}:1</span>
            <span
              className={`px-1.5 py-0.2 rounded font-bold ${
                contrastLevel
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {contrastLevel ? `${contrastLevel} Pass` : 'Below AA'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
