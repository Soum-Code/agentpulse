/*
 * Builds presentation/viva/AgentPulse_Viva.pptx: the PowerPoint twin of AgentPulse_Viva.html (broadsheet edition).
 * Same 16 slides, same order, same numbers. The speaker notes are read from the HTML deck's
 * <aside class="notes"> blocks, so the two decks cannot drift apart on notes or sources.
 *
 * Run (pptxgenjs must be resolvable; APPLY_THEME points at the pptx skill's apply_theme.js):
 *   NODE_PATH=<dir with node_modules> APPLY_THEME=<path>/apply_theme.js node presentation/viva/build_viva_pptx.js
 *
 * In short: a theme (newsprint, ink, one red), two layouts (front page, content page), then one block per slide.
 * Fonts ship with Office: Times New Roman (headlines), Cambria (text), Arial (labels), Consolas (formula).
 */
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const HERE = __dirname;
const OUT = path.join(HERE, 'AgentPulse_Viva.pptx');
const A = (f) => path.join(HERE, 'assets', f);

// In short: the newspaper palette of the HTML :root (paper, ink, one deep red).
const THEME = {
  name: 'AgentPulse Broadsheet',
  headFontFace: 'Times New Roman',
  bodyFontFace: 'Cambria',
  colors: {
    dk1: '141414', lt1: 'F4F0E6', dk2: '3D3A35', lt2: 'FBF8F1',
    accent1: 'A4161A', accent2: '6B665D', accent3: 'B9B2A3', accent4: '9C978C',
    accent5: '141414', accent6: 'FFFFFF', hlink: 'A4161A', folHlink: '6B665D',
  },
};
const HEAD = 'Times New Roman', LABEL = 'Arial', MONO = 'Consolas';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.author = 'Somnath Reddy';
pres.title = 'AgentPulse — M.Tech final review';
pres.subject = 'Grounding and drift monitoring for multi-agent LLM pipelines';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const INK = C.text1, INK2 = C.text2, PAPER = C.background1, BOX = C.background2;
const RED = C.accent1, GREY = C.accent2, HAIR = C.accent3, MIDGREY = C.accent4, WHITE = C.accent6;
const HAIR_HEX = 'B9B2A3', INK_HEX = '141414';

const M = 0.76, W = 13.333, CW = W - 2 * M;
const EX_W = 7.15, RULE_X = M + EX_W + 0.3, NOTE_X = RULE_X + 0.33, NOTE_W = W - M - NOTE_X;
const BODY_Y = 2.3, BODY_B = 6.7;

// ---------- notes from the HTML deck ----------
// In short: pull every <aside class="notes"> in order and decode the few entities used.
const html = fs.readFileSync(path.join(HERE, 'AgentPulse_Viva.html'), 'utf8');
const NOTES = [...html.matchAll(/<aside class="notes">([\s\S]*?)<\/aside>/g)].map((m) =>
  m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim());

// ---------- layouts ----------
pres.defineSlideMaster({ title: 'FRONT', background: { color: 'F4F0E6' }, objects: [] });
pres.defineSlideMaster({
  title: 'PAGE',
  background: { color: 'F4F0E6' },
  objects: [
    { text: { text: 'AgentPulse', options: { x: M, y: 0.3, w: 3, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: INK, margin: 0, valign: 'bottom' } } },
    { line: { x: M, y: 0.76, w: CW, h: 0, line: { color: INK_HEX, width: 2.25 } } },
    { line: { x: M, y: 0.81, w: CW, h: 0, line: { color: INK_HEX, width: 0.75 } } },
    { line: { x: M, y: 6.9, w: CW, h: 0, line: { color: INK_HEX, width: 0.75 } } },
    { placeholder: { options: { name: 'kicker', type: 'body', x: M, y: 0.93, w: 11, h: 0.27, fontFace: LABEL, fontSize: 11, bold: true, color: RED, charSpacing: 2, margin: 0, valign: 'middle' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 1.22, w: CW - 0.6, h: 0.98, fontFace: HEAD, fontSize: 30, bold: true, color: INK, margin: 0, valign: 'top', align: 'left', lineSpacingMultiple: 0.95 }, text: '' } },
  ],
});

// ---------- helpers ----------
let n = 0;
function slide(master, section) {
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  s.addNotes(NOTES[n] || '');
  n += 1;
  return s;
}
function text(s, t, x, y, w, h, o = {}) {
  s.addText(t, { x, y, w, h, isTextBox: true, margin: 0, fontSize: 20, color: INK, valign: 'top', ...o });
}
// Running head (section in the middle, page at the right), kicker and takeaway headline.
function page(s, mid, pg, kicker, headline, midRed) {
  text(s, mid.toUpperCase(), 4.0, 0.42, 5.33, 0.26, { fontFace: LABEL, fontSize: 9.5, color: midRed ? RED : INK2, charSpacing: 2, align: 'center', valign: 'bottom' });
  text(s, pg.toUpperCase(), W - M - 3, 0.42, 3, 0.26, { fontFace: LABEL, fontSize: 9.5, color: INK2, charSpacing: 2, align: 'right', valign: 'bottom' });
  s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
  s.addText(headline, { placeholder: 'title' });
}
function source(s, t) {
  s.addText([{ text: 'SOURCE  ', options: { fontFace: LABEL, fontSize: 8.5, bold: true, italic: false, color: INK2, charSpacing: 2 } }, { text: t }],
    { x: M, y: 6.97, w: CW, h: 0.42, isTextBox: true, margin: 0, fontFace: 'Cambria', fontSize: 10.5, italic: true, color: GREY, valign: 'top' });
}
function vrule(s, x, y1, y2) {
  s.addShape(pres.shapes.LINE, { x, y: y1, w: 0, h: y2 - y1, line: { color: INK_HEX, width: 0.75 } });
}
// The right-hand column: a column rule and up to three short paragraphs.
function notecol(s, paras, y0 = BODY_Y + 0.35) {
  vrule(s, RULE_X, BODY_Y + 0.1, BODY_B - 0.1);
  let y = y0;
  paras.forEach((p) => {
    const small = p.small;
    const runs = p.runs || [{ text: p.text }];
    const h = p.h || 1.0;
    s.addText(runs.map((r) => ({ text: r.text, options: r.b ? { bold: true } : r.red ? { color: RED } : {} })),
      { x: NOTE_X, y, w: NOTE_W, h, isTextBox: true, margin: 0, fontFace: 'Cambria', fontSize: small ? 17 : 20, color: small ? INK2 : INK, valign: 'top' });
    y += h + 0.18;
  });
}
function pull(s, runs, x, y, w, h) {
  s.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: INK_HEX, width: 2.25 } });
  s.addText(runs.map((r) => ({ text: r.text, options: r.red ? { color: RED } : {} })),
    { x, y: y + 0.12, w, h: h - 0.24, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 22, bold: true, italic: true, color: INK, valign: 'middle' });
  s.addShape(pres.shapes.LINE, { x, y: y + h, w, h: 0, line: { color: INK_HEX, width: 0.75 } });
}
function caption(s, t, credit, x, y, w, h = 0.5) {
  const runs = [{ text: t }];
  if (credit) runs.push({ text: '  ' + credit.toUpperCase(), options: { fontFace: LABEL, fontSize: 8, color: GREY, charSpacing: 1 } });
  s.addText(runs, { x, y, w, h, isTextBox: true, margin: 0, fontFace: 'Cambria', fontSize: 12, color: INK2, valign: 'top' });
}
function photo(s, file, x, y, w, h) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: WHITE }, line: { color: INK_HEX, width: 0.75 } });
  s.addImage({ path: A(file), x: x + 0.06, y: y + 0.06, w: w - 0.12, h: h - 0.12, sizing: { type: 'cover', w: w - 0.12, h: h - 0.12 }, altText: file });
}
// Newspaper table: header row in small caps over a heavy rule, hairlines between rows.
function ntable(s, header, rows, x, y, w, colW, o = {}) {
  const head = header.map((t, k) => ({ text: t.toUpperCase(), options: { fontFace: LABEL, fontSize: 10, bold: true, color: INK2, charSpacing: 1, align: k ? 'right' : 'left', border: [{ type: 'none' }, { type: 'none' }, { pt: 2.25, color: INK_HEX }, { type: 'none' }] } }));
  const body = rows.map((r) => r.cells.map((t, k) => ({ text: t, options: { color: r.red ? RED : INK, bold: k > 0, align: k ? 'right' : 'left', border: [{ type: 'none' }, { type: 'none' }, { pt: 0.75, color: HAIR_HEX }, { type: 'none' }] } })));
  s.addTable([head, ...body], { x, y, w, colW, fontFace: 'Cambria', fontSize: o.fontSize || 18, rowH: o.rowH || 0.55, valign: 'middle', margin: [0, 0.06, 0, 0], fill: { color: 'F4F0E6' } });
}

// =================== TALK ===================
pres.addSection({ title: 'Talk' });

// 1 Front page
{
  const s = slide('FRONT', 'Talk');
  text(s, 'VOL. 1 · NO. 1', M, 0.26, 4, 0.25, { fontFace: LABEL, fontSize: 10, color: INK2, charSpacing: 2 });
  text(s, 'M.TECH (AIML) FINAL REVIEW', 4.0, 0.26, 5.33, 0.25, { fontFace: LABEL, fontSize: 10, color: INK2, charSpacing: 2, align: 'center' });
  text(s, 'TUESDAY, 3 NOVEMBER 2026', W - M - 4, 0.26, 4, 0.25, { fontFace: LABEL, fontSize: 10, color: INK2, charSpacing: 2, align: 'right' });
  s.addShape(pres.shapes.LINE, { x: M, y: 0.56, w: CW, h: 0, line: { color: INK_HEX, width: 0.75 } });
  text(s, 'AgentPulse', M, 0.5, CW, 1.2, { fontFace: HEAD, fontSize: 96, bold: true, align: 'center', valign: 'middle' });
  text(s, 'Observability for multi-agent LLM pipelines', M, 1.97, CW, 0.3, { fontFace: 'Cambria', fontSize: 15, italic: true, color: INK2, align: 'center' });
  s.addShape(pres.shapes.LINE, { x: M, y: 2.32, w: CW, h: 0, line: { color: INK_HEX, width: 2.25 } });
  text(s, 'LIVE EDITION: AGENTPULSE.CENTRALINDIA.CLOUDAPP.AZURE.COM', M, 2.39, 7, 0.25, { fontFace: LABEL, fontSize: 9.5, charSpacing: 1, valign: 'middle' });
  text(s, 'CODE: GITHUB.COM/SOUM-CODE/AGENTPULSE', W - M - 5, 2.39, 5, 0.25, { fontFace: LABEL, fontSize: 9.5, charSpacing: 1, align: 'right', valign: 'middle' });
  s.addShape(pres.shapes.LINE, { x: M, y: 2.7, w: CW, h: 0, line: { color: INK_HEX, width: 0.75 } });
  text(s, 'Every agent step, checked for grounding and drift, without an LLM judge', M, 2.95, 5.6, 1.85, { fontFace: HEAD, fontSize: 32, bold: true });
  text(s, 'Two small local models score each span. Two signals held up on real data, two did not, and this paper says which.', M, 4.9, 5.6, 1.1, { fontFace: 'Cambria', fontSize: 16, color: INK2 });
  s.addText([{ text: 'BY ' }, { text: 'SOMNATH REDDY', options: { color: RED } }], { x: M, y: 6.1, w: 5.6, h: 0.3, isTextBox: true, margin: 0, fontFace: LABEL, fontSize: 11, bold: true, charSpacing: 2, color: INK });
  vrule(s, 6.75, 2.95, 6.9);
  photo(s, 'live_overview.jpg', 7.08, 2.95, W - M - 7.08, 3.15);
  caption(s, 'The deployed console on 1 November 2026.', 'Photo: screenshot of the live site', 7.08, 6.2, W - M - 7.08, 0.5);
}

// 2 Problem
{
  const s = slide('PAGE', 'Talk');
  page(s, 'The problem', 'Page 2', 'The problem', 'In a multi-agent pipeline, a wrong answer looks exactly like a right one');
  const nodes = [['AGENT 1', 'Retriever', '200 OK', false], ['AGENT 2', 'Verifier', 'claim not in its evidence', true], ['AGENT 3', 'Answerer', 'builds on it', true]];
  nodes.forEach(([l, nm, st, bad], i) => {
    const x = M + i * 2.45, y = 3.55;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.05, h: 1.2, fill: { color: BOX }, line: { color: bad ? 'A4161A' : INK_HEX, width: 1.5 } });
    text(s, l, x + 0.15, y + 0.12, 1.8, 0.2, { fontFace: LABEL, fontSize: 8, bold: true, color: GREY, charSpacing: 1 });
    text(s, nm, x + 0.15, y + 0.33, 1.8, 0.4, { fontFace: HEAD, fontSize: 20, bold: true });
    text(s, st, x + 0.15, y + 0.75, 1.8, 0.4, { fontFace: MONO, fontSize: 10.5, color: bad ? RED : INK });
    if (i < 2) text(s, '→', x + 2.05, y + 0.35, 0.4, 0.45, { fontSize: 20, align: 'center', color: i === 1 ? RED : INK });
  });
  caption(s, 'Every call returns 200, nothing throws, latency is normal. Schematic, not data.', null, M, 4.95, EX_W, 0.4);
  notecol(s, [
    { runs: [{ text: 'Grounding failure:', b: 1 }, { text: ' an agent says what its evidence does not support.' }], h: 1.0 },
    { runs: [{ text: 'Drift:', b: 1 }, { text: ' an agent slowly answers differently after a change.' }], h: 1.0 },
    { text: 'Most tools trace cost and latency; quality checks are optional and sampled.', small: 1, h: 0.9 },
  ], 2.75);
  source(s, 'README.md, introduction (tools treat quality evaluation as an optional, sampled add-on).');
}

// 3 Architecture
{
  const s = slide('PAGE', 'Talk');
  page(s, 'How it works', 'Page 3', 'The system', "AgentPulse scores every span on a CPU, off the agent's critical path");
  const boxes = [['IN YOUR AGENT', 'SDK', 'Decorator, client wrapper, LangGraph'], ['FASTAPI', 'Ingest API', 'Queues spans; runs no model'],
    ['STORAGE', 'SQLite + job queue', 'WAL mode, durable'], ['WORKER, CPU', 'Evaluator', 'MiniLM + DeBERTa NLI'],
    ['RULES', 'Alerts', 'One per agent and type in 15 min'], ['REACT', 'Console', 'Traces, incidents, drift, Lab']];
  const g = 0.28, bw = (CW - 5 * g) / 6, y = 2.65, h = 2.0;
  boxes.forEach(([l, hd, p], i) => {
    const x = M + i * (bw + g), key = i === 3;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: bw, h, fill: { color: key ? INK : BOX }, line: { color: INK_HEX, width: 1.5 } });
    text(s, l, x + 0.12, y + 0.14, bw - 0.2, 0.2, { fontFace: LABEL, fontSize: 8, bold: true, color: key ? HAIR : GREY, charSpacing: 1 });
    text(s, hd, x + 0.12, y + 0.4, bw - 0.2, 0.62, { fontFace: HEAD, fontSize: 17, bold: true, color: key ? PAPER : INK });
    text(s, p, x + 0.12, y + 1.05, bw - 0.2, 0.9, { fontFace: 'Cambria', fontSize: 13, color: key ? HAIR : INK2 });
    if (i < 5) text(s, '→', x + bw, y + 0.8, g, 0.35, { fontSize: 16, align: 'center' });
  });
  pull(s, [{ text: 'No LLM call anywhere in the evaluator. The SDK adds ' }, { text: '0.005 ms', red: 1 }, { text: ' per call and never blocks the agent.' }], M, 5.1, CW, 0.95);
  source(s, 'README.md, Architecture in short; HOW_IT_WORKS.md (bounded buffer, cooldown 900 s); benchmarks/benchmark_results.json, 2026-08-18 (0.005 ms, P50 over 2,000 calls).');
}

// 4 Grounding method
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Signal 1: grounding', 'Page 4', 'Method · grounding', 'Grounding risk is an NLI probability, and its 0.3 weight is a design choice');
  const y0 = 2.75;
  s.addShape(pres.shapes.LINE, { x: M, y: y0, w: EX_W, h: 0, line: { color: INK_HEX, width: 2.25 } });
  s.addText([{ text: 'risk = P(contradiction) + ' }, { text: '0.3', options: { color: RED } }, { text: ' × P(neutral)' }],
    { x: M, y: y0 + 0.08, w: EX_W, h: 0.75, isTextBox: true, margin: 0, fontFace: MONO, fontSize: 21, color: INK, valign: 'middle' });
  s.addShape(pres.shapes.LINE, { x: M, y: y0 + 0.91, w: EX_W, h: 0, line: { color: INK_HEX, width: 0.75 } });
  const bands = [['LOW · 0 TO 0.4', 0.4, '9C978C', INK], ['MEDIUM · ABOVE 0.4', 0.3, '3D3A35', INK], ['HIGH · ABOVE 0.7', 0.3, 'A4161A', RED]];
  let bx = M;
  bands.forEach(([t, frac, col, tc]) => {
    const bw = EX_W * frac;
    s.addShape(pres.shapes.RECTANGLE, { x: bx, y: y0 + 1.2, w: bw, h: 0.07, fill: { color: col }, line: { color: col, width: 0 } });
    text(s, t, bx, y0 + 1.33, bw, 0.25, { fontFace: LABEL, fontSize: 10.5, color: tc, charSpacing: 1 });
    bx += bw;
  });
  [['CONTRADICTED', 'A4161A', RED], ['UNVERIFIABLE', '6B665D', GREY], ['SUPPORTED', INK_HEX, INK]].forEach(([t, lc, tc], i) => {
    const x = M + i * 2.05;
    s.addShape(pres.shapes.RECTANGLE, { x, y: y0 + 1.85, w: 1.85, h: 0.4, fill: { color: PAPER }, line: { color: lc, width: 1.5 } });
    text(s, t, x, y0 + 1.85, 1.85, 0.4, { fontFace: LABEL, fontSize: 10.5, bold: true, color: tc, charSpacing: 1, align: 'center', valign: 'middle' });
  });
  caption(s, 'Verdict = whichever of the three probabilities is highest.', null, M, y0 + 2.4, EX_W, 0.35);
  notecol(s, [
    { text: 'DeBERTa compares each output with the evidence the agent was given.', h: 1.0 },
    { runs: [{ text: 'Unverifiable', b: 1 }, { text: ': neither supported nor contradicted. A status, not a pass.' }], h: 1.0 },
    { text: 'Weights 0 to 0.3 give identical results on our data.', small: 1, h: 0.7 },
  ], 2.85);
  source(s, 'GROUNDING_RECALIBRATION_2026-10.md, section 3.6 (analysis 2026-10-22); HOW_IT_WORKS.md, the verdict rule; backend/app/services/grounding.py (NEUTRAL_RISK_WEIGHT = 0.3).');
}

// 5 Grounding result
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Signal 1: grounding', 'Page 5', 'Result · grounding', 'On 68 hand-labelled cases, grounding catches contradictions with few false alarms');
  ntable(s, ['Evaluation set', 'Cases', 'F1', 'False alarms'], [
    { cells: ['Test split', '30', '0.963', '0.059'], red: 1 },
    { cells: ['Held-out pool, cut-off 0.7', '47', '0.927', '0.074'] },
    { cells: ['Held-out pool, cut-off 0.4', '47', '0.952', '0.074'] }], M, 3.05, EX_W, [3.55, 1.0, 1.1, 1.5]);
  caption(s, 'False alarms = share of supported cases flagged (1 of 17 on the test split; 2 of 27 held out).', null, M, 5.35, EX_W, 0.5);
  vrule(s, RULE_X, BODY_Y + 0.1, BODY_B - 0.1);
  pull(s, [{ text: 'A small sample, ' }, { text: 'not production traffic', red: 1 }, { text: '.' }], NOTE_X, 3.0, NOTE_W, 1.15);
  text(s, '68 cases: 39 supported, 29 failures. 5 of the 30 test cases copy development cases.', NOTE_X, 4.4, NOTE_W, 1.1, { fontFace: 'Cambria', fontSize: 17, color: INK2 });
  source(s, 'GROUNDING_RECALIBRATION_2026-10.md, tables T3c and T3d (analysis 2026-10-22); README.md, Numbers and where they come from.');
}

// 6 Drift
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Signal 2: drift', 'Page 6', 'Result · drift', 'Drift detection is accurate, but only a quarter of real sessions are long enough to measure');
  // In short: a native bar chart drawn to scale, 0-100 percent; the coverage bar is red.
  s.addChart(pres.charts.BAR, [{ name: 'Percent', labels: ['Detection', 'False alarms', 'Sessions long enough to measure'], values: [91.9, 1.5, 24.5] }], {
    x: M - 0.1, y: 2.75, w: EX_W + 0.1, h: 3.0, barDir: 'bar', chartColors: ['141414', '141414', 'A4161A'], showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '0.0"%"', dataLabelColor: '141414', dataLabelFontSize: 16, dataLabelFontFace: '+mn-lt', dataLabelFontBold: true,
    catAxisLabelColor: '141414', catAxisLabelFontSize: 16, catAxisLabelFontFace: '+mn-lt', catAxisOrientation: 'maxMin', catAxisLineShow: true,
    catAxisLineColor: '141414', valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 110, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    showLegend: false, barGapWidthPct: 55,
  });
  caption(s, '0 to 100 percent, to scale.', null, M, 5.8, EX_W, 0.3);
  notecol(s, [
    { runs: [{ text: 'Baseline:', b: 1 }, { text: " an agent's first 20 outputs. " }, { text: 'Window:', b: 1 }, { text: ' its latest 12.' }], h: 1.0 },
    { runs: [{ text: 'Alert when the two drift apart by a cosine distance above ' }, { text: '0.30', b: 1 }, { text: '.' }], h: 1.0 },
    { text: 'Offline, real-trace corpus, held-out split, measured once.', small: 1, h: 0.7 },
  ], 2.85);
  source(s, 'DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md, sections 11.3 and 11.5 (2026-08-27); HOW_IT_WORKS.md (baseline 20, window 12, threshold 0.30).');
}

// 7 Cost
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Results: cost', 'Page 7', 'Result · cost', 'The evaluator is 15.6 times faster than an LLM judge, at a small accuracy cost');
  // In short: two bars drawn to scale with shapes (a chart's data labels wrap unpredictably in some viewers).
  const tx = M + 2.7, tw = EX_W - 2.7, vmax = 3170.39;
  [['AgentPulse (MiniLM + DeBERTa)', 202.94, '202.94', INK, false], ['LLM judge (Qwen3-8B, CPU)', 3170.39, '3,170.39', RED, true]].forEach(([nm, v, lab, col, inside], i) => {
    const y = 3.15 + i * 1.0, bw = tw * v / vmax;
    text(s, nm, M, y, 2.55, 0.6, { fontFace: 'Cambria', fontSize: 17, valign: 'middle' });
    s.addShape(pres.shapes.RECTANGLE, { x: tx, y, w: bw, h: 0.6, fill: { color: col }, line: { color: col, width: 0 } });
    if (inside) text(s, lab, tx + bw - 1.6, y, 1.5, 0.6, { fontFace: 'Cambria', fontSize: 17, bold: true, color: PAPER, align: 'right', valign: 'middle' });
    else text(s, lab, tx + bw + 0.1, y, 1.5, 0.6, { fontFace: 'Cambria', fontSize: 17, bold: true, valign: 'middle' });
  });
  s.addShape(pres.shapes.LINE, { x: tx, y: 3.0, w: 0, h: 1.9, line: { color: INK_HEX, width: 1.5 } });
  caption(s, 'Median milliseconds per case, 30 cases, to scale.', null, tx, 5.1, tw, 0.3);
  notecol(s, [
    { runs: [{ text: 'Same 30 cases: judge F1 ' }, { text: '1.000', b: 1 }, { text: ', AgentPulse ' }, { text: '0.963', b: 1 }, { text: '.' }], h: 1.0 },
    { text: 'One judge model on one machine; not a claim about every judge.', small: 1, h: 0.9 },
  ], 3.15);
  source(s, 'LLM_JUDGE_COMPARISON_REPORT.md, median latency table and correction banner (2026-08-26; F1 at the shipped weight derived from stored probabilities).');
}

// 8 Verification
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Results: verification', 'Page 8', 'Result · verification', 'The live site passed an end-to-end test from outside on 27 October');
  ntable(s, ['Check on the live site', 'Result'], [
    { cells: ['Health endpoints', '200'] }, { cells: ['Key routes, writes without a key', '401'] },
    { cells: ['Chat turn, three agents on Groq', '6.35 s, all scored'] }, { cells: ['Lab hallucination run', 'HIGH alerts'] },
    { cells: ['Every console view, two palettes', '0 NaN'] }], M, 2.65, EX_W, [4.55, 2.6]);
  notecol(s, [
    { runs: [{ text: '628', b: 1 }, { text: ' backend and ' }, { text: '404', b: 1 }, { text: ' dashboard tests pass.' }], h: 1.0 },
    { text: 'The test also found two real bugs; both were fixed.', small: 1, h: 0.8 },
  ], 3.3);
  source(s, 'docs/E2E_TEST_2026-10-27.md, items 1-25 and findings F1-F3; README.md, Testing and benchmarks (re-run 2026-10-27).');
}

// 9 Live demo
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Live demo', 'Page 9', 'Live demo · agentpulse.centralindia.cloudapp.azure.com', 'One question, three agents, and every step scored as it happens');
  const pw = 7.15, ph = pw / 1.82 + 0.12;
  photo(s, 'live_rag.jpg', M, 2.35, pw, Math.min(ph, 3.75));
  caption(s, 'A real turn on 1 November: 3.2 s, all agents on Groq; answerer risk 0.191. One turn, not a rate.', 'Photo: live site', M, 2.35 + Math.min(ph, 3.75) + 0.1, pw, 0.5);
  vrule(s, RULE_X, BODY_Y + 0.1, BODY_B - 0.1);
  const steps = ['Ask how SQLite WAL improves concurrency', 'Read the three stages', 'Open the agent ledger', 'Ask an out-of-corpus question', 'Export the trace (key X)'];
  steps.forEach((t, i) => {
    const y = 2.6 + i * 0.78;
    text(s, String(i + 1), NOTE_X, y, 0.4, 0.6, { fontFace: HEAD, fontSize: 24, bold: true, color: RED });
    text(s, t, NOTE_X + 0.45, y + 0.04, NOTE_W - 0.45, 0.65, { fontFace: 'Cambria', fontSize: 18 });
    s.addShape(pres.shapes.LINE, { x: NOTE_X, y: y + 0.72, w: NOTE_W, h: 0, line: { color: HAIR_HEX, width: 0.75 } });
  });
  source(s, 'DEMO_GUIDE.md, steps 1-5; screenshot of the live RAG Live view, 1 November 2026.');
}

// 10 Engineering
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Engineering', 'Page 10', 'Engineering', 'One small Azure VM, deployed automatically and closed to writes');
  const items = [['DEPLOYMENT', 'One VM, five containers', 'Azure B2als_v2: 2 vCPU, 4 GB. Docker Compose with TLS.'],
    ['CI / CD', 'Tested, then shipped', 'Every pull request runs the tests. A push to main deploys and rolls back if unhealthy.'],
    ['SECURITY', 'Read-open, write-closed', 'Writes need a password. Key routes return 401. Every public route is rate-limited.']];
  const cw = CW / 3;
  items.forEach(([l, h, p], i) => {
    const x = M + i * cw, pad = i === 0 ? 0 : 0.3;
    if (i > 0) vrule(s, x, 3.0, 5.9);
    text(s, l, x + pad, 3.05, cw - 0.6, 0.25, { fontFace: LABEL, fontSize: 9.5, bold: true, color: RED, charSpacing: 2 });
    text(s, h, x + pad, 3.35, cw - 0.6, 0.5, { fontFace: HEAD, fontSize: 22, bold: true });
    text(s, p, x + pad, 3.95, cw - 0.6, 1.9, { fontFace: 'Cambria', fontSize: 18, color: INK2 });
  });
  source(s, 'deploy/azure/README.md (VM size); .github/workflows/tests.yml, dashboard.yml, deploy-azure.yml; deploy/azure/Caddyfile; README.md, What works live; SESSION_HANDOFF.md 29.17.2.');
}

// 11 Limits
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Corrections and limits', 'Page 11', 'Honest limits', 'Two of the four signals failed on real traces, and the evidence base is small');
  ntable(s, ['Limit', 'Evidence'], [
    { cells: ['Inter-agent disagreement', '0 of 10 found'], red: 1 }, { cells: ['Tool-claim check', 'F1 0.000'], red: 1 },
    { cells: ['Labelled grounding cases', '68'] }, { cells: ['Sessions long enough for drift', '24.5%'] },
    { cells: ['Deployment', '1 VM, 1 SQLite file'] }], M, 2.65, EX_W, [4.55, 2.6]);
  vrule(s, RULE_X, BODY_Y + 0.1, BODY_B - 0.1);
  pull(s, [{ text: 'Grounding and drift are the two signals that ' }, { text: 'held up', red: 1 }, { text: '.' }], NOTE_X, 3.2, NOTE_W, 1.2);
  text(s, 'The two failed alerts are withdrawn, not hidden.', NOTE_X, 4.65, NOTE_W, 0.8, { fontFace: 'Cambria', fontSize: 17, color: INK2 });
  source(s, 'README.md, Known limits; COMPETITIVE_POSITIONING.md 5.2; TOOL_CLAIM_EXTERNAL_TEST_REPORT.md section 10; GROUNDING_RECALIBRATION_2026-10.md; DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md 11.5.');
}

// 12 Conclusions
{
  const s = slide('PAGE', 'Talk');
  page(s, 'Conclusions', 'Page 12', 'Conclusions', 'Conclusions');
  const items = [[{ text: 'Every span can be scored on a CPU without an LLM judge: ' }, { text: '202.94 ms', b: 1 }, { text: ' per case.' }],
    [{ text: 'Grounding (F1 ' }, { text: '0.963', b: 1 }, { text: ') and drift held up; two other signals failed and are withdrawn.' }],
    [{ text: 'It is live, tested (' }, { text: '628 + 404', b: 1 }, { text: ') and open to examiners.' }]];
  items.forEach((runs, i) => {
    const y = 2.75 + i * 1.12;
    text(s, String(i + 1), M, y, 0.5, 0.75, { fontFace: HEAD, fontSize: 32, bold: true, color: RED });
    s.addText(runs.map((r) => ({ text: r.text, options: r.b ? { bold: true } : {} })), { x: M + 0.6, y: y + 0.06, w: EX_W - 0.6, h: 0.9, isTextBox: true, margin: 0, fontFace: 'Cambria', fontSize: 20, color: INK, valign: 'top' });
    s.addShape(pres.shapes.LINE, { x: M, y: y + 1.0, w: EX_W, h: 0, line: { color: HAIR_HEX, width: 0.75 } });
  });
  vrule(s, RULE_X, BODY_Y + 0.1, BODY_B - 0.1);
  s.addText([{ text: 'Next: ', options: { bold: true } }, { text: 'more labelled data, a server database, test-gated deploys.' }], { x: NOTE_X, y: 3.0, w: NOTE_W, h: 0.9, isTextBox: true, margin: 0, fontFace: 'Cambria', fontSize: 17, color: INK2, valign: 'top' });
  text(s, 'SOMNATH REDDY', NOTE_X, 4.1, NOTE_W, 0.3, { fontFace: LABEL, fontSize: 11, bold: true, charSpacing: 2 });
  text(s, 'agentpulse.centralindia.\ncloudapp.azure.com\ngithub.com/Soum-Code/agentpulse', NOTE_X, 4.5, NOTE_W, 1.0, { fontFace: MONO, fontSize: 12, color: INK2 });
  source(s, 'LLM_JUDGE_COMPARISON_REPORT.md; GROUNDING_RECALIBRATION_2026-10.md T3c; README.md, Testing and benchmarks (2026-10-27).');
}

// =================== APPENDIX ===================
pres.addSection({ title: 'Appendix (Q&A)' });

// A1
{
  const s = slide('PAGE', 'Appendix (Q&A)');
  page(s, 'Appendix A1', 'For questions', 'Appendix · the 0.3 weight', 'After a label-order bug was fixed, 0.5 flagged 7 of 17 correct answers; 0.3 flags 1', true);
  ntable(s, ['Neutral weight', 'F1', 'False alarms'], [
    { cells: ['0.0 to 0.3', '0.963', '0.059'], red: 1 }, { cells: ['0.4', '0.897', '0.176'] }, { cells: ['0.5', '0.788', '0.412'] }], M, 3.0, EX_W, [3.55, 1.6, 2.0]);
  caption(s, 'Test split, cut-off 0.4, corrected labels. At the 0.7 cut-off every weight up to 0.6 gives the same result.', null, M, 5.3, EX_W, 0.6);
  notecol(s, [{ text: 'Before 21 October the code read two DeBERTa labels in swapped order. PR #69 fixed it; every figure was re-measured.', h: 2.0 }], 3.1);
  source(s, 'GROUNDING_RECALIBRATION_2026-10.md, banner and findings 4-7 (T3c, T5b, T7); PR #69; PR #89.');
}

// A2
{
  const s = slide('PAGE', 'Appendix (Q&A)');
  page(s, 'Appendix A2', 'For questions', 'Appendix · negative results', 'Both withdrawn signals looked good on hand-written cases and failed on real traces', true);
  ntable(s, ['Signal', 'Hand-written', 'Real traces'], [
    { cells: ['Tool-claim check, F1', '0.842', '0.000'] }, { cells: ['Inter-agent disagreement', '—', '0 of 10 found'] }], M, 3.0, EX_W, [3.35, 1.7, 2.1]);
  caption(s, 'Tool-claim: 19 hand-written cases; no claim found in 8,353 real prose spans. Disagreement: AUC 0.457 without the planner, which is chance.', null, M, 4.85, EX_W, 0.8);
  notecol(s, [{ text: 'Real agents write counts in words, not digits; the tool-claim check only reads digits.', h: 1.6 }], 3.1);
  source(s, 'TOOL_CLAIM_EXTERNAL_TEST_REPORT.md section 10; COMPETITIVE_POSITIONING.md 5.1, 5.2; SESSION_HANDOFF.md 14.1, 24.9.5.');
}

// A3
{
  const s = slide('PAGE', 'Appendix (Q&A)');
  page(s, 'Appendix A3', 'For questions', 'Appendix · Telemetry Lab', 'A fault injected in the Lab becomes a scored trace and a HIGH incident', true);
  const hw = (CW - 0.6) / 2, ph = 3.4;
  photo(s, 'live_lab.jpg', M, 2.45, hw, ph);
  caption(s, 'Five scenarios; the agent text is fixed, the evaluator is real.', 'Photo: live site', M, 2.45 + ph + 0.1, hw, 0.5);
  vrule(s, M + hw + 0.3, 2.45, 6.6);
  photo(s, 'live_incidents.jpg', M + hw + 0.6, 2.45, hw, ph);
  caption(s, 'Lab runs of 27 October: GROUNDING_FAILURE for analyst, risk 0.999.', 'Photo: live site', M + hw + 0.6, 2.45 + ph + 0.1, hw, 0.5);
  source(s, 'HOW_IT_WORKS.md, Telemetry Lab; docs/E2E_TEST_2026-10-27.md, items 11, 12 and 22.');
}

// A4 References
{
  const s = slide('PAGE', 'Appendix (Q&A)');
  page(s, 'References', 'For questions', 'References', 'Every figure in this deck comes from these documents in the repository', true);
  const left = ['README.md (state of 2026-10-27)', 'docs/E2E_TEST_2026-10-27.md', 'GROUNDING_RECALIBRATION_2026-10.md', 'DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md', 'LLM_JUDGE_COMPARISON_REPORT.md', 'TOOL_CLAIM_EXTERNAL_TEST_REPORT.md', 'COMPETITIVE_POSITIONING.md'];
  const right = ['HOW_IT_WORKS.md; DEMO_GUIDE.md', 'benchmarks/benchmark_results.json', 'experiments/results/ablation_results.json', 'deploy/azure/README.md; .github/workflows/', 'SESSION_HANDOFF.md, sections 14, 24, 29', 'Models: sentence-transformers/all-MiniLM-L6-v2; cross-encoder/nli-deberta-v3-small'];
  const hw = (CW - 0.6) / 2;
  text(s, left.join('\n'), M, 2.45, hw, 4.1, { fontFace: 'Cambria', fontSize: 15, lineSpacingMultiple: 1.25 });
  vrule(s, M + hw + 0.3, 2.45, 6.6);
  text(s, right.join('\n'), M + hw + 0.6, 2.45, hw, 4.1, { fontFace: 'Cambria', fontSize: 15, lineSpacingMultiple: 1.25 });
  source(s, 'Repository github.com/Soum-Code/agentpulse; model names from HOW_IT_WORKS.md.');
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
