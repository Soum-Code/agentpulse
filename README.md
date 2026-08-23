# AgentPulse

A lightweight, self-hostable observability SDK for continuous grounding-risk and drift monitoring in multi-agent LLM systems.

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![React 18](https://img.shields.io/badge/React-18.3+-61DAFB.svg)](https://reactjs.org/)
[![Tests](https://img.shields.io/badge/Tests-99%2F99%20Passed-brightgreen.svg)](tests/)

Existing LLM observability tools trace tokens, latency, and cost well, but treat quality evaluation as an optional, sampled add-on. AgentPulse instead runs a real evaluator (grounding, tool-claim validation, inter-agent disagreement, drift) on every captured span, so it becomes the default signal rather than a periodic check.

## Documentation

- [PROJECT_REPORT.md](PROJECT_REPORT.md) — architecture and mathematical formulation
- [THRESHOLD_ANALYSIS.md](THRESHOLD_ANALYSIS.md) — ablation study and threshold sweep, with dev/test separation
- [GROUNDING_SCORE_CALIBRATION_REPORT.md](GROUNDING_SCORE_CALIBRATION_REPORT.md) — neutral-vs-contradiction weighting fix for the grounding-score formula
- [REASONING_STRATEGY_EVALUATION_REPORT.md](REASONING_STRATEGY_EVALUATION_REPORT.md) — Direct vs CoT vs AoT, measured on real model inference
- [DRIFT_EXPERIMENT_REPORT.md](DRIFT_EXPERIMENT_REPORT.md) — graded drift detection with negative controls
- [LABEL_AGREEMENT_REPORT.md](LABEL_AGREEMENT_REPORT.md) — labeling protocol and inter-evaluator agreement
- [walkthrough.md](walkthrough.md) — setup and verification guide

## What it does

- Instruments LangGraph pipelines with near-zero overhead (LangChain and CrewAI adapters are not yet implemented).
- Scores every span for grounding risk using a two-stage cascade: MiniLM embedding similarity, then DeBERTa NLI when the embedding stage is ambiguous.
- Validates tool-claim assertions deterministically (tool name, result counts) against actual tool execution records.
- Detects contradictions between agents in a multi-agent pipeline.
- Tracks per-agent drift (embedding centroid shift, tool-use entropy, error rate) as a single 0-100 Agent Stability Index.
- Lets an operator curate a production trace directly into a versioned evaluation dataset from the dashboard.

## Quickstart

### Install

```bash
git clone <repository-url>
cd agentpulse
pip install -e "./sdk[dev]"
pip install -e "./backend[dev]"
```

### Run the backend

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`.

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

Current benchmark results (`benchmarks/benchmark_results.json`, CPU-only):

| Measurement | P50 | P95 |
| :--- | :---: | :---: |
| SDK in-memory enqueue capacity | 5,396,829 spans/sec (synthetic buffer throughput, not network throughput) | — |
| SDK decorator overhead | 0.005 ms | — |
| MiniLM embedding inference | 15.1 ms | 18.5 ms |
| DeBERTa NLI inference | 88.5 ms | 140.5 ms |
| Full evaluator cascade | 122.3 ms | 172.2 ms |

## Docker deployment

```bash
cp .env.example .env
docker compose up --build -d
```

Set `AGENTPULSE_API_KEY` in `.env` to a real value before exposing this beyond localhost — the default is a placeholder.

## License

MIT. See [LICENSE](LICENSE).
