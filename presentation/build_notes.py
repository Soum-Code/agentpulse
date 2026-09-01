"""Build the speaker-notes PDF that accompanies AgentPulse.pptx.

Deliberately plain: this is read at a lectern, so it favours large type, wide
margins and one slide per block over anything decorative.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph,
    Spacer, Table, TableStyle,
)

INK = colors.HexColor("#141922")
DIM = colors.HexColor("#4A5464")
FAINT = colors.HexColor("#8B94A4")
CYAN = colors.HexColor("#0E7490")
RULE = colors.HexColor("#D8DDE6")
BAND = colors.HexColor("#F1F4F8")

styles = getSampleStyleSheet()


def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10.5, leading=15,
                textColor=DIM, alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(name, **base)


S_TITLE = st("t", fontName="Helvetica-Bold", fontSize=23, leading=27, textColor=INK, spaceAfter=4)
S_SUB = st("s", fontSize=11.5, leading=16, textColor=DIM, spaceAfter=14)
S_SLIDE = st("sl", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=INK, spaceAfter=2)
S_META = st("m", fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=CYAN, spaceAfter=5)
S_BODY = st("b", fontSize=10.5, leading=15.5, spaceAfter=5)
S_BEAT = st("be", fontSize=10.5, leading=15.5, textColor=DIM, leftIndent=11, bulletIndent=1, spaceAfter=3)
S_KEY = st("k", fontName="Helvetica-Bold", fontSize=10.5, leading=15, textColor=INK, spaceAfter=4)
S_H2 = st("h2", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceAfter=7)
S_Q = st("q", fontName="Helvetica-Bold", fontSize=10.5, leading=15, textColor=INK, spaceAfter=2)
S_A = st("a", fontSize=10.5, leading=15.5, textColor=DIM, spaceAfter=9)


def rule(space_before=6, space_after=8):
    t = Table([[""]], colWidths=[165 * mm], rowHeights=[0.4])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, RULE)]))
    return [Spacer(1, space_before), t, Spacer(1, space_after)]


def block(num, title, minutes, opening, beats, key=None):
    """One slide's notes, kept on a single page where possible."""
    parts = [
        Paragraph(f"Slide {num}  -  {title}", S_SLIDE),
        Paragraph(f"{minutes}", S_META),
        Paragraph(f'<b>Open with:</b> "{opening}"', S_BODY),
    ]
    for b in beats:
        parts.append(Paragraph(b, S_BEAT, bulletText="-"))
    if key:
        parts.append(Spacer(1, 4))
        parts.append(Paragraph(key, S_KEY))
    parts += rule()
    return KeepTogether(parts)


def header(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(FAINT)
    canvas.drawString(22 * mm, 12 * mm, "AgentPulse - speaker notes")
    canvas.drawRightString(188 * mm, 12 * mm, f"{doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    "AgentPulse_Speech_Notes.pdf", pagesize=A4,
    leftMargin=22 * mm, rightMargin=22 * mm,
    topMargin=20 * mm, bottomMargin=20 * mm,
    title="AgentPulse - Speaker Notes", author="Somnath Reddy",
)
doc.addPageTemplates([PageTemplate(
    id="main",
    frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")],
    onPage=header,
)])

F = []

F.append(Paragraph("AgentPulse", S_TITLE))
F.append(Paragraph(
    "Speaker notes for the project presentation. Thirteen slides, budgeted at "
    "roughly 18 minutes of speaking with 7 minutes left for questions. Every "
    "number in these notes appears somewhere in the repository and can be "
    "shown on request.", S_SUB))

F.append(Paragraph("How to run the talk", S_H2))
F.append(Paragraph(
    "The deck is built so the strongest material lands in the middle, not at the end. "
    "Slides 1 to 7 establish that the system works. Slide 8 is the turning point and is "
    "the reason this project is worth presenting: three self-authored benchmarks were "
    "checked against external data and all three broke. Slides 9 to 13 turn that into a "
    "method, a limitation list and an open question.", S_BODY))
F.append(Paragraph(
    "Resist the temptation to soften slide 8. A panel that hears you volunteer three "
    "failures will trust the successes on the other slides far more than a panel that "
    "hears only successes.", S_BODY))
F += rule(10, 12)

F.append(Paragraph("Per-slide notes", S_H2))

F.append(block(
    1, "Title", "~40 seconds",
    "AgentPulse evaluates every span a multi-agent system produces, on CPU, inside your own infrastructure.",
    ["Say 'never sampled' explicitly. It is the one-line differentiator and everything else follows from it.",
     "Flag the shape of the talk now: the most interesting part is not what worked, but what failed external validation.",
     "Do not linger. The title slide earns nothing; the panel wants the problem."],
    "If you say only one sentence here: every span, on CPU, self-hosted."))

F.append(block(
    2, "The problem", "~1 min 30 s",
    "A multi-agent system can fail in ways that leave no error and no exception behind.",
    ["Walk the four rows briefly. Do not read them verbatim, the panel can read.",
     "Land the closing line: these faults are rare by nature, so sampling is structurally the wrong instrument for them.",
     "That single sentence is the justification for the entire architecture on the next slide."],
    "The point: rare faults plus sampled evaluation equals faults you never see."))

F.append(block(
    3, "Architecture", "~1 min 30 s",
    "The reason full coverage is affordable is that evaluation was taken off the request path.",
    ["Trace the five stages left to right once, quickly.",
     "The ingest API loads no inference models at all. That is what brought the API process from 1.24 GB to 0.10 GB.",
     "Durability is not theoretical: the process was killed mid-evaluation and the job was recovered and run exactly once.",
     "If evaluation were inline you would be forced back to sampling, which defeats the whole thesis."],
    "The architectural claim: decoupling is what makes 100% coverage possible at all."))

F.append(block(
    4, "The evaluator cascade", "~1 min 45 s",
    "A cheap gate in front of an expensive judge, and the ablation that justifies it.",
    ["Stage 1 is MiniLM cosine similarity at 27.8 ms. Stage 2 is a DeBERTa-v3 cross-encoder, only on the uncertain cases.",
     "End-to-end the cascade measures 215.9 ms. Be precise about this: 27.8 ms is the gate, not the pipeline.",
     "On the chart: the cascade matches DeBERTa alone at F1 0.963 while being cheaper on the common case. That is the justification.",
     "Point at configuration F deliberately. Adding the old drift signal made the classifier worse, 0.619. That result was published rather than dropped, and the next slide but one explains why it was wrong."],
    "Thresholds were selected on the dev split and applied unchanged to the held-out test split."))

F.append(block(
    5, "Four signals and their maturity", "~1 min 30 s",
    "Four signals ship, and each one carries an honest maturity label inside the product.",
    ["Grounding and drift are Beta and validated. Disagreement and tool-claim are Experimental and are not.",
     "Say clearly that the label appears on screen in the product, not only in the report.",
     "Most tools in this space present every capability as equally ready. Stating the tier is a deliberate credibility choice."],
    "This slide is the thesis of the project in miniature."))

F.append(block(
    6, "Drift: the detector that was rebuilt", "~2 min",
    "The synthetic benchmark said drift detection worked. Real agent text said it fired on 91.7% of normal operation.",
    ["Tell it as a sequence: synthetic looked fine, real text destroyed it, diagnosis showed the threshold was never the problem.",
     "The measured centroid distance never exceeded 0.099 against a 0.30 threshold, so the signal had in fact never fired.",
     "The fix was the representation: a baseline window mean against a current window mean, pooled and disjoint.",
     "Then state the cost yourself: coverage is 24.5%. When this detector speaks it is accurate; it stays silent on about three quarters of sessions."],
    "Calibrated on 89 dev tasks with the criterion fixed beforehand, then measured once on 111 held-out tasks."))

F.append(block(
    7, "Engineering results", "~1 min 15 s",
    "Four production properties, each measured rather than argued for.",
    ["Exactly-once recovery across 8,000 spans: zero lost, zero retried, zero duplicated.",
     "Roughly 12 spans per second at four workers. Eight workers buys 8% more throughput for 86% more memory, so four is the operating point.",
     "ONNX is 1.97 times faster than PyTorch with a worst-case probability difference of 1.2e-08, which is to say identical.",
     "Keep this slide brisk. It is credibility, not the argument."],
    "Every number here came from running the thing, not from reasoning about the design."))

F.append(block(
    8, "The turning point", "~2 min 30 s - the most important slide",
    "Three signals were checked against external data that this project did not author. All three broke.",
    ["Go row by row and do not rush. Drift: 91.7% false alarms. Tool-claim: zero claims extracted from 8,353 real prose spans. Disagreement: zero of ten contradictions detected.",
     "Contrast each against its internal score. Tool-claim scored 0.842 on its own 19 cases. Disagreement scored 0.960 on 22 authored cases.",
     "Then read the bottom line and pause: three for three is not bad luck, it is a finding about how self-authored benchmarks get built.",
     "Let the silence sit for a beat before moving on."],
    "If the panel remembers one slide, it should be this one."))

F.append(block(
    9, "Why they failed", "~2 min",
    "In both cases the benchmark measured the wrong shape of problem.",
    ["Tool-claim: the extractor looks for an agent narrating 'I used the X tool'. Modern harnesses put the tool name in a structured field and never narrate it. Expanding the regex cannot fix this, because the information is not in the text.",
     "Disagreement: the 22 internal cases averaged ten words, minimal pairs of exactly the shape the NLI model was trained on. Real debate turns run past 2,000 characters. The benchmark handed the detector pre-extracted claims, so the missing extraction stage was invisible.",
     "Spend the most time on the evidence-partition finding at the bottom. Two agents can flatly contradict each other and both be correct about their own partition of the evidence.",
     "Six of forty labelled cases were exactly that. An NLI score compares two strings and has no representation of what each agent could see."],
    "This is the strongest technical point available. It reframes a failed feature as a well-posed research question."))

F.append(block(
    10, "Method", "~1 min 30 s",
    "These findings were only possible because of four rules that were fixed in advance.",
    ["Benchmark before fixing. The disagreement engine was measured against completely unmodified code first.",
     "Report the contradiction. The relevance gate measured worse than baseline in isolation, 0.762 against 0.800. Only the combination paid off, and the inconvenient intermediate result was published.",
     "Separate the label from the judge. Scoring an LLM judge against LLM-produced labels is circular, so results were split by label provenance.",
     "Install the competitor rather than reading its marketing. Two positioning claims were refuted by running Phoenix and MLflow."],
    "A result can be attacked. A method that deliberately arranged to be proven wrong is much harder to attack."))

F.append(block(
    11, "Where it stands", "~1 min",
    "What is actually working today, and what was deliberately left out.",
    ["209 of 209 backend tests pass. Over 20,700 spans stored. Five versioned evaluation datasets.",
     "Run through the shipped list quickly; the detail is on the slide.",
     "End on the deferred list and say the reasons are stated, not hidden: multi-tenancy, key rotation, backup and restore, Postgres, OTLP."],
    "If asked why 'production ready' never appears: it is binary and unfalsifiable. The claim made instead is specific and checkable."))

F.append(block(
    12, "Limitations", "~1 min 15 s",
    "Five limits, stated before the panel has to find them.",
    ["Deliver these calmly and without apology.",
     "Drift coverage is 24.5%. Two of four signals are unvalidated. The API key is single and shared. Evaluation coverage is currently about 6% because most stored spans predate the worker.",
     "Datadog was never audited because it cannot be installed, so its column in the competitive matrix is marked as the least reliable."],
    "Naming your own limits converts a likely attack into evidence of rigour."))

F.append(block(
    13, "Close", "~1 min",
    "The contribution is a working system and an honest evaluation of it.",
    ["Four parts: a working system, one validated capability, three reported negative results, and one open research question.",
     "Close on the fourth, not the first. Anyone can demo a dashboard.",
     "Final line: this project turned its instruments on itself, published what it found, and ended with a sharper question than it started with."],
    "Then stop talking and take questions."))

F.append(Paragraph("Questions the panel is likely to ask", S_H2))

qa = [
    ("Three of your four signals failed. Is the project a failure?",
     "No, and the distinction matters. One signal, drift, was diagnosed and rebuilt and now measures AUC 0.991 on a held-out split. The other two produced a documented reason for failure rather than a mystery. A project that reports three negative results with diagnoses has more evidence behind it than one that reports four successes with none checked."),
    ("Why should we trust the drift number when coverage is only 24.5%?",
     "You should trust it exactly as far as it is stated. The claim is not that drift is always detected; it is that when this detector emits a value, false alarms sit at 1.5% and AUC at 0.991 on a held-out split. Coverage is quoted in the same breath every time, including inside the product."),
    ("Why not just use an LLM as a judge?",
     "It was measured head to head. The local Qwen3-8B judge scored F1 1.000 against the cascade's 0.963, so on quality the judge won. But it cost 12.9 times the mean latency and 219 generation tokens per evaluation against zero. At 100% coverage that difference decides the architecture. Also, results were split by label provenance, and on the deterministically labelled subset both systems tie at 1.000."),
    ("What stops this from being a thin wrapper over an NLI model?",
     "The evaluation is the smaller half. The durable leased queue with exactly-once recovery, the Alembic-managed schema, the retention path that deletes with zero orphans, the self-monitoring surface and the drift baseline that survives a restart are all separate engineering problems that had to be solved to make full coverage viable."),
    ("How is this different from LangSmith, Phoenix or Langfuse?",
     "It is not competitive on breadth and the report says so. Phoenix and MLflow were installed and probed, and both refuted a claim this project had been making about tool-call verification. What survives is drift, which neither ships as a named feature or as composable primitives, plus the design choice of evaluating every span rather than a sample."),
    ("Why is the tool-claim redesign not finished?",
     "It is blocked on labelling, not engineering. A labelling attempt reached Cohen's kappa of only 0.225 and produced zero gold examples for two of the four target classes. The disagreement was systematic rather than noisy: the same model with differently worded prompts returned UNVERIFIABLE 29 times in one pass and twice in the other. That says the question is not well posed on this data, which is not something prompt tuning fixes."),
    ("What is the evidence-partition problem in one sentence?",
     "Two agents holding different subsets of the evidence can produce statements that look like a flat contradiction while both are correct, and a similarity or entailment score over two strings has no way to tell that apart from a genuine fault."),
    ("What would you do next?",
     "Three things, in order. Persist enough context to distinguish partial-evidence disagreement from a real contradiction. Extract individual assertions so each can be labelled against the single tool result it refers to, which is the task shape that previously reached kappa 0.922. And process the existing backlog so evaluation coverage rises from about 6% toward the design intent."),
    ("Does it scale?",
     "To roughly 100,000 traces on SQLite with WAL, yes, and that was the measured target. Beyond that the honest answer is that Postgres and horizontal partitioning are deferred with stated reasons rather than implemented. Scale was never the binding constraint; framework breadth and automatic issue surfacing are."),
]
for q, a in qa:
    F.append(KeepTogether([Paragraph(q, S_Q), Paragraph(a, S_A)]))

F += rule(4, 10)

F.append(Paragraph("Numbers worth having ready", S_H2))
rows = [
    ["Grounding cascade F1", "0.963", "held-out v1.0_test, Config C"],
    ["Stage 1 gate / full cascade", "27.8 ms / 215.9 ms", "ablation_results.json"],
    ["Drift false alarms", "91.7% to 1.5%", "before and after the rebuild"],
    ["Drift detection / AUC", "0.9192 / 0.991", "111 held-out tasks"],
    ["Drift coverage", "24.5%", "always quote with the accuracy"],
    ["Durability", "0 lost, 0 duplicated", "8,000 spans, SIGKILL mid-run"],
    ["Throughput", "~12 spans/sec", "4 workers, 8 physical cores"],
    ["ONNX speedup", "1.97x", "worst prob difference 1.2e-08"],
    ["API memory", "1.24 GB to 0.10 GB", "models moved off ingest"],
    ["Tool-claim on real traces", "F1 0.000", "0 extractions, 8,353 prose spans"],
    ["Disagreement, external", "0 of 10", "internal benchmark was 0.960"],
    ["Backend tests", "209 / 209", "pytest tests/ -q"],
]
t = Table([[Paragraph(f"<b>{a}</b>", S_BODY), Paragraph(b, S_BODY), Paragraph(f"<font color='#8B94A4'>{c}</font>", S_BODY)]
           for a, b, c in rows], colWidths=[52 * mm, 40 * mm, 73 * mm])
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
    "<font color='#8B94A4'>If a number is challenged, the underlying file is in "
    "experiments/results/ and the method is written up in the matching report at the "
    "repository root.</font>", S_BODY))

doc.build(F)
print("written: AgentPulse_Speech_Notes.pdf")
