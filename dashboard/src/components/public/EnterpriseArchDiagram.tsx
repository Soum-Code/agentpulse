import React, { useState } from 'react';
import { Layers, ArrowRight, ShieldCheck, Cpu, Database, Server, Terminal, Lock } from 'lucide-react';

interface EnterpriseArchDiagramProps {
  palette: 'butter' | 'dark' | 'chalk';
}

const ARCH_NODES = [
  {
    id: 'sdk',
    step: '01. Bounded Client SDK',
    title: 'Client Runtime & Ring Buffer',
    tech: 'Python / TS SDK',
    badge: 'Zero Leaks',
    desc: 'Pre-allocated 16MB ring buffer with drop_oldest policy guarantees agent application processes never leak RAM. Auto-redacts credit cards and bearer tokens before sending.',
    details: ['16MB memory bound ceiling', 'Client-side PII regex sanitizer', 'W3C traceparent propagation']
  },
  {
    id: 'ingress',
    step: '02. Ingress Gateway',
    title: 'Stateless Fast Collector',
    tech: 'FastAPI / Envoy',
    badge: '< 3ms Response',
    desc: 'Lightweight HTTP/2 ingestion endpoints validate schema and return 202 Accepted immediately. Contains zero ML weights, keeping RAM under 85MB per container.',
    details: ['Token-bucket rate limiting', 'Non-blocking async ingestion', 'Scoped tenant API authentication']
  },
  {
    id: 'queue',
    step: '03. Durable Stream Queue',
    title: 'Append-Only WAL Engine',
    tech: 'DuckDB WAL / Redpanda',
    badge: 'At-Least-Once',
    desc: 'Spans land in high-throughput append-only storage with distributed lease mechanics, eliminating SQLite single-writer lock contention.',
    details: ['Zero lock serialization', 'Crash-resilient disk persistence', 'Dead-Letter Queue (DLQ) safeguards']
  },
  {
    id: 'worker',
    step: '04. Local CPU Evaluator',
    title: 'Zero-LLM NLI & Centroid',
    tech: 'ONNX Int8 CPU',
    badge: '100% Deterministic',
    desc: 'Quantized DeBERTa-v3 cross-encoder and MiniLM embeddings run on CPU. Sliding 256-token chunking supports 32k+ token contexts with zero OpenAI token costs.',
    details: ['DeBERTa-v3 chunked max-contradiction', 'MiniLM 384-dim centroid drift', 'No external LLM dependencies']
  },
  {
    id: 'analytics',
    step: '05. Columnar OLAP',
    title: 'Analytical Telemetry Store',
    tech: 'ClickHouse / Parquet',
    badge: '< 50ms Queries',
    desc: 'Evaluated spans and metrics are indexed into columnar storage for instantaneous p95 latency filtering, agent flamegraphs, and CI/CD regression gates.',
    details: ['Flamegraphs & causal spans', '30/90/365-day cold tiering', 'CI/CD GitHub Action regression check']
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
              Datadog &amp; MLflow Grade
            </span>
            <span className={`text-xs font-mono ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>Enterprise Pipeline Specification</span>
          </div>
          <h3 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight font-sans ${
            palette === 'chalk' ? 'text-neutral-950' : 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]'
          }`}>
            High-Throughput Enterprise Ingestion Architecture
          </h3>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${
            palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>
            Designed for high-concurrency multi-agent swarms. Every component from SDK buffering to INT8 CPU inference is isolated to ensure zero host downtime.
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
