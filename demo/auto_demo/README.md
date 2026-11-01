# Automatic demo

`auto_demo.py` opens a visible Chrome window and walks through the live AgentPulse site like a presenter. It visits every view of the console. Before each step it shows a small caption (a newspaper-style banner, in plain English) and waits long enough to read it. It records the whole run as a video.

Nothing in it is preset or invented:

- **Questions.** The chat questions are made at run time: two from random documents of the chat's own corpus (`GET /chat/corpus`) filled into random question templates, and one random general-knowledge question the corpus cannot answer.
- **Lab topics.** Each Lab run gets a random topic from a list.
- **Numbers.** Every number in a caption is read from the page or the public API during the run.

Each run therefore asks different questions and shows that day's data. The site needs no key, and this script uses none.

## One-time install (Windows)

You need Python 3.10 or newer and Google Chrome (or Edge).

```bash
pip install playwright
```

```bash
python -m playwright install ffmpeg
```

The second command downloads Playwright's own ffmpeg (about 1.6 MB), which the video recording needs. The script drives the Chrome that is already installed, so no browser download is needed. If Chrome is not installed, also run `python -m playwright install chromium` and add `--browser chromium`.

## Run

From the repository root:

```bash
python demo/auto_demo/auto_demo.py
```

A full run takes about 9 to 10 minutes at normal speed, then about 2 minutes to compress the video. It writes, in `demo/auto_demo/output/` (in `.gitignore`, so never in git):

| File | What it is |
| :-- | :-- |
| `agentpulse_auto_demo.webm` | The video (VP9; overwritten by each run). Chrome, VLC and Windows Media Player play it. |
| `questions.json` | The questions this run asked (with the corpus document each came from) and the Lab topics, with what came back: outcome, ledger rows, alerts fired. |
| `events.json` | Every click, keypress, scroll, highlight and caption: its time in seconds from the start of the video, the element's label and its box (x, y, width, height) in the video frame. For a video editor placing zooms and cursor highlights. |
| `agent-trace-<id>-<date>.json` | The trace exported with X in the Traces step. |
| `shots/<size>/` | One screenshot per caption, only with `--shots`. |

## Flags

| Flag | What it does |
| :-- | :-- |
| `--speed slow\|normal\|fast` | How long each caption stays up. `slow` is 1.5 times longer, `fast` half as long. Default `normal`. |
| `--no-lab` | Skips the five Telemetry Lab runs. Use it when rehearsing, to save the per-visitor Lab limit. |
| `--base-url URL` | The site to demo. Default: `https://agentpulse.centralindia.cloudapp.azure.com`. |
| `--size WxH` | Window and video size. Default `1920x1080`; `1366x768` also works. |
| `--seed N` | Repeat a run's random questions and topics. The seed is printed at the start and saved in `questions.json`. |
| `--browser chrome\|msedge\|chromium` | Which browser to drive. Default `chrome`. |
| `--no-video` | Do not record a video. |
| `--keep-raw` | Keep Playwright's raw video (about 4 times bigger) instead of the VP9 copy. |
| `--shots` | Also save a screenshot at every caption. |
| `--headless` | No visible window. Only for a quick check. |

## What each step shows

| Step | Screen | What the caption says |
| :-- | :-- | :-- |
| 1 | Landing page | What AgentPulse checks, then each section through the page's own menu, with the section's heading. |
| 2 | **Launch App**, **Overview** | The counters read off the screen: spans ingested, active incidents, agents drifting. |
| 3 | **RAG Live** | Three agents per question; the questions are made up on the spot. Says so if the evaluator badge is not "Worker alive". |
| 4-6 | Three questions | Waits for the three agents and for the ledger to finish scoring (up to 90 s). Then reads each agent's grounding risk and verdict, and the alerts, from the ledger. For the out-of-corpus question it reads, never predicts. |
| 7-11 | **Telemetry Lab**, five scenarios | Clean, hallucination, tool-claim mismatch, drift, disagreement. For each: spans scored, which expected alerts fired, and which did not and why. Clean and disagreement are expected to raise none. Drift reports the final distance. |
| 12 | **Agents** | The roster's own summary line, then one agent's inspector. |
| 13-14 | **Traces** | The OK / warning / error / unknown counts, filtered to errors, the newest one's span inspector and verdict badge, then **X** exports it as JSON. |
| 15 | **APM** | Status banner, API p50 latency, request count, evaluator workers, and what is "not measured". |
| 16 | **Incidents** | The count, the newest alert's message, and its diagnosis panel. |
| 17 | **Drift** | What drift means here, then `drift_demo_agent`'s measured distance against 0.30. Baseline = the mean of the first 20 outputs, window = the latest 12. |
| 18 | **Replay** | Steps through a recorded five-agent trace. |
| 19 | **Experiments** | The result files the API lists, or, honestly, that this instance has none loaded. |
| 20 | **Datasets** | The datasets and their case counts, from `GET /v1/datasets`. |
| 21 | **Settings** | The two models and the live median evaluation time. |
| 22 | **Overview** again | How the counters changed during the demo. |

With `--no-lab`, steps 7-11 are skipped.

## Honest states: what the demo does instead of crashing

When something does not go as planned, the demo puts that on an amber caption and carries on with the next screen. At the end, the console and `questions.json` list every such state.

| What happens | What the caption says |
| :-- | :-- |
| Chat answers "Limit reached" (5 questions a minute, 40 a day per visitor) | That is the abuse limit doing its job. |
| "Providers at their limit" or "Provider failed" | Every provider in the failover chain was tried, and the screen says which one failed. |
| A chat turn takes more than 150 s | The answer is slow; the demo moves on. |
| The ledger is not fully scored after 90 s | The evaluator is still scoring; the ledger says pending and the alerts line says Unknown, never None. |
| The Lab answers 429 | The Lab's limit is reached for this visitor, with the "Try again in ..." time from the screen. |
| An expected alert is not stored | The 15-minute cooldown: the same alert for the same agent is raised at most once in 15 minutes. |
| The Lab gives up waiting (180 s) | The worker is behind; the screen shows only what is stored so far. |
| Experiments has no result files | The instance has none loaded, and the screen says so instead of inventing numbers. |
| Any step fails outright | "This step did not go as planned", then the next step. The script exits with code 1. |

## Limits to keep in mind

- **Chat and Lab budget.** One full run uses 3 chat questions and 5 Lab runs from your IP. The Lab allows 20 runs an hour per visitor on the live site. Rehearse with `--no-lab`.
- **Shared agent names.** The chat's verifier and retriever have the same agent names as the Lab's. An alert one of them raised in the last 15 minutes is held back for the other. Example: the hallucination run may get a new alert only for the analyst. The caption says so.
- **Fixed drift texts.** The drift and disagreement scenarios use their own fixed texts on the server, so the random topic only applies to clean, hallucination and tool-claim mismatch (`backend/app/routers/ingest.py`).
- **Changing numbers.** The captions read numbers at run time, so they differ from run to run.

## Without internet

The script needs the live site. Without internet, play the recorded video instead:

1. Open `demo/auto_demo/output/` in Explorer.
2. Double-click `agentpulse_auto_demo.webm` (or drag it into Chrome).

Copy the video to a USB stick or the laptop's desktop before the viva; it is not in git.
