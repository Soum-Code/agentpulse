# Paraphrase stability

**Anchors:** 5  **Paraphrases:** 34 (2 discarded below the 0.85 similarity floor)

## Question

24.9.2 established that these signals separate well in aggregate and move
sharply between near-equivalent statements. A per-span alert depends on the
second property. This measures it directly: hold the evidence and the prior
agents fixed, vary only the wording of the agent's output, and look at the
spread.

## Method

Anchors are real verifier outputs from `refusal_disagreement.json`, sampled one
per (model, stance) rather than by score, so the spread measured is typical
rather than selected. Each is rewritten {'nvidia': 'mistralai/mistral-nemotron', 'openrouter': 'deepseek/deepseek-v4-flash-0731:free'} times with meaning
preserved, and every rewrite is checked against its anchor with the product's
own embedding model. Rewrites below 0.85 cosine similarity are
discarded as no longer paraphrases and counted above.

Scoring is identical to the anchor's: contradiction against the same evidence,
disagreement against the same prior agents, same NLI model.

## Results

| stance | model | signal | anchor | n | min | max | spread | sd | flipped | min sim |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| accept | deepseek-ai | disagreement | 0.9681 | 3 | 0.014 | 0.9943 | **0.9803** | 0.4572 | **1** | 0.9105 |
| accept | deepseek-ai | contradiction | 0.0188 | 3 | 0.0007 | 0.0043 | **0.0036** | 0.0015 | **0** | 0.9105 |
| refuse | deepseek-ai | disagreement | 0.9998 | 8 | 0.9992 | 0.9998 | **0.0006** | 0.0002 | **0** | 0.8754 |
| refuse | deepseek-ai | contradiction | 0.9941 | 8 | 0.8507 | 0.9959 | **0.1452** | 0.0432 | **0** | 0.8754 |
| accept | google | disagreement | 0.0799 | 8 | 0.0118 | 0.9962 | **0.9844** | 0.4576 | **3** | 0.8944 |
| accept | google | contradiction | 0.0051 | 8 | 0.002 | 0.0585 | **0.0565** | 0.0176 | **0** | 0.8944 |
| refuse | google | disagreement | 0.9997 | 6 | 0.0431 | 0.9998 | **0.9567** | 0.3547 | **1** | 0.8626 |
| refuse | google | contradiction | 0.9913 | 6 | 0.2173 | 0.8517 | **0.6344** | 0.2777 | **3** | 0.8626 |
| accept | meta | disagreement | 0.0075 | 7 | 0.0038 | 0.952 | **0.9482** | 0.4185 | **2** | 0.856 |
| accept | meta | contradiction | 0.0066 | 7 | 0.0042 | 0.0535 | **0.0493** | 0.0162 | **0** | 0.856 |

**Widest spread:** 0.9844 on disagreement, from an anchor at 0.0799 (accept, google).

**Alert flips:** 10 paraphrase-signal pairs landed on the opposite side of the 0.6 alert threshold from their anchor, while meaning the same thing.

## Limitations

- **0.85 is a judgement call**, not a calibrated threshold. It is
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
