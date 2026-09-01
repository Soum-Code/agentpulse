"""Builds the AgentPulse deep-dive PDF.

Every figure in this document was read out of the repository or measured
against a running instance; nothing is illustrative unless it says so.

    python presentation/build_deep_dive.py            # writes the default path
    OUT=other.pdf python presentation/build_deep_dive.py
"""

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)

OUT = os.getenv("OUT", os.path.join(os.path.dirname(__file__), "AgentPulse_Deep_Dive.pdf"))

INK = colors.HexColor("#14171f")
MUTED = colors.HexColor("#5b6472")
RULE = colors.HexColor("#d8dce3")
ACCENT = colors.HexColor("#1f4fd8")
PANEL = colors.HexColor("#f4f6f9")
WARN = colors.HexColor("#8a4b00")

_ss = getSampleStyleSheet()


def _style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, parent=_ss["Normal"], **base)


S = {
    "title": _style("t", fontName="Helvetica-Bold", fontSize=26, leading=30),
    "subtitle": _style("st", fontSize=12, leading=17, textColor=MUTED),
    "h1": _style("h1", fontName="Helvetica-Bold", fontSize=16, leading=20, spaceBefore=2, spaceAfter=7),
    "h2": _style("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15, spaceBefore=10, spaceAfter=4),
    "body": _style("b", alignment=TA_JUSTIFY, spaceAfter=6),
    "bullet": _style("bu", alignment=TA_JUSTIFY, leftIndent=11, bulletIndent=2, spaceAfter=3),
    "cell": _style("c", fontSize=8.4, leading=11.5),
    "cellb": _style("cb", fontName="Helvetica-Bold", fontSize=8.4, leading=11.5),
    "cellm": _style("cm", fontName="Courier", fontSize=8, leading=11.5),
    "caption": _style("cap", fontSize=8.2, leading=11, textColor=MUTED, spaceAfter=8),
    "note": _style("n", fontSize=9, leading=13, textColor=WARN, leftIndent=8, spaceAfter=6),
    "footer": _style("f", fontSize=7.5, textColor=MUTED, alignment=TA_CENTER),
}

CODE = ParagraphStyle(
    "code", parent=_ss["Normal"], fontName="Courier", fontSize=7.9, leading=10.6,
    textColor=INK, backColor=PANEL, borderPadding=7, leftIndent=1, spaceAfter=8,
)


def P(t, s="body"):
    return Paragraph(t, S[s])


def B(t):
    return Paragraph(t, S["bullet"], bulletText="•")


def H1(t):
    # keepWithNext stops a heading stranding at the foot of a page
    st = ParagraphStyle("h1k", parent=S["h1"], keepWithNext=1)
    return Paragraph(t, st)


def H2(t):
    st = ParagraphStyle("h2k", parent=S["h2"], keepWithNext=1)
    return Paragraph(t, st)


def code(t):
    return Preformatted(t.strip("\n"), CODE)


def caption(t):
    return Paragraph(t, S["caption"])


def note(t):
    return Paragraph(t, S["note"])


def table(rows, widths, header=True, mono_cols=()):
    data = []
    for r_i, row in enumerate(rows):
        out = []
        for c_i, cell in enumerate(row):
            if r_i == 0 and header:
                st = "cellb"
            elif c_i in mono_cols:
                st = "cellm"
            else:
                st = "cell"
            out.append(Paragraph(str(cell), S[st]))
        data.append(out)

    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
    ]
    if header:
        cmds += [
            ("BACKGROUND", (0, 0), (-1, 0), PANEL),
            ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
        ]
    t.setStyle(TableStyle(cmds))
    return t


# --------------------------------------------------------------------------
# Document
# --------------------------------------------------------------------------

story = []
A = story.append

# ---- Cover -----------------------------------------------------------------
A(Spacer(1, 44 * mm))
A(P("AgentPulse", "title"))
A(Spacer(1, 3 * mm))
A(P(
    "A self-hostable observability and evaluation system for multi-agent LLM "
    "pipelines. Technical deep dive: architecture, execution flow, evaluation "
    "method, measured results, and known limits.", "subtitle"))
A(Spacer(1, 12 * mm))
A(table([
    ["Component", "Stack", "Size"],
    ["Backend API and worker", "Python, FastAPI, SQLModel, SQLite (WAL), Alembic", "6,625 lines"],
    ["Evaluation models", "MiniLM-L6-v2 embeddings, DeBERTa-v3-small NLI, ONNX Runtime", "2 local models"],
    ["Client SDK", "Python, aiohttp, batched async transport", "1,528 lines"],
    ["Dashboard", "React 19, TypeScript, Vite 6, Tailwind 4, three.js", "8,854 lines"],
    ["Test suite", "pytest, pytest-asyncio", "3,826 lines / 209 tests"],
], [38 * mm, 78 * mm, 34 * mm], mono_cols=(2,)))
A(Spacer(1, 8 * mm))
A(caption(
    "Line counts exclude generated files and dependencies. Figures throughout "
    "this document are read from the repository or measured on a running "
    "instance; where a number is an example rather than a measurement, it is "
    "labelled as such."))
A(PageBreak())

# ---- 1. Problem ------------------------------------------------------------
A(H1("1. The problem"))
A(P(
    "Conventional application monitoring answers whether a service responded. "
    "For an LLM agent that is the wrong question: the request can return HTTP "
    "200, in fluent prose, on time, and still be wrong. The failure is in the "
    "content, not the transport."))
A(P("Multi-agent pipelines make this sharper in three ways."))
A(B(
    "<b>Errors compound silently.</b> A retriever returns a weak document, the "
    "synthesiser treats it as established, the writer cites it as settled. Each "
    "step is individually plausible; only the chain is wrong."))
A(B(
    "<b>The failure has no stack trace.</b> Nothing raises. There is no line "
    "number to attach a breakpoint to, so post-hoc debugging has nothing to "
    "anchor on."))
A(B(
    "<b>Judging with another LLM is expensive.</b> The common answer, "
    "LLM-as-a-judge, bills per token and adds seconds per span. At full "
    "coverage on a busy pipeline that cost is prohibitive, so teams sample - "
    "and sampling is exactly how a rare hallucination goes unseen."))
A(Spacer(1, 2 * mm))
A(P(
    "AgentPulse takes the opposite trade: run small discriminative models "
    "locally on CPU, cheaply enough to evaluate every span rather than a "
    "sample, and accept narrower coverage than a general judge in exchange."))

A(Spacer(1, 5 * mm)); A(H1("2. What the system does"))
A(P(
    "An instrumented agent pipeline emits <i>spans</i>. A span is one unit of "
    "agent work: a planning step, a tool call, a synthesis pass. Each carries "
    "its inputs, outputs, timing, and, where relevant, the tool it called and "
    "what that tool returned."))
A(P(
    "AgentPulse accepts those spans, queues them, and evaluates each one "
    "asynchronously against four signals. Results are written back as scores "
    "and, past configured thresholds, as alerts. A dashboard reads the same "
    "REST API a user would."))
A(Spacer(1, 2 * mm))
A(table([
    ["Signal", "Question it answers", "Method", "Maturity"],
    ["Grounding", "Is the output supported by the input evidence?",
     "MiniLM cosine gate escalating to DeBERTa-v3 NLI", "Beta"],
    ["Drift / ASI", "Has this agent's behaviour shifted from its own baseline?",
     "Embedding centroid distance, EMA and windowed", "Beta"],
    ["Disagreement", "Do two agents in one trace contradict each other?",
     "Pairwise NLI between agent outputs", "Experimental"],
    ["Tool-claim", "Does the narrated claim match what the tool returned?",
     "Regex claim extraction vs recorded tool result", "Experimental"],
], [24 * mm, 47 * mm, 55 * mm, 20 * mm]))
A(caption(
    "Maturity tiers are the project's own. Section 12 states what each tier "
    "means in practice, including a defect that currently disables the "
    "tool-claim signal end to end."))

# ---- 3. Architecture -------------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("3. Architecture"))
A(P(
    "Four processes, deliberately separated so that a slow or crashed evaluator "
    "cannot stall ingestion."))
A(code("""
  Your agent pipeline
  (LangGraph / CrewAI / LangChain / plain Python)
          |
          |  agentpulse SDK: buffers spans, flushes in batches,
          |  fails open if the collector is unreachable
          v
  +---------------------------+
  |  FastAPI ingest API       |   POST /v1/ingest -> 202 Accepted
  |  loads no ML models       |   validate, dedupe, persist, enqueue
  +---------------------------+
          |                              ^
          | evaluation_jobs (SQLite)     | REST + WebSocket
          v                              |
  +---------------------------+          |
  |  Evaluation worker        |     +---------------------+
  |  MiniLM + DeBERTa (ONNX)  |     |  React dashboard    |
  |  leases jobs, retries,    |     |  polls every 10 s   |
  |  writes scores + alerts   |     +---------------------+
  +---------------------------+
          |
          v
  SQLite (WAL): traces, spans, evaluations, drift_records,
  baselines, alerts, agent_records, dataset_cases,
  evaluation_jobs, worker_heartbeats, retention_runs
"""))
A(H2("Why the API holds no models"))
A(P(
    "Loading the evaluator into the API process cost roughly 1.24 GB resident "
    "per process and about twenty seconds of startup, for a capability no API "
    "route used - every route reads stored evaluation columns rather than "
    "running inference. The models now live only in the worker. The behaviour "
    "remains one environment variable away "
    "(<font face='Courier'>AGENTPULSE_API_LOAD_MODELS=true</font>) rather than "
    "being deleted outright."))
A(H2("Why evaluation is asynchronous"))
A(P(
    "Ingestion returns <font face='Courier'>202 Accepted</font> as soon as the "
    "spans are durably written and jobs are enqueued. The caller is never "
    "blocked on a 200-millisecond NLI pass. The cost of that choice is that "
    "scores appear a short time after the span, which the dashboard has to "
    "represent honestly rather than hiding."))

A(Spacer(1, 5 * mm)); A(H1("4. End-to-end flow"))
A(table([
    ["#", "Stage", "What happens", "Where"],
    ["1", "Instrument", "A decorator or adapter wraps an agent function and captures inputs, outputs, timing, tool name and tool result.", "sdk/decorators.py"],
    ["2", "Redact", "Privacy filter applies regex redaction and key exclusion before anything leaves the process.", "sdk/privacy.py"],
    ["3", "Buffer", "Spans go into an in-memory buffer, flushed on batch size or interval; failures are swallowed so telemetry cannot break the pipeline.", "sdk/transport.py"],
    ["4", "Ingest", "POST /v1/ingest validates, upserts the trace, writes spans, and enqueues one evaluation job per span.", "routers/ingest.py"],
    ["5", "Lease", "A worker atomically claims a queued job with a 120-second lease and an attempt counter.", "services/job_queue.py"],
    ["6", "Evaluate", "Grounding, tool-claim, disagreement and drift run; a weighted risk score is aggregated.", "services/evaluator.py"],
    ["7", "Persist", "Evaluation and drift rows are written idempotently, keyed on span id.", "services/evaluation_runner.py"],
    ["8", "Alert", "Threshold rules fire, subject to cooldown and hourly caps.", "services/alerting.py"],
    ["9", "Serve", "REST endpoints and a WebSocket expose the results.", "routers/__init__.py"],
], [7 * mm, 22 * mm, 79 * mm, 38 * mm], mono_cols=(3,)))
A(Spacer(1, 4 * mm))

# ---- 5. SDK ----------------------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("5. The SDK"))
A(P(
    "The client is deliberately small. Its guiding rule is that observability "
    "must never take down the thing it observes."))
A(code("""
from agentpulse import AgentPulse

pulse = AgentPulse(
    endpoint="http://localhost:8000",
    api_key="your-api-key",
    service_name="production-swarms",
)

@pulse.monitor(agent_id="sql_synthesizer", role="synthesizer")
def run_agent_pipeline(user_query: str):
    schema = fetch_warehouse_schema()
    sql = generate_sql(user_query, schema)
    return validate_and_execute(sql)
"""))
A(H2("Properties"))
A(B("<b>Fail-open.</b> <font face='Courier'>fail_open=True</font> by default: a collector that is down, slow or misconfigured is swallowed, not raised into the agent."))
A(B("<b>Batched.</b> Spans buffer and flush by size or interval over aiohttp, so per-span HTTP overhead is amortised."))
A(B("<b>Opt-in payloads.</b> <font face='Courier'>capture_inputs</font> and <font face='Courier'>capture_outputs</font> default to <font face='Courier'>False</font>. Without them the span carries structure and hashes but no prompt text."))
A(B("<b>Redaction before transport.</b> The privacy filter runs in the agent's own process, so redacted values never cross the wire."))
A(B("<b>Sampling.</b> <font face='Courier'>sampling_rate</font> exists for pipelines that do not want full coverage, though full coverage is the design intent."))
A(Spacer(1, 2 * mm))
A(P("Framework adapters: <font face='Courier'>instrument_graph()</font> for LangGraph, "
    "<font face='Courier'>CrewAIAdapter</font> for CrewAI, "
    "<font face='Courier'>LangChainAdapter</font> for LangChain. These are explicit "
    "wrappers, not automatic monkey-patching, and there is no JavaScript SDK."))

A(Spacer(1, 5 * mm)); A(H1("6. Ingest and the durable queue"))
A(P(
    "Ingestion and evaluation are separated by a queue table in the same "
    "database, which is what makes exactly-once recovery possible without a "
    "broker."))
A(table([
    ["State", "Meaning"],
    ["queued", "Written, waiting for a worker."],
    ["running", "Leased by a worker; the lease carries an expiry."],
    ["succeeded", "Evaluated and persisted."],
    ["failed", "Attempt failed; returns to queued while attempts remain."],
    ["dead_letter", "Exhausted max attempts (3); will not be retried."],
], [26 * mm, 120 * mm], mono_cols=(0,)))
A(Spacer(1, 3 * mm))
A(P(
    "A worker claims a job atomically and holds a 120-second lease. If the "
    "process dies mid-evaluation the lease expires and the job is reclaimed. "
    "Persistence is keyed on span id and is a no-op if an evaluation already "
    "exists, so a job replayed after a crash cannot double-write. This path is "
    "covered by a crash-recovery test that kills a worker mid-evaluation and "
    "asserts the result is written exactly once."))
A(note(
    "Dead-letter jobs are terminal by design. On the development instance used "
    "for this document, 41 of 121 jobs sit in dead_letter from an earlier "
    "misconfigured run - a real operational signal the dashboard surfaces "
    "rather than hides."))

# ---- 7. Cascade ------------------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("7. The evaluation cascade"))
A(P(
    "Grounding asks whether an agent's output is supported by the evidence it "
    "was given. It runs in two stages so that the expensive model is only used "
    "where the cheap one is uncertain."))
A(code("""
  span (input_summary, output_summary)
        |
        v
  Stage 1 - MiniLM-L6-v2 embeddings, cosine similarity   ~27.8 ms
        |
        +--  cosine > 0.85  -->  accept as grounded, stop
        |
        v  otherwise escalate
  Stage 2 - DeBERTa-v3-small cross-encoder NLI           ~188 ms
        |
        +--> entailment / contradiction / neutral
             -> grounding_risk in [0, 1]
"""))
A(P(
    "Both models run locally on CPU through ONNX Runtime, with a PyTorch "
    "fallback if ONNX is unavailable. No prompt text leaves the host and no "
    "per-token cost is incurred."))
A(H2("Operating point"))
A(P(
    "Thresholds were selected on a 21-case development split and applied "
    "unchanged to a held-out 30-case test split: NLI contradiction threshold "
    "0.5, semantic low-similarity floor 0.1, Stage 1 safe threshold 0.85."))

A(Spacer(1, 5 * mm)); A(H1("8. Measured results"))
A(P("Ablation on dataset v1.0_test, 30 held-out cases."))
A(table([
    ["Configuration", "Precision", "Recall", "F1", "Latency"],
    ["MiniLM gate only", "0.733", "0.846", "0.786", "27.8 ms"],
    ["DeBERTa NLI only", "0.929", "1.000", "0.963", "188.1 ms"],
    ["Cascade (shipped)", "0.929", "1.000", "0.963", "215.9 ms"],
    ["Full system (all signals)", "0.929", "1.000", "0.963", "-"],
], [46 * mm, 24 * mm, 22 * mm, 20 * mm, 24 * mm], mono_cols=(1, 2, 3, 4)))
A(Spacer(1, 2 * mm))
A(P(
    "Confusion matrix at the shipped operating point: 13 true positives, 1 "
    "false positive, 0 false negatives, 16 true negatives. False positive rate "
    "0.059, false negative rate 0.000."))
A(note(
    "Read this table honestly. On this benchmark the cascade is no more "
    "accurate than DeBERTa alone, and is 28 ms slower, because nearly every "
    "case escalates past the gate. The cascade earns its place only on traffic "
    "where most spans clear the 0.85 threshold and skip Stage 2 entirely; a "
    "30-case adversarial set is the worst case for it. The honest claim is "
    "that the cascade buys throughput on easy traffic, not accuracy."))
A(Spacer(1, 2 * mm))
A(P(
    "Two further findings from the same run are worth stating plainly: adding "
    "the disagreement signal produced results identical to NLI alone, and "
    "adding drift <i>reduced</i> precision to 0.448. Neither signal improves "
    "grounding detection on this dataset. They are reported as separate "
    "diagnostics rather than folded into the grounding claim."))
A(caption(
    "Thirty test cases is a small sample. These figures establish that the "
    "pipeline works end to end at a chosen operating point; they do not "
    "establish generalisation to production traffic."))

# ---- 9. Signals ------------------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("9. The four signals in detail"))

A(H2("9.1 Grounding (Beta)"))
A(P(
    "As described in section 7. Produces "
    "<font face='Courier'>grounding_score</font> in [0, 1] where higher means "
    "less supported, plus the stage that decided it."))

A(H2("9.2 Drift and the Agent Stability Index (Beta)"))
A(P("The drift service tracks two distinct quantities that are easy to confuse."))
A(table([
    ["Metric", "What it compares", "Used for"],
    ["centroid_distance", "One output against the agent's EMA centroid.", "Per-span spike. Noisy: on 500 real sessions it flagged 91.7 percent, so it does <b>not</b> drive alerts."],
    ["window_centroid_distance", "Mean of a 12-sample current window against the mean of a 20-sample baseline pool.", "The sustained signal DRIFT_DETECTED actually fires on, at threshold 0.300."],
], [40 * mm, 55 * mm, 55 * mm], mono_cols=(0,)))
A(Spacer(1, 3 * mm))
A(P(
    "An agent therefore needs 20 baseline samples plus 12 window samples - 32 "
    "evaluated spans - before a sustained drift value exists at all. Until "
    "then the field is null, and the dashboard shows it as null rather than as "
    "zero."))
A(P("The Agent Stability Index condenses the drift signals into one 0-100 score:"))
A(code("""
ASI = 100 * sum(w_i * s_i) / sum(w_i)

  s = max(0, 1 - centroid_distance)        w = 0.35
  s = max(0, 1 - 2 * quality_drift)        w = 0.30
  s = max(0, 1 - 5 * error_rate_delta)     w = 0.20
  s = max(0, 1 - tool_drift)               w = 0.15

Terms are included only when that signal exists; weights renormalise
over whichever terms are present.
"""))
A(P("ASI is an explainable heuristic, not a calibrated probability."))

A(H2("9.3 Inter-agent disagreement (Experimental)"))
A(P(
    "Compares assertions between agent outputs within the same trace using the "
    "same NLI model, and keeps the worst contradicting pair. Benchmarked on a "
    "constructed multi-agent set at threshold 0.6 rather than on collected "
    "production traces, which is why it is tiered Experimental."))

A(H2("9.4 Tool-claim assertion (Experimental)"))
A(P(
    "A deterministic check with no model cost: regex patterns extract claims "
    "about tool usage from prose, and those are compared against what the "
    "trace recorded the tool returning. It catches an agent narrating "
    "“retrieved 10 papers” when the tool returned one."))
A(note(
    "This signal does not currently fire. The count comparison returns early "
    "unless the tool call carries a numeric result_count, and "
    "evaluation_runner.py builds tool call records with only tool_name and "
    "result_summary - result_count is never populated on the ingest path. "
    "Called directly with a count supplied, the detector scores the mismatch "
    "correctly at 1.0; through the API it scores 0.0. Across 1,328 evaluations "
    "on the development instance, no evaluation has a non-zero tool-claim "
    "score, and no TOOL_CLAIM_MISMATCH alert has ever been raised. The "
    "detector is sound; the wiring is not."))

# ---- 10. Risk & alerts -----------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("10. Risk aggregation and alerting"))
A(P(
    "Signals combine into one composite risk score by weighted mean over "
    "whichever signals produced a value:"))
A(table([
    ["Signal", "Weight"],
    ["Grounding", "0.40"],
    ["Tool-claim", "0.25"],
    ["Disagreement", "0.20"],
    ["Semantic", "0.15"],
], [40 * mm, 22 * mm], mono_cols=(1,)))
A(Spacer(1, 3 * mm))
A(P("Alert rules are threshold comparisons over stored fields:"))
A(table([
    ["Alert", "Field", "Threshold", "Severity"],
    ["HIGH_HALLUCINATION_RISK", "risk_score", "> 0.7", "HIGH"],
    ["GROUNDING_FAILURE", "grounding_score", "> 0.7", "HIGH"],
    ["TOOL_CLAIM_MISMATCH", "tool_claim_score", "> 0.3", "HIGH"],
    ["DRIFT_DETECTED", "window_centroid_distance", "> 0.3", "MEDIUM"],
    ["ASI_DROP", "stability_index", "< 50", "MEDIUM"],
    ["ERROR_RATE_SPIKE", "error_rate_delta", "-", "HIGH"],
    ["AGENT_DISAGREEMENT", "disagreement_score", "-", "-"],
], [48 * mm, 44 * mm, 24 * mm, 22 * mm], mono_cols=(1, 2)))
A(Spacer(1, 2 * mm))
A(P(
    "Alert storms are bounded by a 900-second per-rule cooldown and a cap of 50 "
    "alerts per hour."))

A(Spacer(1, 5 * mm)); A(H1("11. Storage"))
A(P(
    "SQLite in WAL mode, accessed asynchronously through SQLModel, with schema "
    "changes managed by Alembic. Eleven tables:"))
A(table([
    ["Table", "Holds"],
    ["traces", "One row per trace: window, status, span count, overall risk."],
    ["spans", "One row per unit of agent work, with timing and tool fields."],
    ["evaluations", "Per-span scores and the stage that produced them."],
    ["drift_records", "Per-span drift metrics and stability index."],
    ["baselines", "Serialised centroid state: EMA centroids and window baseline pools."],
    ["alerts", "Fired rules with acknowledgement and resolution state."],
    ["agent_records", "Rolling per-agent aggregates: spans, errors, latency, ASI."],
    ["dataset_cases", "Curated benchmark cases promoted from real traces."],
    ["evaluation_jobs", "The durable queue: status, attempts, lease expiry."],
    ["worker_heartbeats", "Worker liveness, backend in use, jobs processed."],
    ["retention_runs", "Audit trail of what retention deleted and when."],
], [34 * mm, 112 * mm], mono_cols=(0,)))
A(Spacer(1, 2 * mm))
A(P(
    "Baseline serialisation matters for correctness, not just convenience. "
    "Without it, every restart resets drift state and an agent alerts blindly "
    "until its windows refill. Both the EMA centroids and the window baseline "
    "pools are persisted and restored on worker start."))

# ---- 12. Dashboard ---------------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("12. The dashboard"))
A(P(
    "A React application with two surfaces: a public page that explains the "
    "system, and a product console that reads a live instance. The console "
    "consumes the same REST API any client would; there is no privileged "
    "channel."))
A(table([
    ["View", "Reads", "Shows"],
    ["Overview", "/v1/metrics, /v1/agents, /v1/drift, /v1/platform", "Fleet vitals, engine readiness, agent roster"],
    ["Agents", "/v1/agents, /v1/agents/{id}/health", "Per-agent latency, error rate, risk and drift trend"],
    ["Traces", "/v1/traces, /v1/traces/{id}", "Trace list, span waterfall, span inspector"],
    ["Incidents", "/v1/alerts, PATCH /v1/alerts/{id}", "Triage queue, acknowledgement"],
    ["Drift", "/v1/drift", "Sustained shift, spike, tool drift, baseline pool size"],
    ["Telemetry Lab", "POST /v1/simulate", "Injects the four backend scenarios"],
    ["Datasets", "/v1/datasets, POST cases", "Benchmark sets, curation from a span"],
    ["Experiments", "/v1/experiments", "Recorded experiment runs"],
], [26 * mm, 55 * mm, 65 * mm], mono_cols=(1,)))
A(H2("Representing absence"))
A(P(
    "The console's data layer maps API responses onto view models and leaves "
    "any field the backend does not measure undefined rather than "
    "substituting a default. Cost per span, token counts per agent, framework "
    "labels and embedding coordinates have no source in the schema, so the UI "
    "renders an em-dash. The distinction that matters operationally is between "
    "“measured as zero” and “not measured”, and a "
    "plausible-looking default erases it."))
A(P(
    "The same rule governs status. Engine readiness reads "
    "<font face='Courier'>platform.state</font>; with no worker alive it reads "
    "<i>failing</i>, not a hardcoded <i>online</i>. Agents whose drift windows "
    "have not filled read <i>warming up</i>, not <i>stable</i> - an unmeasured "
    "agent is not a healthy agent."))

A(Spacer(1, 5 * mm)); A(H1("13. Operations"))
A(table([
    ["Endpoint", "Answers"],
    ["/v1/health/live", "Is the process up?"],
    ["/v1/health/ready", "Can it serve traffic? (database reachable)"],
    ["/v1/health/evaluator", "Is any worker alive? 503 when none, by contract."],
    ["/v1/platform", "Composite state, queue depth by status, worker roster, timing percentiles, reliability counters."],
], [40 * mm, 106 * mm], mono_cols=(0,)))
A(Spacer(1, 3 * mm))
A(P(
    "The distinction between <i>ready</i> and <i>evaluator ready</i> is "
    "deliberate: the API can correctly accept spans while nothing is "
    "evaluating them. Collapsing the two would report a healthy system that is "
    "silently accumulating an unevaluated backlog."))
A(P(
    "Workers heartbeat and are considered stale after 90 seconds. Retention "
    "deletes beyond <font face='Courier'>retention_days</font> (default 30) and "
    "records what it removed in <font face='Courier'>retention_runs</font>. "
    "Rate limiting, API-key auth and CORS are handled in middleware; "
    "<font face='Courier'>docker-compose.yml</font> builds the API and an "
    "nginx-served dashboard. It defines no worker service, so a Compose deployment accepts spans but evaluates none until a worker is run against "
    "the same database."))

# ---- 14. Observed output ---------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("14. What the output looks like"))
A(P(
    "Measured on the development instance while writing this document, with "
    "one worker running ONNX NLI and PyTorch embeddings."))
A(table([
    ["Table", "Rows"],
    ["traces", "20,623"],
    ["spans", "20,771"],
    ["evaluations", "1,328"],
    ["drift_records", "1,328"],
    ["alerts", "98"],
    ["agent_records", "51"],
    ["dataset_cases", "79"],
    ["evaluation_jobs", "121"],
], [40 * mm, 26 * mm], mono_cols=(1,)))
A(Spacer(1, 3 * mm))
A(P(
    "Evaluation latency observed live: p50 253 ms, p95 497 ms per span, which "
    "is consistent with the 215.9 ms benchmark plus queue and persistence "
    "overhead."))
A(H2("A worked drift detection"))
A(P(
    "To confirm the sustained-drift path end to end, a fresh agent was driven "
    "through 20 spans on one topic, then 14 on an unrelated one:"))
A(code("""
after 20 baseline spans:
  baseline_size = 19,  window_centroid_distance = null   (window not filled)

after 14 shifted spans:
  centroid_distance        = 0.3246   (per-span spike)
  window_centroid_distance = 0.9294   (sustained)
  stability_index          = 51.3     (was 100.0)
  -> DRIFT_DETECTED raised on 0.934, not on the 0.32 spike
"""))
A(P(
    "This is the first time in the instance's history that "
    "<font face='Courier'>window_centroid_distance</font> produced a value: it "
    "requires 32 evaluated spans for a single agent, and the in-memory current "
    "window does not survive a worker restart. Prior DRIFT_DETECTED rows in "
    "the database are legacy spike-based alerts from before the alerting field "
    "was switched."))

A(Spacer(1, 5 * mm)); A(H1("15. Testing"))
A(P(
    "209 tests pass across 19 files, covering the durable queue and crash "
    "recovery, migrations, retention, health and readiness contracts, "
    "resilience, security fixes, self-monitoring, the SDK, the evaluation "
    "services, claim extraction, disagreement, dataset curation, LLM adapters, "
    "reasoning strategies, and end-to-end LangGraph and real-workflow runs."))
A(note(
    "The suite covers Python only. The dashboard has no test framework "
    "configured, so its correctness rests on type checking, a successful "
    "build, and manual verification against a live backend."))

# ---- 16. Limits ------------------------------------------------------------
A(Spacer(1, 5 * mm)); A(H1("16. Honest limits"))
A(P(
    "Stated plainly, because a monitoring tool that overstates its own "
    "coverage is worse than one that admits gaps."))
A(table([
    ["Limit", "Detail"],
    ["Tool-claim signal is inert",
     "result_count is never populated on the ingest path, so WRONG_COUNT cannot fire. Zero non-zero scores across 1,328 evaluations."],
    ["Simulator scenario is dead code",
     "The tool_mismatch scenario computes an is_mismatch flag and never uses it, so it emits the same payload as the clean scenario."],
    ["Evaluation coverage is partial",
     "1,328 of 20,771 spans carry an evaluation on the development instance, roughly 6 percent. Most spans predate the current worker or were load-test fill."],
    ["Drift needs 32 samples per agent",
     "20 baseline plus 12 window. Short-lived agents never produce a sustained drift value."],
    ["Current drift window is not persisted",
     "Baseline pools survive restart; the 12-sample current window does not, so each restart delays sustained detection."],
    ["Benchmark is small",
     "30 held-out cases. Sufficient to demonstrate the pipeline, not to claim generalisation."],
    ["Disagreement and drift do not help grounding",
     "On the ablation set, disagreement was identical to NLI alone and drift reduced precision to 0.448."],
    ["Not OpenTelemetry",
     "The span schema is custom. There is no OTel dependency, import or semantic-convention mapping."],
    ["Single-node storage",
     "SQLite with WAL. Appropriate for self-hosted single-instance use; not a multi-writer deployment."],
    ["No licence",
     "The repository ships no LICENSE file, so it is source-available rather than open source."],
], [46 * mm, 100 * mm]))
A(Spacer(1, 4 * mm))

A(Spacer(1, 5 * mm)); A(H1("17. Running it"))
A(code("""
# 1. Backend API (no models loaded)
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# 2. Evaluation worker (loads MiniLM + DeBERTa from ./models)
python -m app.worker

# 3. Dashboard
cd dashboard && npm install && npm run dev

# API + dashboard only (compose defines no worker service)
docker compose up
"""))
A(P("Configuration is environment-driven; the defaults that matter:"))
A(table([
    ["Variable", "Default"],
    ["AGENTPULSE_DATABASE_URL", "sqlite+aiosqlite:///./data/agentpulse.db"],
    ["AGENTPULSE_API_KEY", "change-me-to-a-secure-key"],
    ["AGENTPULSE_NLI_MODEL", "cross-encoder/nli-deberta-v3-small"],
    ["AGENTPULSE_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"],
    ["AGENTPULSE_DRIFT_THRESHOLD", "0.3"],
    ["AGENTPULSE_RETENTION_DAYS", "30"],
    ["AGENTPULSE_API_LOAD_MODELS", "false"],
], [56 * mm, 90 * mm], mono_cols=(0, 1)))
A(Spacer(1, 4 * mm))
A(caption(
    "Set HF_HUB_OFFLINE=1 when the host has no network: both models are "
    "cached under ./models and the worker will otherwise spend minutes "
    "retrying huggingface.co before falling back to PyTorch."))


# --------------------------------------------------------------------------

def _decorate(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, 16 * mm, 190 * mm, 16 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, 11 * mm, "AgentPulse - technical deep dive")
        canvas.drawRightString(190 * mm, 11 * mm, str(doc.page))
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=A4,
    leftMargin=20 * mm, rightMargin=20 * mm,
    topMargin=18 * mm, bottomMargin=22 * mm,
    title="AgentPulse - Technical Deep Dive",
    author="AgentPulse",
)
doc.addPageTemplates([
    PageTemplate(
        id="main",
        frames=[Frame(20 * mm, 22 * mm, 170 * mm, 255 * mm, id="f")],
        onPage=_decorate,
    )
])
doc.build(story)
print("wrote", OUT)
