// Build a HyperFrames project from the auto-demo recording and its events.json.
//
// In short: a cut file (cuts/*.json) lists which stretches of the recording to keep, grouped
// into sections. This script turns it into HyperFrames HTML: one scene per kept stretch (the
// footage, a camera that zooms onto every element the demo clicks, a cursor ring and a click
// ripple), a newspaper-style card before each section, an opening card and a closing card.
// Everything on screen comes from the recording or from the cut file; no number is invented.
//
//   node build.mjs --cut cuts/highlight.json --recording <file.webm> --events <events.json>
//
// Writes build/<cut id>/ (a HyperFrames project; render it with render.mjs or the CLI).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1920;
const H = 1080;
const FPS = 30;

// ---------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------

function args() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^--/, "")] = a[i + 1];
  if (!out.cut) throw new Error("usage: node build.mjs --cut cuts/x.json --recording <video> --events <events.json>");
  return out;
}

// ---------------------------------------------------------------------------------------
// events.json: accept the field names the auto-demo may use, return one flat list
// ---------------------------------------------------------------------------------------

// In short: every event becomes {t, action, label, box:{x,y,w,h}|null, dur, raw}.
export function loadEvents(file) {
  if (!file || !fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(j) ? j : j.events || [];
  const num = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));
  return list
    .map((e) => {
      const b = e.bbox || e.box || e.rect || e.bounding_box || null;
      const box = b
        ? { x: num(b.x ?? b.left), y: num(b.y ?? b.top), w: num(b.width ?? b.w), h: num(b.height ?? b.h) }
        : null;
      return {
        t: num(e.t ?? e.time ?? e.ts ?? e.video_t ?? e.at),
        action: String(e.action ?? e.type ?? e.kind ?? "").toLowerCase(),
        label: String(e.label ?? e.element ?? e.name ?? e.text ?? ""),
        box: box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0 ? box : null,
        dur: num(e.dur ?? e.duration),
        raw: e,
      };
    })
    .filter((e) => Number.isFinite(e.t))
    .sort((p, q) => p.t - q.t);
}

// Actions the camera follows. A caption or a scroll moves no camera.
const POINT_ACTIONS = new Set(["click", "type", "fill", "press", "spot", "focus", "hover", "select"]);
const CLICK_ACTIONS = new Set(["click", "press", "select"]);

// ---------------------------------------------------------------------------------------
// Camera: where to zoom, and for how long
// ---------------------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

// In short: the scale that frames the box with room around it, and the x/y that put its
// centre in the middle without ever showing the edge of the recording.
export function frameFor(box, maxScale) {
  const s = clamp(Math.min((W * 0.4) / box.w, (H * 0.4) / box.h), 1.3, maxScale);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const x = clamp(W / 2 - s * cx, W - W * s, 0);
  const y = clamp(H / 2 - s * cy, H - H * s, 0);
  return { s: r3(s), x: r3(x), y: r3(y) };
}

// In short: turn the point events of one shot into camera holds. Events closer than `gap`
// seconds share one zoom: the camera pans from one to the next instead of zooming out between.
export function cameraPlan(points, shotDur, opt) {
  const { lead = 1.0, tail = 1.3, gap = 2.6, maxScale = 1.75 } = opt;
  const holds = [];
  for (const p of points) {
    const f = frameFor(p.box, maxScale);
    const start = Math.max(0, p.t - lead);
    const end = Math.min(shotDur, p.t + (p.dur ?? 0) + tail);
    const last = holds[holds.length - 1];
    if (last && start - last.end < gap) {
      last.end = Math.max(last.end, end);
      last.stops.push({ t: Math.max(last.stops[last.stops.length - 1].t + 0.5, start), f });
    } else {
      holds.push({ start, end, stops: [{ t: start, f }] });
    }
  }
  return holds;
}

// ---------------------------------------------------------------------------------------
// Look: the viva deck's paper, ink and one deep red
// ---------------------------------------------------------------------------------------

const PAPER = "#f4f0e6";
const INK = "#141414";
const INK2 = "#3d3a35";
const GREY = "#6b665d";
const RED = "#a4161a";
const STAGE = "#2b2925";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// In short: headline words become spans so they can blur in one by one; *word* is the red accent.
function words(text, idp) {
  let on = false; // inside *...*, which may span several words
  return String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const opens = w.startsWith("*");
      const closes = /\*[.,:;!?]?$/.test(w);
      const accent = on || opens;
      on = (on || opens) && !closes;
      const clean = w.replace(/\*/g, "");
      return `<span class="w${accent ? " acc" : ""}" id="${idp}-w${i}">${esc(clean)}</span>`;
    })
    .join(" ");
}

const CARD_CSS = `
  #root { position: absolute; inset: 0; background: transparent; color: ${INK}; overflow: hidden; }
  .sheet { position: absolute; inset: 0; background: ${PAPER}; }
  .ears { position: absolute; left: 110px; right: 110px; top: 46px; display: grid;
    grid-template-columns: 1fr auto 1fr; font-family: 'Inter', sans-serif; font-size: 26px;
    letter-spacing: 0.14em; text-transform: uppercase; color: ${INK2}; padding-bottom: 12px; }
  .ears .c { text-align: center; } .ears .r { text-align: right; }
  .rule { position: absolute; left: 110px; right: 110px; height: 7px;
    border-top: 3px solid ${INK}; border-bottom: 1px solid ${INK}; transform-origin: 0 50%; }
  .kicker { position: absolute; left: 110px; font-family: 'Inter', sans-serif; font-weight: 700;
    font-size: 30px; letter-spacing: 0.16em; text-transform: uppercase; color: ${RED}; }
  .head { position: absolute; left: 110px; right: 110px; font-family: 'Playfair Display', serif;
    font-weight: 800; line-height: 1.07; letter-spacing: -0.01em; color: ${INK}; }
  .head .acc { color: ${RED}; }
  .w { display: inline-block; }
  .deck { position: absolute; left: 110px; right: 360px; font-family: 'EB Garamond', serif;
    font-size: 38px; line-height: 1.3; color: ${INK2}; }
  .mast { position: absolute; left: 0; right: 0; text-align: center; font-family: 'Playfair Display', serif;
    font-weight: 900; letter-spacing: -0.02em; color: ${INK}; }
  .motto { position: absolute; left: 0; right: 0; text-align: center; font-family: 'EB Garamond', serif;
    font-style: italic; font-size: 34px; color: ${INK2}; }
  .url { position: absolute; left: 0; right: 0; text-align: center; font-family: 'IBM Plex Mono', monospace;
    font-size: 46px; color: ${INK}; }
  .url span { border-bottom: 4px solid ${RED}; padding-bottom: 6px; }
  .foot { position: absolute; left: 110px; right: 110px; bottom: 54px; border-top: 1px solid ${INK};
    padding-top: 14px; display: flex; justify-content: space-between; font-family: 'Inter', sans-serif;
    font-size: 28px; letter-spacing: 0.04em; color: ${GREY}; }
`;

// In short: the shared entrance of every card: the double rule draws, the kicker fades in,
// the headline words blur in a frame or two apart, the deck line follows. Then nothing moves
// until the card leaves: it wipes upward and uncovers the footage under it.
function cardTimeline(id, nWords, extra = "") {
  return `
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#${id}-sheet", { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power3.inOut" }, 0);
    tl.fromTo("#${id} .rule", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "expo.out", stagger: 0.08 }, 0.35);
    tl.fromTo("#${id} .ears, #${id} .kicker", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0.45);
    for (let i = 0; i < ${nWords}; i++) {
      tl.fromTo("#${id}-w" + i, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.16, ease: "power2.out" }, 0.6 + i * 0.067);
    }
    tl.fromTo("#${id} .deck, #${id} .foot", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" }, 0.75 + ${nWords} * 0.067);
    ${extra}
    window.__timelines["${id}"] = tl;`;
}

function sceneFile(id, css, body, script) {
  return `<template>
  <style>${css}</style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-layout-allow-overflow>
${body}
  </div>
  <script>${script}
  </script>
</template>
`;
}

// The opening card: masthead, double rule, the one-line promise, and where the footage is from.
function introScene(id, c, dur) {
  const head = c.head;
  const n = head.split(/\s+/).filter(Boolean).length;
  const body = `
    <div class="sheet" id="${id}-sheet">
      <div class="ears"><span>${esc(c.earLeft)}</span><span class="c">${esc(c.earCenter)}</span><span class="r">${esc(c.earRight)}</span></div>
      <div class="rule" style="top: 98px"></div>
      <div class="mast" id="${id}-mast" style="top: 150px; font-size: 200px; line-height: 1">AgentPulse</div>
      <div class="motto" style="top: 372px">${esc(c.motto)}</div>
      <div class="rule" style="top: 438px"></div>
      <div class="head" style="top: 500px; font-size: 80px; text-align: center; text-wrap: balance">${words(head, id)}</div>
      <div class="deck" style="top: 735px; left: 110px; right: 110px; text-align: center">${esc(c.deck)}</div>
      <div class="foot"><span>${esc(c.footLeft)}</span><span>${esc(c.footRight)}</span></div>
    </div>`;
  const exit = `tl.to("#${id}-sheet", { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: "power3.in" }, ${r3(dur - 0.55)});
    tl.fromTo("#${id}-mast", { opacity: 0, filter: "blur(10px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, 0.2);`;
  // The opening card starts already on paper (no wipe in): override the sheet tween's start.
  const script = cardTimeline(id, n, exit).replace(
    `{ clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55`,
    `{ clipPath: "inset(0% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.01`,
  );
  return sceneFile(id, CARD_CSS, body, script);
}

// A section card: kicker, headline, one deck line. It wipes in over the outgoing footage and
// wipes up off the incoming footage.
function sectionScene(id, c, dur, index, total) {
  const n = c.title.split(/\s+/).filter(Boolean).length;
  const body = `
    <div class="sheet" id="${id}-sheet">
      <div class="ears"><span>AgentPulse · live demo</span><span class="c">${esc(c.ear || "")}</span><span class="r">Part ${index} of ${total}</span></div>
      <div class="rule" style="top: 98px"></div>
      <div class="kicker" style="top: 360px">${esc(c.kicker || "")}</div>
      <div class="head" style="top: 412px; font-size: 96px; text-wrap: balance">${words(c.title, id)}</div>
      ${c.deck ? `<div class="deck" style="top: 680px">${esc(c.deck)}</div>` : ""}
    </div>`;
  const exit = `tl.to("#${id}-sheet", { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: "power3.in" }, ${r3(dur - 0.55)});`;
  return sceneFile(id, CARD_CSS, body, cardTimeline(id, n, exit));
}

// The closing card: the live URL, underlined in red, and the code address.
function outroScene(id, c, dur) {
  const n = c.head.split(/\s+/).filter(Boolean).length;
  const body = `
    <div class="sheet" id="${id}-sheet">
      <div class="ears"><span>AgentPulse · live demo</span><span class="c">${esc(c.earCenter || "")}</span><span class="r">${esc(c.earRight || "")}</span></div>
      <div class="rule" style="top: 98px"></div>
      <div class="kicker" style="top: 300px; left: 0; right: 0; text-align: center">${esc(c.kicker)}</div>
      <div class="head" style="top: 350px; font-size: 104px; text-align: center">${words(c.head, id)}</div>
      <div class="url" id="${id}-url" style="top: 560px"><span>${esc(c.url)}</span></div>
      <div class="deck" style="top: 680px; left: 110px; right: 110px; text-align: center">${esc(c.deck)}</div>
      <div class="foot"><span>${esc(c.footLeft)}</span><span>${esc(c.footRight)}</span></div>
    </div>`;
  const extra = `tl.fromTo("#${id}-url", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.2, ease: "power3.out" }, ${r3(0.9 + n * 0.067)});`;
  return sceneFile(id, CARD_CSS, body, cardTimeline(id, n, extra));
}

// ---------------------------------------------------------------------------------------
// A footage shot: the recording, a camera, a cursor ring and click ripples
// ---------------------------------------------------------------------------------------

const SHOT_CSS = `
  #root { position: absolute; inset: 0; background: ${STAGE}; overflow: hidden; }
  .cam { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 0 0; }
  .cam video { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: contain; }
  .ring { position: absolute; left: 0; top: 0; width: 38px; height: 38px; margin: -19px 0 0 -19px;
    border-radius: 50%; border: 3px solid ${RED}; background: transparent;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.9), 0 6px 18px rgba(0,0,0,0.35); opacity: 0; }
  .ripple { position: absolute; left: 0; top: 0; width: 38px; height: 38px; margin: -19px 0 0 -19px;
    border-radius: 50%; border: 3px solid ${RED}; opacity: 0; }
  .dip { position: absolute; inset: 0; background: #000; opacity: 0; }
  .rate { position: absolute; right: 40px; top: 36px; padding: 8px 14px 9px; background: ${PAPER};
    color: ${INK}; border-top: 3px double ${INK}; font-family: 'IBM Plex Mono', monospace; font-size: 28px;
    letter-spacing: 0.04em; box-shadow: 0 6px 18px rgba(0,0,0,0.35); opacity: 0; }
  .rate b { color: ${RED}; }
`;

function shotScene(id, shot, srcName, opt) {
  const dur = r3((shot.out - shot.in) / shot.rate);
  const toLocal = (t) => (t - shot.in) / shot.rate;
  const pts = shot.events
    .filter((e) => POINT_ACTIONS.has(e.action) && e.box)
    .map((e) => ({ ...e, t: toLocal(e.t), dur: e.dur !== undefined ? e.dur / shot.rate : undefined }))
    .filter((e) => e.t > 0.3 && e.t < dur - 0.2);
  const holds = shot.zoom === false ? [] : cameraPlan(pts, dur, opt.camera || {});
  const clicks = pts.filter((e) => CLICK_ACTIONS.has(e.action) || e.action === "type" || e.action === "fill");

  const L = [];
  // In short: a cut inside a section lands slightly large and settles, so it reads as meant.
  // In short: camera moves never overlap; each starts when the one before it has finished.
  let camFree = 0;
  const camTo = (f, at, d, ease = "power2.inOut") => {
    const start = Math.max(at, camFree);
    const len = Math.min(d, dur - 0.02 - start);
    if (len < 0.1) return;
    L.push(`tl.to("#${id}-cam", { scale: ${f.s}, x: ${f.x}, y: ${f.y}, duration: ${r3(len)}, ease: "${ease}" }, ${r3(start)});`);
    camFree = start + len;
  };
  if (shot.settle) {
    L.push(`tl.fromTo("#${id}-cam", { scale: 1.035, x: ${r3(-W * 0.0175)}, y: ${r3(-H * 0.0175)} }, { scale: 1, x: 0, y: 0, duration: 0.5, ease: "power3.out" }, 0);`);
    camFree = 0.5;
  } else L.push(`tl.set("#${id}-cam", { scale: 1, x: 0, y: 0 }, 0);`);
  for (const h of holds) {
    h.stops.forEach((st, i) => camTo(st.f, st.t, i === 0 ? 0.9 : 0.75));
    camTo({ s: 1, x: 0, y: 0 }, Math.min(h.end, dur - 0.85), 0.8);
  }
  // Cursor ring: it appears near the previous target (or the centre), glides to the element,
  // and a ripple spreads on the click.
  const ringEls = [];
  let prev = { x: W * 0.5, y: H * 0.56 };
  clicks.forEach((c, i) => {
    const tx = r3(c.box.x + c.box.w / 2);
    const ty = r3(c.box.y + c.box.h / 2);
    const appear = Math.max(0.05, c.t - 1.15);
    ringEls.push(`<div class="ring" id="${id}-ring${i}"></div><div class="ripple" id="${id}-rip${i}"></div>`);
    L.push(`tl.fromTo("#${id}-ring${i}", { x: ${r3(prev.x)}, y: ${r3(prev.y)}, opacity: 0, scale: 1 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, ${r3(appear)});`);
    L.push(`tl.to("#${id}-ring${i}", { x: ${tx}, y: ${ty}, duration: ${r3(Math.min(0.75, c.t - appear - 0.12))}, ease: "power3.inOut" }, ${r3(appear + 0.05)});`);
    L.push(`tl.to("#${id}-ring${i}", { scale: 0.78, duration: 0.09, ease: "power2.in" }, ${r3(c.t - 0.06)});`);
    L.push(`tl.to("#${id}-ring${i}", { scale: 1, duration: 0.22, ease: "power2.out" }, ${r3(c.t + 0.03)});`);
    L.push(`tl.fromTo("#${id}-rip${i}", { x: ${tx}, y: ${ty}, scale: 1, opacity: 0.9 }, { scale: 3.4, opacity: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, ${r3(c.t)});`);
    L.push(`tl.to("#${id}-ring${i}", { opacity: 0, duration: 0.3, ease: "power2.in" }, ${r3(Math.min(dur - 0.35, c.t + 0.9))});`);
    prev = { x: tx, y: ty };
  });
  // Speed-up label: the footage is faster than real time here, and the frame says so.
  let rateEl = "";
  if (shot.rate > 1.01) {
    rateEl = `<div class="rate" id="${id}-rate">Waiting, shown at <b>${shot.rate}×</b> speed</div>`;
    L.push(`tl.fromTo("#${id}-rate", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.15);`);
    L.push(`tl.to("#${id}-rate", { opacity: 0, duration: 0.2 }, ${r3(Math.max(0.5, dur - 0.3))});`);
  }
  // Dip: the last three frames darken before a cut inside a section.
  if (shot.dipOut) L.push(`tl.fromTo("#${id}-dip", { opacity: 0 }, { opacity: 0.4, duration: ${r3(3 / FPS)}, ease: "none" }, ${r3(dur - 3 / FPS - 0.001)});`);

  const body = `
    <div class="cam" id="${id}-cam">
      <video id="${id}-v" class="clip" src="assets/${srcName}" muted playsinline data-start="0" data-duration="${dur}"
        data-media-start="${r3(shot.in)}"${shot.rate !== 1 ? ` data-playback-rate="${shot.rate}"` : ""} data-track-index="0"></video>
      ${ringEls.join("\n      ")}
    </div>
    ${rateEl}
    <div class="dip" id="${id}-dip"></div>`;
  const script = `
    const tl = gsap.timeline({ paused: true });
    ${L.join("\n    ")}
    tl.set({}, {}, ${dur});
    window.__timelines["${id}"] = tl;`;
  const marks = pts.map((e) => ({ t: r3(e.t), action: e.action, label: e.label, box: e.box }));
  return { html: sceneFile(id, SHOT_CSS, body, script), dur, zooms: holds.length, clicks: clicks.length, marks };
}

// ---------------------------------------------------------------------------------------
// Assemble the root composition
// ---------------------------------------------------------------------------------------

function rootHtml(id, hosts, total) {
  const hostEls = hosts
    .map(
      (h, i) => `      <div id="${h.id}" data-composition-id="${h.id}" data-composition-src="compositions/${h.id}.html"
        data-start="${r3(h.start)}" data-duration="${r3(h.dur)}" data-track-index="${h.card ? 2 : 1}" data-track-kind="graphics"
        data-width="${W}" data-height="${H}" style="z-index: ${h.card ? 100 + i : 10 + i}"></div>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${STAGE}; }
      #root { position: relative; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${id}" data-start="0" data-duration="${r3(total)}" data-fps="${FPS}"
      data-width="${W}" data-height="${H}">
${hostEls}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.set({}, {}, ${r3(total)});
      window.__timelines["${id}"] = tl;
    </script>
  </body>
</html>
`;
}

// In short: the recording is re-encoded once to 30 fps H.264 with a short keyframe interval,
// so every frame HyperFrames asks for can be found quickly and exactly.
function prepareSource(recording, assetsDir) {
  const dst = path.join(assetsDir, "recording.mp4");
  const stamp = path.join(assetsDir, "recording.source.txt");
  const key = `${path.resolve(recording)}|${fs.statSync(recording).size}|${fs.statSync(recording).mtimeMs}`;
  if (fs.existsSync(dst) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === key) return dst;
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log(`re-encoding ${recording} -> ${dst}`);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-y", "-i", recording, "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p`,
     "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-g", "15", "-an", "-movflags", "+faststart", dst],
    { stdio: "inherit" },
  );
  fs.writeFileSync(stamp, key);
  return dst;
}

function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(String(out).trim());
}

// In short: inside [a, b], stretches where nothing happens on the recording (no caption, no
// click, no typing) for longer than idle.min seconds play at idle.rate, and the frame says so.
// A caption keeps normal speed long enough to be read (the auto-demo's own rule: 3.5 words a
// second, never under 3.5 s); every other event keeps 1.5 s after and 1.2 s before it.
export function splitIdle(a, b, events, idle) {
  const min = idle.min ?? 8;
  const rate = idle.rate ?? 4;
  const inside = events.filter((e) => e.t >= a && e.t < b && e.action !== "end");
  const keep = inside.map((e) => {
    const text = `${e.raw.head ?? ""} ${e.raw.body ?? ""}`.trim();
    const after = e.action === "caption" ? Math.max(3.5, text.split(/\s+/).length / 3.5) + 1 : 1.5 + (e.dur ?? 0);
    return [e.t - 1.2, e.t + after];
  });
  const clips = [];
  let cur = a;
  let busyUntil = a + (idle.leadIn ?? 2);
  for (const [k0, k1] of [...keep, [b, b]]) {
    const gap = k0 - busyUntil;
    if (gap > min && gap / rate >= (idle.minShown ?? 1.5)) {
      // Long enough to watch sped up: keep it, faster, labelled.
      if (busyUntil > cur) clips.push({ in: cur, out: busyUntil, rate: 1 });
      clips.push({ in: busyUntil, out: k0, rate, idle: true });
      cur = k0;
    } else if (gap > min && idle.cutShort) {
      // Too short to show sped up without a flicker: cut it out; a dip marks the cut.
      if (busyUntil > cur) clips.push({ in: cur, out: busyUntil, rate: 1 });
      cur = k0;
    }
    busyUntil = Math.max(busyUntil, k1);
  }
  clips.push({ in: cur, out: b, rate: 1 });
  return clips.filter((c) => c.out - c.in > 0.4);
}

// In short: a clip edge is seconds (12.5), or an anchor on the recording's own events so a
// cut survives a re-recording: "step 3" (the caption whose text says "Step 3 of"), or
// "click:Launch App" (the first such event at or after the clip start), each with an
// optional offset ("step 3 -0.5", "click:Traces +2.5").
export function resolveTime(v, events, from = 0) {
  if (typeof v === "number") return v;
  if (String(v).trim() === "end") return Infinity;
  const m = String(v).trim().match(/^(.*?)\s*([+-]\s*\d+(?:\.\d+)?)?$/);
  const key = m[1].trim();
  const off = m[2] ? Number(m[2].replace(/\s/g, "")) : 0;
  let hit;
  const step = key.match(/^step\s*(\d+)$/i);
  if (step) {
    const re = new RegExp(`\\bStep ${step[1]} of\\b`);
    hit = events.find((e) => (e.action === "caption" || e.action === "step") &&
      (re.test(JSON.stringify(e.raw)) || Number(e.raw.step) === Number(step[1])));
  } else {
    const [action, ...rest] = key.split(":");
    const label = rest.join(":").toLowerCase();
    hit = events.find((e) => e.t >= from - 0.01 && e.action === action.toLowerCase() && e.label.toLowerCase().includes(label));
  }
  if (!hit) throw new Error(`cut anchor not found in events.json: "${v}"`);
  return hit.t + off;
}

// ---------------------------------------------------------------------------------------

function main() {
  const a = args();
  const cut = JSON.parse(fs.readFileSync(path.resolve(a.cut), "utf8"));
  const recording = path.resolve(a.recording || cut.recording);
  const events = loadEvents(a.events ? path.resolve(a.events) : cut.events);
  const dir = path.join(HERE, "build", cut.id);
  fs.rmSync(path.join(dir, "compositions"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", assets: "assets" }, media: { autoProxy: true } }, null, 2));
  const src = prepareSource(recording, path.join(dir, "assets"));
  const srcDur = probeDuration(src);

  // Resolve every clip edge to seconds, then split long idle stretches when the cut asks for it.
  let cursor = 0; // anchors "click:Label" lookups to the clip being cut, so repeats resolve in order
  const sections = cut.sections.map((sec) => ({
    ...sec,
    clips: sec.clips.flatMap((c) => {
      const a0 = resolveTime(c.in, events, cursor);
      cursor = a0;
      const b0 = resolveTime(c.out, events, cursor);
      const base = { ...c, in: Math.max(0, a0), out: Math.min(srcDur - 0.05, b0) };
      const idle = c.idle ?? sec.idle ?? cut.idle;
      if (!idle || c.rate) return [base];
      // Pieces that touch (a speed change, not a cut) join without a dip or a settle.
      return splitIdle(base.in, base.out, events, idle).map((p, i, all) => ({
        ...base, ...p, cont: i > 0 && Math.abs(all[i - 1].out - p.in) < 0.01,
      }));
    }),
  }));
  const overlap = 0.55; // a card covers the last/first 0.55 s of the footage around it
  const hosts = [];
  let t = 0;
  const report = [];
  const marks = [];

  const intro = { id: "intro", start: 0, dur: cut.intro.dur ?? 5, card: true };
  fs.writeFileSync(path.join(dir, "compositions", "intro.html"), introScene("intro", cut.intro, intro.dur));
  hosts.push(intro);
  t = intro.dur - overlap;

  const shown = sections.filter((s) => s.card !== false);
  let shotN = 0;
  sections.forEach((sec, si) => {
    if (sec.card !== false && si > 0) {
      const id = `card${si}`;
      const dur = sec.cardDur ?? 3.2;
      const start = t - overlap;
      fs.writeFileSync(path.join(dir, "compositions", `${id}.html`), sectionScene(id, sec, dur, shown.indexOf(sec) + 1, shown.length));
      hosts.push({ id, start, dur, card: true });
      t = start + dur - overlap;
    }
    sec.clips.forEach((c, ci) => {
      const shot = {
        in: c.in,
        out: c.out,
        rate: c.rate ?? 1,
        zoom: c.zoom,
        settle: ci > 0 && !c.cont,
        dipOut: ci < sec.clips.length - 1 && !sec.clips[ci + 1].cont,
      };
      shot.events = events.filter((e) => e.t >= shot.in && e.t < shot.out && !(c.skip || []).includes(e.label));
      const id = `s${String(++shotN).padStart(2, "0")}`;
      const built = shotScene(id, shot, "recording.mp4", cut);
      fs.writeFileSync(path.join(dir, "compositions", `${id}.html`), built.html);
      hosts.push({ id, start: t, dur: built.dur });
      for (const m of built.marks) marks.push({ ...m, shot: id, t: r3(t + m.t), section: sec.title || "" });
      report.push(`${id}  src ${shot.in.toFixed(1)}-${shot.out.toFixed(1)} s  x${shot.rate}  -> ${t.toFixed(1)}-${(t + built.dur).toFixed(1)} s  zooms ${built.zooms}  clicks ${built.clicks}  [${sec.title || "first section"}]`);
      t += built.dur;
    });
  });

  const outro = { id: "outro", start: t - overlap, dur: cut.outro.dur ?? 6, card: true };
  fs.writeFileSync(path.join(dir, "compositions", "outro.html"), outroScene("outro", cut.outro, outro.dur));
  hosts.push(outro);
  const total = outro.start + outro.dur;

  fs.writeFileSync(path.join(dir, "index.html"), rootHtml(cut.id, hosts, total));
  fs.writeFileSync(path.join(dir, "shots.txt"), report.join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "marks.json"), JSON.stringify({ total: r3(total), marks }, null, 2));
  console.log(report.join("\n"));
  console.log(`\n${cut.id}: ${hosts.length} scenes, ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}), project in ${dir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
