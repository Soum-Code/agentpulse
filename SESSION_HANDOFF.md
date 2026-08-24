# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23 ~19:50 IST. **Last updated:** 2026-08-24 (Kaggle GPU run closed out — see Section 0 top bullet and Section 2/4, now stale below that point for the GPU thread specifically).
**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\project one agent`.
**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming — the whole session has been about replacing fake/inflated numbers with real measured ones.

## 0. TL;DR of where things stand right now

- **The Kaggle GPU run finished and was discarded — do not re-check its status or try to resume it.** It completed (`KernelWorkerStatus.COMPLETE`) but produced invalid data: all 450 grounding-risk values were exactly `0.0` because `grounding.py`'s fail-open `load_models()` silently failed to load the NLI/embedding models on Kaggle (execution log downloaded empty, exact cause unconfirmed), and the notebook's `eval_res.overall_risk_score or 0.0` masked that failure as a fake zero. Latencies from the same run were also slower than the local CPU run on every strategy, inconsistent with real GPU offload. User decision when shown this: **discard, don't build a GPU-vs-CPU comparison, just document it as a known failure.** Documented in `PROJECT_REPORT.md` Section 4 (new paragraph after the CPU results table) and here. The downloaded artifacts (`reasoning_strategy_results.json` for the GPU run, empty log) were left in a temp dir, not committed to the repo. Sections 2, 4, and 7 below still describe this as "RUNNING" / "once it finishes" — that framing is now stale, superseded by this bullet and by Section 4's replacement note.
- The local CPU reasoning-strategy benchmark **finished** (Section 2's "Run 1" below is done, not pending). Real results are committed (commit `393dd69`). `REASONING_STRATEGY_EVALUATION_REPORT.md`, `REAL_MODEL_BENCHMARK_REPORT.md`, and `PROJECT_REPORT.md` Section 4 all now contain the real numbers — the "pending" language mentioned further down in this doc for that part is stale, see Section 2A.
- The Kaggle GPU run (Section 2's "Run 2") is **still `RUNNING`** as of this update (~23:10 IST, ~6h+ elapsed since the v7 push that fixed the CUDA build). The user has decided NOT to race the two anymore — decision: **`Chalne do, GPU-vs-CPU compare karenge`** (let it keep running, we'll do a GPU-vs-CPU comparison once it finishes, on top of the already-committed local CPU numbers, not instead of them). Check status with `./.venv/Scripts/python.exe -m kaggle kernels status somnath26/agentpulse-reasoning-benchmark`.
- Docker containers were stopped (`docker compose down`) — the earlier background Docker-rebuild attempts were stale/dead (backend container had crashed hours earlier; dashboard was unhealthy) and got cleaned up. Nothing is running in Docker right now. Docker itself was already verified working end-to-end earlier in the session (see Section 1A) — this cleanup does not undo that verification, it just tore down leftover stopped/crashed containers from repeated manual test runs.
- A system-triggered PR-creation flow asked for a PR from `main` — **not possible as-is**: this whole repo has only ever had a `main` branch, everything was committed directly to it, so there's no second branch to diff against. This is explained to the user but **not yet decided** — they have not said whether to start using feature branches going forward or keep committing straight to `main`.
- **The grounding-score formula bug is now FIXED** (was previously deferred — see the old Section 3 wording below, now stale). `backend/app/services/grounding.py`'s `grounding_score` changed from `1 - entailment_prob` to `contradiction_prob + 0.5 * neutral_prob` (constant `NEUTRAL_RISK_WEIGHT`). The 0.5 weight came from the same dev/test discipline as the ablation study, via a new script `experiments/grounding_score_calibration.py` → `GROUNDING_SCORE_CALIBRATION_REPORT.md`: the dev-split sweep couldn't discriminate between candidate weights (every weight 0.0-0.9 tied at F1=1.0, same failure mode as the ablation study's own dev sweep), so 0.5 is reported honestly as a principled default, not a data-fitted value — but the held-out test-split result is a real, measured improvement: F1 0.703→0.963, FPR 0.647→0.059. The documented self-comparison case (Node_A in `experiments/compounding_error.py`) moved from risk 0.989 (high_risk) to 0.495 (medium_risk) — improved, not eliminated, since neutral still carries some weight by design. `experiments/ablation.py` and `experiments/compounding_error.py` were re-run and their outputs (`ablation_results.json`, `THRESHOLD_ANALYSIS.md`, `compounding_error_results.json`) regenerated; `PROJECT_REPORT.md` Sections 3, 5, and 6 updated to match. `pytest tests/ -q` still 99/99 passing (no test pinned the old grounding_score values). Committed and pushed as `73b533f`.
- **The dashboard was rewritten** with a new design system ("Signal Deck") and, more importantly, **was found to be displaying fabricated numbers** that contradicted the corrected reports. See Section 8 below.
- **Claude Code plugins installed** (user request): `frontend-design`, `modern-web-guidance`, `playwright`, all from `claude-plugins-official`. A fourth, `ui-theme-designer`, was installed then removed after inspection — despite the name it is SAP Fiori/UI5-only and irrelevant here. Plugins load at session start, so `frontend-design` was NOT available during the redesign; a fresh session would let it inform further polish. Note the marketplace has no literal `taste`, `vercel web design`, `awesome design`, or a working `image to code` — those are community-marketplace names; add via `claude plugin marketplace add <repo>` if wanted.
- Repo state: pushed through commit `a44c859`. Working tree clean. Commits this stretch: `73b533f` (grounding-score fix), `240b313` (dashboard redesign), `a44c859` (remaining views + fabricated-number corrections).

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

**Two parallel attempts at the same 30-case × 5-run × 3-strategy (Direct/CoT/AoT) reasoning benchmark. Originally framed as "whichever finishes first gets used" — revised once Run 1 finished (see Section 2A) to "keep both, compare GPU vs CPU."**

### Run 1: Local CPU — DONE, results committed
- Command: `python experiments/reasoning_strategies.py` (defaults: `model_name="qwen3-8b"`, all 30 test cases, `n_runs=5`, `max_tokens=200`)
- Started ~16:59 IST, **completed 2026-08-23 17:28:17 UTC** (i.e. ~22:58 IST) — total run time was much shorter than the original 6-8h estimate.
- Real results are in `experiments/results/reasoning_strategy_results.json`, written up in `REASONING_STRATEGY_EVALUATION_REPORT.md`, and summarized in `REAL_MODEL_BENCHMARK_REPORT.md` / `PROJECT_REPORT.md` Section 4. See Section 2A below for the actual numbers — nothing further to do here, this run does not need to be re-run.

### Run 2: Kaggle GPU — still RUNNING, being kept for a GPU-vs-CPU comparison (much more eventful — read this carefully)
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
- **How to check status**: `./.venv/Scripts/python.exe -m kaggle kernels status somnath26/agentpulse-reasoning-benchmark` (plain `python -m kaggle` on this machine's system Python errors with `No module named kaggle.__main__` — always use the project's `.venv` python explicitly, not just `python`). Values seen so far: `RUNNING` (every check since the v7 push). Presumably `COMPLETE` or `ERROR` when it finishes.
- **Status as of this update (2026-08-23 ~23:10 IST)**: still `RUNNING`, roughly 6+ hours elapsed since the v7 push. Mid-run log fetches (`--file-pattern ".*\.log$"`) have consistently returned empty every time they were tried — this appears to be a real limitation of the Kaggle API for in-progress kernels (no partial/streaming log access), not a one-off glitch, so don't spend much time retrying it while the kernel is still running. There is currently no way to confirm mid-run whether it's actually using the GPU or has silently fallen back to CPU; that can only be confirmed once it completes (or from the final log if it errors).
- **User's decision**: explicitly agreed to keep letting it run rather than cancelling it ("Chalne do, GPU-vs-CPU compare karenge") once the local CPU run had already finished and produced usable results on its own. Do NOT cancel/delete this kernel without asking first — the user has previously and explicitly rejected a `kaggle kernels delete` call on this exact kernel ("nahi kaggle baad nahi karna hai" — don't touch Kaggle).
- **How to get results once complete**: `./.venv/Scripts/python.exe -m kaggle kernels output somnath26/agentpulse-reasoning-benchmark -p <dir> -o` (should be fast since the notebook cleans up the model directory at the end) — grab `reasoning_strategy_results.json` from there.
- **If it fails again**: get the log with `--file-pattern ".*\.log$"` first (much faster than full output), it's a Kaggle "execution log" API response — JSON list of `{"data": ..., "stream_name": ...}` entries; concatenate `entries[i]['data']` to read it as text (write to a file with `encoding='utf-8'` before printing — Windows console can't render some of the ANSI/progress-bar bytes directly, causes `UnicodeEncodeError` if you print straight to console).
- **Once it completes**, produce a GPU-vs-CPU comparison alongside (not replacing) the already-committed local CPU numbers from Section 2A — see Section 4 for exactly what to update.

## 2A. Real local-CPU benchmark results (already committed, commit `393dd69`)

30 test cases x 5 stochastic runs x 3 strategies (Direct/CoT/AoT), `max_tokens=200` per call, real Qwen3-8B-Q4_K_M inference via llama.cpp on CPU (16 logical / 8 physical cores, no GPU). Completed 2026-08-23 17:28:17 UTC.

| Strategy | Mean latency (ms) | Median (ms) | Std Dev (ms) | Mean tokens out | Mean grounding risk | Risk Std Dev |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| DIRECT | 11564.1 | 6044.7 | 13667.7 | 37.5 | 0.424 | 0.377 |
| COT | 45422.7 | 47682.3 | 7549.1 | 186.4 | 0.283 | 0.324 |
| AOT | 85215.2 | 74577.1 | 36663.8 | 319.7 | 0.233 | 0.331 |

The report generator's own code (not a manual judgment call) determined grounding risk is **INCONCLUSIVE**: the spread between strategy means (0.191) is smaller than the largest within-strategy standard deviation (0.377). The one real, defensible finding: AOT costs ~8.5x DIRECT's output tokens for a risk difference that isn't statistically distinguishable on this sample. Full detail in `REASONING_STRATEGY_EVALUATION_REPORT.md`; the same numbers are also summarized in `REAL_MODEL_BENCHMARK_REPORT.md` and `PROJECT_REPORT.md` Section 4. `pytest tests/ -q` was re-run after these updates: **99/99 passing**. This was pushed as commit `393dd69` ("Real reasoning-strategy benchmark results (Qwen3-8B, 30 cases x 5 runs)").

## 3. Explicitly deferred / not done

- ~~Grounding-score neutral-vs-entailment bug~~ — **FIXED**, see the TL;DR bullet in Section 0 and `GROUNDING_SCORE_CALIBRATION_REPORT.md`. No longer deferred.
- **Second model for generalization** (e.g. Llama) — not benchmarked with real inference. Only Qwen3-8B has real numbers.
- **Tool validator formal precision/recall benchmark**, **dashboard end-to-end test with real traces**, **trace-to-dataset loop demonstration**, **compiled hostile-audit document** (Part 32 of the master prompt) — all still open from the master validation checklist, not started.
- The 5 Claude Code skills the user asked about earlier (`agent-browser`, `gsd`/get-shit-done, `taste`, `mcp-builder`, `find-skills`) — researched and install commands given, but user got distracted into the GPU tangent before confirming which `taste` variant they wanted or running the installs. Still pending if they care.

## 4. Kaggle GPU run — CLOSED OUT, do not resume (was: "once it finishes")

This section originally held a 6-step plan for building a GPU-vs-CPU comparison once the Kaggle kernel completed. The kernel did complete (`KernelWorkerStatus.COMPLETE`, checked 2026-08-24), but its output was invalid (see Section 0's top bullet for the full diagnosis: silent grounding-model-load failure on Kaggle produced 450/450 fake `0.0` risk values, and latencies were slower than local CPU on every strategy). Shown this, the user chose to discard the run rather than fix-and-rerun or publish a latency-only report. The finding is written up in `PROJECT_REPORT.md` Section 4 (paragraph after the CPU results table). No comparison report exists or is planned. The local CPU numbers (Section 2A) remain the sole reasoning-strategy benchmark results for this project.

If this is ever revisited (not currently planned): the notebook (`kaggle/agentpulse_reasoning_benchmark.ipynb`) needs a `grounding.models_loaded()` assertion before the benchmark loop instead of letting `eval_res.overall_risk_score or 0.0` mask a failed evaluation as a real zero, and the execution-log download needs to actually capture output (it came back empty this time, which is why the root cause of the model-load failure was never confirmed).

## 5. Docker cleanup (done this update)

Earlier in the session, Docker was verified working end-to-end (Section 1 item — 4 real bugs found and fixed, full `docker compose up --build` succeeded). Since then, several more manual `docker compose up --build` invocations were run directly in the terminal (not backgrounded with `-d`), which stayed attached/streaming and became long-running background shell tasks that outlived their usefulness. The user reported 5 background tasks visible in their UI and asked to stop whichever weren't useful, while explicitly protecting the Kaggle kernel and the local benchmark run from being touched ("kaggle baad nahi karna hai, aur local cpu bhi nahi").

Resolution: rather than guessing at individual background-task IDs (not directly inspectable), ran `docker compose down` — this cleanly stopped and removed the containers (the backend container had actually already crashed several hours earlier per `docker ps -a`; the dashboard container was unhealthy) and caused the stale Docker-related background tasks to receive "completed" notifications automatically. The Kaggle kernel and the local CPU benchmark process were not touched. **Current state: nothing is running in Docker right now** — if you want to bring the stack back up to demo it, `docker compose up --build` from the project root should work cleanly since all 4 underlying bugs were already fixed and verified earlier in the session (missing README in build context, CPU-only torch index, SQLite URL slash count, named volume for WAL mode on Windows).

## 6. Open question: PR workflow vs direct-to-main (not yet decided)

A system-triggered PR-creation flow requested a pull request from branch `main` on `Soum-Code/agentpulse`. Checked `git branch -a` and `git ls-remote --heads origin` — this repo has only ever had a single `main` branch; every commit this session (security fixes, docs rewrite, ablation/dataset work, Qwen3 integration, benchmark results) was committed directly to `main`. A PR needs two distinct branches to diff, so one could not be created without first inventing a feature branch after the fact, which wasn't done.

This was explained to the user, who has not yet said which they want going forward:
- Keep committing directly to `main` (simpler, matches how the whole project has been built so far), or
- Start using feature branches + PRs from this point on (more conventional, gives a review/diff trail, but is a process change mid-project).

**Don't assume either way** — ask if this comes up again, or if you're about to make a commit and want to know which pattern to follow.

## 7. Key facts worth not re-deriving

- Machine: Windows 11, 16 logical / 8 physical CPU cores, AMD integrated graphics (no discrete/NVIDIA GPU locally) — this is WHY the Kaggle GPU detour happened.
- Python env: `.venv` in project root, invoke directly as `./.venv/Scripts/python.exe` (this is git-bash on Windows, not WSL — plain `python`/`python -m kaggle` on PATH hits the system Python, not the venv, which is missing the `kaggle` module's `__main__`; always use the full venv path for kaggle/project commands).
- GitHub: `gh` CLI authenticated as `Soum-Code`. Repo: `https://github.com/Soum-Code/agentpulse` (private). Kaggle: `kaggle` CLI authenticated as `somnath26` via pre-existing `~/.kaggle/kaggle.json`.
- User's actual identity/email for attribution: `p.somnathreddy26@gmail.com`.
- User strongly prefers: real measurements over assumptions, negative findings reported not hidden, terse Hinglish communication, minimal but not zero comments in code.
- Repo state as of this update: clean working tree, `main` at commit `393dd69`, 99/99 tests passing.

## 8. Dashboard redesign and the fabricated numbers it uncovered

**Why it was rewritten.** `dashboard/src/index.css` and `tailwind.config.js` still described an
abandoned "liquid glass + hand-drawn" direction (~250 lines of CSS, `Caveat` cursive font, ambient
blobs). `App.tsx` referenced **zero** of those classes, so the UI had silently fallen back to a
generic dark-slate/indigo admin-template look. That dead layer was replaced rather than patched.

**The design system** (`dashboard/src/index.css`, `dashboard/src/components/ui.tsx`,
`dashboard/src/components/SideRail.tsx`):
- Colour rule with a defensible rationale: brand cyan is used *only* for identity and interaction;
  emerald/amber/rose *only* for risk state. In a monitoring tool severity must be readable from
  colour alone, so the palettes are kept strictly disjoint. Risk thresholds now have a single
  definition (`riskTone()` in `ui.tsx`) mirroring `EvaluationPipeline._classify_risk`.
- Space Grotesk (UI) + JetBrains Mono (data), tabular numerals on every live readout.
- `Tile` primitive with HUD corner brackets, a pulse sweep rail, staggered entrance, animated
  count-ups, and a full `prefers-reduced-motion` path.
- Navigation moved from eight crammed top tabs to a left rail grouped Monitor / Investigate /
  Research.

**Real bugs found by verifying against the running backend** (this is why it was worth doing
end-to-end rather than eyeballing):
1. **Real-time updates never worked.** The dashboard connected to `/v1/ws`, but the backend route
   is `/v1/ws/live` (`backend/app/routers/websocket.py`). Fixed; now reports STREAM LIVE.
2. Vite proxy lacked `ws: true`, so the upgrade was proxied as plain HTTP.
3. The command palette rendered an `ESC` hint but never handled Escape. Both modals now close on
   Escape and backdrop click and carry `role="dialog"`.
4. Emoji used as structural icons; icon-only playback controls had no accessible names.

**Fabricated numbers that were hardcoded into the views.** These contradicted the already-corrected
reports, so anyone clicking through the UI would have seen different figures than the PDF:
- Experiments showed reasoning-strategy latencies of **0.05-0.15 ms** labelled **"Qwen 2.5 7B"** --
  those were the deterministic-fallback numbers. Replaced with the measured Qwen3-8B Q4_K_M run
  (11.6s / 45.4s / 85.2s; risk .424/.283/.233), the real seven-config ablation table including
  Config F's FPR 0.941, and the same "inconclusive on grounding risk" caveat the report carries.
- Datasets claimed **"HUMAN ANNOTATION RELIABILITY · Cohen's kappa = 1.00 · GOLD STANDARD"** -- the
  exact false claim already corrected in `LABEL_AGREEMENT_REPORT.md`. Now states two independent
  LLM-as-judge passes at kappa 0.922 with the 23 constructed cases excluded. Case counts were
  5/5/8, corrected to the actual 21/22/30.
- Compounding-error nodes updated to post-recalibration values (Node A 0.495, not 0.335) and now
  show control vs intervention side by side.

**Worth checking if more of this exists.** The audit only covered what the redesign touched. Other
hardcoded constants in `App.tsx` (e.g. `SAMPLE_WATERFALL_SPANS`, `SAMPLE_REPLAY_STEPS`,
`driftTimelineData`) are illustrative demo fixtures rather than claimed measurements, but they are
not labelled as such everywhere. A pass to either wire them to real API data or label them
"illustrative" would close the remaining gap.

**Dev servers**: `.claude/launch.json` defines `agentpulse-backend` (uvicorn, port 8000) and
`agentpulse-dashboard` (vite, port 5173). `scripts/e2e_dashboard_demo.py` pushes a realistic
mixed-risk trace through the real SDK for verification.
