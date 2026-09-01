import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Bot,
  Activity,
  AlertTriangle,
  TrendingDown,
  Play,
  FlaskConical,
  Database,
  Cpu,
  Settings,
  ArrowRight,
  Sparkles,
  Command,
  CornerDownLeft,
  X,
  Layers,
  Flame,
  CheckCircle2,
  FileCode,
  Radio
} from 'lucide-react';
import { ProductTab, Agent, Trace, Incident } from '../../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: ProductTab) => void;
  onSelectAgent: (agent: Agent) => void;
  onSelectTrace: (trace: Trace) => void;
  onSelectIncident: (incident: Incident) => void;
  agents: Agent[];
  traces: Trace[];
  incidents: Incident[];
  onSwitchToPublic: () => void;
}

type FilterCategory = 'all' | 'agents' | 'traces' | 'incidents' | 'drift' | 'experiments' | 'settings';

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onSelectAgent,
  onSelectTrace,
  onSelectIncident,
  agents,
  traces,
  incidents,
  onSwitchToPublic
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
      setSelectedIndex(0);
      setCategory('all');
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Build structured, rich item library
  const allItems = useMemo(() => {
    const list: Array<{
      id: string;
      category: FilterCategory;
      typeLabel: string;
      title: string;
      subtitle: string;
      badge?: string;
      statusSemantic?: 'neutral' | 'amber' | 'rose';
      icon: any;
      action: () => void;
      shortcutHint?: string;
    }> = [];

    // Incidents (Priority)
    incidents.forEach((inc) => {
      list.push({
        id: `inc-${inc.id}`,
        category: 'incidents',
        typeLabel: 'Incident',
        title: inc.title,
        subtitle: `Agent: ${inc.agentName} · Detected ${inc.detectedAt}`,
        badge: inc.severity.toUpperCase(),
        statusSemantic: inc.severity === 'critical' ? 'rose' : inc.severity === 'warning' ? 'amber' : 'neutral',
        icon: AlertTriangle,
        action: () => {
          onSelectIncident(inc);
          onSelectTab('incidents');
        },
        shortcutHint: '↵ Investigate'
      });
    });

    // Agents
    agents.forEach((agent) => {
      list.push({
        id: `agent-${agent.id}`,
        category: 'agents',
        typeLabel: 'Agent',
        title: agent.name,
        subtitle: `${agent.framework} · ${agent.model} · ${agent.latencyAvgMs}ms avg · ${agent.successRate}% OK`,
        badge: agent.driftStatus === 'drift' ? 'DRIFT' : agent.driftStatus === 'deviation' ? 'DEVIATION' : agent.status.toUpperCase(),
        statusSemantic:
          agent.status === 'critical' || agent.driftStatus === 'drift'
            ? 'rose'
            : agent.status === 'warning' || agent.driftStatus === 'deviation'
            ? 'amber'
            : 'neutral',
        icon: Bot,
        action: () => {
          onSelectAgent(agent);
          onSelectTab('agents');
        },
        shortcutHint: '↵ Open Roster'
      });
    });

    // Traces
    traces.slice(0, 16).forEach((trace) => {
      list.push({
        id: `trace-${trace.id}`,
        category: 'traces',
        typeLabel: 'Trace',
        title: `Trace ${trace.id}: ${trace.inputPreview.slice(0, 48)}...`,
        subtitle: `${trace.agentName} · ${trace.durationMs}ms · ${trace.totalTokens} tokens`,
        badge: trace.status.toUpperCase(),
        statusSemantic: trace.status === 'error' ? 'rose' : trace.status === 'warning' ? 'amber' : 'neutral',
        icon: Activity,
        action: () => {
          onSelectTrace(trace);
          onSelectTab('traces');
        },
        shortcutHint: '↵ Waterfall'
      });
    });

    // Navigation and Core Surfaces
    const navSurfaces: Array<{
      tab: ProductTab;
      title: string;
      sub: string;
      cat: FilterCategory;
      icon: any;
    }> = [
      { tab: 'overview', title: 'System Overview & Percentiles', sub: 'P50/P99 latency, cost burn & fleet health', cat: 'all', icon: Activity },
      { tab: 'agents', title: 'Autonomous Agent Roster', sub: 'Swarm runtime, framework specs & tool bindings', cat: 'agents', icon: Bot },
      { tab: 'traces', title: 'Trace Investigation & Tree', sub: 'LangSmith / Weave waterfall execution trees', cat: 'traces', icon: Activity },
      { tab: 'incidents', title: 'Incident Root Cause Analysis', sub: 'Causal chain & failure discrepancies', cat: 'incidents', icon: AlertTriangle },
      { tab: 'drift', title: '3D Trajectory & Cluster Drift', sub: 'Embedding space divergence vs golden baseline', cat: 'drift', icon: TrendingDown },
      { tab: 'experiments', title: 'Model Experiments & Eval Matrix', sub: 'Braintrust / Langfuse benchmark comparisons', cat: 'experiments', icon: FlaskConical },
      { tab: 'datasets', title: 'Curated Golden Datasets', sub: 'Regression test cases curated from production spans', cat: 'experiments', icon: Database },
      { tab: 'replay', title: 'Deterministic Time-Travel Replay', sub: 'Step-by-step state & token debugger', cat: 'traces', icon: Play },
      { tab: 'telemetry-lab', title: 'Synthetic Telemetry Stress Lab', sub: 'Inject anomalies & test automated evaluators', cat: 'all', icon: Cpu },
      { tab: 'settings', title: 'SDK Keys & Retention Rules', sub: 'OpenTelemetry exporters & security parameters', cat: 'settings', icon: Settings }
    ];

    navSurfaces.forEach((ns) => {
      list.push({
        id: `nav-${ns.tab}`,
        category: ns.cat,
        typeLabel: 'Surface',
        title: ns.title,
        subtitle: ns.sub,
        statusSemantic: 'neutral',
        icon: ns.icon,
        action: () => onSelectTab(ns.tab),
        shortcutHint: '↵ Navigate'
      });
    });

    // Editorial Public Switch
    list.push({
      id: 'nav-public',
      category: 'all',
      typeLabel: 'Mode',
      title: 'Switch to Public Editorial Landing',
      subtitle: '3D interactive hero, live stream story, and research baseline',
      statusSemantic: 'neutral',
      icon: Sparkles,
      action: onSwitchToPublic,
      shortcutHint: '↵ Switch Mode'
    });

    return list;
  }, [agents, traces, incidents, onSelectAgent, onSelectTrace, onSelectIncident, onSelectTab, onSwitchToPublic]);

  // Query and Category Filter
  const filteredItems = useMemo(() => {
    let result = allItems;

    if (category !== 'all') {
      result = result.filter((item) => item.category === category || item.category === 'all');
    }

    const q = query.trim().toLowerCase();
    if (q) {
      // Check prefix filters
      let cleanQ = q;
      if (q.startsWith('agent:') || q.startsWith('agents:')) {
        cleanQ = q.replace(/^agents?:/, '').trim();
        result = result.filter((item) => item.category === 'agents' || item.typeLabel === 'Agent');
      } else if (q.startsWith('trace:') || q.startsWith('traces:')) {
        cleanQ = q.replace(/^traces?:/, '').trim();
        result = result.filter((item) => item.category === 'traces' || item.typeLabel === 'Trace');
      } else if (q.startsWith('incident:') || q.startsWith('inc:')) {
        cleanQ = q.replace(/^(incident|inc):/, '').trim();
        result = result.filter((item) => item.category === 'incidents' || item.typeLabel === 'Incident');
      } else if (q.startsWith('drift:')) {
        cleanQ = q.replace(/^drift:/, '').trim();
        result = result.filter((item) => item.category === 'drift');
      }

      if (cleanQ) {
        result = result.filter(
          (item) =>
            item.title.toLowerCase().includes(cleanQ) ||
            item.subtitle.toLowerCase().includes(cleanQ) ||
            item.typeLabel.toLowerCase().includes(cleanQ) ||
            (item.badge && item.badge.toLowerCase().includes(cleanQ))
        );
      }
    }

    return result;
  }, [allItems, category, query]);

  // Adjust selection bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, category]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Cycle category
      const categories: FilterCategory[] = ['all', 'agents', 'traces', 'incidents', 'drift', 'experiments', 'settings'];
      const nextIdx = (categories.indexOf(category) + 1) % categories.length;
      setCategory(categories[nextIdx]);
    }
  };

  const categoriesList: Array<{ id: FilterCategory; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'agents', label: 'Agents' },
    { id: 'traces', label: 'Traces' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'drift', label: 'Drift' },
    { id: 'experiments', label: 'Experiments' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4">
          {/* Backdrop with subtle monochrome blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Apple-Inspired Liquid Glass Command Surface */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-2xl ios-liquid-card border-glow-subtle rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[82vh]"
          >
            {/* Top Liquid Specular Reflection */}
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

            {/* Top Search Bar Toolbar */}
            <div className="flex items-center px-4 py-3.5 border-b border-white/[0.12] bg-white/[0.03] backdrop-blur-xl">
              <Search className="w-4 h-4 text-neutral-400 mr-3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type command, agent name, trace ID, incident, or drift..."
                className="w-full bg-transparent text-sm text-[#F5F5F7] placeholder-neutral-500 focus:outline-none font-mono tracking-tight"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-neutral-500 hover:text-white p-1 mr-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="text-[10px] font-mono text-neutral-400 bg-white/[0.05] border border-white/[0.1] px-1.5 py-0.5 rounded ml-2 shrink-0">
                ESC
              </kbd>
            </div>

            {/* Quick Filter Category Chips (Raycast Philosophy: Minimum Movement) */}
            <div className="flex items-center space-x-1 px-4 py-2 border-b border-white/[0.06] bg-[#0c0d11] overflow-x-auto scrollbar-none text-[11px] font-mono">
              <span className="text-neutral-500 mr-1 text-[10px] uppercase tracking-wider shrink-0">Filter:</span>
              {categoriesList.map((cat) => {
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors shrink-0 ${
                      active
                        ? 'bg-white text-neutral-950 font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Search Results List */}
            <div className="overflow-y-auto p-2 space-y-1 flex-1 max-h-[380px] scrollbar-thin">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-neutral-500">
                  <p>No matching agents, traces, incidents, or commands found.</p>
                  <p className="text-[11px] text-neutral-600 mt-1.5">
                    Try searching by agent name, trace prefix (e.g. &ldquo;tr-&rdquo;), or press Tab to switch categories.
                  </p>
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;

                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      onClick={() => {
                        item.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#F5F5F7] text-neutral-950 shadow-sm'
                          : 'text-neutral-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div
                          className={`p-1.5 rounded-lg shrink-0 ${
                            isSelected
                              ? 'bg-neutral-200 text-neutral-950'
                              : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`text-xs font-mono font-semibold truncate ${isSelected ? 'text-neutral-950' : 'text-white'}`}>
                              {item.title}
                            </span>
                            {item.badge && (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase shrink-0 font-medium ${
                                  isSelected
                                    ? 'bg-neutral-950 text-white border-neutral-800'
                                    : item.statusSemantic === 'rose'
                                    ? 'bg-rose-950/40 text-rose-300 border-rose-800/80'
                                    : item.statusSemantic === 'amber'
                                    ? 'bg-amber-950/40 text-amber-300 border-amber-800/80'
                                    : 'bg-white/[0.04] text-neutral-400 border-white/[0.08]'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-[11px] truncate font-mono mt-0.5 ${
                              isSelected ? 'text-neutral-600' : 'text-neutral-400'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      {/* Right Action Hint */}
                      <div className="flex items-center space-x-2 shrink-0 ml-3">
                        <span
                          className={`text-[10px] font-mono ${
                            isSelected ? 'text-neutral-600' : 'text-neutral-500'
                          }`}
                        >
                          {item.shortcutHint}
                        </span>
                        <CornerDownLeft
                          className={`w-3.5 h-3.5 ${
                            isSelected ? 'text-neutral-950 opacity-100' : 'opacity-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Keyboard Navigation Bar (Speed & Commandability) */}
            <div className="px-4 py-2.5 border-t border-white/[0.08] bg-[#0a0b0e] text-[11px] font-mono text-neutral-400 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1">
                  <kbd className="bg-white/[0.06] border border-white/[0.1] px-1 py-0.5 rounded text-[9px] text-neutral-300">↑</kbd>
                  <kbd className="bg-white/[0.06] border border-white/[0.1] px-1 py-0.5 rounded text-[9px] text-neutral-300">↓</kbd>
                  <span className="text-neutral-500 ml-1">navigate</span>
                </span>
                <span className="flex items-center space-x-1">
                  <kbd className="bg-white/[0.06] border border-white/[0.1] px-1.5 py-0.5 rounded text-[9px] text-neutral-300">↵</kbd>
                  <span className="text-neutral-500 ml-1">execute</span>
                </span>
                <span className="flex items-center space-x-1">
                  <kbd className="bg-white/[0.06] border border-white/[0.1] px-1.5 py-0.5 rounded text-[9px] text-neutral-300">Tab</kbd>
                  <span className="text-neutral-500 ml-1">cycle category</span>
                </span>
              </div>
              <div className="text-[10px] text-neutral-500 font-mono">
                {filteredItems.length} available {filteredItems.length === 1 ? 'action' : 'actions'}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
