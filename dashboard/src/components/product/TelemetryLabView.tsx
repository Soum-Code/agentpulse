import React, { useState } from 'react';
import { Cpu, Play, Sparkles, AlertTriangle, ShieldCheck, RefreshCw, CheckCircle2, Zap } from 'lucide-react';
import { Agent, Trace } from '../../types';

interface TelemetryLabViewProps {
  agents: Agent[];
  onInjectSyntheticTrace: (trace: Trace) => void;
}

export const TelemetryLabView: React.FC<TelemetryLabViewProps> = ({
  agents,
  onInjectSyntheticTrace
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0].id);
  const [syntheticPrompt, setSyntheticPrompt] = useState('Verify insurance claim #CLM-9912 for diagnostic MRI reimbursement');
  const [failureMode, setFailureMode] = useState<'none' | 'schema_drift' | 'low_confidence_ocr' | 'tool_timeout'>('none');
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastInjectedId, setLastInjectedId] = useState<string | null>(null);

  const handleSimulate = () => {
    setIsSimulating(true);

    setTimeout(() => {
      const newTraceId = `tr-${Math.floor(10000 + Math.random() * 90000)}`;
      const targetAgent = agents.find(a => a.id === selectedAgentId) || agents[0];

      let status: 'ok' | 'warning' | 'error' = 'ok';
      let errorSummary: string | undefined = undefined;
      let driftDetected = false;
      let groundingScore = 0.96;

      if (failureMode === 'schema_drift') {
        status = 'error';
        errorSummary = 'Warehouse schema mismatch: model referenced non-existent column in generated analytical query.';
        driftDetected = true;
        groundingScore = 0.38;
      } else if (failureMode === 'low_confidence_ocr') {
        status = 'warning';
        errorSummary = 'Provider license NPI confidence fell below 65% threshold during receipt extraction.';
        driftDetected = true;
        groundingScore = 0.74;
      } else if (failureMode === 'tool_timeout') {
        status = 'error';
        errorSummary = 'Remote exchange order-book gateway connection timed out after 3,000ms.';
        driftDetected = false;
        groundingScore = 0.88;
      }

      const newTrace: Trace = {
        id: newTraceId,
        agentId: targetAgent.id,
        agentName: targetAgent.name,
        sessionId: `sess-${Math.floor(10000 + Math.random() * 90000)}`,
        rootSpanId: `sp-lab-01`,
        status,
        durationMs: Math.floor(400 + Math.random() * 2000),
        totalTokens: Math.floor(1200 + Math.random() * 4000),
        cost: Number((Math.random() * 0.015).toFixed(4)),
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        inputPreview: syntheticPrompt,
        outputPreview: status === 'error' ? `Pipeline halted: ${errorSummary}` : 'Execution completed successfully with verified grounding.',
        errorSummary,
        driftDetected,
        groundingScore,
        tags: ['synthetic-lab', failureMode, targetAgent.framework.toLowerCase()],
        spans: [
          {
            id: `sp-lab-01`,
            traceId: newTraceId,
            name: `${targetAgent.framework.toLowerCase()}.pipeline_runner`,
            type: 'agent',
            status,
            startOffsetMs: 0,
            durationMs: 1420,
            agentLane: 'Lab Orchestrator',
            prompt: syntheticPrompt,
            completion: status === 'error' ? `Exception raised during execution: ${errorSummary}` : 'Verified output synthesized.',
            error: errorSummary,
            evidence: {
              observed: `Synthetic run injected with failure scenario: ${failureMode}.`,
              measured: `Grounding score calculated at ${groundingScore}.`,
              explained: errorSummary || 'Execution matched all active system evaluators.'
            },
            evaluatorResults: [
              {
                id: 'eval-lab-grounding',
                name: 'Schema Groundedness',
                score: groundingScore,
                threshold: 0.85,
                passed: groundingScore >= 0.85,
                maturity: 'BETA',
                reason: status === 'ok' ? 'All identifiers resolved accurately' : 'Identified unreflected schema tokens in generation'
              }
            ]
          }
        ]
      };

      onInjectSyntheticTrace(newTrace);
      setLastInjectedId(newTraceId);
      setIsSimulating(false);
    }, 1200);
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
              Target Agent Swarm
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl p-2.5 text-neutral-200 focus:outline-none focus:border-white/30"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id} className="bg-[#0b0d13] text-white">
                  {a.name} ({a.framework})
                </option>
              ))}
            </select>
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
              <option value="none" className="bg-[#0b0d13] text-white">Normal Execution (Pass All Evaluators)</option>
              <option value="schema_drift" className="bg-[#0b0d13] text-white">Schema Drift &amp; Column Hallucination (Critical)</option>
              <option value="low_confidence_ocr" className="bg-[#0b0d13] text-white">OCR Low Confidence Provider Bypass (Warning)</option>
              <option value="tool_timeout" className="bg-[#0b0d13] text-white">Tool Gateway Connection Timeout (Error)</option>
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
            {lastInjectedId && (
              <span className="text-emerald-400/90 flex items-center space-x-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Injected Trace {lastInjectedId} into live stream</span>
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
