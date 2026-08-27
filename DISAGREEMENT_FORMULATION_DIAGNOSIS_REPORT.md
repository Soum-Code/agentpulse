# Disagreement Formulation Diagnosis on External Multi-Agent Text

**Date:** 2026-08-27
**Scripts:** `experiments/disagreement_feasibility_probe.py`,
`experiments/disagreement_alarm_rate_pilot.py`,
`experiments/disagreement_truncation_diagnosis.py`,
`experiments/disagreement_formulation_diagnosis.py`
**Raw results:** `experiments/results/disagreement_{probe_labels,probe_key,alarm_rate_pilot,truncation_diagnosis,formulation_diagnosis}.json`
**Data class:** `EXTERNAL_REAL_DATA` — see §3
**Detector:** `backend/app/services/disagreement.py`, **unmodified**
**Production code changed by this work:** none. No evaluator wiring, no dashboard.

---

## 1. Research question

`DISAGREEMENT_BENCHMARK_REPORT.md` reports F1 0.960 for the inter-agent disagreement
engine on `datasets/v1.0_multiagent.json` — 22 self-authored cases. `COMPETITIVE_POSITIONING.md`
§9 already carried the caveat that this number had never been externally validated, and
`MLFLOW_CAPABILITY_AUDIT.md` §9 narrowed the competitive claim to "no named feature"
while noting the same outstanding gap.

The question here is narrow and prior to any benchmark:

> On real multi-agent traces that this project did not author, does the shipped
> disagreement detector fire on genuine contradictions at all?

The answer is **no**, and this report establishes why.

## 2. The failure this diagnoses

An alarm-rate pilot (`experiments/disagreement_alarm_rate_pilot.py`, 96 rows / 3,043
agent pairs) measured the detector's behaviour on naturally occurring DEBATE pairs:

| Measure | Value |
| :--- | ---: |
| Alarm rate | **1.282%** (39 / 3,043), 95% CI [0.939%, 1.747%] |
| Pairs suppressed by the relevance gate | **0** of 39 |
| Throughput | 1.40 pairs/sec (CPU, PyTorch fallback) |

Against the 40 independently labelled probe pairs (§3), the same detector scored:

```
TP = 0    FN = 10    FP = 0    TN = 30        recall = 0.00
```

So the detector is not inert — it fires roughly 13 times per thousand pairs. It fired on
**none** of the ten contradictions a blind annotator had identified.

Two things were verified before treating that as a finding:

- **The label-to-pair alignment is exact.** The probe's 40 cases are rebuilt by replaying
  its recorded seed; all 40 match the key file on persona, solution and sampling group.
  A misalignment would have produced a spurious 0/10, and the replay check is asserted
  in-script so a future divergence aborts rather than mis-scores.
- **The models were genuinely loaded.** An earlier run aborted on the model guard because
  `load_models()` defaults to `sync=False` and returns while loading on a background
  thread, and because `models_loaded()` returns a *dict* — so the idiomatic
  `if not models_loaded()` can never fire, a non-empty dict being truthy. Both were
  errors in the experiment harness, not in production code. Fixed to
  `load_models(sync=True)` plus `all(models_loaded().values())`, and backed by a
  known-contradictory probe pair that must score before any run proceeds.

## 3. Data source and labels

`Multi-Agent-LLMs/DEBATE` (MALLM), Apache-2.0, 14.4K rows across 145 configs. Real
multi-agent debates: distinct agent identities (UUID + persona + model), a shared task
instruction, and multi-turn `globalMemory` traces.

**Its shipped fields are not usable as disagreement ground truth**, established before
any labelling:

- `agreement` is a **procedural vote** in the MALLM harness meaning "keep debating", not
  "I contradict you". Observed directly: an agent writes *"I agree with the Snow White's
  Dwarfs Representative…"* and carries `[DISAGREE]`.
- `solution` is a single letter — every one of the 145 configs asks "Answer A) Yes or
  B) No" — and the letter flips **without the message text expressing the flip**.

Scored against independent labels, `solution` mismatch as a standalone label yields
**precision 0.500, recall 1.000**. It is a usable *screen* and an unusable *label*; taking
it as ground truth would have injected 50% label noise. This is the same failure mode that
invalidated the tool-claim tier-1 target — the label was not derivable from the input the
detector sees.

**Labels used here** come from `experiments/results/disagreement_probe_labels.json`: 40
pairs (20 drawn from the `solution`-mismatch stratum, 20 random controls), labelled blind
from the shared task and the two agent outputs only. Result: **10 CONTRADICTION, 30
NO_CONTRADICTION, 0 UNCLEAR**, with 10/20 in the mismatch stratum and **0/20 in the
controls** — the separation that made the probe interpretable.

One leak was closed before labelling: MALLM instructs agents to end messages with a
literal `[AGREE]`/`[DISAGREE]` token, present in **100% of sampled pairs**. Those tokens
are stripped for both annotator and detector; leaving them in would let either read the
answer off the input.

> **Label limitation, stated plainly.** These are **single-pass LLM labels from one
> annotator**. There is no second judge and therefore **no Cohen's κ**. They are adequate
> for diagnosis and are *not* benchmark ground truth. The planned two-judge protocol
> (second pass by local Qwen3-8B GGUF, κ reported, unresolved disagreements excluded
> rather than tiebroken) has not been run.

## 4. Method

Four input formulations, with **everything else held fixed** — same 40 pairs, same NLI
model, same threshold 0.6, same relevance floor 0.40, same detector entry point
(`evaluate_inter_agent_disagreement`), no threshold tuning, no production edit. Only the
text handed to the detector varies.

| Condition | Premise / hypothesis |
| :--- | :--- |
| `full` / `forward` | Both outputs as-is; earlier agent as premise (production behaviour) |
| `first_512` | Each output cut to its **first** 254 tokens |
| `last_512` | Each output cut to its **last** 254 tokens |
| `reversed` | Full text, premise and hypothesis swapped |
| `conclusion` | Each output reduced to its concluding assertion |
| `conclusion_reversed` | Concluding assertions, swapped |

**Why 254 and not 512.** The model's 512-token limit applies to the *concatenated pair*,
not to each output. Giving each output 512 tokens produces a 1024-token pair that the
model re-truncates internally, making the manipulation a no-op. Each output therefore
receives half the window minus special tokens.

**Conclusion extraction is positional, never authored.** The rule locates the final
`A) Yes` / `B) No` marker the task itself mandates and keeps the sentence containing it;
absent a marker, it keeps the last two sentences. No paraphrase, no rewriting. Hand-writing
a "core claim" per case would inject the annotator's judgement into the detector's input
and manufacture a favourable result.

**All 30 negatives run in every condition.** A recall gain arriving with a false-positive
surge is not an improvement, and cannot be distinguished without them.

## 5. Results

### 5.1 The original production formulation: recall 0.00

| | value |
| :--- | ---: |
| Recall on 10 labelled contradictions | **0.00** (TP 0, FN 10) |
| False positives on 30 negatives | 0 (0.0%) |
| Mean P(contradiction) on positives | **0.0070** |
| Max P(contradiction) on positives | **0.0204** |

The scores are not near-misses below a 0.6 threshold. They are approximately zero. **No
threshold setting in (0, 0.6] recovers these cases** without firing on essentially
everything — which is why threshold tuning was excluded rather than attempted.

The relevance gate is also **inert on this corpus**: median semantic similarity on the
positives is 0.820 against a 0.40 floor, and the pilot recorded 0 of 39 alarms suppressed.
The gate that removed 4 of 5 measured false positives on the internal benchmark does
nothing here, because all agents in a debate discuss the same task at length.

### 5.2 Truncation: hypothesis refuted

The first hypothesis was that DeBERTa's 512-token window drops the concluding answer,
leaving NLI only the shared framing.

| Condition | Recall | FP rate | Mean P(contra) | Both conclusions retained |
| :--- | ---: | ---: | ---: | ---: |
| `full` | 0.00 | 0.0% | 0.0070 | 10/10 |
| `first_512` | 0.00 | 0.0% | 0.0064 | 3/10 |
| `last_512` | 0.00 | 0.0% | 0.0100 | 10/10 |

**Maximum P(contradiction) across all 10 positives × all 3 conditions: 0.0414.**

Refuted on three independent grounds:

1. Retaining the tail (`last_512`) does not move recall off zero.
2. **Short pairs fail identically.** P004 (83 / 66 tokens) and P027 (57 / 36 tokens) fit
   entirely inside any window and score 0.0105 and 0.0170.
3. **The `full` condition already retained both conclusions in 10/10 cases** — truncation
   was never removing them. The hypothesis was wrong at its premise, not merely
   unsupported.

Against the pre-registered decision rule (`full` 0/10, `first_512` 0/10, `last_512` 0/10),
this is the "truncation hypothesis fails" branch.

### 5.3 Conclusion extraction: strong improvement on this probe

| | `forward` | `conclusion` |
| :--- | ---: | ---: |
| Recall | 0.00 | **0.40** (TP 4, FN 6) |
| False positives / 30 | 0 (0.0%) | 3 (**10.0%**) |
| Mean P(contradiction) | 0.0070 | **0.4288** |
| Max P(contradiction) | 0.0204 | 0.9993 |

Mean contradiction probability rises by roughly **90×**. The signal was present in the
text all along; the production formulation was burying it in surrounding discourse. Note
the cost: 3 false positives appear, where the full-text condition had none.

### 5.4 Reversed direction: real but insufficient alone

| | `forward` | `reversed` |
| :--- | ---: | ---: |
| Recall | 0.00 | **0.00** |
| False positives / 30 | 0 (0.0%) | 1 (3.3%) |
| Mean P(contradiction) | 0.0070 | 0.0298 |
| Max P(contradiction) | 0.0204 | 0.2444 |

NLI is directional, and the production all-pairs path fixes orientation via
`itertools.combinations` — the earlier agent in trace order is always the premise. Swapping
it raises mean contradiction probability ~4× and the maximum ~12×, but **recall stays at
0.00 and one false positive appears.** On its own this changes nothing operationally.

### 5.5 Conclusion + reversed: recall 0.60 at 0.0% false positives

| condition | recall | TP | FN | FP | FP rate | mean P | max P |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `forward` | 0.00 | 0 | 10 | 0 | 0.0% | 0.0070 | 0.0204 |
| `reversed` | 0.00 | 0 | 10 | 1 | 3.3% | 0.0298 | 0.2444 |
| `conclusion` | 0.40 | 4 | 6 | 3 | 10.0% | 0.4288 | 0.9993 |
| **`conclusion_reversed`** | **0.60** | **6** | **4** | **0** | **0.0%** | **0.6276** | 0.9991 |

The combination is better than either component: it recovers 6 of 10 contradictions while
producing **zero** false positives on the 30 labelled negatives. The two manipulations are
not redundant — extraction supplies the signal, orientation cleans up the false positives
that extraction alone introduced.

Numbers reproduced identically across two runs (deterministic).

## 6. The four residual failures

Preserved individually, because they characterise what the experimental formulation still
cannot do. Scores are `conclusion_reversed`.

| Case | P(contra) | Similarity | Answers | Failure mode |
| :--- | ---: | ---: | :--- | :--- |
| P019 | 0.0344 | 0.528 | B) No vs A) Yes | Hedged conclusion, agreeing caveats |
| P020 | 0.1357 | 0.558 | A) Yes vs B) No | Hedged conclusion, agreeing caveats |
| P024 | **0.5969** | 0.597 | A) Yes vs B) No | Hedged conclusion — **0.003 under threshold** |
| P027 | 0.0144 | **0.000** | A) Yes vs (none) | Extraction misfire |

**P019 / P020 / P024 — hedged conclusions whose caveats agree.** All three come from the
same starch-and-hyperglycemia debate. Their extracted conclusions read
*"**Revised Solution: A) Yes**, with the caveat that the toxicological effects … vary
significantly depending on individual factors"* against *"**Revised Solution: B) No**, with
the caveat that a wheelbarrow full of starch is unlikely to be consumed in reality"*. The
opposing letters are real, but each is followed by a long qualification, and the
qualifications largely **agree with one another**. NLI weighs the whole sentence, so
agreement in the caveat dilutes contradiction in the claim. P024 lands at 0.5969 — it
misses the 0.6 threshold by 0.003, which is a warning against reading these four as
uniformly hard cases.

**P027 — extraction misfire.** The positional rule selected *"I believe the answer is
A) Yes, but I need more confirmation."* (carries the marker, names no subject) against
*"We need to consider the context and accuracy of sales data. I'm not convinced that Kelly
Clarkson has outsold Carrie Underwood."* (names the subject, carries no marker). Semantic
similarity collapses to **0.000**, which additionally trips the relevance gate. This is a
failure of the extraction rule, not of NLI — and it is the failure mode most likely to
dominate on corpora without a mandated answer marker.

One near-miss in the other direction: **P023 passed at similarity 0.411**, barely above
the 0.40 relevance floor. Small changes to that floor would flip it.

## 7. Why the internal benchmark did not catch this

The two datasets differ by more than an order of magnitude in the property that matters.

| | Internal `v1.0_multiagent.json` | External DEBATE (labelled positives) |
| :--- | ---: | ---: |
| Cases | 22 (12 positive) | 40 (10 positive) |
| Agent output length | **median 10 words / 60 chars** | **median 424 / 539 tokens; 2,091 / 2,607 chars** |
| Longest output | 15 words / 104 chars | 709 tokens |
| Form | Near-minimal assertion pairs | Natural multi-paragraph discourse |
| Authorship | Self-authored for this project | Produced by real debating agents |

Representative internal case (`ma_03`):

```
A: "The customer's account is currently active and in good standing."
B: "The customer's account has been suspended and is not in good standing."
```

That is an SNLI/MNLI-style minimal pair: one sentence frame, one negated proposition —
precisely the distribution `cross-encoder/nli-deberta-v3-small` was trained on. The
internal benchmark handed the detector **pre-extracted claims**, so the absence of a
claim-extraction stage was invisible. Every case in that benchmark silently supplied what
§5.3 shows the detector actually needs.

The external corpus supplies the opposite: hedged, self-referential, multi-paragraph turns
in which the asserted claim occupies a small fraction of the text. Median extracted
conclusion length here is 179 / 136 characters against 2,091 / 2,607 characters of source
— **5–9% of the text carries the claim**, the rest being shared framing, procedural
commentary and qualification.

**This does not mean F1 0.960 was miscomputed.** It means the quantity measured was the
detector's accuracy on inputs shaped like its model's training data, and that quantity does
not transfer to real agent traces.

## 8. A verdict this experiment got wrong, and the correction

The first run of `disagreement_formulation_diagnosis.py` printed and saved:

> `VERDICT: NLI IS THE WRONG INSTRUMENT HERE. Neither direction nor claim extraction
> recovers recall…`

**That verdict was wrong, and it was a defect in this experiment's own branching logic**,
not a finding. The classifier inspected only the forward `conclusion` condition (recall
0.40) and never evaluated `conclusion_reversed` (recall 0.60), so it fell through to the
terminal branch. The logic now selects the best extraction variant explicitly, and the
comment at that site records why.

**The measured data did not change.** All four conditions produce byte-identical
per-case scores across both runs; only the derived verdict string differs. The corrected
verdict reads:

> `CLAIM EXTRACTION IS THE DOMINANT FACTOR, PARTIALLY. Best variant 'conclusion_reversed'
> lifts recall 0.00 -> 0.60 at 0% false positives … Not a full fix: misses remain on hedged
> conclusions whose caveats agree.`

It is recorded here rather than quietly amended because an automated verdict that
overstates a negative result is the same class of error this project has repeatedly caught
in its own reports — see `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §3, where a claim that the
centroid detector "never fired" came from reading a post-convergence field instead of the
peak.

## 9. What conclusion extraction is **not**

**It is not a production fix, and must not be described as one.** It is a
**hypothesis-supported experimental formulation** that requires external generalisation
testing before any of it reaches `disagreement.py`.

Concretely, the following are unestablished:

- **The extraction rule depends on this corpus's mandated answer marker.** Every DEBATE
  config instructs agents to emit `A) Yes` or `B) No`. Real agent traces carry no such
  marker, and P027 already shows the rule degrading when the marker and the subject matter
  land in different sentences. Recall 0.60 is plausibly **optimistic** for corpora without
  it.
- **n = 10 positives, 30 negatives, one annotator, no κ.** A 0.60 recall on ten cases has a
  95% Wilson interval of **[0.313, 0.832]** — consistent with anything from "barely better
  than the 0.00 baseline" to "usable". "0.0% false positives" on thirty negatives has a 95%
  Wilson upper bound of **11.4%** (the rule of three gives 10%); it does not mean the true
  false-positive rate is zero.
- **Reversing orientation is not free.** The production path evaluates each pair once;
  scoring both directions doubles NLI cost, already the dominant term at 1.40 pairs/sec.
- **No threshold was tuned, and none should be inferred.** P024 at 0.5969 makes the 0.6
  boundary look arbitrary on this data, but adjusting it against 40 cases would repeat the
  overfitting this whole line of work exists to avoid.

## 10. Limitations

- **Diagnostic, not a benchmark.** No accuracy claim in this report is a benchmark result.
  The 370-row external benchmark (sized by `experiments/disagreement_power_analysis.py`)
  has deliberately **not** been run.
- **Single-annotator labels, no inter-judge agreement.** See §3.
- **One corpus, one task family.** All 145 DEBATE configs pose binary A/B questions.
  Whether these findings hold for open-ended multi-agent tasks is untested.
- **No tool-using traces.** DEBATE is pure text debate; the disagreement engine's behaviour
  on traces with tool calls and results remains unmeasured.
- **Natural prevalence is very low.** Genuine contradiction occurs in approximately
  **0.53%** of agent pairs (95% CI [0.300%, 0.806%]), so a balanced sample is ~94×
  enriched. Any precision figure quoted at enriched prevalence would badly flatter the
  detector.
- **CPU / PyTorch fallback.** ONNX Runtime failed to load (`_attention_scale` import error
  against the installed torch), so all timings reflect the PyTorch path. Scores are
  unaffected; throughput figures are not representative of an ONNX deployment.

## 11. What the positioning claim must say now

Under the standing rule that no capability is called a differentiator until it survives an
external-data audit **or** carries a documented limitation, the disagreement claim now
carries this limitation:

> The inter-agent disagreement engine's reported F1 0.960 was measured on 22 self-authored
> near-minimal contradiction pairs (median 10 words per agent output). On an external
> corpus of real multi-agent debate (`Multi-Agent-LLMs/DEBATE`), the shipped configuration
> detects **0 of 10** independently labelled contradictions. Diagnosis attributes this to a
> missing claim-extraction stage rather than to the NLI model: supplying each agent's
> concluding assertion instead of its full turn recovers 6 of 10 at zero false positives on
> 30 negatives. That formulation is experimental and unvalidated outside this corpus.

`COMPETITIVE_POSITIONING.md` §9 and `MLFLOW_CAPABILITY_AUDIT.md` §9 both currently describe
the disagreement capability with the weaker caveat "never externally validated". That is now
superseded by a measured result and should be updated — **not done in this change**, per
the instruction to leave positioning edits out of the diagnosis.

## 12. Next research steps, in order

1. **Generalisation test for claim extraction.** Apply the formulation to a corpus without
   a mandated answer marker before treating 0.60 as real. This is the single largest
   threat to the §5.5 result.
2. **Two-judge labelling on a larger sample.** Qwen3-8B GGUF as an independent second pass,
   κ reported, unresolved disagreements excluded rather than tiebroken.
3. **The 370-row external benchmark** on the shipped configuration, to put a proper
   confidence interval on the 0.00 rather than resting on n=10.
4. Only then: consider whether a claim-extraction stage belongs in `disagreement.py`.

---

**Files added by this work:** four experiment scripts and five JSON artifacts, listed in
the header. **Files modified:** `experiments/disagreement_feasibility_probe.py` gained
retry-with-backoff on the datasets-server fetch after a transient 502 aborted a run; the
seed and sampling logic are unchanged, so all 40 probe cases remain reproducible.
**Production files modified: none.**
