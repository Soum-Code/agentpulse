# Arize Phoenix Capability Audit

**Date:** 2026-08-27
**Package:** `arize-phoenix-evals` **3.5.1**, installed in an isolated venv
**Method:** programmatic enumeration of the installed package — not documentation reading
**Script:** `experiments/phoenix_capability_audit.py`
**Raw output:** `experiments/results/phoenix_capability_audit.json`

**Headline: one of this project's competitive claims is wrong.** Arize Phoenix ships three
dedicated tool evaluators. `COMPETITIVE_POSITIONING.md` stated it ships none.

---

## 1. Why this was run

`COMPETITIVE_POSITIONING.md` §9 named its own weakest link:

> **The differentiator claim is an absence-of-evidence claim.** "None of them ships
> first-class tool-claim validation" comes from reading docs. Any of the three could add
> it, or already support it through a mechanism not surfaced in their documentation.

That is exactly what happened. Phoenix is open source and installable, so the claim was
checkable all along — this audit replaces documentation reading with measurement.

**Dependency safety:** installed into a throwaway venv via `uv`, never the project
environment. This project has a documented history of dependency conflicts
(`SESSION_HANDOFF.md` §3, the Kaggle numpy incident). Project pins verified unchanged
afterwards: numpy 2.5.2, torch 2.13.0+cpu, transformers 4.53.3.

## 2. The full evaluator catalog

Twelve built-in evaluators, enumerated from the installed package:

| Evaluator | Purpose (from its own docstring) |
| :--- | :--- |
| `HallucinationEvaluator` | Detecting hallucinations in an assistant's latest response |
| `FaithfulnessEvaluator` | Detecting faithfulness in grounded LLM responses |
| `CorrectnessEvaluator` | Factual accuracy and completeness of model outputs |
| `DocumentRelevanceEvaluator` | Document relevance to a given question |
| `RetrievalRelevanceEvaluator` | Whether retrieved information is relevant to the request |
| **`ToolSelectionEvaluator`** | **Whether the correct tool was selected for a given context** |
| **`ToolInvocationEvaluator`** | **Whether a tool was invoked correctly — arguments, formatting, safe content** |
| **`ToolResponseHandlingEvaluator`** | **Whether the agent properly handled a tool's response — error handling, data extraction, transformation, safe disclosure** |
| `ConcisenessEvaluator` | Whether outputs are concise |
| `RefusalEvaluator` | When an LLM refuses or declines to answer |
| `ToxicityEvaluator` | Hateful, demeaning, abusive or threatening text |
| `UserFrictionEvaluator` | When a user expresses friction with the assistant |

Non-LLM helpers also present: `MatchesRegex`, `PrecisionRecallFScore`, `exact_match`.

## 3. Results against the three differentiator claims

| Claim in `COMPETITIVE_POSITIONING.md` | Verdict | Evidence |
| :--- | :--- | :--- |
| Tool-call verification — "not a dedicated feature" | **WRONG** | Three dedicated evaluators |
| Inter-agent disagreement — "not a dedicated feature" | Holds | No evaluator; package-wide search for `disagree\|contradict\|consisten\|multi.?agent` returned nothing |
| Drift — "not a dedicated feature" | Holds *for this package* | No evaluator; search for `drift\|centroid\|baseline` returned nothing. Scope limit in §5 |

### 3.1 The tool claim was not merely wrong — it was wrong about the exact thing proposed as the fix

`TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` §8 concluded that AgentPulse's validator asks the
wrong question, and proposed the reformulation:

> stop asking *"which tools did the agent say it used"* … and ask *"do the agent's
> statements about tool **results** match those results"* — which is the part that
> genuinely needs checking and where fabrication actually causes harm.

`ToolResponseHandlingEvaluator` is documented as evaluating *"what happens AFTER the tool
returns"* — error handling, data extraction, transformation. That is the same
reformulation, already shipped, as a named feature.

So the honest position is not "AgentPulse has a capability Arize lacks". It is "AgentPulse
has an inert implementation of a capability Arize ships working".

## 4. What actually survives

**Every one of the twelve evaluators requires an LLM.** Verified by inspecting each
constructor signature — all twelve take an `llm` argument, and the docstrings state
*"Requires an LLM that supports tool calling or structured output"* and return
*"an explanation from the LLM judge"*.

AgentPulse's tool-claim validator is deterministic and regex-based, measured at **0.07 ms**
per call with no model invocation (`TOOL_CLAIM_VALIDATOR_REPORT.md`).

So the surviving differentiator on tool-claims is **cost and determinism, not existence**.
That is a much narrower claim, and it comes with an immediate caveat: a cheap check that
extracts nothing on real traces (F1 **0.000**, `TOOL_CLAIM_EXTERNAL_TEST_REPORT.md` §10)
is not currently cheaper *at the same job* — it is cheaper at not doing the job.

The two remaining claims — inter-agent disagreement and drift — are unaffected by this
audit and still stand against `phoenix.evals`.

## 5. Limitations

- **`arize-phoenix-evals` only.** The full `arize-phoenix` server package and the
  commercial Arize AX product were not installed. AX advertises Signal, Alyx and Patterns;
  drift-like capability may exist there. The drift and disagreement verdicts above apply to
  the open-source evals package, not to Arize's whole product surface.
- **Catalog audit, not a quality measurement.** This establishes that these evaluators
  *exist* and what they claim to do. It says nothing about how well they work, and nothing
  here compares their accuracy to AgentPulse's.
- **MLflow and Datadog were not audited this way.** Their equivalent claims in
  `COMPETITIVE_POSITIONING.md` §3 remain documentation-based and carry the same risk this
  audit just realised for Arize. MLflow is open source and installable; Datadog is not.
- Version-pinned: `arize-phoenix-evals` 3.5.1, audited 2026-08-27. Catalogs change.

## 6. Next step

**Immediate, and done alongside this report:** correct `COMPETITIVE_POSITIONING.md` §3 and
§5.1. Leaving a claim standing that has been measured false is the specific failure this
project exists to avoid.

**Worth doing, not done here:** audit MLflow the same way. It is open source, its equivalent
claim rests on the same doc-reading, and the cost of being wrong there is identical.

**The comparison this audit does not settle:** whether Phoenix's tool evaluators actually
fire on real agent traces where AgentPulse's extracts on 0.2%. That is an apples-to-apples
firing-rate test needing no labels, but it requires an LLM backend for Phoenix. It is the
natural follow-on and is deliberately left as one.
