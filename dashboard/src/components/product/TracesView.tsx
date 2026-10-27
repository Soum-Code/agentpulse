import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  Clock,
  Coins,
  Cpu,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  FileText,
  Database,
  ShieldAlert,
  ArrowRight,
  ArrowDown,
  ArrowUpDown,
  PlusCircle,
  Copy,
  Check,
  Bot,
  ClipboardCopy,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  X,
  Keyboard,
  CornerDownLeft,
  Radio,
  Sparkles,
  Zap,
  SlidersHorizontal,
  Timer,
  RotateCcw,
  ClipboardCheck
} from 'lucide-react';
import { Trace, Span, EvaluatorResult, ChronologicalSortOrder } from '../../types';
import {
  TRACE_DURATION_PRESETS,
  TRACE_SORT_OPTIONS,
  TraceDurationPreset,
  TraceSortOption,
  TraceStatusFilter,
  countTraces,
  filterAndSortTraces,
} from '../../lib/traceFilters';
import {
  parseDateTimeToMs,
  getTimeDisplayInfo,
  formatTimeForMode,
  formatTimeTooltip,
  type TimeFormatMode,
} from '../../utils/dateUtils';
import {
  downloadTraceAsJson,
  downloadTracesAsCsv,
  copyTextToClipboard,
  copyTraceIdToClipboard,
  copyTraceLogBodyToClipboard,
} from '../../utils/traceExport';
import { isTypingTarget, isChordFollowUp, isActivatableTarget } from '../../utils/keyboard';
import { formatLatencyMs } from '../../lib/agentFormat';
import { loadFullTrace, loadFullTraces } from '../../lib/traceDetail';
import type { GroundingVerdict } from '../../lib/api';
import { riskTextClasses, verdictBadgeClasses, verdictLabel, verdictTooltip } from '../../lib/riskTone';

/** What the NLI model concluded about a span's output, next to its risk score. It is not a
 *  risk: 'Unverifiable' (the evidence neither supports nor contradicts the output) is
 *  neutral on purpose, not amber or rose. Renders nothing when there is no verdict. */
const VerdictBadge: React.FC<{ verdict?: GroundingVerdict | null }> = ({ verdict }) => {
  const label = verdictLabel(verdict);
  if (!label) return null;
  const tip = verdictTooltip(verdict);
  return (
    <span
      title={tip ?? undefined}
      className={`px-2 py-0.5 rounded border text-[11px] font-semibold cursor-help ${verdictBadgeClasses(verdict)}`}
    >
      {label}
      <span className="sr-only">. {tip}</span>
    </span>
  );
};

interface TracesViewProps {
  traces: Trace[];
  selectedTrace?: Trace;
  selectedSpan?: Span;
  onSelectTrace: (trace: Trace) => void;
  onSelectSpan: (span: Span) => void;
  onCurateToDataset: (span: Span, trace: Trace) => void;
  filterAgentId?: string;
  onOpenShortcutsModal?: () => void;
}

/**
 * A small "Copy" chip that flips to "Copied" for two seconds. Used beside each payload in the span
 * inspector (span id, prompt, completion, tool arguments, tool output).
 */
const CopyChip: React.FC<{ label: string; title: string; copied: boolean; onCopy: (e: React.MouseEvent) => void }> = ({
  label,
  title,
  copied,
  onCopy,
}) => (
  <button
    onClick={onCopy}
    className="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition-all border shrink-0 bg-white/[0.04] hover:bg-white/[0.09] text-neutral-300 hover:text-white border-white/[0.1]"
    title={title}
  >
    {copied ? (
      <>
        <Check className="w-2.5 h-2.5 text-emerald-300" />
        <span className="text-[9px] text-emerald-300">Copied</span>
      </>
    ) : (
      <>
        <Copy className="w-2.5 h-2.5" />
        <span className="text-[9px]">{label}</span>
      </>
    )}
  </button>
);

export const TracesView: React.FC<TracesViewProps> = ({
  traces,
  selectedTrace,
  selectedSpan,
  onSelectTrace,
  onSelectSpan,
  onCurateToDataset,
  filterAgentId,
  onOpenShortcutsModal
}) => {
  const [viewPerspective, setViewPerspective] = useState<'tree' | 'timeline' | 'flame' | 'evidence'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  // Filters and sort (rules live in lib/traceFilters.ts)
  const [statusFilter, setStatusFilter] = useState<TraceStatusFilter>('all');
  const [durationPreset, setDurationPreset] = useState<TraceDurationPreset>('all');
  const [customMinDuration, setCustomMinDuration] = useState('');
  const [customMaxDuration, setCustomMaxDuration] = useState('');
  const [sortOption, setSortOption] = useState<TraceSortOption>('timestamp-desc');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  // Which span payload was just copied ('span-id', 'prompt', ...), and whether the trace copy menu is open.
  const [copiedSpanPayload, setCopiedSpanPayload] = useState<string | null>(null);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);
  const [curatedSuccess, setCuratedSuccess] = useState(false);
  const [copiedLogTraceId, setCopiedLogTraceId] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [jsonExportedTraceId, setJsonExportedTraceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDetailsFlash, setIsDetailsFlash] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  // How trace times are written, and the clock the relative form is measured against
  const [timeFormatMode, setTimeFormatMode] = useState<TimeFormatMode>('relative');
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll state for trace list stream
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Expanded span IDs for hierarchical tree view
  const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastGPressRef = useRef(0);
  const traceItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const traceListContainerRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const prevTraceIdRef = useRef<string | null>(null);
  const prevTracesCountRef = useRef<number>(traces.length);

  // The old two-way sort is kept as a derived value because the toolbar's toggle button and
  // the keyboard code still think in "newest first / oldest first".
  const sortOrder: ChronologicalSortOrder = sortOption === 'timestamp-asc' ? 'chronological' : 'reverse-chronological';
  const setSortOrder = (next: ChronologicalSortOrder | ((prev: ChronologicalSortOrder) => ChronologicalSortOrder)) => {
    const resolved = typeof next === 'function' ? next(sortOrder) : next;
    setSortOption(resolved === 'chronological' ? 'timestamp-asc' : 'timestamp-desc');
  };

  // Copies one span payload and shows "Copied" on its chip for two seconds.
  const handleCopySpanText = async (text: string, identifier: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (await copyTextToClipboard(text)) {
      setCopiedSpanPayload(identifier);
      setTimeout(() => setCopiedSpanPayload((prev) => (prev === identifier ? null : prev)), 2000);
    }
  };

  // Close the trace copy menu on a click outside it.
  useEffect(() => {
    if (!isCopyMenuOpen) return;
    const handleClickOutsideCopy = (e: MouseEvent) => {
      if (!copyMenuRef.current?.contains(e.target as Node)) setIsCopyMenuOpen(false);
    };
    // Esc closes the menu too (its header says so).
    // stopPropagation: the window-level Esc handler would also clear the search box. Focus goes back to
    // the trigger so a keyboard user is not stranded.
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setIsCopyMenuOpen(false);
      copyButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', handleClickOutsideCopy);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideCopy);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCopyMenuOpen]);

  // Close the filter popover on a click outside it.
  useEffect(() => {
    if (!isFilterDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!filterDropdownRef.current?.contains(target) && !filterButtonRef.current?.contains(target)) {
        setIsFilterDropdownOpen(false);
      }
    };
    // The popover's close button is titled "Close filter menu (Esc)", so Esc has to work.
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // do not also clear the search box (window Esc handler)
      setIsFilterDropdownOpen(false);
      filterButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isFilterDropdownOpen]);

  // How many traces each status and duration bracket holds, in the current agent scope.
  const counts = useMemo(() => countTraces(traces, filterAgentId), [traces, filterAgentId]);
  const statusCounts = counts.status;
  const durationCounts = counts.duration;

  // Number of filters that differ from the defaults (shown on the Filters button).
  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) + (durationPreset !== 'all' ? 1 : 0) + (sortOption !== 'timestamp-desc' ? 1 : 0);

  const handleResetFilters = () => {
    setStatusFilter('all');
    setDurationPreset('all');
    setCustomMinDuration('');
    setCustomMaxDuration('');
    setSortOption('timestamp-desc');
  };

  const filteredTraces = useMemo(
    () =>
      filterAndSortTraces(traces, {
        agentId: filterAgentId,
        status: statusFilter,
        durationPreset,
        customMinDuration,
        customMaxDuration,
        search: searchQuery,
        sort: sortOption,
      }),
    [traces, filterAgentId, statusFilter, durationPreset, customMinDuration, customMaxDuration, searchQuery, sortOption],
  );

  // Reset to page 1 whenever filters or sort order change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterAgentId, statusFilter, durationPreset, customMinDuration, customMaxDuration, searchQuery, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredTraces.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedTraces = filteredTraces.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const currentTrace = selectedTrace || paginatedTraces[0] || filteredTraces[0] || traces[0];
  const currentSpan = selectedSpan || currentTrace?.spans[0];
  const groundingResult = currentSpan?.evaluatorResults?.find(r => r.name === 'Grounding');
  const selectedTraceTime = useMemo(
    () => (currentTrace ? getTimeDisplayInfo(currentTrace.timestamp, nowMs) : null),
    [currentTrace?.timestamp, nowMs]
  );

  // Helper to find initial priority span (warning or error first)
  const getFlaggedOrFirstSpan = (trace: Trace): Span | undefined => {
    if (!trace.spans || trace.spans.length === 0) return undefined;
    const errorSpan = trace.spans.find(
      s => s.status === 'error' || s.evaluatorResults?.some(e => !e.passed)
    );
    if (errorSpan) return errorSpan;
    const warningSpan = trace.spans.find(s => s.status === 'warning');
    if (warningSpan) return warningSpan;
    return trace.spans[0];
  };

  // Helper to find all warning or error spans in current trace
  const flaggedSpans = currentTrace?.spans.filter(
    s => s.status === 'error' || s.status === 'warning' || s.evaluatorResults?.some(e => !e.passed)
  ) || [];

  // Automatically expand and highlight any spans marked as 'warning' or 'error' immediately upon selecting a trace
  useEffect(() => {
    if (!currentTrace) return;

    // Expand all spans by default, ensuring all parent chains of error/warning spans are expanded
    const allSpanIds = new Set<string>();
    currentTrace.spans.forEach(s => {
      allSpanIds.add(s.id);
      if (s.parentSpanId) allSpanIds.add(s.parentSpanId);
    });
    setExpandedSpanIds(allSpanIds);

    // A trace shown only because nothing is selected is still a list entry, and App loads the
    // detail of the selected trace: select it so the detail gets loaded
    if (!selectedTrace && currentTrace.alerts === undefined) onSelectTrace(currentTrace);

    // If switching to a new trace, auto-select the highest priority discrepancy span (error or warning) if present.
    // A trace whose spans are still loading waits: this runs again when they arrive.
    if (prevTraceIdRef.current !== currentTrace.id && currentTrace.spans.length > 0) {
      prevTraceIdRef.current = currentTrace.id;
      const initialSpan = getFlaggedOrFirstSpan(currentTrace);
      if (initialSpan && (!selectedSpan || selectedSpan.traceId !== currentTrace.id)) {
        onSelectSpan(initialSpan);
      }
    }
  }, [currentTrace?.id, currentTrace?.spans.length]);

  // Auto-scroll listener to detect if user is at bottom of trace list
  const handleTraceListScroll = () => {
    if (!traceListContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = traceListContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceToBottom <= 36;

    if (atBottom) {
      setIsUserScrolledUp(false);
      setIsAutoScrollEnabled(true);
    } else {
      setIsUserScrolledUp(true);
      setIsAutoScrollEnabled(false);
    }
  };

  // Auto-scroll to follow latest incoming log entries when enabled and traces update
  useEffect(() => {
    if (traces.length !== prevTracesCountRef.current) {
      prevTracesCountRef.current = traces.length;
      if (isAutoScrollEnabled && traceListContainerRef.current) {
        traceListContainerRef.current.scrollTo({
          top: traceListContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [traces.length, isAutoScrollEnabled]);

  // Scroll to bottom manually and re-enable auto-scroll
  const scrollToBottomAndResumeAutoScroll = () => {
    if (traceListContainerRef.current) {
      traceListContainerRef.current.scrollTo({
        top: traceListContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setIsAutoScrollEnabled(true);
      setIsUserScrolledUp(false);
    }
  };

  // Helper to scroll trace into view smoothly
  const scrollToTrace = (traceId: string) => {
    const el = traceItemRefs.current.get(traceId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleNextPage = () => {
    if (safePage < totalPages) {
      const targetPage = safePage + 1;
      setCurrentPage(targetPage);
      const nextSlice = filteredTraces.slice((targetPage - 1) * PAGE_SIZE, targetPage * PAGE_SIZE);
      if (nextSlice[0]) {
        onSelectTrace(nextSlice[0]);
        const nextSpan = getFlaggedOrFirstSpan(nextSlice[0]);
        if (nextSpan) onSelectSpan(nextSpan);
        scrollToTrace(nextSlice[0].id);
      }
    }
  };

  const handlePrevPage = () => {
    if (safePage > 1) {
      const targetPage = safePage - 1;
      setCurrentPage(targetPage);
      const prevSlice = filteredTraces.slice((targetPage - 1) * PAGE_SIZE, targetPage * PAGE_SIZE);
      if (prevSlice[0]) {
        onSelectTrace(prevSlice[0]);
        const prevSpan = getFlaggedOrFirstSpan(prevSlice[0]);
        if (prevSpan) onSelectSpan(prevSpan);
        scrollToTrace(prevSlice[0].id);
      }
    }
  };

  const handleCurate = () => {
    if (currentSpan && currentTrace) {
      onCurateToDataset(currentSpan, currentTrace);
      setCuratedSuccess(true);
      setTimeout(() => setCuratedSuccess(false), 2500);
    }
  };

  const handleToggleSpanExpand = (spanId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedSpanIds(prev => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const handleCycleFlaggedSpan = () => {
    if (flaggedSpans.length === 0) return;
    const currentIndex = flaggedSpans.findIndex(s => s.id === currentSpan?.id);
    const nextIndex = (currentIndex + 1) % flaggedSpans.length;
    const nextSpan = flaggedSpans[nextIndex];
    if (nextSpan) {
      onSelectSpan(nextSpan);
      // Ensure its parent is expanded
      if (nextSpan.parentSpanId) {
        setExpandedSpanIds(prev => new Set([...prev, nextSpan.parentSpanId!]));
      }
    }
  };

  // Global Keyboard Shortcuts for Traces Investigation (J/K, N/P, Enter, 1-4, C, E, /, ?, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = isTypingTarget(activeEl);

      // Search hotkey: '/' focuses search input if not already typing
      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Escape hotkey: clears search or blurs input
      if (e.key === 'Escape') {
        if (isInputActive) {
          (activeEl as HTMLElement).blur();
        } else if (searchQuery !== '') {
          setSearchQuery('');
        }
        return;
      }

      // If user is currently typing in an input, do not capture single-letter navigation keys
      if (isInputActive) return;

      // App.tsx owns "G then a letter" navigation (G E is Experiments, G C the context panel),
      // so the letter after a G is not a Traces shortcut.
      if (e.key.toLowerCase() === 'g') {
        lastGPressRef.current = Date.now();
        return;
      }
      if (isChordFollowUp(lastGPressRef.current, Date.now())) {
        lastGPressRef.current = 0;
        return;
      }

      // An open dialog (the shortcuts sheet) has the keyboard; do not export or copy behind it
      if (document.querySelector('[aria-modal="true"]')) return;

      // N or PageDown: Next page of traces
      if ((e.key.toLowerCase() === 'n' || e.key === 'PageDown') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleNextPage();
        return;
      }

      // P or PageUp: Previous page of traces
      if ((e.key.toLowerCase() === 'p' || e.key === 'PageUp') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handlePrevPage();
        return;
      }

      // J or ArrowDown: Next trace in list
      if (e.key.toLowerCase() === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredTraces.length === 0) return;
        const currentIndex = filteredTraces.findIndex(t => t.id === currentTrace?.id);
        const nextIndex = currentIndex < filteredTraces.length - 1 ? currentIndex + 1 : 0;
        const nextTrace = filteredTraces[nextIndex];
        if (nextTrace) {
          // Adjust page if nextTrace is on another page
          const targetPage = Math.floor(nextIndex / PAGE_SIZE) + 1;
          if (targetPage !== safePage) {
            setCurrentPage(targetPage);
          }
          onSelectTrace(nextTrace);
          if (nextTrace.spans && nextTrace.spans.length > 0) {
            onSelectSpan(nextTrace.spans[0]);
          }
          scrollToTrace(nextTrace.id);
        }
        return;
      }

      // K or ArrowUp: Previous trace in list
      if (e.key.toLowerCase() === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredTraces.length === 0) return;
        const currentIndex = filteredTraces.findIndex(t => t.id === currentTrace?.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredTraces.length - 1;
        const prevTrace = filteredTraces[prevIndex];
        if (prevTrace) {
          // Adjust page if prevTrace is on another page
          const targetPage = Math.floor(prevIndex / PAGE_SIZE) + 1;
          if (targetPage !== safePage) {
            setCurrentPage(targetPage);
          }
          onSelectTrace(prevTrace);
          if (prevTrace.spans && prevTrace.spans.length > 0) {
            onSelectSpan(prevTrace.spans[0]);
          }
          scrollToTrace(prevTrace.id);
        }
        return;
      }

      // Enter: Focus / Inspect details of selected trace. Not when a button, link or menu item has the
      // focus: Enter must click it (export buttons, status chips, perspective tabs), so the shortcut
      // steps aside and does not preventDefault.
      if (e.key === 'Enter') {
        if (isActivatableTarget(activeEl)) return;
        e.preventDefault();
        if (currentTrace) {
          if (currentTrace.spans && currentTrace.spans.length > 0 && !selectedSpan) {
            onSelectSpan(currentTrace.spans[0]);
          }
          setIsDetailsFlash(true);
          setTimeout(() => setIsDetailsFlash(false), 900);
          detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      // 1-4: Switch perspective views
      if (e.key === '1') {
        e.preventDefault();
        setViewPerspective('tree');
      } else if (e.key === '2') {
        e.preventDefault();
        setViewPerspective('timeline');
      } else if (e.key === '3') {
        e.preventDefault();
        setViewPerspective('flame');
      } else if (e.key === '4') {
        e.preventDefault();
        setViewPerspective('evidence');
      }

      // C: Curate span into dataset
      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleCurate();
      }

      // E: Export the filtered traces as CSV
      if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat) handleDownloadCSV();
      }

      // X: Export the selected trace as JSON
      if (e.key.toLowerCase() === 'x' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat && currentTrace) handleExportTraceJson(currentTrace);
      }

      // Y: Copy the selected trace ID. Shift+Y: copy the whole trace as JSON.
      if (e.key.toLowerCase() === 'y' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat && currentTrace) {
          if (e.shiftKey) {
            handleCopyTraceLog(currentTrace);
          } else {
            handleCopyTraceId(currentTrace);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredTraces, currentTrace, currentSpan, selectedSpan, searchQuery, safePage, totalPages]);

  // A short message for what can go wrong with these shortcuts: the browser or the API said no
  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(prev => (prev === message ? null : prev)), 3000);
  };

  // Only the newest traces arrive with their spans. A trace further down the list is just a list
  // entry, so an export or a copy loads its detail first and never writes out an empty shell.
  const withFullTrace = async (trace: Trace, action: (full: Trace) => void | Promise<void>) => {
    let full: Trace;
    try {
      full = await loadFullTrace(trace);
    } catch (err) {
      showNotice(`Could not load trace ${trace.id} from the API${err instanceof Error ? `: ${err.message}` : ''}`);
      return;
    }
    await action(full);
  };

  const handleDownloadCSV = async () => {
    if (filteredTraces.length === 0) return;
    let full: Trace[];
    try {
      full = await loadFullTraces(filteredTraces);
    } catch (err) {
      showNotice(`CSV export failed: could not load every trace from the API${err instanceof Error ? ` (${err.message})` : ''}`);
      return;
    }
    if (downloadTracesAsCsv(full)) {
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } else {
      showNotice('CSV export failed: the browser did not start the download.');
    }
  };

  const handleExportTraceJson = (trace: Trace) =>
    withFullTrace(trace, (full) => {
      if (downloadTraceAsJson(full)) {
        setJsonExportedTraceId(trace.id);
        setTimeout(() => setJsonExportedTraceId(prev => (prev === trace.id ? null : prev)), 2000);
      } else {
        showNotice('JSON export failed: the browser did not start the download.');
      }
    });

  const handleCopyTraceId = async (trace: Trace) => {
    if (await copyTraceIdToClipboard(trace.id)) {
      setCopiedTraceId(trace.id);
      setTimeout(() => setCopiedTraceId(prev => (prev === trace.id ? null : prev)), 2000);
    } else {
      showNotice('Copy failed: the browser blocked clipboard access.');
    }
  };

  const handleCopyTraceLog = (trace: Trace) =>
    withFullTrace(trace, async (full) => {
      if (await copyTraceLogBodyToClipboard(full)) {
        setCopiedLogTraceId(trace.id);
        setTimeout(() => setCopiedLogTraceId(prev => (prev === trace.id ? null : prev)), 2000);
      } else {
        showNotice('Copy failed: the browser blocked clipboard access.');
      }
    });

  return (
    <div className="space-y-6 pb-28">
      {/* Top Filter & Perspective Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Activity className="w-5 h-5 text-neutral-400" />
            <span>Trace Investigation Spine</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            LangSmith / Weave hierarchical execution & Honeycomb multi-agent lanes
          </p>
        </div>

        {/* Action Controls & View Perspective Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenShortcutsModal && (
            <button
              onClick={onOpenShortcutsModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border bg-[#101116] border-white/[0.1] text-neutral-300 hover:text-white hover:bg-[#181920] hover:border-white/20 transition-all"
              title="Keyboard Shortcuts Cheat Sheet (Press ?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-neutral-400" />
              <span>Shortcuts</span>
              <kbd className="px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-[10px]">?</kbd>
            </button>
          )}

          <button
            onClick={handleDownloadCSV}
            disabled={filteredTraces.length === 0}
            title={filteredTraces.length === 0 ? 'No traces to export (or press E)' : `Export ${filteredTraces.length} filtered traces as CSV (Press E)`}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-all duration-200 ${
              downloadSuccess
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
                : 'bg-[#101116] border-white/[0.1] text-neutral-300 hover:text-white hover:bg-[#181920] hover:border-white/20'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {downloadSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exported CSV</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span>Download CSV</span>
                <kbd className="text-[10px] text-neutral-400 bg-white/[0.06] border border-white/[0.08] px-1 py-0.2 rounded ml-0.5">
                  E
                </kbd>
                <span className="text-[10px] text-neutral-500 bg-white/[0.06] px-1.5 py-0.2 rounded ml-1">
                  {filteredTraces.length}
                </span>
              </>
            )}
          </button>

          <button
            onClick={() => currentTrace && handleExportTraceJson(currentTrace)}
            disabled={!currentTrace}
            title={currentTrace ? `Export trace ${currentTrace.id} as JSON (Press X)` : 'Select a trace to export it as JSON (or press X)'}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-all duration-200 ${
              currentTrace && jsonExportedTraceId === currentTrace.id
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
                : 'bg-[#101116] border-white/[0.1] text-neutral-300 hover:text-white hover:bg-[#181920] hover:border-white/20'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {currentTrace && jsonExportedTraceId === currentTrace.id ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exported JSON</span>
              </>
            ) : (
              <>
                <FileJson className="w-3.5 h-3.5 text-neutral-400" />
                <span>Export JSON</span>
                <kbd className="text-[10px] text-neutral-400 bg-white/[0.06] border border-white/[0.08] px-1 py-0.2 rounded ml-0.5">
                  X
                </kbd>
              </>
            )}
          </button>

          {notice && (
            <span role="status" className="px-2.5 py-1.5 text-xs font-mono rounded-lg border bg-rose-950/40 border-rose-900/60 text-rose-300">
              {notice}
            </span>
          )}

          {/* View Perspective Switcher with Sliding layoutId Pill */}
          <div className="flex items-center space-x-1 bg-[#101116] border border-white/[0.08] p-1 rounded-xl relative">
            {(
              [
                { id: 'tree', label: 'Tree View', key: '1' },
                { id: 'timeline', label: 'Timeline Lanes', key: '2' },
                { id: 'flame', label: 'Flame Graph', key: '3' },
                { id: 'evidence', label: 'Evaluators & Evidence', key: '4' },
              ] as const
            ).map((p) => {
              const active = viewPerspective === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setViewPerspective(p.id)}
                  title={`${p.label} (Press ${p.key})`}
                  className={`relative px-3 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center space-x-1.5 tactile-press z-10 ${
                    active ? 'text-neutral-950 font-medium' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="activePerspectivePill"
                      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                      className="absolute inset-0 bg-white rounded-lg shadow-sm z-[-1]"
                    />
                  )}
                  <span>{p.label}</span>
                  <kbd
                    className={`text-[9px] px-1 rounded keycap-bevel ${
                      active ? 'bg-black/15 text-neutral-900 border-black/20' : 'bg-white/[0.06] text-neutral-400 border-white/10'
                    }`}
                  >
                    {p.key}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Global Keyboard Navigation Quick Bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-neutral-400 px-3.5 py-2 rounded-xl bg-[#090a0d] border border-white/[0.07] shadow-inner gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold flex items-center space-x-1">
            <Keyboard className="w-3 h-3 text-neutral-400" />
            <span>Power Navigation:</span>
          </span>
          <span className="flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">J</kbd>
            <span className="text-neutral-500">/</span>
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">K</kbd>
            <span className="text-neutral-300 ml-1">next/prev trace</span>
          </span>
          <span className="flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px] flex items-center space-x-0.5">
              <CornerDownLeft className="w-2.5 h-2.5" />
              <span>Enter</span>
            </kbd>
            <span className="text-neutral-300 ml-1">inspect details</span>
          </span>
          <span className="hidden sm:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">1</kbd>
            <span className="text-neutral-500">-</span>
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">4</kbd>
            <span className="text-neutral-300 ml-1">perspectives</span>
          </span>
          <span className="hidden md:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">C</kbd>
            <span className="text-neutral-300 ml-1">curate</span>
          </span>
          <span className="hidden lg:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">X</kbd>
            <span className="text-neutral-500">/</span>
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">E</kbd>
            <span className="text-neutral-300 ml-1">export JSON / CSV</span>
          </span>
          <span className="hidden lg:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">Y</kbd>
            <span className="text-neutral-500">/</span>
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">⇧Y</kbd>
            <span className="text-neutral-300 ml-1">copy ID / log</span>
          </span>
          <span className="hidden lg:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-white font-bold text-[10px]">/</kbd>
            <span className="text-neutral-300 ml-1">search</span>
          </span>
        </div>

        {onOpenShortcutsModal && (
          <button
            onClick={onOpenShortcutsModal}
            className="text-neutral-400 hover:text-white flex items-center space-x-1.5 ml-auto transition-colors group tactile-press"
          >
            <span className="group-hover:underline decoration-white/30">All shortcuts</span>
            <kbd className="px-1.5 py-0.5 rounded keycap-bevel text-neutral-300 text-[10px] font-bold">?</kbd>
          </button>
        )}
      </div>

      {/* Dedicated Text-Based Filter Bar */}
      <div className="glass-morphism-v2 rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-white/[0.12] anime-tab-card">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter traces by Trace ID, Agent Name, Status (Press '/' to focus)..."
            aria-label="Filter traces"
            className="w-full surface-solid bg-[#08090b] border border-[#191b22] rounded-lg pl-9 pr-9 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-white/30 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-0.5 rounded transition-colors"
              title="Clear search (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Chips, Filter Dropdown & Quick Sort */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Quick Status Chips */}
          <div className="flex items-center space-x-1 bg-[#08090b] border border-[#191b22] p-1 rounded-lg relative">
            {(
              [
                { id: 'all' as const, label: `All (${statusCounts.all})` },
                { id: 'ok' as const, label: `OK (${statusCounts.ok})`, dotClass: 'bg-emerald-400 phosphor-emerald' },
                { id: 'warning' as const, label: `Warning (${statusCounts.warning})`, dotClass: 'bg-amber-400 phosphor-amber' },
                { id: 'error' as const, label: `Error (${statusCounts.error})`, dotClass: 'bg-rose-400 phosphor-rose' },
              ]
            ).map((opt) => {
              const active = statusFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setStatusFilter(opt.id)}
                  className={`relative px-2.5 py-1 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 tactile-press z-10 ${
                    active ? 'text-neutral-950 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="activeStatusFilterPill"
                      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      className="absolute inset-0 bg-white rounded-md shadow-sm z-[-1]"
                    />
                  )}
                  {'dotClass' in opt && (
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.dotClass}`} />
                  )}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Filter & Sort Dropdown Trigger & Popover */}
          <div className="relative">
            <button
              ref={filterButtonRef}
              onClick={() => setIsFilterDropdownOpen(prev => !prev)}
              className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-mono rounded-lg border transition-all duration-200 tactile-press ${
                isFilterDropdownOpen || activeFiltersCount > 0
                  ? 'bg-neutral-900 border-white/30 text-white shadow-sm ring-1 ring-white/10'
                  : 'bg-[#08090b] border-[#191b22] text-neutral-300 hover:text-white hover:border-white/20'
              }`}
              title="Open filter dropdown: status, duration range & sort order"
              aria-expanded={isFilterDropdownOpen}
              aria-haspopup="dialog"
            >
              <Filter className="w-3.5 h-3.5 text-neutral-400" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                  isFilterDropdownOpen ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {/* Filter Dropdown Popover */}
            <AnimatePresence>
              {isFilterDropdownOpen && (
                <motion.div
                  ref={filterDropdownRef}
                  id="traces-filter-dropdown-popover"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute right-0 top-full mt-2 w-84 sm:w-[420px] rounded-2xl glass-morphism-v2 border border-white/[0.15] bg-[#0c0d14]/98 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-4 z-50 text-neutral-200 text-xs font-mono space-y-4"
                >
                  <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none rounded-t-2xl" />

                  {/* Popover Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                    <div className="flex items-center space-x-2">
                      <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-white tracking-wide">Trace Filters & Sort</span>
                      {activeFiltersCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                          {activeFiltersCount} active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="text-[11px] text-neutral-400 hover:text-white flex items-center space-x-1 underline decoration-white/20 transition-colors"
                          title="Reset status, duration, and sort filters"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      )}
                      <button
                        onClick={() => setIsFilterDropdownOpen(false)}
                        className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                        title="Close filter menu (Esc)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Section 1: Status Filter */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      <span className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Trace Status</span>
                      </span>
                      <span className="text-[10px] lowercase text-neutral-500 font-normal">health filter</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {(
                        [
                          { id: 'all' as const, label: 'All', count: statusCounts.all, dot: null },
                          { id: 'ok' as const, label: 'OK', count: statusCounts.ok, dot: 'bg-emerald-400 phosphor-emerald' },
                          { id: 'warning' as const, label: 'Warning', count: statusCounts.warning, dot: 'bg-amber-400 phosphor-amber' },
                          { id: 'error' as const, label: 'Error', count: statusCounts.error, dot: 'bg-rose-400 phosphor-rose' },
                        ]
                      ).map(item => {
                        const isSelected = statusFilter === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setStatusFilter(item.id)}
                            className={`px-2 py-1.5 rounded-lg border text-left flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-white/15 border-white/40 text-white font-semibold shadow-inner'
                                : 'bg-[#08090b] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/20'
                            }`}
                          >
                            <span className="flex items-center space-x-1.5 truncate">
                              {item.dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />}
                              <span className="truncate">{item.label}</span>
                            </span>
                            <span className={`text-[10px] ml-1 shrink-0 ${isSelected ? 'text-white' : 'text-neutral-500'}`}>
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Duration Range Filter */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      <span className="flex items-center space-x-1.5">
                        <Timer className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Duration Range</span>
                      </span>
                      <span className="text-[10px] lowercase text-neutral-500 font-normal">execution latency</span>
                    </div>

                    {/* A trace whose duration was never recorded (not opened yet, no end time) is in no
                        bracket; say so, so a bracket's list is not read as complete. */}
                    {durationCounts.unknown > 0 && (
                      <p className="text-[10px] text-neutral-500 normal-case font-normal">
                        {durationCounts.unknown} trace{durationCounts.unknown === 1 ? ' has' : 's have'} no recorded duration
                        and {durationCounts.unknown === 1 ? 'is' : 'are'} left out of every bracket below.
                      </p>
                    )}

                    {/* Preset Duration Buttons */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {TRACE_DURATION_PRESETS.map(preset => {
                        const isSelected = durationPreset === preset.id;
                        const count =
                          preset.id === 'all'
                            ? durationCounts.all
                            : preset.id === 'fast'
                            ? durationCounts.fast
                            : preset.id === 'moderate'
                            ? durationCounts.moderate
                            : preset.id === 'slow'
                            ? durationCounts.slow
                            : durationCounts.long;

                        return (
                          <button
                            key={preset.id}
                            onClick={() => {
                              setDurationPreset(preset.id);
                              if (preset.id !== 'custom') {
                                setCustomMinDuration('');
                                setCustomMaxDuration('');
                              }
                            }}
                            className={`px-2 py-1.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-white/15 border-white/40 text-white font-semibold shadow-inner'
                                : 'bg-[#08090b] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate">{preset.badge}</span>
                              <span className={`text-[10px] ${isSelected ? 'text-white' : 'text-neutral-500'}`}>
                                {count}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-500 truncate font-normal">
                              {preset.sublabel}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Duration Input Box */}
                    <div className="p-2.5 rounded-xl bg-[#08090b] border border-white/[0.08] space-y-1.5 mt-1">
                      <div className="flex items-center justify-between text-[10px] text-neutral-400">
                        <span>Custom Duration Range (ms):</span>
                        {(customMinDuration !== '' || customMaxDuration !== '') && (
                          <button
                            onClick={() => {
                              setCustomMinDuration('');
                              setCustomMaxDuration('');
                              setDurationPreset('all');
                            }}
                            className="text-[10px] text-neutral-500 hover:text-neutral-300 underline"
                          >
                            Clear custom
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="50"
                            placeholder="Min (e.g. 200)"
                            value={customMinDuration}
                            onChange={(e) => {
                              setCustomMinDuration(e.target.value);
                              setDurationPreset('custom');
                            }}
                            className="w-full bg-[#101117] border border-white/[0.1] rounded-lg px-2.5 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/30"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 pointer-events-none">
                            ms
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="50"
                            placeholder="Max (e.g. 2500)"
                            value={customMaxDuration}
                            onChange={(e) => {
                              setCustomMaxDuration(e.target.value);
                              setDurationPreset('custom');
                            }}
                            className="w-full bg-[#101117] border border-white/[0.1] rounded-lg px-2.5 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/30"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 pointer-events-none">
                            ms
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Sort Order */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      <span className="flex items-center space-x-1.5">
                        <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Sort Traces By</span>
                      </span>
                      <span className="text-[10px] lowercase text-neutral-500 font-normal">triage ordering</span>
                    </div>
                    <div className="relative">
                      <select
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as TraceSortOption)}
                        className="w-full bg-[#08090b] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-white/30 cursor-pointer appearance-none pr-8"
                      >
                        {TRACE_SORT_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id} className="bg-[#0c0d14] text-white">
                            {opt.label} — {opt.description}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Popover Footer */}
                  <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
                    <div className="text-[11px] text-neutral-400">
                      <span className="text-white font-semibold">{filteredTraces.length}</span> matching / {traces.length} traces
                    </div>
                    <button
                      onClick={() => setIsFilterDropdownOpen(false)}
                      className="px-3.5 py-1.5 rounded-lg bg-white text-neutral-950 font-semibold hover:bg-neutral-200 transition-colors tactile-press text-xs shadow-sm"
                    >
                      Apply & Close
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Sort Dropdown on Toolbar */}
          <div className="flex items-center space-x-2 bg-[#08090b] border border-[#191b22] px-2.5 py-1.5 rounded-lg shadow-sm hover:border-white/20 transition-colors">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <label htmlFor="traces-sort-by-select" className="text-[11px] font-mono text-neutral-400 whitespace-nowrap">
              Sort:
            </label>
            <div className="relative flex items-center">
              <select
                id="traces-sort-by-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as TraceSortOption)}
                className="bg-transparent text-xs font-mono text-neutral-200 focus:outline-none cursor-pointer pr-5 py-0.5 appearance-none max-w-[130px] truncate"
                aria-label="Sort traces by criteria"
              >
                {TRACE_SORT_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id} className="bg-[#0b0d13] text-white">
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-0 pointer-events-none" />
            </div>
          </div>

          {/* Result Counter */}
          <div className="text-[11px] font-mono text-neutral-400 px-2 py-1 bg-[#08090b] border border-[#191b22] rounded-lg">
            <span className="text-neutral-200 font-semibold">{filteredTraces.length}</span> of {traces.length} traces
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {activeFiltersCount > 0 && (
          <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-neutral-500 text-[11px] uppercase tracking-wider flex items-center space-x-1">
              <Filter className="w-3 h-3 text-neutral-400" />
              <span>Active Filters:</span>
            </span>

            {/* Status Chip */}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-neutral-200">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  statusFilter === 'ok' ? 'bg-emerald-400' : statusFilter === 'warning' ? 'bg-amber-400' : 'bg-rose-400'
                }`} />
                <span>Status: {statusFilter.toUpperCase()}</span>
                <button
                  onClick={() => setStatusFilter('all')}
                  className="hover:text-white text-neutral-400 ml-0.5"
                  title="Remove status filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Duration Range Chip */}
            {durationPreset !== 'all' && (
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-neutral-200">
                <Timer className="w-3 h-3 text-neutral-400" />
                <span>
                  Duration:{' '}
                  {durationPreset === 'custom'
                    ? `${customMinDuration || 0}ms – ${customMaxDuration || '∞'}ms`
                    : TRACE_DURATION_PRESETS.find(p => p.id === durationPreset)?.badge}
                </span>
                <button
                  onClick={() => {
                    setDurationPreset('all');
                    setCustomMinDuration('');
                    setCustomMaxDuration('');
                  }}
                  className="hover:text-white text-neutral-400 ml-0.5"
                  title="Remove duration filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Sort Chip */}
            {sortOption !== 'timestamp-desc' && (
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-neutral-200">
                <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                <span>Sort: {TRACE_SORT_OPTIONS.find(s => s.id === sortOption)?.shortLabel}</span>
                <button
                  onClick={() => setSortOption('timestamp-desc')}
                  className="hover:text-white text-neutral-400 ml-0.5"
                  title="Reset to newest first"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              onClick={handleResetFilters}
              className="text-[11px] text-neutral-400 hover:text-white underline decoration-white/20 ml-1 transition-colors"
            >
              Reset all
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Split: Trace List (Left) + Selected Trace Investigation View (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Trace List with Real-Time Auto-Scroll Stream */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search traces by ID, tag, or input..."
                aria-label="Search traces"
                className="w-full surface-solid bg-[#08090b] border border-[#191b22] rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <button
              onClick={handleDownloadCSV}
              disabled={filteredTraces.length === 0}
              title="Download filtered traces CSV"
              className="p-2 surface-solid bg-[#08090b] border border-[#191b22] hover:border-white/20 text-neutral-400 hover:text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Trace Stream Auto-Scroll Control Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#0c0d12] border border-white/[0.06] text-xs font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-neutral-500 text-[10px] uppercase font-semibold">Stream Follow:</span>
              <button
                onClick={() => {
                  if (!isAutoScrollEnabled) {
                    scrollToBottomAndResumeAutoScroll();
                  } else {
                    setIsAutoScrollEnabled(false);
                  }
                }}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  isAutoScrollEnabled
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-white/[0.04] text-neutral-400 border border-white/[0.08] hover:text-neutral-200'
                }`}
                title={isAutoScrollEnabled ? 'Auto-scroll is actively following latest traces' : 'Click to enable auto-scroll stream follow'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isAutoScrollEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
                <span>{isAutoScrollEnabled ? 'Auto-Scroll ON' : 'Auto-Scroll Paused'}</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setTimeFormatMode(prev => prev === 'relative' ? 'absolute' : prev === 'absolute' ? 'dual' : 'relative')}
                title={`Times shown as: ${timeFormatMode}. Click to switch between how long ago, the clock time, and both.`}
                className="text-[10px] text-neutral-400 hover:text-neutral-200 flex items-center space-x-1 px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
              >
                <Clock className="w-2.5 h-2.5 text-neutral-400" />
                <span>{timeFormatMode === 'relative' ? 'Time ago' : timeFormatMode === 'absolute' ? 'Clock time' : 'Both'}</span>
              </button>
              <button
                onClick={() => setSortOrder(prev => prev === 'reverse-chronological' ? 'chronological' : 'reverse-chronological')}
                title={`Sort: ${TRACE_SORT_OPTIONS.find(o => o.id === sortOption)?.label ?? sortOption}. Click to switch between newest and oldest first.`}
                className="text-[10px] text-neutral-400 hover:text-neutral-200 flex items-center space-x-1 px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
              >
                <ArrowUpDown className="w-2.5 h-2.5 text-neutral-400" />
                {/* The label of the sort that is active (it said 'Newest First' under any other sort) */}
                <span>{TRACE_SORT_OPTIONS.find(o => o.id === sortOption)?.shortLabel ?? (sortOrder === 'reverse-chronological' ? 'Newest First' : 'Oldest First')}</span>
              </button>
              <span className="text-[10px] text-neutral-500">
                {filteredTraces.length} logs
              </span>
            </div>
          </div>

          {/* Trace List Scrollable Container */}
          <div className="relative">
            <div
              ref={traceListContainerRef}
              onScroll={handleTraceListScroll}
              className="space-y-2 max-h-[580px] overflow-y-auto pr-1 scrollbar-thin scroll-smooth"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {paginatedTraces.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-8 text-center border border-dashed border-white/10 rounded-xl font-mono text-xs text-neutral-500"
                  >
                    No matching traces found on this page.
                  </motion.div>
                ) : (
                  paginatedTraces.map((trace) => {
                    const isSelected = currentTrace?.id === trace.id;
                    const hasDiscrepancy = trace.status === 'error' || trace.status === 'warning';
                    const timeInfo = getTimeDisplayInfo(trace.timestamp, nowMs);

                    return (
                      <motion.div
                        key={trace.id}
                        layout="position"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{
                          layout: {
                            type: 'spring',
                            stiffness: 380,
                            damping: 30,
                            mass: 0.8
                          },
                          opacity: { duration: 0.2 },
                          y: { duration: 0.25 }
                        }}
                        ref={(el) => {
                          if (el) {
                            traceItemRefs.current.set(trace.id, el as HTMLDivElement);
                          } else {
                            traceItemRefs.current.delete(trace.id);
                          }
                        }}
                        onClick={() => {
                          onSelectTrace(trace);
                          const targetSpan = getFlaggedOrFirstSpan(trace);
                          if (targetSpan) {
                            onSelectSpan(targetSpan);
                          }
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-colors duration-200 relative overflow-hidden ${
                          isSelected
                            ? 'glass-morphism-v2 border-glow-subtle border-white/40 shadow-md ring-1 ring-white/10 text-white'
                            : hasDiscrepancy
                            ? trace.status === 'error'
                              ? 'bg-rose-950/20 border-rose-900/40 text-neutral-200 hover:border-rose-700/60 hover:bg-rose-950/30'
                              : 'bg-amber-950/20 border-amber-900/40 text-neutral-200 hover:border-amber-700/60 hover:bg-amber-950/30'
                            : 'ios-liquid-row border-white/[0.08] text-neutral-300 hover:border-white/20'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-mono mb-1">
                          <span className="font-bold text-white flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                trace.status === 'error'
                                  ? 'bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                                  : trace.status === 'warning'
                                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                                  : 'bg-neutral-300'
                              }`}
                            />
                            <span className="break-all">{trace.id}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyTraceId(trace);
                              }}
                              className={`px-1 py-0.2 rounded text-[9px] font-mono flex items-center space-x-0.5 transition-all border shrink-0 ${
                                copiedTraceId === trace.id
                                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                                  : 'bg-white/[0.06] border-white/[0.12] text-neutral-400 hover:text-white hover:bg-white/[0.14]'
                              }`}
                              title="Copy Trace ID"
                              aria-label={`Copy Trace ID ${trace.id}`}
                            >
                              {copiedTraceId === trace.id ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-300" />
                                  <span className="text-[8px] text-emerald-300">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5" />
                                  <span className="text-[8px]">Copy</span>
                                </>
                              )}
                            </button>
                          </span>
                          <div className="flex items-center space-x-1.5">
                            {hasDiscrepancy && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold uppercase ${
                                  trace.status === 'error'
                                    ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                                    : 'bg-amber-950/80 border-amber-800 text-amber-300'
                                }`}
                              >
                                {trace.status}
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[9px] text-white/90 bg-white/10 px-1.5 py-0.5 rounded border border-white/20 font-bold flex items-center space-x-0.5">
                                <CornerDownLeft className="w-2.5 h-2.5" />
                                <span>Active</span>
                              </span>
                            )}
                            <span className="text-neutral-500" title={formatTimeTooltip(timeInfo)}>
                              {formatTimeForMode(timeInfo, timeFormatMode)}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-neutral-300 line-clamp-2 font-mono my-1.5">
                          {trace.inputPreview}
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.06]">
                          <span className="truncate max-w-[120px] text-neutral-300">{trace.agentName.split(' ')[0]}</span>
                          <span>{trace.durationMs}ms</span>
                          <span>{trace.totalTokens != null ? `${trace.totalTokens}t` : '—'}</span>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>

            {/* Floating Auto-Scroll Resume Button when scrolled up */}
            {isUserScrolledUp && (
              <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none z-10">
                <button
                  onClick={scrollToBottomAndResumeAutoScroll}
                  className="pointer-events-auto px-3 py-1.5 rounded-full bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-mono font-medium shadow-lg hover:bg-emerald-900/90 hover:border-emerald-400 transition-all flex items-center space-x-1.5 backdrop-blur-md animate-bounce"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Resume Auto-Scroll</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </button>
              </div>
            )}
          </div>

          {/* Trace List Pagination Controls Bar */}
          {filteredTraces.length > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-xl ios-liquid-row border border-white/[0.08] text-xs font-mono text-neutral-400 select-none">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrevPage}
                  disabled={safePage <= 1}
                  title="Previous Page (P / PageUp)"
                  className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-neutral-300 hover:text-white border border-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                  <kbd className="text-[10px] px-1 py-0.2 rounded bg-black/50 border border-white/15 text-neutral-300">P</kbd>
                </button>

                <button
                  onClick={handleNextPage}
                  disabled={safePage >= totalPages}
                  title="Next Page (N / PageDown)"
                  className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-neutral-300 hover:text-white border border-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1.5"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <kbd className="text-[10px] px-1 py-0.2 rounded bg-black/50 border border-white/15 text-neutral-300">N</kbd>
                </button>
              </div>

              <div className="flex items-center space-x-1 text-[11px] text-neutral-400">
                <span>Page</span>
                <span className="text-white font-bold">{safePage}</span>
                <span>/</span>
                <span>{totalPages}</span>
                <span className="text-neutral-600 ml-1">({filteredTraces.length} total)</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Columns: Selected Trace Multi-View & Span Inspector */}
        {currentTrace && (
          <div
            ref={detailsRef}
            className={`lg:col-span-8 space-y-6 transition-all duration-300 rounded-2xl anime-tab-card ${
              isDetailsFlash ? 'ring-1 ring-white/30 shadow-[0_0_30px_rgba(255,255,255,0.06)]' : ''
            }`}
          >
            {/* Persistent In-View Context Navigation Hierarchy Bar */}
            <div className="glass-morphism-v2 border border-white/[0.12] rounded-xl px-4 py-2.5 flex items-center space-x-2 text-xs font-mono overflow-x-auto scrollbar-none shadow-sm">
              <span className="text-neutral-500 uppercase tracking-wider text-[10px] shrink-0">Context Hierarchy:</span>
              
              {/* Agent Crumb */}
              <span className="text-neutral-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08] shrink-0">
                Agent: <span className="text-white font-medium">{currentTrace.agentName}</span>
              </span>

              <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />

              {/* Trace Crumb */}
              <span
                className={`px-2 py-0.5 rounded border shrink-0 ${
                  currentTrace.status === 'error'
                    ? 'bg-rose-950/40 border-rose-900/80 text-rose-300'
                    : currentTrace.status === 'warning'
                    ? 'bg-amber-950/40 border-amber-900/80 text-amber-300'
                    : 'bg-white/[0.06] border-white/[0.12] text-white'
                }`}
              >
                Trace: <span className="font-semibold">{currentTrace.id}</span>
              </span>

              {/* Span Crumb (if selected) */}
              {currentSpan && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                  <span
                    className={`px-2 py-0.5 rounded border shrink-0 ${
                      currentSpan.status === 'error'
                        ? 'bg-rose-950/40 border-rose-900/80 text-rose-300'
                        : currentSpan.status === 'warning'
                        ? 'bg-amber-950/40 border-amber-900/80 text-amber-300'
                        : 'bg-white/[0.08] border-white/[0.18] text-white font-medium'
                    }`}
                  >
                    Span: <span className="font-medium">{currentSpan.name}</span>
                  </span>
                </>
              )}
            </div>

            {/* Trace Overview Ribbon */}
            <div className="glass-morphism-v2 border-glow-subtle rounded-xl p-5 border border-white/[0.12] relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex flex-wrap items-center gap-x-2">
                    <span>SELECTED TRACE{currentTrace.sessionId ? ` · ${currentTrace.sessionId}` : ''}</span>
                    {selectedTraceTime && (
                      <>
                        <span className="text-neutral-600">·</span>
                        <time
                          dateTime={selectedTraceTime.isoString || undefined}
                          title={formatTimeTooltip(selectedTraceTime)}
                          className="normal-case"
                        >
                          {selectedTraceTime.relative}
                          {selectedTraceTime.timestampMs > 0 && ` (${selectedTraceTime.formattedTime})`}
                        </time>
                      </>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <h3 className="text-sm font-semibold text-white font-mono">
                      {currentTrace.id} &nbsp;·&nbsp; {currentTrace.agentName}
                    </h3>
                    {/* Copy menu: the trace id (Y) or the whole trace as JSON (Shift+Y). Both entries call
                        the same handlers as the keyboard shortcuts. */}
                    {/* Screen readers hear the result of a copy (the button text changes but is not announced) */}
                    <span role="status" aria-live="polite" className="sr-only">
                      {copiedTraceId === currentTrace.id ? 'Trace ID copied' : copiedLogTraceId === currentTrace.id ? 'Full trace log copied' : copiedSpanPayload ? 'Copied' : ''}
                    </span>
                    <div className="relative inline-flex" ref={copyMenuRef}>
                      <button
                        ref={copyButtonRef}
                        onClick={() => setIsCopyMenuOpen((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center space-x-1.5 transition-all border shrink-0 ${
                          copiedTraceId === currentTrace.id || copiedLogTraceId === currentTrace.id
                            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
                            : 'bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 border-white/[0.12] hover:border-white/20'
                        }`}
                        title="Copy the trace ID or the full log to the clipboard (Shortcut: Y / Shift+Y)"
                        aria-label="Copy to Clipboard"
                        aria-expanded={isCopyMenuOpen}
                      >
                        {copiedTraceId === currentTrace.id || copiedLogTraceId === currentTrace.id ? (
                          <>
                            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300 font-medium">
                              {copiedTraceId === currentTrace.id ? 'Trace ID Copied!' : 'Log Body Copied!'}
                            </span>
                          </>
                        ) : (
                          <>
                            <ClipboardCopy className="w-3.5 h-3.5 text-neutral-400" />
                            <span>Copy to Clipboard</span>
                            <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${isCopyMenuOpen ? 'rotate-180' : ''}`} />
                          </>
                        )}
                      </button>

                      {isCopyMenuOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-64 glass-morphism-v2 rounded-xl border border-white/[0.15] bg-[#0c0d12]/95 backdrop-blur-2xl shadow-2xl p-1.5 z-50 space-y-0.5">
                          <button
                            onClick={() => { handleCopyTraceId(currentTrace); setIsCopyMenuOpen(false); }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.08] text-neutral-200 hover:text-white flex items-start space-x-2.5 transition-colors"
                          >
                            <Copy className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white">Copy Trace ID</span>
                                <kbd className="text-[10px] px-1 rounded bg-black/60 border border-white/20 text-neutral-300">Y</kbd>
                              </div>
                              <p className="text-[10px] text-neutral-400 truncate mt-0.5">{currentTrace.id}</p>
                            </div>
                          </button>
                          <button
                            onClick={() => { handleCopyTraceLog(currentTrace); setIsCopyMenuOpen(false); }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.08] text-neutral-200 hover:text-white flex items-start space-x-2.5 transition-colors"
                          >
                            <FileText className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white">Copy Full Log Body</span>
                                <kbd className="text-[10px] px-1 rounded bg-black/60 border border-white/20 text-neutral-300">Shift+Y</kbd>
                              </div>
                              <p className="text-[10px] text-neutral-400 mt-0.5">
                                Structured JSON with {currentTrace.spans.length} loaded span{currentTrace.spans.length === 1 ? '' : 's'}
                              </p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 1-Click Curate into Dataset (Langfuse Loop) */}
                <button
                  onClick={handleCurate}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-xs font-mono flex items-center space-x-1.5 transition-colors border border-white/[0.12] hover:border-white/20 shrink-0"
                  title="Add this execution to regression dataset for offline evaluation"
                >
                  {curatedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span className="text-white font-medium">Curated to Dataset!</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Curate to Dataset</span>
                    </>
                  )}
                </button>
              </div>

              {/* Trace Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 font-mono text-xs">
                <div>
                  <span className="text-neutral-500 block text-[10px]">TOTAL DURATION</span>
                  <span className="text-white font-semibold mt-0.5 block">{currentTrace.durationMs} ms</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">TOTAL TOKENS</span>
                  <span className="text-white font-semibold mt-0.5 block">{currentTrace.totalTokens?.toLocaleString() ?? '—'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">ESTIMATED COST</span>
                  <span className="text-white font-semibold mt-0.5 block">{currentTrace.cost != null ? `$${currentTrace.cost.toFixed(4)}` : '—'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">RISK SCORE</span>
                  <span className={`font-semibold mt-0.5 block ${riskTextClasses(currentTrace.groundingScore)}`}>
                    {currentTrace.groundingScore != null ? `${(currentTrace.groundingScore * 100).toFixed(0)}%` : 'N/A'}
                  </span>
                </div>
              </div>

              {currentTrace.errorSummary && (
                <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs font-mono text-rose-300 flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Failure Discrepancy Flagged:</span>
                    <span>{currentTrace.errorSummary}</span>
                  </div>
                </div>
              )}
            </div>

            {/* PERSPECTIVE VIEW: TREE */}
            {viewPerspective === 'tree' && (
              <div className="glass-morphism-v2 border-glow-subtle rounded-xl border border-white/[0.12] p-4 space-y-3 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                
                {/* Tree View Header with Actions */}
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08] text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="text-neutral-400 uppercase tracking-wider">
                      Execution Tree Spans ({currentTrace.spans.length})
                    </span>
                    {flaggedSpans.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800 flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                        <span>{flaggedSpans.length} Flagged</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {flaggedSpans.length > 0 && (
                      <button
                        onClick={handleCycleFlaggedSpan}
                        className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-medium transition-colors flex items-center space-x-1"
                        title="Jump to next flagged span in this trace"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>Next Discrepancy</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const allIds = new Set(currentTrace.spans.map(s => s.id));
                        setExpandedSpanIds(allIds);
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.08] text-[10px] transition-colors"
                    >
                      Expand All
                    </button>
                    <button
                      onClick={() => {
                        // Collapse all except error/warning spans and their parents
                        const essential = new Set<string>();
                        flaggedSpans.forEach(s => {
                          essential.add(s.id);
                          if (s.parentSpanId) essential.add(s.parentSpanId);
                        });
                        setExpandedSpanIds(essential);
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.08] text-[10px] transition-colors"
                    >
                      Collapse Non-Discrepancies
                    </button>
                  </div>
                </div>

                {/* Discrepancy Alert Banner when spans are flagged */}
                {flaggedSpans.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs font-mono text-rose-200 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        <strong className="text-white">Auto-Expanded:</strong> {flaggedSpans.length} span(s) marked as warning/error immediately prioritized for root-cause isolation.
                      </span>
                    </div>
                    <button
                      onClick={handleCycleFlaggedSpan}
                      className="text-[11px] underline hover:text-white shrink-0 ml-2 font-semibold"
                    >
                      Inspect First Flagged &rarr;
                    </button>
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  {currentTrace.spans.map((span) => {
                    const isSelected = currentSpan?.id === span.id;
                    const isChild = !!span.parentSpanId;
                    const isFlaggedError = span.status === 'error' || span.evaluatorResults?.some(e => !e.passed);
                    const isFlaggedWarning = span.status === 'warning' && !isFlaggedError;
                    const hasChildren = currentTrace.spans.some(s => s.parentSpanId === span.id);
                    const isExpanded = expandedSpanIds.has(span.id);

                    // If parent is not expanded, hide child unless it is a flagged span
                    if (isChild && span.parentSpanId && !expandedSpanIds.has(span.parentSpanId) && !isFlaggedError && !isFlaggedWarning) {
                      return null;
                    }

                    return (
                      <div
                        key={span.id}
                        onClick={() => onSelectSpan(span)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-250 ease-out group relative overflow-hidden ${
                          isChild ? 'ml-6' : ''
                        } ${
                          isSelected
                            ? isFlaggedError
                              ? 'bg-rose-950/60 border-rose-500 text-white font-medium shadow-[0_0_20px_rgba(244,63,94,0.35)] ring-1 ring-rose-500/50'
                              : isFlaggedWarning
                              ? 'bg-amber-950/60 border-amber-500 text-white font-medium shadow-[0_0_20px_rgba(245,158,11,0.35)] ring-1 ring-amber-500/50'
                              : 'bg-[#1a1b24] border-white/50 text-white font-medium shadow-sm ring-1 ring-white/15'
                            : isFlaggedError
                            ? 'bg-rose-950/30 border-rose-800/80 text-rose-100 hover:bg-rose-950/50 hover:border-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                            : isFlaggedWarning
                            ? 'bg-amber-950/30 border-amber-800/80 text-amber-100 hover:bg-amber-950/50 hover:border-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                            : 'bg-[#111218]/90 border-white/[0.07] text-neutral-300 hover:bg-white/[0.07] hover:border-white/35 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                        )}
                        <div className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center space-x-2">
                            {hasChildren && (
                              <button
                                onClick={(e) => handleToggleSpanExpand(span.id, e)}
                                className="p-0.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}

                            <span
                              className={`w-2.5 h-2.5 rounded-full transition-transform duration-250 group-hover:scale-125 ${
                                isFlaggedError
                                  ? 'bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse'
                                  : isFlaggedWarning
                                  ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)]'
                                  : 'bg-neutral-300'
                              }`}
                            />
                            <span className="font-semibold transition-colors duration-250">{span.name}</span>
                            
                            <span className="text-[10px] text-neutral-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/[0.08] uppercase group-hover:border-white/25 group-hover:text-neutral-200 transition-all duration-250">
                              {span.type}
                            </span>

                            {/* Prominent Discrepancy Badges */}
                            {isFlaggedError && (
                              <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-rose-950 border border-rose-700 text-rose-300 shadow-sm flex items-center space-x-1">
                                <ShieldAlert className="w-3 h-3" />
                                <span>ERROR DISCREPANCY</span>
                              </span>
                            )}
                            {isFlaggedWarning && (
                              <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-amber-950 border border-amber-700 text-amber-300 shadow-sm flex items-center space-x-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>WARNING</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-4 text-neutral-400 group-hover:text-neutral-200 transition-colors duration-250">
                            {/* latencyMs, not durationMs: an unrecorded latency is a dash, not "0ms". */}
                            <span>{formatLatencyMs(span.latencyMs)}</span>
                            {span.tokens && <span>{span.tokens.total}t</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PERSPECTIVE VIEW: TIMELINE LANES */}
            {viewPerspective === 'timeline' && (
              <div className="glass-morphism-v2 border-glow-subtle rounded-xl border border-white/[0.12] p-5 space-y-4 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider pb-2 border-b border-white/[0.08] flex items-center justify-between">
                  <span>Horizontal Agent Execution Lanes</span>
                  <span>Total Duration: {currentTrace.durationMs}ms</span>
                </div>

                <div className="space-y-3 pt-2">
                  {currentTrace.spans.map((span) => {
                    const isSelected = currentSpan?.id === span.id;
                    const leftPct = Math.min((span.startOffsetMs / currentTrace.durationMs) * 100, 95);
                    const widthPct = Math.max((span.durationMs / currentTrace.durationMs) * 100, 6);

                    return (
                      <div
                        key={span.id}
                        onClick={() => onSelectSpan(span)}
                        className={`p-2.5 rounded-lg cursor-pointer transition-all duration-250 ease-out border group ${
                          isSelected
                            ? 'bg-[#1a1b24] border-white/50 shadow-sm ring-1 ring-white/15'
                            : 'bg-[#111218]/90 border-white/[0.07] hover:bg-white/[0.07] hover:border-white/35 hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                          <span className="font-medium text-neutral-200 group-hover:text-white transition-colors duration-250">
                            {span.agentLane || span.name} &nbsp;·&nbsp; <span className="text-neutral-400 text-[11px] group-hover:text-neutral-200 transition-colors duration-250">{span.name}</span>
                          </span>
                          <span className="text-[11px] text-neutral-400 group-hover:text-neutral-200 transition-colors duration-250">
                            +{span.startOffsetMs}ms ({formatLatencyMs(span.latencyMs)})
                          </span>
                        </div>

                        {/* Waterfall bar */}
                        <div className="h-3.5 bg-black rounded relative overflow-hidden border border-white/[0.08] group-hover:border-white/30 transition-colors duration-250">
                          <div
                            className={`absolute top-0 bottom-0 rounded transition-all duration-250 ${
                              span.status === 'error'
                                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                                : span.status === 'warning'
                                ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                                : 'bg-neutral-300 group-hover:bg-white'
                            }`}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PERSPECTIVE VIEW: FLAME GRAPH */}
            {viewPerspective === 'flame' && (
              <div className="glass-morphism-v2 border-glow-subtle rounded-xl border border-white/[0.12] p-5 space-y-3 font-mono text-xs relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                <div className="text-neutral-400 uppercase tracking-wider pb-2 border-b border-white/[0.08]">
                  Execution Flame Graph & Latency Cost Breakdown
                </div>
                <div className="space-y-1 pt-2">
                  {currentTrace.spans.map((span, idx) => {
                    const isSelected = currentSpan?.id === span.id;
                    // Share of the trace's duration; none when the span's latency was not recorded or
                    // the trace has no duration (dividing by 0 printed "NaN%").
                    const pct =
                      span.latencyMs != null && currentTrace.durationMs > 0
                        ? Math.round((span.latencyMs / currentTrace.durationMs) * 100)
                        : null;

                    return (
                      <div
                        key={span.id}
                        onClick={() => onSelectSpan(span)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-all duration-250 ease-out border group ${
                          isSelected
                            ? 'bg-[#1a1b24] border-white/50 shadow-sm ring-1 ring-white/15'
                            : 'bg-[#111218]/90 border-white/[0.07] hover:bg-white/[0.07] hover:border-white/35 hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-neutral-500 group-hover:text-neutral-300 transition-colors duration-250">#{idx + 1}</span>
                          <span className="font-semibold text-neutral-200 group-hover:text-white transition-colors duration-250">{span.name}</span>
                        </div>
                        <div className="flex items-center space-x-3 text-neutral-400 group-hover:text-neutral-200 transition-colors duration-250 shrink-0">
                          <span>{formatLatencyMs(span.latencyMs)}{pct != null ? ` (${pct}%)` : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PERSPECTIVE VIEW: EVALUATORS & EVIDENCE */}
            {viewPerspective === 'evidence' && (
              <div className="glass-morphism-v2 border-glow-subtle rounded-xl border border-white/[0.12] p-5 space-y-5 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider pb-2 border-b border-white/[0.08]">
                  Automated Evaluator Verdicts & Grounding Evidence
                </div>

                {currentTrace.spans.flatMap(s => s.evaluatorResults || []).length === 0 ? (
                  <div className="text-xs font-mono text-neutral-500 py-6 text-center">
                    All standard evaluators passed without discrepancy flags.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentTrace.spans.flatMap(s => s.evaluatorResults || []).map((evalResult) => (
                      <div
                        key={evalResult.id}
                        className={`p-4 rounded-xl border font-mono text-xs space-y-3 transition-all duration-250 ease-out hover:shadow-[0_0_20px_rgba(255,255,255,0.04)] ${
                          evalResult.passed
                            ? 'bg-[#111218]/90 border-white/[0.08] hover:bg-white/[0.07] hover:border-white/35'
                            : 'bg-rose-950/20 border-rose-900/60 hover:bg-rose-950/35 hover:border-rose-700/80 hover:shadow-[0_0_20px_rgba(244,63,94,0.08)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                evalResult.passed
                                  ? 'bg-white/[0.06] text-neutral-200 border border-white/[0.12]'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {evalResult.passed ? 'PASSED' : 'DISCREPANCY FLAGGED'}
                            </span>
                            <span className="font-semibold text-white">{evalResult.name}</span>
                            <VerdictBadge verdict={evalResult.verdict} />
                          </div>
                          <span className="text-neutral-400">
                            Score: <strong className="text-white">{evalResult.score.toFixed(2)}</strong> (thresh: {evalResult.threshold})
                          </span>
                        </div>

                        <p className="text-neutral-300 leading-relaxed">
                          {evalResult.reason}
                        </p>

                        {evalResult.evidenceQuote && (
                          <div className="p-2.5 bg-black rounded border border-white/[0.06] text-neutral-400">
                            <span className="text-neutral-500 block text-[10px] uppercase">Evidence Quote:</span>
                            <code className="text-neutral-200 text-xs">{evalResult.evidenceQuote}</code>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selected Span Detailed Inspector */}
            {currentSpan && (
              <div className="glass-morphism-v2 border-glow-subtle rounded-xl border border-white/[0.12] overflow-hidden relative">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                {/* Inspector Header */}
                <div className="bg-white/[0.04] px-6 py-3.5 border-b border-white/[0.12] flex items-center justify-between backdrop-blur-xl">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                      SPAN INSPECTOR
                    </span>
                    <span className="text-neutral-600">·</span>
                    <span className="text-xs font-semibold text-white font-mono">
                      {currentSpan.name}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400">
                    <span>ID: {currentSpan.id}</span>
                    <CopyChip
                      label="Copy"
                      title="Copy Span ID to clipboard"
                      copied={copiedSpanPayload === 'span-id'}
                      onCopy={(e) => handleCopySpanText(currentSpan.id, 'span-id', e)}
                    />
                  </div>
                </div>

                {/* Solid Scrolling Body */}
                <div className="p-6 space-y-6 font-mono text-xs">
                  {/* Grounding: the risk score and, beside it, what the NLI model concluded */}
                  {groundingResult?.verdict && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-neutral-400 uppercase tracking-wider text-[11px]">
                        Grounding
                      </span>
                      <span className={`font-semibold tabular-nums ${riskTextClasses(groundingResult.score)}`}>
                        Risk {groundingResult.score.toFixed(2)}
                      </span>
                      <VerdictBadge verdict={groundingResult.verdict} />
                    </div>
                  )}

                  {/* Prompt & Completion */}
                  {currentSpan.prompt && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                          Prompt Payload
                        </span>
                        <CopyChip
                          label="Copy Payload"
                          title="Copy prompt payload to clipboard"
                          copied={copiedSpanPayload === 'prompt'}
                          onCopy={(e) => handleCopySpanText(currentSpan.prompt!, 'prompt', e)}
                        />
                      </div>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-300 whitespace-pre-wrap leading-relaxed">
                        {currentSpan.prompt}
                      </div>
                    </div>
                  )}

                  {currentSpan.completion && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                          Model Completion / Reasoning
                        </span>
                        <CopyChip
                          label="Copy Payload"
                          title="Copy model completion to clipboard"
                          copied={copiedSpanPayload === 'completion'}
                          onCopy={(e) => handleCopySpanText(currentSpan.completion!, 'completion', e)}
                        />
                      </div>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-200 whitespace-pre-wrap leading-relaxed">
                        {currentSpan.completion}
                      </div>
                    </div>
                  )}

                  {/* Tool Invocations */}
                  {currentSpan.toolArgs && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                          Tool Invocations ({currentSpan.toolName})
                        </span>
                        <CopyChip
                          label="Copy Payload"
                          title="Copy tool arguments to clipboard"
                          copied={copiedSpanPayload === 'toolArgs'}
                          onCopy={(e) => handleCopySpanText(JSON.stringify(currentSpan.toolArgs, null, 2), 'toolArgs', e)}
                        />
                      </div>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-300 overflow-x-auto">
                        <pre>{JSON.stringify(currentSpan.toolArgs, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {currentSpan.toolOutput && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                          Tool Output Result
                        </span>
                        <CopyChip
                          label="Copy Payload"
                          title="Copy tool output result to clipboard"
                          copied={copiedSpanPayload === 'toolOutput'}
                          onCopy={(e) => handleCopySpanText(JSON.stringify(currentSpan.toolOutput, null, 2), 'toolOutput', e)}
                        />
                      </div>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-200 overflow-x-auto">
                        <pre>{JSON.stringify(currentSpan.toolOutput, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {/* Causal Evidence Triple */}
                  {currentSpan.evidence && (
                    <div className="p-4 rounded-xl bg-black border border-white/[0.08] space-y-3">
                      <span className="text-white font-semibold uppercase tracking-wider text-[11px] block">
                        Causal Grounding Evidence
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <span className="text-neutral-500 block text-[10px]">OBSERVED</span>
                          <span className="text-neutral-300 mt-1 block">{currentSpan.evidence.observed}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[10px]">MEASURED</span>
                          <span className="text-neutral-300 mt-1 block">{currentSpan.evidence.measured}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[10px]">EXPLAINED</span>
                          <span className="text-neutral-300 mt-1 block">{currentSpan.evidence.explained}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
