# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23 ~19:50 IST, to let a fresh chat session pick up where this one left off.
**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\project one agent`.
**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming — the whole session has been about replacing fake/inflated numbers with real measured ones.

---

## 1. What happened this session, in order

### A. Security/production audit and fixes (all complete, verified)
An independent audit found and fixed:
- **Critical: auth bypass** — `backend/app/middleware.py` allowlist matched every path via bare `"/"`. Fixed.
- **Critical: fabricated benchmark numbers** — reasoning-strategy latencies (0.04-0.15ms) were a deterministic fallback stub, not real model inference (`load_immediately` was never `True` anywhere).
- **High: path traversal** in `backend/app/routers/experiments.py` dataset endpoint. Fixed.
- **High: fake 404s** returned as HTTP 200 (tuple return bug) in `backend/app/routers/__init__.py`. Fixed.
- **High: blocking ML inference** on the event loop in `backend/app/routers/ingest.py`. Fixed via thread pool offload.
- **High: drift baselines never persisted** to DB despite schema existing. Fixed.
- Scaled to a **10,000-request load test target**: went through 6 iterations discovering real bugs each time (thread oversubscription, SQLite busy_timeout only applied to 1 connection not the pool, GIL contention making MORE eval threads WORSE not better). Final state: **10,000/10,000 succeeded, 0 failures, 97 req/s**. Key finding worth remembering: eval thread pool sized to 1 worker beats 16 workers for this CPU-bound workload (GIL contention).
- **Docker**: `docker compose up --build` was never actually tested before. Found and fixed 4 real bugs: missing README.md in build context, unnecessary CUDA deps bloating the image (fixed with CPU-only torch index), malformed SQLite URL (3 slashes = relative path, needed 4), WAL mode failing on Windows bind mounts (switched to named Docker volume). Verified end-to-end working.
- Test suite: **99/99 passing** (was 92 at start of session).

### B. GitHub — private repo created and maintained
- Installed `gh` CLI, authenticated as **Soum-Code** (device-code browser flow).
- Repo: **https://github.com/Soum-Code/agentpulse** (private).
- Found and scrubbed a stray file `omniroute_claude_code_guide.md` (unrelated tool's guide, contained a plaintext password) — removed from working tree AND git history via amend + force-push, before it could linger.
- `.gitignore` hardened: excludes `.venv/`, `node_modules/`, `models/` (5GB+ GGUF cache), `data/` (SQLite db), `.claude/skills/` (local tool config, not project code).
- Multiple commits pushed since; latest state should be checked via `git log` in a new session.

### C. Documentation — all AI-style writing removed (user's explicit request)
Rewrote every `.md` file in the repo (README, PROJECT_REPORT, all audit/report files) removing emoji, checkmark bullets, excessive bold, and AI-generated phrasing patterns. While doing this, also fixed content accuracy (many reports had stale/fabricated numbers).

**Important finding + fix**: `HUMAN_ANNOTATION_REPORT.md` claimed human annotation but its own text said annotators were "2 Independent Expert AI Systems Evaluators" — not humans. Renamed to **`LABEL_AGREEMENT_REPORT.md`** and rewrote honestly as LLM-as-judge dual-evaluation, not human annotation. All cross-references updated (README, PROJECT_REPORT, EMPIRICAL_AUDIT, THRESHOLD_ANALYSIS, `scripts/expand_dataset.py`).

Report-generating Python scripts (`experiments/ablation.py`, `experiments/drift_scenarios.py`, `experiments/reasoning_strategies.py`, `experiments/compounding_error.py`) were also fixed at the source (not just their output .md files), so future re-runs stay clean.

### D. Empirical validation work (in response to a large "master prompt" checklist the user pasted, covering rigor/honesty requirements for the research claims)
- **Ablation study rewritten** (`experiments/ablation.py`): now properly separates threshold selection (on `v1.0_dev`) from reporting (on held-out `v1.0_test`) — previously threshold sweeps were done on the same set being reported on. Found and reported (not hidden) that drift-signal and full-pipeline configs score WORSE than plain NLI-only on this dataset (drift's cold-start centroid flags most non-failure cases; FPR 0.941 for that config). Also found dev-split threshold sweep is currently uninformative (every combination ties at F1=1.0 — dataset too small to discriminate).
- **Dataset expanded** 50 → 73 cases (`scripts/expand_dataset.py`) via deterministic construction (ground truth correct by construction, not annotator judgment), split 21/22/30 across dev/val/test. Documented as distinct from the original 50 dual-evaluated cases in `LABEL_AGREEMENT_REPORT.md`.
- **Compounding-error experiment** (`experiments/compounding_error.py`) already had control-vs-intervention conditions; cleaned up dead code (unused LLM adapter) and added a documented known-limitation: comparing identical text against itself scores ~0.99 risk instead of ~0 because DeBERTa NLI classifies self-comparison as "neutral" not "entailment", and `grounding_score = 1 - entailment_prob` punishes neutral almost as hard as contradiction. **This grounding-score formula issue is diagnosed but NOT fixed** — deliberately deferred (see Section 3 below).
- **Drift experiment** (`DRIFT_EXPERIMENT_REPORT.md`) was already solid (graded 10/25/50% shifts + 3 negative controls) — only needed style cleanup, not a rewrite.

### E. Real LLM inference — the biggest technical thread
The original project never actually ran a real LLM — every "Qwen 2.5 7B" benchmark was a fake fallback stub. Fixed by:
1. **Model chosen**: `Qwen/Qwen3-8B-GGUF` (Q4_K_M quantization, ~5GB), official Qwen team release. Downloaded locally to `models/gguf/Qwen3-8B-Q4_K_M.gguf`. (A 27B "uncensored" community model was considered and rejected — doesn't fit 17GB RAM comfortably, unofficial provenance, CPU-inference too slow.)
2. **New adapter**: `llm_adapters/local_gguf.py` — `LocalGGUFAdapter(LLMAdapter)` using `llama-cpp-python`. Handles Qwen3's "thinking mode" (`/no_think` suffix + strips `<think>` blocks), uses physical core count not logical (avoids hyperthreading overhead), fails loudly instead of silently falling back to fake data. `llm_adapters/qwen.py` adds `Qwen3GGUFAdapter`, `llm_adapters/__init__.py` factory routes `"qwen3"` to it — existing `qwen-7b`/`qwen-0.5b` routing untouched, all existing tests still pass.
3. **`n_gpu_layers` parameter added** to `LocalGGUFAdapter` for GPU offload support (0=CPU default, -1=full GPU offload) — added specifically to support the Kaggle GPU path (see below).
4. **`experiments/reasoning_strategies.py` fixed**: now actually sets `load_immediately=True`, has a warm-up call excluded from stats, reports real stdev/median not just means, and — most importantly — **derives its conclusions from the data instead of asserting them**. If the spread between strategies is smaller than the within-strategy run-to-run stdev, it now explicitly writes "INCONCLUSIVE" instead of declaring a winner. Also fixed `reasoning/aot.py` to accept a uniform `max_tokens` across all its sub-calls (was previously hardcoded per-phase, making cross-strategy token-budget comparison unfair).
5. **Local CPU benchmark measured for real**: 4.3 tokens/sec sustained on this machine (16 logical/8 physical cores, no GPU). A 2-case validation run produced genuinely different numbers from the old fake ones (16-96 seconds per call vs the old 0.04-0.15ms) — proof the fix works.

## 2. What's currently RUNNING right now (check status first in the new session)

**Two parallel attempts at the same 30-case × 5-run × 3-strategy (Direct/CoT/AoT) reasoning benchmark, racing each other — whichever finishes first gets used for the report:**

### Run 1: Local CPU
- Command: `python experiments/reasoning_strategies.py` (defaults: `model_name="qwen3-8b"`, all 30 test cases, `n_runs=5`, `max_tokens=200`)
- Started ~16:59 IST, still running as of ~19:50 IST (2h50m+ elapsed). Estimated total time 6-8 hours at 4.3 tok/s (30 cases × 5 runs × 8 calls/case-run [Direct=1, CoT=1, AoT=6] = 1200 calls).
- **Check status**: `tasklist | grep python` (look for a process using several GB RAM — that's the one with the model loaded) and check `experiments/results/reasoning_strategy_results.json`'s `timestamp`/`n_cases` fields — if `n_cases: 30` (not 2) and a recent timestamp, it finished.
- If it's still running and you don't want to wait, it's safe to just let it keep running in the background — check back later.

### Run 2: Kaggle GPU (much more eventful — read this carefully)
- Set up entirely via **Kaggle API/CLI** (no browser needed) — `kaggle` Python package installed, using the user's pre-existing `~/.kaggle/kaggle.json` credentials (username `somnath26`).
- **Kaggle Dataset**: `somnath26/agentpulse-code` — a minimal export of `backend/`, `sdk/`, `reasoning/`, `datasets/`, `llm_adapters/` (NOT `.venv`, models, or anything heavy), uploaded with `--dir-mode zip` (so it's 4-5 separate .zip files inside the dataset, not one big zip — the notebook auto-extracts these). Local export staging dir: `/tmp/agentpulse_export` (gitbash path) — recreate from the project dirs if needed.
- **Kaggle Kernel (notebook)**: `somnath26/agentpulse-reasoning-benchmark`, GPU-enabled. Source notebook lives in the repo at `kaggle/agentpulse_reasoning_benchmark.ipynb` and is built by a generator script (was in the session's scratchpad, not saved permanently — if you need to regenerate it, the notebook's cells are visible by opening the `.ipynb` file directly, it's just JSON).
- **What the notebook does**: extracts the zipped dataset, `pip install -e` the sdk and backend packages (so it imports the REAL project code — same `reasoning/*.py`, same `EvaluationPipeline`, not a reimplementation), installs `llama-cpp-python` with CUDA, downloads the same `Qwen3-8B-Q4_K_M.gguf` from Hugging Face directly on Kaggle, loads it via `LocalGGUFAdapter(n_gpu_layers=-1)`, and runs the identical benchmark loop as the local script — so results are directly comparable/interchangeable.
- **Debugging history (6 failed pushes before success)** — useful context if it fails again:
  1. v1: `ModuleNotFoundError: llm_adapters` — forgot to include that package in the dataset export. Fixed by adding it.
  2. v2 (tried `transformers`+`bitsandbytes` 4-bit quant instead of llama.cpp at this point): crashed with `Error named symbol not found ... ops.cu` — **Kaggle assigned a Tesla P100 GPU** (old Pascal architecture, compute capability sm_60), and bitsandbytes' compiled CUDA kernels don't support it. This is why the notebook switched to llama.cpp instead (much broader GPU generation support).
  3. v3: `llama-cpp-python` CUDA build failed silently (Jupyter `!pip install` failures don't raise/stop execution) — the notebook kept running, downloaded the 5GB model, THEN crashed on `import llama_cpp`. Fixed by making the install cell check `returncode` and raise explicitly.
  4. v4: same build failure, but now fails fast (good) — the actual pip error was hidden because `-q` (quiet) suppresses the build subprocess's own output. Fixed by adding `-v` and printing full stdout/stderr.
  5. v5: with verbose output, found the real error: `CMake Error ... CUDA::cuda_driver ... target was not found` — CMake couldn't find the CUDA driver stub library in the build sandbox. This is a known category of issue in containerized/cloud build environments.
  6. v6/v7 fix (**this is the one that's currently running and appears to be working** — past 20+ minutes without erroring, further than any previous attempt): stopped trying to build from source. Now tries a **prebuilt CUDA wheel** first (`pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/{cuda_tag}`, with `cuda_tag` auto-detected from `torch.version.cuda`), and only falls back to source-building (with an explicit CUDA-stub-path fix) if that fails.
- **Also fixed along the way**: `kaggle kernels output` (for downloading logs) was hanging/extremely slow because it tries to download ALL output files including the 5GB model weights sitting in `/kaggle/working/`. Fix: use `--file-pattern ".*\.log$"` to fetch only the log. The current notebook version also deletes the model directory at the end via `shutil.rmtree` so this won't recur once a run finishes cleanly.
- **How to check status**: `python -m kaggle kernels status somnath26/agentpulse-reasoning-benchmark` (values seen: `RUNNING`, `ERROR`, presumably `COMPLETE` when done). Note: on this Windows/git-bash setup, `gh`/`kaggle` binaries need `export PATH="$PATH:/c/Program Files/GitHub CLI"` or full path; the kaggle CLI is invoked as `python -m kaggle ...` via the project's `.venv` Python.
- **How to get results once complete**: `python -m kaggle kernels output somnath26/agentpulse-reasoning-benchmark -p <dir> -o` (now safe/fast since the model gets cleaned up) — grab `reasoning_strategy_results.json` from there.
- **If it fails again**: get the log with `--file-pattern ".*\.log$"` first (much faster than full output), it's a Kaggle "execution log" API response — JSON list of `{"data": ..., "stream_name": ...}` entries; concatenate `entries[i]['data']` to read it as text (write to a file with `encoding='utf-8'` before printing — Windows console can't render some of the ANSI/progress-bar bytes directly, causes `UnicodeEncodeError` if you print straight to console).

## 3. Explicitly deferred / not done

- **Grounding-score neutral-vs-entailment bug**: `grounding_score = 1 - entailment_prob` treats "neutral" NLI classifications almost as harshly as "contradiction", causing self-evidently-true statements to score as high-risk. Root cause confirmed (self-comparison test: entailment_prob=0.011, neutral_prob=0.9865, contradiction_prob=0.0023). **User agreed to defer the actual formula fix** until compute isn't tied up in the overnight runs, so it can get the same dev/test rigor treatment the ablation study got — don't just patch it ad hoc.
- **Second model for generalization** (e.g. Llama) — not benchmarked with real inference. Only Qwen3-8B has real numbers.
- **Tool validator formal precision/recall benchmark**, **dashboard end-to-end test with real traces**, **trace-to-dataset loop demonstration**, **compiled hostile-audit document** (Part 32 of the master prompt) — all still open from the master validation checklist, not started.
- The 5 Claude Code skills the user asked about earlier (`agent-browser`, `gsd`/get-shit-done, `taste`, `mcp-builder`, `find-skills`) — researched and install commands given, but user got distracted into the GPU tangent before confirming which `taste` variant they wanted or running the installs. Still pending if they care.

## 4. Once a reasoning-strategy run finishes (local or Kaggle, whichever first)

1. If Kaggle's result is used: download it and overwrite `experiments/results/reasoning_strategy_results.json` locally with it (adjust `provider`/`hardware` fields are already self-describing so no manual editing needed).
2. Re-run is NOT needed to regenerate the report — `experiments/reasoning_strategies.py`'s report-writing logic already produces `REASONING_STRATEGY_EVALUATION_REPORT.md` from whatever's in that JSON, but only if you re-run the script. If using the Kaggle JSON directly without re-running the local script, you'll need to either adapt the report-writing function to read from an existing JSON, or just manually update `REASONING_STRATEGY_EVALUATION_REPORT.md` and `PROJECT_REPORT.md` Section 4 with the real numbers (mean/median/stdev latency, tokens, grounding risk per strategy) following the same honest, data-derived-not-assumed conclusion style used throughout this session.
3. Update `PROJECT_REPORT.md` Section 4 (currently says results are pending) and `REAL_MODEL_BENCHMARK_REPORT.md` (currently says the same).
4. Commit and push to `https://github.com/Soum-Code/agentpulse`.
5. Then move to whatever's next from Section 3's deferred list — probably the grounding-score formula fix, since it's already diagnosed and just needs the implementation + revalidation.

## 5. Key facts worth not re-deriving

- Machine: Windows 11, 16 logical / 8 physical CPU cores, AMD integrated graphics (no discrete/NVIDIA GPU locally) — this is WHY the Kaggle GPU detour happened.
- Python env: `.venv` in project root, activate via `.venv/Scripts/python.exe` directly (this is git-bash on Windows, not WSL).
- GitHub: `gh` CLI authenticated as `Soum-Code`. Kaggle: `kaggle` CLI authenticated as `somnath26` via pre-existing `~/.kaggle/kaggle.json`.
- User's actual identity/email for attribution: `p.somnathreddy26@gmail.com`.
- User strongly prefers: real measurements over assumptions, negative findings reported not hidden, terse Hinglish communication, minimal but not zero comments in code.
