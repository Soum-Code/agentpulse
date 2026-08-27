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

from __future__ import annotations

import json
import random
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.drift import DriftDetector

PAIRS_PATH = (Path(__file__).parent.parent / "datasets" / "external" /
              "exgentic_v2" / "derived" / "drift_pairs.json")
CACHE_PATH = Path(__file__).parent / "results" / ".drift_embedding_cache.npz"
OUT_PATH = Path(__file__).parent / "results" / "drift_production_validation.json"

PRODUCTION_THRESHOLD = 0.30      # shipped value, not tuned here
WINDOW_CANDIDATES = [3, 4, 5, 6, 8, 10, 12, 15, 20]
MAX_FALSE_ALARM = 0.10
MIN_COVERAGE = 0.25
SEED = 42
SAMPLES_PER_MODEL = 200
MIN_OUTPUTS = 4


def is_dev(task_hash: str) -> bool:
    """Same deterministic split written by external_exgentic_ingest.py."""
    return int(task_hash[:8], 16) % 2 == 0


def production_distance(baseline: list[np.ndarray], measured: list[np.ndarray],
                        tag: str, mean_window: int) -> float | None:
    """Feed both phases through the real DriftDetector and read the real field.

    `min_samples_for_alert` is set to the baseline length so the baseline
    window closes exactly at the phase boundary; the production default of 20
    would still be filling on most of these sessions (median 10 outputs).

    Returns None when the current window never fills. That is a real outcome,
    not a failure: the detector stays silent rather than guessing.
    """
    det = DriftDetector(window_size=20, min_samples_for_alert=max(2, len(baseline)),
                        mean_window=mean_window)
    for vec in baseline:
        det.analyze(agent_id=tag, embedding=vec, risk_score=0.08, is_error=False)

    peak: float | None = None
    for vec in measured:
        res = det.analyze(agent_id=tag, embedding=vec, risk_score=0.08, is_error=False)
        d = res.window_centroid_distance
        if d is not None:
            peak = d if peak is None else max(peak, d)
    return peak


def collect(groups: list[dict], emb: dict, window: int) -> dict[str, Any]:
    """Run all three conditions at one window size."""
    no_shift, shift, content_change = [], [], []
    control_total = 0

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


def auc(positive: list[float], negative: list[float]) -> float | None:
    if not positive or not negative:
        return None
    wins = sum(1 for p in positive for n in negative if p > n)
    ties = sum(1 for p in positive for n in negative if p == n)
    return round((wins + 0.5 * ties) / (len(positive) * len(negative)), 4)


def main() -> None:
    print("=" * 78)
    print("PRODUCTION DRIFT FIELD — CALIBRATION (dev) AND VALIDATION (held-out)")
    print("=" * 78)

    if not PAIRS_PATH.exists() or not CACHE_PATH.exists():
        raise SystemExit(
            "Missing derived pairs or embedding cache. Run "
            "experiments/external_exgentic_ingest.py then "
            "experiments/drift_representation_test.py first.")

    data = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))
    with np.load(CACHE_PATH, allow_pickle=False) as z:
        emb = {k: [z[k][i] for i in range(z[k].shape[0])] for k in z.files}

    dev = [g for g in data["groups"] if is_dev(g["task_prompt_sha256"])]
    held = [g for g in data["groups"] if not is_dev(g["task_prompt_sha256"])]
    print(f"\ndev: {len(dev)} tasks | held-out: {len(held)} tasks "
          f"(deterministic split, untouched until now)")

    # ── Selection: DEV ONLY ───────────────────────────────────────────
    print("\n" + "-" * 78)
    print("DEV SWEEP — held-out is not touched here")
    print("-" * 78)
    print(f"  {'W':>3s} {'coverage':>9s} {'FA@0.30':>8s} {'det@0.30':>9s} {'AUC':>7s} {'eligible':>9s}")
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
    final = collect(held, emb, chosen)
    for label, key in (("control coverage", "control_coverage"),
                       ("false alarms @0.30", "false_alarm_at_0_30"),
                       ("detection @0.30", "detection_at_0_30"),
                       ("AUC content vs no_shift", "auc_content_vs_no_shift"),
                       ("AUC model-shift vs no_shift", "auc_shift_vs_no_shift")):
        print(f"  {label:30s} {final[key]}")
    print(f"  medians  no_shift={final['median_no_shift']}  "
          f"shift={final['median_shift']}  content_change={final['median_content_change']}")

    passes = (final["auc_content_vs_no_shift"] or 0) >= 0.90 and \
             final["false_alarm_at_0_30"] <= 0.15
    print(f"\n  HELD-OUT PASSES (AUC >= 0.90 and FA <= 0.15): {passes}")
    if not passes:
        print("  -> do NOT wire this into alerting.")

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
