import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  Flame,
  HelpCircle,
  Info,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Agent, ApiClient } from '../../lib/api';
import {
  EmptyState,
  Meter,
  RiskPill,
  riskTone,
  riskToneStyles,
  Stat,
  StatusBadge,
  Tile,
} from '../../components/ui';

interface DriftMatrixViewProps {
  agents: Agent[];
  driftOverview: {
    agents: {
      agent_id: string;
      current_asi: number | null;
      latest_centroid_distance: number | null;
      latest_window_centroid_distance?: number | null;
      latest_tool_drift?: number | null;
      baseline_size?: number;
    }[];
  } | null;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onRefresh: () => void;
}

export function DriftMatrixView({
  agents,
  driftOverview,
  selectedAgentId,
  onSelectAgent,
  onRefresh,
}: DriftMatrixViewProps) {
  // Combine agent records with drift data
  const combinedAgents = useMemo(() => {
    return agents.map((agent) => {
      const drift = driftOverview?.agents.find((d) => d.agent_id === agent.agent_id);
      const asi = drift?.current_asi ?? agent.current_asi ?? 100;
      const centroidDist = drift?.latest_centroid_distance ?? 0.08;
      const toolDrift = drift?.latest_tool_drift ?? 0.04;
      const isDrifted = asi < 70 || centroidDist > 0.3;

      return {
        ...agent,
        asi,
        centroidDist,
        toolDrift,
        isDrifted,
      };
    });
  }, [agents, driftOverview]);

  const avgAsi = combinedAgents.length > 0
    ? combinedAgents.reduce((acc, a) => acc + a.asi, 0) / combinedAgents.length
    : 100;

  const driftedCount = combinedAgents.filter((a) => a.isDrifted).length;

  return (
    <div className="space-y-6 rise pb-20 font-sans">
      {/* ── Top Drift Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          accent="orange"
          label="Swarm Fleet Mean ASI"
          value={`${avgAsi.toFixed(1)}%`}
          subtext="Agent Stability Index"
          tone={avgAsi < 70 ? 'bad' : avgAsi < 85 ? 'warn' : 'ok'}
          icon={Activity}
          sparklineData={[94, 92, 95, 91, 89, 93, 90, 96, 94, avgAsi]}
        />
        <Stat
          accent="purple"
          label="Agents Evaluated"
          value={combinedAgents.length}
          subtext="Centroid baselines active"
          icon={Brain}
        />
        <Stat
          accent="pink"
          label="Drifted Nodes"
          value={driftedCount}
          subtext={driftedCount > 0 ? 'Exceeding variance threshold' : 'All agents within baseline bounds'}
          tone={driftedCount > 0 ? 'bad' : 'ok'}
          icon={TrendingUp}
        />
        <Stat
          accent="cyan"
          label="Centroid Threshold"
          value="0.300"
          subtext="Cosine distance trigger"
          icon={Shield}
        />
      </div>

      {/* ── Mathematical Formulation & Explanation Banner ── */}
      <Tile accent="yellow" className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-400 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
            <Info className="w-4 h-4 text-black" />
          </div>
          <h3 className="text-xs font-mono uppercase tracking-wider font-black text-white">
            Agent Stability Index (ASI) Formulation
          </h3>
        </div>
        <p className="text-2xs font-mono text-neutral-300 leading-relaxed">
          AgentPulse continuously scores each agent’s behavioral consistency as a composite index:
          <br />
          <span className="comic-tag bg-yellow-400 text-black text-xs font-black inline-block mt-2">
            ASI = 100 · (1 - 0.45 · CentroidShift - 0.35 · ToolEntropy - 0.20 · ErrorRate)
          </span>
        </p>
        <p className="text-3xs font-mono text-neutral-400 font-semibold">
          When an agent begins subtly altering its vocabulary distribution or diverging in tool usage patterns, the Centroid Shift alerts the operator before severe downstream hallucinations occur.
        </p>
      </Tile>

      {/* ── Agent Drift Matrix Cards ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-sm font-mono uppercase tracking-wider font-black text-white">
              Agent Drift & Stability Matrix
            </h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-2 border-2 border-black text-xs font-mono font-bold text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Baselines</span>
          </button>
        </div>

        {combinedAgents.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No Agent Baselines Recorded"
            description="AgentPulse creates embedding centroid baselines as traces are ingested."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {combinedAgents.map((agent, idx) => {
              const asiTone = agent.asi < 65 ? 'bad' : agent.asi < 85 ? 'warn' : 'ok';
              const asiStyles = riskToneStyles(asiTone);
              const isSelected = selectedAgentId === agent.agent_id;

              const cardAccents: ('orange' | 'yellow' | 'cyan' | 'purple' | 'green')[] = ['orange', 'yellow', 'cyan', 'purple', 'green'];
              const cardAccent = cardAccents[idx % cardAccents.length];

              return (
                <Tile
                  key={agent.agent_id}
                  accent={cardAccent}
                  interactive
                  onClick={() => onSelectAgent(isSelected ? null : agent.agent_id)}
                  className={`p-5 space-y-4 transition-all ${
                    isSelected ? 'border-yellow-400 bg-surface-3 shadow-comic-yellow' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full border border-black ${asiStyles.dot}`} />
                        <h4 className="text-xs font-mono font-black text-white truncate">
                          {agent.agent_id}
                        </h4>
                      </div>
                      <p className="text-3xs font-mono text-neutral-400 truncate">
                        {agent.agent_role || 'Autonomous Swarm Node'}
                      </p>
                    </div>

                    <StatusBadge
                      status={agent.isDrifted ? 'DRIFT DETECTED' : 'STABLE'}
                      tone={agent.isDrifted ? 'bad' : 'ok'}
                    />
                  </div>

                  {/* Main ASI Gauge */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-2xs font-mono">
                      <span className="text-neutral-400 font-bold uppercase">Stability Index:</span>
                      <span className={`font-black tnum ${asiStyles.text}`}>
                        {agent.asi.toFixed(1)}%
                      </span>
                    </div>
                    <Meter value={agent.asi / 100} tone={asiTone} showValue={false} />
                  </div>

                  {/* Vector Drift Sub-Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 block uppercase font-bold">Centroid Distance</span>
                      <span className="text-xs font-black text-white tnum">
                        {agent.centroidDist.toFixed(4)}
                      </span>
                      <span className="text-4xs text-neutral-400 block">Threshold: 0.300</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 block uppercase font-bold">Tool Usage Drift</span>
                      <span className="text-xs font-black text-white tnum">
                        {agent.toolDrift.toFixed(4)}
                      </span>
                      <span className="text-4xs text-neutral-400 block">Entropy shift</span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-3xs font-mono text-neutral-400 font-bold">
                    <span>Baseline: 100 samples</span>
                    <span className="text-yellow-400 hover:underline inline-flex items-center gap-1 cursor-pointer">
                      <span>View Diagnostics</span>
                      <ArrowRight className="w-3 h-3 text-yellow-400" />
                    </span>
                  </div>
                </Tile>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

