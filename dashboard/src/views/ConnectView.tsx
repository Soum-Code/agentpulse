import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Globe, KeyRound, ShieldCheck } from 'lucide-react';
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
  { id: 'local', name: 'Localhost Node', url: 'http://localhost:8000', label: 'Default Instance' },
  { id: 'docker', name: 'Docker Bridge', url: 'http://127.0.0.1:8000', label: 'Local Fleet' },
  { id: 'custom', name: 'Custom Instance', url: '', label: 'Remote Cluster' },
];

export function ConnectView({ initialConnection, onConnect, onBack }: ConnectViewProps) {
  const [instanceUrl, setInstanceUrl] = useState(initialConnection.baseUrl || 'http://localhost:8000');
  const [apiKey, setApiKey] = useState(initialConnection.apiKey || '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      onConnect({ baseUrl: normaliseUrl(instanceUrl), apiKey: apiKey.trim() || undefined });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enter a valid instance URL.');
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-between px-6 py-10 selection:bg-white/20 selection:text-white">
      {/* Top Header Bar */}
      <header className="w-full max-w-xl flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Return</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="stream-dot stream-live" />
          <span className="text-2xs font-mono text-neutral-400 uppercase tracking-wider">Gateway Client</span>
        </div>
      </header>

      {/* Center Functional Liquid Glass Connection Surface */}
      <main className="w-full max-w-md my-auto py-6">
        <div className="glass-functional p-8 rounded-3xl space-y-6 shadow-2xl border border-white/10">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center font-bold text-sm text-white">
              AP
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Connect to AgentPulse
            </h1>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Connect to a local or remote AgentPulse instance to stream live telemetry, monitor drift, and inspect agent traces.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <label className="text-3xs font-mono uppercase tracking-wider text-neutral-400">
              Instance Presets
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {PRESET_INSTANCES.slice(0, 2).map((preset) => {
                const isSelected = instanceUrl === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setInstanceUrl(preset.url);
                      setError(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white/15 border-white/30 text-white font-bold'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <p className="text-xs">{preset.name}</p>
                    <p className="text-3xs text-neutral-400 truncate mt-0.5">{preset.url}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connect Form */}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="instance-url" className="text-3xs font-mono uppercase tracking-wider text-neutral-400">
                Instance URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  id="instance-url"
                  type="text"
                  value={instanceUrl}
                  onChange={(e) => {
                    setInstanceUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="http://localhost:8000"
                  className="w-full bg-[#08090d] border border-white/10 focus:border-white/30 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-600 font-mono transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="api-key" className="text-3xs font-mono uppercase tracking-wider text-neutral-400">
                  API Key <span className="text-neutral-500">(Optional)</span>
                </label>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave empty for local development"
                  className="w-full bg-[#08090d] border border-white/10 focus:border-white/30 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-600 font-mono transition-colors"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2"
            >
              <span>Initialize Connection</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      {/* Footer Security Note */}
      <footer className="text-3xs font-mono text-neutral-500 text-center">
        Zero credentials stored permanently &bull; Ephemeral memory session
      </footer>
    </div>
  );
}
