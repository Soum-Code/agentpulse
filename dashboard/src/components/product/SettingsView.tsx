import React, { useState } from 'react';
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
import { TextDensity, TelemetryProject } from '../../types';
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
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isCalmMode = false,
  onToggleCalmMode,
  textDensity = 'comfortable',
  onChangeTextDensity,
  currentUser,
  activeProject,
  onOpenProjectSelector,
  onOpenAuth
}) => {
  const effectiveApiKey = activeProject?.apiKey || 'ap_live_948f10283c79a8e0192df';
  const [apiKey, setApiKey] = useState(effectiveApiKey);
  const [copied, setCopied] = useState(false);
  const [groundingThreshold, setGroundingThreshold] = useState(0.85);
  const [driftSensitivity, setDriftSensitivity] = useState(0.45);
  const [slackWebhook, setSlackWebhook] = useState('https://hooks.slack.com/services/T00/B00/XXXXX');
  const [saved, setSaved] = useState(false);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            Configure investigation atmospheres, collector keys, local evaluator thresholds, and notification webhooks
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
                <span>Evaluator Engine: 100% Local CPU Architecture</span>
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
            203ms Median Latency · 0 Tokens
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[11px]">
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
            <div className="text-neutral-400 text-[10px] uppercase tracking-wider">Grounding & Contradiction Classifier</div>
            <div className="text-white font-semibold flex items-center justify-between">
              <span>cross-encoder/nli-deberta-v3-small</span>
              <span className="text-emerald-400 text-[10px]">~1.1 GB CPU</span>
            </div>
            <p className="text-neutral-400 font-sans text-[11px]">
              Classifies premise–hypothesis entailment, neutral, and contradiction probabilities. Calibrated formula: <code className="text-neutral-200">contradiction + 0.5 * neutral</code>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
            <div className="text-neutral-400 text-[10px] uppercase tracking-wider">Embedding & Drift Engine</div>
            <div className="text-white font-semibold flex items-center justify-between">
              <span>sentence-transformers/all-MiniLM-L6-v2</span>
              <span className="text-cyan-400 text-[10px]">88 MB CPU</span>
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
              Enterprise Pipeline Hardening Specification (Datadog &amp; MLflow Grade)
            </span>
            <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
              Target Architecture
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-neutral-400 text-[10px] uppercase block">Ingress &amp; Queue</span>
              <span className="text-white font-semibold block">FastAPI 202 + DuckDB WAL</span>
              <p className="text-[10px] text-neutral-400 font-sans">
                Stateless non-blocking HTTP/2 ingress gateway with durable append-only streaming queue, upgrading from single SQLite write lock.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-neutral-400 text-[10px] uppercase block">Evaluation Engine</span>
              <span className="text-white font-semibold block">Chunked Max-Contradiction</span>
              <p className="text-[10px] text-neutral-400 font-sans">
                Sliding 256-token premise windows evaluated via INT8 ONNX DeBERTa-v3 to support 32k+ token contexts on CPU in under 120ms.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-neutral-400 text-[10px] uppercase block">CI/CD Regression Shield</span>
              <span className="text-white font-semibold block">GitHub Action PR Gate</span>
              <p className="text-[10px] text-neutral-400 font-sans">
                Deterministic PR verification step blocking deployments if contradiction score exceeds 0.15 on golden benchmark datasets.
              </p>
            </div>
          </div>
        </div>
      </div>

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
                Ultra-low-contrast, soft monochromatic grayscale palette engineered for long-duration investigation sessions
              </p>
            </div>
          </div>

          {/* Master Toggle Switch */}
          <div className="flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onClick={onToggleCalmMode}
              className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none ${
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
              Vivid phosphor emeralds, high-contrast laser accents, and specular specular beams. Ideal for fast diagnostic scans.
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
              Subdued monochromatic zinc & titanium tones, dampened luminance, and minimal specular glare for reduced retinal fatigue.
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
            <span className="text-neutral-200 font-medium">Investigation Ergonomics:</span> Calm Mode dynamically dampens background brightness, shifts high-saturation warning indicators to soft-tone grayscale borders, and softens the liquid glass reflections to keep multi-hour trace waterfall analysis effortless.
          </div>
        </div>
      </div>

      {/* Text Density & Typography Scale Slider */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 relative overflow-hidden">
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
              <p className="text-neutral-400 text-[11px] mt-0.5 font-sans">
                Adjust typography scales and vertical padding across the app for enhanced telemetry density or spacious reading
              </p>
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
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono pt-1.5">
              <span className={textDensity === 'compact' ? 'text-cyan-300 font-medium' : 'text-neutral-500'}>
                0 · Compact (0.88x font · 1.34 line-height)
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
                <span className="text-[10px] text-neutral-500 font-mono">Click to toggle</span>
              )}
            </div>

            <p className="text-[11px] font-sans text-neutral-300 leading-snug">
              Decreases font scales to 0.88x and tightens line-height to 1.34. Maximizes visible trace spans and telemetry rows on laptops and split-screen investigations.
            </p>

            {/* Miniature Visual Snippet in Compact Typography */}
            <div className="p-2.5 rounded-lg bg-black/60 border border-white/[0.08] space-y-1.5 font-mono text-[10px] leading-tight">
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider flex justify-between">
                <span>Dense Telemetry Preview</span>
                <span className="text-cyan-400">+35% Row Capacity</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200 border-b border-white/[0.06] pb-1">
                <span>span:vector_search</span>
                <span className="text-emerald-400">18ms · 94 tok</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200 border-b border-white/[0.06] pb-1">
                <span>span:grounding_eval</span>
                <span className="text-emerald-400">0.96 OK</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200">
                <span>span:model_stream</span>
                <span className="text-cyan-400">312ms · 540 tok</span>
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
                <span className="text-[10px] text-neutral-500 font-mono">Click to toggle</span>
              )}
            </div>

            <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
              Standard 1.0x typography scale with 1.55 line-height and relaxed margins. Optimized for extended reading sessions, high legibility, and effortless visual tracking.
            </p>

            {/* Miniature Visual Snippet in Comfortable Typography */}
            <div className="p-2.5 rounded-lg bg-black/60 border border-white/[0.08] space-y-2 font-mono text-[11px] leading-normal">
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider flex justify-between">
                <span>Spacious Reading Preview</span>
                <span className="text-emerald-400">1.0x Baseline</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200 border-b border-white/[0.06] pb-1">
                <span>span:vector_search</span>
                <span className="text-emerald-400">18ms · 94 tok</span>
              </div>
              <div className="flex items-center justify-between text-neutral-200">
                <span>span:grounding_eval</span>
                <span className="text-emerald-400">0.96 OK</span>
              </div>
            </div>
          </div>
        </div>

        {/* Density Ergonomic Impact Callout */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 flex items-start space-x-2.5 text-[11px] font-sans text-neutral-300">
          <AlignJustify className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="text-neutral-200 font-medium">Instant Application:</span> Changing the text density slider recalibrates font sizes, line heights, and table padding throughout the application immediately—including the Overview matrix, Traces waterfall, Incident logs, and Context Inspector.
          </div>
        </div>
      </div>

      {/* Active Project & Firestore Cloud Storage */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Active Project & Firebase Telemetry Cloud</span>
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
            <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Active Telemetry Project</span>
            <div className="text-white font-bold flex items-center space-x-2">
              <span>{activeProject ? activeProject.name : 'Default Agent Project'}</span>
              <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                {activeProject ? activeProject.environment : 'Production'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
            <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Firebase User State</span>
            <div className="text-white font-bold flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${currentUser ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
              <span className="truncate">
                {currentUser ? (currentUser.displayName || currentUser.email || 'Guest Explorer') : 'Unauthenticated (Local Cache)'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1 font-semibold">
            Active Project Ingestion API Key (ap_live_*)
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={apiKey}
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-neutral-200 focus:outline-none font-mono"
            />
            <button
              onClick={handleCopyKey}
              className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.14] text-neutral-200 rounded-lg flex items-center space-x-1 shrink-0 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <p className="text-[11px] text-neutral-400 font-sans mt-1.5">
            Pass this collector key in HTTP headers (<code className="text-amber-300">X-AgentPulse-Key</code>) or SDK config to direct spans into this Firestore project.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/20 flex items-start space-x-2.5 text-[11px] font-sans text-neutral-300">
          <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-amber-300 font-medium">Firestore Isolation:</span> Documents are strictly isolated via Firebase Security Rules (<code className="text-neutral-200">request.auth.uid == resource.data.ownerId</code>). Spans and project datasets are automatically synchronized across all your browser tabs and devices.
          </div>
        </div>
      </div>

      {/* Evaluator Thresholds */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span>Online Evaluator Sensitivity</span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-300">Schema Grounding Minimum Threshold:</span>
              <span className="text-white font-bold">{groundingThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={groundingThreshold}
              onChange={(e) => setGroundingThreshold(parseFloat(e.target.value))}
              className="w-full accent-emerald-400 bg-black/50 rounded cursor-pointer"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Traces scoring below this threshold will automatically raise a schema discrepancy warning.
            </p>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-300">Behavioral Drift Alarm Level:</span>
              <span className="text-white font-bold">{driftSensitivity.toFixed(2)} Δ</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={driftSensitivity}
              onChange={(e) => setDriftSensitivity(parseFloat(e.target.value))}
              className="w-full accent-emerald-400 bg-black/50 rounded cursor-pointer"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Cluster divergence delta exceeding this value will trigger an incident alert.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Alerts */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span>Incident Webhooks</span>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1 font-semibold">
            Slack / PagerDuty Alert URL
          </label>
          <input
            type="text"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      {/* Save action */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-neutral-400 text-[11px] flex items-center space-x-2">
          <span>
            {isCalmMode ? 'Deep Zen theme' : 'Obsidian dark'} ·{' '}
            <strong className={textDensity === 'compact' ? 'text-cyan-300' : 'text-emerald-300'}>
              {textDensity === 'compact' ? 'Compact density (0.88x)' : 'Comfortable density (1.0x)'}
            </strong>
          </span>
          <span className="text-neutral-600 hidden sm:inline">|</span>
          <span className="text-neutral-500 hidden sm:inline">Preferences automatically synced</span>
        </div>
        <div className="flex items-center space-x-3">
          {saved && <span className="text-emerald-400 font-medium">Settings saved successfully!</span>}
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-semibold rounded-lg transition-colors shadow-sm active:scale-95"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

