"""GGUF/llama.cpp LLM Adapter for AgentPulse.

Runs a locally-downloaded, quantized GGUF model via llama-cpp-python. This
exists because bare HuggingFace `transformers` CPU inference (LocalHFAdapter)
is impractically slow for repeated-run benchmarks on CPU-only hardware --
llama.cpp's quantized CPU kernels are the standard way to get usable
inference speed without a GPU.

Unlike LocalHFAdapter, load/inference failures here raise instead of
silently falling back to a canned response: this adapter exists specifically
to produce real measured numbers, so it must never substitute fake ones.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

from llm_adapters.base import GenerationResult, LLMAdapter

logger = logging.getLogger("agentpulse.adapters.gguf")


def _strip_think_block(text: str) -> str:
    """Remove a Qwen3 <think>...</think> preamble, keeping only the answer."""
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    return text.strip()


def _physical_core_count() -> int:
    """Best-effort physical (non-SMT) core count, falling back to logical."""
    try:
        import psutil
        cores = psutil.cpu_count(logical=False)
        if cores:
            return cores
    except Exception:
        pass
    logical = os.cpu_count() or 4
    return max(1, logical // 2)


class LocalGGUFAdapter(LLMAdapter):
    """Adapter for running a local GGUF model via llama-cpp-python (CPU)."""

    def __init__(
        self,
        model_path: str,
        model_id: Optional[str] = None,
        device: str = "cpu",
        quantization: Optional[str] = "Q4_K_M",
        default_temperature: float = 0.7,
        default_top_p: float = 0.9,
        default_max_tokens: int = 512,
        seed: Optional[int] = 42,
        n_ctx: int = 4096,
        n_threads: Optional[int] = None,
        enable_thinking: bool = False,
        load_immediately: bool = False,
    ):
        super().__init__(
            model_id=model_id or model_path,
            device=device,
            quantization=quantization,
            default_temperature=default_temperature,
            default_top_p=default_top_p,
            default_max_tokens=default_max_tokens,
            seed=seed,
        )
        self.model_path = model_path
        self.n_ctx = n_ctx
        # Physical cores, not logical. llama.cpp's CPU kernels are compute-bound,
        # so running one thread per SMT sibling costs more in contention than it
        # gains (same oversubscription effect measured in the backend evaluator).
        self.n_threads = n_threads or _physical_core_count()
        self.enable_thinking = enable_thinking
        self._llm = None
        self._is_loaded = False

        if load_immediately:
            self._load_model()

    def _load_model(self) -> None:
        if self._is_loaded:
            return

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"GGUF model file not found: {self.model_path}. "
                "Download it before using LocalGGUFAdapter with load_immediately=True."
            )

        from llama_cpp import Llama

        logger.info(
            "Loading GGUF model %s (n_ctx=%d, n_threads=%d)...",
            self.model_path, self.n_ctx, self.n_threads,
        )
        t_start = time.perf_counter()
        self._llm = Llama(
            model_path=self.model_path,
            n_ctx=self.n_ctx,
            n_threads=self.n_threads,
            verbose=False,
        )
        self._load_time_ms = (time.perf_counter() - t_start) * 1000.0
        self._is_loaded = True
        logger.info("GGUF model loaded in %.1fms.", self._load_time_ms)

    def generate(self, prompt: str, **kwargs: Any) -> str:
        return self.generate_with_metadata(prompt, **kwargs).text

    def generate_with_metadata(
        self,
        prompt: str,
        prompt_version: str = "v1.0",
        dataset_version: Optional[str] = None,
        **kwargs: Any,
    ) -> GenerationResult:
        if not self._is_loaded:
            self._load_model()

        temperature = kwargs.get("temperature", self.default_temperature)
        top_p = kwargs.get("top_p", self.default_top_p)
        max_tokens = kwargs.get("max_tokens", self.default_max_tokens)
        seed = kwargs.get("seed", self.seed)

        # Qwen3 ships with "thinking mode" on by default, which emits a long
        # <think>...</think> preamble before the answer. For benchmarking that
        # would spend the entire token budget on reasoning the strategy layer
        # never sees, so it's disabled unless explicitly requested. `/no_think`
        # is Qwen3's documented soft switch for this.
        user_content = prompt if self.enable_thinking else f"{prompt} /no_think"

        # create_chat_completion (not the raw completion API) applies the
        # GGUF's embedded chat template, so an instruct model is prompted the
        # way it was actually trained to be prompted.
        t_start = time.perf_counter()
        response = self._llm.create_chat_completion(
            messages=[{"role": "user", "content": user_content}],
            max_tokens=max_tokens,
            temperature=max(0.01, temperature),
            top_p=top_p,
            seed=seed,
        )
        t_end = time.perf_counter()
        latency_ms = (t_end - t_start) * 1000.0

        output_text = _strip_think_block(response["choices"][0]["message"]["content"])
        usage = response.get("usage", {})
        tokens_in = usage.get("prompt_tokens", 0)
        tokens_out = usage.get("completion_tokens", 0)
        tokens_per_sec = (tokens_out / (latency_ms / 1000.0)) if latency_ms > 0 and tokens_out else 0.0

        return GenerationResult(
            text=output_text,
            model_id=self.model_id,
            model_revision="main",
            provider="local_gguf",
            runtime="llama.cpp",
            device=self.device,
            quantization=self.quantization,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            seed=seed,
            prompt_version=prompt_version,
            dataset_version=dataset_version,
            latency_ms=latency_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            raw_metadata={
                "tokenize_and_generate_ms": round(latency_ms, 2),
                "tokens_per_sec": round(tokens_per_sec, 2),
                "n_ctx": self.n_ctx,
                "n_threads": self.n_threads,
                "load_time_ms": round(getattr(self, "_load_time_ms", 0.0), 2),
            },
        )
