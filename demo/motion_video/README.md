# Motion video of the demo recording

This folder turns the automatic demo recording (`demo/auto_demo`, a 1920x1080 browser video plus its `events.json`) into two polished MP4s, rendered with [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0):

- `output/highlight.mp4`: a cut of about 4 minutes. It keeps the main moments and drops the rest; a short dark dip marks each cut.
- `output/full.mp4`: the whole walkthrough at real speed, about 10 minutes, with a card before each part.

Both are 1920x1080 at 30 fps. Each one has:

- An opening card and a closing card with the live URL.
- A newspaper-style card before each part of the dashboard, in the viva deck's look: off-white paper, black serif headlines, one deep red.
- The camera zooming onto every element the demo clicks, types into or points at. The positions come from `events.json`, not from guesses.
- A cursor ring that moves to each click, with a ripple on the click.
- Speed-ups, when a cut asks for them, marked on screen ("Waiting, shown at 3× speed"). The 1 Nov recording has captions almost end to end, so neither cut uses one.

There is no music. The silent versions rely on the recording's own captions; the `_voice` versions add a spoken voice-over (see below).

Nothing on screen is invented. Footage and its captions come from the recording. Card text is in `cuts/*.json` and only names what the next part shows, with no numbers.

The videos are not in git (`output/`, `build/`, `sample/` and `node_modules/` are ignored). Copy them to the viva laptop by hand.

## One-time install (Windows 11)

You need Node.js 22 or newer, Google Chrome, and FFmpeg.

```bash
winget install --id Gyan.FFmpeg -e
```

Open a new terminal after this so `ffmpeg` and `ffprobe` are on PATH. Then, in this folder:

```bash
npm install
```

That installs the pinned HyperFrames CLI (0.8.226) into `node_modules`. Check the setup with:

```bash
npx hyperframes doctor
```

Whisper, TTS, MusicGen and Docker show as missing. They are optional, and none of them is used here.

## Render

Run these from `demo/motion_video/`. Replace the two paths with the recording and its `events.json` from `demo/auto_demo/output/`.

```bash
node render.mjs --cut cuts/highlight.json --recording ../auto_demo/output/<recording>.webm --events ../auto_demo/output/events.json
```

```bash
node render.mjs --cut cuts/full.json --recording ../auto_demo/output/<recording>.webm --events ../auto_demo/output/events.json
```

`render.mjs` first runs `build.mjs`, which:

1. Re-encodes the recording once to 30 fps H.264 with a keyframe every half second.
2. Writes a HyperFrames project to `build/<cut id>/`.

It then renders that project with `--quality delivery` into `output/<cut id>.mp4`, with HyperFrames' usage telemetry turned off. For a quick look, add `--quality draft`. On this laptop the highlight takes about 5 minutes to render and the full cut about 15. The delivery files are large (about 300 MB and 800 MB).

To check a render without watching it in real time:

```bash
node tools/verify.mjs highlight
```

That command writes two contact sheets to `output/verify/`:

- `highlight_targets.jpg`: one frame at every zoom target, labelled with the element's name.
- `highlight_timeline.jpg`: one frame every 4 seconds.

## Voice-over

`narration.md` holds the spoken script for each cut: short sentences, each with its start time in the video. Every number in it is read from a caption of the 1 Nov run. To add it to a rendered cut:

```bash
node tools/narrate.mjs highlight
```

```bash
node tools/narrate.mjs full
```

That writes `output/highlight_voice.mp4` and `output/full_voice.mp4`. The silent `output/highlight.mp4` and `output/full.mp4` stay as they are. For each line, the script:

1. Speaks the line, offline, with `tools/tts_windows.ps1`.
2. Trims the silence around it.
3. Fits it into its slot, which ends 0.25 s before the next line. A line that runs long is sped up by at most 20%. If it still does not fit, the script stops and names the line to shorten.

It then places every line at its time, mixes them, normalises the loudness (EBU R128 loudnorm: -16 LUFS, peaks under -1.5 dBTP), and muxes the voice in as AAC without re-encoding the video.

**Voice and licence.** The voice is Microsoft Heera (en-IN), one of the Windows 11 built-in speech voices (Windows.Media.SpeechSynthesis, OneCore). It runs offline with nothing to download, and it is used here under the Windows licence. It is not open source. `--voice "Microsoft Ravi"` gives the male en-IN voice.

A more natural open-source engine (Kokoro-82M, Apache-2.0, through `npx hyperframes tts`) needs `pip install kokoro-onnx soundfile`, which was not allowed in the session that made these files.

## How a cut is written

The two cuts in `cuts/` are tuned to the auto-demo run of 1 Nov 2026, 19:47 (22 steps, 9 min 27 s). For a new recording, check the clip edges against its `events.json`, or use the step anchors below.

A cut file (`cuts/highlight.json`, `cuts/full.json`) lists sections. Each section has a card (`title`, `kicker`, `deck`; a word in `*stars*` is the red accent) and its clips. A clip edge is either a time in seconds or an anchor on the recording's own events, so a cut still fits after the demo is recorded again:

| Edge | Means |
| :-- | :-- |
| `12.5` | 12.5 s into the recording |
| `"step 3 -0.4"` | 0.4 s before the caption that says "Step 3 of ..." |
| `"click:Launch App +2"` | 2 s after the first click on "Launch App" from the clip's start |
| `"end"` | The end of the recording |

`idle` (on the cut, a section or a clip) plays stretches with no event for longer than `min` seconds at `rate`. A caption always keeps normal speed long enough to read it. `camera` sets the zoom: `lead` (seconds before the click), `tail` (seconds after), `gap` (events closer than this share one zoom), and `maxScale`.

## events.json

`build.mjs` reads a list of events like this; the other field names in brackets work too:

```json
{"events": [
  {"t": 15.92, "action": "click", "label": "Launch App", "bbox": {"x": 1751.8, "y": 18, "width": 119.2, "height": 28}},
  {"t": 8.18, "action": "caption", "label": "Step 1 of 14", "head": "...", "body": "..."}
]}
```

- `t` (`time`, `ts`): seconds from the start of the video.
- `action` (`type`, `kind`): `click`, `type`, `fill`, `press`, `spot`, `hover` or `select` move the camera. `caption` and `scroll` do not.
- `bbox` (`box`, `rect`): the element's box in CSS pixels of the 1920x1080 page.

## Testing without the real recording

`tools/sample_record.py` records a 38-second clip of the live site with its own `events.json`, using no chat question and no Lab run. Then:

```bash
node render.mjs --cut cuts/sample.json --recording sample/sample.webm --events sample/events.json --quality draft
```

## Files

| File | What it does |
| :-- | :-- |
| `build.mjs` | Cut file + events to a HyperFrames project: cards, shots, camera, cursor ring, ripples, speed labels |
| `render.mjs` | Build, then render with the pinned CLI |
| `cuts/*.json` | The highlight cut, the full cut, and the sample cut |
| `tools/verify.mjs` | Contact sheets of a render |
| `narration.md` | The timed voice-over script for both cuts |
| `tools/narrate.mjs`, `tools/tts_windows.ps1` | Speak, fit, mix and mux the voice-over |
| `tools/sample_record.py` | A short test recording of the live site |
