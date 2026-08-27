# Productization Log

Running record of the productization effort. One entry per phase, each carrying the
measurable before/after evidence for what changed, and an explicit note of what was
deliberately *not* done.

**Scope decision (2026-08-27).** Thin vertical, not full SaaS. The target claim is
*"self-hosted, single-tenant, durable evaluation at a measured spans/sec, with
self-monitoring and honest capability tiers."* **Not** "production ready" — that phrase is
binary and unfalsifiable, and is deliberately avoided throughout.

**Deferred by decision, with reasons — these are stated boundaries, not undiscovered gaps:**

| Deferred | Reason |
| :--- | :--- |
| PostgreSQL | SQLite is adequate for single-operator deployment; no concurrency requirement yet |
| Multi-tenancy | Not a SaaS. Tenancy is a schema concern and would have to be designed with the schema, not bolted on |
| Backup / disaster recovery | Follows from a database decision that has not been made |
| Rate limiting / abuse protection | Single-tenant; no adversarial neighbour to protect against |
| OTLP ingestion | Valuable for interoperability, but not required to make the current SDK path reliable |
| Scale tiers 2–3 (100 / 1,000 spans/sec) | See Phase 0 item 3 — the current evaluator is 250–700× short of tier 3, which is an architecture question, not a tuning one |

---

## Phase 0 — current state freeze

Goal: establish a stable, honest baseline and defuse known hazards before any
architectural work. No production code changed in this phase.

**Baseline at entry:** tests 130/130, `backend/` and `sdk/` untouched throughout.

### Item 1 — dashboard checkpoint (commit `8a93558`)

~1749 lines of in-progress dashboard work had been sitting uncommitted. Committed as a
checkpoint rather than deferred, because every phase from here changes backend contracts
and an uncommitted tree would have accumulated silent conflicts against all of them.

**Verified before committing:**

| Check | Result |
| :--- | :--- |
| `npx tsc --noEmit` | clean |
| `npm run build` | succeeds (chunk-size warning only) |
| Fabricated-data scan | no `Math.random`, no mock/fake/dummy generators |
| `ExperimentsView` figures vs `experiments/results/ablation_results.json` | match on all 7 ablation configs |
| Strategy figures vs `reasoning_strategy_results.json` | exact match |
| Dataset counts vs `datasets/v1.0_*.json` | dev 21 / val 22 / test 30 — correct |
| `api.ts` new drift fields | genuinely returned by `routers/__init__.py:283-284` |

**Three known gaps recorded, deliberately not fixed** (dashboard is frozen until backend
contracts stabilise):

1. `DriftCenterView` renders a hardcoded 5-point series while receiving a real `agents`
   prop it never reads; `/v1/drift` goes uncalled. Disclosed as "Illustrative series" but
   easy to miss, and the 0.30 threshold it draws was superseded when alerting was
   repointed to `window_centroid_distance`.
2. `DatasetsView` hardcodes its table including a `v1.0_curated / 1 case` row that is a
   guess about database state. `GET /datasets` already returns live counts. Header reads
   73; table sums to 74.
3. `ExperimentsView` configs D, E, F are stale — `ablation_results.json` is dated
   2026-08-23, before the disagreement rewiring and the drift rebuild. Labelled "Snapshot
   of last recorded run" but undated.

Gaps 1 and 2 put non-live numbers on a product surface and must not survive the dashboard
phase.

### Item 2 — drift report regeneration hazard (commit `78697c5`)

**A correction to this plan's own premise first.** The plan asserted that
`DRIFT_EXPERIMENT_REPORT.md` §3 contained a known-false claim that the centroid detector
never fired. **That was wrong.** §3 correctly scopes its claim to the synthetic run, states
the maximum observed distance as 0.099, identifies `stability_index < 70` as the branch
that fired, and explicitly warns against concluding the detector would miss real drift. The
misremembered error was mine, in the real-text diagnosis, and was already corrected there.

**The real hazard, which is worse.** `experiments/drift_scenarios.py` wrote
`DRIFT_EXPERIMENT_REPORT.md` from a hardcoded template on every run. That report is curated:
§4 is a correction notice, §3 and §5 are analysis and limitations. The template produced
only §1 and §2, so a run deleted the rest — *and* the template still contained all three
errors the correction notice records fixing, so it silently reintroduced them:

| Error in template | What §4 recorded |
| :--- | :--- |
| "shifts at 50% and above … were detected within 1-2 spans" | contradicted by the table in the same file; measured recall is 0.400 |
| "Magnitude" column labelled cosine distance, populated with `shift_level` | real distances are ~10× smaller; this is what made the first error look plausible |
| rule given as "0.30 cosine distance" | omits the `stability_index < 70` branch, which is what actually fired |

**Fix:** the script now writes `experiments/results/drift_scenarios_generated_report.md`
and never targets the curated report. All three template errors corrected, and recall,
detection counts and max centroid distance are now **computed from the results** rather than
asserted in prose — which makes the first error's class structurally impossible.

**Evidence:** md5 of `DRIFT_EXPERIMENT_REPORT.md` byte-identical across a full run. Re-run
produced **zero material differences** across all 11 scenarios (only the timestamp moved),
so the curated report's corrections remain grounded in unchanged data. The generated summary
independently reproduces recall **0.400** and max centroid distance **0.099**, matching the
curated figures.

### Item 3 — ONNX Runtime silently not loading

Every model load in this repo prints:

```
ONNX Runtime load skipped (cannot import name '_attention_scale' from
'torch.onnx.symbolic_opset14'), falling back to PyTorch
```

**Diagnosis.** `load_models()` defaults to `use_onnx=True`, so the intended fast path is
dead. Root cause is a version incompatibility, confirmed by inspection:

| Package | Installed | Note |
| :--- | :--- | :--- |
| `torch` | 2.13.0 | removed `_attention_scale` from `torch.onnx.symbolic_opset14` |
| `optimum` | 1.27.0 | `optimum/exporters/onnx/model_patcher.py:346` still imports it |
| `onnxruntime` | 1.29.0 | fine |
| `transformers` | 4.53.3 | fine |

**The upgrade path is not a version bump.** optimum 2.x removed the `optimum/onnxruntime/`
subpackage entirely — `ORTModelForSequenceClassification` no longer exists there. The ONNX
runtime classes moved to a separate package, `optimum-onnx` (0.1.0), which requires
`optimum~=2.1.0` and `transformers<4.58.0,>=4.36`. The installed transformers 4.53.3 is
compatible, so the migration is feasible.

**Decision: diagnosed now, not migrated now.** This is a dependency restructure in the venv
that produces every research result in this repo, and `SESSION_HANDOFF.md` §3 documents a
prior dependency incident from exactly this kind of install. The blast radius of the fix
exceeds that of the bug during a freeze phase.

**Two follow-ups this creates, both recorded rather than actioned:**

- **Throughput phase:** perform the `optimum-onnx` migration in an isolated environment
  first, measure NLI latency ONNX vs PyTorch, and only then decide. Critically, this must
  happen **before** any worker-count benchmarking — tuning worker counts against an
  artificially slow evaluator would measure the wrong thing and draw the wrong conclusion.
- **Self-monitoring phase:** the fallback is a `logger.warning`, but `models_loaded()`
  reports `nli_model: True` whether ONNX or PyTorch loaded. **There is no observable signal
  that the system is running a degraded path.** For a platform whose selling point is
  observability, silently serving a slower backend with no indicator is a defect in its own
  right. Readiness should report *which* backend loaded, not just that one did.

**Blast radius of `optimum` in this repo: one call site**, `grounding.py:239`. Nothing else
imports it, so the migration is contained.

### Item 4 — capability tiers, applied now rather than at the end

Classification applied early, so that the weaker capabilities can be honestly deferred
instead of silently carried. Definitions: **Production** = reliable, externally validated,
monitored. **Beta** = working, limited validation. **Experimental** = research, limited
scope.

| Capability | Tier | Basis |
| :--- | :--- | :--- |
| **Drift / ASI** | **Beta** | Rebuilt and validated on external real traces — 1.5% false alarms, 92% detection on a held-out split (`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §11). Strongest of the four. Not Production only because it lacks production monitoring and sustained-load evidence. |
| **Grounding** | **Beta** | NLI cascade, F1 0.963 on the held-out test split. The LLM-judge comparison confirmed the cost claim decisively (12.9× lower mean latency) but **did not** establish a quality win — that claim is narrowed, not dropped. No dedicated external-corpus audit yet. |
| **Inter-agent disagreement** | **Experimental** | Internal F1 0.960 on 22 self-authored near-minimal pairs. On external real multi-agent traces the shipped configuration detects **0 of 10** independently labelled contradictions. The extraction fix that recovers 6 of 10 on DEBATE does **not generalize** (31.2% assertion correctness on a marker-free corpus). Evidence-partition relativity is an unsolved design problem on top. |
| **Tool-claim validation** | **Experimental** | F1 **0.000** on real external traces — the extractor fires on essentially nothing. The 19-case internal benchmark reported F1 0.842 and was misleading. Redesign is scoped to structurally-verifiable claims only and time-boxed; if it fails again it closes at Experimental. |

These tiers are published, not hidden. `COMPETITIVE_POSITIONING.md` §3 and §5.2 already
reflect the disagreement result.

### Phase 0 exit state

- Tests **130/130**
- `backend/` and `sdk/` unmodified — verified via `git status`
- Dashboard committed and frozen, with three gaps recorded
- Report-regeneration hazard removed, with byte-level evidence
- ONNX degradation diagnosed, with a contained migration path and two dated follow-ups
- Capability tiers published

---

## Phase 4A — migration foundation

Goal: put the schema under version control without changing application behaviour.
Sequenced **before** the durable queue deliberately — that phase introduces a jobs table,
and if it lands first the first queue schema arrives via `create_all()`, reproducing the
exact problem migrations exist to solve.

**No application code changed.** `backend/app/` byte-identical throughout; verified via
`git status`.

### What is being baselined

Alembic 1.19.1, async template, revision **`60a86ca23d8c`** (`down_revision: None`).

**9 tables, 16 indexes — 25 objects total:**

| Table | Indexes |
| :--- | :--- |
| `traces` | `ix_traces_pipeline_id` |
| `spans` | `ix_spans_trace_id`, `ix_spans_agent_id` |
| `evaluations` | `ix_evaluations_trace_id`, `ix_evaluations_span_id` |
| `drift_records` | `ix_drift_records_agent_id`, `ix_drift_records_recorded_at` |
| `baselines` | `ix_baselines_agent_id` |
| `alerts` | `ix_alerts_alert_type`, `ix_alerts_severity`, `ix_alerts_created_at` |
| `agent_records` | — |
| `dataset_cases` | `ix_dataset_cases_case_id`, `ix_dataset_cases_dataset_name`, `ix_dataset_cases_dataset_version`, `ix_dataset_cases_trace_id` |
| `experiment_runs` | `ix_experiment_runs_experiment_id` |

**Pre-flight check.** Before generating anything, the live schema was diffed against what
`SQLModel.metadata.create_all` produces: **25 vs 25 objects, zero DDL differences, zero
drift.** The models were therefore a safe authority for the baseline. Had they drifted, an
autogenerated migration would have described a schema the live database did not have.

### Is it reversible and safe?

**Reversible: yes.** `upgrade()` issues 9 `create_table` + 16 `create_index`;
`downgrade()` issues the matching 16 `drop_index` + 9 `drop_table`. Verified by round trip:
upgrade → downgrade (only `alembic_version` survives) → upgrade (schema restored identically).

**Safe on existing data: verified, not assumed.** `alembic stamp head` should only insert
a revision row, so that was tested rather than trusted. `scripts/verify_migration_baseline.py`
hashes every row of every user table before and after — content, not just counts, so a
rewrite preserving row count would still fail it.

| Database | Tables | Rows | Result after stamp |
| :--- | ---: | ---: | :--- |
| `data/agentpulse.db` | 9 | 43,941 | **every table byte-identical** |
| `backend/data/agentpulse.db` | 9 | 289 | **every table byte-identical** |

Both now report revision `60a86ca23d8c`; `alembic upgrade head` on them is a clean no-op.

*(Two database files exist because `database_url` defaults to a **relative** sqlite path, so
which file is used depends on the working directory. Pre-existing behaviour, not introduced
here, but it is a deployment footgun worth fixing later.)*

### `create_all()` retained — and why it must be, for now

Per the standing rule, the bootstrap path was tested rather than assumed to be replaceable.
**It is not yet replaceable.** A database created by `create_all()` has no `alembic_version`
row, so Alembic believes it is at base and tries to create tables that already exist:

```
sqlite3.OperationalError: table agent_records already exists
```

`create_all()` therefore stays exactly as it is. Confirmed safe alongside the stamp: running
it against a stamped copy left 20,648 spans unchanged, tables unchanged, and
`alembic_version` preserved — it is an idempotent no-op there.

The remedy for the next phase is `stamp head` on first bootstrap, which is what was done to
the existing databases. Both behaviours are pinned by tests so the eventual replacement has
to change them consciously rather than silently.

### Three deviations from the stock template, each load-bearing

1. **`target_metadata = SQLModel.metadata`** after importing `app.models`. Without that
   import the metadata is empty and `--autogenerate` emits a migration that **drops every
   table**.
2. **URL from `app.config.settings`, not `alembic.ini`.** Migrations must target whatever
   database the application resolves, including `AGENTPULSE_DATABASE_URL`. The ini value is
   left blank rather than set, because a value there would be silently overridden.
3. **`render_as_batch=True`.** SQLite cannot `ALTER` most column properties; batch mode
   emulates it by rebuild-and-swap. Omitting it means a future column change fails at the
   moment it is needed rather than the moment it is written.

**One bug caught by verification.** The first generated migration failed with
`NameError: name 'sqlmodel' is not defined` — SQLModel renders string columns as
`sqlmodel.sql.sqltypes.AutoString()` but does not emit the import. Fixed in
`script.py.mako` so **every** future migration carries it, then the baseline was
regenerated rather than patched. This is precisely what the "verify against a test
database" step exists to catch; without it the migration would have been committed
looking correct and failed on first real use.

### Tests

`tests/test_migrations.py`, 6 tests, all passing. Suite **130 → 136**.

- upgrade reproduces the model schema, table-by-table and column-by-column
- baseline is reversible (round trip)
- upgrade is idempotent
- **`alembic check` finds no pending model changes** — this is the regression guard: change
  a model without a migration and the suite fails
- `create_all()` database cannot be upgraded (pins the current limitation)
- `stamp` then `upgrade` works and alters nothing (pins the remedy)

### Finding: the test suite writes to the production database

Noticed while reconciling row counts, and **unrelated to the migration work**: a single
`pytest tests/ -q` run grows the default database.

```
spans  20,648 -> 20,650      traces  20,557 -> 20,558
```

Tests do not redirect `AGENTPULSE_DATABASE_URL`, so they ingest into whatever database the
working directory resolves. Consequences: production data accumulates test artifacts, and
test outcomes can depend on accumulated real state.

**Not fixed here** — out of this phase's stated scope, and redirecting the test database
could change the behaviour of tests that currently depend on accumulated state, which needs
its own verification. Recorded as a standalone task.

This does not weaken the data-integrity result above: those digests bracketed the stamp
operation specifically and were byte-identical. The row growth came from separate pytest
runs.

### Phase 4A exit state (superseded by Phase 2 below)

- Tests **136/136**
- `backend/app/` and `sdk/` unmodified
- Schema under version control at `60a86ca23d8c`, reversible, verified against a clean
  database and round-tripped
- Both live databases stamped with **zero row changes**, proven by content hash
- `create_all()` retained, with its replacement blocked on a documented and tested reason
- **No jobs table, no queue, no workers, no retries, no idempotency** — all deferred to the
  durable-execution phase as instructed

---

## Phase 2 — durable evaluation execution

Goal: evaluation work survives process death. Replaces FastAPI `BackgroundTasks`
(an in-memory list inside the API process) with a durable jobs table, a
compare-and-swap claim, lease-based recovery, retry with backoff, and a worker
process separate from the API.

**Schema arrived via migration, never `create_all()`** — revision `8d86fee0d663`,
`evaluation_jobs` plus 5 indexes.

### Measured before vs after

Both numbers come from `scripts/measure_durability.py`, which starts real processes,
SIGKILLs them (`taskkill /F`, not `terminate()` — the power-cut case, where no Python
cleanup runs), and counts rows afterwards. Nothing here is inferred from reading code.

| Measure | Before | After |
| :--- | ---: | ---: |
| Evaluations lost to a SIGKILL mid-batch | **36 of 40** | **0 of 40** |
| Recovered after restart | 0 | **37** |
| Duplicate submission, HTTP statuses | `202, 500, 500` | `202, 202, 202` |
| Duplicate evaluations for a re-submitted span | 0 | 0 |
| Job rows recording outstanding work | none (no table) | 40 |

Job states at the instant of the kill: `{queued: 36, running: 1, succeeded: 3}`.
After restarting only the worker: `{succeeded: 40}`. The one job that was mid-flight
when its worker died was reclaimed by lease expiry, not by anything the dead worker
reported.

**The duplicate-submission 500 was worse than it looks.** Re-POSTing a span violated the
primary key, and because SQLAlchemy flushes at commit, the *whole batch* failed — so a
retrying SDK could destroy a batch of unrelated spans. Now a known span is simply not
re-inserted and its job is deduplicated by `job_key`.

### Design decisions

- **Claim is a compare-and-swap.** `UPDATE … WHERE status='queued'` with a row-count
  check. Two workers racing on the same candidate: exactly one UPDATE matches, the loser
  moves on. A SELECT-then-UPDATE would let both evaluate the same span.
- **Recovery is lease-based, not heartbeat-based.** A SIGKILLed worker reports nothing, so
  liveness cannot be inferred from the worker. A `running` job past `lease_expires_at` is
  assumed abandoned. The trade-off is explicit: a merely-slow worker can have its job
  reclaimed, so the lease (120s) must exceed worst-case evaluation time **and** job effects
  must be idempotent.
- **Idempotence is the load-bearing part.** A durable queue gives at-*least*-once delivery.
  A worker can write results and die before marking the job succeeded; the job then re-runs.
  `persist_results` checks for an existing evaluation and skips, so *execution* may repeat
  while *effect* is exactly-once. `test_recovery_is_idempotent_when_results_already_written`
  exercises precisely that ordering.
- **Backoff is stored, not slept.** `available_at` is pushed into the future, so the delay
  survives a worker restart and does not block the worker meanwhile.
- **`failed` and `dead_letter` are distinct.** A malformed payload is still malformed on
  attempt three, so it fails permanently without burning retries; `dead_letter` means
  something looked transient and kept failing. Collapsing them would hide which happened.
- **`attempts` is not decremented on recovery.** A job whose worker died has genuinely
  consumed an attempt; pretending otherwise lets a job that reliably kills workers retry
  forever.

### Tests: 136 → 148

`tests/test_durable_queue.py`, 12 tests. Every crash case spawns a **real process** and
kills it — an in-process "simulated crash" would let Python run cleanup a real crash never
runs, testing the simulation rather than the system.

Headline: `test_worker_killed_mid_evaluation_recovers_exactly_once` — SIGKILL a worker
holding a claimed job, assert the job survives in `running`, assert no evaluation was
written, wait for lease expiry, recover, complete with a fresh worker, and assert **exactly
one** evaluation exists. Not zero (lost), not two (duplicated).

Also covered: duplicate enqueue, deterministic job keys, retry-then-dead-letter, malformed
payload permanence, missing-field permanence, worker restart, queue survival with no worker,
unexpired leases not being stolen, backoff growth and cap, and the worker process entry point.

### Four bugs the verification caught

1. **`MissingGreenlet`.** `claim_next` returned an ORM instance; the worker read its
   attributes after the session closed, triggering a lazy refresh on a dead session. Fixed
   architecturally — the queue now returns a frozen `ClaimedJob` snapshot, so a job's
   lifetime is independent of any session's.
2. **Worker entry point was dead on arrival.** `_amain` imported `Evaluator`; the class is
   `EvaluationPipeline`. Every queue test drove `EvaluationWorker` directly with a stub, so
   nothing exercised `python -m app.worker`. Now covered by
   `test_worker_module_starts_and_loads_models`.
3. **Worker did not restore drift baselines.** The API used to do this because the API used
   to evaluate. Without it, every worker restart would cold-start every agent's baseline and
   drift would go quiet exactly after a restart. The worker now mirrors the API's
   construction, settings included.
4. **A flaky retry test.** The first version slept out the real backoff and failed on
   wall-clock margin. Rewritten to assert backoff was *scheduled* and then fast-forward it.
   A durability test that fails at random is one people learn to ignore.

### Two measurement bugs worth recording

The harness itself was wrong twice before it produced a usable number, and both failures
would have been reported as findings:

- **A stale server held the probe port.** `wait_ready()` connected to a leftover process
  from a crashed run, pointing at a deleted database, and the probe reported "0 spans
  ingested". Now `assert_port_free()` aborts instead.
- **The probe measured evaluation that never happened.** `main.py` calls `load_models()`
  *without* `sync=True`, so `/v1/health` returns 200 while models are still loading on a
  background thread. Waiting only for HTTP 200 measured "60 spans evaluated in 1.5s" —
  fast because nothing was being evaluated. Readiness now means `models_loaded()` is all
  true.

That second one is a live confirmation of the health-vs-readiness gap flagged in Phase 0
item 3: **process alive ≠ system ready**, and the current `/v1/health` does not distinguish
them. It belongs to the health/readiness phase.

### Scope

Unchanged: SDK, dashboard, evaluator algorithms, drift/disagreement/tool-claim logic.
`git status` confirms `sdk/` and `dashboard/` untouched. The evaluation orchestration moved
from `routers/ingest.py` to `services/evaluation_runner.py` verbatim so the worker can run
it without importing the router; argument construction is identical.

**`create_all()` still present and still called.** Phase 4A established it cannot yet be
removed, and this phase did not change that. It remains a safe no-op on a migrated database.

### Phase 2 exit state

- Tests **148/148**
- Durable queue measured, not asserted: **36 → 0 evaluations lost**, 37 recovered
- Duplicate submission no longer errors and does not duplicate work
- Worker runs as a separate process (`python -m app.worker`)
- Schema change delivered by migration
- Concurrency deliberately **not** tuned — next is the ONNX defect, then throughput, in
  that order, so architecture and evaluator speed do not change together

---

## ONNX backend — fixed, and made observable

Two problems, and the second mattered more than the first: the ONNX path had been
dead since a torch upgrade, and **nothing reported it**. `models_loaded()` returned
`nli_model: True` whether ONNX Runtime or the PyTorch fallback loaded, so the system ran a
slower backend than configured while presenting as healthy. For a platform sold on
observability, not observing its own degraded execution mode is a defect independent of the
lost speed.

### Diagnosis

```
ImportError: cannot import name '_attention_scale' from 'torch.onnx.symbolic_opset14'
  at optimum/exporters/onnx/model_patcher.py:346
```

| Package | Was | Now |
| :--- | :--- | :--- |
| `torch` | 2.13.0 | 2.13.0 (unchanged) |
| `transformers` | 4.53.3 | 4.53.3 (unchanged) |
| `onnxruntime` | 1.29.0 | 1.29.0 (unchanged) |
| `numpy` | 2.5.2 | 2.5.2 (unchanged) |
| `optimum` | 1.27.0 | **2.1.0** |
| `optimum-onnx` | not installed | **0.1.0** |

torch 2.13 removed `_attention_scale`; optimum 1.27 still imports it. The old pin
`optimum[onnxruntime]>=1.19,<2.0` is what held optimum at a version that could not work.
ONNX applies **only** to the NLI model — the embedding model always loads via
SentenceTransformer, which is why that half never failed.

### Verified in isolation before touching the project venv

A `--target` install was tried first and **rejected as invalid**: it produced a mixed state
where `optimum.utils` resolved to 2.1.0 while `optimum.exporters` resolved to 1.27.0,
testing neither version. A clean `uv venv` with the exact candidate set was used instead.

| Measure | PyTorch | ONNX |
| :--- | ---: | ---: |
| Worst absolute probability difference across 5 NLI pairs | — | **1.2e-08** |
| Mean inference latency | 47.5 ms | **24.2 ms (1.97×)** |
| First model load | 1.3 s | 199.5 s |
| Subsequent load (export cached) | 1.3 s | 3.8 s |

**Correctness is the load-bearing number, not speed.** A faster backend that scored
differently would silently move every threshold this project has calibrated. At 1.2e-08 the
two backends are identical to floating-point noise.

**Operational note:** the first ONNX load performs the export and takes ~200 s, writing
`model.onnx` into the model cache. Subsequent loads are 3.8 s. A fresh deployment with no
warm cache pays that once — worth pre-warming rather than discovering during a deploy.

Only after that did the project venv change. `pip install --dry-run` confirmed **every other
dependency already satisfied** — no torch, transformers or numpy churn, which is the failure
class `SESSION_HANDOFF.md` §3 documents.

### Observability — the part that must hold even if ONNX breaks again

New `grounding.backend_info()`:

```json
{"nli_backend": "onnx", "nli_backend_requested": "onnx", "degraded": false,
 "fallback_reason": null, "embedding_backend": "pytorch"}
```

Surfaced on `/v1/health` as `inference_backend` plus a top-level `degraded` flag, and logged
at worker startup (`Inference backend: nli=onnx embedding=pytorch`, or a WARNING naming the
fallback reason when degraded).

Three deliberate choices:

- **`models_loaded()` stays bool-only.** `app/worker.py` and
  `scripts/measure_durability.py` both gate readiness on `all(models_loaded().values())`;
  adding a truthy backend string would make those checks silently wrong. Backend identity
  lives in a separate function, and a test pins that contract.
- **`degraded` means "not running what was asked for"**, not "not running ONNX". A
  deliberately PyTorch-configured deployment is not degraded and must not alarm forever.
- **Degraded is not fatal.** The fallback is correct behaviour and results are identical;
  the worker logs loudly and carries on rather than refusing to start.

### Tests: 148 → 154

`tests/test_inference_backend.py`, 6 tests: ONNX loads and is reported; the fallback is
visible with a recorded reason; deliberate PyTorch is not degraded; `models_loaded()` stays
bool-only; both backends produce identical scores; `/v1/health` exposes the fields.

**A test-design bug worth recording.** The first version loaded models in-process and passed
alone but failed inside the full suite. Cause: `load_models()` cannot be called repeatedly in
one process — the second load leaves torch tensors on the `meta` device
(`Cannot copy out of meta tensor`), after which inference raises `Tensor on device cpu is
not on the expected device meta`. Production loads once per process (API lifespan, worker
startup), so every probe now runs in its **own subprocess**. In-process loading was measuring
an artefact of the harness rather than the system.

### Acceptance criteria

| Criterion | Status |
| :--- | :--- |
| ONNX path works | ✅ `nli_backend: "onnx"`, verified in the production code path |
| Or system reports ONNX unavailable + fallback | ✅ also implemented, and tested by forcing the failure |
| No silent degradation | ✅ `/v1/health`, `backend_info()`, worker startup log |
| Inference correctness unchanged | ✅ worst difference 1.2e-08; guarded by a test |
| Full tests pass | ✅ **154/154** |

Dashboard and SDK untouched. Worker counts and throughput deliberately **not** benchmarked —
that is the next phase, and it can now measure the real backend rather than an accidentally
degraded one.

---
