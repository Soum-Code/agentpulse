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

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

RESULTS = Path(__file__).parent / "results"
KEY_PATH = RESULTS / "disagreement_probe_key.json"
LABELS_PATH = RESULTS / "disagreement_probe_labels.json"
OUT_PATH = RESULTS / "disagreement_power_analysis.json"

RNG = np.random.default_rng(20260827)
DRAWS = 200_000

# Fraction of cases expected to be dropped when the two judges disagree. The
# tool-claim labelling run reached kappa 0.225 with a much harder taxonomy; this
# is a binary judgement on clearer material, so a 20% loss is the planning
# assumption. It is an ASSUMPTION, not a measurement -- flagged in the output.
JUDGE_EXCLUSION_RATE = 0.20


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


def n_for_halfwidth(p: float, target: float, z: float = 1.96) -> int:
    """Samples needed so a proportion near p has CI half-width <= target."""
    return math.ceil(p * (1 - p) * (z / target) ** 2)


def corrected_precision(prev, tpr, fpr):
    num = prev * tpr
    den = num + (1 - prev) * fpr
    return np.where(den > 0, num / den, np.nan)


def main() -> None:
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))["labels"]
    by_case = {c["case_id"]: c for c in key["cases"]}

    n_mismatch = sum(1 for c in by_case.values() if c["group"] == "mismatch")
    pos_mismatch = sum(1 for cid, l in labels.items()
                       if by_case[cid]["group"] == "mismatch" and l == "CONTRADICTION")
    n_control = sum(1 for c in by_case.values() if c["group"] == "control")
    pos_control = sum(1 for cid, l in labels.items()
                      if by_case[cid]["group"] == "control" and l == "CONTRADICTION")

    rows = key["rows_read"]
    pairs = key["pairs_extracted"]
    mismatch_avail = key["mismatch_pairs_available"]

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
    mismatch_rate_draws = RNG.beta(mismatch_avail + 0.5, pairs - mismatch_avail + 0.5, DRAWS)
    hit_rate_draws = RNG.beta(pos_mismatch + 0.5, n_mismatch - pos_mismatch + 0.5, DRAWS)
    prevalence_draws = mismatch_rate_draws * hit_rate_draws
    prev_lo, prev_med, prev_hi = np.percentile(prevalence_draws, [2.5, 50, 97.5])

    print(f"\nPRODUCTION PREVALENCE of genuine contradiction (per agent pair)")
    print(f"  point  {prev_med*100:.3f}%     95% CI [{prev_lo*100:.3f}%, {prev_hi*100:.3f}%]")
    print(f"  -> enrichment factor of a 50/50 stratified sample: ~{0.5/prev_med:.0f}x")

    # --- positives needed for a usable recall estimate ------------------------
    print(f"\nPOSITIVES NEEDED (recall CI, assuming recall ~0.85)")
    recall_plan = {}
    for hw in (0.10, 0.075, 0.05):
        n = n_for_halfwidth(0.85, hw)
        recall_plan[f"halfwidth_{hw:.3f}"] = n
        print(f"  +/-{hw*100:4.1f} points -> {n:4d} labelled positives")

    # --- negatives needed for the FPR that drives corrected precision --------
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
