# Baseline Comparison: Superseded

This report's original baseline comparison table (on the 20-case `v1.0_test` split, before dataset expansion) is superseded by the ablation and baseline comparison in `THRESHOLD_ANALYSIS.md`, which:

- selects its decision threshold on the development split and reports metrics only on the held-out test split (this report's numbers did not make that separation),
- runs on the current 73-case dataset (21 dev / 22 val / 30 test) rather than the original 50,
- includes two additional configurations (drift signal, inter-agent disagreement) not covered here.

Use `THRESHOLD_ANALYSIS.md` as the current reference. This file is kept only so the original numbers remain available: precision/recall/F1 for a MiniLM-cosine-only baseline, a DeBERTa-NLI-only baseline, and the full pipeline, computed on the original 20-case test split, are in `experiments/results/` under the run timestamped 2026-08-18.
