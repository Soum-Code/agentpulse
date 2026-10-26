import React from 'react';
import { Clock, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';
import { Datum } from '../../lib/stateModel';
import { riskBadgeClasses, riskLabel } from '../../lib/riskTone';

interface DatumDisplayProps {
  datum: Datum<any>;
  format?: 'risk' | 'latency' | 'percentage' | 'count' | 'text' | 'stage';
  className?: string;
}

/**
 * Renders any number or value of the console in exactly one of the five datum states
 * (see lib/stateModel.ts), so a figure is never silently 0, blank or invented:
 * 1. pending: requested, worker evaluating
 * 2. measured: real value
 * 3. unmeasured: em-dash "—" + tooltip reason
 * 4. unreachable: service did not answer, includes start instruction
 * 5. error: service answered with failure
 *
 * Only the measured state looks at `format`; the other four look the same for every format.
 */
export const DatumDisplay: React.FC<DatumDisplayProps> = ({
  datum,
  format = 'text',
  className = ''
}) => {
  // 1. Pending State
  if (datum.status === 'pending') {
    return (
      <span
        className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs font-mono bg-sky-950/40 text-sky-300 border border-sky-500/25 ${className}`}
        title={datum.reason || 'Evaluation in progress'}
      >
        <Clock className="w-3 h-3 animate-spin text-sky-400" />
        <span>Pending</span>
      </span>
    );
  }

  // 2. Unmeasured State (The system does not produce it: em-dash + reason)
  if (datum.status === 'unmeasured') {
    const reason = datum.reason || 'not exposed by the API yet';
    return (
      <span
        className={`group relative inline-flex items-center space-x-1 font-mono text-neutral-500 cursor-help ${className}`}
        title={reason}
      >
        <span>—</span>
        <HelpCircle className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
        <span className="sr-only">({reason})</span>
      </span>
    );
  }

  // 3. Unreachable State
  if (datum.status === 'unreachable') {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-mono bg-rose-950/50 text-rose-300 border border-rose-500/30 ${className}`}
        title={`${datum.service || 'Service'} unreachable. Run: ${datum.instruction || ''}`}
      >
        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
        <span className="truncate">Unreachable</span>
      </span>
    );
  }

  // 4. Error State
  if (datum.status === 'error') {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-mono bg-rose-950/60 text-rose-200 border border-rose-500/40 ${className}`}
        title={datum.error || 'Evaluation failed'}
      >
        <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
        <span className="truncate max-w-[120px]">{datum.error || 'Failed'}</span>
      </span>
    );
  }

  // 5. Measured State (Real number / value)
  const val = datum.value;

  if (format === 'risk') {
    // Scores are RISKS (0 safe, 1 risky); colour and wording come from riskTone.ts, never from here.
    const score = typeof val === 'number' && Number.isFinite(val) ? val : null;
    return (
      <span
        className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded font-mono text-xs border ${riskBadgeClasses(score)} ${className}`}
      >
        <span className="font-semibold tabular-nums">{score !== null ? score.toFixed(3) : '—'}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-90 font-medium">({riskLabel(score)})</span>
      </span>
    );
  }

  if (format === 'latency') {
    // One decimal under 10 ms so a 3.2 ms API call does not read as 3 ms.
    return (
      <span className={`font-mono tabular-nums text-neutral-200 ${className}`}>
        {typeof val === 'number' && Number.isFinite(val) ? `${val.toFixed(val < 10 ? 1 : 0)} ms` : '—'}
      </span>
    );
  }

  if (format === 'percentage') {
    return (
      <span className={`font-mono tabular-nums text-neutral-200 ${className}`}>
        {typeof val === 'number' && Number.isFinite(val) ? `${(val * 100).toFixed(1)}%` : '—'}
      </span>
    );
  }

  if (format === 'count') {
    // Whole numbers such as span or job counts, with thousands separators.
    return (
      <span className={`font-mono tabular-nums text-neutral-200 ${className}`}>
        {typeof val === 'number' && Number.isFinite(val) ? Math.round(val).toLocaleString('en-US') : '—'}
      </span>
    );
  }

  if (format === 'stage') {
    const isStage2 = String(val).toLowerCase() === 'stage2';
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
          isStage2
            ? 'bg-purple-950/40 text-purple-300 border-purple-500/30'
            : 'bg-neutral-900 text-neutral-400 border-white/10'
        } ${className}`}
      >
        {isStage2 ? 'Stage 2 (NLI)' : 'Stage 1 (Embedding)'}
      </span>
    );
  }

  return (
    <span className={`font-mono text-neutral-200 ${className}`}>
      {val !== undefined && val !== null ? String(val) : '—'}
    </span>
  );
};
