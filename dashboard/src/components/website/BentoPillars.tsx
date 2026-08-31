import React from 'react';
import { Layers, ShieldCheck, Cpu, Activity, AlertTriangle, Lock, ArrowUpRight, Zap, Database, GitBranch } from 'lucide-react';

interface PillarCard {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  badge: string;
  icon: React.ElementType;
  metric: string;
  metricLabel: string;
  colSpan: string;
  detailPoints: string[];
}

const PILLARS: PillarCard[] = [
  {
    id: 'nli-gate',
    eyebrow: 'Dual-Stage Inference',
    title: 'Continuous Grounding & NLI Cross-Attention',
    description: 'A 2-stage cascaded evaluator gates fast vector cosine similarity (~27.8ms) with a DeBERTa-v3 cross-encoder NLI stage, catching subtle hallucinations on CPU without GPU cost. End-to-end cascade: 215.9ms mean.',
    badge: 'Stage 1 + 2 Gate',
    icon: ShieldCheck,
    // Config_C_Cascade in experiments/results/ablation_results.json, measured on
    // the held-out v1.0_test split. The previous 94.2% figure appears nowhere in
    // the results directory -- and understated the real number.
    metric: '0.963 F1',
    metricLabel: 'Grounding Benchmark (v1.0_test)',
    colSpan: 'lg:col-span-8',
    detailPoints: [
      'Zero model loading in HTTP API process (<0.005ms ingest)',
      'ONNX runtime optimized for commodity CPU execution',
      'Classifies Grounded, Contradiction, or Ambiguous in real time',
    ],
  },
  {
    id: 'asi-drift',
    eyebrow: 'Semantic Stability',
    title: 'Agent Stability Index (ASI)',
    description: 'Tracks semantic vector centroid shift, tool signature divergence, and step error rate delta over rolling windows to detect silent model degradation.',
    badge: 'Proprietary Metric',
    icon: Activity,
    metric: 'ASI [0-100]',
    metricLabel: 'Fleet Stability Score',
    colSpan: 'lg:col-span-4',
    detailPoints: [
      'Exponential Moving Average (EMA) vector centroid baselines',
      'Separates immediate step spikes from sustained drift',
      // The restore covers the EMA centroid only. The rolling window pools the
      // sustained-shift metric needs are in-process and start cold, so that
      // signal is unavailable for the first ~32 spans per agent after a
      // restart. Claiming a lossless restore was not accurate.
      'Restores EMA centroids across restarts; window pools re-warm',
    ],
  },
  {
    id: 'tool-claim',
    eyebrow: 'Deterministic Verification',
    title: 'Tool-Claim Assertion Engine',
    // Kept as a described capability, not a demonstrated one. On 8,353 prose
    // spans from external agent traces this extractor matched nothing, because
    // structured-tool-calling harnesses never narrate the tool call the regex
    // looks for. The redesign is documented and blocked on labelling, so the
    // card states the constraint instead of the aspiration.
    description: 'Regex-grounded parser matches narrated agent claims against raw JSON tool returns — e.g. an agent reporting 8 records when the tool returned 2. Requires the agent to describe its tool use in prose.',
    badge: 'Experimental',
    icon: Zap,
    metric: '<1.0 ms',
    metricLabel: 'Deterministic Regex Latency',
    colSpan: 'lg:col-span-4',
    detailPoints: [
      'Zero LLM judge token consumption',
      'Does not fire on harnesses that emit structured tool_call fields',
      'Not yet validated on external agent traces',
    ],
  },
  {
    id: 'compounding-error',
    eyebrow: 'Multi-Agent DAGs',
    title: 'Compounding Error Propagation Graph',
    // "Causal" and "pinpoints the node that triggered the cascade" claimed
    // causal inference the system does not perform -- it records and scores
    // spans, it does not establish that one caused another. Reworded to what
    // the trace view actually shows.
    description: 'Records multi-agent DAG execution chains with per-span evaluation, so you can read where risk first rises along the graph and which upstream node preceded it.',
    badge: 'DAG Inspection',
    icon: GitBranch,
    metric: 'Every Span',
    metricLabel: 'Evaluated, Not Sampled',
    colSpan: 'lg:col-span-8',
    detailPoints: [
      'Per-span grounding scores across graph handoffs',
      'Identifies detached and dangling span executions',
      'Wall-clock waterfall showing ordering and overlap',
    ],
  },
  {
    id: 'durable-queue',
    eyebrow: 'Fault-Tolerant Engine',
    title: 'Durable Leased Queue & Worker Fleet',
    // PostgreSQL is deferred, not implemented -- there is no Postgres driver in
    // the backend dependencies and no Postgres code path. Claiming it as a
    // supported backend was false.
    description: 'Evaluator decoupled from API ingestion. Durable SQLite WAL queue with heartbeat lease recovery: a SIGKILL mid-evaluation is recovered and the job runs exactly once.',
    badge: 'SIGKILL Recovered',
    icon: Database,
    metric: 'Exactly-Once',
    metricLabel: 'Measured on 8,000 spans',
    colSpan: 'lg:col-span-6',
    detailPoints: [
      'Idempotent result persistence prevents duplicate entries',
      '8,000 spans across 8 runs: 0 lost, 0 retried, 0 duplicated',
      'API servers and workers scale independently',
    ],
  },
  {
    id: 'air-gapped',
    eyebrow: 'Sovereign Security',
    title: '100% Air-Gapped / Privacy Preserving',
    // "SOC2 / HIPAA Ready" and "full compliance" were removed: no audit has been
    // performed and no certification exists, and those are regulated claims. The
    // architectural fact -- nothing leaves the host -- is true and is what the
    // card now says. Apache 2.0 was also dropped: the repository has no LICENSE
    // file, so no licence can be advertised.
    description: 'Never send your proprietary prompts or records to 3rd-party LLM evaluation APIs. All models execute locally on your own hardware.',
    badge: 'No External Egress',
    icon: Lock,
    metric: '0 KB',
    metricLabel: 'External Token Egress',
    colSpan: 'lg:col-span-6',
    detailPoints: [
      'Fully self-hosted: no evaluation traffic leaves the host',
      'Input/output hash-only privacy masking modes',
      'Runs air-gapped — no outbound calls in the evaluation path',
    ],
  },
];

export function BentoPillars() {
  return (
    <div className="w-full space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400">
          <Layers className="w-4 h-4" />
          <span>Core Technological Architecture</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          The Six Pillars of Multi-Agent Observability.
        </h3>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl">
          Engineered from first principles to solve the multi-agent observability dilemma: full real-time evaluation coverage without bankrupting latency or token budgets.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;

          return (
            <div
              key={pillar.id}
              className={`${pillar.colSpan} p-6 sm:p-7 rounded-2xl bg-surface-2 border border-line hover:border-line-strong transition-all duration-300 flex flex-col justify-between space-y-6 shadow-lg group`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-surface-3 border border-line flex items-center justify-center text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-all">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-3xs font-mono text-neutral-400 uppercase tracking-wider">
                      {pillar.eyebrow}
                    </span>
                  </div>
                  <span className="text-3xs font-mono px-2 py-0.5 rounded-md bg-surface-3 text-neutral-300 border border-line">
                    {pillar.badge}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-base sm:text-lg font-bold text-white tracking-tight font-sans">
                    {pillar.title}
                  </h4>
                  <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                    {pillar.description}
                  </p>
                </div>

                {/* Detail Checklist */}
                <div className="space-y-1.5 pt-2 border-t border-line text-3xs font-mono text-neutral-400">
                  {pillar.detailPoints.map((pt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metric Footer */}
              <div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between font-mono">
                <div>
                  <span className="text-3xs text-neutral-500 uppercase">{pillar.metricLabel}</span>
                  <p className="text-sm font-bold text-white">{pillar.metric}</p>
                </div>
                <div className="w-6 h-6 rounded-lg bg-surface-3 flex items-center justify-center text-neutral-400 group-hover:text-indigo-300 transition-colors">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
