# AgentPulse Master Prompt — Corrections & Overrides

Paste this **together with** `AGENTPULSE MASTER DESIGN PROMPT`. Where the two disagree, **this file wins** — these corrections were verified directly against the real codebase, the master prompt's conflicting lines were written from assumption.

---

## OVERRIDE 1 — §18 Color: remove "healthy" from the cyan list

The master prompt §18 states cyan should represent: *"active, selected, linked, running, **healthy**, interactive."*

**`healthy` must be struck from that list.** It is a risk/health state, and this project enforces a strict disjoint colour law:

- **Cyan (`signal`, `#22d3ee` / dim `#0e7490` / deep `#083344`)** — brand identity and interaction **only**: links, active nav, focus rings, logo, selection. It must **never** encode risk, health, or severity.
- **State colours (`state-ok #34d399`, `state-warn #fbbf24`, `state-bad #fb7185`, `state-crit #f43f5e`)** — risk/health **only**, never branding or decoration.

Risk colour is never hand-picked. It is always derived from the existing function in `dashboard/src/components/ui.tsx`:

```ts
export function riskTone(score: number): RiskTone {
  if (score > 0.7) return 'bad';
  if (score > 0.4) return 'warn';
  return 'ok';
}
```

This mirrors the backend's real `EvaluationPipeline._classify_risk`. Do not introduce a second threshold set or a new risk colour anywhere.

**Why this matters operationally:** in a monitoring tool severity must be readable from colour alone, at a glance, without reading the number. The moment cyan means "healthy" on one screen and "interactive" on another, the operator's colour-trained instinct stops working. `running` is also borderline — use it only for a process/stream state (e.g. "STREAM LIVE"), never as a proxy for "things are fine."

---

## OVERRIDE 2 — §19 Typography: the real stack is already chosen

The master prompt §19 proposes *"Inter, Geist, SF Pro style fallback."* **Do not use those.** Inter and Geist are on the same overused-face list the prompt is trying to avoid. The real, already-loaded stack is:

- **`font-sans` — IBM Plex Sans** (UI, headings, labels)
- **`font-mono` — JetBrains Mono** (all numeric/data readouts)

Both are declared in `dashboard/tailwind.config.js`, set on `body` in `dashboard/src/index.css`, and loaded via a Google Fonts `<link>` in `dashboard/index.html` — a swap means editing all three. IBM Plex Sans was picked deliberately (drawn for IBM's technical products, fits the instrument-panel concept, and is outside the saturated set), replacing Space Grotesk after a design-lint check flagged that face as overused.

The master prompt's §19 rule *"do not use monospace for the entire interface"* is correct and already how the codebase works: mono is for **every live number** (risk scores, latencies, counts, IDs, timestamps) always paired with `.tnum` (`font-variant-numeric: tabular-nums`) so live-updating values never jitter in width. Sans is for everything else. Keep that split exactly.

---

## OVERRIDE 3 — §38 shadcn/ui: leftovers have been removed

§38 correctly says do not adopt shadcn/ui. Be aware of the history so you don't misread the repo:

A `shadcn init` was run earlier in this project and **broke the production build entirely** — it injected Tailwind **v4** CSS (`@import "shadcn/tailwind.css"`, `@apply border-border` against undefined utilities) into `dashboard/src/index.css`, while this project is on **Tailwind v3**. The CSS damage was reverted, and the leftover scaffolding (`dashboard/components.json`, `dashboard/src/lib/utils.ts`, `dashboard/src/components/ui/button.tsx`) has now also been deleted — nothing imported it.

Consequences for you:
- Do not reintroduce Tailwind v4 syntax (`@theme`, shadcn's oklch variable names, `@apply` on undefined utilities). **Tailwind v3 syntax only.**
- Note the near-collision that remains in the tree: `dashboard/src/components/ui.tsx` is the **real** primitives file (`Tile`, `Stat`, `Meter`, `RiskPill`, `StatusBadge`, `Sparkline`, `Waveform`, `EmptyState`). There is no `components/ui/` directory any more. Do not recreate one.
- `@/*` path alias → `./src/*` is configured in both `tsconfig.json` and `vite.config.ts` and can stay; it is harmless and currently unused.

---

## OVERRIDE 4 — §23/§24 Anime.js is not installed

Anime.js is referenced as a motion tool but is **not a dependency** of this project. Current motion is plain CSS transitions/keyframes in `index.css` plus a `requestAnimationFrame` count-up hook.

Do not add Anime.js unless a specific interaction genuinely cannot be expressed in CSS. If you do add it, it is a real dependency addition — state it explicitly rather than importing it silently.

Two motion constraints that are non-negotiable because they are fixes for **real shipped bugs**:

1. **`prefers-reduced-motion`** — honour it everywhere. A `useReducedMotion()` hook already exists in `ui.tsx`; reuse it.
2. **`document.visibilityState === 'hidden'`** — any `requestAnimationFrame`-driven readout must fall back to setting its value immediately when the tab is hidden. Browsers suspend rAF for background tabs, which previously left the headline stat numbers **frozen at 0** for as long as the dashboard wasn't the focused tab — a serious bug for a monitoring tool meant to be left open. The fix lives in `useCountUp`; preserve it in any animated readout you write.

---

## OVERRIDE 5 — §8 "preserve the existing data contract" does not apply to the known fake components

§8 says: *"If the application currently uses mock data, preserve the existing data contract rather than fabricating a new product model."* That is good general advice, but it must **not** be applied to two specific components, because their mock data is a **known, tracked bug** — not a contract to preserve:

- **`TraceWaterfallSection`** (`dashboard/src/App.tsx`, ~line 257) renders `SAMPLE_WATERFALL_SPANS` — a hardcoded array of 5 fake spans, a fake trace ID (`tr_e2e_research_48821`), and a hardcoded `totalDuration = 490`.
- **`EvidenceInspectorPanel`** (`~line 336`) renders hardcoded fake "Source Premise Context" / "Agent Asserted Claim" strings about a fictional Zhang et al. paper, regardless of which span is selected.
- The **Agent Execution Topology** grid on Overview is likewise static.

These were proven broken by ingesting two different real traces and observing byte-identical output both times. The correct action is to **wire them to real data**, not preserve them. A full spec for the trace/evidence rebuild — including the exact real `TraceListItem` / `SpanDetail` API shapes and the honest-empty-state rule for fields that genuinely don't exist — is in `TRACE_WATERFALL_REBUILD_PROMPT.md` in this repo. Follow that document for those two components.

**One real data constraint from that spec, repeated here because it is easy to get wrong:** `SpanDetail` has **no raw input/output text field**. The backend defaults to `AGENTPULSE_CAPTURE_INPUTS=false` / `AGENTPULSE_CAPTURE_OUTPUTS=false`, so the claim/evidence text the fake panel currently shows may genuinely not exist for a given span. When it's absent, render an honest empty state ("Input/output capture is off for this deployment") — **do not invent placeholder claim text to fill the panel.** `evaluation.grounding_score`, `evaluation.tool_claim_score`, and `evaluation.overall_risk_score` are real and available whenever evaluation ran.

---

## OVERRIDE 6 — Scope reality check

The master prompt's §40 lists 18 phases covering all 8 product areas. That is a large programme of work, not a single pass. Execute it **phase by phase, verifying after each**, rather than attempting a whole-application rewrite in one go. Do not leave the app in a non-building state between phases — the build has already been broken once in this project by a bulk tooling change.

Existing companion documents in this repo that the master prompt should be read alongside:

- `AGENTPULSE_DESIGN_SYSTEM.md` — the established visual system (tokens, restraint rules, glass/glow/bracket elevation languages, the signature waveform element).
- `TRACE_WATERFALL_REBUILD_PROMPT.md` — the trace tree + evidence panel rebuild spec.
- `PROJECT_REPORT.md` — what the product actually measures and claims, with real measured numbers.
