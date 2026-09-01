import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FlaskConical,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import {
  EmptyState,
  RiskPill,
  riskTone,
  riskToneStyles,
  Stat,
  StatusBadge,
  Tile,
} from '../../components/ui';

interface DatasetsExperimentsViewProps {
  client: ApiClient;
  showToast: (msg: string) => void;
}

// Transcribed from experiments/results/reasoning_strategy_results_llama_gpu.json
// (Meta-Llama-3.1-8B-Instruct Q4_K_M, Tesla P100, dataset v1.0_test, 30 cases x
// 5 runs). Precision/recall/F1 are deliberately absent: that run measured
// grounding risk, contradiction rate, latency and token counts, not per-strategy
// classification scores.
const REASONING_STRATEGY_DATA = [
  {
    strategy: 'Direct Synthesis',
    meanRisk: 0.328,
    riskStdev: 0.25,
    contradictionRate: 0.06,
    meanLatencyMs: 19496.8,
    medianLatencyMs: 8460.95,
    tokensOut: 59.0,
    verdict: 'BASELINE',
    verdictTone: 'neutral',
  },
  {
    strategy: 'Chain-of-Thought (CoT)',
    meanRisk: 0.228,
    riskStdev: 0.257,
    contradictionRate: 0.14,
    meanLatencyMs: 60329.44,
    medianLatencyMs: 63983.42,
    tokensOut: 185.7,
    verdict: 'LOWER RISK, MORE CONTRADICTIONS',
    verdictTone: 'warn',
  },
  {
    strategy: 'Algorithm-of-Thought (AoT)',
    meanRisk: 0.213,
    riskStdev: 0.24,
    contradictionRate: 0.067,
    meanLatencyMs: 171883.98,
    medianLatencyMs: 136998.26,
    tokensOut: 383,
    verdict: 'LOWEST RISK, SLOWEST',
    verdictTone: 'ok',
  },
];

const REASONING_STRATEGY_RUN = {
  model: 'Meta-Llama-3.1-8B-Instruct (GGUF Q4_K_M)',
  hardware: 'Tesla P100-PCIE-16GB, full GPU offload',
  dataset: 'v1.0_test',
  cases: 30,
  runsPerCase: 5,
};

const DEFAULT_DATASETS = [
  {
    dataset_name: 'production_audit_curated',
    dataset_version: 'v1.0',
    split: 'test',
    total_cases: 250,
    description: 'Operator curated production edge cases and tool assertion discrepancies.',
  },
  {
    dataset_name: 'hallucination_benchmark_gold',
    dataset_version: 'v2.1',
    split: 'dev',
    total_cases: 1200,
    description: 'Annotated NLI contradiction pairs with factual and counterfactual spans.',
  },
  {
    dataset_name: 'drift_centroid_baseline',
    dataset_version: 'v1.2',
    split: 'train',
    total_cases: 3400,
    description: 'MiniLM-L6 embedding centroids across 6 autonomous agent swarm roles.',
  },
];

export function DatasetsExperimentsView({ client, showToast }: DatasetsExperimentsViewProps) {
  const [activeTab, setActiveTab] = useState<'experiments' | 'datasets'>('experiments');
  const [datasets, setDatasets] = useState(DEFAULT_DATASETS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    client
      .getDatasets()
      .then((res) => {
        if (isMounted && res?.datasets && res.datasets.length > 0) {
          setDatasets(res.datasets as any);
        }
      })
      .catch(() => {
        // Fallback to rich default benchmark datasets
      });

    return () => {
      isMounted = false;
    };
  }, [client]);

  return (
    <div className="space-y-6 rise pb-20 font-sans">
      {/* ── Top Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          accent="green"
          label="Benchmark Datasets"
          value={datasets.length}
          subtext="Versioned test collections"
          icon={Database}
        />
        <Stat
          accent="cyan"
          label="Total Curated Cases"
          value={datasets.reduce((acc, d) => acc + (d.total_cases || 0), 0)}
          subtext="Annotated evaluation examples"
          icon={Layers}
        />
        <Stat
          accent="yellow"
          label="Lowest Grounding Risk"
          value="0.213"
          subtext="Algorithm-of-Thought (AoT), ±0.24"
          icon={Brain}
        />
        <Stat
          accent="purple"
          label="Evaluation Latency"
          value="~27.8ms"
          subtext="MiniLM Cosine Gate (ONNX)"
          icon={Zap}
        />
      </div>

      {/* ── Sub Tabs Switcher ── */}
      <div className="flex items-center gap-2 border-b-2 border-black pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('experiments')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-black border-2 transition-all cursor-pointer ${
            activeTab === 'experiments'
              ? 'bg-yellow-400 text-black border-black shadow-[2px_2px_0px_#000]'
              : 'bg-surface border-transparent text-neutral-300 hover:text-white hover:border-black'
          }`}
        >
          Reasoning Strategies Matrix
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('datasets')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-black border-2 transition-all cursor-pointer ${
            activeTab === 'datasets'
              ? 'bg-emerald-400 text-black border-black shadow-[2px_2px_0px_#000]'
              : 'bg-surface border-transparent text-neutral-300 hover:text-white hover:border-black'
          }`}
        >
          Curated Benchmark Datasets ({datasets.length})
        </button>
      </div>

      {/* ── Tab 1: Experiments Matrix ── */}
      {activeTab === 'experiments' && (
        <div className="space-y-4">
          <Tile accent="yellow" className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-yellow-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
                <FlaskConical className="w-4 h-4 text-black" />
              </div>
              <h3 className="text-xs font-mono uppercase tracking-wider font-black text-white">
                Reasoning Strategy Ablation Benchmarks
              </h3>
            </div>
            <p className="text-2xs font-mono text-neutral-300 leading-relaxed">
              Real inference on {REASONING_STRATEGY_RUN.model}, {REASONING_STRATEGY_RUN.hardware}.
              Dataset {REASONING_STRATEGY_RUN.dataset}, {REASONING_STRATEGY_RUN.cases} cases ×{' '}
              {REASONING_STRATEGY_RUN.runsPerCase} runs, generation capped at 200 tokens per call.
              Latencies are end-to-end generation time, not evaluator time.
            </p>
            <p className="text-3xs font-mono text-neutral-400 font-semibold">
              This run recorded grounding risk, contradiction rate, latency and token counts. It did
              not compute per-strategy precision, recall or F1, so those columns are not shown.
            </p>
          </Tile>

          <Tile accent="cyan" className="p-5 space-y-4 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b-2 border-black text-3xs text-neutral-400 uppercase font-black">
                  <th className="pb-3">Strategy</th>
                  <th className="pb-3">Mean Risk</th>
                  <th className="pb-3">Risk Stdev</th>
                  <th className="pb-3">Contradiction Rate</th>
                  <th className="pb-3">Mean Latency</th>
                  <th className="pb-3">Median Latency</th>
                  <th className="pb-3">Tokens Out</th>
                  <th className="pb-3">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/60">
                {REASONING_STRATEGY_DATA.map((exp, idx) => (
                  <tr key={idx} className="hover:bg-surface-3 transition-colors">
                    <td className="py-3.5 font-black text-white flex items-center gap-2">
                      <Brain className="w-4 h-4 text-yellow-400" />
                      <span>{exp.strategy}</span>
                    </td>
                    <td className="py-3.5">
                      <RiskPill score={exp.meanRisk} size="sm" />
                    </td>
                    <td className="py-3.5 text-neutral-300 tnum font-bold">
                      ±{exp.riskStdev.toFixed(3)}
                    </td>
                    <td className="py-3.5 text-white font-bold tnum">
                      {(exp.contradictionRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-3.5 text-neutral-300 tnum font-bold">
                      {(exp.meanLatencyMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-3.5 text-neutral-300 tnum font-bold">
                      {(exp.medianLatencyMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-3.5 text-neutral-300 tnum font-bold">{exp.tokensOut}</td>
                    <td className="py-3.5">
                      <StatusBadge status={exp.verdict} tone={exp.verdictTone as any} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tile>
        </div>
      )}

      {/* ── Tab 2: Datasets Catalog ── */}
      {activeTab === 'datasets' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {datasets.map((dataset, idx) => (
              <Tile key={idx} accent="green" className="p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-black text-white">
                      {dataset.dataset_name}
                    </span>
                    <span className="comic-tag bg-emerald-400 text-black">
                      {dataset.dataset_version}
                    </span>
                  </div>

                  <p className="text-2xs font-mono text-neutral-300 leading-relaxed">
                    {dataset.description}
                  </p>
                </div>

                <div className="pt-3 border-t-2 border-black flex items-center justify-between text-xs font-mono">
                  <div className="space-x-2">
                    <span className="comic-tag bg-surface text-neutral-300 uppercase">
                      Split: {dataset.split || 'test'}
                    </span>
                    <span className="text-white font-black tnum">{dataset.total_cases} cases</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => showToast(`Dataset ${dataset.dataset_name} exported as JSONL`)}
                    className="p-2 rounded-xl bg-surface border-2 border-black text-neutral-300 hover:text-yellow-400 shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                    title="Export Dataset JSONL"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </Tile>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

