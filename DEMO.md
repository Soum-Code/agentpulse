# Demo script

Eight to ten minutes, for a technical review. Every number here is measured and
every step was run end to end against the deployed instance before this file was
written.

If you only remember one thing to say, make it the trade in section 1. It is the
thing that makes the rest of the project make sense.

---

## Ten minutes before

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/
```

Expect `200`.

**Do not demo the login.** Google sign-in is blocked until
`agentpulse.centralindia.cloudapp.azure.com` is added to the Firebase project's
authorized-domains list (Authentication → Settings → Authorized domains).
Nothing in the demo needs an account — open the console directly.

Have two browser tabs ready: the public page, and the console on **Overview**.
Also have a terminal open with the instance's API key exported, because section 4
fires the scenarios from there:

```bash
export KEY=...        # AGENTPULSE_API_KEY from the VM's .env
```

Rehearse one scenario before the room fills. The alert should appear in the
Incidents view within about 25 seconds.

---

## 1. The problem — 45 seconds, screen off

> When an LLM agent fails, nothing crashes. It returns HTTP 200, in fluent
> prose, on time. The failure is in the content, not the transport, so there is
> no stack trace and no line number to debug from.
>
> The usual answer is LLM-as-a-judge. It bills per token and adds seconds per
> span, so teams sample. Sampling is exactly how a rare hallucination goes
> unseen.

Then the sentence the whole project rests on:

> So I made a different trade: small discriminative models on local CPU. Narrower
> coverage than a general judge, in exchange for being cheap enough to score
> **every** span. No sampling.

---

## 2. It is actually deployed — 1 minute

Open the site.

> This is running on an Azure VM behind HTTPS with an auto-renewed certificate.
> It is not a mock. There are over 20,000 traces and 50-odd agents of real data
> in it right now.

Open the console → **Overview**. Point at the counters.

---

## 3. The integration — 45 seconds

Show the SDK section, Python tab.

```python
client = pulse.instrument_llm(OpenAI())
```

> That is the whole integration. One line, and your code runs unchanged
> afterwards.
>
> It is also framework-independent by design. Every agent calls an LLM, so
> wrapping that call reaches all of them with one implementation — and it is the
> most useful place to stand, because the prompt and the completion are the exact
> pair the grounding evaluator compares.

---

## 3.5 What is actually running — know this cold

Someone will ask whether a real LLM is involved. Answer it before they ask;
being caught on it is much worse than volunteering it.

**No model generates the agent text anywhere in this project.**

- `POST /v1/simulate` writes five spans whose outputs are string literals in
  `backend/app/routers/ingest.py`. The scenario flag picks between two versions
  of each string.
- `demo/research_assistant.py` is a five-node LangGraph pipeline with no
  `openai` or `anthropic` import in it at all.
- `instrument_llm()` is tested against stub clients. The OpenAI and Anthropic
  SDKs are not test dependencies; the tests exercise the two things the wrapper
  reads — the module a client's class comes from, and the response shape.

**What is real is everything downstream of the text.** MiniLM and DeBERTa
genuinely run, on CPU, on whatever strings they are handed. The queue leases and
retries. The alert rules fire off measured scores. The drift maths runs on real
embeddings. The grounding benchmark — F1 0.963 — is real inference over a real
held-out split.

Say it like this:

> The agent outputs are fixtures. The judgement is real.
>
> AgentPulse is the observability layer, not the agent. It does not need to
> generate the text in order to evaluate it — and fixtures are better for a demo,
> because the failure is reproducible and you get the same score every time.
> Point it at a live OpenAI client with one line and it scores that instead.

What that costs, stated plainly if pressed:

> It means I have measured the evaluator carefully and I have not yet measured
> the system against live production traffic. Those are different claims and I am
> only making the first one.

---

## 4. Break it live — 3 minutes

**This is the demo.** Everything before it is setup.

Open the **Telemetry Lab**, choose **Tool-claim mismatch**, press **Run
scenario**. It answers `5 spans accepted` immediately.

If the console is unavailable, the same thing from a terminal:

```bash
curl -s -X POST https://agentpulse.centralindia.cloudapp.azure.com/v1/simulate \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"scenario":"tool_mismatch","query":"Retrieval claim check"}'
```

While it runs:

> I am running a five-agent research pipeline. The retriever agent is going to
> claim it found 10 papers. The tool actually returned 3. Nothing will error, and
> the output will look completely normal.

Switch to **Incidents**. The alert lands in roughly 20 to 25 seconds.

> There it is. `TOOL_CLAIM_MISMATCH`, mismatch rate 1.0.
>
> No model was asked anything for this one. It reads the claim, reads what the
> tool actually returned, and compares. Either the numbers match or they do not.

Now fire `hallucination` the same way, and open the incident.

> Here the prompt says the Eiffel Tower is in Paris. The model answered Berlin.
>
> The worker hands DeBERTa a premise and a hypothesis and asks whether the second
> follows from the first. It comes back `contradiction` with near-total
> confidence, which is a grounding score of 0.9999 — and both
> `GROUNDING_FAILURE` and `HIGH_HALLUCINATION_RISK` fire.

The four scenarios are `clean`, `hallucination`, `tool_mismatch` and `drift`.

---

## 5. The numbers — 90 seconds

> Grounding F1 is **0.963** with a false positive rate of **0.059**, on a
> held-out split. Latency is **215.9 ms** — 27.8 for MiniLM plus 188.1 for
> DeBERTa. Both run on every span.

If anyone calls it a cascade, correct it. Volunteering this lands better than
being caught by it:

> People assume it is a gated cascade. It is not. There is no threshold between
> the stages.
>
> And you can prove that without reading the code: 215.9 is exactly 27.8 plus
> 188.1. A gate that ever fired would put the number somewhere between the two.

---

## 6. Drift, and why it was rebuilt — 90 seconds

This is the best story in the project. It shows measurement changing a decision.

> The first drift metric compared each output against a running centroid. On 500
> real sessions it flagged **91.7%** of them. That is not a detector, that is
> noise.
>
> So it was rebuilt: the mean of a 12-sample window against a 20-sample baseline
> pool. False alarms dropped to **6.8%**, AUC 0.9532. The alert fires on that
> metric, and the old one is still recorded but drives nothing.
>
> It costs something. An agent needs 20 plus 12 — **32 evaluated spans** — before
> a sustained value exists at all. Until then it is null, and the dashboard shows
> it as null rather than as zero or as healthy.

That last point generalises to a rule worth stating out loud:

> A value the system did not measure is never displayed as if it did.

---

## 7. Close on the limits — 1 minute

Do not skip this. In a review it is worth more than another feature.

> Here is what does not work.
>
> The benchmark is 30 held-out cases. That is enough to show the pipeline works
> at a chosen operating point. It is not enough to claim generalisation, and I am
> not claiming it.
>
> Tool-claim needs the count narrated in prose. A harness that emits a structured
> `tool_call` field without narrating it produces no claim to check.
>
> Grounding misreads rounded numbers: "7.61 billion" against "approximately 7.6
> billion" scores 0.922 risk. It is reproducible and deliberately unpatched,
> because fixing it from one observed case is fitting to one data point.

---

## Questions you should expect

**Is a real LLM in the loop?**
> Not for generating the agent text — those are fixtures, and section 3.5 says
> why that is the right choice for a demo. Everything downstream is real: the two
> models run on CPU and produce the scores you see, and one line points the SDK
> at a live OpenAI or Anthropic client instead.

**Why not an LLM judge?**
> Cost and latency. A judge bills per token and adds seconds, so teams sample. I
> chose to score every span instead. The measured cost of that choice is narrower
> coverage, and I can show you exactly where it is narrower.

**Only 30 cases?**
> Yes, and I am not claiming generalisation from it. Expanding the benchmark and
> re-running the ablation is the first item on the next-steps slide.

**Does it scale?**
> SQLite with WAL is adequate to around 100k traces. It is built for self-hosted
> single-instance use, not multi-writer deployment. Scale was never the binding
> constraint here — framework breadth was.

**Does any data leave the machine?**
> No. Both models run on local CPU through ONNX Runtime. No prompt text leaves
> the host, and there is no external API in the evaluation path.

**What happens if the evaluator crashes mid-job?**
> The job is leased for 120 seconds with an attempt counter. If the worker dies
> the lease expires and another worker reclaims it. Persistence is keyed on span
> id and no-ops if an evaluation already exists, so a replayed job cannot
> double-write. There is a test that kills a worker mid-evaluation and asserts
> exactly one result.

**How do I know the tests mean anything?**
> The dashboard suite was verified by mutation, not by passing: reintroducing the
> severity bug failed one test, reintroducing the absolute-URL bug failed three.
> A test that passes proves nothing about what it would catch.

---

## If something goes wrong on the day

| symptom | what to do |
| --- | --- |
| Alert does not appear within ~30 s | Check the worker is alive on the platform panel. Evaluation is async; the API accepting spans and nothing evaluating them are separate states, and the console reports them separately. |
| Drift shows null | Expected under 32 spans for that agent. Say so — it is the design, not a failure. |
| Sign-in error appears | You clicked Sign In. Close it; the demo does not need an account. |
| Site is slow on first load | The bundle is 2.4 MB and is not code-split. It is on the next-steps list. |
| Someone clicks the APM Performance tab | Known bug: the tab is reachable but renders nothing. Say so and move on. |
| The Lab shows a red error | It is telling you the truth — the API refused the run. Read the message; it carries the status. Fall back to the curl command. |
