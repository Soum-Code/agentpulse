# AgentPulse

A lightweight, self-hostable observability SDK for continuous grounding-risk and drift monitoring in multi-agent LLM systems.

**Live demo:** https://agentpulse.centralindia.cloudapp.azure.com — a running instance with real evaluated telemetry, not screenshots.

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.0+-61DAFB.svg)](https://react.dev/)
[![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC.svg)](tests/)

Existing LLM observability tools trace tokens, latency, and cost well, but treat quality evaluation as an optional, sampled add-on. AgentPulse instead runs its evaluator on every captured span, with two small local models and no LLM judge. Of its four signals, grounding and drift held up when measured; tool-claim validation and inter-agent disagreement did not hold up on real traces, and this README says so below rather than listing them as features.

**State of the project (2026-10-25):** a research prototype, version 0.1.0, ready for a demo and a viva rather than for production. The limits are listed in [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) section 29.12.3 and in each report. For a guided tour of the code, start with [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md).

## Documentation

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

Current state, run on `main` at `2fefb91` on 2026-10-25: **422 passed** in the
backend suite (`pytest tests/`, 5 min 36 s with the models cached, 7 deprecation
warnings), and **136 passed** in 13 files in the dashboard (`cd dashboard && npm test`).

If that total comes out lower, check the SDK is installed into the environment
you are running from: a stale editable install made `test_e2e_langgraph.py` and
`test_integrations.py` stop collecting without failing anything, and pytest
happily reported green over the reduced suite. `pytest tests/ --collect-only -q`
should end in 422.

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

## Docker deployment

```bash
cp .env.example .env
docker compose up --build -d
```

Set `AGENTPULSE_API_KEY` in `.env` to a real value before exposing this beyond localhost — the default is a placeholder.

## License

MIT. See [LICENSE](LICENSE).
