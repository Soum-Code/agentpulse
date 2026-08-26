# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23. **Rewritten clean:** 2026-08-26. **Updated:** 2026-08-27 (Sections 0, 2, 4, 6 revised; Sections 7–9 added for the disagreement/benchmark/positioning work).

**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\project one agent`.

**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming. The entire multi-session arc has been about replacing fake/inflated numbers with real measured ones — treat that as the standing bar for any new work, not just past work.

---

## 0. TL;DR

- **Backend + evaluation pipeline: real, tested, working.** 121/121 tests passing (`pytest tests/ -q`). Security audit complete. Real model inference (Qwen3-8B via llama.cpp), not stub fallbacks.
- **Both reasoning-strategy benchmarks are DONE, real, and compared** — see Section 1 and `GPU_VS_CPU_BENCHMARK_REPORT.md`.
- **Inter-agent disagreement engine rebuilt and wired into production this session** — the project's largest claim-vs-reality gap is closed. See Section 7.
- **Two head-to-head benchmarks written, and both contradicted their own hypothesis** — reported that way rather than smoothed. See Sections 7 and 8.
- **Competitive positioning documented** (`COMPETITIVE_POSITIONING.md`) after reading MLflow/Arize/Datadog docs live. Verdict: breadth is unwinnable; the defensible niche is the three signals none of them ships as a named feature. See Section 8.
- **A real documentation defect was found and corrected**: `DRIFT_EXPERIMENT_REPORT.md`'s prose contradicted its own data table, and the same errors had propagated into `PROJECT_REPORT.md` §7. See Section 9.
- **Known honest gap: drift is the weakest of the four stated capabilities** (recall 0.400, and the embedding-centroid detector never fired at all). Section 9 has the diagnosis plan.
- Repo pushed through commit `19cde3a`. **Only uncommitted work is the dashboard** (6 files, ~1750 insertions) — see Section 2.
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
- Test suite: `pytest tests/ -q` — **121/121 passing** as of 2026-08-27, ~2.3s.
- **Two SQLite DB files exist and they are not the same one.** `./data/agentpulse.db` and `./backend/data/agentpulse.db`. The path in `.env` is relative (`sqlite+aiosqlite:///./data/agentpulse.db`), so which one the backend uses depends on its working directory — as launched, it writes to **`backend/data/agentpulse.db`**. Query that one when verifying, not the root one. This cost real debugging time once.
- **The backend auto-restarts when killed.** Something supervises it (not `--reload`, and not `.claude/launch.json`), so `Stop-Process` on the port-8000 PID results in a fresh process within seconds — which conveniently picks up code changes, but means you cannot simply stop it. Health is at `/v1/health`, **not** `/health`. Allow ~10s after restart for the evaluation models to load; `/v1/health` reports `models: {nli_model: false, ...}` until they do, and evaluation silently does nothing in that window.
- The ingest API requires `X-API-Key: change-me-to-a-secure-key` (from `.env`); requests without it get a 401 with no other clue.

---

## 5. Open question, never resolved: branch/PR workflow vs. direct-to-main

This repo has only ever had a `main` branch; every commit across every session has gone directly to it. A system-triggered PR-creation flow once asked for a PR from `main`, which isn't possible without a second branch to diff against. The user was asked whether to start using feature branches going forward and has not yet answered either way. Keep committing directly to `main` unless told otherwise; don't assume.

---

## 6. Immediate next steps, in likely priority order

The recommendation given to the user, and the reasoning, is in Section 9. Short version:

1. **Diagnose drift** (Section 9) — the one stated capability that isn't delivering, and nobody currently knows whether the detector or the test harness is at fault. Roughly half a day, and it settles a question the reports currently leave open.
2. **Install Arize Phoenix and run a real head-to-head** — it is open source and one command (`uvx arize-phoenix serve`). This converts every "none of them ships X" claim in `COMPETITIVE_POSITIONING.md` from doc-reading into measurement. Currently the single weakest part of the positioning.
3. **Get evaluation cases written by someone other than the person who wrote the code.** Every benchmark dataset here is self-authored and small (19 tool-claim, 22 disagreement, 11 drift). `DISAGREEMENT_BENCHMARK_REPORT.md` §6 already admits this is a dataset weakness rather than an engine strength.
4. **Decide what to do with the uncommitted dashboard work** (Section 2 callout) — verify it, then commit or discard deliberately.
5. Then the remaining dashboard items: Replay Debugger still renders `SAMPLE_REPLAY_STEPS` (fully fabricated), and `DatasetsView` still hardcodes a stale curated-case count.
6. Whenever picked up: the branch/PR question (Section 5) and the standing `gradient-text` hook suppression (Section 2) are both one-line user decisions away from being closed out.

**Deliberately NOT next:** production hardening (durable evaluation queue, real auth, retention, Postgres). Those are real gaps — see Section 8 — but they are "if users arrive" problems, and there are no users yet. Doing them now would displace items 1–3, which serve the project's actual stated goal.

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

## 9. Drift is the weakest capability, and a real doc defect was found there

**The defect.** `DRIFT_EXPERIMENT_REPORT.md` §2 claimed *"shifts at 50% and above… were detected within 1-2 spans"* while its own §1 table marked those exact rows `Detected: No`. Verified against `experiments/results/drift_experiment_results.json`: **the table was right**. Three separate errors, now corrected with a §4 correction notice, and corrected in `PROJECT_REPORT.md` §7 where all three had propagated:

1. Real recall on anomalies is **2 of 5 = 0.400**, not what the prose implied.
2. The "Magnitude" column was labelled as measured cosine distance but held `shift_level`, a **configured scenario parameter**. This is what let error 1 survive review: read as a distance, 0.50 appears to clear the 0.30 threshold. The measured distance for those rows was **0.042**.
3. The detection rule was stated incompletely — it is `centroid_distance >= 0.30` **OR** `stability_index < 70`.

**The bigger finding the mislabel was hiding:** no scenario's measured centroid distance ever exceeded **0.099** against a 0.30 threshold. So the embedding-centroid detector — the signal that most distinguishes this feature — **never fired for anything**. Both detections came via the ASI branch, from tool-entropy and quality-regression. And the three misses are exactly the semantic output drift the centroid signal exists to catch.

**What is genuinely unknown, and the reports say so rather than guessing:** whether that reflects a broken detector or broken test construction. `experiments/drift_scenarios.py` builds embedding vectors directly (`vec[1] = shift_level`) rather than embedding real drifted text, so a "50% shift" may simply not translate into comparable embedding-space displacement.

**The diagnosis to run (Section 6 item 1), roughly half a day:** replace the synthetic vectors with **real embedded text** — take a baseline set of agent outputs, then genuinely drifted ones (a prompt rewrite, or outputs from a different model; the Llama GPU run's outputs are already in the repo), and measure actual centroid distance. Either answer is valuable:
- Real drift reaches 0.30+ → the detector is fine and the synthetic scenarios were the problem; the threshold gets validated.
- Real drift also stays near 0.05 → the threshold or the centroid approach itself is wrong for this use case.

Right now the answer is "unknown", which is the worst position to be in about a capability the project claims. Note also that the 0.30 threshold **cannot currently be described as validated** — nothing in that experiment ever approached it.
