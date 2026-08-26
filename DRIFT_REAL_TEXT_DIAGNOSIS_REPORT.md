# Drift Diagnosis on Real Agent Text

**Date:** 2026-08-27
**Script:** `experiments/drift_real_text_diagnosis.py`
**Raw results:** `experiments/results/drift_real_text_diagnosis.json`
**Data class:** `EXTERNAL_REAL_DATA` — see §4
**Detector:** `backend/app/services/drift.py` `DriftDetector`, **unmodified**
**Embedding path:** `all-MiniLM-L6-v2` via `get_embedding()` — the production path

---

## 1. Research question

`DRIFT_EXPERIMENT_REPORT.md` established that the embedding-centroid drift signal
detected 2 of 5 labelled anomalies, and that no scenario's measured centroid distance
exceeded 0.099 against a 0.30 threshold. What it could **not** establish is why, because
that experiment never embedded any text — `experiments/drift_scenarios.py` constructs
embedding vectors arithmetically (`vec[1] = shift_level`).

Two hypotheses were open:

- **A — benchmark problem.** Real semantic change moves the embedding far enough; the
  synthetic scenarios simply never did.
- **B — detector/threshold problem.** Real semantic change also stays far below 0.30.

This report answers that question with measured evidence on real agent output.

**The answer is neither cleanly. It is C — both, and the benchmark's failure was
concealing the detector's.**

## 2. Existing failure this addresses

The synthetic experiment is inconclusive by construction:

- Peak centroid distance is a deterministic function of the scenario's `shift_level`,
  verified analytically: `d = 1 − (1−s)/√((1−s)² + s²)`. A "50% shift" yields exactly
  0.2929 — **0.0071 below** the 0.30 threshold. The anomaly labels and the threshold were
  set independently of each other.
- Because nothing was embedded, the experiment measured the geometry of hand-built
  vectors, not the behaviour of the embedding model on agent text.

## 3. Correction to a previous claim in this repository

`DRIFT_EXPERIMENT_REPORT.md` §3 (added 2026-08-26) states that *"the embedding-centroid
detector never fired at all"* and that both detections came via the `stability_index`
branch. **That is wrong**, and this report supersedes it.

The error: the results JSON stores `final_centroid_dist` — the distance at the last step,
after the EMA centroid has converged toward the shifted data and the distance has decayed.
Instrumented per-step replay of the same scenarios shows peak distances of **0.4453** and
**0.6838** for the two detected anomalies, both crossing 0.30 via the **centroid** branch.
Under the production ASI threshold (50.0, not the experiment's hardcoded 70.0) the ASI
branch fires for nothing at all.

This is the same class of mistake the original report contained — reading a summary column
as though it were the operative quantity. `DRIFT_EXPERIMENT_REPORT.md` §3 should be
corrected; it has not been edited by this work.

## 4. Data source

**External corpus, independently collected — not authored for AgentPulse.**

| | |
| :--- | :--- |
| Dataset | [`Exgentic/agent-llm-traces-v2`](https://huggingface.co/datasets/Exgentic/agent-llm-traces-v2) |
| Revision | `4b8ad4ab198438e5a170f9171c19c6a2cf7c1814` |
| Retrieved | 2026-08-27 |
| Corpus size | 10,056 sessions across 115 run configurations, 6 benchmarks, 5 harnesses, 5 models |
| Subset used | `browsecompplus` / `smolagents_code` — 500 sessions, 200 tasks, 5 models |
| Ingestion | `experiments/external_exgentic_ingest.py` |
| Provenance | `datasets/external/exgentic_v2/source_metadata.json`, `raw/manifest.json` |

**Why this corpus answers the question:** task prompts are **byte-identical across
models**. That gives a controlled single-variable change over real text — same task, same
harness, same benchmark, different model.

**Why this specific cell.** Assistant prose availability is strongly harness- and
model-dependent. In `browsecompplus/tool_calling`, `claude-opus-4-5` produces prose in
**0 of 100** sessions and `gpt-5.2` in **1 of 100** — both emit only `tool_call` parts. A
text-based extraction there silently drops two of five models and would measure *narration
style* as if it were semantic drift. `browsecompplus/smolagents_code` is the one surveyed
cell where all five models produce prose in **100 of 100** sessions. The cell was selected
on that measurement, not on convenience.

**No labels.** This corpus carries no drift annotations. Condition membership below is
*structural* — which model emitted the text — and is **not** a judgement that any output
drifted. Consequently this report presents **distributions, not precision/recall/F1**:
there is nothing here to be right or wrong about.

## 5. Method

Both conditions are fed through the unmodified production detector
(`window_size=20, min_samples_for_alert=5`, matching `drift_scenarios.py` so the two
experiments are comparable).

| Condition | Construction | n |
| :--- | :--- | ---: |
| **shift** | Baseline centroid from model A's outputs on task T; measure model B's outputs on the **same** task T. Both directions, since the EMA update makes order matter. | **800** |
| **no_shift** | Within one session, the agent's own ordered outputs split in half: first half builds the centroid, second half is measured. Same model, same task, same session. | **484** |

**Peak** centroid distance and **minimum** stability index over the measured phase are
recorded — never the final value, per §3.

8,068 real agent outputs were embedded.

## 6. Results

| Condition | n | min | p25 | median | mean | p75 | p95 | max | **≥ 0.30** |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| shift | 800 | 0.1567 | 0.3746 | **0.4618** | 0.4600 | 0.5360 | 0.6626 | 0.9242 | **721 (90.1%)** |
| no_shift | 484 | 0.1134 | 0.3996 | **0.4817** | 0.4881 | 0.5770 | 0.7121 | 0.9689 | **444 (91.7%)** |

**ASI branch (threshold < 50): fired 0/800 and 0/484.** Minimum ASI observed anywhere was
60.1. Consistent with §3 — under production configuration the ASI branch is inert.

### 6.1 The two distributions do not separate

The no-shift control's median (**0.4817**) is **higher** than the model-shift condition's
(**0.4618**). The distributions overlap across their entire range. On this data the
centroid distance carries **no discriminative signal** between "a different model produced
this" and "the same model continued its own run".

### 6.2 Why: the threshold sits inside normal operating variance

A supporting measurement on 40 sessions (598 consecutive output pairs):

| Measurement | median | mean | ≥ 0.30 |
| :--- | ---: | ---: | ---: |
| Consecutive outputs, same session — one normal agent step | **0.2565** | 0.2798 | 235/598 (39.3%) |
| Each output vs. its own session mean | 0.1749 | 0.1888 | 67/638 (10.5%) |

A multi-step agent legitimately says different things at each step — it searches, then
reasons, then concludes. The median distance between two *consecutive normal steps* is
**0.2565**, immediately below the 0.30 threshold, and **39% of individual normal steps
already exceed it**.

The full-run figures in §6 are higher still (0.46–0.48) because the detector's EMA update
(`ema_alpha = 0.05`) moves the centroid very slowly, so later outputs are compared against
a centroid still dominated by the earliest ones — and because the peak over a whole run is
taken.

## 7. Interpretation

Supported by the evidence:

1. **The synthetic benchmark was inadequate.** It never moved the embedding (max 0.099,
   analytically bounded by `shift_level`). Hypothesis A holds for the benchmark.
2. **The detector does not discriminate on real text.** Model-shift and no-shift produce
   statistically indistinguishable distance distributions, with the control marginally
   higher. Hypothesis B holds for the detector — but not in the form anticipated.
3. **The threshold is not merely mis-set; the signal is mismatched to the workload.**
   0.30 is not "too high" — on real agent text it is *too low*, sitting inside normal
   step-to-step variance and firing on ~92% of unchanged operation. But lowering or
   raising it cannot help, because the two conditions overlap completely. No threshold on
   this metric separates them.
4. **The benchmark's failure concealed the detector's.** The synthetic scenarios made the
   detector look under-sensitive (never reaching 0.30). Real data shows it would be
   over-sensitive *and* uninformative. Fixing only the benchmark would have produced a
   detector that fires constantly in production.

Not supported, and explicitly not claimed: that the centroid approach cannot work for
drift detection in general. What is shown is that **this** construction — per-output
distance to a slowly-updating EMA centroid of prior outputs *within* a multi-step agent
run — measures normal intra-run variety far more than it measures drift.

## 8. Limitations

- **Cross-model difference is not drift.** Two models can both be correct and still differ.
  This measures sensitivity to a known change, not accuracy at detecting harmful drift.
  Nothing here labels any output as degraded.
- **The no-shift control is imperfect.** Splitting one session in half means the second
  half legitimately covers different content (exploring vs. concluding), so part of its
  distance is real content change. The stronger control — same model, same task, repeated
  run — does not exist in this corpus (zero same-model duplicates within a task group).
  This limitation weakens the "control is higher than shift" observation specifically; it
  does not weaken the finding that both sit far above 0.30.
- **One benchmark, one harness.** `browsecompplus/smolagents_code` was selected on prose
  coverage and is not representative; `tool_calling` demonstrably behaves differently.
- **Only 4 of 10 model pairs exist.** The corpus ran two disjoint model clusters
  (`{DeepSeek, Kimi}` and `{claude-opus, gemini, gpt-5.2}`) over two disjoint task halves,
  so no task is covered by all five models and cross-cluster comparison is impossible.
- **Structured output.** `smolagents_code` outputs are `{"thought": …}` JSON. MiniLM was
  not selected for structured text; behaviour on prose-only agents may differ.
- **Single embedding model.** All conclusions are specific to `all-MiniLM-L6-v2`.
- **No dev/held-out split was consumed.** A deterministic task split (89 dev / 111
  held-out) exists in the ingestion output and was left untouched, since no tuning was
  performed. It remains clean for any future calibration.

## 9. Next research step

Only what this result supports:

1. **Correct `DRIFT_EXPERIMENT_REPORT.md` §3** — its "centroid never fired" claim is
   refuted by §3 of this report.
2. **Do not tune the 0.30 threshold.** No threshold on this metric separates the
   conditions; recalibrating would be fitting noise.
3. **The open question is now representational, not parametric.** The candidate
   reformulations, in order of how directly this data supports them:
   - Compare **across runs** (this run's centroid vs. a stored baseline run's centroid)
     rather than *within* a run. The measurement here shows intra-run variety dominates,
     which a cross-run comparison would factor out.
   - Compare **like against like** — same step index, or same task — rather than pooling a
     whole run into one centroid.
   Both are hypotheses. Neither is supported yet, and each needs its own controlled test
   before any production change.
4. **A same-model repeated-run corpus is the missing control.** Until one exists, the
   no-shift floor cannot be measured cleanly.

No production drift code was modified by this work. Test suite unchanged at 121/121.

---

## 10. Follow-up: the two hypotheses tested (2026-08-27)

§9 named two reformulations and labelled both untested. They were then tested against the
current metric on identical data and identical embeddings, so any difference is
attributable to the representation alone.

**Script:** `experiments/drift_representation_test.py`
**Results:** `experiments/results/drift_representation_test.json`

### 10.1 The missing positive control

The first version of this follow-up compared only `shift` against `no_shift`, and no
metric separated them. That result was **uninterpretable**: it is equally consistent with
"the metric is blind" and with "neither condition is a real semantic change".

A positive control was added — **same model, different task** — a difference known to
exist, since different tasks are different subject matter. It is an upper bound, not an
operational estimate: real production drift is subtler than swapping the task entirely.

### 10.2 Results

Median pooled distance by condition, and separation from normal operation:

| Metric | no_shift | model shift | content change | AUC (shift) | **AUC (content)** | det @0.30 | **FA @0.30** |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ema_within_run` (shipped) | 0.4816 | 0.4618 | 0.6374 | 0.4393 | 0.7917 | 0.999 | **0.917** |
| `pooled_session` (H1) | 0.1326 | 0.1402 | 0.4254 | 0.5379 | **0.9532** | 0.825 | **0.068** |
| `stepwise_aligned` (H2) | 0.3636 | 0.3574 | 0.5796 | 0.5013 | 0.8891 | 0.984 | 0.696 |

### 10.3 What this establishes

**1. Hypothesis 1 is validated. Hypothesis 2 is rejected.**
Pooling a run into one vector before comparing gives **AUC 0.9532** against real content
change. Step-aligned comparison reaches 0.8891 but still false-alarms on 69.6% of normal
operation — not viable. The shipped within-run EMA construction is the worst of the three:
it detects 99.9% of real change while also firing on **91.7% of unchanged operation**,
which is indistinguishable from always alerting.

**2. The 0.30 threshold was never the problem.** With the pooled representation it is
close to optimal — the best fitted cut point is 0.27 (88.5% balanced accuracy) against
0.30's 82.5% detection / 6.8% false alarms. §7 concluded the threshold "is not merely
mis-set", and that stands, but the reason is now sharper: **the aggregation was wrong, not
the threshold and not the underlying signal.** Embedding cosine distance is a perfectly
serviceable drift signal; comparing each individual output against a slowly-updating EMA
centroid *within* one run is what destroyed it.

**3. Model swap is not detectable by any of the three, and that is not a detector
failure.** Every metric scores near chance on `shift` (AUC 0.44–0.54) while the same
metrics score 0.79–0.95 on `content_change`. Two competent models solving an identical
task produce genuinely similar content — pooled distance 0.1402 against normal
operation's 0.1326. §7's framing of `shift` as "a controlled change the detector should
catch" was too strong: it is a controlled change, but not a semantic one.

### 10.4 Architectural implication

The validated metric compares one completed run's pooled vector against another's. The
shipped detector is per-span and streaming — it never holds a completed run. Adopting the
pooled representation therefore means run-level aggregation and a stored baseline run to
compare against, which is a structural change to `DriftDetector`, not a parameter change.
That work is **not** attempted here; this report establishes the evidence for it.

### 10.5 Limitations specific to this follow-up

- `content_change` (different task) is an **upper bound** on detectability. It says nothing
  about gradual degradation, prompt-template edits, or quality regression — the drift
  types operators actually care about.
- The 0.27 "best" threshold is **fitted to this data** and is not a recommendation. The
  deterministic 89/111 dev/held-out task split from ingestion remains unconsumed and would
  be the honest basis for any calibration.
- Still one benchmark, one harness, one embedding model.
- The `no_shift` control remains imperfect for the reason given in §8.
