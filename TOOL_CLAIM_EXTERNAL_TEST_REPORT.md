# Tool-Claim Validator on Real Agent Traces

**Date:** 2026-08-27
**Script:** `experiments/tool_claim_external_test.py`
**Raw results:** `experiments/results/tool_claim_external_test.json`
**Validator:** `backend/app/services/tool_claim.py` — **unmodified**
**Data class:** `EXTERNAL_REAL_DATA`

---

## 1. Research question

`TOOL_CLAIM_VALIDATOR_REPORT.md` reports precision **1.000** / recall **0.727** on 19
hand-written cases — authored by the same person who wrote the validator. Its own §4 names
the follow-on:

> a natural follow-on would be running this validator against the actual […] outputs […]
> to see how often real model output triggers each mismatch type.

This is that run, against an independently collected corpus.

**Result: the validator extracts nothing at all from real agent output.** Not a low
score — zero claims across 8,353 prose spans.

## 2. Data source

| | |
| :--- | :--- |
| Dataset | [`Exgentic/agent-llm-traces-v2`](https://huggingface.co/datasets/Exgentic/agent-llm-traces-v2) |
| Revision | `4b8ad4ab198438e5a170f9171c19c6a2cf7c1814` |
| Retrieved | 2026-08-27 |
| Sampled | 500 sessions, stratified across every (benchmark, harness, model) cell |
| Coverage | 3 benchmarks, 4 harnesses, **all 5 models** |

Independently collected; not authored for AgentPulse. Read via `HfFileSystem` with parquet
column projection — the 231 MB corpus was never downloaded.

**No labels.** The corpus carries no ground truth for whether an agent's tool claim is
truthful, and none was invented. Consequences in §6.

## 3. Method

The shipped `extract_claims()` and `evaluate_tool_claims()` are called unmodified on each
span's assistant prose, with the span's **structured** `tool_call` parts supplied as the
actual tool records.

**A positive control runs in the same script**, using the validator's own benchmark
phrasing. This is deliberate: a zero extraction rate is uninterpretable alone — it is
equally consistent with *"the validator does not fire on this text"* and *"the measurement
harness is broken"*. The script refuses to continue if the control fails.

This lesson is inherited from the drift work, where a first experiment lacking a positive
control produced a result that could not be interpreted at all
(`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §10.1).

**Positive control: PASSED.** All four cases extracted correctly, e.g.
`"We queried the search tool and retrieved 3 records."` → `tool='search', count=3`.
The harness can see extractions when they exist.

## 4. Results

| Benchmark / harness | Prose spans | **Spans with any claim** | Structured tool calls | Countable results |
| :--- | ---: | ---: | ---: | ---: |
| appworld/claude_code | 883 | **0** | 699 | 143 |
| browsecompplus/claude_code | 486 | **0** | 1451 | 0 |
| browsecompplus/openai_solo | 1191 | **0** | 1844 | 0 |
| browsecompplus/smolagents_code | 2197 | **0** | 0 | 0 |
| browsecompplus/tool_calling | 989 | **0** | 1984 | 0 |
| swebench/claude_code | 2607 | **0** | 1366 | 3 |
| **Total** | **8,353** | **0** | **7,344** | **146** |

**Extraction rate: 0.0.** Zero claims extracted, in every cell, for every model.

Tool responses present after de-duplication: 10,422. Of those, **146** carry a genuine
countable result set.

## 5. Why: a design-premise mismatch, not a tuning gap

The validator's `TOOL_PATTERNS` require the agent to **narrate** tool use in prose —
`"I used the X tool"`, `"the X tool returned"`. Real agents in these harnesses do not
narrate tool use, because invocation is **structured**. Actual pairs from the corpus:

| Agent prose (what the regex reads) | Structured `tool_call` (what actually happened) |
| :--- | :--- |
| "First, I need to get the supervisor's profile and credentials to log into the phone and file system applications" | `mcp__environment__supervisor__show_profile` |
| "I need to understand the task: Ashley wants to update RSVPs in a CSV file… Let me start by exploring the available tools" | `TodoWrite` |
| `"\n\n"` | `mcp__environment__supervisor__show_account_passwords` |

The prose narrates **intent**; the structure records **action**. The tool name the regex
is hunting for is not in the text at all — it is in a field the validator never reads.

`COUNT_PATTERNS` fail for a related reason: they require a narrow noun list
(`results|papers|documents|records|items|studies|articles|matches`) in a fixed template
(`"found 3 results"`). Real agents write about messages, files, rows, and issues.

**This is not fixable by expanding the regex.** The information the patterns look for does
not exist in the prose of a structured-tool-calling agent.

## 6. What is and is not claimed

**The validator is not broken on its own terms.** It does exactly what it was built to do,
and the positive control proves it still works. The 19-case benchmark result stands as a
correct measurement *of the thing it measured*.

**What the 19-case benchmark does not establish** is applicability. Every case in it was
hand-written in the phrasing the regex expects. That made the benchmark a test of the
regex against itself, and it could not have surfaced this. `TOOL_CLAIM_VALIDATOR_REPORT.md`
§3 already noted the validator "misses paraphrased claims"; the real finding is stronger —
on these agents there is nothing to paraphrase, because tool use is never described.

**Precision, recall and F1 are `UNLABELLED` here** and are deliberately not reported. Two
independent reasons: the corpus has no ground truth for claim truthfulness, and with zero
extractions there are no predictions to score.

**A separate, smaller finding:** even with working extraction, the count-checking path
would find little in this corpus — only **146 of 10,422** tool responses carry a countable
result set. Tool results here are mostly free text, not structured collections. The
`FABRICATED_TOOL` path is better served: 7,344 structured tool calls with real names are
available to check against.

## 7. Limitations

- **One corpus.** Agents that *do* narrate tool use in prose exist — older ReAct-style
  prompting does exactly that. This result applies to structured-tool-calling harnesses,
  which is what this corpus contains.
- **500 sessions sampled**, not all 10,056. Given zero extractions across every cell and
  every model, more sampling would not change the direction, but the figures are a sample.
- `browsecompplus/smolagents_code` shows **0 structured tool calls** — that harness has the
  model write Python rather than emit tool calls, so its 2,197 prose spans test the text
  path only.
- **No ground truth**, so nothing here says whether agents' claims about tool results were
  actually truthful. It says only that the validator never got as far as forming a claim.
- The countable-result heuristic requires a parsed collection with more than one element.
  A first version of this script counted any JSON list, which marked 100% of responses
  countable — it was measuring the `[{"type":"text",...}]` wrapper rather than the payload.

## 8. Next step

Only what the evidence supports.

**The extraction stage is looking in the wrong place.** The structured `tool_call` parts
carry exactly what `TOOL_PATTERNS` is trying to recover from prose — tool name, arguments,
and a response id linking to the result. AgentPulse's own `SpanInput` already has a
`tool_name` field and `ToolCallRecord` already models this, so the pipeline shape exists;
what is missing is that `extract_claims()` reads only text.

The productive reformulation is to stop asking *"which tools does the agent say it used"*
(structurally known, no inference needed) and instead ask *"do the agent's statements about
tool **results** match those results"* — which is the part that genuinely needs checking and
where fabrication actually causes harm.

That is a redesign of the extraction stage, not a regex change, and it needs its own
controlled test before any production change. **No production code was modified by this
work.** Test suite unchanged at 130/130.

---

## 9. A real-data benchmark now exists (2026-08-27)

§8 said the redesign "needs its own controlled test". That test set has been built:
`experiments/tool_claim_benchmark_build.py` →
`datasets/external/exgentic_v2/derived/tool_claim_cases.json` (gitignored, regenerable;
provenance tracked in `tool_claim_cases_metadata.json`).

**574 cases** from real traces, stratified across 6 benchmark/harness cells and all 5
models.

| Tier | Cases | Label source |
| :--- | ---: | :--- |
| `tier_1_external` | **124** | The corpus's own `success` field, computed by the benchmark harness independently of AgentPulse |
| `tier_2_candidate` | 54 | Numeric assertion with countable evidence — **deliberately unlabelled** |
| `unlabelled` | 396 | Behavioural measurement only |

Tier 1 is near-balanced — **63 overclaims / 61 consistent** — so a detector cannot score
well by always guessing one class.

### 9.1 What a case is

Per §5, per-step prose is *intent*. A case therefore pairs the **retrospective final
summary** against the **structured evidence** of what actually ran:

> *"Perfect! I have **successfully**: 1. Logged into Spotify… 4. Added all recommended
> songs to the queue (5 songs)… 6. Started playing the music"*
> — `success=False`, `status=unfinished`, `score=0.667`

### 9.2 The label's limit, recorded in the artifact rather than only in prose

`score=0.667` on that example is the point: the agent genuinely did most of the work. An
overclaim label means **"asserted completion on an objectively failed run"**, *not* "every
statement is false". It measures overclaiming — real, externally labelled, and adjacent to
tool-claim correctness without being identical to it.

### 9.3 Three guards against repeating the 19-case failure

1. **The validator was never consulted during construction.** Selecting cases with the
   detector's own patterns would have produced a benchmark of exactly what it can already
   see — which is precisely how the 19-case set went wrong.
2. **The completion matcher is broader than, and written independently of,**
   `tool_claim.py`'s `SUCCESS_CLAIM_PATTERNS`.
3. **Sampling is stratified by harness.** Harness variation has misled this project twice:
   `smolagents_code` emits zero structured tool calls, and in `tool_calling` two of five
   models emit no prose at all.

The 19-case benchmark is **deliberately preserved and untouched**. It is useful evidence
of why the old methodology was insufficient.

## 10. Baseline: the current validator scores F1 0.000

Run with `experiments/tool_claim_baseline_run.py`. The shipped validator, unmodified,
against the benchmark above.

| | Own 19-case benchmark | **Real-data benchmark** |
| :--- | ---: | ---: |
| Precision | 1.000 | **0.000** |
| Recall | 0.727 | **0.000** |
| F1 | 0.842 | **0.000** |

Extraction: the validator found anything to check in **1 of 574 cases (0.2%)**, and
flagged **zero**. Confusion matrix on the 124 labelled cases: **TP=0, FP=0, FN=63, TN=61**.

**Accuracy reads 0.4919, and that number is meaningless here.** It is just the class
balance (61/124) — the detector never predicted the positive class at all. The script
flags this explicitly as a degenerate detector rather than letting a mid-looking accuracy
imply partial skill. Reporting F1 alone would have hidden it too.

This is the "before" figure. It is deliberately established *before* any redesign, so the
redesign has something honest to beat, and so the benchmark is proven usable rather than
assumed to be.

**Nothing in this section is a new criticism of the validator.** It confirms §4 on a
labelled set: the component works as designed, its design premise does not hold for these
agents, and the consequence is now expressed in the same units the original report used.

**Next: step 3 of the redesign** — build extraction that reads structured `tool_call`
telemetry plus the retrospective summary, and measure it against this same benchmark. No
production code has been modified. Tests remain at 130/130.
