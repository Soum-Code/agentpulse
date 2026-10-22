### T1. Sample sizes

| set | cases | failures | supported |
|---|---|---|---|
| dev | 21 | 9 | 12 |
| val | 22 | 9 | 13 |
| test | 30 | 13 | 17 |
| test_dedup | 25 | 11 | 14 |
| held_out_pool | 47 | 20 | 27 |
| pooled_unique | 68 | 29 | 39 |

### T2. Class probabilities, corrected labels (all unique labelled cases)

| group | n | mean contradiction | mean neutral | mean entailment | median c / n / e | NLI argmax: contradiction / neutral / entailment |
|---|---|---|---|---|---|---|
| supported | 39 | 0.055 | 0.401 | 0.544 | 0.001 / 0.057 / 0.904 | 2 / 16 / 21 |
| failure | 29 | 0.97 | 0.03 | 0.0 | 0.999 / 0.001 / 0.0 | 28 / 1 / 0 |
| failure:GROUNDING_CONTRADICTION | 14 | 0.939 | 0.061 | 0.0 | 0.999 / 0.001 / 0.0 | 13 / 1 / 0 |
| failure:TOOL_COUNT_MISMATCH | 13 | 0.999 | 0.001 | 0.0 | 0.999 / 0.001 / 0.0 | 13 / 0 / 0 |
| failure:TOOL_EXECUTION_FAILURE_CLAIM | 2 | 1.0 | 0.0 | 0.0 | 1.0 / 0.0 / 0.0 | 2 / 0 / 0 |

P(failure | NLI argmax class), pooled unique cases:

| argmax class | cases | of which failures | P(failure) [95% Wilson] |
|---|---|---|---|
| contradiction | 30 | 28 | 0.933 [0.787, 0.982] |
| neutral | 17 | 1 | 0.059 [0.011, 0.270] |
| entailment | 21 | 0 | 0.000 [0.000, 0.155] |

### T3. Weight sweep, CORRECTED labels (score = contradiction + w x neutral)

AUROC with 95% bootstrap CI; F1 / FPR with 95% intervals are in the JSON. 'dev-best t' is chosen on dev only (middle of the tied thresholds).

| w | AUROC test (n=30) | AUROC val+test_dedup (n=47) | test @0.7: F1 / FPR | test @0.4: F1 / FPR | dev-best t (tied span) | test @dev-best: F1 / FPR |
|---|---|---|---|---|---|---|
| 0.0 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.55 (0.12-0.99) | 0.963 / 0.059 |
| 0.1 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.59 (0.20-0.99) | 0.963 / 0.059 |
| 0.2 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.63 (0.27-0.99) | 0.963 / 0.059 |
| 0.3 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.67 (0.35-0.99) | 0.963 / 0.059 |
| 0.4 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.897 / 0.176 | 0.70 (0.42-0.99) | 0.963 / 0.059 |
| 0.5 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.788 / 0.412 | 0.75 (0.51-0.99) | 0.963 / 0.059 |
| 0.6 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.788 / 0.412 | 0.80 (0.61-0.99) | 0.963 / 0.059 |
| 0.7 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.788 / 0.412 | 0.85 (0.71-0.99) | 0.963 / 0.059 |
| 0.8 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.812 / 0.353 | 0.788 / 0.412 | 0.89 (0.80-0.99) | 1.000 / 0.000 |
| 0.9 | 1.000 [1.000, 1.000] | 0.998 [0.989, 1.000] | 0.788 / 0.412 | 0.788 / 0.412 | 0.94 (0.90-0.99) | 1.000 / 0.000 |
| 1.0 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.788 / 0.412 | 0.788 / 0.412 | 0.99 (0.99-0.99) | 0.897 / 0.176 |

### T4. Weight sweep, SWAPPED labels as published (score = contradiction + w x entailment)

AUROC with 95% bootstrap CI; F1 / FPR with 95% intervals are in the JSON. 'dev-best t' is chosen on dev only (middle of the tied thresholds).

| w | AUROC test (n=30) | AUROC val+test_dedup (n=47) | test @0.7: F1 / FPR | test @0.4: F1 / FPR | dev-best t (tied span) | test @dev-best: F1 / FPR |
|---|---|---|---|---|---|---|
| 0.0 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.55 (0.12-0.99) | 0.963 / 0.059 |
| 0.1 | 1.000 [1.000, 1.000] | 0.996 [0.983, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.56 (0.14-0.99) | 0.963 / 0.059 |
| 0.2 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.59 (0.20-0.99) | 0.963 / 0.059 |
| 0.3 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.64 (0.30-0.99) | 0.963 / 0.059 |
| 0.4 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.963 / 0.059 | 0.963 / 0.059 | 0.69 (0.40-0.99) | 0.963 / 0.059 |
| 0.5 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.963 / 0.059 | 0.703 / 0.647 | 0.74 (0.50-0.99) | 0.963 / 0.059 |
| 0.6 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.963 / 0.059 | 0.703 / 0.647 | 0.79 (0.60-0.99) | 0.963 / 0.059 |
| 0.7 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.963 / 0.059 | 0.703 / 0.647 | 0.84 (0.70-0.99) | 0.963 / 0.059 |
| 0.8 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.703 / 0.647 | 0.703 / 0.647 | 0.89 (0.80-0.99) | 0.963 / 0.059 |
| 0.9 | 1.000 [1.000, 1.000] | 0.965 [0.883, 1.000] | 0.703 / 0.647 | 0.703 / 0.647 | 0.94 (0.90-0.99) | 0.963 / 0.059 |
| 1.0 | 0.946 [0.846, 1.000] | 0.885 [0.778, 0.967] | 0.703 / 0.647 | 0.703 / 0.647 | 0.95 (0.92-0.99) | 0.743 / 0.529 |

### T3c. All weights, corrected labels, TEST split (n=30; 13 failures, 17 supported): precision / recall / F1 / FPR

Cells are P / R / F1 / FPR, point estimates (intervals for every cell are in the analysis JSON). No precision is defined when nothing is flagged.

| w | cut-off 0.7 | cut-off 0.4 | dev-best t | at dev-best t |
|---|---|---|---|---|
| 0.0 | 0.929 / 1.000 / 0.963 / 0.059 | 0.929 / 1.000 / 0.963 / 0.059 | 0.55 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.1 | 0.929 / 1.000 / 0.963 / 0.059 | 0.929 / 1.000 / 0.963 / 0.059 | 0.59 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.2 | 0.929 / 1.000 / 0.963 / 0.059 | 0.929 / 1.000 / 0.963 / 0.059 | 0.63 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.3 | 0.929 / 1.000 / 0.963 / 0.059 | 0.929 / 1.000 / 0.963 / 0.059 | 0.67 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.4 | 0.929 / 1.000 / 0.963 / 0.059 | 0.812 / 1.000 / 0.897 / 0.176 | 0.70 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.5 | 0.929 / 1.000 / 0.963 / 0.059 | 0.650 / 1.000 / 0.788 / 0.412 | 0.75 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.6 | 0.929 / 1.000 / 0.963 / 0.059 | 0.650 / 1.000 / 0.788 / 0.412 | 0.80 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.7 | 0.929 / 1.000 / 0.963 / 0.059 | 0.650 / 1.000 / 0.788 / 0.412 | 0.85 | 0.929 / 1.000 / 0.963 / 0.059 |
| 0.8 | 0.684 / 1.000 / 0.812 / 0.353 | 0.650 / 1.000 / 0.788 / 0.412 | 0.89 | 1.000 / 1.000 / 1.000 / 0.000 |
| 0.9 | 0.650 / 1.000 / 0.788 / 0.412 | 0.650 / 1.000 / 0.788 / 0.412 | 0.94 | 1.000 / 1.000 / 1.000 / 0.000 |
| 1.0 | 0.650 / 1.000 / 0.788 / 0.412 | 0.650 / 1.000 / 0.788 / 0.412 | 0.99 | 0.812 / 1.000 / 0.897 / 0.176 |

### T3d. All weights, corrected labels, held-out pool val + test_dedup (n=47; 20 failures, 27 supported): precision / recall / F1 / FPR

Cells are P / R / F1 / FPR, point estimates (intervals for every cell are in the analysis JSON). No precision is defined when nothing is flagged.

| w | cut-off 0.7 | cut-off 0.4 | dev-best t | at dev-best t |
|---|---|---|---|---|
| 0.0 | 0.905 / 0.950 / 0.927 / 0.074 | 0.905 / 0.950 / 0.927 / 0.074 | 0.55 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.1 | 0.905 / 0.950 / 0.927 / 0.074 | 0.905 / 0.950 / 0.927 / 0.074 | 0.59 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.2 | 0.905 / 0.950 / 0.927 / 0.074 | 0.905 / 0.950 / 0.927 / 0.074 | 0.63 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.3 | 0.905 / 0.950 / 0.927 / 0.074 | 0.909 / 1.000 / 0.952 / 0.074 | 0.67 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.4 | 0.905 / 0.950 / 0.927 / 0.074 | 0.800 / 1.000 / 0.889 / 0.185 | 0.70 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.5 | 0.905 / 0.950 / 0.927 / 0.074 | 0.667 / 1.000 / 0.800 / 0.370 | 0.75 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.6 | 0.905 / 0.950 / 0.927 / 0.074 | 0.667 / 1.000 / 0.800 / 0.370 | 0.80 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.7 | 0.870 / 1.000 / 0.930 / 0.111 | 0.667 / 1.000 / 0.800 / 0.370 | 0.85 | 0.905 / 0.950 / 0.927 / 0.074 |
| 0.8 | 0.667 / 1.000 / 0.800 / 0.370 | 0.667 / 1.000 / 0.800 / 0.370 | 0.89 | 0.950 / 0.950 / 0.950 / 0.037 |
| 0.9 | 0.667 / 1.000 / 0.800 / 0.370 | 0.667 / 1.000 / 0.800 / 0.370 | 0.94 | 0.950 / 0.950 / 0.950 / 0.037 |
| 1.0 | 0.667 / 1.000 / 0.800 / 0.370 | 0.667 / 1.000 / 0.800 / 0.370 | 0.99 | 0.741 / 1.000 / 0.851 / 0.259 |

### T5. Paired AUROC differences on held-out pool (val + test_dedup, n=47), bootstrap 95% CI

| w | AUROC(w) - AUROC(0.5), corrected | corrected - swapped, same w |
|---|---|---|
| 0.0 | +0.000 [+0.000, +0.000] (no change) | +0.000 [+0.000, +0.000] (no change) |
| 0.1 | +0.000 [+0.000, +0.000] (no change) | +0.000 [+0.000, +0.000] (no change) |
| 0.2 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.3 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.4 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.5 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.6 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.7 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.8 | +0.000 [+0.000, +0.000] (no change) | +0.032 [+0.000, +0.106] (within noise) |
| 0.9 | +0.002 [+0.000, +0.011] (within noise) | +0.033 [+0.000, +0.111] (within noise) |
| 1.0 | +0.000 [-0.011, +0.011] (within noise) | +0.111 [+0.032, +0.217] |

### T5b. Same cases, two weights: cases flagged by only one of them (exact McNemar p)

| set | comparison | cut-off | supported cases flagged only by first / only by second (p) | failures flagged only by first / only by second (p) |
|---|---|---|---|---|
| test | w0.5 vs w0.3 | 0.4 | 6 / 0 (p=0.0312) | 0 / 0 (p=1.0) |
| test | w0.5 vs w0.3 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| test | w0.5 vs w0.0 | 0.4 | 6 / 0 (p=0.0312) | 0 / 0 (p=1.0) |
| test | w0.5 vs w0.0 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| test | w0.3 vs w0.0 | 0.4 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| test | w0.3 vs w0.0 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| test | w0.4 vs w0.3 | 0.4 | 2 / 0 (p=0.5) | 0 / 0 (p=1.0) |
| test | w0.4 vs w0.3 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| held_out_pool | w0.5 vs w0.3 | 0.4 | 8 / 0 (p=0.0078) | 0 / 0 (p=1.0) |
| held_out_pool | w0.5 vs w0.3 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| held_out_pool | w0.5 vs w0.0 | 0.4 | 8 / 0 (p=0.0078) | 1 / 0 (p=1.0) |
| held_out_pool | w0.5 vs w0.0 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| held_out_pool | w0.3 vs w0.0 | 0.4 | 0 / 0 (p=1.0) | 1 / 0 (p=1.0) |
| held_out_pool | w0.3 vs w0.0 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |
| held_out_pool | w0.4 vs w0.3 | 0.4 | 3 / 0 (p=0.25) | 0 / 0 (p=1.0) |
| held_out_pool | w0.4 vs w0.3 | 0.7 | 0 / 0 (p=1.0) | 0 / 0 (p=1.0) |

### T3b. Key operating points with intervals (FPR and recall: Wilson 95%; F1: bootstrap 95%)

| view | w | cut-off | set | flagged supported / supported | FPR | recall | F1 |
|---|---|---|---|---|---|---|---|
| corrected | 0.0 | 0.7 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| corrected | 0.0 | 0.7 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 0.950 [0.764, 0.991] | 0.927 [0.842, 1.000] |
| corrected | 0.0 | 0.4 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| corrected | 0.0 | 0.4 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 0.950 [0.764, 0.991] | 0.927 [0.842, 1.000] |
| corrected | 0.3 | 0.7 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| corrected | 0.3 | 0.7 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 0.950 [0.764, 0.991] | 0.927 [0.842, 1.000] |
| corrected | 0.3 | 0.4 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| corrected | 0.3 | 0.4 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 1.000 [0.839, 1.000] | 0.952 [0.889, 1.000] |
| corrected | 0.4 | 0.7 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| corrected | 0.4 | 0.7 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 0.950 [0.764, 0.991] | 0.927 [0.842, 1.000] |
| corrected | 0.4 | 0.4 | test | 3 / 17 | 0.176 [0.062, 0.410] | 1.000 [0.772, 1.000] | 0.897 [0.812, 1.000] |
| corrected | 0.4 | 0.4 | held_out_pool | 5 / 27 | 0.185 [0.082, 0.367] | 1.000 [0.839, 1.000] | 0.889 [0.816, 0.976] |
| corrected | 0.5 | 0.7 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| corrected | 0.5 | 0.7 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 0.950 [0.764, 0.991] | 0.927 [0.842, 1.000] |
| corrected | 0.5 | 0.4 | test | 7 / 17 | 0.412 [0.216, 0.640] | 1.000 [0.772, 1.000] | 0.788 [0.703, 0.897] |
| corrected | 0.5 | 0.4 | held_out_pool | 10 / 27 | 0.370 [0.215, 0.558] | 1.000 [0.839, 1.000] | 0.800 [0.727, 0.889] |
| swapped | 0.5 | 0.7 | test | 1 / 17 | 0.059 [0.011, 0.270] | 1.000 [0.772, 1.000] | 0.963 [0.897, 1.000] |
| swapped | 0.5 | 0.7 | held_out_pool | 2 / 27 | 0.074 [0.021, 0.234] | 0.950 [0.764, 0.991] | 0.927 [0.842, 1.000] |
| swapped | 0.5 | 0.4 | test | 11 / 17 | 0.647 [0.413, 0.827] | 1.000 [0.772, 1.000] | 0.703 [0.634, 0.788] |
| swapped | 0.5 | 0.4 | held_out_pool | 19 / 27 | 0.704 [0.515, 0.842] | 0.950 [0.764, 0.991] | 0.655 [0.586, 0.727] |
| swapped | 1.0 | 0.7 | test | 11 / 17 | 0.647 [0.413, 0.827] | 1.000 [0.772, 1.000] | 0.703 [0.634, 0.788] |
| swapped | 1.0 | 0.7 | held_out_pool | 19 / 27 | 0.704 [0.515, 0.842] | 0.950 [0.764, 0.991] | 0.655 [0.586, 0.727] |
| swapped | 1.0 | 0.4 | test | 11 / 17 | 0.647 [0.413, 0.827] | 1.000 [0.772, 1.000] | 0.703 [0.634, 0.788] |
| swapped | 1.0 | 0.4 | held_out_pool | 19 / 27 | 0.704 [0.515, 0.842] | 0.950 [0.764, 0.991] | 0.655 [0.586, 0.727] |

### T6. Overall-risk label on labelled cases by weight (dev+val+test_dedup, tool claims included as in the pipeline)

| w | supported: low / medium / high | failures: low / medium / high |
|---|---|---|
| 0.0 | 37 / 0 / 2 | 1 / 0 / 28 |
| 0.2 | 37 / 0 / 2 | 1 / 0 / 28 |
| 0.3 | 37 / 0 / 2 | 0 / 1 / 28 |
| 0.4 | 31 / 6 / 2 | 0 / 1 / 28 |
| 0.5 | 21 / 16 / 2 | 0 / 1 / 28 |
| 1.0 | 21 / 0 / 18 | 0 / 0 / 29 |

### T7. The 117 live rows (PR #83 dry run): label counts by weight

NLI argmax class on these rows: {'contradiction': 19, 'neutral': 96, 'entailment': 1}; premise+claim tokens min/median/max: [5, 25.5, 68].

| w | low | medium | high |
|---|---|---|---|
| 0.0 | 93 | 4 | 19 |
| 0.2 | 93 | 4 | 19 |
| 0.3 | 90 | 7 | 19 |
| 0.4 | 13 | 84 | 19 |
| 0.5 | 12 | 81 | 23 |
| 1.0 | 0 | 13 | 103 |
| (old stored labels) | 97 | 4 | 15 |

### T9. v1.0_multiagent.json: corrected-label NLI on agent-output pairs (earlier output = premise)

| category | failure? | pairs | mean c / n / e | argmax c / n / e | pairs scoring > 0.4 at w = 0 / 0.3 / 0.5 |
|---|---|---|---|---|---|
| Adjacent contradiction | True | 3 | 0.999 / 0.0 / 0.0 | 3 / 0 / 0 | 3 / 3 / 3 |
| Agreement (true negative) | False | 6 | 0.003 / 0.658 / 0.339 | 0 / 4 / 2 | 0 / 0 / 4 |
| Different topic, not contradiction (over-trigger control) | False | 2 | 0.987 / 0.013 / 0.0 | 2 / 0 / 0 | 2 / 2 / 2 |
| Known limitation (untuned implicit contradiction) | True | 3 | 0.984 / 0.016 / 0.0 | 3 / 0 / 0 | 3 / 3 / 3 |
| Negation contradiction | True | 2 | 1.0 / 0.0 / 0.0 | 2 / 0 / 0 | 2 / 2 / 2 |
| Non-adjacent contradiction | True | 4 | 1.0 / 0.0 / 0.0 | 4 / 0 / 0 | 4 / 4 / 4 |
| Paraphrased agreement (over-trigger control) | False | 3 | 0.33 / 0.333 / 0.338 | 1 / 1 / 1 | 1 / 1 / 2 |
| Partial refinement, not contradiction (over-trigger control) | False | 1 | 0.049 / 0.325 / 0.626 | 0 / 0 / 1 | 0 / 0 / 0 |

All benign pairs: 12; argmax {'contradiction': 3, 'neutral': 5, 'entailment': 4}; share scoring > 0.4 at w=0.5: 0.667 [0.391, 0.862].

### T11. 100 real verifier answers (refusal_disagreement.json), corrected labels

| group | n | mean c / n / e | NLI argmax c / n / e | score > 0.4 at w=0 | at w=0.3 | at w=0.5 | score > 0.7 at w=0.5 |
|---|---|---|---|---|---|---|---|
| correct accept (evidence relevant, verifier accepted) | 50 | 0.179 / 0.669 / 0.152 | 8 / 35 / 7 | 0.180 [0.098, 0.308] | 0.240 [0.143, 0.374] | 0.820 [0.692, 0.902] | 0.160 [0.083, 0.285] |
| correct refuse (evidence irrelevant, verifier refused) | 47 | 0.897 / 0.102 / 0.001 | 44 / 3 / 0 | 0.936 [0.828, 0.978] | 0.979 [0.889, 0.996] | 1.000 [0.924, 1.000] | 0.936 [0.828, 0.978] |
| over-refusal (evidence relevant, verifier refused) | 3 | 0.938 / 0.06 / 0.002 | 3 / 0 / 0 | 1.000 [0.439, 1.000] | 1.000 [0.439, 1.000] | 1.000 [0.439, 1.000] | 1.000 [0.439, 1.000] |

### T10. Real LLM answers to supported test prompts, bounded from stored risks (texts were not stored)

| run | runs | old risk < 0.10 | new risk certainly > 0.4 | old risk >= 0.40 |
|---|---|---|---|---|
| qwen3-8b (old formula w=1, swapped) | 105 | 56 | 61 | 44 |
| llama3.1-8b (w=0.5, swapped) | 105 | 44 | 44 | 56 |

### T8. Reproduction of published numbers from the swapped view

| check | published | swapped view (this run) | corrected view (this run) |
|---|---|---|---|
| calibration dev sweep rows identical | 88 rows | 88/88 | n/a |
| calibration, selected (w, t) on test | F1 0.963 / FPR 0.059 (tp 13 fp 1 fn 0 tn 16) | w=0.5, t=0.5: F1 0.963 / FPR 0.059 (tp 13 fp 1 fn 0 tn 16) | w=0.5, t=0.5: F1 0.897 / FPR 0.176 (tp 13 fp 3 fn 0 tn 14) |
| calibration, old formula w=1.0 on test | F1 0.703 / FPR 0.647 (tp 13 fp 11 fn 0 tn 6) | t=0.3: F1 0.703 / FPR 0.647 (tp 13 fp 11 fn 0 tn 6) | t=0.9: F1 0.839 / FPR 0.294 (tp 13 fp 5 fn 0 tn 12) |
| calibration, weights tied at max dev F1 | 10 | 10 | 10 |
| ablation Config B (contradiction > 0.60), test | {'tp': 13, 'fp': 1, 'fn': 0, 'tn': 16} | {'tp': 13, 'fp': 1, 'fn': 0, 'tn': 16} | same by construction |
| ablation Config G, test | {'tp': 13, 'fp': 1, 'fn': 0, 'tn': 16} | {'tp': 13, 'fp': 1, 'fn': 0, 'tn': 16} | {'tp': 13, 'fp': 3, 'fn': 0, 'tn': 14} |
| llm_judge NLI side (>= 0.5), per-case score max abs diff | 0 | 0.0005 | 0.4985 |
| llm_judge NLI side confusion | {'tp': 13, 'fp': 1, 'fn': 0, 'tn': 16} | {'tp': 13, 'fp': 1, 'fn': 0, 'tn': 16} | {'tp': 13, 'fp': 3, 'fn': 0, 'tn': 14} |
| pipeline vs formula (corrected, max abs diff) | 0 | n/a | 0.0001 |

### T8b. The calibration report's own table, rebuilt (same script logic: dev-selected, rule `score >= threshold`)

| formula | split | view | precision | recall | F1 | FPR | tp / fp / fn / tn |
|---|---|---|---|---|---|---|---|
| new (w=0.5, t=0.5 fallback) | dev | swapped (t=0.5) | 1.0 | 1.0 | 1.0 | 0.0 | 9 / 0 / 0 / 12 |
| new (w=0.5, t=0.5 fallback) | dev | corrected (t=0.5) | 0.75 | 1.0 | 0.857 | 0.25 | 9 / 3 / 0 / 9 |
| new (w=0.5, t=0.5 fallback) | test | swapped (t=0.5) | 0.929 | 1.0 | 0.963 | 0.059 | 13 / 1 / 0 / 16 |
| new (w=0.5, t=0.5 fallback) | test | corrected (t=0.5) | 0.812 | 1.0 | 0.897 | 0.176 | 13 / 3 / 0 / 14 |
| old (w=1.0, own dev-best t) | dev | swapped (t=0.3) | 0.692 | 1.0 | 0.818 | 0.333 | 9 / 4 / 0 / 8 |
| old (w=1.0, own dev-best t) | dev | corrected (t=0.9) | 0.6 | 1.0 | 0.75 | 0.5 | 9 / 6 / 0 / 6 |
| old (w=1.0, own dev-best t) | test | swapped (t=0.3) | 0.542 | 1.0 | 0.703 | 0.647 | 13 / 11 / 0 / 6 |
| old (w=1.0, own dev-best t) | test | corrected (t=0.9) | 0.722 | 1.0 | 0.839 | 0.294 | 13 / 5 / 0 / 12 |

PyTorch vs ONNX on the same 73 cases: max abs probability difference 0.0001; cases whose 0.4 / 0.7 flag differs at w=0.5: []; argmax label differs: [].
