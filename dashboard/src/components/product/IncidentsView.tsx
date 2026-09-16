import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AlertTriangle, ShieldAlert, ArrowRight, ArrowUpDown, Bot, Activity, CheckCircle2, ChevronRight, ChevronDown, Wrench, RefreshCw, Check, Sparkles } from 'lucide-react';
import { animate, createTimeline, stagger } from 'animejs';
import { Incident, Agent, Trace, ChronologicalSortOrder } from '../../types';
import { parseDateTimeToMs } from '../../utils/dateUtils';

interface IncidentsViewProps {
  incidents: Incident[];
  selectedIncident?: Incident;
  onSelectIncident: (incident: Incident) => void;
  onNavigateToTrace: (traceId: string) => void;
  onNavigateToAgent: (agentId: string) => void;
  onResolveIncident: (incidentId: string) => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onNavigateToTrace,
  onNavigateToAgent,
  onResolveIncident
}) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<ChronologicalSortOrder>('reverse-chronological');
  const listContainerRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const sortedIncidents = useMemo(() => {
    const list = incidents.filter(i => !resolvedIds.has(i.id));
    return list.slice().sort((a, b) => {
      const timeA = parseDateTimeToMs(a.detectedAt);
      const timeB = parseDateTimeToMs(b.detectedAt);
      if (timeA !== timeB) {
        return sortOrder === 'chronological' ? timeA - timeB : timeB - timeA;
      }
      return sortOrder === 'chronological' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });
  }, [incidents, resolvedIds, sortOrder]);

  const currentIncident =
    (selectedIncident && !resolvedIds.has(selectedIncident.id) ? selectedIncident : undefined) ||
    sortedIncidents[0] ||
    incidents[0];

  // Global keyboard shortcut: Cmd+Shift+R / Ctrl+Shift+R to mark currently selected incident as resolved
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInputActive) return;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (currentIncident && !resolvingId && !resolvedIds.has(currentIncident.id)) {
          handleResolve(currentIncident.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIncident?.id, resolvingId, resolvedIds]);

  // Initial and update stagger animation using anime.js
  useEffect(() => {
    if (listContainerRef.current) {
      const cards = listContainerRef.current.querySelectorAll('.anime-incident-card');
      if (cards.length > 0) {
        animate(cards, {
          opacity: [0, 1],
          translateY: [16, 0],
          scale: [0.98, 1],
          delay: stagger(50, { start: 40 }),
          duration: 400,
          ease: 'outCubic'
        });
      }
    }
  }, [sortOrder]);

  // Detail panel entrance animation with anime.js
  useEffect(() => {
    if (detailPanelRef.current && currentIncident) {
      const spineSteps = detailPanelRef.current.querySelectorAll('.anime-spine-step');
      const tl = createTimeline();
      tl.add(detailPanelRef.current, {
        opacity: [0.4, 1],
        translateY: [8, 0],
        duration: 280,
        ease: 'outQuad'
      })
      .add(spineSteps, {
        opacity: [0, 1],
        translateX: [-12, 0],
        delay: stagger(50),
        duration: 320,
        ease: 'outCubic'
      }, '-=140');
    }
  }, [currentIncident?.id]);

  // Handle resolution with anime.js collapse & slide-up animation
  const handleResolve = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (resolvingId || resolvedIds.has(id)) return;

    setResolvingId(id);
    const targetCard = cardRefs.current.get(id);

    if (targetCard) {
      // Find following sibling elements to slide up smoothly
      const allCards = Array.from(listContainerRef.current?.querySelectorAll('.anime-incident-card') || []);
      const targetIndex = allCards.indexOf(targetCard);
      const followingCards = allCards.slice(targetIndex + 1);

      const tl = createTimeline({
        onComplete: () => {
          setResolvedIds(prev => new Set(prev).add(id));
          setResolvingId(null);
          onResolveIncident(id);
        }
      });

      // 1. Success flash & scale down target card
      tl.add(targetCard, {
        scale: [1, 0.96],
        backgroundColor: ['rgba(244, 63, 94, 0.1)', 'rgba(16, 185, 129, 0.25)'],
        borderColor: ['rgba(255, 255, 255, 0.1)', 'rgba(16, 185, 129, 0.6)'],
        duration: 220,
        ease: 'outQuad'
      })
      // 2. Collapse target card height, margin, padding & fade to 0
      .add(targetCard, {
        opacity: [1, 0],
        maxHeight: [targetCard.scrollHeight, 0],
        paddingTop: [16, 0],
        paddingBottom: [16, 0],
        marginTop: [0, 0],
        marginBottom: [12, 0],
        duration: 360,
        ease: 'inOutCubic'
      }, '-=60')
      // 3. Stagger slide-up of all subsequent cards using anime.js
      .add(followingCards, {
        translateY: [0, 0],
        duration: 360,
        ease: 'outQuart'
      }, '-=360');
    } else {
      // Fallback
      onResolveIncident(id);
      setResolvingId(null);
    }
  };

  const activeIncidents = incidents.filter(i => !resolvedIds.has(i.id));

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span>Failure-First Incident Investigation</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Honeycomb model: Problem → Context → Agent → Trace → Root Cause Analysis
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sort by Dropdown */}
          <div className="flex items-center space-x-2 bg-[#0c0d12] border border-white/[0.10] px-3 py-1.5 rounded-xl shadow-sm hover:border-white/20 transition-colors">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <label htmlFor="incidents-sort-by-select" className="text-[11px] font-mono text-neutral-400 whitespace-nowrap">
              Sort by:
            </label>
            <div className="relative flex items-center">
              <select
                id="incidents-sort-by-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as ChronologicalSortOrder)}
                className="bg-transparent text-xs font-mono text-neutral-200 focus:outline-none cursor-pointer pr-5 py-0.5 appearance-none"
                aria-label="Sort incidents chronologically"
              >
                <option value="reverse-chronological" className="bg-[#0b0d13] text-white">
                  Reverse-chronological (Newest first)
                </option>
                <option value="chronological" className="bg-[#0b0d13] text-white">
                  Chronological (Oldest first)
                </option>
              </select>
              <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-0 pointer-events-none" />
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                sortedIncidents.length > 0 ? 'bg-rose-400 phosphor-rose animate-pulse' : 'bg-emerald-400 phosphor-emerald'
              }`}
            />
            <span>{sortedIncidents.length} Active Incidents</span>
          </span>
        </div>
      </div>

      {/* Grid: Incident Roster (Left) + Honeycomb Investigation Spine (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Incidents List animated via Anime.js */}
        <div ref={listContainerRef} className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs font-mono">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Incident Roster</span>
            <button
              onClick={() => setSortOrder(prev => prev === 'reverse-chronological' ? 'chronological' : 'reverse-chronological')}
              title={`Sort order: ${sortOrder}. Click to toggle.`}
              className="text-[11px] text-neutral-400 hover:text-neutral-200 flex items-center space-x-1 px-2 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors tactile-press"
            >
              <ArrowUpDown className="w-3 h-3 text-neutral-400" />
              <span>{sortOrder === 'reverse-chronological' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>

          {sortedIncidents.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#0e0f14]/80 border border-white/[0.08] space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto phosphor-emerald">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white font-mono">All Incidents Resolved</h4>
                <p className="text-xs text-neutral-400 font-mono mt-1">
                  System operates within healthy baseline telemetry parameters.
                </p>
              </div>
            </div>
          ) : (
            sortedIncidents.map((incident) => {
              const isSelected = currentIncident?.id === incident.id;
              const isResolving = resolvingId === incident.id;

              return (
                <div
                  key={incident.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(incident.id, el);
                    else cardRefs.current.delete(incident.id);
                  }}
                  onClick={() => onSelectIncident(incident)}
                  className={`anime-incident-card p-4 rounded-xl cursor-pointer space-y-2 relative overflow-hidden group select-none transition-all duration-200 tactile-press ${
                    isSelected
                      ? 'ios-liquid-card border-glow-subtle border-white/40 shadow-[0_0_30px_rgba(255,255,255,0.08)]'
                      : 'ios-liquid-row text-neutral-300 hover:border-white/20'
                  }`}
                  style={{
                    willChange: 'transform, opacity, height, max-height'
                  }}
                >
                  {isSelected && (
                    <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
                  )}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 ${
                          incident.severity === 'critical'
                            ? 'bg-rose-500/15 text-rose-300/90 border border-rose-500/25'
                            : 'bg-amber-500/15 text-amber-300/90 border border-amber-500/25'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            incident.severity === 'critical' ? 'bg-rose-400 phosphor-rose' : 'bg-amber-400 phosphor-amber'
                          }`}
                        />
                        <span>{incident.severity.toUpperCase()}</span>
                      </span>
                      <span className="text-neutral-500 text-[10px]">{incident.id}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-neutral-400 text-[11px]">{incident.detectedAt}</span>
                      <button
                        onClick={(e) => handleResolve(incident.id, e)}
                        disabled={isResolving}
                        title="Resolve incident (⌘⇧R / Ctrl+Shift+R)"
                        className="p-1.5 rounded-md bg-white/[0.04] hover:bg-emerald-500/20 text-neutral-400 hover:text-emerald-300 border border-white/[0.08] hover:border-emerald-500/30 transition-all opacity-70 group-hover:opacity-100 tactile-press"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-bold text-white font-mono group-hover:text-neutral-100 transition-colors">
                    {incident.title}
                  </div>

                  <p className="text-[11px] text-neutral-300 line-clamp-2 leading-relaxed">
                    {incident.summary}
                  </p>

                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/[0.06]">
                    <span className="text-neutral-200">{incident.agentName.split(' ')[0]}</span>
                    <span className="text-rose-400/90 font-medium">{incident.affectedRunsCount} affected runs</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Honeycomb Investigation Spine */}
        <div className="lg:col-span-7">
          {currentIncident && sortedIncidents.length > 0 ? (
            <div
              ref={detailPanelRef}
              className="ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden relative"
            >
              <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/[0.12] flex items-center justify-between bg-white/[0.04] backdrop-blur-xl">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block font-medium">
                    INCIDENT DIAGNOSIS · {currentIncident.id}
                  </span>
                  <h3 className="text-sm font-bold text-white font-mono mt-0.5">
                    {currentIncident.title}
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => handleResolve(currentIncident.id, e)}
                    disabled={resolvingId === currentIncident.id}
                    title="Mark selected incident as resolved (⌘⇧R / Ctrl+Shift+R)"
                    className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-mono font-semibold flex items-center space-x-1.5 transition-all shadow-sm tactile-press"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 phosphor-emerald" />
                    <span>Mark Resolved</span>
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/10 text-neutral-900 border border-black/20 ml-1 font-semibold keycap-bevel">
                      ⌘⇧R
                    </kbd>
                  </button>
                </div>
              </div>

              {/* Investigation Body */}
              <div className="p-6 space-y-6 font-mono text-xs">
                {/* Spine Step 1: Problem */}
                <div className="anime-spine-step space-y-1.5 border-l-2 border-rose-500/80 pl-4">
                  <div className="text-[10px] uppercase text-neutral-400 font-medium">1. Problem Summary</div>
                  <div className="text-sm font-semibold text-white">{currentIncident.title}</div>
                  <p className="text-neutral-300 leading-relaxed">{currentIncident.summary}</p>
                </div>

                {/* Spine Step 2: Context & Associated Agent */}
                <div className="anime-spine-step space-y-1.5 border-l-2 border-white/20 pl-4">
                  <div className="text-[10px] uppercase text-neutral-400 font-medium">2. Originating Agent &amp; Swarm Context</div>
                  <div className="flex items-center justify-between bg-white/[0.03] p-3.5 rounded-xl border border-white/[0.08]">
                    <div>
                      <span className="text-white font-semibold block">{currentIncident.agentName}</span>
                      <span className="text-neutral-400 text-[11px]">ID: {currentIncident.agentId}</span>
                    </div>
                    <button
                      onClick={() => onNavigateToAgent(currentIncident.agentId)}
                      className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.12] text-neutral-200 text-xs flex items-center space-x-1 border border-white/[0.08] hover:border-white/20 transition-colors"
                    >
                      <span>Inspect Agent</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Spine Step 3: Originating Trace */}
                <div className="anime-spine-step space-y-1.5 border-l-2 border-amber-500/80 pl-4">
                  <div className="text-[10px] uppercase text-neutral-400 font-medium">3. Failing Execution Trace</div>
                  <div className="flex items-center justify-between bg-white/[0.03] p-3.5 rounded-xl border border-white/[0.08]">
                    <div>
                      <span className="text-white font-semibold block">Trace {currentIncident.traceId}</span>
                      <span className="text-neutral-400 text-[11px]">Flagged Span: {currentIncident.spanId || 'Root'}</span>
                    </div>
                    <button
                      onClick={() => onNavigateToTrace(currentIncident.traceId)}
                      className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.12] text-neutral-200 text-xs flex items-center space-x-1 border border-white/[0.08] hover:border-white/20 transition-colors"
                    >
                      <span>Jump to Trace Waterfall</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Spine Step 4: Root Cause */}
                <div className="anime-spine-step space-y-1.5 border-l-2 border-rose-500/80 pl-4">
                  <div className="text-[10px] uppercase text-neutral-400 font-medium">4. Root Cause Discrepancy</div>
                  <div className="p-3.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-200/95 leading-relaxed">
                    {currentIncident.rootCause}
                  </div>
                </div>

                {/* Spine Step 5: Suggested Action & Remediation */}
                <div className="anime-spine-step p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="text-[10px] uppercase text-neutral-400 font-semibold flex items-center space-x-1.5">
                    <Wrench className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Recommended Remedial Action</span>
                  </div>
                  <p className="text-neutral-300 leading-relaxed">
                    {currentIncident.suggestedAction}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="ios-liquid-card rounded-2xl p-12 text-center border border-dashed border-white/10">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-white font-mono">No Active Incident Selected</div>
              <p className="text-xs text-neutral-400 font-mono mt-1">
                All identified failure points have been addressed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

