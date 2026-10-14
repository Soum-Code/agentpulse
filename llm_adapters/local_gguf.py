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

# What this file is for: LocalGGUFAdapter runs a quantized model that is stored in one local
# .gguf file, using llama.cpp (through the llama-cpp-python package). It sends the prompt as a
# chat message, times the call, and returns the answer with the settings, the latency and the
# token counts (a GenerationResult). Quantized = the model's numbers are stored with fewer
# bits, so the file is smaller and runs faster on a CPU.
#
# How it fits in: it is a subclass of LLMAdapter (base.py). Qwen3GGUFAdapter (qwen.py) and
# LlamaGGUFAdapter (llama.py) only set defaults on top of it. get_llm_adapter() in
# llm_adapters/__init__.py builds them; some experiments call it with load_immediately=True.

from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

from llm_adapters.base import GenerationResult, LLMAdapter

# The logger writes the progress messages of this file (loading the model) under this name.
logger = logging.getLogger("agentpulse.adapters.gguf")


# Qwen3 can write its reasoning first, inside <think>...</think>, and the real answer after
# it. This keeps only what comes after the first </think>. If the text has no </think>, it
# is returned as it is, only trimmed of blank space at both ends (so a <think> block that
# was cut off before it closed stays in the text).
def _strip_think_block(text: str) -> str:
    """Remove a Qwen3 <think>...</think> preamble, keeping only the answer."""
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    return text.strip()


# How many CPU threads to use by default. Physical cores = the real cores. Logical cores
# count each real core twice when SMT (hyper-threading: two threads per core) is on.
def _physical_core_count() -> int:
    """Best-effort physical (non-SMT) core count, falling back to logical."""
    # Step 1: ask psutil (a library that reports facts about the computer) for the number
    # of physical cores. Any failure, such as psutil not being installed, is ignored.
    try:
        import psutil
        cores = psutil.cpu_count(logical=False)
        if cores:
            return cores
    except Exception:
        pass
    # Step 2: psutil did not help. Take the logical count (4 if even that is unknown) and
    # halve it, as if every core ran two threads, but never go below 1. The docstring says
    # "falling back to logical", but the code really halves the logical count.
    logical = os.cpu_count() or 4
    return max(1, logical // 2)


# The adapter for one local GGUF model, following the LLMAdapter contract (base.py). The
# model file is loaded lazily: on the first generate call, or in the constructor when
# load_immediately=True. Unlike LocalHFAdapter, errors are raised and not hidden, so a
# result from this adapter always comes from a real model run.
class LocalGGUFAdapter(LLMAdapter):
    """Adapter for running a local GGUF model via llama-cpp-python (CPU)."""

    # model_path = the .gguf file. model_id = a name for the results (default: model_path).
    # n_ctx = the context window: the most tokens (prompt plus answer) the model can hold at
    # once. n_threads = CPU threads for llama.cpp (None means one per physical core).
    # n_gpu_layers = how many of the model's layers run on a GPU (explained below).
    # enable_thinking and qwen_think_suffix decide whether "/no_think" is added to the
    # prompt (see generate_with_metadata). load_immediately=True loads the file right away.
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
        n_gpu_layers: int = 0,
        enable_thinking: bool = False,
        qwen_think_suffix: bool = False,
        load_immediately: bool = False,
    ):
        # Pass the shared settings to the base class. With no model_id, the file path is used
        # as the model's name.
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
        # 0 = CPU-only (default, matches the local benchmark run). Pass -1 to
        # offload every layer to GPU, or a positive count for partial offload.
        self.n_gpu_layers = n_gpu_layers
        self.enable_thinking = enable_thinking
        # /no_think is Qwen3-specific soft-switch syntax -- appending it to a
        # non-Qwen model's prompt would just be irrelevant noise the model
        # has to ignore, not a real "disable thinking" instruction. Off by
        # default; Qwen3GGUFAdapter turns it on.
        self.qwen_think_suffix = qwen_think_suffix
        # _llm will hold the llama.cpp model object once the file has been loaded.
        self._llm = None
        self._is_loaded = False

        # Load now if asked. Otherwise the file is loaded on the first generate call.
        if load_immediately:
            self._load_model()

    # Loads the model file into memory, once. Does nothing if it is already loaded.
    # Step 1: stop with a clear error if the .gguf file is not there.
    # Step 2: import llama_cpp here and not at the top of the file, so the llama-cpp-python
    # package is only needed when a model is really loaded.
    # Step 3: build the llama.cpp model object and time how long loading takes.
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
        # verbose=False turns off llama.cpp's own console messages.
        self._llm = Llama(
            model_path=self.model_path,
            n_ctx=self.n_ctx,
            n_threads=self.n_threads,
            n_gpu_layers=self.n_gpu_layers,
            verbose=False,
        )
        # Keep the load time (seconds from perf_counter, times 1000 = milliseconds). It is
        # reported later in raw_metadata["load_time_ms"].
        self._load_time_ms = (time.perf_counter() - t_start) * 1000.0
        self._is_loaded = True
        logger.info("GGUF model loaded in %.1fms.", self._load_time_ms)

    # Same as generate_with_metadata, but returns only the answer text.
    def generate(self, prompt: str, **kwargs: Any) -> str:
        return self.generate_with_metadata(prompt, **kwargs).text

    # In: the prompt text. prompt_version and dataset_version are labels that are copied into
    # the result. kwargs can override temperature, top_p, max_tokens and seed for this call.
    # Out: a GenerationResult. Errors (missing file, llama.cpp failure) are not caught here.
    def generate_with_metadata(
        self,
        prompt: str,
        prompt_version: str = "v1.0",
        dataset_version: Optional[str] = None,
        **kwargs: Any,
    ) -> GenerationResult:
        # Step 1: load the model on first use.
        if not self._is_loaded:
            self._load_model()

        # Step 2: use the value passed for this call if there is one, else the default.
        temperature = kwargs.get("temperature", self.default_temperature)
        top_p = kwargs.get("top_p", self.default_top_p)
        max_tokens = kwargs.get("max_tokens", self.default_max_tokens)
        seed = kwargs.get("seed", self.seed)

        # Step 3: maybe add "/no_think" to the prompt. In short: it is added only when
        # qwen_think_suffix is on and enable_thinking is off.
        # Qwen3 ships with "thinking mode" on by default, which emits a long
        # <think>...</think> preamble before the answer. For benchmarking that
        # would spend the entire token budget on reasoning the strategy layer
        # never sees, so it's disabled unless explicitly requested. `/no_think`
        # is Qwen3's documented soft switch for this -- only applied for
        # adapters that actually opt into qwen_think_suffix.
        add_suffix = self.qwen_think_suffix and not self.enable_thinking
        user_content = f"{prompt} /no_think" if add_suffix else prompt

        # Step 4: ask the model, and time only this call.
        # create_chat_completion (not the raw completion API) applies the
        # GGUF's embedded chat template, so an instruct model is prompted the
        # way it was actually trained to be prompted.
        t_start = time.perf_counter()
        response = self._llm.create_chat_completion(
            messages=[{"role": "user", "content": user_content}],
            max_tokens=max_tokens,
            # A temperature below 0.01 (0 included) is raised to 0.01 for the call. The result
            # below still records the temperature that was asked for, not the raised one.
            temperature=max(0.01, temperature),
            top_p=top_p,
            seed=seed,
        )
        t_end = time.perf_counter()
        # perf_counter() counts in seconds; multiplying by 1000 gives milliseconds.
        latency_ms = (t_end - t_start) * 1000.0

        # Step 5: take the answer text and the token counts out of the reply. response is a
        # dict: the answer is at choices[0].message.content and the counts are under "usage".
        # The think block is cut out of the text only; the token count still includes the
        # tokens the model spent on it. A missing count becomes 0.
        output_text = _strip_think_block(response["choices"][0]["message"]["content"])
        usage = response.get("usage", {})
        tokens_in = usage.get("prompt_tokens", 0)
        tokens_out = usage.get("completion_tokens", 0)
        # Speed = answer tokens divided by seconds. It is 0.0 if there was no time or no tokens.
        tokens_per_sec = (tokens_out / (latency_ms / 1000.0)) if latency_ms > 0 and tokens_out else 0.0

        # Step 6: pack everything into the result record. provider and runtime say where it
        # ran. raw_metadata holds extras only this adapter has: the same call time as
        # latency_ms (rounded), the speed in tokens per second, n_ctx, n_threads, and how long
        # loading the model took (0.0 if that was never recorded).
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
