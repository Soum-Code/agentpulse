// Contact sheets to check a render without watching it in real time.
//
//   node tools/verify.mjs highlight [--every 4]
//
// In short: writes output/verify/<id>_targets.jpg (one frame at every click/type/spot the camera
// zoomed to, labelled with the element the demo used, so you can see the zoom landed on it)
// and output/verify/<id>_timeline.jpg (one frame every N seconds, end to end).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
const every = Number(process.argv[process.argv.indexOf("--every") + 1]) || 4;
if (!id) throw new Error("usage: node tools/verify.mjs <cut id> [--every 4]");
const video = path.join(HERE, "output", `${id}.mp4`);
const { marks } = JSON.parse(fs.readFileSync(path.join(HERE, "build", id, "marks.json"), "utf8"));
const outDir = path.join(HERE, "output", "verify");
const tmp = path.join(outDir, `${id}_frames`);
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const duration = Number(
  String(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video])).trim(),
);
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const clean = (s) => String(s).replace(/[^A-Za-z0-9 .,()-]/g, " ").slice(0, 40);

function grab(t, label, file) {
  const text = `${t.toFixed(1)} s  ${clean(label)}`;
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf",
    `scale=640:360,drawbox=x=0:y=0:w=640:h=34:color=black@0.7:t=fill,drawtext=${font}:text='${text}':x=10:y=8:fontsize=20:fontcolor=white`,
    file,
  ]);
}

function sheet(pattern, n, cols, file) {
  const rows = Math.ceil(n / cols);
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, pattern), "-vf",
    `tile=${cols}x${rows}:padding=6:color=white`, "-frames:v", "1", "-q:v", "3", file,
  ]);
}

// At the click instant the camera has landed (it arrives ~0.1 s before).
marks.forEach((m, i) => grab(Math.min(m.t, duration - 0.05), `${m.action} ${m.label}`, path.join(tmp, `t_${String(i).padStart(3, "0")}.jpg`)));
if (marks.length) sheet("t_%03d.jpg", marks.length, 4, path.join(outDir, `${id}_targets.jpg`));

let n = 0;
for (let t = 0.5; t < duration; t += every) grab(t, "", path.join(tmp, `l_${String(n++).padStart(3, "0")}.jpg`));
sheet("l_%03d.jpg", n, 6, path.join(outDir, `${id}_timeline.jpg`));
console.log(`${marks.length} targets, ${n} timeline frames -> ${outDir}`);
