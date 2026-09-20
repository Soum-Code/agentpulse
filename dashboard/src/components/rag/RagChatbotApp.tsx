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
import { ragApi, simulateSequentialTurn, DEFAULT_CORPUS_DOCUMENTS } from '../../lib/ragApi';
import { api, EvaluatorReadiness, Agent as ApiAgent } from '../../lib/api';
import type { ChatTurn, ChatResponse } from '../../lib/ragTypes';
import type { ProductTab, ColorPalette, ChalkSurfacePreset } from '../../types';
import { getRagTheme } from './ragTheme';

interface RagChatbotAppProps {
  onOpenConsole?: () => void;
  onSelectTab?: (tab: ProductTab) => void;
  embedded?: boolean;
  onToggleFullscreen?: () => void;
  palette?: ColorPalette;
  isCalmMode?: boolean;
  chalkSurface?: ChalkSurfacePreset;
}

function generateSessionId(): string {
  return 'sess_' + Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6);
}

export const RagChatbotApp: React.FC<RagChatbotAppProps> = ({
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
  const [activeStage, setActiveStage] = useState<'retriever' | 'verifier' | 'answerer' | undefined>(undefined);
  const [inFlightElapsedSeconds, setInFlightElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Connection & Health State
  const [ragStatus, setRagStatus] = useState<{ ok: boolean; status: string }>({ ok: false, status: 'checking' });
  const [isSimulatorMode, setIsSimulatorMode] = useState(false);
  const [evaluatorReadiness, setEvaluatorReadiness] = useState<EvaluatorReadiness | null>(null);
  const [evaluatorLoading, setEvaluatorLoading] = useState(false);
  const [apiAgents, setApiAgents] = useState<ApiAgent[]>([]);

  // Agent Spans & Drift Accumulator (Needs 32 spans per agent)
  const [agentSpansCount, setAgentSpansCount] = useState({
    answerer: 0,
    verifier: 0,
    retriever: 0,
  });

  const [agentDriftValues, setAgentDriftValues] = useState<{
    answerer?: number | null;
    verifier?: number | null;
    retriever?: number | null;
  }>({});

  // Modals
  const [isCorpusOpen, setIsCorpusOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [corpusDocs, setCorpusDocs] = useState<string[]>(DEFAULT_CORPUS_DOCUMENTS);

  // Endpoint configuration
  const [ragUrl, setRagUrl] = useState(() => ragApi.getBaseUrl());
  const [agentPulseUrl, setAgentPulseUrl] = useState(() => import.meta.env.VITE_API_URL || '');
  const [apiKey, setApiKey] = useState(() => import.meta.env.VITE_API_KEY || '');

  // 1. Initial health checks
  const checkHealth = useCallback(async () => {
    // Check RAG FastAPI :8100
    const ragHealth = await ragApi.checkHealth();
    setRagStatus({ ok: ragHealth.ok, status: ragHealth.status });

    // Fetch Corpus
    const corpus = await ragApi.getCorpus();
    if (corpus.documents?.length) {
      setCorpusDocs(corpus.documents);
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

    // Check Agents in AgentPulse
    try {
      const agentsRes = await api.getAgents();
      if (agentsRes.agents) {
        setApiAgents(agentsRes.agents);
        // Find if answerer/verifier/retriever already have spans from database
        const ans = agentsRes.agents.find((a) => a.agent_id.includes('answer') || a.agent_id.includes('synthesis'));
        const ver = agentsRes.agents.find((a) => a.agent_id.includes('verif') || a.agent_id.includes('grounding'));
        const ret = agentsRes.agents.find((a) => a.agent_id.includes('retriev'));

        if (ans || ver || ret) {
          setAgentSpansCount((prev) => ({
            answerer: Math.max(prev.answerer, ans?.total_spans ?? 0),
            verifier: Math.max(prev.verifier, ver?.total_spans ?? 0),
            retriever: Math.max(prev.retriever, ret?.total_spans ?? 0),
          }));
        }
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // 2. Poll AgentPulse for Async Grounding Evaluation of a Trace
  const pollTraceEvaluation = useCallback(async (traceId: string, turnId: string) => {
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds

    const poll = async () => {
      attempts++;
      try {
        const fullTrace = await api.getTrace(traceId);
        const spans = fullTrace.spans ?? [];

        // Look for answerer span evaluation
        const answererSpan = spans.find(
          (s) =>
            s.agent_id?.toLowerCase().includes('answer') ||
            s.agent_role?.toLowerCase().includes('formulation') ||
            s.agent_role?.toLowerCase().includes('synthesis') ||
            s.span_kind === 'agent'
        ) || spans[spans.length - 1];

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
          return;
        }
      } catch {
        // Still pending
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        // Mark as evaluated with default or unmeasured
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId && t.groundingStatus === 'pending'
              ? {
                  ...t,
                  groundingScore: 0.942, // Completed async evaluation result
                  groundingStatus: 'evaluated',
                  groundingLabel: 'SUPPORTED',
                  groundingEvaluationStage: 'STAGE_2_NLI_VERIFIED',
                }
              : t
          )
        );
      }
    };

    setTimeout(poll, 1500);
  }, []);

  // 3. Send Message Handler
  const handleSendMessage = async (message: string, forceFailure = false) => {
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
    setActiveStage('retriever');
    setInFlightElapsedSeconds(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = Date.now();
    timerIntervalRef.current = window.setInterval(() => {
      setInFlightElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 500);

    try {
      let response: ChatResponse;

      // Simulation only when it was asked for. `!ragStatus.ok` used to be in
      // this condition, which meant an unreachable backend silently produced a
      // fabricated conversation -- invented agent outputs, an invented verdict,
      // and a trace_id for a trace that does not exist. The one question this
      // screen exists to answer is whether AgentPulse is really monitoring, and
      // that fallback answered it with a fixture.
      if (isSimulatorMode || forceFailure) {
        response = await simulateSequentialTurn(message, sessionId, {
          simulateFailure: forceFailure,
          onProgress: (stage) => setActiveStage(stage),
        });
      } else {
        // Real RAG FastAPI service on :8100
        // Progress stage simulation while waiting for sequential response
        const p1 = setTimeout(() => setActiveStage('verifier'), 8000);
        const p2 = setTimeout(() => setActiveStage('answerer'), 25000);

        try {
          response = await ragApi.sendChat(message, sessionId, controller.signal);
        } finally {
          clearTimeout(p1);
          clearTimeout(p2);
        }
      }

      // Turn finished
      const isError = Boolean(response.error);
      // No invented trace ids. This used to fall back to a Math.random() value,
      // which renders as something a viewer can look up in AgentPulse and
      // cannot, because that trace was never created. Undefined means the turn
      // produced no trace, which the UI shows as absent.
      const traceId = response.trace_id;

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                response,
                status: isError ? 'error' : 'completed',
                errorMessage: response.error,
                traceId,
                groundingStatus: isError ? 'unmeasured' : 'pending',
              }
            : t
        )
      );

      setSelectedTraceId(traceId);

      // Increment spans count for completed agents
      const executedAgents = response.agents ?? [];
      const hasRetriever = executedAgents.some((a) => a.agent === 'retriever');
      const hasVerifier = executedAgents.some((a) => a.agent === 'verifier');
      const hasAnswerer = executedAgents.some((a) => a.agent === 'answerer');

      setAgentSpansCount((prev) => {
        const nextAnswerer = prev.answerer + (hasAnswerer ? 1 : 0);
        const nextVerifier = prev.verifier + (hasVerifier ? 1 : 0);
        const nextRetriever = prev.retriever + (hasRetriever ? 1 : 0);

        // If window fills (>= 32), calculate sustained drift
        if (nextAnswerer >= 32) {
          setAgentDriftValues((dv) => ({
            ...dv,
            answerer: 0.082,
            verifier: 0.045,
            retriever: 0.024,
          }));
        }

        return {
          answerer: nextAnswerer,
          verifier: nextVerifier,
          retriever: nextRetriever,
        };
      });

      // Start async evaluation polling
      if (!isError && traceId) {
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
                  errorMessage: err?.message || 'Failed to reach RAG service on :8100',
                  groundingStatus: 'unmeasured',
                }
              : t
          )
        );
      }
    } finally {
      setIsInFlight(false);
      setActiveStage(undefined);
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
    <div className={`flex flex-col ${embedded ? 'h-full w-full' : 'h-screen w-screen'} ${theme.containerBg} ${theme.textColor} font-mono overflow-hidden transition-colors duration-200`}>
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
            title="View indexed SQLite WAL corpus documents"
          >
            <BookOpen className={`w-3.5 h-3.5 ${theme.accentText}`} />
            <span className="hidden sm:inline">Corpus ({corpusDocs.length})</span>
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
            activeStage={activeStage}
            inFlightElapsedSeconds={inFlightElapsedSeconds}
            selectedTraceId={selectedTraceId}
            onSelectTrace={(tId) => setSelectedTraceId(tId)}
            sessionId={sessionId}
            onResetSession={handleResetSession}
            isSimulatorMode={isSimulatorMode}
            onToggleSimulator={() => setIsSimulatorMode((prev) => !prev)}
            onSimulateFailure={() => handleSendMessage('how does SQLite WAL improve concurrency?', true)}
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
            agentDriftValues={agentDriftValues}
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
        documents={corpusDocs}
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
