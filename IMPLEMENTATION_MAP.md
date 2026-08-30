# AgentPulse Redesign — Implementation Map

Phase 1–3 deliverable (master prompt §40–§41): inspect the codebase, map existing functionality, identify what is genuinely implemented — **before** changing any code.

Every claim below was verified by reading the current source, not assumed.

---

## 1. Application shell

Single-page app, no router library in use for page switching — `dashboard/src/App.tsx` holds a `currentPage` state (`NavPage` union) and conditionally renders one view. `dashboard/src/components/SideRail.tsx` owns navigation, grouped by operator intent rather than a flat list:

| Group | Pages |
| :--- | :--- |
| Monitor | Overview, Traces, Incidents |
| Investigate | Replay Debugger, Drift & Stability |
| Research | Experiments, Datasets, Telemetry Lab |

These eight are the real product surface. There is no settings, teams, billing, API-key, deployment, or model-registry page — and none should be added.

## 2. Real data plumbing

All live data enters through exactly one function, `loadData()` in `App.tsx`, polling every 5s and re-firing on each WebSocket message:

```
api.getMetrics()   -> Metrics
api.getAgents()    -> Agent[]
api.getTraces(50)  -> TraceListItem[]
api.getAlerts(50)  -> AlertItem[]
```

Two further real calls exist as user actions: `api.simulatePipeline(scenario, …)` (Telemetry Lab) and `api.curateCase('v1.0_curated', payload)` (Incidents → curate modal).

`api.getTrace(traceId)` is **implemented in the client and backend but never called by any component** — this is the missing link the trace rebuild depends on.

WebSocket: `/v1/ws/live` (the route is `/v1/ws/live`, not `/v1/ws`; a mismatch here was a previously fixed bug, and the Vite proxy needs `ws: true`).

## 3. Data-truth categories

The important finding of this pass: components fall into **three** categories, not two. Treating category B as if it were category C would be a mistake.

### Category A — genuinely wired to live data

| Component | Real source |
| :--- | :--- |
| Overview stat tiles | `metrics` (total traces, spans, agents, alerts) |
| Overview `Waveform` | `riskHistory` — rolling buffer of real polled `avg_risk_score` |
| `IncidentInboxView` | `alerts` |
| `DriftCenterView` | `agents` |
| `TelemetryLabStudio` | scenario list is static, but each button fires the **real** `api.simulatePipeline` endpoint — a control panel, not fake data |
| Curate-case flow | real `POST /v1/datasets/{name}/cases`, verified end-to-end against the DB |

### Category B — real numbers, static snapshot, honestly labelled (acceptable)

These are **not bugs.** The values are true measured results committed in the repo, and the UI says so on screen.

| Component | Source of truth | Status |
| :--- | :--- | :--- |
| `ExperimentsView` | `experiments/results/*.json` — strategy latencies (DIRECT 11564.1ms / COT 45422.7ms / AOT 85215.2ms), the seven-config ablation incl. Config F's FPR 0.941, compounding-error control vs intervention | Matches `PROJECT_REPORT.md` exactly. Labelled "Snapshot of last recorded run". Leave as-is, or optionally wire to the live `/v1/experiments` endpoint (which reads the same JSON files). |
| `DatasetsView` | `datasets/v1.0_*.json` counts (21 dev / 22 val / 30 test), label provenance stated correctly as two LLM-as-judge passes at κ=0.922, not human annotation | Mostly correct — **one stale value, see below.** |

> **Real bug found in this pass:** `DatasetsView` hardcodes `v1.0_curated: 1 case`. The curated dataset is now DB-backed and live — it held **13 cases** when last verified via `GET /v1/datasets/v1.0_curated`. This number will keep drifting every time an operator curates an incident. Since a live endpoint now exists, this one should be wired rather than hardcoded.

### Category C — fabricated data presented as real (these are the bugs)

| Component | Fabrication | Evidence |
| :--- | :--- | :--- |
| `TraceWaterfallSection` (~L257) | `SAMPLE_WATERFALL_SPANS` — 5 invented spans, fake trace id `tr_e2e_research_48821`, hardcoded `totalDuration = 490` | Two different real traces ingested → byte-identical output both times |
| `EvidenceInspectorPanel` (~L336) | Invented "Zhang et al. (2024) … quantum telemetry" claim/evidence text, plus fake eval numbers (`MiniLM Similarity 0.241`, `DeBERTa Contradiction 0.985`) | Same text renders regardless of which span is selected |
| `IncidentReplayDebugger` (~L931) | `SAMPLE_REPLAY_STEPS` — same fictional Zhang narrative, invented agents/timings/risk scores | No API call anywhere in the component |
| `AgentTopologySection` (~L131) | `TOPOLOGY_NODES` — invented agent names/roles ("Researcher / Query Planner" etc.), though it *does* merge real `agents` data for ASI/risk/span counts where ids happen to match | Partially real: fake identity, real metrics |

## 4. Per-page plan

| Page | Category | Work required | Regression risk |
| :--- | :--- | :--- | :--- |
| Overview | A + C | Keep stats/waveform. Rebuild topology to render **real** agents instead of `TOPOLOGY_NODES`. Rebuild trace waterfall per `TRACE_WATERFALL_REBUILD_PROMPT.md`. | Medium — topology currently merges real metrics onto fake nodes; must not lose the metric display when node identity becomes real |
| Traces | — | Verify what the standalone Traces page renders today (not yet inspected in depth) | Unknown until inspected |
| Incidents | A | Visual pass only. Do not touch the curate flow — it is verified working end-to-end | Low, but the curate modal is the app's only write path — regression here is costly |
| Replay Debugger | C | Needs a real data source. `getTrace` gives ordered spans with timings, which is the natural backing for a replay timeline | High — no real equivalent exists yet; may need honest empty state if a trace lacks the needed detail |
| Drift & Stability | A | Visual pass only | Low |
| Experiments | B | Visual pass. Optional: wire to `/v1/experiments` | Low |
| Datasets | B | Visual pass + **fix the stale curated count** by wiring to `/v1/datasets` | Low |
| Telemetry Lab | A | Visual pass only. Buttons trigger real backend work — keep them functional | Medium — these fire real pipeline simulations |

## 5. Constraints carried into every phase

- **Tailwind v3 syntax only.** A prior `shadcn init` injected v4 CSS and broke the build entirely; it was reverted and its leftover files (`components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`) have now been deleted. There is no `components/ui/` directory — `src/components/ui.tsx` is the real primitives file.
- **Disjoint colour law.** Cyan = identity/interaction only. `state-*` = risk only, always via `riskTone()`. Cyan must never mean "healthy".
- **Fonts** are IBM Plex Sans (sans) + JetBrains Mono (all numerics, with `.tnum`). Declared in `tailwind.config.js`, `index.css`, and `index.html` — all three must agree.
- **Motion:** honour `prefers-reduced-motion` and `document.visibilityState === 'hidden'` (the rAF-freeze fix in `useCountUp` must survive any rework).
- **Anime.js is not installed** — adding it is a real dependency decision, not a silent import.
- Keep the build green between phases. Do not batch a rewrite across all eight pages at once.

## 6. Suggested execution order

Deviates slightly from the master prompt's §40 by front-loading the two highest-value truth fixes, since "no fabricated data" is this project's core rule:

1. Overview → topology on real agents
2. Trace waterfall + evidence panel on real `getTrace` data (per its own spec doc)
3. Datasets stale-count fix
4. Replay Debugger real data source (or honest empty state)
5. Visual/consistency pass across the remaining pages
6. Responsive, accessibility, performance validation
