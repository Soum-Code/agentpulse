// Build one cut and render it to output/<cut id>.mp4 (1920x1080, 30 fps).
//
//   node render.mjs --cut cuts/highlight.json --recording <file.webm> --events <events.json> [--quality delivery]
//
// In short: runs build.mjs, then the pinned HyperFrames CLI from node_modules, with its usage
// telemetry switched off. Needs ffmpeg and ffprobe on PATH and Google Chrome installed.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, "")] = argv[i + 1];
const quality = opt.quality || "delivery";
const buildArgs = argv.filter((_, i) => !["--quality"].includes(argv[i]) && !["--quality"].includes(argv[i - 1]));

execFileSync(process.execPath, [path.join(HERE, "build.mjs"), ...buildArgs], { stdio: "inherit" });

const cut = JSON.parse(fs.readFileSync(path.resolve(opt.cut), "utf8"));
const project = path.join(HERE, "build", cut.id);
const out = path.join(HERE, "output", `${cut.id}.mp4`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const bin = path.join(HERE, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
const r = spawnSync(process.execPath, [bin, "render", "--quality", quality, "--fps", "30", "-o", out], {
  cwd: project,
  stdio: "inherit",
  env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" },
});
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`\nrendered ${out}`);
