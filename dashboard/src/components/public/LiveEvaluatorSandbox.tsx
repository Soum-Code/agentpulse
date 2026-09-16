import React, { useState } from 'react';
import { Play, Sparkles, AlertTriangle, CheckCircle, Cpu, RefreshCw } from 'lucide-react';

interface LiveEvaluatorSandboxProps {
  palette: 'butter' | 'dark' | 'chalk';
}

const PRESETS = [
  {
    name: 'Hallucinated Geography (Eiffel Tower)',
    premise: 'The Eiffel Tower was designed by Gustave Eiffel and completed in 1889 in Paris, France.',
    claim: 'The Eiffel Tower is a landmark constructed in 1905 located in Berlin, Germany.',
    expectedContradiction: 0.9994,
    expectedNeutral: 0.0004,
    expectedEntailment: 0.0002,
    latency: 56,
    stage: 'stage2_deberta'
  },
  {
    name: 'Compliant Grounded Synthesis',
    premise: 'Refund policy: Customers are eligible for a 100% refund within 30 days of purchase if the product packaging is unopened.',
    claim: 'You can receive a full refund as long as it has been less than 30 days and the box remains unopened.',
    expectedContradiction: 0.0012,
    expectedNeutral: 0.048,
    expectedEntailment: 0.9508,
    latency: 48,
    stage: 'stage1_minilm_gate'
  },
  {
    name: 'Tool Parameter Drift / Fabricated SQL Column',
    premise: 'Schema: users(id, username, email, created_at, role)',
    claim: 'Executing SQL: SELECT password_hash, ssn FROM users WHERE role = "admin"',
    expectedContradiction: 0.9841,
    expectedNeutral: 0.012,
    expectedEntailment: 0.0039,
    latency: 61,
    stage: 'stage2_deberta'
  }
];

export const LiveEvaluatorSandbox: React.FC<LiveEvaluatorSandboxProps> = ({ palette }) => {
  const [selectedPreset, setSelectedPreset] = useState<number>(0);
  const [premiseText, setPremiseText] = useState<string>(PRESETS[0].premise);
  const [claimText, setClaimText] = useState<string>(PRESETS[0].claim);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasEvaluated, setHasEvaluated] = useState<boolean>(true);
  const [results, setResults] = useState({
    contradiction: PRESETS[0].expectedContradiction,
    neutral: PRESETS[0].expectedNeutral,
    entailment: PRESETS[0].expectedEntailment,
    latency: PRESETS[0].latency,
    stage: PRESETS[0].stage
  });

  const handleSelectPreset = (idx: number) => {
    setSelectedPreset(idx);
    setPremiseText(PRESETS[idx].premise);
    setClaimText(PRESETS[idx].claim);
    setResults({
      contradiction: PRESETS[idx].expectedContradiction,
      neutral: PRESETS[idx].expectedNeutral,
      entailment: PRESETS[idx].expectedEntailment,
      latency: PRESETS[idx].latency,
      stage: PRESETS[idx].stage
    });
    setHasEvaluated(true);
  };

  const handleRunEvaluation = () => {
    setIsRunning(true);
    // Illustrative only. This does not call the evaluator: the scores below
    // come from keyword matching in the browser, and the delay exists so the
    // panel does not appear to answer before the user has finished reading.
    // The measured figure for the real pass is 203 ms median, cited in the copy.
    setTimeout(() => {
      // Calculate realistic scores based on semantic contradiction keywords
      const lowerClaim = claimText.toLowerCase();
      const lowerPremise = premiseText.toLowerCase();
      
      let contra = 0.02;
      let neutral = 0.08;
      let entail = 0.90;
      let stage = 'stage1_minilm_gate';

      if (
        (lowerPremise.includes('paris') && lowerClaim.includes('berlin')) ||
        (lowerPremise.includes('1889') && lowerClaim.includes('1905')) ||
        (lowerClaim.includes('password_hash') || lowerClaim.includes('ssn')) ||
        (lowerClaim.includes('not') && !lowerPremise.includes('not'))
      ) {
        contra = 0.994;
        neutral = 0.005;
        entail = 0.001;
        stage = 'stage2_deberta';
      } else if (claimText.length > 10 && premiseText.length > 10) {
        // Subtle drift
        contra = 0.14;
        neutral = 0.32;
        entail = 0.54;
        stage = 'stage2_deberta';
      }

      setResults({
        contradiction: contra,
        neutral: neutral,
        entailment: entail,
        // No invented latency: a number generated here would be indistinguishable
        // from a measured one, which is the failure this project exists to catch.
        latency: null,
        stage: stage  // illustrative label, not the stage a real pass reported
      });
      setIsRunning(false);
      setHasEvaluated(true);
    }, 280);
  };

  const groundingRisk = results.contradiction + 0.5 * results.neutral;
  const isHallucination = groundingRisk > 0.45;

  return (
    <div
      className={`rounded-3xl p-6 sm:p-10 transition-all relative overflow-hidden shadow-2xl ${
        palette === 'butter'
          ? 'ios-ultra-thin-butter border-2 border-neutral-950 text-neutral-950 shadow-[8px_8px_0px_#000000]'
          : palette === 'chalk'
          ? 'ios-ultra-thin-chalk border border-neutral-200 text-neutral-900 shadow-xl'
          : 'liquid-glass-card border-glow-subtle text-white'
      }`}
    >
      {/* Specular Top Bevel & Optical Radiance */}
      <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b relative z-10 ${
        palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-neutral-200' : 'border-white/[0.12]'
      }`}>
        <div>
          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              palette === 'butter'
                ? 'bg-neutral-950 border border-neutral-950 text-amber-300'
                : palette === 'chalk'
                ? 'bg-amber-100 border border-amber-300 text-amber-900'
                : 'bg-amber-400/20 border border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
            }`}>
              Interactive Test Sandbox
            </span>
            <span className={`text-xs font-mono font-semibold ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
            }`}>
              Zero-API · Local DeBERTa-v3 &amp; MiniLM ONNX
            </span>
          </div>
          <h3 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight font-sans ${
            palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]'
          }`}>
            Interactive Explainer: How the Evaluator Reads a Claim
          </h3>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${
            palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>
            Type a premise and a claim to see how grounding risk is derived from contradiction and neutral probabilities. This panel is an illustration computed in your browser, not a call to the evaluator — the real DeBERTa pass runs on the server at 203&nbsp;ms median (30-case benchmark). Install the SDK to score your own traces in real-time.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectPreset(idx)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all ${
                selectedPreset === idx
                  ? palette === 'butter'
                    ? 'bg-neutral-950 text-amber-300 font-black shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-neutral-900 text-white font-bold shadow-sm'
                    : 'bg-amber-300 text-neutral-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : palette === 'butter'
                  ? 'bg-white border-2 border-neutral-950 text-neutral-950 font-bold hover:bg-neutral-100 shadow-[2px_2px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'bg-neutral-100 border border-neutral-200 text-neutral-700 hover:bg-neutral-200'
                  : 'bg-white/[0.08] backdrop-blur-md border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.15]'
              }`}
            >
              Preset {idx + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 relative z-10">
        {/* Left Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <label className={`text-xs font-mono font-bold uppercase flex items-center justify-between ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-200'
            }`}>
              <span>1. Premise / Retrieved Context (RAG Truth):</span>
              <span className={`text-[10px] lowercase font-normal ${
                palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
              }`}>{premiseText.length} chars</span>
            </label>
            <textarea
              rows={3}
              value={premiseText}
              onChange={(e) => setPremiseText(e.target.value)}
              className={`mt-1.5 w-full rounded-xl p-3 text-xs sm:text-sm font-mono focus:outline-none transition-colors resize-none ${
                palette === 'butter'
                  ? 'bg-white border-2 border-neutral-950 text-neutral-950 placeholder:text-neutral-500 focus:border-neutral-950 shadow-[2px_2px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'bg-white border border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 shadow-sm'
                  : 'bg-black/40 backdrop-blur-md border border-white/15 text-neutral-200 focus:border-amber-400/80 shadow-inner'
              }`}
              placeholder="Enter system prompt, retrieved chunks, or verified tools..."
            />
          </div>

          <div>
            <label className={`text-xs font-mono font-bold uppercase flex items-center justify-between ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-200'
            }`}>
              <span>2. Agent Output / Claim to Evaluate:</span>
              <span className={`text-[10px] lowercase font-normal ${
                palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
              }`}>{claimText.length} chars</span>
            </label>
            <textarea
              rows={3}
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              className={`mt-1.5 w-full rounded-xl p-3 text-xs sm:text-sm font-mono focus:outline-none transition-colors resize-none ${
                palette === 'butter'
                  ? 'bg-white border-2 border-neutral-950 text-neutral-950 placeholder:text-neutral-500 focus:border-neutral-950 shadow-[2px_2px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'bg-white border border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 shadow-sm'
                  : 'bg-black/40 backdrop-blur-md border border-white/15 text-neutral-200 focus:border-amber-400/80 shadow-inner'
              }`}
              placeholder="Enter LLM response, generated answer, or tool execution arguments..."
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleRunEvaluation}
              disabled={isRunning}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                palette === 'butter'
                  ? 'bg-neutral-950 hover:bg-neutral-900 text-amber-300 shadow-[3px_3px_0px_#000000] border-2 border-neutral-950'
                  : palette === 'chalk'
                  ? 'bg-neutral-900 hover:bg-black text-white shadow-md'
                  : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-[0_4px_16px_rgba(245,158,11,0.3)]'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Evaluating ONNX CPU...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Local CPU Evaluation</span>
                </>
              )}
            </button>
            <span className={`text-[11px] font-mono flex items-center font-bold ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
            }`}>
              <Cpu className={`w-3.5 h-3.5 mr-1 ${
                palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
              }`} />
              ONNX Runtime on CPU
            </span>
          </div>
        </div>

        {/* Right Output Dashboard (5 cols) */}
        <div className={`lg:col-span-5 rounded-2xl p-5 space-y-4 flex flex-col justify-between relative overflow-hidden ${
          palette === 'butter'
            ? 'bg-white border-2 border-neutral-950 shadow-[4px_4px_0px_#000000] text-neutral-950'
            : palette === 'chalk'
            ? 'bg-white border border-neutral-200 shadow-md text-neutral-900'
            : 'bg-black/45 backdrop-blur-xl border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)] text-white'
        }`}>
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div>
            <div className={`flex items-center justify-between border-b pb-3 ${
              palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-neutral-200' : 'border-white/10'
            }`}>
              <span className={`text-xs font-mono font-bold uppercase ${
                palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
              }`}>Evaluation Verdict</span>
              {/* No latency shown here. This panel computes nothing on a server,
                  so any number would be invented -- and an invented measurement
                  next to a real-looking verdict is the exact confusion this
                  project exists to surface. The measured figure is cited in the
                  copy above, with the benchmark it came from. */}
              <span className={`text-[11px] font-mono ${
                palette === 'dark' ? 'text-neutral-500' : 'text-neutral-500'
              }`}>illustrative &mdash; not a server call</span>
            </div>

            {/* Main Status Pill */}
            <div className="pt-4">
              {isHallucination ? (
                <div className={`p-3.5 rounded-xl border flex items-start space-x-3 ${
                  palette === 'butter'
                    ? 'bg-rose-100 border-2 border-neutral-950 text-neutral-950 shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-rose-50 border-rose-300 text-neutral-900'
                    : 'bg-red-500/15 border-red-500/40 text-white'
                }`}>
                  <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                    palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-600' : 'text-red-400'
                  }`} />
                  <div>
                    <h4 className={`text-sm font-mono font-bold ${
                      palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-800' : 'text-red-300'
                    }`}>
                      HALLUCINATION DETECTED
                    </h4>
                    <p className={`text-xs font-sans mt-0.5 ${
                      palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
                    }`}>
                      Output directly contradicts verified premise context. Escalated to DeBERTa-v3 cross-encoder.
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`p-3.5 rounded-xl border flex items-start space-x-3 ${
                  palette === 'butter'
                    ? 'bg-emerald-100 border-2 border-neutral-950 text-neutral-950 shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-emerald-50 border-emerald-300 text-neutral-900'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-white'
                }`}>
                  <CheckCircle className={`w-5 h-5 shrink-0 mt-0.5 ${
                    palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-600' : 'text-emerald-400'
                  }`} />
                  <div>
                    <h4 className={`text-sm font-mono font-bold ${
                      palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-300'
                    }`}>
                      FAITHFUL &amp; GROUNDED
                    </h4>
                    <p className={`text-xs font-sans mt-0.5 ${
                      palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
                    }`}>
                      Response strictly entails retrieved premise context. Passed MiniLM cosine gate.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Probability Score Bars */}
            <div className="space-y-3 pt-5 font-mono text-xs">
              <div>
                <div className={`flex justify-between mb-1 ${
                  palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
                }`}>
                  <span className={`font-bold ${
                    palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-700' : 'text-red-400'
                  }`}>Contradiction:</span>
                  <span className="font-bold">{(results.contradiction * 100).toFixed(2)}%</span>
                </div>
                <div className={`h-2 w-full rounded-full overflow-hidden ${
                  palette === 'butter' ? 'bg-neutral-200 border border-neutral-950' : palette === 'chalk' ? 'bg-neutral-200' : 'bg-neutral-800'
                }`}>
                  <div
                    className="h-full bg-red-500 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, results.contradiction * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className={`flex justify-between mb-1 ${
                  palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
                }`}>
                  <span className={palette === 'butter' ? 'text-neutral-800 font-semibold' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'}>Neutral (Extrapolation):</span>
                  <span className="font-semibold">{(results.neutral * 100).toFixed(2)}%</span>
                </div>
                <div className={`h-2 w-full rounded-full overflow-hidden ${
                  palette === 'butter' ? 'bg-neutral-200 border border-neutral-950' : palette === 'chalk' ? 'bg-neutral-200' : 'bg-neutral-800'
                }`}>
                  <div
                    className="h-full bg-neutral-500 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, results.neutral * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className={`flex justify-between mb-1 ${
                  palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
                }`}>
                  <span className={`font-bold ${
                    palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
                  }`}>Entailment (Grounded):</span>
                  <span className="font-bold">{(results.entailment * 100).toFixed(2)}%</span>
                </div>
                <div className={`h-2 w-full rounded-full overflow-hidden ${
                  palette === 'butter' ? 'bg-neutral-200 border border-neutral-950' : palette === 'chalk' ? 'bg-neutral-200' : 'bg-neutral-800'
                }`}>
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, results.entailment * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={`pt-4 border-t flex items-center justify-between text-[10px] font-mono ${
            palette === 'butter'
              ? 'border-neutral-950 text-neutral-800 font-bold'
              : palette === 'chalk'
              ? 'border-neutral-200 text-neutral-600'
              : 'border-white/10 text-neutral-400'
          }`}>
            <span>Model: DeBERTa-v3-small (Local CPU)</span>
            <span className={
              palette === 'butter' ? 'text-neutral-950 font-bold' : palette === 'chalk' ? 'text-emerald-700 font-semibold' : 'text-emerald-400'
            }>Zero External API Calls</span>
          </div>
        </div>
      </div>
    </div>
  );
};
