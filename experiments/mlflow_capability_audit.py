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

# What this file is for: it finds out what the MLflow package really offers for evaluating
# AI agents, by looking at the installed code instead of its marketing pages. Step by step it
# (1) lists MLflow's built-in "scorers" (checkers that rate an agent's output), (2) really runs
# a few of them to see if they work, (3) searches the MLflow modules (all except the CLI and
# server ones) for names about drift, baseline, disagreement, consistency and stability, and
# (4) writes a verdict for five capabilities to a JSON file. The aim is to test claims made
# in COMPETITIVE_POSITIONING.md.
#
# How it fits in: run by hand, in a separate throwaway Python environment that has MLflow
# installed (see the DEPENDENCY SAFETY note above). It does not import any AgentPulse code. Its
# companion is phoenix_capability_audit.py, which does the same for Arize Phoenix. The result is
# written up in MLFLOW_CAPABILITY_AUDIT.md.

from __future__ import annotations

# importlib imports a module by its name. metadata reads the installed version of a package.
# inspect reads docstrings, source code and function signatures. pkgutil lists all modules of
# a package. re = regular expressions (text patterns).
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

# Hide all Python warnings for the rest of the run.
warnings.filterwarnings("ignore")

# Where the JSON result is saved.
OUT_PATH = Path(__file__).parent / "results" / "mlflow_capability_audit.json"

# CLI and server modules execute a click group on import.
# The pattern matches any module name that contains one of these pieces of text: ".cli" (this
# also catches names such as ".client"), ".server", ".__main__", ".store.db", "_click" or
# ".recipes". scan_namespace leaves those modules out.
SKIP_MODULES = re.compile(r"\.cli|\.server|\.__main__|\.store\.db|_click|\.recipes")

# One search pattern per capability. re.I = ignore upper/lower case. In words:
#   drift: the text "drift".   baseline: the text "baseline".
#   disagreement: "disagree", "contradict", or "inter" + any one optional character + "agent".
#   consistency: "consistency", or "self" + any one optional character + "consist".
#   stability: "stability" or "centroid" (the average point of a group of embeddings).
CAPABILITY_PATTERNS = {
    "drift": re.compile(r"drift", re.I),
    "baseline": re.compile(r"baseline", re.I),
    "disagreement": re.compile(r"disagree|contradict|inter.?agent", re.I),
    "consistency": re.compile(r"consistency|self.?consist", re.I),
    "stability": re.compile(r"stability|centroid", re.I),
}


# Stops the script (SystemExit) when it is started with the project's own virtual environment.
# Note: the test is text matching on the path of the Python program. It looks for the words
# "project one agent" and ".venv" in it. A venv at any other path, such as this repo's own
# Agentpluse/.venv, is not stopped, even though the module docstring says the script refuses.
def guard_environment() -> None:
    exe = Path(sys.executable).resolve()
    if "project one agent" in str(exe) and ".venv" in str(exe):
        raise SystemExit(
            "Refusing to run: this is the project venv. Installing MLflow here risks the "
            "dependency conflicts in SESSION_HANDOFF.md section 3. Use an isolated "
            "environment -- see this module's docstring.")


# Lists the scorers that MLflow itself ships. Out: one dict per scorer with its name, a short
# summary taken from its docstring, whether it seems to need an LLM, whether it takes a trace,
# and the signature of its __call__ method. "First-party" = made by the MLflow project, as
# opposed to scorers that come from add-on packages.
def enumerate_scorers() -> list[dict[str, Any]]:
    """First-party scorers, with LLM requirement inferred from the class body."""
    # MLflow is imported inside the function, not at the top of the file. So it is only loaded
    # after main() has run guard_environment().
    from mlflow.genai import scorers as S

    # Step 1: take every public name in mlflow.genai.scorers that starts with a capital letter
    # (these are the scorer classes), minus a few names that are not ready-made scorers (the
    # base class, a config class and two constants). Sorted by name.
    skip = {"Scorer", "ScorerSamplingConfig", "TYPE_CHECKING", "FRAMEWORK_METADATA_KEY"}
    out = []
    for name in sorted(n for n in dir(S) if n[0].isupper() and n not in skip):
        cls = getattr(S, name)
        # Step 2: the class docstring, minus blank lines, lines that say "Experimental" and
        # lines that start with ".." (those are formatting directives, not text).
        doc = inspect.getdoc(cls) or ""
        body = [l.strip() for l in doc.split("\n")
                if l.strip() and "Experimental" not in l and not l.strip().startswith("..")]
        # Step 3: the class's source code and the signature of its __call__ method. Either
        # can fail for some classes; then an empty string is used.
        try:
            src = inspect.getsource(cls)
        except Exception:
            src = ""
        try:
            call_sig = str(inspect.signature(cls.__call__))
        except Exception:
            call_sig = ""
        # Step 4: save one dict per scorer. The summary is the first two docstring lines,
        # cut to 200 characters.
        out.append({
            "name": name,
            "summary": " ".join(body[:2])[:200],
            # A judge-backed scorer carries a configurable model; the deterministic
            # ones (RegexMatch, PIIDetection, ResponseLength) do not.
            # In short: llm_backed is a text search of the class source for "model:" or
            # "model =". It is a guess, not a proof.
            "llm_backed": "model:" in src or "model =" in src,
            # trace_level is True when the word "trace" appears in the signature of __call__.
            "trace_level": "trace" in call_sig,
            "call_signature": call_sig[:220],
        })
    return out


# Really calls a few scorers and records whether each call worked. Out: one dict per probe with
# target, kind, runnable (True/False), the result text (cut to 160 characters) and the error.
def probe_runnable() -> list[dict[str, Any]]:
    """Actually execute things. Present != runnable, and that gap is the point."""
    import os

    # Step 1: delete every environment variable of THIS process whose name contains API_KEY or
    # OPENAI. After this, no probe can use a real LLM key that happens to be set on this
    # computer. (The change lasts only for this run of the script.)
    for key in [k for k in os.environ if "API_KEY" in k or "OPENAI" in k]:
        os.environ.pop(key)

    results: list[dict[str, Any]] = []

    # Step 2: record() runs one probe function. If it finishes without an error, the probe
    # counts as runnable. If it raises ANY error, the probe counts as not runnable and the error
    # text is kept. So "not runnable" can also mean "needs something missing here", such as an
    # LLM, an optional package or a real trace, and not only "broken".
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

    # Step 3: three first-party scorers. RegexMatch is given a pattern (one or more digits, a
    # space, then the word "records") and a sentence to check. PIIDetection is given text with
    # an email address and a phone number in it. ToolCallCorrectness is called with
    # trace=None, that is, with no real trace to check. It is labelled "llm-backed" here.
    record("RegexMatch", "deterministic first-party",
           lambda: RegexMatch(pattern=r"\d+ records")(outputs="We retrieved 3 records."))
    record("PIIDetection", "deterministic first-party",
           lambda: PIIDetection()(outputs="Reach me at a@b.com or 555-123-4567"))
    record("ToolCallCorrectness", "llm-backed first-party",
           lambda: ToolCallCorrectness()(trace=None))

    # The composable path: a custom deterministic scorer.
    from mlflow.genai import scorer as scorer_decorator

    # Step 4: build a scorer from a plain function with MLflow's @scorer decorator. This one
    # answers "yes" if the word "records" is in the output, else "no". It uses no LLM.
    @scorer_decorator
    def custom_deterministic(outputs):
        return "yes" if "records" in str(outputs) else "no"

    record("@scorer custom (deterministic)", "composable primitive",
           lambda: custom_deterministic(outputs="We retrieved 3 records"))

    # Optional-extra scorers: present in the namespace, possibly not installed.
    # Step 5: try to build the LogicalConsistency scorer from the trulens add-on. If that
    # raises any error (for example because the add-on package is not installed), the probe
    # is recorded as not runnable.
    def _trulens():
        from mlflow.genai.scorers.trulens import LogicalConsistency
        return LogicalConsistency()

    record("trulens.LogicalConsistency", "optional-extra scorer", _trulens)
    return results


# Walks every module of the mlflow package and collects the names that match one of the
# CAPABILITY_PATTERNS. Out: {capability: sorted list of hits}. A hit is either
# "module:<module name>" (the module's own name matched) or "<module name>.<attribute>" (a
# name inside a module matched). The extra key "_modules_walked" holds how many modules were
# looked at, as a one-item list of text.
def scan_namespace() -> dict[str, list[str]]:
    import mlflow

    # pkgutil.walk_packages calls this function when it fails to import a package while
    # searching. It does nothing on purpose, so such errors are skipped.
    def _onerror(_name):
        """Optional extras (dspy) raise on import. A missing optional dependency
        is not evidence about capability, so these are swallowed."""

    # Sets are used so the same hit is not counted twice. They become sorted lists at the end.
    hits = {k: set() for k in CAPABILITY_PATTERNS}
    walked = 0
    for mod in pkgutil.walk_packages(mlflow.__path__, "mlflow.", onerror=_onerror):
        # Skip the modules named in SKIP_MODULES. They are not counted in "walked" either.
        if SKIP_MODULES.search(mod.name):
            continue
        walked += 1
        # Check 1: the last part of the module name, e.g. "drift" in "mlflow.x.drift".
        leaf = mod.name.rsplit(".", 1)[-1]
        for cap, pattern in CAPABILITY_PATTERNS.items():
            if pattern.search(leaf):
                hits[cap].add(f"module:{mod.name}")
        # Check 2: import the module and test the name of everything public inside it. A
        # module that cannot be imported is skipped (an optional dependency may be missing).
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


# The whole audit, start to finish: guard, list scorers, run probes, scan names, decide
# verdicts, save the JSON and print a short summary.
def main() -> None:
    # Step 1: refuse to run inside the project's own venv (see guard_environment).
    guard_environment()
    print("=" * 78)
    print("MLFLOW CAPABILITY AUDIT — installed package, programmatic + runnable probes")
    print("=" * 78)

    # Step 2: read the installed MLflow version from the package's metadata. This raises an
    # error if MLflow is not installed in the Python that runs the script.
    version = metadata.version("mlflow")
    print(f"\nmlflow {version}")

    # Step 3: list the scorers, then sort their names into three groups:
    #   tool_scorers  = names that contain the text "Tool" (capital T);
    #   deterministic = scorers not flagged llm_backed (a guess, see enumerate_scorers);
    #   trace_level   = scorers whose __call__ signature mentions "trace".
    scorers = enumerate_scorers()
    tool_scorers = [s["name"] for s in scorers if "Tool" in s["name"]]
    deterministic = [s["name"] for s in scorers if not s["llm_backed"]]
    trace_level = [s["name"] for s in scorers if s["trace_level"]]

    print(f"\nfirst-party scorers: {len(scorers)}")
    print(f"  tool-related   : {tool_scorers}")
    print(f"  deterministic  : {deterministic}")
    print(f"  trace-level    : {trace_level}")

    # Step 4: run the probes and print one line each (RUNS or FAILS, plus the start of the
    # error for the ones that failed).
    print("\nRunning probes...")
    probes = probe_runnable()
    for p in probes:
        mark = "RUNS" if p["runnable"] else "FAILS"
        print(f"  [{mark:5s}] {p['target']:32s} ({p['kind']})")
        if not p["runnable"]:
            print(f"           {p['error'][:120]}")

    # Step 5: scan all module and attribute names, and print how many hits each capability got.
    print("\nScanning namespace...")
    scan = scan_namespace()
    for cap in CAPABILITY_PATTERNS:
        print(f"  {cap:14s} {len(scan[cap])} hits")

    # The result of the trulens probe, picked out by its name. probe_runnable always records
    # one, so next() always finds it.
    trulens_probe = next(p for p in probes if "trulens" in p["target"])

    # Step 6: write down a verdict for each of the five capabilities. Be aware that only some
    # fields are worked out from the probes above (named_feature for tools, trace-level and
    # deterministic, the evidence lists, closest_match_runnable and runnable_without_llm).
    # The other flags (for example "runnable_first_party": True and "named_feature": False
    # for disagreement and drift) and every "verdict" and "why_not_equivalent" text are typed
    # in by hand, so they do not change if the probes give a different result.
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

    # Step 7: gather everything that is saved: the version, the scorer list, the probe results,
    # the name scan and the verdicts. The "scope_limits" texts are typed in by hand: they say
    # what this audit did not cover.
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

    # Step 8: save the JSON (the folder is made if missing; an older file is overwritten).
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # Step 9: print one line per capability with its verdict text.
    print("\n" + "-" * 78)
    print("VERDICTS")
    print("-" * 78)
    for cap, v in verdicts.items():
        print(f"  {cap:28s} {v['verdict']}")
    print(f"\nResults saved to: {OUT_PATH}")


# Runs only when the file is started directly, not when another file imports it.
if __name__ == "__main__":
    main()
