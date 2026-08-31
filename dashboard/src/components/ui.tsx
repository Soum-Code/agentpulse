import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Search, X, Sparkles } from 'lucide-react';

// ─── Risk Classifier ──────────────────────────────────────────────
export type RiskTone = 'ok' | 'warn' | 'bad' | 'crit';

export function riskTone(score: number | null | undefined): RiskTone {
  if (score === null || score === undefined) return 'ok';
  if (score > 0.85) return 'crit';
  if (score > 0.7) return 'bad';
  if (score > 0.4) return 'warn';
  return 'ok';
}

export function riskToneStyles(tone: RiskTone): { text: string; bg: string; border: string; dot: string; glow: string; shadow: string } {
  switch (tone) {
    case 'crit':
      return {
        text: 'text-rose-300',
        bg: 'bg-rose-950/80',
        border: 'border-rose-500',
        dot: 'bg-rose-500',
        glow: 'shadow-[0_0_12px_rgba(255,23,68,0.4)]',
        shadow: 'shadow-comic-pink',
      };
    case 'bad':
      return {
        text: 'text-pink-300',
        bg: 'bg-pink-950/80',
        border: 'border-pink-500',
        dot: 'bg-pink-400',
        glow: 'shadow-[0_0_10px_rgba(255,51,102,0.35)]',
        shadow: 'shadow-comic-pink',
      };
    case 'warn':
      return {
        text: 'text-amber-300',
        bg: 'bg-amber-950/80',
        border: 'border-amber-400',
        dot: 'bg-amber-400',
        glow: 'shadow-[0_0_10px_rgba(255,230,0,0.35)]',
        shadow: 'shadow-comic-yellow',
      };
    case 'ok':
    default:
      return {
        text: 'text-emerald-300',
        bg: 'bg-emerald-950/80',
        border: 'border-emerald-400',
        dot: 'bg-emerald-400',
        glow: 'shadow-[0_0_10px_rgba(0,230,118,0.35)]',
        shadow: 'shadow-comic-green',
      };
  }
}

// ─── Tile Container Primitive ─────────────────────────────────────
interface TileProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  bracket?: boolean;
  interactive?: boolean;
  glass?: boolean;
  accent?: 'yellow' | 'cyan' | 'pink' | 'green' | 'purple' | 'orange';
}

export function Tile({ children, className = '', bracket = false, interactive = false, glass = false, accent, ...props }: TileProps) {
  let accentBorder = 'border-white/15';
  let accentShadow = 'shadow-comic';
  if (accent === 'yellow') { accentBorder = 'border-yellow-400/40'; accentShadow = 'shadow-comic'; }
  if (accent === 'cyan') { accentBorder = 'border-cyan-400/40'; accentShadow = 'shadow-comic'; }
  if (accent === 'pink') { accentBorder = 'border-pink-500/40'; accentShadow = 'shadow-comic'; }
  if (accent === 'green') { accentBorder = 'border-emerald-400/40'; accentShadow = 'shadow-comic'; }
  if (accent === 'purple') { accentBorder = 'border-purple-400/40'; accentShadow = 'shadow-comic'; }
  if (accent === 'orange') { accentBorder = 'border-orange-400/40'; accentShadow = 'shadow-comic'; }

  return (
    <div
      className={`relative rounded-2xl border-2 bg-surface-2 transition-all duration-150 ${accentBorder} ${accentShadow} ${
        interactive
          ? 'comic-panel-interactive hover:border-white/40 hover:bg-surface-3'
          : ''
      } ${bracket ? 'border-yellow-400 shadow-comic-yellow' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Stat Readout Primitive ───────────────────────────────────────
interface StatProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: { direction: 'up' | 'down' | 'neutral'; text: string };
  tone?: RiskTone;
  icon?: React.ComponentType<{ className?: string }>;
  sparklineData?: number[];
  accent?: 'yellow' | 'cyan' | 'pink' | 'green' | 'purple' | 'orange';
}

export function Stat({ label, value, subtext, trend, tone, icon: Icon, sparklineData, accent = 'yellow' }: StatProps) {
  const toneStyle = tone ? riskToneStyles(tone) : null;

  const accentTag =
    accent === 'cyan'
      ? 'bg-cyan-400 text-black border-black'
      : accent === 'pink'
      ? 'bg-pink-500 text-white border-black'
      : accent === 'green'
      ? 'bg-emerald-400 text-black border-black'
      : accent === 'purple'
      ? 'bg-purple-400 text-black border-black'
      : accent === 'orange'
      ? 'bg-orange-500 text-white border-black'
      : 'bg-yellow-400 text-black border-black';

  return (
    <Tile accent={accent} className="p-5 flex flex-col justify-between space-y-3 group hover:border-white/40">
      <div className="flex items-center justify-between">
        <span className={`text-3xs font-mono uppercase font-black px-2 py-0.5 rounded-md border shadow-[1.5px_1.5px_0px_#000] ${accentTag}`}>
          {label}
        </span>
        {Icon && <Icon className="w-4 h-4 text-neutral-400 shrink-0 group-hover:text-yellow-400 transition-colors" />}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className={`text-3xl lg:text-4xl font-extrabold font-mono tracking-tight tnum drop-shadow-[2px_2px_0px_#000] ${toneStyle ? toneStyle.text : 'text-white'}`}>
            {value}
          </div>
          {subtext && <p className="text-2xs font-mono text-neutral-400 mt-1">{subtext}</p>}
        </div>
        {sparklineData && sparklineData.length > 0 && (
          <div className="shrink-0 pt-1">
            <Sparkline data={sparklineData} width={68} height={30} tone={tone || (accent === 'pink' ? 'bad' : accent === 'green' ? 'ok' : 'signal')} />
          </div>
        )}
      </div>
      {trend && (
        <div className="flex items-center gap-1.5 text-2xs font-mono pt-1">
          <span
            className={`px-2 py-0.5 rounded-md font-bold border shadow-[1px_1px_0px_#000] ${
              trend.direction === 'up'
                ? 'bg-rose-500 text-white border-black'
                : trend.direction === 'down'
                ? 'bg-emerald-400 text-black border-black'
                : 'bg-surface-3 text-neutral-300 border-line'
            }`}
          >
            {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '●'} {trend.text}
          </span>
        </div>
      )}
    </Tile>
  );
}

// ─── Meter / Progress Bar Primitive ──────────────────────────────
interface MeterProps {
  value: number; // 0 to 1
  label?: string;
  showValue?: boolean;
  tone?: RiskTone;
  color?: string;
}

export function Meter({ value, label, showValue = true, tone, color }: MeterProps) {
  const computedTone = tone || riskTone(value);
  const styles = riskToneStyles(computedTone);
  const pct = Math.max(0, Math.min(100, value * 100));

  return (
    <div className="space-y-1.5 font-mono">
      {(label || showValue) && (
        <div className="flex justify-between text-2xs font-bold">
          {label && <span className="text-neutral-300 uppercase tracking-wider">{label}</span>}
          {showValue && <span className={`tnum ${styles.text}`}>{(value * 100).toFixed(0)}%</span>}
        </div>
      )}
      <div className="w-full h-3 rounded-full bg-surface-3 overflow-hidden p-0.5 border-2 border-black shadow-[2px_2px_0px_#000]">
        <div
          className={`h-full rounded-full transition-all duration-500 border border-black/40 ${
            color || (
              computedTone === 'crit'
                ? 'bg-rose-500'
                : computedTone === 'bad'
                ? 'bg-pink-500'
                : computedTone === 'warn'
                ? 'bg-yellow-400'
                : 'bg-emerald-400'
            )
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Risk Pill Primitive ──────────────────────────────────────────
interface RiskPillProps {
  score: number | null | undefined;
  label?: string;
  size?: 'sm' | 'md';
}

export function RiskPill({ score, label, size = 'sm' }: RiskPillProps) {
  const tone = riskTone(score);
  const styles = riskToneStyles(tone);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg font-mono border-2 border-black font-extrabold shadow-[2px_2px_0px_#000] ${styles.bg} ${styles.text} ${
        size === 'sm' ? 'px-2 py-0.5 text-3xs' : 'px-2.5 py-1 text-2xs'
      }`}
    >
      <span className={`w-2 h-2 rounded-full border border-black ${styles.dot}`} />
      {label && <span className="uppercase text-neutral-300 mr-0.5">{label}:</span>}
      <span className="tnum">{score !== null && score !== undefined ? score.toFixed(3) : '—'}</span>
    </span>
  );
}

// ─── Status Badge Primitive ───────────────────────────────────────
interface StatusBadgeProps {
  status: string;
  tone?: RiskTone | 'info' | 'neutral' | 'violet' | 'yellow' | 'orange';
}

export function StatusBadge({ status, tone = 'neutral' }: StatusBadgeProps) {
  let colorStyles = 'bg-surface-3 text-neutral-300 border-black';
  if (tone === 'ok') colorStyles = 'bg-emerald-400 text-black border-black';
  if (tone === 'warn' || tone === 'yellow') colorStyles = 'bg-yellow-400 text-black border-black';
  if (tone === 'orange') colorStyles = 'bg-orange-500 text-white border-black';
  if (tone === 'bad' || tone === 'crit') colorStyles = 'bg-pink-500 text-white border-black';
  if (tone === 'info') colorStyles = 'bg-cyan-400 text-black border-black';
  if (tone === 'violet') colorStyles = 'bg-purple-400 text-black border-black';

  return (
    <span className={`comic-tag ${colorStyles}`}>
      {status}
    </span>
  );
}

// ─── Sparkline Primitive ──────────────────────────────────────────
interface SparklineProps {
  data: number[];
  height?: number;
  width?: number;
  tone?: RiskTone | 'signal' | 'violet' | 'cyan' | 'pink';
}

export function Sparkline({ data, height = 26, width = 80, tone = 'ok' }: SparklineProps) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = (idx / Math.max(1, data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  const strokeColor =
    tone === 'bad' || tone === 'crit' || tone === 'pink'
      ? '#ff3366'
      : tone === 'warn'
      ? '#ffe600'
      : tone === 'signal'
      ? '#ffe600'
      : tone === 'cyan'
      ? '#00e5ff'
      : tone === 'violet'
      ? '#a855f7'
      : '#00e676';

  return (
    <svg width={width} height={height} className="overflow-visible filter drop-shadow-[1px_1px_0px_#000]">
      <polyline fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ─── Filter Chip Primitive ─────────────────────────────────────────
interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  tone?: RiskTone | 'signal' | 'neutral' | 'cyan' | 'pink' | 'green';
  icon?: React.ComponentType<{ className?: string }>;
}

export function FilterChip({ label, active, onClick, count, tone = 'signal', icon: Icon }: FilterChipProps) {
  let activeStyles = 'bg-yellow-400 text-black border-black shadow-[3px_3px_0px_#000]';
  if (tone === 'pink' || tone === 'bad') activeStyles = 'bg-pink-500 text-white border-black shadow-[3px_3px_0px_#000]';
  if (tone === 'cyan') activeStyles = 'bg-cyan-400 text-black border-black shadow-[3px_3px_0px_#000]';
  if (tone === 'green' || tone === 'ok') activeStyles = 'bg-emerald-400 text-black border-black shadow-[3px_3px_0px_#000]';
  if (tone === 'warn') activeStyles = 'bg-amber-400 text-black border-black shadow-[3px_3px_0px_#000]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-2xs font-mono font-bold border-2 transition-all cursor-pointer select-none active:translate-x-0.5 active:translate-y-0.5 ${
        active
          ? activeStyles
          : 'bg-surface border-line text-neutral-300 hover:text-white hover:border-white/30 hover:bg-surface-2 shadow-[2px_2px_0px_#000]'
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`ml-1 px-1.5 py-0.2 rounded-md text-3xs font-black border border-black ${
            active ? 'bg-black text-white' : 'bg-surface-3 text-neutral-300'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Search Input Primitive ───────────────────────────────────────
interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  onClear?: () => void;
  shortcut?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', onClear, shortcut = '/', className = '' }: SearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3.5 w-4 h-4 text-neutral-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-2 border-2 border-black focus:border-yellow-400 rounded-xl pl-10 pr-12 py-2.5 text-xs font-mono text-white placeholder-neutral-500 shadow-[3px_3px_0px_#000] focus:shadow-[4px_4px_0px_#ffe600] transition-all"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute right-3.5 text-neutral-400 hover:text-white cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : shortcut ? (
        <span className="absolute right-3 px-2 py-0.5 rounded-md bg-surface border border-black text-3xs font-mono font-bold text-neutral-300 pointer-events-none shadow-[1px_1px_0px_#000]">
          {shortcut}
        </span>
      ) : null}
    </div>
  );
}

// ─── SIGNATURE OSCILLOSCOPE WAVEFORM PRIMITIVE ────────────────────
interface WaveformProps {
  data: number[];
  height?: number;
  title?: string;
  mode?: 'risk' | 'grounding' | 'latency';
}

export function Waveform({ data, height = 135, title = 'LIVE SWARM TELEMETRY SIGNAL WAVEFORM', mode = 'risk' }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [activeSignalMode, setActiveSignalMode] = useState<string>(mode);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let gridOffset = 0;
    let isHidden = document.visibilityState === 'hidden';

    const handleVisibilityChange = () => {
      isHidden = document.visibilityState === 'hidden';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(container);

    const render = () => {
      if (isHidden) {
        animId = requestAnimationFrame(render);
        return;
      }

      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (w === 0 || h === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Comic dark background
      ctx.fillStyle = '#141b2d';
      ctx.fillRect(0, 0, w, h);

      // Comic Halftone Dot Grid on Canvas
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      const dotSpacing = 20;
      for (let x = 0; x < w; x += dotSpacing) {
        for (let y = 0; y < h; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Horizontal Comic Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      const gridRows = 4;
      for (let i = 1; i < gridRows; i++) {
        const y = (h / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Points array
      const points = data.length > 0 ? data : [0.08, 0.14, 0.1, 0.22, 0.18, 0.32, 0.25, 0.42, 0.28, 0.22];
      const step = w / Math.max(1, points.length - 1);

      // Latest tone derivation
      const latestVal = points[points.length - 1] ?? 0;
      const latestTone = riskTone(latestVal);
      const strokeColor =
        latestTone === 'bad' || latestTone === 'crit'
          ? '#ff3366'
          : latestTone === 'warn'
          ? '#ffe600'
          : activeSignalMode === 'grounding'
          ? '#00e5ff'
          : '#00e676';

      // Fill Gradient under curve
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      const startFillColor =
        latestTone === 'bad' || latestTone === 'crit'
          ? 'rgba(255, 51, 102, 0.25)'
          : latestTone === 'warn'
          ? 'rgba(255, 230, 0, 0.25)'
          : activeSignalMode === 'grounding'
          ? 'rgba(0, 229, 255, 0.25)'
          : 'rgba(0, 230, 118, 0.25)';

      gradient.addColorStop(0, startFillColor);
      gradient.addColorStop(1, 'rgba(20, 27, 45, 0.0)');

      ctx.beginPath();
      ctx.moveTo(0, h);
      points.forEach((val, i) => {
        const x = i * step;
        const y = h - Math.max(0, Math.min(1, val)) * (h - 24) - 12;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Main Comic Trace Line (Bold & crisp with black shadow)
      ctx.beginPath();
      points.forEach((val, i) => {
        const x = i * step;
        const y = h - Math.max(0, Math.min(1, val)) * (h - 24) - 12;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3.0;
      ctx.stroke();

      // Leading Point Comic Pulse Dot
      if (points.length > 0) {
        const lastX = (points.length - 1) * step;
        const lastY = h - Math.max(0, Math.min(1, latestVal)) * (h - 24) - 12;

        ctx.beginPath();
        ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
      if (animId) cancelAnimationFrame(animId);
    };
  }, [data, height, prefersReducedMotion, activeSignalMode]);

  const latestValue = data.length > 0 ? data[data.length - 1] : 0;
  const tone = riskTone(latestValue);
  const styles = riskToneStyles(tone);

  return (
    <Tile accent="yellow" className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-yellow-400 border border-black animate-pulse" />
          <span className="text-xs font-mono uppercase font-black text-white tracking-wider flex items-center gap-1.5">
            <span>{title}</span>
            <span className="comic-tag bg-yellow-400 text-black">LIVE</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Signal Mode Selectors */}
          <div className="flex items-center gap-1 text-3xs font-mono bg-surface p-1 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000]">
            <button
              onClick={() => setActiveSignalMode('risk')}
              className={`px-3 py-1 rounded-lg font-extrabold cursor-pointer transition-all ${
                activeSignalMode === 'risk' ? 'bg-yellow-400 text-black border border-black shadow-[1.5px_1.5px_0px_#000]' : 'text-neutral-400 hover:text-white'
              }`}
            >
              RISK PULSE
            </button>
            <button
              onClick={() => setActiveSignalMode('grounding')}
              className={`px-3 py-1 rounded-lg font-extrabold cursor-pointer transition-all ${
                activeSignalMode === 'grounding' ? 'bg-cyan-400 text-black border border-black shadow-[1.5px_1.5px_0px_#000]' : 'text-neutral-400 hover:text-white'
              }`}
            >
              GROUNDING
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-2xs">
            <span className="text-neutral-400 font-bold uppercase">READOUT:</span>
            <span className={`px-2.5 py-0.5 rounded-lg font-black border-2 border-black tnum shadow-[2px_2px_0px_#000] ${styles.bg} ${styles.text}`}>
              {latestValue.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full overflow-hidden rounded-xl border-2 border-black shadow-[3px_3px_0px_#000]" style={{ height: `${height}px` }}>
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </Tile>
  );
}

// ─── Empty State Primitive ────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="p-8 rounded-2xl bg-surface-2 border-2 border-black shadow-comic text-center flex flex-col items-center justify-center space-y-3">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-yellow-400 border-2 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center">
          <Icon className="w-6 h-6 text-black shrink-0" />
        </div>
      )}
      <div className="space-y-1">
        <h4 className="text-sm font-black text-white font-mono uppercase tracking-wider">{title}</h4>
        <p className="text-2xs font-mono text-neutral-300 max-w-sm">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 comic-btn-yellow px-4 py-2 text-xs font-mono"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

