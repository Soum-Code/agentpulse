import React from 'react';
import { X, BookOpen, FileText, CheckCircle2 } from 'lucide-react';
import type { ColorPalette, ChalkSurfacePreset } from '../../types';
import { getRagTheme } from './ragTheme';

interface CorpusModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: string[];
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

export const CorpusModal: React.FC<CorpusModalProps> = ({
  isOpen,
  onClose,
  documents,
  palette = 'dark',
  isCalmMode = false,
  chalkSurface = 'classic-white',
}) => {
  if (!isOpen) return null;
  const theme = getRagTheme(palette, isCalmMode, chalkSurface);

  // In short: styled with the chat's .rag-* classes (16 px card, status green, the one tinted
  // Done button), so the dialog follows the palette like the chat around it.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-2xl ${theme.cardBg} border ${theme.cardBorder} rounded-2xl shadow-2xl p-6 font-mono text-xs ${theme.textColor}`}
        role="dialog"
        aria-modal="true"
      >
        <div className={`flex items-center justify-between pb-4 border-b ${theme.divider}`}>
          <div className="flex items-center gap-2">
            <BookOpen className={`w-4 h-4 ${theme.accentText}`} />
            <span className={`text-sm font-semibold tracking-tight ${theme.textColor}`}>
              RAG Reference Corpus
            </span>
            <span className={`px-2 py-0.5 rounded text-[11px] ${theme.codeBg} ${theme.accentText} border ${theme.codeBorder}`}>
              {documents.length} documents
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-1 ${theme.subtextColor} hover:${theme.textColor} rounded hover:bg-white/5 transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className={`mt-3 ${theme.subtextColor} leading-relaxed text-[11px]`}>
          The retriever queries this embedded document collection. Verifier evaluates candidate claims against these texts before the answerer synthesizes its response.
        </p>

        <div className="mt-4 space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {documents.map((doc, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-lg ${theme.codeBg} border ${theme.codeBorder} transition-colors`}
            >
              <FileText className={`w-4 h-4 ${theme.accentText} shrink-0 mt-0.5`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className={`font-medium ${theme.textColor} text-xs truncate`}>{doc}</div>
                  <span className={`text-[11px] ${theme.subtextColor} shrink-0 font-mono`}>DOC-{String(idx + 1).padStart(2, '0')}</span>
                </div>
                <div className={`text-[11px] ${theme.subtextColor} mt-1 flex items-center gap-1`}>
                  <CheckCircle2 className="w-3 h-3 rag-ok-text" />
                  <span>Indexed in vector store • Full-text available</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-6 pt-4 border-t ${theme.divider} flex items-center justify-between`}>
          <span className={`text-[11px] ${theme.subtextColor}`}>
            Endpoint: <code className={theme.textColor}>GET /corpus</code> on RAG service (:8100)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rag-primary font-semibold text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
