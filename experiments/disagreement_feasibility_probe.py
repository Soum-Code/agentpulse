"""Feasibility probe: does DEBATE contain genuine textual contradictions?

This is NOT a benchmark. It answers one cheap, pre-registered question before
any ingestion pipeline is built:

    Are there enough genuine textual contradictions between agent outputs in
    `Multi-Agent-LLMs/DEBATE` for AgentPulse's text-level disagreement detector
    to be scored against?

WHY THE QUESTION IS OPEN. Corpus inspection established that DEBATE is real
external multi-agent data (distinct agent identities, shared task, multi-turn
traces) but that its shipped labels cannot serve as disagreement ground truth:

  1. `agreement` is a procedural vote in the MALLM harness -- it means "keep
     debating", not "I contradict you". Observed: an agent writes "I agree with
     the Snow White's Dwarfs Representative..." while tagged [DISAGREE].
  2. `solution` is a single letter (every one of the 145 configs asks
     "Answer A) Yes or B) No"). The letter flips WITHOUT the message text
     expressing the flip. A text-level detector reading those messages would
     correctly find no contradiction while the label says there is one.

That is the same failure that invalidated the tool-claim tier-1 target: the
label is not derivable from the input the detector sees.

WHAT THIS PROBE DOES INSTEAD. It uses `solution` mismatch only as a SAMPLING
signal -- to oversample turns most likely to contain contradiction -- and never
as a label. Labels are assigned independently, from the two agent messages and
the shared task alone.

BLINDING. The blinded file deliberately omits, for every pair:
  - `solution` values          (the sampling signal)
  - `agreement` flags          (the procedural vote)
  - which sampling group the pair came from
  - any AgentPulse output      (the detector is not run in this script at all)
Pairs are shuffled before writing so ordering cannot encode the group.

One further leak is closed here. MALLM instructs agents to terminate messages
with a literal `[AGREE]` / `[DISAGREE]` token, so the label is embedded in the
message text itself. Those tokens are stripped. They are genuinely
agent-produced, but they are a harness protocol artifact that states the answer
outright; leaving them in would let both an annotator and a detector read the
label off the input. `strip_ratio` in the key file records how often this fired.

PRE-REGISTERED STOP RULE. Fewer than MIN_POSITIVES genuine contradictions in
the 40 labelled pairs => the corpus cannot support a precision/recall
benchmark. That is reported as a negative feasibility result. No pipeline is
built on a corpus that cannot score the detector.

The control group is load-bearing: without it, a low positive count in the
mismatch group is uninterpretable -- it could mean the corpus lacks
contradictions, or that the sampling signal is worthless. Comparing the two
groups separates those.

DATA ACCESS. Uses the datasets-server rows API rather than the HfFileSystem +
pyarrow projection used by `external_exgentic_ingest.py`. Deliberate: this
probe needs a few rows from each of many configs, and the `critical_*` configs
are ~244 MB each. Paged row reads move a few MB total; column projection over
parquet shards would move gigabytes.

Outputs:
- experiments/results/disagreement_probe_blinded.json  (label this)
- experiments/results/disagreement_probe_key.json      (do not open until labelled)
"""

# WHAT THIS FILE IS FOR
# A one-off experiment script, not part of the product. It reads debates between several LLM
# agents from the public DEBATE dataset and builds pairs of agent messages from the same
# turn. It then picks up to 40 pairs (20 "mismatch" and 20 "control") and writes them to a
# file for a person to label as CONTRADICTION, NO_CONTRADICTION or UNCLEAR. The goal is to
# find out whether the dataset holds enough real contradictions to test the disagreement
# detector. The detector is NOT run here.
#
# HOW IT FITS IN
# It talks to the Hugging Face datasets-server over plain HTTP (urllib, no extra library).
# Later scripts use it: disagreement_alarm_rate_pilot.py and
# disagreement_truncation_diagnosis.py import fetch, pick_configs, extract_pairs, DATASET_ID
# and ROWS_API from here, and disagreement_power_analysis.py reads the key file it writes.

from __future__ import annotations

import json
import random
# re = regular expressions, for finding text patterns.
import re
import sys
import time
# urllib is used to download rows from the web (urlencode builds the ?a=1&b=2 query text).
import urllib.parse
import urllib.request
# defaultdict is a dict that creates an empty list the first time a new key is used.
from collections import defaultdict
# combinations(list, 2) gives every pair of items from the list, each pair once.
from itertools import combinations
from pathlib import Path
from typing import Any

# The dataset, and two datasets-server web addresses: SPLITS_API lists the dataset's
# "configs" (named sub-datasets), ROWS_API returns rows of one config.
DATASET_ID = "Multi-Agent-LLMs/DEBATE"
DATASET_URL = f"https://huggingface.co/datasets/{DATASET_ID}"
ROWS_API = "https://datasets-server.huggingface.co/rows"
SPLITS_API = "https://datasets-server.huggingface.co/splits"

RESULTS = Path(__file__).parent / "results"
BLINDED_PATH = RESULTS / "disagreement_probe_blinded.json"
KEY_PATH = RESULTS / "disagreement_probe_key.json"

# SEED: fixed so the same rows and pairs are drawn on every run.
# N_MISMATCH / N_CONTROL: how many pairs to draw for each of the two groups.
# MIN_POSITIVES: the stop rule from the module docstring.
# ROWS_PER_CONFIG: rows read from each config. N_CONFIGS: configs to sample in total.
SEED = 20260827
N_MISMATCH = 20
N_CONTROL = 20
MIN_POSITIVES = 8          # pre-registered stop rule
ROWS_PER_CONFIG = 20
N_CONFIGS = 12             # spread across all 3 task families

# MALLM protocol token that states the agreement label outright. See BLINDING.
# The pattern matches [AGREE] or [DISAGREE] in any letter case, with optional spaces inside
# the brackets and an optional full stop right after the closing bracket.
VOTE_TOKEN = re.compile(r"\[\s*(?:DIS)?AGREE\s*\]\.?", re.I)

# Message shorter than this is pure protocol noise, not an output to compare.
MIN_MESSAGE_CHARS = 40


# Downloads one JSON answer from a web address. In: the address and its query parameters.
# Out: the decoded JSON as a dict. Raises RuntimeError if every attempt fails.
def fetch(url: str, params: dict[str, Any], timeout: int = 300,
          retries: int = 4) -> dict[str, Any]:
    """GET with backoff. The datasets-server returns transient 502s; without a
    retry those abort a run midway and the sampling has to start over. Retrying
    does not affect reproducibility -- the seed and sampling logic are
    unchanged, so the same rows and pairs come back."""
    query = urllib.parse.urlencode(params)
    last: Exception | None = None
    # Try up to `retries` times (timeout = seconds to wait for one answer). After a
    # failed try, wait 3 s, then 6 s, then 12 s (the wait doubles); no wait after the last.
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(f"{url}?{query}", timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - transient network/gateway errors
            last = exc
            if attempt < retries - 1:
                time.sleep(2 ** attempt * 3)
    raise RuntimeError(f"fetch failed after {retries} attempts: {last}")


# In: a seeded random generator. Out: a sorted list of config names, with up to the same
# number of configs taken from each family (a family = the part of a config name before the
# first "_"). The same generator state always gives the same list.
def pick_configs(rng: random.Random) -> list[str]:
    """Spread the sample across all three task families and many paradigms.

    Sampling one family would confound "this corpus lacks contradictions" with
    "this task type lacks contradictions".
    """
    # Step 1: ask the server for every (config, split) of the dataset; keep each config
    # name once and drop names that start with "_".
    splits = fetch(SPLITS_API, {"dataset": DATASET_ID})
    configs = sorted({s["config"] for s in splits["splits"]})
    configs = [c for c in configs if not c.startswith("_")]

    # Step 2: group the config names by family.
    by_family: dict[str, list[str]] = defaultdict(list)
    for config in configs:
        by_family[config.split("_")[0]].append(config)

    # Step 3: take N_CONFIGS // (number of families) random configs from each family, but
    # at least 1 per family and never more than the family has.
    chosen: list[str] = []
    per_family = max(1, N_CONFIGS // len(by_family))
    for family in sorted(by_family):
        chosen.extend(rng.sample(by_family[family], min(per_family, len(by_family[family]))))
    return sorted(chosen)


# Removes the [AGREE] / [DISAGREE] tokens from a message and trims the ends. A missing
# message (None) becomes an empty string.
def clean(message: Any) -> str:
    return VOTE_TOKEN.sub("", str(message or "")).strip()


# In: one dataset row (one debate), its config name and its row number. Out: a list of
# pair dicts; empty if the debate has no task text or no messages.
def extract_pairs(row: dict[str, Any], config: str, row_index: int) -> list[dict[str, Any]]:
    """All within-turn, cross-agent output pairs from one debate."""
    # Step 1: "globalMemory" is the list of messages in the debate; "instruction" is the
    # task the agents were given. Without both there is nothing to compare.
    memory = row.get("globalMemory") or []
    instruction = str(row.get("instruction") or "").strip()
    if not instruction or not memory:
        return []

    # Step 2: clean each message and group the messages by turn. Messages that are too
    # short, or that have no agent id, are dropped. "raw_message" keeps the original text
    # so main() can later count how often a vote token was removed.
    by_turn: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for entry in memory:
        message = clean(entry.get("message"))
        if len(message) < MIN_MESSAGE_CHARS or not entry.get("agent_id"):
            continue
        by_turn[entry.get("turn")].append({
            "agent_id": entry.get("agent_id"),
            "persona": entry.get("persona"),
            "message": message,
            "raw_message": str(entry.get("message") or ""),
            "solution": str(entry.get("solution") or "").strip(),
            "agreement": entry.get("agreement"),
            "message_id": entry.get("message_id"),
        })

    # Step 3: inside each turn, pair up every two messages. "solution_mismatch" is True when
    # both agents gave a solution and the two differ. It is only used to oversample pairs
    # that may disagree; it is never used as a label.
    pairs = []
    for turn, entries in by_turn.items():
        for a, b in combinations(entries, 2):
            # Same agent talking across turns is self-consistency, not
            # inter-agent disagreement -- a different question entirely.
            if a["agent_id"] == b["agent_id"]:
                continue
            # Two different agents with exactly the same text give nothing to compare.
            if a["message"] == b["message"]:
                continue
            pairs.append({
                "config": config,
                "family": config.split("_")[0],
                "row_index": row_index,
                "turn": turn,
                "instruction": instruction,
                "a": a,
                "b": b,
                "solution_mismatch": bool(a["solution"] and b["solution"]
                                          and a["solution"] != b["solution"]),
            })
    return pairs


# Runs the whole probe. No input: it downloads the data itself, draws the pairs with the
# fixed SEED, and writes the blinded file and the key file to experiments/results/.
def main() -> None:
    rng = random.Random(SEED)
    print("=" * 78)
    print("DISAGREEMENT FEASIBILITY PROBE — does DEBATE contain real contradictions?")
    print("=" * 78)

    # Step 1: choose which configs to read.
    configs = pick_configs(rng)
    print(f"\nsampling {len(configs)} configs x {ROWS_PER_CONFIG} rows")

    # Step 2: download the first ROWS_PER_CONFIG rows of each config and turn every row into
    # pairs. If a download fails, skip that config and carry on with the others.
    all_pairs: list[dict[str, Any]] = []
    rows_seen = 0
    for config in configs:
        try:
            payload = fetch(ROWS_API, {
                "dataset": DATASET_ID, "config": config,
                "split": "train", "offset": 0, "length": ROWS_PER_CONFIG,
            })
        except Exception as exc:
            print(f"  [SKIP ] {config[:52]:52s} {type(exc).__name__}")
            continue
        rows = payload.get("rows", [])
        rows_seen += len(rows)
        config_pairs: list[dict[str, Any]] = []
        for item in rows:
            config_pairs.extend(extract_pairs(item["row"], config, item.get("row_idx", -1)))
        all_pairs.extend(config_pairs)
        mismatched = sum(p["solution_mismatch"] for p in config_pairs)
        print(f"  [READ ] {config[:52]:52s} rows={len(rows):3d} "
              f"pairs={len(config_pairs):5d} mismatch={mismatched:4d}")

    if not all_pairs:
        raise SystemExit("No pairs extracted — aborting rather than emitting an empty probe.")

    # Step 3: find the pairs whose solutions differ. base_rate is their share of all pairs.
    mismatch_pool = [p for p in all_pairs if p["solution_mismatch"]]
    base_rate = len(mismatch_pool) / len(all_pairs)
    print(f"\ntotal pairs={len(all_pairs)} from {rows_seen} rows")
    print(f"solution-mismatch pairs={len(mismatch_pool)} "
          f"(natural base rate {base_rate:.2%})")

    if len(mismatch_pool) < N_MISMATCH:
        print(f"\n  NOTE: only {len(mismatch_pool)} mismatch pairs available; "
              f"requested {N_MISMATCH}. Using all of them.")

    # Step 4: draw up to N_MISMATCH pairs from the mismatch pool (all of them if fewer
    # exist). id(p) is the identity of the pair object; it remembers which pairs are taken.
    mismatch_sample = rng.sample(mismatch_pool, min(N_MISMATCH, len(mismatch_pool)))
    chosen_keys = {id(p) for p in mismatch_sample}
    # Controls are drawn from the NATURAL distribution, not from non-mismatch
    # pairs only. A control that happens to be a mismatch is a valid draw;
    # filtering those out would make the control group unrepresentative.
    control_pool = [p for p in all_pairs if id(p) not in chosen_keys]
    control_sample = rng.sample(control_pool, min(N_CONTROL, len(control_pool)))

    # Step 5: label each pair with its group, then shuffle so the order does not reveal it.
    probe = ([{"group": "mismatch", **p} for p in mismatch_sample]
             + [{"group": "control", **p} for p in control_sample])
    rng.shuffle(probe)

    # Step 6: split each pair into a blinded part (task and the two messages) and a key part
    # (everything that must stay hidden while labelling). Case ids run P001, P002, ... in the
    # shuffled order. `stripped` counts pairs where a vote token was found in a raw message.
    blinded, key = [], []
    stripped = 0
    for index, pair in enumerate(probe, start=1):
        case_id = f"P{index:03d}"
        if VOTE_TOKEN.search(pair["a"]["raw_message"]) or VOTE_TOKEN.search(pair["b"]["raw_message"]):
            stripped += 1
        blinded.append({
            "case_id": case_id,
            "task": pair["instruction"],
            "agent_a": {"name": pair["a"]["persona"], "output": pair["a"]["message"]},
            "agent_b": {"name": pair["b"]["persona"], "output": pair["b"]["message"]},
        })
        key.append({
            "case_id": case_id,
            "group": pair["group"],
            "solution_mismatch": pair["solution_mismatch"],
            "config": pair["config"],
            "family": pair["family"],
            "row_index": pair["row_index"],
            "turn": pair["turn"],
            "a": {"agent_id": pair["a"]["agent_id"], "persona": pair["a"]["persona"],
                  "solution": pair["a"]["solution"], "agreement": pair["a"]["agreement"],
                  "message_id": pair["a"]["message_id"]},
            "b": {"agent_id": pair["b"]["agent_id"], "persona": pair["b"]["persona"],
                  "solution": pair["b"]["solution"], "agreement": pair["b"]["agreement"],
                  "message_id": pair["b"]["message_id"]},
        })

    # Step 7: write the blinded file (the labelling instructions plus the cases) and the key
    # file (settings, counts, the stop rule, the blinding steps and the hidden facts).
    RESULTS.mkdir(parents=True, exist_ok=True)
    BLINDED_PATH.write_text(json.dumps({
        "instructions": (
            "Label each case using ONLY `task`, `agent_a.output` and `agent_b.output`. "
            "Question: do the two outputs make claims that genuinely contradict each "
            "other? Procedural remarks ('I need to re-evaluate', 'let us continue') are "
            "NOT contradictions. Restating the same position in different words is NOT a "
            "contradiction. Label CONTRADICTION / NO_CONTRADICTION / UNCLEAR."),
        "cases": blinded,
    }, indent=2), encoding="utf-8")

    KEY_PATH.write_text(json.dumps({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "dataset": {"id": DATASET_ID, "url": DATASET_URL},
        "purpose": "feasibility probe only; NOT a benchmark and NOT a labelled dataset",
        "seed": SEED,
        "configs_sampled": configs,
        "rows_read": rows_seen,
        "pairs_extracted": len(all_pairs),
        "mismatch_pairs_available": len(mismatch_pool),
        "solution_mismatch_base_rate": round(base_rate, 6),
        "vote_token_strip_ratio": round(stripped / len(probe), 4),
        "stop_rule": {
            "min_positives": MIN_POSITIVES,
            "pre_registered": True,
            "action_if_below": "report negative feasibility result; do not build pipeline",
        },
        "blinding": [
            "solution values withheld from the blinded file",
            "agreement flags withheld from the blinded file",
            "sampling group withheld from the blinded file",
            "pairs shuffled so ordering cannot encode the group",
            "MALLM [AGREE]/[DISAGREE] protocol tokens stripped from message text",
            "AgentPulse detector is not run in this script",
        ],
        "cases": key,
    }, indent=2), encoding="utf-8")

    # Step 8: tell the user what was written and which stop rule applies to the labels.
    print(f"\n  {len(blinded)} pairs written "
          f"({sum(c['group'] == 'mismatch' for c in key)} mismatch, "
          f"{sum(c['group'] == 'control' for c in key)} control)")
    print(f"  [AGREE]/[DISAGREE] token stripped in {stripped}/{len(probe)} pairs")
    print(f"\n  blinded (label this) : {BLINDED_PATH}")
    print(f"  key (do not open yet): {KEY_PATH}")
    print(f"\n  stop rule: < {MIN_POSITIVES} genuine contradictions => corpus insufficient")


if __name__ == "__main__":
    main()
