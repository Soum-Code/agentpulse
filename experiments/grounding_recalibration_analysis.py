"""Stage 2 of the 2026-10 grounding recalibration: analyse the stored NLI outputs.

Reads experiments/results/grounding_recalibration_2026-10-22_signals.json (written by
grounding_recalibration_signals.py; needs no model) and writes
  experiments/results/grounding_recalibration_2026-10-22_analysis.json
  experiments/results/grounding_recalibration_2026-10-22_tables.md   (copied into the report)

Two views of the same forward passes are compared throughout:
  "corrected" -- grounding_score = contradiction + w * TRUE neutral   (what the code does now)
  "swapped"   -- grounding_score = contradiction + w * TRUE entailment (what every published
                 number before 2026-10-21 actually computed, because the code read
                 probs[1] as neutral and probs[2] as entailment)
Scores are RISKS: 0.0 safe, 1.0 risky. A case is flagged when score > threshold, the same
strict ">" that evaluator._classify_risk uses (0.7 high, 0.4 medium).

Method rules (Ponytail): thresholds and weights are chosen on `dev` only. `val`, `test`,
`test_dedup` (test minus the 5 cases that are copies of dev_01..05) and their pool are
reported, never selected on. Bootstrap = stratified resampling of cases within a split,
B=5000, seed 20261022, the same resamples for every weight and both views so differences
are paired. Rates carry Wilson 95% intervals; AUROC and F1 carry bootstrap percentile 95%
intervals. The dev-chosen threshold is treated as fixed, so its own selection noise is not
in the intervals (it is large; the tie width is reported).

Run:  python experiments/grounding_recalibration_analysis.py [path/to/rescore-dry-run.csv]
The optional CSV is the aggregate dry-run of the 117 live rows (PR #83); only counts are
read from it and no row is written out.
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "sdk" / "src"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "experiments"))

RES = ROOT / "experiments" / "results"
SIG = RES / "grounding_recalibration_2026-10-22_signals.json"
OUT_JSON = RES / "grounding_recalibration_2026-10-22_analysis.json"
OUT_MD = RES / "grounding_recalibration_2026-10-22_tables.md"

SEED = 20261022
B = 5000
WEIGHTS = [round(0.1 * i, 1) for i in range(11)]
THR_GRID = np.round(np.arange(0.0, 1.0, 0.01), 2)
FIXED = {"0.7": 0.7, "0.4": 0.4}
DUP_OF_DEV = {f"test_0{i}" for i in range(1, 6)}  # exact copies of dev_01..dev_05
# evaluator.RISK_WEIGHTS grounding/tool_claim; asserted against the pipeline's own output below.
RW_G, RW_T = 0.40, 0.25


def label_of(score: float | None) -> str | None:
    """evaluator._classify_risk: > 0.7 high, > 0.4 medium, else low."""
    if score is None:
        return None
    return "high" if score > 0.7 else "medium" if score > 0.4 else "low"


def aggregate(g: float, tool: float | None, total_claims: int | None) -> float:
    """evaluator._aggregate_risk: grounding alone, or weighted with the tool-claim score."""
    if tool is not None and total_claims and total_claims > 0:
        return round((g * RW_G + tool * RW_T) / (RW_G + RW_T), 4)
    return round(g, 4)


def wilson(k: int, n: int, z: float = 1.96) -> list[float | None]:
    if n == 0:
        return [None, None, None]
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(p, 4), round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4)]


def pct(a: np.ndarray) -> list[float | None]:
    a = a[~np.isnan(a)]
    if a.size == 0:
        return [None, None]
    return [round(float(np.percentile(a, 2.5)), 4), round(float(np.percentile(a, 97.5)), 4)]


# ----------------------------------------------------------------------------- data

def load() -> dict:
    with open(SIG, "r", encoding="utf-8") as f:
        return json.load(f)


def arrays(cases: list[dict], view: str, w: float) -> tuple[np.ndarray, np.ndarray]:
    c = np.array([x["contradiction"] for x in cases])
    n = np.array([x["neutral"] if view == "corrected" else x["entailment"] for x in cases])
    y = np.array([x["is_failure"] for x in cases])
    return c + w * n, y


def auroc(sf: np.ndarray, so: np.ndarray) -> float:
    gt = (sf[:, None] > so[None, :]).mean()
    eq = (sf[:, None] == so[None, :]).mean()
    return float(gt + 0.5 * eq)


class Boot:
    """Stratified resample indices for one case set; reused for every weight and view."""

    def __init__(self, n_fail: int, n_ok: int, key: int):
        rng = np.random.default_rng([SEED, key])
        self.If = rng.integers(0, n_fail, (B, n_fail))
        self.Io = rng.integers(0, n_ok, (B, n_ok))

    def auc(self, sf, so) -> np.ndarray:
        a = sf[self.If]
        b = so[self.Io]
        gt = (a[:, :, None] > b[:, None, :]).mean((1, 2))
        eq = (a[:, :, None] == b[:, None, :]).mean((1, 2))
        return gt + 0.5 * eq

    def counts(self, sf, so, t) -> tuple[np.ndarray, ...]:
        tp = (sf[self.If] > t).sum(1)
        fp = (so[self.Io] > t).sum(1)
        return tp, fp, sf.size - tp, so.size - fp


def f1_of(tp, fp, fn):
    den = 2 * tp + fp + fn
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, 2 * tp / den, np.nan)


def metrics_at(s: np.ndarray, y: np.ndarray, t: float, boot: Boot) -> dict:
    sf, so = s[y], s[~y]
    tp = int((sf > t).sum())
    fp = int((so > t).sum())
    fn, tn = sf.size - tp, so.size - fp
    f1 = 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) else None
    btp, bfp, bfn, _ = boot.counts(sf, so, t)
    return {
        "threshold": float(t), "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": wilson(tp, tp + fp), "recall": wilson(tp, tp + fn), "fpr": wilson(fp, fp + tn),
        "f1": [None if f1 is None else round(f1, 4)] + pct(f1_of(btp, bfp, bfn)),
    }


def best_dev_threshold(s: np.ndarray, y: np.ndarray) -> dict:
    sf, so = s[y], s[~y]
    f1s = []
    for t in THR_GRID:
        tp = int((sf > t).sum()); fp = int((so > t).sum()); fn = sf.size - tp
        den = 2 * tp + fp + fn
        f1s.append(2 * tp / den if den else 0.0)
    f1s = np.array(f1s)
    tied = THR_GRID[np.isclose(f1s, f1s.max())]
    return {
        "threshold": float(tied[(len(tied) - 1) // 2]),  # middle of the tied thresholds
        "dev_f1": round(float(f1s.max()), 4),
        "tied_count": int(len(tied)), "tied_min": float(tied.min()), "tied_max": float(tied.max()),
    }


# ----------------------------------------------------------------------------- main analyses

def sweep_views(sets: dict[str, list[dict]], boots: dict[str, Boot]) -> dict:
    out: dict = {}
    for view in ("corrected", "swapped"):
        out[view] = {}
        for w in WEIGHTS:
            dev_s, dev_y = arrays(sets["dev"], view, w)
            best = best_dev_threshold(dev_s, dev_y)
            row: dict = {"dev_best": best}
            for name, cases in sets.items():
                s, y = arrays(cases, view, w)
                sf, so = s[y], s[~y]
                a = auroc(sf, so)
                row[name] = {
                    "n": int(y.size), "n_fail": int(y.sum()), "n_ok": int((~y).sum()),
                    "auroc": [round(a, 4)] + pct(boots[name].auc(sf, so)),
                    "at_0.7": metrics_at(s, y, 0.7, boots[name]),
                    "at_0.4": metrics_at(s, y, 0.4, boots[name]),
                    "at_dev_best": metrics_at(s, y, best["threshold"], boots[name]),
                }
            out[view][f"{w:.1f}"] = row
    return out


def paired_auroc(sets, boots) -> dict:
    """AUROC differences with paired bootstrap CIs: (a) each w vs w=0.5, (b) corrected - swapped."""
    out: dict = {"vs_w0.5_corrected": {}, "corrected_minus_swapped": {}}
    for name in ("test", "test_dedup", "val", "held_out_pool"):
        s_ref, y = arrays(sets[name], "corrected", 0.5)
        ref = boots[name].auc(s_ref[y], s_ref[~y])
        ref_pt = auroc(s_ref[y], s_ref[~y])
        out["vs_w0.5_corrected"][name] = {}
        out["corrected_minus_swapped"][name] = {}
        for w in WEIGHTS:
            s, _ = arrays(sets[name], "corrected", w)
            d_boot = boots[name].auc(s[y], s[~y]) - ref
            d_pt = auroc(s[y], s[~y]) - ref_pt
            out["vs_w0.5_corrected"][name][f"{w:.1f}"] = [round(d_pt, 4)] + pct(d_boot)
            s2, _ = arrays(sets[name], "swapped", w)
            d2_boot = boots[name].auc(s[y], s[~y]) - boots[name].auc(s2[y], s2[~y])
            d2_pt = auroc(s[y], s[~y]) - auroc(s2[y], s2[~y])
            out["corrected_minus_swapped"][name][f"{w:.1f}"] = [round(d2_pt, 4)] + pct(d2_boot)
    return out


def paired_flags(sets: dict[str, list[dict]]) -> dict:
    """Same cases, two weights, one cut-off: how many cases does only one of them flag?

    Exact two-sided McNemar (binomial) p-value on the discordant cases. Computed separately for
    supported cases (a flag is a false alarm) and for failures (a flag is a catch).
    """
    out: dict = {}
    for name in ("test", "held_out_pool"):
        out[name] = {}
        for wa, wb in ((0.5, 0.3), (0.5, 0.0), (0.3, 0.0), (0.4, 0.3)):
            for cut in (0.4, 0.7):
                sa, y = arrays(sets[name], "corrected", wa)
                sb, _ = arrays(sets[name], "corrected", wb)
                fa, fb = sa > cut, sb > cut
                row = {}
                for grp, mask in (("supported", ~y), ("failures", y)):
                    only_a = int((fa & ~fb & mask).sum())
                    only_b = int((fb & ~fa & mask).sum())
                    k, n = min(only_a, only_b), only_a + only_b
                    p = 1.0 if n == 0 else min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)
                    row[grp] = {f"flagged_only_by_w{wa}": only_a, f"flagged_only_by_w{wb}": only_b, "exact_p": round(p, 4)}
                out[name][f"w{wa}_vs_w{wb}_at_{cut}"] = row
    return out


def quantiles(a: list[float]) -> list[float]:
    return [round(float(q), 3) for q in np.percentile(a, [10, 25, 50, 75, 90])]


def distributions(cases: list[dict]) -> dict:
    out: dict = {}
    groups = {
        "supported": [x for x in cases if not x["is_failure"]],
        "failure": [x for x in cases if x["is_failure"]],
    }
    for ft in sorted({x["failure_type"] for x in cases if x["is_failure"]}):
        groups[f"failure:{ft}"] = [x for x in cases if x["failure_type"] == ft]
    for g, rows in groups.items():
        n = len(rows)
        argmax = {k: sum(1 for x in rows if x["nli_label"] == k) for k in ("contradiction", "neutral", "entailment")}
        out[g] = {
            "n": n,
            "mean": {k: round(float(np.mean([x[k] for x in rows])), 3) for k in ("contradiction", "neutral", "entailment")},
            "quantiles_p10_p25_p50_p75_p90": {k: quantiles([x[k] for x in rows]) for k in ("contradiction", "neutral", "entailment")},
            "argmax_counts": argmax,
            "argmax_share_wilson": {k: wilson(v, n) for k, v in argmax.items()},
        }
    # P(failure | NLI argmax class)
    out["p_failure_given_argmax"] = {}
    for k in ("contradiction", "neutral", "entailment"):
        rows = [x for x in cases if x["nli_label"] == k]
        out["p_failure_given_argmax"][k] = {
            "n": len(rows), "n_failure": sum(x["is_failure"] for x in rows),
            "p_failure_wilson": wilson(sum(x["is_failure"] for x in rows), len(rows)),
        }
    return out


def reproduction_checks(sig: dict) -> dict:
    cases = {x["id"]: x for x in sig["cases"]}
    chk: dict = {}

    # 1. pipeline vs the formula (corrected labels, w = 0.5 as in code)
    diffs = []
    for x in sig["cases"]:
        g = round(x["contradiction"] + 0.5 * x["neutral"], 4)
        diffs.append(abs(g - x["pipeline_grounding_score"]))
        diffs.append(abs(aggregate(g, x["tool_claim_score"], x["tool_total_claims"]) - x["pipeline_overall_risk"]))
    chk["pipeline_vs_formula_max_abs_diff"] = round(max(diffs), 5)

    # 2. llm_judge_comparison.json (2026-08-26, after the weight-0.5 commit): per-case NLI score
    with open(RES / "llm_judge_comparison.json", "r", encoding="utf-8") as f:
        lj = json.load(f)
    pub = [(r["case_id"], r["nli_grounding_score"], r["nli_predicted_failure"], r["ground_truth_failure"]) for r in lj["results"] if r.get("nli_grounding_score") is not None]
    assert len(pub) == len(lj["results"]), "provenance lookup below indexes lj['results'] by position"
    d_sw = [abs(round(cases[i]["contradiction"] + 0.5 * cases[i]["entailment"], 3) - p) for i, p, _, _ in pub]
    d_co = [abs(round(cases[i]["contradiction"] + 0.5 * cases[i]["neutral"], 3) - p) for i, p, _, _ in pub]
    conf_pub = _conf([(pf, gt) for _, _, pf, gt in pub])
    conf_sw = _conf([(cases[i]["contradiction"] + 0.5 * cases[i]["entailment"] >= 0.5, gt) for i, _, _, gt in pub])
    conf_co = _conf([(cases[i]["contradiction"] + 0.5 * cases[i]["neutral"] >= 0.5, gt) for i, _, _, gt in pub])
    chk["llm_judge_comparison_nli_side"] = {
        "n_cases_with_published_nli_score": len(pub),
        "max_abs_diff_swapped_view_vs_published": round(max(d_sw), 4),
        "mean_abs_diff_swapped_view_vs_published": round(float(np.mean(d_sw)), 5),
        "max_abs_diff_corrected_view_vs_published": round(max(d_co), 4),
        "published_confusion_at_ge_0.5": conf_pub,
        "swapped_view_confusion_at_ge_0.5": conf_sw,
        "corrected_view_confusion_at_ge_0.5": conf_co,
    }

    def _f1(cf: dict) -> float:
        den = 2 * cf["tp"] + cf["fp"] + cf["fn"]
        return round(2 * cf["tp"] / den, 3) if den else 0.0
    by_prov = {}
    for prov in ("deterministic", "llm_judge_labelled"):
        rows_p = [(i, gt) for i, (cid, _, _, gt) in enumerate(pub) if lj["results"][i]["provenance"] == prov]
        cid_gt = [(pub[i][0], pub[i][3]) for i, _ in rows_p]
        cf_pub = _conf([(pub[i][2], pub[i][3]) for i, _ in rows_p])
        cf_sw = _conf([(cases[c]["contradiction"] + 0.5 * cases[c]["entailment"] >= 0.5, gt) for c, gt in cid_gt])
        cf_co = _conf([(cases[c]["contradiction"] + 0.5 * cases[c]["neutral"] >= 0.5, gt) for c, gt in cid_gt])
        by_prov[prov] = {"n": len(cid_gt), "published_f1": _f1(cf_pub), "swapped_view_f1": _f1(cf_sw), "corrected_view_f1": _f1(cf_co)}
    chk["llm_judge_comparison_nli_side"]["f1_by_provenance"] = by_prov
    chk["llm_judge_comparison_nli_side"]["f1_overall"] = {"published": _f1(conf_pub), "swapped_view": _f1(conf_sw), "corrected_view": _f1(conf_co)}
    chk["llm_judge_comparison_nli_side"]["false_positives_corrected_view"] = [
        {"id": i, "c": cases[i]["contradiction"], "n": cases[i]["neutral"], "e": cases[i]["entailment"],
         "score_corrected_w0.5": round(cases[i]["contradiction"] + 0.5 * cases[i]["neutral"], 4)}
        for i, _, _, gt in pub if (not gt) and cases[i]["contradiction"] + 0.5 * cases[i]["neutral"] >= 0.5
    ]
    chk["llm_judge_comparison_nli_side"]["test_09_7.61_billion_case"] = {
        "published_score": next(p for i, p, _, _ in pub if i == "test_09"),
        "swapped_view_score": round(cases["test_09"]["contradiction"] + 0.5 * cases["test_09"]["entailment"], 4),
        "corrected_view_score": round(cases["test_09"]["contradiction"] + 0.5 * cases["test_09"]["neutral"], 4),
        "c_n_e": [cases["test_09"][k] for k in ("contradiction", "neutral", "entailment")],
    }

    # 3. grounding_score_calibration.py: its own sweep code on both views vs the published JSON
    import grounding_score_calibration as gsc
    with open(RES / "grounding_score_calibration.json", "r", encoding="utf-8") as f:
        pubcal = json.load(f)
    weights = [round(0.1 * i, 1) for i in range(11)]
    thresholds = [round(0.1 * i, 1) for i in range(2, 10)]
    out_cal: dict = {}
    for view in ("swapped", "corrected"):
        def sigs(split):
            return [{
                "id": x["id"], "is_failure": x["is_failure"], "contradiction_prob": x["contradiction"],
                "neutral_prob": x["entailment"] if view == "swapped" else x["neutral"],
                "entailment_prob": x["neutral"] if view == "swapped" else x["entailment"],
            } for x in sig["cases"] if x["split"] == split]
        dev, test = sigs("dev"), sigs("test")
        dev_sweep = gsc.sweep(dev, weights, thresholds)
        top = max(r["f1_score"] for r in dev_sweep)
        top_tier = [r for r in dev_sweep if r["f1_score"] == top]
        distinct = sorted({r["weight"] for r in top_tier})
        if len(distinct) > 1:  # the script's own fallback to its "principled default"
            sel_w = gsc.PRINCIPLED_DEFAULT_WEIGHT
            cands = [r for r in top_tier if r["weight"] == sel_w]
            sel_t = (gsc.PRINCIPLED_DEFAULT_THRESHOLD if (not cands or len({r["threshold"] for r in cands}) > 1)
                     else cands[0]["threshold"])
        else:
            sel_w, sel_t = top_tier[0]["weight"], top_tier[0]["threshold"]
        old_best = gsc.best_for_weight(dev_sweep, 1.0)
        entry = {
            "dev_max_f1": top, "weights_tied_at_dev_max_f1": distinct,
            "selected_weight": sel_w, "selected_threshold": sel_t,
            "new_formula_dev": gsc.score(dev, sel_w, sel_t),
            "new_formula_test": gsc.score(test, sel_w, sel_t),
            "old_formula_(w=1.0)_dev": old_best,
            "old_formula_(w=1.0)_dev_best_threshold": old_best["threshold"],
            "old_formula_(w=1.0)_test": gsc.score(test, 1.0, old_best["threshold"]),
        }
        if view == "swapped":
            same = sum(
                1 for a, b in zip(dev_sweep, pubcal["dev_sweep"])
                if (a["weight"], a["threshold"], a["tp"], a["fp"], a["fn"], a["tn"]) == (b["weight"], b["threshold"], b["tp"], b["fp"], b["fn"], b["tn"])
            )
            entry["rows_identical_to_published_dev_sweep"] = f"{same}/{len(pubcal['dev_sweep'])}"
            entry["published_new_test"] = pubcal["new_formula"]["test"]
            entry["published_old_test"] = pubcal["old_formula"]["test"]
        out_cal[view] = entry
    chk["grounding_score_calibration_rerun"] = out_cal

    # 4. ablation Config B (contradiction only: should be identical in both views) and Config G
    with open(RES / "ablation_results.json", "r", encoding="utf-8") as f:
        pubab = json.load(f)["ablation_configurations"]
    test = [x for x in sig["cases"] if x["split"] == "test"]
    def conf_rule(rule):
        return _conf([(rule(x), x["is_failure"]) for x in test])
    def g_flag(x, view):
        gs = x["contradiction"] + 0.5 * (x["neutral"] if view == "corrected" else x["entailment"])
        risk = aggregate(gs, x["tool_claim_score"], x["tool_total_claims"])
        return (risk >= 0.50 or x["contradiction"] >= 0.60
                or (x["tool_claim_score"] is not None and x["tool_claim_score"] >= 0.60))
    chk["ablation_test"] = {
        "published_B": {k: pubab["Config_B_DeBERTa_Only"][k] for k in ("tp", "fp", "fn", "tn")},
        "recomputed_B_contradiction_gt_0.60": conf_rule(lambda x: x["contradiction"] > 0.60),
        "published_G": {k: pubab["Config_G_Full_AgentPulse"][k] for k in ("tp", "fp", "fn", "tn")},
        "recomputed_G_swapped_view": conf_rule(lambda x: g_flag(x, "swapped")),
        "recomputed_G_corrected_view": conf_rule(lambda x: g_flag(x, "corrected")),
    }
    return chk


def backend_check(sig: dict) -> dict | None:
    """PyTorch (used by every experiment) vs ONNX Runtime (used by the production worker), same 73 cases."""
    path = RES / "grounding_recalibration_2026-10-22_signals_onnx.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        onx = json.load(f)["cases"]
    keys = ("contradiction", "neutral", "entailment")
    diff = max(abs(a[k] - b[k]) for a, b in zip(sig["cases"], onx) for k in keys)

    def flag(x, t):
        return x["contradiction"] + 0.5 * x["neutral"] > t
    flips = [a["id"] for a, b in zip(sig["cases"], onx) if any(flag(a, t) != flag(b, t) for t in (0.4, 0.7))]
    return {"n_cases": len(onx), "max_abs_prob_diff": round(diff, 5),
            "cases_whose_0.4_or_0.7_flag_differs_at_w0.5": flips,
            "argmax_label_differs": [a["id"] for a, b in zip(sig["cases"], onx) if a["nli_label"] != b["nli_label"]]}


def _conf(pairs: list[tuple[bool, bool]]) -> dict:
    tp = sum(1 for p, a in pairs if p and a); fp = sum(1 for p, a in pairs if p and not a)
    fn = sum(1 for p, a in pairs if not p and a); tn = sum(1 for p, a in pairs if not p and not a)
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn}


def dashboard_impact(cases: list[dict]) -> dict:
    """Overall-risk label (as evaluator.py computes it, incl. tool claims) per weight, on labelled cases."""
    out: dict = {}
    for w in (0.0, 0.2, 0.3, 0.4, 0.5, 1.0):
        rows = {"supported": {"low": 0, "medium": 0, "high": 0}, "failure": {"low": 0, "medium": 0, "high": 0}}
        for x in cases:
            gs = x["contradiction"] + w * x["neutral"]
            lab = label_of(aggregate(gs, x["tool_claim_score"], x["tool_total_claims"]))
            rows["failure" if x["is_failure"] else "supported"][lab] += 1
        out[f"{w:.1f}"] = rows
    return out


def bands_on_labelled(cases: list[dict]) -> dict:
    """Three-way split by the NLI argmax class: contradicted / unverifiable (neutral) / entailed."""
    out = {}
    for k, nm in (("contradiction", "contradicted"), ("neutral", "unverifiable"), ("entailment", "entailed")):
        rows = [x for x in cases if x["nli_label"] == k]
        out[nm] = {"n": len(rows), "supported": sum(not x["is_failure"] for x in rows), "failure": sum(x["is_failure"] for x in rows)}
    return out


def production_copy(csv_path: Path | None) -> dict | None:
    """Aggregate what each weight would do to the 117 live rows (probabilities from the PR #83 dry run)."""
    if csv_path is None or not csv_path.exists():
        return None
    def fl(v):
        return float(v) if v not in ("", None) else None
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    rows = [r for r in rows if fl(r["contradiction_prob_new"]) is not None]
    out: dict = {"n_rows_with_probabilities": len(rows)}
    argmax = {"contradiction": 0, "neutral": 0, "entailment": 0}
    for r in rows:
        c, n, e = fl(r["contradiction_prob_new"]), fl(r["neutral_prob_new"]), fl(r["entailment_prob_new"])
        argmax[max((c, "contradiction"), (n, "neutral"), (e, "entailment"))[1]] += 1
    out["argmax_class_counts"] = argmax
    toks = [int(r["grounding_input_tokens_new"]) for r in rows if r["grounding_input_tokens_new"]]
    out["premise_plus_claim_tokens_min_median_max"] = [min(toks), float(np.median(toks)), max(toks)]
    out["rows_with_tool_claims"] = sum(1 for r in rows if r["tool_claims_found_new"] not in ("", "0"))
    def risk(r, w):
        g = fl(r["contradiction_prob_new"]) + w * fl(r["neutral_prob_new"])
        t = fl(r["tool_claim_score_new"]); tc = int(r["tool_claims_found_new"] or 0)
        return aggregate(g, t, tc)
    # consistency: weight 0.5 must give the dry run's own new risk
    out["max_abs_diff_vs_dry_run_overall_risk_new_at_w0.5"] = round(max(abs(risk(r, 0.5) - fl(r["overall_risk_score_new"])) for r in rows), 4)
    out["label_old_(v1.0_formula_1-entailment_swapped)"] = _count(label_of(fl(r["overall_risk_score_old"])) for r in rows)
    out["label_by_weight"] = {f"{w:.1f}": _count(label_of(risk(r, w)) for r in rows) for w in (0.0, 0.2, 0.3, 0.4, 0.5, 1.0)}
    out["note"] = "demo/test traffic from the live database copy, not customer traffic; counts only, no row written out"
    return out


def _count(it) -> dict:
    d = {"low": 0, "medium": 0, "high": 0}
    for k in it:
        d[k] += 1
    return d


def multiagent_pairs(sig: dict, ws=(0.0, 0.3, 0.5)) -> dict:
    """Corrected-label NLI on every ordered pair of agent outputs in v1.0_multiagent.json.

    Benign categories are labelled is_failure=False by the dataset author (agreement, paraphrase,
    different topic, partial refinement); the contradiction categories are labelled failures.
    Only pairs the author labelled benign (whole benign cases) or the labelled contradicting pair
    are used, so a pair inside a failure case that was never labelled is not counted either way.
    """
    pairs = [p for p in sig.get("multiagent_pairs", []) if (not p["is_failure"]) or p["is_labelled_contradicting_pair"]]
    out: dict = {}
    for cat in sorted({p["category"] for p in pairs}):
        rows = [p for p in pairs if p["category"] == cat]
        d = {
            "n_pairs": len(rows), "is_failure": rows[0]["is_failure"],
            "mean_c_n_e": [round(float(np.mean([r[k] for r in rows])), 3) for k in ("contradiction", "neutral", "entailment")],
            "argmax_counts": {k: sum(1 for r in rows if r["nli_label"] == k) for k in ("contradiction", "neutral", "entailment")},
        }
        for w in ws:
            sc = [r["contradiction"] + w * r["neutral"] for r in rows]
            d[f"pairs_with_score_gt_0.4_at_w{w}"] = int(sum(v > 0.4 for v in sc))
        out[cat] = d
    benign = [p for p in pairs if not p["is_failure"]]
    out["_all_benign"] = {
        "n_pairs": len(benign),
        "argmax_counts": {k: sum(1 for r in benign if r["nli_label"] == k) for k in ("contradiction", "neutral", "entailment")},
        **{f"score_gt_0.4_at_w{w}": wilson(int(sum(r["contradiction"] + w * r["neutral"] > 0.4 for r in benign)), len(benign)) for w in ws},
    }
    return out


def refusal_trials(ws=(0.0, 0.3, 0.5)) -> dict:
    """100 real verifier answers (5 LLMs) from refusal_disagreement.json, re-scored on corrected labels.

    The file was written before the 2026-10-21 fix, so its stored `entailment_prob` is really the
    NEUTRAL probability (probs[2]) and the true entailment is 1 - contradiction - stored value.
    Design labels (not human review): when the retrieved evidence was relevant the right answer is
    an acceptance, when it was irrelevant the right answer is a refusal. 97 of the 100 answers
    behaved as designed.
    """
    with open(RES / "refusal_disagreement.json", "r", encoding="utf-8") as f:
        trials = json.load(f)["trials"]
    groups = {
        "correct accept (evidence relevant, verifier accepted)": lambda t: t["stance"] == "accept" and t["evidence_relevant"],
        "correct refuse (evidence irrelevant, verifier refused)": lambda t: t["stance"] == "refuse" and not t["evidence_relevant"],
        "over-refusal (evidence relevant, verifier refused)": lambda t: t["stance"] == "refuse" and t["evidence_relevant"],
    }
    out: dict = {}
    for name, pred in groups.items():
        rows = [t for t in trials if pred(t)]
        c = np.array([t["contradiction_prob"] for t in rows])
        n = np.array([t["entailment_prob"] for t in rows])   # stored under the swapped name
        e = np.clip(1.0 - c - n, 0.0, 1.0)
        argmax = [("contradiction", "neutral", "entailment")[int(np.argmax([c[i], n[i], e[i]]))] for i in range(len(rows))]
        d = {
            "n": len(rows),
            "mean_c_n_e": [round(float(c.mean()), 3), round(float(n.mean()), 3), round(float(e.mean()), 3)],
            "argmax_counts": {k: argmax.count(k) for k in ("contradiction", "neutral", "entailment")},
            "published_score_swapped_w0.5_median": round(float(np.median(c + 0.5 * e)), 4),
        }
        for w in ws:
            sc = c + w * n
            d[f"score_gt_0.4_at_w{w}"] = wilson(int((sc > 0.4).sum()), len(rows))
            d[f"score_gt_0.7_at_w{w}"] = wilson(int((sc > 0.7).sum()), len(rows))
        out[name] = d
    return out


def llm_output_proxy() -> dict:
    """Real LLM answers to the SUPPORTED test cases, bounded from stored old risks (no texts stored).

    Only test cases with no tool_records are used, so the stored risk is the grounding score alone.
    Qwen run (2026-08-23 17:28 UTC) pre-dates the weight-0.5 commit, so old = c + e (w=1, swapped).
    Llama run (2026-08-24) post-dates it, so old = c + 0.5e.  With n = 1 - c - e and 0 <= c <= old:
      Qwen : new = c + 0.5n  in [0.5 - 0.5*old, 0.5 + 0.5*old]
      Llama: new = c + 0.5n  in [0.5 - old,     0.5 + 0.5*old]
    Not human-labelled: 'supported' means the dataset claim for that prompt is supported.
    """
    with open(ROOT / "datasets" / "v1.0_test.json", "r", encoding="utf-8") as f:
        tcases = {c["id"]: c for c in json.load(f)["cases"]}
    out: dict = {}
    for fname, coef, label in (("reasoning_strategy_results.json", 0.5, "qwen3-8b (old formula w=1, swapped)"),
                               ("reasoning_strategy_results_llama_gpu.json", 1.0, "llama3.1-8b (w=0.5, swapped)")):
        with open(RES / fname, "r", encoding="utf-8") as f:
            d = json.load(f)
        runs = []
        for strat, lst in d["detailed_results"].items():
            for r in lst:
                c = tcases.get(r["case_id"])
                if c is None or c.get("tool_records") or r["is_failure_ground_truth"]:
                    continue
                runs.extend(r["raw_risk_scores"])
        runs = np.array(runs)
        lower = 0.5 - coef * runs
        out[label] = {
            "file": f"experiments/results/{fname}", "n_runs": int(runs.size),
            "old_risk_lt_0.10": int((runs < 0.10).sum()),
            "new_risk_certainly_gt_0.4_(medium_or_higher)": int((lower > 0.4).sum()),
            "old_risk_ge_0.40": int((runs >= 0.40).sum()),
            "old_risk_median": round(float(np.median(runs)), 4),
        }
    return out


# ----------------------------------------------------------------------------- tables

def fmt_ci(v) -> str:
    if v is None or v[0] is None:
        return "n/a"
    return f"{v[0]:.3f} [{v[1]:.3f}, {v[2]:.3f}]" if len(v) == 3 and v[1] is not None else f"{v[0]:.3f}"


def tables(res: dict) -> str:
    L: list[str] = []
    sw = res["weight_sweep"]
    n_ = res["sample_sizes"]
    L.append("### T1. Sample sizes\n")
    L.append("| set | cases | failures | supported |\n|---|---|---|---|")
    for k, v in n_.items():
        L.append(f"| {k} | {v['n']} | {v['n_fail']} | {v['n_ok']} |")
    L.append("")
    L.append("### T2. Class probabilities, corrected labels (all unique labelled cases)\n")
    L.append("| group | n | mean contradiction | mean neutral | mean entailment | median c / n / e | NLI argmax: contradiction / neutral / entailment |\n|---|---|---|---|---|---|---|")
    for g, v in res["distributions"]["pooled_unique"].items():
        if g == "p_failure_given_argmax":
            continue
        m, q, a = v["mean"], v["quantiles_p10_p25_p50_p75_p90"], v["argmax_counts"]
        L.append(f"| {g} | {v['n']} | {m['contradiction']} | {m['neutral']} | {m['entailment']} | "
                 f"{q['contradiction'][2]} / {q['neutral'][2]} / {q['entailment'][2]} | {a['contradiction']} / {a['neutral']} / {a['entailment']} |")
    L.append("")
    L.append("P(failure | NLI argmax class), pooled unique cases:\n")
    L.append("| argmax class | cases | of which failures | P(failure) [95% Wilson] |\n|---|---|---|---|")
    for k, v in res["distributions"]["pooled_unique"]["p_failure_given_argmax"].items():
        L.append(f"| {k} | {v['n']} | {v['n_failure']} | {fmt_ci(v['p_failure_wilson'])} |")
    L.append("")
    for view, title in (("corrected", "T3. Weight sweep, CORRECTED labels (score = contradiction + w x neutral)"),
                        ("swapped", "T4. Weight sweep, SWAPPED labels as published (score = contradiction + w x entailment)")):
        L.append(f"### {title}\n")
        L.append("AUROC with 95% bootstrap CI; F1 / FPR with 95% intervals are in the JSON. 'dev-best t' is chosen on dev only (middle of the tied thresholds).\n")
        L.append("| w | AUROC test (n=30) | AUROC val+test_dedup (n=47) | test @0.7: F1 / FPR | test @0.4: F1 / FPR | dev-best t (tied span) | test @dev-best: F1 / FPR |\n|---|---|---|---|---|---|---|")
        for w in WEIGHTS:
            r = sw[view][f"{w:.1f}"]
            t, p = r["test"], r["held_out_pool"]
            def ff(m):
                return f"{m['f1'][0]:.3f} / {m['fpr'][0]:.3f}" if m["f1"][0] is not None else "n/a / n/a"
            b = r["dev_best"]
            L.append(f"| {w:.1f} | {fmt_ci(t['auroc'])} | {fmt_ci(p['auroc'])} | {ff(t['at_0.7'])} | {ff(t['at_0.4'])} | "
                     f"{b['threshold']:.2f} ({b['tied_min']:.2f}-{b['tied_max']:.2f}) | {ff(t['at_dev_best'])} |")
        L.append("")
    for setname, title in (("test", "T3c. All weights, corrected labels, TEST split (n=30; 13 failures, 17 supported): precision / recall / F1 / FPR"),
                           ("held_out_pool", "T3d. All weights, corrected labels, held-out pool val + test_dedup (n=47; 20 failures, 27 supported): precision / recall / F1 / FPR")):
        L.append(f"### {title}\n")
        L.append("Cells are P / R / F1 / FPR, point estimates (intervals for every cell are in the analysis JSON). No precision is defined when nothing is flagged.\n")
        L.append("| w | cut-off 0.7 | cut-off 0.4 | dev-best t | at dev-best t |\n|---|---|---|---|---|")
        for w in WEIGHTS:
            r = sw["corrected"][f"{w:.1f}"]
            def cell(m):
                pr = m["precision"][0]
                return f"{'n/a' if pr is None else format(pr, '.3f')} / {m['recall'][0]:.3f} / {m['f1'][0]:.3f} / {m['fpr'][0]:.3f}"
            L.append(f"| {w:.1f} | {cell(r[setname]['at_0.7'])} | {cell(r[setname]['at_0.4'])} | {r['dev_best']['threshold']:.2f} | {cell(r[setname]['at_dev_best'])} |")
        L.append("")
    L.append("### T5. Paired AUROC differences on held-out pool (val + test_dedup, n=47), bootstrap 95% CI\n")
    L.append("| w | AUROC(w) - AUROC(0.5), corrected | corrected - swapped, same w |\n|---|---|---|")
    pa = res["paired_auroc"]
    for w in WEIGHTS:
        a = pa["vs_w0.5_corrected"]["held_out_pool"][f"{w:.1f}"]
        b = pa["corrected_minus_swapped"]["held_out_pool"][f"{w:.1f}"]
        def flag(v):
            if v[1] is None:
                return ""
            if v[1] == 0 and v[2] == 0:
                return " (no change)"
            return " (within noise)" if v[1] <= 0 <= v[2] else ""
        L.append(f"| {w:.1f} | {a[0]:+.3f} [{a[1]:+.3f}, {a[2]:+.3f}]{flag(a)} | {b[0]:+.3f} [{b[1]:+.3f}, {b[2]:+.3f}]{flag(b)} |")
    L.append("")
    L.append("### T5b. Same cases, two weights: cases flagged by only one of them (exact McNemar p)\n")
    L.append("| set | comparison | cut-off | supported cases flagged only by first / only by second (p) | failures flagged only by first / only by second (p) |\n|---|---|---|---|---|")
    for setname, comps in res["paired_flags"].items():
        for key, v in comps.items():
            wa, rest = key.split("_vs_")
            wb, cut = rest.split("_at_")
            s, f_ = v["supported"], v["failures"]
            L.append(f"| {setname} | {wa} vs {wb} | {cut} | {s[f'flagged_only_by_{wa}']} / {s[f'flagged_only_by_{wb}']} (p={s['exact_p']}) | "
                     f"{f_[f'flagged_only_by_{wa}']} / {f_[f'flagged_only_by_{wb}']} (p={f_['exact_p']}) |")
    L.append("")
    L.append("### T3b. Key operating points with intervals (FPR and recall: Wilson 95%; F1: bootstrap 95%)\n")
    L.append("| view | w | cut-off | set | flagged supported / supported | FPR | recall | F1 |\n|---|---|---|---|---|---|---|---|")
    for view, w in (("corrected", 0.0), ("corrected", 0.3), ("corrected", 0.4), ("corrected", 0.5), ("swapped", 0.5), ("swapped", 1.0)):
        for cut in ("0.7", "0.4"):
            for setname in ("test", "held_out_pool"):
                m = sw[view][f"{w:.1f}"][setname][f"at_{cut}"]
                L.append(f"| {view} | {w:.1f} | {cut} | {setname} | {m['fp']} / {m['fp'] + m['tn']} | {fmt_ci(m['fpr'])} | {fmt_ci(m['recall'])} | {fmt_ci(m['f1'])} |")
    L.append("")
    L.append("### T6. Overall-risk label on labelled cases by weight (dev+val+test_dedup, tool claims included as in the pipeline)\n")
    L.append("| w | supported: low / medium / high | failures: low / medium / high |\n|---|---|---|")
    for w, v in res["dashboard_impact_labelled"].items():
        s, f_ = v["supported"], v["failure"]
        L.append(f"| {w} | {s['low']} / {s['medium']} / {s['high']} | {f_['low']} / {f_['medium']} / {f_['high']} |")
    L.append("")
    pc = res.get("production_copy_117_rows")
    if pc:
        L.append("### T7. The 117 live rows (PR #83 dry run): label counts by weight\n")
        L.append(f"NLI argmax class on these rows: {pc['argmax_class_counts']}; premise+claim tokens min/median/max: {pc['premise_plus_claim_tokens_min_median_max']}.\n")
        L.append("| w | low | medium | high |\n|---|---|---|---|")
        for w, v in pc["label_by_weight"].items():
            L.append(f"| {w} | {v['low']} | {v['medium']} | {v['high']} |")
        L.append(f"| (old stored labels) | {pc['label_old_(v1.0_formula_1-entailment_swapped)']['low']} | {pc['label_old_(v1.0_formula_1-entailment_swapped)']['medium']} | {pc['label_old_(v1.0_formula_1-entailment_swapped)']['high']} |")
        L.append("")
    ma = res["multiagent_pairs"]
    L.append("### T9. v1.0_multiagent.json: corrected-label NLI on agent-output pairs (earlier output = premise)\n")
    L.append("| category | failure? | pairs | mean c / n / e | argmax c / n / e | pairs scoring > 0.4 at w = 0 / 0.3 / 0.5 |\n|---|---|---|---|---|---|")
    for cat, v in ma.items():
        if cat.startswith("_"):
            continue
        a = v["argmax_counts"]
        L.append(f"| {cat} | {v['is_failure']} | {v['n_pairs']} | {v['mean_c_n_e'][0]} / {v['mean_c_n_e'][1]} / {v['mean_c_n_e'][2]} | "
                 f"{a['contradiction']} / {a['neutral']} / {a['entailment']} | "
                 f"{v['pairs_with_score_gt_0.4_at_w0.0']} / {v['pairs_with_score_gt_0.4_at_w0.3']} / {v['pairs_with_score_gt_0.4_at_w0.5']} |")
    ab_ = ma["_all_benign"]
    L.append(f"\nAll benign pairs: {ab_['n_pairs']}; argmax {ab_['argmax_counts']}; share scoring > 0.4 at w=0.5: {fmt_ci(ab_['score_gt_0.4_at_w0.5'])}.\n")
    rt = res["refusal_trials_100"]
    L.append("### T11. 100 real verifier answers (refusal_disagreement.json), corrected labels\n")
    L.append("| group | n | mean c / n / e | NLI argmax c / n / e | score > 0.4 at w=0 | at w=0.3 | at w=0.5 | score > 0.7 at w=0.5 |\n|---|---|---|---|---|---|---|---|")
    for g, v in rt.items():
        m, a = v["mean_c_n_e"], v["argmax_counts"]
        L.append(f"| {g} | {v['n']} | {m[0]} / {m[1]} / {m[2]} | {a['contradiction']} / {a['neutral']} / {a['entailment']} | "
                 f"{fmt_ci(v['score_gt_0.4_at_w0.0'])} | {fmt_ci(v['score_gt_0.4_at_w0.3'])} | {fmt_ci(v['score_gt_0.4_at_w0.5'])} | {fmt_ci(v['score_gt_0.7_at_w0.5'])} |")
    L.append("")
    lp = res["llm_output_proxy"]
    L.append("### T10. Real LLM answers to supported test prompts, bounded from stored risks (texts were not stored)\n")
    L.append("| run | runs | old risk < 0.10 | new risk certainly > 0.4 | old risk >= 0.40 |\n|---|---|---|---|---|")
    for k, v in lp.items():
        L.append(f"| {k} | {v['n_runs']} | {v['old_risk_lt_0.10']} | {v['new_risk_certainly_gt_0.4_(medium_or_higher)']} | {v['old_risk_ge_0.40']} |")
    L.append("")
    ck = res["reproduction_checks"]
    L.append("### T8. Reproduction of published numbers from the swapped view\n")
    cal = ck["grounding_score_calibration_rerun"]
    L.append("| check | published | swapped view (this run) | corrected view (this run) |\n|---|---|---|---|")
    L.append(f"| calibration dev sweep rows identical | 88 rows | {cal['swapped']['rows_identical_to_published_dev_sweep']} | n/a |")
    def tl(d):
        return f"F1 {d['f1_score']} / FPR {d['fpr']} (tp {d['tp']} fp {d['fp']} fn {d['fn']} tn {d['tn']})"
    L.append(f"| calibration, selected (w, t) on test | {tl(cal['swapped']['published_new_test'])} | w={cal['swapped']['selected_weight']}, t={cal['swapped']['selected_threshold']}: {tl(cal['swapped']['new_formula_test'])} | w={cal['corrected']['selected_weight']}, t={cal['corrected']['selected_threshold']}: {tl(cal['corrected']['new_formula_test'])} |")
    L.append(f"| calibration, old formula w=1.0 on test | {tl(cal['swapped']['published_old_test'])} | t={cal['swapped']['old_formula_(w=1.0)_dev_best_threshold']}: {tl(cal['swapped']['old_formula_(w=1.0)_test'])} | t={cal['corrected']['old_formula_(w=1.0)_dev_best_threshold']}: {tl(cal['corrected']['old_formula_(w=1.0)_test'])} |")
    L.append(f"| calibration, weights tied at max dev F1 | 10 | {len(cal['swapped']['weights_tied_at_dev_max_f1'])} | {len(cal['corrected']['weights_tied_at_dev_max_f1'])} |")
    ab = ck["ablation_test"]
    L.append(f"| ablation Config B (contradiction > 0.60), test | {ab['published_B']} | {ab['recomputed_B_contradiction_gt_0.60']} | same by construction |")
    L.append(f"| ablation Config G, test | {ab['published_G']} | {ab['recomputed_G_swapped_view']} | {ab['recomputed_G_corrected_view']} |")
    lj = ck["llm_judge_comparison_nli_side"]
    L.append(f"| llm_judge NLI side (>= 0.5), per-case score max abs diff | 0 | {lj['max_abs_diff_swapped_view_vs_published']} | {lj['max_abs_diff_corrected_view_vs_published']} |")
    L.append(f"| llm_judge NLI side confusion | {lj['published_confusion_at_ge_0.5']} | {lj['swapped_view_confusion_at_ge_0.5']} | {lj['corrected_view_confusion_at_ge_0.5']} |")
    L.append(f"| pipeline vs formula (corrected, max abs diff) | 0 | n/a | {ck['pipeline_vs_formula_max_abs_diff']} |")
    L.append("")
    L.append("### T8b. The calibration report's own table, rebuilt (same script logic: dev-selected, rule `score >= threshold`)\n")
    L.append("| formula | split | view | precision | recall | F1 | FPR | tp / fp / fn / tn |\n|---|---|---|---|---|---|---|---|")
    for formula, dk, tk in (("new (w=0.5, t=0.5 fallback)", "new_formula_dev", "new_formula_test"),
                            ("old (w=1.0, own dev-best t)", "old_formula_(w=1.0)_dev", "old_formula_(w=1.0)_test")):
        for split, key in (("dev", dk), ("test", tk)):
            for view in ("swapped", "corrected"):
                d = cal[view][key]
                L.append(f"| {formula} | {split} | {view} (t={d['threshold']}) | {d['precision']} | {d['recall']} | {d['f1_score']} | {d['fpr']} | {d['tp']} / {d['fp']} / {d['fn']} / {d['tn']} |")
    L.append("")
    bc = res.get("backend_pytorch_vs_onnx")
    if bc:
        L.append(f"PyTorch vs ONNX on the same {bc['n_cases']} cases: max abs probability difference {bc['max_abs_prob_diff']}; "
                 f"cases whose 0.4 / 0.7 flag differs at w=0.5: {bc['cases_whose_0.4_or_0.7_flag_differs_at_w0.5']}; argmax label differs: {bc['argmax_label_differs']}.")
        L.append("")
    return "\n".join(L)


def main() -> None:
    sig = load()
    allc = sig["cases"]
    by = {s: [x for x in allc if x["split"] == s] for s in ("dev", "val", "test")}
    by["test_dedup"] = [x for x in by["test"] if x["id"] not in DUP_OF_DEV]
    by["held_out_pool"] = by["val"] + by["test_dedup"]
    pooled_unique = by["dev"] + by["val"] + by["test_dedup"]
    keys = {"dev": 1, "val": 2, "test": 3, "test_dedup": 4, "held_out_pool": 5}
    boots = {k: Boot(sum(x["is_failure"] for x in v), sum(not x["is_failure"] for x in v), keys[k]) for k, v in by.items()}

    csv_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    res = {
        "generated_by": "experiments/grounding_recalibration_analysis.py",
        "inputs": ["experiments/results/grounding_recalibration_2026-10-22_signals.json"],
        "seed": SEED, "bootstrap_B": B, "flag_rule": "score > threshold (strict, as evaluator._classify_risk)",
        "dev_duplicates_in_test": sorted(DUP_OF_DEV),
        "sample_sizes": {k: {"n": len(v), "n_fail": sum(x["is_failure"] for x in v), "n_ok": sum(not x["is_failure"] for x in v)}
                         for k, v in {**by, "pooled_unique": pooled_unique}.items()},
        "reproduction_checks": reproduction_checks(sig),
        "backend_pytorch_vs_onnx": backend_check(sig),
        "distributions": {"pooled_unique": distributions(pooled_unique), **{s: distributions(by[s]) for s in ("dev", "val", "test")}},
        "weight_sweep": sweep_views(by, boots),
        "paired_auroc": paired_auroc(by, boots),
        "paired_flags": paired_flags(by),
        "dashboard_impact_labelled": dashboard_impact(pooled_unique),
        "bands_on_labelled_by_nli_argmax": bands_on_labelled(pooled_unique),
        "multiagent_pairs": multiagent_pairs(sig),
        "refusal_trials_100": refusal_trials(),
        "llm_output_proxy": llm_output_proxy(),
    }
    pc = production_copy(csv_arg)
    if pc:
        res["production_copy_117_rows"] = pc
        res["inputs"].append(f"{csv_arg.name} (aggregate counts only)")
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    md = tables(res)
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"wrote {OUT_JSON.name} and {OUT_MD.name}")


if __name__ == "__main__":
    main()
