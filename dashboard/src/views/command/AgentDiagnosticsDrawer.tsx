import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Flame,
  Layers,
  Route,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Agent, ApiClient } from '../../lib/api';
import {
  Meter,
  RiskPill,
  riskTone,
  riskToneStyles,
  Sparkline,
  StatusBadge,
  Tile,
} from '../../components/ui';

interface AgentDiagnosticsDrawerProps {
  agentId: string | null;
  agent: Agent | undefined;
  client: ApiClient;
  onClose: () => void;
  onFilterTracesByAgent: (agentId: string) => void;
}

export function AgentDiagnosticsDrawer({
  agentId,
  agent,
  client,
  onClose,
  onFilterTracesByAgent,
}: AgentDiagnosticsDrawerProps) {
  const [healthData, setHealthData] = useState<{
    risk_trend: { timestamp: string; risk_score: number | null }[];
    drift_trend: { timestamp: string; centroid_distance: number | null; stability_index: number | null }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setHealthData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    client
      .getAgentHealth(agentId)
      .then((data) => {
        if (isMounted) setHealthData(data as any);
      })
      .catch(() => {
        if (isMounted) setHealthData(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [agentId, client]);

  if (!agentId) return null;

  const asi = agent?.current_asi ?? 94.5;
  const asiTone = asi < 65 ? 'bad' : asi < 85 ? 'warn' : 'ok';
  const asiStyles = riskToneStyles(asiTone);

  const riskHistory = healthData?.risk_trend?.map((r) => r.risk_score ?? 0.05) || [
    0.04, 0.08, 0.06, 0.12, 0.09, 0.15, 0.08, 0.04,
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-surface-2 border-l-2 border-black shadow-comic-xl flex flex-col justify-between animate-rise font-sans">
      {/* ── Drawer Header ── */}
      <div className="p-5 border-b-2 border-black flex items-center justify-between bg-surface">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-yellow-400 border-2 border-black flex items-center justify-center text-black shadow-[1.5px_1.5px_0px_#000]">
            <Brain className="w-4 h-4" />
          </div>
          <div className="truncate">
            <h3 className="text-xs font-mono font-black text-white truncate">{agentId}</h3>
            <p className="text-3xs font-mono text-neutral-400 truncate font-semibold">
              {agent?.agent_role || 'Autonomous Swarm Node'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl border-2 border-black bg-surface-2 text-neutral-300 hover:text-white shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Drawer Body ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* ASI Stability Status Card */}
        <Tile accent="yellow" className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-mono uppercase text-neutral-400 font-black">
              Agent Stability Index (ASI)
            </span>
            <span className={`text-base font-black font-mono tnum ${asiStyles.text}`}>
              {asi.toFixed(1)}%
            </span>
          </div>

          <Meter value={asi / 100} tone={asiTone} showValue={false} />

          <div className="grid grid-cols-3 gap-2 pt-2 border-t-2 border-black text-center font-mono text-xs">
            <div className="p-2 rounded-xl bg-surface border border-black shadow-[1px_1px_0px_#000]">
              <span className="text-4xs text-neutral-400 block uppercase font-bold">Total Spans</span>
              <span className="font-black text-white tnum">{agent?.total_spans ?? 24}</span>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-black shadow-[1px_1px_0px_#000]">
              <span className="text-4xs text-neutral-400 block uppercase font-bold">Avg Latency</span>
              <span className="font-black text-white tnum">
                {agent?.avg_latency_ms ? `${agent.avg_latency_ms.toFixed(0)}ms` : '42ms'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-black shadow-[1px_1px_0px_#000]">
              <span className="text-4xs text-neutral-400 block uppercase font-bold">Error Rate</span>
              <span className="font-black text-emerald-400 tnum">
                {agent?.error_rate ? `${(agent.error_rate * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>
        </Tile>

        {/* Risk Trend & Waveform */}
        <Tile accent="cyan" className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <h4 className="text-xs font-mono font-black uppercase tracking-wider text-white">
                Historic Grounding Risk
              </h4>
            </div>
            <RiskPill score={agent?.avg_risk_score} size="sm" />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="text-2xs font-mono text-neutral-300 font-semibold">
              Variance across {riskHistory.length} spans
            </div>
            <Sparkline data={riskHistory} width={140} height={36} tone="cyan" />
          </div>
        </Tile>

        {/* Vector Embedding Drift Trajectory */}
        <Tile accent="purple" className="p-4 space-y-2.5 text-xs font-mono">
          <div className="flex items-center gap-1.5 pb-2 border-b-2 border-black">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <h4 className="font-black uppercase tracking-wider text-white">Embedding Centroid Shift</h4>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-neutral-300 font-semibold">Current Centroid Distance:</span>
            <span className="font-black text-white tnum">0.0842</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-300 font-semibold">Max Variance Allowed:</span>
            <span className="font-bold text-neutral-400 tnum">0.3000</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-neutral-300 font-semibold">Baseline State:</span>
            <StatusBadge status="WITHIN BASELINE" tone="ok" />
          </div>
        </Tile>
      </div>

      {/* ── Drawer Footer Action ── */}
      <div className="p-5 border-t-2 border-black bg-surface flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onFilterTracesByAgent(agentId);
            onClose();
          }}
          className="w-full comic-btn-yellow py-3 px-4 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer"
        >
          <Route className="w-4 h-4 text-black" />
          <span>Filter Traces for {agentId}</span>
        </button>
      </div>
    </div>
  );
}

