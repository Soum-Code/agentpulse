# Chat + Dashboard: master prompt and negative prompt

Written 2026-10-01 for the frontend agent (AI Studio / Antigravity / any other).
Paste **Part A** and **Part B** together; Part C is the checklist for whoever
reviews the result. Every contract below was read out of the repository, not
recalled. Where the backend does not provide something, this says so, and the
frontend is told to show an absence rather than fill it.

---

## Part A: MASTER PROMPT

You are building the flagship screen of **AgentPulse**: a self-hostable
observability product that measures **grounding risk and drift in multi-agent LLM
systems**. Repo: `Soum-Code/agentpulse`, working in `dashboard/` (React 19 +
TypeScript + Tailwind v3, Vite, vitest).

This is meant to ship as a product people run in production, not as a demo or a
course project. That changes what "done" means: a screen that looks right while
showing a number nobody measured is a **defect**, not a placeholder. The project's
entire history is the replacement of invented numbers with measured ones, and every
round of review has found more invented ones. Hold that bar.

### A1. The one job of this screen

A person types a question into a chat. Three real agents answer it. **In the same
screen, they watch AgentPulse judge those agents live**: was each answer grounded
in the evidence it was given, did the retriever's claim match what the tool
actually returned, is any agent drifting from its own baseline, did anything fire
an incident. The chat is the stimulus. The instrument panel is the product.

If a viewer cannot tell, from the panel alone, *which agent* was risky on *which
turn* and *why*, the screen has failed, however good it looks.

### A2. Ground truth: what already exists (do not re-invent any of it)

**Chat service** (`demo/chat_server.py`, port 8100, already built and tested):

```
GET  /corpus  -> { documents: string[] }                       titles the retriever can return
GET  /health  -> { provider, base_url, models, key_configured, key_env }
POST /chat    { message, session_id? } ->
   200 { session_id, trace_id, reply, verifier_verdict, retrieved: string[],
         agents: [{ agent: 'retriever'|'verifier'|'answerer', model, output, latency_ms }] }
   502 { session_id, trace_id, error, agents (those that ran), retrieved }   a model failed
   503 { session_id, error, agents: [] }                                     no credential configured
   422                                                                       empty message
```

`503` carries a message naming the env var to set. Render that message. Do not
substitute an answer.

**AgentPulse API** (port 8000, typed in `src/lib/api.ts`, adapters in
`src/lib/adapters.ts`):

```
GET /v1/traces?limit&offset&status&pipeline_id      chat traces have pipeline_id = 'rag_chat'
GET /v1/traces/{trace_id}   -> { trace, spans: SpanDetail[], alerts }
GET /v1/agents              GET /v1/agents/{id}/health
GET /v1/drift               GET /v1/alerts          PATCH /v1/alerts/{id}
GET /v1/health/ready        GET /v1/health/evaluator        GET /v1/platform   GET /v1/metrics
WS  /v1/ws/live             emits only {type:'new_span', trace_id, span_id, agent_id, status, latency_ms}
```

The WebSocket announces that a span **arrived**. It does **not** announce that its
evaluation **finished**; evaluation is asynchronous, in a worker, and lands
seconds later. So: use the socket to know a turn's spans exist, and poll
`GET /v1/traces/{id}` (backoff, bounded, cancellable) until each span's
`evaluation` is non-null.

### A3. Score semantics. Read this twice, it is the easiest thing to get backwards

Every score the evaluator produces is a **RISK**: `0.0` is good, `1.0` is bad.

| field | meaning | 0.0 | 1.0 |
| :--- | :--- | :--- | :--- |
| `grounding_score` | NLI: contradiction + 0.5 x neutral against the evidence | grounded | ungrounded |
| `tool_claim_score` | agent's claim vs the tool's real result | claim matched | claim wrong |
| `overall_risk_score` | weighted blend of the above | low risk | high risk |
| `label` | `low_risk` (<= 0.4) / `medium_risk` (<= 0.7) / `high_risk` (> 0.7) | | |

The one function that maps a risk to a colour is, and must remain:

```ts
riskTone(score) = score > 0.7 ? 'bad' : score > 0.4 ? 'warn' : 'ok'   // null -> 'unmeasured'
```

**`src/lib/riskTone.ts` currently implements the opposite** (>= 0.8 is emerald
"Supported", < 0.5 is rose "Contradiction"), and `riskTone.test.ts` asserts the
inverted behaviour. As it stands, an ungrounded answer (risk 0.95) renders
**green**. `MonitoringPanel.tsx` imports it. Fix this first: one `riskTone`, the
one above; fix it in place rather than adding a second; rewrite its test around the real thresholds, including the boundaries
0.4 and 0.7 and `null`.

Put the one `riskTone` in `src/lib/riskTone.ts` (fix it in place; it is where the
current tree keeps it). `AGENTPULSE_DESIGN_SYSTEM.md` names `components/ui.tsx` for
it, but that file no longer exists; see A7 on what the doc still governs.

If you present a human-friendly word, derive it from risk: `ok` -> "Grounded",
`warn` -> "Uncertain", `bad` -> "Ungrounded". Never "Supported/Contradiction" on a
bare number, because the NLI label and the risk score are different things.

### A4. What the screen must show

Two panes, side by side on desktop, stacked on narrow screens, one product.

**Left, the chat.** Message list, composer, per-turn status
(running / completed / failed). While a turn runs, show which agent is working
using **real** progress only: you know a stage finished when the response says so;
the single `/chat` call returns once, at the end, so before that show "working",
not an invented stage timeline. If you want live stages, the honest source is
`new_span` events on the socket for that `trace_id`. Each answer shows: the reply,
the verifier's verdict, the real retrieved titles, and a link
**"Open trace"** to the full Traces view for that `trace_id`.

**Right, the instrument panel, for the selected turn:**

1. **Agent ledger.** One row per agent that ran: role, model, latency, tokens.
   Per row, the evaluator's verdict **as it arrives**: grounding risk with
   `riskTone` colour and the word from A3, the evaluation stage (`stage1` =
   embedding similarity only, `stage2` = NLI), and the evidence the score was
   computed against (the span's `input_summary`) beside the claim (its
   `output_summary`). Showing *why* a score is what it is is the product.
2. **Tool-claim check** on the retriever row: the claim the model made next to the
   tool's real `tool_result_summary`, with `tool_claim_score`. A score of `0.0`
   alone is ambiguous (verified, or nothing to verify). If the API does not say how
   many claims were found, show "claims checked: n/a", not a green tick.
3. **Drift and stability per agent**, from `/v1/drift` and `/v1/agents`: ASI,
   windowed centroid distance, tool drift, `baseline_size`. Drift needs a filled
   baseline and current window (32 spans per agent) before it means anything. Until
   then show "warming up: 14 / 32 spans" computed from the real `baseline_size`,
   and **no drift number at all**. Do not write a drift value on turn 32 or any
   other turn; read it from the API or show an em-dash.
4. **Incidents** raised by this turn's trace (`trace.alerts`) and the recent ones
   from `/v1/alerts`, acknowledgeable via `PATCH`.
5. **Platform strip**: API ready, evaluator workers alive, queue state, from
   `/v1/health/*`. If the evaluator is down, say so on the panel itself, because
   then every score is "pending forever" and the viewer should know why.
6. **Session history** of risk across turns (a small honest sparkline of real
   `overall_risk_score` per turn; unevaluated turns are gaps, not zeros).

### A5. Backend gaps: show absence, never fill it

The trace endpoint's per-span `evaluation` returns only `grounding_score`,
`tool_claim_score`, `overall_risk_score`, `label`, `evaluation_stage`. It does
**not** return `disagreement_score`, `semantic_score`, the count of tool claims
found, or whether the NLI input was truncated, although the backend computes or
stores some of them. Render those as an em-dash with a tooltip reading
"not exposed by the API yet", and list them in your hand-off as backend work.
Do not derive them, estimate them, or leave them out silently.

`disagreement_score` is also **not an alert source** (withdrawn, handoff 24.9.5: it
measured an artifact). When it exists, show it as a recorded number, never as an
incident or a red badge.

### A6. Every datum is in exactly one of five states, and each looks different

`pending` (requested, not yet evaluated) · `measured` (real value) ·
`unmeasured` (the system does not produce it, em-dash + reason) · `unreachable`
(the service did not answer, with which one and how to start it) · `error` (it
answered with a failure, with the message). Build one small state model and
render everything through it. There is no sixth state called "default".

### A7. Industry-grade requirements

- **Failure is a first-class design.** Chat server down, API down, evaluator down,
  model returns 502, evaluation never arrives: each has a designed, accurate,
  actionable state. Time-outs are time-outs ("still evaluating after 60 s,
  worker may be down"), never a made-up result.
- **No secrets in the bundle.** Vite inlines `VITE_*` into the shipped JS. The
  model key lives only in the chat server's environment. Do not add any provider
  key to the frontend or its `.env.example`.
- **Cancellation and races.** Abort in-flight `/chat` and polling on unmount and
  on a new turn; a late response for turn N must not overwrite turn N+1.
- **Bounded polling.** Exponential backoff, a ceiling, stop when every span of the
  trace is evaluated or on failure. No timers that outlive the component.
- **Accessibility.** Keyboard-complete (send, move between turns, open trace),
  visible focus, `aria-live` for turn status and arriving scores, colour never the
  only carrier of meaning (every tone has a word or icon), contrast AA on the dark
  palette, `prefers-reduced-motion` respected.
- **Responsive.** Usable at 360 px wide. No horizontal page scroll.
- **Performance.** A 200-turn session stays smooth: virtualise or window the
  list, memoise rows, no full-tree re-render per poll.
- **Design system.** `AGENTPULSE_DESIGN_SYSTEM.md` was written for the dashboard
  that existed before the frontend was replaced (handoff 18.2). Its **rules**
  still apply: colour carries one meaning each (cyan = identity/navigation,
  emerald/amber/rose = risk only, always through the one `riskTone`), every number
  in the mono face with tabular figures, one heavy "signature" element
  (the Waveform) and nothing else competing with it, 1 px hairlines. Its
  **tokens** do not exist in the current tree: no `state-ok/warn/bad`, no
  `components/ui.tsx`, no `tailwind.config.js`. The current tree is Tailwind v4
  (`@import "tailwindcss"` in `index.css`), Plus Jakarta Sans for UI and
  JetBrains Mono for data, and uses Tailwind's emerald/amber/rose classes
  directly. Match what is actually there. Do not add a palette, a font, or a
  config file, and do not re-theme the app in this task.
- **Tests that can fail.** Unit tests for the state model, `riskTone`, the
  adapters that map API shapes to view models, and the polling/abort logic
  (fake timers). A test that would still pass if the number were hardcoded is not
  a test.

### A8. Scope

In scope: `dashboard/src/components/rag/**`, `dashboard/src/lib/ragApi.ts`,
`ragTypes.ts`, `riskTone.ts` (+test), the `rag-monitor` wiring in `App.tsx`,
`ProductHeader`, `FloatingDock`, `CommandPalette`, and new files you need.
Out of scope: everything under `backend/`, `demo/`, `sdk/`, the public landing
page, and the `/v1` contract. If the screen needs a backend change, write it down
in the hand-off instead of working around it.

### A9. Verify before you say done

Run, and paste the real output:

1. `npm run build` and `npx tsc --noEmit` clean; `npx vitest run` green.
2. Start the real stack: AgentPulse API + evaluator worker (`uvicorn app.main:app
   --app-dir backend`, the worker), the chat server
   (`uvicorn demo.chat_server:app --port 8100`) with a real provider key, then the
   dashboard. Send three different questions. Screenshot the panel with a turn
   **pending**, then **evaluated**, then with the chat server **stopped**, then with
   the evaluator **stopped**.
3. Grep the **built bundle** (`dist/`), not the source, for the banned strings in
   Part B. Zero hits. Do this *after* your last change; an earlier pass proved
   nothing last time (handoff 23.3).
4. Hand-off lists: what you measured against a live backend, what you only
   unit-tested, what you could not verify, and the backend gaps from A5.

Do not mark anything done on the strength of the code looking right.

---

## Part B: NEGATIVE PROMPT

Each line is here because it already happened in this repository.

**Never invent a number.**
- No hardcoded score, rate, latency, cosine similarity, drift value, count or
  percentage anywhere in the chat or panel. This is the specific bug already in
  `RagChatbotApp.tsx`: after 30 s without an evaluation it writes
  `groundingScore: 0.942, 'SUPPORTED', 'STAGE_2_NLI_VERIFIED'`, and once 32 spans
  are counted it writes drift `0.082 / 0.045 / 0.024`. Neither came from any
  system. Delete both.
- No `Math.random()` for trace ids, scores, latencies or anything displayed.
- No fallback value on timeout. Timeout is a visible state.

**Never simulate.**
- Delete `simulateSequentialTurn`, `isSimulatorMode`, `forceFailure`, and every
  "simulator" toggle. A dead service is shown as dead, with the error. There is no
  "demo mode" that fabricates a reply.
- No `mockData`, `MOCK_*`, fixtures, or sample arrays in anything that ships. A
  previous commit made `useTelemetry` fall back to mocks and report
  `connected: true`; a dead backend then rendered as a healthy fleet. It was
  reverted. Do not reintroduce it, and do not add a Vite dev-server plugin that
  answers `/v1/*`, `/chat` or `/corpus`.
- No default corpus list. The SQLite titles hardcoded in `ragApi.ts` are not the
  index's contents. Titles come from `GET /corpus` or the list is empty with an
  "unreachable" state.

**Never get the polarity wrong.**
- Do not treat a high score as good. Every evaluator score is a risk. See A3.
- Do not keep, import, or re-create the inverted `riskTone` in `lib/riskTone.ts`.
- Do not introduce a second threshold set or any colour not derived from the one
  `riskTone`.
- Do not label a bare risk number "Supported" or "Contradiction".

**Never claim what the product does not do.** Banned in any visible string, tooltip,
badge, comment-turned-copy or empty state: "Datadog-grade", "MLflow-grade",
"enterprise-grade", "SOC 2", "HIPAA", "UMAP", "CI/CD gate", "GitHub Action",
"ring buffer", "consensus voting", "zero-config", "self-healing", "real-time" for
anything that polls, any accuracy / F1 / AUC figure not read from a results file
at runtime. Previous rounds found ten, then four, then three more of these.
Assume you will produce one; grep for it.

**Never imply a signal is validated when it is not.**
- Do not present disagreement as an alert or a detector. It is a recorded score
  that failed external validation.
- Do not present tool-claim `0.0` as "verified"; it usually means nothing was found
  to check.
- Do not present drift before the 32-span window fills.
- Do not present stage-1 (embedding similarity) scores as NLI verdicts.

**Never hide absence.**
- Do not render `null` as `0`, `0%`, `-`, or "Healthy". An unmeasured value is an
  em-dash with a reason.
- Do not hide a failed span, a 502, a missing evaluation or a down worker to keep
  the screen looking clean. A clean screen over a broken pipeline is the worst
  possible output for an observability product.

**Never leak or widen.**
- No provider key, token or secret in source, `.env.example`, localStorage, a URL,
  or a log line. No `VITE_` variable carrying a credential.
- Do not call a model directly from the browser. The chat server owns that.
- Do not touch `backend/`, `demo/`, `sdk/`, the landing page, lockfiles you did not
  need to change, or the root of the repo. Do not add root `package.json`,
  `metadata.json` or npm workspaces; they shadow `dashboard/package-lock.json` and
  were already removed once.
- Do not add a dependency for something five lines does.

**Never ship the generic.**
- No purple-to-blue gradient hero, no glassmorphism cards stacked on cards, no
  emoji as icons, no "AI sparkles", no decorative orbs, no lorem-ipsum states.
  Use the fonts and colours already in the tree; do not introduce new ones.
- No animation that implies activity that is not happening (a pulsing "LIVE" dot
  on a stalled connection, a progress bar that is not tied to a real event).
- No second "signature" element. The Waveform already earns the heavy treatment.

**Never mark done unverified.**
- Do not report success on the basis of a clean `tsc` and a pretty screenshot of a
  mocked state.
- Do not grep source and call the bundle clean. Grep `dist/`.
- Do not write a test that passes when the value is hardcoded.
- Do not skip, disable or loosen a failing test.

---

## Part C: acceptance checklist (for the reviewer, not the agent)

Tick only what you saw happen in a browser against the real stack.

- [ ] Stop the chat server: the view says it is unreachable and names the port. No reply appears.
- [ ] Start it with **no provider key**: sending shows the 503 message naming the env var.
- [ ] Send a question: three agents appear in order with real models and latencies.
- [ ] Each agent's risk appears **after** the answer (pending, then a value), not with it.
- [ ] A deliberately ungrounded answer shows **rose/ungrounded**, not green. (Quickest test: ask something the corpus does not cover; the retrieved documents will be unrelated.)
- [ ] Stop the evaluator worker: after the timeout the panel says the evaluator is down; no score is invented.
- [ ] Drift shows "warming up n / 32" from the API, and no number, until the window fills.
- [ ] Disagreement, claims-found and truncation show an em-dash with "not exposed by the API yet".
- [ ] "Open trace" lands on the same trace in the Traces view with the same scores.
- [ ] Kill the API mid-turn: no stale result overwrites the next turn.
- [ ] `grep -rEi '0\.942|SUPPORTED|simulate|MOCK_|mockData|SQLite Write|Datadog|SOC ?2|HIPAA|UMAP|CI/CD|ring buffer' dashboard/dist` returns nothing.
- [ ] `npx vitest run` green, and flipping a score in a fixture flips the asserted colour.
- [ ] 360 px wide, keyboard only, and a screen-reader pass each complete a turn.

If any box is unticked, the feature is not done.
