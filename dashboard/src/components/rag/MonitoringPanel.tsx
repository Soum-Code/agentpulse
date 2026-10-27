import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  Shield,
  Radio,
  BarChart3,
} from 'lucide-react';
import type { ChatTurn, PipelineAgent, AgentDriftReading } from '../../lib/ragTypes';
import type { EvaluatorReadiness, Agent as ApiAgent } from '../../lib/api';
import { riskTone, riskLabel, riskBadgeClasses, riskTextClasses, riskDotClasses } from '../../lib/riskTone';
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

export const MonitoringPanel: React.FC<MonitoringPanelProps> = ({
  evaluatorReadiness,
  evaluatorLoading,
  onRefreshEvaluator,
  turns,
  selectedTraceId,
  onSelectTrace,
  agentSpansCount,
  agentDrift,
  apiAgents,
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
    <div className={`flex flex-col h-full ${theme.containerBg} ${theme.textColor} overflow-y-auto font-mono text-xs transition-colors duration-200`}>
      {/* Monitoring Header */}
      <div className={`p-4 border-b ${theme.headerBorder} ${theme.headerBg} flex items-center justify-between transition-colors`}>
        <div>
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${theme.accentText}`} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textColor}`}>
              Signal Verification Monitor
            </span>
          </div>
          <span className={`text-[10px] ${theme.subtextColor} mt-0.5 block`}>
            Target signals: <strong className={theme.textColor}>Grounding</strong> &amp; <strong className={theme.textColor}>Drift</strong> only
          </span>
        </div>

        {/* Evaluator worker badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded border flex items-center gap-1.5 text-[11px] ${
              isEvaluatorAlive
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}
            title={
              isEvaluatorAlive
                ? `${workersAlive} worker(s) registered and ready`
                : 'No evaluator worker alive. Grounding evaluations will not run.'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isEvaluatorAlive ? 'bg-emerald-400 phosphor-emerald' : 'bg-rose-500'
              }`}
            />
            <span className="font-semibold">
              {isEvaluatorAlive ? `WORKER ALIVE (${workersAlive})` : 'EVALUATOR OFFLINE'}
            </span>
          </div>

          <button
            onClick={onRefreshEvaluator}
            disabled={evaluatorLoading}
            className={`p-1 rounded ${theme.subtextColor} hover:${theme.textColor} border ${theme.cardBorder} hover:${theme.cardBg} transition-colors disabled:opacity-40`}
            title="Refresh evaluator health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluatorLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Session Totals Grid */}
        <div className="grid grid-cols-4 gap-2.5">
          <div className={`p-3 rounded-lg ${theme.cardBg} border ${theme.cardBorder}`}>
            <div className={`text-[10px] uppercase ${theme.subtextColor} tracking-wider`}>Turns</div>
            <div className={`text-xl font-bold ${theme.textColor} mt-1 tabular-nums`}>
              {totalTurns}
            </div>
            <div className={`text-[10px] ${theme.subtextColor} mt-0.5`}>Session queries</div>
          </div>

          <div className={`p-3 rounded-lg ${theme.cardBg} border ${theme.cardBorder}`}>
            <div className={`text-[10px] uppercase ${theme.subtextColor} tracking-wider`}>Stages Run</div>
            <div className={`text-xl font-bold ${theme.accentText} mt-1 tabular-nums`}>
              {totalStagesRun}
            </div>
            <div className={`text-[10px] ${theme.subtextColor} mt-0.5`}>reported by the service</div>
          </div>

          <div className={`p-3 rounded-lg ${theme.cardBg} border ${theme.cardBorder}`}>
            <div className={`text-[10px] uppercase ${theme.subtextColor} tracking-wider`}>Evaluated</div>
            <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">
              {evaluatedTurns.length}
            </div>
            <div className={`text-[10px] ${theme.subtextColor} mt-0.5`}>
              {pendingTurns.length > 0 ? (
                <span className="text-amber-400 font-semibold">{pendingTurns.length} pending</span>
              ) : (
                'All scored'
              )}
            </div>
          </div>

          <div className={`p-3 rounded-lg ${theme.cardBg} border ${theme.cardBorder}`}>
            <div className={`text-[10px] uppercase ${theme.subtextColor} tracking-wider`}>Errors</div>
            <div
              className={`text-xl font-bold mt-1 tabular-nums ${
                totalErrors > 0 ? 'text-rose-400' : theme.textColor
              }`}
            >
              {totalErrors}
            </div>
            <div className={`text-[10px] ${theme.subtextColor} mt-0.5`}>Pipeline failures</div>
          </div>
        </div>

        {/* Per-Turn Grounding Score Card (Answerer Span) */}
        <div className={`p-4 rounded-xl ${theme.cardBg} border ${theme.cardBorder} relative`}>
          <div className={`flex items-center justify-between pb-2 border-b ${theme.divider}`}>
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${theme.accentText}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.textColor}`}>
                Per-Turn Grounding (Answerer Span)
              </span>
            </div>

            {activeTurn && (
              <span className={`text-[10px] ${theme.subtextColor} font-mono`}>
                Trace: <span className={theme.accentText}>{activeTurn.traceId?.substring(0, 10) || '—'}</span>
              </span>
            )}
          </div>

          {activeTurn ? (
            <div className="mt-3 space-y-3">
              {/* Score Display */}
              <div className="flex items-start justify-between">
                <div>
                  <div className={`text-[10px] uppercase ${theme.subtextColor} tracking-wider`}>
                    Answerer Grounding Score
                  </div>
                  <div className="mt-1 flex items-baseline gap-3">
                    {activeTurn.groundingStatus === 'evaluated' &&
                    activeTurn.groundingScore != null ? (
                      <>
                        <span
                          className={`text-3xl font-extrabold tabular-nums ${riskTextClasses(
                            activeTurn.groundingScore
                          )}`}
                        >
                          {activeTurn.groundingScore.toFixed(3)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase ${riskBadgeClasses(
                            activeTurn.groundingScore
                          )}`}
                        >
                          {activeTurn.groundingLabel || riskLabel(activeTurn.groundingScore)}
                        </span>
                      </>
                    ) : activeTurn.groundingStatus === 'pending' ? (
                      <div className="flex items-center gap-2 py-1">
                        <span className="px-2.5 py-1 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300 font-semibold text-[11px] flex items-center gap-1.5 animate-pulse">
                          <Clock className="w-3.5 h-3.5" />
                          <span>PENDING ASYNC EVALUATION</span>
                        </span>
                      </div>
                    ) : (
                      <span className={`text-2xl font-bold ${theme.subtextColor}`}>—</span>
                    )}
                  </div>
                </div>

                {activeTurn.groundingStatus === 'evaluated' && activeTurn.groundingEvaluationStage && (
                  <div className={`text-right text-[10px] ${theme.subtextColor} font-mono`}>
                    <div>Stage: <span className={theme.textColor}>{activeTurn.groundingEvaluationStage}</span></div>
                  </div>
                )}
              </div>

              {/* Status explanation */}
              {activeTurn.groundingStatus === 'pending' && (
                <div className="p-2.5 rounded bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 leading-relaxed flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <strong>Async Scoring In Progress:</strong> Evaluation runs on worker after trace ingestion. Scores are deliberately absent at first (shown as pending, never as zero). Polling /v1/traces/{activeTurn.traceId?.substring(0, 8)}...
                  </div>
                </div>
              )}

              {activeTurn.groundingStatus === 'unmeasured' && (
                <div className={`p-2.5 rounded ${theme.codeBg} border ${theme.codeBorder} text-[11px] ${theme.textColor} leading-relaxed`}>
                  <strong>Not measured:</strong>{' '}
                  {activeTurn.status === 'error'
                    ? 'the turn failed, so no answer was scored.'
                    : !activeTurn.traceId
                    ? 'the service returned no trace id, so this turn cannot be matched to AgentPulse telemetry.'
                    : 'no evaluation for the answerer span arrived within 30 s. Check that the evaluation worker is running.'}
                </div>
              )}

              {activeTurn.groundingStatus === 'evaluated' && (
                <div className={`p-2.5 rounded ${theme.codeBg} border ${theme.codeBorder} text-[11px] ${theme.subtextColor} leading-relaxed`}>
                  A risk score: 0.0 is fully supported by the retrieved text, 1.0 is not supported. A
                  stage 2 score comes from the NLI model; stage 1 is a similarity-only fallback.
                </div>
              )}
            </div>
          ) : (
            <div className={`py-8 text-center ${theme.subtextColor} text-[11px]`}>
              No conversation turns recorded yet. Send a query in the chat stream to start trace evaluation.
            </div>
          )}

          {/* Trace history table */}
          {turns.length > 1 && (
            <div className={`mt-4 pt-3 border-t ${theme.divider}`}>
              <div className={`text-[10px] uppercase font-semibold ${theme.subtextColor} mb-2`}>
                Session Trace Grounding Log ({turns.length} turns)
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {turns.map((t, idx) => {
                  const isSelected = t.traceId === selectedTraceId || (t === activeTurn && !selectedTraceId);
                  return (
                    <button
                      key={t.id}
                      onClick={() => t.traceId && onSelectTrace(t.traceId)}
                      className={`w-full text-left p-2 rounded flex items-center justify-between text-[11px] border transition-colors ${
                        isSelected
                          ? `${theme.cardActiveBorder} ${theme.cardBg} ${theme.textColor}`
                          : `${theme.codeBg} border-transparent ${theme.subtextColor} hover:${theme.textColor}`
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`text-[10px] ${theme.subtextColor} font-mono`}>#{idx + 1}</span>
                        <span className={`font-mono ${theme.accentText} truncate w-24`}>
                          {t.traceId?.substring(0, 8) || 'no-trace'}
                        </span>
                        <span className={`truncate max-w-[160px] ${theme.textColor}`}>{t.userMessage}</span>
                      </div>

                      <div>
                        {t.groundingStatus === 'evaluated' && t.groundingScore != null ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${riskTextClasses(
                              t.groundingScore
                            )}`}
                          >
                            {t.groundingScore.toFixed(2)}
                          </span>
                        ) : t.groundingStatus === 'pending' ? (
                          <span className="text-[10px] text-amber-400 font-mono">PENDING</span>
                        ) : (
                          <span className={`text-[10px] ${theme.subtextColor}`}>—</span>
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

        {/* Drift Panel — The Crucial Component */}
        <div className={`p-4 rounded-xl ${theme.cardBg} border ${theme.cardBorder} relative`}>
          <div className={`flex items-center justify-between pb-2 border-b ${theme.divider}`}>
            <div className="flex items-center gap-2">
              <BarChart3 className={`w-4 h-4 ${theme.accentText}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.textColor}`}>
                Behavioural Drift Verification (32-Span Window)
              </span>
            </div>

            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${theme.codeBg} ${theme.subtextColor} border ${theme.cardBorder}`}>
              Target: {DRIFT_WINDOW_TARGET} spans / agent
            </span>
          </div>

          <div className="mt-3 space-y-4">
            {/* Context rationale */}
            <p className={`${theme.subtextColor} text-[11px] leading-relaxed`}>
              Drift needs a <strong className={theme.textColor}>32-span window</strong> per agent (20 baseline
              plus 12 current), so a script that sends 5 calls never reaches it and the value stays
              unavailable, not zero. Span counts and drift below are read from AgentPulse
              (<code>/v1/agents</code>, <code>/v1/drift</code>); nothing is counted or computed in this page.
            </p>

            {/* Agent Window Progress Bars */}
            <div className="space-y-3">
              {(['answerer', 'verifier', 'retriever'] as PipelineAgent[]).map((name) => {
                const count = agentSpansCount[name];
                const drift = agentDrift[name]?.windowDistance ?? null;
                const asi = agentDrift[name]?.asi ?? null;
                const isMeasured = drift != null;
                const hasEnoughSpans = count >= DRIFT_WINDOW_TARGET;
                const pct = Math.min(100, Math.round((count / DRIFT_WINDOW_TARGET) * 100));

                return (
                  <div key={name} className={`p-2.5 rounded-lg ${theme.codeBg} border ${theme.codeBorder}`}>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={`font-semibold ${theme.textColor} capitalize flex items-center gap-1.5`}>
                        <span>{name}</span>
                        {isMeasured && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${theme.accentText} font-semibold`}>
                          {count} / {DRIFT_WINDOW_TARGET} spans
                        </span>
                        <span className={`text-[10px] ${theme.subtextColor}`}>({pct}%)</span>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className={`w-full h-2 rounded-full ${theme.inputBg} overflow-hidden border ${theme.codeBorder}`}>
                      <div
                        className={`h-full transition-all duration-300 ${
                          isMeasured
                            ? 'bg-emerald-500'
                            : palette === 'butter'
                            ? 'bg-amber-400'
                            : palette === 'chalk'
                            ? 'bg-cyan-600'
                            : isCalmMode
                            ? 'bg-zinc-300'
                            : 'bg-cyan-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Window Status / Drift Value */}
                    <div className="mt-2 text-[10px] flex items-center justify-between">
                      {isMeasured ? (
                        <>
                          <span className="text-emerald-400 font-semibold">
                            DRIFT MEASURED BY AGENTPULSE
                          </span>
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
                            drift: <strong className={`${theme.subtextColor} font-normal`}>not available</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Honest Value Rule Callout */}
            <div className={`p-3 rounded-lg ${theme.codeBg} border ${theme.codeBorder} text-[11px] ${theme.subtextColor} space-y-1 leading-relaxed`}>
              <div className={`flex items-center gap-1.5 font-semibold ${theme.textColor}`}>
                <HelpCircle className={`w-3.5 h-3.5 ${theme.accentText}`} />
                <span>Operational Invariant: Zero Placeholder Ban</span>
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
