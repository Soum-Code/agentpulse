"""Reasoning Strategy Benchmark Runner.

Executes controlled comparisons between Direct, Chain-of-Thought (CoT),
and Atom of Thoughts (AoT) reasoning strategies across multi-agent workflows.

Outputs:
- experiments/results/reasoning_strategy_results.json
- REASONING_STRATEGY_EVALUATION_REPORT.md
"""

from __future__ import annotations

import json
import os
import platform
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Ensure modules are importable
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from llm_adapters import get_llm_adapter
from reasoning import get_reasoning_strategy
from app.services.evaluator import EvaluationPipeline
from app.services.drift import DriftDetector
from app.services.alerting import AlertEngine
from app.services.grounding import load_models, models_loaded


def run_reasoning_strategy_benchmark(
    model_name: str = "qwen3-8b",
    dataset_split: str = "test",
    n_runs: int = 5,
    max_tokens: int = 200,
    max_cases: int | None = None,
) -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE REASONING STRATEGY COMPARISON BENCHMARK")
    print(f"Model: {model_name} | Dataset: v1.0_{dataset_split} | Runs: {n_runs}")
    print("=" * 64)

    # 1. Warm up evaluation models
    load_models(use_onnx=False, sync=True)

    # 2. Load dataset
    dataset_path = Path(__file__).parent.parent / "datasets" / f"v1.0_{dataset_split}.json"
    with open(dataset_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    # load_immediately=True is required: without it the adapter silently falls
    # back to a canned-string generator and every latency/token number below
    # becomes meaningless (this was the root cause of the previously reported
    # 0.04-0.15ms "7B model" latencies).
    adapter = get_llm_adapter(model_name=model_name, device="cpu", load_immediately=True)
    print(f"Adapter: {type(adapter).__name__} | model_id={adapter.model_id}")

    # Warm-up generation: excluded from all reported timings so the first
    # call's one-off costs don't contaminate the measured runs.
    print("Running warm-up generation (excluded from results)...")
    t_warm = time.perf_counter()
    adapter.generate_with_metadata(prompt="Reply with the single word: ready.", max_tokens=8)
    warmup_ms = (time.perf_counter() - t_warm) * 1000.0
    print(f"Warm-up completed in {warmup_ms:.1f}ms")

    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    pipeline = EvaluationPipeline(drift_detector, alert_engine)

    strategies = ["direct", "cot", "aot"]
    results_by_strategy: Dict[str, List[Dict[str, Any]]] = {s: [] for s in strategies}
    bench_cases = dataset["cases"][:max_cases] if max_cases else dataset["cases"]
    print(f"Cases: {len(bench_cases)} | max_tokens per call: {max_tokens} (identical across strategies)")

    for strat_name in strategies:
        strat = get_reasoning_strategy(strat_name)
        print(f"\nEvaluating Strategy: {strat_name.upper()}...")

        for case in bench_cases:
            run_latencies = []
            run_tokens_in = []
            run_tokens_out = []
            run_risks = []
            run_contra_rates = []

            for run_idx in range(n_runs):
                output = strat.execute(
                    adapter=adapter,
                    task_prompt=case["input_query"],
                    context=case.get("evidence"),
                    max_tokens=max_tokens,
                )

                eval_res = pipeline.evaluate_span(
                    span_id=f"{strat_name}_{case['id']}_{run_idx}",
                    trace_id=f"trace_{strat_name}_{run_idx}",
                    agent_id="eval_agent",
                    input_text=case.get("evidence") or case["input_query"],
                    output_text=output.final_answer,
                    tool_calls=case.get("tool_records"),
                )

                risk = eval_res.overall_risk_score or 0.0
                run_latencies.append(output.latency_ms)
                run_tokens_in.append(output.tokens_in)
                run_tokens_out.append(output.tokens_out)
                run_risks.append(risk)
                contra_p = eval_res.grounding.contradiction_prob if eval_res.grounding else 0.0
                run_contra_rates.append(1.0 if (contra_p or 0) > 0.60 else 0.0)

            def _stdev(xs):
                return round(float(statistics.stdev(xs)), 2) if len(xs) > 1 else 0.0

            results_by_strategy[strat_name].append({
                "case_id": case["id"],
                "domain": case["domain"],
                "is_failure_ground_truth": case["is_failure"],
                "n_runs": len(run_latencies),
                "avg_latency_ms": round(float(statistics.mean(run_latencies)), 2),
                "median_latency_ms": round(float(statistics.median(run_latencies)), 2),
                "stdev_latency_ms": _stdev(run_latencies),
                "avg_tokens_in": round(float(statistics.mean(run_tokens_in)), 1),
                "avg_tokens_out": round(float(statistics.mean(run_tokens_out)), 1),
                "stdev_tokens_out": _stdev(run_tokens_out),
                "avg_risk_score": round(float(statistics.mean(run_risks)), 3),
                "stdev_risk_score": round(_stdev(run_risks), 3),
                "contradiction_rate": round(float(statistics.mean(run_contra_rates)), 3),
                "raw_latencies_ms": [round(x, 2) for x in run_latencies],
                "raw_risk_scores": [round(x, 3) for x in run_risks],
            })

    # Summarize strategy performance
    summary = {}
    for s_name, case_results in results_by_strategy.items():
        all_lats = [c["avg_latency_ms"] for c in case_results]
        all_tin = [c["avg_tokens_in"] for c in case_results]
        all_tout = [c["avg_tokens_out"] for c in case_results]
        all_risks = [c["avg_risk_score"] for c in case_results]
        all_contras = [c["contradiction_rate"] for c in case_results]

        summary[s_name.upper()] = {
            "mean_latency_ms": round(float(statistics.mean(all_lats)), 2),
            "median_latency_ms": round(float(statistics.median(all_lats)), 2),
            "stdev_latency_ms": round(float(statistics.stdev(all_lats)), 2) if len(all_lats) > 1 else 0.0,
            "mean_tokens_in": round(float(statistics.mean(all_tin)), 1),
            "mean_tokens_out": round(float(statistics.mean(all_tout)), 1),
            "mean_grounding_risk": round(float(statistics.mean(all_risks)), 3),
            "stdev_grounding_risk": round(float(statistics.stdev(all_risks)), 3) if len(all_risks) > 1 else 0.0,
            "contradiction_rate": round(float(statistics.mean(all_contras)), 3),
        }

    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "model": model_name,
        "model_id": adapter.model_id,
        "adapter": type(adapter).__name__,
        "provider": getattr(adapter, "quantization", None),
        "real_inference": True,
        "warmup_ms": round(warmup_ms, 2),
        "hardware": {
            "platform": platform.platform(),
            "processor": platform.processor(),
            "python": platform.python_version(),
            "cpu_count": os.cpu_count(),
            "gpu": "none (CPU-only benchmark)",
        },
        "dataset": f"v1.0_{dataset_split}",
        "n_cases": len(bench_cases),
        "runs_per_case": n_runs,
        "max_tokens_per_call": max_tokens,
        "summary": summary,
        "detailed_results": results_by_strategy,
    }

    # Save results JSON
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "reasoning_strategy_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    # Derive observations from the measured data rather than asserting a
    # pre-written conclusion. Whether CoT/AoT actually help is an empirical
    # question that this run answers -- it must not be assumed in advance.
    fastest = min(summary.items(), key=lambda kv: kv[1]["mean_latency_ms"])
    lowest_risk = min(summary.items(), key=lambda kv: kv[1]["mean_grounding_risk"])
    most_tokens = max(summary.items(), key=lambda kv: kv[1]["mean_tokens_out"])

    risk_values = [v["mean_grounding_risk"] for v in summary.values()]
    risk_spread = max(risk_values) - min(risk_values)
    max_risk_stdev = max(v["stdev_grounding_risk"] for v in summary.values())
    # If the between-strategy difference is smaller than the within-strategy
    # run-to-run variation, the ranking is not distinguishable from noise.
    risk_conclusive = risk_spread > max_risk_stdev

    if risk_conclusive:
        risk_verdict = (
            f"**{lowest_risk[0]}** recorded the lowest mean grounding risk "
            f"({lowest_risk[1]['mean_grounding_risk']:.3f}). The spread between strategies "
            f"({risk_spread:.3f}) exceeds the largest within-strategy run-to-run standard "
            f"deviation ({max_risk_stdev:.3f}), so the ordering is not purely run-to-run noise "
            f"on this sample."
        )
    else:
        risk_verdict = (
            f"**INCONCLUSIVE on grounding risk.** The spread between strategy means "
            f"({risk_spread:.3f}) is smaller than the largest within-strategy run-to-run "
            f"standard deviation ({max_risk_stdev:.3f}), so no strategy can be declared "
            f"better on grounding risk from this sample."
        )

    with open(Path(__file__).parent.parent / "REASONING_STRATEGY_EVALUATION_REPORT.md", "w", encoding="utf-8") as f:
        f.write(f"""# Reasoning Strategy Evaluation Report

**Date:** {out_payload['timestamp']}
**Evaluated Model:** `{adapter.model_id}` (adapter: `{type(adapter).__name__}`, quantization: `{getattr(adapter, 'quantization', 'n/a')}`)
**Inference:** Real local model inference via llama.cpp. CPU-only benchmark.
**Hardware:** {platform.platform()}, {os.cpu_count()} logical cores, no GPU.
**Dataset:** `{out_payload['dataset']}` ({len(bench_cases)} cases, {n_runs} stochastic runs per case, max_tokens={max_tokens} per call)
**Warm-up:** one generation run before measurement, excluded from all figures below ({warmup_ms:.0f} ms).

---

## 1. Strategy Performance Summary

Latency is per reasoning-strategy execution (which may involve more than one model
call, e.g. AoT), measured around the strategy call only.

| Reasoning Strategy | Mean Latency (ms) | Median (ms) | Std Dev (ms) | Mean Tokens In | Mean Tokens Out | Mean Grounding Risk | Risk Std Dev | Contradiction Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| DIRECT (Zero-Shot) | {summary['DIRECT']['mean_latency_ms']:.1f} | {summary['DIRECT']['median_latency_ms']:.1f} | {summary['DIRECT']['stdev_latency_ms']:.1f} | {summary['DIRECT']['mean_tokens_in']:.1f} | {summary['DIRECT']['mean_tokens_out']:.1f} | {summary['DIRECT']['mean_grounding_risk']:.3f} | {summary['DIRECT']['stdev_grounding_risk']:.3f} | {summary['DIRECT']['contradiction_rate']:.3f} |
| COT (Chain-of-Thought) | {summary['COT']['mean_latency_ms']:.1f} | {summary['COT']['median_latency_ms']:.1f} | {summary['COT']['stdev_latency_ms']:.1f} | {summary['COT']['mean_tokens_in']:.1f} | {summary['COT']['mean_tokens_out']:.1f} | {summary['COT']['mean_grounding_risk']:.3f} | {summary['COT']['stdev_grounding_risk']:.3f} | {summary['COT']['contradiction_rate']:.3f} |
| AOT (Atom of Thoughts) | {summary['AOT']['mean_latency_ms']:.1f} | {summary['AOT']['median_latency_ms']:.1f} | {summary['AOT']['stdev_latency_ms']:.1f} | {summary['AOT']['mean_tokens_in']:.1f} | {summary['AOT']['mean_tokens_out']:.1f} | {summary['AOT']['mean_grounding_risk']:.3f} | {summary['AOT']['stdev_grounding_risk']:.3f} | {summary['AOT']['contradiction_rate']:.3f} |

---

## 2. Observations (derived from the table above, not pre-assumed)

1. **Latency:** {fastest[0]} was fastest at {fastest[1]['mean_latency_ms']:.1f} ms mean per execution.
2. **Token cost:** {most_tokens[0]} produced the most output tokens ({most_tokens[1]['mean_tokens_out']:.1f} mean), i.e. the highest generation cost per case.
3. **Grounding risk:** {risk_verdict}

## 3. Limitations

- Single model ({adapter.model_id}); results are not claimed to generalize to other models or sizes.
- {len(bench_cases)} evaluation cases x {n_runs} runs per case &mdash; a small sample. Treat differences near the reported standard deviations as inconclusive.
- Quantized ({getattr(adapter, 'quantization', 'n/a')}) CPU inference; absolute latencies are hardware- and quantization-specific and are not comparable to GPU or full-precision figures.
- Grounding risk is AgentPulse's own evaluator score, not human-verified ground truth for these generations.

*Data source:* `experiments/results/reasoning_strategy_results.json`
""")

    print(f"\nReasoning strategy results saved to: {res_json_path}")
    print("Report written to: REASONING_STRATEGY_EVALUATION_REPORT.md")

    return out_payload


if __name__ == "__main__":
    run_reasoning_strategy_benchmark()
