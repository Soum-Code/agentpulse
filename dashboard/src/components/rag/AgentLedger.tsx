import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import { api, AlertItem, SpanDetail } from '../../lib/api';
import { API_START_HINT, Feed, datum, feedFromError } from '../../lib/stateModel';
import { allEvaluated, alertsReading, spanToLedgerRow } from '../../lib/ragLedger';
import { verdictBadgeClasses, verdictLabel, verdictTooltip } from '../../lib/riskTone';
import { DatumDisplay } from './DatumDisplay';
import type { getRagTheme } from './ragTheme';

type RagTheme = ReturnType<typeof getRagTheme>;

interface AgentLedgerProps {
  /** The chat turn's trace. Without one there is nothing to read. */
  traceId?: string;
  theme: RagTheme;
}

const POLL_MS = 3000;
// The evaluator runs on a worker after ingestion, so scores arrive late. Poll every 3 s for about a minute
// (MAX_POLLS); after that a span without an evaluation reads "unmeasured", and the ledger keeps asking every
// 15 s for SLOW_POLLS more tries (about 5 minutes) in case a cold worker is only slow. The Refresh button asks
// again at any time.
const MAX_POLLS = 20;
const SLOW_POLL_MS = 15000;
const SLOW_POLLS = 20;

/**
 * The owner's "agent ledger" for the selected chat turn: one row per span (retriever, verifier,
 * answerer) with its model, latency, tokens, grounding risk, evaluation stage and verdict, and the
 * evidence the evaluator compared against the claim it judged. Beneath it, the alerts raised on the
 * trace.
 *
 * Everything is read from GET /v1/traces/{id} and shown through DatumDisplay, so a span that has not
 * been scored yet is "pending", one the evaluator did not score is "unmeasured" with the reason, and
 * an unreachable API says so. Scores are RISKS: 0 is safe, 1 is risky (riskTone.ts).
 *
 * Two rules from the review: (1) a failed poll never throws away the rows already on screen and never
 * stops the polling (a network blip used to freeze the ledger on 'Unreachable'); (2) "None raised." is
 * printed only when every span has been scored. Before that the honest answer is "unknown".
 */
export const AgentLedger: React.FC<AgentLedgerProps> = ({ traceId, theme }) => {
  const [spans, setSpans] = useState<SpanDetail[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [feed, setFeed] = useState<Feed>({ status: 'pending' });
  const [settled, setSettled] = useState(false);
  // Bumped by the Refresh button to start the polling over.
  const [reload, setReload] = useState(0);

  // Read the trace now and again until every span is scored or the (long) wait runs out.
  useEffect(() => {
    setSpans([]);
    setAlerts([]);
    setFeed({ status: 'pending' });
    setSettled(false);
    if (!traceId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async (attempt: number) => {
      try {
        const detail = await api.getTrace(traceId);
        if (cancelled) return;
        setSpans(detail.spans);
        setAlerts(detail.alerts);
        setFeed({ status: 'ready' });
        if (allEvaluated(detail.spans)) {
          setSettled(true);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        // Keep whatever rows are already shown; a 404 (trace not ingested yet), a blip and a 500 all retry.
        setFeed(feedFromError(err));
      }
      // The fast wait is over: unscored spans now read "unmeasured" (settled), but keep asking, slowly.
      if (attempt >= MAX_POLLS) setSettled(true);
      if (attempt >= MAX_POLLS + SLOW_POLLS) return;
      timer = setTimeout(() => load(attempt + 1), attempt >= MAX_POLLS ? SLOW_POLL_MS : POLL_MS);
    };
    load(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [traceId, reload]);

  const rows = spans.map((s) => spanToLedgerRow(s, settled));
  const everyScored = allEvaluated(spans);
  const alertsNow = alertsReading(alerts.length, spans, settled);
  const failing = feed.status === 'unreachable' || feed.status === 'error';

  return (
    // In short: the same 16 px card and sentence-case title as the other monitor cards.
    <div className={`p-4 rounded-2xl border ${theme.cardBg}`}>
      <div className={`flex items-center justify-between gap-2 pb-2.5 border-b ${theme.divider}`}>
        <div className="flex items-center gap-2">
          <Layers className={`w-4 h-4 ${theme.accentText}`} aria-hidden="true" />
          <h3 className={`text-[13px] font-semibold tracking-tight ${theme.textColor}`}>Agent ledger (this turn)</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${theme.subtextColor} font-mono`}>risk: 0 safe · 1 risky</span>
          {traceId && (
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              title="Read the trace again"
              aria-label="Refresh the agent ledger"
              className="rag-chip p-1.5"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!traceId ? (
        <div className={`py-6 text-center ${theme.subtextColor} text-[12px]`}>
          Send a message: each agent's span appears here once AgentPulse has ingested it.
        </div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-[12px] font-mono">
          <DatumDisplay
            datum={
              feed.status === 'pending' || feed.status === 'ready'
                ? datum.pending('Waiting for the trace to be ingested')
                : feed.status === 'unreachable'
                ? datum.unreachable('AgentPulse API', API_START_HINT)
                : datum.error(feed.message || 'The API answered with an error')
            }
          />
          {failing && <span className={`ml-2 ${theme.subtextColor}`}>Retrying; or press Refresh.</span>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* The rows stay on screen when a later read fails; this says the numbers may be old. */}
          {failing && (
            <div role="status" className="text-[12px] font-mono rag-err-text">
              Could not refresh ({feed.message ?? 'no answer'}); showing the last rows read. Retrying.
            </div>
          )}
          {rows.map((row) => {
            const label = verdictLabel(row.verdict);
            return (
              <div key={row.spanId} className={`p-3 rounded-xl ${theme.codeBg} space-y-2`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono">
                  <span className={`font-semibold ${theme.textColor} capitalize font-sans`}>{row.role}</span>
                  <span className={`${theme.subtextColor} flex items-center gap-3`}>
                    {row.model && <span>{row.model}</span>}
                    <DatumDisplay datum={row.latencyMs} format="latency" />
                    <span className="flex items-center gap-1">
                      <DatumDisplay datum={row.tokens} format="count" /> tok
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className={theme.subtextColor}>Grounding</span>
                  <DatumDisplay datum={row.groundingRisk} format="risk" />
                  <DatumDisplay datum={row.stage} format="stage" />
                  {label && (
                    <span
                      title={verdictTooltip(row.verdict) ?? undefined}
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-mono uppercase ${verdictBadgeClasses(row.verdict)}`}
                    >
                      {label}
                    </span>
                  )}
                  {row.toolClaimRisk.status !== 'unmeasured' && (
                    <>
                      <span className={theme.subtextColor}>Tool claim</span>
                      <DatumDisplay datum={row.toolClaimRisk} format="risk" />
                    </>
                  )}
                </div>

                {(row.evidence || row.claim) && (
                  <details className="text-[12px]">
                    <summary className={`cursor-pointer rounded-md ${theme.subtextColor}`}>Evidence and claim the evaluator compared</summary>
                    <div className="mt-1.5 grid gap-1.5">
                      {row.evidence && (
                        <p className={theme.textColor}>
                          <b>Evidence (input): </b>
                          {row.evidence.slice(0, 400)}
                        </p>
                      )}
                      {row.claim && (
                        <p className={theme.textColor}>
                          <b>Claim (output): </b>
                          {row.claim.slice(0, 400)}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}

          <div className={`pt-2.5 border-t ${theme.divider} text-[12px]`}>
            <div className={`font-medium text-[11px] ${theme.subtextColor} mb-1`}>Alerts on this trace</div>
            {alertsNow === 'list' ? (
              <ul className="space-y-1">
                {alerts.map((a) => (
                  <li key={a.id} className={`${theme.textColor}`}>
                    <b>{a.alert_type.replace(/_/g, ' ')}</b> <span className={theme.subtextColor}>({a.severity})</span>: {a.message}
                    {!everyScored && ' (more may follow once evaluation finishes)'}
                  </li>
                ))}
              </ul>
            ) : alertsNow === 'none' ? (
              <span className={theme.subtextColor}>None raised.</span>
            ) : (
              // Not scored yet (or the wait ran out): "none" would read as "the evaluator found nothing".
              <span className={theme.subtextColor}>
                {alertsNow === 'unknown-timeout'
                  ? 'Unknown: evaluation did not finish, so any alert it would raise has not been seen. Press Refresh to check again.'
                  : 'Unknown so far: evaluation is still running.'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
