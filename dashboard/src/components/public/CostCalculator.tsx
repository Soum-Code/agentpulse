import React, { useState } from 'react';
import { DollarSign, Zap, Clock, ShieldCheck, TrendingDown } from 'lucide-react';
import { AnimeInteractiveCounter } from './AnimeInteractiveCounter';

interface CostCalculatorProps {
  palette: 'butter' | 'dark' | 'chalk';
}

export const CostCalculator: React.FC<CostCalculatorProps> = ({ palette }) => {
  const [dailySpans, setDailySpans] = useState<number>(50000); // 50k spans/day default

  const monthlySpans = dailySpans * 30;
  
  // Assuming standard LLM Judge cost (e.g. GPT-4o-mini or GPT-4o evaluation prompt)
  // Input: 1200 tokens (context + hypothesis + instructions), Output: 80 tokens
  // At $2.50 / 1M input tokens + $10 / 1M output tokens = ~$0.0038 per evaluation span
  const costPerLlmJudgeSpan = 0.0038;
  const monthlyLlmJudgeCost = Math.round(monthlySpans * costPerLlmJudgeSpan);
  
  // AgentPulse ONNX Local CPU cost: $0.00 model token fees
  // 1 small standard cloud VM (2 vCPU, 4GB RAM e.g. Azure B2s or AWS t3.medium) = ~$32/month fixed
  const monthlyAgentPulseCost = 32;
  const monthlySavings = Math.max(0, monthlyLlmJudgeCost - monthlyAgentPulseCost);

  // Latency comparison
  const llmJudgeLatency = 1450; // ms (network roundtrip + LLM generation)
  const agentPulseLatency = 58;  // ms (quantized ONNX CPU)

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
              ROI &amp; Latency Benchmark
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
            Stop paying $3,000+/mo to judge $50 of LLM calls
          </h3>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${
            palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>
            Platforms like LangSmith and Arize Phoenix rely on secondary LLM API calls to evaluate every agent step.
            AgentPulse uses quantized local DeBERTa &amp; MiniLM models running on existing CPU workers at zero token cost.
          </p>
        </div>

        {/* Quick Savings Headline Badge - Liquid Glass Surface */}
        <div className={`p-4 rounded-2xl flex items-center space-x-4 shrink-0 relative overflow-hidden group ${
          palette === 'butter'
            ? 'bg-emerald-300 border-2 border-neutral-950 shadow-[4px_4px_0px_#000000] text-neutral-950'
            : palette === 'chalk'
            ? 'bg-emerald-50 border border-emerald-300 shadow-sm text-neutral-900'
            : 'bg-emerald-500/15 backdrop-blur-xl border border-emerald-500/40 shadow-[0_12px_32px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.3)] text-white'
        }`}>
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
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
              Projected Monthly Savings
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
            ? 'bg-rose-50/80 border border-rose-200 shadow-sm text-neutral-900'
            : 'bg-red-950/20 backdrop-blur-xl border border-red-500/30 shadow-[0_12px_32px_rgba(239,68,68,0.1),inset_0_1px_1px_rgba(255,255,255,0.1)] text-white'
        }`}>
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-red-400/50 to-transparent" />
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono font-bold uppercase ${
              palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-900' : 'text-red-400'
            }`}>Legacy Approach (LangSmith / Arize Phoenix)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              palette === 'butter'
                ? 'bg-white text-rose-950 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>LLM as a Judge</span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className={`text-[10px] block uppercase font-semibold ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}>Monthly Token Judgment Bill</span>
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
                }`}>Avg Evaluation Latency</span>
                <span className={`font-semibold flex items-center mt-0.5 ${
                  palette === 'butter' ? 'text-neutral-950 font-bold' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
                }`}>
                  <Clock className={`w-3.5 h-3.5 mr-1 ${
                    palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-600' : 'text-red-400'
                  }`} /> ~{llmJudgeLatency}ms
                </span>
              </div>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Evaluation Determinism</span>
                <span className={`font-semibold block mt-0.5 ${
                  palette === 'butter' ? 'text-rose-950 font-bold' : palette === 'chalk' ? 'text-rose-700' : 'text-red-300'
                }`}>Non-deterministic</span>
              </div>
            </div>

            <p className={`text-[11px] font-sans pt-1 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
            }`}>
              Calls OpenAI/Anthropic APIs repeatedly to grade responses. Temperature variance causes identical regressions to randomly pass or fail.
            </p>
          </div>
        </div>

        {/* AgentPulse Card */}
        <div className={`p-6 rounded-2xl space-y-4 relative overflow-hidden ${
          palette === 'butter'
            ? 'bg-emerald-100/90 border-2 border-neutral-950 shadow-[4px_4px_0px_#000000] text-neutral-950'
            : palette === 'chalk'
            ? 'bg-emerald-50/80 border border-emerald-200 shadow-sm text-neutral-900'
            : 'bg-emerald-950/25 backdrop-blur-xl border border-emerald-500/45 shadow-[0_12px_32px_rgba(16,185,129,0.16),inset_0_1px_1.5px_rgba(255,255,255,0.25)] text-white'
        }`}>
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
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
              100% Local CPU Workers
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
                }`}>(${monthlyAgentPulseCost}/mo fixed server)</span>
              </span>
            </div>

            <div className={`grid grid-cols-2 gap-2 text-xs pt-2 border-t ${
              palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-emerald-200' : 'border-emerald-500/25'
            }`}>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Evaluation Latency</span>
                <span className={`font-semibold flex items-center mt-0.5 ${
                  palette === 'butter' ? 'text-neutral-950 font-bold' : palette === 'chalk' ? 'text-neutral-900' : 'text-emerald-200'
                }`}>
                  <Zap className={`w-3.5 h-3.5 mr-1 ${
                    palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
                  }`} /> ~{agentPulseLatency}ms ONNX
                </span>
              </div>
              <div>
                <span className={`text-[10px] block font-semibold ${
                  palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
                }`}>Evaluation Determinism</span>
                <span className={`font-semibold block mt-0.5 ${
                  palette === 'butter' ? 'text-emerald-950 font-bold' : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-200'
                }`}>100% Deterministic</span>
              </div>
            </div>

            <p className={`text-[11px] font-sans pt-1 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
            }`}>
              DeBERTa-v3 cross-encoder and MiniLM embeddings execute locally in worker threads. Exact same score on every run with zero token bills.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
