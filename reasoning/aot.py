"""Atom of Thoughts (AoT) Reasoning Strategy.

Decomposes complex problems into atomic sub-questions ("atoms"),
evaluates each atom independently against available context, and
synthesizes verified atomic deductions into the final answer.
"""

from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional

from llm_adapters.base import LLMAdapter
from reasoning.base import ReasoningOutput, ReasoningStrategy


class AoTStrategy(ReasoningStrategy):
    """Atom of Thoughts (AoT) strategy with atomic decomposition and bounded aggregation."""

    def __init__(self, version: str = "v1.0", max_atoms: int = 4):
        super().__init__(name="AOT", version=version)
        self.max_atoms = max_atoms

    def execute(
        self,
        adapter: LLMAdapter,
        task_prompt: str,
        context: Optional[str] = None,
        **kwargs: Any,
    ) -> ReasoningOutput:
        t_start = time.perf_counter()
        total_tokens_in = 0
        total_tokens_out = 0

        # A caller-supplied max_tokens applies uniformly to every phase, so a
        # benchmark can hold the per-call token budget identical across
        # strategies. Without this, AoT's hardcoded per-phase budgets would
        # silently differ from what Direct/CoT were given.
        phase_max_tokens = kwargs.pop("max_tokens", None)
        decomp_max = phase_max_tokens if phase_max_tokens is not None else 256
        atom_max = phase_max_tokens if phase_max_tokens is not None else 128

        # Phase 1: Atom Decomposition
        decomp_prompt = (
            "Decompose the following task into up to 3 atomic sub-questions that can be verified independently.\n"
            f"Context:\n{context or 'None'}\n\nTask: {task_prompt}\n\n"
            "Format: Output each atom on a new line prefixed with 'ATOM [i]: '."
        )
        decomp_res = adapter.generate_with_metadata(
            prompt=decomp_prompt,
            prompt_version=f"aot_decomp_{self.version}",
            max_tokens=decomp_max,
            **kwargs,
        )
        total_tokens_in += decomp_res.tokens_in or 0
        total_tokens_out += decomp_res.tokens_out or 0

        atoms = self._extract_atoms(decomp_res.text)
        if not atoms:
            atoms = [task_prompt]

        # Phase 2: Atomic Verification / Resolution
        atomic_steps: List[Dict[str, Any]] = []
        atom_answers: List[str] = []

        for idx, atom_q in enumerate(atoms[:self.max_atoms]):
            atom_prompt = (
                f"Context: {context or 'None'}\n"
                f"Atomic Question: {atom_q}\n"
                "Provide a concise, grounded factual answer to this atomic question:"
            )
            atom_res = adapter.generate_with_metadata(
                prompt=atom_prompt,
                prompt_version=f"aot_solve_{self.version}",
                max_tokens=atom_max,
                **kwargs,
            )
            total_tokens_in += atom_res.tokens_in or 0
            total_tokens_out += atom_res.tokens_out or 0

            atom_ans = atom_res.text.strip()
            atom_answers.append(atom_ans)
            atomic_steps.append({
                "atom_index": idx + 1,
                "atom_question": atom_q,
                "atom_answer": atom_ans,
                "latency_ms": atom_res.latency_ms,
            })

        # Phase 3: Atomic Synthesis
        synth_prompt = (
            f"Context: {context or 'None'}\n"
            f"Main Task: {task_prompt}\n"
            "Verified Atomic Evidence:\n"
            + "\n".join([f"- {s['atom_question']}: {s['atom_answer']}" for s in atomic_steps])
            + "\n\nSynthesize the final verified response:"
        )
        synth_res = adapter.generate_with_metadata(
            prompt=synth_prompt,
            prompt_version=f"aot_synth_{self.version}",
            **({"max_tokens": phase_max_tokens} if phase_max_tokens is not None else {}),
            **kwargs,
        )
        total_tokens_in += synth_res.tokens_in or 0
        total_tokens_out += synth_res.tokens_out or 0

        final_answer = synth_res.text.strip()

        t_end = time.perf_counter()
        total_latency = (t_end - t_start) * 1000.0

        return ReasoningOutput(
            final_answer=final_answer,
            strategy="AOT",
            extracted_claims=[final_answer] + atom_answers,
            atomic_steps=atomic_steps,
            tokens_in=total_tokens_in,
            tokens_out=total_tokens_out,
            latency_ms=total_latency,
            strategy_version=self.version,
            raw_metadata={"model_id": adapter.model_id, "atom_count": len(atomic_steps)},
        )

    def _extract_atoms(self, text: str) -> List[str]:
        """Extract atomic sub-questions from decomposition output."""
        atoms = []
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            match = re.match(r"(?:ATOM\s*\[?\d+\]?:?|\d+\.)\s*(.+)", line, re.IGNORECASE)
            if match:
                atoms.append(match.group(1).strip())
            elif line.startswith("- "):
                atoms.append(line[2:].strip())
        return atoms
