import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Search,
  Filter,
  Play,
  RotateCcw,
  Sparkles,
  Server,
  Layers,
  Database,
  Cpu,
  Shield,
  Radio,
  ExternalLink,
  ChevronRight,
  Flame,
  Code2,
  BarChart3,
  Sliders,
  Send,
  Check,
  RefreshCw
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import { ApiEndpointMetrics, ProductTab, Trace } from '../../types';
import { INITIAL_API_ENDPOINTS } from '../../data/mockPerformanceMetrics';
import { SystemStatusBanner, RollingErrorSample } from './SystemStatusBanner';

interface PerformanceViewProps {
  onNavigateToTrace?: (traceId: string) => void;
  onNavigateTab?: (tab: ProductTab) => void;
  traces?: Trace[];
  isSimulatingLive?: boolean;
}

type TimeRange = '5m' | '15m' | '1h' | '4h' | '24h';
type ChartMode = 'latency' | 'throughput' | 'breakdown' | 'status-codes';
type SortField = 'rps' | 'latency' | 'errorRate' | 'apdex' | 'path';

export const PerformanceView: React.FC<PerformanceViewProps> = ({
  onNavigateToTrace,
  onNavigateTab,
  traces = [],
  isSimulatingLive = true
}) => {
  const [endpoints, setEndpoints] = useState<ApiEndpointMetrics[]>(INITIAL_API_ENDPOINTS);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>(INITIAL_API_ENDPOINTS[0].id);
  const [timeRange, setTimeRange] = useState<TimeRange>('15m');
  const [chartMode, setChartMode] = useState<ChartMode>('latency');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('latency');
  const [sortAsc, setSortAsc] = useState(false);

  // Live probe test simulator state
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    endpointId: string;
    timestamp: string;
    latencyMs: number;
    status: number;
    statusText: string;
    payloadSizeKb: number;
  } | null>(null);

  // Rolling 5-minute error rate history & degradation simulation state
  const [isSpikeSimulated, setIsSpikeSimulated] = useState(false);
  const [isMitigating, setIsMitigating] = useState(false);
  const [mitigationMessage, setMitigationMessage] = useState<string | null>(null);

  const [rollingHistory, setRollingHistory] = useState<RollingErrorSample[]>(() => {
    const samples: RollingErrorSample[] = [];
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const ts = now - i * 30000;
      const date = new Date(ts);
      const timeLabel = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      const baseErr = 0.85 + (Math.sin(i * 0.7) + 1) * 0.45;
      samples.push({
        id: `sample-${i}-${ts}`,
        timestamp: ts,
        timeLabel,
        errorRate: Math.round(baseErr * 100) / 100,
        totalRps: 1840 + Math.round(Math.sin(i) * 120),
        isSpike: false
      });
    }
    return samples;
  });

  const rolling5mErrorRate = useMemo(() => {
    if (rollingHistory.length === 0) return 1.15;
    const sum = rollingHistory.reduce((acc, s) => acc + s.errorRate, 0);
    return Math.round((sum / rollingHistory.length) * 100) / 100;
  }, [rollingHistory]);

  const handleTriggerSpike = () => {
    setIsSpikeSimulated(true);
    setMitigationMessage(null);
    setEndpoints(prev =>
      prev.map(ep => {
        if (ep.path.includes('/v1/chat/completions') || ep.path.includes('/api/checkout/reserve') || ep.service.includes('Model')) {
          return {
            ...ep,
            errorRate: Math.round((8.4 + Math.random() * 1.5) * 10) / 10,
            avgLatencyMs: Math.round(ep.avgLatencyMs * 2.8),
            latencyP95Ms: Math.round(ep.latencyP95Ms * 2.5)
          };
        }
        return ep;
      })
    );

    // Update rolling history to reflect >5.0% error rate breach
    setRollingHistory(prev =>
      prev.map((s, idx) => {
        if (idx >= 3) {
          const spikeRate = 6.4 + (idx - 3) * 0.5 + Math.random() * 0.6;
          return {
            ...s,
            errorRate: Math.round(spikeRate * 100) / 100,
            isSpike: true
          };
        }
        return s;
      })
    );
  };

  const handleRestoreNormal = () => {
    setIsSpikeSimulated(false);
    setIsMitigating(false);
    setMitigationMessage(null);
    setEndpoints(INITIAL_API_ENDPOINTS);
    setRollingHistory(prev =>
      prev.map((s, idx) => ({
        ...s,
        errorRate: Math.round((0.85 + (idx % 3) * 0.25) * 100) / 100,
        isSpike: false
      }))
    );
  };

  const handleAutoMitigate = () => {
    setIsMitigating(true);
    setMitigationMessage('Activating automatic circuit breaker & traffic throttling...');

    setTimeout(() => {
      setEndpoints(prev =>
        prev.map(ep => ({
          ...ep,
          errorRate: Math.min(ep.errorRate, 1.15),
          avgLatencyMs: Math.min(ep.avgLatencyMs, 420),
          latencyP95Ms: Math.min(ep.latencyP95Ms, 680)
        }))
      );
      setRollingHistory(prev =>
        prev.map((s, idx) => ({
          ...s,
          errorRate: Math.round((0.75 + (idx % 4) * 0.2) * 100) / 100,
          isSpike: false
        }))
      );
      setIsSpikeSimulated(false);
      setIsMitigating(false);
      setMitigationMessage('Automated failover complete: Circuit breaker active, traffic drained from degraded nodes. Fleet error rate nominal at 0.88%.');

      setTimeout(() => {
        setMitigationMessage(null);
      }, 6000);
    }, 1600);
  };

  // Real-time jitter simulator
  useEffect(() => {
    if (!isSimulatingLive) return;

    const interval = setInterval(() => {
      setEndpoints(prev =>
        prev.map(ep => {
          // Add subtle micro-jitter to throughput and latency
          const jitterPercent = (Math.random() - 0.48) * 0.06;
          const newRps = Math.max(10, Math.round((ep.throughputRps * (1 + jitterPercent)) * 10) / 10);
          const latencyJitter = Math.round((Math.random() - 0.45) * 16);
          const newP95 = Math.max(ep.minLatencyMs + 20, ep.latencyP95Ms + latencyJitter);
          const newAvg = Math.max(ep.minLatencyMs, Math.round(ep.avgLatencyMs + latencyJitter * 0.4));
          
          // Update sparkline
          const newSparkline = [...ep.sparkline.slice(1), newAvg];

          return {
            ...ep,
            throughputRps: newRps,
            latencyP95Ms: newP95,
            avgLatencyMs: newAvg,
            sparkline: newSparkline
          };
        })
      );
    }, 2800);

    return () => clearInterval(interval);
  }, [isSimulatingLive]);

  // Unique services
  const uniqueServices = useMemo(() => {
    return Array.from(new Set(endpoints.map(e => e.service)));
  }, [endpoints]);

  // Filtered & Sorted endpoints
  const filteredEndpoints = useMemo(() => {
    return endpoints
      .filter(ep => {
        const matchesSearch =
          ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ep.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ep.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesService = serviceFilter === 'all' || ep.service === serviceFilter;
        const matchesStatus = statusFilter === 'all' || ep.status === statusFilter;
        return matchesSearch && matchesService && matchesStatus;
      })
      .sort((a, b) => {
        let valA = 0;
        let valB = 0;
        if (sortField === 'rps') {
          valA = a.throughputRps;
          valB = b.throughputRps;
        } else if (sortField === 'latency') {
          valA = a.latencyP95Ms;
          valB = b.latencyP95Ms;
        } else if (sortField === 'errorRate') {
          valA = a.errorRate;
          valB = b.errorRate;
        } else if (sortField === 'apdex') {
          valA = a.apdexScore;
          valB = b.apdexScore;
        } else if (sortField === 'path') {
          return sortAsc ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path);
        }
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [endpoints, searchQuery, serviceFilter, statusFilter, sortField, sortAsc]);

  // Selected endpoint
  const selectedEndpoint = useMemo(() => {
    return endpoints.find(e => e.id === selectedEndpointId) || endpoints[0];
  }, [endpoints, selectedEndpointId]);

  // Aggregate Golden Signals
  const aggregateMetrics = useMemo(() => {
    const totalRps = endpoints.reduce((acc, ep) => acc + ep.throughputRps, 0);
    const avgLatency = Math.round(endpoints.reduce((acc, ep) => acc + ep.avgLatencyMs, 0) / endpoints.length);
    const avgP95 = Math.round(endpoints.reduce((acc, ep) => acc + ep.latencyP95Ms, 0) / endpoints.length);
    const avgP99 = Math.round(endpoints.reduce((acc, ep) => acc + ep.latencyP99Ms, 0) / endpoints.length);
    const weightedErrorRate = Math.round(
      (endpoints.reduce((acc, ep) => acc + ep.errorRate * ep.throughputRps, 0) / totalRps) * 100
    ) / 100;
    const avgApdex = (endpoints.reduce((acc, ep) => acc + ep.apdexScore, 0) / endpoints.length).toFixed(2);
    const total24h = endpoints.reduce((acc, ep) => acc + ep.totalRequests24h, 0);

    return {
      totalRps: totalRps.toFixed(1),
      avgLatency,
      avgP95,
      avgP99,
      weightedErrorRate,
      avgApdex,
      total24hFormatted: (total24h / 1_000_000).toFixed(2) + 'M'
    };
  }, [endpoints]);

  // Handler for live probe test
  const handleRunProbe = (endpoint: ApiEndpointMetrics) => {
    setIsProbing(true);
    setProbeResult(null);

    setTimeout(() => {
      // Realistic probe latency centered around endpoint average with slight variation
      const probeLatency = Math.max(
        endpoint.minLatencyMs,
        Math.round(endpoint.avgLatencyMs + (Math.random() - 0.4) * 80)
      );
      const isError = Math.random() < endpoint.errorRate / 100;
      const status = isError ? (Math.random() > 0.5 ? 504 : 429) : 200;
      const statusText = status === 200 ? 'OK' : status === 504 ? 'Gateway Timeout' : 'Too Many Requests';
      const payloadSizeKb = Math.round((Math.random() * 8 + 2.4) * 10) / 10;

      setProbeResult({
        endpointId: endpoint.id,
        timestamp: new Date().toLocaleTimeString(),
        latencyMs: probeLatency,
        status,
        statusText,
        payloadSizeKb
      });
      setIsProbing(false);
    }, 620);
  };

  return (
    <div className="space-y-7 pb-28">
      {/* Top Banner: APM Architecture Status & Cluster Pulse */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-4.5 sm:p-5 relative overflow-hidden bg-gradient-to-r from-emerald-950/25 via-neutral-900/60 to-cyan-950/20 anime-tab-card">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              </span>
              <span className="font-mono text-xs font-semibold tracking-wider text-emerald-300 uppercase">
                Datadog APM • Live Ingestion Active
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Span Ingress /v1
              </span>
            </div>
            <p className="text-sm text-neutral-300 font-sans leading-relaxed max-w-2xl">
              Real-time golden signals across agent platform gateways, LLM model proxies, vector indexes, and execution sandbox endpoints.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 self-start lg:self-center">
            {/* Time range selector */}
            <div className="flex items-center bg-black/40 border border-white/[0.12] rounded-xl p-1 text-xs font-mono">
              {(['5m', '15m', '1h', '4h', '24h'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timeRange === range
                      ? 'bg-white/20 text-white font-semibold shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Quick action: Navigate to Traces */}
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('traces')}
                className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] text-xs font-mono text-neutral-200 hover:text-white transition-all flex items-center space-x-1.5"
              >
                <span>Traces Waterfall</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time System Status & 5-Minute Rolling Error Rate Degradation Banner */}
      <SystemStatusBanner
        currentErrorRate={aggregateMetrics.weightedErrorRate}
        rolling5mErrorRate={rolling5mErrorRate}
        threshold={5.0}
        rollingHistory={rollingHistory}
        endpoints={endpoints}
        isSpikeSimulated={isSpikeSimulated}
        isMitigating={isMitigating}
        mitigationMessage={mitigationMessage}
        onTriggerSpike={handleTriggerSpike}
        onRestoreNormal={handleRestoreNormal}
        onAutoMitigate={handleAutoMitigate}
        onNavigateToTrace={onNavigateToTrace}
        onNavigateTab={onNavigateTab}
      />

      {/* APM Golden Signals 4-Tile Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Average & p95 Response Time */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2.5">
            <span className="font-sans font-medium tracking-wider text-[11px] uppercase text-neutral-400">
              Avg & p95 Latency
            </span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="font-mono text-3xl font-black tracking-tight text-white">
              {aggregateMetrics.avgLatency}
            </span>
            <span className="font-mono text-xs text-neutral-400">ms avg</span>
            <span className="font-mono text-xs text-emerald-400/90 pl-1">
              ({aggregateMetrics.avgP95}ms p95)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.08]">
            <span>p99: {aggregateMetrics.avgP99}ms</span>
            <span className="text-emerald-400 flex items-center space-x-0.5">
              <ArrowDownRight className="w-3 h-3" />
              <span>-4.2% vs baseline</span>
            </span>
          </div>
        </div>

        {/* KPI 2: Error Rate */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2.5">
            <span className="font-sans font-medium tracking-wider text-[11px] uppercase text-neutral-400">
              Error Rate & SLO
            </span>
            <AlertTriangle
              className={`w-4 h-4 ${
                aggregateMetrics.weightedErrorRate > 2 ? 'text-rose-400' : 'text-amber-400'
              }`}
            />
          </div>
          <div className="flex items-baseline space-x-2">
            <span
              className={`font-mono text-3xl font-black tracking-tight ${
                aggregateMetrics.weightedErrorRate > 2 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {aggregateMetrics.weightedErrorRate}%
            </span>
            <span className="font-mono text-xs text-neutral-400">5xx / 4xx</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.08]">
            <span>SLO Target: 99.9%</span>
            <span className="text-neutral-300">Burn Rate: 1.1x</span>
          </div>
        </div>

        {/* KPI 3: Throughput */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2.5">
            <span className="font-sans font-medium tracking-wider text-[11px] uppercase text-neutral-400">
              Total Throughput
            </span>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="font-mono text-3xl font-black tracking-tight text-white">
              {aggregateMetrics.totalRps}
            </span>
            <span className="font-mono text-xs text-neutral-400">req/s</span>
            <span className="text-[10px] text-cyan-400 font-mono pl-1">
              ({aggregateMetrics.total24hFormatted} 24h)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.08]">
            <span>Active Swarms: 6</span>
            <span className="text-cyan-400 flex items-center space-x-0.5">
              <ArrowUpRight className="w-3 h-3" />
              <span>+8.4% peak load</span>
            </span>
          </div>
        </div>

        {/* KPI 4: Apdex Score */}
        <div className="ios-liquid-card ios-liquid-card-interactive border-glow-subtle rounded-2xl p-5 relative overflow-hidden anime-tab-card">
          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2.5">
            <span className="font-sans font-medium tracking-wider text-[11px] uppercase text-neutral-400">
              Apdex Satisfaction
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="font-mono text-3xl font-black tracking-tight text-emerald-400">
              {aggregateMetrics.avgApdex}
            </span>
            <span className="font-mono text-xs text-neutral-400">/ 1.00</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300">
              Excellent
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.08]">
            <span>T = 300ms Threshold</span>
            <span className="text-neutral-300">Satisfied: 94.2%</span>
          </div>
        </div>
      </div>

      {/* Main Graph Surface: Datadog APM Timeseries Charts */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-5 sm:p-6 relative overflow-hidden anime-tab-card">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.1]">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-neutral-400" />
              <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
                APM Timeseries Telemetry: {selectedEndpoint.path}
              </h3>
            </div>
            <p className="text-xs text-neutral-400 mt-1 font-sans">
              Real-time response time curves, request volume spikes, and error budget distribution.
            </p>
          </div>

          {/* Metric Selector Buttons */}
          <div className="flex items-center bg-black/40 border border-white/[0.12] rounded-xl p-1 text-xs font-mono">
            <button
              onClick={() => setChartMode('latency')}
              className={`px-3 py-1 rounded-lg transition-all ${
                chartMode === 'latency'
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Latency Percentiles
            </button>
            <button
              onClick={() => setChartMode('throughput')}
              className={`px-3 py-1 rounded-lg transition-all ${
                chartMode === 'throughput'
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Throughput & RPS
            </button>
            <button
              onClick={() => setChartMode('breakdown')}
              className={`px-3 py-1 rounded-lg transition-all ${
                chartMode === 'breakdown'
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Latency Breakdown
            </button>
          </div>
        </div>

        {/* Dynamic Chart Container */}
        <div className="h-[270px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'latency' ? (
              <AreaChart data={selectedEndpoint.recentTimeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="p99Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#737373" fontSize={11} tickLine={false} />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} unit="ms" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0a0c',
                    borderColor: '#262626',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                  }}
                  formatter={(val: any, name: any) => [`${val} ms`, name === 'p95' ? 'p95 Latency' : name === 'p99' ? 'p99 Latency' : 'Average Latency']}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
                  formatter={(value) => value === 'p95' ? 'p95 Latency (ms)' : value === 'p99' ? 'p99 Latency (ms)' : 'Average Latency (ms)'}
                />
                <Area type="monotone" dataKey="p99" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={1} fill="url(#p99Grad)" />
                <Area type="monotone" dataKey="p95" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#p95Grad)" />
                <Line type="monotone" dataKey="latencyAvg" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
              </AreaChart>
            ) : chartMode === 'throughput' ? (
              <BarChart data={selectedEndpoint.recentTimeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#737373" fontSize={11} tickLine={false} />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} unit=" rps" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0a0c',
                    borderColor: '#262626',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'monospace'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }} />
                <Bar dataKey="status2xx" name="2xx Success" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="status4xx" name="4xx Client Error" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="status5xx" name="5xx Server Error" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <div className="h-full flex flex-col justify-center space-y-6 px-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-neutral-400">Subsystem Execution Latency Breakdown</span>
                    <span className="text-white font-bold">{selectedEndpoint.avgLatencyMs}ms Total Avg</span>
                  </div>
                  {/* Multi-segment stacked progress bar */}
                  <div className="h-6 w-full rounded-xl overflow-hidden flex bg-neutral-900 border border-white/[0.12]">
                    <div
                      style={{ width: `${(selectedEndpoint.latencyBreakdown.inferenceMs / selectedEndpoint.avgLatencyMs) * 100}%` }}
                      className="bg-emerald-500/80 hover:bg-emerald-400 transition-colors flex items-center justify-center text-[10px] font-mono text-black font-semibold truncate px-1"
                      title={`Model Inference: ${selectedEndpoint.latencyBreakdown.inferenceMs}ms`}
                    >
                      Inference {selectedEndpoint.latencyBreakdown.inferenceMs}ms
                    </div>
                    <div
                      style={{ width: `${(selectedEndpoint.latencyBreakdown.toolsMs / selectedEndpoint.avgLatencyMs) * 100}%` }}
                      className="bg-cyan-500/80 hover:bg-cyan-400 transition-colors flex items-center justify-center text-[10px] font-mono text-black font-semibold truncate px-1"
                      title={`Tools & Sandbox: ${selectedEndpoint.latencyBreakdown.toolsMs}ms`}
                    >
                      Tools {selectedEndpoint.latencyBreakdown.toolsMs}ms
                    </div>
                    <div
                      style={{ width: `${(selectedEndpoint.latencyBreakdown.dbMs / selectedEndpoint.avgLatencyMs) * 100}%` }}
                      className="bg-amber-500/80 hover:bg-amber-400 transition-colors flex items-center justify-center text-[10px] font-mono text-black font-semibold truncate px-1"
                      title={`DB & Vector Store: ${selectedEndpoint.latencyBreakdown.dbMs}ms`}
                    >
                      DB {selectedEndpoint.latencyBreakdown.dbMs}ms
                    </div>
                    <div
                      style={{ width: `${(selectedEndpoint.latencyBreakdown.networkMs / selectedEndpoint.avgLatencyMs) * 100}%` }}
                      className="bg-violet-500/80 hover:bg-violet-400 transition-colors flex items-center justify-center text-[10px] font-mono text-white font-semibold truncate px-1"
                      title={`Network: ${selectedEndpoint.latencyBreakdown.networkMs}ms`}
                    >
                      Net {selectedEndpoint.latencyBreakdown.networkMs}ms
                    </div>
                  </div>
                </div>

                {/* Subsystem Legend Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-white/[0.08] flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Model Inference</span>
                      <span className="font-bold text-white">{selectedEndpoint.latencyBreakdown.inferenceMs}ms</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-white/[0.08] flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Tool Execution</span>
                      <span className="font-bold text-white">{selectedEndpoint.latencyBreakdown.toolsMs}ms</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-white/[0.08] flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Vector / DB I/O</span>
                      <span className="font-bold text-white">{selectedEndpoint.latencyBreakdown.dbMs}ms</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-white/[0.08] flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Network Serialization</span>
                      <span className="font-bold text-white">{selectedEndpoint.latencyBreakdown.networkMs}ms</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Split Grid: Endpoints Table (Left) & Deep Dive Endpoint Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: API Endpoints Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative anime-tab-card">
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

            {/* Table Header & Search Filter Bar */}
            <div className="p-4 sm:p-5 border-b border-white/[0.12] bg-white/[0.04] backdrop-blur-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
                    API Endpoints ({filteredEndpoints.length})
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-neutral-400">
                  Click endpoint to inspect
                </span>
              </div>

              {/* Filters row */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter endpoints by path or service..."
                    className="w-full pl-8.5 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.12] text-xs font-mono text-white placeholder-neutral-500 focus:outline-hidden focus:border-emerald-400/60 transition-colors"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={serviceFilter}
                    onChange={e => setServiceFilter(e.target.value)}
                    aria-label="Filter by service"
                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/[0.12] text-xs font-mono text-neutral-300 focus:outline-hidden focus:border-emerald-400/60"
                  >
                    <option value="all">All Services</option>
                    {uniqueServices.map(svc => (
                      <option key={svc} value={svc}>
                        {svc}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/[0.12] text-xs font-mono text-neutral-300 focus:outline-hidden focus:border-emerald-400/60"
                  >
                    <option value="all">All Statuses</option>
                    <option value="healthy">Healthy</option>
                    <option value="degraded">Degraded</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Endpoints List */}
            <div className="divide-y divide-white/[0.06] max-h-[580px] overflow-y-auto scrollbar-none">
              {filteredEndpoints.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-neutral-400">
                  No endpoints matched your search criteria.
                </div>
              ) : (
                filteredEndpoints.map(endpoint => {
                  const isSelected = endpoint.id === selectedEndpointId;
                  return (
                    <div
                      key={endpoint.id}
                      onClick={() => setSelectedEndpointId(endpoint.id)}
                      className={`p-4 cursor-pointer transition-all duration-200 relative group anime-tab-row ${
                        isSelected
                          ? 'bg-white/[0.08] border-l-2 border-emerald-400 shadow-inner'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            {/* Method pill */}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight ${
                                endpoint.method === 'GET'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  : endpoint.method === 'POST'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {endpoint.method}
                            </span>
                            <span className="font-mono text-xs font-semibold text-white truncate">
                              {endpoint.path}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center space-x-2 text-[11px] font-mono text-neutral-400">
                            <span className="text-neutral-300">{endpoint.service}</span>
                            <span>•</span>
                            <span>{endpoint.throughputRps} rps</span>
                            <span>•</span>
                            <span className="text-neutral-400">Apdex: {endpoint.apdexScore}</span>
                          </div>
                        </div>

                        {/* Latency & Error Rate stats */}
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <div className="flex items-center space-x-2">
                            {/* Micro sparkline */}
                            <div className="w-16 h-4 hidden sm:flex items-end space-x-0.5">
                              {endpoint.sparkline.map((pt, i) => {
                                const max = Math.max(...endpoint.sparkline);
                                const heightPercent = Math.max(15, (pt / max) * 100);
                                return (
                                  <div
                                    key={i}
                                    style={{ height: `${heightPercent}%` }}
                                    className={`w-1 rounded-xs ${
                                      endpoint.status === 'degraded'
                                        ? 'bg-amber-400/70'
                                        : 'bg-emerald-400/70'
                                    }`}
                                  />
                                );
                              })}
                            </div>

                            <span className="font-mono text-xs font-bold text-white">
                              {endpoint.latencyP95Ms}ms <span className="text-[10px] text-neutral-400 font-normal">p95</span>
                            </span>
                          </div>

                          <div className="mt-1 flex items-center space-x-1.5 text-[10px] font-mono">
                            <span
                              className={`px-1.5 py-0.2 rounded ${
                                endpoint.errorRate > 2
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-neutral-800 text-neutral-300'
                              }`}
                            >
                              {endpoint.errorRate}% err
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded uppercase ${
                                endpoint.status === 'healthy'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              {endpoint.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Endpoint Deep Dive Inspector */}
        <div className="lg:col-span-5 space-y-4">
          <div className="ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative anime-tab-card">
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

            {/* Inspector Header */}
            <div className="p-4 sm:p-5 border-b border-white/[0.12] bg-white/[0.04] backdrop-blur-xl flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      selectedEndpoint.method === 'GET'
                        ? 'bg-sky-500/20 text-sky-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <h4 className="font-mono text-xs font-bold text-white truncate">
                    {selectedEndpoint.path}
                  </h4>
                </div>
                <span className="text-[11px] font-sans text-neutral-400 block mt-1">
                  Service: <strong className="text-neutral-200">{selectedEndpoint.service}</strong>
                </span>
              </div>

              {/* Probe Test Button */}
              <button
                onClick={() => handleRunProbe(selectedEndpoint)}
                disabled={isProbing}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 text-xs font-mono transition-all flex items-center space-x-1.5 shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
                title="Send Live Synthetic Benchmark Probe"
              >
                {isProbing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Pinging...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Probe</span>
                  </>
                )}
              </button>
            </div>

            {/* Inspector Body */}
            <div className="p-5 space-y-6 max-h-[620px] overflow-y-auto scrollbar-none text-xs font-mono">
              {/* Probe Result Card (if just triggered) */}
              {probeResult && probeResult.endpointId === selectedEndpoint.id && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-1.5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center space-x-1.5 text-emerald-300 font-bold text-xs">
                      <Check className="w-3.5 h-3.5" />
                      <span>Live Probe Benchmark Response</span>
                    </span>
                    <span className="text-[10px] text-neutral-400">{probeResult.timestamp}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-neutral-400 block text-[10px]">HTTP Status</span>
                      <span className="text-emerald-300 font-bold">
                        {probeResult.status} {probeResult.statusText}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Round-Trip</span>
                      <span className="text-white font-bold">{probeResult.latencyMs}ms</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Payload</span>
                      <span className="text-neutral-200 font-bold">{probeResult.payloadSizeKb} KB</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Percentile Ladder */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2.5">
                  Latency Percentile Ladder
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-neutral-400 block">p50 (Median)</span>
                    <span className="text-sm font-bold text-white">{selectedEndpoint.latencyP50Ms}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-neutral-400 block">p90</span>
                    <span className="text-sm font-bold text-neutral-200">{selectedEndpoint.latencyP90Ms}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-neutral-400 block">p95</span>
                    <span className="text-sm font-bold text-emerald-400">{selectedEndpoint.latencyP95Ms}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-neutral-400 block">p99 (Tail)</span>
                    <span className="text-sm font-bold text-amber-400">{selectedEndpoint.latencyP99Ms}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-neutral-400 block">Min</span>
                    <span className="text-sm font-bold text-neutral-300">{selectedEndpoint.minLatencyMs}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-neutral-400 block">Max Peak</span>
                    <span className="text-sm font-bold text-rose-400">{selectedEndpoint.maxLatencyMs}ms</span>
                  </div>
                </div>
              </div>

              {/* Status Code Distribution */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2.5">
                  24h HTTP Status Codes
                </span>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] text-neutral-300">
                    <span className="flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>2xx OK: {selectedEndpoint.statusCodes.code2xx.toLocaleString()}</span>
                    </span>
                    <span className="flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>5xx Err: {selectedEndpoint.statusCodes.code5xx.toLocaleString()}</span>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-neutral-900">
                    <div
                      style={{
                        width: `${(selectedEndpoint.statusCodes.code2xx / selectedEndpoint.totalRequests24h) * 100}%`
                      }}
                      className="bg-emerald-500"
                    />
                    <div
                      style={{
                        width: `${(selectedEndpoint.statusCodes.code4xx / selectedEndpoint.totalRequests24h) * 100}%`
                      }}
                      className="bg-amber-500"
                    />
                    <div
                      style={{
                        width: `${(selectedEndpoint.statusCodes.code5xx / selectedEndpoint.totalRequests24h) * 100}%`
                      }}
                      className="bg-rose-500"
                    />
                  </div>
                </div>
              </div>

              {/* Top Failing Signatures */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
                    Top Error Signatures ({selectedEndpoint.topErrors.length})
                  </span>
                  <span className="text-[10px] text-neutral-500">Live Stack Aggregation</span>
                </div>

                {selectedEndpoint.topErrors.length === 0 ? (
                  <div className="p-3 rounded-xl bg-black/30 border border-white/[0.06] text-neutral-400 text-center text-xs">
                    No active error signatures detected in the current window.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedEndpoint.topErrors.map((err, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-black/40 border border-white/[0.08] hover:border-rose-500/40 transition-colors space-y-1.5 group"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              err.status >= 500
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            HTTP {err.status}
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            {err.count} occurrences • {err.lastSeen}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-200 font-sans leading-snug">
                          {err.message}
                        </p>

                        {err.sampleTraceId && onNavigateToTrace && (
                          <div className="pt-1 flex justify-end">
                            <button
                              onClick={() => {
                                onNavigateToTrace(err.sampleTraceId!);
                                onNavigateTab?.('traces');
                              }}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 font-mono transition-colors"
                            >
                              <span>Inspect Trace {err.sampleTraceId}</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Topology / Dependency Links */}
              <div className="pt-2 border-t border-white/[0.08] space-y-2.5">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
                  Service Topology Flow
                </span>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">Upstream Callers:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEndpoint.upstreamCallers.map((up, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-lg bg-neutral-900 border border-white/[0.08] text-[11px] text-neutral-300"
                        >
                          {up}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1">
                    <span className="text-[10px] text-neutral-400 block mb-1">Downstream Dependencies:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEndpoint.downstreamDependencies.map((down, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-lg bg-neutral-900 border border-white/[0.08] text-[11px] text-cyan-300/90"
                        >
                          {down}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
