# AgentPulse

A lightweight, self-hostable observability SDK for continuous grounding-risk and drift monitoring in multi-agent LLM systems.

**Live demo:** https://agentpulse.centralindia.cloudapp.azure.com — a running instance with real evaluated telemetry, not screenshots. Reading is open to everyone; you need no account for the chat or the Telemetry Lab.

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.0+-61DAFB.svg)](https://react.dev/)
[![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC.svg)](tests/)

Existing LLM observability tools trace tokens, latency, and cost well, but treat quality evaluation as an optional, sampled add-on. AgentPulse instead runs its evaluator on every captured span, with two small local models and no LLM judge. Of its four signals, grounding and drift held up when measured; tool-claim validation and inter-agent disagreement did not hold up on real traces, and this README says so below rather than listing them as features.

**State of the project (2026-10-27):** a research prototype, version 0.1.0, ready for a demo and a viva rather than for production. It is one M.Tech project by one student, running on one small Azure VM. The limits are in "Known limits" below, in [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) section 29.12.3 and in each report. Where to start: [`DEMO_GUIDE.md`](DEMO_GUIDE.md) (the five-minute demo of the live chat), [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md) (a guided tour of the code) and [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) (the full history, newest state in section 29).

## What works live

Checked from outside on 2026-10-27 (`docs/E2E_TEST_2026-10-27.md` has the evidence, request by request):

- **A chat with three agents.** The RAG Live tab (or `/chat`) answers a question with a retriever, a verifier and an answerer, each one real model call. The model chain is Groq, then NVIDIA, OpenRouter and Pollinations; Cerebras is in the code but not used on the live site (its console asked for a payment method). Two turns on 2026-10-27 took 1.6 s and 6.1 s with all three agents answered by Groq. Each span is then scored by the worker and shows up in the console. Limits per visitor: 5 questions a minute, 40 a day, 500 characters; 300 a day for the whole site.
- **The Telemetry Lab.** Five scenarios (clean, hallucination, tool-claim mismatch, drift, disagreement) injected into a five-agent pipeline; the real evaluator scores them and the page reads the result back from the API. Open to visitors: 6 runs per IP per hour, 30 per IP per day, 300 per day for the site. An alert type is raised once per agent in 15 minutes, so a repeat run can show high scores and no new alert.
- **The console.** Overview, RAG Live, Agents, Traces (filters, three views, JSON/CSV export), Performance (APM), Incidents, Drift, Telemetry Lab, Settings, and under "More" Replay, Experiments (empty on the live instance: it has no `experiments/results`) and Datasets. Dark, Chalk and Butter palettes. A value that was not measured is shown as "—", "unknown" or "not scored", never as 0.
- **The SDK.** `pip install -e ./sdk` from this repo (see Quickstart): a decorator, an OpenAI/Anthropic client wrapper and a LangGraph adapter send spans to `POST /v1/ingest`. On the public site a write needs a key, so to send your own agent's spans you run your own instance (Quickstart) or ask the owner for a key.
- **Closed on purpose.** `/v1/keys` (every case variant) and every write except `POST /v1/simulate` and the chat return 401 to a visitor.

## Architecture in short

```
your agent --SDK--> POST /v1/ingest --> SQLite (WAL) + durable job queue
                                              |
                         worker process <-----+   scores every span on CPU:
                         MiniLM embeddings + DeBERTa NLI -> grounding, drift,
                         tool-claim, disagreement -> alert rules (with cooldowns)
                                              |
FastAPI REST + WebSocket <--------------------+ --> React dashboard
```

Backend: FastAPI (`backend/app/`), one SQLite file, a worker that leases jobs from a table. Evaluator models run locally (no LLM judge). Dashboard: React 19 + TypeScript + Tailwind (`dashboard/`). The public site is Docker Compose on one VM: Caddy (TLS, the write password) in front of nginx (the dashboard, and the server's key added to reads), the backend, the worker, and the chat service (`demo/chat_server.py`, its own container) that runs the three-agent turn and reports its spans to the backend. Deploy: `deploy/azure/README.md`. Code tour: `CODE_WALKTHROUGH.md`; every threshold and path: `HOW_IT_WORKS.md`.

## Known limits (stated plainly)

- **Inter-agent disagreement does not work on real traces.** It found 0 of 10 independently labelled contradictions; the alert is withdrawn and the score is only stored.
- **Tool-claim validation does not work on real traces.** F1 0.000 on a real-data benchmark; it only fires when an agent writes a count in digits (it was 0.842 on 19 hand-written cases).
- **Grounding quality is measured on 68 hand-labelled cases** (39 supported, 29 failures; `GROUNDING_RECALIBRATION_2026-10.md`), 5 of the 30 test cases copy dev cases, and the 0.3 weight is a design choice. This is a small sample, not a benchmark of production traffic.
- **Drift:** only 24.5% of real sessions were long enough (32 outputs) to report a distance at all.
- **Spans with nothing to compare with** (no captured input, or a premise that only restates the prompt) get "unverifiable", not "safe". In the one chat turn read on 2026-10-27 the retriever span was "unverifiable" (grounding 0.306) and the verifier and answerer spans "supported" (0.135 and 0.027); one turn is not a rate.
- **One VM, one SQLite file.** No replication. The nightly backup is on the same disk. The Lab's rate-limit counters live in the backend's memory and reset on every restart or deploy. The evaluator is one worker.
- **Free LLM tiers.** The chat depends on providers' free quotas; when they are used up a turn is slow or refused, and the page says so.
- **Latency figures are single runs on one machine** (see "Testing and benchmarks").
- **Shared demo data.** Visitors' chat questions and Lab runs are stored and readable on the site; the page says not to type anything personal.

## Documentation

- [DEMO_GUIDE.md](DEMO_GUIDE.md) — the five-minute demo of the live chat, what to say and what not to claim; [DEMO.md](DEMO.md) is the ten-minute script for the whole console
- [docs/E2E_TEST_2026-10-27.md](docs/E2E_TEST_2026-10-27.md) — the end-to-end test of the live site, PASS/FAIL with evidence, and what it did not cover
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — the project's full history and the current state (section 29), for anyone taking over
- [FLOW.md](FLOW.md) — start here: what the system does and why, in plain language, following one real call from your code to a red incident on screen
- [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — the specification: one span from the SDK decorator to the screen, every threshold and constant read out of the source
- [STARTUP_GUIDE.md](STARTUP_GUIDE.md) — running it locally, with the failures you are likely to hit
- [deploy/azure/README.md](deploy/azure/README.md) — putting it on a public host with TLS
- [PROJECT_REPORT.md](PROJECT_REPORT.md) — architecture and mathematical formulation
- [THRESHOLD_ANALYSIS.md](THRESHOLD_ANALYSIS.md) — ablation study and threshold sweep, with dev/test separation
- [GROUNDING_RECALIBRATION_2026-10.md](GROUNDING_RECALIBRATION_2026-10.md) — the grounding score re-measured on corrected NLI labels; where the shipped weight (0.3) and its figures come from
- [GROUNDING_SCORE_CALIBRATION_REPORT.md](GROUNDING_SCORE_CALIBRATION_REPORT.md) — the earlier calibration (weight 0.5), run on swapped labels and superseded by the report above; kept as the record
- [CODE_WALKTHROUGH.md](CODE_WALKTHROUGH.md) — one page per area of the code, the path of one span from the SDK to the dashboard, and where each dashboard number comes from
- [REASONING_STRATEGY_EVALUATION_REPORT.md](REASONING_STRATEGY_EVALUATION_REPORT.md) — Direct vs CoT vs AoT, measured on real model inference
- [DRIFT_EXPERIMENT_REPORT.md](DRIFT_EXPERIMENT_REPORT.md) — graded drift detection with negative controls
- [LABEL_AGREEMENT_REPORT.md](LABEL_AGREEMENT_REPORT.md) — labeling protocol and inter-evaluator agreement
- [walkthrough.md](walkthrough.md) — setup and verification guide
- [RELEASING.md](RELEASING.md) — how images and the SDK are published, and the one-time setup that cannot be done from the repo

## What it does

- Instruments LangGraph pipelines. The SDK decorator added 0.005 ms per call (P50 over 2,000 calls, `benchmarks/benchmark_results.json`, 2026-08-18).
- Works without any agent framework by wrapping an OpenAI or Anthropic client directly, which is also where the prompt and completion the grounding evaluator compares are available. (Dedicated LangChain and CrewAI adapters are still not implemented.)
- Scores every span for grounding risk with two models run in sequence: MiniLM embedding similarity and a DeBERTa NLI classifier. Both run on every span; the NLI result is the score (`contradiction + 0.3 × neutral`, high above 0.7, medium above 0.4), and the similarity is kept alongside it. On the 30-case test split both cut-offs give F1 0.963 and a false-positive rate of 0.059 (1 of 17 supported cases); 5 of those 30 cases copy dev cases, and on the 47 truly held-out cases F1 is 0.927 at 0.7 and 0.952 at 0.4, false-positive rate 0.074 (`GROUNDING_RECALIBRATION_2026-10.md`, T3c and T3d). The 0.3 weight is a design choice, not a fit. A separate status says when the evidence neither supports nor contradicts an output ("unverifiable").
- Tracks per-agent drift. `DRIFT_DETECTED` fires when the mean embedding of an agent's latest 12 outputs is more than 0.30 (cosine distance) from the mean of its first 20. Offline, on a held-out split of an external real-trace corpus measured once, that gave 1.5% false alarms and 91.9% detection, but only 24.5% of sessions were long enough to report a distance at all (`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.3, 11.5). An Agent Stability Index (0-100) is kept beside it.
- Checks digit counts that an output states against the tool's recorded result count (tool-claim). **Measured negative result:** on real agent traces it extracted no claim at all from 8,353 prose spans, and on a real-data benchmark it scored F1 0.000, against 0.842 on 19 hand-written cases that used the phrasing its regex expects (`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` section 10, `COMPETITIVE_POSITIONING.md` 5.1). It only fires when an agent writes the count in digits.
- Computes an inter-agent disagreement score (NLI between agents' outputs in one trace) and stores it, but raises no alert. **Measured negative result:** on real multi-agent traces it detected 0 of 10 independently labelled contradictions, and with the planner agent excluded it scored at chance (AUC 0.457), so the alert was withdrawn (`COMPETITIVE_POSITIONING.md` 5.2, `SESSION_HANDOFF.md` 14.1 and 24.9.5).
- Lets an operator curate a production trace directly into a versioned evaluation dataset from the dashboard.

## Quickstart

### Install

```bash
git clone https://github.com/Soum-Code/agentpulse.git
cd agentpulse
pip install -e "./sdk[dev]"
pip install -e "./backend[dev]"
```

> Install from source only. The name `agentpulse` on PyPI belongs to an unrelated
> project, so `pip install agentpulse` will fetch someone else's package rather
> than this one.

### Run the API

```bash
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

### Run the evaluation worker

```bash
PYTHONPATH=backend python -m app.worker
```

Run it from the repository root, like the API. The database path in the default
settings (`./data/agentpulse.db`) is relative to the working directory, so a worker
started inside `backend/` opens a different, empty database from the API's.

**This process is not optional.** The API accepts spans and returns 202 without it,
but nothing is ever evaluated: no grounding score, no drift, no alerts. The first
start takes 30-60 seconds while MiniLM and DeBERTa load.

### Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:3000` (the dev server's port, set in `dashboard/package.json`; the Docker image serves the built dashboard on 5173).

Grounding compares a span's captured input against its captured output, and capture
is off by default. To see grounding scores at all, set `AGENTPULSE_CAPTURE_INPUTS`
and `AGENTPULSE_CAPTURE_OUTPUTS` to `true` — otherwise the signal is silently absent
rather than wrong.

## SDK usage

Instrumenting a LangGraph `StateGraph`:

```python
from langgraph.graph import StateGraph
from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter

pulse = AgentPulse(service_name="research_pipeline", endpoint="http://localhost:8000")
adapter = LangGraphAdapter(pulse)

graph = StateGraph(AgentState)
graph.add_node("researcher", researcher_node)
graph.add_node("verifier", verifier_node)

adapter.instrument_graph(graph, {
    "researcher": "Query Planner",
    "verifier": "Claim Verifier",
})

app = graph.compile()
```

Without a framework, by wrapping the LLM client:

```python
from openai import OpenAI
from agentpulse import AgentPulse

pulse = AgentPulse(
    endpoint="http://localhost:8000",
    capture_inputs=True,
    capture_outputs=True,
)
client = pulse.instrument_llm(OpenAI())

client.chat.completions.create(          # recorded, scored, unchanged
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "..."}],
)
```

Every completion becomes an LLM span carrying the model, token counts and
latency. With the capture flags on it also carries the prompt and the
completion, which is the pair grounding compares — so this is the path to a
grounding score for agents that are not built on LangGraph. Anthropic clients
work the same way, sync or async.

Using the decorator directly:

```python
from agentpulse import AgentPulse

pulse = AgentPulse(service_name="analyst_worker")

@pulse.monitor(agent_id="analyst", role="Synthesis Engine")
async def analyze_evidence(state: dict) -> dict:
    return {"synthesis": "verified research synthesis"}
```

## Testing and benchmarks

```bash
pytest tests/ -v
python benchmarks/run_benchmarks.py
```

Current state, re-run on 2026-10-27 on `main` at `329d4ab` plus the comment-only and two
small layout changes of the pull request that wrote this paragraph (Windows 11, the repo's
`.venv`, models cached and loaded offline): **628 passed** in the backend suite (`pytest tests/`,
4 min 12 s, 7 deprecation warnings), and **404 passed** in 35 files in the dashboard
(`cd dashboard && npm test`), with `tsc --noEmit` clean. These replace the earlier counts
(422 and 136, run on `2fefb91` on 2026-10-25), which were from before the public chat, the
Telemetry Lab's limits and the dashboard redo.

Eight backend tests (`test_grounding_truncation.py`, `test_inference_backend.py`,
`test_durable_queue.py::TestWorkerEntryPoint`, `test_simulate_scenarios.py`) load the real
models and fail with "couldn't connect to huggingface.co" when the model cache is not found
(the cache path defaults to `./models` relative to where you run pytest). Point
`AGENTPULSE_MODEL_CACHE_DIR` at the cache, or run once online, and they pass. Also check the
SDK is installed into the environment you run from: a stale editable install once made two
test files stop collecting without failing anything. `pytest tests/ --collect-only -q` should
end in 628.

Benchmark results from `benchmarks/run_benchmarks.py`, one run on 2026-08-18
(`benchmarks/benchmark_results.json`; Windows 11, 16 logical cores, CPU only,
PyTorch inference, not the ONNX backend the worker uses):

| Measurement | P50 | P95 | Samples |
| :--- | :---: | :---: | :---: |
| SDK in-memory enqueue capacity | 5,396,829 spans/sec (synthetic buffer throughput, not network throughput) | — | 50,000 appends |
| SDK decorator overhead | 0.005 ms | — | 2,000 calls |
| MiniLM embedding inference | 15.1 ms | 18.5 ms | 100 |
| DeBERTa NLI inference | 88.5 ms | 140.5 ms | 50 |
| Full evaluator (both models) | 122.3 ms | 172.2 ms | 9 |

The full-evaluator row is one pass of `EvaluationPipeline.evaluate_span` over the 9
cases in that script's own dataset, so its P95 is an interpolation between the two
slowest runs, and the disagreement step ran for only one of the nine. A larger run
on the same PyTorch path, the 30-case ablation of 2026-09-18
(`experiments/results/ablation_results.json`), measured 151.19 ms per case for the two
grounding models together and 165.18 ms for the full pipeline; the 2026-08-23 run of
that script had measured 215.9 ms for the former. Treat any single latency figure here
as a measurement of one run on one machine, not a constant.

### Numbers and where they come from

| Number | Value | Source | Date |
| :--- | :--- | :--- | :--- |
| Grounding F1 / false-positive rate, 30-case test split (5 cases copy dev) | 0.963 / 0.059 | `GROUNDING_RECALIBRATION_2026-10.md` (T3c) | 2026-10-22 analysis |
| Grounding F1 on the 47 truly held-out cases | 0.927 at 0.7, 0.952 at 0.4; FPR 0.074 | same report (T3d) | 2026-10-22 |
| Hand-labelled cases behind the grounding numbers | 68 (39 supported, 29 failures) | same report | 2026-10-22 |
| Drift on a real-trace corpus: false alarms / detection / sessions long enough | 1.5% / 91.9% / 24.5% | `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.3, 11.5 | 2026-08-27, measured once on a held-out split |
| Tool-claim F1 on real traces | 0.000 (8,353 prose spans, no claim extracted) | `TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` section 10 | 2026-08-27 |
| Disagreement on real multi-agent traces | 0 of 10 contradictions found; AUC 0.457 without the planner | `COMPETITIVE_POSITIONING.md` 5.2; `SESSION_HANDOFF.md` 24.9.5 | 2026-08-26 report, re-checked in the 2026-10 refusal run |
| Evaluator latency per case (two grounding models / full pipeline) | 151.19 ms / 165.18 ms, PyTorch, one machine | `experiments/results/ablation_results.json` | 2026-09-18 |
| Evaluator median latency over 30 cases vs an LLM judge | 202.94 ms vs 3,170.39 ms | `LLM_JUDGE_COMPARISON_REPORT.md` | 2026-08-26 (latency unaffected by the 2026-10-25 label correction) |
| SDK decorator overhead | 0.005 ms (P50, 2,000 calls) | `benchmarks/benchmark_results.json` | 2026-08-18 |
| Chat turn on the live site | 1.6 s and 6.1 s (two turns, all agents on Groq) | `SESSION_HANDOFF.md` 29.17.3; `docs/E2E_TEST_2026-10-27.md` | 2026-10-27 |
| Tests | backend 628 passed, dashboard 404 passed | the re-run in this section | 2026-10-27 |

## Docker deployment

```bash
cp .env.example .env
docker compose up --build -d
```

Set `AGENTPULSE_API_KEY` in `.env` to a real value (for example `openssl rand -hex 24`) before the first `docker compose up`: the compose files run the backend with `AGENTPULSE_LOCAL_DEV_MODE=false`, and in that mode it refuses to start while the key is still the placeholder from `.env.example`. A plain local run without Docker (`AGENTPULSE_LOCAL_DEV_MODE` unset, which means on) is not affected.

## License

MIT. See [LICENSE](LICENSE).
