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
  // Combine agent records with drift data. Every field stays null when the
  // backend has no value for it: a missing baseline is not a healthy baseline.
  const combinedAgents = useMemo(() => {
    return agents.map((agent) => {
      const drift = driftOverview?.agents.find((d) => d.agent_id === agent.agent_id);
      const asi = drift?.current_asi ?? agent.current_asi ?? null;
      const centroidDist = drift?.latest_centroid_distance ?? null;
      // The sustained-shift metric alerting actually fires on. Null until both
      // the baseline and current windows have filled.
      const windowDist = drift?.latest_window_centroid_distance ?? null;
      const toolDrift = drift?.latest_tool_drift ?? null;
      const baselineSize = drift?.baseline_size ?? null;
      const isDrifted =
        (asi !== null && asi < 70) || (windowDist !== null && windowDist > 0.3);

      return {
        ...agent,
        asi,
        centroidDist,
        windowDist,
        toolDrift,
        baselineSize,
        isDrifted,
      };
    });
  }, [agents, driftOverview]);

  const scoredAsi = combinedAgents.filter((a) => a.asi !== null);
  const avgAsi =
    scoredAsi.length > 0
      ? scoredAsi.reduce((acc, a) => acc + (a.asi as number), 0) / scoredAsi.length
      : null;

  const driftedCount = combinedAgents.filter((a) => a.isDrifted).length;
  // Agents whose drift windows have filled, and so can actually be judged.
  const judgedCount = combinedAgents.filter((a) => a.windowDist !== null).length;

  return (
    <div className="space-y-6 rise pb-20 font-sans">
      {/* ── Top Drift Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          accent="orange"
          label="Swarm Fleet Mean ASI"
          value={avgAsi !== null ? `${avgAsi.toFixed(1)}%` : '—'}
          subtext={
            avgAsi !== null
              ? `Mean across ${scoredAsi.length} of ${combinedAgents.length} agents`
              : 'No agent has a stability index yet'
          }
          tone={avgAsi === null ? undefined : avgAsi < 70 ? 'bad' : avgAsi < 85 ? 'warn' : 'ok'}
          icon={Activity}
        />
        <Stat
          accent="purple"
          label="Agents With Baselines"
          value={combinedAgents.filter((a) => a.baselineSize !== null).length}
          subtext={`of ${combinedAgents.length} agents seen`}
          icon={Brain}
        />
        <Stat
          accent="pink"
          label="Drifted Nodes"
          value={driftedCount}
          subtext={
            driftedCount > 0
              ? 'Exceeding sustained-shift threshold'
              : judgedCount === 0
              ? 'No agent has enough samples to judge'
              : `${judgedCount} of ${combinedAgents.length} agents judged`
          }
          tone={driftedCount > 0 ? 'bad' : judgedCount === 0 ? undefined : 'ok'}
          icon={TrendingUp}
        />
        <Stat
          accent="cyan"
          label="Sustained Drift Threshold"
          value="0.300"
          subtext="Fires on window centroid distance"
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
          ASI is a weighted mean of per-signal stability terms, renormalised over whichever signals
          the agent actually has:
          <br />
          <span className="comic-tag bg-yellow-400 text-black text-xs font-black inline-block mt-2">
            ASI = 100 · Σ(wᵢ · sᵢ) / Σwᵢ
          </span>
        </p>
        <ul className="text-3xs font-mono text-neutral-400 font-semibold space-y-1">
          <li>s = max(0, 1 − centroid_distance), w = 0.35</li>
          <li>s = max(0, 1 − 2 · quality_drift), w = 0.30</li>
          <li>s = max(0, 1 − 5 · error_rate_delta), w = 0.20</li>
          <li>s = max(0, 1 − tool_drift), w = 0.15</li>
        </ul>
        <p className="text-3xs font-mono text-neutral-400 font-semibold">
          ASI is a heuristic, not a calibrated probability. Drift alerts fire on the sustained
          window-centroid distance rather than on ASI or on the per-span centroid spike.
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
              const asiTone =
                agent.asi === null ? 'ok' : agent.asi < 65 ? 'bad' : agent.asi < 85 ? 'warn' : 'ok';
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
                        <span
                          className={`w-2.5 h-2.5 rounded-full border border-black ${
                            agent.asi === null ? 'bg-neutral-600' : asiStyles.dot
                          }`}
                        />
                        <h4 className="text-xs font-mono font-black text-white truncate">
                          {agent.agent_id}
                        </h4>
                      </div>
                      <p className="text-3xs font-mono text-neutral-400 truncate">
                        {agent.agent_role || 'Autonomous Swarm Node'}
                      </p>
                    </div>

                    <StatusBadge
                      status={
                        agent.isDrifted
                          ? 'DRIFT DETECTED'
                          : agent.windowDist === null
                          ? 'WARMING UP'
                          : 'STABLE'
                      }
                      tone={agent.isDrifted ? 'bad' : agent.windowDist === null ? 'neutral' : 'ok'}
                    />
                  </div>

                  {/* Main ASI Gauge */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-2xs font-mono">
                      <span className="text-neutral-400 font-bold uppercase">Stability Index:</span>
                      <span
                        className={`font-black tnum ${
                          agent.asi === null ? 'text-neutral-500' : asiStyles.text
                        }`}
                      >
                        {agent.asi === null ? '—' : `${agent.asi.toFixed(1)}%`}
                      </span>
                    </div>
                    {agent.asi !== null && (
                      <Meter value={agent.asi / 100} tone={asiTone} showValue={false} />
                    )}
                  </div>

                  {/* Vector Drift Sub-Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 block uppercase font-bold">Sustained Shift</span>
                      <span
                        className={`text-xs font-black tnum ${
                          agent.windowDist === null ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {agent.windowDist === null ? '—' : agent.windowDist.toFixed(4)}
                      </span>
                      <span className="text-4xs text-neutral-400 block">
                        {agent.windowDist === null ? 'Windows not filled' : 'Alerts at 0.300'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 block uppercase font-bold">Centroid Spike</span>
                      <span
                        className={`text-xs font-black tnum ${
                          agent.centroidDist === null ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {agent.centroidDist === null ? '—' : agent.centroidDist.toFixed(4)}
                      </span>
                      <span className="text-4xs text-neutral-400 block">Per-span, not alerted on</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 block uppercase font-bold">Tool Usage Drift</span>
                      <span
                        className={`text-xs font-black tnum ${
                          agent.toolDrift === null ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {agent.toolDrift === null ? '—' : agent.toolDrift.toFixed(4)}
                      </span>
                      <span className="text-4xs text-neutral-400 block">Entropy shift</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface border-2 border-black shadow-[1px_1px_0px_#000]">
                      <span className="text-4xs text-neutral-400 block uppercase font-bold">Baseline Pool</span>
                      <span
                        className={`text-xs font-black tnum ${
                          agent.baselineSize === null ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {agent.baselineSize === null ? '—' : agent.baselineSize}
                      </span>
                      <span className="text-4xs text-neutral-400 block">Embeddings held</span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-end text-3xs font-mono text-neutral-400 font-bold">
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

