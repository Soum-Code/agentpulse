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

# What this file is for: it checks what Arize Phoenix (a competing product, open source)
# really offers for evaluating AI agents. It does not read its web pages. It looks at the
# installed package. Step by step it (1) lists every built-in "evaluator" (a checker that
# rates an LLM's output) and whether it needs an LLM, (2) searches all module and attribute
# names for words about tool use, disagreement between agents and drift, and (3) writes a
# verdict for three claims made in COMPETITIVE_POSITIONING.md. "HOLDS" means no matching name
# was found, so the claim "Arize has no such feature" is not contradicted. "REFUTED" means a
# matching name was found (a name match only; see CAPABILITY_PATTERNS below).
#
# How it fits in: run by hand, in a separate throwaway Python environment that has
# arize-phoenix-evals installed (see the DEPENDENCY SAFETY note above). It does not import
# any AgentPulse code. Its companion is mlflow_capability_audit.py (the same idea for MLflow).
# The result is written up in PHOENIX_CAPABILITY_AUDIT.md.

from __future__ import annotations

# importlib imports a module by its name. metadata reads the installed version of a package.
# inspect reads docstrings and function signatures. pkgutil lists all modules of a package.
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
# One search pattern per claim. re.I = ignore upper/lower case. In words:
#   tool_verification: any name that contains "tool".
#   inter_agent_disagreement: "disagree", "contradict", "consisten" (this also matches
#     "consistent" and "consistency"), or "multi" + any one optional character + "agent".
#   drift: "drift", "centroid" (the average point of a group of embeddings) or "baseline".
# A match is only a name match. It does not prove that the feature works.
CAPABILITY_PATTERNS = {
    "tool_verification": re.compile(r"tool", re.I),
    "inter_agent_disagreement": re.compile(r"disagree|contradict|consisten|multi.?agent", re.I),
    "drift": re.compile(r"drift|centroid|baseline", re.I),
}

# Where the JSON result is saved.
OUT_PATH = Path(__file__).parent / "results" / "phoenix_capability_audit.json"


def guard_environment() -> None:
    """Refuse to run inside the project venv."""
    # sys.executable is the path of the Python program that runs this script. The test is text
    # matching: the path must contain both "project one agent" and ".venv". So it only catches
    # a venv inside a folder with that name. A venv at another path, such as this repo's own
    # Agentpluse/.venv, is not caught, although the docstring says the script refuses to run.
    exe = Path(sys.executable).resolve()
    if "project one agent" in str(exe) and ".venv" in str(exe):
        raise SystemExit(
            "Refusing to run: this is the project venv. Installing Phoenix here risks the "
            "dependency conflicts documented in SESSION_HANDOFF.md section 3. Use an "
            "isolated environment -- see this module's docstring.")


# Collects the names in the phoenix package that match a capability pattern. Out: {capability:
# sorted list of hits}. A hit is "module:<module name>" (the module's own dotted name matched)
# or "<module name>.<attribute>" (a public name inside a module matched).
def scan_namespace() -> dict[str, list[str]]:
    """Walk the whole phoenix package looking for each claimed capability."""
    import phoenix

    # One list of hits per capability. The same hit can be added twice; the duplicates are
    # removed at the end (set).
    hits: dict[str, list[str]] = {k: [] for k in CAPABILITY_PATTERNS}
    # walk_packages yields every module and sub-package under phoenix, with its full dotted
    # name (the "phoenix." prefix). No onerror function is given, so an ImportError while it
    # enters a sub-package is ignored, but any other kind of error would stop the scan.
    for mod in pkgutil.walk_packages(phoenix.__path__, "phoenix."):
        # Check 1: test the patterns against the full dotted module name.
        for cap, pattern in CAPABILITY_PATTERNS.items():
            if pattern.search(mod.name):
                hits[cap].append(f"module:{mod.name}")
        # Check 2: import the module and test the name of everything public in it (names that
        # start with "_" are skipped). A module that cannot be imported is skipped.
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


# The whole audit, start to finish: guard, list the evaluators, scan the names, decide the
# verdicts, save the JSON and print a short summary.
def main() -> None:
    # Step 1: refuse to run inside the project's own venv (see guard_environment).
    guard_environment()

    print("=" * 76)
    print("ARIZE PHOENIX CAPABILITY AUDIT — enumerating the installed package")
    print("=" * 76)

    # Step 2: read the installed version from the package's metadata. This raises an error if
    # arize-phoenix-evals is not installed in the Python that runs the script.
    version = metadata.version("arize-phoenix-evals")
    print(f"\narize-phoenix-evals {version}")

    from phoenix.evals import metrics

    # Step 3: list the evaluators. These are the public names in phoenix.evals.metrics that end
    # with "Evaluator", sorted. For each one it keeps:
    #   summary      = the first two lines of its docstring, cut to 200 characters;
    #   requires_llm = True if its constructor has a parameter called "llm", False if not, and
    #                  None if its signature cannot be read.
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

    # Step 4: the "non-LLM helpers". The five names are typed in by hand as the ones believed
    # to need no LLM. The list keeps those that exist in the module. The code does not check
    # that they really need no LLM.
    non_llm = [n for n in dir(metrics)
               if n in ("MatchesRegex", "PrecisionRecallFScore", "exact_match",
                        "matches_regex", "precision_recall")]

    # Step 5: print a table of the evaluators and then the helpers.
    print(f"\n{'evaluator':34s} {'needs LLM':>10s}")
    for ev in evaluators:
        print(f"  {ev['name']:32s} {str(ev['requires_llm']):>10s}")
    print(f"\nnon-LLM helpers: {non_llm}")

    # Step 6: search the names in the whole package (see scan_namespace).
    print("\nScanning package namespace for claimed-absent capabilities...")
    hits = scan_namespace()

    # Step 7: a verdict for each of the three claims. The claim texts are typed in by hand.
    #   Tool claim: REFUTED if any evaluator name contains "Tool" (capital T), else HOLDS.
    #     (The scan hits for "tool_verification" are saved in the JSON but not used here.)
    #   The other two claims: REFUTED if the scan found at least one matching name, else HOLDS.
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

    # Step 8: gather everything that is saved. all_require_llm is True only if every evaluator
    # has requires_llm True (an evaluator with None counts as not True). The scope_limits
    # texts are typed in by hand: they say what this audit did not cover.
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

    # Step 9: save the JSON (the folder is made if missing; an older file is overwritten).
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # Step 10: print the verdicts. At most the first 4 pieces of evidence are shown per claim.
    print("\n" + "-" * 76)
    print("VERDICTS on COMPETITIVE_POSITIONING.md section 3 claims")
    print("-" * 76)
    for cap, v in verdicts.items():
        print(f"  {cap:26s} {v['verdict']}")
        if v["evidence"]:
            print(f"      evidence: {v['evidence'][:4]}")
    print(f"\n  all {len(evaluators)} evaluators require an LLM: {payload['all_require_llm']}")
    print(f"\nResults saved to: {OUT_PATH}")


# Runs only when the file is started directly, not when another file imports it.
if __name__ == "__main__":
    main()
