"""Speaker notes for AgentPulse_Final_Review.pptx.

Structured against the M.Tech Final Review checklist so each slide can be
traced back to the rubric item it answers.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph,
    Spacer, Table, TableStyle,
)

INK = colors.HexColor("#141922")
DIM = colors.HexColor("#4A5464")
FAINT = colors.HexColor("#8B94A4")
CYAN = colors.HexColor("#0E7490")
WARN = colors.HexColor("#8A5A00")
RULE = colors.HexColor("#D8DDE6")
BAND = colors.HexColor("#F1F4F8")


def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10.5, leading=15,
                textColor=DIM, alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(name, **base)


S_TITLE = st("t", fontName="Helvetica-Bold", fontSize=23, leading=27, textColor=INK, spaceAfter=4)
S_SUB = st("s", fontSize=11.5, leading=16, spaceAfter=13)
S_SLIDE = st("sl", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, spaceAfter=1)
S_META = st("m", fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=CYAN, spaceAfter=5)
S_BODY = st("b", fontSize=10.5, leading=15.5, spaceAfter=5)
S_BEAT = st("be", fontSize=10.5, leading=15.5, leftIndent=11, bulletIndent=1, spaceAfter=3)
S_KEY = st("k", fontName="Helvetica-Bold", fontSize=10.5, leading=15, textColor=INK, spaceAfter=4)
S_WARN = st("w", fontName="Helvetica-Bold", fontSize=10.5, leading=15, textColor=WARN, spaceAfter=4)
S_H2 = st("h2", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceAfter=7)
S_Q = st("q", fontName="Helvetica-Bold", fontSize=10.5, leading=15, textColor=INK, spaceAfter=2)
S_A = st("a", fontSize=10.5, leading=15.5, spaceAfter=9)


def rule(before=6, after=8):
    t = Table([[""]], colWidths=[165 * mm], rowHeights=[0.4])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, RULE)]))
    return [Spacer(1, before), t, Spacer(1, after)]


def block(num, title, checklist, minutes, opening, beats, key=None, warn=None):
    parts = [
        Paragraph(f"Slide {num}  -  {title}", S_SLIDE),
        Paragraph(f"{minutes}   |   Checklist: {checklist}", S_META),
        Paragraph(f'<b>Open with:</b> "{opening}"', S_BODY),
    ]
    for b in beats:
        parts.append(Paragraph(b, S_BEAT, bulletText="-"))
    if key:
        parts.append(Spacer(1, 4))
        parts.append(Paragraph(key, S_KEY))
    if warn:
        parts.append(Paragraph(warn, S_WARN))
    parts += rule()
    return KeepTogether(parts)


def header(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(FAINT)
    canvas.drawString(22 * mm, 12 * mm, "AgentPulse - Final Review speaker notes")
    canvas.drawRightString(188 * mm, 12 * mm, f"{doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    "AgentPulse_Final_Review_Notes.pdf", pagesize=A4,
    leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
    title="AgentPulse - Final Review Speaker Notes", author="Somnath Reddy",
)
doc.addPageTemplates([PageTemplate(
    id="main",
    frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")],
    onPage=header,
)])

F = []
F.append(Paragraph("AgentPulse - Final Review", S_TITLE))
F.append(Paragraph(
    "Speaker notes for the 18-slide Final Review deck. Budgeted at roughly 20 minutes "
    "of speaking with 10 minutes for questions. Each slide is tagged with the Final "
    "Review checklist item it answers, so the panel can follow the rubric.", S_SUB))

F.append(Paragraph("Three things to know before you start", S_H2))
F.append(Paragraph(
    "<b>1. Read the seventeen surveyed papers before you present.</b> Slide 3 carries a "
    "comparison table of ten of them and slide 17 has the full list. The works themselves "
    "are real and their limitation column is accurate, but a panel may pick any row and ask "
    "you to discuss it. If you cannot, the whole survey is discounted - so treat the table "
    "as a reading list you still owe, not as finished work.", S_BODY))
F.append(Paragraph(
    "<b>2. Two checklist items are genuinely outstanding</b> - the plagiarism report and a "
    "paper submission. They are on slide 15 with a timeline on slide 16. The panel has the "
    "checklist in front of them, so listing the gaps reads as control; being caught omitting "
    "them reads as the opposite.", S_BODY))
F.append(Paragraph(
    "<b>3. Two slides contain results that work against you</b> - slide 7, where the full "
    "system scores below an ablated variant, and slide 12, where three signals failed "
    "external validation. Both are deliberate. Volunteering them, with a mechanism and a "
    "caveat, is what makes the rest of the numbers credible.", S_BODY))
F += rule(10, 12)

F.append(Paragraph("Per-slide notes", S_H2))

F.append(block(
    1, "Title", "Review identification", "~30 s",
    "This is the Final Review for AgentPulse, a continuous evaluation system for multi-agent LLM pipelines.",
    ["Fill in guide and panel names on the slide before presenting.",
     "State the review number out loud so the panel knows which checklist applies.",
     "Do not linger."],
    "One sentence: every span evaluated, on CPU, self-hosted."))

F.append(block(
    2, "Problem and motivation", "Problem statement, motivation", "~1 min 30 s",
    "A multi-agent pipeline can produce a fluent, well-formed, entirely unsupported answer while every service reports success.",
    ["Walk the four failure modes quickly - the panel can read the cards.",
     "The sentence that must land is in the 'why it matters' box: these faults are rare, so sampling is structurally biased against finding them.",
     "That single point is the justification for every architectural decision that follows."],
    "Rare faults plus sampled evaluation equals faults you never see."))

F.append(block(
    3, "Literature survey", "15-20 papers, comparison table", "~1 min 45 s",
    "Prior work falls into three families, and each one stops short of the problem this project targets.",
    ["Do not read the table. Group it out loud instead: NLI-based consistency (SummaC, AlignScore), judge-based evaluation (RAGAS, ARES, MT-Bench, Prometheus), and drift or failure analysis (DriftLens, MAST).",
     "Then give the limitation that each family shares, because that is what motivates slide 4. Consistency metrics assume a single-document premise. Judge methods pay per evaluation, which is what forces sampling. Drift methods are untied to output correctness. MAST describes multi-agent failures but does not detect them at runtime.",
     "Seventeen works surveyed, nine of them from 2023 onward, which satisfies the checklist.",
     "If asked for a specific figure: SummaC reports balanced accuracy 74.4% on its six-dataset benchmark; MAST annotated 1600+ traces across seven frameworks with inter-annotator kappa 0.88."],
    "The gap statement on slide 4 falls straight out of the limitation column - make that connection explicit.",
    "Read all seventeen before presenting. The papers are real, but a row you cannot discuss will cost you the whole survey."))

F.append(block(
    4, "Gap and objectives", "Research gap, SMART objectives", "~1 min 30 s",
    "The gap is that no existing platform combines full per-span evaluation with a dedicated drift signal at a cost that makes full coverage affordable.",
    ["State the gap and then immediately state why it matters - cost is what forces sampling, so reducing evaluation cost is the enabling problem.",
     "Read the five objectives with their outcomes. Four are achieved, one is partial.",
     "Be ready to defend O5. Reporting that three of four signals failed external validation is a completed objective, not an incomplete one."],
    "Each objective has a measured outcome beside it, not a claim."))

F.append(block(
    5, "Architecture and methodology", "Architecture diagram, algorithm justification", "~2 min",
    "The reason full coverage is affordable is that evaluation was taken off the request path.",
    ["Trace the five stages once, left to right, quickly.",
     "Then spend the time on the right-hand box - the panel will ask 'why this over alternatives' and those are the three answers.",
     "Why a cascade: the gate handles the common case at a seventh of the cost with no F1 loss, which the ablation proves.",
     "Why CPU: removes the cost argument for sampling and keeps deployment self-hosted with no data egress.",
     "Why a queue: inline evaluation forces sampling at scale, which defeats the objective."],
    "The strongest justification is the last one - it ties the architecture back to the thesis."))

F.append(block(
    6, "Evaluation methodology", "Dataset, splits, metrics defined upfront", "~1 min 30 s",
    "Five versioned datasets, with metrics and thresholds fixed before anything was measured.",
    ["Name the split discipline: thresholds were selected on dev and applied unchanged to the held-out test split.",
     "Drift used a criterion fixed in advance, then was measured once on 111 unseen tasks.",
     "Cohen kappa 0.922 between two independent labelling passes on the original 50 cases.",
     "Say the closing line yourself: labels are LLM-generated, not human-annotated, and that is the largest threat to validity in this work."],
    "Naming the label-quality threat first means you are not defending it later."))

F.append(block(
    7, "Baseline comparison", "Comparison against 2-3 baselines", "~2 min - handle carefully",
    "Four baselines plus the full system, and the full system is not the best row.",
    ["Read the table in order, then stop on the two highlighted rows.",
     "Baseline D, NLI without drift, scores F1 0.941. The full system scores 0.842.",
     "Give the mechanism: drift is a per-agent behavioural signal, not evidence about a single claim, so folding it into a per-claim composite adds noise. The ablation shows the same effect independently at configuration F.",
     "Give the caveat: this comparison is dated 18 August, nine days before the drift detector was rebuilt, so it measures the superseded signal. Re-running it is item 2 in future work."],
    "Expect a question here and welcome it - you have both the mechanism and the caveat ready."))

F.append(block(
    8, "Ablation study", "Ablation completed and discussed", "~1 min 45 s",
    "Seven configurations, and the two most interesting results are the ones that did not move.",
    ["The cascade at C matches NLI alone at B, 0.963, while handling the common case far more cheaply. That is the justification for the gate.",
     "Configuration F, adding drift, drops to 0.619 - consistent with the baseline table.",
     "Then the error analysis box: D and E report identical numbers because the single-agent test split structurally cannot exercise a cross-agent or tool-narration signal.",
     "Noticing that is what triggered the external validation on slide 12, and it is why those two signals ship as Experimental."],
    "The panel will ask why four configurations share an F1. That answer is the strongest methodological point in the deck."))

F.append(block(
    9, "Grounding and drift results", "Final results", "~2 min",
    "Two validated signals, each with a held-out number and a stated cost.",
    ["Grounding: F1 0.963 on the held-out split, precision 0.929, recall 1.000, FPR 0.059.",
     "Drift: AUC 0.991 on 111 held-out tasks, false alarms down from 91.7% to 1.5%.",
     "Then tell the rebuild story across the three numbered steps - synthetic looked fine, real text destroyed it, and the diagnosis showed the threshold was never the problem.",
     "Always say coverage 24.5% in the same breath as the AUC. Never quote one without the other."],
    "The pairing of accuracy with coverage is the honesty discipline this project is built on."))

F.append(block(
    10, "Engineering results", "Full system demonstrated end-to-end", "~1 min 15 s",
    "Four production properties, each obtained by running the system rather than reasoning about it.",
    ["Exactly-once recovery across 8,000 spans - zero lost, zero retried, zero duplicated, at every concurrency level.",
     "Roughly 12 spans per second at four workers; eight workers buys 8% more for 86% more memory.",
     "ONNX is 1.97 times faster with a worst-case probability difference of 1.2e-08.",
     "Keep this brisk. It is credibility, not the argument."],
    "The durability number came from actually killing the process mid-evaluation."))

F.append(block(
    11, "Statistical rigor", "Statistical rigor where applicable", "~1 min 30 s",
    "The methodology is strong on held-out discipline and weak on repetition, and this slide says which is which.",
    ["Left column - what is in place: held-out reporting, a pre-registered acceptance criterion, Cohen kappa, a power analysis, recorded seeds, and confidence intervals where they change the conclusion.",
     "Right column - what is not: no multi-seed repetition of the grounding benchmark, no significance test between the cascade and baseline D, small splits, and LLM-generated labels.",
     "Say the summary line out loud. Where a number lacks an interval, the deck says so rather than implying one."],
    "This slide exists because the checklist asks for rigor and the honest answer is mixed."))

F.append(block(
    12, "External validation and error analysis", "Failure cases discussed", "~2 min 30 s - the key slide",
    "Three signals were checked against external data this project did not author. All three broke.",
    ["Go row by row and do not rush. Drift, 91.7% false alarms. Tool-claim, zero claims from 8,353 real prose spans against F1 0.842 internally. Disagreement, zero of ten against F1 0.960 internally.",
     "Left box - why the benchmarks missed it. The tool-claim extractor looks for narrated tool use that modern harnesses never produce. The 22 disagreement cases averaged ten words, exactly the shape the NLI model was trained on.",
     "Right box - the finding that outlives the failure. Agents holding different evidence can flatly contradict each other and both be correct. Six of forty labelled cases were exactly that.",
     "Pause after the right-hand box. Let it sit."],
    "Three for three is not bad luck - it is a finding about how self-authored benchmarks get built."))

F.append(block(
    13, "Limitations", "Limitations honestly discussed", "~1 min 30 s",
    "Six limits, stated before the panel has to find them.",
    ["Deliver calmly and without apology. Every line has a number or a reason behind it.",
     "The fourth one repeats slide 7 deliberately - the full system underperforming an ablated variant belongs in the limitations list too.",
     "Close with the note that 'production ready' is deliberately absent from this project because it is binary and unfalsifiable."],
    "Naming your own limits converts a likely attack into evidence of rigour."))

F.append(block(
    14, "Contribution", "Contribution restated - what is new, by how much", "~1 min 30 s",
    "Four contributions: a working system, one validated capability, three reported negative results, and one open question.",
    ["Give the quantities, not adjectives - 12 spans per second, AUC 0.991, F1 0.000 on external traces.",
     "Mention that two published positioning claims were retracted after installing Phoenix and MLflow and finding both ship tool-call verification.",
     "Close the technical half here."],
    "Anyone can demo a dashboard. This work turned its instruments on itself and published what it found."))

F.append(block(
    15, "Deliverables and reproducibility", "Repo, reproducibility, submission status", "~1 min 30 s",
    "The repository is complete and reproducible; three submission items are outstanding.",
    ["Left: 209 of 209 tests, Alembic-managed schema verified across 43,941 rows, and every reported figure traceable to a JSON file under experiments/results.",
     "Right: read the status table honestly. The literature survey is done at seventeen works; the report is a draft; plagiarism report and paper submission are outstanding.",
     "Ethical position: everything runs locally, no third-party API calls, no PII stored, payload capture opt-in and off by default."],
    "Do not gloss the two outstanding items - the panel has the same checklist you do."))

F.append(block(
    16, "Future work", "Genuine next steps", "~1 min",
    "Five next steps, in priority order, with the research items marked as research.",
    ["Items 1 to 3 are commitments: close the remaining deliverables (plagiarism report, paper draft), re-run the baseline comparison against the rebuilt drift signal, and repeat the benchmarks across seeds with intervals.",
     "Items 4 and 5 are the open questions this project surfaced - representing evidence partitions, and re-posing the tool-claim task at assertion level.",
     "Say explicitly that 4 and 5 are research problems, not engineering tasks."],
    "The checklist asks for genuine next steps rather than filler. Item 2 exists because slide 7's comparison is stale."))

F.append(block(
    17, "References appendix", "Full reference list", "do not present unless asked",
    "The full list of seventeen surveyed works, grouped by family.",
    ["Skip this slide in the main run - it exists so you can answer 'what else did you survey' without hunting.",
     "Three columns: factual consistency and NLI, RAG and judge-based evaluation, and drift plus multi-agent failure.",
     "Full citations with venue and identifier belong in the report bibliography, not on the slide."],
    "Jump here only if the panel presses on coverage of prior work."))

F.append(block(
    18, "Close", "Contribution restated", "~45 s",
    "In summary: an evaluation tool that was honestly evaluated.",
    ["Four bullets: working system, one validated capability, three negative results with diagnoses, one open question.",
     "Close on the fourth, not the first.",
     "Then stop talking and take questions."],
    "Do not add a new claim in the last thirty seconds."))

F.append(Paragraph("Anticipated panel questions", S_H2))

qa = [
    ("Your full system scores below one of your own baselines. Why ship it?",
     "On that particular claim-level classification task, yes - 0.842 against 0.941. The mechanism is that drift is a per-agent behavioural signal and folding it into a per-claim composite adds noise, which the ablation confirms independently at configuration F. Two caveats matter: that comparison is dated nine days before the drift detector was rebuilt, so it measures the superseded signal, and the full system exists to detect behavioural change over time, which the claim-level metric does not measure at all. Re-running the comparison is item 2 in future work."),
    ("Three of your four signals failed external validation. Is the project a failure?",
     "No, and the distinction matters. One of them, drift, was diagnosed and rebuilt and now measures AUC 0.991 on a held-out split. The other two produced a documented mechanism rather than a mystery. A project reporting three negative results with diagnoses has more evidence behind it than one reporting four successes none of which were externally checked."),
    ("How does your work differ from RAGAS or ARES?",
     "Both evaluate a RAG answer against the context it was given, and both are judge-based, so cost scales with how much traffic you evaluate - which is what pushes teams to sample. This work uses a deterministic NLI cascade instead, which is what makes evaluating every span affordable, and it adds a behavioural drift signal over time that neither framework has. ARES also needs 50 to 500 human-labelled triples per domain; this system needs none at inference time."),
    ("Your labels are LLM-generated. How do you know they are right?",
     "I do not know they are right, and that is stated as the largest threat to validity. The mitigations are two independent labelling passes with Cohen kappa 0.922 on the original 50 cases, and splitting the LLM-judge comparison by label provenance so a judge is never scored against judge-made labels. When a later labelling attempt reached kappa of only 0.225, it was reported as disqualifying rather than used."),
    ("Why not use a large LLM as the judge instead of an NLI cascade?",
     "It was measured head to head. A local Qwen3-8B judge scored F1 1.000 against the cascade's 0.963, so on quality the judge won. It cost 12.9 times the mean latency and 219 generation tokens per evaluation against zero. At 100% coverage that difference decides the architecture. On the deterministically labelled subset both tie at 1.000, so the judge's entire advantage sits inside the circular subset."),
    ("Your test splits are 20 to 30 cases. Is that enough?",
     "Enough for direction, not for tight intervals, and slide 11 says exactly that. The split discipline is sound - thresholds fixed on dev and applied unchanged to held-out - but there is no multi-seed repetition and no significance test between the cascade and baseline D. Producing interval estimates is item 3 in future work."),
    ("What is genuinely novel here as opposed to engineering?",
     "Three things. Full per-span evaluation on commodity CPU at a measured rate, which removes the cost argument that forces sampling. A drift representation that survives real agent text, where the original per-output centroid distance did not. And the evidence-partition finding: contradiction detection cannot separate a genuine fault from legitimate disagreement when agents hold different evidence, which is independent of NLI quality or extraction method."),
    ("What is the evidence-partition problem in one sentence?",
     "Two agents holding different subsets of the evidence can produce statements that look like a flat contradiction while both are correct, and an entailment score over two strings has no representation of what each agent could see."),
    ("Does it scale?",
     "To roughly 100,000 traces on SQLite with WAL, which was the measured target. Beyond that, Postgres and horizontal partitioning are deferred with stated reasons rather than implemented. Scale was never the binding constraint - framework breadth and automatic issue surfacing are, and both are scale-independent."),
    ("Can someone else reproduce this?",
     "Yes. The repository has full commit history, a README, Docker compose, 209 passing tests, an Alembic-managed schema verified byte-identical across 43,941 rows, and every reported figure has a JSON file under experiments/results with a matching write-up. The one gap is that the venv's editable installs point at a pre-rename path, so PYTHONPATH has to be set - that is a known issue, not a hidden one."),
]
for q, a in qa:
    F.append(KeepTogether([Paragraph(q, S_Q), Paragraph(a, S_A)]))

F += rule(4, 10)
F.append(Paragraph("Numbers to have ready", S_H2))
rows = [
    ["Grounding F1", "0.963", "held-out v1.0_test, Config C"],
    ["Precision / recall / FPR", "0.929 / 1.000 / 0.059", "same run"],
    ["Stage 1 gate / full cascade", "27.8 ms / 215.9 ms", "ablation_results.json"],
    ["Best baseline (D, no drift)", "F1 0.941", "full system 0.842 - see slide 7"],
    ["Drift false alarms", "91.7% to 1.5%", "before and after rebuild"],
    ["Drift detection / AUC", "0.9192 / 0.991", "111 held-out tasks"],
    ["Drift coverage", "24.5%", "always quote with the accuracy"],
    ["Durability", "0 lost, 0 duplicated", "8,000 spans, SIGKILL mid-run"],
    ["Throughput", "~12 spans/sec", "4 workers, 8 physical cores"],
    ["ONNX speedup", "1.97x", "worst prob difference 1.2e-08"],
    ["API memory", "1.24 GB to 0.10 GB", "models moved off ingest"],
    ["Tool-claim on real traces", "F1 0.000", "0 extractions, 8,353 prose spans"],
    ["Disagreement, external", "0 of 10", "internal benchmark 0.960"],
    ["Label agreement", "kappa 0.922 / 0.225", "original 50 / later attempt"],
    ["Backend tests", "209 / 209", "pytest tests/ -q"],
]
t = Table([[Paragraph(f"<b>{a}</b>", S_BODY), Paragraph(b, S_BODY),
            Paragraph(f"<font color='#8B94A4'>{c}</font>", S_BODY)] for a, b, c in rows],
          colWidths=[50 * mm, 42 * mm, 73 * mm])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, BAND]),
]))
F.append(t)
F.append(Spacer(1, 12))
F.append(Paragraph(
    "<font color='#8B94A4'>Every figure above has a JSON file under experiments/results/ "
    "and a matching write-up at the repository root. If a number is challenged, open the "
    "file.</font>", S_BODY))

doc.build(F)
print("written: AgentPulse_Final_Review_Notes.pdf")
