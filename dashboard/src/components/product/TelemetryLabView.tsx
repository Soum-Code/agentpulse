import React, { useEffect, useRef, useState } from 'react';
import { Cpu, AlertTriangle, CheckCircle2, Zap, Loader2 } from 'lucide-react';
import {
  expectedAlertChecks,
  finalWindowDistance,
  formatScore,
  isComplete,
  scoredCount,
  type ScenarioResult,
} from '../../lib/scenarioResult';

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
 * fault in each scenario is injected by the simulator; the detection is not:
 * the scores and alerts shown after a run are read back from the API once the
 * worker has stored them. A value the API does not have is shown as missing,
 * and an unreachable API is shown as an error.
 */

interface Scenario {
  id: string;
  label: string;
  /** True when the simulator injects a fault. The clean run is the control. */
  fault: boolean;
  /** Shown as EXPERIMENTAL: the signal is stored and displayed but not shown to detect anything. */
  experimental?: boolean;
  /** Only the five-agent scenarios put the query text into their spans. */
  usesQuery: boolean;
  detail: string;
  /** What the real evaluator should raise, in words. */
  fires: string;
  /** Alert types the scenario is meant to raise; each is checked against what the API returned. */
  expected: string[];
}

/** The scenarios backend/app/routers/ingest.py accepts. Anything else is
 *  rejected by the request model with a 422 before it reaches the simulator. */
const SCENARIOS: Scenario[] = [
  {
    id: 'clean',
    label: 'Clean run',
    fault: false,
    usesQuery: true,
    detail: 'Five agents, claims consistent with the retrieved sources.',
    // 0.30, not 0.50: since PR #89 a neutral-only output scores 0.3 x neutral
    // (NEUTRAL_RISK_WEIGHT, backend/app/services/grounding.py:190).
    fires:
      'Nothing should fire. Grounding scores sit near 0.30, which is the model answering "neither supported nor contradicted" (shown as Unverifiable); only a score above 0.70 raises an alert.',
    expected: [],
  },
  {
    id: 'hallucination',
    label: 'Hallucination',
    fault: true,
    usesQuery: true,
    detail:
      'The verifier reports a failure, the analyst asserts a claim the retrieved corpus does not support, and the writer repeats it.',
    // Both alerts fire on the same two spans. A local run on 2026-10-25 (four scenarios, real
    // models) stored GROUNDING_FAILURE and HIGH_HALLUCINATION_RISK for the verifier (0.971) and
    // the analyst (0.999); the old text said HIGH_HALLUCINATION_RISK was not expected.
    fires:
      'GROUNDING_FAILURE and HIGH_HALLUCINATION_RISK on the verifier and the analyst: their grounding scores are above 0.70, and so is their overall risk.',
    expected: ['GROUNDING_FAILURE', 'HIGH_HALLUCINATION_RISK'],
  },
  {
    id: 'tool_mismatch',
    label: 'Tool-claim mismatch',
    fault: true,
    usesQuery: true,
    detail: 'The retriever claims 10 papers when the tool returned 3.',
    fires:
      'TOOL_CLAIM_MISMATCH on the retriever. This check is rule-based and only compares counts written as digits with what the tool returned.',
    expected: ['TOOL_CLAIM_MISMATCH'],
  },
  {
    id: 'drift',
    label: 'Drift',
    fault: true,
    usesQuery: false,
    detail:
      'One request sends 32 spans from a dedicated demo agent, drift_demo_agent: 20 billing-support replies, then 12 replies about mountain hiking. Real agents are never touched.',
    fires:
      'DRIFT_DETECTED when the distance between the agent\'s first 20 outputs and its latest 12 passes 0.30. The distance is not available until both groups are full, so on the first ever run only the last span has one.',
    expected: ['DRIFT_DETECTED'],
  },
  {
    id: 'disagreement',
    label: 'Disagreement',
    fault: true,
    experimental: true,
    usesQuery: false,
    detail:
      'Two agents read the same sentence and state opposite results: revenue grew, revenue fell. The second agent is compared with the first.',
    fires:
      'No alert. The disagreement alert is withdrawn: with the planner agent excluded the signal measured at chance (AUC 0.457). The second agent still gets a stored score, shown below as recorded. It is not evidence that disagreement detection works.',
    expected: [],
  },
];

const POLL_MS = 2000;
const GIVE_UP_MS = 180_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TelemetryLabViewProps {
  /** Rejects if the API refused the run, so the failure can be shown here. */
  onRunScenario: (
    scenario: string,
    query: string,
  ) => Promise<{ accepted: number; failed: number; trace_id: string }>;
  /** Reads what the worker has stored for a run. Rejects if the API cannot be reached. */
  onReadResult: (traceId: string) => Promise<ScenarioResult>;
}

export const TelemetryLabView: React.FC<TelemetryLabViewProps> = ({ onRunScenario, onReadResult }) => {
  const [scenario, setScenario] = useState('tool_mismatch');
  const [query, setQuery] = useState('Advances in multimodal foundation models');
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState<{ accepted: number; failed: number; scenario: string } | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stops the polling loop if the tab is left while a run is still being scored.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selected = SCENARIOS.find((s) => s.id === scenario) ?? SCENARIOS[0];
  const shown = SCENARIOS.find((s) => s.id === sent?.scenario);

  const handleRun = async () => {
    setRunning(true);
    setSent(null);
    setResult(null);
    setGaveUp(false);
    setError(null);
    try {
      const run = await onRunScenario(scenario, query.trim() || 'Telemetry Lab run');
      setSent({ accepted: run.accepted, failed: run.failed, scenario });
      if (run.accepted === 0) {
        throw new Error('The API accepted no spans, so there is nothing to score.');
      }
      const startedAt = Date.now();
      while (mounted.current) {
        const latest = await onReadResult(run.trace_id);
        if (!mounted.current) return;
        setResult(latest);
        if (isComplete(latest)) break;
        if (Date.now() - startedAt > GIVE_UP_MS) {
          setGaveUp(true);
          break;
        }
        await sleep(POLL_MS);
      }
    } catch (err: any) {
      // fetch rejects with a TypeError when nothing answers, e.g. "Failed to fetch".
      if (mounted.current) {
        setError(
          err instanceof TypeError
            ? `Could not reach the API (${err.message}).`
            : err?.message || 'The API refused the run.',
        );
      }
    } finally {
      if (mounted.current) setRunning(false);
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
          The simulator injects a fault. The real evaluator scores it, and what you see below is read back from the API.
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

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <ScenarioBadge fault={selected.fault} />
            {selected.experimental && (
              <span className="px-2 py-0.5 rounded-md border border-amber-400/40 text-amber-300 text-[10px] uppercase font-semibold">
                Experimental
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">{selected.detail}</p>
          <p className="text-[11px] text-neutral-300 mt-2 leading-relaxed">
            <span className="text-neutral-500 uppercase text-[10px] font-semibold mr-1.5">Should fire</span>
            {selected.fires}
          </p>
        </div>

        {selected.usesQuery ? (
          <div>
            <label className="block text-[10px] uppercase text-neutral-400 mb-1.5 font-semibold">
              Query the pipeline is asked about
            </label>
            <textarea
              rows={2}
              // The API refuses a query over 500 characters (the route is public), so stop it here.
              maxLength={500}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.10] rounded-xl p-3 text-neutral-200 focus:outline-none focus:border-white/30 leading-relaxed font-mono text-xs"
            />
            <p className="text-[11px] text-neutral-400 mt-2">
              This text goes into the first spans of the run.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-neutral-400">
            This scenario uses fixed texts, so there is no query to set.
          </p>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08] gap-4">
          <div className="text-[11px] min-w-0">
            {error && (
              <span className="text-rose-400 flex items-start space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span className="break-words">{error}</span>
              </span>
            )}
            {sent && !error && (
              <span className="text-emerald-400/90 flex items-start space-x-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {sent.accepted} spans accepted
                  {sent.failed > 0 ? `, ${sent.failed} rejected` : ''}.
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
            <span>{running ? 'Running...' : 'Run scenario'}</span>
          </button>
        </div>
      </div>

      {result && shown && (
        <ScenarioOutcome scenario={shown} result={result} running={running} gaveUp={gaveUp} />
      )}
    </div>
  );
};

const ScenarioBadge: React.FC<{ fault: boolean }> = ({ fault }) =>
  fault ? (
    <span className="px-2 py-0.5 rounded-md border border-rose-400/40 text-rose-300 text-[10px] uppercase font-semibold">
      Injected fault
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-md border border-white/[0.18] text-neutral-300 text-[10px] uppercase font-semibold">
      Control, no fault injected
    </span>
  );

const ScenarioOutcome: React.FC<{
  scenario: Scenario;
  result: ScenarioResult;
  running: boolean;
  gaveUp: boolean;
}> = ({ scenario, result, running, gaveUp }) => {
  const complete = isComplete(result);
  const checks = expectedAlertChecks(scenario.expected, result);
  const missed = checks.some((c) => c.agents.length === 0);
  const showDrift = scenario.id === 'drift';
  const finalDistance = finalWindowDistance(result);
  const withDistance = result.spans.filter((s) => s.window_centroid_distance !== null).length;

  return (
    <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 font-mono text-xs max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[11px] uppercase font-semibold text-neutral-300 tracking-wider">
          Result: {scenario.label}
        </h3>
        <span className="text-[11px] text-neutral-400 flex items-center space-x-1.5">
          {running && !complete && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>
            {scoredCount(result)} of {result.spans.length} spans scored by the worker
          </span>
        </span>
      </div>

      {gaveUp && (
        <p className="text-[11px] text-amber-300">
          Stopped waiting. The worker may be stopped or behind; what follows is only what is stored so far.
        </p>
      )}

      <div className="overflow-auto max-h-80 rounded-xl border border-white/[0.08]">
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase text-neutral-500 sticky top-0 bg-[#0b0d13]">
            <tr>
              <th className="px-3 py-2 font-semibold">Agent</th>
              <th className="px-3 py-2 font-semibold">Grounding</th>
              <th className="px-3 py-2 font-semibold">Tool claim</th>
              <th className="px-3 py-2 font-semibold">Disagreement (experimental)</th>
              <th className="px-3 py-2 font-semibold">Overall</th>
              {showDrift && <th className="px-3 py-2 font-semibold">Drift distance</th>}
            </tr>
          </thead>
          <tbody className="text-neutral-200">
            {result.spans.map((s) => (
              <tr key={s.span_id} className="border-t border-white/[0.06]">
                <td className="px-3 py-1.5">{s.agent_id}</td>
                {s.evaluated ? (
                  <>
                    <td className="px-3 py-1.5">{formatScore(s.grounding_score)}</td>
                    <td className="px-3 py-1.5">{formatScore(s.tool_claim_score)}</td>
                    <td className="px-3 py-1.5">{formatScore(s.disagreement_score)}</td>
                    <td className="px-3 py-1.5">{formatScore(s.overall_risk_score)}</td>
                    {showDrift && (
                      <td className="px-3 py-1.5">{formatScore(s.window_centroid_distance)}</td>
                    )}
                  </>
                ) : (
                  <td className="px-3 py-1.5 text-neutral-500" colSpan={showDrift ? 5 : 4}>
                    not scored yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-500">
        Scores run from 0 (safe) to 1 (risky). A dash means the evaluator did not compute that score for the
        span, which is different from 0.
      </p>

      {showDrift && complete && (
        <p className="text-[11px] text-neutral-300 leading-relaxed">
          Drift distance on the final span:{' '}
          <span className="text-white font-semibold">
            {finalDistance === null ? 'not available' : finalDistance.toFixed(4)}
          </span>
          . The alert threshold is 0.30. {withDistance} of {result.spans.length} spans carry a distance; it is
          not available until the first 20 outputs and the latest 12 are both in.
        </p>
      )}

      <div className="space-y-2">
        <div className="text-[10px] uppercase text-neutral-500 font-semibold">Expected alerts</div>
        {checks.length === 0 ? (
          <p className="text-[11px] text-neutral-400">
            None. {scenario.experimental ? 'The disagreement alert is withdrawn.' : 'This run should stay quiet.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c.type} className="text-[11px]">
                <span className="text-neutral-200">{c.type}</span>{' '}
                {c.agents.length > 0 ? (
                  <span className="text-emerald-400">fired for {c.agents.join(', ')}</span>
                ) : (
                  <span className="text-amber-300">{complete ? 'not fired' : 'not fired yet'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {complete && missed && (
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            An alert type that was raised for an agent in the last 15 minutes is not raised for that agent again,
            so a repeat run can show high scores and no new alert.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase text-neutral-500 font-semibold">Alerts stored for this run</div>
        {result.alerts.length === 0 ? (
          <p className="text-[11px] text-neutral-400">
            {complete ? 'No alert was stored for this run.' : 'No alert stored yet.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {result.alerts.map((a, i) => (
              <li key={`${a.alert_type}-${a.span_id}-${i}`} className="text-[11px] text-neutral-200 break-words">
                <span className="text-rose-300">{a.severity}</span> {a.alert_type}
                <span className="text-neutral-400"> · {a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
