import React, { useState, useRef, useEffect } from 'react';
import {
  Square,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  FileText,
  Activity,
  CornerDownLeft,
  ArrowRight,
  Circle,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import type { ChatTurn, ChatHealth } from '../../lib/ragTypes';
import type { ColorPalette, ChalkSurfacePreset } from '../../types';
import { chatErrorTitle, isRefusal, isRetryable } from '../../lib/ragApi';
import { getRagTheme } from './ragTheme';
import {
  STAGES,
  failoverCount,
  failoverNote,
  formatLatency,
  noticeTone,
  prefersReducedMotion,
  providerAndModel,
  stageState,
  stageTimeSum,
  unavailableReason,
  type StageState,
} from './chatView';

interface ChatConsoleProps {
  turns: ChatTurn[];
  onSendMessage: (message: string) => Promise<void>;
  onCancelInFlight: () => void;
  isInFlight: boolean;
  inFlightElapsedSeconds: number;
  selectedTraceId?: string;
  onSelectTrace: (traceId: string) => void;
  sessionId: string;
  onResetSession: () => void;
  /** Send a question again, for the retry button on a turn that failed for a passing reason. */
  onRetry?: (message: string) => void;
  /** Whether the chat service would run a turn now, and if not why (from GET /chat/health). */
  chatStatus?: { ok: boolean; status: string; message?: string };
  chatHealth?: ChatHealth | null;
  /** Where turns are sent, shown under the input. */
  chatTarget?: string;
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

// Three the corpus covers (SQLite WAL, KB-429, DeBERTa) and one it does not, so the
// grounding signal has something to separate. Titles are in demo/workflows/retrieval.py.
const SAMPLE_PROMPTS = [
  'how does SQLite WAL improve concurrency?',
  'what should a client do after an HTTP 429 from the rate limiter?',
  'what does DeBERTa change compared with BERT?',
  'who won the 2022 football world cup?',
];

// In short: the icon of one step in the running turn's progress list: a hollow circle while it
// waits, a turning loader while it runs (still when the visitor asked for less motion), a tick when
// the stream said it finished.
const StageIcon: React.FC<{ state: StageState }> = ({ state }) =>
  state === 'done' ? (
    <CheckCircle2 className="w-4 h-4 rag-ok-text shrink-0" aria-hidden="true" />
  ) : state === 'running' ? (
    <Loader2 className="w-4 h-4 rag-accent-text rag-spin shrink-0" aria-hidden="true" />
  ) : (
    <Circle className="w-4 h-4 rag-text-3 shrink-0" aria-hidden="true" />
  );

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  turns,
  onSendMessage,
  onCancelInFlight,
  isInFlight,
  inFlightElapsedSeconds,
  selectedTraceId,
  onSelectTrace,
  sessionId,
  onResetSession,
  onRetry,
  chatStatus,
  chatHealth,
  chatTarget = '/chat',
  palette = 'dark',
  isCalmMode = false,
  chalkSurface = 'classic-white',
}) => {
  const theme = getRagTheme(palette, isCalmMode, chalkSurface);
  const [inputText, setInputText] = useState('');
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [activeRawTab, setActiveRawTab] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Set when a question is sent from the keyboard, so the field gets the focus back afterwards.
  const refocusRef = useRef(false);
  const blockedReason = unavailableReason(chatStatus);
  const runningTurn = turns.find((t) => t.status === 'running');
  const limits = chatHealth?.limits;

  // In short: keep the newest message in view. Only the message list scrolls (scrollIntoView used
  // to scroll the whole console page too, hiding the frame's header), smoothly unless the visitor
  // asked for less motion. It follows new turns and each stage the stream reports.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof el.scrollTo !== 'function') return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [turns.length, isInFlight, runningTurn?.progress?.done.length, runningTurn?.progress?.running, turns[turns.length - 1]?.status]);

  // In short: when a turn ends, give the focus back to the field if the question was typed there
  // (the field is disabled while a turn runs, which drops the focus).
  useEffect(() => {
    if (!isInFlight && refocusRef.current) {
      refocusRef.current = false;
      textareaRef.current?.focus();
    }
  }, [isInFlight]);

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
    if (!trimmed || isInFlight || blockedReason) return;
    refocusRef.current = typeof document !== 'undefined' && document.activeElement === textareaRef.current;
    setInputText('');
    await onSendMessage(trimmed);
  };

  const handleSelectSample = (sample: string) => {
    if (isInFlight) return;
    setInputText(sample);
    textareaRef.current?.focus();
  };

  return (
    <div className={`flex flex-col h-full min-h-0 ${theme.textColor} lg:border-r ${theme.panelBorder} text-xs`}>
      {/* Header bar (navigation layer: glass) */}
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b ${theme.headerBg}`}>
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className={`text-[13px] font-semibold ${theme.textColor}`}>Chat</h2>
          <span className={`text-[11px] ${theme.subtextColor} truncate`}>
            session <span className={`${theme.accentText} font-mono`}>{sessionId.substring(0, 10)}</span>
          </span>
        </div>

        <button
          onClick={onResetSession}
          disabled={isInFlight}
          className="rag-chip px-3 py-1 text-[11px] font-medium"
          title="Start new conversation session"
        >
          New session
        </button>
      </div>

      {/* Message list (content layer) */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        {turns.length === 0 && !isInFlight && (
          <div className="min-h-full flex flex-col justify-center items-center text-center px-2 py-6 max-w-md mx-auto">
            <div className={`w-12 h-12 rounded-2xl ${theme.accentBg} border ${theme.accentBorder} flex items-center justify-center ${theme.accentText} mb-4`}>
              <Activity className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className={`text-[15px] font-semibold tracking-tight ${theme.textColor}`}>
              Live multi-agent RAG observer
            </h3>
            <p className={`${theme.subtextColor} text-[13px] mt-2 leading-relaxed`}>
              Every message runs three agents in turn (retriever → verifier → answerer), each a
              real model call. AgentPulse captures each span asynchronously to verify grounding
              and accumulate drift.
            </p>

            <div className="w-full mt-6 text-left">
              <div className={`text-[11px] font-medium ${theme.subtextColor} mb-2 px-1`}>
                Sample questions (the last is not in the corpus)
              </div>
              <div className="space-y-2">
                {SAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSample(prompt)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border ${theme.cardBg} rag-hover-accent text-[13px] ${theme.textColor} transition-colors flex items-center justify-between gap-2`}
                  >
                    <span className="truncate">{prompt}</span>
                    <ArrowRight className={`w-3.5 h-3.5 ${theme.subtextColor} shrink-0`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Finished turns. role="log" tells a screen reader to read each new reply as it arrives. */}
        <div role="log" aria-label="Conversation" aria-live="polite" className="space-y-5">
          {turns.map((turn, index) => {
            const isExpanded = !!expandedTurns[turn.id];
            const resp = turn.response;
            const agents = resp?.agents ?? [];
            const isPartialOrError = turn.status === 'error' || Boolean(turn.errorMessage || resp?.error);
            const isSelectedTrace = selectedTraceId && (turn.traceId === selectedTraceId || resp?.trace_id === selectedTraceId);
            const activeTabKey = activeRawTab[turn.id] || (agents[0]?.agent ?? 'retriever');
            // A refusal, busy providers or a Stop is a notice (amber); anything else a failure (rose).
            const tone = noticeTone(resp?.code);

            return (
              <div key={turn.id} className="space-y-3">
                {/* The visitor's question */}
                <div className="flex flex-col items-end rag-enter">
                  <div className={`max-w-[85%] px-4 py-2.5 ${theme.userBubbleBg} text-[14px] leading-relaxed`}>
                    <div className="whitespace-pre-wrap break-words">{turn.userMessage}</div>
                  </div>
                  <span className="mt-1 px-1 text-[11px] rag-text-3 font-mono tabular-nums">
                    You · {new Date(turn.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* Assistant message. A running turn has none yet: its stages are shown in the
                    in-flight card below as the stream reports them. */}
                {turn.status !== 'running' && (
                  <div className="flex justify-start rag-enter">
                    <div
                      className={`w-full max-w-[95%] p-4 border rag-bubble-assistant transition-colors ${
                        isSelectedTrace ? `${theme.cardBg} ${theme.cardActiveBorder}` : theme.cardBg
                      }`}
                    >
                      {/* Who answered, which turn, and the trace it belongs to */}
                      <div className={`flex items-center justify-between gap-2 pb-2.5 mb-3 border-b ${theme.divider}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full rag-accent-dot shrink-0" aria-hidden="true" />
                          <span className={`font-semibold ${theme.textColor} text-[13px]`}>Assistant</span>
                          <span className={`text-[11px] ${theme.subtextColor}`}>Turn {index + 1}</span>
                        </div>

                        {turn.traceId && (
                          <button
                            onClick={() => onSelectTrace(turn.traceId!)}
                            aria-pressed={Boolean(isSelectedTrace)}
                            className="rag-chip px-2.5 py-0.5 text-[11px] font-mono flex items-center gap-1"
                            title="Inspect trace and grounding scores in right panel"
                          >
                            <span>trace {turn.traceId.substring(0, 10)}</span>
                            {isSelectedTrace && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                          </button>
                        )}
                      </div>

                      {/* A turn that did not complete: the service's own title and sentence. */}
                      {isPartialOrError && (
                        <div className={`mb-3 p-3 rounded-xl text-[12px] ${tone === 'warn' ? 'rag-note-warn' : 'rag-note-err'}`}>
                          <div className="flex items-center gap-1.5 font-semibold text-[13px] mb-1">
                            {tone === 'warn' ? (
                              <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                            )}
                            <span>{chatErrorTitle(resp?.code)}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {turn.errorMessage || resp?.error || 'Pipeline halted before completion'}
                          </div>
                          {isRefusal(resp?.code) ? (
                            <div className="text-[11px] mt-1.5 opacity-90">
                              No agent ran, so nothing was sent to AgentPulse for this question.
                              {resp?.retry_after ? ` Try again in about ${resp.retry_after} s.` : ''}
                            </div>
                          ) : (
                            <div className="text-[11px] mt-1.5 opacity-90">
                              Completed {agents.length} of 3 agent stages {resp?.code === 'aborted' ? 'before you stopped it' : 'before it ended'}.{' '}
                              {turn.traceId
                                ? "This turn's spans remain visible in AgentPulse telemetry."
                                : 'The service returned no trace id, so there is nothing to look up in AgentPulse.'}
                            </div>
                          )}
                          {onRetry && isRetryable(resp?.code, Boolean(resp)) && (
                            <button
                              onClick={() => onRetry(turn.userMessage)}
                              disabled={isInFlight || Boolean(blockedReason)}
                              className="rag-chip mt-2.5 px-3 py-1 text-[12px] font-semibold flex items-center gap-1.5"
                              title="Send the same question again"
                            >
                              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                              Retry
                            </button>
                          )}
                        </div>
                      )}

                      {/* Reply text (if the answerer produced one) */}
                      {resp?.reply ? (
                        <div className={`text-[14px] ${theme.assistantBubbleText} leading-relaxed whitespace-pre-wrap break-words mb-4`}>
                          {resp.reply}
                        </div>
                      ) : !isPartialOrError ? (
                        <div className={`${theme.subtextColor} italic text-[12px] mb-3`}>No reply produced.</div>
                      ) : null}

                      {/* Verifier verdict, if present */}
                      {resp?.verifier_verdict && (
                        <div className={`mb-3.5 px-3 py-2 rounded-xl ${theme.codeBg} text-[13px]`}>
                          <span className={`text-[11px] font-semibold ${theme.accentText} block mb-0.5`}>Verifier verdict</span>
                          <span className={theme.textColor}>{resp.verifier_verdict}</span>
                        </div>
                      )}

                      {/* The three agents that produced it: name, time, provider and model */}
                      <div className={`mt-3 pt-3 border-t ${theme.divider}`}>
                        <div className={`text-[11px] font-medium ${theme.subtextColor} mb-2 flex items-center justify-between gap-2`}>
                          <span>Agents ({agents.length}/3 stages)</span>
                          <span
                            className="font-mono tabular-nums"
                            title={
                              resp?.total_ms != null
                                ? 'The whole turn as the service measured it: the search and all three model calls'
                                : 'The sum of the stage times the service reported'
                            }
                          >
                            {resp?.total_ms != null ? 'Turn' : 'Total'}:{' '}
                            {/* The service's own total, else the sum of reported stage times; a dash when unknown, never 0 */}
                            {formatLatency(resp?.total_ms ?? stageTimeSum(agents))}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {STAGES.map((stageName) => {
                            const exec = agents.find((a) => a.agent === stageName);
                            const isExecuted = Boolean(exec);

                            return (
                              <div
                                key={stageName}
                                className={`px-3 py-2 rounded-xl border text-[12px] ${
                                  isExecuted ? `${theme.codeBg} ${theme.codeBorder}` : `${theme.codeBorder} border-dashed`
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className={`font-semibold capitalize ${isExecuted ? theme.textColor : theme.subtextColor}`}>
                                    {stageName}
                                  </span>
                                  {isExecuted ? (
                                    <span className={`text-[11px] font-mono tabular-nums ${theme.accentText}`}>
                                      {formatLatency(exec?.latency_ms)}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium rag-text-2">Unreached</span>
                                  )}
                                </div>
                                <div className={`text-[11px] ${theme.subtextColor} font-mono truncate`} title={providerAndModel(exec)}>
                                  {providerAndModel(exec)}
                                </div>
                                {failoverCount(exec) > 0 && (
                                  <div
                                    className="text-[11px] font-mono rag-warn-text truncate"
                                    title={(exec?.attempts ?? []).map((a) => `${a.provider}/${a.model}: ${a.outcome}`).join('\n')}
                                  >
                                    {failoverNote(exec)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Disclosure with each agent's raw output and the retrieved documents */}
                      {agents.length > 0 && (
                        <div className="mt-3 pt-1">
                          <button
                            onClick={() => toggleExpand(turn.id)}
                            aria-expanded={isExpanded}
                            className={`flex items-center gap-1 text-[12px] ${theme.accentText} hover:opacity-80 font-medium rounded-md`}
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
                            <span>
                              {isExpanded ? 'Hide' : 'Inspect'} raw agent outputs and documents ({agents.length} stages)
                            </span>
                          </button>

                          {isExpanded && (
                            <div className={`mt-3 p-3 rounded-xl ${theme.codeBg} border ${theme.codeBorder} space-y-3 rag-enter`}>
                              {/* Which output to show: one segment per agent, plus the documents */}
                              <div role="tablist" aria-label="Raw output" className="rag-segment inline-flex flex-wrap gap-0.5 p-0.5">
                                {agents.map((ag) => (
                                  <button
                                    key={ag.agent}
                                    role="tab"
                                    aria-selected={activeTabKey === ag.agent}
                                    onClick={() => setActiveRawTab((prev) => ({ ...prev, [turn.id]: ag.agent }))}
                                    className="px-3 py-1 rounded-full text-[11px] font-medium capitalize"
                                  >
                                    {ag.agent}
                                  </button>
                                ))}
                                {resp?.retrieved && resp.retrieved.length > 0 && (
                                  <button
                                    role="tab"
                                    aria-selected={activeTabKey === 'retrieved_docs'}
                                    onClick={() => setActiveRawTab((prev) => ({ ...prev, [turn.id]: 'retrieved_docs' }))}
                                    className="px-3 py-1 rounded-full text-[11px] font-medium"
                                  >
                                    Docs ({resp.retrieved.length})
                                  </button>
                                )}
                              </div>

                              {activeTabKey === 'retrieved_docs' && resp?.retrieved ? (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  <div className={`text-[11px] ${theme.subtextColor} font-medium mb-1`}>Retrieved corpus documents</div>
                                  {resp.retrieved.map((docTitle, di) => (
                                    <div
                                      key={di}
                                      className={`flex items-center gap-2 text-[12px] ${theme.textColor} px-2.5 py-1.5 rounded-lg border ${theme.cardBg}`}
                                    >
                                      <FileText className={`w-3.5 h-3.5 ${theme.accentText} shrink-0`} aria-hidden="true" />
                                      <span className="truncate">{docTitle}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                (() => {
                                  const ag = agents.find((a) => a.agent === activeTabKey) || agents[0];
                                  if (!ag) return null;
                                  return (
                                    <div role="tabpanel">
                                      <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] ${theme.subtextColor} mb-1.5 font-mono`}>
                                        <span>
                                          Model: <span className={theme.textColor}>{providerAndModel(ag)}</span>
                                        </span>
                                        <span>
                                          Latency: <span className={theme.accentText}>{formatLatency(ag.latency_ms)}</span>
                                        </span>
                                      </div>
                                      <pre className={`p-3 rounded-lg ${theme.inputBg} border ${theme.codeBorder} ${theme.textColor} text-[12px] whitespace-pre-wrap font-mono max-h-60 overflow-y-auto leading-relaxed`}>
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
                )}
              </div>
            );
          })}
        </div>

        {/* The running turn: each step as the stream reports it (waiting, running, or done with its
            time and the provider that answered). Outside the log region, so the ticking clock is
            not read out every second. */}
        {isInFlight && (
          <div className={`mt-5 p-4 border rag-bubble-assistant ${theme.cardBg} ${theme.cardActiveBorder} space-y-3 rag-enter`}>
            <div className={`flex items-center justify-between gap-3 pb-2.5 border-b ${theme.divider}`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full rag-accent-dot rag-breathe" aria-hidden="true" />
                <span className={`font-semibold ${theme.textColor} text-[13px]`}>Running the three agents</span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className={`text-[12px] font-mono ${theme.textColor} flex items-center gap-1 tabular-nums`}>
                  <Clock className={`w-3.5 h-3.5 ${theme.accentText}`} aria-hidden="true" />
                  <span>{inFlightElapsedSeconds}s elapsed</span>
                </span>
                <button
                  onClick={onCancelInFlight}
                  className="rag-chip px-3 py-1 text-[12px] font-medium flex items-center gap-1.5"
                  title="Stop this turn"
                >
                  <Square className="w-3 h-3 fill-current rag-err-text" aria-hidden="true" />
                  <span>Stop</span>
                </button>
              </div>
            </div>

            <ol className="space-y-2 text-[12px]">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <StageIcon state={stageState(runningTurn?.progress, 'search')} />
                  <span className={theme.textColor}>search</span>
                </span>
                <span className={`font-mono text-[11px] truncate ${runningTurn?.progress?.retrieved ? theme.accentText : theme.subtextColor}`}>
                  {runningTurn?.progress?.retrieved
                    ? `${runningTurn.progress.retrieved.length} documents · ${formatLatency(runningTurn.progress.searchMs)}`
                    : 'running'}
                </span>
              </li>
              {STAGES.map((stageName) => {
                const done = runningTurn?.progress?.done.find((a) => a.agent === stageName);
                const state = stageState(runningTurn?.progress, stageName);
                const note = failoverNote(done);
                return (
                  <li key={stageName} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <StageIcon state={state} />
                      <span className={state === 'waiting' ? theme.subtextColor : theme.textColor}>{stageName}</span>
                    </span>
                    <span
                      className={`font-mono text-[11px] truncate ${done ? theme.accentText : theme.subtextColor}`}
                      title={done ? providerAndModel(done) : undefined}
                    >
                      {done
                        ? `${formatLatency(done.latency_ms)} · ${providerAndModel(done)}${note ? ` (${note})` : ''}`
                        : state === 'running'
                        ? 'running'
                        : 'waiting'}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className={`text-[11px] ${theme.subtextColor} leading-relaxed`}>
              Three model calls in turn. With a fast provider a turn takes seconds; when the free
              providers are at their limits it falls back to slower ones and can take a minute.
            </p>
          </div>
        )}
      </div>

      {/* Composer (navigation layer: glass bar, one tinted primary action) */}
      <div className={`px-3 pt-3 pb-3 border-t ${theme.headerBg}`}>
        <div className={`rag-composer ${theme.inputBg} border rounded-2xl flex items-end gap-2 p-1.5 pl-3 transition-shadow`}>
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Message"
            placeholder={
              isInFlight
                ? 'Turn in flight...'
                : blockedReason ?? 'Ask a question the corpus covers, or one it does not (Enter to send)...'
            }
            maxLength={limits?.max_input_chars}
            disabled={isInFlight || Boolean(blockedReason)}
            className={`flex-1 min-w-0 py-1.5 bg-transparent ${theme.inputText} ${theme.inputPlaceholder} text-[14px] leading-relaxed resize-none disabled:opacity-60`}
          />

          <button
            onClick={handleSubmit}
            disabled={isInFlight || Boolean(blockedReason) || !inputText.trim()}
            className="rag-primary h-10 px-4 text-[13px] font-semibold flex items-center gap-1.5 shrink-0"
          >
            <span>Send</span>
            <CornerDownLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Why Send is disabled, as visible text next to it: a placeholder alone is easy to miss,
            and screen readers announce it only when the field is focused. */}
        {blockedReason && !isInFlight && (
          <div role="status" className="mt-2 px-3 py-2 rounded-xl rag-note-warn text-[12px]">
            {blockedReason}
          </div>
        )}

        <div className={`mt-2 px-1 flex items-center justify-between gap-3 text-[11px] ${theme.subtextColor}`}>
          <span className="truncate font-mono">Chat: {chatTarget} ➔ Observability: AgentPulse /v1</span>
          <span className="shrink-0 hidden sm:inline">Shift + Enter for newline</span>
        </div>
        <div className={`mt-1 px-1 text-[11px] ${theme.subtextColor} leading-relaxed`}>
          Questions and answers are recorded in AgentPulse traces, which anyone can read on this
          site. Do not type anything personal.
          {limits &&
            ` Each visitor can ask ${limits.ip_turns_per_minute} questions a minute and ${limits.ip_turns_per_day} a day, of up to ${limits.max_input_chars} characters.`}
        </div>
      </div>
    </div>
  );
};
