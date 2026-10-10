# Handoff audit — 2026-10-10

The raw findings behind `SESSION_HANDOFF.md` Section 27: 106 places where the handoff, as it stood at PR #58's tip (`7262ff0`, before the 2026-10-10 update), disagreed with the repository or with itself. **Line numbers (`L####`) refer to that version of the file, not the updated one.**

## Read this first

- These are the output of five automated finder passes (dimensions B1, B3, C, D, E). **The adversarial refutation and consolidation stages did not run** (usage limit), and dimensions A1, A2 and B2 did not complete. A finding here is *unrefuted*, not *confirmed*.
- Each entry says how far it was checked afterwards: **by hand** (re-read, re-counted or re-scored in the 2026-10-10 pass), **partly by hand** (the repository-state half was checked, the rest was not), or **finder only**.
- `MAIN` = `origin/main` (`e31fb58`); `PRE` = `7f78b3f`, the last `main` before it; `P56`, `P57`, `P58` = the branches of PRs #56, #57, #58.
- Not covered at all: Sections 1–3 and 7–23, and the model-dependent numbers in 25.1 and 25.2. See 27.7.

| severity | count |
| :--- | ---: |
| wrong-now | 26 |
| misleading | 38 |
| stale | 18 |
| minor | 24 |
| **total** | **106** |

| checked | count |
| :--- | ---: |
| by hand | 23 |
| partly by hand | 16 |
| finder only | 67 |


## wrong-now

### B1-01 — by hand

**Where:** L2855-2856 (section 24.9.3)

**The handoff says:** '10 of 34 paraphrase-signal pairs landed on the opposite side of the 0.6 alert threshold from their anchor'

**Reality:** The numerator (10) is right but the denominator is not. 34 is the number of paraphrases generated, 2 of which were discarded before scoring. The scored population is 32 paraphrases x 2 signals = 64 paraphrase-signal pairs. Disagreement: 7 flips in 32. Contradiction: 3 flips in 32. 9 distinct paraphrases flipped at least one signal (one flipped both).

**Evidence (the finder's command or reading):**

~~~text
git -C <wt> show 7f78b3f:experiments/results/paraphrase_stability.json | python -I -c <per anchor: kept = variants without 'discarded'; flipped = count((x>0.6)!=(anchor>0.6)) for each signal> printed: 'total variants 34 discarded 2 kept 32' ; "TOTAL flips {'disagreement': 7, 'contradiction': 3} pairs {'disagreement': 32, 'contradiction': 32} sum flips 10 sum pairs 64" ; 'distinct paraphrases flipped on >=1 signal: 9 dis 7 con 3 both 1'. The generated PARAPHRASE_STABILITY_REPORT.md at 7f78b3f says only '10 paraphrase-signal pairs landed on the opposite side', with no 'of 34'.
~~~

### B1-02 — by hand

**Where:** L41 (section 0, TL;DR)

**The handoff says:** '10 of 34 paraphrases crossed the alert threshold their anchor did not' (stated in the same sentence as the disagreement spreads, followed at L42 by 'It is disagreement specifically')

**Reality:** 10 counts paraphrase-signal pairs, not paraphrases, and 3 of the 10 are contradiction flips. On disagreement the figure is 7 of 32 scored paraphrases (22%). Counting distinct paraphrases that flipped either signal gives 9 of 32. '10 of 34 paraphrases' is wrong on both numerator and denominator.

**Evidence (the finder's command or reading):**

~~~text
Same command as B1-01: "TOTAL flips {'disagreement': 7, 'contradiction': 3} pairs {'disagreement': 32, 'contradiction': 32}" and 'distinct paraphrases flipped on >=1 signal: 9 dis 7 con 3 both 1'.
~~~

### B1-07 — finder only

**Where:** L2594-2595 (section 24.5)

**The handoff says:** 'Recorded in the limitations, in the template in ablation.py rather than the generated file' (the Config D / ingest-path caveat and the ONNX note)

**Reality:** On MAIN and P58 those limitation bullets are gone. e31fb58 deleted the Config D / 1,328-evaluations bullet and the load_models(use_onnx=False) latency note from experiments/ablation.py, and reverted experiments/results/ablation_results.json to the 2026-08-23 17:56:09 UTC run. So on MAIN the Config B latency in the file is 188.07 ms again, and there is no 132 ms result anywhere in the tree.

**Evidence (the finder's command or reading):**

~~~text
git grep -n -E 'ingest path|1,328|use_onnx=False' e31fb58 -- experiments/ablation.py -> only 'e31fb58:experiments/ablation.py:243: load_models(use_onnx=False, sync=True)'; the same grep on 7f78b3f also returns lines 506, 510, 516. git diff 7f78b3f e31fb58 -- experiments/ablation.py shows the two bullets removed. git show e31fb58:experiments/results/ablation_results.json | grep timestamp -> '2026-08-23 17:56:09 UTC'.
~~~

### B1-09 — partly by hand

**Where:** L2704 (24.9) and L2835 (24.9.3)

**The handoff says:** '`experiments/refusal_disagreement.py` exists to answer the confound...' and '`experiments/paraphrase_stability.py` turns 24.9.2 from three anecdotes into a measurement'

**Reality:** Neither script, nor their result JSONs, nor REFUSAL_DISAGREEMENT_REPORT.md / PARAPHRASE_STABILITY_REPORT.md exist on MAIN or P58. e31fb58 deleted them (6 files, 3,376 deletions in experiments/). Every number in 24.9-24.9.5 can only be reproduced from 7f78b3f or the conflicting PR branches #56 / #57.

**Evidence (the finder's command or reading):**

~~~text
git ls-tree -r --name-only e31fb58 | grep -i -E 'refusal_disagreement|paraphrase_stability' -> (no output); same for 7262ff0 -> (no output); the same command on 7f78b3f lists PARAPHRASE_STABILITY_REPORT.md, REFUSAL_DISAGREEMENT_REPORT.md, experiments/paraphrase_stability.py, experiments/refusal_disagreement.py, experiments/results/paraphrase_stability.json, experiments/results/refusal_disagreement.json. git diff --stat 7f78b3f e31fb58 -- experiments: '6 files changed, 11 insertions(+), 3376 deletions(-)'. git show e31fb58:experiments/refusal_disagreement.py -> fatal.
~~~

### B1-10 — partly by hand

**Where:** L2698-2700 (24.8) and L3037 (24.10)

**The handoff says:** 'At max_tokens=320 the content came back empty... max_tokens is now 1200 and EmptyCompletion reports which of the two it saw' and 'EmptyCompletion in the demo exists for this'

**Reality:** On MAIN and P58, demo/multi_model_pipeline.py has ask(..., max_tokens: int = 320) and no EmptyCompletion class. The 1200 default and the EmptyCompletion class existed only at PRE (7f78b3f:demo/multi_model_pipeline.py lines 196 and 181) and were reverted by e31fb58. The handoff also says 320 where the PRE source comment says 'At the 300 this file first used'.

**Evidence (the finder's command or reading):**

~~~text
git grep -n -E 'max_tokens|class EmptyCompletion' e31fb58 -- demo/multi_model_pipeline.py -> 'e31fb58:demo/multi_model_pipeline.py:88:def ask(client: Any, model: str, prompt: str, *, max_tokens: int = 320)'; same at 7262ff0. git grep -n EmptyCompletion e31fb58 -> only dashboard/src/lib/ragApi.ts:138 (a fixture string). At 7f78b3f: 'demo/multi_model_pipeline.py:196: max_tokens: int = 1200,' and ':181:class EmptyCompletion(RuntimeError)'.
~~~

### B3-01 — finder only

**Where:** L2594-2595 (section 24.5)

**The handoff says:** Config D's production-ingest caveat was 'Recorded in the limitations, in the template in `ablation.py` rather than the generated file'.

**Reality:** True at PRE only. e31fb58 (the MAIN commit) removed the limitation paragraphs from both THRESHOLD_ANALYSIS.md and the template in experiments/ablation.py, along with the use_onnx=False latency caveat. On MAIN and P58 neither file mentions the production ingest path, '1,328 live evaluations' or the PyTorch-only latency path.

**Evidence (the finder's command or reading):**

~~~text
`git grep -n -E "1,328|use_onnx=False|does not exercise the production ingest" 7f78b3f -- THRESHOLD_ANALYSIS.md experiments/ablation.py` -> THRESHOLD_ANALYSIS.md:93,97,103 and experiments/ablation.py:506,510,516. Same command on origin/main and origin/fix/no-mock-fallback -> only `experiments/ablation.py:243:    load_models(use_onnx=False, sync=True)`. `git diff 7f78b3f origin/main -- THRESHOLD_ANALYSIS.md experiments/ablation.py` shows the paragraphs as removed lines.
~~~

### B3-02 — finder only

**Where:** L2580-2583, L2597 (section 24.5); L215 (next-steps item 8)

**The handoff says:** The ablation was re-run and Config B latency 'did move, 188.1ms to 132-135ms'; a reader would expect experiments/results/ablation_results.json to carry the re-run.

**Reality:** On MAIN (and P58) ablation_results.json is byte-identical to the 2026-08-23 17:56 UTC version (git blob 69d86a2f...). e31fb58 reverted the 2026-09-18 re-run: timestamp is again 2026-08-23 17:56:09 UTC and Config B latency is 188.07 ms. The re-run (132.09 ms, 2026-09-18 17:34:03 UTC) exists only at PRE/P56/P57. L215 item 8 ('Still open ... ablation_results.json is dated 2026-08-23') therefore describes MAIN accurately while L2580 says the item's premise was wrong.

**Evidence (the finder's command or reading):**

~~~text
`git rev-parse e31fb58:experiments/results/ablation_results.json origin/main:... 73b533f:... 9cd0819:...` -> e31fb58 = origin/main = origin/fix/no-mock-fallback = 69d86a2fce5edab99db11cf6675d53884e63e912 = 73b533f; 9cd0819 = c0bd9e4eebf112a682741f9cb79810f88fb6bac1. Python diff of JSON: `9cd0819 vs e31fb58: Config_B_DeBERTa_Only latency_ms 132.09 -> 188.07`, timestamps '2026-09-18 17:34:03 UTC' vs '2026-08-23 17:56:09 UTC'. `git diff 7f78b3f origin/main --stat -- THRESHOLD_ANALYSIS.md experiments/ablation.py experiments/results/ablation_results.json` -> 3 files, 20 insertions, 42 deletions.
~~~

### B3-04 — finder only

**Where:** L2657-2665 and L2698-2700 (sections 24.7, 24.8)

**The handoff says:** 'Working set at the time of writing' of five OpenRouter families (researcher nvidia/nemotron-3.5-lightning:free, retriever deepseek/deepseek-v4-flash-0731:free, verifier nex-agi/nex-n2.5-pro:free, analyst poolside/laguna-s-2.1:free, writer inclusionai/ling-3.0-flash-vl:free); and 'max_tokens is now 1200 and EmptyCompletion reports which of the two it saw'.

**Reality:** True for demo/multi_model_pipeline.py at PRE only. On MAIN the file is the pre-23.4 version: AGENT_MODELS is qwen/qwen3.8-27b:free, deepseek/deepseek-v4-flash-0731:free, z-ai/glm-5.2:free, nvidia/nemotron-3.5-lightning:free, liquid/lfm-2.5-2.6b:free (the set 24.7 says fails: two 'Provider returned error' and liquid returns empty content), ask() has max_tokens=320, and there is no EmptyCompletion class, no PROVIDERS dict and no nvidia provider. The 1200/EmptyCompletion fix survives on P58 only inside demo/chatbot/app.py.

**Evidence (the finder's command or reading):**

~~~text
`git show origin/main:demo/multi_model_pipeline.py | sed -n 65,70p` -> researcher qwen/qwen3.8-27b:free ... verifier z-ai/glm-5.2:free ... writer liquid/lfm-2.5-2.6b:free. `git grep -n -E 'EmptyCompletion|max_tokens' origin/main -- demo/multi_model_pipeline.py` -> only `:88:def ask(..., max_tokens: int = 320)` and `:99`. Same grep on 7f78b3f -> `:181:class EmptyCompletion`, `:196: max_tokens: int = 1200`. `git show 7f78b3f:demo/multi_model_pipeline.py | sed -n 139,144p` equals the handoff's list; wc -l: 7f78b3f 442 lines, origin/main 256.
~~~

### B3-05 — by hand

**Where:** L13 (TL;DR), L179 (section 3 'Test suite'), L1612 (section 20.5)

**The handoff says:** '209/209 tests passing' (TL;DR, stated as current); 'the 269 tests run locally' (20.5).

**Reality:** 209 was the correct figure on 2026-08-28 (static count 209 at a19d7a1/4cc2072) and L179 dates it, but L13 states it as the current state. On MAIN there are 258 test functions in 22 files (about 260 collected with the one parametrised test), matching README.md:153 '260 passed'. L1612 '269' does not match the backend count when it was written: 196ab2c (2026-09-16, the commit that added the sentence) has 237 test functions, which is also what L1571 in the same section says (237 automated tests). 269 equals 237 backend + 32 dashboard, or the PRE-era pytest total (269 at 11dc2cc), neither of which is the number of tests on MAIN.

**Evidence (the finder's command or reading):**

~~~text
`git grep -c -E "^\s*(async )?def test_" REF -- tests/ | awk -F: '{s+=$NF} END{print s,NR}'` -> a19d7a1 209/18 files; 196ab2c 237/20; 1f752de 258/22; 7f78b3f 267/24; origin/main 258/22; origin/fix/no-mock-fallback 258/22; origin/fix/grounding-truncation-visible 270/25. `git log -S'the 269 tests run' -- SESSION_HANDOFF.md` -> 196ab2c 2026-09-16. `git show origin/main:README.md | sed -n 153p` -> 'Current state: **260 passed**'. Commit text: 975717f '264/264', 11dc2cc '269/269', f95d135 '272/272', P58 PR '260/260'.
~~~

### B3-06 — finder only

**Where:** L3149-3150 (section 25.3); L2704 and L2835 (section 24.9, 24.9.3)

**The handoff says:** 25.3 tests 'the nine real retriever outputs in the experiment data'; 24.9 says `experiments/refusal_disagreement.py` 'exists' and 24.9.3 says `experiments/paraphrase_stability.py` 'turns 24.9.2 ... into a measurement'.

**Reality:** The nine outputs live in experiments/results/refusal_disagreement.json, which, together with both scripts and experiments/results/paraphrase_stability.json, was deleted by e31fb58. On MAIN and P58 none of the four files exist; they are present only at PRE, P56 and P57. A reader on main cannot reproduce 25.3's 9/9 and 0/9 or the 24.9.3 table, and the 'exists' statements are false there.

**Evidence (the finder's command or reading):**

~~~text
`git ls-tree --name-only origin/main experiments/results/refusal_disagreement.json experiments/results/paraphrase_stability.json experiments/refusal_disagreement.py experiments/paraphrase_stability.py` -> (empty); same for origin/fix/no-mock-fallback. Same command on 7f78b3f, origin/fix/grounding-truncation-visible and origin/docs/handoff-25-5 lists all four. Working tree: `ls experiments/results/refusal_disagreement.json` -> No such file or directory.
~~~

### C01 — by hand

**Where:** L44 (TL;DR, section 0)

**The handoff says:** Section 14's '0 of 10' now has a mechanism ... 'The `HIGH` alert has been withdrawn; the score is still computed and stored.'

**Reality:** False on main and on PR #58. Commit 975717f (2026-09-20) withdrew the AGENT_DISAGREEMENT rule; e31fb58 reverted that, and the rule is live again at threshold 0.6 with severity HIGH.

**Evidence (the finder's command or reading):**

~~~text
`git grep -n "AGENT_DISAGREEMENT\|WITHDRAWN" origin/fix/no-mock-fallback -- backend/app/services/alerting.py` -> `alerting.py:300:  alert_type="AGENT_DISAGREEMENT",` and no WITHDRAWN line. Same command on 7f78b3f -> `alerting.py:300: # WITHDRAWN 2026-09-20.` `git log -S"WITHDRAWN 2026-09-20" -- backend/app/services/alerting.py` -> `e31fb58 ... remove tool claim tracking and alerting` and `975717f ... Withdraw the AGENT_DISAGREEMENT alert; keep the score`.
~~~

### C02 — partly by hand

**Where:** L40 (TL;DR, section 0); also L3037 (section 24, 'EmptyCompletion in the demo exists for this')

**The handoff says:** 'The 23.4 multi-model pipeline had never worked, and now does. Five faults in one file.'

**Reality:** On main and PR #58 demo/multi_model_pipeline.py is the pre-fix version again. There is no `await pulse.start()`, shutdown is called without await (the exact fault of 24.1), and EmptyCompletion does not exist. It delivers zero spans again.

**Evidence (the finder's command or reading):**

~~~text
`git grep -n "pulse.start\|pulse.shutdown\|EmptyCompletion" 7f78b3f -- demo/multi_model_pipeline.py` -> `:410: await pulse.start()`, `:433: await pulse.shutdown()`, `:181: class EmptyCompletion`. Same grep on origin/main and origin/fix/no-mock-fallback -> only `:247: pulse.shutdown()` (no start, no await, no EmptyCompletion). `git log -S"await pulse.start()" -- demo/multi_model_pipeline.py` -> `e31fb58` and `98171cc 2026-09-18 Make the multi-model pipeline actually deliver its spans`.
~~~

### C03 — by hand

**Where:** L176 (section 4)

**The handoff says:** 'Dev servers via .claude/launch.json: agentpulse-backend (uvicorn, port 8000)'

**Reality:** On main and PR #58 the backend entry runs .venv/Scripts/uvicorn.exe, the stale shim that exits 1 with no output and binds nothing. Commit d0b600b fixed it (python -m uvicorn) but e31fb58 reverted the fix. The handoff elsewhere (L3058) says to use python -m uvicorn, so the doc and the shipped launch.json disagree.

**Evidence (the finder's command or reading):**

~~~text
`git show origin/main:.claude/launch.json` -> `"runtimeExecutable": ".venv/Scripts/uvicorn.exe"`, `"runtimeArgs": ["app.main:app", "--app-dir", ...]` (identical on origin/fix/no-mock-fallback). `git show 7f78b3f:.claude/launch.json` -> `".venv/Scripts/python.exe"` with `["-m", "uvicorn", "app.main:app", ...]`. `./.venv/Scripts/uvicorn.exe --version; echo exit=$?` -> `exit=1`, no other output; `./.venv/Scripts/python.exe -m uvicorn --version` -> `Running uvicorn 0.52.3`.
~~~

### C04 — by hand

**Where:** L176 (section 4)

**The handoff says:** 'agentpulse-dashboard (vite, port 5173)'

**Reality:** `npm run dev` serves vite on port 3000. 5173 is the Docker/nginx port only. launch.json declares 5173 on main and PR #58 (d0b600b had corrected it to 3000; e31fb58 reverted), so the preview opens an empty tab. The repo README and STARTUP_GUIDE say 'Open http://localhost:5173' after npm run dev, which is also wrong for the dev server. In addition, on main `npm run dev` runs the agentpulse-mock-api fixture middleware (see C21).

**Evidence (the finder's command or reading):**

~~~text
`git show origin/main:dashboard/package.json` -> `"dev": "vite --port=3000 --host=0.0.0.0"`; `git show origin/main:dashboard/vite.config.ts | grep -n port` -> `264: port: 3000,`; `git show origin/main:.claude/launch.json` -> `"port": 5173`. docker-compose.yml:56 `"5173:5173"`, dashboard/nginx.conf:2 `listen 5173;`, deploy/oracle/README.md:107 `:5173` (Docker). `git show d0b600b` message: 'The entry declared 5173 while npm run dev runs vite --port=3000'.
~~~

### C05 — by hand

**Where:** L52 (TL;DR) and L178 (section 4)

**The handoff says:** 'Docker, GitHub, and dev-server setup are all previously verified working' / 'Docker (docker compose up --build) was verified working end-to-end ... nothing since should have broken it.'

**Reality:** Broken on main and PR #58. e31fb58 deleted dashboard/package-lock.json (and bun.lock) but dashboard/Dockerfile and deploy/huggingface/Dockerfile still COPY the lockfile, so the dashboard image cannot be built. The doc also contradicts itself: Section 18.5 says Compose 'could never have worked' (4 further faults) so 'verified working earlier' was false when written. The dev-server half is false too (C03, C04).

**Evidence (the finder's command or reading):**

~~~text
`git cat-file -e origin/main:dashboard/package-lock.json` -> missing (present on 7f78b3f). `git grep -n package-lock origin/fix/no-mock-fallback -- dashboard/Dockerfile deploy/huggingface/Dockerfile` -> `dashboard/Dockerfile:3:COPY package.json package-lock.json .` and `deploy/huggingface/Dockerfile:11:COPY dashboard/package.json dashboard/package-lock.json ./`. `git ls-files | grep -c package-lock` in the PR #58 worktree -> 0. (Static analysis only; docker was not run.)
~~~

### C07 — by hand

**Where:** L174 (section 4)

**The handoff says:** 'Repo: https://github.com/Soum-Code/agentpulse (private).'

**Reality:** The repo is public (and L34 / Section 18.8 of the same document say so).

**Evidence (the finder's command or reading):**

~~~text
`gh repo view Soum-Code/agentpulse --json visibility,isPrivate` -> `"isPrivate":false ... "visibility":"PUBLIC"`.
~~~

### C09 — by hand

**Where:** L181 (section 4)

**The handoff says:** 'as launched, it writes to backend/data/agentpulse.db. Query that one when verifying, not the root one.'

**Reality:** Backwards. The populated DB is the root-relative ./data/agentpulse.db; backend/data/agentpulse.db is the empty one that bites a process started inside backend/. The same document says so at L3061-3064 (s24). launch.json has no cwd, and --app-dir only sets sys.path, so the DB is <cwd>/data/agentpulse.db. The README quickstart (API from root, then `cd backend && python -m app.worker`) splits the two processes across the two files.

**Evidence (the finder's command or reading):**

~~~text
Read-only sqlite3 (mode=ro): main checkout data/agentpulse.db -> spans 20870, evaluations 1427, alembic_version 8d86fee0d663; backend/data/agentpulse.db -> tables: only alembic_version, 0 rows. Worktree handoff-continuation-bb2790 (the s26 chatbot session): data/agentpulse.db -> 216 spans (to 2026-09-20), backend/data/agentpulse.db -> 0 spans. `git show origin/main:README.md | sed -n 50,62p` -> `uvicorn app.main:app --app-dir backend ...` then `cd backend && python -m app.worker`.
~~~

### C11 — finder only

**Where:** L200 (section 5) and L216 (section 6 item 9)

**The handoff says:** 'This repo has only ever had a main branch; every commit across every session has gone directly to it ... Keep committing directly to main unless told otherwise; don't assume.'

**Reality:** Answered de facto. Since 2026-09-01 work lands through topic branches and PRs: 58 PRs (#1-#58), all base main, 55 merged, 3 open. PRs #1-#3 were squash-merged ('(#1)' suffix); #4 onward are merge commits (52 'Merge pull request' commits on main's first-parent). Branch prefixes: docs 23, fix 19, feat 6, chore 3, deploy/test/claude/exp 1 each. The only direct commit on main since PR #4 (2026-09-14) is the owner's e31fb58. Section 19.0 of the same document says 'Thirteen pull requests, #4 through #16, all merged'. Following L200 would create direct-to-main commits against the practice of 55 merged PRs.

**Evidence (the finder's command or reading):**

~~~text
`gh pr list --state all --limit 100 --json ...` -> total 58, {MERGED:55, OPEN:3}, bases {main:58}, first created 2026-08-31 (PR #1). `git log --first-parent origin/main --since=2026-09-01 --format='%h|%ad|%an|%s' | grep -v 'Merge pull request'` -> e31fb58 (2026-09-21), three 2026-09-14 docs/deploy commits, and earlier 09-06/09-01 squash merges `(#3) (#2) (#1)`. `git log --first-parent origin/main --format=%s | grep -c '^Merge pull request'` -> 52. 87 direct first-parent commits exist, almost all before 2026-09-14.
~~~

### D-01 — by hand

**Where:** L44 (TL;DR) and L3179 (section 25.4 table); contrast L2985 (section 24.9.5)

**The handoff says:** TL;DR: 'The `HIGH` alert has been withdrawn; the score is still computed and stored.' 25.4: 'disagreement ... alerting withdrawn (24.9.5)'.

**Reality:** On MAIN and on P58 (identical file) the AGENT_DISAGREEMENT rule is live: severity HIGH, threshold 0.6, on disagreement_score. The 'WITHDRAWN 2026-09-20' commented-out version exists only on PRE, P56 and P57. e31fb58 restored the live rule. Section 24.9.5 itself (L2985) says 'It should not be shipping a HIGH severity alert in that state', so the document contradicts itself, and 24.9.5 records no withdrawal at all.

**Evidence (the finder's command or reading):**

~~~text
[R=<repo> git -C "$R" show origin/main:backend/app/services/alerting.py | sed -n '298,306p' -> 'AlertRule(  alert_type="AGENT_DISAGREEMENT",  severity="HIGH",  condition_field="disagreement_score",  threshold=0.6,'. git -C "$R" diff 7f78b3f origin/main -- backend/app/services/alerting.py -> '-            # WITHDRAWN 2026-09-20. The rule above is kept as a comment rather than deleted' ... '+            AlertRule(' '+                alert_type="AGENT_DISAGREEMENT",'. git -C "$R" diff --stat origin/main HEAD -- backend/app/services/alerting.py -> empty (P58 equals MAIN). git -C "$R" grep -n 'AGENT_DISAGREEMENT' origin/fix/grounding-truncation-visible -- backend/app/services/alerting.py -> only commented lines 307-309. grep -n -i 'withdr' SESSION_HANDOFF.md -> L44, L3179 only.
~~~

### D-02 — partly by hand

**Where:** L38 (TL;DR), L902 (16.7), L922 (17.1 table), L144-148 (Section 2 'Other reference docs')

**The handoff says:** 'Design direction is frozen in `bedhi_frontend.md`'; 'bedhi_frontend.md is the frozen design research baseline'; Section 2 lists MASTER_PROMPT_CORRECTIONS.md, IMPLEMENTATION_MAP.md, DASHBOARD_REDESIGN_PROMPT.md as reference docs.

**Reality:** All four files were deleted on 2026-09-14 in c6198e3 ('drop the agent prompts') and are absent on MAIN, PRE and P56. Section 19.9 mentions 'four agent prompt files' but never names them, so nothing connects the deletion to these pointers.

**Evidence (the finder's command or reading):**

~~~text
[R] git -C "$R" cat-file -e origin/main:bedhi_frontend.md -> not found (same for MASTER_PROMPT_CORRECTIONS.md, IMPLEMENTATION_MAP.md, DASHBOARD_REDESIGN_PROMPT.md). git -C "$R" log --all --diff-filter=D --format='%h %ad %s' --date=short -- bedhi_frontend.md -> 'c6198e3 2026-09-14 Document how the system actually works, and drop the agent prompts'. git -C "$R" show --stat c6198e3 -> 'DASHBOARD_REDESIGN_PROMPT.md | 50 ---', 'IMPLEMENTATION_MAP.md | 104 ------', 'MASTER_PROMPT_CORRECTIONS.md | 93 -----', 'bedhi_frontend.md | 871 ------'.
~~~

### D-03 — by hand

**Where:** L174 (Section 4)

**The handoff says:** 'Repo: https://github.com/Soum-Code/agentpulse (private).'

**Reality:** The repository is public (and carries an MIT licence). Section 18.8 (L1173) records the switch on 2026-09-12, so Section 4 contradicts a later section.

**Evidence (the finder's command or reading):**

~~~text
gh repo view Soum-Code/agentpulse --json visibility,isPrivate,licenseInfo -> {"isPrivate":false,"licenseInfo":{"key":"mit"...},"visibility":"PUBLIC"}
~~~

### D-04 — finder only

**Where:** L198-200 (Section 5), L216 (Section 6 item 9)

**The handoff says:** 'This repo has only ever had a `main` branch; every commit across every session has gone directly to it ... Keep committing directly to `main` unless told otherwise.' Item 9 still lists the branch/PR question as an open one-line decision.

**Reality:** The repository has 58 PRs (55 merged, 3 open) and 34 remote branches. Section 19 itself says 'Thirteen pull requests, #4 through #16, all merged', and the current work is PRs #56-#58. The workflow question has been settled by practice.

**Evidence (the finder's command or reading):**

~~~text
gh pr list --state all --limit 100 --json number,state,headRefName -> total PRs 58, min 1, max 58, Counter({'MERGED': 55, 'OPEN': 3}). git -C "$R" branch -r | wc -l -> 34.
~~~

### D-05 — finder only

**Where:** L2594-2595 and L2597-2600 (24.5)

**The handoff says:** 'Recorded in the limitations, in the template in `ablation.py` rather than the generated file'; 'Latency did move, 188.1ms to 132-135ms on Config B across three runs'.

**Reality:** On MAIN and P58 neither the ablation.py limitation text nor the regenerated figures exist. e31fb58 deleted the 'does not exercise the production ingest path, Config D is the clearest case' bullet and the load_models(use_onnx=False) note from both experiments/ablation.py and THRESHOLD_ANALYSIS.md, and reverted THRESHOLD_ANALYSIS.md to its 2026-08-23 figures (Config B 188.07 ms, cascade 215.9 ms).

**Evidence (the finder's command or reading):**

~~~text
git -C "$R" diff 7f78b3f origin/main -- experiments/ablation.py THRESHOLD_ANALYSIS.md -> '-- **This study does not exercise the production ingest path, and Config D is the clearest' ; '-**Date:** 2026-09-18 17:34:03 UTC' ; '+**Date:** 2026-08-23 17:56:09 UTC' ; '-| B DeBERTa Only ... | 132.09 |' ; '+| B DeBERTa Only ... | 188.07 |'. git diff --stat 7f78b3f origin/main shows experiments/ablation.py | 13 +- and experiments/results/ablation_results.json | 20 +-.
~~~

### D-06 — partly by hand

**Where:** L2704, L2835 (24.9, 24.9.3); L41-43, L45 (TL;DR); L2744-2750

**The handoff says:** The handoff presents `experiments/refusal_disagreement.py` and `experiments/paraphrase_stability.py` (and by implication their results files) as the tools and data behind the 87-trial and 34-paraphrase results.

**Reality:** All of these were deleted by e31fb58 on 2026-09-21 and are absent on MAIN and P58. They exist on PRE, P56 and P57. The 24.9 numbers can no longer be re-derived from the repo a reader lands on. The same commit deleted tests/test_alerting.py and tests/test_tool_claim_coverage.py.

**Evidence (the finder's command or reading):**

~~~text
git -C "$R" cat-file -e origin/main:experiments/refusal_disagreement.py -> missing (also paraphrase_stability.py). git -C "$R" log --all --diff-filter=D --format='%h %ad %s' --date=short -- experiments/refusal_disagreement.py -> 'e31fb58 2026-09-21 refactor: remove tool claim tracking and alerting'; --diff-filter=A -> added 5583a42 2026-09-19. git diff --stat 7f78b3f origin/main -> 'experiments/paraphrase_stability.py | 346 -', 'experiments/refusal_disagreement.py | 688 --', 'experiments/results/refusal_disagreement.json | 2054 ----', 'PARAPHRASE_STABILITY_REPORT.md | 58 -', 'REFUSAL_DISAGREEMENT_REPORT.md | 74 -'.
~~~

### E2 — by hand

**Where:** L3319-3322 (section 26.3) and L3278-3279 ('17 on-corpus questions the six documents can answer'); also demo/chatbot/app.py L31-34

**The handoff says:** The retriever's drift stayed at 0.093 'correctly' because 'its output barely changes with the question ... because the corpus is the same six documents regardless of what is asked'; the on-corpus half of the probe is questions 'the six documents can answer', implying their evidence supports the answers.

**Reality:** The chatbot process never loads the embedding model. get_embedding() returns None there, so LocalVectorIndex.build_index() and .search() fall back to a character-count hash over the first 64 characters (retrieval.py L100-107 and L128-135). Retrieval is therefore nearly independent of the question, not semantic. Over the 34 probe turns the SQLite-WAL document was retrieved 32 times (17/17 on-corpus, 15/17 off-corpus) and KB-429 only twice. At least 5 of the 17 on-corpus questions retrieved no document that holds the answer: 'How does a token-bucket rate limiter handle backoff?' and 'What retry strategy is recommended for HTTP 429?' (no KB-429), 'What happens when an access token expires?' (no KB-401), 'What does disentangled attention separate?' (no DeBERTa), 'Which KPI marks a critical drift incident?' (no Telemetry KPI). So the retriever's flat drift is not evidence that its distribution is correctly stable; it is what a question-blind retriever produces, and the grounding/off-corpus design premise is weaker than stated for those turns.

**Evidence (the finder's command or reading):**

~~~text
Code: grep 'load_models' demo/chatbot/app.py -> no match; backend/app/services/grounding.py L44 '_embedding_model = None' and L392-393 'if _embedding_model is None: return None'; retrieval.py L100-107 'Deterministic fallback vector if models not yet in memory'. Replay, command: venv python -I script that imports demo.workflows.retrieval.local_retriever with no model loaded (printed 'embedding model loaded in this process: False | get_embedding(x) -> None') and re-runs search(q, top_k=3) for each of the 35 logged retriever questions: 'replayed fallback retrieval matches logged retrieval on 35 of 35 turns'. DB counts of retrieved titles over the 34 probe turns: 32 SQLite WAL, 24 Telemetry KPI, 21 Attention, 15 KB-401, 8 DeBERTa, 2 KB-429; 17 distinct retrieved sets.
~~~

### E3 — by hand

**Where:** L3202-3207, L3229-3232 (section 26.1), L3234-3238, and L3331-3334 (26.4 'measured rather than displayed')

**The handoff says:** The frontend 'carried four separate mechanisms' that fabricate a working-looking screen; 'All four removed'; the RAG screen's drift is 'measured rather than displayed'.

**Reality:** The RAG Live Monitor still fabricates drift telemetry on P58 (and on MAIN), in the same genre and in the same commit (e31fb58). RagChatbotApp.tsx L309-315: when the answerer's UI-side span count reaches 32 it sets agentDriftValues to hardcoded answerer 0.082, verifier 0.045, retriever 0.024. MonitoringPanel.tsx L400 renders 'WINDOW FILLED - SUSTAINED DRIFT COMPUTED / Centroid dist' with the literal fallback '0.082' whenever the value is null. L435 prints a hardcoded 'Stable (ASI: 96.4)' and L439 draws a hardcoded sparkline [0.04,0.06,0.05,0.07,0.082,0.079,0.081,0.082] captioned 'Active Centroid Trajectory (w=32)'. 'Filled' is judged from raw span counts (agentSpansCount is seeded from /v1/agents total_spans), the exact condition 26.3 shows is not enough: the measured run had 33+ spans per agent and still no window values after restarts. The real measured values were verifier 0.43 (above the 0.30 threshold), retriever 0.11, answerer 0.51, so the UI contradicts the run it documents. The same panel's callout reads 'Zero Placeholder Ban ... AgentPulse never displays 0.00 when unmeasured'. So the count 'four' and 'All four removed' understate what remains.

**Evidence (the finder's command or reading):**

~~~text
Command: git grep -n "answerer: 0.082\|'0.082'\|96.4" HEAD -- dashboard/src/components/rag -> 'HEAD:dashboard/src/components/rag/MonitoringPanel.tsx:400: ... drift.toFixed(3) : '0.082'', 'MonitoringPanel.tsx:435: Stable (ASI: 96.4)', 'RagChatbotApp.tsx:312: answerer: 0.082,'. Same grep on origin/main returns the same lines (RagChatbotApp L303), so unchanged by PR #58. sed -n 308,315p dashboard/src/components/rag/RagChatbotApp.tsx -> 'if (nextAnswerer >= 32) { setAgentDriftValues(... answerer: 0.082, verifier: 0.045, retriever: 0.024'. DB: DRIFT_DETECTED alert rows for verifier distance=0.378 and 0.408, answerer 0.479.
~~~


## misleading

### B1-04 — finder only

**Where:** L46 (section 0), L3005-3010 (24.10), L2715 vs L2780 (24.9 vs 24.9.2), L41 vs L2724

**The handoff says:** Same-cell and same-sentence numbers drawn from different snapshots without saying so: L46 gives '87 trials ... correct acceptances 0.219 ... empty after 100 trials'; L3005 gives 'correct acceptances 0.219' and, four lines later at L3009, 'Cell A's mean of 0.248'; L41 says 'AUC is 0.979 throughout' while L2724, L2749, L2778, L2956, L3014, L3026 say 0.980

**Reality:** Cell A is n=37, mean 0.219 in one snapshot and n=40, mean 0.2485 in the other; AUC is 0.9797 in one and 0.9792 in the other. Three further things are not disclosed anywhere in the handoff. (a) The 3 added rows (97 to 100) are all deepseek-ai repeats 2, 3, 4 on the transformer query, the query already known to be bimodal, scoring 0.8038, 0.0463, 0.9857; they raise 'above 0.6' from 7 of 37 to 9 of 40, so the headline '9 of 40' (22.5%) is 7 of 37 (18.9%) before those targeted reruns. (b) The 10 unscored rows are all correct acceptances (cell A) on the token-bucket query, so there are 50 correct acceptances and only 40 are scored. (c) No sentence explains why 97/100 and 87/90 differ.

**Evidence (the finder's command or reading):**

~~~text
git show 4af29c2:... vs 7f78b3f:... diffed by (query, verifier_model, repeat): 'added in 7f78b3f: 3'; 'transformer multi-head self-attention deepseek-ai rep 2 accept True 0.8038', 'rep 3 ... 0.0463', 'rep 4 ... 0.9857'; 'common rows with changes: 0'. 'A above 0.6' is 7 at 4af29c2 and 9 at 7f78b3f. Unscored rows at 7f78b3f: "10 Counter({('accept', True, 'token bucket rate limiter backoff'): 10})"; 'cell n over ALL rows: {A: 50, C: 3, B: 47}'. grep -n -i 'unscorable|no context yet|excluded' SESSION_HANDOFF.md finds no explanation.
~~~

### B1-05 — finder only

**Where:** L2949-2956 (section 24.9.5)

**The handoff says:** 'the same fix was applied to the 87-trial set' with a table of accept n=40 and refuse n=50, then 'AUC 0.457, against 0.980 before'

**Reality:** n = 40 + 50 = 90, so this is the 90-scored snapshot, not an 87-trial set. The matching 'before' AUC for those 90 rows is 0.9792 (0.979), not 0.980 (0.9797 is the 87-row value). The headline at L43 repeats 'from 0.980 to 0.457'.

**Evidence (the finder's command or reading):**

~~~text
7f78b3f recomputation: scorable 90, 'refuse rows scorable: 50 accept rows scorable: 40', auc disagreement_live 0.9792. At 4af29c2 'refuse rows scorable: 50 accept rows scorable: 37' (n=87), auc 0.9797.
~~~

### B1-06 — finder only

**Where:** L2581-2584 (section 24.5)

**The handoff says:** 'Re-ran the whole study: every classification is bit-identical to 2026-08-23. Same tp/fp/fn/tn, same precision, recall, F1, FPR, FNR across all seven configurations'

**Reality:** False against the FIRST committed ablation_results.json (e83b783, timestamp 2026-08-23 11:28:51 UTC): Config G differs (fp 11 vs 1, tn 6 vs 16, precision 0.542 vs 0.929, F1 0.703 vs 0.963, FPR 0.647 vs 0.059). Configs A-F, the operating point and dev/test metrics are identical. It is true against the second 2026-08-23 run (73b533f, timestamp 17:56:09 UTC), which was produced after the grounding-score formula fix. Two different ablation runs exist on 2026-08-23 and they disagree on one of the seven configurations. The 73b533f commit message itself records 'F1 0.703->0.963, FPR 0.647->0.059'.

**Evidence (the finder's command or reading):**

~~~text
python -I script comparing git show <sha>:experiments/results/ablation_results.json for e83b783, 73b533f, 9cd0819, 7f78b3f, e31fb58. 'e83b783 vs 7f78b3f diffs: [(Config_G_Full_AgentPulse, fp, 11, 1), (..., tn, 6, 16), (..., precision, 0.542, 0.929), (..., f1_score, 0.703, 0.963), (..., fpr, 0.647, 0.059)]' ; '73b533f vs 7f78b3f: diffs: NONE (all classification metrics identical)'.
~~~

### B1-08 — finder only

**Where:** L2597-2600 (section 24.5)

**The handoff says:** 'Latency did move, 188.1ms to 132-135ms on Config B across three runs, so it is not noise.'

**Reality:** Committed Config B latencies are 300.48 (e83b783), 188.07 (73b533f), 132.09 (9cd0819/PRE), then 188.07 again on MAIN after e31fb58 reverted the file. The 300.48 to 188.07 drop happened on the same day with no change to the NLI path (73b533f only changed the grounding_score formula), which shows swings of that size occur between runs, so 'not noise' is not supported and the baseline omits the first run. '135' and 'three runs' are not in any commit; only one re-run (132.09) is committed.

**Evidence (the finder's command or reading):**

~~~text
python -I script over git show <sha>:experiments/results/ablation_results.json printed: 'Config_B_DeBERTa_Only ... lat 300.48' (e83b783), 'lat 188.07' (73b533f), 'lat 132.09' (9cd0819 and 7f78b3f), 'lat 188.07' (e31fb58). git show --stat 73b533f lists grounding.py with an 18-line change that only adds NEUTRAL_RISK_WEIGHT and changes grounding_score.
~~~

### B1-11 — finder only

**Where:** L2893-2896 (section 24.9.4)

**The handoff says:** 'On every acceptance anchor the instability is entirely the researcher comparison'

**Reality:** All three acceptance anchors (deepseek, google, meta) were taken from the same query, 'transformer multi-head self-attention'. The researcher prior is generated once per query and reused, so the three anchors share one researcher text. The finding is one researcher output on one query, not three independent anchors. (The per-anchor values themselves are unverifiable; only the structure is checkable.)

**Evidence (the finder's command or reading):**

~~~text
paraphrase_stability.json at 7f78b3f, per-anchor printout: 'ANCHOR accept deepseek-ai/... query transformer multi-head self-attention', 'ANCHOR accept google/gemma-4-31b-it query transformer multi-head self-attention', 'ANCHOR accept meta/muse-glimmer-30b query transformer multi-head self-attention'. refusal_disagreement.json context_cache has exactly one researcher entry per query (9 entries). Refusal anchors are on SQLite and kubernetes.
~~~

### B1-12 — finder only

**Where:** L41 and L45 (section 0), L3115-3117 (25.1)

**The handoff says:** 'disagreement spreads 0.948-0.984 across paraphrases of the same statement' and 'Mean spread 0.066, against disagreement's 0.948-0.984 on the identical texts. Roughly fourteen times tighter'

**Reality:** 0.948-0.984 covers four of the five anchors. The fifth (deepseek refusal) has disagreement spread 0.0006, while drift's spread on that same text is 0.084, so drift is looser than disagreement there. Across all five anchors the mean disagreement spread is 0.774, which is about 11.7 times the drift mean of 0.066. 'Fourteen times' holds only against the four unstable anchors. L2859 does say 'four of five'; L41, L45 and L3115 do not.

**Evidence (the finder's command or reading):**

~~~text
paraphrase_stability.json at 7f78b3f: disagreement spreads 0.9803, 0.0006, 0.9844, 0.9567, 0.9482 (mean 0.7740). Drift values are from the handoff table L3109-3113: refuse deepseek 0.084, mean of five 0.0664; 0.774 / 0.0664 = 11.66; 0.948 / 0.066 = 14.4.
~~~

### B3-03 — finder only

**Where:** L2581-2583 (section 24.5)

**The handoff says:** 'every classification is bit-identical to 2026-08-23. Same tp/fp/fn/tn, same precision, recall, F1, FPR, FNR across all seven configurations'.

**Reality:** Two ablation_results.json versions are dated 2026-08-23. Against the later one (73b533f, 17:56 UTC, after the grounding-score fix) all seven configurations are identical to PRE. Against the first committed version (e83b783, 11:28 UTC) Config_G_Full_AgentPulse differs: precision 0.542 -> 0.929, F1 0.703 -> 0.963, FPR 0.647 -> 0.059, fp 11 -> 1, tn 6 -> 16. Configs A-F and the selected operating point are identical in both comparisons.

**Evidence (the finder's command or reading):**

~~~text
`git log --format='%h %ad %s' --date=short -- experiments/results/ablation_results.json` -> e31fb58, 9cd0819 (2026-09-18), 73b533f (2026-08-23 'Fix grounding-score formula'), e83b783 (2026-08-23 'Initial commit'). Python JSON diff `e83b783 vs 9cd0819`: `Config_G_Full_AgentPulse classification-diff={'precision': (0.542, 0.929), 'f1_score': (0.703, 0.963), 'fpr': (0.647, 0.059), 'fp': (11, 1), 'tn': (6, 16)}`; `73b533f vs 9cd0819`: `classification-diff=NONE` for all 7.
~~~

### B3-07 — partly by hand

**Where:** L3154-3161 (section 25.3), L45

**The handoff says:** 'The models mostly wrote their own sentence in prose -- "I retrieved three documents covering DeBERTa's ..." -- and then appended "Retrieved 3 documents."'; 0 of 9 'with the dictated sentence removed'.

**Reality:** The 9 outputs split 3 / 3 / 3. Three use the word form ('I retrieved three documents ...' plus appended 'Retrieved 3 documents.': DeBERTa, gradient descent, photosynthesis). Three write their own sentence with no count at all ('The retrieved documents cover/explain ...') plus the appended 'Retrieved 3 documents.' (transformer, SQLite, react). Three consist only of the dictated sentence with a trailing clause ('Retrieved 3 documents containing guidance ...', 'Retrieved 3 documents, which discuss ...', 'Retrieved 3 documents: one detailing ...'). Under the removal regex two of those become the empty string and the third becomes a fragment starting 'g., in-memory enqueue latency' because [^.]* stops at 'e.g.'. The only digit-count phrase in any of the nine is inside the removed match, so 0 of 9 follows by construction; the informative cases are the 6 outputs with remaining prose, of which 3 contain the word form and 3 contain no count.

**Evidence (the finder's command or reading):**

~~~text
Script over `git show 7f78b3f:experiments/results/refusal_disagreement.json`: `REMOVED  : ''` for 'invalid API key and token expiration' and 'italian carbonara pasta recipe'; kubernetes `REMOVED  : "g., in-memory enqueue latency <0.05ms P95) and Agent Stability Index alert levels, ..."`; `word-count phrase: ['three documents']` for DeBERTa, gradient descent and photosynthesis only; `digit-count phrase: ['3 documents']` for all nine and always inside the match. Totals: as produced 9/9, removed 0/9.
~~~

### B3-08 — partly by hand

**Where:** L3163-3165 (section 25.3) vs L399-410 (section 11)

**The handoff says:** 'This is the mechanism behind Section 11 ... Real agents write "three documents". The regex reads digits.'

**Reality:** Section 11 gives a different, specific cause for the zero extractions and says the regex cannot fix it: TOOL_PATTERNS needs the agent to narrate tool use, but in structured-tool-calling harnesses the invocation is a tool_call field ('Expanding the regex cannot fix this -- the information is not in the text'). 25.3 shows the digit-only COUNT_PATTERNS effect on 9 retriever outputs from this repo's own demo, not on the 8,353 external spans, and the raw spans are not in the repo to test it. The two sections now assign contradictory mechanisms to the same result.

**Evidence (the finder's command or reading):**

~~~text
`sed -n 397,410p SESSION_HANDOFF.md` -> '**Cause -- a design-premise mismatch, not a tuning gap.** `TOOL_PATTERNS` requires the agent to *narrate* tool use ... **Expanding the regex cannot fix this**'. `git ls-tree -r --name-only origin/main datasets/external/exgentic_v2` -> README.md, raw/manifest.json, source_metadata.json, tool_claim_*_metadata.json only; tool_claim_external_test.json has 6 samples.
~~~

### B3-09 — by hand

**Where:** L3308-3317 (section 26.3); L41/L3181-3184

**The handoff says:** 'The verifier detected it, and detected it correctly. Its mean rose from 0.306 to 0.396 across the boundary' with after-switch '17/17 above the 0.30 threshold'.

**Reality:** The before-switch readings were already above the alert threshold: 7 of the 11 pre-switch verifier window values exceed 0.30, and the last 7 before the switch are all 0.324-0.378 (0.378, 0.339, 0.324, 0.331, 0.339, 0.337, 0.351). The first four readings (0.182, 0.224, 0.295, 0.261) are low because the window was still filling. So the rise from 0.306 to 0.396 mixes window warm-up with the topic change, and a 0.30 threshold alert would have fired before the switch. The table reports 17/17 above for after but omits the 7/11 for before.

**Evidence (the finder's command or reading):**

~~~text
Query: window_centroid_distance for verifier joined to spans, ordered by spans.start_time, switch 2026-09-20 21:41:27.204649. Output: before n=11 mean=0.305459 min=0.1818 max=0.3780 above0.30=7; after n=17 mean=0.395702 min=0.3451 max=0.4261 above0.30=17. Ordered values: 21:29:35 0.1818, 21:29:51 0.2236, 21:32:34 0.2947, 21:32:42 0.2606, 21:34:02 0.378, 21:35:37 0.3393, 21:36:33 0.3244, 21:38:09 0.3311, 21:38:32 0.339, 21:38:49 0.3365, 21:39:09 0.3508 (all 'before'), then 0.3658 at 21:41:32 ('AFTER').
~~~

### B3-10 — finder only

**Where:** L3242-3254 (section 26.2); L3250-3252

**The handoff says:** `demo/chatbot/app.py` runs 'three agents on three models'; first-turn listing retriever mistralai/mistral-nemotron, verifier meta/muse-glimmer-30b, answerer deepseek-ai/deepseek-v4-flash.

**Reality:** Those three are the models of the first smoke turn only (the database id is deepseek-ai/deepseek-v4-flash-0731, suffix dropped in the handoff). On P58, app.py AGENT_MODELS is retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b, and every span of the 34-turn probe behind 26.3 ran on those (35 successful retriever and 35 answerer spans on nvidia/*), i.e. two owners, not three. The handoff never says the models changed after the first turn, and app.py's own comment is self-contradictory ('Three owners' at L86, 'Two of these share the nvidia family' at L98).

**Evidence (the finder's command or reading):**

~~~text
`sed -n 102,106p demo/chatbot/app.py` -> the three nvidia/meta/nvidia ids. DB: `select agent_id, model, count(*), min(start_time), max(start_time) from spans ...` -> ('answerer','deepseek-ai/deepseek-v4-flash-0731',1,'2026-09-20 20:56:45'), ('answerer','nvidia/nemotron-3.5-lightning-30b-a3b',35,'21:16:04'..'22:01:03'), ('retriever','mistralai/mistral-nemotron',6,'20:55:18'..'21:12:44'), ('retriever','nvidia/nemotron-3-super-120b-a12b',35,'21:15:59'..'22:00:51'), ('verifier','meta/muse-glimmer-30b',36,...).
~~~

### B3-11 — finder only

**Where:** L3267-3270 (section 26.2)

**The handoff says:** 'a 75s request timeout, because the three calls are sequential so a hung provider takes the whole turn'.

**Reality:** The timeout is per attempt. The hung answerer call in the probe lasted 226.4 s (about 3 x 75 s plus backoff), because demo/chatbot/app.py passes timeout=75.0 per request but constructs OpenAI(...) with no max_retries, and the installed SDK retries twice by default. A hung provider therefore still holds a turn for roughly 225 s (the 247 s worst turn at L3344 is this effect), not 75 s.

**Evidence (the finder's command or reading):**

~~~text
DB: `select ... from spans where status!='success'` -> ('b6293bd59eeb48859ffef56be5d8042c','answerer','error','APITimeoutError: Request timed out.',226387.72); also retriever timeouts at 226760.38 and 226678.97 ms. `grep -n -E 'max_retries|timeout|REQUEST_TIMEOUT_S' demo/chatbot/app.py` -> L112 `REQUEST_TIMEOUT_S = 75.0`, L198 `timeout=REQUEST_TIMEOUT_S`, no max_retries. Venv: `openai.DEFAULT_MAX_RETRIES` -> 2.
~~~

### B3-12 — finder only

**Where:** L3115-3117 (section 25.1)

**The handoff says:** 'Mean spread 0.066, against disagreement's 0.948-0.984 on the identical texts. Roughly fourteen times tighter.'

**Reality:** The disagreement range is taken from four of the five anchors. The fifth anchor (refuse, deepseek) has disagreement spread 0.0006, narrower than that anchor's drift spread of 0.084, and 24.9.3 (L2864) itself calls it 'the one stable disagreement anchor'. Over all five anchors the mean disagreement spread is 0.774 (0.9803, 0.0006, 0.9844, 0.9567, 0.9482), so the like-for-like mean comparison is about 12x, not 14x, and it is not uniformly in drift's favour.

**Evidence (the finder's command or reading):**

~~~text
Python over `git show 7f78b3f:experiments/results/paraphrase_stability.json`: disagreement spread (variants only) per anchor accept-deepseek 0.9803, refuse-deepseek 0.0006, accept-google 0.9844, refuse-google 0.9567, accept-meta 0.9482; mean 0.774; 0.774/0.066 = 11.7.
~~~

### B3-13 — by hand

**Where:** L2855 (24.9.3) and L41 (TL;DR)

**The handoff says:** '10 of 34 paraphrase-signal pairs landed on the opposite side of the 0.6 alert threshold'.

**Reality:** The numerator is right (10 flips: 7 disagreement + 3 contradiction) but 34 is the raw paraphrase count including 2 discarded ones. The population is 32 kept paraphrases x 2 signals = 64 pairs, and 9 distinct paraphrases flipped on at least one signal. So the ratio is 10 of 64 pairs (or 9 of 32 paraphrases), not 10 of 34.

**Evidence (the finder's command or reading):**

~~~text
Python over `git show 7f78b3f:experiments/results/paraphrase_stability.json`: `kept paraphrases 32 pairs 64 flips 10 paraphrases with any flip 9`; total variants 34 with 2 carrying a 'discarded' key.
~~~

### C06 — partly by hand

**Where:** L194 (section 4); L178

**The handoff says:** 'The ingest API requires X-API-Key: change-me-to-a-secure-key (from .env)'

**Reality:** The value is correct but the source is wrong and the .env path is now a trap. Nothing in the backend loads .env (no load_dotenv in backend/app; the default comes from config.py:23). .env is consumed only by docker compose (env_file). e31fb58 blanked .env.example: every key is now `NAME=` with no value. `cp .env.example .env` (README:174, STARTUP_GUIDE:47, deploy/*/README) yields empty AGENTPULSE_PORT etc., and the backend dies at import.

**Evidence (the finder's command or reading):**

~~~text
`git diff 7f78b3f origin/main -- .env.example` shows `-AGENTPULSE_API_KEY=change-me-to-a-secure-key` ... `+AGENTPULSE_API_KEY=` and `+AGENTPULSE_PORT=`. Simulation: exported the AGENTPULSE_* lines of `git show origin/main:.env.example` into os.environ, then imported backend/app/config.py (python -I -B) -> `IMPORT FAILED: ValueError invalid literal for int() with base 10: ''`. `git grep -n dotenv origin/main -- '*.py'` -> no output.
~~~

### C12 — partly by hand

**Where:** L37 (TL;DR, section 0); L1015 (section 17.5)

**The handoff says:** 'main has a second writer and no branch protection - the Free plan does not offer it on private repos.'

**Reality:** The 'private repo' reason no longer applies: the repo is public, so protection is available on the Free plan but has still not been applied. SkSahoo98 still has push. A reader would conclude protection is impossible.

**Evidence (the finder's command or reading):**

~~~text
`gh repo view` -> PUBLIC. `gh api repos/Soum-Code/agentpulse/branches/main --jq '{protected,name}'` -> `{"name":"main","protected":false}`; `gh api .../branches/main/protection` -> `Branch not protected (HTTP 404)`; `gh api .../rulesets` -> `[]`; `gh api .../collaborators` -> SkSahoo98 push=true, Soum-Code push=true.
~~~

### C21 — by hand

**Where:** L50 (TL;DR) and L26; Section 26.1

**The handoff says:** 'A monitoring dashboard shipped four separate ways of fabricating telemetry, including a vite middleware that answered every /v1/* and /chat request from fixtures' (26.1: 'All four removed')

**Reality:** True only on PR #58. On main (e31fb58) dashboard/vite.config.ts still defines the `agentpulse-mock-api` middleware and src/lib/mockData.ts still exists, so `npm run dev` on main serves invented agents, traces, alerts and evaluator health (and so does the launch.json dashboard entry). L26's 'drift, datasets and experiments all read live endpoints now' is therefore false for the dev server on main.

**Evidence (the finder's command or reading):**

~~~text
`git show origin/main:dashboard/vite.config.ts | sed -n 14,22p` -> `function apiDevPlugin() ... name: 'agentpulse-mock-api'` and `plugins: [react(), tailwindcss(), apiDevPlugin()]`; `git cat-file -e origin/main:dashboard/src/lib/mockData.ts` -> present. On origin/fix/no-mock-fallback the plugin is gone and `server.proxy` has '/v1', '/chat', '/corpus'; mockData.ts missing (MAIN->P58 diffstat: `dashboard/src/lib/mockData.ts | 545 ----`).
~~~

### C22 — finder only

**Where:** L220 (section 6, What is actually next 1)

**The handoff says:** 'Capability tiers ... Nothing measured since has changed them, so this is a re-confirm or a skip.'

**Reality:** Misleading. The tier labels may survive but their stated bases did not. The disagreement basis (internal F1 0.960 / 22 pairs) was shown to be an artifact (24.9.5: AUC 0.457 once planner questions are excluded); tool-claim's behaviour is explained by 25.3; grounding is 'weak on refusals' (24.9.3, 25 table); drift gained its first sustained values (26.3). A re-confirm now has a lot to reconcile; 'skip' is not safe.

**Evidence (the finder's command or reading):**

~~~text
PRODUCTIZATION_LOG.md Item 4 table (`git show origin/main:PRODUCTIZATION_LOG.md | sed -n 151,156p`) still cites 'Internal F1 0.960 on 22 self-authored near-minimal pairs' for disagreement. SESSION_HANDOFF.md L43 and L3095-3100 contradict that basis.
~~~

### C24 — partly by hand

**Where:** L41, L43, L46 (TL;DR, section 0) with L2704 and L2835 (section 24.9.x)

**The handoff says:** Measurements of disagreement paraphrase spread (0.948-0.984; 10 of 34 flips; AUC 0.979 -> 0.457) and the 87-trial refusal result are presented as reproducible, with 24.9.x saying `experiments/refusal_disagreement.py` and `experiments/paraphrase_stability.py` exist.

**Reality:** The scripts, their result JSONs and both reports are absent from main and PR #58 (removed by e31fb58). The numbers cannot be regenerated from main; they exist only on 7f78b3f and in the document. The text does not say so.

**Evidence (the finder's command or reading):**

~~~text
`git cat-file -e REF:PATH` for REF in origin/main, origin/fix/no-mock-fallback and PATH in experiments/refusal_disagreement.py, experiments/paraphrase_stability.py, experiments/results/refusal_disagreement.json, experiments/results/paraphrase_stability.json, REFUSAL_DISAGREEMENT_REPORT.md, PARAPHRASE_STABILITY_REPORT.md -> all MISSING (all present on 7f78b3f per `git diff --stat 7f78b3f origin/main`).
~~~

### D-07 — finder only

**Where:** Whole file as seen from MAIN (header L3, TL;DR L40-51, headings L2414, L3089, L3194)

**The handoff says:** Sections 24, 25 and 26 and the TL;DR bullets summarising them are part of SESSION_HANDOFF.md.

**Reality:** origin/main:SESSION_HANDOFF.md is 2,400 lines and ends at '## 23.'. e31fb58 removed Sections 24-25 (they were added in 9fcab38/62be27b/9e3df62/e0e037a/f5fe051). A reader landing on MAIN gets no Sections 24-26 until PR #58 (7262ff0) merges. PRE and P56 have 24-25, P57 has 24-25.6, only P58 has 26.

**Evidence (the finder's command or reading):**

~~~text
git -C "$R" show origin/main:SESSION_HANDOFF.md | wc -l -> 2400; | grep -n '^## ' | tail -1 -> '2203:## 23. Two more rounds, inside the product this time...'. git -C "$R" log --all -S'## 24. The pipeline' --format='%h %ad %s' -- SESSION_HANDOFF.md -> 'e31fb58 2026-09-21 refactor: remove tool claim tracking and alerting' (removal) and '9fcab38 2026-09-19 Record section 24' (addition); '## 26. The RAG' -> only 7262ff0.
~~~

### D-16 — partly by hand

**Where:** L3, L46, L2482, L2715-2722, L2732, L2736, L3005, L3077 vs L2780, L2949-2954

**The handoff says:** Trial counts and cell-A statistics: '87 trials' (L3, L46, L2482, L2715, L2949, L3005), 'cell D is empty after 97 trials' / 'Ninety-seven produced zero' (L2732, L2736, L3077), 'still empty after 100 trials' (L46), cell A 'n=37, disagreement 0.219' (L2719, L46, L3005).

**Reality:** The same section uses other numbers: 24.9.2 says cell A has 40 acceptances, mean 0.248, median 0.046, 9 of 40 above 0.6, and 24.9.5 splits 40 accept / 50 refuse = 90. The results file confirms 100 trials ran, 90 classified usable; A n=40 mean 0.2485, B n=47, C n=3, D none. So 87 and 97 are stale snapshots, 0.219 and n=37 are wrong for cell A, and 87, 97 and 100 contradict each other.

**Evidence (the finder's command or reading):**

~~~text
On PRE (the file is deleted on MAIN): git -C "$R" show 7f78b3f:experiments/results/refusal_disagreement.json | python -I (json) -> len(trials)=100; summary.n_trials=90; cells.A.disagreement_live {n:40, mean:0.2485, median:0.0463, above_0.6:9}; B n=47 mean 0.9778; C n=3 mean 0.9987; D null; auc_refusal_vs_acceptance.disagreement_live=0.9792. grep -n -E '(87|97|100)' on L46/L2715/L2732/L2949 shows the three counts.
~~~

### D-17 — finder only

**Where:** L46 (TL;DR), L3004-3008 and L3076-3080 (24.10), L2481-2486 (24.4 note)

**The handoff says:** TL;DR: 'Disagreement tracks stance, not error ... Whether the verifier was right does not move the score.' 24.10: 'This is the sharpest open question the project has ... Cell D is the whole remaining question'.

**Reality:** 24.9.5 (L2961-2963) concludes the opposite on what that result means: 'The 0.980 was an artifact, and 24.9's "disagreement tracks stance" was describing the behaviour of a planner comparison rather than a property of inter-agent disagreement', and AUC falls to 0.457. L43 of the same TL;DR says the entire measured performance was an artifact. Neither L46 nor the 24.10 standing facts nor the '24.4 Superseded in part by 24.9' note carry that caveat, so a reader of L46 or 24.10 is told the stance finding stands and that cell D matters.

**Evidence (the finder's command or reading):**

~~~text
sed -n '2959,2963p;43p;46p;3004,3008p;3076,3080p' SESSION_HANDOFF.md.
~~~

### D-18 — finder only

**Where:** L50 (TL;DR), L3237-3238 (26.1)

**The handoff says:** 'Seventh instance in this repo, and the first where the invented thing was telemetry rather than copy.'

**Reality:** 22.11 counts five rounds, and Section 23 (L2217-2219, L2387-2388) says '23.1-23.3 ... Rounds six and seven', so 26.1 would be the eighth or later. 'First where the invented thing was telemetry' is also contradicted by 22.4 (Telemetry Lab's generated grounding scores 0.96/0.38/0.74/0.88, random cost and tokens) and 22.5 (per-endpoint APM mock), and 23.1-23.2 (Datadog golden signals).

**Evidence (the finder's command or reading):**

~~~text
sed -n '2169,2171p;2217,2219p;2387,2388p;3237,3238p' SESSION_HANDOFF.md -> 'Five times now', 'produced the sixth and seventh', 'Rounds six and seven', 'seventh instance'.
~~~

### D-19 — by hand

**Where:** L41-42 (TL;DR) vs L2845-2856 (24.9.3)

**The handoff says:** '**10 of 34 paraphrases crossed the alert threshold their anchor did not**' followed by 'It is disagreement specifically.'

**Reality:** 24.9.3 says '10 of 34 paraphrase-signal pairs', and the table rows sum to 7 disagreement flips (1+3+1+2+0) plus 3 contradiction flips (refuse/google 3/6) = 10. Only 32 paraphrases carry a disagreement score (3+8+6+7+8). So 'of 34 paraphrases' mislabels the denominator and 'disagreement specifically' leaves out that 3 of the 10 flips are contradiction.

**Evidence (the finder's command or reading):**

~~~text
sed -n '2845,2856p' SESSION_HANDOFF.md (flipped column: 1/3, 3/8, 1/6, 2/7, 0/8, 0, 3/6); sed -n '41,42p'.
~~~

### D-20 — finder only

**Where:** L3 (header 'Updated' chain)

**The handoff says:** The header chain is meant to say which sections each update covered (Sections 7-26).

**Reality:** It covers 7-13, 14-15, 16, 17, 18, 24, 26 and 24.8-24.9 only. Sections 19, 20, 21, 22, 23 and 25 appear in no 'Updated' entry, nor do 24.9.2-24.9.5 and 24.10. The 09-21 entry (Section 26) sits before the 09-20 entry (24.8-24.9), so the chain is out of date order. That reorder was introduced by P58, which inserted the Section 26 entry between the 09-19 and 09-20 entries. The 09-20 entry describes 87 trials and 'three analysis faults' and omits the AUC 0.980 to 0.457 finding that the TL;DR calls most consequential.

**Evidence (the finder's command or reading):**

~~~text
grep -o 'Updated:\*\* [0-9-]*' SESSION_HANDOFF.md -> 08-27, 08-28, 08-30, 08-31, 09-12, 09-19, 09-21, 09-20. git show 7f78b3f:SESSION_HANDOFF.md | sed -n '3p' | grep -o 'Updated:\*\* [0-9-]*' -> ends '09-19, 09-20' (no 09-21 entry on PRE). Section commit dates: 9fcab38 2026-09-19 (24), 62be27b 2026-09-20 (24.8-24.9), e0e037a 2026-09-20 (24.9.5), f5fe051 2026-09-21 (25), 7262ff0 2026-09-21 (26).
~~~

### D-21 — finder only

**Where:** L206 (Section 6 intro)

**The handoff says:** 'The recommendation given to the user, and the reasoning, is in Section 9. Short version:'

**Reality:** Section 9 (L287-299) is the drift documentation defect. It contains no recommendation or reasoning for next steps, and Section 6's own list is the only place that content lives.

**Evidence (the finder's command or reading):**

~~~text
sed -n '206p;287,299p' SESSION_HANDOFF.md.
~~~

### D-22 — finder only

**Where:** L264 (Section 8) and L415 (Section 11)

**The handoff says:** L264: 'No competitor product has ever been installed or run. This is the weakest link ... and is why Section 6 item 2 exists.' L415: 'Config D's standing is questionable (Section 6 item 7).'

**Reality:** Section 6 item 2 is 'Test the tool-claim validator on the external corpus' (L209). The competitor-install item is item 4 (L211). Item 7 is 'Decide what to do with the uncommitted dashboard work' (L214). The ablation re-run is item 8 (L215). The numbers appear to predate a renumbering.

**Evidence (the finder's command or reading):**

~~~text
sed -n '209p;211p;214p;215p;264p;415p' SESSION_HANDOFF.md.
~~~

### D-23 — finder only

**Where:** L1781 (21.7)

**The handoff says:** 'the adapter leaves it absent rather than guessing `normal` (see 4.4 and the rule in 21.3)'

**Reality:** No heading 4.4 exists (Section 4 has no numbered subsections), and nothing in Section 4 concerns driftStatus or the undefined-field rule. 18.2 holds the 'no baseline yet' drift-count fix and 21.3 is the rule.

**Evidence (the finder's command or reading):**

~~~text
Python -I heading extraction: numbered headings = {0..26, 12.1...}; no '4.x'. grep -n '4\.4' SESSION_HANDOFF.md at L1781 is the only reference. sed -n '171,195p' shows Section 4 bullets only.
~~~

### D-24 — finder only

**Where:** L2147 (22.10)

**The handoff says:** '`16 Swarms Active` | hardcoded -- the same defect as the "4 active swarms" fixed in `AgentsView` during 19.x'

**Reality:** The '4 active swarms' fix is documented in 20.1 (L1505, table row AgentsView.tsx:39). Section 19 covers PRs #4-#16, while 20.1 covers PRs #18 and #19.

**Evidence (the finder's command or reading):**

~~~text
sed -n '1487p;1505p;2147p;1217p' SESSION_HANDOFF.md.
~~~

### D-25 — finder only

**Where:** L2117-2118 (22.10) vs L2169-2171 (22.11)

**The handoff says:** 'The standing facts in 22.11 end by saying to expect a fifth.'

**Reality:** 22.11 does not end with that. Its first bullet now reads 'Five times now ... this list predicted the fifth and 22.10 found it the next day ... Expect a sixth'. 21.10 is the section that says 'expect a fourth'.

**Evidence (the finder's command or reading):**

~~~text
sed -n '2117,2118p;2169,2171p;1871p' SESSION_HANDOFF.md.
~~~

### D-26 — finder only

**Where:** L2633-2634 (24.7), L3068-3069 (24.10)

**The handoff says:** 24.7: '23.4 picked five free OpenRouter models, one family each, and recorded that all five reported zero pricing.' 24.10: 'The five OpenRouter model ids from 23.4 are all still live at zero prompt and completion pricing'.

**Reality:** 23.4 (L2275-2308) names no model ids, never mentions OpenRouter free models or pricing, and says only 'five agents, five different model families'. 24.10's 'still live' also reads against 24.7, where three of those five do not answer (Provider returned error x2, empty content x1) and the working set was replaced; 'live' is true only of catalogue presence at zero price.

**Evidence (the finder's command or reading):**

~~~text
sed -n '2275,2308p' SESSION_HANDOFF.md | grep -n -i -E 'free|pricing|:free|openrouter' -> only 'No adapter needed for OpenRouter, OmniRoute' (line 17 of the excerpt). sed -n '2637,2643p' shows 3 of 5 failing.
~~~

### D-27 — finder only

**Where:** L3058-3060 (24.10)

**The handoff says:** '`.venv/Scripts/uvicorn.exe` is stale ... which is the same staleness as the editable installs in Section 4.'

**Reality:** Section 4 says nothing about editable installs (that is 16.5/17.6/18.9/19.10/22.3). 22.3 also says the editables were reinstalled. MAIN's .claude/launch.json still launches the backend through `.venv/Scripts/uvicorn.exe`, the very shim 24.10 says exits 1 with no output. PRE used `python -m uvicorn`. So the repo's own dev-server config contradicts the instruction.

**Evidence (the finder's command or reading):**

~~~text
git -C "$R" show origin/main:.claude/launch.json -> '"runtimeExecutable": ".venv/Scripts/uvicorn.exe"'; git -C "$R" show 7f78b3f:.claude/launch.json -> '"runtimeExecutable": ".venv/Scripts/python.exe", "runtimeArgs": ["-m", "uvicorn", ...]'; git diff --stat origin/main HEAD -- .claude/launch.json -> empty. sed -n '171,195p' SESSION_HANDOFF.md has no 'editable'.
~~~

### E1 — by hand

**Where:** L3248-3252 (section 26.2) with L3242-3246 and L3270 ('model choices re-measured rather than carried forward')

**The handoff says:** Section 26.2 says app.py 'serves ... three agents on three models' and prints the first real turn as retriever mistralai/mistral-nemotron, verifier meta/muse-glimmer-30b, answerer deepseek-ai/deepseek-v4-flash. It says the choices were re-measured but never names the final set.

**Reality:** The AGENT_MODELS committed on P58 is retriever nvidia/nemotron-3-super-120b-a12b, verifier meta/muse-glimmer-30b, answerer nvidia/nemotron-3.5-lightning-30b-a3b. Only the verifier is shared with the printed first turn. The set printed in 26.2 was committed in fe3e30b and replaced in 7262ff0 (this PR's own docs commit). The 34-turn probe ran on the COMMITTED set (35 traces on it), not on the printed one; the first-turn set accounts for 1 trace. Nowhere does the handoff say which set is committed or which set the 34 turns used. The 26.2 volatility table also gives latencies only for models that are not in the committed set. For the committed answerer, 15 of its 35 probe spans took more than 75s (max 188s). The committed set has 2 owners (nvidia x2, meta), so the app.py comment at L88 'Three owners' is stale (it contradicts L98 'Two of these share the nvidia family').

**Evidence (the finder's command or reading):**

~~~text
Command: git -C <wt> diff fe3e30b 7262ff0 -- demo/chatbot/app.py -> '-    "retriever": "mistralai/mistral-nemotron",' / '+    "retriever": "nvidia/nemotron-3-super-120b-a12b",' / '-    "answerer": "deepseek-ai/deepseek-v4-flash-0731",' / '+    "answerer": "nvidia/nemotron-3.5-lightning-30b-a3b",'. sed -n 102,106p demo/chatbot/app.py shows the committed dict. sqlite (read-only copy of data/agentpulse.db, spans joined to traces where service_name='rag_chatbot'): 'retriever nvidia/nemotron-3-super-120b-a12b 21:15:59 .. 22:00:51' (35 spans), 'answerer nvidia/nemotron-3.5-lightning-30b-a3b 21:16:04 .. 22:01:03' (35), 'retriever mistralai/mistral-nemotron' (8 spans, 20:42-21:12, 6 of them errors), 'answerer deepseek-ai/deepseek-v4-flash-0731' (1 span).
~~~

### E4 — by hand

**Where:** L3229-3232 (section 26.1)

**The handoff says:** 'Verified with the backend deliberately stopped ... /chat and /corpus all return 500 through the new proxies and the UI reads "Cannot reach AgentPulse".'

**Reality:** Nothing in the RAG UI uses the /chat or /corpus proxies. RagApiClient builds absolute URLs from VITE_RAG_API_URL || 'http://localhost:8100' (ragApi.ts L14, L42, L55, L75), and app.py L122-123 and commit fe3e30b both say the frontend 'calls this service on an absolute URL rather than through vite's proxy'. The two proxy entries (vite.config.ts L37-38) are dead config for the RAG page, and they read a different variable (VITE_CHATBOT_API) than the client (VITE_RAG_API_URL). 'Cannot reach AgentPulse' is produced only by useTelemetry/App.tsx (the /v1 views), not by the RAG page. With the chatbot down the RAG page shows ragStatus 'unreachable' and, via getCorpus(), a hardcoded list of six invented document titles (see E5). The sentence reads as if the proxy path proves the RAG screen is honest.

**Evidence (the finder's command or reading):**

~~~text
Command: grep -rn "['\"`]/chat\|['\"`]/corpus" dashboard/src -> no relative /chat or /corpus fetch; only ragApi.ts `${this.baseUrl}/corpus` and `${this.baseUrl}/chat`. grep -rn 'Cannot reach AgentPulse' dashboard/src -> 'src/App.tsx:365' and 'src/lib/useTelemetry.ts:116-117' only. vite.config.ts L36-38 proxy keys '/v1', '/chat', '/corpus'.
~~~

### E5 — by hand

**Where:** L3202-3232 (section 26.1) 'All four removed'

**The handoff says:** After removing the four listed mechanisms an unreachable backend no longer produces invented content on the RAG screen.

**Reality:** Three more invention paths remain on P58 and MAIN. (1) ragApi.ts L16-23 defines DEFAULT_CORPUS_DOCUMENTS (six titles such as 'Multi-Version Concurrency Control (MVCC)...' and 'B-Tree Page Splitting...'), getCorpus() returns it when /corpus is unreachable (L53-63) and RagChatbotApp L88 seeds corpusDocs with it, so the Corpus modal lists six invented documents when the chatbot is down; only 1 of 6 matches the real corpus (Attention Is All You Need, DeBERTa, SQLite WAL, KB-401, KB-429, Telemetry KPI). (2) ChatConsole.tsx L491-493 hardcodes the in-flight stage models as mistralai/mistral-nemotron, google/gemma-4-31b-it (the model 26.2 says hangs and was replaced) and deepseek-v4-flash-0731, none of which is what app.py runs; these are the same three the removed mock /chat returned. (3) RagChatbotApp L261-262 advance the displayed stage with timers (verifier at 8s, answerer at 25s) regardless of what the backend is doing, and ChatConsole L485 says 'Turns take 30-120s' while 26.4 measured 9-247s.

**Evidence (the finder's command or reading):**

~~~text
Commands: sed -n 14,23p and 53,63p dashboard/src/lib/ragApi.ts; sed -n 88p dashboard/src/components/rag/RagChatbotApp.tsx -> 'useState<string[]>(DEFAULT_CORPUS_DOCUMENTS)'; sed -n 490,494p dashboard/src/components/rag/ChatConsole.tsx -> "model: 'google/gemma-4-31b-it'"; grep -n 'setTimeout(() => setActiveStage' RagChatbotApp.tsx -> L261 '8000', L262 '25000'. All of these are present on origin/main too.
~~~

### E6 — finder only

**Where:** L3266-3270 (section 26.2) and L3342-3344 (26.4)

**The handoff says:** 'Two consequences were engineered for: a 75s request timeout, because the three calls are sequential so a hung provider takes the whole turn and shows as a spinner'.

**Reality:** 75s is a per-attempt read timeout, not a cap on a call. The OpenAI client is built with default max_retries=2 (app.py L163 passes none; installed openai DEFAULT_MAX_RETRIES = 2) and retries timeouts, so a hung provider holds a call for about 226s, and a turn for up to roughly 3x that. In the recorded run 16 SUCCESSFUL spans took longer than 75s (max 188s; 15 of them the answerer) and all three timeout failures ended at 226.4-226.8s. This is also why 26.4's 247s worst turn exists. The timeout bounds the spinner far less than the sentence implies, and the 'one timed out' turn cost 226s for that span alone.

**Evidence (the finder's command or reading):**

~~~text
Command: venv python -I -c "import openai._constants as c; print(c.DEFAULT_MAX_RETRIES)" -> 'DEFAULT_MAX_RETRIES = 2'; openai/_base_client.py L1088-1096 'except timeout_exceptions(): if remaining_retries > 0: _sleep_for_retry ... continue'. DB: error spans 'f772ac7f retriever 226.8 APITimeoutError: Request timed out.', 'fd30acb1 ... 226.7', 'b6293bd5 answerer 226.4'; 'successful rag spans over 75s: 16', max successful latency 188.05s.
~~~

### E7 — by hand

**Where:** L3308-3317 (section 26.3) and L49 (TL;DR)

**The handoff says:** 'The verifier detected it, and detected it correctly. Its mean rose from 0.306 to 0.396 across the boundary' with '17/17 above the 0.30 threshold'.

**Reality:** The data are right but the interpretation is stronger than the run supports. (a) The pre-switch mean 0.306 is itself above the 0.30 alert threshold, and 7 of the 11 pre-switch windows were above 0.30; a DRIFT_DETECTED alert for the verifier fired at 21:34:02 (distance 0.378), seven minutes before the first off-corpus question (21:41:27), and was never mentioned. A threshold test therefore does not separate before from after. (b) The series is a slow climb 0.182 -> 0.378 during the on-corpus half and keeps rising (0.351 -> 0.366 -> ... -> 0.426); there is no step at the boundary. (c) With mean_window=12 the first 11 'after' windows still contain 1-11 on-corpus outputs; only the last 6 are pure off-corpus. (d) The verifier's 20-sample baseline pool is not on-corpus chatbot output: the first 20 verifier drift rows come from multi_model_demo (12) and default (8) services dated 2026-09-18/19/20, so 'before' measures old-pipeline baseline versus chatbot text. The answerer's baseline is the first 20 chatbot answerer spans. 'One agent detected one shift' overstates what one rising series can show.

**Evidence (the finder's command or reading):**

~~~text
sqlite (read-only copy): verifier window values in time order: 21:29 0.182, 0.224, 21:32 0.295, 0.261, 21:33 0.378, 0.339, 0.324, 0.331, 0.339, 0.336, 21:39 0.351 | 21:41 0.366, 0.345, 0.38, ... 0.426 (21:49), 0.389, 0.404 (22:00). 'verifier before (11, 0.3054..., 7, 0.1818, 0.378)' where the third field is the count above 0.30. Alerts: "DRIFT_DETECTED verifier 2026-09-20 21:34:02.979140 Drift detected for agent 'verifier': distance=0.378 (threshold=0.3)" and 21:49:16 (0.408). First-20 drift rows by trace service_name: verifier {'multi_model_demo': 12, 'default': 8}, retriever {'multi_model_demo': 14, 'rag_chatbot': 6}, answerer {'rag_chatbot': 20}. First off-corpus turn f124959e started 21:41:27.
~~~

### E8 — by hand

**Where:** Section 26 as a whole: L3204-3232 ('All four removed, mockData.ts deleted'), L3242 ('demo/chatbot/app.py serves the contract'), L3329-3337

**The handoff says:** Present or completed-action statements about the repo: the four mechanisms are removed, mockData.ts is deleted, demo/chatbot/app.py serves the contract.

**Reality:** All true only on PR #58 (fix/no-mock-fallback). Section 26 never mentions the PR or branch. On origin/main (e31fb58) demo/chatbot/ does not exist, vite.config.ts still registers agentpulse-mock-api, mockData.ts exists, useTelemetry.ts still falls back to MOCK_* and reports connected, and RagChatbotApp still simulates on !ragStatus.ok and invents a Math.random trace id. A reader landing on main sees the opposite of what 26.1 says was done.

**Evidence (the finder's command or reading):**

~~~text
Commands: git ls-tree -r origin/main --name-only | grep -c '^demo/chatbot/' -> 0; git ls-tree -r origin/main --name-only | grep mockData -> dashboard/src/lib/mockData.ts; git show origin/main:dashboard/vite.config.ts | grep -n agentpulse-mock-api -> '19:    name: 'agentpulse-mock-api','; grep -n '#58\|no-mock-fallback' SESSION_HANDOFF.md -> no output.
~~~


## stale

### B1-03 — partly by hand

**Where:** L46 (section 0), L2482 (24.4 banner), L2715-2724 (24.9), L2749-2750 (24.9.1), L3005 and L3026 (24.10)

**The handoff says:** Headline experiment numbers presented as current: '87 trials', cell A n=37 with mean 0.219, AUC 0.980, analyst-pair AUC 0.645

**Reality:** All of these belong to the superseded 4af29c2 snapshot (97 rows, 87 scorable). The committed data at PRE (046a655 = 7f78b3f) has 100 rows, 90 scorable, cell A n=40 mean 0.2485, AUC 0.9792, analyst-pair AUC 0.6495, contradiction AUC 0.9605. A reader recomputing from the data file at PRE gets 90 / 40 / 0.248 / 0.979 / 0.650, not 87 / 37 / 0.219 / 0.980 / 0.645. '87' is also not a trial count at any snapshot: it is the scorable subset of 97 rows.

**Evidence (the finder's command or reading):**

~~~text
git show 4af29c2:experiments/results/refusal_disagreement.json | python -I -c <recompute> -> 'TOTAL rows 97', 'scorable 87 unscorable 10 Counter({token bucket rate limiter backoff: 10})', cell A 'n': 37 'mean': 0.219, auc disagreement_live 0.9797 analyst_pair 0.6449 contradiction 0.9573. Same on 7f78b3f -> 'TOTAL rows 100', 'scorable 90', cell A 'n': 40 'mean': 0.2485 'median': 0.0463 'above_0.6': 9, auc 0.9792 / 0.6495 / 0.9605; 'STORED summary n_trials/usable/unclear: 90 90 0'. git rev-parse 7f78b3f:... and 046a655:... both = dd37ff8..., 4af29c2 blob = 92ed2a0.... REFUSAL_DISAGREEMENT_REPORT.md at 7f78b3f says 'Trials: 90 (90 usable, 0 excluded...)' and AUC '0.9792' / '0.6495'.
~~~

### C08 — by hand

**Where:** L13 (TL;DR) and L179 (section 4)

**The handoff says:** '209/209 tests passing (pytest tests/ -q ...)' ; 'Test suite: pytest tests/ -q - 209/209 passing as of 2026-08-28. Runtime ~2m30s'

**Reality:** The count is superseded by the document's own later sections (269 at L1612 s20.5; 260 collected after the editable reinstall at L1952 s22.3, L1895 s22). Statically, main/PR #58 contain 258 `def test_` in 22 test files (PRE had 267 in 24; e31fb58 deleted tests/test_alerting.py (4) and tests/test_tool_claim_coverage.py (5)). The command as written is also wrong: bare `pytest` resolves to the system Python (which lacks sqlmodel) and .venv/Scripts/pytest.exe exits 1 silently.

**Evidence (the finder's command or reading):**

~~~text
`for r in 7f78b3f origin/main origin/fix/no-mock-fallback; do git grep -h -E "^\s*(async )?def test_" $r -- tests | wc -l; done` -> 267, 258, 258. `git diff --name-status 7f78b3f origin/main -- tests` -> `D tests/test_alerting.py`, `D tests/test_tool_claim_coverage.py`. `which pytest` -> `<local path>`; system python: sqlmodel spec False. `./.venv/Scripts/pytest.exe --version; echo $?` -> exit 1.
~~~

### C10 — partly by hand

**Where:** L39 (TL;DR, section 0)

**The handoff says:** 'Repo pushed through commit 3cd1080; working tree clean, origin/main in sync.'

**Reality:** main is e31fb58, 150 commits past 3cd1080 (2026-08-28). Three PRs are open (#56, #57, #58).

**Evidence (the finder's command or reading):**

~~~text
`git rev-list --count 3cd1080..origin/main` -> 150. `gh pr list --state all` -> 58 PRs, 55 MERGED, 3 OPEN (56 fix/grounding-truncation-visible, 57 docs/handoff-25-5, 58 fix/no-mock-fallback).
~~~

### C13 — partly by hand

**Where:** L38 (TL;DR, section 0); L902, L922 (section 16.7)

**The handoff says:** 'Design direction is frozen in bedhi_frontend.md'

**Reality:** The file no longer exists on main or PRE. It was deleted by c6198e3 (2026-09-14, 'drop the agent prompts').

**Evidence (the finder's command or reading):**

~~~text
`git ls-tree -r --name-only origin/main | grep -i bedhi` -> no output. `git show --stat --format= c6198e3 | grep -i bedhi` -> ` bedhi_frontend.md | 871 ----`.
~~~

### C14 — finder only

**Where:** L5 (header); also L3058-3060 (section 24) 'the same staleness as the editable installs in Section 4'

**The handoff says:** 'the venv's editable installs still point at the old path' (and Section 4 is said to describe it)

**Reality:** Superseded by Section 22.3: both editable installs were reinstalled on 2026-09-17 and now resolve to the current checkout. What is still stale is the console-script .exe shims. Section 4 itself says nothing about editable installs, so the L3060 cross-reference points at nothing. Related worktree trap: from a worktree the venv's `app`/`agentpulse` resolve to the MAIN checkout, not the worktree.

**Evidence (the finder's command or reading):**

~~~text
`cat .venv/Lib/site-packages/_editable_impl_agentpulse_backend.pth` -> `<repo>` (mtime 2026-09-17 12:45). `python -I -B -c "import importlib.util as u; print(u.find_spec('app').origin)"` -> `...\Agentpluse\backend\app\__init__.py`. From the PR #58 worktree: `python -B -c 'import app; print(app.__file__)'` -> `<repo>` (main checkout). `grep -n -i editable` on lines 171-194 -> no hit.
~~~

### C17 — finder only

**Where:** L210 (section 6 item 3)

**The handoff says:** 'Redesign tool-claim extraction - attempted and blocked on labelling, not engineering ... Restarting it means first making the labelling question well-posed (12.4), not rewriting the extractor.'

**Reality:** Overtaken by later sections and by e31fb58. 18.4 shipped an ingest-path fix (extract_result_count). 25.3 shows COUNT_PATTERNS is digit-only and extracts a count from 0 of 9 real outputs once the demo's dictated sentence is removed, which contradicts 'not rewriting the extractor'. On main, e31fb58 removed Evaluation.tool_claims_found, migration a7f2c3d9e104 and tests/test_tool_claim_coverage.py, so the coverage work from PR #55 is gone.

**Evidence (the finder's command or reading):**

~~~text
SESSION_HANDOFF.md L3140-3160 (25.3): 'COUNT_PATTERNS is digit-only, so "three documents" does not match'. `git cat-file -e origin/main:backend/migrations/versions/a7f2c3d9e104_add_tool_claims_found_to_evaluations.py` and `...:tests/test_tool_claim_coverage.py` -> both missing (present on 7f78b3f). `git diff 7f78b3f origin/main -- backend/app/models.py` removes `tool_claims_found: Optional[int] = None`.
~~~

### C18 — finder only

**Where:** L214 (section 6 item 7)

**The handoff says:** 'reviewed and checkpointed (8a93558) with three known gaps recorded - see Section 15.'

**Reality:** The three gaps (hardcoded drift series, datasets table, stale experiments configs) were closed in Section 16 (TL;DR L26) and the dashboard was then replaced wholesale in 18.2, so the gaps no longer exist as described. Item 7 reads as if they are still open.

**Evidence (the finder's command or reading):**

~~~text
TL;DR L26: 'the three Section 15.4 gaps are closed - drift, datasets and experiments all read live endpoints now. Section 16.' L30: 'The dashboard was replaced wholesale ... Section 18.2.'
~~~

### C19 — finder only

**Where:** L215 (section 6 item 8) and L47 (TL;DR)

**The handoff says:** 'Re-run ablation Configs D, E and F. Still open, and now more stale: ablation_results.json is dated 2026-08-23'

**Reality:** Done 2026-09-18 (9cd0819); 24.5 found every classification bit-identical and recorded the limitation. Item 8 is still unstruck. Second-order: e31fb58 reverted the artifacts on main, so ablation_results.json is dated 2026-08-23 again (original latencies), THRESHOLD_ANALYSIS.md is reverted, and the 24.5 limitation text ('ceiling a signal reaches when fed correct inputs') was deleted from experiments/ablation.py. 24.5 says it is 'Recorded in the limitations, in the template in ablation.py', which is false on main and PR #58.

**Evidence (the finder's command or reading):**

~~~text
`git show 7f78b3f:experiments/results/ablation_results.json | grep -n timestamp` -> `2026-09-18 17:34:03 UTC`; `git show origin/main:...` -> `2026-08-23 17:56:09 UTC`. `git diff 7f78b3f origin/main -- experiments/ablation.py` removes the bullet '**This study does not exercise the production ingest path, and Config D is the clearest case.**'. `git log -3 origin/main -- experiments/results/ablation_results.json` -> e31fb58, 9cd0819, 73b533f.
~~~

### C20 — finder only

**Where:** L216 (section 6 item 9)

**The handoff says:** 'the standing gradient-text hook suppression (Section 2) ... one-line user decisions away'

**Reality:** Moot. No `wordmark-gradient` or `gradient-text` exists anywhere in dashboard/src on main or PRE (the dashboard was replaced in 18.2). The branch/PR half is answered (C11).

**Evidence (the finder's command or reading):**

~~~text
`git grep -n -c "wordmark-gradient\|gradient-text" origin/main -- dashboard/src` -> no output; same on 7f78b3f.
~~~

### C23 — finder only

**Where:** L221-222 (section 6, What is actually next 2 and 3); L224

**The handoff says:** '2. Dashboard, last - the remaining work ... 3. The disagreement research question: how to distinguish true contradiction from legitimate disagreement caused by partial evidence (14). Do not improve claim extraction before answering it.'

**Reality:** Both are overtaken. The dashboard was unfrozen (16), replaced and wired to the live API (18.2), de-faked in 21-23 and 26.1; it is not 'the remaining work'. The disagreement thread was re-diagnosed in 24.9.4-24.9.5: the first problem is the malformed comparison (planner questions vs a statement), not evidence partition, and Cell D of the 2x2 is still empty (24.9, L46). The list also omits what later sections left open: input_truncated is not stored on the evaluation row (25.2; PR #56), 25.5/25.6 (PR #57), the retriever/answerer before/after drift run without a restart (26.4), and the SDK discarding spans silently from sync callers (24).

**Evidence (the finder's command or reading):**

~~~text
SESSION_HANDOFF.md L26, L30, L43-L46, L3074-3085 ('Open, and the reason this section stops where it does'), L3105-3115 (25.2 'One gap worth closing regardless'), L3346 ('Open: the retriever and answerer still have no before/after comparison'). `gh pr list` -> #56 'Record whether a grounding score was computed on truncated evidence', #57 'Record 25.5 and 25.6'.
~~~

### D-08 — partly by hand

**Where:** L13 (TL;DR), L179 (Section 4)

**The handoff says:** '**209/209 tests passing** ... was 130 before the productization arc'; Section 4: '209/209 passing as of 2026-08-28'.

**Reality:** The document's own later sections give other totals: 226 (L1389, 19.6), 237 (L1571, 20.3), 269 (L1612, 20.5, apparently 237 backend + 32 dashboard), and 'Backend 260 passed, dashboard 32 passed' (L1895), with 253 -> 260 (L1952) after a broken editable install hid two files (22.3). 22.11 warns that earlier quoted counts were over a reduced suite. Neither the TL;DR nor Section 4 was updated. Static count on MAIN is 258 test functions (267 on PRE), and e31fb58 deleted two test files.

**Evidence (the finder's command or reading):**

~~~text
grep -n -i -E '[0-9]+ ?(/ ?[0-9]+)? (tests|passed|passing)|suite is' SESSION_HANDOFF.md -> L13 '209/209', L179 '209/209', L1389 'suite is **226**', L1571 '237 automated tests', L1612 'the 269 tests', L1895 'Backend 260 passed', L1952 'Collection went 253 -> 260'. for r in 7f78b3f origin/main origin/fix/no-mock-fallback: git -C "$R" grep -h -E '^\s*(async )?def test_' $r -- 'tests/*.py' | wc -l -> 267, 258, 258 (24, 22, 22 files).
~~~

### D-09 — partly by hand

**Where:** L39 (TL;DR)

**The handoff says:** 'Repo pushed through commit `3cd1080`; working tree clean, `origin/main` in sync.'

**Reality:** 3cd1080 is the 2026-08-28 health/readiness commit. origin/main is e31fb58 (2026-09-21), 150 commits later.

**Evidence (the finder's command or reading):**

~~~text
git -C "$R" log -1 --format='%h %ad %s' --date=short 3cd1080 -> '3cd1080 2026-08-28 Health/readiness...'; git -C "$R" rev-list --count 3cd1080..origin/main -> 150; git log -1 origin/main -> 'e31fb58 2026-09-21 P.Somnath Reddy refactor: remove tool claim tracking and alerting'.
~~~

### D-10 — finder only

**Where:** L215 (Section 6 item 8), L218-222 ('What is actually next')

**The handoff says:** Item 8 'Re-run ablation Configs D, E and F. Still open, and now more stale' (not struck through). 'What is actually next' says capability tiers are 'a re-confirm or a skip' because 'Nothing measured since has changed them', and 'Dashboard, last — the remaining work'.

**Reality:** 24.5 (L2580-2590) re-ran the whole ablation and found it bit-identical, so item 8 is closed. 24.9.5, 25 and 14 materially change the disagreement and tool-claim tiers. The dashboard was replaced wholesale in 18.2 and reworked through 21-23 and 26.

**Evidence (the finder's command or reading):**

~~~text
sed -n '215p;220,222p' SESSION_HANDOFF.md -> 'Re-run ablation Configs D, E and F. Still open' / 'Nothing measured since has changed them' / 'Dashboard, last — the remaining work'. sed -n '2580,2582p' -> 'Next-steps item 8 assumed ... Re-ran the whole study: every classification is bit-identical to 2026-08-23.'
~~~

### D-11 — finder only

**Where:** L297 and L299 (Section 9) vs L213 (Section 6 item 6)

**The handoff says:** Section 9: '`DRIFT_EXPERIMENT_REPORT.md` §3 still carries the wrong sentence and **should be corrected** — the only drift doc item still outstanding' and 'Running that script silently reverts commit `19cde3a`... If you re-run it, restore the report afterwards'.

**Reality:** Section 6 item 6 (L213) says the premise was wrong, §3 was already correctly scoped, and the regeneration hazard was fixed in 78697c5 (also 15.1 'report-regeneration hazard removed'). The heading says 'historical', but the body is written in present tense and instructs the reader to act.

**Evidence (the finder's command or reading):**

~~~text
sed -n '213p' SESSION_HANDOFF.md -> '~~Correct DRIFT_EXPERIMENT_REPORT.md §3~~ — investigated, and the premise was wrong ... Fixed in `78697c5`'. git -C "$R" log -1 --format='%h %ad %s' --date=short 78697c5 -> '78697c5 2026-08-27 Stop drift_scenarios.py from overwriting the curated drift report'. git grep -n '1-2 spans' origin/main -- experiments/drift_scenarios.py -> no match.
~~~

### D-12 — finder only

**Where:** L98-114 (Section 2 'READ THIS FIRST'), L138-142 ('Still open (category C)')

**The handoff says:** 'READ THIS FIRST (2026-08-27): there is substantial uncommitted dashboard work in the tree ... Do not commit it blind', plus an open list of fake surfaces: trace waterfall, replay debugger, DatasetsView stale count.

**Reality:** Section 6 item 7 (L214), 15.1 and Phase 0 say it was reviewed and checkpointed in 8a93558; 16.1 closes the DatasetsView gap; 18.2 replaced the dashboard wholesale. The banner is the first thing a reader meets in Section 2, and it is wrong.

**Evidence (the finder's command or reading):**

~~~text
sed -n '214p' SESSION_HANDOFF.md -> '~~Decide what to do with the uncommitted dashboard work~~ — reviewed and checkpointed (`8a93558`)'; sed -n '722p' -> '| Phase 0 freeze | `8a93558` ... dashboard checkpointed'; sed -n '787,791p' -> '16.1 The three Section 15.4 gaps are closed ... DatasetsView calls /v1/datasets'.
~~~

### D-13 — finder only

**Where:** L5 (header); also L883, L1027-1029, L1198-1200, L1459-1461

**The handoff says:** 'the venv's editable installs still point at the old path' (and 16.5/17.6/18.9/19.10 'Fix with pip install -e backend -e sdk', 'Every command still needs PYTHONPATH').

**Reality:** 22.3 reinstalled both editables ('Collection went 253 -> 260'), and the installs now point at the real checkout. 22.11 never lists the earlier 'still true' entries as closed, so four sections still tell the reader to use the PYTHONPATH workaround.

**Evidence (the finder's command or reading):**

~~~text
cat .venv/Lib/site-packages/agentpulse-0.1.0.dist-info/direct_url.json -> {"dir_info": {"editable": true}, "url": "file:///C:/MLOPs/3rd%20sem%20project/Agentpluse/sdk"}; agentpulse_backend-0.1.0.dist-info -> .../Agentpluse/backend. sed -n '1952p' SESSION_HANDOFF.md -> 'Reinstalled both editable against the real checkout. Collection went 253 -> 260.'
~~~

### D-14 — finder only

**Where:** L19 and L21 (TL;DR)

**The handoff says:** 'Inter-agent disagreement engine rebuilt and wired into production this session — the project's largest claim-vs-reality gap is closed. See Section 7.' and 'defensible niche ... is now two'.

**Reality:** Written for 2026-08-27 ('this session'). Sections 14, 24.9.5 and 25.4 show disagreement detected 0 of 10 external contradictions and that its measured performance was an artifact. So the 'gap is closed' bullet and the 'two surviving signals' count are contradicted by L14, L43-44 and L3181 in the same TL;DR.

**Evidence (the finder's command or reading):**

~~~text
sed -n '19p;21p;43p' SESSION_HANDOFF.md; sed -n '3181,3184p' -> 'Two of four have performance that comes from the harness rather than the signal'.
~~~

### D-15 — finder only

**Where:** L418-419 (Section 11)

**The handoff says:** '`COMPETITIVE_POSITIONING.md` §5.1 presents deterministic tool-claim validation as a live differentiator... The section needs revisiting ... It has not been edited yet.'

**Reality:** 13.3 (L595) and TL;DR L23 say §3, §5.1, §5.4 and §9 were all revised after the audits.

**Evidence (the finder's command or reading):**

~~~text
sed -n '418,419p;595,596p;23p' SESSION_HANDOFF.md.
~~~


## minor

### B1-13 — finder only

**Where:** L2869-2872 (section 24.9.3)

**The handoff says:** 'Across all 34 it does not hold' and, within one anchor, paraphrases opening 'Indeed' or 'The evidence' 'scored ~0.02'

**Reality:** Only 32 paraphrases were scored; the first-word groups sum to 18 + 8 + 5 + 1 = 32. Within the google-accept anchor the three 'Indeed' paraphrases score 0.0127, 0.2227, 0.0192, so one is 0.22, not ~0.02. The conclusion is unaffected.

**Evidence (the finder's command or reading):**

~~~text
first-word grouping of kept variants in paraphrase_stability.json at 7f78b3f: 'the n=18', 'indeed n=8', 'certainly n=5', 'here n=1'; 'anchor 2 google accept indeed [0.0127, 0.2227, 0.0192]'.
~~~

### B1-14 — finder only

**Where:** L2794 (24.9.2) vs L2850 (24.9.3)

**The handoff says:** The same stored score (meta/muse-glimmer-30b, transformer query, disagreement 0.0075) is written '0.007' at L2794 and '0.008' at L2850

**Reality:** One stored value (0.0075) rounded two ways.

**Evidence (the finder's command or reading):**

~~~text
refusal_disagreement.json at 7f78b3f: meta r0 'disagreement_live' 0.0075; paraphrase_stability.json anchor 'disagreement': 0.0075.
~~~

### B1-15 — finder only

**Where:** L2727-2729 (24.9), L46

**The handoff says:** 'A wrong refusal scores 0.999, fractionally above a correct one at 0.978'

**Reality:** True only by mean. Cell B's mean is pulled down by one 0.0 row (google, 'italian carbonara pasta recipe'); B's median is 0.9997 and C's is 0.9998, effectively a tie. The conclusion (no difference within refusals) stands, but the handoff itself warns at L3009 never to report a cell by mean alone.

**Evidence (the finder's command or reading):**

~~~text
7f78b3f recomputation: B disagreement_live 'median': 0.9997, 'mean': 0.9778, 'above_0.6': 46 (of 47); C 'median': 0.9998, 'mean': 0.9987; 'refusal rows <=0.6: [(0.0, google, italian carbonara pasta recipe)]'.
~~~

### B1-16 — finder only

**Where:** L2592-2593 (24.5), L47 (section 0)

**The handoff says:** 'Config D has shown parity with the best configuration for months'

**Reality:** The ablation file exists from 2026-08-23 and the re-run is dated 2026-09-18, about 26 days (the handoff elsewhere says 'a month apart').

**Evidence (the finder's command or reading):**

~~~text
git log --format='%h %ad %s' --date=short -- experiments/results/ablation_results.json: e83b783 2026-08-23 ... 9cd0819 2026-09-18.
~~~

### B3-14 — finder only

**Where:** L3160-3161 (section 25.3)

**The handoff says:** '"three documents" does not match while "3 documents" does'.

**Reality:** A bare '3 documents' does not match either. COUNT_PATTERNS also needs an adjacent verb: 'I retrieved 3 documents covering X.' matches; '3 documents', 'I used 3 documents covering X.', 'The 3 documents cover X.' and 'Retrieved 3 foundational papers.' all extract nothing. Digits are necessary, not sufficient (L1116-1119 already records the adjacency limit).

**Evidence (the finder's command or reading):**

~~~text
extract_claims on each string: '3 documents' -> []; 'I used 3 documents covering X.' -> []; 'The 3 documents cover X.' -> []; 'Retrieved 3 foundational papers.' -> []; 'I retrieved 3 documents covering X.' -> [('unknown', 3)]; 'I found 5 results' -> [('unknown', 5)].
~~~

### B3-15 — finder only

**Where:** L3312, L3317 (section 26.3)

**The handoff says:** Verifier before-switch mean 0.306.

**Reality:** The exact mean is 0.305459 (0.3055 at four decimals), which rounds to 0.305; 0.306 is a double-rounding artefact. The other means (0.396, 0.093, 0.502) and maxima round correctly.

**Evidence (the finder's command or reading):**

~~~text
Python: `before: n=11 mean=0.305459 min=0.1818 max=0.3780 above0.30=7`; after `mean=0.395702`; retriever after `mean=0.093379`; answerer after `mean=0.501834`.
~~~

### B3-16 — finder only

**Where:** L3297-3298 (section 26.3)

**The handoff says:** Block quote presented verbatim: "The current window is deliberately left empty: it holds the most recent outputs, and outputs from before a restart are no longer current."

**Reality:** Paraphrase inside quotation marks. The docstring reads 'The current window (`_recent_embeddings`) is deliberately left empty: it holds the most recent `mean_window` outputs, and outputs from before a restart are no longer "current". Re-warming those few samples is correct; re-warming the entire baseline from scratch was not.' The substance is unchanged, but the text is not verbatim and elisions are unmarked.

**Evidence (the finder's command or reading):**

~~~text
`git show origin/main:backend/app/services/drift.py | sed -n 474,481p`.
~~~

### B3-17 — finder only

**Where:** L3276-3330 (section 26.3), data source

**The handoff says:** The 26.3 measurements are 'drift, finally measured against real traffic' from the local database.

**Reality:** The database holding them (handoff-continuation-bb2790/data/agentpulse.db) is stamped alembic revision b8e4d1c72f35, a revision that exists only on P56 (it descends from a7f2c3d9e104, which MAIN removed). Neither main nor P58 contains that revision, so the stack documented on those branches cannot open or upgrade this database; its evaluations table also carries tool_claims_found, grounding_input_truncated and grounding_input_tokens columns that main's schema lacks. The handoff gives no pointer to the database or to this caveat.

**Evidence (the finder's command or reading):**

~~~text
DB `select * from alembic_version` -> [('b8e4d1c72f35',)]. `git grep -n -E '^revision' origin/main -- backend/migrations/versions/` lists 60a86ca23d8c, 8d86fee0d663, c4b7e91a2f08, 30ca7751ff88 only; origin/fix/grounding-truncation-visible additionally has a7f2c3d9e104 and b8e4d1c72f35_add_grounding_truncation_to_evaluations.py. `pragma table_info(evaluations)` includes tool_claims_found, grounding_input_truncated, grounding_input_tokens.
~~~

### C15 — finder only

**Where:** L173 (section 4)

**The handoff says:** 'Always invoke as ./.venv/Scripts/python.exe (git-bash on Windows; plain python hits system Python, missing kaggle etc.)'

**Reality:** The advice holds in the main checkout but fails in a worktree (relative path; worktrees have no .venv). The stated reason is stale: system Python now has kaggle and pytest; what it lacks is sqlmodel, so the backend and tests cannot import.

**Evidence (the finder's command or reading):**

~~~text
`ls .claude/worktrees/goofy-tharp-4a4214/.venv` -> `No such file or directory`. `python -B -c "import importlib.util as u; print(u.find_spec('kaggle') is not None, u.find_spec('pytest') is not None, u.find_spec('sqlmodel') is not None)"` -> `True True False` for sys.executable <local path>
~~~

### C16 — finder only

**Where:** L206 (section 6 preamble)

**The handoff says:** 'The recommendation given to the user, and the reasoning, is in Section 9.'

**Reality:** Section 9 is 'The drift documentation defect (historical)' and contains no recommendation. Section 8 L262 likewise says 'is why Section 6 item 2 exists' about the competitor-install gap, but item 2 is the tool-claim external test (the Phoenix audit is item 4).

**Evidence (the finder's command or reading):**

~~~text
`sed -n 287,301p SESSION_HANDOFF.md` -> heading '## 9. The drift documentation defect (historical ...)', body is the report-prose defect only. `sed -n 208,212p` -> item 2 = 'Test the tool-claim validator on the external corpus', item 4 = 'Install Phoenix'.
~~~

### C25 — finder only

**Where:** L194 (section 4)

**The handoff says:** 'requests without it get a 401 with no other clue.'

**Reality:** The 401 body carries a message.

**Evidence (the finder's command or reading):**

~~~text
backend/app/middleware.py: `return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})`.
~~~

### C26 — finder only

**Where:** L171-194 (section 4) - omission

**The handoff says:** Section 4 is presented as the complete list of commands for running the stack ('verified working, not re-derived').

**Reality:** It omits the RAG chatbot service that PR #58 adds and that the dashboard's /chat and /corpus proxies depend on (port 8100), the dashboard proxy targets/env (VITE_AGENTPULSE_API, VITE_CHATBOT_API), and the cwd/process rules from section 24 that only live at L3058-3067.

**Evidence (the finder's command or reading):**

~~~text
`sed -n 60,67p demo/chatbot/app.py` (PR #58) -> `python -m uvicorn demo.chatbot.app:app --port 8100`, needs NVIDIA_API_KEY, AGENTPULSE_ENDPOINT, AGENTPULSE_API_KEY, 'AgentPulse backend AND worker running'. `git show origin/fix/no-mock-fallback:dashboard/vite.config.ts` -> proxy '/v1' -> http://127.0.0.1:8000, '/chat' and '/corpus' -> http://127.0.0.1:8100.
~~~

### D-28 — finder only

**Where:** L563 (13.1), L51 and L3266 (quotes), L1883 (21.10)

**The handoff says:** L563: 'AgentPulse's own implementation measures F1 0.000 on real traces (§11)'. L51 and L3266: '24.7's "listed is not served"'. L1883: 'Still true from 20.5 ... dashboard tests still cover `lib/` only'.

**Reality:** F1 0.000 is reported in 12.1 (L458), and Section 11 reports only 'zero claims from 8,353 spans'. The quoted phrase 'listed is not served' appears nowhere in 24.7 (it appears only in L51 and L3266). The spirit matches 24.7, but the quote marks mislead. The 'dashboard tests cover lib/ only' item is in 19.10 (L1470), not 20.5.

**Evidence (the finder's command or reading):**

~~~text
grep -n '0\.000' SESSION_HANDOFF.md -> L23, L458, L562, none inside 383-440. grep -n -i 'listed is not served' -> L3266 only (L51 paraphrases). sed -n '1470p;1599,1616p'.
~~~

### D-29 — finder only

**Where:** L3 (header), L2217 (23 intro), L1895, L2415, L3194 vs headings L1889, L2215, L2414, L3194

**The handoff says:** Heading date stamps are consistent with neighbouring sections.

**Reality:** 22 is stamped (2026-09-17), but 22.10 says it was found 'one day later' and Section 23 (stamped 09-17/18) opens by following 22.11. 24 is stamped (2026-09-18/19), but 24.8-24.9.5 and 24.10 were committed 2026-09-20 (62be27b, 9e3df62, e0e037a). 26 is stamped (2026-09-20/21) and sits after 25 (2026-09-21), so the stamps run backwards. Sections 7, 8 and 9 carry no date at all.

**Evidence (the finder's command or reading):**

~~~text
git -C "$R" log --all -S'#### 24.9.5 The fix' --format='%h %ad' --date=iso -- SESSION_HANDOFF.md | tail -1 -> 'e0e037a 2026-09-20 02:57:37 +0530'; -S'## 25. The same test' -> 'f5fe051 2026-09-21 00:12:49 +0530'; -S'## 26. The RAG' -> '7262ff0 2026-09-21 03:49:53 +0530'; -S'### 22.10 Rehearsing' -> 'f7727bb 2026-09-17 16:34:22 +0530'. Heading extraction: L1889 '(2026-09-17)', L2215 '(2026-09-17/18)', L2414 '(2026-09-18/19)', L3089 '(2026-09-21)', L3194 '(2026-09-20/21)'.
~~~

### D-30 — finder only

**Where:** L27 and L828-830 vs L49 and L3341

**The handoff says:** TL;DR L27: 'blind for 32 spans per agent after every restart. Fixed and verified live.' L49: 'blind for 12 spans per agent after every restart.'

**Reality:** Both are right. 16.3 fixed the baseline pool, so 20+12=32 became 12 (the current pool, cold by design, per 26.3). But neither bullet nor 16.3 says so, so a reader sees 'fixed' and '12 spans of blindness' without the link.

**Evidence (the finder's command or reading):**

~~~text
sed -n '27p;49p;828,830p;3300,3303p' SESSION_HANDOFF.md.
~~~

### D-31 — finder only

**Where:** L11-52 (TL;DR) coverage

**The handoff says:** The TL;DR is the summary of the document.

**Reality:** No bullet points at Sections 19, 20, 21, 22 or 23 (public Azure deployment and the live URL, PRs #4-#35, the POST /v1/keys feature, the seven fabricated-claim rounds). L40 mentions '23.4' only as a name. The live URL appears only in 19.1 (L1223).

**Evidence (the finder's command or reading):**

~~~text
sed -n '11,52p' SESSION_HANDOFF.md | grep -c -E 'Section (19|20|21|22|23)' -> 0.
~~~

### D-32 — finder only

**Where:** Whole file (secrets guidance); L1734 (21.4); L176, L194

**The handoff says:** n/a. The question was whether the handoff tells the next reader that API keys pasted into chat sessions must be rotated, and whether it mentions .env.

**Reality:** It does not. The only 'rotat' hit is L280 ('auth is a single shared static key with no rotation'), which is about the product's auth. There is no secrets-handling section. `.env` is mentioned (L136, L176, L181, L194, L1173, L1264-1265, L2347, L2468-2472), but only as a gitignored file, a relative-path trap, a Docker COPY hazard, or an unloaded docstring promise, never with rotation or 'do not paste keys into chat' advice. L1734 prints a truncated, since-revoked console key ('ap_live_...'), which is harmless but the only key-shaped string in the file. Section 24 (NVIDIA/OpenRouter keys) and 23.5 (OmniRoute key minted from the dashboard) give no rotation note either.

**Evidence (the finder's command or reading):**

~~~text
grep -n -i 'rotat' SESSION_HANDOFF.md -> '280:- [ ] auth is a single shared static key with no rotation or tenancy'. grep -n -E '\.env' SESSION_HANDOFF.md -> L136, L176, L181, L194, L1173, L1264, L1265, L2347, L2468, L2470, L2472. grep -n 'ap_live' -> L1700, L1734 (truncated). git grep of strict key patterns on all refs -> no match (see confirmed).
~~~

### D-33 — finder only

**Where:** L1003-1006 (17.5)

**The handoff says:** n/a. A hygiene finding, not a claim.

**Reality:** The public repository's handoff prints a third party's personal email address (a gmail address) on L1005 as 'the email originally supplied'. It is on MAIN as well, and the repository has been public since 2026-09-12. It is not a secret, but it is gratuitous personal data in a public file.

**Evidence (the finder's command or reading):**

~~~text
grep -n -o -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' SESSION_HANDOFF.md -> '1005:<one gmail address>' (only match). git -C "$R" grep -c 'sahooamit' origin/main -- SESSION_HANDOFF.md -> 1 (no other file). gh repo view -> isPrivate false.
~~~

### E10 — finder only

**Where:** L3297-3298 (section 26.3)

**The handoff says:** Block quote presented as the code's own words: "The current window is deliberately left empty: it holds the most recent outputs, and outputs from before a restart are no longer current."

**Reality:** Not verbatim. drift.py load_window_baseline docstring (L480-483) reads: 'The current window (`_recent_embeddings`) is deliberately left empty: it holds the most recent `mean_window` outputs, and outputs from before a restart are no longer "current". Re-warming those few samples is correct; ...'. Meaning is the same; wording was condensed inside quotation marks.

**Evidence (the finder's command or reading):**

~~~text
Command: sed -n 476,487p backend/app/services/drift.py -> 'Only the baseline side is restored. The current window\n        (`_recent_embeddings`) is deliberately left empty: it holds the most\n        recent `mean_window` outputs, and outputs from before a restart are no\n        longer "current".'
~~~

### E11 — finder only

**Where:** L3266 (section 26.2); also L51 (TL;DR)

**The handoff says:** '24.7's rule was "listed is not served"'.

**Reality:** That phrase does not occur in 24.7 or anywhere else in the handoff except these two citations. 24.7 says the five models 'still existed in the catalogue at zero pricing' but three 'do not answer', and the standing fact is 23.6 'send one real request before building on a catalogue'. It is a paraphrase in quotation marks.

**Evidence (the finder's command or reading):**

~~~text
Command: grep -n -i 'listed is not served' SESSION_HANDOFF.md -> only L51 and L3266. 24.7 text at L2631-2661.
~~~

### E12 — finder only

**Where:** L3252 (section 26.2 first-turn block)

**The handoff says:** Answerer model printed as deepseek-ai/deepseek-v4-flash (also L3264).

**Reality:** The id actually called, recorded on the span and in fe3e30b's app.py, is deepseek-ai/deepseek-v4-flash-0731. The truncated id is not a model id this repo ever sent.

**Evidence (the finder's command or reading):**

~~~text
sqlite: 'answerer deepseek-ai/deepseek-v4-flash-0731 success 7501.12' (trace 8388a26c); git diff fe3e30b 7262ff0 shows '-    "answerer": "deepseek-ai/deepseek-v4-flash-0731",'.
~~~

### E13 — finder only

**Where:** L3245-3246 (section 26.2) 'Errors return 200 with `error` and whichever agents completed, with the real trace_id.'

**The handoff says:** Every error returns 200 with the real trace_id.

**Reality:** Only errors raised inside the try block (the three LLM calls). pulse.create_trace and local_retriever.search(req.message, top_k=3) run before the try (app.py L226, L262), so a retrieval/embedding failure becomes an HTTP 500 with a non-JSON body, which ragApi.sendChat then fails to parse (`await res.json()` at L84).

**Evidence (the finder's command or reading):**

~~~text
sed -n 262,266p demo/chatbot/app.py -> 'docs = local_retriever.search(req.message, top_k=3)' precedes 'try:' at L266.
~~~

### E14 — finder only

**Where:** L3204 (section 26.1) 'six components'; demo/chatbot/app.py L18-19

**The handoff says:** 26.1: the commit added 'six components'. app.py docstring: 'Thirty messages here takes about ten minutes.'

**Reality:** dashboard/src/components/rag/ holds five .tsx components (ChatConsole, ConnectionModal, CorpusModal, MonitoringPanel, RagChatbotApp) plus ragTheme.ts, which is a theme module. And the docstring's ten-minute estimate is contradicted by 26.3/26.4 (34 turns took 46 minutes; ~80s per turn).

**Evidence (the finder's command or reading):**

~~~text
ls dashboard/src/components/rag/ -> ChatConsole.tsx ConnectionModal.tsx CorpusModal.tsx MonitoringPanel.tsx RagChatbotApp.tsx ragTheme.ts; sed -n 17,19p demo/chatbot/app.py; DB: first probe span 21:16:29, last span end 22:02:31.
~~~

### E9 — finder only

**Where:** L3284-3290 (section 26.3 first table, columns 'drift rows' and 'with a window value')

**The handoff says:** Table placed directly under '34 turns' lists verifier 58, retriever 57, answerer 36 'drift rows'.

**Reality:** These are all-time totals in the shared DB, not rows produced by the 34 turns. Verifier 58 includes 16 rows dated 2026-09-18 and 2 on 2026-09-19 plus rows from the earlier multi-model demo; retriever 57 includes 14 from 2026-09-18. A reader would expect ~34 per agent. Only 'with a window value' and 'max' are all run-derived.

**Evidence (the finder's command or reading):**

~~~text
sqlite: verifier [('2026-09-18', 16, 0), ('2026-09-19', 2, 0), ('2026-09-20', 40, 28)]; retriever [('2026-09-18', 14, 0), ('2026-09-20', 43, 17)]; answerer [('2026-09-20', 36, 4)] (date, rows, rows with window value).
~~~
