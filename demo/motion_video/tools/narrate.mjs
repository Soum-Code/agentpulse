// Add the voice-over in narration.md to a rendered cut.
//
//   node tools/narrate.mjs highlight [--voice "Microsoft Heera"] [--rate 1.0]
//
// In short: speaks every timed line of the "## <cut>" list in narration.md with a Windows
// built-in voice (offline), trims the silence around each clip, and fits each one into its slot,
// which runs until 0.25 s before the next line starts. A clip that is too long is sped up by
// at most 20 %; beyond that the script stops and names the line to shorten. The clips are placed
// at their times, mixed, loudness-normalised (EBU R128, -16 LUFS, peaks under -1.5 dBTP) and
// muxed into output/<cut>_voice.mp4. The silent output/<cut>.mp4 is not touched.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const cut = argv[0];
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const voice = opt("voice", "Microsoft Heera");
const rate = Number(opt("rate", "1.0"));
const MAX_TEMPO = 1.2;
const GAP = 0.25;
if (!cut) throw new Error('usage: node tools/narrate.mjs <cut id> [--voice "Microsoft Heera"] [--rate 1.0]');

const run = (cmd, args) => String(execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }));
const probe = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());

// In short: read "- [mm:ss.s] text" lines under the "## <cut>" heading.
function readLines() {
  const md = fs.readFileSync(path.join(HERE, "narration.md"), "utf8");
  const part = md.split(/^## /m).find((s) => s.startsWith(`${cut}\n`) || s.startsWith(`${cut}\r\n`));
  if (!part) throw new Error(`no "## ${cut}" section in narration.md`);
  return [...part.matchAll(/^- \[(\d+):(\d+(?:\.\d+)?)\]\s+(.+?)\s*$/gm)].map((m) => ({
    start: Number(m[1]) * 60 + Number(m[2]),
    text: m[3],
  }));
}

const video = path.join(HERE, "output", `${cut}.mp4`);
const total = probe(video);
const lines = readLines();
const dir = path.join(HERE, "build", cut, "voice");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// 1. Speak every line.
const jobs = lines.map((l, i) => ({ text: l.text, out: path.join(dir, `raw_${String(i).padStart(3, "0")}.wav`), rate }));
fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify(jobs));
execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "tools", "tts_windows.ps1"),
  "-Jobs", path.join(dir, "jobs.json"), "-Voice", voice], { stdio: "inherit" });

// 2. Trim silence, fit each clip into its slot.
const trimSilence = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse";
const report = [];
const tooLong = [];
lines.forEach((l, i) => {
  const next = i + 1 < lines.length ? lines[i + 1].start : total - 0.3;
  const slot = next - l.start - GAP;
  const trimmed = path.join(dir, `trim_${String(i).padStart(3, "0")}.wav`);
  run("ffmpeg", ["-v", "error", "-y", "-i", jobs[i].out, "-af", `${trimSilence},aresample=48000`, "-ac", "1", trimmed]);
  const len = probe(trimmed);
  let tempo = 1;
  if (len > slot) {
    tempo = len / slot;
    if (tempo > MAX_TEMPO) tooLong.push(`[${l.start.toFixed(1)} s] needs ${len.toFixed(2)} s, slot ${slot.toFixed(2)} s: "${l.text}"`);
  }
  l.file = path.join(dir, `fit_${String(i).padStart(3, "0")}.wav`);
  run("ffmpeg", ["-v", "error", "-y", "-i", trimmed, "-af", `atempo=${Math.min(tempo, MAX_TEMPO).toFixed(4)}`, l.file]);
  l.len = probe(l.file);
  report.push(`${l.start.toFixed(1).padStart(6)} s  ${l.len.toFixed(2)} s of ${slot.toFixed(2)} s  x${tempo.toFixed(2)}  ${l.text.slice(0, 60)}`);
});
console.log(report.join("\n"));
if (tooLong.length) {
  console.error(`\n${tooLong.length} line(s) do not fit even at ${MAX_TEMPO}x; shorten them in narration.md:\n${tooLong.join("\n")}`);
  process.exit(1);
}

// 3. Place, mix, normalise, mux.
const voiceWav = path.join(dir, "voice.wav");
const inputs = lines.flatMap((l) => ["-i", l.file]);
const delays = lines.map((l, i) => `[${i}:a]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`).join(";");
const mix = `${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`;
run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "[out]", "-ac", "1", voiceWav]);
const outFile = path.join(HERE, "output", `${cut}_voice.mp4`);
run("ffmpeg", ["-v", "error", "-y", "-i", video, "-i", voiceWav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
  "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", "-shortest", outFile]);
fs.writeFileSync(path.join(dir, "fit.txt"), report.join("\n") + "\n");
console.log(`\n${lines.length} lines, voice "${voice}" -> ${outFile}`);
