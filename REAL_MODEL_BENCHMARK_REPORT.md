# Real-Model Benchmark and Performance Profile

**Status:** The tables previously in this report (a "13-layer latency profile" and a "multi-model reasoning strategy matrix" comparing Qwen and Llama) were not measurements. `experiments/run_experiment.py` wrote them as fixed strings, and `get_llm_adapter` was never called with `load_immediately=True` anywhere in the codebase — no model weights were ever loaded to produce those numbers. This was confirmed directly: a grep for `load_immediately=True` across the repository returned zero matches before the fix described below.

**Fix in progress:** `llm_adapters/local_gguf.py` now loads a real quantized model (`Qwen/Qwen3-8B-GGUF`, Q4_K_M, via llama.cpp) and measures actual generation latency and token counts. Measured sustained throughput on this hardware (16 logical / 8 physical CPU cores, no GPU): 4.3 tokens/sec. A 2-case smoke test completed successfully with real per-call latencies in the 4-96 second range.

This report will be replaced with real measured figures once the full benchmark run (`experiments/reasoning_strategies.py`, 30 test cases x 5 runs x 3 strategies) completes. See `REASONING_STRATEGY_EVALUATION_REPORT.md` for its current state, and `PROJECT_REPORT.md` Section 4 for the same caveat in context.

No second model (Llama, Mistral) has been benchmarked with real inference yet — any claim of cross-model generalization is not yet supported.
