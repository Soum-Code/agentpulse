import React, { useState } from 'react';
import { Copy, CheckCircle2, Terminal, Code2, Sparkles, Layers, Box } from 'lucide-react';

type FrameworkTab = 'langgraph' | 'crewai' | 'autogen' | 'llamaindex' | 'decorator' | 'otel';

interface CodeSnippet {
  id: FrameworkTab;
  name: string;
  badge: string;
  filename: string;
  install: string;
  code: string;
  description: string;
}

const FRAMEWORK_SNIPPETS: CodeSnippet[] = [
  {
    id: 'langgraph',
    name: 'LangGraph',
    badge: 'Popular Swarm',
    filename: 'agent_graph.py',
    install: 'pip install agentpulse langgraph',
    description: 'Wrap your compiled StateGraph with 1 line. Automatically captures node transitions, state diffs, and tool returns as unified span hierarchy.',
    code: `from langgraph.graph import StateGraph, END
from agentpulse.adapters.langgraph import LangGraphAdapter

# 1. Build your standard LangGraph workflow
workflow = StateGraph(AgentState)
workflow.add_node("researcher", research_node)
workflow.add_node("verifier", verification_node)
workflow.set_entry_point("researcher")

# 2. Wrap compiled graph with AgentPulse observability adapter
adapter = LangGraphAdapter(pipeline_id="medical_research_v2")
app = workflow.compile(checkpointer=memory)
monitored_app = adapter.wrap(app)

# 3. Execute — spans are streamed asynchronously (<0.005ms overhead)
result = await monitored_app.ainvoke({"query": "Evaluate trial AP-402"})`,
  },
  {
    id: 'crewai',
    name: 'CrewAI',
    badge: 'Multi-Agent Teams',
    filename: 'crew_swarm.py',
    install: 'pip install agentpulse crewai',
    description: 'Hook into CrewAI step callbacks to trace inter-agent delegations, task outputs, and tool calls with automated grounding checks.',
    code: `from crewai import Agent, Crew, Process, Task
from agentpulse.adapters.crewai import AgentPulseCrewCallback

# 1. Attach AgentPulse telemetry callback
pulse_callback = AgentPulseCrewCallback(crew_name="market_analysts")

researcher = Agent(
    role="Senior Market Analyst",
    goal="Gather semiconductor industry financial data",
    callbacks=[pulse_callback]
)

writer = Agent(
    role="Technical Writer",
    goal="Synthesize executive summary",
    callbacks=[pulse_callback]
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[task1, task2],
    process=Process.sequential
)
crew.kickoff()`,
  },
  {
    id: 'autogen',
    name: 'AutoGen',
    badge: 'Conversational Swarms',
    filename: 'autogen_swarm.py',
    install: 'pip install agentpulse pyautogen',
    description: 'Intercept conversational group chat messages and validate consistency across speaker transitions in real time.',
    code: `import autogen
from agentpulse.adapters.autogen import monitor_group_chat

user_proxy = autogen.UserProxyAgent("user_proxy", code_execution_config=False)
coder = autogen.AssistantAgent("coder", llm_config=llm_config)
critic = autogen.AssistantAgent("critic", llm_config=llm_config)

groupchat = autogen.GroupChat(agents=[user_proxy, coder, critic], messages=[], max_round=12)
manager = autogen.GroupChatManager(groupchat=groupchat)

# Hook AgentPulse observer into manager
monitor_group_chat(manager, pipeline_id="code_synthesis_group")
user_proxy.initiate_chat(manager, message="Refactor database connection pool")`,
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex',
    badge: 'RAG & Workflows',
    filename: 'rag_workflow.py',
    install: 'pip install agentpulse llama-index',
    description: 'Evaluate retrieval chunks vs generated answer claims using MiniLM cosine similarity and DeBERTa cross-attention.',
    code: `from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from agentpulse.adapters.llamaindex import AgentPulseInstrumentor

# Instrument LlamaIndex query engine
instrumentor = AgentPulseInstrumentor()
instrumentor.start()

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()

# Automatically traces retrieval context, query, and output groundedness
response = query_engine.query("What was the net revenue growth in Q3?")`,
  },
  {
    id: 'decorator',
    name: 'Python Decorator',
    badge: 'Universal Python',
    filename: 'custom_agent.py',
    install: 'pip install agentpulse',
    description: 'Non-intrusive function decorator. Wraps arbitrary async/sync Python functions and records input, output, tokens, and duration.',
    code: `from agentpulse import pulse

# 1. Decorate your agent execution functions
@pulse.monitor(agent_id="verifier", role="Claim Verifier")
async def verify_evidence(query: str, retrieved_docs: list[str]) -> dict:
    # 2. Record tool executions for deterministic validation
    tool_res = await db.query("SELECT * FROM trials WHERE id = 402")
    pulse.record_tool("clinical_db_query", args={"id": 402}, result_summary=str(tool_res))
    
    # 3. Agent generates conclusion
    conclusion = await llm.generate(...)
    return {"verdict": conclusion, "docs_checked": len(retrieved_docs)}`,
  },
  {
    id: 'otel',
    name: 'OpenTelemetry',
    badge: 'OTel GenAI Standard',
    filename: 'otel_exporter.py',
    install: 'pip install agentpulse opentelemetry-sdk',
    description: 'Native OpenTelemetry GenAI Semantic Convention export. Ingest spans from any existing OTel-compatible collector or Jaeger pipeline.',
    code: `from opentelemetry import trace
from agentpulse.otel import AgentPulseSpanProcessor

# Connect AgentPulse span processor to standard OTel tracer provider
tracer_provider = trace.get_tracer_provider()
tracer_provider.add_span_processor(
    AgentPulseSpanProcessor(endpoint="http://localhost:8000/v1/ingest/spans")
)

tracer = trace.get_tracer("my-agent-swarm")
with tracer.start_as_current_span("agent.execution") as span:
    span.set_attribute("gen_ai.agent.name", "researcher")
    span.set_attribute("gen_ai.prompt", "Evaluate hypothesis...")
    # Telemetry streams natively to AgentPulse queue`,
  },
];

export function SdkStudio() {
  const [activeTab, setActiveTab] = useState<FrameworkTab>('langgraph');
  const [copied, setCopied] = useState<string | null>(null);

  const current = FRAMEWORK_SNIPPETS.find((s) => s.id === activeTab) || FRAMEWORK_SNIPPETS[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="w-full rounded-2xl bg-[#0a0c14] border border-white/10 overflow-hidden shadow-2xl space-y-6">
      {/* Header */}
      <div className="p-6 sm:p-8 pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
            <Terminal className="w-4 h-4" />
            <span>Developer SDK Studio & Multi-Framework Adapters</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Integrate with your existing agent framework in 3 lines.
          </h3>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mt-1">
            Drop-in auto-instrumentation for LangGraph, CrewAI, AutoGen, LlamaIndex, or pure Python. Non-blocking asynchronous buffer with &lt;0.005ms overhead.
          </p>
        </div>

        {/* Quick PIP badge */}
        <div
          onClick={() => handleCopy('pip install agentpulse', 'pip')}
          className="px-4 py-2.5 rounded-xl bg-[#11131a] border border-white/10 hover:border-cyan-500/30 text-xs font-mono text-neutral-300 flex items-center justify-between gap-3 cursor-pointer group transition-all shrink-0"
        >
          <span className="text-neutral-500">$</span>
          <span className="text-white font-bold group-hover:text-cyan-300 transition-colors">pip install agentpulse</span>
          {copied === 'pip' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white" />}
        </div>
      </div>

      {/* Framework Tabs */}
      <div className="px-6 flex flex-wrap items-center gap-2">
        {FRAMEWORK_SNIPPETS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-white text-black font-bold shadow-md'
                : 'bg-white/5 border border-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>{tab.name}</span>
            <span
              className={`text-4xs px-1.5 py-0.5 rounded uppercase ${
                activeTab === tab.id ? 'bg-black/10 text-neutral-800 font-bold' : 'bg-white/10 text-neutral-400'
              }`}
            >
              {tab.badge}
            </span>
          </button>
        ))}
      </div>

      {/* Code Viewer Panel */}
      <div className="mx-6 mb-6 rounded-xl bg-[#07080d] border border-white/[0.08] overflow-hidden">
        <div className="px-4 py-3 bg-[#0e111a] border-b border-white/[0.06] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3 text-neutral-400">
            <span className="text-cyan-400 font-bold">{current.filename}</span>
            <span>&bull;</span>
            <span className="text-3xs text-neutral-500">{current.description}</span>
          </div>

          <button
            onClick={() => handleCopy(current.code, current.id)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
            title="Copy code snippet"
          >
            {copied === current.id ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-3xs text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-3xs">Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="p-6 font-mono text-xs text-neutral-300 leading-relaxed overflow-x-auto">
          <pre className="text-white/90">
            {current.code}
          </pre>
        </div>
      </div>
    </div>
  );
}
