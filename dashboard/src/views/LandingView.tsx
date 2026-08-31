import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Github,
  Globe,
  HelpCircle,
  Layers,
  Play,
  Radio,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Wrench,
  Zap,
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
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const activeScenario = EVAL_SCENARIOS.find((s) => s.id === activeScenarioId) || EVAL_SCENARIOS[0];

  const handleCopyPip = () => {
    navigator.clipboard.writeText('pip install agentpulse');
    setCopiedPip(true);
    setTimeout(() => setCopiedPip(false), 2000);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen w-full selection:bg-yellow-400 selection:text-black pt-16 font-sans">
      {/* ── Fixed Sticky Comic Navigation Bar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full px-4 sm:px-8 py-3.5 flex items-center justify-between border-b-2 border-black bg-[#0e1322]/95 backdrop-blur-2xl shadow-comic transition-all">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-yellow-400 border-2 border-black flex items-center justify-center font-black text-sm text-black shadow-[2px_2px_0px_#000]">
            AP
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-tight text-white font-mono">
              Agent<span className="text-yellow-400">Pulse</span>
            </span>
            <span className="hidden sm:inline-block comic-tag bg-cyan-400 text-black">
              v0.1.0-beta · Self-hosted
            </span>
          </div>
        </div>

        {/* Center Desktop Navigation Links in Comic Frame */}
        <nav className="hidden lg:flex items-center gap-4 text-xs font-mono font-bold text-neutral-300 bg-surface-2 border-2 border-black rounded-2xl px-5 py-2 shadow-comic">
          <button
            type="button"
            onClick={() => scrollToSection('simulator')}
            className="hover:text-yellow-400 transition-colors cursor-pointer"
          >
            Swarm Simulator
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('pillars')}
            className="hover:text-cyan-400 transition-colors cursor-pointer"
          >
            Six Pillars
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('evaluation')}
            className="hover:text-pink-400 transition-colors cursor-pointer"
          >
            Cascaded Evaluator
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('benchmarks')}
            className="hover:text-emerald-400 transition-colors cursor-pointer"
          >
            Benchmark Matrix
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('calculator')}
            className="hover:text-orange-400 transition-colors cursor-pointer"
          >
            ROI Calculator
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('sdk')}
            className="hover:text-purple-400 transition-colors cursor-pointer"
          >
            SDK Studio
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('faq')}
            className="hover:text-yellow-400 transition-colors cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* Right CTA Group */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsWhitepaperOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-surface-2 hover:bg-surface-3 border-2 border-black text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-yellow-400" />
            <span>Whitepaper</span>
          </button>

          <a
            href="https://github.com/Soum-Code/agentpulse"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-surface-2 hover:bg-surface-3 border-2 border-black text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Github className="w-3.5 h-3.5 text-cyan-400" />
            <span>GitHub</span>
          </a>

          <button
            type="button"
            onClick={onEnter}
            className="comic-btn-yellow px-4 py-2 text-xs font-mono flex items-center gap-2 cursor-pointer"
          >
            <span>Launch Console</span>
            <ArrowRight className="w-3.5 h-3.5 text-black" />
          </button>
        </div>
      </header>

      {/* ── 1. Hero Section ── */}
      <section className="relative px-4 sm:px-8 pt-16 pb-20 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        {/* Left Column: High-Contrast Editorial Copy */}
        <div className="lg:col-span-7 space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-yellow-400 border-2 border-black text-xs font-mono font-black text-black shadow-comic">
            <span className="w-2.5 h-2.5 rounded-full bg-black animate-pulse" />
            <span>Continuous Grounding & Drift Observability for Multi-Agent AI</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.08] font-sans">
              The Observability Engine for{' '}
              <span className="wordmark-gradient">Multi-Agent AI Swarms.</span>
            </h1>
            <p className="text-sm sm:text-base text-neutral-300 max-w-2xl leading-relaxed font-sans font-medium">
              Catch hallucinations and semantic embedding drift across your multi-agent graph — every span evaluated on CPU, never sampled. A <strong className="text-yellow-400 font-mono">~27.8ms</strong> cosine gate fronts a DeBERTa-v3 NLI stage (<strong className="text-cyan-400 font-mono">215.9ms</strong> end-to-end), with zero GPU cost and no prompt data leaving your host.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onEnter}
              className="comic-btn-yellow px-7 py-3.5 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Connect to AgentPulse</span>
              <ArrowRight className="w-4 h-4 text-black" />
            </button>

            <div
              onClick={handleCopyPip}
              className="px-4 py-3 rounded-2xl bg-surface-2 border-2 border-black hover:border-yellow-400 text-xs font-mono font-bold text-neutral-300 flex items-center justify-between sm:justify-start gap-3 cursor-pointer shadow-comic active:translate-x-0.5 active:translate-y-0.5 transition-all"
              title="Click to copy quickstart command"
            >
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 font-black">$</span>
                <span className="text-white">
                  pip install agentpulse
                </span>
              </div>
              {copiedPip ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-neutral-400 hover:text-white" />
              )}
            </div>
          </div>

          {/* Key Measured Metrics Strip */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-6 border-t-2 border-black">
            <div className="p-3.5 rounded-2xl bg-surface-2 border-2 border-black shadow-[2px_2px_0px_#000]">
              <p className="text-3xs font-mono text-neutral-400 uppercase font-black tracking-wider">SDK Overhead</p>
              <p className="text-lg sm:text-2xl font-black font-mono text-white mt-1">&lt;0.005 ms</p>
              <p className="text-4xs text-neutral-400 mt-0.5 font-mono">tests/test_sdk.py</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-2 border-2 border-black shadow-[2px_2px_0px_#000]">
              <p className="text-3xs font-mono text-yellow-400 uppercase font-black tracking-wider">Stage 1 Latency</p>
              <p className="text-lg sm:text-2xl font-black font-mono text-yellow-400 mt-1">~27.8 ms</p>
              <p className="text-4xs text-neutral-400 mt-0.5 font-mono">MiniLM Cosine Gate</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-2 border-2 border-black shadow-[2px_2px_0px_#000]">
              <p className="text-3xs font-mono text-emerald-400 uppercase font-black tracking-wider">Evaluation Cost</p>
              <p className="text-lg sm:text-2xl font-black font-mono text-emerald-400 mt-1">$0.00 / eval</p>
              <p className="text-4xs text-neutral-400 mt-0.5 font-mono">100% local CPU ONNX</p>
            </div>
          </div>
        </div>

        {/* Right Column: 3D Perception & Scene Mode Selector */}
        <div className="lg:col-span-5 relative space-y-4">
          <div className="p-5 rounded-3xl bg-surface-2 border-2 border-black shadow-comic-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
                  <Activity className="w-4 h-4 text-black" />
                </div>
                <span className="text-xs font-black text-white font-mono uppercase tracking-wider">
                  Spatial Scene Mode
                </span>
              </div>
              <span className="comic-tag bg-emerald-400 text-black">
                3D Constellation
              </span>
            </div>

            <p className="text-xs font-mono text-neutral-300 leading-relaxed font-semibold">
              Switch the 3D space backdrop to project real-time multi-agent topologies, cascade flows, vector drift, and disagreement radar:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {(
                [
                  { id: 'constellation', label: 'Topology Graph', Icon: Globe, activeStyle: 'bg-yellow-400 text-black border-black' },
                  { id: 'cascade', label: 'Cascade Flow', Icon: Zap, activeStyle: 'bg-cyan-400 text-black border-black' },
                  { id: 'drift', label: 'ASI Vector Drift', Icon: TrendingUp, activeStyle: 'bg-orange-500 text-white border-black' },
                  { id: 'threat', label: 'Disagreement Radar', Icon: Shield, activeStyle: 'bg-pink-500 text-white border-black' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onChangeSceneMode(mode.id)}
                  className={`p-3 rounded-xl border-2 text-left font-bold transition-all cursor-pointer flex items-center gap-2.5 active:translate-x-0.5 active:translate-y-0.5 ${
                    sceneMode === mode.id
                      ? `${mode.activeStyle} shadow-[2px_2px_0px_#000]`
                      : 'bg-surface border-black text-neutral-300 hover:text-white hover:bg-surface-3 shadow-[1px_1px_0px_#000]'
                  }`}
                >
                  <mode.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-3xs font-mono">{mode.label}</span>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t-2 border-black flex items-center justify-between text-3xs font-mono text-neutral-400 font-bold">
              <span>Drag to orbit · Scroll to zoom</span>
              <button
                type="button"
                onClick={onEnter}
                className="text-yellow-400 hover:underline flex items-center gap-1 cursor-pointer font-black"
              >
                <span>Enter Workspace</span>
                <ArrowRight className="w-3 h-3 text-yellow-400" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Backend Health Diagnostic Strip ── */}
      <section className="px-4 sm:px-8 py-4 max-w-7xl mx-auto">
        <LiveBackendBridge onEnterConsole={onEnter} />
      </section>

      {/* ── 2. Interactive Multi-Agent Swarm Simulator ── */}
      <section id="simulator" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto space-y-6">
        <SwarmSimulator />
      </section>

      {/* ── 3. Six Pillars Bento Grid ── */}
      <section id="pillars" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto">
        <BentoPillars />
      </section>

      {/* ── 4. Interactive Cascaded Evaluator Sandbox ── */}
      <section id="evaluation" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto space-y-8 border-t-2 border-black">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400 font-black">
            <ShieldCheck className="w-4 h-4" />
            <span>Dual-Stage Cascaded Evaluator Engine</span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight font-sans">
            How multi-agent spans are evaluated in real time.
          </h2>
          <p className="text-sm text-neutral-300 max-w-2xl font-sans font-medium">
            MiniLM-L6-v2 cosine similarity gating, DeBERTa-v3 cross-attention NLI, and deterministic regex assertions evaluate every step with zero GPU dependency.
          </p>
          <p className="text-3xs font-mono text-neutral-400 font-semibold">
            Provenance: <code className="text-yellow-400">experiments/results/ablation_results.json</code> &bull; Model: MiniLM-L6-v2 + DeBERTa-v3-small (CPU ONNX)
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {EVAL_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => setActiveScenarioId(scenario.id)}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold border-2 active:translate-x-0.5 active:translate-y-0.5 ${
                activeScenarioId === scenario.id
                  ? 'bg-yellow-400 text-black border-black shadow-[2.5px_2.5px_0px_#000]'
                  : 'bg-surface-2 border-black text-neutral-300 hover:text-white hover:bg-surface-3 shadow-[1.5px_1.5px_0px_#000]'
              }`}
            >
              <span>{scenario.name}</span>
            </button>
          ))}
        </div>

        {/* Sandbox Content Panel */}
        <div className="p-6 sm:p-8 rounded-3xl bg-surface-2 border-2 border-black space-y-6 shadow-comic-lg">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Input Claim & Retrieved Context */}
            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-2">
                <label className="text-2xs font-mono text-neutral-400 uppercase font-black tracking-wider">Agent Generated Claim</label>
                <div className="p-3.5 rounded-xl bg-surface border-2 border-black text-xs text-white leading-relaxed font-mono font-bold shadow-[1px_1px_0px_#000]">
                  {activeScenario.claim}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-2xs font-mono text-neutral-400 uppercase font-black tracking-wider">Retrieved Source Context</label>
                <div className="p-3.5 rounded-xl bg-surface border-2 border-black text-xs text-neutral-300 leading-relaxed font-sans shadow-[1px_1px_0px_#000]">
                  {activeScenario.context}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-mono text-neutral-400 uppercase font-black tracking-wider">Tool Execution Summary</label>
                  <span className="comic-tag bg-orange-500 text-white">Deterministic Regex Assertion</span>
                </div>
                <div className="p-3.5 rounded-xl bg-surface border-2 border-black text-xs text-neutral-200 font-mono shadow-[1px_1px_0px_#000]">
                  {activeScenario.toolReturn}
                </div>
              </div>
            </div>

            {/* Right: Cascade Evaluation Verdict */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-surface border-2 border-black space-y-5 flex flex-col justify-between shadow-[2px_2px_0px_#000]">
              <div>
                <div className="flex items-center justify-between pb-3 border-b-2 border-black">
                  <span className="text-xs font-black text-white font-mono uppercase">Evaluation Verdict</span>
                  <span
                    className={`comic-tag ${
                      activeScenario.verdictType === 'ok'
                        ? 'bg-emerald-400 text-black'
                        : activeScenario.verdictType === 'bad'
                        ? 'bg-pink-500 text-white'
                        : 'bg-yellow-400 text-black'
                    }`}
                  >
                    {activeScenario.verdict}
                  </span>
                </div>

                <div className="mt-4 space-y-3.5 text-xs font-mono">
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase font-bold">Evaluator Pipeline</span>
                    <p className="text-white font-bold mt-0.5">{activeScenario.stage}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase font-bold">Cosine Similarity Gate</span>
                    <p className="text-cyan-400 font-black mt-0.5">{activeScenario.cosineScore.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase font-bold">Cross-Attention NLI Classification</span>
                    <p className="text-white font-bold mt-0.5">{activeScenario.debertaNli}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-neutral-400 uppercase font-bold">Tool Return Assertion</span>
                    <p className="text-white font-bold mt-0.5">{activeScenario.toolMatch}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t-2 border-black">
                <button
                  type="button"
                  onClick={onEnter}
                  className="w-full comic-btn-yellow py-2.5 px-4 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Open Live Trace Inspector</span>
                  <ArrowRight className="w-3.5 h-3.5 text-black" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Architectural Comparison Matrix ── */}
      <section id="benchmarks" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto">
        <ComparisonMatrix />
      </section>

      {/* ── 6. Interactive ROI & Cost Calculator ── */}
      <section id="calculator" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto">
        <CostCalculator />
      </section>

      {/* ── 7. Developer SDK Quickstart Studio ── */}
      <section id="sdk" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto">
        <SdkStudio />
      </section>

      {/* ── 8. Technical Architecture FAQ ── */}
      <section id="faq" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto">
        <FaqSection />
      </section>

      {/* ── 9. Technical Whitepaper Modal ── */}
      <WhitepaperModal isOpen={isWhitepaperOpen} onClose={() => setIsWhitepaperOpen(false)} />

      {/* ── Footer ── */}
      <footer className="px-4 sm:px-8 py-12 max-w-7xl mx-auto border-t-2 border-black flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-neutral-400 font-mono font-bold">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-yellow-400 border-2 border-black flex items-center justify-center font-black text-xs text-black shadow-[1.5px_1.5px_0px_#000]">
            AP
          </div>
          <span className="font-black text-white">AgentPulse</span>
          <span>&bull;</span>
          <span>Open-Source Multi-Agent AI Observability</span>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => setIsWhitepaperOpen(true)}
            className="hover:text-yellow-400 transition-colors cursor-pointer"
          >
            Formulas & Whitepaper
          </button>
          <a
            href="https://github.com/Soum-Code/agentpulse"
            target="_blank"
            rel="noreferrer"
            className="hover:text-cyan-400 transition-colors"
          >
            GitHub Repo
          </a>
          <button
            type="button"
            onClick={onEnter}
            className="hover:text-yellow-300 transition-colors cursor-pointer text-yellow-400 font-black"
          >
            Console Workspace &rarr;
          </button>
        </div>
      </footer>
    </div>
  );
}
