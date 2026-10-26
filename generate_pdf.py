import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

CHARTS_DIR = os.path.join(os.path.dirname(__file__), "report_assets")
os.makedirs(CHARTS_DIR, exist_ok=True)

# -------------------------------------------------------------
# 1. MATPLOTLIB CHARTS GENERATION
# -------------------------------------------------------------
def generate_charts():
    plt.rcParams.update({
        'font.sans-serif': 'DejaVu Sans',
        'font.family': 'sans-serif',
        'figure.autolayout': True,
        'figure.dpi': 300
    })

    # Chart 1: Reasoning Strategy Tradeoffs
    fig, ax1 = plt.subplots(figsize=(6.2, 2.0), dpi=300)
    strategies = ['Direct (Zero-Shot)', 'Chain-of-Thought (CoT)', 'Atom of Thoughts (AoT)']
    risk = [0.424, 0.283, 0.233]
    tokens_in = [53.1, 88.1, 543.4]
    
    x = np.arange(len(strategies))
    width = 0.32

    color_risk = '#2563EB'
    color_tokens = '#F59E0B'

    rects1 = ax1.bar(x - width/2, risk, width, label='Grounding Risk (Lower = Better)', color=color_risk, edgecolor='#1E40AF', alpha=0.9)
    ax1.set_ylabel('Grounding Risk (0 - 1.0)', color='#0F172A', fontweight='bold', fontsize=7.5)
    ax1.set_ylim(0, 0.65)
    ax1.tick_params(axis='y', labelcolor='#0F172A', labelsize=7)
    ax1.set_xticks(x)
    ax1.set_xticklabels(strategies, fontsize=7.5, fontweight='bold')
    ax1.grid(axis='y', linestyle='--', alpha=0.3)

    ax2 = ax1.twinx()
    rects2 = ax2.bar(x + width/2, tokens_in, width, label='Input Tokens (Cost)', color=color_tokens, edgecolor='#B45309', alpha=0.9)
    ax2.set_ylabel('Mean Input Tokens', color='#0F172A', fontweight='bold', fontsize=7.5)
    ax2.set_ylim(0, 850)
    ax2.tick_params(axis='y', labelcolor='#0F172A', labelsize=7)

    for rect in rects1:
        h = rect.get_height()
        ax1.annotate(f'{h:.3f}', xy=(rect.get_x() + rect.get_width()/2, h),
                    xytext=(0, 2), textcoords="offset points", ha='center', va='bottom', fontsize=7, fontweight='bold', color='#1E40AF')
    for rect in rects2:
        h = rect.get_height()
        ax2.annotate(f'{h:.1f}', xy=(rect.get_x() + rect.get_width()/2, h),
                    xytext=(0, 2), textcoords="offset points", ha='center', va='bottom', fontsize=7, fontweight='bold', color='#B45309')

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper center', ncol=2, fontsize=7, framealpha=0.92)
    plt.title('Reasoning Strategy Benchmark on Qwen3-8B Q4_K_M, CPU (v1.0_test, 30 cases x 5 runs)', fontsize=8.5, fontweight='bold', pad=6)
    
    p1 = os.path.join(CHARTS_DIR, "chart_reasoning.png")
    plt.savefig(p1, bbox_inches='tight')
    plt.close()

    # Chart 2: Ablation on v1.0_test (30 cases).
    # In short: configs A-F are experiments/results/ablation_results.json (run of 2026-09-18).
    # G is the corrected-label re-score from GROUNDING_RECALIBRATION_2026-10.md T8 (the file
    # records 0.929 / 1.000 / 0.963, computed with DeBERTa's entailment and neutral swapped).
    # This replaces a 2026-08-18 comparison on an earlier 20-case test file, which predates the
    # grounding-score fixes and was never re-run.
    fig, ax = plt.subplots(figsize=(6.2, 1.8), dpi=300)
    baselines = ['A\nMiniLM only', 'B\nDeBERTa only', 'C\nCascade', 'D\n+ tool', 'E\n+ disagree', 'F\n+ drift', 'G\nFull pipeline*']
    precision = [0.733, 0.929, 0.929, 0.929, 0.929, 0.448, 0.812]
    recall =    [0.846, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000]
    f1 =        [0.786, 0.963, 0.963, 0.963, 0.963, 0.619, 0.897]

    x = np.arange(len(baselines))
    width = 0.24

    ax.bar(x - width, precision, width, label='Precision', color='#6366F1', edgecolor='#4338CA', alpha=0.9)
    ax.bar(x, recall, width, label='Recall', color='#10B981', edgecolor='#047857', alpha=0.9)
    ax.bar(x + width, f1, width, label='F1-Score', color='#2563EB', edgecolor='#1D4ED8', alpha=0.9)

    ax.set_ylabel('Score (0 - 1.0)', fontweight='bold', fontsize=7.5)
    ax.set_title('Ablation on v1.0_test, 30 cases (* G: corrected NLI labels, weight 0.5)', fontweight='bold', fontsize=8.5, pad=6)
    ax.set_xticks(x)
    ax.set_xticklabels(baselines, fontsize=6.5, fontweight='bold')
    # Head-room above 1.0 so the legend sits clear of the bars.
    ax.set_ylim(0, 1.38)
    ax.tick_params(axis='y', labelsize=7)
    ax.grid(axis='y', linestyle='--', alpha=0.3)
    ax.legend(loc='upper center', ncol=3, fontsize=7, framealpha=0.92)

    p2 = os.path.join(CHARTS_DIR, "chart_baselines.png")
    plt.savefig(p2, bbox_inches='tight')
    plt.close()

    # Chart 3: Compounding Error Mitigation
    fig, ax = plt.subplots(figsize=(6.2, 1.8), dpi=300)
    nodes = ['Node A\n(Planner)', 'Node B\n(Retriever - Fault)', 'Node C\n(Verifier)', 'Node D\n(Analyst)', 'Node E\n(Writer)']
    control = [0.002, 1.000, 0.992, 0.992, 0.992]
    active =  [0.002, 1.000, 0.009, 0.000, 0.000]

    x = np.arange(len(nodes))
    ax.plot(x, control, marker='o', color='#EF4444', linewidth=2.0, label='Condition A: Unmitigated Control (Outage Cascades)', markersize=6)
    ax.plot(x, active, marker='s', color='#10B981', linewidth=2.0, label='Condition B: Active Intervention (Mitigated at Node C)', markersize=6)

    for i, txt in enumerate(control):
        ax.annotate(f"{txt:.3f}", (x[i], control[i]), textcoords="offset points", xytext=(0,4), ha='center', fontsize=6.8, fontweight='bold', color='#DC2626')
    for i, txt in enumerate(active):
        offset = -11 if i >= 2 else -11
        ax.annotate(f"{txt:.3f}", (x[i], active[i]), textcoords="offset points", xytext=(0,offset), ha='center', fontsize=6.8, fontweight='bold', color='#047857')

    ax.set_ylabel('Contradiction Prob', fontweight='bold', fontsize=7.5)
    ax.set_title('5-Node Multi-Agent DAG: Compounding Error vs. Active Intervention', fontweight='bold', fontsize=8.5, pad=6)
    ax.set_xticks(x)
    ax.set_xticklabels(nodes, fontsize=7, fontweight='bold')
    ax.set_ylim(-0.1, 1.18)
    ax.tick_params(axis='y', labelsize=7)
    ax.grid(True, linestyle='--', alpha=0.3)
    ax.legend(loc='center right', fontsize=7, framealpha=0.92)
    
    p3 = os.path.join(CHARTS_DIR, "chart_compounding.png")
    plt.savefig(p3, bbox_inches='tight')
    plt.close()

# -------------------------------------------------------------
# 2. REPORTLAB NUMBERED CANVAS FOR HEADER / FOOTER
# -------------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 7.5)
            self.setFillColor(colors.HexColor('#0F172A'))
            self.drawString(36, 762, "AGENTPULSE: MASTER SCIENTIFIC & TECHNICAL REPORT")
            self.setFont("Helvetica", 7.5)
            self.setFillColor(colors.HexColor('#64748B'))
            self.drawRightString(576, 762, "Self-Hostable Multi-Agent LLM Observability")
            self.setStrokeColor(colors.HexColor('#CBD5E1'))
            self.setLineWidth(0.6)
            self.line(36, 756, 576, 756)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor('#CBD5E1'))
        self.setLineWidth(0.6)
        self.line(36, 36, 576, 36)
        
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(colors.HexColor('#2563EB'))
        self.drawString(36, 25, "AgentPulse")
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor('#64748B'))
        self.drawString(88, 25, "|   Continuous Grounding-Risk, Tool-Claim & Drift Monitoring")
        
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(576, 25, page_text)
        self.restoreState()


# -------------------------------------------------------------
# 3. PDF BUILDER SCRIPT
# -------------------------------------------------------------
def build_pdf(filename="PROJECT_REPORT.pdf"):
    generate_charts()

    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=42,
        bottomMargin=44
    )

    styles = getSampleStyleSheet()

    primary_color = colors.HexColor('#0F172A')
    accent_blue = colors.HexColor('#1D4ED8')
    light_bg = colors.HexColor('#F8FAFC')
    border_color = colors.HexColor('#CBD5E1')

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color,
        spaceAfter=3
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceAfter=7
    )
    meta_style = ParagraphStyle(
        'MetaStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor('#1E293B')
    )
    h1_style = ParagraphStyle(
        'H1Style',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=primary_color,
        spaceBefore=7,
        spaceAfter=4,
        keepWithNext=True
    )
    h2_style = ParagraphStyle(
        'H2Style',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=accent_blue,
        spaceBefore=5,
        spaceAfter=3,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=10.8,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=4
    )
    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor('#0F172A')
    )
    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8.8,
        textColor=colors.HexColor('#1E293B')
    )
    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.8,
        textColor=colors.HexColor('#0F172A')
    )
    table_cell_header = ParagraphStyle(
        'TableCellHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.8,
        textColor=colors.white
    )

    story = []

    # =============================================================
    # PAGE 1: TITLE, EXECUTIVE SUMMARY & ARCHITECTURE
    # =============================================================
    story.append(Paragraph("AGENTPULSE: MASTER SCIENTIFIC & TECHNICAL REPORT", title_style))
    story.append(Paragraph("A Lightweight, Self-Hostable Observability SDK for Continuous Grounding-Risk, Tool-Claim, and Drift Monitoring in Multi-Agent LLM Systems", subtitle_style))
    
    meta_data = [
        [
            Paragraph("<b>Category:</b> Industry-Trend AI Engineering", meta_style),
            Paragraph("<b>Primary Benchmark:</b> Qwen/Qwen3-8B-GGUF:Q4_K_M", meta_style),
            Paragraph("<b>Evaluation Cascade:</b> all-MiniLM-L6-v2 + DeBERTa-v3-small", meta_style)
        ],
        [
            Paragraph("<b>Reasoning Strategies:</b> Direct, CoT, AoT", meta_style),
            # In short: kappa is between two LLM-as-judge passes on 50 cases, not human annotators
            # (LABEL_AGREEMENT_REPORT.md). Test counts were run on main at 2fefb91 on 2026-10-25.
            Paragraph("<b>Label Agreement:</b> kappa = 0.922 (two LLM-judge passes, 50 cases)", meta_style),
            Paragraph("<b>Tests (25 Oct 2026):</b> <font color='#10B981'><b>422 backend + 136 dashboard passed</b></font>", meta_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[180, 180, 180])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), light_bg),
        ('BOX', (0, 0), (-1, -1), 0.75, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 4))

    story.append(Paragraph("1. Executive Summary & Problem Formulation", h1_style))
    story.append(Paragraph(
        "Modern enterprise AI systems are rapidly migrating from isolated single-prompt LLMs to collaborative multi-agent Directed Acyclic Graphs (DAGs) (e.g. LangGraph, AutoGen, CrewAI). In these pipelines, specialized autonomous agents decompose queries, retrieve evidence, execute deterministic calculations, verify assertions, and synthesize reports.",
        body_style
    ))
    story.append(Paragraph(
        "<b>The Multi-Agent Observability Blindspot:</b> Classical APM tools (Datadog, Prometheus, New Relic) and basic OpenTelemetry collectors assume that an <b>HTTP 200 payload with non-empty text signifies operational success</b>. In multi-agent DAGs, the most destructive failures produce zero software exceptions:",
        body_style
    ))

    fail_data = [
        [Paragraph("<b>1. Ungrounded Hallucination Propagation:</b> Upstream retriever/planner fabricates a citation or premise; downstream agents accept it as factual ground truth, compounding errors into executive reports.", callout_style)],
        [Paragraph("<b>2. Tool-Claim Fabrication:</b> An agent queries a database returning 3 records, but claims in natural language: <i>'We verified 14 matching accounts.'</i> No API error occurs, but the assertion is ungrounded.", callout_style)],
        [Paragraph("<b>3. Inter-Agent Contradiction:</b> Specialized agents operating over the same prompt generate mutually exclusive conclusions without reconciliation.", callout_style)],
        [Paragraph("<b>4. Silent Semantic & Behavioral Drift:</b> Subtle prompt updates, model quantization, or retrieval corpus changes degrade reliability over time before explicit failures occur.", callout_style)]
    ]
    fail_table = Table(fail_data, colWidths=[540])
    fail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FEF2F2')),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#FCA5A5')),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]))
    story.append(fail_table)
    story.append(Spacer(1, 4))

    story.append(Paragraph("2. System Architecture & Core Product Capabilities", h1_style))
    story.append(Paragraph(
        "AgentPulse is a self-hosted observability prototype (version 0.1.0): a lightweight client SDK, a FastAPI/SQLite backend with a durable job queue, a separate worker that runs two small local models on every span, a regex tool-claim check, a drift detector, and a React dashboard. One worker evaluated 3.9 spans/s on a 16-thread development machine (experiments/results/throughput_benchmark.json).",
        body_style
    ))

    arch_points = [
        [
            Paragraph("<b>• Fail-Open Async SDK:</b> Non-blocking memory buffer with node wrapper overhead of <b>0.005 ms (P50)</b> and a synthetic in-memory enqueue loop of 5.4M spans/sec (not network throughput).", body_style),
            Paragraph("<b>• Tool-Claim Check:</b> regex extraction of stated counts vs the tool's recorded result, <b>0.07 ms</b> per call, F1 0.842 on 19 hand-written cases but <b>F1 0.000 on real agent traces</b> (TOOL_CLAIM_EXTERNAL_TEST_REPORT.md).", body_style)
        ],
        [
            Paragraph("<b>• Two Local Models, Every Span:</b> <code>all-MiniLM-L6-v2</code> (~13 ms) and <code>nli-deberta-v3-small</code> (~70 ms; latency profile of 2026-08-18) both run on every span, with no LLM judge and no API cost.", body_style),
            Paragraph("<b>• Drift:</b> DRIFT_DETECTED when the mean embedding of an agent's latest 12 outputs is more than 0.30 (cosine) from the mean of its first 20; an Agent Stability Index (0-100) is kept beside it.", body_style)
        ]
    ]
    arch_table = Table(arch_points, colWidths=[270, 270])
    arch_table.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(arch_table)

    # PAGE BREAK -> PAGE 2
    story.append(PageBreak())

    # =============================================================
    # PAGE 2: MATHEMATICAL FORMULATION, LATENCY & REASONING STRATEGIES
    # =============================================================
    # In short: section 3 states the risk formula exactly as _aggregate_risk computes it (grounding and
    # tool-claim only) and the shipped weight-0.3 figures from GROUNDING_RECALIBRATION_2026-10.md.
    story.append(Paragraph("3. Mathematical Formulation & Latency Profiling", h1_style))
    story.append(Paragraph(
        "<b>Composite Grounding Risk Score Formulation:</b> For span <i>s</i> with input context <i>C<sub>in</sub></i>, output <i>O<sub>out</sub></i>, and tool records <i>T</i>:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<b>R(s) = [0.40 * G(C<sub>in</sub>, O<sub>out</sub>) + 0.25 * R<sub>tool</sub>(T, O<sub>out</sub>)] / (sum of the weights of the signals present)</b>,&nbsp; "
        "<b>G = P<sub>contradiction</sub> + 0.3 * P<sub>neutral</sub></b><br/>"
        "The tool term counts only when a claim was extracted. High risk above 0.7, medium above 0.4. The disagreement score (weight 0.20 declared) and the similarity (0.15) are stored but not summed (<code>backend/app/services/evaluator.py</code> <code>_aggregate_risk</code>). "
        "Shipped grounding score on the 30-case test split: F1 0.963, FPR 0.059 at both cut-offs; on the 47 truly held-out cases F1 0.927 (0.7) / 0.952 (0.4), FPR 0.074 (GROUNDING_RECALIBRATION_2026-10.md T3c, T3d). 5 of the 30 test cases copy dev cases; the 0.3 weight is a design choice.",
        body_style
    ))
    
    story.append(Paragraph("<b>13-Layer Latency Profile Breakdown (25 Repeated Runs, 16-Core CPU, run of 2026-08-18; layers 8, 9 and 13 are not measurements):</b>", h2_style))

    latency_rows = [
        [Paragraph("Layer Index & Description", table_cell_header), Paragraph("Mean", table_cell_header), Paragraph("P50", table_cell_header), Paragraph("P95", table_cell_header), Paragraph("Std Dev", table_cell_header), Paragraph("Measurement Scope", table_cell_header)],
        [Paragraph("1. Prompt Preparation", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("0.000 ms", table_cell), Paragraph("Template string formatting", table_cell)],
        [Paragraph("2. Model Inference Dispatch", table_cell), Paragraph("0.011 ms", table_cell), Paragraph("0.008 ms", table_cell), Paragraph("0.019 ms", table_cell), Paragraph("0.010 ms", table_cell), Paragraph("Canned-text adapter call, model weights not loaded", table_cell)],
        [Paragraph("3. Token Generation Telemetry", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.006 ms", table_cell), Paragraph("0.002 ms", table_cell), Paragraph("Same call, as the adapter reports it (a time, not tok/s)", table_cell)],
        [Paragraph("<b>4. Agent Node Execution</b>", table_cell_bold), Paragraph("<b>0.001 ms</b>", table_cell_bold), Paragraph("<b>0.001 ms</b>", table_cell_bold), Paragraph("<b>0.001 ms</b>", table_cell_bold), Paragraph("0.000 ms", table_cell), Paragraph("<b>Stand-in (builds a dict); SDK wrapper not called</b>", table_cell_bold)],
        [Paragraph("5. Local Tool Execution", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.006 ms", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("Stand-in (builds a list of 10 dicts); no tool run", table_cell)],
        [Paragraph("6. Local Vector Retrieval", table_cell), Paragraph("15.36 ms", table_cell), Paragraph("10.68 ms", table_cell), Paragraph("12.19 ms", table_cell), Paragraph("24.29 ms", table_cell), Paragraph("SentenceTransformer top-k search", table_cell)],
        [Paragraph("7. SDK In-Memory Enqueue", table_cell), Paragraph("0.025 ms", table_cell), Paragraph("0.016 ms", table_cell), Paragraph("0.032 ms", table_cell), Paragraph("0.037 ms", table_cell), Paragraph("Thread-safe deque append", table_cell)],
        [Paragraph("8. HTTP Ingestion Overhead", table_cell), Paragraph("n/m", table_cell), Paragraph("n/m", table_cell), Paragraph("n/m", table_cell), Paragraph("n/m", table_cell), Paragraph("Random number in the script; no HTTP request sent", table_cell)],
        [Paragraph("9. Evaluation Worker Dispatch", table_cell), Paragraph("n/m", table_cell), Paragraph("n/m", table_cell), Paragraph("n/m", table_cell), Paragraph("n/m", table_cell), Paragraph("Random number in the script; nothing dispatched", table_cell)],
        [Paragraph("<b>10. MiniLM Embedding Inference</b>", table_cell_bold), Paragraph("<b>13.33 ms</b>", table_cell_bold), Paragraph("<b>12.81 ms</b>", table_cell_bold), Paragraph("<b>14.95 ms</b>", table_cell_bold), Paragraph("1.483 ms", table_cell), Paragraph("<b>Embedding similarity, every span</b>", table_cell_bold)],
        [Paragraph("<b>11. DeBERTa NLI Cross-Encoder</b>", table_cell_bold), Paragraph("<b>70.82 ms</b>", table_cell_bold), Paragraph("<b>66.92 ms</b>", table_cell_bold), Paragraph("<b>71.88 ms</b>", table_cell_bold), Paragraph("21.46 ms", table_cell), Paragraph("<b>NLI classification, every span</b>", table_cell_bold)],
        [Paragraph("<b>12. Full Evaluation Cascade</b>", table_cell_bold), Paragraph("<b>90.81 ms</b>", table_cell_bold), Paragraph("<b>90.96 ms</b>", table_cell_bold), Paragraph("<b>97.79 ms</b>", table_cell_bold), Paragraph("4.339 ms", table_cell), Paragraph("<b>MiniLM + DeBERTa + tool check</b>", table_cell_bold)],
        [Paragraph("<b>13. Entire Multi-Agent DAG</b>", table_cell_bold), Paragraph("n/m", table_cell_bold), Paragraph("n/m", table_cell_bold), Paragraph("n/m", table_cell_bold), Paragraph("n/m", table_cell), Paragraph("Computed from layers 2, 6 and 12, not timed", table_cell)]
    ]
    lat_table = Table(latency_rows, colWidths=[126, 48, 48, 48, 50, 220])
    lat_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(lat_table)
    story.append(Spacer(1, 4))

    story.append(Paragraph("4. Reasoning Strategy Evaluation: Direct vs. CoT vs. AoT", h1_style))
    story.append(Paragraph(
        "Evaluated on <b>Qwen/Qwen3-8B-GGUF:Q4_K_M</b> (llama.cpp, CPU only) across <code>v1.0_test</code> (30 cases x 5 runs per strategy, run of 2026-08-23, <code>experiments/results/reasoning_strategy_results.json</code>). Latency is the mean per strategy execution; risk differences between strategies are inconclusive:",
        body_style
    ))

    rs_img = os.path.join(CHARTS_DIR, "chart_reasoning.png")
    if os.path.exists(rs_img):
        story.append(Image(rs_img, width=510, height=165))
        story.append(Spacer(1, 2))

    rs_rows = [
        [Paragraph("Reasoning Strategy", table_cell_header), Paragraph("Latency (ms)", table_cell_header), Paragraph("Tokens In", table_cell_header), Paragraph("Tokens Out", table_cell_header), Paragraph("Mean Risk", table_cell_header), Paragraph("Contradiction Rate", table_cell_header), Paragraph("Empirical Conclusion", table_cell_header)],
        [Paragraph("<b>DIRECT (Zero-Shot)</b>", table_cell), Paragraph("11,564 ms", table_cell), Paragraph("53.1", table_cell), Paragraph("37.5", table_cell), Paragraph("0.424", table_cell), Paragraph("0.133", table_cell), Paragraph("Fastest and cheapest; highest mean risk, but within noise.", table_cell)],
        [Paragraph("<b>COT (Chain-of-Thought)</b>", table_cell), Paragraph("45,423 ms", table_cell), Paragraph("88.1", table_cell), Paragraph("186.4", table_cell), Paragraph("0.283", table_cell), Paragraph("0.127", table_cell), Paragraph("Middle on latency and tokens; no risk advantage shown.", table_cell)],
        [Paragraph("<b>AOT (Atom of Thoughts)</b>", table_cell), Paragraph("85,215 ms", table_cell), Paragraph("543.4", table_cell), Paragraph("319.7", table_cell), Paragraph("0.233", table_cell), Paragraph("0.000", table_cell), Paragraph("Slowest; ~8.5x DIRECT output tokens; zero contradictions in 150 runs.", table_cell)]
    ]
    rs_table = Table(rs_rows, colWidths=[105, 52, 45, 45, 48, 65, 180])
    rs_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(rs_table)

    # PAGE BREAK -> PAGE 3
    story.append(PageBreak())

    # =============================================================
    # PAGE 3: BASELINES & COMPOUNDING ERROR MITIGATION
    # =============================================================
    story.append(Paragraph("5. Architectural Ablation", h1_style))
    story.append(Paragraph(
        "Seven configurations on <code>v1.0_test</code> (30 cases; thresholds chosen on the 21-case dev split and applied unchanged), run of 2026-09-18 on the PyTorch path (<code>experiments/results/ablation_results.json</code>). "
        "Configuration G is shown re-scored on corrected NLI labels at the 0.5 weight it ran with (GROUNDING_RECALIBRATION_2026-10.md T8); it has not been re-run at the shipped 0.3. "
        "An earlier comparison against four baselines (2026-08-18, a 20-case test file) predates the grounding-score fixes and was not re-run, so it is no longer shown.",
        body_style
    ))

    bl_img = os.path.join(CHARTS_DIR, "chart_baselines.png")
    if os.path.exists(bl_img):
        story.append(Image(bl_img, width=510, height=148))
        story.append(Spacer(1, 2))

    bl_rows = [
        [Paragraph("System / Configuration", table_cell_header), Paragraph("Precision", table_cell_header), Paragraph("Recall", table_cell_header), Paragraph("F1-Score", table_cell_header), Paragraph("FPR", table_cell_header), Paragraph("FNR", table_cell_header), Paragraph("Latency", table_cell_header), Paragraph("Key Trade-off", table_cell_header)],
        # In short: one row per ablation configuration, values from ablation_results.json except G.
        [Paragraph("A: MiniLM embedding only", table_cell), Paragraph("0.733", table_cell), Paragraph("0.846", table_cell), Paragraph("0.786", table_cell), Paragraph("0.235", table_cell), Paragraph("0.154", table_cell), Paragraph("19.10 ms", table_cell), Paragraph("Similarity alone misses contradictions.", table_cell)],
        [Paragraph("B: DeBERTa NLI only", table_cell), Paragraph("0.929", table_cell), Paragraph("1.000", table_cell), Paragraph("0.963", table_cell), Paragraph("0.059", table_cell), Paragraph("0.000", table_cell), Paragraph("132.09 ms", table_cell), Paragraph("The signal that does the work.", table_cell)],
        [Paragraph("<b>C: MiniLM + DeBERTa (shipped)</b>", table_cell_bold), Paragraph("<b>0.929</b>", table_cell_bold), Paragraph("<b>1.000</b>", table_cell_bold), Paragraph("<b>0.963</b>", table_cell_bold), Paragraph("0.059", table_cell), Paragraph("0.000", table_cell), Paragraph("<b>151.19 ms</b>", table_cell_bold), Paragraph("Both models on every span; MiniLM adds no F1.", table_cell)],
        [Paragraph("D: NLI + tool-claim", table_cell), Paragraph("0.929", table_cell), Paragraph("1.000", table_cell), Paragraph("0.963", table_cell), Paragraph("0.059", table_cell), Paragraph("0.000", table_cell), Paragraph("132.13 ms", table_cell), Paragraph("Single-agent cases cannot exercise it.", table_cell)],
        [Paragraph("E: NLI + disagreement", table_cell), Paragraph("0.929", table_cell), Paragraph("1.000", table_cell), Paragraph("0.963", table_cell), Paragraph("0.059", table_cell), Paragraph("0.000", table_cell), Paragraph("281.02 ms", table_cell), Paragraph("Same; 0 of 10 on real multi-agent traces.", table_cell)],
        [Paragraph("F: NLI + drift", table_cell), Paragraph("0.448", table_cell), Paragraph("1.000", table_cell), Paragraph("0.619", table_cell), Paragraph("0.941", table_cell), Paragraph("0.000", table_cell), Paragraph("145.58 ms", table_cell), Paragraph("Cold-start drift on non-temporal data.", table_cell)],
        [Paragraph("G: Full pipeline*", table_cell), Paragraph("0.812", table_cell), Paragraph("1.000", table_cell), Paragraph("0.897", table_cell), Paragraph("0.176", table_cell), Paragraph("0.000", table_cell), Paragraph("165.18 ms", table_cell), Paragraph("*Corrected labels, weight 0.5; file says 0.963.", table_cell)]
    ]
    bl_table = Table(bl_rows, colWidths=[125, 42, 42, 42, 36, 36, 50, 167])
    bl_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(bl_table)
    story.append(Spacer(1, 5))

    story.append(Paragraph("6. 5-Node Compounding Error: Control vs. Active Intervention", h1_style))
    story.append(Paragraph(
        "Evaluated on a 5-node pipeline (<code>Planner -&gt; Retriever -&gt; Verifier -&gt; Analyst -&gt; Writer</code>) with an ungrounded assertion injected at Node B. "
        "Risks are the corrected-label re-run at weight 0.5 (<code>experiments/results/grounding_recalibration_2026-10-22_compounding.json</code>); the contradiction probabilities in the chart do not depend on the label order. "
        "At the shipped weight 0.3 the intervening nodes C-E score about 0.30 (low), Node A 0.006 (derived from the stored probabilities, not re-run):",
        body_style
    ))

    cp_img = os.path.join(CHARTS_DIR, "chart_compounding.png")
    if os.path.exists(cp_img):
        story.append(Image(cp_img, width=510, height=148))
        story.append(Spacer(1, 2))

    # In short: risks are the corrected-label re-run at weight 0.5; the contradiction probabilities
    # (second number) do not depend on the label order. The old 0.989 for Node A came from the swapped labels.
    cp_rows = [
        [Paragraph("Pipeline Node", table_cell_header), Paragraph("Condition A: Control (Risk / Contra Prob)", table_cell_header), Paragraph("Condition B: Active Intervention (Risk / Contra Prob)", table_cell_header), Paragraph("Operational Outcome", table_cell_header)],
        [Paragraph("Node A (Planner)", table_cell), Paragraph("0.008 / 0.002", table_cell), Paragraph("0.008 / 0.002", table_cell), Paragraph("Premise compared with itself: entailment 0.9865.", table_cell)],
        [Paragraph("<b>Node B (Retriever - Fault)</b>", table_cell_bold), Paragraph("<font color='#DC2626'><b>1.000 / 1.000 (Fault Injected)</b></font>", table_cell), Paragraph("<font color='#DC2626'><b>1.000 / 1.000 (Fault Injected)</b></font>", table_cell), Paragraph("Fabricated citation injected into stream.", table_cell)],
        [Paragraph("<b>Node C (Verifier)</b>", table_cell_bold), Paragraph("<font color='#DC2626'>0.996 / 0.992 (Propagated)</font>", table_cell), Paragraph("<font color='#B45309'><b>0.504 / 0.009 (Contradiction stopped)</b></font>", table_cell_bold), Paragraph("<b>Contradiction no longer propagates; output is neutral, not entailed.</b>", table_cell_bold)],
        [Paragraph("Node D (Analyst)", table_cell), Paragraph("<font color='#DC2626'>0.996 / 0.992 (Corrupted)</font>", table_cell), Paragraph("<font color='#B45309'><b>0.500 / 0.000 (Neutral)</b></font>", table_cell), Paragraph("Medium at weight 0.5; about 0.30 (low) at 0.3.", table_cell)],
        [Paragraph("Node E (Writer)", table_cell), Paragraph("<font color='#DC2626'>0.996 / 0.992 (Corrupted)</font>", table_cell), Paragraph("<font color='#B45309'><b>0.500 / 0.000 (Neutral)</b></font>", table_cell), Paragraph("Medium at weight 0.5; about 0.30 (low) at 0.3.", table_cell)]
    ]
    cp_table = Table(cp_rows, colWidths=[115, 140, 140, 145])
    cp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(cp_table)

    # PAGE BREAK -> PAGE 4
    story.append(PageBreak())

    # =============================================================
    # PAGE 4: DRIFT BENCHMARK, TEST SUITE & VIVA DEFENSE
    # =============================================================
    # In short: the synthetic drift benchmark, reported with its 2-of-5 detection and the untested
    # 0.30 path, followed by the real-text result of the shipped window-mean rule.
    story.append(Paragraph("7. Graded Drift Benchmark with Negative Controls", h1_style))
    story.append(Paragraph(
        "11 synthetic scenarios with graded shifts and negative controls (<code>experiments/drift_scenarios.py</code>, the per-output distance used in August). 2 of 5 anomalies were detected and 0 of 6 non-anomalies raised an alert, but no scenario reached the 0.30 centroid threshold, so that path was untested (DRIFT_EXPERIMENT_REPORT.md). "
        "The shipped rule now compares window means (first 20 vs latest 12 outputs): offline on a held-out real-trace split, measured once, 1.5% false alarms and 91.9% detection, with only 24.5% of sessions long enough to report (DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md 11.3):",
        body_style
    ))

    drift_rows = [
        [Paragraph("Scenario / Condition", table_cell_header), Paragraph("Category", table_cell_header), Paragraph("Magnitude", table_cell_header), Paragraph("True Anomaly?", table_cell_header), Paragraph("Detected?", table_cell_header), Paragraph("False Alert?", table_cell_header), Paragraph("Detection Delay", table_cell_header), Paragraph("Final ASI", table_cell_header)],
        [Paragraph("Prompt Formatting Change", table_cell), Paragraph("prompt_drift", table_cell), Paragraph("0.10", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("100.0 / 100", table_cell)],
        [Paragraph("Prompt Tone Shift", table_cell), Paragraph("prompt_drift", table_cell), Paragraph("0.25", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("99.7 / 100", table_cell)],
        [Paragraph("Prompt Template Rewrite", table_cell), Paragraph("prompt_drift", table_cell), Paragraph("0.50", table_cell), Paragraph("Yes", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("98.5 / 100", table_cell)],
        [Paragraph("Model Version Update", table_cell), Paragraph("model_drift", table_cell), Paragraph("0.50", table_cell), Paragraph("Yes", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("98.5 / 100", table_cell)],
        [Paragraph("Temperature Shift (0.1 to 0.9)", table_cell), Paragraph("hyperparam", table_cell), Paragraph("0.35", table_cell), Paragraph("Yes", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("99.4 / 100", table_cell)],
        [Paragraph("Tool Frequency Fluctuation", table_cell), Paragraph("tool_entropy", table_cell), Paragraph("0.25", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("99.7 / 100", table_cell)],
        [Paragraph("<b>Uncalibrated External Tool</b>", table_cell_bold), Paragraph("tool_entropy", table_cell), Paragraph("0.60", table_cell), Paragraph("Yes", table_cell), Paragraph("<b>Yes</b>", table_cell_bold), Paragraph("No", table_cell), Paragraph("<b>1 span</b>", table_cell_bold), Paragraph("<b>82.7 / 100</b>", table_cell_bold)],
        [Paragraph("<b>Hallucination Burst</b>", table_cell_bold), Paragraph("quality_regress", table_cell), Paragraph("0.75", table_cell), Paragraph("Yes", table_cell), Paragraph("<b>Yes</b>", table_cell_bold), Paragraph("No", table_cell), Paragraph("<b>1 span</b>", table_cell_bold), Paragraph("<b>96.5 / 100</b>", table_cell_bold)],
        [Paragraph("Negative Control: Paraphrasing", table_cell), Paragraph("neg_control", table_cell), Paragraph("0.12", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("100.0 / 100", table_cell)],
        [Paragraph("Negative Control: Valid Tool", table_cell), Paragraph("neg_control", table_cell), Paragraph("0.15", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("99.9 / 100", table_cell)],
        [Paragraph("Negative Control: Invariant Flow", table_cell), Paragraph("neg_control", table_cell), Paragraph("0.00", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("No", table_cell), Paragraph("N/A", table_cell), Paragraph("100.0 / 100", table_cell)]
    ]
    drift_table = Table(drift_rows, colWidths=[125, 65, 45, 55, 45, 48, 67, 90])
    drift_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(drift_table)
    story.append(Spacer(1, 4))

    story.append(Paragraph("8. Label Agreement & 9. Test Suite", h1_style))
    
    # In short: label agreement is between two LLM-judge passes (not humans); test counts are the
    # ones measured on main on 2026-10-25, replacing the old "92 / 92".
    val_data = [
        [
            Paragraph("<b>Label agreement (two LLM-as-judge passes, not human annotators):</b><br/>"
                      "• <b>Dual-evaluated cases:</b> <code>v1.0_dev</code> 15, <code>v1.0_val</code> 15, <code>v1.0_test</code> 20 (full splits 21 / 22 / 30; 5 test cases copy dev cases).<br/>"
                      "• <b>Observed Agreement (p<sub>o</sub>):</b> 0.960 &nbsp;|&nbsp; <b>Chance Agreement (p<sub>e</sub>):</b> 0.490<br/>"
                      "• <b>Cohen's Kappa:</b> <b>0.922</b> between two LLM passes; not human-verified ground truth (LABEL_AGREEMENT_REPORT.md).", body_style),
            Paragraph("<b>Automated tests, run on 25 Oct 2026 (main at 2fefb91):</b><br/>"
                      "• <b>Backend:</b> <font color='#10B981'><b>422 passed</b></font> (<code>pytest tests/</code>, 335.91 s, real models loaded)<br/>"
                      "• <b>Dashboard:</b> <font color='#10B981'><b>136 passed</b></font> in 13 files (<code>npx vitest run</code>)<br/>"
                      "• <b>Coverage:</b> SDK queue and decorators, ingest, durable job queue and crash recovery, NLI grounding, tool-claim, drift, alerting, migrations, retention, dashboard adapters.", body_style)
        ]
    ]
    val_table = Table(val_data, colWidths=[270, 270])
    val_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), light_bg),
        ('BOX', (0, 0), (-1, -1), 0.75, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(val_table)
    story.append(Spacer(1, 4))

    story.append(Paragraph("10. Examiner Hostile Review & Viva Defense Summary", h1_style))

    # In short: four likely examiner questions with answers that match the measured results,
    # including the negative ones (tool-claim F1 0.000, disagreement 0 of 10).
    viva_qa = [
        [Paragraph("<b>Q1: What exactly did your latency timers measure?</b><br/>"
                   "<b>Defense:</b> We profiled 13 layers (<code>experiments/latency_profiler.py</code>); layers 8, 9 and 13 are not measurements (two random numbers and a sum, marked n/m) and layers 4 and 5 time small stand-ins. String templating took &lt;0.002 ms, the SDK decorator added 0.005 ms (P50, 2,000 calls, <code>benchmarks/run_benchmarks.py</code>), local MiniLM forward pass took 12.8 ms (P50), and DeBERTa NLI took 66.9 ms (P50). We distinguish between in-memory queue append (0.016 ms) and neural model inference.", callout_style)],
        [Paragraph("<b>Q2: Do the extra signals beat NLI alone?</b><br/>"
                   "<b>Answer:</b> No, not on this data. On the 30-case test split, tool-claim (D) and disagreement (E) tie with NLI alone (B) because single-agent cases cannot exercise them, drift folded into the score (F) is worse (F1 0.619), and the full pipeline (G) is 0.897 on corrected labels. On real traces tool-claim scored F1 0.000 and disagreement found 0 of 10 labelled contradictions; its alert is withdrawn. Grounding and drift are the signals that held up.", callout_style)],
        [Paragraph("<b>Q3: Does Atom of Thoughts (AoT) actually improve factual grounding?</b><br/>"
                   "<b>Defense:</b> Not shown. On Qwen3-8B Q4_K_M (30 cases x 5 runs), AoT produced about 8.5x DIRECT's output tokens (319.7 vs 37.5) and took 85.2 s per execution against 11.6 s. It had the lowest mean grounding risk (0.233, against 0.283 for CoT and 0.424 for DIRECT) and no contradictions in 150 runs, but the spread between strategy means (0.191) is smaller than the within-strategy standard deviation (0.377), so the risk ordering is inconclusive. The zero-contradiction result is the part the data supports.", callout_style)],
        [Paragraph("<b>Q4: How does AgentPulse prevent false alerts on benign phrasing shifts?</b><br/>"
                   "<b>Answer:</b> In the synthetic scenarios the three negative controls measured centroid distances of 0.000 to 0.002 and raised 0 alerts; the 0.30 threshold was not tuned, and no scenario reached it, so 3 of 5 real anomalies were missed. On real agent text the shipped window-mean rule gave 1.5% false alarms on a held-out split, but only on the 24.5% of sessions long enough to report (DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md).", callout_style)]
    ]
    viva_table = Table(viva_qa, colWidths=[540])
    viva_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]))
    story.append(viva_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated PDF: {filename}")

if __name__ == "__main__":
    out_path = os.path.join(os.path.dirname(__file__), "PROJECT_REPORT.pdf")
    build_pdf(out_path)
