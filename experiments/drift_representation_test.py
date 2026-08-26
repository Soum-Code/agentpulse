"""Test the two representation hypotheses from DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md §9.

That report established the current drift metric does not separate a real
model change from an agent's own normal step-to-step variation: model-shift
median distance 0.4618 vs no-shift control 0.4817, with the control higher.
Root cause measured there: one normal agent step has median distance 0.2565,
so the 0.30 threshold sits inside ordinary intra-run variance.

It named two candidate reformulations and labelled both as untested
hypotheses. This script tests them against the current metric on identical
data, so any difference is attributable to the representation alone.

METRICS COMPARED (same sessions, same embeddings, same conditions)

  A. ema_within_run  -- the shipped metric. Per-output distance to a slowly
     updating EMA centroid of prior outputs, peak taken over the run.
     Reproduced here as the control condition, not re-derived from the
     previous run's numbers.

  B. pooled_session  -- hypothesis 1 ("compare across runs"). Mean-pool a
     whole session's outputs into one vector, then compare vectors. If
     intra-run variety is the dominant noise, pooling should average it out.

  C. stepwise_aligned -- hypothesis 2 ("compare like against like"). Compare
     output at step i against output at step i of the other session, then
     take the median over aligned steps. Sessions differ in length, so only
     the overlapping prefix is compared.

CONDITIONS
  shift        : model A vs model B on the SAME task
  no_shift     : first half vs second half of ONE session (same model, same task)
  content_change : same model, DIFFERENT task -- a POSITIVE CONTROL

The positive control is what the first version of this experiment lacked, and
without it the result was uninterpretable. If no condition separates, there
are two indistinguishable explanations: the metric is blind, or none of the
conditions is a real semantic change. `content_change` is a difference we
know exists -- different tasks are different subject matter -- so it tells
those apart. It is an upper bound, not an operational estimate: real drift is
subtler than swapping the task entirely.

NOT A LABELLED BENCHMARK. The corpus carries no drift annotations. Condition
membership is structural. The question asked is only whether a metric
separates the two conditions -- reported as distributions and a separation
statistic, never as precision/recall.

Success criterion, fixed before running: a metric is a candidate improvement
only if the shift distribution sits clearly above the no_shift distribution.
The current metric fails this (control is higher). A metric that merely
produces smaller numbers everywhere has not improved anything.

No production code is modified. This is measurement only.

Outputs:
- experiments/results/drift_representation_test.json
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
from app.services.grounding import get_embedding, load_models, models_loaded

PAIRS_PATH = (Path(__file__).parent.parent / "datasets" / "external" /
              "exgentic_v2" / "derived" / "drift_pairs.json")
CACHE_PATH = Path(__file__).parent / "results" / ".drift_embedding_cache.npz"
OUT_PATH = Path(__file__).parent / "results" / "drift_representation_test.json"

MIN_OUTPUTS = 4
POSITIVE_CONTROL_SEED = 42
POSITIVE_CONTROL_SAMPLES_PER_MODEL = 200
DETECTOR_KWARGS = dict(window_size=20, min_samples_for_alert=5, drift_threshold=0.30)


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 1.0
    return 1.0 - float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))


def metric_ema_within_run(base: list[np.ndarray], meas: list[np.ndarray], tag: str) -> float:
    """The shipped metric: peak per-output distance to an EMA centroid."""
    det = DriftDetector(**DETECTOR_KWARGS)
    for v in base:
        det.analyze(agent_id=tag, embedding=v, risk_score=0.08, is_error=False)
    peak = 0.0
    for v in meas:
        res = det.analyze(agent_id=tag, embedding=v, risk_score=0.08, is_error=False)
        if res.centroid_distance is not None:
            peak = max(peak, res.centroid_distance)
    return peak


def metric_pooled_session(base: list[np.ndarray], meas: list[np.ndarray]) -> float:
    """Hypothesis 1: mean-pool each side, compare the two pooled vectors."""
    return cosine_distance(np.mean(base, axis=0), np.mean(meas, axis=0))


def metric_stepwise_aligned(base: list[np.ndarray], meas: list[np.ndarray]) -> float:
    """Hypothesis 2: compare step i to step i, take the median over the overlap."""
    n = min(len(base), len(meas))
    if n == 0:
        return 1.0
    return statistics.median(cosine_distance(base[i], meas[i]) for i in range(n))


def summarize(values: list[float]) -> dict[str, float]:
    if not values:
        return {}
    ordered = sorted(values)
    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 4),
        "median": round(statistics.median(values), 4),
        "stdev": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
        "p05": round(ordered[max(0, int(len(ordered) * 0.05))], 4),
        "p25": round(ordered[len(ordered) // 4], 4),
        "p75": round(ordered[3 * len(ordered) // 4], 4),
        "p95": round(ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))], 4),
        "min": round(ordered[0], 4),
        "max": round(ordered[-1], 4),
    }


def separation(shift: list[float], control: list[float]) -> dict[str, Any]:
    """How well does this metric tell the two conditions apart?

    - median_gap: shift median minus control median. Must be positive to be
      useful at all; the shipped metric is negative here.
    - auc: probability a random shift comparison scores above a random
      control comparison. 0.5 = no signal, 1.0 = perfect separation.
    - best_threshold / best_accuracy: the single cut point that maximises
      balanced accuracy, reported to show the ceiling this metric could reach
      even with ideal tuning. NOT a recommended threshold -- it is fitted to
      this data and would need dev/held-out validation to mean anything.
    """
    gap = statistics.median(shift) - statistics.median(control)
    wins = sum(1 for s in shift for c in control if s > c)
    ties = sum(1 for s in shift for c in control if s == c)
    auc = (wins + 0.5 * ties) / (len(shift) * len(control))

    best_acc, best_t = 0.0, None
    for t in sorted(set(round(v, 3) for v in shift + control)):
        tpr = sum(1 for s in shift if s >= t) / len(shift)
        tnr = sum(1 for c in control if c < t) / len(control)
        acc = (tpr + tnr) / 2
        if acc > best_acc:
            best_acc, best_t = acc, t

    return {
        "median_gap": round(gap, 4),
        "auc": round(auc, 4),
        "best_balanced_accuracy": round(best_acc, 4),
        "threshold_at_best": best_t,
        "note": "threshold fitted on this data; not validated, not a recommendation",
    }


def main() -> None:
    print("=" * 76)
    print("DRIFT REPRESENTATION TEST — current metric vs two hypotheses")
    print("=" * 76)

    if not PAIRS_PATH.exists():
        raise SystemExit(f"Missing {PAIRS_PATH}. Run experiments/external_exgentic_ingest.py first.")
    data = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))
    groups = data["groups"]

    # ── Embeddings (cached: identical inputs, and re-embedding costs ~10 min) ──
    embeddings: dict[str, list[np.ndarray]] = {}
    if CACHE_PATH.exists():
        print(f"\nLoading cached embeddings from {CACHE_PATH.name}...")
        with np.load(CACHE_PATH, allow_pickle=False) as z:
            for key in z.files:
                arr = z[key]
                embeddings[key] = [arr[i] for i in range(arr.shape[0])]
        print(f"  {len(embeddings)} sessions from cache")
    else:
        print("\nLoading production embedding model...")
        load_models(sync=True)
        loaded = models_loaded()
        print(f"  models_loaded(): {loaded}")
        if not loaded["embedding_model"]:
            raise SystemExit(f"Embedding model not loaded ({loaded}). Refusing to run.")

        print("Embedding real agent outputs...")
        t0 = time.perf_counter()
        for gi, group in enumerate(groups):
            for sess in group["sessions"]:
                sid = sess["session_id"]
                if sid in embeddings:
                    continue
                vecs = []
                for text in sess["outputs"]:
                    emb = get_embedding(text)
                    if emb is not None:
                        vecs.append(np.asarray(emb, dtype=np.float32).flatten())
                embeddings[sid] = vecs
            if (gi + 1) % 50 == 0:
                print(f"  {gi + 1}/{len(groups)} groups ({time.perf_counter() - t0:.0f}s)", flush=True)
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(CACHE_PATH, **{k: np.stack(v) for k, v in embeddings.items() if v})
        print(f"  done in {time.perf_counter() - t0:.0f}s, cached to {CACHE_PATH.name}")

    METRICS = {
        "ema_within_run": lambda b, m, tag: metric_ema_within_run(b, m, tag),
        "pooled_session": lambda b, m, tag: metric_pooled_session(b, m),
        "stepwise_aligned": lambda b, m, tag: metric_stepwise_aligned(b, m),
    }
    scores: dict[str, dict[str, list[float]]] = {
        name: {"shift": [], "no_shift": [], "content_change": []} for name in METRICS
    }

    # ── Condition: controlled model shift, both directions ────────────
    for group in groups:
        by_model = {s["model"]: s for s in group["sessions"]}
        models = sorted(by_model)
        for i, a in enumerate(models):
            for b in models[i + 1:]:
                for src, dst in ((a, b), (b, a)):
                    va = embeddings.get(by_model[src]["session_id"], [])
                    vb = embeddings.get(by_model[dst]["session_id"], [])
                    if not va or not vb:
                        continue
                    tag = f"shift_{by_model[src]['session_id']}_{by_model[dst]['session_id']}"
                    for name, fn in METRICS.items():
                        scores[name]["shift"].append(fn(va, vb, tag))

    # ── Condition: no-shift control, same session split in half ───────
    seen: set[str] = set()
    for group in groups:
        for sess in group["sessions"]:
            sid = sess["session_id"]
            if sid in seen:
                continue
            seen.add(sid)
            vecs = embeddings.get(sid, [])
            if len(vecs) < MIN_OUTPUTS:
                continue
            mid = len(vecs) // 2
            for name, fn in METRICS.items():
                scores[name]["no_shift"].append(fn(vecs[:mid], vecs[mid:], f"control_{sid}"))

    # ── Positive control: same model, DIFFERENT task ──────────────────
    # Sampled with a fixed seed so the run is reproducible.
    rng = random.Random(POSITIVE_CONTROL_SEED)
    by_model: dict[str, list[dict]] = {}
    for group in groups:
        for sess in group["sessions"]:
            by_model.setdefault(sess["model"], []).append(sess)

    for model, members in sorted(by_model.items()):
        if len(members) < 2:
            continue
        for _ in range(POSITIVE_CONTROL_SAMPLES_PER_MODEL):
            a, b = rng.sample(members, 2)
            if a["task_prompt_sha256"] == b["task_prompt_sha256"]:
                continue
            va = embeddings.get(a["session_id"], [])
            vb = embeddings.get(b["session_id"], [])
            if not va or not vb:
                continue
            tag = f"poscontrol_{a['session_id']}_{b['session_id']}"
            for name, fn in METRICS.items():
                scores[name]["content_change"].append(fn(va, vb, tag))

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "data_class": "EXTERNAL_REAL_DATA",
        "source": data["provenance"],
        "target_cell": data["target_cell"],
        "labels": "NONE — condition membership is structural, not a drift annotation",
        "production_code_modified": False,
        "metrics": {},
    }
    for name in METRICS:
        sh, ns, cc = (scores[name]["shift"], scores[name]["no_shift"],
                      scores[name]["content_change"])
        payload["metrics"][name] = {
            "shift": summarize(sh),
            "no_shift": summarize(ns),
            "content_change": summarize(cc),
            # Does the metric tell a MODEL SWAP apart from normal operation?
            "separation_shift_vs_no_shift": separation(sh, ns),
            # Does it tell a REAL CONTENT CHANGE apart from normal operation?
            "separation_content_change_vs_no_shift": separation(cc, ns),
            # Behaviour at the threshold already shipped in config.py.
            "at_production_threshold_0_30": {
                "detection_rate_on_content_change": round(
                    sum(1 for v in cc if v >= 0.30) / len(cc), 4) if cc else None,
                "false_alarm_rate_on_no_shift": round(
                    sum(1 for v in ns if v >= 0.30) / len(ns), 4) if ns else None,
            },
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # ── Console summary ───────────────────────────────────────────────
    print("\n" + "-" * 76)
    print("DISTRIBUTIONS (median [p25-p75])")
    print("-" * 76)
    print(f"  {'metric':18s} {'no_shift':>12s} {'model shift':>12s} {'content chg':>12s}")
    for name in METRICS:
        m = payload["metrics"][name]
        print(f"  {name:18s} {m['no_shift']['median']:12.4f} "
              f"{m['shift']['median']:12.4f} {m['content_change']['median']:12.4f}")

    print("\n" + "-" * 76)
    print("SEPARATION  (AUC 0.5 = no signal; median_gap must be > 0 to be useful)")
    print("-" * 76)
    print(f"  {'metric':18s} {'AUC shift':>11s} {'AUC content':>12s} "
          f"{'det@0.30':>9s} {'FA@0.30':>8s}")
    for name in METRICS:
        m = payload["metrics"][name]
        a1 = m["separation_shift_vs_no_shift"]["auc"]
        a2 = m["separation_content_change_vs_no_shift"]["auc"]
        t = m["at_production_threshold_0_30"]
        print(f"  {name:18s} {a1:11.4f} {a2:12.4f} "
              f"{t['detection_rate_on_content_change']:9.3f} "
              f"{t['false_alarm_rate_on_no_shift']:8.3f}")

    print(f"\nResults saved to: {OUT_PATH}")


if __name__ == "__main__":
    main()
