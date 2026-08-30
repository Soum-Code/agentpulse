import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Layers,
  Play,
  Radio,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
  BookOpen,
  DollarSign,
  HelpCircle,
  Github,
  Globe,
  TrendingUp,
} from 'lucide-react';
import { SpatialSceneMode } from '../spatial/SpatialInstrument';
import { SwarmSimulator } from '../components/website/SwarmSimulator';
import { BentoPillars } from '../components/website/BentoPillars';
import { ComparisonMatrix } from '../components/website/ComparisonMatrix';
import { CostCalculator } from '../components/website/CostCalculator';
import { SdkStudio } from '../components/website/SdkStudio';
import { WhitepaperModal } from '../components/website/WhitepaperModal';
import { LiveBackendBridge } from '../components/website/LiveBackendBridge';
import { FaqSection } from '../components/website/FaqSection';

interface LandingViewProps {
  onEnter: () => void;
  sceneMode: SpatialSceneMode;
  onChangeSceneMode: (mode: SpatialSceneMode) => void;
}

const EVAL_SCENARIOS = [
  {
    id: 'clean',
    name: 'Clean Execution',
    role: 'Stage 1 + 2 Consensus',
    claim: 'Transformer self-attention computes query-key dot products with O(N^2) complexity.',
    context: 'Standard transformer self-attention computes dot products across all token pairs, resulting in quadratic O(N^2) memory scaling with sequence length.',
    toolReturn: 'Found 3 papers confirming O(N^2) quadratic attention scaling.',
    verdict: 'GROUNDED',
    verdictType: 'ok',
    cosineScore: 0.96,
    stage: 'Stage 1 (MiniLM ~27.8ms Cosine Gate)',
    debertaNli: 'Entailment',
    toolMatch: 'Verified (3/3 claims matched tool return)',
  },
  {
    id: 'hallucination',
    name: 'Fabricated Claim',
    role: 'NLI Contradiction',
    claim: 'The 2024 trial demonstrated that compound AP-402 cured 100% of patients with zero side effects.',
    context: 'Phase II trial for AP-402 showed a 41% overall response rate with mild to moderate nausea reported in 28% of participants.',
    toolReturn: 'Clinical trial records show 41% ORR, not 100%.',
    verdict: 'CONTRADICTION',
    verdictType: 'bad',
    cosineScore: 0.38,
    stage: 'Stage 2 (DeBERTa NLI Cross-Attention ~88ms)',
    debertaNli: 'Contradiction',
    toolMatch: 'Failed (Injected numerical discrepancy)',
  },
  {
    id: 'tool_mismatch',
    name: 'Tool Return Mismatch',
    role: 'Deterministic Regex Check',
    claim: 'Retrieved 8 customer records from the EU database region.',
    context: 'Executed SQL query on customer database with region filter EU.',
    toolReturn: 'Query returned 2 rows: [ID_104, ID_109]',
    verdict: 'TOOL MISMATCH',
    verdictType: 'warn',
    cosineScore: 0.81,
    stage: 'Deterministic Regex Tool Verifier (<1ms)',
    debertaNli: 'Neutral / Ambiguous Context',
    toolMatch: 'Failed (Claimed 8 records, tool returned 2)',
  },
];

export function LandingView({ onEnter, sceneMode, onChangeSceneMode }: LandingViewProps) {
  const [activeScenarioId, setActiveScenarioId] = useState('clean');
  const [copiedPip, setCopiedPip] = useState(false);
  const [isWhitepaperOpen, setIsWhitepaperOpen] = useState(false);

  const activeScenario = EVAL_SCENARIOS.find((s) => s.id === activeScenarioId) || EVAL_SCENARIOS[0];

  const handleCopyPip = () => {
    navigator.clipboard.writeText('pip install agentpulse');
    setCopiedPip(true);
    setTimeout(() => setCopiedPip(false), 2000);
  };

  return (
    <div className="relative z-10 min-h-screen overflow-y-auto overflow-x-hidden selection:bg-cyan-500/20 selection:text-cyan-300 pb-32">
      {/* ─── Top Sticky Minimal Navigation ─────────────────────────── */}
      <header className="sticky top-0 z-40 w-full px-6 py-3.5 flex items-center justify-between border-b border-white/[0.08] bg-[#05060b]/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-sm text-black shadow-lg shadow-cyan-500/20">
            AP
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-white font-sans">AgentPulse</span>
            <span className="hidden sm:inline-block text-3xs font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400">
              v0.1.0-beta &bull; Self-hosted
            </span>
          </div>
        </div>

        {/* Center Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-mono text-neutral-400">
          <a href="#simulator" className="hover:text-white transition-colors">
            Swarm Simulator
          </a>
          <a href="#pillars" className="hover:text-white transition-colors">
            Six Pillars
          </a>
          <a href="#evaluation" className="hover:text-white transition-colors">
            Cascaded Evaluator
          </a>
          <a href="#benchmarks" className="hover:text-white transition-colors">
            Benchmark Matrix
          </a>
          <a href="#calculator" className="hover:text-white transition-colors">
            ROI Calculator
          </a>
          <a href="#sdk" className="hover:text-white transition-colors">
            SDK Studio
          </a>
          <a href="#faq" className="hover:text-white transition-colors">
            FAQ
          </a>
        </nav>

        {/* Right CTA Group */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsWhitepaperOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Whitepaper</span>
          </button>

          <a
            href="https://github.com/Soum-Code/agentpulse"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>

          <button
            onClick={onEnter}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all flex items-center gap-2 cursor-pointer shadow-lg font-mono font-bold"
          >
            <span>Launch Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ─── 1. Asymmetric Editorial Hero ────────────────────────────── */}
      <section className="relative px-6 pt-16 pb-16 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Stark Human-First Editorial Copy */}
        <div className="lg:col-span-7 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-xs font-mono text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Continuous Grounding & Drift Observability for Multi-Agent AI</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1] font-sans">
              The Observability Engine for Multi-Agent AI Swarms.
            </h1>
            <p className="text-sm sm:text-base text-neutral-300 max-w-2xl leading-relaxed font-sans">
              {/* Two capabilities were dropped from this sentence. Inter-agent
                  disagreement and tool-claim validation are shipped but have not
                  held up on external traces, so they are described further down
                  as experimental rather than promised in the headline. The
                  latency figure now names the stage it belongs to: 27.8ms is the
                  Stage 1 cosine gate, not the full cascade (215.9ms). */}
              Catch hallucinations and semantic embedding drift across your multi-agent graph — every span evaluated on CPU, never sampled. A <strong className="text-white font-mono">~27.8ms</strong> cosine gate fronts a DeBERTa-v3 NLI stage (<strong className="text-white font-mono">215.9ms</strong> end-to-end), with zero GPU cost and no prompt data leaving your host.
            </p>
          </div>

          {/* Quick CLI Copy Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-1">
            <button
              onClick={onEnter}
              className="px-6 py-3.5 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all flex items-center gap-2 cursor-pointer shadow-xl font-mono font-bold shrink-0"
            >
              <span>Connect to AgentPulse</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div
              onClick={handleCopyPip}
              className="px-4 py-3 rounded-xl bg-[#0e111a] border border-white/10 hover:border-cyan-500/40 text-xs font-mono text-neutral-300 flex items-center gap-3 cursor-pointer group transition-all"
              title="Click to copy quickstart command"
            >
              <span className="text-neutral-500">$</span>
              <span className="text-white group-hover:text-cyan-300 transition-colors">
                {/* `agentpulse init` does not exist -- the SDK declares no
                    console_scripts entry point. Only the import path is real. */}
                pip install agentpulse
              </span>
              {copiedPip ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white" />
              )}
            </div>
          </div>

          {/* Key Measured Metrics (Real Engineering Signals with Provenance) */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/[0.08]">
            <div>
              <p className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">SDK Overhead</p>
              <p className="text-2xl font-bold font-mono text-white mt-1">&lt;0.005 ms</p>
              <p className="text-3xs text-neutral-500 mt-0.5 font-mono">tests/test_sdk.py</p>
            </div>
            <div>
              <p className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">Stage 1 Latency</p>
              <p className="text-2xl font-bold font-mono text-cyan-300 mt-1">~27.8 ms</p>
              <p className="text-3xs text-neutral-500 mt-0.5 font-mono">ablation_results.json</p>
            </div>
            <div>
              <p className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">Evaluation Cost</p>
              <p className="text-2xl font-bold font-mono text-emerald-300 mt-1">$0.00 / eval</p>
              <p className="text-3xs text-neutral-500 mt-0.5 font-mono">100% local CPU ONNX</p>
            </div>
          </div>
        </div>

        {/* Right Column: Spatial System Perception Controls & Holographic Preview */}
        <div className="lg:col-span-5 relative flex flex-col items-center justify-center space-y-4">
          <div className="w-full rounded-2xl overflow-hidden border border-white/15 bg-[#0a0c14] shadow-2xl relative group">
            <img
              src="/agentpulse_swarm_architecture.jpg"
              alt="Multi-Agent AI Swarm Neural Telemetry Matrix"
              className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0c14] via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-3xs font-mono text-neutral-300">
              <span className="px-2 py-0.5 rounded bg-black/70 border border-white/10">Multi-Agent Swarm DAG</span>
              <span className="text-cyan-400">&bull; Live Neural Mesh</span>
            </div>
          </div>

          {/* 3D Scene Controls Card */}
          <div className="w-full p-4 rounded-2xl bg-[#0e111a] border border-white/10 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-semibold text-white font-mono uppercase tracking-wider">
                  Spatial Scene Mode
                </span>
              </div>
              <span className="text-3xs font-mono text-neutral-400 uppercase">3D Engine Active</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {(
                [
                  { id: 'constellation', label: 'Topology Graph', Icon: Globe },
                  { id: 'cascade', label: 'Cascade Flow', Icon: Zap },
                  { id: 'drift', label: 'ASI Vector Drift', Icon: TrendingUp },
                  { id: 'threat', label: 'Disagreement Radar', Icon: Shield },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => onChangeSceneMode(mode.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    sceneMode === mode.id
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <mode.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="text-3xs">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Live Backend Health Diagnostic Strip ─────────────────────── */}
      <section className="px-6 py-4 max-w-7xl mx-auto">
        <LiveBackendBridge onEnterConsole={onEnter} />
      </section>

      {/* ─── 2. Interactive Multi-Agent Swarm Simulator ───────────────── */}
      <section id="simulator" className="px-6 py-16 max-w-7xl mx-auto space-y-6">
        <SwarmSimulator />
      </section>

      {/* ─── 3. Six Pillars Bento Grid ───────────────────────────────── */}
      <section id="pillars" className="px-6 py-16 max-w-7xl mx-auto">
        <BentoPillars />
      </section>

      {/* ─── 4. Interactive Cascaded Evaluator Sandbox ───────────────── */}
      <section id="evaluation" className="px-6 py-16 max-w-7xl mx-auto space-y-8 border-t border-white/[0.08]">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Dual-Stage Cascaded Evaluator Engine</span>
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight font-sans">
            How multi-agent spans are evaluated in real time.
          </h2>
          <p className="text-sm text-neutral-300 max-w-2xl font-sans">
            MiniLM-L6-v2 cosine similarity gating, DeBERTa-v3 cross-attention NLI, and deterministic regex assertions evaluate every step with zero GPU dependency.
          </p>
          <p className="text-3xs font-mono text-neutral-500">
            Provenance: <code className="text-neutral-400">experiments/results/ablation_results.json</code> &bull; Model: MiniLM-L6-v2 + DeBERTa-v3-small (CPU ONNX)
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {EVAL_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setActiveScenarioId(scenario.id)}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeScenarioId === scenario.id
                  ? 'bg-white text-black font-bold shadow-md'
                  : 'bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>{scenario.name}</span>
            </button>
          ))}
        </div>

        {/* Sandbox Content Panel */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0a0c14] border border-white/10 space-y-6 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Input Claim & Retrieved Context */}
            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-2">
                <label className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">Agent Generated Claim</label>
                <div className="p-3.5 rounded-xl bg-[#07080d] border border-white/10 text-xs text-white leading-relaxed font-mono">
                  {activeScenario.claim}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">Retrieved Source Context</label>
                <div className="p-3.5 rounded-xl bg-[#07080d] border border-white/10 text-xs text-neutral-300 leading-relaxed font-sans">
                  {activeScenario.context}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">Tool Execution Summary</label>
                  <span className="text-3xs font-mono text-amber-400/80">Deterministic Regex Assertion</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#07080d] border border-white/10 text-xs text-neutral-300 font-mono">
                  {activeScenario.toolReturn}
                </div>
              </div>
            </div>

            {/* Right: Cascade Evaluation Verdict */}
            <div className="lg:col-span-5 p-5 rounded-xl bg-[#0e111a] border border-white/10 space-y-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <span className="text-xs font-semibold text-white font-mono uppercase">Evaluation Verdict</span>
                  <span
                    className={`text-2xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      activeScenario.verdictType === 'ok'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : activeScenario.verdictType === 'bad'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {activeScenario.verdict}
                  </span>
                </div>

                <div className="mt-4 space-y-3.5 text-xs font-mono">
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase">Evaluator Pipeline</span>
                    <p className="text-white font-medium mt-0.5">{activeScenario.stage}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase">Cosine Similarity Gate</span>
                    <p className="text-cyan-300 font-medium mt-0.5">{activeScenario.cosineScore.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase">Cross-Attention NLI Classification</span>
                    <p className="text-white font-medium mt-0.5">{activeScenario.debertaNli}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase">Tool Return Assertion</span>
                    <p className="text-white font-medium mt-0.5">{activeScenario.toolMatch}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08]">
                <button
                  onClick={onEnter}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 cursor-pointer font-mono font-bold"
                >
                  <span>Open Live Trace Inspector</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. Architectural Comparison Matrix ───────────────────────── */}
      <section id="benchmarks" className="px-6 py-16 max-w-7xl mx-auto">
        <ComparisonMatrix />
      </section>

      {/* ─── 6. Interactive ROI & Cost Calculator ─────────────────────── */}
      <section id="calculator" className="px-6 py-16 max-w-7xl mx-auto">
        <CostCalculator />
      </section>

      {/* ─── 7. Developer SDK Quickstart Studio ───────────────────────── */}
      <section id="sdk" className="px-6 py-16 max-w-7xl mx-auto">
        <SdkStudio />
      </section>

      {/* ─── 8. Technical Architecture FAQ ────────────────────────────── */}
      <section id="faq" className="px-6 py-16 max-w-7xl mx-auto">
        <FaqSection />
      </section>

      {/* ─── 9. Technical Whitepaper Modal ────────────────────────────── */}
      <WhitepaperModal isOpen={isWhitepaperOpen} onClose={() => setIsWhitepaperOpen(false)} />

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      <footer className="px-6 py-12 max-w-7xl mx-auto border-t border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-neutral-400 font-mono">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-3xs text-black">
            AP
          </div>
          <span className="font-semibold text-white">AgentPulse</span>
          <span>&bull;</span>
          <span>Open-Source Multi-Agent AI Observability</span>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <button onClick={() => setIsWhitepaperOpen(true)} className="hover:text-white transition-colors cursor-pointer">
            Formulas & Whitepaper
          </button>
          <a href="https://github.com/Soum-Code/agentpulse" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
            GitHub Repo
          </a>
          <button onClick={onEnter} className="hover:text-white transition-colors cursor-pointer text-cyan-400">
            Console Workspace &rarr;
          </button>
        </div>
      </footer>
    </div>
  );
}
