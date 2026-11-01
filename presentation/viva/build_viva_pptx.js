/*
 * Builds presentation/viva/AgentPulse_Viva.pptx: the PowerPoint twin of AgentPulse_Viva.html.
 * Same slides, same order, same numbers. The speaker notes are read from the HTML deck's
 * <aside class="notes"> blocks, so the two decks cannot drift apart on notes or sources.
 *
 * Run (pptxgenjs must be resolvable; APPLY_THEME points at the pptx skill's apply_theme.js):
 *   NODE_PATH=<dir with node_modules> APPLY_THEME=<path>/apply_theme.js node presentation/viva/build_viva_pptx.js
 *
 * In short: a theme (colours + fonts), two layouts (title, content), then one block per slide.
 */
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const HERE = __dirname;
const OUT = path.join(HERE, 'AgentPulse_Viva.pptx');
const A = (f) => path.join(HERE, 'assets', f);

// In short: the palette of the live site's Dark + Obsidian look (same as the HTML :root).
// dk1/lt1 are swapped on purpose: this is a dark deck, so "text 1" is the light ink.
const THEME = {
  name: 'AgentPulse Viva',
  headFontFace: 'Calibri',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: 'F5F5F7', lt1: '06070A', dk2: 'A3ACBB', lt2: '0D1117',
    accent1: '3DDC97', accent2: 'F5B841', accent3: 'F25C7A', accent4: '4C8DFF',
    accent5: '6F7A8C', accent6: '161D29', hlink: '3DDC97', folHlink: '4C8DFF',
  },
};
const MONO = 'Consolas';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.author = 'Somnath Reddy';
pres.title = 'AgentPulse — M.Tech final review';
pres.subject = 'Grounding and drift monitoring for multi-agent LLM pipelines';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const INK = C.text1, MUTED = C.text2, BG = C.background1, SURF = C.background2;
const MINT = C.accent1, AMBER = C.accent2, ROSE = C.accent3, BLUE = C.accent4, FAINT = C.accent5, SURF2 = C.accent6;

const M = 0.83, W = 13.333, CW = W - 2 * M;

// ---------- notes from the HTML deck ----------
// In short: pull every <aside class="notes"> in order and decode the few entities used.
const html = fs.readFileSync(path.join(HERE, 'AgentPulse_Viva.html'), 'utf8');
const NOTES = [...html.matchAll(/<aside class="notes">([\s\S]*?)<\/aside>/g)].map((m) =>
  m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim());

// ---------- layouts ----------
pres.defineSlideMaster({
  title: 'TITLE',
  background: { path: A('pptx_background.png') },
  objects: [],
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { path: A('pptx_background.png') },
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: M, y: 0.52, w: 9.5, h: 0.34, fontFace: MONO, fontSize: 13, color: MINT, charSpacing: 3, margin: 0, valign: 'middle' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.9, w: CW, h: 0.8, fontSize: 36, bold: true, color: INK, margin: 0, valign: 'middle' }, text: '' } },
  ],
  slideNumber: { x: 12.35, y: 7.08, w: 0.6, h: 0.25, fontFace: MONO, fontSize: 9, color: FAINT, align: 'right' },
});

// ---------- helpers ----------
let n = 0;
function slide(master, section) {
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  s.addNotes(NOTES[n] || '');
  n += 1;
  return s;
}
function head(s, kicker, titleRuns, kickerColor) {
  s.addText(kicker.toUpperCase(), { placeholder: 'kicker', color: kickerColor || MINT });
  s.addText(titleRuns, { placeholder: 'title' });
}
// Title with an italic accent phrase, like the HTML <em>.
function tRuns(before, accent, after) {
  const r = [{ text: before }];
  if (accent) r.push({ text: accent, options: { italic: true, color: MINT, bold: false } });
  if (after) r.push({ text: after });
  return r;
}
function text(s, t, x, y, w, h, o = {}) {
  s.addText(t, { x, y, w, h, isTextBox: true, margin: 0, fontSize: 15, color: MUTED, valign: 'top', ...o });
}
function card(s, x, y, w, h, o = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: o.fill || SURF, transparency: o.transparency ?? 0 },
    line: { color: o.line || FAINT, width: 0.75, transparency: o.lineT ?? 55 }, objectName: o.name || 'card',
  });
}
function label(s, t, x, y, w, color) {
  text(s, t.toUpperCase(), x, y, w, 0.25, { fontFace: MONO, fontSize: 10, color: color || FAINT, charSpacing: 2 });
}
function stat(s, num, cap, x, y, w, h, color, numSize) {
  card(s, x, y, w, h);
  text(s, num, x + 0.22, y + 0.18, w - 0.44, 0.62, { fontFace: MONO, fontSize: numSize || 30, bold: true, color: color || INK, valign: 'middle' });
  text(s, cap, x + 0.22, y + 0.84, w - 0.44, h - 0.95, { fontSize: 13 });
}
function source(s, t) {
  s.addShape(pres.shapes.LINE, { x: M, y: 6.72, w: CW, h: 0, line: { color: FAINT, width: 0.5, transparency: 60 } });
  text(s, t, M, 6.8, CW - 0.6, 0.45, { fontFace: MONO, fontSize: 9, color: FAINT });
}
function arrow(s, x1, y1, x2, color) {
  s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: 0, line: { color: color || FAINT, width: 1.5, endArrowType: 'triangle' } });
}
function shot(s, file, x, y, w, h) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, rectRadius: 0.1, fill: { color: SURF2 }, line: { color: BLUE, width: 0.75, transparency: 50 } });
  s.addImage({ path: A(file), x, y, w, h, sizing: { type: 'cover', w, h }, altText: file });
}

// =================== TALK ===================
pres.addSection({ title: 'Talk' });

// 01 Title
{
  const s = slide('TITLE', 'Talk');
  text(s, 'M.TECH (AIML) · FINAL REVIEW · 3 NOV 2026', M, 0.95, 6, 0.3, { fontFace: MONO, fontSize: 13, color: MINT, charSpacing: 3 });
  s.addText([{ text: 'Agent', options: { color: INK } }, { text: 'Pulse', options: { color: MINT } }],
    { x: M, y: 1.4, w: 6.2, h: 1.3, isTextBox: true, margin: 0, fontSize: 72, bold: true, fontFace: 'Calibri' });
  text(s, 'Self-hosted observability for multi-agent LLM pipelines. Every span is scored for grounding risk and drift by two small local models — no LLM judge.',
    M, 2.85, 5.6, 1.6, { fontSize: 20 });
  shot(s, 'live_overview.jpg', 6.75, 1.3, 5.75, 2.655);
  text(s, 'The live console, Overview (screenshot 1 Nov 2026)', 6.75, 4.05, 5.75, 0.3, { fontFace: MONO, fontSize: 10, color: FAINT, align: 'right' });
  text(s, 'Somnath Reddy', M, 5.55, 6, 0.45, { fontSize: 22, bold: true, color: INK });
  text(s, 'agentpulse.centralindia.cloudapp.azure.com\ngithub.com/Soum-Code/agentpulse', M, 6.05, 7, 0.6, { fontFace: MONO, fontSize: 12, color: MUTED });
}

// 02 Problem
{
  const s = slide('CONTENT', 'Talk');
  head(s, '01 · The problem', tRuns('Multi-agent pipelines fail ', 'silently'));
  const nodes = [['AGENT 1', 'Retriever', '200 OK', false], ['AGENT 2', 'Verifier', 'claim not in evidence', true], ['AGENT 3', 'Answerer', 'builds on it', true]];
  nodes.forEach(([l, nm, st, bad], i) => {
    const x = M + i * 3.0;
    card(s, x, 2.05, 2.45, 1.3, { line: bad ? ROSE : FAINT, lineT: bad ? 20 : 55 });
    label(s, l, x + 0.2, 2.18, 2.0);
    text(s, nm, x + 0.2, 2.45, 2.1, 0.4, { fontSize: 20, bold: true, color: INK });
    text(s, st, x + 0.2, 2.9, 2.1, 0.3, { fontFace: MONO, fontSize: 11, color: bad ? ROSE : MINT });
    if (i < 2) arrow(s, x + 2.48, 2.7, x + 2.97, i === 1 ? ROSE : FAINT);
  });
  text(s, 'every call: 200 OK\nno exception\nlatency normal', 9.95, 2.2, 2.6, 1.0, { fontFace: MONO, fontSize: 13, color: MINT });
  const cards = [['Grounding failure', ROSE, 'An agent states something its own evidence does not support, and the next agent builds on it.'],
    ['Behavioural drift', AMBER, "An agent's answers move away from how it used to answer, after a model or prompt change. Nothing errors."],
    ['Quality is an add-on', BLUE, 'Existing tools trace tokens, latency and cost well, but treat quality evaluation as optional and sampled.']];
  const cw = (CW - 0.6) / 3;
  cards.forEach(([h, col, p], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 3.85, cw, 2.45);
    text(s, h, x + 0.25, 4.05, cw - 0.5, 0.45, { fontSize: 20, bold: true, color: col });
    text(s, p, x + 0.25, 4.6, cw - 0.5, 1.6, { fontSize: 15 });
  });
  source(s, 'Goal of this project: score every span, cheaply enough for a CPU, and show plainly what was not measured. Framing from README.md (intro paragraph).');
}

// 03 Architecture
{
  const s = slide('CONTENT', 'Talk');
  head(s, '02 · What AgentPulse is', tRuns('Score every span, ', 'locally'));
  const boxes = [['YOUR PROCESS', 'SDK', 'Decorator, OpenAI / Anthropic wrapper, LangGraph adapter.', 'bounded buffer,\nfail-open'],
    ['FASTAPI', 'Ingest API', 'Accepts and queues. Runs no model.', 'POST /v1/ingest'],
    ['STORAGE', 'SQLite (WAL)', 'Spans plus a durable job queue the worker leases from.', 'at-least-once'],
    ['WORKER · CPU', 'Evaluator', 'MiniLM-L6-v2 embeddings + DeBERTa-v3-small NLI.', 'grounding · drift'],
    ['RULES', 'Alerts', 'Thresholds per signal; one alert per agent and type in 15 min.', 'cooldown 900 s'],
    ['REACT 19', 'Console', 'REST + WebSocket. Traces, incidents, drift, Lab.', 'unmeasured = "—"']];
  const g = 0.24, bw = (CW - 5 * g) / 6;
  boxes.forEach(([l, h, p, c], i) => {
    const x = M + i * (bw + g);
    const hl = i === 3;
    card(s, x, 1.95, bw, 2.6, { line: hl ? MINT : FAINT, lineT: hl ? 30 : 55 });
    label(s, l, x + 0.14, 2.08, bw - 0.2);
    text(s, h, x + 0.14, 2.35, bw - 0.26, 0.4, { fontSize: 16, bold: true, color: INK });
    text(s, p, x + 0.14, 2.8, bw - 0.24, 1.1, { fontSize: 12 });
    text(s, c, x + 0.14, 3.95, bw - 0.24, 0.5, { fontFace: MONO, fontSize: 10, color: MINT });
    if (i < 5) text(s, '→', x + bw - 0.02, 3.05, g + 0.04, 0.35, { fontSize: 16, color: MINT, align: 'center', bold: true });
  });
  const tw = (CW - 0.5) / 3;
  stat(s, '202.94 ms', 'median per case, AgentPulse evaluator, vs 3,170.39 ms for an LLM judge (Qwen3-8B, CPU), 30 cases', M, 4.8, tw, 1.65, MINT, 26);
  stat(s, '0.005 ms', 'SDK decorator overhead per call (P50 over 2,000 calls)', M + tw + 0.25, 4.8, tw, 1.65, MINT, 26);
  stat(s, '0', 'LLM calls in the evaluator: two small models, run on the CPU of the same VM', M + 2 * (tw + 0.25), 4.8, tw, 1.65, INK, 26);
  source(s, 'Sources: LLM_JUDGE_COMPARISON_REPORT.md (median latency table, 2026-08-26) · benchmarks/benchmark_results.json (2026-08-18) · HOW_IT_WORKS.md (buffer 10,000 spans, drop-oldest; cooldown 900 s) · README.md "Architecture in short"');
}

// 04 Grounding
{
  const s = slide('CONTENT', 'Talk');
  head(s, '03 · Signal 1 · Grounding', tRuns('Grounding risk: an NLI model, ', 'not a judge'));
  card(s, M, 1.9, CW, 0.85, { fill: MINT, transparency: 88, line: MINT, lineT: 50 });
  s.addText([{ text: 'risk = P(contradiction) + ' }, { text: '0.3', options: { color: AMBER, bold: true } }, { text: ' × P(neutral)' }],
    { x: M + 0.3, y: 1.9, w: CW - 0.6, h: 0.85, isTextBox: true, margin: 0, fontFace: MONO, fontSize: 26, color: INK, valign: 'middle' });
  s.addText([{ text: "DeBERTa-v3-small compares an agent's output with the evidence it was given. 0 = safe, 1 = risky. " }, { text: 'High above 0.7, medium above 0.4.', options: { bold: true, color: INK } }],
    { x: M, y: 3.0, w: 5.8, h: 0.85, isTextBox: true, margin: 0, fontSize: 16, color: MUTED, valign: 'top' });
  [['contradicted', ROSE], ['unverifiable', MUTED], ['supported', MINT]].forEach(([t, col], i) => {
    const x = M + i * 1.75;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.95, w: 1.6, h: 0.38, rectRadius: 0.19, fill: { color: col, transparency: 85 }, line: { color: col, width: 0.75, transparency: 40 } });
    text(s, t, x, 3.95, 1.6, 0.38, { fontFace: MONO, fontSize: 12, color: col, align: 'center', valign: 'middle' });
  });
  s.addText([{ text: 'The verdict is whichever probability is highest. ' }, { text: 'Unverifiable', options: { bold: true, color: INK } }, { text: ' = the evidence neither supports nor contradicts. A status, not a pass.' }],
    { x: M, y: 4.5, w: 5.8, h: 0.8, isTextBox: true, margin: 0, fontSize: 15, color: MUTED, valign: 'top' });
  s.addText([{ text: '0.3 is a design choice, not a fit: ', options: { bold: true, color: AMBER } }, { text: 'weights 0.0 to 0.3 cannot be told apart on this data.' }],
    { x: M, y: 5.4, w: 5.8, h: 0.7, isTextBox: true, margin: 0, fontSize: 15, color: MUTED, valign: 'top' });
  stat(s, '0.963', 'F1 on the 30-case test split (FPR 0.059: 1 of 17 supported cases)', 7.0, 3.0, 2.6, 1.6, MINT, 30);
  stat(s, '0.927 / 0.952', 'F1 on 47 truly held-out cases (at 0.7 / at 0.4), FPR 0.074', 9.9, 3.0, 2.6, 1.6, MINT, 22);
  stat(s, '68', 'hand-labelled cases behind these numbers (39 supported, 29 failures). 5 of the 30 test cases copy dev cases. Small sample, not production traffic.', 7.0, 4.8, 5.5, 1.6, INK, 30);
  source(s, 'Source: GROUNDING_RECALIBRATION_2026-10.md (tables T3c, T3d, section 3.6; analysis 2026-10-22) · HOW_IT_WORKS.md (verdict rule) · backend/app/services/grounding.py (NEUTRAL_RISK_WEIGHT = 0.3)');
}

// 05 Drift
{
  const s = slide('CONTENT', 'Talk');
  head(s, '04 · Signal 2 · Drift', tRuns('Drift: how far an agent has moved ', 'from itself'));
  const px = M, py = 1.95, pw = 5.6, ph = 4.4;
  card(s, px, py, pw, ph);
  // In short: a schematic of two clouds of output embeddings and the distance between their means.
  const dots = (cx, cy, pts, col) => pts.forEach(([dx, dy]) => s.addShape(pres.shapes.OVAL, { x: cx + dx - 0.05, y: cy + dy - 0.05, w: 0.1, h: 0.1, fill: { color: col }, line: { color: col, width: 0 } }));
  const bx = px + 1.5, by = py + 2.05, wx = px + 4.15, wy = py + 2.05;
  s.addShape(pres.shapes.OVAL, { x: bx - 0.8, y: by - 0.8, w: 1.6, h: 1.6, fill: { color: MINT, transparency: 94 }, line: { color: MINT, width: 0.75, dashType: 'dash', transparency: 40 } });
  s.addShape(pres.shapes.OVAL, { x: wx - 0.62, y: wy - 0.62, w: 1.24, h: 1.24, fill: { color: AMBER, transparency: 94 }, line: { color: AMBER, width: 0.75, dashType: 'dash', transparency: 40 } });
  dots(bx, by, [[-0.15, -0.1], [0.2, -0.32], [-0.38, 0.22], [0.15, 0.3], [-0.2, -0.45], [0.42, 0.02], [-0.5, -0.12], [0.02, 0.55], [0.5, -0.28], [-0.25, 0.05]], MINT);
  dots(wx, wy, [[-0.15, -0.22], [0.15, 0.1], [-0.3, 0.17], [0.08, -0.4], [0.33, -0.1], [-0.05, 0.38]], AMBER);
  arrow(s, bx + 0.12, by, wx - 0.12, ROSE);
  text(s, 'cosine distance > 0.30', px + 1.3, py + 0.5, 3.0, 0.35, { fontFace: MONO, fontSize: 13, color: ROSE, align: 'center' });
  text(s, 'baseline: first 20', bx - 1.0, by + 0.95, 2.0, 0.3, { fontFace: MONO, fontSize: 12, color: MINT, align: 'center' });
  text(s, 'window: latest 12', wx - 1.0, wy + 0.8, 2.0, 0.3, { fontFace: MONO, fontSize: 12, color: AMBER, align: 'center' });
  text(s, 'schematic, not data', px, py + ph - 0.5, pw, 0.3, { fontFace: MONO, fontSize: 10, color: FAINT, align: 'center' });
  s.addText([{ text: 'MiniLM embeds each output. Per agent, the mean of its ' }, { text: 'first 20', options: { bold: true, color: INK } }, { text: ' outputs is the baseline; the mean of its ' }, { text: 'latest 12', options: { bold: true, color: INK } },
    { text: ' is the window. ' }, { text: 'DRIFT_DETECTED', options: { fontFace: MONO, color: ROSE } }, { text: ' fires above a cosine distance of ' }, { text: '0.30', options: { bold: true, color: INK } }, { text: '.' }],
    { x: 6.85, y: 2.0, w: 5.65, h: 1.3, isTextBox: true, margin: 0, fontSize: 17, color: MUTED, valign: 'top' });
  const sw = (5.65 - 0.4) / 3;
  stat(s, '1.5%', 'false alarms', 6.85, 3.55, sw, 1.55, MINT, 28);
  stat(s, '91.9%', 'detection', 6.85 + sw + 0.2, 3.55, sw, 1.55, MINT, 28);
  stat(s, '24.5%', 'of real sessions long enough to measure at all', 6.85 + 2 * (sw + 0.2), 3.55, sw, 1.55, AMBER, 28);
  text(s, 'Offline, an external real-trace corpus, held-out split, measured once.', 6.85, 5.35, 5.65, 0.5, { fontSize: 14 });
  source(s, 'Source: DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md sections 11.3 and 11.5 (2026-08-27) · README.md "What it does" · HOW_IT_WORKS.md (baseline 20, window 12, threshold 0.30)');
}

// 06 Results: cost
{
  const s = slide('CONTENT', 'Talk');
  head(s, '05 · Results · cost', tRuns('Cheap enough to run on ', 'every', ' span'));
  label(s, 'Median evaluation time per case, 30 cases, CPU', M, 1.95, 6);
  // In short: a native bar chart, to scale, two bars.
  s.addChart(pres.charts.BAR, [{ name: 'Median ms per case', labels: ['AgentPulse (MiniLM + DeBERTa)', 'LLM judge (Qwen3-8B, llama.cpp)'], values: [202.94, 3170.39] }], {
    x: M - 0.1, y: 2.2, w: 6.0, h: 2.0, barDir: 'bar', chartColors: ['3DDC97', 'F25C7A'], showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '#,##0.00" ms"', dataLabelColor: 'F5F5F7', dataLabelFontSize: 12, dataLabelFontFace: '+mn-lt',
    catAxisLabelColor: 'A3ACBB', catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt', catAxisOrientation: 'maxMin',
    valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, valAxisMaxVal: 4200,
    showLegend: false, barGapWidthPct: 45, catAxisLineShow: false,
  });
  text(s, 'One judge model on one machine: not a claim about every LLM judge.', M, 4.25, 6, 0.35, { fontSize: 13 });
  stat(s, '180 ms', 'live median evaluation time over 172 spans on the deployed worker (ONNX), as the Settings view showed it on 27 Oct 2026', M, 4.8, 5.9, 1.6, MINT, 28);
  label(s, 'Single runs, one Windows 11 machine, CPU, PyTorch', 7.1, 1.95, 5.4);
  const rows = [['SDK decorator overhead (P50, 2,000 calls)', '0.005 ms'], ['MiniLM embedding (P50, 100 runs)', '15.1 ms'], ['DeBERTa NLI (P50, 50 runs)', '88.5 ms'],
    ['Two grounding models, per case (30 cases)', '151.19 ms'], ['Full pipeline, per case (30 cases)', '165.18 ms']];
  s.addTable(rows.map(([a, b]) => [{ text: a, options: { color: MUTED } }, { text: b, options: { fontFace: MONO, color: INK, align: 'right' } }]), {
    x: 7.1, y: 2.3, w: 5.4, colW: [4.0, 1.4], fontSize: 14, rowH: 0.52, valign: 'middle', margin: [0, 0.05, 0, 0],
    border: [{ type: 'none' }, { type: 'none' }, { pt: 0.5, color: '2A3140' }, { type: 'none' }], fill: { color: BG, transparency: 100 },
  });
  source(s, 'Sources: LLM_JUDGE_COMPARISON_REPORT.md (2026-08-26) · benchmarks/benchmark_results.json (2026-08-18) · experiments/results/ablation_results.json (2026-09-18) · docs/E2E_TEST_2026-10-27.md item 23 (180 ms). Each is one run on one machine, not a constant.');
}

// 07 Results: verified
{
  const s = slide('CONTENT', 'Talk');
  head(s, '06 · Results · verification', tRuns('Tested, and checked ', 'live'));
  stat(s, '628', 'backend tests passed (pytest, 4 min 12 s)', M, 1.95, 3.2, 1.75, MINT, 36);
  stat(s, '404', 'dashboard tests passed (35 files), tsc clean', M, 3.9, 3.2, 1.75, MINT, 36);
  text(s, "Re-run 27 Oct 2026, author's machine", M, 5.8, 3.2, 0.3, { fontFace: MONO, fontSize: 10, color: FAINT });
  label(s, 'End-to-end test of the live site, 27 Oct 2026, from outside', 4.45, 1.95, 8);
  const items = [['✓', MINT, 'Health', ': /v1/health, /v1/health/ready, /chat/health all 200'],
    ['✓', MINT, 'Closed routes', ': /v1/keys and 3 path variants, ingest without key, PUT /v1/simulate: all 401'],
    ['✓', MINT, 'Chat', ': one turn 6.35 s, all three agents answered by Groq; the worker scored all three spans'],
    ['✓', MINT, 'Telemetry Lab', ': hallucination scenario raised HIGH alerts for verifier (0.971) and analyst (0.999)'],
    ['✓', MINT, 'Console', ': every view in Dark and Chalk scripted for NaN / undefined / null: 0 found'],
    ['!', AMBER, 'Two real bugs found and fixed', ' (SVG arrowhead, header at 1366 px); one noted (stale worker count)']];
  items.forEach(([mk, col, b, rest], i) => {
    const y = 2.3 + i * 0.68;
    text(s, mk, 4.45, y, 0.3, 0.6, { fontSize: 16, bold: true, color: col });
    s.addText([{ text: b, options: { bold: true, color: INK } }, { text: rest }], { x: 4.8, y, w: 7.7, h: 0.6, isTextBox: true, margin: 0, fontSize: 15, color: MUTED, valign: 'top' });
    s.addShape(pres.shapes.LINE, { x: 4.45, y: y + 0.63, w: 8.05, h: 0, line: { color: FAINT, width: 0.5, transparency: 70 } });
  });
  source(s, 'Sources: README.md "Testing and benchmarks" (628 / 404, re-run 2026-10-27) · docs/E2E_TEST_2026-10-27.md items 1-25 and findings F1-F3 · SESSION_HANDOFF.md 29.19');
}

// 08 Live demo
{
  const s = slide('CONTENT', 'Talk');
  head(s, '07 · Live demo', tRuns('See it on the ', 'live', ' site'));
  text(s, 'https://agentpulse.centralindia.cloudapp.azure.com', M, 1.8, CW, 0.4, { fontFace: MONO, fontSize: 18, color: MINT });
  const steps = [['Launch App → RAG Live.', ' Ask "how does SQLite WAL improve concurrency?"'], ['Three stages', ': retriever, verifier, answerer, each with time, provider, model.'],
    ['Agent ledger', ': grounding risk and verdict per span; what "Unverifiable" means.'], ['Out of corpus', ': "who won the 2022 football world cup?" Read the ledger.'],
    ['Traces', ' → newest trace → X exports the JSON.']];
  steps.forEach(([b, r], i) => {
    const y = 2.45 + i * 0.8;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: y + 0.03, w: 0.38, h: 0.38, rectRadius: 0.08, fill: { color: MINT, transparency: 85 }, line: { color: MINT, width: 0.75, transparency: 40 } });
    text(s, String(i + 1), M, y + 0.03, 0.38, 0.38, { fontFace: MONO, fontSize: 13, bold: true, color: MINT, align: 'center', valign: 'middle' });
    s.addText([{ text: b, options: { bold: true, color: INK } }, { text: r }], { x: M + 0.55, y, w: 4.4, h: 0.75, isTextBox: true, margin: 0, fontSize: 15, color: MUTED, valign: 'top' });
  });
  shot(s, 'live_rag.jpg', 6.25, 2.45, 6.25, 3.434);
  text(s, 'A real turn, 1 Nov 2026: 3.2 s, all three agents on Groq; answerer grounding 0.191 (low risk). One turn, not a rate.', 6.25, 5.98, 6.25, 0.5, { fontFace: MONO, fontSize: 10, color: FAINT });
}

// 09 Engineering
{
  const s = slide('CONTENT', 'Talk');
  head(s, '08 · Engineering', tRuns('Deployed, automated, ', 'locked down'));
  const cw = (CW - 0.6) / 3;
  const cols = [['DEPLOYMENT', BLUE, 'One Azure VM', ['Standard_B2als_v2 (2 vCPU, 4 GB), Central India.', 'Docker Compose: Caddy (TLS), nginx + dashboard, FastAPI backend, evaluator worker, chat service.', 'Nightly database backup.']],
    ['CI / CD', MINT, 'GitHub Actions', ["Pull requests run the full pytest suite and the dashboard's tsc + vitest.", 'A push to main deploys: rebuild changed images, test the new backend on a copy of the live database, swap, roll back if unhealthy.']],
    ['SECURITY', ROSE, 'Closed by default', ['Every write needs the Caddy write password, except the chat and POST /v1/simulate. Key routes: 401 on every case variant. Refuses to start with the placeholder key.', 'Rate limits per IP: chat 5/min, 40/day; Lab 6/hour, 30/day; 300/day per site.']]];
  cols.forEach(([l, col, h, ps], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 1.95, cw, 4.5);
    label(s, l, x + 0.25, 2.15, cw - 0.5, col);
    text(s, h, x + 0.25, 2.45, cw - 0.5, 0.45, { fontSize: 20, bold: true, color: INK });
    s.addText(ps.map((p, k) => ({ text: p, options: { breakLine: k < ps.length - 1, paraSpaceAfter: 8 } })),
      { x: x + 0.25, y: 3.0, w: cw - 0.5, h: 3.3, isTextBox: true, margin: 0, fontSize: 14, color: MUTED, valign: 'top' });
  });
  source(s, 'Sources: deploy/azure/README.md (VM size) · .github/workflows/tests.yml, dashboard.yml, deploy-azure.yml · deploy/azure/Caddyfile · README.md "What works live" · SESSION_HANDOFF.md 29.17.2 and the #109 entry in 29.18');
}

// 10 Honest limits
{
  const s = slide('CONTENT', 'Talk');
  head(s, '09 · Honest limits', tRuns('What did not hold up, ', 'said first'), AMBER);
  const hw = (CW - 0.3) / 2;
  const L = [['Inter-agent disagreement', ROSE, [['Found '], ['0 of 10', 1], [' labelled contradictions on real traces (AUC 0.457 without the planner). Alert withdrawn; score only stored.']]],
    ['Tool-claim check', ROSE, [['F1 0.000', 1], [' on real traces: no claim found in 8,353 prose spans. It only reads counts written in digits.']]],
    ['Small labelled set', AMBER, [['Grounding quality rests on '], ['68', 1], [' hand-labelled cases; only one is a neutral failure, so the data cannot say what the 0.3 weight buys.']]],
    ['Drift coverage', AMBER, [['Only '], ['24.5%', 1], [' of real sessions were long enough to report a drift distance at all.']]]];
  L.forEach(([h, col, runs], i) => {
    const x = M + (i % 2) * (hw + 0.3), y = 1.95 + Math.floor(i / 2) * 1.55;
    card(s, x, y, hw, 1.38);
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.27, w: 0.14, h: 0.14, fill: { color: col }, line: { color: col, width: 0 } });
    text(s, h, x + 0.5, y + 0.15, hw - 0.7, 0.38, { fontSize: 18, bold: true, color: INK });
    s.addText(runs.map(([t, b]) => ({ text: t, options: b ? { bold: true, color: INK } : {} })), { x: x + 0.25, y: y + 0.6, w: hw - 0.5, h: 0.7, isTextBox: true, margin: 0, fontSize: 14, color: MUTED, valign: 'top' });
  });
  card(s, M, 5.05, CW, 1.3);
  s.addShape(pres.shapes.OVAL, { x: M + 0.25, y: 5.32, w: 0.14, h: 0.14, fill: { color: BLUE }, line: { color: BLUE, width: 0 } });
  text(s, 'One small deployment', M + 0.5, 5.2, 6, 0.38, { fontSize: 18, bold: true, color: INK });
  text(s, 'One VM, one SQLite file, one evaluator worker; backup on the same disk; deploy not gated on the test suite; the chat runs on free LLM tiers and can be slow or refused.', M + 0.25, 5.65, CW - 0.5, 0.65, { fontSize: 14 });
  source(s, 'Sources: README.md "Known limits" · COMPETITIVE_POSITIONING.md 5.2 · SESSION_HANDOFF.md 24.9.5 · TOOL_CLAIM_EXTERNAL_TEST_REPORT.md section 10 · GROUNDING_RECALIBRATION_2026-10.md · DEMO_GUIDE.md "The honest limits"');
}

// 11 Future work
{
  const s = slide('CONTENT', 'Talk');
  head(s, '10 · Future work', tRuns('Next, in order of what the limits ', 'ask for'));
  const hw = (CW - 0.3) / 2;
  const F = [['GROUNDING', MINT, 'More labelled data', 'A larger labelled set drawn from real traces, with neutral failures, then re-run the ablation at the 0.3 weight.'],
    ['THE TWO FAILED SIGNALS', ROSE, 'Redesign or remove', 'Claim extraction from prose instead of digits for tool-claim; a different formulation for disagreement, tested on real traces first.'],
    ['SCALE AND SAFETY', BLUE, 'Beyond one VM', 'A server database instead of one SQLite file, several workers, an off-VM backup, deploys gated on the test suite.'],
    ['REACH', AMBER, 'More frameworks', 'LangChain and CrewAI adapters (today: decorator, OpenAI / Anthropic wrapper, LangGraph).']];
  F.forEach(([l, col, h, p], i) => {
    const x = M + (i % 2) * (hw + 0.3), y = 2.0 + Math.floor(i / 2) * 2.2;
    card(s, x, y, hw, 1.95);
    label(s, l, x + 0.25, y + 0.2, hw - 0.5, col);
    text(s, h, x + 0.25, y + 0.5, hw - 0.5, 0.42, { fontSize: 20, bold: true, color: INK });
    text(s, p, x + 0.25, y + 1.0, hw - 0.5, 0.85, { fontSize: 15 });
  });
}

// 12 Conclusion
{
  const s = slide('TITLE', 'Talk');
  text(s, 'CONCLUSION', M, 0.85, 6, 0.3, { fontFace: MONO, fontSize: 13, color: MINT, charSpacing: 3 });
  s.addText([{ text: 'Two signals that held up,', options: { breakLine: true } }, { text: 'measured, live, and honest', options: { italic: true, bold: false, color: MINT } }, { text: ' about the rest.' }],
    { x: M, y: 1.25, w: CW, h: 2.1, isTextBox: true, margin: 0, fontSize: 46, bold: true, color: INK, valign: 'top' });
  const tw = (CW - 0.6) / 3;
  const T = [['01', 'Every span scored by two local models on a CPU. ', 'No LLM judge: 202.94 ms vs 3,170.39 ms median per case.'],
    ['02', 'Grounding and drift held up. ', 'F1 0.963 on the test split; two other signals failed on real traces and are labelled so.'],
    ['03', 'Live on Azure and tested. ', '628 + 404 tests; chat, Telemetry Lab and console open to examiners.']];
  T.forEach(([k, a, b], i) => {
    const x = M + i * (tw + 0.3);
    card(s, x, 3.6, tw, 1.95);
    text(s, k, x + 0.25, 3.75, 1, 0.3, { fontFace: MONO, fontSize: 13, color: MINT });
    s.addText([{ text: a, options: { color: INK } }, { text: b }], { x: x + 0.25, y: 4.1, w: tw - 0.5, h: 1.35, isTextBox: true, margin: 0, fontSize: 16, color: MUTED, valign: 'top' });
  });
  label(s, 'Live site', M, 5.95, 4);
  text(s, 'agentpulse.centralindia.cloudapp.azure.com', M, 6.2, 7.5, 0.4, { fontFace: MONO, fontSize: 18, color: MINT });
  text(s, 'github.com/Soum-Code/agentpulse', M, 6.65, 7, 0.3, { fontFace: MONO, fontSize: 12, color: MUTED });
  s.addText([{ text: 'Thank you · ', options: { color: INK } }, { text: 'Questions?', options: { color: MINT } }], { x: 8.0, y: 6.2, w: 4.5, h: 0.6, isTextBox: true, margin: 0, fontSize: 26, bold: true, align: 'right', valign: 'middle' });
}

// =================== BACKUP ===================
pres.addSection({ title: 'Backup (Q&A)' });

// B1
{
  const s = slide('CONTENT', 'Backup (Q&A)');
  head(s, 'Backup B1 · Q&A', 'The label-order bug, and why the weight is 0.3', AMBER);
  s.addText([
    { text: 'Before 21 Oct the code read DeBERTa\'s ' }, { text: 'entailment and neutral probabilities swapped', options: { bold: true, color: INK } }, { text: '. PR #69 reads the label order from the model config; every grounding figure was re-measured.', options: { breakLine: true } },
    { text: 'At the 0.7 cut-off, weights up to 0.6 give identical results: ' }, { text: 'high alerts do not depend on the weight', options: { bold: true, color: INK } }, { text: '. Only the medium line does.', options: { breakLine: true } },
    { text: 'Live rows re-scored at 0.3: ' }, { text: '90 low / 7 medium / 19 high', options: { fontFace: MONO, color: INK } }, { text: ' (at 0.5: 12 / 81 / 23).' }],
  { x: M, y: 2.0, w: 5.7, h: 4.3, isTextBox: true, margin: 0, fontSize: 16, color: MUTED, valign: 'top', paraSpaceAfter: 14 });
  label(s, 'Test split, cut-off 0.4, corrected labels', 7.0, 2.0, 5.5);
  const R = [['weight', 'F1', 'false-positive rate', MUTED], ['0.0 – 0.3', '0.963', '0.059', MINT], ['0.4', '0.897', '0.176', INK], ['0.5', '0.788', '0.412', ROSE]];
  s.addTable(R.map(([a, b, c, col], i) => [a, b, c].map((t, k) => ({ text: t, options: { color: i === 0 ? FAINT : col, fontFace: i === 0 ? undefined : MONO, align: k ? 'right' : 'left' } }))), {
    x: 7.0, y: 2.35, w: 5.5, colW: [1.7, 1.5, 2.3], fontSize: 16, rowH: 0.55, valign: 'middle', margin: [0, 0.05, 0, 0],
    border: [{ type: 'none' }, { type: 'none' }, { pt: 0.5, color: '2A3140' }, { type: 'none' }], fill: { color: BG, transparency: 100 },
  });
  text(s, 'At 0.5, 7 of 17 supported test cases were flagged medium.', 7.0, 4.7, 5.5, 0.35, { fontFace: MONO, fontSize: 11, color: FAINT });
  source(s, 'Source: GROUNDING_RECALIBRATION_2026-10.md (banner, findings 4-7, T3c, T5b, T7) · SESSION_HANDOFF.md 29.11.3 · PR #69, PR #89');
}

// B2
{
  const s = slide('CONTENT', 'Backup (Q&A)');
  head(s, 'Backup B2 · Q&A', 'Two signals measured, and withdrawn', AMBER);
  const hw = (CW - 0.3) / 2;
  card(s, M, 2.0, hw, 4.2);
  label(s, 'Tool-claim validation', M + 0.3, 2.2, hw - 0.6, ROSE);
  s.addText([{ text: '0.842', options: { color: MUTED } }, { text: ' → ', options: { color: INK } }, { text: '0.000', options: { color: ROSE } }], { x: M + 0.3, y: 2.55, w: hw - 0.6, h: 0.8, isTextBox: true, margin: 0, fontFace: MONO, fontSize: 40, bold: true, valign: 'middle' });
  text(s, 'F1 on 19 hand-written cases → F1 on a real-data benchmark', M + 0.3, 3.4, hw - 0.6, 0.35, { fontSize: 14 });
  text(s, "Compares a count the output states with the tool's recorded result count. On real agent traces it extracted no claim from 8,353 prose spans: agents do not write counts in digits.", M + 0.3, 3.95, hw - 0.6, 1.9, { fontSize: 16 });
  const x2 = M + hw + 0.3;
  card(s, x2, 2.0, hw, 4.2);
  label(s, 'Inter-agent disagreement', x2 + 0.3, 2.2, hw - 0.6, ROSE);
  text(s, '0 / 10', x2 + 0.3, 2.55, hw - 0.6, 0.8, { fontFace: MONO, fontSize: 40, bold: true, color: ROSE, valign: 'middle' });
  text(s, 'labelled contradictions found on real multi-agent traces', x2 + 0.3, 3.4, hw - 0.6, 0.35, { fontSize: 14 });
  text(s, "NLI between agents' outputs in one trace. With the planner excluded, AUC 0.457: chance. The alert was withdrawn; the score is still stored, not alerted on.", x2 + 0.3, 3.95, hw - 0.6, 1.9, { fontSize: 16 });
  source(s, 'Sources: TOOL_CLAIM_EXTERNAL_TEST_REPORT.md section 10 · COMPETITIVE_POSITIONING.md 5.1, 5.2 · SESSION_HANDOFF.md 14.1, 24.9.5 · README.md "What it does"');
}

// B3
{
  const s = slide('CONTENT', 'Backup (Q&A)');
  head(s, 'Backup B3 · Q&A', 'Telemetry Lab: a fault in, an incident out', AMBER);
  const hw = (CW - 0.4) / 2, ih = 3.5;
  shot(s, 'live_lab.jpg', M, 2.0, hw, ih);
  text(s, 'Five scenarios: clean, hallucination, tool-claim mismatch, drift, disagreement. Agent text is a fixture; the evaluator is real.', M, 5.62, hw, 0.6, { fontFace: MONO, fontSize: 10, color: FAINT });
  shot(s, 'live_incidents.jpg', M + hw + 0.4, 2.0, hw, ih);
  text(s, 'Incidents from Lab runs on 27 Oct: GROUNDING_FAILURE and HIGH_HALLUCINATION_RISK for analyst, risk 0.999.', M + hw + 0.4, 5.62, hw, 0.6, { fontFace: MONO, fontSize: 10, color: FAINT });
  source(s, 'Sources: HOW_IT_WORKS.md (Telemetry Lab; fixture text in routers/ingest.py) · docs/E2E_TEST_2026-10-27.md items 11, 12, 22 · README.md (Lab limits 6/h, 30/day per IP)');
}

(async () => {
  if (NOTES.length !== n) throw new Error(`notes ${NOTES.length} != slides ${n}`);
  await pres.writeFile({ fileName: OUT });
  if (process.env.APPLY_THEME) {
    const { applyTheme } = require(process.env.APPLY_THEME);
    await applyTheme(OUT, THEME);
  } else {
    console.warn('APPLY_THEME not set: scheme colours fall back to the stock Office palette');
  }
  console.log('wrote', OUT, n, 'slides');
})();
