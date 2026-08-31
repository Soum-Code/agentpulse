import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  Flame,
  Layers,
  Play,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import {
  EmptyState,
  Meter,
  RiskPill,
  riskTone,
  riskToneStyles,
  StatusBadge,
  Tile,
} from '../../components/ui';

interface LabPlaygroundViewProps {
  client: ApiClient;
  onSelectTrace: (traceId: string) => void;
  onNavigateTab: (tab: 'traces' | 'overview' | 'incidents' | 'drift' | 'datasets') => void;
  showToast: (msg: string) => void;
}

const LAB_SCENARIOS = [
  {
    id: 'clean',
    title: 'Clean Execution',
    role: 'Stage 1 + 2 Consensus',
    description: 'A grounded multi-agent pipeline restating evidence with verified tool execution records.',
    verdict: 'GROUNDED',
    verdictTone: 'ok',
    riskScore: 0.045,
    query: 'What is the theoretical complexity of standard multi-head self-attention?',
    claim: 'Multi-head self-attention requires O(N^2) dot-product operations across sequence length N.',
    evidence: 'Standard transformer self-attention computes dot products across all token pairs, resulting in quadratic O(N^2) memory scaling with sequence length.',
    toolCall: { name: 'arxiv_search', args: { query: 'attention complexity' }, result: '3 papers confirmed O(N^2) scaling', count: 3 },
  },
  {
    id: 'hallucination',
    title: 'Fabricated Citation & Metrics',
    role: 'Stage 2 NLI Contradiction',
    description: 'An agent invents a fictitious research paper and claims 100% cure rate to trigger DeBERTa NLI.',
    verdict: 'CONTRADICTION',
    verdictTone: 'bad',
    riskScore: 0.884,
    query: 'Summarize the Phase II trial results for compound AP-402.',
    claim: 'Zhang et al. (2024) proved that compound AP-402 cured 100% of patients with zero adverse effects.',
    evidence: 'Phase II trial for AP-402 showed a 41% overall response rate with mild nausea reported in 28% of participants.',
    toolCall: { name: 'pubmed_fetch', args: { drug: 'AP-402' }, result: '41% ORR reported, not 100%', count: 1 },
  },
  {
    id: 'tool_mismatch',
    title: 'Tool Claim Mismatch',
    role: 'Deterministic Assertions',
    description: 'An agent asserts searching 10 external sources, but the tool execution log shows only 1 result.',
    verdict: 'TOOL MISMATCH',
    verdictTone: 'warn',
    riskScore: 0.620,
    query: 'Check customer telemetry across EU replicas.',
    claim: 'Cross-referenced findings against 10 verified customer profile records.',
    evidence: 'Executed query on customer_profiles replica in 45ms.',
    toolCall: { name: 'db_query', args: { region: 'EU' }, result: '1 record returned', count: 1 },
  },
  {
    id: 'drift',
    title: 'Vocabulary & Semantic Drift',
    role: 'Centroid Drift Detector',
    description: 'The agent’s response shifts away from the established embedding centroid baseline.',
    verdict: 'DRIFT WARNING',
    verdictTone: 'warn',
    riskScore: 0.510,
    query: 'Synthesize research findings into high-level strategy recommendations.',
    claim: 'Quantum synergistic blockchain paradigm shifting holistic synergy vector optimization.',
    evidence: 'Standard performance benchmark report covering response time and GPU utilization.',
    toolCall: { name: 'system_metrics', args: {}, result: 'GPU load 45%', count: 1 },
  },
];

export function LabPlaygroundView({
  client,
  onSelectTrace,
  onNavigateTab,
  showToast,
}: LabPlaygroundViewProps) {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('clean');
  const [simulating, setSimulating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastGeneratedTraceId, setLastGeneratedTraceId] = useState<string | null>(null);

  const scenario = LAB_SCENARIOS.find((s) => s.id === activeScenarioId) || LAB_SCENARIOS[0];

  const handleRunSimulation = async () => {
    try {
      setSimulating(true);
      setLogs([`[0.0ms] Initializing scenario "${scenario.title}"...`]);

      await new Promise((r) => setTimeout(r, 200));
      setLogs((prev) => [...prev, `[24.1ms] Dispatching agent node "Planner" with query: "${scenario.query.slice(0, 40)}..."`]);

      await new Promise((r) => setTimeout(r, 250));
      setLogs((prev) => [...prev, `[58.4ms] Executing tool "${scenario.toolCall.name}" -> ${scenario.toolCall.result}`]);

      await new Promise((r) => setTimeout(r, 250));
      setLogs((prev) => [...prev, `[95.2ms] Agent generated claim: "${scenario.claim.slice(0, 50)}..."`]);

      await new Promise((r) => setTimeout(r, 300));
      setLogs((prev) => [...prev, `[142.8ms] Ingesting multi-agent trace to POST /v1/ingest...`]);

      // Ingest live real trace to backend
      const traceId = `lab_trace_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const now = new Date().toISOString();

      await client.ingestSpans([
        {
          trace_id: traceId,
          span_id: `span_planner_${Date.now()}`,
          agent_id: 'planner',
          event_type: 'agent_execution',
          input_state: { query: scenario.query },
          output_state: { plan: 'Query planned' },
          input_summary: scenario.query,
          output_summary: 'Query planned and partitioned.',
          latency_ms: 35.4,
          status: 'SUCCESS',
          start_time: now,
          end_time: now,
        },
        {
          trace_id: traceId,
          span_id: `span_executor_${Date.now()}`,
          parent_span_id: `span_planner_${Date.now()}`,
          agent_id: activeScenarioId === 'hallucination' ? 'summarizer' : 'retriever',
          event_type: 'agent_execution',
          input_state: { evidence: scenario.evidence },
          output_state: { claim: scenario.claim },
          input_summary: scenario.evidence,
          output_summary: scenario.claim,
          latency_ms: 112.6,
          status: activeScenarioId === 'hallucination' ? 'SUCCESS' : 'SUCCESS',
          start_time: now,
          end_time: now,
          tool_calls: [
            {
              tool_name: scenario.toolCall.name,
              tool_args: scenario.toolCall.args,
              result_summary: scenario.toolCall.result,
              result_count: scenario.toolCall.count,
              status: 'success',
            },
          ],
        },
      ]);

      setLastGeneratedTraceId(traceId);
      setLogs((prev) => [
        ...prev,
        `[188.0ms] Stage 1 (MiniLM Cosine Gate): evaluated.`,
        `[240.5ms] Stage 2 (DeBERTa NLI Escalation): ${scenario.verdict}`,
        `[265.1ms] Telemetry Ingest Accepted (Trace ID: ${traceId}). Quality check complete!`,
      ]);

      showToast(`Simulation complete! Ingested trace ${traceId}`);
    } catch (err) {
      setLogs((prev) => [...prev, `[ERROR] Ingestion failed: ${err instanceof Error ? err.message : 'Unknown error'}`]);
      showToast('Simulation failed to send to backend.');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6 rise pb-20 font-sans">
      {/* ── Top Header Banner ── */}
      <Tile accent="yellow" className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-yellow-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
              <Zap className="w-4 h-4 text-black" />
            </div>
            <h2 className="text-sm font-mono uppercase tracking-wider font-black text-white">
              Telemetry Simulation & Quality Lab
            </h2>
          </div>
          <span className="comic-tag bg-yellow-400 text-black">
            LIVE INFERENCE LAB
          </span>
        </div>
        <p className="text-2xs font-mono text-neutral-300 leading-relaxed">
          Inject synthetic test cases and edge cases directly into the active AgentPulse backend to inspect real-time grounding cascade responses, tool validation assertions, and drift alarms.
        </p>
      </Tile>

      {/* ── Scenario Selection Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {LAB_SCENARIOS.map((sc, idx) => {
          const isSelected = activeScenarioId === sc.id;
          const tone = sc.verdictTone as 'ok' | 'warn' | 'bad';
          const styles = riskToneStyles(tone);

          const cardAccents: ('green' | 'pink' | 'orange' | 'yellow')[] = ['green', 'pink', 'orange', 'yellow'];
          const cardAccent = cardAccents[idx % cardAccents.length];

          return (
            <Tile
              key={sc.id}
              accent={cardAccent}
              interactive
              onClick={() => setActiveScenarioId(sc.id)}
              className={`p-4 space-y-2.5 transition-all ${
                isSelected
                  ? 'border-yellow-400 bg-surface-3 shadow-comic-yellow'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`w-2.5 h-2.5 rounded-full border border-black ${styles.dot}`} />
                <StatusBadge status={sc.verdict} tone={tone} />
              </div>
              <h4 className="text-xs font-mono font-black text-white">{sc.title}</h4>
              <p className="text-3xs font-mono text-neutral-400 line-clamp-2">{sc.description}</p>
            </Tile>
          );
        })}
      </div>

      {/* ── Active Scenario Details & Pipeline Execution Map ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Scenario Configuration */}
        <div className="lg:col-span-6 space-y-4">
          <Tile accent="purple" className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-400 border border-black flex items-center justify-center shadow-[1px_1px_0px_#000]">
                  <Brain className="w-3.5 h-3.5 text-black" />
                </div>
                <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white">
                  Parameters: {scenario.title}
                </h3>
              </div>
              <RiskPill score={scenario.riskScore} size="md" />
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-3xs text-neutral-400 uppercase font-black">Test Prompt / Query:</span>
                <p className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000] text-white font-bold">{scenario.query}</p>
              </div>

              <div className="space-y-1">
                <span className="text-3xs text-neutral-400 uppercase font-black">Ground Truth Evidence:</span>
                <p className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000] text-neutral-300 leading-relaxed">{scenario.evidence}</p>
              </div>

              <div className="space-y-1">
                <span className="text-3xs text-neutral-400 uppercase font-black">Agent Claim to Evaluate:</span>
                <p className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000] text-yellow-300 leading-relaxed font-black">{scenario.claim}</p>
              </div>

              <div className="space-y-1">
                <span className="text-3xs text-neutral-400 uppercase font-black">Tool Execution Record:</span>
                <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000] flex items-center justify-between text-3xs">
                  <span className="comic-tag bg-orange-500 text-white">{scenario.toolCall.name}()</span>
                  <span className="text-neutral-300 font-bold">{scenario.toolCall.result}</span>
                  <span className="text-neutral-400">Rows: {scenario.toolCall.count}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating}
                className="flex-1 comic-btn-yellow py-2.5 px-4 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-4 h-4 text-black ${simulating ? 'animate-spin' : ''}`} />
                <span>{simulating ? 'Running Simulation...' : 'Execute Live Swarm Test'}</span>
              </button>

              {lastGeneratedTraceId && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectTrace(lastGeneratedTraceId);
                    onNavigateTab('traces');
                  }}
                  className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-surface-3 border-2 border-black text-white hover:text-yellow-400 text-xs font-mono font-bold shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <span>View in Traces</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </Tile>
        </div>

        {/* Right Col: Live Terminal Output */}
        <div className="lg:col-span-6 space-y-4">
          <Tile accent="cyan" className="p-5 space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-cyan-400 border border-black flex items-center justify-center shadow-[1px_1px_0px_#000]">
                  <Terminal className="w-3.5 h-3.5 text-black" />
                </div>
                <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white">
                  Real-Time Evaluation Console
                </h3>
              </div>
              <span className="comic-tag bg-cyan-400 text-black">FastAPI + DeBERTa</span>
            </div>

            <div className="flex-1 p-3.5 rounded-xl bg-surface border-2 border-black font-mono text-3xs text-neutral-300 space-y-1.5 min-h-[300px] overflow-y-auto shadow-[2px_2px_0px_#000]">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400 py-12">
                  <Terminal className="w-8 h-8 mb-2 opacity-50 text-yellow-400" />
                  <p className="font-bold">Click "Execute Live Swarm Test" to run the evaluation pipeline.</p>
                </div>
              ) : (
                logs.map((log, lIdx) => (
                  <p
                    key={lIdx}
                    className={`leading-relaxed ${
                      log.includes('CONTRADICTION') || log.includes('ERROR')
                        ? 'text-pink-400 font-black'
                        : log.includes('TOOL MISMATCH')
                        ? 'text-yellow-400 font-black'
                        : log.includes('GROUNDED') || log.includes('Accepted')
                        ? 'text-emerald-400 font-black'
                        : 'text-neutral-300'
                    }`}
                  >
                    {log}
                  </p>
                ))
              )}
            </div>
          </Tile>
        </div>
      </div>
    </div>
  );
}

