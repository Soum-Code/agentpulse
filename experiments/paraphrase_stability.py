"""How much does a signal move when only the wording changes?

24.9.2 showed verifier outputs at 0.746-0.880 semantic similarity to each other
scoring disagreement 0.005 and 0.991. That was three anecdotes and one bimodal
cell -- enough to say the scores are unstable, not enough to say how unstable.

This measures it. For a signal to support a per-span alert, two statements that
mean the same thing must score roughly the same. So: take a real agent output,
generate paraphrases of it, hold everything else in the comparison fixed, and
look at the spread.

    anchor        a verifier output from experiments/results/refusal_disagreement.json,
                  with the evidence and prior-agent outputs it was scored against
    paraphrases   N rewrites of that anchor, meaning preserved, wording changed
    scoring       each paraphrase substituted for the anchor and scored by the
                  same rules: contradiction against the evidence, and
                  disagreement against the same prior agents

Nothing else varies. The evidence is identical, the priors are identical, the
NLI model is identical. Any spread is the signal reacting to wording alone.

The obvious objection is that a "paraphrase" might not preserve meaning, in
which case spread is the paraphraser's fault rather than the signal's. So every
paraphrase is checked against its anchor with the same embedding model the
product uses, and any that falls below PARAPHRASE_FLOOR is discarded before
scoring and reported as discarded. That check is the reason this is a
measurement rather than another anecdote.

What a result looks like:

    stable     paraphrases of one anchor land within a narrow band, and none
               crosses the alert threshold the anchor did not
    unstable   they span the range, and some cross

Usage:

    export NVIDIA_API_KEY=...
    python experiments/paraphrase_stability.py --anchors 6 --paraphrases 8
"""

# What this file is for: it measures how much two scores change when an agent's output is
# reworded but keeps its meaning. The two scores are "contradiction" (how much the evidence
# contradicts the output) and "disagreement" (how much the output contradicts the earlier
# agents of the same trace). Both come from an NLI model. NLI = a model that says if one
# sentence follows from another.
# Steps: (1) pick real verifier outputs ("anchors") from an earlier experiment, (2) ask an
# LLM for several rewrites of each anchor, (3) drop the rewrites whose meaning moved too far,
# (4) score the rest like the anchor, (5) report how widely the scores spread.
# It saves a JSON file and writes a markdown report.
#
# How it fits in: run by hand (see Usage above); nothing imports it. It reads
# experiments/results/refusal_disagreement.json, which refusal_disagreement.py writes. It uses
# the scoring code in backend/app/services (grounding.py and disagreement.py) and the demo
# document search (demo/workflows/retrieval.py).

from __future__ import annotations

# argparse reads the command-line options. statistics is used for the standard deviation.
import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any

# The three lines below add the backend folder (package "app"), the SDK source folder and the
# repo root (package "demo") to Python's search path, so the imports that follow work from
# any current folder.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# compute_nli_grounding(evidence, text) gives NLI probabilities (entailment, neutral,
# contradiction). compute_semantic_similarity(a, b) says how alike two texts are in meaning,
# from 0 to 1. load_models loads the NLI model and the embedding model (MiniLM).
from app.services.grounding import (
    compute_nli_grounding,
    compute_semantic_similarity,
    load_models,
)
# Compares one output with the outputs of earlier agents in the same trace.
from app.services.disagreement import evaluate_against_prior_agents
# A small in-memory document search (embeddings of a few demo documents). Used to rebuild the
# evidence text of an anchor.
from demo.workflows.retrieval import local_retriever

# SOURCE = the input file (written by refusal_disagreement.py). RESULTS = this script's own
# JSON output; it is also read at the start, so a rerun can continue. REPORT = the markdown
# report, written in the repo root.
SOURCE = Path(__file__).parent / "results" / "refusal_disagreement.json"
RESULTS = Path(__file__).parent / "results" / "paraphrase_stability.json"
REPORT = Path(__file__).parent.parent / "PARAPHRASE_STABILITY_REPORT.md"

# For each provider name: (base URL of its OpenAI-style API, name of the environment variable
# that holds the API key). "nvidia" is the default (see --provider in main).
PROVIDERS = {
    "nvidia": ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
}

# The paraphraser only rewrites; it never appears in a scored comparison, so it
# does not need to be one of the verifier families.
# (One model name per provider, with the same keys as PROVIDERS.)
PARAPHRASER = {
    "nvidia": "mistralai/mistral-nemotron",
    "openrouter": "deepseek/deepseek-v4-flash-0731:free",
}

# In short: a rewrite must be at least 0.85 similar in meaning to its anchor to be scored.
# Below this cosine similarity to its anchor, a rewrite is treated as a
# different statement rather than a paraphrase, and dropped. Deliberately
# stricter than disagreement.py's RELEVANCE_FLOOR of 0.40, which asks only
# whether two texts are about the same subject; here they have to mean the same
# thing. 0.85 is a judgement call, not a calibrated value -- the discarded
# count is reported so the choice can be argued with.
PARAPHRASE_FLOOR = 0.85

# The threshold evaluator.py alerts on.
# Note: that comment is out of date. No active alert rule in backend/app/services/alerting.py
# uses the disagreement score (its AGENT_DISAGREEMENT rule is switched off), and no rule uses
# the contradiction score. 0.6 is the default "is a disagreement" cutoff in disagreement.py.
# In this file it is only used in _write_report: a score counts as high when it is above 0.6.
ALERT_THRESHOLD = 0.6

# The instruction sent to the rewriting LLM. {text} is filled in (str.format) with the anchor.
PARAPHRASE_PROMPT = (
    "Rewrite the following statement so it means exactly the same thing but "
    "uses different wording and sentence structure. Keep the same stance, the "
    "same claims, and the same level of certainty. Do not add or remove "
    "information. Reply with the rewrite only, no preamble.\n\n"
    "Statement:\n{text}"
)


# Raised by ask() when the API answers normally (HTTP 200) but the reply text is empty.
class EmptyCompletion(RuntimeError):
    pass


# Sends one prompt to the LLM and returns the reply text. In: an OpenAI-style client, the model
# name, the prompt, max_tokens (the reply length limit) and retries (how many times to try
# again after a rate-limit error). Why the retries: free API tiers often answer "429" (too
# many requests), so it is better to wait and try again than to stop the whole run.
def ask(client: Any, model: str, prompt: str, *, max_tokens: int = 900, retries: int = 4) -> str:
    # Seconds to wait before the next retry. It starts at 5 and doubles each time
    # (5, 10, 20, 40 with the default of 4 retries).
    delay = 5.0
    # attempt 0 is the first try, so retries=4 means at most 5 tries.
    for attempt in range(retries + 1):
        try:
            # temperature=1.0 is normal random sampling, so asking again with the same prompt
            # usually gives a different rewrite.
            r = client.chat.completions.create(
                model=model, messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens, temperature=1.0,
            )
        except Exception as exc:
            # Retry only if the error text looks like a rate limit ("429" or the word "rate").
            # Any other error, or a rate-limit error on the last try, is raised to the caller.
            if ("429" not in str(exc) and "rate" not in str(exc).lower()) or attempt == retries:
                raise
            print(f"      (429, retry {attempt + 1}/{retries} in {delay:.0f}s)")
            time.sleep(delay)
            delay *= 2
            continue
        # The call worked. The content can be None, so "or ''" makes it an empty string first.
        text = (r.choices[0].message.content or "").strip()
        # An empty reply is an error. It is not retried; the caller decides what to do.
        if not text:
            raise EmptyCompletion(f"{model} returned 200 with empty content")
        return text
    # Never reached: every pass of the loop returns, raises or goes round again, and the last
    # pass cannot go round again. Kept as a safety net.
    raise RuntimeError("unreachable")


# In: the text to score, the evidence it is checked against, and the earlier agents' outputs as
# (agent id, output text) pairs. Out: {"contradiction": ..., "disagreement": ...}, both 0 to 1.
def score(statement: str, evidence: str, priors: list[tuple[str, str]]) -> dict[str, float]:
    """The two per-span numbers, computed exactly as the product computes them."""
    # Contradiction: the NLI model reads the evidence (premise) and the statement (hypothesis)
    # and gives the probability that the statement contradicts the evidence.
    nli = compute_nli_grounding(evidence, statement)
    # Disagreement: the statement, as the output of an agent called "verifier", is compared with
    # each earlier agent's output. The result keeps the highest contradiction probability among
    # the pairs that are about the same topic (off-topic pairs are skipped by the evaluator).
    live = evaluate_against_prior_agents(
        current_agent_id="verifier", current_output=statement, prior_outputs=priors
    )
    # Either call gives None when it could not run (for example a model is not loaded). That
    # is stored as 0.0, so a missing score looks the same as "no contradiction".
    return {
        "contradiction": round(nli.contradiction_prob, 4) if nli else 0.0,
        "disagreement": round(live.max_disagreement_score, 4) if live else 0.0,
    }


# In: the saved refusal_disagreement.json (as a dict) and n, the most anchors wanted. Out: a
# list of at most n trial dicts, each with a verifier output, its stance, its model and query.
def pick_anchors(source: dict[str, Any], n: int) -> list[dict[str, Any]]:
    """Real verifier outputs, spread across stance and across models.

    Taking the most extreme scores would stack the deck: an anchor at 0.99 has
    nowhere to go but down. These are sampled across the range instead, one per
    (model, stance) combination, so the spread measured is typical rather than
    selected.
    """
    # Step 1: keep only the trials that can serve as anchors. The live disagreement score must
    # exist. The verifier's stance must be a clear "accept" or "refuse" (not "unclear"). There
    # must be an output text. And its query must be a key of context_cache, which holds the
    # saved researcher and retriever outputs: they are the "prior agents" the anchor is scored
    # against.
    trials = [
        t for t in source["trials"]
        if t.get("disagreement_live") is not None
        and t.get("stance") in ("accept", "refuse")
        and t.get("verifier_output")
        and t["query"] in source.get("context_cache", {})
    ]
    # Step 2: go through the trials sorted by (model name, stance). Keep the first trial of each
    # (model, stance) pair and stop when n are picked. The sort is alphabetical, so with a small
    # n the models that come first in the alphabet are the ones used.
    seen: set[tuple[str, str]] = set()
    picked = []
    for t in sorted(trials, key=lambda x: (x["verifier_model"], x["stance"])):
        key = (t["verifier_model"], t["stance"])
        if key in seen:
            continue
        seen.add(key)
        picked.append(t)
        if len(picked) >= n:
            break
    return picked


# Runs the whole experiment. Out: the exit code. 0 = done, 2 = something needed is missing (the
# input file or the API key). Steps: read options, read the saved inputs, load the models, make
# and score the rewrites (unless --report-only), then write the report.
def main() -> int:
    # Step 1: read the command-line options. --anchors = how many anchors to use,
    # --paraphrases = how many rewrites to ask for per anchor, --provider = which API to call,
    # --report-only = do not call the API; only rebuild the report from the saved JSON.
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--anchors", type=int, default=6)
    ap.add_argument("--paraphrases", type=int, default=8)
    ap.add_argument("--provider", choices=sorted(PROVIDERS), default="nvidia")
    ap.add_argument("--report-only", action="store_true")
    args = ap.parse_args()

    # The API address and the name of the key variable for the chosen provider.
    base_url, key_env = PROVIDERS[args.provider]

    # Step 2: read the input file. Without it there are no anchors, so stop with code 2.
    if not SOURCE.exists():
        print(f"{SOURCE} not found; run refusal_disagreement.py first", file=sys.stderr)
        return 2
    source = json.load(open(SOURCE, "r", encoding="utf-8"))

    # Step 3: read this script's own earlier results, if there are any, so a rerun continues
    # where the last one stopped. Otherwise start with an empty list of anchors.
    state: dict[str, Any] = (
        json.load(open(RESULTS, "r", encoding="utf-8")) if RESULTS.exists()
        else {"anchors": []}
    )

    # Step 4: load the two scoring models and wait until they are ready (sync=True).
    # use_onnx=False picks the PyTorch NLI model. cache_dir is where the model files are kept:
    # the folder in AGENTPULSE_MODEL_CACHE_DIR, or ./models if that is not set. This also runs
    # with --report-only, although the report step does not use the models.
    load_models(
        use_onnx=False, sync=True,
        cache_dir=os.getenv("AGENTPULSE_MODEL_CACHE_DIR", "./models"),
    )

    # Step 5: make and score the rewrites. Skipped with --report-only.
    if not args.report_only:
        # The API key is read from the environment variable named above. Stop with code 2 if
        # it is not set.
        key = os.getenv(key_env)
        if not key:
            print(f"{key_env} is not set.", file=sys.stderr)
            return 2
        # openai is imported only here, so --report-only works without it. The same client
        # class serves both providers because both offer an OpenAI-style API.
        from openai import OpenAI
        client = OpenAI(base_url=base_url, api_key=key)

        # The anchor texts that are already in the saved results. They are skipped below, so a
        # rerun does not repeat the work that is done (and does not spend API calls on it).
        done = {a["anchor_text"] for a in state["anchors"]}
        for t in pick_anchors(source, args.anchors):
            if t["verifier_output"] in done:
                continue
            # Rebuild the evidence the verifier was given: the 3 demo documents that match the
            # query best, each written as "title: content", with a blank line between them.
            # (refusal_disagreement.py builds its evidence the same way.)
            docs = local_retriever.search(t["query"], top_k=3)
            evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
            # The earlier agents of the trace are the saved "researcher" and "retriever"
            # outputs for this query. They stay the same for every rewrite of this anchor.
            ctx = source["context_cache"][t["query"]]
            priors = [("researcher", ctx["researcher"]), ("retriever", ctx["retriever"])]

            # Score the original text first. These two numbers are what the rewrites are
            # compared with.
            anchor_scores = score(t["verifier_output"], evidence, priors)
            print(f"\nanchor [{t['stance']}] {t['verifier_model']}")
            print(f"  disagreement {anchor_scores['disagreement']:.3f}  "
                  f"contradiction {anchor_scores['contradiction']:.3f}")

            # One entry per rewrite received (a failed call adds none): its text, its similarity
            # to the anchor and, if it was kept, its two scores.
            variants = []
            for i in range(args.paraphrases):
                # Ask the LLM for one rewrite. If the call fails (after its retries), print
                # the error and go on with the next rewrite; this one gets no entry.
                try:
                    p = ask(client, PARAPHRASER[args.provider],
                            PARAPHRASE_PROMPT.format(text=t["verifier_output"]))
                except Exception as exc:
                    print(f"    paraphrase {i} failed: {type(exc).__name__}: {exc}")
                    continue
                # How close in meaning is the rewrite to the anchor? It is the cosine
                # similarity of their MiniLM embeddings, from 0 to 1. If it could not be
                # computed (None), 0.0 is stored, the rewrite is not discarded, and the print
                # of `sim:.3f` below raises a TypeError, which stops the script.
                sim = compute_semantic_similarity(t["verifier_output"], p)
                rec = {"text": p, "similarity_to_anchor": round(sim or 0.0, 4)}
                # Too far from the anchor in meaning: it is not a paraphrase. It is kept in the
                # file, marked "discarded", but it is not scored.
                if sim is not None and sim < PARAPHRASE_FLOOR:
                    rec["discarded"] = "below paraphrase floor"
                    print(f"    [{i}] discarded, similarity {sim:.3f}")
                else:
                    # Score the rewrite exactly like the anchor and add the two numbers
                    # ("contradiction" and "disagreement") to its record.
                    rec.update(score(p, evidence, priors))
                    print(f"    [{i}] sim {sim:.3f}  disagreement {rec['disagreement']:.3f}  "
                          f"contradiction {rec['contradiction']:.3f}")
                variants.append(rec)

            # Save this anchor with all its rewrites, and write the whole JSON file now (after
            # every anchor), so the work is kept if the run is stopped later.
            state["anchors"].append({
                "anchor_text": t["verifier_output"],
                "query": t["query"],
                "stance": t["stance"],
                "verifier_model": t["verifier_model"],
                "anchor": anchor_scores,
                "variants": variants,
            })
            RESULTS.parent.mkdir(parents=True, exist_ok=True)
            json.dump(state, open(RESULTS, "w", encoding="utf-8"), indent=2)

    # Step 6: write the report from everything saved so far (this runs with --report-only too).
    _write_report(state)
    return 0


# Turns the saved results into the markdown report and prints one line per table row.
# In: the saved results, {"anchors": [...]}. Out: nothing (it writes REPORT).
# Words used here: "spread" = the highest minus the lowest score among the rewrites of one
# anchor. "flipped" = how many rewrites landed on the other side of ALERT_THRESHOLD than the
# anchor did.
def _write_report(state: dict[str, Any]) -> None:
    # Step 1: build one table row for each pair (anchor, signal). Only the kept rewrites (those
    # not marked "discarded") count. An anchor with no kept rewrite is skipped.
    rows = []
    for a in state["anchors"]:
        kept = [v for v in a["variants"] if "discarded" not in v]
        if not kept:
            continue
        for field in ("disagreement", "contradiction"):
            # xs = this signal's score for each kept rewrite; anchor_val = the anchor's score.
            xs = [v[field] for v in kept]
            anchor_val = a["anchor"][field]
            # A rewrite "flips" when it is above the threshold and the anchor is not, or the
            # other way round. The two True/False values differ, so the sum counts it.
            crossed = sum(
                1 for x in xs
                if (x > ALERT_THRESHOLD) != (anchor_val > ALERT_THRESHOLD)
            )
            # Row columns: n = how many rewrites were kept; min, max and spread of their
            # scores; stdev = the population standard deviation (pstdev divides by n, not by
            # n - 1; it is 0.0 with a single rewrite); flipped = the count above;
            # min_similarity = the lowest similarity to the anchor among the kept rewrites.
            # "model" is the part of the model id before the "/" (the model's owner).
            rows.append({
                "stance": a["stance"],
                "model": a["verifier_model"].split("/")[0],
                "signal": field,
                "anchor": anchor_val,
                "n": len(xs),
                "min": round(min(xs), 4),
                "max": round(max(xs), 4),
                "spread": round(max(xs) - min(xs), 4),
                "stdev": round(statistics.pstdev(xs), 4) if len(xs) > 1 else 0.0,
                "flipped": crossed,
                "min_similarity": round(min(v["similarity_to_anchor"] for v in kept), 4),
            })

    # Step 2: two counts for the top of the report: the rewrites dropped for being too far from
    # their anchor, and all rewrites received (kept and dropped, over all anchors).
    discarded = sum(1 for a in state["anchors"] for v in a["variants"] if "discarded" in v)
    total = sum(len(a["variants"]) for a in state["anchors"])

    # Step 3: build the results table as markdown text. With no rows there is nothing to show.
    if not rows:
        body = "No scored paraphrases yet.\n"
    else:
        body = "| stance | model | signal | anchor | n | min | max | spread | sd | flipped | min sim |\n"
        body += "| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n"
        for r in rows:
            body += (f"| {r['stance']} | {r['model']} | {r['signal']} | {r['anchor']} | {r['n']} | "
                     f"{r['min']} | {r['max']} | **{r['spread']}** | {r['stdev']} | "
                     f"**{r['flipped']}** | {r['min_similarity']} |\n")
        # Two summary lines under the table: the row with the widest spread, and the total
        # number of flips over all rows.
        worst = max(rows, key=lambda r: r["spread"])
        flips = sum(r["flipped"] for r in rows)
        body += (
            f"\n**Widest spread:** {worst['spread']} on {worst['signal']}, from an anchor at "
            f"{worst['anchor']} ({worst['stance']}, {worst['model']}).\n\n"
            f"**Alert flips:** {flips} paraphrase-signal pairs landed on the opposite side of the "
            f"{ALERT_THRESHOLD} alert threshold from their anchor, while meaning the same thing.\n"
        )

    # Step 4: the full report text. It is an f-string, so each {...} part is replaced by a
    # value (the counts above and the table text in `body`). The rest is fixed text.
    # Known slip: the "Method" part says "rewritten {PARAPHRASER} times". PARAPHRASER is the
    # dict of model names, not a count, so the written report shows that dict in that place.
    # The number of rewrites per anchor is the --paraphrases option.
    content = f"""# Paraphrase stability

**Anchors:** {len(state['anchors'])}  **Paraphrases:** {total} ({discarded} discarded below the {PARAPHRASE_FLOOR} similarity floor)

## Question

24.9.2 established that these signals separate well in aggregate and move
sharply between near-equivalent statements. A per-span alert depends on the
second property. This measures it directly: hold the evidence and the prior
agents fixed, vary only the wording of the agent's output, and look at the
spread.

## Method

Anchors are real verifier outputs from `refusal_disagreement.json`, sampled one
per (model, stance) rather than by score, so the spread measured is typical
rather than selected. Each is rewritten {PARAPHRASER} times with meaning
preserved, and every rewrite is checked against its anchor with the product's
own embedding model. Rewrites below {PARAPHRASE_FLOOR} cosine similarity are
discarded as no longer paraphrases and counted above.

Scoring is identical to the anchor's: contradiction against the same evidence,
disagreement against the same prior agents, same NLI model.

## Results

{body}
## Limitations

- **{PARAPHRASE_FLOOR} is a judgement call**, not a calibrated threshold. It is
  stricter than the 0.40 relevance floor `disagreement.py` uses, because that
  one asks whether two texts share a subject and this one asks whether they
  mean the same thing. The discarded count is reported so the choice can be
  argued with.
- **A paraphraser is a model with habits.** Rewrites come from one model, so
  systematic quirks in how it rephrases are inside these numbers.
- **This measures the evaluator, not the ingest path** — the same caveat 24.5
  records about the ablation.
- Anchors are verifier outputs only. Nothing here says whether analyst or
  writer spans behave the same way.

*Data:* `experiments/results/paraphrase_stability.json`
"""
    # Step 5: save the report (an older file is overwritten) and print one summary line per
    # table row.
    REPORT.write_text(content, encoding="utf-8")
    print(f"\nreport -> {REPORT.name}")
    for r in rows:
        print(f"  {r['stance']:<7} {r['model']:<12} {r['signal']:<14} "
              f"anchor {r['anchor']:<7} spread {r['spread']:<7} flipped {r['flipped']}/{r['n']}")


# Runs only when the file is started directly. SystemExit(main()) makes main's return value
# the exit code of the program.
if __name__ == "__main__":
    raise SystemExit(main())
