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
