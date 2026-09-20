# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23. **Rewritten clean:** 2026-08-26. **Updated:** 2026-08-27 (Sections 7–9 disagreement/benchmark/positioning; 10 drift diagnosis and fix; 11 tool-claim external test; 12 blocked redesign; 13 competitor audits). **Updated:** 2026-08-28 (Section 14 — external disagreement validation, the last of the three signals to be checked and the third to fail; Section 15 — the productization arc, seven phases from migrations through health/readiness). **Updated:** 2026-08-30 (Section 16 — dashboard unfrozen, the landing-page claim audit, and the half-finished drift restore). **Updated:** 2026-08-31 (Section 17 — Final Review deliverables, the literature survey, and repository access). **Updated:** 2026-09-12 (Section 18 — frontend replaced and wired to the live API, the tool-claim signal made to fire for the first time, and the Compose stack fixed so it actually evaluates; MIT licence added, closing a claim the README had been making against a missing file). **Updated:** 2026-09-19 (Section 24 — the 23.4 pipeline run for the first time and five faults found in it, four of which meant it delivered nothing; the disagreement signal firing at 0.966–0.996 against the one agent in each trace that was correct, which is the evidence-partition problem of Section 14 with a reproduction on five model families; the ablation re-run and found never to have been stale; OmniRoute's free-token headline settled from its own source). **Updated:** 2026-09-21 (Section 26 — a RAG chatbot built so AgentPulse could be watched monitoring a live conversation; the four mechanisms in the shipped frontend that answered that question with fixtures; and the first sustained drift measurement this project has produced, which also showed the signal goes blind for 12 spans per agent after every worker restart). **Updated:** 2026-09-20 (Sections 24.8–24.9 — NVIDIA's 82-model catalogue is nine models on a free key; the refusal experiment at 87 trials, which reproduces 24.4 and shows a *wrong* refusal scoring 0.999 against a correct one's 0.978, so the signal tracks stance and is blind to correctness within it; and three analysis faults in that experiment, one of which produced a uniform, confident, entirely fabricated result from an unloaded model).

**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\Agentpluse` (renamed from `project one agent`; the venv's editable installs still point at the old path).

**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming. The entire multi-session arc has been about replacing fake/inflated numbers with real measured ones — treat that as the standing bar for any new work, not just past work.

---

## 0. TL;DR

- **Backend + evaluation pipeline: real, tested, working.** **209/209 tests passing** (`pytest tests/ -q`; was 130 before the productization arc). Security audit complete. Real model inference, not stub fallbacks.
- **Inter-agent disagreement failed its external check too — that is now three for three.** On real multi-agent traces the shipped configuration detects **0 of 10** independently labelled contradictions. The fix that recovers 6 of 10 does **not generalize**. Section 14; `COMPETITIVE_POSITIONING.md` revised. Every internal benchmark this project has checked against external data has broken or narrowed: drift, tool-claim, and now disagreement.
- **The evidence-partition problem is the more interesting finding** and is now the real research question for disagreement: agents holding different evidence produce apparent contradictions that are not faults, and an NLI score cannot tell the two apart. Section 14.
- **Production hardening happened, and is no longer "deliberately not next".** Seven phases: migrations, durable queue, ONNX fix, throughput measurement, retention, self-monitoring, health/readiness. All measured, not asserted. Section 15 and `PRODUCTIZATION_LOG.md`.
- **Drift was diagnosed and fixed** against an external real-trace corpus — false alarms on unchanged operation went from **91.7% → 1.5%**, detection 92%, AUC 0.991 on a held-out split. The 0.30 threshold was never the problem; the aggregation was. **But coverage is only 24.5%** — see Section 10, and do not quote the accuracy without the coverage.
- **Both reasoning-strategy benchmarks are DONE, real, and compared** — see Section 1 and `GPU_VS_CPU_BENCHMARK_REPORT.md`.
- **Inter-agent disagreement engine rebuilt and wired into production this session** — the project's largest claim-vs-reality gap is closed. See Section 7.
- **Two head-to-head benchmarks written, and both contradicted their own hypothesis** — reported that way rather than smoothed. See Sections 7 and 8.
- **Competitive positioning documented** (`COMPETITIVE_POSITIONING.md`). Verdict: breadth is unwinnable. The defensible niche was originally "three signals none of them ships" — **that is now two, and they are not equally strong**; see Sections 8 and 13.
- **A real documentation defect was found and corrected**: `DRIFT_EXPERIMENT_REPORT.md`'s prose contradicted its own data table, and the same errors had propagated into `PROJECT_REPORT.md` §7. See Section 9.
- **The tool-claim validator extracts NOTHING from real agent output** — zero claims across 8,353 prose spans, all 5 models, and **F1 0.000** on a real-data benchmark against its own 0.842. Its 19-case benchmark tested the regex against its own phrasing and could not have caught this. Sections 11 and 12. `COMPETITIVE_POSITIONING.md` §5.1/§5.4 have been revised accordingly.
- **The tool-claim redesign is BLOCKED on labelling, not engineering** (Section 12). A labelling attempt reached only kappa 0.225 and produced zero examples for two of the four target classes. Read §12.3 before restarting it — the failure mode is a question that isn't well-posed, not a prompt that needs tuning.
- **Competitor audits refuted a positioning claim.** Phoenix and MLflow were both installed and probed: **both ship tool-call verification**, so that differentiator is finished. Disagreement holds only as "no named feature" (MLflow's `@scorer` can build it); **drift is the strongest surviving claim**. Section 13; `COMPETITIVE_POSITIONING.md` has been revised accordingly.
- **The dashboard is unfrozen and the three Section 15.4 gaps are closed** — drift, datasets and experiments all read live endpoints now. Section 16.
- **The drift baseline restore was only half a fix, and that is the most consequential find of the session.** The restore brought back the EMA centroid but not the window pools, so `DRIFT_DETECTED` was blind for 32 spans per agent after every restart. Fixed and verified live. Section 16.3.
- **The new landing page shipped ten claims with no basis in the repo** — a grounding F1 that appears nowhere, an SDK command that does not exist, SOC2/HIPAA readiness, an Apache licence with no LICENSE file, and a whitepaper citing a results file that was never created. All corrected. Section 16.4; treat it as the standing example of why marketing copy needs the same evidence bar as a report.
- **The Final Review deck and speaker notes exist** in `presentation/`, built against the actual four-checklist rubric rather than a generic format. Never visually rendered - open the deck before relying on it. Section 17.2.
- **The dashboard was replaced wholesale and wired to the live API.** The upstream repository renders entirely from `mockTelemetry.ts` and makes no HTTP calls; an adapter layer now maps six endpoints onto its view models, and fields the backend does not measure render as an em-dash rather than a zero. Section 18.2.
- **The tool-claim signal had never fired once, and now does.** Zero non-zero scores across 1,328 evaluations, because `result_count` was never populated on the ingest path — three breaks plus a fourth that only surfaced after the first three were fixed. Section 18.4. This is the clearest example yet of a detector that benchmarks well and is unreachable in production.
- **`docker compose up` could never have worked.** No worker service, an undeclared `aiohttp`, a healthcheck calling a `curl` the image does not ship, and another probing an IPv6 `localhost` nginx does not bind. All four fixed and the stack verified end to end. Section 18.5.
- **Claims needed three separate correction passes**, the last one finding a "UMAP Projection" in the product views after the public page had been cleaned. Assume a sweep missed somewhere until it has been run against rendered output, not source. Section 18.3.
- **`agentpulse` is public now**, scanned for secrets first, and MIT-licensed. The licence was not a new decision: the README badge, the README link and `sdk/pyproject.toml` had all claimed MIT for months against a LICENSE file that did not exist. Section 18.8.
- **A literature survey now exists: 17 verified works, 9 from 2023 onward.** The papers are real and their limitations accurate, but they have not been read - the table is a reading list still owed. Section 17.3.
- **The baseline comparison shows the full system losing to its own ablation** (F1 0.842 against 0.941), because drift is a per-agent signal folded into a per-claim score. Kept in the deck with the mechanism and the nine-day staleness caveat. Section 17.4.
- **`main` has a second writer and no branch protection** - the Free plan does not offer it on private repos. Section 17.5.
- **Design direction is frozen in `bedhi_frontend.md`** — reference by reference, what to take and what to refuse, with Liquid Glass rules. Section 16.7.
- **Repo pushed through commit `3cd1080`; working tree clean, `origin/main` in sync.** The dashboard work that used to sit uncommitted was reviewed and checkpointed (`8a93558`) with three known gaps recorded — see Section 15.
- **The 23.4 multi-model pipeline had never worked, and now does.** Five faults in one file; four of them meant it delivered zero spans while printing a successful run. Section 24.
- **The signals are aggregate-stable and item-unstable, and only the first has ever been measured here. This is the session's result.** Now quantified: holding evidence and priors fixed and varying only wording, **disagreement spreads 0.948–0.984 across paraphrases of the same statement**, and **10 of 34 paraphrases crossed the alert threshold their anchor did not**. AUC is 0.979 throughout. **AgentPulse alerts per span, so it depends on the property that was never measured.** Sections 24.9.2 and 24.9.3.
- **It is disagreement specifically.** Contradiction holds to 0.004–0.057 on acceptances and only breaks on refusals (up to 0.634) — the same region 24.4 found it misbehaving in by a different method. The obvious lexical explanation was tested and rejected (24.9.3).
- **The disagreement signal's entire measured performance was an artifact, and removing the artifact removes the signal. This is the most consequential thing in Section 24.** The swing comes from comparing the planner's *questions* against the verifier's statement — ill-posed input to an NLI model, a pipeline fault rather than a DeBERTa fault. Excluding planner spans eliminates the paraphrase instability completely (spreads 0.98 → 0.001, alert flips → 0) **and drops AUC from 0.980 to 0.457, which is chance.** Sections 24.9.4 and 24.9.5.
- **Section 14's "0 of 10" now has a mechanism.** Disagreement failed external validation a month ago and nobody knew why. It was measuring a malformed comparison. The `HIGH` alert has been withdrawn; the score is still computed and stored.
- **Two of the four signals get their apparent performance from the harness, not the signal.** Tool-claim extracts a count from 9 of 9 real retriever outputs, and **0 of 9** once the sentence the demo's own prompt dictated is removed — which is the mechanism behind Section 11's zero claims across 8,353 prose spans. Disagreement is 24.9.5. **Drift is the robust one**: paraphrase spread 0.066 against disagreement's 0.948–0.984 on identical texts. Section 25.
- **Disagreement tracks stance, not error.** 87 trials across five verifier families: correct refusals **0.978**, **wrong** refusals **0.999**, correct acceptances **0.219**. Whether the verifier was right does not move the score. Section 24.9. **Cell D — a wrong acceptance — is still empty after 100 trials, so the 2×2 is not closed and cell C rests on n=3.** Getting there needs evidence designed to look relevant without answering, not more runs.
- **The ablation was never stale**, and the reason matters more than the re-run: it supplies its own inputs and so measures a ceiling, not a capability. Config D has shown parity with the best configuration for months while the live signal scored zero. Section 24.5.
- **OmniRoute's "~1.62B free tokens" and its "zero credentials" describe disjoint sets of providers** — settled from its own source, not inferred. Section 24.6.
- **Drift works, and it is blind for 12 spans per agent after every restart.** 34 conversational turns through a real RAG chatbot finally filled its windows — the first time this project has produced a sustained drift value at all. The verifier's mean rose 0.306 → 0.396 across a deliberate topic switch, correctly; the retriever stayed at 0.093, also correctly, because its output barely varies with the question. **Only the verifier has data on both sides of the switch**, so that is the whole claim. Section 26.3.
- **A monitoring dashboard shipped four separate ways of fabricating telemetry**, including a vite middleware that answered every `/v1/*` and `/chat` request from fixtures before it could reach a backend — no model was ever called and nothing was ever monitored, and it rendered perfectly. Seventh instance in this repo, and the first where the invented thing was telemetry rather than copy. Section 26.1.
- **A model can be served and then not, within hours.** `google/gemma-4-31b-it` answered the 24.8 scan and now hangs indefinitely with no error; `z-ai/glm-5.3-flash` followed it the same day. 24.7's "listed is not served" needs a third state. Section 26.2.
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

  **This next part changed on 2026-08-28 — the old advice is now wrong.** It used to say
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

**Production readiness — this assessment was accurate when written on 2026-08-27 and has since been largely acted on. See Section 15; the items below are done.**

The gaps as assessed then, in rough priority:

- [x] the evaluation executor is `ThreadPoolExecutor(max_workers=1)` at ~250–340 ms/span (~3–4 spans/sec ceiling) behind an in-process `BackgroundTasks` queue that **loses work on restart** — *replaced by a durable job queue with a separate worker; a SIGKILL mid-evaluation now recovers exactly once. Measured ceiling is ~12 spans/sec at 4 workers.*
- [x] `retention_days` is configured in `config.py` but **nothing implements it**, so the DB grows forever — *implemented, verified on real data.*
- [x] there is no self-monitoring — *`/v1/platform` plus worker heartbeats.*
- [x] no DB migration story — *Alembic, baselined and tested.*
- [ ] auth is a single shared static key with no rotation or tenancy — **still true.** Deferred deliberately: single-tenant self-hosted deployment.
- [ ] no backup/restore — **still true.** Deferred; follows a database decision not yet made.

**One conceptual trap noted during that discussion:** adding sampling to relieve the throughput ceiling would directly contradict the project's own thesis. `README.md` defines AgentPulse against exactly that — *"treat quality evaluation as an optional, sampled add-on… AgentPulse instead runs a real evaluator on every captured span."* Decoupling evaluation into separate workers is the right fix; sampling is a last resort, not a first option.

---

## 9. The drift documentation defect (historical — the capability itself is fixed, see Section 10)

**The defect.** `DRIFT_EXPERIMENT_REPORT.md` §2 claimed *"shifts at 50% and above… were detected within 1-2 spans"* while its own §1 table marked those exact rows `Detected: No`. Verified against `experiments/results/drift_experiment_results.json`: **the table was right**. Three separate errors, now corrected with a §4 correction notice, and corrected in `PROJECT_REPORT.md` §7 where all three had propagated:

1. Real recall on anomalies is **2 of 5 = 0.400**, not what the prose implied.
2. The "Magnitude" column was labelled as measured cosine distance but held `shift_level`, a **configured scenario parameter**. This is what let error 1 survive review: read as a distance, 0.50 appears to clear the 0.30 threshold. The measured distance for those rows was **0.042**.
3. The detection rule was stated incompletely — it is `centroid_distance >= 0.30` **OR** `stability_index < 70`.

**The bigger finding the mislabel was hiding:** no scenario's measured centroid distance ever exceeded **0.099** against a 0.30 threshold. So the embedding-centroid detector — the signal that most distinguishes this feature — **never fired for anything**. Both detections came via the ASI branch, from tool-entropy and quality-regression. And the three misses are exactly the semantic output drift the centroid signal exists to catch.

**One claim in that correction was itself wrong, and is superseded.** The §3 statement that "the embedding-centroid detector never fired at all" came from reading `final_centroid_dist` — the value *after* the EMA centroid has converged and the distance decayed. Peak distances were 0.4453 and 0.6838; the centroid branch did fire. Same class of error as the one being corrected. `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §3 records this; `DRIFT_EXPERIMENT_REPORT.md` §3 still carries the wrong sentence and **should be corrected** — the only drift doc item still outstanding.

**`experiments/drift_scenarios.py` regenerates `DRIFT_EXPERIMENT_REPORT.md` from a hardcoded template** (lines ~141-163) containing the original false prose. Running that script silently reverts commit `19cde3a`. This is *why* the contradiction existed: the table is generated from data, the §2 prose is a static string nobody re-derived. If you re-run it, restore the report afterwards (`git checkout -- DRIFT_EXPERIMENT_REPORT.md`).

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

**The cost, which must not be read past: coverage is 24.5%.** A `None` metric skips the
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

### 12.3 Why it is blocked — do not simply retry this

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
| Tool-call verification absent | **refuted** — 3 evaluators | **refuted** — `ToolCallCorrectness`, `ToolCallEfficiency` | unaudited |
| Inter-agent disagreement absent | holds | holds *as named feature only*; composable via `@scorer` | unaudited |
| Drift absent | holds | **holds strongest** — no named feature *and* no primitives | unaudited |

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

## 16. Dashboard unfrozen, and the honesty audit that came with it (2026-08-30)

The dashboard freeze from Section 15 is over. A full frontend rework landed (landing page,
connect/handshake flow, command surface, 3D spatial instrument), and it was audited against
the backend rather than accepted on sight. Most of this section is that audit.

### 16.1 The three Section 15.4 gaps are closed

All three now read live data: `DriftCenterView` calls `/v1/drift`, `DatasetsView` calls
`/v1/datasets` (real counts: dev 21, val 22, test 30, multiagent 22, curated 76 — the
hardcoded "1 case" was badly stale), and experiments come from `/v1/experiments`.

The `/v1/health` shape constraint recorded at the end of 15.4 is moot: nothing called
`getHealth` then, and the new surface uses `/v1/health/ready`, `/v1/health/evaluator` and
`/v1/platform` instead.

### 16.2 Backend fixes

**`/v1/experiments` crashed the whole console.** Three of the 31 files under
`experiments/results/` carry `dataset` as an object (`{id, url}`) rather than a string —
`disagreement_probe_key.json`, `extraction_generalization_key.json`,
`extraction_generalization_results.json`. The endpoint passed whatever shape was on disk
straight through, React refused to render an object inside a `<p>`, and with no error
boundary the entire `CommandSurface` unmounted to a blank page. Fixed with `_scalar_label()`
in `routers/experiments.py`, which flattens `model`/`dataset`/`timestamp` to display
strings. Nothing is lost — the untouched original is still returned under `data`.

The TypeScript type said `dataset?: string`, so `tsc` could not catch it. Same class of bug
as the `service_name` mismatch: **a type that lies about a response shape is worse than no
type at all.**

**`window_centroid_distance` is now persisted and queryable.** Column added to
`DriftRecord` (migration `c4b7e91a2f08`), written in `evaluation_runner.persist_results`,
exposed as `latest_window_centroid_distance` on `/v1/drift`. Previously the validated
sustained-shift metric only ever reached operators inside an alert payload.

### 16.3 The drift restore was half a fix — this is the important one

`worker.py` restores drift baselines on startup, with a comment saying it exists so drift
would not "go quiet exactly when the system had just been restarted". It only achieved that
for the wrong metric.

`load_centroid()` restored `_centroids` and `_sample_counts` — the EMA centroid, which
feeds `centroid_distance`, the *spike* signal. It did **not** restore `_baseline_sums`,
`_baseline_counts` or `_recent_embeddings`, which is what `_update_window_drift` needs. So
after every restart the spike metric worked immediately while
`window_centroid_distance` — the metric `DRIFT_DETECTED` actually fires on — returned
`None` until each agent re-accumulated `min_samples_for_alert` (20) fresh baseline samples
plus `mean_window` (12) window samples. **32 spans per agent of blind alerting, on every
restart.**

Observed directly: new drift rows carried real `centroid_distance` values (0.68, 0.61,
0.40) alongside `window_centroid_distance = NULL`, with `baseline_size` at 6-9.

Fixed with `serialize_window_baseline()` / `load_window_baseline()` and a second
`Baseline` row type, `window_baseline_pool`. The running sum is stored rather than the mean
so accumulation resumes exactly where it stopped. Only the baseline side is restored — the
current window is deliberately left cold, because outputs from before a restart are not
"current".

Verified live, not just in a unit test: after a real worker restart the log reads
`Restored drift baselines for 48 agent(s); window pools for 5`, and `sample_count`
continued 1 to 2 across the restart instead of resetting to 0.

### 16.4 Landing-page claims that did not survive checking

The new landing page shipped a number of statements with no basis in the repository. All
corrected; listed here because the same failure mode will recur:

| Claim | Reality |
| :--- | :--- |
| "94.2% F1" grounding benchmark | Appears nowhere in `experiments/results/`. Real cascade F1 is **0.963** (`Config_C_Cascade`). The only 0.9421 in the repo is a cosine similarity in a disagreement diagnosis file |
| `pip install agentpulse && agentpulse init` | The SDK declares no `[project.scripts]`. `agentpulse init` does not exist |
| "SOC2 / HIPAA Ready", "Full compliance" | No audit, no certification. Regulated claims with zero backing |
| "OSS Apache 2.0" (twice) | There is no LICENSE file in the repository |
| "SQLite WAL / PostgreSQL queue" | No Postgres driver, no Postgres code path |
| "evaluated on CPU in ~27.8ms" | 27.8ms is Config A, the embedding gate alone. Full cascade is 215.9ms |
| Whitepaper citing `gpu_vs_cpu_benchmark_results.json` | That file does not exist |
| Whitepaper: `baseline_comparison_results.json` "vs GPT-4o judge and Prometheus 2" | It compares three non-LLM baselines using qwen-7b |
| "Restores baseline centroids across restarts without loss" | See 16.3 — it was a partial restore |
| Hero listing "cross-agent contradictions" and "tool execution falsifications" | Both measure ~0 on external real traces. Removed from the headline; the tool-claim pillar is now labelled Experimental with its constraint stated |

**The pattern worth remembering: a fabricated citation is worse than no citation**, because
it looks checkable. An earlier fix to the sandbox introduced `ablation_eval_runs.json` as a
provenance line — a file that has never existed.

### 16.5 Other things measured

- **`Trace.overall_risk_score` and `Trace.status`** are now written by the evaluation
  runner, but only for newly evaluated spans. Historical traces stay `running` with null
  risk, which is why any "has risk" filter reads empty on old data.
  `scripts/backfill_trace_aggregates.py` recomputes both from stored evaluations
  (**dry-run by default**; on the live database it reports 1,211 traces to update out of
  20,577, with 19,366 having no evaluations at all).
- **Evaluation coverage is ~6%** (1,268 of 20,701 spans). An empty queue means nothing is
  *waiting*, not that everything has been scored — the console badge was changed from "All
  evaluated" to "Queue empty" for exactly this reason.
- **Migration state is inconsistent on the live database.** `alembic_version` reads
  `8d86fee0d663` while the schema already has both `worker_heartbeats` and
  `window_centroid_distance`. `alembic upgrade head` therefore fails with a duplicate
  column. Reconcile with `alembic stamp c4b7e91a2f08` before running migrations again.
- **The venv's editable installs point at the pre-rename path** (`project one agent`), so
  `import app` fails. Every command in this session used
  `PYTHONPATH=backend;sdk/src` as a workaround. Worth reinstalling.
- **The API is supervised and respawns when killed; the worker is not.** Killing the worker
  leaves the instance with no evaluator until it is started by hand.

### 16.6 AI-artifact cleanup

Emoji removed repo-wide: 51 in code (UI icons in `SwarmSimulator` and `LandingView` were
replaced with lucide components, not deleted) and 66 in documentation (status markers became
table text and standard `- [x]` checkboxes). Three "comprehensive"-style adjectives removed
from benchmark docstrings.

Deliberately **not** stripped: the explanatory comments. This repository's comments record
measured findings — why `optimum` is pinned, why partial windows are withheld, why
`useCountUp` skips animation in background tabs, why retention depends on deletion
ordering. Those are the reason the project can be picked up again, and they are not filler.

### 16.7 Design direction

`bedhi_frontend.md` is the frozen design research baseline: reference by reference, what to
take and what to refuse, with Liquid Glass rules grounded in what `index.css` already
enforces. The organising conclusion is that AgentPulse needs **two design modes** — an
expressive editorial public surface and a calm investigative product surface — and that
references are not interchangeable between them.

---

## 17. Review deliverables, literature survey, and repository access (2026-08-31)

Everything in Section 16 is now committed and pushed. This section covers what came
after: the Final Review presentation, the literature survey that had never existed, and
one repository-access change.

### 17.1 What is on origin/main

Seven commits landed after `4cc2072`, working tree clean and in sync:

| Commit | Contents |
| :--- | :--- |
| `3909d61` | `bedhi_frontend.md` — design research baseline |
| `ca0166f` | Liquid Glass material rules expanded in that document |
| `d662e80` | Backend: drift window baseline persist/restore, `window_centroid_distance` column and migration `c4b7e91a2f08`, `/v1/experiments` normalisation, `scripts/backfill_trace_aggregates.py` |
| `0b93172` | Dashboard rework: landing site, connect/handshake, operator console, and the ten corrected claims |
| `7f6196a` | Section 16 of this file, plus the AI-artifact cleanup and `.agents/` ignore |
| `e8405e9` | Design reference media (2.6 MB of binaries — worth moving to a release asset if the repo should stay lean) |
| `98cd2ae` | Ignore `agenttrace/` (a nested checkout with its own `.git`) and `linkedin_profile.md` |

`presentation/` is deliberately untracked so far.

### 17.2 Final Review deck, built against the actual rubric

`MTech_ProjectGuidelines_2026.pdf` turned out to be four review checklists — Review 0, 1,
2 and Final — not a single format. The deck was rebuilt against the **Final Review**
checklist, with each slide carrying a small tag naming the rubric item it answers.

Files (regeneration scripts sit alongside them):

- `presentation/AgentPulse_Final_Review_v2.pptx` — 18 slides, speaker notes on every slide
- `presentation/AgentPulse_Final_Review_Notes.pdf` — 9 pages: per-slide timing, opening
  line, talking beats, ten anticipated panel questions with answers, and a numbers
  cheat-sheet

The `_v2` suffix exists because some process holds a lock on the original filename. The
generator now takes `OUT=<name> node build_final_review.js`.

**Not verifiable in this environment:** LibreOffice is not installed, so the slides could
not be rendered to images for visual inspection. Schema validation passes, geometry is
clean apart from two intentional decorative bleeds, and the content dump is correct — but
the deck has never actually been *looked at*. Open it in PowerPoint before relying on it.

### 17.3 The literature survey now exists, and its papers are real

There was no literature survey anywhere in the repository — 35 markdown files, all
engineering or experiment reports. `COMPETITIVE_POSITIONING.md` compares *products*, not
papers, so it does not satisfy the checklist.

Seventeen works were found and verified by search, nine of them from 2023 onward. Ten are
on the comparison slide with method, evaluation set, metric and limitation; the full list
is on an appendix slide. The two most load-bearing:

- **MAST — "Why Do Multi-Agent LLM Systems Fail?"** (Cemri, Pan, Yang et al., NeurIPS
  2025, arXiv:2503.13657). 14 failure modes across 3 categories, 1600+ annotated traces
  from 7 frameworks, inter-annotator kappa 0.88. Sits directly above this project, and its
  limitation *is* the gap: it describes multi-agent failures without detecting them at
  runtime.
- **SummaC** (Laban et al., TACL 2022). Balanced accuracy 74.4% on its six-dataset
  benchmark. Its limitation — a single-document premise assumption — is exactly what breaks
  in a multi-agent setting.

The limitation column was written so the gap statement on the next slide falls out of it:
consistency metrics assume a single-document premise, judge-based methods pay per
evaluation (which is what forces sampling), drift methods are untied to correctness, and
MAST is descriptive.

**These papers have not been read.** They were verified to exist and their descriptions are
accurate, but a panel can pick any row. Treat the table as a reading list still owed. The
speaker notes carry this warning on the first page.

### 17.4 A result that works against the project, kept in

While pulling real numbers for the baseline slide, `baseline_comparison_results.json`
turned out to show the full system **losing** to one of its own ablations:

| System | P | R | F1 | FPR |
| :--- | ---: | ---: | ---: | ---: |
| D — NLI without drift | 0.889 | 1.000 | **0.941** | 0.083 |
| AgentPulse full system | 0.727 | 1.000 | 0.842 | **0.250** |

Recall is identical at 1.000 — the full system does not miss more, it raises three times
as many false alarms. The mechanism: drift is a *per-agent behavioural* signal, not
evidence about a single claim, so folding it into a per-claim composite pushes clean claims
over the threshold. Ablation configuration F confirms the same effect independently
(0.619 against 0.963 for NLI alone).

**Caveat that must travel with this number:** the file is dated 2026-08-18, nine days
before the drift rebuild, so it measures the superseded spike signal. Re-running it is
item 2 in the deck's future work, and it may well change the headline row.

### 17.5 Repository access

`SkSahoo98` (Swarup Kumar Sahoo) was added as a collaborator — read first, then raised to
**write** on request. The invitation was accepted; there are no pending invitations. Note
the email originally supplied was `sahooamit642@gmail.com`, a different first name from the
account holder; the username was confirmed by the owner before granting.

**Branch protection on `main` could not be applied.** Both the classic branch-protection
API and the newer rulesets API return:

```
403  "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

Branch protection is not available on the Free plan for private repositories. So `main` is
currently unguarded and a second account has write access to it. The options, none of which
have been taken: make the repository public, upgrade to Pro, or drop the collaborator back
to `triage` (comment on issues and PRs, no push).

### 17.6 Standing operational facts, unchanged

These were true at the end of Section 16 and are still true:

- **`alembic_version` reads `8d86fee0d663`** while the schema already contains both
  `worker_heartbeats` and `window_centroid_distance`. `alembic upgrade head` fails with a
  duplicate column. Reconcile with `alembic stamp c4b7e91a2f08` first.
- **The venv's editable installs point at the pre-rename path**, so `import app` fails.
  Every command in these sessions used `PYTHONPATH=backend;sdk/src`. Fix with
  `pip install -e backend -e sdk`.
- **The API is supervised and respawns when killed; the worker is not.** Killing the worker
  leaves the instance with no evaluator until it is started by hand.
- **Evaluation coverage is ~6%.** An empty queue means nothing is waiting, not that
  everything has been scored.

---

## 18. Frontend replaced, tool-claim made to work, and the stack deployed (2026-09-12)

Six commits on `main` since the collaborator's push. The session began as a review of that
push and ended with a Compose deployment that actually evaluates spans.

### 18.1 Reviewing b7dc43c, and one false alarm of my own

`SkSahoo98` pushed a comic-theme dashboard rework (4,745 insertions, CommandSurface split
into seven files). The earlier honesty fixes on `BentoPillars.tsx` survived it. One
regression did not: `WhitepaperModal.tsx:153` had reverted to `Self-hosted · Apache 2.0`
while the repository still ships no LICENSE file.

I also reported the dashboard rendering completely unstyled with a Tailwind
"content is missing or empty" warning. **That was my own setup, not their bug.** Tailwind
resolves its `content` globs against `process.cwd()`, not against Vite's `--root`, and I was
starting Vite from the worktree. Started from inside `dashboard/`, the stylesheet went from
19 KB to 79 KB with every utility present. Now documented in `STARTUP_GUIDE.md` 7.3.

### 18.2 The frontend was replaced wholesale

`Soum-Code/frontend` renders entirely from `src/data/mockTelemetry.ts` and makes no HTTP
calls at all. Dropping it in as-is would have put invented numbers on screen, so the swap
came with a wiring layer:

- `src/lib/adapters.ts` maps `/v1/agents`, `/v1/drift`, `/v1/traces`, `/v1/alerts`,
  `/v1/datasets` and `/v1/experiments` onto the UI's view models.
- `src/lib/useTelemetry.ts` polls every 10s, lists traces first, then hydrates spans.
- Curate, simulate and acknowledge call the real endpoints.
- The synthetic telemetry pulse, which fabricated a trace with invented latency and
  evaluator evidence every twelve seconds, was removed.

Fields with no backend source (cost, per-agent tokens, framework, tools, version, root
cause, win rate, embedding coordinates) are optional in `types.ts` and left undefined; the
views render an em-dash rather than a plausible zero.

Real defects found while wiring:

- **The drift count treated "no baseline yet" as drifting**, reporting all 51 agents as
  flagged. It now counts only agents whose windows filled and exceeded the threshold.
- **`successRate` was emitted as a ratio but rendered as a percentage**, so 100% success
  displayed as 1%.
- **Nineteen unguarded reads** of now-optional fields crashed `OverviewView` on first paint.

### 18.3 Claims corrected, in three separate passes

The landing page carried figures the codebase does not support: `< 1.4 ms` ingestion,
`0.02% CPU` overhead, `12 Live Swarms`, `98.4% Confidence`, a `v2.4` version badge, and a
scripted walkthrough presented under `agentpulse://live-telemetry` with a pulsing
`STREAM ACTIVE` badge.

**Four OpenTelemetry claims were false.** There is no OTel dependency, import, or
semantic-convention mapping anywhere; `SpanInput` is a custom schema. The comparison table
now says so explicitly.

**All four SDK snippets referenced API that does not exist** — `pulse.init`, `@observe`,
`instrument_langgraph`, `instrument_crewai` — and the LlamaIndex and TypeScript tabs
described integrations that were never written. The real exports are `AgentPulse` with a
`.monitor()` decorator, `instrument_graph(graph, pulse)`, `CrewAIAdapter` and
`LangChainAdapter`. There is no JS SDK.

A third pass was needed later: the **product** `DriftView` still called its panel a
"UMAP Projection" with a "5,000 verified runs" region. No UMAP exists in the codebase, and
that panel cannot plot anything because the API exposes distances rather than coordinates.
The first sweep had covered only the public page.

### 18.4 The tool-claim signal never worked, and now does

Across 1,328 evaluations no span had ever scored above zero on tool-claim, and no
`TOOL_CLAIM_MISMATCH` alert had ever been raised. Three separate breaks:

1. `evaluation_runner` built its tool-call record with only `tool_name` and
   `result_summary`. `_check_count_mismatch` returns early unless `result_count` is set, so
   the comparison never ran.
2. There was no way to derive that count. `tool_claim.extract_result_count()` now reads it
   from the tool's own result summary using the same `COUNT_PATTERNS` that read counts out
   of an agent's prose.
3. The simulator computed `is_mismatch` and never used it, so `tool_mismatch` emitted the
   clean payload byte for byte — both scored an identical 0.0073.

A fourth problem surfaced only after the first three were fixed: `COUNT_PATTERNS` requires
the noun adjacent to the number, so `"Retrieved 3 foundational papers"` extracted no claim
at all. **The clean case had been silently unmatched too.** Both scenarios now read
`"Retrieved N papers"`.

Verified live: `tool_mismatch` scores 1.0 and raises the alert, `clean` scores 0.0 and
raises nothing. The detector's own patterns are untouched, so its benchmarked behaviour is
unchanged.

### 18.5 Compose could never have worked

Four faults, each blocking the next:

1. **`docker-compose.yml` defined no worker service.** A Compose deployment accepted spans
   and never evaluated them. Both the deep dive and the deck had claimed it built "the API,
   worker and dashboard"; that was my error and is corrected in both.
2. **`aiohttp` was never declared** by the backend, though `services/alerting.py` imports it
   for webhooks. It resolved in dev only because the SDK declares it and shares the venv.
   Both containers crash-looped on `ModuleNotFoundError`.
3. **The backend healthcheck shelled out to `curl`**, which `python:3.11-slim` does not
   ship, so the container could never report healthy.
4. **The dashboard healthcheck probed `localhost`**, which resolves to `::1` first inside
   the container while nginx binds IPv4 only. Every probe was refused.

Faults 3 and 4 had never been observed because the stack had never been run to completion.

### 18.6 Drift verified end to end, three times

`window_centroid_distance` had produced a value zero times in the instance's history.
Driving a fresh agent through 20 baseline spans then 14 on an unrelated topic produces it
reliably:

```
after 20 baseline spans   baseline_pool 19,  window null
after 14 shifted spans    window 0.879-0.929,  spike 0.27-0.32,  ASI 100 -> ~52
                          -> DRIFT_DETECTED raised on the window, not the spike
```

In the Docker run the spike finished at **0.272, below the 0.300 threshold**, while the
window read 0.879. Alerting on the spike would have missed it entirely.

### 18.7 Deliverables

- `presentation/AgentPulse_Deep_Dive.pdf` — 11 pages, 17 sections, generator
  `build_deep_dive.py`.
- `presentation/AgentPulse_Project_Deck.pptx` — 18 slides, generator
  `build_project_deck.js`.
- `STARTUP_GUIDE.md` — fresh clone to verified instance, with the failure modes actually
  hit on this machine.

Both deliverables were rebuilt twice: once for the docker-compose correction, once after
tool-claim started firing. A generator bug worth recording: pptxgenjs's `LAYOUT_16x9` is
10 x 5.625in, not 13.33 x 7.5in, so every coordinate fell off the canvas — 132 shapes
outside the slide. Caught by a geometry check, not by eye.

### 18.8 Repository housekeeping

- `Soum-Code/agentpulse` is now **public**. Scanned first: no `.env` ever committed, no
  database tracked, no secret patterns in tracked files or history. The one hit was the
  documented placeholder `change-me-to-a-secure-key`.
- Five tutorial or empty repositories were deleted by the user (`Friday`, `Friday-Setup`,
  `hello-cloudbuild-app`, `hello-cloudbuild-env`, `hello-world-mlops`), taking the account
  from 18 to 13.
- MIT licences added to nine code repositories. `CAR` (Apache-2.0) and `agenttrace` (MIT)
  were left alone. **`agentpulse` was left unlicensed at first**, pending confirmation of
  who owns the M.Tech IP, and licensed MIT once the user decided. That turned out not to be
  a new decision at all: the README badge, the README's `MIT. See [LICENSE](LICENSE)` link
  and `sdk/pyproject.toml`'s metadata had all claimed MIT while the file was missing, so the
  repository went public claiming a licence it did not have. Adding it made three existing
  claims true rather than introducing a fourth. `backend/pyproject.toml`, which had no
  licence field at all, now declares MIT too.
- 277 decorative comments stripped from the frontend and 27 Python banner comments
  simplified. Verified code-identical: with comments stripped from both sides, all 25
  changed files compared equal to HEAD.

### 18.9 Standing operational facts

Unchanged from 17.6 and still true:

- **`alembic_version` reads `8d86fee0d663`** while the schema already has
  `window_centroid_distance`. Reconcile with `alembic stamp c4b7e91a2f08` before any
  `upgrade head`.
- **The venv's editable installs point at the pre-rename path.** Every command this session
  used `PYTHONPATH=backend;sdk/src`, and the worker needed a `_worker_launcher.py` shim.
  Fix with `pip install -e backend -e sdk`.
- **Evaluation coverage on the local database is ~6%** (1,328 of 20,790 spans). The Docker
  volume is a separate, fully-evaluated 69-span demo set.

New and still open:

- **The dashboard has no test framework.** Every frontend fix this session rests on type
  checking, a successful build, and manual verification against a live backend.
- **Three superseded presentation drafts** (`AgentPulse.pptx`, `AgentPulse_Final_Review.pptx`,
  `AgentPulse_Speech_Notes.pdf`) are still tracked, along with their now-dead generators.
- **`hybrid-moe-codegen` carries 83 MB of model weights in git**; removing them needs a
  history rewrite.

---

## 19. Deployed publicly, and the claims that did not survive contact with it (2026-09-15)

Thirteen pull requests, #4 through #16, all merged to `main` and all live. The
theme running through them: putting the system somewhere real, and then finding
out which of its documented claims were true.

### 19.1 It is deployed, on a URL that outlives the laptop

**https://agentpulse.centralindia.cloudapp.azure.com**

The hostname was originally `agentpulse-demo`, which read as though the instance
were a mock rather than the running system -- it was only the DNS label picked
when the public IP was created. Renaming it (#16) took a restart for Caddy to
obtain a certificate for the new name, about thirty seconds of downtime, and
eleven reference updates across nine files. Two of those would have broken
quietly: `sitemap.xml` and the `canonical` link would have kept pointing search
engines at a name that no longer resolves. **The old hostname is gone**, so any
link shared before the rename is dead.

Azure for Students, chosen after checking the alternatives rather than by
default. The constraint that decided it is not price but memory: the evaluation
worker measures **1.148 GB** resident, because `grounding.py` loads the
embedding model through SentenceTransformer and therefore pulls in torch no
matter what `AGENTPULSE_USE_ONNX` says. Koyeb, Render, Northflank and every
other no-card free tier caps at 512 MB. Hugging Face Docker Spaces became
PRO-only. Oracle wanted a credit card. Azure for Students does not.

| | |
| :--- | :--- |
| VM | `agentpulse-vm`, Ubuntu 24.04, Central India |
| Size | `Standard_B2als_v2` — 2 vCPU, 3.8 GB, 60 GB disk |
| Cost | $24.67/month, so the $100 credit lasts about four months |
| TLS | Caddy, Let's Encrypt, renewed by itself |
| Ports published | Caddy's 80 and 443 only |

The backend and dashboard publish no host ports at all; everything reaches them
over the compose network. Two deliberate reboots confirmed the stack returns on
its own, the data survives, and Caddy reuses the stored certificate instead of
re-issuing — which matters, because repeated issuance would trip Let's Encrypt's
rate limit for the hostname.

`deploy/azure/` carries the overlay and a README written as the deployment
actually went, including the resource providers a new subscription must register
before `az vm create` stops failing unhelpfully.

### 19.2 Two bugs that would have made the deployment useless

**The dashboard would have shown every visitor an empty console.**
`VITE_API_URL` was baked into the bundle as `http://localhost:8000` from two
independent places: `dashboard/.env` reached the image through `COPY . .`
because Docker does not read `.gitignore`, and the root `.env` is auto-loaded by
compose for `${VITE_API_URL:-}` interpolation, so the empty default never
applied. Either alone was enough. Every visitor's browser would have called
their own machine.

**nginx dropped the backend after any restart.** `proxy_pass
http://backend:8000` resolves the name once at startup and caches it.
Recreating the backend gives it a new IP, and every proxied request then
returned 502 until nginx was restarted too — which is exactly what happened
mid-deploy. Resolving through a variable against Docker's embedded DNS moves the
lookup to request time; confirmed by recreating the backend and watching the
site recover in twelve seconds with no restart.

Both had been latent for weeks. Neither would have shown up without deploying.

### 19.3 The "two-stage cascade" does not cascade

`grounding.py` described itself as running DeBERTa "only when Stage 1 is
ambiguous", with `STAGE1_SAFE_THRESHOLD` and `STAGE1_RISK_THRESHOLD` defined
beneath that sentence. `evaluate_grounding()` has no such branch. Both models
run on every span.

The ablation data proves it without reading any code:

| Configuration | Latency |
| :--- | ---: |
| MiniLM only | 27.83 ms |
| DeBERTa only | 188.07 ms |
| shipped | **215.90 ms** |

215.90 is their sum. A gate that ever fired would land between them.

**The documentation moved; the behaviour did not.** Adding the gate would change
the score of every span whose similarity clears the threshold, leaving
`THRESHOLD_ANALYSIS.md`, `GROUNDING_SCORE_CALIBRATION_REPORT.md` and
`LLM_JUDGE_COMPARISON_REPORT.md` describing a system that no longer runs. It is
an experiment with its own measurements, not an edit. Both constants were kept:
`STAGE1_SAFE_THRESHOLD` is genuinely read in the NLI-unavailable fallback, and
`STAGE1_RISK_THRESHOLD` is the recorded origin of `disagreement.py`'s
`RELEVANCE_FLOOR`.

### 19.4 Three silent failures made audible

A monitoring tool that fails quietly is worse than one that fails loudly.

**Liveness and readiness required an API key** while `/v1/health` did not — so
every Kubernetes probe, load balancer and uptime monitor read the service as
permanently unhealthy. Both are public now. `/v1/health/evaluator` deliberately
is not: it reports worker counts, backend distribution and degradation reasons.
Readiness answers at two levels — anyone gets `{"ready": bool}`, a key holder
also gets `checks`, which carries the raw database exception string and on
failure can name a file path or connection target.

**`seed_demo.py` reported success after doing nothing.** Its probe sent no key,
got 401 for two minutes, and exited printing "API never became reachable;
skipping". This actually happened during the Azure deployment.

**Grounding can be switched off with nothing saying so.** The capture flags
default to false, so a correctly installed deployment with a healthy worker can
evaluate every span and never produce a grounding score — `evaluator.py` simply
skips the step. `/v1/platform` now reports `signal_coverage`, derived from
recent evaluations rather than a counter so it survives restarts, and says
explicitly that a coverage of 0.0 means switched off rather than failing. The
worker logs the same once per process; once per span would be noise, which is
how it stayed invisible.

### 19.5 The product stopped being LangGraph-only

This was the largest functional gap in the project. `@monitor` reads its first
argument as a LangGraph state dict, and `langchain.py` and `crewai.py` are
21-line classes whose every method raises `NotImplementedError`. Anyone using
the OpenAI or Anthropic SDK directly could not use AgentPulse at all.

```python
client = pulse.instrument_llm(OpenAI())
```

Every agent calls an LLM, so wrapping that call reaches all of them with one
implementation — and it is the most useful place to stand rather than merely the
most general, because the prompt and the completion are exactly the pair
`evaluate_grounding` compares.

Verified end to end against the running stack, not only in tests. A prompt
saying the Eiffel Tower is in Paris and a completion saying Berlin produced
`span_kind=LLM`, model and tokens recorded, grounding **0.9999** at stage2,
label `high_risk`, and both `GROUNDING_FAILURE` and `HIGH_HALLUCINATION_RISK`.
No framework in that path.

Three limits, chosen rather than incidental: it wraps the client instance rather
than the library globals, streaming records the call but not the output
(`metadata.output_captured = false`), and the capture flags still apply.

The decorator also now pushes its own span as the active context while the
wrapped function runs. Without that, an LLM call inside a monitored node became
its sibling rather than its child — the waterfall was a flat list wearing a
tree's shape.

### 19.6 Tests: the frontend has some, and the WAL flake is resolved

**The dashboard had no test framework at all.** It now has Vitest and 32 tests,
placed over `adapters.ts` and `api.ts` — the two files where every user-visible
defect in this project has originated. `adapters.ts` carries a rule TypeScript
cannot enforce ("every field is either read from the API or left undefined"),
because `number | undefined` accepts a cheerful `0` as readily as a real
measurement, so most of those tests check that absent stays absent.

Verified by mutation rather than by passing: reintroducing the severity
case-sensitivity bug failed one test, reintroducing the absolute-URL bug failed
three.

**The crash-recovery flake was diagnosed, not suppressed.**
`test_worker_killed_mid_evaluation_recovers_exactly_once` failed about one run
in three with `disk I/O error`, and it guards the headline durability claim — so
it mattered whether it was the harness or the queue losing data.

A failing run was captured with `--basetemp` retained. That same database opens
cleanly afterwards, reports `integrity_check = ok`, and holds exactly what the
test asserts: one job, running, attempts 1, lease set, no evaluation. Windows
releases a dead process's handles asynchronously and the read landed inside that
window. A standalone probe killing a worker the same way never reproduced it,
which ruled out an ordering bug.

The helpers retry, bounded at ten seconds and re-raising after — verified
against a path SQLite can never open, which raises at the bound rather than
looping. Eight consecutive passes; suite is **226**, plus 32 in the dashboard.

### 19.7 Documentation now has three levels

- **`FLOW.md`** — plain language, following the Eiffel Tower call
  from one line of code to a red incident. States early that there is no LLM
  judging anything, since that is what readers assume.
- **`HOW_IT_WORKS.md`** — the specification. Section 10 records
  every place the code disagrees with its own documentation.
- **`STARTUP_GUIDE.md`** — running it, with the failures to expect.

`README.md` was carrying three false claims: a React 18 badge against
`package.json`'s 19.0.1, a hardcoded "Tests 99/99 Passed", and a quickstart that
**never mentioned the evaluation worker** — follow it and you get an API that
accepts spans and evaluates none of them, with no error saying why.

### 19.8 Discoverability, and the name

Topics, homepage, a `v0.1.0` release, `robots.txt`, `sitemap.xml`, `canonical`
and `og:url`. And a real blocker found in the process: the SPA returned **200
for every path that does not exist**, so a mistyped asset URL got HTML under a
`.js` address — and Google Search Console refuses to verify a site that cannot
404, because a server answering 200 for everything would let anyone claim it.
nginx now 404s paths that look like files and keeps the shell for routes.

**The name is contested and cannot win a search.** PyPI's `agentpulse` belongs
to someone else, AvePoint ships a commercial AgentPulse, `agentpulses.com` is a
hosted SaaS, and at least four other GitHub repositories use the name — one of
which, `proveai-agentpulse`, also does drift detection for multi-agent systems.
The decision taken was to keep the name: renaming touches the name in roughly nine hundred places across the repository
-- `git grep -ic agentpulse` for the current figure -- including the env prefix
and the deployed hostname, and the academic deliverable does not depend on
search ranking.

### 19.9 The deck, and 5.9 GB of disk

Six claims on the project deck had stopped being true in both directions —
adapters that do not exist, a gated cascade that never gated, a Compose file
said to lack the worker it has; and drift-window persistence and a frontend test
framework listed as missing when both exist. Slide 15 reported 20,771 spans and
1,328 evaluations from a database that no longer exists and figures recorded
nowhere in the repository, so it was rebuilt around what can be produced on
request.

Two bugs surfaced doing it. The notes scripts wrote their PDF to a bare
filename, so running them from the repo root dropped it there while the copy in
`presentation/` stayed stale — and printed that it had written it. And there was
no `.gitattributes`, so Git had decided the PDFs were text and intended to
rewrite their line endings.

Deleted: `models/gguf/Qwen3-8B-Q4_K_M.gguf` (4.7 GB, the LLM-judge baseline —
its results and the gold labels it produced remain), a duplicate 1.2 GB model
cache under `backend/`, a stale SQLite database, an abandoned clone, and four
agent prompt files. Note that `backend/models/` **returns** whenever the suite
runs from that directory.

### 19.10 Standing facts, updated

Closed since 18.9:

- ~~The dashboard has no test framework~~ — Vitest, 32 tests.
- ~~`_worker_launcher.py` shim~~ — deleted.
- ~~Evaluation coverage ~6% (1,328 of 20,790)~~ — that database is gone;
  `/v1/platform` now reports `signal_coverage` from live data instead.

Still true:

- **`alembic_version` reads `8d86fee0d663`** while the schema already has
  `window_centroid_distance`. Reconcile with `alembic stamp c4b7e91a2f08` before
  any `upgrade head`.
- **The venv's editable installs point at the pre-rename path.** Every command
  still needs `PYTHONPATH="backend;sdk/src"`. Fix with
  `pip install -e backend -e sdk`.
- **Three superseded presentation drafts** are still tracked with their
  generators. `build_final_notes.py` still produces notes for one of them.
- **`hybrid-moe-codegen` carries 83 MB of model weights in git.**

New and open:

- **`pip install agentpulse` fetches someone else's package.** The SDK installs
  from source only.
- **Dashboard tests cover `lib/` only**; no component is tested.
- **LangChain and CrewAI adapters remain stubs.** `instrument_llm` covers much of
  the same ground, but neither adapter exists.
- **Grounding misreads rounded numbers** — "7.61 billion" against "approximately
  7.6 billion" scores 0.922 risk. Reproducible, and deliberately unpatched:
  fixing from one observed case is fitting to one data point.
- ~~**Google Search Console verification is not done.**~~ Verified 2026-09-16
  via the meta-tag method; the token lives in `dashboard/index.html` so a later
  build cannot silently drop it and un-verify the property. Indexing is a
  separate matter and takes days to weeks. Expect the repository to surface in a
  search before the site does: it is a client-rendered SPA with no backlinks,
  and the name is contested by a commercial product of the same name.

---

## 20. Three external audits, and what was left after checking them (2026-09-16)

PRs #18 and #19. Three architectural critiques arrived in sequence, each
written with more confidence than the last. Between them they surfaced four real
defects. They also asserted a good deal that is not so, and the useful record
here is which was which — because the same proposals will come back.

### 20.1 The landing page was still making claims the backend had stopped making

The backend has been audited for invented claims repeatedly. The page in front
of it never had.

| Claim | Where | Reality |
| :--- | :--- | :--- |
| "OpenTelemetry-compatible telemetry stream" | `ConnectModal.tsx:72` | No OTel dependency, exporter or semantic-convention mapping exists |
| "OpenTelemetry exporters & security parameters" | `CommandPalette.tsx:158` | same |
| `tag: 'OTel Ingestion'` | `PublicExperience.tsx:1345` | same |
| `pip install agentpulse` on the copy button | `PublicExperience.tsx:52` | That PyPI name belongs to an unrelated project |
| "LangGraph, CrewAI, LlamaIndex" | `AgentsView.tsx:39` | Only LangGraph has an adapter; no LlamaIndex code exists at all |
| "LangGraph and CrewAI integrations" | OBSERVE phase | same |
| "4 active swarms" | `AgentsView.tsx:39` | Hardcoded, and disagreed with the backend |

The OpenTelemetry one was worse than a stray claim: **the page contradicted
itself.** Line 1513 already read "AgentPulse span schema (not OpenTelemetry)".
Somebody had corrected one spot and left three.

The walkthrough told a generic story about a hallucinated SQL column against
`fact_cohort_v3` — a trace that had never been executed. It now carries the one
that was: `instrument_llm(OpenAI())`, a prompt placing the Eiffel Tower in
Paris, a completion placing it in Berlin, 202 at ingest, and DeBERTa returning
contradiction at 0.9999 with both alerts raised.

And nothing on the site said **AgentPulse never calls an LLM to judge** — the
grep returned nothing. That is the single assumption every reader brings, and
price, latency and determinism all follow from it. The hero now states it, with
each figure labelled by the run that produced it, and with the part that does
not flatter us in the same panel: the 8B judge scored F1 1.000 against our
0.963.

### 20.2 Two real limits, made observable rather than fixed

**The NLI model reads at most 512 tokens.** Premise and hypothesis share that
budget, so a long premise is what gets cut. Measured:

```
short premise :   19 tokens   truncated=False   score 0.9998
long premise  : 2719 tokens   truncated=True    score 0.9697
```

2,207 tokens discarded, and the call returned a perfectly ordinary-looking
number. A retrieved context whose supporting passage sits past the cut is scored
against evidence the model never saw.

`GroundingResult` now carries `input_tokens` and `input_truncated`; the worker
logs it once per process. **The premise is deliberately not windowed** — that
would fix the blindness and alter every figure in `THRESHOLD_ANALYSIS.md` and
`GROUNDING_SCORE_CALIBRATION_REPORT.md`. Same argument that kept the cascade
gate out in 19.3: an experiment, not an edit.

**The SDK's send buffer was an unbounded list.** The audit's stated mechanism
was wrong — a failed send goes to the fallback file rather than staying in
memory. The real one: `_ensure_transport` returns quietly when there is no
running event loop, so the flush task never starts, and every span then
accumulates in the agent's own process forever, sending nothing and saying
nothing. For an SDK whose promise is that it cannot break what it observes, that
is the wrong failure to have.

Bounded at `max_buffered_spans`, 10,000 by default. Oldest first, since a
backlog makes recent spans the useful ones; drops counted in
`stats['total_dropped']` and reported once.

Eleven tests cover both, including that each warning fires once rather than per
span — per-span noise is precisely how both stayed invisible.

### 20.3 What the audits got wrong, recorded so it is not re-proposed

Roughly half of what arrived did not survive a grep.

| Asserted | Checked |
| :--- | :--- |
| "DriftView still references a UMAP Projection across 5,000 verified runs" | `grep -rn UMAP` across the dashboard returns **nothing**. `DriftView.tsx:169` already reads "no projection: the API exposes distances, not coordinates" |
| UMAP at `PublicExperience.tsx:120` and `1580` | Line 120 is the drift feature list, already correctly describing window-vs-baseline centroid shift and ASI. Line 1580 is `</span>` |
| "OTel-Native Span Tree" | That string does not exist anywhere |
| Fixes at `ConnectModal.tsx:76`, `CommandPalette.tsx:274` | The real lines are 72 and 158; those numbers hold unrelated code |
| "Lease Poisoning (No DLQ)" | `STATUS_DEAD_LETTER`, `DEFAULT_MAX_ATTEMPTS = 3` and `available_at` backoff all exist. The "industry standard" column described what the code already did |
| "Unredacted Sensitive Ingestion — SOC 2, HIPAA, PCI-DSS violation" | `privacy.py` compiles redaction patterns and applies them before transport, and capture defaults to false |
| "Manual UI regression checks" | 237 automated tests |
| "SQLite writer locks at ~2,000 writes/sec" | Never measured on this system |

The third audit went further and described UI panels it claimed to have already
implemented, advertising `BufferConfig`, `ScrubbingPolicy`,
`.github/workflows/agent_regression_gate.yml`, DuckDB ingestion and INT8 ONNX.
**None of those exist in this codebase**, and `.github/workflows` is not a
directory here. Implementing that page would have put API signatures on the site
that a developer would import and fail on — the exact defect 20.1 had just
finished removing, and worse, because a wrong install command wastes a minute
while a fabricated API wastes an afternoon.

### 20.4 The pattern, which is the point

Each audit contained something real and worth acting on. The 512-token limit is
a genuine blind spot that was documented nowhere, and it would not have been
found by reading this project's own notes.

Each also contained confident, specific, plausible statements — file paths, line
numbers, percentages — that were false. Confidence and specificity carried no
information about correctness.

The cost of checking is about two minutes per claim. The cost of not checking
was, in the third case, a landing page advertising an SDK that does not exist.

That is the failure mode this project was built to detect, arriving from
outside, about itself.

### 20.5 Standing facts

Closed since 19.10:

- ~~Grounding misreads rounded numbers, undocumented in the UI~~ — the judge
  comparison including our lower F1 is now in the hero panel.

Unchanged and still true, plus:

- **The 512-token window is a model property, not a setting.** Raising
  `MAX_NLI_TOKENS` would not give DeBERTa-v3-small a longer memory. Sliding-window
  evaluation remains unimplemented and would need re-measuring the calibration
  reports before it could ship.
- **`.github/workflows` does not exist.** There is no CI; the 269 tests run
  locally. A gate that blocks PRs on contradiction rate is a reasonable idea and
  has simply not been built.
- **`pip install agentpulse` still fetches an unrelated package.** The site and
  README now say so rather than hiding it.

---

## 21. The AI Studio frontend, and the credential it was inventing (2026-09-17)

PRs #24, #25, #27 and #28. A separate repository, `Soum-Code/frontend`, had been taking
frontend work through AI Studio -- 46 files and ~11k lines of it. Bringing that
in turned into two jobs: keeping the components while dropping what they
fabricated, and then building the feature one of them had been pretending to
have.

### 21.1 It was a UI-only fork that had lost the data layer

The thing that decided the merge strategy, found by diffing the two trees:

| | `agentpulse/dashboard` | `Soum-Code/frontend` |
| :--- | :--- | :--- |
| Backend wiring | `api.ts`, `adapters.ts`, `useTelemetry.ts` | **absent** |
| Data | live, polled | `mockTelemetry.ts` |
| Tests | 32 | 0 |
| New components | — | 19 |

So this was never a merge of equals. The incoming repository had more UI and no
connection to a backend, which is why everything in it looked populated.

**`App.tsx` was restored from main rather than merged.** The incoming one seeded
state from `INITIAL_*` mocks and, every twelve seconds, pushed a freshly
invented trace into the list:

```js
durationMs: 450,
measured: `Latency: 450ms. Evaluator score: ${isAnomalous ? '0.78' : '0.99'}`
```

Mixed into real telemetry those are worse than pure mock data, because nothing
distinguishes them. The public landing page still gets every new component --
`PublicExperience` renders them -- while the console keeps polling.

### 21.2 Two panels were presenting generated numbers as measurements

**`LiveEvaluatorSandbox`** read *"Live Evaluator Sandbox: Test Without
Installing"* and *"Watch our dual-stage NLI evaluator classify"*. Underneath:
keyword matching in the browser, `latency: Math.floor(45 + Math.random() * 25)`,
and the result labelled `stage2_deberta`. No `fetch`, no `/v1/` call anywhere in
the file.

**`LiveTailStream`** read *"Real-Time Span Ingestion Feed"* and *"Datadog APM
Live Tail Equivalent"* while generating every row, contradiction scores
included, with `Math.random()`.

Both are kept -- an interactive explainer and a feed animation are genuinely
useful -- and both now say what they are. The generated latency is gone entirely
rather than replaced: a number produced in the browser sitting beside a
real-looking verdict is the exact confusion this project exists to surface.

Also removed on the way in: two UMAP projections (the API exposes distances,
never coordinates), `OTel v1.32 Ingress`, an "OpenTelemetry trace filtering"
claim, and a `framework: 'LlamaIndex'` label.

Worth noting against Section 20: the audit that claimed UMAP was live in this
repository was **right about the other one**. It does exist there, twice. The
refutation in 20.3 was correct for the repository it checked, and the repository
was never confirmed.

### 21.3 The typecheck found the real disagreement

`types.ts` declared the fields the backend does not produce as **required** --
`version`, `model`, `framework`, `tools`, `costPerHour`, `sessionId`, `cost`,
`tags`, `rootCause`, `affectedRunsCount`, `suggestedAction`,
`clusterDivergence`, `parameterDrift`, and the experiment scoreboard.

Against mock data that fills every field, required is reasonable. Against a real
adapter it is the compiler **demanding the invention**: `adapters.ts` leaves
those undefined deliberately, on the rule that a value the backend never
measured is indistinguishable from one it did.

The build failed on the honesty rather than on the fabrication. They are
optional now, which is the truthful shape.

### 21.4 The console was minting credentials that could not work

```js
const keyHash = Math.random().toString(36).substring(2, 10);
const apiKey = `ap_live_${randomSlug}_${keyHash}`;
```

Stored in Firestore, displayed with a copy button, and rejected with 401 the
moment anybody used it -- the backend recognised exactly one credential, a
string from `AGENTPULSE_API_KEY` compared with `==`. Nothing could be revoked,
nothing attributed, and granting one caller access meant handing over everybody's
secret.

`POST /v1/keys`, `GET /v1/keys?owner_id=`, `DELETE /v1/keys/{id}` now exist.

- **Only a hash is stored.** The plaintext is returned once and never written
  down. SHA-256 rather than a password KDF: these are 32 bytes of
  `secrets.token_urlsafe`, so there is nothing to brute force and bcrypt would
  only add latency to a check that runs on every request.
- **An indexed `key_prefix`** carries the non-secret half, so verification reads
  one row instead of scanning.
- **`hmac.compare_digest`**, not `==`. The hashes are not secret, but a
  short-circuiting compare leaks how much of a guess was right.
- **The environment key keeps working.** The deployment authenticates with it. A
  key not shaped like ours is rejected before any query runs, so existing traffic
  costs nothing.
- **Revocation writes a timestamp** rather than deleting, so a revoked key stays
  auditable. Revoke and list are owner-scoped, or an authenticated caller could
  revoke by guessing an id.

Firebase handles identity and the backend is not asked to. `owner_id` is a
free-form string holding a Firebase uid today; changing identity provider later
touches nothing on the server.

Verified on the live deployment, not only in tests:

```
env key            200     (deployment unbroken)
created            ap_live_36aca468aa4a_vDoQ5…
new key            200     (it actually authenticates)
revoke             200
after revoke       401
```

### 21.5 Two test problems worth remembering

Neither was visible from the test that failed.

**The fixture mutated a module-level singleton.** Assigning `settings.api_key`
and `settings.local_dev_mode` without restoring them broke **twelve unrelated
tests**, each of which passed in isolation. `monkeypatch.setattr` restores;
assignment does not.

**`app.database` builds its engine at import time.** A fixture cannot redirect
the database from inside a test -- by the time any test runs the engine is
already bound. The first version pointed at a `tmp_path` database and kept
writing to the default one regardless, silently. These tests now share the
suite's database, as every other test here does, and mint unique owner ids.

### 21.6 The deployment does not use Alembic

Found while deciding how to apply the migration, and important enough to write
down: **the VM's database has no `alembic_version` table at all.** Its schema was
built entirely by `SQLModel.metadata.create_all` in `init_db()`, which runs on
every startup.

So `alembic upgrade head` was not run, and must not be -- it would try every
migration from the beginning against a database that already has the tables.
`create_all` added `api_keys` by itself on restart, 12 tables to 13.

**This works only for new tables.** `create_all` does not add a column, rename
one, or change a type. The first migration that does any of those will need
applying by hand, and the version table reconciling first. That is now two
unrelated Alembic hazards standing at once -- this one, and the local
`alembic_version` that reads `8d86fee0d663` while the schema is further ahead.

### 21.7 The console went black on real data

PR #27. Opening the workspace after the merge showed nothing at all. One line:

```tsx
{agent.driftStatus.toUpperCase()}
```

`driftStatus` is undefined until an agent has 32 evaluated spans, because the
adapter leaves it absent rather than guessing `'normal'` (see 4.4 and the rule in
21.3). `OverviewView` was written against mock telemetry where the field is
always set, so the first real agent threw and React unmounted the tree.

The same collision sat in five more places, each reachable by clicking
something: agent search read `framework` and `model`, the agent detail printed
`version` and `costPerHour.toFixed()` and mapped over `tools`, a trace card
called `toFixed` on `cost` and `toLocaleString` on `totalTokens`, and trace
search read `tags`. None of those fields has a source in the span schema.

**Guarding alone would have been the wrong fix.** A careless default turns
`$undefined/hr` into `$0.00/hr`, and an empty tools array reads as "this agent
calls no tools" -- both claim a measurement that was never taken. The absent ones
render an em dash, and the tool roster says what it is: tool names are attached
to spans, not to agents.

Worth noting how it was found. The bug was invisible from the outside -- the
landing page rendered perfectly, and only the console crashed. It took loading
the deployed site in a browser and reading the console error, which is the check
that had been skipped when the merge was verified by grepping the bundle.

### 21.8 An entire architecture section that was never built

PR #28, and the more instructive half of it.

The previous merge brought in a section titled "Enterprise Pipeline
Specification" and shipped it live. It described the system as:

| Claimed | Actual |
| :--- | :--- |
| DuckDB WAL / Redpanda | SQLite |
| ClickHouse / Parquet | SQLite |
| FastAPI / Envoy | FastAPI |
| INT8-quantized ONNX | not quantized |
| Python / TS SDK | Python only |
| Sliding 256-token windows, 32k+ contexts | 512-token hard limit, documented in 20.2 |
| GitHub Action PR gate | `.github/workflows` does not exist |
| "Auto-redacts credit cards" | emails, phones, SSNs, secrets -- no card pattern |
| Baseline cluster of "5,000 runs" | a schematic |

This is the third audit's proposal from 20.3 -- the one whose contents were
checked and found not to exist -- rendered as though it had shipped.

**The failure was in the checking, not the merging.** The incoming code was
verified by grepping for a list of known-bad strings: `UMAP`, `OTel`,
`pip install agentpulse`, `LlamaIndex`. Those were found and removed. A list of
known-bad strings cannot find a new section that invents different ones, and
nothing in that method would ever have surfaced "DuckDB".

The diagram now describes the three processes that exist, which is worth showing
on its own: an SDK that cannot block the agent, an API that queues and evaluates
nothing, a durable SQLite queue with a 120-second lease, two small CPU models
with their 512-token window stated, and single-node storage said plainly rather
than described as a cluster.

The settings panel got the same treatment: it now says dataset curation exists
and the CI gate does not.

### 21.9 The chalk UI, and how it was taken

The second push from `Soum-Code/frontend` -- a chalk-tactile annotation layer,
surface picker, pointer-proximity dust motes and the audio behind them.

Applied as the **incoming diff** rather than a wholesale copy, which the first
merge was. That mattered immediately: `types.ts` arrived with its required
fields again, and a wholesale copy would have reintroduced the crash from 21.7
within minutes of fixing it. The crash guards and claim corrections already in
the repository survived because they were never overwritten.

`git apply --exclude` matches the path *before* `--directory` is applied, which
is not obvious and silently applied nothing the first two attempts -- the patch
is atomic, so one excluded-but-still-matched file rejects the whole thing.

### 21.10 Standing facts

New:

- **The bundle is 2,333 kB**, up from 1,096 kB before this session -- `animejs`,
  `recharts`, and Firebase, which is only pulled in now that the auth modals
  render. Large for a landing page; code-splitting is untouched.
- **Firebase's web config ships in the bundle.** That is by design, since it
  identifies the project rather than authorising anything. What protects the data
  is `firestore.rules`.
- **`Soum-Code/frontend` has a rules gap.** `projects` is owner-scoped but its
  `spans` subcollection is `allow read, write: if request.auth != null`, and the
  code calls `signInAnonymously`. Any anonymous user could read or write every
  project's spans. Nothing writes there yet, so nothing is exposed today.
- **Two repositories now hold a frontend.** `agentpulse/dashboard` is the
  deployed one; `Soum-Code/frontend` is where AI Studio writes. Nothing keeps
  them in step, and both merges were manual. Three times now, incoming code has
  described capabilities that do not exist; expect a fourth.
- **Take the incoming diff, never a wholesale copy.** A copy silently reverts
  every correction already made here -- `types.ts` alone would reintroduce a
  console crash. Note that `git apply --exclude` matches the path before
  `--directory`, and the patch is atomic, so a mis-specified exclude applies
  nothing at all.
- **Grep the bundle *and* load the page.** Grepping for known-bad strings missed
  an entire fabricated section, and only opening the deployed console in a
  browser found the crash. Neither check substitutes for the other.
- **`favicon.ico` returns 404.** Harmless, and newly visible because the SPA
  catch-all was fixed to stop answering 200 for missing files.

Still true from 20.5, and now partly addressed: `pip install agentpulse` still
fetches an unrelated package, and dashboard tests still cover `lib/` only --
none of the 19 new components has a test.

---

## 22. The fourth round arrived, and two views were inventing their own numbers (2026-09-17)

Started as "add a favicon". Six merged PRs later (#30 through #35) the typecheck
is clean for the first time, two components have stopped fabricating
measurements, and the prediction at the end of 21.10 turned out to be correct.

Ended at `1f752de` on main, `d4247d3` deployed. Backend 260 passed, dashboard 32
passed, `tsc --noEmit` clean, site 200.

### 22.1 The favicon, and the one trap in writing one

`/favicon.ico` had been 404 on every cold load, because browsers request it by
name whether or not the HTML links it.

The mark is the pulse trace from `ProductHeader`'s live status dot, emerald
`#34d399` on `#050505`. Three files in `dashboard/public/`: an SVG for current
browsers, a 16/32/48 `.ico`, and a 180px PNG for iOS.

There is no SVG rasteriser in this environment, so `scripts/generate_favicon.py`
holds a hand port of the SVG's path rather than a render of it. Nothing about
editing one forces the other to change, so `tests/test_favicon.py` compares
them. It was checked against two mutations -- a changed `stroke-width` and a
moved coordinate -- and caught both.

**Pillow silently drops any requested `.ico` size larger than the image `save()`
is called on.** The first version of the script asked for 16, 32 and 48, called
`save()` on the 16px layer, and wrote a single-size icon with no warning. The
test asserts all three sizes for that reason.

### 22.2 The fourth round of fabricated claims was already live

21.10 said "three times now, incoming code has described capabilities that do
not exist; expect a fourth." The fourth was found within the hour, and it had
been serving on the public site the whole time.

The landing page's SDK section had five framework tabs. Three did not work:

| tab | what was wrong |
| :--- | :--- |
| CrewAI | imports from `agentpulse.adapters`, which is not a module -- it is `agentpulse.integrations` -- and `CrewAIAdapter.__init__` raises `NotImplementedError`, so the snippet dies on its second line |
| Enterprise Bounded Buffer + PII | `BufferConfig`, `ScrubbingPolicy`, `max_buffer_size_mb`, `mask_credit_cards` appear in **no Python file in the repository** |
| CI/CD GitHub Action | there is no `.github` directory, and no published `agentpulse/eval-action` |

The prose directly above those tabs already read "A CrewAI adapter does not
exist yet" -- above a tab rendering working-looking CrewAI code. Only `python`
and `langgraph` remain; both were checked against the SDK.

Found by reading the file while looking for something else, not by any check
that was running. Worth noting how little it took: opening
`PublicExperience.tsx` and reading the snippet strings.

### 22.3 A broken editable install had been hiding two test files

`import agentpulse` failed from anywhere. The venv's editable installs pointed
at `C:\MLOPs\3rd sem project\project one agent\sdk`, a path from before the
project was renamed, which no longer exists.

The consequence is the part to remember: `test_e2e_langgraph.py` and
`test_integrations.py` **stopped collecting without failing the run**. Pytest
reported a green pass count that silently excluded them. Every test figure
quoted in the deck and the handoff since the rename has been over a reduced
suite.

Reinstalled both editable against the real checkout. Collection went 253 -> 260.

Also observed: `test_worker_module_starts_and_loads_models` failed once under
full-suite memory pressure and passed in isolation, then passed in every
subsequent full run. Not chased further, and not claimed to be diagnosed.

### 22.4 The Telemetry Lab announced success it never had

The inject button did nothing, and reported that it had worked.

`TelemetryLabView` declared its prop `(trace: Trace) => void` and called it with
a whole `Trace` object. The handler in `App.tsx` was
`(scenario: string, query?: string)` and forwarded the first argument to
`api.simulatePipeline`. The API answered 422, `"Input should be a valid
string"`. `App.tsx` caught that into `console.warn`. The panel then rendered
"Injected Trace tr-48213 into live stream".

The fabricated Trace is the worse half. It carried a grounding score chosen by a
switch statement -- `0.96`, `0.38`, `0.74`, `0.88` -- an evaluator named "Schema
Groundedness" that does not exist, `Math.random()` for cost, tokens and
duration, and a 1.2 second `setTimeout` so it looked like work. This project's
own rule, inverted: a value nothing measured, displayed as though something had.

Its four failure modes did not exist either. `schema_drift`,
`low_confidence_ocr` and `tool_timeout` are not scenarios; `ingest.py` accepts
`clean`, `hallucination`, `tool_mismatch`, `drift`. The "Target Agent Swarm"
select had no effect at all -- the simulator's five agent ids are fixed.

Rewritten so the server runs the scenario and the evaluator produces the scores.
`handleRunScenario` deliberately does not catch: it runs because someone pressed
a button, so a refusal has to reach them.

**`tsc` did not catch the type mismatch, and the reason matters.**
`dashboard/tsconfig.json` has no `strict` flag at all, so it defaults to false:
`strictFunctionTypes`, `strictNullChecks` and `noImplicitAny` are all off.
Passing a `(scenario: string, query?: string)` handler where a
`(trace: Trace) => void` prop is expected is an error under
`strictFunctionTypes` and silent without it.

### 22.5 A passing build hid a view that could never render

The APM tab was reachable from the dock, the command palette and an Overview
card. It set the header to "Performance Metrics (APM)" and rendered nothing:
`App.tsx` had no `'performance'` branch and `PerformanceView` was imported
nowhere.

It could not have been wired up. 1,110 lines of per-endpoint APM importing
`../../data/mockPerformanceMetrics`, a module never committed -- there is no
`src/data` directory at all. That was the **single error** `tsc --noEmit`
reported, and `vite build` does not typecheck, which is why a passing build hid
a view that could never have worked.

Nor could it be wired to real data:

```python
COUNTERS.record_api_request(duration_ms=..., status_code=...)   # no path
```

`RequestMetricsMiddleware` records a duration and a status code and **does not
record the path**, so no per-route figure exists anywhere in the system. Wiring
the old view up meant shipping the mock.

`/v1/platform` was already serving real numbers -- API latency percentiles,
ingestion counters, queue-wait and evaluation timings, queue depth by status,
reliability, worker roster. Rebuilt on those at about a seventh of the size.
Missing values render as an em-dash. The footer repeats the backend's own
warning that the counters are in-process and reset on restart, because a request
total that silently restarted at zero would read as an outage.

### 22.6 Google sign-in, and where the fault actually was

Not in this repository. The Firebase project's authorized-domains list held only
the `firebaseapp.com` and `web.app` defaults plus four AI Studio `run.app`
origins. The deployed hostname was not on it, so Firebase refused the OAuth
popup with `auth/unauthorized-domain` -- **before the window opens**, which is
why the button looked like it did nothing.

Diagnosed without touching an account, by reading the project's own config:

```
GET https://identitytoolkit.googleapis.com/v1/projects?key=<web api key>
```

The modal did surface errors, but only `popup-blocked` and
`popup-closed-by-user` had written messages; everything else fell through to
`err.message`, so a project misconfiguration reached the visitor as a raw SDK
sentence about a console they may not be able to open. `authErrorMessage()` now
names the failures that retrying will never fix, and for `unauthorized-domain`
puts the current hostname in the message so the domain to add is right there.

The user added the domain. Verified three ways: the config now lists it;
replicating the SDK's own hostname check from the live page returns
`allowed: true`; and clicking the button produces `auth/popup-blocked`, **not**
`auth/unauthorized-domain` -- Firebase got as far as attempting the popup, which
it would not have done if the domain were still refused.

`localhost` is still absent, which Firebase normally adds by default. Only
matters for local `npm run dev` sign-in.

### 22.7 Nothing in this project calls an LLM

Asked directly -- which multi-agent pipeline produces the demo results -- and
the honest answer is worth recording plainly, because it will be asked again:

- `POST /v1/simulate` writes five spans whose outputs are **string literals** in
  `backend/app/routers/ingest.py`. The scenario flag picks between two versions.
- `demo/research_assistant.py` is a five-node LangGraph pipeline with no
  `openai` or `anthropic` import anywhere in it.
- `instrument_llm()` is tested against stub clients; the SDKs are not test
  dependencies.

Everything downstream of the text is real: MiniLM and DeBERTa run on CPU on
whatever strings they are handed, the queue leases and retries, the alert rules
fire off measured scores, the drift maths runs on real embeddings, and the F1
0.963 benchmark is real inference over a real held-out split.

The framing that holds up: **the agent outputs are fixtures, the judgement is
real.** AgentPulse is the observability layer, not the agent.

### 22.8 The deck, and a demo script written by running it

The architecture slide was ASCII art in a monospace box; it is now drawn with
shapes. A new slide walks one real call end to end -- Paris in, Berlin out, the
premise/hypothesis pair, 0.9999, two alerts.

Corrections made while there:

- "Nine views" was wrong and omitted `settings`. Ten render.
- Test count 237 -> 260.
- An open question about the Windows crash-recovery flake was **already answered
  in 19.6** of this very document. The deck was asking something its own
  documentation had settled.
- Later, "typecheck: 1 error, in dead code" -> clean, once 22.5 landed.

`table()` gained `rowH`. Without it the file carries no row height and PowerPoint
sizes rows itself, so a table's extent is unknown until someone opens it.

**Rendering the slides to images caught what reading the code did not:** arrow
labels printing on top of the boxes. `python-pptx` plus PIL is enough.

`DEMO.md` is eight to ten minutes, and was written by running it -- the
`tool_mismatch` scenario fired against the deployed instance and
`TOOL_CLAIM_MISMATCH` appeared 25 seconds later with `mismatch_rate=1.0`. That
rehearsal is what exposed 22.4.

### 22.9 The stale worktree, and what was inside it

`.claude/worktrees/check-f88a0c` was 76 commits behind main and held uncommitted
work from 2026-08-29: a trace-workspace UI, roughly 70 kB across
`views/TraceWorkspace.tsx`, seven files in `components/trace/`, `lib/trace.ts`,
and modified `App.tsx` and `index.css`.

It was also serving a dev server. `preview_start` resolved `launch.json` from
the session's original launch directory rather than the entered worktree, so the
"dashboard" under test was that stale checkout -- Vite 5.4.21, title "AgentPulse
Dashboard", no `dashboard/public` at all. A favicon check ran against the wrong
build and reported 404s that meant nothing.

Asked to delete it. Committed and pushed the work first, as
`claude/check-f88a0c` at `b8531b8`, because it existed on no branch and nowhere
else. **Check what a worktree holds before removing it** -- `git worktree
remove` would have taken it with no warning.

### 22.10 Rehearsing the demo found the fifth round, one day later

The standing facts in 22.11 end by saying to expect a fifth. Asked to rehearse
the demo and show it, and it was on the screen before the rehearsal had started.

The rehearsal itself works, and is worth stating because it is the thing to
repeat before presenting: Telemetry Lab → Tool-claim mismatch → Run scenario
returns `5 spans accepted`, and `TOOL_CLAIM_MISMATCH` with `mismatch_rate=1.0`
appears in Incidents about 30 seconds later, with a diagnosis panel carrying the
trace id and a Jump to Trace Waterfall control. Thirty seconds is long enough to
need filling; the numbers section of DEMO.md covers it.

**The hero card was the fifth round.** `AnimeAgentSwarmRadar` takes two props,
`palette` and `onInspectTraces`. It has no data source whatsoever, and it was
badged `LIVE INGESTION`.

Technologies named that this project does not use:

| claimed | actual |
| :--- | :--- |
| `OTEL RING BUFFER` | no OpenTelemetry anywhere; two docstrings mention the conventions, nothing imports it |
| `gRPC · v2` | aiohttp over HTTP; `grpc` appears nowhere in `sdk` or `backend` |
| `Zero-Copy Ring Buffer (128MB)` | a `list[SpanPayload]` that calls `self._buffer.copy()` to batch, capped at 10,000 **spans**, dropping oldest |
| `stream.agentpulse.internal` | no such host |

Numbers with nothing behind them, two of which contradicted the deck outright:

| shown | measured |
| :--- | :--- |
| `54.2 ms` | 215.9 ms |
| `99.98%` | F1 0.963 |
| `14,280 spans/s` | no measured throughput exists |
| `16 Swarms Active` | hardcoded -- the same defect as the "4 active swarms" fixed in `AgentsView` during 19.x |

Replaced with what is true, and the badge now reads `ILLUSTRATION`.

**A smaller one, worth recording because it is the opposite mistake.** The hero
read `< 4.2ms Ingestion`. `experiments/results/latency_profiles.json` measured
`8_http_ingestion_overhead` at mean 0.981 ms, p99 1.124. So 4.2 was not false --
1.124 is under 4.2 -- but it came from nowhere and understated the result about
fourfold. The page also disagreed with itself: two places further down already
read "Sub-1.2ms Fanout". Somebody had the right number and the hero kept an
older one. Now `< 1.2ms`.

**What found it is the part to carry forward.** Not a grep, not the typecheck,
not 260 tests, not a bundle scan -- all of those were green while this was
serving. It was found by opening the page in order to do something else with it.
The two prior rounds were found the same way: 21.7 by loading the console, 22.4
by rehearsing a demo step.

### 22.11 Standing facts

New:

- **Five times now, shipped code has described capabilities that do not exist.**
  21.10 predicted the fourth and it was already live; this list predicted the
  fifth and 22.10 found it the next day, in the hero card. Expect a sixth, and
  assume it is serving right now.
- **A component with no data props must not say LIVE.** The radar card had two
  props, neither of them data, and a pulsing `LIVE INGESTION` badge. If a panel
  is drawn rather than measured, label it `ILLUSTRATION` and let the console
  carry the real figures.
- **Opening the page is the check that keeps working.** Every round so far was
  found by using the product, never by a grep, a typecheck, a test run or a
  bundle scan -- all of which were green while the claims were serving. Build a
  habit of clicking through the deployed site, not only diffing it.
- **`vite build` does not typecheck.** A green build says nothing about whether
  a view can render. Run `npm run lint` separately; it is the only thing that
  found a 1,110-line file that never compiled.
- **A component that invents its own numbers is the failure mode to look for.**
  Two were found in one session -- `TelemetryLabView`'s grounding scores and
  `PerformanceView`'s per-endpoint APM -- and both looked like working features.
- **Test counts can be quietly wrong.** A stale editable install removed two
  files from collection without failing anything. Check `--collect-only` totals
  against the number you expect before quoting one.
- **Verify a fix by making it fail.** The Lab was confirmed by running it
  normally *and* by patching `fetch` to return 500 and watching the error reach
  the UI. The success path alone would not have shown that the old code
  swallowed refusals.
- **The dashboard has 33 components and 32 tests, all on `adapters.ts` and
  `api.ts`.** No component has one. Corrects "19 new components" in 21.10, which
  was a remembered figure; counting the files gave 33.
- **The product fabricates too, not just the landing page.** 23 records two more
  rounds found inside the console. Do not treat "the marketing page" as the only
  place to look.
- **"Typecheck clean" means less than it sounds.** `dashboard/tsconfig.json`
  sets no `strict` flag, so `strictNullChecks`, `noImplicitAny` and
  `strictFunctionTypes` are all off. That last one is why the Lab's
  `Trace`-for-`string` mismatch compiled. The deck now cites a clean typecheck
  as evidence; it is evidence of less than a reader would assume, and turning
  `strict` on is unexamined work with an unknown error count behind it.
- **`favicon.ico` now returns 200**, superseding the 21.10 entry.

Left deliberately unfixed, both in `dashboard/src/index.css`, both confirmed
with the user: the `max-height` transition at the line-clamp expansion (the real
fix is structural, not CSS) and `.chalk-canvas-grid`, which is the Chalk theme's
graph-paper surface. Ignores are persisted in `.impeccable/config.json`.

---

## 23. Two more rounds, inside the product this time, and the first real models (2026-09-17/18)

22 closed on "expect a sixth, and assume it is serving right now." Starting the
stack to show a demo produced the sixth and seventh within minutes, and both
were in the console rather than on the landing page.

### 23.1 The overview was printing NaN

Not a claim this time, a defect, visible on the first screen anyone opens.

```ts
agents.reduce((acc, a) => acc + a.latencyAvgMs, 0) / agents.length
```

`latencyAvgMs` is optional -- `adapters.ts` leaves it undefined when the backend
reported none, which is that file's stated rule. One such agent makes the whole
average `NaN`.

This is 22.11's "strict is off" entry arriving in practice: `acc + (number |
undefined)` compiles silently without `strictNullChecks`. It now averages the
agents that reported a latency and shows an em-dash when none did.

The `p95 1,840ms` and `p99 2,840ms` printed under it were not measured either.
`/v1/agents` returns a mean per agent and no percentiles at all.

### 23.2 "Datadog APM Golden Signals"

A spotlight bar on the overview, over `1,245 rps`, `p95 1,120ms`, `Apdex 0.94`
and "error rates (1.42%) across 8 critical gateways".

Datadog is not used here, and none of those was measured -- the same root cause
as 22.5, that `RequestMetricsMiddleware` records a duration and a status code
and **not a path**, so no per-endpoint or per-gateway number exists anywhere.

`SystemStatusBanner.tsx` went with it. Its only consumer was the `PerformanceView`
deleted in #34, so it had been orphaned since, still carrying its own "critical
gateways" line. `ApiEndpointMetrics` went too: 53 lines of per-endpoint latency,
apdex, status-code and sparkline fields that nothing can populate. **Deleting the
type is the part that matters** -- while it exists, the next view gets written
against it.

### 23.3 Grepping the deployed bundle afterwards found three more

Worth recording as method. After #43 merged and deployed, grepping the live
bundle still returned `Datadog` twice and `MLflow Grade` once:

| where | what |
| :--- | :--- |
| `EnterpriseArchDiagram` | badge "Datadog & MLflow Grade" beside the title "Enterprise Pipeline Specification" |
| `ExperimentsView` | "MLflow Matrix + CI/CD Gate" |
| `CommandPalette` | "Datadog-style API response times, error rates & throughput" |

Two are repeat offenders. **"Enterprise Pipeline Specification" is the name of
the fabricated section from 21.8** -- its contents were corrected then and the
heading around them was not. "CI/CD Gate" is the GitHub Action removed in #30,
in a repository with no `.github` directory.

MLflow does exist in the repo, at `experiments/mlflow_capability_audit.py`. That
is a competitor audit, per 13, not a dependency.

### 23.4 A pipeline where every agent runs a different model

The limits slide says "No model in the loop yet". `demo/multi_model_pipeline.py`
is the answer to it: five agents, five different model families, one trace.

Most of it already existed and had simply never been given a model.
`demo/workflows/research_assistant.py` is a real LangGraph pipeline wired to
`LangGraphAdapter`; `llm_adapters/` holds Qwen, Llama, Mistral and Gemma
adapters; `reasoning/` holds Direct, CoT and AoT. `transformers`, `llama_cpp`,
`torch` and `langgraph` are all installed. What was missing was weights --
`models/` holds only the two evaluator models, and the Qwen GGUF was deleted
earlier.

**`instrument_llm` already covers any OpenAI-compatible gateway**, which is the
useful discovery. `detect_provider` reads `type(client).__module__.split(".")[0]`
rather than using `isinstance`, so an `openai.OpenAI` pointed at any `base_url`
is detected as `openai` and wrapped. No adapter needed for OpenRouter, OmniRoute,
Groq or anything else that speaks the same shape.

Design notes that matter for the signals:

- the retriever's span carries the **real** `local_retriever` result next to the
  model's prose about it, so a tool-claim mismatch is the model miscounting
  rather than a planted number
- `input_summary` for the reasoning agents is the retrieved evidence, not the
  prompt template, because that is the pair `evaluate_grounding` compares
- verifier and analyst answer the same question on **different families**. Two
  prompts against one model agree with themselves, which flatters the
  disagreement signal
- the corpus is generic, so retrieval for a specific query returns loosely
  related documents and the analyst has to reach. That is the point: a real
  model overreaching on weak evidence is a real grounding failure

Not yet run end to end -- see 23.5.

### 23.5 OmniRoute does not give you 1.5 billion tokens

Asked to look at it as the model source. The headline is real in the sense that
its own `FREE_TIERS.md` documents ~1.51B free tokens/month across 42 pools. What
the headline does not say is that **you supply every credential**. From its own
setup guide:

> "For a `NOAUTH` provider, no credential is required. OAuth and API-key
> providers must be connected through their documented account flow."

So the 1.51B is the sum of free tiers you would get by signing up at ~42
providers yourself. Over two thirds of it is Mistral alone (~1B), throttled to
2 requests per minute -- which for a five-call pipeline is about 2.5 minutes of
rate limiting per run.

It does list ~25 **keyless** providers needing no signup at all (`nvidia`,
`liquid`, `pollinations`, `nous-research`, `reka`, `qwen-web` and others), and
its own table marks every one of them `—` for tokens/month, "not
token-quantifiable". That dash turns out to be the tell -- see below.

**Three defaults were changed before running it**, on its own warning that it
"is reachable by ANY device that can route to this host, and requests are billed
to your configured providers":

```
OMNIROUTE_SERVER_HOST=127.0.0.1     was 0.0.0.0
REQUIRE_API_KEY=true                was off
INITIAL_PASSWORD=<32-char random>   was the literal CHANGEME
```

Confirmed after restart: bound to `127.0.0.1` only, `/v1/models` returns 401
without a key.

`REQUIRE_API_KEY=true` creates a bootstrap problem worth knowing about: minting
an inference key through `omniroute api api-keys post-api-keys` needs an
inference key. `omniroute tokens create` makes a **CLI** token, which is a
different thing and 401s on `/v1`. The dashboard is the only bootstrap path, and
it needs the password from `~/.omniroute/.env`.

A key was minted from the dashboard, which unblocked it. `/v1/models` then
returned **480 models across 16 provider prefixes**, with no credentialed
provider connected -- so all of them keyless.

**None of them serve.** Nine were tried, one per provider, with a one-word
prompt:

| model | result |
| :--- | :--- |
| `cfp/zai-org/glm-5.2` | 502 Cloudflare Playground browser session failed |
| `ddgw/gpt-5.4-mini` | 418 DuckDuckGo AI Chat anti-abuse challenge failed |
| `zc/glm-5.3` | 502 `spawn zcode ENOENT` -- wants a local binary |
| `oc/big-pickle` | 403 "OpenCode's free tier can only be used fr…" |
| `auto/best-coding` | 402 "This model requires an opencode API key" |
| `felo/felo-chat` | 400 thread creation failed |
| `pepper/pepper-1` | 502 Amelia init failed |
| `unc/Hermes-3-…` | 404 model not available |
| `aihorde/2DN` | image model; the 165 aihorde entries are mostly image |

Read the first two again. **These are not APIs, they are scrapers** -- driving
browser sessions against Cloudflare's playground and DuckDuckGo's chat UI, and
both were stopped by anti-abuse measures those services put there deliberately.
That is a reason to avoid the keyless tier beyond its not working: results in a
thesis have to survive the question of where the data came from.

So the answer is the second branch. Providers need signups either way, and
OpenRouter's single signup for 25 free models across 13 families is the shorter
path. Switching is a `base_url` change.

OmniRoute itself is not the problem and is worth keeping in mind: as a router
over provider accounts you own, it is well built. Point it at Mistral, Gemini
and Groq with your own keys and it does what it says. The free-token headline
just describes a tier that does not function.

### 23.6 Standing facts

New:

- **Fabrication is not confined to the landing page.** 23.1 through 23.3 were
  all inside the product console. Rounds six and seven.
- **Grep the deployed bundle after every removal, not just before.** #44 exists
  only because the bundle was grepped again after #43 shipped, and three more
  strings were still in it.
- **A deleted mock leaves a type behind, and the type is the hazard.**
  `ApiEndpointMetrics` outlived the module that populated it and kept an
  orphaned component compiling against it.
- **`instrument_llm` works with any OpenAI-compatible base_url.** Provider
  detection is by module root, not `isinstance`. Gateways are a `base_url`
  change, not an integration.
- **A free-token headline is usually an aggregate of your own signups.** Check
  who supplies the credential before counting the tokens.
- **A model in a catalogue is not a model that answers.** OmniRoute listed 480
  keyless models; nine were tried, one per provider, and nine failed. Send one
  real request before building on a catalogue, and before quoting its size.
- **"Keyless" can mean scraped.** Two of those nine drive browser sessions
  against web chat UIs and were stopped by anti-abuse challenges. Free access
  that routes around a service's own protections is not usable for work that has
  to say where its data came from.
- **Change a third-party service's defaults before its first real start.**
  OmniRoute's own banner said it was listening on `0.0.0.0` with no API key and
  billing to your providers. Config written after the process starts does not
  apply to it.

---

## 24. The pipeline from 23.4 was run, and it had never worked (2026-09-18/19)

23.4 ended with "Not yet run end to end." Running it found five faults in one
file. Four of them made it deliver nothing; the fifth was a sentence in its own
docstring describing behaviour the code did not have.

The order matters, because each fault was only reachable after the one before
it was fixed, and the last two were unreachable without a real model.

### 24.1 It delivered nothing, and said it had

A stub client -- five canned strings, no network -- was enough to find this.
Zero POSTs reached the backend, zero traces, zero spans, while the script
printed five successful agent lines and `sent 1 trace(s)`.

Two faults, either one sufficient:

- **`pulse.start()` is never called.** `client._ensure_transport` auto-starts
  the transport only when an event loop is already running, and catches
  `RuntimeError` when there is none. The script was fully synchronous, so it
  took the quiet branch every time. `end_span` still enqueued; no flush task
  ever existed.
- **`pulse.shutdown()` is a coroutine, called without `await`.** It surfaced
  only as a `RuntimeWarning`. It would have been a no-op regardless, because
  `_started` was `False`.

The file's own comment says a missing drain "looks like the run silently did
nothing." It did exactly that, and the comment was written by someone who
understood the failure and still shipped it.

Fixed by adopting the lifecycle `demo/research_assistant.py` already used:
async `main`/`run_once`/`call`, `await pulse.start()`, `await pulse.shutdown()`
in a `finally`, and `asyncio.to_thread` around the blocking openai call so the
flush task runs between agents instead of holding every span until the end.

Verified with the stub: 1 trace, 5 spans, 5 jobs succeeded, and
`TOOL_CLAIM_MISMATCH` (HIGH) on the retriever, which claimed 5 documents where
`local_retriever` returned 3. **That is 18.4's signal firing on the ingest
path**, from a real tool result rather than a benchmark fixture.

### 24.2 Two faults only a real model could reach

The stub proved delivery and could not prove anything else, because fixtures
are ASCII and always well-formed.

- **`UnicodeEncodeError` on the first completion.** The model writes ordinary
  words like "Retrieval-augmented" with U+2011, and a Windows console is
  cp1252. The run died on the first agent. Only the console preview was ever
  affected -- spans go out as JSON over HTTP and always carried the original
  text -- so `errors="replace"` on stdout/stderr costs nothing that matters.
- **`except Exception: return 1` in `main`** reported that crash as a bare exit
  code: no message, no traceback, no failing agent named. The first real run
  looked like the script had simply stopped.

### 24.3 The `.env` the docstring promised

The usage note has always said the key can live "in a .env this script is run
with". Nothing in the import chain loaded one. The sentence was true only for a
caller who had already exported the variable, which is the case where the .env
is irrelevant.

Fifth fault, same shape as the first four and the same shape as 16.4, 21.8,
22.5 and 23.3: **the documentation described a capability the code did not
have.**

### 24.4 Disagreement reliably flags the agent that was right

> **Superseded in part by 24.9.** The separation below held when measured
> properly on 87 trials across five verifier families, so this section is not
> wrong. What 24.9 adds is the part this data could not reach: a *wrong* refusal
> scores 0.999, fractionally above a correct one, so within refusals the signal
> is blind to whether the verifier was right. Read 24.9 before quoting anything
> here.

**This section was rewritten on 2026-09-19 after the five-family run. The first
version claimed "a correct refusal scores as a hallucination" from one model
and two traces. Four traces on five model families do not support that as a
rule, and the corrected finding is narrower and more useful.** The original
claim is kept below as 24.4.1 because how it broke is the instructive part.

Four runs, five different model families, one variable: whether the retrieved
evidence actually answers the query. `verifier` is `nex-agi/nex-n2.5-pro` in
all four.

| run | query | verifier said | contradiction | grounding | disagreement | risk |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: |
| R1 | kubernetes pod autoscaling | **No** | 0.850 | 0.852 | 0.966 | 0.890 `high` |
| R2 | SQLite WAL concurrency | **Yes** | 0.004 | 0.011 | 0.001 | 0.008 `low` |
| R3 | gradient descent optimizers | **No** | 0.011 | 0.011 | 0.983 | 0.335 `low` |
| R4 | token bucket backoff | **No** | 0.116 | 0.117 | 0.996 | 0.410 `medium` |

The verifier was **correct in all four**. R4 was designed as an on-corpus query
-- KB-429 covers token buckets -- and retrieval returned Transformers, SQLite
and telemetry instead, so the verifier was right to refuse there too. Only R2
had successful retrieval.

A further eight queries were then run to widen this. Across every completed
verifier span in the database, classified only by whether the agent opened by
accepting or refusing the evidence:

| group | n | disagreement | contradiction |
| :--- | ---: | :--- | :--- |
| refused ("No ...") | 6 | **0.966 – 1.000** | 0.011 – 0.850 |
| accepted ("Yes ...") | 4 | **0.000 – 0.020** | 0.001 – 0.062 |

**What is consistent: disagreement.** The two groups do not overlap at all, and
the gap between them is two orders of magnitude. Every time the verifier
correctly identified that retrieval had failed, the signal fired at near 1.0
against it -- because it compares the verifier's "no" with four other agents
confidently discussing the retrieved documents. The signal works exactly as
designed and points at the one agent in the trace that was not wrong.

**What is not consistent: grounding.** The same two groups overlap on
contradiction: a refusal at 0.011 sits *below* an acceptance at 0.062. R1 and R3
are near-identical sentences -- "No, the evidence does not answer the question
about X. It discusses A, B and C, but ..." -- and the NLI model rated one a 0.850
contradiction and the other a 0.988 *entailment*. A 77x spread on a
surface-identical construction, varying only with the topic named.

So grounding does not reliably penalise refusal. It is **erratic** on refusal,
which is a different and less quotable problem than the one first claimed.

Three further verifier spans were excluded as unclassifiable: one opened
"The evidence partially answers the question", and two are older fixture rows
about teleportation that predate this work.

**What this still is not.** Ten classifiable traces, one verifier model
(`nex-agi/nex-n2.5-pro`), and one corpus of six documents. Four more off-corpus
queries were attempted and lost to the account's daily free-model limit, so the
refusal arm is thinner than planned and the accept arm thinner still at n=4.
The separation is clean enough to be worth pursuing and nowhere near enough to
publish.

R3 and R4 raised no alerts despite disagreement near 1.0. That is the 900s
`AGENTPULSE_ALERT_COOLDOWN_SECONDS` deduplicating against R1's alert, which is
correct behaviour and not a defect -- but it means **alert counts understate
how often these signals fire**. Read the scores, not the alert log.

The analyst is worth recording separately. In R1 it wrote that "Kubernetes pod
autoscaling must be designed to maintain telemetry performance metrics such as
sub-0.05ms" -- a fabricated connection between the retrieved telemetry KPIs and
a subject the evidence never mentions. It scored grounding **0.009** and passed
as `low_risk`. Reusing the evidence's own vocabulary while attaching it to an
invented subject is not something entailment scoring is positioned to catch.

#### 24.4.1 The claim this replaces, and why it broke

The first version of this section said, from one model and two traces:

> A refusal is a statement *about* evidence and is never entailed *by* it, so
> entailment scoring cannot separate "made something up" from "correctly
> reported that the evidence supports nothing."

The mechanism sounded right and the two traces fitted it. R3 falsifies it
directly: a refusal scored 0.988 entailed. The sentence was reasoning from how
NLI *ought* to treat meta-statements rather than from measurement, and two
traces were not enough to notice.

It was labelled a lead rather than a result, which is the only reason this is a
correction and not a retraction. **Two traces can support any mechanism you
can think of.** The rule that keeps working in this project is the one from
22.11: the check that finds things is running the thing, more times than feels
necessary.

### 24.5 The ablation was never stale

Next-steps item 8 assumed `ablation_results.json` had gone stale. Re-ran the
whole study: **every classification is bit-identical** to 2026-08-23. Same
tp/fp/fn/tn, same precision, recall, F1, FPR, FNR across all seven
configurations, same selected operating point.

It could not have been otherwise. The ablation consumes *raw* per-case signals
and supplies its own inputs from the dataset, so every fix cited as making it
stale landed either in an aggregation layer above those signals or in the
ingest path that feeds them. The tool-claim fix is the clearest case: purely
additive, `extract_result_count` for the ingest path, nothing changed in
`evaluate_tool_claims`, which is what the study calls.

**So Config D has shown parity with the best configuration for months while the
production signal it stands for scored zero across 1,328 live evaluations.**
Recorded in the limitations, in the template in `ablation.py` rather than the
generated file, per the regeneration trap in item 6.

Latency did move, 188.1ms to 132-135ms on Config B across three runs, so it is
not noise. It is also **not the ONNX fix**: the study calls
`load_models(use_onnx=False)` and has always measured the PyTorch path. The
cause is unattributed. Recorded as a measurement, not an improvement.

### 24.6 OmniRoute's headline, settled from its own source

23.5 left this as a judgement call. The installed package settles it.

`open-sse/config/freeTierCatalog.ts` holds `FREE_TIER_BUDGETS`: 19 providers
carrying roughly 1.36B tokens/month, of which `mistral` alone is 1B. Every one
of the 19 -- mistral, gemini, groq, cerebras, cohere, huggingface, openrouter --
is an account-based API requiring the user's own credential.

`src/shared/constants/providers/noauth.ts` holds the truly keyless set, and it
is 13 entries: `aihorde`, `auggie`, `chipotle`, `cloudflare-playground`,
`codex-app-server`, `devin-cli-agentic`, `duckduckgo-web`, `felo-web`,
`opencode`, `theoldllm`, `uncloseai`, `veoaifree-web`, `zcode`.

**The intersection of those two lists is empty.** The README's "~1.62B Free
Tokens / Month" and its "Fresh install, zero credentials" describe disjoint
sets of providers. Neither sentence is false; together they imply something
that is.

Three of the 13 are marked `"avoid"` in OmniRoute's own `FREE_TIER_TOS` --
`opencode`, `duckduckgo-web`, `felo-web` -- because those terms prohibit
routing through a self-hosted proxy. Four of the names are web scrapers and two
drive other people's agent CLIs.

The engineering is not the problem and the catalog is honest with itself: its
comments exclude nvidia, tencent and others as "theoretical, not granted." The
framing is the problem, and it is worth carrying as a reading skill rather than
a grudge.

### 24.7 Three of the five default models no longer produce text

23.4 picked five free OpenRouter models, one family each, and recorded that all
five reported zero pricing. On 2026-09-18 all five still existed in the
catalogue at zero pricing. **Three of them do not answer.**

| model | result |
| :--- | :--- |
| `deepseek/deepseek-v4-flash-0731:free` | serves |
| `nvidia/nemotron-3.5-lightning:free` | serves, with a visible reasoning preamble |
| `qwen/qwen3.8-27b:free` | `Provider returned error` |
| `z-ai/glm-5.2:free` | `Provider returned error` |
| `liquid/lfm-2.5-2.6b:free` | 200 OK with **empty content** |

The third row is the one to remember. `liquid` returns a well-formed response
with `content: ""` -- not an error, not a refusal, just nothing. A pipeline that
checks status codes would record it as a successful call and hand an empty
string to the evaluator.

Six of the 22 `:free` models were then probed for replacements, and the same
pattern held: `google/gemma-4-31b-it` and `google/gemma-4-26b-a4b-it` both
error, `thinkingmachines/inkling` is not available on this tier, and
`dots-studio/dots-3-note-preview` and `inclusionai/ling-3.0-flash-fin` both
return empty content. **Roughly half of a catalogue of free models does not
produce text.**

Working set at the time of writing, five families:

```
researcher  nvidia/nemotron-3.5-lightning:free
retriever   deepseek/deepseek-v4-flash-0731:free
verifier    nex-agi/nex-n2.5-pro:free
analyst     poolside/laguna-s-2.1:free
writer      inclusionai/ling-3.0-flash-vl:free
```

Expect this list to rot. 23.6's standing fact -- send one real request before
building on a catalogue -- now has a second confirmation and a new corollary:
**check for empty content, not just for errors.**

### 24.8 NVIDIA's catalogue advertises 82 models; a free key can call nine

OpenRouter's daily free-model limit stopped 24.4 halfway, so build.nvidia.com
was tried as the way to widen the verifier arm. Its `/v1/models` lists 82
entries across 21 owners, which sounds like it settles the diversity problem.

It does not. **That catalogue is global and access is per-account.** Calling
all 54 of its text models on a fresh free key:

| result | count |
| :--- | ---: |
| answered with text | 9 |
| `404 Not found for account` | 40 |
| timeout or resource-exhausted | 5 |

The nine span six owners -- deepseek-ai, google, meta, mistralai, z-ai and
nvidia itself. Six is still twice what OpenRouter's free tier reliably served,
so the move was worth making; the number to quote is nine, not eighty-two.

Every model named in this repo for the nvidia provider was picked from that
scan. The set it replaced had been picked by reading the catalogue, and not one
of its five could be called.

**Reasoning models do not return empty, they return truncated.** Four of the
nine spend completion tokens on a hidden `reasoning_content` field before
emitting an answer. `deepseek-v4-flash` burned 2,569 characters of it on "what
is a database index?". At `max_tokens=320` the content came back empty with
`finish_reason: "length"` -- which reads identically to 24.7's genuinely empty
completions and is a completely different problem. `max_tokens` is now 1200 and
`EmptyCompletion` reports which of the two it saw.

### 24.9 The refusal experiment, and the two faults that nearly published a result

`experiments/refusal_disagreement.py` exists to answer the confound 24.4 could
not: in all ten of its traces "the verifier refused" and "the evidence was
irrelevant" were the same event, so the separation fits two readings.

    H1 stance   disagreement rises when one agent's stance diverges from the
                others', regardless of who is right
    H2 error    disagreement rises when something in the trace is wrong

They differ only in the two cells 24.4 has none of: a wrong refusal on relevant
evidence, and a wrong acceptance of irrelevant evidence.

**Result, 87 trials across five verifier families:**

| cell | condition | n | disagreement | contradiction |
| :--- | :--- | ---: | ---: | ---: |
| A | relevant, verifier accepts | 37 | 0.219 | 0.211 |
| B | irrelevant, verifier refuses | 47 | 0.978 | 0.897 |
| C | relevant, verifier **wrongly refuses** | 3 | **0.999** | 0.938 |
| D | irrelevant, verifier **wrongly accepts** | **0** | — | — |

AUC separating refusal from acceptance: **0.980**.

This **reproduces 24.4 rather than overturning it**, and adds what 24.4 could
not see. A wrong refusal scores 0.999, fractionally *above* a correct one at
0.978. **Within refusals, whether the verifier was right makes no difference to
the score.** That is what H1 predicts and H2 does not.

The 2x2 is still open, and the honest statement is narrower than a verdict:
cell D is empty after 97 trials, so "does it also fire on a wrong acceptance"
is unanswered, and cell C rests on n=3. What can be said is that the signal
tracks stance, and within a stance it is blind to correctness.

**Cell D may not be reachable by running more trials.** Ninety-seven produced
zero wrong acceptances; these five models simply do not accept irrelevant
evidence. Filling it needs evidence designed to look relevant without answering
the question. Doing it with an adversarial prompt would prove nothing.

#### 24.9.1 Two faults in the measurement, one of which looked like a finding

**It was scoring the wrong pair.** `evaluator.py` calls
`evaluate_against_prior_agents` for each span, comparing an agent against every
agent *earlier* in the trace and keeping the worst. The verifier is third, so
its live score is max(researcher, retriever) vs verifier. **The analyst is
fourth and never enters the verifier's own score** -- and the analyst was
exactly what this experiment was comparing against. The two quantities differ
by more than the argument would suggest: AUC 0.980 under the live rule against
0.645 for the analyst pair. Both are now recorded per trial so the difference
is in the data rather than in a paragraph.

**The second one was worse.** `load_models` ran only outside `--report-only`,
while the backfill recomputes NLI. `compute_nli_grounding` returns `None` with
nothing loaded, `score_disagreement` turns `None` into `0.0`, and the report
came out with a uniform near-zero disagreement in every cell and an AUC of
0.455. That reads exactly like *the signal does not work*. **It was an unloaded
model, and those numbers were reported before the cause was found.**

Worth keeping as the pattern: a silent `None` coerced to a plausible default
produced a confident, publishable-looking, completely fabricated result. The
tell was that it was *uniform* -- real signals are noisy.

**A third, caught before it did damage.** Relevance was inferred by matching
query words against retrieved titles, which marked "transformer multi-head
self-attention" irrelevant when retrieval had returned *Attention Is All You
Need*. Every correct acceptance on that query would have been filed as a wrong
one, in cell D, the cell the experiment turns on. Each query now names the
document that must be retrieved.

All three were recoverable without re-spending API calls because every trial
stores its raw verifier output and retrieved titles, and relabelling happens at
report time rather than being frozen when the trial ran. That is worth copying
into any experiment that costs money per row.

#### 24.9.2 Aggregate-stable, item-unstable: the finding this session actually produced

The AUC of 0.980 hides the thing that matters for a monitoring product.

Cell A is **bimodal**, and reporting its mean concealed that. Mean 0.248,
**median 0.046**, and **9 of 40 correct acceptances score above 0.6** — one at
0.991. Those nine are not spread evenly: `google` and `mistralai` produce none
of them, while `deepseek-ai` and `z-ai` produce eight between them.

Reading the outputs is what settles it. On one query, three verifier
acceptances scoring 0.968–0.991 and three scoring 0.005–0.011 say the same
thing:

> *0.991* — "Yes — the 'Attention Is All You Need' excerpt directly explains
> that Transformers rely entirely on self-attention and that multi-head
> attention enables the model to jointly attend to information from different
> representation subspaces…"
>
> *0.007* — "Yes, the evidence includes a description of multi-head attention in
> Transformers as allowing the model to jointly attend to information from
> different representation subspaces at different positions."

Measured rather than asserted: **the pairwise semantic similarity between the
high-scoring and low-scoring outputs is 0.746–0.880.** Near-equivalent
sentences, scored at opposite ends of the range.

**This is the third instance of the same behaviour in one session**, and the
three together are the actual result:

| signal | comparison | scores |
| :--- | :--- | :--- |
| grounding | the same fabricated Kubernetes/telemetry link, two models | 0.009 vs 0.996 |
| grounding | near-identical refusal sentences (24.4) | contradiction 0.011 vs 0.850 |
| disagreement | acceptances at 0.75–0.88 similarity to each other | 0.005 vs 0.991 |

So the claim is not that these signals do not work. In aggregate they separate
well — AUC 0.979 for disagreement, 0.961 for contradiction, and the ablation's
F1 of 0.963 has been stable across re-runs a month apart. **The claim is that
aggregate separation and per-item reliability are different properties, and
this project has only ever measured the first.**

That distinction is not academic here. AgentPulse alerts on a *span*. A
`HIGH_HALLUCINATION_RISK` fires against one agent on one trace, and a user
reads that one number. An AUC of 0.979 says nothing about whether that
particular number is trustworthy, and this section says it frequently is not.

**What this does not say.** It does not say the signals should be removed. It
also did not, when first written, quantify how often an item-level score
misleads — 9 of 40 in one cell was an observation, not a rate. **24.9.3 now
measures it**, and narrows which signal is at fault.

**Why the mean was the wrong statistic**, and worth carrying: every cell in
24.9 was first reported as a mean. Cell A's mean of 0.248 reads as "low, with
noise". Its median of 0.046 with nine outliers above 0.6 reads as "usually
near-zero, and sometimes completely wrong", which is a different product. The
report now carries median and an above-threshold count alongside the mean.

#### 24.9.3 Paraphrase stability: the instability measured, and one wrong mechanism

`experiments/paraphrase_stability.py` turns 24.9.2 from three anecdotes into a
measurement by holding everything fixed except wording. Anchors are real
verifier outputs carrying their own evidence and prior agents; each is rewritten
with meaning preserved; every rewrite is checked against its anchor with the
product's own embedding model and discarded below 0.85 cosine similarity.
Scoring is identical to the anchor's. **Any spread is the signal reacting to
wording alone.**

Five anchors, 34 paraphrases, 2 discarded:

| stance | model | signal | anchor | spread | flipped |
| :--- | :--- | :--- | ---: | ---: | ---: |
| accept | deepseek | disagreement | 0.968 | **0.980** | 1/3 |
| accept | google | disagreement | 0.080 | **0.984** | 3/8 |
| refuse | google | disagreement | 1.000 | **0.957** | 1/6 |
| accept | meta | disagreement | 0.008 | **0.948** | 2/7 |
| refuse | deepseek | disagreement | 1.000 | 0.001 | 0/8 |
| accept | (all) | contradiction | ~0.01 | 0.004–0.057 | 0 |
| refuse | google | contradiction | 0.991 | **0.634** | 3/6 |

**10 of 34 paraphrase-signal pairs landed on the opposite side of the 0.6 alert
threshold from their anchor, while meaning the same thing.**

This **localises** the problem rather than restating it. **Disagreement is the
unstable signal** — four of five anchors span essentially the whole range.
Contradiction is comparatively stable on acceptances and unstable on refusals,
which is the same region 24.4 independently found it misbehaving in. Two
different experiments, two different methods, the same boundary.

The one stable disagreement anchor (deepseek, refusal, spread 0.0006) is worth
keeping in view: the signal is not uniformly noisy, so whatever drives the
swing is conditional on something not yet identified.

**A hypothesis tested and rejected, recorded so it is not chased again.** Within
one anchor's variants, all three paraphrases opening "Certainly" scored ~0.99
while those opening "Indeed" or "The evidence" scored ~0.02 — which looked
exactly like the NLI model keying on a discourse marker. Across all 34 it does
not hold: `the` spans 0.00–1.00 over 18 samples, `indeed` spans 0.00–1.00, and
`certainly` spans 0.04–1.00. It was a coincidence inside one anchor, and
publishing it from three examples would have been the precise error this whole
line of work documents.

So: **the instability is measured, and the mechanism is not known.**

#### 24.9.4 Where the swing comes from, and a design error it exposes

The live disagreement score is `max(researcher, retriever)` for a verifier span.
Decomposing that max across the paraphrase set costs no API calls, because the
outputs are already stored.

| stance | model | researcher spread | retriever spread | researcher drives max |
| :--- | :--- | ---: | ---: | ---: |
| accept | deepseek | **0.980** | 0.001 | 3/3 |
| accept | google | **0.984** | 0.001 | 8/8 |
| accept | meta | **0.948** | 0.005 | 7/7 |
| refuse | deepseek | 0.001 | 0.001 | 2/8 |
| refuse | google | **0.957** | **0.992** | 6/6 |

**On every acceptance anchor the instability is entirely the researcher
comparison.** The retriever comparison moves by at most 0.005 across the same
paraphrases, and the researcher comparison spans essentially the whole range and
supplies the max every time.

It does not generalise to refusals: one refusal anchor is stable on both, and
the other is unstable on both. So this localises the acceptance case and leaves
the refusal case open.

**The design error is visible regardless of the NLI model's behaviour.** The two
prior agents produce different kinds of text:

    researcher   "- How does the number of attention heads affect model
                 capacity across different NLP tasks?
                 - What theoretical properties distinguish multi-head
                 self-attention from single-head variants?"

    retriever    "The retrieved documents cover the Transformer's multi-head
                 self-attention mechanism, DeBERTa's disentangled attention
                 enhancements, and telemetry performance baselines."

The retriever asserts. **The researcher asks.** A list of questions has no truth
value, so "does this contradict the verifier's statement?" is not a well-posed
question to put to an NLI model, and an ill-posed input is free to return
anything — which is what the 0.948–0.984 spreads look like.

That is a fault in the pipeline rather than in DeBERTa. `evaluate_against_prior_agents`
compares an agent against *every* earlier agent in the trace, and the trace's
first agent is a planner whose entire output is questions. Nothing in the
disagreement design distinguishes agents that make claims from agents that do
not.

**Worth trying, not yet tried:** excluding planner-type spans from disagreement
comparison, or gating on whether the source output contains an assertion at all.
The relevance floor already exists as a precedent for gating a comparison that
should not have been made — this would be the same idea applied to a different
malformed case. Whether that fixes the refusal instability is a separate
question, and 24.9.4 gives no reason to think it would.

#### 24.9.5 The fix works, and it removes the signal

24.9.4 identified the malformed comparison — a planner's questions put to an NLI
model as a contradiction candidate — and proposed excluding planner spans. That
was tested on the existing data at no API cost.

**On acceptances the fix does exactly what it should:**

| anchor | spread before | spread after | alert flips |
| :--- | ---: | ---: | :--- |
| accept, deepseek | 0.980 | **0.001** | 1/3 → **0/3** |
| accept, google | 0.984 | **0.001** | 3/8 → **0/8** |
| accept, meta | 0.948 | **0.005** | 2/7 → **0/7** |

The paraphrase instability on acceptances is entirely eliminated. The mechanism
in 24.9.4 is confirmed.

**Then the same fix was applied to the 87-trial set, and the signal disappeared:**

| | n | median | mean | above 0.6 |
| :--- | ---: | ---: | ---: | :--- |
| accept | 40 | 0.002 | 0.093 | 3/40 |
| refuse | 50 | 0.000 | 0.413 | 21/50 |

**AUC refusal-vs-acceptance: 0.457, against 0.980 before.** That is no
separation at all.

So the whole of the disagreement signal's measured performance came from the
comparison that should never have been made. **Remove the ill-posed input and
the signal has no discriminative power.** The 0.980 was an artifact, and 24.9's
"disagreement tracks stance" was describing the behaviour of a planner
comparison rather than a property of inter-agent disagreement.

**Why the refusal case looked like a regression, and was not.** With the
researcher removed, most refusal paraphrases score ~0.00 against the retriever,
and that is correct. The retriever says the documents cover A, B and C; the
verifier says they cover A, B and C but do not answer the question. Those
outputs agree. There is no contradiction to find, and the signal correctly
reports none. It was the researcher comparison that had been manufacturing one.

The exception is instructive: the one refusal paraphrase that leads with its
negation ("The given evidence **does not include** any information about
Kubernetes; instead it focuses on…") scores 0.993, while five that state the
topics first and negate at the end score 0.001–0.012. Same claim, same stance,
scored by clause order.

**What this means for the product, not the thesis.** Section 14 already recorded
that disagreement detected 0 of 10 independently labelled contradictions on real
multi-agent traces — three-for-three with drift and tool-claim. This supplies
the mechanism for that failure: on this pipeline, the signal's apparent
separation was produced by a malformed NLI comparison, and its correct-input
behaviour is close to chance.

It should not be shipping a `HIGH` severity alert in that state. The options are
to disable it, downgrade it to experimental and stop alerting on it, or redesign
the comparison so it runs only between agents that make assertions about the
same proposition — which is a different and harder feature than what exists.

**What this does not establish.** It does not show that inter-agent disagreement
is unworkable in general, only that this implementation's measured performance
does not survive removing an input that should never have been in it. A
comparison designed around claim-bearing spans has not been tested, and 14's
evidence-partition problem would still apply to it.

### 24.10 Standing facts

New:

- **A detector that benchmarks well can be unreachable, and the benchmark will
  never say so.** 24.5 is the general form of 18.4. When an experiment supplies
  its own inputs, it measures a ceiling, not a capability. Ask what the study
  bypasses before quoting its number.
- **Disagreement tracks stance, and within a stance is blind to correctness.**
  87 trials, five verifier families: correct refusals 0.978, **wrong refusals
  0.999**, correct acceptances 0.219. Whether the verifier was right does not
  move the score. This is the sharpest open question the project has, and unlike
  14 it now has a reproduction. 24.9; cell D is still empty, so it is not closed.
- **Never report a cell as a mean alone.** Cell A's mean of 0.248 reads as "low
  with noise"; its median is 0.046 with 9 of 40 above the alert threshold, which
  is "usually near-zero and sometimes completely wrong". The mean hid the
  session's main finding for several hours. Report median and an
  above-threshold count.
- **Aggregate separation is not per-item reliability.** An AUC near 0.98 says
  how well two groups rank against each other. It says nothing about whether any
  single score is trustworthy, and a product that alerts on one span depends
  entirely on the latter. 24.9.2.
- **A silent `None` coerced to a default produced a fabricated result.** An
  unloaded NLI model made every disagreement score 0.0, and the report read as
  "the signal does not work" with an AUC of 0.455. Those numbers were reported
  before the cause was found. **The tell was uniformity** -- real signals are
  noisy, and a clean flat number across every cell is a bug, not a finding.
- **Score the pair the production code scores.** `evaluator.py` compares each
  span against agents *earlier* in the trace, so the verifier is scored against
  researcher and retriever, never the analyst that follows it. Measuring the
  analyst pair instead gave AUC 0.645 against the live rule's 0.980 — close
  enough to argue about, far enough to mislead.
- **Store raw outputs, and derive labels at report time.** Three separate
  analysis faults in 24.9 were corrected for free because every trial keeps its
  verifier text and retrieved titles. An experiment that costs money per row
  should never freeze a derived label into the row.
- **A model catalogue is not an entitlement.** NVIDIA lists 82 models; a free
  key can call nine. 40 of 54 answer `404 Not found for account`. 24.8.
- **A 200 with empty content is not an error and will be scored.** deepseek
  served all session and then returned `content: ""` mid-batch. Status is 200,
  no exception, no error field, and the evaluator receives an empty string.
  Check for empty text explicitly; `EmptyCompletion` in the demo exists for this.
- **Grounding is erratic on refusals, not consistently punitive.** Two
  near-identical refusal sentences scored contradiction 0.850 and 0.011, the
  second rated 0.988 *entailed*. An earlier version of 24.4 claimed a consistent
  penalty from two traces and was wrong; see 24.4.1.
- **Alert counts understate how often a signal fires.** A 900s cooldown
  deduplicated two of three disagreement alerts. Read the scores, not the alert
  log.
- **Reusing the evidence's vocabulary while attaching it to an invented subject
  scores as well grounded.** The analyst wrote that Kubernetes autoscaling must
  hold sub-0.05ms telemetry thresholds, from documents that never mention
  Kubernetes, and scored grounding 0.009.
- **A stub proves delivery and nothing else.** Fixtures are ASCII, well-formed,
  and never refuse. Two of the five faults in 24 were unreachable until a real
  model produced real prose.
- **`except Exception: return 1` is how a project loses a week.** The
  UnicodeEncodeError was one line of traceback away from obvious and was
  reported as an exit code.
- **Check whether the headline number and the "no setup needed" claim describe
  the same thing.** 24.6 is the general form. Two true sentences placed next to
  each other can assert something neither one says.
- **`.venv/Scripts/uvicorn.exe` is stale and fails with exit code 1 and no
  output**; use `python -m uvicorn`. The shim has the pre-rename path baked in,
  which is the same staleness as the editable installs in Section 4.
- **Run the API and the worker from the same cwd.** `AGENTPULSE_DATABASE_URL` is
  relative, so a worker started inside `backend/` opens an empty
  `backend/data/agentpulse.db` and dies on `no such table: evaluation_jobs`.
  Section 4 warned about the two files; this is how they bite in practice.
- **`experiments/ablation.py` ignores `AGENTPULSE_MODEL_CACHE_DIR`.** It calls
  `load_models()` without `cache_dir`, so it falls back to `./models` relative
  to cwd and will re-download 1.2 GB in a fresh worktree.
- **The five OpenRouter model ids from 23.4 are all still live** at zero prompt
  and completion pricing, re-checked against the catalogue on 2026-09-18.
- **Pollinations serves keyless and is OpenAI-compatible**, so it is the honest
  smoke test when there is no key. Its anonymous tier is one model
  (`openai-fast`), so it cannot produce a meaningful disagreement number.

Open, and the reason this section stops where it does:

- **Cell D is the whole remaining question, and more trials will not fill it.**
  97 produced zero wrong acceptances. It needs evidence constructed to look
  relevant without answering the question — a designed corpus entry, not another
  run. Cell C also needs more than n=3 before the "wrong refusals score as high
  as correct ones" line carries weight, and that one *will* fill with volume.
- **The experiment measures the evaluator, not the ingest path**, the same
  caveat 24.5 records about the ablation. Nothing here says the signal is
  reachable in production; 18.4 is the standing reminder of that distinction.
- **The SDK still discards spans silently from any synchronous caller.** 24.1
  fixed the demo, not the footgun underneath it.

---

## 25. The same test applied to the other three signals (2026-09-21)

24.9.5 found that disagreement's measured performance came from an input that
should never have been in the comparison. The obvious follow-up is whether the
other three signals have the same shape of problem. They were each given the
test their design invites.

| signal | test | result |
| :--- | :--- | :--- |
| drift | paraphrase stability | **robust** |
| grounding | premise truncation | **clean on this corpus** |
| grounding | paraphrase stability (24.9.3) | stable on acceptances, weak on refusals |
| tool-claim | dependence on prompt-dictated phrasing | **fails: 9/9 → 0/9** |

### 25.1 Drift is the robust one

Centroid distance across the same paraphrase set that broke disagreement:

| anchor | spread |
| :--- | ---: |
| accept, deepseek | 0.031 |
| refuse, deepseek | 0.084 |
| accept, google | 0.059 |
| refuse, google | 0.084 |
| accept, meta | 0.074 |

Mean spread **0.066**, against disagreement's 0.948–0.984 on the identical
texts. Roughly fourteen times tighter, and every value sits far below the 0.30
drift threshold, so no paraphrase would flip a drift alert.

This is what the design predicts rather than a surprise: sentence embeddings are
trained to be paraphrase-invariant and NLI is not. It is worth stating anyway,
because it means the instability in 24.9 is a property of the NLI-based signals
specifically and not of the evaluation stack as a whole.

### 25.2 Grounding's truncation risk does not fire here

`compute_nli_grounding` tokenises once without truncation to learn the true
length, then truncates to `MAX_NLI_TOKENS = 512`. Across 100 grounding
comparisons on the demo corpus: **0 truncated**, token lengths 209–288, median
235.

So the malformed-input class of fault does not apply to grounding on this
corpus. That is a statement about a six-document corpus retrieved at top_k=3,
not about grounding in general — a production retriever returning longer
documents would cross 512 and the score would then describe only the part the
model read.

**One gap worth closing regardless.** `input_truncated` is computed per
evaluation and surfaced only as a `logger.warning` fired **once per worker
process**. It is not stored on the evaluation row. A user reading a grounding
score cannot tell whether the model saw all of the evidence, and after the first
occurrence neither can the logs.

### 25.3 Tool-claim only works because the prompt dictates the phrasing

`demo/multi_model_pipeline.py` instructs the retriever agent:

> "State how many documents you are using, in the form 'Retrieved N documents'."

That is the exact phrasing `COUNT_PATTERNS` matches. Tested against the nine
real retriever outputs in the experiment data:

| condition | extracted a count |
| :--- | :--- |
| text as produced | **9 of 9** |
| with the dictated sentence removed | **0 of 9** |

The models mostly wrote their own sentence in prose — "I retrieved three
documents covering DeBERTa's disentangled attention…" — and then appended
"Retrieved 3 documents." because they were told to. The prose form extracts
nothing: `COUNT_PATTERNS` is digit-only, so "three documents" does not match
while "3 documents" does.

**This is the mechanism behind Section 11.** The validator extracted zero claims
across 8,353 prose spans from five real models, and nobody could say why. Real
agents write "three documents". The regex reads digits.

So the demo does not demonstrate the tool-claim signal. It demonstrates the
signal against text the demo asked the model to produce in the validator's own
format, which is the same shape of fault as 24.5's ablation feeding
`evaluate_tool_claims` a `result_count` from the dataset.

### 25.4 Where that leaves the four signals

| signal | status |
| :--- | :--- |
| drift | robust to paraphrase; the strongest of the four, consistent with Section 13 |
| grounding | stable on acceptances, erratic on refusals (24.9.3); truncation not triggered here but unrecorded when it is |
| tool-claim | extracts only when the prompt dictates the format; 0 of 9 otherwise |
| disagreement | measured performance was an artifact; alerting withdrawn (24.9.5) |

Two of four have performance that comes from the harness rather than the signal,
and in both cases the earlier external-validation failures — Section 11 for
tool-claim, Section 14 for disagreement — now have mechanisms rather than just
results.

**Not claimed:** that grounding and drift are validated. Neither has been tested
against independently labelled production data in this session; they have only
been shown not to fail in the specific way disagreement failed. Section 14's
"three for three" record stands, and this section explains two of the three
rather than overturning any of them.

---

## 26. The RAG chatbot, and the first real answer about drift (2026-09-20/21)

Section 25 left drift as the most robust of the four signals and the only one
with no production data behind it. It needs 32 evaluated spans for one agent
and every script in this repo had sent five. A chatbot was built to close that,
and answering the question took four rounds of removing things that made the
answer look already-answered.

### 26.1 The frontend arrived with four ways of faking the answer

A commit added `dashboard/src/components/rag/` -- six components, `ragApi.ts`,
`riskTone.ts` and a test -- wired into the product nav as **RAG Live Monitor**.
It also carried four separate mechanisms that produced a working-looking screen
with nothing behind it.

**`vite.config.ts` was a mock API server.** A middleware plugin named
`agentpulse-mock-api` intercepted every `/v1/*`, `/chat` and `/corpus` request
and answered it from `src/lib/mockData.ts` before it could reach a backend.
There was no proxy behind it, so under `npm run dev` nothing was ever real:
agents, traces, alerts, drift and evaluator health all invented, and `/chat`
returning one hardcoded paragraph about SQLite WAL with a `Math.random()`
trace_id and a fixed verifier verdict. No model was called and nothing was
monitored.

**`useTelemetry.ts` fell back to fixtures on error** and then set
`connected = true, error = null`, so an unreachable backend displayed invented
agents and incidents while stating it was connected.

**`RagChatbotApp` ran the simulator when `!ragStatus.ok`**, so a missing backend
produced a fabricated conversation rather than an error.

**`RagChatbotApp` invented a trace_id** when a turn had none -- `'tr_' +
Math.random()` -- rendering an id a viewer can look up in AgentPulse and will
not find.

All four removed, `mockData.ts` deleted rather than orphaned per 23.2. Verified
with the backend deliberately stopped, in the rendered page: `/v1/agents`,
`/chat` and `/corpus` all return 500 through the new proxies and the UI reads
"Cannot reach AgentPulse".

**The pattern is worth naming.** These are not sloppy fallbacks; each one was
written to make the UI work without its backend, which is a reasonable
engineering instinct everywhere except in a monitoring tool. Here the product
*is* the claim that what you see is real. This is the seventh instance in the
repo and the first where the fabricated thing was telemetry rather than copy.

### 26.2 The chatbot

`demo/chatbot/app.py` serves the contract in `dashboard/src/lib/ragTypes.ts`:
`POST /chat`, `GET /corpus`, three agents on three models, one trace per turn.
The answerer carries retrieved text as `input_summary` and its reply as
`output_summary`, the pair `evaluate_grounding` compares. Errors return 200
with `error` and whichever agents completed, with the real trace_id.

First real turn, end to end:

    retriever  mistralai/mistral-nemotron     56.1s
    verifier   meta/muse-glimmer-30b           2.2s
    answerer   deepseek-ai/deepseek-v4-flash   7.5s

    3 spans sent, 3 evaluated, grounding 0.052 / 0.040 / 0.494

**Model volatility is worse than 24.7 recorded.** Over roughly two hours, on the
same key:

| model | observed |
| :--- | :--- |
| `google/gemma-4-31b-it` | answered the 24.8 scan, then hung indefinitely -- 90s, no response, no error |
| `z-ai/glm-5.3-flash` | same, later the same day |
| `mistralai/mistral-nemotron` | 56s, then over 75s, then 26.9s |
| `deepseek-ai/deepseek-v4-flash` | 4.4s, then 7.5s, then 30.8s |

24.7's rule was "listed is not served". This adds a third state: **served, then
not**, within hours, with no error to distinguish it from slowness. Two
consequences were engineered for: a 75s request timeout, because the three calls
are sequential so a hung provider takes the whole turn and shows as a spinner;
and model choices re-measured rather than carried forward.

`/corpus` also returned `{"documents": []}` because the attribute is `corpus`,
not `documents`. It answered 200, so the frontend would have rendered "no
corpus" rather than a fault.

### 26.3 Drift, finally measured against real traffic

34 turns, deliberately split: 17 on-corpus questions the six documents can
answer, then 17 off-corpus ones they cannot. Sending 34 similar questions would
have filled the windows and proved only that a counter increments; drift exists
to detect a change, so there had to be one. 33 turns succeeded, one timed out,
46 minutes.

**Drift produces values. It had never been given the chance.**

| agent | drift rows | with a window value | max |
| :--- | ---: | ---: | ---: |
| verifier | 58 | 28 | 0.4261 |
| retriever | 57 | 17 | 0.1073 |
| answerer | 36 | 4 | 0.5142 |

Earlier in the same session the same agents had 33-34 rows and **zero** window
values, which looked like the signal being broken. It was not. The window needs
20 baseline samples plus 12 current ones, the baseline pool is persisted
(16.3's fix) and **the current pool is in-memory by design**:

> "The current window is deliberately left empty: it holds the most recent
> outputs, and outputs from before a restart are no longer current."

That reasoning is sound. Its consequence had never been stated: **after every
worker restart, every agent needs 12 fresh spans before
`window_centroid_distance` returns anything at all.** The worker was restarted
several times during the session, which is why 33 spans produced nothing. It is
not a bug and it is a real operational property -- every deploy, crash or
restart blinds the signal alerting depends on, per agent, until traffic
re-warms it.

**Did it detect the shift?**

| agent | before the switch | after |
| :--- | :--- | :--- |
| verifier | n=11, mean **0.306** | n=17, mean **0.396**, 17/17 above the 0.30 threshold |
| answerer | n=0 | n=4, mean 0.502 |
| retriever | n=0 | n=17, mean **0.093**, 0/17 above threshold |

**The verifier detected it, and detected it correctly.** Its mean rose from
0.306 to 0.396 across the boundary.

**The retriever did not, and that is also correct.** Its output barely changes
with the question -- "three documents were retrieved, covering X, Y and Z" --
because the corpus is the same six documents regardless of what is asked. Its
distribution genuinely did not shift, and drift reporting 0.093 is right.

**Only the verifier's comparison is real.** The retriever and answerer have
*no* pre-switch window values, because their windows filled after the boundary.
For those two this run cannot compare before against after at all. One agent
detected one shift; that is the whole claim.

### 26.4 What this settles, and what it does not

The question was "is AgentPulse actually monitoring a live conversation, or
does it only look like it is". For grounding and drift the answer is now yes,
measured rather than displayed: 33 conversational turns, 99 spans, evaluated
scores, and a drift signal that moved when the subject did.

It does not say the scores are correct. It never could -- that needs labelled
data, which is what 24.9 and 25 were for. It says the machine runs.

Two things it did surface that no dashboard would have:

- **drift is blind for 12 spans per agent after every restart**, which in a
  demo is most of the demo, and in production is every deploy
- **the free tier's latency moves by an order of magnitude within an hour**, so
  a turn costs between 9 and 247 seconds with no way to predict which

Open: the retriever and answerer still have no before/after comparison, and
getting one means a second run of this length without a restart in the middle.

---
