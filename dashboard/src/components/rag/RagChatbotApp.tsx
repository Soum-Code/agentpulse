import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Server,
  BookOpen,
  Settings,
  Terminal,
  ExternalLink,
  ShieldAlert,
  Sliders,
  Sparkles,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Bot,
  TrendingDown,
} from 'lucide-react';
import { ChatConsole } from './ChatConsole';
import { MonitoringPanel } from './MonitoringPanel';
import { CorpusModal } from './CorpusModal';
import { ConnectionModal } from './ConnectionModal';
import { ragApi } from '../../lib/ragApi';
import { api, EvaluatorReadiness, Agent as ApiAgent } from '../../lib/api';
import type { ChatTurn, PipelineAgent, AgentDriftReading, ChatHealth, ChatStreamEvent, TurnProgress } from '../../lib/ragTypes';
import type { ProductTab, ColorPalette, ChalkSurfacePreset } from '../../types';
import { getRagTheme } from './ragTheme';
import { RagErrorBoundary } from './RagErrorBoundary';

interface RagChatbotAppProps {
  onOpenConsole?: () => void;
  onSelectTab?: (tab: ProductTab) => void;
  embedded?: boolean;
  onToggleFullscreen?: () => void;
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

const PIPELINE_AGENTS: PipelineAgent[] = ['retriever', 'verifier', 'answerer'];

function generateSessionId(): string {
  return 'sess_' + Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6);
}

// In short: the chat view inside an error boundary, so a rendering error shows a sentence
// and a reload button rather than a blank page. Both places App.tsx shows it get this.
export const RagChatbotApp: React.FC<RagChatbotAppProps> = (props) => (
  <RagErrorBoundary>
    <RagChatbotView {...props} />
  </RagErrorBoundary>
);

const RagChatbotView: React.FC<RagChatbotAppProps> = ({
  onOpenConsole,
  onSelectTab,
  embedded = false,
  onToggleFullscreen,
  palette = 'dark',
  isCalmMode = false,
  chalkSurface = 'classic-white',
}) => {
  const theme = getRagTheme(palette, isCalmMode, chalkSurface);

  // Session & Chat State
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | undefined>(undefined);

  // In-Flight Execution State
  const [isInFlight, setIsInFlight] = useState(false);
  const [inFlightElapsedSeconds, setInFlightElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Connection & Health State
  const [ragStatus, setRagStatus] = useState<{ ok: boolean; status: string; message?: string }>({ ok: false, status: 'checking' });
  // What the chat service says about itself: its limits and providers. Null until it answers.
  const [chatHealth, setChatHealth] = useState<ChatHealth | null>(null);
  const [evaluatorReadiness, setEvaluatorReadiness] = useState<EvaluatorReadiness | null>(null);
  const [evaluatorLoading, setEvaluatorLoading] = useState(false);
  const [apiAgents, setApiAgents] = useState<ApiAgent[]>([]);

  // What AgentPulse itself reports for the three agents: span totals from /v1/agents and
  // drift from /v1/drift. Both are read back from the backend on every refresh; nothing
  // is counted or computed in the browser.
  const [agentSpansCount, setAgentSpansCount] = useState<Record<PipelineAgent, number>>({
    answerer: 0,
    verifier: 0,
    retriever: 0,
  });

  const [agentDrift, setAgentDrift] = useState<Partial<Record<PipelineAgent, AgentDriftReading>>>({});

  // Modals
  const [isCorpusOpen, setIsCorpusOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  // null means the service did not answer; an empty list would claim an empty corpus.
  const [corpusDocs, setCorpusDocs] = useState<string[] | null>(null);

  // Endpoint configuration
  const [ragUrl, setRagUrl] = useState(() => ragApi.getBaseUrl());
  const [agentPulseUrl, setAgentPulseUrl] = useState(() => import.meta.env.VITE_API_URL || '');
  const [apiKey, setApiKey] = useState(() => import.meta.env.VITE_API_KEY || '');

  // 1. Initial health checks
  const checkHealth = useCallback(async () => {
    // The chat service: ready, or why not (paused, starting up, unreachable).
    const ragHealth = await ragApi.checkHealth();
    setRagStatus({ ok: ragHealth.ok, status: ragHealth.status, message: ragHealth.message });
    setChatHealth(ragHealth.health ?? null);

    // Fetch Corpus
    try {
      setCorpusDocs((await ragApi.getCorpus()).documents ?? []);
    } catch {
      setCorpusDocs(null);
    }

    // Check AgentPulse Evaluator Readiness (:8000)
    setEvaluatorLoading(true);
    try {
      const evalReady = await api.getEvaluatorReadiness();
      setEvaluatorReadiness(evalReady);
    } catch {
      setEvaluatorReadiness({
        ready: false,
        workers_alive: 0,
        workers_registered: 0,
        workers_stale: 0,
        degraded: true,
        reasons: ['Unable to reach AgentPulse API on /v1/health/evaluator'],
      });
    } finally {
      setEvaluatorLoading(false);
    }

    // What AgentPulse has recorded for the three pipeline agents. On failure the last
    // values read from it stay on screen; the evaluator badge already shows the outage.
    const [agentsRes, driftRes] = await Promise.allSettled([api.getAgents(), api.getDrift()]);
    if (agentsRes.status === 'fulfilled') {
      const agents = agentsRes.value.agents ?? [];
      setApiAgents(agents);
      const spansOf = (id: PipelineAgent) => agents.find((a) => a.agent_id === id)?.total_spans ?? 0;
      setAgentSpansCount({
        retriever: spansOf('retriever'),
        verifier: spansOf('verifier'),
        answerer: spansOf('answerer'),
      });
    }
    if (driftRes.status === 'fulfilled') {
      const next: Partial<Record<PipelineAgent, AgentDriftReading>> = {};
      for (const row of driftRes.value.agents ?? []) {
        const id = PIPELINE_AGENTS.find((p) => p === row.agent_id);
        if (id) {
          next[id] = {
            windowDistance: row.latest_window_centroid_distance ?? null,
            asi: row.current_asi ?? null,
          };
        }
      }
      setAgentDrift(next);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // While the chat service is not ready (starting up, restarting, paused), ask only it again
  // every 5 s, so the page turns usable soon after a cold start instead of up to 20 s later.
  useEffect(() => {
    if (ragStatus.ok) return;
    const interval = setInterval(async () => {
      const ragHealth = await ragApi.checkHealth();
      setRagStatus({ ok: ragHealth.ok, status: ragHealth.status, message: ragHealth.message });
      setChatHealth(ragHealth.health ?? null);
    }, 5000);
    return () => clearInterval(interval);
  }, [ragStatus.ok]);

  // 2. Poll AgentPulse for Async Grounding Evaluation of a Trace
  const pollTraceEvaluation = useCallback(async (traceId: string, turnId: string) => {
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds

    const poll = async () => {
      attempts++;
      try {
        const fullTrace = await api.getTrace(traceId);
        // Only the answerer's own span. Another agent's score, or the last span's, is
        // not a score for this answer.
        const answererSpan = (fullTrace.spans ?? []).find((s) => s.agent_id === 'answerer');

        if (answererSpan && answererSpan.evaluation && answererSpan.evaluation.grounding_score != null) {
          // Evaluation completed!
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    groundingScore: answererSpan.evaluation?.grounding_score,
                    groundingStatus: 'evaluated',
                    groundingLabel: answererSpan.evaluation?.label,
                    groundingEvaluationStage: answererSpan.evaluation?.evaluation_stage,
                  }
                : t
            )
          );
          // The evaluation also writes the drift record; read it back.
          checkHealth();
          return;
        }
      } catch {
        // Still pending
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        // No score arrived in time. Say so; never fill one in.
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId && t.groundingStatus === 'pending'
              ? { ...t, groundingStatus: 'unmeasured' }
              : t
          )
        );
      }
    };

    setTimeout(poll, 1500);
  }, [checkHealth]);

  // 3. Send Message Handler
  const handleSendMessage = async (message: string) => {
    if (isInFlight) return;

    const turnId = 'turn_' + Date.now();
    const newTurn: ChatTurn = {
      id: turnId,
      timestamp: new Date().toISOString(),
      userMessage: message,
      status: 'running',
      groundingStatus: 'pending',
    };

    setTurns((prev) => [...prev, newTurn]);
    setIsInFlight(true);
    setInFlightElapsedSeconds(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = Date.now();
    timerIntervalRef.current = window.setInterval(() => {
      setInFlightElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 500);

    // Each stream event updates the running turn, so the page shows every stage as it
    // finishes. Only what the service reported is shown; nothing is estimated.
    const applyEvent = (event: ChatStreamEvent) => {
      setTurns((prev) =>
        prev.map((t) => {
          if (t.id !== turnId) return t;
          const progress: TurnProgress = t.progress ?? { done: [] };
          switch (event.type) {
            case 'start':
              return { ...t, progress: { ...progress, traceId: event.trace_id } };
            case 'retrieved':
              return { ...t, progress: { ...progress, retrieved: event.retrieved, searchMs: event.search_ms } };
            case 'agent_start':
              return { ...t, progress: { ...progress, running: event.agent } };
            case 'agent_done': {
              const { type: _type, ...agent } = event;
              return { ...t, progress: { ...progress, running: undefined, done: [...progress.done, agent] } };
            }
            default:
              return t;
          }
        })
      );
    };

    try {
      const response = await ragApi.sendChatStream(message, sessionId, applyEvent, controller.signal);

      // Turn finished
      const isError = Boolean(response.error);
      // No trace id means this turn cannot be matched to AgentPulse telemetry. It stays
      // without one and is shown as unmeasured; an id made up here would link nothing.
      const traceId = response.trace_id || undefined;
      const canMeasure = !isError && traceId !== undefined;

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                response,
                status: isError ? 'error' : 'completed',
                errorMessage: response.error,
                traceId,
                groundingStatus: canMeasure ? 'pending' : 'unmeasured',
              }
            : t
        )
      );

      if (traceId) setSelectedTraceId(traceId);

      // Span totals and drift are AgentPulse's to report: read them back.
      checkHealth();

      // Start async evaluation polling
      if (canMeasure) {
        pollTraceEvaluation(traceId, turnId);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  status: 'error',
                  errorMessage: 'Turn aborted by user.',
                  groundingStatus: 'unmeasured',
                }
              : t
          )
        );
      } else {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  status: 'error',
                  errorMessage: err?.message || `Failed to reach the chat service at ${ragApi.getBaseUrl() || "this site's /chat"}`,
                  groundingStatus: 'unmeasured',
                }
              : t
          )
        );
      }
    } finally {
      setIsInFlight(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      abortControllerRef.current = null;
    }
  };

  const handleCancelInFlight = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleResetSession = () => {
    setSessionId(generateSessionId());
    setTurns([]);
    setSelectedTraceId(undefined);
  };

  return (
    // In the Butter palette the RAG console is a dark amber surface (ragTheme.ts) inside a light page.
    // data-keep-white tells the light-palette rules in index.css to keep light text on it, instead of
    // recolouring the amber text dark (dark on dark).
    <div data-keep-white={palette === 'butter' ? 'true' : undefined} className={`flex flex-col ${embedded ? 'h-full w-full' : 'h-screen w-screen'} ${theme.containerBg} ${theme.textColor} font-mono overflow-hidden transition-colors duration-200`}>
      {/* Primary Top Header */}
      <header className={`flex items-center justify-between px-3 sm:px-4 py-2 border-b ${theme.headerBorder} ${theme.headerBg} shrink-0 transition-colors`}>
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {/* Back to Console Button when not embedded */}
          {!embedded && onOpenConsole && (
            <button
              onClick={onOpenConsole}
              className={`px-2.5 py-1 rounded-lg ${theme.cardBg} border ${theme.cardBorder} ${theme.textColor} text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0`}
              title="Return to AgentPulse Console (Overview & Traces)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Console</span>
            </button>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 phosphor-cyan animate-pulse" />
            <h1 className={`text-sm font-bold tracking-tight ${theme.textColor} uppercase`}>
              AgentPulse
            </h1>
            <span className={`text-[10px] px-2 py-0.5 rounded ${theme.codeBg} border ${theme.codeBorder} ${theme.accentText} font-semibold uppercase tracking-wider`}>
              RAG Live Monitor
            </span>
          </div>

          {/* Quick tab jumps when onSelectTab is provided */}
          {onSelectTab && (
            <div className={`hidden xl:flex items-center gap-1.5 pl-3 border-l ${theme.divider} text-xs`}>
              <span className={`${theme.subtextColor} text-[11px]`}>Jump to:</span>
              <button
                onClick={() => onSelectTab('overview')}
                className={`px-2 py-0.5 rounded hover:${theme.cardBg} ${theme.subtextColor} hover:${theme.textColor} transition-colors`}
              >
                Overview
              </button>
              <button
                onClick={() => onSelectTab('traces')}
                className={`px-2 py-0.5 rounded hover:${theme.cardBg} ${theme.subtextColor} hover:${theme.textColor} transition-colors flex items-center gap-1`}
              >
                <Activity className="w-3 h-3 text-emerald-400" />
                <span>Traces</span>
              </button>
              <button
                onClick={() => onSelectTab('agents')}
                className={`px-2 py-0.5 rounded hover:${theme.cardBg} ${theme.subtextColor} hover:${theme.textColor} transition-colors flex items-center gap-1`}
              >
                <Bot className={`w-3 h-3 ${theme.accentText}`} />
                <span>Agents</span>
              </button>
              <button
                onClick={() => onSelectTab('drift')}
                className={`px-2 py-0.5 rounded hover:${theme.cardBg} ${theme.subtextColor} hover:${theme.textColor} transition-colors flex items-center gap-1`}
              >
                <TrendingDown className="w-3 h-3 text-amber-400" />
                <span>Drift</span>
              </button>
            </div>
          )}

          <div className={`hidden 2xl:flex items-center gap-2 pl-3 border-l ${theme.divider} text-[11px] ${theme.subtextColor} truncate`}>
            <span>Test:</span>
            <span className={`${theme.subtextColor} italic font-sans truncate`}>
              &ldquo;Is AgentPulse actually monitoring a live conversation, or does it only look like it is?&rdquo;
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Corpus Button */}
          <button
            onClick={() => setIsCorpusOpen(true)}
            className={`px-2.5 py-1 rounded-lg ${theme.cardBg} border ${theme.cardBorder} hover:${theme.cardActiveBorder} text-xs ${theme.textColor} transition-colors flex items-center gap-1.5`}
            title="View the documents the RAG service can retrieve from"
          >
            <BookOpen className={`w-3.5 h-3.5 ${theme.accentText}`} />
            <span className="hidden sm:inline">Corpus ({corpusDocs ? corpusDocs.length : '—'})</span>
            <span className="sm:hidden">Docs</span>
          </button>

          {/* Endpoints Settings Button */}
          <button
            onClick={() => setIsConnectionOpen(true)}
            className={`px-2.5 py-1 rounded-lg ${theme.cardBg} border ${theme.cardBorder} hover:${theme.cardActiveBorder} text-xs ${theme.textColor} transition-colors flex items-center gap-1.5`}
            title="Configure RAG and AgentPulse endpoints"
          >
            <Server className={`w-3.5 h-3.5 ${theme.accentText}`} />
            <span className="hidden sm:inline">Endpoints</span>
          </button>

          {/* Toggle Fullscreen / Console */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className={`p-1.5 rounded-lg ${theme.cardBg} border ${theme.cardBorder} hover:${theme.cardActiveBorder} ${theme.textColor} text-xs transition-colors`}
              title="Toggle Fullscreen"
            >
              {embedded ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Switch to Full Observability Console button */}
          {!embedded && onOpenConsole && (
            <button
              onClick={onOpenConsole}
              className={`px-3 py-1 rounded-lg ${theme.accentBg} border ${theme.accentBorder} ${theme.accentText} text-xs font-semibold transition-colors flex items-center gap-1.5`}
              title="Open the full AgentPulse Observability Console"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Full Console</span>
              <ExternalLink className={`w-3 h-3 ${theme.accentText}`} />
            </button>
          )}
        </div>
      </header>

      {/* Main Split Screen Layout */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: Chat Stream (~55%) */}
        <div className="w-full md:w-[55%] h-full flex flex-col min-h-0">
          <ChatConsole
            turns={turns}
            onSendMessage={handleSendMessage}
            onCancelInFlight={handleCancelInFlight}
            isInFlight={isInFlight}
            inFlightElapsedSeconds={inFlightElapsedSeconds}
            selectedTraceId={selectedTraceId}
            onSelectTrace={(tId) => setSelectedTraceId(tId)}
            sessionId={sessionId}
            onResetSession={handleResetSession}
            onRetry={handleSendMessage}
            chatStatus={ragStatus}
            chatHealth={chatHealth}
            chatTarget={ragUrl ? `${ragUrl}/chat` : '/chat (this site)'}
            palette={palette}
            isCalmMode={isCalmMode}
            chalkSurface={chalkSurface}
          />
        </div>

        {/* Right: Monitoring & Drift Panel (~45%) */}
        <div className={`w-full md:w-[45%] h-full flex flex-col min-h-0 ${theme.containerBg}`}>
          <MonitoringPanel
            evaluatorReadiness={evaluatorReadiness}
            evaluatorLoading={evaluatorLoading}
            onRefreshEvaluator={checkHealth}
            turns={turns}
            selectedTraceId={selectedTraceId}
            onSelectTrace={(tId) => setSelectedTraceId(tId)}
            agentSpansCount={agentSpansCount}
            agentDrift={agentDrift}
            apiAgents={apiAgents}
            palette={palette}
            isCalmMode={isCalmMode}
            chalkSurface={chalkSurface}
          />
        </div>
      </main>

      {/* Modals */}
      <CorpusModal
        isOpen={isCorpusOpen}
        onClose={() => setIsCorpusOpen(false)}
        documents={corpusDocs ?? []}
        palette={palette}
        isCalmMode={isCalmMode}
        chalkSurface={chalkSurface}
      />

      <ConnectionModal
        isOpen={isConnectionOpen}
        onClose={() => setIsConnectionOpen(false)}
        ragUrl={ragUrl}
        onSaveRagUrl={(url) => {
          setRagUrl(url);
          ragApi.setBaseUrl(url);
          checkHealth();
        }}
        agentPulseUrl={agentPulseUrl}
        onSaveAgentPulseUrl={(url) => {
          setAgentPulseUrl(url);
          checkHealth();
        }}
        apiKey={apiKey}
        onSaveApiKey={(key) => {
          setApiKey(key);
          checkHealth();
        }}
        ragStatus={ragStatus}
        evaluatorStatus={{
          ready: evaluatorReadiness?.ready ?? false,
          workers_alive: evaluatorReadiness?.workers_alive ?? 0,
        }}
        palette={palette}
        isCalmMode={isCalmMode}
        chalkSurface={chalkSurface}
      />
    </div>
  );
};
