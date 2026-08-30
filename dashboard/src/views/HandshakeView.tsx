import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { LiquidGlass } from '../components/LiquidGlass';
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
  status: CheckStatus;
  detail: string;
}

const INITIAL_CHECKS: ServiceCheck[] = [
  { id: 'api', label: 'API readiness', endpoint: '/v1/health/ready', status: 'checking', detail: 'Checking database access…' },
  { id: 'evaluator', label: 'Evaluator', endpoint: '/v1/health/evaluator', status: 'checking', detail: 'Checking active worker fleet…' },
  { id: 'platform', label: 'Platform state', endpoint: '/v1/platform', status: 'checking', detail: 'Reading operational state…' },
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

    const [apiResult, evaluatorResult, platformResult] = await Promise.allSettled([
      client.getReadiness(),
      client.getEvaluatorReadiness(),
      client.getPlatformHealth(),
    ]);

    if (apiResult.status === 'fulfilled') {
      updateCheck('api', {
        status: apiResult.value.ready ? 'ok' : 'error',
        detail: apiResult.value.ready
          ? 'Ready · database reachable'
          : apiResult.value.reasons.join(' · ') || 'Database is not ready',
      });
    } else {
      updateCheck('api', { status: 'error', detail: detailFromError(apiResult.reason) });
    }

    if (evaluatorResult.status === 'fulfilled') {
      const value = evaluatorResult.value;
      updateCheck('evaluator', {
        status: value.ready ? (value.degraded ? 'warn' : 'ok') : 'warn',
        detail: value.ready
          ? `${value.workers_alive} active worker${value.workers_alive === 1 ? '' : 's'}${value.degraded ? ' · degraded backend' : ''}`
          : value.reasons.join(' · ') || 'No evaluation worker is available',
      });
    } else {
      updateCheck('evaluator', { status: 'warn', detail: detailFromError(evaluatorResult.reason) });
    }

    if (platformResult.status === 'fulfilled') {
      const value = platformResult.value;
      const status = value.state === 'healthy' ? 'ok' : value.state === 'degraded' || value.state === 'backlogged' ? 'warn' : 'error';
      updateCheck('platform', {
        status,
        detail: `${value.state} · queue ${value.evaluation_queue.depth}`,
      });
    } else {
      updateCheck('platform', { status: 'warn', detail: detailFromError(platformResult.reason) });
    }

    setIsChecking(false);
  }, [client, updateCheck]);

  useEffect(() => {
    void runHandshake();
  }, [runHandshake]);

  const apiReady = checks.find((check) => check.id === 'api')?.status === 'ok';

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-between px-6 py-12 animate-view-enter">
      <header className="w-full max-w-xl flex items-center justify-between">
        <span className="text-2xs text-ink-faint uppercase tracking-[0.14em]">Connection verification</span>
        <button type="button" onClick={onCancel} className="min-h-10 px-2 text-xs text-ink-dim hover:text-ink transition-colors">
          Change instance
        </button>
      </header>

      <main className="w-full max-w-md my-auto">
        <LiquidGlass elevation="elevated" interactive={false} className="p-8 rounded-2xl space-y-7">
          <div className="space-y-2">
            <p className="text-2xs text-ink-faint uppercase tracking-[0.14em]">Handshake</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Verify the instrument</h1>
            <p className="text-sm font-mono text-ink-dim break-all">{connection.baseUrl}</p>
          </div>

          <ul className="space-y-2" aria-live="polite">
            {checks.map((check) => (
              <li key={check.id} className="flex items-center gap-3 rounded-xl bg-void/60 border border-line px-3.5 py-3">
                <CheckIcon status={check.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink">{check.label}</p>
                  <p className="text-2xs text-ink-faint truncate" title={check.detail}>{check.detail}</p>
                </div>
                <span className="text-2xs font-mono text-ink-faint shrink-0">{check.endpoint}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-3">
            <button type="button" onClick={() => void runHandshake()} disabled={isChecking} className="secondary-action flex-1">
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              {isChecking ? 'Checking' : 'Check again'}
            </button>
            <button type="button" onClick={onComplete} disabled={!apiReady || isChecking} className="primary-action flex-1">
              Enter command
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {!apiReady && !isChecking && (
            <p role="alert" className="text-xs text-state-bad leading-relaxed">
              AgentPulse cannot be reached yet. Correct the instance URL or restore the API, then check again.
            </p>
          )}
        </LiquidGlass>
      </main>

      <footer className="text-2xs text-ink-faint text-center">Only live instance checks are shown here</footer>
    </div>
  );
}

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === 'checking') {
    return <span className="status-checking" aria-label="Checking" />;
  }
  if (status === 'ok') {
    return <span className="status-icon bg-state-ok/15 text-state-ok border-state-ok/30"><Check className="w-3.5 h-3.5" aria-hidden="true" /></span>;
  }
  if (status === 'warn') {
    return <span className="status-icon bg-state-warn/15 text-state-warn border-state-warn/30"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /></span>;
  }
  return <span className="status-icon bg-state-bad/15 text-state-bad border-state-bad/30"><X className="w-3.5 h-3.5" aria-hidden="true" /></span>;
}
