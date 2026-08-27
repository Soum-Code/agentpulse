"""Truncation failed. Is it the pair DIRECTION, or the NLI FORMULATION?

The truncation diagnosis ruled out the context window: the 10 labelled external
contradictions score a maximum contradiction probability of 0.0414 across full,
first-512 and last-512 conditions, against a 0.6 threshold. Short pairs fail too
(P004 at 83/66 tokens scores 0.0105), so length is not the variable.

Two candidates remain from the pre-agreed list. Threshold is already excluded --
no threshold in (0, 0.6] separates 0.0414 from the negatives without firing on
everything -- so this script tests the other two:

  reversed      swap premise and hypothesis. NLI is directional, and the
                production path fixes the earlier agent as premise via
                itertools.combinations. If disagreement is only visible in the
                other direction, that is a formulation bug with a cheap fix.

  conclusion    give NLI only each agent's CONCLUDING sentence instead of its
                full discursive output. This separates two very different
                diagnoses:
                  - if recall recovers, the NLI model can judge the proposition
                    and the gap is a missing claim-extraction step
                  - if it does not, NLI is the wrong instrument for this task

  conclusion_reversed   both manipulations together.

WHY CONCLUSION EXTRACTION IS MECHANICAL, NOT AUTHORED. Hand-writing a "core
claim" for each case would inject the annotator's judgement into the detector's
input and manufacture a favourable result. Instead the rule is purely
positional: locate the final answer marker the task itself requires
("A) Yes" / "B) No") and keep the sentence containing it. Where no marker
exists, keep the last two sentences. No rewriting, no paraphrase.

NEGATIVE CONTROLS. All 40 probe cases run in every condition. A recall gain that
arrives with a false-positive surge is not a fix, and cannot be spotted without
the 30 negatives.

NOT DONE HERE: no threshold tuning, no change to disagreement.py or any
production file, no evaluator or dashboard change. Inputs are manipulated; the
detector is called exactly as it ships.

Outputs:
- experiments/results/disagreement_formulation_diagnosis.json
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.disagreement import (  # noqa: E402
    RELEVANCE_FLOOR,
    evaluate_inter_agent_disagreement,
)
from app.services.grounding import load_models, models_loaded  # noqa: E402

from disagreement_truncation_diagnosis import (  # noqa: E402
    ANSWER_RE,
    THRESHOLD,
    final_answer,
    rebuild_probe_cases,
)

RESULTS = Path(__file__).parent / "results"
OUT_PATH = RESULTS / "disagreement_formulation_diagnosis.json"
LABELS_PATH = RESULTS / "disagreement_probe_labels.json"

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def conclusion_only(text: str) -> str:
    """Positional extraction of the concluding assertion. No paraphrase."""
    sentences = [s.strip() for s in SENTENCE_SPLIT.split(text or "") if s.strip()]
    if not sentences:
        return text
    for index in range(len(sentences) - 1, -1, -1):
        if ANSWER_RE.search(sentences[index]):
            return sentences[index]
    return " ".join(sentences[-2:])


def main() -> None:
    print("=" * 78)
    print("FORMULATION DIAGNOSIS — pair direction and claim extraction")
    print("=" * 78)
    print(f"\nthreshold={THRESHOLD}  relevance_floor={RELEVANCE_FLOOR}")
    print("\nLoading models...")
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

    print("\nRebuilding the 40 frozen probe pairs...")
    cases = rebuild_probe_cases()
    labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))["labels"]
    print(f"  {len(cases)} cases rebuilt and verified")

    conditions = ("forward", "reversed", "conclusion", "conclusion_reversed")
    per_case, started = [], time.time()

    for index, pair in enumerate(cases, start=1):
        case_id = f"P{index:03d}"
        a_text, b_text = pair["a"]["message"], pair["b"]["message"]
        a_concl, b_concl = conclusion_only(a_text), conclusion_only(b_text)

        record = {
            "case_id": case_id, "label": labels[case_id],
            "is_contradiction": labels[case_id] == "CONTRADICTION",
            "a_conclusion": a_concl[:300], "b_conclusion": b_concl[:300],
            "a_conclusion_chars": len(a_concl), "b_conclusion_chars": len(b_concl),
            "a_final_answer": final_answer(a_text), "b_final_answer": final_answer(b_text),
            "conditions": {},
        }

        variants = {
            "forward": (a_text, b_text),
            "reversed": (b_text, a_text),
            "conclusion": (a_concl, b_concl),
            "conclusion_reversed": (b_concl, a_concl),
        }
        for name, (premise, hypothesis) in variants.items():
            result = evaluate_inter_agent_disagreement(
                "agent_p", premise, "agent_h", hypothesis, threshold=THRESHOLD)
            record["conditions"][name] = {
                "contradiction_prob": result.contradiction_prob if result else None,
                "similarity": result.semantic_similarity if result else None,
                "gated": bool(result.gated_low_relevance) if result else None,
                "alarm": bool(result.is_disagreement) if result else False,
            }
        per_case.append(record)
        if index % 10 == 0:
            print(f"  {index}/{len(cases)} scored ({time.time()-started:.0f}s)")

    summary = {}
    for condition in conditions:
        tp = sum(1 for r in per_case if r["is_contradiction"] and r["conditions"][condition]["alarm"])
        fn = sum(1 for r in per_case if r["is_contradiction"] and not r["conditions"][condition]["alarm"])
        fp = sum(1 for r in per_case if not r["is_contradiction"] and r["conditions"][condition]["alarm"])
        tn = sum(1 for r in per_case if not r["is_contradiction"] and not r["conditions"][condition]["alarm"])
        probs = [r["conditions"][condition]["contradiction_prob"] or 0.0
                 for r in per_case if r["is_contradiction"]]
        summary[condition] = {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "recall": round(tp / max(tp + fn, 1), 4),
            "precision": round(tp / max(tp + fp, 1), 4) if (tp + fp) else None,
            "fp_rate_on_30_negatives": round(fp / 30, 4),
            "mean_contradiction_prob_on_positives": round(sum(probs) / len(probs), 4),
            "max_contradiction_prob_on_positives": round(max(probs), 4),
        }

    print("\n" + "-" * 78)
    print("RESULTS  (10 labelled contradictions, 30 labelled negatives)")
    print("-" * 78)
    print(f"{'condition':22s} {'recall':>7s} {'TP':>3s} {'FN':>3s} {'FP':>3s} "
          f"{'FPrate':>7s} {'meanP':>8s} {'maxP':>8s}")
    for condition in conditions:
        s = summary[condition]
        print(f"{condition:22s} {s['recall']:>7.2f} {s['tp']:>3d} {s['fn']:>3d} "
              f"{s['fp']:>3d} {s['fp_rate_on_30_negatives']:>6.1%} "
              f"{s['mean_contradiction_prob_on_positives']:>8.4f} "
              f"{s['max_contradiction_prob_on_positives']:>8.4f}")

    fwd, rev = summary["forward"]["recall"], summary["reversed"]["recall"]
    # Take the BEST extraction variant, not just the forward one. An earlier
    # version of this logic checked `conclusion` alone, missed that
    # `conclusion_reversed` scored higher, and emitted a "wrong instrument"
    # verdict that the data did not support.
    best_extraction = max(("conclusion", "conclusion_reversed"),
                          key=lambda c: (summary[c]["recall"],
                                         -summary[c]["fp_rate_on_30_negatives"]))
    con = summary[best_extraction]["recall"]
    con_fp = summary[best_extraction]["fp_rate_on_30_negatives"]

    if con >= 0.7 and con_fp <= 0.2:
        verdict = ("CLAIM EXTRACTION IS THE GAP. NLI judges these contradictions "
                   "correctly once given the concluding assertion instead of the "
                   "full discursive output. The detector is missing a claim-"
                   "extraction stage, not a better NLI model.")
    elif con >= 0.7 and con_fp > 0.2:
        verdict = ("MISLEADING GAIN. Conclusion-only recovers recall but fires on "
                   "negatives too -- it lowers the bar rather than isolating the claim.")
    elif rev > fwd + 0.3:
        verdict = ("PAIR DIRECTION MATTERS. Disagreement is visible mainly in the "
                   "reverse orientation, which the production all-pairs path never "
                   "evaluates.")
    elif con >= 0.4 and con > fwd:
        verdict = (f"CLAIM EXTRACTION IS THE DOMINANT FACTOR, PARTIALLY. Best "
                   f"variant '{best_extraction}' lifts recall {fwd:.2f} -> {con:.2f} "
                   f"at {con_fp:.0%} false positives. The production path's failure "
                   "is feeding NLI whole discursive turns rather than the asserted "
                   "claim. Not a full fix: misses remain on hedged conclusions "
                   "whose caveats agree.")
    else:
        verdict = ("NLI IS THE WRONG INSTRUMENT HERE. Neither direction nor claim "
                   "extraction recovers recall: entailment-style NLI does not "
                   "capture how real agents express disagreement.")

    print(f"\nVERDICT: {verdict}")

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "purpose": "localize the cause of 0/10 recall after truncation was ruled out",
        "not_a_benchmark": True,
        "production_code_modified": False,
        "detector": {"threshold": THRESHOLD, "relevance_floor": RELEVANCE_FLOOR},
        "conclusion_extraction_rule": (
            "positional only: keep the sentence containing the final "
            "'A) Yes'/'B) No' marker, else the last two sentences. No paraphrase."),
        "summary": summary,
        "verdict": verdict,
        "per_case": per_case,
        "limitations": [
            "10 positives, 30 negatives -- diagnostic, not a benchmark result",
            "single annotator (first-pass labels), no second judge, no kappa",
            "conclusion extraction relies on this corpus's mandated answer marker "
            "and would not transfer as-is to traces without one",
        ],
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
