# Archived decks

These files are kept for the record. **Do not present them.**

| File | Why it is here | Use instead |
| :--- | :--- | :--- |
| `AgentPulse_Final_Review.pptx` | Superseded on 2026-10-25. It was built by an older version of `presentation/build_final_review.js` and was never rebuilt after the latency figures changed: slide 5 says the end-to-end cascade takes 215.9 ms with a 27.8 ms MiniLM stage. Those are the 2026-08-23 ablation run; the run in `experiments/results/ablation_results.json` (2026-09-18, PyTorch path) records 151.19 ms for the two models together, 132.09 ms for DeBERTa and 19.1 ms for MiniLM. It also describes MiniLM as a gate that decides whether DeBERTa runs, which the code does not do (both models run on every span). | `presentation/AgentPulse_Final_Review_v2.pptx`, rebuilt from `build_final_review.js` (whose default output is now the `_v2` file) |

How to rebuild the current decks: see the header comment of each `presentation/build_*.js` / `build_*.py` script. Each rebuild was checked on 2026-10-25 by building the committed script first and comparing the text of the result with the committed file (identical), then applying the changes.
