"""Unit tests for Reasoning Strategies (Direct, CoT, AoT)."""

import pytest
from llm_adapters import get_llm_adapter
from reasoning import (
    DirectStrategy,
    CoTStrategy,
    AoTStrategy,
    get_reasoning_strategy,
)


def test_strategy_factory():
    s_dir = get_reasoning_strategy("direct")
    assert isinstance(s_dir, DirectStrategy)
    assert s_dir.name == "DIRECT"

    s_cot = get_reasoning_strategy("cot")
    assert isinstance(s_cot, CoTStrategy)
    assert s_cot.name == "COT"

    s_aot = get_reasoning_strategy("aot")
    assert isinstance(s_aot, AoTStrategy)
    assert s_aot.name == "AOT"


def test_direct_strategy_execution():
    adapter = get_llm_adapter("qwen-0.5b")
    strat = DirectStrategy()
    out = strat.execute(adapter, "Explain SQLite WAL mode", context="SQLite in WAL mode allows concurrent readers.")
    assert out.strategy == "DIRECT"
    assert out.final_answer != ""
    assert out.latency_ms >= 0.0


def test_cot_strategy_execution():
    adapter = get_llm_adapter("qwen-0.5b")
    strat = CoTStrategy()
    out = strat.execute(adapter, "Diagnose HTTP 401 error", context="HTTP 401 occurs when API key is missing.")
    assert out.strategy == "COT"
    assert out.final_answer != ""


def test_aot_strategy_execution():
    adapter = get_llm_adapter("qwen-0.5b")
    strat = AoTStrategy(max_atoms=3)
    out = strat.execute(adapter, "Summarize telemetry record count and error rate", context="30 records, mean 42ms, 0 errors.")
    assert out.strategy == "AOT"
    assert out.final_answer != ""
    assert len(out.atomic_steps) >= 1
