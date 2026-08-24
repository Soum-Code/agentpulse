# Tool-Claim Validator Empirical Benchmark

**Date:** 2026-08-24
**Method:** 19 labeled cases across 4 categories (the validator's 3 documented mismatch types plus true-negative controls), run against `backend/app/services/tool_claim.py`'s `evaluate_tool_claims`. Script: `experiments/tool_claim_benchmark.py`. Full per-case output: `experiments/results/tool_claim_benchmark_results.json`.

## 1. Two real bugs found and fixed before benchmarking

A benchmark script and a 5-case result file already existed in the repo from the initial commit but were never referenced from `PROJECT_REPORT.md` and had not been re-run. Running it first, before touching anything, surfaced real recall failures (precision 1.0, recall 0.333, F1 0.5 on the original 5 cases) that traced to two actual bugs, not dataset noise:

1. **Partial-match count check was skipped entirely.** `validate_claims`'s exact-match branch checked `claimed_count` against `tool.result_count`; its partial/substring-match branch (used when a claim like "the customer database" matches a tool named `customer_db`) built the match object without ever running that check. A claim of 14 records against an actual 3 went undetected whenever the tool name didn't match verbatim. Fixed by extracting a shared `_check_count_mismatch` helper used in both branches (`tool_claim.py`).
2. **`RESULT_DISTORTION` was documented but never implemented.** The module docstring lists three mismatch types (`FABRICATED_TOOL`, `WRONG_COUNT`, `RESULT_DISTORTION`), but only the first two existed in code. A claim like "the backup script executed without any error" against a tool call that actually recorded `status="error"` produced zero extracted claims at all — the phrasing doesn't fit the tool-name-then-keyword regex template — so the false claim of success passed through completely unflagged. Fixed with a new, independent check (`_check_false_success_claims`) that cross-references success-claiming language in the output text against any tool call with a non-success status, regardless of whether the name/count extractor found anything.

Both fixes were verified against the existing `tests/test_services.py::TestToolClaim` suite (unchanged, all passing) before the benchmark was expanded or re-run.

## 2. Results after the fix, on an expanded 19-case set

| | |
| :--- | ---: |
| Precision | 1.000 |
| Recall | 0.727 |
| F1 | 0.842 |
| TP / FP / FN / TN | 8 / 0 / 3 / 8 |
| Avg. latency | 0.07 ms |

By category:

| Category | Cases | Result |
| :--- | :---: | :--- |
| WRONG_COUNT (exact match) | 2 | both correct |
| WRONG_COUNT (partial match) | 2 | both correct (regression cases for bug 1) |
| FABRICATED_TOOL | 3 | all correct |
| RESULT_DISTORTION | 4 | all correct, including a mixed-outcome case with one healthy and one errored tool call in the same output (regression cases for bug 2) |
| Paraphrase (anonymous count) | 2 | 1 correct, 1 missed |
| Edge case (zero count) | 2 | both correct |
| True negative | 2 | both correct — no over-triggering on vague or numberless text |
| Known limitation (untuned paraphrase) | 2 | both missed, by design (see below) |

## 3. Why recall isn't 1.0, and why that's not being chased down further

The validator is explicitly a simple, deterministic, regex-based pattern matcher — the module's own docstring calls this out: "intentionally simple for transparency. Acknowledged limitation: misses paraphrased claims." Three cases in this benchmark hit exactly that boundary:

- `tc_paraphrased_count_mismatch`: "Altogether, 7 publications were identified" — the count-extraction regex's keyword lists don't include "identified" in the same position as "publications", so nothing is extracted at all. A one-line regex tweak could catch this specific phrasing, but the moment this list starts growing to cover the next paraphrase, and the next, the validator stops being the simple, auditable, effectively-zero-latency (0.07ms per call) check it's designed to be and starts becoming an under-tested reimplementation of NLI — which is what the grounding evaluator (a real NLI model) is already responsible for elsewhere in the pipeline.
- `tc_known_miss_semantic_paraphrase` ("gave everything a clean bill of health" for a tool that actually errored) and `tc_known_miss_implicit_count` ("every one of the fourteen customer records") are genuine semantic/numeric paraphrases with no lexical overlap with the pattern list at all — catching these would require actual language understanding, not pattern expansion.

These two known-miss cases were written specifically to keep this benchmark honest: this validator's bug fixes and its test cases were both produced in the same pass, so a benchmark built only from cases the fixes were designed to catch would trivially score 1.0 and prove nothing. Recall 0.727 reflects real, expected behavior of a deliberately simple validator, not a defect to chase to zero.

## 4. Scope not covered here

This is a benchmark of the deterministic tool-claim validator in isolation, not of its contribution to the full risk-aggregation pipeline (already covered by the ablation study's Config D, `PROJECT_REPORT.md` Section 5, which includes tool-claim validation at F1 0.929). It also doesn't test claim extraction against real LLM-generated text (all cases here are hand-written); a natural follow-on would be running this validator against the actual Qwen3-8B outputs already captured in `experiments/results/reasoning_strategy_results.json` to see how often real model output triggers each mismatch type.
