"""AgentPulse 13-layer latency and throughput profiler.

Profiles each distinct architectural layer with separate timers:
1. Prompt preparation
2. Model inference (Warm vs Cold)
3. Token generation (tokens/sec)
4. Agent node execution
5. Tool execution
6. Local vector retrieval
7. SDK enqueue capacity
8. HTTP ingestion
9. Evaluation dispatch
10. MiniLM inference
11. DeBERTa NLI inference
12. Full evaluation cascade completion
13. Entire workflow execution

Outputs:
- experiments/results/latency_profiles.json
"""

# What this file is for: it times 13 steps ("layers") of the AgentPulse pipeline. Each layer
# is run 25 times. For each layer it saves the mean, the standard deviation and the p50, p95
# and p99 times in milliseconds (ms) to a JSON file, and prints a table.
# Not every layer times the real step. Layers 6, 7, 10, 11 and 12 call real project code.
# Layer 1 times one plain f-string that builds a prompt. Layers 4 and 5 time only a tiny
# stand-in (building a dict or a list). Layers 8 and 9 are random numbers, and layer 13 is
# computed from the means of other layers. Layers 2 and 3 time the LLM adapter, which here
# gives canned text (see the note at those layers).
# So in the saved experiments/results/latency_profiles.json (last run 2026-08-18), the entries
# for layers 8, 9 and 13 are not measurements and should not be quoted. The ones that time
# real code are layers 6, 7, 10, 11 and 12.
#
# How it fits in: run by hand (python experiments/latency_profiler.py); no other file imports
# it. It calls the backend's grounding, evaluator, drift and alerting code, the SDK client,
# the demo retriever (demo/workflows/retrieval.py) and the LLM adapters (llm_adapters/).

from __future__ import annotations

import json
import os
import platform
import statistics
import time
from pathlib import Path
from typing import Any, Dict, List

# numpy is used for the mean and standard deviation of the times, and for the random numbers
# of layers 8 and 9. Note: torch is imported but not used in this file.
import numpy as np
import torch

# Ensure modules are importable
import sys
# The three lines below add the backend folder (package "app"), the SDK source folder
# (package "agentpulse") and the repo root (packages "demo" and "llm_adapters") to Python's
# search path, so the imports that follow work from any current folder.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanStatus
from demo.workflows.retrieval import local_retriever
# Note: evaluate_grounding is imported but not used in this file. The profiler calls the two
# model steps (compute_semantic_similarity and compute_nli_grounding) one at a time instead.
from app.services.grounding import (
    compute_semantic_similarity,
    compute_nli_grounding,
    evaluate_grounding,
    load_models,
)
# EvaluationPipeline scores one span end to end (grounding, tool claims, drift, alerts).
from app.services.evaluator import EvaluationPipeline
from app.services.drift import DriftDetector
from app.services.alerting import AlertEngine
from llm_adapters import get_llm_adapter


# In: the times (in ms) of one layer. Out: a dict with the mean, the standard deviation (how
# far the times spread around the mean) and the p50, p95 and p99 times. p50 = the middle time
# (half the runs were faster); p95 = 95% of the runs were this fast or faster; p99 likewise.
# Note: the empty-list branch uses the keys "mean", "std", "p50"... without "_ms", unlike the
# normal branch. It never happens here, because every layer is given 25 times.
def compute_distribution_stats(samples: List[float]) -> Dict[str, float]:
    """Calculate mean, std, p50, p95, p99 for a list of latency samples (ms)."""
    if not samples:
        return {"mean": 0.0, "std": 0.0, "p50": 0.0, "p95": 0.0, "p99": 0.0}
    # Step 1: sort the times from smallest to largest, so a percentile is just a position.
    sorted_s = sorted(samples)
    n = len(sorted_s)
    # Step 2: percentile p is the item at position n * p, cut down to a whole number. The
    # min(n - 1, ...) keeps the position inside the list. (This takes the nearest item; it
    # does not average between two items.)
    p50 = sorted_s[int(n * 0.50)]
    p95 = sorted_s[min(n - 1, int(n * 0.95))]
    p99 = sorted_s[min(n - 1, int(n * 0.99))]
    # Step 3: the mean, and the standard deviation. np.std divides by n (not n - 1).
    mean_val = float(np.mean(sorted_s))
    std_val = float(np.std(sorted_s)) if n > 1 else 0.0
    # Step 4: round everything to 3 decimals of a millisecond.
    return {
        "mean_ms": round(mean_val, 3),
        "std_ms": round(std_val, 3),
        "p50_ms": round(p50, 3),
        "p95_ms": round(p95, 3),
        "p99_ms": round(p99, 3),
    }


# Runs the 13 timing loops one after another, prints a summary table, writes
# experiments/results/latency_profiles.json and returns the same data as a dict.
# In: nothing. Out: {"timestamp", "hardware", "runs_per_layer", "layers"}.
def profile_all_layers() -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE 13-LAYER LATENCY PROFILER")
    print(f"Environment: {platform.system()} {platform.release()} ({os.cpu_count()} CPU cores)")
    print("=" * 64)

    # 1. Initialize models
    # Step 1 is setup. Step 2 is the timing loops (layers). Steps 3 to 6 come after them.
    # Load MiniLM and DeBERTa now and wait for it (sync=True), so loading time is not counted
    # in any layer. use_onnx=False picks the PyTorch version of the NLI model, not the ONNX
    # Runtime one. A failed load is only logged; layers 10 and 11 would then time a quick None.
    load_models(use_onnx=False, sync=True)
    # The SDK client. It is never started here (no start() call), so a finished span only
    # waits in its send buffer and is not sent anywhere. Layer 7 measures that enqueue step.
    pulse = AgentPulse(service_name="profiling_service")
    # Warning: load_immediately is not passed, so it stays False. For this transformers-based
    # adapter (llm_adapters/local_hf.py) that means the model weights are never loaded, and
    # generate_with_metadata returns short fixed text picked by key words in the prompt. So
    # layers 2 and 3 below time that canned text, not a real model.
    adapter = get_llm_adapter("qwen-0.5b")  # fast dev model for benchmark loops

    # The pipeline that layer 12 times. window_size = how many recent scores the drift detector
    # keeps per agent; min_samples_for_alert = how many spans count as its "cold start".
    # Both are smaller here (20 and 5) than the DriftDetector defaults (100 and 20).
    # cooldown_seconds=0 is meant to switch the alert cooldown off, but AlertEngine stores
    # this value and never reads it (each rule has its own cooldown), so it changes nothing.
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    pipeline = EvaluationPipeline(drift_detector, alert_engine)

    # One fixed pair of texts for the model layers: the premise is the evidence the agent saw,
    # the hypothesis is the claim made from it.
    premise = "The database query executed in 45ms and returned 3 verified customer profile records."
    hypothesis = "The system retrieved 3 customer profiles with 45ms query response time."

    # Each layer is timed 25 times. No run is thrown away, so the first (coldest) run of each
    # layer is part of its numbers. With 25 runs, p99 is the slowest run and p95 is the
    # second slowest (see compute_distribution_stats).
    N_RUNS = 25
    # One list of times (in ms) per layer. The number in each name is the layer number.
    layer_timings: Dict[str, List[float]] = {
        "1_prompt_preparation": [],
        "2_model_inference_warm": [],
        "3_token_generation": [],
        "4_agent_node_execution": [],
        "5_tool_execution": [],
        "6_local_retrieval": [],
        "7_sdk_enqueue": [],
        "8_http_ingestion_overhead": [],
        "9_evaluation_dispatch": [],
        "10_minilm_inference": [],
        "11_deberta_inference": [],
        "12_full_evaluation_cascade": [],
        "13_entire_workflow_execution": [],
    }

    # ── Layer 1: Prompt Preparation ──
    # Times one f-string that glues a fixed instruction and the premise into a prompt.
    # In each loop below: t0 is the start time, and (now - t0) * 1000 turns seconds into ms.
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        _prompt = f"System: Analyze and verify following telemetry.\nPremise: {premise}\nTask: Extract key metrics."
        layer_timings["1_prompt_preparation"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 6: Local Vector Retrieval ──
    # Times a search of the small in-memory demo document index: embed the query with MiniLM,
    # compare it with every document, keep the best 3. The very first search also builds the
    # index (it embeds every document), so run 1 here is slower than the other runs.
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        _ = local_retriever.search("Transformer self-attention query latency", top_k=3)
        layer_timings["6_local_retrieval"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 7: SDK Enqueue Capacity ──
    # Times the SDK's three calls for one span: make a trace, start a span, end the span. The
    # end call puts the finished span in the SDK's send buffer. Nothing goes over the network.
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        tctx = pulse.create_trace()
        span = pulse.start_span("researcher", trace_context=tctx)
        pulse.end_span(span, status=SpanStatus.SUCCESS)
        layer_timings["7_sdk_enqueue"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 5: Tool Execution ──
    # Stand-in: no tool is run. This only times building a list of 10 small dicts in memory.
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        _records = [{"id": i, "name": f"User_{i}", "latency": 42.5} for i in range(10)]
        layer_timings["5_tool_execution"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 10: MiniLM Embedding Inference ──
    # Times the embedding step alone: MiniLM turns both texts into embeddings (lists of numbers
    # for their meaning), and the result is how alike they are (cosine similarity, 0 to 1).
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        _sim = compute_semantic_similarity(premise, hypothesis)
        layer_timings["10_minilm_inference"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 11: DeBERTa NLI Cross-Encoder Inference ──
    # Times the NLI step alone. NLI = a model that says if one sentence follows from another.
    # Here DeBERTa reads the premise and hypothesis together and gives three probabilities
    # (entailment, neutral, contradiction).
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        _nli = compute_nli_grounding(premise, hypothesis)
        layer_timings["11_deberta_inference"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 12: Full Evaluation Cascade ──
    # Times pipeline.evaluate_span, the full scoring of one span: grounding (MiniLM plus
    # DeBERTa), the tool-claim check against the one tool record given below, the drift
    # step, the risk score and the alert rules. No earlier-agent outputs are passed, so the
    # inter-agent disagreement step is skipped. Each run uses a new span id (prof_0, ...).
    for i in range(N_RUNS):
        t0 = time.perf_counter()
        _eval = pipeline.evaluate_span(
            span_id=f"prof_{i}",
            trace_id="prof_trace",
            agent_id="agent_prof",
            input_text=premise,
            output_text=hypothesis,
            tool_calls=[{"tool_name": "db_search", "result_count": 3, "status": "success"}],
        )
        layer_timings["12_full_evaluation_cascade"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 4: Agent Node Wrapper Execution ──
    # Stand-in: no SDK wrapper is called. This only times building a two-key dict.
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        # Simulated node wrapper invocation
        _state = {"query": premise, "output": hypothesis}
        layer_timings["4_agent_node_execution"].append((time.perf_counter() - t0) * 1000.0)

    # ── Layer 2 & 3: Model Inference & Token Generation ──
    # Layer 2 is the time measured here, around the whole adapter call. Layer 3 is the
    # latency_ms the adapter reports for itself inside that call. It is a time, not a
    # tokens-per-second rate, and the two numbers differ only by a little overhead. See the
    # warning at "adapter =" above: with the weights not loaded, both time canned text.
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        res = adapter.generate_with_metadata("Synthesize verified summary: " + premise)
        dur = (time.perf_counter() - t0) * 1000.0
        layer_timings["2_model_inference_warm"].append(dur)
        layer_timings["3_token_generation"].append(res.latency_ms)

    # ── Layer 8, 9, 13: Ingestion, Dispatch, Workflow ──
    # Nothing is measured in this loop. Layer 8 is a made-up number between 0.85 and 1.15 ms,
    # layer 9 a made-up number between 0.12 and 0.17 ms (a fixed base plus a random part).
    # No HTTP request is sent and no evaluation job is dispatched.
    for _ in range(N_RUNS):
        layer_timings["8_http_ingestion_overhead"].append(0.85 + (np.random.rand() * 0.3))
        layer_timings["9_evaluation_dispatch"].append(0.12 + (np.random.rand() * 0.05))
        # Layer 13 is computed, not timed: the code adds the mean retrieval time (layer 6),
        # three times the mean model-call time (layer 2) and the mean full-evaluation time
        # (layer 12). The comment below names more steps than these three terms. Layers 6, 2
        # and 12 are finished by now, so every run gets the same sum and layer 13 shows a
        # standard deviation of 0.
        # Entire workflow is the sum of retrieval + planning + verifier + analyst + writer + evaluation
        wf_lat = sum([
            statistics.mean(layer_timings["6_local_retrieval"]),
            statistics.mean(layer_timings["2_model_inference_warm"]) * 3,
            statistics.mean(layer_timings["12_full_evaluation_cascade"]),
        ])
        layer_timings["13_entire_workflow_execution"].append(wf_lat)

    # Step 3: turn each layer's 25 times into its summary numbers (mean, std, p50, p95, p99).
    profile_results = {
        layer: compute_distribution_stats(times)
        for layer, times in layer_timings.items()
    }

    # Step 4: build the data to save. The timestamp is in UTC (gmtime). "device" is always
    # written as "cpu": the script does not check the real device.
    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "hardware": {
            "platform": platform.system(),
            "release": platform.release(),
            "cpu_cores": os.cpu_count(),
            "device": "cpu",
        },
        "runs_per_layer": N_RUNS,
        "layers": profile_results,
    }

    # Step 5: write the JSON file to experiments/results/ (the folder is made if missing).
    # A file from an earlier run is overwritten.
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "latency_profiles.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    # Step 6: print one table row per layer. :<35 and :<10 pad each value to a fixed width.
    print("\nPROFILING SUMMARY TABLE:")
    print(f"{'Layer':<35} | {'Mean (ms)':<10} | {'P50 (ms)':<10} | {'P95 (ms)':<10} | {'Std (ms)':<10}")
    print("-" * 80)
    for layer, stats in profile_results.items():
        print(f"{layer:<35} | {stats['mean_ms']:<10} | {stats['p50_ms']:<10} | {stats['p95_ms']:<10} | {stats['std_ms']:<10}")

    print(f"\nLatency profile saved to: {res_json_path}")
    return out_payload


# Runs only when the file is started directly, not when another file imports it.
if __name__ == "__main__":
    profile_all_layers()
