import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  CornerDownLeft,
  Sparkles,
  Search,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { ChatTurn, RagAgentExecution } from '../../lib/ragTypes';
import type { ColorPalette, ChalkSurfacePreset } from '../../types';
import { getRagTheme } from './ragTheme';

interface ChatConsoleProps {
  turns: ChatTurn[];
  onSendMessage: (message: string) => Promise<void>;
  onCancelInFlight: () => void;
  isInFlight: boolean;
  activeStage?: 'retriever' | 'verifier' | 'answerer';
  inFlightElapsedSeconds: number;
  selectedTraceId?: string;
  onSelectTrace: (traceId: string) => void;
  sessionId: string;
  onResetSession: () => void;
  isSimulatorMode: boolean;
  onToggleSimulator: () => void;
  onSimulateFailure: () => void;
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

const SAMPLE_PROMPTS = [
  'how does SQLite WAL improve concurrency?',
  'how do checkpoints affect reader threads in WAL mode?',
  'what happens during a crash before a commit record is flushed?',
  'why does page splitting cause write amplification in B-Trees?',
];

function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  turns,
  onSendMessage,
  onCancelInFlight,
  isInFlight,
  activeStage,
  inFlightElapsedSeconds,
  selectedTraceId,
  onSelectTrace,
  sessionId,
  onResetSession,
  isSimulatorMode,
  onToggleSimulator,
  onSimulateFailure,
  palette = 'dark',
  isCalmMode = false,
  chalkSurface = 'classic-white',
}) => {
  const theme = getRagTheme(palette, isCalmMode, chalkSurface);
  const [inputText, setInputText] = useState('');
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [activeRawTab, setActiveRawTab] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [turns.length, isInFlight, inFlightElapsedSeconds]);

  const toggleExpand = (turnId: string) => {
    setExpandedTurns((prev) => ({
      ...prev,
      [turnId]: !prev[turnId],
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isInFlight) return;
    setInputText('');
    await onSendMessage(trimmed);
  };

  const handleSelectSample = (sample: string) => {
    if (isInFlight) return;
    setInputText(sample);
    textareaRef.current?.focus();
  };

  return (
    <div className={`flex flex-col h-full ${theme.containerBg} ${theme.textColor} border-r ${theme.panelBorder} font-mono text-xs transition-colors duration-200`}>
      {/* Header bar */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.headerBorder} ${theme.headerBg} transition-colors`}>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.textColor}`}>
            Chat Stream
          </span>
          <span className={`text-[10px] ${theme.subtextColor}`}>
            session: <span className={`${theme.accentText} font-mono`}>{sessionId.substring(0, 10)}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onResetSession}
            disabled={isInFlight}
            className={`px-2 py-1 rounded ${theme.cardBg} border ${theme.cardBorder} ${theme.subtextColor} hover:${theme.textColor} text-[10px] transition-colors disabled:opacity-40`}
            title="Start new conversation session"
          >
            New Session
          </button>
          <button
            onClick={onToggleSimulator}
            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
              isSimulatorMode
                ? `${theme.accentBg} ${theme.accentBorder} ${theme.accentText}`
                : `${theme.cardBg} ${theme.cardBorder} ${theme.subtextColor} hover:${theme.textColor}`
            }`}
            title="Toggle between real :8100 backend and built-in simulator"
          >
            {isSimulatorMode ? '● SIMULATOR ACTIVE' : '○ LIVE BACKEND (:8100)'}
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 && !isInFlight && (
          <div className="h-full flex flex-col justify-center items-center text-center p-6 max-w-md mx-auto">
            <div className={`w-12 h-12 rounded-xl ${theme.accentBg} border ${theme.accentBorder} flex items-center justify-center ${theme.accentText} mb-4`}>
              <Activity className="w-6 h-6" />
            </div>
            <h3 className={`text-sm font-semibold ${theme.textColor} tracking-wide`}>
              Live Multi-Agent RAG Observer
            </h3>
            <p className={`${theme.subtextColor} text-[11px] mt-2 leading-relaxed`}>
              Every message executes a three-stage pipeline (retriever → verifier → answerer).
              AgentPulse captures each span asynchronously to verify grounding and accumulate drift.
            </p>

            <div className="w-full mt-6 text-left">
              <div className={`text-[10px] uppercase font-semibold ${theme.subtextColor} tracking-wider mb-2`}>
                Sample Questions (SQLite WAL Corpus):
              </div>
              <div className="space-y-1.5">
                {SAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSample(prompt)}
                    className={`w-full text-left px-3 py-2 rounded ${theme.cardBg} border ${theme.cardBorder} hover:${theme.cardActiveBorder} text-[11px] ${theme.textColor} transition-colors flex items-center justify-between group`}
                  >
                    <span className="truncate">{prompt}</span>
                    <ArrowRight className={`w-3 h-3 ${theme.subtextColor} group-hover:${theme.accentText} shrink-0 ml-2`} />
                  </button>
                ))}
              </div>
            </div>

            <div className={`mt-6 pt-4 border-t ${theme.divider} w-full flex items-center justify-center gap-2`}>
              <button
                onClick={onSimulateFailure}
                className="px-3 py-1.5 rounded bg-rose-950/40 border border-rose-500/30 text-rose-300 hover:bg-rose-900/40 text-[10px] transition-colors flex items-center gap-1.5"
                title="Trigger a turn where the verifier aborts mid-flight to test partial-turn observability"
              >
                <AlertTriangle className="w-3 h-3" />
                Test Partial Turn (Verifier Crash)
              </button>
            </div>
          </div>
        )}

        {/* Render turns */}
        {turns.map((turn, index) => {
          const isExpanded = !!expandedTurns[turn.id];
          const resp = turn.response;
          const agents = resp?.agents ?? [];
          const isPartialOrError = turn.status === 'error' || Boolean(turn.errorMessage || resp?.error);
          const isSelectedTrace = selectedTraceId && (turn.traceId === selectedTraceId || resp?.trace_id === selectedTraceId);
          const activeTabKey = activeRawTab[turn.id] || (agents[0]?.agent ?? 'retriever');

          return (
            <div key={turn.id} className="space-y-3">
              {/* User message */}
              <div className="flex justify-end">
                <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${theme.userBubbleBg} border ${theme.userBubbleBorder} ${theme.userBubbleText} text-[12px] leading-relaxed shadow-sm`}>
                  <div className="text-[10px] opacity-75 font-mono mb-1 flex items-center justify-between gap-4">
                    <span className="font-semibold">User Query</span>
                    <span>{new Date(turn.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="font-sans whitespace-pre-wrap">{turn.userMessage}</div>
                </div>
              </div>

              {/* Assistant message */}
              <div className="flex justify-start">
                <div
                  className={`w-full max-w-[95%] rounded-xl p-4 transition-all ${
                    isSelectedTrace
                      ? `${theme.cardActiveBorder} ${theme.cardBg} ${theme.glowClass}`
                      : `${theme.cardBg} border ${theme.cardBorder}`
                  }`}
                >
                  {/* Assistant header & Trace ID */}
                  <div className={`flex items-center justify-between pb-2.5 border-b ${theme.divider} mb-3`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${palette === 'butter' ? 'bg-amber-400 phosphor-amber' : palette === 'chalk' ? 'bg-cyan-600' : isCalmMode ? 'bg-zinc-400' : 'bg-cyan-400 phosphor-cyan'}`} />
                      <span className={`font-semibold ${theme.textColor} text-[11px] uppercase tracking-wider`}>
                        RAG Assistant
                      </span>
                      <span className={`text-[10px] ${theme.subtextColor} font-mono`}>
                        Turn #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {turn.traceId && (
                        <button
                          onClick={() => onSelectTrace(turn.traceId!)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors flex items-center gap-1 ${
                            isSelectedTrace
                              ? `${theme.accentBg} ${theme.accentBorder} ${theme.accentText} font-semibold`
                              : `${theme.codeBg} ${theme.cardBorder} ${theme.subtextColor} hover:${theme.accentText}`
                          }`}
                          title="Inspect trace and grounding scores in right panel"
                        >
                          <span>trace: {turn.traceId.substring(0, 10)}</span>
                          {isSelectedTrace && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Partial turn error state */}
                  {isPartialOrError && (
                    <div className="mb-3 p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-rose-300 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        <span>PIPELINE FAILURE • PARTIAL TURN RENDERED</span>
                      </div>
                      <div className="font-mono text-[10px] text-rose-300/90 whitespace-pre-wrap break-all">
                        {turn.errorMessage || resp?.error || 'Pipeline halted before completion'}
                      </div>
                      <div className="text-[10px] text-rose-400/80 mt-1.5">
                        Completed {agents.length} of 3 agent stages before failure. This turn's spans remain visible in AgentPulse telemetry.
                      </div>
                    </div>
                  )}

                  {/* Reply text (if answerer produced one) */}
                  {resp?.reply ? (
                    <div className={`font-sans text-[13px] ${theme.assistantBubbleText} leading-relaxed whitespace-pre-wrap mb-4`}>
                      {resp.reply}
                    </div>
                  ) : !isPartialOrError ? (
                    <div className={`${theme.subtextColor} italic text-[11px] mb-3`}>No reply produced.</div>
                  ) : null}

                  {/* Verifier Verdict if present */}
                  {resp?.verifier_verdict && (
                    <div className={`mb-3.5 px-3 py-2 rounded ${theme.codeBg} border ${theme.codeBorder} text-[11px]`}>
                      <span className={`text-[10px] font-semibold ${theme.accentText} uppercase tracking-wider block mb-0.5`}>
                        Verifier Verdict:
                      </span>
                      <span className={`${theme.textColor} font-sans`}>{resp.verifier_verdict}</span>
                    </div>
                  )}

                  {/* The three agents produced it: Name, Model, Latency */}
                  <div className={`mt-3 pt-3 border-t ${theme.divider}`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-wider ${theme.subtextColor} mb-2 flex items-center justify-between`}>
                      <span>Multi-Agent Execution Chain ({agents.length}/3 stages)</span>
                      <span className={`${theme.subtextColor} font-mono`}>
                        Total:{' '}
                        {formatLatency(
                          agents.reduce((sum, a) => sum + (a.latency_ms || 0), 0)
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {['retriever', 'verifier', 'answerer'].map((stageName) => {
                        const exec = agents.find((a) => a.agent === stageName);
                        const isExecuted = Boolean(exec);

                        return (
                          <div
                            key={stageName}
                            className={`p-2.5 rounded-lg border text-[11px] ${
                              isExecuted
                                ? `${theme.cardBg} ${theme.cardBorder}`
                                : `${theme.codeBg} border-dashed opacity-50`
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`font-semibold capitalize ${
                                  isExecuted ? theme.textColor : theme.subtextColor
                                }`}
                              >
                                {stageName}
                              </span>
                              {isExecuted ? (
                                <span className={`text-[10px] font-mono ${theme.accentText}`}>
                                  {formatLatency(exec?.latency_ms)}
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono text-rose-400">UNREACHED</span>
                              )}
                            </div>
                            <div
                              className={`text-[10px] ${theme.subtextColor} font-mono truncate`}
                              title={exec?.model || '—'}
                            >
                              {exec?.model || '—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expandable drawer for raw outputs */}
                  {agents.length > 0 && (
                    <div className="mt-3 pt-2">
                      <button
                        onClick={() => toggleExpand(turn.id)}
                        className={`flex items-center gap-1 text-[11px] ${theme.accentText} hover:opacity-80 font-medium transition-colors`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isExpanded ? 'Hide' : 'Inspect'} Raw Agent Outputs & Documents (
                          {agents.length} stages)
                        </span>
                      </button>

                      {isExpanded && (
                        <div className={`mt-3 p-3 rounded-lg ${theme.codeBg} border ${theme.codeBorder} space-y-3 animate-in fade-in duration-150`}>
                          {/* Stage Tab Selector */}
                          <div className={`flex items-center gap-2 border-b ${theme.divider} pb-2`}>
                            {agents.map((ag) => (
                              <button
                                key={ag.agent}
                                onClick={() =>
                                  setActiveRawTab((prev) => ({
                                    ...prev,
                                    [turn.id]: ag.agent,
                                  }))
                                }
                                className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                                  activeTabKey === ag.agent
                                    ? `${theme.accentBg} ${theme.accentBorder} ${theme.accentText} border font-semibold`
                                    : `${theme.subtextColor} hover:${theme.textColor}`
                                }`}
                              >
                                {ag.agent}
                              </button>
                            ))}
                            {resp?.retrieved && resp.retrieved.length > 0 && (
                              <button
                                onClick={() =>
                                  setActiveRawTab((prev) => ({
                                    ...prev,
                                    [turn.id]: 'retrieved_docs',
                                  }))
                                }
                                className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                                  activeTabKey === 'retrieved_docs'
                                    ? `${theme.accentBg} ${theme.accentBorder} ${theme.accentText} border font-semibold`
                                    : `${theme.subtextColor} hover:${theme.textColor}`
                                }`}
                              >
                                Docs ({resp.retrieved.length})
                              </button>
                            )}
                          </div>

                          {/* Tab Content */}
                          {activeTabKey === 'retrieved_docs' && resp?.retrieved ? (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              <div className={`text-[10px] ${theme.subtextColor} font-semibold uppercase mb-1`}>
                                Retrieved Corpus Documents:
                              </div>
                              {resp.retrieved.map((docTitle, di) => (
                                <div
                                  key={di}
                                  className={`flex items-center gap-2 text-[11px] ${theme.textColor} p-1.5 ${theme.cardBg} rounded border ${theme.cardBorder}`}
                                >
                                  <FileText className={`w-3 h-3 ${theme.accentText} shrink-0`} />
                                  <span className="truncate">{docTitle}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            (() => {
                              const ag = agents.find((a) => a.agent === activeTabKey) || agents[0];
                              if (!ag) return null;
                              return (
                                <div>
                                  <div className={`flex items-center justify-between text-[10px] ${theme.subtextColor} mb-1.5 font-mono`}>
                                    <span>
                                      Model: <span className={theme.textColor}>{ag.model}</span>
                                    </span>
                                    <span>
                                      Latency: <span className={theme.accentText}>{formatLatency(ag.latency_ms)}</span>
                                    </span>
                                  </div>
                                  <pre className={`p-2.5 rounded ${theme.inputBg} border ${theme.codeBorder} ${theme.textColor} text-[10.5px] whitespace-pre-wrap font-mono max-h-60 overflow-y-auto leading-relaxed`}>
                                    {ag.output || '(No text output)'}
                                  </pre>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Real In-Flight Turn Progress Indicator (Sequential 30-120s pipeline) */}
        {isInFlight && (
          <div className={`p-4 rounded-xl ${theme.cardBg} border ${theme.cardActiveBorder} ${theme.glowClass} animate-in fade-in duration-200 space-y-3`}>
            <div className={`flex items-center justify-between pb-2 border-b ${theme.divider}`}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${palette === 'butter' ? 'bg-amber-400' : palette === 'chalk' ? 'bg-cyan-600' : 'bg-cyan-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${palette === 'butter' ? 'bg-amber-400' : palette === 'chalk' ? 'bg-cyan-600' : 'bg-cyan-400'}`}></span>
                </span>
                <span className={`font-semibold ${theme.accentText} uppercase tracking-wider text-[11px]`}>
                  Sequential Pipeline Active
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-mono ${theme.textColor} flex items-center gap-1 tabular-nums`}>
                  <Clock className={`w-3.5 h-3.5 ${theme.accentText}`} />
                  <span>{inFlightElapsedSeconds}s elapsed</span>
                </span>
                <button
                  onClick={onCancelInFlight}
                  className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 hover:bg-rose-900/60 text-[10px] flex items-center gap-1 transition-colors"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Abort</span>
                </button>
              </div>
            </div>

            <p className={`text-[11px] ${theme.subtextColor} leading-relaxed`}>
              Turns take 30–120s across three sequential LLM calls. Watching live span emission to AgentPulse:
            </p>

            {/* Three Stage Progress Row */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { stage: 'retriever', model: 'mistralai/mistral-nemotron', label: '1. Retriever' },
                { stage: 'verifier', model: 'google/gemma-4-31b-it', label: '2. Verifier' },
                { stage: 'answerer', model: 'deepseek-ai/deepseek-v4-flash-0731', label: '3. Answerer' },
              ].map(({ stage, model, label }) => {
                const isCurrent = activeStage === stage;
                const isDone =
                  (stage === 'retriever' && (activeStage === 'verifier' || activeStage === 'answerer')) ||
                  (stage === 'verifier' && activeStage === 'answerer');

                return (
                  <div
                    key={stage}
                    className={`p-2.5 rounded-lg border transition-all ${
                      isCurrent
                        ? `${theme.accentBg} ${theme.accentBorder} ${theme.accentText}`
                        : isDone
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : `${theme.codeBg} border-white/5 ${theme.subtextColor}`
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                      <span>{label}</span>
                      {isDone ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : isCurrent ? (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded ${theme.accentBg} ${theme.accentText} animate-pulse`}>
                          RUNNING
                        </span>
                      ) : (
                        <span className={`text-[9px] ${theme.subtextColor}`}>QUEUED</span>
                      )}
                    </div>
                    <div className={`text-[9px] font-mono truncate ${theme.subtextColor}`}>{model}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className={`p-3 ${theme.headerBg} border-t ${theme.headerBorder} transition-colors`}>
        <div className="relative flex items-center">
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInFlight
                ? 'Sequential turn in flight (30–120s)... AgentPulse is capturing spans.'
                : 'Ask a question about SQLite WAL, MVCC, or crash recovery (Enter to send)...'
            }
            disabled={isInFlight}
            className={`w-full pl-3 pr-24 py-2.5 rounded-lg ${theme.inputBg} border ${theme.inputBorder} ${theme.inputText} ${theme.inputPlaceholder} text-[12px] font-mono focus:outline-none resize-none disabled:opacity-50`}
          />

          <div className="absolute right-2 bottom-2.5 flex items-center gap-1.5">
            <button
              onClick={handleSubmit}
              disabled={isInFlight || !inputText.trim()}
              className={`px-3 py-1.5 rounded-md ${
                palette === 'butter'
                  ? 'bg-amber-400 hover:bg-amber-300 text-black font-bold shadow-md shadow-amber-500/20'
                  : palette === 'chalk'
                  ? 'bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-md'
                  : isCalmMode
                  ? 'bg-zinc-200 hover:bg-white text-zinc-900 font-semibold'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-black font-semibold shadow-md shadow-cyan-500/20'
              } text-xs flex items-center gap-1 transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed`}
            >
              <span>Send</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className={`mt-2 flex items-center justify-between text-[10px] ${theme.subtextColor} font-mono`}>
          <span>Target: RAG FastAPI (:8100/chat) ➔ Observability: AgentPulse (:8000)</span>
          <span>Shift + Enter for newline</span>
        </div>
      </div>
    </div>
  );
};
