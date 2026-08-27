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

from __future__ import annotations

import json
import math
import random
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.disagreement import (  # noqa: E402
    RELEVANCE_FLOOR,
    evaluate_inter_agent_disagreement,
)
from app.services.grounding import load_models, models_loaded  # noqa: E402

from disagreement_feasibility_probe import (  # noqa: E402
    DATASET_ID,
    ROWS_API,
    extract_pairs,
    fetch,
    pick_configs,
)

RESULTS = Path(__file__).parent / "results"
OUT_PATH = RESULTS / "disagreement_alarm_rate_pilot.json"
KEY_PATH = RESULTS / "disagreement_probe_key.json"
LABELS_PATH = RESULTS / "disagreement_probe_labels.json"

SEED = 20260827
THRESHOLD = 0.6            # engine default, not tuned here
TARGET_ROWS = 100
CORPUS_ROWS = 14_400       # DEBATE train rows across all configs


def guard_models() -> None:
    """Refuse to run on stubs. A 0% alarm rate from unloaded models is
    indistinguishable from a real 0% alarm rate in the output JSON."""
    # sync=True is mandatory: the default loads in a BACKGROUND THREAD and
    # returns immediately, so scoring would start against unloaded models.
    # Matches disagreement_benchmark.py, which measures this same detector.
    load_models(sync=True)

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


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


def collect_pairs(rng: random.Random) -> tuple[list[dict], int, list[str]]:
    configs = pick_configs(rng)
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
        except Exception as exc:
            print(f"  [SKIP ] {config[:50]:50s} {type(exc).__name__}")
            continue
        rows = payload.get("rows", [])
        rows_seen += len(rows)
        for item in rows:
            all_pairs.extend(extract_pairs(item["row"], config, item.get("row_idx", -1)))
        print(f"  [READ ] {config[:50]:50s} rows={len(rows):3d} "
              f"cumulative_pairs={len(all_pairs)}")
    return all_pairs, rows_seen, configs


def score(pairs: list[dict], label: str) -> tuple[list[dict], dict]:
    scored, started = [], time.time()
    for index, pair in enumerate(pairs, start=1):
        result = evaluate_inter_agent_disagreement(
            pair["a"]["agent_id"], pair["a"]["message"],
            pair["b"]["agent_id"], pair["b"]["message"],
            threshold=THRESHOLD,
        )
        if result is None:
            scored.append({"evaluated": False})
            continue
        scored.append({
            "evaluated": True,
            "alarm": bool(result.is_disagreement),
            "contradiction_prob": result.contradiction_prob,
            "similarity": result.semantic_similarity,
            "gated": bool(result.gated_low_relevance),
            "solution_mismatch": pair.get("solution_mismatch"),
            "config": pair.get("config"),
        })
        if index % 250 == 0:
            rate = index / max(time.time() - started, 1e-9)
            print(f"    {label}: {index}/{len(pairs)} "
                  f"({rate:.1f} pairs/s, {(len(pairs)-index)/max(rate,1e-9)/60:.1f} min left)")

    evaluated = [s for s in scored if s["evaluated"]]
    alarms = [s for s in evaluated if s["alarm"]]
    gated = [s for s in evaluated if s["gated"]]
    above_thr = [s for s in evaluated if s["contradiction_prob"] >= THRESHOLD]
    lo, hi = wilson(len(alarms), len(evaluated))
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


def main() -> None:
    rng = random.Random(SEED)
    print("=" * 78)
    print("ALARM-RATE PILOT — sizing the external disagreement benchmark")
    print("=" * 78)
    print(f"\nthreshold={THRESHOLD}  relevance_floor={RELEVANCE_FLOOR}")
    print("\nLoading models...")
    guard_models()

    print(f"\nSampling ~{TARGET_ROWS} rows (offset 20, past the probe's rows)")
    pairs, rows_seen, configs = collect_pairs(rng)
    if not pairs:
        raise SystemExit("No pairs extracted — aborting rather than reporting 0%.")

    print(f"\nScoring {len(pairs)} pairs from {rows_seen} rows...")
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

    pairs_per_row = stats["pairs"] / max(rows_seen, 1)
    alarms_per_row = stats["alarms"] / max(rows_seen, 1)

    print(f"\n  pairs per row   {pairs_per_row:.2f}")
    print(f"  alarms per row  {alarms_per_row:.4f}")

    print("\nROWS NEEDED FOR A TARGET ALARM COUNT")
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
            scaling[f"alarms_{target}"] = {"rows_needed": None,
                                           "within_corpus": False}
            print(f"  {target:3d} alarms -> UNREACHABLE (alarm rate is zero)")

    # --- Section 2: sanity check against the frozen probe labels -------------
    print("\n" + "-" * 78)
    print("SANITY CHECK on 40 frozen probe labels (NOT a benchmark result)")
    print("-" * 78)
    sanity = None
    if KEY_PATH.exists() and LABELS_PATH.exists():
        key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
        labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))["labels"]
        probe_rng = random.Random(key["seed"])
        probe_configs = pick_configs(probe_rng)
        probe_pairs = []
        for config in probe_configs:
            try:
                payload = fetch(ROWS_API, {
                    "dataset": DATASET_ID, "config": config, "split": "train",
                    "offset": 0, "length": 20})
            except Exception:
                continue
            for item in payload.get("rows", []):
                probe_pairs.extend(extract_pairs(item["row"], config,
                                                 item.get("row_idx", -1)))
        # Rebuild the exact 40 by replaying the probe's sampling decisions.
        mismatch_pool = [p for p in probe_pairs if p["solution_mismatch"]]
        mismatch_sample = probe_rng.sample(mismatch_pool, min(20, len(mismatch_pool)))
        chosen = {id(p) for p in mismatch_sample}
        control_pool = [p for p in probe_pairs if id(p) not in chosen]
        control_sample = probe_rng.sample(control_pool, min(20, len(control_pool)))
        replay = ([{"group": "mismatch", **p} for p in mismatch_sample]
                  + [{"group": "control", **p} for p in control_sample])
        probe_rng.shuffle(replay)

        if len(replay) == len(labels):
            scored_probe, _ = score(replay, "sanity")
            tp = fp = fn = tn = 0
            for index, s in enumerate(scored_probe, start=1):
                truth = labels.get(f"P{index:03d}") == "CONTRADICTION"
                fired = bool(s.get("alarm"))
                if truth and fired: tp += 1
                elif truth: fn += 1
                elif fired: fp += 1
                else: tn += 1
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


if __name__ == "__main__":
    main()
