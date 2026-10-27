# AgentPulse v1.0-viva

The version submitted for the M.Tech viva (3-4 November 2026). A research prototype, not a
production product: the SDK's package version stays 0.1.0.

Commit: <SHA>   (fill in `git rev-parse --short origin/main` at the freeze; see docs/FREEZE_COMMANDS_2026-11-01.md)

Live: https://agentpulse.centralindia.cloudapp.azure.com

## What it is

AgentPulse scores every span an LLM agent produces for grounding risk and per-agent drift, with two
small models that run on CPU (MiniLM embeddings and a DeBERTa NLI classifier) and no LLM judge.
It has a Python SDK, a FastAPI backend with a separate evaluation worker, and a React console.

## What works (checked on the live site on 2026-10-27, `docs/E2E_TEST_2026-10-27.md`)

- A public chat with three agents (retriever, verifier, answerer); each answer's spans are scored and
  appear in the console. Two turns on 2026-10-27 took 1.6 s and 6.1 s, all agents answered by Groq.
- The Telemetry Lab: five fault scenarios scored by the real evaluator, open to visitors with
  per-IP and per-day limits.
- The console: Overview, RAG Live, Agents, Traces (export to JSON/CSV), Performance, Incidents, Drift,
  Telemetry Lab, Settings, Replay, Datasets; palettes Dark, Chalk, Butter. Unmeasured values show as
  "unknown", "not scored" or "—", never as 0.
- The SDK (decorator, OpenAI/Anthropic client wrapper, LangGraph adapter), installed from source.
- API-key routes and all writes (except the Lab and the chat) are closed to visitors.

## Measured numbers and their sources

| Number | Value | Source | Date |
| :--- | :--- | :--- | :--- |
| Grounding F1 / false-positive rate, 30-case test split (5 cases copy dev) | 0.963 / 0.059 | `GROUNDING_RECALIBRATION_2026-10.md` | 2026-10-22 |
| Hand-labelled cases behind it | 68 (39 supported, 29 failures) | same | 2026-10-22 |
| Drift, real-trace corpus: false alarms / detection / sessions long enough | 1.5% / 91.9% / 24.5% | `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` | 2026-08-27 |
| Evaluator latency per case, two grounding models / full pipeline | 151.19 ms / 165.18 ms (PyTorch, one machine) | `experiments/results/ablation_results.json` | 2026-09-18 |
| Backend tests | 628 passed | `pytest tests/`, author's machine | 2026-10-27 |
| Dashboard tests | 404 passed (35 files), `tsc` clean | `npm test`, author's machine | 2026-10-27 |

## Known limits

- Inter-agent disagreement found 0 of 10 labelled contradictions on real traces; its alert is withdrawn.
- Tool-claim validation scored F1 0.000 on real traces (it only reads counts written in digits).
- Grounding quality rests on 68 hand-labelled cases; a span without anything to compare with is
  "unverifiable", not "safe".
- One VM, one SQLite file, one evaluation worker; the nightly backup is on the same disk; the Lab's
  rate-limit counters reset when the backend restarts.
- The chat runs on free LLM tiers (Cerebras is not used) and can be slow or refused when they are used up.

## Where to start

`README.md`, then `DEMO_GUIDE.md` (five-minute demo), `CODE_WALKTHROUGH.md` (code tour) and
`SESSION_HANDOFF.md` section 29 (the current state).
