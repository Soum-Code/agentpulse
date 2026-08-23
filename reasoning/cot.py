"""Chain-of-Thought (CoT) Reasoning Strategy.

Instructs the model to generate explicit step-by-step reasoning
before summarizing into the final verified answer.
"""

from __future__ import annotations

import re
import time
from typing import Any, List, Optional

from llm_adapters.base import LLMAdapter
from reasoning.base import ReasoningOutput, ReasoningStrategy


class CoTStrategy(ReasoningStrategy):
    """Chain-of-Thought strategy generating sequential rationale before final response."""

    def __init__(self, version: str = "v1.0"):
        super().__init__(name="COT", version=version)

    def execute(
        self,
        adapter: LLMAdapter,
        task_prompt: str,
        context: Optional[str] = None,
        **kwargs: Any,
    ) -> ReasoningOutput:
        t_start = time.perf_counter()

        system_instruction = (
            "Analyze the problem carefully. First, think step by step and list your reasoning points.\n"
            "Then, provide the final answer clearly marked as 'FINAL ANSWER:'."
        )

        formatted_prompt = f"{system_instruction}\n\n"
        if context:
            formatted_prompt += f"Context:\n{context}\n\n"
        formatted_prompt += f"Task:\n{task_prompt}\n\nStep-by-step reasoning:"

        gen_res = adapter.generate_with_metadata(
            prompt=formatted_prompt,
            prompt_version=f"cot_{self.version}",
            **kwargs,
        )

        raw_text = gen_res.text
        steps, final_answer = self._parse_cot_output(raw_text)

        t_end = time.perf_counter()
        total_latency = (t_end - t_start) * 1000.0

        return ReasoningOutput(
            final_answer=final_answer,
            strategy="COT",
            extracted_claims=[final_answer] + [s["step"] for s in steps],
            atomic_steps=steps,
            tokens_in=gen_res.tokens_in or 0,
            tokens_out=gen_res.tokens_out or 0,
            latency_ms=total_latency,
            strategy_version=self.version,
            raw_metadata={"model_id": gen_res.model_id},
        )

    def _parse_cot_output(self, text: str) -> tuple[List[dict], str]:
        """Extract reasoning steps and clean final answer."""
        if "FINAL ANSWER:" in text:
            parts = text.split("FINAL ANSWER:")
            reasoning = parts[0].strip()
            answer = parts[1].strip()
        else:
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            if len(lines) > 1:
                reasoning = "\n".join(lines[:-1])
                answer = lines[-1]
            else:
                reasoning = ""
                answer = text.strip()

        step_lines = [l for l in reasoning.split("\n") if l.strip()]
        steps = [{"step_index": i + 1, "step": line} for i, line in enumerate(step_lines)]

        return steps, answer
