import React, { useState, useEffect } from 'react';
import { Activity, Radio, Pause, Play, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

interface LiveTailProps {
  palette: 'butter' | 'dark' | 'chalk';
}

interface StreamSpan {
  id: string;
  agent: string;
  action: string;
  status: 'ok' | 'contradiction' | 'drift';
  contradictionScore: number;
  latency: number;
  timestamp: string;
  model: string;
}

const INITIAL_SPANS: StreamSpan[] = [
  {
    id: 'sp_948f10a',
    agent: 'support-agent-v2',
    action: 'llm.completion (Return Policy Check)',
    status: 'ok',
    contradictionScore: 0.002,
    latency: 52,
    timestamp: 'Just now',
    model: 'MiniLM-v2 (Cosine Gate)'
  },
  {
    id: 'sp_948f10b',
    agent: 'sql-query-executor',
    action: 'tool.execute (db_query_users)',
    status: 'contradiction',
    contradictionScore: 0.998,
    latency: 64,
    timestamp: '2s ago',
    model: 'DeBERTa-v3 (Cross-Encoder)'
  },
  {
    id: 'sp_948f10c',
    agent: 'researcher-agent',
    action: 'rag.retrieve (ArXiv Papers)',
    status: 'ok',
    contradictionScore: 0.014,
    latency: 48,
    timestamp: '4s ago',
    model: 'MiniLM-v2 (Cosine Gate)'
  },
  {
    id: 'sp_948f10d',
    agent: 'travel-planner',
    action: 'llm.completion (Paris vs Berlin Itinerary)',
    status: 'contradiction',
    contradictionScore: 0.941,
    latency: 59,
    timestamp: '6s ago',
    model: 'DeBERTa-v3 (Cross-Encoder)'
  }
];

const AGENT_NAMES = ['customer-service', 'code-reviewer', 'sql-agent', 'rag-summarizer', 'financial-analyst'];
const ACTIONS = [
  'llm.generate (Final Synthesis)',
  'tool.call (fetch_crm_contact)',
  'rag.rerank (Top 5 Chunks)',
  'guardrail.validate (Output Schema)'
];

export const LiveTailStream: React.FC<LiveTailProps> = ({ palette }) => {
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [spans, setSpans] = useState<StreamSpan[]>(INITIAL_SPANS);

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const isAnomalous = Math.random() < 0.3; // 30% chance of contradiction for demo
      const randomAgent = AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
      const randomAction = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      
      const newSpan: StreamSpan = {
        id: `sp_${Math.random().toString(36).substring(2, 9)}`,
        agent: randomAgent,
        action: randomAction,
        status: isAnomalous ? 'contradiction' : 'ok',
        contradictionScore: isAnomalous ? Number((0.85 + Math.random() * 0.14).toFixed(3)) : Number((Math.random() * 0.04).toFixed(3)),
        latency: Math.floor(45 + Math.random() * 25),
        timestamp: 'Just now',
        model: isAnomalous ? 'DeBERTa-v3 (Escalated)' : 'MiniLM-v2 (Cosine Gate)'
      };

      setSpans((prev) => [newSpan, ...prev.slice(0, 5)]);
    }, 2800);

    return () => clearInterval(interval);
  }, [isStreaming]);

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
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-red-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b relative z-10 ${
        palette === 'chalk' ? 'border-neutral-200' : 'border-white/[0.12]'
      }`}>
        <div>
          <div className="flex items-center space-x-2">
            <span className={`flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              palette === 'chalk'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-ping mr-1.5 ${palette === 'chalk' ? 'bg-rose-600' : 'bg-red-400'}`} />
              Live Ingestion Stream
            </span>
            <span className={`text-xs font-mono ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>Datadog APM Live Tail Equivalent</span>
          </div>
          <h3 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight font-sans ${
            palette === 'chalk' ? 'text-neutral-950' : 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]'
          }`}>
            Real-Time Span Ingestion Feed
          </h3>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${
            palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
          }`}>
            Incoming telemetry streams into the FastAPI ingress gateway at sub-3ms latency while local CPU workers evaluate each step.
          </p>
        </div>

        {/* Live Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all backdrop-blur-md tactile-press ${
              isStreaming
                ? palette === 'chalk'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200 shadow-sm'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border-neutral-300 hover:bg-neutral-200'
                : 'bg-white/10 text-neutral-200 border-white/20 hover:bg-white/15'
            }`}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Live Stream</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume Live Stream</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stream Table */}
      <div className={`mt-6 overflow-x-auto relative z-10 rounded-2xl p-4 ${
        palette === 'chalk'
          ? 'bg-white border border-neutral-200 shadow-sm'
          : 'bg-black/30 backdrop-blur-xl border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)]'
      }`}>
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className={`border-b text-[11px] uppercase tracking-wider ${
              palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/10 text-neutral-400'
            }`}>
              <th className="pb-3 font-semibold">Status / Ingestion</th>
              <th className="pb-3 font-semibold">Span ID</th>
              <th className="pb-3 font-semibold">Agent Namespace</th>
              <th className="pb-3 font-semibold">Span Action</th>
              <th className="pb-3 font-semibold">Evaluator Model</th>
              <th className="pb-3 font-semibold text-right">Contradiction</th>
              <th className="pb-3 font-semibold text-right">CPU Latency</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${palette === 'chalk' ? 'divide-neutral-200' : 'divide-white/[0.06]'}`}>
            {spans.map((span) => (
              <tr
                key={span.id}
                className={`transition-colors group animate-fadeIn ${
                  palette === 'chalk' ? 'hover:bg-neutral-50/80' : 'hover:bg-white/[0.02]'
                }`}
              >
                <td className="py-3.5">
                  {span.status === 'ok' ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                      palette === 'chalk'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> FAITHFUL
                    </span>
                  ) : (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                      palette === 'chalk'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-red-500/20 text-red-300 border border-red-500/40'
                    }`}>
                      <ShieldAlert className="w-3 h-3 mr-1" /> GROUNDING RISK
                    </span>
                  )}
                </td>
                <td className={`py-3.5 font-bold ${palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-300'}`}>{span.id}</td>
                <td className={`py-3.5 font-bold ${palette === 'chalk' ? 'text-amber-800' : 'text-amber-300'}`}>{span.agent}</td>
                <td className={`py-3.5 ${palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-200'}`}>{span.action}</td>
                <td className={`py-3.5 ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'}`}>{span.model}</td>
                <td className="py-3.5 text-right font-bold">
                  <span className={span.status === 'contradiction' ? (palette === 'chalk' ? 'text-rose-700 font-bold' : 'text-red-400') : (palette === 'chalk' ? 'text-emerald-700 font-bold' : 'text-emerald-400')}>
                    {(span.contradictionScore * 100).toFixed(1)}%
                  </span>
                </td>
                <td className={`py-3.5 text-right ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'}`}>{span.latency}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`mt-4 pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono gap-2 ${
        palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/10 text-neutral-400'
      }`}>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full animate-pulse ${palette === 'chalk' ? 'bg-emerald-600' : 'bg-emerald-400'}`} />
          <span>Ingress Gateway: 202 Accepted in &lt; 2.8ms · Memory footprint 84MB</span>
        </div>
        <span>Evaluation Engine: ONNX CPU workers with Int8 quantization</span>
      </div>
    </div>
  );
};
