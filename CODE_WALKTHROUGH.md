# Code walkthrough

A short guide to the code for the viva: what each area does, the key files, the path of one span from the SDK to the dashboard, and where every number on the dashboard comes from. Plain descriptions only; the measured results and their limits are in the reports linked at the end.

Line numbers are as of `main` at `2fefb91` (2026-10-25). They drift as the code changes; the function names do not.

---

## 1. The SDK (`sdk/`)

Runs inside the user's agent process. It records what each agent did as a **span** and sends spans to the API in the background, so the agent never waits for AgentPulse.

| File | What it does |
| :--- | :--- |
| [`client.py`](sdk/src/agentpulse/client.py#L65) | `AgentPulse`, the object a user creates. `monitor()` ([L161](sdk/src/agentpulse/client.py#L161)) returns the decorator for an agent function; `instrument_llm()` ([L203](sdk/src/agentpulse/client.py#L203)) wraps an OpenAI or Anthropic client so every completion becomes a span. |
| [`decorators.py`](sdk/src/agentpulse/decorators.py#L66) | The decorator. It builds a span before the call, runs the agent function exactly once, and records success or error after it ([L93-L150](sdk/src/agentpulse/decorators.py#L93)). An SDK error never stops the agent: on an error before the call the function simply runs without a span (`_fail_open`, [L197](sdk/src/agentpulse/decorators.py#L197)). |
| [`integrations/llm.py`](sdk/src/agentpulse/integrations/llm.py#L285) | `instrument_client`: patches the client instance's `create` method; reads the prompt, the completion and the token counts from the provider's request and response shapes. |
| [`integrations/langgraph.py`](sdk/src/agentpulse/integrations/langgraph.py#L71) | `LangGraphAdapter`: wraps LangGraph nodes and tools so each node becomes a span. |
| [`transport.py`](sdk/src/agentpulse/transport.py#L62) | `AsyncTransport`: an in-memory buffer (`enqueue`, [L161](sdk/src/agentpulse/transport.py#L161)) flushed every 100 ms in batches of 10 to `POST /v1/ingest` (`_flush`, [L214](sdk/src/agentpulse/transport.py#L214)), with retries ([L254](sdk/src/agentpulse/transport.py#L254)). The buffer holds at most 10,000 spans and drops the oldest first ([`config.py:135`](sdk/src/agentpulse/config.py#L135)). |
| [`privacy.py`](sdk/src/agentpulse/privacy.py#L26) | Redacts emails, phone numbers, SSNs and secret-shaped strings before anything leaves the process. |
| [`config.py`](sdk/src/agentpulse/config.py#L41) | Settings. Input and output capture are **off by default** ([L41-L43](sdk/src/agentpulse/config.py#L41)); without captured text there is nothing for grounding to compare. |

## 2. The API (`backend/app/`, routers)

A FastAPI process that accepts spans, stores them in SQLite and answers the dashboard's questions. It loads no ML model.

| File | What it does |
| :--- | :--- |
| [`main.py`](backend/app/main.py#L204) | `create_app()` builds the app, adds the middleware and the routers ([L261-L270](backend/app/main.py#L261)); `lifespan` ([L78](backend/app/main.py#L78)) opens the database on start. |
| [`middleware.py`](backend/app/middleware.py#L41) | `APIKeyMiddleware` checks the `X-API-Key` header; `RateLimitMiddleware` ([L161](backend/app/middleware.py#L161)) limits `/v1/ingest`; `RequestMetricsMiddleware` ([L205](backend/app/middleware.py#L205)) times every request for the Performance view. |
| [`routers/ingest.py`](backend/app/routers/ingest.py#L157) | `POST /v1/ingest`: validates each span, creates the trace if new (`_ensure_trace`, [L676](backend/app/routers/ingest.py#L676)), writes the span ([L218](backend/app/routers/ingest.py#L218)), updates the agent's running totals (`_update_agent_record`, [L717](backend/app/routers/ingest.py#L717)) and queues one evaluation job ([L281](backend/app/routers/ingest.py#L281)). Answers 202 without waiting for the evaluation. `POST /v1/simulate` ([L577](backend/app/routers/ingest.py#L577)) builds the Telemetry Lab scenarios and sends them through the same ingest code. |
| [`routers/__init__.py`](backend/app/routers/__init__.py#L48) | The read side: traces ([L55](backend/app/routers/__init__.py#L55), [L111](backend/app/routers/__init__.py#L111)), agents ([L248](backend/app/routers/__init__.py#L248)), drift ([L363](backend/app/routers/__init__.py#L363)), alerts ([L421](backend/app/routers/__init__.py#L421)), metrics and health ([L512-L677](backend/app/routers/__init__.py#L512)), API keys ([L759](backend/app/routers/__init__.py#L759)). |
| [`routers/experiments.py`](backend/app/routers/experiments.py#L118) | `GET /v1/experiments` lists the JSON files in `experiments/results/`; `/v1/datasets` stores curated test cases. |
| [`models.py`](backend/app/models.py#L42) | The tables: `Trace`, `Span` ([L79](backend/app/models.py#L79)), `Evaluation` ([L154](backend/app/models.py#L154)), `DriftRecord` ([L256](backend/app/models.py#L256)), `Alert` ([L344](backend/app/models.py#L344)), `AgentRecord` ([L383](backend/app/models.py#L383)), `EvaluationJob` ([L442](backend/app/models.py#L442)). |
| [`config.py`](backend/app/config.py#L81) | Server settings: drift threshold 0.30 ([L81](backend/app/config.py#L81)), alert threshold 0.70 ([L89](backend/app/config.py#L89)), database path, API key. |

## 3. The worker and the job queue

A separate process loads the two models and does all the scoring, so a slow evaluation never slows ingestion.

| File | What it does |
| :--- | :--- |
| [`services/job_queue.py`](backend/app/services/job_queue.py#L157) | A queue stored in the `evaluation_jobs` table. `enqueue_job` adds a job; `claim_next` ([L211](backend/app/services/job_queue.py#L211)) leases the oldest ready job for 120 s ([L116](backend/app/services/job_queue.py#L116)); a failed job is retried with back-off up to 3 attempts ([L109](backend/app/services/job_queue.py#L109)), then dead-lettered; `recover_expired_leases` ([L386](backend/app/services/job_queue.py#L386)) returns jobs from a worker that died. |
| [`worker.py`](backend/app/worker.py#L91) | `EvaluationWorker`: `run_once` ([L194](backend/app/worker.py#L194)) claims a job, runs it, marks it succeeded or failed; `run_forever` ([L263](backend/app/worker.py#L263)) loops every 0.5 s and writes a heartbeat every 15 s. `_amain` ([L350](backend/app/worker.py#L350)) loads the models and builds the pipeline ([L417](backend/app/worker.py#L417)). |
| [`services/evaluation_runner.py`](backend/app/services/evaluation_runner.py#L459) | `execute_job`: parses the job, runs the evaluator in a thread, then `persist_results` ([L251](backend/app/services/evaluation_runner.py#L251)) writes the `Evaluation`, `DriftRecord` and `Alert` rows once per span (a second run for the same span writes nothing). |

## 4. The evaluator signals

[`services/evaluator.py`](backend/app/services/evaluator.py#L133), `EvaluationPipeline.evaluate_span`, runs the signals in order and combines them.

| Signal | Where | What it computes | Status, measured |
| :--- | :--- | :--- | :--- |
| **Grounding** | [`grounding.py`](backend/app/services/grounding.py#L345) `evaluate_grounding`, called at [`evaluator.py:172`](backend/app/services/evaluator.py#L172) | MiniLM similarity between input and output, then DeBERTa-v3-small NLI on (input = premise, output = hypothesis). Score = `contradiction + 0.3 × neutral` ([L190](backend/app/services/grounding.py#L190), [L308](backend/app/services/grounding.py#L308)). Both models run on every span; there is no gate. `grounding_verdict` ([L423](backend/app/services/grounding.py#L423)) names the winning NLI class: supported, unverifiable or contradicted. | Test split F1 0.963, FPR 0.059; 47 held-out cases F1 0.927 (cut-off 0.7) / 0.952 (0.4), FPR 0.074. 5 of the 30 test cases copy dev cases; 0.3 is a design choice (`GROUNDING_RECALIBRATION_2026-10.md`). |
| **Tool-claim** | [`tool_claim.py`](backend/app/services/tool_claim.py#L390) `evaluate_tool_claims`, called at [`evaluator.py:189`](backend/app/services/evaluator.py#L189) | Regex patterns ([L103-L140](backend/app/services/tool_claim.py#L103)) find counts written in digits ("retrieved 10 papers") and compare them with the tool's recorded result count. | F1 0.842 on 19 hand-written cases; **F1 0.000 on real agent traces**, no claim found in 8,353 prose spans (`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md`). Experimental. |
| **Disagreement** | [`disagreement.py`](backend/app/services/disagreement.py#L110), called at [`evaluator.py:237`](backend/app/services/evaluator.py#L237) | NLI between this agent's output and earlier agents' outputs in the same trace. | **0 of 10** labelled contradictions found on real multi-agent traces; at chance (AUC 0.457) with the planner excluded. Score stored, **alert withdrawn** ([`alerting.py:381`](backend/app/services/alerting.py#L381), commented out), not part of the risk. |
| **Drift** | [`drift.py`](backend/app/services/drift.py#L214) `DriftDetector.analyze`, called at [`evaluator.py:262`](backend/app/services/evaluator.py#L262) | `window_centroid_distance`: cosine distance between the mean embedding of the agent's first 20 outputs and of its latest 12 ([L332](backend/app/services/drift.py#L332)); none until both pools are full. Also a per-output distance, tool-use spread and an Agent Stability Index (0-100). | Held-out real-text split, measured once offline: 1.5% false alarms, 91.9% detection, but only 24.5% of sessions long enough to report (`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.3). |

**Risk score.** `_aggregate_risk` ([`evaluator.py:310`](backend/app/services/evaluator.py#L310)) = weighted mean of grounding (0.40) and tool-claim (0.25, only when a claim was found), divided by the weights present ([L101](backend/app/services/evaluator.py#L101)). `_classify_risk` ([L348](backend/app/services/evaluator.py#L348)): above 0.7 `high_risk`, above 0.4 `medium_risk`, else `low_risk`.

**Alerts.** [`alerting.py`](backend/app/services/alerting.py#L275) `_build_default_rules`: `HIGH_HALLUCINATION_RISK` (risk > 0.7), `GROUNDING_FAILURE` (grounding > 0.7), `TOOL_CLAIM_MISMATCH`, `DRIFT_DETECTED` (window distance > 0.30), `ASI_DROP` (ASI < 50), `ERROR_RATE_SPIKE`. The same alert for the same agent is held back for 15 minutes; at most 50 alerts an hour. Called at [`evaluator.py:280`](backend/app/services/evaluator.py#L280).

## 5. One span, end to end

1. The agent function runs inside `@pulse.monitor` ([`decorators.py:93`](sdk/src/agentpulse/decorators.py#L93)). The SDK builds a span (ids, agent, timing, tokens, and text only if capture is on, after redaction) and calls `transport.enqueue` ([`transport.py:161`](sdk/src/agentpulse/transport.py#L161)).
2. Within about 100 ms the transport posts a batch to `POST /v1/ingest` with the API key ([`transport.py:214`](sdk/src/agentpulse/transport.py#L214)).
3. The API checks the key ([`middleware.py:41`](backend/app/middleware.py#L41)), writes the trace and span, updates `agent_records` (span count, error count, a moving-average latency where each new span counts 5%, [`ingest.py:751-L760`](backend/app/routers/ingest.py#L751)), queues an evaluation job and answers **202** ([`ingest.py:157`](backend/app/routers/ingest.py#L157)).
4. The worker leases the job ([`job_queue.py:211`](backend/app/services/job_queue.py#L211)) and runs `evaluate_span` ([`evaluator.py:133`](backend/app/services/evaluator.py#L133)): grounding, tool-claim, disagreement, drift, risk, alerts.
5. `persist_results` ([`evaluation_runner.py:251`](backend/app/services/evaluation_runner.py#L251)) writes the evaluation, the drift record and any alert; the job is marked succeeded.
6. The dashboard polls every 10 s ([`useTelemetry.ts:17`](dashboard/src/lib/useTelemetry.ts#L17)): `GET /v1/agents`, `/v1/drift`, `/v1/alerts`, `/v1/traces`. [`adapters.ts`](dashboard/src/lib/adapters.ts#L52) maps the replies to view models, leaving anything the API did not send undefined; the views print an em dash for it.

## 6. The dashboard (`dashboard/src/`)

React 19 + TypeScript + Vite. [`App.tsx`](dashboard/src/App.tsx) holds the state and the tab switch; [`lib/useTelemetry.ts`](dashboard/src/lib/useTelemetry.ts#L36) loads the data; [`lib/api.ts`](dashboard/src/lib/api.ts#L227) is the REST client; [`lib/adapters.ts`](dashboard/src/lib/adapters.ts) is the only place API fields become screen fields. The public landing page is [`components/public/PublicExperience.tsx`](dashboard/src/components/public/PublicExperience.tsx); its numbers are offline measurements with their source named next to them.

### Where each number comes from

| View | Number on screen | Source |
| :--- | :--- | :--- |
| Overview | Spans ingested | sum of `total_spans` over `GET /v1/agents` ([`OverviewView.tsx:42`](dashboard/src/components/product/OverviewView.tsx#L42)) |
| Overview | Avg agent latency | mean of the agents' `avg_latency_ms` (each a moving average kept at ingest), agents without one left out ([L50](dashboard/src/components/product/OverviewView.tsx#L50)) |
| Overview | Active incidents, open / investigating / resolved | `GET /v1/alerts`, by the `acknowledged` and `resolved` flags (`breakDownIncidents`, [`overviewStats.ts:52`](dashboard/src/lib/overviewStats.ts#L52)) |
| Overview | Drifting agents, max divergence, "no baseline yet" | `latest_window_centroid_distance` from `GET /v1/drift`, compared with 0.30 (`summarizeDrift`, [`overviewStats.ts:20`](dashboard/src/lib/overviewStats.ts#L20)) |
| Overview | "203 ms median" | offline: `LLM_JUDGE_COMPARISON_REPORT.md`, median 202.94 ms over 30 cases |
| Agents | spans ingested, latency (moving avg), % OK | `total_spans`, `avg_latency_ms`, `1 - error_rate` from `GET /v1/agents` ([`adapters.ts:52`](dashboard/src/lib/adapters.ts#L52)) |
| Agents, Drift | window centroid distance, per-output distance, tool-use spread | `GET /v1/drift` (`latest_window_centroid_distance`, `latest_centroid_distance`, `latest_tool_drift`) ([`adapters.ts:243`](dashboard/src/lib/adapters.ts#L243)) |
| Traces | duration, tokens, risk, per-span scores and verdict | `GET /v1/traces` and `GET /v1/traces/{id}` (span `evaluation`: grounding score, NLI probabilities, `grounding_verdict`) ([`adapters.ts:134`](dashboard/src/lib/adapters.ts#L134), [L190](dashboard/src/lib/adapters.ts#L190)) |
| Incidents | each alert and its message | `GET /v1/alerts` ([`adapters.ts:222`](dashboard/src/lib/adapters.ts#L222)); the message is written by the alert rule |
| Performance | API latency percentiles, ingestion rate, queue wait, evaluation time, workers | `GET /v1/platform` (measured by the running instance itself) |
| Telemetry Lab | per-span scores and alerts of a scenario run | `POST /v1/simulate`, then `GET /v1/simulate/{trace_id}` ([`ingest.py:601`](backend/app/routers/ingest.py#L601)) |
| Settings | live evaluation p50 | `GET /v1/platform` `evaluation_timing` ([`evalTiming.ts:17`](dashboard/src/lib/evalTiming.ts#L17)) |

Framework, model, version, cost and tool lists have no source in the span schema; the views show a dash. (Before PR #99 the Agents view also drew a "60-minute latency" chart that was generated in the browser; that PR removes it.)

## 7. Deployment (`deploy/`, `.github/workflows/`)

| File | What it does |
| :--- | :--- |
| [`docker-compose.yml`](docker-compose.yml) | Three services: `backend` (the API), `worker`, `dashboard` (nginx serving the built app on 5173). |
| [`deploy/azure/`](deploy/azure/README.md) | The live deployment on one Azure VM (Standard_B2als_v2, 2 vCPU, 4 GB): a compose override adding Caddy for TLS ([`docker-compose.azure.yml`](deploy/azure/docker-compose.azure.yml)), the [`Caddyfile`](deploy/azure/Caddyfile), [`deploy.sh`](deploy/azure/deploy.sh) and a schema check. The README records the measured memory: worker 1.148 GB, backend 80 MB. |
| [`.github/workflows/deploy-azure.yml`](.github/workflows/deploy-azure.yml) | A push to `main` that touches `backend/**`, `dashboard/**`, `docker-compose.yml` or `deploy/azure/**` deploys to the VM. It does not wait for the tests. |
| [`.github/workflows/tests.yml`](.github/workflows/tests.yml), [`dashboard.yml`](.github/workflows/dashboard.yml) | Run the backend tests, and the dashboard typecheck and unit tests, on pull requests and on pushes to `main`. |

`deploy/huggingface/` (a single-container image for a Hugging Face Space; Docker Spaces need a paid plan, per `deploy/azure/README.md`) and `deploy/oracle/` (a guide for Oracle's Always Free ARM tier) are alternative targets. The live site runs on the Azure VM.

## 8. Tests

Backend: `pytest tests/`, **422 passed** on 2026-10-25 (36 test files). Dashboard: `cd dashboard && npm test`, **136 passed** in 13 files. Both were run on `main` at `2fefb91`.

## Further reading

`HOW_IT_WORKS.md` (every constant read out of the source), `GROUNDING_RECALIBRATION_2026-10.md` (the grounding figures), `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` (drift), `COMPETITIVE_POSITIONING.md` (the negative results for tool-claim and disagreement), `PROJECT_REPORT.md` (the overall report).
