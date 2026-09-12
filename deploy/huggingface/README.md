---
title: AgentPulse
emoji: 📡
colorFrom: indigo
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# AgentPulse

Continuous grounding and drift observability for multi-agent LLM systems.
Every span is evaluated on local CPU rather than sampled, with no per-token cost.

Source: https://github.com/Soum-Code/agentpulse

## What this Space runs

One container holding three things that normally run apart: the ingest API, the
evaluation worker, and the dashboard. Spaces expose a single port, so the API
serves the built SPA and the worker runs beside it.

Two models load on first boot, both CPU-only through ONNX Runtime:
`all-MiniLM-L6-v2` for the Stage 1 cosine gate and `nli-deberta-v3-small` for
the Stage 2 cross-encoder. Expect a minute or two before the evaluator reports
ready.

## Try it

Open **Telemetry Lab** and run a scenario. Results appear once the worker has
scored the spans, usually within thirty seconds.

| Scenario | What it demonstrates |
| --- | --- |
| `hallucination` | Grounding NLI catches a contradicted claim; two `GROUNDING_FAILURE` alerts |
| `tool_mismatch` | An agent narrates ten results where its tool returned three; `TOOL_CLAIM_MISMATCH` |
| `clean` | A grounded run, for contrast |
| `drift` | Emits the contradiction payload; sustained drift needs 32 spans from one agent and cannot be shown in a single run |

The **Drift** tab shows `research_summariser`, seeded with twenty spans on one
topic and fourteen on another. Its sustained window distance crosses the 0.300
threshold while the per-span spike sits below it, which is why alerting reads
the window rather than the spike.

## Two things to know

**The filesystem is ephemeral.** Every restart begins with an empty database.
A seed script replays the scenarios above through the real API on boot, so
everything on screen was produced by the evaluator rather than written in.

**Write endpoints are open.** The dashboard is a static bundle, so any API key
it carried would be readable in the JavaScript. Enforcing one would be theatre,
so this Space runs without it. Do not point a private pipeline at it.

## Honest limits

- Grounding is benchmarked at **F1 0.963** on a thirty-case held-out split.
  Thirty cases shows the pipeline works at a chosen operating point; it does not
  show generalisation.
- The cascade is **no more accurate than DeBERTa alone** on that set, and 28 ms
  slower. It buys throughput on traffic that clears the Stage 1 gate, not accuracy.
- Disagreement and tool-claim are **experimental**. Tool-claim needs the count
  narrated in prose next to the noun; harnesses emitting structured `tool_call`
  fields are not covered.
- The span schema is **not OpenTelemetry**.

`STARTUP_GUIDE.md` in the repository covers running it locally, and
`presentation/AgentPulse_Deep_Dive.pdf` documents the architecture and the
measurements behind every figure above.
