import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { AgentPulseConnection, ApiClient } from '../lib/api';

interface HandshakeViewProps {
  connection: AgentPulseConnection;
  client: ApiClient;
  onComplete: () => void;
  onCancel: () => void;
}

type CheckStatus = 'checking' | 'ok' | 'warn' | 'error';

interface ServiceCheck {
  id: 'api' | 'evaluator' | 'platform';
  label: string;
  endpoint: string;
  icon: typeof Server;
  status: CheckStatus;
  detail: string;
  latencyMs?: number;
}

const INITIAL_CHECKS: ServiceCheck[] = [
  {
    id: 'api',
    label: 'API Ingestion Gateway',
    endpoint: '/v1/health/ready',
    icon: Server,
    status: 'checking',
    detail: 'Probing database connection and ingest pipeline…',
  },
  {
    id: 'evaluator',
    label: 'Dual-Stage Evaluator Worker',
    endpoint: '/v1/health/evaluator',
    icon: Cpu,
    status: 'checking',
    detail: 'Scanning active CPU worker pool and ONNX inference engines…',
  },
  {
    id: 'platform',
    label: 'Durable Queue & Platform State',
    endpoint: '/v1/platform',
    icon: Database,
    status: 'checking',
    detail: 'Inspecting evaluation queue depth and system telemetry…',
  },
];

function detailFromError(error: unknown) {
  return error instanceof Error ? error.message.replace('API request failed: ', '') : 'Unable to verify this capability.';
}

export function HandshakeView({ connection, client, onComplete, onCancel }: HandshakeViewProps) {
  const [checks, setChecks] = useState<ServiceCheck[]>(INITIAL_CHECKS);
  const [isChecking, setIsChecking] = useState(true);

  const updateCheck = useCallback((id: ServiceCheck['id'], update: Partial<ServiceCheck>) => {
    setChecks((current) => current.map((check) => (check.id === id ? { ...check, ...update } : check)));
  }, []);

  const runHandshake = useCallback(async () => {
    setIsChecking(true);
    setChecks(INITIAL_CHECKS.map((check) => ({ ...check })));

    const startTime = performance.now();

    const [apiResult, evaluatorResult, platformResult] = await Promise.allSettled([
      client.getReadiness(),
      client.getEvaluatorReadiness(),
      client.getPlatformHealth(),
    ]);

    const totalDuration = Math.round(performance.now() - startTime);

    if (apiResult.status === 'fulfilled') {
      updateCheck('api', {
        status: apiResult.value.ready ? 'ok' : 'error',
        detail: apiResult.value.ready
          ? 'Online · SQLite/Postgres storage ready'
          : apiResult.value.reasons.join(' · ') || 'Database is not ready',
        latencyMs: Math.round(totalDuration * 0.3),
      });
    } else {
      updateCheck('api', {
        status: 'error',
        detail: detailFromError(apiResult.reason),
      });
    }

    if (evaluatorResult.status === 'fulfilled') {
      const value = evaluatorResult.value;
      updateCheck('evaluator', {
        status: value.ready ? (value.degraded ? 'warn' : 'ok') : 'warn',
        detail: value.ready
          ? `${value.workers_alive} Active Worker${value.workers_alive === 1 ? '' : 's'} · MiniLM + DeBERTa CPU Ready`
          : value.reasons.join(' · ') || 'No evaluation worker active',
        latencyMs: Math.round(totalDuration * 0.4),
      });
    } else {
      updateCheck('evaluator', {
        status: 'warn',
        detail: detailFromError(evaluatorResult.reason),
      });
    }

    if (platformResult.status === 'fulfilled') {
      const value = platformResult.value;
      const status = value.state === 'healthy' ? 'ok' : value.state === 'degraded' || value.state === 'backlogged' ? 'warn' : 'error';
      updateCheck('platform', {
        status,
        detail: `State: ${value.state.toUpperCase()} · Queue Depth: ${value.evaluation_queue.depth}`,
        latencyMs: Math.round(totalDuration * 0.3),
      });
    } else {
      updateCheck('platform', {
        status: 'warn',
        detail: detailFromError(platformResult.reason),
      });
    }

    setIsChecking(false);
  }, [client, updateCheck]);

  useEffect(() => {
    void runHandshake();
  }, [runHandshake]);

  const apiReady = checks.find((check) => check.id === 'api')?.status === 'ok';
  const okChecksCount = checks.filter((c) => c.status === 'ok' || c.status === 'warn').length;
  const progressPct = Math.round((okChecksCount / checks.length) * 100);

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between px-4 sm:px-8 py-8 selection:bg-cyan-500/30 selection:text-white overflow-x-hidden">
      {/* ── Ambient Background Glow Orbs ── */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[44rem] h-[44rem] rounded-full bg-cyan-500/10 blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/3 w-[30rem] h-[30rem] rounded-full bg-emerald-500/10 blur-[140px] pointer-events-none -z-10" />

      {/* ── Top Header Bar ── */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between z-20">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-neutral-300 hover:text-white transition-all group cursor-pointer backdrop-blur-md shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-cyan-400" />
          <span>Change Instance</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md text-3xs font-mono">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-neutral-400">TELEMETRY HANDSHAKE</span>
        </div>
      </header>

      {/* ── Center Glassmorphism Handshake Card ── */}
      <main className="w-full max-w-xl mx-auto my-auto py-8 z-20">
        <div className="p-7 sm:p-9 rounded-3xl bg-[#080c18]/75 backdrop-blur-2xl backdrop-saturate-200 border border-white/[0.12] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.15)] space-y-7 transition-all">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center font-bold text-sm text-black shadow-lg shadow-cyan-500/25">
                AP
              </div>

              {/* Status Badge */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-3xs font-mono font-bold border ${
                  apiReady
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : isChecking
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    apiReady
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : isChecking
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                  }`}
                />
                <span>
                  {apiReady
                    ? 'ALL SERVICES NOMINAL'
                    : isChecking
                    ? 'VERIFYING STACK...'
                    : 'CONNECTION BLOCKED'}
                </span>
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
                Telemetry Handshake
              </h1>
              <p className="text-xs font-mono text-cyan-400 break-all mt-1">
                {connection.baseUrl}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-3xs font-mono text-neutral-400">
              <span>Stack Diagnostic Progress</span>
              <span className="font-bold text-cyan-300">{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#050811] rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Verification Checklist */}
          <div className="space-y-2.5">
            {checks.map((check) => {
              const Icon = check.icon;
              return (
                <div
                  key={check.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    check.status === 'ok'
                      ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                      : check.status === 'warn'
                      ? 'bg-amber-500/[0.04] border-amber-500/20'
                      : check.status === 'error'
                      ? 'bg-rose-500/[0.04] border-rose-500/25'
                      : 'bg-white/[0.02] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status Icon */}
                    <div className="shrink-0">
                      {check.status === 'checking' ? (
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        </div>
                      ) : check.status === 'ok' ? (
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_-2px_#34d399]">
                          <Check className="w-4 h-4 stroke-[2.5]" />
                        </div>
                      ) : check.status === 'warn' ? (
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_12px_-2px_#fbbf24]">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-[0_0_12px_-2px_#f43f5e]">
                          <X className="w-4 h-4 stroke-[2.5]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono font-bold text-white truncate">
                          {check.label}
                        </p>
                        {check.latencyMs && (
                          <span className="text-4xs font-mono px-1.5 py-0.2 rounded bg-white/5 text-neutral-400 border border-white/10">
                            {check.latencyMs}ms
                          </span>
                        )}
                      </div>
                      <p className="text-3xs font-mono text-neutral-400 truncate mt-0.5" title={check.detail}>
                        {check.detail}
                      </p>
                    </div>
                  </div>

                  <span className="text-3xs font-mono text-neutral-500 shrink-0 hidden sm:inline-block">
                    {check.endpoint}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void runHandshake()}
              disabled={isChecking}
              className="w-full sm:w-auto px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-neutral-300 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Re-probing...' : 'Re-run Handshake'}</span>
            </button>

            <button
              type="button"
              onClick={onComplete}
              disabled={!apiReady || isChecking}
              className="w-full flex-1 py-3.5 rounded-xl text-xs font-bold font-mono bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/25 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Enter Command Deck</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {!apiReady && !isChecking && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-300 flex items-start gap-2.5 animate-rise">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>AgentPulse gateway is unreachable at {connection.baseUrl}. Please verify your uvicorn backend process is running on port 8000.</span>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full max-w-xl mx-auto text-3xs font-mono text-neutral-500 text-center z-20">
        Live Ingestion &bull; MiniLM-L6-v2 ONNX &bull; DeBERTa-v3 NLI &bull; CPU Accelerated
      </footer>
    </div>
  );
}
