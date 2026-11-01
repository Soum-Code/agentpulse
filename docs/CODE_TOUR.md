# Code tour: one span, from the SDK to the screen

A **span** is one recorded step of an agent (an LLM call or a tool call). This page follows one
span through the code, step by step. Each step names the file and the function, so you can open
it and point at it. Reading time: about five minutes.

```
agent code -> SDK -> POST /v1/ingest -> database -> queue -> worker -> scores -> API -> dashboard
```

## The road

1. **The agent calls the SDK.** `@pulse.monitor(...)` (`AgentPulse.monitor` in
   `sdk/src/agentpulse/client.py`) wraps a function. `create_monitor_decorator` in `decorators.py`
   builds a span before the function runs, fills it in afterwards (`_record_success` or
   `_record_error`) and hands it to the sender. If the SDK itself breaks, `_fail_open` logs it and
   the agent keeps running. LLM calls are caught by `integrations/llm.py`, LangGraph nodes by
   `integrations/langgraph.py`. `privacy.py` can hide secrets and emails before a span leaves.

2. **The SDK sends in the background.** `AsyncTransport.enqueue` in `transport.py` only adds the
   span to a list, so the agent never waits. `_flush_loop` wakes every `flush_interval_ms` (100 by
   default), `_flush` takes the batch and `_send_with_retry` posts it to `/v1/ingest` with the
   `X-API-Key` header. If the backend is down, `_write_fallback` saves the spans in a file.

3. **The API receives it.** `backend/app/main.py` builds the app. Every request first passes the
   layers in `middleware.py` (rate limit, API key, body size). Then `ingest_spans` in
   `routers/ingest.py` (`POST /v1/ingest`) runs `check_ingest_limits` (too big: answer 413) and
   saves a `Span` row, plus the `Trace` and `AgentRecord` rows (`_ensure_trace`,
   `_update_agent_record`). Every table is defined in `models.py`.

4. **One job per span goes on the queue.** Still in `ingest_spans`, `enqueue_job` in
   `services/job_queue.py` writes an `EvaluationJob` row in the same database, so a restart loses
   nothing. The API answers 202 "accepted" at once. It does **not** score anything. It also tells
   the live feed (`ws_manager` in `routers/websocket.py`) that a new span arrived.

5. **A worker takes the job.** The worker is a separate process (`python -m app.worker`).
   `EvaluationWorker.run_once` calls `claim_next`, which takes the oldest ready job and gives it
   a time lease, so the job of a crashed worker comes back (`recover_expired_leases`).
   `execute_job` in `services/evaluation_runner.py` scores the span. Then `mark_succeeded`, or
   `mark_failed`: retry later, and after the last attempt the job becomes `dead_letter`.

6. **The span is scored.** `EvaluationPipeline.evaluate_span` in `services/evaluator.py` runs:
   - **grounding**: `evaluate_grounding` in `services/grounding.py`. An NLI model (DeBERTa) asks
     "does the evidence support what the agent said?". The risk is contradiction + 0.3 x neutral.
     A MiniLM similarity check runs too, but its score is used alone only if the NLI model is not
     loaded.
   - **tool claims**: `evaluate_tool_claims` in `tool_claim.py`. Does the text match what the tool
     really returned?
   - **disagreement**: `evaluate_against_prior_agents` in `disagreement.py`. Does it contradict an
     earlier agent of the same trace?
   - **drift**: `DriftDetector.analyze` in `drift.py`. Embeddings compare this output with the
     agent's usual outputs; tool use, risk trend and error rate are added. The result is the
     Agent Stability Index (ASI), 0 to 100.
   - **risk and alerts**: `_aggregate_risk` makes one risk score, then `AlertEngine.evaluate` in
     `alerting.py` compares scores with thresholds (`HIGH_HALLUCINATION_RISK`,
     `GROUNDING_FAILURE`, `TOOL_CLAIM_MISMATCH`, `DRIFT_DETECTED`, ...). A cooldown (900 seconds
     by default) stops the same alert from repeating.

7. **The results are saved.** `persist_results` in `evaluation_runner.py` writes the `Evaluation`
   row (the scores), the `DriftRecord` row and any `Alert` rows, once per span. A repeat is
   ignored. `persist_drift_baselines` keeps each agent's baseline across restarts.

8. **The API serves what is stored.** `routers/__init__.py` has `GET /v1/traces`,
   `GET /v1/traces/{id}` (every span with its `evaluation`, which is null until scored),
   `/v1/agents`, `/v1/drift`, `/v1/alerts`, `/v1/metrics`, `/v1/platform` and `/v1/health*`. These
   routes only read the database. None of them runs a model.

9. **The dashboard polls and draws.** `dashboard/src/lib/useTelemetry.ts` asks the API every 10
   seconds, through `lib/api.ts` (`createApiClient`, `fetchApi`). `lib/adapters.ts` turns each
   reply into the shapes the views use (`toTrace`, `toSpans`, `toAgents`, `toIncidents`,
   `toDriftProfiles`). `App.tsx` calls this hook, keeps what is selected and picks the view.
   `components/product/TracesView.tsx` draws the traces, spans, scores and verdicts. An older
   trace that came without spans is fetched on demand by `loadFullTrace` (`lib/traceDetail.ts`).
   The console does not use the WebSocket feed; it polls.

## Two other roads into the same pipe

- **Telemetry Lab**: `POST /v1/simulate` (`simulate_pipeline` in `routers/ingest.py`) builds spans
  with `build_scenario_spans` and passes them to the same `ingest_spans`. `simulate_guard.py`
  limits how often it can run.
- **Public chat**: `demo/chat_server.py` uses the SDK (`start_span`, `end_span`) for its three
  agents (retriever, verifier, answerer). `chat_guard.py` limits the turns and
  `chat_providers.py` picks which LLM provider answers.

## Why it is built this way

- **Ingest and scoring are split.** The API stays fast while the models are slow, and a worker can
  restart without losing jobs.
- **No fake zeros.** A value that is not measured yet shows as unknown, never as 0
  (`lib/stateModel.ts`, `lib/traceStatus.ts`).
- **One database.** Spans, the queue and the results are tables in the same SQLite file.

_Names checked against the code of `main` at commit `4fc74b4`._
