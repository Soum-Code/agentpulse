# AgentPulse viva: speaker notes (final review, 3 November 2026, 10 AM)

Ten minutes of talk, five minutes of questions. Two copies of the same deck, the same 16 slides in the same order (12 for the talk, then appendix A1-A4 for questions):

- `AgentPulse_Viva.html`: open it in Chrome and press F11. Arrows or Space move. **N** shows the notes for the current slide below it. Home and End jump. `AgentPulse_Viva.pdf` is the same deck as pictures, for when a browser is not allowed.
- `AgentPulse_Viva.pptx`: the PowerPoint copy the college asks for. Every slide's notes field has the same text as below, so PowerPoint's Presenter View shows it. Rebuild it with `build_viva_pptx.js` (the top of that file says how).

Rule for the whole talk, from `DEMO_GUIDE.md`: **say only what the screen shows.** Every number below has its source. If you are asked for a number that is not here, say "I would have to check the report" and name the report. Do not guess.

Words used below, in one line each:

- **Span**: one step of an agent (one LLM call or one tool call) with its input, output and time.
- **Grounding**: is the answer supported by the evidence the agent had?
- **Drift**: is an agent slowly answering differently from how it used to?
- **NLI** (natural language inference): a model that reads two texts and says if one supports, contradicts or says nothing about the other.
- **Embedding**: a text turned into a list of numbers, so two texts can be compared by distance.
- **F1**: one score for "finds the failures and does not cry wolf"; 1.0 is perfect.
- **False-positive rate (false alarms)**: the share of correct answers that were wrongly flagged.

## Before the talk (10 minutes before)

1. Run these two; each must print 200:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/chat/health
   ```

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/v1/health/ready
   ```

2. Open the live site, **Launch App**, **RAG Live**, ask the WAL question once (warm-up). Wait until the ledger shows scores for all three agents.
3. Keep a second browser tab on **Traces**.
4. Open the deck on slide 1. Keep the PDF on the desktop in case the browser fails.
5. Limits you can hit in the room: chat 5 questions a minute and 40 a day per visitor; the Lab 6 runs an hour per visitor (README; the Lab limits may have been raised on the VM before the viva, see `docs/FREEZE_COMMANDS_2026-11-01.md`).

## Timing (adds up to 10:00)

| Slide | From – to | Time |
| :-- | :-- | :-- |
| 1 Front page | 0:00 – 0:20 | 0:20 |
| 2 The problem | 0:20 – 1:10 | 0:50 |
| 3 How it works | 1:10 – 2:15 | 1:05 |
| 4 Grounding: method | 2:15 – 3:10 | 0:55 |
| 5 Grounding: result | 3:10 – 3:55 | 0:45 |
| 6 Drift | 3:55 – 4:35 | 0:40 |
| 7 Cost | 4:35 – 5:20 | 0:45 |
| 8 Verification | 5:20 – 5:55 | 0:35 |
| 9 Live demo | 5:55 – 8:15 | 2:20 |
| 10 Engineering | 8:15 – 8:55 | 0:40 |
| 11 Honest limits | 8:55 – 9:35 | 0:40 |
| 12 Conclusions (stays up for Q&A) | 9:35 – 10:00 | 0:25 |
| **Total** | | **10:00** |

If the demo runs long, cut slide 10 to one sentence ("one VM, auto-deploy, writes closed") and keep the limits slide whole.

## Slide by slide (the same text is in each slide's notes)

### Slide 1. Front page: "Every agent step, checked for grounding and drift, without an LLM judge"

**TIME: 0:00-0:20 (20 seconds)**

**SAY:**

- Good morning. I am Somnath Reddy. My project is AgentPulse.
- It watches AI agents that work together, and checks every step they take.
- It checks two things: grounding (is the answer supported by its evidence?) and drift (is the agent changing its behaviour?).
- It uses two small models on a normal CPU. No big LLM is used as a judge.
- It is live on the internet. I will show it in a few minutes.

**If asked** "Is this deployed?": Yes, on one Azure VM; the address is on the slide and anyone can open it.

*Sources:* screenshot of the live Overview, 2026-11-01 (assets/live_overview.jpg); its counters are the live database that day, not a benchmark.

### Slide 2. "In a multi-agent pipeline, a wrong answer looks exactly like a right one"

**TIME: 0:20-1:10 (50 seconds)**

**SAY:**

- Many AI systems now use several agents in a chain: one finds documents, one checks, one answers.
- Problem 1, grounding failure: an agent says something that its own evidence does not support. The next agent trusts it.
- Every call still says "200 OK". No error, normal speed. So normal monitoring sees nothing wrong.
- Problem 2, drift: after a model or prompt change, an agent slowly starts answering differently.
- Most tools measure cost and speed well. Quality checks are optional and done only on samples.

**If asked** "Why not just check the final answer?": The mistake starts in a middle agent; checking each step tells you which agent went wrong.

*Sources:* README.md intro paragraph. The chain is a schematic.

### Slide 3. "AgentPulse scores every span on a CPU, off the agent's critical path"

**TIME: 1:10-2:15 (65 seconds)**

**SAY:**

- Read the boxes from left to right. This is the path of one step ("span") of an agent.
- The SDK sits inside your agent. It sends each step to AgentPulse and never waits for an answer, so the agent is never slowed down.
- The API only puts the step in a queue. A separate worker picks it up and runs two small models: MiniLM (turns text into numbers, called embeddings) and DeBERTa (an NLI model: it says if one text supports or contradicts another).
- If a score crosses a threshold, an alert is raised. The same alert for the same agent comes at most once in 15 minutes.
- The console shows everything live. If something was not measured, it shows a dash, never a fake zero.

**If asked** "What is a span?": One step of an agent: one LLM call or one tool call, with its input, output and timing.

*Sources:* README.md "Architecture in short"; HOW_IT_WORKS.md (buffer of 10,000 spans, oldest dropped; cooldown 900 s per alert type and agent); benchmarks/benchmark_results.json, 2026-08-18 (SDK decorator 0.005 ms, P50 over 2,000 calls).

### Slide 4. "Grounding risk is an NLI probability, and its 0.3 weight is a design choice"

**TIME: 2:15-3:10 (55 seconds)**

**SAY:**

- Grounding means: is the answer supported by the evidence the agent had?
- An NLI model (natural language inference) reads two texts and gives three probabilities: the evidence supports the answer, contradicts it, or is neutral (says neither).
- Our risk score is contradiction plus 0.3 times neutral. 0 is safe, 1 is risky. Above 0.4 is medium, above 0.7 is high.
- Next to the score we show a verdict. "Unverifiable" means the evidence neither supports nor contradicts. It is not a pass; it means "could not check".
- The 0.3 is my design choice, not a fitted number. On our data, any weight from 0 to 0.3 gives the same result.

**If asked** "Why 0.3 and not 0.5?": At 0.5, 7 of 17 correct test answers were wrongly flagged medium; at 0.3 only 1 of 17 (appendix A1).

*Sources:* GROUNDING_RECALIBRATION_2026-10.md (banner, finding 4, section 3.6; analysis 2026-10-22); HOW_IT_WORKS.md "The verdict, next to the score"; grounding.py NEUTRAL_RISK_WEIGHT = 0.3 (PR #89). Model: cross-encoder/nli-deberta-v3-small.

### Slide 5. "On 68 hand-labelled cases, grounding catches contradictions with few false alarms"

**TIME: 3:10-3:55 (45 seconds)**

**SAY:**

- How good is the grounding check? I measured it on 68 cases that were labelled by hand: 39 correct answers and 29 failures.
- On the 30-case test split, F1 is 0.963. F1 is one number for "finds the failures and does not cry wolf"; 1.0 is perfect.
- False alarms: 1 of 17 correct answers was flagged, so 0.059.
- On 47 cases never used for design, F1 is 0.927 or 0.952, depending on the cut-off.
- Honest point: this is a small sample, and 5 test cases are copies of development cases. It is not a production benchmark.

**If asked** "Is 68 cases enough?": No, not for a general claim; the 95% interval on the test F1 is 0.897 to 1.000, and more labelled data is my first next step.

*Sources:* GROUNDING_RECALIBRATION_2026-10.md T3c (test split: F1 0.963, FPR 0.059 = 1/17; 5 of 30 copy dev), T3d (held-out 47: F1 0.927 at 0.7, 0.952 at 0.4, FPR 0.074 = 2/27), T3b (interval [0.897, 1.000]); README.md table.

### Slide 6. "Drift detection is accurate, but only a quarter of real sessions are long enough to measure"

**TIME: 3:55-4:35 (40 seconds)**

**SAY:**

- Drift compares an agent with its own past, not with a correct answer.
- MiniLM turns each answer into a vector (a list of numbers). We average the agent's first 20 answers (baseline) and its latest 12 answers (window).
- If the two averages are far apart (cosine distance above 0.30), we raise "drift detected".
- On real traces it caught 91.9% of drift, with 1.5% false alarms.
- But only 24.5% of real sessions had enough answers (32) to measure at all. That is the honest weak point.

**If asked** "What happens to short sessions?": They get no drift value; the console shows a dash, not zero.

*Sources:* DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md 11.3 and 11.5 (2026-08-27, offline, held-out split of an external real-trace corpus, measured once); HOW_IT_WORKS.md; README "What it does" (32 outputs).

### Slide 7. "The evaluator is 15.6 times faster than an LLM judge, at a small accuracy cost"

**TIME: 4:35-5:20 (45 seconds)**

**SAY:**

- Can we afford to check every step? Yes. Our two models took 202.94 milliseconds per case.
- A local 8-billion-parameter LLM judge took 3,170.39 milliseconds. That is 15.6 times slower.
- To be fair: on the same 30 cases the judge was more accurate, F1 1.000 against our 0.963.
- So the trade is a little accuracy for a big saving in time and cost. That saving is what lets us score every span.
- This is one judge model on one machine, so I do not claim it for every LLM judge.

**If asked** "Why not use the judge then?": It is 15.6 times slower and needs a large model or a paid API call per span; checking every span is the point of this project.

*Sources:* LLM_JUDGE_COMPARISON_REPORT.md (median 202.94 vs 3,170.39 ms, 15.6x; judge Qwen3-8B-GGUF Q4_K_M via llama.cpp, CPU; 2026-08-26). F1 1.000 vs 0.963 at weight 0.3: the report's correction banner, derived from stored probabilities, not re-run. Other single-run latencies (not on the slide): MiniLM 15.1 ms and DeBERTa 88.5 ms P50 (benchmarks/benchmark_results.json, 2026-08-18); 151.19 / 165.18 ms per case (experiments/results/ablation_results.json, 2026-09-18); live median 180 ms over 172 spans (docs/E2E_TEST_2026-10-27.md item 23).

### Slide 8. "The live site passed an end-to-end test from outside on 27 October"

**TIME: 5:20-5:55 (35 seconds)**

**SAY:**

- Tests: 628 backend tests and 404 dashboard tests pass. I re-ran them on 27 October.
- The same day I tested the live site from outside, like a visitor would.
- Health checks answer 200. Secret routes and writes without a key are refused (401).
- A chat question took 6.35 seconds, and all three agents' steps were scored.
- The Lab's hallucination scenario raised HIGH alerts. No broken values on any screen. Two bugs were found and fixed.

**If asked** "Is 6.35 s the normal speed?": It is one turn; another turn that day took 1.6 s and today's took 3.2 s, so I do not quote one number as typical.

*Sources:* docs/E2E_TEST_2026-10-27.md: items 1-4 health 200; item 7 /v1/keys and 3 variants 401; items 8-9 ingest and PUT /v1/simulate 401; item 10 chat 6.35 s (stream 6,148 ms; Groq gpt-oss-20b), spans 0.306 unverifiable, 0.135 and 0.027 supported; item 11 HIGH_HALLUCINATION_RISK and GROUNDING_FAILURE, verifier 0.971, analyst 0.999; items 14-24 views in Dark and Chalk, 0 NaN/undefined; F1 SVG arrowhead and F2 header at 1366 px fixed (PR #112), F3 open. README "Testing and benchmarks": 628 passed (4 min 12 s), 404 passed (35 files), tsc clean, 2026-10-27. 1.6 s: SESSION_HANDOFF.md 29.17.3.

### Slide 9. "One question, three agents, and every step scored as it happens"

**TIME: 5:55-8:15 (2 minutes 20 seconds). Switch to the browser.**

**SAY (follow DEMO_GUIDE.md; say only what the screen shows):**

- Open the site, Launch App, RAG Live. Ask: "how does SQLite WAL improve concurrency?"
- Point at the three stages: retriever, verifier, answerer. Each shows its time, the provider and the model.
- Open the agent ledger: one row per agent with its grounding risk and verdict. Rows say "pending" until the worker has scored them. Explain "Unverifiable" in one line: the evidence neither supports nor contradicts.
- Ask: "who won the 2022 football world cup?" The corpus has nothing on football. Read the verdicts from the screen; do not predict them.
- Go to Traces, open the newest trace, press X: "Everything on the screen is in this JSON file. Nothing is computed in the browser."

**If asked** "What if a provider fails?": The chat tries the next provider in the chain (Groq, NVIDIA, OpenRouter, Pollinations) and the screen says which one answered, or that all were at their limit.

**If the demo fails:** "Limit reached" = the abuse limit (5 questions a minute per visitor) is working; "Providers at their limit" = press Retry once, then show an earlier turn; no network = use this slide's photo and appendix A3. Never call a failure a success.

*Sources:* DEMO_GUIDE.md; screenshot 2026-11-01 (assets/live_rag.jpg): 3.2 s total, retriever 410 ms, verifier 510 ms, answerer 378 ms, all groq openai/gpt-oss-20b, answerer grounding 0.191 low_risk. Provider chain: README "What works live".

### Slide 10. "One small Azure VM, deployed automatically and closed to writes"

**TIME: 8:15-8:55 (40 seconds)**

**SAY:**

- It runs on one small Azure VM: 2 CPUs, 4 GB memory, in Central India. Five containers: the web server with HTTPS, the dashboard, the API, the evaluator worker and the chat.
- Every pull request runs the test suite automatically (GitHub Actions).
- When code reaches main, it deploys by itself: it tests the new version on a copy of the live database, switches over, and goes back to the old version if the new one is unhealthy.
- Anyone can read the site. Writing needs a password, except the chat and one Lab route. Secret key routes return 401.
- Every public route has a per-visitor limit, so nobody can flood it.

**If asked** "What are the limits?": Chat 5 questions a minute and 40 a day per visitor, 300 a day for the whole site; Lab 6 runs an hour and 30 a day per visitor.

*Sources:* deploy/azure/README.md (Standard_B2als_v2, 2 vCPU / 4 GB); five containers: caddy, dashboard (nginx), backend, worker, chat (README "Architecture in short"); tests.yml and dashboard.yml run on pull requests; deploy-azure.yml (rebuild changed images, test against a copy of the live DB, swap, roll back); Caddyfile basic_auth on writes, exemption only for the exact POST /v1/simulate (SESSION_HANDOFF 29.17.2); E2E item 7 (four key paths 401); limits from README "What works live".

### Slide 11. "Two of the four signals failed on real traces, and the evidence base is small"

**TIME: 8:55-9:35 (40 seconds)**

**SAY:**

- I want to say the weak points before you ask.
- Disagreement between agents: on real traces it found 0 of 10 real contradictions. So I withdrew that alert.
- The tool-claim check scored F1 0.000 on real traces, because real agents do not write counts as digits.
- Grounding rests on only 68 labelled cases. Drift can be measured on only a quarter of sessions.
- And it is one VM with one SQLite file: fine for a prototype, not for production.

**If asked** "Why keep the failed signals in the code?": They are measured negative results; the scores are stored for study, but no alert is raised on them (appendix A2).

*Sources:* README "Known limits"; COMPETITIVE_POSITIONING.md 5.2 and SESSION_HANDOFF.md 24.9.5 (0 of 10; AUC 0.457 without the planner); TOOL_CLAIM_EXTERNAL_TEST_REPORT.md section 10 (F1 0.000; no claim in 8,353 prose spans; 0.842 on 19 hand-written cases); GROUNDING_RECALIBRATION_2026-10.md (68 = 39 + 29; one neutral failure, val_17); DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md 11.5 (24.5%); README (one VM, one SQLite file, one worker, backup on the same disk); deploy not gated on tests: SESSION_HANDOFF 29.16.6.

### Slide 12. "Conclusions"

**TIME: 9:35-10:00 (25 seconds). Then leave this slide on screen for questions.**

**SAY:**

- One: every step can be checked on a normal CPU, without an LLM judge, in about 200 milliseconds.
- Two: grounding and drift held up when measured. Two other signals failed, and I withdrew them.
- Three: it is live, tested, and you can open it yourselves now.
- Next steps: more labelled data from real traces, a proper database server, and deploys that wait for the tests.
- Thank you. I am happy to take questions.

**If asked** "What is your main contribution?": Per-span grounding and drift scoring with small local models, measured honestly, inside a working deployed system.

*Sources:* 202.94 ms (LLM_JUDGE_COMPARISON_REPORT.md); F1 0.963 (GROUNDING_RECALIBRATION_2026-10.md T3c); 628 + 404 tests (README, 2026-10-27). Next steps: SESSION_HANDOFF.md 29.16.4, 29.16.6.

### Appendix A1. "After a label-order bug was fixed, 0.5 flagged 7 of 17 correct answers; 0.3 flags 1"

**APPENDIX, only for questions.**

**SAY:**

- Until 21 October the code read DeBERTa's "entailment" and "neutral" outputs in the wrong order. It was found, fixed (PR #69), and every grounding number was re-measured.
- With correct labels, a weight of 0.5 flagged 7 of 17 correct answers as medium risk. 0.3 flags only 1.
- Weights from 0 to 0.3 give identical results, so 0.3 is a choice inside that range, not a fitted value.
- High-risk alerts (above 0.7) do not change for any weight up to 0.6.
- The live database was re-scored: 90 low, 7 medium, 19 high (it was 12, 81, 23 at 0.5).

**If asked** "How do I know other numbers are not also wrong?": The recalibration report lists every result the bug touched; anything built only on the contradiction probability was unaffected.

*Sources:* GROUNDING_RECALIBRATION_2026-10.md finding 4 (w 0.0-0.3: 0.963 / 0.059; 0.4: 0.897 / 0.176; 0.5: 0.788 / 0.412, 7 of 17), finding 7 and banner (live rows 90/7/19 and 1 without label at 0.3; 12/81/23 at 0.5), finding 5 (contradiction-only results unaffected); PR #69 (label order from the model config), PR #89 (weight 0.3).

### Appendix A2. "Both withdrawn signals looked good on hand-written cases and failed on real traces"

**APPENDIX, only for questions.**

**SAY:**

- Tool-claim check: it compares a count that the agent writes ("I found 12 papers") with the count the tool really returned. On 19 hand-written cases F1 was 0.842. On real traces it found no claim at all in 8,353 steps, because real agents write in words, not digits. F1 0.000.
- Disagreement: it compares agents' outputs in one trace with NLI. On real multi-agent traces it found 0 of 10 labelled contradictions; without the planner agent its AUC was 0.457, which is chance (0.5 = a coin toss).
- So I withdrew both alerts. The scores are still stored for study.

**If asked** "Why did disagreement fail?": Point to the diagnosis in DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md rather than guessing; the measured fact is 0 of 10 and AUC 0.457.

*Sources:* TOOL_CLAIM_EXTERNAL_TEST_REPORT.md section 10 (0.842 on 19 hand-written cases; 0.000 real; 8,353 prose spans; only fires on counts written in digits: README "What it does"); COMPETITIVE_POSITIONING.md 5.1, 5.2; SESSION_HANDOFF.md 14.1, 24.9.5 (0 of 10; AUC 0.457 without the planner).

### Appendix A3. "A fault injected in the Lab becomes a scored trace and a HIGH incident"

**APPENDIX, only for questions or if the live demo fails.**

**SAY:**

- The Telemetry Lab lets anyone inject one of five faults: clean, hallucination, tool-claim mismatch, drift, disagreement.
- The agent text is fixed in the code; everything after it (scoring, alerts) is the real system.
- On 27 October the hallucination run raised HIGH alerts: verifier 0.971, analyst 0.999.
- If you run it twice within 15 minutes you see the scores but no new alert, because of the 15-minute cooldown.

**If asked** "Is the Lab data real?": The text is a fixture; the scores and alerts come from the real evaluator.

*Sources:* HOW_IT_WORKS.md (fixture text in backend/app/routers/ingest.py); docs/E2E_TEST_2026-10-27.md item 11 (verifier 0.971, analyst 0.999), item 12 (no alert on a repeat within 15 min, cooldown 900 s), item 22; screenshots 2026-11-01.

### Appendix A4. References

**APPENDIX. Show only if asked where a number comes from.**

**SAY:**

- Every number in this deck comes from a document in the repository; each slide names its source at the bottom.
- The two models are public Hugging Face models: all-MiniLM-L6-v2 for embeddings and nli-deberta-v3-small for NLI.

**If asked** "Is there a paper?": Show the paper-communication proof you brought separately; this deck does not claim a publication.

*Sources:* HOW_IT_WORKS.md (model table).
## Ten likely questions, with honest answers

**1. Why not just use an LLM as the judge? Wouldn't it be more accurate?**
On our 30 test cases it was more accurate: the judge (Qwen3-8B on a CPU) scored F1 1.000 against 0.963 for our NLI check at the shipped weight, and the whole difference is in the 20 cases the judge itself labelled. But it took 3,170.39 ms per case against 202.94 ms (15.6 times slower), and it needs a big model or a paid API call for every span. AgentPulse checks every span, so speed and cost decide. One judge model and 30 cases: I do not claim more than that. (`LLM_JUDGE_COMPARISON_REPORT.md`, correction banner and median table.)

**2. Why is the neutral weight 0.3? Did you tune it?**
No, and the slide says so: it is a design choice. On the corrected labels, every weight from 0.0 to 0.3 gives the same result, so the data cannot choose between them. What the data does show: 0.5 was wrong for the medium band. At 0.5, 7 of 17 correct test answers were flagged medium (false alarms 0.412); at 0.3 only 1 (0.059). High alerts (above 0.7) are the same for any weight up to 0.6. (`GROUNDING_RECALIBRATION_2026-10.md` findings 4 and 7; appendix A1.)

**3. 68 labelled cases is small. How much do you trust F1 0.963?**
Not as a general figure, and the slide says so. The 95% interval on the test split is 0.897 to 1.000; 5 of the 30 test cases copy development cases; on the 47 truly held-out cases F1 is 0.927 at the 0.7 cut-off and 0.952 at 0.4. It shows the method separates clear contradictions from supported text; it is not a benchmark of real traffic. A bigger labelled set from real traces is my first next step. (`GROUNDING_RECALIBRATION_2026-10.md` T3b, T3c, T3d.)

**4. What does "Unverifiable" mean? Isn't it a way to hide failures?**
It is the verdict when the NLI model's "neutral" probability is the highest: the evidence neither supports nor contradicts the answer. It says nothing about truth. It does not change the score or the alerts; it is shown next to the score so a low score is not read as "supported". In the live chat it is common for the retriever, because its evidence is a short prompt. (`HOW_IT_WORKS.md`, "The verdict, next to the score"; `DEMO_GUIDE.md`.)

**5. You had a bug in the label order. How do I know the other numbers are right?**
Until 21 October the code read DeBERTa's entailment and neutral outputs in swapped order. It was found, fixed in PR #69 (the order is now read from the model's own config), and every grounding number was re-measured in `GROUNDING_RECALIBRATION_2026-10.md`, which lists every result the bug touched. Anything built only on the contradiction probability was not affected. The live database was re-scored. (Appendix A1.)

**6. How does drift detection work, and why only 24.5%?**
MiniLM turns every answer into an embedding. For each agent, the average of its first 20 answers is the baseline and the average of its latest 12 is the window; "drift detected" fires when they are more than 0.30 apart (cosine distance). On a held-out split of an external real-trace corpus: 91.9% detection, 1.5% false alarms. But an agent needs 32 answers before there is any distance, and only 24.5% of real sessions had that many. Short sessions get no drift value; the console shows a dash, not zero. (`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.3, 11.5.)

**7. Why did inter-agent disagreement fail, and why keep it?**
On real multi-agent traces it found 0 of 10 labelled contradictions, and without the planner agent its AUC was 0.457, which is chance. So the alert was withdrawn; the score is still stored for study. It stays in the code as a measured negative result, and the Lab can still show it on fixed text. The diagnosis is in `DISAGREEMENT_FORMULATION_DIAGNOSIS_REPORT.md` and `REFUSAL_DISAGREEMENT_REPORT.md`; point there rather than guessing. (`COMPETITIVE_POSITIONING.md` 5.2; `SESSION_HANDOFF.md` 24.9.5; appendix A2.)

**8. How is this different from LangSmith, Arize Phoenix or MLflow?**
Those trace calls well. AgentPulse's difference is that it scores every span with small local models instead of optional or sampled evaluations. I had once written that none of them ships tool-call checks; a programmatic audit of Phoenix's package proved that wrong (it ships three tool evaluators), and the positioning document was corrected. (`PHOENIX_CAPABILITY_AUDIT.md`, `MLFLOW_CAPABILITY_AUDIT.md`, `COMPETITIVE_POSITIONING.md`.)

**9. Will this scale? It is one VM and SQLite.**
Not as deployed, and it is on the limits slide. SQLite in WAL mode lets the API write while the worker reads, and the worker takes jobs from a durable queue, so a restart loses no job. But it is one worker, one file, no replica, and the backup is on the same disk. The path is a server database, more workers and an off-VM backup. (README "Known limits", "Architecture in short".)

**10. Can I use it with my own agent? Is the public site safe?**
Yes, through the SDK: `pip install -e ./sdk` from the repository, then the decorator, the OpenAI/Anthropic client wrapper or the LangGraph adapter, with input and output capture turned on so grounding has two texts to compare. On the public site a write needs a key, so you run your own copy (README Quickstart) or ask me for a key. The site is open for reading on purpose; every write needs the Caddy password except the chat and one Lab route, the key routes return 401, and every public route is rate-limited. Visitors' chat questions are stored and visible, and the page says so. (README "What works live", "SDK usage", "Known limits".)

## Cheat sheet: the ten numbers to know

| Number | What it is, in one sentence | Source |
| :-- | :-- | :-- |
| **0.963** | F1 of the grounding check on the 30-case test split (false alarms 0.059, 1 of 17). | `GROUNDING_RECALIBRATION_2026-10.md` T3c |
| **0.927 / 0.952** | F1 on the 47 truly held-out cases, at the 0.7 and 0.4 cut-offs (false alarms 0.074). | same report, T3d |
| **68** | Hand-labelled grounding cases behind those numbers: 39 supported, 29 failures. | same report |
| **0.3** | The weight on "neutral" in the risk score; a design choice, since 0 to 0.3 give the same result. | same report, section 3.6; `grounding.py` |
| **91.9% / 1.5% / 24.5%** | Drift: detection, false alarms, and the share of real sessions long enough to measure. | `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` 11.3, 11.5 |
| **202.94 ms vs 3,170.39 ms** | Median time per case: our two models against a local LLM judge (15.6 times slower). | `LLM_JUDGE_COMPARISON_REPORT.md` |
| **0.005 ms** | What the SDK decorator adds to each agent call (P50 over 2,000 calls). | `benchmarks/benchmark_results.json` |
| **628 + 404** | Backend and dashboard tests that pass, re-run on 27 October 2026. | README "Testing and benchmarks" |
| **0 of 10** | Labelled contradictions the inter-agent disagreement signal found on real traces; its alert is withdrawn. | `COMPETITIVE_POSITIONING.md` 5.2 |
| **F1 0.000** | The tool-claim check on real traces; it only reads counts written in digits. | `TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` section 10 |

Live, for the demo: one chat turn took 6.35 s on 27 October (`docs/E2E_TEST_2026-10-27.md` item 10), 1.6 s earlier that day (`SESSION_HANDOFF.md` 29.17.3) and 3.2 s on 1 November (the photo on slide 9). Never quote one of them as "the" speed.

## Not in this deck (for the owner)

- **Paper-communication proof.** The panel asks for it, but nothing in the repository records a paper submission (venue, ID or date), so the deck makes no claim. Bring the proof (an email or portal screenshot) separately, or add an appendix slide yourself with the real details.
- **Guide and panel names.** The front page has only your name. Add them if your department expects them.
