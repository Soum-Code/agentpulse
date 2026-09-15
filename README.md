# AgentPulse

A lightweight, self-hostable observability SDK for continuous grounding-risk and drift monitoring in multi-agent LLM systems.

**Live demo:** https://agentpulse-demo.centralindia.cloudapp.azure.com — a running instance with real evaluated telemetry, not screenshots.

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.0+-61DAFB.svg)](https://react.dev/)
[![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC.svg)](tests/)

Existing LLM observability tools trace tokens, latency, and cost well, but treat quality evaluation as an optional, sampled add-on. AgentPulse instead runs a real evaluator (grounding, tool-claim validation, inter-agent disagreement, drift) on every captured span, so it becomes the default signal rather than a periodic check.

## Documentation

- [FLOW.md](FLOW.md) — start here: what the system does and why, in plain language, following one real call from your code to a red incident on screen
- [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — the specification: one span from the SDK decorator to the screen, every threshold and constant read out of the source
- [STARTUP_GUIDE.md](STARTUP_GUIDE.md) — running it locally, with the failures you are likely to hit
- [deploy/azure/README.md](deploy/azure/README.md) — putting it on a public host with TLS
- [PROJECT_REPORT.md](PROJECT_REPORT.md) — architecture and mathematical formulation
- [THRESHOLD_ANALYSIS.md](THRESHOLD_ANALYSIS.md) — ablation study and threshold sweep, with dev/test separation
- [GROUNDING_SCORE_CALIBRATION_REPORT.md](GROUNDING_SCORE_CALIBRATION_REPORT.md) — neutral-vs-contradiction weighting fix for the grounding-score formula
- [REASONING_STRATEGY_EVALUATION_REPORT.md](REASONING_STRATEGY_EVALUATION_REPORT.md) — Direct vs CoT vs AoT, measured on real model inference
- [DRIFT_EXPERIMENT_REPORT.md](DRIFT_EXPERIMENT_REPORT.md) — graded drift detection with negative controls
- [LABEL_AGREEMENT_REPORT.md](LABEL_AGREEMENT_REPORT.md) — labeling protocol and inter-evaluator agreement
- [walkthrough.md](walkthrough.md) — setup and verification guide

## What it does

- Instruments LangGraph pipelines with near-zero overhead.
- Works without any agent framework by wrapping an OpenAI or Anthropic client directly, which is also where the prompt and completion the grounding evaluator compares are available. (Dedicated LangChain and CrewAI adapters are still not implemented.)
- Scores every span for grounding risk with two models run in sequence: MiniLM embedding similarity and a DeBERTa NLI classifier. Both run on every span; the NLI result is the score, and the similarity is kept alongside it.
- Validates tool-claim assertions deterministically (tool name, result counts) against actual tool execution records.
- Detects contradictions between agents in a multi-agent pipeline.
- Tracks per-agent drift (embedding centroid shift, tool-use entropy, error rate) as a single 0-100 Agent Stability Index.
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
cd backend && python -m app.worker
```

**This process is not optional.** The API accepts spans and returns 202 without it,
but nothing is ever evaluated: no grounding score, no drift, no alerts. The first
start takes 30-60 seconds while MiniLM and DeBERTa load.

### Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`.

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

Current state: **226 passed**, plus 32 in the dashboard (`cd dashboard && npm test`).

Current benchmark results (`benchmarks/benchmark_results.json`, CPU-only):

| Measurement | P50 | P95 |
| :--- | :---: | :---: |
| SDK in-memory enqueue capacity | 5,396,829 spans/sec (synthetic buffer throughput, not network throughput) | — |
| SDK decorator overhead | 0.005 ms | — |
| MiniLM embedding inference | 15.1 ms | 18.5 ms |
| DeBERTa NLI inference | 88.5 ms | 140.5 ms |
| Full evaluator (both models) | 122.3 ms | 172.2 ms |

## Docker deployment

```bash
cp .env.example .env
docker compose up --build -d
```

Set `AGENTPULSE_API_KEY` in `.env` to a real value before exposing this beyond localhost — the default is a placeholder.

## License

MIT. See [LICENSE](LICENSE).
