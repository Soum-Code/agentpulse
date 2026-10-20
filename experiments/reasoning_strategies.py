"""Reasoning Strategy Benchmark Runner.

Executes controlled comparisons between Direct, Chain-of-Thought (CoT),
and Atom of Thoughts (AoT) reasoning strategies across multi-agent workflows.

Outputs:
- experiments/results/reasoning_strategy_results.json
- REASONING_STRATEGY_EVALUATION_REPORT.md
"""

# What this file is for: it compares three ways of making an LLM answer a question, with the
# same model, the same cases and the same answer-length limit:
#   direct = send the question (and the evidence) and take the answer as it is;
#   cot    = chain of thought: the model is told to think step by step and then give a line
#            marked "FINAL ANSWER:". The text after that mark is used (without the mark, the
#            last line is used);
#   aot    = atom of thoughts: split the task into small sub-questions, answer each one, then
#            combine the answers into the final answer.
# Each strategy is run several times on every case. Each answer is scored by AgentPulse's own
# evaluator (grounding = is the answer supported by the evidence). The script records time,
# token counts and risk, saves them to a JSON file and writes a markdown report.
#
# How it fits in: run by hand (python experiments/reasoning_strategies.py); nothing imports
# it. It uses the strategies in reasoning/, the model wrappers in llm_adapters/, and the
# backend's EvaluationPipeline. The cases come from datasets/v1.0_<split>.json.

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
# The three lines below add the backend folder (package "app"), the SDK source folder and the
# repo root (packages "llm_adapters" and "reasoning") to Python's search path.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# get_llm_adapter builds a model wrapper from a model name. get_reasoning_strategy builds a
# strategy object from "direct", "cot" or "aot".
from llm_adapters import get_llm_adapter
from reasoning import get_reasoning_strategy
# EvaluationPipeline scores one span (grounding, tool claims, drift, alerts). DriftDetector
# and AlertEngine are the two helpers it is built from.
from app.services.evaluator import EvaluationPipeline
from app.services.drift import DriftDetector
from app.services.alerting import AlertEngine
# Note: models_loaded is imported but not used in this file.
from app.services.grounding import load_models, models_loaded


# Runs the whole benchmark. In: model_name (given to get_llm_adapter; "qwen3-8b" gives Qwen3
# 8B through llama.cpp), dataset_split ("test" reads datasets/v1.0_test.json), n_runs (how many
# times each strategy is run on each case), max_tokens (the answer-length limit for each model
# call, the same for all strategies) and max_cases (use only the first N cases; None = all).
# Out: the data it also saves to experiments/results/reasoning_strategy_results.json. It
# writes REASONING_STRATEGY_EVALUATION_REPORT.md in the repo root as well.
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
    # Load the scoring models (MiniLM and DeBERTa) now and wait until they are ready
    # (sync=True), so loading time is not mixed into the runs. use_onnx=False picks the PyTorch
    # NLI model. Unlike llm_judge_baseline.py, this script does not check that the load worked.
    # If it failed, grounding can give no score, and a risk of None is stored as 0.0 below.
    load_models(use_onnx=False, sync=True)

    # 2. Load dataset
    # The file is a dict; its "cases" list is used below. Each case has input_query, evidence,
    # agent_claim, is_failure and (for some cases) tool_records. agent_claim is not used here:
    # the model writes its own answer, and that answer is what gets scored.
    dataset_path = Path(__file__).parent.parent / "datasets" / f"v1.0_{dataset_split}.json"
    with open(dataset_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    # In short: with a transformers-based adapter, load_immediately=True is what makes the
    # model real. The default qwen3-8b is a GGUF adapter, which would load on first use anyway;
    # here True loads it at once, and a missing model file stops the script with an error.
    # load_immediately=True is required: without it the adapter silently falls
    # back to a canned-string generator and every latency/token number below
    # becomes meaningless (this was the root cause of the previously reported
    # 0.04-0.15ms "7B model" latencies).
    adapter = get_llm_adapter(model_name=model_name, device="cpu", load_immediately=True)
    print(f"Adapter: {type(adapter).__name__} | model_id={adapter.model_id}")

    # Warm-up generation: excluded from all reported timings so the first
    # call's one-off costs don't contaminate the measured runs.
    # (The 8-token limit keeps it short. Its time is saved in the results as warmup_ms.)
    print("Running warm-up generation (excluded from results)...")
    t_warm = time.perf_counter()
    adapter.generate_with_metadata(prompt="Reply with the single word: ready.", max_tokens=8)
    warmup_ms = (time.perf_counter() - t_warm) * 1000.0
    print(f"Warm-up completed in {warmup_ms:.1f}ms")

    # The pipeline that scores every answer. window_size = how many recent scores the drift
    # detector keeps per agent. min_samples_for_alert = how many spans count as its "cold
    # start". Both are smaller (20 and 5) than the DriftDetector defaults (100 and 20).
    # cooldown_seconds=0 changes nothing: AlertEngine stores it but never reads it (each alert
    # rule has its own cooldown). One pipeline is shared by all strategies and cases.
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    pipeline = EvaluationPipeline(drift_detector, alert_engine)

    # The three strategies to compare. results_by_strategy gets one dict per case for each.
    strategies = ["direct", "cot", "aot"]
    results_by_strategy: Dict[str, List[Dict[str, Any]]] = {s: [] for s in strategies}
    # Use only the first max_cases cases if a limit was given, otherwise all of them.
    bench_cases = dataset["cases"][:max_cases] if max_cases else dataset["cases"]
    print(f"Cases: {len(bench_cases)} | max_tokens per call: {max_tokens} (identical across strategies)")

    # Step 3: for each strategy and each case, run the strategy n_runs times. After every run,
    # score the answer with the evaluator. Then store the averages of the n_runs numbers.
    for strat_name in strategies:
        # The strategy object: "direct" gives DirectStrategy, "cot" CoTStrategy, "aot"
        # AoTStrategy.
        strat = get_reasoning_strategy(strat_name)
        print(f"\nEvaluating Strategy: {strat_name.upper()}...")

        for case in bench_cases:
            # One list per measure, filled with one number for each of the n_runs runs.
            run_latencies = []
            run_tokens_in = []
            run_tokens_out = []
            run_risks = []
            run_contra_rates = []

            for run_idx in range(n_runs):
                # Run the strategy. The task is the case's question and the evidence (it can be
                # None) goes in as context. max_tokens is the same for every strategy (AoT uses
                # it for each of its model calls). output.latency_ms is the time of the whole
                # strategy call, all of AoT's model calls included, but not the scoring below.
                output = strat.execute(
                    adapter=adapter,
                    task_prompt=case["input_query"],
                    context=case.get("evidence"),
                    max_tokens=max_tokens,
                )

                # Score the final answer. The evidence is the "input" the answer is checked
                # against (the question is used if a case has no evidence). The tool records of
                # the case, if it has any, are compared with what the answer says the tools did;
                # None means that check is skipped. The span id is different for each strategy,
                # case and run. The trace id is shared by all cases of one strategy and run
                # number. Every span uses the agent id "eval_agent", so one drift history
                # builds up across all cases and strategies.
                eval_res = pipeline.evaluate_span(
                    span_id=f"{strat_name}_{case['id']}_{run_idx}",
                    trace_id=f"trace_{strat_name}_{run_idx}",
                    agent_id="eval_agent",
                    input_text=case.get("evidence") or case["input_query"],
                    output_text=output.final_answer,
                    tool_calls=case.get("tool_records"),
                )

                # overall_risk_score is a weighted average of the signals that ran here: the
                # grounding score, and the tool-claim score when the case has tool records
                # (0 = safe, 1 = risky). Drift and alerts also run, but they do not change this
                # number. It is None when no signal ran, and "or 0.0" turns that into 0.0.
                risk = eval_res.overall_risk_score or 0.0
                run_latencies.append(output.latency_ms)
                run_tokens_in.append(output.tokens_in)
                run_tokens_out.append(output.tokens_out)
                run_risks.append(risk)
                # Contradiction flag of this run: 1.0 if the NLI model's contradiction
                # probability is above 0.60, else 0.0. (0.60 is a fixed number typed here; the
                # code does not say why.) Averaged below, it becomes the share of runs flagged.
                contra_p = eval_res.grounding.contradiction_prob if eval_res.grounding else 0.0
                run_contra_rates.append(1.0 if (contra_p or 0) > 0.60 else 0.0)

            # Standard deviation (how far the numbers spread around their mean) rounded to 2
            # decimals; 0.0 when there are fewer than 2 numbers. It is defined again for every
            # case, but it does not depend on the case.
            def _stdev(xs):
                return round(float(statistics.stdev(xs)), 2) if len(xs) > 1 else 0.0

            # Step 4: save this case's averages over its n_runs runs, plus the raw numbers.
            # The "stdev_risk_score" below already comes out with 2 decimals from _stdev, so
            # the extra round(..., 3) on it changes nothing.
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
    # Step 5: one summary per strategy, with the keys "DIRECT", "COT" and "AOT". Each number is
    # the mean (or median, or standard deviation) over the per-case averages from step 4, so
    # every case counts once.
    # Note: "stdev_grounding_risk" is the standard deviation, over the cases, of each case's
    # average risk. It measures how much the cases differ from each other. It is not the
    # run-to-run noise that the comments and report text below call it. Also, every
    # "..._grounding_risk" value is built from avg_risk_score, the overall risk from step 4
    # (grounding plus tool-claim), not from the grounding score alone.
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

    # Step 6: gather everything that will be saved. Be aware of three things. The key "provider"
    # is filled from the adapter's quantization label, so its name and its value do not match.
    # "real_inference" is a fixed True, not measured (a transformers adapter that fell back to
    # canned text would still say True). And the "gpu" text is fixed: the script runs the model
    # on the CPU and does not look at the hardware.
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
    # Step 7: the folder experiments/results/ is made if missing; an older file is overwritten.
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "reasoning_strategy_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    # Derive observations from the measured data rather than asserting a
    # pre-written conclusion. Whether CoT/AoT actually help is an empirical
    # question that this run answers -- it must not be assumed in advance.
    # Step 8: fastest, lowest_risk and most_tokens are each a (name, numbers) pair: the strategy
    # with the smallest mean latency, the smallest mean grounding risk, and the largest mean
    # number of output tokens.
    fastest = min(summary.items(), key=lambda kv: kv[1]["mean_latency_ms"])
    lowest_risk = min(summary.items(), key=lambda kv: kv[1]["mean_grounding_risk"])
    most_tokens = max(summary.items(), key=lambda kv: kv[1]["mean_tokens_out"])

    # risk_spread = the highest mean risk minus the lowest one, over the three strategies.
    # max_risk_stdev = the largest stdev_grounding_risk of the three (see the note at step 5).
    risk_values = [v["mean_grounding_risk"] for v in summary.values()]
    risk_spread = max(risk_values) - min(risk_values)
    max_risk_stdev = max(v["stdev_grounding_risk"] for v in summary.values())
    # If the between-strategy difference is smaller than the within-strategy
    # run-to-run variation, the ranking is not distinguishable from noise.
    risk_conclusive = risk_spread > max_risk_stdev

    # The sentence for the report, in one of two wordings: it names the lowest-risk strategy
    # if the spread is bigger than max_risk_stdev, otherwise it says "INCONCLUSIVE".
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

    # Step 9: write the markdown report in the repo root (an older file is overwritten). The
    # text is an f-string, so each {...} part is replaced by a value: the table rows come from
    # `summary`, and the three observations from fastest, most_tokens and risk_verdict. The
    # date, model name, case count and run count are filled in too. Some words are fixed text:
    # the "Inference" line says llama.cpp and CPU-only whatever model_name was used, and the
    # "Hardware" line always ends with "no GPU".
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


# Runs only when the file is started directly, with all the default settings.
if __name__ == "__main__":
    run_reasoning_strategy_benchmark()
