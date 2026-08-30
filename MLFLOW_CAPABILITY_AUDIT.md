# MLflow Capability Audit

**Date:** 2026-08-27
**Package:** `mlflow` **3.15.2**, installed in an isolated venv
**Method:** installed-package enumeration **plus runnable probes** — not documentation
**Script:** `experiments/mlflow_capability_audit.py`
**Raw output:** `experiments/results/mlflow_capability_audit.json`

Companion to `PHOENIX_CAPABILITY_AUDIT.md`. That audit refuted this project's
tool-verification claim for Arize, which made the identical unaudited claim for MLflow a
standing risk. MLflow is open source and installable, so it was checkable all along.

---

## 1. Summary of verdicts

| Capability | Verdict |
| :--- | :--- |
| Tool-call / tool-response evaluation | **Claim REFUTED** — exists as a named feature |
| Inter-agent disagreement | No named feature, but **composable** — wording matters, see §4 |
| Drift / stability / baseline monitoring | Claim holds, and holds most strongly |
| Trace-level evaluators | Exists |
| Deterministic (non-LLM) evaluators | Exists **and confirmed runnable** |
| Composable custom evaluators | Exists **and confirmed runnable** |

## 2. What was found: 24 first-party scorers

`mlflow.genai.scorers` ships 24 built-in scorers. Grouped by what matters here:

**Tool-related (3 first-party):** `ToolCallCorrectness`, `ToolCallEfficiency`,
`ConversationalToolCallEfficiency`

**Deterministic — no LLM (3):** `RegexMatch`, `PIIDetection`, `ResponseLength`

**Judge-backed (21):** `Correctness`, `Guidelines`, `RetrievalGroundedness`,
`RetrievalRelevance`, `RetrievalSufficiency`, `Safety`, `Equivalence`, `Fluency`,
`Summarization`, `RelevanceToQuery`, `Completeness`, `KnowledgeRetention`,
`UserFrustration`, and the `Conversational*` family.

**Composable primitives:** `@scorer` decorator, `make_judge`, `make_scorer_ensemble`, plus
aggregators (`majority_vote`, `agg_all`, `agg_any`, `mean`, `maximum`, `minimum`).

**Optional-extra scorers** under `mlflow.genai.scorers.trulens` (23 more): `ToolCalling`,
`ToolSelection`, `LogicalConsistency`, `PlanAdherence`, `ExecutionEfficiency`,
`Groundedness`, and others. **These are present in the namespace but not runnable** — see §5.

## 3. Tool-call verification — claim refuted, for the second vendor

`ToolCallCorrectness.__call__(*, trace, expectations=None)` — *"evaluates whether the tools
called and the arguments they are called with are reasonable given the user request"*.

`ToolCallEfficiency.__call__(*, trace)` — *"evaluates the agent's trajectory for redundancy
in tool usage"*.

Both are **trace-level** and judge-backed. And the optional TruLens `ToolCalling` is
documented as evaluating whether the agent *"correctly invokes tools with appropriate
parameters **and handles tool responses properly**"* — again the reformulation
`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` §8 identified as AgentPulse's way forward.

**With Arize already refuted, tool-call verification is now measured as present in two of
the three platforms.** It is finished as a differentiator.

### 3.1 A real difference that survives, stated narrowly

MLflow's tool scorers ask *"were the right tools called with the right arguments, and was
the trajectory efficient?"* AgentPulse's validator asks *"do the agent's textual claims
match what the tools actually did?"* Those are related but genuinely different questions —
MLflow's is about **action quality**, AgentPulse's is about **honesty of reporting**.

That distinction is real. It is also currently worth little, because AgentPulse's
implementation of its question measures **F1 0.000** on real traces
(`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` §10).

## 4. Inter-agent disagreement — no named feature, but the wording must be precise

Namespace scan across 955 modules: **0 hits** for `disagree|contradict|inter.?agent`.

The closest match is `mlflow.genai.scorers.trulens.LogicalConsistency`:

> *"Evaluates logical consistency and reasoning quality of agent traces. Analyzes how
> coherent and logically sound the agent's decision-making process is throughout the
> execution trace."*

**This is not the same question.** It evaluates **one** agent's reasoning coherence across
its own trace. AgentPulse's engine compares **distinct agent identities within a trace**
for mutual contradiction. Adjacent, not equivalent. It is also not runnable by default (§5).

**But MLflow can clearly be made to do this.** The `@scorer` decorator was probed and
**runs**, taking arbitrary Python over inputs, outputs and traces. Anyone could implement
cross-agent contradiction checking inside it.

So the defensible claim is **"no named feature"**, not "cannot do this". Those are
different statements and the positioning must use the first.

## 5. Present ≠ runnable — the distinction this audit exists to draw

Probed by execution, with all API-key environment variables removed:

| Target | Kind | Result |
| :--- | :--- | :--- |
| `RegexMatch` | deterministic, first-party | **RUNS** — returned `CategoricalRating.YES`, `source_type='CODE'` |
| `PIIDetection` | deterministic, first-party | **RUNS** — detected `email, phone`, `source_type='CODE'` |
| `@scorer` custom | composable primitive | **RUNS** — no LLM involved |
| `ToolCallCorrectness` | judge-backed, first-party | Instantiates; call needs a real trace |
| `trulens.LogicalConsistency` | optional extra | **FAILS at construction** — *"TruLens scorers require the 'trulens' package"* |

The last row is the point. `LogicalConsistency`, `ToolCalling`, `ToolSelection` and
`PlanAdherence` all appear in the namespace and would show up in any import-based audit,
but none of them runs on a base `mlflow` install. A pure enumeration would have counted
capability MLflow does not ship working out of the box.

The distinction cuts the other way too: the first-party scorers failed only on **missing
input data**, not missing dependencies — they are installed and available.

## 6. Deterministic evaluation is not unique to AgentPulse

After the Phoenix audit, the surviving tool-claim differentiator was narrowed to *cost and
determinism* rather than existence — every Phoenix evaluator requires an LLM.

**That narrowing does not survive contact with MLflow.** MLflow ships deterministic
scorers, confirmed running with no LLM and no API key, and marks them `source_type='CODE'`.

The precise surviving statement is narrower still: **MLflow's deterministic scorers do not
include a tool-claim check** — its tool scorers are judge-backed. So "a deterministic
tool-claim check" remains unusual. "Deterministic evaluation" as a category does not.

## 7. Drift, stability, baseline — the claim that holds best

Namespace scan results:

| Pattern | Hits |
| :--- | ---: |
| `drift` | **0** |
| `stability` \| `centroid` | **0** |
| `baseline` | 1 — `mlflow.demo.generators.evaluation.DEMO_DATASET_BASELINE_SESSION_NAME`, a demo constant, not a capability |

No named feature and, unlike disagreement, **no adjacent primitive either**. It could only
be built as arbitrary custom code inside a `@scorer`.

Of the three original claims, this is the one the evidence supports most strongly — for
both MLflow and Phoenix.

## 8. Limitations

- **Base `mlflow` only.** Optional extras (`trulens`, `dspy`) were not installed; that is
  precisely why §5 could distinguish present from runnable, but it means the TruLens
  scorers' actual behaviour is unmeasured.
- **MLflow on Databricks is a separate managed product** and was not audited. Its
  capabilities may exceed the open-source package.
- **My trace-level detection is over-broad.** The script flags a scorer as trace-level if
  its `__call__` *accepts* a `trace` argument, which is true of all 24. Only
  `ToolCallCorrectness` and `ToolCallEfficiency` *require* one and are genuinely
  trace-analysing; the rest take inputs/outputs with trace optional. The raw signatures are
  in the JSON.
- **Catalog and runnability, not quality.** Nothing here measures how well any scorer
  performs, and nothing compares accuracy against AgentPulse.
- **Datadog remains unaudited and unauditable this way** — it is not installable. Its
  column in `COMPETITIVE_POSITIONING.md` §3 is still documentation-based.
- Version-pinned: `mlflow` 3.15.2, audited 2026-08-27. Catalogs change.

## 9. What this means for positioning

Combining both audits:

| Claim | Arize (Phoenix) | MLflow | Datadog |
| :--- | :--- | :--- | :--- |
| Tool-call verification absent | refuted | **refuted** | unaudited |
| Inter-agent disagreement absent | holds | holds *as named feature*; composable | unaudited |
| Drift absent | holds | **holds strongly** — no primitives | unaudited |

**Tool-call verification is finished as a differentiator** — measured present in both
auditable platforms, while AgentPulse's own implementation scores F1 0.000 on real traces.

**Drift is the strongest remaining claim**, and it is also the one capability AgentPulse
has recently rebuilt and validated (`DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md` §11: 1.5% false
alarms, 92% detection on a held-out split).

**Inter-agent disagreement holds only in the narrow "no named feature" sense.** It must be
worded that way, and it carries its own outstanding caveat: its F1 0.960 rests on 22
self-authored cases and has never been externally validated
(`COMPETITIVE_POSITIONING.md` §9).

Positioning edits follow from this audit and are made in the same change.
