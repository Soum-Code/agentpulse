# AgentPulse, explained simply

The short version of how this works, start to finish, in plain language.

For exact thresholds, formulas and file references, read [HOW_IT_WORKS.md](HOW_IT_WORKS.md). This page is the story; that one is the specification.

**Running instance:** <https://agentpulse.centralindia.cloudapp.azure.com> — the screens described here, with real evaluated telemetry behind them.

---

## 1. The problem

You build an agent. It reads a document, thinks, calls a search tool, and writes an answer. It works. You ship it.

Two weeks later somebody notices the answer was wrong. Not crashed — **wrong**. The agent said the search returned twelve papers when it returned three. Or it wrote a confident summary about something the source document never said. Nothing threw an exception. Every log line is green. Latency was fine. Cost was fine.

That is the gap. Existing tools measure whether your agent **ran**. Almost nothing measures whether it was **right**.

## 2. What AgentPulse does

> It watches every step your agent takes and asks whether the agent's output is actually supported by what it was given.

Not by sampling one call in a hundred for a quality review later. Every step, as it happens.

### The thing people assume, which is wrong

Most people hear "AI evaluation" and assume there is a big LLM sitting in the middle, judging. There is not.

**AgentPulse never calls an LLM.** Your LLM is yours, outside the system. AgentPulse uses two small models that run locally on a normal CPU:

- **MiniLM** turns a sentence into a list of numbers, so two sentences can be compared for meaning.
- **DeBERTa** is a classifier. Give it two pieces of text and it answers one question: does the second follow from the first, contradict it, or neither?

That is it. No prompts, no API keys, no bills, no waiting three seconds per check. This choice was measured, not assumed — see section 7.

## 3. The three pieces

```
   your agent           AgentPulse
   ──────────           ──────────────────────────────────────

   ┌─────────┐          ┌─────────┐        ┌─────────┐
   │  your   │  spans   │   API   │  jobs  │ worker  │
   │  code   │ ───────► │         │ ─────► │         │
   │  + SDK  │          │ accepts │        │ judges  │
   └─────────┘          └────┬────┘        └────┬────┘
                             │                  │
                             └──────┬───────────┘
                                    ▼
                               ┌─────────┐
                               │database │
                               └────┬────┘
                                    ▼
                               ┌─────────┐
                               │dashboard│
                               └─────────┘
```

| Piece | Job | Why it is separate |
| :--- | :--- | :--- |
| **SDK** | Sits in your code, reports what happened | Must never slow your agent down |
| **API** | Takes the reports, writes them down | Answers instantly, loads no models |
| **Worker** | Does the actual judging | Slow and heavy, must not block anything |
| **Dashboard** | Shows you the result | Reads only |

The split matters. Judging takes about 200 milliseconds and needs a gigabyte of memory. If that happened inside your agent's request, your agent would be 200 ms slower on every step. Instead the API says "got it" in a few milliseconds and the worker catches up in the background.

## 4. Follow one span all the way through

This actually ran, and the numbers below are from that run rather than made up
for the example.

One thing to be exact about, because it is easy to misread: **the answer below
is a fixture, not something a model produced.** No model generates agent text
anywhere in this project — not here, not in the simulator, not in the demo
pipeline. A real model would not tell you the Eiffel Tower is in Berlin, which
is the point: the wrong answer is chosen so the check has something definite to
catch.

Everything after that answer is real. The span was really recorded, really
queued, really scored by DeBERTa, and really raised two alerts. What is being
demonstrated is the evaluation, and evaluating text does not require producing
it.

### Step 1 — your code

You add one line:

```python
client = pulse.instrument_llm(OpenAI())
```

Now every completion this client produces gets reported. You change nothing else.

### Step 2 — the call happens

Your agent asks a question. The prompt includes a fact:

> *Where is the Eiffel Tower? It stands in **Paris, France**.*

The answer that comes back:

> *The Eiffel Tower is located in **Berlin, Germany**.*

Your agent does not notice. Why would it — it got a fluent, confident, well-formed answer, with a 200 status, on time. This is the whole problem in one line: nothing about the shape of that response is wrong.

### Step 3 — the SDK reports it

It packages up: which agent, when, how long it took, which model, how many tokens, the prompt, and the answer. This is called a **span** — one step of one run.

It sends this in the background. Your agent has already moved on.

### Step 4 — the API writes it down

The API stores the span and puts a job in a queue: *someone should evaluate this*. Then it replies `202 Accepted` and forgets about it.

The queue is durable. If the worker dies mid-evaluation, the job comes back and gets done by another one. Nothing is quietly lost.

### Step 5 — the worker judges it

The worker picks up the job and asks DeBERTa one question:

> Premise: *the Eiffel Tower stands in Paris, France*
> Hypothesis: *the Eiffel Tower is located in Berlin, Germany*
> Does the second follow from the first?

DeBERTa answers: **contradiction**, with near-total confidence.

That becomes a grounding score of **0.9999** on a scale where 0 is perfectly supported and 1 is completely unsupported.

### Step 6 — it raises an alarm

The score is above the threshold, so two alerts fire:

```
GROUNDING_FAILURE          HIGH
HIGH_HALLUCINATION_RISK    HIGH
```

### Step 7 — you see it

The dashboard shows a red incident. You click it and see the prompt next to the answer, side by side, with the score.

**Total elapsed: under a second.** Your agent never slowed down, and nobody had to read a log.

## 5. The four questions it asks

Grounding is one of four. Each catches a different way an agent goes wrong.

**Is the answer supported by the input?** — the Eiffel Tower case above. Catches confident invention.

**Did it lie about a tool?** — the agent says "I found 12 papers" but the search tool returned 3. Or it names a tool it never called. This one needs no AI at all: it reads the claim, reads what the tool actually returned, and compares. Either the numbers match or they do not.

**Do the agents contradict each other?** — in a pipeline, agent A says the deadline is March and agent C says it is June. Each is individually fine. Together they cannot both be right.

**Has this agent changed?** — an agent that behaved one way for a month starts behaving differently. Nothing is broken and nothing errors; it has simply drifted. This is the hardest of the four and it has a real story behind it, in section 7.

All four are combined into one **risk score** per step, weighted by how much each signal is trusted, so one number tells you whether a step is worth looking at.

## 6. What you actually look at

Ten pages. The three that matter most:

- **Overview** — is anything wrong right now? Spans seen, active incidents, agents that are drifting.
- **Incidents** — what fired, and has anybody dealt with it?
- **Replay** — walk through one run step by step, and for any step see what went in, what came out, and what each check said.

The rest cover per-agent history, drift over time, saved datasets and experiments, a lab for firing test scenarios, and settings.

## 7. Two things worth being honest about

A system like this is only useful if you believe its numbers. So here are the two places where the honest answer is not the flattering one.

### The drift signal was wrong, and was rebuilt

The first version compared each output against the agent's running average. On 500 real sessions it flagged **91.7%** of completely normal operation as drift.

It was not broken. It was measuring the wrong thing: a multi-step agent naturally varies a lot from step to step, and that variety swamped any real signal.

The fix was to compare a *window* of recent outputs against a *window* of older ones, which averages the noise out. Same threshold, same models: false alarms fell to **6.8%**.

The cost is honest too — the new metric needs 32 evaluated steps before it can say anything at all. A fresh install shows no drift for a while. That is the measurement working, not missing.

### The LLM judge scored better

We built the obvious alternative — a real 8-billion-parameter LLM as judge — and ran it head to head on the same 30 cases.

| | AgentPulse | LLM judge |
| :--- | ---: | ---: |
| Speed | **203 ms** | 3,170 ms |
| Tokens generated | **0** | 7.3 per check |
| Accuracy (F1) | 0.963 | **1.000** |

**The judge won on accuracy.** We do not claim otherwise.

But look at where the difference came from. Of those 30 cases, 10 had labels built mechanically and 20 were labelled by LLM judges. On the 10 unbiased cases **both scored perfectly**. The judge's entire lead came from the cases where LLM judges wrote the answer key — which naturally favours an LLM judge.

Across all 30, the two systems disagreed on exactly **one** case: the source said "7.61 billion" and the answer said "approximately 7.6 billion". The judge understood that rounding. DeBERTa scored it as high risk.

That is a real weakness and it is written down rather than quietly fixed, because patching a model based on one observed example is fitting to one data point.

So the defensible claim is narrow: **15.6x faster, zero tokens, same result every time, and one known blind spot.** For something that runs on every step of every run, that trade is the point.

## 8. What it does not do

- It does not stop your agent. It observes and reports; it never blocks or rewrites.
- It does not tell you *why* something went wrong, only that it did and which step.
- It does not need the internet or any paid API. Everything runs on your machine.
- It does not see the text unless you let it. Capturing prompts is off by default, because a prompt is the most sensitive thing here. With it off you still get scores of everything except grounding, which needs the text to compare.

---

**Next:** [HOW_IT_WORKS.md](HOW_IT_WORKS.md) for the full specification — every threshold, every formula, and the places where the code and its own documentation disagree.
