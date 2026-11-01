# AgentPulse viva: speaker notes (final review, 3 Nov 2026, 10 AM)

Ten minutes of talk, five minutes of questions. Two copies of the same deck, same slides in the same order:

- `AgentPulse_Viva.html`: open it in Chrome and press F11. Arrows or Space move, **N** shows these notes under the slide, Home/End jump. `AgentPulse_Viva.pdf` is the same deck as images (no animation) for when the browser is not allowed.
- `AgentPulse_Viva.pptx`: the PowerPoint copy the college asks for. Its speaker notes are the same text as the HTML notes. Rebuild it with `build_viva_pptx.js` (top of that file says how).

The rule for the whole talk, from `DEMO_GUIDE.md`: say only what the screen shows. Every number below has its source next to it. If you are asked for a number that is not here, say "I would have to check the report" and name the report, rather than guess.

## Before the talk (10 minutes before)

1. `curl -s -w "\n%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/chat/health` returns 200, and `/v1/health/ready` returns 200.
2. Open the live site, **Launch App**, **RAG Live**, ask the WAL question once (warm-up). Wait until the ledger shows scores for all three agents.
3. Keep a second tab on **Traces**.
4. The deck is open on slide 1. The PDF is on the desktop in case the browser fails.
5. Limits you can hit in the room: chat 5 questions a minute and 40 a day per IP; the Lab 6 runs per IP per hour (README; the per-IP Lab limits may have been raised on the VM before the viva, see `docs/FREEZE_COMMANDS_2026-11-01.md`).

## Timed script (minute marks add up to 10:00)

| Slide | Time | Length |
| :-- | :-- | :-- |
| 1 Title | 0:00 – 0:20 | 0:20 |
| 2 The problem | 0:20 – 1:10 | 0:50 |
| 3 What AgentPulse is (architecture) | 1:10 – 2:20 | 1:10 |
| 4 Grounding | 2:20 – 3:30 | 1:10 |
| 5 Drift | 3:30 – 4:10 | 0:40 |
| 6 Results: cost | 4:10 – 5:00 | 0:50 |
| 7 Results: verification | 5:00 – 5:40 | 0:40 |
| 8 Live demo | 5:40 – 8:10 | 2:30 |
| 9 Engineering | 8:10 – 8:50 | 0:40 |
| 10 Honest limits | 8:50 – 9:25 | 0:35 |
| 11 Future work | 9:25 – 9:40 | 0:15 |
| 12 Conclusion (stays up for Q&A) | 9:40 – 10:00 | 0:20 |
| **Total** | | **10:00** |

Backup slides B1-B3 come after slide 12; use them only to answer a question.

### 1. Title (0:00 – 0:20)

"Good morning. I am Somnath Reddy. My project is AgentPulse: it watches multi-agent LLM pipelines and scores every step for grounding risk and drift, with two small models on a CPU and no LLM judge. It is deployed; I will show it live in a few minutes."

The screenshot is the live Overview on 1 Nov 2026 (`assets/live_overview.jpg`). Its counters are the live database that day, not a benchmark.

### 2. The problem (0:20 – 1:10)

"In a multi-agent pipeline an agent can state something its evidence does not support, and the next agent builds on it. Every call still returns 200, nothing throws, latency is normal. The second failure is drift: an agent slowly answers differently after a model or prompt change. Existing tools trace tokens, latency and cost well, but treat quality evaluation as optional and sampled. My goal was to score every span, cheaply enough for a CPU, and to show plainly what was not measured."

Source of the framing: README.md, intro paragraph. The chain diagram is a schematic.

### 3. What AgentPulse is (1:10 – 2:20)

Walk the diagram left to right. "The SDK is a decorator, an OpenAI or Anthropic client wrapper, or a LangGraph adapter. It never blocks the agent: a bounded buffer that drops the oldest span when full. The API only accepts and queues; it runs no model. Spans and a durable job queue live in one SQLite file in WAL mode. A separate worker leases jobs and runs two small models: MiniLM for embeddings and DeBERTa-v3-small for NLI. Alert rules fire with a 15-minute cooldown per agent and alert type. The React console reads it over REST and a WebSocket; a value that was not measured shows as a dash, never as zero."

Numbers:
- 202.94 ms vs 3,170.39 ms: median latency per case over 30 cases, AgentPulse vs an LLM judge (Qwen3-8B Q4 via llama.cpp, CPU). `LLM_JUDGE_COMPARISON_REPORT.md`, 2026-08-26; README "Numbers and where they come from". The report computes this as 15.6×.
- 0.005 ms: SDK decorator overhead, P50 over 2,000 calls. `benchmarks/benchmark_results.json`, 2026-08-18.
- Buffer 10,000 spans, drop-oldest; cooldown 900 s: `HOW_IT_WORKS.md`.

### 4. Grounding (2:20 – 3:30)

"Grounding risk is the NLI model's contradiction probability plus 0.3 times its neutral probability. Zero is safe, one is risky; high above 0.7, medium above 0.4. Next to the score we show a verdict: whichever of the three probabilities is highest. Unverifiable means the evidence neither supports nor contradicts the output; it is a status, not a pass. The 0.3 is a design choice, not a fit: weights from 0 to 0.3 cannot be told apart on our data. On the 30-case test split F1 is 0.963 with a false-positive rate of 0.059, one of 17 supported cases. On 47 truly held-out cases F1 is 0.927 at the 0.7 cut-off and 0.952 at 0.4. This rests on 68 hand-labelled cases, and five of the 30 test cases copy dev cases: a small sample."

Numbers, all from `GROUNDING_RECALIBRATION_2026-10.md` (analysis 2026-10-22) and the README table: F1 0.963, FPR 0.059 (1/17), test split of 30 with 5 dev copies (T3c); held-out 47: F1 0.927 at 0.7, 0.952 at 0.4, FPR 0.074 = 2/27 (T3d); 68 cases = 39 supported + 29 failures. Weight in `backend/app/services/grounding.py` (`NEUTRAL_RISK_WEIGHT = 0.3`, PR #89). Verdict rule: `HOW_IT_WORKS.md`.

### 5. Drift (3:30 – 4:10)

"Drift compares an agent with its own past. Its first 20 outputs, embedded with MiniLM and averaged, are the baseline; its latest 12 are the window. Above a cosine distance of 0.30 we raise DRIFT_DETECTED. Offline, on a held-out split of an external real-trace corpus, that gave 1.5% false alarms and 91.9% detection. The catch: only 24.5% of real sessions were long enough to report a distance at all."

Numbers: `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` sections 11.3 and 11.5, 2026-08-27, measured once. Parameters: `HOW_IT_WORKS.md`, README "What it does". The picture is a schematic.

### 6. Results: cost (4:10 – 5:00)

"Is scoring every span affordable? Median per case, our two models took 202.94 ms against 3,170.39 ms for an 8-billion-parameter judge on the same kind of CPU. That is one judge model on one machine, so I do not claim it for every judge. The table is single runs on one Windows machine: the decorator costs 0.005 ms, MiniLM 15.1 ms, DeBERTa 88.5 ms at the median; the two grounding models together 151.19 ms per case and the full pipeline 165.18 ms. On the deployed worker the Settings view showed a live median of 180 ms over 172 spans."

Numbers: bar chart from `LLM_JUDGE_COMPARISON_REPORT.md`; 0.005 / 15.1 / 88.5 ms from `benchmarks/benchmark_results.json` (2026-08-18, PyTorch, not ONNX); 151.19 / 165.18 ms from `experiments/results/ablation_results.json` (2026-09-18, 30 cases); 180 ms over 172 spans from `docs/E2E_TEST_2026-10-27.md` item 23 (ONNX worker, live). Do not quote 215.9 ms (an older run; README says so).

### 7. Results: verification (5:00 – 5:40)

"628 backend tests and 404 dashboard tests pass, re-run on 27 October. The same day I tested the live site from outside: health endpoints 200; the key routes and every write without a key 401; a chat turn of 6.35 seconds with all three agents on Groq, and all three spans scored; the Lab's hallucination scenario raised HIGH alerts for the verifier at 0.971 and the analyst at 0.999; every console view checked for NaN or undefined, none found. The test also found two real bugs, which were fixed."

Numbers: README "Testing and benchmarks" (628 in 4 min 12 s; 404 in 35 files, tsc clean; 2026-10-27); `docs/E2E_TEST_2026-10-27.md` items 1-25 and findings F1 (SVG arrowhead), F2 (header at 1366 px), F3 (APM shows "1 of 22 alive": stale worker registrations, open). Another single chat turn that day took 1.6 s (`SESSION_HANDOFF.md` 29.17.3); neither is "the" latency.

### 8. Live demo (5:40 – 8:10)

Follow `DEMO_GUIDE.md`, steps 1 to 5 (step 6, the Lab, only if time is left):

1. Launch App, RAG Live. Ask **"how does SQLite WAL improve concurrency?"** The answer comes from the retrieved document "SQLite Write-Ahead Logging (WAL) Architecture".
2. Point at the three stages: time in ms, provider and model, failovers.
3. Open the agent ledger: one row per agent span with model, latency, tokens, grounding risk, stage, verdict. Rows say pending until the worker scores them; the alerts line says "Unknown so far" until every span is scored. Explain Unverifiable in one sentence.
4. Ask **"who won the 2022 football world cup?"** Read the verdicts from the screen; do not predict them.
5. Traces, newest trace, press **X**: "Everything on these screens is in this file. Nothing in it is computed in the browser."

The screenshot on the slide is a real turn on 1 Nov 2026: 3.2 s in total (retriever 410 ms, verifier 510 ms, answerer 378 ms, all Groq `openai/gpt-oss-20b`), answerer grounding 0.191, low risk (`assets/live_rag.jpg`). One turn, not a rate.

If something fails, use the table in `DEMO_GUIDE.md` ("If something goes wrong"): "Limit reached" is the abuse limit working; "Providers at their limit" means every free tier refused, press Retry once and then show an earlier turn; "Evaluator offline" means say so. Never call a failure a success. If the network is down, show the slide's screenshot and the B3 backup slide.

### 9. Engineering (8:10 – 8:50)

"It runs on one Azure VM, a B2als_v2 with 2 vCPUs and 4 GB, in Central India: Caddy for TLS, nginx with the dashboard, the backend, the evaluator worker and the chat service, under Docker Compose. Pull requests run the full pytest suite and the dashboard's type-check and tests. A push to main deploys automatically: it rebuilds changed images, tests the new backend against a copy of the live database, swaps, and rolls back if the new containers are unhealthy. Every write needs a password at Caddy, except the chat and one exact Lab route; the key routes return 401 on every case variant; the backend refuses to start with the placeholder key; and every public route is rate-limited per IP."

Sources: `deploy/azure/README.md` (VM size); `.github/workflows/tests.yml`, `dashboard.yml`, `deploy-azure.yml`; `deploy/azure/Caddyfile`; README "What works live" and "Docker deployment"; `SESSION_HANDOFF.md` 29.17.2 (the exact `POST /v1/simulate` exemption; Caddy's plain path matcher let nine variants through) and the #109 entry in 29.18. Limits: chat 5/minute and 40/day per IP, 300/day site, 500 characters; Lab 6/hour and 30/day per IP, 300/day site (README).

### 10. Honest limits (8:50 – 9:25)

"Before you ask: two of the four signals did not hold up. Inter-agent disagreement found 0 of 10 labelled contradictions on real traces, so its alert is withdrawn. The tool-claim check scored F1 0.000 on real traces, because agents do not write counts in digits. Grounding rests on 68 labelled cases with only one neutral failure, so the data cannot say what the 0.3 weight buys. Drift reports a distance for only a quarter of real sessions. And it is one VM, one SQLite file, one worker, a backup on the same disk, deploys not gated on tests, and the chat runs on free LLM tiers."

Sources: README "Known limits"; `COMPETITIVE_POSITIONING.md` 5.2 and `SESSION_HANDOFF.md` 14.1, 24.9.5 (0 of 10; AUC 0.457 without the planner); `TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` section 10 (F1 0.000; 8,353 prose spans; 0.842 on 19 hand-written cases); `GROUNDING_RECALIBRATION_2026-10.md` and `DEMO_GUIDE.md` (68 cases, one neutral failure); `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.5 (24.5%).

### 11. Future work (9:25 – 9:40)

"Each item follows from a limit: more labelled data from real traces and a re-run of the ablation at 0.3; redesign or remove the two failed signals; a server database, more workers, an off-VM backup and test-gated deploys; and LangChain and CrewAI adapters."

Sources: `SESSION_HANDOFF.md` 29.16.4 (ablation at 0.3 not re-run), 29.16.6 and 29.18 (open follow-ups); README "What it does" (LangChain and CrewAI adapters not implemented). No numbers.

### 12. Conclusion (9:40 – 10:00), then leave it up

"Three things: every span is scored by two local models on a CPU, without an LLM judge; grounding and drift held up, the other two signals were measured, failed, and are labelled so; and it is live on Azure and tested. Thank you. I am happy to take questions." Stop talking; leave this slide on screen.

## Ten likely questions, with honest answers

**1. Why not just use an LLM as the judge? Wouldn't it be more accurate?**
On our 30 test cases the LLM judge (Qwen3-8B on CPU) was in fact more accurate: F1 1.000 against 0.963 for the NLI pipeline at the shipped weight, and the whole difference sits in the 20 cases the judge itself labelled. But it took 3,170.39 ms per case at the median against 202.94 ms, needs a large model or an API key, and its output is text that has to be parsed. AgentPulse scores every span, so cost and latency decide. One judge model, 30 cases: I do not generalise beyond that. (`LLM_JUDGE_COMPARISON_REPORT.md`, correction banner and median table.)

**2. Why is the neutral weight 0.3? Did you tune it?**
No, and I say so on the slide: it is a design choice. On the corrected labels, weights from 0.0 to 0.3 give identical results, so the data cannot pick between them; only one labelled case (`val_17`) separates them. What the data does show is that 0.5 was wrong for the medium band: at 0.5 the false-positive rate at the 0.4 cut-off was 0.412 (7 of 17 supported cases), against 0.059 at 0.3. At the 0.7 cut-off, any weight up to 0.6 gives the same result, so high alerts do not depend on it. (`GROUNDING_RECALIBRATION_2026-10.md` findings 4 and 7, backup slide B1.)

**3. 68 labelled cases is small. How much do you trust F1 0.963?**
Not much as a general figure, and the deck says so. The confidence interval on the test split is [0.897, 1.000]; five of the 30 test cases copy dev cases; on the 47 truly held-out cases F1 is 0.927 at 0.7 and 0.952 at 0.4. It is evidence that the method separates clear contradictions from supported text, not a benchmark of production traffic. Future work is a larger labelled set from real traces. (`GROUNDING_RECALIBRATION_2026-10.md` T3b, T3c, T3d.)

**4. What does "Unverifiable" mean? Isn't it a way to hide failures?**
It is the NLI verdict when the neutral probability is the highest: the evidence neither supports nor contradicts the output. It says nothing about truth. It does not change the score or the alerts; it is shown next to the score so a low score is not read as "supported". In the live chat it is common for the retriever span because its premise is a short prompt, so a fuller answer adds detail the premise does not contain. (`HOW_IT_WORKS.md`, "The verdict, next to the score"; `DEMO_GUIDE.md`.)

**5. You had a bug in the label order. How do I know the other numbers are right?**
Before 21 Oct the code read DeBERTa's entailment and neutral outputs in swapped order. It was found, fixed in PR #69 (the label order is now read from the model's config), and every grounding figure was re-measured in `GROUNDING_RECALIBRATION_2026-10.md`, which also lists every result the bug touched. Anything built only on the contradiction probability was unaffected. The live rows were re-scored. (Backup slide B1.)

**6. How does drift detection work, and why only 24.5%?**
MiniLM embeds every output. Per agent, the mean of its first 20 outputs is the baseline and the mean of its latest 12 is the window; `DRIFT_DETECTED` fires above a cosine distance of 0.30. On a held-out split of an external real-trace corpus that was 1.5% false alarms and 91.9% detection. But a session has to produce 32 outputs (20 + 12) before a distance exists, and only 24.5% of real sessions did. Short sessions get no drift reading, shown as a dash, not as zero. (`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.3, 11.5.)

**7. Why did inter-agent disagreement fail, and why keep it?**
On real multi-agent traces it found 0 of 10 independently labelled contradictions, and with the planner agent excluded its AUC was 0.457, chance. So the alert was withdrawn; the score is still stored. It stays in the code as a measured negative result and so the Lab can show the mechanism on synthetic text. The diagnosis reports are `DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md` and `REFUSAL_DISAGREEMENT_REPORT.md`. (`COMPETITIVE_POSITIONING.md` 5.2; `SESSION_HANDOFF.md` 24.9.5; backup slide B2.)

**8. How does this compare with LangSmith, Arize Phoenix or MLflow?**
Those trace calls well. AgentPulse's difference is that it evaluates every span with small local models instead of optional or sampled LLM-judge evaluations. I had claimed that none of them ships tool-call checks; a programmatic audit of Phoenix's package proved that wrong (it ships three tool evaluators), and the positioning document was corrected. (`PHOENIX_CAPABILITY_AUDIT.md`, `MLFLOW_CAPABILITY_AUDIT.md`, `COMPETITIVE_POSITIONING.md`.)

**9. Will this scale? It is one VM and SQLite.**
Not as deployed, and I list it as a limit. SQLite in WAL mode lets the API write while the worker reads, and the worker leases jobs from a durable queue, so a restart loses no job. But there is one evaluator worker, one file, no replication, and the backup is on the same disk. The path is a server database, several workers and an off-VM backup. (README "Known limits", "Architecture in short".)

**10. Can I use it with my own agent? Is the public site safe?**
Yes, through the SDK: `pip install -e ./sdk` from the repo, then the decorator, the OpenAI/Anthropic client wrapper or the LangGraph adapter, with input and output capture turned on so grounding has a pair to compare. On the public site a write needs a key, so you run your own instance (README Quickstart) or ask me for a key. The public site is read-open on purpose; every write needs the Caddy password except the chat and the Lab's one route, the key routes return 401, and every public route is rate-limited. Visitors' chat questions are stored and visible, which the page says. (README "What works live", "SDK usage", "Known limits".)

## Not in this deck (for the owner)

- **Paper-communication proof.** The panel asks for it, but nothing in the repository records a paper submission (venue, ID or date), so the deck has no slide for it and makes no claim. Bring the proof (email or portal screenshot) separately, or add a backup slide yourself with the real details.
- **Guide and panel names.** The older deck had a blank line for them; this title slide has only your name. Add them if your department expects them.
