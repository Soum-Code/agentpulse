import React, { useState } from 'react';
import { X, BookOpen, FileText, CheckCircle2, ChevronRight, Cpu, Sparkles, ExternalLink } from 'lucide-react';

interface WhitepaperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhitepaperModal({ isOpen, onClose }: WhitepaperModalProps) {
  const [activeTab, setActiveTab] = useState<'math' | 'ablation' | 'architecture'>('math');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl bg-surface-2 border border-line shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-surface-3 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              AgentPulse Technical Whitepaper & Mathematical Formulations
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-surface hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer border border-line"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-3 pb-1 border-b border-line flex items-center gap-4 text-xs font-mono">
          <button
            onClick={() => setActiveTab('math')}
            className={`pb-2 transition-all cursor-pointer ${
              activeTab === 'math' ? 'text-indigo-400 border-b-2 border-indigo-400 font-bold' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Mathematical Formulas
          </button>
          <button
            onClick={() => setActiveTab('ablation')}
            className={`pb-2 transition-all cursor-pointer ${
              activeTab === 'ablation' ? 'text-indigo-400 border-b-2 border-indigo-400 font-bold' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Ablation Experiments (32 Fixtures)
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2 transition-all cursor-pointer ${
              activeTab === 'architecture' ? 'text-indigo-400 border-b-2 border-indigo-400 font-bold' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Decoupled Ingest Pipeline
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-neutral-300 font-sans text-xs sm:text-sm leading-relaxed">
          {activeTab === 'math' && (
            <div className="space-y-6">
              {/* Formula 1: ASI */}
              <div className="p-5 rounded-xl bg-surface border border-line space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase">1. Agent Stability Index (ASI)</span>
                  <span className="text-3xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    ASI ∈ [0, 100]
                  </span>
                </div>
                <p className="text-xs text-neutral-400 font-sans">
                  The Agent Stability Index measures an individual agent's semantic drift, tool parameter stability, and step error rate against its rolling exponential moving average baseline:
                </p>
                <div className="p-4 rounded-lg bg-surface-3 border border-line text-center text-sm font-bold text-indigo-300 overflow-x-auto">
                  ASI = 100 &times; [ 1 - ( d_centroid + &delta;_tool ) / 2 ] &times; ( 1 - error_rate )
                </div>
                <div className="text-3xs text-neutral-400 space-y-1">
                  <div>&bull; <strong className="text-white">d_centroid:</strong> Cosine distance between current output embedding and running baseline centroid.</div>
                  <div>&bull; <strong className="text-white">&delta;_tool:</strong> Jaccard / parameter distance on emitted tool arguments.</div>
                  <div>&bull; <strong className="text-white">error_rate:</strong> Proportion of uncaught exceptions and step execution failures.</div>
                </div>
              </div>

              {/* Formula 2: Cascaded Grounding Risk */}
              <div className="p-5 rounded-xl bg-surface border border-line space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase">2. Cascaded Hallucination Risk Score</span>
                  <span className="text-3xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Risk ∈ [0.0, 1.0]
                  </span>
                </div>
                <p className="text-xs text-neutral-400 font-sans">
                  Risk score combines Stage 1 vector similarity fast-gating, Stage 2 DeBERTa cross-encoder NLI, and deterministic regex assertions:
                </p>
                <div className="p-4 rounded-lg bg-surface-3 border border-line text-center text-sm font-bold text-emerald-300 overflow-x-auto">
                  Risk = max( P_contradiction, 1.0 - S_cosine ) &times; ( 1.0 + &Delta;_tool_mismatch )
                </div>
                <div className="text-3xs text-neutral-400 space-y-1">
                  <div>&bull; If <strong className="text-white">S_cosine &gt; 0.85</strong>, Stage 1 fast-accepts as GROUNDED (latency ~27.8ms).</div>
                  <div>&bull; If <strong className="text-white">S_cosine &le; 0.85</strong>, Stage 2 DeBERTa cross-attention evaluates full token cross-entropy (latency ~88ms).</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ablation' && (
            <div className="space-y-4 font-mono text-xs">
              <p className="text-xs text-neutral-300 font-sans">
                AgentPulse was rigorously validated across 32 empirical experiment suites recorded in <code className="text-indigo-300 bg-surface px-1 py-0.5 rounded border border-line">experiments/results/</code>:
              </p>

              <div className="space-y-2">
                {[
                  { file: 'ablation_results.json', desc: 'Seven-configuration ablation, thresholds selected on v1.0_dev and applied unchanged to held-out v1.0_test', metric: '0.963 F1 · 215.9ms' },
                  { file: 'llm_judge_comparison.json', desc: 'NLI cascade vs a local Qwen3-8B judge over 30 held-out cases, real inference confirmed', metric: '12.9× lower latency' },
                  { file: 'throughput_benchmark.json', desc: 'Worker-count sweep over 1,000 spans on 8 physical cores', metric: '~12 spans/sec @ 4 workers' },
                  { file: 'drift_experiment_results.json', desc: 'Eleven graded-shift scenarios with negative controls against the 0.30 detection threshold', metric: '11 scenarios' },
                  { file: 'compounding_error_results.json', desc: 'Controlled fault injection across a five-node DAG, with the baseline node limitation documented in-file', metric: 'Control vs intervention' },
                ].map((exp, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{exp.file}</span>
                      <p className="text-3xs text-neutral-400 font-sans mt-0.5">{exp.desc}</p>
                    </div>
                    <span className="text-3xs px-2 py-1 rounded-md bg-surface-3 text-indigo-300 border border-line shrink-0">
                      {exp.metric}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-4 text-xs font-sans text-neutral-300">
              <h4 className="font-bold text-white font-mono text-sm">Decoupled Ingestion & Zero-Loss Lease Recovery</h4>
              <p>
                In high-throughput multi-agent swarms, the ingest path cannot block on inference. AgentPulse decouples API ingest from evaluation:
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-xs">
                <li><strong className="text-white">API Ingestion (&lt;0.005ms):</strong> The FastAPI server receives span buffers, verifies schema, writes to the durable WAL queue table, and returns 200 OK immediately.</li>
                <li><strong className="text-white">Evaluation Worker Fleet:</strong> Autonomous background worker processes claim batches using atomic database leases (<code className="text-neutral-400 font-mono">claimed_at + lease_duration</code>).</li>
                <li><strong className="text-white">SIGKILL / Crash Recovery:</strong> If a worker process is terminated abruptly, its lease expires automatically. Another worker re-claims the job without dropping spans or producing duplicate evaluation records.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-3 border-t border-line flex items-center justify-between text-xs font-mono">
          {/* No licence claimed: the repository ships no LICENSE file. */}
          <span className="text-neutral-400">Self-hosted · Research preview</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface hover:bg-white/10 text-white font-bold transition-all cursor-pointer border border-line"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
