"""Alarm-rate pilot: how often does the disagreement detector fire on DEBATE?

Sizes the external benchmark. The power analysis showed the benchmark's cost is
driven by how many ALARMS the detector produces on naturally occurring pairs --
those alarms are the sample whose hand-labelling yields production precision
directly. That count cannot be assumed, so it is measured here on ~100 rows
before committing to a corpus-wide run.

WHAT THIS IS NOT. This is not the benchmark and produces no accuracy claim.
No pair labelled here enters the benchmark as ground truth.

DESIGN NOTES

Pair eligibility is imported verbatim from the feasibility probe rather than
reimplemented, so the alarm rate measured here describes the same population the
benchmark will sample. That includes stripping MALLM's `[AGREE]`/`[DISAGREE]`
protocol tokens, which appeared in 100% of probe pairs and state the answer
outright.

Pair orientation matches production: `evaluate_trace_disagreements` uses
`itertools.combinations`, i.e. the earlier agent in trace order is the premise
and the later one the hypothesis. NLI is directional, so evaluating the reverse
orientation would measure a different detector than the one that ships.

MODEL GUARD. `compute_nli_grounding` and `compute_semantic_similarity` both
return None when their model is unavailable, and `evaluate_inter_agent_
disagreement` then returns None. A silent stub run would report a 0% alarm rate
that looks like a real finding -- PROJECT_REPORT.md section 4 documents a 9-hour
run lost to exactly that. This script asserts the models are loaded AND that a
known-contradictory probe pair produces a non-None result before processing
anything.

SECTION 2 -- sanity check on frozen probe labels. The 40 feasibility-probe pairs
already carry frozen first-pass labels, so running the detector over them gives
an early read on whether it is in a sensible operating regime at all. This is
reported separately and is explicitly NOT a benchmark result: n=10 positives,
single annotator, no second judge, no kappa.

Outputs:
- experiments/results/disagreement_alarm_rate_pilot.json
"""

# WHAT THIS FILE IS FOR
# It measures how often the disagreement detector raises an alarm ("these two agents
# contradict each other") on real multi-agent debates from the public DEBATE data set on
# Hugging Face. It reads about 100 debate rows, builds every pair of messages written by
# two different agents in the same turn, scores each pair, and prints the alarm rate with
# a 95% confidence range. From that rate it works out how many rows would be needed to
# collect 100, 150 or 200 alarms for a bigger benchmark later. At the end it runs a small
# sanity check on 40 pairs from the earlier feasibility probe, which already have labels.
# (The labels file says they come from one pass of an LLM, not from people.)
# Disagreement = two agents' outputs contradict each other, found with NLI (a model that
# says if one text follows from, contradicts, or is unrelated to another).
#
# HOW IT FITS IN
# Run by hand; it needs the internet (the Hugging Face datasets-server). It reuses fetch,
# pick_configs and extract_pairs from disagreement_feasibility_probe.py, and the detector
# in backend/app/services/disagreement.py. It reads two result files made by earlier
# steps (the probe key and the probe labels) and writes
# experiments/results/disagreement_alarm_rate_pilot.json.

from __future__ import annotations

import json
import math
import random
import sys
import time
from collections import Counter
from pathlib import Path

# backend/ holds the `app` package; the second path is the repo root. The imports below
# come after these lines on purpose, so `app` can be found. The `noqa: E402` marks tell
# the linter that this is intended.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.disagreement import (  # noqa: E402
    RELEVANCE_FLOOR,
    evaluate_inter_agent_disagreement,
)
from app.services.grounding import load_models, models_loaded  # noqa: E402

# A helper module in this same folder. The import works because Python puts the folder of
# a script that is run directly on its import path.
from disagreement_feasibility_probe import (  # noqa: E402
    DATASET_ID,
    ROWS_API,
    extract_pairs,
    fetch,
    pick_configs,
)

# Where the files live. OUT_PATH is this script's own result. KEY_PATH is the feasibility
# probe's key file (only its seed is read here). LABELS_PATH holds the probe's 40 labels.
# Both were made earlier by other steps.
RESULTS = Path(__file__).parent / "results"
OUT_PATH = RESULTS / "disagreement_alarm_rate_pilot.json"
KEY_PATH = RESULTS / "disagreement_probe_key.json"
LABELS_PATH = RESULTS / "disagreement_probe_labels.json"

# SEED makes the random sampling repeatable. THRESHOLD is the contradiction probability
# at or above which a pair raises an alarm, unless the relevance gate rules it off-topic.
# TARGET_ROWS is about how many debate rows to read. CORPUS_ROWS is how many rows exist in
# all (train split, all configs).
SEED = 20260827
THRESHOLD = 0.6            # engine default, not tuned here
TARGET_ROWS = 100
CORPUS_ROWS = 14_400       # DEBATE train rows across all configs


# Safety check before any scoring. Loads the models and stops the script (SystemExit) if
# a model is missing, or if the detector gives no answer on a pair that clearly conflicts.
def guard_models() -> None:
    """Refuse to run on stubs. A 0% alarm rate from unloaded models is
    indistinguishable from a real 0% alarm rate in the output JSON."""
    # sync=True is mandatory: the default loads in a BACKGROUND THREAD and
    # returns immediately, so scoring would start against unloaded models.
    # Matches disagreement_benchmark.py, which measures this same detector.
    load_models(sync=True)

    # Check 1: all three flags (NLI model, NLI tokenizer, embedding model) must be True.
    # models_loaded() returns a DICT of per-model flags, not a bool. `if not
    # models_loaded()` is always False because a non-empty dict is truthy --
    # the values have to be checked explicitly.
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not all(loaded.values()):
        raise SystemExit(
            f"ABORT: grounding models are not all loaded ({loaded}). A run "
            "without them would report every pair as unevaluated and look "
            "like a 0% alarm rate.")

    # Check 2: score two sentences that clearly contradict (a migration that succeeded and
    # one that failed). A result of None would mean the pipeline is not really scoring.
    probe = evaluate_inter_agent_disagreement(
        "a", "The database migration completed successfully with no errors.",
        "b", "The database migration failed and was rolled back.",
        threshold=THRESHOLD,
    )
    if probe is None:
        raise SystemExit(
            "ABORT: detector returned None on a known-contradictory probe pair. "
            "Models report loaded but the pipeline is not producing scores.")
    print(f"  model guard OK — probe pair scored "
          f"contradiction={probe.contradiction_prob:.3f} "
          f"similarity={probe.semantic_similarity} "
          f"flagged={probe.is_disagreement}")


# Wilson score interval: a 95% range for a rate k/n (k alarms out of n pairs). z=1.96 is
# the usual number for 95%. Unlike the simple formula, it still gives a useful range when
# k is 0 or very small. With n=0 nothing is known, so the range is (0, 1).
# Returns (low, high), both kept inside 0..1.
def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    # Wilson formula: the middle of the range is nudged from p toward 0.5, and `half` is half
    # the width of the range.
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


# Step 2 of the run. Picks DEBATE configs (a config is one subset of the data set), reads
# a few rows from each over the network and turns every row into message pairs.
# Out: (all pairs, number of rows read, the configs used).
def collect_pairs(rng: random.Random) -> tuple[list[dict], int, list[str]]:
    # pick_configs asks the server which configs exist and picks a spread of them with rng.
    configs = pick_configs(rng)
    # Share the row budget evenly across the configs, at least 1 row each.
    per_config = max(1, TARGET_ROWS // len(configs))
    all_pairs: list[dict] = []
    rows_seen = 0
    for config in configs:
        try:
            payload = fetch(ROWS_API, {
                "dataset": DATASET_ID, "config": config, "split": "train",
                # Offset past the feasibility probe's rows so the alarm rate is
                # measured on data the probe did not already inspect.
                "offset": 20, "length": per_config,
            })
        # fetch already retried several times. If it still fails, skip this config and carry on
        # instead of stopping the whole pilot.
        except Exception as exc:
            print(f"  [SKIP ] {config[:50]:50s} {type(exc).__name__}")
            continue
        rows = payload.get("rows", [])
        rows_seen += len(rows)
        for item in rows:
            # extract_pairs makes every pair of messages from two different agents in the same turn
            # of one debate. It removes the [AGREE]/[DISAGREE] protocol tokens first, drops messages
            # shorter than 40 characters and drops pairs with identical text.
            all_pairs.extend(extract_pairs(item["row"], config, item.get("row_idx", -1)))
        print(f"  [READ ] {config[:50]:50s} rows={len(rows):3d} "
              f"cumulative_pairs={len(all_pairs)}")
    return all_pairs, rows_seen, configs


# Runs the detector on every pair and sums up the result. `label` only appears in the
# progress line. In each pair, message a comes before message b in the debate; a is the
# premise and b the hypothesis, as in production. Out: (one small dict per pair, stats).
def score(pairs: list[dict], label: str) -> tuple[list[dict], dict]:
    # scored = one result per pair, in the same order. started = the start time, used for
    # the speed estimate in the progress line.
    scored, started = [], time.time()
    for index, pair in enumerate(pairs, start=1):
        result = evaluate_inter_agent_disagreement(
            pair["a"]["agent_id"], pair["a"]["message"],
            pair["b"]["agent_id"], pair["b"]["message"],
            threshold=THRESHOLD,
        )
        # None = the detector could not score this pair (empty text, same agent, or no NLI
        # model). Keep a placeholder so the counts still add up.
        if result is None:
            scored.append({"evaluated": False})
            continue
        # alarm = the detector says the pair contradicts. gated = the pair was ruled off-topic
        # (similarity too low). solution_mismatch = the debate's own answer letters differed;
        # it is a sampling hint from the probe, not a label.
        scored.append({
            "evaluated": True,
            "alarm": bool(result.is_disagreement),
            "contradiction_prob": result.contradiction_prob,
            "similarity": result.semantic_similarity,
            "gated": bool(result.gated_low_relevance),
            "solution_mismatch": pair.get("solution_mismatch"),
            "config": pair.get("config"),
        })
        # Every 250 pairs, print the speed (pairs per second) and the minutes left.
        if index % 250 == 0:
            rate = index / max(time.time() - started, 1e-9)
            print(f"    {label}: {index}/{len(pairs)} "
                  f"({rate:.1f} pairs/s, {(len(pairs)-index)/max(rate,1e-9)/60:.1f} min left)")

    # Counts. evaluated = pairs that were scored. alarms = pairs flagged. gated = pairs ruled
    # off-topic by the relevance gate. above_thr = pairs whose contradiction probability
    # reached THRESHOLD, before the gate is applied.
    evaluated = [s for s in scored if s["evaluated"]]
    alarms = [s for s in evaluated if s["alarm"]]
    gated = [s for s in evaluated if s["gated"]]
    above_thr = [s for s in evaluated if s["contradiction_prob"] >= THRESHOLD]
    lo, hi = wilson(len(alarms), len(evaluated))
    # suppressed_by_relevance_gate = pairs that reached the threshold but were ruled
    # off-topic (above_thr minus alarms). alarm_rate = alarms / evaluated.
    stats = {
        "pairs": len(pairs),
        "evaluated": len(evaluated),
        "unevaluated": len(pairs) - len(evaluated),
        "alarms": len(alarms),
        "alarm_rate": round(len(alarms) / max(len(evaluated), 1), 6),
        "alarm_rate_ci95": [round(lo, 6), round(hi, 6)],
        "above_threshold_before_gate": len(above_thr),
        "suppressed_by_relevance_gate": len(above_thr) - len(alarms),
        "gated_pairs_total": len(gated),
        "elapsed_seconds": round(time.time() - started, 1),
    }
    return scored, stats


# Runs the whole pilot: check the models, sample rows, score the pairs, print the result,
# work out how many rows 100/150/200 alarms would need, run the sanity check on the
# probe's labels, and save the JSON.
def main() -> None:
    rng = random.Random(SEED)
    print("=" * 78)
    print("ALARM-RATE PILOT — sizing the external disagreement benchmark")
    print("=" * 78)
    print(f"\nthreshold={THRESHOLD}  relevance_floor={RELEVANCE_FLOOR}")
    print("\nLoading models...")
    # Step 1: make sure the real models are loaded (the script stops here if not).
    guard_models()

    print(f"\nSampling ~{TARGET_ROWS} rows (offset 20, past the probe's rows)")
    # Step 2: sample debate rows and build the message pairs.
    pairs, rows_seen, configs = collect_pairs(rng)
    if not pairs:
        raise SystemExit("No pairs extracted — aborting rather than reporting 0%.")

    print(f"\nScoring {len(pairs)} pairs from {rows_seen} rows...")
    # Step 3: score every pair.
    scored, stats = score(pairs, "pilot")

    print("\n" + "-" * 78)
    print("PILOT RESULT")
    print("-" * 78)
    print(f"  rows sampled                      {rows_seen}")
    print(f"  eligible pairs                    {stats['pairs']}")
    print(f"  evaluated by detector             {stats['evaluated']}")
    print(f"  ALARMS (is_disagreement=True)     {stats['alarms']}")
    print(f"  alarm rate                        {stats['alarm_rate']*100:.3f}%  "
          f"95% CI [{stats['alarm_rate_ci95'][0]*100:.3f}%, "
          f"{stats['alarm_rate_ci95'][1]*100:.3f}%]")
    print(f"  above threshold before gate       {stats['above_threshold_before_gate']}")
    print(f"  suppressed by relevance gate      {stats['suppressed_by_relevance_gate']}")
    print(f"  elapsed                           {stats['elapsed_seconds']}s")

    # Yields: how many pairs, and how many alarms, one row gives on average.
    pairs_per_row = stats["pairs"] / max(rows_seen, 1)
    alarms_per_row = stats["alarms"] / max(rows_seen, 1)

    print(f"\n  pairs per row   {pairs_per_row:.2f}")
    print(f"  alarms per row  {alarms_per_row:.4f}")

    print("\nROWS NEEDED FOR A TARGET ALARM COUNT")
    # Step 4: scaling. If one row gives alarms_per_row alarms, then a target number of
    # alarms needs target / alarms_per_row rows (rounded up). pairs_to_screen = those rows
    # times pairs_per_row. within_corpus says whether that many rows exist (CORPUS_ROWS).
    scaling = {}
    for target in (100, 150, 200):
        if alarms_per_row > 0:
            rows_needed = math.ceil(target / alarms_per_row)
            feasible = rows_needed <= CORPUS_ROWS
            scaling[f"alarms_{target}"] = {
                "rows_needed": rows_needed,
                "pairs_to_screen": math.ceil(rows_needed * pairs_per_row),
                "within_corpus": feasible,
            }
            print(f"  {target:3d} alarms -> {rows_needed:6,} rows "
                  f"({math.ceil(rows_needed*pairs_per_row):,} pairs to screen)"
                  f"{'' if feasible else '   EXCEEDS CORPUS'}")
        else:
            # The pilot saw no alarms, so no number of rows can be expected to reach the target.
            scaling[f"alarms_{target}"] = {"rows_needed": None,
                                           "within_corpus": False}
            print(f"  {target:3d} alarms -> UNREACHABLE (alarm rate is zero)")

    # --- Section 2: sanity check against the frozen probe labels -------------
    print("\n" + "-" * 78)
    print("SANITY CHECK on 40 frozen probe labels (NOT a benchmark result)")
    print("-" * 78)
    # Goal: score the 40 pairs of the feasibility probe and compare the detector with their
    # labels. It is skipped if either file is missing or the rebuilt pairs do not fit the labels.
    sanity = None
    if KEY_PATH.exists() and LABELS_PATH.exists():
        key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
        labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))["labels"]
        # Rebuild the same 40 pairs. The probe drew them with a seeded random generator, so the
        # same seed (from the key file) and the same calls in the same order give the same
        # choices. This also assumes the server still returns the same rows.
        probe_rng = random.Random(key["seed"])
        probe_configs = pick_configs(probe_rng)
        probe_pairs = []
        # Read the probe's original rows: the first 20 rows (offset 0) of each config.
        for config in probe_configs:
            try:
                payload = fetch(ROWS_API, {
                    "dataset": DATASET_ID, "config": config, "split": "train",
                    "offset": 0, "length": 20})
            # A config that fails to download is skipped without a message. The rebuilt pairs
            # would then differ from the probe's. The length check below only notices if the
            # number of pairs changes.
            except Exception:
                continue
            for item in payload.get("rows", []):
                probe_pairs.extend(extract_pairs(item["row"], config,
                                                 item.get("row_idx", -1)))
        # Rebuild the exact 40 by replaying the probe's sampling decisions.
        # The order matters and must match the probe: first the sample of mismatch pairs, then a
        # control sample drawn from the pairs not yet chosen, then one shuffle.
        mismatch_pool = [p for p in probe_pairs if p["solution_mismatch"]]
        mismatch_sample = probe_rng.sample(mismatch_pool, min(20, len(mismatch_pool)))
        chosen = {id(p) for p in mismatch_sample}
        control_pool = [p for p in probe_pairs if id(p) not in chosen]
        control_sample = probe_rng.sample(control_pool, min(20, len(control_pool)))
        replay = ([{"group": "mismatch", **p} for p in mismatch_sample]
                  + [{"group": "control", **p} for p in control_sample])
        probe_rng.shuffle(replay)

        # Continue only if the rebuilt set has as many pairs as the label file has labels.
        if len(replay) == len(labels):
            scored_probe, _ = score(replay, "sanity")
            # The probe numbered its pairs P001, P002, ... in this shuffled order, so the n-th pair
            # has the label stored under that case id. A pair counts as a real contradiction when
            # its label is CONTRADICTION.
            # A pair the detector could not score counts as "not fired".
            tp = fp = fn = tn = 0
            for index, s in enumerate(scored_probe, start=1):
                truth = labels.get(f"P{index:03d}") == "CONTRADICTION"
                fired = bool(s.get("alarm"))
                if truth and fired: tp += 1
                elif truth: fn += 1
                elif fired: fp += 1
                else: tn += 1
            # recall = tp / (tp + fn): the share of labelled contradictions that the detector
            # flagged. The key name hard-codes 10 positives (the module docstring says n=10); the
            # code does not check that count.
            sanity = {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                      "recall_on_10_positives": round(tp / max(tp + fn, 1), 4),
                      "caveat": "n=10 positives, single annotator, no kappa; "
                                "indicative only, not a benchmark result"}
            print(f"  TP={tp}  FP={fp}  FN={fn}  TN={tn}")
            print(f"  detector caught {tp}/{tp+fn} of the labelled contradictions")
        else:
            print(f"  replay mismatch ({len(replay)} vs {len(labels)}) — skipped")
    else:
        print("  probe artifacts missing — skipped")

    # Step 5: save everything to experiments/results/disagreement_alarm_rate_pilot.json.
    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "purpose": "measure detector alarm rate to size the external benchmark",
        "not_a_benchmark": True,
        "dataset": DATASET_ID,
        "detector": {"threshold": THRESHOLD, "relevance_floor": RELEVANCE_FLOOR,
                     "orientation": "itertools.combinations, earlier agent = premise"},
        "seed": SEED,
        "configs_sampled": configs,
        "rows_sampled": rows_seen,
        "pilot": stats,
        "yields": {"pairs_per_row": round(pairs_per_row, 4),
                   "alarms_per_row": round(alarms_per_row, 6)},
        "scaling_to_target_alarms": scaling,
        "sanity_check_vs_frozen_probe_labels": sanity,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH}")


# Running this file directly does the whole pilot.
if __name__ == "__main__":
    main()
