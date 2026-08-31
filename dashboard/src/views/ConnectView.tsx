import { FormEvent, useState, useEffect } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { AgentPulseConnection } from '../lib/api';

interface ConnectViewProps {
  initialConnection: AgentPulseConnection;
  onConnect: (connection: AgentPulseConnection) => void;
  onBack: () => void;
}

function normaliseUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Use an http:// or https:// instance URL.');
  }
  return parsed.toString().replace(/\/$/, '');
}

const PRESET_INSTANCES = [
  {
    id: 'local',
    name: 'Local Standalone Node',
    url: 'http://localhost:8000',
    type: 'Local Python Service',
    recommended: true,
  },
  {
    id: 'docker',
    name: 'Docker Fleet Cluster',
    url: 'http://127.0.0.1:8000',
    type: 'Containerized Swarm',
    recommended: false,
  },
  {
    id: 'custom',
    name: 'Remote Cloud VPC',
    url: 'https://telemetry.yourcompany.ai',
    type: 'Dedicated Endpoint',
    recommended: false,
  },
];

export function ConnectView({ initialConnection, onConnect, onBack }: ConnectViewProps) {
  const [instanceUrl, setInstanceUrl] = useState(initialConnection.baseUrl || 'http://localhost:8000');
  const [apiKey, setApiKey] = useState(initialConnection.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  // Quick live ping probe to instance URL
  useEffect(() => {
    let isCurrent = true;
    setPingStatus('checking');

    const checkPing = async () => {
      const startTime = performance.now();
      try {
        const normalized = normaliseUrl(instanceUrl);
        const res = await fetch(`${normalized}/v1/health/ready`, { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (isCurrent) {
          const latency = Math.round(performance.now() - startTime);
          setPingLatency(latency);
          setPingStatus(res.ok ? 'online' : 'offline');
        }
      } catch {
        if (isCurrent) {
          setPingStatus('offline');
          setPingLatency(null);
        }
      }
    };

    const timer = setTimeout(checkPing, 300);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [instanceUrl]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      onConnect({ baseUrl: normaliseUrl(instanceUrl), apiKey: apiKey.trim() || undefined });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enter a valid instance URL.');
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between px-4 sm:px-8 py-8 selection:bg-indigo-500/30 selection:text-white overflow-x-hidden">
      {/* ── Ambient Background Glow ── */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42rem] h-[42rem] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[30rem] h-[30rem] rounded-full bg-purple-500/10 blur-[140px] pointer-events-none -z-10" />

      {/* ── Top Header Navigation Bar ── */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between z-20">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-mono text-neutral-300 hover:text-white transition-all group cursor-pointer backdrop-blur-md shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-indigo-400" />
          <span>Return to Public Deck</span>
        </button>

        {/* Live Instance Ping Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-line backdrop-blur-md text-3xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              pingStatus === 'online'
                ? 'bg-emerald-400'
                : pingStatus === 'checking'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
          <span className="text-neutral-400">GATEWAY:</span>
          <span
            className={`font-bold ${
              pingStatus === 'online'
                ? 'text-emerald-400'
                : pingStatus === 'checking'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {pingStatus === 'online'
              ? `ONLINE (${pingLatency}ms)`
              : pingStatus === 'checking'
              ? 'PINGING...'
              : 'OFFLINE / UNREACHABLE'}
          </span>
        </div>
      </header>

      {/* ── Center Glassmorphism Configuration Card ── */}
      <main className="w-full max-w-xl mx-auto my-auto py-8 z-20">
        <div className="p-7 sm:p-9 rounded-3xl bg-surface-2 border border-line shadow-2xl space-y-7 transition-all">
          {/* Card Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-indigo-500/25">
                AP
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-3xs font-mono text-indigo-300">
                <Sparkles className="w-3 h-3" />
                <span>Zero-Egress Ingest</span>
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
                Connect to <span className="wordmark-gradient">AgentPulse</span>
              </h1>
              <p className="text-xs font-mono text-neutral-400 leading-relaxed mt-1">
                Establish an encrypted low-latency telemetry bridge to stream multi-agent traces, evaluate grounding cascades, and monitor vector drift in real time.
              </p>
            </div>
          </div>

          {/* Quick Instance Presets */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-3xs font-mono uppercase tracking-wider text-neutral-400 font-bold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                <span>Instance Presets</span>
              </label>
              <span className="text-4xs font-mono text-neutral-500">1-Click Select</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PRESET_INSTANCES.map((preset) => {
                const isSelected = instanceUrl === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setInstanceUrl(preset.url);
                      setError(null);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-500/15 border-indigo-500/50 shadow-signal'
                        : 'bg-surface border-line hover:bg-surface-3 hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold truncate ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                        {preset.name}
                      </span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </div>
                    <span className="text-3xs font-mono text-neutral-400 truncate block">
                      {preset.type}
                    </span>
                    <span className="text-4xs font-mono text-neutral-500 truncate block pt-1 border-t border-line">
                      {preset.url}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connect Form */}
          <form onSubmit={submit} className="space-y-5">
            {/* Instance URL Field */}
            <div className="space-y-1.5">
              <label htmlFor="instance-url" className="text-3xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center justify-between">
                <span>Instance URL</span>
                <span className="text-neutral-500 font-normal">HTTP / HTTPS</span>
              </label>
              <div className="relative group">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-indigo-400 transition-colors" />
                <input
                  id="instance-url"
                  type="text"
                  value={instanceUrl}
                  onChange={(e) => {
                    setInstanceUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="http://localhost:8000"
                  className="w-full bg-surface border border-line focus:border-indigo-400/60 focus:bg-surface-3 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-neutral-600 font-mono transition-all"
                  required
                />
              </div>
            </div>

            {/* API Key Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="api-key" className="text-3xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                  <span>API Key <span className="text-neutral-500 font-normal">(Optional for local dev)</span></span>
                </label>
                <span className="text-4xs font-mono text-neutral-500">X-API-Key</span>
              </div>
              <div className="relative group">
                <input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Bearer token or cluster API key..."
                  className="w-full bg-surface border border-line focus:border-indigo-400/60 focus:bg-surface-3 rounded-xl pl-4 pr-10 py-3 text-xs text-white placeholder:text-neutral-600 font-mono transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors cursor-pointer"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-300 flex items-start gap-2.5 animate-rise">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl text-xs font-bold font-mono bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/25 active:scale-[0.99]"
            >
              <span>Initialize Handshake Sequence</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      {/* ── Footer Security & Ephemeral Memory Guarantee ── */}
      <footer className="w-full max-w-xl mx-auto flex items-center justify-between text-3xs font-mono text-neutral-500 z-20 pt-2 border-t border-line">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Zero Credential Retention Guarantee</span>
        </div>
        <span>Self-Hosted &bull; Port 8000</span>
      </footer>
    </div>
  );
}
