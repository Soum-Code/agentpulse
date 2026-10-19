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

# ---- What this file is for ---------------------------------------------------
# An experiment that you run by hand. It asks: when the disagreement score is high, is
# that because something in the trace is WRONG, or only because one agent said "No"?
# For each of 10 fixed questions it gets evidence from the demo's document search. Then
# several different LLMs play a "verifier": an agent that must answer Yes or No to "does
# this evidence answer the question?". Each verifier answer is scored with AgentPulse's
# disagreement code and sorted into a 2x2 table (evidence relevant or not, verifier
# accepts or refuses). The output is a JSON file with every trial and a markdown report.
#
# How it fits in: it calls the backend services directly (grounding.py and
# disagreement.py), takes documents from demo/workflows/retrieval.py and talks to LLMs
# through an OpenAI-style client (NVIDIA or OpenRouter). There is no API, queue or worker.
# experiments/paraphrase_stability.py reads the JSON file that this script writes.
# ------------------------------------------------------------------------------

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Make the backend, the SDK and the repo root importable when this file is run directly.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# compute_nli_grounding = run the NLI model on (evidence, text). load_models = load the NLI
# and embedding models into memory. Until it has run, compute_nli_grounding returns None.
from app.services.grounding import compute_nli_grounding, load_models
# The two disagreement functions: one compares a single pair of agents, the other compares
# one agent with all the agents before it in the trace.
from app.services.disagreement import (
    evaluate_against_prior_agents,
    evaluate_inter_agent_disagreement,
)
# local_retriever = the demo's small in-memory document search (used to get the evidence).
from demo.workflows.retrieval import local_retriever

# RESULTS = the JSON file holding every trial (rewritten after each trial).
# REPORT = the markdown report written at the end, in the repo root.
RESULTS = Path(__file__).parent / "results" / "refusal_disagreement.json"
REPORT = Path(__file__).parent.parent / "REFUSAL_DISAGREEMENT_REPORT.md"

# Provider name -> (base URL of an OpenAI-compatible API, name of the env variable that
# holds its key).
PROVIDERS = {
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "nvidia": ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
}

# Verifier models, by provider. A model's habit of opening with "No" is a
# property of that model, not of the signal under test, so the number of
# distinct families here is the main thing protecting this experiment from
# measuring one model's manners.
#
# nvidia is the better arm, though not for the reason the catalogue suggests:
# /v1/models advertises 82 entries across 21 owners, and a free key can call
# nine of them across six owners. Six still beats the three that reliably
# served on OpenRouter's free tier. Every id below was sent a real request and
# answered.
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

# In short: QUERIES is the list of 10 test questions. Each item is a tuple of (ON or OFF
# label, the query text, the title of the document that should be retrieved or None).
# The corpus holds six documents: the Transformer paper, DeBERTa, SQLite WAL,
# KB-401 on API key expiry, KB-429 on token-bucket backoff, and telemetry KPI
# definitions. ON queries name something in it; OFF queries name something it
# has no document for. The label is the design intent -- what retrieval
# actually returned is recorded per trial and is what the analysis uses.
# Third element: the document that must be retrieved for the evidence to count
# as relevant. Named explicitly per query rather than inferred, because the
# obvious inference is wrong: matching query words against retrieved titles
# marked "transformer multi-head self-attention" as irrelevant when retrieval
# had returned "Attention Is All You Need" -- the Transformer paper, whose
# title does not contain the word Transformer. That mislabels a correct
# acceptance as a wrong one and corrupts cell D, which is the cell the whole
# experiment turns on.
QUERIES: list[tuple[str, str, str | None]] = [
    ("ON", "transformer multi-head self-attention", "Attention Is All You Need"),
    ("ON", "DeBERTa disentangled attention", "DeBERTa"),
    ("ON", "SQLite write-ahead logging concurrency", "SQLite Write-Ahead Logging"),
    ("ON", "invalid API key and token expiration", "KB-401"),
    ("ON", "token bucket rate limiter backoff", "KB-429"),
    ("OFF", "kubernetes pod autoscaling", None),
    ("OFF", "gradient descent optimizer comparison", None),
    ("OFF", "react hooks state management", None),
    ("OFF", "photosynthesis light dependent reactions", None),
    ("OFF", "italian carbonara pasta recipe", None),
]

# Lookup table: query text -> expected document title (None for the OFF queries).
EXPECTED_DOC = {q: exp for _, q, exp in QUERIES}

# The prompt every verifier model gets. It must start its answer with Yes or No, because
# classify_stance() below reads only the start of the answer.
VERIFIER_PROMPT = (
    "Question: {query}\n\nEvidence:\n{evidence}\n\n"
    "Does the evidence answer the question? Begin your answer with Yes or No, "
    "then explain in one sentence."
)

# The prompt for the analyst model. Its one answer per query is reused in every trial, but
# only for the analyst-pair score. The live score compares the verifier with the researcher
# and retriever texts instead (see RESEARCHER_PROMPT below).
ANALYST_PROMPT = (
    "Question: {query}\n\nEvidence:\n{evidence}\n\n"
    "Synthesise what the evidence supports. Three sentences, no speculation."
)

# In short: two more fixed prompts, for the researcher and retriever agents that come before
# the verifier in a real trace. Their answers are the verifier's "earlier agents".
# The two agents that precede the verifier in demo/multi_model_pipeline.py, with
# that file's prompts. They exist here because of what the live evaluator
# actually does, which is not what this experiment first assumed:
#
# evaluator.py calls evaluate_against_prior_agents for each span, comparing an
# agent against every agent EARLIER in the trace and keeping the worst pair.
# The verifier is third, so its live score is max(researcher, retriever) vs
# verifier. The analyst comes fourth and is never part of the verifier's own
# score.
#
# So the pairwise analyst-verifier number this experiment started with is not
# the quantity 24.4 reported, and comparing them would have been meaningless.
# Both are now recorded per trial: disagreement_live for the comparison, and
# disagreement_analyst_pair for what was measured before.
RESEARCHER_PROMPT = (
    "You are planning a literature review on: {query}\n"
    "List three specific sub-questions worth answering. Be brief."
)

RETRIEVER_PROMPT = (
    "A search for '{query}' returned these documents:\n\n{evidence}\n\n"
    "Write one sentence describing what you retrieved. State how many "
    "documents you are using, in the form 'Retrieved N documents'."
)


# Raised by ask() when the API answers successfully (status 200) but with no text at all.
class EmptyCompletion(RuntimeError):
    """A 200 carrying no text. See demo/multi_model_pipeline.py."""


# In short: the limit on answer length (in tokens). It is high because some models "think"
# silently first and would otherwise run out before they write an answer.
# Four of the six callable models are reasoning models: they spend completion
# tokens on a hidden reasoning_content field before emitting any answer, and
# deepseek burned 2,569 characters of it on "what is a database index?". At the
# 300 this file first used, content came back empty with finish_reason
# "length" -- which is a truncated model, not a broken one, and would have been
# recorded as an empty completion and thrown away.
DEFAULT_MAX_TOKENS = 1200


# Send one prompt to one model and return the answer text. If the API says "too many
# requests" (HTTP 429, a rate limit), wait and try again: 5 s, then 10 s, 20 s ... (the wait
# doubles each time). Any other error is raised at once. An empty answer raises
# EmptyCompletion.
def ask(client: Any, model: str, prompt: str, *, max_tokens: int = DEFAULT_MAX_TOKENS, retries: int = 4) -> str:
    delay = 5.0
    # The first pass is the normal try. The `retries` extra passes happen only after a
    # rate-limit error.
    for attempt in range(retries + 1):
        try:
            r = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )
        except Exception as exc:
            # Re-raise unless the error text looks like a rate limit ("429" or "rate") and
            # there are still tries left.
            if ("429" not in str(exc) and "rate" not in str(exc).lower()) or attempt == retries:
                raise
            print(f"      (429 on {model}, retry {attempt + 1}/{retries} in {delay:.0f}s)")
            time.sleep(delay)
            delay *= 2
            continue
        # Take the first answer. The text can be None, so it is treated as empty.
        choice = r.choices[0]
        text = (choice.message.content or "").strip()
        if not text:
            # Empty answer. Find out why, for a useful error message: reasoning models keep
            # hidden "thinking" text in reasoning_content, and may use the whole token
            # budget there.
            reasoning = len(getattr(choice.message, "reasoning_content", None) or "")
            why = (
                f"spent the budget on {reasoning} chars of hidden reasoning "
                f"(finish_reason={choice.finish_reason}); raise max_tokens"
                if reasoning else
                "no reasoning field either, so the model genuinely produced nothing"
            )
            raise EmptyCompletion(f"{model} returned 200 with empty content -- {why}")
        return text
    # Every pass above returns, raises or continues, and the last pass cannot continue.
    # So this line is never reached; it is only a safety net.
    raise RuntimeError("unreachable")


def classify_stance(text: str) -> str:
    """accept / refuse / unclear, from the opening token only.

    Deliberately crude and recorded alongside the raw text, so a reader can
    audit every classification. Anything that does not open with yes or no is
    'unclear' and excluded from the 2x2 rather than being interpreted.
    """
    # Clean the start of the answer: lower-case it, drop leading "*", "#" and spaces
    # (markdown bold or headings), remove any other "**", and keep the first 24 characters.
    head = text.strip().lower().lstrip("*# ").replace("**", "")[:24]
    # Only the start is checked. So any answer that starts with "no" counts as a refusal,
    # even a word like "not" or "none".
    if head.startswith("yes"):
        return "accept"
    if head.startswith("no"):
        return "refuse"
    return "unclear"


def score_disagreement(verifier_out: str, analyst_out: str, ctx: dict[str, str]) -> dict[str, float]:
    """Both disagreement numbers for one verifier output.

    disagreement_live mirrors what evaluator.py records for a verifier span:
    evaluate_against_prior_agents over the agents that precede it, keeping the
    worst pair. This is the number comparable to 24.4.

    disagreement_analyst_pair is the single analyst-verifier comparison this
    experiment originally measured. Kept so the difference between the two is
    visible in the data rather than argued about.
    """
    # The agents before the verifier in a real trace, as (agent id, output text) pairs. A
    # missing text becomes "" and the evaluator skips empty texts.
    priors = [("researcher", ctx.get("researcher", "")), ("retriever", ctx.get("retriever", ""))]
    # "Live" score: compare the verifier with each earlier agent and keep the worst
    # (highest) contradiction score, as the real evaluator does. A pair whose two texts are
    # about different things is skipped (it adds nothing to the score).
    live = evaluate_against_prior_agents(
        current_agent_id="verifier", current_output=verifier_out, prior_outputs=priors
    )
    # "Pair" score: only the analyst (premise) against the verifier (hypothesis). It is the
    # raw contradiction probability, kept even when the two texts are about different things.
    pair = evaluate_inter_agent_disagreement(
        source_agent_id="analyst", source_output=analyst_out,
        target_agent_id="verifier", target_output=verifier_out,
    )
    # Both functions return None when nothing could be compared (for example the NLI model
    # is not loaded). That is stored as 0.0.
    return {
        "disagreement_live": round(live.max_disagreement_score, 4) if live else 0.0,
        "disagreement_analyst_pair": pair.disagreement_score if pair else 0.0,
    }


def relevance_from_titles(query: str, titles: list[str]) -> bool:
    """Did retrieval return the document this query is about?

    The declared ON/OFF label is intent; retrieval can miss a document that
    exists, and 24.4 saw exactly that on the token-bucket query. So relevance
    is decided per trial by whether the query's expected document is among the
    retrieved titles, and it is this value that places a trial in the 2x2.

    Computed from stored titles rather than live objects so the labelling can be
    corrected after the fact without re-spending the API calls -- which is what
    had to happen when the first version of this function got it wrong.
    """
    # An OFF query has no expected document (None), so its evidence is never "relevant".
    expected = EXPECTED_DOC.get(query)
    if not expected:
        return False
    # Relevant = the expected title appears inside at least one retrieved title (any case).
    return any(expected.lower() in t.lower() for t in titles)


# Read the saved results file if there is one, so a rerun continues where the last run
# stopped. Otherwise start empty: no trials and no cached analyst answers.
def load_existing() -> dict[str, Any]:
    if RESULTS.exists():
        with open(RESULTS, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"trials": [], "analyst_cache": {}}


# Write the whole state to the results JSON file (creating its folder if needed). main()
# calls this after every trial, so a crash loses at most the trial in progress.
def save(state: dict[str, Any]) -> None:
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


# Turn a list of trials into the numbers for the report: how many trials, the stats of
# each cell of the 2x2 table, and the AUC of each score. Returns a dict that is saved in
# the results JSON and used to write the report.
def summarise(trials: list[dict[str, Any]]) -> dict[str, Any]:
    # Step 1: keep only trials with a clear stance. "unclear" ones are left out.
    usable = [t for t in trials if t["stance"] in ("accept", "refuse")]
    # Step 2: put each trial in a cell. A = relevant evidence + accept, C = relevant evidence
    # + refuse, D = irrelevant evidence + accept, B = irrelevant evidence + refuse.
    cells: dict[str, list[dict[str, Any]]] = {"A": [], "B": [], "C": [], "D": []}
    for t in usable:
        rel, st = t["evidence_relevant"], t["stance"]
        key = ("A" if st == "accept" else "C") if rel else ("D" if st == "accept" else "B")
        cells[key].append(t)

    # Summary numbers of one score (`field`) over the trials in one cell. Gives None for an
    # empty cell. The median is the middle value of the sorted list (for an even count,
    # the upper one of the two middle values).
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
            # "above_0.6" counts rows scoring more than 0.6. (disagreement.py flags a pair
            # from 0.6 upward by default.)
            # Cell A is bimodal: mean 0.248 with median 0.046, because nine
            # of forty correct acceptances score above the alert threshold.
            # The mean alone reads as "low with noise" and hides that.
            "above_0.6": sum(1 for x in xs if x > 0.6),
        }

    def auc(field: str) -> float | None:
        """Probability a refusal outranks an acceptance on `field`.

        0.5 is no separation, 1.0 is perfect. Used instead of comparing min and
        max because two non-overlapping ranges can be an artefact of small n,
        and this at least counts every pair.
        """
        # pos = scores of the refusals, neg = scores of the acceptances. AUC needs both.
        pos = [t[field] for t in usable if t["stance"] == "refuse"]
        neg = [t[field] for t in usable if t["stance"] == "accept"]
        if not pos or not neg:
            return None
        # Look at every (refusal, acceptance) pair: 1 point if the refusal scored higher,
        # half a point for a tie. Divide by the number of pairs to get a value from 0 to 1.
        wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
        return round(wins / (len(pos) * len(neg)), 4)

    # Output: the trial counts, then for each cell the stats of three scores (live
    # disagreement, analyst-pair disagreement, NLI contradiction), then the three AUCs.
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
                "disagreement_live": stats(v, "disagreement_live"),
                "disagreement_analyst_pair": stats(v, "disagreement_analyst_pair"),
                "contradiction": stats(v, "contradiction_prob"),
            }
            for k, v in cells.items()
        },
        "auc_refusal_vs_acceptance": {
            "disagreement_live": auc("disagreement_live"),
            "disagreement_analyst_pair": auc("disagreement_analyst_pair"),
            "contradiction": auc("contradiction_prob"),
        },
    }


# Run the experiment. For each query it gets the evidence, gets the analyst, researcher and
# retriever texts once, then asks every verifier model --repeats times and stores each
# trial. Finally it writes the report. Returns 0 when done, or 2 if the API key is missing.
def main() -> int:
    # The four command-line options. --repeats = how many times each verifier model answers
    # each question. --max-trials = stop after this many NEW trials. --report-only = make no
    # API calls, only rebuild the report. --provider = which gateway to use.
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repeats", type=int, default=2, help="verifier samples per model per query")
    ap.add_argument("--max-trials", type=int, default=0, help="stop after N new trials (0 = no cap)")
    ap.add_argument("--report-only", action="store_true", help="rebuild the report from saved results")
    ap.add_argument("--provider", choices=sorted(PROVIDERS), default="nvidia",
                    help="which OpenAI-compatible gateway to call (default: nvidia)")
    args = ap.parse_args()

    # Step 1: pick the URL, key name and model lists that belong to the chosen provider.
    base_url, key_env = PROVIDERS[args.provider]
    verifier_models = VERIFIER_MODELS_BY_PROVIDER[args.provider]
    analyst_model = ANALYST_MODEL_BY_PROVIDER[args.provider]

    # Step 2: load the results of earlier runs (if any), so finished trials are not repeated.
    state = load_existing()

    # Backfilling a trial recomputes NLI, so --report-only needs the models too.
    # Without this the backfill silently scored every trial 0.0: compute_nli_
    # grounding returns None when nothing is loaded, score_disagreement turns
    # that into 0.0, and the report showed a uniform near-zero disagreement
    # across all cells that looked exactly like a finding.
    if any("disagreement_live" not in t for t in state["trials"]):
        load_models(
            use_onnx=False,
            sync=True,
            cache_dir=os.getenv("AGENTPULSE_MODEL_CACHE_DIR", "./models"),
        )

    # Step 3: unless --report-only was given, run new trials. This needs the API key and the
    # models. With --report-only this whole block is skipped.
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
        # Imported here, not at the top, so --report-only works without the openai package.
        from openai import OpenAI

        # An OpenAI-style client pointed at the chosen gateway (NVIDIA or OpenRouter).
        client = OpenAI(base_url=base_url, api_key=key)
        # Remember which models were used, so the report can name them.
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

        # Step 4: `done` = trials that already exist, as (query, model, repeat) keys, so that
        # a rerun skips them. `new` counts the trials added in this run (for --max-trials).
        done = {(t["query"], t["verifier_model"], t["repeat"]) for t in state["trials"]}
        new = 0

        # Step 5: go through the 10 queries one by one. `_expected` is not used here; the
        # expected document is looked up inside relevance_from_titles().
        for declared, query, _expected in QUERIES:
            # Get the 3 best-matching documents. The search always returns 3, even when none
            # of them is about the query. They are the fixed evidence for this query.
            docs = local_retriever.search(query, top_k=3)
            # Evidence text = "title: content" for each document, with a blank line between.
            evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
            titles = [getattr(d, "title", "") for d in docs]
            # Was the expected document among the three? This decides the row of the 2x2.
            relevant = relevance_from_titles(query, titles)

            # One analyst answer per query. It is cached in the results file. If the call
            # fails, skip this query for now (a rerun will try again).
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

            # The verifier's priors, generated once per query and reused across
            # every verifier model, on the same model as the analyst so that the
            # only thing varying across trials is still the verifier.
            ctx = state.setdefault("context_cache", {}).get(query)
            if ctx is None:
                try:
                    ctx = {
                        "researcher": ask(
                            client, analyst_model, RESEARCHER_PROMPT.format(query=query)
                        ),
                        "retriever": ask(
                            client, analyst_model,
                            RETRIEVER_PROMPT.format(query=query, evidence=evidence),
                        ),
                    }
                    state["context_cache"][query] = ctx
                    save(state)
                except Exception as exc:
                    print(f"  context failed on {query!r}: {type(exc).__name__}: {exc}")
                    continue

            # Step 6: every verifier model answers the same question `--repeats` times. One
            # answer = one trial.
            for model in verifier_models:
                for rep in range(args.repeats):
                    # Already done in an earlier run: skip it.
                    if (query, model, rep) in done:
                        continue
                    # Stop early when the cap on new trials is reached. Save and write the
                    # report first, so the work so far is kept.
                    if args.max_trials and new >= args.max_trials:
                        print(f"\nreached --max-trials {args.max_trials}; rerun to continue")
                        save(state)
                        _write_report(state)
                        return 0
                    # If the call fails, skip this one trial. It was never saved, so the next
                    # run will try it again.
                    try:
                        v_out = ask(
                            client, model, VERIFIER_PROMPT.format(query=query, evidence=evidence)
                        )
                    except Exception as exc:
                        print(f"  {model} r{rep} on {query!r}: {type(exc).__name__}: {exc}")
                        continue

                    # Step 7: read the stance (Yes or No) and run the NLI model on the answer
                    # against the evidence. nli is None if it gave no result (for example
                    # the models are not loaded).
                    stance = classify_stance(v_out)
                    nli = compute_nli_grounding(evidence, v_out)
                    # Store everything about this trial, including the raw answer, so it can
                    # be checked later. score_disagreement() adds the two disagreement
                    # scores. A missing NLI result is stored as 0.0.
                    state["trials"].append({
                        "query": query,
                        "declared": declared,
                        "evidence_relevant": relevant,
                        "retrieved_titles": titles,
                        "verifier_model": model,
                        "repeat": rep,
                        "verifier_output": v_out,
                        "stance": stance,
                        "contradiction_prob": nli.contradiction_prob if nli else 0.0,
                        "entailment_prob": nli.entailment_prob if nli else 0.0,
                        **score_disagreement(v_out, analyst_out, ctx),
                    })
                    new += 1
                    save(state)
                    # Progress line: the question (first 34 characters), the model's owner
                    # name, the repeat number, the stance and the live disagreement score.
                    print(f"  {query[:34]:<34} {model.split('/')[0]:<10} r{rep} "
                          f"{stance:<8} dis={state['trials'][-1]['disagreement_live']:.3f}")

    # Step 8: build the summary and write the markdown report. This also runs with
    # --report-only, using only the saved results.
    _write_report(state)
    return 0


# Turn the saved trials into summary numbers, a verdict (H1, H2, mixed or not yet decidable)
# and the markdown report file, then print a short summary. Input: the whole state dict. It
# also writes the summary back into the results JSON.
def _write_report(state: dict[str, Any]) -> None:
    # Relabel from stored titles before summarising. The relevance rule has
    # been wrong once; recomputing here means a correction costs nothing and
    # cannot leave stale labels in an already-written results file.
    for t in state["trials"]:
        t["evidence_relevant"] = relevance_from_titles(t["query"], t.get("retrieved_titles", []))

    # Backfill trials recorded before disagreement_live existed. Their verifier
    # output is stored, so this needs no API call -- only the query's context,
    # which the run generates once. Trials whose query has no context yet keep
    # 0.0 and are reported as such rather than silently scoring zero.
    ctx_all = state.get("context_cache", {})
    analysts = state.get("analyst_cache", {})
    missing_ctx = set()
    for t in state["trials"]:
        if "disagreement_live" in t:
            continue
        ctx = ctx_all.get(t["query"])
        if not ctx:
            missing_ctx.add(t["query"])
            # The code stores None here (not 0.0, as the comment above says). None marks "not
            # scored", so the summary leaves this trial out. The pair score is copied from
            # the key "disagreement_score" if the trial has it, else 0.0.
            t["disagreement_live"] = None
            t["disagreement_analyst_pair"] = t.get("disagreement_score", 0.0)
            continue
        t.update(score_disagreement(t["verifier_output"], analysts.get(t["query"], ""), ctx))
    if missing_ctx:
        print(f"  {len(missing_ctx)} quer(ies) have no context yet; "
              f"their trials are excluded from the live-rule numbers")
    # Filter for the summary only. Never drop them from state -- these rows
    # cost real API calls and a later run can still backfill them once their
    # query has context.
    scorable = [t for t in state["trials"] if t.get("disagreement_live") is not None]
    s = summarise(scorable)
    state["summary"] = s
    save(state)

    # One markdown table row for cell k: its letter, its label, then the live disagreement
    # stats and the NLI contradiction stats of that cell.
    def row(k: str) -> str:
        c = s["cells"][k]
        d, ct = c["disagreement_live"], c["contradiction"]
        # Show a stats dict as one line of text, or "n=0" when the cell has no trials.
        fmt = lambda x: "n=0" if not x else (
            f"n={x['n']}, median {x['median']}, mean {x['mean']}, "
            f"{x['above_0.6']}/{x['n']} above 0.6"
        )
        return f"| {k} | {c['label']} | {fmt(d)} | {fmt(ct)} |"

    # Pull out the names and numbers that the report text below needs. The model names come
    # from the saved config (it is missing if only --report-only was ever run).
    cfg = state.get("config", {})
    verifiers_str = ", ".join(cfg.get("verifier_models", [])) or "(not recorded)"
    analyst_str = cfg.get("analyst_model", "(not recorded)")
    auc_d = s["auc_refusal_vs_acceptance"]["disagreement_live"]
    auc_pair = s["auc_refusal_vs_acceptance"]["disagreement_analyst_pair"]
    auc_c = s["auc_refusal_vs_acceptance"]["contradiction"]
    # cd = (stats of cell C, stats of cell D) for the live disagreement score.
    cd = s["cells"]["C"]["disagreement_live"], s["cells"]["D"]["disagreement_live"]

    # Choose the verdict text from the MEAN live score of cells C (wrong refusals) and
    # D (wrong accepts):
    #   - C or D has no trials: "not yet decidable".
    #   - D mean below 0.5 and C mean at least 0.5: H1 (the score follows the stance).
    #   - both means at least 0.5: H2 (the score follows errors).
    #   - anything else: "mixed".
    # The 0.5 cut-off is written directly in the code; nothing says where it comes from.
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

    # The report is one big f-string (text with {values} filled in). Most of the prose is
    # fixed text. Only the trial counts, the verifier and analyst names, the table rows,
    # the AUC numbers and the verdict come from this run.
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

- disagreement, live rule (verifier vs its prior agents): **{auc_d}**
- disagreement, analyst-verifier pair only: **{auc_pair}**
- contradiction (evidence vs verifier): **{auc_c}**

The first is the quantity 24.4 reported. The second is what this
experiment measured before that was checked, and is a different pair:
evaluator.py scores each span against the agents BEFORE it, and the
analyst comes after the verifier.

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
    # Write the report (the old one is overwritten), then print a short summary to the screen.
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\nreport -> {REPORT.name}")
    print(f"trials {s['n_trials']} usable {s['n_usable']} | "
          f"AUC disagreement {auc_d} contradiction {auc_c}")
    # One line per cell: how many trials it holds and their mean live disagreement score.
    for k in "ABCD":
        d = s["cells"][k]["disagreement_live"]
        print(f"  cell {k}: {'n=0' if not d else f'n={d['n']} mean {d['mean']}'}")


if __name__ == "__main__":
    raise SystemExit(main())
