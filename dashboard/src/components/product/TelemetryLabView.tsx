import React, { useState } from 'react';
import { Cpu, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';

/** Runs one of the backend simulator's scenarios and reports what came back.
 *
 * This used to build a Trace object in the browser: a grounding score picked
 * per failure mode, an evaluator named "Schema Groundedness" that does not
 * exist, Math.random() for cost and tokens, and a 1.2 second setTimeout to look
 * like work. It then handed that object to a callback that expected a scenario
 * name, so POST /v1/simulate answered 422 and the error was swallowed into a
 * console.warn -- while the panel reported "Injected Trace ... into live
 * stream". It announced success it had not had, carrying numbers nothing
 * measured.
 *
 * Now the server runs the scenario and the evaluator produces the scores. The
 * only thing this component decides is which scenario and what query text.
 */

/** The scenarios backend/app/routers/ingest.py actually accepts. Anything else
 *  is rejected by the request model before it reaches the simulator. */
const SCENARIOS: { id: string; label: string; detail: string }[] = [
  {
    id: 'clean',
    label: 'Clean run',
    detail: 'Five agents, claims consistent with the retrieved sources. Nothing should fire.',
  },
  {
    id: 'hallucination',
    label: 'Hallucination',
    detail:
      'The analyst asserts a claim the retrieved corpus does not support, and the writer repeats it. Expect GROUNDING_FAILURE and HIGH_HALLUCINATION_RISK.',
  },
  {
    id: 'tool_mismatch',
    label: 'Tool-claim mismatch',
    detail:
      'The retriever claims 10 papers when the tool returned 3. Expect TOOL_CLAIM_MISMATCH. No model is consulted for this one.',
  },
  {
    id: 'drift',
    label: 'Drift',
    detail:
      'Produces the same spans as Hallucination. Drift is cumulative, so run it several times, varying the query, to move the agent away from its baseline. A sustained value needs 32 evaluated spans for that agent.',
  },
];

interface TelemetryLabViewProps {
  /** Rejects if the API refused the run, so the failure can be shown here. */
  onRunScenario: (scenario: string, query: string) => Promise<{ accepted: number; failed: number }>;
}

export const TelemetryLabView: React.FC<TelemetryLabViewProps> = ({ onRunScenario }) => {
  const [scenario, setScenario] = useState('tool_mismatch');
  const [query, setQuery] = useState('Advances in multimodal foundation models');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ accepted: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = SCENARIOS.find((s) => s.id === scenario) ?? SCENARIOS[0];

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      setResult(await onRunScenario(scenario, query.trim() || 'Telemetry Lab run'));
    } catch (err: any) {
      setError(err?.message || 'The API refused the run.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
          <Cpu className="w-5 h-5 text-neutral-400" />
          <span>Telemetry Lab</span>
        </h2>
        <p className="text-xs font-mono text-neutral-400 mt-1">
          Run a five-agent pipeline through the real evaluator and watch what it flags
        </p>
      </div>

      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-6 font-mono text-xs max-w-4xl relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1.5 font-semibold">
            Scenario
          </label>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl p-2.5 text-neutral-200 focus:outline-none focus:border-white/30"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#0b0d13] text-white">
                {s.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">{selected.detail}</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1.5 font-semibold">
            Query the pipeline is asked about
          </label>
          <textarea
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.10] rounded-xl p-3 text-neutral-200 focus:outline-none focus:border-white/30 leading-relaxed font-mono text-xs"
          />
          <p className="text-[11px] text-neutral-400 mt-2">
            This text goes into the spans, so changing it moves the embeddings the drift signal reads.
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08] gap-4">
          <div className="text-[11px] min-w-0">
            {error && (
              <span className="text-rose-400 flex items-start space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span className="break-words">{error}</span>
              </span>
            )}
            {result && !error && (
              <span className="text-emerald-400/90 flex items-start space-x-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {result.accepted} spans accepted
                  {result.failed > 0 ? `, ${result.failed} rejected` : ''}. Scoring runs in the
                  worker, so give it a moment and check Incidents.
                </span>
              </span>
            )}
          </div>

          <button
            onClick={handleRun}
            disabled={running}
            className="px-6 py-2.5 bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-semibold rounded-xl flex items-center space-x-2 transition-all shadow-md disabled:opacity-50 shrink-0"
          >
            <Zap className="w-3.5 h-3.5 text-neutral-950" />
            <span>{running ? 'Sending...' : 'Run scenario'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
