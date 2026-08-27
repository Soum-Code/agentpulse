"""Tests that the active inference backend is correct AND observable.

Two separate properties, and the second is the one that was missing:

1. The ONNX Runtime path actually loads, rather than silently falling back.
2. Whichever backend is active, the system *says so*. Previously
   `models_loaded()` returned `nli_model: True` whether ONNX or the PyTorch
   fallback loaded, so a materially slower configuration than the one requested
   was indistinguishable from a healthy one. For an observability product,
   failing to observe its own degraded execution mode is a defect in its own
   right, independent of the performance cost.

WHY EVERY LOAD HAPPENS IN A SUBPROCESS

`load_models()` cannot be called repeatedly in one process. The second load
leaves torch tensors on the `meta` device and fails with "Cannot copy out of
meta tensor", after which inference raises "Tensor on device cpu is not on the
expected device meta". An earlier version of this file loaded in-process; it
passed alone and failed inside the full suite, because by then other tests had
already loaded models.

Production loads once per process (the API in its lifespan, the worker at
startup), so one process per load is both the accurate test and the honest one.
In-process loading was measuring an artefact of the harness.

These tests are slow — seconds per case, since each spawns a process and loads
real models. That is inherent: the bug being guarded against is invisible to
every fast test precisely because it only appears at model-load time.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)


PROBE = """
import json, sys
sys.path.insert(0, r"{backend}")
if {force_fallback}:
    # Reproduces the real failure mode: an unimportable optimum.onnxruntime.
    # Setting the sys.modules entry to None makes `import` raise ImportError,
    # which is what a version-incompatible optimum actually does.
    sys.modules["optimum.onnxruntime"] = None
from app.config import settings
from app.services import grounding
grounding.load_models(
    nli_model_name=settings.nli_model,
    embedding_model_name=settings.embedding_model,
    cache_dir=settings.model_cache_dir,
    use_onnx={use_onnx}, sync=True,
)
info = grounding.backend_info()
loaded = grounding.models_loaded()
r = grounding.compute_nli_grounding(
    "The migration completed successfully with no errors.",
    "The migration failed and was rolled back.",
)
print("RESULT_JSON" + json.dumps({{
    "backend": info["nli_backend"],
    "requested": info["nli_backend_requested"],
    "degraded": info["degraded"],
    "fallback_reason": info["fallback_reason"],
    "embedding_backend": info["embedding_backend"],
    "models_loaded": loaded,
    "models_loaded_types": {{k: type(v).__name__ for k, v in loaded.items()}},
    "label": r.label if r else None,
    "contradiction_prob": r.contradiction_prob if r else None,
    "entailment_prob": r.entailment_prob if r else None,
    "neutral_prob": r.neutral_prob if r else None,
}}))
"""


def probe_backend(force_fallback: bool = False, use_onnx: bool = True) -> dict:
    """Load models in a clean process and report the resulting backend state."""
    code = PROBE.format(
        backend=BACKEND, force_fallback=force_fallback, use_onnx=use_onnx
    )
    env = dict(os.environ)
    env["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND, env=env, capture_output=True, text=True, timeout=900,
    )
    marker = [l for l in proc.stdout.splitlines() if l.startswith("RESULT_JSON")]
    assert marker, (
        f"probe produced no result "
        f"(force_fallback={force_fallback}, use_onnx={use_onnx})\n"
        f"stdout tail:\n{proc.stdout[-2000:]}\nstderr tail:\n{proc.stderr[-2000:]}"
    )
    return json.loads(marker[0][len("RESULT_JSON"):])


@pytest.fixture(scope="module")
def onnx_state() -> dict:
    """ONNX requested and available. Shared, because each probe costs seconds."""
    return probe_backend(force_fallback=False, use_onnx=True)


@pytest.fixture(scope="module")
def fallback_state() -> dict:
    """ONNX requested but unavailable — the silent-degradation case."""
    return probe_backend(force_fallback=True, use_onnx=True)


class TestBackendIsObservable:
    def test_onnx_backend_loads_and_is_reported(self, onnx_state):
        """The ONNX path works, and the system reports that it is being used.

        Regression guard for the original defect: torch 2.13 removed
        `_attention_scale`, optimum 1.27 still imported it, so ONNX never loaded
        and PyTorch silently took over while health reported normal.
        """
        assert onnx_state["backend"] == "onnx", (
            f"ONNX was requested but the active backend is "
            f"{onnx_state['backend']!r}. Fallback reason: "
            f"{onnx_state['fallback_reason']}"
        )
        assert onnx_state["requested"] == "onnx"
        assert onnx_state["degraded"] is False
        assert onnx_state["fallback_reason"] is None

    def test_fallback_is_visible_when_onnx_unavailable(self, fallback_state):
        """The case this whole change exists for: ONNX asked for, not available.

        Inference must still work — the fallback is correct behaviour — but the
        system must SAY it is degraded rather than reporting itself normal.
        """
        assert fallback_state["backend"] == "pytorch", "fallback did not happen"
        assert fallback_state["requested"] == "onnx"
        assert fallback_state["degraded"] is True, (
            "ONNX was requested and did not load, but the system does not report "
            "itself degraded — this is exactly the silent-degradation bug"
        )
        assert fallback_state["fallback_reason"], "no reason recorded for the fallback"
        assert all(fallback_state["models_loaded"].values()), \
            "degraded must not mean broken — the models should still be loaded"

    def test_pytorch_when_configured_is_not_degraded(self):
        """Choosing PyTorch deliberately is not a degraded state.

        `degraded` must mean "not running what was asked for", not merely "not
        running ONNX" — otherwise a correctly configured PyTorch deployment
        would alarm forever.
        """
        state = probe_backend(force_fallback=False, use_onnx=False)
        assert state["backend"] == "pytorch"
        assert state["requested"] == "pytorch"
        assert state["degraded"] is False
        assert state["fallback_reason"] is None

    def test_models_loaded_is_bool_only(self, onnx_state):
        """Guards a contract other code depends on.

        `app/worker.py` and `scripts/measure_durability.py` both do
        `all(models_loaded().values())` to gate readiness. Putting a backend
        name (a truthy string) into this dict would make those checks silently
        wrong, which is why backend identity lives in `backend_info()` instead.
        """
        types = onnx_state["models_loaded_types"]
        assert types, "models_loaded() returned nothing"
        assert set(types.values()) == {"bool"}, \
            f"models_loaded() must stay bool-only, got {types}"

    def test_inference_is_unchanged_by_backend(self, onnx_state, fallback_state):
        """Both backends must agree, or every calibrated threshold shifts.

        Verified more thoroughly in an isolated environment (worst absolute
        probability difference 1.2e-08 across five pairs); this keeps a guard in
        the suite so a future backend change cannot quietly move scores.
        """
        assert onnx_state["label"] == fallback_state["label"]
        for field in ("contradiction_prob", "entailment_prob", "neutral_prob"):
            a, b = onnx_state[field], fallback_state[field]
            assert a is not None and b is not None
            assert abs(a - b) < 1e-3, (
                f"{field} differs between backends: onnx={a} pytorch={b}. "
                "A backend change must not move scores."
            )


class TestHealthReportsBackend:
    def test_health_endpoint_exposes_backend_state(self):
        """Operators must see the degraded mode without reading startup logs.

        Asserts the response *shape*, not a particular backend: which backend is
        active depends on the environment, and that is covered above. What must
        hold everywhere is that the information is exposed at all.
        """
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as client:
            response = client.get("/v1/health")

        assert response.status_code == 200
        body = response.json()
        assert "inference_backend" in body, \
            "/v1/health does not report which backend is active"
        assert "degraded" in body, "/v1/health does not report degraded state"
        assert isinstance(body["degraded"], bool)

        backend = body["inference_backend"]
        for field in ("nli_backend", "nli_backend_requested", "degraded",
                      "fallback_reason", "embedding_backend"):
            assert field in backend, f"backend info missing {field!r}"
        assert backend["nli_backend"] in ("onnx", "pytorch", None)
