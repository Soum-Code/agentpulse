"""Drift diagnosis on REAL agent text.

The question `DRIFT_EXPERIMENT_REPORT.md` cannot answer: the embedding-centroid
detector never crossed its 0.30 threshold in the synthetic experiment, but that
experiment built embedding vectors by hand (`vec[1] = shift_level`) rather than
embedding real text. So nothing established whether the detector is
insensitive or the scenarios simply never moved the embedding.

This measures the same detector, unmodified, on real agent outputs from an
external corpus (Exgentic/agent-llm-traces-v2) where the task text is
byte-identical across models — a controlled single-variable change.

TWO CONDITIONS
  shift    : baseline centroid from model A's outputs on task T, then measure
             model B's outputs on the SAME task T. Both directions are run,
             because the EMA centroid update makes order matter.
  no_shift : within one session, the agent's own outputs are split in half;
             the first half builds the centroid, the second half is measured.
             Same model, same task, same session. This is the floor any
             threshold has to clear.

NOT A LABELLED BENCHMARK. The corpus carries no drift annotations. Condition
membership is structural (which model emitted the text), not a judgement that
the output drifted. Two models can both be correct and still differ. So this
reports DISTRIBUTIONS and where the 0.30 threshold falls relative to them --
no precision/recall/F1, because there is nothing to be right or wrong about.

Peak centroid distance is recorded, never the final value. Reading the final
value is what produced the incorrect "the centroid branch never fires" claim
in an earlier revision of the drift report: the EMA centroid converges toward
the shifted data, so the distance decays back down by the end of the run.

The production detector and embedding path are used as-is and not modified.

Outputs:
- experiments/results/drift_real_text_diagnosis.json
"""

# WHAT THIS FILE IS FOR
# A one-off experiment script, not part of the running product. It takes real agent text
# from an outside dataset, turns each output into an embedding (a list of numbers that
# stands for the text's meaning), and feeds them to AgentPulse's drift detector. It records
# how far the detector's "centroid distance" moves. The centroid is the detector's running
# average of one agent's embeddings. Two cases are compared: "shift" (a different model
# answers the same task) and "no_shift" (one session split in half). The numbers are saved
# as JSON and a short table is printed.
#
# HOW IT FITS IN
# Reads derived/drift_pairs.json, which external_exgentic_ingest.py writes. Uses
# DriftDetector (app/services/drift.py) and the MiniLM embedding model (app/services/
# grounding.py). Run it directly as a script. It measures centroid_distance (one output
# against the running average), not the window_centroid_distance that the live
# DRIFT_DETECTED alert now reads.

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any

# numpy: holds the embedding vectors (arrays of numbers).
import numpy as np

# Make the repo importable when this file is run as a plain script: backend/ (the "app"
# package), the SDK source, and the repo root.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# DriftDetector = the production drift engine. get_embedding = text in, MiniLM vector out.
# load_models loads the NLI and embedding models into memory; models_loaded says which loaded.
from app.services.drift import DriftDetector
from app.services.grounding import get_embedding, load_models, models_loaded

# Input: groups of sessions that share one task prompt. Its derived/ folder is git-ignored, so
# the file exists only after external_exgentic_ingest.py has been run.
PAIRS_PATH = (Path(__file__).parent.parent / "datasets" / "external" /
              "exgentic_v2" / "derived" / "drift_pairs.json")
# Output: every number this script produces.
OUT_PATH = Path(__file__).parent / "results" / "drift_real_text_diagnosis.json"

# A run counts as "fired" when its peak centroid distance reaches 0.30, or when its lowest
# ASI falls below 50. Both numbers are copied from backend/app/config.py.
CENTROID_THRESHOLD = 0.30   # production config drift_threshold
ASI_THRESHOLD = 50.0        # production config asi_low_threshold
# A session needs at least this many outputs before it can be split in two halves.
MIN_OUTPUTS_FOR_CONTROL = 4

# Matches experiments/drift_scenarios.py so the two are comparable.
# window_size = how many recent risk scores and error flags are kept; min_samples_for_alert
# = the cold-start length. The detector stores drift_threshold but does not read it.
# ema_alpha and mean_window are left at their defaults.
DETECTOR_KWARGS = dict(window_size=20, min_samples_for_alert=5, drift_threshold=0.30)


def measure(baseline_vecs: list[np.ndarray], measured_vecs: list[np.ndarray],
            agent_id: str) -> dict[str, Any]:
    """Feed baseline then measured through an unmodified DriftDetector.

    Returns the PEAK centroid distance and MINIMUM stability index observed
    over the measured phase -- the values a live detector would have alerted
    on, as opposed to the end-of-run values.
    """
    # A fresh detector for every call, so no state carries over from one comparison to the next.
    det = DriftDetector(**DETECTOR_KWARGS)
    # Step 1: show the baseline outputs to the detector. This builds its centroid. The
    # results are thrown away. Every span gets the same low risk score (0.08), no error
    # and no tool name, so only the embedding can move the numbers.
    for vec in baseline_vecs:
        det.analyze(agent_id=agent_id, embedding=vec, risk_score=0.08, is_error=False)

    # Step 2: show the outputs to be measured, and keep the worst values seen on the way.
    # The peak distance starts at 0 (the lowest possible) and the lowest ASI starts at 100
    # (the best possible), so any real value replaces them.
    peak_distance = 0.0
    min_asi = 100.0
    for vec in measured_vecs:
        res = det.analyze(agent_id=agent_id, embedding=vec, risk_score=0.08, is_error=False)
        # A value is None when the detector could not compute it; those are skipped.
        if res.centroid_distance is not None:
            peak_distance = max(peak_distance, res.centroid_distance)
        if res.stability_index is not None:
            min_asi = min(min_asi, res.stability_index)

    # Step 3: report. centroid_fired = the peak distance reached 0.30; asi_fired = the lowest
    # ASI fell below 50. These flags are this script's own test, not the live alert rules.
    return {
        "peak_centroid_distance": round(peak_distance, 4),
        "min_stability_index": round(min_asi, 1),
        "centroid_fired": peak_distance >= CENTROID_THRESHOLD,
        "asi_fired": min_asi < ASI_THRESHOLD,
        "n_baseline": len(baseline_vecs),
        "n_measured": len(measured_vecs),
    }


# Turns a list of numbers into summary statistics: count, mean, median, standard deviation,
# min, max and the 25th, 75th and 95th percentiles (a percentile is the value that the
# given share of the list falls below). Percentiles are picked by index from the sorted
# list, with no averaging between neighbours. Returns {} for an empty list.
def summarize(values: list[float]) -> dict[str, float]:
    if not values:
        return {}
    ordered = sorted(values)
    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 4),
        "median": round(statistics.median(values), 4),
        "stdev": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
        "min": round(ordered[0], 4),
        "p25": round(ordered[len(ordered) // 4], 4),
        "p75": round(ordered[3 * len(ordered) // 4], 4),
        "p95": round(ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))], 4),
        "max": round(ordered[-1], 4),
    }


# Runs the whole experiment: load the input, embed the text, run the two conditions, save
# the JSON, print a table. Takes no arguments and returns nothing.
def main() -> None:
    print("=" * 72)
    print("DRIFT DIAGNOSIS ON REAL AGENT TEXT")
    print("=" * 72)

    # Step 1: stop early, with a hint, if the input file has not been made yet.
    if not PAIRS_PATH.exists():
        raise SystemExit(f"Missing {PAIRS_PATH}. Run experiments/external_exgentic_ingest.py first.")

    # Step 2: load the models. sync=True waits until loading is finished. If the embedding
    # model did not load, get_embedding would return None for every text, so stop here.
    print("\nLoading production embedding model...")
    load_models(sync=True)
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not loaded["embedding_model"]:
        raise SystemExit(f"Embedding model not loaded ({loaded}). Refusing to run.")

    # Step 3: read the paired groups. One group = one task prompt plus the sessions of the
    # different models that were given that same prompt.
    data = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))
    groups = data["groups"]
    print(f"  loaded {len(groups)} paired task groups "
          f"({data['n_sessions_in_groups']} sessions) from {data['provenance']['dataset_id']}")

    # ── Embed every output once, cached per session ───────────────────
    # Step 4: embed each session's outputs. The result is a dict kept in memory only (this
    # script has no cache file): session id -> list of vectors, one per output text.
    print("\nEmbedding real agent outputs (production MiniLM path)...")
    embeddings: dict[str, list[np.ndarray]] = {}
    total_outputs = 0
    t0 = time.perf_counter()
    for gi, group in enumerate(groups):
        for sess in group["sessions"]:
            sid = sess["session_id"]
            # Safety check: never embed the same session twice.
            if sid in embeddings:
                continue
            vecs = []
            for text in sess["outputs"]:
                emb = get_embedding(text)
                # get_embedding returns None on failure; that output is simply left out.
                if emb is not None:
                    vecs.append(np.asarray(emb, dtype=np.float32).flatten())
            embeddings[sid] = vecs
            total_outputs += len(vecs)
        # A progress line after every 25 groups, because embedding takes a while.
        if (gi + 1) % 25 == 0:
            print(f"  {gi + 1}/{len(groups)} groups, {total_outputs} outputs embedded "
                  f"({time.perf_counter() - t0:.0f}s)", flush=True)
    print(f"  done: {len(embeddings)} sessions, {total_outputs} outputs, "
          f"{time.perf_counter() - t0:.0f}s")

    shift_results: list[dict] = []
    control_results: list[dict] = []

    # ── Condition 1: controlled model shift (both directions) ─────────
    # Step 5: for each task, take every pair of models. For a pair (a, b) run both a -> b
    # and b -> a: the first model builds the baseline, the second is measured.
    for group in groups:
        # model name -> its session. If one model has several sessions for this task,
        # the dict keeps only the last one.
        by_model = {s["model"]: s for s in group["sessions"]}
        models = sorted(by_model)
        # models[i + 1:] makes each unordered pair appear once; the inner loop adds both orders.
        for i, a in enumerate(models):
            for b in models[i + 1:]:
                for src, dst in ((a, b), (b, a)):
                    sa, sb = by_model[src], by_model[dst]
                    va, vb = embeddings[sa["session_id"]], embeddings[sb["session_id"]]
                    # A session with no usable embeddings cannot be compared.
                    if not va or not vb:
                        continue
                    r = measure(va, vb, agent_id=f"shift_{sa['session_id']}_{sb['session_id']}")
                    # Add the labels that say which pair this result belongs to.
                    r.update({
                        "condition": "shift",
                        "task_prompt_sha256": group["task_prompt_sha256"],
                        "baseline_model": src, "measured_model": dst,
                        "baseline_session": sa["session_id"], "measured_session": sb["session_id"],
                    })
                    shift_results.append(r)

    # ── Condition 2: no-shift control (same session, split in half) ───
    # Step 6: the floor. Same model, same task, same session: the first half of the outputs
    # is the baseline and the second half is measured. Nothing real changed, so whatever
    # distance shows up here is ordinary variety inside one run.
    seen: set[str] = set()
    for group in groups:
        for sess in group["sessions"]:
            sid = sess["session_id"]
            # Safety check: use each session only once.
            if sid in seen:
                continue
            seen.add(sid)
            vecs = embeddings[sid]
            # Too short to split into two meaningful halves.
            if len(vecs) < MIN_OUTPUTS_FOR_CONTROL:
                continue
            # mid = the middle index; vecs[:mid] is the first half, vecs[mid:] the rest.
            mid = len(vecs) // 2
            r = measure(vecs[:mid], vecs[mid:], agent_id=f"control_{sid}")
            r.update({
                "condition": "no_shift",
                "task_prompt_sha256": sess["task_prompt_sha256"],
                "baseline_model": sess["model"], "measured_model": sess["model"],
                "baseline_session": sid, "measured_session": sid,
            })
            control_results.append(r)

    # Step 7: pull out the peak distances of each condition, then build the JSON to save.
    shift_d = [r["peak_centroid_distance"] for r in shift_results]
    ctrl_d = [r["peak_centroid_distance"] for r in control_results]

    # The "fired" counts below add up True values (True counts as 1): how many runs crossed
    # this script's 0.30 / ASI 50 test. "results" lists every single comparison.
    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "data_class": "EXTERNAL_REAL_DATA",
        "source": data["provenance"],
        "target_cell": data["target_cell"],
        "detector": {
            "implementation": "backend/app/services/drift.py DriftDetector (unmodified)",
            "kwargs": DETECTOR_KWARGS,
            "embedding_model": "sentence-transformers/all-MiniLM-L6-v2 (production path)",
            "centroid_threshold": CENTROID_THRESHOLD,
            "asi_threshold": ASI_THRESHOLD,
            "metric": "peak centroid distance over the measured phase (not final value)",
        },
        "labels": "NONE — condition membership is structural, not a drift annotation",
        "embedded_outputs": total_outputs,
        "conditions": {
            "shift": {
                "description": "baseline = model A outputs on task T; measured = model B outputs on same task T",
                "distance": summarize(shift_d),
                "centroid_fired": sum(r["centroid_fired"] for r in shift_results),
                "asi_fired": sum(r["asi_fired"] for r in shift_results),
                "min_asi": summarize([r["min_stability_index"] for r in shift_results]),
            },
            "no_shift": {
                "description": "baseline = first half of one session's outputs; measured = second half (same model, same task)",
                "distance": summarize(ctrl_d),
                "centroid_fired": sum(r["centroid_fired"] for r in control_results),
                "asi_fired": sum(r["asi_fired"] for r in control_results),
                "min_asi": summarize([r["min_stability_index"] for r in control_results]),
            },
        },
        "results": shift_results + control_results,
    }

    # Step 8: save the JSON, creating the results folder if it is missing.
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # ── Console summary ───────────────────────────────────────────────
    # Step 9: print one row per condition. The last column is "runs that reached 0.30 /
    # runs in the condition". It is a count, even though the variable is called pct.
    print("\n" + "-" * 72)
    print("PEAK CENTROID DISTANCE BY CONDITION")
    print("-" * 72)
    print(f"  {'condition':10s} {'n':>5s} {'median':>8s} {'mean':>8s} {'p95':>8s} {'max':>8s}  "
          f"{'>=0.30':>8s}")
    for name, res, dists in (("shift", shift_results, shift_d),
                             ("no_shift", control_results, ctrl_d)):
        s = summarize(dists)
        fired = sum(r["centroid_fired"] for r in res)
        pct = f"{fired}/{len(res)}"
        print(f"  {name:10s} {s['n']:5d} {s['median']:8.4f} {s['mean']:8.4f} "
              f"{s['p95']:8.4f} {s['max']:8.4f}  {pct:>8s}")

    print("\n  ASI branch (threshold < 50):")
    for name, res in (("shift", shift_results), ("no_shift", control_results)):
        print(f"    {name:10s} fired {sum(r['asi_fired'] for r in res)}/{len(res)}")

    print(f"\nResults saved to: {OUT_PATH}")


if __name__ == "__main__":
    main()
