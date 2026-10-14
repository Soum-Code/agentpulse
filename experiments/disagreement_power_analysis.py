"""Sample-size justification for the external disagreement benchmark.

Answers "how many cases do we label?" from the yields measured by the 40-case
feasibility probe, rather than picking a round number.

WHY THIS IS NOT A ONE-LINER. The benchmark reports three things, and they have
very different sample-size requirements:

  recall              -- estimated on labelled POSITIVES; cheap, ~100 is plenty
  precision (enriched)-- estimated on the stratified sample; cheap
  precision (corrected to production prevalence) -- estimated from the detector's
                         FALSE-POSITIVE RATE, and this is the expensive one

The third is the one that describes production, and at the measured prevalence
(~0.54% of agent pairs) it is almost entirely determined by FPR. Halving the
uncertainty on a small FPR costs 4x the negatives. This script quantifies that
trade so the chosen N is a decision rather than a guess.

INPUTS -- all measured, none assumed:
  experiments/results/disagreement_probe_key.json     (yields, base rate)
  experiments/results/disagreement_probe_labels.json  (first-pass labels)

Uncertainty is propagated by Monte Carlo over Beta posteriors rather than by
point estimates, because the prevalence itself is estimated from 40 cases and
carries real uncertainty (10/20 positives inside the mismatch stratum).

Outputs:
- experiments/results/disagreement_power_analysis.json
"""

# WHAT THIS FILE IS FOR
# A planning script, not part of the product. It answers "how many cases must we label for
# the full disagreement benchmark?". It reads what the 40-case probe found (pairs per debate
# row, how many were real contradictions), then uses simple statistics and random simulation
# to show how wide the error bars on recall and precision would be at different sample
# sizes. It prints a recommended design and saves everything as JSON.
# Words used below:
#   recall      the share of real contradictions that the detector catches
#   precision   the share of the detector's alarms that are real contradictions
#   FPR         false-positive rate: the share of non-contradictions it wrongly flags
#   prevalence  the share of all agent pairs that really are contradictions
#   95% CI      a range that should hold the true value in 95 out of 100 repeats
#   half-width  half the width of that range (the "plus or minus" part)
#
# HOW IT FITS IN
# It reads two files that earlier steps made: disagreement_probe_key.json (written by
# disagreement_feasibility_probe.py) and disagreement_probe_labels.json (the human labels).
# It needs only numpy and the standard library; it does not call the detector or any model.

from __future__ import annotations

import json
import math
from pathlib import Path

# numpy is used for the random draws (Beta distributions) and for percentiles.
import numpy as np

RESULTS = Path(__file__).parent / "results"
KEY_PATH = RESULTS / "disagreement_probe_key.json"
LABELS_PATH = RESULTS / "disagreement_probe_labels.json"
OUT_PATH = RESULTS / "disagreement_power_analysis.json"

# RNG: a random generator with a fixed seed, so the simulation gives the same numbers on
# every run. DRAWS: how many random values each simulated quantity gets.
RNG = np.random.default_rng(20260827)
DRAWS = 200_000

# Fraction of cases expected to be dropped when the two judges disagree. The
# tool-claim labelling run reached kappa 0.225 with a much harder taxonomy; this
# is a binary judgement on clearer material, so a 20% loss is the planning
# assumption. It is an ASSUMPTION, not a measurement -- flagged in the output.
JUDGE_EXCLUSION_RATE = 0.20


# 95% confidence range for a rate seen k times in n tries (the "Wilson score" interval).
# z = 1.96 is the usual multiplier for 95%. It behaves better than the textbook formula when
# n is small or the rate is near 0 or 1. Out: (low, high), kept inside 0 and 1. With n = 0
# nothing is known, so it returns the widest range (0, 1).
def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    # centre = the middle of the range (pulled a little toward 0.5); half = how far the
    # range reaches on each side of it.
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


# The formula is p * (1 - p) * (z / target)^2, rounded up. A rate near 0 or 1 needs fewer
# samples than one near 0.5, and halving the target half-width needs 4 times the samples.
def n_for_halfwidth(p: float, target: float, z: float = 1.96) -> int:
    """Samples needed so a proportion near p has CI half-width <= target."""
    return math.ceil(p * (1 - p) * (z / target) ** 2)


# What precision would be in production. prev = prevalence, tpr = true-positive rate (the
# same thing as recall), fpr = false-positive rate. These can be single numbers or arrays
# of simulated draws. Per pair: real contradictions caught = prev * tpr; false alarms =
# (1 - prev) * fpr; precision = caught / (caught + false alarms). NaN where there are no
# alarms at all. This is why precision depends so much on FPR when prevalence is tiny.
def corrected_precision(prev, tpr, fpr):
    num = prev * tpr
    den = num + (1 - prev) * fpr
    return np.where(den > 0, num / den, np.nan)


# Runs the whole analysis: no input. It reads the probe key and labels, prints the tables
# below, and saves experiments/results/disagreement_power_analysis.json.
def main() -> None:
    # Step 1: load the probe key and the human labels; index the key's cases by case id.
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))["labels"]
    by_case = {c["case_id"]: c for c in key["cases"]}

    # Step 2: for each sampling group ("mismatch" and "control"), count its cases and how
    # many of them were labelled CONTRADICTION.
    n_mismatch = sum(1 for c in by_case.values() if c["group"] == "mismatch")
    pos_mismatch = sum(1 for cid, l in labels.items()
                       if by_case[cid]["group"] == "mismatch" and l == "CONTRADICTION")
    n_control = sum(1 for c in by_case.values() if c["group"] == "control")
    pos_control = sum(1 for cid, l in labels.items()
                      if by_case[cid]["group"] == "control" and l == "CONTRADICTION")

    # Step 3: the totals the probe recorded: debate rows read, pairs built from them, and how
    # many of those pairs had a solution mismatch.
    rows = key["rows_read"]
    pairs = key["pairs_extracted"]
    mismatch_avail = key["mismatch_pairs_available"]

    # Yields per debate row. hit_rate = the share of labelled mismatch cases that were real
    # contradictions. positives_per_row = real contradictions found per row on average.
    pairs_per_row = pairs / rows
    mismatch_per_row = mismatch_avail / rows
    hit_rate = pos_mismatch / n_mismatch                 # 10/20
    positives_per_row = mismatch_per_row * hit_rate

    print("=" * 78)
    print("SAMPLE-SIZE JUSTIFICATION — external disagreement benchmark")
    print("=" * 78)
    print(f"\nMEASURED YIELDS (from the {len(labels)}-case probe, {rows} rows)")
    print(f"  pairs per row                 {pairs_per_row:8.2f}")
    print(f"  mismatch pairs per row        {mismatch_per_row:8.4f}")
    print(f"  contradiction rate | mismatch {hit_rate:8.2f}  ({pos_mismatch}/{n_mismatch})")
    print(f"  contradiction rate | control  {pos_control/n_control:8.2f}  ({pos_control}/{n_control})")
    print(f"  genuine positives per row     {positives_per_row:8.4f}")

    # --- prevalence, with uncertainty from BOTH estimated quantities ----------
    # mismatch base rate is measured over 7,582 pairs (tight); the hit rate
    # inside the stratum is measured over 20 (wide). The second dominates.
    # Simulation: instead of one number per rate, draw DRAWS plausible values. A Beta draw
    # with (k + 0.5, n - k + 0.5) gives a plausible rate for something seen k times in n
    # tries (the 0.5 added to each count is a small neutral starting guess). Prevalence =
    # share of pairs with a mismatch x share of mismatch pairs that are real contradictions.
    # Only contradictions inside the mismatch group are counted; any among the other pairs
    # are not added, so this is a floor. The 2.5th, 50th and 97.5th percentiles give a 95%
    # range and the middle value.
    mismatch_rate_draws = RNG.beta(mismatch_avail + 0.5, pairs - mismatch_avail + 0.5, DRAWS)
    hit_rate_draws = RNG.beta(pos_mismatch + 0.5, n_mismatch - pos_mismatch + 0.5, DRAWS)
    prevalence_draws = mismatch_rate_draws * hit_rate_draws
    prev_lo, prev_med, prev_hi = np.percentile(prevalence_draws, [2.5, 50, 97.5])

    print(f"\nPRODUCTION PREVALENCE of genuine contradiction (per agent pair)")
    print(f"  point  {prev_med*100:.3f}%     95% CI [{prev_lo*100:.3f}%, {prev_hi*100:.3f}%]")
    # The enrichment factor = how many times richer in real contradictions a sample that is
    # half contradictions is than natural pairs (0.5 divided by the prevalence).
    print(f"  -> enrichment factor of a 50/50 stratified sample: ~{0.5/prev_med:.0f}x")

    # --- positives needed for a usable recall estimate ------------------------
    # For each wanted half-width (+/- 10, 7.5 and 5 percentage points), how many labelled
    # positives are needed if the true recall is about 0.85. The 0.85 is a planning
    # assumption chosen here, not a measured recall.
    print(f"\nPOSITIVES NEEDED (recall CI, assuming recall ~0.85)")
    recall_plan = {}
    for hw in (0.10, 0.075, 0.05):
        n = n_for_halfwidth(0.85, hw)
        recall_plan[f"halfwidth_{hw:.3f}"] = n
        print(f"  +/-{hw*100:4.1f} points -> {n:4d} labelled positives")

    # --- negatives needed for the FPR that drives corrected precision --------
    # For each assumed true FPR (2%, 1%, 0.5%) and each wanted half-width (1, 0.5 and 0.25
    # percentage points), how many labelled negatives are needed. The FPR values are
    # candidates, not measurements.
    print(f"\nNEGATIVES NEEDED (FPR CI — this is the binding constraint)")
    fpr_plan = {}
    for assumed_fpr in (0.02, 0.01, 0.005):
        row = {}
        for hw in (0.01, 0.005, 0.0025):
            n = n_for_halfwidth(assumed_fpr, hw)
            row[f"halfwidth_{hw}"] = n
        fpr_plan[f"fpr_{assumed_fpr}"] = row
        print(f"  if true FPR ~{assumed_fpr*100:4.1f}%: "
              + "  ".join(f"+/-{h*100:.2f}pp -> {n:5d}" for h, n in
                          zip((0.01, 0.005, 0.0025), row.values())))

    # --- what corrected precision looks like at candidate designs ------------
    print(f"\nCORRECTED PRECISION under candidate designs")
    print(f"  (assumes detector TPR 0.85; shows how wide the answer stays)")
    # A design = (number of labelled positives, number of labelled negatives, a name).
    # For each design and each assumed true FPR, three steps:
    #   a. draw plausible recall values: 85% of n_pos labelled positives are caught
    #   b. draw plausible FPR values: assumed_fpr * n_neg of the n_neg negatives are
    #      flagged (a count that may be a fraction; that is fine for a Beta draw)
    #   c. combine them with the prevalence draws in corrected_precision, then take the
    #      median and the 95% range (np.nanpercentile skips the NaN cases)
    designs = []
    for n_pos, n_neg, label in [(75, 150, "small   (225 labelled)"),
                                (100, 300, "medium  (400 labelled)"),
                                (100, 700, "large   (800 labelled)")]:
        for assumed_fpr in (0.02, 0.005):
            tpr_draws = RNG.beta(0.85 * n_pos + 0.5, 0.15 * n_pos + 0.5, DRAWS)
            k_fp = assumed_fpr * n_neg
            fpr_draws = RNG.beta(k_fp + 0.5, n_neg - k_fp + 0.5, DRAWS)
            prec = corrected_precision(prevalence_draws, tpr_draws, fpr_draws)
            lo, med, hi = np.nanpercentile(prec, [2.5, 50, 97.5])
            designs.append({
                "design": label, "n_positives": n_pos, "n_negatives": n_neg,
                "assumed_true_fpr": assumed_fpr,
                "corrected_precision_median": round(float(med), 4),
                "corrected_precision_ci95": [round(float(lo), 4), round(float(hi), 4)],
            })
            print(f"  {label}  FPR~{assumed_fpr*100:4.1f}%  ->  "
                  f"precision {med:.3f}  95% CI [{lo:.3f}, {hi:.3f}]")

    # --- the alternative that avoids the binding constraint entirely ---------
    # Correcting precision BACKWARDS from a hand-labelled FPR is the wrong
    # instrument: the interval barely responds to sample size (see above).
    # Instead, screen a large pair pool with the detector -- automated, no
    # labelling cost -- and hand-label only the pairs it FIRES on. Those alarms
    # are drawn at natural prevalence, so auditing them measures production
    # precision DIRECTLY, with no correction step and no FPR extrapolation.
    #
    # Recall is unaffected: recall = TP/(TP+FN) is a property of the detector on
    # positives alone and is prevalence-independent, so estimating it from the
    # enriched mismatch stratum stays unbiased.
    print(f"\nALARM-AUDIT DESIGN (measure precision directly, no correction)")
    print(f"  screen pairs with the detector, hand-label only its alarms")
    # For 100, 150 and 200 labelled alarms: suppose the true precision is 20%, so 20% of the
    # alarms are real. wilson() gives the 95% range around that; "widths" is half the width
    # of that range, in percentage points. Then, for assumed alarm rates of 0.5%, 1% and 3%
    # of all pairs, pairs to screen = alarms wanted / alarm rate.
    alarm_audit = []
    for n_alarms in (100, 150, 200):
        lo, hi = wilson(int(0.20 * n_alarms), n_alarms)
        entry = {"alarms_labelled": n_alarms,
                 "precision_ci95_if_true_precision_0.20": [round(lo, 4), round(hi, 4)],
                 "pairs_to_screen_by_alarm_rate": {}}
        widths = f"+/-{(hi-lo)/2*100:4.1f}pp"
        screens = []
        for alarm_rate in (0.005, 0.01, 0.03):
            n_screen = math.ceil(n_alarms / alarm_rate)
            entry["pairs_to_screen_by_alarm_rate"][f"rate_{alarm_rate}"] = n_screen
            screens.append(f"{alarm_rate*100:.1f}%->{n_screen:,}")
        alarm_audit.append(entry)
        print(f"  {n_alarms:3d} alarms  precision CI {widths}   "
              f"pairs to screen: {'  '.join(screens)}")

    # --- recommended design ---------------------------------------------------
    # The chain of sums:
    #   1. want 100 usable positives; some cases will be dropped when the two judges
    #      disagree (JUDGE_EXCLUSION_RATE), so label 100 / (1 - 0.20) = 125 positives
    #   2. only hit_rate of the mismatch pairs are real contradictions, so the number of
    #      mismatch pairs to label = positives to label / hit_rate
    #   3. each debate row gives mismatch_per_row mismatch pairs, so the rows to sample =
    #      mismatch pairs to label / mismatch_per_row
    #   4. add 300 control pairs (a number chosen here) for the negatives
    target_positives = 100
    usable_fraction = 1 - JUDGE_EXCLUSION_RATE
    positives_to_label = math.ceil(target_positives / usable_fraction)
    mismatch_to_label = math.ceil(positives_to_label / hit_rate)
    rows_needed = math.ceil(mismatch_to_label / mismatch_per_row)
    control_negatives = 300
    total_labelled = mismatch_to_label + control_negatives

    print("\n" + "-" * 78)
    print("RECOMMENDED DESIGN")
    print("-" * 78)
    print(f"  target usable positives after judge exclusions   {target_positives}")
    print(f"  judge-exclusion allowance                        {JUDGE_EXCLUSION_RATE:.0%} (ASSUMED)")
    print(f"  positives to label                               {positives_to_label}")
    print(f"  mismatch-stratum pairs to label (@{hit_rate:.0%} hit)     {mismatch_to_label}")
    print(f"  natural-prevalence control pairs to label        {control_negatives}")
    print(f"  TOTAL cases to label (x2 judges)                 {total_labelled}")
    print(f"  DEBATE rows to sample                            {rows_needed}")
    print(f"  (corpus has 14.4K rows — sampling {rows_needed} is ~{rows_needed/14400:.1%})")

    # Save every table and the recommendation, together with the assumptions that are not
    # measurements, so a reader can see what the numbers depend on.
    payload = {
        "purpose": "sample-size justification for the external disagreement benchmark",
        "source_probe": {
            "cases": len(labels), "rows_read": rows, "pairs_extracted": pairs,
            "mismatch_pairs_available": mismatch_avail,
            "mismatch_group": {"n": n_mismatch, "positives": pos_mismatch,
                               "ci95": [round(v, 4) for v in wilson(pos_mismatch, n_mismatch)]},
            "control_group": {"n": n_control, "positives": pos_control,
                              "ci95": [round(v, 4) for v in wilson(pos_control, n_control)]},
        },
        "measured_yields": {
            "pairs_per_row": round(pairs_per_row, 4),
            "mismatch_pairs_per_row": round(mismatch_per_row, 6),
            "contradiction_rate_given_mismatch": round(hit_rate, 4),
            "genuine_positives_per_row": round(positives_per_row, 6),
        },
        "production_prevalence": {
            "median": round(float(prev_med), 6),
            "ci95": [round(float(prev_lo), 6), round(float(prev_hi), 6)],
            "enrichment_of_balanced_sample": round(float(0.5 / prev_med), 1),
            "note": "dominated by the 10/20 hit-rate estimate, not the base rate",
        },
        "positives_needed_for_recall_ci": recall_plan,
        "negatives_needed_for_fpr_ci": fpr_plan,
        "corrected_precision_under_designs": designs,
        "alarm_audit_design": alarm_audit,
        "recommended_design": {
            "rows_to_sample": rows_needed,
            "mismatch_pairs_to_label": mismatch_to_label,
            "control_pairs_to_label": control_negatives,
            "total_cases_to_label": total_labelled,
            "labelling_passes": 2,
            "target_usable_positives": target_positives,
            "judge_exclusion_allowance": JUDGE_EXCLUSION_RATE,
        },
        "assumptions_not_measurements": [
            f"judge-disagreement exclusion rate {JUDGE_EXCLUSION_RATE:.0%} — planning "
            "assumption; the actual rate is only known after the Qwen3-8B pass",
            "detector TPR ~0.85 used only to illustrate corrected-precision width",
            "FPR values are candidates, not estimates — the detector has never been "
            "run on this corpus",
        ],
        "binding_constraint": (
            "Corrected precision is driven by FPR, not by the positive count. "
            "Labelling more positives does not narrow it."),
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
