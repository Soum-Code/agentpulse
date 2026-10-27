import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { ChalkSurfacePreset, ColorPalette, ProductTab } from '../../types';
import { RagChatbotApp } from './RagChatbotApp';

interface RagMonitorViewProps {
  /** Opens the dedicated full-screen split view (App's 'rag' mode). */
  onToggleFullscreen: () => void;
  /** Leaves the RAG tab for another console tab. */
  onSelectTab: (tab: ProductTab) => void;
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

/**
 * The RAG tab of the console in the owner's layout: the "Aetheris Iris" glass frame with its brand
 * header, around the live chat (left) and the instrument panel (right).
 *
 * The chat and the panel are RagChatbotApp, unchanged: it talks to the chat service over
 * /chat/stream, shows each pipeline stage and the provider that answered, says plainly when the
 * providers are busy, the service is paused or the day's cap is reached, and offers a retry. The
 * owner's own chat was a mock of that (it called POST /chat and showed no limits), so only its
 * frame is used here, never its chat logic.
 */
export const RagMonitorView: React.FC<RagMonitorViewProps> = ({
  onToggleFullscreen,
  onSelectTab,
  palette,
  isCalmMode,
  chalkSurface,
}) => (
  <div className="space-y-5 pb-20 aetheris-iris-glass aetheris-spatial-glow rounded-3xl p-3 sm:p-6 border border-purple-500/30 shadow-2xl relative">
    {/* Specular rim along the top edge of the frame */}
    <div className="absolute inset-x-0 top-0 h-[2px] aetheris-iris-specular pointer-events-none rounded-t-3xl" />

    {/* Brand header */}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/[0.10]">
      <div className="flex items-center space-x-3.5">
        {/* Iris logo: a gradient ring around a slowly turning aperture */}
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-cyan-400 p-[1.5px] aetheris-halo-glow shrink-0 shadow-lg">
          <div className="w-full h-full bg-[#080914] rounded-2xl flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-cyan-400/20 pointer-events-none" />
            <div className="w-6 h-6 rounded-full border-2 border-purple-300 border-t-transparent animate-[spin_6s_linear_infinite] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight flex items-center space-x-2">
            <span>Aetheris Iris</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30 uppercase tracking-widest font-semibold">
              Liquid Prism
            </span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-0.5">
            Live multi-agent chat, grounding evaluation and drift, observed by AgentPulse
          </p>
        </div>
      </div>

      <button
        onClick={onToggleFullscreen}
        className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-mono text-neutral-200 flex items-center space-x-1.5 transition-colors self-start md:self-center"
        title="Open the full-screen split view"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span>Full-Screen View</span>
      </button>
    </div>

    {/* Chat + instrument panel (all behaviour of the public chat lives in RagChatbotApp) */}
    <div className="rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-[#06070a] h-[740px] max-h-[82vh]">
      <RagChatbotApp
        embedded={true}
        onOpenConsole={() => onSelectTab('overview')}
        onSelectTab={onSelectTab}
        onToggleFullscreen={onToggleFullscreen}
        palette={palette}
        isCalmMode={isCalmMode}
        chalkSurface={chalkSurface}
      />
    </div>
  </div>
);
