# Does Conclusion Extraction Generalize? An External Test

**Date:** 2026-08-27
**Script:** `experiments/disagreement_extraction_generalization.py`
**Raw results:** `experiments/results/extraction_generalization_{blinded,key,labels,results}.json`
**Data class:** `EXTERNAL_REAL_DATA` — see §3
**Detector:** `backend/app/services/disagreement.py`, **unmodified**
**Extractor:** `conclusion_only`, imported **unmodified** from
`experiments/disagreement_formulation_diagnosis.py`
**Production code changed by this work:** none. No evaluator wiring, no dashboard.

---

## 1. Research question

`DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md` §5.5 found that supplying each agent's
concluding assertion instead of its full turn lifted recall from 0.00 to 0.60 at 0% false
positives on the DEBATE corpus. §9 of that report flagged the obvious threat to the result:

> The extraction rule depends on this corpus's mandated answer marker. Every DEBATE config
> instructs agents to emit `A) Yes` or `B) No`. Real agent traces carry no such marker …
> Recall 0.60 is plausibly **optimistic** for corpora without it.

This report tests that threat directly. The question is narrow:

> Is conclusion extraction a general solution, or a DEBATE-format-specific artifact?

The answer is **the latter**, and §4 is careful about what that does and does not prove.

## 2. The result being tested (DEBATE, for reference)

From `DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md` §5.5, on 10 labelled contradictions and
30 labelled negatives:

| condition | recall | FP rate | mean P(contra) |
| :--- | ---: | ---: | ---: |
| `forward` (production formulation) | 0.00 | 0.0% | 0.0070 |
| `reversed` | 0.00 | 3.3% | 0.0298 |
| `conclusion` | 0.40 | 10.0% | 0.4288 |
| **`conclusion + reversed`** | **0.60** | **0.0%** | **0.6276** |

That is the claim under test.

## 3. External corpus

`siddharthmb/multiagent-verification-failure-modes` (CC-BY-NC-4.0), shard
`episodes/exp1/shard_0000.jsonl`. A Qwen3-32B "verifier" directs four Qwen3-8B
evidence-holding "subagents" over claims from the AVeriTeC fact-checking benchmark.

Selected because it satisfies what DEBATE could not:

| Requirement | DEBATE | This corpus |
| :--- | :--- | :--- |
| Distinct agent identities | ✅ | ✅ subagents 1–4 |
| Shared task context | ✅ | ✅ one claim per episode |
| Multiple agent outputs | ✅ | ✅ up to 4 per episode |
| Tool / retrieval structure | ❌ none | ✅ `hits` with source URLs |
| **Mandated answer marker** | **✅ `A) Yes / B) No`** | **❌ none — free prose** |
| Disagreement source | binary answer flip | differing evidence partitions |

The last row matters for validity. A corpus that *assigns* agents opposing roles would
guarantee positives by construction and prove nothing about detection. Here, disagreement
arises because subagents hold different quarters of the evidence.

**Yield:** 201 episodes → 424 cross-agent pairs, of which 211 have `holds_gold` asymmetry.
That asymmetry is used **only as a sampling signal**, never as a label — the same discipline
applied to DEBATE's `solution` field, and for the same reason
(`LABEL_AGREEMENT_REPORT.md`-style circularity is what invalidated earlier work here).

**Sample:** 40 pairs — 20 from the gold-asymmetric stratum, 20 natural-prevalence controls,
shuffled.

**Labels:** 8 CONTRADICTION, 32 NO_CONTRADICTION, assigned blind from the claim, the two
questions and the two answers. `holds_gold`, the sampling stratum, the extracted spans and
all detector output were unseen at labelling time.

> **Label limitation.** Single blind pass, one annotator, **no second judge and therefore no
> Cohen's κ**. Adequate for a go/no-go generalization test; **not** benchmark ground truth.

## 4. Extraction results

The rule was applied to all 80 agent outputs unchanged.

| Measure | Result |
| :--- | ---: |
| **Success rate** — returned a non-empty span shorter than the input | **100.0%** (80/80) |
| **Correctness rate** — span carries the assertion the annotator marked | **31.2%** (25/80) |
| 95% Wilson CI on correctness | **[22.2%, 42.1%]** |

The rule always *fires* and is **wrong more than two-thirds of the time**. Success and
correctness are reported separately precisely because the first looks like health and is
not.

### 4.1 Why: the assertion is at the wrong end

Measuring where each annotated assertion sits within its answer:

| Position in answer | Share of outputs |
| :--- | ---: |
| **First third** | **68%** (54/80) |
| Middle | 4% (3/80) |
| Last third | 29% (23/80) |
| *Median relative position* | **0.00** |

These agents state their conclusion **first** and spend the remainder on supporting detail
and caveats — *"Yes, in excerpt [1], Nancy Pelosi explicitly states: 'China would prefer Joe
Biden' …"*. The extraction rule, finding no answer marker, falls back to the **last two
sentences**. It is structurally reading the wrong end of the text for roughly two-thirds of
outputs.

What it lands on instead, taken verbatim from the failures on labelled contradictions:

```
G008a  extractor:  "The references point to RIA Novosti and Photo Researchers Inc. as sources."
       assertion:  "These sources collectively indicate that photographs of his remains exist…"

G030b  extractor:  "No other excerpts confirm or clarify this claim. Source: [1] http://transcripts.cnn.com/…"
       assertion:  "Yes, in the first excerpt, Nancy Pelosi directly states: 'China would prefer Joe Biden'…"

G034a  extractor:  "- Pelosi's interactions with China or Biden (Sources 1, 5, 8, 10), but none directly link her…"
       assertion:  "None of the provided excerpts include Nancy Pelosi explicitly stating that China would prefer Joe Biden."
```

Citations, residual caveats, and in one case a bare URL.

### 4.2 Why the DEBATE result does not generalize

DEBATE's `A) Yes / B) No` marker is **terminal by construction** — every one of its 145
configs instructs agents to close with it. The extraction rule keys on that marker, so on
DEBATE it located the assertion nearly every time. The 0.60 recall in §2 was therefore
measured under a condition the corpus guarantees and real traces do not.

Remove the marker and the rule has no signal to key on. Its fallback encodes an assumption —
*conclusions come last* — that is **false for 68% of outputs** in this corpus.

## 5. Detection results on the external corpus

8 labelled contradictions, 32 labelled negatives, threshold 0.6, relevance floor 0.40, all
unchanged.

| condition | recall | 95% CI | TP | FN | FP | FP rate | mean P(contra) |
| :--- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| `forward` | 0.12 (1/8) | [0.02, 0.47] | 1 | 7 | 2 | 6.2% | 0.1008 |
| `conclusion` | 0.25 (2/8) | [0.07, 0.59] | 2 | 6 | 3 | 9.4% | 0.2519 |
| `conclusion + reversed` | 0.25 (2/8) | [0.07, 0.59] | 2 | 6 | 4 | **12.5%** | 0.2501 |

**The confidence intervals overlap almost entirely.** `forward` [0.02, 0.47] and
`conclusion` [0.07, 0.59] are not distinguishable at n = 8. The apparent improvement from
0.12 to 0.25 is **one case**.

Side by side with DEBATE, the contrast is the whole finding:

| | DEBATE | External corpus |
| :--- | ---: | ---: |
| recall, production formulation | 0.00 | 0.12 |
| recall, conclusion + reversed | **0.60** | **0.25** |
| false-positive rate, conclusion + reversed | **0.0%** | **12.5%** |
| mean P(contradiction) on positives | 0.6276 | 0.2501 |

On DEBATE the extraction lifted recall sixfold *and drove false positives to zero*. Here it
moves recall by one case *and doubles false positives*. The direction of the false-positive
effect is reversed.

## 6. What this failure does and does not prove

**It does prove:** the specific positional rule in
`experiments/disagreement_formulation_diagnosis.py` is format-dependent, and the 0.60 recall
figure cannot be carried forward as evidence of general capability.

**It does not prove that claim extraction is impossible.** The rule failed for an
identifiable and unsurprising reason — it looks in the wrong place when the mandated marker
is absent. A rule keyed on the *first* sentence would obviously score better on this corpus.

**That rule was deliberately not written.** Two reasons:

1. Writing it now would be tuning the extractor against the corpus used to evaluate it,
   which is the circularity this project has repeatedly caught in its own work.
2. More importantly it would not fix anything. A first-sentence rule would fail on DEBATE
   exactly as the last-sentence rule fails here. Swapping one positional assumption for
   another relocates the brittleness rather than removing it.

The honest position is that **no format-independent extraction method is currently in
hand**, and none is invented here. Whether a genuinely general method exists — semantic
rather than positional — is open.

## 7. Evidence-partition relativity: a problem contradiction detection does not address

Labelling surfaced a property of real multi-agent systems that neither the DEBATE work nor
the internal benchmark could reveal, because neither had distributed evidence.

Each subagent holds a **different quarter of the retrieved documents**. So this exchange:

```
subagent_1: "Your documents do not include a direct quote from Mike Pence stating that the
             FBI spied on Trump and his campaign during Biden's vice presidency."
subagent_2: "Your documents include a statement by Mike Pence (Excerpt [1]) claiming the FBI
             'spied on President Trump and my campaign' during Joe Biden's vice presidency."
```

reads as a flat contradiction and **is not one**. Both agents are correct about their own
partition. Six of the 40 labelled cases are of this form (G004, G005, G014, G021, G027,
G032), recorded in the labels file under `borderline_negatives`.

The distinction that actually matters operationally:

| | Two agents assert | Correct interpretation |
| :--- | :--- | :--- |
| **True contradiction** | incompatible claims about the **world** | a real fault — one agent is wrong |
| **Partition relativity** | different claims about **their own evidence** | expected behaviour — not a fault |

Only claims about the world, or about the **same named source**, can genuinely conflict.
Case G039 is the clean example of a real one: both agents discuss source `[3]` and disagree
about what it contains — one says it attributes the quote to Pelosi, the other says it
concerns an impeachment inquiry. That cannot be explained by partitioning.

**An NLI contradiction score cannot make this distinction.** It compares two strings; it has
no representation of which evidence each agent held. A detector that flags partition-relative
reports as contradictions will generate false alarms that grow with the degree of context
distribution — that is, precisely in the large multi-agent systems AgentPulse targets.

This is a design constraint, not a tuning problem, and it is independent of NLI quality or
of any extraction method. It is recorded here as the more substantive research finding of
this work.

## 8. Limitations

- **Diagnostic, not a benchmark.** No accuracy figure here is a benchmark result. The
  370-row external benchmark has deliberately **not** been run.
- **n = 8 positives.** All detection CIs are wide, as §5 states explicitly. This test was
  designed to answer a go/no-go question about extraction, and the extraction measurement
  (n = 80 outputs) is the better-powered half.
- **Single annotator, no κ.** See §3.
- **One shard, one task family.** 201 of 4,800 episodes; all claims in this shard carry
  `gold_label = Supported`. Behaviour on refuted claims is untested.
- **Non-commercial licence.** CC-BY-NC-4.0 permits this research use; it does not permit
  redistribution in a commercial product.
- **CPU / PyTorch fallback.** ONNX Runtime failed to load against the installed torch; scores
  are unaffected.

## 9. Conclusion

**The current disagreement formulation is not externally validated as a general-purpose
real-world disagreement detector.**

Concretely, and in order:

1. The internal benchmark reports F1 **0.960** on 22 self-authored near-minimal pairs.
2. On the external DEBATE corpus, the **shipped** configuration detects **0 of 10**
   independently labelled contradictions.
3. Conclusion extraction recovers **6 of 10 at 0% false positives** on DEBATE.
4. On an independent, marker-free corpus that extraction achieves **31.2% assertion
   correctness**, moves recall by **one case** within overlapping confidence intervals, and
   **doubles** the false-positive rate.
5. Separately, real multi-agent systems with distributed evidence produce apparent
   contradictions that are not faults, and contradiction detection alone cannot tell the two
   apart.

No replacement extraction method is proposed, and no threshold was tuned. `disagreement.py`
remains unchanged. The correct next research question is **not** "how do we extract claims
better" but **"how do we distinguish true contradiction from legitimate disagreement caused
by partial evidence"** — until that has an answer, improving extraction optimises the wrong
objective.

`COMPETITIVE_POSITIONING.md` §3 and §5.2 are updated in the same change to describe
inter-agent disagreement as a promising but externally unvalidated research capability
rather than a validated differentiator.

---

**Artifacts preserved:** `extraction_generalization_blinded.json` (the 40 blinded cases),
`extraction_generalization_key.json` (strata and provenance), `extraction_generalization_labels.json`
(labels, rationale for all 8 positives, and the six partition-relative borderline negatives),
`extraction_generalization_results.json` (per-case extraction and detection output).
**Production files modified: none.**
