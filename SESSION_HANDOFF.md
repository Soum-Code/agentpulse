# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23. **Rewritten clean:** 2026-08-26 (this replaces the old layered 0 / 0-B / 0-C structure — that history is in git if needed, but everything current is consolidated here).

**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\project one agent`.

**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming. The entire multi-session arc has been about replacing fake/inflated numbers with real measured ones — treat that as the standing bar for any new work, not just past work.

---

## 0. TL;DR

- **Backend + evaluation pipeline: real, tested, working.** 101/101 tests passing (`pytest tests/ -q`). Security audit complete. Real model inference (Qwen3-8B via llama.cpp), not stub fallbacks.
- **Both reasoning-strategy benchmarks are now DONE and real**: local CPU (Qwen3-8B) and Kaggle GPU (Llama 3.1 8B, Tesla P100). The Llama run just completed successfully — see Section 1. **The one remaining research task is writing up the CPU-vs-GPU / Qwen-vs-Llama comparison** — data is saved and verified, analysis not yet written.
- **Dashboard: mid-redesign, real design system in place, real bugs found and fixed, real bugs still open.** See Section 2 for the exact current split between what's live, what's real-but-static, and what's still fabricated.
- Repo is clean and pushed as of commit `2a46046`. **One new uncommitted file**: `experiments/results/reasoning_strategy_results_llama_gpu.json` (just saved, not yet committed — see Section 1).
- Docker, GitHub, and dev-server setup are all previously verified working — see Section 4 for exact commands, not re-derived here.

---

## 1. Reasoning-strategy benchmark — both runs complete, comparison not yet written

Two models, same benchmark (30 test cases × 5 stochastic runs × 3 strategies: Direct / CoT / AoT), same evaluation pipeline, run on different hardware.

### Qwen3-8B — local CPU (committed, final)

`experiments/results/reasoning_strategy_results.json`. 16 logical / 8 physical cores, no GPU.

| Strategy | Mean latency (ms) | Mean tokens out | Mean grounding risk |
| :--- | ---: | ---: | ---: |
| DIRECT | 11564.1 | 37.5 | 0.424 |
| COT | 45422.7 | 186.4 | 0.283 |
| AOT | 85215.2 | 319.7 | 0.233 |

Grounding-risk spread was found **inconclusive** on this sample (spread smaller than within-strategy stdev) — reported honestly as such, not forced into a false "AoT wins" narrative. Real, defensible finding: AoT costs ~8.5x DIRECT's tokens for a risk difference that isn't statistically distinguishable here.

### Llama 3.1 8B — Kaggle GPU (just completed, NOT yet analyzed)

**Just downloaded and saved to `experiments/results/reasoning_strategy_results_llama_gpu.json`** (not yet committed as of this writing). Tesla P100-PCIE-16GB, full GPU offload, `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF` Q4_K_M.

| Strategy | Mean latency (ms) | Mean tokens out | Mean grounding risk | Contradiction rate |
| :--- | ---: | ---: | ---: | ---: |
| DIRECT | 19496.8 | 59.0 | 0.328 | 0.06 |
| COT | 60329.4 | 185.7 | 0.228 | 0.14 |
| AOT | 171884.0 | 383.0 | 0.213 | 0.067 |

**Verified real before trusting it** (this run followed 4 failed dependency-pin attempts on earlier kernel versions — see Section 3 for what those were and why they matter for any future Kaggle work):
- `evaluation_models_confirmed_loaded: {nli_model: true, nli_tokenizer: true, embedding_model: true}` — the fail-loud assertion added to the notebook this time actually passed.
- 435/450 raw risk scores are non-zero, spanning the full 0.0–1.0 range — not the flat-zero pattern that invalidated the earlier discarded Qwen3 GPU attempt.
- `total_wall_time_minutes: 631.0` (~10.5h), same order of magnitude as the CPU run and the discarded GPU attempt — plausible.

**Not yet done — the actual next research task**: write the comparison. A few things already visible worth investigating honestly (not yet confirmed as real findings, just first-look observations):
- Llama's per-strategy latencies are all higher than Qwen3's *despite* running on GPU vs Qwen3's CPU run — same surprising direction as the discarded Qwen3 GPU attempt. Worth checking whether this is genuinely "Llama 3.1 8B is slower at this task" or whether something about GPU utilization is off (check `hardware`/`n_gpu_layers` fields, maybe compare tokens/sec rather than raw latency since token counts differ between the two runs).
- Llama's grounding-risk numbers (0.328/0.228/0.213) are close to Qwen3's (0.424/0.283/0.233) — same ordering (DIRECT highest risk, AoT lowest), which is at least a plausible cross-model consistency signal, not proof of anything yet.
- Don't force a "clean" narrative if the data doesn't support one — this project's whole credibility rests on that discipline.

Suggested next steps in order: (1) commit `reasoning_strategy_results_llama_gpu.json`, (2) write `GPU_VS_CPU_BENCHMARK_REPORT.md` or similar with real numbers side by side, explicit about the hardware difference so it reads as a hardware+model comparison not a controlled ablation, (3) update `PROJECT_REPORT.md` Section 4 with a pointer, (4) commit and push.

---

## 2. Dashboard — current real/fake split and what's been fixed

The dashboard (`dashboard/src/App.tsx`, React + TypeScript + Tailwind CSS **v3**) has been through a design-system pass this session. The most important thing to know before touching it further:

**Components fall into three categories, not two:**

| Category | Meaning | Examples |
| :--- | :--- | :--- |
| A — genuinely live | Real API data, polled | Overview stats, `Waveform` (composite risk), Incidents, Drift & Stability, Telemetry Lab (buttons fire the real `simulatePipeline` endpoint), curate-case flow |
| B — real numbers, static snapshot, honestly labelled | **NOT bugs** — values match `experiments/results/*.json` / `datasets/v1.0_*.json` exactly, and the UI says "Snapshot of last recorded run" on screen | `ExperimentsView`, `DatasetsView` (mostly — see one exception below) |
| C — fabricated, presented as live | Real bugs | Trace waterfall, evidence inspector, replay debugger steps (all still open — see below) |

Do not "fix" category B by wiring it to a live endpoint unless there's a real reason — it's already honest. Do fix category C.

### Fixed this session

- **Design system established**: `AGENTPULSE_DESIGN_SYSTEM.md` (the reference doc — read this before styling anything). Disjoint colour law (cyan = identity only, `state-*` = risk only, always via `riskTone()`), three elevation languages (flat tile / signature glow / liquid glass — glass is overlay-only), "one gradient, one place" rule.
- **Signature element**: `Waveform` component replaced the static "Composite Risk" number with a live oscilloscope-style trace of real polled risk history.
- **Agent topology wired to real data** (was rendering 5 invented agents, ignoring all real ones — now shows real agents sorted by risk, with an honest empty state and a fixed "worse of ASI and risk" status badge, since ASI-only badging could show a green HEALTHY next to RISK 1.00 — verified live before fixing).
- **UI font changed**: Space Grotesk → **IBM Plex Sans** (a design-lint hook flagged Space Grotesk as an overused AI-generated-UI face; the swap is deliberate, not arbitrary — see `AGENTPULSE_DESIGN_SYSTEM.md` §Typography). JetBrains Mono for numerics is unchanged. Three files must stay in sync if touched again: `tailwind.config.js`, `index.css` (`body` rule), `index.html` (font `<link>`).
- **Page-wide decorative grid background removed** (`.deck-field` — was a hairline grid tiled across the whole page; the pattern now lives only on the waveform panel, which is an actual measurement surface and earns it).
- **shadcn/ui leftovers fully removed.** A `shadcn init` was run once, injected Tailwind **v4** CSS into this **v3** project and broke the build entirely. Reverted, and its scaffolding (`components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, 7 unused deps) has since been deleted too. **Do not run `shadcn init` in this project.** Note there is no `components/ui/` directory — `src/components/ui.tsx` is the real primitives file (`Tile`, `Stat`, `Meter`, `RiskPill`, `StatusBadge`, `Sparkline`, `Waveform`, `EmptyState`, `riskTone`, `asiTone`, `toneText`).
- Earlier in the broader session (not just this pass): headline stat tiles frozen at 0 in background tabs (rAF suspension bug, fixed in `useCountUp`), a CORS/middleware-ordering bug that broke all cross-origin requests, missing `VITE_API_KEY` in `.env.example`, and the curate-to-dataset loop writing but not reading back — all fixed and verified against the live backend.

### Still open (category C, real bugs)

1. **Trace waterfall + evidence inspector** — the biggest remaining fake surface. `TraceWaterfallSection` renders `SAMPLE_WATERFALL_SPANS` (hardcoded fake trace/spans); `EvidenceInspectorPanel` renders invented "Zhang et al." claim text regardless of what's selected. Full spec with real API shapes already written: `TRACE_WATERFALL_REBUILD_PROMPT.md`. Key real constraint documented there: `SpanDetail` has no raw input/output text field by default (`AGENTPULSE_CAPTURE_INPUTS=false`), so the evidence panel needs an honest empty state for that case, not invented placeholder text. `api.getTrace(traceId)` exists and works but nothing calls it yet.
2. **Replay Debugger** — `SAMPLE_REPLAY_STEPS` fully fabricated, zero API calls in the component.
3. **`DatasetsView` stale count** — hardcodes `v1.0_curated: 1 case`; real DB held 13 last checked (this number only grows as operators curate incidents). A live endpoint (`GET /v1/datasets`) already exists for this — just needs wiring.

### Other reference docs for the redesign

- `MASTER_PROMPT_CORRECTIONS.md` — corrections to an externally-generated master prompt that contained real errors (it wanted cyan to mean "healthy", which violates the disjoint colour law; it wanted Inter/Geist, which are on the same overused-font list Space Grotesk was flagged from).
- `IMPLEMENTATION_MAP.md` — the original codebase inspection (Phase 1–3 per that external prompt's own process) — still accurate for orientation, though some "open" items there are now fixed (see above).
- `DASHBOARD_REDESIGN_PROMPT.md` — earlier, broader redesign brief (Linear/Stripe references). Superseded in spirit by `AGENTPULSE_DESIGN_SYSTEM.md` but not contradicted.

### Design-hook status (`impeccable` skill's auto-detector)

Runs automatically after UI file edits this session. Three findings surfaced; two fixed, one deliberately left:
- ~~`overused-font`~~ — fixed (IBM Plex Sans swap above).
- ~~`codex-grid-background`~~ — fixed (`.deck-field` removal above).
- **`gradient-text` on `.wordmark-gradient` — deliberately left standing.** User explicitly asked for a Stripe-style gradient accent; it's scoped to the logotype only, not headings/metrics (the hook's actual concern). An `ignore-value` command to silence the repeat warning was blocked by a permission prompt earlier — it will keep re-flagging on every CSS edit until either the ignore is allowed or the user asks for it to be removed.

---

## 3. Kaggle — working setup and hard-won lessons

The Llama GPU run (Section 1) succeeded on kernel version 12 after **4 failed attempts** on the same dependency problem. If touching this notebook again, know this first:

- **How to read Kaggle logs — the naive method silently lies.** `kaggle kernels output --file-pattern ".*\.log$"` reliably returns an **empty file**, mid-run or after completion — don't trust it. The real method: Python's `KaggleApi().kernels_logs('somnath26/agentpulse-reasoning-benchmark')`, which returns actual stdout/stderr content. Also: plain `kaggle kernels output` with no filter can hang trying to download the multi-GB model weights if the notebook's own cleanup cell didn't run (e.g. the run errored before reaching it).
- **The `grounding.models_loaded()` fail-loud assertion in the notebook is load-bearing — do not remove it.** Without it, a broken evaluation pipeline silently produces a benchmark full of fake `0.0` risk scores instead of erroring (this is exactly what happened to a since-discarded earlier Qwen3 GPU attempt, and it burned a full 9-hour run before anyone noticed). With the assertion, a broken pipeline now fails in ~6-8 minutes instead.
- **Kaggle's base image ships numpy 2.0.2; llama-cpp-python's build step floats it to 2.5.2 via an unpinned dependency, which breaks other preinstalled packages built against 2.0.2's private internals.** The working fix pins `numpy==2.0.2` exactly (not just `numpy<2`, which fights the ~15 other packages requiring `numpy>=2.0`) alongside an upgrade of `transformers`+`sentence-transformers` together (not pinned backward — see `kaggle/agentpulse_reasoning_benchmark.ipynb`'s own inline comments, which document all 4 failed attempts and why each one failed, for the full reasoning chain).
- `kaggle/kernel-metadata.json` is committed, so `kaggle kernels push -p kaggle/` works directly.
- **Do not delete or restart the Kaggle kernel without asking** — this has been an explicit standing preference across sessions.

---

## 4. Environment / commands (verified working, not re-derived)

- Python venv: `.venv` in project root. Always invoke as `./.venv/Scripts/python.exe` (git-bash on Windows; plain `python` hits system Python, missing `kaggle` etc.).
- `gh` CLI authenticated as `Soum-Code`. Repo: `https://github.com/Soum-Code/agentpulse` (private).
- `kaggle` CLI authenticated as `somnath26` via `~/.kaggle/kaggle.json`.
- Dev servers via `.claude/launch.json`: `agentpulse-backend` (uvicorn, port 8000), `agentpulse-dashboard` (vite, port 5173). `dashboard/.env` (gitignored) needs `VITE_API_KEY=change-me-to-a-secure-key` for any local write action to work (curate-case, etc.) — recreate it if missing after a fresh checkout.
- `scripts/e2e_dashboard_demo.py` pushes a real mixed-risk trace through the actual SDK — the standard way to get real data into a fresh dashboard for testing, rather than trusting whatever's already in the DB.
- Docker (`docker compose up --build`) was verified working end-to-end earlier in the broader session; 4 real bugs were found and fixed then (missing README in build context, CUDA-bloat torch index, SQLite URL slash count, WAL mode needing a named volume on Windows). Not re-verified this session, but nothing since should have broken it.
- Test suite: `pytest tests/ -q` — 101/101 passing as of the last check in this session.

---

## 5. Open question, never resolved: branch/PR workflow vs. direct-to-main

This repo has only ever had a `main` branch; every commit across every session has gone directly to it. A system-triggered PR-creation flow once asked for a PR from `main`, which isn't possible without a second branch to diff against. The user was asked whether to start using feature branches going forward and has not yet answered either way. Keep committing directly to `main` unless told otherwise; don't assume.

---

## 6. Immediate next steps, in likely priority order

1. Commit `experiments/results/reasoning_strategy_results_llama_gpu.json` (currently untracked) and write the GPU-vs-CPU / Llama-vs-Qwen comparison (Section 1).
2. Trace waterfall + evidence inspector rebuild (Section 2, item 1) — the largest remaining fabricated surface, spec already written.
3. Replay Debugger real data source, or an honest empty state if no real equivalent exists yet (Section 2, item 2).
4. `DatasetsView` stale curated-count fix (Section 2, item 3) — small, mechanical, a live endpoint already exists.
5. Whenever picked up: the branch/PR question (Section 5) and the standing `gradient-text` hook suppression (Section 2) are both one-line user decisions away from being closed out.
