# Session Handoff — AgentPulse Work Log

**Written:** 2026-08-23. **Rewritten clean:** 2026-08-26. **Updated:** 2026-08-27 (Sections 7–9 disagreement/benchmark/positioning; 10 drift diagnosis and fix; 11 tool-claim external test; 12 blocked redesign; 13 competitor audits). **Updated:** 2026-08-28 (Section 14 — external disagreement validation, the last of the three signals to be checked and the third to fail; Section 15 — the productization arc, seven phases from migrations through health/readiness). **Updated:** 2026-08-30 (Section 16 — dashboard unfrozen, the landing-page claim audit, and the half-finished drift restore). **Updated:** 2026-08-31 (Section 17 — Final Review deliverables, the literature survey, and repository access). **Updated:** 2026-09-12 (Section 18 — frontend replaced and wired to the live API, the tool-claim signal made to fire for the first time, and the Compose stack fixed so it actually evaluates; MIT licence added, closing a claim the README had been making against a missing file). **Updated:** 2026-09-19 (Section 24 — the 23.4 pipeline run for the first time and five faults found in it, four of which meant it delivered nothing; the disagreement signal firing at 0.966–0.996 against the one agent in each trace that was correct, which is the evidence-partition problem of Section 14 with a reproduction on five model families; the ablation re-run and found never to have been stale; OmniRoute's free-token headline settled from its own source). **Updated:** 2026-09-20 (Sections 24.8–24.9 — NVIDIA's 82-model catalogue is nine models on a free key; the refusal experiment at 87 trials, which reproduces 24.4 and shows a *wrong* refusal scoring 0.999 against a correct one's 0.978, so the signal tracks stance and is blind to correctness within it; and three analysis faults in that experiment, one of which produced a uniform, confident, entirely fabricated result from an unloaded model). **Updated:** 2026-10-13 (Section 28 — the handoff checked against the repository, every pull request and branch, and GitHub's settings rather than against itself: `main` is `e31fb58`, a stale-snapshot push with no PR that re-enabled the withdrawn disagreement alert, reverted the pipeline fix and deleted the Section 24–25 experiments; the unmerged Oct-1 branch (PR #60) already undoes that; Sections 25.5/25.6 folded in from PR #57 with their real status; Section 27 is the 34-turn drift probe, corrected — its verifier value was already over the alert threshold; and the RAG chat view has six fabrication paths, two of them still live). **This chain is not in date order and names only some sections — 19–23 and 25 appear in no entry. The section headings carry the dates; trust those.**

**Project:** AgentPulse — self-hostable observability SDK for grounding-risk and drift monitoring in multi-agent LLM systems. M.Tech project. Working directory: `C:\MLOPs\3rd sem project\Agentpluse` (renamed from `project one agent`; the venv's editable installs still point at the old path).

**User context:** Prefers Hinglish, direct/terse communication, wants things actually done not just discussed, dislikes overclaiming. The entire multi-session arc has been about replacing fake/inflated numbers with real measured ones — treat that as the standing bar for any new work, not just past work.

---

## READ FIRST (2026-10-21): Section 29 is the current state

Since the banner below was written, 37 PRs (#69 to #105; #101 to #103 and #105 merged on 27 Oct, see 29.17) merged, the first automatic deploy ran, a leaked API key was closed and rotated, and writes on the public site got a password. **Read Section 29 before anything else:** it lists what is live, what is still open, and the traps hit on the way. The banner below is still correct about 2026-10-13 and about how `main` was overwritten; where it says something is open, check 29.5.

## READ FIRST — the repository is not what the rest of this file describes (checked 2026-10-13)

Everything below this banner was written session by session, against whichever branch that session was on. Sections 0–23 were checked against `origin/main` as it stood in August–September and nothing was re-checked after `e31fb58` landed on 2026-09-21. Section 28 is the reconciliation; the short version: **[2026-10-20] Since #60 merged (07:34 UTC), Sections 24–26 describe `main` again; this banner records the state on 2026-10-13.**

- **`main` is `e31fb58`: an unsigned direct push with no PR, most likely a Google AI Studio sync of a stale working tree, not a reviewed change.** Its message is *"refactor: remove tool claim tracking and alerting"*; its diff is **48 files, +3,609 / −12,482**. It re-enabled the `AGENT_DISAGREEMENT` HIGH alert that 24.9.5 withdrew, put `demo/multi_model_pipeline.py` back to the version that delivers zero spans (24.1), deleted the 24.9 experiments and the `tool_claims_found` migration and tests, deleted the dashboard lockfiles, blanked `.env.example`, cut this file back to Section 23, and **added** the RAG chat view with its mock middleware. 28.2. **[2026-10-20] No longer: #60, #63, #61 and #62 were merged on top of `e31fb58` between 07:34 and 07:37 UTC, and #56 at 11:44; `main` is now `a73c99a` (28.9 item 1, 28.12). The other lines of this file that still describe `e31fb58` as `main` were not all re-checked.** **[2026-10-20, later] Everything this bullet lists as removed, reverted or blanked is back on `main`, the alert is withdrawn again, and the mock middleware, `mockData.ts` and the root `package.json` and `metadata.json` are gone. The RAG view stays, with fabrication paths 3–6 (28.4). The other stale lines a later search found now carry their own notes.**
- **PR #60 (branch `claude/optimistic-knuth-0z7l6z`, five commits from 2026-10-01) already undoes that** and adds a real chat service. It is not merged. Sections 24–26 of this file describe `7f78b3f` plus that branch, not `main` today. 28.1, 28.3. **[2026-10-20] Merged at 07:34 UTC (`c45be66`).** **[2026-10-20, later] So Sections 24–26 describe `main` now; Section 24's banner has the file check.**
- **The code behind 25.5/25.6** was merged in #55, removed by `e31fb58` and is restored on #60; 25.6 is PR #56, never merged. 25.5, 25.6. **[2026-10-20] #60 was merged (07:34 UTC), so 25.5's code is on `main` again; #56 was merged (`a73c99a`) and deployed; 28.12.**
- **The RAG chat view has six fabrication paths, not four, and two of the worst are on every branch:** it stamps `groundingScore 0.942 / SUPPORTED` on any turn whose evaluation never arrives, and it shows invented drift once its own counter reaches 32. 28.4.
- **The 34-turn drift probe (Section 27) is weaker than first written:** the verifier was already over the alert threshold before the topic switched. 27.2.

Inline corrections below are marked **[2026-10-13]** and left next to the text they correct. Apart from two lines noted where they occur, the original wording is kept.

---

## 0. TL;DR

- **Backend + evaluation pipeline: real, tested, working.** **209/209 tests passing** (`pytest tests/ -q`; was 130 before the productization arc). Security audit complete. Real model inference, not stub fallbacks. **[2026-10-13] The count is stale: 290 tests pass on PR #60 (`pytest tests/`, 4m45s); 260 collect on current `main`, which `e31fb58` stripped of two suites. 28.3.** **[2026-10-20] `main` now collects 293: #60's 290 plus #56's three. The first CI run of the suite on `main`, after #65 merged, passed 292 and failed 1 (28.12).**
- **Inter-agent disagreement failed its external check too — that is now three for three.** On real multi-agent traces the shipped configuration detects **0 of 10** independently labelled contradictions. The fix that recovers 6 of 10 does **not generalize**. Section 14; `COMPETITIVE_POSITIONING.md` revised. Every internal benchmark this project has checked against external data has broken or narrowed: drift, tool-claim, and now disagreement.
- **The evidence-partition problem is the more interesting finding** and is now the real research question for disagreement: agents holding different evidence produce apparent contradictions that are not faults, and an NLI score cannot tell the two apart. Section 14.
- **Production hardening happened, and is no longer "deliberately not next".** Seven phases: migrations, durable queue, ONNX fix, throughput measurement, retention, self-monitoring, health/readiness. All measured, not asserted. Section 15 and `PRODUCTIZATION_LOG.md`.
- **Drift was diagnosed and fixed** against an external real-trace corpus — false alarms on unchanged operation went from **91.7% → 1.5%**, detection 92%, AUC 0.991 on a held-out split. The 0.30 threshold was never the problem; the aggregation was. **But coverage is only 24.5%** — see Section 10, and do not quote the accuracy without the coverage.
- **Both reasoning-strategy benchmarks are DONE, real, and compared** — see Section 1 and `GPU_VS_CPU_BENCHMARK_REPORT.md`.
- **Inter-agent disagreement engine rebuilt and wired into production this session** — the project's largest claim-vs-reality gap is closed. See Section 7. **[2026-10-13] Overtaken: Sections 14, 24.9.5 and 25.4 — the rebuilt engine's measured performance was an artifact; its alert is withdrawn at `7f78b3f` and on PR #60, and live on `main` (28.3).** **[2026-10-20] Withdrawn on `main` too since #60 merged; the code deployed to Azure on 2026-10-20 has it withdrawn as well (28.11, 28.12).**
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
- **`main` has a second writer and no branch protection** - the Free plan does not offer it on private repos. Section 17.5. **[2026-10-13] The repo is public now, so protection is available and still not applied (the API answers 404 "Branch not protected"), and `SkSahoo98` still has push. `main`'s real second writer was an untracked route: `e31fb58`, unsigned, no PR, most likely an AI Studio sync (28.2).**
- **Design direction is frozen in `bedhi_frontend.md`** — reference by reference, what to take and what to refuse, with Liquid Glass rules. Section 16.7. **[2026-10-13] That file no longer exists — deleted 2026-09-14 in `c6198e3` ("drop the agent prompts"); the direction survives only as the prose in 16.7.**
- **Repo pushed through commit `3cd1080`; working tree clean, `origin/main` in sync.** The dashboard work that used to sit uncommitted was reviewed and checkpointed (`8a93558`) with three known gaps recorded — see Section 15. **[2026-10-13] Stale: `origin/main` is `e31fb58` (2026-09-21), about 150 commits later; PRs #56, #57, #58 and #60 are open (#59 was closed as a duplicate of #60).** **[2026-10-20] At 12:30 UTC `origin/main` is `3dea8fc`: #60, #63, #61 and #62 were merged 07:34–07:37 UTC, #56 at 11:44, #65 and #66 at 12:26. #57 (2026-10-20) and #58 (2026-10-13) were closed unmerged; #64 is open.**
- **The 23.4 multi-model pipeline had never worked, and now does.** Five faults in one file; four of them meant it delivered zero spans while printing a successful run. Section 24. **[2026-10-13] On `main` it is the broken version again: `e31fb58` reverted the fixes (no `await pulse.start()`, `pulse.shutdown()` not awaited, `max_tokens=320`, no `EmptyCompletion`); PR #60 restores them. An offline stub-client run delivered 0 spans from `main`'s file and 5 from the restored one. 28.3.** **[2026-10-20] Fixed on `main` again since #60 merged: `demo/multi_model_pipeline.py` has `await pulse.start()`, an awaited `pulse.shutdown()`, `max_tokens: int = 1200` and `EmptyCompletion`. The stub-client run was not repeated.**
- **The signals are aggregate-stable and item-unstable, and only the first has ever been measured here. This is the session's result.** Now quantified: holding evidence and priors fixed and varying only wording, **disagreement spreads 0.948–0.984 across paraphrases of the same statement**, and **10 of 34 paraphrases crossed the alert threshold their anchor did not**. AUC is 0.979 throughout. **AgentPulse alerts per span, so it depends on the property that was never measured.** Sections 24.9.2 and 24.9.3. **[2026-10-13] Miscounted: 34 paraphrases were generated and 2 discarded, so 32 were scored, each on 2 signals = 64 pairs. 10 pairs flipped (disagreement 7 of 32, contradiction 3 of 32), and 9 distinct paraphrases of 32 flipped on at least one signal. Re-derived from the result JSON. 28.5.**
- **It is disagreement specifically.** Contradiction holds to 0.004–0.057 on acceptances and only breaks on refusals (up to 0.634) — the same region 24.4 found it misbehaving in by a different method. The obvious lexical explanation was tested and rejected (24.9.3).
- **The disagreement signal's entire measured performance was an artifact, and removing the artifact removes the signal. This is the most consequential thing in Section 24.** The swing comes from comparing the planner's *questions* against the verifier's statement — ill-posed input to an NLI model, a pipeline fault rather than a DeBERTa fault. Excluding planner spans eliminates the paraphrase instability completely (spreads 0.98 → 0.001, alert flips → 0) **and drops AUC from 0.980 to 0.457, which is chance.** Sections 24.9.4 and 24.9.5.
- **Section 14's "0 of 10" now has a mechanism.** Disagreement failed external validation a month ago and nobody knew why. It was measuring a malformed comparison. The `HIGH` alert has been withdrawn; the score is still computed and stored. **[2026-10-13] Withdrawn at `7f78b3f` and on PR #60; on `main`, `e31fb58` restored the rule (HIGH, threshold 0.6, `alerting.py:299-306`). The mechanism claim was re-scored by hand and holds — live configuration AUC 0.9792, retriever-only 0.4570. 28.3, 28.5.** **[2026-10-20] Withdrawn on `main` again since #60 merged: `alerting.py` keeps the rule only as a comment, and `tests/test_alerting.py` asserts it does not fire.**
- **Two of the four signals get their apparent performance from the harness, not the signal.** Tool-claim extracts a count from 9 of 9 real retriever outputs, and **0 of 9** once the sentence the demo's own prompt dictated is removed — which is the mechanism behind Section 11's zero claims across 8,353 prose spans. Disagreement is 24.9.5. **Drift is the robust one**: paraphrase spread 0.066 against disagreement's 0.948–0.984 on identical texts. Section 25. **[2026-10-13] Caveats: the 0 of 9 follows partly by construction (the removal regex deletes the only digit-count phrase in each output), and the 0.948–0.984 range covers four of the five anchors — the fifth has disagreement spread 0.0006. 25.3, 28.5. The 25.1 spreads were not re-checked.**
- **Disagreement tracks stance, not error.** 87 trials across five verifier families: correct refusals **0.978**, **wrong** refusals **0.999**, correct acceptances **0.219**. Whether the verifier was right does not move the score. Section 24.9. **Cell D — a wrong acceptance — is still empty after 100 trials, so the 2×2 is not closed and cell C rests on n=3.** Getting there needs evidence designed to look relevant without answering, not more runs. **[2026-10-13] These figures are from a superseded snapshot (97 rows, 87 scorable). The committed data has 100 rows, 90 scorable: cell A n=40, mean 0.2485, AUC 0.9792, re-scored by hand. And 24.9.5 retracts the interpretation: it concludes the 0.980 AUC was an artifact and that "tracks stance" described a planner comparison, so this bullet and the "cell D" question are not standing results. 28.5.**
- **The ablation was never stale**, and the reason matters more than the re-run: it supplies its own inputs and so measures a ceiling, not a capability. Config D has shown parity with the best configuration for months while the live signal scored zero. Section 24.5. **[2026-10-13] The re-run and its artifacts were reverted on `main` by `e31fb58` (`ablation_results.json` is the 2026-08-23 file again); PR #60 restores them.** **[2026-10-20] Back on `main` since #60 merged: `ablation_results.json` and `THRESHOLD_ANALYSIS.md` are byte-identical to `7f78b3f`.**
- **OmniRoute's "~1.62B free tokens" and its "zero credentials" describe disjoint sets of providers** — settled from its own source, not inferred. Section 24.6.
- Docker, GitHub, and dev-server setup are all previously verified working — see Section 4 for exact commands, not re-derived here. **[2026-10-13] Not true of `main`: the dashboard image cannot be built (lockfile deleted), `.claude/launch.json` runs a dead shim and the wrong port, `.env.example` is blank. PR #60 restores all three, and its CI built both images. 28.3, 28.7.** **[2026-10-20] True of `main` again since #60 merged: the lockfile, the working `launch.json` (`python -m uvicorn`, dashboard on port 3000) and the populated `.env.example` are back, byte-identical to `7f78b3f`. The VM built its images from #63's tree (28.11), and the backend and worker again from `a73c99a` (28.12).**
- **`main` was overwritten by `e31fb58`, and an unmerged branch already undoes it.** PR #60 (Section 26) restores the experiments, the alert withdrawal, the pipeline fixes, `tool_claims_found` and the lockfiles, removes the mock data, and adds `demo/chat_server.py` and release packaging. Section 28. **[2026-10-20] That branch was merged at 07:34 UTC (`c45be66`), so `main` no longer carries `e31fb58`'s removals; the RAG view's fabrication paths 3–6 remain (28.4).**
- **The 34-turn drift probe was weaker than first written.** The verifier's pre-switch value was already over the 0.30 threshold (7 of 11 windows) and `DRIFT_DETECTED` fired seven minutes before the topic changed; the chatbot retrieved with a character hash, not the embedding model. Section 27.
- **The RAG chat view has six fabrication paths, two of them on every branch:** a `0.942 / SUPPORTED` grounding stamp on any turn whose evaluation never arrives, and invented drift past 32 spans. Do not demo it as live telemetry. 28.4.

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
- `gh` CLI authenticated as `Soum-Code`. Repo: `https://github.com/Soum-Code/agentpulse` (**public** and MIT-licensed since no later than 2026-09-12, Section 18.8 — **[2026-10-13]** this line said "private" and was wrong from then on; confirmed with `gh repo view`).
- `kaggle` CLI authenticated as `somnath26` via `~/.kaggle/kaggle.json`.
- Dev servers via `.claude/launch.json`: `agentpulse-backend` (uvicorn, port 8000), `agentpulse-dashboard` (vite, port 5173). `dashboard/.env` (gitignored) needs `VITE_API_KEY=change-me-to-a-secure-key` for any local write action to work (curate-case, etc.) — recreate it if missing after a fresh checkout. **[2026-10-13] On current `main` neither launch entry works.** The backend entry runs `.venv/Scripts/uvicorn.exe`, a console-script shim with a stale path that exits 1 and binds nothing on this machine (`python -m uvicorn` works), and the dashboard entry declares port 5173 while `npm run dev` serves **3000** (5173 is the Docker/nginx port). PR #60 restores the working entries. **[2026-10-20] Fixed on `main` since #60 merged: the backend entry runs `python -m uvicorn` and the dashboard entry declares port 3000.**
- `scripts/e2e_dashboard_demo.py` pushes a real mixed-risk trace through the actual SDK — the standard way to get real data into a fresh dashboard for testing, rather than trusting whatever's already in the DB. **Note:** it stamps every span with the *same* `start_time` (line 38), which is unrealistic — the real SDK stamps each span separately. This masked an ordering bug for a while; see Section 7.
- Docker (`docker compose up --build`) was verified working end-to-end earlier in the broader session; 4 real bugs were found and fixed then (missing README in build context, CUDA-bloat torch index, SQLite URL slash count, WAL mode needing a named volume on Windows). Not re-verified this session, but nothing since should have broken it. **[2026-10-13] Something since did.** `e31fb58` deleted `dashboard/package-lock.json`, while `dashboard/Dockerfile` (`COPY package.json package-lock.json .`) and `deploy/huggingface/Dockerfile` (`COPY dashboard/package.json dashboard/package-lock.json ./`) still copy it: a build from `main` fails at that `COPY`. PR #60 restores it, and its CI built both the backend and dashboard images. **[2026-10-20] `dashboard/package-lock.json` is back on `main` (#60), and the VM has since built its images from #63's tree and from `a73c99a` (28.11, 28.12).**
- Test suite: `pytest tests/ -q` — **209/209 passing** as of 2026-08-28. **Runtime is now ~2m30s, not 2.3s**: the durability, migration and inference-backend suites spawn real subprocesses and load real models, because the failures they guard against (SIGKILL mid-job, a migration that only breaks on first use, a silently degraded backend) are invisible to in-process tests. Slow on purpose. **[2026-10-13] The count is stale.** 290 tests pass on PR #60 (4m45s); 260 collect on `main`. Later sections quote 226 (2026-09-15), 237 (09-16; the "269" in 20.5 is a typo for it) and 260 (09-17); at `7f78b3f`, before `e31fb58` deleted two suites, 269 collected. **[2026-10-20] `main` now collects 293: #60's 290 plus #56's three. The first CI run of the suite on `main`, after #65 merged, passed 292 and failed 1 (28.12).**
- **Reading the HuggingFace corpus without downloading 231 MB:** `pyarrow` cannot read `https://` directly. Use `huggingface_hub.HfFileSystem` + `pyarrow.parquet.read_table(fh, columns=[...])` — column projection over range requests. Project the cheap run-level columns to locate a target cell, then read the huge `spans` column from only the shards that contain it. The datasets-server `/statistics` endpoint returns a permission error for this dataset; `/rows` works.
- **Two SQLite DB files exist and they are not the same one.** `./data/agentpulse.db` and `./backend/data/agentpulse.db`. The path in `.env` is relative (`sqlite+aiosqlite:///./data/agentpulse.db`), so which one the backend uses depends on its working directory — as launched, it writes to **`backend/data/agentpulse.db`**. Query that one when verifying, not the root one. This cost real debugging time once. **[2026-10-13] Backwards.** The populated database is the root-relative `./data/agentpulse.db` (backend started from the repo root with `--app-dir backend`, which is how `launch.json` starts it, and what 24.10 says). `backend/data/agentpulse.db` is the empty one: it is what a process started *inside* `backend/` opens — typically `python -m app.worker` — and that process then dies with `no such table: evaluation_jobs`. Query the root one, and start the worker from the repo root.
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
- The ingest API requires `X-API-Key: change-me-to-a-secure-key` (from `.env`); requests without it get a 401 with no other clue. **[2026-10-13] The value is right; the stated source is not `.env`.** Nothing under `backend/app` calls `load_dotenv` — the default lives in `config.py` and `.env` is read by `docker compose` (`env_file`). `e31fb58` replaced `.env.example` with a version whose 23 keys all have empty values, so the documented `cp .env.example .env` (README, STARTUP_GUIDE, deploy READMEs) yields empty `AGENTPULSE_PORT`, `AGENTPULSE_DATABASE_URL` and `AGENTPULSE_API_KEY`; what the backend does with those was not run here (a finder reported it fails at import). PR #60 restores the populated file. **[2026-10-20] The populated `.env.example` is back on `main` (#60), byte-identical to `7f78b3f`.**

---

## 5. Open question, never resolved: branch/PR workflow vs. direct-to-main

This repo has only ever had a `main` branch; every commit across every session has gone directly to it. A system-triggered PR-creation flow once asked for a PR from `main`, which isn't possible without a second branch to diff against. The user was asked whether to start using feature branches going forward and has not yet answered either way. Keep committing directly to `main` unless told otherwise; don't assume.

**[2026-10-13] Answered by practice, never recorded as a decision.** Pull requests began with #1 (merged 2026-09-01) and #2–#3 (09-06); ten commits then went straight to `main` between 09-10 and 09-14; from #4 (09-14) every change except `e31fb58` came through a PR. #1–#55 are merged; #56, #57, #58 and #60 are open and #59 was closed as a duplicate. **[2026-10-20] #56 and #60 are now merged and #57 and #58 closed unmerged; #61–#66 followed, all through PRs, and only #64 is still open.** "Keep committing directly to `main`" is no longer the rule. The exception is the writer nobody was tracking: `e31fb58` (28.2). Branch protection is still not enabled.

---

## 6. Immediate next steps, in likely priority order

The recommendation given to the user, and the reasoning, is in Section 9. Short version:

1. ~~Diagnose drift~~ — **done, and fixed.** See Section 10.
2. ~~Test the tool-claim validator on the external corpus~~ — **done, and the result was worse than expected.** See Section 11.
3. ~~Redesign tool-claim extraction~~ — **attempted and blocked on labelling, not engineering.** See Section 12. Restarting it means first making the labelling question well-posed (§12.4), not rewriting the extractor. Do not ship on firing-rate alone (§12.5). **[2026-10-13] Overtaken.** 18.4 shipped an ingest-path fix; 25.3 showed `COUNT_PATTERNS` is digit-only and extracts nothing without prompt-dictated phrasing; 25.5 decided to keep the alert and to record coverage as `tool_claims_found`. `e31fb58` removed that column, its migration and its tests from `main`; PR #60 restores them (28.3). **[2026-10-20] Back on `main` since #60 merged. On Azure the column was already there at the 28.11 deploy.**
4. ~~Install Phoenix and audit the competitive claims~~ — **done, for Phoenix *and* MLflow, and two claims were refuted.** See Section 13. What remains unaudited is Datadog, which is not installable; and neither audit measured *quality*, only existence and runnability.
5. ~~Externally validate inter-agent disagreement~~ — **done, and it failed.** Section 14. Three for three.
6. ~~Correct `DRIFT_EXPERIMENT_REPORT.md` §3~~ — **investigated, and the premise was wrong.** §3 is correctly scoped and already carried a correction notice; the misremembered error was in the real-text diagnosis and had been fixed there. **The real hazard was the regeneration trap**, which was live: `drift_scenarios.py` rewrote the curated report from a template that still contained all three documented errors. Fixed in `78697c5`.
7. ~~Decide what to do with the uncommitted dashboard work~~ — **reviewed and checkpointed** (`8a93558`). Three gaps recorded for the dashboard phase; see Section 15. **[2026-10-13] Closed in Section 16; the dashboard was then replaced wholesale (18.2).**
8. **Re-run ablation Configs D, E and F.** Still open, and now more stale: `ablation_results.json` is dated 2026-08-23, before the disagreement rewiring, the drift rebuild, and the ONNX fix that halved NLI latency. The dashboard displays these numbers. **[2026-10-13] Done 2026-09-18 (24.5: every classification bit-identical) — then reverted on `main` by `e31fb58`; PR #60 restores the re-run.** **[2026-10-20] Back on `main` since #60 merged, byte-identical to `7f78b3f`.**
9. Whenever picked up: the branch/PR question (Section 5) and the standing `gradient-text` hook suppression (Section 2) are both one-line user decisions away. **[2026-10-13] The branch/PR half is answered (Section 5). The `gradient-text` half is moot: no such class exists in `dashboard/src` since the dashboard was replaced in 18.2.**

### What is actually next

1. **Capability tiers** — published in Phase 0 (drift Beta, grounding Beta, disagreement Experimental, tool-claim Experimental). Nothing measured since has changed them, so this is a re-confirm or a skip.
2. **Dashboard, last** — the remaining work. It now has considerably more real data available than when it was frozen: `/v1/platform`, `/v1/health` readiness, worker fleet state and queue depth are all live endpoints that did not exist when that UI was written.
3. **The disagreement research question**, if the project wants to keep pulling that thread: how to distinguish true contradiction from legitimate disagreement caused by partial evidence (§14). Do **not** improve claim extraction before answering it — that optimises the wrong objective.

**[2026-10-13] This "What is actually next" list is superseded.** The dashboard is no longer "the remaining work" (unfrozen in 16, replaced in 18.2, de-faked in 21–23, found faked again in 28.4), and the capability tiers it says to re-confirm rest on bases that 24.9.5 and 25 removed. What is actually next, and which items are the owner's decision, is in 28.9.

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
- [x] no DB migration story — *Alembic, baselined and tested.* **[2026-10-20] True of the code and the local database. The Azure database has no `alembic_version` table: its schema comes from `create_all`, and 28.12's two columns were added by hand with `ALTER TABLE` (21.6, 28.12).**
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
| Migrations | `3ba2bb2` | schema under Alembic at `60a86ca23d8c`; 43,941 rows verified byte-identical after stamping. **[2026-10-20] That was the local database; the Azure one has no `alembic_version` table (21.6, 28.12).** |
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
| "evaluated on CPU in ~27.8ms" | 27.8ms is Config A, the embedding gate alone. Full cascade is 215.9ms [2026-10-22: stale. The current ablation (2026-09-18) has MiniLM 19.1, DeBERTa 132.09, cascade 151.19 ms; see 29.10.2] |
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
- **Migration state is inconsistent on the live database.** **[2026-10-20] "Live" here means the local `./data/agentpulse.db`. The Azure database has no `alembic_version` table at all (21.6, 28.12).** `alembic_version` reads
  `8d86fee0d663` while the schema already has both `worker_heartbeats` and
  `window_centroid_distance`. `alembic upgrade head` therefore fails with a duplicate
  column. Reconcile with `alembic stamp c4b7e91a2f08` before running migrations again. **[2026-10-20] Out of date; see the note in 19.10.**
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
  duplicate column. Reconcile with `alembic stamp c4b7e91a2f08` first. **[2026-10-20] Out of date; see the note in 19.10.**
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
  `upgrade head`. **[2026-10-20] Out of date; see the note in 19.10.**
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
| shipped | **215.90 ms** [2026-10-22: the 2026-08-23 run; now 151.19, see 29.10.2] |

215.90 is their sum. A gate that ever fired would land between them. [2026-10-22: the sum identity holds by construction and never proved the absence of a gate; now 19.10 / 132.09 / 151.19, see 29.10.2]

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
  any `upgrade head`. **[2026-10-20] The stamp target is out of date. `30ca7751ff88` (added 2026-09-17) creates `api_keys` unconditionally, and the local `./data/agentpulse.db` still reads `8d86fee0d663` but already has `api_keys`, so stamping `c4b7e91a2f08` and upgrading would fail on that table. Stamp `30ca7751ff88` instead; `upgrade head` would then add `tool_claims_found` (`a7f2c3d9e104`) and the two grounding columns (`b8e4d1c72f35`), none of which that database has. Until they exist, `main`'s backend should be expected to fail when it reads evaluations there. None of this was run: it comes from the migration files and a read-only query of the database.**
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
  has simply not been built. **[2026-10-20] No longer true. `.github/workflows/release.yml` has been on `main` since #60 (SDK tests and image builds on pull requests that touch the backend, dashboard or SDK; publishing on `v*` tags), and `tests.yml` since #65 (12:26 UTC), which runs the backend suite on pull requests and on pushes to `main` that touch the backend, demo, tests, SDK, adapters or reasoning code. Its first run on `main` passed 292 of 293 tests (28.12). The contradiction-rate gate has still not been built.**
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
created            ap_live_<12 hex>_<secret not shown>
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
applying by hand, and the version table reconciling first. **[2026-10-20] That has now happened on the VM: `tool_claims_found` was on the live database by the 28.11 deploy (how it was added is not recorded), and the two `b8e4d1c72f35` columns were added with `ALTER TABLE` in 28.12. The version table was still not created or stamped.** That is now two
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
| `54.2 ms` | 215.9 ms [2026-10-22: 215.9 is the 2026-08-23 run, see 29.10.2] |
| `99.98%` | F1 0.963 |
| `14,280 spans/s` | no measured throughput exists |
| `16 Swarms Active` | hardcoded -- the same defect as the "4 active swarms" fixed in `AgentsView` during 19.x |

Replaced with what is true, and the badge now reads `ILLUSTRATION`.

**A smaller one, worth recording because it is the opposite mistake.** The hero
read `< 4.2ms Ingestion`. `experiments/results/latency_profiles.json` measured
`8_http_ingestion_overhead` at mean 0.981 ms, p99 1.124. So 4.2 was not false -- [2026-10-22: layer 8 is `0.85 + rand*0.3`, a random number and not a measurement; see 29.10.2]
1.124 is under 4.2 -- but it came from nowhere and understated the result about
fourfold. The page also disagreed with itself: two places further down already
read "Sub-1.2ms Fanout". Somebody had the right number and the hero kept an
older one. Now `< 1.2ms`. [2026-10-22: unsupported, see 29.10.2]

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

> **[2026-10-13] Section 24 describes `7f78b3f` and PR #60's tree — not current `main`.** `e31fb58` (28.2) removed or reverted much of what it points at: `experiments/refusal_disagreement.py`, `experiments/paraphrase_stability.py`, their result JSON and reports; the 24.5 ablation re-run and its limitation text; `demo/multi_model_pipeline.py` (back to the form 24.1–24.3 and 24.8 describe as broken); `.claude/launch.json`; `.env.example`. All of these exist byte-for-byte on PR #60; none exists on `main`. Where a number below cites a file path, check it exists on the branch you are on. **[2026-10-20] No longer true: #60 merged at 07:34 UTC, so all of these are on `main` again. The result JSON, `ablation_results.json`, `THRESHOLD_ANALYSIS.md`, `launch.json` and `.env.example` are byte-identical to `7f78b3f`; the two experiment scripts and `demo/multi_model_pipeline.py` differ from it only in #62's comment lines.**

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

Latency did move, 188.1ms to 132-135ms on Config B across three runs, so it is [2026-10-22: only 188.07 and 132.09 exist in git; see 29.10.2]
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

**[2026-10-13] Denominator corrected.** 34 is the number of paraphrases *generated*; 2 were discarded, so 32 were scored on 2 signals each — 64 pairs — and **10 of 64** flipped: disagreement 7 of 32 (the table's 1+3+1+2+0) and contradiction 3 of 32. Counted by paraphrase, 9 of 32 flipped on at least one signal. Re-derived from `paraphrase_stability.json` at `7f78b3f`. Not stated above: all three acceptance anchors come from the same query ('transformer multi-head self-attention'), so they are less independent than the table's three rows suggest (finder, not re-run).

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
occurrence neither can the logs. **[2026-10-20] Closed on `main` by #56 (`a73c99a`, 25.6, 28.12).**

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

**[2026-10-13] Two caveats on 25.3 (read from the stored outputs; not re-run).** First, the 0 of 9 follows partly by construction: removing the dictated sentence also removes the only digit-count phrase in each output. The nine split three ways — three used the word form ('I retrieved three documents…') and then appended the dictated line; three wrote their own sentence with no count at all; three consisted of the dictated sentence plus a trailing clause, so after removal two are empty and the third is a fragment (the regex stops at 'e.g.'). The informative cases are the six outputs with prose left, not nine. Second, the mechanism contradicts Section 11. That section says the zero extractions on the 8,353 external spans come from agents not narrating tool use in text at all — the invocation is a `tool_call` field, so 'expanding the regex cannot fix this'. 25.3 explains them with a digits-versus-words mismatch, on nine outputs from this repo's own demo rather than on the external spans. Both can be partly true; 25.3 does not establish that the digit-only regex is *the* cause of Section 11's zeros, and the raw spans are not in the repo to test it. The nine outputs live in `experiments/results/refusal_disagreement.json`, which `e31fb58` deleted from `main` (PR #60 restores it). **[2026-10-20] Back on `main` since #60 merged, byte-identical to `7f78b3f`.**

### 25.4 Where that leaves the four signals

| signal | status |
| :--- | :--- |
| drift | robust to paraphrase; the strongest of the four, consistent with Section 13 |
| grounding | stable on acceptances, erratic on refusals (24.9.3); truncation not triggered here but unrecorded when it is **[2026-10-20] recorded on `main` since #56 (25.6, 28.12)** |
| tool-claim | extracts only when the prompt dictates the format; 0 of 9 otherwise |
| disagreement | measured performance was an artifact; alerting withdrawn (24.9.5) — **[2026-10-13] at `7f78b3f` and on PR #60; live on `main` (28.3)** **[2026-10-20] withdrawn on `main` too since #60 merged** |

Two of four have performance that comes from the harness rather than the signal,
and in both cases the earlier external-validation failures — Section 11 for
tool-claim, Section 14 for disagreement — now have mechanisms rather than just
results.

**Not claimed:** that grounding and drift are validated. Neither has been tested
against independently labelled production data in this session; they have only
been shown not to fail in the specific way disagreement failed. Section 14's
"three for three" record stands, and this section explains two of the three
rather than overturning any of them.

### 25.5 The tool-claim decision, and why it differs from disagreement

> **[2026-10-13] Status — read before the rest.** 25.5 and 25.6 were written on PR #57 (`docs/handoff-25-5`, open, conflicting) and are folded in here from there. **Their code is not all on `main`.** 25.5's change was merged as #55, then removed by `e31fb58` (28.3): on current `main` `tool_claims_found`, its migration `a7f2c3d9e104` and `tests/test_tool_claim_coverage.py` are gone, and the `AGENT_DISAGREEMENT` alert that 25.5's table calls *withdrawn* is live. **PR #60 restores them.** 25.6's change is PR #56, which was never merged and now conflicts, so `grounding_input_truncated` exists on no merged branch. **[2026-10-20] #60 was merged at 07:34 UTC, so `tool_claims_found`, `a7f2c3d9e104` and `tests/test_tool_claim_coverage.py` are on `main` again and the alert is withdrawn there; #57 was closed unmerged at 07:39 UTC; #56 is now merged (`a73c99a`) and running on Azure (28.12).** The reasoning below is unchanged; its present tense describes `7f78b3f` for 25.5 and PR #56's branch for 25.6. **[2026-10-20] Both now describe code that is on `main`.**

Both signals failed external validation. They needed opposite responses, and the
reason is worth stating because "two signals failed, remove both" would have
been the wrong call.

| | disagreement | tool-claim |
| :--- | :--- | :--- |
| when it fires | **wrong** — the score measures noise | **right** — verified both directions |
| the fault | the signal itself | its applicability |
| decision | alert **withdrawn** (24.9.5) | alert **kept** |

Tool-claim was checked in both directions before deciding. A stub claiming five
documents against a tool that returned three raises `TOOL_CLAIM_MISMATCH`; a
retriever that counts honestly stays silent. True positive and true negative,
both observed. A precise detector with narrow reach is worth keeping — the harm
was never a false alarm.

**What was actually broken was its silence.** `tool_claim_score` is 0.0 both
when every claim checked out and when there was nothing to check, and per
Section 11 the second is almost always the case in production. `total_claims`
was computed and then dropped on the way to the database, so nothing recorded
which of the two a 0.0 meant.

It is now persisted as `tool_claims_found` — `None` when the validator did not
run, `0` when it ran and found nothing, `N` when it checked N claims. Verified
live: three spans sharing one tool result produce `(0.0, 1)`, `(0.0, 0)` and
`(1.0, 1)`.

**Broadening `COUNT_PATTERNS` was considered and rejected on evidence.** The
obvious fix is word-numbers, since the models in 25.3 wrote "I retrieved three
documents" unprompted and the regex is digit-only. But Section 11's corpus shows
agents do not narrate counts in *any* form — the prose is "First, I need to log
into the file system application" — so "three" versus "3" is not the binding
constraint. `tests/test_tool_claim_coverage.py` pins that limit as a documented
property rather than asserting it is correct.

**The general rule this produced:** a green signal that means "I did not look"
is worse than no signal, because it is read as assurance. Wherever a score can
be produced by absence as well as by success, the two have to be distinguishable
on the row. 25.6 is the same fault in grounding.

**Still owed:** the coverage claim. Tool-claim is presented in positioning and
on the dashboard as a general capability, and its reach on real traces is
roughly 2% of tool calls and 0 of 8,353 prose spans. Persisting the count makes
the gap visible in the data; it does not correct what the product says about it.

### 25.6 The same fault in grounding, fixed the same way

> **[2026-10-20]** Merged as #56 (`a73c99a`) and deployed the same day; see 28.12.

`compute_nli_grounding` measures whether the premise exceeded DeBERTa's
512-token window and stores the answer on its result object. The runner surfaced
it as a `logger.warning` fired **once per worker process** and then dropped it
before writing the row. After the first occurrence, nothing recorded that a
score described only the part of the evidence the model read.

That is 25.5's fault exactly: a value the evaluator knows, discarded on the way
to the database, leaving a number nobody can audit. Now persisted as
`grounding_input_truncated` and `grounding_input_tokens`.

Not currently triggered here -- 25.2 measured 100 comparisons at 209-288 tokens
against a 512 limit -- but a production retriever returning longer documents
crosses it, and that is precisely when nobody is reading worker logs.

**A test double had drifted, and finding out took a baseline run.** Adding the
two fields failed four durable-queue tests, with jobs stuck in `queued` and no
evaluation written. `StubGrounding` in `_queue_harness.py` carried five fields
while the runner persists seven. The failure was confirmed against `origin/main`
before being diagnosed, rather than assumed pre-existing -- main passes 12/12,
so it was this change.

**The runner reads those fields directly rather than through `getattr`
defaults**, and that is deliberate. A `getattr` default would turn a genuinely
missing field into a silent `None` in the database, which is the precise
pattern that produced a fabricated result in 24.9.1. Failing the job loudly is
correct; the cost is that the stub has to keep up, which is a fair trade.

---

## 26. e31fb58 overwrote #50-#55, and the chat interface got a real backend (2026-10-01)

### 26.1 What e31fb58 was

Commit `e31fb58` is titled "remove tool claim tracking and alerting" and its
message describes only that. Its tree is 48 files, +3,609/-12,482, and it
predates #50 through #55. Among other things it:

- cut the handoff back to Section 23 and rewound its header to 2026-08-27
- deleted the paraphrase-stability and refusal-disagreement experiments, their
  reports and result files
- turned the `AGENT_DISAGREEMENT` alert back on after 975717f withdrew it
- dropped `tool_claims_found`, its migration, and its tests
- restored the 2026-08-23 ablation results over the 2026-09-18 ones, and emptied
  `.env.example`
- deleted both dashboard lockfiles
- made `useTelemetry` fall back to `MOCK_*` data and report `connected: true`
  when the API was unreachable, so a dead backend rendered as a healthy fleet
- added a Vite dev plugin answering `/v1/*`, `/chat` and `/corpus` with invented
  data
- put four removed claims back on the public page: a GitHub Action CI gate, a
  16MB ring buffer, consensus voting, and the withdrawn alert

It reads as a stale working tree committed over `main`, not as a decision. Soum
confirmed it was not intended. Restored in `27a5f25` (everything outside
`dashboard/src`) and `3186f75` (the dashboard regressions above, plus the root
`package.json` and `metadata.json`, which are AI Studio scaffolding that nothing
reads and whose npm workspace would shadow `dashboard/package-lock.json`).

**Standing fact:** a commit whose message covers 2 files and whose diff covers 48
is not what the message says. Check `git show --stat` before building on top of a
commit that arrives from a different tool's working tree.

### 26.2 The chat interface now has a backend

`e31fb58` also carried a RAG chat view (`dashboard/src/components/rag/`) that
calls `POST /chat` and `GET /corpus` on `localhost:8100`. Nothing in the repo
served that port, and when it was unreachable the view fell back to
`simulateSequentialTurn`, which returns a hardcoded SQLite answer with invented
cosine scores. `demo/chat_server.py` is the service it was waiting for:

    uvicorn demo.chat_server:app --port 8100

Three agents, three models, one span each, one trace:

| agent | does | span carries |
| :--- | :--- | :--- |
| retriever | real `local_retriever` search, then the model describes it | the index's real result as `tool_result_summary` |
| verifier | does the evidence answer the question | the evidence as `input_summary` |
| answerer | answers from the evidence only | the evidence as `input_summary` |

Decisions worth knowing:

- **No credential means 503, never an invented reply.** The body names the
  variable to set. A failing model or an empty completion is 502 with the agents
  that did run and the trace id, and the failed span is recorded as an error.
- **The retriever is not told what phrasing to use.** `multi_model_pipeline.py`
  dictates "Retrieved N documents", which is what the tool-claim extractor
  matches (25.3). The chat lets the model word it, so the tool-claim signal here
  scores what the model wrote. Expect it to extract little: `COUNT_PATTERNS` is
  digit-only.
- **Models are the pipeline's:** the answerer uses the pipeline's `analyst`
  model. `CHAT_PROVIDER`, `CHAT_MODEL_<AGENT>` and `CHAT_BASE_URL` override them,
  and any OpenAI-compatible endpoint works.
- **Stateless.** `session_id` is echoed and nothing keys on it.

**Verified:** 21 unit tests (`tests/test_chat_server.py`) against a recording
fake client, and a live run of the real `openai` client through uvicorn against a
local stub OpenAI-compatible server: three agents in order, real retrieved
titles, trace id, 503 with no key, 422 on an empty message.

**Not verified:** any run against a real model. No provider key was available in
this session, so what the three agents actually say, and what the evaluator then
scores, is unobserved. The retrieval for "What is self-attention?" returned the
attention paper plus an SQLite-WAL document and a telemetry-KPI document, because
the corpus mixes domains and top-3 always returns three; the answerer is told to
say so when evidence does not cover the question, and whether it does is
untested.

### 26.3 Left alone on purpose

The chat view itself (`RagChatbotApp.tsx`, `ragApi.ts`, `MonitoringPanel.tsx`) is
unchanged, by instruction. It still contains `simulateSequentialTurn`, a default
corpus of SQLite titles, and a fallback that stamps `groundingScore: 0.942,
SUPPORTED` after 30 seconds without an evaluation, and writes fixed drift values
once 32 spans are counted. Those are fabricated numbers presented as measured.
Until they are removed, **do not demo that view as live telemetry**, whether or
not this server is running.

---

## 27. The 34-turn probe, and the first measured drift (2026-09-20/21; record corrected 2026-10-13)

This is the "Section 26" of PR #58, renumbered because the Oct-1 branch already has its own Section 26 above. It records a measurement. The chatbot that produced it, `demo/chatbot/app.py`, exists only at commit `fe3e30b` on branch `fix/no-mock-fallback` (PR #58); it is **not** on `main` and **not** on the Oct-1 branch (PR #60), which carries a different chat service, `demo/chat_server.py` (26.2, 28.1). Corrections found by the 2026-10-13 audit are written into the text rather than added after it.

### 27.1 The chatbot used for the probe

`demo/chatbot/app.py` serves `POST /chat` and `GET /corpus`: three agents on three models, one trace per turn. The answerer carries the retrieved text as `input_summary` and its reply as `output_summary`, the pair `evaluate_grounding` compares. Errors return HTTP 200 with an `error` field and whichever agents completed, with the real trace id (so, unlike `chat_server.py`, there is no 502/503, no `/health` and no input validation).

First real turn, end to end:

    retriever  mistralai/mistral-nemotron     56.1s
    verifier   meta/muse-glimmer-30b           2.2s
    answerer   deepseek-ai/deepseek-v4-flash   7.5s

    3 spans sent, 3 evaluated, grounding 0.052 / 0.040 / 0.494

**Those three models are that first smoke turn, not what is committed.** `AGENT_MODELS` in `app.py` is retriever `nvidia/nemotron-3-super-120b-a12b`, verifier `meta/muse-glimmer-30b`, answerer `nvidia/nemotron-3.5-lightning-30b-a3b`: two of three from one family, which the file's own comment concedes is wrong for disagreement and acceptable for drift. **The 75 s timeout is per attempt, not per call.** The OpenAI client keeps its default `max_retries=2`, so a hung call can take about three times that plus backoff; the probe recorded one at 226 s, which is why 27.3's "between 9 and 247 seconds" is wider than 75 s suggests.

**Model volatility is worse than 24.7 recorded.** Over roughly two hours, on the same key:

| model | observed |
| :--- | :--- |
| `google/gemma-4-31b-it` | answered the 24.8 scan, then hung indefinitely -- 90s, no response, no error |
| `z-ai/glm-5.3-flash` | same, later the same day |
| `mistralai/mistral-nemotron` | 56s, then over 75s, then 26.9s |
| `deepseek-ai/deepseek-v4-flash` | 4.4s, then 7.5s, then 30.8s |

24.7's rule was "listed is not served". This adds a third state: **served, then not**, within hours, with no error to tell it from slowness. Two consequences were engineered for: a 75 s request timeout, because the three calls are sequential and a hung provider takes the whole turn and shows as a spinner; and model choices re-measured rather than carried forward.

`/corpus` also returned `{"documents": []}` because the attribute is `corpus`, not `documents`. It answered 200, so a frontend would have rendered "no corpus" rather than a fault.

### 27.2 Drift, measured against real traffic

34 turns, deliberately split: 17 on-corpus questions the six documents can answer, then 17 off-corpus ones they cannot. Sending 34 similar questions would have filled the windows and proved only that a counter increments; drift exists to detect a change, so there had to be one. 33 turns succeeded, one timed out, 46 minutes.

**Drift produces values. It had never been given the chance.**

| agent | drift rows | with a window value | max |
| :--- | ---: | ---: | ---: |
| verifier | 58 | 28 | 0.4261 |
| retriever | 57 | 17 | 0.1073 |
| answerer | 36 | 4 | 0.5142 |

Earlier in the same session the same agents had 33-34 rows and **zero** window values, which looked like the signal being broken. It was not. The window needs 20 baseline samples plus 12 current ones; the baseline pool is persisted (16.3's fix) and **the current pool is in-memory by design**:

> "The current window is deliberately left empty: it holds the most recent outputs, and outputs from before a restart are no longer current."

That reasoning is sound. Its consequence had never been stated: **after every worker restart, every agent needs 12 fresh spans before `window_centroid_distance` returns anything at all.** The worker was restarted several times during the session, which is why 33 spans produced nothing. It is not a bug, and it is a real operational property: every deploy, crash or restart blinds the signal alerting depends on, per agent, until traffic re-warms it.

**Did it detect the shift? Not in a way this run can show.**

| agent | before the switch | after |
| :--- | :--- | :--- |
| verifier | n=11, mean **0.305** (7 of 11 above 0.30) | n=17, mean **0.396**, 17/17 above 0.30 (range 0.345-0.426) |
| answerer | n=0 | n=4, mean 0.502 |
| retriever | n=0 | n=17, mean **0.093**, 0/17 above 0.30 |

*The earlier text of this section said the verifier's pre-switch mean was 0.306 and that it "detected the shift, and detected it correctly". Recomputed from the evaluation database on 2026-10-11 and checked again by an independent audit on 2026-10-13:*

- The verifier's mean did rise, by about 0.09, across the switch (21:41:27 on 2026-09-20).
- But the value was **already over the threshold before the topic changed**: 7 of the 11 pre-switch windows exceed 0.30, and the climb from 0.18 settles at 0.32-0.38 (its last seven pre-switch values are all above 0.30).
- The alert agrees: the first `DRIFT_DETECTED` for the verifier fired at **21:34:02, distance 0.378, seven minutes before the switch**; the next at 21:49:16 (0.408), and one for the answerer at 21:57:23 (0.479).

So this run shows that drift values exist and move, and that the mean rose across the boundary. It does **not** show a signal that separated "before" from "after": a 0.30 alert was already firing before the questions changed.

**The retriever did not move, and the usual explanation is incomplete.** Its output barely changes with the question ("three documents were retrieved, covering X, Y and Z"), and the corpus is the same six documents regardless of what is asked. But the chatbot process never calls `load_models`, so `get_embedding()` returns `None` and `LocalVectorIndex` falls back to a character-count hash of the first 64 characters (`demo/workflows/retrieval.py` lines 89-135, `emb[ord(char) % 384] += 1.0`). Retrieval in the 34-turn run was character matching, not semantic search; the 17 "on-corpus" questions were not guaranteed to retrieve what they were about, and the retriever's stable output says as much about that index as about the corpus. How often the right document came back was not re-measured; each turn reports the titles it retrieved.

**Only the verifier has data on both sides of the switch.** The retriever and answerer have no pre-switch window values, because their windows filled after the boundary, so this run cannot compare before with after for those two at all.

### 27.3 What this settles, and what it does not

The question was "is AgentPulse actually monitoring a live conversation, or does it only look like it is". For grounding and drift the answer is now yes in the sense that matters here: 33 conversational turns, 99 spans, evaluated scores, and drift values that moved. It does not say the scores are correct; that needs labelled data, which is what 24.9 and 25 were for. It says the machine runs.

One qualifier: the measured drift values are in AgentPulse's database and behind `/v1/drift`. The RAG chat view's own drift column is **not** a view of them. Past 32 spans it shows constants (28.4).

Two things it surfaced that no dashboard would have:

- **drift is blind for 12 spans per agent after every restart**, which in a demo is most of the demo and in production is every deploy
- **the free tier's latency moves by an order of magnitude within an hour**, so a turn costs between 9 and 247 seconds with no way to predict which

Open: the retriever and answerer still have no before/after comparison, and getting one means a second run of this length without a restart in the middle, with the embedding model loaded.

---

## 28. State of the repository as of 2026-10-13, and what the earlier sections no longer say

Every earlier section was written against whichever branch its session was on. This one was written by checking the file against `origin/main`, every open and closed PR, every remote branch, GitHub's repository settings and the working tree. **It supersedes the Section 27 that PR #58 carries**, which was written first, missed the Oct-1 branch, and was then corrected by an adversarial audit of its 214 checkable statements (132 held, 50 were overstated, 14 unsupported and 18 wrong; several of the 18 became wrong only because PR #60 was opened and #59 closed after the text was written). Those corrections are folded in here.

**"Checked" has grades.** *By hand*: re-read, re-counted or re-scored in this pass. *Audit*: confirmed by an independent agent that did not see the first agent's command. *Finder*: reported by an automated read of the old handoff, not independently confirmed. All 106 findings of the first pass, with the skeptic verdicts (103 confirmed, 3 refuted: D-11, D-30, C22), are in [`HANDOFF_AUDIT_2026-10-10.md`](HANDOFF_AUDIT_2026-10-10.md). 28.10 says what was not checked.

### 28.1 Where each thing lives

| ref | tip | state | holds |
| :--- | :--- | :--- | :--- |
| `origin/main` | `e31fb58` (2026-09-21 01:50 IST) **[2026-10-20] `3dea8fc` at 12:30 UTC: `e31fb58` plus the merges of #60, #63, #61, #62, #56, #65 and #66** | — | `7f78b3f` plus exactly one commit. Its `SESSION_HANDOFF.md` ends at Section 23. |
| `7f78b3f` | — | last `main` before `e31fb58` | merged #47–#55: Sections 24–25.4 and everything they cite |
| **#60** `claude/optimistic-knuth-0z7l6z` | `79c2b52` | open, mergeable; ahead 5 / behind 0 of `main`. **[2026-10-20] merged 07:34 UTC as `c45be66`** | the restore of what `e31fb58` overwrote, mock-data removal, `demo/chat_server.py`, release packaging, its own Section 26 (26.1–26.3). Opened 2026-10-13; the commits are from 2026-10-01. |
| #59 `fix/restore-e31fb58-regressions` | `11a1eb1` | **closed unmerged** 2026-10-13 as a duplicate of #60 | six files restored from `7f78b3f`, byte-identical to what #60 holds. Branch kept. |
| #58 `fix/no-mock-fallback` | `7a4786c` | open, built on `e31fb58`; **conflicts with #60**. **[2026-10-20] closed unmerged 2026-10-13 17:37 UTC; branch kept** | `demo/chatbot/app.py` (a second chat service), two `RagChatbotApp.tsx` fixes, the first reconciliation. A trial merge with #60 conflicts in `SESSION_HANDOFF.md` (7 hunks), `useTelemetry.ts` (2) and `vite.config.ts` (2). |
| #57 `docs/handoff-25-5` | `74c7bb3` | open, conflicting. **[2026-10-20] closed unmerged 07:39 UTC; branch kept** | the prose of 25.5/25.6, folded into this file; superseded |
| #56 `fix/grounding-truncation-visible` | `f95d135` **[2026-10-20] rebased; tip `93614b0`** | open, conflicting. **[2026-10-20] merged as `a73c99a`, deployed (28.12)** | `grounding_input_truncated` / `_tokens` persisted (25.6). Never merged before 2026-10-20. |
| `claude/session-handoff-20ykc9` | 2026-08-28, 3 commits | no PR | a frontend clean-slate reset (deletes `SideRail.tsx` and `ui.tsx`, guts `App.tsx`) from before the dashboard was replaced; superseded, not deleted |
| `claude/check-f88a0c` | `b8531b8`, 2026-09-17, 1 commit | no PR | the trace-workspace view 22.9 rescued; built on the pre-#2 dashboard, so it will not apply |
| this document | `docs/handoff-reconcile-on-pr60` | stacked on #60 | retargets to `main` when #60 merges. **[2026-10-20] merged as #61 (`e09659c`, 07:36 UTC)** |

34 remote branches exist; 7 have commits not in `main` (the rows above), 26 are fully merged and were never deleted. *By hand / audit: `git rev-list --count`, `gh pr list --state all`, `git merge-base --is-ancestor`.* **[2026-10-20] Not in the table: #62 (comments), #63 (pins), #65 (backend-test CI) and #66 (this file) were merged; #64 (retriever) is open. `git ls-remote --heads origin` at 12:30 UTC lists 40 branches including `main`: 6 have commits not in `main` (those of #57, #58, #59 and #64 and the two no-PR branches) and 33 are fully merged. This note's own branch came later.**

### 28.2 What `e31fb58` was

`e31fb58` is titled *"refactor: remove tool claim tracking and alerting"*, authored and committed under the repository owner's name, **unsigned, with no PR**, and is **48 files, +3,609 / −12,482**. `main` is `7f78b3f` plus this commit and nothing else. **[2026-10-20] Not since #60 merged; see 28.1's `origin/main` row.** The title describes a small change; the diff is not that.

- **removed or reverted:** the `tool_claims_found` migration `a7f2c3d9e104`, models and runner plumbing; `experiments/refusal_disagreement.py` and `paraphrase_stability.py`, their result JSON and reports; `tests/test_alerting.py` and `tests/test_tool_claim_coverage.py`; `dashboard/package-lock.json`, `dashboard/bun.lock`, `presentation/package-lock.json` and `dashboard/.env.example`; the withdrawal in `alerting.py` (the `AGENT_DISAGREEMENT` HIGH alert is live again); the 24.1–24.3 fixes in `demo/multi_model_pipeline.py`; the 24.5 ablation re-run and `THRESHOLD_ANALYSIS.md`; `.claude/launch.json`; `.env.example` (all 23 values blanked); and `SESSION_HANDOFF.md`, cut back to Section 23.
- **added:** the RAG Live Monitor itself (`dashboard/src/components/rag/*`, `ragApi.ts`, `ragTypes.ts`, `riskTone.ts` and its test, `mockData.ts`, the `agentpulse-mock-api` middleware in `vite.config.ts`, a `MOCK_*` fallback in `useTelemetry.ts` that reported `connected: true`), edits to the public page that put four removed claims back, and a root `metadata.json` and `package.json`. **So the fabrication paths in 28.4 did not predate this commit; they arrived in it.**

**What it was.** The best-supported reading is a Google AI Studio sync push of a stale working tree, and 19 of its 48 files support that directly: they are **byte-identical to `main` at the #46 merge (`469e494`, 2026-09-18 22:19 IST)**, i.e. a snapshot taken before #47–#55 landed. The other 29 are the app's own edits (the RAG UI and its mock layer, the root `package.json`, the lockfile and `.env.example` deletions, four regenerated PDFs). *By hand: `git diff --name-only` of `7f78b3f..e31fb58` against `469e494..e31fb58`, 48 against 29.* That an AI Studio app was imported around 2026-09-19 02:02 IST and that its sync overwrites rather than merges was read in the owner's AI Studio screens during this check; it cannot be verified from the repository, and AI Studio's own logs were not available. The Oct-1 branch's handoff (its 26.1) records "Soum confirmed it was not intended": a Claude session's report of what the owner said, not independently checked.

**It can happen again.** Two AI Studio apps were seen: `agentpulse` (linked to this repository; the likely source) and `AgentPulse` (linked to `Soum-Code/frontend`). The second had 41 changed files waiting on 2026-10-10; its work reached GitHub as the new repository `Soum-Code/Soum-frontend-` instead (28.8). Chat saying "push it" in AI Studio makes only a local commit; the push is the **Push changes to GitHub** button in Settings → GitHub. Do not sync the `agentpulse` app into this repository again without reading its diff.

### 28.3 What is true of `main` today, and what #60 changes

**[2026-10-20] #60 merged at 07:34 UTC, so `main` now matches the "#60" column, plus #63's pins, #62's comments and #56's columns. The middle column describes `e31fb58`.**

| earlier sections say | on `main` today | on #60 |
| :--- | :--- | :--- |
| the `AGENT_DISAGREEMENT` alert is withdrawn (TL;DR, 24.9.5, 25.4) | **live**: HIGH, threshold 0.6 on `disagreement_score`, `alerting.py:299-306` | withdrawn; `tests/test_alerting.py` asserts its absence |
| `tool_claims_found` is persisted (25.5) | **gone** (migration, models, runner, tests); `TOOL_CLAIM_MISMATCH` still exists | restored |
| `grounding_input_truncated` is persisted (25.6) | not on `main` **[2026-10-20] until `a73c99a` (28.12)** | not there either — it is PR #56 |
| the 23.4 pipeline "now works" (24.1–24.3) | the pre-fix form: no `await pulse.start()`, `pulse.shutdown()` not awaited, `max_tokens=320`, no `EmptyCompletion`. An offline harness (stub model client, local stub HTTP server) found it delivering **0 spans** where the restored file delivers **5** | restored |
| the 24.9 experiments, results, reports exist | absent | present |
| the ablation was re-run (24.5) | `ablation_results.json` is the 2026-08-23 17:56 UTC file again | restored |
| `.claude/launch.json` starts the stack | `uvicorn.exe` (a stale console-script shim that exits 1 on this machine's venv) and dashboard port 5173 while `npm run dev` serves 3000 | fixed |
| Docker "verified working" | `dashboard/Dockerfile` and `deploy/huggingface/Dockerfile` `COPY` `package-lock.json`, which is absent: the build fails there | restored; **CI built both images successfully** (28.7) |
| `cp .env.example .env` gives a working config | all 23 values blank | restored |
| `npm run dev` shows real data | `vite.config.ts` has `agentpulse-mock-api` and `mockData.ts` exists (both from `e31fb58`): fixtures | removed |
| 209/209 tests | 260 tests collect **[2026-10-20] 293 now; the first CI run on `main` passed 292, failed 1 (28.12)** | **290 passed** (backend, 4m45s) |
| the repo is private; `main` can't be protected | **public** (no later than 2026-09-12), MIT; `main` has **no** branch protection (API 404) | — |
| `bedhi_frontend.md` holds the design direction | deleted 2026-09-14 in `c6198e3` | — |
| the populated DB is `backend/data/agentpulse.db` | backwards: the populated one is `./data/agentpulse.db`; `backend/data/` is empty | — |

*By hand: file reads at `origin/main` and at #60's worktree, `git grep`, `pytest` on #60, `gh api`.*

### 28.4 The RAG chat view's fabrications

`e31fb58` shipped a RAG Live Monitor that produces a working-looking screen with nothing behind it. Counting the paths that existed:

1. **`vite.config.ts` was a mock API server** (`agentpulse-mock-api` answering `/v1/*`, `/chat`, `/corpus` from `mockData.ts`). *Removed on #58 and #60.*
2. **`useTelemetry.ts` fell back to `MOCK_*` data and set `connected = true, error = null`.** *Removed on #58 and #60.*
3. **`RagChatbotApp` ran `simulateSequentialTurn` when `!ragStatus.ok`**, so a missing backend produced a fake conversation. *Removed on #58 only.*
4. **`RagChatbotApp` invented a trace id** (`'tr_' + Math.random()`) when a turn had none. *Removed on #58 only.*
5. **Invented drift.** `RagChatbotApp.tsx` lines 308–315: once the UI's own count of answerer spans reaches 32 it sets `agentDriftValues` to constants (`answerer: 0.082, verifier: 0.045, retriever: 0.024`); `MonitoringPanel.tsx` then shows "WINDOW FILLED • SUSTAINED DRIFT COMPUTED" (line 397) next to a caption saying AgentPulse "never displays 0.00 when unmeasured" (line 426). *On every line, including #58 and #60.*
6. **An invented grounding score — the worst of them.** `RagChatbotApp.tsx` lines 197–212: the UI polls the trace for the answerer's evaluation, and when its attempts run out (about 31 s) it sets `groundingScore: 0.942` (L204), `groundingLabel: 'SUPPORTED'` (L206) and `groundingEvaluationStage: 'STAGE_2_NLI_VERIFIED'` (L207) on every non-error turn still `pending`. **With the worker stopped, every answer renders as verified and supported.** *On every line.* (The Oct-1 branch found this independently; the first pass of this reconciliation missed it.)

Smaller ones, also on every line: `ragApi.ts` falls back to `DEFAULT_CORPUS_DOCUMENTS` (six titles, five invented, one real) when `/corpus` is unreachable; `ChatConsole.tsx` lines 491–493 hard-code the in-flight stage models (`mistralai/mistral-nemotron`, `google/gemma-4-31b-it`, `deepseek-ai/deepseek-v4-flash-0731`), none of which either chat service runs; the "verifier at 8 s, answerer at 25 s" stage progress is two timers (`RagChatbotApp.tsx` ~261–262); and `MonitoringPanel.tsx` hard-codes an 8-point drift sparkline and a "Stable (ASI: 96.4)" label (~lines 400, 435, 439). The opt-in simulator is labelled "SIMULATOR ACTIVE" and is not counted. `RagApiClient` calls `VITE_RAG_API_URL || http://localhost:8100` directly, so the `/chat` and `/corpus` proxies in `vite.config.ts` are not on the chat path.

**Net: neither open line of work fixes 5 and 6.** Do not demo the RAG chat view as live telemetry. A code PR for all of the above is proposed in 28.9. **[2026-10-20] #60 is merged and #58 was closed unmerged, so on `main` paths 1 and 2 are gone and paths 3–6 remain: `RagChatbotApp.tsx`, unchanged since `e31fb58`, still has them at L247–249, L269, L299–306 and L204. Still do not demo the view as live telemetry.**

### 28.5 Corrections to this file's own analysis

Errors of reasoning in earlier sections, found while checking them:

- **Fabrication count (26.3 on the Oct-1 branch, and the first pass here).** Six paths, not four; the first correction in this pass said five.
- **The probe's retriever was a hash (27.2).** And its verifier value was already over the alert threshold, with `DRIFT_DETECTED` firing seven minutes before the topic switch (27.2). *By hand: evaluation database, read-only.*
- **"10 of 34" (24.9.3, TL;DR).** 34 paraphrases were generated and 2 discarded; 32 were scored on 2 signals = 64 pairs. **10 of 64** flipped: disagreement 7 of 32 (the table's 1+3+1+2+0), contradiction 3 of 32; 9 distinct paraphrases of 32 flipped on at least one signal. *By hand: `paraphrase_stability.json` at `7f78b3f`.*
- **87 against 90 (TL;DR, 24.4, 24.9, 24.10).** Those figures are from a superseded snapshot (97 rows, 87 scorable, cell A n=37, mean 0.219, AUC 0.9797). The committed data has 100 rows, 90 scorable, cell A n=40, mean 0.2485, AUC 0.9792. 24.9.5 uses the second without saying so. The three rows between the snapshots are reruns of the one query already known to be bimodal and move "above 0.6" from 7 of 37 to 9 of 40; ten correct acceptances on one query are unscored. *By hand for the 90-row figures; the rest finder.*
- **"Tracks stance, not error" is retracted by 24.9.5 and still stated as a result (TL;DR, 24.10).** 24.9.5 concludes the 0.980 AUC was an artifact and that "tracks stance" described a planner comparison. The TL;DR bullet and 24.10 still present it, and the open "cell D" question, as standing. *Finder, confirmed by a skeptic.*
- **AUC 0.457 holds.** Re-scored by hand with the planner's questions excluded: 0.4570 (accept n=40, refuse n=50); the live configuration gives 0.9792. *By hand. The independent audit could not repeat it (it needs the NLI models), so it is by hand only.*
- **25.3's 0 of 9 is partly by construction, and its mechanism conflicts with Section 11.** The removal regex deletes the only digit-count phrase in each output, so 0 of 9 follows; the informative cases are the six outputs with prose left. Section 11 says the zero extractions on 8,353 external spans come from agents not narrating tool use at all, which the digits-versus-words explanation does not establish. *Finder; read from the stored outputs.*
- **25.1's "0.948–0.984" covers four of five anchors**; the fifth has disagreement spread 0.0006, narrower than its drift spread of 0.084. *Finder; not repeated.*
- **24.5's "bit-identical" compares against the second of two files dated 2026-08-23.** Config B latencies by file: 300.48 ms (`e83b783`), 188.07 (`73b533f`), 132.09 (`9cd0819`, the re-run), and 188.07 on `main` (the 73b533f file, restored by `e31fb58`). *Finder.* [2026-10-22: see 29.10.2]
- **The 75 s timeout is per attempt; the model set printed in 26.2/27.1 is the first smoke turn (27.1).** *By hand.*
- **Section 4/5/6 and the header chain**, corrected inline: private → public, `launch.json`, Docker, the test count (226 on 2026-09-15, 237 on 09-16, 260 on 09-17, 269 at `7f78b3f`; the "269" in 20.5 is a typo for 237), the DB path, `.env`, the branch/PR question, items 3, 7, 8 and 9, and "What is actually next". The header's "Updated" chain omits Sections 19–23 and 25 and is not in date order.

### 28.6 What held up

Checked and found correct: the retriever-only AUC of 0.457 and the live 0.979; the flip numerator of 10; the withdrawal at `7f78b3f` being a real 24.9.5 change that `e31fb58` undid; 26.3's verifier row counts (28 window values, 11 before and 17 after the switch); and the repository being public. What the probe's data do not support is "the drift signal detected the shift" (27.2).

### 28.7 Other repository state found by the sweep

Read-only, by `gh` and `git`:

- **#60's CI ran for the first time in this repository's history and passed:** `release` workflow on the pull request — `sdk-test` 46 passed, `images (backend)` and `images (dashboard)` built, `sdk-publish` skipped (tag-only). Nothing was pushed or published; before 2026-10-13 `.github/workflows` did not exist and no run had ever happened. **[2026-10-20] `release.yml` is on `main` since #60, and `tests.yml`, the first workflow that runs the backend suite, since #65 (28.12).**
- **`RELEASING.md` tells the next release to tag `v0.1.0`, which already exists** (an annotated tag, ancestor of `main`, with a published GitHub release of the same name). A new tag needs a version bump. The PyPI project `agentpulse-observe`, the `pypi` environment and GHCR package visibility (RELEASING.md "One-time setup") do not exist yet.
- **On 2026-10-13 the live deployment was a 2026-09-17 build (superseded on 2026-10-20: see 28.11 and 28.12).** `https://agentpulse.centralindia.cloudapp.azure.com/v1/health/live` reports `process_started_at 2026-09-17T11:39:22` and about 26 days of uptime (checked 2026-10-13), 36 seconds after #44 merged. It contains none of #45 onward, and by a bundle probe none of the RAG UI. *By hand: `curl`; the bundle probe is the audit's.*
- **The repository homepage and the `v0.1.0` release notes link a dead hostname** (`agentpulse-demo.centralindia.cloudapp.azure.com`, which does not resolve); the working host is `agentpulse.` without `-demo`. Fixed in the repository's files on 2026-10-13, and in both GitHub fields on 2026-10-20 (the homepage URL and the "Live demo" line of the `v0.1.0` notes; nothing else in the notes changed).
- **Security settings on the now-public repo:** secret scanning, push protection and Dependabot are disabled; there are no rulesets and no `SECURITY.md`; `main` is unprotected; collaborator `SkSahoo98` still has push (one commit, `b7dc43c`, 2026-08-31). A `.claude/settings.local.json` is tracked on `main` (7 lines, no secrets).
- **Other repositories under `Soum-Code`:** 13, all public. `frontend` (the AI Studio app's earlier repo, last push 2026-09-16) and `Soum-frontend-` (28.8) are the relevant ones; `agenttrace` is an unrelated project of similar name.
- No tags or releases other than `v0.1.0`; no issues, discussions, Pages, deployments or Actions secrets.

### 28.8 The standalone frontend: `Soum-Code/Soum-frontend-` (pushed 2026-10-10)

Public, two commits by the owner on 2026-10-10 (21:24–21:25 UTC), 75 files, AI Studio layout (`src/`, `server.ts`, Firebase files); `package.json` is named `react-example`. Read through the GitHub API only; it was not cloned, built or run, and its tests were not run.

- **Built against the Oct-1 branch's contract, not #58's.** `src/lib/ragTypes.ts` says it is aligned with `demo/chat_server.py`; `ragApi.ts` calls `GET /health` on the chat server, handles 502 / 503 / 422, reads `/v1/traces/{id}`, `/v1/drift`, `/v1/health/ready`, `/v1/health/evaluator`, `PATCH /v1/alerts/{id}` and the WebSocket `/v1/ws/live`, and defaults to `http://localhost:8100` and `:8000`. All of those routes exist in this repo's backend, **but two do not match**: the client reads `/v1/drift` as `{drift: [...]}` where the backend returns `{agents: [...]}` with different field names, and sends `{status: 'acknowledged'}` to `PATCH /v1/alerts/{id}`, which expects `{acknowledged: true}` (audit).
- **The RAG view is honest about failure; the product views are not.** `ragApi.ts` states "NO mock data fallbacks" and surfaces errors. But `src/App.tsx` seeds agents, traces and incidents from `mockTelemetry.ts` (L235–237) and, with `isSimulatingLive` defaulting to true (L247), prepends a `Math.random()`-built trace every 12 s (L486–527); the Telemetry Lab handler builds incidents with a `Math.random()` id (L562). `PerformanceView.tsx` imports `mockPerformanceMetrics.ts` and jitters latency and error rates with `Math.random()` (~L127–308). None of those view files contains a `fetch(` call. That is the Section 18/21–23 pattern again.
- **Security.** `firestore.rules` lets any signed-in user read and write the `spans` of every project (`allow read, write: if request.auth != null`) while `projects` are owner-scoped; `firebase-blueprint.json` stores a per-project `apiKey` field. `firebase-applet-config.json` — a Firebase web config with an API key and an OAuth client id (its `recaptchaSiteKey` and `measurementId` are empty) — is committed to a public repository, and the same key is hard-coded at `src/lib/firebase.ts:38`. Firebase web keys are meant to ship to browsers and are protected by key restrictions and rules, so this is a hygiene finding; the `spans` rule is the real one. A scan of the 74 text files (`bun.lock` skipped) for Google, NVIDIA, OpenRouter, GitHub, AWS and Slack key formats and private-key blocks found only that key, in those two places.
- **No built-in path to the backend in production.** `vite.config.ts` and `server.ts` have no proxy and the URLs default to `localhost`; they can be overridden with `VITE_CHAT_SERVER_URL`, `VITE_AGENTPULSE_API_URL` or `window.__AGENTPULSE_*_URL__`, none of which is documented in `.env.example`; CORS has to allow the frontend's origin on both services.

### 28.9 Open decisions

Everything here is the owner's; nothing below has been done unless it says so.

1. **Merge #60** (the owner chose the Oct-1 branch as the base), then #63 (the pinned dependencies, 28.11), then this document and #62 (comments only). CI passed on #60 and #63. Use "Create a merge commit" (the repository's convention; #61–#63 are built on #60's commits, which a squash would make them repeat), and retarget #61, #62 and #63 to `main` before merging them: branch auto-delete is off, so GitHub will not do it, and a merge into the old branch never reaches `main`. `main` is unprotected and no workflow runs on a push to it (`release.yml` runs on tags and pull requests), so merging publishes nothing. Checked with `git merge-tree` on 2026-10-20: merging #60 into `main` gives exactly #60's tree, and merging #63 gives the tree that runs on Azure. **[2026-10-20] Done: #60, #63, #61 and #62 were merged between 07:34 and 07:37 UTC.** **[2026-10-20, later] Since #65 merged (12:26 UTC), `tests.yml` does run on pushes to `main` that touch code; it only runs tests.**
2. **#58:** do not merge it. After #60, close it (the branch is kept). What only it has: the two `RagChatbotApp.tsx` fixes (items 3 and 4 in 28.4) and `demo/chatbot/app.py`, the instrument of the 27.2 probe. Carry the two fixes into the code PR below; keep `app.py` only if a second chat service is wanted. **[2026-10-20] Already closed unmerged on 2026-10-13 (17:37 UTC); branch kept. Its two `RagChatbotApp.tsx` fixes (paths 3 and 4) are still owed to item 4.**
3. **#57:** close as superseded by 25.5/25.6 here. **[2026-10-20] Closed unmerged at 07:39 UTC.** **#56:** rebase onto `main` or drop; it was never merged. **[2026-10-20] Rebased, merged and deployed (28.12).**
4. **A code PR for the RAG chat view** (28.4): remove the invented grounding score and the invented drift, the corpus fallback, the hard-coded stage models and the timer-driven stages, the hard-coded sparkline and ASI label, and the two paths only #58 fixed; and make whichever chat service survives load the embedding model or fail loudly instead of hashing. A proposal card for this exists in the app.
5. **Should `AGENT_DISAGREEMENT` alert at all?** #60 returns to the 24.9.5 decision (withdrawn). Keeping it live would be a different, deliberate decision; nothing measured supports it. **[2026-10-20] Settled by the #60 merge: the alert is withdrawn on `main` and in the code running on Azure (28.11, 28.12). Turning it back on is now the deliberate change.**
6. **Next release:** a new tag (not `v0.1.0`) with a version bump, after the one-time PyPI/GHCR setup in `RELEASING.md`.
7. **Housekeeping** (the homepage, the `v0.1.0` notes and the redeploy were done on 2026-10-20, 28.11): turn on branch protection, secret scanning and push protection; remove `SkSahoo98`'s push access if it is no longer wanted; untrack `.claude/settings.local.json`; unlink or stop syncing the `agentpulse` AI Studio app from this repository.
8. **The standalone frontend:** fix the `spans` Firestore rule before it holds real data; match its `/v1/drift` and alert-acknowledge calls to the backend's shapes; decide whether its product views stay on mock data.
9. **Rotate the NVIDIA key** that was pasted into a chat session and is in the local, gitignored `.env`. The OpenRouter key pasted earlier was revoked (a call with it returned 401 when checked).
10. **[2026-10-20] #64 and #65 are open** (28.12). #64 changes only `demo/` and needs no redeploy. #65 adds the first CI job that runs the backend suite on pull requests; making it a required check is a branch-protection setting. **[2026-10-20, later] #65 was merged at 12:26 UTC; its first run on `main` failed one test (28.12). #64 is still open.**

### 28.10 Method and limits

The first pass of this check ran as eight automated finders against the old handoff; five finished (B1, B3, C, D, E), producing 106 findings. Skeptic agents then re-checked all 106 independently: 103 confirmed, 3 refuted. The finder for Section 24's repository claims (A1) also finished, with 16 findings that no skeptic reached. Finders A2 and B2 (the TL;DR, 25 and 26 repository claims; the model-dependent numbers in 24.9.4–25.2) never completed because the usage limit was hit three times, so **the 25.1 paraphrase spreads and the 25.2 "0 of 100 truncated" figure were not re-checked.** A second automated audit then went through the text the first reconciliation added (214 statements: 132 held, 50 overstated, 14 unsupported, 18 wrong), all folded into this section; a completeness sweep of GitHub state produced 28.1 and 28.7.

Not re-checked at all: Sections 1–3 and 7–23, most of 24.2–24.4 and 24.6–24.8, the retriever and answerer rows in 27.2. Statements that depend on the owner's AI Studio screens (28.2) and on a Claude session's report of what the owner said (26.1) are marked as such. The Oct-1 branch's own tests passed here (290 backend, 35 dashboard) but no model provider was called. Section 28.11 was written on 2026-10-20 from the commands it lists, not from the audit. So was 28.12.


### 28.11 The 2026-10-19 redeploy that failed, and the pinned dependencies (#63) (2026-10-20)

**What went wrong.** `backend/pyproject.toml` gave only version ranges, so every image rebuild took the newest of each package. The rebuild of #60's code on the Azure VM on 2026-10-19 resolved SQLAlchemy 2.1.5 (the image that was running has 2.0.54), fastapi 0.146.0 (0.141.1), pydantic 2.14.1 (2.13.5), starlette 1.9.0 (1.6.0), sqlmodel 0.0.48 (0.0.42) and others. SQLAlchemy 2.1 made `greenlet` an optional extra, so the new backend image stopped on start with `ImportError: greenlet`. The stack was rolled back the same day and the old images were kept as `agentpulse-{backend,worker,dashboard}:rollback-20261019`. The process mistake: the candidate image was swapped in before it had been started against a copy of the database. *By hand: the versions are from the VM's build log and from `pip freeze` of the running image.*

**What #63 changes.** A new `backend/constraints.txt` with the exact versions of the 69 packages in the image that ran correctly (its `pip freeze`; torch is left out); both Dockerfiles install with `-c constraints.txt` and pin `torch==2.14.0` from the CPU index; `pyproject.toml` now asks for `sqlalchemy[asyncio]>=2.0.14,<2.1`. Nothing under `backend/app/` changed. `deploy/huggingface/Dockerfile` got the same two changes; no workflow builds it and it was not built here.

**Checked on 2026-10-20.**

- An image built from #63's branch has a `pip freeze` identical to the running Azure image's (empty diff); `app.main` and `app.worker` import; the API starts and `/v1/health` returns 200.
- The whole `tests/` directory inside that image: 290 passed (`langgraph`, which the demo workflow tests need, was installed on top for the run; it is not a backend dependency).
- CI on #63: `images (backend)` passed in 5m16s, `images (dashboard)` in 1m27s, `sdk-test` in 13s; `sdk-publish` was skipped (tag-only).
- The candidate image against a copy of the live database, before the swap: it read 117 evaluations (`tool_claims_found` NULL), 53 traces, 117 spans and 9 alerts; `/v1/health` returned 200 and an authenticated `/v1/traces` returned 200. The live database already had the nullable `evaluations.tool_claims_found` column (the pre-attempt backup of 2026-10-19 does not), so no ALTER was needed.

**Deployed state.** At about 07:15 UTC on 2026-10-20 the backend, worker and dashboard containers were recreated from the new images (tag `pins-20261020`); the backend was healthy after 35 seconds. `/v1/health` reports state healthy, and `/v1/health/evaluator` reports ready with one live worker on the ONNX NLI backend. No container restarted or was OOM-killed. Caddy and the volumes were not touched. The temporary 3 GB swapfile added for the build was removed afterwards (it was never in `/etc/fstab`). On the VM, `~/backups/` holds `agentpulse-pre-pr60-20261019.db` and `agentpulse-pre-pins-20261020-0653.db`. The VM checkout is on `fix/pin-backend-dependencies` at `cfe6a56`; its tree equals what `main` will be after #60 and #63 merge, so merging needs no redeploy (#61 changes only this file and #62 only comments). **[2026-10-20, later] Superseded at about 11:56 UTC: the backend and worker now run #56 (28.12), the VM checkout is on `main` at `a73c99a`, and `~/backups/` also holds `agentpulse-pre-pr56-20261020.db`.**

**Rolling back:** tag the three `rollback-20261019` images as `:latest`, then `docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml up -d --no-build backend worker dashboard`. **[2026-10-20, later]** After 28.12 the images just before it are `pins-20261020`; roll back to those first (28.12).

**Building on this VM** (4 GB, no swap now, no buildx): build with `docker compose ... build <service>`, one service at a time. Plain `docker build` uses the legacy builder, which rejects the Dockerfile's `COPY a b .`, and `DOCKER_BUILDKIT=1` fails without buildx. The dashboard must be built through compose, because `VITE_API_KEY` and `VITE_API_URL` are baked in from `.env` as build args. Compose overwrites `:latest` on every build, so point `:latest` back at the `rollback-*` tags until the swap. **[2026-10-20, later] Point it back at the tags that are running, not `rollback-*`: since 28.12 that is `pr56-20261020` for backend and worker and `pins-20261020` for the dashboard.** Add a swapfile again before a rebuild.

### 28.12 #56 merged and deployed; what was not deployed (2026-10-20)

**What changed.** #56 was merged at 11:44 UTC as `a73c99a`, a merge commit. Its branch had been rebased onto `main` after 28.1 listed it as conflicting, and GitHub reported it mergeable. It is the 25.6 change: `Evaluation` in `backend/app/models.py` gets two nullable fields, `grounding_input_truncated` and `grounding_input_tokens`; `evaluation_runner.py` writes them; migration `b8e4d1c72f35` adds the columns; `tests/_queue_harness.py` and a new `tests/test_grounding_truncation.py` cover it. Nothing in the dashboard changed, so the site looks the same. From now on the two values are stored for each new evaluation that computes a grounding score (older rows, and evaluations with no grounding result, hold NULL), and no dashboard view or API response shows them yet. `main` now collects 293 tests: 290 plus the three in `tests/test_grounding_truncation.py`.

**Not deployed, and why.**

- #64 (the retriever fix) changes only `demo/workflows/retrieval.py` and a test. No image on the VM contains `demo/` (the stack is backend, worker, dashboard and Caddy), so there is nothing to deploy. It is still open.
- #65 (a CI job that runs `pytest tests` on pull requests, and on pushes to `main`, that touch the backend, demo, tests, SDK, adapters or reasoning code) changes only `.github/workflows/tests.yml`. It is still open. It has two runs, each run twice; all four attempts passed 290 tests on `main` as it was before #56, so neither #56's nor #64's new tests were included. `pytest` took 66 to 86 s and the job 2 min 16 s to 2 min 52 s. Both re-runs restored the model cache instead of downloading the models. **[2026-10-20, later] Merged at 12:26 UTC (`9cba466`). Its first run on `main` (run 39422314311, on `9cba466`) missed the model cache and downloaded the models, then ran 293 tests: 292 passed and `tests/test_real_workflows.py::test_local_vector_retriever` failed (`similarity_score` -0.0532, expected > 0). Not investigated here; that test uses `demo/workflows/retrieval.py`, which #64 changes.**
- PR #1 of `Soum-Code/Soum-frontend-` is still open. Nothing on the VM is built from that repository (the site's dashboard is this repository's `dashboard/`), so merging it alone would not put it on the site.

**The live database has no `alembic_version` table.** Its schema comes from `SQLModel.metadata.create_all` when the API starts (`backend/app/database.py`). That creates missing tables but never adds a column to an existing one. With no `alembic_version` table, `alembic upgrade` would start from the baseline migration `60a86ca23d8c` and fail on tables that already exist, so it was not used; to use it, the database would first have to be stamped at the revision its schema matches, now `b8e4d1c72f35`. The running image has no `migrations/` or `alembic.ini` anyway (the Dockerfile copies only `app/`). The two columns were added by hand with `ALTER TABLE`. (`tool_claims_found` was already there at the 28.11 deploy, though the 2026-10-19 backup lacks it; 28.11 does not record how it was added.) Rows written before that hold NULL in both, on purpose: the migration's docstring says that writing False would claim the premise was not cut.

**Steps, in order** (*by hand, over SSH; times are UTC*):

1. The VM checkout was already on `main` at `67986bc` when this started (28.11 had left it on `fix/pin-backend-dependencies`; that switch is not recorded). `git pull --ff-only` took it to `a73c99a`.
2. A backup through SQLite's backup API: `~/backups/agentpulse-pre-pr56-20261020.db`, 117 evaluations, `integrity_check` ok.
3. A 3 GB `/swapfile` (not in `/etc/fstab`), then `docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml build backend`, then `build worker`; both succeeded. The new images are tagged `pr56-20261020` (backend `e5ea16238c78`, worker `0d48e6993755`), and `:latest` was pointed back at `pins-20261020` until the swap.
4. The candidate image against a copy of the live database. The two columns were added to the copy; the candidate API started and `/v1/health` returned 200 with the database check ok; through the app's own `Evaluation` model it read all 117 rows, wrote `True` and `321` into the new fields of one row and read them back. The copy was deleted afterwards.
5. The two columns added to the live database (117 rows, `integrity_check` ok afterwards). The old code does not read them, so this was safe before the swap.
6. At about 11:56, `:latest` pointed at `pr56-20261020` and `up -d --no-build backend worker`. The dashboard and Caddy containers were not recreated (up 5 hours and 5 weeks). No volume was recreated or removed; the only change to the data volume was the `ALTER TABLE` in step 5.
7. The swapfile removed.

**Checked after the swap.**

- `/v1/health`: state healthy, the API ready, the database check ok; the evaluator ready with one live worker on the ONNX backend, not degraded.
- The worker logged `models_loaded()` with all three parts True at 11:57:03, then that it was starting.
- `docker logs <container> 2>&1 | grep -Eci 'error|traceback'` gives 0 for the new backend (759 lines) and the new worker (11 lines).
- Both running containers use the `pr56-20261020` image IDs, and the `models.py` and `evaluation_runner.py` inside them contain `grounding_input_truncated`.

**Not checked.** No evaluation has run since the deploy (117 evaluations before and after; no row has `grounding_input_tokens` set), so a real evaluation filling the new columns has not been seen, and no test span was sent to production to force one. The whole test suite was not run on `a73c99a` for this deploy: CI on #56 ran only `sdk-test` and the two image builds. The session that asked for #65 reported 298 passing on `main` with #64 and #56 applied, earlier the same day; that run was not repeated here.

**Rolling back:** tag `agentpulse-backend:pins-20261020` and `agentpulse-worker:pins-20261020` as `:latest`, then `docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml up -d --no-build backend worker`. The two columns can stay; the older code does not read them. `rollback-20261019` is older still (before #63).

**Also seen.** `/v1/health` counts 11 registered workers, 10 of them stale. Every restart leaves the previous worker's heartbeat row behind. Readiness is not affected (one worker is alive), but the count grows with each redeploy.

---

## 29. 2026-10-21: the review fixes merged, the first automatic deploy, and what was hardened

Written by the leader chat on 2026-10-21 (about 10:45 UTC). Everything here was checked against GitHub, the live site or the VM on that day, except where a line says otherwise. Nothing in this section contains a key, a password or a hash; the names of the secrets are listed, never their values.

### 29.1 What merged on 2026-10-21

Each was merged as a merge commit after its diff was read and its checks were green (a docs- or workflow-only change that triggers no check was merged once its diff matched what was intended). Merged just before, by other chats: #65 (CI runs the suite), #67, #68 (parallel ingest batches for one new trace no longer lose the batch).

| PR | What it changed | Merge commit |
|---|---|---|
| #69 | The NLI model orders its labels contradiction 0, entailment 1, neutral 2; the code assumed neutral 1, entailment 2. The order is now read from the model config; rows are stamped `model_version` v1.1 | 750823f |
| #70 | The SSH deploy workflow and `deploy/azure/deploy.sh` | 038b0c8 |
| #72 | Dashboard: the RAG view's fabrications removed (28.4 items 3 to 6), risk scores shown the right way round (they are risks, 0 safe and 1 risky, and were coloured as if high meant good), Traces, Overview and the context panel no longer crash on a trace with no tokens or cost | 6e887f4 |
| #71 | Six SDK bugs: `@monitor` ran a failing function twice and recorded no error span, `enqueue` from a worker thread raised, redaction missed JSON keys, bare `sk-` keys and Bearer tokens, `instrument_graph` wrapped nothing on a real LangGraph `StateGraph`, the trace context leaked between runs, and nothing was sent without a running event loop. The same PR also fixed `stop()` dropping the batch in flight, a bad batch killing the flush loop, 5xx answers not being retried and `start_agent(None)` | 9fb10b4 |
| #73 | `overall_risk_score` no longer averages in a tool check that found no claim (0.0 meant "nothing checked") or the disagreement score (measured at chance); `config_version` v1.1 | 3d03db6 |
| #74 | `/v1/keys` only for the environment key; a lower-case log level no longer crash-loops the worker; a non-ASCII `X-API-Key` answers 401 instead of 500; list `limit` must be 1 to 200 | d5bbffb |
| #75 | Caddy asks for a password on every method except GET and HEAD (29.3) | 9120039 |
| #76 | The demo entry points load the embedding model; a stand-in index is no longer marked built. Not done for `demo/chatbot/app.py`, which still has no `load_models` | 62d941e |
| #77 | A job that kills its worker is dead-lettered after `max_attempts`; `/v1/platform` says `failing` when none of the last 50 finished jobs succeeded | 8c43113 |
| #78 | Telemetry Lab: a real 32-span drift scenario (before, "drift" built the same spans as "hallucination"), an experimental disagreement scenario, `GET /v1/simulate/{trace_id}`, every scenario labelled "injected fault" | fc77d01 |
| #79 | `.github/workflows/dashboard.yml` runs `tsc --noEmit` and `vitest run` on `dashboard/**` (not a required check) | 2352568 |
| #80 | The deploy workflow strips carriage returns from the SSH key and the host line: a key copied on Windows has CRLF endings and OpenSSH rejects it ("error in libcrypto: unsupported", reproduced with a throwaway key) | 5124bcb |
| #81 | The API key is no longer baked into the dashboard's JavaScript (29.3) | 2616880 |

### 29.2 The first deploy, and what deploys now

- Run 39582272100 (the push of #81), 10:07 to 10:17 UTC: `a73c99a` to `2616880`. Backup `~/backups/agentpulse-pre-deploy-20261021-100748-2616880.db` (integrity ok, 117 evaluations), "schema: 0 nullable column(s) to add", the new backend read all 117 evaluations on a copy of the database, swapped, `/v1/health` went `failing` to `healthy` in about 35 seconds, the swapfile was removed. Images are tagged `deploy-20261021-100748-2616880`; the log prints the rollback commands.
- Earlier attempts failed for two different reasons: five runs at "Set up SSH" because the repo had no secrets, and one at "Deploy" because `AZURE_VM_KNOWN_HOSTS` had been pasted wrongly. The repo now has `AZURE_VM_SSH_KEY` and `AZURE_VM_KNOWN_HOSTS`. The key is the owner's own `agentpulse_azure` key; a deploy-only key (README, "Secrets") is better and is still to do.
- **Every push to `main` that touches `backend/**`, `dashboard/**`, `docker-compose.yml` or `deploy/azure/**` now deploys to production in about ten minutes, and the workflow does not wait for the tests.** Merge only when the checks are green. The workflow never recreates Caddy.
- Live checks after the deploy: process started 10:16:50, `healthy`, one worker alive, `GET /v1/simulate/<unknown>` answers the JSON 404 only the new code has.

### 29.3 Secrets and exposure

- **Leak, now closed.** `docker-compose.yml` passed `AGENTPULSE_API_KEY` as the build arg `VITE_API_KEY`, and Vite inlines every `VITE_*` value into the JavaScript, so the live site had served the backend's real key to every visitor since September. #81 stops it: the build arg is empty and the dashboard container gets the key at runtime, where nginx adds it to `/v1` requests. Checked with docker (a marker key is in the shipped bundle with the old build and in none of the files with the new one; with a fake backend the runtime key reaches it and a client-sent key is replaced) and on the live site (the one `apiKey` literal in the served bundle is empty).
- **Rotated** on the VM at 10:31 UTC: a new random key in `~/agentpulse/.env` only, never printed; the old key answers 401; `.env` is mode 600; `VITE_API_KEY` is gone from it. Anything of the owner's that still uses the old key now gets 401.
- **Write password** set at 10:39 UTC by the owner (username `soum`; only the bcrypt hash is on the VM, in `.env`). Verified from outside: reads are public, and POST, PATCH and DELETE without it answer 401 with `WWW-Authenticate: Basic realm="AgentPulse writes"`. Consequences: the SDK and demo probes cannot write through the public URL without `-u soum:<password>`; a public chat needs an exception line in the Caddyfile `@write` block. If the password is lost it is not recoverable: make a new hash (README, "Password for writes").
- Backups on the VM that still hold old values: `~/backups/env-pre-rotate-*` and `~/backups/env-pre-writepw-*` (mode 600). Delete when convenient.
- Still open: the Firebase web key hard-coded as a default in `dashboard/src/lib/firebase.ts` (public by design, but it must be restricted to the site and to the Firebase APIs in the Google Cloud console); the NVIDIA key pasted into a chat (28.9 item 9). A scan of tracked files and of every commit for key-shaped strings found only fake test strings in `tests/test_sdk.py` and that Firebase key.

### 29.4 The data on the live site

At the deploy the database held 117 evaluation rows (116 `stage2`, 1 `skipped`), all `model_version` v1.0 and `config_version` v1.0, so their grounding scores used the swapped NLI labels and their risk used the old averaging. Spans scored after the deploy are v1.1. Do not compare v1.0 and v1.1 rows. A re-score tool that defaults to a dry run is being built by a separate session; until it has been reviewed and applied, the dashboard shows the old rows with the old numbers. **[2026-10-22: applied at 04:50 UTC, all 117 rows are now v1.1; see 29.10.1.]** Drift distances and ASI come from embeddings and are not affected by the label fix.

### 29.5 The 28.9 open decisions, one by one

| 28.9 item | Now |
|---|---|
| 1 to 3 | Done (28.12) |
| 4, a code PR for the RAG chat view | Done: #72 |
| 5, should `AGENT_DISAGREEMENT` alert | Settled: withdrawn (the score is stored and shown, and #73 keeps it out of the risk number) |
| 6, a new release tag | Open |
| 7, housekeeping | Branch protection is on (a pull request is required, no required status checks, admins included, no force push or deletion). Not checked: secret scanning and push protection, `SkSahoo98`'s push access. Open: untrack `.claude/settings.local.json`, and the AI Studio sync (29.6) |
| 8, the standalone frontend | Frozen (29.6) |
| 9, rotate the NVIDIA key | Open |

### 29.6 Two frontends, and AI Studio

The product frontend is `dashboard/` (what Azure serves). The AI Studio app named "AgentPulse" is synced to `Soum-Code/Soum-frontend-` (branch `main`, last sync 2026-10-09 20:02) and had 13 changed files not pushed, among them `src/data/mockTelemetry.ts`: **do not push them.** `Soum-frontend-` and its open PR #1 are frozen. A second AI Studio app, "agentpulse", was imported from this repository on 2026-09-19 and is stale. Any UI work done in AI Studio starts from a new app imported from current `main`, goes back only as a branch and a pull request (never to `main`), and is reviewed against CI. The prompt used for that lives outside the repository.

### 29.7 The Ponytail code review

A read-only review of the Python code (backend, SDK, demo, adapters, reasoning; about 16k lines) found 64 confirmed findings (11 must, 15 should, 38 nice; 5 more were refuted by the skeptics). The report is outside the repository. Fixed: must 1 and 2 (#73), 3 (#69), 4 to 9 (#71), 10 (#68), 11 for `demo/chat_server.py` and `demo/multi_model_pipeline.py` (#76); should 13, 14, 16, 19 and 25 (#71), 21, 22, 44 and 45 (#74), 23 and 24 (#77); and the Azure write exposure, 20 (#75). Open, among others: 12 (ASI treats an even two-tool mix as instability; deleting it would remove a detection the project report credits to it, so it is the owner's call). **Never reviewed: the dashboard (TypeScript, about 20.8k lines), the tests, scripts, experiments and benchmarks.** Reading the dashboard for an hour found three real bugs (the inverted risk colours, the Traces crash, the fabricated RAG numbers), so expect more.

### 29.8 Traps hit today

- `docker compose exec` inside `ssh host 'bash -s'` with a here-document reads the rest of the script from stdin and swallows it. Give it `</dev/null`, or give the one command that needs input its own here-document.
- A private key copied on Windows (`clip`, Notepad, a browser) carries CRLF endings; OpenSSH on Linux rejects it. A `known_hosts` secret must be exactly `hostname ssh-ed25519 KEY`; compare it with `ssh-keygen -F` and with `ssh-keyscan` before blaming the workflow.
- Anything in a `VITE_*` variable is public. A key belongs in the container's runtime environment.
- A merge to `main` that touches the paths in 29.2 deploys. The account's usage limits (a five-hour and a weekly window) cap how many sessions can run at once; read the usage before starting several.
- In PowerShell `<` does not redirect and `clip < file` fails; say which shell a command is for.

### 29.9 What is next [superseded by 29.10.6]

1. Review the re-score PR, then run it on the VM with `--apply` after a fresh backup, and check the dashboard.
2. Audit the landing page's numbers against the project's reports. [2026-10-22: done in #84 and #86, see 29.10; the figure "under 1.2 ms ingestion" that this line first quoted was itself unsupported.]
3. Re-measure grounding on correct labels: `NEUTRAL_RISK_WEIGHT` (0.5) and the 0.7 and 0.4 cut-offs were set or measured on swapped labels. Re-run the experiments that depend on them and say so in the report.
4. The public chat: real embeddings in `demo/chatbot/app.py`, a per-IP rate limit, an input length limit, a daily cap, a kill switch, per-stage progress, a new NVIDIA key, a check that the 4 GB VM holds the API, the worker and the chat service, and the exception line in the Caddyfile.
5. A read-only review of the dashboard and the tests, in the same style as 29.7.
6. UI work from AI Studio under 29.6: error boundaries, a real drift view, a card per signal with its measured limit, evaluator health, claim next to evidence, visible write failures.

### 29.10 Update, 2026-10-22 (about 05:30 UTC)

**How the leader works now.** The owner told the leader to work on auto. Routine steps are done without asking: reading and merging a pull request whose checks are all green, checking a deploy, read-only checks on the VM, starting the next planned package. Entering or exposing credentials, spending money, deleting data and anything not already planned still wait for the owner.

**What merged since 29.1** (all with green checks; a change under `backend/**` or `dashboard/**` deploys by itself):

| PR | What it changed | Merge commit |
|---|---|---|
| #82 | This Section 29 | 03edf13 |
| #83 | `python -m app.rescore_cli`: scores the evaluation rows still at `model_version` v1.0 again from the text stored in their spans. A dry run unless given `--apply`; selects and updates only rows at v1.0 in one transaction; aborts if the models are not all loaded; reports and skips a row it cannot score; never writes alerts, drift records or baselines | 9c4be34 |
| #84 | Landing page and Settings: 31 numbers or claims with no source, or a source that says something else, replaced (29.10.2). The Settings headline is now the live `evaluation_timing` median from `GET /v1/platform` with its sample size, an em dash when the API returns nothing | 75c1b90 |
| #85 | Settings stops claiming saves, syncs and thresholds that do not exist: no Save button (no field has a write path), no "synced", sliders nothing read are gone, the ingestion key is shown only if it has the shape the API issues (`ap_live_<12 hex>_<urlsafe>`, checked against `backend/app/services/api_keys.py`), text density controls are inert and say so | 8219c90 |
| #86 | Docs, decks and the `grounding.py` docstring: stale, random and unsourced latency figures corrected (27 files, a table of 36 changes in the PR). The docstring change is comment-only but sits under `backend/**`, so it deployed | 663cc40 |

**29.10.1 The re-score was applied on the live database** (2026-10-22 04:50 UTC). Fresh backup `~/backups/agentpulse-pre-rescore-20261022-045047.db`. Free memory was only 1395 MB and the command peaks near 1.4 GB beside the worker's 1.15 GB, so the worker was stopped for the run (the queue is durable; a trap starts it again, and it was `healthy` about a minute later) and the command ran with `docker compose run --rm -T --no-deps worker python -m app.rescore_cli`. The live dry run matched the dry run on the copy exactly (117 rows, 0 skipped, 116 changed, 89 risk labels changed: 81 low to medium, 4 low to high, 4 medium to high), so it was applied in one transaction. A second run said "Nothing to do". Now all 117 evaluation rows are v1.1 / v1.1 (labels: 81 medium, 23 high, 12 low, 1 none); the 9 alerts and the 117 drift records are untouched; `agent_records.avg_risk_score` and `traces.overall_risk_score` were rebuilt for the agents and traces whose risk moved. The audit file with every old and new value is `~/rescore-out/rescore-applied-20261022-045047.csv` on the VM. Two facts worth keeping: for all 116 NLI rows the new `entailment_prob` and `neutral_prob` are exactly the old `neutral_prob` and `entailment_prob` and `contradiction_prob` is unchanged, which confirms the #69 diagnosis on real data; and the worker log says `nli=onnx embedding=pytorch`. **Reading the result:** most old "low risk" rows are now "medium" because the NLI model calls an output that the evidence does not entail "neutral", which scores 0.5; the 0.5 weight and the 0.7 and 0.4 cut-offs were chosen on swapped labels, so do not read those 81 moves as real regressions before the re-measurement in 29.10.3.

**29.10.2 The leader's own audit was wrong in two places, and what is true.** The first version of the landing-page audit trusted the docs and did not open the producing files. Checked in the files since: (1) there is no measured ingestion latency anywhere in this repository: layer 8 of `experiments/results/latency_profiles.json` is `0.85 + rand*0.3` (`experiments/latency_profiler.py`, "Nothing is measured in this loop"), layer 9 likewise, layer 13 is a sum; so `0.981 ms`, `< 1.2ms`, `< 4.2ms` and "Sub-1.2ms Fanout" have no measurement behind them. Only layer 7 (SDK enqueue, p99 0.205 ms, real code, no network) and layer 12 are timed. (2) 215.9 ms (MiniLM 27.83 plus DeBERTa 188.07) is the 2026-08-23 ablation run; `experiments/results/ablation_results.json` on main is the 2026-09-18 re-run on the PyTorch path: MiniLM 19.1, DeBERTa 132.09, cascade 151.19 ms. Because each configuration's latency is the sum of its signals' timings, "215.9 is exactly 27.8 plus 188.1, so no gate ever fired" never proved anything; the code is the proof. Solid and kept: 203 ms median (258 mean) over 30 cases against a Qwen3-8B Q4 judge at 3,170 ms median (`llm_judge_comparison.json`: 202.94 and 3170.39); 3.88 spans/s for one worker and 12.93 for eight (`throughput_benchmark.json`, ONNX, a 16-thread dev machine, not the VM); the Azure VM at $24.67 a month (`deploy/azure/README.md`); the API at 80 MB. README's 122.3 / 172.2 ms is `benchmarks/benchmark_results.json`, `evaluator_pipeline_cascade` p50 / p95 over 9 cases (2026-08-18, PyTorch). `STARTUP_GUIDE.md`'s 254 / 417 ms is the one-worker burst in `throughput_benchmark.json` (253.8 / 417.3). 89.45 ms appears in no data file, only as a fixed string in `experiments/run_experiment.py`. **Rule: before quoting a performance number, open the script that produced it and the file on main.** The earlier text of 29.9 item 2 ("under 1.2 ms ingestion") repeated the unsupported figure; it is superseded here.

**29.10.3 Earlier sections that quote figures now known to be stale or unsupported.** Each of these lines carries a dated note pointing here; the text itself was left as the record of what was believed.

| Line | Quotes | Now |
|---|---|---|
| 879 | "Full cascade is 215.9ms", "27.8ms is Config A" | 151.19 and 19.1 (2026-09-18 run) |
| 1313 to 1317 (19.3) | 27.83 / 188.07 / 215.90 and "215.90 is their sum, a gate that ever fired would land between them" | current 19.10 / 132.09 / 151.19; the sum identity holds by construction |
| 2166 | `54.2 ms` against 215.9 ms | 215.9 is the 2026-08-23 run |
| 2175 to 2182 | the "4.2 ms was not false, 0.981 mean, now `< 1.2ms`" story | rests on layer 8, a random number |
| 2621 | "188.1ms to 132-135ms across three runs" | only 188.07 and 132.09 exist in git (`HANDOFF_AUDIT_2026-10-10.md` already says so) |
| 3561 | Config B latencies by file | same |

`HANDOFF_AUDIT_2026-10-10.md` quotes 188.07 and 215.9 about thirty times as dated audit findings; it was left alone. Found by the docs correction and not fixed: `presentation/AgentPulse_Final_Review.pptx` (not `_v2`) still carries 215.9 and 27.8 and can no longer be rebuilt from its script (delete or regenerate); `generate_pdf.py` still says "92 / 92 Passed" (the suite is far larger) and its baseline table and chart date from before the grounding-score fix; `benchmarks/run_benchmarks.py` regenerates `BENCHMARK_REPORT.md` from a template and would overwrite the rows the docs correction edited.

**29.10.4 What the public pages say now.** The landing page shows one latency: the 203 ms median, always with "30 test cases" or "a small sample". The ingestion claim is "SDK enqueue p99 0.2 ms, real SDK call, no network", with the note that the API's own HTTP time has not been measured on its own. "ONNX Runtime" is said only about the NLI model (the embedding model always runs on PyTorch). The Eiffel Tower walkthrough is labelled a hand-written illustration, the keyword evaluator sandbox says it is keyword rules in the browser, the cost calculator prints its assumptions ($0.0038 per judged span from 1,200 input and 80 output tokens at $2.50 and $10 per million) and uses the real $24.67 VM, and "100% deterministic" became "same weights, same score". Still unfixed, listed in the #85 description: `App.tsx` never wires the text density setting; `firebase.ts` still fabricates `ap_live_<document id>` for a project without a key and `ProjectSelectorModal` prints it; `ProductHeader` says "Default Project" when none is selected; `public/ConnectModal.tsx` ships a made-up key and endpoint in the snippet it offers to copy; when the API is unreachable `App.tsx` hides every tab except the Telemetry Lab, so Settings cannot be opened; the "High Contrast Obsidian" badge is wrong under the Butter and Chalk palettes.

**29.10.5 Limits, and the plan if the weekly limit runs out.** Usage on the owner's Pro plan was 85% of the weekly window at about 05:00 UTC on 2026-10-22 (it resets on 2026-10-25 at 04:00 UTC) and a five-hour window about 43%. A session costs about 1 to 3 percent of the week, so no more than two run at once. If the week runs out the owner's plan is to run Claude in the cloud. A hosted "Default" cloud environment exists and can run `Soum-Code/agentpulse`. A cloud session starts from the pushed repository: it has none of the local files (the copy of the live database, the 1.2 GB model cache) and must not be given the VM key or any other secret, so it suits reviews, docs, dashboard work and code changes that CI can check, not VM operations or experiments that need the cached models. Not verified: whether cloud sessions draw on the same plan limit. Also keep in mind: the 4 GB VM has only about 1.4 GB free beside the worker, so a second process that loads the models (the planned public chat service, a re-score, an experiment) does not fit without stopping the worker, adding swap or a larger VM.

**29.10.6 Running now, and what is next (this replaces 29.9).**
- **Running:** a session re-measures grounding on the corrected labels (the weight `NEUTRAL_RISK_WEIGHT` = 0.5, the 0.7 and 0.4 cut-offs, the ablation, the threshold analysis). It must only measure and write a report and new result files; it must not change a constant or touch `backend/**`, because changing them changes live scores and needs another re-score.
1. Read that report, decide whether to keep 0.5, change it or add an "unverifiable" band, and only then change the constants and re-score again (the tool exists and is idempotent per version: bump `model_version` or `config_version` first). **[2026-10-22: done. The report was read, the weight is 0.3 and the rows were re-scored; see 29.11.]**
2. The public chat: real embeddings in `demo/chatbot/app.py`, a per-IP rate limit, an input length limit, a daily cap, a kill switch, per-stage progress, the exception line in the Caddyfile `@write` block, a new NVIDIA key, and a memory plan for the VM (previous paragraph).
3. A read-only review of the dashboard (about 20.8k lines) and of the tests, scripts, experiments and benchmarks, which the Python review never covered.
4. UI work from AI Studio under 29.6, one or two features at a time, each returning as a branch and a pull request.
5. The owner's three small tasks, still open: test the write password once in the browser (Telemetry Lab "Run scenario", user `soum`); restrict the Firebase web key in the Google Cloud console; rotate the NVIDIA key that was pasted into a chat. Also: a deploy-only SSH key instead of the personal one.
6. The follow-ups in 29.10.3 and 29.10.4.

### 29.11 Update, 2026-10-22 (about 06:15 UTC): the grounding weight is 0.3 and the live rows are re-scored

**What merged since 29.10** (all with green checks, diff read first):

| PR | What it changed | Merge commit |
|---|---|---|
| #88 | `GROUNDING_RECALIBRATION_2026-10.md`: grounding re-measured on the corrected NLI labels. Adds three scripts (`experiments/grounding_recalibration_{signals,analysis,compounding}.py`) and their outputs `experiments/results/grounding_recalibration_2026-10-22_*`. Measurement only: no file under `backend/` or `dashboard/` changed, so it did not deploy | 59c5dc4 |
| #89 | `NEUTRAL_RISK_WEIGHT` 0.5 to 0.3 in `backend/app/services/grounding.py`; `model_version` v1.1 to v1.2 in `evaluator.py` (`config_version` stays v1.1, the averaging did not change); `rescore_cli` now selects every row whose `model_version` is not the current one (it was hard-wired to v1.0) and guards each UPDATE with `WHERE model_version == <the version it read>`; `tests/test_grounding_weight.py` added; the docs and four dashboard files (text and one comment) that quoted 0.5 corrected | 2dbba54 |

**29.11.1 What the re-measurement found** (full detail and every figure's script in `GROUNDING_RECALIBRATION_2026-10.md`, section 0 is the bottom line):
- The 0.5 weight rested on an inverted premise. DeBERTa calls identical text *entailment*, not neutral; what 0.5 discounted was entailment. The swapped view reproduces the published numbers exactly (88 of 88 calibration rows, ablation Config G, the LLM-judge NLI score for all 30 test cases, the compounding experiment), so the old-versus-new comparison is a re-labelling, not a model guess.
- The weight does not change ranking: AUROC is 1.000 on the 30-case test split for every weight from 0.0 to 1.0, and 0.996 on the 47-case held-out pool for 0.0 to 0.8. It does decide the medium band: at the 0.4 line, weights 0.0 to 0.3 give test F1 0.963 and false-positive rate 0.059; **0.5 gives F1 0.788 and FPR 0.412**. High-risk alerts (above 0.7) do not depend on the weight up to 0.6.
- The 81 low-to-medium moves of 29.10.1 were not evidence of risk. In the labelled data a neutral-dominant case is a failure 1 time in 17; 35 of 50 correct answers from five real LLMs are neutral-dominant, and 82% of them scored above 0.4 at weight 0.5 against 24% at 0.3. The live premise is a short prompt (median 25.5 tokens for premise plus claim), so "not entailed" is true of almost any answer.
- What the bug did to published results: anything that used `contradiction_prob` alone is unchanged (the headline F1 0.963 / FPR 0.059 of ablation Configs B to E). What changes: Config G (0.963 / 0.059 to 0.897 / 0.176), the LLM-judge comparison's NLI side (0.963 to 0.897), the calibration report's two rows, and the compounding-error experiment. Section 5 of the report lists the sentences elsewhere that still quote an out-of-date number; they were listed there, not all edited.
- Data caveats the report states and that still stand: 68 unique labelled cases, `test_01` to `test_05` are copies of `dev_01` to `dev_05` (so 5 of 30 test cases are not held out), the only neutral failure in the data is one case (`val_17`), so the data can show what a neutral weight costs but not what it buys. Any non-zero weight is a design choice, not a fit.

**29.11.2 The decision, made by the leader (the owner delegated it).** Weight 0.3; keep the 0.7 and 0.4 cut-offs (the data does not argue for moving them, and nothing validates them either). 0.3 is the largest weight at which a purely neutral output stays under the 0.4 line with headroom. It was chosen on dev and confirmed on val and test, not tuned on test. **The cost, said plainly:** a neutral-only fabrication, such as the analyst's Kubernetes sentence in Section 24, now scores 0.3 and is `low_risk`, the same as a benign neutral answer; at 0.5 it was `medium`. An "unverifiable" status, shown separately from the risk score, is the right answer to that and is not built yet (29.11.4).

**29.11.3 The second re-score on the live database** (2026-10-22 06:08 UTC, after the #89 deploy finished at 06:06; run 39730731918, backend started 06:05:37). Same procedure as 29.10.1: fresh backup `~/backups/agentpulse-pre-rescore2-20261022-060813.db` (integrity check ok), worker stopped under a restart trap (2461 MB available), dry run first, applied only because the dry run read exactly 117 rows, 0 skipped and a largest `contradiction_prob` change of 0.0000. The dry run said 116 score or label changes and 82 label changes (78 medium to low, 4 high to medium); it was applied in one transaction, and a second run said "Nothing to do". Result: all 117 evaluation rows are now `model_version` v1.2 / `config_version` v1.1; labels **90 low, 7 medium, 19 high, 1 none**, which is exactly what section 3.6 of the report predicted (90 / 7 / 19 against the earlier 12 / 81 / 23). The 9 alerts and the 117 drift records are untouched. The worker is `running` and `/v1/health` is `healthy` (`workers_alive` 1, NLI backend `onnx`). The audit file with every old and new value is `~/rescore-out/rescore-applied2-20261022-060813.csv` on the VM. New spans are scored at 0.3 and stamped v1.2 from the deploy onward.

**29.11.4 What is open because of this.**
- **Not measured:** ASI and `quality_drift` are built from the grounding score, so the weight change moves them; their effect was not measured. The 9 alerts were raised under the old scoring and were not re-evaluated.
- **"Unverifiable" status** (the report's recommendation, 96 of 116 live rows would carry it): needs a backend field and a dashboard badge. Without it, neutral-only fabrications look like safe answers. **[2026-10-22: done, PR #91, see 29.12.1.]**
- **A human-labelled set** of a few hundred (evidence, answer) pairs in three classes (supported, unsupported but plausible, contradicted) from real RAG outputs, with neutral cases oversampled, is what a defensible weight would need.
- **Stale sentences** listed in section 5 of the report that quote 0.5, the swapped-label story or the old Config G numbers: not all edited. `THRESHOLD_ANALYSIS.md` is generated by `ablation.py` and will regenerate with the new numbers if that script is run again.
- Item 1 of 29.10.6 is done; items 2 to 6 stand.

**29.11.5 Limits.** Weekly usage on the owner's Pro plan was 88% at about 05:40 UTC (it resets on 2026-10-25 at 04:00 UTC) and the five-hour window 66%. The leader keeps at most two sessions at once and runs routine steps on auto. If the week runs out the plan in 29.10.5 (cloud sessions, no secrets, nothing that needs the VM or the model cache) applies.

### 29.12 Update, 2026-10-22 (about 10:00 UTC): the Unverifiable status, VM safety work, an honest production position and the plan for the public chat

Written so that a session with no access to the leader's notes (for example a cloud session, see 29.12.6) can continue from here. No key, token, password or hash is in this section; the names of the secrets are in 29.3.

**29.12.1 The "Unverifiable" status (PR #91, merged as a09b66f).** Since #89 a neutral-only output scores 0.3 and reads `low_risk`, the same as a supported one. #91 adds a separate status, not a risk, derived on read from the stored `entailment_prob`, `contradiction_prob` and `neutral_prob`: no migration, no version bump, no re-score, **scores, labels and alerts are unchanged**. `grounding_verdict(entailment, contradiction, neutral)` in `backend/app/services/grounding.py` is the argmax of the three (`contradicted` | `unverifiable` | `supported`, a tie goes to the riskier class, `None` if a probability is missing or not finite). `nli_breakdown(evaluation)` builds the four API fields and returns all four as null unless `evaluation_stage == "stage2"` and `model_version != "v1.0"`: stage1 rows store rough similarity numbers in the probability columns (they do not sum to 1) and v1.0 rows have entailment and neutral swapped, so a verdict from them would be wrong. `GET /v1/traces/{id}` (span `evaluation`) and `GET /v1/simulate/{id}` (per span) return the four fields. The Traces span inspector shows a muted dashed "Unverifiable" badge (not amber, not rose) with the tooltip "The evidence neither supports nor contradicts this output, so it could not be checked."; "Contradicted" is rose and "Supported" emerald. 32 new backend tests (422 total passed) and 6 new dashboard tests (63 total). Not done: the Overview has no risk-label list, so no unverifiable count was added. It was merged at about 10:13 UTC and deployed by the usual workflow (run 39762475137). **The deploy took about 44 minutes instead of ten**, because the Docker build cache had been pruned shortly before (29.12.2) and pip had to download and install every dependency again; the live stack kept running the old build meanwhile and was `healthy` afterwards (backend started 10:57:13 UTC, one worker alive). Checked on the live site: every evaluation now carries the new fields, and the 117 stored evaluations split as 96 `unverifiable`, 19 `contradicted`, 1 `supported` and 1 skipped (all four fields null), the same split as the NLI classes counted in the recalibration report; scores and labels are as before.

**29.12.2 Changes made on the VM today (each on the owner's yes).**
- **Nightly backup.** Root script `/usr/local/bin/agentpulse-backup.sh` (SQLite backup API run inside the `agentpulse-backend-1` container, integrity check, `docker cp` out) writes `/home/azureuser/backups/nightly/agentpulse-nightly-<UTC time>.db` (mode 600, newest 14 kept), started by `/etc/cron.d/agentpulse-backup` at 02:17 UTC, log `/var/log/agentpulse-backup.log`. One test run worked (117 evaluations, 512K). **The copies are on the same disk as the database**, so a lost VM still loses them; an off-VM copy needs an account or credential and is the owner's decision.
- **Permanent 2 GB swap** `/agentpulse-swap.img` (priority 10, listed in `/etc/fstab`, a copy of the old fstab is in `~/backups`), `vm.swappiness=10` in `/etc/sysctl.d/99-agentpulse.conf`. **Trap:** `deploy/azure/deploy.sh` makes its own temporary build swap at `/swapfile` and aborts if `/swapfile` already exists, so the permanent swap must never use that name.
- **Docker cleanup.** 14 old image tags removed by name (older `deploy-*`, `pr56-*`, `pins-*`, `rollback-20261019` for backend, worker and dashboard), dangling images and unused build cache pruned; volumes and running containers untouched. Disk went from 47 GB to 14 GB used (22%, 48 GB free); `deploy.sh` needs at least 10 GB free on `/` to start. Kept the running images, the previous deploy (a manual rollback) and 4.6 GB of build cache. Never run `docker system prune -a --volumes` on this VM.

**29.12.3 Honest position: ready for a demo and a viva, not for production.** Checked on the VM and in the repository today:
1. Until today there were no scheduled backups (the cron list was empty); the backups that exist are on the VM disk (29.12.2).
2. One VM (4 GB, now with 2 GB swap), SQLite, one worker (about 3.9 spans per second measured for one worker), roughly 1.4 GB of memory free beside the 1.15 GB worker, no external uptime monitor.
3. Detection quality is demonstrated only on a small hand-built set: 68 unique labelled cases (5 of the 30 test cases are copies of dev cases); the 0.7 and 0.4 cut-offs are validated by nothing; the inter-agent disagreement signal is at chance (AUC 0.457) and its alert was withdrawn; the tool-claim signal only catches digit counts; the 0.3 neutral weight is a design choice, not a fit (`GROUNDING_RECALIBRATION_2026-10.md`).
4. A push to `main` that touches `backend/**`, `dashboard/**`, `docker-compose.yml` or `deploy/azure/**` deploys by itself and does not wait for tests; there is no staging; rollback only happens if the new stack is unhealthy.
5. One shared API key, tenant isolation not tested; the Firebase web key is unrestricted; the NVIDIA key pasted into a chat earlier is not rotated; the deploy uses the owner's personal SSH key.
Say these plainly in the viva: a research prototype with an honest list of limits.

**29.12.4 The public live chat (work package F), kept on purpose.** The owner wants visitors to see AgentPulse monitor a real chat on the site. Decisions made with the owner on 2026-10-22:
- **Providers.** One OpenAI-compatible code path (every provider in `demo/multi_model_pipeline.py` is called through the `openai` library with a base URL and a key) and an ordered **failover** on 429, 5xx and timeouts: Groq `gpt-oss-20b` (low reasoning effort), then Cerebras `gpt-oss-120b` or `qwen-3.8-27b`, then NVIDIA, then Pollinations (keyless, always on), then OpenRouter. A provider is used only when its key variable is set. The owner chose OpenRouter over the self-hosted OmniRoute gateway (another process on a 4 GB VM) and Pollinations first while no key exists. Keys live only in the VM's runtime `.env`, never in an image, a commit, a chat or a log.
- **Why failover and small calls.** One chat turn is five sequential LLM calls (researcher, retriever, verifier, analyst, writer; `NVIDIA_AGENT_MODELS`), big models with hidden thinking made old turns take 30 to 120 s. Free quotas (secondary sources and official docs read on 2026-10-22; they change often, re-check): OpenRouter `:free` 20 requests a minute and 50 a day, 1000 a day after buying 10 credits (official docs); Cerebras free trial `gpt-oss-120b` and `qwen-3.8-27b`, 5 requests a minute, 30K uncached tokens a minute, 1M tokens a day (official docs); Groq free plan 30 requests a minute, 1000 a day, 8000 tokens a minute, 200K tokens a day for the gpt-oss models (secondary sources; search results say Groq stopped serving the Llama models to free users on 2026-08-16); NVIDIA about 40 requests a minute (community figure, free tier scoped to prototyping); Gemini free numbers are no longer published. Speeds: Groq's models page lists `gpt-oss-20b` at 1000 tokens/s and `gpt-oss-120b` at 500; independent roundups put Cerebras highest in throughput and Groq lowest in time to first token. Keyless Pollinations answered three tiny requests in 10.4 s (cold), 1.0 s and 0.64 s. No provider was measured on the real pipeline yet.
- **To build.** (a) a compose service for `demo/chat_server.py` (FastAPI, port 8100; `/chat`, `/health`, `/corpus`; the dashboard chat page `dashboard/src/lib/ragApi.ts` already calls it) with its own image, a memory limit of about 900 MB, no secrets baked in, `AGENTPULSE_API_KEY` from `.env`; (b) the Caddyfile route `/chat*` and the exception `not path /chat*` in the `@write` basic-auth matcher (the comment hook is there), recreated by hand because the workflow never recreates Caddy; (c) three LLM calls a turn or fewer (the retriever needs no LLM if it only retrieves: check), small `max_tokens`, no hidden-thinking models by default; (d) real embeddings through `ensure_embedding_model` at startup (MiniLM, 0.5 to 0.8 GB, the reason for the swap); (e) per-IP limits per minute and per day, a maximum input length, a global daily cap sized to the free quotas, a kill switch that needs no redeploy, CORS limited to the site, the client IP only from Caddy's `X-Forwarded-For`; (f) per-stage progress streamed to the page, with a timing line per stage and the provider that answered; (g) tests with a stub provider; (h) a benchmark of each provider on the real pipeline once keys exist, to fix the order.
- **Phase 2: visitors bring their own LLM.** The visitor gives base URL, model and key; the key travels in the POST body over TLS, lives in memory for that request only and is never logged, stored or put into a span or the AgentPulse payload (`AGENTPULSE_CAPTURE_INPUTS` stays false). Only an allowlist of known provider hosts is accepted, and private, loopback and link-local addresses are blocked (otherwise the server could be pointed at the backend container or the cloud metadata address). Per-IP limits still apply and the page says plainly that the key passes through the server. A browser-direct call was rejected (many providers block browser CORS, and the pipeline runs server-side). The other way to use your own LLM is the SDK: the visitor's agent sends spans to AgentPulse.
- **Schedule.** Because the weekly usage limit was at 92%, the build waits for the weekly reset on Sunday 2026-10-25 at 04:00 UTC. Estimate: chat live about Tuesday 2026-10-27, bring-your-own-LLM about Wednesday 2026-10-28, if the owner has made the Groq and Cerebras accounts and keys by then and usage holds. Not for a demo "tomorrow": build, test and deploy it properly; show the chat locally (`demo/chat_server.py`) until then.

**29.12.5 How the leader works, and traps found today.**
- The owner put the leader on auto: green pull requests are merged after reading the diff, deploys and VM checks are done without asking, handoff updates follow each notable event. Entering or exposing credentials, spending money, deleting data that was not planned, and anything not planned still wait for the owner.
- The app refuses to start a session in an automated turn (a timer or another session's message): only a proposal card works, which the owner starts by a click or by telling the leader. Do not schedule timers that must start sessions. A fresh session costs far less than extending a long leader conversation.
- Weekly usage was 92% at about 09:15 UTC on 2026-10-22 (reset Sunday 04:00 UTC), the five-hour window 12%. A session costs about 1 to 3% of the week.
- `docker compose exec` inside `ssh host 'bash -s' <<EOF` swallows the script from stdin: give exec calls `</dev/null`. A private key copied on Windows carries CRLF and OpenSSH rejects it. In PowerShell `<` does not redirect. In git-bash set `MSYS_NO_PATHCONV=1` for `git show ref:path`. Windows Python cannot see git-bash `/tmp`.
- Pruning the Docker build cache makes the next deploy slow (about 44 minutes instead of ten, measured on 2026-10-22): prune it only when disk is short, and expect a slow deploy afterwards. The workflow's own limit is 90 minutes.
- The sqlite column for the risk label is `label` in `evaluations`, not `risk_label`.

**29.12.6 If the weekly limit runs out: continue in the cloud.** A hosted "Default" cloud environment can run `Soum-Code/agentpulse`: `start_session` with `target: "cloud"`, no `cwd`, the base branch pushed. A cloud session has none of the local files (no model cache, no copy of the database) and must be given no secret and no VM key, so it suits docs, dashboard work, reviews and backend code that CI can check (package F parts a to g fit; the provider benchmark (h) and every VM step do not). Whether cloud sessions draw on the same plan limit is not verified. The leader writes a fresh state snapshot into this file when weekly usage reaches about 95%; read the highest-numbered subsection of Section 29 first.

**29.12.7 The owner's own open tasks.** (1) rotate the NVIDIA key that was pasted into a chat (28.9 item 9); (2) restrict the Firebase web key in the Google Cloud console; (3) test the write password once in the browser (Telemetry Lab, "Run scenario", user `soum`); (4) make Groq and Cerebras accounts and keys (no card needed) before Sunday and keep them out of every chat; (5) decide where an off-VM copy of the nightly backup should go; (6) delete the two `env-pre-*` files in `~/backups` on the VM when convenient (they hold keys that are already dead).

**29.12.8 What is next, in order.** 1. Package F part 1 (29.12.4 a to g) as a session after Sunday 04:00 UTC; the leader reviews and merges it, then does the VM steps. 2. Part 2: bring-your-own-LLM. 3. The docs clean-up before the viva: sentences that still quote 0.5 or the old Config G numbers (section 5 of `GROUNDING_RECALIBRATION_2026-10.md`), `presentation/AgentPulse_Final_Review.pptx` (215.9), `generate_pdf.py` ("92 / 92 Passed" and the old baseline table). 4. A release tag after the chat is live, and then no more scoring changes. 5. The read-only dashboard, tests and scripts review. 6. The follow-ups in 29.10.3 and 29.10.4.

### 29.13 Update, 2026-10-22 (about 12:50 UTC): weekly usage reached 97%; state snapshot for a cloud continuation

Written at the owner's standing order (write the state down at the weekly limit so work can continue in the cloud). Read 29.12 first: it holds the VM facts, the public chat plan and the honest production position. This subsection only adds what changed after it. No key, token, password or hash is in it.

**29.13.1 Usage.** Weekly usage was 97% and the five-hour window 47% at about 12:45 UTC (the weekly window resets on Sunday 2026-10-25 at 04:00 UTC). From here the leader does only cheap steps. A cloud session (29.12.6) may continue; whether it draws on the same plan limit is not verified.

**29.13.2 Running now: nothing. Two pull requests are open, reviewed through their descriptions, CI green, not merged.** **[2026-10-22: both were merged and deployed a little later, see 29.14.]** Both change `dashboard/**`, so a merge auto-deploys the dashboard (the build cache is warm again, so about ten minutes). The first one's description says they merge cleanly with each other (checked with `git merge-tree`); merge #93, then #94.
- **[#93](https://github.com/Soum-Code/agentpulse/pull/93) "Port the AI Studio trace export, copy shortcuts and relative times into the dashboard"** (branch `feat/port-aistudio-trace-export`, +1761 −118, 15 files, 127 vitest tests up from 63, tsc and vite build clean). The owner's AI Studio work lives in the separate repo `Soum-Code/Soum-frontend-`, branch `main`, commit `382bcba` (one commit, 13 files, pushed 2026-10-21 09:44 UTC); it had never been ported because the leader missed the push. Ported selectively: `X` exports the selected trace as JSON (`schemaVersion` `agentpulse.trace.v1`), `E` exports the filtered traces as CSV, `Y` copies the trace id, `Shift+Y` copies the whole trace; four rows in the shortcuts modal; an Export JSON and a Copy log button; relative times ("2m ago") with a Time ago / Clock time / Both toggle. Skipped on purpose: `mockTelemetry.ts` (mock data), the palette work (`colorPalettes.ts`, `UnifiedPaletteBar.tsx`, `index.css`, the `PublicExperience.tsx` palette diff, the palette types), because `dashboard/` has no palette module. **Defects found in the AI Studio code and fixed in the port:** the export invented values (`evaluators: []`, `driftDetected: false`, token counts of 0), CSV cells starting with `=`, `+`, `-` or `@` were not neutralised (formula injection), no clipboard fallback on plain http, a `select` did not count as typing so shortcuts fired while using it, day thresholds printed "0mo ago" and "0y ago", a zone-less backend time (naive UTC) was read as local time so every trace looked 5h30m older in IST, hover-only tooltips unreachable by keyboard, and `C` / `Shift+C` doing two jobs on one key (not ported). **Defects found in `dashboard/` by running it against a real backend and fixed:** only the newest 12 traces had spans (`HYDRATE_LIMIT`), so older traces showed 0 spans and exported empty shells (the detail is now loaded on demand); the adapter dropped the alerts; `totalTokens` was typed required; the "Success" filter compared with `'success'` instead of `'ok'`; `G` then `E` also downloaded a CSV; shortcuts fired behind the open shortcuts sheet; a trace row printed `t` with no token number. **Checked live against a real backend** (the four scenarios plus a token trace): the exported JSON matched `GET /v1/traces/{id}` exactly (risk 0.9993, 5 spans, 4 alerts, 7 evaluator results with verdicts), token sums matched (200 / 75 / 275), and all 17 CSV rows matched the API with 0 mismatches. **Not fixed, listed as follow-ups in the PR:** `lib/adapters.ts` turns an unknown latency or one missing token side into 0, maps a trace's status to `ok` unless it is running (a trace with HIGH alerts exports `ok`), takes evaluator thresholds and maturity from dashboard constants, and uses the first span's agent for a multi-agent trace; `AgentsView.tsx` prints `ms avg` and `% OK` unguarded; `OverviewView.tsx` copies an id with a bare `navigator.clipboard.writeText`. **Before anyone ports the palette work:** `getLuminance` accepts 3-digit hex but `getBlendedContrastRatio` parses only 6 digits, and the `${customColor}f0` style alpha suffixes make invalid CSS for 3-digit or 8-digit colours.
- **[#94](https://github.com/Soum-Code/agentpulse/pull/94) "Replace three typed-in Overview values and a wrong drift count with real data"** (branch `fix/overview-fabricated-values`, +244 −28, 5 files, 72 vitest tests up from 63). Found by running the product locally (the Overview showed "+14.2% vs nominal baseline", "Schema drift & OCR alerts active" and "0.88 Δ (Cluster #3)", all typed in, and "6 flagged swarms" while only one agent had drifted). Fixed: the volume card now says what it sums (`Spans Ingested`, `summed over N agents`; the old "24h Trace Volume" was each agent's lifetime span count); the alert line is `X open · Y investigating · Z resolved` from the alert flags; the drift badge is the real largest `latest_window_centroid_distance` among drifting agents with the agent id (an em dash if none); "flagged" counts only agents whose status is `drift`, not agents with no baseline yet (the page now says `7 of 8 agents have no baseline yet`); "Active Incidents" no longer counts resolved alerts; the roster no longer prints `ms` with no number. Checked live: 61 spans over 8 agents, 6 open alerts (5 critical), 1 agent drifting at 0.97 for `drift_demo_agent`. Follow-up: the field is still named `totalTraces24h`.

**29.13.3 What the next session (cloud or local) does, in order.** **[2026-10-22: replaced by 29.14.4.]**
1. Read the code (not only the descriptions) of #93 and #94: for #93 `dashboard/src/utils/traceExport.ts`, `TracesView.tsx`, `App.tsx`, `lib/adapters.ts`, `lib/traceDetail.ts`, `utils/keyboard.ts`, `utils/dateUtils.ts`; for #94 `lib/overviewStats.ts`, `OverviewView.tsx`, `App.tsx`. The leader had read the descriptions and seen CI green but had not read these diffs line by line when the limit approached. Check that no number is invented, the earlier fixes (risk colours, verdict badge, null guards) are intact, and the CSV neutralises formula cells. Merge #93, then #94 (each deploys; wait for the deploy, check `/v1/health` healthy).
2. After the deploy, check on the live site: the Traces view `X`, `E`, `Y`, `Shift+Y` (the write password is not needed: they are browser-side), the Overview cards, and that no line shows a typed-in number.
3. Then the order in 29.12.8 (public chat package F after the weekly reset, the docs clean-up before the viva, the release tag, no more scoring changes).

**29.13.4 Also changed today (not in 29.12).** The local stack was started once from a worktree and shown to the owner: backend, worker and dashboard ran against real models (`nli=pytorch`), the four Telemetry Lab scenarios behaved as designed (clean: no alert; hallucination: HIGH_HALLUCINATION_RISK and GROUNDING_FAILURE; tool_mismatch: TOOL_CLAIM_MISMATCH; drift: DRIFT_DETECTED), then everything was stopped and the temporary database and `dashboard/.env.local` were deleted. The "clean" scenario's five spans all read `unverifiable` with a score of about 0.30: their premise is the short prompt, so the NLI model calls the output neither supported nor contradicted; say so if asked, it is the same reason 96 of the 117 live rows are `unverifiable`.

### 29.14 Update, 2026-10-22 (about 12:20 UTC): #93 and #94 are merged and deployed

This corrects 29.13.2 and 29.13.3, which were written while both pull requests were still open. No key, token, password or hash is in this subsection.

**29.14.1 What happened.** [#93](https://github.com/Soum-Code/agentpulse/pull/93) (the AI Studio port: trace export `X` and `E`, copy `Y` and `Shift+Y`, relative times, and the fixes listed in 29.13.2) merged as `0439c7e`, and [#94](https://github.com/Soum-Code/agentpulse/pull/94) (the Overview's typed-in numbers and the wrong drift count) merged as `d360fec`. Both changed `dashboard/**`, so both deployed: runs 39775559610 and 39775601084 (the second waited for the first through the `deploy-azure` concurrency group) finished `success`; with the build cache warm again each took only a few minutes. `/v1/health` is `healthy` with one worker alive. The live bundle contains `Spans Ingested`, `agentpulse.trace.v1`, `no baseline yet` and `Copy log`, and no longer contains `+14.2%`, `OCR alerts` or `flagged swarms`.

**29.14.2 What the leader checked and what it did not.** Read in full: both PR descriptions (they list, file by file, what was wrong in the AI Studio code and in `dashboard/` and what was fixed). Read in the code: `utils/traceExport.ts` (null for unknown fields, CSV formula neutralising, clipboard fallback), `lib/overviewStats.ts`, all of #94's `OverviewView.tsx` change, and the keyboard and `App.tsx` parts of #93. CI was green on both (tsc, vitest 127 and 72 tests, image builds). **Not done:** the line-by-line reading of #93's `TracesView.tsx` change (239 added, 97 removed lines) and of the test files, and pressing `X`, `E`, `Y` and `Shift+Y` on the live site. The session that wrote #93 did press them in a browser against its own backend and the exported JSON and all 17 CSV rows matched the API with no mismatch, but that was not the live site. One thing to look at in the `App.tsx` change: the effect that loads a selected trace's detail runs again when the selected trace changes and stops only when `alerts` is defined; if a detail ever came back with `alerts` undefined it would load again in a loop (the adapter sets `alerts` when the detail is loaded, so it should not happen).

**29.14.3 Still open (new or confirmed).**
- The landing page has a drift schematic in `dashboard/src/components/public/PublicExperience.tsx` (around L1585 to L1625) that carries "Cluster #3 Divergence", "Nominal Trajectory (Cosine Sim > 0.94)" and "12% Parameter Spread (Schema v2 migration)". Parts of the box say "schematic" but these numbers have no source, and the rule since #84 is that every figure needs one: label the whole box as an illustration or remove the numbers.
- From the two PR descriptions, not fixed: `lib/adapters.ts` turns an unknown latency or a missing token side into 0 and takes a trace's status as `ok` unless it is running (a trace with HIGH alerts exports `ok`), takes evaluator thresholds and maturity from dashboard constants, and uses the first span's agent for a multi-agent trace; `AgentsView.tsx` prints `ms avg` and `% OK` unguarded; `OverviewView.tsx` copies a trace id with a bare `navigator.clipboard.writeText` and can now use `copyTextToClipboard` from `utils/traceExport.ts`; the field `totalTraces24h` is misnamed (it holds lifetime spans).
- The AI Studio palette work (`colorPalettes.ts`, `UnifiedPaletteBar.tsx`, `index.css`, the `PublicExperience.tsx` palette diff) was not ported because `dashboard/` has no palette module. Before porting it, fix: `getLuminance` accepts 3-digit hex but `getBlendedContrastRatio` parses only 6 digits, and the `${customColor}f0` style alpha suffixes make invalid CSS for 3-digit or 8-digit colours. The repo `Soum-Code/Soum-frontend-` stays a design sandbox: its `main` holds the owner's commit `382bcba` and its pull request #1 is still open and frozen.

**29.14.4 What the next session does, replacing 29.13.3.** 1. Read #93's `TracesView.tsx` change and test files, press the four shortcuts on the live site, and open the Overview there to confirm no typed-in number is left (a read-only review, a good task for a cloud session). 2. Fix the landing schematic and then the adapter items above, each as its own small pull request (they deploy). 3. Then the order in 29.12.8: the public chat package F after the weekly reset (Sunday 2026-10-25, 04:00 UTC), the docs clean-up before the viva, a release tag, no more scoring changes. Weekly usage was 97% when this was written; the five-hour window about 49%.

### 29.15 Update, 2026-10-25 (about 06:30 UTC): the viva date, the 1 Nov deadline, the court verdict, the skills review and what runs now

No key, token, password or hash is in this subsection. Read 29.12 (VM, chat plan, honest position) and 29.14 first; this adds what changed on 25 Oct.

**29.15.1 The deadline (owner, 25 Oct).** The viva is on **3-4 Nov 2026**. Everything planned must be **live and tested on the deployed site before 1 Nov**; after that only monitoring (freeze). The examiners get the deployed link and may open it **at any time, without the owner**, so the public chat and the Telemetry Lab must work unattended. The owner also wants **block-wise comments** in the code (a short plain comment on each function and each non-obvious block saying what it does and why, house style `# In short: ...`) so he can explain the code at the viva; every brief now carries this, and a comment-only pass over the key files lacking them is planned for 30-31 Oct (checked as comment-only by comparing the code with comments stripped).

**29.15.2 Decisions made on 25 Oct.**
- **Public chat stays and must really work** (the owner overruled the court's advice to leave it out of the viva). Extra requirements sent to the chat session: the failover chain always ends in a keyless provider (Pollinations); if every provider fails the page shows a short honest message and a retry button, never a blank page or a stack trace; limits sized for a few examiners (at least 20 turns per IP per day and 5 per minute, a global daily cap inside the free quotas with the arithmetic in the README, a 'cap reached' message that says when it resets); `/health` reports each provider's status (configured, last success, last error class); the container restarts by itself after a crash or reboot; the kill switch is OFF by default; a cold start shows 'starting up'.
- **Telemetry Lab public access:** only `POST /v1/simulate` is exempted from the Caddy write password, with a per-IP limit and a daily cap in the backend (it writes demo traces under the fixed simulate service name only); every other write stays behind the password. It touches `deploy/azure/Caddyfile`, which the chat session is editing, so it is done right after the chat PR merges, in the same Caddy recreate.
- **Order to 1 Nov:** 25-26 Oct chat PR merge, VM steps (provider keys from the owner's clipboard into the VM `.env`, Caddy recreate, start the chat service) and Lab access; 26-27 Oct the viva storefront PR (29.15.4); 27-28 Oct bring-your-own-LLM (29.12.4 phase 2); 28-29 Oct the AI Studio palette port (29.14.3); 30-31 Oct a full end-to-end test of every feature on the live site, the comment-only pass and fixes; 1 Nov freeze and a final handoff.

**29.15.3 Sessions of 25 Oct.**
- **`public-chat-service`** (branch `feat/public-chat-service`, working when this was written): package F part 1 as in 29.12.4, built so the existing deploy is unaffected (the chat service sits behind a compose profile and is started by hand), with the Caddy `/chat*` route and `not path /chat*` exception validated in real Caddy, the failover chain, three LLM calls a turn or fewer, real embeddings, abuse limits and kill switch, a progress stream, stub-provider tests, a local run with Pollinations, plus the requirements in 29.15.2. When its PR arrives the leader reviews and merges it, then does the VM steps.
- **`court-trial`** (done; no repo change): ran the third-party skill `alexyc9381/court-skill` (MIT; the leader read `SKILL.md` and checked that `court.py` imports only the standard library and touches only `.court/`; cloned to a temp folder, nothing installed). A prosecutor, a defense, 12 independent juror sub-agents and a judge tried the case 'present AgentPulse at the viva as a credible, honestly measured project'. **Verdict: GUILTY, 11 to 1** ("honest in its log but not in its storefront"). Charges, each verified by the leader in the repo: `README.md` line 36 says "Detects contradictions between agents" while this log records 0 of 10 on real multi-agent traces (the disagreement alert is withdrawn); `generate_pdf.py` lines 311 and 571 say "92 / 92 Passed"; `presentation/AgentPulse_Final_Review.pptx` still says 215.9 / 27.8 ms; the landing drift schematic has numbers with no source; the 17-paper literature table is unread (this file's top and line 999 say so: it is a reading list); the tool-claim check measured F1 0.000 on real traces (`COMPETITIVE_POSITIONING.md`). Conditions for acquittal: delete the README contradiction line and describe disagreement (0 of 10) and tool-claim (F1 0.000) as measured negative results; put 151.19 ms, 19.1 ms and the current test counts into the deck and `generate_pdf.py`; source or remove the drift diagram; relabel the literature table as a reading list (or read the works); rotate the leaked NVIDIA key; state in writing whether the public chat is in the viva's scope; record a dated entry when done. The one NOT GUILTY juror (the engineer) called the fixes "an afternoon of edits". The full trial is in the owner's temp folder (`court-agentpulse/.court/20261025-105251/VERDICT.md`). The same session later wrote a short project review on the owner's request (in its transcript).
- **`agent-skills-review`** (done, read-only, Sonnet): used `addyosmani/agent-skills` (MIT; only the Markdown skills were read, no hook or script was run or installed) as a review method over eight requirement areas. Top findings it reported: the live **Agents view prints `NaNms`** and its **60-minute latency chart is generated randomly**; the landing **'Analytical Breakdown'** and the **Drift view** show figures with no source (0.74 Δ, 0.84 Δ, 74.8%, 142 runs, '5,000 verified runs'). Its full report (about 21.7k characters: findings with file and line, the top ten actions, a launch checklist for the chat) is that session's final message; the leader has not yet verified every finding in the code.

**29.15.4 Next: the viva storefront PR** **[2026-10-26: done in #99 and #100, see 29.16.]** (one session, one PR, after the five-hour usage window resets): the court conditions above, the skills review's verified findings that are docs, unsourced figures or NaN fixes (the Agents view `NaNms` and random chart, the landing and Drift figures, the drift schematic), block-wise comments on every changed block, a short `CODE_WALKTHROUGH.md` for the viva that maps each folder and key file to what it does, decks and PDF rebuilt from their scripts where a script exists (`AgentPulse_Final_Review.pptx` has none: remove it or mark it superseded), tests green, and a dated entry here. It must not touch the files the chat session owns (`demo/**`, `deploy/azure/**`, `dashboard/src/components/rag/**`, `dashboard/src/lib/ragApi.ts`).

**29.15.5 State checked on 25 Oct (about 05:15 UTC).** Weekly usage reset at 04:00 UTC (1% used then; 12% by 06:13); the five-hour window went from 5% to 85% in about an hour with three sessions running at once, so keep to two at a time. The site was `healthy`, one worker alive, backend up about 66 hours. The nightly backup ran on 23, 24 and 25 Oct at 02:17 UTC (117 evaluations each, 512K); disk 33% used. No pull request was open. On the leader's machine `.claude/launch.json` has an absolute venv path (the worktree has no `.venv`); it is not committed and should not be as is. The app's auto-mode safety check failed several times in a row around 06:30 UTC, which delayed this update.

**29.15.6 The owner's open tasks, in order of urgency.** **[2026-10-26: replaced by 29.16.8.]** (1) create the Groq and Cerebras accounts and keys (no card) and keep them out of every chat: they go into the VM `.env` from the clipboard when the chat PR merges; (2) rotate the NVIDIA key that was pasted into a chat (also a court condition); (3) create a free uptime-monitor account (for example UptimeRobot) so a broken site is noticed before an examiner sees it; (4) restrict the Firebase web key in the Google Cloud console; (5) test the write password once in the browser; (6) optionally read one or two of the listed papers so the literature table is not only a reading list.

### 29.16 Update, 2026-10-26 (about 06:45 UTC): the public chat is live, three PRs merged, the frontend redo is open; handover to a new leader chat

No key, token, password or hash is in this subsection. This replaces 29.15.4 and 29.15.6 as the current plan. The leader chat that wrote 29.12 to 29.16 was replaced by a new one on 26 Oct because its context had grown too long; everything the new leader needs is in this subsection and in the repository.

**29.16.1 What merged on 25-26 Oct.** [#97](https://github.com/Soum-Code/agentpulse/pull/97) (this file's 29.15), [#99](https://github.com/Soum-Code/agentpulse/pull/99) (`b58ebd9`: the Agents view without `NaN` or a generated latency chart, landing and Drift figures sourced, drift wording corrected: baseline = first 20 outputs, window = latest 12, `DRIFT_DETECTED` above a window centroid distance of 0.30; one set of drift figures: 1.5% false alarms, 91.9% detection, 24.5% coverage; the `ExperimentsView` crash guarded), [#98](https://github.com/Soum-Code/agentpulse/pull/98) (`16d9e6d`: the public chat, see 29.16.2) and [#100](https://github.com/Soum-Code/agentpulse/pull/100) (`08477d7`: docs and decks, see 29.16.4). #98 and #99 were reviewed by a four-agent workflow (a security reviewer, a reliability reviewer, a storefront reviewer and a skeptic who re-checked each finding in the code), and every confirmed finding was fixed before merge: a visitor disconnect freed the Pollinations lock while its request still ran (the next turn then got HTTP 402); the lock wait had no limit so a turn could pass its 120 s budget; a connection cut mid-stream threw away the trace id and the page said '0 of 3 stages'; the README told the operator to `git pull` on the VM, which would make the deploy skip the dashboard rebuild; the chat container held the server's master key (now its own issued key); one visitor could hold every chat slot (now one running turn per IP, 40 turns a day); two different false-alarm rates for one drift detector on the landing page; the Experiments view crashed on any result file. Refuted by the skeptic: 'a visitor can fill the disk through Caddy's error log' (nginx already logs every GET; no service has log rotation).

**29.16.2 The public chat is live** (deployed by the leader on 26 Oct about 05:40-06:00 UTC). Caddy sends `/chat*` to the `chat` compose service (`demo/chat_server.py`, image `agentpulse-chat:latest`, profile `chat`, container `agentpulse-chat-1`, memory limit 900 MB, read-only root, `~/agentpulse/chat-control/` is the kill switch folder). Steps done on the VM: the chat's own AgentPulse key was issued (owner `live-chat`, written straight into the VM `.env` as `CHAT_AGENTPULSE_API_KEY`, never printed; the classifier asked for the owner's yes first and got it; `.env` backup in `~/backups`); the image was built; the container started and is healthy; the new Caddyfile was validated with the real Caddy image and Caddy was recreated (a copy of the Caddyfile is in `~/backups`). Checked from outside: `/chat/health` says `ready`; `POST /v1/ingest` still answers 401; one real question through the public URL streamed three stages (retriever, verifier, answerer) with provider `pollinations` and a correct answer, and its three spans were scored in AgentPulse (grounding 0.30, 0.30, 0.29, all 'unverifiable' because the premise is the short prompt, the same reason as the 96 of 117 live rows). **Only Pollinations is configured**, so a turn takes about 90 s (its anonymous tier allows one reply every 30 s per IP); with the Groq and Cerebras keys a turn takes seconds. To add them: put `GROQ_API_KEY=` and `CEREBRAS_API_KEY=` into the VM `.env` from the owner's clipboard (the leader never reads them), then `sudo docker compose $F up -d --no-deps --force-recreate chat` where `F="-f docker-compose.yml -f deploy/azure/docker-compose.azure.yml --profile chat"`. The operating commands (pause and resume, stop, roll back, limits, the Caddy recreate) are in `deploy/azure/README.md`, section 'The live chat'. Limits: 5 questions a minute and 40 a day per IP, one running turn per IP, a site-wide daily cap, 500 characters a question. **Never `git pull` on the VM when `dashboard/` changed.**

**29.16.3 The Telemetry Lab is not open to examiners yet.** `POST /v1/simulate` is still behind the Caddy write password (401 for a visitor), so 'Run scenario' asks an examiner for a password. Decision: exempt only that exact path from the password, with a per-IP limit and a daily cap in the backend (it writes only demo traces under the fixed simulate service name), and keep every other write behind the password. It needs a PR that touches `deploy/azure/Caddyfile` and the backend (`routers/ingest.py`, `middleware.py`), then a Caddy validate and recreate by the leader. Not started.

**29.16.4 PR #100 in short (docs for the viva).** README no longer claims the project 'detects contradictions between agents': it says inter-agent disagreement found 0 of 10 labelled contradictions on real multi-agent traces (alert withdrawn) and the tool-claim check measured F1 0.000 on real traces; test counts were measured on `main` `2fefb91` on 25 Oct (422 backend, 136 dashboard; they will be higher after #98 and #99, update them only with a dated re-run); the report PDF and the decks were rebuilt from their scripts after checking that the scripts reproduce the committed files; `AgentPulse_Final_Review.pptx` (215.9 ms) was moved to `presentation/archive/`; the literature table is labelled a reading list; the stale sentences of section 5 of `GROUNDING_RECALIBRATION_2026-10.md` were fixed and the report has a dated banner (the weight is 0.3); `CODE_WALKTHROUGH.md` maps each folder and key file for the viva. Not done: re-running `experiments/ablation.py` at weight 0.3 (it would also replace every latency figure; the owner's call).

**29.16.5 The frontend redo from the owner's repo, open.** The owner's design repo is `Soum-Code/Soum-frontend-` (`main` `382bcba`). Three stacked pull requests redo `dashboard/` after it, with the real-backend wiring and the honesty fixes kept: [#101](https://github.com/Soum-Code/agentpulse/pull/101) `frontend/01-foundation` (the five datum states, the palette design system, the app shell, ingest-key security), [#102](https://github.com/Soum-Code/agentpulse/pull/102) `frontend/02-product-views` (Traces filters, Performance, the system status banner, Settings, all with real data only) and [#103](https://github.com/Soum-Code/agentpulse/pull/103) `frontend/03-public-rag` (the landing page on the shared theme, a real connection check, the RAG tab in the owner's frame); 55 to 62 files and 4k to 7k added lines each, all base `main`. #101 and #103 conflict with `main` after #98 and #99 landed (one conflicting file for #101: `CommandPalette.tsx`). The local session that wrote them stopped at its usage limit (resets 15:20 IST) and a cloud session (`frontend-conflicts`) was started to merge `main` into the three branches without a force push and to comment on each PR; **no note arrives when a cloud session ends**, so look at the PR comments and merge state. Not brought over on purpose: the AI Studio mock data, `server.ts`, `bun.lock`. **Next:** when the three are mergeable, review them adversarially (the four-agent pattern of 29.16.1, lenses: invented numbers, real-data wiring and regressions of the behaviour in #91, #93, #94, #98 and #99, security (no key in the bundle; `firebase.ts` must not store the plaintext ingest key), UI states and accessibility, tests), have the author fix the confirmed findings, check in a browser against a local backend, then merge #101, #102, #103 in that order, waiting for each deploy and checking the live site.

**29.16.6 The plan to 1 Nov (viva 3-4 Nov; everything live and tested before 1 Nov, then freeze).** 26-28 Oct: frontend PRs merged and live; the Telemetry Lab exemption; the chat keys. 28-29 Oct: bring-your-own-LLM for the chat (design in 29.12.4), then the follow-ups from the reviews, each a small pull request: `adapters.ts` zero-fills and the trace status (a trace with HIGH alerts shows `ok`), `GET /v1/keys` is public through nginx (answer 403), the fail-open defaults (`local_dev_mode` true, the placeholder key only warns), the compose healthcheck should use `/v1/health/ready`, `deploy.sh` never prunes, the deploy is not gated on tests, input size limits on ingest and the WebSocket, secret scanning, push protection and Dependabot are off on the public repo, 13 `npm audit` findings. 30-31 Oct: a full end-to-end test of every feature on the live site from a fresh browser, a comment-only pass over the key files (every function and non-obvious block gets a plain comment so the owner can explain the code; checked as comment-only by comparing the code with the comments stripped), fixes. 1 Nov: freeze (monitoring only) and the final handoff.

**29.16.7 State on 26 Oct.** `main` is `08477d7` (plus this docs commit); the live site is healthy; the VM `HEAD` is `08477d7`; disk about 38 GB free; the nightly backup runs at 02:17 UTC. Weekly usage on the owner's Pro plan was 56% on 26 Oct (reset 1 Nov 04:00 UTC). The owner said not to hold back for usage and to continue in the cloud when the local limit is reached; a cloud session has no local files, no VM access, no secrets and no model cache, so it gets code that CI can check; the leader keeps the VM steps.

**29.16.8 The owner's own tasks.** Create the Groq and Cerebras accounts and keys (no card; never paste them into a chat); rotate the NVIDIA key that was pasted into a chat long ago; create a free uptime-monitor account (for example UptimeRobot) for `/v1/health/evaluator`, `/v1/health/ready` and `/chat/health`; restrict the Firebase web key in the Google Cloud console; test the write password once in the browser; turn on secret scanning, push protection and Dependabot alerts on the repository; decide where an off-VM copy of the nightly backup should go; optionally read one or two of the 17 listed papers; delete the `env-pre-*` files in `~/backups` on the VM when convenient (they hold keys that are already dead).

### 29.17 Update, 2026-10-27 (about 03:30 UTC): the frontend redo, the Telemetry Lab and the chat keys are live

No key, token, password or hash is in this subsection. The second leader chat wrote it (the first one was replaced on 26 Oct, see 29.16). It replaces 29.16.5 and the open items of 29.16.6 that are listed as done below.

**29.17.1 The frontend redo merged and deployed.** [#101](https://github.com/Soum-Code/agentpulse/pull/101) (`7d9c3f3`), [#102](https://github.com/Soum-Code/agentpulse/pull/102) (`bb84c82`) and [#103](https://github.com/Soum-Code/agentpulse/pull/103) (`c30c622`), in that order, each after its own deploy-azure run finished green. Before merging, the three stacked branches (head `6d59730`) were reviewed by a workflow of seven agents: four reviewers by lens (honesty, wiring and regressions, security, accessibility and tests) and skeptics that tried to refute every finding in the code. Result: 27 findings after merging duplicates, 22 confirmed and 5 partial, none refuted, each traced through the code by a second agent. The security lens confirmed the main claim of #101 (the plaintext ingest key is never written to Firestore, only the key id and prefix; deleting a project revokes the key first and keeps the project if the revoke fails; no full key shape in the bundle) and found no regression of #91, #93, #94, #98 or #99. The confirmed defects were real and visible: Chalk and Butter were unreadable on the Traces and Agents views and the Investigation panel (dark text on dark surfaces: 90 of 163 text nodes below 3:1 on Chalk Traces), the connect dialog still printed an invented agent handshake, the status banner said "ALL SYSTEMS OPERATIONAL" while two of three health feeds had failed, the agent ledger printed "None raised." for spans the evaluator had not scored and stopped polling after one failed read, the new Ctrl+Shift+R handler blocked the browser's hard reload everywhere, Calm mode combined with a light palette was unreadable, and several Settings sentences were stale. The author session fixed all 27 (heads `90dfe3c`, `8fa69a8`, `304965b`): the light palettes got light surfaces, a stale-data banner replaced the unmounting of a view after one failed poll, `describeBanner` prints the all-clear only when all three endpoints answered, the stage label of a skipped evaluation reads "Not scored", and so on; its own browser pass (12 console views in each of three palettes against a real local backend) found 0 text nodes under 4.5:1 on Chalk and Butter and 0 NaN or undefined hits. The leader read most of the fix delta (App, banner, connect dialog, ledger, datum display, platform stats, keyboard helpers, all the CSS) and found no key, fetch or HTML injection in it; it did not read every line of `TracesView.tsx`, `UnifiedPaletteBar.tsx`, `ProjectSelectorModal.tsx` and `SettingsView.tsx`. After each deploy the live bundle was checked for the new strings and, after #103, the old "Agent Handshake Verified" text was gone and `/v1/health`, `/v1/health/ready` and `/chat/health` answered 200; in a browser the live Overview and Traces views are readable in Chalk and show the real data (123 spans, 9 open incidents on that day). Counts at merge: dashboard 304 vitest tests (27 files), `tsc` clean. **Not verified:** creating and deleting a Firebase project (needs the owner's real Firebase sign-in), a keyboard-only tab-order walk, `demo/chat_server.py` by the dashboard author. Decided without asking again: the default console tab stays Overview; the ChatPane restyle and the quick-probe pills are not done.

**29.17.2 The Telemetry Lab is public.** [#105](https://github.com/Soum-Code/agentpulse/pull/105) (`6e344b6`): exactly `POST /v1/simulate` skips the Caddy write password (a `not expression` on the method and the raw path, because Caddy's `path` matcher ignores case, merges slashes and resolves dots: tried against the real image, the plain `path` line let nine variants through). The backend limits it itself (`backend/app/services/simulate_guard.py`): 6 runs per IP per hour, 30 per IP per day, 300 a day for the site (UTC), a refusal while 100 or more evaluation jobs are queued, the visitor's IP read from X-Forwarded-For only when the peer is a trusted proxy, IPv6 counted by /64, the query capped at 500 characters; counters are in the backend's memory and reset on a restart or deploy. Rollout on 27 Oct: backend deployed first, `caddy validate` then a Caddy recreate (copy of the Caddyfile in `~/backups`). Checked from outside: `POST /v1/simulate` 200; `/v1/ingest`, `PUT /v1/simulate`, `/v1//simulate`, `/v1/simulate/`, `/v1/keys` and `PATCH /v1/alerts/1` all 401; six runs from one IP then a 429 with `Retry-After` and a JSON sentence; one run from the VM's own address still 200, so the limit is per visitor and not one bucket for the site. Settings: `AGENTPULSE_SIMULATE_IP_PER_HOUR`, `_IP_PER_DAY`, `_DAILY_CAP`, `_MAX_QUEUE_DEPTH`, `_TRUSTED_PROXIES` in the VM `.env` plus a backend recreate; `DAILY_CAP=0` closes the Lab without touching Caddy (deploy/azure/README.md, "Telemetry Lab"). Before the viva raise the per-IP limits (suggested 20 an hour and 60 a day) if the examiners share a network. Pull request #106 makes the page show the 429 sentence instead of "429 Too Many Requests" and caps the query box at 500 characters (merge pending when this was written).

**29.17.3 The chat keys are set and the chat answers in about two seconds.** The owner put the Groq, OpenRouter and NVIDIA keys into the VM `.env` himself and recreated the chat container (02:49 UTC). The leader checked without printing a value: one line each in `.env`, the values present in the container, and an HTTP 200 from each provider's key check made inside the container; `/chat/health` shows Groq, NVIDIA, OpenRouter and Pollinations configured. One real question through the public URL took 1.6 s in total, all three agents answered by Groq `openai/gpt-oss-20b` (775, 446 and 387 ms), against about 90 s with Pollinations alone. **Cerebras:** its console now says "API access isn't active yet. Add a payment method to start running requests and claim $5 in free credits." The owner did not add a card, so `CEREBRAS_API_KEY` is not set and the chain skips it; the README and the provider module's comments now say so (the earlier "free trial" figures were the published ones on 25 Oct). Consequence for capacity: the arithmetic in the README's "Why 300 a day stays inside the free quotas" assumed Cerebras; without it only Groq's published quota (about 117 questions a day at the worst case) is certain, then NVIDIA (limit not published), OpenRouter (50 requests a day) and Pollinations. A correction note is in the README.

**29.17.4 Decisions.** Bring-your-own-LLM for the chat is dropped (owner, 27 Oct): it would take a visitor-supplied URL and key through the server (SSRF and key-handling risk), the weekly usage is short and the freeze is on 1 Nov; at the viva the way to use your own LLM is the SDK, where your agent sends its spans to AgentPulse. Hugging Face as an extra provider was looked at and not done: free accounts get no included Inference Providers credit (docs checked 26 Oct), so it is paid; moving the NLI and embedding models to an API was rejected because every measured number (151 ms, calibration) is for the local models.

**29.17.5 How the work ran, and traps.** The auto-mode safety check refuses `gh pr merge` ("Merge Without Review") unless the owner says yes in a card; one card per batch worked for #101 to #103 and for #105. It also refused a read of the `api_keys` table on the VM; the old key shown on one line of Section 21.4 was a test key created and revoked in the same section (revoke 200, then 401) and the line is now redacted. The seven-agent review used about 1.7M subagent tokens and took the five-hour usage window from 57% to 94%: weekly usage was 75% on 27 Oct (reset Sunday 1 Nov 04:00 UTC), so no more fan-outs of that size; a one-shot timer (CronCreate) was used to hand the fix brief to the author after the window reset. `gh run watch <id> --exit-status` run in the background tells when a deploy ends.

**29.17.6 State and what is next.** `main` is `6e344b6`; the VM `HEAD` is the same, all five containers healthy, disk about 33 GB free, nightly backup at 02:17 UTC (same disk). Open: #106 (the Lab's 429 sentence). Next, in order: merge #106 and check the Lab page live; the follow-up pull requests from the reviews (`adapters.ts` zero-fills and the trace status for HIGH alerts, `GET /v1/keys` public through nginx, fail-open defaults, the healthcheck on `/v1/health/ready`, input size limits on ingest and the WebSocket, deploy not gated on tests, 13 `npm audit` findings); on 30 and 31 Oct a full end-to-end test of every feature on the live site from a fresh browser plus the comment-only pass over the key files; on 1 Nov the freeze, the final handoff, a release tag, the README test counts with a dated re-run (backend 530 passed in `tests/` per #105's run, dashboard 304 on `main`), and the Lab's per-IP limits for the viva. **The owner's own tasks:** monitors in UptimeRobot for `/v1/health/ready`, `/v1/health/evaluator` and `/chat/health`; GitHub Secret Protection and push protection (the settings page showed them off; Dependabot alerts are on; keep Dependabot security updates off during the freeze); revoke the old NVIDIA key that was pasted into a chat (the new one is in the VM `.env`); restrict the Firebase web key in Google Cloud; test the write password once; decide where an off-VM copy of the nightly backup goes.

### 29.18 LIVE STATE (rolling; kept on branch `handoff/live`, merged into main once a day)

For a cloud session taking over when the local limits run out: read 29.16 and 29.17 first, then this. No key, token, password or hash here.

**End of day 2026-10-27 (~14:30 UTC), state for tomorrow or a cloud session:** `main` = `1bf26c4` (#112 merged: README rewritten, DEMO.md, HOW_IT_WORKS.md, `docs/E2E_TEST_2026-10-27.md` (all checks passed), release notes and `docs/FREEZE_COMMANDS_2026-11-01.md`, header-wrap and SVG fixes, comments). Its deploy failed once on a PyPI network error during the backend build (SSL EOF; nothing live changed, checkout put back at 329d4ab); the re-run succeeded: VM HEAD `1bf26c4`, `/v1/health/ready` 200, `/chat/health` 200, `/v1/keys` 401 (checked ~16:30 UTC). GitHub description and homepage are set and 5 topics were added (20 is GitHub's maximum). The checklist items "End-to-end test", "README", "comment pass" are DONE; "29.18 into main + 29.19" is done in #112 as far as that session wrote it. Still to do: (1) the release, tag `viva-1.0` (NOT a `v*` tag: `.github/workflows/release.yml` would push images as `latest` and start a PyPI job), commands in `docs/FREEZE_COMMANDS_2026-11-01.md`, fill the commit SHA in the notes; a cloud session CAN do this. (2) The Lab limits 20/60 in the VM `.env` + backend recreate (~1-2 Nov): VM only, the leader, NOT a cloud session. (3) 1 Nov final live check and freeze. (4) The owner's six tasks below. Weekly usage was 96% (reset Sun 1 Nov 04:00 UTC).

**WHAT REMAINS (checklist, 2026-10-27 ~13:10 UTC; tick by editing this list):**
Code and docs (session `final-completion` is on it now; a cloud session takes over from its pushed branch `docs/final-viva*` only if it stops):
- [ ] End-to-end test of the live site, results in `docs/E2E_TEST_2026-10-27.md`.
- [ ] README.md current and honest; other top-level docs corrected; `AGENTPULSE_DESIGN_SYSTEM.md` archived or updated.
- [ ] Comment-only pass on the key files (main.py, middleware.py, ingest.py, grounding.py, simulate_guard.py, worker, chat_server.py, chat_providers.py, App.tsx, stateModel.ts, traceStatus.ts, ChatConsole.tsx).
- [ ] 29.18 brought into main + section 29.19; the PR merged after the owner's yes; deploy checked.
Leader only (needs the VM or a public action, after the owner's yes):
- [ ] `gh repo edit` description + topics; release `v1.0-viva` (`gh release create`, notes in `docs/RELEASE_NOTES_v1.0-viva.md`).
- [ ] VM `.env`: `AGENTPULSE_SIMULATE_IP_PER_HOUR=20`, `AGENTPULSE_SIMULATE_IP_PER_DAY=60`, backend recreate (~1-2 Nov, before the viva).
- [ ] 1 Nov: freeze (no more merges), final check of `/v1/health/ready`, `/chat/health`, one chat turn, one Lab run.
The owner's own tasks (he said he will do them later; remind him):
- [ ] UptimeRobot: 3 monitors (https://agentpulse.centralindia.cloudapp.azure.com/v1/health/ready, /v1/health/evaluator, /chat/health).
- [ ] GitHub > Settings > Advanced Security: Secret Protection Enable + Push protection ON (keep Dependabot security updates off during the freeze).
- [ ] Revoke the OLD NVIDIA key at build.nvidia.com (the new one is in the VM .env).
- [ ] Restrict the Firebase web key (Google Cloud > Credentials, the site's domain only).
- [ ] Choose an off-VM place for the nightly backup (`~/backups/nightly` on the VM); the leader explains the download.
- [ ] Read `DEMO_GUIDE.md` and rehearse the demo once.

**Update 2026-10-27 ~13:00 UTC (weekly usage 96%):** running now: session `final-completion` (local_c1a36345, Sonnet, branch from main 329d4ab): (1) end-to-end test of the live site, results in `docs/E2E_TEST_2026-10-27.md`; (2) README and the other top-level docs made current and honest, `AGENTPULSE_DESIGN_SYSTEM.md` archived or updated; (3) a limited comment-only pass on the key files; (4) this section 29.18 brought into main plus a dated 29.19; (5) PREPARED, not run: `gh repo edit` description/topics, release `v1.0-viva` notes in `docs/RELEASE_NOTES_v1.0-viva.md`, the VM step for the Lab limits (20/hour, 60/day). It opens ONE PR into main and does not merge. If it stops on the usage limit, its pushed commits are on its branch (`docs/final-viva*`); a cloud session can finish steps 1-4 from there (no VM needed).

**Update 2026-10-27 ~12:40 UTC:** #111's deploy finished green and was checked: `/v1/health/ready` 200, `/chat/health` 200, the new "not scored yet" status text is in the live bundle. Nothing is open: no PR, no running session. The leader's hourly usage watch was stopped to save the last weekly usage (96%); this section is current as of now. Next (owner and leader): the end-to-end test on the live site on 30-31 Oct, the comment-only pass, the freeze on 1 Nov (final handoff, release tag, README counts: backend 628, dashboard 404; Lab per-IP limits 20/60).

**Update 2026-10-27 ~12:20 UTC (weekly usage 96%, 5-hour 72%):** #111 is MERGED (`main` = `329d4ab`, owner's yes); its deploy-azure run (backend + dashboard) was in progress when this was written. To check after it: `/v1/health/ready` 200, `/chat/health` 200, the Traces view shows "unknown" for a trace whose spans are not scored yet, `DEMO_GUIDE.md` is in the repository root. Left before the freeze: the end-to-end test on the live site (30-31 Oct), the comment-only pass, the final handoff and a release tag, the Lab's per-IP limits for the viva (20/60). With the weekly limit nearly used up, a cloud session may have to do the end-to-end checks that need no VM (browser and curl against the public URL).

**Update 2026-10-27 ~10:35 UTC (weekly usage 95%):** the Ponytail review is on branch `claude/ponytail-2026-10-27-78fda9` (`reviews/PONYTAIL_REVIEW_2026-10-27.md`: 1 must, 4 should, 5 nice; tests on main: backend 627 passed, dashboard 366 passed). Its fixes plus the RAG follow-ups and `DEMO_GUIDE.md` are in PR [#111](https://github.com/Soum-Code/agentpulse/pull/111) (`claude/wizardly-solomon-240235`, 31 files, author's local run: vitest 404, pytest 628; CI was pending; changes `/v1/drift` so an agent with no drift record reports `baseline_size` null instead of 0). NOT merged: the leader reads it, the owner says yes, then merge, deploy (backend + dashboard), live check. If the local limit stops the leader: a cloud session can review #111 and the end-to-end plan, but cannot reach the VM.

**Updated 2026-10-27 ~10:00 UTC** (weekly usage 93%, resets Sun 1 Nov 04:00 UTC). `main` = `e56a2e4`, live and healthy. Merged and deployed today after 29.17: #108 (trace status from alerts, unknown not ok/0), #109 (Caddy asks the write password for any `keys` path segment, ingest/WebSocket size limits, fail-closed start with the placeholder key, readiness healthcheck; Caddy validated and recreated 09:4x UTC; outside checks: `/v1/keys`, `/V1/keys`, `//v1/keys`, `/v1/keys/1` all 401, public reads 200, simulate 200, ingest POST 401, `/v1/health` dev_mode false), #110 (RAG chat restyled to the site's design after a taste-skill audit and the Apple Liquid Glass/HIG rules; contrast 0 failures measured by the author; live bundle has it; the console-tab chat renders in Dark).

Running: `ponytail-review-local` (session local_08b1a09f): a Ponytail review of everything changed since 21 Oct; output `reviews/PONYTAIL_REVIEW_2026-10-27.md` on branch `review/ponytail-2026-10-27` (pushed, no PR). A cloud attempt of the same review did not start.

Next, in order: (1) one fix PR for the review's must-fix items plus the RAG follow-ups from #110 (AgentLedger prints "None raised." before the answerer span arrives; the Corpus dialog claims "Indexed in vector store" with no check; answers show raw markdown), plus `DEMO_GUIDE.md` (the viva demo steps); (2) dated test counts (backend `tests/`, dashboard vitest 326 after #110) and a live smoke test; (3) 30-31 Oct end-to-end test of every feature on the live site, comment-only pass; (4) 1 Nov freeze, final handoff, release tag; ~2 Nov raise `AGENTPULSE_SIMULATE_IP_PER_HOUR`/`_PER_DAY` (20/60) + backend recreate. Merging needs the owner's yes (card). The auto-mode safety check was down ~08:00-09:20 UTC ('no verdict' on every action); if it happens again, ask the owner to switch the permission mode to Ask.
