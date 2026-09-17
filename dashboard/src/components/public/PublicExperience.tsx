import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  ChevronRight,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Search,
  ExternalLink,
  Code2,
  Copy,
  Check,
  Sun,
  Moon,
  Zap,
  Shield,
  Database,
  Cpu,
  Bot,
  TrendingDown,
  Clock,
  RefreshCw,
  BarChart2,
  Eye,
  EyeOff,
  GitBranch,
  Play,
  Eraser,
  Highlighter,
  PenTool,
  Volume2,
  VolumeX,
  Brush
} from 'lucide-react';
import { ConnectModal } from './ConnectModal';
import { LiquidBackgroundCanvas } from './LiquidBackgroundCanvas';
import { CostCalculator } from './CostCalculator';
import { LiveEvaluatorSandbox } from './LiveEvaluatorSandbox';
import { LiveTailStream } from './LiveTailStream';
import { EnterpriseArchDiagram } from './EnterpriseArchDiagram';
import { AnimeAgentSwarmRadar } from './AnimeAgentSwarmRadar';
import { AnimeSignalMesh } from './AnimeSignalMesh';
import { AnimeInteractiveCounter } from './AnimeInteractiveCounter';
import { ChalkSurfacePicker } from './ChalkSurfacePicker';
import { ChalkTactileAnnotation, PresetAnnotation } from './ChalkTactileAnnotation';
import { playChalkTapSound, setChalkAudioMuted, getIsChalkAudioMuted } from '../../utils/chalkAudio';
import { ChalkSurfacePreset } from '../../types';

import { User as FirebaseUser } from 'firebase/auth';

interface PublicExperienceProps {
  onEnterProduct: () => void;
  currentUser?: FirebaseUser | null;
  onOpenAuth?: () => void;
}

export const PublicExperience: React.FC<PublicExperienceProps> = ({ onEnterProduct, currentUser, onOpenAuth }) => {
  const [connectOpen, setConnectOpen] = useState(false);
  const [activeStoryStep, setActiveStoryStep] = useState<number>(0);
  const [pipCopied, setPipCopied] = useState(false);
  const [activeDriftView, setActiveDriftView] = useState<'spatial' | 'analytical'>('spatial');
  const [activeLoopStep, setActiveLoopStep] = useState<number>(0);
  const [isWipingLoopCard, setIsWipingLoopCard] = useState(false);
  const [selectedSdkFramework, setSelectedSdkFramework] = useState<'python' | 'langgraph'>('python');
  
  // Palette mode: 'butter' (Iconic Buttermax canary yellow & deep black), 'dark' (Cyber obsidian), 'chalk' (Studio light)
  const [palette, setPalette] = useState<'butter' | 'dark' | 'chalk'>('dark');

  // Chalk surface preset & custom color
  const [chalkSurface, setChalkSurface] = useState<ChalkSurfacePreset>(() => {
    try {
      const saved = localStorage.getItem('agentpulse_chalk_surface');
      if (saved && (saved === 'classic-white' || saved === 'sepia-slate' || saved === 'emerald-graphite' || saved === 'custom')) {
        return saved as ChalkSurfacePreset;
      }
    } catch {
      // ignore
    }
    return 'classic-white';
  });

  const [chalkCustomColor, setChalkCustomColor] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('agentpulse_chalk_custom_color');
      if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return '#ffffff';
  });

  // Chalk tactile annotations & handwritten highlights state
  const [chalkAnnotationsActive, setChalkAnnotationsActive] = useState<boolean>(true);
  const [isChalkAudioMutedState, setIsChalkAudioMutedState] = useState<boolean>(getIsChalkAudioMuted());

  const handleToggleGlobalChalkAnnotations = () => {
    const next = !chalkAnnotationsActive;
    setChalkAnnotationsActive(next);
    playChalkTapSound();
  };

  const handleToggleChalkAudio = () => {
    const next = !isChalkAudioMutedState;
    setIsChalkAudioMutedState(next);
    setChalkAudioMuted(next);
    if (!next) {
      playChalkTapSound();
    }
  };

  const handleSelectChalkPreset = (preset: ChalkSurfacePreset) => {
    setChalkSurface(preset);
    try {
      localStorage.setItem('agentpulse_chalk_surface', preset);
    } catch {
      // ignore
    }
  };

  const handleSelectChalkCustomColor = (hex: string) => {
    setChalkSurface('custom');
    setChalkCustomColor(hex);
    try {
      localStorage.setItem('agentpulse_chalk_surface', 'custom');
      localStorage.setItem('agentpulse_chalk_custom_color', hex);
    } catch {
      // ignore
    }
  };

  const handleCopyPip = (textToCopy = 'pip install git+https://github.com/Soum-Code/agentpulse.git#subdirectory=sdk') => {
    navigator.clipboard.writeText(textToCopy);
    setPipCopied(true);
    setTimeout(() => setPipCopied(false), 2000);
  };

  const storySteps = [
    {
      title: 'One-Line Instrumentation',
      actor: 'pulse.instrument_llm',
      type: 'agent',
      status: 'ok',
      code: 'client = pulse.instrument_llm(OpenAI())\n# Spans captured fire-and-forget in background thread',
      detail: 'Wraps your existing OpenAI/Anthropic client. Spans are posted asynchronously with zero execution blocking.',
      tokens: 0,
      latency: '< 0.5ms SDK'
    },
    {
      title: 'Agent Dispatches Contradiction',
      actor: 'agent_node / gpt-4o',
      type: 'model',
      status: 'warning',
      code: 'Prompt: "Where is Eiffel Tower? It stands in Paris."\nCompletion: "The Eiffel Tower is located in Berlin."',
      detail: 'Agent generates fluent, grammatically flawless output. Nothing crashed. HTTP 200 OK. But factually contradictory.',
      tokens: 42,
      latency: '310ms'
    },
    {
      title: 'Fast 202 Ingestion (No ML Weights)',
      actor: 'FastAPI /v1/ingest',
      type: 'tool',
      status: 'ok',
      code: 'POST /v1/ingest -> 202 Accepted\nINSERT INTO spans_queue (status="pending")',
      detail: 'API process stays ultra-lean (80MB RAM) without loading heavy ML weights. Spans leased durably in SQLite WAL queue.',
      tokens: 0,
      latency: '1.1ms'
    },
    {
      title: 'DeBERTa NLI Worker Evaluates',
      actor: 'worker.nli_deberta (Local CPU)',
      type: 'evaluator',
      status: 'error',
      code: 'DeBERTa-v3 NLI: contradiction_prob=0.9998\nGrounding Risk: 0.9999 -> [ALERT: GROUNDING_FAILURE]',
      detail: 'Evaluated locally on CPU in 203ms median time. Never calls an external LLM. Zero API cost, zero judge token bills.',
      tokens: 0,
      latency: '203ms CPU'
    }
  ];

  const loopPhases = [
    {
      label: 'OBSERVE',
      subtitle: 'Decoupled Low-Overhead Ingestion',
      description: 'Capture every agent prompt, completion, tool parameter, and span asynchronously. API returns 202 Accepted in about a millisecond, staying lean at 80MB RAM.',
      badge: 'Zero Overhead',
      metric: '< 1.2ms Ingestion',
      metricLabel: '202 Accepted',
      diagramTitle: 'Decoupled Span Stream',
      features: ['Native pulse.instrument_llm() & @pulse.monitor() decorators', 'Durable SQLite WAL queue leases for worker consumption', 'Zero ML weights in ingestion path — fits in 80MB RAM']
    },
    {
      label: 'UNDERSTAND',
      subtitle: 'Behavioral & Centroid Drift Detection',
      description: 'Detect subtle semantic divergence using window_centroid_distance across rolling 20-sample baseline and 12-sample test windows. Drops false alarms from 91.7% to 6.8%.',
      badge: 'MiniLM-L6-v2',
      metric: '91.7% → 6.8%',
      metricLabel: 'False Alarm Reduction',
      diagramTitle: 'Window Centroid Distance Matrix',
      features: ['MiniLM 384-dim dense vectors on local CPU', 'Evaluates once 32 spans are processed in rolling pool', 'Agent Stability Index (ASI 0-100) scoring']
    },
    {
      label: 'INVESTIGATE',
      subtitle: 'Deterministic Failure Discrepancies',
      description: 'Traverse failure-first spans, inter-agent contradiction trees, and exact parameter differences without ever losing breadcrumb context.',
      badge: 'DeBERTa-v3',
      metric: '203ms Median',
      metricLabel: 'Local CPU Inference',
      diagramTitle: 'NLI Contradiction Cross-Encoder',
      features: ['Premise vs hypothesis contradiction scoring', 'Calibrated formula: contradiction + 0.5 * neutral', 'Complete causal trace lineage and discrepancy pinpointing']
    },
    {
      label: 'ACT & CURATE',
      subtitle: 'Production → Dataset → Experiment',
      description: 'Instantly isolate anomalous spans into curated regression datasets, run candidate prompt/model experiments, and deploy hardened guardrails.',
      badge: 'Regression Shield',
      metric: '1-Click Dataset',
      metricLabel: 'Curated Regressions',
      diagramTitle: 'Golden Evaluation Benchmark',
      features: ['One-click production trace to test suite curation', 'Candidate prompt & model A/B evaluation matrix', 'Automated guardrail re-anchoring rules']
    }
  ];

  const sdkSnippets = {
    python: `from agentpulse import AgentPulse
from openai import OpenAI

# 1. Initialize AgentPulse collector
pulse = AgentPulse(endpoint="http://localhost:8000")

# 2. 1-line instrument wrapper on OpenAI or Anthropic client
client = pulse.instrument_llm(OpenAI())

# Spans are sent asynchronously to /v1/ingest in a background thread
# Evaluation runs locally on CPU via MiniLM + DeBERTa — never calling an external LLM
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Where is the Eiffel Tower? It stands in Paris."}]
)`,
    langgraph: `from agentpulse import AgentPulse

pulse = AgentPulse(endpoint="http://localhost:8000")

# Decorate LangGraph state functions without blocking execution
@pulse.monitor(agent_id="researcher", role="researcher")
async def researcher_node(state):
    # Span context propagates automatically via trace_id
    papers = await search_tool(state["query"])
    return {"messages": papers}`,
    // Only the two integrations that work are shown. Three others were here
    // and were removed because none of them ran:
    //
    //   crewai                  imported from agentpulse.adapters, which is not
    //                           a module (it is agentpulse.integrations), and
    //                           CrewAIAdapter.__init__ raises NotImplementedError
    //   enterprise_ring_buffer  BufferConfig and ScrubbingPolicy appear in no
    //                           Python file in this repository
    //   github_action           there is no .github directory, and no such
    //                           published action
  };

  const customChalkStyle = (palette === 'chalk' && chalkSurface === 'custom' && chalkCustomColor) ? ({
    '--chalk-surface-bg': chalkCustomColor,
    '--chalk-header-bg': `${chalkCustomColor}f0`,
    '--chalk-header-gradient': `linear-gradient(180deg, ${chalkCustomColor} 0%, ${chalkCustomColor}e6 100%)`,
    '--chalk-card-bg': chalkCustomColor,
    '--chalk-card-gradient': `linear-gradient(180deg, ${chalkCustomColor} 0%, ${chalkCustomColor}f5 100%)`,
    '--chalk-border': 'rgba(0, 0, 0, 0.12)',
    '--chalk-border-hover': 'rgba(0, 0, 0, 0.22)',
    '--chalk-grid-dot': 'rgba(0, 0, 0, 0.16)',
    '--chalk-grid-line': 'rgba(0, 0, 0, 0.07)',
    '--chalk-mote-1': 'rgba(0, 0, 0, 0.25)',
    '--chalk-mote-2': 'rgba(0, 0, 0, 0.2)',
    '--chalk-mote-3': 'rgba(0, 0, 0, 0.15)',
  } as React.CSSProperties) : undefined;

  return (
    <div
      data-chalk-surface={palette === 'chalk' ? chalkSurface : undefined}
      style={customChalkStyle}
      className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 selection:bg-neutral-950 selection:text-yellow-300 ${
        palette === 'butter'
          ? 'text-neutral-950'
          : palette === 'chalk'
          ? 'text-neutral-900'
          : 'text-[#F5F5F7]'
      }`}
    >
      {/* Interactive 3D Liquid Flowing Canvas Background */}
      <LiquidBackgroundCanvas palette={palette} chalkSurface={chalkSurface} chalkCustomColor={chalkCustomColor} />

      {/* Tactile Architectural Paper Grid Overlay for Chalk Mode */}
      {palette === 'chalk' && (
        <div
          className="fixed inset-0 pointer-events-none chalk-canvas-grid z-0 opacity-20"
          aria-hidden="true"
        />
      )}

      <div className="relative z-10">
        {/* Editorial Navigation Header */}
        <header
          className={`sticky top-0 z-40 px-6 sm:px-12 py-4 flex items-center justify-between transition-colors ${
            palette === 'butter'
              ? 'ios-ultra-thin-butter border-b-2 border-neutral-950 text-neutral-950'
              : palette === 'chalk'
              ? 'ios-ultra-thin-chalk border-b border-neutral-200 text-neutral-900'
              : 'ios-ultra-thin ios-ultra-thin-header text-white'
          }`}
        >
        <div className="flex items-center space-x-4">
          <span className="font-mono text-sm tracking-widest font-black uppercase flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                palette === 'butter'
                  ? 'bg-black animate-ping'
                  : palette === 'chalk'
                  ? 'bg-neutral-900 animate-subtle-pulse'
                  : 'bg-white animate-subtle-pulse'
              }`}
            />
            <span className="text-base tracking-tighter font-extrabold">AGENTPULSE</span>
          </span>
          <span
            className={`text-xs font-mono hidden sm:inline-block border-l pl-3 ${
              palette === 'butter'
                ? 'border-black/30 text-neutral-800 font-bold'
                : palette === 'chalk'
                ? 'border-neutral-300 text-neutral-600'
                : 'border-white/[0.12] text-neutral-400'
            }`}
          >
            v2.4 research baseline
          </span>
        </div>

        {/* Center/Right Nav & Theme Palette Switcher */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Chalk Surface Customization (Presets & Custom Color Picker) */}
          {palette === 'chalk' && (
            <ChalkSurfacePicker
              currentPreset={chalkSurface}
              customColor={chalkCustomColor}
              onSelectPreset={handleSelectChalkPreset}
              onSelectCustomColor={handleSelectChalkCustomColor}
            />
          )}

          {/* Palette Switcher */}
          <div
            className={`flex items-center p-1 rounded-full border text-xs font-mono ${
              palette === 'butter'
                ? 'bg-black text-white border-black shadow-sm'
                : palette === 'chalk'
                ? 'bg-neutral-100 border-neutral-300 text-neutral-800 shadow-sm'
                : 'bg-white/[0.05] border-white/[0.12] text-neutral-300'
            }`}
          >
            <button
              onClick={() => setPalette('butter')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 font-bold ${
                palette === 'butter'
                  ? 'bg-amber-300 text-black shadow-xs font-black'
                  : palette === 'chalk'
                  ? 'text-neutral-600 hover:text-neutral-950'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Buttermax Canary Yellow Palette"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Butter</span>
            </button>
            <button
              onClick={() => setPalette('dark')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 ${
                palette === 'dark'
                  ? 'bg-white text-black font-bold shadow-xs'
                  : palette === 'chalk'
                  ? 'text-neutral-600 hover:text-neutral-950'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Obsidian Dark Palette"
            >
              <Moon className="w-3 h-3" />
              <span>Dark</span>
            </button>
            <button
              onClick={() => setPalette('chalk')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 ${
                palette === 'chalk'
                  ? 'bg-neutral-900 text-white font-bold shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Studio Chalk Light Palette"
            >
              <Sun className="w-3 h-3" />
              <span>Chalk</span>
            </button>
          </div>

          <nav className="hidden lg:flex items-center space-x-5 text-xs font-medium">
            <a
              href="#problem"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-900 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-700 hover:text-black' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Failure Modes
            </a>
            <a
              href="#calculator"
              className={`transition-colors font-bold flex items-center space-x-1 ${
                palette === 'butter'
                  ? 'text-amber-950 hover:text-black'
                  : palette === 'chalk'
                  ? 'text-amber-800 hover:text-amber-950'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              <span>ROI Calculator</span>
            </a>
            <a
              href="#sandbox"
              className={`transition-colors font-bold flex items-center space-x-1 ${
                palette === 'butter'
                  ? 'text-emerald-950 hover:text-black'
                  : palette === 'chalk'
                  ? 'text-emerald-800 hover:text-emerald-950'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <span>Live Evaluator</span>
            </a>
            <a
              href="#trace-story"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-950 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-800 hover:text-black font-medium' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Live Trace
            </a>
            <a
              href="#drift"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-950 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-800 hover:text-black font-medium' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Behavioral Drift
            </a>
          </nav>

          <div className="flex items-center space-x-2.5">
            {onOpenAuth && (
              <button
                onClick={onOpenAuth}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                  currentUser
                    ? palette === 'butter'
                      ? 'bg-emerald-300 text-emerald-950 border-2 border-neutral-950 shadow-[2px_2px_0px_#000000]'
                      : palette === 'chalk'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : palette === 'butter'
                    ? 'bg-white text-neutral-950 border-2 border-neutral-950 hover:bg-neutral-100 shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-neutral-100 text-neutral-800 border-neutral-300 hover:bg-neutral-200'
                    : 'bg-white/10 text-neutral-200 border-white/20 hover:bg-white/15'
                }`}
              >
                {currentUser ? (
                  <span className="flex items-center space-x-1.5">
                    <span className={`w-2 h-2 rounded-full ${palette === 'chalk' ? 'bg-emerald-600' : 'bg-emerald-400'}`} />
                    <span>{currentUser.displayName || (currentUser.isAnonymous ? 'Guest' : 'Account')}</span>
                  </span>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            )}
            <button
              onClick={() => setConnectOpen(true)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                palette === 'butter'
                  ? 'bg-white border-2 border-black text-black hover:bg-neutral-100 shadow-[2px_2px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'border border-neutral-300 hover:border-neutral-500 text-neutral-800 bg-white shadow-xs'
                  : 'border border-white/[0.15] hover:border-white/30 text-neutral-200 bg-white/[0.03]'
              }`}
            >
              Connect Agent
            </button>
            <button
              onClick={onEnterProduct}
              className={`px-4 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all shadow-sm ${
                palette === 'butter'
                  ? 'bg-black text-yellow-300 hover:bg-neutral-900 shadow-[3px_3px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'bg-neutral-900 hover:bg-black text-white'
                  : 'bg-[#F5F5F7] hover:bg-white text-neutral-950'
              }`}
            >
              <span>Launch App</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* PERSISTENT AMBIENT OBSERVABILITY BASELINE STRIP                          */}
      {/* ========================================================================= */}
      <div
        className={`border-b px-6 sm:px-12 py-2.5 text-xs font-mono transition-colors flex flex-wrap items-center justify-between gap-3 ${
          palette === 'butter'
            ? 'bg-amber-100/95 border-neutral-950 text-neutral-950 font-bold'
            : palette === 'chalk'
            ? 'bg-slate-100/90 border-slate-300 text-slate-800 font-semibold backdrop-blur-sm'
            : 'bg-black/50 border-white/[0.10] text-neutral-300 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <span
            className={`w-2 h-2 rounded-full ${
              palette === 'butter'
                ? 'bg-black'
                : palette === 'chalk'
                ? 'bg-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.6)]'
                : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
            } animate-pulse`}
          />
          <span className="font-bold tracking-tight">
            AgentPulse — AI Agent Observability &amp; Evaluation Platform
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              palette === 'butter'
                ? 'bg-emerald-300 text-black border border-black shadow-[1px_1px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            Zero LLM Dependencies · Local CPU Evals
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              palette === 'butter'
                ? 'bg-amber-300 text-black border border-black shadow-[1px_1px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-slate-200 text-slate-800 border border-slate-300'
                : 'bg-white/[0.08] text-neutral-200 border border-white/[0.14]'
            }`}
          >
            Editorial Aesthetic Baseline [{palette.toUpperCase()}]
          </span>
          <button
            onClick={onEnterProduct}
            className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition-all underline underline-offset-2 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 hover:bg-neutral-900 no-underline shadow-[2px_2px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-slate-900 text-white hover:bg-black no-underline shadow-xs'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/20 no-underline'
            }`}
          >
            Workspace Mode →
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 01: HERO                                                          */}
      {/* ========================================================================= */}
      <section
        className={`relative pt-16 sm:pt-20 pb-24 sm:pb-28 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        {/* Anime.js Atmospheric Dynamic Telemetry Signal Mesh */}
        <AnimeSignalMesh palette={palette} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          {/* Editorial Typography (Left) */}
          <div className="lg:col-span-6 space-y-8">
            <div className="space-y-4">
              <span
                className={`inline-block px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-wide uppercase ${
                  palette === 'butter'
                    ? 'bg-black text-amber-300 border-2 border-black shadow-[3px_3px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                    : 'badge-editorial text-neutral-300'
                }`}
              >
                [ AI AGENT OBSERVABILITY &amp; EVALUATION ]
              </span>
              <span
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wide uppercase ${
                  palette === 'butter'
                    ? 'bg-emerald-300 text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-800'
                    : 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${palette === 'chalk' ? 'bg-emerald-600' : 'bg-emerald-400'} animate-pulse`} />
                <span>No LLM Dependency</span>
              </span>
              <h1
                className={`text-4xl sm:text-6xl font-black tracking-tight leading-[1.04] ${
                  palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
                }`}
              >
                See what your agents are{' '}
                <span
                  className={`italic font-serif font-normal ${
                    palette === 'butter' ? 'text-neutral-900 underline decoration-black decoration-wavy decoration-2' : palette === 'chalk' ? 'text-neutral-700' : 'text-[#F5F5F7]'
                  }`}
                >
                  actually
                </span>{' '}
                doing.
              </h1>
              <p
                className={`text-lg leading-relaxed pt-2 max-w-lg ${
                  palette === 'butter' ? 'text-neutral-900 font-medium' : palette === 'chalk' ? 'text-neutral-600 font-normal' : 'text-neutral-300 font-normal'
                }`}
              >
                Observe. Evaluate. Investigate. Calm, precise observability engineered for multi-agent reasoning, behavioral drift, and closed-loop research.
              </p>

              {/* Core Differentiator Callout Banner */}
              <div
                className={`p-3.5 rounded-2xl border font-mono text-xs ${
                  palette === 'butter'
                    ? 'bg-neutral-100 border-2 border-black text-black shadow-[4px_4px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-neutral-50 border-neutral-300 text-neutral-800 shadow-xs'
                    : 'bg-white/[0.04] border-white/[0.1] text-neutral-200 shadow-sm'
                }`}
              >
                <div className={`flex items-center space-x-2 font-bold mb-1 ${palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${palette === 'chalk' ? 'bg-emerald-600' : 'bg-emerald-400'} animate-pulse`} />
                  <span className="uppercase tracking-wider">The Moat: AgentPulse never calls an LLM</span>
                </div>
                <p className={`text-[11px] leading-relaxed font-sans ${palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
                  Your models stay outside the system. Evaluations execute 100% locally on CPU via MiniLM (embeddings) &amp; DeBERTa (NLI contradiction). Zero LLM API keys, zero prompt judge bills, and 203ms median latency.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setConnectOpen(true)}
                className={`px-7 py-3.5 text-sm font-black rounded-xl transition-all flex items-center space-x-2 ${
                  palette === 'butter'
                    ? 'bg-black text-amber-300 hover:bg-neutral-900 border-2 border-black shadow-[5px_5px_0px_#000000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-neutral-900 hover:bg-black text-white shadow-lg'
                    : 'bg-[#F5F5F7] hover:bg-white text-neutral-950 shadow-lg'
                }`}
              >
                <span>Connect to AgentPulse</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onEnterProduct}
                className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center space-x-2 ${
                  palette === 'butter'
                    ? 'bg-white hover:bg-neutral-100 text-neutral-950 border-2 border-black shadow-[5px_5px_0px_#000000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'border border-neutral-300 hover:border-neutral-500 bg-white text-neutral-800'
                    : 'border border-white/[0.12] hover:border-white/30 bg-white/[0.04] text-neutral-200 hover:text-white'
                }`}
              >
                <span>Explore Live Workspace</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            </div>

            {/* Quick Micro Stats with Anime.js Interactive Counters */}
            <div
              className={`pt-6 grid grid-cols-3 gap-6 font-mono text-xs ${
                palette === 'butter' ? 'border-t-2 border-neutral-950 text-neutral-950' : palette === 'chalk' ? 'border-t border-neutral-200' : 'border-t border-white/[0.08]'
              }`}
            >
              <div>
                <span className={palette === 'butter' ? 'text-neutral-700 font-bold block' : palette === 'chalk' ? 'text-neutral-500 block' : 'text-neutral-500 block'}>
                  Ingestion Latency
                </span>
                <span
                  className={`text-sm font-black mt-0.5 block ${
                    palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
                  }`}
                >
                  &lt; <AnimeInteractiveCounter targetValue={1.2} decimals={1} suffix=" ms" />
                </span>
              </div>
              <div>
                <span className={palette === 'butter' ? 'text-neutral-700 font-bold block' : palette === 'chalk' ? 'text-neutral-500 block' : 'text-neutral-500 block'}>
                  Eval Latency (CPU)
                </span>
                <span
                  className={`text-sm font-black mt-0.5 block ${
                    palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
                  }`}
                >
                  <AnimeInteractiveCounter targetValue={203} duration={1400} suffix=" ms median" />
                </span>
              </div>
              <div>
                <span className={palette === 'butter' ? 'text-neutral-700 font-bold block' : palette === 'chalk' ? 'text-neutral-500 block' : 'text-neutral-500 block'}>
                  Judge Architecture
                </span>
                <span
                  className={`text-sm font-black mt-0.5 block ${
                    palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-emerald-400'
                  }`}
                >
                  No LLM (100% CPU)
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Real-Time Multi-Agent Swarm Radar powered by Anime.js */}
          <div className="lg:col-span-6 relative z-10">
            <AnimeAgentSwarmRadar
              palette={palette}
              onInspectTraces={onEnterProduct}
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* ENTERPRISE BENCHMARK & ROI CALCULATOR                                      */}
      {/* ========================================================================= */}
      <section id="calculator" className="py-12 px-6 sm:px-12 max-w-7xl mx-auto">
        <CostCalculator palette={palette} />
      </section>

      {/* ========================================================================= */}
      {/* LIVE DEBERTA EVALUATOR SANDBOX (NO SDK REQUIRED)                          */}
      {/* ========================================================================= */}
      <section id="sandbox" className="py-12 px-6 sm:px-12 max-w-7xl mx-auto">
        <LiveEvaluatorSandbox palette={palette} />
      </section>

      {/* ========================================================================= */}
      {/* SECTION 02: THE FAILURE MODES (ELEVATED TO SAME PREMIUM TOUCH)             */}
      {/* ========================================================================= */}
      <section
        id="problem"
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="max-w-3xl mb-12">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 02 · THE FAILURE MODES ]
          </span>
          <h2
            className={`text-3xl sm:text-4xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            Your agents can fail{' '}
            <span
              className={`italic font-serif font-normal ${
                palette === 'butter' ? 'underline decoration-black decoration-2' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
              }`}
            >
              between the lines
            </span>
            .
          </h2>
          <p
            className={`text-base mt-4 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'
            }`}
          >
            Traditional APMs monitor HTTP status codes. But when an autonomous agent hallucinates a schema column, accepts an unverified OCR confidence, or takes an exponential retry loop, the HTTP status is still{' '}
            <code
              className={`font-mono px-2 py-0.5 rounded border text-xs font-semibold ${
                palette === 'butter'
                  ? 'bg-white border-black text-black'
                  : palette === 'chalk'
                  ? 'bg-neutral-100 border-neutral-300 text-neutral-900 font-bold'
                  : 'bg-white/[0.06] border-white/[0.12] text-neutral-200'
              }`}
            >
              200 OK
            </code>
            .
          </p>
        </div>

        {/* 4 Connected Stages with Apple Liquid Dock Material */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {/* Stage 1 */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 hover:-translate-y-0.5'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            {palette === 'chalk' && (
              <ChalkTactileAnnotation
                cardId="stage-01"
                showPresetAnnotations={chalkAnnotationsActive}
                presets={[
                  { id: 'st1-hl', type: 'highlight', x: 2, y: 2, width: 35, color: '#facc15' },
                  { id: 'st1-ul', type: 'underline', x: 4, y: 84, width: 62, color: '#f59e0b' },
                  { id: 'st1-note', type: 'note', text: '⚡ Sub-1.2ms Fanout', x: 26, y: 84, rotation: -2, color: '#b45309' }
                ]}
              />
            )}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className={palette === 'butter' ? 'text-neutral-900 font-bold' : palette === 'chalk' ? 'text-neutral-700 font-semibold' : 'text-neutral-400 font-semibold'}>STAGE 01</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                palette === 'butter'
                  ? 'bg-neutral-950 text-white border border-neutral-950'
                  : palette === 'chalk'
                  ? 'bg-neutral-100 border border-neutral-300 text-neutral-800'
                  : 'bg-white/[0.06] border border-white/[0.1] text-neutral-300'
              }`}>
                DISPATCH
              </span>
            </div>
            <div className={`text-base font-bold mb-1 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Agent Planning</div>
            <p className={`text-xs font-mono leading-relaxed ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Receives user goal &amp; generates 3-stage plan.
            </p>
            <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${
              palette === 'butter' ? 'border-neutral-950 text-neutral-800' : palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/[0.08] text-neutral-400'
            }`}>
              <span className={`font-bold flex items-center space-x-1.5 ${palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-400'}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>Nominal Dispatch</span>
              </span>
              <span className={palette === 'butter' ? 'font-bold text-neutral-950' : ''}>1.2ms</span>
            </div>
          </div>

          {/* Stage 2 */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 hover:-translate-y-0.5'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            {palette === 'chalk' && (
              <ChalkTactileAnnotation
                cardId="stage-02"
                showPresetAnnotations={chalkAnnotationsActive}
                presets={[
                  { id: 'st2-hl', type: 'highlight', x: 2, y: 2, width: 44, color: '#38bdf8' },
                  { id: 'st2-ul', type: 'underline', x: 4, y: 84, width: 60, color: '#0284c7' },
                  { id: 'st2-note', type: 'note', text: '★ 4/4 Columns OK', x: 30, y: 84, rotation: 1.5, color: '#0369a1' }
                ]}
              />
            )}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className={palette === 'butter' ? 'text-neutral-900 font-bold' : palette === 'chalk' ? 'text-neutral-700 font-semibold' : 'text-neutral-400 font-semibold'}>STAGE 02</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                palette === 'butter'
                  ? 'bg-sky-200 border border-neutral-950 text-sky-950'
                  : palette === 'chalk'
                  ? 'bg-sky-100 border border-sky-300 text-sky-900'
                  : 'bg-sky-500/10 border border-sky-500/25 text-sky-400'
              }`}>
                TOOL_CALL
              </span>
            </div>
            <div className={`text-base font-bold mb-1 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Tool Invocation</div>
            <p className={`text-xs font-mono leading-relaxed ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Calls schema catalog. 4 valid columns retrieved.
            </p>
            <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${
              palette === 'butter' ? 'border-neutral-950 text-neutral-800' : palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/[0.08] text-neutral-400'
            }`}>
              <span className={`font-bold flex items-center space-x-1.5 ${palette === 'butter' ? 'text-sky-950' : palette === 'chalk' ? 'text-sky-800' : 'text-sky-400'}`}>
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                <span>Catalog Verified</span>
              </span>
              <span className={palette === 'butter' ? 'font-bold text-neutral-950' : ''}>4.8ms</span>
            </div>
          </div>

          {/* Stage 3 */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 hover:-translate-y-0.5'
                : 'apple-liquid-dock text-white hover:border-amber-400/40'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            {palette === 'chalk' && (
              <ChalkTactileAnnotation
                cardId="stage-03"
                showPresetAnnotations={chalkAnnotationsActive}
                presets={[
                  { id: 'st3-circle', type: 'circle', x: 68, y: 14, width: 44, height: 30, color: '#f59e0b', rotation: -2 },
                  { id: 'st3-hl', type: 'highlight', x: 3, y: 38, width: 46, color: '#fcd34d' },
                  { id: 'st3-note', type: 'note', text: '⚠ Drift Outlier Detected', x: 22, y: 84, rotation: -2, color: '#b45309' }
                ]}
              />
            )}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className={palette === 'butter' ? 'text-amber-950 font-bold' : palette === 'chalk' ? 'text-amber-800 font-semibold' : 'text-amber-400 font-semibold'}>STAGE 03</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                palette === 'butter'
                  ? 'bg-amber-200 border border-neutral-950 text-amber-950'
                  : palette === 'chalk'
                  ? 'bg-amber-100 border border-amber-300 text-amber-900'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
              }`}>
                DRIFT 0.74Δ
              </span>
            </div>
            <div className={`text-base font-bold mb-1 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Model Synthesis</div>
            <p className={`text-xs font-mono leading-relaxed ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Injects context. Hallucinates deprecated column.
            </p>
            <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${
              palette === 'butter' ? 'border-neutral-950 text-neutral-800' : palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/[0.08] text-neutral-400'
            }`}>
              <span className={`font-bold flex items-center space-x-1.5 ${palette === 'butter' ? 'text-amber-950' : palette === 'chalk' ? 'text-amber-800' : 'text-amber-400'}`}>
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse" />
                <span>Deviation Injected</span>
              </span>
              <span className={palette === 'butter' ? 'font-bold text-neutral-950' : ''}>340ms</span>
            </div>
          </div>

          {/* Stage 4: Critical Reveal */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-amber-100 text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'chalk-tactile-card border-rose-300/90 bg-rose-50/75 text-neutral-900 hover:-translate-y-0.5'
                : 'apple-liquid-dock border-rose-500/40 text-white hover:border-rose-400/60 shadow-[0_0_24px_rgba(244,63,94,0.12)]'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            {palette === 'chalk' && (
              <ChalkTactileAnnotation
                cardId="stage-04"
                showPresetAnnotations={chalkAnnotationsActive}
                presets={[
                  { id: 'st4-hl', type: 'highlight', x: 16, y: 48, width: 38, color: '#fb7185' },
                  { id: 'st4-arrow', type: 'arrow', x: 80, y: 35, color: '#e11d48' },
                  { id: 'st4-note', type: 'note', text: '✓ Hallucination Caught', x: 22, y: 84, rotation: 1.5, color: '#be123c' }
                ]}
              />
            )}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className={`font-bold ${palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-700' : 'text-rose-400'}`}>STAGE 04 · REVEAL</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                palette === 'butter'
                  ? 'bg-rose-200 border border-neutral-950 text-rose-950'
                  : palette === 'chalk'
                  ? 'bg-rose-100 border border-rose-300 text-rose-900'
                  : 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
              }`}>
                EVAL_REJECT
              </span>
            </div>
            <div className={`text-base font-bold mb-1 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Causal Detection</div>
            <p className={`text-xs font-mono leading-relaxed ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Column <code className={`px-1 py-0.5 rounded border ${
                palette === 'butter'
                  ? 'text-rose-950 bg-white border-neutral-950 font-bold'
                  : palette === 'chalk'
                  ? 'text-rose-900 bg-rose-100 border-rose-300 font-bold'
                  : 'text-rose-300 bg-rose-500/20 border-rose-500/30 font-semibold'
              }`}>usage_tier_id</code> missing. Discrepancy caught.
            </p>
            <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${
              palette === 'butter' ? 'border-neutral-950 text-neutral-800' : palette === 'chalk' ? 'border-neutral-200 text-neutral-600' : 'border-white/[0.08] text-neutral-400'
            }`}>
              <span className={`font-bold flex items-center space-x-1.5 ${palette === 'butter' ? 'text-rose-950' : palette === 'chalk' ? 'text-rose-800' : 'text-rose-500'}`}>
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
                <span>Zero Hallucination Escape</span>
              </span>
              <span className={palette === 'butter' ? 'font-bold text-neutral-950' : ''}>2.4ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 03: THE OPERATING SYSTEM (ELEVATED INTERACTIVE FLYWHEEL)          */}
      {/* ========================================================================= */}
      <section
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 03 · THE OPERATING SYSTEM ]
          </span>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            The Autonomous Agent Feedback Loop
          </h2>
          <p
            className={`text-sm max-w-xl mx-auto ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            Four continuous, connected disciplines engineered to take multi-agent systems from black-box unpredictability to verified production assets.
          </p>
        </div>

        {/* 4 Loop Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {loopPhases.map((phase, idx) => (
            <button
              key={phase.label}
              onClick={() => setActiveLoopStep(idx)}
              className={`p-5 rounded-2xl text-left transition-all duration-300 border relative overflow-hidden ${
                activeLoopStep === idx
                  ? palette === 'butter'
                    ? 'bg-black text-white border-2 border-black shadow-[6px_6px_0px_#000000] -translate-y-1'
                    : palette === 'chalk'
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-xl'
                    : 'apple-liquid-dock border-white/40 text-white shadow-[0_0_30px_rgba(255,255,255,0.06)]'
                  : palette === 'butter'
                  ? 'bg-white text-black border-2 border-black shadow-[3px_3px_0px_#000000] hover:shadow-[5px_5px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                  : 'bg-white/[0.03] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06] hover:border-white/20'
              }`}
            >
              {(activeLoopStep === idx && (palette === 'dark' || palette === 'chalk')) && (
                <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
              )}
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold tracking-wider">{phase.label}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    activeLoopStep === idx
                      ? palette === 'chalk'
                        ? 'bg-neutral-800 text-neutral-200 border-neutral-700'
                        : 'bg-black/40 text-neutral-300 border-white/[0.1]'
                      : palette === 'chalk'
                      ? 'bg-neutral-100 text-neutral-700 border-neutral-200'
                      : 'bg-black/40 text-neutral-300 border-white/[0.1]'
                  }`}
                >
                  {phase.badge}
                </span>
              </div>
              <div className="text-sm font-semibold mt-1 line-clamp-1">{phase.subtitle}</div>
              <div
                className={`text-[11px] font-mono mt-2 flex items-center space-x-1.5 ${
                  activeLoopStep === idx
                    ? palette === 'chalk'
                      ? 'text-neutral-300'
                      : 'text-neutral-400'
                    : palette === 'chalk'
                    ? 'text-neutral-600'
                    : 'text-neutral-400'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{phase.metric}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Active Phase Details Liquid Glass Card */}
        <div
          data-wiping={isWipingLoopCard}
          className={`rounded-3xl p-8 sm:p-10 transition-all duration-300 relative overflow-hidden shadow-2xl ${
            isWipingLoopCard ? 'is-wiping' : ''
          } ${
            palette === 'butter'
              ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
              : palette === 'chalk'
              ? 'chalk-tactile-card text-neutral-900 shadow-xl'
              : 'apple-liquid-dock text-white'
          }`}
        >
          {(palette === 'dark' || palette === 'chalk') && (
            <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
          )}
          {palette === 'chalk' && (
            <ChalkTactileAnnotation
              cardId="loop-evaluator-card"
              showPresetAnnotations={chalkAnnotationsActive}
              presets={[
                { id: 'loop-hl', type: 'highlight', x: 2, y: 10, width: 34, color: '#facc15' },
                { id: 'loop-circle', type: 'circle', x: 72, y: 36, width: 38, height: 28, color: '#fb7185', rotation: -1.5 },
                { id: 'loop-arrow', type: 'arrow', x: 64, y: 62, color: '#16a34a' },
                { id: 'loop-note', type: 'note', text: '★ Ground Truth Verified', x: 46, y: 88, rotation: -2, color: '#047857' }
              ]}
            />
          )}

          {/* Top-Right Clear/Wipe Clean Button */}
          <div className="absolute top-6 right-6 z-20">
            <button
              type="button"
              id="clear-loop-card-btn"
              onClick={() => {
                setIsWipingLoopCard(true);
                setTimeout(() => setIsWipingLoopCard(false), 600);
              }}
              disabled={isWipingLoopCard}
              title="Wipe whiteboard clean"
              aria-label="Wipe chalkboard clean"
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold flex items-center space-x-1.5 transition-all duration-200 active:scale-90 cursor-pointer ${
                palette === 'chalk'
                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-950 border border-neutral-300/80 shadow-2xs'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-neutral-300 hover:text-white border border-white/10'
              }`}
            >
              <Eraser className="w-3 h-3 text-neutral-500" />
              <span>Clear</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Text & Features */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center space-x-3">
                <span className="px-2.5 py-1 rounded-md bg-amber-300 text-neutral-950 text-xs font-mono font-black">
                  PHASE 0{activeLoopStep + 1}
                </span>
                <span className={`text-xs font-mono uppercase tracking-widest ${palette === 'chalk' ? 'text-neutral-600 font-semibold' : 'text-neutral-400'}`}>
                  {loopPhases[activeLoopStep].label} · {loopPhases[activeLoopStep].badge}
                </span>
              </div>

              <div>
                <h3 className={`text-2xl sm:text-3xl font-black tracking-tight mb-3 ${palette === 'chalk' ? 'text-neutral-950' : 'text-white'}`}>
                  {loopPhases[activeLoopStep].subtitle}
                </h3>
                <p className={`text-base leading-relaxed ${palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
                  {loopPhases[activeLoopStep].description}
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                {loopPhases[activeLoopStep].features.map((feature, i) => (
                  <div key={i} className={`flex items-center space-x-3 text-xs sm:text-sm font-mono ${palette === 'chalk' ? 'text-neutral-800' : 'text-neutral-200'}`}>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center space-x-4">
                <button
                  onClick={onEnterProduct}
                  className={`px-6 py-3 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all shadow-md ${
                    palette === 'chalk'
                      ? 'bg-neutral-900 hover:bg-black text-white'
                      : 'bg-[#F5F5F7] hover:bg-white text-neutral-950'
                  }`}
                >
                  <span>Explore in Live Workspace</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right: Interactive Architectural Schematic */}
            <div className={`lg:col-span-5 rounded-2xl p-6 font-mono text-xs space-y-4 relative overflow-hidden shadow-2xl transition-all ${
              palette === 'butter'
                ? 'bg-[#FAF5E8] text-neutral-950 border-2 border-neutral-950 shadow-[6px_6px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-white text-slate-900 border border-slate-300 shadow-xl'
                : 'liquid-glass-card border-glow-subtle text-white'
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />
              <div className={`flex items-center justify-between pb-3 border-b ${
                palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-slate-200' : 'border-white/[0.08]'
              }`}>
                <span className={`text-[11px] uppercase font-bold flex items-center space-x-2 ${
                  palette === 'butter' ? 'text-neutral-900' : palette === 'chalk' ? 'text-slate-800' : 'text-neutral-400'
                }`}>
                  <Activity className={`w-3.5 h-3.5 ${palette === 'butter' ? 'text-amber-600' : palette === 'chalk' ? 'text-amber-700' : 'text-amber-300'}`} />
                  <span>{loopPhases[activeLoopStep].diagramTitle}</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-emerald-300 text-black border border-black shadow-[1px_1px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  LIVE ENGINE
                </span>
              </div>

              <div className="space-y-3">
                <div className={`p-3 rounded-xl flex items-center justify-between border ${
                  palette === 'butter'
                    ? 'bg-white border-neutral-950 text-neutral-950 shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-white/[0.04] border-white/[0.08] text-neutral-300'
                }`}>
                  <span className={palette === 'butter' ? 'font-bold' : palette === 'chalk' ? 'text-slate-700 font-medium' : 'text-neutral-300'}>Throughput Capacity</span>
                  <span className={`font-bold ${palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'}`}>
                    <AnimeInteractiveCounter targetValue={50000} duration={1600} suffix=" spans/sec" />
                  </span>
                </div>
                <div className={`p-3 rounded-xl flex items-center justify-between border ${
                  palette === 'butter'
                    ? 'bg-white border-neutral-950 text-neutral-950 shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-white/[0.04] border-white/[0.08] text-neutral-300'
                }`}>
                  <span className={palette === 'butter' ? 'font-bold' : palette === 'chalk' ? 'text-slate-700 font-medium' : 'text-neutral-300'}>{loopPhases[activeLoopStep].metricLabel}</span>
                  <span className={`font-bold ${palette === 'butter' ? 'text-amber-800 font-black' : palette === 'chalk' ? 'text-amber-800' : 'text-amber-300'}`}>{loopPhases[activeLoopStep].metric}</span>
                </div>
                <div className={`p-3 rounded-xl flex items-center justify-between border ${
                  palette === 'butter'
                    ? 'bg-white border-neutral-950 text-neutral-950 shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-white/[0.04] border-white/[0.08] text-neutral-300'
                }`}>
                  <span className={palette === 'butter' ? 'font-bold' : palette === 'chalk' ? 'text-slate-700 font-medium' : 'text-neutral-300'}>Verification Model</span>
                  <span className={`font-bold ${palette === 'butter' ? 'text-black font-black' : palette === 'chalk' ? 'text-slate-950' : 'text-neutral-100'}`}>Deterministic + LLM Judge</span>
                </div>
              </div>

              <div className={`pt-2 text-[11px] text-center flex items-center justify-center space-x-1.5 ${
                palette === 'butter' ? 'text-neutral-800 font-semibold' : palette === 'chalk' ? 'text-slate-600' : 'text-neutral-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${palette === 'chalk' ? 'bg-emerald-600' : 'bg-emerald-400'} animate-pulse`} />
                <span>Hardware acceleration enabled via SIMD vector kernels</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 04: LIVE TRACE STORY (ELEVATED IDE-GRADE INSPECTOR)                */}
      {/* ========================================================================= */}
      <section
        id="trace-story"
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="max-w-3xl mb-12">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 04 · INTERACTIVE LIVE TRACE STORY ]
          </span>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            Trace execution step-by-step
          </h2>
          <p
            className={`text-sm mt-3 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            Follow the real trace: an agent is given the premise that the Eiffel Tower stands in Paris, but hallucinates that it is located in Berlin. Nothing crashes, HTTP returns 200 OK — until AgentPulse's local DeBERTa NLI cross-encoder detects the contradiction with 0.9998 probability in 203ms.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Step Timeline (Left) */}
          <div className="lg:col-span-5 space-y-3">
            {storySteps.map((step, idx) => (
              <div
                key={step.title}
                onClick={() => setActiveStoryStep(idx)}
                onMouseEnter={() => setActiveStoryStep(idx)}
                className={`p-4 rounded-2xl cursor-pointer transition-all duration-300 ease-out border relative overflow-hidden ${
                  activeStoryStep === idx
                    ? palette === 'butter'
                      ? 'bg-black text-white border-2 border-black shadow-[6px_6px_0px_#000000] -translate-x-1'
                      : palette === 'chalk'
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-lg'
                      : 'apple-liquid-dock border-white/40 text-white shadow-[0_0_24px_rgba(255,255,255,0.06)]'
                    : palette === 'butter'
                    ? 'bg-white text-black border-2 border-black shadow-[2px_2px_0px_#000000] hover:shadow-[4px_4px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                    : 'bg-white/[0.03] border-white/[0.08] text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] hover:border-white/20'
                }`}
              >
                {(activeStoryStep === idx && (palette === 'dark' || palette === 'chalk')) && (
                  <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-xs font-bold text-neutral-400">0{idx + 1}</span>
                    <span className="text-sm font-bold">{step.title}</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] px-2.5 py-0.5 rounded border font-semibold ${
                      step.status === 'ok'
                        ? palette === 'chalk'
                          ? 'border-emerald-300 text-emerald-800 bg-emerald-100'
                          : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-300 bg-emerald-500/10'
                        : step.status === 'warning'
                        ? palette === 'chalk'
                          ? 'border-amber-300 text-amber-800 bg-amber-100'
                          : 'border-amber-500/30 text-amber-600 dark:text-amber-300 bg-amber-500/10'
                        : palette === 'chalk'
                        ? 'border-rose-300 text-rose-800 bg-rose-100'
                        : 'border-rose-500/30 text-rose-600 dark:text-rose-300 bg-rose-500/10'
                    }`}
                  >
                    {step.actor}
                  </span>
                </div>
                <div className={`flex items-center justify-between text-[11px] font-mono mt-2 pt-2 border-t ${palette === 'chalk' ? 'border-neutral-200 text-neutral-500' : 'border-white/[0.06] text-neutral-400'}`}>
                  <span>{step.latency}</span>
                  <span>{step.tokens} tokens</span>
                </div>
              </div>
            ))}
          </div>

          {/* Step Detail Inspector (Right) */}
          <div
            className={`lg:col-span-7 rounded-3xl overflow-hidden transition-all duration-300 shadow-2xl relative ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 shadow-xl'
                : 'apple-liquid-dock text-white'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}

            {/* Inspector Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between text-xs font-mono ${palette === 'chalk' ? 'border-neutral-200 bg-neutral-50/80 text-neutral-700' : 'border-white/[0.1] bg-white/[0.02] text-neutral-200'}`}>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className={`font-bold uppercase ${palette === 'chalk' ? 'text-neutral-950' : 'text-neutral-200'}`}>
                  Span Inspector · {storySteps[activeStoryStep].actor}
                </span>
              </div>
              <span className={palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}>Trace: tr-98410</span>
            </div>

            {/* Inspector Body */}
            <div className="p-6 space-y-6 font-mono text-xs">
              <div>
                <span className={`text-[10px] uppercase font-bold tracking-wider block mb-2 ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  Execution Payload
                </span>
                <div className={`rounded-xl p-4 font-mono text-xs overflow-x-auto leading-relaxed shadow-inner ${palette === 'chalk' ? 'bg-neutral-900 text-neutral-100 border border-neutral-800' : 'bg-black/40 backdrop-blur-xl border border-white/15 text-neutral-200'}`}>
                  {storySteps[activeStoryStep].code}
                </div>
              </div>

              <div>
                <span className={`text-[10px] uppercase font-bold tracking-wider block mb-2 ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  Investigation Findings
                </span>
                <div className={`p-4 rounded-xl text-sm leading-relaxed font-sans ${palette === 'chalk' ? 'bg-neutral-100/90 border border-neutral-200 text-neutral-900' : 'bg-white/[0.03] border border-white/[0.08] text-neutral-200'}`}>
                  {storySteps[activeStoryStep].detail}
                </div>
              </div>

              <div className={`pt-4 border-t grid grid-cols-3 gap-4 text-xs font-mono ${palette === 'chalk' ? 'border-neutral-200 text-neutral-700' : 'border-white/[0.1] text-neutral-300'}`}>
                <div className={`p-3 rounded-lg ${palette === 'chalk' ? 'bg-neutral-100/80 border border-neutral-200' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
                  <span className={`text-[10px] block uppercase ${palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}`}>Duration</span>
                  <span className={`text-sm font-bold mt-0.5 block ${palette === 'chalk' ? 'text-neutral-950' : 'text-white'}`}>{storySteps[activeStoryStep].latency}</span>
                </div>
                <div className={`p-3 rounded-lg ${palette === 'chalk' ? 'bg-neutral-100/80 border border-neutral-200' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
                  <span className={`text-[10px] block uppercase ${palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}`}>Tokens</span>
                  <span className={`text-sm font-bold mt-0.5 block ${palette === 'chalk' ? 'text-neutral-950' : 'text-white'}`}>{storySteps[activeStoryStep].tokens} tok</span>
                </div>
                <div className={`p-3 rounded-lg ${palette === 'chalk' ? 'bg-neutral-100/80 border border-neutral-200' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
                  <span className={`text-[10px] block uppercase ${palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}`}>Grounding Risk</span>
                  <span
                    className={`text-sm font-bold mt-0.5 block ${
                      activeStoryStep === 3
                        ? palette === 'chalk' ? 'text-rose-800' : 'text-rose-500'
                        : palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-500'
                    }`}
                  >
                    {activeStoryStep === 3 ? '0.9999 (REJECT)' : '0.0010 (NOMINAL)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 05: BEHAVIORAL DRIFT DETECTION (ELEVATED VECTOR CANVAS)            */}
      {/* ========================================================================= */}
      <section
        id="drift"
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
          <div className="max-w-2xl">
            <span
              className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
                palette === 'butter'
                  ? 'bg-black text-amber-300 border border-black'
                  : palette === 'chalk'
                  ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                  : 'badge-editorial text-neutral-300'
              }`}
            >
              [ SECTION 05 · BEHAVIORAL DRIFT DETECTION ]
            </span>
            <h2
              className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
                palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
              }`}
            >
              From Normal to Deviation to Drift
            </h2>
            <p
              className={`text-sm mt-3 leading-relaxed ${
                palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}
            >
              Track multi-dimensional behavioral drift across embedding clusters, tool parameter signatures, and output structures before catastrophic failures hit users.
            </p>
          </div>

          <div className={`flex items-center space-x-2 p-1.5 rounded-xl ${
            palette === 'chalk'
              ? 'bg-neutral-100 border border-neutral-300'
              : 'ios-ultra-thin-toolbar border border-white/[0.12]'
          }`}>
            <button
              onClick={() => setActiveDriftView('spatial')}
              className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
                activeDriftView === 'spatial'
                  ? palette === 'chalk'
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'bg-white text-black shadow-sm'
                  : palette === 'chalk'
                  ? 'text-neutral-600 hover:text-neutral-950'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Spatial 3D Trajectory
            </button>
            <button
              onClick={() => setActiveDriftView('analytical')}
              className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
                activeDriftView === 'analytical'
                  ? palette === 'chalk'
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'bg-white text-black shadow-sm'
                  : palette === 'chalk'
                  ? 'text-neutral-600 hover:text-neutral-950'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Analytical Breakdown
            </button>
          </div>
        </div>

        {activeDriftView === 'spatial' ? (
          <div
            className={`rounded-3xl p-6 sm:p-8 relative overflow-hidden flex flex-col transition-all duration-300 shadow-2xl ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 shadow-xl'
                : 'apple-liquid-dock text-white'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            {palette === 'chalk' && (
              <ChalkTactileAnnotation
                cardId="spatial-vector-map"
                showPresetAnnotations={chalkAnnotationsActive}
                presets={[
                  { id: 'spatial-hl', type: 'highlight', x: 2, y: 3, width: 45, color: '#facc15' },
                  { id: 'spatial-circle', type: 'circle', x: 74, y: 32, width: 36, height: 32, color: '#fb7185', rotation: -2 },
                  { id: 'spatial-note', type: 'note', text: '★ Prompt Drift Outlier Cluster', x: 55, y: 75, rotation: -2, color: '#e11d48' }
                ]}
              />
            )}

            <div className={`flex items-center justify-between mb-6 border-b pb-4 ${palette === 'chalk' ? 'border-neutral-200' : 'border-white/10'}`}>
              <div className={`font-mono text-xs flex items-center space-x-2.5 font-bold ${palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-200'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span>Window vs baseline centroid distance &mdash; the API exposes distances, not 2D coordinates</span>
              </div>
              <div className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg shadow-sm border ${
                palette === 'chalk'
                  ? 'text-rose-800 bg-rose-100 border-rose-300'
                  : 'text-rose-600 dark:text-rose-300 bg-rose-500/15 border-rose-500/30'
              }`}>
                Illustrative — schematic, not measured
              </div>
            </div>

            {/* Vector Cluster Grid */}
            <div className="relative h-72 w-full bg-[#050608] rounded-2xl border border-white/[0.08] p-6 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px]" />

              {/* Baseline Cluster */}
              <div className="absolute left-[18%] top-[35%] w-44 h-44 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <span className="text-[11px] font-mono text-emerald-400 font-bold text-center px-2">
                  Nominal baseline<br /><span className="text-[9px] text-emerald-400/70">schematic</span>
                </span>
                <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ left: '28%', top: '38%' }} />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ left: '65%', top: '48%' }} />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ left: '42%', top: '72%' }} />
              </div>

              {/* Trajectory Divergence Line */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <line x1="38%" y1="52%" x2="68%" y2="35%" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="5 5" />
                <polygon points="68%,35 63%,31 63%,39" fill="#f43f5e" />
              </svg>

              {/* Drifted Cluster */}
              <div className="absolute right-[16%] top-[20%] w-48 h-48 rounded-full bg-rose-500/15 border-2 border-rose-500/40 flex items-center justify-center animate-pulse">
                <div className="text-center">
                  <span className="text-[11px] font-mono text-rose-300 font-bold block">Critical Drift Frontier</span>
                  <span className="text-[9px] font-mono text-rose-400/90">Cluster #3 Divergence</span>
                </div>
                <div className="absolute w-3 h-3 rounded-full bg-rose-400" style={{ left: '32%', top: '32%' }} />
                <div className="absolute w-3 h-3 rounded-full bg-rose-400" style={{ left: '58%', top: '42%' }} />
                <div className="absolute w-3 h-3 rounded-full bg-rose-400" style={{ left: '38%', top: '68%' }} />
              </div>
            </div>

            <div className={`mt-6 flex flex-wrap items-center justify-between text-xs font-mono pt-4 border-t gap-4 ${palette === 'chalk' ? 'border-neutral-200 text-neutral-700' : 'border-white/[0.1] text-neutral-300'}`}>
              <span className={`font-semibold flex items-center space-x-2 ${palette === 'chalk' ? 'text-emerald-800' : 'text-emerald-600 dark:text-emerald-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>Nominal Trajectory (Cosine Sim &gt; 0.94)</span>
              </span>
              <span className={`font-semibold flex items-center space-x-2 ${palette === 'chalk' ? 'text-amber-800' : 'text-amber-600 dark:text-amber-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span>12% Parameter Spread (Schema v2 migration)</span>
              </span>
              <span className={`font-bold flex items-center space-x-2 ${palette === 'chalk' ? 'text-rose-800' : 'text-rose-600 dark:text-rose-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block animate-ping" />
                <span>Detected Failure Frontier (Prompt Drift)</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'chalk-tactile-card text-neutral-900 shadow-md'
                  : 'apple-liquid-dock text-white'
              }`}
            >
              {(palette === 'dark' || palette === 'chalk') && (
                <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
              )}
              {palette === 'chalk' && (
                <ChalkTactileAnnotation
                  cardId="param-drift"
                  showPresetAnnotations={chalkAnnotationsActive}
                  presets={[
                    { id: 'pd-ul', type: 'underline', x: 4, y: 46, width: 44, color: '#f59e0b' },
                    { id: 'pd-note', type: 'note', text: 'Schema v2 diff', x: 30, y: 84, rotation: -2, color: '#b45309' }
                  ]}
                />
              )}
              <div className={`text-xs font-mono mb-2 font-semibold ${palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}`}>PARAMETER DRIFT</div>
              <div className="text-4xl font-mono font-black text-amber-500 dark:text-amber-400">0.74 Δ</div>
              <p className={`text-xs mt-3 leading-relaxed font-mono ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>
                Tool call arguments are generating non-standard partition clauses compared to baseline runs.
              </p>
            </div>

            <div
              className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'chalk-tactile-card text-neutral-900 shadow-md'
                  : 'apple-liquid-dock text-white'
              }`}
            >
              {(palette === 'dark' || palette === 'chalk') && (
                <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
              )}
              {palette === 'chalk' && (
                <ChalkTactileAnnotation
                  cardId="semantic-drift"
                  showPresetAnnotations={chalkAnnotationsActive}
                  presets={[
                    { id: 'sd-circle', type: 'circle', x: 42, y: 38, width: 44, height: 30, color: '#fb7185', rotation: 2 },
                    { id: 'sd-note', type: 'note', text: 'Critical anomaly!', x: 26, y: 84, rotation: 1.5, color: '#be123c' }
                  ]}
                />
              )}
              <div className={`text-xs font-mono mb-2 font-semibold ${palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}`}>SEMANTIC EMBEDDING DRIFT</div>
              <div className="text-4xl font-mono font-black text-rose-500 dark:text-rose-400">0.84 Δ</div>
              <p className={`text-xs mt-3 leading-relaxed font-mono ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>
                Response vectors migrated into an outlier cluster following warehouse schema migration.
              </p>
            </div>

            <div
              className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'chalk-tactile-card text-neutral-900 shadow-md'
                  : 'apple-liquid-dock text-white'
              }`}
            >
              {(palette === 'dark' || palette === 'chalk') && (
                <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
              )}
              {palette === 'chalk' && (
                <ChalkTactileAnnotation
                  cardId="eval-agreement"
                  showPresetAnnotations={chalkAnnotationsActive}
                  presets={[
                    { id: 'ea-hl', type: 'highlight', x: 2, y: 36, width: 40, color: '#4ade80' },
                    { id: 'ea-note', type: 'note', text: '✓ 142 flagged runs', x: 26, y: 84, rotation: -1.5, color: '#047857' }
                  ]}
                />
              )}
              <div className={`text-xs font-mono mb-2 font-semibold ${palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'}`}>EVALUATOR AGREEMENT</div>
              <div className={`text-4xl font-mono font-black ${palette === 'chalk' ? 'text-neutral-950' : 'text-neutral-100'}`}>74.8%</div>
              <p className={`text-xs mt-3 leading-relaxed font-mono ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>
                Online evaluations flagged 142 recent executions requiring supervisor review or re-anchoring.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 06: EVIDENCE (THE HONESTY PRINCIPLE - OBSERVED -> MEASURED)        */}
      {/* ========================================================================= */}
      <section
        id="evidence"
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="max-w-3xl mb-12">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 06 · THE HONESTY PRINCIPLE ]
          </span>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            Never show a score without evidence.
          </h2>
          <p
            className={`text-sm mt-3 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            AgentPulse never presents an opaque, ungrounded number. Every evaluation is backed by exact quotes, deterministic measurements, and verifiable causal explanations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            className={`rounded-2xl p-7 relative overflow-hidden transition-all duration-300 ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 shadow-md'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold mb-4 ${
              palette === 'butter'
                ? 'bg-neutral-950 text-amber-300 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-white/[0.06] border border-white/[0.12] text-amber-300'
            }`}>
              01
            </div>
            <h3 className={`text-lg font-bold mb-2 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Observed Reality</h3>
            <p className={`text-xs font-mono leading-relaxed mb-4 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Exact spans, generated prompt tokens, and tool invocations recorded without redaction or loss.
            </p>
            <div className={`p-3.5 rounded-xl font-mono text-[11px] shadow-inner ${
              palette === 'butter'
                ? 'bg-[#FAF5E8] border-2 border-neutral-950 text-neutral-950 font-bold'
                : palette === 'chalk'
                ? 'bg-neutral-100 border border-neutral-300 text-neutral-800'
                : 'bg-black/35 backdrop-blur-xl border border-white/12 text-neutral-200'
            }`}>
              "Generated column reference `t.usage_tier_id` on line 14 of SQL output"
            </div>
          </div>

          <div
            className={`rounded-2xl p-7 relative overflow-hidden transition-all duration-300 ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 shadow-md'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold mb-4 ${
              palette === 'butter'
                ? 'bg-neutral-950 text-sky-300 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-sky-100 text-sky-900 border border-sky-300'
                : 'bg-white/[0.06] border border-white/[0.12] text-sky-300'
            }`}>
              02
            </div>
            <h3 className={`text-lg font-bold mb-2 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Measured Delta</h3>
            <p className={`text-xs font-mono leading-relaxed mb-4 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Deterministic calculation against catalog metadata, AST parser, or rule constraints.
            </p>
            <div className={`p-3.5 rounded-xl font-mono text-[11px] shadow-inner ${
              palette === 'butter'
                ? 'bg-[#FAF5E8] border-2 border-neutral-950 text-neutral-950 font-bold'
                : palette === 'chalk'
                ? 'bg-neutral-100 border border-neutral-300 text-neutral-800'
                : 'bg-black/35 backdrop-blur-xl border border-white/12 text-neutral-200'
            }`}>
              "Warehouse catalog confirmed column is `tier_identifier_code`. Discrepancy: 0.89"
            </div>
          </div>

          <div
            className={`rounded-2xl p-7 relative overflow-hidden transition-all duration-300 ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                : palette === 'chalk'
                ? 'chalk-tactile-card text-neutral-900 shadow-md'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {(palette === 'dark' || palette === 'chalk') && (
              <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold mb-4 ${
              palette === 'butter'
                ? 'bg-neutral-950 text-emerald-300 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : 'bg-white/[0.06] border border-white/[0.12] text-emerald-300'
            }`}>
              03
            </div>
            <h3 className={`text-lg font-bold mb-2 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Causal Explanation</h3>
            <p className={`text-xs font-mono leading-relaxed mb-4 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>
              Actionable root cause explanation with remediation steps and golden dataset integration.
            </p>
            <div className={`p-3.5 rounded-xl font-mono text-[11px] shadow-inner ${
              palette === 'butter'
                ? 'bg-[#FAF5E8] border-2 border-neutral-950 text-neutral-950 font-bold'
                : palette === 'chalk'
                ? 'bg-neutral-100 border border-neutral-300 text-neutral-800'
                : 'bg-black/35 backdrop-blur-xl border border-white/12 text-neutral-200'
            }`}>
              "Model hallucinated column from deprecated v2 schema cached in system context"
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 07: RESEARCH LOOP (TRACE -> CURATE -> DATASET -> EXPERIMENT)     */}
      {/* ========================================================================= */}
      <section
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="max-w-3xl mb-12">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 07 · RESEARCH &amp; EXPERIMENTATION LOOP ]
          </span>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            Turn production failures into permanent test suites
          </h2>
          <p
            className={`text-sm mt-3 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'
            }`}
          >
            Seamlessly bridge production telemetry with evaluation datasets and offline candidate model experiments (Langfuse &amp; Braintrust model).
          </p>
        </div>

        {/* 5-Stage Step Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
          {[
            { step: '01', title: 'Production Trace', desc: 'Capture anomaly in live swarm', tag: 'Custom Ingestion' },
            { step: '02', title: '1-Click Curate', desc: 'Isolate failing span to dataset', tag: 'Data Slicing' },
            { step: '03', title: 'Golden Dataset', desc: 'Maintain versioned benchmarks', tag: 'Ground Truth' },
            { step: '04', title: 'Run Experiment', desc: 'Test prompt/model candidates', tag: 'Eval Matrix' },
            { step: '05', title: 'Deploy Fix', desc: 'Deploy hardened agent & monitor', tag: 'Zero Regression' }
          ].map((item) => (
            <div
              key={item.step}
              className={`rounded-2xl p-5 relative overflow-hidden ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] transition-all duration-300'
                  : palette === 'chalk'
                  ? 'chalk-tactile-card text-neutral-900'
                  : 'apple-liquid-dock text-white hover:border-white/30 transition-all duration-300'
              }`}
            >
              {(palette === 'dark' || palette === 'chalk') && (
                <div className={`absolute inset-x-0 top-0 h-[1px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
              )}
              <div className="flex items-center justify-between mb-2">
                <span className={`font-mono text-xs font-bold ${
                  palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-700 font-semibold' : 'text-neutral-400'
                }`}>STAGE {item.step}</span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                  palette === 'butter'
                    ? 'bg-neutral-950 text-white border-neutral-950 font-bold'
                    : palette === 'chalk'
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
                    : 'bg-white/[0.06] border-white/[0.1] text-neutral-300'
                }`}>
                  {item.tag}
                </span>
              </div>
              <h4 className={`text-sm font-bold mb-1.5 ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>{item.title}</h4>
              <p className={`text-xs leading-relaxed font-mono ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'}`}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* DATADOG-STYLE LIVE TAIL / SPAN INGESTION STREAM                           */}
      {/* ========================================================================= */}
      <section className="py-12 px-6 sm:px-12 max-w-7xl mx-auto">
        <LiveTailStream palette={palette} />
      </section>

      {/* ========================================================================= */}
      {/* ENTERPRISE ARCHITECTURE SPECIFICATION (DUCKDB + ONNX + CLICKHOUSE)        */}
      {/* ========================================================================= */}
      <section className="py-12 px-6 sm:px-12 max-w-7xl mx-auto">
        <EnterpriseArchDiagram palette={palette} />
      </section>

      {/* ========================================================================= */}
      {/* SECTION 08: SDK & COMPACT INSTRUMENTATION                                */}
      {/* ========================================================================= */}
      <section
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="max-w-3xl mb-10">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 08 · COMPACT INSTRUMENTATION ]
          </span>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            Two lines of code to trace everything
          </h2>
          <p
            className={`text-sm mt-3 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            One line for an OpenAI or Anthropic client, or a decorator for LangGraph nodes. A CrewAI adapter does not exist yet.
          </p>
        </div>

        {/* Framework Selector & SDK Terminal */}
        <div
          className={`rounded-3xl p-6 sm:p-8 relative overflow-hidden transition-all duration-300 shadow-2xl ${
            palette === 'butter'
              ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
              : palette === 'chalk'
              ? 'chalk-tactile-card text-neutral-900 shadow-xl'
              : 'apple-liquid-dock text-white'
          }`}
        >
          {(palette === 'dark' || palette === 'chalk') && (
            <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
          )}

          {/* Direct Install Command Banner */}
          <div className={`mb-6 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner relative overflow-hidden ${
            palette === 'chalk'
              ? 'bg-neutral-900 border border-neutral-800 text-white'
              : 'bg-black/35 backdrop-blur-xl border border-white/15'
          }`}>
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-mono font-bold text-amber-300 uppercase">SDK Installation:</span>
                <span className="text-[11px] font-mono text-neutral-400">(Install from Git or local editable)</span>
              </div>
              <code className="text-xs font-mono text-emerald-300 block select-all">
                pip install git+https://github.com/Soum-Code/agentpulse.git#subdirectory=sdk
              </code>
            </div>
            <button
              onClick={() => handleCopyPip('pip install git+https://github.com/Soum-Code/agentpulse.git#subdirectory=sdk')}
              className="self-start sm:self-center flex items-center space-x-2 text-xs font-mono text-neutral-200 bg-white/[0.08] hover:bg-white/[0.15] px-3.5 py-2 rounded-xl border border-white/10 transition-colors"
            >
              {pipCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{pipCopied ? 'Copied' : 'Copy Install Command'}</span>
            </button>
          </div>

          {/* Framework Tabs */}
          <div className={`flex flex-wrap items-center justify-between pb-6 border-b gap-4 ${
            palette === 'chalk' ? 'border-neutral-200' : 'border-white/10'
          }`}>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'python', label: 'Python Native (OpenAI/Anthropic)' },
                { id: 'langgraph', label: 'LangGraph' }
              ].map((fw) => (
                <button
                  key={fw.id}
                  onClick={() => setSelectedSdkFramework(fw.id as any)}
                  className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all font-semibold ${
                    selectedSdkFramework === fw.id
                      ? palette === 'chalk'
                        ? 'bg-neutral-900 text-white shadow-sm'
                        : 'bg-amber-300 text-neutral-950 shadow-sm'
                      : palette === 'chalk'
                      ? 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                      : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {fw.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleCopyPip(sdkSnippets[selectedSdkFramework])}
              className={`flex items-center space-x-2 text-xs font-mono px-4 py-2 rounded-xl transition-colors ${
                palette === 'chalk'
                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
                  : 'text-neutral-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12]'
              }`}
            >
              {pipCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{pipCopied ? 'Copied code snippet' : 'Copy snippet'}</span>
            </button>
          </div>

          <pre className={`font-mono text-xs sm:text-sm pt-6 overflow-x-auto leading-relaxed ${
            palette === 'chalk' ? 'text-neutral-800' : 'text-neutral-200'
          }`}>
            {sdkSnippets[selectedSdkFramework]}
          </pre>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 09: CAPABILITY MATURITY (HONEST SYSTEM LIMITS)                    */}
      {/* ========================================================================= */}
      <section
        id="maturity"
        className={`py-24 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="max-w-3xl mb-12">
          <span
            className={`inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide uppercase mb-3 ${
              palette === 'butter'
                ? 'bg-black text-amber-300 border border-black'
                : palette === 'chalk'
                ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                : 'badge-editorial text-neutral-300'
            }`}
          >
            [ SECTION 09 · CAPABILITY MATURITY ]
          </span>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-950' : 'text-white'
            }`}
          >
            Transparent about system limits
          </h2>
          <p
            className={`text-sm mt-3 leading-relaxed ${
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            We clearly delineate stable general availability detectors from experimental research evaluators so your teams always know what to rely on.
          </p>
        </div>

        <div
          className={`rounded-2xl border overflow-hidden shadow-xl ${
            palette === 'butter'
              ? 'border-2 border-neutral-950 bg-white'
              : palette === 'chalk'
              ? 'border border-neutral-200 bg-white'
              : 'apple-liquid-dock border-white/[0.1]'
          }`}
        >
          <div className={`grid grid-cols-12 px-6 py-3.5 text-xs font-mono uppercase tracking-wider font-bold ${
            palette === 'butter'
              ? 'bg-neutral-950 border-b-2 border-neutral-950 text-amber-300'
              : palette === 'chalk'
              ? 'bg-neutral-100 border-b border-neutral-200 text-neutral-800'
              : 'bg-white/[0.04] border-b border-white/[0.08] text-neutral-400'
          }`}>
            <div className="col-span-4">Capability</div>
            <div className="col-span-3">Maturity Status</div>
            <div className="col-span-5">Implementation Model</div>
          </div>

          <div className={`divide-y text-xs font-mono ${
            palette === 'butter'
              ? 'divide-neutral-950 text-neutral-950'
              : palette === 'chalk'
              ? 'divide-neutral-200 text-neutral-800'
              : 'divide-white/[0.06] text-neutral-200'
          }`}>
            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Execution Traces &amp; Waterfall</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-emerald-300 text-emerald-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                    : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                }`}>
                  GA · STABLE
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Native Custom SpanInput Ingestion Schema</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Behavioral Drift Detection</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-sky-200 text-sky-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-sky-100 border border-sky-300 text-sky-900'
                    : 'bg-sky-500/20 border border-sky-500/40 text-sky-300'
                }`}>
                  BETA
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Rolling Window Centroid Distance (MiniLM-L6-v2, 20+12 pool)</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Schema &amp; Context Grounding</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-sky-200 text-sky-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-sky-100 border border-sky-300 text-sky-900'
                    : 'bg-sky-500/20 border border-sky-500/40 text-sky-300'
                }`}>
                  BETA
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Exact AST &amp; JSON Schema reflection validation</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Multi-Agent Disagreement Matrix</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-amber-200 text-amber-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-amber-100 border border-amber-300 text-amber-900'
                    : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                }`}>
                  EXPERIMENTAL
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Consensus voting across parallel reasoning lanes</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Tool-Claim Alignment Evaluator</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-amber-200 text-amber-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-amber-100 border border-amber-300 text-amber-900'
                    : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                }`}>
                  EXPERIMENTAL
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Natural language assertion vs tool exit status check</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Enterprise CI/CD Breaking Gate</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-emerald-300 text-emerald-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                    : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                }`}>
                  ENTERPRISE
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>GitHub Action with configurable DeBERTa contradiction &amp; ASI thresholds</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Client-Side PII / Secret Masking</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-emerald-300 text-emerald-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                    : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                }`}>
                  ENTERPRISE
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Pre-network regex scrubbing for emails, phone numbers, SSNs and secret-shaped strings &mdash; the patterns the SDK actually ships</div>
            </div>

            <div className={`grid grid-cols-12 px-6 py-4 items-center transition-colors ${palette === 'butter' ? 'hover:bg-amber-50' : palette === 'chalk' ? 'hover:bg-neutral-50' : 'hover:bg-white/[0.02]'}`}>
              <div className={`col-span-4 font-bold ${palette === 'dark' ? 'text-white' : 'text-neutral-950'}`}>Bounded Memory Ring Buffer</div>
              <div className="col-span-3">
                <span className={`px-2.5 py-0.5 rounded font-bold ${
                  palette === 'butter'
                    ? 'bg-emerald-300 text-emerald-950 border border-neutral-950'
                    : palette === 'chalk'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                    : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                }`}>
                  ENTERPRISE
                </span>
              </div>
              <div className={`col-span-5 ${palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-400'}`}>Strict 16MB pre-allocated ring buffer with non-blocking drop-oldest policy</div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 10: COMMAND CENTER CTA                                            */}
      {/* ========================================================================= */}
      <section className="py-24 px-6 sm:px-12 max-w-7xl mx-auto text-center">
        <div
          className={`rounded-3xl p-10 sm:p-14 relative overflow-hidden shadow-2xl transition-all duration-300 ${
            palette === 'butter'
              ? 'border-2 border-neutral-950 bg-black text-white shadow-[12px_12px_0px_#000000]'
              : palette === 'chalk'
              ? 'chalk-tactile-card text-neutral-900 shadow-xl'
              : 'apple-liquid-dock text-white'
          }`}
        >
          {(palette === 'dark' || palette === 'chalk') && (
            <div className={`absolute inset-x-0 top-0 h-[1.5px] pointer-events-none ${palette === 'chalk' ? 'chalk-specular' : 'apple-liquid-specular'}`} />
          )}

          <div className="max-w-2xl mx-auto space-y-6">
            <span
              className={`inline-block px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-wide uppercase ${
                palette === 'butter'
                  ? 'bg-amber-300 text-black'
                  : palette === 'chalk'
                  ? 'bg-neutral-200/80 text-neutral-800 border border-neutral-300/80 font-bold'
                  : 'badge-editorial text-neutral-300'
              }`}
            >
              [ SECTION 10 · READY TO CONNECT ]
            </span>
            <h2 className={`text-4xl sm:text-5xl font-black tracking-tight leading-tight ${palette === 'chalk' ? 'text-neutral-950' : 'text-white'}`}>
              Connect your first agent.
            </h2>
            <p className={`text-base leading-relaxed ${palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-300'}`}>
              Gain complete visibility over reasoning loops, behavioral drift, tool outputs, and evaluation metrics in minutes.
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => setConnectOpen(true)}
                className={`px-8 py-3.5 text-sm font-black rounded-xl transition-all flex items-center space-x-2 shadow-lg ${
                  palette === 'butter'
                    ? 'bg-amber-300 text-black hover:bg-amber-200 shadow-[4px_4px_0px_#ffffff]'
                    : palette === 'chalk'
                    ? 'bg-neutral-900 text-white hover:bg-black shadow-md'
                    : 'bg-[#F5F5F7] hover:bg-white text-neutral-950'
                }`}
              >
                <span>Connect to AgentPulse</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onEnterProduct}
                className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all ${
                  palette === 'chalk'
                    ? 'border border-neutral-300 hover:border-neutral-400 bg-white text-neutral-800 hover:text-neutral-950 shadow-sm'
                    : 'border border-white/[0.15] hover:border-white/30 bg-white/[0.04] text-neutral-200 hover:text-white'
                }`}
              >
                Open Live Investigation Workspace
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer
        className={`border px-6 sm:px-12 py-8 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-xs font-mono gap-4 transition-all rounded-2xl mb-28 ${
          palette === 'butter'
            ? 'border-2 border-black bg-[#FAF5E8]/95 text-black shadow-[4px_4px_0px_#000000]'
            : palette === 'chalk'
            ? 'border-slate-300/90 bg-white/90 text-slate-900 shadow-md backdrop-blur-md'
            : 'border-white/[0.12] bg-[#0c1017]/80 text-neutral-200 backdrop-blur-xl'
        }`}
      >
        <div className="flex items-center space-x-2.5 font-bold tracking-tight">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              palette === 'butter'
                ? 'bg-black'
                : palette === 'chalk'
                ? 'bg-slate-900'
                : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
            }`}
          />
          <span className="text-sm">AgentPulse — AI Agent Observability &amp; Evaluation Platform</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold ${
              palette === 'butter'
                ? 'bg-emerald-300 text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
            }`}
          >
            Zero LLM Dependencies · Local CPU Evals
          </span>
          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold ${
              palette === 'butter'
                ? 'bg-amber-200 text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-slate-100 text-slate-900 border border-slate-300'
                : 'bg-white/[0.08] text-neutral-200 border border-white/[0.15]'
            }`}
          >
            Editorial Aesthetic Baseline
          </span>
          <button
            onClick={onEnterProduct}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
              palette === 'butter'
                ? 'bg-black text-amber-300 hover:bg-neutral-900 shadow-[3px_3px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-slate-900 text-white hover:bg-black shadow-sm'
                : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            Workspace Mode ↗
          </button>
        </div>
      </footer>

      {/* Liquid Glass Connect Modal */}
      <ConnectModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        onVerified={onEnterProduct}
      />

      {/* Floating Chalk Surface Quick-Switcher Dock for persistent control while scrolling */}
      {palette === 'chalk' && (
        <aside
          aria-label="Chalk surface and tactile annotation bar"
          className="fixed bottom-6 right-6 z-40 hidden sm:flex items-center gap-2 p-2 rounded-full ios-ultra-thin-chalk border border-neutral-300 shadow-xl text-xs font-mono select-none"
        >
          {/* Surface Presets */}
          <div className="flex items-center gap-1 border-r border-neutral-300 pr-2">
            <span className="text-[10px] uppercase font-bold text-neutral-500 px-1.5 flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full border border-neutral-400 shrink-0"
                style={{
                  backgroundColor:
                    chalkSurface === 'classic-white'
                      ? '#ffffff'
                      : chalkSurface === 'sepia-slate'
                      ? '#f5efe6'
                      : chalkSurface === 'emerald-graphite'
                      ? '#eaf2ec'
                      : chalkCustomColor,
                }}
              />
              Surface:
            </span>
            <button
              onClick={() => handleSelectChalkPreset('classic-white')}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                chalkSurface === 'classic-white'
                  ? 'bg-neutral-900 text-white font-bold shadow-xs'
                  : 'text-neutral-700 hover:text-black hover:bg-black/5'
              }`}
            >
              White
            </button>
            <button
              onClick={() => handleSelectChalkPreset('sepia-slate')}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                chalkSurface === 'sepia-slate'
                  ? 'bg-[#4a3828] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#5d4632] hover:text-[#281c12] hover:bg-[#5d4632]/10'
              }`}
            >
              Sepia
            </button>
            <button
              onClick={() => handleSelectChalkPreset('emerald-graphite')}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                chalkSurface === 'emerald-graphite'
                  ? 'bg-[#1b4332] text-[#e8f5ec] font-bold shadow-xs'
                  : 'text-[#2d5a45] hover:text-[#0b2416] hover:bg-[#2d5a45]/10'
              }`}
            >
              Emerald
            </button>
          </div>

          {/* Chalk & Marker Annotations Toggle */}
          <button
            onClick={handleToggleGlobalChalkAnnotations}
            title={chalkAnnotationsActive ? "Hide handwritten chalk annotations" : "Show handwritten chalk annotations"}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              chalkAnnotationsActive
                ? 'bg-amber-400 text-neutral-950 font-bold hover:bg-amber-300'
                : 'bg-neutral-200 text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Highlighter className="w-3 h-3" />
            <span>{chalkAnnotationsActive ? 'Chalk Notes ON' : 'Chalk Notes OFF'}</span>
          </button>

          {/* Chalk Acoustic Audio Toggle */}
          <button
            onClick={handleToggleChalkAudio}
            title={isChalkAudioMutedState ? "Unmute chalk tactile audio" : "Mute chalk tactile audio"}
            className={`p-1.5 rounded-full transition-all cursor-pointer ${
              !isChalkAudioMutedState
                ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                : 'bg-neutral-200 text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {!isChalkAudioMutedState ? (
              <Volume2 className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>
        </aside>
      )}
      </div>
    </div>
  );
};
