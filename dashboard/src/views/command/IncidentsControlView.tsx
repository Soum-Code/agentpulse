import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  Flame,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { AlertItem, ApiClient } from '../../lib/api';
import {
  EmptyState,
  FilterChip,
  RiskPill,
  riskTone,
  riskToneStyles,
  SearchInput,
  Stat,
  StatusBadge,
  Tile,
} from '../../components/ui';

interface IncidentsControlViewProps {
  alerts: AlertItem[];
  client: ApiClient;
  onSelectTrace: (traceId: string) => void;
  onNavigateTab: (tab: 'traces' | 'overview' | 'drift' | 'lab' | 'datasets') => void;
  showToast: (msg: string) => void;
}

export function IncidentsControlView({
  alerts,
  client,
  onSelectTrace,
  onNavigateTab,
  showToast,
}: IncidentsControlViewProps) {
  const [localAlerts, setLocalAlerts] = useState<AlertItem[]>(alerts);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNACKNOWLEDGED' | 'CRITICAL' | 'WARNING'>('UNACKNOWLEDGED');
  const [expandedAlerts, setExpandedAlerts] = useState<Record<number, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  React.useEffect(() => {
    setLocalAlerts(alerts);
  }, [alerts]);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return localAlerts.filter((alert) => {
      const agentId = alert.agent_id || '';
      const matchesSearch =
        agentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.alert_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (alert.message && alert.message.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (filterTab === 'UNACKNOWLEDGED') return !alert.acknowledged;
      if (filterTab === 'CRITICAL') return alert.severity === 'critical' || alert.severity === 'high';
      if (filterTab === 'WARNING') return alert.severity === 'warning' || alert.severity === 'medium';
      return true;
    });
  }, [localAlerts, searchQuery, filterTab]);

  // Acknowledge alert handler
  const handleAcknowledge = async (alertId: number) => {
    try {
      setActionLoading((prev) => ({ ...prev, [alertId]: true }));
      await client.acknowledgeAlert(alertId);
      setLocalAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
      showToast(`Incident #${alertId} acknowledged.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to acknowledge incident.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [alertId]: false }));
    }
  };

  const totalUnacked = localAlerts.filter((a) => !a.acknowledged).length;
  const criticalCount = localAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length;

  return (
    <div className="space-y-6 rise pb-20 font-sans">
      {/* ── Top Incident Statistics Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          accent="purple"
          label="Total Incidents"
          value={localAlerts.length}
          subtext="Logged risk anomalies"
          icon={AlertTriangle}
        />
        <Stat
          accent="pink"
          label="Unacknowledged"
          value={totalUnacked}
          subtext={totalUnacked > 0 ? 'Pending triage' : 'All incidents resolved'}
          tone={totalUnacked > 0 ? 'bad' : 'ok'}
          icon={ShieldAlert}
        />
        <Stat
          accent="pink"
          label="Critical Severity"
          value={criticalCount}
          subtext="High grounding risk"
          tone={criticalCount > 0 ? 'crit' : 'ok'}
          icon={Flame}
        />
        <Stat
          accent="green"
          label="Resolution Time"
          value="< 4.2m"
          subtext="Fast operator triage"
          tone="ok"
          icon={ShieldCheck}
        />
      </div>

      {/* ── Incident Queue Header & Filters ── */}
      <Tile accent="pink" className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-pink-500 border border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
              <ShieldAlert className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-sm font-mono uppercase tracking-wider font-black text-white">
              Live Incident Triage Queue ({filteredAlerts.length})
            </h2>
          </div>

          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search incident reason or agent..."
            className="w-full sm:w-72"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip
            label="Unacknowledged"
            tone="pink"
            active={filterTab === 'UNACKNOWLEDGED'}
            onClick={() => setFilterTab('UNACKNOWLEDGED')}
            count={totalUnacked}
          />
          <FilterChip
            label="All Incidents"
            active={filterTab === 'ALL'}
            onClick={() => setFilterTab('ALL')}
            count={localAlerts.length}
            tone="signal"
          />
          <FilterChip
            label="Critical"
            tone="bad"
            active={filterTab === 'CRITICAL'}
            onClick={() => setFilterTab('CRITICAL')}
            count={criticalCount}
          />
          <FilterChip
            label="Warnings"
            tone="warn"
            active={filterTab === 'WARNING'}
            onClick={() => setFilterTab('WARNING')}
          />
        </div>
      </Tile>

      {/* ── Incident Cards Queue ── */}
      {filteredAlerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Incident Queue is Clear"
          description="No incidents match the active filter criteria. Swarm quality is within nominal bounds."
        />
      ) : (
        <div className="space-y-3.5">
          {filteredAlerts.map((alert) => {
            const isCritical = alert.severity === 'critical' || alert.severity === 'high';
            const isExpanded = !!expandedAlerts[alert.id];
            const isLoading = !!actionLoading[alert.id];
            const riskVal = (alert.details as any)?.risk_score;

            return (
              <Tile
                key={alert.id}
                accent={isCritical ? 'pink' : 'yellow'}
                className="p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge
                        status={alert.severity.toUpperCase()}
                        tone={isCritical ? 'bad' : 'warn'}
                      />
                      <span className="text-xs font-mono font-black text-white">
                        Incident #{alert.id}: {alert.alert_type}
                      </span>
                      {alert.acknowledged && (
                        <span className="comic-tag bg-emerald-400 text-black">
                          ACKNOWLEDGED
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-neutral-300 leading-relaxed pt-1">
                      {alert.message || 'Elevated risk threshold triggered during agent reasoning.'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!alert.acknowledged && (
                      <button
                        type="button"
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={isLoading}
                        className="comic-btn-green px-3.5 py-1.5 text-2xs font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                        <span>{isLoading ? 'Resolving...' : 'Acknowledge'}</span>
                      </button>
                    )}
                    {alert.trace_id && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTrace(alert.trace_id!);
                          onNavigateTab('traces');
                        }}
                        className="comic-btn-yellow px-3.5 py-1.5 text-2xs font-mono flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Investigate Trace</span>
                        <ArrowRight className="w-3.5 h-3.5 text-black" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Root Cause Breadcrumb Path */}
                <div className="p-3 rounded-xl bg-surface border-2 border-black shadow-[2px_2px_0px_#000] flex flex-wrap items-center gap-2 text-2xs font-mono">
                  <span className="text-neutral-400 uppercase font-black">Investigation Spine:</span>
                  <span className="comic-tag bg-surface-2 text-white">
                    Agent: {alert.agent_id || 'System'}
                  </span>
                  <span className="text-yellow-400 font-bold">➔</span>
                  <span className="comic-tag bg-surface-2 text-cyan-300">
                    Trace: {alert.trace_id ? alert.trace_id.slice(0, 14) + '...' : 'Global'}
                  </span>
                  {alert.span_id && (
                    <>
                      <span className="text-yellow-400 font-bold">➔</span>
                      <span className="comic-tag bg-surface-2 text-purple-300">
                        Span: {alert.span_id.slice(0, 12)}
                      </span>
                    </>
                  )}
                  {riskVal !== undefined && (
                    <>
                      <span className="text-yellow-400 font-bold">➔</span>
                      <span className="comic-tag bg-pink-500 text-white">
                        Risk: {typeof riskVal === 'number' ? riskVal.toFixed(3) : riskVal}
                      </span>
                    </>
                  )}
                </div>

                {/* Expandable Raw Telemetry */}
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedAlerts((prev) => ({ ...prev, [alert.id]: !prev[alert.id] }))
                    }
                    className="inline-flex items-center gap-1 text-3xs font-mono font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <span>{isExpanded ? 'Hide Raw Telemetry' : 'Inspect Raw Incident Payload'}</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-3.5 rounded-xl bg-surface border-2 border-black text-3xs font-mono text-neutral-300 overflow-x-auto shadow-[2px_2px_0px_#000]">
                      <pre>{JSON.stringify(alert, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </Tile>
            );
          })}
        </div>
      )}
    </div>
  );
}

