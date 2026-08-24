import { useEffect, useRef, useState, type ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Eases a numeric readout to its new value so live updates read as motion, not jumps. */
export function useCountUp(target: number | null | undefined, duration = 520) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(target ?? 0);
  const fromRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (target === null || target === undefined) return;

    // requestAnimationFrame is suspended for hidden/background tabs in every
    // major browser (to save resources), which would otherwise leave this
    // readout frozen at its initial value for as long as the dashboard tab
    // isn't focused -- a real problem for a monitoring tool commonly left
    // open in a background tab. Skip the animation in that case too, same
    // as the reduced-motion path.
    if (reduced || document.visibilityState === 'hidden') {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const delta = target - from;
    if (Math.abs(delta) < 1e-6) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + delta * eased;
      setDisplay(value);
      fromRef.current = value;
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, reduced]);

  return target === null || target === undefined ? null : display;
}

/* ─── Risk semantics ──────────────────────────────────────────────────
   Thresholds mirror EvaluationPipeline._classify_risk in the backend so
   the dashboard never disagrees with the stored label.                  */

export type RiskTone = 'ok' | 'warn' | 'bad';

export function riskTone(score: number): RiskTone {
  if (score > 0.7) return 'bad';
  if (score > 0.4) return 'warn';
  return 'ok';
}

const TONE: Record<RiskTone, { text: string; bg: string; border: string; dot: string }> = {
  ok:   { text: 'text-state-ok',   bg: 'bg-state-ok/10',   border: 'border-state-ok/25',   dot: 'bg-state-ok' },
  warn: { text: 'text-state-warn', bg: 'bg-state-warn/10', border: 'border-state-warn/25', dot: 'bg-state-warn' },
  bad:  { text: 'text-state-bad',  bg: 'bg-state-bad/10',  border: 'border-state-bad/25',  dot: 'bg-state-bad' },
};

/* ─── Surface ─────────────────────────────────────────────────────────── */

export function Tile({
  children, className, active, hover = true, bracket = false, index,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  hover?: boolean;
  bracket?: boolean;
  index?: number;
}) {
  return (
    <div
      className={cx(
        'tile rise',
        bracket && 'bracket',
        hover && 'tile-hover',
        active && 'tile-active bracket-on',
        className,
      )}
      style={index !== undefined ? ({ ['--i' as string]: index } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('text-2xs font-mono uppercase tracking-[0.14em] text-ink-faint', className)}>
      {children}
    </span>
  );
}

export function TileHead({
  label, right, className,
}: { label: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line', className)}>
      <Eyebrow>{label}</Eyebrow>
      {right}
    </div>
  );
}

export function SectionHead({
  title, sub, right,
}: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <p className="text-xs text-ink-dim mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/* ─── Status and risk ─────────────────────────────────────────────────── */

export function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const map: Record<string, { tone: RiskTone; text: string; live?: boolean }> = {
    healthy: { tone: 'ok', text: 'HEALTHY' },
    success: { tone: 'ok', text: 'SUCCESS' },
    watch:   { tone: 'warn', text: 'WATCH' },
    running: { tone: 'warn', text: 'RUNNING', live: true },
  };
  const cfg = map[s] ?? { tone: 'bad' as RiskTone, text: s ? s.toUpperCase() : 'CRITICAL', live: true };
  const t = TONE[cfg.tone];

  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-2xs font-mono font-medium',
      t.bg, t.text, t.border,
    )}>
      <span className={cx('w-1.5 h-1.5 rounded-full', t.dot, cfg.live && 'live-dot')} />
      {cfg.text}
    </span>
  );
}

export function RiskPill({ score, label }: { score: number | null | undefined; label?: string }) {
  if (score === null || score === undefined) {
    return <span className="font-mono text-xs text-ink-faint">&mdash;</span>;
  }
  const t = TONE[riskTone(score)];
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono font-medium tnum',
      t.bg, t.text, t.border,
    )}>
      {score.toFixed(3)}
      {label && <span className="text-2xs text-ink-faint uppercase">{label}</span>}
    </span>
  );
}

/** Thin horizontal readout. Deliberately not a chunky progress bar — this
 *  is a gauge, and the value is always shown numerically alongside it. */
export function Meter({
  value, tone, className,
}: { value: number; tone?: RiskTone; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const t = TONE[tone ?? riskTone(value)];
  return (
    <div className={cx('h-1 w-full rounded-full bg-surface-3 overflow-hidden', className)}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', t.dot)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ─── Metric readout ──────────────────────────────────────────────────── */

export function Stat({
  label, value, unit, decimals = 0, tone, foot, index,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  tone?: RiskTone;
  foot?: ReactNode;
  index?: number;
}) {
  const animated = useCountUp(value);
  const toneCls = tone ? TONE[tone].text : 'text-ink';

  return (
    <Tile className="p-4" index={index}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className={cx('font-mono text-4xl font-bold tnum leading-none tracking-tight', toneCls)}>
          {animated === null ? '—' : animated.toFixed(decimals)}
        </span>
        {unit && <span className="text-xs text-ink-faint font-mono">{unit}</span>}
      </div>
      {foot && <div className="mt-3">{foot}</div>}
    </Tile>
  );
}

/* ─── Waveform ────────────────────────────────────────────────────────
   The signature element: composite risk plotted as a live trace rather
   than a static number, styled like an instrument readout (oscilloscope
   / seismograph) rather than a decorative chart. This is the one place
   in the interface that earns a heavier visual treatment (glow) — it is
   the dashboard's actual vital-signs monitor. */

export function Waveform({
  points, height = 84, label = 'Composite risk',
}: { points: number[]; height?: number; label?: string }) {
  if (points.length < 2) {
    return (
      <div className="waveform-panel p-4" style={{ minHeight: height + 40 }}>
        <Eyebrow>{label}</Eyebrow>
        <div className="flex items-center justify-center text-xs text-ink-faint" style={{ height }}>
          Awaiting data
        </div>
      </div>
    );
  }

  const w = 400;
  const pad = 6;
  const plotH = height - pad * 2;
  const latest = points[points.length - 1];
  const tone = riskTone(latest);
  const t = TONE[tone];
  const strokeColor = { ok: '#34d399', warn: '#fbbf24', bad: '#fb7185' }[tone];
  const gradId = `waveform-fade-${tone}`;
  const areaId = `waveform-area-${tone}`;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = pad + plotH - Math.max(0, Math.min(1, p)) * plotH;
    return [x, y] as const;
  });
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <div className="waveform-panel p-4">
      <div className="flex items-center justify-between mb-1.5">
        <Eyebrow>{label}</Eyebrow>
        <span className={cx('font-mono text-sm font-semibold tnum', t.text)}>{latest.toFixed(3)}</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${label} trend over recent spans, current value ${latest.toFixed(3)}, ${tone === 'bad' ? 'critical' : tone === 'warn' ? 'elevated' : 'healthy'}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0" />
            <stop offset="65%" stopColor={strokeColor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="1" />
          </linearGradient>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.16" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${areaId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={`url(#${gradId})`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <circle cx={lastX} cy={lastY} r="3" fill={strokeColor} stroke="var(--void)" strokeWidth="1.5" className="waveform-lead" style={{ color: strokeColor }} />
      </svg>
    </div>
  );
}

/* ─── Sparkline ───────────────────────────────────────────────────────── */

export function Sparkline({
  points, tone = 'ok', height = 28,
}: { points: number[]; tone?: RiskTone; height?: number }) {
  if (points.length < 2) return <div style={{ height }} />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const w = 100;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = height - ((p - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const stroke = { ok: '#34d399', warn: '#fbbf24', bad: '#fb7185' }[tone];

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ─── States ──────────────────────────────────────────────────────────── */

export function EmptyState({
  icon, title, hint,
}: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      {icon && <div className="text-ink-faint mb-3" aria-hidden="true">{icon}</div>}
      <p className="text-sm text-ink-dim">{title}</p>
      {hint && <p className="text-xs text-ink-faint mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded bg-surface-3', className)} />;
}
