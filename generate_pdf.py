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
    risk = [0.251, 0.127, 0.270]
    tokens_in = [32.6, 64.6, 341.9]
    
    x = np.arange(len(strategies))
    width = 0.32

    color_risk = '#2563EB'
    color_tokens = '#F59E0B'

    rects1 = ax1.bar(x - width/2, risk, width, label='Grounding Risk (Lower = Better)', color=color_risk, edgecolor='#1E40AF', alpha=0.9)
    ax1.set_ylabel('Grounding Risk (0 - 1.0)', color='#0F172A', fontweight='bold', fontsize=7.5)
    ax1.set_ylim(0, 0.35)
    ax1.tick_params(axis='y', labelcolor='#0F172A', labelsize=7)
    ax1.set_xticks(x)
    ax1.set_xticklabels(strategies, fontsize=7.5, fontweight='bold')
    ax1.grid(axis='y', linestyle='--', alpha=0.3)

    ax2 = ax1.twinx()
    rects2 = ax2.bar(x + width/2, tokens_in, width, label='Input Tokens (Cost)', color=color_tokens, edgecolor='#B45309', alpha=0.9)
    ax2.set_ylabel('Mean Input Tokens', color='#0F172A', fontweight='bold', fontsize=7.5)
    ax2.set_ylim(0, 420)
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
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', fontsize=7, framealpha=0.92)
    plt.title('Reasoning Strategy Benchmark on Qwen 2.5 7B Instruct (v1.0_test)', fontsize=8.5, fontweight='bold', pad=6)
    
    p1 = os.path.join(CHARTS_DIR, "chart_reasoning.png")
    plt.savefig(p1, bbox_inches='tight')
    plt.close()

    # Chart 2: Baselines Comparison
    fig, ax = plt.subplots(figsize=(6.2, 1.8), dpi=300)
    baselines = ['Baseline A\n(No Monitoring)', 'Baseline B\n(25% Sampled)', 'Baseline C\n(Cosine Only)', 'Baseline D\n(NLI Only)', 'AgentPulse\n(Full Cascade)']
    precision = [1.000, 0.750, 0.833, 0.889, 0.727]
    recall =    [0.125, 0.750, 0.625, 1.000, 1.000]
    f1 =        [0.222, 0.750, 0.714, 0.941, 0.842]

    x = np.arange(len(baselines))
    width = 0.24

    ax.bar(x - width, precision, width, label='Precision', color='#6366F1', edgecolor='#4338CA', alpha=0.9)
    ax.bar(x, recall, width, label='Recall (0% Missed Errors)', color='#10B981', edgecolor='#047857', alpha=0.9)
    ax.bar(x + width, f1, width, label='F1-Score', color='#2563EB', edgecolor='#1D4ED8', alpha=0.9)

    ax.set_ylabel('Score (0 - 1.0)', fontweight='bold', fontsize=7.5)
    ax.set_title('Detection Quality vs. Industry Baselines (v1.0_test)', fontweight='bold', fontsize=8.5, pad=6)
    ax.set_xticks(x)
    ax.set_xticklabels(baselines, fontsize=7, fontweight='bold')
    ax.set_ylim(0, 1.18)
    ax.tick_params(axis='y', labelsize=7)
    ax.grid(axis='y', linestyle='--', alpha=0.3)
    ax.legend(loc='upper left', fontsize=7, framealpha=0.92)

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
            Paragraph("<b>Primary Benchmark:</b> Qwen/Qwen2.5-7B-Instruct", meta_style),
            Paragraph("<b>Evaluation Cascade:</b> all-MiniLM-L6-v2 + DeBERTa-v3-small", meta_style)
        ],
        [
            Paragraph("<b>Reasoning Strategies:</b> Direct, CoT, AoT", meta_style),
            Paragraph("<b>Inter-Annotator Agreement:</b> kappa = 0.922 (High Reliability)", meta_style),
            Paragraph("<b>Automated Test Suite:</b> <font color='#10B981'><b>92 / 92 Passed (100% Pass Rate)</b></font>", meta_style)
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
        "AgentPulse provides an end-to-end local observability platform comprising an ultra-lightweight client SDK, a high-throughput FastAPI/SQLite backend, a local neural evaluation cascade, deterministic tool verification, a 4-signal temporal drift engine, and a React control plane.",
        body_style
    ))

    arch_points = [
        [
            Paragraph("<b>• Fail-Open Async SDK:</b> Non-blocking memory buffer with node wrapper overhead of <b>0.005 ms (P50)</b> and throughput > 5.3M spans/sec.", body_style),
            Paragraph("<b>• Deterministic Tool Validator:</b> RegEx entity extraction matching counts/names vs actual tool logs in <b>0.22 ms</b>.", body_style)
        ],
        [
            Paragraph("<b>• Two-Stage Evaluation Cascade:</b> <code>all-MiniLM-L6-v2</code> (~13 ms) + <code>nli-deberta-v3-small</code> (~70 ms) running locally with 0 API cost.", body_style),
            Paragraph("<b>• 4-Signal Drift & ASI Engine:</b> Continuous 0–100 Agent Stability Index tracking semantic drift, tool entropy, and error rates.", body_style)
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
    story.append(Paragraph("3. Mathematical Formulation & Latency Profiling", h1_style))
    story.append(Paragraph(
        "<b>Composite Grounding Risk Score Formulation:</b> For span <i>s</i> with input context <i>C<sub>in</sub></i>, output <i>O<sub>out</sub></i>, and tool records <i>T</i>:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<b>R(s) = 0.40 * P<sub>contradiction</sub>(C<sub>in</sub>, O<sub>out</sub>) + 0.25 * R<sub>tool</sub>(T, O<sub>out</sub>) + 0.20 * R<sub>disagree</sub> + 0.15 * (1 - sim(C<sub>in</sub>, O<sub>out</sub>))</b>",
        body_style
    ))
    
    story.append(Paragraph("<b>13-Layer Latency Profile Breakdown (25 Repeated Runs, 16-Core CPU):</b>", h2_style))

    latency_rows = [
        [Paragraph("Layer Index & Description", table_cell_header), Paragraph("Mean", table_cell_header), Paragraph("P50", table_cell_header), Paragraph("P95", table_cell_header), Paragraph("Std Dev", table_cell_header), Paragraph("Measurement Scope", table_cell_header)],
        [Paragraph("1. Prompt Preparation", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("0.000 ms", table_cell), Paragraph("Template string formatting", table_cell)],
        [Paragraph("2. Model Inference Dispatch", table_cell), Paragraph("0.011 ms", table_cell), Paragraph("0.008 ms", table_cell), Paragraph("0.019 ms", table_cell), Paragraph("0.010 ms", table_cell), Paragraph("LLM client wrapper dispatch", table_cell)],
        [Paragraph("3. Token Generation Telemetry", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.006 ms", table_cell), Paragraph("0.002 ms", table_cell), Paragraph("Stream tracking overhead", table_cell)],
        [Paragraph("<b>4. Agent Node Execution</b>", table_cell_bold), Paragraph("<b>0.001 ms</b>", table_cell_bold), Paragraph("<b>0.001 ms</b>", table_cell_bold), Paragraph("<b>0.001 ms</b>", table_cell_bold), Paragraph("0.000 ms", table_cell), Paragraph("<b>SDK @pulse.monitor wrapper</b>", table_cell_bold)],
        [Paragraph("5. Local Tool Execution", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.003 ms", table_cell), Paragraph("0.006 ms", table_cell), Paragraph("0.001 ms", table_cell), Paragraph("Deterministic tool dispatch", table_cell)],
        [Paragraph("6. Local Vector Retrieval", table_cell), Paragraph("15.36 ms", table_cell), Paragraph("10.68 ms", table_cell), Paragraph("12.19 ms", table_cell), Paragraph("24.29 ms", table_cell), Paragraph("SentenceTransformer top-k search", table_cell)],
        [Paragraph("7. SDK In-Memory Enqueue", table_cell), Paragraph("0.025 ms", table_cell), Paragraph("0.016 ms", table_cell), Paragraph("0.032 ms", table_cell), Paragraph("0.037 ms", table_cell), Paragraph("Thread-safe deque append", table_cell)],
        [Paragraph("8. HTTP Ingestion Overhead", table_cell), Paragraph("0.981 ms", table_cell), Paragraph("0.981 ms", table_cell), Paragraph("1.108 ms", table_cell), Paragraph("0.084 ms", table_cell), Paragraph("FastAPI JSON serialization", table_cell)],
        [Paragraph("9. Evaluation Worker Dispatch", table_cell), Paragraph("0.149 ms", table_cell), Paragraph("0.152 ms", table_cell), Paragraph("0.169 ms", table_cell), Paragraph("0.014 ms", table_cell), Paragraph("Async background dispatch", table_cell)],
        [Paragraph("<b>10. MiniLM Embedding Inference</b>", table_cell_bold), Paragraph("<b>13.33 ms</b>", table_cell_bold), Paragraph("<b>12.81 ms</b>", table_cell_bold), Paragraph("<b>14.95 ms</b>", table_cell_bold), Paragraph("1.483 ms", table_cell), Paragraph("<b>Stage 1 bi-encoder triage</b>", table_cell_bold)],
        [Paragraph("<b>11. DeBERTa NLI Cross-Encoder</b>", table_cell_bold), Paragraph("<b>70.82 ms</b>", table_cell_bold), Paragraph("<b>66.92 ms</b>", table_cell_bold), Paragraph("<b>71.88 ms</b>", table_cell_bold), Paragraph("21.46 ms", table_cell), Paragraph("<b>Stage 2 contradiction verification</b>", table_cell_bold)],
        [Paragraph("<b>12. Full Evaluation Cascade</b>", table_cell_bold), Paragraph("<b>90.81 ms</b>", table_cell_bold), Paragraph("<b>90.96 ms</b>", table_cell_bold), Paragraph("<b>97.79 ms</b>", table_cell_bold), Paragraph("4.339 ms", table_cell), Paragraph("<b>Total Stage 1 + Stage 2 + Tool</b>", table_cell_bold)],
        [Paragraph("<b>13. Entire Multi-Agent DAG</b>", table_cell_bold), Paragraph("106.20 ms", table_cell_bold), Paragraph("106.20 ms", table_cell_bold), Paragraph("106.20 ms", table_cell_bold), Paragraph("0.000 ms", table_cell), Paragraph("End-to-end multi-node execution", table_cell)]
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
        "Evaluated on <b>Qwen/Qwen2.5-7B-Instruct</b> across <code>v1.0_test</code> (300 total executions across 5 seeds per case):",
        body_style
    ))

    rs_img = os.path.join(CHARTS_DIR, "chart_reasoning.png")
    if os.path.exists(rs_img):
        story.append(Image(rs_img, width=510, height=165))
        story.append(Spacer(1, 2))

    rs_rows = [
        [Paragraph("Reasoning Strategy", table_cell_header), Paragraph("Latency (ms)", table_cell_header), Paragraph("Tokens In", table_cell_header), Paragraph("Tokens Out", table_cell_header), Paragraph("Mean Risk", table_cell_header), Paragraph("Contradiction Rate", table_cell_header), Paragraph("Empirical Conclusion", table_cell_header)],
        [Paragraph("<b>DIRECT (Zero-Shot)</b>", table_cell), Paragraph("0.04 ms", table_cell), Paragraph("32.6", table_cell), Paragraph("11.5", table_cell), Paragraph("0.251", table_cell), Paragraph("0.150", table_cell), Paragraph("Fastest token execution; moderate risk.", table_cell)],
        [Paragraph("<b>COT (Chain-of-Thought)</b>", table_cell_bold), Paragraph("0.05 ms", table_cell), Paragraph("64.6", table_cell), Paragraph("12.4", table_cell), Paragraph("<b>0.127</b>", table_cell_bold), Paragraph("<b>0.150</b>", table_cell_bold), Paragraph("<b>Optimal: lowest grounding risk & high cost efficiency.</b>", table_cell_bold)],
        [Paragraph("<b>AOT (Atom of Thoughts)</b>", table_cell), Paragraph("0.15 ms", table_cell), Paragraph("341.9", table_cell), Paragraph("87.8", table_cell), Paragraph("0.270", table_cell), Paragraph("0.350", table_cell), Paragraph("~10x token consumption without accuracy gain.", table_cell)]
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
    story.append(Paragraph("5. Baselines Comparison & Architectural Ablation", h1_style))
    story.append(Paragraph(
        "Benchmarked on the standardized 20-case test split (<code>v1.0_test</code>) against common production monitoring architectures:",
        body_style
    ))

    bl_img = os.path.join(CHARTS_DIR, "chart_baselines.png")
    if os.path.exists(bl_img):
        story.append(Image(bl_img, width=510, height=148))
        story.append(Spacer(1, 2))

    bl_rows = [
        [Paragraph("System / Configuration", table_cell_header), Paragraph("Precision", table_cell_header), Paragraph("Recall", table_cell_header), Paragraph("F1-Score", table_cell_header), Paragraph("FPR", table_cell_header), Paragraph("FNR", table_cell_header), Paragraph("Latency", table_cell_header), Paragraph("Key Trade-off", table_cell_header)],
        [Paragraph("Baseline A: No Monitoring", table_cell), Paragraph("1.000", table_cell), Paragraph("0.125", table_cell), Paragraph("0.222", table_cell), Paragraph("0.000", table_cell), Paragraph("0.875", table_cell), Paragraph("0.00 ms", table_cell), Paragraph("Misses 87.5% of hallucinations.", table_cell)],
        [Paragraph("Baseline B: 25% Sampled", table_cell), Paragraph("0.750", table_cell), Paragraph("0.750", table_cell), Paragraph("0.750", table_cell), Paragraph("0.167", table_cell), Paragraph("0.250", table_cell), Paragraph("53.18 ms", table_cell), Paragraph("Misses 1 in 4 outages silently.", table_cell)],
        [Paragraph("Baseline C: Cosine Embedding", table_cell), Paragraph("0.833", table_cell), Paragraph("0.625", table_cell), Paragraph("0.714", table_cell), Paragraph("0.083", table_cell), Paragraph("0.375", table_cell), Paragraph("15.09 ms", table_cell), Paragraph("Cannot detect subtle numerical/logic errors.", table_cell)],
        [Paragraph("Baseline D: Raw NLI Only", table_cell), Paragraph("0.889", table_cell), Paragraph("1.000", table_cell), Paragraph("0.941", table_cell), Paragraph("0.083", table_cell), Paragraph("0.000", table_cell), Paragraph("72.60 ms", table_cell), Paragraph("No tool-claim or multi-span drift tracking.", table_cell)],
        [Paragraph("<b>AgentPulse (Full Cascade)</b>", table_cell_bold), Paragraph("<b>0.727</b>", table_cell_bold), Paragraph("<b>1.000</b>", table_cell_bold), Paragraph("<b>0.842</b>", table_cell_bold), Paragraph("0.250", table_cell), Paragraph("<b>0.000</b>", table_cell_bold), Paragraph("<b>101.54 ms</b>", table_cell_bold), Paragraph("<b>100% Recall (0% missed errors) + Tool + Drift.</b>", table_cell_bold)]
    ]
    bl_table = Table(bl_rows, colWidths=[115, 42, 42, 42, 36, 36, 50, 177])
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
        "Evaluated on a 5-node pipeline (<code>Planner -&gt; Retriever -&gt; Verifier -&gt; Analyst -&gt; Writer</code>) with an ungrounded assertion injected at Node B:",
        body_style
    ))

    cp_img = os.path.join(CHARTS_DIR, "chart_compounding.png")
    if os.path.exists(cp_img):
        story.append(Image(cp_img, width=510, height=148))
        story.append(Spacer(1, 2))

    cp_rows = [
        [Paragraph("Pipeline Node", table_cell_header), Paragraph("Condition A: Control (Risk / Contra Prob)", table_cell_header), Paragraph("Condition B: Active Intervention (Risk / Contra Prob)", table_cell_header), Paragraph("Operational Outcome", table_cell_header)],
        [Paragraph("Node A (Planner)", table_cell), Paragraph("0.989 / 0.002", table_cell), Paragraph("0.989 / 0.002", table_cell), Paragraph("Normal initial query generation.", table_cell)],
        [Paragraph("<b>Node B (Retriever - Fault)</b>", table_cell_bold), Paragraph("<font color='#DC2626'><b>1.000 / 1.000 (Fault Injected)</b></font>", table_cell), Paragraph("<font color='#DC2626'><b>1.000 / 1.000 (Fault Injected)</b></font>", table_cell), Paragraph("Fabricated citation injected into stream.", table_cell)],
        [Paragraph("<b>Node C (Verifier)</b>", table_cell_bold), Paragraph("<font color='#DC2626'>0.992 / 0.992 (Propagated)</font>", table_cell), Paragraph("<font color='#047857'><b>0.009 / 0.009 (Caught & Mitigated)</b></font>", table_cell_bold), Paragraph("<b>AgentPulse flags contradiction; halts propagation.</b>", table_cell_bold)],
        [Paragraph("Node D (Analyst)", table_cell), Paragraph("<font color='#DC2626'>0.992 / 0.992 (Corrupted)</font>", table_cell), Paragraph("<font color='#047857'><b>0.001 / 0.000 (Fully Grounded)</b></font>", table_cell), Paragraph("Downstream synthesis protected.", table_cell)],
        [Paragraph("Node E (Writer)", table_cell), Paragraph("<font color='#DC2626'>0.992 / 0.992 (Corrupted)</font>", table_cell), Paragraph("<font color='#047857'><b>0.001 / 0.000 (Fully Grounded)</b></font>", table_cell), Paragraph("Final report generated with verified factual basis.", table_cell)]
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
    story.append(Paragraph("7. Graded Drift Benchmark with Negative Controls", h1_style))
    story.append(Paragraph(
        "AgentPulse monitors temporal degradation across 11 scenarios with positive perturbations and negative controls to guarantee zero false alerting on normal operations:",
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

    story.append(Paragraph("8. Human Annotation Reliability & 9. Test Suite Verification", h1_style))
    
    val_data = [
        [
            Paragraph("<b>Human Annotation Reliability:</b><br/>"
                      "• <b>Dataset Splits:</b> <code>v1.0_dev</code> (15), <code>v1.0_val</code> (15), <code>v1.0_test</code> (20).<br/>"
                      "• <b>Observed Agreement (p<sub>o</sub>):</b> 0.960 &nbsp;|&nbsp; <b>Chance Agreement (p<sub>e</sub>):</b> 0.490<br/>"
                      "• <b>Cohen's Kappa (kappa):</b> <b>0.922</b> (Near-perfect labeling consistency across domain sets).", body_style),
            Paragraph("<b>Automated Test Suite Status:</b><br/>"
                      "• <b>Total Tests Executed:</b> <b>92 Unit & Integration Tests</b><br/>"
                      "• <b>Pass Rate:</b> <font color='#10B981'><b>100% Passed (92/92 in 1.78s)</b></font><br/>"
                      "• <b>Coverage:</b> SDK non-blocking queue, LangGraph adapter, NLI cascade, regex validator, token-bucket alerting, SQLite WAL.", body_style)
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

    viva_qa = [
        [Paragraph("<b>Q1: What exactly did your latency timers measure?</b><br/>"
                   "<b>Defense:</b> We isolated 13 architectural layers (<code>experiments/latency_profiler.py</code>). String templating took &lt;0.002 ms, SDK node wrapping took 0.001 ms (P50), local MiniLM forward pass took 12.8 ms (P50), and DeBERTa NLI took 66.9 ms (P50). We distinguish between in-memory queue append (0.016 ms) and neural model inference.", callout_style)],
        [Paragraph("<b>Q2: Why did Baseline D (Raw NLI) achieve high recall?</b><br/>"
                   "<b>Defense:</b> Baseline D runs heavy DeBERTa cross-encoder inference indiscriminately on every span. AgentPulse matches 100% recall (0.000 FNR) while adding deterministic tool mismatch detection (0.22 ms) and 4-signal drift tracking without requiring external API dependencies.", callout_style)],
        [Paragraph("<b>Q3: Does Atom of Thoughts (AoT) actually improve factual grounding?</b><br/>"
                   "<b>Defense:</b> In our empirical evaluation on Qwen 2.5 7B, AoT consumed ~10x more tokens (341.9 in / 87.8 out vs 32.6 in / 11.5 out for Direct), but had higher grounding risk (0.270) than Chain-of-Thought (0.127). Standard CoT was empirically superior for factual grounding.", callout_style)],
        [Paragraph("<b>Q4: How does AgentPulse prevent false alerts on benign phrasing shifts?</b><br/>"
                   "<b>Defense:</b> Evaluated across negative controls (<code>experiments/drift_scenarios.py</code>). Legitimate paraphrasings produced centroid shifts &lt;= 0.15, well below the calibrated alert threshold of 0.30, resulting in <b>0 false drift alerts</b>.", callout_style)]
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
