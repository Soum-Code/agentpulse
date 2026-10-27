import React, { useEffect, useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Key,
  Bell,
  Sliders,
  CheckCircle2,
  Copy,
  Check,
  Moon,
  Sun,
  Eye,
  Sparkles,
  Layers,
  Activity,
  Zap,
  Flame,
  Type,
  AlignJustify,
  Maximize2,
  Minimize2,
  Cpu,
  Shield
} from 'lucide-react';
import {
  TextDensity,
  TelemetryProject,
  ColorPalette,
  DarkSurfacePreset,
  ButterSurfacePreset,
  ChalkSurfacePreset,
} from '../../types';
import { UnifiedPaletteBar } from '../common/UnifiedPaletteBar';
import { CHALK_PRESETS, DARK_PRESETS, BUTTER_PRESETS } from '../../lib/colorPalettes';
import { api, PlatformHealth } from '../../lib/api';
import { liveEvaluationTiming } from '../../lib/evalTiming';
import { ingestionKeyView } from '../../lib/ingestionKey';
import { User as FirebaseUser } from 'firebase/auth';

interface SettingsViewProps {
  isCalmMode?: boolean;
  onToggleCalmMode?: () => void;
  textDensity?: TextDensity;
  onChangeTextDensity?: (density: TextDensity) => void;
  currentUser?: FirebaseUser | null;
  activeProject?: TelemetryProject | null;
  onOpenProjectSelector?: () => void;
  onOpenAuth?: () => void;
  // Palette state from useAppTheme (App spreads it in); without it the palette section is hidden.
  palette?: ColorPalette;
  onSelectPalette?: (palette: ColorPalette) => void;
  darkPreset?: DarkSurfacePreset;
  onSelectDarkPreset?: (preset: DarkSurfacePreset) => void;
  darkCustomColor?: string;
  onSelectDarkCustomColor?: (hex: string) => void;
  butterPreset?: ButterSurfacePreset;
  onSelectButterPreset?: (preset: ButterSurfacePreset) => void;
  butterCustomColor?: string;
  onSelectButterCustomColor?: (hex: string) => void;
  chalkSurface?: ChalkSurfacePreset;
  onSelectChalkPreset?: (preset: ChalkSurfacePreset) => void;
  chalkCustomColor?: string;
  onSelectChalkCustomColor?: (hex: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isCalmMode = false,
  onToggleCalmMode,
  textDensity = 'comfortable',
  onChangeTextDensity,
  currentUser,
  activeProject,
  onOpenProjectSelector,
  onOpenAuth,
  palette,
  onSelectPalette,
  darkPreset = 'obsidian-void',
  onSelectDarkPreset,
  darkCustomColor = '#06070a',
  onSelectDarkCustomColor,
  butterPreset = 'canary-gold',
  onSelectButterPreset,
  butterCustomColor = '#faf5e6',
  onSelectButterCustomColor,
  chalkSurface = 'classic-white',
  onSelectChalkPreset,
  chalkCustomColor = '#f6f8fb',
  onSelectChalkCustomColor
}) => {
  // Read from the active project on every render, so switching project while this
  // page is open shows that project's key. Only a key shaped like one the API
  // issues is shown; see ingestionKeyView.
  const keyView = ingestionKeyView(activeProject);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Appearance (palette, Calm mode, density) is remembered in this browser's localStorage by
  // useAppTheme, so it is applied at once and needs no Save button. The alert thresholds and the
  // webhook are server settings the API has no route to change, so they are read-only here.
  const densityWired = onChangeTextDensity !== undefined;

  // Live evaluation timing from this instance's own /v1/platform report. Read once
  // when the page opens; the Performance tab is the one that polls.
  const [platform, setPlatform] = useState<PlatformHealth | null>(null);
  const [platformFailed, setPlatformFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.getPlatformHealth().then(
      (data) => { if (!cancelled) setPlatform(data); },
      () => { if (!cancelled) setPlatformFailed(true); },
    );
    return () => { cancelled = true; };
  }, []);
  const evalTiming = liveEvaluationTiming(platform, platformFailed);

  // "Copied" is shown only after the browser confirms the write.
  const handleCopyKey = () => {
    if (!keyView.key) return;
    const done = (state: 'copied' | 'failed') => {
      setCopyState(state);
      setTimeout(() => setCopyState('idle'), 2000);
    };
    try {
      navigator.clipboard.writeText(keyView.key).then(() => done('copied'), () => done('failed'));
    } catch {
      done('failed');
    }
  };

  return (
    <div className="space-y-6 pb-28 font-mono text-xs max-w-4xl">
      {/* Header with requested No LLM dependency Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
        <div>
          <h2 className="text-lg font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Settings className="w-5 h-5 text-neutral-400" />
            <span>System Settings & Environment Calibration</span>
          </h2>
          <p className="text-neutral-400 mt-1">
            Console appearance, the active project and its ingestion key, and where alert thresholds and webhooks are set
          </p>
        </div>

        {/* Primary Requested Status Badge in Settings Header */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-mono text-[11px] font-semibold tracking-wide uppercase shadow-[0_0_12px_rgba(52,211,153,0.2)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 phosphor-emerald animate-pulse" />
            <span>No LLM Dependency</span>
          </div>
        </div>
      </div>

      {/* Evaluator Engine Architecture Card */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden bg-gradient-to-r from-emerald-950/20 via-black/40 to-cyan-950/20">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider flex items-center space-x-2">
                <span>Evaluator Engine: Local CPU</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                  No LLM Dependency
                </span>
              </div>
              <p className="text-neutral-400 text-[11px] mt-0.5 font-sans">
                Evaluations run locally inside the worker process via lightweight CPU transformer classifiers. Never calls an external LLM API.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/[0.1] text-cyan-300 text-[11px] font-mono shrink-0">
            {evalTiming.value} · 0 generated tokens
          </span>
        </div>
        {/* The headline is what this instance measures now. The offline figure is
            LLM_JUDGE_COMPARISON_REPORT.md: median 202.94 ms, mean 257.53 ms, 30 cases. */}
        <p className="text-neutral-400 text-[11px] font-sans">
          {evalTiming.caption} Offline reference: median 203&nbsp;ms (mean 258&nbsp;ms) over 30 test cases, MiniLM and DeBERTa on CPU, a small sample.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[11px]">
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
            <div className="text-neutral-400 text-[10px] uppercase tracking-wider">Grounding & Contradiction Classifier</div>
            <div className="text-white font-semibold flex items-center justify-between">
              <span>cross-encoder/nli-deberta-v3-small</span>
              <span className="text-emerald-400 text-[10px]">~1.1 GB cached</span>
            </div>
            <p className="text-neutral-400 font-sans text-[11px]">
              Classifies premise–hypothesis entailment, neutral, and contradiction probabilities. Calibrated formula: <code className="text-neutral-200">contradiction + 0.3 * neutral</code>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
            <div className="text-neutral-400 text-[10px] uppercase tracking-wider">Embedding & Drift Engine</div>
            <div className="text-white font-semibold flex items-center justify-between">
              <span>sentence-transformers/all-MiniLM-L6-v2</span>
              <span className="text-cyan-400 text-[10px]">88 MB cached</span>
            </div>
            <p className="text-neutral-400 font-sans text-[11px]">
              Transforms spans into 384-dimensional dense vectors to calculate <code className="text-neutral-200">window_centroid_distance</code> across rolling baseline pools.
            </p>
          </div>
        </div>

        {/* Enterprise Pillar Roadmap / System Blueprint */}
        <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider">
              Pipeline
            </span>
            <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
              Target Architecture
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-neutral-400 text-[10px] uppercase block">Ingress &amp; Queue</span>
              <span className="text-white font-semibold block">FastAPI 202 + SQLite WAL</span>
              <p className="text-[10px] text-neutral-400 font-sans">
                The API writes the span, queues an evaluation job and returns; a separate
                worker leases the job for 120 seconds. SQLite&rsquo;s single writer is the
                known ceiling here, not something already replaced.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-neutral-400 text-[10px] uppercase block">Evaluation Engine</span>
              <span className="text-white font-semibold block">DeBERTa-v3 NLI on CPU</span>
              <p className="text-[10px] text-neutral-400 font-sans">
                Premise against hypothesis on CPU: ONNX Runtime when it loads, otherwise
                PyTorch (the embedding model always runs on PyTorch). Timing is in the
                header above. The model reads at most 512 tokens; a longer premise is
                reported as truncated rather than scored silently.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-neutral-400 text-[10px] uppercase block">Evaluation Datasets</span>
              <span className="text-white font-semibold block">Curate from a live trace</span>
              <p className="text-[10px] text-neutral-400 font-sans">
                A failing span can be saved into a versioned dataset from the incident
                view. Running those as a gate in CI is not built &mdash; there is no
                workflow in this repository yet.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Surface colours: palette, tint presets and custom colour. Shown when App passes the theme state. */}
      {palette && onSelectPalette && onSelectDarkPreset && onSelectDarkCustomColor && onSelectButterPreset && onSelectButterCustomColor && onSelectChalkPreset && onSelectChalkCustomColor && (
      <>
      {/* Unified Surface Color Palette & Multi-Color Spectrum */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl border transition-all ${
              palette === 'butter'
                ? 'bg-amber-400/20 border-amber-400/40 text-amber-500'
                : palette === 'chalk'
                ? 'bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
            }`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider flex items-center space-x-2">
                <span>Surface Color System</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border bg-white/[0.06] border-white/[0.14] text-white">
                  Active: {palette.toUpperCase()} ({palette === 'dark' ? darkPreset : palette === 'butter' ? butterPreset : chalkSurface})
                </span>
              </div>
              <p className="text-neutral-400 text-[11px] mt-0.5 font-sans">
                Unified color palette applied across Public Website, Observability Dashboard, and Flagship Live Chat
              </p>
            </div>
          </div>

          {/* Interactive Palette & Tint Switcher */}
          <UnifiedPaletteBar
            palette={palette}
            onSelectPalette={onSelectPalette!}
            darkPreset={darkPreset}
            onSelectDarkPreset={onSelectDarkPreset!}
            darkCustomColor={darkCustomColor}
            onSelectDarkCustomColor={onSelectDarkCustomColor!}
            butterPreset={butterPreset}
            onSelectButterPreset={onSelectButterPreset!}
            butterCustomColor={butterCustomColor}
            onSelectButterCustomColor={onSelectButterCustomColor!}
            chalkSurface={chalkSurface}
            onSelectChalkPreset={onSelectChalkPreset!}
            chalkCustomColor={chalkCustomColor}
            onSelectChalkCustomColor={onSelectChalkCustomColor!}
          />
        </div>

        {/* Triple Palette Atmosphere Comparison & Live Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Butter Palette Card */}
          <div
            onClick={() => onSelectPalette!('butter')}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
              palette === 'butter'
                ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-400 text-neutral-950 shadow-md'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-amber-400/30 text-neutral-300 hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Buttermax Canary</span>
              </span>
              {palette === 'butter' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
            </div>
            <p className="text-[11px] font-sans leading-relaxed opacity-90">
              Iconic editorial canary gold, toasted honeycomb, French vanilla, and matcha cream.
            </p>
            <div className="flex items-center space-x-1.5 pt-1">
              {BUTTER_PRESETS.map((p) => (
                <span
                  key={p.id}
                  className="w-2.5 h-2.5 rounded-full border border-black/20"
                  style={{ backgroundColor: p.bgHex }}
                  title={p.name}
                />
              ))}
              <span className="text-[10px] opacity-90 ml-1">4 Warm Tints</span>
            </div>
          </div>

          {/* Dark Palette Card */}
          <div
            onClick={() => onSelectPalette!('dark')}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
              palette === 'dark'
                ? 'bg-white/[0.08] border-indigo-400 ring-2 ring-indigo-400 text-white shadow-md'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.2] text-neutral-300 hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center space-x-1.5">
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Obsidian Cyber</span>
              </span>
              {palette === 'dark' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
            </div>
            <p className="text-[11px] font-sans leading-relaxed opacity-90">
              Pure atmospheric void, oceanic sapphire, imperial amethyst nebula, and cyber matrix jade.
            </p>
            <div className="flex items-center space-x-1.5 pt-1">
              {DARK_PRESETS.map((p) => (
                <span
                  key={p.id}
                  className="w-2.5 h-2.5 rounded-full border border-white/20"
                  style={{ backgroundColor: p.bgHex }}
                  title={p.name}
                />
              ))}
              <span className="text-[10px] opacity-90 ml-1">4 Void Tints</span>
            </div>
          </div>

          {/* Chalk Palette Card */}
          <div
            onClick={() => onSelectPalette!('chalk')}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
              palette === 'chalk'
                ? 'bg-neutral-100 border-neutral-400 ring-2 ring-neutral-400 text-neutral-900 shadow-md'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.2] text-neutral-300 hover:text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center space-x-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Studio Chalk</span>
              </span>
              {palette === 'chalk' && <CheckCircle2 className="w-4 h-4 text-neutral-900" />}
            </div>
            <p className="text-[11px] font-sans leading-relaxed opacity-90">
              Clean studio alabaster, antique sepia parchment, sage emerald slate, and blueprint cyan.
            </p>
            <div className="flex items-center space-x-1.5 pt-1">
              {CHALK_PRESETS.map((p) => (
                <span
                  key={p.id}
                  className="w-2.5 h-2.5 rounded-full border border-black/20"
                  style={{ backgroundColor: p.bgHex }}
                  title={p.name}
                />
              ))}
              <span className="text-[10px] opacity-90 ml-1">4 Paper Tints</span>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Visual Ergonomics & Calm Mode (Deep Zen Theme) */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl border transition-all ${
              isCalmMode
                ? 'bg-neutral-800/80 border-neutral-700 text-neutral-200'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider flex items-center space-x-2">
                <span>Calm Mode (Deep Zen Theme)</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${
                  isCalmMode
                    ? 'bg-neutral-800 text-neutral-300 border-neutral-600'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isCalmMode ? 'Active: Deep Zen' : 'High Contrast Obsidian'}
                </span>
              </div>
              <p className="text-neutral-400 text-[11px] mt-0.5 font-sans">
                Switches the console to a muted slate background and text colour
                {!onToggleCalmMode && ' (available with the Dark palette only; switch to Dark to use it)'}
              </p>
            </div>
          </div>

          {/* Master Toggle Switch */}
          <div className="flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onClick={onToggleCalmMode}
              // Calm mode is only offered with the Dark palette (App passes no handler otherwise)
              disabled={!onToggleCalmMode}
              className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none ${
                isCalmMode
                  ? 'bg-neutral-700 border-neutral-500'
                  : 'bg-white/[0.1] border-white/[0.18]'
              }`}
              role="switch"
              aria-checked={isCalmMode}
              aria-label="Toggle Calm Mode Deep Zen Theme"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out mt-0.5 ${
                  isCalmMode ? 'translate-x-6 bg-neutral-200' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Theme Atmosphere Comparison & Live Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Default High-Contrast Option */}
          <div
            onClick={() => {
              if (isCalmMode && onToggleCalmMode) onToggleCalmMode();
            }}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
              !isCalmMode
                ? 'bg-white/[0.06] border-emerald-500/50 shadow-[0_0_20px_rgba(52,211,153,0.12)]'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.18] opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-xs">High-Contrast Obsidian</span>
              {!isCalmMode && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
            <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
              The console&rsquo;s normal background and text colours, set by the palette.
            </p>
            <div className="flex items-center space-x-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
              <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
              <span className="text-[10px] text-neutral-400 ml-1">Luminous Neon Spectrums</span>
            </div>
          </div>

          {/* Deep Zen Monochromatic Option */}
          <div
            onClick={() => {
              if (!isCalmMode && onToggleCalmMode) onToggleCalmMode();
            }}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
              isCalmMode
                ? 'bg-neutral-900/90 border-neutral-500 shadow-[0_0_20px_rgba(255,255,255,0.06)]'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.18] opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-200 text-xs">Deep Zen (Low Contrast)</span>
              {isCalmMode && <CheckCircle2 className="w-4 h-4 text-neutral-300" />}
            </div>
            <p className="text-[11px] font-sans text-neutral-400 leading-relaxed">
              A dark slate background with slate-grey text.
            </p>
            <div className="flex items-center space-x-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-neutral-400" />
              <span className="w-2 h-2 rounded-full bg-neutral-500" />
              <span className="w-2 h-2 rounded-full bg-neutral-600" />
              <span className="text-[10px] text-neutral-400 ml-1">Muted Zinc Ergonomics</span>
            </div>
          </div>
        </div>

        {/* Ergonomic Benefits Callout */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 flex items-start space-x-2.5 text-[11px] font-sans text-neutral-300">
          <Eye className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="text-neutral-200 font-medium">Remembered in this browser:</span> this choice is kept in localStorage, so it survives a reload. Other browsers and devices do not follow it.
          </div>
        </div>
      </div>

      {/* Text Density & Typography Scale Slider. `inert` locks every control inside
          while the parent supplies no handler: App.tsx passes none and nothing in
          the console applies the .density-* classes, so the buttons would do nothing. */}
      <div
        inert={!densityWired}
        className={`ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 relative overflow-hidden ${densityWired ? '' : 'opacity-70'}`}
      >
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl border transition-all ${
              textDensity === 'compact'
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <Type className="w-4 h-4" />
            </div>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider flex items-center space-x-2">
                <span>Text Density & Typography Scale</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${
                  textDensity === 'compact'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {textDensity === 'compact' ? 'Active: Compact Scale (0.88x)' : 'Active: Comfortable Scale (1.0x)'}
                </span>
              </div>
              {densityWired ? (
                <p className="text-neutral-400 text-[11px] mt-0.5 font-sans">
                  Scales console text and row padding
                </p>
              ) : (
                <p className="text-amber-300 text-[11px] mt-0.5 font-sans">
                  Not applied yet: the console does not read this setting, so these controls are locked.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => onChangeTextDensity?.('compact')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium border transition-all ${
                textDensity === 'compact'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                  : 'bg-white/[0.03] text-neutral-400 border-white/[0.08] hover:text-white'
              }`}
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => onChangeTextDensity?.('comfortable')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium border transition-all ${
                textDensity === 'comfortable'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                  : 'bg-white/[0.03] text-neutral-400 border-white/[0.08] hover:text-white'
              }`}
            >
              Comfortable
            </button>
          </div>
        </div>

        {/* The Text Density Slider Control */}
        <div className="bg-black/40 border border-white/[0.08] rounded-xl p-4.5 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <button
              type="button"
              onClick={() => onChangeTextDensity?.('compact')}
              className={`flex items-center space-x-2 transition-all cursor-pointer ${
                textDensity === 'compact'
                  ? 'text-cyan-300 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full border transition-all ${
                textDensity === 'compact'
                  ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                  : 'bg-neutral-700 border-neutral-600'
              }`} />
              <span>Compact Scale</span>
              <span className="text-[10px] text-neutral-500 hidden sm:inline">(Dense)</span>
            </button>

            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest hidden md:inline-flex items-center space-x-1.5">
              <Sliders className="w-3 h-3 text-neutral-500" />
              <span>Typography Scale Slider</span>
            </span>

            <button
              type="button"
              onClick={() => onChangeTextDensity?.('comfortable')}
              className={`flex items-center space-x-2 transition-all cursor-pointer ${
                textDensity === 'comfortable'
                  ? 'text-emerald-300 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="text-[10px] text-neutral-500 hidden sm:inline">(Spacious)</span>
              <span>Comfortable Scale</span>
              <span className={`w-2.5 h-2.5 rounded-full border transition-all ${
                textDensity === 'comfortable'
                  ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-neutral-700 border-neutral-600'
              }`} />
            </button>
          </div>

          {/* Interactive Range Slider */}
          <div className="relative py-2">
            <input
              id="text-density-slider"
              type="range"
              min="0"
              max="1"
              step="1"
              value={textDensity === 'compact' ? 0 : 1}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onChangeTextDensity?.(val === 0 ? 'compact' : 'comfortable');
              }}
              className="w-full accent-emerald-400 bg-white/[0.12] hover:bg-white/[0.16] h-2.5 rounded-lg cursor-pointer appearance-none transition-all focus:outline-none"
              aria-label="Text density slider to toggle between Compact and Comfortable typography scales"
            />
            {/* These numbers are --density-font-scale and --density-line-height in index.css
                (.density-compact / .density-comfortable); compact said 1.34 against the CSS's 1.35. */}
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono pt-1.5">
              <span className={textDensity === 'compact' ? 'text-cyan-300 font-medium' : 'text-neutral-500'}>
                0 · Compact (0.88x font · 1.35 line-height)
              </span>
              <span className={textDensity === 'comfortable' ? 'text-emerald-300 font-medium' : 'text-neutral-500'}>
                1 · Comfortable (1.0x font · 1.55 line-height)
              </span>
            </div>
          </div>
        </div>

        {/* Side-by-Side Interactive Visual Preview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Compact Preview Card */}
          <div
            onClick={() => onChangeTextDensity?.('compact')}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 relative overflow-hidden ${
              textDensity === 'compact'
                ? 'bg-cyan-950/25 border-cyan-500/50 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.18] opacity-65 hover:opacity-90'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-white text-xs">Compact Typography</span>
              </div>
              {textDensity === 'compact' ? (
                <span className="flex items-center space-x-1 text-[10px] text-cyan-300 font-mono font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Selected</span>
                </span>
              ) : (
                <span className="text-[10px] text-neutral-500 font-mono">{densityWired ? 'Click to toggle' : 'Locked'}</span>
              )}
            </div>

            <p className="text-[11px] font-sans text-neutral-300 leading-snug">
              Decreases font scales to 0.88x and tightens line-height to 1.35 (the values in index.css). Maximizes visible trace spans and telemetry rows on laptops and split-screen investigations.
            </p>

            {/* Miniature Visual Snippet in Compact Typography */}
            <div className="p-2.5 rounded-lg bg-black/60 border border-white/[0.08] space-y-1.5 font-mono text-[10px] leading-tight">
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider flex justify-between">
                <span>Dense layout preview &middot; sample rows</span>
                <span className="text-cyan-400">More rows per screen</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200 border-b border-white/[0.06] pb-1">
                <span>span:vector_search</span>
                <span className="text-neutral-500">— ms · — tok</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200 border-b border-white/[0.06] pb-1">
                <span>span:grounding_eval</span>
                <span className="text-neutral-500">—</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200">
                <span>span:model_stream</span>
                <span className="text-neutral-500">— ms · — tok</span>
              </div>
            </div>
          </div>

          {/* Comfortable Preview Card */}
          <div
            onClick={() => onChangeTextDensity?.('comfortable')}
            className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 relative overflow-hidden ${
              textDensity === 'comfortable'
                ? 'bg-emerald-950/25 border-emerald-500/50 shadow-[0_0_24px_rgba(52,211,153,0.12)]'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.18] opacity-65 hover:opacity-90'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-white text-xs">Comfortable Typography</span>
              </div>
              {textDensity === 'comfortable' ? (
                <span className="flex items-center space-x-1 text-[10px] text-emerald-300 font-mono font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Selected</span>
                </span>
              ) : (
                <span className="text-[10px] text-neutral-500 font-mono">{densityWired ? 'Click to toggle' : 'Locked'}</span>
              )}
            </div>

            <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
              Standard 1.0x typography scale with 1.55 line-height and relaxed margins. Optimized for extended reading sessions, high legibility, and effortless visual tracking.
            </p>

            {/* Miniature Visual Snippet in Comfortable Typography */}
            <div className="p-2.5 rounded-lg bg-black/60 border border-white/[0.08] space-y-2 font-mono text-[11px] leading-normal">
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider flex justify-between">
                <span>Spacious layout preview &middot; sample rows</span>
                <span className="text-emerald-400">1.0x Baseline</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200 border-b border-white/[0.06] pb-1">
                <span>span:vector_search</span>
                <span className="text-neutral-500">— ms · — tok</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200">
                <span>span:grounding_eval</span>
                <span className="text-neutral-500">—</span>
              </div>
            </div>
          </div>
        </div>

        {/* Density Ergonomic Impact Callout */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 flex items-start space-x-2.5 text-[11px] font-sans text-neutral-300">
          <AlignJustify className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="text-neutral-200 font-medium">{densityWired ? 'Remembered in this browser:' : 'Not saved:'}</span> {densityWired
              ? 'this choice is kept in localStorage, so it survives a reload. Other browsers and devices do not follow it.'
              : 'nothing applies a density yet, so the previews above are illustrations only.'}
          </div>
        </div>
      </div>

      {/* Active project, account and ingestion key */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Active Project & Account</span>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenProjectSelector && (
              <button
                onClick={onOpenProjectSelector}
                className="px-3 py-1.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 font-mono text-xs font-bold transition-all flex items-center space-x-1.5"
              >
                <span>Switch / New Project</span>
              </button>
            )}
            {onOpenAuth && (
              <button
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-mono text-xs font-bold transition-all"
              >
                {currentUser ? 'Manage Account' : 'Sign In'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
            <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Active Project</span>
            {activeProject ? (
              <div className="text-white font-bold flex items-center space-x-2">
                <span>{activeProject.name}</span>
                <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  {activeProject.environment}
                </span>
              </div>
            ) : (
              <div className="text-neutral-400 font-bold">— <span className="font-normal">no project selected</span></div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
            <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Account</span>
            <div className="text-white font-bold flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${currentUser ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
              <span className="truncate">
                {currentUser ? (currentUser.displayName || currentUser.email || 'Guest Explorer') : 'Not signed in'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1 font-semibold">
            Active Project Ingestion API Key
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={keyView.key ?? '—'}
              aria-label="Active project ingestion API key"
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-neutral-200 focus:outline-none font-mono"
            />
            <button
              onClick={handleCopyKey}
              disabled={!keyView.key}
              className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.14] text-neutral-200 rounded-lg flex items-center space-x-1 shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/[0.08]"
            >
              {copyState === 'copied' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}</span>
            </button>
          </div>
          <p className="text-[11px] text-neutral-400 font-sans mt-1.5">
            {keyView.key ? (
              <>
                Send it in the <code className="text-amber-300">X-API-Key</code> header when posting spans to <code className="text-amber-300">/v1/ingest</code>. It authenticates the request; this version of the API does not separate spans by project.
              </>
            ) : (
              keyView.reason
            )}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/20 flex items-start space-x-2.5 text-[11px] font-sans text-neutral-200">
          <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-amber-300 font-medium">Where this is stored:</span> Firestore holds your sign-in profile and this project list (name, environment, key id and the non-secret key prefix). The ingestion key itself is not stored there: the API shows it once when the project is created, and this tab keeps it in memory only. Spans and evaluations are stored by the AgentPulse API, not in Firestore. The rules file (dashboard/firestore.rules) is in the repository but is not deployed by this app, so this page cannot confirm how access is restricted.
          </div>
        </div>
      </div>

      {/* Alert thresholds. Read-only: they are server environment variables and the
          API has no route to change them. Defaults are from backend/app/config.py
          (hallucination_threshold = 0.7, drift_threshold = 0.3); /v1/platform does
          not report the live values, so these are labelled as defaults. */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span>Alert Thresholds (set on the server)</span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-300">Grounding failure: alert when grounding risk is above</span>
              <span className="text-white font-bold">0.70 <span className="text-neutral-400 font-normal">default</span></span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Grounding is a risk: 0.0 is supported and 1.0 is unsupported, so a higher score is worse and a span raises <code className="text-neutral-200">GROUNDING_FAILURE</code> above this value. Server setting <code className="text-neutral-200">AGENTPULSE_HALLUCINATION_THRESHOLD</code>; the same value gates <code className="text-neutral-200">HIGH_HALLUCINATION_RISK</code> on overall risk.
            </p>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-300">Behavioural drift: alert when window centroid distance is above</span>
              <span className="text-white font-bold">0.30 <span className="text-neutral-400 font-normal">default</span></span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Raises <code className="text-neutral-200">DRIFT_DETECTED</code>. Server setting <code className="text-neutral-200">AGENTPULSE_DRIFT_THRESHOLD</code>.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-neutral-400 border-t border-white/[0.08] pt-3">
          Not saved here: these are environment variables on the AgentPulse server, read when it starts. The API does not report their live values, so the numbers above are the code defaults and a deployment may differ. This page cannot change them.
        </p>
      </div>

      {/* Webhook alerts. Locked: the backend never sends one. */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span>Incident Webhooks (not available)</span>
        </div>

        <div>
          <label htmlFor="incident-webhook-url" className="block text-[10px] uppercase text-neutral-400 mb-1 font-semibold">
            Slack / PagerDuty Alert URL
          </label>
          <input
            id="incident-webhook-url"
            type="text"
            disabled
            value=""
            placeholder="Not available"
            className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-neutral-200 placeholder:text-neutral-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-[11px] text-neutral-400 font-sans mt-1.5">
            Not saved: the backend has a webhook sender (<code className="text-neutral-200">AlertEngine.dispatch_webhook</code>) but no code calls it, so nothing is sent, even if <code className="text-neutral-200">AGENTPULSE_WEBHOOK_URL</code> is set on the server.
          </p>
        </div>
      </div>

      {/* Appearance is applied and remembered at once (localStorage), so there is no Save button. */}
      <div className="text-neutral-400 text-[11px] pt-2">
        {isCalmMode ? 'Calm Mode on' : 'Calm Mode off'} ·{' '}
        <strong className={textDensity === 'compact' ? 'text-cyan-300' : 'text-emerald-300'}>
          {textDensity === 'compact' ? 'Compact density (0.88x)' : 'Comfortable density (1.0x)'}
        </strong>
        <span className="text-neutral-600"> | </span>
        <span>Appearance is remembered in this browser (localStorage); the alert settings above are server-side and read-only.</span>
      </div>
    </div>
  );
};

