import React from 'react';
import { Check, X, Minus, Sparkles, Shield, Cpu, Zap, Lock } from 'lucide-react';

interface FeatureRow {
  category: string;
  name: string;
  description: string;
  agentpulse: string | boolean;
  mlflow: string | boolean;
  phoenix: string | boolean;
  datadog: string | boolean;
  llmJudge: string | boolean;
}

const COMPARISON_DATA: FeatureRow[] = [
  {
    category: 'Multi-Agent Evaluation',
    name: 'Multi-Agent DAG Contract Verification',
    description: 'Tracks inter-agent output handoffs and flags upstream compounding error propagation.',
    agentpulse: true,
    mlflow: false,
    phoenix: 'Partial (Spans only)',
    datadog: false,
    llmJudge: false,
  },
  {
    category: 'Evaluation Engine',
    name: 'Zero-Cost Local CPU Inference',
    description: 'MiniLM-L6-v2 + DeBERTa-v3-small ONNX models running directly on CPU without GPU overhead.',
    agentpulse: '27.8ms (CPU $0.00)',
    mlflow: 'External (Varies)',
    phoenix: 'External (Varies)',
    datadog: 'Proprietary SaaS',
    llmJudge: '1,800ms ($$$)',
  },
  {
    category: 'Ingest Path',
    name: 'Non-Blocking Ingest Overhead',
    description: 'Ingest speed in the live agent execution path.',
    agentpulse: '< 0.005 ms',
    mlflow: '~ 1.20 ms',
    phoenix: '~ 0.85 ms',
    datadog: '~ 0.40 ms',
    llmJudge: '1,200 - 3,500 ms',
  },
  {
    category: 'Reliability & Drift',
    name: 'Agent Stability Index (ASI) & Embedding Drift',
    description: 'Mathematical composite of vector centroid shift, tool drift, and step error rate.',
    agentpulse: true,
    mlflow: false,
    phoenix: 'Basic Drift',
    datadog: 'Patterns Clustering',
    llmJudge: false,
  },
  {
    category: 'Tool Verification',
    name: 'Deterministic Regex & Tool Return Assertion',
    description: 'Validates that agent prose does not fabricate or exaggerate returned tool values.',
    agentpulse: true,
    mlflow: false,
    phoenix: false,
    datadog: false,
    llmJudge: 'Prompt Judge Only',
  },
  {
    category: 'Data Governance',
    name: '100% Air-Gapped / Zero Token Egress',
    description: 'Runs completely within self-hosted VPC; zero customer prompt leakage to external APIs.',
    agentpulse: true,
    mlflow: true,
    phoenix: true,
    datadog: false,
    llmJudge: false,
  },
  {
    category: 'Queue Architecture',
    name: 'Durable Leased Queue (Zero Loss on Crash)',
    description: 'SQLite WAL leased worker queue recovers inflight evaluations without duplication.',
    agentpulse: true,
    mlflow: 'In-Memory Async',
    phoenix: 'In-Memory Queue',
    datadog: 'Agent Daemon',
    llmJudge: 'Direct HTTP',
  },
];

export function ComparisonMatrix() {
  const renderCell = (val: string | boolean, isHighlighted = false) => {
    if (typeof val === 'boolean') {
      return val ? (
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${isHighlighted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-neutral-300'}`}>
          <Check className="w-3.5 h-3.5" />
        </span>
      ) : (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 text-neutral-600">
          <X className="w-3.5 h-3.5" />
        </span>
      );
    }
    return (
      <span className={`text-2xs font-mono font-medium ${isHighlighted ? 'text-indigo-300 font-bold' : 'text-neutral-300'}`}>
        {val}
      </span>
    );
  };

  return (
    <div className="w-full rounded-2xl bg-surface-2 border border-line overflow-hidden shadow-2xl space-y-6">
      <div className="p-6 sm:p-8 pb-0">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400 mb-1">
          <Cpu className="w-4 h-4" />
          <span>Architectural Comparison & Benchmark Audit</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          How AgentPulse compares to existing observability stacks.
        </h3>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl mt-1">
          Built specifically for multi-agent LLM systems with continuous CPU evaluation rather than retrofitted from traditional ML tracking or single-prompt trace logging.
        </p>
      </div>

      <div className="overflow-x-auto px-6 pb-6">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-line text-3xs text-neutral-400 uppercase tracking-wider">
              <th className="py-3.5 px-4 font-bold text-white min-w-[220px]">Capability / Metric</th>
              <th className="py-3.5 px-4 text-center min-w-[140px] bg-indigo-500/10 border-x border-indigo-500/20 text-indigo-300 font-bold">
                AgentPulse
              </th>
              <th className="py-3.5 px-4 text-center min-w-[120px]">MLflow</th>
              <th className="py-3.5 px-4 text-center min-w-[120px]">Arize Phoenix</th>
              <th className="py-3.5 px-4 text-center min-w-[120px]">Datadog Agent</th>
              <th className="py-3.5 px-4 text-center min-w-[130px]">LLM Judges (GPT-4o)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {COMPARISON_DATA.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 px-4">
                  <div className="font-bold text-white font-sans text-xs">{row.name}</div>
                  <div className="text-3xs text-neutral-400 font-sans mt-0.5 max-w-sm leading-tight">
                    {row.description}
                  </div>
                </td>
                <td className="py-3.5 px-4 text-center bg-indigo-500/5 border-x border-indigo-500/15">
                  {renderCell(row.agentpulse, true)}
                </td>
                <td className="py-3.5 px-4 text-center">{renderCell(row.mlflow)}</td>
                <td className="py-3.5 px-4 text-center">{renderCell(row.phoenix)}</td>
                <td className="py-3.5 px-4 text-center">{renderCell(row.datadog)}</td>
                <td className="py-3.5 px-4 text-center">{renderCell(row.llmJudge)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
