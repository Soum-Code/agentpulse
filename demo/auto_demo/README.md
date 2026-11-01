# Automatic demo

`auto_demo.py` opens a visible Chrome window and walks through the live AgentPulse site like a presenter. Before each step it shows a small caption (a newspaper-style banner, in plain English) and waits long enough to read it. It records the whole run as a video.

The site needs no key, and this script uses none.

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

A full run takes about 5 minutes at normal speed, then about 1.5 minutes to compress the video. The video is saved as `demo/auto_demo/output/agentpulse_auto_demo_<date>_<time>_<size>.webm` (VP9, about 60 MB for a full run; `--keep-raw` keeps Playwright's raw file, about 4 times bigger). The folder is in `.gitignore`, so the video never goes into git. Chrome, VLC and Windows Media Player all play `.webm`.

## Flags

| Flag | What it does |
| :-- | :-- |
| `--speed slow\|normal\|fast` | How long each caption stays up. `slow` is 1.5 times longer, `fast` half as long. Default `normal`. |
| `--no-lab` | Skips the Telemetry Lab and the Drift view. Use it when rehearsing, so the Lab's per-visitor limit is kept for the real demo. |
| `--base-url URL` | The site to demo. Default: `https://agentpulse.centralindia.cloudapp.azure.com`. For a local stack, for example `http://localhost:5173`. |
| `--size WxH` | Window size. Default `1920x1080`; `1366x768` also works (checked on 1 Nov 2026). |
| `--browser chrome\|msedge\|chromium` | Which browser to drive. Default `chrome`. |
| `--no-video` | Do not record a video. |
| `--shots` | Also save a screenshot at every caption, in `output/shots/<size>/`. |
| `--headless` | No visible window. Only for a quick check; the viva run should be visible. |

Examples:

```bash
python demo/auto_demo/auto_demo.py --speed slow
```

```bash
python demo/auto_demo/auto_demo.py --speed fast --no-lab --size 1366x768
```

## What each step shows

| Step | Screen | What the caption says |
| :-- | :-- | :-- |
| 1-2 | Landing page, then **Launch App** | What AgentPulse checks: grounding and drift, without an LLM judge. |
| 3 | **Overview** | The real counters, read off the screen at that moment (spans ingested, active incidents, agents drifting). |
| 4 | **RAG Live** | Three agents per question (retriever, verifier, answerer), each step sent to AgentPulse as a span. If the evaluator badge is not "Worker alive", the caption says so. |
| 5 | Question 1: "how does SQLite WAL improve concurrency?" | Waits for the three agents, then for the **agent ledger** to finish scoring (up to 90 s). Then reads each agent's grounding risk and verdict from the ledger, and whether an alert was raised. |
| 6 | Question 2: "who won the 2022 football world cup?" | The corpus has nothing on football. The caption reads the ledger's risk and verdict for each agent from the screen; it does not predict them. |
| 7-9 | **Traces** | Opens the newest trace, shows the span inspector and the verdict badge with its risk, then presses **X**: the trace is downloaded as JSON into `output/`. |
| 10-11 | **Telemetry Lab** | Runs **hallucination** and waits for the worker's scores and the HIGH_HALLUCINATION_RISK alert. Then runs **drift** and reads the final drift distance and whether DRIFT_DETECTED fired. |
| 12 | **Drift** | Selects `drift_demo_agent` and shows its window distance against the 0.30 threshold. |
| 13 | **Incidents** | The alerts, newest first, with the count of active incidents. |
| 14 | **Overview** again | Closing line. |

With `--no-lab`, steps 10-12 are skipped and the run has 11 steps.

## Honest states: what the demo does instead of crashing

The demo says what the screen shows. When something does not go as planned, it puts that on an amber caption and carries on with the next screen. At the end, the console lists every such state it met.

| What happens | What the caption says |
| :-- | :-- |
| Chat answers "Limit reached" (5 questions a minute, 40 a day per visitor) | That is the abuse limit doing its job. |
| "Providers at their limit" or "Provider failed" | Every provider in the failover chain was tried, and the screen says which one failed. |
| A chat turn takes more than 150 s | The answer is slow; the demo moves on. |
| The ledger is not fully scored after 90 s | The evaluator is still scoring; the ledger says pending and the alerts line says Unknown, never None. |
| The Lab answers 429 (per-visitor limit) | The Lab's limit is reached for this visitor, with the "Try again in ..." time from the screen. |
| A repeat hallucination or drift run within 15 minutes | High scores but no new alert: the same alert for the same agent is raised at most once in 15 minutes. |
| The Lab gives up waiting (180 s) | The worker is behind; the screen shows only what is stored so far. |
| Any step fails outright | "This step did not go as planned", then the next step. The script exits with code 1. |

## Limits to keep in mind

- One full run uses 2 chat questions and 2 Lab runs from your IP. The Lab allows 6 runs an hour per visitor (the leader may have raised this on the VM, see `docs/FREEZE_COMMANDS_2026-11-01.md`). Rehearse with `--no-lab`.
- If you run the Lab twice within 15 minutes, the second run raises no new alert. That is by design, and the caption says so, but the first run looks better. Leave 15 minutes between a rehearsal and the real demo.
- The captions read numbers from the screen at run time, so they change from run to run.

## Without internet

The script needs the live site. Without internet, play the recorded video instead:

1. Open `demo/auto_demo/output/` in Explorer.
2. Double-click the newest `agentpulse_auto_demo_*.webm` (or drag it into Chrome).

Copy the video to a USB stick or the laptop's desktop before the viva; it is not in git.

## The recorded run of 1 Nov 2026

One full run against the live site, 1920x1080, normal speed, every step passed (exit code 0):

- File: `agentpulse_auto_demo_20261101_185806_1920x1080.webm`, 4 min 57 s, 61 MB.
- Where: `demo/auto_demo/output/` in the main checkout (`C:\MLOPs\3rd sem project\Agentpluse`). It is not in git.
- What it showed (read from the screen during that run):
  - WAL question: retriever 0.301, verifier 0.301, answerer 0.305, all Unverifiable; no grounding alert. The trace carried one DRIFT DETECTED (medium) alert.
  - Football question: retriever 0.616 Unverifiable, verifier 0.980 Contradicted, answerer 0.311 Unverifiable; GROUNDING FAILURE and HIGH HALLUCINATION RISK raised.
  - Lab hallucination: 5 of 5 spans scored; HIGH_HALLUCINATION_RISK for the analyst. The verifier's was held back by the 15-minute cooldown, because the chat's verifier (same agent name) had just raised it.
  - Lab drift: final distance 0.968, DRIFT_DETECTED fired.
