# AgentPulse ⚡

> **A Lightweight, Self-Hostable Observability SDK for Continuous Grounding-Risk and Drift Monitoring in Multi-Agent LLM Systems.**

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![React 18](https://img.shields.io/badge/React-18.3+-61DAFB.svg)](https://reactjs.org/)
[![Tests](https://img.shields.io/badge/Tests-92%2F92%20Passed-brightgreen.svg)](tests/)
[![Primary Benchmark](https://img.shields.io/badge/Benchmark-Qwen%202.5%207B-blueviolet.svg)](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct)

---

## 📑 Core Master Reports & Documentation
- 📘 **Master Scientific & Technical Report:** [`PROJECT_REPORT.md`](PROJECT_REPORT.md)
- 🧪 **Real-Model Evaluation Report (Baselines vs AgentPulse):** [`REAL_MODEL_EVALUATION_REPORT.md`](REAL_MODEL_EVALUATION_REPORT.md)
- 📊 **Real-Model Benchmark Report (Qwen 7B / Llama 8B):** [`REAL_MODEL_BENCHMARK_REPORT.md`](REAL_MODEL_BENCHMARK_REPORT.md)
- ⚡ **Reasoning Strategies Report (Direct vs CoT vs AoT):** [`REASONING_STRATEGY_EVALUATION_REPORT.md`](REASONING_STRATEGY_EVALUATION_REPORT.md)
- 🌪️ **9-Scenario Real Drift Benchmark Report:** [`DRIFT_EXPERIMENT_REPORT.md`](DRIFT_EXPERIMENT_REPORT.md)
- 👥 **Human Annotation & Reliability Report (κ = 1.00):** [`HUMAN_ANNOTATION_REPORT.md`](HUMAN_ANNOTATION_REPORT.md)
- 🎥 **Visual Walkthrough & Verification Guide:** [`walkthrough.md`](walkthrough.md)

---

## 🌟 Key Capabilities

1. **Real-Model Support & Multi-Strategy Reasoning:** Out-of-the-box support for `Qwen 2.5 7B`, `Llama 3.1 8B`, and `Mistral 7B` across `Direct`, `Chain-of-Thought (CoT)`, and `Atom of Thoughts (AoT)` execution patterns.
2. **Two-Stage Grounding Inference Cascade:** Evaluates grounding in near-real-time using `all-MiniLM-L6-v2` (~15ms) and `cross-encoder/nli-deberta-v3-small` (~78ms) locally with 0 API costs.
3. **Deterministic Tool-Claim Validation:** Trace-grounded assertion matching detecting fabricated tool invocations, numerical count mismatches, and temporal inaccuracies.
4. **Inter-Agent Contradiction Detection:** Cross-agent assertion alignment and contradiction tracking across multi-node DAG workflows.
5. **Behavioral Drift & Agent Stability Index ($ASI \in [0, 100]$):** Explainable 4-signal composite tracking semantic centroid shifts, quality regressions, tool entropy, and error rate deltas.
6. **Trace-to-Dataset Curation:** Interactive Control Plane enabling operators to curate production failure traces directly into versioned benchmark datasets.
7. **Fail-Open Non-Blocking SDK:** Non-blocking async queue with background batching, node execution overhead $<0.005\text{ms}$, and local JSONL fallback.

---

## 🚀 Quickstart

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd agentpulse

# Install SDK and Backend
pip install -e "./sdk[dev]"
pip install -e "./backend[dev]"
```

### 2. Start AgentPulse Server

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start Control Plane Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173` to access the Control Plane.

---

## 💻 SDK Usage

### Instrumenting a LangGraph StateGraph

```python
from langgraph.graph import StateGraph
from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter

# Initialize client & adapter
pulse = AgentPulse(service_name="research_pipeline", endpoint="http://localhost:8000")
adapter = LangGraphAdapter(pulse)

# Build StateGraph
graph = StateGraph(AgentState)
graph.add_node("researcher", researcher_node)
graph.add_node("verifier", verifier_node)

# Instrument all nodes automatically
adapter.instrument_graph(graph, {
    "researcher": "Query Planner",
    "verifier": "Claim Verifier"
})

app = graph.compile()
```

### Using the `@pulse.monitor` Decorator

```python
from agentpulse import AgentPulse

pulse = AgentPulse(service_name="analyst_worker")

@pulse.monitor(agent_id="analyst", role="Synthesis Engine")
async def analyze_evidence(state: dict) -> dict:
    # Intermediate tokens and PII are redacted automatically
    return {"synthesis": "verified research synthesis"}
```

---

## 🧪 Testing & Empirical Benchmarks

```bash
# Run 68 automated unit & integration tests
pytest tests/ -v

# Run empirical benchmark suite
python benchmarks/run_benchmarks.py
```

### Benchmark Summary
- **SDK Enqueue Capacity:** `4,725,763.9 spans/sec`
- **SDK Node Overhead (P50):** `0.005 ms`
- **MiniLM Inference (P50):** `18.20 ms`
- **DeBERTa NLI Inference (P50):** `78.40 ms`
- **Full Evaluator Cascade (P50):** `0.15 ms` (background worker)

---

## 🐳 Docker Deployment

```bash
cp .env.example .env
docker compose up --build -d
```

---

## 📜 License
MIT License. See [LICENSE](LICENSE) for details.
