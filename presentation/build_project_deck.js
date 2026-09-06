// Builds the AgentPulse project deck.
//
// Figures are taken from the repository or measured on a running instance.
// Where a slide states a limitation it is because the measurement showed it.
//
//   node presentation/build_project_deck.js
//   OUT=other.pptx node presentation/build_project_deck.js

const path = require('path');
const PptxGenJS = require('pptxgenjs');

const OUT = process.env.OUT || path.join(__dirname, 'AgentPulse_Project_Deck.pptx');

const INK = '14171F';
const MUTED = '5B6472';
const RULE = 'D8DCE3';
const PANEL = 'F4F6F9';
const ACCENT = '1F4FD8';
const WARN = '8A4B00';
const GOOD = '1B6B3A';

const pptx = new PptxGenJS();
// LAYOUT_16x9 is 10 x 5.625in in pptxgenjs; every coordinate below assumes
// the 13.33 x 7.5in widescreen canvas, so define it explicitly.
pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
pptx.layout = 'WIDE';
pptx.author = 'AgentPulse';
pptx.title = 'AgentPulse - Project Deck';

const W = 13.33;
const H = 7.5;
const M = 0.72;

let slideNo = 0;

function slide(title, kicker) {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  slideNo += 1;

  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: W - 2 * M, h: 0.24,
      fontSize: 10, bold: true, color: ACCENT, charSpacing: 1.4,
    });
  }
  s.addText(title, {
    x: M, y: kicker ? 0.68 : 0.5, w: W - 2 * M, h: 0.62,
    fontSize: 27, bold: true, color: INK,
  });
  s.addShape(pptx.ShapeType.line, {
    x: M, y: kicker ? 1.38 : 1.2, w: W - 2 * M, h: 0,
    line: { color: RULE, width: 1 },
  });

  s.addText(String(slideNo), {
    x: W - M - 0.5, y: H - 0.52, w: 0.5, h: 0.24,
    fontSize: 9, color: MUTED, align: 'right',
  });
  s.addText('AgentPulse', {
    x: M, y: H - 0.52, w: 3, h: 0.24, fontSize: 9, color: MUTED,
  });
  return s;
}

function bullets(s, items, opts = {}) {
  s.addText(
    items.map((t) => ({
      text: t,
      options: { bullet: { code: '2022' }, breakLine: true },
    })),
    {
      x: opts.x || M, y: opts.y || 1.72, w: opts.w || W - 2 * M, h: opts.h || 4.4,
      fontSize: opts.fontSize || 15, color: INK, lineSpacingMultiple: 1.32,
      paraSpaceAfter: 8,
    },
  );
}

function table(s, rows, opts = {}) {
  const body = rows.map((row, ri) =>
    row.map((cell) => ({
      text: String(cell),
      options: {
        bold: ri === 0,
        color: ri === 0 ? INK : (opts.bodyColor || INK),
        fill: ri === 0 ? PANEL : 'FFFFFF',
        fontSize: opts.fontSize || 12,
        fontFace: opts.mono ? 'Consolas' : 'Calibri',
      },
    })),
  );
  s.addTable(body, {
    x: opts.x || M, y: opts.y || 1.75, w: opts.w || W - 2 * M,
    colW: opts.colW,
    border: { type: 'solid', color: RULE, pt: 0.5 },
    autoPage: false,
    valign: 'middle',
    margin: 0.09,
  });
}

function code(s, text, opts = {}) {
  s.addShape(pptx.ShapeType.rect, {
    x: opts.x || M, y: opts.y || 1.75,
    w: opts.w || W - 2 * M, h: opts.h || 3.6,
    fill: { color: PANEL }, line: { color: RULE, width: 0.75 },
  });
  s.addText(text, {
    x: (opts.x || M) + 0.22, y: (opts.y || 1.75) + 0.16,
    w: (opts.w || W - 2 * M) - 0.44, h: (opts.h || 3.6) - 0.32,
    fontSize: opts.fontSize || 11.5, fontFace: 'Consolas', color: INK,
    lineSpacingMultiple: 1.16, valign: 'top',
  });
}

function callout(s, text, opts = {}) {
  const y = opts.y || 5.75;
  const h = opts.h || 1.05;
  s.addShape(pptx.ShapeType.rect, {
    x: M, y, w: W - 2 * M, h,
    fill: { color: 'FFF8EE' }, line: { color: 'E8D5B5', width: 0.75 },
  });
  s.addText(text, {
    x: M + 0.24, y: y + 0.1, w: W - 2 * M - 0.48, h: h - 0.2,
    fontSize: opts.fontSize || 12.5, color: WARN, italic: true, valign: 'middle',
  });
}

// ---------------------------------------------------------------- 1. Title
{
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: H, fill: { color: ACCENT } });
  s.addText('AgentPulse', { x: 1.1, y: 2.35, w: 10, h: 1.0, fontSize: 46, bold: true, color: INK });
  s.addText('Continuous grounding and drift observability for multi-agent LLM systems', {
    x: 1.1, y: 3.35, w: 10.6, h: 0.7, fontSize: 18, color: MUTED,
  });
  s.addShape(pptx.ShapeType.line, { x: 1.1, y: 4.25, w: 5.2, h: 0, line: { color: RULE, width: 1.25 } });
  s.addText(
    'Self-hosted  ·  every span evaluated, never sampled  ·  local CPU inference, no per-token cost',
    { x: 1.1, y: 4.5, w: 10.6, h: 0.4, fontSize: 13, color: MUTED },
  );
  s.addText('M.Tech project  ·  technical review', {
    x: 1.1, y: 5.6, w: 8, h: 0.3, fontSize: 12, color: MUTED,
  });
}

// ---------------------------------------------------------------- 2. Problem
{
  const s = slide('An agent can fail without anything breaking', 'The problem');
  bullets(s, [
    'A hallucinating agent returns HTTP 200, in fluent prose, on time. The failure is in the content, not the transport.',
    'Errors compound: a weak retrieval becomes an asserted fact downstream. Each step is plausible; only the chain is wrong.',
    'There is no stack trace. Nothing raises, so there is no line number to debug from.',
    'The usual answer, LLM-as-a-judge, bills per token and adds seconds per span, so teams sample. Sampling is exactly how a rare hallucination goes unseen.',
  ], { h: 3.4 });
  callout(s,
    'The trade AgentPulse makes: small discriminative models on local CPU, cheap enough to score every span, ' +
    'accepting narrower coverage than a general judge in exchange.',
    { y: 5.35, h: 1.1 });
}

// ---------------------------------------------------------------- 3. What it is
{
  const s = slide('Four signals over every span', 'What it does');
  table(s, [
    ['Signal', 'Question', 'Method', 'Maturity'],
    ['Grounding', 'Is the output supported by its evidence?', 'MiniLM cosine gate to DeBERTa-v3 NLI', 'Beta'],
    ['Drift / ASI', 'Has this agent shifted from its own baseline?', 'Embedding centroid distance, EMA and windowed', 'Beta'],
    ['Disagreement', 'Do two agents contradict each other?', 'Pairwise NLI within one trace', 'Experimental'],
    ['Tool-claim', 'Does the claim match what the tool returned?', 'Regex extraction vs recorded tool result', 'Experimental'],
  ], { colW: [1.85, 3.5, 4.6, 1.94], fontSize: 12.5 });
  s.addText(
    'Maturity tiers are the project\'s own. Slide 16 states what each tier means in practice.',
    { x: M, y: 4.55, w: W - 2 * M, h: 0.3, fontSize: 11.5, color: MUTED, italic: true },
  );
  callout(s,
    'Design constraint throughout: a value the system did not measure is never displayed as if it did. ' +
    'Unmeasured reads as unmeasured, not as zero and not as healthy.',
    { y: 5.15, h: 1.0 });
}

// ---------------------------------------------------------------- 4. Architecture
{
  const s = slide('Four processes, deliberately separated', 'Architecture');
  code(s,
`  Agent pipeline  (LangGraph / CrewAI / LangChain / plain Python)
        |
        |  SDK: buffers spans, flushes in batches, fails open
        v
  +--------------------------+
  |  FastAPI ingest API      |  POST /v1/ingest -> 202 Accepted
  |  loads no ML models      |  validate, dedupe, persist, enqueue
  +--------------------------+
        |                                ^
        | evaluation_jobs (SQLite)       | REST + WebSocket
        v                                |
  +--------------------------+     +---------------------+
  |  Evaluation worker       |     |  React dashboard    |
  |  MiniLM + DeBERTa (ONNX) |     |  polls every 10 s   |
  |  leases, retries, scores |     +---------------------+
  +--------------------------+
        |
        v
  SQLite (WAL) - 11 tables`,
    { h: 4.35, fontSize: 11 });
  callout(s,
    'The API holds no models: loading them cost ~1.24 GB resident and ~20 s of startup for a capability no route used.',
    { y: 6.3, h: 0.72 });
}

// ---------------------------------------------------------------- 5. Flow
{
  const s = slide('From agent call to alert', 'End-to-end flow');
  table(s, [
    ['#', 'Stage', 'What happens'],
    ['1', 'Instrument', 'A decorator or adapter captures inputs, outputs, timing, tool name and tool result.'],
    ['2', 'Redact', 'Privacy filter applies regex redaction in the agent process, before anything leaves it.'],
    ['3', 'Buffer', 'Spans batch in memory; transport failures are swallowed so telemetry cannot break the pipeline.'],
    ['4', 'Ingest', 'Validate, upsert the trace, write spans, enqueue one evaluation job per span.'],
    ['5', 'Lease', 'A worker atomically claims a job with a 120-second lease and an attempt counter.'],
    ['6', 'Evaluate', 'Four signals run; a weighted composite risk score is aggregated.'],
    ['7', 'Persist', 'Evaluation and drift rows written idempotently, keyed on span id.'],
    ['8', 'Alert', 'Threshold rules fire, subject to a 900 s cooldown and a 50/hour cap.'],
  ], { colW: [0.55, 1.9, 9.44], fontSize: 12 });
}

// ---------------------------------------------------------------- 6. SDK
{
  const s = slide('Observability must not break what it observes', 'The SDK');
  code(s,
`from agentpulse import AgentPulse

pulse = AgentPulse(
    endpoint="http://localhost:8000",
    api_key="your-api-key",
    service_name="production-swarms",
)

@pulse.monitor(agent_id="sql_synthesizer", role="synthesizer")
def run_agent_pipeline(user_query: str):
    schema = fetch_warehouse_schema()
    sql = generate_sql(user_query, schema)
    return validate_and_execute(sql)`,
    { w: 6.7, h: 3.5, fontSize: 11.5 });

  bullets(s, [
    'Fails open by default: a collector that is down is swallowed, never raised into the agent.',
    'Batched async transport over aiohttp.',
    'Prompt capture is opt-in; without it spans carry structure and hashes, not text.',
    'Redaction runs in your process, before the wire.',
    'Adapters: LangGraph, CrewAI, LangChain. Explicit wrappers, not monkey-patching.',
  ], { x: 7.7, y: 1.8, w: 4.9, h: 3.5, fontSize: 13 });
}

// ---------------------------------------------------------------- 7. Queue
{
  const s = slide('Exactly-once evaluation without a broker', 'Durability');
  table(s, [
    ['State', 'Meaning'],
    ['queued', 'Written, waiting for a worker.'],
    ['running', 'Leased by a worker; the lease carries an expiry.'],
    ['succeeded', 'Evaluated and persisted.'],
    ['failed', 'Attempt failed; returns to queued while attempts remain.'],
    ['dead_letter', 'Exhausted three attempts; will not be retried.'],
  ], { colW: [2.2, 9.69], fontSize: 12.5, y: 1.7 });
  bullets(s, [
    'A worker holds a 120-second lease. If it dies mid-evaluation the lease expires and the job is reclaimed.',
    'Persistence is keyed on span id and no-ops if an evaluation exists, so a replayed job cannot double-write.',
    'Covered by a crash-recovery test that kills a worker mid-evaluation and asserts exactly one result.',
  ], { y: 4.55, h: 1.7, fontSize: 13.5 });
}

// ---------------------------------------------------------------- 8. Cascade
{
  const s = slide('Cheap model first, expensive model only when unsure', 'Evaluation');
  code(s,
`  span (input_summary, output_summary)
        |
        v
  Stage 1 - MiniLM-L6-v2 embeddings, cosine similarity     ~27.8 ms
        |
        +--  cosine > 0.85  -->  accept as grounded, stop
        |
        v  otherwise escalate
  Stage 2 - DeBERTa-v3-small cross-encoder NLI             ~188 ms
        |
        +--> entailment / contradiction / neutral
             -> grounding_risk in [0, 1]`,
    { h: 3.5, fontSize: 12 });
  bullets(s, [
    'Both models run on local CPU through ONNX Runtime, with a PyTorch fallback. No prompt text leaves the host.',
    'Thresholds picked on a 21-case dev split, applied unchanged to a 30-case held-out test split.',
  ], { y: 5.5, h: 1.2, fontSize: 13.5 });
}

// ---------------------------------------------------------------- 9. Results
{
  const s = slide('Ablation on the held-out test split', 'Measured results');
  table(s, [
    ['Configuration', 'Precision', 'Recall', 'F1', 'Latency'],
    ['MiniLM gate only', '0.733', '0.846', '0.786', '27.8 ms'],
    ['DeBERTa NLI only', '0.929', '1.000', '0.963', '188.1 ms'],
    ['Cascade (shipped)', '0.929', '1.000', '0.963', '215.9 ms'],
  ], { colW: [4.0, 2.0, 2.0, 1.9, 1.99], fontSize: 13, y: 1.75 });
  s.addText(
    'Dataset v1.0_test, 30 cases.  13 TP · 1 FP · 0 FN · 16 TN.  FPR 0.059, FNR 0.000.',
    { x: M, y: 3.5, w: W - 2 * M, h: 0.3, fontSize: 12.5, color: MUTED },
  );
  callout(s,
    'Read honestly: on this benchmark the cascade is no more accurate than DeBERTa alone and is 28 ms slower, ' +
    'because nearly every adversarial case escalates past the gate. The cascade buys throughput on easy traffic, ' +
    'not accuracy. Adding disagreement changed nothing; adding drift cut precision to 0.448.',
    { y: 4.05, h: 1.35 });
  s.addText(
    'Thirty cases establishes that the pipeline works at a chosen operating point. It does not establish generalisation.',
    { x: M, y: 5.6, w: W - 2 * M, h: 0.35, fontSize: 12, color: MUTED, italic: true },
  );
}

// ---------------------------------------------------------------- 10. Drift
{
  const s = slide('Two metrics that are easy to confuse', 'Drift');
  table(s, [
    ['Metric', 'Compares', 'Used for'],
    ['centroid_distance', 'One output against the agent\'s EMA centroid.',
      'Per-span spike. On 500 real sessions it flagged 91.7%, so it does NOT drive alerts.'],
    ['window_centroid_distance', 'Mean of a 12-sample window against a 20-sample baseline pool.',
      'The sustained signal DRIFT_DETECTED fires on, at threshold 0.300.'],
  ], { colW: [2.6, 4.2, 5.09], fontSize: 12 });
  code(s,
`ASI = 100 * sum(w_i * s_i) / sum(w_i)

  s = max(0, 1 - centroid_distance)     w = 0.35     s = max(0, 1 - 2*quality_drift)     w = 0.30
  s = max(0, 1 - 5*error_rate_delta)    w = 0.20     s = max(0, 1 - tool_drift)          w = 0.15`,
    { y: 4.25, h: 1.3, fontSize: 11 });
  s.addText(
    'An agent needs 20 baseline plus 12 window samples - 32 evaluated spans - before a sustained value exists at all. Until then it is null.',
    { x: M, y: 5.75, w: W - 2 * M, h: 0.5, fontSize: 12.5, color: MUTED },
  );
}

// ---------------------------------------------------------------- 11. Drift proof
{
  const s = slide('Driving the sustained-drift path end to end', 'Verification');
  s.addText('A fresh agent was given 20 spans on one topic, then 14 on an unrelated one.', {
    x: M, y: 1.62, w: W - 2 * M, h: 0.3, fontSize: 13.5, color: INK,
  });
  code(s,
`after 20 baseline spans
  baseline_size            = 19
  window_centroid_distance = null          <- window not filled yet

after 14 shifted spans
  centroid_distance        = 0.3246        <- per-span spike
  window_centroid_distance = 0.9294        <- sustained
  stability_index          = 51.3          (was 100.0)

  -> DRIFT_DETECTED raised on 0.934, not on the 0.32 spike`,
    { y: 2.08, h: 3.0, fontSize: 12 });
  callout(s,
    'This was the first time in the instance history that window_centroid_distance produced a value: it needs 32 ' +
    'evaluated spans for one agent, and the current window does not survive a worker restart. Every prior ' +
    'DRIFT_DETECTED row is a legacy spike-based alert.',
    { y: 5.3, h: 1.25 });
}

// ---------------------------------------------------------------- 12. Alerting
{
  const s = slide('Weighted risk, threshold alerts', 'Scoring');
  table(s, [
    ['Signal', 'Weight'],
    ['Grounding', '0.40'],
    ['Tool-claim', '0.25'],
    ['Disagreement', '0.20'],
    ['Semantic', '0.15'],
  ], { colW: [2.4, 1.5], w: 3.9, fontSize: 12.5 });
  table(s, [
    ['Alert', 'Field', 'Fires'],
    ['HIGH_HALLUCINATION_RISK', 'risk_score', '> 0.7'],
    ['GROUNDING_FAILURE', 'grounding_score', '> 0.7'],
    ['TOOL_CLAIM_MISMATCH', 'tool_claim_score', '> 0.3'],
    ['DRIFT_DETECTED', 'window_centroid_distance', '> 0.3'],
    ['ASI_DROP', 'stability_index', '< 50'],
  ], { x: 5.0, colW: [3.3, 2.9, 1.6], w: 7.8, fontSize: 12 });
  s.addText('Alert storms are bounded by a 900-second per-rule cooldown and a cap of 50 per hour.', {
    x: M, y: 5.05, w: W - 2 * M, h: 0.3, fontSize: 12.5, color: MUTED,
  });
}

// ---------------------------------------------------------------- 13. Dashboard
{
  const s = slide('The console reads the same API anyone would', 'Dashboard');
  bullets(s, [
    'React 19 + TypeScript + Vite. A public page, and a product console that polls a live instance every 10 seconds.',
    'Nine views: overview, agents, traces with a span waterfall, incidents, drift, replay, experiments, datasets, telemetry lab.',
    'Waterfall bars are positioned from recorded start_time, so they read as a timeline rather than a bar chart.',
    'Fields with no backend source - cost, per-agent tokens, framework, embedding coordinates - render as an em-dash, not a zero.',
    'Engine readiness reads platform.state: with no worker alive it says failing, not a hardcoded online.',
    'Agents whose drift windows have not filled read "warming up", not "stable".',
  ], { y: 1.72, h: 4.0, fontSize: 14 });
}

// ---------------------------------------------------------------- 14. Ops
{
  const s = slide('The system reports on itself', 'Operations');
  table(s, [
    ['Endpoint', 'Answers'],
    ['/v1/health/live', 'Is the process up?'],
    ['/v1/health/ready', 'Can it serve traffic? (database reachable)'],
    ['/v1/health/evaluator', 'Is any worker alive? Returns 503 when none, by contract.'],
    ['/v1/platform', 'Composite state, queue depth by status, worker roster, timing percentiles.'],
  ], { colW: [3.2, 8.69], fontSize: 12.5 });
  bullets(s, [
    'Ready and evaluator-ready are separate on purpose: the API can correctly accept spans while nothing is evaluating them.',
    'Workers heartbeat; stale after 90 seconds. Retention deletes past retention_days and records what it removed.',
    'docker compose builds the API and dashboard only - it defines no worker service, so a Compose deployment stores spans without evaluating them.',
  ], { y: 4.35, h: 1.9, fontSize: 13.5 });
}

// ---------------------------------------------------------------- 15. Evidence
{
  const s = slide('What the running system produces', 'Observed');
  table(s, [
    ['Measure', 'Value'],
    ['Spans ingested', '20,771'],
    ['Traces', '20,623'],
    ['Evaluations written', '1,328'],
    ['Alerts raised', '98'],
    ['Agents tracked', '51'],
  ], { colW: [3.0, 2.2], w: 5.2, fontSize: 12.5 });
  table(s, [
    ['Check', 'Result'],
    ['Python test suite', '209 passed'],
    ['Evaluation latency (live)', 'p50 253 ms, p95 497 ms'],
    ['Grounding F1 (v1.0_test)', '0.963'],
    ['Dashboard typecheck / build', 'clean / passes'],
    ['Frontend unit tests', 'none configured'],
  ], { x: 6.4, colW: [3.6, 2.8], w: 6.4, fontSize: 12.5 });
  callout(s,
    'Evaluation covers 1,328 of 20,771 stored spans, about 6 percent. Most predate the current worker or were load-test fill.',
    { y: 5.35, h: 0.8 });
}

// ---------------------------------------------------------------- 16. Limits
{
  const s = slide('What does not work yet', 'Honest limits');
  table(s, [
    ['Limit', 'Detail'],
    ['Tool-claim signal is inert',
      'result_count is never populated on the ingest path, so the count check returns early. Zero non-zero scores across 1,328 evaluations.'],
    ['Simulator scenario is dead code',
      'The tool_mismatch scenario computes a flag it never uses, so it emits the clean payload.'],
    ['Drift needs 32 samples per agent',
      'Short-lived agents never produce a sustained value; the current window does not survive a restart.'],
    ['Benchmark is small',
      '30 held-out cases. Enough to demonstrate the pipeline, not to claim generalisation.'],
    ['Not OpenTelemetry',
      'The span schema is custom. No OTel dependency, import or semantic-convention mapping.'],
    ['Single-node storage',
      'SQLite with WAL. Suited to self-hosted single-instance use, not multi-writer deployment.'],
  ], { colW: [3.5, 8.39], fontSize: 11.5 });
}

// ---------------------------------------------------------------- 17. Next
{
  const s = slide('Where the work goes next', 'Next');
  bullets(s, [
    'Populate result_count on the ingest path so the tool-claim signal can fire, and make the simulator scenario exercise it.',
    'Persist the current drift window so sustained detection survives a restart.',
    'Expand the benchmark past 30 cases and re-run the ablation before making any generalisation claim.',
    'Add a frontend test framework; the console currently rests on type checking and manual verification.',
    'Backfill evaluations for stored spans to lift coverage above six percent.',
  ], { y: 1.75, h: 3.6, fontSize: 15 });
  callout(s,
    'The system works end to end and its measurements are reproducible. The gaps above are known, located in the code, and stated rather than hidden.',
    { y: 5.5, h: 0.95 });
}

// ---------------------------------------------------------------- 18. Close
{
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: H, fill: { color: ACCENT } });
  s.addText('AgentPulse', { x: 1.1, y: 2.6, w: 10, h: 0.9, fontSize: 38, bold: true, color: INK });
  s.addText('Every span evaluated. Nothing invented.', {
    x: 1.1, y: 3.55, w: 10, h: 0.5, fontSize: 17, color: MUTED,
  });
  s.addShape(pptx.ShapeType.line, { x: 1.1, y: 4.3, w: 5.2, h: 0, line: { color: RULE, width: 1.25 } });
  s.addText('Questions', { x: 1.1, y: 4.55, w: 6, h: 0.4, fontSize: 14, color: INK, bold: true });
}

pptx.writeFile({ fileName: OUT }).then(() => console.log('wrote', OUT));
