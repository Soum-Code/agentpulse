"""Load test for AgentPulse's /v1/ingest endpoint.

Sends N requests (default 10,000) at bounded concurrency and reports
success rate, latency percentiles, and throughput. Use this to verify
the backend survives the ~10,000-request scaling target before/after
the thread-pool-offload fix in ingest.py.

Usage:
    python scripts/load_test.py --n 10000 --concurrency 200 \
        --base-url http://localhost:8000 --api-key change-me-to-a-secure-key
"""

# About this file
# - What it is: a command-line load test. It sends N small POST requests (one span each) to
#   a running AgentPulse API, with at most `--concurrency` requests in flight at once. It
#   then prints how many got 202 (accepted), the latency percentiles and the requests/second.
# - It measures only the API's accept step (save the span and queue a job). Scoring spans
#   is done later by the separate worker process, and this script does not wait for it.
# - How it fits in: it calls POST /v1/ingest (backend/app/routers/ingest.py) using httpx, an
#   HTTP client library that works with asyncio.
# - Note: the docstring above mentions a "thread-pool-offload fix in ingest.py". That code is
#   not in ingest.py today; the endpoint now saves the spans and queues a job.

from __future__ import annotations

import argparse
import asyncio
import statistics
import time
import uuid

import httpx


# Builds the JSON body for request number i: one brand-new trace holding one span with
# harmless text. agent_id cycles through 20 names (i % 20 is the remainder after dividing
# by 20), so the requests are spread over 20 agents.
def build_payload(i: int) -> dict:
    trace_id = f"loadtest_{uuid.uuid4().hex}"
    span_id = uuid.uuid4().hex[:16]
    return {
        "spans": [
            {
                "trace_id": trace_id,
                "span_id": span_id,
                "agent_id": f"load_agent_{i % 20}",
                "input_summary": f"load test input {i}",
                "output_summary": f"load test output {i}, nothing unusual here.",
                "status": "success",
                "latency_ms": 12.5,
            }
        ],
        "service_name": "load_test",
    }


# Sends one request and records its HTTP status and how long it took (in milliseconds).
# "worker" here only means one async task; it is not the AgentPulse evaluation worker.
# The semaphore (a counter that lets only N tasks pass at once) caps the requests in flight.
# The timer starts after a slot is won, so time spent waiting for a slot is not counted.
# Any error (timeout, refused connection) is stored as status -1 and still gets a latency.
async def worker(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    i: int,
    url: str,
    headers: dict,
    latencies: list[float],
    statuses: list[int],
) -> None:
    async with sem:
        start = time.perf_counter()
        try:
            resp = await client.post(url, json=build_payload(i), headers=headers, timeout=30.0)
            statuses.append(resp.status_code)
        except Exception:
            statuses.append(-1)
        latencies.append((time.perf_counter() - start) * 1000)


# Runs the whole test and prints the results.
async def run(n: int, concurrency: int, base_url: str, api_key: str) -> None:
    # Step 1: set up the target URL, the API key header, the slot counter and the two lists
    # that every task adds its results to.
    url = f"{base_url.rstrip('/')}/v1/ingest"
    headers = {"X-API-Key": api_key}
    sem = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    statuses: list[int] = []

    print(f"Sending {n} requests to {url} at concurrency={concurrency} ...")
    start = time.perf_counter()

    # Step 2: one shared HTTP client. It may open up to `concurrency` connections and keeps
    # that many open afterwards, so a finished request's connection can serve a later one.
    # All n tasks are created at once, but the semaphore lets only `concurrency` of them
    # send at the same moment. gather() waits for all of them to finish.
    limits = httpx.Limits(max_connections=concurrency, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(limits=limits) as client:
        tasks = [
            worker(client, sem, i, url, headers, latencies, statuses)
            for i in range(n)
        ]
        await asyncio.gather(*tasks)

    # Step 3: results. Only status 202 counts as success; everything else (including -1)
    # counts as failed. The latencies are sorted so percentiles can be read by position.
    total_time = time.perf_counter() - start
    ok = sum(1 for s in statuses if s == 202)
    failed = n - ok
    latencies.sort()

    # Latency at percentile p (0.95 = p95). In the sorted list take the item at position
    # len * p, capped at the last item. About p * 100 percent of requests were as fast or faster.
    def pct(p: float) -> float:
        idx = min(len(latencies) - 1, int(len(latencies) * p))
        return latencies[idx]

    print("\n=== Load Test Results ===")
    print(f"Total requests:   {n}")
    print(f"Succeeded (202):  {ok} ({ok / n * 100:.1f}%)")
    print(f"Failed:           {failed} ({failed / n * 100:.1f}%)")
    print(f"Total wall time:  {total_time:.2f}s")
    print(f"Throughput:       {n / total_time:.1f} req/s")
    print(f"Latency p50/p95/p99 (ms): {pct(0.50):.1f} / {pct(0.95):.1f} / {pct(0.99):.1f}")
    # List the distinct status codes other than 202 (-1 stands for "no HTTP reply at all").
    if statuses:
        non_202 = {s for s in statuses if s != 202}
        if non_202:
            print(f"Non-202 status codes seen: {sorted(non_202)}")


if __name__ == "__main__":
    # Command-line options. The defaults: 10000 requests, 200 at a time, a backend on
    # localhost port 8000, and the backend's built-in placeholder API key.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=10000, help="Total requests to send")
    parser.add_argument("--concurrency", type=int, default=200, help="Max in-flight requests")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--api-key", default="change-me-to-a-secure-key")
    args = parser.parse_args()

    asyncio.run(run(args.n, args.concurrency, args.base_url, args.api_key))
