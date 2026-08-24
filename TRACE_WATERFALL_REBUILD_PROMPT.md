You are implementing a real, working replacement for two fake/hardcoded components in **AgentPulse**, a multi-agent LLM observability dashboard (React + TypeScript + Tailwind CSS v3, dark-mode-only). Repo: https://github.com/Soum-Code/agentpulse (private).

## The problem

`dashboard/src/App.tsx` has two components that currently render **100% hardcoded fixture data**, unrelated to whatever trace is actually live:

- `TraceWaterfallSection` (around line 257) renders `SAMPLE_WATERFALL_SPANS`, a hardcoded array of 5 fake spans with a fake trace ID (`tr_e2e_research_48821`) and a hardcoded `totalDuration = 490`.
- `EvidenceInspectorPanel` (around line 336) renders hardcoded fake "Source Premise Context" / "Agent Asserted Claim" strings about a fictional Zhang et al. paper, regardless of which span is selected.

Both were confirmed broken by ingesting two different real traces and observing byte-identical output both times. This was flagged and deliberately left unfixed pending a proper redesign — that redesign is this task.

## The reference pattern (decoded from mlflow.org)

MLflow's trace-observability UI (https://mlflow.org/, Observability section) does NOT use a flat horizontal Gantt chart. It uses:

1. **An indented tree**, not a flat list — spans are nested by parent/child call relationship (e.g. `LangGraph → agent → ChatOpenAI → tools → doc_search → agent`), with an expand/collapse chevron per row. This is what makes it work for *multi-agent* traces specifically: a flat list can't show "this tool call happened inside this agent's turn," a tree can.
2. **A small type icon per row** — a link icon for chain/graph nodes, a network icon for LLM calls, a wrench icon for tool calls — so the *kind* of span is readable at a glance without reading the label.
3. **An inline duration bar within each row** (not a separate full-width Gantt track) — a short colored bar sized relative to that row's duration, sitting next to the row's own content, not aligned to a shared global timeline axis.
4. **Duration shown right-aligned** in a monospace-style number (e.g. `27.85s`, `6.94s`).
5. **A split-pane layout**: the tree is the left/primary pane; selecting a row shows that span's actual content (prompt, messages) in a right-hand detail pane with a code-view toggle.

Adapt this *pattern*, not MLflow's literal visual style — AgentPulse already has its own dark instrument-panel language (see tokens below) and should keep it.

## What AgentPulse already has right (keep these, don't rebuild them)

Reading the current (fake-data) implementation, several pieces already match the reference pattern in spirit and should be preserved structurally:

- The existing waterfall span rows already use an **inline duration bar** (`left/width` percentage positioned inside a small track), not a separate Gantt column — matches point 3 above already.
- Tool calls already get a **wrench-icon badge** (`lucide-react`'s `Wrench`) — matches point 2 already, just needs a couple more icon types added (see below).
- `EvidenceInspectorPanel` already **is** the split-detail pane from point 5 — it just needs to read real data instead of fake strings.
- Risk severity per row already uses the project's disjoint color system (`bg-state-ok` / `bg-state-warn` / `bg-state-bad` driven by `riskTone()`) — do not change this rule. Never mix span-type icon color with risk color.

What's missing relative to the reference: **parent/child nesting with indentation and expand/collapse** (point 1), and — the actual core bug — **everything is hardcoded instead of wired to real data.**

## The real data available (this is the actual API shape, not a guess)

`dashboard/src/lib/api.ts` already defines and the backend already implements:

```ts
export interface TraceListItem {
  trace_id: string;
  pipeline_id: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  total_spans: number;
  overall_risk_score: number | null;
  service_name: string;
}

export interface SpanDetail {
  span_id: string;
  parent_span_id: string | null;   // <- this is what makes tree nesting possible
  agent_id: string;
  agent_role: string | null;
  event_type: string;
  span_kind: string;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tool_name: string | null;
  tool_args?: string | null;
  tool_result_summary?: string | null;
  start_time: string;
  evaluation: {
    grounding_score: number | null;
    tool_claim_score: number | null;
    overall_risk_score: number | null;
    label: string | null;
    evaluation_stage: string | null;
  } | null;
}
```

`api.getTrace(traceId)` returns `{ trace: TraceListItem, spans: SpanDetail[], alerts: AlertItem[] }` — already implemented, already called elsewhere in the app (`api.ts`), just not by these two components.

**Important real constraint, not a guess**: `SpanDetail` has no raw input/output text field. The backend's default privacy settings (`AGENTPULSE_CAPTURE_INPUTS=false`, `AGENTPULSE_CAPTURE_OUTPUTS=false` in `.env.example`) mean the actual claim/evidence text the current fake `EvidenceInspectorPanel` displays may genuinely not exist in the API response for a given span. Handle this honestly: if the text isn't present, show a real empty/unavailable state ("Input/output capture is off for this deployment" or similar, in the app's own voice — not a fake placeholder, not a silent blank). Do not invent placeholder claim text to fill the panel. `evaluation.grounding_score`, `evaluation.tool_claim_score`, and `evaluation.overall_risk_score` **are** real and always available when evaluation ran — the Eval Cascade and Tools tabs in `EvidenceInspectorPanel` can be made fully real from these fields alone (the Eval tab's fake `MiniLM Similarity: 0.241` / `DeBERTa Contradiction: 0.985` values should map to real fields with the same names it can access, e.g. `grounding_score`/`overall_risk_score`; if a real field doesn't exist for something currently shown, e.g. raw MiniLM similarity isn't in `SpanDetail` either, drop that line rather than fake it).

## What to build

1. **A trace picker.** There is currently no way to choose which trace the waterfall shows — it's hardcoded to one fake ID. Add a simple selector (dropdown or a small list) sourced from the real recent-traces list already fetched in `App`'s `loadData()` (`traces` state, `TraceListItem[]`), defaulting to the most recent trace. Selecting one calls `api.getTrace(traceId)` and stores the result in state.

2. **Rebuild `TraceWaterfallSection` as a tree**, not a flat map over a hardcoded array:
   - Build a parent→children map from `spans` using `parent_span_id` (root spans have `parent_span_id: null`).
   - Render recursively with indentation per depth level (e.g. `paddingLeft: depth * N`px), an expand/collapse chevron per node with children (default expanded is fine for a first version — don't over-engineer collapsed-by-default state management unless it's trivial).
   - Add 1-2 more icon types alongside the existing wrench-for-tool-calls badge, keyed off `event_type`/`span_kind` (e.g. an LLM-call icon for `event_type === 'llm_generation'`, an agent-turn icon for `event_type === 'agent_execution'`) — reuse `lucide-react` icons already imported elsewhere in the file where possible, don't add a new icon library for this.
   - Duration bar: compute `totalDuration` from the real trace's actual span timings (max `start_time + latency_ms` minus min `start_time` across all spans), not a hardcoded `490`. Compute each bar's position/width from real `start_time`/`latency_ms`, not the fake `startMs`/`durationMs` fields.
   - Row risk color from `span.evaluation?.overall_risk_score` via the existing `riskTone()` function — same rule as today, don't invent new thresholds.
   - Header: show the real selected `trace.trace_id` and real total duration, not the hardcoded string.

3. **Wire `EvidenceInspectorPanel` to the selected real `SpanDetail`** instead of the fake `WaterfallSpan` type: swap the `selectedSpan` prop's type, and make each of the four tabs (Evidence, Tools, Eval Cascade, Drift Signal) read real fields per the constraints above. The Drift Signal tab may legitimately have less real data available at the span level (drift is usually agent-level, not span-level) — if there's no real per-span drift data to show, say so plainly rather than fabricating a number; don't remove the tab, just give it an honest empty state.

4. Update or remove the `WaterfallSpan` interface and `SAMPLE_WATERFALL_SPANS` constant once nothing references them.

## Constraints to preserve (non-negotiable, same as the rest of the dashboard)

- Disjoint color system: `signal`/cyan (`#22d3ee`) is identity/interactive only, never risk. `state` colors (`ok #34d399`, `warn #fbbf24`, `bad #fb7185`, `crit #f43f5e`) are risk-only, driven by `riskTone(score)` (`>0.7` bad, `>0.4` warn, else ok) — never invent new thresholds or colors for risk.
- JetBrains Mono (`font-mono` / `.tnum`) for all numeric/duration readouts.
- Dark mode only, no light theme to support.
- HUD corner-brackets (`bracket`/`bracket-on` classes) were recently pulled back to a single signature element elsewhere in the app (a live risk waveform on the Overview page) — don't reintroduce them here by default; keep this section's existing quiet 1px-border tile style.
- Respect `prefers-reduced-motion` for any expand/collapse transition (project already has a `useReducedMotion` hook in `dashboard/src/components/ui.tsx` — reuse it, don't reinvent).
- Accessible: expand/collapse controls need a real accessible name/state (`aria-expanded`), row selection needs `aria-pressed` or `aria-selected` matching the existing pattern already used elsewhere in this file (see how `isSelected` is handled in the current span buttons).

## Definition of done

Ingest two different real traces through the SDK (`scripts/e2e_dashboard_demo.py` already does this), select each one via the new trace picker, and confirm the waterfall and evidence panel show genuinely different content for each — not the same fixture both times. That was the exact test that proved this was broken; it's the test that proves it's fixed.
