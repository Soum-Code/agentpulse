import React, { useState, useEffect } from 'react';
import { Radio, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Cpu, Database, Server } from 'lucide-react';
import { createApiClient, AgentPulseConnection } from '../../lib/api';

interface LiveBackendBridgeProps {
  onEnterConsole: () => void;
}

export function LiveBackendBridge({ onEnterConsole }: LiveBackendBridgeProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [evaluatorReady, setEvaluatorReady] = useState(false);
  const [workerCount, setWorkerCount] = useState(0);

  const checkHealth = async () => {
    try {
      setLoading(true);
      const start = performance.now();
      const client = createApiClient({ baseUrl: 'http://localhost:8000' });
      const [health, evalHealth] = await Promise.allSettled([
        client.getReadiness(),
        client.getEvaluatorReadiness(),
      ]);

      const duration = Math.round(performance.now() - start);
      setPingMs(duration);

      if (health.status === 'fulfilled' && health.value.ready) {
        setStatus('online');
      } else {
        setStatus('offline');
      }

      if (evalHealth.status === 'fulfilled') {
        setEvaluatorReady(evalHealth.value.ready);
        setWorkerCount(evalHealth.value.workers_alive);
      }
    } catch {
      setStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full rounded-2xl bg-gradient-to-r from-[#0e111a] via-[#11131a] to-[#0e111a] border border-white/10 p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
      <div className="flex items-start sm:items-center gap-4">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
            status === 'online'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              : status === 'checking'
              ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
          }`}
        >
          <Server className="w-5 h-5" />
        </div>

        <div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="font-bold text-white uppercase tracking-wider">Local Backend Diagnostic</span>
            <span
              className={`text-3xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                status === 'online'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : status === 'checking'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span>{status === 'online' ? 'Connected (http://localhost:8000)' : status === 'checking' ? 'Testing Ping...' : 'Standby / Offline'}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-3xs font-mono text-neutral-400 mt-1.5">
            <span>Ping: <strong className="text-white">{pingMs ? `${pingMs}ms` : '—'}</strong></span>
            <span>&bull;</span>
            <span>Workers: <strong className="text-emerald-400">{workerCount} Active</strong></span>
            <span>&bull;</span>
            <span>Evaluator Engine: <strong className={evaluatorReady ? 'text-emerald-400' : 'text-amber-400'}>{evaluatorReady ? 'Ready' : 'Standby'}</strong></span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={checkHealth}
          disabled={loading}
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer"
          title="Refresh server status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onEnterConsole}
          className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all flex items-center gap-2 cursor-pointer shadow-lg font-mono font-bold"
        >
          <span>Launch Command Console</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
