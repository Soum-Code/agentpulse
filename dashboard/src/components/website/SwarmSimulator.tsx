import React, { useState, useEffect } from 'react';
import { Play, Pause, ShieldCheck, ShieldAlert, Cpu, Zap, Brain, Search, Wrench, Sparkles, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AgentNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  status: 'idle' | 'running' | 'success' | 'warning' | 'error';
  latency: number;
  asi: number;
  currentTask: string;
  Icon: LucideIcon;
}

interface TelemetryPacket {
  id: string;
  from: string;
  to: string;
  progress: number;
  status: 'ok' | 'warn' | 'error';
  payload: string;
}

const INITIAL_NODES: AgentNode[] = [
  { id: 'planner', name: 'Planner Agent', role: 'Query Decomposition', x: 120, y: 190, status: 'success', latency: 8.4, asi: 99.8, currentTask: 'Decomposing hypothesis into sub-queries', Icon: Brain },
  { id: 'retriever', name: 'Search Retriever', role: 'Vector & Tool Ingest', x: 340, y: 90, status: 'success', latency: 24.1, asi: 97.2, currentTask: 'Fetching document embeddings from vector store', Icon: Search },
  { id: 'verifier', name: 'Claim Verifier', role: 'NLI & Grounding Gate', x: 560, y: 90, status: 'success', latency: 27.8, asi: 98.4, currentTask: 'Validating entailment via DeBERTa cross-attention', Icon: ShieldCheck },
  { id: 'tools', name: 'Tool Executor', role: 'Deterministic Assertions', x: 340, y: 290, status: 'success', latency: 1.2, asi: 99.1, currentTask: 'Executing SQL query on cluster registry', Icon: Wrench },
  { id: 'synthesizer', name: 'Synthesis Engine', role: 'Final Consensus', x: 780, y: 190, status: 'success', latency: 88.5, asi: 96.5, currentTask: 'Assembling grounded response with citations', Icon: Sparkles },
];

export function SwarmSimulator() {
  const [scenario, setScenario] = useState<'clean' | 'hallucination' | 'tool_mismatch' | 'drift'>('clean');
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(INITIAL_NODES[2]); // Default verifier
  const [nodes, setNodes] = useState<AgentNode[]>(INITIAL_NODES);
  const [packets, setPackets] = useState<TelemetryPacket[]>([]);
  const [eventLog, setEventLog] = useState<Array<{ id: string; time: string; text: string; type: 'ok' | 'warn' | 'error' | 'info' }>>([
    { id: '1', time: '14:22:01.012', text: 'Telemetry ingest initialized for 5-agent LangGraph workflow', type: 'info' },
    { id: '2', time: '14:22:01.034', text: 'Planner decomposed query into 2 sub-tasks (8.4ms)', type: 'ok' },
    { id: '3', time: '14:22:01.062', text: 'Retriever returned 4 document chunks (cosine score 0.94)', type: 'ok' },
    { id: '4', time: '14:22:01.090', text: 'Verifier confirmed Stage 1 grounding gate passed (27.8ms CPU)', type: 'ok' },
  ]);

  // Update nodes based on scenario
  useEffect(() => {
    if (scenario === 'clean') {
      setNodes([
        { id: 'planner', name: 'Planner Agent', role: 'Query Decomposition', x: 120, y: 190, status: 'success', latency: 8.4, asi: 99.8, currentTask: 'Decomposing hypothesis into sub-queries', Icon: Brain },
        { id: 'retriever', name: 'Search Retriever', role: 'Vector & Tool Ingest', x: 340, y: 90, status: 'success', latency: 24.1, asi: 97.2, currentTask: 'Fetching document embeddings from vector store', Icon: Search },
        { id: 'verifier', name: 'Claim Verifier', role: 'NLI & Grounding Gate', x: 560, y: 90, status: 'success', latency: 27.8, asi: 98.4, currentTask: 'Stage 1 MiniLM + Stage 2 DeBERTa: Grounded (Score: 0.96)', Icon: ShieldCheck },
        { id: 'tools', name: 'Tool Executor', role: 'Deterministic Assertions', x: 340, y: 290, status: 'success', latency: 1.2, asi: 99.1, currentTask: 'All 3/3 tool claims verified against JSON return', Icon: Wrench },
        { id: 'synthesizer', name: 'Synthesis Engine', role: 'Final Consensus', x: 780, y: 190, status: 'success', latency: 88.5, asi: 96.5, currentTask: 'Grounded final payload synthesized with 0 hallucinations', Icon: Sparkles },
      ]);
      setEventLog((prev) => [
        { id: Math.random().toString(), time: new Date().toLocaleTimeString(), text: 'Scenario switched: Clean Execution (Grounded & Consistent)', type: 'ok' },
        ...prev.slice(0, 5),
      ]);
    } else if (scenario === 'hallucination') {
      setNodes([
        { id: 'planner', name: 'Planner Agent', role: 'Query Decomposition', x: 120, y: 190, status: 'success', latency: 8.4, asi: 99.8, currentTask: 'Targeting medical trial summary', Icon: Brain },
        { id: 'retriever', name: 'Search Retriever', role: 'Vector & Tool Ingest', x: 340, y: 90, status: 'success', latency: 22.0, asi: 96.5, currentTask: 'Retrieved trial results: 41% overall response rate', Icon: Search },
        { id: 'verifier', name: 'Claim Verifier', role: 'NLI & Grounding Gate', x: 560, y: 90, status: 'error', latency: 91.2, asi: 84.1, currentTask: 'CONTRADICTION DETECTED: Synthesizer claimed 100% cure rate vs 41% context', Icon: AlertTriangle },
        { id: 'tools', name: 'Tool Executor', role: 'Deterministic Assertions', x: 340, y: 290, status: 'success', latency: 1.5, asi: 98.9, currentTask: 'Clinical database queried successfully', Icon: Wrench },
        { id: 'synthesizer', name: 'Synthesis Engine', role: 'Final Consensus', x: 780, y: 190, status: 'error', latency: 94.0, asi: 78.2, currentTask: 'Injected fabricated claim: "Compound cured 100% of patients"', Icon: XCircle },
      ]);
      setEventLog((prev) => [
        { id: Math.random().toString(), time: new Date().toLocaleTimeString(), text: 'CRITICAL ALERT: Cross-Encoder NLI flagged Contradiction (Risk: 0.88)', type: 'error' },
        ...prev.slice(0, 5),
      ]);
    } else if (scenario === 'tool_mismatch') {
      setNodes([
        { id: 'planner', name: 'Planner Agent', role: 'Query Decomposition', x: 120, y: 190, status: 'success', latency: 7.9, asi: 99.5, currentTask: 'Requesting customer count in EU zone', Icon: Brain },
        { id: 'retriever', name: 'Search Retriever', role: 'Vector & Tool Ingest', x: 340, y: 90, status: 'success', latency: 19.5, asi: 97.8, currentTask: 'Preparing SQL query payload', Icon: Search },
        { id: 'verifier', name: 'Claim Verifier', role: 'NLI & Grounding Gate', x: 560, y: 90, status: 'warning', latency: 31.0, asi: 89.2, currentTask: 'Context is ambiguous; awaiting tool assertion', Icon: ShieldCheck },
        { id: 'tools', name: 'Tool Executor', role: 'Deterministic Assertions', x: 340, y: 290, status: 'error', latency: 0.8, asi: 82.4, currentTask: 'TOOL MISMATCH: Agent asserted 8 records, SQL returned 2 rows', Icon: Zap },
        { id: 'synthesizer', name: 'Synthesis Engine', role: 'Final Consensus', x: 780, y: 190, status: 'warning', latency: 62.0, asi: 85.0, currentTask: 'Output flagged with numerical inconsistency tag', Icon: AlertTriangle },
      ]);
      setEventLog((prev) => [
        { id: Math.random().toString(), time: new Date().toLocaleTimeString(), text: 'WARNING: Tool Assertion Engine detected falsified return count (Claim: 8, DB: 2)', type: 'warn' },
        ...prev.slice(0, 5),
      ]);
    } else if (scenario === 'drift') {
      setNodes([
        { id: 'planner', name: 'Planner Agent', role: 'Query Decomposition', x: 120, y: 190, status: 'success', latency: 9.1, asi: 98.9, currentTask: 'Active with nominal query prompt baseline', Icon: Brain },
        { id: 'retriever', name: 'Search Retriever', role: 'Vector & Tool Ingest', x: 340, y: 90, status: 'warning', latency: 26.4, asi: 72.5, currentTask: 'CENTROID SHIFT: Embedding distance 0.902 > threshold 0.300', Icon: TrendingUp },
        { id: 'verifier', name: 'Claim Verifier', role: 'NLI & Grounding Gate', x: 560, y: 90, status: 'warning', latency: 34.2, asi: 79.4, currentTask: 'Evaluator compensating for semantic distribution shift', Icon: ShieldCheck },
        { id: 'tools', name: 'Tool Executor', role: 'Deterministic Assertions', x: 340, y: 290, status: 'success', latency: 1.4, asi: 98.2, currentTask: 'Tool call parameters stable', Icon: Wrench },
        { id: 'synthesizer', name: 'Synthesis Engine', role: 'Final Consensus', x: 780, y: 190, status: 'warning', latency: 76.8, asi: 81.0, currentTask: 'Generated output variance elevated', Icon: AlertTriangle },
      ]);
      setEventLog((prev) => [
        { id: Math.random().toString(), time: new Date().toLocaleTimeString(), text: 'DRIFT ALERT: Search Retriever ASI degraded to 72.5 / 100 (Centroid spike: 0.902)', type: 'warn' },
        ...prev.slice(0, 5),
      ]);
    }
  }, [scenario]);

  // Animation loop for telemetry packets
  useEffect(() => {
    if (!isPlaying) return;

    const edges = [
      { from: 'planner', to: 'retriever' },
      { from: 'planner', to: 'tools' },
      { from: 'retriever', to: 'verifier' },
      { from: 'tools', to: 'verifier' },
      { from: 'verifier', to: 'synthesizer' },
    ];

    const interval = setInterval(() => {
      setPackets((prev) => {
        // Move existing packets
        const updated = prev
          .map((p) => ({ ...p, progress: p.progress + 0.04 }))
          .filter((p) => p.progress < 1);

        // Spawn new packet occasionally
        if (Math.random() > 0.45 && updated.length < 5) {
          const edge = edges[Math.floor(Math.random() * edges.length)];
          const isBad = scenario === 'hallucination' && (edge.to === 'verifier' || edge.to === 'synthesizer');
          const isWarn = scenario === 'tool_mismatch' && edge.from === 'tools';
          updated.push({
            id: Math.random().toString(),
            from: edge.from,
            to: edge.to,
            progress: 0,
            status: isBad ? 'error' : isWarn ? 'warn' : 'ok',
            payload: isBad ? 'Contradiction vector (0.88)' : isWarn ? 'Regex assertion payload' : 'Span telemetry (27.8ms)',
          });
        }
        return updated;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, scenario]);

  const getNodePos = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  };

  return (
    <div className="w-full rounded-2xl bg-[#0a0c14] border border-white/10 overflow-hidden shadow-2xl">
      {/* Top Header & Scenario Controls */}
      <div className="p-4 sm:p-5 bg-[#0e111a] border-b border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Interactive Multi-Agent Swarm Simulator</span>
              <span className="text-3xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                LIVE TOPOLOGY
              </span>
            </h3>
            <p className="text-2xs text-neutral-400 font-mono mt-0.5">
              Simulates real-time inter-agent contracts, duration waterfalls, and cascaded evaluations.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setScenario('clean')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
              scenario === 'clean'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Clean Swarm</span>
          </button>
          <button
            onClick={() => setScenario('hallucination')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
              scenario === 'hallucination'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Injected Contradiction</span>
          </button>
          <button
            onClick={() => setScenario('tool_mismatch')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
              scenario === 'tool_mismatch'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Tool Discrepancy</span>
          </button>
          <button
            onClick={() => setScenario('drift')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
              scenario === 'drift'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Centroid Shift</span>
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all cursor-pointer"
            title={isPlaying ? 'Pause simulation' : 'Play simulation'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 relative">
        {/* Left 8 Cols: Topology Graph */}
        <div className="lg:col-span-8 p-6 relative min-h-[380px] flex items-center justify-center bg-[#07080d]/80 select-none overflow-hidden">
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 900 380" preserveAspectRatio="xMidYMid meet">
            {/* Defs for gradients & filters */}
            <defs>
              <linearGradient id="lineGradOk" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="lineGradError" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#fb7185" stopOpacity="0.8" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Static Edges */}
            {[
              { from: 'planner', to: 'retriever' },
              { from: 'planner', to: 'tools' },
              { from: 'retriever', to: 'verifier' },
              { from: 'tools', to: 'verifier' },
              { from: 'verifier', to: 'synthesizer' },
            ].map((edge, idx) => {
              const start = getNodePos(edge.from);
              const end = getNodePos(edge.to);
              const isAffected = scenario === 'hallucination' && edge.to === 'synthesizer';

              return (
                <g key={idx}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={isAffected ? '#f43f5e' : 'rgba(255, 255, 255, 0.15)'}
                    strokeWidth={isAffected ? 2 : 1.5}
                    strokeDasharray={isAffected ? '4 4' : undefined}
                  />
                </g>
              );
            })}

            {/* Animated Telemetry Packets */}
            {packets.map((p) => {
              const start = getNodePos(p.from);
              const end = getNodePos(p.to);
              const curX = start.x + (end.x - start.x) * p.progress;
              const curY = start.y + (end.y - start.y) * p.progress;
              const color = p.status === 'error' ? '#f43f5e' : p.status === 'warn' ? '#fbbf24' : '#22d3ee';

              return (
                <g key={p.id}>
                  <circle cx={curX} cy={curY} r="4" fill={color} filter="url(#glow)" />
                  <circle cx={curX} cy={curY} r="8" fill={color} opacity="0.25" />
                </g>
              );
            })}
          </svg>

          {/* Render Agent Nodes */}
          <div className="relative w-full h-[380px] max-w-[900px]">
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isError = node.status === 'error';
              const isWarning = node.status === 'warning';

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    position: 'absolute',
                    left: `${(node.x / 900) * 100}%`,
                    top: `${(node.y / 380) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className={`group cursor-pointer transition-all duration-200 ${
                    isSelected ? 'scale-110 z-20' : 'hover:scale-105 z-10'
                  }`}
                >
                  <div
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center relative backdrop-blur-md transition-all shadow-xl ${
                      isError
                        ? 'bg-rose-950/80 border-2 border-rose-500 shadow-rose-500/30'
                        : isWarning
                        ? 'bg-amber-950/80 border-2 border-amber-500 shadow-amber-500/30'
                        : isSelected
                        ? 'bg-[#151926] border-2 border-cyan-400 shadow-cyan-500/20'
                        : 'bg-[#0f121c]/90 border border-white/20 hover:border-white/40'
                    }`}
                  >
                    <node.Icon className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
                    <span className="text-3xs font-mono font-bold text-white mt-0.5 truncate max-w-[50px]">
                      {node.id}
                    </span>

                    {/* Status Pip */}
                    <span
                      className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#07080d] ${
                        isError ? 'bg-rose-500 animate-ping' : isWarning ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                  </div>

                  {/* Node Label Below */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 text-center whitespace-nowrap pointer-events-none">
                    <span className="text-3xs font-mono font-bold text-white px-2 py-0.5 rounded bg-black/60 border border-white/10">
                      {node.name}
                    </span>
                    <div className="text-4xs font-mono text-neutral-400 mt-0.5">
                      ASI: {node.asi.toFixed(1)} &bull; {node.latency}ms
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 4 Cols: Selected Node Deep-Dive Inspector */}
        <div className="lg:col-span-4 p-5 bg-[#0e111a] border-t lg:border-t-0 lg:border-l border-white/[0.08] flex flex-col justify-between space-y-4">
          {selectedNode ? (
            <div className="space-y-4 font-mono">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <selectedNode.Icon className="w-5 h-5" aria-hidden="true" />
                  <div>
                    <h4 className="text-xs font-bold text-white">{selectedNode.name}</h4>
                    <p className="text-3xs text-neutral-400">{selectedNode.role}</p>
                  </div>
                </div>
                <span
                  className={`text-3xs font-bold px-2 py-0.5 rounded uppercase ${
                    selectedNode.status === 'error'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : selectedNode.status === 'warning'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {selectedNode.status === 'error' ? 'Flagged' : selectedNode.status === 'warning' ? 'Degraded' : 'Optimal'}
                </span>
              </div>

              {/* Node Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-2xs">
                <div className="p-2.5 rounded-xl bg-[#08090d] border border-white/[0.06]">
                  <span className="text-3xs text-neutral-400 uppercase">Agent Stability (ASI)</span>
                  <p className="text-sm font-bold text-white mt-0.5">{selectedNode.asi.toFixed(1)} / 100</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#08090d] border border-white/[0.06]">
                  <span className="text-3xs text-neutral-400 uppercase">Step Latency (P50)</span>
                  <p className="text-sm font-bold text-white mt-0.5">{selectedNode.latency} ms</p>
                </div>
              </div>

              {/* Live Evaluator Action */}
              <div className="space-y-1.5">
                <label className="text-3xs text-neutral-400 uppercase tracking-wider">Active Evaluator State</label>
                <div className="p-3 rounded-xl bg-[#08090d] border border-white/[0.08] text-xs text-neutral-200 leading-relaxed font-sans">
                  {selectedNode.currentTask}
                </div>
              </div>

              {/* Inter-Agent Contract Verification */}
              <div className="space-y-1.5 text-3xs text-neutral-400">
                <div className="flex justify-between">
                  <span>Input Privacy Hash:</span>
                  <span className="text-white font-mono">0x4a91..f8e2</span>
                </div>
                <div className="flex justify-between">
                  <span>Inference Mode:</span>
                  <span className="text-emerald-400 font-mono">Local CPU (Zero 3rd-party API)</span>
                </div>
                <div className="flex justify-between">
                  <span>Ingest Overhead:</span>
                  <span className="text-white font-mono">&lt;0.005 ms</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-xs font-mono text-neutral-500">
              Click any agent node on the canvas to inspect its real-time telemetry.
            </div>
          )}

          {/* Live Telemetry Event Stream */}
          <div className="pt-3 border-t border-white/[0.08] space-y-2 font-mono">
            <div className="flex items-center justify-between text-3xs text-neutral-400 uppercase">
              <span>Telemetry Stream</span>
              <span className="text-cyan-400 animate-pulse">&bull; Live</span>
            </div>
            <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1 text-3xs">
              {eventLog.map((ev) => (
                <div key={ev.id} className="flex items-start gap-1.5 leading-tight">
                  <span className="text-neutral-500 shrink-0">{ev.time.split(' ')[0]}</span>
                  <span
                    className={
                      ev.type === 'error'
                        ? 'text-rose-400 font-bold'
                        : ev.type === 'warn'
                        ? 'text-amber-400'
                        : ev.type === 'ok'
                        ? 'text-emerald-400'
                        : 'text-neutral-400'
                    }
                  >
                    {ev.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
