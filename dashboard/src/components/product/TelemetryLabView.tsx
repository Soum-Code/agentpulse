import React, { useState } from 'react';
import { Cpu, Play, Sparkles, AlertTriangle, ShieldCheck, RefreshCw, CheckCircle2, Zap } from 'lucide-react';
import { Agent } from '../../types';

// The scenarios the backend simulator actually implements
// (backend/app/routers/ingest.py: SimulateRequest).
const SCENARIOS = [
  { id: 'clean', label: 'Clean execution (grounded, consistent)' },
  { id: 'hallucination', label: 'Injected contradiction (fires grounding NLI)' },
  { id: 'drift', label: 'Vocabulary shift (same payload as contradiction)' },
  { id: 'tool_mismatch', label: 'Tool claim mismatch (not yet implemented server-side)' },
];

interface TelemetryLabViewProps {
  agents: Agent[];
  onInjectSyntheticTrace: (scenario: string, query?: string) => void | Promise<void>;
}

export const TelemetryLabView: React.FC<TelemetryLabViewProps> = ({
  agents,
  onInjectSyntheticTrace
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [syntheticPrompt, setSyntheticPrompt] = useState('Advances in multimodal foundation models');
  const [failureMode, setFailureMode] = useState<string>('clean');
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleSimulate = async () => {
    setIsSimulating(true);
    setLastResult(null);
    try {
      await onInjectSyntheticTrace(failureMode, syntheticPrompt);
      setLastResult(
        `Scenario "${failureMode}" submitted. Spans appear once an evaluation worker scores them.`
      );
    } catch (err) {
      setLastResult(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div>
        <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
          <Cpu className="w-5 h-5 text-neutral-400" />
          <span>Telemetry Lab & Failure Mode Simulator</span>
        </h2>
        <p className="text-xs font-mono text-neutral-400 mt-1">
          Simulate edge cases, stress-test online evaluators, and observe real-time incident detection
        </p>
      </div>

      {/* Main Simulation Panel */}
      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-6 font-mono text-xs max-w-4xl relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase text-neutral-400 mb-1.5 font-semibold">
              Target Pipeline
            </label>
            <div className="w-full bg-white/[0.03] border border-white/[0.10] rounded-xl p-2.5 text-neutral-400">
              research_pipeline_v1 (fixed 5-agent simulator)
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-neutral-400 mb-1.5 font-semibold">
              Injectable Failure Scenario
            </label>
            <select
              value={failureMode}
              onChange={(e) => setFailureMode(e.target.value as any)}
              className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl p-2.5 text-neutral-200 focus:outline-none focus:border-white/30"
            >
              {SCENARIOS.map(sc => (
                <option key={sc.id} value={sc.id} className="bg-[#0b0d13] text-white">
                  {sc.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1.5 font-semibold">
            Agent Input Query / Context
          </label>
          <textarea
            rows={3}
            value={syntheticPrompt}
            onChange={(e) => setSyntheticPrompt(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.10] rounded-xl p-3 text-neutral-200 focus:outline-none focus:border-white/30 leading-relaxed font-mono text-xs"
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
          <div className="text-[11px] text-neutral-400">
            {lastResult && (
              <span className="text-neutral-300 flex items-center space-x-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{lastResult}</span>
              </span>
            )}
          </div>

          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className="px-6 py-2.5 bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-semibold rounded-xl flex items-center space-x-2 transition-all shadow-md disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-neutral-950" />
            <span>{isSimulating ? 'Injecting Telemetry...' : 'Simulate & Ingest Trace'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
