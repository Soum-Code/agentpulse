"""AgentPulse automatic demo: a visible browser walks through the live site like a presenter.

In short: Playwright opens Chrome, shows a small newspaper-style caption before every step and
visits every view of the console: landing, Overview, RAG Live (three fresh questions), the
Telemetry Lab (all five scenarios), Agents, Traces, APM, Incidents, Drift, Replay, Experiments,
Datasets, Settings, and back to Overview. It records the run as a video and writes, next to it,
the questions it asked and a log of every click, keypress, scroll and caption (events.json).

Run (see README.md in this folder for the one-time install):

    python demo/auto_demo/auto_demo.py
    python demo/auto_demo/auto_demo.py --speed fast --no-lab --size 1366x768

Nothing is preset or invented: the chat questions are built at run time from the chat's own
corpus (GET /chat/corpus) plus one random general-knowledge question, the Lab topics are drawn
at random, and every number in a caption is read from the page or the API during the run.
The site needs no key and none is used here. Every selector is a role or a visible text,
never a pixel position. Honest states (limit reached, evaluator slow, an alert held back by
the 15-minute cooldown, an empty view) are captioned instead of crashing the demo.
"""

from __future__ import annotations

import argparse
import json
import random
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
VIDEO_NAME = "agentpulse_auto_demo.webm"  # stable name, next to events.json (overwritten each run)

# In short: one multiplier for every pause, so --speed changes the whole run at once.
SPEEDS = {"slow": 1.5, "normal": 1.0, "fast": 0.5}

# In short: how long we wait for the site before captioning "still waiting" and moving on.
CHAT_TIMEOUT_S = 150  # one chat turn (3 agents); normally ~2-5 s with Groq
LEDGER_TIMEOUT_S = 90  # the worker scoring a turn's three spans
LAB_TIMEOUT_S = 200  # the Lab gives up by itself after 180 s

# --------------------------------------------------------------------------------------
# Question and topic pools (the corpus questions are built from GET /chat/corpus at run time)
# --------------------------------------------------------------------------------------

# In short: templates filled with a corpus document's subject, so each run asks new questions.
QUESTION_TEMPLATES = [
    "what does the document on {t} say, in simple terms?",
    "what problem does the document on {t} address?",
    "what is the main trade-off described in {t}?",
    "what are the key ideas in {t}?",
    "how would an engineer use what {t} describes?",
    "summarise {t} in two sentences.",
    "what is the most important practical point in {t}?",
]

# In short: questions the corpus cannot answer; one is picked at random each run.
OUT_OF_CORPUS = [
    "who won the 2022 football world cup?",
    "what is the tallest mountain in Africa?",
    "who painted the Mona Lisa?",
    "how many moons does Mars have?",
    "what is the capital of Australia?",
    "when did the first person walk on the Moon?",
    "what is the boiling point of water at the top of Everest?",
    "who wrote the novel One Hundred Years of Solitude?",
    "what is the longest river in South America?",
    "how do bees make honey?",
    "what causes the northern lights?",
    "which planet has the shortest day?",
    "who discovered penicillin?",
    "what is the speed of sound in air?",
    "why is the sky blue?",
]

# In short: topics for the Lab's query box (only the clean, hallucination and tool_mismatch
# scenarios use it; the backend says so in backend/app/routers/ingest.py).
LAB_TOPICS = [
    "Battery chemistries for grid-scale energy storage",
    "Coral reef recovery after marine heatwaves",
    "Early detection of sepsis in hospital wards",
    "Carbon capture with direct air capture plants",
    "Soil health in regenerative farming",
    "Quantum error correction with surface codes",
    "Urban heat islands and street trees",
    "Antibiotic resistance in hospital water systems",
    "Small modular nuclear reactors",
    "Microplastics in drinking water",
    "Wildfire smoke and lung health",
    "Low-cost sensors for air quality",
    "Desalination energy costs",
    "Heat pumps in cold climates",
    "Long COVID and exercise intolerance",
]

# The five Lab scenarios, as the Lab's dropdown names them, and whether the topic box applies.
LAB_SCENARIOS = [
    ("Clean run", True),
    ("Hallucination", True),
    ("Tool-claim mismatch", True),
    ("Drift", False),
    ("Disagreement", False),
]


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
    """In short: holds the page, the speed, the step counter and the event log, and offers
    caption / pause / click helpers that also write each action to events.json."""

    def __init__(self, page: Page, speed: float, base_url: str, total_steps: int, t0: float):
        self.page = page
        self.speed = speed
        self.base_url = base_url.rstrip("/")
        self.step = 0
        self.total = total_steps
        self.t0 = t0  # time.monotonic() just before the recording context was made
        self.events: list[dict] = []  # every click, keypress, scroll, caption (events.json)
        self.notes: list[str] = []  # honest states we met, printed at the end
        self.asked: list[dict] = []  # the questions and Lab topics of this run (questions.json)
        self.shots: Path | None = None  # set by --shots: a screenshot per caption goes here
        self.shot_n = 0
        self.ledger_alerts: list[tuple[str, str]] = []

    # In short: one line of events.json, timed from the start of the video.
    def log(self, action: str, **fields) -> None:
        self.events.append({"t": round(time.monotonic() - self.t0, 2), "action": action, **fields})

    @staticmethod
    def bbox(locator) -> dict | None:
        try:
            b = locator.bounding_box(timeout=2000)
        except PlaywrightError:
            return None
        return {k: round(v, 1) for k, v in b.items()} if b else None

    # In short: a pause that scales with --speed.
    def pause(self, seconds: float) -> None:
        self.page.wait_for_timeout(int(seconds * self.speed * 1000))

    # In short: inject (or update) the banner, then wait long enough to read it.
    def caption(self, head: str, body: str = "", *, where: str = "bottom-left",
                warn: bool = False, new_step: bool = False, read: bool = True) -> None:
        if new_step:
            self.step += 1
        kicker_right = f"Step {self.step} of {self.total}"
        print(f"[{kicker_right}] {head} | {body}")
        self.log("caption", label=kicker_right, head=head, body=body, warn=warn)
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
    def spot(self, locator, label: str = "") -> None:
        try:
            locator.scroll_into_view_if_needed(timeout=4000)
            self.log("spot", label=label, bbox=self.bbox(locator))
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
    def click(self, locator, label: str, *, beat: float = 0.8) -> None:
        self.spot(locator, label)
        self.pause(beat)
        self.log("click", label=label, bbox=self.bbox(locator))
        locator.click(timeout=10000)
        self.unspot()

    def key(self, key: str, label: str = "") -> None:
        self.log("key", label=label or key, key=key)
        self.page.keyboard.press(key)

    def scroll(self, dy: int) -> None:
        self.log("scroll", dy=dy)
        self.page.mouse.wheel(0, dy)

    # In short: the floating dock is the last copy of each tab button on the page
    # (RAG Live has its own "Jump to" buttons with the same names, earlier in the page).
    def dock(self, name: str) -> None:
        button = self.page.get_by_role("button", name=re.compile(rf"^{re.escape(name)}\b")).last
        self.click(button, name)
        self.pause(1.5)

    def open_more(self, label: str) -> None:
        """In short: open the dock's More menu and pick an item by its exact name. The names are
        exact because the side panel has look-alikes ("Replay in Simulator"). If the menu is
        already open, click the item straight away; pressing More again would close it."""
        more = self.page.get_by_role("button", name="More", exact=True).last
        item = self.page.get_by_role("button", name=label, exact=True).first
        if not item.is_visible():
            self.click(more, "More")
            item.wait_for(state="visible", timeout=5000)
            self.pause(0.6)
        self.click(item, label)
        self.pause(1.5)

    def main_text(self) -> str:
        try:
            return self.page.locator("main").first.inner_text(timeout=5000)
        except PlaywrightError:
            return ""

    def api(self, path: str):
        """In short: GET a public read endpoint of the site (same origin as the page)."""
        try:
            r = self.page.request.get(self.base_url + path, timeout=10000)
            return r.json() if r.ok else None
        except (PlaywrightError, ValueError):
            return None

    def center_on(self, text: str) -> None:
        """In short: scroll the element with this text to the middle of the screen."""
        try:
            el = self.page.get_by_text(text, exact=False).first
            el.evaluate("e => e.scrollIntoView({block: 'center', behavior: 'smooth'})")
            self.log("scroll", label=text, to="center")
            self.pause(1)
        except PlaywrightError:
            pass

    def note(self, text: str) -> None:
        self.notes.append(text)


# --------------------------------------------------------------------------------------
# Landing page and Overview
# --------------------------------------------------------------------------------------

def step_landing(d: Demo) -> None:
    """Landing page: the hero, then each section through the page's own navigation links."""
    d.page.goto(d.base_url, wait_until="domcontentloaded")
    d.page.get_by_role("heading", level=1).first.wait_for(timeout=30000)
    d.pause(1.5)
    d.caption("AgentPulse watches AI agents that work together.",
              "It checks every step for two things: is the answer supported by its evidence "
              "(grounding), and is the agent slowly changing (drift)? No big LLM is used as a judge.",
              new_step=True)
    # The landing page's own menu: each link scrolls to a section. Read each section's heading.
    sections = [("Failure Modes", "problem"), ("ROI Calculator", "calculator"),
                ("Live Evaluator", "sandbox"), ("Live Trace", "trace-story"), ("Behavioral Drift", "drift")]
    for link_name, anchor in sections:
        link = d.page.get_by_role("link", name=link_name).first
        try:
            d.click(link, link_name, beat=0.4)
        except PlaywrightError:
            continue
        d.pause(1.2)
        try:
            heading = d.page.locator(f"#{anchor}").get_by_role("heading").first.inner_text(timeout=2500)
        except PlaywrightError:
            heading = link_name
        d.caption(f"Landing page: {' '.join(heading.split())}", "", where="top-right", read=False)
        d.pause(2.6)
    d.page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
    d.log("scroll", to="top")
    d.pause(1.5)


def overview_facts(d: Demo) -> dict:
    """In short: the Overview counters as the page shows them right now."""
    text = d.main_text()
    # inner_text returns the labels as the CSS shows them (upper case), hence re.I.
    found = {}
    for key, pat in (("spans", r"Spans Ingested\s+([\d,]+)"), ("incidents", r"Active Incidents\s+([\d,]+)"),
                     ("drifting", r"Behavioral Drift\s+(\d+)\s+agents?\s+drifting")):
        m = re.search(pat, text, re.I)
        if m:
            found[key] = m.group(1)
    return found


def step_overview(d: Demo) -> None:
    """Launch App, then the Overview with its real counters read off the screen."""
    d.caption("Let's open the console.", "Press Launch App, top right.", where="top-right", new_step=True)
    launch = d.page.get_by_role("button", name="Launch App").first
    try:
        d.click(launch, "Launch App")
    except PlaywrightTimeout:
        # The landing page's animations can keep the browser busy, so Playwright never confirms
        # the click even though it landed. Check for the console below instead of failing here.
        d.unspot()
    try:
        d.page.get_by_text("Spans Ingested").first.wait_for(timeout=10000)
    except PlaywrightTimeout:
        launch.dispatch_event("click")  # a plain DOM click, which needs no mouse round trip
    d.page.get_by_text("Spans Ingested").first.wait_for(timeout=30000)
    d.pause(2.5)  # let the first poll fill the counters
    f = overview_facts(d)
    d.start_facts = f
    facts = []
    if "spans" in f:
        facts.append(f"{f['spans']} spans ingested")
    if "incidents" in f:
        facts.append(f"{f['incidents']} active incidents")
    if "drifting" in f:
        facts.append(f"{f['drifting']} agent(s) drifting")
    body = ("Right now the live database shows: " + ", ".join(facts) + ". "
            if facts else "These counters are read from the live API, not typed in. ")
    body += "A dash means 'not measured', never a fake zero."
    d.spot(d.page.get_by_text("Spans Ingested").first.locator("xpath=../.."), "Spans Ingested")
    d.caption("Overview: the real numbers from the live system.", body, where="top-right")
    d.unspot()


# --------------------------------------------------------------------------------------
# RAG Live: three fresh questions
# --------------------------------------------------------------------------------------

def subject_of(title: str) -> str:
    """In short: the corpus title itself, tidied, so the question names the document it is about."""
    return " ".join(title.split())


def make_questions(d: Demo, rng: random.Random) -> list[dict]:
    """Two questions from random corpus documents and one out-of-corpus question."""
    corpus = d.api("/chat/corpus") or {}
    docs = [x for x in corpus.get("documents", []) if isinstance(x, str) and x.strip()]
    questions = []
    if len(docs) >= 2:
        for title, template in zip(rng.sample(docs, 2), rng.sample(QUESTION_TEMPLATES, 2)):
            questions.append({"kind": "in_corpus", "source_document": title,
                              "question": template.format(t=subject_of(title))})
    else:
        d.note("GET /chat/corpus gave fewer than 2 documents; only the out-of-corpus question is asked")
    questions.append({"kind": "out_of_corpus", "source_document": None, "question": rng.choice(OUT_OF_CORPUS)})
    return questions


def ask(d: Demo, question: str) -> str:
    """Type a question into the RAG chat, wait for the three agents, return the outcome text."""
    box = d.page.get_by_role("textbox", name="Message")
    d.spot(box, "Message")
    box.click()
    started = time.monotonic()
    d.log("type", label="Message", bbox=d.bbox(box), text=question)
    box.press_sequentially(question, delay=int(45 * d.speed))
    d.events[-1]["dur"] = round(time.monotonic() - started, 2)
    d.pause(0.8)
    d.unspot()
    log = d.page.get_by_role("log", name="Conversation")
    before = log.inner_text()
    d.key("Enter", "Send")

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
                  warn=True)
    elif outcome == "Limit reached":
        d.caption("Limit reached: the abuse limit is doing its job.",
                  "Each visitor gets 5 questions a minute and 40 a day. The screen says so instead of failing silently.",
                  warn=True)
    else:
        d.caption(f"The chat says: {outcome}.",
                  "Every provider in the failover chain was tried, and the screen says which one failed. "
                  "We never call a failure a success.", warn=True)


LEDGER_JS = """() => {
    const h = [...document.querySelectorAll('h3')].find(e => e.textContent.trim() === 'Agent ledger (this turn)');
    if (!h) return '';
    let el = h;
    while (el && !(el.innerText || '').includes('Alerts on this trace')) el = el.parentElement;
    return el ? el.innerText : '';
}"""


def wait_ledger(d: Demo) -> str:
    """Wait until the agent ledger has scored every span (or the wait runs out). Returns its state."""
    deadline = time.time() + LEDGER_TIMEOUT_S
    while time.time() < deadline:
        text = d.page.evaluate(LEDGER_JS) or ""
        tail = text.split("Alerts on this trace")[-1] if "Alerts on this trace" in text else ""
        if "None raised." in tail:
            d.ledger_alerts = []
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
        h = d.page.get_by_role("heading", name="Agent ledger (this turn)")
        h.evaluate("e => e.scrollIntoView({block: 'start', behavior: 'smooth'})")
        d.log("scroll", label="Agent ledger (this turn)", to="start")
    except PlaywrightError:
        pass
    d.pause(1)


def ledger_caption(d: Demo, state: str, *, out_of_corpus: bool) -> None:
    show_ledger(d)
    rows = ledger_rows(d)
    if out_of_corpus:
        # Say what the screen shows for this turn; never predict the verdicts.
        d.caption("The corpus cannot answer this. What did the ledger record?",
                  (f"Grounding risk per agent: {rows}. " if rows else "") + "Read from the screen, not predicted.",
                  where="top-right")
    elif rows:
        d.caption("Each agent's grounding risk and verdict:", rows + ".", where="top-right")
    if state == "none":
        d.caption("All spans are scored. No alert was raised for this turn.",
                  "'None raised' appears only after every span is scored, never early."
                  + (" A contradicted span raises no new alert if the same alert fired for that agent "
                     "in the last 15 minutes." if "Contradicted" in rows else ""),
                  where="top-right")
    elif state == "alerts":
        names = ", ".join(f"{a} ({sev})" for a, sev in d.ledger_alerts[:3])
        body = (f"{names}. " if names else "") + "Each alert names the agent and the score that crossed the threshold."
        if "Contradicted" in rows and not any("GROUNDING" in a for a, _ in d.ledger_alerts):
            body += " A grounding alert raised for the same agent in the last 15 minutes is not raised again."
        d.caption("All spans scored, and the worker raised an alert on this trace.", body, where="top-right")
    else:
        d.note("ledger not fully scored in time")
        d.caption("The evaluator is still scoring.",
                  "Until it finishes, the ledger says 'pending' and the alerts line says 'Unknown', "
                  "never 'None'. We move on; the scores will land in the trace.",
                  where="top-right", warn=True)


def step_rag_intro(d: Demo) -> None:
    d.dock("RAG Live")
    d.page.get_by_role("textbox", name="Message").wait_for(timeout=30000)
    d.caption("RAG Live: a real chat with three agents.",
              "Each question runs a retriever, a verifier and an answerer, each a hosted model. "
              "Every step is sent to AgentPulse as a span and scored there.", new_step=True)
    # Evaluator health badge: say it if the worker is not alive.
    status = d.page.get_by_role("status").filter(has_text=re.compile(r"Worker|Evaluator")).first
    try:
        status_text = status.inner_text(timeout=3000)
    except PlaywrightError:
        status_text = ""
    if status_text and "alive" not in status_text.lower():
        d.note(f"evaluator badge: {status_text}")
        d.caption(f"The monitor says: {status_text}.",
                  "Then answers still come back, but the ledger will stay pending.", where="top-right", warn=True)
    n_docs = len((d.api("/chat/corpus") or {}).get("documents", []))
    d.caption("Today's questions are made up on the spot.",
              (f"Two come from {n_docs} documents in the chat's own corpus, " if n_docs else "Two come from the corpus, ")
              + "one is general knowledge the corpus cannot answer. They change on every run.",
              where="top-right")


def make_question_step(q: dict, index: int):
    """In short: one step per question, so each gets its own step number."""
    def step(d: Demo) -> None:
        if q["kind"] == "in_corpus":
            d.caption(f"Question {index}, about '{q['source_document']}':", f"“{q['question']}”",
                      where="top-right", new_step=True)
        else:
            d.caption(f"Question {index}, outside the corpus:", f"“{q['question']}”",
                      where="top-right", new_step=True)
        outcome = ask(d, q["question"])
        q["outcome"] = outcome
        if outcome != "ok":
            caption_chat_problem(d, outcome)
        elif index == 1:
            d.caption("Three stages, each with its time, provider and model.",
                      "The answerer is told to use the retrieved evidence and nothing else.", where="top-right")
            ledger = d.page.get_by_role("heading", name="Agent ledger (this turn)")
            d.spot(ledger, "Agent ledger (this turn)")
            d.caption("The agent ledger: one row per agent span.",
                      "Model, latency, tokens, grounding risk and verdict. Rows say 'pending' until the worker "
                      "has scored them. 'Unverifiable' means the evidence neither supports nor contradicts.",
                      where="top-right", read=False)
            d.pause(4)
            d.unspot()
        state = wait_ledger(d)
        q["ledger_state"] = state
        ledger_caption(d, state, out_of_corpus=q["kind"] == "out_of_corpus")
        q["ledger_rows"] = ledger_rows(d)
    step.__name__ = f"step_question_{index}"
    return step


# --------------------------------------------------------------------------------------
# Telemetry Lab: all five scenarios
# --------------------------------------------------------------------------------------

def run_lab(d: Demo, scenario_label: str, topic: str | None) -> tuple[str, str]:
    """Run one Telemetry Lab scenario and wait for the worker's scores. Returns (state, result text)."""
    d.page.get_by_role("heading", name="Telemetry Lab").wait_for(timeout=30000)
    combo = d.page.get_by_role("main").get_by_role("combobox").first
    d.log("select", label="Scenario", value=scenario_label, bbox=d.bbox(combo))
    combo.select_option(label=scenario_label)
    d.pause(1)
    if topic:
        # The query box only exists for the scenarios that use it.
        box = d.page.get_by_role("main").get_by_role("textbox").first
        try:
            box.fill("", timeout=3000)
            started = time.monotonic()
            d.log("type", label="Query the pipeline is asked about", bbox=d.bbox(box), text=topic)
            box.press_sequentially(topic, delay=int(25 * d.speed))
            d.events[-1]["dur"] = round(time.monotonic() - started, 2)
        except PlaywrightError:
            pass
        d.pause(0.6)
    run = d.page.get_by_role("button", name=re.compile(r"^(Run scenario|Running)"))
    d.click(run, "Run scenario")
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
                  "Each visitor may run a set number of scenarios an hour. " + (m.group(0) + "." if m else "")
                  + " The limit protects the shared server; it is not a crash.", warn=True, where="top-right")
    elif state == "slow":
        d.caption("The worker is behind.",
                  "The Lab shows only what is stored so far, and says so. The scores will still land.",
                  warn=True, where="top-right")
    else:
        d.caption("The API refused this run.", "The screen shows the API's own sentence.",
                  warn=True, where="top-right")
    d.note(f"lab: {state}")


def lab_outcome(text: str) -> tuple[list[tuple[str, str]], list[str], list[str]]:
    """In short: from the result card, (fired: [(alert, agents)], not fired: [alert], stored alert lines)."""
    expected = re.split(r"Expected alerts", text, flags=re.I)[-1]
    expected = re.split(r"Alerts stored for this run", expected, flags=re.I)[0]
    fired = re.findall(r"([A-Z_]{6,})\s+fired for ([\w, ]+)", expected)
    not_fired = re.findall(r"([A-Z_]{6,})\s+not fired", expected)
    stored = re.split(r"Alerts stored for this run", text, flags=re.I)[-1]
    lines = [" ".join(l.split()) for l in stored.splitlines() if re.search(r"[A-Z]{3,}_[A-Z_]+", l)]
    return [(a, g.strip()) for a, g in fired], not_fired, lines


# In short: one plain sentence per scenario on what it injects (the Lab card says the same).
LAB_WHAT = {
    "Clean run": "A control run with no fault. Nothing should fire.",
    "Hallucination": "The verifier and the analyst say things their evidence does not support.",
    "Tool-claim mismatch": "The retriever claims 10 papers when its tool returned 3.",
    "Drift": "A demo agent sends 20 billing-support replies, then 12 about mountain hiking. "
             "This scenario uses its own fixed texts; the topic box does not apply.",
    "Disagreement": "Two agents give conflicting answers. Its alert was withdrawn after it measured "
                    "at chance, so the score is stored but no alert is expected.",
}


def make_lab_step(scenario_label: str, topic: str | None, first: bool):
    def step(d: Demo) -> None:
        if first:
            d.open_more("Telemetry Lab & Live Simulator")
            d.caption("Telemetry Lab: inject a fault on purpose.",
                      "A simulator sends made-up agent spans with a known fault. The real evaluator scores them, "
                      "and what you see is read back from the API. We run all five scenarios.", new_step=True)
            d.caption(f"Scenario: {scenario_label}.", LAB_WHAT[scenario_label], where="top-right")
        else:
            d.page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
            d.log("scroll", to="top")
            d.caption(f"Scenario: {scenario_label}.", LAB_WHAT[scenario_label], where="top-right", new_step=True)
        d.asked.append({"kind": "lab", "scenario": scenario_label, "topic": topic})
        state, text = run_lab(d, scenario_label, topic)
        d.asked[-1]["state"] = state
        if state != "done":
            lab_problem_caption(d, state, text)
            return
        scored = re.search(r"(\d+) of (\d+) spans scored", text)
        fired, not_fired, stored = lab_outcome(text)
        d.asked[-1].update({"scored": scored.group(0) if scored else None, "fired": fired,
                            "not_fired": not_fired, "stored_alerts": stored})
        d.center_on("Alerts stored for this run")
        head = f"{scenario_label}: " + (f"{scored.group(1)} of {scored.group(2)} spans scored." if scored else "scored.")
        if scenario_label == "Drift":
            m = re.search(r"Drift distance on the final span:\s*(\d+\.\d+|not available)", text)
            body = (f"Drift distance on the final span: {m.group(1)} (alert above 0.30). " if m else "")
            body += ("DRIFT_DETECTED fired." if any(a == "DRIFT_DETECTED" for a, _ in fired)
                     else "DRIFT_DETECTED did not fire this time"
                     + (": a repeat inside 15 minutes raises no new alert." if "15 minutes" in text else "."))
        elif fired:
            body = "Fired: " + "; ".join(f"{a} for {g}" for a, g in fired) + "."
            if not_fired:
                body += " Not fired: " + ", ".join(not_fired) + "."
        elif not_fired:
            body = "Expected " + ", ".join(not_fired) + ", but no new alert was stored"
            body += (": the same alert fired for that agent in the last 15 minutes, so it is held back."
                     if "15 minutes" in text else ".")
        else:
            body = ("No alert stored, which is the expected result for a clean run."
                    if scenario_label == "Clean run" else
                    "No alert stored: the disagreement alert is withdrawn, as the card says."
                    if scenario_label == "Disagreement" else "No alert stored for this run.")
        # Agents named like the chat's (verifier, retriever) share its 15-minute alert cooldown.
        if scenario_label == "Hallucination" and fired:
            got = {g for _, gs in fired for g in re.split(r",\s*", gs)}
            missing = sorted({"verifier", "analyst"} - got)
            if missing:
                body += (f" No new one for {' and '.join(missing)}: an agent with that name had the same alert in "
                         "the last 15 minutes (the chat's verifier has the same name).")
        d.caption(head, body, where="top-right", warn=(scenario_label != "Clean run" and not fired
                                                       and scenario_label != "Disagreement"))
    step.__name__ = f"step_lab_{scenario_label.split()[0].lower()}"
    return step


# --------------------------------------------------------------------------------------
# The other views
# --------------------------------------------------------------------------------------

def step_agents(d: Demo) -> None:
    d.dock("Agents")
    d.page.get_by_text(re.compile(r"agents seen", re.I)).first.wait_for(timeout=20000)
    summary = d.page.get_by_text(re.compile(r"\d+ agents seen", re.I)).first.inner_text()
    summary = "; ".join(p.strip() for p in summary.split("·") if p.strip())
    d.caption("Agents: every agent that has sent a span.",
              f"The roster says: {summary}. Each card shows spans, latency and drift status.", new_step=True)
    card = d.page.locator("main").get_by_text("drift_demo_agent", exact=True).first
    try:
        d.click(card, "drift_demo_agent")
        d.caption("The inspector shows what was measured for one agent.",
                  "Fields nobody reported, such as framework or model, stay as a dash.", where="top-right")
    except PlaywrightError:
        pass


def step_traces(d: Demo) -> None:
    """Traces: the list, a status filter, the newest flagged trace, the inspector, then X."""
    d.dock("Traces")
    d.page.get_by_role("heading", name="Trace Investigation Spine").wait_for(timeout=30000)
    # Clicking an agent card earlier pins it as the "active context", which filters Traces to that
    # agent. Clear it, so the list shows every trace.
    clear = d.page.get_by_role("button", name="Clear active context drilldown")
    if clear.count() > 0:
        try:
            d.click(clear.first, "Clear context filter", beat=0.3)
        except PlaywrightError:
            pass
    # Wait until the list has loaded (the All counter is above 0).
    try:
        d.page.get_by_role("button", name=re.compile(r"^All \([1-9]\d*\)")).first.wait_for(timeout=15000)
    except PlaywrightTimeout:
        pass
    d.pause(1.5)
    all_btn = d.page.get_by_role("button", name=re.compile(r"^All \(\d+\)"))
    counts = {}
    for label in ("All", "OK", "Warning", "Error", "Unknown"):
        try:
            name = d.page.get_by_role("button", name=re.compile(rf"^{label} \(\d+\)")).first.inner_text(timeout=2000)
            counts[label] = re.search(r"\((\d+)\)", name).group(1)
        except (PlaywrightError, AttributeError):
            pass
    d.caption("Traces: every run, newest first.",
              (f"On this page: {counts.get('OK', '?')} OK, {counts.get('Warning', '?')} warning, "
               f"{counts.get('Error', '?')} error, {counts.get('Unknown', '?')} unknown. " if counts else "")
              + "A trace whose spans are not scored yet is Unknown, never OK.", new_step=True)
    # Filter to errors, then open the newest one.
    flt = "Error" if counts.get("Error", "0") != "0" else "Warning"
    err = d.page.get_by_role("button", name=re.compile(rf"^{flt} \(\d+\)")).first
    try:
        d.click(err, f"{flt} filter")
        d.pause(1.2)
    except PlaywrightError:
        pass
    first_copy = d.page.get_by_role("button", name=re.compile(r"^Copy Trace ID ")).first
    trace_id = (first_copy.get_attribute("aria-label") or "").replace("Copy Trace ID", "").strip()
    try:
        d.click(d.page.locator("main").get_by_text(trace_id, exact=True).first, f"trace {trace_id[:10]}")
    except PlaywrightError:
        d.key("j", "next trace")  # fallback: the list's own keyboard shortcut
    d.pause(1.5)
    inspector = d.page.get_by_text("SPAN INSPECTOR").first
    d.spot(inspector, "Span inspector")
    d.caption(f"Filtered to {flt.lower()}s. The span inspector shows one agent step.",
              "Its input, its output and the grounding score the worker gave it.", where="top-right", new_step=True)
    d.unspot()
    # The badge is a <span title=...> whose text starts with the verdict word; a screen-reader
    # sentence follows inside it, so match only the start.
    badge = d.page.locator("main span[title]").filter(
        has_text=re.compile(r"^(Supported|Unverifiable|Contradicted)")).first
    try:
        verdict = badge.inner_text(timeout=5000).split(".")[0].strip()
        risk = re.search(r"Risk\s+([\d.]+)", d.main_text(), re.I)
        d.spot(badge, f"Verdict {verdict}")
        d.caption(f"Verdict badge: {verdict}" + (f", grounding risk {risk.group(1)}." if risk else "."),
                  "The verdict sits next to the score, so a low score is never read as 'supported' by mistake.",
                  where="top-right")
        d.unspot()
    except PlaywrightError:
        d.caption("No verdict on this span.",
                  "The worker gave it no grounding verdict, so the screen shows none rather than a guess.",
                  where="top-right", warn=True)
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
            d.key("x", "Export trace JSON")
        path = OUTPUT_DIR / dl.value.suggested_filename
        dl.value.save_as(path)
        print(f"  trace JSON saved: {path}")
        d.caption("Saved.", f"{dl.value.suggested_filename}", where="top-right")
    except PlaywrightError:
        d.note("X did not start a download")
        d.caption("The export did not start this time.",
                  "The Export JSON button at the top of Traces does the same thing.", where="top-right", warn=True)
    try:
        d.click(all_btn.first, "All filter")
    except PlaywrightError:
        pass


def step_apm(d: Demo) -> None:
    d.dock("APM")
    d.page.get_by_text(re.compile(r"SYSTEM STATUS", re.I)).first.wait_for(timeout=20000)
    d.pause(1.5)
    text = d.main_text()
    status = re.search(r"SYSTEM STATUS:\s*([^\n]+)", text, re.I)
    p50 = re.search(r"API LATENCY P50\s+(\d+)\s*ms", text, re.I)
    ev = re.search(r"EVALUATOR\s+(\d+ of \d+ alive)", text, re.I)
    reqs = re.search(r"of ([\d,]+) requests", text, re.I)
    d.spot(d.page.get_by_text(re.compile(r"SYSTEM STATUS", re.I)).first.locator("xpath=.."), "System status")
    d.caption("APM: what the server measures about itself.",
              (f"Status: {status.group(1).strip().lower()}. " if status else "")
              + (f"API latency p50 {p50.group(1)} ms" if p50 else "")
              + (f" over {reqs.group(1)} requests" if reqs else "") + (". " if p50 else "")
              + (f"Evaluator: {ev.group(1)}. " if ev else "")
              + "What it does not measure is listed as 'not measured'.", new_step=True)
    d.unspot()
    d.center_on("NOT MEASURED BY THIS API")
    d.pause(2)


def step_incidents(d: Demo) -> None:
    d.dock("Incidents")
    d.page.get_by_role("heading", name="Failure-First Incident Investigation").wait_for(timeout=30000)
    text = d.main_text()
    n = re.search(r"(\d+) Active Incidents", text)
    newest = d.page.locator("main").get_by_role("paragraph").filter(
        has_text=re.compile(r"for agent '")).first
    try:
        msg = " ".join(newest.inner_text(timeout=3000).split())
    except PlaywrightError:
        msg = ""
    d.caption("Incidents: every alert, newest first.",
              (f"{n.group(1)} active right now. " if n else "")
              + (f"Newest: {msg} " if msg else "")
              + "Finding the cause is left to a person.", new_step=True)
    try:
        d.click(newest, "Newest incident")
        d.center_on("INCIDENT DIAGNOSIS")
        d.caption("The diagnosis panel: rule, agent, trace and flagged span.",
                  "It does not invent a root cause or a fix; it says so.", where="top-right")
    except PlaywrightError:
        pass


def step_drift(d: Demo) -> None:
    """Drift view: pick the demo agent and show its measured window distance."""
    d.dock("Drift")
    d.page.get_by_role("heading", name="Behavioral Drift").wait_for(timeout=30000)
    agent = d.page.get_by_role("button", name=re.compile(r"^drift_demo_agent"))
    picked = False
    try:
        agent.first.wait_for(timeout=4000)
        d.click(agent.first, "drift_demo_agent")
        picked = True
    except PlaywrightError:
        drifting = d.page.get_by_role("button", name=re.compile(r"\(0\.\d+ Δ\)"))
        if drifting.count() > 0:
            d.click(drifting.first, "drifting agent")
    d.pause(1)
    text = d.main_text()
    m = re.search(r"WINDOW CENTROID DISTANCE\s+([\d.]+)\s*Δ", text, re.I)
    dist = m.group(1) if m else None
    d.spot(d.page.get_by_text("WINDOW CENTROID DISTANCE").first.locator("xpath=.."), "Window centroid distance")
    d.caption("Drift: an agent's latest 12 outputs against its first 20.",
              "Each output becomes an embedding; the baseline is the mean of the first 20, the window the mean "
              "of the latest 12. DRIFT_DETECTED fires when the cosine distance between them passes 0.30.",
              new_step=True)
    if dist:
        over = float(dist) > 0.30
        d.caption(f"Measured for {'drift_demo_agent' if picked else 'this agent'}: {dist}.",
                  ("Above 0.30, so it counts as drift." if over else "Below 0.30, so no drift is detected.")
                  + " Real agents need 32 evaluated outputs before a distance exists; until then it is a dash.",
                  warn=not over)
    else:
        d.note("drift view: no distance shown")
        d.caption("No distance for this agent yet.",
                  "It needs 32 evaluated outputs; until then the screen shows a dash, not 0.", warn=True)
    d.unspot()


def step_replay(d: Demo) -> None:
    d.open_more("Replay & Trace Time-Travel")
    select = d.page.get_by_role("main").get_by_role("combobox").first
    try:
        select.wait_for(timeout=15000)
        options = select.locator("option").all_inner_texts()
        pick = next((o for o in options if "multi-agent (5)" in o), options[0] if options else None)
        if pick:
            d.log("select", label="Replay trace", value=pick, bbox=d.bbox(select))
            select.select_option(label=pick)
    except PlaywrightError:
        pick = None
    d.caption("Replay: step through a recorded trace, one span at a time.",
              (f"Trace {pick.split()[0][:12]}…, " if pick else "") + "read from the stored spans.", new_step=True)
    fwd = d.page.get_by_title("Step forwards").first
    for _ in range(3):
        try:
            d.click(fwd, "Step forwards", beat=0.4)
            d.pause(1.2)
        except PlaywrightError:
            break


def step_experiments(d: Demo) -> None:
    d.open_more("Experiments (result files)")
    d.pause(1)
    text = d.main_text()
    if re.search(r"No experiment results are available", text, re.I):
        d.note("experiments view: no result files on this instance")
        d.caption("Experiments: this instance has no result files loaded.",
                  "The screen says so instead of showing invented numbers. The results are in the repository "
                  "under experiments/results.", warn=True, new_step=True)
    else:
        files = re.findall(r"\b[\w.-]+\.json\b", text)
        d.caption("Experiments: the offline benchmark result files.",
                  (f"{len(set(files))} result files listed, " if files else "")
                  + "read from experiments/results by the API. The console does not run them.", new_step=True)
        d.scroll(500)
        d.pause(2)


def step_datasets(d: Demo) -> None:
    d.open_more("Curated Golden Datasets")
    data = d.api("/v1/datasets") or {}
    sets = data.get("datasets", [])
    names = ", ".join(f"{s.get('dataset_version') or s.get('dataset_name')} ({s.get('total_cases')} cases)"
                      for s in sets[:5])
    d.caption("Datasets: labelled test cases for the evaluator.",
              (f"The API lists {len(sets)}: {names}. " if sets else "The API lists no dataset. ")
              + "A failing span can be curated into one from an incident.", new_step=True)


def step_settings(d: Demo) -> None:
    d.open_more("Settings & Evaluators")
    d.pause(1)
    text = d.main_text()
    median = re.search(r"(\d+)\s*ms median", text)
    over = re.search(r"over the last ([\d,]+) evaluated spans", text)
    d.caption("Settings: the two models and the pipeline.",
              "DeBERTa-v3 for grounding and MiniLM for drift, both on CPU. "
              + (f"Live median time per span: {median.group(1)} ms" if median else "")
              + (f" over the last {over.group(1)} spans." if over else ("." if median else "")),
              new_step=True)
    d.scroll(600)
    d.pause(2)


def step_back_to_overview(d: Demo) -> None:
    d.dock("Overview")
    d.page.get_by_text("Spans Ingested").first.wait_for(timeout=30000)
    d.pause(2.5)
    end, start = overview_facts(d), getattr(d, "start_facts", {})
    body = ""
    if "spans" in end and "spans" in start:
        body = f"Spans ingested went from {start['spans']} to {end['spans']} during this demo. "
    if "incidents" in end and "incidents" in start:
        body += f"Active incidents: {start['incidents']} then, {end['incidents']} now. "
    d.caption("Back on the Overview, with this run counted.",
              body + "Everything you saw is live, on one small Azure VM.", new_step=True)
    d.caption("Thank you.", "AgentPulse: every agent step, checked for grounding and drift, without an LLM judge.")
    d.pause(2)


# --------------------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------------------

def compress_video(raw: Path, final: Path) -> bool:
    """In short: re-encode Playwright's large raw video to VP9 with its own ffmpeg (~4x smaller).

    Returns False (and the caller keeps the raw file) when no ffmpeg is found or encoding fails."""
    candidates = sorted(Path.home().glob("AppData/Local/ms-playwright/ffmpeg-*/ffmpeg-win64.exe"), reverse=True)
    ffmpeg = str(candidates[0]) if candidates else shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    print("Compressing the video (about 2 min)...")
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
    p.add_argument("--no-lab", action="store_true", help="skip the five Telemetry Lab runs (saves the per-IP Lab limit)")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help="site to demo (default: the live Azure site)")
    p.add_argument("--size", default="1920x1080", help="window size, e.g. 1920x1080 or 1366x768")
    p.add_argument("--browser", choices=["chrome", "msedge", "chromium"], default="chrome",
                   help="installed Chrome (default), Edge, or Playwright's own Chromium")
    p.add_argument("--headless", action="store_true", help="no visible window (for a quick check only)")
    p.add_argument("--no-video", action="store_true", help="do not record a video")
    p.add_argument("--shots", action="store_true", help="also save a screenshot at every caption (output/shots/)")
    p.add_argument("--keep-raw", action="store_true",
                   help="keep Playwright's raw video (about 4x bigger) instead of a smaller VP9 copy")
    p.add_argument("--seed", type=int, default=None, help="repeat a run's random questions and topics")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    # In short: the Windows console is not UTF-8 by default; this keeps the curly quotes readable.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args(sys.argv[1:] if argv is None else argv)
    width, height = (int(x) for x in args.size.lower().split("x"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    video_tmp = OUTPUT_DIR / "_recording"
    seed = args.seed if args.seed is not None else random.SystemRandom().randrange(1_000_000)
    rng = random.Random(seed)

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
        t0 = time.monotonic()  # events.json times count from here, when the recording starts
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

        # The questions need the corpus, which the page's request context can fetch before we start.
        demo = Demo(page, SPEEDS[args.speed], args.base_url, 0, t0)
        questions = make_questions(demo, rng)
        demo.asked.extend(questions)
        steps = [step_landing, step_overview, step_rag_intro]
        steps += [make_question_step(q, i + 1) for i, q in enumerate(questions)]
        if not args.no_lab:
            # Three different random topics, one per scenario that uses the topic box.
            topics = iter(rng.sample(LAB_TOPICS, sum(1 for _, uses in LAB_SCENARIOS if uses)))
            steps += [make_lab_step(label, next(topics) if uses else None, first=(i == 0))
                      for i, (label, uses) in enumerate(LAB_SCENARIOS)]
        steps += [step_agents, step_traces, step_apm, step_incidents, step_drift,
                  step_replay, step_experiments, step_datasets, step_settings, step_back_to_overview]
        # In short: the number of numbered captions ("Step n of N"). step_traces has two, the rest one.
        demo.total = len(steps) + 1
        print(f"Seed {seed}. Questions: " + " | ".join(q["question"] for q in questions))
        if args.shots:
            demo.shots = OUTPUT_DIR / "shots" / f"{width}x{height}"
            demo.shots.mkdir(parents=True, exist_ok=True)
            for old in demo.shots.glob("*.png"):  # clear the last run's pictures
                old.unlink(missing_ok=True)
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
                             "The demo carries on with the next screen.", warn=True)
        elapsed = time.time() - started
        # Ask for the file name while Playwright is still running; the file is complete after close().
        raw_video = Path(page.video.path()) if page.video else None
        context.close()
        browser.close()

    # In short: what this run asked and did, and the event log for a video editor.
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    (OUTPUT_DIR / "questions.json").write_text(json.dumps(
        {"run_at": stamp, "seed": seed, "base_url": args.base_url, "asked": demo.asked, "notes": demo.notes},
        indent=2, ensure_ascii=False), encoding="utf-8")
    (OUTPUT_DIR / "events.json").write_text(json.dumps(
        {"run_at": stamp, "viewport": {"width": width, "height": height}, "video": VIDEO_NAME,
         "events": demo.events}, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"\nRun took {elapsed:.0f} s ({elapsed / 60:.1f} min).")
    print(f"Questions and Lab topics: {OUTPUT_DIR / 'questions.json'}; event log: {OUTPUT_DIR / 'events.json'}")
    if not args.no_video and raw_video is not None and raw_video.exists():
        final = OUTPUT_DIR / VIDEO_NAME
        final.unlink(missing_ok=True)
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
