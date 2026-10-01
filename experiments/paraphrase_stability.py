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

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.grounding import (
    compute_nli_grounding,
    compute_semantic_similarity,
    load_models,
)
from app.services.disagreement import evaluate_against_prior_agents
from demo.workflows.retrieval import local_retriever

SOURCE = Path(__file__).parent / "results" / "refusal_disagreement.json"
RESULTS = Path(__file__).parent / "results" / "paraphrase_stability.json"
REPORT = Path(__file__).parent.parent / "PARAPHRASE_STABILITY_REPORT.md"

PROVIDERS = {
    "nvidia": ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
}

# The paraphraser only rewrites; it never appears in a scored comparison, so it
# does not need to be one of the verifier families.
PARAPHRASER = {
    "nvidia": "mistralai/mistral-nemotron",
    "openrouter": "deepseek/deepseek-v4-flash-0731:free",
}

# Below this cosine similarity to its anchor, a rewrite is treated as a
# different statement rather than a paraphrase, and dropped. Deliberately
# stricter than disagreement.py's RELEVANCE_FLOOR of 0.40, which asks only
# whether two texts are about the same subject; here they have to mean the same
# thing. 0.85 is a judgement call, not a calibrated value -- the discarded
# count is reported so the choice can be argued with.
PARAPHRASE_FLOOR = 0.85

# The threshold evaluator.py alerts on.
ALERT_THRESHOLD = 0.6

PARAPHRASE_PROMPT = (
    "Rewrite the following statement so it means exactly the same thing but "
    "uses different wording and sentence structure. Keep the same stance, the "
    "same claims, and the same level of certainty. Do not add or remove "
    "information. Reply with the rewrite only, no preamble.\n\n"
    "Statement:\n{text}"
)


class EmptyCompletion(RuntimeError):
    pass


def ask(client: Any, model: str, prompt: str, *, max_tokens: int = 900, retries: int = 4) -> str:
    delay = 5.0
    for attempt in range(retries + 1):
        try:
            r = client.chat.completions.create(
                model=model, messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens, temperature=1.0,
            )
        except Exception as exc:
            if ("429" not in str(exc) and "rate" not in str(exc).lower()) or attempt == retries:
                raise
            print(f"      (429, retry {attempt + 1}/{retries} in {delay:.0f}s)")
            time.sleep(delay)
            delay *= 2
            continue
        text = (r.choices[0].message.content or "").strip()
        if not text:
            raise EmptyCompletion(f"{model} returned 200 with empty content")
        return text
    raise RuntimeError("unreachable")


def score(statement: str, evidence: str, priors: list[tuple[str, str]]) -> dict[str, float]:
    """The two per-span numbers, computed exactly as the product computes them."""
    nli = compute_nli_grounding(evidence, statement)
    live = evaluate_against_prior_agents(
        current_agent_id="verifier", current_output=statement, prior_outputs=priors
    )
    return {
        "contradiction": round(nli.contradiction_prob, 4) if nli else 0.0,
        "disagreement": round(live.max_disagreement_score, 4) if live else 0.0,
    }


def pick_anchors(source: dict[str, Any], n: int) -> list[dict[str, Any]]:
    """Real verifier outputs, spread across stance and across models.

    Taking the most extreme scores would stack the deck: an anchor at 0.99 has
    nowhere to go but down. These are sampled across the range instead, one per
    (model, stance) combination, so the spread measured is typical rather than
    selected.
    """
    trials = [
        t for t in source["trials"]
        if t.get("disagreement_live") is not None
        and t.get("stance") in ("accept", "refuse")
        and t.get("verifier_output")
        and t["query"] in source.get("context_cache", {})
    ]
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--anchors", type=int, default=6)
    ap.add_argument("--paraphrases", type=int, default=8)
    ap.add_argument("--provider", choices=sorted(PROVIDERS), default="nvidia")
    ap.add_argument("--report-only", action="store_true")
    args = ap.parse_args()

    base_url, key_env = PROVIDERS[args.provider]

    if not SOURCE.exists():
        print(f"{SOURCE} not found; run refusal_disagreement.py first", file=sys.stderr)
        return 2
    source = json.load(open(SOURCE, "r", encoding="utf-8"))

    state: dict[str, Any] = (
        json.load(open(RESULTS, "r", encoding="utf-8")) if RESULTS.exists()
        else {"anchors": []}
    )

    load_models(
        use_onnx=False, sync=True,
        cache_dir=os.getenv("AGENTPULSE_MODEL_CACHE_DIR", "./models"),
    )

    if not args.report_only:
        key = os.getenv(key_env)
        if not key:
            print(f"{key_env} is not set.", file=sys.stderr)
            return 2
        from openai import OpenAI
        client = OpenAI(base_url=base_url, api_key=key)

        done = {a["anchor_text"] for a in state["anchors"]}
        for t in pick_anchors(source, args.anchors):
            if t["verifier_output"] in done:
                continue
            docs = local_retriever.search(t["query"], top_k=3)
            evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
            ctx = source["context_cache"][t["query"]]
            priors = [("researcher", ctx["researcher"]), ("retriever", ctx["retriever"])]

            anchor_scores = score(t["verifier_output"], evidence, priors)
            print(f"\nanchor [{t['stance']}] {t['verifier_model']}")
            print(f"  disagreement {anchor_scores['disagreement']:.3f}  "
                  f"contradiction {anchor_scores['contradiction']:.3f}")

            variants = []
            for i in range(args.paraphrases):
                try:
                    p = ask(client, PARAPHRASER[args.provider],
                            PARAPHRASE_PROMPT.format(text=t["verifier_output"]))
                except Exception as exc:
                    print(f"    paraphrase {i} failed: {type(exc).__name__}: {exc}")
                    continue
                sim = compute_semantic_similarity(t["verifier_output"], p)
                rec = {"text": p, "similarity_to_anchor": round(sim or 0.0, 4)}
                if sim is not None and sim < PARAPHRASE_FLOOR:
                    rec["discarded"] = "below paraphrase floor"
                    print(f"    [{i}] discarded, similarity {sim:.3f}")
                else:
                    rec.update(score(p, evidence, priors))
                    print(f"    [{i}] sim {sim:.3f}  disagreement {rec['disagreement']:.3f}  "
                          f"contradiction {rec['contradiction']:.3f}")
                variants.append(rec)

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

    _write_report(state)
    return 0


def _write_report(state: dict[str, Any]) -> None:
    rows = []
    for a in state["anchors"]:
        kept = [v for v in a["variants"] if "discarded" not in v]
        if not kept:
            continue
        for field in ("disagreement", "contradiction"):
            xs = [v[field] for v in kept]
            anchor_val = a["anchor"][field]
            crossed = sum(
                1 for x in xs
                if (x > ALERT_THRESHOLD) != (anchor_val > ALERT_THRESHOLD)
            )
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

    discarded = sum(1 for a in state["anchors"] for v in a["variants"] if "discarded" in v)
    total = sum(len(a["variants"]) for a in state["anchors"])

    if not rows:
        body = "No scored paraphrases yet.\n"
    else:
        body = "| stance | model | signal | anchor | n | min | max | spread | sd | flipped | min sim |\n"
        body += "| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n"
        for r in rows:
            body += (f"| {r['stance']} | {r['model']} | {r['signal']} | {r['anchor']} | {r['n']} | "
                     f"{r['min']} | {r['max']} | **{r['spread']}** | {r['stdev']} | "
                     f"**{r['flipped']}** | {r['min_similarity']} |\n")
        worst = max(rows, key=lambda r: r["spread"])
        flips = sum(r["flipped"] for r in rows)
        body += (
            f"\n**Widest spread:** {worst['spread']} on {worst['signal']}, from an anchor at "
            f"{worst['anchor']} ({worst['stance']}, {worst['model']}).\n\n"
            f"**Alert flips:** {flips} paraphrase-signal pairs landed on the opposite side of the "
            f"{ALERT_THRESHOLD} alert threshold from their anchor, while meaning the same thing.\n"
        )

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
    REPORT.write_text(content, encoding="utf-8")
    print(f"\nreport -> {REPORT.name}")
    for r in rows:
        print(f"  {r['stance']:<7} {r['model']:<12} {r['signal']:<14} "
              f"anchor {r['anchor']:<7} spread {r['spread']:<7} flipped {r['flipped']}/{r['n']}")


if __name__ == "__main__":
    raise SystemExit(main())
