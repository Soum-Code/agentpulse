# Ponytail review, 2026-10-27

Review only. Nothing in the code was changed.

**Scope:** what reached `origin/main` since 2026-10-21 (`ed01b9b`), plus open PR #110 (`claude/rag-chat-refine-aed352`, `components/rag/**`), read from its branch.

**Lenses:**
- correctness;
- security and abuse of the public routes (`/chat*`, `POST /v1/simulate`, every GET that nginx serves with the master key);
- UI honesty (an unknown value is never shown as ok, 0 or none, and no number is invented);
- Ponytail (bloat, unfinished callers, missing tests).

I tried to refute every finding against the code before keeping it. The ones I refuted are listed at the end.

## Counts

| Severity | Count |
|---|---|
| must | 1 |
| should | 4 |
| nice | 5 |

### Must-fix list

1. **M1.** A trace whose spans the evaluator has not scored yet is shown as **OK** (green) in Traces, the Overview dots, the filters, the counts and the exports. In the Telemetry Lab, a "hallucination" run therefore shows a green OK trace until the worker catches up. See `dashboard/src/lib/traceStatus.ts:50`.

### Not reviewed, not run

- **Not read in depth:**
  - `backend/app/rescore_cli.py` (545 new lines);
  - the `backend/app/services/grounding.py` changes;
  - `classify()` and `build_chain()` in `demo/chat_providers.py` (I read the failover loop and `_attempt`);
  - `index.css`, `colorPalettes.ts`, `UnifiedPaletteBar.tsx`, `LiquidBackgroundCanvas.tsx`;
  - the claims in the `PublicExperience.tsx` copy;
  - `presentation/`, `docs/` and the `*.md` changes.
- **PR #110:** I read the logic (`chatView.ts`, `ragTheme.ts`, and the non-className lines of `ChatConsole`, `MonitoringPanel` and `RagChatbotApp`). I did not check the CSS or the contrast claims.
- **Not run:**
  - `deploy/azure/check_caddy_paths.sh` (it needs a Caddy binary);
  - any end-to-end run through Caddy, nginx and the backend;
  - anything against the live site or the VM (both were out of bounds).
- **Caddy and nginx behaviour:** taken from the config files and what I know of Caddy 2 and nginx defaults, not observed. That covers Caddy replacing a visitor's `X-Forwarded-For`, and nginx passing it on unchanged.

### Test runs (this worktree, `origin/main` = `ed01b9b`)

| Run | Result |
|---|---|
| `python -m pytest tests -q` with the system Python | **18 collection errors**: `sqlmodel` and `pytest_asyncio` are not installed. This is an environment problem, not a code problem. |
| Same command with `C:\MLOPs\3rd sem project\Agentpluse\.venv\Scripts\python.exe` | **627 passed**, 0 failed, 7 warnings (torch.jit deprecation), 386 s |
| `dashboard`: `tsc --noEmit -p .` | exit 0, no errors |
| `dashboard`: `node node_modules/vitest/vitest.mjs run` | **30 files, 366 tests passed** |
| PR #110 branch (temporary worktree, since removed): `tsc --noEmit -p .` | exit 0 |
| PR #110 branch: vitest | **29 files, 326 tests passed**. The branch is based on `664ef9f`, before #108 and #109, so it has fewer tests than main. GitHub reports it MERGEABLE/CLEAN. |

---

## must

### M1. An unscored trace is "ok"

**Where:** `dashboard/src/lib/traceStatus.ts:50`, with `dashboard/src/lib/adapters.ts:106-117`.

```ts
// adapters.ts spanStatus(): a span with no evaluation row yet falls through to 'ok'
const risk = span.evaluation?.overall_risk_score;
if (risk != null && risk > 0.5) return 'warning';
...
return 'ok';
// traceStatus.ts deriveTraceStatus(): detail loaded + no failed span + no alert => 'ok'
return alerts === undefined ? 'unknown' : 'ok';
```

**Why it is a bug:**
- Ingest only enqueues the evaluation (`ingest.py:233`, "enqueues one durable evaluation job per span").
- `GET /v1/traces/{id}` sends `"evaluation": None` for a span that has no evaluation row yet (`routers/__init__.py`, the `get_trace` body).
- Alerts such as `HIGH_HALLUCINATION_RISK` are only written once the worker scores the span.
- So during the queue wait, a loaded trace has `alerts: []`, every span is `'ok'`, and the trace is `'ok'`. The UI shows a green "OK" for something nobody has measured yet.
- The RAG ledger already models this correctly: `ragLedger.ts:41` returns `pending` when there is no evaluation. Only the console's status does not.

**Failure scenario:**
1. A visitor runs Telemetry Lab → "hallucination".
2. The worker is behind. The queue may be up to `AGENTPULSE_SIMULATE_MAX_QUEUE_DEPTH` = 100 jobs, at about 3.9 spans/s, so up to roughly 25 s plus the 10 s poll. The new trace is polled and hydrated.
3. Traces lists it under `OK (n)` with a green dot, and the Overview dot is green. A CSV export made now writes `ok`.
4. The status only turns red at the next poll after scoring. If the inspector has it selected, it never turns red (see S1).

**Smallest fix:**
1. In `toSpans`, carry `evaluated: s.evaluation != null` on `Span`.
2. In `deriveTraceStatus`, return `'unknown'` instead of `'ok'` when any span has `evaluated === false`. Error and warning still win first.
3. Update `traceStatusTitle('unknown')` to mention "not scored yet".
4. Add one vitest case: alerts `[]` plus one unscored span gives `'unknown'`.

A worker writes a row for every job, including `evaluation_stage='skipped'`, so a trace does not stay unknown forever.

---

## should

### S1. The selected trace in the inspector is a snapshot that never refreshes

**Where:** `dashboard/src/App.tsx:76-89` and `dashboard/src/components/product/TracesView.tsx:296`, `:335`.

```ts
// App.tsx
if (!selectedTrace || selectedTrace.alerts !== undefined) return;   // loaded once, then never again
// TracesView.tsx
const currentTrace = selectedTrace || paginatedTraces[0] || ...;
if (!selectedTrace && currentTrace.alerts === undefined) onSelectTrace(currentTrace);  // auto-selects the newest
```

**Failure scenario:**
1. TracesView auto-selects the newest trace. App loads its detail once and stores it in `selectedTrace`.
2. `useTelemetry` re-hydrates the list every 10 s, but nothing copies the fresh copy back into `selectedTrace`.
3. When the evaluator later raises a HIGH alert, the list row turns red. The inspector keeps the white breadcrumb (`TracesView.tsx:1638-1643`) and `RISK SCORE N/A` (`:1800-1802`) until the visitor clicks another trace and back.
4. The `ActiveContextPanel` also reads the stale copy.

**Smallest fix:** in App, pass `traces.find(t => t.id === selectedTrace?.id && t.alerts !== undefined) ?? selectedTrace` to the views, instead of `selectedTrace`. That is one `useMemo`. No test is needed beyond the existing `TraceStatusViews.test.tsx`; add one case if it is cheap.

### S2. Active Context shows an invented "running" agent status, and colours error and critical green

**Where:** `dashboard/src/components/product/ActiveContextPanel.tsx:83` and `:274-280`. The code is from 2026-09-06; the file changed in this window.

```ts
const effectiveAgentStatus = selectedAgent?.status || (selectedTrace?.status === 'error' ? 'error' : 'running');
...
effectiveAgentStatus === 'warning' ? 'bg-amber-…' : 'bg-emerald-…'
```

**Failure scenario:**
- Select a completed trace with status `ok`, `warning` or `unknown` and no agent selected. The agent card shows a green **RUNNING** badge. Nothing measured "running".
- Select a trace with status `error`, or an agent whose status is `critical`. The badge says ERROR or CRITICAL in **green**, because only `'warning'` is amber.

**Smallest fix:**
- Use `selectedAgent?.status` only, and render no badge when there is no agent.
- Map the tone `critical`/`error` → rose, `warning` → amber, else → neutral.

### S3. "Spans before latest" shows 0 for an agent that has no drift record

**Where:**
- `backend/app/routers/__init__.py:399`: `"baseline_size": drift.baseline_size if drift else 0`
- `dashboard/src/lib/adapters.ts:305`: `baselineSampleCount: d.baseline_size ?? 0`
- `dashboard/src/components/product/DriftView.tsx:224`: renders `{p.baselineSampleCount}` under the header "Spans before latest".

**Failure scenario:** an agent with 15 spans has no `DriftRecord` yet (fewer than 20 + 12 evaluated outputs). The table row says **0** spans. `adapters.ts:59-63` (`driftSpansSeen`) already treats exactly this 0 as "unknown", so the same file contradicts itself.

**Smallest fix:**
1. Backend: `if drift else None`.
2. `toDriftProfiles`: `baselineSampleCount: d.baseline_size ?? undefined`. The `DriftProfile` type allows it; widen it if not.
3. `DriftView`: `formatCount(p.baselineSampleCount)`, or a dash.

`driftSpansSeen` keeps working, because its `== null` branch covers `None`.

### S4. The RAG Monitor shows "Evaluator offline" when the state is unknown

**Where:** `dashboard/src/components/rag/RagChatbotApp.tsx:129-137` and `components/rag/MonitoringPanel.tsx:76-107`. Both are on main and unchanged by PR #110.

```ts
} catch {
  setEvaluatorReadiness({ ready: false, workers_alive: 0, …, reasons: ['Unable to reach AgentPulse API on /v1/health/evaluator'] });
}
...
const workersAlive = evaluatorReadiness?.workers_alive ?? 0;   // null (not checked yet) -> 0
… isEvaluatorAlive ? `Worker alive (…)` : 'Evaluator offline'
```

**Failure scenario:**
1. Before the first probe answers (`evaluatorReadiness === null`), the badge is red "Evaluator offline", with the tooltip "No evaluator worker alive". Nothing has been measured at that point.
2. When the API cannot be reached, the catch writes `workers_alive: 0`, and the badge again says "No evaluator worker alive". The worker may be fine; only the API, or the visitor's network, is down.

The 503 case is handled correctly: `fetchApi` returns the body on a 503 (`lib/api.ts:243-249`), so a real "no worker" answer keeps its own reasons. I checked this, and it is not part of the finding.

**Smallest fix:**
- Keep `null` in the catch, and keep the "Unable to reach…" reason in a separate state if it is wanted.
- Render a neutral "Evaluator: checking…" or "unknown" badge when the value is `null`.

---

## nice

### N1. The chat counts each IPv6 address on its own; the Lab counts the /64

**Where:** `demo/chat_guard.py:192-209` (`client_ip`), compared with `backend/app/services/simulate_guard.py:124-144` (`_bucket`, IPv4-mapped normalisation).

**Failure scenario:** if the VM is ever reachable over IPv6, one visitor can rotate addresses inside their /64 and get a fresh `CHAT_IP_TURNS_PER_DAY` (40) for each address, up to the site cap of 300. That empties the live chat for everyone for the rest of the UTC day.

Today the Azure public IP is IPv4 only, as far as the README says, so this is latent. The simulate guard's docstring says it copies "the rule of `client_ip()` in `demo/chat_guard.py`", but the copy is the better one.

**Smallest fix:** copy `_bucket` and the `ipv4_mapped` step into `chat_guard.client_ip`. Add one test: two addresses in the same /64 count as one.

### N2. The `/v1/ws/live` hardening protects an endpoint no client opens (Ponytail), and has a check-then-accept race

**Where:** `backend/app/routers/websocket.py:72-87`, `:141-145`, plus the `ws_*` settings in `config.py` and `tests/test_websocket_limits.py`.

**Unused endpoint:**
- The dashboard has not opened a WebSocket since 2026-09-06: `websocketUrlFor` in `lib/api.ts:223` is only imported by `api.test.ts`.
- The endpoint is still public: Caddy lets GET through, and nginx adds `Upgrade` and the master key.
- The smallest change would have been to stop routing it: `@ws path /v1/ws/*` → `respond 404` in the Caddyfile, or drop the router. That beats ~80 lines of limits, settings and tests.

**Race:** `refusal_reason()` checks the counts synchronously, then `connect()` awaits `accept()` before it appends. So N handshakes that arrive together all pass a limit that has one slot left.

**Close code:** `close(code=1013)` before `accept()` reaches the browser as an HTTP 403 handshake failure, not as close code 1013. The `TestClient` hides this.

**Smallest fix:** close the route at Caddy, or append to `_connections` and `_visitor_of` before `await websocket.accept()`. If the route is kept, also delete the unused `websocketUrlFor` and its test.

### N3. PR #110: `ragTheme.ts` keeps 10 keys nothing reads, and 3 parameters it ignores

**Where:** `dashboard/src/components/rag/ragTheme.ts` on the PR branch.

`getRagTheme(_palette, _isCalmMode, _chalkSurface)` now returns one constant. The comment says the arguments are "kept so the callers… need no change". None of these keys is referenced anywhere in `dashboard/src` (checked with `git grep` on the branch):

- `containerBg`, `headerBorder`
- `userBubbleText`, `userBubbleBorder`
- `assistantBubbleBg`, `assistantBubbleBorder`
- `statusPillBg`, `statusPillBorder`, `statusPillText`
- `glowClass` (its value is `''`)

Ponytail says to finish the callers rather than keep a compatibility shim.

**Smallest fix:**
1. Delete the 10 keys from the interface and the object.
2. Make it `export const RAG_THEME`, or keep `getRagTheme()` with no parameters, and update the 5 call sites: `ChatConsole`, `ConnectionModal`, `CorpusModal`, `MonitoringPanel` and `RagChatbotApp`.

### N4. Curating a span with an unknown risk labels it SUPPORTED

**Where:** `dashboard/src/App.tsx:306-315`. This is outside the diff (2026-09-06), but in a file that changed.

```ts
expected_classification: risk != null && risk > 0.5 ? 'REFUTED' : 'SUPPORTED',
is_failure: risk != null && risk > 0.5,
```

**Failure scenario:** someone with the write password curates a span from a trace that has not been scored (`groundingScore` is undefined). The benchmark dataset gets a ground-truth `SUPPORTED` / `is_failure: false` case that nobody measured. It would then skew any later evaluation run against that dataset.

**Smallest fix:** refuse to curate when `risk == null`, with a message such as "score this trace first", or send no label and let the dataset owner set it.

### N5. Public writes put visitor text in front of the examiners (a risk, not a bug)

`POST /v1/simulate` (`query` ≤ 500 characters) and `/chat` (≤ 500 characters, saved in `tool_args`) are open without a password. Their text is shown on the public console (trace previews, span inputs) and in the RAG ledger. React escapes it and CSV export defuses formulas (`traceExport.ts:219-228`), so it is not XSS.

What remains is defacement: a troll can put offensive text on the console the examiners will open. The chat discloses this (`ChatConsole.tsx` on #110: "anyone can read… Do not type anything personal").

**Mitigation without code, for viva day:** `touch chat-control/<pause file>`, and `AGENTPULSE_SIMULATE_DAILY_CAP=0`, both documented. Alternatively, have the presenter's own runs ready.

---

## Refuted or checked and clean

| Claim tested | Result |
|---|---|
| The `@write` exemption for `/chat*` could leak a write to the dashboard or backend | **Refuted.** The `@write` line and `handle /chat*` use the same `path /chat*` matcher, so anything that skips the password goes to `chat:8100` only. |
| `@keys` regex bypass (case, `//`, `/./`, `..`, `%6b`, `%2F`, trailing `/`) | **Refuted.** It matches on the decoded `{http.request.uri.path}`. uvicorn decodes once, so a double-encoded spelling is not routed. |
| The `/v1/simulate` exemption lets other methods or paths through | **Refuted.** The `expression` requires `POST` and an exact path. A percent-encoded spelling decodes to the same route. |
| The Lab's per-IP limit is defeated because nginx hides the client IP | **Refuted.** nginx does not override `X-Forwarded-For`, so Caddy's value reaches the backend. The peer (nginx) is in `DEFAULT_TRUSTED_PROXIES`, so the visitor's address is used (`simulate_guard.py:130-144`). Taken from the config, not observed. |
| A huge public `POST /v1/simulate` body | **Refuted.** nginx's default `client_max_body_size` is 1 MB, and the model sets `query max_length=500`. |
| `BodySizeLimitMiddleware` raising `HTTPException` inside `receive` turns into a 500 | **Refuted.** FastAPI re-raises `HTTPException` from the body read, so the client gets 413. `test_input_limits.py:234` covers the chunked case. |
| The evaluator probe's 503 body is lost and replaced by "Unable to reach" | **Refuted.** `fetchApi` returns the JSON body on a 503 (`lib/api.ts:243-249`). |
| The chat stream leaks a concurrency slot on disconnect | **Refuted.** `_TurnStream.__call__` releases the slot in `finally`, around the whole response. The `POST /chat` path releases in `finally` too. |
| A stalled provider request lets the next turn double-send to Pollinations | **Refuted.** The lock is handed to the request's done-callback (`chat_providers.py:571-577`, `_request_ended`). |
| The CORS default regex is unanchored | **Refuted.** Starlette uses `fullmatch`. |
| The chat collects visitors' questions without telling them | **Refuted.** It is disclosed in `ChatConsole.tsx` (PR #110). |
| CSV formula injection from visitor text | **Refuted.** `csvCell` prefixes `= + - @ \t \r`. |
| The placeholder-key fail-closed check is skipped in production | **Refuted.** `docker-compose.yml` sets `AGENTPULSE_LOCAL_DEV_MODE=false` for the backend and the worker, so `startup_security_problem` applies. |
| The RAG ledger shows a missing evaluation as 0 or ok | **Refuted.** `ragLedger.ts` uses `pending` and `unmeasured`. The `?? 0` sum only runs when a token count is present. |
| PR #110 "Total: 0ms" when the times are unknown | **Fixed on the branch.** `stageTimeSum` returns null, which renders a dash, and it is tested. |
| Hard-coded figures in the product views | **None found.** The remaining numbers (203 ms, 30 cases) are cited in comments to `LLM_JUDGE_COMPARISON_REPORT.md`. |

## Ponytail notes on the window as a whole

- **Tests:** every new backend module has its own test file: `test_chat_guard`, `test_chat_providers`, `test_chat_server`, `test_simulate_guard`, `test_websocket_limits`, `test_input_limits`, `test_startup_security`, `test_caddyfile_keys`. The dashboard's new `lib/*` helpers each have a vitest file. No caller was left half-migrated, except the `getRagTheme` shim (N3).
- **Duplication:** `client_ip` exists twice, on purpose and with the reason documented (the backend image has no `demo/`). The copies have drifted already (N1), so keep them in step or share a tiny module.
- **Bloat:** N2 is the main case. Separately, the comment-to-code ratio in `demo/chat_*.py` and `simulate_guard.py` is high (often a 3- to 6-line comment over a one-line function). That is a house style, not a defect, so it is not counted.
