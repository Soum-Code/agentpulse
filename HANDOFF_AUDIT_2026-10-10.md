# Handoff audit — 2026-10-10 to 2026-10-13

The raw material behind `SESSION_HANDOFF.md` Section 28. Five parts:

- **A.** 106 places where the old handoff (as it stood at PR #58's first tip, `7262ff0`) disagreed with the repository or with itself, **each with an independent skeptic's verdict**: 103 confirmed, 3 refuted.
- **B.** 16 more findings about Section 24's repository claims that no skeptic reached.
- **C.** 25 further discrepancies the skeptics stumbled on.
- **D.** The audit of the text the first reconciliation added: every statement the auditors did not find to hold (214 checked: 132 held, 50 overstated, 14 unsupported, 18 wrong). Section 28 already folds these in.
- **E.** A sweep of the GitHub repository for state the handoff did not mention.

**Line numbers (`L####`) in A–C refer to the old handoff, not the current file.** `MAIN` = `origin/main` (`e31fb58`); `PRE` = `7f78b3f`, the last `main` before it; `P56`, `P57`, `P58`, `P59` = the branches of PRs #56–#59; `NEW` in D = the handoff at PR #58's tip `7a4786c`.

## Read this first

- Findings were produced by automated finder agents; skeptic agents then re-checked each from a different route. A skeptic's *confirmed* is still an agent's reading, not a proof. Where a finding was also re-checked by hand it says **by hand**.
- Not covered: the finders for the TL;DR / Sections 25–26 repository claims (A2) and the model-dependent numbers (B2) never completed, so **the 25.1 paraphrase spreads and the 25.2 truncation count were not re-checked**, nor Sections 1–3 and 7–23.

| part A | count |
| :--- | ---: |
| wrong-now | 26 |
| misleading | 38 |
| stale | 18 |
| minor | 24 |
| **total** | **106** |
| skeptic confirmed | 103 |
| skeptic refuted | 3 |


## A. The 106 findings, with skeptic verdicts


### wrong-now

#### B1-01 — confirmed by skeptic and by hand

**Where:** L2855-2856 (section 24.9.3)

**The handoff says:** '10 of 34 paraphrase-signal pairs landed on the opposite side of the 0.6 alert threshold from their anchor'

**Reality (finder):** The numerator (10) is right but the denominator is not. 34 is the number of paraphrases generated, 2 of which were discarded before scoring. The scored population is 32 paraphrases x 2 signals = 64 paraphrase-signal pairs. Disagreement: 7 flips in 32. Contradiction: 3 flips in 32. 9 distinct paraphrases flipped at least one signal (one flipped both).

**Reality (skeptic's corrected statement):** 10 of 64 paraphrase-signal pairs flipped across the 0.6 alert threshold relative to their anchor (32 scored paraphrases x 2 signals; 2 of the 34 generated were discarded below the 0.85 similarity floor): disagreement 7 of 32, contradiction 3 of 32. Re-derived from experiments/results/paraphrase_stability.json at 7f78b3f (blob a31c296; present on PR #56/#57 branches, absent on MAIN e31fb58).

**Finder's evidence:**

~~~text
git -C <wt> show 7f78b3f:experiments/results/paraphrase_stability.json | python -I -c <per anchor: kept = variants without 'discarded'; flipped = count((x>0.6)!=(anchor>0.6)) for each signal> printed: 'total variants 34 discarded 2 kept 32' ; "TOTAL flips {'disagreement': 7, 'contradiction': 3} pairs {'disagreement': 32, 'contradiction': 32} sum flips 10 sum pairs 64" ; 'distinct paraphrases flipped on >=1 signal: 9 dis 7 con 3 both 1'. The generated PARAPHRASE_STABILITY_REPORT.md at 7f78b3f says only '10 paraphrase-signal pairs landed on the opposite side', with no 'of 34'.
~~~

#### B1-02 — confirmed by skeptic and by hand

**Where:** L41 (section 0, TL;DR)

**The handoff says:** '10 of 34 paraphrases crossed the alert threshold their anchor did not' (stated in the same sentence as the disagreement spreads, followed at L42 by 'It is disagreement specifically')

**Reality (finder):** 10 counts paraphrase-signal pairs, not paraphrases, and 3 of the 10 are contradiction flips. On disagreement the figure is 7 of 32 scored paraphrases (22%). Counting distinct paraphrases that flipped either signal gives 9 of 32. '10 of 34 paraphrases' is wrong on both numerator and denominator.

**Reality (skeptic's corrected statement):** 7 of 32 scored paraphrases crossed the 0.6 alert threshold on disagreement when their anchor did not (3 of 32 on contradiction; 10 of 64 paraphrase-signal pairs in all; 9 distinct paraphrases of 32 flipped at least one signal). Source: paraphrase_stability.json at 7f78b3f.

**Finder's evidence:**

~~~text
Same command as B1-01: "TOTAL flips {'disagreement': 7, 'contradiction': 3} pairs {'disagreement': 32, 'contradiction': 32}" and 'distinct paraphrases flipped on >=1 signal: 9 dis 7 con 3 both 1'.
~~~

#### B1-07 — confirmed by skeptic

**Where:** L2594-2595 (section 24.5)

**The handoff says:** 'Recorded in the limitations, in the template in ablation.py rather than the generated file' (the Config D / ingest-path caveat and the ONNX note)

**Reality (finder):** On MAIN and P58 those limitation bullets are gone. e31fb58 deleted the Config D / 1,328-evaluations bullet and the load_models(use_onnx=False) latency note from experiments/ablation.py, and reverted experiments/results/ablation_results.json to the 2026-08-23 17:56:09 UTC run. So on MAIN the Config B latency in the file is 188.07 ms again, and there is no 132 ms result anywhere in the tree.

**Reality (skeptic's corrected statement):** The Config D / ingest-path caveat and the ONNX latency note were added to the report template in experiments/ablation.py by 9cd0819 and are present at 7f78b3f, but e31fb58 (current MAIN) removed both and reverted experiments/results/ablation_results.json to the 2026-08-23 17:56 UTC run, so MAIN's ablation limitations text no longer carries them. PR #56 / #57 restore the template text; PR #58 and #59 do not.

**Finder's evidence:**

~~~text
git grep -n -E 'ingest path|1,328|use_onnx=False' e31fb58 -- experiments/ablation.py -> only 'e31fb58:experiments/ablation.py:243: load_models(use_onnx=False, sync=True)'; the same grep on 7f78b3f also returns lines 506, 510, 516. git diff 7f78b3f e31fb58 -- experiments/ablation.py shows the two bullets removed. git show e31fb58:experiments/results/ablation_results.json | grep timestamp -> '2026-08-23 17:56:09 UTC'.
~~~

#### B1-09 — confirmed by skeptic

**Where:** L2704 (24.9) and L2835 (24.9.3)

**The handoff says:** '`experiments/refusal_disagreement.py` exists to answer the confound...' and '`experiments/paraphrase_stability.py` turns 24.9.2 from three anecdotes into a measurement'

**Reality (finder):** Neither script, nor their result JSONs, nor REFUSAL_DISAGREEMENT_REPORT.md / PARAPHRASE_STABILITY_REPORT.md exist on MAIN or P58. e31fb58 deleted them (6 files, 3,376 deletions in experiments/). Every number in 24.9-24.9.5 can only be reproduced from 7f78b3f or the conflicting PR branches #56 / #57.

**Reality (skeptic's corrected statement):** On origin/main (e31fb58) and PR #58 (b86fc40), experiments/refusal_disagreement.py, experiments/paraphrase_stability.py, their two result JSONs under experiments/results/, REFUSAL_DISAGREEMENT_REPORT.md and PARAPHRASE_STABILITY_REPORT.md do not exist; e31fb58 deleted all six. They exist at 7f78b3f and on the open, conflicting PR branches #56 (f95d135) and #57 (74c7bb3). PR #59 (11a1eb1) does not restore them. 24.9-24.9.5 can only be re-derived from those refs.

**Finder's evidence:**

~~~text
git ls-tree -r --name-only e31fb58 | grep -i -E 'refusal_disagreement|paraphrase_stability' -> (no output); same for 7262ff0 -> (no output); the same command on 7f78b3f lists PARAPHRASE_STABILITY_REPORT.md, REFUSAL_DISAGREEMENT_REPORT.md, experiments/paraphrase_stability.py, experiments/refusal_disagreement.py, experiments/results/paraphrase_stability.json, experiments/results/refusal_disagreement.json. git diff --stat 7f78b3f e31fb58 -- experiments: '6 files changed, 11 insertions(+), 3376 deletions(-)'. git show e31fb58:experiments/refusal_disagreement.py -> fatal.
~~~

#### B1-10 — confirmed by skeptic

**Where:** L2698-2700 (24.8) and L3037 (24.10)

**The handoff says:** 'At max_tokens=320 the content came back empty... max_tokens is now 1200 and EmptyCompletion reports which of the two it saw' and 'EmptyCompletion in the demo exists for this'

**Reality (finder):** On MAIN and P58, demo/multi_model_pipeline.py has ask(..., max_tokens: int = 320) and no EmptyCompletion class. The 1200 default and the EmptyCompletion class existed only at PRE (7f78b3f:demo/multi_model_pipeline.py lines 196 and 181) and were reverted by e31fb58. The handoff also says 320 where the PRE source comment says 'At the 300 this file first used'.

**Reality (skeptic's corrected statement):** On origin/main (e31fb58) and PR #58, demo/multi_model_pipeline.py has ask(..., max_tokens: int = 320) and no EmptyCompletion class. The 1200 default (line 196) and EmptyCompletion (line 181) were added in 9c21047 (2026-09-19), existed at 7f78b3f, and were reverted by e31fb58. Open PR #59 (11a1eb1) restores them byte-for-byte from 7f78b3f. OLD L2699-2700 and L3037 are true only at 7f78b3f or on PR #59.

**Finder's evidence:**

~~~text
git grep -n -E 'max_tokens|class EmptyCompletion' e31fb58 -- demo/multi_model_pipeline.py -> 'e31fb58:demo/multi_model_pipeline.py:88:def ask(client: Any, model: str, prompt: str, *, max_tokens: int = 320)'; same at 7262ff0. git grep -n EmptyCompletion e31fb58 -> only dashboard/src/lib/ragApi.ts:138 (a fixture string). At 7f78b3f: 'demo/multi_model_pipeline.py:196: max_tokens: int = 1200,' and ':181:class EmptyCompletion(RuntimeError)'.
~~~

#### B3-01 — confirmed by skeptic

**Where:** L2594-2595 (section 24.5)

**The handoff says:** Config D's production-ingest caveat was 'Recorded in the limitations, in the template in `ablation.py` rather than the generated file'.

**Reality (finder):** True at PRE only. e31fb58 (the MAIN commit) removed the limitation paragraphs from both THRESHOLD_ANALYSIS.md and the template in experiments/ablation.py, along with the use_onnx=False latency caveat. On MAIN and P58 neither file mentions the production ingest path, '1,328 live evaluations' or the PyTorch-only latency path.

**Reality (skeptic's corrected statement):** The Config D production-ingest limitation (and the use_onnx=False / PyTorch-only latency caveat) was added to THRESHOLD_ANALYSIS.md and to the experiments/ablation.py template in 9cd0819 (2026-09-18) and removed again by e31fb58. At 7f78b3f it is at THRESHOLD_ANALYSIS.md:93-104 and ablation.py:506-517. On origin/main and PR #58 (b86fc40) neither file contains it. Only `load_models(use_onnx=False, sync=True)` at ablation.py:243 remains.

**Finder's evidence:**

~~~text
`git grep -n -E "1,328|use_onnx=False|does not exercise the production ingest" 7f78b3f -- THRESHOLD_ANALYSIS.md experiments/ablation.py` -> THRESHOLD_ANALYSIS.md:93,97,103 and experiments/ablation.py:506,510,516. Same command on origin/main and origin/fix/no-mock-fallback -> only `experiments/ablation.py:243:    load_models(use_onnx=False, sync=True)`. `git diff 7f78b3f origin/main -- THRESHOLD_ANALYSIS.md experiments/ablation.py` shows the paragraphs as removed lines.
~~~

#### B3-02 — confirmed by skeptic

**Where:** L2580-2583, L2597 (section 24.5); L215 (next-steps item 8)

**The handoff says:** The ablation was re-run and Config B latency 'did move, 188.1ms to 132-135ms'; a reader would expect experiments/results/ablation_results.json to carry the re-run.

**Reality (finder):** On MAIN (and P58) ablation_results.json is byte-identical to the 2026-08-23 17:56 UTC version (git blob 69d86a2f...). e31fb58 reverted the 2026-09-18 re-run: timestamp is again 2026-08-23 17:56:09 UTC and Config B latency is 188.07 ms. The re-run (132.09 ms, 2026-09-18 17:34:03 UTC) exists only at PRE/P56/P57. L215 item 8 ('Still open ... ablation_results.json is dated 2026-08-23') therefore describes MAIN accurately while L2580 says the item's premise was wrong.

**Reality (skeptic's corrected statement):** The 24.5 re-run (ablation_results.json blob c0bd9e4, timestamp 2026-09-18 17:34:03 UTC, Config B latency 132.09 ms) exists only at 9cd0819/7f78b3f and on PRs #56 and #57. e31fb58 reverted it. On origin/main and PR #58 (b86fc40) the file is blob 69d86a2 again: timestamp 2026-08-23 17:56:09 UTC, Config B latency 188.07 ms. Item 8 at L215 is therefore accurate for main and contradicts 24.5.

**Finder's evidence:**

~~~text
`git rev-parse e31fb58:experiments/results/ablation_results.json origin/main:... 73b533f:... 9cd0819:...` -> e31fb58 = origin/main = origin/fix/no-mock-fallback = 69d86a2fce5edab99db11cf6675d53884e63e912 = 73b533f; 9cd0819 = c0bd9e4eebf112a682741f9cb79810f88fb6bac1. Python diff of JSON: `9cd0819 vs e31fb58: Config_B_DeBERTa_Only latency_ms 132.09 -> 188.07`, timestamps '2026-09-18 17:34:03 UTC' vs '2026-08-23 17:56:09 UTC'. `git diff 7f78b3f origin/main --stat -- THRESHOLD_ANALYSIS.md experiments/ablation.py experiments/results/ablation_results.json` -> 3 files, 20 insertions, 42 deletions.
~~~

#### B3-04 — confirmed by skeptic

**Where:** L2657-2665 and L2698-2700 (sections 24.7, 24.8)

**The handoff says:** 'Working set at the time of writing' of five OpenRouter families (researcher nvidia/nemotron-3.5-lightning:free, retriever deepseek/deepseek-v4-flash-0731:free, verifier nex-agi/nex-n2.5-pro:free, analyst poolside/laguna-s-2.1:free, writer inclusionai/ling-3.0-flash-vl:free); and 'max_tokens is now 1200 and EmptyCompletion reports which of the two it saw'.

**Reality (finder):** True for demo/multi_model_pipeline.py at PRE only. On MAIN the file is the pre-23.4 version: AGENT_MODELS is qwen/qwen3.8-27b:free, deepseek/deepseek-v4-flash-0731:free, z-ai/glm-5.2:free, nvidia/nemotron-3.5-lightning:free, liquid/lfm-2.5-2.6b:free (the set 24.7 says fails: two 'Provider returned error' and liquid returns empty content), ask() has max_tokens=320, and there is no EmptyCompletion class, no PROVIDERS dict and no nvidia provider. The 1200/EmptyCompletion fix survives on P58 only inside demo/chatbot/app.py.

**Reality (skeptic's corrected statement):** The five-family working set and the max_tokens=1200 / EmptyCompletion fix of 24.7-24.8 exist in demo/multi_model_pipeline.py only at 7f78b3f (442 lines; added in 9c21047; also on PR #59). On origin/main and PR #58 (b86fc40) the file is the 256-line pre-23.4 form. It uses qwen/qwen3.8-27b, deepseek-v4-flash-0731, z-ai/glm-5.2, nemotron-3.5-lightning and liquid/lfm-2.5-2.6b, has `max_tokens: int = 320`, and has no EmptyCompletion or PROVIDERS. On PR #58 the 1200 / EmptyCompletion logic survives only in demo/chatbot/app.py (MAX_TOKENS = 1200, class EmptyCompletion).

**Finder's evidence:**

~~~text
`git show origin/main:demo/multi_model_pipeline.py | sed -n 65,70p` -> researcher qwen/qwen3.8-27b:free ... verifier z-ai/glm-5.2:free ... writer liquid/lfm-2.5-2.6b:free. `git grep -n -E 'EmptyCompletion|max_tokens' origin/main -- demo/multi_model_pipeline.py` -> only `:88:def ask(..., max_tokens: int = 320)` and `:99`. Same grep on 7f78b3f -> `:181:class EmptyCompletion`, `:196: max_tokens: int = 1200`. `git show 7f78b3f:demo/multi_model_pipeline.py | sed -n 139,144p` equals the handoff's list; wc -l: 7f78b3f 442 lines, origin/main 256.
~~~

#### B3-05 — confirmed by skeptic and by hand

**Where:** L13 (TL;DR), L179 (section 3 'Test suite'), L1612 (section 20.5)

**The handoff says:** '209/209 tests passing' (TL;DR, stated as current); 'the 269 tests run locally' (20.5).

**Reality (finder):** 209 was the correct figure on 2026-08-28 (static count 209 at a19d7a1/4cc2072) and L179 dates it, but L13 states it as the current state. On MAIN there are 258 test functions in 22 files (about 260 collected with the one parametrised test), matching README.md:153 '260 passed'. L1612 '269' does not match the backend count when it was written: 196ab2c (2026-09-16, the commit that added the sentence) has 237 test functions, which is also what L1571 in the same section says (237 automated tests). 269 equals 237 backend + 32 dashboard, or the PRE-era pytest total (269 at 11dc2cc), neither of which is the number of tests on MAIN.

**Reality (skeptic's corrected statement):** On origin/main (e31fb58) and PR #58 there are 258 backend test functions in 22 files, about 260 collected because test_favicon.py has one 3-way parametrize. README.md:153 says '260 passed', plus 32 dashboard Vitest tests. 209/209 was the count on 2026-08-28 (a19d7a1). The '269' in 20.5 is 237 backend + 32 dashboard at 196ab2c, not a backend count. If PR #59 merges it restores tests/test_alerting.py, taking the backend to 262 test functions.

**Finder's evidence:**

~~~text
`git grep -c -E "^\s*(async )?def test_" REF -- tests/ | awk -F: '{s+=$NF} END{print s,NR}'` -> a19d7a1 209/18 files; 196ab2c 237/20; 1f752de 258/22; 7f78b3f 267/24; origin/main 258/22; origin/fix/no-mock-fallback 258/22; origin/fix/grounding-truncation-visible 270/25. `git log -S'the 269 tests run' -- SESSION_HANDOFF.md` -> 196ab2c 2026-09-16. `git show origin/main:README.md | sed -n 153p` -> 'Current state: **260 passed**'. Commit text: 975717f '264/264', 11dc2cc '269/269', f95d135 '272/272', P58 PR '260/260'.
~~~

#### B3-06 — confirmed by skeptic

**Where:** L3149-3150 (section 25.3); L2704 and L2835 (section 24.9, 24.9.3)

**The handoff says:** 25.3 tests 'the nine real retriever outputs in the experiment data'; 24.9 says `experiments/refusal_disagreement.py` 'exists' and 24.9.3 says `experiments/paraphrase_stability.py` 'turns 24.9.2 ... into a measurement'.

**Reality (finder):** The nine outputs live in experiments/results/refusal_disagreement.json, which, together with both scripts and experiments/results/paraphrase_stability.json, was deleted by e31fb58. On MAIN and P58 none of the four files exist; they are present only at PRE, P56 and P57. A reader on main cannot reproduce 25.3's 9/9 and 0/9 or the 24.9.3 table, and the 'exists' statements are false there.

**Reality (skeptic's corrected statement):** The nine retriever outputs used in 25.3 (experiments/results/refusal_disagreement.json, key context_cache), the two scripts experiments/refusal_disagreement.py and experiments/paraphrase_stability.py, experiments/results/paraphrase_stability.json, and REFUSAL_DISAGREEMENT_REPORT.md and PARAPHRASE_STABILITY_REPORT.md all exist at 7f78b3f and on PRs #56 and #57. e31fb58 deleted them, and they are absent on origin/main, PR #58 and PR #59. Recover them with `git show 7f78b3f:<path>`.

**Finder's evidence:**

~~~text
`git ls-tree --name-only origin/main experiments/results/refusal_disagreement.json experiments/results/paraphrase_stability.json experiments/refusal_disagreement.py experiments/paraphrase_stability.py` -> (empty); same for origin/fix/no-mock-fallback. Same command on 7f78b3f, origin/fix/grounding-truncation-visible and origin/docs/handoff-25-5 lists all four. Working tree: `ls experiments/results/refusal_disagreement.json` -> No such file or directory.
~~~

#### C01 — confirmed by skeptic and by hand

**Where:** L44 (TL;DR, section 0)

**The handoff says:** Section 14's '0 of 10' now has a mechanism ... 'The `HIGH` alert has been withdrawn; the score is still computed and stored.'

**Reality (finder):** False on main and on PR #58. Commit 975717f (2026-09-20) withdrew the AGENT_DISAGREEMENT rule; e31fb58 reverted that, and the rule is live again at threshold 0.6 with severity HIGH.

**Reality (skeptic's corrected statement):** OLD L44 (section 0) is true for PRE (7f78b3f) but false on main e31fb58 and on PR #58. 975717f withdrew the AGENT_DISAGREEMENT alert on 2026-09-20, and e31fb58 (2026-09-21) re-added it as a live rule (HIGH, disagreement_score > 0.6, backend/app/services/alerting.py around L300). Until PR #59 (11a1eb1, restores the PRE blob e952011) merges, those alerts fire on main and are unreliable per 24.9.4-24.9.5.

**Finder's evidence:**

~~~text
`git grep -n "AGENT_DISAGREEMENT\|WITHDRAWN" origin/fix/no-mock-fallback -- backend/app/services/alerting.py` -> `alerting.py:300:  alert_type="AGENT_DISAGREEMENT",` and no WITHDRAWN line. Same command on 7f78b3f -> `alerting.py:300: # WITHDRAWN 2026-09-20.` `git log -S"WITHDRAWN 2026-09-20" -- backend/app/services/alerting.py` -> `e31fb58 ... remove tool claim tracking and alerting` and `975717f ... Withdraw the AGENT_DISAGREEMENT alert; keep the score`.
~~~

#### C02 — confirmed by skeptic

**Where:** L40 (TL;DR, section 0); also L3037 (section 24, 'EmptyCompletion in the demo exists for this')

**The handoff says:** 'The 23.4 multi-model pipeline had never worked, and now does. Five faults in one file.'

**Reality (finder):** On main and PR #58 demo/multi_model_pipeline.py is the pre-fix version again. There is no `await pulse.start()`, shutdown is called without await (the exact fault of 24.1), and EmptyCompletion does not exist. It delivers zero spans again.

**Reality (skeptic's corrected statement):** OLD L40 (section 0) and L3037 (section 24) are false on main e31fb58 and PR #58. 98171cc fixed demo/multi_model_pipeline.py (start the client, await shutdown, EmptyCompletion). e31fb58 reverted the file to the pre-fix blob 2a8f2579, so on main the demo again never calls `await pulse.start()`, calls `pulse.shutdown()` without await (L247), has no EmptyCompletion, and delivers zero spans. PR #59 (open) restores the PRE blob 071b56e1.

**Finder's evidence:**

~~~text
`git grep -n "pulse.start\|pulse.shutdown\|EmptyCompletion" 7f78b3f -- demo/multi_model_pipeline.py` -> `:410: await pulse.start()`, `:433: await pulse.shutdown()`, `:181: class EmptyCompletion`. Same grep on origin/main and origin/fix/no-mock-fallback -> only `:247: pulse.shutdown()` (no start, no await, no EmptyCompletion). `git log -S"await pulse.start()" -- demo/multi_model_pipeline.py` -> `e31fb58` and `98171cc 2026-09-18 Make the multi-model pipeline actually deliver its spans`.
~~~

#### C03 — confirmed by skeptic and by hand

**Where:** L176 (section 4)

**The handoff says:** 'Dev servers via .claude/launch.json: agentpulse-backend (uvicorn, port 8000)'

**Reality (finder):** On main and PR #58 the backend entry runs .venv/Scripts/uvicorn.exe, the stale shim that exits 1 with no output and binds nothing. Commit d0b600b fixed it (python -m uvicorn) but e31fb58 reverted the fix. The handoff elsewhere (L3058) says to use python -m uvicorn, so the doc and the shipped launch.json disagree.

**Reality (skeptic's corrected statement):** OLD L176 (section 4) is misleading on main e31fb58 and PR #58. .claude/launch.json again runs `.venv/Scripts/uvicorn.exe`, a stale shim whose baked-in interpreter path (`...\project one agent\.venv\...`) no longer exists, so the entry exits 1 silently and binds nothing. d0b600b had switched it to `.venv/Scripts/python.exe -m uvicorn`; e31fb58 reverted that, and PR #59 (11a1eb1, open) restores it. Always use `python -m <tool>`.

**Finder's evidence:**

~~~text
`git show origin/main:.claude/launch.json` -> `"runtimeExecutable": ".venv/Scripts/uvicorn.exe"`, `"runtimeArgs": ["app.main:app", "--app-dir", ...]` (identical on origin/fix/no-mock-fallback). `git show 7f78b3f:.claude/launch.json` -> `".venv/Scripts/python.exe"` with `["-m", "uvicorn", "app.main:app", ...]`. `./.venv/Scripts/uvicorn.exe --version; echo exit=$?` -> `exit=1`, no other output; `./.venv/Scripts/python.exe -m uvicorn --version` -> `Running uvicorn 0.52.3`.
~~~

#### C04 — confirmed by skeptic and by hand

**Where:** L176 (section 4)

**The handoff says:** 'agentpulse-dashboard (vite, port 5173)'

**Reality (finder):** `npm run dev` serves vite on port 3000. 5173 is the Docker/nginx port only. launch.json declares 5173 on main and PR #58 (d0b600b had corrected it to 3000; e31fb58 reverted), so the preview opens an empty tab. The repo README and STARTUP_GUIDE say 'Open http://localhost:5173' after npm run dev, which is also wrong for the dev server. In addition, on main `npm run dev` runs the agentpulse-mock-api fixture middleware (see C21).

**Reality (skeptic's corrected statement):** OLD L176 (section 4) is wrong: the local dev server (`npm run dev`, dashboard/package.json and vite.config.ts) listens on port 3000. Port 5173 belongs only to the Docker/nginx build (docker-compose.yml:56, dashboard/nginx.conf:2, deploy/*). launch.json on main and PR #58 still declares 5173; PR #59 sets it to 3000. README.md:78 and STARTUP_GUIDE.md:145 say 5173 after `npm run dev`, which is also wrong.

**Finder's evidence:**

~~~text
`git show origin/main:dashboard/package.json` -> `"dev": "vite --port=3000 --host=0.0.0.0"`; `git show origin/main:dashboard/vite.config.ts | grep -n port` -> `264: port: 3000,`; `git show origin/main:.claude/launch.json` -> `"port": 5173`. docker-compose.yml:56 `"5173:5173"`, dashboard/nginx.conf:2 `listen 5173;`, deploy/oracle/README.md:107 `:5173` (Docker). `git show d0b600b` message: 'The entry declared 5173 while npm run dev runs vite --port=3000'.
~~~

#### C05 — confirmed by skeptic and by hand

**Where:** L52 (TL;DR) and L178 (section 4)

**The handoff says:** 'Docker, GitHub, and dev-server setup are all previously verified working' / 'Docker (docker compose up --build) was verified working end-to-end ... nothing since should have broken it.'

**Reality (finder):** Broken on main and PR #58. e31fb58 deleted dashboard/package-lock.json (and bun.lock) but dashboard/Dockerfile and deploy/huggingface/Dockerfile still COPY the lockfile, so the dashboard image cannot be built. The doc also contradicts itself: Section 18.5 says Compose 'could never have worked' (4 further faults) so 'verified working earlier' was false when written. The dev-server half is false too (C03, C04).

**Reality (skeptic's corrected statement):** OLD L52/L178 (section 0/4) overstate. 'docker compose up --build was verified working' is contradicted by OLD L32 and section 18.5 (four more faults were fixed later). On main e31fb58 and PR #58 the dashboard image cannot build, because e31fb58 deleted dashboard/package-lock.json while dashboard/Dockerfile:3 and deploy/huggingface/Dockerfile:11 still COPY it and run `npm ci`. PR #59 restores the lockfile. Static reading only; docker not run.

**Finder's evidence:**

~~~text
`git cat-file -e origin/main:dashboard/package-lock.json` -> missing (present on 7f78b3f). `git grep -n package-lock origin/fix/no-mock-fallback -- dashboard/Dockerfile deploy/huggingface/Dockerfile` -> `dashboard/Dockerfile:3:COPY package.json package-lock.json .` and `deploy/huggingface/Dockerfile:11:COPY dashboard/package.json dashboard/package-lock.json ./`. `git ls-files | grep -c package-lock` in the PR #58 worktree -> 0. (Static analysis only; docker was not run.)
~~~

#### C07 — confirmed by skeptic and by hand

**Where:** L174 (section 4)

**The handoff says:** 'Repo: https://github.com/Soum-Code/agentpulse (private).'

**Reality (finder):** The repo is public (and L34 / Section 18.8 of the same document say so).

**Reality (skeptic's corrected statement):** OLD L174 (section 4): the repo https://github.com/Soum-Code/agentpulse is public (MIT), not private; it was made public in section 18.8.

**Finder's evidence:**

~~~text
`gh repo view Soum-Code/agentpulse --json visibility,isPrivate` -> `"isPrivate":false ... "visibility":"PUBLIC"`.
~~~

#### C09 — confirmed by skeptic and by hand

**Where:** L181 (section 4)

**The handoff says:** 'as launched, it writes to backend/data/agentpulse.db. Query that one when verifying, not the root one.'

**Reality (finder):** Backwards. The populated DB is the root-relative ./data/agentpulse.db; backend/data/agentpulse.db is the empty one that bites a process started inside backend/. The same document says so at L3061-3064 (s24). launch.json has no cwd, and --app-dir only sets sys.path, so the DB is <cwd>/data/agentpulse.db. The README quickstart (API from root, then `cd backend && python -m app.worker`) splits the two processes across the two files.

**Reality (skeptic's corrected statement):** OLD L181 (section 4) is backwards. The database is <cwd>/data/agentpulse.db (config.py:20, relative path; launch.json sets no cwd), so launched from the repo root the populated file is ./data/agentpulse.db (20,870 spans in the main checkout). backend/data/agentpulse.db is the empty one (0 rows), which bites a process started inside backend/, for example the README's `cd backend && python -m app.worker` (dies on `no such table: evaluation_jobs`, per L3061-3064). Start API and worker from the same cwd; each worktree has its own data/.

**Finder's evidence:**

~~~text
Read-only sqlite3 (mode=ro): main checkout data/agentpulse.db -> spans 20870, evaluations 1427, alembic_version 8d86fee0d663; backend/data/agentpulse.db -> tables: only alembic_version, 0 rows. Worktree handoff-continuation-bb2790 (the s26 chatbot session): data/agentpulse.db -> 216 spans (to 2026-09-20), backend/data/agentpulse.db -> 0 spans. `git show origin/main:README.md | sed -n 50,62p` -> `uvicorn app.main:app --app-dir backend ...` then `cd backend && python -m app.worker`.
~~~

#### C11 — confirmed by skeptic

**Where:** L200 (section 5) and L216 (section 6 item 9)

**The handoff says:** 'This repo has only ever had a main branch; every commit across every session has gone directly to it ... Keep committing directly to main unless told otherwise; don't assume.'

**Reality (finder):** Answered de facto. Since 2026-09-01 work lands through topic branches and PRs: 58 PRs (#1-#58), all base main, 55 merged, 3 open. PRs #1-#3 were squash-merged ('(#1)' suffix); #4 onward are merge commits (52 'Merge pull request' commits on main's first-parent). Branch prefixes: docs 23, fix 19, feat 6, chore 3, deploy/test/claude/exp 1 each. The only direct commit on main since PR #4 (2026-09-14) is the owner's e31fb58. Section 19.0 of the same document says 'Thirteen pull requests, #4 through #16, all merged'. Following L200 would create direct-to-main commits against the practice of 55 merged PRs.

**Reality (skeptic's corrected statement):** OLD L200 (section 5) and L216 item 9 are stale: the branch/PR question was settled in practice. Since PR #4 (088aebc, merged 2026-09-14) all work lands as topic-branch PRs against main (59 PRs: 55 merged, #56-#59 open; branches prefixed docs/ fix/ feat/ chore/). #1-#3 were squash merges (09-01..09-06), followed by direct commits until 09-14. The only direct commit on main since #4 is the owner's e31fb58 (2026-09-21).

**Finder's evidence:**

~~~text
`gh pr list --state all --limit 100 --json ...` -> total 58, {MERGED:55, OPEN:3}, bases {main:58}, first created 2026-08-31 (PR #1). `git log --first-parent origin/main --since=2026-09-01 --format='%h|%ad|%an|%s' | grep -v 'Merge pull request'` -> e31fb58 (2026-09-21), three 2026-09-14 docs/deploy commits, and earlier 09-06/09-01 squash merges `(#3) (#2) (#1)`. `git log --first-parent origin/main --format=%s | grep -c '^Merge pull request'` -> 52. 87 direct first-parent commits exist, almost all before 2026-09-14.
~~~

#### D-01 — confirmed by skeptic and by hand

**Where:** L44 (TL;DR) and L3179 (section 25.4 table); contrast L2985 (section 24.9.5)

**The handoff says:** TL;DR: 'The `HIGH` alert has been withdrawn; the score is still computed and stored.' 25.4: 'disagreement ... alerting withdrawn (24.9.5)'.

**Reality (finder):** On MAIN and on P58 (identical file) the AGENT_DISAGREEMENT rule is live: severity HIGH, threshold 0.6, on disagreement_score. The 'WITHDRAWN 2026-09-20' commented-out version exists only on PRE, P56 and P57. e31fb58 restored the live rule. Section 24.9.5 itself (L2985) says 'It should not be shipping a HIGH severity alert in that state', so the document contradicts itself, and 24.9.5 records no withdrawal at all.

**Reality (skeptic's corrected statement):** On origin/main (e31fb58) and PR #58 the AGENT_DISAGREEMENT rule is live (backend/app/services/alerting.py:299-306, severity HIGH, threshold 0.6 on disagreement_score, blob 688315f8). The withdrawal (975717f, 'WITHDRAWN 2026-09-20' block) exists only at 7f78b3f, P56, P57, P59 (blob e9520115) and origin/claude/optimistic-knuth-0z7l6z; e31fb58 reverted it. OLD 24.9.5 recommends disabling the alert but never records that it was done.

**Finder's evidence:**

~~~text
[R=<repo> git -C "$R" show origin/main:backend/app/services/alerting.py | sed -n '298,306p' -> 'AlertRule(  alert_type="AGENT_DISAGREEMENT",  severity="HIGH",  condition_field="disagreement_score",  threshold=0.6,'. git -C "$R" diff 7f78b3f origin/main -- backend/app/services/alerting.py -> '-            # WITHDRAWN 2026-09-20. The rule above is kept as a comment rather than deleted' ... '+            AlertRule(' '+                alert_type="AGENT_DISAGREEMENT",'. git -C "$R" diff --stat origin/main HEAD -- backend/app/services/alerting.py -> empty (P58 equals MAIN). git -C "$R" grep -n 'AGENT_DISAGREEMENT' origin/fix/grounding-truncation-visible -- backend/app/services/alerting.py -> only commented lines 307-309. grep -n -i 'withdr' SESSION_HANDOFF.md -> L44, L3179 only.
~~~

#### D-02 — confirmed by skeptic

**Where:** L38 (TL;DR), L902 (16.7), L922 (17.1 table), L144-148 (Section 2 'Other reference docs')

**The handoff says:** 'Design direction is frozen in `bedhi_frontend.md`'; 'bedhi_frontend.md is the frozen design research baseline'; Section 2 lists MASTER_PROMPT_CORRECTIONS.md, IMPLEMENTATION_MAP.md, DASHBOARD_REDESIGN_PROMPT.md as reference docs.

**Reality (finder):** All four files were deleted on 2026-09-14 in c6198e3 ('drop the agent prompts') and are absent on MAIN, PRE and P56. Section 19.9 mentions 'four agent prompt files' but never names them, so nothing connects the deletion to these pointers.

**Reality (skeptic's corrected statement):** bedhi_frontend.md, MASTER_PROMPT_CORRECTIONS.md, IMPLEMENTATION_MAP.md and DASHBOARD_REDESIGN_PROMPT.md were deleted on 2026-09-14 in c6198e3 and exist on no current ref (main, PRE, P56-P59). The design direction now lives only in AGENTPULSE_DESIGN_SYSTEM.md. The 'four agent prompt files' in 19.9 are these four.

**Finder's evidence:**

~~~text
[R] git -C "$R" cat-file -e origin/main:bedhi_frontend.md -> not found (same for MASTER_PROMPT_CORRECTIONS.md, IMPLEMENTATION_MAP.md, DASHBOARD_REDESIGN_PROMPT.md). git -C "$R" log --all --diff-filter=D --format='%h %ad %s' --date=short -- bedhi_frontend.md -> 'c6198e3 2026-09-14 Document how the system actually works, and drop the agent prompts'. git -C "$R" show --stat c6198e3 -> 'DASHBOARD_REDESIGN_PROMPT.md | 50 ---', 'IMPLEMENTATION_MAP.md | 104 ------', 'MASTER_PROMPT_CORRECTIONS.md | 93 -----', 'bedhi_frontend.md | 871 ------'.
~~~

#### D-03 — confirmed by skeptic and by hand

**Where:** L174 (Section 4)

**The handoff says:** 'Repo: https://github.com/Soum-Code/agentpulse (private).'

**Reality (finder):** The repository is public (and carries an MIT licence). Section 18.8 (L1173) records the switch on 2026-09-12, so Section 4 contradicts a later section.

**Reality (skeptic's corrected statement):** https://github.com/Soum-Code/agentpulse has been public (MIT-licensed) since 2026-09-12 (18.8); Section 4's '(private)' is wrong.

**Finder's evidence:**

~~~text
gh repo view Soum-Code/agentpulse --json visibility,isPrivate,licenseInfo -> {"isPrivate":false,"licenseInfo":{"key":"mit"...},"visibility":"PUBLIC"}
~~~

#### D-04 — confirmed by skeptic

**Where:** L198-200 (Section 5), L216 (Section 6 item 9)

**The handoff says:** 'This repo has only ever had a `main` branch; every commit across every session has gone directly to it ... Keep committing directly to `main` unless told otherwise.' Item 9 still lists the branch/PR question as an open one-line decision.

**Reality (finder):** The repository has 58 PRs (55 merged, 3 open) and 34 remote branches. Section 19 itself says 'Thirteen pull requests, #4 through #16, all merged', and the current work is PRs #56-#58. The workflow question has been settled by practice.

**Reality (skeptic's corrected statement):** The repo has had topic branches and PRs since 2026-08-31/09-01: 59 PRs as of 2026-10-11 (#1-#59; 55 merged, 4 open: #56-#59) and 34 remote branches. 'Only ever had a main branch' was true only until PR #1; the 'commit directly to main' instruction and item 9's branch/PR half are obsolete.

**Finder's evidence:**

~~~text
gh pr list --state all --limit 100 --json number,state,headRefName -> total PRs 58, min 1, max 58, Counter({'MERGED': 55, 'OPEN': 3}). git -C "$R" branch -r | wc -l -> 34.
~~~

#### D-05 — confirmed by skeptic

**Where:** L2594-2595 and L2597-2600 (24.5)

**The handoff says:** 'Recorded in the limitations, in the template in `ablation.py` rather than the generated file'; 'Latency did move, 188.1ms to 132-135ms on Config B across three runs'.

**Reality (finder):** On MAIN and P58 neither the ablation.py limitation text nor the regenerated figures exist. e31fb58 deleted the 'does not exercise the production ingest path, Config D is the clearest case' bullet and the load_models(use_onnx=False) note from both experiments/ablation.py and THRESHOLD_ANALYSIS.md, and reverted THRESHOLD_ANALYSIS.md to its 2026-08-23 figures (Config B 188.07 ms, cascade 215.9 ms).

**Reality (skeptic's corrected statement):** The 24.5 limitation note (production ingest path, Config D) and the load_models(use_onnx=False) note, and the regenerated figures (Config B 132.09 ms, report dated 2026-09-18), exist only at 7f78b3f / P56 / P57. On main, P58 and P59, experiments/ablation.py, THRESHOLD_ANALYSIS.md and ablation_results.json are back at the 2026-08-23 state (Config B 188.07 ms, cascade 215.9 ms). The classification metrics are unchanged between the two states.

**Finder's evidence:**

~~~text
git -C "$R" diff 7f78b3f origin/main -- experiments/ablation.py THRESHOLD_ANALYSIS.md -> '-- **This study does not exercise the production ingest path, and Config D is the clearest' ; '-**Date:** 2026-09-18 17:34:03 UTC' ; '+**Date:** 2026-08-23 17:56:09 UTC' ; '-| B DeBERTa Only ... | 132.09 |' ; '+| B DeBERTa Only ... | 188.07 |'. git diff --stat 7f78b3f origin/main shows experiments/ablation.py | 13 +- and experiments/results/ablation_results.json | 20 +-.
~~~

#### D-06 — confirmed by skeptic

**Where:** L2704, L2835 (24.9, 24.9.3); L41-43, L45 (TL;DR); L2744-2750

**The handoff says:** The handoff presents `experiments/refusal_disagreement.py` and `experiments/paraphrase_stability.py` (and by implication their results files) as the tools and data behind the 87-trial and 34-paraphrase results.

**Reality (finder):** All of these were deleted by e31fb58 on 2026-09-21 and are absent on MAIN and P58. They exist on PRE, P56 and P57. The 24.9 numbers can no longer be re-derived from the repo a reader lands on. The same commit deleted tests/test_alerting.py and tests/test_tool_claim_coverage.py.

**Reality (skeptic's corrected statement):** experiments/refusal_disagreement.py, experiments/paraphrase_stability.py, their experiments/results/*.json, REFUSAL_DISAGREEMENT_REPORT.md, PARAPHRASE_STABILITY_REPORT.md and tests/test_tool_claim_coverage.py were deleted from main by e31fb58 (tests/test_alerting.py too, restored by P59 11a1eb1). They exist only at 7f78b3f, on P56/P57, and on origin/claude/optimistic-knuth-0z7l6z (27a5f25), not on main or PR #58.

**Finder's evidence:**

~~~text
git -C "$R" cat-file -e origin/main:experiments/refusal_disagreement.py -> missing (also paraphrase_stability.py). git -C "$R" log --all --diff-filter=D --format='%h %ad %s' --date=short -- experiments/refusal_disagreement.py -> 'e31fb58 2026-09-21 refactor: remove tool claim tracking and alerting'; --diff-filter=A -> added 5583a42 2026-09-19. git diff --stat 7f78b3f origin/main -> 'experiments/paraphrase_stability.py | 346 -', 'experiments/refusal_disagreement.py | 688 --', 'experiments/results/refusal_disagreement.json | 2054 ----', 'PARAPHRASE_STABILITY_REPORT.md | 58 -', 'REFUSAL_DISAGREEMENT_REPORT.md | 74 -'.
~~~

#### E2 — confirmed by skeptic and by hand

**Where:** L3319-3322 (section 26.3) and L3278-3279 ('17 on-corpus questions the six documents can answer'); also demo/chatbot/app.py L31-34

**The handoff says:** The retriever's drift stayed at 0.093 'correctly' because 'its output barely changes with the question ... because the corpus is the same six documents regardless of what is asked'; the on-corpus half of the probe is questions 'the six documents can answer', implying their evidence supports the answers.

**Reality (finder):** The chatbot process never loads the embedding model. get_embedding() returns None there, so LocalVectorIndex.build_index() and .search() fall back to a character-count hash over the first 64 characters (retrieval.py L100-107 and L128-135). Retrieval is therefore nearly independent of the question, not semantic. Over the 34 probe turns the SQLite-WAL document was retrieved 32 times (17/17 on-corpus, 15/17 off-corpus) and KB-429 only twice. At least 5 of the 17 on-corpus questions retrieved no document that holds the answer: 'How does a token-bucket rate limiter handle backoff?' and 'What retry strategy is recommended for HTTP 429?' (no KB-429), 'What happens when an access token expires?' (no KB-401), 'What does disentangled attention separate?' (no DeBERTa), 'Which KPI marks a critical drift incident?' (no Telemetry KPI). So the retriever's flat drift is not evidence that its distribution is correctly stable; it is what a question-blind retriever produces, and the grounding/off-corpus design premise is weaker than stated for those turns.

**Reality (skeptic's corrected statement):** The chatbot process never calls grounding.load_models (backend/app/services/grounding.py L284), so get_embedding() returns None and LocalVectorIndex indexes and searches with a character-count hash of the first 64 characters (demo/workflows/retrieval.py L100-108, L128-137). Retrieval in the 34-turn run is question-blind: SQLite WAL was returned on 32 of 34 turns, KB-429 on 2, and a re-implementation of the fallback reproduces all 35 logged retrievals. 5 of the 17 on-corpus questions retrieved no document that holds the answer (token-bucket backoff, HTTP 429 retry, token expiry, disentangled attention, critical drift KPI). The retriever's flat 0.093 therefore reflects a degenerate retriever, not a stable distribution over a six-document corpus. Also applies to the TL;DR at L49.

**Finder's evidence:**

~~~text
Code: grep 'load_models' demo/chatbot/app.py -> no match; backend/app/services/grounding.py L44 '_embedding_model = None' and L392-393 'if _embedding_model is None: return None'; retrieval.py L100-107 'Deterministic fallback vector if models not yet in memory'. Replay, command: venv python -I script that imports demo.workflows.retrieval.local_retriever with no model loaded (printed 'embedding model loaded in this process: False | get_embedding(x) -> None') and re-runs search(q, top_k=3) for each of the 35 logged retriever questions: 'replayed fallback retrieval matches logged retrieval on 35 of 35 turns'. DB counts of retrieved titles over the 34 probe turns: 32 SQLite WAL, 24 Telemetry KPI, 21 Attention, 15 KB-401, 8 DeBERTa, 2 KB-429; 17 distinct retrieved sets.
~~~

#### E3 — confirmed by skeptic and by hand

**Where:** L3202-3207, L3229-3232 (section 26.1), L3234-3238, and L3331-3334 (26.4 'measured rather than displayed')

**The handoff says:** The frontend 'carried four separate mechanisms' that fabricate a working-looking screen; 'All four removed'; the RAG screen's drift is 'measured rather than displayed'.

**Reality (finder):** The RAG Live Monitor still fabricates drift telemetry on P58 (and on MAIN), in the same genre and in the same commit (e31fb58). RagChatbotApp.tsx L309-315: when the answerer's UI-side span count reaches 32 it sets agentDriftValues to hardcoded answerer 0.082, verifier 0.045, retriever 0.024. MonitoringPanel.tsx L400 renders 'WINDOW FILLED - SUSTAINED DRIFT COMPUTED / Centroid dist' with the literal fallback '0.082' whenever the value is null. L435 prints a hardcoded 'Stable (ASI: 96.4)' and L439 draws a hardcoded sparkline [0.04,0.06,0.05,0.07,0.082,0.079,0.081,0.082] captioned 'Active Centroid Trajectory (w=32)'. 'Filled' is judged from raw span counts (agentSpansCount is seeded from /v1/agents total_spans), the exact condition 26.3 shows is not enough: the measured run had 33+ spans per agent and still no window values after restarts. The real measured values were verifier 0.43 (above the 0.30 threshold), retriever 0.11, answerer 0.51, so the UI contradicts the run it documents. The same panel's callout reads 'Zero Placeholder Ban ... AgentPulse never displays 0.00 when unmeasured'. So the count 'four' and 'All four removed' understate what remains.

**Reality (skeptic's corrected statement):** 26.1 should say the RAG Live Monitor still contained fabricated drift telemetry in the same commit (e31fb58) and on both main and #58. RagChatbotApp.tsx L308-316 (7262ff0) / L299-307 (origin/main) sets agentDriftValues to the constants answerer 0.082, verifier 0.045, retriever 0.024 once the UI's own answerer span count reaches 32. MonitoringPanel.tsx L400 falls back to the literal '0.082', and L435 and L439 hardcode 'Stable (ASI: 96.4)' and a fixed sparkline. These contradict the measured window means in 26.3 (verifier 0.396, retriever 0.093, answerer 0.502). The 'four mechanisms' count is therefore at least five, and this one was not removed.

**Finder's evidence:**

~~~text
Command: git grep -n "answerer: 0.082\|'0.082'\|96.4" HEAD -- dashboard/src/components/rag -> 'HEAD:dashboard/src/components/rag/MonitoringPanel.tsx:400: ... drift.toFixed(3) : '0.082'', 'MonitoringPanel.tsx:435: Stable (ASI: 96.4)', 'RagChatbotApp.tsx:312: answerer: 0.082,'. Same grep on origin/main returns the same lines (RagChatbotApp L303), so unchanged by PR #58. sed -n 308,315p dashboard/src/components/rag/RagChatbotApp.tsx -> 'if (nextAnswerer >= 32) { setAgentDriftValues(... answerer: 0.082, verifier: 0.045, retriever: 0.024'. DB: DRIFT_DETECTED alert rows for verifier distance=0.378 and 0.408, answerer 0.479.
~~~


### misleading

#### B1-04 — confirmed by skeptic

**Where:** L46 (section 0), L3005-3010 (24.10), L2715 vs L2780 (24.9 vs 24.9.2), L41 vs L2724

**The handoff says:** Same-cell and same-sentence numbers drawn from different snapshots without saying so: L46 gives '87 trials ... correct acceptances 0.219 ... empty after 100 trials'; L3005 gives 'correct acceptances 0.219' and, four lines later at L3009, 'Cell A's mean of 0.248'; L41 says 'AUC is 0.979 throughout' while L2724, L2749, L2778, L2956, L3014, L3026 say 0.980

**Reality (finder):** Cell A is n=37, mean 0.219 in one snapshot and n=40, mean 0.2485 in the other; AUC is 0.9797 in one and 0.9792 in the other. Three further things are not disclosed anywhere in the handoff. (a) The 3 added rows (97 to 100) are all deepseek-ai repeats 2, 3, 4 on the transformer query, the query already known to be bimodal, scoring 0.8038, 0.0463, 0.9857; they raise 'above 0.6' from 7 of 37 to 9 of 40, so the headline '9 of 40' (22.5%) is 7 of 37 (18.9%) before those targeted reruns. (b) The 10 unscored rows are all correct acceptances (cell A) on the token-bucket query, so there are 50 correct acceptances and only 40 are scored. (c) No sentence explains why 97/100 and 87/90 differ.

**Reality (skeptic's corrected statement):** 24.9 should say once that the run grew from 97 to 100 rows (three deepseek-ai reruns, repeats 2-4, on the transformer-attention query, scoring 0.804, 0.046, 0.986), that 10 rows (all correct acceptances on the token-bucket query) have an analyst-pair score but no live-rule score because their researcher/retriever priors were never generated, so 40 of 50 correct acceptances are scored, and that '9 of 40 above 0.6' was 7 of 37 before the reruns. Every cell-A and AUC figure then comes from the 100-row snapshot (n=40, mean 0.248, AUC 0.979) or is labelled as the 97-row snapshot (n=37, mean 0.219, AUC 0.980).

**Finder's evidence:**

~~~text
git show 4af29c2:... vs 7f78b3f:... diffed by (query, verifier_model, repeat): 'added in 7f78b3f: 3'; 'transformer multi-head self-attention deepseek-ai rep 2 accept True 0.8038', 'rep 3 ... 0.0463', 'rep 4 ... 0.9857'; 'common rows with changes: 0'. 'A above 0.6' is 7 at 4af29c2 and 9 at 7f78b3f. Unscored rows at 7f78b3f: "10 Counter({('accept', True, 'token bucket rate limiter backoff'): 10})"; 'cell n over ALL rows: {A: 50, C: 3, B: 47}'. grep -n -i 'unscorable|no context yet|excluded' SESSION_HANDOFF.md finds no explanation.
~~~

#### B1-05 — confirmed by skeptic

**Where:** L2949-2956 (section 24.9.5)

**The handoff says:** 'the same fix was applied to the 87-trial set' with a table of accept n=40 and refuse n=50, then 'AUC 0.457, against 0.980 before'

**Reality (finder):** n = 40 + 50 = 90, so this is the 90-scored snapshot, not an 87-trial set. The matching 'before' AUC for those 90 rows is 0.9792 (0.979), not 0.980 (0.9797 is the 87-row value). The headline at L43 repeats 'from 0.980 to 0.457'.

**Reality (skeptic's corrected statement):** 24.9.5 applied the fix to the 90 scored trials (accept n=40, refuse n=50) of the 100-row run, where the live-rule AUC before the fix is 0.979 (0.9792), not 0.980. The planner-exclusion rescoring code is not committed under experiments/ at 7f78b3f, so 0.457 cannot be regenerated from the repo.

**Finder's evidence:**

~~~text
7f78b3f recomputation: scorable 90, 'refuse rows scorable: 50 accept rows scorable: 40', auc disagreement_live 0.9792. At 4af29c2 'refuse rows scorable: 50 accept rows scorable: 37' (n=87), auc 0.9797.
~~~

#### B1-06 — confirmed by skeptic

**Where:** L2581-2584 (section 24.5)

**The handoff says:** 'Re-ran the whole study: every classification is bit-identical to 2026-08-23. Same tp/fp/fn/tn, same precision, recall, F1, FPR, FNR across all seven configurations'

**Reality (finder):** False against the FIRST committed ablation_results.json (e83b783, timestamp 2026-08-23 11:28:51 UTC): Config G differs (fp 11 vs 1, tn 6 vs 16, precision 0.542 vs 0.929, F1 0.703 vs 0.963, FPR 0.647 vs 0.059). Configs A-F, the operating point and dev/test metrics are identical. It is true against the second 2026-08-23 run (73b533f, timestamp 17:56:09 UTC), which was produced after the grounding-score formula fix. Two different ablation runs exist on 2026-08-23 and they disagree on one of the seven configurations. The 73b533f commit message itself records 'F1 0.703->0.963, FPR 0.647->0.059'.

**Reality (skeptic's corrected statement):** Every classification metric in the 2026-09-18 re-run (9cd0819) is bit-identical to the 2026-08-23 17:56 UTC run (73b533f, the one after the grounding-score fix). The first committed ablation_results.json (e83b783, 2026-08-23 11:28 UTC) differs on Config G only (F1 0.703, FPR 0.647), because it predates that fix; Configs A-F match all three runs.

**Finder's evidence:**

~~~text
python -I script comparing git show <sha>:experiments/results/ablation_results.json for e83b783, 73b533f, 9cd0819, 7f78b3f, e31fb58. 'e83b783 vs 7f78b3f diffs: [(Config_G_Full_AgentPulse, fp, 11, 1), (..., tn, 6, 16), (..., precision, 0.542, 0.929), (..., f1_score, 0.703, 0.963), (..., fpr, 0.647, 0.059)]' ; '73b533f vs 7f78b3f: diffs: NONE (all classification metrics identical)'.
~~~

#### B1-08 — confirmed by skeptic

**Where:** L2597-2600 (section 24.5)

**The handoff says:** 'Latency did move, 188.1ms to 132-135ms on Config B across three runs, so it is not noise.'

**Reality (finder):** Committed Config B latencies are 300.48 (e83b783), 188.07 (73b533f), 132.09 (9cd0819/PRE), then 188.07 again on MAIN after e31fb58 reverted the file. The 300.48 to 188.07 drop happened on the same day with no change to the NLI path (73b533f only changed the grounding_score formula), which shows swings of that size occur between runs, so 'not noise' is not supported and the baseline omits the first run. '135' and 'three runs' are not in any commit; only one re-run (132.09) is committed.

**Reality (skeptic's corrected statement):** Config B latency in the committed ablation_results.json history: 300.48 ms (2026-08-23 11:28 UTC), 188.07 ms (2026-08-23 17:56 UTC, after a change that only altered the grounding-score arithmetic), 132.09 ms (2026-09-18 re-run); MAIN's file is back to 188.07 ms. The 9cd0819 message reports 132-135 ms across three runs but only the 132.09 run is committed, and it attributes the shift to a probable library or machine difference. Run-to-run swings of this size have been seen with no change to the NLI path, so the move is not attributed to anything and is not an improvement.

**Finder's evidence:**

~~~text
python -I script over git show <sha>:experiments/results/ablation_results.json printed: 'Config_B_DeBERTa_Only ... lat 300.48' (e83b783), 'lat 188.07' (73b533f), 'lat 132.09' (9cd0819 and 7f78b3f), 'lat 188.07' (e31fb58). git show --stat 73b533f lists grounding.py with an 18-line change that only adds NEUTRAL_RISK_WEIGHT and changes grounding_score.
~~~

#### B1-11 — confirmed by skeptic

**Where:** L2893-2896 (section 24.9.4)

**The handoff says:** 'On every acceptance anchor the instability is entirely the researcher comparison'

**Reality (finder):** All three acceptance anchors (deepseek, google, meta) were taken from the same query, 'transformer multi-head self-attention'. The researcher prior is generated once per query and reused, so the three anchors share one researcher text. The finding is one researcher output on one query, not three independent anchors. (The per-anchor values themselves are unverifiable; only the structure is checkable.)

**Reality (skeptic's corrected statement):** All three acceptance anchors in 24.9.3/24.9.4 (deepseek, google, meta) come from one query, 'transformer multi-head self-attention'. They therefore share the same retrieved evidence and the same single researcher output (context_cache has one entry per query). 'The instability is entirely the researcher comparison' on all three is one researcher text on one query, not three independent confirmations. The same applies to 24.9.5's elimination on those anchors.

**Finder's evidence:**

~~~text
paraphrase_stability.json at 7f78b3f, per-anchor printout: 'ANCHOR accept deepseek-ai/... query transformer multi-head self-attention', 'ANCHOR accept google/gemma-4-31b-it query transformer multi-head self-attention', 'ANCHOR accept meta/muse-glimmer-30b query transformer multi-head self-attention'. refusal_disagreement.json context_cache has exactly one researcher entry per query (9 entries). Refusal anchors are on SQLite and kubernetes.
~~~

#### B1-12 — confirmed by skeptic

**Where:** L41 and L45 (section 0), L3115-3117 (25.1)

**The handoff says:** 'disagreement spreads 0.948-0.984 across paraphrases of the same statement' and 'Mean spread 0.066, against disagreement's 0.948-0.984 on the identical texts. Roughly fourteen times tighter'

**Reality (finder):** 0.948-0.984 covers four of the five anchors. The fifth (deepseek refusal) has disagreement spread 0.0006, while drift's spread on that same text is 0.084, so drift is looser than disagreement there. Across all five anchors the mean disagreement spread is 0.774, which is about 11.7 times the drift mean of 0.066. 'Fourteen times' holds only against the four unstable anchors. L2859 does say 'four of five'; L41, L45 and L3115 do not.

**Reality (skeptic's corrected statement):** Disagreement's paraphrase spread is 0.948-0.984 on four of the five anchors and 0.0006 on the fifth (refuse, deepseek), where drift's spread (0.084) is larger. Drift's mean spread (0.066) is about 11.7 times tighter than disagreement's mean over all five anchors (0.774), and about 14 times tighter only against the four unstable anchors.

**Finder's evidence:**

~~~text
paraphrase_stability.json at 7f78b3f: disagreement spreads 0.9803, 0.0006, 0.9844, 0.9567, 0.9482 (mean 0.7740). Drift values are from the handoff table L3109-3113: refuse deepseek 0.084, mean of five 0.0664; 0.774 / 0.0664 = 11.66; 0.948 / 0.066 = 14.4.
~~~

#### B3-03 — confirmed by skeptic

**Where:** L2581-2583 (section 24.5)

**The handoff says:** 'every classification is bit-identical to 2026-08-23. Same tp/fp/fn/tn, same precision, recall, F1, FPR, FNR across all seven configurations'.

**Reality (finder):** Two ablation_results.json versions are dated 2026-08-23. Against the later one (73b533f, 17:56 UTC, after the grounding-score fix) all seven configurations are identical to PRE. Against the first committed version (e83b783, 11:28 UTC) Config_G_Full_AgentPulse differs: precision 0.542 -> 0.929, F1 0.703 -> 0.963, FPR 0.647 -> 0.059, fp 11 -> 1, tn 6 -> 16. Configs A-F and the selected operating point are identical in both comparisons.

**Reality (skeptic's corrected statement):** Every classification in the 9cd0819 re-run is identical to the 73b533f version of ablation_results.json (2026-08-23 17:56:09 UTC, after the grounding-score fix) for all seven configurations and the selected operating point. The first committed 2026-08-23 file (e83b783, 11:28:51 UTC) differs on Config G only: precision 0.542 vs 0.929, F1 0.703 vs 0.963, FPR 0.647 vs 0.059, fp 11 vs 1, tn 6 vs 16.

**Finder's evidence:**

~~~text
`git log --format='%h %ad %s' --date=short -- experiments/results/ablation_results.json` -> e31fb58, 9cd0819 (2026-09-18), 73b533f (2026-08-23 'Fix grounding-score formula'), e83b783 (2026-08-23 'Initial commit'). Python JSON diff `e83b783 vs 9cd0819`: `Config_G_Full_AgentPulse classification-diff={'precision': (0.542, 0.929), 'f1_score': (0.703, 0.963), 'fpr': (0.647, 0.059), 'fp': (11, 1), 'tn': (6, 16)}`; `73b533f vs 9cd0819`: `classification-diff=NONE` for all 7.
~~~

#### B3-07 — confirmed by skeptic

**Where:** L3154-3161 (section 25.3), L45

**The handoff says:** 'The models mostly wrote their own sentence in prose -- "I retrieved three documents covering DeBERTa's ..." -- and then appended "Retrieved 3 documents."'; 0 of 9 'with the dictated sentence removed'.

**Reality (finder):** The 9 outputs split 3 / 3 / 3. Three use the word form ('I retrieved three documents ...' plus appended 'Retrieved 3 documents.': DeBERTa, gradient descent, photosynthesis). Three write their own sentence with no count at all ('The retrieved documents cover/explain ...') plus the appended 'Retrieved 3 documents.' (transformer, SQLite, react). Three consist only of the dictated sentence with a trailing clause ('Retrieved 3 documents containing guidance ...', 'Retrieved 3 documents, which discuss ...', 'Retrieved 3 documents: one detailing ...'). Under the removal regex two of those become the empty string and the third becomes a fragment starting 'g., in-memory enqueue latency' because [^.]* stops at 'e.g.'. The only digit-count phrase in any of the nine is inside the removed match, so 0 of 9 follows by construction; the informative cases are the 6 outputs with remaining prose, of which 3 contain the word form and 3 contain no count.

**Reality (skeptic's corrected statement):** Of the nine outputs, three wrote the count in words ('I retrieved three documents...') and then appended 'Retrieved 3 documents.'. Three wrote their own sentence with no count and then appended the dictated line. Three consist of the dictated 'Retrieved 3 documents...' sentence plus a trailing clause. The 0 of 9 follows by construction, because the only digit-count phrase in each output is the dictated one. The informative cases are the six with prose left, of which three use the word form and three contain no count at all.

**Finder's evidence:**

~~~text
Script over `git show 7f78b3f:experiments/results/refusal_disagreement.json`: `REMOVED  : ''` for 'invalid API key and token expiration' and 'italian carbonara pasta recipe'; kubernetes `REMOVED  : "g., in-memory enqueue latency <0.05ms P95) and Agent Stability Index alert levels, ..."`; `word-count phrase: ['three documents']` for DeBERTa, gradient descent and photosynthesis only; `digit-count phrase: ['3 documents']` for all nine and always inside the match. Totals: as produced 9/9, removed 0/9.
~~~

#### B3-08 — confirmed by skeptic

**Where:** L3163-3165 (section 25.3) vs L399-410 (section 11)

**The handoff says:** 'This is the mechanism behind Section 11 ... Real agents write "three documents". The regex reads digits.'

**Reality (finder):** Section 11 gives a different, specific cause for the zero extractions and says the regex cannot fix it: TOOL_PATTERNS needs the agent to narrate tool use, but in structured-tool-calling harnesses the invocation is a tool_call field ('Expanding the regex cannot fix this -- the information is not in the text'). 25.3 shows the digit-only COUNT_PATTERNS effect on 9 retriever outputs from this repo's own demo, not on the 8,353 external spans, and the raw spans are not in the repo to test it. The two sections now assign contradictory mechanisms to the same result.

**Reality (skeptic's corrected statement):** Section 11's documented cause of the 8,353 zero extractions is that TOOL_PATTERNS needs narrated tool use, while structured harnesses record the call in a tool_call field. 25.3 shows a separate effect: COUNT_PATTERNS is digit-only, and the demo's retriever extracts a count only through the prompt-dictated 'Retrieved N documents' line, tested on nine outputs from this repo's own demo. 25.3 does not establish that this is why the external corpus scored zero, because the raw spans are not in the repo (only 6 samples and a manifest). Section 25.3 should say 'a second, independent reason', not 'the mechanism behind Section 11', and 'nobody could say why' should go.

**Finder's evidence:**

~~~text
`sed -n 397,410p SESSION_HANDOFF.md` -> '**Cause -- a design-premise mismatch, not a tuning gap.** `TOOL_PATTERNS` requires the agent to *narrate* tool use ... **Expanding the regex cannot fix this**'. `git ls-tree -r --name-only origin/main datasets/external/exgentic_v2` -> README.md, raw/manifest.json, source_metadata.json, tool_claim_*_metadata.json only; tool_claim_external_test.json has 6 samples.
~~~

#### B3-09 — confirmed by skeptic and by hand

**Where:** L3308-3317 (section 26.3); L41/L3181-3184

**The handoff says:** 'The verifier detected it, and detected it correctly. Its mean rose from 0.306 to 0.396 across the boundary' with after-switch '17/17 above the 0.30 threshold'.

**Reality (finder):** The before-switch readings were already above the alert threshold: 7 of the 11 pre-switch verifier window values exceed 0.30, and the last 7 before the switch are all 0.324-0.378 (0.378, 0.339, 0.324, 0.331, 0.339, 0.337, 0.351). The first four readings (0.182, 0.224, 0.295, 0.261) are low because the window was still filling. So the rise from 0.306 to 0.396 mixes window warm-up with the topic change, and a 0.30 threshold alert would have fired before the switch. The table reports 17/17 above for after but omits the 7/11 for before.

**Reality (skeptic's corrected statement):** In the 26.3 run the verifier's window-drift mean rose from 0.306 (n=11) to 0.396 (n=17), but 7 of the 11 pre-switch readings were already above the 0.30 alert threshold (the last seven are 0.324-0.378). The first four (0.182, 0.224, 0.295, 0.261) are the only low ones. A DRIFT_DETECTED alert for the verifier fired at 2026-09-20 21:34:02 (distance 0.378), before the 21:41 topic switch. So the 0.30 threshold did not separate before from after, and only the mean moved.

**Finder's evidence:**

~~~text
Query: window_centroid_distance for verifier joined to spans, ordered by spans.start_time, switch 2026-09-20 21:41:27.204649. Output: before n=11 mean=0.305459 min=0.1818 max=0.3780 above0.30=7; after n=17 mean=0.395702 min=0.3451 max=0.4261 above0.30=17. Ordered values: 21:29:35 0.1818, 21:29:51 0.2236, 21:32:34 0.2947, 21:32:42 0.2606, 21:34:02 0.378, 21:35:37 0.3393, 21:36:33 0.3244, 21:38:09 0.3311, 21:38:32 0.339, 21:38:49 0.3365, 21:39:09 0.3508 (all 'before'), then 0.3658 at 21:41:32 ('AFTER').
~~~

#### B3-10 — confirmed by skeptic

**Where:** L3242-3254 (section 26.2); L3250-3252

**The handoff says:** `demo/chatbot/app.py` runs 'three agents on three models'; first-turn listing retriever mistralai/mistral-nemotron, verifier meta/muse-glimmer-30b, answerer deepseek-ai/deepseek-v4-flash.

**Reality (finder):** Those three are the models of the first smoke turn only (the database id is deepseek-ai/deepseek-v4-flash-0731, suffix dropped in the handoff). On P58, app.py AGENT_MODELS is retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b, and every span of the 34-turn probe behind 26.3 ran on those (35 successful retriever and 35 answerer spans on nvidia/*), i.e. two owners, not three. The handoff never says the models changed after the first turn, and app.py's own comment is self-contradictory ('Three owners' at L86, 'Two of these share the nvidia family' at L98).

**Reality (skeptic's corrected statement):** The three models listed in 26.2 (mistralai/mistral-nemotron, meta/muse-glimmer-30b, deepseek-ai/deepseek-v4-flash-0731) are the first smoke turn only. demo/chatbot/app.py as committed in 7262ff0 and on PR #58 (b86fc40) runs retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b (three models, two families), and all 34 probe turns behind 26.3 ran on that set. The first-turn answerer id in the database is deepseek-ai/deepseek-v4-flash-0731 (suffix dropped in the handoff).

**Finder's evidence:**

~~~text
`sed -n 102,106p demo/chatbot/app.py` -> the three nvidia/meta/nvidia ids. DB: `select agent_id, model, count(*), min(start_time), max(start_time) from spans ...` -> ('answerer','deepseek-ai/deepseek-v4-flash-0731',1,'2026-09-20 20:56:45'), ('answerer','nvidia/nemotron-3.5-lightning-30b-a3b',35,'21:16:04'..'22:01:03'), ('retriever','mistralai/mistral-nemotron',6,'20:55:18'..'21:12:44'), ('retriever','nvidia/nemotron-3-super-120b-a12b',35,'21:15:59'..'22:00:51'), ('verifier','meta/muse-glimmer-30b',36,...).
~~~

#### B3-11 — confirmed by skeptic

**Where:** L3267-3270 (section 26.2)

**The handoff says:** 'a 75s request timeout, because the three calls are sequential so a hung provider takes the whole turn'.

**Reality (finder):** The timeout is per attempt. The hung answerer call in the probe lasted 226.4 s (about 3 x 75 s plus backoff), because demo/chatbot/app.py passes timeout=75.0 per request but constructs OpenAI(...) with no max_retries, and the installed SDK retries twice by default. A hung provider therefore still holds a turn for roughly 225 s (the 247 s worst turn at L3344 is this effect), not 75 s.

**Reality (skeptic's corrected statement):** The 75 s timeout in demo/chatbot/app.py is per attempt: the OpenAI client is built with the SDK default max_retries=2, so a hung call can take about 3 x 75 s plus backoff (226.4 s recorded for the answerer timeout in the probe). Successful calls also exceeded 75 s (verifier 77.2 s; 15 answerer spans of 78.7-188.1 s), and the 247 s worst turn (trace bdc2818c...) is the sum of such retry-extended calls.

**Finder's evidence:**

~~~text
DB: `select ... from spans where status!='success'` -> ('b6293bd59eeb48859ffef56be5d8042c','answerer','error','APITimeoutError: Request timed out.',226387.72); also retriever timeouts at 226760.38 and 226678.97 ms. `grep -n -E 'max_retries|timeout|REQUEST_TIMEOUT_S' demo/chatbot/app.py` -> L112 `REQUEST_TIMEOUT_S = 75.0`, L198 `timeout=REQUEST_TIMEOUT_S`, no max_retries. Venv: `openai.DEFAULT_MAX_RETRIES` -> 2.
~~~

#### B3-12 — confirmed by skeptic

**Where:** L3115-3117 (section 25.1)

**The handoff says:** 'Mean spread 0.066, against disagreement's 0.948-0.984 on the identical texts. Roughly fourteen times tighter.'

**Reality (finder):** The disagreement range is taken from four of the five anchors. The fifth anchor (refuse, deepseek) has disagreement spread 0.0006, narrower than that anchor's drift spread of 0.084, and 24.9.3 (L2864) itself calls it 'the one stable disagreement anchor'. Over all five anchors the mean disagreement spread is 0.774 (0.9803, 0.0006, 0.9844, 0.9567, 0.9482), so the like-for-like mean comparison is about 12x, not 14x, and it is not uniformly in drift's favour.

**Reality (skeptic's corrected statement):** On the same five anchors the mean disagreement spread is 0.774 (0.9803, 0.0006, 0.9844, 0.9567, 0.9482 from paraphrase_stability.json at 7f78b3f) against drift's mean 0.066, roughly 12x rather than 14x. The 0.948-0.984 range holds for four of five anchors; on refuse/deepseek disagreement is 0.0006, narrower than drift's 0.084.

**Finder's evidence:**

~~~text
Python over `git show 7f78b3f:experiments/results/paraphrase_stability.json`: disagreement spread (variants only) per anchor accept-deepseek 0.9803, refuse-deepseek 0.0006, accept-google 0.9844, refuse-google 0.9567, accept-meta 0.9482; mean 0.774; 0.774/0.066 = 11.7.
~~~

#### B3-13 — confirmed by skeptic and by hand

**Where:** L2855 (24.9.3) and L41 (TL;DR)

**The handoff says:** '10 of 34 paraphrase-signal pairs landed on the opposite side of the 0.6 alert threshold'.

**Reality (finder):** The numerator is right (10 flips: 7 disagreement + 3 contradiction) but 34 is the raw paraphrase count including 2 discarded ones. The population is 32 kept paraphrases x 2 signals = 64 pairs, and 9 distinct paraphrases flipped on at least one signal. So the ratio is 10 of 64 pairs (or 9 of 32 paraphrases), not 10 of 34.

**Reality (skeptic's corrected statement):** 10 of 64 paraphrase-signal pairs (32 scored paraphrases x 2 signals; 7 disagreement + 3 contradiction) landed on the other side of the 0.6 threshold, and 9 of the 32 paraphrases flipped on at least one signal; 34 counts the 2 discarded paraphrases, which were never scored. This applies to both OLD L2855 and the TL;DR at OLD L41 (NEW L54 still says '10 of 34 paraphrases').

**Finder's evidence:**

~~~text
Python over `git show 7f78b3f:experiments/results/paraphrase_stability.json`: `kept paraphrases 32 pairs 64 flips 10 paraphrases with any flip 9`; total variants 34 with 2 carrying a 'discarded' key.
~~~

#### C06 — confirmed by skeptic

**Where:** L194 (section 4); L178

**The handoff says:** 'The ingest API requires X-API-Key: change-me-to-a-secure-key (from .env)'

**Reality (finder):** The value is correct but the source is wrong and the .env path is now a trap. Nothing in the backend loads .env (no load_dotenv in backend/app; the default comes from config.py:23). .env is consumed only by docker compose (env_file). e31fb58 blanked .env.example: every key is now `NAME=` with no value. `cp .env.example .env` (README:174, STARTUP_GUIDE:47, deploy/*/README) yields empty AGENTPULSE_PORT etc., and the backend dies at import.

**Reality (skeptic's corrected statement):** OLD L194 (section 4) is misleading. The default ingest key `change-me-to-a-secure-key` comes from backend/app/config.py:23; AGENTPULSE_API_KEY overrides it. Only docker compose reads .env (env_file in docker-compose.yml), and no Python code loads it. .env.example on main (e31fb58) has every key blank, so `cp .env.example .env` followed by docker compose makes the backend die at import on `int('')` for AGENTPULSE_PORT. PR #59 restores the PRE .env.example.

**Finder's evidence:**

~~~text
`git diff 7f78b3f origin/main -- .env.example` shows `-AGENTPULSE_API_KEY=change-me-to-a-secure-key` ... `+AGENTPULSE_API_KEY=` and `+AGENTPULSE_PORT=`. Simulation: exported the AGENTPULSE_* lines of `git show origin/main:.env.example` into os.environ, then imported backend/app/config.py (python -I -B) -> `IMPORT FAILED: ValueError invalid literal for int() with base 10: ''`. `git grep -n dotenv origin/main -- '*.py'` -> no output.
~~~

#### C12 — confirmed by skeptic

**Where:** L37 (TL;DR, section 0); L1015 (section 17.5)

**The handoff says:** 'main has a second writer and no branch protection - the Free plan does not offer it on private repos.'

**Reality (finder):** The 'private repo' reason no longer applies: the repo is public, so protection is available on the Free plan but has still not been applied. SkSahoo98 still has push. A reader would conclude protection is impossible.

**Reality (skeptic's corrected statement):** OLD L37 / 17.5: main has no branch protection or ruleset and two writers with push (Soum-Code, SkSahoo98). The blocker (403 'Upgrade to GitHub Pro or make this repository public') was removed when the repo went public in 18.8, but no protection or ruleset has been applied (verified 2026-10-11).

**Finder's evidence:**

~~~text
`gh repo view` -> PUBLIC. `gh api repos/Soum-Code/agentpulse/branches/main --jq '{protected,name}'` -> `{"name":"main","protected":false}`; `gh api .../branches/main/protection` -> `Branch not protected (HTTP 404)`; `gh api .../rulesets` -> `[]`; `gh api .../collaborators` -> SkSahoo98 push=true, Soum-Code push=true.
~~~

#### C21 — confirmed by skeptic and by hand

**Where:** L50 (TL;DR) and L26; Section 26.1

**The handoff says:** 'A monitoring dashboard shipped four separate ways of fabricating telemetry, including a vite middleware that answered every /v1/* and /chat request from fixtures' (26.1: 'All four removed')

**Reality (finder):** True only on PR #58. On main (e31fb58) dashboard/vite.config.ts still defines the `agentpulse-mock-api` middleware and src/lib/mockData.ts still exists, so `npm run dev` on main serves invented agents, traces, alerts and evaluator health (and so does the launch.json dashboard entry). L26's 'drift, datasets and experiments all read live endpoints now' is therefore false for the dev server on main.

**Reality (skeptic's corrected statement):** The four fabrication mechanisms (the vite agentpulse-mock-api middleware, the useTelemetry fixture fallback, the RagChatbotApp simulator-on-!ragStatus.ok and the invented trace_id) are removed only on open PR #58. On main (e31fb58) dashboard/vite.config.ts still answers every /v1/*, /chat and /corpus request from src/lib/mockData.ts under `npm run dev`. The middleware was added by e31fb58 itself; 7f78b3f has none.

**Finder's evidence:**

~~~text
`git show origin/main:dashboard/vite.config.ts | sed -n 14,22p` -> `function apiDevPlugin() ... name: 'agentpulse-mock-api'` and `plugins: [react(), tailwindcss(), apiDevPlugin()]`; `git cat-file -e origin/main:dashboard/src/lib/mockData.ts` -> present. On origin/fix/no-mock-fallback the plugin is gone and `server.proxy` has '/v1', '/chat', '/corpus'; mockData.ts missing (MAIN->P58 diffstat: `dashboard/src/lib/mockData.ts | 545 ----`).
~~~

#### C22 — REFUTED by skeptic

**Where:** L220 (section 6, What is actually next 1)

**The handoff says:** 'Capability tiers ... Nothing measured since has changed them, so this is a re-confirm or a skip.'

**Reality (finder):** Misleading. The tier labels may survive but their stated bases did not. The disagreement basis (internal F1 0.960 / 22 pairs) was shown to be an artifact (24.9.5: AUC 0.457 once planner questions are excluded); tool-claim's behaviour is explained by 25.3; grounding is 'weak on refusals' (24.9.3, 25 table); drift gained its first sustained values (26.3). A re-confirm now has a lot to reconcile; 'skip' is not safe.

**Why the skeptic refuted it:** Unconfirmed, and the verifier's central premise is a conflation. It says the disagreement basis (internal F1 0.960 / 22 pairs) 'was shown to be an artifact (24.9.5: AUC 0.457)'. Those are two different measurements: F1 0.960 is the 22 self-authored pairs (L241, L633), and AUC 0.98 to 0.457 is the 87-trial pipeline set (L2956). 24.9.5 does not touch the 0.960 figure. The PRODUCTIZATION_LOG Item 4 row already pairs it with the external 0-of-10 failure. The other three Basis cells (drift 1.5%/92%, grounding F1 0.963, tool-claim external F1 0.000) are corroborated, not removed, by 25.1, 25.2 and 25.3. No later section moves any of the four labels (drift Beta, grounding Beta, disagreement Experimental, tool-claim Experimental), so 'Nothing measured since has changed them' is true of the labels. All that remains is that the Basis column was last edited on 2026-08-30 and does not cite Sections 24-26; that is staleness in PRODUCTIZATION_LOG.md, not a false statement in the handoff.

**Finder's evidence:**

~~~text
PRODUCTIZATION_LOG.md Item 4 table (`git show origin/main:PRODUCTIZATION_LOG.md | sed -n 151,156p`) still cites 'Internal F1 0.960 on 22 self-authored near-minimal pairs' for disagreement. SESSION_HANDOFF.md L43 and L3095-3100 contradict that basis.
~~~

#### C24 — confirmed by skeptic

**Where:** L41, L43, L46 (TL;DR, section 0) with L2704 and L2835 (section 24.9.x)

**The handoff says:** Measurements of disagreement paraphrase spread (0.948-0.984; 10 of 34 flips; AUC 0.979 -> 0.457) and the 87-trial refusal result are presented as reproducible, with 24.9.x saying `experiments/refusal_disagreement.py` and `experiments/paraphrase_stability.py` exist.

**Reality (finder):** The scripts, their result JSONs and both reports are absent from main and PR #58 (removed by e31fb58). The numbers cannot be regenerated from main; they exist only on 7f78b3f and in the document. The text does not say so.

**Reality (skeptic's corrected statement):** The 24.9 experiment scripts (experiments/refusal_disagreement.py, experiments/paraphrase_stability.py), their results JSON and REFUSAL_DISAGREEMENT_REPORT.md / PARAPHRASE_STABILITY_REPORT.md were deleted from main by e31fb58 and are not restored by PR #58 or #59. They exist only at 7f78b3f (and on the PR #56/#57 branches), so the 24.9 numbers cannot be regenerated from main.

**Finder's evidence:**

~~~text
`git cat-file -e REF:PATH` for REF in origin/main, origin/fix/no-mock-fallback and PATH in experiments/refusal_disagreement.py, experiments/paraphrase_stability.py, experiments/results/refusal_disagreement.json, experiments/results/paraphrase_stability.json, REFUSAL_DISAGREEMENT_REPORT.md, PARAPHRASE_STABILITY_REPORT.md -> all MISSING (all present on 7f78b3f per `git diff --stat 7f78b3f origin/main`).
~~~

#### D-07 — confirmed by skeptic

**Where:** Whole file as seen from MAIN (header L3, TL;DR L40-51, headings L2414, L3089, L3194)

**The handoff says:** Sections 24, 25 and 26 and the TL;DR bullets summarising them are part of SESSION_HANDOFF.md.

**Reality (finder):** origin/main:SESSION_HANDOFF.md is 2,400 lines and ends at '## 23.'. e31fb58 removed Sections 24-25 (they were added in 9fcab38/62be27b/9e3df62/e0e037a/f5fe051). A reader landing on MAIN gets no Sections 24-26 until PR #58 (7262ff0) merges. PRE and P56 have 24-25, P57 has 24-25.6, only P58 has 26.

**Reality (skeptic's corrected statement):** origin/main:SESSION_HANDOFF.md (e31fb58) is 2,400 lines and stops at Section 23; e31fb58 deleted 790 lines of it (Sections 24-25). Sections 24-25.4 exist at 7f78b3f/P56, 25.5-25.6 only on P57, 26 first at 7262ff0, and 27 only at PR #58 tip b86fc40. Until PR #58 merges, a reader on main sees none of them.

**Finder's evidence:**

~~~text
git -C "$R" show origin/main:SESSION_HANDOFF.md | wc -l -> 2400; | grep -n '^## ' | tail -1 -> '2203:## 23. Two more rounds, inside the product this time...'. git -C "$R" log --all -S'## 24. The pipeline' --format='%h %ad %s' -- SESSION_HANDOFF.md -> 'e31fb58 2026-09-21 refactor: remove tool claim tracking and alerting' (removal) and '9fcab38 2026-09-19 Record section 24' (addition); '## 26. The RAG' -> only 7262ff0.
~~~

#### D-16 — confirmed by skeptic

**Where:** L3, L46, L2482, L2715-2722, L2732, L2736, L3005, L3077 vs L2780, L2949-2954

**The handoff says:** Trial counts and cell-A statistics: '87 trials' (L3, L46, L2482, L2715, L2949, L3005), 'cell D is empty after 97 trials' / 'Ninety-seven produced zero' (L2732, L2736, L3077), 'still empty after 100 trials' (L46), cell A 'n=37, disagreement 0.219' (L2719, L46, L3005).

**Reality (finder):** The same section uses other numbers: 24.9.2 says cell A has 40 acceptances, mean 0.248, median 0.046, 9 of 40 above 0.6, and 24.9.5 splits 40 accept / 50 refuse = 90. The results file confirms 100 trials ran, 90 classified usable; A n=40 mean 0.2485, B n=47, C n=3, D none. So 87 and 97 are stale snapshots, 0.219 and n=37 are wrong for cell A, and 87, 97 and 100 contradict each other.

**Reality (skeptic's corrected statement):** experiments/results/refusal_disagreement.json (PRE 7f78b3f; deleted on MAIN) holds 100 trials (50 accept, 50 refuse), of which 90 carry a live disagreement score: cell A n=40 (mean 0.2485, median ~0.046, 9 of 40 above 0.6), B n=47 (mean 0.9778), C n=3 (mean 0.9987), D n=0 (no accept on irrelevant evidence). '87 trials', 'A n=37 / 0.219' (and A contradiction 0.211, file says 0.1958) and '97 trials' are earlier snapshots and should be replaced with '100 run, 90 scored' everywhere (L3, L46, L2482, L2715-2722, L2732, L2736, L2949, L3005, L3077).

**Finder's evidence:**

~~~text
On PRE (the file is deleted on MAIN): git -C "$R" show 7f78b3f:experiments/results/refusal_disagreement.json | python -I (json) -> len(trials)=100; summary.n_trials=90; cells.A.disagreement_live {n:40, mean:0.2485, median:0.0463, above_0.6:9}; B n=47 mean 0.9778; C n=3 mean 0.9987; D null; auc_refusal_vs_acceptance.disagreement_live=0.9792. grep -n -E '(87|97|100)' on L46/L2715/L2732/L2949 shows the three counts.
~~~

#### D-17 — confirmed by skeptic

**Where:** L46 (TL;DR), L3004-3008 and L3076-3080 (24.10), L2481-2486 (24.4 note)

**The handoff says:** TL;DR: 'Disagreement tracks stance, not error ... Whether the verifier was right does not move the score.' 24.10: 'This is the sharpest open question the project has ... Cell D is the whole remaining question'.

**Reality (finder):** 24.9.5 (L2961-2963) concludes the opposite on what that result means: 'The 0.980 was an artifact, and 24.9's "disagreement tracks stance" was describing the behaviour of a planner comparison rather than a property of inter-agent disagreement', and AUC falls to 0.457. L43 of the same TL;DR says the entire measured performance was an artifact. Neither L46 nor the 24.10 standing facts nor the '24.4 Superseded in part by 24.9' note carry that caveat, so a reader of L46 or 24.10 is told the stance finding stands and that cell D matters.

**Reality (skeptic's corrected statement):** The 'disagreement tracks stance, not error' result (0.978 / 0.999 / 0.219) is retracted by 24.9.5: it described a planner-question comparison, and with planner spans excluded the separation vanishes (AUC 0.980 -> 0.457, i.e. chance). L46, the 24.4 'not wrong' note and the two 24.10 bullets should carry '(artifact of the planner comparison, 24.9.5)', and cell D is moot until a claim-bearing comparison exists.

**Finder's evidence:**

~~~text
sed -n '2959,2963p;43p;46p;3004,3008p;3076,3080p' SESSION_HANDOFF.md.
~~~

#### D-18 — confirmed by skeptic

**Where:** L50 (TL;DR), L3237-3238 (26.1)

**The handoff says:** 'Seventh instance in this repo, and the first where the invented thing was telemetry rather than copy.'

**Reality (finder):** 22.11 counts five rounds, and Section 23 (L2217-2219, L2387-2388) says '23.1-23.3 ... Rounds six and seven', so 26.1 would be the eighth or later. 'First where the invented thing was telemetry' is also contradicted by 22.4 (Telemetry Lab's generated grounding scores 0.96/0.38/0.74/0.88, random cost and tokens) and 22.5 (per-endpoint APM mock), and 23.1-23.2 (Datadog golden signals).

**Reality (skeptic's corrected statement):** The Section 26.1 fabrication is at least the eighth instance (22.11 counts five rounds; Section 23 records the sixth and seventh), and it is not the first with invented telemetry: 22.4 (Telemetry Lab's fabricated Trace, grounding scores 0.96/0.38/0.74/0.88, Math.random() cost and tokens), 23.1 (unmeasured p95/p99) and 23.2 ('Datadog APM Golden Signals') already fabricated telemetry. What 26.1 adds is a vite middleware that answered every /v1/* and /chat request from fixtures, so no backend call was made at all.

**Finder's evidence:**

~~~text
sed -n '2169,2171p;2217,2219p;2387,2388p;3237,3238p' SESSION_HANDOFF.md -> 'Five times now', 'produced the sixth and seventh', 'Rounds six and seven', 'seventh instance'.
~~~

#### D-19 — confirmed by skeptic and by hand

**Where:** L41-42 (TL;DR) vs L2845-2856 (24.9.3)

**The handoff says:** '**10 of 34 paraphrases crossed the alert threshold their anchor did not**' followed by 'It is disagreement specifically.'

**Reality (finder):** 24.9.3 says '10 of 34 paraphrase-signal pairs', and the table rows sum to 7 disagreement flips (1+3+1+2+0) plus 3 contradiction flips (refuse/google 3/6) = 10. Only 32 paraphrases carry a disagreement score (3+8+6+7+8). So 'of 34 paraphrases' mislabels the denominator and 'disagreement specifically' leaves out that 3 of the 10 flips are contradiction.

**Reality (skeptic's corrected statement):** Of the 34 stored paraphrases, 32 are scored; 7 of 32 disagreement scores and 3 of 32 contradiction scores (all three on the google refusal anchor) crossed 0.6 against their anchor, i.e. 10 signal-flips out of 64 paraphrase-signal pairs, on 9 distinct paraphrases. 'Disagreement is the unstable signal' holds for 7 of the 10; the other 3 are contradiction on refusals.

**Finder's evidence:**

~~~text
sed -n '2845,2856p' SESSION_HANDOFF.md (flipped column: 1/3, 3/8, 1/6, 2/7, 0/8, 0, 3/6); sed -n '41,42p'.
~~~

#### D-20 — confirmed by skeptic

**Where:** L3 (header 'Updated' chain)

**The handoff says:** The header chain is meant to say which sections each update covered (Sections 7-26).

**Reality (finder):** It covers 7-13, 14-15, 16, 17, 18, 24, 26 and 24.8-24.9 only. Sections 19, 20, 21, 22, 23 and 25 appear in no 'Updated' entry, nor do 24.9.2-24.9.5 and 24.10. The 09-21 entry (Section 26) sits before the 09-20 entry (24.8-24.9), so the chain is out of date order. That reorder was introduced by P58, which inserted the Section 26 entry between the 09-19 and 09-20 entries. The 09-20 entry describes 87 trials and 'three analysis faults' and omits the AUC 0.980 to 0.457 finding that the TL;DR calls most consequential.

**Reality (skeptic's corrected statement):** The L3 'Updated' chain names only Sections 7-13, 14-15, 16, 17, 18, 24, 26 and 24.8-24.9; Sections 19 (2026-09-15), 20 (09-16), 21-22 (09-17), 23 (09-17/18) and 25 (09-21) have no entry, and the 09-21 entry (added by 7262ff0 in PR #58) sits before the 09-20 entry. The 09-20 entry still describes the 87-trial 'tracks stance' result and omits the 24.9.5 retraction (AUC 0.980 -> 0.457) and 24.10.

**Finder's evidence:**

~~~text
grep -o 'Updated:\*\* [0-9-]*' SESSION_HANDOFF.md -> 08-27, 08-28, 08-30, 08-31, 09-12, 09-19, 09-21, 09-20. git show 7f78b3f:SESSION_HANDOFF.md | sed -n '3p' | grep -o 'Updated:\*\* [0-9-]*' -> ends '09-19, 09-20' (no 09-21 entry on PRE). Section commit dates: 9fcab38 2026-09-19 (24), 62be27b 2026-09-20 (24.8-24.9), e0e037a 2026-09-20 (24.9.5), f5fe051 2026-09-21 (25), 7262ff0 2026-09-21 (26).
~~~

#### D-21 — confirmed by skeptic

**Where:** L206 (Section 6 intro)

**The handoff says:** 'The recommendation given to the user, and the reasoning, is in Section 9. Short version:'

**Reality (finder):** Section 9 (L287-299) is the drift documentation defect. It contains no recommendation or reasoning for next steps, and Section 6's own list is the only place that content lives.

**Reality (skeptic's corrected statement):** Section 9 (L287-299) now documents only the DRIFT_EXPERIMENT_REPORT.md defect; the 'diagnosis to run' it carried when L206 was written (3202b31) was executed and moved to Section 10 when c0629d4 rewrote Section 9 the same day. The L206 pointer is dangling: the priority reasoning lives in Section 6's own list (L208-216) and Sections 10-14.

**Finder's evidence:**

~~~text
sed -n '206p;287,299p' SESSION_HANDOFF.md.
~~~

#### D-22 — confirmed by skeptic

**Where:** L264 (Section 8) and L415 (Section 11)

**The handoff says:** L264: 'No competitor product has ever been installed or run. This is the weakest link ... and is why Section 6 item 2 exists.' L415: 'Config D's standing is questionable (Section 6 item 7).'

**Reality (finder):** Section 6 item 2 is 'Test the tool-claim validator on the external corpus' (L209). The competitor-install item is item 4 (L211). Item 7 is 'Decide what to do with the uncommitted dashboard work' (L214). The ablation re-run is item 8 (L215). The numbers appear to predate a renumbering.

**Reality (skeptic's corrected statement):** L264 should reference Section 6 item 4 (Install Phoenix and audit the competitive claims), and L415 should reference Section 6 item 8 (Re-run ablation Configs D, E and F). Section 6 was renumbered after 3202b31, where item 2 was the Phoenix install. L264's premise ('No competitor product has ever been installed or run') is itself stale, see the first missed item.

**Finder's evidence:**

~~~text
sed -n '209p;211p;214p;215p;264p;415p' SESSION_HANDOFF.md.
~~~

#### D-23 — confirmed by skeptic

**Where:** L1781 (21.7)

**The handoff says:** 'the adapter leaves it absent rather than guessing `normal` (see 4.4 and the rule in 21.3)'

**Reality (finder):** No heading 4.4 exists (Section 4 has no numbered subsections), and nothing in Section 4 concerns driftStatus or the undefined-field rule. 18.2 holds the 'no baseline yet' drift-count fix and 21.3 is the rule.

**Reality (skeptic's corrected statement):** There is no Section 4.4 (Section 4, L171-196 in OLD, has only unnumbered bullets and nothing on driftStatus). The 'undefined, not guessed' rule is in 18.2 (L1055-1070, with the 'no baseline yet' drift-count fix at L1074) and 21.3, so L1781 (21.7) should read 'see 18.2 and 21.3'.

**Finder's evidence:**

~~~text
Python -I heading extraction: numbered headings = {0..26, 12.1...}; no '4.x'. grep -n '4\.4' SESSION_HANDOFF.md at L1781 is the only reference. sed -n '171,195p' shows Section 4 bullets only.
~~~

#### D-24 — confirmed by skeptic

**Where:** L2147 (22.10)

**The handoff says:** '`16 Swarms Active` | hardcoded -- the same defect as the "4 active swarms" fixed in `AgentsView` during 19.x'

**Reality (finder):** The '4 active swarms' fix is documented in 20.1 (L1505, table row AgentsView.tsx:39). Section 19 covers PRs #4-#16, while 20.1 covers PRs #18 and #19.

**Reality (skeptic's corrected statement):** The hardcoded '4 active swarms' in AgentsView.tsx was fixed in commit 82f169e (PR #18, 2026-09-15) and is recorded in 20.1 (table row AgentsView.tsx:39), not in Section 19 (PRs #4-#16). L2147 (22.10) should say 'in 20.1 (PR #18)' instead of 'during 19.x'.

**Finder's evidence:**

~~~text
sed -n '1487p;1505p;2147p;1217p' SESSION_HANDOFF.md.
~~~

#### D-25 — confirmed by skeptic

**Where:** L2117-2118 (22.10) vs L2169-2171 (22.11)

**The handoff says:** 'The standing facts in 22.11 end by saying to expect a fifth.'

**Reality (finder):** 22.11 does not end with that. Its first bullet now reads 'Five times now ... this list predicted the fifth and 22.10 found it the next day ... Expect a sixth'. 21.10 is the section that says 'expect a fourth'.

**Reality (skeptic's corrected statement):** 22.11's first standing fact originally (before f7727bb, when that section was numbered 22.10) said 'Expect a fifth'; f7727bb rewrote it to 'Expect a sixth', so L2117-2118 describes superseded wording. Suggested text: 'The standing facts, as first written, predicted a fifth round; this was it.'

**Finder's evidence:**

~~~text
sed -n '2117,2118p;2169,2171p;1871p' SESSION_HANDOFF.md.
~~~

#### D-26 — confirmed by skeptic

**Where:** L2633-2634 (24.7), L3068-3069 (24.10)

**The handoff says:** 24.7: '23.4 picked five free OpenRouter models, one family each, and recorded that all five reported zero pricing.' 24.10: 'The five OpenRouter model ids from 23.4 are all still live at zero prompt and completion pricing'.

**Reality (finder):** 23.4 (L2275-2308) names no model ids, never mentions OpenRouter free models or pricing, and says only 'five agents, five different model families'. 24.10's 'still live' also reads against 24.7, where three of those five do not answer (Provider returned error x2, empty content x1) and the working set was replaced; 'live' is true only of catalogue presence at zero price.

**Reality (skeptic's corrected statement):** Handoff 23.4 does not list the five OpenRouter ids or their pricing; the ids are in 24.7's table and were first recorded, with the zero-pricing note, in demo/multi_model_pipeline.py at 074a142 (the original five are still the defaults on main; PRE 7f78b3f already holds the replacement set at L140-144). 24.10 should read 'all five still listed at zero prompt and completion pricing on 2026-09-18; three do not serve (24.7)'.

**Finder's evidence:**

~~~text
sed -n '2275,2308p' SESSION_HANDOFF.md | grep -n -i -E 'free|pricing|:free|openrouter' -> only 'No adapter needed for OpenRouter, OmniRoute' (line 17 of the excerpt). sed -n '2637,2643p' shows 3 of 5 failing.
~~~

#### D-27 — confirmed by skeptic

**Where:** L3058-3060 (24.10)

**The handoff says:** '`.venv/Scripts/uvicorn.exe` is stale ... which is the same staleness as the editable installs in Section 4.'

**Reality (finder):** Section 4 says nothing about editable installs (that is 16.5/17.6/18.9/19.10/22.3). 22.3 also says the editables were reinstalled. MAIN's .claude/launch.json still launches the backend through `.venv/Scripts/uvicorn.exe`, the very shim 24.10 says exits 1 with no output. PRE used `python -m uvicorn`. So the repo's own dev-server config contradicts the instruction.

**Reality (skeptic's corrected statement):** The pre-rename-path staleness is documented in 22.3 (and 16.5/17.6/18.9/19.10), not in Section 4; the uvicorn.exe shim embeds 'C:\MLOPs\3rd sem project\project one agent\.venv\Scripts\python.exe'. On main (e31fb58) .claude/launch.json again starts the backend through .venv/Scripts/uvicorn.exe, reverting d0b600b (PR #53), which switched it to python -m uvicorn; PR #59 (11a1eb1) restores the PRE file byte-for-byte.

**Finder's evidence:**

~~~text
git -C "$R" show origin/main:.claude/launch.json -> '"runtimeExecutable": ".venv/Scripts/uvicorn.exe"'; git -C "$R" show 7f78b3f:.claude/launch.json -> '"runtimeExecutable": ".venv/Scripts/python.exe", "runtimeArgs": ["-m", "uvicorn", ...]'; git diff --stat origin/main HEAD -- .claude/launch.json -> empty. sed -n '171,195p' SESSION_HANDOFF.md has no 'editable'.
~~~

#### E1 — confirmed by skeptic and by hand

**Where:** L3248-3252 (section 26.2) with L3242-3246 and L3270 ('model choices re-measured rather than carried forward')

**The handoff says:** Section 26.2 says app.py 'serves ... three agents on three models' and prints the first real turn as retriever mistralai/mistral-nemotron, verifier meta/muse-glimmer-30b, answerer deepseek-ai/deepseek-v4-flash. It says the choices were re-measured but never names the final set.

**Reality (finder):** The AGENT_MODELS committed on P58 is retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b. Only the verifier is shared with the printed first turn. The set printed in 26.2 was committed in fe3e30b and replaced in 7262ff0 (this PR's own docs commit). The 34-turn probe ran on the COMMITTED set (35 traces on it), not on the printed one; the first-turn set accounts for 1 trace. Nowhere does the handoff say which set is committed or which set the 34 turns used. The 26.2 volatility table also gives latencies only for models that are not in the committed set. For the committed answerer, 15 of its 35 probe spans took more than 75s (max 188s). The committed set has 2 owners (nvidia x2, meta), so the app.py comment at L88 'Three owners' is stale (it contradicts L98 'Two of these share the nvidia family').

**Reality (skeptic's corrected statement):** The three models printed in 26.2 (retriever mistralai/mistral-nemotron, verifier meta/muse-glimmer-30b, answerer deepseek-ai/deepseek-v4-flash-0731) are the one smoke turn of 2026-09-20 20:55:47 (trace 8388a26c), not what is committed. AGENT_MODELS in demo/chatbot/app.py (7262ff0, PR #58 b86fc40) is retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b (two owners, not three). All 35 traces from 21:15:59 to 22:00:51, including the 34-turn probe in 26.3, ran on that set. 15 of the 35 answerer spans succeeded in 78.7-188.1s and one timed out at 226.4s.

**Finder's evidence:**

~~~text
Command: git -C <wt> diff fe3e30b 7262ff0 -- demo/chatbot/app.py -> '-    "retriever": "mistralai/mistral-nemotron",' / '+    "retriever": "nvidia/nemotron-3-super-120b-a12b",' / '-    "answerer": "deepseek-ai/deepseek-v4-flash-0731",' / '+    "answerer": "nvidia/nemotron-3.5-lightning-30b-a3b",'. sed -n 102,106p demo/chatbot/app.py shows the committed dict. sqlite (read-only copy of data/agentpulse.db, spans joined to traces where service_name='rag_chatbot'): 'retriever nvidia/nemotron-3-super-120b-a12b 21:15:59 .. 22:00:51' (35 spans), 'answerer nvidia/nemotron-3.5-lightning-30b-a3b 21:16:04 .. 22:01:03' (35), 'retriever mistralai/mistral-nemotron' (8 spans, 20:42-21:12, 6 of them errors), 'answerer deepseek-ai/deepseek-v4-flash-0731' (1 span).
~~~

#### E4 — confirmed by skeptic and by hand

**Where:** L3229-3232 (section 26.1)

**The handoff says:** 'Verified with the backend deliberately stopped ... /chat and /corpus all return 500 through the new proxies and the UI reads "Cannot reach AgentPulse".'

**Reality (finder):** Nothing in the RAG UI uses the /chat or /corpus proxies. RagApiClient builds absolute URLs from VITE_RAG_API_URL || 'http://localhost:8100' (ragApi.ts L14, L42, L55, L75), and app.py L122-123 and commit fe3e30b both say the frontend 'calls this service on an absolute URL rather than through vite's proxy'. The two proxy entries (vite.config.ts L37-38) are dead config for the RAG page, and they read a different variable (VITE_CHATBOT_API) than the client (VITE_RAG_API_URL). 'Cannot reach AgentPulse' is produced only by useTelemetry/App.tsx (the /v1 views), not by the RAG page. With the chatbot down the RAG page shows ragStatus 'unreachable' and, via getCorpus(), a hardcoded list of six invented document titles (see E5). The sentence reads as if the proxy path proves the RAG screen is honest.

**Reality (skeptic's corrected statement):** With the backend stopped, the /v1 telemetry views read 'Cannot reach AgentPulse' (App.tsx:365, useTelemetry.ts:116-117) and the /v1, /chat and /corpus vite proxies return 500 (b595893). The RAG page does not use the /chat and /corpus proxies. ragApi.ts calls VITE_RAG_API_URL || http://localhost:8100 directly, and the proxy entries read a different variable, VITE_CHATBOT_API. So that check says nothing about what the RAG screen does when the chatbot is down. In that case it shows ragStatus 'unreachable' and the hardcoded six-title corpus fallback.

**Finder's evidence:**

~~~text
Command: grep -rn "['\"`]/chat\|['\"`]/corpus" dashboard/src -> no relative /chat or /corpus fetch; only ragApi.ts `${this.baseUrl}/corpus` and `${this.baseUrl}/chat`. grep -rn 'Cannot reach AgentPulse' dashboard/src -> 'src/App.tsx:365' and 'src/lib/useTelemetry.ts:116-117' only. vite.config.ts L36-38 proxy keys '/v1', '/chat', '/corpus'.
~~~

#### E5 — confirmed by skeptic and by hand

**Where:** L3202-3232 (section 26.1) 'All four removed'

**The handoff says:** After removing the four listed mechanisms an unreachable backend no longer produces invented content on the RAG screen.

**Reality (finder):** Three more invention paths remain on P58 and MAIN. (1) ragApi.ts L16-23 defines DEFAULT_CORPUS_DOCUMENTS (six titles such as 'Multi-Version Concurrency Control (MVCC)...' and 'B-Tree Page Splitting...'), getCorpus() returns it when /corpus is unreachable (L53-63) and RagChatbotApp L88 seeds corpusDocs with it, so the Corpus modal lists six invented documents when the chatbot is down; only 1 of 6 matches the real corpus (Attention Is All You Need, DeBERTa, SQLite WAL, KB-401, KB-429, Telemetry KPI). (2) ChatConsole.tsx L491-493 hardcodes the in-flight stage models as mistralai/mistral-nemotron, google/gemma-4-31b-it (the model 26.2 says hangs and was replaced) and deepseek-v4-flash-0731, none of which is what app.py runs; these are the same three the removed mock /chat returned. (3) RagChatbotApp L261-262 advance the displayed stage with timers (verifier at 8s, answerer at 25s) regardless of what the backend is doing, and ChatConsole L485 says 'Turns take 30-120s' while 26.4 measured 9-247s.

**Reality (skeptic's corrected statement):** 26.1's list of four is not exhaustive. Three more fabricated-content paths survive on main and on #58. (a) ragApi.ts L16-23 plus getCorpus() L53-63 and RagChatbotApp L88 show six invented titles (1 of 6 real) in the Corpus modal when /corpus is unreachable. (b) ChatConsole.tsx L491-493 hardcode the in-flight stage models mistral-nemotron, gemma-4-31b-it and deepseek-v4-flash-0731, which are not what app.py runs. (c) RagChatbotApp L261-262 advance the displayed stage on 8 s and 25 s timers, not on backend events, and ChatConsole L485 states 30-120 s per turn against a measured 9-247 s.

**Finder's evidence:**

~~~text
Commands: sed -n 14,23p and 53,63p dashboard/src/lib/ragApi.ts; sed -n 88p dashboard/src/components/rag/RagChatbotApp.tsx -> 'useState<string[]>(DEFAULT_CORPUS_DOCUMENTS)'; sed -n 490,494p dashboard/src/components/rag/ChatConsole.tsx -> "model: 'google/gemma-4-31b-it'"; grep -n 'setTimeout(() => setActiveStage' RagChatbotApp.tsx -> L261 '8000', L262 '25000'. All of these are present on origin/main too.
~~~

#### E6 — confirmed by skeptic

**Where:** L3266-3270 (section 26.2) and L3342-3344 (26.4)

**The handoff says:** 'Two consequences were engineered for: a 75s request timeout, because the three calls are sequential so a hung provider takes the whole turn and shows as a spinner'.

**Reality (finder):** 75s is a per-attempt read timeout, not a cap on a call. The OpenAI client is built with default max_retries=2 (app.py L163 passes none; installed openai DEFAULT_MAX_RETRIES = 2) and retries timeouts, so a hung provider holds a call for about 226s, and a turn for up to roughly 3x that. In the recorded run 16 SUCCESSFUL spans took longer than 75s (max 188s; 15 of them the answerer) and all three timeout failures ended at 226.4-226.8s. This is also why 26.4's 247s worst turn exists. The timeout bounds the spinner far less than the sentence implies, and the 'one timed out' turn cost 226s for that span alone.

**Reality (skeptic's corrected statement):** REQUEST_TIMEOUT_S = 75.0 is a per-attempt timeout. The OpenAI client in demo/chatbot/app.py L163 is built with the SDK default max_retries=2, so one hung call can take about 3 x 75 s plus backoff, about 226 s. The probe recorded three such APITimeoutError spans (226.4-226.8 s) and 16 successful spans of 77-188 s. The 247 s worst turn in 26.4 is that effect. The timeout bounds a hung call to roughly 226 s, not 75 s.

**Finder's evidence:**

~~~text
Command: venv python -I -c "import openai._constants as c; print(c.DEFAULT_MAX_RETRIES)" -> 'DEFAULT_MAX_RETRIES = 2'; openai/_base_client.py L1088-1096 'except timeout_exceptions(): if remaining_retries > 0: _sleep_for_retry ... continue'. DB: error spans 'f772ac7f retriever 226.8 APITimeoutError: Request timed out.', 'fd30acb1 ... 226.7', 'b6293bd5 answerer 226.4'; 'successful rag spans over 75s: 16', max successful latency 188.05s.
~~~

#### E7 — confirmed by skeptic and by hand

**Where:** L3308-3317 (section 26.3) and L49 (TL;DR)

**The handoff says:** 'The verifier detected it, and detected it correctly. Its mean rose from 0.306 to 0.396 across the boundary' with '17/17 above the 0.30 threshold'.

**Reality (finder):** The data are right but the interpretation is stronger than the run supports. (a) The pre-switch mean 0.306 is itself above the 0.30 alert threshold, and 7 of the 11 pre-switch windows were above 0.30; a DRIFT_DETECTED alert for the verifier fired at 21:34:02 (distance 0.378), seven minutes before the first off-corpus question (21:41:27), and was never mentioned. A threshold test therefore does not separate before from after. (b) The series is a slow climb 0.182 -> 0.378 during the on-corpus half and keeps rising (0.351 -> 0.366 -> ... -> 0.426); there is no step at the boundary. (c) With mean_window=12 the first 11 'after' windows still contain 1-11 on-corpus outputs; only the last 6 are pure off-corpus. (d) The verifier's 20-sample baseline pool is not on-corpus chatbot output: the first 20 verifier drift rows come from multi_model_demo (12) and default (8) services dated 2026-09-18/19/20, so 'before' measures old-pipeline baseline versus chatbot text. The answerer's baseline is the first 20 chatbot answerer spans. 'One agent detected one shift' overstates what one rising series can show.

**Reality (skeptic's corrected statement):** The 26.3 verifier numbers recompute (11 pre-switch windows, mean 0.3055; 17 post-switch, mean 0.3957), but they do not show detection. 7 of the 11 pre-switch windows were already above 0.30, and DRIFT_DETECTED fired for the verifier at 21:34:02 (distance 0.378), seven minutes before the first off-corpus question at 21:41:27. The series rises gradually with no step at the boundary. With mean_window=12 only the last 6 of the 17 post-switch windows are pure off-corpus. The verifier's 20-sample baseline pool was created on 2026-09-18 from multi_model_demo (12) and default (8) outputs, not from chatbot output. Present it as 'the mean moved by about 0.09 in one agent across one switch, not separable from baseline-composition effects', not as 'detected correctly'.

**Finder's evidence:**

~~~text
sqlite (read-only copy): verifier window values in time order: 21:29 0.182, 0.224, 21:32 0.295, 0.261, 21:33 0.378, 0.339, 0.324, 0.331, 0.339, 0.336, 21:39 0.351 | 21:41 0.366, 0.345, 0.38, ... 0.426 (21:49), 0.389, 0.404 (22:00). 'verifier before (11, 0.3054..., 7, 0.1818, 0.378)' where the third field is the count above 0.30. Alerts: "DRIFT_DETECTED verifier 2026-09-20 21:34:02.979140 Drift detected for agent 'verifier': distance=0.378 (threshold=0.3)" and 21:49:16 (0.408). First-20 drift rows by trace service_name: verifier {'multi_model_demo': 12, 'default': 8}, retriever {'multi_model_demo': 14, 'rag_chatbot': 6}, answerer {'rag_chatbot': 20}. First off-corpus turn f124959e started 21:41:27.
~~~

#### E8 — confirmed by skeptic and by hand

**Where:** Section 26 as a whole: L3204-3232 ('All four removed, mockData.ts deleted'), L3242 ('demo/chatbot/app.py serves the contract'), L3329-3337

**The handoff says:** Present or completed-action statements about the repo: the four mechanisms are removed, mockData.ts is deleted, demo/chatbot/app.py serves the contract.

**Reality (finder):** All true only on PR #58 (fix/no-mock-fallback). Section 26 never mentions the PR or branch. On origin/main (e31fb58) demo/chatbot/ does not exist, vite.config.ts still registers agentpulse-mock-api, mockData.ts exists, useTelemetry.ts still falls back to MOCK_* and reports connected, and RagChatbotApp still simulates on !ragStatus.ok and invents a Math.random trace id. A reader landing on main sees the opposite of what 26.1 says was done.

**Reality (skeptic's corrected statement):** Section 26's statements that the four fabrication mechanisms were removed, that mockData.ts was deleted and that demo/chatbot/app.py exists hold only on PR #58 (origin/fix/no-mock-fallback, six commits b595893..b86fc40 ahead of main e31fb58). On origin/main there is no demo/chatbot/. dashboard/src/lib/mockData.ts exists. dashboard/vite.config.ts:19 still registers 'agentpulse-mock-api'. useTelemetry.ts:107-124 falls back to MOCK_* and sets connected=true. RagChatbotApp.tsx:247 simulates on !ragStatus.ok, and :269 invents 'tr_' + Math.random(). The rag UI and its mock middleware came in with e31fb58, not a hand-written commit.

**Finder's evidence:**

~~~text
Commands: git ls-tree -r origin/main --name-only | grep -c '^demo/chatbot/' -> 0; git ls-tree -r origin/main --name-only | grep mockData -> dashboard/src/lib/mockData.ts; git show origin/main:dashboard/vite.config.ts | grep -n agentpulse-mock-api -> '19:    name: 'agentpulse-mock-api','; grep -n '#58\|no-mock-fallback' SESSION_HANDOFF.md -> no output.
~~~


### stale

#### B1-03 — confirmed by skeptic

**Where:** L46 (section 0), L2482 (24.4 banner), L2715-2724 (24.9), L2749-2750 (24.9.1), L3005 and L3026 (24.10)

**The handoff says:** Headline experiment numbers presented as current: '87 trials', cell A n=37 with mean 0.219, AUC 0.980, analyst-pair AUC 0.645

**Reality (finder):** All of these belong to the superseded 4af29c2 snapshot (97 rows, 87 scorable). The committed data at PRE (046a655 = 7f78b3f) has 100 rows, 90 scorable, cell A n=40 mean 0.2485, AUC 0.9792, analyst-pair AUC 0.6495, contradiction AUC 0.9605. A reader recomputing from the data file at PRE gets 90 / 40 / 0.248 / 0.979 / 0.650, not 87 / 37 / 0.219 / 0.980 / 0.645. '87' is also not a trial count at any snapshot: it is the scorable subset of 97 rows.

**Reality (skeptic's corrected statement):** The committed refusal_disagreement.json (last changed 046a655, 2026-09-20; identical blob at 7f78b3f) has 100 rows, of which 90 are scored: cell A n=40 mean 0.2485 (median 0.046, 9 of 40 above 0.6), B n=47 0.978, C n=3 0.999, D n=0; AUC refusal-vs-acceptance 0.979 live rule, 0.650 analyst pair, 0.961 contradiction. The 87-trial / n=37 / mean 0.219 / AUC 0.980 / 0.645 figures are from the earlier 4af29c2 snapshot (97 rows). The data file no longer exists on MAIN (deleted by e31fb58); it survives at 7f78b3f and on PR #56/#57.

**Finder's evidence:**

~~~text
git show 4af29c2:experiments/results/refusal_disagreement.json | python -I -c <recompute> -> 'TOTAL rows 97', 'scorable 87 unscorable 10 Counter({token bucket rate limiter backoff: 10})', cell A 'n': 37 'mean': 0.219, auc disagreement_live 0.9797 analyst_pair 0.6449 contradiction 0.9573. Same on 7f78b3f -> 'TOTAL rows 100', 'scorable 90', cell A 'n': 40 'mean': 0.2485 'median': 0.0463 'above_0.6': 9, auc 0.9792 / 0.6495 / 0.9605; 'STORED summary n_trials/usable/unclear: 90 90 0'. git rev-parse 7f78b3f:... and 046a655:... both = dd37ff8..., 4af29c2 blob = 92ed2a0.... REFUSAL_DISAGREEMENT_REPORT.md at 7f78b3f says 'Trials: 90 (90 usable, 0 excluded...)' and AUC '0.9792' / '0.6495'.
~~~

#### C08 — confirmed by skeptic and by hand

**Where:** L13 (TL;DR) and L179 (section 4)

**The handoff says:** '209/209 tests passing (pytest tests/ -q ...)' ; 'Test suite: pytest tests/ -q - 209/209 passing as of 2026-08-28. Runtime ~2m30s'

**Reality (finder):** The count is superseded by the document's own later sections (269 at L1612 s20.5; 260 collected after the editable reinstall at L1952 s22.3, L1895 s22). Statically, main/PR #58 contain 258 `def test_` in 22 test files (PRE had 267 in 24; e31fb58 deleted tests/test_alerting.py (4) and tests/test_tool_claim_coverage.py (5)). The command as written is also wrong: bare `pytest` resolves to the system Python (which lacks sqlmodel) and .venv/Scripts/pytest.exe exits 1 silently.

**Reality (skeptic's corrected statement):** OLD L13 and L179 are stale. 209/209 and ~2m30s are 2026-08-28 figures; the same document later records 260 collected (22.3, L1952). On main e31fb58 and PR #58 there are 258 `def test_` functions in 22 test files (PRE 7f78b3f: 267 in 24), because e31fb58 deleted tests/test_alerting.py and tests/test_tool_claim_coverage.py. Run `./.venv/Scripts/python.exe -m pytest tests/ -q`, not bare `pytest` (system Python, no sqlmodel) or .venv/Scripts/pytest.exe (stale shim, exits 1).

**Finder's evidence:**

~~~text
`for r in 7f78b3f origin/main origin/fix/no-mock-fallback; do git grep -h -E "^\s*(async )?def test_" $r -- tests | wc -l; done` -> 267, 258, 258. `git diff --name-status 7f78b3f origin/main -- tests` -> `D tests/test_alerting.py`, `D tests/test_tool_claim_coverage.py`. `which pytest` -> `<local path>`; system python: sqlmodel spec False. `./.venv/Scripts/pytest.exe --version; echo $?` -> exit 1.
~~~

#### C10 — confirmed by skeptic

**Where:** L39 (TL;DR, section 0)

**The handoff says:** 'Repo pushed through commit 3cd1080; working tree clean, origin/main in sync.'

**Reality (finder):** main is e31fb58, 150 commits past 3cd1080 (2026-08-28). Three PRs are open (#56, #57, #58).

**Reality (skeptic's corrected statement):** OLD L39 (section 0) is stale: 3cd1080 (2026-08-28) is 150 commits behind origin/main, which is e31fb58 (2026-09-21, owner direct commit). 55 PRs are merged; #56 and #57 are open and conflicting, and #58 and #59 are open and mergeable.

**Finder's evidence:**

~~~text
`git rev-list --count 3cd1080..origin/main` -> 150. `gh pr list --state all` -> 58 PRs, 55 MERGED, 3 OPEN (56 fix/grounding-truncation-visible, 57 docs/handoff-25-5, 58 fix/no-mock-fallback).
~~~

#### C13 — confirmed by skeptic

**Where:** L38 (TL;DR, section 0); L902, L922 (section 16.7)

**The handoff says:** 'Design direction is frozen in bedhi_frontend.md'

**Reality (finder):** The file no longer exists on main or PRE. It was deleted by c6198e3 (2026-09-14, 'drop the agent prompts').

**Reality (skeptic's corrected statement):** OLD L38 and L902 are stale: bedhi_frontend.md (added in 3909d61, 2026-08-30) was deleted in c6198e3 (2026-09-14) and is absent from main, PRE and PR #58. Recover it with `git show c6198e3^:bedhi_frontend.md`.

**Finder's evidence:**

~~~text
`git ls-tree -r --name-only origin/main | grep -i bedhi` -> no output. `git show --stat --format= c6198e3 | grep -i bedhi` -> ` bedhi_frontend.md | 871 ----`.
~~~

#### C14 — confirmed by skeptic

**Where:** L5 (header); also L3058-3060 (section 24) 'the same staleness as the editable installs in Section 4'

**The handoff says:** 'the venv's editable installs still point at the old path' (and Section 4 is said to describe it)

**Reality (finder):** Superseded by Section 22.3: both editable installs were reinstalled on 2026-09-17 and now resolve to the current checkout. What is still stale is the console-script .exe shims. Section 4 itself says nothing about editable installs, so the L3060 cross-reference points at nothing. Related worktree trap: from a worktree the venv's `app`/`agentpulse` resolve to the MAIN checkout, not the worktree.

**Reality (skeptic's corrected statement):** Both editable installs were reinstalled on 2026-09-17 (22.3). The .pth files point at <repo> and ...\sdk\src, so from a git worktree `import app` and `import agentpulse` load the MAIN checkout's code, not the worktree's. What is still stale is the pre-rename path in the .venv/Scripts/*.exe shims, pyvenv.cfg and the activate script. Section 4 never mentions editable installs, so the L3060 cross-reference is dangling.

**Finder's evidence:**

~~~text
`cat .venv/Lib/site-packages/_editable_impl_agentpulse_backend.pth` -> `<repo>` (mtime 2026-09-17 12:45). `python -I -B -c "import importlib.util as u; print(u.find_spec('app').origin)"` -> `...\Agentpluse\backend\app\__init__.py`. From the PR #58 worktree: `python -B -c 'import app; print(app.__file__)'` -> `<repo>` (main checkout). `grep -n -i editable` on lines 171-194 -> no hit.
~~~

#### C17 — confirmed by skeptic

**Where:** L210 (section 6 item 3)

**The handoff says:** 'Redesign tool-claim extraction - attempted and blocked on labelling, not engineering ... Restarting it means first making the labelling question well-posed (12.4), not rewriting the extractor.'

**Reality (finder):** Overtaken by later sections and by e31fb58. 18.4 shipped an ingest-path fix (extract_result_count). 25.3 shows COUNT_PATTERNS is digit-only and extracts a count from 0 of 9 real outputs once the demo's dictated sentence is removed, which contradicts 'not rewriting the extractor'. On main, e31fb58 removed Evaluation.tool_claims_found, migration a7f2c3d9e104 and tests/test_tool_claim_coverage.py, so the coverage work from PR #55 is gone.

**Reality (skeptic's corrected statement):** Item 3 is still blocked on labelling (12.3/12.4), but 18.4 (7f78b3f lineage) already changed the tool-claim ingest path (extract_result_count), and 25.3 shows COUNT_PATTERNS is digit-only (9/9 extracted as produced, 0/9 without the prompt-dictated sentence), so the extractor does need work. On main (e31fb58) Evaluation.tool_claims_found, migration a7f2c3d9e104 and tests/test_tool_claim_coverage.py are gone; they exist at 7f78b3f.

**Finder's evidence:**

~~~text
SESSION_HANDOFF.md L3140-3160 (25.3): 'COUNT_PATTERNS is digit-only, so "three documents" does not match'. `git cat-file -e origin/main:backend/migrations/versions/a7f2c3d9e104_add_tool_claims_found_to_evaluations.py` and `...:tests/test_tool_claim_coverage.py` -> both missing (present on 7f78b3f). `git diff 7f78b3f origin/main -- backend/app/models.py` removes `tool_claims_found: Optional[int] = None`.
~~~

#### C18 — confirmed by skeptic

**Where:** L214 (section 6 item 7)

**The handoff says:** 'reviewed and checkpointed (8a93558) with three known gaps recorded - see Section 15.'

**Reality (finder):** The three gaps (hardcoded drift series, datasets table, stale experiments configs) were closed in Section 16 (TL;DR L26) and the dashboard was then replaced wholesale in 18.2, so the gaps no longer exist as described. Item 7 reads as if they are still open.

**Reality (skeptic's corrected statement):** Item 7: the three Section 15.4 gaps (hardcoded drift series, hardcoded datasets table, stale experiments configs) were closed in Section 16.1 (2026-08-30), and the dashboard was then replaced wholesale in 18.2. DriftCenterView no longer exists; DriftView.tsx replaces it.

**Finder's evidence:**

~~~text
TL;DR L26: 'the three Section 15.4 gaps are closed - drift, datasets and experiments all read live endpoints now. Section 16.' L30: 'The dashboard was replaced wholesale ... Section 18.2.'
~~~

#### C19 — confirmed by skeptic

**Where:** L215 (section 6 item 8) and L47 (TL;DR)

**The handoff says:** 'Re-run ablation Configs D, E and F. Still open, and now more stale: ablation_results.json is dated 2026-08-23'

**Reality (finder):** Done 2026-09-18 (9cd0819); 24.5 found every classification bit-identical and recorded the limitation. Item 8 is still unstruck. Second-order: e31fb58 reverted the artifacts on main, so ablation_results.json is dated 2026-08-23 again (original latencies), THRESHOLD_ANALYSIS.md is reverted, and the 24.5 limitation text ('ceiling a signal reaches when fed correct inputs') was deleted from experiments/ablation.py. 24.5 says it is 'Recorded in the limitations, in the template in ablation.py', which is false on main and PR #58.

**Reality (skeptic's corrected statement):** Item 8 was done on 2026-09-18 (9cd0819; 24.5: all classifications bit-identical to 2026-08-23). e31fb58 reverted it on main: ablation_results.json is dated 2026-08-23 17:56:09 UTC again, THRESHOLD_ANALYSIS.md is reverted, and the 'does not exercise the production ingest path' limitation bullet is deleted from experiments/ablation.py. Neither PR #58 nor #59 restores these, so 24.5's 'recorded in the limitations' is false on both.

**Finder's evidence:**

~~~text
`git show 7f78b3f:experiments/results/ablation_results.json | grep -n timestamp` -> `2026-09-18 17:34:03 UTC`; `git show origin/main:...` -> `2026-08-23 17:56:09 UTC`. `git diff 7f78b3f origin/main -- experiments/ablation.py` removes the bullet '**This study does not exercise the production ingest path, and Config D is the clearest case.**'. `git log -3 origin/main -- experiments/results/ablation_results.json` -> e31fb58, 9cd0819, 73b533f.
~~~

#### C20 — confirmed by skeptic

**Where:** L216 (section 6 item 9)

**The handoff says:** 'the standing gradient-text hook suppression (Section 2) ... one-line user decisions away'

**Reality (finder):** Moot. No `wordmark-gradient` or `gradient-text` exists anywhere in dashboard/src on main or PRE (the dashboard was replaced in 18.2). The branch/PR half is answered (C11).

**Reality (skeptic's corrected statement):** The `gradient-text` suppression in item 9 and Section 2 is moot: no `.wordmark-gradient` or any text-gradient style exists in dashboard/ on main, 7f78b3f or PR #58. The dashboard was replaced in 18.2 and the hook has nothing left to flag.

**Finder's evidence:**

~~~text
`git grep -n -c "wordmark-gradient\|gradient-text" origin/main -- dashboard/src` -> no output; same on 7f78b3f.
~~~

#### C23 — confirmed by skeptic

**Where:** L221-222 (section 6, What is actually next 2 and 3); L224

**The handoff says:** '2. Dashboard, last - the remaining work ... 3. The disagreement research question: how to distinguish true contradiction from legitimate disagreement caused by partial evidence (14). Do not improve claim extraction before answering it.'

**Reality (finder):** Both are overtaken. The dashboard was unfrozen (16), replaced and wired to the live API (18.2), de-faked in 21-23 and 26.1; it is not 'the remaining work'. The disagreement thread was re-diagnosed in 24.9.4-24.9.5: the first problem is the malformed comparison (planner questions vs a statement), not evidence partition, and Cell D of the 2x2 is still empty (24.9, L46). The list also omits what later sections left open: input_truncated is not stored on the evaluation row (25.2; PR #56), 25.5/25.6 (PR #57), the retriever/answerer before/after drift run without a restart (26.4), and the SDK discarding spans silently from sync callers (24).

**Reality (skeptic's corrected statement):** Items 2 and 3 are superseded. The dashboard was unfrozen (16), replaced and wired to the live API (18.2), and de-faked in 26.1, so it is not 'the remaining work'. The disagreement thread was re-diagnosed in 24.9.4-24.9.5 (malformed comparison first; Cell D still empty). Open work as of OLD: store input_truncated on the evaluation row (25.2, PR #56), the SDK silently discarding spans from synchronous callers, a retriever/answerer before/after drift run without a worker restart (26.4), and decisions on PRs #56-#58.

**Finder's evidence:**

~~~text
SESSION_HANDOFF.md L26, L30, L43-L46, L3074-3085 ('Open, and the reason this section stops where it does'), L3105-3115 (25.2 'One gap worth closing regardless'), L3346 ('Open: the retriever and answerer still have no before/after comparison'). `gh pr list` -> #56 'Record whether a grounding score was computed on truncated evidence', #57 'Record 25.5 and 25.6'.
~~~

#### D-08 — confirmed by skeptic

**Where:** L13 (TL;DR), L179 (Section 4)

**The handoff says:** '**209/209 tests passing** ... was 130 before the productization arc'; Section 4: '209/209 passing as of 2026-08-28'.

**Reality (finder):** The document's own later sections give other totals: 226 (L1389, 19.6), 237 (L1571, 20.3), 269 (L1612, 20.5, apparently 237 backend + 32 dashboard), and 'Backend 260 passed, dashboard 32 passed' (L1895), with 253 -> 260 (L1952) after a broken editable install hid two files (22.3). 22.11 warns that earlier quoted counts were over a reduced suite. Neither the TL;DR nor Section 4 was updated. Static count on MAIN is 258 test functions (267 on PRE), and e31fb58 deleted two test files.

**Reality (skeptic's corrected statement):** 209 was the exact test-function count at 3cd1080 (2026-08-28) and nothing else. The handoff's own later sections report 226, 237, 260 backend + 32 dashboard. Static counts now are 267 at 7f78b3f, 258 on main and PR #58, 262 on P59 (these are function counts; pytest's parametrized total differs). The TL;DR and Section 4 should quote one dated, sourced count.

**Finder's evidence:**

~~~text
grep -n -i -E '[0-9]+ ?(/ ?[0-9]+)? (tests|passed|passing)|suite is' SESSION_HANDOFF.md -> L13 '209/209', L179 '209/209', L1389 'suite is **226**', L1571 '237 automated tests', L1612 'the 269 tests', L1895 'Backend 260 passed', L1952 'Collection went 253 -> 260'. for r in 7f78b3f origin/main origin/fix/no-mock-fallback: git -C "$R" grep -h -E '^\s*(async )?def test_' $r -- 'tests/*.py' | wc -l -> 267, 258, 258 (24, 22, 22 files).
~~~

#### D-09 — confirmed by skeptic

**Where:** L39 (TL;DR)

**The handoff says:** 'Repo pushed through commit `3cd1080`; working tree clean, `origin/main` in sync.'

**Reality (finder):** 3cd1080 is the 2026-08-28 health/readiness commit. origin/main is e31fb58 (2026-09-21), 150 commits later.

**Reality (skeptic's corrected statement):** 3cd1080 (2026-08-28) is 150 commits behind origin/main (e31fb58, 2026-09-21) and 153 behind OLD's own tip 7262ff0. The 'pushed through 3cd1080, in sync' bullet describes 2026-08-28 and is stale.

**Finder's evidence:**

~~~text
git -C "$R" log -1 --format='%h %ad %s' --date=short 3cd1080 -> '3cd1080 2026-08-28 Health/readiness...'; git -C "$R" rev-list --count 3cd1080..origin/main -> 150; git log -1 origin/main -> 'e31fb58 2026-09-21 P.Somnath Reddy refactor: remove tool claim tracking and alerting'.
~~~

#### D-10 — confirmed by skeptic

**Where:** L215 (Section 6 item 8), L218-222 ('What is actually next')

**The handoff says:** Item 8 'Re-run ablation Configs D, E and F. Still open, and now more stale' (not struck through). 'What is actually next' says capability tiers are 'a re-confirm or a skip' because 'Nothing measured since has changed them', and 'Dashboard, last — the remaining work'.

**Reality (finder):** 24.5 (L2580-2590) re-ran the whole ablation and found it bit-identical, so item 8 is closed. 24.9.5, 25 and 14 materially change the disagreement and tool-claim tiers. The dashboard was replaced wholesale in 18.2 and reworked through 21-23 and 26.

**Reality (skeptic's corrected statement):** Item 8 was completed by 24.5 (re-run, classification metrics bit-identical; 7f78b3f is the only ref with the regenerated file) and should be struck through. 'Dashboard, last - the remaining work' is stale (dashboard replaced in 18.2 and reworked through 21-23 and 26); the live open items are in 24.10, 25.4 and 26.4. The statement that capability tiers need re-confirming is arguable, not demonstrably wrong.

**Finder's evidence:**

~~~text
sed -n '215p;220,222p' SESSION_HANDOFF.md -> 'Re-run ablation Configs D, E and F. Still open' / 'Nothing measured since has changed them' / 'Dashboard, last — the remaining work'. sed -n '2580,2582p' -> 'Next-steps item 8 assumed ... Re-ran the whole study: every classification is bit-identical to 2026-08-23.'
~~~

#### D-11 — REFUTED by skeptic

**Where:** L297 and L299 (Section 9) vs L213 (Section 6 item 6)

**The handoff says:** Section 9: '`DRIFT_EXPERIMENT_REPORT.md` §3 still carries the wrong sentence and **should be corrected** — the only drift doc item still outstanding' and 'Running that script silently reverts commit `19cde3a`... If you re-run it, restore the report afterwards'.

**Reality (finder):** Section 6 item 6 (L213) says the premise was wrong, §3 was already correctly scoped, and the regeneration hazard was fixed in 78697c5 (also 15.1 'report-regeneration hazard removed'). The heading says 'historical', but the body is written in present tense and instructs the reader to act.

**Why the skeptic refuted it:** The finding bundles two claims and I can confirm only one. (a) The L299 regeneration instruction is stale: 78697c5 is an ancestor of main and drift_scenarios.py now says it must not write the report. (b) The L297 claim ('DRIFT_EXPERIMENT_REPORT.md section 3 still carries the wrong sentence and should be corrected') is NOT shown to be stale. It still appears true on every ref. DRIFT_EXPERIMENT_REPORT.md has the same blob (f5a1cce9) at 7f78b3f, 7262ff0 and origin/main. Its section 3 is still headed 'Why the embedding-centroid signal never fired' and still says both detections came via the stability_index<70 branch, with no correction pointer. The repo's own DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md section 3 calls that claim wrong and section 9.1 says to correct it. I recomputed the peak centroid distances analytically and they exceed 0.30. So the verifier misjudged which side of the L213-vs-L297 conflict is wrong. Applying its suggested fix ('superseded by item 6') to L297 would hide a real outstanding defect. Unconfirmed as framed; the true half is reported under 'missed'.

**Finder's evidence:**

~~~text
sed -n '213p' SESSION_HANDOFF.md -> '~~Correct DRIFT_EXPERIMENT_REPORT.md §3~~ — investigated, and the premise was wrong ... Fixed in `78697c5`'. git -C "$R" log -1 --format='%h %ad %s' --date=short 78697c5 -> '78697c5 2026-08-27 Stop drift_scenarios.py from overwriting the curated drift report'. git grep -n '1-2 spans' origin/main -- experiments/drift_scenarios.py -> no match.
~~~

#### D-12 — confirmed by skeptic

**Where:** L98-114 (Section 2 'READ THIS FIRST'), L138-142 ('Still open (category C)')

**The handoff says:** 'READ THIS FIRST (2026-08-27): there is substantial uncommitted dashboard work in the tree ... Do not commit it blind', plus an open list of fake surfaces: trace waterfall, replay debugger, DatasetsView stale count.

**Reality (finder):** Section 6 item 7 (L214), 15.1 and Phase 0 say it was reviewed and checkpointed in 8a93558; 16.1 closes the DatasetsView gap; 18.2 replaced the dashboard wholesale. The banner is the first thing a reader meets in Section 2, and it is wrong.

**Reality (skeptic's corrected statement):** The L98-114 banner is resolved and should be marked historical: the six files it lists (App.tsx, index.html, index.css, tailwind.config.js, SideRail.tsx, lib/api.ts) were reviewed and committed as 8a93558 (2026-08-27, +1749/-375), which removed SAMPLE_WATERFALL_SPANS and SAMPLE_REPLAY_STEPS from App.tsx (12 matches at 8a93558~1, 0 at 8a93558); the DatasetsView stale count was closed in 16.1, and the whole dashboard was replaced in 94ef6eb (18.2). Nothing in the 'Still open (category C)' list (L138-142) is open; see Section 6 item 7 (L214), 15.1, 16.1.

**Finder's evidence:**

~~~text
sed -n '214p' SESSION_HANDOFF.md -> '~~Decide what to do with the uncommitted dashboard work~~ — reviewed and checkpointed (`8a93558`)'; sed -n '722p' -> '| Phase 0 freeze | `8a93558` ... dashboard checkpointed'; sed -n '787,791p' -> '16.1 The three Section 15.4 gaps are closed ... DatasetsView calls /v1/datasets'.
~~~

#### D-13 — confirmed by skeptic

**Where:** L5 (header); also L883, L1027-1029, L1198-1200, L1459-1461

**The handoff says:** 'the venv's editable installs still point at the old path' (and 16.5/17.6/18.9/19.10 'Fix with pip install -e backend -e sdk', 'Every command still needs PYTHONPATH').

**Reality (finder):** 22.3 reinstalled both editables ('Collection went 253 -> 260'), and the installs now point at the real checkout. 22.11 never lists the earlier 'still true' entries as closed, so four sections still tell the reader to use the PYTHONPATH workaround.

**Reality (skeptic's corrected statement):** Both editable installs were reinstalled in 22.3 and now point at the real checkout (.pth entries <repo> and ...\backend), so `import agentpulse, app` works with no PYTHONPATH and `pip install -e backend -e sdk` is no longer needed; they resolve to the main checkout, not to a worktree. Only .venv/Scripts/uvicorn.exe still has the pre-rename interpreter path baked in (use `python -m uvicorn`). L5, L882-884, L1027-1029, L1198-1200 and L1459-1461 should be struck through.

**Finder's evidence:**

~~~text
cat .venv/Lib/site-packages/agentpulse-0.1.0.dist-info/direct_url.json -> {"dir_info": {"editable": true}, "url": "file:///C:/MLOPs/3rd%20sem%20project/Agentpluse/sdk"}; agentpulse_backend-0.1.0.dist-info -> .../Agentpluse/backend. sed -n '1952p' SESSION_HANDOFF.md -> 'Reinstalled both editable against the real checkout. Collection went 253 -> 260.'
~~~

#### D-14 — confirmed by skeptic

**Where:** L19 and L21 (TL;DR)

**The handoff says:** 'Inter-agent disagreement engine rebuilt and wired into production this session — the project's largest claim-vs-reality gap is closed. See Section 7.' and 'defensible niche ... is now two'.

**Reality (finder):** Written for 2026-08-27 ('this session'). Sections 14, 24.9.5 and 25.4 show disagreement detected 0 of 10 external contradictions and that its measured performance was an artifact. So the 'gap is closed' bullet and the 'two surviving signals' count are contradicted by L14, L43-44 and L3181 in the same TL;DR.

**Reality (skeptic's corrected statement):** L19 is superseded: the engine was rebuilt and wired in (Section 7), but Section 14 shows it detects 0 of 10 external contradictions and 24.9.5 shows its measured performance was an artifact of comparing planner questions (AUC 0.980 -> 0.457 once they are excluded), so the claim-vs-reality gap is not closed. In L21 'now two' counts only 'no competitor ships it as a named feature'; COMPETITIVE_POSITIONING.md 5.4 (MAIN L358) states disagreement is no longer a differentiator claim at all, so only drift survives as a defensible differentiator.

**Finder's evidence:**

~~~text
sed -n '19p;21p;43p' SESSION_HANDOFF.md; sed -n '3181,3184p' -> 'Two of four have performance that comes from the harness rather than the signal'.
~~~

#### D-15 — confirmed by skeptic

**Where:** L418-419 (Section 11)

**The handoff says:** '`COMPETITIVE_POSITIONING.md` §5.1 presents deterministic tool-claim validation as a live differentiator... The section needs revisiting ... It has not been edited yet.'

**Reality (finder):** 13.3 (L595) and TL;DR L23 say §3, §5.1, §5.4 and §9 were all revised after the audits.

**Reality (skeptic's corrected statement):** COMPETITIVE_POSITIONING.md 5.1 was revised on 2026-08-27 in b3d17fd and is now titled 'Deterministic tool-claim validation -- inert on real agents' (MAIN L152); 3, 5.4 and 9 were revised after the Phoenix/MLflow audits (13.3, L595). The Section 11 bullet 'It has not been edited yet' (L418-419) is done and should say '(done, see 13.3)'.

**Finder's evidence:**

~~~text
sed -n '418,419p;595,596p;23p' SESSION_HANDOFF.md.
~~~


### minor

#### B1-13 — confirmed by skeptic

**Where:** L2869-2872 (section 24.9.3)

**The handoff says:** 'Across all 34 it does not hold' and, within one anchor, paraphrases opening 'Indeed' or 'The evidence' 'scored ~0.02'

**Reality (finder):** Only 32 paraphrases were scored; the first-word groups sum to 18 + 8 + 5 + 1 = 32. Within the google-accept anchor the three 'Indeed' paraphrases score 0.0127, 0.2227, 0.0192, so one is 0.22, not ~0.02. The conclusion is unaffected.

**Reality (skeptic's corrected statement):** The first-word analysis in 24.9.3 covers the 32 scored paraphrases (34 were generated, 2 discarded below 0.85 similarity), not 'all 34'. Within the google-accept anchor, four of the five 'Indeed'/'The evidence' paraphrases score 0.012-0.028, and one 'Indeed' paraphrase scores 0.223. The three 'Certainly' paraphrases score 0.991-0.996.

**Finder's evidence:**

~~~text
first-word grouping of kept variants in paraphrase_stability.json at 7f78b3f: 'the n=18', 'indeed n=8', 'certainly n=5', 'here n=1'; 'anchor 2 google accept indeed [0.0127, 0.2227, 0.0192]'.
~~~

#### B1-14 — confirmed by skeptic

**Where:** L2794 (24.9.2) vs L2850 (24.9.3)

**The handoff says:** The same stored score (meta/muse-glimmer-30b, transformer query, disagreement 0.0075) is written '0.007' at L2794 and '0.008' at L2850

**Reality (finder):** One stored value (0.0075) rounded two ways.

**Reality (skeptic's corrected statement):** The meta/muse-glimmer-30b acceptance on 'transformer multi-head self-attention' has a stored disagreement score of 0.0075. The handoff writes it as 0.007 at L2794 (24.9.2) and 0.008 at L2850 (24.9.3); use one value (0.0075) in both.

**Finder's evidence:**

~~~text
refusal_disagreement.json at 7f78b3f: meta r0 'disagreement_live' 0.0075; paraphrase_stability.json anchor 'disagreement': 0.0075.
~~~

#### B1-15 — confirmed by skeptic

**Where:** L2727-2729 (24.9), L46

**The handoff says:** 'A wrong refusal scores 0.999, fractionally above a correct one at 0.978'

**Reality (finder):** True only by mean. Cell B's mean is pulled down by one 0.0 row (google, 'italian carbonara pasta recipe'); B's median is 0.9997 and C's is 0.9998, effectively a tie. The conclusion (no difference within refusals) stands, but the handoff itself warns at L3009 never to report a cell by mean alone.

**Reality (skeptic's corrected statement):** Wrong refusals (cell C, n=3) have median 0.9998 and mean 0.9987; correct refusals (cell B, n=47) have median 0.9997 and mean 0.9778. B's lower mean comes from one 0.0 row (google, 'italian carbonara pasta recipe'); without it B's mean is 0.9990. The two cells are indistinguishable, not 'fractionally above'.

**Finder's evidence:**

~~~text
7f78b3f recomputation: B disagreement_live 'median': 0.9997, 'mean': 0.9778, 'above_0.6': 46 (of 47); C 'median': 0.9998, 'mean': 0.9987; 'refusal rows <=0.6: [(0.0, google, italian carbonara pasta recipe)]'.
~~~

#### B1-16 — confirmed by skeptic

**Where:** L2592-2593 (24.5), L47 (section 0)

**The handoff says:** 'Config D has shown parity with the best configuration for months'

**Reality (finder):** The ablation file exists from 2026-08-23 and the re-run is dated 2026-09-18, about 26 days (the handoff elsewhere says 'a month apart').

**Reality (skeptic's corrected statement):** Config D's parity with the best configuration was first measured on 2026-08-23 and reproduced on 2026-09-18, so it had held for about four weeks when 24.5 was written (2026-09-19), not 'months'.

**Finder's evidence:**

~~~text
git log --format='%h %ad %s' --date=short -- experiments/results/ablation_results.json: e83b783 2026-08-23 ... 9cd0819 2026-09-18.
~~~

#### B3-14 — confirmed by skeptic

**Where:** L3160-3161 (section 25.3)

**The handoff says:** '"three documents" does not match while "3 documents" does'.

**Reality (finder):** A bare '3 documents' does not match either. COUNT_PATTERNS also needs an adjacent verb: 'I retrieved 3 documents covering X.' matches; '3 documents', 'I used 3 documents covering X.', 'The 3 documents cover X.' and 'Retrieved 3 foundational papers.' all extract nothing. Digits are necessary, not sufficient (L1116-1119 already records the adjacency limit).

**Reality (skeptic's corrected statement):** COUNT_PATTERNS (backend/app/services/tool_claim.py, unchanged between 7f78b3f and e31fb58) needs digits adjacent to the noun plus a verb such as found/retrieved/returned (or 'N documents were retrieved'): 'Retrieved 3 documents' matches, while 'retrieved three documents' and a bare '3 documents' do not.

**Finder's evidence:**

~~~text
extract_claims on each string: '3 documents' -> []; 'I used 3 documents covering X.' -> []; 'The 3 documents cover X.' -> []; 'Retrieved 3 foundational papers.' -> []; 'I retrieved 3 documents covering X.' -> [('unknown', 3)]; 'I found 5 results' -> [('unknown', 5)].
~~~

#### B3-15 — confirmed by skeptic

**Where:** L3312, L3317 (section 26.3)

**The handoff says:** Verifier before-switch mean 0.306.

**Reality (finder):** The exact mean is 0.305459 (0.3055 at four decimals), which rounds to 0.305; 0.306 is a double-rounding artefact. The other means (0.396, 0.093, 0.502) and maxima round correctly.

**Reality (skeptic's corrected statement):** Verifier before the topic switch: n=11, mean 0.305 (0.30546), 7 of 11 above the 0.30 threshold; after: n=17, mean 0.396, 17 of 17 above. OLD L3312 and L3317 say 0.306.

**Finder's evidence:**

~~~text
Python: `before: n=11 mean=0.305459 min=0.1818 max=0.3780 above0.30=7`; after `mean=0.395702`; retriever after `mean=0.093379`; answerer after `mean=0.501834`.
~~~

#### B3-16 — confirmed by skeptic

**Where:** L3297-3298 (section 26.3)

**The handoff says:** Block quote presented verbatim: "The current window is deliberately left empty: it holds the most recent outputs, and outputs from before a restart are no longer current."

**Reality (finder):** Paraphrase inside quotation marks. The docstring reads 'The current window (`_recent_embeddings`) is deliberately left empty: it holds the most recent `mean_window` outputs, and outputs from before a restart are no longer "current". Re-warming those few samples is correct; re-warming the entire baseline from scratch was not.' The substance is unchanged, but the text is not verbatim and elisions are unmarked.

**Reality (skeptic's corrected statement):** The quote is a paraphrase. The docstring in backend/app/services/drift.py (load_window_baseline, unchanged since d662e80) reads: 'The current window (`_recent_embeddings`) is deliberately left empty: it holds the most recent `mean_window` outputs, and outputs from before a restart are no longer "current".'

**Finder's evidence:**

~~~text
`git show origin/main:backend/app/services/drift.py | sed -n 474,481p`.
~~~

#### B3-17 — confirmed by skeptic

**Where:** L3276-3330 (section 26.3), data source

**The handoff says:** The 26.3 measurements are 'drift, finally measured against real traffic' from the local database.

**Reality (finder):** The database holding them (handoff-continuation-bb2790/data/agentpulse.db) is stamped alembic revision b8e4d1c72f35, a revision that exists only on P56 (it descends from a7f2c3d9e104, which MAIN removed). Neither main nor P58 contains that revision, so the stack documented on those branches cannot open or upgrade this database; its evaluations table also carries tool_claims_found, grounding_input_truncated and grounding_input_tokens columns that main's schema lacks. The handoff gives no pointer to the database or to this caveat.

**Reality (skeptic's corrected statement):** The 26.3 measurements come from the evaluation database in the handoff-continuation-bb2790 worktree (data/agentpulse.db), which is stamped alembic revision b8e4d1c72f35. That revision exists only on PR #56 (origin/fix/grounding-truncation-visible, descending from a7f2c3d9e104, which e31fb58 removed). `alembic upgrade head` or `alembic current` on main, #58 or #59 would not find it, although main's app (create_all, nullable extra columns) can still open the file. The handoff does not say where the data lives.

**Finder's evidence:**

~~~text
DB `select * from alembic_version` -> [('b8e4d1c72f35',)]. `git grep -n -E '^revision' origin/main -- backend/migrations/versions/` lists 60a86ca23d8c, 8d86fee0d663, c4b7e91a2f08, 30ca7751ff88 only; origin/fix/grounding-truncation-visible additionally has a7f2c3d9e104 and b8e4d1c72f35_add_grounding_truncation_to_evaluations.py. `pragma table_info(evaluations)` includes tool_claims_found, grounding_input_truncated, grounding_input_tokens.
~~~

#### C15 — confirmed by skeptic

**Where:** L173 (section 4)

**The handoff says:** 'Always invoke as ./.venv/Scripts/python.exe (git-bash on Windows; plain python hits system Python, missing kaggle etc.)'

**Reality (finder):** The advice holds in the main checkout but fails in a worktree (relative path; worktrees have no .venv). The stated reason is stale: system Python now has kaggle and pytest; what it lacks is sqlmodel, so the backend and tests cannot import.

**Reality (skeptic's corrected statement):** Always use the venv interpreter: ./.venv/Scripts/python.exe in the main checkout, or the absolute <repo> from a worktree, which has no .venv of its own. Plain `python` is Python 3.13 without sqlmodel, so the backend and tests cannot import. It does have kaggle and pytest, so 'missing kaggle' is not the reason.

**Finder's evidence:**

~~~text
`ls .claude/worktrees/goofy-tharp-4a4214/.venv` -> `No such file or directory`. `python -B -c "import importlib.util as u; print(u.find_spec('kaggle') is not None, u.find_spec('pytest') is not None, u.find_spec('sqlmodel') is not None)"` -> `True True False` for sys.executable <local path>
~~~

#### C16 — confirmed by skeptic

**Where:** L206 (section 6 preamble)

**The handoff says:** 'The recommendation given to the user, and the reasoning, is in Section 9.'

**Reality (finder):** Section 9 is 'The drift documentation defect (historical)' and contains no recommendation. Section 8 L262 likewise says 'is why Section 6 item 2 exists' about the competitor-install gap, but item 2 is the tool-claim external test (the Phoenix audit is item 4).

**Reality (skeptic's corrected statement):** Section 9 holds no recommendation. The sentence at L206 is a leftover from the 2026-08-27 version, where Section 9 was the drift-priority argument, and should be deleted. L264 (Section 8) should say 'Section 6 item 4' (the Phoenix/MLflow audit), not item 2.

**Finder's evidence:**

~~~text
`sed -n 287,301p SESSION_HANDOFF.md` -> heading '## 9. The drift documentation defect (historical ...)', body is the report-prose defect only. `sed -n 208,212p` -> item 2 = 'Test the tool-claim validator on the external corpus', item 4 = 'Install Phoenix'.
~~~

#### C25 — confirmed by skeptic

**Where:** L194 (section 4)

**The handoff says:** 'requests without it get a 401 with no other clue.'

**Reality (finder):** The 401 body carries a message.

**Reality (skeptic's corrected statement):** Requests without a valid X-API-Key get 401 {"detail":"Invalid or missing API key"}. While AGENTPULSE_LOCAL_DEV_MODE is true (the default), GET requests need no key; writes always do. The default key value is change-me-to-a-secure-key.

**Finder's evidence:**

~~~text
backend/app/middleware.py: `return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})`.
~~~

#### C26 — confirmed by skeptic

**Where:** L171-194 (section 4) - omission

**The handoff says:** Section 4 is presented as the complete list of commands for running the stack ('verified working, not re-derived').

**Reality (finder):** It omits the RAG chatbot service that PR #58 adds and that the dashboard's /chat and /corpus proxies depend on (port 8100), the dashboard proxy targets/env (VITE_AGENTPULSE_API, VITE_CHATBOT_API), and the cwd/process rules from section 24 that only live at L3058-3067.

**Reality (skeptic's corrected statement):** Section 4 has no recipe for the RAG chatbot (demo/chatbot/app.py exists only on PR #58). To run it, with the backend and the worker already running: export NVIDIA_API_KEY, AGENTPULSE_ENDPOINT=http://127.0.0.1:8000 and AGENTPULSE_API_KEY, then `python -m uvicorn demo.chatbot.app:app --port 8100`. The dashboard's RAG client talks to http://localhost:8100 directly (VITE_RAG_API_URL); vite.config.ts's /chat and /corpus proxies exist on #58 but the client does not use them. The cwd and process rules (run API and worker from the repo root, use `python -m uvicorn`) are only in Section 24.10, L3058-3067.

**Finder's evidence:**

~~~text
`sed -n 60,67p demo/chatbot/app.py` (PR #58) -> `python -m uvicorn demo.chatbot.app:app --port 8100`, needs NVIDIA_API_KEY, AGENTPULSE_ENDPOINT, AGENTPULSE_API_KEY, 'AgentPulse backend AND worker running'. `git show origin/fix/no-mock-fallback:dashboard/vite.config.ts` -> proxy '/v1' -> http://127.0.0.1:8000, '/chat' and '/corpus' -> http://127.0.0.1:8100.
~~~

#### D-28 — confirmed by skeptic

**Where:** L563 (13.1), L51 and L3266 (quotes), L1883 (21.10)

**The handoff says:** L563: 'AgentPulse's own implementation measures F1 0.000 on real traces (§11)'. L51 and L3266: '24.7's "listed is not served"'. L1883: 'Still true from 20.5 ... dashboard tests still cover `lib/` only'.

**Reality (finder):** F1 0.000 is reported in 12.1 (L458), and Section 11 reports only 'zero claims from 8,353 spans'. The quoted phrase 'listed is not served' appears nowhere in 24.7 (it appears only in L51 and L3266). The spirit matches 24.7, but the quote marks mislead. The 'dashboard tests cover lib/ only' item is in 19.10 (L1470), not 20.5.

**Reality (skeptic's corrected statement):** L563 (13.1) should cite §12.1 (the F1 0.000 table, L458) rather than §11. The quotation 'listed is not served' (L51, L3266) is not a sentence in 24.7, which says roughly half of a free-model catalogue does not produce text; paraphrase it without quote marks. The 'dashboard tests cover lib/ only' item is 19.10 (L1470), carried by 20.5's 'unchanged' list, not itemised there.

**Finder's evidence:**

~~~text
grep -n '0\.000' SESSION_HANDOFF.md -> L23, L458, L562, none inside 383-440. grep -n -i 'listed is not served' -> L3266 only (L51 paraphrases). sed -n '1470p;1599,1616p'.
~~~

#### D-29 — confirmed by skeptic

**Where:** L3 (header), L2217 (23 intro), L1895, L2415, L3194 vs headings L1889, L2215, L2414, L3194

**The handoff says:** Heading date stamps are consistent with neighbouring sections.

**Reality (finder):** 22 is stamped (2026-09-17), but 22.10 says it was found 'one day later' and Section 23 (stamped 09-17/18) opens by following 22.11. 24 is stamped (2026-09-18/19), but 24.8-24.9.5 and 24.10 were committed 2026-09-20 (62be27b, 9e3df62, e0e037a). 26 is stamped (2026-09-20/21) and sits after 25 (2026-09-21), so the stamps run backwards. Sections 7, 8 and 9 carry no date at all.

**Reality (skeptic's corrected statement):** Stamp Section 24 as 2026-09-18/20 (24.8-24.10 were committed 2026-09-20 in 62be27b/e0e037a) and put the L3 header's 'Updated' entries in date order, adding 19-23 and 25. The 'one day later' in the 22.10 title (L2115) and 'the next day' (L2171) are not supported by git, which puts the hero-card fix and the 22.10 record on the same day, 2026-09-17.

**Finder's evidence:**

~~~text
git -C "$R" log --all -S'#### 24.9.5 The fix' --format='%h %ad' --date=iso -- SESSION_HANDOFF.md | tail -1 -> 'e0e037a 2026-09-20 02:57:37 +0530'; -S'## 25. The same test' -> 'f5fe051 2026-09-21 00:12:49 +0530'; -S'## 26. The RAG' -> '7262ff0 2026-09-21 03:49:53 +0530'; -S'### 22.10 Rehearsing' -> 'f7727bb 2026-09-17 16:34:22 +0530'. Heading extraction: L1889 '(2026-09-17)', L2215 '(2026-09-17/18)', L2414 '(2026-09-18/19)', L3089 '(2026-09-21)', L3194 '(2026-09-20/21)'.
~~~

#### D-30 — REFUTED by skeptic

**Where:** L27 and L828-830 vs L49 and L3341

**The handoff says:** TL;DR L27: 'blind for 32 spans per agent after every restart. Fixed and verified live.' L49: 'blind for 12 spans per agent after every restart.'

**Reality (finder):** Both are right. 16.3 fixed the baseline pool, so 20+12=32 became 12 (the current pool, cold by design, per 26.3). But neither bullet nor 16.3 says so, so a reader sees 'fixed' and '12 spans of blindness' without the link.

**Why the skeptic refuted it:** Not a discrepancy, and the finding's premise is overstated. Both TL;DR bullets are true and consistent: 32 = 20 baseline + 12 window samples; 16.3 restored the baseline pool, leaving the 12-span current window cold by design. 16.3 does say that ('the current window is deliberately left cold'), and its own arithmetic shows the 12; L49 already ends with 'Section 26.3', which explains it in full. The only residual point is wording: L27 says 'Fixed' where 'reduced from 32 to 12' is more exact. That is a wording nit, not a false statement, so I do not upgrade it to a surviving discrepancy.

**Finder's evidence:**

~~~text
sed -n '27p;49p;828,830p;3300,3303p' SESSION_HANDOFF.md.
~~~

#### D-31 — confirmed by skeptic

**Where:** L11-52 (TL;DR) coverage

**The handoff says:** The TL;DR is the summary of the document.

**Reality (finder):** No bullet points at Sections 19, 20, 21, 22 or 23 (public Azure deployment and the live URL, PRs #4-#35, the POST /v1/keys feature, the seven fabricated-claim rounds). L40 mentions '23.4' only as a name. The live URL appears only in 19.1 (L1223).

**Reality (skeptic's corrected statement):** The OLD TL;DR (L11-52) has no bullet for Sections 19-23: the Azure deployment and live URL (19.1, L1223), the landing-page claim audit PRs (20.1), the API-key rewrite (21.4) and the five-to-seven rounds of fabricated claims (21.10, 22.10, 23.x) are summarised nowhere above Section 19.

**Finder's evidence:**

~~~text
sed -n '11,52p' SESSION_HANDOFF.md | grep -c -E 'Section (19|20|21|22|23)' -> 0.
~~~

#### D-32 — confirmed by skeptic

**Where:** Whole file (secrets guidance); L1734 (21.4); L176, L194

**The handoff says:** n/a. The question was whether the handoff tells the next reader that API keys pasted into chat sessions must be rotated, and whether it mentions .env.

**Reality (finder):** It does not. The only 'rotat' hit is L280 ('auth is a single shared static key with no rotation'), which is about the product's auth. There is no secrets-handling section. `.env` is mentioned (L136, L176, L181, L194, L1173, L1264-1265, L2347, L2468-2472), but only as a gitignored file, a relative-path trap, a Docker COPY hazard, or an unloaded docstring promise, never with rotation or 'do not paste keys into chat' advice. L1734 prints a truncated, since-revoked console key ('ap_live_...'), which is harmless but the only key-shaped string in the file. Section 24 (NVIDIA/OpenRouter keys) and 23.5 (OmniRoute key minted from the dashboard) give no rotation note either.

**Reality (skeptic's corrected statement):** OLD contains no secrets-handling guidance: no instruction to rotate keys pasted into chat or to keep keys only in untracked .env files. NEW adds only a one-off open item (NEW L3553: rotate the NVIDIA key pasted into a chat; the OpenRouter key was revoked). A standing 'Secrets' paragraph is still missing.

**Finder's evidence:**

~~~text
grep -n -i 'rotat' SESSION_HANDOFF.md -> '280:- [ ] auth is a single shared static key with no rotation or tenancy'. grep -n -E '\.env' SESSION_HANDOFF.md -> L136, L176, L181, L194, L1173, L1264, L1265, L2347, L2468, L2470, L2472. grep -n 'ap_live' -> L1700, L1734 (truncated). git grep of strict key patterns on all refs -> no match (see confirmed).
~~~

#### D-33 — confirmed by skeptic

**Where:** L1003-1006 (17.5)

**The handoff says:** n/a. A hygiene finding, not a claim.

**Reality (finder):** The public repository's handoff prints a third party's personal email address (a gmail address) on L1005 as 'the email originally supplied'. It is on MAIN as well, and the repository has been public since 2026-09-12. It is not a secret, but it is gratuitous personal data in a public file.

**Reality (skeptic's corrected statement):** SESSION_HANDOFF.md 17.5 (L1005 in OLD) prints a third party's personal gmail address in a public repository (it is also on main and in NEW). Redact it (e.g. 'an address with a different first name from the account holder'); git history will still hold it.

**Finder's evidence:**

~~~text
grep -n -o -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' SESSION_HANDOFF.md -> '1005:<one gmail address>' (only match). git -C "$R" grep -c 'sahooamit' origin/main -- SESSION_HANDOFF.md -> 1 (no other file). gh repo view -> isPrivate false.
~~~

#### E10 — confirmed by skeptic

**Where:** L3297-3298 (section 26.3)

**The handoff says:** Block quote presented as the code's own words: "The current window is deliberately left empty: it holds the most recent outputs, and outputs from before a restart are no longer current."

**Reality (finder):** Not verbatim. drift.py load_window_baseline docstring (L480-483) reads: 'The current window (`_recent_embeddings`) is deliberately left empty: it holds the most recent `mean_window` outputs, and outputs from before a restart are no longer "current". Re-warming those few samples is correct; ...'. Meaning is the same; wording was condensed inside quotation marks.

**Reality (skeptic's corrected statement):** The quote at L3297-3298 is a paraphrase. backend/app/services/drift.py:479-482 (load_window_baseline docstring; identical at 7f78b3f, origin/main and 7262ff0) reads: 'The current window (`_recent_embeddings`) is deliberately left empty: it holds the most recent `mean_window` outputs, and outputs from before a restart are no longer "current".' Quote it exactly or drop the quotation marks.

**Finder's evidence:**

~~~text
Command: sed -n 476,487p backend/app/services/drift.py -> 'Only the baseline side is restored. The current window\n        (`_recent_embeddings`) is deliberately left empty: it holds the most\n        recent `mean_window` outputs, and outputs from before a restart are no\n        longer "current".'
~~~

#### E11 — confirmed by skeptic

**Where:** L3266 (section 26.2); also L51 (TL;DR)

**The handoff says:** '24.7's rule was "listed is not served"'.

**Reality (finder):** That phrase does not occur in 24.7 or anywhere else in the handoff except these two citations. 24.7 says the five models 'still existed in the catalogue at zero pricing' but three 'do not answer', and the standing fact is 23.6 'send one real request before building on a catalogue'. It is a paraphrase in quotation marks.

**Reality (skeptic's corrected statement):** The phrase 'listed is not served' does not appear in 24.7 or anywhere else in the handoff apart from L51 and L3266, which cite it. The rule 24.7 refers back to is 23.6's 'A model in a catalogue is not a model that answers. ... Send one real request before building on a catalogue' (L2400-2402). Replace the quotation with that wording, or drop the quotation marks.

**Finder's evidence:**

~~~text
Command: grep -n -i 'listed is not served' SESSION_HANDOFF.md -> only L51 and L3266. 24.7 text at L2631-2661.
~~~

#### E12 — confirmed by skeptic

**Where:** L3252 (section 26.2 first-turn block)

**The handoff says:** Answerer model printed as deepseek-ai/deepseek-v4-flash (also L3264).

**Reality (finder):** The id actually called, recorded on the span and in fe3e30b's app.py, is deepseek-ai/deepseek-v4-flash-0731. The truncated id is not a model id this repo ever sent.

**Reality (skeptic's corrected statement):** The first-turn answerer was 'deepseek-ai/deepseek-v4-flash-0731' (demo/chatbot/app.py:98 at fe3e30b; span for trace 8388a26c, 7.5s). Print the full id at L3252 and in the L3264 table row.

**Finder's evidence:**

~~~text
sqlite: 'answerer deepseek-ai/deepseek-v4-flash-0731 success 7501.12' (trace 8388a26c); git diff fe3e30b 7262ff0 shows '-    "answerer": "deepseek-ai/deepseek-v4-flash-0731",'.
~~~

#### E13 — confirmed by skeptic

**Where:** L3245-3246 (section 26.2) 'Errors return 200 with `error` and whichever agents completed, with the real trace_id.'

**The handoff says:** Every error returns 200 with the real trace_id.

**Reality (finder):** Only errors raised inside the try block (the three LLM calls). pulse.create_trace and local_retriever.search(req.message, top_k=3) run before the try (app.py L226, L262), so a retrieval/embedding failure becomes an HTTP 500 with a non-JSON body, which ragApi.sendChat then fails to parse (`await res.json()` at L84).

**Reality (skeptic's corrected statement):** In demo/chatbot/app.py (identical at 7262ff0 and b86fc40), only failures inside the three run() model calls (try at L266, except at L296) return HTTP 200 with `error`, the completed `agents` and the real trace_id. pulse.create_trace (L226) and local_retriever.search (L262) run before the try, so a failure there is an uncaught exception, an HTTP 500 that is not the JSON contract. ragApi.ts:84 does `await res.json()` before checking res.ok.

**Finder's evidence:**

~~~text
sed -n 262,266p demo/chatbot/app.py -> 'docs = local_retriever.search(req.message, top_k=3)' precedes 'try:' at L266.
~~~

#### E14 — confirmed by skeptic

**Where:** L3204 (section 26.1) 'six components'; demo/chatbot/app.py L18-19

**The handoff says:** 26.1: the commit added 'six components'. app.py docstring: 'Thirty messages here takes about ten minutes.'

**Reality (finder):** dashboard/src/components/rag/ holds five .tsx components (ChatConsole, ConnectionModal, CorpusModal, MonitoringPanel, RagChatbotApp) plus ragTheme.ts, which is a theme module. And the docstring's ten-minute estimate is contradicted by 26.3/26.4 (34 turns took 46 minutes; ~80s per turn).

**Reality (skeptic's corrected statement):** dashboard/src/components/rag/ holds five React components (ChatConsole, ConnectionModal, CorpusModal, MonitoringPanel, RagChatbotApp) and one theme module (ragTheme.ts), all added by e31fb58. The demo/chatbot/app.py docstring estimate (L18-19, 'Thirty messages ... about ten minutes') is contradicted by the measured run: 34 turns took 46 min 02 s (21:16:29 to 22:02:31), about 81 s per turn.

**Finder's evidence:**

~~~text
ls dashboard/src/components/rag/ -> ChatConsole.tsx ConnectionModal.tsx CorpusModal.tsx MonitoringPanel.tsx RagChatbotApp.tsx ragTheme.ts; sed -n 17,19p demo/chatbot/app.py; DB: first probe span 21:16:29, last span end 22:02:31.
~~~

#### E9 — confirmed by skeptic

**Where:** L3284-3290 (section 26.3 first table, columns 'drift rows' and 'with a window value')

**The handoff says:** Table placed directly under '34 turns' lists verifier 58, retriever 57, answerer 36 'drift rows'.

**Reality (finder):** These are all-time totals in the shared DB, not rows produced by the 34 turns. Verifier 58 includes 16 rows dated 2026-09-18 and 2 on 2026-09-19 plus rows from the earlier multi-model demo; retriever 57 includes 14 from 2026-09-18. A reader would expect ~34 per agent. Only 'with a window value' and 'max' are all run-derived.

**Reality (skeptic's corrected statement):** The 'drift rows' column in 26.3 (verifier 58, retriever 57, answerer 36) is the all-time total in data/agentpulse.db. The rows from the rag_chatbot run are verifier 36, retriever 43, answerer 36. The other 22 verifier rows (12 multi_model_demo and 10 default-service, 2026-09-18..20) and 14 retriever rows (multi_model_demo, 2026-09-18) predate or sit outside it. 'With a window value' (28/17/4) and 'max' are entirely from the chatbot run.

**Finder's evidence:**

~~~text
sqlite: verifier [('2026-09-18', 16, 0), ('2026-09-19', 2, 0), ('2026-09-20', 40, 28)]; retriever [('2026-09-18', 14, 0), ('2026-09-20', 43, 17)]; answerer [('2026-09-20', 36, 4)] (date, rows, rows with window value).
~~~


## B. Section 24 repository claims (finder A1) — no skeptic reached these

#### A1-01 — misleading — finder only

**Where:** Commit e31fb58 message (quoted at NEW L15 and 27.2); bears on L2985 (section 24.9.5, OLD)

**The handoff says:** e31fb58 message: 'Remove deprecated tool claim fields and withdraw unreliable inter-agent disagreement alerts based on recent ablation findings.'

**Reality:** The commit does the opposite for disagreement. At PRE, backend/app/services/alerting.py has no live AGENT_DISAGREEMENT rule, only a commented-out copy under a 'WITHDRAWN 2026-09-20' block. e31fb58 deletes that 36-line withdrawal block and adds the live rule, with severity HIGH, condition_field disagreement_score, threshold 0.6 and comparison gt, at L299-306. It also deletes tests/test_alerting.py, whose tests assert the rule's absence. The 'recent ablation findings' it cites are not present either: ablation_results.json goes back to the 2026-08-23 file and the ablation.py limitation text is removed. The wording therefore does not match what the commit did to this rule. NEW states the alert is live (L15, 27.3) but never quotes the message's 'withdraw' wording against the diff.

#### A1-02 — misleading — finder only

**Where:** Commit e31fb58 message; L2486-2490 (section 24.1) 'TOOL_CLAIM_MISMATCH (HIGH)' relies on this rule

**The handoff says:** e31fb58 title/message: 'remove tool claim tracking and alerting', 'Remove deprecated tool claim fields'

**Reality:** The tool-claim alert was not removed. TOOL_CLAIM_MISMATCH (severity HIGH, field tool_claim_score, threshold 0.3) is identical on MAIN and PRE, and the single alerting.py hunk touches only AGENT_DISAGREEMENT. What was removed is the `tool_claims_found` column and its plumbing: models.py -13, evaluation_runner.py -3, migration a7f2c3d9e104 -39, tests/test_tool_claim_coverage.py -78. That field was not old or 'deprecated': it arrived in 11dc2cc / PR #55 on 2026-09-21, the same day. tool_claim_score persistence and extract_result_count remain. Section 24.1's claim that this signal fires on the ingest path is true statically on MAIN, but not demonstrable there because MAIN's pipeline delivers no spans (A1-04).

#### A1-03 — misleading — finder only

**Where:** L2985 (section 24.9.5), L2547 (section 24.4), OLD

**The handoff says:** 'It should not be shipping a `HIGH` severity alert in that state. The options are to disable it, downgrade it ... or redesign the comparison' (L2985); and the 900s cooldown 'deduplicating' disagreement alerts as 'correct behaviour' (L2547).

**Reality:** Section 24 never says which option was taken, so the alert's state cannot be read from it. It is withdrawn on PRE, P56, P57 and P59 and live on MAIN and P58. On MAIN the HIGH alert at threshold 0.6 does ship, so the 24.9.5 sentence describes MAIN literally, not as a past recommendation. The 24.4 dedup paragraph (R3 and R4 'raised no alerts') describes behaviour that exists on MAIN and never occurs on PRE or P59, where the rule is gone. NEW handles this in 27.3, not inline in 24.9.5.

#### A1-04 — wrong-now — finder only

**Where:** L2444 (24.1 'Fixed by adopting the lifecycle'), L2459-2466 (24.2), L2470-2477 (24.3), L2657-2667 (24.7 working set), OLD

**The handoff says:** The pipeline script was fixed: async main/run_once/call, `await pulse.start()`, `await pulse.shutdown()` in a `finally`, `asyncio.to_thread`; stdout/stderr `errors="replace"`; `except Exception: return 1` reported properly; the .env actually loads; the working model set is nemotron-3.5-lightning / deepseek-v4-flash / nex-n2.5-pro / laguna-s-2.1 / ling-3.0-flash-vl.

**Reality:** On MAIN, demo/multi_model_pipeline.py is the pre-fix 256-line version (blob 2a8f2579) that 24.1-24.3 describe as broken. `pulse.shutdown()` is called without await (L247). There is no pulse.start() and no async. `except Exception: return 1` is at L241-242. Nothing calls reconfigure(errors=...), and there is no load_dotenv anywhere on MAIN, yet the docstring at L208 still promises 'or in a .env this script is run with'. AGENT_MODELS at L66-70 is the original qwen / deepseek / z-ai / nvidia-nemotron / liquid set, of which 24.7 says three do not answer. The 'working set' ids (nex-agi, laguna, ling-3.0) occur nowhere on MAIN. P58 has the identical blob; the fix exists only on PRE, P56, P57 and P59 (blob 071b56e1, 442 lines). PR #59 restores it byte-for-byte; NEW's banner and 27.3 already say this.

#### A1-05 — wrong-now — finder only

**Where:** L2694-2699 (24.8 'max_tokens is now 1200 and EmptyCompletion reports which of the two it saw'), L3037 (24.10 'EmptyCompletion in the demo exists for this'), L3070 (24.10 Pollinations smoke test), OLD

**The handoff says:** `max_tokens` is now 1200; `EmptyCompletion` reports whether the model returned truly empty or truncated (finish_reason length); `EmptyCompletion` in the demo exists; Pollinations is the keyless smoke test.

**Reality:** On MAIN the pipeline's `ask(... max_tokens: int = 320)` is the value 24.8 says causes the problem (L88). No EmptyCompletion class exists in any .py on MAIN; the only hit is a string literal in a UI fixture. There is no --provider flag, so there is no Pollinations path or nvidia provider. Even at PRE the claim is imprecise: the demo's EmptyCompletion message is fixed text ('returned HTTP 200 with empty content') and never reports finish_reason. The empty-vs-truncated distinction exists only in experiments/refusal_disagreement.py:233-244, which is deleted on MAIN. On P58 the distinction exists in demo/chatbot/app.py (MAX_TOKENS = 1200 at L118; EmptyCompletion at L136 reports reasoning chars and finish_reason at L211-215), but demo/multi_model_pipeline.py there is still 320.

#### A1-06 — wrong-now — finder only

**Where:** L2704 (24.9 'experiments/refusal_disagreement.py exists to answer'), L2750 ('Both are now recorded per trial'), L2831 ('The report now carries median ...'), L2835 ('experiments/paraphrase_stability.py turns 24.9.2 ...'), and every 24.9.x table, OLD

**The handoff says:** The refusal and paraphrase experiments, their per-trial stored data and their reports exist and carry the numbers quoted in 24.9-24.9.3.

**Reality:** On MAIN, P58 and P59 none of the six files exists: experiments/refusal_disagreement.py, experiments/results/refusal_disagreement.json, REFUSAL_DISAGREEMENT_REPORT.md, experiments/paraphrase_stability.py, experiments/results/paraphrase_stability.json and PARAPHRASE_STABILITY_REPORT.md. e31fb58 deleted them (688, 2054, 74, 346, 266 and 58 lines). They exist only on PRE, P56 and P57. A reader on main cannot reproduce or even inspect any 24.9 number, and P59 explicitly does not restore them. NEW's banner and 27.3 state this.

#### A1-07 — wrong-now — finder only

**Where:** L2594 (24.5 'Recorded in the limitations, in the template in ablation.py'), L2580-2581 ('Re-ran the whole study ... bit-identical'), L2597 (latency 188.1 to 132-135 ms), OLD

**The handoff says:** The ablation limitation (production ingest path not exercised; Config D at parity while the live signal scored zero; study calls load_models(use_onnx=False)) is recorded in the template in experiments/ablation.py. The re-run (2026-09-18) moved Config B latency from 188.1 to 132-135 ms.

**Reality:** On MAIN the limitation text is gone from experiments/ablation.py: e31fb58 deletes both the 'This study does not exercise the production ingest path' bullet and the use_onnx=False latency note. experiments/results/ablation_results.json on MAIN is the 2026-08-23 17:56:09 file again, where Config B latency is 188.07 ms, so the 132 ms re-run result is not on MAIN. The classification results are unaffected (identical on both sides; confirmed). P59 does not restore ablation.py or the JSON (blobs 85b1458 and 69d86a2 equal MAIN). NEW's banner and 27.3 cover this.

#### A1-08 — misleading — finder only

**Where:** L2949-2965 (24.9.5: spreads 0.001-0.005, accept 3/40, refuse 21/50, AUC 0.457 vs 0.980); L2985

**The handoff says:** 'That was tested on the existing data at no API cost': planner-excluded re-scoring gives AUC 0.457 and removes the signal; the 0.980 was an artifact.

**Reality:** No committed script reproduces this at any ref. The planner-exclusion analysis is not in experiments/ at PRE, and the only copy of the numbers outside the handoff is prose in the alerting.py comment (L319-L329, 'falls from 0.980 to 0.457'), which e31fb58 deletes. On MAIN the numbers exist only in SESSION_HANDOFF.md, and the stored JSON they were computed from is gone (A1-06). The text implies a repeatable test but none was committed. NEW 27.4/27.5 says it re-scored the stored outputs by hand to 0.4570, which confirms the number but not committed reproducibility.

#### A1-09 — stale — finder only

**Where:** L2715-2732 (24.9 table: 87 trials, cell A n=37 / 0.219 / 0.211, AUC 0.980), L2749-2750 and L3026 (0.980 vs 0.645), L2732 ('after 97 trials'), L3004-3006, OLD

**The handoff says:** 87 trials; cell A n=37, disagreement 0.219, contradiction 0.211; AUC 0.980 live vs 0.645 analyst pair; 97 trials with zero wrong acceptances.

**Reality:** The committed result file and report at PRE say otherwise: 90 scored trials (100 stored rows, 10 unscored), cell A n=40 with disagreement mean 0.2485 and contradiction mean 0.1958, AUC live 0.9792 and analyst pair 0.6495. The 24.9 table also contradicts 24.9.2 in the same section, which uses n=40 / 0.248 / 9 of 40. The numbers come from a superseded snapshot. NEW 27.4 corrects 87 vs 90 and 0.219 vs 0.2485 but does not mention that the analyst-pair figure 0.645 is 0.6495 in the stored file.

#### A1-10 — misleading — finder only

**Where:** L2855 (24.9.3, 'paraphrase-signal pairs')

**The handoff says:** '10 of 34 paraphrase-signal pairs landed on the opposite side of the 0.6 alert threshold from their anchor'

**Reality:** 34 is the number of paraphrases generated, including 2 discarded. 32 were scored on two signals each, which is 64 pairs, so the rate is 10 of 64. Disagreement alone is 7 of 32 (1+3+1+2+0) and contradiction is 3 of 32. The numerator 10 is correct. The report text says only '10 paraphrase-signal pairs', and the handoff added the wrong denominator; the same wrong ratio is in the PRE alerting.py comment. NEW corrected it inline after L2877 and in 27.4.

#### A1-11 — misleading — finder only

**Where:** L2481-2485 (24.4 banner), L3004-3010 and L3076 (24.10 'sharpest open question', 'Cell D is the whole remaining question'), OLD

**The handoff says:** 24.10 presents 'Disagreement tracks stance, and within a stance is blind to correctness ... the sharpest open question the project has' and 'Cell D is the whole remaining question' as standing facts. The 24.4 banner sends the reader to 24.9.

**Reality:** 24.9.5 (L2961) retracts exactly that: the 0.980 was an artifact, 'disagreement tracks stance' described a planner comparison, and the signal has no discriminative power (AUC 0.457). Nothing in 24.4, 24.9 or 24.10 points to 24.9.5; the only occurrence of the token '24.9.5' in the section is its own heading at L2932. A reader following the 24.4 banner stops at 24.9 and reads the retracted claim. NEW 27.4 flags this but the 24.10 text is still unannotated inline.

#### A1-12 — misleading — finder only

**Where:** L2505-2510 (24.4: 'R4 ... retrieval returned Transformers, SQLite and telemetry instead'; 'Only R2 had successful retrieval'), OLD

**The handoff says:** R4 was an on-corpus query (KB-429 covers token buckets) but retrieval returned unrelated documents, so the verifier was right to refuse; only R2 had successful retrieval.

**Reality:** Section 24 never records why retrieval missed. By code reading: demo/multi_model_pipeline.py never calls load_models or get_embedding at any ref, `grounding.get_embedding` returns None while `_embedding_model` is None, and demo/workflows/retrieval.py then indexes and queries with a character-hash vector (`emb[ord(char) % 384] += 1.0`). The pipeline's retriever therefore ran on hash vectors, so the failed retrievals were an artifact of the harness. When the later refusal experiment loads the real models, the same query 'token bucket rate limiter backoff' retrieves KB-429 first in all 10 stored rows. This is inferred from code and stored data; I did not run the pipeline. NEW 27.4 notes the hash fallback only for the chatbot (26.3).

#### A1-13 — misleading — finder only

**Where:** L3068 (24.10 'The five OpenRouter model ids from 23.4 are all still live'), vs L2631-2646 (24.7), OLD

**The handoff says:** 'The five OpenRouter model ids from 23.4 are all still live at zero prompt and completion pricing, re-checked against the catalogue on 2026-09-18.'

**Reality:** 'Live' here means present in the catalogue at zero pricing. 24.7 in the same section shows three of the five return a provider error or empty content. Read alone, the standing-facts bullet suggests the defaults work. On MAIN the defaults in the script are those five ids, so a reader acting on L3068 gets three non-answering models.

#### A1-14 — minor — finder only

**Where:** L2694 (24.8 'Four of the nine spend completion tokens on a hidden reasoning_content field'), OLD

**The handoff says:** Four of the nine callable NVIDIA models are reasoning models.

**Reality:** The code comments say four of the six: demo/multi_model_pipeline.py:~156-157 'Four of the six are reasoning models' and refusal_disagreement.py:~212 'Four of the six callable models'. The handoff changed the denominator to nine. Which is right cannot be settled from the repo, since only six ids are named there.

#### A1-15 — minor — finder only

**Where:** L2414 (section heading) and header chain, OLD

**The handoff says:** Section 24 is headed '(2026-09-18/19)'

**Reality:** 24.9.3 to 24.9.5 and the alert withdrawal are 2026-09-20 commits: 7b79333 'Measure the instability instead of illustrating it', e0e037a 'Record 24.9.5', 975717f 'Withdraw the AGENT_DISAGREEMENT alert'. All are dated 2026-09-20. The Section 24 heading is not updated.

#### A1-16 — minor — finder only

**Where:** L2444 (24.1: 'adopting the lifecycle demo/research_assistant.py already used: async main/run_once/call, await pulse.start() ...')

**The handoff says:** research_assistant.py already used async main / run_once / call.

**Reality:** demo/research_assistant.py has `async def main` (L318) and `async def run_pipeline` (L256) with `await pulse.start()` (L343) and `finally: await pulse.shutdown()` (L370-372). It has no run_once or call, and no asyncio.to_thread; those names belong to the rewritten pipeline. The lifecycle (start before, shutdown in finally) is what was adopted, so the claim is true in substance but misleading about the names.


**A1 could not check these (and why):**

- 24.4 R1-R4 table and the 10-trace refused/accepted groups (L2490-2540), including the 0.850/0.852/0.966 scores, and 24.4's note that the analyst scored grounding 0.009 — These live in a multi_model_demo database that is not available. The local data/agentpulse.db (read-only query) has services load_test/span_test/default/drift_*/simulation_studio, max span start 2026-09-17, no multi_model_demo traces, and alembic_version 8d86fee0d663. It has no AGENT_DISAGREEMENT alerts and only 112 evaluations with a disagreement_score.
- 24.5 'scored zero across 1,328 live evaluations' (L2593) — This is a historical count from the Section 18 era. The local DB now holds 1,427 evaluations, with tool_claim_score non-null in 47 and >0 in 5, plus 3 TOOL_CLAIM_MISMATCH alerts. That shows the signal fires after the fix, but the 1,328 figure cannot be reproduced.
- 24.5 'Latency ... 188.1ms to 132-135ms on Config B across three runs' (L2597) — Only two values are stored in git for this config: 188.07 ms (MAIN, 2026-08-23) and 132.09 ms (PRE, 2026-09-18). The 'three runs' and the 135 ms end are not in any committed file. NEW 27.4 lists Config B values on record of 300.48, 188.07, 132.09 and 188.07 ms.
- 24.6 OmniRoute: FREE_TIER_BUDGETS has 19 providers and about 1.36B tokens/month; noauth.ts has 13 entries; the intersection is empty; three marked 'avoid' in FREE_TIER_TOS — This concerns an external installed package (open-sse/config/freeTierCatalog.ts, src/shared/constants/providers/noauth.ts) that is not in the repo or any ref I was allowed to read.
- 24.7 / 24.8 external availability: five OpenRouter ids at zero pricing on 2026-09-18, the 22 :free models, six probed replacements, NVIDIA's 82-model catalogue with 54 text models (9 answer, 40 return 404 'Not found for account', 5 time out), and 24.10's Pollinations anonymous tier being one model (openai-fast) — These are time-bound network facts about third-party catalogues and require live API calls with keys. The repo names only six of the 'nine' callable ids, so the list of nine is not enumerable from git. The claim 'every model named in this repo for the nvidia provider was picked from that scan' cannot be checked for P58's demo/chatbot/app.py:103-105 (nvidia/nemotron-3.5-lightning-30b-a3b is not among the six). On MAIN the claim is vacuous because no nvidia provider code exists.
- 24.9.2 'pairwise semantic similarity ... 0.746-0.880'; 24.9.4 researcher vs retriever spread table; 24.9.5 spreads 0.001-0.005, 3/40 and 21/50 above 0.6, AUC 0.457 — Re-deriving needs the 1.2 GB NLI and embedding models loaded. Their cache dir (./models) sits inside the repo tree, and HF loading can write lock and refs files there, which Hard Rule 1 forbids. The result is also not stored per researcher/retriever pair in the JSON (only disagreement_live and disagreement_analyst_pair). The inputs exist only at PRE, P56 and P57. NEW 27.4/27.5 says the 0.457 was re-scored by hand; I did not repeat it.
- 24.1 stub-client result '1 trace, 5 spans, 5 jobs succeeded' and 'TOOL_CLAIM_MISMATCH (HIGH) on the retriever' — The stub client is not committed (`git grep -i 'stub client'` at PRE hits only a comment at demo/multi_model_pipeline.py:67). Running it would mean starting the backend and worker, which is forbidden. P59's description reports the offline check (0 POSTs on main, 1 POST and 5 spans on the branch) but I did not run it.


## C. Further discrepancies the skeptics stumbled on

- **OLD L46, L2482, L2715-2719, L2732 (24.9) vs L2780-2781 and L3005-3010 (24.9.1, 24.10)** — says: 24.9 reports '87 trials', cell A n=37 with mean 0.219, and 'cell D is empty after 97 trials'. L46 says 'empty after 100 trials'. L2780-2781 and L3009-3010 report cell A as mean 0.248 and '9 of 40'. — reality: The stored refusal_disagreement.json has 100 trial rows, 90 of them scorable. Cell A is n=40 with mean 0.2485 and median 0.0451, 9 above 0.6. The 87/37/0.219 figures are from a superseded snapshot, so the one 24.9 section uses three trial counts (87, 90 or 97, 100) and two cell-A means (0.219, 0.248). Cells B (47, 0.978) and C (3, 0.999) match the stored data. NEW L3531 ('87 against 90') already records this.

- **OLD L41 and L2851 (TL;DR and 24.9.3)** — says: '10 of 34 paraphrases crossed the alert threshold their anchor did not' and 'Five anchors, 34 paraphrases, 2 discarded'. — reality: 34 paraphrases were generated and 32 were scored, on 2 signals each, so there are 64 paraphrase-signal pairs. 10 of 64 pairs flipped (disagreement 7, contradiction 3), which is 9 distinct paraphrases of 32. '10 of 34' mixes a pair numerator with a generated-paraphrase denominator. NEW L2877 and L3530 already correct this.

- **OLD L3284-3300 (section 26.3), the verifier row 'n=11, mean 0.306 | n=17, mean 0.396, 17/17 above the 0.30 threshold'** — says: The verifier 'detected it, and detected it correctly': mean rose 0.306 -> 0.396 and 17/17 post-switch windows are above the 0.30 threshold. The table gives no before-switch count above threshold. — reality: Recomputing from the DB, 7 of the 11 pre-switch verifier window values are already above 0.30 (64%), while 17 of 17 are above after the switch. A threshold crossing therefore does not separate before from after. The 0.396 vs 0.305 mean rise is the only separating evidence. The pre-switch mean recomputes to 0.30546, which rounds to 0.305, not the 0.306 printed at L3292 and in the TL;DR (about rounding-level, unconfirmed whether a different split gives 0.306). n=11/17, the post-switch 0.3957 and the retriever (n=0 / n=17, 0.093, 0/17) and answerer (n=0 / n=4, 0.502) figures do match. Severity: misleading (omission), not wrong.

- **OLD L3204-3205 (section 26.1) 'six components, `ragApi.ts`, `riskTone.ts` and a test'** — says: Lists what the commit added to the frontend. — reality: The same commit (e31fb58) also added dashboard/src/lib/ragTypes.ts, which the handoff itself relies on as 'the contract' at L3242, so the inventory omits the contract file. Minor.

- **OLD L3242-3256 (section 26.2) vs demo/chatbot/app.py L86-105 at 7262ff0 and b86fc40** — says: 26.2 prints the first-turn models (mistralai/mistral-nemotron, meta/muse-glimmer-30b, deepseek) with no statement that the shipped and 34-turn models differ. The app.py comment (L88) says 'Three owners, so the agents are not one model talking to itself'. — reality: At 7262ff0/b86fc40, AGENT_MODELS is retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b, so two owners, not three. The app.py comment at L98 itself says 'Two of these share the nvidia family'. The 34-turn spans in the DB used these nvidia models, not the models printed in the first-turn block. Only the verifier model is common to both sets. The handoff says choices were 're-measured' but never names the final set. The app.py L88 comment is stale and self-contradictory.

- **L3163-3164 (section 25.3, OLD)** — says: 'The validator extracted zero claims across 8,353 prose spans from five real models, and nobody could say why.' — reality: Section 11 of the same document (L397) states an explicit cause for exactly these zero extractions: 'Cause -- a design-premise mismatch, not a tuning gap. TOOL_PATTERNS requires the agent to narrate tool use...'. 'Nobody could say why' contradicts it. This is separate from the B3-08 mechanism conflict and is a plain internal contradiction.

- **L2594-2597 and L3149-3150 (OLD) vs git history of e31fb58** — says: Beyond the four files B3-06 names, OLD's sections 24.9 and 25 rely on two reports, REFUSAL_DISAGREEMENT_REPORT.md and PARAPHRASE_STABILITY_REPORT.md, which are present at 7f78b3f. — reality: e31fb58 also deleted both reports. They are absent on origin/main, PR #58 (b86fc40) and PR #59 (11a1eb1). OLD does not cite them by filename (grep returns nothing), so this is not a wrong claim in OLD. It matters only for B3-06's suggested fix, which should list six deleted artifacts, not four.

- **L2704 and L2835 (section 24.9, 24.9.3) OLD; also every 24.9.x figure** — says: `experiments/refusal_disagreement.py` exists to answer the confound 24.4 could not; `experiments/paraphrase_stability.py` turns 24.9.2 from three anecdotes into a measurement (present tense, as if the scripts and their results are in the repo). — reality: On MAIN (e31fb58) all six artefacts behind Section 24.9 are gone: experiments/refusal_disagreement.py, experiments/paraphrase_stability.py, experiments/results/refusal_disagreement.json, experiments/results/paraphrase_stability.json, REFUSAL_DISAGREEMENT_REPORT.md and PARAPHRASE_STABILITY_REPORT.md. They exist at 7f78b3f and on PR #56 (f95d135) and PR #57 (74c7bb3); PR #58 (b86fc40) and PR #59 (11a1eb1) contain none of them. So no figure in 24.9.x can be recomputed from MAIN or from PR #58. The NEW handoff's L2440 banner covers this only generically ('removed or reverted much of what it points at').

- **L46 vs L2732 (section 0 vs 24.9) OLD** — says: L46: 'Cell D ... is still empty after 100 trials'; L2732: 'cell D is empty after 97 trials'. — reality: Two different run sizes (100 rows, 97 rows) are given for the same fact in two places, with 87 trials in the adjacent sentence of L46 and in the 24.9 table title (L2715). Three counts (87 scored, 97 rows, 100 rows) for what is described as one experiment, and the three added rows are never mentioned. Not covered by B1-03/B1-04's cited line lists.

- **L213 (section 6 item 6), OLD; relates to L297 (section 9)** — says: '~~Correct DRIFT_EXPERIMENT_REPORT.md section 3~~ - investigated, and the premise was wrong. Section 3 is correctly scoped and already carried a correction notice.' — reality: The repo does not support this. DRIFT_EXPERIMENT_REPORT.md section 3 (blob f5a1cce9, identical on 7f78b3f, 7262ff0 and origin/main) is still titled 'Why the embedding-centroid signal never fired' and still says the centroid condition 'was never satisfiable' and both detections came via stability_index<70. It carries no correction notice for that claim. DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md section 3 and 9.1 say the claim is wrong and that section 3 'has not been edited'. The per-step peak distances for the two detected scenarios recompute to 0.4453 and 0.6838 (> 0.30). The earlier decision to strike the item looks unsafe: the drift-doc fix Section 9 calls outstanding is still outstanding.

- **L299 (section 9), OLD** — says: 'Running that script silently reverts commit 19cde3a ... If you re-run it, restore the report afterwards (git checkout -- DRIFT_EXPERIMENT_REPORT.md).' — reality: Stale. Since 78697c5 (2026-08-27, an ancestor of main) drift_scenarios.py no longer writes DRIFT_EXPERIMENT_REPORT.md, and its docstring says it must not. The restore step is unnecessary. This is the narrower, confirmed half of D-11.

- **NEW section 27.1 'Where each thing lives' table (b86fc40); also bears on OLD D-01/D-06/D-07 fixes** — says: The 27.1 table lists main, 7f78b3f, #56, #57 and #58 as the places where the withdrawn alert, the experiments and Sections 24-26 live; the 'PR #56/#57 only' wording suggested for D-06 has the same gap. — reality: There is a sixth place the handoff never mentions: origin/claude/optimistic-knuth-0z7l6z, 5 commits ahead of main (merge-base e31fb58), with no PR. Its 27a5f25 'Restore the work overwritten by e31fb58' puts back refusal_disagreement.py, paraphrase_stability.py, their results, tests/test_alerting.py, tests/test_tool_claim_coverage.py, the alerting.py withdrawal and handoff Sections 24-26. It also carries 3186f75 (removes mock data), dd2d1b4 (real RAG chat service), aaa0533 and 79c2b52 (release packaging). It overlaps heavily with PR #58 and #59 and could conflict with them. The NEW handoff has no mention of 'optimistic-knuth' or '27a5f25'.

- **NEW L215 (section 5 correction note, b86fc40)** — says: 'pull requests (#1 through #58 today; #47-#55 merged, #56-#58 open)' — reality: Out of date as of 2026-10-11: PR #59 (fix/restore-e31fb58-regressions) is open, so there are 59 PRs, 55 merged and 4 open (#56-#59). Minor.

- **L3103-3118 (section 25.1), OLD; unchanged in NEW L3128-3140** — says: Drift paraphrase spreads accept/deepseek 0.031, refuse/deepseek 0.084, accept/google 0.059, refuse/google 0.084, accept/meta 0.074 (mean 0.066), 'every value sits far below the 0.30 drift threshold'. — reality: Not reproducible from anything committed. experiments/results/paraphrase_stability.json (7f78b3f, also on PR #56/#57) holds only per-variant contradiction and disagreement scores plus similarity_to_anchor; experiments/paraphrase_stability.py contains no drift/centroid computation; no file at 7f78b3f has these spreads. On origin/main and PR #58/#59 the script and JSON are absent altogether (deleted by e31fb58). Marked unverifiable, not wrong; the 14x/12x comparison in B3-12 rests on these unverified numbers.

- **NEW (b86fc40) L54 (TL;DR) and L3424/L3429 (section 26.3)** — says: NEW TL;DR still says '10 of 34 paraphrases crossed the alert threshold their anchor did not'; NEW 26.3 table and sentence still say the verifier's pre-switch mean is 0.306. — reality: NEW corrected both elsewhere (L2877 'Denominator corrected ... 10 of 64'; L3443 'mean 0.305') but left the headline occurrences unchanged, so NEW contradicts itself: 10 of 34 vs 10 of 64, and 0.306 vs 0.305. Also unchanged in NEW: '"3 documents" does' (L3182), 'Roughly fourteen times tighter' (L3137) and the non-verbatim docstring quote (L3409).

- **SESSION_HANDOFF.md 18.8 L1172-1174 (OLD) and D-32's suggested 'scan repeated, clean result' wording** — says: 18.8: 'no secret patterns in tracked files or history'; D-32's suggested fix proposes recording that the scan was repeated on 2026-10-10 with a clean result. — reality: A strict key-pattern scan is not clean on PRE or MAIN: tracked dashboard/src/lib/firebase.ts contains a Google API key-shaped string (prefix 'AIzaSyB-...') as a hardcoded fallback, added in 908cafc (2026-09-17, after the 18.8 scan of 2026-09-12). It is a Firebase web key, public by design, and OLD L1861 says 'Firebase's web config ships in the bundle. That is by design', so it is not a leak, but any 'clean scan' sentence must carve it out.

- **SESSION_HANDOFF.md Section 4, L176 (OLD) / NEW L189** — says: 'Dev servers via .claude/launch.json: agentpulse-backend (uvicorn, port 8000), agentpulse-dashboard (vite, port 5173).' — reality: Already wrong on PRE, not only on main: the local dev server is `vite --port=3000`; 5173 is the Docker/nginx port. PR #53 (d0b600b, 2026-09-21 00:05) set the launch.json entry to 3000 and the backend entry to python -m uvicorn; e31fb58 reverted both. NEW L189 and 27.x (NEW L3514) already correct this inline, so it only matters as an OLD-version finding.

- **L3312, L3316-3317 (section 26.3) and L49 (TL;DR), OLD** — says: Verifier pre-switch mean is 0.306 ('n=11, mean 0.306'; 'Its mean rose from 0.306 to 0.396'). — reality: The 11 pre-switch window values average 0.30546, which rounds to 0.305, not 0.306. The post-switch mean 0.396 is correct. Minor, and NEW L3542 notes it in passing but leaves the tables unchanged.

- **TL;DR L50 and L3202/L3206 (section 26.1 title and body), OLD** — says: 'A monitoring dashboard shipped four separate ways of fabricating telemetry' / 'It also carried four separate mechanisms'. — reality: The count is an undercount. At least five (the four listed plus the hardcoded RAG drift in E3) were in e31fb58, and three smaller fallbacks in E5 also remain. The TL;DR line repeats 'four' without any qualifier, so correcting only 26.1 would leave L50 stale.

- **demo/chatbot/app.py L31-34 and demo/workflows/retrieval.py L1-5 (code docstrings the 26.2/26.3 claims rest on)** — says: app.py: 'ask something it covers and the evidence should support the answer'. retrieval.py: 'perform genuine top-k semantic search'. — reality: In the chatbot process neither holds. Retrieval is the 64-character hash fallback (see E2), and 5 of the 17 on-corpus questions retrieved no document that holds the answer. The on-corpus/off-corpus design premise in 26.3 (L3278-3281) is therefore weaker than the text says.

- **NEW L239 ('What is actually next' superseded note, Section 6)** — says: The capability tiers it says to re-confirm 'rest on bases that 24.9.5 and 25 removed'. — reality: Overstated. The Basis cells in PRODUCTIZATION_LOG.md Item 4 (drift 1.5% false alarms / 92% detection; grounding F1 0.963; disagreement internal F1 0.960 on 22 pairs plus external 0 of 10; tool-claim external F1 0.000) are not the numbers 24.9.5 and 25 removed. 24.9.5 removed the AUC 0.98 on the 87-trial pipeline set, which the log never cited. 25.1 and 25.3 corroborate the drift and tool-claim rows. The log has not been edited since 2026-08-30 (7f6196a), so the Basis column is dated, not contradicted. The same conflation drives the C22 finding.

- **AGENTPULSE_DESIGN_SYSTEM.md:147 (repo doc, related to OLD Section 2 L130 and item 9 L216)** — says: The `wordmark-gradient` utility is 'already implemented' and is the only gradient allowed. — reality: No wordmark-gradient, wordmark, bg-clip-text or text-transparent style exists anywhere under dashboard/ on main, 7f78b3f or PR #58. The design-system doc describes a utility that no longer exists, which is the other half of why the gradient-text hook suppression in the handoff is moot.

- **L264 (Section 8), OLD** — says: 'Every "they don't ship X" claim comes from reading their marketing docs. No competitor product has ever been installed or run. This is the weakest link in the entire positioning.' — reality: False since Section 13 (2026-08-27): Phoenix and MLflow were both installed and probed, and two competitive claims were refuted. The handoff says so at L25, L211 and L546-548. Only Datadog was not installed (not installable). This is a statement of fact that is wrong, beyond the item-number problem in D-22. Severity: stale. Still present in NEW (L281).

- **L126 (Section 2, below the A/B/C component table at L118-124), OLD** — says: 'Do not "fix" category B by wiring it to a live endpoint unless there's a real reason -- it's already honest.' (category B = ExperimentsView and DatasetsView as static, honestly-labelled snapshots) — reality: Superseded: 16.1 wired DatasetsView to /v1/datasets and experiments to /v1/experiments, and MAIN's dashboard still calls those endpoints. The whole A/B/C table describes the pre-16.1 App.tsx, which was replaced in 18.2. A reader following L126 would undo deliberate work. Same stale cluster as D-12. Severity: stale. Still present in NEW.

- **L3058-3060 (section 24.10 standing facts), OLD** — says: '.venv/Scripts/uvicorn.exe is stale ... The shim has the pre-rename path baked in, which is the same staleness as the editable installs in Section 4.' — reality: The uvicorn.exe shim is stale (true), but the comparison asserts the editable installs are still stale. They were reinstalled in 22.3 and now point at the real checkout, so the 'same staleness' clause is wrong and reinforces the D-13 error. Severity: misleading. Still present in NEW (L3081).


## D. Audit of the text the first reconciliation added

Every statement the auditors did not find to hold. `wrong` includes statements that became wrong only because PR #60 was opened and #59 closed after the text was written.


### S1: banner, 27.1–27.3 and 27.8 — 62 statements: 34 holds, 22 overstated, 2 unsupported, 4 wrong

- **[overstated]** L13 (READ FIRST banner), NEW — says: Everything below this banner 'was never checked against origin/main'.
  - correction: Everything below this banner was written session by session, against whichever branch that session was on. Sections 0-23 were checked against `origin/main` as it stood in August-September; nothing was re-checked after `e31fb58` landed on 2026-09-21, and `origin/main` is no longer the branch most of it describes.
- **[overstated]** L11 (READ FIRST heading) and L3472 (Section 27 heading), NEW — says: Banner is 'checked 2026-10-10' and Section 27 is the state 'as of 2026-10-10'.
  - correction: ## READ FIRST ... (checked 2026-10-10; extended 2026-10-11 and 2026-10-13 with PR #59, the Oct-1 branch and the standalone frontend)
- **[overstated]** L15 (READ FIRST banner, bullet 1), NEW — says: `main` is `e31fb58`, a Google AI Studio sync push.
  - correction: `main` is `e31fb58`, most likely a Google AI Studio sync push (27.2: the explanation that fits the evidence, not a recorded fact) and in any case an unsigned direct push with no PR, not a reviewed change.
- **[overstated]** L15 (READ FIRST banner), NEW — says: e31fb58 'overwrote main with a stale snapshot'.
  - correction: It overwrote `main` with a tree that is a stale snapshot for 19 of its 48 files (byte-identical to `main` at the #46 merge, 469e494) and the app's own edits for the other 29 (the RAG UI, mock middleware, root package.json/metadata.json, and the deletion or blanking of lockfiles, `dashboard/.env.example` and `.env.example`).
- **[overstated]** L15 (READ FIRST banner), NEW — says: e31fb58 deleted 'the dashboard lockfiles the Dockerfiles COPY'.
  - correction: deleted `dashboard/package-lock.json`, which both Dockerfiles `COPY` (plus `dashboard/bun.lock`, `dashboard/.env.example` and `presentation/package-lock.json`)
- **[overstated]** L15 (READ FIRST banner) and L3567-3585 (27.8), NEW — says: 'A later session's notes (27.8) record that the owner confirmed it was not intended' / 'That branch's text says the owner confirmed e31fb58 was not intended'.
  - correction: The branch's own handoff (its 26.1) says 'Soum confirmed it was not intended' - a Claude session's report of what the owner said, not independently checked.
- **[overstated]** L17 (READ FIRST banner, bullet 3), NEW — says: Section 26 had six fabrication paths, not four.
  - correction: Section 26 had at least six fabrication paths, not four (the two worst are still live), plus smaller ones: the default-corpus fallback, hardcoded stage models, timer-driven stage progress, and a hard-coded centroid sparkline and 'ASI: 96.4' label in MonitoringPanel.tsx.
- **[overstated]** L17 (READ FIRST banner, bullet 3), NEW — says: The UI stamps groundingScore 0.942 / SUPPORTED on any turn whose evaluation never arrives - a stopped worker renders as a verified answer.
  - correction: stamps `groundingScore 0.942 / SUPPORTED / STAGE_2_NLI_VERIFIED` on any non-error turn whose evaluation has not arrived after ~31 s of polling (so a stopped or slow worker renders as a verified answer)
- **[wrong]** L18 (READ FIRST banner, bullet 4) and L3485 (27.1 row), NEW — says: The Oct-1 branch has 'no PR'.
  - correction: `claude/optimistic-knuth-0z7l6z` | `79c2b52` (2026-10-01) | open PR #60 (opened 2026-10-13); ahead 5, behind 0 of `main`
- **[overstated]** L18 (READ FIRST banner, bullet 4), NEW — says: 'This banner was written before it was found.'
  - correction: (Added after the rest of this banner; bullets 1-3 and 5 were written before this branch was found.)
- **[wrong]** L19 (READ FIRST banner, bullet 5), NEW — says: 'Only the five regressions that actively break something are being restored, in PR #59 (open, based on main, not merged).'
  - correction: The five regressions that actively break something were first restored in PR #59, which was closed unmerged on 2026-10-13 as a duplicate of PR #60 (the Oct-1 branch), which restores them and the rest of 27.6 item 1. Neither is merged.
- **[overstated]** L21 (READ FIRST banner), NEW — says: Inline corrections are marked [2026-10-10] and 'nothing was deleted, so the original claim and its correction can be read together'.
  - correction: Inline corrections are marked **[2026-10-10]** and left next to the text they correct; apart from two lines that were rewritten (the 'private' repo line and one table cell), the original wording is kept.
- **[wrong]** L3501 (27.2), NEW — says: 'Every deleted or reverted file above was created after that import.'
  - correction: Nineteen of the 48 files (the alerting, pipeline, migration, experiments, reports, ablation, launch.json, THRESHOLD_ANALYSIS, handoff and public-page files) are byte-identical to `main` as of the #46 merge (469e494), consistent with a snapshot taken before #47-#55 landed. The other 29 are not stale content: the lockfiles (created 2026-08-23 to 2026-09-06), `dashboard/.env.example`, the blanked `.env.example` and the four PDFs all predate the import and were changed by the app itself.
- **[unsupported]** L3501 (27.2), NEW — says: The Build app named `agentpulse`, linked to this repository, was imported on 2026-09-19 at about 02:02 IST, and its GitHub sync overwrites the repository with a snapshot and does not merge.
  - correction: 
- **[unsupported]** L3503 (27.2), NEW — says: Two AI Studio apps exist; the second, 'AgentPulse', is linked to Soum-Code/frontend and 'had 41 changed files waiting to be pushed on 2026-10-10'.
  - correction: 
- **[wrong]** L3507 (27.3 intro), NEW — says: The alert, pipeline, launch.json, Docker-lockfile and .env.example rows 'are fixed by PR #59 once it merges (27.6)'.
  - correction: The alert, pipeline, `launch.json`, Docker-lockfile and `.env.example` rows are fixed by PR #60 (the Oct-1 branch) once it merges; PR #59, which first restored them, was closed unmerged on 2026-10-13 as a duplicate. This table describes `main` until then.
- **[overstated]** L3511 (27.3 row 1), NEW — says: AGENT_DISAGREEMENT is live on main: severity HIGH, threshold 0.6 on disagreement_score, alerting.py:300; the WITHDRAWN 2026-09-20 block 'exists only at 7f78b3f'.
  - correction: **live**: severity HIGH, threshold 0.6 on `disagreement_score`, rule at `alerting.py:299-306` (`alert_type` on L300). The `WITHDRAWN 2026-09-20` block is absent from `main` and #58; it exists at `7f78b3f` and on the Oct-1 branch (and was on #59).
- **[overstated]** L3515-3516 (27.3 rows 5-6), NEW — says: The 24.9 experiments/results/reports are absent from main and #58; the ablation_results.json on main is the 2026-08-23 17:56 UTC file and 'the re-run exists only at 7f78b3f'.
  - correction: the re-run exists at `7f78b3f` and on the Oct-1 branch, not on `main` or #58 (the 24.9 experiments likewise)
- **[overstated]** L3522 (27.3 row 12), NEW — says: The repo is public since 2026-09-12; MIT-licensed; main has no branch protection (404 'Branch not protected').
  - correction: **public** (no later than 2026-09-12, when the LICENSE file was added); MIT-licensed; `main` has **no branch protection** (API: 404 "Branch not protected")
- **[overstated]** L3567 (27.8 intro), NEW — says: The five commits are 'by Claude sessions' (plural).
  - correction: five commits by a single Claude session (session_01DLDkesoSyaa2pUXzo4Rx6r) on 2026-10-01
- **[overstated]** L3567 (27.8 intro), NEW — says: The branch has 'newer commits than anything above and no pull request'.
  - correction: One branch has commits newer than the original content of #56-#58 (2026-09-20/21) that no PR carried: `origin/claude/optimistic-knuth-0z7l6z`, five commits by one Claude session on 2026-10-01, cut from `e31fb58` (ahead 5, behind 0); it became PR #60 on 2026-10-13.
- **[overstated]** L3573 (27.8 table row 27a5f25), NEW — says: 27a5f25 'restores everything outside dashboard/src from e31fb58~1'.
  - correction: restores the 27 files outside `dashboard/` source from `7f78b3f` (`e31fb58~1`); `dashboard/vite.config.ts` and the root `package.json`/`metadata.json` are left for 3186f75
- **[overstated]** L3581 (27.8 bullet 1), NEW — says: It restores much more: the 24.9 experiments and reports, tool_claims_found with its migration and tests, the ablation results, the lockfiles and .env.example.
  - correction: It restores much more than #59: the 24.9 experiments, results and reports, `tool_claims_found` with its migration and tests, the ablation re-run and `THRESHOLD_ANALYSIS.md`, `dashboard/bun.lock`, `dashboard/.env.example` and `presentation/package-lock.json` (#59 had only `package-lock.json` and `.env.example` of the lockfile/env files).
- **[overstated]** L3581 (27.8 bullet 1), NEW — says: Most of 27.6 item 1 is already done there, unmerged.
  - correction: All of 27.6 item 1 ((a)-(g)) is already done there, unmerged.
- **[overstated]** L3582 (27.8 bullet 2), NEW — says: 'Merging both puts two Section 26 headings in one file.'
  - correction: Merging both is not clean: `SESSION_HANDOFF.md` (7 conflict hunks, including the two Section 26s), `dashboard/src/lib/useTelemetry.ts` (2) and `dashboard/vite.config.ts` (2) conflict, because both sides rewrote those files differently.
- **[overstated]** L3583 (27.8 bullet 3), NEW — says: The two services are 'two implementations of the same service with different contracts'.
  - correction: They serve the same success payload on POST /chat and GET /corpus but differ in error signalling (HTTP 502/503/422 vs 200-with-`error`), `/health`, input validation, session memory and CORS defaults.
- **[overstated]** L3583 (27.8 bullet 3), NEW — says: 'the PR #58 description ("Make the RAG demo real") predates the knowledge that another one existed.'
  - correction: The PR #58 title ("Make the RAG demo real") and the original body predate the Oct-1 branch; the body was updated on 2026-10-13 with an overlap warning.
- **[overstated]** L3585 (27.8 bullet 5, recommendation), NEW — says: Recommendation: base on the Oct-1 branch (superset of #59, matches the new frontend's contract); open a PR; close #59 as duplicate; reduce #58 to what only it has (this reconciliation, and Sections 24-25.6 if the branch lacks them), renumbering Section 26.
  - correction: Take the Oct-1 branch (now PR #60) as the base: it is a superset of #59 (closed as duplicate on 2026-10-13) and matches the new frontend's contract. Keep from #58 the reconciliation (banner, Section 27, audit file), Sections 25.5/25.6 (the branch has 24-25.4 only), and the two `RagChatbotApp.tsx` fixes (no simulator on `!ragStatus.ok`, no `Math.random()` trace id), which the branch leaves in place; drop `demo/chatbot/app.py` if `chat_server.py` wins. Expect conflicts in `SESSION_HANDOFF.md`, `useTelemetry.ts` and `vite.config.ts`; renumber the clashing Section 26.

### S2: 27.4–27.7, TL;DR, Sections 4–6, header — 70 statements: 44 holds, 14 overstated, 8 unsupported, 4 wrong

- **[wrong]** NEW L3 (header, 2026-10-10 entry) — says: ...(the headline ones re-verified by hand, the rest unrefuted automated findings - see the appendix)
  - correction: ...the rest unrefuted automated findings - see HANDOFF_AUDIT_2026-10-10.md)
- **[overstated]** NEW L3 (header, 2026-10-10 entry) — says: main had been overwritten by an AI Studio sync push on 2026-09-21
  - correction: ...the largest being that main was overwritten on 2026-09-21 (IST) by e31fb58, most likely a Google AI Studio sync push (27.2: the explanation that fits the evidence, not a recorded fact), which re-enabled the withdrawn disagreement alert...
- **[overstated]** NEW L3 (header, 2026-10-10 entry) — says: Updated: 2026-10-10 (Section 27 - ... 26 statements ... 25.5/25.6 folded in ... five corrections to Section 26) - the entry describes what the update contains
  - correction: Updated: 2026-10-10 (Section 27 ...), with later additions on 2026-10-11 (PR #59 in 27.6) and 2026-10-13 (27.8 the Oct-1 branch, 27.9 the standalone frontend, six fabrication paths instead of five).
- **[overstated]** NEW L51 (section 0 TL;DR, branch protection) — says: The second writer that mattered was Google AI Studio's GitHub sync, which wrote e31fb58 straight to main
  - correction: The second writer 17.5 was about, collaborator SkSahoo98, still has write access (one commit on main, b7dc43c). e31fb58 - most likely a Google AI Studio sync push (27.2) - shows a second, untracked route to main.
- **[wrong]** NEW L53 (section 0 TL;DR, 'Repo pushed through 3cd1080') — says: and three PRs are open (#56, #57, #58)
  - correction: ...and four PRs are open (#56, #57, #58, #59).
- **[overstated]** NEW L58 (section 0 TL;DR, 'Section 14 0 of 10 mechanism') — says: the withdrawal exists at 7f78b3f only
  - correction: the withdrawal exists at 7f78b3f, on PR #59 and on claude/optimistic-knuth-0z7l6z, but not on main or #58.
- **[unsupported]** NEW L58 (section 0 TL;DR, 'Section 14 0 of 10 mechanism') — says: The mechanism claim was re-derived by re-scoring the stored outputs and holds - live configuration AUC 0.9792, retriever-only 0.4570
  - correction: 
- **[unsupported]** NEW L59 and L3538 (section 0 TL;DR / 27.4 bullet 9) — says: [the fifth anchor's disagreement spread 0.0006 is] narrower than its drift spread of 0.084
  - correction: 
- **[overstated]** NEW L64 (section 0 TL;DR, fabrication count) — says: Six paths, not four: the RAG UI still invents drift values and a 0.942 'SUPPORTED' grounding score, plus a corpus list and stage models
  - correction: At least six: the original four plus the invented drift constants and the 0.942 'SUPPORTED' grounding fallback (both still on #58 and main). Three smaller inventions - the fallback corpus list, hard-coded stage models and timer-driven stage progress - are not in that count.
- **[overstated]** NEW L64 (section 0 TL;DR, fabrication count) — says: The removal is on PR #58 only; on main the mock middleware and mockData.ts are still present
  - correction: The removal of the original four is on PR #58 and on claude/optimistic-knuth-0z7l6z, not on main (main still has the mock middleware and mockData.ts).
- **[overstated]** NEW L193 (section 4, test suite) — says: 260 tests collect on main and #58 today. Later sections of this file quote 226, 237, 269 and 260 for different dates
  - correction: Later sections quote 226 (2026-09-15), 237 (2026-09-16; the '269' in 20.5 is a typo for it) and 260 (2026-09-17); the count at 7f78b3f, before e31fb58 deleted two suites, was 269.
- **[wrong]** NEW L208 (section 4, .env) — says: e31fb58 replaced .env.example with a 22-line version in which all 23 keys have empty values
  - correction: a 23-line version (22 newline-terminated lines plus a final GEMINI_API_KEY= with no trailing newline) in which all 23 keys have empty values
- **[overstated]** NEW L216 (section 5, branch/PR annotation) — says: Since 2026-09-01 work has landed through topic branches and pull requests (#1 through #58 today; #47-#55 merged, #56-#58 open)
  - correction: PRs began with #1 (merged 2026-09-01) and #2-#3 (2026-09-06); ten commits then went straight to main between 2026-09-10 and 2026-09-14; from #4 (2026-09-14) every change except e31fb58 came through a PR. #1-#55 are merged; #56-#59 are open.
- **[unsupported]** NEW L216 (section 5, branch/PR annotation) — says: the user has been telling sessions to merge them
  - correction: 
- **[overstated]** NEW L240 (section 6, 'What is actually next' annotation) — says: The dashboard is no longer 'the remaining work' (it was unfrozen in 16, replaced in 18.2, de-faked in 21-23 and 26.1)
  - correction: ...(it was unfrozen in 16, replaced in 18.2, de-faked in 21-23, found faked again in 26.1 - only partly fixed on PR #58 and not at all on main).
- **[unsupported]** NEW L3536 (27.4 bullet 7) and L3545 (27.5) — says: AUC 0.457 holds: re-scoring the stored refusal-experiment outputs with the planner's questions excluded gives 0.4570 (accept n=40, refuse n=50); the retriever-only AUC of 0.457 [was] checked and found correct
  - correction: 
- **[overstated]** NEW L3539 (section 27.4, bullet 10) — says: Config B latencies on record: 300.48, 188.07, 132.09 and 188.07 ms
  - correction: Config B latencies by file: 300.48 ms (e83b783), 188.07 (73b533f), 132.09 (9cd0819, the re-run), 188.07 (main, because e31fb58 restored the 73b533f file).
- **[overstated]** NEW L3545 (section 27.5) — says: What the data do not support is 'the drift signal detected the shift', because the pre-switch value was already above the line
  - correction: What the data do not show is a threshold crossing caused by the switch: the verifier's drift value was already above 0.30 in 7 of 11 windows beforehand, and DRIFT_DETECTED for the verifier first fired at 21:34:02, seven minutes before the 21:41:27 switch. What they do show is the verifier's mean rising from 0.305 to 0.396 across it.
- **[unsupported]** NEW L3549 (section 27.6, intro) — says: an offline check with a stub model client and a local HTTP server found main's pipeline delivering 0 spans and the restored one 5; in a clean copy of dashboard/, npm ci and npm run build pass with the restored lockfile
  - correction: 
- **[overstated]** NEW L3549 and L3551 (section 27.6, item 1(d)) — says: (d) the dashboard lockfiles, so the Docker and Hugging Face builds work - listed among the items #59 restores
  - correction: (d) dashboard/package-lock.json, which both Dockerfiles COPY (#59 does not restore dashboard/bun.lock, dashboard/.env.example or presentation/package-lock.json)
- **[unsupported]** NEW L3549 (section 27.6, intro) — says: This pass was docs only. The user then chose to restore the small regressions first
  - correction: 
- **[overstated]** NEW L3551 (section 27.6, item 1) — says: A blanket git revert e31fb58 is possible but would conflict with #58's handoff edits and would also undo whatever part of that commit was intended, which nobody has said
  - correction: ...would conflict not only with #58's handoff edits but with useTelemetry.ts, vite.config.ts and RagChatbotApp.tsx, and would delete the whole RAG Live Monitor UI that #58 and the standalone frontend build on. The commit body states an intent (withdraw the disagreement alert, update launch configs) that its diff did the opposite of.
- **[wrong]** NEW L3554 (section 27.6, item 4) — says: Fix the RAG UI's remaining invention paths (fabricated drift past 32 spans, the corpus fallback, hardcoded stage models, timer-driven stage progress)
  - correction: Fix the RAG UI's remaining invention paths: the 0.942 / 'SUPPORTED' grounding fallback on any turn whose evaluation never arrives (the worst of them), the fabricated drift constants past 32 spans, the corpus fallback, hard-coded stage models and timer-driven stage progress; ...
- **[unsupported]** NEW L3555 (section 27.6, item 5) — says: Turn on branch protection now that the repository is public, and unlink or stop syncing the agentpulse AI Studio app; decide what to do with the 41 files waiting in the AgentPulse app
  - correction: 
- **[unsupported]** NEW L3556 (section 27.6, item 6) — says: Rotate the NVIDIA key that was pasted into a chat session and is in the local, gitignored .env. The OpenRouter key pasted earlier was revoked; a call with it returns 401
  - correction: 
- **[overstated]** NEW L3557 (section 27.6, item 7) — says: The root package.json declares "workspaces": ["dashboard"], so npm ci and npm ls run inside dashboard/ fail (ENOWORKSPACES / ENOLOCK: npm looks for a lockfile at the root). Docker builds are unaffected and npm --prefix dashboard run still resolves its scripts
  - correction: ...so npm ci run inside dashboard/ fails with EUSAGE (npm resolves the workspace root and finds no root lockfile) and npm ls there prints the root project as '(empty)' instead of the dashboard's dependencies (npm 11.11.0; the ENOWORKSPACES / ENOLOCK codes were not reproduced).

### S3: Sections 24–26 corrections, 27.9, PR descriptions — 75 statements: 50 holds, 14 overstated, 4 unsupported, 7 wrong

- **[overstated]** L2441 (section 24 intro blockquote) NEW — says: So 24.9-24.9.5 can be re-derived only from 7f78b3f.
  - correction: so 24.9-24.9.5 can be re-derived only from `7f78b3f` (or an earlier commit that has them) and from the unmerged branch `claude/optimistic-knuth-0z7l6z` (PR #60), which restores all of these files byte-for-byte.
- **[overstated]** L3218 (section 25.5 status blockquote) NEW — says: Its present tense describes 7f78b3f and those branches, not main.
  - correction: Its present tense describes `7f78b3f` for 25.5 (tool_claims_found) and PR #56's branch for 25.6 (grounding_input_truncated, which `7f78b3f` does not have), not `main`.
- **[overstated]** L3338-3340 (section 26.1 correction, heading + grounding bullet) NEW — says: 'All four removed' is wrong: there were six, and two of them are still there.
  - correction: 'All four removed' is wrong: besides the four, the RAG Live Monitor invents a grounding score (0.942 / SUPPORTED) and drift (0.082 / 0.045 / 0.024 plus a hard-coded 8-bar trajectory and 'Stable (ASI: 96.4)' in MonitoringPanel.tsx L400, L435, L439), and three smaller fabrications remain. All of these are still present on #58 and on `main`.
- **[overstated]** L3340 (section 26.1 correction, grounding bullet) NEW — says: RagChatbotApp.tsx lines ~196-209 set groundingScore 0.942, 'SUPPORTED', 'STAGE_2_NLI_VERIFIED' on every turn still pending when the polling attempts run out.
  - correction: `RagChatbotApp.tsx` L197-212 (0.942 at L204, 'SUPPORTED' at L206, 'STAGE_2_NLI_VERIFIED' at L207; identical on #58 and `main`)
- **[wrong]** L3340 (section 26.1 correction, grounding bullet) NEW — says: Present on #58 and on main; not fixed (listed in 27.6).
  - correction: Present on #58 and on `main`; **not fixed**. (27.6 item 4 does not list it; add 'the 0.942 / SUPPORTED stamp on a pending turn' to that item.)
- **[overstated]** L3342 (section 26.1 correction, 'Three smaller ones') NEW — says: ragApi.ts falls back to DEFAULT_CORPUS_DOCUMENTS - six invented titles, of which one matches the real corpus; RagChatbotApp seeds the Corpus modal with it.
  - correction: `ragApi.ts` falls back to `DEFAULT_CORPUS_DOCUMENTS` - six titles, five of them invented and one matching the real corpus - when `/corpus` is unreachable, and `RagChatbotApp` seeds the Corpus modal with it.
- **[overstated]** L3445 (section 26.3 correction, point 1) NEW — says: A 0.30 alert would already have been firing before the topic changed.
  - correction: a 0.30 alert was already firing before the topic changed: DRIFT_DETECTED fired for the verifier at 21:34:02 (distance 0.378), seven minutes before the first off-corpus question at 21:41:30.
- **[overstated]** L3445 (section 26.3 correction, point 1) NEW — says: 'Rose from 0.306 to 0.396' is true.
  - correction: 'Rose from 0.305 to 0.396' (about 0.09) is true.
- **[wrong]** PR #58 body, top blockquote 'Overlap found after this update was written (2026-10-13)' — says: An unmerged branch claude/optimistic-knuth-0z7l6z (2026-10-01, five commits ahead of main, no PR) exists.
  - correction: An unmerged branch, `claude/optimistic-knuth-0z7l6z` (2026-10-01, five commits ahead of `main`), is now PR #60 (opened 2026-10-13).
- **[overstated]** PR #58 body, top blockquote — says: That branch already restores what e31fb58 overwrote and removes the same mock data.
  - correction: That branch restores what e31fb58 overwrote and removes mockData.ts, the mock middleware and the useTelemetry fallback, but it still contains two of the four paths #58 removes: the simulator run when `!ragStatus.ok` and the `Math.random()` trace_id fallback in `RagChatbotApp.tsx`.
- **[wrong]** PR #58 body, top blockquote — says: Do not merge this PR before that is settled.
  - correction: The owner has chosen the Oct-1 branch as the base (PR #60); #59 was closed as a duplicate. Do not merge this PR as is; its handoff reconciliation is to be re-based on #60.
- **[overstated]** PR #58 body, 'Update 2026-10-10' paragraph 1 — says: Added three docs-only commits (d376b2f, 46522b0, b86fc40); SESSION_HANDOFF.md gets a READ FIRST banner, Section 27 and inline [2026-10-10] corrections (nothing deleted); HANDOFF_AUDIT_2026-10-10.md lists all 106 findings with evidence.
  - correction: Added four docs-only commits (d376b2f, 46522b0, b86fc40, 7a4786c) ... inline `[2026-10-10]` corrections next to the claims they correct (original wording kept, apart from the 'private' line, which is quoted in its correction).
- **[overstated]** PR #58 body, 'Update 2026-10-10' paragraph 1 — says: This PR restores nothing.
  - correction: This PR restores none of the code or data files `e31fb58` reverted; it does restore the handoff prose of Sections 24-25 that `e31fb58` cut.
- **[wrong]** PR #58 body, 'Corrections' bullet 1 — says: ragApi.ts also falls back to six invented corpus titles.
  - correction: `ragApi.ts` also falls back to a six-title corpus list of which five titles are invented.
- **[wrong]** PR #58 body, 'Corrections' bullet 1 — says: Not fixed here; listed in 27.6.
  - correction: Not fixed here; 27.6 item 4 lists drift, the corpus fallback, stage models and timers, and should also list the 0.942 / SUPPORTED stamp.
- **[wrong]** PR #58 body, section 'The service' (original text, unannotated) — says: Three agents on three model families.
  - correction: Three agents on three models, two of them from the nvidia family.
- **[unsupported]** PR #58 body, 'Corrections' last bullet and closing line — says: 260 tests collect on this tree; '260/260 pass' is this PR's own figure and was not re-run; 'tsc --noEmit clean'.
  - correction: n/a (could not establish; static count 258 `def test_` + 1 parametrize is consistent with 260)
- **[unsupported]** PR #59 body, table 'verified how' cells and the totals line — says: pytest tests/test_alerting.py: 4 passed; stub-client run: main 0 POSTs / 0 spans vs 1 POST / 5 spans; npm ci and npm run build succeed (built in 24s); full suite 264 passed in 3m37s; the exiting-1 uvicorn shim.
  - correction: n/a
- **[overstated]** PR #59 body, 'Not restored here' — says: The RAG UI that e31fb58 added, including its fabricated telemetry, is handled by #58, not here.
  - correction: The RAG UI that `e31fb58` added is partly handled by #58 (mock middleware, `useTelemetry` fallback, simulator-on-unreachable, invented trace_id); its remaining invented grounding and drift values are not fixed by any open PR.
- **[unsupported]** L3589 (section 27.9 intro) NEW — says: Read through the GitHub API only; it was not cloned, built or run, and its tests were not run.
  - correction: n/a
- **[overstated]** L3591 (section 27.9 bullet 1) NEW — says: ...(all of which exist in this repo's backend).
  - correction: (all of which exist in this repo's backend, although the client reads `/v1/drift` as `{drift: [...]}` where the backend returns `{agents: [...]}` with different field names, and sends `{status: 'acknowledged'}` to `PATCH /v1/alerts/{id}`, which expects `{acknowledged: true}`).
- **[overstated]** L3592 (section 27.9 bullet 2) NEW — says: src/App.tsx imports mockTelemetry.ts and generates simulated traffic and incidents with Math.random() (lines ~487-562).
  - correction: `src/App.tsx` seeds agents, traces and incidents from `mockTelemetry.ts` (L235-237) and, with `isSimulatingLive` defaulting to true (L247), prepends a `Math.random()`-built trace every 12 s (L486-527); the Telemetry Lab handler also builds incidents with a `Math.random()` id (L562).
- **[wrong]** L3593 (section 27.9 bullet 3) NEW — says: firebase-applet-config.json is a Firebase web config including an API key, an OAuth client id and a reCAPTCHA site key, committed to a public repository.
  - correction: `firebase-applet-config.json` - a Firebase web config including an API key and an OAuth client id (its `recaptchaSiteKey` and `measurementId` fields are empty) - is committed to a public repository.
- **[unsupported]** L3593 (section 27.9 bullet 3) NEW — says: Web API keys are designed to ship to browsers and are protected by key restrictions and rules rather than secrecy, so this is a hygiene finding, not a leaked secret; the spans rule is the real one.
  - correction: n/a
- **[overstated]** L3594 (section 27.9 bullet 4) NEW — says: No path to the backend in production: vite.config.ts has no proxy and the URLs are absolute localhost defaults; CORS has to allow the frontend's origin on both services.
  - correction: **No built-in path to the backend in production.** `vite.config.ts` and `server.ts` have no proxy and the URLs default to `localhost`; they can be overridden with `VITE_CHAT_SERVER_URL`, `VITE_AGENTPULSE_API_URL` or `window.__AGENTPULSE_*_URL__`, none of which is documented in `.env.example`; CORS has to allow the frontend's origin on both services.

## E. Sweep of repository state

- **[wrong]** L18 and L3485 (section 27.1 table row), NEW — says: claude/optimistic-knuth-0z7l6z has 'no PR'; 'no PR and no earlier section mention' it.
  - correction: claude/optimistic-knuth-0z7l6z is PR #60 (opened 2026-10-13 17:02Z, mergeable, tip 79c2b52, 5 commits).
- **[wrong]** L19 (READ FIRST banner), L3507 (27.3 preamble), L3549 and L3551 (27.6 intro and item 1), L3581 (27.8), NEW — says: PR #59 is open and will fix the alert, pipeline, launch.json, lockfile and .env.example rows 'once it merges'.
  - correction: PR #59 was closed unmerged as a duplicate on 2026-10-13. Those rows are fixed by PR #60 (the Oct-1 branch) if it merges, not by #59.
- **[holds]** L3581 (section 27.8), NEW — says: git diff 7f78b3f origin/claude/optimistic-knuth-0z7l6z is empty for all six files #59 restores.
  - correction: 
- **[holds]** L3485 (27.1 row for #58) and 27.1 rows for #56/#57, NEW — says: #58 is open and mergeable; #56 and #57 are open and conflicting.
  - correction: 
- **[holds]** L3515-L3516 region (27.3 row on the repo being private / no branch protection), NEW — says: main has no branch protection (API: 404 'Branch not protected').
  - correction: 
- **[holds]** L1630 (section 11/12 limits list), NEW — says: .github/workflows does not exist; there is no CI.
  - correction: 
- **[wrong]** L1033-L1036 (section 17.5), NEW — says: Branch protection could not be applied; the options are to make the repo public, upgrade to Pro, or drop the collaborator to triage, 'none of which have been taken'.
  - correction: The repo is public, so branch protection is available but not applied; SkSahoo98 still has push (write) access to main.

#### PR #60 now exists and #59 is closed; the sweep's baseline moved while it ran (changes 27.6 items 1, 2, 7 and the whole 27.8 recommendation)

Commands: gh pr list --repo Soum-Code/agentpulse --state all --limit 100 --json number,headRefName,baseRefName,state,mergedAt,author --jq ... and gh api repos/Soum-Code/agentpulse/events. Output: '2026-10-13T17:02:28Z PullRequestEvent Soum-Code opened 60'; '17:02:40Z IssueCommentEvent ... created 59'; totals {total:60, merged:55, open:[60,58,57,56], closed_unmerged:[59], base_not_main:[], cross_repo:[]}. PR #60 title: 'Restore what e31fb58 overwrote; add the real chat service and release packaging'; head claude/optimistic-knuth-0z7l6z @ 79c2b524 (gh api repos/.../git/ref/heads/claude/optimistic-knuth-0z7l6z -> 79c2b52, same as the local origin ref); body says it was 'opened on 2026-10-13 by a later session, at the owner's choice of this branch as the base'. NEW mention: none ('#60' = 0 hits; L18, L19, L3485, L3507, L3549, L3551, L3581 all describe the pre-#60 state, as the NEW tip 7a4786c was pushed 11:26Z). Effect on 27.6: item 1 is being executed through #60 rather than #59; item 2 (merge order) must now be written as #60 vs #58; 27.8's 'open a PR for it; close #59 as duplicate' has happened. The handoff should say so, or a reader will look for an unmerged branch that now has a PR. A third session is also already building on that branch (see the local-worktree item).

#### PR #58 vs PR #60 overlap (files both change)

Commands: git diff --name-only e31fb58 7a4786c (7 files) and git diff --name-only e31fb58 79c2b52 (45 files), then comm -12. Files touched by both: SESSION_HANDOFF.md, dashboard/src/lib/mockData.ts, dashboard/src/lib/useTelemetry.ts, dashboard/vite.config.ts. Blob comparison (git rev-parse 7a4786c:f vs 79c2b52:f): mockData.ts SAME (both delete it), SESSION_HANDOFF.md DIFFER, useTelemetry.ts DIFFER, vite.config.ts DIFFER. Only #58 has demo/chatbot/app.py and the RagChatbotApp.tsx edits; only #60 has demo/chat_server.py. NEW mentions the two competing chat services and the second Section 26 (27.8) but not the concrete file-level conflict list. Effect: confirms 27.6 item 2 needs a rebase decision; whichever of the two merges second will conflict in three code files plus the handoff. gh pr view reports both currently MERGEABLE against main on their own.

#### The first GitHub Actions run in the repository's history, on PR #60: success (new evidence for 27.3 and 27.8)

Before 17:02Z: gh workflow list --repo Soum-Code/agentpulse --all -> empty; gh run list -> empty; gh api .../actions/runs --jq .total_count -> 0. Now: gh workflow list -> 'release active 383455892'; gh run view 38435429914 --json status,conclusion,event,headSha -> status=completed, conclusion=success, event=pull_request, headSha=79c2b524. Jobs: sdk-test success ('46 passed in 0.33s' for tests/test_sdk.py tests/test_llm_instrumentation.py), images (dashboard, ./dashboard) success (17:02:34 to 17:04:06), images (backend, ./backend) success (17:02:35 to 17:06:41), sdk-publish skipped (tag-only). docker/login was skipped and push is tag-only, so nothing was published. NEW mention: L3518 says the dashboard Dockerfile COPYs a lockfile absent on main and #58 so 'a build fails'; L3549 says 'the Docker image itself was not built'; 27.8 says the branch's tests were not run; RELEASING.md on the branch says the workflow 'has never run'. Effect: it supports taking the Oct-1 branch as the base (both images now build on that tree in CI, which the handoff had no evidence for). Limits: the workflow runs only two test files (46 tests), not the 260/290-test backend suite; it triggers on tags v* and on PRs touching backend/**, dashboard/**, sdk/**, not on pushes to main, so main still gets no test CI even after #60 merges (L1630 'no CI' stays true for tests).

#### RELEASING.md on the Oct-1 branch collides with the existing v0.1.0 tag, and its PyPI/GHCR prerequisites do not exist

Commands: git show origin/claude/optimistic-knuth-0z7l6z:RELEASING.md and :.github/workflows/release.yml and :sdk/pyproject.toml. RELEASING.md step 2: 'git tag v0.1.0 && git push origin v0.1.0'; sdk/pyproject.toml: name = "agentpulse-observe", version = "0.1.0"; release.yml: on push tags ["v*"] -> pushes ghcr.io/soum-code/agentpulse-{backend,dashboard} and publishes agentpulse-observe to PyPI (id-token trusted publishing, environment 'pypi'). Existing tag: git ls-remote --tags origin v0.1.0 -> c2077b0a... refs/tags/v0.1.0 (annotated, peels to d780b86, the merge of PR #7, 2026-09-14), and a published GitHub release of that name exists (gh release list -> 'v0.1.0 - first tagged release Latest'). So following step 2 literally fails ('tag already exists'), and force-moving the tag would rewrite a published release. Prerequisites: gh api repos/Soum-Code/agentpulse/environments -> total_count 0 (no 'pypi' environment); https://pypi.org/pypi/agentpulse-observe/json -> HTTP 404 (name free); /pypi/agentpulse/json -> 200 (0.1.0, github.com/chkoutam/agentpulse) and /pypi/agentpulse-sdk/json -> 200 (agentpulse.dev), i.e. the branch's claim about those two names is correct. GHCR package state could not be read (gh token lacks read:packages). NEW mention: 27.8 lists 'GHCR images, PyPI SDK, .github/workflows/release.yml, RELEASING.md' as a one-line table row only; 'agentpulse-observe' = 0 hits; the tag collision and the missing environment are not mentioned. Effect on 27.6: if the Oct-1 branch is adopted, add a decision: the first release tag must be a new version (the branch's own text suggests a v0.0.x trial) and the PyPI project, trusted publisher and 'pypi' environment must be created by the owner first; the first tag push is the first real publish.

#### Repo homepage field and the v0.1.0 release notes still link to the dead hostname

Commands: gh api repos/Soum-Code/agentpulse --jq .homepage -> https://agentpulse-demo.centralindia.cloudapp.azure.com ; gh release view v0.1.0 --json body (line 3: '**Live demo:** https://agentpulse-demo.centralindia.cloudapp.azure.com'). nslookup agentpulse-demo.centralindia.cloudapp.azure.com -> 'Non-existent domain'; curl -o /dev/null -w %{http_code} https://agentpulse-demo.centralindia.cloudapp.azure.com/ -> 000; nslookup agentpulse.centralindia.cloudapp.azure.com -> 20.235.82.198 and curl / -> HTTP 200. In-repo references were fixed (git grep -n 'agentpulse-demo' origin/main -- . ':!SESSION_HANDOFF.md' -> no hits). NEW mention: L1243-L1249 says the rename touched 'eleven reference updates across nine files' and 'the old hostname is gone, so any link shared before the rename is dead'; L1425 says homepage and a v0.1.0 release were created; neither says the GitHub-side homepage field and release body were never updated. The release body is also stale in other ways: '207 of 209 tests pass' (NEW: 260 collect), lists Tool-claim as one of four running signals, and its Known issue 'health/live and health/ready require an API key' is contradicted by the live host (curl https://agentpulse.centralindia.cloudapp.azure.com/v1/health/ready -> 200 {"ready":true}; /v1/health/live -> 200). Effect: a visitor clicking the repo's website link or the release's live demo link lands on NXDOMAIN. Not in 27.6; belongs next to item 5 as a two-click metadata fix (homepage field, release text). Severity: stale (public-facing).

#### Live deployment runs a 2026-09-17 build, not main and not anything in the Sections 24-26 work

Commands: curl -s https://agentpulse.centralindia.cloudapp.azure.com/v1/health/live -> {"alive":true,"pid":1,"process_started_at":"2026-09-17T11:39:22.236354","uptime_seconds":2265568.2} (about 26.2 days); PR #44 merged 2026-09-17T11:38:46Z (gh pr list), i.e. the process started 36 seconds after #44 and has not restarted since, before #45-#55 (2026-09-18 to 2026-09-20) and before e31fb58 (2026-09-21). Bundle probe: curl the served /assets/index-LdjtFKqn.js (2,443,888 bytes) and grep -c: 'RAG Live Monitor' 0, 'Live Monitor' 0, 'agentpulse-mock-api' 0, '0.942' 0, 'Telemetry Lab' 3, 'groundingScore' 3. So e31fb58's RAG UI is not on the public host. Inference, not proof: I could not read a server git SHA, and /openapi.json is 404 and /v1/health/evaluator needs a key. NEW mention: no statement anywhere about which build the public instance runs after Section 19/23 ('redeploy' = 0 hits; 'process_started_at' = 0). README and repo homepage present it as 'a running instance with real evaluated telemetry'. Effect on 27.6: whichever PR wins, nothing reaches the live host until it is redeployed, and conversely the live host still serves the pre-withdrawal alert logic (#52 landed 2026-09-20), so the AGENT_DISAGREEMENT decision (item 3) has a live-instance dimension the handoff does not mention.

#### Unmerged remote branch claude/session-handoff-20ykc9 (2026-08-28, 3 commits, no PR) - absent from NEW

Commands: git rev-list --count origin/main..origin/claude/session-handoff-20ykc9 -> 3 ahead, origin/main..branch behind 148; git log origin/main..branch -> e1b7a4e 'Install the Apple design/toolbox skills', 78748b8 'Frontend clean-slate reset: remove the presentation layer, keep the data layer', f184c12 'Update session handoff through the frontend reset' (author Claude). git cherry origin/main origin/claude/session-handoff-20ykc9 -> four '+' lines (no equivalent patch on main). gh pr list --state all --head claude/session-handoff-20ykc9 -> []. Diffstat vs merge-base 4cc2072: 9 files, +303/-3,858 (deletes dashboard SideRail.tsx and ui.tsx, guts App.tsx 2,972 lines); adds scripts/setup_skills.sh (git ls-tree origin/main -- scripts/setup_skills.sh -> absent) and AGENTPULSE_DESIGN_SYSTEM.md (a different file already exists on main). Its SESSION_HANDOFF.md has a 'Section 16 - Frontend clean-slate reset, and the skills installed before it' with an Antigravity post-mortem; NEW's Section 16 is 'Dashboard unfrozen, and the honesty audit' (L799). Of 126 added handoff lines (length>40), 126 are absent verbatim from NEW and from main's handoff. grep NEW for 'session-handoff-20ykc9' -> 0 hits. NEW's only 'Antigravity' mention is L114. Effect on 27.6: none for the decisions, but it is a third undocumented line of work: merging it would delete the current dashboard (PR #2 replaced that code), and its Section 16 text is the only record of the skills install and the 'clean-slate' episode. Recommend recording it in 27.1 as abandoned/superseded, or deleting the branch after deciding whether the Section 16 text should be preserved.

#### Unmerged remote branch claude/check-f88a0c (b8531b8, 2026-09-17): mentioned in 22.9 only as a rescue, not as still-unmerged

Commands: git rev-list --count origin/main..origin/claude/check-f88a0c -> 1 ahead; origin/main..: 148 behind; git cherry -> '+ b8531b8'; merge-base 4cc2072 (2026-08-28); gh pr list --state all --head claude/check-f88a0c -> []. Diffstat: 11 files +2,057/-325: TraceWorkspace.tsx, lib/trace.ts, seven components/trace/*.tsx, plus a 386-line edit to the old dashboard/src/App.tsx. git ls-tree origin/main for views/TraceWorkspace.tsx, lib/trace.ts, components/trace/SpanRow.tsx -> all absent. NEW L2117-L2130 (22.9) records that it was pushed 'because it existed on no branch'; 27.1 does not list it. Effect: none on 27.6; it is built on the pre-PR #2 dashboard, so it will not apply to the current one. Worth one line in 27.1 as 'unmerged, no PR, base obsolete'.

#### Full remote branch inventory: 34 branches, 7 with commits not in main, 26 fully merged and never deleted

Commands: git for-each-ref refs/remotes ... + git rev-list --count origin/main..BRANCH for each; gh api repos/Soum-Code/agentpulse/branches?per_page=100 --paginate (34 entries). The GitHub list and the local origin/* refs are IDENTICAL (diff of name+sha), re-checked at 17:08Z. Ahead of main: fix/no-mock-fallback 7 (PR #58, 2026-10-13, Soum-Code), claude/optimistic-knuth-0z7l6z 5 (PR #60, 2026-10-01, Claude), claude/session-handoff-20ykc9 3 (no PR, 2026-08-28), docs/handoff-25-5 1 (PR #57), fix/grounding-truncation-visible 1 (PR #56), fix/restore-e31fb58-regressions 1 (PR #59, closed unmerged, branch kept), claude/check-f88a0c 1 (no PR). Ahead 0 (fully merged, still on the remote): chore/ablation-rerun, claude/handoff-continuation-bb2790, docs/align-prose, docs/deck-apm-closed, docs/deck-fixtures, docs/demo-script, docs/handoff-22, docs/handoff-22-rehearsal, docs/handoff-23, docs/handoff-23-omniroute, docs/handoff-24, docs/handoff-24-9-3, docs/handoff-25, exp/paraphrase-stability, feat/favicon, fix/apm-performance-view, fix/auth-error-messages, fix/borrowed-branding, fix/disagreement-alert-severity, fix/hero-card-claims, fix/ingest-latency-figure, fix/launch-json-ports, fix/overview-fabricated-metrics, fix/spankind-docstring, fix/telemetry-lab, fix/tool-claim-coverage. gh api repos/Soum-Code/agentpulse --jq .delete_branch_on_merge -> false. Note several of these merged branches (docs/handoff-23-omniroute, claude/handoff-continuation-bb2790) are checked out in local worktrees. NEW mention: 27.1 lists only 5 of the 7 unmerged refs (main, 7f78b3f, #56, #57, #58, Oct-1); the inventory of the 26 merged ones is not given anywhere. Effect on 27.6: none; housekeeping. Boring but complete.

#### PRs: nothing closed-unmerged or retargeted before today

Command: gh pr list --repo Soum-Code/agentpulse --state all --limit 100 --json number,baseRefName,state,mergedAt,author,isCrossRepository. Aggregate: total 60, merged 55 (#1-#55), all base=main (base_not_main = []), no fork PRs (cross_repo = []), single author Soum-Code, closed_unmerged = [59] (today only). No PR was merged into another branch. NEW mention: its statement that #1-#55 are merged is consistent; #59's closure is the only change. Effect: category otherwise empty.

#### Tags and releases: exactly one tag and one release, both pre-date everything in Sections 24-27

Commands: git tag -l -> v0.1.0; git ls-remote --tags origin -> one tag; gh release list --limit 30 -> 'v0.1.0 - first tagged release Latest v0.1.0 2026-09-14T15:27:54Z'; gh release view v0.1.0 --json assets -> 0 assets, isDraft false, isPrerelease false. Tag peels to d780b86 (git merge-base --is-ancestor says it is an ancestor of origin/main). NEW mention: L1425 only ('a v0.1.0 release'). No later tag or release for the 24.x work, the Oct-1 packaging, or e31fb58.

#### Open issues: none, ever; Discussions, wiki, Pages, deployments, environments, Actions secrets/variables all empty

Commands: gh issue list --repo Soum-Code/agentpulse --state all --limit 30 -> []; gh api repos/.../ --jq '{has_issues,has_wiki,has_pages,has_discussions,open_issues_count,forks_count,stargazers_count}' -> issues enabled, wiki false, pages false, discussions false, forks 0, stars 0 (open_issues_count 4 at the time = the four open PRs; issue and PR numbers share one counter, 1-60 are all PRs). gh api repos/.../pages -> 404; gh api repos/.../deployments --jq length -> 0; gh api repos/.../environments -> total_count 0; gh api repos/.../actions/secrets --jq .total_count -> 0, .../actions/variables -> 0. NEW mention: none needed. Not covered because the token could not read them: webhooks (gh api repos/.../hooks) and deploy keys (.../keys) both answered 'needs the admin:repo_hook scope', GHCR packages needs read:packages, and GitHub App installations (gh api user/installations -> 403). I did not refresh the token scopes.

#### Security settings visible read-only: secret scanning, push protection and Dependabot are all disabled on the now-public repo; no rulesets; no SECURITY.md

Command: gh api repos/Soum-Code/agentpulse --jq .security_and_analysis -> dependabot_security_updates disabled, secret_scanning disabled, secret_scanning_push_protection disabled, secret_scanning_non_provider_patterns disabled, secret_scanning_validity_checks disabled. gh api .../dependabot/alerts -> 403 'Dependabot alerts are disabled'; .../secret-scanning/alerts -> 404 'Secret scanning is disabled'; .../code-scanning/alerts -> 404 'no analysis found'; gh api .../rulesets -> []; gh api .../community/profile -> health_percentage 42, license true, readme true, code_of_conduct/contributing/issue_template/PR_template false. gh api .../actions/permissions -> enabled=true, allowed_actions=all; .../actions/permissions/workflow -> default_workflow_permissions=read. My own spot scan of eight branch tips (git grep -I -l -E 'nvapi-|sk-or-v1-|AIza...|ghp_|github_pat_|AKIA|PRIVATE KEY|hf_...' on origin/main, #58, #60, #59, #56, #57, session-handoff, check-f88a0c) hit one file only: dashboard/src/lib/firebase.ts line 44, a Firebase web key (prefix 'AIza...'), which NEW L1879-L1881 already documents as public by design. Current tips only; history was not scanned. NEW mention: 0 hits for 'secret scanning', 'push protection', 'Dependabot', 'SECURITY.md'; L48 says only that the repo was 'scanned for secrets first' (a manual scan, not a standing control). Effect on 27.6: add to item 5 (branch protection) and item 6 (the pasted NVIDIA key): GitHub secret scanning and push protection are free on a public repository and currently off, so a key committed by mistake or by an AI Studio sync would not be flagged.

#### Collaborator SkSahoo98 still has push access to main (the 'second writer' the handoff named in 17.5)

Command: gh api repos/Soum-Code/agentpulse/collaborators --jq '.[]|"\(.login) admin=\(.permissions.admin) push=\(.permissions.push)"'. Output: 'SkSahoo98 admin=false push=true' and 'Soum-Code admin=true push=true'. gh api .../contributors -> Soum-Code 211, SkSahoo98 1; gh api 'repos/.../commits?author=SkSahoo98' -> one commit, b7dc43c, 2026-08-31 'overhaul UI theme to vibrant comic style'. Pending invitations: 0. e31fb58 is not theirs: author and committer are both the owner (git log -1 --format='author=%an | committer=%cn' e31fb58 -> P.Somnath Reddy / P.Somnath Reddy), unsigned (gh api .../commits/e31fb58 -> verification.reason 'unsigned'), and the check suite for it was created 2026-09-20T20:20:52Z, which matches 2026-09-21T01:50:51+05:30. NEW mention: L51 and L1021-L1062 name SkSahoo98; L3555 (27.6 item 5, 'Stop a second writer reaching main') names only the AI Studio app. Effect on 27.6 item 5: add 'decide whether SkSahoo98 keeps push access' to the same item; protection plus the AI Studio unlink would still leave a second human with write access. Severity: misleading by omission.

#### GitHub Apps on the repo and what their statuses mean on PR pages (CodeRabbit shows a green 'success' for a skipped review)

Commands: gh pr view N --json statusCheckRollup for #56,#58,#59 -> StatusContext 'CodeRabbit' state SUCCESS; gh api repos/.../commits/7a4786c/status -> {"context":"CodeRabbit","description":"Review skipped: manual review required for this OSS repository","state":"success"}. gh api repos/.../commits/SHA/check-suites for e83b783, d780b86, 7f78b3f, e31fb58, 7a4786c, 11a1eb1, 79c2b52, f95d135, 74c7bb3 -> google-cloud-build status=queued conclusion=null total_runs=0 on every one (created=2026-08-23T12:56:22Z on the initial commit e83b783, so it pre-dates the 2026-09-19 AI Studio import by four weeks); claude app status=queued, 0 runs, present from d780b86 (2026-09-14). Installed apps could not be listed directly (gh api user/installations -> 403; repos/.../installation -> 401 JWT), so this list is inferred from check suites and statuses. NEW mention: grep 'CodeRabbit|Cloud Build|GitHub App' -> 0 hits. Effect on 27.6: none on the choices, but every open PR shows one green check that gates nothing; a reader deciding merge order on 'checks passing' would be misled, and there is no real test check except the new release workflow on #60. Also note the google-cloud-build suite is not evidence of the AI Studio path (it pre-dates it).

#### Local clone: worktrees, stashes and unpushed work (report only; nothing touched). State is changing underneath the handoff

Commands: git worktree list ; git stash list --format='%gd %s' ; git for-each-ref refs/heads --format='%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)' ; git -C <wt> status --porcelain. At the start of the sweep there were five worktrees including a detached 'linea-verify' at 79c2b52; by 17:04Z linea-verify was gone and 'explain-comments' [docs/explain-code-comments @ 79c2b52, local branch, not on the remote, clean] had appeared; another session is working on top of the Oct-1 branch. Current list: primary checkout on main e31fb58 (status clean; ignored files present include .env, dashboard/.env, data/, backend/data/, models/); favicon [docs/handoff-23-omniroute @ cf8bf25] with an untracked .impeccable/ (config.json, hook.cache.json); handoff-continuation-bb2790 [fix/no-mock-fallback @ 7262ff0] which is 4 commits behind origin and carries the OLD handoff text (no READ FIRST banner) plus a modified tracked .claude/settings.local.json (2 insertions, 1 deletion); goofy-tharp-4a4214 [docs/handoff-reconcile @ 7a4786c]. git worktree prune -n -v -> nothing prunable. Stashes: none (git stash list empty; no refs/stash). Local-only branches with no remote counterpart: claude/goofy-tharp-4a4214 (046a655), docs/explain-code-comments, probe/main-baseline and verify/merged-main (7f78b3f), review/rag-frontend (e31fb58, identical to main). Local branches ahead of their upstream: docs/handoff-24 [ahead 16] and fix/telemetry-lab [ahead 1]; I checked every one of those commits with git merge-base --is-ancestor <c> origin/main and all 17 are reachable from origin/main (they are merge commits of #47-#49 and #33), so no unpushed work is at risk. docs/handoff-reconcile has upstream origin/fix/no-mock-fallback and no remote branch of its own. NEW mention: 'stash', 'linea-verify', 'probe/main-baseline', 'verify/merged-main', 'review/rag-frontend', 'explain-comments' = 0 hits; only the old check-f88a0c worktree is discussed (22.9). Effect: none on 27.6, but anyone resuming in the handoff-continuation-bb2790 worktree sees the pre-update handoff, and 22.9's own lesson (check what a worktree holds before removing it) applies to the favicon and handoff-continuation worktrees.

#### A tracked .claude/settings.local.json is on main and on every PR branch

Commands: git ls-tree -r --name-only origin/main -- .claude -> '.claude/launch.json' and '.claude/settings.local.json'; git log --format='%h %cs %s' origin/main -- .claude/settings.local.json -> e83b783 2026-08-23 'Initial commit' (single commit). git show origin/main:.claude/settings.local.json | wc -lc -> 7 lines, 82 bytes; JSON keys: {permissions: {allow: 1 entry}}; key-shaped pattern count 0. .gitignore ignores .claude/skills/ and .claude/worktrees/ but not this file. NEW mention: grep 'settings.local' -> only unrelated L1763 (the Python settings object). Effect: none on 27.6; minor hygiene (a per-machine settings file is versioned, and shows as modified in the handoff-continuation worktree).

#### Related repositories under Soum-Code

Command: gh repo list Soum-Code --limit 50 --json name,pushedAt,visibility,description. 13 repos, all public, no forks, none archived: agentpulse (pushed 2026-10-13); Soum-frontend- (pushed 2026-10-10T21:25:10Z, 2 commits 'Initial commit' and 'feat: initialize AgentPulse project structure', 0 issues; NEW 27.9 covers it); frontend (pushed 2026-09-16, last commit 1be5b6e 'chalk-tactile annotations', created 2026-09-01; NEW references it 8 times, e.g. 27.2); agenttrace (created 2026-05-11, pushed 2026-06-13, commits by a different author, MIT; name-similar but unrelated to AgentPulse; NEW L946 and L1197 mention it as an ignored nested checkout and a licence); CAR (a separate research repo, pushed today 2026-10-13T10:42Z; NEW L1197 mentions its licence only); the profile repo Soum-Code (README contains no 'agentpulse' text: gh api repos/Soum-Code/Soum-Code/readme | base64 -d | grep -c -i agentpulse -> no matches); and eight unrelated project repos (Multi-Modal-Convergence-Detection, hybrid-moe-codegen, Medical-Report-Simplifier, jd-gap-analyzer, Fine_Tuning, RLMs, GenAI-Lab-Experiments, semantic-search-engine, all pushed 2026-09-06). gh api user/orgs -> 0 organisations. Hugging Face: https://huggingface.co/api/spaces?author=<Soum-Code|soumcode|somnath> -> [] each (guessed handles, so not proof that no Space exists). Effect on 27.6: none; no repository is missing from the NEW handoff that bears on AgentPulse.
