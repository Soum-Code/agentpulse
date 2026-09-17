import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, RotateCcw, X, SlidersHorizontal, Sparkles } from 'lucide-react';
import { ChalkSurfacePreset } from '../../types';

interface ChalkSurfacePickerProps {
  currentPreset: ChalkSurfacePreset;
  customColor: string;
  onSelectPreset: (preset: ChalkSurfacePreset) => void;
  onSelectCustomColor: (hex: string) => void;
  className?: string;
}

export const CHALK_PRESETS: {
  id: ChalkSurfacePreset;
  name: string;
  label: string;
  subtitle: string;
  bgHex: string;
  cardHex: string;
  borderHex: string;
  dotColor: string;
  tag: string;
}[] = [
  {
    id: 'classic-white',
    name: 'Classic White',
    label: 'White',
    subtitle: 'Studio alabaster & fresh drafting paper',
    bgHex: '#ffffff',
    cardHex: '#ffffff',
    borderHex: '#e2e8f0',
    dotColor: '#ffffff',
    tag: 'Crisp & Clean'
  },
  {
    id: 'sepia-slate',
    name: 'Sepia-Toned Slate',
    label: 'Sepia',
    subtitle: 'Warm antique parchment & library stone',
    bgHex: '#f5efe6',
    cardHex: '#faf6ee',
    borderHex: '#dfd4c3',
    dotColor: '#e9dfd0',
    tag: 'Eye Comfort'
  },
  {
    id: 'emerald-graphite',
    name: 'Soft Emerald-Graphite',
    label: 'Emerald',
    subtitle: 'Matte lecture slate & calming sage tone',
    bgHex: '#eaf2ec',
    cardHex: '#f3f9f5',
    borderHex: '#c2dccb',
    dotColor: '#cfe4d7',
    tag: 'Academic Slate'
  },
];

const CURATED_SWATCHES = [
  { hex: '#ffffff', name: 'Classic White' },
  { hex: '#f5efe6', name: 'Warm Sepia' },
  { hex: '#eaf2ec', name: 'Emerald Slate' },
  { hex: '#e3ebf4', name: 'Blueprint Mist' },
  { hex: '#eee9f5', name: 'Lilac Slate' },
  { hex: '#f6ede4', name: 'Sandstone' },
];

function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return 1;
  const fullHex = cleanHex.length === 3 
    ? cleanHex.split('').map(c => c + c).join('') 
    : cleanHex;
  const r = parseInt(fullHex.substring(0, 2), 16) / 255;
  const g = parseInt(fullHex.substring(2, 4), 16) / 255;
  const b = parseInt(fullHex.substring(4, 6), 16) / 255;
  const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export const ChalkSurfacePicker: React.FC<ChalkSurfacePickerProps> = ({
  currentPreset,
  customColor,
  onSelectPreset,
  onSelectCustomColor,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputHex, setInputHex] = useState(customColor);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputHex(customColor);
  }, [customColor]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const activeBg = currentPreset === 'custom' 
    ? customColor 
    : CHALK_PRESETS.find(p => p.id === currentPreset)?.bgHex || '#ffffff';

  const textContrastRatio = getContrastRatio(activeBg, '#0f172a');
  const isHighContrast = textContrastRatio >= 7.0;

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputHex(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onSelectCustomColor(val);
    }
  };

  const handleNativeColorPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setInputHex(newColor);
    onSelectCustomColor(newColor);
  };

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      {/* Inline Quick Selector Pills */}
      <div 
        id="chalk-surface-preset-selector"
        className="flex items-center p-0.5 rounded-full bg-neutral-200/80 border border-neutral-300 text-neutral-800 shadow-2xs backdrop-blur-xs"
      >
        <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 text-neutral-600 hidden sm:inline">
          Surface:
        </span>

        {CHALK_PRESETS.map((preset) => {
          const isSelected = currentPreset === preset.id;
          return (
            <button
              key={preset.id}
              id={`chalk-preset-btn-${preset.id}`}
              onClick={() => onSelectPreset(preset.id)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 ${
                isSelected
                  ? 'bg-white text-neutral-950 font-bold shadow-xs border border-neutral-300/80 scale-102'
                  : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100/60'
              }`}
              title={`${preset.name} — ${preset.subtitle}`}
              aria-label={`Select ${preset.name} surface`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-neutral-400/80 shadow-2xs shrink-0"
                style={{ backgroundColor: preset.bgHex }}
              />
              <span className="hidden md:inline">{preset.label}</span>
            </button>
          );
        })}

        {/* Custom Color Button with Popover Toggle */}
        <button
          id="chalk-custom-color-trigger"
          onClick={() => setIsOpen(!isOpen)}
          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 ${
            currentPreset === 'custom'
              ? 'bg-white text-neutral-950 font-bold shadow-xs border border-neutral-300/80'
              : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100/60'
          }`}
          title="Open Chalk Surface Color Picker & Swatches"
          aria-expanded={isOpen}
        >
          {currentPreset === 'custom' ? (
            <span
              className="w-2.5 h-2.5 rounded-full border border-neutral-400 shadow-2xs shrink-0"
              style={{ backgroundColor: customColor }}
            />
          ) : (
            <Palette className="w-3 h-3 text-neutral-700" />
          )}
          <span className="hidden lg:inline">Custom</span>
        </button>
      </div>

      {/* Surface Material Customizer Popover */}
      {isOpen && (
        <div
          id="chalk-surface-customizer-popover"
          className="absolute top-full right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-neutral-300 shadow-2xl p-4 z-50 animate-in fade-in-0 zoom-in-95 duration-150 text-neutral-900"
          style={{
            boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.06)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-800">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold font-mono tracking-tight uppercase text-neutral-900">
                  Chalk Surface Palette
                </h4>
                <p className="text-[11px] text-neutral-500">
                  Tactile slate & paper aesthetic customizer
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              aria-label="Close palette"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preset Surface Selection Cards */}
          <div className="mt-3 space-y-2">
            <label className="text-[10px] font-mono uppercase font-bold tracking-wider text-neutral-500 px-1">
              Curated Classroom Materials
            </label>
            <div className="grid grid-cols-1 gap-2">
              {CHALK_PRESETS.map((preset) => {
                const isSelected = currentPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    id={`chalk-popover-preset-${preset.id}`}
                    onClick={() => {
                      onSelectPreset(preset.id);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-neutral-950 bg-neutral-50/90 shadow-sm ring-1 ring-neutral-950'
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-8 h-8 rounded-lg border border-neutral-300/80 shadow-inner flex items-center justify-center shrink-0"
                        style={{ backgroundColor: preset.bgHex }}
                      >
                        {isSelected && <Check className="w-4 h-4 text-neutral-950 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-neutral-900">{preset.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full font-mono bg-neutral-200/70 text-neutral-700">
                            {preset.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-tight mt-0.5">
                          {preset.subtitle}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Picker & Hex Fine-Tuning */}
          <div className="mt-4 pt-3 border-t border-neutral-200">
            <div className="flex items-center justify-between mb-2 px-1">
              <label className="text-[10px] font-mono uppercase font-bold tracking-wider text-neutral-500">
                Custom Surface Tint
              </label>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                isHighContrast ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                WCAG {textContrastRatio.toFixed(1)}:1 {isHighContrast ? 'AAA' : 'AA'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Native Picker Trigger */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => colorInputRef.current?.click()}
                  className="w-10 h-10 rounded-xl border border-neutral-300 shadow-inner flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                  style={{ backgroundColor: activeBg }}
                  title="Click to open system color picker"
                >
                  <Palette className="w-4 h-4 text-neutral-700 drop-shadow-xs" />
                </button>
                <input
                  ref={colorInputRef}
                  id="chalk-surface-native-color-picker"
                  type="color"
                  value={activeBg.startsWith('#') && activeBg.length === 7 ? activeBg : '#ffffff'}
                  onChange={handleNativeColorPick}
                  className="sr-only"
                />
              </div>

              {/* Hex Input */}
              <div className="flex-1 relative">
                <input
                  id="chalk-surface-hex-input"
                  type="text"
                  value={inputHex}
                  onChange={handleHexChange}
                  placeholder="#ffffff"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-neutral-300 bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900 transition-colors"
                />
              </div>

              {/* Reset Button */}
              <button
                type="button"
                id="chalk-surface-reset-btn"
                onClick={() => {
                  onSelectPreset('classic-white');
                  setInputHex('#ffffff');
                }}
                className="p-2 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-100 text-neutral-600 transition-colors shrink-0"
                title="Reset to Classic White"
                aria-label="Reset to default white"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Swatch Pills */}
            <div className="mt-3 flex items-center justify-between gap-1.5">
              {CURATED_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  id={`chalk-swatch-${swatch.hex.replace('#', '')}`}
                  type="button"
                  onClick={() => {
                    setInputHex(swatch.hex);
                    onSelectCustomColor(swatch.hex);
                  }}
                  className="w-6 h-6 rounded-full border border-neutral-300/90 shadow-2xs hover:scale-115 transition-transform relative group"
                  style={{ backgroundColor: swatch.hex }}
                  title={swatch.name}
                >
                  {activeBg.toLowerCase() === swatch.hex.toLowerCase() && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Mini Classroom Surface Preview Card */}
          <div 
            className="mt-3 p-2.5 rounded-xl border border-neutral-200 text-xs transition-colors"
            style={{ backgroundColor: activeBg }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase font-bold text-neutral-800 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>Surface Readability Preview</span>
              </span>
              <span className="text-[10px] text-neutral-600 font-mono">
                {currentPreset === 'custom' ? 'Custom Tint' : CHALK_PRESETS.find(p => p.id === currentPreset)?.name}
              </span>
            </div>
            <p className="text-[11px] text-neutral-700 mt-1 leading-snug">
              Aged slate with floating dust-mote drift. Clear, restful contrast for long analysis sessions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
