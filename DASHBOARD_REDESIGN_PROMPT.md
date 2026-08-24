You are the design lead redesigning the frontend of **AgentPulse**, a self-hostable observability tool for multi-agent LLM systems. It is not a generic SaaS dashboard — its job is detecting when an AI agent hallucinates, contradicts its source evidence, drifts from its baseline behavior, or falsely claims a tool succeeded. The people using it are operators watching for exactly this kind of failure in real time, the same way an air-traffic controller or a seismologist watches an instrument feed. Design from that world — signal, noise, drift, waveform, threshold — not from generic dashboard/SaaS defaults.

Two references were chosen deliberately, for different reasons:
- **linear.app** — for typographic confidence, minimal chrome, quiet 1px borders, generous whitespace despite density, and restraint (Linear proves you can be dark and dense without being cluttered).
- **stripe.com** — for tasteful, sparing use of a gradient as a premium accent (not everywhere — Stripe uses it as a signature moment, not wallpaper).

Explicitly avoid the generic "AI-generated dashboard" look: near-black background plus one bright neon accent used uniformly everywhere, HUD corner-brackets on every single card, is a cliché at this point, not a choice. If you reach for that by default, stop and make a more deliberate decision instead.

## Stack and constraints

- Repo: https://github.com/Soum-Code/agentpulse (private — if the tool you're pasting this into can't reach it, ask for the specific files below to be pasted in instead of guessing at their contents).
- React + TypeScript + Tailwind CSS. Existing structure: `dashboard/src/App.tsx` (views), `dashboard/src/components/ui.tsx` (primitives: `Tile`, `Stat`, `Meter`, `RiskPill`, `StatusBadge`, `Sparkline`, `EmptyState`), `dashboard/src/components/SideRail.tsx` (left nav), `dashboard/tailwind.config.js` (design tokens), `dashboard/src/index.css` (global styles, animations).
- Dark mode is the only mode — there is no light mode to support.
- Must respect `prefers-reduced-motion` (already partially wired via a `useReducedMotion` hook — preserve and extend this, don't remove it).
- Real-time data: the dashboard polls a FastAPI backend and holds a live WebSocket connection. Numbers update continuously while the tab is open. Design for that — nothing should visually "jump" or reset on every poll tick.

## What to keep exactly as-is (already correct, don't redesign)

**Color semantics — this is a hard rule, not a style preference.** The palette is deliberately split into two non-overlapping systems:
- **Brand/identity color** (`signal`): `#22d3ee` (cyan), with `dim: #0e7490` and `deep: #083344`. Used *only* for interactive/identity elements — links, active nav state, focus rings, the logo. Never used to indicate risk or health.
- **Semantic risk color** (`state`): `ok: #34d399` (emerald), `warn: #fbbf24` (amber), `bad: #fb7185` (rose), `crit: #f43f5e`. Used *only* for risk/health signals, driven by `riskTone(score)`: `score > 0.7 → bad`, `score > 0.4 → warn`, else `ok`. This mirrors a real backend classifier (`EvaluationPipeline._classify_risk`) — the frontend must never invent its own thresholds or colors for risk, always derive from this function.

The reasoning: in a monitoring tool, severity must be readable from color alone, at a glance, without reading the number. Mixing brand color into risk states (e.g. making a healthy state cyan sometimes and green other times) breaks that. Keep this split absolute.

**Typography base**: JetBrains Mono for all data/numeric readouts (tabular numerals) — this is a legitimate, intentional choice for an instrument-panel feel, keep it for anything that is a live number. IBM Plex Sans is used for UI/headings (it replaced Space Grotesk, which a design-lint check flagged as one of the faces AI-generated UIs converge on — note Inter and Geist are on that same list, so they are not upgrades). The mono-for-data / sans-for-chrome split itself should stay.

## What to change

1. **HUD corner-brackets are currently on almost every tile** (`bracket` prop on the `Tile` component, applied broadly). Pull this back hard — brackets should appear on at most one or two elements total (see "signature element" below), not as a default card treatment. Replace the default card style with something closer to Linear: a flat surface, a single 1px border in a quiet neutral (current `line: #1e2333` / `line-strong: #2b3247` tokens), no glow, no bracket, until something genuinely needs emphasis (an active/selected state, a critical alert).
2. **Typographic scale**: push the hero numbers (composite risk, the few headline stats) larger and more confident, Linear-style — tighter letter-spacing at large sizes, a clear weight jump between hero numbers and everything else. Currently these read as roughly the same visual weight as secondary text; they should dominate the eye immediately.
3. **Whitespace**: increase breathing room in dense areas (the alert table, the topology grid) without reducing information density — i.e. don't remove columns/data, just give what remains more room to sit, the way Linear's issue list feels calm despite showing a lot per row.
4. **Motion**: the existing count-up/entrance animation system had a real bug (numbers froze at 0 in a backgrounded browser tab because it depended on `requestAnimationFrame`, which every browser suspends for hidden tabs) — this was already fixed by falling back to an immediate value when `document.visibilityState === 'hidden'`. Keep that fallback intact in any animation rework. Beyond that, motion should be orchestrated and purposeful (a considered page-load stagger, a smooth transition when a risk tier changes) rather than scattered hover effects everywhere.

## What to add

A single tasteful gradient moment, Stripe-style — reserved for **one** place only: the AgentPulse wordmark/logo in the side rail, or a single hero backdrop treatment behind the Overview page's top stat row. Do not spread gradient accents across multiple cards or components — one signature use, everywhere else stays flat. This is meant to read as "this took real design effort" without undermining the disjoint risk-color rule above (the gradient must use the brand cyan family, never the risk-state colors).

## Signature element (the one bold move)

Replace the current static "Composite Risk" stat tile — just a number that counts up — with a **live scrolling waveform strip**, styled like an oscilloscope or seismograph trace (a thin bright line on a dark instrument-panel background, with a subtle phosphor-decay trail behind the current point, not a cheesy retro-CRT pastiche — restrained and precise, more "real scientific instrument" than "80s aesthetic"). This should plot **real data**: the composite risk score over the last N minutes/spans, ticking forward as new evaluations come in, not a decorative loop. Color the trace using the same `riskTone()` semantics as everything else — the line's color (or a color-shift along its length) should reflect whether recent readings are healthy, elevated, or critical, so the waveform itself is legible as a risk signal, not just decoration.

This is the one place brackets/glow/heavier visual treatment are earned — it is the dashboard's literal "vital signs monitor," so it's allowed to look like one. Everything else on the page should stay quiet by comparison, per the restraint principle: spend the visual budget in exactly one place.

## Content/voice

Keep labels literal and operator-facing: name what the operator controls or is looking at ("Open incidents", not "Incident Count"), plain verbs on actions ("Curate case", not "Submit"), no exclamation points, no "successfully" (the state change itself communicates success). Error and empty states should say what happened and what to do next, in the tool's own voice, not a person's — e.g. an empty incident inbox should read as "No active incidents" (already correct), not an apology.

## Deliverable

Produce updated `tailwind.config.js` tokens (only add/change what's needed — don't rename the `signal`/`state` token groups, other code depends on those exact names), updated `dashboard/src/index.css`, and updated/new components in `dashboard/src/components/ui.tsx` implementing the above, especially the waveform component. Don't try to rewire live data plumbing yourself — assume a `data: number[]` (or similar) prop feeds real values in; focus on the visual/component design, not the backend integration, since that gets wired back into the real AgentPulse codebase afterward.
