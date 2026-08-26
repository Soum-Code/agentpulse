# NLI Cascade vs. Generic LLM-Judge: Head-to-Head

**Date:** 2026-08-26
**Script:** `experiments/llm_judge_baseline.py`
**Raw results:** `experiments/results/llm_judge_comparison.json`
**Dataset:** `v1.0_test` — 30 cases, same `is_failure` ground truth used by `experiments/ablation.py`, so figures are directly comparable to `THRESHOLD_ANALYSIS.md`
**Real inference confirmed:** NLI models `{nli_model, nli_tokenizer, embedding_model}` all loaded; judge warm-up returned `'SUPPORTED'` in 3830 ms with 6 output tokens

---

## 1. The claim being tested

`COMPETITIVE_POSITIONING.md` §5.4 states as a **hypothesis**, not a result:

> Where MLflow, Arize, and Datadog default to LLM judges, AgentPulse uses a fixed NLI
> cascade: no judge API cost, no judge drift. This is a hypothesis, not yet a result.

Two separable parts:

- **(a) Quality** — the NLI cascade detects ungrounded claims at *comparable* quality.
- **(b) Cost** — it does so for substantially less inference effort.

**(b) is confirmed decisively. (a) is not confirmed — and the result is more
interesting than a clean win would have been.** See §3.

## 2. Setup

| | System A | System B |
| :--- | :--- | :--- |
| Approach | AgentPulse NLI cascade | Generic LLM-as-judge |
| Models | `all-MiniLM-L6-v2` → `nli-deberta-v3-small` | `Qwen/Qwen3-8B-GGUF:Q4_K_M` via llama.cpp, CPU |
| Decision rule | `grounding_score >= 0.50` | Parse `SUPPORTED` / `CONTRADICTED` from output |
| Generation | None — classification only | `max_tokens=128`, `temperature=0.7`, `seed=42` |

The judge runs locally: no API key, no external spend, reproducible. The judge prompt is
deliberately **generic** — a plain "is this claim supported by this evidence, answer in one
word" — and was **not** tuned against this dataset. Tuning it would have made this a
measure of prompt-engineering effort rather than of the two approaches.

The NLI threshold (0.50) is carried over unchanged from `THRESHOLD_ANALYSIS.md`'s
operating point, which was selected on the dev split. Nothing here was selected on test.

### 2.1 Provenance split — and why it matters

The 30 test cases are **not homogeneous**, and this is central to reading the results:

- **`test_01`–`test_20`** — from the original 50 cases labelled by **dual LLM-as-judge
  passes** (`LABEL_AGREEMENT_REPORT.md`).
- **`test_21`–`test_30`** — appended by `scripts/expand_dataset.py`, correct **by
  deterministic construction**.

Scoring an LLM judge against labels that LLM judges produced is partially circular and
flatters the judge. Metrics are therefore reported for both subsets separately.

### 2.2 Output sanity checks

A judge that answers identically every time can still post a plausible score on an
unbalanced split, and a dead NLI pipeline returns flat zeros — the failure that wasted a
9-hour run in `PROJECT_REPORT.md` §4. Both were checked before reporting:

| Check | Value |
| :--- | ---: |
| Judge predicted all-same | No |
| Judge positive rate | 0.433 (ground-truth rate is 13/30 = 0.433) |
| Judge unparseable outputs | 0 |
| Judge ambiguous outputs | 0 |
| NLI distinct scores | 26 of 30 |
| NLI all-zero | No |

The judge followed the one-word output format on all 30 cases and its positive rate
matches the ground-truth base rate exactly.

## 3. Detection quality

| Subset | n | System | Precision | Recall | F1 | FPR |
| :--- | ---: | :--- | ---: | ---: | ---: | ---: |
| **Overall** | 30 | NLI cascade | 0.929 | 1.000 | 0.963 | 0.059 |
| **Overall** | 30 | LLM judge | **1.000** | **1.000** | **1.000** | **0.000** |
| Deterministic labels | 10 | NLI cascade | 1.000 | 1.000 | 1.000 | 0.000 |
| Deterministic labels | 10 | LLM judge | 1.000 | 1.000 | 1.000 | 0.000 |
| LLM-judge labels | 20 | NLI cascade | 0.889 | 1.000 | 0.941 | 0.083 |
| LLM-judge labels | 20 | LLM judge | **1.000** | **1.000** | **1.000** | **0.000** |

**The LLM judge outscored the NLI cascade overall.** The "comparable quality" half of the
hypothesis is not confirmed on this data as stated.

### 3.1 But the two systems disagree on exactly one case — and it sits in the circular subset

Across all 30 cases there is **one** case where the systems differ: `test_09`.

| | |
| :--- | :--- |
| Evidence | "Qwen 2.5 7B contains approximately **7.61 billion** total parameters with dense transformer layers." |
| Claim | "Qwen 2.5 7B has approximately **7.6 billion** parameters in its dense transformer architecture." |
| Ground truth | SUPPORTED (not a failure) |
| NLI cascade | grounding_score **0.922** → predicted failure ✗ |
| LLM judge | `SUPPORTED` → correct ✓ |

This is a **numeric rounding paraphrase**. DeBERTa scored a faithful restatement as high
risk; the judge handled it. That is a real and characterizable NLI weakness, not noise.

The load-bearing observation is where it sits:

- On the **deterministic** subset — the 10 cases with non-circular labels — **both systems
  score 1.000 across the board.** That subset does not discriminate between them at all.
- The judge's entire measured advantage comes from the **LLM-judge-labelled** subset,
  which is precisely the subset where circularity is expected to flatter it.

So the honest reading is not "the judge is better." It is: **on the cleanly-labelled
cases the two are indistinguishable, and the only case separating them is a genuine NLI
failure mode that happens to fall inside the circular subset.** Both statements are true
simultaneously, and neither should be dropped. A rounding-paraphrase failure is a real
defect regardless of which subset it landed in.

### 3.2 Sample size

30 cases overall, 10 and 20 in the subsets. **A single case flipping moves F1 by roughly
0.04 overall and more within a subset.** The judge's 1.000 does not mean it is perfect —
it means it made no mistakes on 30 hand-built cases. Differences of this magnitude should
not be treated as separations.

## 4. Inference effort

Reported as **generation-token cost and inference effort**, not monetary cost — the judge
here is a local model, so there is no per-call price to quote. Any monetary figure would
require a pricing assumption not made in this project.

| Metric | NLI cascade | LLM judge | Ratio |
| :--- | ---: | ---: | ---: |
| Mean latency (ms) | 257.53 | 3334.75 | **12.9×** |
| Median latency (ms) | 202.94 | 3170.39 | **15.6×** |
| Stdev latency (ms) | 281.02 | 820.16 | — |
| Min latency (ms) | 171.02 | 2593.18 | — |
| Max latency (ms) | 1740.83 | 7142.49 | — |
| Generation tokens out (total) | **0** | 219 | — |
| Generation tokens out (mean/case) | **0** | 7.3 | — |
| Prompt tokens in (total) | n/a | 3163 | — |

Total benchmark wall time: **107.8 s** for both systems across 30 cases.

Median is the more representative figure for both: NLI's mean is inflated by a single
1740 ms outlier (first-call warm path), and the judge's by a 7142 ms case. Both
distributions are right-skewed, which is why mean alone would mislead.

**The cost half of the hypothesis holds clearly.** The NLI cascade is roughly an order of
magnitude faster per evaluation and emits **zero generation tokens** — it classifies rather
than generates. On a hosted judge that token count is what would carry a price and a rate
limit; here it is the structural difference between the two approaches, independent of
which vendor runs them.

## 5. What this does and does not support

**Supported:**

- The NLI cascade evaluates at ~13–16× lower latency with zero generation tokens.
- On deterministically-labelled cases it matches the judge exactly (both 1.000).
- It is deterministic: same input, same score, no sampling temperature, no prompt-format
  dependence. The judge ran at `temperature=0.7`; a different seed could change its output.

**Not supported:**

- "Comparable or better quality" as an unqualified claim. Overall F1 was 0.963 vs 1.000.
- Any claim about LLM judges in general. This is **one** judge model, **one** generic
  prompt, **one** temperature/seed, on **30** cases. A larger judge, a tuned prompt, or a
  hosted frontier model could all score differently.

**Newly identified defect:** the NLI cascade mis-scores numeric rounding paraphrase
("7.61 billion" vs "approximately 7.6 billion" → 0.922 risk). This is a concrete,
reproducible weakness worth tracking. It has **not** been fixed here — doing so from a
single observed case would be fitting to one data point.

## 6. Scope not covered

- **One judge configuration only.** No sweep over temperature, prompt phrasing, or model
  size. The judge was not given few-shot examples or chain-of-thought, both of which
  typically improve judge accuracy.
- **Grounding only.** This compares the grounding-risk path. Tool-claim validation and
  inter-agent disagreement — the other two differentiator signals — were not part of this
  comparison, and a generic judge would need custom scorers to attempt either.
- **No competitor product was run.** This compares AgentPulse against a *generic LLM-judge
  approach*, not against MLflow's, Arize's, or Datadog's actual evaluators, which are
  tuned products rather than a plain prompt. Installing Phoenix and running its evaluators
  on this same split remains the stronger, unexecuted comparison
  (`COMPETITIVE_POSITIONING.md` §9).
- **CPU-only, quantized (Q4_K_M).** Absolute latencies are hardware- and
  quantization-specific. The *ratio* is the transferable figure, and even that would
  narrow on a GPU where generation is far cheaper.
