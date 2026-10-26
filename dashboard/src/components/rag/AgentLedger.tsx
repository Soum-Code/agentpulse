import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { api, AlertItem, SpanDetail } from '../../lib/api';
import { Feed, datum, feedFromError } from '../../lib/stateModel';
import { allEvaluated, spanToLedgerRow } from '../../lib/ragLedger';
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
// The evaluator runs on a worker after ingestion, so scores arrive late. Wait this many polls
// (about a minute) for them; after that a span without an evaluation reads "unmeasured".
const MAX_POLLS = 20;

/**
 * The owner's "agent ledger" for the selected chat turn: one row per span (retriever, verifier,
 * answerer) with its model, latency, tokens, grounding risk, evaluation stage and verdict, and the
 * evidence the evaluator compared against the claim it judged. Beneath it, the alerts raised on the
 * trace.
 *
 * Everything is read from GET /v1/traces/{id} and shown through DatumDisplay, so a span that has not
 * been scored yet is "pending", one the evaluator did not score is "unmeasured" with the reason, and
 * an unreachable API says so. Scores are RISKS: 0 is safe, 1 is risky (riskTone.ts).
 */
export const AgentLedger: React.FC<AgentLedgerProps> = ({ traceId, theme }) => {
  const [spans, setSpans] = useState<SpanDetail[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [feed, setFeed] = useState<Feed>({ status: 'pending' });
  const [settled, setSettled] = useState(false);

  // Read the trace now and again every POLL_MS until every span is scored or the wait runs out.
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
        if (allEvaluated(detail.spans) || attempt >= MAX_POLLS) {
          setSettled(true);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setFeed(feedFromError(err));
        // A trace that does not exist yet (404) is retried like an unscored one; anything else stops.
        if ((err as { status?: number }).status !== 404) {
          setSettled(true);
          return;
        }
        if (attempt >= MAX_POLLS) {
          setSettled(true);
          return;
        }
      }
      timer = setTimeout(() => load(attempt + 1), POLL_MS);
    };
    load(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [traceId]);

  const rows = spans.map((s) => spanToLedgerRow(s, settled));

  return (
    <div className={`p-4 rounded-xl ${theme.cardBg} border ${theme.cardBorder} relative`}>
      <div className={`flex items-center justify-between pb-2 border-b ${theme.divider}`}>
        <div className="flex items-center gap-2">
          <Layers className={`w-4 h-4 ${theme.accentText}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.textColor}`}>
            Agent Ledger (this turn)
          </span>
        </div>
        <span className={`text-[10px] ${theme.subtextColor} font-mono`}>risk: 0 safe · 1 risky</span>
      </div>

      {!traceId ? (
        <div className={`py-6 text-center ${theme.subtextColor} text-[11px]`}>
          Send a message: each agent's span appears here once AgentPulse has ingested it.
        </div>
      ) : feed.status !== 'ready' ? (
        <div className="py-4 text-[11px] font-mono">
          <DatumDisplay
            datum={
              feed.status === 'pending'
                ? datum.pending('Waiting for the trace to be ingested')
                : feed.status === 'unreachable'
                ? datum.unreachable('AgentPulse API', 'python -m uvicorn app.main:app --app-dir backend')
                : datum.error(feed.message || 'The API answered with an error')
            }
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row) => {
            const label = verdictLabel(row.verdict);
            return (
              <div key={row.spanId} className={`p-3 rounded-lg ${theme.codeBg} border ${theme.codeBorder} space-y-2`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <span className={`font-semibold ${theme.textColor} uppercase`}>{row.role}</span>
                  <span className={`${theme.subtextColor} flex items-center gap-3`}>
                    {row.model && <span>{row.model}</span>}
                    <DatumDisplay datum={row.latencyMs} format="latency" />
                    <span className="flex items-center gap-1">
                      <DatumDisplay datum={row.tokens} format="count" /> tok
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={theme.subtextColor}>Grounding</span>
                  <DatumDisplay datum={row.groundingRisk} format="risk" />
                  <DatumDisplay datum={row.stage} format="stage" />
                  {label && (
                    <span
                      title={verdictTooltip(row.verdict) ?? undefined}
                      className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${verdictBadgeClasses(row.verdict)}`}
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
                  <details className="text-[11px]">
                    <summary className={`cursor-pointer ${theme.subtextColor}`}>Evidence and claim the evaluator compared</summary>
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

          <div className={`pt-2 border-t ${theme.divider} text-[11px]`}>
            <div className={`uppercase font-semibold text-[10px] ${theme.subtextColor} mb-1`}>Alerts on this trace</div>
            {alerts.length === 0 ? (
              <span className={theme.subtextColor}>{settled ? 'None raised.' : 'None so far (evaluation still running).'}</span>
            ) : (
              <ul className="space-y-1">
                {alerts.map((a) => (
                  <li key={a.id} className={`${theme.textColor}`}>
                    <b>{a.alert_type.replace(/_/g, ' ')}</b> <span className={theme.subtextColor}>({a.severity})</span>: {a.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
