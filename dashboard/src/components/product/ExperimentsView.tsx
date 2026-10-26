import React, { useEffect, useState } from 'react';
import { FlaskConical, ArrowRight } from 'lucide-react';
import { Experiment, Dataset } from '../../types';
import { DASH } from '../../lib/agentFormat';

interface ExperimentsViewProps {
  experiments: Experiment[];
  datasets: Dataset[];
  onRunNewExperiment?: () => void;
}

/** A score in 0-1 as a whole percentage, or a dash when the result file did not give one.
 *  The old view printed "NaN%" for every file, because none of them exposes these fields. */
function pct(value: number | undefined): string {
  return value != null && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : DASH;
}

/** The Experiments tab: the result files under experiments/results/ (and any recorded runs),
 *  as GET /v1/experiments lists them, through toExperiments in lib/adapters.ts.
 *
 *  Fixed on 2026-10-26: `selectedExp.comparisonDiffs.map` threw on the first real entry (the
 *  adapter leaves comparisonDiffs undefined) and blanked the whole console; scores and win rate
 *  printed "NaN%" and "+% Win Rate"; and a "Run Experiment Batch" button showed a spinner for
 *  1.8 s without running anything. Experiments run offline from the scripts in experiments/. */
export const ExperimentsView: React.FC<ExperimentsViewProps> = ({
  experiments,
}) => {
  const [selectedExp, setSelectedExp] = useState<Experiment | undefined>(experiments[0]);

  // The list usually arrives after the first render (it is loaded once, after the agents),
  // so pick the first entry when it does, and drop a selection that is no longer listed.
  useEffect(() => {
    if (!selectedExp || !experiments.some((e) => e.id === selectedExp.id)) {
      setSelectedExp(experiments[0]);
    }
  }, [experiments, selectedExp]);

  const diffs = selectedExp?.comparisonDiffs ?? [];

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
              <FlaskConical className="w-5 h-5 text-neutral-300" />
              <span>Experiments</span>
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/10 border border-amber-400/30 text-amber-300 uppercase">
              From /v1/experiments
            </span>
          </div>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Result files from experiments/results, as the API lists them. Experiments are run offline from the scripts in experiments/; the console does not start them.
          </p>
        </div>
      </div>

      {experiments.length === 0 && (
        <p className="text-xs font-mono text-neutral-500">
          No experiment results are available on this instance (the deployed image does not include experiments/results).
        </p>
      )}

      {/* Grid: experiment list (left) + the selected entry (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-3">
          {experiments.map((exp) => {
            const isSelected = selectedExp?.id === exp.id;

            return (
              <div
                key={exp.id}
                onClick={() => setSelectedExp(exp)}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 anime-tab-row ${
                  isSelected
                    ? 'bg-neutral-850 border-neutral-500 shadow-md'
                    : 'surface-solid text-neutral-300 hover:bg-neutral-850 surface-hover'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-400 font-semibold truncate">{exp.name}</span>
                  {/* Win rate only when the entry has one; none of the result files does. */}
                  {exp.winRate != null && Number.isFinite(exp.winRate) && (
                    <span className="text-emerald-400 font-bold">{exp.winRate > 0 ? '+' : ''}{exp.winRate}% win rate</span>
                  )}
                </div>

                <div className="text-[11px] font-mono text-neutral-400">
                  Dataset: <span className="text-neutral-300">{exp.datasetName || DASH}</span>
                  {exp.model && <> · Model: <span className="text-neutral-300">{exp.model}</span></>}
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-neutral-800/80">
                  <span>Baseline: {pct(exp.baselineScore)}</span>
                  <ArrowRight className="w-3 h-3 text-neutral-500" />
                  <span className="text-emerald-400 font-semibold">Candidate: {pct(exp.candidateScore)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right column: the selected entry */}
        {selectedExp && (
          <div className="lg:col-span-7 surface-solid rounded-xl border border-neutral-800 overflow-hidden font-mono text-xs anime-tab-card">
            <div className="glass-floating px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase text-neutral-400 tracking-wider block">
                  EXPERIMENT RESULT
                </span>
                <h3 className="text-sm font-semibold text-white mt-0.5">
                  {selectedExp.name}
                </h3>
              </div>
              <span className="text-xs text-neutral-400">
                {selectedExp.runCount != null && Number.isFinite(selectedExp.runCount)
                  ? `${selectedExp.runCount} items evaluated`
                  : `Items evaluated: ${DASH}`}
              </span>
            </div>

            <div className="p-6 space-y-6 bg-[#121316]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-neutral-400 uppercase tracking-wider text-[10px] block">Dataset</span>
                  <span className="text-neutral-200">{selectedExp.datasetName || DASH}</span>
                </div>
                <div>
                  <span className="text-neutral-400 uppercase tracking-wider text-[10px] block">Recorded</span>
                  <span className="text-neutral-200">{selectedExp.createdAt || DASH}</span>
                </div>
              </div>

              {/* Evaluators: the API does not list them per result file, so a dash, not "(0)". */}
              <div>
                <span className="text-neutral-400 uppercase tracking-wider text-[10px] block mb-2">
                  Applied Evaluators ({selectedExp.evaluators.length || DASH})
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedExp.evaluators.length === 0 && (
                    <span className="text-neutral-600 text-xs">Not recorded for this entry</span>
                  )}
                  {selectedExp.evaluators.map(ev => (
                    <span key={ev} className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs">
                      ✓ {ev}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <span className="text-neutral-400 uppercase tracking-wider text-[10px] block font-semibold">
                  Findings
                </span>
                <p className="text-neutral-300 leading-relaxed text-xs">
                  {selectedExp.insights ?? (
                    selectedExp.sourceFile
                      ? `The figures are in experiments/results/${selectedExp.sourceFile} and the report written from it.`
                      : 'No findings recorded for this entry.'
                  )}
                </p>
              </div>

              {/* Per-item diffs only when an entry has them; none of the result files does. */}
              {diffs.length > 0 && (
                <div className="space-y-4">
                  <span className="text-neutral-400 uppercase tracking-wider text-[10px] block">
                    Benchmark Item Side-by-Side Diff
                  </span>

                  {diffs.map((diff, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                      <div className="text-neutral-400 text-[11px]">
                        <strong className="text-white">Query Input:</strong> "{diff.input}"
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <div className="p-3 rounded bg-rose-950/20 border border-rose-900/40 text-rose-200">
                          <div className="flex justify-between text-[10px] uppercase text-rose-400 mb-1">
                            <span>Baseline Run</span>
                            <span>Score: {pct(diff.baselineScore)}</span>
                          </div>
                          <p className="text-[11px] font-mono leading-relaxed">{diff.baselineOutput}</p>
                        </div>

                        <div className="p-3 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-200">
                          <div className="flex justify-between text-[10px] uppercase text-emerald-400 mb-1">
                            <span>Candidate</span>
                            <span>Score: {pct(diff.candidateScore)}</span>
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
