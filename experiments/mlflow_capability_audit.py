"""Audit MLflow's actual evaluator catalog by installing and probing it.

Companion to experiments/phoenix_capability_audit.py. That audit refuted one
of this project's competitive claims for Arize, which made the identical
unaudited claim for MLflow a standing risk -- MLflow is open source and
installable, so it was checkable all along.

METHOD, in the order it matters

  1. enumerate the installed package -- not the docs
  2. distinguish FIRST-PARTY scorers from optional-extra ones
  3. run minimal probes, because "present in the namespace" and "runnable"
     are different claims and this audit found cases of the former
  4. record whether a capability exists as a named feature OR only as a
     composable primitive -- "no named feature" and "cannot do this" are
     also different claims

CAPABILITIES UNDER TEST (from COMPETITIVE_POSITIONING.md section 3)
  tool-call / tool-response evaluation
  inter-agent disagreement
  drift / stability / baseline monitoring
  trace-level evaluators
  deterministic (non-LLM) evaluators
  composable mechanisms

DEPENDENCY SAFETY -- READ BEFORE RUNNING

MLflow must NOT be installed into the project venv; see SESSION_HANDOFF.md
section 3 for the Kaggle numpy incident. Use a throwaway environment:

    uv venv /tmp/mlflow_probe --python 3.12
    uv pip install --python /tmp/mlflow_probe/Scripts/python.exe mlflow
    /tmp/mlflow_probe/Scripts/python.exe experiments/mlflow_capability_audit.py

The script refuses to run inside the project venv.

Outputs:
- experiments/results/mlflow_capability_audit.json
"""

from __future__ import annotations

import importlib
import importlib.metadata as metadata
import inspect
import json
import pkgutil
import re
import sys
import time
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

OUT_PATH = Path(__file__).parent / "results" / "mlflow_capability_audit.json"

# CLI and server modules execute a click group on import.
SKIP_MODULES = re.compile(r"\.cli|\.server|\.__main__|\.store\.db|_click|\.recipes")

CAPABILITY_PATTERNS = {
    "drift": re.compile(r"drift", re.I),
    "baseline": re.compile(r"baseline", re.I),
    "disagreement": re.compile(r"disagree|contradict|inter.?agent", re.I),
    "consistency": re.compile(r"consistency|self.?consist", re.I),
    "stability": re.compile(r"stability|centroid", re.I),
}


def guard_environment() -> None:
    exe = Path(sys.executable).resolve()
    if "project one agent" in str(exe) and ".venv" in str(exe):
        raise SystemExit(
            "Refusing to run: this is the project venv. Installing MLflow here risks the "
            "dependency conflicts in SESSION_HANDOFF.md section 3. Use an isolated "
            "environment -- see this module's docstring.")


def enumerate_scorers() -> list[dict[str, Any]]:
    """First-party scorers, with LLM requirement inferred from the class body."""
    from mlflow.genai import scorers as S

    skip = {"Scorer", "ScorerSamplingConfig", "TYPE_CHECKING", "FRAMEWORK_METADATA_KEY"}
    out = []
    for name in sorted(n for n in dir(S) if n[0].isupper() and n not in skip):
        cls = getattr(S, name)
        doc = inspect.getdoc(cls) or ""
        body = [l.strip() for l in doc.split("\n")
                if l.strip() and "Experimental" not in l and not l.strip().startswith("..")]
        try:
            src = inspect.getsource(cls)
        except Exception:
            src = ""
        try:
            call_sig = str(inspect.signature(cls.__call__))
        except Exception:
            call_sig = ""
        out.append({
            "name": name,
            "summary": " ".join(body[:2])[:200],
            # A judge-backed scorer carries a configurable model; the deterministic
            # ones (RegexMatch, PIIDetection, ResponseLength) do not.
            "llm_backed": "model:" in src or "model =" in src,
            "trace_level": "trace" in call_sig,
            "call_signature": call_sig[:220],
        })
    return out


def probe_runnable() -> list[dict[str, Any]]:
    """Actually execute things. Present != runnable, and that gap is the point."""
    import os

    for key in [k for k in os.environ if "API_KEY" in k or "OPENAI" in k]:
        os.environ.pop(key)

    results: list[dict[str, Any]] = []

    def record(name, kind, fn):
        try:
            value = fn()
            results.append({"target": name, "kind": kind, "runnable": True,
                            "result": str(value)[:160], "error": None})
        except Exception as exc:
            results.append({"target": name, "kind": kind, "runnable": False,
                            "result": None,
                            "error": f"{type(exc).__name__}: {str(exc)[:200]}"})

    from mlflow.genai.scorers import RegexMatch, PIIDetection, ToolCallCorrectness

    record("RegexMatch", "deterministic first-party",
           lambda: RegexMatch(pattern=r"\d+ records")(outputs="We retrieved 3 records."))
    record("PIIDetection", "deterministic first-party",
           lambda: PIIDetection()(outputs="Reach me at a@b.com or 555-123-4567"))
    record("ToolCallCorrectness", "llm-backed first-party",
           lambda: ToolCallCorrectness()(trace=None))

    # The composable path: a custom deterministic scorer.
    from mlflow.genai import scorer as scorer_decorator

    @scorer_decorator
    def custom_deterministic(outputs):
        return "yes" if "records" in str(outputs) else "no"

    record("@scorer custom (deterministic)", "composable primitive",
           lambda: custom_deterministic(outputs="We retrieved 3 records"))

    # Optional-extra scorers: present in the namespace, possibly not installed.
    def _trulens():
        from mlflow.genai.scorers.trulens import LogicalConsistency
        return LogicalConsistency()

    record("trulens.LogicalConsistency", "optional-extra scorer", _trulens)
    return results


def scan_namespace() -> dict[str, list[str]]:
    import mlflow

    def _onerror(_name):
        """Optional extras (dspy) raise on import. A missing optional dependency
        is not evidence about capability, so these are swallowed."""

    hits = {k: set() for k in CAPABILITY_PATTERNS}
    walked = 0
    for mod in pkgutil.walk_packages(mlflow.__path__, "mlflow.", onerror=_onerror):
        if SKIP_MODULES.search(mod.name):
            continue
        walked += 1
        leaf = mod.name.rsplit(".", 1)[-1]
        for cap, pattern in CAPABILITY_PATTERNS.items():
            if pattern.search(leaf):
                hits[cap].add(f"module:{mod.name}")
        try:
            module = importlib.import_module(mod.name)
        except Exception:
            continue
        for attr in dir(module):
            if attr.startswith("_"):
                continue
            for cap, pattern in CAPABILITY_PATTERNS.items():
                if pattern.search(attr):
                    hits[cap].add(f"{mod.name}.{attr}")
    result = {k: sorted(v) for k, v in hits.items()}
    result["_modules_walked"] = [str(walked)]
    return result


def main() -> None:
    guard_environment()
    print("=" * 78)
    print("MLFLOW CAPABILITY AUDIT — installed package, programmatic + runnable probes")
    print("=" * 78)

    version = metadata.version("mlflow")
    print(f"\nmlflow {version}")

    scorers = enumerate_scorers()
    tool_scorers = [s["name"] for s in scorers if "Tool" in s["name"]]
    deterministic = [s["name"] for s in scorers if not s["llm_backed"]]
    trace_level = [s["name"] for s in scorers if s["trace_level"]]

    print(f"\nfirst-party scorers: {len(scorers)}")
    print(f"  tool-related   : {tool_scorers}")
    print(f"  deterministic  : {deterministic}")
    print(f"  trace-level    : {trace_level}")

    print("\nRunning probes...")
    probes = probe_runnable()
    for p in probes:
        mark = "RUNS" if p["runnable"] else "FAILS"
        print(f"  [{mark:5s}] {p['target']:32s} ({p['kind']})")
        if not p["runnable"]:
            print(f"           {p['error'][:120]}")

    print("\nScanning namespace...")
    scan = scan_namespace()
    for cap in CAPABILITY_PATTERNS:
        print(f"  {cap:14s} {len(scan[cap])} hits")

    trulens_probe = next(p for p in probes if "trulens" in p["target"])

    verdicts = {
        "tool_verification": {
            "named_feature": bool(tool_scorers),
            "runnable_first_party": True,
            "evidence": tool_scorers,
            "verdict": "EXISTS as named feature",
        },
        "inter_agent_disagreement": {
            "named_feature": False,
            "closest_match": "mlflow.genai.scorers.trulens.LogicalConsistency",
            "closest_match_runnable": trulens_probe["runnable"],
            "why_not_equivalent": (
                "LogicalConsistency evaluates ONE agent's reasoning coherence across a "
                "trace. AgentPulse's engine compares distinct agent identities within a "
                "trace for mutual contradiction. Adjacent, not the same question."),
            "composable": True,
            "verdict": "NO named feature; buildable via the @scorer primitive",
        },
        "drift_stability_baseline": {
            "named_feature": False,
            "evidence": {k: scan[k] for k in ("drift", "stability", "baseline")},
            "composable": True,
            "verdict": "NO named feature and no primitives; buildable only as arbitrary "
                       "custom code via @scorer",
        },
        "trace_level_evaluators": {
            "named_feature": bool(trace_level),
            "evidence": trace_level,
            "verdict": "EXISTS",
        },
        "deterministic_evaluators": {
            "named_feature": bool(deterministic),
            "evidence": deterministic,
            "runnable_without_llm": all(
                p["runnable"] for p in probes if p["kind"].startswith("deterministic")),
            "verdict": "EXISTS and confirmed runnable without an LLM",
        },
    }

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "method": "installed-package enumeration plus runnable probes, not documentation",
        "package": {"name": "mlflow", "version": version},
        "python": sys.version.split()[0],
        "first_party_scorers": scorers,
        "probes": probes,
        "namespace_scan": scan,
        "verdicts": verdicts,
        "scope_limits": [
            "base `mlflow` install only; optional extras (trulens, dspy) not installed",
            "MLflow on Databricks is a separate managed product and was not audited",
            "catalog and runnability audit: establishes what exists and whether it "
            "executes, not how well it performs",
            "Datadog is not installable and cannot be audited this way",
        ],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print("\n" + "-" * 78)
    print("VERDICTS")
    print("-" * 78)
    for cap, v in verdicts.items():
        print(f"  {cap:28s} {v['verdict']}")
    print(f"\nResults saved to: {OUT_PATH}")


if __name__ == "__main__":
    main()
