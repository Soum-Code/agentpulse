const pptxgen = require('pptxgenjs');

const OBSIDIAN = '0E1117', SURFACE = '191F2A', CARD = '222937';
const INK = 'E8ECF5', DIM = '9AA4BD', FAINT = '6B7690';
const CYAN = '22D3EE', OK = '34D399', WARN = 'FBBF24', BAD = 'FB7185';
const LIGHT = 'F4F6FA', DARKTEXT = '141922', MUTED = '5A6478';
const H = 'Cambria', B = 'Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Somnath Reddy';
pres.title = 'AgentPulse - Final Review';

const W = 13.3, M = 0.7;

const dark = () => { const s = pres.addSlide(); s.background = { color: OBSIDIAN }; return s; };
const light = () => { const s = pres.addSlide(); s.background = { color: LIGHT }; return s; };

function head(s, eyebrow, title, isDark) {
  s.addText(eyebrow.toUpperCase(), {
    x: M, y: 0.4, w: 10, h: 0.26, fontFace: B, fontSize: 10.5, bold: true,
    charSpacing: 2, color: CYAN, margin: 0,
  });
  s.addText(title, {
    x: M, y: 0.68, w: W - M * 2, h: 0.7, fontFace: H, fontSize: 31, bold: true,
    color: isDark ? INK : DARKTEXT, margin: 0,
  });
}
function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.07,
    fill: { color: fill || CARD }, line: { color: fill || CARD, width: 0 },
  });
}
// Small "checklist item covered" tag, so the panel can follow the rubric.
function tag(s, text, x, y) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w: 3.5, h: 0.28, rectRadius: 0.12,
    fill: { color: CYAN, transparency: 88 }, line: { color: CYAN, width: 0.6 },
  });
  s.addText(text, {
    x, y, w: 3.5, h: 0.28, align: 'center', fontFace: B, fontSize: 9,
    bold: true, color: CYAN, margin: 0,
  });
}

/* 1 — Title */
{
  const s = dark();
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.6, y: -1.7, w: 5.4, h: 5.4, fill: { color: CYAN, transparency: 92 }, line: { width: 0 },
  });
  s.addText('FINAL REVIEW', {
    x: M, y: 1.6, w: 8, h: 0.3, fontFace: B, fontSize: 12, bold: true,
    charSpacing: 3, color: CYAN, margin: 0,
  });
  s.addText('AgentPulse', {
    x: M, y: 2.05, w: 9, h: 1.1, fontFace: H, fontSize: 54, bold: true, color: INK, margin: 0,
  });
  s.addText('Continuous grounding and drift observability for multi-agent LLM systems', {
    x: M, y: 3.15, w: 8.4, h: 0.8, fontFace: B, fontSize: 18, color: DIM, margin: 0,
  });
  s.addText('M.Tech - AIML', {
    x: M, y: 4.35, w: 8, h: 0.32, fontFace: B, fontSize: 13, bold: true, color: CYAN, margin: 0,
  });
  s.addText('Somnath Reddy', {
    x: M, y: 5.55, w: 5, h: 0.35, fontFace: B, fontSize: 15, bold: true, color: INK, margin: 0,
  });
  s.addText('Guide: ______________________     Panel: ______________________', {
    x: M, y: 5.95, w: 9, h: 0.3, fontFace: B, fontSize: 11.5, color: FAINT, margin: 0,
  });
  s.addNotes('Fill in guide and panel names before presenting. State the review number out loud so the panel knows which checklist you are being measured against.');
}

/* 2 — Problem and motivation */
{
  const s = light();
  head(s, 'Problem statement', 'Multi-agent systems fail without failing', false);
  tag(s, 'Problem statement + motivation', 9.1, 0.42);

  s.addText('A multi-agent LLM pipeline can produce a fluent, well-formed, entirely unsupported answer while every service reports success. No exception is raised and no latency alarm fires.', {
    x: M, y: 1.6, w: 11.9, h: 0.7, fontFace: B, fontSize: 14.5, color: DARKTEXT, margin: 0,
  });

  const items = [
    ['Grounding failure', 'A claim its own retrieved evidence does not support.', BAD],
    ['Cross-agent contradiction', 'Two agents disagree and the pipeline proceeds regardless.', WARN],
    ['Tool-result fabrication', 'The agent describes a result the tool never returned.', BAD],
    ['Behavioural drift', 'Output distribution moves after a model or prompt change.', WARN],
  ];
  let x = M;
  items.forEach(([t, d, c]) => {
    card(s, x, 2.5, 2.85, 1.85, 'FFFFFF');
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.28, y: 2.75, w: 0.2, h: 0.2, fill: { color: c }, line: { width: 0 } });
    s.addText(t, { x: x + 0.28, y: 3.02, w: 2.35, h: 0.5, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
    s.addText(d, { x: x + 0.28, y: 3.52, w: 2.35, h: 0.75, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0 });
    x += 3.0;
  });

  card(s, M, 4.65, 11.9, 1.5, 'FFFFFF');
  s.addText('Why it matters', { x: M + 0.35, y: 4.85, w: 11.2, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
  s.addText('These faults are rare, so the standard practice of sampling a percentage of traffic for quality evaluation is structurally the wrong instrument: the sample is most likely to miss exactly the events worth catching. Anyone deploying agents in a regulated or high-consequence setting needs per-span evidence, not an aggregate.', {
    x: M + 0.35, y: 5.2, w: 11.2, h: 0.8, fontFace: B, fontSize: 12.5, color: MUTED, margin: 0,
  });
  s.addNotes('Keep this to ninety seconds. The one sentence that must land is the last one: rare faults plus sampled evaluation equals faults you never see. Everything in the architecture follows from that.');
}

/* 3 — Literature survey comparison table */
{
  const s = light();
  head(s, 'Literature survey', 'Comparison of prior work', false);
  tag(s, 'Lit. survey - comparison table', 9.1, 0.42);

  const rows = [
    ['Work, year', 'Method', 'Evaluated on', 'Metric', 'Limitation for this problem'],
    ['SummaC, 2022', 'NLI at sentence granularity', 'SummaC, 6 datasets', 'Bal. acc 74.4%', 'Summarisation only; single-document premise'],
    ['AlignScore, 2023', 'Unified alignment function', 'NLI + QA + fact verif.', 'Corr. with human', 'Needs a trained unified model; no drift notion'],
    ['RAGAS, 2023', 'Reference-free LLM judge', 'WikiEval', 'Faithfulness, relevance', 'Judge bias; cost scales with coverage'],
    ['ARES, 2023', 'Fine-tuned judges + PPI', 'KILT, SuperGLUE, AIS', 'Ctx / answer accuracy', 'Needs 50-500 human-labelled triples per domain'],
    ['MT-Bench, 2023', 'LLM-as-judge, pairwise', 'MT-Bench, Chatbot Arena', '>80% human agreement', 'Position, verbosity, self-enhancement bias'],
    ['Prometheus, 2023', 'Fine-grained evaluator LM', 'Feedback Collection', 'Corr. with GPT-4', 'Absolute scoring; verbosity bias untested'],
    ['No Free Labels, 2025', 'Judging without grounding', 'Multiple QA sets', 'Judge-human gap', 'Shows judges unreliable without human anchors'],
    ['DriftLens, 2024', 'Unsupervised embedding drift', 'Text stream benchmarks', 'Detection delay', 'Drift only; not tied to output correctness'],
    ['MAST, 2025', 'MAS failure taxonomy', '1600+ traces, 7 frameworks', 'kappa 0.88 / 0.77', 'Descriptive taxonomy; no runtime detector'],
  ];
  const xs = [M + 0.22, M + 2.05, M + 4.7, M + 7.2, M + 9.1];
  const ws = [1.85, 2.65, 2.5, 1.9, 2.8];
  let y = 1.48;
  rows.forEach((r, i) => {
    const isHead = i === 0;
    if (!isHead) card(s, M, y, 11.9, 0.54, i % 2 ? 'FFFFFF' : 'FAFBFD');
    r.forEach((c, j) => {
      s.addText(isHead ? c.toUpperCase() : c, {
        x: xs[j], y: isHead ? y : y + 0.14, w: ws[j], h: 0.3,
        fontFace: B, fontSize: isHead ? 8.5 : 9.8, bold: isHead || j === 0,
        charSpacing: isHead ? 1 : 0,
        color: isHead ? '7A8496' : MUTED, margin: 0,
      });
    });
    y += isHead ? 0.33 : 0.59;
  });

  card(s, M, 6.5, 11.9, 0.62, 'FFF4D6');
  s.addText('Ten of seventeen surveyed works shown; the full reference list is on the appendix slide. Read each one before defending this table - the panel may pick any row.', {
    x: M + 0.3, y: 6.65, w: 11.3, h: 0.35, fontFace: B, fontSize: 11, bold: true, color: '7A5A00', margin: 0,
  });
  s.addNotes('Nine of the seventeen surveyed works are from 2023 onward, which meets the checklist requirement. The limitation column is what motivates the gap on the next slide: consistency metrics assume a single-document premise, judge-based methods pay per evaluation, drift methods are not tied to correctness, and MAST describes multi-agent failures without detecting them at runtime. Read every paper on this slide before the review - a panel that finds you cannot discuss a row you cited will discount the whole survey.');
}

/* 4 — Gap and objectives */
{
  const s = dark();
  head(s, 'Research gap and objectives', 'What is missing, and what this project set out to do', true);

  card(s, M, 1.6, 5.85, 2.2);
  s.addText('The gap', { x: M + 0.35, y: 1.8, w: 5.2, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: CYAN, margin: 0 });
  s.addText('Existing agent-observability platforms record what happened and leave quality to sampled, LLM-judged evaluation. None combines full per-span evaluation with a dedicated behavioural drift signal at a cost that makes full coverage affordable on commodity CPU.', {
    x: M + 0.35, y: 2.2, w: 5.2, h: 1.45, fontFace: B, fontSize: 12, color: DIM, margin: 0,
  });

  card(s, 6.9, 1.6, 5.7, 2.2);
  s.addText('Why it matters', { x: 7.25, y: 1.8, w: 5.05, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: CYAN, margin: 0 });
  s.addText('Sampling is not a tuning choice here, it is a structural mismatch: the faults are rare, so the sample is biased against finding them. Cost is what forces sampling, so reducing evaluation cost is the enabling problem.', {
    x: 7.25, y: 2.2, w: 5.05, h: 1.45, fontFace: B, fontSize: 12, color: DIM, margin: 0,
  });

  s.addText('Objectives', { x: M, y: 4.0, w: 6, h: 0.34, fontFace: B, fontSize: 15, bold: true, color: INK, margin: 0 });
  const objs = [
    ['O1', 'Evaluate 100% of spans on CPU', 'Achieved - measured 12 spans/sec at 4 workers'],
    ['O2', 'Match a strong NLI baseline on grounding', 'Achieved - F1 0.963 on held-out v1.0_test'],
    ['O3', 'Detect sustained behavioural drift on real text', 'Achieved after rebuild - AUC 0.991, coverage 24.5%'],
    ['O4', 'Survive process failure without losing work', 'Achieved - exactly-once across 8,000 spans'],
    ['O5', 'Validate every signal against external data', 'Partly - 3 of 4 signals failed and are reported as such'],
  ];
  let y = 4.42;
  objs.forEach(([n, t, r]) => {
    s.addText(n, { x: M, y, w: 0.55, h: 0.3, fontFace: H, fontSize: 14, bold: true, color: CYAN, margin: 0 });
    s.addText(t, { x: M + 0.6, y, w: 5.0, h: 0.3, fontFace: B, fontSize: 12.5, bold: true, color: INK, margin: 0 });
    s.addText(r, { x: M + 5.7, y, w: 6.2, h: 0.3, fontFace: B, fontSize: 12, color: r.startsWith('Partly') ? WARN : OK, margin: 0 });
    y += 0.46;
  });
  s.addNotes('Five objectives, each with a measured outcome next to it rather than a claim. Be ready to defend O5: reporting that three of four signals failed external validation is a completed objective, not an incomplete one.');
}

/* 5 — Architecture */
{
  const s = light();
  head(s, 'Methodology', 'System architecture', false);
  tag(s, 'End-to-end system', 9.1, 0.42);

  const stages = [
    ['SDK', 'Decorator wraps agent steps.\nNon-blocking buffer.'],
    ['Ingest API', 'FastAPI. Accepts spans.\nLoads no models at all.'],
    ['Durable queue', 'SQLite WAL.\nLeased jobs, at-least-once.'],
    ['Worker fleet', 'Runs the evaluator cascade\noff the request path.'],
    ['Alerts + console', 'Rule engine, drift records,\noperator dashboard.'],
  ];
  let x = M;
  stages.forEach(([t, d], i) => {
    card(s, x, 1.65, 2.15, 1.75, 'FFFFFF');
    s.addText(t, { x: x + 0.2, y: 1.85, w: 1.8, h: 0.32, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
    s.addText(d, { x: x + 0.2, y: 2.22, w: 1.85, h: 1.0, fontFace: B, fontSize: 10.5, color: MUTED, margin: 0 });
    if (i < 4) s.addText('>', { x: x + 2.16, y: 2.3, w: 0.35, h: 0.35, align: 'center', fontFace: B, fontSize: 15, bold: true, color: 'B3BBC8', margin: 0 });
    x += 2.5;
  });

  card(s, M, 3.65, 5.85, 2.9, 'FFFFFF');
  s.addText('The evaluator cascade', { x: M + 0.35, y: 3.85, w: 5.2, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: DARKTEXT, margin: 0 });
  s.addText([
    { text: 'Stage 1 - MiniLM-L6-v2 cosine gate, 27.8 ms. Fast-accepts the confident cases.', options: { bullet: true, breakLine: true } },
    { text: 'Stage 2 - DeBERTa-v3 cross-encoder NLI, run only when the gate is uncertain.', options: { bullet: true, breakLine: true } },
    { text: 'Deterministic tool-claim regex and per-agent drift run alongside.', options: { bullet: true, breakLine: true } },
    { text: 'End-to-end cascade: 215.9 ms mean per span.', options: { bullet: true } },
  ], { x: M + 0.35, y: 4.25, w: 5.2, h: 2.1, fontFace: B, fontSize: 11.5, color: MUTED, paraSpaceAfter: 6, margin: 0 });

  card(s, 6.9, 3.65, 5.7, 2.9, 'FFFFFF');
  s.addText('Design justification', { x: 7.25, y: 3.85, w: 5.05, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: DARKTEXT, margin: 0 });
  s.addText([
    { text: 'Why a cascade and not NLI alone: the gate handles the common case at a seventh of the cost, and the ablation shows no F1 loss.', options: { bullet: true, breakLine: true } },
    { text: 'Why CPU and not GPU: removes the cost argument for sampling, and keeps deployment self-hosted with no data egress.', options: { bullet: true, breakLine: true } },
    { text: 'Why a queue and not inline evaluation: inline evaluation forces sampling at scale, which defeats the objective.', options: { bullet: true } },
  ], { x: 7.25, y: 4.25, w: 5.05, h: 2.1, fontFace: B, fontSize: 11.5, color: MUTED, paraSpaceAfter: 6, margin: 0 });
  s.addNotes('Be ready for "why this over alternatives" on every box. The three justifications on the right are the answers. The strongest is the last: if evaluation is inline you are forced back to sampling, and the whole premise collapses.');
}

/* 6 — Dataset and evaluation methodology */
{
  const s = dark();
  head(s, 'Evaluation methodology', 'Datasets, splits and metrics fixed before measuring', true);

  const ds = [
    ['v1.0_dev', '21', 'Threshold selection only'],
    ['v1.0_val', '22', 'Parameter selection, regression'],
    ['v1.0_test', '30', 'Held out for reporting'],
    ['v1.0_multiagent', '22', 'Inter-agent disagreement cases'],
    ['v1.0_curated', '76', 'Curated from live incidents'],
  ];
  s.addText('Versioned datasets', { x: M, y: 1.55, w: 5.5, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: CYAN, margin: 0 });
  let y = 1.98;
  ds.forEach(([n, c, p]) => {
    card(s, M, y, 5.85, 0.6);
    s.addText(n, { x: M + 0.3, y: y + 0.15, w: 2.0, h: 0.3, fontFace: B, fontSize: 12, bold: true, color: INK, margin: 0 });
    s.addText(c, { x: M + 2.3, y: y + 0.15, w: 0.6, h: 0.3, fontFace: H, fontSize: 13, bold: true, color: CYAN, margin: 0 });
    s.addText(p, { x: M + 3.0, y: y + 0.17, w: 2.7, h: 0.3, fontFace: B, fontSize: 10.5, color: DIM, margin: 0 });
    y += 0.7;
  });

  card(s, 6.9, 1.98, 5.7, 3.5);
  s.addText('Protocol', { x: 7.25, y: 2.18, w: 5.05, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: CYAN, margin: 0 });
  s.addText([
    { text: 'Metrics fixed upfront: precision, recall, F1, FPR, AUC, latency.', options: { bullet: true, breakLine: true } },
    { text: 'Thresholds selected on dev, applied unchanged to the held-out test split.', options: { bullet: true, breakLine: true } },
    { text: 'Drift calibration used a criterion fixed in advance, then measured once on 111 held-out tasks.', options: { bullet: true, breakLine: true } },
    { text: 'Labels: two independent LLM-as-judge passes, Cohen kappa 0.922 on the original 50 cases.', options: { bullet: true, breakLine: true } },
    { text: 'LLM-judge results split by label provenance, because scoring a judge against judge-made labels is circular.', options: { bullet: true } },
  ], { x: 7.25, y: 2.6, w: 5.05, h: 2.7, fontFace: B, fontSize: 11.5, color: DIM, paraSpaceAfter: 7, margin: 0 });

  s.addText('Labels are LLM-generated, not human-annotated. That is stated wherever the numbers are, and it is the single largest threat to validity in this work.', {
    x: M, y: 5.75, w: 11.9, h: 0.5, fontFace: B, fontSize: 12.5, italic: true, color: WARN, margin: 0,
  });
  s.addNotes('The last line is a deliberate concession. If a panel member raises label quality, you have already named it as the largest validity threat, and you can point to the kappa figure and the provenance split as the mitigations.');
}

/* 7 — Baseline comparison */
{
  const s = light();
  head(s, 'Results', 'Comparison against four baselines', false);
  tag(s, 'Baseline comparison', 9.1, 0.42);

  const rows = [
    ['System', 'Precision', 'Recall', 'F1', 'FPR', 'Latency'],
    ['A - No semantic check', '1.000', '0.125', '0.222', '0.000', '0 ms'],
    ['B - Sampled evaluation', '0.750', '0.750', '0.750', '0.167', '53.2 ms'],
    ['C - Embedding only', '0.833', '0.625', '0.714', '0.083', '15.1 ms'],
    ['D - NLI without drift', '0.889', '1.000', '0.941', '0.083', '72.6 ms'],
    ['AgentPulse full system', '0.727', '1.000', '0.842', '0.250', '101.5 ms'],
  ];
  const xs = [M + 0.3, M + 4.0, M + 5.6, M + 7.1, M + 8.5, M + 10.1];
  const ws = [3.6, 1.5, 1.4, 1.3, 1.5, 1.5];
  let y = 1.6;
  rows.forEach((r, i) => {
    const isHead = i === 0;
    const isFull = i === 5, isBest = i === 4;
    if (!isHead) card(s, M, y, 11.9, 0.66, isFull ? 'FFF0F2' : (isBest ? 'EAF7F1' : 'FFFFFF'));
    r.forEach((c, j) => {
      s.addText(isHead ? c.toUpperCase() : c, {
        x: xs[j], y: isHead ? y : y + 0.2, w: ws[j], h: 0.3,
        fontFace: B, fontSize: isHead ? 9.5 : 12.5, bold: isHead || j === 0 || isBest,
        charSpacing: isHead ? 1 : 0,
        color: isHead ? '7A8496' : (isFull ? '9B2C3A' : (isBest ? '15704F' : MUTED)), margin: 0,
      });
    });
    y += isHead ? 0.42 : 0.74;
  });

  card(s, M, 5.5, 11.9, 1.45, 'FFFFFF');
  s.addText('The full system is not the best row, and that is reported rather than hidden', {
    x: M + 0.35, y: 5.68, w: 11.2, h: 0.3, fontFace: B, fontSize: 13, bold: true, color: DARKTEXT, margin: 0,
  });
  s.addText('Folding the drift score into a per-claim composite risk adds noise to a claim-level classification task - drift is a per-agent behavioural signal, not evidence about a single statement. The ablation shows the same effect independently: configuration F, NLI plus drift, drops to F1 0.619. Note also that this comparison is dated 18 August, nine days before the drift detector was rebuilt, so it measures the superseded signal. Re-running it is listed in future work.', {
    x: M + 0.35, y: 6.02, w: 11.2, h: 0.8, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0,
  });
  s.addNotes('Do not skip past the red row. Volunteering that your full system underperforms an ablated variant, and giving the mechanism plus the date caveat, is far stronger than being caught at it. Expect a question here and welcome it.');
}

/* 8 — Ablation */
{
  const s = dark();
  head(s, 'Results', 'Ablation study - seven configurations', true);
  tag(s, 'Ablation completed', 9.1, 0.42);

  s.addChart(pres.ChartType.bar, [{
    name: 'F1',
    labels: ['A MiniLM', 'B DeBERTa', 'C Cascade', 'D + tool', 'E + disagree', 'F + drift', 'G Full'],
    values: [0.786, 0.963, 0.963, 0.963, 0.963, 0.619, 0.963],
  }], {
    x: M, y: 1.5, w: 7.4, h: 3.3,
    barDir: 'col', chartColors: ['3A4456', '2C3547', CYAN, '2C3547', '2C3547', BAD, CYAN],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10,
    dataLabelColor: INK, dataLabelFormatCode: '0.000',
    showLegend: false, valAxisMaxVal: 1.12, valAxisHidden: true,
    catAxisLabelColor: DIM, catAxisLabelFontSize: 10,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, barGapWidthPct: 45,
  });

  card(s, 8.35, 1.5, 4.25, 3.3);
  s.addText('What the ablation shows', { x: 8.7, y: 1.72, w: 3.6, h: 0.32, fontFace: B, fontSize: 13.5, bold: true, color: CYAN, margin: 0 });
  s.addText([
    { text: 'The cascade (C) matches NLI alone (B) at 0.963 while handling the common case at a fraction of the cost. That is the justification for the gate.', options: { bullet: true, breakLine: true } },
    { text: 'Tool-claim (D) and disagreement (E) change nothing - the single-agent test split cannot exercise either.', options: { bullet: true, breakLine: true } },
    { text: 'Drift (F) actively harms classification, 0.619.', options: { bullet: true } },
  ], { x: 8.7, y: 2.15, w: 3.6, h: 2.5, fontFace: B, fontSize: 11, color: DIM, paraSpaceAfter: 7, margin: 0 });

  card(s, M, 5.05, 11.9, 1.5, '1B2230');
  s.addText('Error analysis', { x: M + 0.35, y: 5.25, w: 11.2, h: 0.3, fontFace: B, fontSize: 13, bold: true, color: WARN, margin: 0 });
  s.addText('Configurations D and E producing identical numbers is itself the finding: the ablation could not test them, because a single-agent dataset structurally cannot exercise a cross-agent or tool-narration signal. That observation is what triggered the external validation on the next slide, and it is the reason those two signals ship as Experimental.', {
    x: M + 0.35, y: 5.6, w: 11.2, h: 0.8, fontFace: B, fontSize: 11.5, color: DIM, margin: 0,
  });
  s.addNotes('The panel will ask why four configurations report the same F1. The answer is the strongest methodological point in the deck: the test split could not exercise those components, and noticing that is what led to the external validation.');
}

/* 9 — Grounding + drift results */
{
  const s = light();
  head(s, 'Results', 'Grounding and drift', false);

  card(s, M, 1.55, 5.85, 2.35, 'FFFFFF');
  s.addText('Grounding', { x: M + 0.35, y: 1.75, w: 5.2, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
  s.addText('0.963', { x: M + 0.35, y: 2.1, w: 2.4, h: 0.65, fontFace: H, fontSize: 36, bold: true, color: '15704F', margin: 0 });
  s.addText('F1 on held-out v1.0_test', { x: M + 0.35, y: 2.78, w: 3.0, h: 0.3, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0 });
  s.addText('Precision 0.929, recall 1.000, FPR 0.059. Thresholds were selected on the dev split and applied unchanged.', {
    x: M + 0.35, y: 3.1, w: 5.2, h: 0.65, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0,
  });

  card(s, 6.9, 1.55, 5.7, 2.35, 'FFFFFF');
  s.addText('Drift, after the rebuild', { x: 7.25, y: 1.75, w: 5.05, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
  s.addText('0.991', { x: 7.25, y: 2.1, w: 2.4, h: 0.65, fontFace: H, fontSize: 36, bold: true, color: '15704F', margin: 0 });
  s.addText('AUC on 111 held-out tasks', { x: 7.25, y: 2.78, w: 3.2, h: 0.3, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0 });
  s.addText('False alarms 1.5%, detection 92%. Calibrated on 89 dev tasks with the criterion fixed beforehand.', {
    x: 7.25, y: 3.1, w: 5.05, h: 0.65, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0,
  });

  s.addText('The drift detector had to be rebuilt first', {
    x: M, y: 4.15, w: 11.9, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: DARKTEXT, margin: 0,
  });
  const steps = [
    ['Synthetic benchmark', 'Looked adequate. Measured centroid distance never exceeded 0.099 against a 0.30 threshold, so the signal had in fact never fired.'],
    ['Real agent text', 'The shipped metric fired on 91.7% of unchanged operation. A multi-step agent legitimately says something different at every step.'],
    ['Diagnosis and fix', 'The threshold was never the problem; the representation was. A baseline window mean against a current window mean, pooled and disjoint.'],
  ];
  let x = M;
  steps.forEach(([t, d], i) => {
    card(s, x, 4.55, 3.85, 1.55, 'FFFFFF');
    s.addText(`0${i + 1}`, { x: x + 0.28, y: 4.72, w: 0.6, h: 0.35, fontFace: H, fontSize: 16, bold: true, color: CYAN, margin: 0 });
    s.addText(t, { x: x + 0.85, y: 4.75, w: 2.8, h: 0.3, fontFace: B, fontSize: 12.5, bold: true, color: DARKTEXT, margin: 0 });
    s.addText(d, { x: x + 0.28, y: 5.15, w: 3.3, h: 0.85, fontFace: B, fontSize: 10.5, color: MUTED, margin: 0 });
    x += 4.03;
  });

  s.addText('Cost, stated with the accuracy every time: coverage is 24.5%. The metric is undefined until both windows fill, so roughly three quarters of sessions produce no drift verdict at all.', {
    x: M, y: 6.25, w: 11.9, h: 0.5, fontFace: B, fontSize: 12, italic: true, color: '9B6B00', margin: 0,
  });
  s.addNotes('Two validated signals with their held-out numbers, then the story of how drift got there. Always say the coverage figure in the same breath as the AUC - that pairing is the honesty discipline this project is built on.');
}

/* 10 — Engineering results */
{
  const s = dark();
  head(s, 'Results', 'Production behaviour, measured', true);
  tag(s, 'End-to-end demonstrated', 9.1, 0.42);

  const cells = [
    ['exactly once', 'Crash recovery', OK, 'SIGKILL mid-evaluation, 8,000 spans across 8 runs:\n0 lost, 0 retried, 0 duplicated, at every concurrency level'],
    ['12 spans/sec', 'Throughput, 4 workers', CYAN, '8 workers buys 8% more throughput for 86% more memory.\nPer-worker CPU falls monotonically - core saturation'],
    ['1.97x', 'ONNX over PyTorch', CYAN, 'Worst probability difference between backends 1.2e-08.\nIdentical output, roughly twice the speed'],
    ['1.24 to 0.10 GB', 'API memory footprint', OK, 'Models moved off the ingest process.\nTime-to-ready unchanged at about 1.5 s'],
  ];
  let x = M, y = 1.55;
  cells.forEach(([v, l, c, d], i) => {
    if (i === 2) { x = M; y = 4.15; }
    card(s, x, y, 5.85, 2.25);
    s.addText(v, { x: x + 0.35, y: y + 0.22, w: 5.2, h: 0.6, fontFace: H, fontSize: 26, bold: true, color: c, margin: 0 });
    s.addText(l, { x: x + 0.35, y: y + 0.85, w: 5.2, h: 0.3, fontFace: B, fontSize: 12.5, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: x + 0.35, y: y + 1.2, w: 5.2, h: 0.9, fontFace: B, fontSize: 11, color: DIM, margin: 0 });
    x += 6.05;
  });
  s.addNotes('Keep this brisk, ninety seconds. The framing sentence: every one of these was obtained by running the system, not by reasoning about the design. The durability figure in particular came from actually killing the process.');
}

/* 11 — Statistical rigor, honestly */
{
  const s = light();
  head(s, 'Statistical rigor', 'What the methodology does and does not establish', false);
  tag(s, 'Rigor - stated honestly', 9.1, 0.42);

  card(s, M, 1.55, 5.85, 4.3, 'FFFFFF');
  s.addText('What is in place', { x: M + 0.35, y: 1.78, w: 5.2, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: '15704F', margin: 0 });
  s.addText([
    { text: 'Held-out reporting: thresholds selected on dev, applied unchanged to test. Drift measured once on 111 unseen tasks.', options: { bullet: true, breakLine: true } },
    { text: 'Pre-registered criterion: the drift acceptance rule (FA <= 0.10, coverage >= 0.25) was fixed before the held-out measurement.', options: { bullet: true, breakLine: true } },
    { text: 'Inter-annotator agreement: Cohen kappa 0.922 on the original 50 labels, and 0.225 on a later attempt, which was reported as disqualifying.', options: { bullet: true, breakLine: true } },
    { text: 'Power analysis: the 370-row external benchmark was sized before running.', options: { bullet: true, breakLine: true } },
    { text: 'Seeds recorded for every sampling step, so selection is reproducible.', options: { bullet: true, breakLine: true } },
    { text: 'Confidence intervals reported where they change the conclusion - the extraction generalization result is reported as overlapping intervals, not as an improvement.', options: { bullet: true } },
  ], { x: M + 0.35, y: 2.2, w: 5.2, h: 3.5, fontFace: B, fontSize: 11, color: MUTED, paraSpaceAfter: 6, margin: 0 });

  card(s, 6.9, 1.55, 5.7, 4.3, 'FFFFFF');
  s.addText('What is not', { x: 7.25, y: 1.78, w: 5.05, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: '9B2C3A', margin: 0 });
  s.addText([
    { text: 'No multi-seed repetition of the grounding benchmark. The 0.963 figure is a single run on a 30-case split, so it carries no variance estimate.', options: { bullet: true, breakLine: true } },
    { text: 'No significance testing between the cascade and baseline D. Their difference is reported as observed, not as established.', options: { bullet: true, breakLine: true } },
    { text: 'Test splits are small - 20 to 30 cases. Adequate for direction, not for tight intervals.', options: { bullet: true, breakLine: true } },
    { text: 'Labels are LLM-generated. The kappa is between two model passes, not between human annotators.', options: { bullet: true } },
  ], { x: 7.25, y: 2.2, w: 5.05, h: 3.5, fontFace: B, fontSize: 11, color: MUTED, paraSpaceAfter: 7, margin: 0 });

  s.addText('The honest summary: the methodology is strong on held-out discipline and weak on repetition. Where a number lacks an interval, this deck says so rather than implying one.', {
    x: M, y: 6.05, w: 11.9, h: 0.5, fontFace: B, fontSize: 12.5, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes('This slide exists because the Final Review checklist asks for statistical rigor and the honest answer is mixed. Saying so directly is far safer than presenting a single-run F1 as though it were an established interval.');
}

/* 12 — External validation */
{
  const s = dark();
  head(s, 'Error analysis', 'Three signals met external data. Three broke.', true);
  tag(s, 'Failure cases discussed', 9.1, 0.42);

  const rows = [
    ['Drift', 'Threshold 0.30 appeared calibrated', '91.7% false alarms on real text', 'Diagnosed and rebuilt', OK],
    ['Tool-claim', 'F1 0.842 on 19 self-authored cases', '0 claims from 8,353 real prose spans', 'Redesign blocked on labelling', BAD],
    ['Disagreement', 'F1 0.960 on 22 self-authored cases', '0 of 10 contradictions detected', 'Open research question', BAD],
  ];
  const cx = [M + 0.3, M + 2.0, M + 5.5, M + 9.35];
  const cw = [1.6, 3.4, 3.7, 2.4];
  ['Signal', 'Internal benchmark', 'On external data', 'Status'].forEach((t, i) => {
    s.addText(t.toUpperCase(), { x: cx[i], y: 1.55, w: cw[i], h: 0.28, fontFace: B, fontSize: 9.5, bold: true, charSpacing: 1, color: FAINT, margin: 0 });
  });
  let y = 1.92;
  rows.forEach(([a, b2, c, d, col]) => {
    card(s, M, y, 11.9, 0.95);
    s.addText(a, { x: cx[0], y: y + 0.3, w: cw[0], h: 0.32, fontFace: B, fontSize: 14, bold: true, color: INK, margin: 0 });
    s.addText(b2, { x: cx[1], y: y + 0.32, w: cw[1], h: 0.32, fontFace: B, fontSize: 11.5, color: DIM, margin: 0 });
    s.addText(c, { x: cx[2], y: y + 0.32, w: cw[2], h: 0.32, fontFace: B, fontSize: 11.5, bold: true, color: col, margin: 0 });
    s.addText(d, { x: cx[3], y: y + 0.32, w: cw[3], h: 0.32, fontFace: B, fontSize: 11, color: DIM, margin: 0 });
    y += 1.08;
  });

  card(s, M, 5.3, 5.85, 1.6, '1B2230');
  s.addText('Why the benchmarks missed it', { x: M + 0.3, y: 5.48, w: 5.2, h: 0.3, fontFace: B, fontSize: 12.5, bold: true, color: WARN, margin: 0 });
  s.addText('Tool-claim looks for narrated tool use; modern harnesses put the tool name in a structured field. The 22 disagreement cases averaged ten words - minimal pairs of exactly the shape the NLI model was trained on.', {
    x: M + 0.3, y: 5.82, w: 5.3, h: 0.95, fontFace: B, fontSize: 10.5, color: DIM, margin: 0,
  });

  card(s, 6.9, 5.3, 5.7, 1.6, '1B2230');
  s.addText('The finding that outlives the failure', { x: 7.2, y: 5.48, w: 5.1, h: 0.3, fontFace: B, fontSize: 12.5, bold: true, color: CYAN, margin: 0 });
  s.addText('Agents holding different evidence can flatly contradict each other and both be correct. Six of forty labelled cases were exactly that. An entailment score over two strings cannot represent what each agent could see.', {
    x: 7.2, y: 5.82, w: 5.15, h: 0.95, fontFace: B, fontSize: 10.5, color: DIM, margin: 0,
  });
  s.addNotes('This is the most important slide in the deck. Three for three is not bad luck, it is a finding about how self-authored benchmarks get built. If you only get one technical point across in the viva, make it the evidence-partition problem on the right.');
}

/* 13 — Limitations */
{
  const s = light();
  head(s, 'Limitations', 'Stated before the panel has to find them', false);
  tag(s, 'Limitations - no overclaiming', 9.1, 0.42);

  const lim = [
    ['Drift coverage is 24.5%', 'Both windows must fill before the metric is defined, so about three quarters of sessions get no drift verdict.'],
    ['Two of four signals are unvalidated', 'Tool-claim and disagreement are labelled Experimental in the product and must not drive decisions.'],
    ['Test splits are small and singly run', 'Twenty to thirty cases, one run, LLM-generated labels. Adequate for direction, not for tight intervals.'],
    ['The full system underperforms an ablated variant', 'F1 0.842 against 0.941 for NLI without drift, on a comparison dated before the drift rebuild.'],
    ['Single shared API key, single tenant', 'No rotation and no tenancy. A deliberate scope boundary for self-hosted deployment, not an oversight.'],
    ['Datadog was never audited', 'It cannot be installed, so its column in the competitive matrix is the least reliable and is marked so.'],
  ];
  let y = 1.5;
  lim.forEach(([t, d]) => {
    card(s, M, y, 11.9, 0.82, 'FFFFFF');
    s.addShape(pres.ShapeType.ellipse, { x: M + 0.35, y: y + 0.33, w: 0.16, h: 0.16, fill: { color: WARN }, line: { width: 0 } });
    s.addText(t, { x: M + 0.72, y: y + 0.11, w: 10.7, h: 0.28, fontFace: B, fontSize: 13, bold: true, color: DARKTEXT, margin: 0 });
    s.addText(d, { x: M + 0.72, y: y + 0.42, w: 10.7, h: 0.3, fontFace: B, fontSize: 11, color: MUTED, margin: 0 });
    y += 0.93;
  });
  s.addText('The phrase "production ready" is deliberately absent from this project. It is binary and unfalsifiable; the claim made instead is specific and checkable.', {
    x: M, y: 7.0, w: 11.9, h: 0.35, fontFace: B, fontSize: 11.5, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes('Deliver calmly and without apology. Every line has a number or a reason behind it. Naming your own limits converts a likely attack into evidence of rigour.');
}

/* 14 — Contribution */
{
  const s = dark();
  head(s, 'Contribution', 'What is new, what is better, and by how much', true);
  tag(s, 'Contribution restated', 9.1, 0.42);

  const c = [
    ['A working full-coverage evaluator', 'Every span evaluated on commodity CPU at 12 spans/sec with exactly-once durability, rather than a sampled subset. Removes the cost argument that forces sampling.', CYAN],
    ['A drift signal that survives real text', 'Rebuilt after failing on external data. False alarms 91.7% to 1.5%, AUC 0.991 held out - with coverage 24.5% stated alongside.', OK],
    ['Three reported negative results', 'Tool-claim F1 0.000 and disagreement 0 of 10 on external traces, each with a mechanism rather than a mystery. Two published positioning claims were retracted after installing the competitors.', WARN],
    ['An open research question', 'Contradiction detection cannot separate a genuine fault from legitimate disagreement under distributed evidence. Independent of NLI quality or extraction method.', CYAN],
  ];
  let y = 1.5;
  c.forEach(([t, d, col], i) => {
    card(s, M, y, 11.9, 1.25);
    s.addText(`0${i + 1}`, { x: M + 0.35, y: y + 0.34, w: 0.7, h: 0.45, fontFace: H, fontSize: 20, bold: true, color: col, margin: 0 });
    s.addText(t, { x: M + 1.2, y: y + 0.22, w: 10.2, h: 0.32, fontFace: B, fontSize: 14, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: M + 1.2, y: y + 0.57, w: 10.3, h: 0.6, fontFace: B, fontSize: 11.5, color: DIM, margin: 0 });
    y += 1.37;
  });
  s.addNotes('Close the technical half here. The line to say out loud: anyone can demo a dashboard - what distinguishes this work is that it turned its instruments on itself and published what it found.');
}

/* 15 — Reproducibility and deliverables */
{
  const s = light();
  head(s, 'Deliverables', 'Repository, reproducibility and submission status', false);
  tag(s, 'Deliverables checklist', 9.1, 0.42);

  card(s, M, 1.5, 5.85, 3.0, 'FFFFFF');
  s.addText('Repository and reproducibility', { x: M + 0.35, y: 1.7, w: 5.2, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
  s.addText([
    { text: 'Git repository with full commit history and a README.', options: { bullet: true, breakLine: true } },
    { text: '209 of 209 backend tests passing (pytest tests/ -q).', options: { bullet: true, breakLine: true } },
    { text: 'Schema under Alembic, baselined and verified byte-identical across 43,941 rows.', options: { bullet: true, breakLine: true } },
    { text: 'Every reported figure has a JSON file under experiments/results/ and a matching write-up.', options: { bullet: true, breakLine: true } },
    { text: 'Docker compose and documented dev-server commands.', options: { bullet: true } },
  ], { x: M + 0.35, y: 2.1, w: 5.2, h: 2.3, fontFace: B, fontSize: 11, color: MUTED, paraSpaceAfter: 6, margin: 0 });

  card(s, 6.9, 1.5, 5.7, 3.0, 'FFFFFF');
  s.addText('Submission status', { x: 7.25, y: 1.7, w: 5.05, h: 0.3, fontFace: B, fontSize: 13.5, bold: true, color: DARKTEXT, margin: 0 });
  const st = [
    ['Working system, demoed live', 'Ready', OK],
    ['Code repository, documented', 'Ready', OK],
    ['Results and ablation', 'Ready', OK],
    ['Project report', 'Draft - PROJECT_REPORT', WARN],
    ['Literature survey', '17 works surveyed', OK],
    ['Plagiarism report', 'Outstanding', BAD],
    ['Paper submission', 'Outstanding', BAD],
  ];
  let y = 2.12;
  st.forEach(([t, v, c]) => {
    s.addText(t, { x: 7.25, y, w: 3.3, h: 0.28, fontFace: B, fontSize: 11.5, color: MUTED, margin: 0 });
    s.addText(v, { x: 10.6, y, w: 2.1, h: 0.28, fontFace: B, fontSize: 11.5, bold: true, color: c === OK ? '15704F' : (c === WARN ? '9B6B00' : '9B2C3A'), margin: 0 });
    y += 0.33;
  });

  card(s, M, 4.75, 11.9, 1.05, 'FFF4D6');
  s.addText('Three checklist items are genuinely outstanding and are listed here rather than glossed: the literature survey, the plagiarism report, and a paper submission. Timeline for each is on the next slide.', {
    x: M + 0.35, y: 5.0, w: 11.2, h: 0.6, fontFace: B, fontSize: 12, bold: true, color: '7A5A00', margin: 0,
  });

  s.addText('Ethical position: all evaluation runs locally with no data sent to third-party APIs. Datasets are public or synthetic. No PII is stored; payload capture is opt-in and off by default.', {
    x: M, y: 6.05, w: 11.9, h: 0.55, fontFace: B, fontSize: 12, color: MUTED, margin: 0,
  });
  s.addNotes('Do not hide the three outstanding items - the panel has the checklist in front of them and will notice. Listing them with a timeline reads as control; being caught reads as the opposite.');
}

/* 16 — Future work */
{
  const s = dark();
  head(s, 'Future work', 'Genuine next steps, in priority order', true);

  const fw = [
    ['1', 'Close the outstanding deliverables', 'Literature survey of 15-20 papers, plagiarism report, and a paper draft targeting an applied-ML or software-engineering venue.', 'Immediate'],
    ['2', 'Re-run the baseline comparison', 'The current comparison predates the drift rebuild by nine days, so it measures the superseded signal. Re-running it may change the headline row.', 'Short'],
    ['3', 'Repeat the benchmarks across seeds', 'Multiple runs with confidence intervals, and a larger held-out split, to convert single-run figures into interval estimates.', 'Short'],
    ['4', 'Represent evidence partitions', 'Give the disagreement detector access to what each agent could see, so legitimate disagreement can be separated from a genuine fault.', 'Research'],
    ['5', 'Re-pose the tool-claim task', 'Extract individual assertions and label each against the single tool result it refers to - the task shape that previously reached kappa 0.922.', 'Research'],
  ];
  let y = 1.5;
  fw.forEach(([n, t, d, h]) => {
    card(s, M, y, 11.9, 1.0);
    s.addText(n, { x: M + 0.35, y: y + 0.26, w: 0.5, h: 0.4, fontFace: H, fontSize: 18, bold: true, color: CYAN, margin: 0 });
    s.addText(t, { x: M + 0.95, y: y + 0.16, w: 8.3, h: 0.3, fontFace: B, fontSize: 13, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: M + 0.95, y: y + 0.48, w: 9.2, h: 0.42, fontFace: B, fontSize: 11, color: DIM, margin: 0 });
    s.addText(h, { x: M + 10.35, y: y + 0.32, w: 1.3, h: 0.3, align: 'right', fontFace: B, fontSize: 11, bold: true, color: h === 'Research' ? WARN : OK, margin: 0 });
    y += 1.1;
  });
  s.addText('Items 4 and 5 are research problems rather than engineering tasks, and are stated as such.', {
    x: M, y: 7.0, w: 11.9, h: 0.35, fontFace: B, fontSize: 11.5, italic: true, color: FAINT, margin: 0,
  });
  s.addNotes('The checklist asks that future work identify genuine next steps rather than filler. Items 1 to 3 are commitments with dates; items 4 and 5 are the open questions this project surfaced.');
}

/* 17 — References appendix */
{
  const s = light();
  head(s, 'Appendix', 'Full reference list - 17 works', false);

  const cols = [
    ['Factual consistency / NLI', [
      'Kryscinski et al., FactCC, 2019',
      'Durmus et al., FEQA, 2020',
      'Scialom et al., QuestEval, 2021',
      'Fabbri et al., QAFactEval, 2021',
      'Laban et al., SummaC, TACL 2022',
      'Zha et al., AlignScore, ACL 2023',
      'Gekhman et al., TrueTeacher, 2023',
    ]],
    ['RAG and judge-based evaluation', [
      'Es et al., RAGAS, EACL 2024 demo',
      'Saad-Falcon et al., ARES, 2023',
      'Zheng et al., MT-Bench / Chatbot Arena, NeurIPS 2023',
      'Kim et al., Prometheus, 2023',
      'Kim et al., Prometheus 2, 2024',
      'Gu et al., A Survey on LLM-as-a-Judge, 2024',
      'Li et al., From Generation to Judgment, 2024',
      'Ye et al., Justice or Prejudice, 2024',
      'Krumdick et al., No Free Labels, 2025',
    ]],
    ['Drift and multi-agent failure', [
      'Greco et al., DriftLens, 2024',
      'Cemri, Pan, Yang et al., MAST - Why Do Multi-Agent LLM Systems Fail, NeurIPS 2025',
    ]],
  ];
  let x = M;
  cols.forEach(([title, items], i) => {
    const w = i === 1 ? 4.6 : 3.5;
    card(s, x, 1.5, w, 5.0, 'FFFFFF');
    s.addText(title, { x: x + 0.28, y: 1.72, w: w - 0.5, h: 0.5, fontFace: B, fontSize: 12.5, bold: true, color: DARKTEXT, margin: 0 });
    s.addText(items.map((it, k) => ({ text: it, options: { bullet: true, breakLine: k < items.length - 1 } })), {
      x: x + 0.28, y: 2.3, w: w - 0.55, h: 4.0, fontFace: B, fontSize: 10, color: MUTED, paraSpaceAfter: 6, margin: 0,
    });
    x += w + 0.35;
  });
  s.addText('Nine of the seventeen are from 2023 onward. Full citations with venue and identifier belong in the report bibliography, not on this slide.', {
    x: M, y: 6.65, w: 11.9, h: 0.4, fontFace: B, fontSize: 11, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes('Appendix slide - do not present unless asked. Its purpose is to have the full list on hand if the panel asks what else was surveyed beyond the ten rows in the comparison table.');
}

/* 18 — Close */
{
  const s = dark();
  s.addShape(pres.ShapeType.ellipse, { x: -2.0, y: 4.0, w: 5.6, h: 5.6, fill: { color: CYAN, transparency: 93 }, line: { width: 0 } });
  s.addText('IN SUMMARY', { x: M, y: 1.5, w: 8, h: 0.3, fontFace: B, fontSize: 11.5, bold: true, charSpacing: 3, color: CYAN, margin: 0 });
  s.addText('An evaluation tool that was\nhonestly evaluated', {
    x: M, y: 1.95, w: 11.4, h: 1.7, fontFace: H, fontSize: 38, bold: true, color: INK, margin: 0,
  });
  s.addText([
    { text: 'A working system: every span evaluated on CPU with durable execution, migrations, retention and self-monitoring - each claim backed by a measurement.', options: { bullet: true, breakLine: true } },
    { text: 'One validated capability: drift, rebuilt after failing on real text, AUC 0.991 held out, with its 24.5% coverage stated alongside.', options: { bullet: true, breakLine: true } },
    { text: 'Three negative results with diagnoses rather than mysteries, and two positioning claims retracted after auditing competitors.', options: { bullet: true, breakLine: true } },
    { text: 'One open research question: contradiction detection under distributed evidence.', options: { bullet: true } },
  ], { x: M, y: 3.85, w: 11.3, h: 2.4, fontFace: B, fontSize: 13.5, color: DIM, paraSpaceAfter: 10, margin: 0 });
  s.addText('Thank you  -  questions', {
    x: M, y: 6.5, w: 7, h: 0.45, fontFace: H, fontSize: 19, bold: true, color: INK, margin: 0,
  });
  s.addNotes('Close on the fourth bullet, not the first. Then stop talking and take questions.');
}

pres.writeFile({ fileName: process.env.OUT || 'AgentPulse_Final_Review.pptx' }).then(f => console.log('written:', f));
