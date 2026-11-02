# Narration for the highlight cut

Each line starts at its timestamp in `output/highlight.mp4` (minutes:seconds) and must finish before the next one starts. `tools/narrate.mjs` speaks them, fits each into its slot, and mixes them into `output/highlight_voice.mp4`.

Sources: the auto-demo captions in `events.json` (run of 1 Nov 2026, 19:47) and what is on screen. Every number below is read from a caption of that run. Nothing else is claimed.

The timestamps follow the shots in `build/highlight/shots.txt`; for example, a caption at 57.6 s in the recording appears at 0:23.1 in the highlight.

## highlight

- [00:00.6] Every agent step, checked for grounding and drift.
- [00:05.4] AgentPulse watches AI agents that work together. It checks every step for two things. Is the answer supported by its evidence? And is the agent slowly changing?
- [00:18.0] Now we open the console.
- [00:23.3] The Overview shows live numbers: 398 spans ingested, 50 active incidents, and 2 agents drifting.
- [00:33.8] RAG Live: three agents answer, and each step is scored.
- [00:39.0] The first question comes from the chat's own documents.
- [00:50.5] It is sent. A retriever, a verifier and an answerer each run, with their time, provider and model.
- [01:00.3] The agent ledger has one row per agent step, with its grounding risk and verdict.
- [01:06.8] The answerer is contradicted, at 0.666.
- [01:13.2] The third question is outside the documents: which planet has the shortest day?
- [01:24.7] The documents cannot answer this. The retriever and the verifier are contradicted. The answerer is unverifiable.
- [01:34.8] All steps are scored, and the worker raised an alert on this trace.
- [01:41.2] Next, the Telemetry Lab.
- [01:44.3] This is the hallucination scenario. The verifier and the analyst say things their evidence does not support.
- [01:58.3] All 5 spans are scored. Grounding failure and high hallucination risk fired for the analyst.
- [02:09.7] Every answer leaves a trace.
- [02:13.6] We filter to errors, and open one trace.
- [02:18.0] The span inspector shows one agent step: its input, its output, and its grounding score.
- [02:25.6] The verdict badge says unverifiable, with grounding risk 0.37.
- [02:33.6] Pressing X saves the whole trace as a JSON file.
- [02:42.7] Next, incidents, and an agent's drift.
- [02:48.5] Incidents lists every alert, newest first. 50 are active right now.
- [02:58.9] The diagnosis panel shows the rule, the agent, the trace and the flagged span. It does not invent a root cause.
- [03:11.8] Drift compares an agent's latest 12 outputs with its first 20. It fires when the distance passes 0.3.
- [03:24.9] For the drift demo agent, the distance is 0.968, so it counts as drift.
- [03:35.4] Back on the Overview. Spans ingested went from 398 to 456 during this demo.
- [03:46.4] Everything you saw is live, on one small Azure VM. Thank you.
- [03:52.0] AgentPulse is live. Open it yourself at the address on screen.

## full

- [00:00.8] Every agent step, checked for grounding and drift.
- [00:08.8] AgentPulse watches AI agents that work together. It checks every step for two things. Is the answer supported by its evidence? And is the agent slowly changing?
- [00:22.3] The landing page explains how agents can fail between the lines.
- [00:28.2] This section shows what judging every span with a large model would cost.
- [00:34.4] An interactive explainer shows how the evaluator reads a claim.
- [00:40.4] Here, a trace is shown step by step.
- [00:46.5] And this one goes from a baseline to drift.
- [00:52.6] The console: the Overview.
- [00:56.0] We open the console with Launch App, top right.
- [01:04.8] The Overview shows live numbers: 398 spans ingested, 50 active incidents, and 2 agents drifting.
- [01:17.4] RAG Live.
- [01:20.8] Each question runs a retriever, a verifier and an answerer. Every step is sent to AgentPulse as a span, and scored there.
- [01:31.6] The questions are made up on the spot. Two come from the chat's own documents. One is general knowledge that the documents cannot answer.
- [01:41.4] Question 1 is about telemetry performance baseline KPI definitions.
- [01:55.0] It is sent. The three stages show their time, provider and model. The answerer is told to use only the retrieved evidence.
- [02:04.9] The agent ledger has one row per agent step, with its grounding risk and verdict.
- [02:11.3] The answerer is contradicted, at 0.666.
- [02:17.4] All spans are scored, and the worker raised a drift alert on this trace. Each alert names the agent and the score that crossed the threshold.
- [02:31.0] Question 2 is about the DeBERTa paper, also from the documents.
- [02:53.2] This time all three steps are contradicted, with risks above 0.9.
- [02:59.3] The worker raised a grounding failure and a high hallucination risk alert.
- [03:09.2] Question 3 is outside the documents: which planet has the shortest day?
- [03:25.0] The documents cannot answer this. The retriever and the verifier are contradicted. The answerer is unverifiable.
- [03:35.1] Again, all spans are scored, and an alert was raised on this trace.
- [03:47.8] The Telemetry Lab: faults injected on purpose.
- [03:55.7] A simulator sends made-up agent spans with a known fault. The real evaluator scores them, and the results are read back from the API.
- [04:07.4] First, a clean run, with no fault. Nothing should fire.
- [04:21.0] 5 of 5 spans scored, and no alert stored. That is the expected result.
- [04:27.8] Next, hallucination. The verifier and the analyst say things their evidence does not support.
- [04:42.0] 5 of 5 spans scored. Grounding failure and high hallucination risk fired for the analyst.
- [04:54.5] Tool-claim mismatch: the retriever claims 10 papers, when its tool returned 3.
- [05:07.9] The tool claim mismatch alert fired for the retriever.
- [05:12.9] Drift: a demo agent sends 20 billing support replies, then 12 about mountain hiking.
- [05:31.1] Drift distance 0.968. Drift detected fired.
- [05:37.6] Disagreement: two agents give conflicting answers. This alert was withdrawn after it measured at chance, so no alert is expected.
- [05:52.9] 2 of 2 spans scored, and no alert stored, as the card says.
- [05:58.6] Agents: every agent that has sent a span.
- [06:04.5] The roster shows 13 agents seen, and 3 drifting. Each card shows spans, latency and drift status.
- [06:17.4] The inspector shows what was measured for one agent.
- [06:23.7] Every answer leaves a trace.
- [06:32.2] Traces lists every run, newest first: 5 OK, 12 warning, 16 error and 17 unknown. A trace that is not scored yet is unknown, never OK.
- [06:46.8] Filtered to errors. The span inspector shows one agent step, and its grounding score.
- [06:54.4] The verdict badge says unverifiable, with grounding risk 0.37.
- [07:02.4] Pressing X saves the whole trace as a JSON file.
- [07:11.8] APM: what the server measures about itself.
- [07:19.3] All systems operational. API latency, p50, is 51 milliseconds over 8,474 requests, and the evaluator is alive.
- [07:32.4] Incidents: every alert, newest first.
- [07:38.5] 50 incidents are active right now. The newest is a drift alert for the drift demo agent.
- [07:48.9] The diagnosis panel shows the rule, agent, trace and flagged span.
- [07:55.7] Drift: the latest outputs against the first.
- [08:04.1] Drift compares an agent's latest 12 outputs with its first 20. It fires when the cosine distance passes 0.30.
- [08:17.2] For the drift demo agent, the distance is 0.968, so it counts as drift.
- [08:25.2] Replay, experiments, datasets and settings.
- [08:33.1] Replay steps through a recorded trace, one span at a time.
- [08:50.6] Experiments: this instance has no result files loaded, and the screen says so.
- [09:03.7] Datasets: labelled test cases for the evaluator. The API lists one benchmark, with 2 cases.
- [09:17.9] Settings: DeBERTa for grounding and MiniLM for drift, both on CPU. The median time per span is 138 milliseconds.
- [09:28.7] Back on the Overview.
- [09:37.9] Spans ingested went from 398 to 456 during this demo. Active incidents: 50 then, 50 now.
- [09:48.9] Everything you saw is live, on one small Azure VM. Thank you.
- [09:56.6] AgentPulse is live. Open it yourself at the address on screen.

## highlight_v2

Shorter lines for the 2-minute cut, spoken at rate 1.1. Same rule: every number is read from a caption of the run.

- [00:00.3] Every agent step, checked. Live.
- [00:05.0] AgentPulse watches AI agents that work together.
- [00:11.4] Open the console.
- [00:15.2] Live numbers: 398 spans, 50 incidents, 2 drifting.
- [00:21.2] RAG Live. Three agents answer each question.
- [00:26.8] Each step is timed, and scored.
- [00:30.6] The ledger scores every agent.
- [00:33.8] The answerer is contradicted: 0.666.
- [00:39.8] And the worker raises an alert.
- [00:42.8] Now a question the documents cannot answer.
- [00:48.8] The verifier is contradicted: 0.973.
- [00:54.0] The Telemetry Lab injects a hallucination on purpose.
- [01:00.6] Grounding failure fires, for the analyst.
- [01:05.6] Traces: 16 errors on this page.
- [01:11.2] Filter to errors, and open one.
- [01:16.4] Its verdict: unverifiable, grounding risk 0.37.
- [01:24.4] Press X, and the whole trace is saved as JSON.
- [01:29.2] Incidents: 50 active, newest first.
- [01:35.6] Each one shows the rule, the agent, and the trace.
- [01:40.8] Drift compares an agent's latest outputs with its first.
- [01:49.6] Distance 0.968. Above 0.30, so it is drift.
- [01:56.0] Spans went from 398 to 456 during this demo.
- [02:02.0] AgentPulse is live. Open it yourself.
