import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
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
  PlusCircle,
  Copy,
  Check,
  Bot,
  Download,
  FileSpreadsheet,
  Filter,
  X,
  Keyboard,
  CornerDownLeft
} from 'lucide-react';
import { Trace, Span, EvaluatorResult } from '../../types';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error' | 'warning'>('all');
  const [curatedSuccess, setCuratedSuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isDetailsFlash, setIsDetailsFlash] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const traceItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const detailsRef = useRef<HTMLDivElement>(null);

  const filteredTraces = traces.filter(t => {
    if (filterAgentId && t.agentId !== filterAgentId) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchQuery.trim() === '') return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      t.id.toLowerCase().includes(q) ||
      t.agentName.toLowerCase().includes(q) ||
      t.agentId.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q) ||
      t.inputPreview.toLowerCase().includes(q) ||
      (t.tags ?? []).some(tag => tag.toLowerCase().includes(q))
    );
  });

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterAgentId, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTraces.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedTraces = filteredTraces.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const currentTrace = selectedTrace || paginatedTraces[0] || filteredTraces[0] || traces[0];
  const currentSpan = selectedSpan || currentTrace?.spans[0];

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
        if (nextSlice[0].spans && nextSlice[0].spans.length > 0) {
          onSelectSpan(nextSlice[0].spans[0]);
        }
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
        if (prevSlice[0].spans && prevSlice[0].spans.length > 0) {
          onSelectSpan(prevSlice[0].spans[0]);
        }
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

  // Global Keyboard Shortcuts for Traces Investigation (J/K, N/P, Enter, 1-4, C, E, /, ?, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

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

      // Enter: Focus / Inspect details of selected trace
      if (e.key === 'Enter') {
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

      // E: Export CSV
      if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleDownloadCSV();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredTraces, currentTrace, currentSpan, selectedSpan, searchQuery, safePage, totalPages]);

  const handleDownloadCSV = () => {
    if (filteredTraces.length === 0) return;

    const headers = [
      'Trace ID',
      'Agent ID',
      'Agent Name',
      'Timestamp',
      'Status',
      'Duration (ms)',
      'Total Tokens',
      'Prompt Tokens',
      'Completion Tokens',
      'Span Count',
      'Input Preview',
      'Tags',
      'Evaluators Summary',
      'Spans Hierarchy'
    ];

    const escapeCSV = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return '""';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const rows = filteredTraces.map(t => {
      const evaluatorsSummary = t.evaluators
        ? t.evaluators.map(e => `${e.name}: ${e.score} (${e.status})`).join('; ')
        : '';
      const tagsSummary = t.tags ? t.tags.join('; ') : '';
      const spansSummary = t.spans
        ? t.spans.map(s => `${s.name} [${s.type}, ${s.durationMs}ms, ${s.status}]`).join(' -> ')
        : '';

      const promptTokens = t.spans?.reduce((acc, s) => acc + (s.tokens?.prompt || 0), 0) || 0;
      const completionTokens = t.spans?.reduce((acc, s) => acc + (s.tokens?.completion || 0), 0) || 0;

      return [
        escapeCSV(t.id),
        escapeCSV(t.agentId),
        escapeCSV(t.agentName),
        escapeCSV(t.timestamp),
        escapeCSV(t.status),
        escapeCSV(t.durationMs),
        escapeCSV(t.totalTokens),
        escapeCSV(promptTokens),
        escapeCSV(completionTokens),
        escapeCSV(t.spans?.length || 0),
        escapeCSV(t.inputPreview),
        escapeCSV(tagsSummary),
        escapeCSV(evaluatorsSummary),
        escapeCSV(spansSummary)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `agent-traces-export-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2000);
  };

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

          {/* View Perspective Switcher */}
          <div className="flex items-center space-x-1 bg-[#101116] border border-white/[0.08] p-1 rounded-lg">
            <button
              onClick={() => setViewPerspective('tree')}
              title="Tree View (Press 1)"
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                viewPerspective === 'tree' ? 'bg-white text-neutral-950 font-medium shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>Tree View</span>
              <kbd className={`text-[9px] px-1 rounded ${viewPerspective === 'tree' ? 'bg-black/10 text-neutral-800' : 'bg-white/[0.06] text-neutral-400'}`}>1</kbd>
            </button>
            <button
              onClick={() => setViewPerspective('timeline')}
              title="Timeline Lanes (Press 2)"
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                viewPerspective === 'timeline' ? 'bg-white text-neutral-950 font-medium shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>Timeline Lanes</span>
              <kbd className={`text-[9px] px-1 rounded ${viewPerspective === 'timeline' ? 'bg-black/10 text-neutral-800' : 'bg-white/[0.06] text-neutral-400'}`}>2</kbd>
            </button>
            <button
              onClick={() => setViewPerspective('flame')}
              title="Flame Graph (Press 3)"
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                viewPerspective === 'flame' ? 'bg-white text-neutral-950 font-medium shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>Flame Graph</span>
              <kbd className={`text-[9px] px-1 rounded ${viewPerspective === 'flame' ? 'bg-black/10 text-neutral-800' : 'bg-white/[0.06] text-neutral-400'}`}>3</kbd>
            </button>
            <button
              onClick={() => setViewPerspective('evidence')}
              title="Evaluators & Evidence (Press 4)"
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                viewPerspective === 'evidence' ? 'bg-white text-neutral-950 font-medium shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>Evaluators & Evidence</span>
              <kbd className={`text-[9px] px-1 rounded ${viewPerspective === 'evidence' ? 'bg-black/10 text-neutral-800' : 'bg-white/[0.06] text-neutral-400'}`}>4</kbd>
            </button>
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
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px]">J</kbd>
            <span className="text-neutral-500">/</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px]">K</kbd>
            <span className="text-neutral-300 ml-1">next/prev trace</span>
          </span>
          <span className="flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px] flex items-center space-x-0.5">
              <CornerDownLeft className="w-2.5 h-2.5" />
              <span>Enter</span>
            </kbd>
            <span className="text-neutral-300 ml-1">inspect details</span>
          </span>
          <span className="hidden sm:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px]">1</kbd>
            <span className="text-neutral-500">-</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px]">4</kbd>
            <span className="text-neutral-300 ml-1">perspectives</span>
          </span>
          <span className="hidden md:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px]">C</kbd>
            <span className="text-neutral-300 ml-1">curate</span>
          </span>
          <span className="hidden lg:flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white font-bold text-[10px]">/</kbd>
            <span className="text-neutral-300 ml-1">search</span>
          </span>
        </div>

        {onOpenShortcutsModal && (
          <button
            onClick={onOpenShortcutsModal}
            className="text-neutral-400 hover:text-white flex items-center space-x-1.5 ml-auto transition-colors group"
          >
            <span className="group-hover:underline decoration-white/30">All shortcuts</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-neutral-300 text-[10px] font-bold">?</kbd>
          </button>
        )}
      </div>

      {/* Dedicated Text-Based Filter Bar */}
      <div className="glass-morphism-v2 rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-white/[0.12]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter traces by Trace ID, Agent Name, Status (Press '/' to focus)..."
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

        {/* Status Filter Chips & Result Counter */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center space-x-1 bg-[#08090b] border border-[#191b22] p-1 rounded-lg">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
              }`}
            >
              All ({traces.length})
            </button>
            <button
              onClick={() => setStatusFilter('success')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                statusFilter === 'success'
                  ? 'bg-neutral-200 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
              <span>Success</span>
            </button>
            <button
              onClick={() => setStatusFilter('warning')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                statusFilter === 'warning'
                  ? 'bg-amber-400 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-amber-400/90 hover:bg-white/[0.04]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Warning</span>
            </button>
            <button
              onClick={() => setStatusFilter('error')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors flex items-center space-x-1.5 ${
                statusFilter === 'error'
                  ? 'bg-rose-500 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-rose-400 hover:bg-white/[0.04]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Error</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-neutral-400 px-2 py-1 bg-[#08090b] border border-[#191b22] rounded-lg">
            <span className="text-neutral-200 font-semibold">{filteredTraces.length}</span> of {traces.length} traces
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Trace List (Left) + Selected Trace Investigation View (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Trace List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search traces by ID, tag, or input..."
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

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
            {paginatedTraces.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-white/10 rounded-xl font-mono text-xs text-neutral-500">
                No matching traces found on this page.
              </div>
            ) : (
              paginatedTraces.map((trace) => {
                const isSelected = currentTrace?.id === trace.id;

                return (
                  <div
                    key={trace.id}
                    ref={(el) => {
                      if (el) {
                        traceItemRefs.current.set(trace.id, el);
                      } else {
                        traceItemRefs.current.delete(trace.id);
                      }
                    }}
                    onClick={() => {
                      onSelectTrace(trace);
                      if (trace.spans.length > 0) {
                        onSelectSpan(trace.spans[0]);
                      }
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-250 ease-out relative overflow-hidden ${
                      isSelected
                        ? 'glass-morphism-v2 border-glow-subtle border-white/40 shadow-md ring-1 ring-white/10 text-white'
                        : 'ios-liquid-row border-white/[0.08] text-neutral-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                    )}
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="font-bold text-white flex items-center space-x-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            trace.status === 'error'
                              ? 'bg-rose-400 animate-pulse'
                              : trace.status === 'warning'
                              ? 'bg-amber-400'
                              : 'bg-neutral-300'
                          }`}
                        />
                        <span>{trace.id}</span>
                      </span>
                      <div className="flex items-center space-x-1.5">
                        {isSelected && (
                          <span className="text-[9px] text-white/90 bg-white/10 px-1.5 py-0.5 rounded border border-white/20 font-bold flex items-center space-x-0.5">
                            <CornerDownLeft className="w-2.5 h-2.5" />
                            <span>Active</span>
                          </span>
                        )}
                        <span className="text-neutral-500">{trace.timestamp.split(' ')[1]}</span>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-300 line-clamp-2 font-mono my-1.5">
                      {trace.inputPreview}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.06]">
                      <span className="truncate max-w-[120px] text-neutral-300">{trace.agentName.split(' ')[0]}</span>
                      <span>{trace.durationMs}ms</span>
                      <span>{trace.totalTokens}t</span>
                    </div>
                  </div>
                );
              })
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
            className={`lg:col-span-8 space-y-6 transition-all duration-300 rounded-2xl ${
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
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    SELECTED TRACE · {currentTrace.sessionId}
                  </div>
                  <h3 className="text-sm font-semibold text-white font-mono mt-0.5">
                    {currentTrace.id} &nbsp;·&nbsp; {currentTrace.agentName}
                  </h3>
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
                  <span className="text-white font-semibold mt-0.5 block">{currentTrace.totalTokens != null ? currentTrace.totalTokens.toLocaleString() : String.fromCharCode(8212)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">ESTIMATED COST</span>
                  <span className="text-white font-semibold mt-0.5 block">{currentTrace.cost != null ? `$${currentTrace.cost.toFixed(4)}` : String.fromCharCode(8212)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">GROUNDING SCORE</span>
                  <span
                    className={`font-semibold mt-0.5 block ${
                      (currentTrace.groundingScore || 0) < 0.7 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {currentTrace.groundingScore ? `${(currentTrace.groundingScore * 100).toFixed(0)}%` : 'N/A'}
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
              <div className="glass-morphism-v2 border-glow-subtle rounded-xl border border-white/[0.12] p-4 space-y-2 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider pb-2 border-b border-white/[0.08]">
                  Execution Tree Spans ({currentTrace.spans.length})
                </div>

                <div className="space-y-1.5 pt-2">
                  {currentTrace.spans.map((span) => {
                    const isSelected = currentSpan?.id === span.id;
                    const isChild = !!span.parentSpanId;

                    return (
                      <div
                        key={span.id}
                        onClick={() => onSelectSpan(span)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-250 ease-out group ${
                          isChild ? 'ml-6' : ''
                        } ${
                          isSelected
                            ? 'bg-[#1a1b24] border-white/50 text-white font-medium shadow-sm ring-1 ring-white/15'
                            : 'bg-[#111218]/90 border-white/[0.07] text-neutral-300 hover:bg-white/[0.07] hover:border-white/35 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`w-2 h-2 rounded-full transition-transform duration-250 group-hover:scale-125 ${
                                span.status === 'error'
                                  ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
                                  : span.status === 'warning'
                                  ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                                  : 'bg-neutral-300'
                              }`}
                            />
                            <span className="font-semibold transition-colors duration-250">{span.name}</span>
                            <span className="text-[10px] text-neutral-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/[0.08] uppercase group-hover:border-white/25 group-hover:text-neutral-200 transition-all duration-250">
                              {span.type}
                            </span>
                          </div>

                          <div className="flex items-center space-x-4 text-neutral-400 group-hover:text-neutral-200 transition-colors duration-250">
                            <span>{span.durationMs}ms</span>
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
                            +{span.startOffsetMs}ms ({span.durationMs}ms)
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
                    const pct = Math.round((span.durationMs / currentTrace.durationMs) * 100);

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
                          <span>{span.durationMs}ms ({pct}%)</span>
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
                  <span className="text-xs font-mono text-neutral-400">
                    ID: {currentSpan.id}
                  </span>
                </div>

                {/* Solid Scrolling Body */}
                <div className="p-6 space-y-6 font-mono text-xs">
                  {/* Prompt & Completion */}
                  {currentSpan.prompt && (
                    <div className="space-y-2">
                      <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                        Prompt Payload
                      </span>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-300 whitespace-pre-wrap leading-relaxed">
                        {currentSpan.prompt}
                      </div>
                    </div>
                  )}

                  {currentSpan.completion && (
                    <div className="space-y-2">
                      <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                        Model Completion / Reasoning
                      </span>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-200 whitespace-pre-wrap leading-relaxed">
                        {currentSpan.completion}
                      </div>
                    </div>
                  )}

                  {/* Tool Invocations */}
                  {currentSpan.toolArgs && (
                    <div className="space-y-2">
                      <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                        Tool Invocations ({currentSpan.toolName})
                      </span>
                      <div className="p-3 bg-black rounded-lg border border-white/[0.06] text-neutral-300 overflow-x-auto">
                        <pre>{JSON.stringify(currentSpan.toolArgs, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {currentSpan.toolOutput && (
                    <div className="space-y-2">
                      <span className="text-neutral-400 uppercase tracking-wider text-[11px] block">
                        Tool Output Result
                      </span>
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
