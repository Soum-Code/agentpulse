/**
 * Export and copy helpers for traces: one trace as JSON, many traces as CSV, and the clipboard.
 *
 * A field the backend did not provide is exported as null (JSON) or an empty cell (CSV). A
 * count that could not be measured is null, not 0: an export that says 0 tokens for a span
 * that never reported tokens is indistinguishable from a measured zero.
 */
import type { Span, Trace } from '../types';
import type { GroundingVerdict } from '../lib/api';

export const TRACE_EXPORT_SCHEMA = 'agentpulse.trace.v1';

/** One evaluator result with the span it came from. The spans array carries the same results in full. */
export interface ExportedEvaluatorResult {
  spanId: string;
  spanName: string;
  name: string;
  /** Risk, not quality: 0 is safe and 1 is risky. */
  score: number;
  threshold: number;
  passed: boolean;
  maturity: string;
  /** What the NLI model concluded (Grounding only); null for other evaluators or when there is none. */
  verdict: GroundingVerdict | null;
  reason: string;
}

export interface TraceExportPayload {
  schemaVersion: typeof TRACE_EXPORT_SCHEMA;
  exportedAt: string;
  generator: string;
  trace: {
    id: string;
    agentId: string;
    agentName: string;
    sessionId: string | null;
    rootSpanId: string;
    status: 'ok' | 'warning' | 'error';
    durationMs: number;
    totalTokens: number | null;
    cost: number | null;
    timestamp: string;
    inputPreview: string;
    outputPreview: string;
    tags: string[] | null;
    errorSummary: string | null;
    driftDetected: boolean | null;
    /** The trace's overall_risk_score, null until the evaluator has scored it. */
    groundingScore: number | null;
    groundingScoreScale: string;
    evaluatorResults: ExportedEvaluatorResult[];
    analysis: {
      totalSpans: number;
      tokenBreakdown: {
        promptTokens: number | null;
        completionTokens: number | null;
        totalTokens: number | null;
      };
      spansByType: Record<string, number>;
      slowestSpan: {
        id: string;
        name: string;
        type: string;
        durationMs: number;
      } | null;
      /** Spans that errored, warned, or had an evaluator that did not pass. */
      discrepantSpansCount: number;
    };
    spans: Span[];
  };
}

const isFlaggedSpan = (span: Span): boolean =>
  span.status === 'error' || span.status === 'warning' || !!span.evaluatorResults?.some((r) => !r.passed);

/** Sum of one token field over the spans that reported it, or null when no span did. */
const sumReportedTokens = (spans: Span[], field: 'prompt' | 'completion'): number | null => {
  let total = 0;
  let reported = false;
  for (const span of spans) {
    const value = span.tokens?.[field];
    if (typeof value === 'number') {
      total += value;
      reported = true;
    }
  }
  return reported ? total : null;
};

const collectEvaluatorResults = (spans: Span[]): ExportedEvaluatorResult[] =>
  spans.flatMap((span) =>
    (span.evaluatorResults ?? []).map((r) => ({
      spanId: span.id,
      spanName: span.name,
      name: r.name,
      score: r.score,
      threshold: r.threshold,
      passed: r.passed,
      maturity: r.maturity,
      verdict: r.verdict ?? null,
      reason: r.reason,
    }))
  );

/**
 * Formats a single trace into a structured, schema-compliant JSON payload for offline analysis.
 */
export function formatTraceForExport(trace: Trace): TraceExportPayload {
  const spans = trace.spans ?? [];

  const slowest = spans.reduce<Span | null>(
    (best, span) => (best === null || span.durationMs > best.durationMs ? span : best),
    null
  );

  const spansByType = spans.reduce<Record<string, number>>((acc, span) => {
    acc[span.type] = (acc[span.type] || 0) + 1;
    return acc;
  }, {});

  return {
    schemaVersion: TRACE_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    generator: 'AgentPulse Tracing Platform',
    trace: {
      id: trace.id,
      agentId: trace.agentId,
      agentName: trace.agentName,
      sessionId: trace.sessionId ?? null,
      rootSpanId: trace.rootSpanId,
      status: trace.status,
      durationMs: trace.durationMs,
      totalTokens: trace.totalTokens ?? null,
      cost: trace.cost ?? null,
      timestamp: trace.timestamp,
      inputPreview: trace.inputPreview,
      outputPreview: trace.outputPreview,
      tags: trace.tags ?? null,
      errorSummary: trace.errorSummary ?? null,
      driftDetected: trace.driftDetected ?? null,
      groundingScore: trace.groundingScore ?? null,
      groundingScoreScale: 'risk: 0 is safe, 1 is risky',
      evaluatorResults: collectEvaluatorResults(spans),
      analysis: {
        totalSpans: spans.length,
        tokenBreakdown: {
          promptTokens: sumReportedTokens(spans, 'prompt'),
          completionTokens: sumReportedTokens(spans, 'completion'),
          totalTokens: trace.totalTokens ?? null,
        },
        spansByType,
        slowestSpan: slowest
          ? { id: slowest.id, name: slowest.name, type: slowest.type, durationMs: slowest.durationMs }
          : null,
        discrepantSpansCount: spans.filter(isFlaggedSpan).length,
      },
      spans,
    },
  };
}

/**
 * Serializes a trace's complete telemetry and span tree into a formatted JSON log string.
 */
export function formatTraceLogBody(trace: Trace, pretty: boolean = true): string {
  if (!trace) return '';
  return JSON.stringify(formatTraceForExport(trace), null, pretty ? 2 : 0);
}

const CSV_HEADERS = [
  'Trace ID',
  'Agent ID',
  'Agent Name',
  'Session ID',
  'Timestamp',
  'Status',
  'Duration (ms)',
  'Total Tokens',
  'Prompt Tokens',
  'Completion Tokens',
  'Cost',
  'Risk Score (0 safe, 1 risky)',
  'Drift Detected',
  'Span Count',
  'Flagged Spans',
  'Input Preview',
  'Output Preview',
  'Error Summary',
  'Tags',
  'Evaluators Summary',
  'Spans Hierarchy',
];

type CsvValue = string | number | boolean | null | undefined;

/**
 * One quoted CSV cell. Missing values are empty. Text that starts with = + - @ or a tab or
 * carriage return gets a leading apostrophe: trace input and output come from an agent's
 * users, and a spreadsheet would run such a cell as a formula.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') return Number.isFinite(value) ? `"${value}"` : '""';
  if (typeof value === 'boolean') return `"${value}"`;
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

const evaluatorsSummary = (results: ExportedEvaluatorResult[]): string =>
  results
    .map((r) => `${r.spanName} / ${r.name}: ${r.score} (${r.passed ? 'pass' : 'fail'}${r.verdict ? `, ${r.verdict}` : ''})`)
    .join('; ');

/**
 * Formats traces as CSV, one row per trace. The first row is the header.
 */
export function formatTracesAsCsv(traces: Trace[]): string {
  const rows = traces.map((t) => {
    const spans = t.spans ?? [];
    return [
      t.id,
      t.agentId,
      t.agentName,
      t.sessionId,
      t.timestamp,
      t.status,
      t.durationMs,
      t.totalTokens,
      sumReportedTokens(spans, 'prompt'),
      sumReportedTokens(spans, 'completion'),
      t.cost,
      t.groundingScore,
      t.driftDetected,
      spans.length,
      spans.filter(isFlaggedSpan).length,
      t.inputPreview,
      t.outputPreview,
      t.errorSummary,
      t.tags?.join('; '),
      evaluatorsSummary(collectEvaluatorResults(spans)),
      spans.map((s) => `${s.name} [${s.type}, ${s.durationMs}ms, ${s.status}]`).join(' -> '),
    ]
      .map(csvCell)
      .join(',');
  });
  return [CSV_HEADERS.map(csvCell).join(','), ...rows].join('\n');
}

/** A trace id made safe to use inside a file name. */
const safeFilePart = (id: string): string => id.replace(/[^A-Za-z0-9._-]+/g, '_');

const today = (): string => new Date().toISOString().slice(0, 10);

/** Starts a browser download of a text file. Returns false when there is no browser to do it in. */
function downloadTextFile(content: string, mimeType: string, filename: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error(`Failed to download ${filename}:`, err);
    return false;
  }
}

/**
 * Triggers a browser download of a formatted trace JSON file.
 * Returns true if the download was initiated, false otherwise.
 */
export function downloadTraceAsJson(trace: Trace, customFilename?: string): boolean {
  if (!trace) return false;
  const filename = customFilename || `agent-trace-${safeFilePart(trace.id)}-${today()}.json`;
  return downloadTextFile(formatTraceLogBody(trace), 'application/json;charset=utf-8;', filename);
}

/**
 * Triggers a browser download of the given traces as a CSV file.
 * Returns false when there is nothing to export.
 */
export function downloadTracesAsCsv(traces: Trace[], customFilename?: string): boolean {
  if (!traces || traces.length === 0) return false;
  const filename = customFilename || `agent-traces-export-${today()}.csv`;
  return downloadTextFile(formatTracesAsCsv(traces), 'text/csv;charset=utf-8;', filename);
}

/** Copy through a hidden textarea, for pages where navigator.clipboard is missing (plain http) or refuses. */
function copyWithTextarea(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  try {
    textArea.focus();
    textArea.select();
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
    previouslyFocused?.focus?.();
  }
}

/**
 * Copies text to the system clipboard with the Clipboard API, falling back to a hidden textarea.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or the page is not focused: try the textarea route below.
  }
  try {
    return copyWithTextarea(text);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Copies a trace identifier to the clipboard.
 */
export async function copyTraceIdToClipboard(traceId: string): Promise<boolean> {
  return copyTextToClipboard(traceId);
}

/**
 * Copies a complete trace log body (full JSON including spans and diagnostics) to the clipboard.
 */
export async function copyTraceLogBodyToClipboard(trace: Trace, pretty: boolean = true): Promise<boolean> {
  if (!trace) return false;
  return copyTextToClipboard(formatTraceLogBody(trace, pretty));
}
