import React, { useState } from 'react';
import { FlaskConical, Play, ArrowRight, CheckCircle2, ChevronRight, Sparkles, Sliders } from 'lucide-react';
import { Experiment, Dataset } from '../../types';

interface ExperimentsViewProps {
  experiments: Experiment[];
  datasets: Dataset[];
  onRunNewExperiment?: () => void;
}

export const ExperimentsView: React.FC<ExperimentsViewProps> = ({
  experiments,
  datasets
}) => {
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const selectedExp = experiments.find(e => e.id === selectedExpId) ?? experiments[0];
  const [isRunningSim, setIsRunningSim] = useState(false);

  const handleTriggerExperiment = () => {
    setIsRunningSim(true);
    setTimeout(() => {
      setIsRunningSim(false);
    }, 1800);
  };

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <FlaskConical className="w-5 h-5 text-neutral-300" />
            <span>Candidate Evaluation & Experiments</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Braintrust & Langfuse loop: Test candidate models & hardened system prompts against golden benchmark datasets
          </p>
        </div>

        <button
          onClick={handleTriggerExperiment}
          disabled={isRunningSim}
          className="px-4 py-2 bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-mono font-semibold rounded-lg flex items-center space-x-2 transition-colors shrink-0 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isRunningSim ? 'Running Benchmark Matrix...' : 'Run Experiment Batch'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-3">
          {experiments.map((exp) => {
            const isSelected = selectedExp.id === exp.id;

            return (
              <div
                key={exp.id}
                onClick={() => setSelectedExpId(exp.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                  isSelected
                    ? 'bg-neutral-850 border-neutral-500 shadow-md'
                    : 'surface-solid text-neutral-300 hover:bg-neutral-850 surface-hover'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-400 font-semibold">{exp.id}</span>
                  <span className="text-emerald-400 font-bold">{exp.winRate != null ? `+${exp.winRate}% Win Rate` : "win rate not recorded"}</span>
                </div>

                <div className="text-xs font-semibold text-white font-mono">
                  {exp.name}
                </div>

                <div className="text-[11px] font-mono text-neutral-400">
                  Dataset: <span className="text-neutral-300">{exp.datasetName}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-neutral-800/80">
                  <span>Baseline: {exp.baselineScore != null ? `${(exp.baselineScore * 100).toFixed(0)}%` : String.fromCharCode(8212)}</span>
                  <ArrowRight className="w-3 h-3 text-neutral-500" />
                  <span className="text-emerald-400 font-semibold">Candidate: {exp.candidateScore != null ? `${(exp.candidateScore * 100).toFixed(0)}%` : String.fromCharCode(8212)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {selectedExp && (
          <div className="lg:col-span-7 surface-solid rounded-xl border border-neutral-800 overflow-hidden font-mono text-xs">
            <div className="glass-floating px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase text-neutral-400 tracking-wider block">
                  EXPERIMENT RESULTS & DIFF INSPECTOR
                </span>
                <h3 className="text-sm font-semibold text-white mt-0.5">
                  {selectedExp.name}
                </h3>
              </div>
              <span className="text-xs text-neutral-400">
                {selectedExp.runCount != null ? `${selectedExp.runCount} items evaluated` : "item count not recorded"}
              </span>
            </div>

            <div className="p-6 space-y-6 bg-[#121316]">
              <div>
                <span className="text-neutral-400 uppercase tracking-wider text-[10px] block mb-2">
                  Applied Evaluators ({selectedExp.evaluators.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedExp.evaluators.map(ev => (
                    <span key={ev} className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs">
                      ✓ {ev}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <span className="text-neutral-400 uppercase tracking-wider text-[10px] block font-semibold">
                  Evaluator Findings
                </span>
                <p className="text-neutral-300 leading-relaxed text-xs">
                  {selectedExp.insights}
                </p>
              </div>

              <div className="space-y-4">
                <span className="text-neutral-400 uppercase tracking-wider text-[10px] block">
                  Benchmark Item Side-by-Side Diff
                </span>

                {(selectedExp.comparisonDiffs ?? []).map((diff, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                    <div className="text-neutral-400 text-[11px]">
                      <strong className="text-white">Query Input:</strong> "{diff.input}"
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 rounded bg-rose-950/20 border border-rose-900/40 text-rose-200">
                        <div className="flex justify-between text-[10px] uppercase text-rose-400 mb-1">
                          <span>Baseline Run</span>
                          <span>Score: {(diff.baselineScore * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-[11px] font-mono leading-relaxed">{diff.baselineOutput}</p>
                      </div>

                      <div className="p-3 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-200">
                        <div className="flex justify-between text-[10px] uppercase text-emerald-400 mb-1">
                          <span>Candidate Prompt v2</span>
                          <span>Score: {(diff.candidateScore * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-[11px] font-mono leading-relaxed">{diff.candidateOutput}</p>
                      </div>
                    </div>

                    <div className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-850">
                      <span className="text-neutral-500">Evaluator Note: </span>
                      <span>{diff.evaluatorNotes}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
