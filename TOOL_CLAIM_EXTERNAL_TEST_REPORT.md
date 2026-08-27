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
