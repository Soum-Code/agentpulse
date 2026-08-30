# Frontend Design Research — Reference Baseline

The biggest conclusion first: **AgentPulse should have two distinct design modes.**

| Surface | Character |
| :--- | :--- |
| **Public experience** | expressive, editorial, spatial |
| **Product experience** | calm, precise, investigative |

That distinction is what keeps the product premium without sacrificing engineering
usefulness. Every reference below is judged against it — a reference that improves the
landing page is not automatically allowed near the trace view.

---

## 1. The reference universe

**Primary visual references**

- Apple Design Resources / HIG
- DesignPrompts.dev — especially Monochrome
- Squarespace template system

**Interaction references**

- Raycast
- 21st.dev

**AI-observability / product references**

- LangSmith
- Arize Phoenix
- Langfuse
- W&B Weave
- Honeycomb
- Grafana Agent Observability
- Datadog Agent Observability
- Braintrust

These references solve *different* problems. That is the important part — they are not
interchangeable, and mixing their solutions is how a product ends up looking assembled
rather than designed.

---

## 2. Apple — the material and interaction authority

Apple's current HIG makes a distinction worth adopting directly: **Liquid Glass is for the
functional layer** — navigation, controls, floating surfaces — **while standard materials
carry content.** Apple also recommends using Liquid Glass sparingly, choosing thickness and
translucency based on context and legibility.

### What we take

Material hierarchy:

```
Environment
   ↓
Content layer
   ↓
Functional layer
   ↓
Transient focus
```

**AgentPulse translation**

*Standard material* — trace rows, execution tree, metrics, evidence, experiment tables.

*Liquid Glass* — connection surface, floating navigation, command palette, contextual
controls, transient inspectors, high-priority overlays.

### What we do not take

- Apple navigation shapes
- macOS window conventions
- iOS cards
- Apple-specific icons as a visual identity
- visionOS UI replication

**Result:** AgentPulse can feel Apple-refined without being recognisable as "Apple UI".

---

## 3. DesignPrompts — Monochrome as a discipline

The Monochrome style is described as black/white discipline built on contrast, space and
type; related descriptions emphasise stark editorial composition and oversized type.

The more interesting idea is **not the palette**. It is that the same underlying content can
feel radically different through design alone — the premise of DesignPrompts is a shared
data structure reinterpreted through many visual systems.

### What we take

At rest:

```
black
grey
white
space
type
```

On interaction:

```
attention
   ↓
color
   ↓
depth
   ↓
detail
```

This supports the original idea directly: *a photo or object is monochrome until
interaction reveals its colour.* Adapted to telemetry:

| State | Mark |
| :--- | :--- |
| Agent at rest | `○` |
| Hovered | `◉` |
| Problem | `◉` amber |
| Critical | `◉` rose |

So **colour becomes semantic state, not theme decoration.**

### What we don't take

The site's serif / fashion-editorial treatment, applied wholesale. AgentPulse stays
technical.

---

## 4. Squarespace — composition, not components

Squarespace's template library is large and deliberately varied. The useful lesson is its
**composition discipline**, not its component library.

### What we take

- asymmetric layouts
- strong typographic scale
- deliberate whitespace
- visual rhythm
- controlled section transitions
- hierarchy before decoration

### Where it belongs

The landing page, above all.

```
┌─────────────────────────────────────────┐
│                                         │
│ AgentPulse                              │
│                                         │
│ See what your agents                    │
│ are actually doing.                     │
│                                         │
│                           3D system     │
│                           visualization │
│                                         │
│ Connect →                               │
│                                         │
└─────────────────────────────────────────┘
```

Not:

```
center everything
        +
three giant cards
        +
giant glass hero
```

---

## 5. 21st.dev — component mechanics only

21st.dev carries thousands of React/Tailwind components — navigation, heroes, timelines,
charts, tables, docks, cursors, empty states, popovers, search. That makes it useful, and
dangerous.

### What we take

Individual mechanisms only: command palette mechanics, search surfaces, timeline
primitives, cursor behaviour, empty-state patterns, interaction primitives, subtle
navigation transitions.

### What we don't take

Whole dashboard templates. Complete hero sections. Prebuilt "AI" themes. A full component
visual language.

Otherwise AgentPulse starts looking assembled from a component marketplace.

> **Rule:** 21st.dev provides parts, never the identity.

---

## 6. Raycast — speed and commandability

Raycast states its design principles as *fast, simple, delightful* — improving speed and
usability while preserving beauty through simplicity. Directly relevant to an engineering
tool.

### What we take

`Cmd+K` / `Ctrl+K` as a first-class command model, covering: find an agent, find a trace,
open an incident, jump to drift, open an experiment, navigate settings.

Interaction philosophy:

```
minimum movement
minimum friction
maximum context
```

### What we don't take

A Raycast clone. Raycast contributes **interaction speed, not visual identity.**

---

## 7. LangSmith — trace investigation structure

LangSmith's observability documentation centres on tracing, filtered trace views,
performance dashboards, alerts, online evaluations and feedback/annotation flows.

### What we take

The investigation spine:

```
TRACE
  ↓
NESTED EXECUTION
  ↓
SPAN
  ↓
DETAIL
```

And the principle that **the selected trace becomes the centre of attention.**

### What we improve

Rather than an application shell that swaps pages, AgentPulse should preserve context:

```
Agent
  ↓
Trace
  ↓
Span
  ↓
Evidence
```

— without the user feeling they have left one screen for another at every step.

---

## 8. Phoenix — sessions, context and evaluation

Phoenix's tracing model supports **sessions** that group multiple traces into a
conversational thread, letting the user inspect input/output, latency, tokens and the
surrounding conversation context. It frames observability around tracing, annotations and
evaluation.

### What we take

Contextual grouping — reasoning at multiple levels:

```
Session
  ↓
Trace
  ↓
Span
```

Evaluation linkage — the trace shouldn't stop at *"here's what happened"*:

```
Trace
  ↓
Evaluation
  ↓
Evidence
```

---

## 9. Langfuse — the production → evaluation loop

Langfuse's evaluation model explicitly connects production traces to datasets and
experiments: online traces and monitoring → datasets → experiments → evaluation.

Their experiment model separates **dataset, dataset item, task, evaluator, score, and
experiment run** — a useful structure for AgentPulse's research surfaces.

### What we take

The feedback loop:

```
PRODUCTION
    ↓
interesting case
    ↓
CURATE
    ↓
DATASET
    ↓
EXPERIMENT
    ↓
RESULT
    ↓
IMPROVEMENT
    ↓
PRODUCTION
```

This is one of the strongest architectural ideas available to AgentPulse.

---

## 10. W&B Weave — multi-view trace analysis

Weave's trace view is built for complex agent execution and offers multiple
representations: trace tree, code composition, flame graph, graph view. Its traces page
combines a trace list with a hierarchical selected-trace view. Its trace plots let users
filter traces and interact with latency/cost/token charts — including clicking a chart
point to open the trace behind it.

### What we take

**One dataset, multiple views:**

```
Same trace
  ├── Tree
  ├── Timeline
  ├── Evidence
  └── Spatial context
```

**Visualisation should be navigable.** A chart is not something to look at; a point on it
should lead to the execution that produced it. That is a strong interaction rule.

---

## 11. Honeycomb — one of the most valuable references

Honeycomb's Agent Timeline is **conversation-first**: instead of starting from a span and
reconstructing what happened, it starts from the agent conversation and drills into
executions. It shows duration, model calls, tool calls, agents, retries and failures;
clicking an AI span exposes prompt, completion, tokens, model, tool and error context, and
can pivot into the full trace waterfall.

### What we take

**Failure-first navigation.** An incident should not be *table row → modal*. It should be:

```
PROBLEM
   ↓
CONTEXT
   ↓
AGENT
   ↓
TRACE
   ↓
ROOT CAUSE
```

**Horizontal multi-agent visibility.** Honeycomb's timeline uses lanes so parallel agent
work stays visually distinguishable — extremely relevant to a multi-agent product.
AgentPulse can borrow the idea without copying the visual.

---

## 12. Grafana — operational completeness

Grafana's Agent Observability combines conversations, traces, agents, costs, quality,
versions, evaluations and experiments. Its UI spans Home, Conversations, Agents,
Evaluation, Experiments and Configuration, and it integrates Agent Observability into a
command palette.

Its online evaluation model distinguishes the **evaluator definition** from the
**evaluation rule applied to traffic** — with selectors, sampling, alerts, SLOs and
actions.

### What we take

Operational completeness. AgentPulse must eventually connect:

```
OBSERVABILITY
      +
 EVALUATION
      +
  INCIDENTS
      +
 EXPERIMENTS
```

### What we don't take

Grafana-style breadth. AgentPulse doesn't need to mimic a general metrics/logs/traces
platform.

---

## 13. Datadog — correlation

Datadog's Agent Observability emphasises following one request from backend services
through agent reasoning to end-user impact, plus building versioned datasets and running
experiments.

### What we take

**Cross-context correlation.** Starting from an incident, the user should be able to move
through:

```
Incident
   ↓
 Agent
   ↓
 Trace
   ↓
  Span
   ↓
Evaluator
```

without losing the originating context.

### What we don't take

Datadog's enterprise shell. Our advantage is being far more focused.

---

## 14. Braintrust — experiments and monitoring

Braintrust is useful for the relationship between **traces, evaluation, experiments and
monitoring**.

The lesson isn't to copy its layout. The lesson is:

> Evaluation should be part of the operating workflow, not a separate academic tool.

That is directly compatible with AgentPulse's current product strategy.

---

## 15. The combined lesson

Every good reference solves a different problem. The AgentPulse architecture is defined
accordingly:

| Problem | Reference | What we take |
| :--- | :--- | :--- |
| Material | Apple | functional Liquid Glass |
| Visual restraint | DesignPrompts | monochrome-first |
| Composition | Squarespace | asymmetry + editorial rhythm |
| Components | 21st.dev | individual mechanics |
| Speed | Raycast | commandability |
| Trace | LangSmith | hierarchical investigation |
| Sessions / context | Phoenix | grouped behavioural context |
| Evaluation loop | Langfuse | trace → dataset → experiment |
| Multi-view analysis | Weave | tree / timeline / chart perspectives |
| Agent debugging | Honeycomb | conversation- and agent-first investigation |
| Operational scope | Grafana | monitoring + evaluation + experiments |
| Correlation | Datadog | end-to-end context |
| Experimentation | Braintrust | trace / eval / experiment continuity |

That is the reference architecture.

---

## 16. What the AgentPulse website should contain

This concerns the **public website**, not the application.

### Section 01 — Hero

```
AGENTPULSE

See what your agents are actually doing.

Observe.  Evaluate.  Investigate.

[ Connect to AgentPulse ]
```

*Visual:* 3D system environment. Very quiet. Monochrome. No giant card wall.

### Section 02 — The problem

Don't say *"AI is transforming the world…"*. Say:

> Your agents can fail between the lines.

Show a small execution sequence:

```
Agent
  ↓
Tool
  ↓
Model
  ↓
Result
```

Then subtly reveal: **something changed.**

### Section 03 — The product

Introduce the core loop:

```
OBSERVE
   ↓
UNDERSTAND
   ↓
INVESTIGATE
   ↓
ACT
```

Could be scroll-driven — each phase revealing a different visual.

### Section 04 — Live trace story

Instead of another feature grid, show a single trace unfolding:

```
Agent
  ↓
Tool
  ↓
Model
  ↓
Evaluation
```

Hover each stage; details appear. This teaches the product through interaction.

### Section 05 — Drift

This should be one of the hero features. Show an agent moving from:

```
normal
   ↓
deviation
   ↓
drift
```

Use spatial visualisation, then show the exact analytical view. This makes the
differentiated capability understandable.

### Section 06 — Evidence

```
Observed
   ↓
Measured
   ↓
Explained
```

The point: AgentPulse does not simply show a score. It shows what the score means and what
evidence is actually available. This aligns with the project's honesty principle.

### Section 07 — Research loop

```
Trace
  ↓
Curate
  ↓
Dataset
  ↓
Experiment
  ↓
Result
```

Strongly inspired by the production/evaluation loop used by systems such as Langfuse.

### Section 08 — SDK / self-hosting

Keep this extremely compact:

```
pip install agentpulse
```

Then a tiny instrumentation example. **Do not invent commands that don't exist** — use
whatever the actual SDK exposes.

### Section 09 — Capability maturity

This is where AgentPulse can be unusually honest:

| Capability | Maturity |
| :--- | :--- |
| Drift | BETA |
| Grounding | BETA |
| Disagreement | EXPERIMENTAL |
| Tool-claim | EXPERIMENTAL |

Stating limitations rather than hiding them can itself become a credibility signal.

### Section 10 — Final CTA

Not *"Become an AI leader."* Something simple:

> Connect your first agent.

or:

> See what your agents are actually doing.

---

## 17. The product architecture

After landing and connect:

```
LANDING
   ↓
CONNECT
   ↓
VERIFY
   ↓
OVERVIEW
```

The application then becomes:

```
OVERVIEW
   ├── Agents
   ├── Traces
   ├── Incidents
   └── Drift
           │
           ↓
      INVESTIGATION
           │
      ┌────┼────┐
      ↓    ↓    ↓
    Trace Span Evidence
             │
             ↓
          Evaluation
             │
             ↓
            Act
```

Then:

```
Act
 ↓
Curate
 ↓
Dataset
 ↓
Experiment
 ↓
Learn
 ↓
Monitor again
```

---

## 18. The most important new UX pattern

**Make context persistent.**

Suppose you are on `Agent A`, click `Trace 483`, then `Span 7`. The UI should remember:

```
Agent A
  ↳ Trace 483
      ↳ Span 7
```

You should always know: *where did I come from?*

That is one of the best opportunities available to AgentPulse.

---

## 19. Navigation architecture

Do **not** use a giant traditional sidebar as the primary visual. Use a **floating
navigation dock**.

*Main:* Overview · Agents · Traces · Incidents · Drift

*Secondary:* Replay · Experiments · Datasets · Telemetry Lab · Settings

Plus `Cmd/Ctrl + K` for fast navigation. Raycast's philosophy of a fast, simple interface
supports this kind of command-driven interaction.

---

## 20. What should NOT be implemented

Just as important as the list above.

**Visual anti-patterns**

- giant KPI wall
- generic bento layout
- permanent colourful dashboard
- glass on every element
- 3D everywhere
- permanent gradients

**Honesty anti-patterns**

- fake activity
- fake "AI reasoning"
- fake contradiction evidence
- invented evaluator internals
- fake production telemetry

**Scope and identity anti-patterns**

- unnecessary account/workspace system
- Apple clone UI
- Linear clone UI
- LangSmith clone UI

---

## 21. The final visual grammar

| Layer | Treatment |
| :--- | :--- |
| Base | monochrome editorial |
| Depth | spatial 3D |
| Function | Liquid Glass |
| Data | precise 2D |
| Semantic change | colour |
| Navigation | floating + command-driven |
| Investigation | context-preserving |
| Research | editorial / analytical |

---

## 22. The final mental model

```
                    AGENTPULSE
                 PUBLIC EXPERIENCE
                       │
                       ▼
                 LANDING / 3D
                       │
                       ▼
                    CONNECT
                       │
                       ▼
                     VERIFY
                       │
                       ▼
                  OPERATIONS
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      AGENTS       INCIDENTS        DRIFT
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                 INVESTIGATION
                       │
              ┌────────┼────────┐
              ↓        ↓        ↓
            TRACE     SPAN   EVIDENCE
                       │
                       ↓
                  EVALUATION
                       │
                       ↓
                      ACT
                       │
                       ↓
                    CURATE
                       │
                       ↓
                    DATASET
                       │
                       ↓
                  EXPERIMENT
                       │
                       ↓
                 IMPROVE AGENT
                       │
                       └────────────→ MONITOR
```

This is the architecture to actually build.

---

## Bottom line

The earlier plan of *"Apple visionOS + Linear"* was too generic. After going through the
references again, the stronger choice is:

> Apple's material discipline + DesignPrompts' monochrome restraint + Squarespace's
> composition + Raycast's speed + Honeycomb's investigation thinking + LangSmith/Weave's
> trace structure + Langfuse's evaluation loop + AgentPulse's own 3D and drift model.

That combination is far more defensible than saying *"we're Apple-like."*

Importantly, this research confirms something about the current AgentPulse project: the
backend already contains the ingredients for this workflow — real traces, alerts, drift,
evaluation, curation and research artifacts — so the UI can be built around the real
product rather than invented functionality.

**Recommendation:** freeze this as the design research baseline before asking
Antigravity/Codex to make another major visual change.
