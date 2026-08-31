import React, { useState } from 'react';
import { DollarSign, Zap, Shield, Sparkles, TrendingDown, Clock, Cpu, Server } from 'lucide-react';

export function CostCalculator() {
  const [dailySpans, setDailySpans] = useState<number>(100000); // 100k spans/day
  const [swarmDepth, setSwarmDepth] = useState<number>(5); // 5 agents in chain
  const [llmJudgePrice, setLlmJudgePrice] = useState<number>(0.015); // $0.015 per GPT-4o judge call

  // Calculations
  const monthlySpans = dailySpans * 30;
  const traditionalMonthlyCost = monthlySpans * llmJudgePrice;
  const agentPulseMonthlyCost = 0; // 100% Free local CPU evaluation
  const annualSavings = traditionalMonthlyCost * 12;

  // Latency calculation: GPT-4o judge ~1,800ms vs AgentPulse Dual-Stage Gate ~27.8ms
  const traditionalStepLatency = 1800; // ms
  const agentPulseStepLatency = 27.8; // ms
  const latencyReductionPercent = ((traditionalStepLatency - agentPulseStepLatency) / traditionalStepLatency) * 100;
  const totalHoursSavedPerMonth = (monthlySpans * (traditionalStepLatency - agentPulseStepLatency)) / (1000 * 3600);

  return (
    <div className="w-full rounded-2xl bg-surface-2 border border-line p-6 sm:p-8 space-y-8 shadow-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-line">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span>Interactive ROI & Economic Model</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Calculate your savings: AgentPulse vs LLM-as-a-Judge.
          </h3>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mt-1">
            Traditional LLM evaluators (e.g. GPT-4o judges) bill per token and add 1.8s per span. AgentPulse evaluates continuous grounding on CPU in ~27.8ms at $0.00 infrastructure tax.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-left md:text-right shrink-0">
          <span className="text-3xs font-mono uppercase text-emerald-400 font-bold tracking-wider">
            Estimated Annual Savings
          </span>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400 mt-0.5">
            ${annualSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-4xs font-mono text-neutral-400">100% Zero-Loss On-Premise</span>
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
        {/* Slider 1: Daily Span Volume */}
        <div className="p-4 rounded-xl bg-surface border border-line space-y-3">
          <div className="flex justify-between">
            <span className="text-neutral-400 uppercase text-3xs">Daily Swarm Spans</span>
            <span className="text-white font-bold">{dailySpans.toLocaleString()} spans/day</span>
          </div>
          <input
            type="range"
            min="10000"
            max="1000000"
            step="10000"
            value={dailySpans}
            onChange={(e) => setDailySpans(Number(e.target.value))}
            className="w-full accent-indigo-500 bg-white/10 h-1.5 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-3xs text-neutral-500">
            <span>10k (Dev)</span>
            <span>500k</span>
            <span>1M (Prod)</span>
          </div>
        </div>

        {/* Slider 2: Swarm DAG Depth */}
        <div className="p-4 rounded-xl bg-surface border border-line space-y-3">
          <div className="flex justify-between">
            <span className="text-neutral-400 uppercase text-3xs">Agents in Swarm Graph</span>
            <span className="text-white font-bold">{swarmDepth} Agents</span>
          </div>
          <input
            type="range"
            min="2"
            max="20"
            step="1"
            value={swarmDepth}
            onChange={(e) => setSwarmDepth(Number(e.target.value))}
            className="w-full accent-indigo-500 bg-white/10 h-1.5 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-3xs text-neutral-500">
            <span>2 (Duo)</span>
            <span>8 (Team)</span>
            <span>20 (Swarm)</span>
          </div>
        </div>

        {/* Slider 3: External LLM Judge Cost per Eval */}
        <div className="p-4 rounded-xl bg-surface border border-line space-y-3">
          <div className="flex justify-between">
            <span className="text-neutral-400 uppercase text-3xs">LLM Judge Token Cost</span>
            <span className="text-white font-bold">${llmJudgePrice.toFixed(3)} / eval</span>
          </div>
          <input
            type="range"
            min="0.005"
            max="0.050"
            step="0.005"
            value={llmJudgePrice}
            onChange={(e) => setLlmJudgePrice(Number(e.target.value))}
            className="w-full accent-indigo-500 bg-white/10 h-1.5 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-3xs text-neutral-500">
            <span>$0.005 (Mini)</span>
            <span>$0.015 (GPT-4o)</span>
            <span>$0.050 (Opus)</span>
          </div>
        </div>
      </div>

      {/* Comparative Metrics Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-xl bg-surface border border-line space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400 text-3xs uppercase">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Monthly Eval Bill</span>
          </div>
          <p className="text-xl font-bold text-white mt-1">$0.00</p>
          <span className="text-3xs text-rose-400 line-through">
            ${traditionalMonthlyCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo with 3rd-party judges
          </span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-line space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400 text-3xs uppercase">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Evaluation Latency</span>
          </div>
          <p className="text-xl font-bold text-indigo-300 mt-1">~27.8 ms</p>
          <span className="text-3xs text-neutral-400">
            {latencyReductionPercent.toFixed(1)}% faster than LLM calls (1,800ms)
          </span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-line space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400 text-3xs uppercase">
            <Server className="w-3.5 h-3.5 text-amber-400" />
            <span>Human Dev Time Saved</span>
          </div>
          <p className="text-xl font-bold text-white mt-1">{totalHoursSavedPerMonth.toFixed(0)} hrs/mo</p>
          <span className="text-3xs text-neutral-400">No waiting for slow evaluator blocking</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-line space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400 text-3xs uppercase">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Data Privacy Guarantee</span>
          </div>
          <p className="text-xl font-bold text-emerald-400 mt-1">100% Air-Gapped</p>
          <span className="text-3xs text-neutral-400">Zero customer prompts leave your VPC</span>
        </div>
      </div>
    </div>
  );
}
