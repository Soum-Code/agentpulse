# How AgentPulse Works

An end-to-end walk through the system: what enters it, what happens to that input at every stage, where each number comes from, and where on screen you see the result.

Everything here was read out of the source. Where the code disagrees with a docstring or an older report, the code is what is written down, and the disagreement is called out in [Section 10](#10-where-the-code-differs-from-its-own-documentation).

---

## 1. What the system actually is

AgentPulse watches somebody else's multi-agent LLM pipeline and answers four questions about each step that pipeline takes:

1. Is this agent's output supported by the input it was given? (**grounding**)
2. Did it claim a tool did something the tool did not do? (**tool-claim**)
3. Does it contradict an earlier agent in the same trace? (**disagreement**)
4. Has this agent's behaviour shifted from its own history? (**drift**)

### There is no LLM judge in the loop

This matters and is worth being precise about, because the name invites the opposite assumption.

The LLM is **outside** AgentPulse. It belongs to the user's agent pipeline — their researcher node, their writer node. AgentPulse never calls it, never prompts it, and never sends anything to an LLM API.

The judging is done by two small transformer models that run locally on CPU:

| Model | Size | Job |
| :--- | :--- | :--- |
| `sentence-transformers/all-MiniLM-L6-v2` | 88 MB | turns text into a 384-dim vector |
| `cross-encoder/nli-deberta-v3-small` | ~1.1 GB cached | classifies a pair of texts as entailment / neutral / contradiction |

So "where does the input go into the LLM" has a specific answer: it does not. The agent's **input text** and **output text**, already produced by the user's LLM, are fed into DeBERTa as a premise–hypothesis pair. DeBERTa is an NLI classifier, not a generator.

### Why not, though? — the measurement

This was not assumed. An LLM judge was actually built and benchmarked head to head against the NLI cascade: `experiments/llm_judge_baseline.py`, written up in `LLM_JUDGE_COMPARISON_REPORT.md`. The judge was Qwen3-8B (Q4_K_M, llama.cpp, CPU) with a deliberately generic, untuned prompt — tuning it would have measured prompt-engineering effort rather than the two approaches.

Three reasons the runtime loop uses NLI.

**1. Latency, on 30 test cases:**

| | NLI cascade | LLM judge | Ratio |
| :--- | ---: | ---: | ---: |
| Median latency | **203 ms** | 3,170 ms | 15.6× |
| Mean latency | 258 ms | 3,335 ms | 12.9× |
| Generation tokens per case | **0** | 7.3 | — |

AgentPulse evaluates *every* span in a continuous loop. At ~3.2 s per evaluation the worker falls behind its own queue. The zero-token figure is structural, not incidental: the cascade classifies, it does not generate. On a hosted judge that token count is what would carry both a price and a rate limit.

**2. Determinism.** Same input, same score, every time — no sampling temperature, no prompt-format dependence. The judge ran at `temperature=0.7`; a different seed could change its answer. A monitor that scores the same span differently on two runs is hard to trust and harder to alert on.

**3. Quality — and here the honest answer is not a clean win.**

| Subset | n | NLI F1 | Judge F1 |
| :--- | ---: | ---: | ---: |
| Overall | 30 | 0.963 | **1.000** |
| Deterministic labels | 10 | 1.000 | 1.000 |
| LLM-judge labels | 20 | 0.941 | **1.000** |

**The judge outscored the cascade overall.** The "comparable quality" half of the original hypothesis is not confirmed as stated.

But read where the difference sits. The 30 cases split by label provenance: 10 were correct by deterministic construction, 20 were labelled by LLM-judge passes. Scoring an LLM judge against labels LLM judges produced is partially circular and flatters the judge — and the judge's *entire* measured advantage comes from that subset. On the 10 cleanly-labelled cases both systems score 1.000 and do not separate at all.

Across all 30 cases the two systems disagree on exactly **one**: `test_09`. Evidence says "approximately **7.61 billion** total parameters", the claim says "approximately **7.6 billion**". Ground truth is SUPPORTED. The judge got it right; DeBERTa scored the faithful restatement at **0.922** risk.

That is a genuine, reproducible NLI failure mode — numeric rounding paraphrase — and it has deliberately **not** been patched, because fixing from a single observed case is fitting to one data point.

With 30 cases, one case flipping moves overall F1 by roughly 0.04. Differences of this size are not separations.

**So the defensible claim is narrow:** the cascade evaluates at 13–16× lower latency with zero generation tokens and is deterministic; on cleanly-labelled cases it matches the judge exactly; and it carries one known weakness on numeric paraphrase. What cannot be claimed is anything about LLM judges in general — this was one model, one generic prompt, one temperature and seed, on 30 cases, with no few-shot or chain-of-thought, either of which typically improves judge accuracy. Tool-claim and disagreement were not part of the comparison at all.

**The judge is still used — just offline.** Qwen3-8B produced the gold labels this project measures against, including `datasets/external/exgentic_v2/derived/tool_claim_gold.json`. The distinction is between labelling a fixed dataset once, where a slow non-deterministic model is fine, and scoring every span forever, where it is not.


---

## 2. The three processes

```
  ┌──────────────┐   HTTP POST /v1/ingest    ┌──────────┐
  │  user's      │ ────────────────────────► │   API    │  writes spans,
  │  agent app   │                           │ (FastAPI)│  enqueues jobs
  │  + SDK       │ ◄──────────────────────── └────┬─────┘  returns 202
  └──────────────┘        202 Accepted            │
                                                  │ evaluation_jobs table
                                                  ▼
                                            ┌──────────┐
                                            │  worker  │  leases a job,
                                            │          │  runs the models,
                                            └────┬─────┘  writes results
                                                 │
                                            SQLite (WAL)
                                                 │
                                                 ▼
                                            ┌──────────┐
                                            │dashboard │  polls REST + WS
                                            └──────────┘
```

| Process | What it does | Memory (measured on the live VM) |
| :--- | :--- | ---: |
| `backend` | HTTP API. Loads **no** models. | 80 MB |
| `worker` | Loads both models, runs every evaluation. | 1.148 GB |
| `dashboard` | nginx serving a built React SPA. | 3.7 MB |

The API deliberately does not evaluate anything. `AGENTPULSE_API_LOAD_MODELS` defaults to false, and the startup log says so explicitly. This is why the API fits in 80 MB while the worker needs 1.15 GB — and why the worker is the component that rules out every 512 MB free hosting tier.

---

## 3. The journey of one span

This is the part to understand. Follow one agent call from the user's code to a coloured badge on screen.

### Step 1 — the SDK wraps the agent function

`sdk/src/agentpulse/decorators.py`

```python
pulse = AgentPulse(endpoint="http://localhost:8000")

@pulse.monitor(agent_id="researcher", role="researcher")
async def researcher_node(state):
    ...
    return {"messages": [...]}
```

The decorator builds a span **before** running the function, runs it, times it, then fills in the result. Three properties are deliberate:

- **It never blocks the agent.** `transport.enqueue(span)` is fire-and-forget.
- **It fails open.** Any SDK exception is logged and the original function is re-run, so a bug in the observability layer cannot take down the agent.
- **It propagates the trace.** The returned dict gets `__agentpulse_trace_id` and `__agentpulse_parent_span_id` stamped into it, which is how a LangGraph state dict carries the trace to the next node and the waterfall gets its parent-child shape.

Sampling happens here too: `config.sampling_rate < 1.0` drops spans before any work is done.

### Step 2 — privacy filtering decides what text survives

Still inside the decorator, in `_finalize_span`:

- `input_hash` / `output_hash` are **always** computed (a hash of the serialized state).
- `input_summary` / `output_summary` are only attached if `privacy.should_capture_input()` / `should_capture_output()` allow it, and they are truncated and redacted first.

The defaults in `.env.example` are `AGENTPULSE_CAPTURE_INPUTS=false` and `AGENTPULSE_CAPTURE_OUTPUTS=false`.

**This is the single most important configuration fact in the system.** The grounding check compares `input_summary` against `output_summary`. With capture off, both are `None`, and in `evaluator.py`:

```python
if input_text and output_text:
    result.grounding = evaluate_grounding(input_text, output_text)
```

…the grounding step simply does not run. No error, no warning — the signal is just absent. If the dashboard shows spans with no grounding score, check this before anything else.

### Step 3 — POST /v1/ingest

`backend/app/routers/ingest.py:85`

The API, in one transaction:

1. ensures the `Trace` row exists,
2. checks whether the `span_id` is already known — if so it counts a duplicate and does **not** re-insert (a repeat POST used to violate the primary key and fail the entire batch with a 500),
3. inserts the `Span`,
4. updates the `AgentRecord` registry.

Then, in a **separate** transaction, it enqueues one evaluation job per span. The ordering is intentional and commented in the source: spans are the record of what happened and must persist even if enqueueing fails.

Returns **202 Accepted**. Nothing in this path waits for an evaluation.

### Step 4 — the durable queue

`backend/app/services/job_queue.py`

| Knob | Value |
| :--- | :--- |
| Lease duration | 120 s |
| Max attempts | 3 |
| Terminal failure state | `dead_letter` |
| Deduplication | `job_key` UNIQUE constraint |

A worker leases a job for 120 seconds. If it dies mid-evaluation the lease expires and `recover_expired_leases()` hands the job back, recording `"reclaimed after lease expiry (worker presumed dead)"`.

That gives **at-least-once** delivery, not exactly-once — so the same span can legitimately be evaluated twice. The guard against double-writing is in `evaluation_runner.persist_results()`: it checks whether an `Evaluation` row already exists for the span and returns `False` if so. Execution may repeat; the *effect* is exactly-once.

### Step 5 — the worker picks it up

`backend/app/worker.py`

| Knob | Value |
| :--- | :--- |
| Poll interval | 0.5 s |
| Lease-recovery sweep | every 30 s |
| Heartbeat | every 15 s |
| Evaluation thread pool | `max_workers=1` |

The pool is deliberately single-threaded. Torch and ONNX Runtime each spawn their own thread pools; letting several evaluations run concurrently on top of that oversubscribes the CPU rather than speeding anything up.

Before evaluating, the runner fetches **prior agent outputs** from the same trace — `fetch_prior_agent_outputs()`, up to 12, ordered by `(start_time, rowid)`. The rowid tiebreak is not cosmetic: `start_time` ties constantly because clock granularity groups fast spans, and `span_id` is random hex, so without rowid the trace order would be arbitrary. These priors are what make cross-agent disagreement detectable at all.

### Step 6 — the four signals run

`backend/app/services/evaluator.py:evaluate_span()` — detailed in Section 4.

### Step 7 — results are persisted

One `Evaluation` row, optionally one `DriftRecord`, zero or more `Alert` rows. Then:

- the agent's `avg_risk_score` is updated as an EMA: `old * 0.95 + new * 0.05`
- the trace's `overall_risk_score` becomes the **max** of its spans, not the mean — one bad span is what makes a trace worth opening
- the trace's status is set to `completed`

### Step 8 — the dashboard sees it

The SPA polls REST and also holds a WebSocket at `/v1/ws/live`.

---

## 4. The four signals in detail

### 4.1 Grounding — `services/grounding.py`

**Question:** does the output follow from the input?

The input text becomes the NLI **premise**, the output text the **hypothesis**. DeBERTa returns three probabilities. Label order in this model is `contradiction=0, neutral=1, entailment=2`.

```python
grounding_score = contradiction_prob + 0.5 * neutral_prob
```

The `0.5` is `NEUTRAL_RISK_WEIGHT` and it is the most carefully justified constant in the codebase. The obvious formula, `1 - entailment_prob`, scores neutral exactly as harshly as contradiction. DeBERTa classifies verbatim and near-verbatim pairs as *neutral* far more often than *entailment* — those pairs are out of distribution for a model trained on real NLI data — so the obvious formula made well-supported claims read as near-maximum risk. Weighting neutral at half of contradiction moved held-out F1 from 0.703 to 0.963 and the false positive rate from 0.647 to 0.059.

`0.5` was chosen as a principled default, not fitted — the dev split was too small to discriminate between candidate weights. Say that plainly if asked.

Score runs 0.0 (grounded) → 1.0 (ungrounded).

### 4.2 Tool-claim — `services/tool_claim.py`

**Question:** did the agent claim something about a tool that is not true?

Three mismatch types:

| Type | Meaning |
| :--- | :--- |
| `FABRICATED_TOOL` | the output names a tool that was never called |
| `WRONG_COUNT` | "found 12 results" when the tool returned 3 |
| `RESULT_DISTORTION` | claims success where the tool reported failure |

`tool_claim_score` is the fraction of claims that mismatched.

`WRONG_COUNT` depends entirely on a `result_count` being present. Without it the check returns early, which is why `evaluation_runner.py` runs `extract_result_count(tool_result_summary)` to pull a number out of the tool's result text with regex before handing it over. No count extracted, no `WRONG_COUNT` — ever.

### 4.3 Disagreement — `services/disagreement.py`

**Question:** does this agent contradict an earlier agent in the same trace?

When prior outputs are available, the current output is compared against **all** of them, and the worst contradicting pair becomes `result.disagreement`. When none are, it falls back to comparing only the immediate upstream agent.

If nothing is flagged, the closest comparison is still recorded — so a clean check looks different from a skipped one.

### 4.4 Drift — `services/drift.py`

**Question:** has this agent's behaviour moved away from its own past?

This is the signal with the most history behind it, and it carries **two** distance metrics that measure genuinely different things.

| Metric | What it compares | Behaviour |
| :--- | :--- | :--- |
| `centroid_distance` | one output vs an EMA centroid (α = 0.05) | spike detector |
| `window_centroid_distance` | 20-sample baseline pool vs 12-sample current window | sustained-shift detector |

On 500 real agent sessions, `centroid_distance` flagged **91.7%** of completely unchanged operation at the 0.30 threshold. It is not broken — it is measuring a multi-step agent's normal step-to-step variety, which is large. Averaging over a window removes that variety: same threshold, same embeddings, **6.8%** false alarms and AUC 0.9532.

**The `DRIFT_DETECTED` alert therefore fires on `window_centroid_distance`, not on `centroid_distance`.** Both are still stored, because a single sharp output scores ~2.0 on the spike metric and ~0.0 on the window metric. Neither replaces the other.

Practical consequence: window drift needs **32 evaluated spans** for one agent (20 baseline + 12 window) before it can produce a number at all. A fresh deployment will show no drift for a while. That is the metric working, not missing data.

**ASI — Agent Stability Index**, 0–100, higher is better:

| Component | Weight |
| :--- | ---: |
| Output semantic stability | 0.35 |
| Quality / risk stability | 0.30 |
| Error-rate stability | 0.20 |
| Tool-use stability | 0.15 |

---

## 5. Risk aggregation

`evaluator.py:_aggregate_risk()` — a weighted mean over whichever signals actually produced a value:

| Signal | Weight |
| :--- | ---: |
| grounding | 0.40 |
| tool_claim | 0.25 |
| disagreement | 0.20 |
| semantic | 0.15 |

The divisor is the sum of the weights **present**, not a fixed 1.0. A span with only grounding gets grounding's raw score, not a score diluted by three absent signals.

Note that `RISK_WEIGHTS` declares a `semantic: 0.15` entry that `_aggregate_risk()` never reads — only grounding, tool_claim and disagreement are summed.

Labels: `> 0.7` → `high_risk`, `> 0.4` → `medium_risk`, else `low_risk`.

---

## 6. Alerts

`services/alerting.py`. Seven rules, all threshold comparisons:

| Alert | Fires on | Threshold | Severity |
| :--- | :--- | :--- | :--- |
| `HIGH_HALLUCINATION_RISK` | `risk_score` > | 0.7 | HIGH |
| `GROUNDING_FAILURE` | `grounding_score` > | 0.7 | HIGH |
| `TOOL_CLAIM_MISMATCH` | `tool_claim_score` > | 0.3 | HIGH |
| `AGENT_DISAGREEMENT` | `disagreement_score` > | 0.6 | HIGH |
| `ERROR_RATE_SPIKE` | `error_rate_delta` > | 0.2 | HIGH |
| `DRIFT_DETECTED` | `window_centroid_distance` > | 0.3 | MEDIUM |
| `ASI_DROP` | `stability_index` < | 50 | MEDIUM |

Two suppression layers:

- **Cooldown** — 900 s per `(alert_type, agent_id)` pair. The same agent cannot raise the same alert twice within fifteen minutes.
- **Storm suppression** — 50 alerts/hour globally, after which `evaluate()` returns an empty list and logs a warning.

A metric that is `None` is skipped, never treated as zero.

---

## 7. Where to look, and what you are looking at

Eight pages, grouped by what you are trying to do.

| Page | Component | What it answers |
| :--- | :--- | :--- |
| **Overview** | `OverviewView.tsx` | Is anything wrong right now? |
| **Traces** | `TracesView.tsx` | Which runs happened, and which were risky? |
| **Incidents** | `IncidentsView.tsx` | What fired, and has anyone acknowledged it? |
| **Replay** | `ReplayView.tsx` | Step through one trace span by span |
| **Drift & Stability** | `DriftView.tsx` | Is an agent's behaviour moving? |
| **Agents** | `AgentsView.tsx` | Per-agent roster, risk, ASI |
| **Experiments / Datasets** | `ExperimentsView.tsx`, `DatasetsView.tsx` | Curated cases and eval runs |
| **Telemetry Lab** | `TelemetryLabView.tsx` | Fire a scenario and watch it land |

### Reading the Overview

- **Spans ingested** — total spans, all time.
- **Avg inference latency** — evaluation latency, not the agent's latency.
- **Active incidents** — unacknowledged alerts; the critical count is the HIGH ones.
- **Behavioural drift** — agents currently over the drift threshold.
- **Agent roster** — one row per agent, with its EMA risk and `DRIFT` badge.

### The one thing to demonstrate

Telemetry Lab → run `tool_mismatch`. Watch a `TOOL_CLAIM_MISMATCH` appear in Incidents, open the span in Replay, and show the claimed count next to the actual tool result. That is the whole system in one loop: real ingest, real model inference, real alert — nothing seeded directly into the database.

For drift, remember Section 4.4: you need 32 evaluated spans for that agent before `window_centroid_distance` exists.

---

## 8. API surface

| Endpoint | Purpose |
| :--- | :--- |
| `POST /v1/ingest` | spans in from the SDK → 202 |
| `POST /v1/simulate` | run a built-in scenario |
| `GET /v1/traces`, `/v1/traces/{id}` | trace list and detail |
| `GET /v1/agents`, `/v1/agents/{id}/health` | agent registry |
| `GET /v1/drift` | drift records |
| `GET /v1/alerts`, `PATCH /v1/alerts/{id}` | incidents, acknowledgement |
| `GET /v1/metrics` | the Overview tiles |
| `GET /v1/platform` | AgentPulse's own operational state |
| `GET /v1/experiments`, `/v1/datasets` | research surface |
| `WS /v1/ws/live` | live push |
| `GET /v1/health`, `/health/live`, `/health/ready`, `/health/evaluator` | health |

---

## 9. Configuration that changes behaviour

| Variable | Default | Effect if you get it wrong |
| :--- | :--- | :--- |
| `AGENTPULSE_CAPTURE_INPUTS` / `_OUTPUTS` | `false` | **grounding silently never runs** |
| `AGENTPULSE_USE_ONNX` | `true` | falls back to PyTorch; slower, same results, reported as `degraded` |
| `AGENTPULSE_HALLUCINATION_THRESHOLD` | `0.7` | moves two alerts at once |
| `AGENTPULSE_DRIFT_THRESHOLD` | `0.3` | validated at this value; AUC 0.991 |
| `AGENTPULSE_ASI_LOW_THRESHOLD` | `50` | `ASI_DROP` sensitivity |
| `AGENTPULSE_ALERT_COOLDOWN_SECONDS` | `900` | per agent, per type |
| `AGENTPULSE_ALERT_MAX_PER_HOUR` | `50` | global cap |
| `VITE_API_URL` | *(empty)* | non-empty on a server points every visitor's browser at their own machine |

---

## 10. Where the code differs from its own documentation

Read this section before a viva.

### 10.1 The "two-stage cascade" does not cascade

`grounding.py`'s module docstring says:

> Stage 2: DeBERTa NLI (accurate, slower ~80ms) — only when Stage 1 is ambiguous

`STAGE1_SAFE_THRESHOLD = 0.85` and `STAGE1_RISK_THRESHOLD = 0.40` are defined right below it. But `evaluate_grounding()` reads:

```python
similarity = compute_semantic_similarity(source_text, claim_text)   # stage 1
result = compute_nli_grounding(source_text, claim_text)             # stage 2
if result:
    result.semantic_similarity = similarity
    return result
```

There is no gate. **Stage 2 runs on every span.** `STAGE1_RISK_THRESHOLD` is never read anywhere in the codebase — only mentioned in a comment in `disagreement.py`. `STAGE1_SAFE_THRESHOLD` is used in exactly one place: the fallback branch that runs when the NLI model failed to load.

So what exists is not a cost-saving cascade. It is: run both models, prefer NLI, and degrade to similarity-only if NLI is unavailable. That is a reasonable design — but it is a different design, and the Stage 1 cost is added to every evaluation rather than saving anything.

### 10.2 Liveness and readiness probes require authentication

Measured on the live deployment:

```
/v1/health            no-key=200   with-key=200
/v1/health/live       no-key=401   with-key=200
/v1/health/ready      no-key=401   with-key=200
/v1/health/evaluator  no-key=401   with-key=200
```

This is backwards. `live` and `ready` are exactly the endpoints Kubernetes, Azure Load Balancer and uptime monitors probe *without* credentials.

It has already caused one silent failure: `deploy/huggingface/seed_demo.py` probes `/v1/health/live` with no key, retries for two minutes, prints `"[seed] API never became reachable; skipping"` and exits having seeded nothing — which reads like a successful run.

### 10.3 `RISK_WEIGHTS["semantic"]` is dead

Declared at 0.15, never read by `_aggregate_risk()`.

### 10.4 The embedding model has no ONNX path

`AGENTPULSE_USE_ONNX` only affects the NLI model. `backend_info()` says so directly: the embedding model is loaded through SentenceTransformer and always reports `embedding_backend: "pytorch"`. This is the reason the worker cannot be made to fit in 512 MB by flipping a config flag — torch is loaded either way.
