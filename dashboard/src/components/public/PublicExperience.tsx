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
  GitBranch,
  Play
} from 'lucide-react';
import { ConnectModal } from './ConnectModal';
import { LiquidBackgroundCanvas } from './LiquidBackgroundCanvas';

interface PublicExperienceProps {
  onEnterProduct: () => void;
}

export const PublicExperience: React.FC<PublicExperienceProps> = ({ onEnterProduct }) => {
  const [connectOpen, setConnectOpen] = useState(false);
  const [activeStoryStep, setActiveStoryStep] = useState<number>(0);
  const [pipCopied, setPipCopied] = useState(false);
  const [activeDriftView, setActiveDriftView] = useState<'spatial' | 'analytical'>('spatial');
  const [activeLoopStep, setActiveLoopStep] = useState<number>(0);
  const [selectedSdkFramework, setSelectedSdkFramework] = useState<'python' | 'langgraph' | 'crewai' | 'llamaindex' | 'ts'>('python');
  
  // Palette mode: 'butter' (Iconic Buttermax canary yellow & deep black), 'dark' (Cyber obsidian), 'chalk' (Studio light)
  const [palette, setPalette] = useState<'butter' | 'dark' | 'chalk'>('butter');

  const handleCopyPip = (textToCopy = 'pip install agentpulse') => {
    navigator.clipboard.writeText(textToCopy);
    setPipCopied(true);
    setTimeout(() => setPipCopied(false), 2000);
  };

  const storySteps = [
    {
      title: 'Agent Dispatches Plan',
      actor: 'Autonomous SQL Synthesizer',
      type: 'agent',
      status: 'ok',
      code: 'orchestrator.plan_cohort_query(input="Q3 cohort retention by tier")',
      detail: 'Generated 3-stage execution plan: schema catalog query, dialect compilation, and warehouse dry-run.',
      tokens: 284,
      latency: '1.2ms'
    },
    {
      title: 'Tool Catalog Lookup',
      actor: 'schema_catalog_lookup',
      type: 'tool',
      status: 'ok',
      code: 'schema_catalog.lookup(tables=["analytics.fact_cohort_v3"])',
      detail: 'Warehouse schema returned 4 valid columns: [tenant_id, tier_identifier_code, signup_epoch, bytes_ingested].',
      tokens: 142,
      latency: '4.8ms'
    },
    {
      title: 'Model Generates SQL',
      actor: 'gemini-2.5-flash',
      type: 'model',
      status: 'warning',
      code: 'SELECT tenant_id, usage_tier_id FROM fact_cohort_v3 WHERE signup_epoch > 1704067200',
      detail: 'Model hallucinated column name `usage_tier_id` instead of reflected `tier_identifier_code` due to prompt cache pollution.',
      tokens: 890,
      latency: '340ms'
    },
    {
      title: 'Evaluator Flags Discrepancy',
      actor: 'evaluator.schema_grounding',
      type: 'evaluator',
      status: 'error',
      code: 'grounding_evaluator.evaluate(sql, schema_context) -> score: 0.42 (REJECT)',
      detail: 'Observed 2 non-grounded identifiers. Caught before warehouse query execution cost was incurred.',
      tokens: 104,
      latency: '8.4ms'
    }
  ];

  const loopPhases = [
    {
      label: 'OBSERVE',
      subtitle: 'Continuous Telemetry Ingestion',
      description: 'Capture every autonomous agent prompt, tool argument, nested sub-agent dispatch, and streaming token in real time with OpenTelemetry-compatible traces.',
      badge: 'Zero Overhead',
      metric: '< 1.4ms Ingestion',
      metricLabel: 'P99 Overhead',
      diagramTitle: 'OTel-Native Span Tree',
      features: ['Automatic LangGraph & CrewAI auto-instrumentation', 'Microsecond token streaming latency capture', 'Prompt & tool call argument payload serialization']
    },
    {
      label: 'UNDERSTAND',
      subtitle: 'Behavioral & Trajectory Drift',
      description: 'Detect subtle divergence in tool parameters, embedding distance, and reasoning loops long before catastrophic user-facing incidents happen.',
      badge: 'Spatial Clustering',
      metric: '0.88 Δ Max Divergence',
      metricLabel: 'Cluster Variance',
      diagramTitle: 'UMAP Trajectory Vector Space',
      features: ['Embedding distance shifts across swarm clusters', 'Output schema hallucination detection', 'Cyclic reasoning loop & tool retry traps']
    },
    {
      label: 'INVESTIGATE',
      subtitle: 'Honeycomb & LangSmith Depth',
      description: 'Traverse failure-first spans, parallel agent timeline lanes, and exact token payloads without ever losing breadcrumb context.',
      badge: 'Context-Preserving',
      metric: '100% Causal Trace',
      metricLabel: 'Span Lineage',
      diagramTitle: 'Parallel Multi-Agent Lanes',
      features: ['Failure-first filtered timeline navigation', 'Complete agent input-to-output causal spine', 'Deep tool I/O and payload inspector']
    },
    {
      label: 'ACT & CURATE',
      subtitle: 'Production → Dataset → Experiment',
      description: 'Instantly isolate anomalous spans into curated regression datasets, run candidate prompt/model experiments, and deploy hardened guardrails.',
      badge: 'Braintrust Loop',
      metric: '1-Click Dataset',
      metricLabel: 'Curated Regressions',
      diagramTitle: 'Golden Evaluation Benchmark',
      features: ['One-click production trace to test suite curation', 'Candidate prompt & model A/B evaluation matrix', 'Automated guardrail re-anchoring rules']
    }
  ];

  const sdkSnippets = {
    python: `from agentpulse import observe, pulse

# 1. Initialize high-throughput telemetry collector
pulse.init(api_key="ap_live_key_948f", project="production-swarms")

# 2. Decorate any agent orchestrator, tool, or reasoning loop
@observe(name="autonomous_sql_synthesizer")
def run_agent_pipeline(user_query: str):
    schema = fetch_warehouse_schema()
    sql = generate_sql(user_query, schema)
    return validate_and_execute(sql)`,
    langgraph: `from agentpulse.integrations.langgraph import instrument_langgraph
from langgraph.graph import StateGraph

# Automatically captures state transitions, node hops & evaluator scores
instrument_langgraph(project="finance-analyst-swarm")

workflow = StateGraph(AgentState)
workflow.add_node("planner", planner_node)
workflow.add_node("sql_synth", sql_synthesizer)
app = workflow.compile()`,
    crewai: `from agentpulse.integrations.crewai import instrument_crewai
from crewai import Agent, Crew, Task

# Instruments inter-agent delegations & sub-task dependencies
instrument_crewai(api_key="ap_live_key_948f")

researcher = Agent(role="Data Extractor", goal="Query warehouse")
analyst = Agent(role="Synthesis Engine", goal="Draft report")
crew = Crew(agents=[researcher, analyst], tasks=[task1, task2])`,
    llamaindex: `from agentpulse.integrations.llamaindex import AgentPulseCallbackHandler
from llama_index.core import Settings

# Captures vector retrieval recall, context grounding & reranker latency
Settings.callback_manager.add_handler(
    AgentPulseCallbackHandler(project="enterprise-rag-v3")
)`,
    ts: `import { AgentPulse } from "@agentpulse/sdk";

const pulse = new AgentPulse({
  apiKey: process.env.AGENTPULSE_API_KEY,
  serviceName: "autonomous-support-agent"
});

export const runAgent = pulse.wrap("support_orchestrator", async (query) => {
  const plan = await generatePlan(query);
  return executePlan(plan);
});`
  };

  return (
    <div
      className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 selection:bg-neutral-950 selection:text-yellow-300 ${
        palette === 'butter'
          ? 'text-neutral-950'
          : palette === 'chalk'
          ? 'text-neutral-900'
          : 'text-[#F5F5F7]'
      }`}
    >
      {/* Interactive 3D Liquid Flowing Canvas Background */}
      <LiquidBackgroundCanvas palette={palette} />

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
                palette === 'butter' ? 'bg-black animate-ping' : 'bg-white animate-subtle-pulse'
              }`}
            />
            <span className="text-base tracking-tighter font-extrabold">AGENTPULSE</span>
          </span>
          <span
            className={`text-xs font-mono hidden sm:inline-block border-l pl-3 ${
              palette === 'butter'
                ? 'border-black/30 text-neutral-800 font-bold'
                : palette === 'chalk'
                ? 'border-neutral-300 text-neutral-500'
                : 'border-white/[0.12] text-neutral-400'
            }`}
          >
            v2.4 research baseline
          </span>
        </div>

        {/* Center/Right Nav & Theme Palette Switcher */}
        <div className="flex items-center space-x-4">
          {/* Palette Switcher */}
          <div
            className={`flex items-center p-1 rounded-full border text-xs font-mono ${
              palette === 'butter'
                ? 'bg-black text-white border-black shadow-sm'
                : palette === 'chalk'
                ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-white/[0.05] border-white/[0.12] text-neutral-300'
            }`}
          >
            <button
              onClick={() => setPalette('butter')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center space-x-1 font-bold ${
                palette === 'butter'
                  ? 'bg-amber-300 text-black shadow-xs font-black'
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

          <nav className="hidden lg:flex items-center space-x-6 text-xs font-medium">
            <a
              href="#problem"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-900 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-600 hover:text-black' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Failure Modes
            </a>
            <a
              href="#trace-story"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-900 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-600 hover:text-black' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Live Trace
            </a>
            <a
              href="#drift"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-900 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-600 hover:text-black' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Behavioral Drift
            </a>
            <a
              href="#evidence"
              className={`transition-colors ${
                palette === 'butter' ? 'text-neutral-900 hover:text-black font-bold' : palette === 'chalk' ? 'text-neutral-600 hover:text-black' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Honesty
            </a>
          </nav>

          <div className="flex items-center space-x-2.5">
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
      {/* SECTION 01: HERO                                                          */}
      {/* ========================================================================= */}
      <section
        className={`relative pt-16 sm:pt-20 pb-24 sm:pb-28 px-6 sm:px-12 max-w-7xl mx-auto ${
          palette === 'butter' ? 'border-b-2 border-neutral-950' : palette === 'chalk' ? 'border-b border-neutral-200' : 'border-b border-white/[0.08]'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
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

            {/* Quick Micro Stats */}
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
                  &lt; 1.4 ms
                </span>
              </div>
              <div>
                <span className={palette === 'butter' ? 'text-neutral-700 font-bold block' : palette === 'chalk' ? 'text-neutral-500 block' : 'text-neutral-500 block'}>
                  Tracing Overhead
                </span>
                <span
                  className={`text-sm font-black mt-0.5 block ${
                    palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
                  }`}
                >
                  0.02% CPU
                </span>
              </div>
              <div>
                <span className={palette === 'butter' ? 'text-neutral-700 font-bold block' : palette === 'chalk' ? 'text-neutral-500 block' : 'text-neutral-500 block'}>
                  Eval Framework
                </span>
                <span
                  className={`text-sm font-black mt-0.5 block ${
                    palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
                  }`}
                >
                  OpenTelemetry
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: High-Contrast Telemetry Stream & Live Trace Engine */}
          <div
            className={`lg:col-span-6 rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all relative overflow-hidden ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
                : palette === 'chalk'
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-xl'
                : 'apple-liquid-dock text-white shadow-2xl'
            }`}
          >
            {palette === 'dark' && (
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
            )}

            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/90 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500/90 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block" />
                <span className="text-xs font-mono font-bold ml-2 text-neutral-400">agentpulse://live-telemetry</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase">STREAM ACTIVE</span>
              </div>
            </div>

            {/* Trace Activity Stream */}
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between transition-all duration-300 ease-out hover:bg-white/[0.07] hover:border-white/30 hover:shadow-[0_0_15px_rgba(255,255,255,0.03)] cursor-default">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">EXEC_OK</span>
                  <span className="text-neutral-200 font-medium">orchestrator.plan_cohort_query()</span>
                </div>
                <span className="text-neutral-400 text-[11px]">1.2ms · 128 tok</span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between transition-all duration-300 ease-out hover:bg-white/[0.07] hover:border-white/30 hover:shadow-[0_0_15px_rgba(255,255,255,0.03)] cursor-default">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold text-[10px]">TOOL_CALL</span>
                  <span className="text-neutral-200 font-medium">schema_catalog.lookup(tables)</span>
                </div>
                <span className="text-neutral-400 text-[11px]">4.8ms · cached</span>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between transition-all duration-300 ease-out hover:bg-amber-500/15 hover:border-amber-400/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.05)] cursor-default">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">DEVIATION</span>
                  <span className="text-amber-200 font-medium">evaluator.semantic_drift_check()</span>
                </div>
                <span className="text-amber-300 font-bold text-[11px]">0.74 Δ flag</span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between transition-all duration-300 ease-out hover:bg-white/[0.07] hover:border-white/30 hover:shadow-[0_0_15px_rgba(255,255,255,0.03)] cursor-default">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px]">CLOSED_LOOP</span>
                  <span className="text-neutral-200 font-medium">guardrail.auto_reanchor_prompt()</span>
                </div>
                <span className="text-neutral-400 text-[11px]">8.2ms · saved</span>
              </div>
            </div>

            {/* Terminal Footer Metrics Bar */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-neutral-500 text-[10px] block uppercase">Multi-Agent Nodes</span>
                  <span className="font-bold text-amber-300">12 Live Swarms</span>
                </div>
                <div>
                  <span className="text-neutral-500 text-[10px] block uppercase">Eval Agreement</span>
                  <span className="font-bold text-emerald-400">98.4% Confidence</span>
                </div>
              </div>
              <button
                onClick={onEnterProduct}
                className="px-3 py-1.5 rounded-lg bg-amber-300 hover:bg-amber-200 text-neutral-950 font-bold text-xs flex items-center space-x-1 transition-colors"
              >
                <span>Inspect Traces</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
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
                palette === 'butter' ? 'underline decoration-black decoration-2' : 'text-neutral-300'
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
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md hover:shadow-lg'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-neutral-400 font-semibold">STAGE 01</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300 font-mono">
                DISPATCH
              </span>
            </div>
            <div className="text-base font-bold text-white mb-1">Agent Planning</div>
            <p className="text-xs text-neutral-400 font-mono leading-relaxed">
              Receives user goal &amp; generates 3-stage plan.
            </p>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span className="text-emerald-400 font-bold flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span>Nominal Dispatch</span>
              </span>
              <span>1.2ms</span>
            </div>
          </div>

          {/* Stage 2 */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md hover:shadow-lg'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-neutral-400 font-semibold">STAGE 02</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-sky-400 font-mono">
                TOOL_CALL
              </span>
            </div>
            <div className="text-base font-bold text-white mb-1">Tool Invocation</div>
            <p className="text-xs text-neutral-400 font-mono leading-relaxed">
              Calls schema catalog. 4 valid columns retrieved.
            </p>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span className="text-sky-400 font-bold flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                <span>Catalog Verified</span>
              </span>
              <span>4.8ms</span>
            </div>
          </div>

          {/* Stage 3 */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md hover:shadow-lg'
                : 'apple-liquid-dock text-white hover:border-amber-400/40'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-amber-400 font-semibold">STAGE 03</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">
                DRIFT 0.74Δ
              </span>
            </div>
            <div className="text-base font-bold text-white mb-1">Model Synthesis</div>
            <p className="text-xs text-neutral-400 font-mono leading-relaxed">
              Injects context. Hallucinates deprecated column.
            </p>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span className="text-amber-400 font-bold flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
                <span>Deviation Injected</span>
              </span>
              <span>340ms</span>
            </div>
          </div>

          {/* Stage 4: Critical Reveal */}
          <div
            className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 group ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-amber-100 text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-y-0.5'
                : palette === 'chalk'
                ? 'border border-rose-300 bg-rose-50 text-neutral-900 shadow-md'
                : 'apple-liquid-dock border-rose-500/40 text-white hover:border-rose-400/60 shadow-[0_0_24px_rgba(244,63,94,0.12)]'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-rose-400 font-bold">STAGE 04 · REVEAL</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono font-bold">
                EVAL_REJECT
              </span>
            </div>
            <div className="text-base font-bold text-white mb-1">Causal Detection</div>
            <p className="text-xs text-neutral-300 font-mono leading-relaxed">
              Column <code className="text-rose-300 bg-rose-500/20 px-1 py-0.5 rounded border border-rose-500/30">usage_tier_id</code> missing. Discrepancy caught.
            </p>
            <div className="mt-4 pt-3 border-t border-rose-500/20 flex items-center justify-between text-[11px] font-mono">
              <span className="text-rose-400 font-bold flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block animate-ping" />
                <span>Zero Execution Waste</span>
              </span>
              <span className="text-rose-300">8.4ms</span>
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
              {activeLoopStep === idx && palette === 'dark' && (
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
              )}
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold tracking-wider">{phase.label}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-neutral-300 border border-white/[0.1]">
                  {phase.badge}
                </span>
              </div>
              <div className="text-sm font-semibold mt-1 line-clamp-1">{phase.subtitle}</div>
              <div className="text-[11px] font-mono text-neutral-400 mt-2 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{phase.metric}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Active Phase Details Liquid Glass Card */}
        <div
          className={`rounded-3xl p-8 sm:p-10 transition-all duration-300 relative overflow-hidden shadow-2xl ${
            palette === 'butter'
              ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
              : palette === 'chalk'
              ? 'border border-neutral-200 bg-white text-neutral-900 shadow-xl'
              : 'apple-liquid-dock text-white'
          }`}
        >
          {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Text & Features */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center space-x-3">
                <span className="px-2.5 py-1 rounded-md bg-amber-300 text-neutral-950 text-xs font-mono font-black">
                  PHASE 0{activeLoopStep + 1}
                </span>
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">
                  {loopPhases[activeLoopStep].label} · {loopPhases[activeLoopStep].badge}
                </span>
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">
                  {loopPhases[activeLoopStep].subtitle}
                </h3>
                <p className="text-neutral-300 text-base leading-relaxed">
                  {loopPhases[activeLoopStep].description}
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                {loopPhases[activeLoopStep].features.map((feature, i) => (
                  <div key={i} className="flex items-center space-x-3 text-xs sm:text-sm font-mono text-neutral-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center space-x-4">
                <button
                  onClick={onEnterProduct}
                  className="px-6 py-3 bg-[#F5F5F7] hover:bg-white text-neutral-950 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all shadow-md"
                >
                  <span>Explore in Live Workspace</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right: Interactive Architectural Schematic */}
            <div className="lg:col-span-5 bg-black/60 rounded-2xl border border-white/[0.1] p-6 font-mono text-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <span className="text-neutral-400 text-[11px] uppercase font-bold flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-amber-300" />
                  <span>{loopPhases[activeLoopStep].diagramTitle}</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  LIVE ENGINE
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                  <span className="text-neutral-300">Throughput Capacity</span>
                  <span className="text-emerald-400 font-bold">50,000 spans/sec</span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                  <span className="text-neutral-300">{loopPhases[activeLoopStep].metricLabel}</span>
                  <span className="text-amber-300 font-bold">{loopPhases[activeLoopStep].metric}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                  <span className="text-neutral-300">Verification Model</span>
                  <span className="text-neutral-100 font-bold">Deterministic + LLM Judge</span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-neutral-400 text-center flex items-center justify-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
            Hover or click each step to inspect how a single trace unfolds across orchestration, tools, model inference, and real-time evaluator verification.
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
                {activeStoryStep === idx && palette === 'dark' && (
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-xs font-bold text-neutral-400">0{idx + 1}</span>
                    <span className="text-sm font-bold">{step.title}</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] px-2.5 py-0.5 rounded border font-semibold ${
                      step.status === 'ok'
                        ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                        : step.status === 'warning'
                        ? 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                        : 'border-rose-500/30 text-rose-300 bg-rose-500/10'
                    }`}
                  >
                    {step.actor}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 mt-2 pt-2 border-t border-white/[0.06]">
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
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-xl'
                : 'apple-liquid-dock text-white'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />}

            {/* Inspector Header */}
            <div className="px-6 py-4 border-b border-white/[0.1] flex items-center justify-between text-xs font-mono bg-white/[0.02]">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-neutral-200 font-bold uppercase">
                  Span Inspector · {storySteps[activeStoryStep].actor}
                </span>
              </div>
              <span className="text-neutral-400">Trace: tr-98410</span>
            </div>

            {/* Inspector Body */}
            <div className="p-6 space-y-6 font-mono text-xs">
              <div>
                <span className="text-[10px] uppercase text-neutral-400 font-bold tracking-wider block mb-2">
                  Execution Payload
                </span>
                <div className="bg-black/70 border border-white/[0.1] rounded-xl p-4 font-mono text-xs text-neutral-200 overflow-x-auto leading-relaxed shadow-inner">
                  {storySteps[activeStoryStep].code}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase text-neutral-400 font-bold tracking-wider block mb-2">
                  Investigation Findings
                </span>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-neutral-200 leading-relaxed font-sans">
                  {storySteps[activeStoryStep].detail}
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.1] grid grid-cols-3 gap-4 text-xs font-mono text-neutral-300">
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] text-neutral-400 block uppercase">Duration</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{storySteps[activeStoryStep].latency}</span>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] text-neutral-400 block uppercase">Tokens</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{storySteps[activeStoryStep].tokens} tok</span>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] text-neutral-400 block uppercase">Groundedness</span>
                  <span
                    className={`text-sm font-bold mt-0.5 block ${
                      activeStoryStep === 3 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {activeStoryStep === 3 ? '0.42 (REJECT)' : '1.00 (NOMINAL)'}
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

          <div className="flex items-center space-x-2 ios-ultra-thin-toolbar border border-white/[0.12] p-1.5 rounded-xl">
            <button
              onClick={() => setActiveDriftView('spatial')}
              className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
                activeDriftView === 'spatial'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Spatial 3D Trajectory
            </button>
            <button
              onClick={() => setActiveDriftView('analytical')}
              className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-all ${
                activeDriftView === 'analytical'
                  ? 'bg-white text-black shadow-sm'
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
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-xl'
                : 'apple-liquid-dock text-white'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />}

            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
              <div className="font-mono text-xs text-neutral-200 flex items-center space-x-2.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span>Semantic Trajectory Embedding Vector Map (UMAP 2D Projection)</span>
              </div>
              <div className="text-xs font-mono text-rose-300 font-bold bg-rose-500/15 border border-rose-500/30 px-3 py-1.5 rounded-lg shadow-sm">
                Cluster Divergence: 0.88 Δ (CRITICAL)
              </div>
            </div>

            {/* Vector Cluster Grid */}
            <div className="relative h-72 w-full bg-[#050608] rounded-2xl border border-white/[0.08] p-6 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px]" />

              {/* Baseline Cluster */}
              <div className="absolute left-[18%] top-[35%] w-44 h-44 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <span className="text-[11px] font-mono text-emerald-400 font-bold text-center px-2">
                  Nominal Baseline Cluster<br /><span className="text-[9px] text-emerald-400/70">(5,000 runs)</span>
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

            <div className="mt-6 flex flex-wrap items-center justify-between text-xs font-mono text-neutral-300 pt-4 border-t border-white/[0.1] gap-4">
              <span className="text-emerald-400 font-semibold flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                <span>Nominal Trajectory (Cosine Sim &gt; 0.94)</span>
              </span>
              <span className="text-amber-400 font-semibold flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span>12% Parameter Spread (Schema v2 migration)</span>
              </span>
              <span className="text-rose-400 font-bold flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block animate-ping" />
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
                  ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md'
                  : 'apple-liquid-dock text-white'
              }`}
            >
              {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
              <div className="text-xs font-mono text-neutral-400 mb-2 font-semibold">PARAMETER DRIFT</div>
              <div className="text-4xl font-mono font-black text-amber-400">0.74 Δ</div>
              <p className="text-xs text-neutral-300 mt-3 leading-relaxed font-mono">
                Tool call arguments are generating non-standard partition clauses compared to baseline runs.
              </p>
            </div>

            <div
              className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md'
                  : 'apple-liquid-dock text-white'
              }`}
            >
              {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
              <div className="text-xs font-mono text-neutral-400 mb-2 font-semibold">SEMANTIC EMBEDDING DRIFT</div>
              <div className="text-4xl font-mono font-black text-rose-400">0.84 Δ</div>
              <p className="text-xs text-neutral-300 mt-3 leading-relaxed font-mono">
                Response vectors migrated into an outlier cluster following warehouse schema migration.
              </p>
            </div>

            <div
              className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md'
                  : 'apple-liquid-dock text-white'
              }`}
            >
              {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
              <div className="text-xs font-mono text-neutral-400 mb-2 font-semibold">EVALUATOR AGREEMENT</div>
              <div className="text-4xl font-mono font-black text-neutral-100">74.8%</div>
              <p className="text-xs text-neutral-300 mt-3 leading-relaxed font-mono">
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
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center font-mono text-sm font-bold text-amber-300 mb-4">
              01
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Observed Reality</h3>
            <p className="text-xs font-mono text-neutral-400 leading-relaxed mb-4">
              Exact spans, generated prompt tokens, and tool invocations recorded without redaction or loss.
            </p>
            <div className="p-3.5 bg-black/60 rounded-xl border border-white/[0.08] font-mono text-[11px] text-neutral-300">
              "Generated column reference `t.usage_tier_id` on line 14 of SQL output"
            </div>
          </div>

          <div
            className={`rounded-2xl p-7 relative overflow-hidden transition-all duration-300 ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                : palette === 'chalk'
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center font-mono text-sm font-bold text-sky-300 mb-4">
              02
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Measured Delta</h3>
            <p className="text-xs font-mono text-neutral-400 leading-relaxed mb-4">
              Deterministic calculation against catalog metadata, AST parser, or rule constraints.
            </p>
            <div className="p-3.5 bg-black/60 rounded-xl border border-white/[0.08] font-mono text-[11px] text-neutral-300">
              "Warehouse catalog confirmed column is `tier_identifier_code`. Discrepancy: 0.89"
            </div>
          </div>

          <div
            className={`rounded-2xl p-7 relative overflow-hidden transition-all duration-300 ${
              palette === 'butter'
                ? 'border-2 border-neutral-950 bg-white text-black shadow-[6px_6px_0px_#000000]'
                : palette === 'chalk'
                ? 'border border-neutral-200 bg-white text-neutral-900 shadow-md'
                : 'apple-liquid-dock text-white hover:border-white/30'
            }`}
          >
            {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center font-mono text-sm font-bold text-emerald-300 mb-4">
              03
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Causal Explanation</h3>
            <p className="text-xs font-mono text-neutral-400 leading-relaxed mb-4">
              Actionable root cause explanation with remediation steps and golden dataset integration.
            </p>
            <div className="p-3.5 bg-black/60 rounded-xl border border-white/[0.08] font-mono text-[11px] text-neutral-300">
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
              palette === 'butter' ? 'text-neutral-800 font-medium' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            Seamlessly bridge production telemetry with evaluation datasets and offline candidate model experiments (Langfuse &amp; Braintrust model).
          </p>
        </div>

        {/* 5-Stage Step Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
          {[
            { step: '01', title: 'Production Trace', desc: 'Capture anomaly in live swarm', tag: 'OTel Ingestion' },
            { step: '02', title: '1-Click Curate', desc: 'Isolate failing span to dataset', tag: 'Data Slicing' },
            { step: '03', title: 'Golden Dataset', desc: 'Maintain versioned benchmarks', tag: 'Ground Truth' },
            { step: '04', title: 'Run Experiment', desc: 'Test prompt/model candidates', tag: 'Eval Matrix' },
            { step: '05', title: 'Deploy Fix', desc: 'Deploy hardened agent & monitor', tag: 'Zero Regression' }
          ].map((item) => (
            <div
              key={item.step}
              className={`rounded-2xl p-5 relative overflow-hidden transition-all duration-300 ${
                palette === 'butter'
                  ? 'border-2 border-neutral-950 bg-white text-black shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'border border-neutral-200 bg-white text-neutral-900 shadow-sm'
                  : 'apple-liquid-dock text-white hover:border-white/30'
              }`}
            >
              {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />}
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-neutral-400">STAGE {item.step}</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">
                  {item.tag}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mb-1.5">{item.title}</h4>
              <p className="text-xs text-neutral-400 leading-relaxed font-mono">{item.desc}</p>
            </div>
          ))}
        </div>
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
            Non-intrusive auto-instrumentation for Python native, LangGraph, CrewAI, LlamaIndex, LiteLLM, and TypeScript.
          </p>
        </div>

        {/* Framework Selector & SDK Terminal */}
        <div
          className={`rounded-3xl p-6 sm:p-8 relative overflow-hidden transition-all duration-300 shadow-2xl ${
            palette === 'butter'
              ? 'border-2 border-neutral-950 bg-black text-white shadow-[10px_10px_0px_#000000]'
              : palette === 'chalk'
              ? 'border border-neutral-200 bg-white text-neutral-900 shadow-xl'
              : 'apple-liquid-dock text-white'
          }`}
        >
          {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />}

          {/* Framework Tabs */}
          <div className="flex flex-wrap items-center justify-between pb-6 border-b border-white/10 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'python', label: 'Python Native' },
                { id: 'langgraph', label: 'LangGraph' },
                { id: 'crewai', label: 'CrewAI' },
                { id: 'llamaindex', label: 'LlamaIndex' },
                { id: 'ts', label: 'TypeScript / Node' }
              ].map((fw) => (
                <button
                  key={fw.id}
                  onClick={() => setSelectedSdkFramework(fw.id as any)}
                  className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all font-semibold ${
                    selectedSdkFramework === fw.id
                      ? 'bg-amber-300 text-neutral-950 shadow-sm'
                      : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {fw.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleCopyPip(sdkSnippets[selectedSdkFramework])}
              className="flex items-center space-x-2 text-xs font-mono text-neutral-200 bg-white/[0.06] hover:bg-white/[0.12] px-4 py-2 rounded-xl border border-white/[0.12] transition-colors"
            >
              {pipCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{pipCopied ? 'Copied code snippet' : 'Copy snippet'}</span>
            </button>
          </div>

          <pre className="font-mono text-xs sm:text-sm text-neutral-200 pt-6 overflow-x-auto leading-relaxed">
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
          <div className="grid grid-cols-12 bg-white/[0.04] border-b border-white/[0.08] px-6 py-3.5 text-xs font-mono text-neutral-400 uppercase tracking-wider font-bold">
            <div className="col-span-4">Capability</div>
            <div className="col-span-3">Maturity Status</div>
            <div className="col-span-5">Implementation Model</div>
          </div>

          <div className="divide-y divide-white/[0.06] text-xs font-mono text-neutral-200">
            <div className="grid grid-cols-12 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-4 font-bold text-white">Execution Traces &amp; Waterfall</div>
              <div className="col-span-3">
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                  GA · STABLE
                </span>
              </div>
              <div className="col-span-5 text-neutral-400">OpenTelemetry GenAI Semantic Conventions</div>
            </div>

            <div className="grid grid-cols-12 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-4 font-bold text-white">Behavioral Drift Detection</div>
              <div className="col-span-3">
                <span className="px-2.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold">
                  BETA
                </span>
              </div>
              <div className="col-span-5 text-neutral-400">Density-based spatial trajectory clustering (UMAP)</div>
            </div>

            <div className="grid grid-cols-12 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-4 font-bold text-white">Schema &amp; Context Grounding</div>
              <div className="col-span-3">
                <span className="px-2.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold">
                  BETA
                </span>
              </div>
              <div className="col-span-5 text-neutral-400">Exact AST &amp; JSON Schema reflection validation</div>
            </div>

            <div className="grid grid-cols-12 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-4 font-bold text-white">Multi-Agent Disagreement Matrix</div>
              <div className="col-span-3">
                <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                  EXPERIMENTAL
                </span>
              </div>
              <div className="col-span-5 text-neutral-400">Consensus voting across parallel reasoning lanes</div>
            </div>

            <div className="grid grid-cols-12 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-4 font-bold text-white">Tool-Claim Alignment Evaluator</div>
              <div className="col-span-3">
                <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                  EXPERIMENTAL
                </span>
              </div>
              <div className="col-span-5 text-neutral-400">Natural language assertion vs tool exit status check</div>
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
              ? 'border border-neutral-200 bg-white text-neutral-900 shadow-xl'
              : 'apple-liquid-dock text-white'
          }`}
        >
          {palette === 'dark' && <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />}

          <div className="max-w-2xl mx-auto space-y-6">
            <span
              className={`inline-block px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-wide uppercase ${
                palette === 'butter'
                  ? 'bg-amber-300 text-black'
                  : 'badge-editorial text-neutral-300'
              }`}
            >
              [ SECTION 10 · READY TO CONNECT ]
            </span>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight text-white">
              Connect your first agent.
            </h2>
            <p className="text-neutral-300 text-base leading-relaxed">
              Gain complete visibility over reasoning loops, behavioral drift, tool outputs, and evaluation metrics in minutes.
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => setConnectOpen(true)}
                className={`px-8 py-3.5 text-sm font-black rounded-xl transition-all flex items-center space-x-2 shadow-lg ${
                  palette === 'butter'
                    ? 'bg-amber-300 text-black hover:bg-amber-200 shadow-[4px_4px_0px_#ffffff]'
                    : 'bg-[#F5F5F7] hover:bg-white text-neutral-950'
                }`}
              >
                <span>Connect to AgentPulse</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onEnterProduct}
                className="px-6 py-3.5 rounded-xl border border-white/[0.15] hover:border-white/30 bg-white/[0.04] text-sm font-bold text-neutral-200 hover:text-white transition-all"
              >
                Open Live Investigation Workspace
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer className="border-t border-white/[0.08] px-6 sm:px-12 py-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-neutral-400 gap-4">
        <div>AgentPulse — AI Agent Observability &amp; Evaluation Platform</div>
        <div className="flex items-center space-x-6">
          <span>OpenTelemetry Compliant</span>
          <span>Editorial Aesthetic Baseline</span>
          <button onClick={onEnterProduct} className="text-neutral-300 hover:text-white underline">
            Workspace Mode
          </button>
        </div>
      </footer>

      {/* Liquid Glass Connect Modal */}
      <ConnectModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        onVerified={onEnterProduct}
      />
      </div>
    </div>
  );
};
