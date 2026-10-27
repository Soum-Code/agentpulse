import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  csvCell,
  formatTraceForExport,
  formatTraceLogBody,
  formatTracesAsCsv,
  downloadTraceAsJson,
  downloadTracesAsCsv,
  copyTextToClipboard,
  copyTraceIdToClipboard,
  copyTraceLogBodyToClipboard,
} from './traceExport';
import type { Trace, Span } from '../types';

const mockSpans: Span[] = [
  {
    id: 'span-1',
    traceId: 'tr-test-123',
    name: 'Agent Coordinator',
    type: 'agent',
    status: 'ok',
    startOffsetMs: 0,
    durationMs: 850,
    tokens: { prompt: 150, completion: 50, total: 200 },
  },
  {
    id: 'span-2',
    traceId: 'tr-test-123',
    parentSpanId: 'span-1',
    name: 'Search Web Tool',
    type: 'tool',
    status: 'error',
    startOffsetMs: 100,
    durationMs: 1200,
    tokens: { prompt: 80, completion: 20, total: 100 },
    error: 'Connection timeout after 1000ms',
  },
];

const mockTrace: Trace = {
  id: 'tr-test-123',
  agentId: 'agent-alpha',
  agentName: 'Alpha Agent',
  sessionId: 'sess-abc-789',
  rootSpanId: 'span-1',
  status: 'error',
  durationMs: 1450,
  totalTokens: 300,
  cost: 0.0042,
  timestamp: '2026-10-19T12:30:00.123456',
  inputPreview: 'Query latest earnings report',
  outputPreview: 'Error occurred during retrieval',
  spans: mockSpans,
  tags: ['production', 'p0-triage'],
  errorSummary: 'Search tool timed out',
  driftDetected: false,
  groundingScore: 0.31,
};

// What the live API gives for a trace with no cost, no tokens, no tags and no score yet
const sparseTrace: Trace = {
  id: 'tr-sparse',
  agentId: 'agent-null',
  agentName: 'Null Agent',
  rootSpanId: 'span-0',
  status: 'ok',
  durationMs: 50,
  timestamp: '2026-10-19T12:00:00',
  inputPreview: 'Hello',
  outputPreview: 'World',
  spans: [
    { id: 'span-0', traceId: 'tr-sparse', name: 'only span', type: 'agent', status: 'ok', startOffsetMs: 0, durationMs: 50 },
  ],
};

const groundedSpan: Span = {
  id: 'span-g',
  traceId: 'tr-grounded',
  name: 'Analyst',
  type: 'model',
  status: 'ok',
  startOffsetMs: 0,
  durationMs: 120,
  evaluatorResults: [
    {
      id: 'span-g-grounding',
      name: 'Grounding',
      score: 0.3,
      threshold: 0.7,
      passed: true,
      maturity: 'BETA',
      reason: 'DeBERTa-v3 NLI cross-encoder. Verdict: Unverifiable.',
      verdict: 'unverifiable',
    },
    {
      id: 'span-g-toolclaim',
      name: 'Tool Claim',
      score: 1,
      threshold: 0,
      passed: false,
      maturity: 'EXPERIMENTAL',
      reason: 'Regex claim extraction against recorded tool results',
    },
  ],
};

const groundedTrace: Trace = {
  ...sparseTrace,
  id: 'tr-grounded',
  groundingScore: 0.3,
  spans: [groundedSpan],
};

describe('formatTraceForExport', () => {
  it('structures the payload according to the schema', () => {
    const payload = formatTraceForExport(mockTrace);

    expect(payload.schemaVersion).toBe('agentpulse.trace.v1');
    expect(payload.generator).toBe('AgentPulse Tracing Platform');
    expect(payload.exportedAt).toBeDefined();

    expect(payload.trace.id).toBe('tr-test-123');
    expect(payload.trace.agentName).toBe('Alpha Agent');
    expect(payload.trace.sessionId).toBe('sess-abc-789');
    expect(payload.trace.tags).toEqual(['production', 'p0-triage']);
    expect(payload.trace.cost).toBe(0.0042);
    expect(payload.trace.errorSummary).toBe('Search tool timed out');
    expect(payload.trace.driftDetected).toBe(false);
    expect(payload.trace.groundingScore).toBe(0.31);
    expect(payload.trace.groundingScoreScale).toContain('0 is safe');

    expect(payload.trace.analysis.totalSpans).toBe(2);
    expect(payload.trace.analysis.tokenBreakdown).toEqual({
      promptTokens: 230,
      completionTokens: 70,
      totalTokens: 300,
    });
    expect(payload.trace.analysis.spansByType).toEqual({ agent: 1, tool: 1 });
    expect(payload.trace.analysis.slowestSpan?.id).toBe('span-2');
    expect(payload.trace.analysis.slowestSpan?.durationMs).toBe(1200);
    expect(payload.trace.analysis.discrepantSpansCount).toBe(1);

    expect(payload.trace.spans).toHaveLength(2);
    expect(payload.trace.spans[1].error).toBe('Connection timeout after 1000ms');
  });

  it('exports null for everything the backend did not provide, and invents nothing', () => {
    const { trace } = formatTraceForExport(sparseTrace);

    expect(trace.sessionId).toBeNull();
    expect(trace.totalTokens).toBeNull();
    expect(trace.cost).toBeNull();
    expect(trace.tags).toBeNull();
    expect(trace.errorSummary).toBeNull();
    expect(trace.driftDetected).toBeNull();
    expect(trace.alerts).toBeNull();
    expect(trace.groundingScore).toBeNull();
    expect(trace.evaluatorResults).toEqual([]);
    // No span reported tokens, so the sums are unknown rather than 0.
    expect(trace.analysis.tokenBreakdown).toEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });
  });

  it('keeps a real zero as zero', () => {
    const zero: Trace = { ...sparseTrace, totalTokens: 0, cost: 0, groundingScore: 0, driftDetected: false };
    const { trace } = formatTraceForExport(zero);
    expect(trace.totalTokens).toBe(0);
    expect(trace.cost).toBe(0);
    expect(trace.groundingScore).toBe(0);
    expect(trace.driftDetected).toBe(false);
  });

  it('sums tokens over the spans that reported them only', () => {
    const partial: Trace = {
      ...sparseTrace,
      spans: [
        { ...sparseTrace.spans[0], id: 'a', tokens: { prompt: 10, completion: 5, total: 15 } },
        { ...sparseTrace.spans[0], id: 'b' },
      ],
    };
    const { analysis } = formatTraceForExport(partial).trace;
    expect(analysis.tokenBreakdown.promptTokens).toBe(10);
    expect(analysis.tokenBreakdown.completionTokens).toBe(5);
  });

  it('lists every evaluator result with its span and the grounding verdict', () => {
    const { trace } = formatTraceForExport(groundedTrace);

    expect(trace.evaluatorResults).toEqual([
      {
        spanId: 'span-g',
        spanName: 'Analyst',
        name: 'Grounding',
        score: 0.3,
        threshold: 0.7,
        passed: true,
        maturity: 'BETA',
        verdict: 'unverifiable',
        reason: 'DeBERTa-v3 NLI cross-encoder. Verdict: Unverifiable.',
      },
      {
        spanId: 'span-g',
        spanName: 'Analyst',
        name: 'Tool Claim',
        score: 1,
        threshold: 0,
        passed: false,
        maturity: 'EXPERIMENTAL',
        verdict: null,
        reason: 'Regex claim extraction against recorded tool results',
      },
    ]);
    // The spans keep their results in full, verdict included
    expect(trace.spans[0].evaluatorResults?.[0].verdict).toBe('unverifiable');
    // A span whose evaluator did not pass counts as flagged even though its status is ok
    expect(trace.analysis.discrepantSpansCount).toBe(1);
  });

  it('tells a trace with no alerts from one whose alerts were never loaded', () => {
    expect(formatTraceForExport({ ...sparseTrace, alerts: [] }).trace.alerts).toEqual([]);
    expect(formatTraceForExport(sparseTrace).trace.alerts).toBeNull();
  });

  it('exports the alerts of a loaded trace as they are', () => {
    const alert = {
      id: 7,
      alertType: 'GROUNDING_FAILURE',
      severity: 'critical',
      message: "Grounding failure for agent 'analyst'",
      agentId: 'analyst',
      acknowledged: false,
      resolved: false,
      createdAt: '2026-10-21T08:38:38.710000',
    };
    expect(formatTraceForExport({ ...sparseTrace, alerts: [alert] }).trace.alerts).toEqual([alert]);
  });

  it('handles traces with zero spans gracefully', () => {
    const { trace } = formatTraceForExport({ ...sparseTrace, spans: [] });
    expect(trace.analysis.totalSpans).toBe(0);
    expect(trace.analysis.slowestSpan).toBeNull();
    expect(trace.analysis.discrepantSpansCount).toBe(0);
    expect(trace.analysis.spansByType).toEqual({});
  });
});

describe('formatTraceLogBody', () => {
  it('serializes the trace into formatted JSON', () => {
    const raw = formatTraceLogBody(mockTrace, true);
    expect(raw).toContain('"schemaVersion": "agentpulse.trace.v1"');
    expect(raw).toContain('"id": "tr-test-123"');
    expect(raw).toContain('"spans": [');

    const parsed = JSON.parse(raw);
    expect(parsed.trace.id).toBe('tr-test-123');
    expect(parsed.trace.agentName).toBe('Alpha Agent');
    expect(parsed.trace.spans).toHaveLength(2);
  });

  it('writes null, not a missing key, for an unknown field', () => {
    const parsed = JSON.parse(formatTraceLogBody(sparseTrace, false));
    expect(parsed.trace).toHaveProperty('cost', null);
    expect(parsed.trace).toHaveProperty('groundingScore', null);
    expect(parsed.trace).toHaveProperty('sessionId', null);
  });
});

describe('csvCell', () => {
  it('quotes text and doubles inner quotes', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi", then leave')).toBe('"say ""hi"", then leave"');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('leaves missing values empty', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(NaN)).toBe('""');
  });

  it('writes numbers and booleans as they are, zero included', () => {
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell(0.0042)).toBe('"0.0042"');
    expect(csvCell(false)).toBe('"false"');
  });

  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1 555')).toBe('"\'+1 555"');
    expect(csvCell('-2 degrees')).toBe('"\'-2 degrees"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('\tcmd')).toBe('"\'\tcmd"');
  });
});

describe('formatTracesAsCsv', () => {
  const parseLine = (line: string): string[] => line.slice(1, -1).split('","');

  it('writes a header and one row per trace', () => {
    const csv = formatTracesAsCsv([mockTrace, groundedTrace]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    const header = parseLine(lines[0]);
    expect(header).toContain('Trace ID');
    expect(header).toContain('Risk Score (0 safe, 1 risky)');
    expect(header).toContain('Evaluators Summary');
    expect(header).toHaveLength(22);
  });

  it('puts the real fields in the right columns', () => {
    const [headerLine, rowLine] = formatTracesAsCsv([mockTrace]).split('\n');
    const header = parseLine(headerLine);
    const row = parseLine(rowLine);
    const cell = (name: string) => row[header.indexOf(name)];

    expect(cell('Trace ID')).toBe('tr-test-123');
    expect(cell('Status')).toBe('error');
    expect(cell('Duration (ms)')).toBe('1450');
    expect(cell('Total Tokens')).toBe('300');
    expect(cell('Prompt Tokens')).toBe('230');
    expect(cell('Completion Tokens')).toBe('70');
    expect(cell('Cost')).toBe('0.0042');
    expect(cell('Risk Score (0 safe, 1 risky)')).toBe('0.31');
    expect(cell('Drift Detected')).toBe('false');
    expect(cell('Span Count')).toBe('2');
    expect(cell('Flagged Spans')).toBe('1');
    expect(cell('Tags')).toBe('production; p0-triage');
    expect(cell('Spans Hierarchy')).toBe('Agent Coordinator [agent, 850ms, ok] -> Search Web Tool [tool, 1200ms, error]');
  });

  it('leaves unknown cells empty rather than writing 0', () => {
    const [headerLine, rowLine] = formatTracesAsCsv([sparseTrace]).split('\n');
    const header = parseLine(headerLine);
    const row = parseLine(rowLine);
    const cell = (name: string) => row[header.indexOf(name)];

    for (const name of ['Session ID', 'Total Tokens', 'Prompt Tokens', 'Completion Tokens', 'Cost', 'Risk Score (0 safe, 1 risky)', 'Drift Detected', 'Alerts', 'Error Summary', 'Tags', 'Evaluators Summary']) {
      expect(cell(name)).toBe('');
    }
    expect(cell('Span Count')).toBe('1');
  });

  it('summarises evaluator results with the grounding verdict', () => {
    const [headerLine, rowLine] = formatTracesAsCsv([groundedTrace]).split('\n');
    const header = parseLine(headerLine);
    const summary = parseLine(rowLine)[header.indexOf('Evaluators Summary')];
    expect(summary).toBe('Analyst / Grounding: 0.3 (pass, unverifiable); Analyst / Tool Claim: 1 (fail)');
  });

  it('lists the alerts of a trace by type and severity', () => {
    const alerted: Trace = {
      ...sparseTrace,
      alerts: [
        { id: 1, alertType: 'DRIFT_DETECTED', severity: 'warning', message: 'm', acknowledged: false, resolved: false, createdAt: 'x' },
        { id: 2, alertType: 'GROUNDING_FAILURE', severity: 'critical', message: 'm', acknowledged: false, resolved: false, createdAt: 'x' },
      ],
    };
    const [headerLine, rowLine] = formatTracesAsCsv([alerted]).split('\n');
    expect(parseLine(rowLine)[parseLine(headerLine).indexOf('Alerts')]).toBe(
      'DRIFT_DETECTED (warning); GROUNDING_FAILURE (critical)'
    );
  });

  it('does not let a trace input run as a spreadsheet formula', () => {
    const hostile: Trace = { ...sparseTrace, inputPreview: '=cmd|\' /C calc\'!A0' };
    const [headerLine, rowLine] = formatTracesAsCsv([hostile]).split('\n');
    const input = parseLine(rowLine)[parseLine(headerLine).indexOf('Input Preview')];
    expect(input.startsWith("'=")).toBe(true);
  });
});

describe('downloads', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  /** Stubs the browser pieces a download needs and records what was downloaded. */
  function captureDownload() {
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      return 'blob:http://localhost/mock-blob';
    });
    URL.revokeObjectURL = revoke;
    const clicked: { href: string | null; download: string | null }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href'), download: this.getAttribute('download') });
    });
    return { blobs, revoke, clicked };
  }

  const blobText = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });

  it('downloads one trace as JSON with a dated file name', async () => {
    const { blobs, revoke, clicked } = captureDownload();

    expect(downloadTraceAsJson(mockTrace)).toBe(true);

    expect(clicked).toHaveLength(1);
    expect(clicked[0].href).toBe('blob:http://localhost/mock-blob');
    expect(clicked[0].download).toMatch(/^agent-trace-tr-test-123-\d{4}-\d{2}-\d{2}\.json$/);
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/mock-blob');
    expect(document.querySelector('a[download]')).toBeNull();

    const parsed = JSON.parse(await blobText(blobs[0]));
    expect(parsed.schemaVersion).toBe('agentpulse.trace.v1');
    expect(parsed.trace.id).toBe('tr-test-123');
  });

  it('keeps odd characters in a trace id out of the file name', () => {
    const { clicked } = captureDownload();
    downloadTraceAsJson({ ...mockTrace, id: '../etc/pass wd:1' });
    expect(clicked[0].download).toMatch(/^agent-trace-\.\._etc_pass_wd_1-\d{4}-\d{2}-\d{2}\.json$/);
    expect(clicked[0].download).not.toMatch(/[\\/:\s]/);
  });

  it('downloads the given traces as CSV', async () => {
    const { blobs, clicked } = captureDownload();

    expect(downloadTracesAsCsv([mockTrace, groundedTrace])).toBe(true);

    expect(clicked[0].download).toMatch(/^agent-traces-export-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await blobText(blobs[0]);
    expect(text.split('\n')).toHaveLength(3);
    expect(text.startsWith('"Trace ID"')).toBe(true);
  });

  it('exports nothing when there are no traces or no trace', () => {
    const { clicked } = captureDownload();
    expect(downloadTracesAsCsv([])).toBe(false);
    expect(downloadTraceAsJson(null as unknown as Trace)).toBe(false);
    expect(clicked).toHaveLength(0);
  });

  it('returns false when the browser refuses the download', () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error('blocked');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(downloadTraceAsJson(mockTrace)).toBe(false);
  });
});

describe('clipboard', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
    vi.restoreAllMocks();
  });

  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
  }

  it('copies the trace id and the log body with navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    expect(await copyTraceIdToClipboard('tr-test-123')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('tr-test-123');

    expect(await copyTraceLogBodyToClipboard(mockTrace)).toBe(true);
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('"id": "tr-test-123"'));
  });

  it('refuses to copy nothing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    expect(await copyTextToClipboard('')).toBe(false);
    expect(await copyTraceLogBodyToClipboard(null as unknown as Trace)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to a hidden textarea when the Clipboard API refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;

    expect(await copyTextToClipboard('tr-test-123')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when both routes fail', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    expect(await copyTextToClipboard('tr-test-123')).toBe(false);
  });
});

describe('exports of a trace with no recorded duration or status', () => {
  // A trace as adapters.ts builds it from a list entry whose spans carry no latency and whose
  // alerts were never loaded: duration and status are unknown, not 0 and not ok.
  const unrecorded: Trace = {
    id: 'tr-unrecorded',
    agentId: 'planner',
    agentName: 'multi-agent (2)',
    agentIds: ['planner', 'retriever'],
    rootSpanId: 'a',
    status: 'unknown',
    timestamp: '2026-10-27T10:00:00',
    inputPreview: 'q',
    outputPreview: 'a',
    spans: [
      { id: 'a', traceId: 'tr-unrecorded', name: 'plan', type: 'agent', status: 'ok', startOffsetMs: 0 },
      { id: 'b', traceId: 'tr-unrecorded', name: 'fetch', type: 'tool', status: 'ok', startOffsetMs: 5 },
    ],
  };

  it('writes null for the duration and the status in the JSON, never 0 and never "ok"', () => {
    const { trace } = formatTraceForExport(unrecorded);
    expect(trace.durationMs).toBeNull();
    expect(trace.status).toBeNull();
    expect(trace.analysis.slowestSpan).toBeNull();
    // The span keeps its key, with null, instead of dropping it or writing 0.
    expect(trace.spans.map((s) => s.durationMs)).toEqual([null, null]);
    expect(formatTraceLogBody(unrecorded)).toContain('"durationMs": null');
    expect(formatTraceLogBody(unrecorded)).not.toContain('"durationMs": 0');
  });

  it('picks the slowest span among the spans that recorded a latency', () => {
    const partial: Trace = {
      ...unrecorded,
      spans: [
        { ...unrecorded.spans[0], durationMs: 40 },
        unrecorded.spans[1],
        { ...unrecorded.spans[0], id: 'c', durationMs: 90 },
      ],
    };
    expect(formatTraceForExport(partial).trace.analysis.slowestSpan?.id).toBe('c');
    // A real 0 ms span is a measurement, and it can be the slowest only if nothing is longer.
    const zero: Trace = { ...unrecorded, spans: [{ ...unrecorded.spans[0], durationMs: 0 }, unrecorded.spans[1]] };
    expect(formatTraceForExport(zero).trace.analysis.slowestSpan).toMatchObject({ id: 'a', durationMs: 0 });
  });

  it('leaves the duration and status cells empty in the CSV, and says so in the span list', () => {
    const [headerLine, rowLine] = formatTracesAsCsv([unrecorded]).split('\n');
    const header = headerLine.slice(1, -1).split('","');
    const row = rowLine.slice(1, -1).split('","');
    const cell = (name: string) => row[header.indexOf(name)];
    expect(cell('Duration (ms)')).toBe('');
    expect(cell('Status')).toBe('');
    expect(cell('Spans Hierarchy')).toBe('plan [agent, latency not recorded, ok] -> fetch [tool, latency not recorded, ok]');
    expect(rowLine).not.toContain('undefined');
    expect(rowLine).not.toContain('NaN');
  });

  it('lists every agent of a multi-agent trace, in the JSON and in the CSV Agent ID cell', () => {
    expect(formatTraceForExport(unrecorded).trace.agentIds).toEqual(['planner', 'retriever']);
    expect(formatTraceForExport(sparseTrace).trace.agentIds).toBeNull();
    const [headerLine, rowLine] = formatTracesAsCsv([unrecorded]).split('\n');
    const header = headerLine.slice(1, -1).split('","');
    const row = rowLine.slice(1, -1).split('","');
    expect(row[header.indexOf('Agent ID')]).toBe('planner; retriever');
    expect(row[header.indexOf('Agent Name')]).toBe('multi-agent (2)');
  });

  it('keeps a measured status and duration as they are', () => {
    const { trace } = formatTraceForExport(mockTrace);
    expect(trace.status).toBe('error');
    expect(trace.durationMs).toBe(1450);
    expect(trace.spans.map((s) => s.durationMs)).toEqual([850, 1200]);
  });
});
