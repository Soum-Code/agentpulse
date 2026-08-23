"""Direct (Zero-Shot) Reasoning Strategy.

Executes the prompt directly without intermediate reasoning steps.
"""

from __future__ import annotations

import time
from typing import Any, Optional

from llm_adapters.base import LLMAdapter
from reasoning.base import ReasoningOutput, ReasoningStrategy


class DirectStrategy(ReasoningStrategy):
    """Direct execution strategy producing an immediate final response."""

    def __init__(self, version: str = "v1.0"):
        super().__init__(name="DIRECT", version=version)

    def execute(
        self,
        adapter: LLMAdapter,
        task_prompt: str,
        context: Optional[str] = None,
        **kwargs: Any,
    ) -> ReasoningOutput:
        t_start = time.perf_counter()

        formatted_prompt = task_prompt
        if context:
            formatted_prompt = f"Context:\n{context}\n\nTask:\n{task_prompt}\n\nDirect Answer:"

        gen_res = adapter.generate_with_metadata(
            prompt=formatted_prompt,
            prompt_version=f"direct_{self.version}",
            **kwargs,
        )

        t_end = time.perf_counter()
        total_latency = (t_end - t_start) * 1000.0

        return ReasoningOutput(
            final_answer=gen_res.text,
            strategy="DIRECT",
            extracted_claims=[gen_res.text],
            atomic_steps=[],
            tokens_in=gen_res.tokens_in or 0,
            tokens_out=gen_res.tokens_out or 0,
            latency_ms=total_latency,
            strategy_version=self.version,
            raw_metadata={"model_id": gen_res.model_id},
        )
