/**
 * Minimal application shell.
 *
 * The previous dashboard implementation was removed in the frontend
 * clean-slate reset. This file exists only so the project builds and renders
 * while the replacement UI is designed — it is deliberately not a starting
 * point for that design, and deliberately renders no product data.
 *
 * The data layer it will build on is preserved and unmodified:
 *   src/lib/api.ts           REST client for /v1/*
 *   src/hooks/useWebSocket.ts  live socket for /v1/ws/live
 */
export function App() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>AgentPulse</h1>
      <p>The dashboard UI is being rebuilt. No interface is implemented yet.</p>
    </main>
  );
}

export default App;
