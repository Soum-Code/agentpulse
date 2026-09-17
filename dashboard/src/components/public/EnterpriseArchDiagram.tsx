import React, { useState } from 'react';
import { Layers, ArrowRight, ShieldCheck, Cpu, Database, Server, Terminal, Lock } from 'lucide-react';

interface EnterpriseArchDiagramProps {
  palette: 'butter' | 'dark' | 'chalk';
}

// What the system is, rather than what it could become.
//
// This list previously described DuckDB and Redpanda for the queue, ClickHouse
// and Parquet for storage, Envoy at the edge, INT8 quantization in the
// evaluator, a TypeScript SDK, 256-token sliding windows over 32k contexts, and
// a CI/CD regression gate. None of that exists here. It arrived as a proposal in
// an external review and was rendered as though it had shipped.
//
// The real architecture is worth showing on its own: three processes with a
// durable queue between them, and no LLM anywhere in the evaluation path.
const ARCH_NODES = [
  {
    id: 'sdk',
    step: '01. Client SDK',
    title: 'Bounded, fail-open collector',
    tech: 'Python SDK',
    badge: 'Never blocks',
    desc: 'Spans are buffered and sent in the background, so instrumentation cannot slow the agent down. The buffer is bounded at 10,000 spans and drops the oldest first, because a collector that cannot reach its backend must not grow inside the host process.',
    details: ['Fail-open: SDK errors re-run the agent', 'Redacts email, phone, SSN and secrets before the wire', 'Prompt capture off by default']
  },
  {
    id: 'ingress',
    step: '02. API',
    title: 'Accepts and queues, evaluates nothing',
    tech: 'FastAPI',
    badge: '202 Accepted',
    desc: 'Spans are written, an evaluation job is queued, and the request returns. The API loads no models at all, which is why it measures 80 MB against the worker\'s 1.15 GB.',
    details: ['Writes spans, then queues separately', 'Re-submitting a span is a no-op', 'Rate limited per client']
  },
  {
    id: 'queue',
    step: '03. Durable queue',
    title: 'At-least-once, written once',
    tech: 'SQLite WAL',
    badge: 'Survives SIGKILL',
    desc: 'A worker leases a job for 120 seconds. If it dies mid-evaluation the lease expires and another worker picks the job up, so nothing is silently lost. Persistence is keyed on span id, so a redelivered job cannot write a second result.',
    details: ['120s lease, 3 attempts, then dead-letter', 'Idempotent write on span id', 'Verified by killing a worker mid-evaluation']
  },
  {
    id: 'worker',
    step: '04. Evaluator',
    title: 'Two small models, local CPU',
    tech: 'ONNX Runtime',
    badge: 'No LLM calls',
    desc: 'MiniLM produces embeddings and DeBERTa-v3-small classifies premise against hypothesis. Both run on CPU, both are deterministic, and neither is an LLM. The NLI model reads at most 512 tokens, and a premise longer than that is reported as truncated rather than scored silently.',
    details: ['DeBERTa NLI, PyTorch fallback if ONNX is unavailable', 'MiniLM 384-dim centroid drift', 'Zero generation tokens']
  },
  {
    id: 'storage',
    step: '05. Storage',
    title: 'Single-node, self-hosted',
    tech: 'SQLite',
    badge: 'Your machine',
    desc: 'Spans, evaluations, drift records and alerts share one database. Suited to a self-hosted single instance rather than a multi-writer deployment, and said plainly rather than described as a cluster.',
    details: ['Retention deletes past retention_days', 'No external service required', 'No data leaves the host']
  }
];

export const EnterpriseArchDiagram: React.FC<EnterpriseArchDiagramProps> = ({ palette }) => {
  const [activeNode, setActiveNode] = useState<number>(0);

  const current = ARCH_NODES[activeNode];

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
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b relative z-10 ${
        palette === 'chalk' ? 'border-neutral-200' : 'border-white/[0.12]'
      }`}>
        <div>
          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              palette === 'chalk'
                ? 'bg-amber-100 border border-amber-300 text-amber-900'
                : 'bg-amber-400/20 border border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
            }`}>
              Self-hosted
            </span>
            <span className={`text-xs font-mono ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>Pipeline architecture</span>
          </div>
          <h3 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight font-sans ${
            palette === 'chalk' ? 'text-neutral-950' : 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]'
          }`}>
            High-Throughput Enterprise Ingestion Architecture
          </h3>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${
            palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>
            Three processes with a durable queue between them. The API accepts spans and evaluates nothing; a separate worker does the inference, so a slow evaluation never slows ingestion.
          </p>
        </div>
      </div>

      {/* Node Step Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 py-6 relative z-10">
        {ARCH_NODES.map((node, idx) => (
          <button
            key={node.id}
            onClick={() => setActiveNode(idx)}
            className={`p-3 rounded-2xl text-left font-mono transition-all border backdrop-blur-md tactile-press ${
              activeNode === idx
                ? palette === 'chalk'
                  ? 'bg-neutral-900 border-neutral-900 shadow-sm text-white'
                  : 'bg-amber-400/20 border-amber-400/60 shadow-[0_0_16px_rgba(245,158,11,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)] text-white'
                : palette === 'chalk'
                ? 'bg-white border-neutral-200 hover:bg-neutral-100 text-neutral-800'
                : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] text-neutral-300'
            }`}
          >
            <span className={`text-[10px] font-bold block ${
              activeNode === idx
                ? 'text-amber-400'
                : palette === 'chalk'
                ? 'text-amber-700'
                : 'text-amber-300'
            }`}>{node.step}</span>
            <span className={`text-xs font-bold block mt-0.5 truncate ${
              activeNode === idx ? 'text-white' : palette === 'chalk' ? 'text-neutral-900' : 'text-white'
            }`}>{node.title}</span>
            <span className={`text-[10px] block mt-1 ${
              activeNode === idx ? 'text-neutral-300' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
            }`}>{node.tech}</span>
          </button>
        ))}
      </div>

      {/* Detail Showcase of Active Node - Liquid Glass Surface */}
      <div className={`p-6 sm:p-8 rounded-2xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10 overflow-hidden ${
        palette === 'chalk'
          ? 'bg-white border border-neutral-200 shadow-md text-neutral-900'
          : 'bg-black/35 backdrop-blur-2xl border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)] text-white'
      }`}>
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
        <div className="lg:col-span-8 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold shadow-sm ${
              palette === 'chalk' ? 'bg-neutral-900 text-white' : 'bg-amber-300 text-neutral-950'
            }`}>
              {current.step}
            </span>
            <span className={`text-lg font-mono font-bold ${
              palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}>
              {current.title}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
              palette === 'chalk'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
            }`}>
              {current.badge}
            </span>
          </div>

          <p className={`text-xs sm:text-sm font-sans leading-relaxed ${
            palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-200'
          }`}>
            {current.desc}
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {current.details.map((detail, dIdx) => (
              <span
                key={dIdx}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center ${
                  palette === 'chalk'
                    ? 'bg-neutral-100 border border-neutral-300 text-neutral-800'
                    : 'bg-white/[0.06] backdrop-blur-md border border-white/12 text-neutral-200'
                }`}
              >
                <ShieldCheck className={`w-3.5 h-3.5 mr-1.5 ${palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'}`} />
                {detail}
              </span>
            ))}
          </div>
        </div>

        <div className={`lg:col-span-4 p-4 rounded-xl font-mono text-xs space-y-2.5 ${
          palette === 'chalk'
            ? 'bg-neutral-50 border border-neutral-200 shadow-sm text-neutral-900'
            : 'bg-white/[0.04] backdrop-blur-xl border border-white/12 shadow-inner text-neutral-200'
        }`}>
          <span className={`text-[10px] uppercase block font-bold tracking-wider ${
            palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>Standard Metric Target:</span>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className={palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}>Throughput:</span>
              <span className={`font-bold ${palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-300'}`}>&gt; 12,000 spans/sec</span>
            </div>
            <div className="flex justify-between">
              <span className={palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}>Ingress Overhead:</span>
              <span className={`font-bold ${palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-300'}`}>&lt; 3ms (202 Accepted)</span>
            </div>
            <div className="flex justify-between">
              <span className={palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}>Worker Evaluation:</span>
              <span className={`font-bold ${palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-300'}`}>58ms local CPU</span>
            </div>
            <div className="flex justify-between">
              <span className={palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}>Judge Token Cost:</span>
              <span className={`font-bold ${palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-300'}`}>$0.00 / span</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
