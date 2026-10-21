"""Batches that arrive at the same moment must not destroy each other.

Two batches for the same new trace both saw "no trace yet" and both inserted it. The second
commit failed with a UNIQUE error, the whole batch was lost, and the caller got HTTP 500.
"""

import asyncio
import os
import sys
import uuid

import httpx
import pytest
from sqlalchemy import func
from sqlmodel import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.config import settings
from app.database import get_session, init_db
from app.main import create_app
from app.models import Span


@pytest.mark.asyncio
async def test_parallel_batches_for_a_new_trace_are_all_stored():
    await init_db()
    trace_id = f"race-{uuid.uuid4().hex}"

    def batch(n: int) -> dict:
        return {
            "service_name": "ingest-concurrency-test",
            "spans": [
                {"trace_id": trace_id, "span_id": f"{trace_id}-{n}-{i}", "agent_id": "racer"}
                for i in range(10)
            ],
        }

    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={"X-API-Key": settings.api_key}
    ) as client:
        replies = await asyncio.gather(*(client.post("/v1/ingest", json=batch(n)) for n in range(8)))

    assert [r.status_code for r in replies] == [202] * 8
    assert [r.json()["failed"] for r in replies] == [0] * 8

    async with get_session() as session:
        stored = (
            await session.execute(
                select(func.count()).select_from(Span).where(Span.trace_id == trace_id)
            )
        ).scalar_one()
    assert stored == 80
