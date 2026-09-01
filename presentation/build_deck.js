const pptxgen = require('pptxgenjs');

// Palette taken from the product's own design system (index.css): obsidian
// surfaces, one cyan identity accent, and semantic state colours that are
// never used decoratively.
const OBSIDIAN = '0E1117';
const SURFACE  = '191F2A';
const CARD     = '222937';
const INK      = 'E8ECF5';
const DIM      = '9AA4BD';
const FAINT    = '6B7690';
const CYAN     = '22D3EE';
const OK       = '34D399';
const WARN     = 'FBBF24';
const BAD      = 'FB7185';
const LIGHT    = 'F4F6FA';
const DARKTEXT = '141922';

const H = 'Cambria';
const B = 'Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';           // 13.3 x 7.5
pres.author = 'Somnath Reddy';
pres.title = 'AgentPulse';

const W = 13.3, HT = 7.5, M = 0.7;

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: OBSIDIAN };
  return s;
}
function lightSlide() {
  const s = pres.addSlide();
  s.background = { color: LIGHT };
  return s;
}

// Section eyebrow + title, used on every content slide for rhythm.
function head(s, eyebrow, title, dark) {
  s.addText(eyebrow.toUpperCase(), {
    x: M, y: 0.42, w: 8, h: 0.26, fontFace: B, fontSize: 11, bold: true,
    charSpacing: 2, color: CYAN, margin: 0,
  });
  s.addText(title, {
    x: M, y: 0.72, w: W - M * 2, h: 0.75, fontFace: H, fontSize: 34, bold: true,
    color: dark ? INK : DARKTEXT, margin: 0,
  });
}

function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fill || CARD }, line: { color: fill || CARD, width: 0 },
  });
}

// Big measured number with a small label under it — the repeated motif.
function stat(s, x, y, w, value, label, color, sub) {
  s.addText(value, {
    x, y, w, h: 0.85, fontFace: H, fontSize: 40, bold: true,
    color: color, margin: 0,
  });
  s.addText(label, {
    x, y: y + 0.82, w, h: 0.3, fontFace: B, fontSize: 12, bold: true,
    color: INK, margin: 0,
  });
  if (sub) {
    s.addText(sub, {
      x, y: y + 1.12, w, h: 0.5, fontFace: B, fontSize: 10.5,
      color: DIM, margin: 0,
    });
  }
}

/* ─ 1 · Title ─────────────────────────────────────────────────────── */
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.3, y: -1.6, w: 5.6, h: 5.6,
    fill: { color: CYAN, transparency: 92 }, line: { width: 0 },
  });
  s.addText('AgentPulse', {
    x: M, y: 2.25, w: 9, h: 1.15, fontFace: H, fontSize: 60, bold: true,
    color: INK, margin: 0,
  });
  s.addText('Continuous grounding and drift observability for multi-agent LLM systems', {
    x: M, y: 3.45, w: 8.6, h: 0.9, fontFace: B, fontSize: 19, color: DIM, margin: 0,
  });
  s.addText('Every span evaluated on CPU. Never sampled.', {
    x: M, y: 4.35, w: 8.6, h: 0.4, fontFace: B, fontSize: 15, italic: true,
    color: CYAN, margin: 0,
  });
  s.addText('M.Tech Project  ·  Somnath Reddy', {
    x: M, y: 6.35, w: 7, h: 0.35, fontFace: B, fontSize: 13, color: FAINT, margin: 0,
  });
  s.addNotes('Open with the one-line claim: every span is evaluated, not sampled, and it runs on CPU inside your own infrastructure. Say up front that the most interesting part of this project is not what worked, but what failed external validation and what that taught.');
}

/* ─ 2 · Problem ───────────────────────────────────────────────────── */
{
  const s = lightSlide();
  head(s, 'The problem', 'Agents fail between the lines', false);

  const items = [
    ['An agent states a fact its retrieved evidence does not support.',
     'Grounding failure — the output reads fluent and is simply wrong.'],
    ['One agent contradicts another, and the pipeline continues.',
     'Nobody is checking consistency across a handoff.'],
    ['An agent describes a tool result that the tool never returned.',
     'The trace looks healthy; the claim inside it is fabricated.'],
    ['Behaviour drifts slowly after a model or prompt change.',
     'No single request looks broken, so no alert ever fires.'],
  ];
  let y = 1.85;
  items.forEach(([t, d], i) => {
    card(s, M, y, 11.9, 1.0, 'FFFFFF');
    s.addShape(pres.ShapeType.ellipse, {
      x: M + 0.35, y: y + 0.28, w: 0.44, h: 0.44,
      fill: { color: [BAD, WARN, BAD, WARN][i] }, line: { width: 0 },
    });
    s.addText(String(i + 1), {
      x: M + 0.35, y: y + 0.28, w: 0.44, h: 0.44, align: 'center',
      fontFace: B, fontSize: 12, bold: true, color: 'FFFFFF', margin: 0,
    });
    s.addText(t, {
      x: M + 1.05, y: y + 0.16, w: 10.5, h: 0.34,
      fontFace: B, fontSize: 15, bold: true, color: DARKTEXT, margin: 0,
    });
    s.addText(d, {
      x: M + 1.05, y: y + 0.52, w: 10.5, h: 0.34,
      fontFace: B, fontSize: 12.5, color: '5A6478', margin: 0,
    });
    y += 1.15;
  });

  s.addText('Sampled evaluation is built to miss exactly these — they are rare, and they are the ones that matter.', {
    x: M, y: 6.62, w: 11.9, h: 0.4, fontFace: B, fontSize: 13.5, italic: true,
    color: '5A6478', margin: 0,
  });
  s.addNotes('Four failure modes. Emphasise the last line: most tools sample a percentage of traffic for quality evaluation. These faults are rare by nature, so sampling is structurally the wrong tool for them. That is the gap AgentPulse targets.');
}

/* ─ 3 · Architecture ──────────────────────────────────────────────── */
{
  const s = darkSlide();
  head(s, 'How it works', 'Ingest is fast because evaluation is not inline', true);

  const stages = [
    ['SDK', 'Decorator wraps agent\nsteps, buffers spans', CYAN],
    ['Ingest API', 'Accepts spans, loads\nno models at all', CYAN],
    ['Durable queue', 'SQLite WAL with\nleased jobs', CYAN],
    ['Worker fleet', 'Runs the evaluator\ncascade off-path', OK],
    ['Alerts + UI', 'Rules, drift, and the\noperator console', OK],
  ];
  let x = M;
  stages.forEach(([t, d, c], i) => {
    card(s, x, 2.05, 2.15, 1.95);
    s.addText(t, {
      x: x + 0.18, y: 2.25, w: 1.8, h: 0.35, fontFace: B, fontSize: 14.5,
      bold: true, color: c, margin: 0,
    });
    s.addText(d, {
      x: x + 0.18, y: 2.68, w: 1.85, h: 1.1, fontFace: B, fontSize: 11,
      color: DIM, margin: 0,
    });
    if (i < 4) {
      s.addText('>', {
        x: x + 2.18, y: 2.75, w: 0.32, h: 0.4, align: 'center',
        fontFace: B, fontSize: 16, bold: true, color: FAINT, margin: 0,
      });
    }
    x += 2.5;
  });

  s.addText('Why the split matters', {
    x: M, y: 4.45, w: 11.9, h: 0.34, fontFace: B, fontSize: 15, bold: true,
    color: INK, margin: 0,
  });
  s.addText([
    { text: 'The API process loads no inference models, so ingest stays cheap and the memory cost sits with the workers instead — measured at 1.24 GB down to 0.10 GB per API process.', options: { bullet: true, breakLine: true } },
    { text: 'A worker killed mid-evaluation loses nothing: the lease expires and the job is picked up again, exactly once.', options: { bullet: true, breakLine: true } },
    { text: 'Workers scale independently of the API, which is what makes full coverage affordable instead of forcing sampling.', options: { bullet: true } },
  ], {
    x: M, y: 4.85, w: 11.9, h: 1.6, fontFace: B, fontSize: 13.5,
    color: DIM, paraSpaceAfter: 8, margin: 0,
  });
  s.addNotes('The architectural decision that makes the whole thesis possible. Because evaluation is decoupled, the ingest path stays sub-millisecond and you can afford to evaluate everything. If evaluation were inline you would be forced back to sampling, which defeats the purpose.');
}

/* ─ 4 · Cascade ───────────────────────────────────────────────────── */
{
  const s = lightSlide();
  head(s, 'The evaluator', 'A cheap gate in front of an expensive judge', false);

  card(s, M, 1.9, 5.7, 2.5, 'FFFFFF');
  s.addText('Stage 1  ·  MiniLM-L6-v2', {
    x: M + 0.35, y: 2.12, w: 5, h: 0.34, fontFace: B, fontSize: 15, bold: true,
    color: DARKTEXT, margin: 0,
  });
  s.addText('Cosine similarity between the claim and its retrieved context. Cheap enough to run on every span.', {
    x: M + 0.35, y: 2.52, w: 5, h: 0.75, fontFace: B, fontSize: 12.5, color: '5A6478', margin: 0,
  });
  s.addText('27.8 ms', {
    x: M + 0.35, y: 3.4, w: 3, h: 0.6, fontFace: H, fontSize: 30, bold: true,
    color: DARKTEXT, margin: 0,
  });

  card(s, 6.9, 1.9, 5.7, 2.5, 'FFFFFF');
  s.addText('Stage 2  ·  DeBERTa-v3 NLI', {
    x: 7.25, y: 2.12, w: 5, h: 0.34, fontFace: B, fontSize: 15, bold: true,
    color: DARKTEXT, margin: 0,
  });
  s.addText('Cross-encoder entailment, run only when the fast gate is not confident. Catches the subtle contradictions.', {
    x: 7.25, y: 2.52, w: 5, h: 0.75, fontFace: B, fontSize: 12.5, color: '5A6478', margin: 0,
  });
  s.addText('215.9 ms', {
    x: 7.25, y: 3.4, w: 3, h: 0.6, fontFace: H, fontSize: 30, bold: true,
    color: DARKTEXT, margin: 0,
  });
  s.addText('end-to-end cascade', {
    x: 9.05, y: 3.62, w: 2.4, h: 0.3, fontFace: B, fontSize: 11, color: '7A8496', margin: 0,
  });

  s.addText('Ablation on the held-out v1.0_test split — thresholds were selected on the dev split and applied unchanged', {
    x: M, y: 4.62, w: 11.9, h: 0.3, fontFace: B, fontSize: 12, italic: true,
    color: '5A6478', margin: 0,
  });

  s.addChart(pres.ChartType.bar, [{
    name: 'F1 score',
    labels: ['A · MiniLM only', 'B · DeBERTa only', 'C · Cascade', 'F · + drift signal', 'G · Full pipeline'],
    values: [0.786, 0.963, 0.963, 0.619, 0.963],
  }], {
    x: M, y: 4.95, w: 11.9, h: 2.05,
    barDir: 'col', chartColors: ['3A4456', '2C3547', CYAN, BAD, CYAN],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11,
    dataLabelColor: DARKTEXT, dataLabelFormatCode: '0.000',
    showLegend: false, valAxisMaxVal: 1.1, valAxisHidden: true,
    catAxisLabelColor: '5A6478', catAxisLabelFontSize: 11,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    barGapWidthPct: 55,
  });
  s.addNotes('Point out two things on the chart. The cascade matches DeBERTa alone at 0.963 while being cheaper on the common case, which is the whole justification for a gate. And config F is deliberately shown: adding the old drift signal made the classifier worse, 0.619, and that result was published rather than dropped.');
}

/* ─ 5 · Four signals ──────────────────────────────────────────────── */
{
  const s = darkSlide();
  head(s, 'Capabilities', 'Four signals, and an honest maturity label on each', true);

  const rows = [
    ['Grounding', 'Beta', OK, 'NLI cascade over retrieved premises. F1 0.963 on the held-out split.'],
    ['Drift / ASI', 'Beta', OK, 'Sustained embedding shift. Rebuilt after it failed on real text; now AUC 0.991.'],
    ['Disagreement', 'Experimental', WARN, 'Cross-agent contradiction. Strong internally, 0 of 10 on external traces.'],
    ['Tool-claim', 'Experimental', WARN, 'Deterministic claim matching. Extracts nothing from agents that do not narrate.'],
  ];
  let y = 1.95;
  rows.forEach(([name, tier, col, desc]) => {
    card(s, M, y, 11.9, 1.05);
    s.addText(name, {
      x: M + 0.4, y: y + 0.19, w: 2.6, h: 0.36, fontFace: B, fontSize: 16,
      bold: true, color: INK, margin: 0,
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: M + 3.05, y: y + 0.23, w: 1.5, h: 0.32, rectRadius: 0.14,
      fill: { color: col, transparency: 80 }, line: { color: col, width: 0.75 },
    });
    s.addText(tier, {
      x: M + 3.05, y: y + 0.23, w: 1.5, h: 0.32, align: 'center',
      fontFace: B, fontSize: 10.5, bold: true, color: col, margin: 0,
    });
    s.addText(desc, {
      x: M + 4.8, y: y + 0.24, w: 6.9, h: 0.6, fontFace: B, fontSize: 12.5,
      color: DIM, margin: 0,
    });
    y += 1.2;
  });

  s.addText('The maturity label is shown in the product itself, not only in the report.', {
    x: M, y: 6.75, w: 11.9, h: 0.35, fontFace: B, fontSize: 13, italic: true,
    color: CYAN, margin: 0,
  });
  s.addNotes('This slide is the thesis of the project in miniature. Two signals are validated, two are not, and the product says so on screen. Most tools in this space present every capability as equally ready. Stating the tier is a credibility move, not a weakness.');
}

/* ─ 6 · Drift story ───────────────────────────────────────────────── */
{
  const s = lightSlide();
  head(s, 'Result · drift', 'The detector that had to be rebuilt', false);

  card(s, M, 1.85, 5.7, 2.15, 'FFFFFF');
  s.addText('What the synthetic benchmark said', {
    x: M + 0.35, y: 2.05, w: 5, h: 0.32, fontFace: B, fontSize: 14, bold: true,
    color: DARKTEXT, margin: 0,
  });
  s.addText('Detection looked adequate. The measured centroid distance never exceeded 0.099 against a 0.30 threshold, so the signal that most distinguishes the product had in fact never fired.', {
    x: M + 0.35, y: 2.45, w: 5, h: 1.3, fontFace: B, fontSize: 12.5, color: '5A6478', margin: 0,
  });

  card(s, 6.9, 1.85, 5.7, 2.15, 'FFFFFF');
  s.addText('What real agent text said', {
    x: 7.25, y: 2.05, w: 5, h: 0.32, fontFace: B, fontSize: 14, bold: true,
    color: DARKTEXT, margin: 0,
  });
  s.addText('The shipped metric fired on 91.7% of unchanged operation. A multi-step agent legitimately says something different at every step, so the threshold sat inside ordinary variance.', {
    x: 7.25, y: 2.45, w: 5, h: 1.3, fontFace: B, fontSize: 12.5, color: '5A6478', margin: 0,
  });

  s.addText('The fix was the representation, not the threshold — a baseline window mean against a current window mean, pooled and disjoint.', {
    x: M, y: 4.2, w: 11.9, h: 0.35, fontFace: B, fontSize: 13.5, bold: true,
    color: DARKTEXT, margin: 0,
  });

  const st = [
    ['91.7% → 1.5%', 'False alarms', OK],
    ['0.9192', 'Detection rate', OK],
    ['0.991', 'AUC, held out', OK],
    ['24.5%', 'Coverage — the cost', WARN],
  ];
  let x = M;
  st.forEach(([v, l, c]) => {
    s.addText(v, {
      x, y: 4.75, w: 2.9, h: 0.62, fontFace: H, fontSize: 26, bold: true, color: c, margin: 0,
    });
    s.addText(l, {
      x, y: 5.38, w: 2.9, h: 0.3, fontFace: B, fontSize: 12, bold: true, color: DARKTEXT, margin: 0,
    });
    x += 3.0;
  });

  s.addText('Calibrated on 89 dev tasks with the criterion fixed beforehand, then measured once on 111 held-out tasks. When this detector speaks it is accurate; it stays silent on roughly three quarters of sessions, and that number is never quoted without the accuracy.', {
    x: M, y: 5.95, w: 11.9, h: 0.85, fontFace: B, fontSize: 12.5, italic: true,
    color: '5A6478', margin: 0,
  });
  s.addNotes('Tell this as a story. The synthetic benchmark gave a comfortable answer, real text destroyed it, and the diagnosis showed the threshold was never the problem. Then be explicit about the cost: coverage is only 24.5%. If a panel member asks about the weakness, they should find you already said it.');
}

/* ─ 7 · Engineering results ───────────────────────────────────────── */
{
  const s = darkSlide();
  head(s, 'Result · engineering', 'Production behaviour, measured rather than asserted', true);

  const cells = [
    ['exactly once', 'Crash recovery', OK, 'SIGKILL mid-evaluation across 8,000 spans:\n0 lost, 0 retried, 0 duplicated'],
    ['12 spans/s', 'Throughput at 4 workers', CYAN, '8 workers buys 8% more for 86% more\nmemory — 4 is the operating point'],
    ['1.97x', 'ONNX vs PyTorch', CYAN, 'Worst probability difference between\nbackends: 1.2e-08, i.e. identical'],
    ['1.24 > 0.10 GB', 'API memory footprint', OK, 'Models moved off the ingest process;\ntime-to-ready unchanged'],
  ];
  let x = M, y = 2.0;
  cells.forEach(([v, l, c, d], i) => {
    if (i === 2) { x = M; y = 4.35; }
    card(s, x, y, 5.85, 1.95);
    s.addText(v, {
      x: x + 0.35, y: y + 0.2, w: 5.2, h: 0.62, fontFace: H, fontSize: 27,
      bold: true, color: c, margin: 0,
    });
    s.addText(l, {
      x: x + 0.35, y: y + 0.8, w: 5.2, h: 0.3, fontFace: B, fontSize: 12.5,
      bold: true, color: INK, margin: 0,
    });
    s.addText(d, {
      x: x + 0.35, y: y + 1.12, w: 5.2, h: 0.72, fontFace: B, fontSize: 11.5,
      color: DIM, margin: 0,
    });
    x += 6.05;
  });
  s.addNotes('Keep this brisk — it is the engineering credibility slide. The phrase to land is that every one of these is a measurement with a method behind it, not a claim. The durability number in particular was taken by actually killing the process, not by reasoning about the design.');
}

/* ─ 8 · The three external checks ─────────────────────────────────── */
{
  const s = lightSlide();
  head(s, 'The turning point', 'Three signals met external data. Three broke.', false);

  const rows = [
    ['Drift', '0.30 threshold looked calibrated', '91.7% false alarms on real text', 'Diagnosed and rebuilt', OK],
    ['Tool-claim', 'F1 0.842 on its own 19 cases', '0 claims from 8,353 real prose spans', 'Redesign blocked on labelling', BAD],
    ['Disagreement', 'F1 0.960 on 22 authored cases', '0 of 10 contradictions detected', 'Open research question', BAD],
  ];

  const cx = [M + 0.35, M + 2.15, M + 5.6, M + 9.35];
  const cw = [1.7, 3.4, 3.7, 2.4];
  ['Signal', 'Internal benchmark', 'On external data', 'Where it stands'].forEach((t, i) => {
    s.addText(t.toUpperCase(), {
      x: cx[i], y: 1.85, w: cw[i], h: 0.3, fontFace: B, fontSize: 10.5, bold: true,
      charSpacing: 1, color: '7A8496', margin: 0,
    });
  });

  let y = 2.25;
  rows.forEach(([a, b2, c, d, col]) => {
    card(s, M, y, 11.9, 1.1, 'FFFFFF');
    s.addText(a, { x: cx[0], y: y + 0.36, w: cw[0], h: 0.36, fontFace: B, fontSize: 15, bold: true, color: DARKTEXT, margin: 0 });
    s.addText(b2, { x: cx[1], y: y + 0.38, w: cw[1], h: 0.36, fontFace: B, fontSize: 12.5, color: '5A6478', margin: 0 });
    s.addText(c, { x: cx[2], y: y + 0.38, w: cw[2], h: 0.36, fontFace: B, fontSize: 12.5, bold: true, color: col, margin: 0 });
    s.addText(d, { x: cx[3], y: y + 0.38, w: cw[3], h: 0.36, fontFace: B, fontSize: 12, color: '5A6478', margin: 0 });
    y += 1.25;
  });

  card(s, M, 6.05, 11.9, 0.95, '1B2230');
  s.addText('Every internal benchmark that has been checked against external data has broken or narrowed. That is a finding about benchmark design, not bad luck.', {
    x: M + 0.4, y: 6.28, w: 11.1, h: 0.5, fontFace: B, fontSize: 14, bold: true,
    color: INK, margin: 0,
  });
  s.addNotes('This is the slide the whole talk builds to. Do not rush it. Three for three is not coincidence — it says something about how self-authored benchmarks are constructed. Pause after reading the bottom line and let the panel sit with it.');
}

/* ─ 9 · Why they failed ───────────────────────────────────────────── */
{
  const s = darkSlide();
  head(s, 'Diagnosis', 'The benchmarks measured the wrong shape', true);

  card(s, M, 1.95, 5.85, 2.35);
  s.addText('Tool-claim', {
    x: M + 0.35, y: 2.15, w: 5.2, h: 0.34, fontFace: B, fontSize: 16, bold: true, color: WARN, margin: 0,
  });
  s.addText('The extractor looks for an agent narrating "I used the X tool". Modern harnesses never narrate it — the tool name lives in a structured tool_call field the validator never reads. Expanding the regex cannot fix this; the information is not in the text.', {
    x: M + 0.35, y: 2.58, w: 5.2, h: 1.55, fontFace: B, fontSize: 12.5, color: DIM, margin: 0,
  });

  card(s, 6.9, 1.95, 5.85, 2.35);
  s.addText('Disagreement', {
    x: 7.25, y: 2.15, w: 5.2, h: 0.34, fontFace: B, fontSize: 16, bold: true, color: WARN, margin: 0,
  });
  s.addText('The 22 internal cases averaged ten words each — minimal pairs of exactly the shape the NLI model was trained on. Real debate turns run 2,000+ characters of hedged discourse. The benchmark handed the detector pre-extracted claims, so the missing extraction stage was invisible.', {
    x: 7.25, y: 2.58, w: 5.2, h: 1.55, fontFace: B, fontSize: 12.5, color: DIM, margin: 0,
  });

  card(s, M, 4.55, 11.9, 2.15, '1B2230');
  s.addText('The finding that outlives the failure', {
    x: M + 0.4, y: 4.78, w: 11.1, h: 0.34, fontFace: B, fontSize: 15, bold: true, color: CYAN, margin: 0,
  });
  s.addText('Real multi-agent systems distribute evidence across agents. Two agents can flatly contradict each other and both be correct about their own partition of the evidence. Six of forty labelled cases were exactly this. An NLI score compares two strings and has no representation of what each agent could see — so it cannot separate a genuine fault from legitimate disagreement under partial evidence. That gap widens as context distribution increases, which is precisely the regime this project targets.', {
    x: M + 0.4, y: 5.18, w: 11.1, h: 1.35, fontFace: B, fontSize: 12.5, color: DIM, margin: 0,
  });
  s.addNotes('If you only have time for one technical point in the viva, make it the evidence-partition problem. It is a genuine research observation, it is independent of NLI quality or extraction method, and it reframes a failed feature as a well-posed open question.');
}

/* ─ 10 · Method ───────────────────────────────────────────────────── */
{
  const s = lightSlide();
  head(s, 'Method', 'The discipline that made those findings possible', false);

  const rules = [
    ['Benchmark before fixing', 'The disagreement engine was measured against completely unmodified code first. Fixing first and measuring after produces a self-fulfilling score.'],
    ['Report the contradiction', 'The relevance gate measured worse than baseline in isolation, F1 0.762 against 0.800. Only the combination paid off. Had it shipped alone, the benchmark would have read as a failure — and that was published.'],
    ['Separate the label from the judge', 'Scoring an LLM judge against LLM-produced labels is circular, so results were split by label provenance. On the deterministic subset both systems tie at 1.000; the judge\'s entire advantage sits inside the circular subset.'],
    ['Install the competitor, do not read its marketing', 'Two positioning claims were refuted by actually running Phoenix and MLflow. Both ship tool-call verification, so that differentiator is finished.'],
  ];
  let y = 1.85;
  rules.forEach(([t, d], i) => {
    card(s, M, y, 11.9, 1.2, 'FFFFFF');
    s.addText(String(i + 1).padStart(2, '0'), {
      x: M + 0.35, y: y + 0.32, w: 0.6, h: 0.5, fontFace: H, fontSize: 22, bold: true,
      color: CYAN, margin: 0,
    });
    s.addText(t, {
      x: M + 1.1, y: y + 0.2, w: 10.4, h: 0.32, fontFace: B, fontSize: 14.5, bold: true,
      color: DARKTEXT, margin: 0,
    });
    s.addText(d, {
      x: M + 1.1, y: y + 0.54, w: 10.4, h: 0.6, fontFace: B, fontSize: 12, color: '5A6478', margin: 0,
    });
    y += 1.32;
  });
  s.addNotes('Frame these as transferable method, not project trivia. A panel can attack a result; it is much harder to attack a method that deliberately arranged to be proven wrong. Rule two is the strongest — an inconvenient intermediate result was published rather than buried.');
}

/* ─ 11 · Where it stands ──────────────────────────────────────────── */
{
  const s = darkSlide();
  head(s, 'Current state', 'What is real today', true);

  const left = [
    ['209 / 209', 'Backend tests passing', OK],
    ['20,700+', 'Spans ingested and stored', CYAN],
    ['5', 'Versioned evaluation datasets', CYAN],
  ];
  let y = 2.0;
  left.forEach(([v, l, c]) => {
    s.addText(v, { x: M, y, w: 3.4, h: 0.6, fontFace: H, fontSize: 28, bold: true, color: c, margin: 0 });
    s.addText(l, { x: M, y: y + 0.58, w: 3.4, h: 0.3, fontFace: B, fontSize: 12, color: DIM, margin: 0 });
    y += 1.15;
  });

  card(s, 4.7, 1.9, 7.9, 4.3);
  s.addText('Shipped and verified', {
    x: 5.05, y: 2.1, w: 7.2, h: 0.34, fontFace: B, fontSize: 15, bold: true, color: INK, margin: 0,
  });
  s.addText([
    { text: 'Schema under Alembic, with a baseline verified byte-identical across 43,941 rows.', options: { bullet: true, breakLine: true } },
    { text: 'Durable leased queue with exactly-once recovery, proven by killing the process.', options: { bullet: true, breakLine: true } },
    { text: 'Retention that actually deletes — 43,000 rows purged with zero orphaned records.', options: { bullet: true, breakLine: true } },
    { text: 'Self-monitoring: the platform reports its own evaluator fleet, queue depth and readiness.', options: { bullet: true, breakLine: true } },
    { text: 'Operator console reading live endpoints, with unavailable data shown as unavailable.', options: { bullet: true, breakLine: true } },
    { text: 'Drift baselines that survive a worker restart, so alerting is not blind after one.', options: { bullet: true } },
  ], {
    x: 5.05, y: 2.55, w: 7.2, h: 3.4, fontFace: B, fontSize: 12.5, color: DIM,
    paraSpaceAfter: 9, margin: 0,
  });

  s.addText('Deferred deliberately, with stated reasons: multi-tenancy, key rotation, backup and restore, Postgres, OTLP.', {
    x: M, y: 6.5, w: 11.9, h: 0.4, fontFace: B, fontSize: 12.5, italic: true, color: FAINT, margin: 0,
  });
  s.addNotes('If asked why the phrase "production ready" never appears anywhere in this project: it is binary and unfalsifiable. The claim made instead is specific and checkable — self-hosted, single-tenant, durable evaluation at a measured rate with honest capability tiers.');
}

/* ─ 12 · Limitations ──────────────────────────────────────────────── */
{
  const s = lightSlide();
  head(s, 'Limitations', 'Stated, because a panel will find them anyway', false);

  const lim = [
    ['Drift coverage is 24.5%', 'The windowed metric needs both windows filled, so roughly three quarters of sessions produce no drift verdict at all.'],
    ['Two of four signals are unvalidated', 'Tool-claim and disagreement are labelled Experimental in the product and should not be relied on for decisions.'],
    ['Single shared API key', 'No rotation, no tenancy. A deliberate choice for a self-hosted single-tenant deployment, not an oversight.'],
    ['Evaluation coverage is currently ~6%', 'Most stored spans predate the worker and were never enqueued. The mechanism is sound; the backlog is not processed.'],
    ['Datadog was never audited', 'It cannot be installed, so its column in the competitive matrix is the least reliable and is marked as such.'],
  ];
  let y = 1.8;
  lim.forEach(([t, d]) => {
    card(s, M, y, 11.9, 0.98, 'FFFFFF');
    s.addShape(pres.ShapeType.ellipse, {
      x: M + 0.4, y: y + 0.4, w: 0.18, h: 0.18, fill: { color: WARN }, line: { width: 0 },
    });
    s.addText(t, {
      x: M + 0.8, y: y + 0.15, w: 10.6, h: 0.32, fontFace: B, fontSize: 14, bold: true,
      color: DARKTEXT, margin: 0,
    });
    s.addText(d, {
      x: M + 0.8, y: y + 0.5, w: 10.6, h: 0.36, fontFace: B, fontSize: 12, color: '5A6478', margin: 0,
    });
    y += 1.1;
  });
  s.addNotes('Deliver this slide calmly and without apology. Naming your own limits before the panel does converts a potential attack into evidence of rigour. Each line here has a number or a reason behind it.');
}

/* ─ 13 · Close ────────────────────────────────────────────────────── */
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: -1.9, y: 4.2, w: 5.4, h: 5.4,
    fill: { color: CYAN, transparency: 93 }, line: { width: 0 },
  });
  s.addText('The contribution', {
    x: M, y: 1.55, w: 11.9, h: 0.4, fontFace: B, fontSize: 12, bold: true,
    charSpacing: 2, color: CYAN, margin: 0,
  });
  s.addText('An evaluation tool that was honestly evaluated', {
    x: M, y: 2.0, w: 11.4, h: 1.5, fontFace: H, fontSize: 42, bold: true,
    color: INK, margin: 0,
  });
  s.addText([
    { text: 'A working system: every span evaluated on CPU, with durable execution, retention, migrations and self-monitoring — each claim backed by a measurement.', options: { bullet: true, breakLine: true } },
    { text: 'A validated capability: drift, rebuilt after failing on real text and now measured at AUC 0.991 on a held-out split, with its 24.5% coverage stated alongside.', options: { bullet: true, breakLine: true } },
    { text: 'A negative result worth reporting: three self-authored benchmarks that did not survive external data, each with a diagnosis of why.', options: { bullet: true, breakLine: true } },
    { text: 'An open research question: contradiction detection cannot separate genuine faults from legitimate disagreement under distributed evidence.', options: { bullet: true } },
  ], {
    x: M, y: 3.6, w: 11.4, h: 2.6, fontFace: B, fontSize: 14, color: DIM,
    paraSpaceAfter: 11, margin: 0,
  });
  s.addText('Thank you', {
    x: M, y: 6.5, w: 6, h: 0.5, fontFace: H, fontSize: 20, bold: true, color: INK, margin: 0,
  });
  s.addNotes('Close on the fourth bullet, not the first. Anyone can demo a dashboard. What distinguishes this project is that it turned its instruments on itself, published what it found, and ended with a sharper question than it started with.');
}

pres.writeFile({ fileName: 'AgentPulse.pptx' }).then(f => console.log('written:', f));
