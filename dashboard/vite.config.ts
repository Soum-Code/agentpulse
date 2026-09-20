import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Where the real services live. Overridable so the dashboard can point at a
// deployed backend, but never at a fixture.
const AGENTPULSE_API = process.env.VITE_AGENTPULSE_API ?? 'http://127.0.0.1:8000';
const CHATBOT_API = process.env.VITE_CHATBOT_API ?? 'http://127.0.0.1:8100';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // These replace an `agentpulse-mock-api` middleware that answered every
      // /v1/*, /chat and /corpus request from src/lib/mockData.ts before it
      // could reach a backend. With it installed, `npm run dev` served invented
      // agents, traces, alerts and evaluator health, and /chat returned one
      // hardcoded paragraph about SQLite WAL with a Math.random() trace_id --
      // no model was ever called and nothing was ever monitored.
      //
      // The whole point of this dashboard is to answer "is AgentPulse actually
      // monitoring, or does it only look like it is". A dev server that fakes
      // the answer makes the question unanswerable, and makes it look answered.
      //
      // If a backend is down these now fail, loudly, which is correct.
      proxy: {
        '/v1': { target: AGENTPULSE_API, changeOrigin: true },
        '/chat': { target: CHATBOT_API, changeOrigin: true },
        '/corpus': { target: CHATBOT_API, changeOrigin: true },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      emptyOutDir: false,
    },
  };
});
