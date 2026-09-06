import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Activity, Bot, Cpu } from 'lucide-react';
import { Trace, Span } from '../../types';

interface ReplayViewProps {
  traces: Trace[];
  selectedTrace?: Trace;
  onSelectTrace: (trace: Trace) => void;
}

export const ReplayView: React.FC<ReplayViewProps> = ({
  traces,
  selectedTrace,
  onSelectTrace
}) => {
  const currentTrace = selectedTrace || traces[0];
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const spans = currentTrace?.spans || [];
  const activeSpan = spans[currentStepIdx] || spans[0];

  const handleNext = () => {
    if (currentStepIdx < spans.length - 1) {
      setCurrentStepIdx(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(prev => prev - 1);
    }
  };

  const handleReset = () => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  };

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Play className="w-5 h-5 text-neutral-300" />
            <span>Trace Replay & Time-Travel Debugger</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Step through execution timeline millisecond-by-millisecond to pinpoint the exact moment of hallucination or drift
          </p>
        </div>

        <select
          value={currentTrace.id}
          onChange={(e) => {
            const found = traces.find(t => t.id === e.target.value);
            if (found) {
              onSelectTrace(found);
              setCurrentStepIdx(0);
            }
          }}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
        >
          {traces.map(t => (
            <option key={t.id} value={t.id}>
              {t.id} — {t.agentName.slice(0, 24)}... ({t.status.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-6 font-mono text-xs relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="space-y-3 pb-6 border-b border-white/[0.12]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-neutral-400 uppercase text-[10px]">SPAN STEP:</span>
              <span className="text-white font-bold">{currentStepIdx + 1} / {spans.length}</span>
              <span className="text-neutral-500">({activeSpan?.name})</span>
            </div>
            <div className="text-neutral-400 text-[11px]">
              T + {activeSpan?.startOffsetMs}ms
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {spans.map((span, idx) => (
              <div
                key={span.id}
                onClick={() => setCurrentStepIdx(idx)}
                className={`h-2.5 rounded cursor-pointer transition-all ${
                  idx <= currentStepIdx
                    ? span.status === 'error'
                      ? 'bg-rose-500'
                      : span.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-neutral-200'
                    : 'bg-neutral-850 hover:bg-neutral-800'
                }`}
                title={`Step ${idx + 1}: ${span.name}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-center space-x-3 pt-2">
            <div className="flex items-center space-x-2 p-1.5 rounded-xl ios-ultra-thin-toolbar">
              <button
                onClick={handleReset}
                className="p-2 rounded-lg hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors"
                title="Reset to beginning"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={handlePrev}
                disabled={currentStepIdx === 0}
                className="p-2 rounded-lg hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
                title="Step backwards"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                disabled={currentStepIdx === spans.length - 1}
                className="p-2 rounded-lg hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
                title="Step forwards"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {activeSpan && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-neutral-500 text-[10px] uppercase block">ACTIVE SPAN EXECUTION</span>
                <h3 className="text-sm font-semibold text-white mt-0.5">{activeSpan.name}</h3>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  activeSpan.status === 'ok'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : activeSpan.status === 'warning'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {activeSpan.status}
              </span>
            </div>

            {activeSpan.prompt && (
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] uppercase">Input State:</span>
                <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-neutral-300">
                  {activeSpan.prompt}
                </div>
              </div>
            )}

            {(activeSpan.completion || activeSpan.toolOutput) && (
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] uppercase">Output State:</span>
                <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-neutral-200">
                  {activeSpan.completion || JSON.stringify(activeSpan.toolOutput, null, 2)}
                </div>
              </div>
            )}

            {activeSpan.error && (
              <div className="p-3.5 bg-rose-950/30 rounded-lg border border-rose-900/60 text-rose-300">
                <strong className="block text-[11px] uppercase">Point of Failure:</strong>
                <p className="mt-1">{activeSpan.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
