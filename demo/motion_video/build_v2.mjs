// Build the punchier v2 highlight (cuts/highlight_v2.json) as a HyperFrames project.
//
//   node build_v2.mjs --cut cuts/highlight_v2.json --recording <file.webm> --events <events.json>
//
// In short: on top of v1's camera, cursor ring and ripples, v2 has:
// - a 5 s hook (one bold line over a fast montage of real moments);
// - a lower-third instead of a full card at each section, with sections whipping in;
// - a slow push-in (Ken Burns) on every shot;
// - fast-forwarded waits with a badge;
// - big callouts for numbers copied from the run's captions;
// - a thin progress bar with the section names;
// - the end card with the live URL.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_CSS, INK, INK2, GREY, PAPER, RED, esc, loadEvents, outroScene, prepareSource, probeDuration,
  rootHtml, sceneFile, shotScene, words,
} from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1920;
const H = 1080;
const r3 = (v) => Math.round(v * 1000) / 1000;
const WHIP = 0.36; // a section whips in over the last 0.36 s of the one before

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, "")] = argv[i + 1];
const cut = JSON.parse(fs.readFileSync(path.resolve(opt.cut), "utf8"));
const events = loadEvents(path.resolve(opt.events));
const dir = path.join(HERE, "build", cut.id);
fs.rmSync(path.join(dir, "compositions"), { recursive: true, force: true });
fs.mkdirSync(path.join(dir, "compositions"), { recursive: true });
fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", assets: "assets" }, media: { autoProxy: true } }, null, 2));
const src = prepareSource(path.resolve(opt.recording), path.join(dir, "assets"));
probeDuration(src);

// ---------------------------------------------------------------------------------------
// Hook: real moments cut fast, one bold line slammed on a paper band
// ---------------------------------------------------------------------------------------

function hookScene(id, h) {
  let t = 0;
  const vids = [];
  const L = [];
  h.clips.forEach((c, i) => {
    const d = r3(c.out - c.in);
    vids.push(`<div class="hk-shot" id="${id}-s${i}"><video id="${id}-v${i}" class="clip" src="assets/recording.mp4" muted playsinline data-start="${r3(t)}" data-duration="${d}" data-media-start="${r3(c.in)}" data-track-index="0"></video></div>`);
    L.push(`tl.fromTo("#${id}-s${i}", { scale: 1.16 }, { scale: 1.04, duration: ${d}, ease: "power2.out" }, ${r3(t)});`);
    t += d;
  });
  const n = h.line.split(/\s+/).filter(Boolean).length;
  for (let i = 0; i < n; i++) {
    L.push(`tl.fromTo("#${id}-w${i}", { opacity: 0, scale: 1.7, filter: "blur(8px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.16, ease: "power4.out" }, ${r3(0.35 + i * 0.13)});`);
  }
  L.push(`tl.fromTo("#${id}-band", { clipPath: "inset(0% 50% 0% 50%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.3, ease: "power3.out" }, 0.1);`);
  L.push(`tl.fromTo("#${id}-k", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.3);`);
  const css = `
    #root { position: absolute; inset: 0; background: #000; overflow: hidden; }
    .hk-shot { position: absolute; inset: 0; transform-origin: 50% 50%; }
    .hk-shot video { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
    .hk-dim { position: absolute; inset: 0; background: rgba(10, 9, 8, 0.38); }
    .hk-band { position: absolute; left: 0; right: 0; top: 372px; height: 336px; background: ${PAPER};
      border-top: 7px double ${INK}; border-bottom: 7px double ${INK}; box-shadow: 0 20px 60px rgba(0,0,0,0.55); }
    .hk-k { position: absolute; left: 0; right: 0; top: 30px; text-align: center; font-family: 'Inter', sans-serif;
      font-weight: 700; font-size: 30px; letter-spacing: 0.18em; text-transform: uppercase; color: ${RED}; }
    .hk-line { position: absolute; left: 60px; right: 60px; top: 92px; text-align: center; font-family: 'Playfair Display', serif;
      font-weight: 900; font-size: 128px; line-height: 1.05; letter-spacing: -0.02em; color: ${INK}; }
    .hk-line .acc { color: ${RED}; }
    .w { display: inline-block; }`;
  const body = `
    ${vids.join("\n    ")}
    <div class="hk-dim"></div>
    <div class="hk-band" id="${id}-band">
      <div class="hk-k" id="${id}-k">${esc(h.kicker)}</div>
      <div class="hk-line">${words(h.line, id)}</div>
    </div>`;
  const script = `
    const tl = gsap.timeline({ paused: true });
    ${L.join("\n    ")}
    tl.set({}, {}, ${r3(h.dur)});
    window.__timelines["${id}"] = tl;`;
  return sceneFile(id, css, body, script);
}

// ---------------------------------------------------------------------------------------
// Progress bar: a thin strip at the bottom edge, below the site's dock
// ---------------------------------------------------------------------------------------

function progressScene(id, segs, dur) {
  const L = [];
  const els = segs.map((s, i) => {
    const left = (s.start / dur) * 100;
    const width = ((s.end - s.start) / dur) * 100;
    L.push(`tl.to("#${id}-n${i}", { color: "${INK}", duration: 0.15 }, ${r3(s.start)});`);
    L.push(`tl.to("#${id}-n${i}", { color: "${GREY}", duration: 0.15 }, ${r3(Math.max(s.start + 0.2, s.end - 0.05))});`);
    return `<div class="pg-seg" style="left: ${left.toFixed(3)}%; width: ${width.toFixed(3)}%"><span id="${id}-n${i}">${esc(s.name)}</span></div>`;
  });
  L.unshift(`tl.fromTo("#${id}-fill", { scaleX: 0 }, { scaleX: 1, duration: ${r3(dur)}, ease: "none" }, 0);`);
  L.unshift(`tl.fromTo("#${id}-bar", { y: 40 }, { y: 0, duration: 0.4, ease: "power3.out" }, 0);`);
  const css = `
    #root { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .pg { position: absolute; left: 0; right: 0; bottom: 0; height: 32px; background: rgba(244, 240, 230, 0.94);
      border-top: 1px solid ${INK}; }
    .pg-fill { position: absolute; left: 0; right: 0; top: -1px; height: 5px; background: ${RED}; transform-origin: 0 50%; }
    .pg-seg { position: absolute; top: 0; bottom: 0; border-left: 1px solid rgba(20,20,20,0.35); }
    .pg-seg span { position: absolute; left: 10px; top: 7px; white-space: nowrap; font-family: 'IBM Plex Mono', monospace;
      font-size: 17px; letter-spacing: 0.08em; text-transform: uppercase; color: ${GREY}; }`;
  const body = `
    <div class="pg" id="${id}-bar" data-layout-allow-overflow>
      <div class="pg-fill" id="${id}-fill"></div>
      ${els.join("\n      ")}
    </div>`;
  const script = `
    const tl = gsap.timeline({ paused: true });
    ${L.join("\n    ")}
    tl.set({}, {}, ${r3(dur)});
    window.__timelines["${id}"] = tl;`;
  return sceneFile(id, css, body, script);
}

// ---------------------------------------------------------------------------------------

const hosts = [];
const report = [];
const marks = [];
const write = (id, html) => fs.writeFileSync(path.join(dir, "compositions", `${id}.html`), html);

write("hook", hookScene("hook", cut.hook));
hosts.push({ id: "hook", start: 0, dur: cut.hook.dur, card: false });
let t = cut.hook.dur;
let n = 0;
const segs = [];
cut.sections.forEach((sec, si) => {
  const secStart = t - WHIP;
  sec.clips.forEach((c, ci) => {
    const shot = {
      in: c.in, out: c.out, rate: c.rate ?? 1, zoom: c.zoom,
      settle: ci > 0, dipOut: ci < sec.clips.length - 1,
      whipIn: ci === 0, kb: cut.kenBurns, callouts: c.callouts,
      lower: ci === 0 ? sec.lower : null,
    };
    shot.events = events.filter((e) => e.t >= shot.in && e.t < shot.out);
    const id = `v${String(++n).padStart(2, "0")}`;
    const built = shotScene(id, shot, "recording.mp4", cut);
    write(id, built.html);
    const start = ci === 0 ? t - WHIP : t;
    hosts.push({ id, start, dur: built.dur });
    for (const m of built.marks) marks.push({ ...m, shot: id, t: r3(start + m.t), section: sec.name });
    for (const co of c.callouts || []) marks.push({ action: "callout", label: `${co.big} ${co.label}`, shot: id, t: r3(start + (co.at - shot.in) / shot.rate + 0.6), section: sec.name });
    report.push(`${id}  src ${shot.in.toFixed(1)}-${shot.out.toFixed(1)} s  x${shot.rate}  -> ${start.toFixed(1)}-${(start + built.dur).toFixed(1)} s  zooms ${built.zooms}  [${sec.name}]`);
    t = start + built.dur;
  });
  segs.push({ name: sec.name, start: secStart, end: t });
});

const outro = { id: "outro", start: t - 0.55, dur: cut.outro.dur, card: true };
write("outro", outroScene("outro", cut.outro, outro.dur));
hosts.push(outro);
const total = outro.start + outro.dur;

// The progress bar runs from the first section to the end card.
const pStart = segs[0].start;
const pDur = outro.start + 0.3 - pStart;
write("progress", progressScene("progress", segs.map((s) => ({ ...s, start: s.start - pStart, end: s.end - pStart })), pDur));
hosts.push({ id: "progress", start: pStart, dur: pDur, card: true });

fs.writeFileSync(path.join(dir, "index.html"), rootHtml(cut.id, hosts, total));
fs.writeFileSync(path.join(dir, "shots.txt"), report.join("\n") + "\n");
fs.writeFileSync(path.join(dir, "marks.json"), JSON.stringify({ total: r3(total), marks, sections: segs }, null, 2));
console.log(report.join("\n"));
console.log(`\n${cut.id}: ${hosts.length} scenes, ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})`);
