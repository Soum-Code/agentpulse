import React, { useState } from 'react';
import { DollarSign, Zap, Clock, ShieldCheck, TrendingDown } from 'lucide-react';
import { AnimeInteractiveCounter } from './AnimeInteractiveCounter';
import { JUDGE_ASSUMPTIONS, VM_USD_PER_MONTH, judgeCostPerSpan, monthlyJudgeCost } from '../../lib/judgeCost';

interface CostCalculatorProps {
  palette: 'butter' | 'dark' | 'chalk';
}

export const CostCalculator: React.FC<CostCalculatorProps> = ({ palette }) => {
  const [dailySpans, setDailySpans] = useState<number>(50000); // 50k spans/day default

  const monthlySpans = dailySpans * 30;

  // An ESTIMATE from assumptions that are printed under the result (see
  // lib/judgeCost.ts): a judge prompt of 1,200 input and 80 output tokens at
  // $2.50 / $10 per 1M tokens, every span judged. The prices are assumptions,
  // not measurements.
  const monthlyLlmJudgeCost = monthlyJudgeCost(dailySpans);

  // AgentPulse pays no model tokens, only for the machine it runs on: the
  // Standard_B2als_v2 VM it is deployed on, $24.67/month (deploy/azure/README.md).
  const monthlyAgentPulseCost = VM_USD_PER_MONTH;
  const monthlySavings = Math.max(0, Math.round(monthlyLlmJudgeCost - monthlyAgentPulseCost));

  // Latency, from one 30-case comparison on one machine
  // (LLM_JUDGE_COMPARISON_REPORT.md): the cascade's median against a local
  // Qwen3-8B Q4_K_M judge on CPU. A hosted judge was not measured.
  const llmJudgeLatency = 3170; // ms, median
  const agentPulseLatency = 203; // ms, median

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
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-8 pb-8 border-b relative z-10 ${
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
              Cost estimate &amp; measured latency
            </span>
            <span className={`text-xs font-mono font-semibold ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
            }`}>
              LLM-as-a-Judge vs. Local CPU Cross-Encoder
            </span>
          </div>
          <h3 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight font-sans ${
            palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]'
          }`}>
            What judging every span with an LLM would cost
          </h3>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${
            palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>
            A common way to grade an agent&rsquo;s output is a second LLM call for every span.
            AgentPulse scores each span with two small local models, a DeBERTa NLI classifier and MiniLM embeddings,
            on the worker&rsquo;s CPU, so there are no judge tokens to pay for. The dollar figures below are an
            estimate from the assumptions printed under them.
          </p>
        </div>

        {/* Quick Savings Headline Badge - Liquid Glass Surface */}
        <div className={`p-4 rounded-2xl flex items-center space-x-4 shrink-0 relative overflow-hidden group ${
          palette === 'butter'
            ? 'bg-emerald-300 border-2 border-neutral-950 shadow-[4px_4px_0px_#000000] text-neutral-950'
            : palette === 'chalk'
            ? 'chalk-tactile-card border border-emerald-300/80 shadow-md text-neutral-900'
            : 'bg-emerald-500/15 backdrop-blur-xl border border-emerald-500/40 shadow-[0_12px_32px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.3)] text-white'
        }`}>
          <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent'}`} />
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform ${
            palette === 'butter'
              ? 'bg-neutral-950 border border-neutral-950 text-emerald-300'
              : palette === 'chalk'
              ? 'bg-emerald-100 border border-emerald-300 text-emerald-800'
              : 'bg-emerald-500/25 border border-emerald-500/50 text-emerald-300'
          }`}>
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <span className={`text-[10px] font-mono uppercase block font-bold ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-300'
            }`}>
              Estimated Monthly Difference
            </span>
            <span className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-emerald-900' : 'text-white'
            }`}>
              $<AnimeInteractiveCounter targetValue={monthlySavings} duration={500} />
              <span className={`text-xs font-sans font-normal ${
                palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
              }`}> / mo</span>
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Slider */}
      <div className="py-8 space-y-4 relative z-10">
        <div className="flex items-center justify-between">
          <label className={`text-xs sm:text-sm font-mono font-bold uppercase tracking-wider ${
            palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
          }`}>
            Agent Evaluation Spans Volume:
          </label>
          <div className="flex items-baseline space-x-2">
            <span className={`text-xl sm:text-2xl font-mono font-black ${
              palette === 'butter' ? 'text-amber-950' : palette === 'chalk' ? 'text-amber-800' : 'text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]'
            }`}>
              {dailySpans.toLocaleString()}
            </span>
            <span className={`text-xs font-mono font-semibold ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
            }`}>
              spans / day ({monthlySpans.toLocaleString()} / mo)
            </span>
          </div>
        </div>

        <div className="relative py-1">
          <input
            type="range"
            min="5000"
            max="500000"
            step="5000"
            value={dailySpans}
            onChange={(e) => setDailySpans(Number(e.target.value))}
            className={`w-full h-2.5 rounded-lg appearance-none cursor-pointer shadow-inner ${
              palette === 'butter'
                ? 'bg-neutral-200 border border-neutral-950 accent-neutral-950'
                : palette === 'chalk'
                ? 'bg-neutral-200 border border-neutral-300 accent-neutral-900'
                : 'bg-white/10 backdrop-blur-md accent-amber-400 border border-white/15'
            }`}
          />
        </div>

        <div className={`flex justify-between text-[10px] font-mono font-medium ${
          palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
        }`}>
          <span>5k spans/day (Staging)</span>
          <span className={`font-bold ${
            palette === 'butter' ? 'text-neutral-950 underline' : palette === 'chalk' ? 'text-neutral-900' : 'text-amber-300/90'
          }`}>50k spans/day (Production Swarm)</span>
          <span>500k spans/day (Enterprise Scale)</span>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2 relative z-10">
        {/* Competitor Card */}
        <div className={`p-6 rounded-2xl space-y-4 relative overflow-hidden ${
          palette === 'butter'
            ? 'bg-rose-100/90 border-2 border-neutral-950 shadow-[4px_4px_0px_#000000] text-neutral-950'
            : palette === 'chalk'
            ? 'chalk-tactile-card border border-rose-300/80 shadow-md text-neutral-900'
            : 'bg-red-950/20 backdrop-blur-xl border border-red-500/30 shadow-[0_12px_32px_rgba(239,68,68,0.1),inset_0_1px_1px_rgba(255,255,255,0.1)] text-white'
        }`}>
          <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'bg-gradient-to-r from-transparent via-red-400/50 to-transparent'}`} />
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono font-bold uppercase ${
              palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-900' : 'text-red-400'
            }`}>Generic LLM judge</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              palette === 'butter'
                ? 'bg-white text-rose-950 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>Estimate</span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className={`text-[10px] block uppercase font-semibold ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}>Estimated Monthly Judge Bill</span>
              <span className={`text-3xl font-black ${
                palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-700' : 'text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.3)]'
              }`}>
                $<AnimeInteractiveCounter targetValue={monthlyLlmJudgeCost} duration={500} />
              </span>
            </div>

            <div className={`grid grid-cols-2 gap-2 text-xs pt-2 border-t ${
              palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-rose-200' : 'border-red-500/20'
            }`}>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Median latency (Qwen3-8B)</span>
                <span className={`font-semibold flex items-center mt-0.5 ${
                  palette === 'butter' ? 'text-neutral-950 font-bold' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
                }`}>
                  <Clock className={`w-3.5 h-3.5 mr-1 ${
                    palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-600' : 'text-red-400'
                  }`} /> {llmJudgeLatency.toLocaleString()} ms
                </span>
              </div>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Same input, same score?</span>
                <span className={`font-semibold block mt-0.5 ${
                  palette === 'butter' ? 'text-rose-950 font-bold' : palette === 'chalk' ? 'text-rose-700' : 'text-red-300'
                }`}>Not guaranteed</span>
              </div>
            </div>

            <p className={`text-[11px] font-sans pt-1 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
            }`}>
              One extra model call per span. The judge benchmarked here sampled at temperature 0.7, so another seed could change its answer. A hosted API judge was not measured.
            </p>
          </div>
        </div>

        {/* AgentPulse Card */}
        <div className={`p-6 rounded-2xl space-y-4 relative overflow-hidden ${
          palette === 'butter'
            ? 'bg-emerald-100/90 border-2 border-neutral-950 shadow-[4px_4px_0px_#000000] text-neutral-950'
            : palette === 'chalk'
            ? 'chalk-tactile-card border border-emerald-300/80 shadow-md text-neutral-900'
            : 'bg-emerald-950/25 backdrop-blur-xl border border-emerald-500/45 shadow-[0_12px_32px_rgba(16,185,129,0.16),inset_0_1px_1.5px_rgba(255,255,255,0.25)] text-white'
        }`}>
          <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent'}`} />
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono font-bold uppercase flex items-center ${
              palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-900' : 'text-emerald-300'
            }`}>
              <ShieldCheck className={`w-4 h-4 mr-1.5 ${
                palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
              }`} /> AgentPulse Architecture
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
              palette === 'butter'
                ? 'bg-neutral-950 text-emerald-300 border-neutral-950'
                : palette === 'chalk'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
            }`}>
              Local CPU workers
            </span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className={`text-[10px] block uppercase font-semibold ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}>Model Token Cost</span>
              <span className={`text-3xl font-black ${
                palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-300 drop-shadow-[0_0_12px_rgba(16,185,129,0.35)]'
              }`}>
                $0.00
                <span className={`text-xs font-normal ml-2 ${
                  palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
                }`}>(+ ${monthlyAgentPulseCost}/mo for the VM)</span>
              </span>
            </div>

            <div className={`grid grid-cols-2 gap-2 text-xs pt-2 border-t ${
              palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-emerald-200' : 'border-emerald-500/25'
            }`}>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Median latency (30 cases)</span>
                <span className={`font-semibold flex items-center mt-0.5 ${
                  palette === 'butter' ? 'text-neutral-950 font-bold' : palette === 'chalk' ? 'text-neutral-900' : 'text-emerald-200'
                }`}>
                  <Zap className={`w-3.5 h-3.5 mr-1 ${
                    palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
                  }`} /> {agentPulseLatency} ms
                </span>
              </div>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Same input, same score?</span>
                <span className={`font-semibold block mt-0.5 ${
                  palette === 'butter' ? 'text-emerald-950 font-bold' : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-200'
                }`}>Same weights, same score</span>
              </div>
            </div>

            <p className={`text-[11px] font-sans pt-1 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
            }`}>
              The DeBERTa-v3 NLI classifier and MiniLM embeddings run locally on the worker&rsquo;s CPU and generate no tokens. The same input and the same model weights give the same score.
            </p>
          </div>
        </div>
      </div>

      {/* The assumptions behind every dollar and latency figure above, beside the result. */}
      <div className={`mt-6 pt-4 border-t text-[11px] font-sans leading-relaxed space-y-1 relative z-10 ${
        palette === 'butter' ? 'border-neutral-950 text-neutral-900' : palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/[0.12] text-neutral-400'
      }`}>
        <p>
          <span className="font-bold">An estimate, not a quote.</span> LLM judge: {JUDGE_ASSUMPTIONS.inputTokens.toLocaleString()} input
          + {JUDGE_ASSUMPTIONS.outputTokens} output tokens per span at ${JUDGE_ASSUMPTIONS.inputUsdPerMillion.toFixed(2)} / ${JUDGE_ASSUMPTIONS.outputUsdPerMillion.toFixed(2)} per
          1M tokens = ${judgeCostPerSpan().toFixed(4)} per span, every span judged, 30-day month. The prices are assumptions, not measurements.
        </p>
        <p>
          AgentPulse: no model tokens, one Azure Standard_B2als_v2 VM (2 vCPU, 4 GB) at ${VM_USD_PER_MONTH}/month, VM only
          (Central India retail price recorded in deploy/azure/README.md). One worker evaluated 3.9 spans/s, about 335,000 a day, on a
          16-thread dev machine and not on that VM (experiments/results/throughput_benchmark.json), so the top of the slider needs more than one worker.
        </p>
        <p>
          Latency: one comparison on 30 test cases on one machine (LLM_JUDGE_COMPARISON_REPORT.md), a small sample. The judge was a local
          Qwen3-8B Q4 model on CPU; a hosted judge was not measured.
        </p>
      </div>
    </div>
  );
};
