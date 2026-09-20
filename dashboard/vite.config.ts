import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import {
  MOCK_AGENTS,
  MOCK_DRIFT,
  MOCK_ALERTS,
  MOCK_TRACES,
  MOCK_SPANS_BY_TRACE,
  MOCK_PLATFORM_HEALTH,
  MOCK_METRICS,
  MOCK_DATASETS,
  MOCK_EXPERIMENTS,
} from './src/lib/mockData';

function apiDevPlugin(): Plugin {
  return {
    name: 'agentpulse-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost:3000') : null;
        if (
          !url ||
          (!url.pathname.startsWith('/v1/') &&
            url.pathname !== '/corpus' &&
            url.pathname !== '/chat')
        ) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');

        if (url.pathname === '/corpus') {
          res.end(
            JSON.stringify({
              documents: [
                'SQLite Write-Ahead Logging (WAL) Architecture',
                'Multi-Version Concurrency Control (MVCC) in Embedded Storage Engines',
                'B-Tree Page Splitting, Buffer Pool Contention, and Disk I/O Latency',
                'Crash Recovery, Checkpointing, and Log Sequence Numbers in SQLite',
                'Reader-Writer Lock Contention in Shared Cache and In-Memory Databases',
                'Atomic Commit Protocols, POSIX fcntl Locks, and OS Sync Primitives',
              ],
            })
          );
          return;
        }

        if (url.pathname === '/chat' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const sessionId = parsed.session_id || 'sess_' + Date.now();
              const traceId = 'tr_' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
              const message = parsed.message || '';

              const reply = `SQLite's Write-Ahead Logging (WAL) architecture decouples read transactions from write transactions by appending all modifications to a separate -wal log file rather than directly mutating the main database pages. Readers inspect their snapshot from the log without requiring exclusive database locks.`;

              const resp = {
                session_id: sessionId,
                trace_id: traceId,
                reply,
                verifier_verdict: 'Yes. The evidence explains and entails non-blocking concurrent reads.',
                retrieved: [
                  'SQLite Write-Ahead Logging (WAL) Architecture',
                  'Crash Recovery, Checkpointing, and Log Sequence Numbers in SQLite',
                  'Reader-Writer Lock Contention in Shared Cache and In-Memory Databases',
                ],
                agents: [
                  {
                    agent: 'retriever',
                    model: 'mistralai/mistral-nemotron',
                    output: `Retrieved 3 documents with embedding cosine similarities [0.892, 0.841, 0.793] matching query: "${message.substring(0, 30)}..."`,
                    latency_ms: 1240,
                  },
                  {
                    agent: 'verifier',
                    model: 'google/gemma-4-31b-it',
                    output: `Verified: The retrieved WAL documentation strictly entails that WAL writes changes to an append-only log file rather than the main database page file, allowing readers to access snapshot isolation without holding table locks.`,
                    latency_ms: 1620,
                  },
                  {
                    agent: 'answerer',
                    model: 'deepseek-ai/deepseek-v4-flash-0731',
                    output: reply,
                    latency_ms: 1410,
                  },
                ],
              };

              res.end(JSON.stringify(resp));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
            }
          });
          return;
        }

        if (url.pathname === '/v1/health/ready') {
          res.end(JSON.stringify({ ready: true, checks: { database: { ok: true, detail: 'connected' } }, reasons: [] }));
          return;
        }
        if (url.pathname === '/v1/health/evaluator') {
          res.end(JSON.stringify({ ready: true, workers_alive: 4, workers_registered: 4, workers_stale: 0, degraded: false, reasons: [] }));
          return;
        }
        if (url.pathname === '/v1/platform') {
          res.end(JSON.stringify(MOCK_PLATFORM_HEALTH));
          return;
        }
        if (url.pathname === '/v1/metrics') {
          res.end(JSON.stringify(MOCK_METRICS));
          return;
        }
        if (url.pathname === '/v1/agents') {
          res.end(JSON.stringify({ agents: MOCK_AGENTS }));
          return;
        }
        if (url.pathname === '/v1/drift') {
          res.end(JSON.stringify({ agents: MOCK_DRIFT }));
          return;
        }
        if (url.pathname === '/v1/alerts') {
          res.end(JSON.stringify({ alerts: MOCK_ALERTS }));
          return;
        }
        if (url.pathname === '/v1/traces') {
          res.end(JSON.stringify({ traces: MOCK_TRACES, total: MOCK_TRACES.length }));
          return;
        }
        if (url.pathname.startsWith('/v1/traces/')) {
          const id = url.pathname.replace('/v1/traces/', '');
          const existingTrace = MOCK_TRACES.find((t) => t.trace_id === id);
          const trace = existingTrace || {
            trace_id: id,
            pipeline_id: 'rag_sqlite_wal',
            start_time: new Date(Date.now() - 3000).toISOString(),
            end_time: new Date().toISOString(),
            status: 'success',
            total_spans: 3,
            overall_risk_score: 0.058,
            service_name: 'rag_chatbot',
          };
          const existingSpans = MOCK_SPANS_BY_TRACE[id];
          const spans = existingSpans || [
            {
              span_id: 'sp_' + id + '_1',
              parent_span_id: null,
              agent_id: 'retriever',
              agent_role: 'document_retrieval',
              event_type: 'call',
              span_kind: 'agent',
              latency_ms: 1240,
              status: 'success',
              error_message: null,
              model: 'mistralai/mistral-nemotron',
              tokens_in: 48,
              tokens_out: 320,
              tool_name: 'vector_search',
              start_time: new Date(Date.now() - 4000).toISOString(),
              evaluation: null,
            },
            {
              span_id: 'sp_' + id + '_2',
              parent_span_id: 'sp_' + id + '_1',
              agent_id: 'verifier',
              agent_role: 'entailment_verifier',
              event_type: 'call',
              span_kind: 'agent',
              latency_ms: 1620,
              status: 'success',
              error_message: null,
              model: 'google/gemma-4-31b-it',
              tokens_in: 380,
              tokens_out: 140,
              tool_name: null,
              start_time: new Date(Date.now() - 2500).toISOString(),
              evaluation: null,
            },
            {
              span_id: 'sp_' + id + '_3',
              parent_span_id: 'sp_' + id + '_2',
              agent_id: 'answerer',
              agent_role: 'synthesis',
              event_type: 'call',
              span_kind: 'agent',
              latency_ms: 1410,
              status: 'success',
              error_message: null,
              model: 'deepseek-ai/deepseek-v4-flash-0731',
              tokens_in: 520,
              tokens_out: 390,
              tool_name: null,
              start_time: new Date(Date.now() - 1500).toISOString(),
              evaluation: {
                grounding_score: 0.942,
                tool_claim_score: null,
                overall_risk_score: 0.058,
                label: 'SUPPORTED',
                evaluation_stage: 'STAGE_2_NLI_VERIFIED',
              },
            },
          ];
          const alerts = MOCK_ALERTS.filter((a) => a.trace_id === id);
          res.end(JSON.stringify({ trace, spans, alerts }));
          return;
        }
        if (url.pathname === '/v1/datasets') {
          res.end(JSON.stringify({ datasets: MOCK_DATASETS }));
          return;
        }
        if (url.pathname === '/v1/experiments') {
          res.end(JSON.stringify({ file_experiments: MOCK_EXPERIMENTS, total: MOCK_EXPERIMENTS.length }));
          return;
        }
        if (url.pathname === '/v1/simulate') {
          res.end(JSON.stringify({ accepted: 4, failed: 0, message: 'Simulation executed successfully' }));
          return;
        }
        if (url.pathname === '/v1/keys') {
          if (req.method === 'POST') {
            res.end(
              JSON.stringify({
                key: 'ap_live_demo_' + Math.random().toString(36).substring(2, 12),
                id: Date.now(),
                prefix: 'ap_live',
                label: 'Development Key',
                created_at: new Date().toISOString(),
                warning: 'Store this key safely; it cannot be shown again.',
              })
            );
            return;
          }
          res.end(JSON.stringify({ keys: [] }));
          return;
        }
        if (url.pathname.includes('/cases')) {
          res.end(JSON.stringify({ accepted: 1, case_id: 'curated_' + Date.now() }));
          return;
        }

        res.end(JSON.stringify({ ok: true }));
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
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
