<role>
You are an expert frontend engineer, UI/UX designer, visual design specialist, and typography expert, integrating a design system into an existing production codebase. Match the codebase's real conventions, real component structure, and real hard constraints below — do not propose a generic redesign that ignores them.

Before writing code, confirm you understand:
- The tech stack: React 18 + TypeScript + Tailwind CSS v3 (Vite build), no shadcn/ui in the base app.
- The existing token system in `dashboard/tailwind.config.js` and `dashboard/src/index.css` (reproduced in full below — these are real, current values, not a guess).
- The existing component primitives in `dashboard/src/components/ui.tsx` (`Tile`, `Stat`, `Meter`, `RiskPill`, `StatusBadge`, `Sparkline`, `Waveform`, `EmptyState`) and where the app composes them in `dashboard/src/App.tsx` and `dashboard/src/components/SideRail.tsx`.

Repo: https://github.com/Soum-Code/agentpulse (private).
</role>

# Design System: Instrument Deck

## 1. Design Philosophy

**"The room where someone watches for the failure everyone else missed."**

AgentPulse is not a generic SaaS analytics dashboard. It is the monitoring surface for multi-agent LLM systems — it exists to catch the moment an AI agent hallucinates, contradicts its own evidence, drifts from baseline, or lies about a tool call succeeding. The person looking at this screen is doing what an air-traffic controller or a seismologist does: watching a live signal for the deviation that matters, for long stretches, often in a dim room, often in a background tab.

### Core DNA

Three references were chosen for three different, deliberate reasons — this is a synthesis, not a clone of any one of them:

- **MLflow** (mlflow.org) — the closest functional peer. Same problem domain (LLM/agent observability), so its information architecture is real evidence, not aesthetic inspiration: a nested trace tree with inline duration bars and type icons, a split-pane detail view, a near-black base with one restrained gradient accent used only in navigation chrome (a pink-to-blue underline on an active tab), not spread across the whole UI.
- **Apple's Liquid Glass material** — for exactly one job: floating overlay surfaces (command palette, modals) get a frosted, refractive, semi-transparent treatment so they read as *above* the instrument panel, not another flat tile competing with it. The base dashboard tiles stay flat and quiet — glass is earned by elevation, not decoration.
- **animmasterlib.dev's premium motion catalogue** — not for literal 3D scenes (a floating armchair or a WebGL shader field has no place in an operational monitoring surface), but for the *principle* underneath its best work: interactive elements get a felt sense of depth and weight (soft glow on the one active glowing CTA, a tasteful perspective lift on hover, motion that has a beginning and an end rather than looping forever). Borrow the craft, not the spectacle.

### Vibe

Calm authority under pressure. Not loud, not playful, not "AI startup generic dark mode." It should feel like the one screen in the building that's telling the truth — legible at a glance, trustworthy at 2am, and unmistakably built by someone who cared about the details.

### Non-negotiable product truth (read before touching color)

Color in this system carries two entirely separate meanings and they must never blend:

1. **Brand/identity** — used for navigation, links, focus rings, the logo. Cyan family only.
2. **Risk/health severity** — used for anything the evaluator scored. Emerald/amber/rose/crit only, always derived from the real `riskTone(score)` function, never a new palette invented per-component.

The reasoning is operational, not aesthetic: in a monitoring tool, severity must be readable from color alone, instantly, without reading a number. The moment brand cyan shows up on a healthy state some days and a warning state other days, the operator's color-trained instinct stops working. This rule has already caused real, deliberate restraint decisions elsewhere in this codebase (HUD corner-brackets pulled back from every tile to a single signature element) — extend that discipline, don't relax it.

## 2. Design Token System (real values already in the codebase — extend, don't replace)

### Colors

**Mode:** Dark only, permanently. This is a long-dwell-time monitoring surface for low-light conditions; there is no light-mode variant to design for.

```css
/* Surfaces — near-black void climbing to elevated panels */
--void:        #05060b;
--surface:     #0a0c14;
--surface-2:   #0f121c;
--surface-3:   #151926;
--line:        #1e2333;
--line-strong: #2b3247;

/* Text */
--text:        #e8ecf5;
--text-dim:    #9aa4bd;
--text-faint:  #5d6782;

/* Brand signal — interactive / identity ONLY, never state */
--signal:      #22d3ee;
--signal-dim:  #0e7490;
--signal-deep: #083344;

/* Semantic state — risk / health ONLY, never branding or decoration */
--ok:          #34d399;
--warn:        #fbbf24;
--bad:         #fb7185;
--crit:        #f43f5e;
```

Tailwind exposes these as `void`, `surface`/`surface-2`/`surface-3`, `line`/`line-strong`, `ink`/`ink-dim`/`ink-faint`, `signal`/`signal-dim`/`signal-deep`, `state-ok`/`state-warn`/`state-bad`/`state-crit` (`dashboard/tailwind.config.js`). **Keep these exact token names** — other components already depend on them.

Risk color is never chosen by hand. It always comes from:

```ts
export function riskTone(score: number): RiskTone {
  if (score > 0.7) return 'bad';
  if (score > 0.4) return 'warn';
  return 'ok';
}
```

(`dashboard/src/components/ui.tsx`) — mirrors the backend's real `EvaluationPipeline._classify_risk`. Never introduce a second threshold set or a new risk color anywhere in the app.

### Typography

- **UI / headings:** IBM Plex Sans (`font-sans`). Chosen deliberately: it was drawn for IBM's technical products, which suits the instrument-panel concept, and it sits outside the small set of faces (Inter, Geist, Space Grotesk, Plus Jakarta Sans…) that AI-generated interfaces keep converging on. It replaced Space Grotesk for exactly that reason. If a more distinctive display cut is ever introduced for hero moments, it must be used with restraint — one weight, one place — not swapped in globally.
- **Data / numeric readouts:** JetBrains Mono (`font-mono`), always with `.tnum` (`font-variant-numeric: tabular-nums`) so live-updating numbers never jitter in width. This is the instrument-panel voice — every risk score, every latency figure, every count uses it. Never render a number in the sans face.
- **Scale:** hero stat numbers are `text-4xl font-bold tracking-tight` (recently pushed up from `text-2xl font-semibold` specifically to read with more confidence at a glance — keep this weight, don't regress it). Section titles `text-sm font-semibold tracking-tight`. Eyebrows/labels `text-2xs font-mono uppercase tracking-[0.14em]` on `--text-faint`.
- **Case:** uppercase reserved for eyebrows, badges, and status labels only (mirroring the existing `Eyebrow`/`StatusBadge` components) — never uppercase a heading or body sentence.

### Radius & Border

- **Border radius:** `6px` (the `DEFAULT` in `tailwind.config.js`) on tiles and controls; `9999px` only on pills/badges/dots. Not zero-radius (that's the Newsprint reference's language, not this system's) but deliberately tight — "machined instrument face," not a soft consumer-app card.
- **Border width:** `1px` hairline (`border-line`) is the default everywhere. `line-strong` on hover. Never a heavier structural border than 1px except the single 2px accent border reserved for a genuinely featured/active element.

### Shadows / Elevation / Glass

Three elevation languages, used for three different reasons — do not blend them:

1. **Flat tile** (`--surface-2` + 1px `--line` border) — the default for almost everything. No shadow at rest.
2. **Signature glow** (`box-shadow: signal` token, `0 0 26px -10px rgba(34,211,238,.35)`) — reserved for the one thing currently earning heavier treatment on a given page (today: the live risk waveform's leading point, and an active/selected topology node). Don't add this to a fourth or fifth element "for consistency" — consistency here means *staying rare*.
3. **Liquid glass** (`.glass` utility already in `dashboard/src/index.css`: `backdrop-filter: blur(20px) saturate(160%)`, semi-transparent `rgba(15,18,28,.72)` fill, soft inset highlight, deep offset shadow) — reserved exclusively for floating overlays (modals, command palette). Never apply it to an in-flow dashboard tile; a glass tile sitting flush in a grid of flat tiles reads as a bug, not a feature.

### Motion

- Respect `prefers-reduced-motion` everywhere (`useReducedMotion()` hook already exists — reuse it, don't reinvent per-component checks).
- Respect `document.visibilityState === 'hidden'` for anything driven by `requestAnimationFrame` — this was a real, shipped bug (headline stat numbers froze at 0 in a backgrounded tab because rAF is suspended for hidden tabs in every major browser) and the fix (`useCountUp` falling back to an immediate value when hidden) must be preserved in any new animated readout.
- Motion has a beginning and an end. A page-load stagger (`.rise`, already implemented, `translateY(10px)` fading in with a per-index delay) is fine because it finishes. A decorative loop that runs forever competing for attention with the actual live data is not — the one exception is the `.pulse-rail` heartbeat sweep, which is deliberately the *only* always-on ambient motion in the interface and should stay that way; a second permanent ambient loop dilutes it.

## 3. Component Stylings

### Buttons

- **Primary/interactive** (command palette trigger, nav active state): `bg-signal/10` fill, `text-signal` or `text-ink`, 1px `border-line` → `border-line-strong` on hover. No filled solid-cyan buttons — cyan is a wash/accent, not a block fill, across this whole system.
- **Icon buttons:** must carry a real accessible name (`aria-label`) when icon-only — this was a real, fixed accessibility gap (icon-only playback controls previously had none).
- Never a second brand color for a "primary CTA" — there is no CTA-specific color in this product; every interactive surface uses the same signal cyan at low opacity.

### Cards / Tiles

The `Tile` primitive (`dashboard/src/components/ui.tsx`) is the single surface primitive for the whole app: `1px border-line`, `surface-2` fill with a faint top highlight gradient, `border-radius: 6px`, optional hover state (`border-line-strong` + a very faint cyan-tinted shadow). `bracket`/`bracket-on` (HUD corner marks) default to **off** — only apply to the one truly active/signature element on a given view (already done: an actively-selected topology node, previously overused everywhere and pulled back deliberately). Don't reintroduce brackets as a default card treatment anywhere new.

### The signature element: the risk waveform

`Waveform` (`dashboard/src/components/ui.tsx`) replaces what used to be a static "Composite Risk: 0.694" number with a live scrolling trace — real polled `avg_risk_score` values plotted as an oscilloscope/seismograph-style line (phosphor-decay glow on the leading point via `drop-shadow`, color from `riskTone()` on the current value, a soft area-fill gradient beneath the line). This is the one place in the interface allowed a heavier visual treatment, because it *is* the product's actual vital-signs readout. Any new "hero" surface should ask whether it's actually earning that treatment, or whether it's diluting the one that already has it.

### Trace tree (new — see companion doc)

The trace waterfall is being rebuilt as a real, data-driven parent/child tree (not a flat list) with per-row type icons and inline duration bars, directly informed by MLflow's Observability trace view — full spec in `TRACE_WATERFALL_REBUILD_PROMPT.md` in this repo. Reuse its icon and color rules here rather than duplicating them: span-type icons are neutral/`ink-faint`, never colored by risk; row risk color comes from `riskTone()` exactly as everywhere else.

### Overlays (glass)

Command palette and modals (`CurateCaseModal`, `CommandPalette` in `App.tsx`) already use `.glass` instead of a flat tile. Keep new overlays on this pattern: `.glass` class, no `shadow-2xl` utility stacked on top (the class already carries its own layered shadow), backdrop scrim (`bg-void/80 backdrop-blur-sm`) behind it for separation from the dashboard underneath.

### Icons

`lucide-react`, stroke-width default (don't override to a heavier/lighter stroke globally — that's a Newsprint-reference move, not this system's). Icon color is contextual: `ink-faint` for structural/type icons, `signal` for interactive/active nav icons, risk-tone color only when the icon *is* a risk indicator (e.g. a status dot), never decoratively colored.

## 4. Non-Genericness (the deliberate, defensible choices)

1. **The waveform, not a number.** The single biggest departure from a generic dashboard template — risk is a live trace, not a static tile. This is the one place the "bold" budget is spent.
2. **Disjoint color law, enforced everywhere.** Most dashboards let brand color drift into status indicators when convenient. This one refuses to, on purpose, and that refusal is itself part of the identity.
3. **Restraint as a visible decision, not an absence.** HUD brackets, glow, and glass are all real, coded, available treatments — and the system's discipline is in how rarely they're actually used. A reviewer should be able to look at any given screen and name the one thing it's emphasizing.
4. **Instrument-panel typography for data, human typography for everything else.** The mono/sans split is load-bearing, not decorative — it's how an operator's eye instantly knows "this is a measured value" versus "this is a label."
5. **One gradient, one place.** The `wordmark-gradient` utility (cyan-family diagonal gradient text-clip, already implemented) is the *only* gradient in the entire interface, reserved for the AgentPulse logotype. Do not add a second gradient moment anywhere else without removing this rule from the doc first and justifying why.

## 5. Layout Strategy

- **Shell:** fixed 212px left `SideRail` (grouped nav: Monitor / Investigate / Research, matching real operator workflows rather than a flat alphabetical list) + fluid main content area, `p-6`.
- **Grid:** Tailwind's standard grid utilities, no custom 12-col system needed at this density — `grid-cols-2 lg:grid-cols-4` for stat rows, `grid-cols-1 lg:grid-cols-3` for two-thirds/one-third detail splits (trace waterfall + evidence inspector).
- **Density:** this is an Operate-mode surface (per the mode taxonomy: the visitor completes a task, not gets persuaded or entertained) — scanability and consistency outrank expressive whitespace. Recent work already added breathing room to the hero stat numbers specifically; don't over-correct into sparse, low-density spacing across dense operational views like the alert table or trace tree, where an operator needs to scan many rows quickly.

## 6. Effects & Animation

- **Liquid glass** — see Shadows/Elevation above. Frosted, refractive, overlay-only.
- **Signature glow** — `drop-shadow` on the waveform's leading point and the `shadow-signal` token elsewhere; never a full-tile ambient glow at rest.
- **Motion restraint inspired by animmasterlib's craft, not its content** — if adding a hover micro-interaction (e.g. a subtle lift/scale on an interactive card), keep it under ~150ms, ease-out, and test it against `prefers-reduced-motion` before shipping. No scroll-triggered reveals, no parallax, no looping particle/WebGL backgrounds anywhere in the operational views — those belong on a marketing page, not an instrument panel someone is reading at 2am.
- **Page-load stagger** (`.rise`) and **pulse-rail heartbeat** are the two existing, intentional ambient/entrance motions. Extend them consistently rather than inventing a third pattern.

## 7. Spacing & Iconography

- 4px-based spacing scale via Tailwind defaults (`gap-3`, `p-4`, `space-y-5`, etc. — already the pattern throughout `App.tsx`), no need to introduce an 8px system on top of it.
- Icons from `lucide-react` exclusively — no second icon library, no hand-drawn SVG paths.

## 8. Responsive Strategy

The dashboard is presently designed desktop-first for an operator's monitoring station (this is consistent with the product's real usage pattern — nobody is triaging grounding failures from a phone). Tailwind's default breakpoints (`sm`/`md`/`lg`) are already used for stat-grid reflow; extend that pattern for new components rather than introducing a mobile-first rebuild. If a new component genuinely needs mobile support, collapse multi-column layouts to `grid-cols-1` and keep touch targets at a real minimum (44px), but do not spend effort re-flowing the trace tree or topology views for phone-sized viewports unless asked.

## 9. Accessibility & Best Practices

- Keyboard focus is always visible, always on the brand color (`outline: 2px solid var(--signal)`, never removed) — this is already global via `:focus-visible` and must not be overridden per-component.
- Icon-only controls need `aria-label`. Live/streaming indicators need a `live-dot` treatment (already implemented) so state changes are perceivable, not just colored.
- Modals/overlays: `role="dialog"`, `aria-modal="true"`, `aria-label`, close on `Escape` and backdrop click — already the pattern for `CurateCaseModal`/`CommandPalette`, extend it to any new overlay.
- Never encode meaning in color alone *except* for the one place this system deliberately does (risk severity) — and even there, a text/numeric value always sits next to the color (a `RiskPill` shows the number, not just a colored dot).

## 10. Implementation Constraints

- Tailwind CSS **v3** syntax only. A prior `shadcn init` accidentally introduced Tailwind v4 CSS (`@import "shadcn/tailwind.css"`, `@apply border-border` on an undefined utility) and broke the production build entirely — this was caught and reverted. Do not reintroduce v4-only patterns (CSS-first `@theme`, `@apply` on shadcn's default oklch variable names) into `dashboard/src/index.css`.
- No new global CSS framework or component library swap-in. Extend `dashboard/src/components/ui.tsx` and `dashboard/src/index.css` in place.
- Every new token goes in `dashboard/tailwind.config.js`'s `theme.extend`, never as a one-off arbitrary Tailwind value repeated across files.
- Real data only. Every component in this app has, at one point this project, been found rendering hardcoded fixture data disguised as live output — that was treated as a bug each time, not a placeholder to fix "later." Any new component must be wired to the real `dashboard/src/lib/api.ts` client from the start, or explicitly and visibly labeled as illustrative if real data genuinely isn't available yet.

## 11. Precedence over external design skills

Two third-party Claude Code skill collections are installed via `scripts/setup_skills.sh`
(into `.claude/skills/`, which is gitignored — the script, not the content, is the record):

- **`apple-design`** (`dickwu/apple-design-skill`) — a design reviewer grounded in Apple's
  Human Interface Guidelines, generalised to any framework. Chosen deliberately as the
  design authority for review and critique.
- **`apple-product` / `apple-testing` / `apple-release-review` / `apple-growth`**
  (`rshankras/claude-code-apple-skills`) — a selective toolbox. That repo's own `design/`
  category is deliberately **not** installed, because `apple-design` owns design and two
  competing design sources would conflict on every call.

**This document wins.** `apple-design` is advisory. Where its guidance contradicts anything
in sections 1–10 above, follow this document and say that a conflict was overridden — do not
silently take the HIG position, and do not rewrite this document to match it.

The rules most likely to be contradicted, and which still hold:

| This document | What an Apple-HIG reviewer will tend to say instead |
| :--- | :--- |
| Disjoint colour law — cyan is identity only, `state-*` is risk only, always via `riskTone()` | Use the accent colour for success/healthy states |
| Glass is overlay-only (one of three elevation languages) | Apply glass/`materials` broadly as surface treatment |
| One gradient, one place — the logotype only | Gradients as general decorative accent |

The reason is not that the HIG is wrong. It is that each rule here was arrived at from a
specific finding in this codebase — the font swap came from a design-lint hook flagging an
overused face, the `.deck-field` grid was removed because a decorative pattern was tiled
across a page that had not earned it, and the disjoint colour law exists because an
ASI-only status badge was once rendering a green HEALTHY next to RISK 1.00. Discarding that
reasoning in favour of a general guideline would repeat the mistakes it was written to stop.

Where `apple-design` is genuinely useful and should be used: accessibility auditing, dark-mode
contrast, loading and empty states, layout density, feedback and motion — areas sections 1–10
say little about. That is what it was installed for.
