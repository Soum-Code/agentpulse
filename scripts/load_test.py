"""Load test for AgentPulse's /v1/ingest endpoint.

Sends N requests (default 10,000) at bounded concurrency and reports
success rate, latency percentiles, and throughput. Use this to verify
the backend survives the ~10,000-request scaling target before/after
the thread-pool-offload fix in ingest.py.

Usage:
    python scripts/load_test.py --n 10000 --concurrency 200 \
        --base-url http://localhost:8000 --api-key change-me-to-a-secure-key
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import time
import uuid

import httpx


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


async def run(n: int, concurrency: int, base_url: str, api_key: str) -> None:
    url = f"{base_url.rstrip('/')}/v1/ingest"
    headers = {"X-API-Key": api_key}
    sem = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    statuses: list[int] = []

    print(f"Sending {n} requests to {url} at concurrency={concurrency} ...")
    start = time.perf_counter()

    limits = httpx.Limits(max_connections=concurrency, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(limits=limits) as client:
        tasks = [
            worker(client, sem, i, url, headers, latencies, statuses)
            for i in range(n)
        ]
        await asyncio.gather(*tasks)

    total_time = time.perf_counter() - start
    ok = sum(1 for s in statuses if s == 202)
    failed = n - ok
    latencies.sort()

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
    if statuses:
        non_202 = {s for s in statuses if s != 202}
        if non_202:
            print(f"Non-202 status codes seen: {sorted(non_202)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=10000, help="Total requests to send")
    parser.add_argument("--concurrency", type=int, default=200, help="Max in-flight requests")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--api-key", default="change-me-to-a-secure-key")
    args = parser.parse_args()

    asyncio.run(run(args.n, args.concurrency, args.base_url, args.api_key))
