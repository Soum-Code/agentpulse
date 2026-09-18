"""Does the disagreement signal track error, or does it track refusal?

Section 24.4 observed that every time the verifier correctly reported that
retrieval had failed, inter-agent disagreement fired at 0.966-1.000 against it,
while every acceptance scored 0.000-0.020. Ten traces, no overlap.

That observation has a confound it cannot resolve, because in all ten traces
"the verifier refused" and "the evidence was irrelevant" were the same event.
So the separation is equally consistent with two very different claims:

    H1 (stance)      disagreement rises when one agent's stance diverges from
                     the others', regardless of who is right
    H2 (error)       disagreement rises when something in the trace is actually
                     wrong, and it happens to be pointing at the verifier

H1 makes the signal a stance detector wearing an error detector's label, which
would be a finding. H2 would make it broadly working as advertised. They are
separated by the two cells the original data has none of:

                        verifier ACCEPTS      verifier REFUSES
    evidence relevant   cell A (common)       cell C (wrong refusal)
    evidence irrelevant cell D (wrong accept) cell B (common)

Under H1, cells C and D follow the verifier's stance: C high, D low.
Under H2, they follow correctness: C high AND D high, since both are errors.

D is the decisive cell. A signal that stays quiet while an agent wrongly
accepts irrelevant evidence is not detecting error.

Design
------
For each query the evidence is fixed by the real retriever, and ONE analyst
output is generated and reused as the counterpart agent. Only the verifier
varies: several models, several repeats. Holding the counterpart constant is
what makes the verifier's stance the independent variable rather than a
correlate of whatever else changed in the trace.

Cells C and D are not manufactured with adversarial prompts. Every verifier
gets the same neutral question, and the cells fill because different models
genuinely disagree with each other about the same evidence. A cell produced by
prompt engineering would prove nothing about the signal.

Signals are computed by calling the evaluator directly, as experiments/
ablation.py does. No backend, no queue, no ingest path -- which also means this
measures the evaluator's ceiling and not its reachability, exactly the caveat
24.5 records about the ablation.

Usage
-----
    export NVIDIA_API_KEY=...        # build.nvidia.com, one key for the catalogue
    python experiments/refusal_disagreement.py --repeats 2

    # or the thinner arm, if that key is what you have
    export OPENROUTER_API_KEY=...
    python experiments/refusal_disagreement.py --provider openrouter

nvidia is the default because model diversity is the binding constraint here:
24.4 rests on a single verifier model, and one NVIDIA key reaches six families
where OpenRouter's free tier yielded three that reliably served.

Resumable: every completed trial is written to the results JSON immediately and
skipped on the next run. A daily rate limit means this is expected to span more
than one day, and a partial run is not a wasted one.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.grounding import compute_nli_grounding, load_models
from app.services.disagreement import evaluate_inter_agent_disagreement
from demo.workflows.retrieval import local_retriever

RESULTS = Path(__file__).parent / "results" / "refusal_disagreement.json"
REPORT = Path(__file__).parent.parent / "REFUSAL_DISAGREEMENT_REPORT.md"

PROVIDERS = {
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "nvidia": ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
}

# Verifier models, by provider. A model's habit of opening with "No" is a
# property of that model, not of the signal under test, so the number of
# distinct families here is the main thing protecting this experiment from
# measuring one model's manners.
#
# nvidia is the better arm: one signup reaches 82 models across 21 owners,
# where OpenRouter's free tier yielded six families that actually served. None
# of the nvidia ids below has been sent a real request yet -- verify before
# reporting anything from them, per 24.7.
VERIFIER_MODELS_BY_PROVIDER = {
    "openrouter": [
        "nex-agi/nex-n2.5-pro:free",
        "deepseek/deepseek-v4-flash-0731:free",
        "cohere/north-mini-code:free",
    ],
    # Five owners, and these were chosen by calling all 54 text models in the
    # catalogue rather than by reading it.
    #
    # /v1/models is a GLOBAL catalogue and access is per-account: 40 of the 54
    # answered 404 "Not found for account", including every model this list
    # originally named. Nine were callable, spanning six owners. Do not pick
    # from the catalogue again -- rerun the scan.
    #
    # The analyst takes the sixth owner, so no verifier shares a family with
    # the counterpart it is compared against.
    "nvidia": [
        "deepseek-ai/deepseek-v4-flash-0731",
        "google/gemma-4-31b-it",
        "meta/muse-glimmer-30b",
        "mistralai/mistral-nemotron",
        "z-ai/glm-5.3-flash",
    ],
}

# The counterpart agent, held constant so the verifier's stance is the only
# thing that varies. Deliberately not drawn from VERIFIER_MODELS: if the
# analyst and a verifier share a model they agree with themselves, which is the
# exact flattery 23.4 built the multi-family pipeline to avoid.
ANALYST_MODEL_BY_PROVIDER = {
    "openrouter": "poolside/laguna-s-2.1:free",
    # The sixth callable owner, so the analyst never shares a family with a
    # verifier. palmyra-creative was the earlier choice and was wrong twice
    # over: the account cannot call it, and it is tuned for creative writing
    # where the analyst's job is to state what the evidence supports without
    # embellishing.
    "nvidia": "nvidia/nemotron-3-super-120b-a12b",
}

# The corpus holds six documents: the Transformer paper, DeBERTa, SQLite WAL,
# KB-401 on API key expiry, KB-429 on token-bucket backoff, and telemetry KPI
# definitions. ON queries name something in it; OFF queries name something it
# has no document for. The label is the design intent -- what retrieval
# actually returned is recorded per trial and is what the analysis uses.
QUERIES: list[tuple[str, str]] = [
    ("ON", "transformer multi-head self-attention"),
    ("ON", "DeBERTa disentangled attention"),
    ("ON", "SQLite write-ahead logging concurrency"),
    ("ON", "invalid API key and token expiration"),
    ("ON", "token bucket rate limiter backoff"),
    ("OFF", "kubernetes pod autoscaling"),
    ("OFF", "gradient descent optimizer comparison"),
    ("OFF", "react hooks state management"),
    ("OFF", "photosynthesis light dependent reactions"),
    ("OFF", "italian carbonara pasta recipe"),
]

VERIFIER_PROMPT = (
    "Question: {query}\n\nEvidence:\n{evidence}\n\n"
    "Does the evidence answer the question? Begin your answer with Yes or No, "
    "then explain in one sentence."
)

ANALYST_PROMPT = (
    "Question: {query}\n\nEvidence:\n{evidence}\n\n"
    "Synthesise what the evidence supports. Three sentences, no speculation."
)


class EmptyCompletion(RuntimeError):
    """A 200 carrying no text. See demo/multi_model_pipeline.py."""


# Four of the six callable models are reasoning models: they spend completion
# tokens on a hidden reasoning_content field before emitting any answer, and
# deepseek burned 2,569 characters of it on "what is a database index?". At the
# 300 this file first used, content came back empty with finish_reason
# "length" -- which is a truncated model, not a broken one, and would have been
# recorded as an empty completion and thrown away.
DEFAULT_MAX_TOKENS = 1200


def ask(client: Any, model: str, prompt: str, *, max_tokens: int = DEFAULT_MAX_TOKENS, retries: int = 4) -> str:
    delay = 5.0
    for attempt in range(retries + 1):
        try:
            r = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )
        except Exception as exc:
            if ("429" not in str(exc) and "rate" not in str(exc).lower()) or attempt == retries:
                raise
            print(f"      (429 on {model}, retry {attempt + 1}/{retries} in {delay:.0f}s)")
            time.sleep(delay)
            delay *= 2
            continue
        choice = r.choices[0]
        text = (choice.message.content or "").strip()
        if not text:
            reasoning = len(getattr(choice.message, "reasoning_content", None) or "")
            why = (
                f"spent the budget on {reasoning} chars of hidden reasoning "
                f"(finish_reason={choice.finish_reason}); raise max_tokens"
                if reasoning else
                "no reasoning field either, so the model genuinely produced nothing"
            )
            raise EmptyCompletion(f"{model} returned 200 with empty content -- {why}")
        return text
    raise RuntimeError("unreachable")


def classify_stance(text: str) -> str:
    """accept / refuse / unclear, from the opening token only.

    Deliberately crude and recorded alongside the raw text, so a reader can
    audit every classification. Anything that does not open with yes or no is
    'unclear' and excluded from the 2x2 rather than being interpreted.
    """
    head = text.strip().lower().lstrip("*# ").replace("**", "")[:24]
    if head.startswith("yes"):
        return "accept"
    if head.startswith("no"):
        return "refuse"
    return "unclear"


def evidence_is_relevant(query: str, docs: list[Any], declared: str) -> bool:
    """Did retrieval actually return something on-topic?

    The declared ON/OFF label is intent. Retrieval can miss a document that
    exists -- 24.4 saw exactly that on the token-bucket query -- so relevance is
    recomputed per trial from the retrieved titles and it is this value, not the
    label, that places a trial in the 2x2.
    """
    if declared == "OFF":
        return False
    terms = {t for t in query.lower().split() if len(t) > 3}
    blob = " ".join(getattr(d, "title", "").lower() for d in docs)
    return any(t in blob for t in terms)


def load_existing() -> dict[str, Any]:
    if RESULTS.exists():
        with open(RESULTS, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"trials": [], "analyst_cache": {}}


def save(state: dict[str, Any]) -> None:
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def summarise(trials: list[dict[str, Any]]) -> dict[str, Any]:
    usable = [t for t in trials if t["stance"] in ("accept", "refuse")]
    cells: dict[str, list[dict[str, Any]]] = {"A": [], "B": [], "C": [], "D": []}
    for t in usable:
        rel, st = t["evidence_relevant"], t["stance"]
        key = ("A" if st == "accept" else "C") if rel else ("D" if st == "accept" else "B")
        cells[key].append(t)

    def stats(rows: list[dict[str, Any]], field: str) -> dict[str, Any] | None:
        if not rows:
            return None
        xs = sorted(r[field] for r in rows)
        return {
            "n": len(xs),
            "min": round(xs[0], 4),
            "max": round(xs[-1], 4),
            "mean": round(sum(xs) / len(xs), 4),
            "median": round(xs[len(xs) // 2], 4),
        }

    def auc(field: str) -> float | None:
        """Probability a refusal outranks an acceptance on `field`.

        0.5 is no separation, 1.0 is perfect. Used instead of comparing min and
        max because two non-overlapping ranges can be an artefact of small n,
        and this at least counts every pair.
        """
        pos = [t[field] for t in usable if t["stance"] == "refuse"]
        neg = [t[field] for t in usable if t["stance"] == "accept"]
        if not pos or not neg:
            return None
        wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
        return round(wins / (len(pos) * len(neg)), 4)

    return {
        "n_trials": len(trials),
        "n_usable": len(usable),
        "n_unclear": len(trials) - len(usable),
        "cells": {
            k: {
                "label": {
                    "A": "evidence relevant, verifier accepts (expected-normal)",
                    "B": "evidence irrelevant, verifier refuses (expected-normal)",
                    "C": "evidence relevant, verifier refuses (WRONG REFUSAL)",
                    "D": "evidence irrelevant, verifier accepts (WRONG ACCEPT)",
                }[k],
                "disagreement": stats(v, "disagreement_score"),
                "contradiction": stats(v, "contradiction_prob"),
            }
            for k, v in cells.items()
        },
        "auc_refusal_vs_acceptance": {
            "disagreement": auc("disagreement_score"),
            "contradiction": auc("contradiction_prob"),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repeats", type=int, default=2, help="verifier samples per model per query")
    ap.add_argument("--max-trials", type=int, default=0, help="stop after N new trials (0 = no cap)")
    ap.add_argument("--report-only", action="store_true", help="rebuild the report from saved results")
    ap.add_argument("--provider", choices=sorted(PROVIDERS), default="nvidia",
                    help="which OpenAI-compatible gateway to call (default: nvidia)")
    args = ap.parse_args()

    base_url, key_env = PROVIDERS[args.provider]
    verifier_models = VERIFIER_MODELS_BY_PROVIDER[args.provider]
    analyst_model = ANALYST_MODEL_BY_PROVIDER[args.provider]

    state = load_existing()

    if not args.report_only:
        key = os.getenv(key_env)
        if not key:
            where = {
                "openrouter": "https://openrouter.ai/keys",
                "nvidia": "https://build.nvidia.com (account menu -> API keys)",
            }[args.provider]
            print(f"{key_env} is not set. Create one at {where} and put it in "
                  ".env or the environment.", file=sys.stderr)
            return 2
        from openai import OpenAI

        client = OpenAI(base_url=base_url, api_key=key)
        state["config"] = {
            "provider": args.provider,
            "verifier_models": verifier_models,
            "analyst_model": analyst_model,
        }
        # load_models defaults cache_dir to "./models", relative to the working
        # directory and ignoring config. experiments/ablation.py does not pass
        # it and re-downloads 1.2 GB in any fresh checkout; pass it here so the
        # env var that the rest of the stack honours works for this script too.
        load_models(
            use_onnx=False,
            sync=True,
            cache_dir=os.getenv("AGENTPULSE_MODEL_CACHE_DIR", "./models"),
        )

        done = {(t["query"], t["verifier_model"], t["repeat"]) for t in state["trials"]}
        new = 0

        for declared, query in QUERIES:
            docs = local_retriever.search(query, top_k=3)
            evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
            relevant = evidence_is_relevant(query, docs, declared)

            if query not in state["analyst_cache"]:
                try:
                    state["analyst_cache"][query] = ask(
                        client, analyst_model, ANALYST_PROMPT.format(query=query, evidence=evidence)
                    )
                    save(state)
                except Exception as exc:
                    print(f"  analyst failed on {query!r}: {type(exc).__name__}: {exc}")
                    continue
            analyst_out = state["analyst_cache"][query]

            for model in verifier_models:
                for rep in range(args.repeats):
                    if (query, model, rep) in done:
                        continue
                    if args.max_trials and new >= args.max_trials:
                        print(f"\nreached --max-trials {args.max_trials}; rerun to continue")
                        save(state)
                        _write_report(state)
                        return 0
                    try:
                        v_out = ask(
                            client, model, VERIFIER_PROMPT.format(query=query, evidence=evidence)
                        )
                    except Exception as exc:
                        print(f"  {model} r{rep} on {query!r}: {type(exc).__name__}: {exc}")
                        continue

                    stance = classify_stance(v_out)
                    dis = evaluate_inter_agent_disagreement(
                        source_agent_id="analyst",
                        source_output=analyst_out,
                        target_agent_id="verifier",
                        target_output=v_out,
                    )
                    nli = compute_nli_grounding(evidence, v_out)

                    state["trials"].append({
                        "query": query,
                        "declared": declared,
                        "evidence_relevant": relevant,
                        "retrieved_titles": [getattr(d, "title", "") for d in docs],
                        "verifier_model": model,
                        "repeat": rep,
                        "verifier_output": v_out,
                        "stance": stance,
                        "disagreement_score": dis.disagreement_score if dis else 0.0,
                        "contradiction_prob": nli.contradiction_prob if nli else 0.0,
                        "entailment_prob": nli.entailment_prob if nli else 0.0,
                    })
                    new += 1
                    save(state)
                    print(f"  {query[:34]:<34} {model.split('/')[0]:<10} r{rep} "
                          f"{stance:<8} dis={state['trials'][-1]['disagreement_score']:.3f}")

    _write_report(state)
    return 0


def _write_report(state: dict[str, Any]) -> None:
    s = summarise(state["trials"])
    state["summary"] = s
    save(state)

    def row(k: str) -> str:
        c = s["cells"][k]
        d, ct = c["disagreement"], c["contradiction"]
        fmt = lambda x: "n=0" if not x else f"n={x['n']}, mean {x['mean']}, range {x['min']}–{x['max']}"
        return f"| {k} | {c['label']} | {fmt(d)} | {fmt(ct)} |"

    cfg = state.get("config", {})
    verifiers_str = ", ".join(cfg.get("verifier_models", [])) or "(not recorded)"
    analyst_str = cfg.get("analyst_model", "(not recorded)")
    auc_d = s["auc_refusal_vs_acceptance"]["disagreement"]
    auc_c = s["auc_refusal_vs_acceptance"]["contradiction"]
    cd = s["cells"]["C"]["disagreement"], s["cells"]["D"]["disagreement"]

    if not cd[0] or not cd[1]:
        verdict = (
            "**Not yet decidable.** Cells C and D are the ones that separate the two "
            "hypotheses and at least one of them is still empty. More repeats, or more "
            "verifier models, are needed before this table says anything."
        )
    elif cd[1]["mean"] < 0.5 <= cd[0]["mean"]:
        verdict = (
            "**Consistent with H1 (stance).** Wrong refusals score high and wrong "
            "acceptances score low, so the signal follows the verifier's stance rather "
            "than whether the verifier was right. A signal that stays quiet while an "
            "agent wrongly accepts irrelevant evidence is not detecting error."
        )
    elif cd[0]["mean"] >= 0.5 and cd[1]["mean"] >= 0.5:
        verdict = (
            "**Consistent with H2 (error).** Both wrong-refusal and wrong-acceptance "
            "score high, so the signal is responding to something being wrong rather "
            "than to stance alone."
        )
    else:
        verdict = (
            "**Mixed.** Cells C and D do not fall cleanly under either hypothesis. "
            "Report the cell means and do not summarise this as a single claim."
        )

    content = f"""# Does disagreement track error, or refusal?

**Trials:** {s['n_trials']} ({s['n_usable']} usable, {s['n_unclear']} excluded as unclassifiable)

## Question

Section 24.4 found inter-agent disagreement firing at 0.966–1.000 on every
correct refusal and 0.000–0.020 on every acceptance. In that data "the verifier
refused" and "the evidence was irrelevant" were the same event, so the result
cannot distinguish:

- **H1 (stance)** — disagreement rises when one agent's stance diverges from the
  others', regardless of who is right
- **H2 (error)** — disagreement rises when something in the trace is wrong

## Method

Per query the evidence is fixed by the real retriever and one analyst output is
generated and reused as the counterpart agent, so the verifier's stance is the
only thing that varies. Verifiers: {verifiers_str}. Every verifier
receives the same neutral prompt; cells C and D fill because models genuinely
disagree with each other, not because any prompt pushed them to.

Placement in the 2x2 uses whether retrieval *actually* returned an on-topic
document, not the query's declared label.

## Results

| cell | condition | disagreement | contradiction |
| :--- | :--- | :--- | :--- |
{row('A')}
{row('B')}
{row('C')}
{row('D')}

Separation of refusal from acceptance, as AUC (0.5 = none, 1.0 = perfect):

- disagreement: **{auc_d}**
- contradiction: **{auc_c}**

**AUC does not answer the question this report asks.** Checked against
simulated data: an H2 world, where the signal tracks error and fires on wrong
acceptances too, still produces AUC 1.0, because AUC only ranks refusals
against acceptances and says nothing about which of them were correct. Only
cells C and D separate the hypotheses. The AUC is reported because it is the
honest summary of the 24.4 observation, not because it settles anything.

## Verdict

{verdict}

## Limitations

- **This does not exercise the ingest path.** Signals are computed by calling the
  evaluator directly, so these figures are the evaluator's ceiling on
  well-formed inputs. 24.5 records what that distinction cost the project once
  already.
- **Stance is classified from the opening token.** Crude by choice; every
  classification is stored with its raw text in the results JSON and can be
  audited. Outputs that do not open with yes or no are excluded rather than
  interpreted.
- **One analyst model and one corpus of six documents.** The counterpart agent
  is held constant to isolate the verifier, which also means any quirk of
  {analyst_str} is present in every trial.
- **Cells C and D are not balanced by construction** and cannot be, since they
  depend on models spontaneously disagreeing. Read their n before their mean.

*Data:* `experiments/results/refusal_disagreement.json`
"""
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\nreport -> {REPORT.name}")
    print(f"trials {s['n_trials']} usable {s['n_usable']} | "
          f"AUC disagreement {auc_d} contradiction {auc_c}")
    for k in "ABCD":
        d = s["cells"][k]["disagreement"]
        print(f"  cell {k}: {'n=0' if not d else f'n={d['n']} mean {d['mean']}'}")


if __name__ == "__main__":
    raise SystemExit(main())
