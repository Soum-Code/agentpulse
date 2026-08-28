# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23. **Rewritten clean:** 2026-08-26. **Updated:** 2026-08-27 (Sections 7–9 disagreement/benchmark/positioning; 10 drift diagnosis and fix; 11 tool-claim external test; 12 blocked redesign; 13 competitor audits). **Updated:** 2026-08-28 (Section 14 — external disagreement validation, the last of the three signals to be checked and the third to fail; Section 15 — the productization arc, seven phases from migrations through health/readiness).

**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\project one agent`.

**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming. The entire multi-session arc has been about replacing fake/inflated numbers with real measured ones — treat that as the standing bar for any new work, not just past work.

---

## 0. TL;DR

- **Backend + evaluation pipeline: real, tested, working.** **209/209 tests passing** (`pytest tests/ -q`; was 130 before the productization arc). Security audit complete. Real model inference, not stub fallbacks.
- **⚠️ Inter-agent disagreement failed its external check too — that is now three for three.** On real multi-agent traces the shipped configuration detects **0 of 10** independently labelled contradictions. The fix that recovers 6 of 10 does **not generalize**. Section 14; `COMPETITIVE_POSITIONING.md` revised. Every internal benchmark this project has checked against external data has broken or narrowed: drift, tool-claim, and now disagreement.
- **The evidence-partition problem is the more interesting finding** and is now the real research question for disagreement: agents holding different evidence produce apparent contradictions that are not faults, and an NLI score cannot tell the two apart. Section 14.
- **Production hardening happened, and is no longer "deliberately not next".** Seven phases: migrations, durable queue, ONNX fix, throughput measurement, retention, self-monitoring, health/readiness. All measured, not asserted. Section 15 and `PRODUCTIZATION_LOG.md`.
- **Drift was diagnosed and fixed** against an external real-trace corpus — false alarms on unchanged operation went from **91.7% → 1.5%**, detection 92%, AUC 0.991 on a held-out split. The 0.30 threshold was never the problem; the aggregation was. **But coverage is only 24.5%** — see Section 10, and do not quote the accuracy without the coverage.
- **Both reasoning-strategy benchmarks are DONE, real, and compared** — see Section 1 and `GPU_VS_CPU_BENCHMARK_REPORT.md`.
- **Inter-agent disagreement engine rebuilt and wired into production this session** — the project's largest claim-vs-reality gap is closed. See Section 7.
- **Two head-to-head benchmarks written, and both contradicted their own hypothesis** — reported that way rather than smoothed. See Sections 7 and 8.
- **Competitive positioning documented** (`COMPETITIVE_POSITIONING.md`). Verdict: breadth is unwinnable. The defensible niche was originally "three signals none of them ships" — **that is now two, and they are not equally strong**; see Sections 8 and 13.
- **A real documentation defect was found and corrected**: `DRIFT_EXPERIMENT_REPORT.md`'s prose contradicted its own data table, and the same errors had propagated into `PROJECT_REPORT.md` §7. See Section 9.
- **⚠️ The tool-claim validator extracts NOTHING from real agent output** — zero claims across 8,353 prose spans, all 5 models, and **F1 0.000** on a real-data benchmark against its own 0.842. Its 19-case benchmark tested the regex against its own phrasing and could not have caught this. Sections 11 and 12. `COMPETITIVE_POSITIONING.md` §5.1/§5.4 have been revised accordingly.
- **The tool-claim redesign is BLOCKED on labelling, not engineering** (Section 12). A labelling attempt reached only kappa 0.225 and produced zero examples for two of the four target classes. Read §12.3 before restarting it — the failure mode is a question that isn't well-posed, not a prompt that needs tuning.
- **⚠️ Competitor audits refuted a positioning claim.** Phoenix and MLflow were both installed and probed: **both ship tool-call verification**, so that differentiator is finished. Disagreement holds only as "no named feature" (MLflow's `@scorer` can build it); **drift is the strongest surviving claim**. Section 13; `COMPETITIVE_POSITIONING.md` has been revised accordingly.
- **Repo pushed through commit `3cd1080`; working tree clean, `origin/main` in sync.** The dashboard work that used to sit uncommitted was reviewed and checkpointed (`8a93558`) with three known gaps recorded — see Section 15.
- Docker, GitHub, and dev-server setup are all previously verified working — see Section 4 for exact commands, not re-derived here.

---

## 1. Reasoning-strategy benchmark — both runs complete, comparison written up

Two models, same benchmark (30 test cases × 5 stochastic runs × 3 strategies: Direct / CoT / AoT), same evaluation pipeline, run on different hardware.

### Qwen3-8B — local CPU (committed, final)

`experiments/results/reasoning_strategy_results.json`. 16 logical / 8 physical cores, no GPU.

| Strategy | Mean latency (ms) | Mean tokens out | Mean grounding risk |
| :--- | ---: | ---: | ---: |
| DIRECT | 11564.1 | 37.5 | 0.424 |
| COT | 45422.7 | 186.4 | 0.283 |
| AOT | 85215.2 | 319.7 | 0.233 |

Grounding-risk spread was found **inconclusive** on this sample (spread smaller than within-strategy stdev) — reported honestly as such, not forced into a false "AoT wins" narrative. Real, defensible finding: AoT costs ~8.5x DIRECT's tokens for a risk difference that isn't statistically distinguishable here.

### Llama 3.1 8B — Kaggle GPU (complete, committed, analyzed)

Saved to `experiments/results/reasoning_strategy_results_llama_gpu.json` (committed in `3cef217`). Tesla P100-PCIE-16GB, full GPU offload, `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF` Q4_K_M.

| Strategy | Mean latency (ms) | Mean tokens out | Mean grounding risk | Contradiction rate |
| :--- | ---: | ---: | ---: | ---: |
| DIRECT | 19496.8 | 59.0 | 0.328 | 0.06 |
| COT | 60329.4 | 185.7 | 0.228 | 0.14 |
| AOT | 171884.0 | 383.0 | 0.213 | 0.067 |

**Verified real before trusting it** (this run followed 4 failed dependency-pin attempts on earlier kernel versions — see Section 3 for what those were and why they matter for any future Kaggle work):
- `evaluation_models_confirmed_loaded: {nli_model: true, nli_tokenizer: true, embedding_model: true}` — the fail-loud assertion added to the notebook this time actually passed.
- 435/450 raw risk scores are non-zero, spanning the full 0.0–1.0 range — not the flat-zero pattern that invalidated the earlier discarded Qwen3 GPU attempt.
- `total_wall_time_minutes: 631.0` (~10.5h), same order of magnitude as the CPU run and the discarded GPU attempt — plausible.

**Done — the comparison is written up in `GPU_VS_CPU_BENCHMARK_REPORT.md`.** Findings, reported honestly rather than forced into a clean narrative:
- Llama's per-strategy latencies and tokens/sec are all worse than Qwen3's *despite* running on GPU vs Qwen3's CPU run (checked tokens/sec specifically, since token counts differ between the two runs — the GPU run is still slower on that basis too). Same surprising direction as the discarded Qwen3 GPU attempt, but this run passed the fail-loud model-load assertion and produced valid, varied risk scores, so it reads as a genuine property of this setup rather than a repeat of that broken run. Root cause (GPU offload efficiency, build differences, etc.) not diagnosed further.
- Llama's grounding-risk numbers (0.328/0.228/0.213) are close to Qwen3's (0.424/0.283/0.233) with the same ordering (DIRECT highest risk, AoT lowest) — a plausible cross-model consistency signal, not proof of anything.
- Contradiction rate did *not* replicate the same pattern across models (Qwen's AoT had zero; Llama's COT was highest) — reported as-is.

`PROJECT_REPORT.md` Section 4 has a pointer paragraph to the new report. All committed and pushed (`8fd921b`); nothing outstanding here.

---

## 2. Dashboard — current real/fake split and what's been fixed

> **READ THIS FIRST (2026-08-27): there is substantial uncommitted dashboard work in the tree.**
> Six files are modified and unstaged — `App.tsx` (~+1700 lines), `index.html`, `index.css`,
> `tailwind.config.js`, `SideRail.tsx`, `lib/api.ts`. This was written by **Antigravity**, a
> separate agent that ran in parallel and has since been stopped. It was deliberately left
> untouched all session and is **not verified, not built, not tested by this session**.
>
> Inspection showed it is a genuine implementation of the trace-waterfall rebuild (item 1
> below): it replaces `SAMPLE_WATERFALL_SPANS` with a real span tree built from
> `api.getTrace()`, and adds the honest `AGENTPULSE_CAPTURE_INPUTS=false` empty state that
> `TRACE_WATERFALL_REBUILD_PROMPT.md` specifies. **But it also silently reverts the
> IBM Plex Sans font swap back to Space Grotesk** (all three of `index.html`, `index.css`,
> `tailwind.config.js`) — which undoes commit `2a46046` for no stated reason — and
> reorganises `SideRail` nav ("Traces" moved to Investigate, "Replay Debugger" renamed
> "Recorded Replay").
>
> Before committing any of it: run the dashboard build, verify the waterfall against a real
> trace, and decide deliberately about the font revert. Do not commit it blind.

The dashboard (`dashboard/src/App.tsx`, React + TypeScript + Tailwind CSS **v3**) has been through a design-system pass. The most important thing to know before touching it further:

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
- `scripts/e2e_dashboard_demo.py` pushes a real mixed-risk trace through the actual SDK — the standard way to get real data into a fresh dashboard for testing, rather than trusting whatever's already in the DB. **Note:** it stamps every span with the *same* `start_time` (line 38), which is unrealistic — the real SDK stamps each span separately. This masked an ordering bug for a while; see Section 7.
- Docker (`docker compose up --build`) was verified working end-to-end earlier in the broader session; 4 real bugs were found and fixed then (missing README in build context, CUDA-bloat torch index, SQLite URL slash count, WAL mode needing a named volume on Windows). Not re-verified this session, but nothing since should have broken it.
- Test suite: `pytest tests/ -q` — **209/209 passing** as of 2026-08-28. **Runtime is now ~2m30s, not 2.3s**: the durability, migration and inference-backend suites spawn real subprocesses and load real models, because the failures they guard against (SIGKILL mid-job, a migration that only breaks on first use, a silently degraded backend) are invisible to in-process tests. Slow on purpose.
- **Reading the HuggingFace corpus without downloading 231 MB:** `pyarrow` cannot read `https://` directly. Use `huggingface_hub.HfFileSystem` + `pyarrow.parquet.read_table(fh, columns=[...])` — column projection over range requests. Project the cheap run-level columns to locate a target cell, then read the huge `spans` column from only the shards that contain it. The datasets-server `/statistics` endpoint returns a permission error for this dataset; `/rows` works.
- **Two SQLite DB files exist and they are not the same one.** `./data/agentpulse.db` and `./backend/data/agentpulse.db`. The path in `.env` is relative (`sqlite+aiosqlite:///./data/agentpulse.db`), so which one the backend uses depends on its working directory — as launched, it writes to **`backend/data/agentpulse.db`**. Query that one when verifying, not the root one. This cost real debugging time once.
- **The backend auto-restarts when killed.** Something supervises it (not `--reload`, and not `.claude/launch.json`), so `Stop-Process` on the port-8000 PID results in a fresh process within seconds — which conveniently picks up code changes, but means you cannot simply stop it. Health is at `/v1/health`, **not** `/health`.

  **⚠️ This next part changed on 2026-08-28 — the old advice is now wrong.** It used to say
  "allow ~10s for models to load; `/v1/health` reports `models: {nli_model: false, ...}`
  until they do". The API **no longer loads models at all** (it performs no inference), so
  `models` is permanently all-false and that is correct. Do not wait on it.
  - The API is ready as soon as `/v1/health/ready` returns 200 (~1.5s) — that checks the
    database, its only dependency.
  - **Evaluation requires a separate worker process: `python -m app.worker`.** Without it,
    spans are accepted and durably queued but nothing evaluates them. `/v1/health/evaluator`
    returns 503 and `/v1/platform` reports `state: failing` in that situation.
  - Restore the old behaviour with `AGENTPULSE_API_LOAD_MODELS=true` if ever needed.
- The ingest API requires `X-API-Key: change-me-to-a-secure-key` (from `.env`); requests without it get a 401 with no other clue.

---

## 5. Open question, never resolved: branch/PR workflow vs. direct-to-main

This repo has only ever had a `main` branch; every commit across every session has gone directly to it. A system-triggered PR-creation flow once asked for a PR from `main`, which isn't possible without a second branch to diff against. The user was asked whether to start using feature branches going forward and has not yet answered either way. Keep committing directly to `main` unless told otherwise; don't assume.

---

## 6. Immediate next steps, in likely priority order

The recommendation given to the user, and the reasoning, is in Section 9. Short version:

1. ~~Diagnose drift~~ — **done, and fixed.** See Section 10.
2. ~~Test the tool-claim validator on the external corpus~~ — **done, and the result was worse than expected.** See Section 11.
3. ~~Redesign tool-claim extraction~~ — **attempted and blocked on labelling, not engineering.** See Section 12. Restarting it means first making the labelling question well-posed (§12.4), not rewriting the extractor. Do not ship on firing-rate alone (§12.5).
4. ~~Install Phoenix and audit the competitive claims~~ — **done, for Phoenix *and* MLflow, and two claims were refuted.** See Section 13. What remains unaudited is Datadog, which is not installable; and neither audit measured *quality*, only existence and runnability.
5. ~~Externally validate inter-agent disagreement~~ — **done, and it failed.** Section 14. Three for three.
6. ~~Correct `DRIFT_EXPERIMENT_REPORT.md` §3~~ — **investigated, and the premise was wrong.** §3 is correctly scoped and already carried a correction notice; the misremembered error was in the real-text diagnosis and had been fixed there. **The real hazard was the regeneration trap**, which was live: `drift_scenarios.py` rewrote the curated report from a template that still contained all three documented errors. Fixed in `78697c5`.
7. ~~Decide what to do with the uncommitted dashboard work~~ — **reviewed and checkpointed** (`8a93558`). Three gaps recorded for the dashboard phase; see Section 15.
8. **Re-run ablation Configs D, E and F.** Still open, and now more stale: `ablation_results.json` is dated 2026-08-23, before the disagreement rewiring, the drift rebuild, and the ONNX fix that halved NLI latency. The dashboard displays these numbers.
9. Whenever picked up: the branch/PR question (Section 5) and the standing `gradient-text` hook suppression (Section 2) are both one-line user decisions away.

### What is actually next

1. **Capability tiers** — published in Phase 0 (drift Beta, grounding Beta, disagreement Experimental, tool-claim Experimental). Nothing measured since has changed them, so this is a re-confirm or a skip.
2. **Dashboard, last** — the remaining work. It now has considerably more real data available than when it was frozen: `/v1/platform`, `/v1/health` readiness, worker fleet state and queue depth are all live endpoints that did not exist when that UI was written.
3. **The disagreement research question**, if the project wants to keep pulling that thread: how to distinguish true contradiction from legitimate disagreement caused by partial evidence (§14). Do **not** improve claim extraction before answering it — that optimises the wrong objective.

**No longer "deliberately not next".** The previous handoff deferred production hardening as an "if users arrive" problem. That call was reversed deliberately by the user and the work is done (Section 15) — with scope held to a thin vertical rather than the full SaaS substrate, so the research contribution was not displaced.

---

## 7. Inter-agent disagreement — rebuilt, benchmarked, and wired into production

Full detail in `DISAGREEMENT_BENCHMARK_REPORT.md` (9 sections). Summary of what changed and why it matters:

**Starting state.** The engine was the least-evidenced component in the repo: 79 lines, two tests that both asserted `None`, no benchmark, and an ablation result (`THRESHOLD_ANALYSIS.md` Config E) showing it never changed a decision — because the single-agent datasets structurally could not exercise it.

**Method that worked, and should be reused.** A benchmark was built and run against **completely unmodified code first**, before any fix. That ordering is deliberate: `TOOL_CLAIM_VALIDATOR_REPORT.md` §1 documents the same discipline. Fixing first and benchmarking after produces a self-fulfilling score.

**What the baseline actually found** (F1 0.800, FPR 0.300):
- Two architectural misses — contradictions between non-adjacent agents were never compared at all.
- **An unplanned finding that turned out to matter more:** NLI reports ~0.98 contradiction probability for agent outputs that are merely *about different topics*. A planner saying "decompose into three sub-questions" against a retriever saying "retrieved four documents" scored 0.999. In a real trace this is the common case, not the exception.
- Bidirectional NLI was **considered and rejected on evidence** — zero reverse-only detections. Asymmetry is real but caused no misses, so it was not implemented. Keep that discipline.

**Fixes:** a relevance gate (reusing `compute_semantic_similarity`) plus trace-level N-way comparison. Result F1 **0.960**, FPR 0.100.

**The most important single finding in this work:** measured in isolation, **the relevance gate alone is a regression** (F1 0.762, worse than the untouched 0.800 baseline) — it removes accidental wrong-pair true positives that were propping up baseline recall. Only the combination pays off. Had the gate shipped alone, the benchmark would have read as a failure.

**Then it was wired into production**, which was the project's largest claim-vs-reality gap: `evaluator.py` had never called the N-way path, so the shipped pipeline ran the gate-only configuration — the one that measures *worse* than baseline. A trace-completion hook was considered and rejected (nothing in the system signals trace completion; `Trace.status` never leaves `"running"`), so comparison is incremental instead: each arriving span is compared against earlier agents of its own trace, adding exactly the N−1 new pairs. Calling the all-pairs function per span would have cost O(N³).

**Two real bugs were fixed as a consequence:**
1. `_evaluate_spans_background` tracked "previous span in the batch" with **no `trace_id` check**, while the SDK batches a flat buffer with no trace grouping — so an interleaved batch compared an agent against an agent from a *different trace*.
2. Prior-span ordering used `(start_time, span_id)`, but `span_id` is random hex, so tied timestamps ordered spans **alphabetically**. Observed live. Now `(start_time, rowid)` — insertion order.

**Also added:** an `AGENT_DISAGREEMENT` alert rule. `disagreement_score` was already in the alert engine's metrics dict but **no rule referenced it**, and it could not surface via composite risk either (weight 0.20 against grounding's 0.40 means a 0.9999 contradiction with clean grounding aggregates to ~0.33 — under both the 0.4 medium band and the 0.7 alert threshold). Verified live: a 0.9999 disagreement produced `label="low_risk"` and no alert at all before this.

**Still true and worth knowing:** that span still reads `low_risk`. The alert surfaces it; the risk weighting was left alone deliberately, because changing `RISK_WEIGHTS` would shift every score in the system and invalidate the operating point `THRESHOLD_ANALYSIS.md` selected on the dev split. That is an open judgement call, not an oversight.

---

## 8. Competitive positioning and the honest state of the differentiators

`COMPETITIVE_POSITIONING.md` (product/strategy framing, not academic) records the full analysis. Key points a future session should not have to re-derive:

- **Feature parity is not viable and has been abandoned as a goal.** Datadog is a public company, Arize was acquired by Dynatrace (announced August 2026), MLflow has Linux Foundation + Databricks behind it. Auto-issue-intelligence (Signal / Insights / Alyx), 100+ integrations, multi-language SDKs and compliance certification are not solo-achievable.
- **The defensible position is three signals none of the three ships as a named feature**: deterministic tool-claim validation, inter-agent disagreement, dedicated drift/ASI.
- **Scale was never the real constraint.** At ~100k traces SQLite WAL is adequate; the actual gaps are framework breadth and the absence of automatic issue surfacing, both scale-independent.
- **Every "they don't ship X" claim comes from reading their marketing docs.** No competitor product has ever been installed or run. This is the weakest link in the entire positioning and is why Section 6 item 2 exists.

**`LLM_JUDGE_COMPARISON_REPORT.md` — the one real head-to-head so far**, NLI cascade vs a local Qwen3-8B judge on `v1.0_test`:
- **Cost claim confirmed decisively**: 12.9× lower mean latency, 15.6× lower median, **zero generation tokens** against the judge's 219.
- **Quality claim did not hold**: judge F1 **1.000** vs cascade **0.963**.
- The two disagree on exactly one case — a numeric rounding paraphrase ("7.61 billion" vs "approximately 7.6 billion") the cascade scored at 0.922 risk. **That defect is recorded and deliberately not fixed**, since correcting from a single observation is fitting to one data point.
- Results are split by label provenance because scoring an LLM judge against LLM-judge-produced labels is circular: `test_01`–`test_20` are dual-LLM-judge labelled, `test_21`–`test_30` are deterministic. **On the deterministic subset both systems tie at 1.000** — the judge's entire advantage falls inside the circular subset. Both facts are true and both are reported.

**Production readiness, assessed but not acted on.** Real gaps, in rough priority: the evaluation executor is `ThreadPoolExecutor(max_workers=1)` at ~250–340 ms/span (~3–4 spans/sec ceiling) behind an in-process `BackgroundTasks` queue that loses work on restart; `retention_days` is configured in `config.py` but **nothing implements it**, so the DB grows forever; auth is a single shared static key with no rotation or tenancy; there is no self-monitoring, no DB migration story, and no backup/restore.

**One conceptual trap noted during that discussion:** adding sampling to relieve the throughput ceiling would directly contradict the project's own thesis. `README.md` defines AgentPulse against exactly that — *"treat quality evaluation as an optional, sampled add-on… AgentPulse instead runs a real evaluator on every captured span."* Decoupling evaluation into separate workers is the right fix; sampling is a last resort, not a first option.

---

## 9. The drift documentation defect (historical — the capability itself is fixed, see Section 10)

**The defect.** `DRIFT_EXPERIMENT_REPORT.md` §2 claimed *"shifts at 50% and above… were detected within 1-2 spans"* while its own §1 table marked those exact rows `Detected: No`. Verified against `experiments/results/drift_experiment_results.json`: **the table was right**. Three separate errors, now corrected with a §4 correction notice, and corrected in `PROJECT_REPORT.md` §7 where all three had propagated:

1. Real recall on anomalies is **2 of 5 = 0.400**, not what the prose implied.
2. The "Magnitude" column was labelled as measured cosine distance but held `shift_level`, a **configured scenario parameter**. This is what let error 1 survive review: read as a distance, 0.50 appears to clear the 0.30 threshold. The measured distance for those rows was **0.042**.
3. The detection rule was stated incompletely — it is `centroid_distance >= 0.30` **OR** `stability_index < 70`.

**The bigger finding the mislabel was hiding:** no scenario's measured centroid distance ever exceeded **0.099** against a 0.30 threshold. So the embedding-centroid detector — the signal that most distinguishes this feature — **never fired for anything**. Both detections came via the ASI branch, from tool-entropy and quality-regression. And the three misses are exactly the semantic output drift the centroid signal exists to catch.

**One claim in that correction was itself wrong, and is superseded.** The §3 statement that "the embedding-centroid detector never fired at all" came from reading `final_centroid_dist` — the value *after* the EMA centroid has converged and the distance decayed. Peak distances were 0.4453 and 0.6838; the centroid branch did fire. Same class of error as the one being corrected. `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §3 records this; `DRIFT_EXPERIMENT_REPORT.md` §3 still carries the wrong sentence and **should be corrected** — the only drift doc item still outstanding.

**⚠️ `experiments/drift_scenarios.py` regenerates `DRIFT_EXPERIMENT_REPORT.md` from a hardcoded template** (lines ~141-163) containing the original false prose. Running that script silently reverts commit `19cde3a`. This is *why* the contradiction existed: the table is generated from data, the §2 prose is a static string nobody re-derived. If you re-run it, restore the report afterwards (`git checkout -- DRIFT_EXPERIMENT_REPORT.md`).

---

## 10. Drift: diagnosed and FIXED (2026-08-27)

Section 9's open question is answered and the capability now works. Full evidence in
`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §§1-11 — summary of what a future session needs:

**The answer was "both, and the benchmark was hiding the detector's fault."** The synthetic
scenarios never moved the embedding (max 0.099, analytically bounded by `shift_level`). But
on real text the shipped metric fired on **91.7% of unchanged operation** — over-sensitive
and uninformative, the opposite of what the synthetic test suggested.

**Root cause:** `centroid_distance` compares *one output* against an EMA centroid *within
one run*. A multi-step agent legitimately says something different at every step (median
distance between consecutive normal steps: 0.2565), so 0.30 sat inside ordinary variance.
**The threshold was never the problem.**

**The fix:** `DriftResult.window_centroid_distance` — baseline window mean vs current
window mean, added **alongside** `centroid_distance`, not replacing it. Pooling absorbs a
lone outlier by design, so the old field stays the *spike* signal and the new one is the
*sustained shift* signal. Replacing would have broken `test_high_drift_detection` and
silently changed ablation Config F (a published `THRESHOLD_ANALYSIS.md` result).

**Two implementation bugs the validation step caught before anything shipped** — the
production version first measured AUC 0.7148 against the standalone metric's 0.9532:
1. Pools were not disjoint — baseline embeddings stayed in the rolling window, pulling the
   current mean back toward baseline. Only 37 of 500 sessions ever cleared it.
2. Partial windows were reported — the first "window mean" was a one-sample mean, i.e. the
   per-output noise the metric exists to remove. Fixing (1) alone gave 26% false alarms.

Both fixes are structural, not fitted. The field returns `None` until both windows fill.

**Calibration was done properly.** `mean_window` selected on the **89 dev tasks** with a
criterion fixed beforehand (FA ≤ 0.10, coverage ≥ 0.25, maximise detection), then measured
**once** on **111 held-out** tasks. The 0.30 threshold was not tuned.

| Held-out at `mean_window=12` | |
| :--- | ---: |
| False alarms @0.30 | **0.0152** |
| Detection @0.30 | **0.9192** |
| AUC content-change vs no-shift | **0.991** |
| Control coverage | 0.2454 |

Medians form a sensible gradient: `no_shift 0.089 < model_shift 0.190 < content_change 0.486`.
**This softens `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §7**, which claimed model swap is
undetectable — with the corrected representation it is partly detectable (AUC 0.849).

**Wired to alerting.** `DRIFT_DETECTED` now reads `window_centroid_distance` at the same
0.30 threshold. Verified end-to-end through `/v1/ingest`: 40 spans (24 one topic, 16
another) produced exactly **one** alert at `distance=0.537`, not a per-span storm.

**⚠️ The cost, which must not be read past: coverage is 24.5%.** A `None` metric skips the
rule, so no drift alert is raised on roughly three quarters of sessions, and the 1.5%
false-alarm figure is measured only on the longer sessions that do report — whose halves
are more similar. Honest framing: **when this detector speaks it is accurate; it stays
silent often.** Not persisted to `DriftRecord` either — a new column is a schema change
with no migration path (`create_all` only) and would break existing databases; the value
reaches operators through the alert `details` payload.

### External corpus now available for evaluation work

`Exgentic/agent-llm-traces-v2` (pinned revision `4b8ad4ab`), ingested via
`experiments/external_exgentic_ingest.py`. 10,056 sessions, 6 benchmarks, 5 harnesses,
5 models. Provenance in `datasets/external/exgentic_v2/`; the 7.4 MB derived pairs file and
the 11 MB embedding cache are gitignored and regenerable.

Things a future session should know before reusing it:
- **Task prompts are byte-identical across models**, which is what makes controlled
  comparison possible.
- **One model and one agent identity per session** — it **cannot** support inter-agent
  disagreement evaluation. Do not try.
- **It carries no labels for anything.** Model identity is a controlled variable, not a
  drift annotation.
- **Prose availability is harness-dependent.** In `browsecompplus/tool_calling`,
  `claude-opus-4-5` emits prose in 0/100 sessions and `gpt-5.2` in 1/100 — a text-based
  extraction there silently drops two of five models. `browsecompplus/smolagents_code` is
  the surveyed cell where all five models produce prose in 100/100.
- `tool_call` **and** `tool_call_response` are both present (560/528 in one run). This was
  used to test the tool-claim validator — see Section 11.

---

## 11. Tool-claim validator extracts NOTHING from real agents (2026-08-27)

Full detail in `TOOL_CLAIM_EXTERNAL_TEST_REPORT.md`. This is the most consequential
finding of the session and a future session should not re-derive it.

**The result: zero claims extracted from 8,353 real agent prose spans** — 500 sessions
stratified across 3 benchmarks, 4 harnesses and all 5 models. Not a low score. Nothing at
all, in every single cell.

`TOOL_CLAIM_VALIDATOR_REPORT.md` reports precision 1.000 / recall 0.727. Those figures are
a correct measurement *of what they measured*, and the validator is **not broken on its own
terms** — a positive control using its own benchmark phrasing passes. What the 19-case
benchmark does not establish is **applicability**: every case in it was hand-written in the
phrasing the regex expects, making it a test of the regex against itself. It could not have
surfaced this.

**Cause — a design-premise mismatch, not a tuning gap.** `TOOL_PATTERNS` requires the agent
to *narrate* tool use ("I used the X tool"). In structured-tool-calling harnesses the agent
never narrates it, because invocation is a `tool_call` field:

| Agent prose (what the regex reads) | Structured `tool_call` |
| :--- | :--- |
| "First, I need to get the supervisor's profile and credentials" | `mcp__environment__supervisor__show_profile` |
| `"\n\n"` | `mcp__environment__supervisor__show_account_passwords` |

Prose narrates intent; structure records action. The tool name the regex hunts for sits in
a field the validator never reads. **Expanding the regex cannot fix this** — the
information is not in the text.

**Consequences that are now open items:**
- Ablation **Config D** in `THRESHOLD_ANALYSIS.md` includes tool-claim validation. On real
  agents that component contributes nothing, so Config D's standing is questionable
  (Section 6 item 7).
- `COMPETITIVE_POSITIONING.md` §5.1 presents deterministic tool-claim validation as a live
  differentiator with measured evidence. That evidence is the 19-case benchmark. **The
  section needs revisiting** — the capability is real in principle but currently inert on
  modern agent traces. It has not been edited yet.

**The productive reformulation (Section 6 item 3), and why:** stop asking *"which tools did
the agent say it used"* — that is structurally known from `tool_call` names, no inference
needed. Ask instead *"do the agent's statements about tool **results** match those
results"*, which is where fabrication actually causes harm. `SpanInput.tool_name` and
`ToolCallRecord` already model the structured side, so the pipeline shape exists; only
`extract_claims()` is text-only. This is an extraction-stage redesign needing its own
controlled test, not a regex change.

**Smaller finding worth keeping:** even with working extraction, count-checking has little
to work with in this corpus — only **146 of 10,422** tool responses carry a genuine
countable result set; most results are free text. The `FABRICATED_TOOL` path is far better
served, with **7,344** structured tool calls available to check against.

**Two measurement bugs were caught in the experiment script before reporting** — both worth
knowing if reusing that code: tool responses were counted once per span despite the
conversation being cumulative (inflating 4,228 → 96,644), and the countable-result check
accepted any JSON list, marking 100% of responses countable by matching the
`[{"type":"text",...}]` wrapper rather than the payload.

---

## 12. Tool-claim redesign: BLOCKED on labelling, not engineering (2026-08-27)

The redesign was attempted through the agreed sequence — inspect telemetry → define what a
claim is → build a real-data benchmark → baseline → label → redesign. **It stopped at
labelling.** A future session should not restart this without reading §12.3.

### 12.1 A real benchmark exists, and the baseline is measured

`experiments/tool_claim_benchmark_build.py` → 574 cases from real traces, stratified over
6 cells and all 5 models. `datasets/external/exgentic_v2/derived/tool_claim_cases.json`
(gitignored, regenerable; provenance tracked).

`experiments/tool_claim_baseline_run.py` scored the **current** validator on it:

| | Own 19-case benchmark | Real-data benchmark |
| :--- | ---: | ---: |
| Precision / Recall / F1 | 1.000 / 0.727 / 0.842 | **0.000 / 0.000 / 0.000** |

Extraction on 1 of 574 cases. Confusion matrix TP=0, FP=0, FN=63, TN=61. **Accuracy reads
0.4919 and is meaningless** — it is the class balance, not skill; the script flags the
detector as degenerate so that number can't be misread as partial competence.

### 12.2 What a "claim" is, established from the data

Per-step agent prose is **intent** ("Let me search the messages"). The verifiable claim is
the **retrospective final summary**, which carries success assertions, numeric assertions
and action mentions at once while structured telemetry says what actually ran. 91% of
sessions have one.

Also established, and it constrains everything: **tool execution success/failure is NOT a
structured field.** OTel span `status`/`error.type` describe the *LLM call*
(`RateLimitError`, `BadRequestError`). Tool failure appears only as the word "error" inside
result text. And 359/406 results are a single-element `[{"type":"text",...}]` wrapper — no
typed counts.

### 12.3 ⛔ Why it is blocked — do not simply retry this

**No labelled accuracy target exists in this corpus.** All four candidate targets were
tested and all four failed:

| Target | Why not |
| :--- | :--- |
| Task-level overclaim | Labelled, but not derivable from the trace — error markers in 79% of overclaims vs 69% of consistent |
| `WRONG_COUNT` | Summary numbers are IDs, dates, domain quantities — not result counts. 6/54 overlap, coincidental |
| `RESULT_DISTORTION` | 2 of 137 sessions (1%) |
| `FABRICATED_TOOL` | Needs judgement; no structural label |

**The labelling attempt to fix this also failed** (`TOOL_CLAIM_LABEL_AGREEMENT_REPORT.md`):

| | This attempt | Original 50 cases |
| :--- | ---: | ---: |
| Cohen's kappa | **0.2252** | 0.922 |
| Disagreements excluded | 49 of 106 (46%) | — |
| Gold set | 57 cases | 50 |

Disqualifying three ways: kappa that low measures labelling noise; `FABRICATED_TOOL` and
`WRONG_COUNT` got **zero** gold examples; 75% of the set is one class.

**The informative part — and the thing not to repeat.** The disagreement was *systematic*,
not noise. Same model, same data, different prompt wording: pass A returned `UNVERIFIABLE`
**29** times, pass B **2** times. 22 cases went `UNVERIFIABLE → NO_MISMATCH`, 12 went
`RESULT_DISTORTION → NO_MISMATCH`. Pass B asked *"does the summary misrepresent the
telemetry?"* — a yes/no question defaulting to no. Pass A asked *"classify the summary
against the record"* — no default. **The framing supplied the answer more often than the
data did.**

That is not a prompt-tuning problem. The question *"does this multi-claim summary
misrepresent aggregate telemetry"* is **not well-posed on this data**, which is consistent
with the whole investigation: real agent summaries mostly are not checkable against their
traces. The original protocol reached kappa 0.922 because its task was tight — one explicit
claim against one explicit premise.

### 12.4 The way forward, and the ordering problem in it

Narrow the question rather than retry it: extract individual assertions first, then label
each against **the single tool result it refers to**. Same shape as the task that produced
stable labels before.

This creates a circularity worth naming: **the extractor is needed to produce labellable
units, and labels are needed to validate the extractor.** Resolve it by using extraction
only to *segment* claims, never to judge them, so the component under validation never
supplies its own verdict.

**The redesign itself is not discredited.** Reading structured `tool_call` telemetry rather
than regex-matching prose is still more correct than what ships. Validation is blocked, not
the design. `SpanInput.tool_name` and `ToolCallRecord` already model the structured side;
only `extract_claims()` is text-only.

### 12.5 Standing rules on this thread

- **Do not delete or rewrite the 19-case benchmark** (`experiments/tool_claim_benchmark.py`).
  It is preserved as evidence of why a self-authored benchmark was insufficient. Untouched
  throughout.
- **Do not integrate into production** until an accuracy figure exists. Firing rate alone
  is not sufficient — a detector that fires often but wrongly is worse than one that is
  silent, and that is exactly the trap the 19-case benchmark set.
- Labelling runs are expensive: ~31 minutes for 240 CPU inference calls, because full
  summaries dominate prompt processing. Size future runs accordingly, and add incremental
  saves — the current script writes only at the end.

---

## 13. Competitor capability audits — two claims refuted by installing the products (2026-08-27)

`COMPETITIVE_POSITIONING.md` §9 named its own weakest link: every "none of them ships X"
claim came from reading vendor marketing, not from using the products. Both auditable
platforms have now been installed and probed.

**Reports:** `PHOENIX_CAPABILITY_AUDIT.md`, `MLFLOW_CAPABILITY_AUDIT.md`
**Scripts:** `experiments/phoenix_capability_audit.py`, `experiments/mlflow_capability_audit.py`

### 13.1 Verdicts

| Claim | Arize Phoenix | MLflow 3.15.2 | Datadog |
| :--- | :--- | :--- | :--- |
| Tool-call verification absent | ❌ **refuted** — 3 evaluators | ❌ **refuted** — `ToolCallCorrectness`, `ToolCallEfficiency` | unaudited |
| Inter-agent disagreement absent | ✅ holds | ⚠️ holds *as named feature only*; composable via `@scorer` | unaudited |
| Drift absent | ✅ holds | ✅ **holds strongest** — no named feature *and* no primitives | unaudited |

**Tool-call verification is finished as a differentiator.** Present in both platforms where
it could be checked, while AgentPulse's own implementation measures F1 0.000 on real traces
(§11). Phoenix's `ToolResponseHandlingEvaluator` — *"what happens AFTER the tool returns"* —
is the exact reformulation §11 identified as AgentPulse's way forward, already shipped.

**Datadog is not installable**, so its column cannot be audited this way. Given that
installation refuted the claim for *both* platforms where it was possible, treat Datadog's
cells as the least reliable in the matrix, not as equally established.

### 13.2 Three methodological points worth carrying forward

**Present ≠ runnable.** MLflow's TruLens scorers (`LogicalConsistency`, `ToolCalling`,
`ToolSelection`, `PlanAdherence`) appear in the namespace but **fail at construction**
without an optional install. An import-only audit would have credited MLflow with
capability it does not ship working. Runnable probes were required to catch it. First-party
scorers behaved oppositely — failing only on missing input data, not dependencies.

**"No named feature" ≠ "cannot do this."** MLflow's `@scorer` decorator was probed and
**runs**, taking arbitrary Python over inputs, outputs and traces. Cross-agent contradiction
checking is plainly implementable there. The disagreement claim is therefore stated only in
the narrow named-feature sense — anything stronger is unsupported. The closest built-in,
`LogicalConsistency`, evaluates **one** agent's reasoning coherence, not contradiction
between distinct agents: adjacent, not equivalent.

**Deterministic evaluation is not unique to AgentPulse.** MLflow ships `RegexMatch` and
`PIIDetection`, both confirmed running with no LLM and no API key, marked
`source_type='CODE'`. After the Phoenix audit the surviving tool-claim differentiator had
been narrowed to "cost and determinism"; that narrowing did **not** survive MLflow. What
precisely survives: neither platform ships a *deterministic tool-claim* check, and MLflow's
tool scorers ask about **action quality** (right tools, right arguments, efficient
trajectory) where AgentPulse asks about **honesty of reporting**.

### 13.3 Positioning is now final for this round

`COMPETITIVE_POSITIONING.md` §3, §5.1, §5.4 and §9 were all revised after both audits
completed — deliberately not before, so the wording followed the evidence.

The most important change is in §5.4: the two remaining signals are **no longer presented
as equally strong**.

- **Drift is the strongest claim** — absent everywhere audited, no adjacent primitives, and
  the one capability AgentPulse has rebuilt and validated on external data (§10).
- **Disagreement is the weaker one** — holds only as "no named feature", and its F1 0.960
  still rests on 22 self-authored cases that have never been externally validated. The
  Exgentic corpus cannot supply that validation (one agent identity per session, §10).

### 13.4 Rules for any future audit of this kind

- **Install into a throwaway `uv` venv, never the project venv.** Both audit scripts refuse
  to run if they detect the project environment. Project pins were verified unchanged after
  each (numpy 2.5.2, torch 2.13.0+cpu, transformers 4.53.3) and both probes deleted. See §3
  for why this matters.
- **Enumerate, then probe.** Enumeration alone overcounts (§13.2).
- **Walking `mlflow` with `pkgutil` needs care** — CLI/server modules execute a click group
  on import and must be skipped, and optional extras raise on import, needing an `onerror`
  handler. Both are handled in `experiments/mlflow_capability_audit.py`.
- **Record scope limits.** Neither audit measured *quality* — only what exists and whether
  it runs. Arize AX (Signal, Alyx, Patterns) and MLflow on Databricks are separate
  commercial products and were not audited.

---

## 14. Inter-agent disagreement — externally validated, and it failed (2026-08-28)

The last of the three signals to be checked against external data, and the third to break.
Full detail in `DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md` and
`DISAGREEMENT_EXTRACTION_GENERALIZATION_REPORT.md`.

### 14.1 The result

| | |
| :--- | :--- |
| Internal benchmark (22 self-authored cases) | F1 **0.960** |
| External real multi-agent traces | **0 of 10** labelled contradictions detected |
| Max contradiction probability across all 10 positives | **0.0414** against a 0.6 threshold |

Not near-misses. Approximately zero. No threshold setting recovers them.

### 14.2 Why — the internal benchmark was measuring the wrong shape

The 22 internal cases have agent outputs of **median 10 words**:

```
"The customer's account is currently active and in good standing."
"The customer's account has been suspended and is not in good standing."
```

That is an SNLI minimal pair — one sentence frame, one negated proposition, exactly what
`cross-encoder/nli-deberta-v3-small` was trained on. The benchmark handed the detector
**pre-extracted claims**, so the absence of a claim-extraction stage was invisible to it.
Real DEBATE turns run ~2,100–2,600 characters of hedged, self-referential discourse.

**Truncation was tested first and refuted** — short pairs fail identically, and the
untruncated condition already retained both conclusions in 10/10 cases.

### 14.3 The fix works on one corpus and does not generalize

Supplying each agent's concluding assertion instead of its whole turn lifts recall
**0.00 → 0.60 at 0% false positives** on DEBATE. On a second, marker-free corpus
(`siddharthmb/multiagent-verification-failure-modes`) the same rule achieves **31.2%**
assertion-extraction correctness, moves recall 0.12 → 0.25 within fully overlapping
confidence intervals, and **doubles** false positives.

Cause: DEBATE mandates an `A) Yes / B) No` marker that is terminal by construction. In the
marker-free corpus **68% of assertions sit in the first third of the answer**, where a
last-sentence rule cannot reach.

**A first-sentence rule was deliberately not written.** It would be tuning against the
evaluation corpus, and it would fail on DEBATE exactly as the current rule fails here —
relocating the brittleness rather than removing it.

### 14.4 The finding that matters more than the failure

Real multi-agent systems **distribute evidence across agents**. So this exchange:

```
subagent_1: "Your documents do not include a direct quote from Mike Pence..."
subagent_2: "Your documents include a statement by Mike Pence (Excerpt [1])..."
```

reads as a flat contradiction and **is not one** — both agents are correct about their own
partition. Six of 40 labelled cases were of this form.

An NLI score compares two strings and has no representation of what each agent could see, so
**it cannot separate a genuine fault from legitimate disagreement caused by partial
evidence.** That gap widens as context distribution increases — precisely the regime this
project targets. It is a design constraint, independent of NLI quality or any extraction
method, and it is the real open research question here.

### 14.5 Standing rules from this thread

- The corpus's own structured fields (`solution`, `agreement`) were used **only for
  sampling**, never as labels. Scored as a label, `solution` mismatch gives precision 0.500 —
  a good screen, a useless label. Taking it as ground truth would have injected 50% noise.
- MALLM embeds literal `[AGREE]`/`[DISAGREE]` tokens in agent messages — present in **100%**
  of sampled pairs. Stripped before labelling and before detection; leaving them in would let
  both annotator and detector read the answer off the input.
- All labels here are **single-pass, single-annotator LLM labels with no kappa**. Adequate
  for diagnosis; explicitly **not** benchmark ground truth. The two-judge protocol
  (Qwen3-8B second pass) was designed and **not run**.
- The 370-row benchmark was sized (`experiments/disagreement_power_analysis.py`) and
  deliberately **not run** — measuring a detector at 0.00 recall more precisely was not worth
  the labelling cost.

---

## 15. Productization — seven phases, measured not asserted (2026-08-28)

Running record with evidence per phase: **`PRODUCTIZATION_LOG.md`**. That file, not this
section, is the authority.

**Scope decision:** thin vertical, not full SaaS. Target claim is *"self-hosted,
single-tenant, durable evaluation at a measured spans/sec, with self-monitoring and honest
capability tiers"*. The phrase **"production ready" is deliberately avoided** — binary and
unfalsifiable. Postgres, multi-tenancy, DR, rate limiting, OTLP and scale tiers 2–3 are
**deferred with stated reasons**, not overlooked.

### 15.1 What shipped

| Phase | Commit | Headline |
| :--- | :--- | :--- |
| Phase 0 freeze | `8a93558` `78697c5` `d1b5716` | dashboard checkpointed; report-regeneration hazard removed; capability tiers published |
| Migrations | `3ba2bb2` | schema under Alembic at `60a86ca23d8c`; 43,941 rows verified byte-identical after stamping |
| Durable queue | `6337a38` | SIGKILL mid-evaluation → job recovered, evaluated **exactly once** |
| ONNX fix | `f65d58b` | dead ONNX path repaired **and** backend made observable |
| Throughput | `a26fb11` | **~12 spans/sec at 4 workers**, measured |
| Retention | `b224c55` | `retention_days` actually deletes; 43,000 rows purged with 0 orphans |
| Self-monitoring | `baf485e` | platform state from real runtime signals |
| Health/readiness | `3cd1080` | explicit contract; **1.134 GB saved** per API process |

### 15.2 The numbers worth remembering

- **Durability, before:** SIGKILL during a 40-span batch lost **36 of 40** evaluations
  permanently, zero recovered. Nothing on disk recorded the work had been owed.
- **Durability, after:** 8,000 spans across 8 benchmark runs — **0 failed, 0 retries,
  0 duplicate evaluations**, at every concurrency level including 8 workers on one SQLite
  database.
- **ONNX:** worst probability difference between backends **1.2e-08** (identical), at
  **1.97× the speed**. First load performs the export (~200s, once per cache); subsequent
  loads 3.8s.
- **Throughput:** 4 workers is the operating point. 8 workers buys **8% more throughput for
  86% more memory** and 69% worse per-span latency. Per-worker CPU falls monotonically
  (12.28% → 7.20%) — physical-core saturation, with SQLite write contention an unisolated
  co-factor.
- **API footprint:** 1.236 GB → **0.102 GB**. Time-to-ready unchanged (~1.5s) — model loading
  was always on a background thread, so it never delayed readiness; it just held memory.

### 15.3 Standing facts that will bite if forgotten

- **`PRAGMA foreign_keys = 0`.** SQLite is not enforcing FKs and the app never enables it.
  Retention's correctness depends on **deletion ordering**, not on the database. Every
  destructive test asserts zero orphans rather than trusting it.
- **`load_models()` cannot be called twice in one process.** The second load strands torch
  tensors on the `meta` device. Any test that loads models must use a subprocess.
- **`models_loaded()` returns a dict, and `load_models()` defaults to `sync=False`.**
  `if not models_loaded()` can never fire (non-empty dict is truthy) and the default returns
  before models exist. Both caused a silent bug already.
- **The test suite writes to the production database** — one `pytest` run moves spans by ~2.
  Tests do not redirect `AGENTPULSE_DATABASE_URL`. Recorded, not fixed.
- **Two database files exist** (`data/` and `backend/data/`) because `database_url` is a
  *relative* sqlite path — which file you get depends on the working directory.
- **Retention is not scheduled automatically.** It ships as `python -m app.retention_cli` for
  cron. Deliberate: deletion is the one irreversible operation here. `--dry-run` first on any
  long-lived database.

### 15.4 Dashboard gaps recorded at checkpoint

Not fixed — the dashboard was frozen. Must not survive the dashboard phase:

1. `DriftCenterView` renders a hardcoded 5-point series while ignoring the real `agents` prop
   and the live `/v1/drift`; its 0.30 threshold was superseded by `window_centroid_distance`.
2. `DatasetsView` hardcodes its table including a `v1.0_curated / 1 case` row that is a guess
   about DB state; `GET /datasets` returns live counts. Header says 73, table sums to 74.
3. `ExperimentsView` configs D/E/F are stale (see next-steps item 8) and undated.

`dashboard/src/lib/api.ts:98` types `/v1/health` as `{status, models, version}` — that shape
is preserved and must stay preserved while the dashboard is frozen.

---
