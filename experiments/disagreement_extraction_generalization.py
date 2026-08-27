"""Does conclusion extraction generalize, or is it a DEBATE-format trick?

`DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md` §5.5 found that supplying each
agent's concluding assertion instead of its whole turn lifts recall 0.00 -> 0.60
at 0% false positives on the DEBATE corpus. §9 flagged the obvious threat: every
DEBATE config mandates an "A) Yes / B) No" answer marker, and the extraction rule
keys on it. Real agent traces have no such marker.

THIS SCRIPT TESTS THAT THREAT DIRECTLY, on a corpus with no answer markers.

CORPUS. `siddharthmb/multiagent-verification-failure-modes` (CC-BY-NC-4.0):
a Qwen3-32B "verifier" directs four Qwen3-8B evidence-holding "subagents" over
AVeriTeC claims. Chosen because it satisfies what DEBATE could not:

  - real distinct agent identities (subagents 1-4, different evidence partitions)
  - shared task context (one claim per episode)
  - natural free-form prose, NO mandated answer format
  - retrieval/tool structure (`hits` with URLs) -- absent from DEBATE entirely
  - disagreement arises from differing evidence, not adversarial role assignment

The last point matters. A corpus where two agents are *assigned* opposing roles
would guarantee positives by construction and prove nothing about detection.

THE FORMAT SHIFT THIS EXERCISES. DEBATE answers end with their conclusion.
These answers OPEN with it ("Yes, several Trump administration statements
explicitly classified..."). The extraction rule, finding no answer marker, falls
back to the last two sentences -- which on this corpus is the wrong end of the
text. That is the hypothesis under test, and the rule is imported UNMODIFIED so
it cannot be quietly adapted to fit.

MEASURES
  extraction success     did the rule return a non-empty span shorter than input
  extraction correctness does the span actually carry the agent's assertion
                         (labelled blind, per output, independent of detection)
  contradiction detection recall on independently labelled contradicting pairs
  false positives        on controls drawn at natural prevalence

BLINDING. Stage `sample` writes a blinded file and a separate key. The annotator
sees the claim, the two questions and the two answers -- never `holds_gold`, the
sampling stratum, the extracted spans, or any detector output. Stage `score`
runs only after labels are frozen.

NO TUNING. `conclusion_only` is imported from the formulation diagnosis. If it
performs badly here that is the result, not a bug to be patched.

Usage:
    python experiments/disagreement_extraction_generalization.py --stage sample
    (label the blinded file)
    python experiments/disagreement_extraction_generalization.py --stage score
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent))

RESULTS = Path(__file__).parent / "results"
SHARD = Path(r"C:\Users\somna\AppData\Local\Temp\mav_shard0.jsonl")
BLINDED_PATH = RESULTS / "extraction_generalization_blinded.json"
KEY_PATH = RESULTS / "extraction_generalization_key.json"
LABELS_PATH = RESULTS / "extraction_generalization_labels.json"
OUT_PATH = RESULTS / "extraction_generalization_results.json"

DATASET_ID = "siddharthmb/multiagent-verification-failure-modes"
DATASET_URL = f"https://huggingface.co/datasets/{DATASET_ID}"
SEED = 20260827
N_ENRICHED = 20
N_CONTROL = 20
MIN_ANSWER_CHARS = 120


def load_pairs() -> list[dict]:
    if not SHARD.exists():
        raise SystemExit(f"ABORT: shard not found at {SHARD}")
    pairs = []
    for line in SHARD.open(encoding="utf-8"):
        episode = json.loads(line)
        # One answer per subagent: its FIRST response, so a pair is two distinct
        # agents rather than one agent revised across rounds.
        subs: dict[str, dict] = {}
        for rd in episode.get("rounds", []):
            sa = rd.get("subagent") or {}
            answer = (sa.get("answer") or "").strip()
            agent = str(sa.get("agent") or "")
            if not agent or len(answer) < MIN_ANSWER_CHARS or agent in subs:
                continue
            subs[agent] = {
                "agent_id": f"subagent_{agent}",
                "answer": answer,
                "question": ((rd.get("action") or {}).get("question") or "").strip(),
                "holds_gold": bool(sa.get("holds_gold")),
                "partition": sa.get("partition"),
                "n_hits": len(sa.get("hits") or []),
            }
        for a, b in combinations(sorted(subs), 2):
            pairs.append({
                "episode_id": episode.get("episode_id"),
                "claim_text": episode.get("claim_text"),
                "gold_label": episode.get("gold_label"),
                "variant": episode.get("variant"),
                "a": subs[a], "b": subs[b],
                # Enrichment signal: one agent holds the gold evidence and the
                # other does not. Used ONLY for sampling, never as a label.
                "gold_asymmetry": subs[a]["holds_gold"] != subs[b]["holds_gold"],
            })
    return pairs


def stage_sample() -> None:
    rng = random.Random(SEED)
    pairs = load_pairs()
    enriched_pool = [p for p in pairs if p["gold_asymmetry"]]
    print(f"pairs available: {len(pairs)}  (gold-asymmetric: {len(enriched_pool)})")

    enriched = rng.sample(enriched_pool, min(N_ENRICHED, len(enriched_pool)))
    chosen = {id(p) for p in enriched}
    controls = rng.sample([p for p in pairs if id(p) not in chosen],
                          min(N_CONTROL, len(pairs) - len(chosen)))
    sample = ([{"stratum": "gold_asymmetric", **p} for p in enriched]
              + [{"stratum": "control", **p} for p in controls])
    rng.shuffle(sample)

    blinded, key = [], []
    for index, pair in enumerate(sample, start=1):
        case_id = f"G{index:03d}"
        blinded.append({
            "case_id": case_id,
            "claim_under_verification": pair["claim_text"],
            "agent_a": {"name": pair["a"]["agent_id"],
                        "was_asked": pair["a"]["question"],
                        "answer": pair["a"]["answer"]},
            "agent_b": {"name": pair["b"]["agent_id"],
                        "was_asked": pair["b"]["question"],
                        "answer": pair["b"]["answer"]},
        })
        key.append({
            "case_id": case_id, "stratum": pair["stratum"],
            "episode_id": pair["episode_id"], "variant": pair["variant"],
            "gold_label": pair["gold_label"], "gold_asymmetry": pair["gold_asymmetry"],
            "a": {k: pair["a"][k] for k in ("agent_id", "holds_gold", "partition", "n_hits")},
            "b": {k: pair["b"][k] for k in ("agent_id", "holds_gold", "partition", "n_hits")},
        })

    RESULTS.mkdir(parents=True, exist_ok=True)
    BLINDED_PATH.write_text(json.dumps({
        "instructions": (
            "TWO independent labels per case, from this file only.\n"
            "(1) contradiction: do agent_a.answer and agent_b.answer assert things "
            "that cannot both be true about the claim? Answering different questions "
            "is NOT a contradiction. Differing detail or hedging is NOT a "
            "contradiction. Label CONTRADICTION / NO_CONTRADICTION / UNCLEAR.\n"
            "(2) assertion_span: quote the sentence(s) in EACH answer that carry that "
            "agent's main assertion. This is recorded to check, separately, whether "
            "the automatic extractor finds the same span."),
        "cases": blinded,
    }, indent=2), encoding="utf-8")
    KEY_PATH.write_text(json.dumps({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "dataset": {"id": DATASET_ID, "url": DATASET_URL, "license": "CC-BY-NC-4.0",
                    "shard": "episodes/exp1/shard_0000.jsonl"},
        "purpose": "test whether conclusion extraction generalizes beyond DEBATE's answer markers",
        "seed": SEED,
        "pairs_available": len(pairs),
        "enriched_pool": len(enriched_pool),
        "blinding": [
            "holds_gold / sampling stratum withheld from the blinded file",
            "extracted spans withheld -- annotator marks the assertion independently",
            "detector not run before labels are frozen",
            "pairs shuffled so ordering cannot encode the stratum",
        ],
        "cases": key,
    }, indent=2), encoding="utf-8")
    print(f"  wrote {len(blinded)} blinded cases -> {BLINDED_PATH}")
    print(f"  key (do not open until labelled) -> {KEY_PATH}")


def stage_score() -> None:
    from app.services.disagreement import RELEVANCE_FLOOR, evaluate_inter_agent_disagreement
    from app.services.grounding import load_models, models_loaded
    from disagreement_formulation_diagnosis import conclusion_only
    from disagreement_truncation_diagnosis import THRESHOLD

    if not LABELS_PATH.exists():
        raise SystemExit(f"ABORT: labels not found at {LABELS_PATH}. Label first.")

    print("Loading models...")
    load_models(sync=True)
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not all(loaded.values()):
        raise SystemExit(f"ABORT: models not all loaded ({loaded}).")
    guard = evaluate_inter_agent_disagreement(
        "a", "The migration completed successfully with no errors.",
        "b", "The migration failed and was rolled back.", threshold=THRESHOLD)
    if guard is None:
        raise SystemExit("ABORT: detector returned None on a known-contradictory pair.")
    print(f"  guard OK — contradiction={guard.contradiction_prob:.3f}")

    blinded = {c["case_id"]: c for c in
               json.loads(BLINDED_PATH.read_text(encoding="utf-8"))["cases"]}
    key = {c["case_id"]: c for c in json.loads(KEY_PATH.read_text(encoding="utf-8"))["cases"]}
    labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))

    contradiction = labels["contradiction"]
    spans = labels["assertion_spans"]

    per_case = []
    for case_id, case in blinded.items():
        a_text, b_text = case["agent_a"]["answer"], case["agent_b"]["answer"]
        a_cut, b_cut = conclusion_only(a_text), conclusion_only(b_text)
        truth = contradiction[case_id] == "CONTRADICTION"

        record = {
            "case_id": case_id, "label": contradiction[case_id],
            "is_contradiction": truth, "stratum": key[case_id]["stratum"],
            "a_chars": len(a_text), "b_chars": len(b_text),
            "a_extracted_chars": len(a_cut), "b_extracted_chars": len(b_cut),
            # Extraction SUCCESS: rule returned a proper non-empty subset.
            "a_extraction_succeeded": bool(a_cut) and len(a_cut) < len(a_text),
            "b_extraction_succeeded": bool(b_cut) and len(b_cut) < len(b_text),
            # Extraction CORRECTNESS: does the span overlap the assertion the
            # annotator marked independently, before seeing any extraction?
            "a_extraction_correct": _overlaps(a_cut, spans[case_id]["a"]),
            "b_extraction_correct": _overlaps(b_cut, spans[case_id]["b"]),
            "a_extracted": a_cut[:300], "b_extracted": b_cut[:300],
            "conditions": {},
        }
        for name, (premise, hypothesis) in {
            "forward": (a_text, b_text),
            "conclusion": (a_cut, b_cut),
            "conclusion_reversed": (b_cut, a_cut),
        }.items():
            result = evaluate_inter_agent_disagreement(
                "agent_p", premise, "agent_h", hypothesis, threshold=THRESHOLD)
            record["conditions"][name] = {
                "contradiction_prob": result.contradiction_prob if result else None,
                "similarity": result.semantic_similarity if result else None,
                "gated": bool(result.gated_low_relevance) if result else None,
                "alarm": bool(result.is_disagreement) if result else False,
            }
        per_case.append(record)

    n_pos = sum(r["is_contradiction"] for r in per_case)
    n_neg = len(per_case) - n_pos
    extraction = {
        "outputs_total": 2 * len(per_case),
        "succeeded": sum(r["a_extraction_succeeded"] + r["b_extraction_succeeded"]
                         for r in per_case),
        "correct": sum(r["a_extraction_correct"] + r["b_extraction_correct"]
                       for r in per_case),
    }
    extraction["success_rate"] = round(extraction["succeeded"] / extraction["outputs_total"], 4)
    extraction["correctness_rate"] = round(extraction["correct"] / extraction["outputs_total"], 4)

    summary = {}
    for condition in ("forward", "conclusion", "conclusion_reversed"):
        tp = sum(1 for r in per_case if r["is_contradiction"] and r["conditions"][condition]["alarm"])
        fn = sum(1 for r in per_case if r["is_contradiction"] and not r["conditions"][condition]["alarm"])
        fp = sum(1 for r in per_case if not r["is_contradiction"] and r["conditions"][condition]["alarm"])
        tn = n_neg - fp
        probs = [r["conditions"][condition]["contradiction_prob"] or 0.0
                 for r in per_case if r["is_contradiction"]]
        summary[condition] = {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "recall": round(tp / n_pos, 4) if n_pos else None,
            "fp_rate": round(fp / n_neg, 4) if n_neg else None,
            "mean_contradiction_prob_on_positives": round(sum(probs) / len(probs), 4) if probs else None,
            "max_contradiction_prob_on_positives": round(max(probs), 4) if probs else None,
        }

    print("\n" + "-" * 78)
    print(f"EXTRACTION  ({extraction['outputs_total']} agent outputs)")
    print("-" * 78)
    print(f"  success rate     {extraction['success_rate']:.2%}  "
          f"({extraction['succeeded']}/{extraction['outputs_total']})")
    print(f"  correctness rate {extraction['correctness_rate']:.2%}  "
          f"({extraction['correct']}/{extraction['outputs_total']})")
    print("\n" + "-" * 78)
    print(f"DETECTION  ({n_pos} labelled contradictions, {n_neg} negatives)")
    print("-" * 78)
    print(f"{'condition':22s} {'recall':>7s} {'TP':>3s} {'FN':>3s} {'FP':>3s} {'FPrate':>7s} {'meanP':>8s}")
    for condition, s in summary.items():
        print(f"{condition:22s} {s['recall'] if s['recall'] is not None else float('nan'):>7.2f} "
              f"{s['tp']:>3d} {s['fn']:>3d} {s['fp']:>3d} "
              f"{s['fp_rate']:>6.1%} {s['mean_contradiction_prob_on_positives'] or 0:>8.4f}")

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "purpose": "generalization test for conclusion extraction on a marker-free corpus",
        "not_a_benchmark": True,
        "production_code_modified": False,
        "dataset": {"id": DATASET_ID, "url": DATASET_URL, "license": "CC-BY-NC-4.0"},
        "detector": {"threshold": THRESHOLD, "relevance_floor": RELEVANCE_FLOOR},
        "extractor": "conclusion_only, imported unmodified from the formulation diagnosis",
        "labelled": {"positives": n_pos, "negatives": n_neg},
        "extraction": extraction,
        "detection": summary,
        "per_case": per_case,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH}")


def _overlaps(extracted: str, annotated: str, min_shared: int = 8) -> bool:
    """Did the extractor land on the span the annotator marked?

    Compared on a normalised word-sequence basis rather than exact string match,
    because the annotator quotes a sentence while the extractor may return it
    with surrounding punctuation or an adjacent clause attached.
    """
    if not extracted or not annotated:
        return False
    ex = " ".join(extracted.lower().split())
    an = " ".join(annotated.lower().split())
    if an in ex or ex in an:
        return True
    an_words = an.split()
    for start in range(0, max(1, len(an_words) - min_shared + 1)):
        if " ".join(an_words[start:start + min_shared]) in ex:
            return True
    return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("sample", "score"), required=True)
    args = parser.parse_args()
    if args.stage == "sample":
        stage_sample()
    else:
        stage_score()
