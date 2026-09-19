# Does disagreement track error, or refusal?

**Trials:** 90 (90 usable, 0 excluded as unclassifiable)

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
only thing that varies. Verifiers: deepseek-ai/deepseek-v4-flash-0731, google/gemma-4-31b-it, meta/muse-glimmer-30b, mistralai/mistral-nemotron, z-ai/glm-5.3-flash. Every verifier
receives the same neutral prompt; cells C and D fill because models genuinely
disagree with each other, not because any prompt pushed them to.

Placement in the 2x2 uses whether retrieval *actually* returned an on-topic
document, not the query's declared label.

## Results

| cell | condition | disagreement | contradiction |
| :--- | :--- | :--- | :--- |
| A | evidence relevant, verifier accepts (expected-normal) | n=40, median 0.0463, mean 0.2485, 9/40 above 0.6 | n=40, median 0.0445, mean 0.1958, 5/40 above 0.6 |
| B | evidence irrelevant, verifier refuses (expected-normal) | n=47, median 0.9997, mean 0.9778, 46/47 above 0.6 | n=47, median 0.9844, mean 0.8971, 43/47 above 0.6 |
| C | evidence relevant, verifier refuses (WRONG REFUSAL) | n=3, median 0.9998, mean 0.9987, 3/3 above 0.6 | n=3, median 0.9941, mean 0.9382, 3/3 above 0.6 |
| D | evidence irrelevant, verifier accepts (WRONG ACCEPT) | n=0 | n=0 |

Separation of refusal from acceptance, as AUC (0.5 = none, 1.0 = perfect):

- disagreement, live rule (verifier vs its prior agents): **0.9792**
- disagreement, analyst-verifier pair only: **0.6495**
- contradiction (evidence vs verifier): **0.9605**

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

**Not yet decidable.** Cells C and D are the ones that separate the two hypotheses and at least one of them is still empty. More repeats, or more verifier models, are needed before this table says anything.

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
  nvidia/nemotron-3-super-120b-a12b is present in every trial.
- **Cells C and D are not balanced by construction** and cannot be, since they
  depend on models spontaneously disagreeing. Read their n before their mean.

*Data:* `experiments/results/refusal_disagreement.json`
