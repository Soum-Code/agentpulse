import React from 'react';

export type StatusTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'signal';

interface StatusIndicatorProps {
  tone?: StatusTone;
  label?: string;
  sublabel?: string;
  pulse?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusIndicator({
  tone = 'neutral',
  label,
  sublabel,
  pulse = false,
  size = 'md',
  className = '',
}: StatusIndicatorProps) {
  const toneClasses = {
    neutral: 'bg-ink-faint text-ink-dim border-ink-faint/30',
    ok: 'bg-state-ok text-state-ok border-state-ok/40',
    warn: 'bg-state-warn text-state-warn border-state-warn/40',
    bad: 'bg-state-bad text-state-bad border-state-bad/40',
    signal: 'bg-signal text-signal border-signal/40',
  }[tone];

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex items-center justify-center">
        <span
          className={`${dotSize} rounded-full ${toneClasses.split(' ')[0]} ${
            pulse ? 'pulse-dot' : ''
          }`}
        />
      </span>
      {label && (
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-xs font-medium text-ink tracking-tight">{label}</span>
          {sublabel && (
            <span className="text-2xs font-mono text-ink-faint uppercase">{sublabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
