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

  const asi = agent?.current_asi ?? null;
  const asiTone = asi === null ? 'ok' : asi < 65 ? 'bad' : asi < 85 ? 'warn' : 'ok';
  const asiStyles = riskToneStyles(asiTone);

  // Only points the backend actually scored. Unscored entries are dropped
  // rather than filled in, so the sparkline never invents a history.
  // Both trends arrive newest-first, so reverse to read left-to-right in time.
  const riskHistory: number[] = (healthData?.risk_trend ?? [])
    .map((r) => r.risk_score)
    .filter((score): score is number => score !== null && score !== undefined)
    .reverse();

  // Latest recorded centroid distance for this agent, if drift has run at all.
  const driftTrend = healthData?.drift_trend ?? [];
  const latestCentroid =
    driftTrend.find((d) => d.centroid_distance !== null)?.centroid_distance ?? null;

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
            <span
              className={`text-base font-black font-mono tnum ${
                asi === null ? 'text-neutral-500' : asiStyles.text
              }`}
            >
              {asi === null ? '—' : `${asi.toFixed(1)}%`}
            </span>
          </div>

          {asi === null ? (
            <p className="text-3xs font-mono text-neutral-500">No drift baseline recorded yet</p>
          ) : (
            <Meter value={asi / 100} tone={asiTone} showValue={false} />
          )}

          <div className="grid grid-cols-3 gap-2 pt-2 border-t-2 border-black text-center font-mono text-xs">
            <div className="p-2 rounded-xl bg-surface border border-black shadow-[1px_1px_0px_#000]">
              <span className="text-4xs text-neutral-400 block uppercase font-bold">Total Spans</span>
              <span className="font-black text-white tnum">{agent?.total_spans ?? '—'}</span>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-black shadow-[1px_1px_0px_#000]">
              <span className="text-4xs text-neutral-400 block uppercase font-bold">Avg Latency</span>
              <span className="font-black text-white tnum">
                {agent?.avg_latency_ms != null ? `${agent.avg_latency_ms.toFixed(0)}ms` : '—'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-black shadow-[1px_1px_0px_#000]">
              <span className="text-4xs text-neutral-400 block uppercase font-bold">Error Rate</span>
              <span
                className={`font-black tnum ${
                  agent?.error_rate == null
                    ? 'text-neutral-500'
                    : agent.error_rate > 0
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {agent?.error_rate != null ? `${(agent.error_rate * 100).toFixed(0)}%` : '—'}
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

          <div className="pt-2 flex items-center justify-between gap-3">
            <div className="text-2xs font-mono text-neutral-300 font-semibold">
              {riskHistory.length >= 2
                ? `Across ${riskHistory.length} evaluated spans`
                : 'Not enough evaluated spans to plot a trend'}
            </div>
            {riskHistory.length >= 2 && (
              <Sparkline data={riskHistory} width={140} height={36} tone="cyan" />
            )}
          </div>
        </Tile>

        {/* Vector Embedding Drift Trajectory */}
        <Tile accent="purple" className="p-4 space-y-2.5 text-xs font-mono">
          <div className="flex items-center gap-1.5 pb-2 border-b-2 border-black">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <h4 className="font-black uppercase tracking-wider text-white">Embedding Centroid Shift</h4>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-neutral-300 font-semibold">Latest Centroid Spike:</span>
            <span
              className={`font-black tnum ${
                latestCentroid === null ? 'text-neutral-500' : 'text-white'
              }`}
            >
              {latestCentroid === null ? '—' : latestCentroid.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-300 font-semibold">Alert Threshold:</span>
            <span className="font-bold text-neutral-400 tnum">0.3000</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-neutral-300 font-semibold">Baseline State:</span>
            {latestCentroid === null ? (
              <StatusBadge status="NO BASELINE" tone="neutral" />
            ) : (
              <StatusBadge
                status={latestCentroid > 0.3 ? 'ABOVE THRESHOLD' : 'WITHIN BASELINE'}
                tone={latestCentroid > 0.3 ? 'bad' : 'ok'}
              />
            )}
          </div>
          <p className="text-4xs text-neutral-500 leading-relaxed pt-1">
            Per-span spike against the EMA centroid. Drift alerts fire on the sustained
            window-centroid distance, shown in the Drift &amp; ASI view.
          </p>
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

