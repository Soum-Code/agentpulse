# Tool-Claim Label Agreement — A Failed Labelling Attempt

**Date:** 2026-08-27
**Script:** `experiments/tool_claim_labelling.py`
**Raw output:** `datasets/external/exgentic_v2/derived/tool_claim_gold.json` (gitignored, regenerable)
**Judge:** `Qwen/Qwen3-8B-GGUF:Q4_K_M`, local, real weights confirmed loaded before labelling

**Outcome: the gold set is not usable, and no redesign should be measured against it.**
This report exists because the attempt failed in an informative way.

---

## 1. Why this was attempted

`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` §10 established that the current validator scores
F1 **0.000** on real traces. The obvious next move is to redesign extraction — but the
574-case benchmark cannot supply an accuracy target for local claim-vs-evidence
contradiction (measured, §9 of that report and the exploration behind it):

| Target | Why it cannot be scored |
| :--- | :--- |
| Task-level overclaim | Labelled, but not derivable from the trace — error markers appear in 79% of overclaims vs 69% of consistent cases |
| `WRONG_COUNT` | Summary numbers are IDs, dates and domain quantities, not result counts — 6/54 overlap, likely coincidental |
| `RESULT_DISTORTION` | 2 of 137 sessions (1%) |
| `FABRICATED_TOOL` | Requires judgement; no structural label |

So the choice was: build the redesign and measure only whether it *fires*, or produce
labels first. Labels first was chosen, because shipping a detector measurable only on
firing rate is precisely the mistake this investigation uncovered.

## 2. Protocol

Follows `LABEL_AGREEMENT_REPORT.md`: two evaluation passes, fixed taxonomy, Cohen's kappa,
and an explicit statement that these are **LLM labels, not human review**.

**One deliberate deviation, and it is a correction.** That protocol (§1, item 4) fed each
judge *"AgentPulse's own DeBERTa NLI output (3-class probabilities) and similarity score"*.
For labelling a set AgentPulse will then be **scored against**, that anchors the judge on
the system under test. Here the judge saw only the agent summary and the structured tool
evidence. Nothing from `tool_claim.py` was shown to it.

**Sample:** 120 cases, stratified across 6 (benchmark, harness) cells, seed 20260827,
**not** filtered to cases that look checkable — filtering would bias the distribution
toward positives.

**Taxonomy:** `NO_MISMATCH`, `FABRICATED_TOOL`, `WRONG_COUNT`, `RESULT_DISTORTION`,
`UNVERIFIABLE`.

**Two passes, same model, different prompt framings and seeds.** This was flagged in
advance as weaker than two independent annotators — it measures prompt-robustness, and
correlated errors survive both passes. The kappa was expected to be an *upper bound*.
It turned out not even to reach a usable floor.

## 3. Results

| | This attempt | `LABEL_AGREEMENT_REPORT.md` (original 50 cases) |
| :--- | ---: | ---: |
| Cases compared | 106 | 50 |
| Observed agreement | **0.5377** | 0.960 |
| Expected chance agreement | 0.4033 | 0.49 |
| **Cohen's kappa** | **0.2252** | **0.922** |
| Unparseable outputs | 0 | — |
| Disagreements excluded | **49 (46%)** | — |

Resolved gold set: **57 cases**.

| Label | Gold | Pass A | Pass B |
| :--- | ---: | ---: | ---: |
| `NO_MISMATCH` | **43** | 49 | 80 |
| `RESULT_DISTORTION` | 12 | 24 | 23 |
| `UNVERIFIABLE` | 2 | 29 | 2 |
| `FABRICATED_TOOL` | **0** | 2 | 1 |
| `WRONG_COUNT` | **0** | 2 | 0 |

## 4. Why the gold set is unusable

Three independent reasons, any one of which is disqualifying:

1. **κ = 0.2252.** Conventionally "fair" at best. The original protocol reached 0.922 on a
   comparable-sized sample. A benchmark built on labels this unstable would measure the
   labelling noise, not the detector.
2. **Two of the four target classes have zero examples.** `FABRICATED_TOOL` and
   `WRONG_COUNT` cannot be benchmarked at all. Those are two of the three mismatch types
   the validator exists to detect.
3. **75% of the gold set is a single class.** A detector that always answered
   `NO_MISMATCH` would score 75% accuracy without any capability.

## 5. The disagreement is systematic, not noise — and this is the real finding

The two passes did not disagree randomly. They disagreed **directionally**:

| Pass A → Pass B | Cases |
| :--- | ---: |
| `UNVERIFIABLE` → `NO_MISMATCH` | 22 |
| `RESULT_DISTORTION` → `NO_MISMATCH` | 12 |
| `UNVERIFIABLE` → `RESULT_DISTORTION` | 5 |
| `NO_MISMATCH` → `RESULT_DISTORTION` | 5 |

Pass A returned `UNVERIFIABLE` **29** times; Pass B returned it **2** times. Same model,
same data, same taxonomy — only the wording differed.

The cause is visible in the prompts. Pass B asks *"does the summary misrepresent what the
telemetry shows?"*, a yes/no question with a natural default of "no". Pass A asks
*"classify the summary against the record"*, which offers no default and leaves the judge
free to say it cannot tell. **The framing supplied the answer more often than the data
did.**

That is not a tuning problem to be fixed with a better prompt. It is evidence that the
question **"does this multi-claim summary misrepresent aggregate telemetry?"** is not
well-posed on this data.

This is consistent with everything found earlier in the investigation: real agent summaries
mostly are not checkable against their traces. The original protocol reached κ 0.922
because its task was well-posed — one explicit claim against one explicit premise. Asking
about a whole summary against aggregated evidence is a materially different and much
looser question, and the agreement figure reflects that.

## 6. What this does and does not say

**Does not say** the judge model is inadequate, or that the prompts were badly written. A
different prompt pair would produce a different split; nothing here suggests one of the two
framings is correct and the other wrong.

**Does say** that this labelling task, as posed, does not produce stable labels — and
therefore that the tool-claim redesign still has nothing honest to be measured against.

**Does not say** the redesign is a bad idea. Reading structured `tool_call` telemetry
rather than regex-matching prose remains obviously more correct than what ships today. It
is the *validation* that is blocked, not the design.

## 7. Limitations

- **Both passes used the same model.** Genuine independence needs a second model; only
  Qwen3-8B is available locally. Flagged before running, and the result is worse than the
  upper bound this predicted.
- **One judge model, 8B, quantized.** A stronger judge might be more self-consistent —
  though §5 argues the instability is in the question, not the judge.
- **120 cases sampled from 574**, one corpus, six cells.
- **These are LLM labels.** No human reviewed any case. Nothing here should be described as
  human-verified ground truth.
- **Runtime:** ~31 minutes for 240 inference calls. Prompt processing dominates on CPU
  because full summaries are included; that cost shapes how large any future labelling run
  can realistically be.

## 8. Next step

The blocker is now precisely identified: **the labelling task must be narrowed until it is
well-posed.**

The version that worked in this project — κ 0.922 — judged *one explicit claim against one
explicit premise*. The version that failed here judged *a whole summary against aggregated
telemetry*. The productive direction is to decompose: extract individual assertions from a
summary first, then label each assertion against the single specific tool result it refers
to. That is a smaller, better-defined question, and it is the same shape as the task that
previously produced stable labels.

That decomposition is itself part of the extraction redesign, which creates an ordering
problem worth stating plainly: **the extractor is needed to produce labellable units, and
labels are needed to validate the extractor.** The way out is to build extraction first,
use it only to *segment* claims rather than to judge them, and label the segments — so the
component being validated never supplies its own verdict.

**No production code was modified.** `tool_claim.py` is untouched, the 19-case benchmark is
untouched, and the test suite remains at 130/130.
