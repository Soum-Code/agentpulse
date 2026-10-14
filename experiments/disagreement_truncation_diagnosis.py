"""Why did the detector score 0/10 on real contradictions? Truncation test.

The alarm-rate pilot found the disagreement detector fires on 1.28% of natural
DEBATE pairs but caught 0 of the 10 independently labelled contradictions from
the feasibility probe. This script tests one hypothesis for that:

    DeBERTa NLI truncates at 512 tokens. DEBATE messages run 500-3000+ chars and
    state their conclusion ("A) Yes" / "B) No") at the END. If truncation drops
    the conclusion, NLI sees only the shared framing -- which genuinely IS the
    same for both agents -- and correctly returns neutral.

THREE CONDITIONS, everything else held fixed (same pairs, same NLI model, same
threshold 0.6, same relevance gate 0.40, same premise/hypothesis direction):

    full        text passed as-is (reproduces the pilot's 0/10)
    first_512   each output cut to its FIRST half-budget of tokens
    last_512    each output cut to its LAST half-budget of tokens

READ THIS BEFORE INTERPRETING "512". The NLI model's 512-token limit applies to
the CONCATENATED pair, not to each output. Giving each output 512 tokens would
produce a 1024-token pair that the model then re-truncates internally, making
the manipulation a no-op. So each output gets HALF the window (255 tokens), and
the pair fits without further truncation. This is the only way "last N tokens"
is actually honoured end-to-end.

NEGATIVE CONTROLS ARE INCLUDED ON PURPOSE. The task asked for the 10 positives.
All 40 probe cases are run, because a recall gain is uninterpretable without the
false-positive count beside it: if last_512 catches 10/10 but also fires on all
30 negatives, truncation did not fix anything, it just lowered the bar.

NOT DONE HERE, deliberately:
  - no threshold tuning
  - no change to disagreement.py or any production file
  - no evaluator or dashboard change
Inputs are manipulated; the detector is called exactly as it ships.

Outputs:
- experiments/results/disagreement_truncation_diagnosis.json
"""

# WHAT THIS FILE IS FOR
# An experiment script, not part of the product. The detector missed all 10 labelled real
# contradictions in the probe. This script tests one guess for why: the NLI model (a model
# that says if one text follows from, contradicts, or is unrelated to another) reads at most
# 512 tokens (a token = a word or a piece of a word), so it may cut off the end of each
# message, where the debaters state their answer. The script re-runs the real detector on the
# same 40 labelled pairs with the text whole, cut to its first part, or cut to its last part.
# For each of the three conditions it counts hits and false alarms, then prints a verdict.
#
# HOW IT FITS IN
# It imports fetch, pick_configs and extract_pairs from disagreement_feasibility_probe.py to
# rebuild the 40 pairs, and the detector and the NLI tokenizer from the backend.
# disagreement_formulation_diagnosis.py imports ANSWER_RE, THRESHOLD, final_answer and
# rebuild_probe_cases from here, and disagreement_extraction_generalization.py imports
# THRESHOLD.

from __future__ import annotations

import json
import random
import re
import sys
import time
from pathlib import Path

# Add backend/ and the repo root to the import path so `from app.services...` works.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# `grounding` is used to reach the NLI tokenizer (grounding._nli_tokenizer) that the
# detector itself uses, so token counts here match what the model sees.
from app.services import grounding  # noqa: E402
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
OUT_PATH = RESULTS / "disagreement_truncation_diagnosis.json"
KEY_PATH = RESULTS / "disagreement_probe_key.json"
LABELS_PATH = RESULTS / "disagreement_probe_labels.json"

# THRESHOLD: the contradiction probability at which the detector raises an alarm. 0.6 is
# also the default of evaluate_inter_agent_disagreement.
# MODEL_MAX_TOKENS: the most tokens the NLI model reads from premise + hypothesis together
# (the same number as MAX_NLI_TOKENS in grounding.py).
THRESHOLD = 0.6
MODEL_MAX_TOKENS = 512
# Half the window per output, minus room for [CLS]/[SEP]/[SEP].
# That is (512 - 3) // 2 = 254 tokens per output. (The module docstring says 255; the code
# gives 254.)
PER_OUTPUT_BUDGET = (MODEL_MAX_TOKENS - 3) // 2

# The final-answer marker these tasks emit. Used only to report WHERE the
# conclusion sits, never to make a prediction.
# The pattern matches "A)" or "B)" followed by Yes or No (any letter case, optional spaces
# in between), as whole words. Example: "A) Yes".
ANSWER_RE = re.compile(r"\b([AB])\)\s*(Yes|No)\b", re.I)


# Loads the NLI and embedding models and checks they work. Stops the script with "ABORT" if
# a model did not load or the detector cannot score a pair.
def guard_models() -> None:
    # Step 1: load the models (sync=True waits until they are ready), then check all loaded.
    load_models(sync=True)
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not all(loaded.values()):
        raise SystemExit(f"ABORT: models not all loaded ({loaded}).")
    # Step 2: sanity check on an obvious contradiction. A None result means the detector
    # cannot score pairs at all, so all later numbers would be meaningless.
    probe = evaluate_inter_agent_disagreement(
        "a", "The migration completed successfully with no errors.",
        "b", "The migration failed and was rolled back.", threshold=THRESHOLD)
    if probe is None:
        raise SystemExit("ABORT: detector returned None on a known-contradictory pair.")
    print(f"  guard OK — probe contradiction={probe.contradiction_prob:.3f} "
          f"flagged={probe.is_disagreement}")


def rebuild_probe_cases() -> list[dict]:
    """Replay the feasibility probe's exact 40 pairs from its recorded seed.

    Verified elsewhere to reproduce all 40 cases identically (personas,
    solutions and group all match the key file), so labels align by index.
    """
    # Step 1: read the seed that the probe saved in its key file and start a random generator
    # from it, then pick the same configs the probe picked.
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    rng = random.Random(key["seed"])
    configs = pick_configs(rng)
    # Step 2: download the first 20 rows of each config again and rebuild all pairs. Unlike
    # the probe, a failed download stops the run here: the replay must match the probe.
    pairs = []
    for config in configs:
        try:
            payload = fetch(ROWS_API, {"dataset": DATASET_ID, "config": config,
                                       "split": "train", "offset": 0, "length": 20})
        except Exception as exc:
            raise SystemExit(f"ABORT: could not refetch {config}: {exc}")
        for item in payload.get("rows", []):
            pairs.extend(extract_pairs(item["row"], config, item.get("row_idx", -1)))
    # Step 3: repeat the probe's draw in the same order: up to 20 mismatch pairs, then up to
    # 20 other pairs, then the same shuffle. With the random generator in the same state and
    # the same downloaded rows, the same 40 pairs come out in the same order (Step 4 checks).
    mismatch_pool = [p for p in pairs if p["solution_mismatch"]]
    mismatch_sample = rng.sample(mismatch_pool, min(20, len(mismatch_pool)))
    chosen = {id(p) for p in mismatch_sample}
    control_pool = [p for p in pairs if id(p) not in chosen]
    control_sample = rng.sample(control_pool, min(20, len(control_pool)))
    replay = ([{"group": "mismatch", **p} for p in mismatch_sample]
              + [{"group": "control", **p} for p in control_sample])
    rng.shuffle(replay)

    # Step 4: check each replayed pair against the key file (both personas and the group must
    # match, by position).
    # Fail loudly rather than silently scoring misaligned labels.
    for index, pair in enumerate(replay, start=1):
        recorded = key["cases"][index - 1]
        if (recorded["a"]["persona"] != pair["a"]["persona"]
                or recorded["b"]["persona"] != pair["b"]["persona"]
                or recorded["group"] != pair["group"]):
            raise SystemExit(
                f"ABORT: replay diverged at P{index:03d}. Labels would be "
                "attached to the wrong pairs.")
    return replay


# In: a text and a mode: "full", "first_512" or "last_512". Out: the text itself, or a
# shortened copy. (The names say 512, but each output keeps PER_OUTPUT_BUDGET tokens.)
def truncate(text: str, mode: str) -> str:
    """Cut text to PER_OUTPUT_BUDGET tokens from the front or the back."""
    # "full" changes nothing.
    if mode == "full":
        return text
    # Turn the text into token ids with the same tokenizer the detector uses (no special
    # start/end tokens). If it already fits the budget, return it unchanged.
    tokenizer = grounding._nli_tokenizer  # read-only; no production change
    ids = tokenizer(text, add_special_tokens=False)["input_ids"]
    if len(ids) <= PER_OUTPUT_BUDGET:
        return text
    # Keep the first or the last PER_OUTPUT_BUDGET ids, and turn them back into text.
    kept = ids[:PER_OUTPUT_BUDGET] if mode == "first_512" else ids[-PER_OUTPUT_BUDGET:]
    return tokenizer.decode(kept, skip_special_tokens=True)


# In: an agent's text. Out: its final answer written like "A) Yes" (the LAST marker in the
# text), or None if the text has no marker.
def final_answer(text: str) -> str | None:
    matches = ANSWER_RE.findall(text or "")
    if not matches:
        return None
    letter, word = matches[-1]
    return f"{letter.upper()}) {word.capitalize()}"


# Runs the whole test: no input. It reads the probe key and the human labels from
# experiments/results/, downloads the rows again, scores all 40 pairs under each condition,
# prints a table and a verdict, and saves a JSON file.
def main() -> None:
    print("=" * 78)
    print("TRUNCATION DIAGNOSIS — does the 512-token window explain 0/10?")
    print("=" * 78)
    print(f"\nthreshold={THRESHOLD}  relevance_floor={RELEVANCE_FLOOR}  "
          f"per-output budget={PER_OUTPUT_BUDGET} tokens")
    # Step 1: load and check the models.
    print("\nLoading models...")
    guard_models()

    # Step 2: rebuild the 40 probe pairs and read the human labels (case id -> label such
    # as CONTRADICTION). Pair number n gets the id P001, P002, ... so labels line up by
    # position.
    print("\nRebuilding the 40 frozen probe pairs...")
    cases = rebuild_probe_cases()
    labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))["labels"]
    print(f"  {len(cases)} cases rebuilt and verified against the key")

    tokenizer = grounding._nli_tokenizer
    conditions = ("full", "first_512", "last_512")
    per_case, started = [], time.time()

    # Step 3: for each pair, record its size in tokens and its final answers, then run the
    # detector once per condition.
    for index, pair in enumerate(cases, start=1):
        case_id = f"P{index:03d}"
        truth = labels[case_id] == "CONTRADICTION"
        a_text, b_text = pair["a"]["message"], pair["b"]["message"]
        a_ids = len(tokenizer(a_text, add_special_tokens=False)["input_ids"])
        b_ids = len(tokenizer(b_text, add_special_tokens=False)["input_ids"])

        record = {
            "case_id": case_id,
            "label": labels[case_id],
            "is_contradiction": truth,
            "group": pair["group"],
            "a_persona": pair["a"]["persona"], "b_persona": pair["b"]["persona"],
            "a_chars": len(a_text), "b_chars": len(b_text),
            "a_tokens": a_ids, "b_tokens": b_ids,
            "a_exceeds_budget": a_ids > PER_OUTPUT_BUDGET,
            "b_exceeds_budget": b_ids > PER_OUTPUT_BUDGET,
            "a_final_answer": final_answer(a_text),
            "b_final_answer": final_answer(b_text),
            "conditions": {},
        }

        # Cut both texts as the condition says, then call the detector. It may return None
        # (could not check the pair); then the numbers are stored as None, the alarm as False.
        # contradiction_prob = NLI chance of contradiction; similarity = how close the two
        # meanings are; gated = True if the pair was treated as off-topic and never flagged;
        # alarm = the detector flagged the pair.
        for condition in conditions:
            a_cut, b_cut = truncate(a_text, condition), truncate(b_text, condition)
            result = evaluate_inter_agent_disagreement(
                pair["a"]["agent_id"], a_cut,
                pair["b"]["agent_id"], b_cut, threshold=THRESHOLD)
            record["conditions"][condition] = {
                "contradiction_prob": result.contradiction_prob if result else None,
                "similarity": result.semantic_similarity if result else None,
                "gated": bool(result.gated_low_relevance) if result else None,
                "alarm": bool(result.is_disagreement) if result else False,
                # Does the retained window still carry each agent's conclusion?
                # (Compared with the final answer of the full text. If the full text has no
                # marker, both sides are None and count as "retained".)
                "a_answer_retained": final_answer(a_cut) == record["a_final_answer"],
                "b_answer_retained": final_answer(b_cut) == record["b_final_answer"],
            }
        per_case.append(record)
        if index % 10 == 0:
            print(f"  {index}/{len(cases)} scored ({time.time()-started:.0f}s)")

    # --- aggregate -----------------------------------------------------------
    # Step 4: score each condition against the labels.
    #   tp = a real contradiction and an alarm (a hit)
    #   fn = a real contradiction and no alarm (a miss)
    #   fp = not a contradiction but an alarm (a false alarm)
    #   tn = not a contradiction and no alarm
    #   precision = tp / (tp + fp);  recall = tp / (tp + fn)  (each is 0.0 if its bottom is 0)
    #   retained = real contradictions where both cut texts give the same final answer as the
    #              full texts (a text with no marker counts as retained)
    # The "/ 30" and "/ 10" below are the expected counts of non-contradictions and real
    # contradictions among the 40 cases; they are written into the code, not counted.
    summary = {}
    for condition in conditions:
        tp = sum(1 for r in per_case if r["is_contradiction"] and r["conditions"][condition]["alarm"])
        fn = sum(1 for r in per_case if r["is_contradiction"] and not r["conditions"][condition]["alarm"])
        fp = sum(1 for r in per_case if not r["is_contradiction"] and r["conditions"][condition]["alarm"])
        tn = sum(1 for r in per_case if not r["is_contradiction"] and not r["conditions"][condition]["alarm"])
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        retained = sum(1 for r in per_case if r["is_contradiction"]
                       and r["conditions"][condition]["a_answer_retained"]
                       and r["conditions"][condition]["b_answer_retained"])
        summary[condition] = {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "recall_on_10_positives": round(recall, 4),
            "precision": round(precision, 4),
            "false_positive_rate_on_30_negatives": round(fp / 30, 4),
            "positives_with_both_conclusions_retained": retained,
            "mean_contradiction_prob_on_positives": round(
                sum(r["conditions"][condition]["contradiction_prob"] or 0.0
                    for r in per_case if r["is_contradiction"]) / 10, 4),
        }

    print("\n" + "-" * 78)
    print("RESULTS  (10 labelled contradictions, 30 labelled negatives)")
    print("-" * 78)
    print(f"{'condition':12s} {'recall':>8s} {'TP':>4s} {'FN':>4s} {'FP':>4s} "
          f"{'FP rate':>9s} {'mean P(contra)':>15s} {'concl. kept':>12s}")
    for condition in conditions:
        s = summary[condition]
        print(f"{condition:12s} {s['recall_on_10_positives']:>8.2f} {s['tp']:>4d} "
              f"{s['fn']:>4d} {s['fp']:>4d} "
              f"{s['false_positive_rate_on_30_negatives']:>8.1%} "
              f"{s['mean_contradiction_prob_on_positives']:>15.4f} "
              f"{s['positives_with_both_conclusions_retained']:>10d}/10")

    # --- verdict -------------------------------------------------------------
    # Step 5: turn the recall numbers (full_r, first_r, last_r) and the false-positive rate of
    # the last-part run (last_fp, a share of the 30 negatives) into a sentence.
    # The first branch that is true wins:
    #   1. last part recovers recall (>= 0.8), first part does not (<= 0.2), few false
    #      alarms (rate <= 0.2): truncation explains it.
    #   2. last part still has recall <= 0.2: the hypothesis fails.
    #   3. last part beats the full text but with many false alarms (rate > 0.3): a
    #      misleading gain.
    #   4. anything else: partly explained.
    full_r = summary["full"]["recall_on_10_positives"]
    first_r = summary["first_512"]["recall_on_10_positives"]
    last_r = summary["last_512"]["recall_on_10_positives"]
    last_fp = summary["last_512"]["false_positive_rate_on_30_negatives"]

    if last_r >= 0.8 and first_r <= 0.2 and last_fp <= 0.2:
        verdict = ("TRUNCATION EXPLAINS IT. Recall recovers only when the tail of "
                   "each output is retained, and does so without inflating false "
                   "positives.")
    elif last_r <= 0.2:
        verdict = ("TRUNCATION HYPOTHESIS FAILS. Retaining the tail does not "
                   "recover recall; the cause lies in the NLI formulation, pair "
                   "direction, or threshold, not the context window.")
    elif last_r > full_r and last_fp > 0.3:
        verdict = ("INCONCLUSIVE / MISLEADING GAIN. Recall rises but false "
                   "positives rise with it -- truncation lowered the bar rather "
                   "than fixing the signal.")
    else:
        verdict = ("PARTIAL. Truncation contributes but does not fully explain "
                   "the 0/10; other factors remain.")

    print(f"\nVERDICT: {verdict}")

    # Step 6: save the settings, the summary, the verdict and every case to a JSON file.
    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "purpose": "diagnose the 0/10 recall found by the alarm-rate pilot",
        "not_a_benchmark": True,
        "production_code_modified": False,
        "detector": {"threshold": THRESHOLD, "relevance_floor": RELEVANCE_FLOOR,
                     "model_max_tokens": MODEL_MAX_TOKENS,
                     "per_output_budget": PER_OUTPUT_BUDGET},
        "budget_note": (
            "The 512-token limit applies to the concatenated pair, so each output "
            "receives half the window. Passing 512 tokens per output would let the "
            "model re-truncate internally and make the manipulation a no-op."),
        "summary": summary,
        "verdict": verdict,
        "per_case": per_case,
        "limitations": [
            "10 positives, 30 negatives -- indicative, not a benchmark result",
            "single annotator (first-pass labels only), no second judge, no kappa",
            "no threshold tuning and no production change; inputs manipulated only",
        ],
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
