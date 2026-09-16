import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ArrowRight, ShieldCheck, Terminal, Copy, Check } from 'lucide-react';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  onVerified,
}) => {
  const [step, setStep] = useState<'input' | 'verifying' | 'success'>('input');
  const [endpoint, setEndpoint] = useState('https://telemetry.agentpulse.internal/v1');
  const [apiKey, setApiKey] = useState('ap_live_948f10283c79a8e01');
  const [copied, setCopied] = useState(false);

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(`import agentpulse

pulse = agentpulse.init(
    api_key="${apiKey}",
    endpoint="${endpoint}"
)`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    setStep('verifying');
    setTimeout(() => {
      setStep('success');
    }, 1400);
  };

  const handleComplete = () => {
    onVerified();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with Frosted Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Apple Liquid Glass Modal Surface */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-lg liquid-glass-card rounded-2xl p-7 text-neutral-100 overflow-hidden shadow-2xl border-glow-subtle"
          >
            {/* Top Liquid Specular Reflection & Radiance */}
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
            <div className="absolute -top-24 -right-24 w-60 h-60 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-white/[0.08] backdrop-blur-md flex items-center justify-center border border-white/15">
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-white">Connect Agent Runtime</h3>
                  <p className="text-xs text-neutral-300">Initialize native AgentPulse Span stream (/v1/ingest)</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-200 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step content */}
            {step === 'input' && (
              <div className="space-y-4 relative z-10">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 uppercase tracking-wider mb-1.5">
                    AgentPulse Collector Endpoint
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full bg-black/40 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-amber-400/80 shadow-inner transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 uppercase tracking-wider mb-1.5">
                    Environment Ingestion Key
                  </label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-black/40 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-amber-400/80 shadow-inner transition-colors"
                  />
                </div>

                {/* Code instrumentation snippet */}
                <div className="mt-4 rounded-xl bg-black/35 backdrop-blur-xl border border-white/12 p-3.5 relative shadow-inner">
                  <div className="flex items-center justify-between text-xs text-neutral-300 mb-2">
                    <span className="flex items-center space-x-1.5 font-mono">
                      <Terminal className="w-3.5 h-3.5 text-amber-300" />
                      <span>python runtime bootstrap</span>
                    </span>
                    <button
                      onClick={handleCopySnippet}
                      className="flex items-center space-x-1 text-xs text-neutral-300 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded-lg border border-white/15 transition-all"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="font-mono text-xs text-neutral-200 overflow-x-auto leading-relaxed">
{`from agentpulse import AgentPulse
from openai import OpenAI

pulse = AgentPulse(endpoint="${endpoint}")

# Instrument client or monitor pipeline nodes
client = pulse.instrument_llm(OpenAI())`}
                  </pre>
                </div>

                <div className="pt-3 flex items-center justify-end space-x-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVerify}
                    className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 rounded-xl transition-all shadow-[0_4px_16px_rgba(245,158,11,0.3)] active:scale-95"
                  >
                    <span>Verify Handshake</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {step === 'verifying' && (
              <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                <div className="w-10 h-10 rounded-full border-2 border-neutral-700 border-t-neutral-100 animate-spin" />
                <div>
                  <h4 className="text-sm font-medium text-neutral-200">Listening for Agent Telemetry Packets</h4>
                  <p className="text-xs text-neutral-500 mt-1 font-mono">POST /v1/ingest &nbsp;·&nbsp; validating SpanInput signature</p>
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="py-6 flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-white">Agent Handshake Verified</h4>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                    Received initial heartbeat from <span className="text-neutral-200 font-mono">agent-arbitrage-alpha</span>. Zero schema dropouts detected.
                  </p>
                </div>
                <div className="w-full pt-4">
                  <button
                    onClick={handleComplete}
                    className="w-full py-2.5 bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
                  >
                    <span>Enter AgentPulse Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
