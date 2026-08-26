# External corpus: Exgentic agent-llm-traces-v2

**Source:** [Exgentic/agent-llm-traces-v2](https://huggingface.co/datasets/Exgentic/agent-llm-traces-v2)
**Revision:** `4b8ad4ab198438e5a170f9171c19c6a2cf7c1814`
**Retrieved:** 2026-08-26T20:03:05Z
**Class:** `EXTERNAL_REAL_DATA` — independently collected, not authored for AgentPulse.

This directory holds **derived** data only. The raw corpus is not mirrored
(~231 MB, dominated by the `spans` column); `raw/manifest.json` lists every
source session consumed, and `experiments/external_exgentic_ingest.py`
reproduces the extraction against the pinned revision above.

## Scope

Extracted for the **drift diagnosis only** — paired same-task/different-model
agent outputs. Not a general adapter.

This corpus **cannot** support every AgentPulse evaluator:

| Evaluator | Usable | Why |
| :--- | :--- | :--- |
| Drift | Yes | Task prompts are byte-identical across models, giving a controlled model-shift axis over real text |
| Ingestion / temporal | Yes | Real OpenTelemetry spans, timestamps, token usage |
| Tool-claim | Partial | Tool calls and responses exist, but the corpus carries no correctness labels |
| Grounding | Exploratory only | No grounding labels. Using AgentPulse's own NLI as the label would be circular |
| Inter-agent disagreement | **No** | One model and one agent identity per session; no comparison target exists |

## No ground truth

This corpus provides **no drift labels**. Model identity is a controlled
*variable*, not a label meaning "drifted". Any conclusion drawn here is about
measured embedding displacement between real outputs, not about a labelled
drift benchmark.

## Files

- `source_metadata.json` — provenance, transformation steps, unmapped fields, verification counts
- `raw/manifest.json` — every source session consumed (session_id, run_id, config_path, model)
- `derived/drift_pairs.json` — paired task groups with per-session agent outputs
