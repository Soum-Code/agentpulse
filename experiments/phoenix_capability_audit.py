"""Audit Arize Phoenix's actual evaluator catalog by enumerating the package.

COMPETITIVE_POSITIONING.md section 9 named its own weakest link: the claim
that none of MLflow/Arize/Datadog ships tool-claim validation, inter-agent
disagreement detection or drift detection "as a named feature" came from
reading marketing docs, not from using the products. Phoenix is open source
and installable, so for Arize that claim was checkable all along.

This script replaces documentation reading with measurement: it imports the
installed package, enumerates every built-in evaluator, reads their own
docstrings, and searches the whole package namespace for drift- and
disagreement-related capability.

DEPENDENCY SAFETY -- READ BEFORE RUNNING

Phoenix must NOT be installed into the project venv. This project has a
documented dependency-conflict history (SESSION_HANDOFF.md section 3, the
Kaggle numpy incident). Create a throwaway environment instead:

    uv venv /tmp/phoenix_probe --python 3.12
    uv pip install --python /tmp/phoenix_probe/Scripts/python.exe arize-phoenix-evals
    /tmp/phoenix_probe/Scripts/python.exe experiments/phoenix_capability_audit.py

The script refuses to run if it detects it is inside the project venv.

Outputs:
- experiments/results/phoenix_capability_audit.json
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
from pathlib import Path
from typing import Any

# Claims under test, from COMPETITIVE_POSITIONING.md section 3.
CAPABILITY_PATTERNS = {
    "tool_verification": re.compile(r"tool", re.I),
    "inter_agent_disagreement": re.compile(r"disagree|contradict|consisten|multi.?agent", re.I),
    "drift": re.compile(r"drift|centroid|baseline", re.I),
}

OUT_PATH = Path(__file__).parent / "results" / "phoenix_capability_audit.json"


def guard_environment() -> None:
    """Refuse to run inside the project venv."""
    exe = Path(sys.executable).resolve()
    if "project one agent" in str(exe) and ".venv" in str(exe):
        raise SystemExit(
            "Refusing to run: this is the project venv. Installing Phoenix here risks the "
            "dependency conflicts documented in SESSION_HANDOFF.md section 3. Use an "
            "isolated environment -- see this module's docstring.")


def scan_namespace() -> dict[str, list[str]]:
    """Walk the whole phoenix package looking for each claimed capability."""
    import phoenix

    hits: dict[str, list[str]] = {k: [] for k in CAPABILITY_PATTERNS}
    for mod in pkgutil.walk_packages(phoenix.__path__, "phoenix."):
        for cap, pattern in CAPABILITY_PATTERNS.items():
            if pattern.search(mod.name):
                hits[cap].append(f"module:{mod.name}")
        try:
            module = importlib.import_module(mod.name)
        except Exception:
            continue  # optional extras that aren't installed
        for attr in dir(module):
            if attr.startswith("_"):
                continue
            for cap, pattern in CAPABILITY_PATTERNS.items():
                if pattern.search(attr):
                    hits[cap].append(f"{mod.name}.{attr}")
    return {k: sorted(set(v)) for k, v in hits.items()}


def main() -> None:
    guard_environment()

    print("=" * 76)
    print("ARIZE PHOENIX CAPABILITY AUDIT — enumerating the installed package")
    print("=" * 76)

    version = metadata.version("arize-phoenix-evals")
    print(f"\narize-phoenix-evals {version}")

    from phoenix.evals import metrics

    evaluators: list[dict[str, Any]] = []
    for name in sorted(n for n in dir(metrics) if n.endswith("Evaluator")):
        cls = getattr(metrics, name)
        doc = inspect.getdoc(cls) or ""
        summary = " ".join(line.strip() for line in doc.split("\n")[:2] if line.strip())
        try:
            requires_llm = "llm" in inspect.signature(cls.__init__).parameters
        except (TypeError, ValueError):
            requires_llm = None
        evaluators.append({"name": name, "summary": summary[:200],
                           "requires_llm": requires_llm})

    non_llm = [n for n in dir(metrics)
               if n in ("MatchesRegex", "PrecisionRecallFScore", "exact_match",
                        "matches_regex", "precision_recall")]

    print(f"\n{'evaluator':34s} {'needs LLM':>10s}")
    for ev in evaluators:
        print(f"  {ev['name']:32s} {str(ev['requires_llm']):>10s}")
    print(f"\nnon-LLM helpers: {non_llm}")

    print("\nScanning package namespace for claimed-absent capabilities...")
    hits = scan_namespace()

    tool_evaluators = [e["name"] for e in evaluators if "Tool" in e["name"]]
    verdicts = {
        "tool_verification": {
            "claim": "Arize ships no dedicated tool-call verification",
            "verdict": "REFUTED" if tool_evaluators else "HOLDS",
            "evidence": tool_evaluators,
        },
        "inter_agent_disagreement": {
            "claim": "Arize ships no dedicated inter-agent disagreement detection",
            "verdict": "HOLDS" if not hits["inter_agent_disagreement"] else "REFUTED",
            "evidence": hits["inter_agent_disagreement"],
        },
        "drift": {
            "claim": "Arize ships no dedicated drift detection",
            "verdict": "HOLDS" if not hits["drift"] else "REFUTED",
            "evidence": hits["drift"],
            "scope_limit": "arize-phoenix-evals only; the server package and the "
                           "commercial Arize AX product were not audited",
        },
    }

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "method": "programmatic enumeration of the installed package, not documentation",
        "package": {"name": "arize-phoenix-evals", "version": version},
        "python": sys.version.split()[0],
        "evaluators": evaluators,
        "evaluator_count": len(evaluators),
        "all_require_llm": all(e["requires_llm"] for e in evaluators),
        "non_llm_helpers": non_llm,
        "namespace_scan": hits,
        "verdicts": verdicts,
        "scope_limits": [
            "arize-phoenix-evals only -- not the full arize-phoenix server package",
            "the commercial Arize AX product (Signal, Alyx, Patterns) was not audited",
            "catalog audit only: establishes that evaluators exist and what they claim, "
            "not how well they perform",
            "MLflow and Datadog were not audited this way; their equivalent claims remain "
            "documentation-based and carry the same risk",
        ],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print("\n" + "-" * 76)
    print("VERDICTS on COMPETITIVE_POSITIONING.md section 3 claims")
    print("-" * 76)
    for cap, v in verdicts.items():
        print(f"  {cap:26s} {v['verdict']}")
        if v["evidence"]:
            print(f"      evidence: {v['evidence'][:4]}")
    print(f"\n  all {len(evaluators)} evaluators require an LLM: {payload['all_require_llm']}")
    print(f"\nResults saved to: {OUT_PATH}")


if __name__ == "__main__":
    main()
