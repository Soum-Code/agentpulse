"""Record a short sample clip of the live site, with an events.json, to test the motion-video build.

In short: this is a stand-in for the real auto-demo recording (demo/auto_demo). It opens the
landing page, scrolls, presses Launch App, then visits two console tabs. It uses no chat
question and no Lab run, so it costs none of the site's per-visitor limits. No key is used.

    python demo/motion_video/tools/sample_record.py --out demo/motion_video/sample

Writes <out>/sample.webm and <out>/events.json (same shape the build script reads).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://agentpulse.centralindia.cloudapp.azure.com"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "sample"))
    ap.add_argument("--browser", default="chrome")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    events: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel=args.browser, headless=True)
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080},
                                  record_video_dir=str(out / "_rec"),
                                  record_video_size={"width": 1920, "height": 1080})
        t0 = time.monotonic()  # the video starts with the context; offsets are within ~0.2 s
        page = ctx.new_page()

        def ev(action: str, label: str, loc=None, **extra) -> None:
            box = None
            if loc is not None:
                b = loc.bounding_box()
                if b:
                    box = {k: round(b[k], 1) for k in ("x", "y", "width", "height")}
            events.append({"t": round(time.monotonic() - t0, 3), "action": action,
                           "label": label, "bbox": box, **extra})

        def click(loc, label: str) -> None:
            loc.scroll_into_view_if_needed()
            page.wait_for_timeout(700)
            ev("click", label, loc)
            loc.click()

        page.goto(BASE, wait_until="domcontentloaded")
        page.get_by_role("heading", level=1).first.wait_for(timeout=30000)
        page.wait_for_timeout(2500)
        ev("caption", "Landing page", None, head="AgentPulse watches AI agents that work together.")
        page.wait_for_timeout(2500)
        ev("scroll", "Landing page", None, dy=700)
        page.mouse.wheel(0, 700)
        page.wait_for_timeout(2500)
        ev("scroll", "Landing page", None, dy=-700)
        page.mouse.wheel(0, -700)
        page.wait_for_timeout(1500)
        click(page.get_by_role("button", name="Launch App").first, "Launch App")
        page.get_by_text("Spans Ingested").first.wait_for(timeout=30000)
        page.wait_for_timeout(3000)
        ev("spot", "Spans Ingested", page.get_by_text("Spans Ingested").first.locator("xpath=.."))
        page.wait_for_timeout(3500)
        click(page.get_by_role("button", name=re.compile(r"^Traces\b")).last, "Traces")
        page.wait_for_timeout(4000)
        click(page.get_by_role("button", name=re.compile(r"^Incidents\b")).last, "Incidents")
        page.wait_for_timeout(4500)
        ev("end", "end")
        video = page.video
        ctx.close()
        browser.close()
        src = Path(video.path())
        shutil.move(str(src), out / "sample.webm")
        shutil.rmtree(out / "_rec", ignore_errors=True)

    (out / "events.json").write_text(json.dumps({"viewport": {"width": 1920, "height": 1080},
                                                 "events": events}, indent=2), encoding="utf-8")
    print(f"wrote {out / 'sample.webm'} and {len(events)} events")


if __name__ == "__main__":
    main()
