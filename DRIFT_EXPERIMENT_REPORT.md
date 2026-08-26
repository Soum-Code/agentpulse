# Drift Experiment and Sensitivity Evaluation

**Date:** 2026-08-23 12:52:04 UTC. **Corrected:** 2026-08-27 — see §4.
**Method:** Graded drift magnitudes and negative controls. Script: `experiments/drift_scenarios.py`.
**Data source:** `experiments/results/drift_experiment_results.json`.
**Detection rule:** a scenario counts as detected when, on a shifted span, either
`centroid_distance >= 0.30` **or** `stability_index < 70`. Both conditions matter — see §3.
**Baseline window:** 20 spans.

## 1. Graded drift and negative control results

Two distinct quantities are reported, and conflating them is what produced the errors
corrected in §4:

- **Shift level** — the *configured* magnitude of each synthetic scenario (`shift_level`
  in the results JSON). It is a scenario parameter, not a measurement.
- **Centroid distance** — the *measured* cosine distance from the agent's baseline
  centroid at the end of the run (`final_centroid_dist`). This is the quantity the 0.30
  threshold applies to.

| Scenario | Type | Shift level | Centroid distance (measured) | Is anomaly | Detected | False alert | Time to detect | Final ASI |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Prompt Formatting Change (10% shift) | prompt_drift | 0.10 | 0.001 | No | No | No | N/A | 100.0/100 |
| Prompt Tone Shift (25% shift) | prompt_drift | 0.25 | 0.007 | No | No | No | N/A | 99.7/100 |
| Prompt Template Rewrite (50% shift) | prompt_drift | 0.50 | 0.042 | **Yes** | **No** | No | N/A | 98.5/100 |
| Model Version Update (Qwen-7B to Llama-8B) | model_drift | 0.50 | 0.042 | **Yes** | **No** | No | N/A | 98.5/100 |
| Temperature Shift (T=0.1 to T=0.9) | hyperparam_drift | 0.35 | 0.017 | **Yes** | **No** | No | N/A | 99.4/100 |
| Tool Frequency Fluctuation (25% delta) | tool_entropy | 0.25 | 0.007 | No | No | No | N/A | 99.7/100 |
| Uncalibrated External Tool Shift (60% delta) | tool_entropy | 0.60 | 0.064 | Yes | Yes | No | 1 | 82.7/100 |
| Hallucination & Contradiction Burst (75% risk) | quality_regression | 0.75 | 0.099 | Yes | Yes | No | 1 | 96.5/100 |
| Negative Control: Legitimate Paraphrasing | negative_control | 0.12 | 0.001 | No | No | No | N/A | 100.0/100 |
| Negative Control: Equivalent Tool Substitution | negative_control | 0.15 | 0.002 | No | No | No | N/A | 99.9/100 |
| Negative Control: Baseline Invariant Operation | negative_control | 0.00 | 0.000 | No | No | No | N/A | 100.0/100 |

## 2. Findings

**Detection recall on anomalies is 0.400 — 2 of 5 genuine anomalies were detected.**

- **Detected (2):** the 60% tool-entropy shift and the hallucination/contradiction burst,
  both on the first shifted span (time to detect = 1).
- **Missed (3):** the 50% prompt-template rewrite, the model-version change
  (Qwen-7B → Llama-8B), and the temperature shift. All three are genuine anomalies that
  produced no alert.

**Zero false alerts across all 11 scenarios**, including the three negative controls
(legitimate rephrasing, equivalent tool substitution, invariant flow) and the three
sub-threshold shifts. On this scenario set the detector is highly conservative: it does
not cry wolf, but it misses most of what it should catch.

The two detections are not embedding-based. They came from the tool-entropy and
quality-regression signals, which is why the missed three — all of which are precisely
the *semantic output drift* the centroid signal exists to catch — is the more meaningful
result.

## 3. Why the embedding-centroid signal never fired

**No scenario's measured centroid distance came close to the 0.30 threshold.** The
maximum observed anywhere in the run was **0.099** (hallucination burst); the largest
among the missed anomalies was 0.042. The centroid condition was therefore never
satisfiable in this experiment, and **both detections came via the `stability_index < 70`
branch of the rule**, not the distance branch.

Two consequences worth stating plainly:

1. **The 0.30 centroid threshold is untested by this experiment.** Nothing here provides
   evidence for or against that value, because no scenario ever approached it. It cannot
   be described as validated.
2. **The synthetic scenarios may not produce realistic embedding shifts.** A "50% shift"
   moving the centroid only 0.042 suggests the scenario generator's perturbation
   (`experiments/drift_scenarios.py` constructs vectors directly rather than embedding
   real drifted text) does not translate its nominal shift level into comparable
   embedding-space displacement. Whether the gap is in the detector or in the scenario
   construction is **not determined by this data**, and it would be wrong to conclude
   from these results alone that the centroid detector would miss real production drift.

Note also that the final ASI for both detected scenarios (82.7 and 96.5) is *above* 70 —
detection occurred on a transient dip during the run, after which ASI recovered. A
report reading only final ASI would conclude nothing was detected.

## 4. Correction notice (2026-08-27)

An earlier version of this report contained three inaccuracies, found while cross-checking
its claims against `experiments/results/drift_experiment_results.json` for
`COMPETITIVE_POSITIONING.md`. All three are corrected above; recording them here rather
than silently overwriting, since this project's reports are meant to be auditable.

1. **§2 contradicted §1.** The prose stated: *"Shifts at 50% and above, along with the
   hallucination burst, were detected within 1-2 spans of crossing the threshold."* The
   table in the same document marked the 50% prompt rewrite and the 50% model-version
   change as `Detected: No`. The table was correct. The prose also implied a recall far
   higher than the measured 0.400.
2. **The "Magnitude" column was mislabelled.** It was described as *"cosine distance
   between the pre- and post-shift embedding centroid"*, but the values are `shift_level`
   — a configured scenario parameter. The actual measured centroid distances are roughly
   an order of magnitude smaller, and are now shown as a separate column. This
   mislabelling is what made the prose's claim look plausible: read as cosine distances,
   values of 0.50 sit above the 0.30 threshold, so "shifts at 50% and above were
   detected" appears consistent — the real distance was 0.042.
3. **The detection rule was stated incompletely.** The header gave only
   *"Drift decision threshold: 0.30 cosine distance"*, omitting the `stability_index < 70`
   condition — which is the branch that actually produced both detections.

No experimental data was changed. The underlying results JSON is untouched and was the
authority for every correction.

## 5. Limitations

- 11 synthetic scenarios, 5 of them genuine anomalies. Recall computed on 5 cases moves
  by 0.2 per case; treat 0.400 as indicative, not precise.
- Scenarios are constructed vectors, not embeddings of real drifted model output (§3.2).
- ASI is an uncalibrated composite heuristic — `drift.py`'s own docstring states it "is
  NOT a scientifically validated ground-truth metric," and `AUDIT_HISTORY.md` classifies
  it `EXPERIMENTAL`. The detection rule depends on it.
- Single baseline window (20 spans) and a single threshold pair; no sweep was run.
