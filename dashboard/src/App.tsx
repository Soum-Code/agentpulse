import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient, websocketUrlFor, Agent, AgentPulseConnection, AlertItem, Metrics, PlatformHealth } from './lib/api';
import { useWebSocket } from './hooks/useWebSocket';
import type { InstrumentMode, SpatialSceneMode } from './spatial/SpatialInstrument';
import { LandingView } from './views/LandingView';
import { ConnectView } from './views/ConnectView';
import { HandshakeView } from './views/HandshakeView';
import { CommandSurface, TelemetryState } from './views/CommandSurface';
import { NavigationDock } from './components/NavigationDock';

const SpatialInstrument = lazy(() =>
  import('./spatial/SpatialInstrument').then((module) => ({ default: module.SpatialInstrument })),
);

const DEFAULT_CONNECTION: AgentPulseConnection = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  apiKey: import.meta.env.VITE_API_KEY || undefined,
};

export default function App() {
  const [mode, setMode] = useState<InstrumentMode>('LANDING');
  const [sceneMode, setSceneMode] = useState<SpatialSceneMode>('constellation');
  const [connection, setConnection] = useState<AgentPulseConnection>(DEFAULT_CONNECTION);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [platform, setPlatform] = useState<PlatformHealth | null>(null);
  const [telemetryState, setTelemetryState] = useState<TelemetryState>('idle');
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const client = useMemo(() => createApiClient(connection), [connection]);
  const wsUrl = useMemo(() => websocketUrlFor(connection), [connection]);
  const { lastMessage, isConnected: isWsConnected } = useWebSocket(wsUrl, mode === 'COMMAND');

  const refreshTelemetry = useCallback(async () => {
    setTelemetryState((state) => (state === 'ready' ? 'ready' : 'loading'));
    setTelemetryError(null);

    const [metricsResult, agentsResult, alertsResult, platformResult] = await Promise.allSettled([
      client.getMetrics(),
      client.getAgents(),
      client.getAlerts(),
      client.getPlatformHealth(),
    ]);

    if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
    if (agentsResult.status === 'fulfilled') setAgents(agentsResult.value.agents);
    if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value.alerts);
    if (platformResult.status === 'fulfilled') setPlatform(platformResult.value);

    const failures = [metricsResult, agentsResult, alertsResult, platformResult].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length === 3) {
      const reason = failures[0].reason;
      setTelemetryState('error');
      setTelemetryError(reason instanceof Error ? reason.message : 'Telemetry is unavailable.');
      return;
    }

    setTelemetryState('ready');
    if (failures.length) {
      const reason = failures[0].reason;
      setTelemetryError(reason instanceof Error ? reason.message : 'Some telemetry could not be read.');
    }
  }, [client]);

  useEffect(() => {
    if (mode !== 'COMMAND') return;
    void refreshTelemetry();
    const interval = window.setInterval(() => void refreshTelemetry(), 4_000);
    return () => window.clearInterval(interval);
  }, [mode, refreshTelemetry]);

  useEffect(() => {
    if (mode === 'COMMAND' && lastMessage) void refreshTelemetry();
  }, [lastMessage, mode, refreshTelemetry]);

  const beginConnection = (nextConnection: AgentPulseConnection) => {
    setConnection(nextConnection);
    setMetrics(null);
    setAgents([]);
    setAlerts([]);
    setPlatform(null);
    setTelemetryState('idle');
    setTelemetryError(null);
    setHoveredAgentId(null);
    setSelectedAgentId(null);
    setMode('HANDSHAKE');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-void text-ink font-sans">
      {mode !== 'COMMAND' && (
        <Suspense fallback={<div className="absolute inset-0 bg-void" aria-hidden="true" />}>
          <SpatialInstrument
            mode={mode}
            sceneMode={sceneMode}
            agents={agents}
            hoveredAgentId={hoveredAgentId}
            selectedAgentId={selectedAgentId}
            onHoverAgent={setHoveredAgentId}
            onSelectAgent={setSelectedAgentId}
          />
        </Suspense>
      )}

      {mode === 'LANDING' && (
        <LandingView
          onEnter={() => setMode('CONNECT')}
          sceneMode={sceneMode}
          onChangeSceneMode={setSceneMode}
        />
      )}

      {mode === 'CONNECT' && (
        <ConnectView
          initialConnection={connection}
          onConnect={beginConnection}
          onBack={() => setMode('LANDING')}
        />
      )}

      {mode === 'HANDSHAKE' && (
        <HandshakeView
          connection={connection}
          client={client}
          onComplete={() => setMode('COMMAND')}
          onCancel={() => setMode('CONNECT')}
        />
      )}

      {mode === 'COMMAND' && (
        <CommandSurface
          metrics={metrics}
          agents={agents}
          alerts={alerts}
          platform={platform}
          client={client}
          telemetryState={telemetryState}
          telemetryError={telemetryError}
          hoveredAgentId={hoveredAgentId}
          selectedAgentId={selectedAgentId}
          isWsConnected={isWsConnected}
          onHoverAgent={setHoveredAgentId}
          onSelectAgent={setSelectedAgentId}
          onRefresh={() => void refreshTelemetry()}
          onDisconnect={() => setMode('CONNECT')}
        />
      )}
    </div>
  );
}
