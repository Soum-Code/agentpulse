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
    <div className="w-full rounded-3xl bg-surface-2 border-2 border-black p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-comic-lg font-sans">
      <div className="flex items-start sm:items-center gap-4">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 border-black shadow-[2px_2px_0px_#000] ${
            status === 'online'
              ? 'bg-emerald-400 text-black'
              : status === 'checking'
              ? 'bg-yellow-400 text-black'
              : 'bg-pink-500 text-white'
          }`}
        >
          <Server className="w-6 h-6" />
        </div>

        <div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="font-black text-white uppercase tracking-wider">Local Backend Diagnostic</span>
            <span
              className={`comic-tag ${
                status === 'online'
                  ? 'bg-emerald-400 text-black'
                  : status === 'checking'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-pink-500 text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full border border-black ${status === 'online' ? 'bg-black' : 'bg-white'}`} />
              <span>{status === 'online' ? 'Connected (http://localhost:8000)' : status === 'checking' ? 'Testing Ping...' : 'Standby / Offline'}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-3xs font-mono text-neutral-300 mt-2 font-bold">
            <span>Ping: <strong className="text-yellow-400">{pingMs ? `${pingMs}ms` : '—'}</strong></span>
            <span>&bull;</span>
            <span>Workers: <strong className="text-emerald-400">{workerCount} Active</strong></span>
            <span>&bull;</span>
            <span>Evaluator Engine: <strong className={evaluatorReady ? 'text-emerald-400' : 'text-yellow-400'}>{evaluatorReady ? 'Ready' : 'Standby'}</strong></span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={checkHealth}
          disabled={loading}
          className="p-3 rounded-2xl bg-surface border-2 border-black text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          title="Refresh server status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onEnterConsole}
          className="comic-btn-yellow px-5 py-3 text-xs font-mono flex items-center gap-2 cursor-pointer"
        >
          <span>Launch Console</span>
          <ArrowRight className="w-3.5 h-3.5 text-black" />
        </button>
      </div>
    </div>
  );
}

