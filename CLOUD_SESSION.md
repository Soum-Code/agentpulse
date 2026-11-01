# CLOUD_SESSION.md: what a cloud session should do

Written by the leader chat on 2 Nov 2026 for any Claude cloud session that picks up this
repository. The owner is Soum (M.Tech student). His final review is on **3 Nov 2026, 10 AM**.
The live site is https://agentpulse.centralindia.cloudapp.azure.com and is **frozen**: it works
and must not break.

## Read first

1. `SESSION_HANDOFF.md`, sections 29.16 to 29.20 (the current state).
2. `README.md`, `HOW_IT_WORKS.md`, `CODE_WALKTHROUGH.md`, `DEMO_GUIDE.md`.

## Rules (always)

- Never write an API key, token, password or hash into any file, commit, PR or message.
- You have no access to the Azure VM: do not try. Anything that needs the VM is listed below
  as "leader only".
- Open a pull request into `main` for every change. **Do not merge.** The owner and the leader
  merge after reading the diff.
- Every number you write needs a source in the repository (a results file, a report, a test
  run you did). Never invent a figure.
- Small commits, pushed often, so a usage stop loses nothing.

## Task 1: comment-only pass (most important, before the review)

Goal: the owner must be able to explain any file if an examiner asks.

Add a short plain comment where one is missing: above each function or class and above each
non-obvious block. House style: `# In short: ...` (Python) or `// In short: ...` (TypeScript),
1 to 3 lines of easy English that say what the block does and why. Read the code before you
describe it; do not restate the obvious line by line.

Order (stop cleanly when time runs out and say where you stopped):

1. `backend/app/main.py`, `middleware.py`, `config.py`
2. `backend/app/routers/ingest.py`, `routers/__init__.py` (traces and health), `routers/websocket.py`
3. `backend/app/services/grounding.py`, the drift code, `services/simulate_guard.py`,
   `services/job_queue.py`, `backend/app/worker.py`, `backend/app/models.py` (one line per table)
4. `demo/chat_server.py`, `demo/chat_guard.py`, `demo/chat_providers.py`
5. The SDK core in `sdk/src/agentpulse/`
6. `dashboard/src/App.tsx`, `lib/api.ts`, `lib/adapters.ts`, `lib/stateModel.ts`,
   `lib/traceStatus.ts`, `components/rag/ChatConsole.tsx`, the top-level functions of
   `components/product/TracesView.tsx`

**Comment-only means comment-only:** no change to code, strings, imports or formatting. Prove it:

- Python: `ast.dump()` of every changed file is identical before and after.
- TypeScript: `cd dashboard && npm ci && npx tsc --noEmit && npx vitest run` passes with the same
  test count as before.
- Backend: `python -m pytest tests -q` passes with the same count as before.

Put the proof (commands and counts) in the PR body. PR title: "Comment-only pass for the viva".

## Task 2: a one-page code tour

Write `docs/CODE_TOUR.md`: the path of one span from the SDK to the screen, with file names:
SDK call, `POST /v1/ingest`, the evaluation queue, the worker, grounding (NLI) and drift
(embeddings), alerts, the API the dashboard reads, the dashboard view. One page, easy English,
so the owner can read it in five minutes before the review. Same PR as task 1, or its own PR.

## Leader only (a cloud session must NOT do these)

- Anything on the Azure VM (`.env`, containers, Caddy, backups).
- Merging pull requests and watching deploys.
- The release `viva-1.0` (commands are in `docs/FREEZE_COMMANDS_2026-11-01.md`).

## When you finish

Write a short summary at the top of your PR: what was done, the proof, and what was not done.

## Ready-to-paste prompt (copy this into a new cloud session)

```
Read CLOUD_SESSION.md in this repository and follow it. Do task 1 (comment-only pass) and
task 2 (docs/CODE_TOUR.md). Explain the code in SIMPLE one-line comments in easy English,
like you are telling a friend what the block does and why, for example:
  # In short: saves the spans and puts one scoring job per span on the queue.
  // In short: turns the API's trace into the shape the Traces view draws.
One line per function or block is best; use two or three only when one line cannot say it.
Prove the change is comment-only (ast.dump identical for Python; tsc, vitest and pytest pass
with the same counts) and put the proof in the PR. Open ONE pull request into main, do not merge.
```

## Negative prompt (what NOT to do)

```
Do NOT change any code, logic, variable name, string, import, test or formatting.
Do NOT reformat files, sort imports, fix lint, or "improve" anything while you are there.
Do NOT write long paragraphs, jargon, marketing words or emojis in comments.
Do NOT explain obvious lines one by one (no "# increment i by 1").
Do NOT guess what code does: read it first; if unsure, leave it uncommented.
Do NOT invent numbers, results, or claims that are not in the code or the repo's documents.
Do NOT touch .env files, keys, tokens, passwords, the Azure VM, or deploy settings.
Do NOT merge the pull request, push to main, or delete any branch.
Do NOT add new files except docs/CODE_TOUR.md.
```
