import React from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  HelpCircle,
  Shield,
  Radio,
  BarChart3,
} from 'lucide-react';
import type { ChatTurn, PipelineAgent, AgentDriftReading } from '../../lib/ragTypes';
import type { EvaluatorReadiness, Agent as ApiAgent } from '../../lib/api';
import { riskLabel, riskBadgeClasses, riskTextClasses } from '../../lib/riskTone';
import type { ColorPalette, ChalkSurfacePreset } from '../../types';
import { getRagTheme } from './ragTheme';
import { AgentLedger } from './AgentLedger';

interface MonitoringPanelProps {
  evaluatorReadiness: EvaluatorReadiness | null;
  evaluatorLoading: boolean;
  onRefreshEvaluator: () => void;
  turns: ChatTurn[];
  selectedTraceId?: string;
  onSelectTrace: (traceId: string) => void;
  agentSpansCount: Record<PipelineAgent, number>;
  agentDrift: Partial<Record<PipelineAgent, AgentDriftReading>>;
  apiAgents: ApiAgent[];
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

const DRIFT_WINDOW_TARGET = 32;

// In short: a card title in the console's style: an icon, a sentence-case title, and room on the
// right for a badge or a button.
const CardTitle: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex items-center justify-between gap-2 pb-2.5 border-b rag-divider">
    <div className="flex items-center gap-2 min-w-0">
      {icon}
      <h3 className="text-[13px] font-semibold rag-text">{title}</h3>
    </div>
    {children}
  </div>
);

export const MonitoringPanel: React.FC<MonitoringPanelProps> = ({
  evaluatorReadiness,
  evaluatorLoading,
  onRefreshEvaluator,
  turns,
  selectedTraceId,
  onSelectTrace,
  agentSpansCount,
  agentDrift,
  apiAgents: _apiAgents,
  palette = 'dark',
  isCalmMode = false,
  chalkSurface = 'classic-white',
}) => {
  const theme = getRagTheme(palette, isCalmMode, chalkSurface);

  // Find currently selected turn, or default to the most recent turn
  const activeTurn =
    turns.find((t) => t.traceId === selectedTraceId) ||
    (turns.length > 0 ? turns[turns.length - 1] : null);

  // Session totals calculation
  const totalTurns = turns.length;
  // Stages the service reported it ran. A turn that died at the verifier counts two.
  const totalStagesRun = turns.reduce((n, t) => n + (t.response?.agents?.length ?? 0), 0);
  const evaluatedTurns = turns.filter((t) => t.groundingStatus === 'evaluated');
  const pendingTurns = turns.filter((t) => t.groundingStatus === 'pending');
  const totalErrors = turns.filter((t) => t.status === 'error' || t.errorMessage).length;

  const workersAlive = evaluatorReadiness?.workers_alive ?? 0;
  const isEvaluatorAlive = workersAlive > 0;

  return (
    <div className={`flex flex-col h-full min-h-0 ${theme.textColor} overflow-y-auto text-xs`}>
      {/* Panel header (navigation layer: glass, sticks while the cards scroll under it) */}
      <div className={`sticky top-0 z-10 px-4 py-2.5 border-b ${theme.headerBg} flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${theme.accentText}`} aria-hidden="true" />
            <h2 className={`text-[13px] font-semibold ${theme.textColor}`}>Signal verification monitor</h2>
          </div>
          <span className={`text-[11px] ${theme.subtextColor} mt-0.5 block`}>
            Target signals: <strong className={theme.textColor}>Grounding</strong> &amp; <strong className={theme.textColor}>Drift</strong> only
          </span>
        </div>

        {/* Evaluator worker badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="status"
            className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-semibold ${
              isEvaluatorAlive ? 'rag-note-ok' : 'rag-note-err'
            }`}
            title={
              isEvaluatorAlive
                ? `${workersAlive} worker(s) registered and ready`
                : 'No evaluator worker alive. Grounding evaluations will not run.'
            }
          >
            <span className={`w-2 h-2 rounded-full ${isEvaluatorAlive ? 'rag-ok-dot' : 'rag-err-dot'}`} aria-hidden="true" />
            <span>{isEvaluatorAlive ? `Worker alive (${workersAlive})` : 'Evaluator offline'}</span>
          </div>

          <button
            onClick={onRefreshEvaluator}
            disabled={evaluatorLoading}
            className="rag-chip p-1.5"
            title="Refresh evaluator health"
            aria-label="Refresh evaluator health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluatorLoading ? 'rag-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Session totals: counts of this page's own turns, so 0 before the first question is true */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Turns', value: totalTurns, cls: theme.textColor, note: 'Session queries' },
            { label: 'Stages run', value: totalStagesRun, cls: theme.accentText, note: 'reported by the service' },
          ].map((k) => (
            <div key={k.label} className={`p-3 rounded-2xl border ${theme.cardBg}`}>
              <div className={`text-[11px] font-medium ${theme.subtextColor}`}>{k.label}</div>
              <div className={`text-xl font-semibold ${k.cls} mt-1 font-mono tabular-nums`}>{k.value}</div>
              <div className={`text-[11px] ${theme.subtextColor} mt-0.5`}>{k.note}</div>
            </div>
          ))}

          <div className={`p-3 rounded-2xl border ${theme.cardBg}`}>
            <div className={`text-[11px] font-medium ${theme.subtextColor}`}>Evaluated</div>
            <div className="text-xl font-semibold rag-ok-text mt-1 font-mono tabular-nums">{evaluatedTurns.length}</div>
            <div className={`text-[11px] ${theme.subtextColor} mt-0.5`}>
              {pendingTurns.length > 0 ? (
                <span className="rag-warn-text font-semibold">{pendingTurns.length} pending</span>
              ) : (
                'All scored'
              )}
            </div>
          </div>

          <div className={`p-3 rounded-2xl border ${theme.cardBg}`}>
            <div className={`text-[11px] font-medium ${theme.subtextColor}`}>Errors</div>
            <div className={`text-xl font-semibold mt-1 font-mono tabular-nums ${totalErrors > 0 ? 'rag-err-text' : theme.textColor}`}>
              {totalErrors}
            </div>
            <div className={`text-[11px] ${theme.subtextColor} mt-0.5`}>Pipeline failures</div>
          </div>
        </div>

        {/* Per-turn grounding score (answerer span) */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg}`}>
          <CardTitle icon={<Shield className={`w-4 h-4 ${theme.accentText}`} aria-hidden="true" />} title="Per-turn grounding (answerer span)">
            {activeTurn && (
              <span className={`text-[11px] ${theme.subtextColor} font-mono`}>
                Trace <span className={theme.accentText}>{activeTurn.traceId?.substring(0, 10) || '—'}</span>
              </span>
            )}
          </CardTitle>

          {activeTurn ? (
            <div className="mt-3 space-y-3">
              {/* Score, or why there is none yet */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-[11px] font-medium ${theme.subtextColor}`}>Answerer grounding score</div>
                  <div className="mt-1 flex items-baseline gap-3">
                    {activeTurn.groundingStatus === 'evaluated' && activeTurn.groundingScore != null ? (
                      <>
                        <span className={`text-3xl font-semibold font-mono tabular-nums ${riskTextClasses(activeTurn.groundingScore)}`}>
                          {activeTurn.groundingScore.toFixed(3)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${riskBadgeClasses(activeTurn.groundingScore)}`}>
                          {activeTurn.groundingLabel || riskLabel(activeTurn.groundingScore)}
                        </span>
                      </>
                    ) : activeTurn.groundingStatus === 'pending' ? (
                      <div className="flex items-center gap-2 py-1">
                        <span className="px-2.5 py-1 rounded-full rag-note-warn font-semibold text-[12px] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 rag-breathe" aria-hidden="true" />
                          <span>Pending async evaluation</span>
                        </span>
                      </div>
                    ) : (
                      <span className={`text-2xl font-semibold ${theme.subtextColor}`}>—</span>
                    )}
                  </div>
                </div>

                {activeTurn.groundingStatus === 'evaluated' && activeTurn.groundingEvaluationStage && (
                  <div className={`text-right text-[11px] ${theme.subtextColor} font-mono`}>
                    <div>
                      Stage: <span className={theme.textColor}>{activeTurn.groundingEvaluationStage}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Status explanation */}
              {activeTurn.groundingStatus === 'pending' && (
                <div className="p-3 rounded-xl rag-note-warn text-[12px] leading-relaxed flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong>Async scoring in progress:</strong> Evaluation runs on worker after trace ingestion. Scores are deliberately absent at first (shown as pending, never as zero). Polling /v1/traces/{activeTurn.traceId?.substring(0, 8)}...
                  </div>
                </div>
              )}

              {activeTurn.groundingStatus === 'unmeasured' && (
                <div className={`p-3 rounded-xl ${theme.codeBg} text-[12px] ${theme.textColor} leading-relaxed`}>
                  <strong>Not measured:</strong>{' '}
                  {activeTurn.status === 'error'
                    ? 'the turn failed, so no answer was scored.'
                    : !activeTurn.traceId
                    ? 'the service returned no trace id, so this turn cannot be matched to AgentPulse telemetry.'
                    : 'no evaluation for the answerer span arrived within 30 s. Check that the evaluation worker is running.'}
                </div>
              )}

              {activeTurn.groundingStatus === 'evaluated' && (
                <div className={`p-3 rounded-xl ${theme.codeBg} text-[12px] ${theme.subtextColor} leading-relaxed`}>
                  A risk score: 0.0 is fully supported by the retrieved text, 1.0 is not supported. A
                  stage 2 score comes from the NLI model; stage 1 is a similarity-only fallback.
                </div>
              )}
            </div>
          ) : (
            <div className={`py-8 text-center ${theme.subtextColor} text-[12px]`}>
              No conversation turns recorded yet. Send a query in the chat stream to start trace evaluation.
            </div>
          )}

          {/* Every turn of this session with its score, to pick which one the cards describe */}
          {turns.length > 1 && (
            <div className={`mt-4 pt-3 border-t ${theme.divider}`}>
              <div className={`text-[11px] font-medium ${theme.subtextColor} mb-2`}>
                Session trace grounding log ({turns.length} turns)
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {turns.map((t, idx) => {
                  const isSelected = t.traceId === selectedTraceId || (t === activeTurn && !selectedTraceId);
                  return (
                    <button
                      key={t.id}
                      onClick={() => t.traceId && onSelectTrace(t.traceId)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-[12px] border transition-colors ${
                        isSelected ? `${theme.cardBg} ${theme.cardActiveBorder}` : `${theme.codeBg} border-transparent rag-hover-accent`
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[11px] ${theme.subtextColor} font-mono`}>#{idx + 1}</span>
                        <span className={`font-mono ${theme.accentText} w-20 truncate`}>{t.traceId?.substring(0, 8) || 'no-trace'}</span>
                        <span className={`truncate ${theme.textColor}`}>{t.userMessage}</span>
                      </div>

                      <div className="shrink-0">
                        {t.groundingStatus === 'evaluated' && t.groundingScore != null ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${riskTextClasses(t.groundingScore)}`}>
                            {t.groundingScore.toFixed(2)}
                          </span>
                        ) : t.groundingStatus === 'pending' ? (
                          <span className="text-[11px] rag-warn-text font-medium">Pending</span>
                        ) : (
                          <span className={`text-[11px] ${theme.subtextColor}`}>—</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* The owner's agent ledger: one row per span of the selected turn, on DatumDisplay */}
        <AgentLedger traceId={activeTurn?.traceId} theme={theme} />

        {/* Drift: read from AgentPulse, shown as "not available" until the 32-span window is full */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg}`}>
          <CardTitle icon={<BarChart3 className={`w-4 h-4 ${theme.accentText}`} aria-hidden="true" />} title="Behavioural drift verification (32-span window)">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${theme.codeBg} ${theme.subtextColor} border ${theme.cardBorder} shrink-0`}>
              {DRIFT_WINDOW_TARGET} spans / agent
            </span>
          </CardTitle>

          <div className="mt-3 space-y-4">
            <p className={`${theme.subtextColor} text-[12px] leading-relaxed`}>
              Drift needs a <strong className={theme.textColor}>32-span window</strong> per agent (20 baseline
              plus 12 current), so a script that sends 5 calls never reaches it and the value stays
              unavailable, not zero. Span counts and drift below are read from AgentPulse
              (<code>/v1/agents</code>, <code>/v1/drift</code>); nothing is counted or computed in this page.
            </p>

            <div className="space-y-2.5">
              {(['answerer', 'verifier', 'retriever'] as PipelineAgent[]).map((name) => {
                const count = agentSpansCount[name];
                const drift = agentDrift[name]?.windowDistance ?? null;
                const asi = agentDrift[name]?.asi ?? null;
                const isMeasured = drift != null;
                const hasEnoughSpans = count >= DRIFT_WINDOW_TARGET;
                const pct = Math.min(100, Math.round((count / DRIFT_WINDOW_TARGET) * 100));

                return (
                  <div key={name} className={`p-3 rounded-xl ${theme.codeBg}`}>
                    <div className="flex items-center justify-between gap-2 text-[12px] mb-1.5">
                      <span className={`font-semibold ${theme.textColor} capitalize flex items-center gap-1.5`}>
                        <span>{name}</span>
                        {isMeasured && <CheckCircle2 className="w-3.5 h-3.5 rag-ok-text" aria-label="drift measured" />}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${theme.accentText} font-semibold tabular-nums`}>
                          {count} / {DRIFT_WINDOW_TARGET} spans
                        </span>
                        <span className={`text-[11px] ${theme.subtextColor} tabular-nums`}>({pct}%)</span>
                      </div>
                    </div>

                    {/* How full the window is: a span count from AgentPulse, not a drift value */}
                    <div
                      className={`w-full h-1.5 rounded-full ${theme.inputBg} overflow-hidden`}
                      role="progressbar"
                      aria-label={`${name} window`}
                      aria-valuemin={0}
                      aria-valuemax={DRIFT_WINDOW_TARGET}
                      aria-valuenow={Math.min(count, DRIFT_WINDOW_TARGET)}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${isMeasured ? 'rag-ok-dot' : 'rag-accent-dot'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-2 text-[11px] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      {isMeasured ? (
                        <>
                          <span className="rag-ok-text font-semibold">Drift measured by AgentPulse</span>
                          <span className={`font-mono ${theme.textColor}`}>
                            Centroid dist: <strong>{drift.toFixed(3)}</strong> (alert threshold 0.30 by default)
                            {asi != null && <> • ASI <strong>{asi.toFixed(1)}</strong></>}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className={theme.subtextColor}>
                            {hasEnoughSpans
                              ? 'Enough spans ingested, but no windowed drift reported yet (evaluation pending, or the evaluator restarted and its current window is refilling)'
                              : `Window accumulating: need ${DRIFT_WINDOW_TARGET - count} more spans`}
                          </span>
                          <span className={`${theme.subtextColor} font-mono italic`}>
                            drift: <strong className="font-normal">not available</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Why an unmeasured drift is never shown as 0 */}
            <div className={`p-3 rounded-xl ${theme.codeBg} text-[12px] ${theme.subtextColor} space-y-1 leading-relaxed`}>
              <div className={`flex items-center gap-1.5 font-semibold ${theme.textColor}`}>
                <HelpCircle className={`w-3.5 h-3.5 ${theme.accentText}`} aria-hidden="true" />
                <span>Operational invariant: zero placeholder ban</span>
              </div>
              <p>
                Until 32 spans are ingested, drift remains strictly uncalculated. A premature zero reads as an all-clear (&ldquo;zero drift detected&rdquo;); AgentPulse never displays 0.00 when unmeasured.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
