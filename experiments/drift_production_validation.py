"""Calibrate and validate the PRODUCTION drift field.

DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md §10 measured AUC 0.9532 for a pooled-mean
drift metric -- but with a standalone function, NOT the code that ships.
`DriftDetector.window_centroid_distance` is the production implementation and
differs by construction: it streams a rolling window rather than pooling a
whole session, and is subject to the detector's own state handling. It has to
be measured, not assumed.

A first version of this script measured AUC 0.7148 and surfaced two real
implementation bugs, both since fixed in drift.py:
  1. baseline embeddings leaked into the current window, pulling the current
     mean back toward the baseline and suppressing real drift;
  2. partial windows were reported, so the first "window mean" was a
     one-sample mean -- the per-output noise the metric exists to remove.

`mean_window` is a genuine tuning parameter, so it is selected on the DEV
task split and reported once on HELD-OUT. The split is deterministic by task
hash and matches the one written at ingestion time; it has been untouched
until now. Selecting on the reported split would be selection on test.

SELECTION CRITERION, fixed before looking at any result:
    constraint  false alarms at 0.30 <= 0.10  AND  control coverage >= 25%
    objective   maximise detection rate at 0.30
    tie-break   smaller window (more coverage)

Coverage is a constraint because a detector that is silent on almost every
session is not useful regardless of how accurate it is when it does speak.

The 0.30 threshold is NOT tuned -- it is the shipped production value.

Conditions (identical to §10):
  no_shift       : first half vs second half of one session (same model, same task)
  shift          : model A vs model B on the SAME task
  content_change : same model, DIFFERENT task -- positive control

Outputs:
- experiments/results/drift_production_validation.json
"""

# WHAT THIS FILE IS FOR
# An experiment script, not part of the product. It checks the drift signal that really
# ships, DriftDetector.window_centroid_distance, on real agent sessions from a public
# dataset. Drift = an agent's outputs changing over time compared with its own early
# outputs. An embedding = a list of numbers that stands for the meaning of a text. The
# script tries several sizes for the "current window" (how many latest outputs are averaged),
# picks the best on the dev half of the tasks only, then measures once on the held-out half
# and prints whether it passes.
#
# HOW IT FITS IN
# It runs the real DriftDetector from backend/app/services/drift.py. It needs two inputs
# from earlier scripts: drift_pairs.json (made by external_exgentic_ingest.py) and an
# embedding cache (made by drift_representation_test.py). The result goes to
# experiments/results/drift_production_validation.json. drift.py points back to this file
# where it explains its default mean_window.

from __future__ import annotations

import json
import random
# statistics.median gives the middle value of a list.
import statistics
import sys
import time
from pathlib import Path
from typing import Any

# numpy holds the embedding vectors; it also reads the saved embedding file.
import numpy as np

# Add backend/, the SDK source and the repo root to the import path so `app.services...`
# can be imported.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.drift import DriftDetector

# PAIRS_PATH: sessions grouped by task, made by external_exgentic_ingest.py.
# CACHE_PATH: the saved embeddings, one array per session id (made by
#   drift_representation_test.py). OUT_PATH: where the results are written.
PAIRS_PATH = (Path(__file__).parent.parent / "datasets" / "external" /
              "exgentic_v2" / "derived" / "drift_pairs.json")
CACHE_PATH = Path(__file__).parent / "results" / ".drift_embedding_cache.npz"
OUT_PATH = Path(__file__).parent / "results" / "drift_production_validation.json"

# PRODUCTION_THRESHOLD: a distance at or above this counts as an alarm. It is also the
#   default drift threshold in alerting.py (0.3).
# WINDOW_CANDIDATES: the mean_window sizes to try.
# MAX_FALSE_ALARM and MIN_COVERAGE: the selection rules from the module docstring.
# SEED: fixed for the random draws. SAMPLES_PER_MODEL: random same-model session pairs drawn
#   per model for the content_change condition.
# MIN_OUTPUTS: a session needs at least this many outputs to be used as a no-shift control.
PRODUCTION_THRESHOLD = 0.30      # shipped value, not tuned here
WINDOW_CANDIDATES = [3, 4, 5, 6, 8, 10, 12, 15, 20]
MAX_FALSE_ALARM = 0.10
MIN_COVERAGE = 0.25
SEED = 42
SAMPLES_PER_MODEL = 200
MIN_OUTPUTS = 4


# In: a task's SHA-256 hash as hex text. Out: True for the dev split, False for held-out.
# It reads the first 8 hex digits as a number; even means dev, odd means held-out. The same
# task always lands on the same side, and about half of the tasks land on each. (The docstring
# below says external_exgentic_ingest.py writes this split, but that script has no split code.)
def is_dev(task_hash: str) -> bool:
    """Same deterministic split written by external_exgentic_ingest.py."""
    return int(task_hash[:8], 16) % 2 == 0


# In: embeddings of the baseline phase and of the measured phase, a name for the agent, and
# the window size. Out: the largest window_centroid_distance seen during the measured phase,
# or None if it never appeared.
def production_distance(baseline: list[np.ndarray], measured: list[np.ndarray],
                        tag: str, mean_window: int) -> float | None:
    """Feed both phases through the real DriftDetector and read the real field.

    `min_samples_for_alert` is set to the baseline length so the baseline
    window closes exactly at the phase boundary; the production default of 20
    would still be filling on most of these sessions (median 10 outputs).

    Returns None when the current window never fills. That is a real outcome,
    not a failure: the detector stays silent rather than guessing.
    """
    # Step 1: a fresh detector for this one session pair. The risk score and error flag below
    # are fixed dummy values: only the embedding signal window_centroid_distance is read.
    det = DriftDetector(window_size=20, min_samples_for_alert=max(2, len(baseline)),
                        mean_window=mean_window)
    # Step 2: baseline phase. The detector builds the "early outputs" average from these.
    # No distance exists yet, so the returned results are ignored.
    for vec in baseline:
        det.analyze(agent_id=tag, embedding=vec, risk_score=0.08, is_error=False)

    # Step 3: measured phase. window_centroid_distance stays None until `mean_window`
    # outputs have arrived; after that, keep the largest value seen (the "peak").
    peak: float | None = None
    for vec in measured:
        res = det.analyze(agent_id=tag, embedding=vec, risk_score=0.08, is_error=False)
        d = res.window_centroid_distance
        if d is not None:
            peak = d if peak is None else max(peak, d)
    return peak


# In: task groups (each has a list of sessions), emb (session id -> list of output
# embeddings) and one window size. Out: a dict of counts, rates, AUCs and medians for that
# window size. Each list below collects one peak distance per tested session or session pair.
def collect(groups: list[dict], emb: dict, window: int) -> dict[str, Any]:
    """Run all three conditions at one window size."""
    no_shift, shift, content_change = [], [], []
    control_total = 0

    # Condition 1, no_shift: split one session in the middle. The first half is the baseline
    # and the second half is measured, so nothing really changed. `seen` makes each session
    # count once. Sessions with fewer than MIN_OUTPUTS outputs are skipped. `control_total`
    # counts the sessions used, even if no distance came out of them.
    seen: set[str] = set()
    for group in groups:
        for sess in group["sessions"]:
            sid = sess["session_id"]
            if sid in seen:
                continue
            seen.add(sid)
            vecs = emb.get(sid, [])
            if len(vecs) < MIN_OUTPUTS:
                continue
            control_total += 1
            mid = len(vecs) // 2
            d = production_distance(vecs[:mid], vecs[mid:], f"ctrl_{sid}", window)
            if d is not None:
                no_shift.append(d)

    # Condition 2, shift: inside one task group, take every pair of models (A, B). The
    # session of model A is the baseline and the session of model B is measured, on the same
    # task. (by_model keeps one session per model; if a model appears twice, the last wins.)
    for group in groups:
        by_model = {s["model"]: s for s in group["sessions"]}
        models = sorted(by_model)
        for i, a in enumerate(models):
            for b in models[i + 1:]:
                va = emb.get(by_model[a]["session_id"], [])
                vb = emb.get(by_model[b]["session_id"], [])
                if not va or not vb:
                    continue
                d = production_distance(va, vb, f"sh_{a}_{b}", window)
                if d is not None:
                    shift.append(d)

    # Condition 3, content_change (the positive control): the same model on two DIFFERENT
    # tasks. For each model with at least 2 sessions, make SAMPLES_PER_MODEL random draws of
    # two sessions. A draw that lands on two sessions of the same task is skipped (not
    # redrawn), so a model can give fewer than SAMPLES_PER_MODEL pairs. The first session is
    # the baseline and the second is measured.
    rng = random.Random(SEED)
    by_model_all: dict[str, list[dict]] = {}
    for group in groups:
        for sess in group["sessions"]:
            by_model_all.setdefault(sess["model"], []).append(sess)
    for model, members in sorted(by_model_all.items()):
        if len(members) < 2:
            continue
        for _ in range(SAMPLES_PER_MODEL):
            a, b = rng.sample(members, 2)
            if a["task_prompt_sha256"] == b["task_prompt_sha256"]:
                continue
            va, vb = emb.get(a["session_id"], []), emb.get(b["session_id"], [])
            if not va or not vb:
                continue
            d = production_distance(va, vb, f"pos_{a['session_id']}", window)
            if d is not None:
                content_change.append(d)

    # Rates at this window size:
    #   coverage = share of control sessions for which a distance came out (the current
    #              window filled); the rest stayed silent
    #   fa  = false-alarm rate: share of no_shift distances at or above the threshold
    #   det = detection rate: share of content_change distances at or above the threshold
    #   auc = how well each condition's distances separate from the no_shift ones
    coverage = len(no_shift) / control_total if control_total else 0.0
    fa = (sum(1 for v in no_shift if v >= PRODUCTION_THRESHOLD) / len(no_shift)
          if no_shift else 0.0)
    det = (sum(1 for v in content_change if v >= PRODUCTION_THRESHOLD) / len(content_change)
           if content_change else 0.0)
    return {
        "window": window,
        "n_no_shift": len(no_shift), "n_shift": len(shift),
        "n_content_change": len(content_change),
        "control_coverage": round(coverage, 4),
        "false_alarm_at_0_30": round(fa, 4),
        "detection_at_0_30": round(det, 4),
        "auc_content_vs_no_shift": auc(content_change, no_shift),
        "auc_shift_vs_no_shift": auc(shift, no_shift),
        "median_no_shift": round(statistics.median(no_shift), 4) if no_shift else None,
        "median_shift": round(statistics.median(shift), 4) if shift else None,
        "median_content_change": round(statistics.median(content_change), 4) if content_change else None,
    }


# AUC = the chance that a random value from `positive` is bigger than a random value from
# `negative` (a tie counts as half). 0.5 means no better than a coin flip; 1.0 means the two
# lists are perfectly separated. It compares every positive with every negative. Out: the
# AUC rounded to 4 places, or None if either list is empty.
def auc(positive: list[float], negative: list[float]) -> float | None:
    if not positive or not negative:
        return None
    wins = sum(1 for p in positive for n in negative if p > n)
    ties = sum(1 for p in positive for n in negative if p == n)
    return round((wins + 0.5 * ties) / (len(positive) * len(negative)), 4)


# Runs the whole validation: no input. It reads the two input files, sweeps the window sizes
# on the dev tasks, measures the chosen size once on the held-out tasks, prints the results
# and saves experiments/results/drift_production_validation.json.
def main() -> None:
    print("=" * 78)
    print("PRODUCTION DRIFT FIELD — CALIBRATION (dev) AND VALIDATION (held-out)")
    print("=" * 78)

    # Step 1: stop with a hint if the two input files have not been made yet.
    if not PAIRS_PATH.exists() or not CACHE_PATH.exists():
        raise SystemExit(
            "Missing derived pairs or embedding cache. Run "
            "experiments/external_exgentic_ingest.py then "
            "experiments/drift_representation_test.py first.")

    # Step 2: load the task groups, and the embeddings. The .npz file holds one array per
    # session id; `emb` turns each array into a list with one vector per agent output.
    # allow_pickle=False refuses to load arbitrary Python objects from the file (safer).
    data = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))
    with np.load(CACHE_PATH, allow_pickle=False) as z:
        emb = {k: [z[k][i] for i in range(z[k].shape[0])] for k in z.files}

    # Step 3: split the task groups into dev (used to choose the window) and held-out (used
    # only for the final check), by the hash rule in is_dev.
    dev = [g for g in data["groups"] if is_dev(g["task_prompt_sha256"])]
    held = [g for g in data["groups"] if not is_dev(g["task_prompt_sha256"])]
    print(f"\ndev: {len(dev)} tasks | held-out: {len(held)} tasks "
          f"(deterministic split, untouched until now)")

    # ── Selection: DEV ONLY ───────────────────────────────────────────
    print("\n" + "-" * 78)
    print("DEV SWEEP — held-out is not touched here")
    print("-" * 78)
    print(f"  {'W':>3s} {'coverage':>9s} {'FA@0.30':>8s} {'det@0.30':>9s} {'AUC':>7s} {'eligible':>9s}")
    # Step 4: run all three conditions on the dev tasks for every candidate window size. A
    # size is "eligible" if its false-alarm rate is at most MAX_FALSE_ALARM and its control
    # coverage is at least MIN_COVERAGE.
    dev_results = []
    for w in WINDOW_CANDIDATES:
        r = collect(dev, emb, w)
        eligible = (r["false_alarm_at_0_30"] <= MAX_FALSE_ALARM
                    and r["control_coverage"] >= MIN_COVERAGE)
        r["eligible"] = eligible
        dev_results.append(r)
        print(f"  {w:3d} {r['control_coverage']:9.3f} {r['false_alarm_at_0_30']:8.3f} "
              f"{r['detection_at_0_30']:9.3f} {str(r['auc_content_vs_no_shift']):>7s} "
              f"{str(eligible):>9s}")

    # Step 5: choose the window. Among the eligible sizes take the highest detection rate;
    # on a tie, the smaller window (-r["window"] makes smaller sort higher). If no size is
    # eligible, fall back to the one with the lowest false-alarm rate and say so in `basis`.
    eligible = [r for r in dev_results if r["eligible"]]
    if eligible:
        best = max(eligible, key=lambda r: (r["detection_at_0_30"], -r["window"]))
        basis = "criterion satisfied"
    else:
        best = min(dev_results, key=lambda r: r["false_alarm_at_0_30"])
        basis = "NO candidate met the criterion; fell back to lowest false-alarm rate"
    chosen = best["window"]
    print(f"\n  selected mean_window = {chosen}  ({basis})")

    # ── Validation: HELD-OUT, measured once, at the locked window ─────
    print("\n" + "-" * 78)
    print(f"HELD-OUT VALIDATION at mean_window={chosen} (measured once)")
    print("-" * 78)
    # Step 6: run the held-out tasks once, at the chosen window, and print the numbers.
    final = collect(held, emb, chosen)
    for label, key in (("control coverage", "control_coverage"),
                       ("false alarms @0.30", "false_alarm_at_0_30"),
                       ("detection @0.30", "detection_at_0_30"),
                       ("AUC content vs no_shift", "auc_content_vs_no_shift"),
                       ("AUC model-shift vs no_shift", "auc_shift_vs_no_shift")):
        print(f"  {label:30s} {final[key]}")
    print(f"  medians  no_shift={final['median_no_shift']}  "
          f"shift={final['median_shift']}  content_change={final['median_content_change']}")

    # Step 7: pass or fail. The held-out run passes if the AUC for content change versus
    # no shift is at least 0.90 (a missing AUC counts as 0) and the false-alarm rate is at
    # most 0.15 (looser than the 0.10 used to choose the window). Both cut-offs are written
    # in this script. If it fails, the script advises against using the signal for alerts.
    passes = (final["auc_content_vs_no_shift"] or 0) >= 0.90 and \
             final["false_alarm_at_0_30"] <= 0.15
    print(f"\n  HELD-OUT PASSES (AUC >= 0.90 and FA <= 0.15): {passes}")
    if not passes:
        print("  -> do NOT wire this into alerting.")

    # Step 8: save the settings, the rule used to choose the window, the dev sweep and the
    # held-out result to a JSON file.
    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "data_class": "EXTERNAL_REAL_DATA",
        "source": data["provenance"],
        "field_under_test": "DriftDetector.window_centroid_distance (production code)",
        "production_threshold": PRODUCTION_THRESHOLD,
        "threshold_tuned": False,
        "selection_criterion": {
            "constraint": f"false_alarm <= {MAX_FALSE_ALARM} and coverage >= {MIN_COVERAGE}",
            "objective": "maximise detection at the production threshold",
            "tie_break": "smaller window",
            "fixed_before_running": True,
        },
        "split": {"dev_tasks": len(dev), "held_out_tasks": len(held),
                  "rule": "deterministic by task hash, same as ingestion"},
        "dev_sweep": dev_results,
        "selected_mean_window": chosen,
        "selection_basis": basis,
        "held_out": final,
        "held_out_passes": passes,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nResults saved to: {OUT_PATH}")


if __name__ == "__main__":
    main()
