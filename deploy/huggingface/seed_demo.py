"""Seed a Hugging Face Space with demo telemetry.

Spaces have an ephemeral filesystem, so every restart begins with an empty
database and a console that correctly shows nothing. This produces a small,
honest dataset by driving the real ingest and simulate endpoints: nothing is
written straight to the database, so every score and alert on screen was
produced by the evaluator exactly as it would be in production.

Runs in the background at boot and exits once the data is in.
"""

import json
import os
import time
import urllib.error
import urllib.request

BASE = os.getenv("AGENTPULSE_SEED_BASE", "http://127.0.0.1:7860")
KEY = os.getenv("AGENTPULSE_API_KEY", "change-me-to-a-secure-key")
DRIFT_AGENT = "research_summariser"


def _post(path: str, payload: dict, timeout: int = 120) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": KEY},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _wait_for_api(attempts: int = 60) -> bool:
    """Wait for the API, sending the key.

    This probe used to go out bare. On any deployment with authentication on it
    came back 401 every time, so the loop ran its full two minutes and the
    script exited having seeded nothing -- while printing a line that reads like
    a successful run. Liveness no longer requires a key, but the header is sent
    anyway so this keeps working against an older backend.
    """
    req = urllib.request.Request(
        BASE + "/v1/health/live", headers={"X-API-Key": KEY}
    )
    last = None
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception as exc:
            last = exc
        time.sleep(2)
    if last is not None:
        print(f"[seed] last probe error: {type(last).__name__}: {last}")
    return False


def _already_seeded() -> bool:
    try:
        req = urllib.request.Request(BASE + "/v1/metrics", headers={"X-API-Key": KEY})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read()).get("total_spans", 0) > 0
    except Exception:
        return False


def _drift_spans(prefix: str, count: int, text: str, latency: float) -> list[dict]:
    return [
        {
            "trace_id": f"{DRIFT_AGENT}_{prefix}_t{i}",
            "span_id": f"{DRIFT_AGENT}_{prefix}_s{i}",
            "agent_id": DRIFT_AGENT,
            "agent_role": "Research Summariser",
            "pipeline_id": "research_pipeline_v1",
            "latency_ms": latency,
            "input_summary": "Summarise the transformer architecture paper",
            "output_summary": text.format(i=i),
            "status": "success",
        }
        for i in range(count)
    ]


def main() -> None:
    if not _wait_for_api():
        print("[seed] API never became reachable; skipping")
        return
    if _already_seeded():
        print("[seed] data already present; skipping")
        return

    # Two runs of each scenario: grounding failures from `hallucination`,
    # a tool-claim mismatch from `tool_mismatch`, clean traces for contrast.
    for scenario in ("clean", "hallucination", "tool_mismatch") * 2:
        try:
            _post("/v1/simulate", {"scenario": scenario, "query": "demo"})
        except urllib.error.URLError as e:
            print(f"[seed] {scenario} failed: {e}")

    # Sustained drift needs 20 baseline samples then 12 more in a shifted
    # window before window_centroid_distance exists at all.
    try:
        _post("/v1/ingest", {
            "spans": _drift_spans(
                "base", 20,
                "The transformer uses multi-head self-attention over token "
                "embeddings to model long-range sequence dependencies. Summary {i}.",
                21.0,
            ),
            "service_name": "research_pipeline",
        })
        # Let the baseline pool fill before shifting, or the two batches
        # interleave and the baseline absorbs the shift.
        time.sleep(90)
        _post("/v1/ingest", {
            "spans": _drift_spans(
                "shift", 14,
                "Sourdough fermentation needs wild yeast, ambient humidity and a "
                "long cold proof in the refrigerator. Batch {i} baked with steam.",
                23.0,
            ),
            "service_name": "research_pipeline",
        })
    except urllib.error.URLError as e:
        print(f"[seed] drift seeding failed: {e}")

    print("[seed] done")


if __name__ == "__main__":
    main()
