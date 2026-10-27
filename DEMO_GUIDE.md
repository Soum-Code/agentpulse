# Demo guide: the RAG chat in five minutes

This guide is for the viva. It walks through the live RAG chat and what AgentPulse records about each answer. `DEMO.md` is the longer, ten-minute script for the whole console.

The rule for the whole demo: say only what the screen shows. If a value is pending, unknown or missing, say so; do not fill it in from memory.

Site: https://agentpulse.centralindia.cloudapp.azure.com

---

## Ten minutes before: checklist

1. **Chat service ready.**

   ```bash
   curl -s -w "\n%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/chat/health
   ```

   Expect `200`. A `503` means the chat is paused, starting up or broken; the body says which. A pause is the file `~/agentpulse/chat-control/paused` on the VM (`deploy/azure/README.md`).

2. **API ready.**

   ```bash
   curl -s -w "\n%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/v1/health/ready
   ```

   Expect `200`.

3. **Warm-up question.** Open the site, then **Launch App**, then **RAG Live** in the dock. Ask the WAL question below once. This loads the models and shows that a provider answers.

   Then wait until the monitor's ledger shows scores for all three agents. That proves the evaluator worker is running.

   If the badge at the top of the monitor says "Evaluator offline", the worker is down. Fix that before the room fills. "Evaluator unknown" or "checking…" means the health check got no answer yet; press its refresh button.

4. **Limits.** Each visitor IP gets 5 turns a minute and 40 a day, and the site gets 300 a day (`demo/chat_guard.py`). The rehearsal spends some of these, so keep it short.

5. **Tabs.** Keep the console on **Traces** open in a second tab for step 5 of the demo.

---

## The demo (about 5 minutes)

### 1. Open the chat (20 s)

Open the site, then **Launch App**, then **RAG Live**. The chat is on the left and the monitor is on the right.

> Every question runs through three agents, each on a hosted model: a retriever, a verifier and an answerer. Every step is sent to AgentPulse as a span and scored there.

### 2. An in-corpus question (90 s)

Ask: **how does SQLite WAL improve concurrency?**

While it runs, point at the three stages: retriever, then verifier, then answerer. When it finishes, show what each stage reports:

- its time in milliseconds;
- the provider and model that answered;
- the number of failovers, if a provider failed and another took over.

The total is the sum of the stage times. If a time is missing, the screen shows a dash, not 0 ms.

> The answer comes from the retrieved document "SQLite Write-Ahead Logging (WAL) Architecture". The answerer is told to use that evidence and nothing else.

### 3. The monitor and the agent ledger (90 s)

On the right, open the **Agent ledger (this turn)**. It has one row per agent span, with:

- model;
- latency;
- tokens;
- grounding risk;
- evaluation stage;
- verdict.

While the worker is still scoring, a row says pending. The alerts line says "Unknown so far" until every agent's span has arrived and has been scored. It never says "None raised." early.

**About "Unverifiable" (say this plainly):**

> The grounding check is an NLI model, DeBERTa-v3. It compares each claim with the evidence the agent was given. The risk score is the contradiction probability plus 0.3 times the neutral probability. So 0 is safe and 1 is risky.
>
> "Unverifiable" means the model found the evidence neither supports nor contradicts the claim. That happens a lot here, because the evidence the retriever passes on is a short premise, so a fuller answer adds detail the premise does not contain. It is not an error and not a pass: it is what was measured. The low score is the 0.3 weight on neutral, and the verdict is shown next to it so the score is not read as "supported".

### 4. An out-of-corpus question (45 s)

Ask: **who won the 2022 football world cup?**

The corpus has no document about football. Show what the verifier and answerer say, and what the ledger records for this turn. Read it from the screen; do not predict it.

> This is the case grounding exists for: the answer has no support in what was retrieved, and the score and verdict show that per span.

### 5. The trace in the console (45 s)

Press **Traces** in the RAG header, or switch to the console tab, and select the newest trace. Show the spans of the three agents in the inspector. Then press **X**, which exports the selected trace as JSON. Say:

> Everything on these screens is in this file. Nothing in it is computed in the browser.

A trace whose spans are not scored yet is shown as **Unknown**, never OK, until the worker has scored it.

### 6. Optional: the Telemetry Lab (60 s, only if there is time)

In the console, open **Telemetry Lab** and run the **hallucination** scenario. After the worker scores it (usually within half a minute), the trace turns red in Traces and a HIGH alert appears under Incidents. Until then the trace stays Unknown.

---

## If something goes wrong

| What appears | What it means | What to say or do |
|---|---|---|
| **Limit reached** | The per-IP or site limit (5 a minute, 40 a day per IP, 300 a day for the site). | "That is the abuse limit doing its job." Wait a minute, or show an earlier turn. |
| **Providers at their limit** or **Provider failed** | Every hosted model provider refused or failed for this step. These are free tiers with their own rate limits. | "The failover tried every provider in the chain; the screen says which." Press Retry once. If it fails again, move on to the ledger of an earlier turn. |
| **Chat starting up** | The service is still loading its models after a restart. | Wait 30 to 60 seconds and retry. |
| **Chat paused** | The pause file is set on the VM. | Remove `~/agentpulse/chat-control/paused` before the demo. |
| **Evaluator offline** | The health answer says no worker is alive, so nothing will be scored. | Say so. The chat still answers, but the ledger stays pending. |
| **Evaluator unknown** | The API did not answer the health check. The worker may be fine. | Press the refresh button next to the badge. |

Never call a failure a success. "The provider was rate-limited, and the screen says so" is a better answer than a smooth one.

---

## The honest limits (say these before you are asked)

- **Inter-agent disagreement was withdrawn as an alert.** On real multi-agent traces it detected 0 of 10 independently labelled contradictions (README, `COMPETITIVE_POSITIONING.md` 5.2). The score is still stored, but no alert is raised on it.
- **Tool-claim validation does not work on real traces.** It scored F1 0.000 on a real-data benchmark, and extracted no claim at all from 8,353 prose spans. It only fires when an agent writes a count in digits (`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` section 10).
- **Grounding quality was measured on 68 hand-labelled cases.** That is small, and only one of them is a neutral failure, so the data cannot measure what the 0.3 neutral weight buys (`GROUNDING_RECALIBRATION_2026-10.md`).
- **Grounding and drift are the two signals that held up.** They are why the monitor's header says "Grounding & Drift only".
