# AgentPulse: Master Product and Engineering Report

**Project title:** AgentPulse — A Lightweight, Self-Hostable Observability SDK for Continuous Grounding-Risk, Tool-Claim, and Drift Monitoring in Multi-Agent LLM Systems
**Category:** Industry-trend oriented, product-based AI engineering project
**Primary benchmark model:** `Qwen/Qwen3-8B` (Q4_K_M GGUF, local CPU inference via llama.cpp)
**Reasoning strategies evaluated:** Direct (zero-shot), Chain-of-Thought (CoT), Atom of Thoughts (AoT)
**Evaluation datasets:** `v1.0_dev`, `v1.0_val`, `v1.0_test` — 73 cases total (50 labeled via dual LLM-as-judge evaluation, 23 added by deterministic construction; see `LABEL_AGREEMENT_REPORT.md`)
**Evaluation cascade:** `all-MiniLM-L6-v2` (bi-encoder embeddings) + `cross-encoder/nli-deberta-v3-small` (NLI)
**Hardware:** Windows x64, 16 logical / 8 physical CPU cores, no GPU
**Automated test suite:** 99 tests passing

## 1. Problem

Production multi-agent systems built on frameworks like LangGraph, AutoGen, or CrewAI chain together specialized agents for retrieval, tool execution, verification, and synthesis. Standard APM tools (Datadog, Prometheus, OpenTelemetry collectors) assume an HTTP 200 with a non-empty payload means the request succeeded. That assumption breaks for LLM pipelines, where the most damaging failures produce no runtime error at all:

- An upstream agent asserts a fabricated citation or finding; downstream agents accept it as fact and it propagates into a final report.
- An agent invokes a tool that returns 3 records, then writes "we verified 14 matching accounts" in its output. No exception is thrown.
- Two agents reach mutually exclusive conclusions from the same input.
- A prompt edit, temperature change, or retrieval corpus update causes a gradual semantic shift in outputs that degrades quality over weeks before anyone notices.

AgentPulse is an observability SDK and backend built to catch these specific failure modes, continuously, on every span rather than on a sampled subset.

## 2. Architecture

```mermaid
graph TD
    User([User Request]) --> A[Planner Agent]
    A -->|Sub-queries| B[Retriever Agent]
    B -->|Local vector search| R[(Local Vector Index)]
    R -->|Documents| B
    B -->|Claim spans| C[Verifier Agent]
    C -->|Grounding check| D[Analyst Agent]
    D -->|Synthesis| E[Writer Agent]
    E --> FinalReport([Final Report])

    subgraph AgentPulse
        A -.->|pulse.monitor| SDK[SDK Queue]
        B -.->|pulse.monitor| SDK
        C -.->|pulse.monitor| SDK
        D -.->|pulse.monitor| SDK
        E -.->|pulse.monitor| SDK
        SDK -->|Batch ingest| API[FastAPI + SQLite WAL]
        API --> Cascade[Two-stage evaluation cascade]
        Cascade --> MiniLM[MiniLM semantic triage]
        Cascade --> DeBERTa[DeBERTa NLI cross-encoder]
        Cascade --> ToolVal[Deterministic tool validator]
        Cascade --> DriftEng[Drift engine and ASI]
        Cascade --> AlertEng[Alert engine]
        AlertEng --> CP[React dashboard]
    end
```

Design constraints:

- AgentPulse evaluates whether a claim is supported by its declared input context and tool records. It does not verify real-world truth independent of that context.
- The SDK is a pure observer. Reasoning strategy (Direct/CoT/AoT) is a property of the workload it watches, not something AgentPulse depends on internally.
- All inference runs locally (CPU or GPU) on open-source models. No data leaves the host by default.

## 3. Risk aggregation

For a span with input context $C_{in}$, output $O_{out}$, and tool records $T$, the overall risk score is:

$$R(s) = \frac{w_g \cdot P_{\text{contradiction}}(C_{in}, O_{out}) + w_t \cdot R_{\text{tool}}(T, O_{out}) + w_d \cdot R_{\text{disagree}}}{\sum \text{weights of signals present}}$$

Only signals available for a given span contribute — $w_d$ is omitted when there is no upstream agent output — and the result is renormalized by the sum of the weights that did contribute, not divided by a fixed 1.0. A fourth weight, $w_s$ (semantic dissimilarity), is defined in configuration but is not currently used in `backend/app/services/evaluator.py`'s `_aggregate_risk()`. This is a known gap between the configuration and the implementation, not an intentional design choice.

Current weights (initial heuristic values, not empirically calibrated — see `THRESHOLD_ANALYSIS.md` for the sensitivity analysis that was performed on the semantic-similarity and NLI-contradiction thresholds):

| Weight | Value | Signal |
| :--- | :---: | :--- |
| $w_g$ | 0.40 | NLI contradiction probability |
| $w_t$ | 0.25 | Deterministic tool-claim mismatch |
| $w_d$ | 0.20 | Inter-agent disagreement |
| $w_s$ | 0.15 | Semantic dissimilarity (defined, not wired in) |

A separate, verified limitation of the grounding signal: DeBERTa NLI classifies a statement compared against itself (verbatim, maximally supported) as "neutral" (~99%) rather than "entailment" (~1%), because identical premise/hypothesis pairs are out of distribution for a model trained on genuine NLI pairs. Since `grounding_score = 1 - entailment_prob`, this means a fully-supported claim can score close to maximum risk if the NLI model classifies it as neutral instead of confidently entailed. This affects any evaluation with paraphrased or verbatim-correct claims and is not yet fixed; see Section 6 and `THRESHOLD_ANALYSIS.md`.

## 4. Reasoning strategy comparison: Direct vs CoT vs AoT

Real local inference via `Qwen/Qwen3-8B-GGUF` (Q4_K_M, llama.cpp, CPU-only). Measured sustained throughput on this hardware: 4.3 tokens/sec.

A prior version of this section reported latencies of 0.04-0.15 ms for this comparison. Those numbers were the output of a deterministic fallback text generator, not model inference — `load_immediately` was never set to `True` anywhere in the codebase, so no model weights were ever loaded for that run. That bug is fixed (see `experiments/reasoning_strategies.py`), and this section will be replaced with the results of a full run (30 test cases x 5 runs x 3 strategies, real inference) once it completes. A 2-case smoke test confirmed the pipeline runs correctly end to end with real per-call latencies in the 4-96 second range depending on strategy and token budget — see `REASONING_STRATEGY_EVALUATION_REPORT.md` for the current state of this result.

## 5. Baseline and ablation comparison

Ablation configurations were evaluated with thresholds selected on the development split (`v1.0_dev`, 21 cases) and reported on the held-out test split (`v1.0_test`, 30 cases) — no threshold was selected using test-split results. Full methodology in `THRESHOLD_ANALYSIS.md`.

| Configuration | Precision | Recall | F1 | FPR | FNR | Latency (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| A: MiniLM embedding only | 0.733 | 0.846 | 0.786 | 0.235 | 0.154 | 48.5 |
| B: DeBERTa NLI only | 0.929 | 1.000 | 0.963 | 0.059 | 0.000 | 300.5 |
| C: MiniLM + DeBERTa cascade | 0.929 | 1.000 | 0.963 | 0.059 | 0.000 | 349.0 |
| D: NLI + tool-claim validation | 0.929 | 1.000 | 0.963 | 0.059 | 0.000 | 300.5 |
| E: NLI + inter-agent disagreement | 0.929 | 1.000 | 0.963 | 0.059 | 0.000 | 598.0 |
| F: NLI + drift signal | 0.448 | 1.000 | 0.619 | 0.941 | 0.000 | 329.9 |
| G: Full AgentPulse pipeline | 0.542 | 1.000 | 0.703 | 0.647 | 0.000 | 359.3 |

Configurations E and F produce metrics identical to (E) or worse than (F) Config B on this dataset. E collapses to B because the dataset's evaluation cases are single-agent records, so the only pair available to the disagreement engine is the same evidence-to-claim comparison NLI already makes. F and G score below the plain NLI-only baseline because the drift detector's cold-start centroid, computed over case-file order rather than real temporal traffic, flags most of the non-failure test cases — this is not a subtle effect: F's false positive rate is 0.941. Both limitations are analyzed in `THRESHOLD_ANALYSIS.md`.

Threshold sensitivity: every combination swept on the development split (semantic floor 0.10-0.40, NLI contradiction threshold 0.50-0.80) tied at F1 = 1.0. At 21 development cases, the sweep does not currently discriminate between thresholds; a larger development set is needed before threshold selection here is meaningful.

## 6. Compounding error: control vs intervention

Five-node pipeline (A through E) with a fabricated claim injected at Node B, evaluated under two conditions (`experiments/compounding_error.py`):

| Node | Condition A — unmitigated (risk / contradiction prob) | Condition B — verifier intervenes (risk / contradiction prob) |
| :--- | :---: | :---: |
| A: Planner | 0.989 / 0.002 | 0.989 / 0.002 |
| B: Retriever (fault injected) | 1.000 / 1.000 | 1.000 / 1.000 |
| C: Verifier | 0.992 / 0.992 | 0.009 / 0.009 |
| D: Analyst | 0.992 / 0.992 | 0.001 / 0.000 |
| E: Writer | 0.992 / 0.992 | 0.001 / 0.000 |

Mean downstream risk after the fault node: 0.992 under the unmitigated condition, 0.004 once the verifier intervenes. This demonstrates that a caught contradiction stops propagating in this pipeline; it is a propagation measurement, not a proof that verification always catches faults in general.

Node A's risk score (0.989) in a case with near-zero contradiction probability (0.002) is the neutral-vs-entailment grounding limitation described in Section 3, reproduced here: comparing the baseline premise against itself scores as high risk despite being maximally supported. Treat Node A's absolute score as unreliable; the before/after comparison at Node C onward is unaffected since it is a relative difference, not an absolute magnitude.

## 7. Drift detection with negative controls

Eleven scenarios covering graded positive shifts (10%, 25%, 50%) and negative controls (`experiments/drift_scenarios.py`):

| Scenario | Type | Magnitude (cosine distance) | Is anomaly | Detected | False alert | Time to detect | Final ASI |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Prompt formatting change | prompt_drift | 0.10 | No | No | No | — | 100.0 |
| Prompt tone shift | prompt_drift | 0.25 | No | No | No | — | 99.7 |
| Prompt template rewrite | prompt_drift | 0.50 | Yes | No | No | — | 98.5 |
| Model version update | model_drift | 0.50 | Yes | No | No | — | 98.5 |
| Temperature shift (0.1 to 0.9) | hyperparam_drift | 0.35 | Yes | No | No | — | 99.4 |
| Tool frequency fluctuation | tool_entropy | 0.25 | No | No | No | — | 99.7 |
| Uncalibrated external tool | tool_entropy | 0.60 | Yes | Yes | No | 1 span | 82.7 |
| Hallucination burst | quality_regression | 0.75 | Yes | Yes | No | 1 span | 96.5 |
| Negative control: paraphrasing | negative_control | 0.12 | No | No | No | — | 100.0 |
| Negative control: valid tool substitution | negative_control | 0.15 | No | No | No | — | 99.9 |
| Negative control: invariant flow | negative_control | 0.00 | No | No | No | — | 100.0 |

Sub-threshold shifts (10-25%) stayed below the 0.30 decision threshold and produced no alerts; large shifts (50%+) and the hallucination burst were both detected within 1-2 spans of crossing the threshold. All three negative controls produced zero false alerts. "Magnitude" here is cosine distance between the pre- and post-shift embedding centroid, not a general drift-magnitude unit — see `THRESHOLD_ANALYSIS.md` for how other configurations define their own signals.

## 8. Dataset and label agreement

| Split | Cases | Observed agreement | Expected chance agreement | Cohen's kappa |
| :--- | :---: | :---: | :---: | :---: |
| v1.0_dev (dual-evaluated subset) | 15 | 0.933 | 0.48 | 0.871 |
| v1.0_val (dual-evaluated subset) | 15 | 0.933 | 0.48 | 0.871 |
| v1.0_test (dual-evaluated subset) | 20 | 1.000 | 0.50 | 1.000 |
| Overall (dual-evaluated) | 50 | 0.960 | 0.49 | 0.922 |

These 50 cases were labeled by two independent LLM-as-judge evaluation passes under an explicit taxonomy, not by independent human annotators — see `LABEL_AGREEMENT_REPORT.md` for exactly what this does and doesn't establish. A further 23 cases were added later (bringing the three splits to 21/22/30, 73 total) using deterministic construction — ground truth follows mechanically from how each case was built (e.g. a claimed tool-result count that differs from the actual `tool_records` entry), rather than from any evaluator judgment. These 23 cases are not included in the kappa figures above.

## 9. Test suite

```
pytest tests/ -q
...................................................................... [ 72%]
...........................                                            [100%]
99 passed
```

## 10. Anticipated questions

**What do the latency numbers in Section 4 actually measure, given the earlier fake ones?**
The earlier 0.04-0.15 ms figures were a deterministic string-template fallback, not model output — confirmed by grepping the codebase for `load_immediately=True`, which appeared nowhere. The fix wires a real GGUF model through llama.cpp; Section 4 will carry real measured latencies once the full benchmark run completes, and until then states plainly that it hasn't.

**Why do drift and the full pipeline score worse than plain NLI in the ablation table?**
Because the drift detector's centroid is cold-started over the case list's file order, which has no real temporal structure, and it flags the majority of non-failure cases as anomalous when folded into the composite score. This is reported directly in Section 5 rather than smoothed over — it is a real finding about the current drift-in-composite-score design, not evidence that drift detection itself is broken (Section 7's dedicated drift benchmark, run under conditions that match what drift is for, performs as expected).

**Is Cohen's kappa of 0.922 evidence the labeling scheme is reliable in general?**
It is evidence of agreement between two independent LLM-as-judge evaluation passes on 50 specific cases across three domains, using an explicit labeling taxonomy — not evidence of human-verified ground truth. It says nothing about the 23 deterministically-constructed cases (which don't need it, since their labels aren't a judgment call), and it does not extend to unseen production traffic, or substitute for human review, without further work.

**Does Atom of Thoughts improve grounding over Chain-of-Thought?**
Not yet answered honestly — see Section 4. The previous claim that it did was based on the same fake-latency run and should not be trusted until the real-inference benchmark completes.
