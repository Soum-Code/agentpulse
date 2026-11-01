"""AgentPulse automatic demo: a visible browser walks through the live site like a presenter.

In short: Playwright opens Chrome, shows a small newspaper-style caption before every step,
clicks through landing -> console -> RAG Live -> Traces -> Telemetry Lab -> Drift -> Incidents
-> Overview, and records the whole run as a video in demo/auto_demo/output/.

Run (see README.md in this folder for the one-time install):

    python demo/auto_demo/auto_demo.py
    python demo/auto_demo/auto_demo.py --speed fast --no-lab --size 1366x768

The site needs no key and none is used here. Every selector is a role or a visible text,
never a pixel position. When the site shows an honest state (limit reached, evaluator slow,
a repeat run deduplicated), the demo puts that on a caption and carries on.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, TimeoutError as PlaywrightTimeout, sync_playwright

DEFAULT_BASE_URL = "https://agentpulse.centralindia.cloudapp.azure.com"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

Q_IN_CORPUS = "how does SQLite WAL improve concurrency?"
Q_OUT_OF_CORPUS = "who won the 2022 football world cup?"

# In short: one multiplier for every pause, so --speed changes the whole run at once.
SPEEDS = {"slow": 1.5, "normal": 1.0, "fast": 0.5}

# In short: how long we wait for the site before captioning "still waiting" and moving on.
CHAT_TIMEOUT_S = 150  # one chat turn (3 agents); normally ~2-5 s with Groq
LEDGER_TIMEOUT_S = 90  # the worker scoring a turn's three spans
LAB_TIMEOUT_S = 200  # the Lab gives up by itself after 180 s


# --------------------------------------------------------------------------------------
# Caption overlay: a small newspaper banner injected into the page
# --------------------------------------------------------------------------------------

# In short: the banner's look. Cream paper, black rules, a serif headline: it reads as
# "the narrator", not as part of the AgentPulse UI. pointer-events:none so it never blocks a click.
CAPTION_CSS = """
#ap-demo-caption {
  position: fixed; z-index: 2147483647; left: 24px; bottom: 96px;
  max-width: min(620px, calc(100vw - 48px));
  background: #f6f1e3; color: #161412;
  border-top: 4px double #161412; border-bottom: 1px solid #161412;
  box-shadow: 0 10px 30px rgba(0,0,0,.45);
  padding: 10px 16px 12px; pointer-events: none;
  font-family: Georgia, 'Times New Roman', serif;
  transition: opacity .35s ease, transform .35s ease;
}
#ap-demo-caption.ap-top { top: 76px; bottom: auto; }
#ap-demo-caption.ap-right { left: auto; right: 24px; }
#ap-demo-caption .ap-kicker {
  font: 700 10px/1.2 'Courier New', monospace; letter-spacing: .14em;
  text-transform: uppercase; color: #6b5d45; border-bottom: 1px solid #c9bea4;
  padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 16px;
}
#ap-demo-caption .ap-head { font-size: 21px; font-weight: 700; line-height: 1.2; margin: 0 0 3px; }
#ap-demo-caption .ap-body { font-size: 15.5px; line-height: 1.4; margin: 0; }
#ap-demo-caption.ap-warn { background: #fbe9c8; }
.ap-demo-spot { outline: 3px solid #f5c542 !important; outline-offset: 3px !important;
  border-radius: 10px; transition: outline-color .3s; }
"""


class Demo:
    """In short: holds the page, the speed and the step counter, and offers caption/pause helpers."""

    def __init__(self, page: Page, speed: float, base_url: str, total_steps: int):
        self.page = page
        self.speed = speed
        self.base_url = base_url.rstrip("/")
        self.step = 0
        self.total = total_steps
        self.notes: list[str] = []  # honest states we met, printed at the end
        self.shots: Path | None = None  # set by --shots: a screenshot per caption goes here
        self.shot_n = 0

    # In short: a pause that scales with --speed.
    def pause(self, seconds: float) -> None:
        self.page.wait_for_timeout(int(seconds * self.speed * 1000))

    # In short: inject (or update) the banner, then wait long enough to read it.
    def caption(self, head: str, body: str = "", *, where: str = "bottom-left",
                warn: bool = False, new_step: bool = True, read: bool = True) -> None:
        if new_step:
            self.step += 1
        kicker_right = f"Step {self.step} of {self.total}"
        print(f"[{kicker_right}] {head} | {body}")
        try:
            self.page.evaluate(
                """([css, head, body, kicker, where, warn]) => {
                    if (!document.getElementById('ap-demo-style')) {
                        const s = document.createElement('style');
                        s.id = 'ap-demo-style'; s.textContent = css;
                        document.head.appendChild(s);
                    }
                    let c = document.getElementById('ap-demo-caption');
                    if (!c) { c = document.createElement('div'); c.id = 'ap-demo-caption';
                              document.body.appendChild(c); }
                    c.className = (where.includes('top') ? 'ap-top ' : '') +
                                  (where.includes('right') ? 'ap-right ' : '') + (warn ? 'ap-warn' : '');
                    c.innerHTML = '';
                    const k = document.createElement('div'); k.className = 'ap-kicker';
                    const k1 = document.createElement('span'); k1.textContent = 'AgentPulse · live demo';
                    const k2 = document.createElement('span'); k2.textContent = kicker;
                    k.append(k1, k2);
                    const h = document.createElement('p'); h.className = 'ap-head'; h.textContent = head;
                    c.append(k, h);
                    if (body) { const b = document.createElement('p'); b.className = 'ap-body';
                                b.textContent = body; c.append(b); }
                }""",
                [CAPTION_CSS, head, body, kicker_right, where, warn],
            )
        except PlaywrightError:
            pass  # a caption must never stop the demo
        if self.shots is not None:
            # In short: one picture per caption, to check the layout without watching the video.
            self.page.wait_for_timeout(400)
            self.shot_n += 1
            try:
                self.page.screenshot(path=str(self.shots / f"{self.shot_n:02d}_step{self.step}.png"))
            except PlaywrightError:
                pass
        if read:
            # About 3.5 words a second, never under 3.5 s, so a slow reader can follow.
            words = len((head + " " + body).split())
            self.pause(max(3.5, words / 3.5))

    # In short: a yellow ring around the thing we talk about; removed by unspot().
    def spot(self, locator) -> None:
        try:
            locator.scroll_into_view_if_needed(timeout=4000)
            locator.evaluate("el => el.classList.add('ap-demo-spot')")
        except PlaywrightError:
            pass

    def unspot(self) -> None:
        try:
            self.page.evaluate(
                "() => document.querySelectorAll('.ap-demo-spot').forEach(e => e.classList.remove('ap-demo-spot'))"
            )
        except PlaywrightError:
            pass

    # In short: ring the element, wait a beat so the viewer sees where we click, then click.
    def click(self, locator, *, beat: float = 0.8) -> None:
        self.spot(locator)
        self.pause(beat)
        locator.click(timeout=10000)
        self.unspot()

    # In short: the floating dock is the last copy of each tab button on the page
    # (RAG Live has its own "Jump to" buttons with the same names, earlier in the page).
    def dock(self, name: str) -> None:
        button = self.page.get_by_role("button", name=re.compile(rf"^{re.escape(name)}\b")).last
        self.click(button)
        self.pause(1.5)

    def open_more(self, label: str) -> None:
        self.click(self.page.get_by_role("button", name="More", exact=True).last)
        self.pause(0.6)
        self.click(self.page.get_by_role("button", name=re.compile(re.escape(label))).first)
        self.pause(1.5)

    def main_text(self) -> str:
        try:
            return self.page.locator("main").first.inner_text(timeout=5000)
        except PlaywrightError:
            return ""

    def note(self, text: str) -> None:
        self.notes.append(text)


# --------------------------------------------------------------------------------------
# Steps
# --------------------------------------------------------------------------------------

def step_landing(d: Demo) -> None:
    """Landing page, then Launch App."""
    d.page.goto(d.base_url, wait_until="domcontentloaded")
    d.page.get_by_role("heading", level=1).first.wait_for(timeout=30000)
    d.pause(1.5)
    d.caption(
        "AgentPulse watches AI agents that work together.",
        "It checks every step for two things: is the answer supported by its evidence "
        "(grounding), and is the agent slowly changing (drift)? No big LLM is used as a judge.",
    )
    # Scroll a little so the viewer sees the page is real, then back up.
    d.page.mouse.wheel(0, 700)
    d.pause(2)
    d.page.mouse.wheel(0, -700)
    d.pause(1)
    d.caption("Let's open the console.", "Press Launch App, top right.", where="top-right")
    launch = d.page.get_by_role("button", name="Launch App").first
    try:
        d.click(launch)
    except PlaywrightTimeout:
        # The landing page's animations can keep the browser busy, so Playwright never confirms
        # the click even though it landed. Check for the console below instead of failing here.
        d.unspot()
    try:
        d.page.get_by_text("Spans Ingested").first.wait_for(timeout=10000)
    except PlaywrightTimeout:
        launch.dispatch_event("click")  # a plain DOM click, which needs no mouse round trip
    d.pause(2.5)


def step_overview(d: Demo) -> None:
    """Overview: read the real counters off the screen and put them in the caption."""
    d.page.get_by_text("Spans Ingested").first.wait_for(timeout=30000)
    d.pause(2)  # let the first poll fill the counters
    text = d.main_text()
    # inner_text returns the labels as the CSS shows them (upper case), hence re.I.
    spans = re.search(r"Spans Ingested\s+([\d,]+)", text, re.I)
    incidents = re.search(r"Active Incidents\s+([\d,]+)", text, re.I)
    drift = re.search(r"Behavioral Drift\s+(\d+\s+agents?\s+drifting)", text, re.I)
    facts = []
    if spans:
        facts.append(f"{spans.group(1)} spans ingested")
    if incidents:
        facts.append(f"{incidents.group(1)} active incidents")
    if drift:
        facts.append(" ".join(drift.group(1).split()))
    body = ("Right now the live database shows: " + ", ".join(facts) + ". "
            if facts else "These counters are read from the live API, not typed in. ")
    body += "A dash means 'not measured', never a fake zero."
    d.caption("Overview: the real numbers from the live system.", body, where="top-right")
    d.spot(d.page.get_by_text("Spans Ingested").first.locator("xpath=.."))
    d.pause(2.5)
    d.unspot()


def ask(d: Demo, question: str) -> str:
    """Type a question into the RAG chat, wait for the three agents, return the outcome text."""
    box = d.page.get_by_role("textbox", name="Message")
    d.spot(box)
    box.click()
    box.press_sequentially(question, delay=int(45 * d.speed))
    d.pause(0.8)
    d.unspot()
    log = d.page.get_by_role("log", name="Conversation")
    before = log.inner_text()
    box.press("Enter")

    # The Stop button exists only while a turn runs. Wait for it to come and go.
    stop = d.page.get_by_role("button", name=re.compile(r"^Stop"))
    try:
        stop.first.wait_for(state="visible", timeout=8000)
    except PlaywrightTimeout:
        pass  # very fast turns (or a refusal) may never show it
    try:
        stop.first.wait_for(state="hidden", timeout=CHAT_TIMEOUT_S * 1000)
    except PlaywrightTimeout:
        d.note(f"chat turn still running after {CHAT_TIMEOUT_S} s: {question}")
        return "timeout"
    d.pause(0.8)
    after = log.inner_text()
    new = after[len(before):] if after.startswith(before) else after
    for title in ("Limit reached", "Providers at their limit", "Provider failed", "Chat starting up",
                  "Chat paused", "Connection dropped", "Turn ran out of time", "Question not accepted"):
        if title in new:
            d.note(f"chat said '{title}' for: {question}")
            return title
    return "ok"


def caption_chat_problem(d: Demo, outcome: str) -> None:
    """In short: say an honest chat state out loud instead of pretending it worked."""
    if outcome == "timeout":
        d.caption("The answer is taking longer than usual.",
                  "The hosted models are free tiers and can be slow. We move on; the trace will still arrive.",
                  warn=True, new_step=False)
    elif outcome == "Limit reached":
        d.caption("Limit reached: the abuse limit is doing its job.",
                  "Each visitor gets 5 questions a minute and 40 a day. The screen says so instead of failing silently.",
                  warn=True, new_step=False)
    else:
        d.caption(f"The chat says: {outcome}.",
                  "Every provider in the failover chain was tried, and the screen says which one failed. "
                  "We never call a failure a success.", warn=True, new_step=False)


def wait_ledger(d: Demo) -> str:
    """Wait until the agent ledger has scored every span (or the wait runs out). Returns its state."""
    js = """() => {
        const h = [...document.querySelectorAll('h3')].find(e => e.textContent.trim() === 'Agent ledger (this turn)');
        if (!h) return '';
        let el = h;
        while (el && !(el.innerText || '').includes('Alerts on this trace')) el = el.parentElement;
        return el ? el.innerText : '';
    }"""
    deadline = time.time() + LEDGER_TIMEOUT_S
    text = ""
    while time.time() < deadline:
        text = d.page.evaluate(js) or ""
        tail = text.split("Alerts on this trace")[-1] if "Alerts on this trace" in text else ""
        if "None raised." in tail:
            return "none"
        if "Unknown: evaluation did not finish" in tail:
            return "timeout"
        if tail.strip() and "Unknown so far" not in tail and "more may follow" not in tail:
            # Each alert line reads "GROUNDING FAILURE (critical): ..."; keep type and severity.
            d.ledger_alerts = sorted(set(re.findall(r"([A-Z][A-Z ]{5,}[A-Z]) \((\w+)\)", tail)))
            return "alerts"
        d.page.wait_for_timeout(2000)
    return "slow"


def ledger_rows(d: Demo) -> str:
    """In short: read each ledger row's agent, grounding risk and verdict off the screen, as one line."""
    rows = d.page.evaluate("""() => {
        const h = [...document.querySelectorAll('h3')].find(e => e.textContent.trim() === 'Agent ledger (this turn)');
        let box = h; while (box && !(box.innerText || '').includes('Alerts on this trace')) box = box.parentElement;
        if (!box) return [];
        return [...box.querySelectorAll('div.rounded-xl')].filter(r => /Grounding/.test(r.innerText) && r.querySelector(':scope > div > span.capitalize')).map(r => {
            const role = r.querySelector(':scope > div > span.capitalize').innerText || '?';
            const risk = (r.innerText.match(/Grounding\\s+([\\d.]+)/) || [])[1] || 'pending';
            const badge = r.querySelector('span[title]');
            return [role.trim(), risk, badge ? badge.innerText.trim() : ''];
        });
    }""") or []
    parts = [f"{role.capitalize()} {risk}" + (f" {verdict.capitalize()}" if verdict else "")
             for role, risk, verdict in rows]
    return "; ".join(parts)


def show_ledger(d: Demo) -> None:
    """In short: scroll the monitor so the ledger heading sits at the top and its rows are visible."""
    try:
        d.page.get_by_role("heading", name="Agent ledger (this turn)").evaluate(
            "e => e.scrollIntoView({block: 'start', behavior: 'smooth'})")
    except PlaywrightError:
        pass
    d.pause(1)


def ledger_caption(d: Demo, state: str, *, out_of_corpus: bool) -> None:
    show_ledger(d)
    rows = ledger_rows(d)
    if out_of_corpus:
        # Say what the screen shows for this turn; never predict the verdicts.
        d.caption("The corpus has nothing on football. What did the ledger record?",
                  (f"Grounding risk per agent: {rows}. " if rows else "")
                  + "Read from the screen, not predicted.", where="top-right", new_step=False)
    elif rows:
        d.caption("Each agent's grounding risk and verdict:", rows + ".", where="top-right", new_step=False)
    if state == "none":
        d.caption("All three spans are scored. No alert was raised for this turn.",
                  "'None raised' appears only after every span is scored, never early."
                  + (" A contradicted span raises no new alert if the same alert fired for that agent "
                     "in the last 15 minutes." if "Contradicted" in rows else ""),
                  where="top-right", new_step=False)
    elif state == "alerts":
        found = getattr(d, "ledger_alerts", [])
        names = ", ".join(f"{a} ({sev})" for a, sev in found[:3])
        body = (f"{names}. " if names else "") + "Each alert names the agent and the score that crossed the threshold."
        # A contradicted span with no grounding alert: the 15-minute cooldown held it back. Say so.
        if "Contradicted" in rows and not any("GROUNDING" in a for a, _ in found):
            body += " A grounding alert raised for the same agent in the last 15 minutes is not raised again."
        d.caption("All spans scored, and the worker raised an alert on this trace.", body,
                  where="top-right", new_step=False)
    else:
        d.note("ledger not fully scored in time")
        d.caption("The evaluator is still scoring.",
                  "Until it finishes, the ledger says 'pending' and the alerts line says 'Unknown', "
                  "never 'None'. We move on; the scores will land in the trace.",
                  where="top-right", warn=True, new_step=False)


def step_rag(d: Demo) -> None:
    """RAG Live: one in-corpus question, the ledger, then one out-of-corpus question."""
    d.dock("RAG Live")
    d.page.get_by_role("textbox", name="Message").wait_for(timeout=30000)
    d.caption("RAG Live: a real chat with three agents.",
              "Each question runs a retriever, a verifier and an answerer, each a hosted model. "
              "Every step is sent to AgentPulse as a span and scored there.")

    # Evaluator health badge: say it if the worker is not alive.
    status = d.page.get_by_role("status").filter(has_text=re.compile(r"Worker|Evaluator")).first
    try:
        status_text = status.inner_text(timeout=3000)
    except PlaywrightError:
        status_text = ""
    if status_text and "alive" not in status_text.lower():
        d.note(f"evaluator badge: {status_text}")
        d.caption(f"The monitor says: {status_text}.",
                  "Then answers still come back, but the ledger will stay pending.",
                  where="top-right", warn=True, new_step=False)

    d.caption("Question 1, inside the corpus:", f"“{Q_IN_CORPUS}”", where="top-right")
    outcome = ask(d, Q_IN_CORPUS)
    if outcome != "ok":
        caption_chat_problem(d, outcome)
    else:
        d.caption("Three stages, each with its time, provider and model.",
                  "The answerer is told to use the retrieved evidence and nothing else.",
                  where="top-right", new_step=False)

    # The monitor and its agent ledger, until scores arrive.
    ledger = d.page.get_by_role("heading", name="Agent ledger (this turn)")
    d.spot(ledger)
    d.caption("The agent ledger: one row per agent span.",
              "Model, latency, tokens, grounding risk and verdict. Rows say 'pending' until the worker "
              "has scored them. 'Unverifiable' means the evidence neither supports nor contradicts.",
              where="top-right", new_step=False, read=False)
    d.pause(4)
    state = wait_ledger(d)
    d.unspot()
    ledger_caption(d, state, out_of_corpus=False)

    d.caption("Question 2, outside the corpus:", f"“{Q_OUT_OF_CORPUS}”", where="top-right")
    outcome = ask(d, Q_OUT_OF_CORPUS)
    if outcome != "ok":
        caption_chat_problem(d, outcome)
    d.spot(ledger)
    d.pause(2)
    state = wait_ledger(d)
    d.unspot()
    ledger_caption(d, state, out_of_corpus=True)


def step_traces(d: Demo) -> None:
    """Traces: newest trace, span inspector, verdict badge, then X exports it as JSON."""
    d.dock("Traces")
    d.page.get_by_role("heading", name="Trace Investigation Spine").wait_for(timeout=30000)
    d.caption("Traces: every run, newest first.",
              "A trace whose spans are not scored yet shows as Unknown, never OK.")

    # Make sure the list is sorted newest first, then open the top trace by its id.
    try:
        d.page.get_by_role("combobox", name="Sort traces by criteria").select_option(label="Newest First")
    except PlaywrightError:
        pass
    first_copy = d.page.get_by_role("button", name=re.compile(r"^Copy Trace ID ")).first
    trace_id = (first_copy.get_attribute("aria-label") or first_copy.get_attribute("title") or "")
    trace_id = trace_id.replace("Copy Trace ID", "").strip()
    try:
        row_text = d.page.locator("main").get_by_text(trace_id, exact=True).first
        d.click(row_text)
    except PlaywrightError:
        d.page.keyboard.press("j")  # fallback: the list's own keyboard shortcut
    d.pause(1.5)

    inspector = d.page.get_by_text("SPAN INSPECTOR").first
    d.spot(inspector)
    d.caption("The span inspector shows one agent step.",
              "Its input, its output and the grounding score the worker gave it.", where="top-right")
    d.unspot()

    # The badge is a <span title=...> whose text starts with the verdict word; a screen-reader
    # sentence follows inside it, so match only the start.
    badge = d.page.locator("main span[title]").filter(
        has_text=re.compile(r"^(Supported|Unverifiable|Contradicted)")).first
    try:
        verdict = badge.inner_text(timeout=5000).split(".")[0].strip()
        risk = re.search(r"Risk\s+([\d.]+)", d.main_text(), re.I)
        d.spot(badge)
        d.caption(f"Verdict badge: {verdict}" + (f", grounding risk {risk.group(1)}." if risk else "."),
                  "The verdict sits next to the score, so a low score is never read as 'supported' by mistake.",
                  where="top-right", new_step=False)
        d.unspot()
    except PlaywrightError:
        d.caption("No verdict on this span yet.",
                  "The worker has not scored it, so the screen shows nothing rather than a guess.",
                  where="top-right", warn=True, new_step=False)

    # X exports the selected trace as JSON (a real file download).
    d.caption("Press X: the whole trace as a JSON file.",
              "Everything on these screens is in this file. Nothing in it is computed in the browser.",
              where="top-right", read=False)
    d.pause(2.5)
    try:
        d.page.locator("main").first.click(position={"x": 5, "y": 5})  # focus the page, not a text box
    except PlaywrightError:
        pass
    try:
        with d.page.expect_download(timeout=8000) as dl:
            d.page.keyboard.press("x")
        path = OUTPUT_DIR / dl.value.suggested_filename
        dl.value.save_as(path)
        print(f"  trace JSON saved: {path}")
        d.caption("Saved.", f"{dl.value.suggested_filename}", where="top-right", new_step=False)
    except PlaywrightError:
        d.note("X did not start a download")
        d.caption("The export did not start this time.",
                  "The Export JSON button at the top of Traces does the same thing.",
                  where="top-right", warn=True, new_step=False)


def run_lab(d: Demo, scenario_label: str) -> tuple[str, str]:
    """Run one Telemetry Lab scenario and wait for the worker's scores. Returns (state, result text)."""
    d.page.get_by_role("heading", name="Telemetry Lab").wait_for(timeout=30000)
    d.page.get_by_role("main").get_by_role("combobox").first.select_option(label=scenario_label)
    d.pause(1.5)
    run = d.page.get_by_role("button", name=re.compile(r"^(Run scenario|Running)"))
    d.click(run)
    d.pause(1)
    # The button says "Running..." while the Lab polls the API; it comes back when scored or given up.
    try:
        d.page.get_by_role("button", name="Run scenario").wait_for(timeout=LAB_TIMEOUT_S * 1000)
    except PlaywrightTimeout:
        return "slow", d.main_text()
    d.pause(1)
    text = d.main_text()
    # No result card means the API refused the run: a limit (429, "Try again in ...") or another error.
    if not re.search(r"Result:", text, re.I):
        return ("limited" if re.search(r"Try again in|429|limit", text, re.I) else "error"), text
    if "Stopped waiting" in text:
        return "slow", text
    return "done", text


def lab_problem_caption(d: Demo, state: str, text: str) -> None:
    if state == "limited":
        m = re.search(r"Try again in[^.\n]*", text)
        d.caption("The Lab's limit is reached for this visitor.",
                  "Each visitor may run a few scenarios an hour. " + (m.group(0) + "." if m else "")
                  + " The limit protects the shared server; it is not a crash.", warn=True, new_step=False)
    elif state == "slow":
        d.caption("The worker is behind.",
                  "The Lab shows only what is stored so far, and says so. The scores will still land.",
                  warn=True, new_step=False)
    else:
        d.caption("The API refused this run.", "The screen shows the API's own sentence.",
                  warn=True, new_step=False)
    d.note(f"lab: {state}")


def center_on(d: Demo, text: str) -> None:
    """In short: scroll the element with this text to the middle of the screen."""
    try:
        d.page.get_by_text(text, exact=False).first.evaluate(
            "e => e.scrollIntoView({block: 'center', behavior: 'smooth'})")
        d.pause(1)
    except PlaywrightError:
        pass


def step_lab(d: Demo) -> None:
    """Telemetry Lab: hallucination (scored + HIGH alert), then drift."""
    d.open_more("Telemetry Lab")
    d.caption("Telemetry Lab: inject a fault on purpose.",
              "A simulator sends fake agent spans with a known fault. The real evaluator scores them, "
              "and what you see is read back from the API.")
    d.caption("Scenario 1: hallucination.",
              "The verifier and the analyst say things their evidence does not support. "
              "We expect grounding alerts on both.", new_step=False)
    state, text = run_lab(d, "Hallucination")
    if state != "done":
        lab_problem_caption(d, state, text)
    else:
        result = d.page.get_by_text(re.compile(r"^Result: ")).first
        d.spot(result.locator("xpath=../.."))
        scored = re.search(r"(\d+) of (\d+) spans scored", text)
        d.caption("Scored by the worker, on a CPU.",
                  (f"{scored.group(1)} of {scored.group(2)} spans scored. " if scored else "")
                  + "0 is safe, 1 is risky; above 0.70 raises an alert.", new_step=False, where="top-right")
        # Only the stored-alerts list counts (the scenario text above it also names the alert).
        # inner_text gives the label in upper case, as the CSS shows it, hence re.I.
        alerts = re.split(r"Alerts stored for this run", text, flags=re.I)[-1]
        center_on(d, "Alerts stored for this run")  # the list sits low, under the dock otherwise
        if "HIGH_HALLUCINATION_RISK" in alerts:
            agents = sorted(set(re.findall(r"HIGH_HALLUCINATION_RISK · [^']*'(\w+)'", alerts)))
            sev = re.search(r"(\w+) HIGH_HALLUCINATION_RISK", alerts)
            # The scenario expects the verifier and the analyst. An agent missing here had the same
            # alert in the last 15 minutes: the chat's verifier uses the same agent name.
            missing = sorted({"verifier", "analyst"} - set(agents)) if agents else []
            d.caption("HIGH_HALLUCINATION_RISK alert raised"
                      + (f" for {' and '.join(agents)}." if agents else "."),
                      (f"Severity: {sev.group(1)}. " if sev else "")
                      + (f"No new one for {' and '.join(missing)}: an agent with that name had the same alert "
                         "in the last 15 minutes (the chat's verifier has the same name). " if missing else "")
                      + "It also appears under Incidents.", new_step=False, where="top-right")
        elif "No alert was stored" in alerts:
            d.note("hallucination run: no new alert (dedup)")
            d.caption("High scores, but no new alert this time.",
                      "The same alert for the same agent is raised at most once in 15 minutes, "
                      "so a repeat run is deduplicated. That is by design.", warn=True, new_step=False, where="top-right")
        else:
            d.caption("The alerts stored for this run are listed here.", "", new_step=False, where="top-right")
        d.unspot()

    d.caption("Scenario 2: drift.",
              "A demo agent sends 20 billing-support replies, then 12 about mountain hiking. "
              "Its behaviour changed, so drift should fire.")
    state, text = run_lab(d, "Drift")
    if state != "done":
        lab_problem_caption(d, state, text)
        return
    m = re.search(r"Drift distance on the final span:\s*(\d+\.\d+|not available)", text)
    center_on(d, "Drift distance on the final span")
    fired = re.search(r"DRIFT_DETECTED\s+fired for ([\w, ]+)", text)
    d.caption("Drift measured.",
              (f"Distance on the final span: {m.group(1)} (alert above 0.30). " if m else "")
              + ("DRIFT_DETECTED fired." if fired else
                 "No new DRIFT_DETECTED this time: a repeat inside 15 minutes is deduplicated."),
              new_step=False, warn=not fired, where="top-right")


def step_drift(d: Demo) -> None:
    """Drift view: pick the demo agent if it is there and show its window distance."""
    d.dock("Drift")
    d.page.get_by_role("heading", name="Behavioral Drift").wait_for(timeout=30000)
    agent = d.page.get_by_role("button", name=re.compile(r"^drift_demo_agent"))
    picked = False
    try:
        agent.first.wait_for(timeout=4000)
        d.click(agent.first)
        picked = True
    except PlaywrightError:
        drifting = d.page.get_by_role("button", name=re.compile(r"\(0\.\d+ Δ\)"))
        if drifting.count() > 0:
            d.click(drifting.first)
    d.pause(1)
    text = d.main_text()
    m = re.search(r"WINDOW CENTROID DISTANCE\s+([\d.—-]+)\s*Δ", text)
    dist = m.group(1) if m else None
    d.caption("Drift: the latest 12 outputs against the first 20.",
              (f"This agent's distance is {dist}. " if dist and dist not in "—-" else "")
              + "Above 0.30 the worker raises DRIFT_DETECTED. "
              + ("" if picked else "Real agents need 32 outputs before a distance exists, so most show a dash."))
    d.spot(d.page.get_by_text("WINDOW CENTROID DISTANCE").first.locator("xpath=.."))
    d.pause(2)
    d.unspot()


def step_incidents(d: Demo) -> None:
    d.dock("Incidents")
    d.page.get_by_role("heading", name="Failure-First Incident Investigation").wait_for(timeout=30000)
    text = d.main_text()
    n = re.search(r"(\d+) Active Incidents", text)
    d.caption("Incidents: every alert, newest first.",
              (f"{n.group(1)} active right now. " if n else "")
              + "Each names the rule, the score and the agent. Finding the cause is left to a person.")
    newest = d.page.locator("main").get_by_text(re.compile(r"^(HIGH HALLUCINATION RISK|DRIFT DETECTED|GROUNDING FAILURE)$")).first
    try:
        d.spot(newest)
        d.pause(2.5)
        d.unspot()
    except PlaywrightError:
        pass


def step_back_to_overview(d: Demo) -> None:
    d.dock("Overview")
    d.page.get_by_text("Spans Ingested").first.wait_for(timeout=30000)
    d.pause(2)
    d.caption("Back on the Overview, with the new runs counted.",
              "Everything you saw is live, on one small Azure VM, and anyone can open it.")
    d.caption("Thank you.", "AgentPulse: every agent step, checked for grounding and drift, without an LLM judge.",
              new_step=False)
    d.pause(2)


# --------------------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------------------

def compress_video(raw: Path, final: Path) -> bool:
    """In short: re-encode Playwright's large raw video to VP9 with its own ffmpeg (~5x smaller).

    Returns False (and the caller keeps the raw file) when no ffmpeg is found or encoding fails."""
    candidates = sorted(Path.home().glob("AppData/Local/ms-playwright/ffmpeg-*/ffmpeg-win64.exe"), reverse=True)
    ffmpeg = str(candidates[0]) if candidates else shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    print("Compressing the video (about 1.5 min)...")
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-c:v", "libvpx-vp9",
           "-crf", "40", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", str(final)]
    try:
        ok = subprocess.run(cmd, check=False).returncode == 0 and final.exists()
    except OSError:
        ok = False
    if ok:
        raw.unlink(missing_ok=True)
    return ok


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Automatic AgentPulse demo with captions and a video.")
    p.add_argument("--speed", choices=SPEEDS, default="normal", help="reading pauses: slow, normal or fast")
    p.add_argument("--no-lab", action="store_true", help="skip the Telemetry Lab runs (saves the per-IP Lab limit)")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help="site to demo (default: the live Azure site)")
    p.add_argument("--size", default="1920x1080", help="window size, e.g. 1920x1080 or 1366x768")
    p.add_argument("--browser", choices=["chrome", "msedge", "chromium"], default="chrome",
                   help="installed Chrome (default), Edge, or Playwright's own Chromium")
    p.add_argument("--headless", action="store_true", help="no visible window (for a quick check only)")
    p.add_argument("--no-video", action="store_true", help="do not record a video")
    p.add_argument("--shots", action="store_true", help="also save a screenshot at every caption (output/shots/)")
    p.add_argument("--keep-raw", action="store_true",
                   help="keep Playwright's raw video (about 200 MB) instead of a smaller VP9 copy (about 45 MB)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    # In short: the Windows console is not UTF-8 by default; this keeps the curly quotes readable.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args(sys.argv[1:] if argv is None else argv)
    width, height = (int(x) for x in args.size.lower().split("x"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    video_tmp = OUTPUT_DIR / "_recording"
    steps = [step_landing, step_overview, step_rag, step_traces]
    steps += [] if args.no_lab else [step_lab, step_drift]
    steps += [step_incidents, step_back_to_overview]
    # In short: the number of numbered captions ("Step n of N"); extra captions inside a step reuse its number.
    total = 11 if args.no_lab else 14

    with sync_playwright() as pw:
        # In short: launch a real, visible browser. "chrome" uses the Chrome already on the PC,
        # so `playwright install` is not needed; "chromium" needs it once.
        # --force-device-scale-factor=1: with Windows display scaling (125 %, 150 %) the video
        # would otherwise record only the top-left corner of the page, zoomed in.
        launch = {"headless": args.headless,
                  "args": [f"--window-size={width},{height + 120}", "--window-position=0,0",
                           "--force-device-scale-factor=1"]}
        if args.browser != "chromium":
            launch["channel"] = args.browser
        try:
            browser = pw.chromium.launch(**launch)
        except PlaywrightError as exc:
            print(f"Could not start {args.browser}: {exc}\nTry --browser chromium after "
                  "`python -m playwright install chromium`.")
            return 2
        context_opts = {"viewport": {"width": width, "height": height}, "device_scale_factor": 1,
                        "accept_downloads": True, "locale": "en-GB"}
        if not args.no_video:
            shutil.rmtree(video_tmp, ignore_errors=True)
            context_opts |= {"record_video_dir": str(video_tmp),
                             "record_video_size": {"width": width, "height": height}}
        context = browser.new_context(**context_opts)
        try:
            page = context.new_page()
        except PlaywrightError as exc:
            # The usual cause: video needs Playwright's own ffmpeg, downloaded once.
            print(f"Could not open a page: {str(exc).splitlines()[0]}\n"
                  "If it says ffmpeg: run `python -m playwright install ffmpeg`, or add --no-video.")
            browser.close()
            return 2
        page.set_default_timeout(15000)
        demo = Demo(page, SPEEDS[args.speed], args.base_url, total)
        if args.shots:
            demo.shots = OUTPUT_DIR / "shots" / f"{width}x{height}"
            shutil.rmtree(demo.shots, ignore_errors=True)
            demo.shots.mkdir(parents=True)
        started = time.time()
        failed = None
        for step in steps:
            try:
                step(demo)
            except Exception as exc:  # one broken step must not end the whole demo
                failed = failed or f"{step.__name__}: {exc}"
                print(f"!! {step.__name__} failed: {exc}")
                demo.note(f"{step.__name__} failed: {str(exc).splitlines()[0]}")
                demo.caption("This step did not go as planned.",
                             "The demo carries on with the next screen.", warn=True, new_step=False)
        elapsed = time.time() - started
        # Ask for the file name while Playwright is still running; the file is complete after close().
        raw_video = Path(page.video.path()) if page.video else None
        context.close()
        browser.close()

    print(f"\nRun took {elapsed:.0f} s ({elapsed / 60:.1f} min).")
    if not args.no_video and raw_video is not None and raw_video.exists():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        final = OUTPUT_DIR / f"agentpulse_auto_demo_{stamp}_{width}x{height}.webm"
        if args.keep_raw or not compress_video(raw_video, final):
            raw_video.replace(final)
        shutil.rmtree(video_tmp, ignore_errors=True)
        print(f"Video: {final} ({final.stat().st_size / 1e6:.1f} MB, about {elapsed / 60:.1f} min)")
    if demo.notes:
        print("Honest states met on the way:")
        for n in demo.notes:
            print(f"  - {n}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
