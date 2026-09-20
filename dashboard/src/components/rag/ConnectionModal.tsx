import React, { useState } from 'react';
import { X, Server, Key, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ColorPalette, ChalkSurfacePreset } from '../../types';
import { getRagTheme } from './ragTheme';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ragUrl: string;
  onSaveRagUrl: (url: string) => void;
  agentPulseUrl: string;
  onSaveAgentPulseUrl: (url: string) => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  ragStatus: { ok: boolean; status: string };
  evaluatorStatus: { ready: boolean; workers_alive: number };
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  ragUrl,
  onSaveRagUrl,
  agentPulseUrl,
  onSaveAgentPulseUrl,
  apiKey,
  onSaveApiKey,
  ragStatus,
  evaluatorStatus,
  palette = 'dark',
  isCalmMode = false,
  chalkSurface = 'classic-white',
}) => {
  const [localRagUrl, setLocalRagUrl] = useState(ragUrl);
  const [localAgentPulseUrl, setLocalAgentPulseUrl] = useState(agentPulseUrl);
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;
  const theme = getRagTheme(palette, isCalmMode, chalkSurface);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveRagUrl(localRagUrl.trim());
    onSaveAgentPulseUrl(localAgentPulseUrl.trim());
    onSaveApiKey(localApiKey.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 font-mono text-xs">
      <div className={`relative w-full max-w-lg ${theme.cardBg} border ${theme.cardBorder} rounded-xl shadow-2xl p-6 ${theme.textColor}`}>
        <div className={`flex items-center justify-between pb-4 border-b ${theme.divider}`}>
          <div className="flex items-center gap-2">
            <Server className={`w-4 h-4 ${theme.accentText}`} />
            <span className={`text-sm font-semibold tracking-wide ${theme.textColor} uppercase`}>
              Pipeline Service Endpoints
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-1 ${theme.subtextColor} hover:${theme.textColor} rounded hover:bg-white/5 transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Service Status */}
        <div className={`mt-4 p-3 rounded-lg ${theme.codeBg} border ${theme.codeBorder} space-y-2`}>
          <div className="flex items-center justify-between text-[11px]">
            <span className={theme.subtextColor}>RAG Pipeline Service (:8100):</span>
            <span className="flex items-center gap-1.5 font-medium">
              {ragStatus.ok ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">ONLINE</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">{ragStatus.status.toUpperCase()}</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={theme.subtextColor}>AgentPulse Evaluator Worker:</span>
            <span className="flex items-center gap-1.5 font-medium">
              {evaluatorStatus.workers_alive > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">
                    ALIVE ({evaluatorStatus.workers_alive} {evaluatorStatus.workers_alive === 1 ? 'worker' : 'workers'})
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-rose-400">NO WORKERS ALIVE</span>
                </>
              )}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className={`block text-[11px] font-medium ${theme.textColor} mb-1`}>
              RAG FastAPI Base URL
            </label>
            <input
              type="text"
              value={localRagUrl}
              onChange={(e) => setLocalRagUrl(e.target.value)}
              placeholder="http://localhost:8100"
              className={`w-full px-3 py-2 ${theme.inputBg} border ${theme.inputBorder} rounded-lg ${theme.textColor} placeholder-neutral-500 focus:outline-none focus:border-cyan-500 text-xs`}
            />
            <span className={`text-[10px] ${theme.subtextColor} mt-1 block`}>
              Handles <code className={theme.textColor}>POST /chat</code> and <code className={theme.textColor}>GET /corpus</code>.
            </span>
          </div>

          <div>
            <label className={`block text-[11px] font-medium ${theme.textColor} mb-1`}>
              AgentPulse Observability API URL
            </label>
            <input
              type="text"
              value={localAgentPulseUrl}
              onChange={(e) => setLocalAgentPulseUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className={`w-full px-3 py-2 ${theme.inputBg} border ${theme.inputBorder} rounded-lg ${theme.textColor} placeholder-neutral-500 focus:outline-none focus:border-cyan-500 text-xs`}
            />
            <span className={`text-[10px] ${theme.subtextColor} mt-1 block`}>
              AgentPulse ingestion and evaluation API (:8000 or current origin).
            </span>
          </div>

          <div>
            <label className={`block text-[11px] font-medium ${theme.textColor} mb-1`}>
              AgentPulse API Key (X-API-Key)
            </label>
            <div className="relative">
              <input
                type="password"
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                placeholder="ap_live_..."
                className={`w-full pl-8 pr-3 py-2 ${theme.inputBg} border ${theme.inputBorder} rounded-lg ${theme.textColor} placeholder-neutral-500 focus:outline-none focus:border-cyan-500 text-xs`}
              />
              <Key className={`w-3.5 h-3.5 ${theme.subtextColor} absolute left-2.5 top-2.5`} />
            </div>
            <span className={`text-[10px] ${theme.subtextColor} mt-1 block`}>
              Optional for local testing if unauthenticated.
            </span>
          </div>

          <div className={`pt-4 border-t ${theme.divider} flex items-center justify-between`}>
            <span className={`text-[10px] ${theme.subtextColor}`}>
              Settings persist in browser session.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-3 py-1.5 rounded border ${theme.cardBorder} ${theme.textColor} hover:bg-white/5 transition-colors text-xs`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-cyan-500 text-black font-semibold text-xs hover:bg-cyan-400 transition-colors flex items-center gap-1"
              >
                {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                {saved ? 'Saved' : 'Save Endpoints'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
