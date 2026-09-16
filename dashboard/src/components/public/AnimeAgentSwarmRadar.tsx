import React, { useEffect, useRef, useState } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import { Activity, ShieldCheck, AlertTriangle, Zap, Server, Database, Cpu, Eraser } from 'lucide-react';
import { AnimeInteractiveCounter } from './AnimeInteractiveCounter';

interface AnimeAgentSwarmRadarProps {
  palette: 'butter' | 'dark' | 'chalk';
  onInspectTraces?: () => void;
}

interface TelemetryEvent {
  id: string;
  source: string;
  action: string;
  latency: number;
  status: 'ok' | 'flagged' | 'evaluating';
  tokens: number;
}

export const AnimeAgentSwarmRadar: React.FC<AnimeAgentSwarmRadarProps> = ({
  palette,
  onInspectTraces
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pulseRingsRef = useRef<SVGSVGElement | null>(null);
  const spanCounterRef = useRef(9025);

  const [activeTab, setActiveTab] = useState<'all' | 'flagged'>('all');
  const [isWiping, setIsWiping] = useState(false);
  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEvent[]>([
    { id: 'sp-9021', source: 'pricing-agent', action: 'calc_discount_margin(0.18)', latency: 2.4, status: 'ok', tokens: 124 },
    { id: 'sp-9022', source: 'sql-generator', action: 'query("SELECT tier FROM users")', latency: 4.1, status: 'ok', tokens: 280 },
    { id: 'sp-9023', source: 'research-swarm', action: 'verify_grounding_claim()', latency: 48.2, status: 'flagged', tokens: 812 },
    { id: 'sp-9024', source: 'checkout-orchestrator', action: 'reserve_inventory_slot()', latency: 3.1, status: 'ok', tokens: 95 }
  ]);

  const handleWipeCard = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsWiping(true);
    setTimeout(() => {
      setTelemetryEvents([
        { id: `sp-${spanCounterRef.current++}`, source: 'pricing-agent', action: 'calc_discount_margin(0.18)', latency: 1.6, status: 'ok', tokens: 104 },
        { id: `sp-${spanCounterRef.current++}`, source: 'sql-generator', action: 'query("SELECT tier FROM users")', latency: 2.8, status: 'ok', tokens: 198 },
        { id: `sp-${spanCounterRef.current++}`, source: 'ingress-collector', action: 'buffer_flushed_and_wiped()', latency: 0.4, status: 'ok', tokens: 36 }
      ]);
      setIsWiping(false);
    }, 600);
  };

  // Anime.js expanding radar rings and node pulses
  useEffect(() => {
    if (!pulseRingsRef.current) return;

    const rings = pulseRingsRef.current.querySelectorAll('.radar-pulse-ring');
    const ringAnim = animate(rings, {
      r: [12, 68],
      opacity: [0.8, 0],
      strokeWidth: [2, 0.5],
      duration: 3200,
      delay: stagger(900),
      ease: 'outExpo',
      loop: true
    });

    return () => {
      ringAnim.revert();
    };
  }, []);

  // Staggered list entrance on tab change or updates
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.telemetry-stream-item');

    const listAnim = animate(items, {
      opacity: [0, 1],
      translateX: [14, 0],
      duration: 650,
      delay: stagger(90),
      ease: 'outExpo'
    });

    return () => {
      listAnim.revert();
    };
  }, [activeTab, telemetryEvents]);

  // Periodic real-time span arrival with anime.js highlight wave
  useEffect(() => {
    const timer = setInterval(() => {
      const actions = [
        { source: 'order-agent', action: 'validate_shipping_matrix()', latency: 2.8, status: 'ok' as const, tokens: 140 },
        { source: 'rag-synthesizer', action: 'deberta_nli_entailment()', latency: 54.1, status: 'flagged' as const, tokens: 620 },
        { source: 'tool-caller', action: 'stripe.charges.create()', latency: 3.9, status: 'ok' as const, tokens: 88 },
        { source: 'policy-guard', action: 'pii_regex_sanitization()', latency: 1.2, status: 'ok' as const, tokens: 34 }
      ];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      const nextNum = spanCounterRef.current++;
      const newId = `sp-${nextNum}`;

      setTelemetryEvents(prev => [
        { id: newId, ...randomAction },
        ...prev.filter(item => item.id !== newId).slice(0, 3)
      ]);
    }, 3600);

    return () => clearInterval(timer);
  }, []);

  const filteredEvents = activeTab === 'flagged' 
    ? telemetryEvents.filter(e => e.status === 'flagged')
    : telemetryEvents;

  return (
    <div
      ref={containerRef}
      data-wiping={isWiping}
      className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all relative overflow-hidden shadow-2xl ${
        isWiping ? 'is-wiping' : ''
      } ${
        palette === 'butter'
          ? 'ios-ultra-thin-butter border-2 border-neutral-950 text-neutral-950 shadow-[10px_10px_0px_#000000]'
          : palette === 'chalk'
          ? 'chalk-tactile-card border border-neutral-200 text-neutral-900 shadow-xl'
          : 'liquid-glass-card border-glow-subtle text-white'
      }`}
    >
      {/* Specular Top Bevel */}
      {palette === 'chalk' ? (
        <div className="absolute inset-x-0 top-0 h-[1.5px] chalk-specular pointer-events-none rounded-t-[1.35rem]" />
      ) : (
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none rounded-t-[1.35rem]" />
      )}

      {/* Production Telemetry Ingress Bar */}
      <div className={`flex items-center justify-between border-b pb-4 mb-5 relative z-10 ${
        palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-neutral-200/80' : 'border-white/10'
      }`}>
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
            palette === 'butter'
              ? 'bg-neutral-950 text-emerald-400 border border-neutral-950 shadow-[2px_2px_0px_#000000]'
              : palette === 'chalk'
              ? 'bg-neutral-100 text-neutral-800 border border-neutral-200/60 shadow-xs'
              : 'bg-white/[0.08] text-emerald-400 border border-white/10'
          }`}>
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-xs font-mono font-bold tracking-tight ${
                palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-100'
              }`}>
                stream.agentpulse.internal
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                palette === 'butter'
                  ? 'bg-neutral-950 text-amber-300 border border-neutral-950'
                  : palette === 'chalk'
                  ? 'bg-neutral-100 text-neutral-600 border border-neutral-200/70'
                  : 'bg-white/[0.06] text-neutral-400 border border-white/5'
              }`}>
                gRPC · v2
              </span>
            </div>
            <p className={`text-[10px] font-mono mt-0.5 font-medium ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
            }`}>
              Zero-Copy Ring Buffer (128MB)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center shadow-xs transition-colors ${
            palette === 'butter'
              ? 'bg-emerald-300 text-neutral-950 border border-neutral-950 shadow-[2px_2px_0px_#000000]'
              : palette === 'chalk'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
          }`}>
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>LIVE INGESTION</span>
          </div>

          {/* Clear / Wipe Clean Icon Button */}
          <button
            type="button"
            id="clear-chalk-card-btn"
            onClick={handleWipeCard}
            disabled={isWiping}
            title="Wipe whiteboard clean"
            aria-label="Wipe chalkboard clean"
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center space-x-1.5 transition-all duration-200 active:scale-90 cursor-pointer ${
              palette === 'butter'
                ? 'bg-white hover:bg-neutral-100 text-neutral-950 border border-neutral-950 shadow-[2px_2px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-950 border border-neutral-300/80 shadow-2xs'
                : 'bg-white/[0.08] hover:bg-white/[0.14] text-neutral-300 hover:text-white border border-white/10'
            }`}
          >
            <Eraser className="w-3 h-3 text-neutral-500 group-hover:text-neutral-900 transition-colors" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Top Multi-Agent Swarm Constellation Mini-Visualizer */}
      <div className={`mb-5 p-4 rounded-2xl relative overflow-hidden z-10 ${
        palette === 'butter'
          ? 'bg-white border-2 border-neutral-950 shadow-[4px_4px_0px_#000000]'
          : palette === 'chalk'
          ? 'bg-white border border-neutral-200 shadow-sm'
          : 'bg-black/30 backdrop-blur-xl border border-white/10 shadow-inner'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className={`flex items-center space-x-2 text-xs font-mono font-bold ${
            palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-neutral-900' : 'text-neutral-200'
          }`}>
            <Activity className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse" />
            <span>Telemetry Ingress Radar</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                activeTab === 'all'
                  ? palette === 'butter'
                    ? 'bg-neutral-950 text-amber-300 font-black shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-neutral-900 text-white font-bold'
                    : 'bg-white/20 text-white font-bold'
                  : palette === 'butter'
                  ? 'text-neutral-800 font-bold hover:text-black'
                  : palette === 'chalk'
                  ? 'text-neutral-600 hover:text-neutral-950'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Spans
            </button>
            <button
              onClick={() => setActiveTab('flagged')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                activeTab === 'flagged'
                  ? palette === 'butter'
                    ? 'bg-rose-200 text-rose-950 border border-neutral-950 font-black shadow-[2px_2px_0px_#000000]'
                    : palette === 'chalk'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                    : 'bg-rose-500/30 text-rose-300 font-bold border border-rose-500/40'
                  : palette === 'butter'
                  ? 'text-rose-900 font-bold hover:text-rose-950'
                  : palette === 'chalk'
                  ? 'text-neutral-600 hover:text-rose-700'
                  : 'text-neutral-400 hover:text-rose-300'
              }`}
            >
              Flagged Only
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          {/* Radar Animation Node Canvas */}
          <div className="flex items-center justify-center relative py-2">
            <svg
              ref={pulseRingsRef}
              className="w-28 h-28 overflow-visible"
              viewBox="0 0 100 100"
            >
              <circle cx="50" cy="50" r="44" stroke={palette === 'butter' ? 'rgba(0,0,0,0.2)' : palette === 'chalk' ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.06)'} strokeWidth="1" fill="none" />
              <circle cx="50" cy="50" r="28" stroke={palette === 'butter' ? 'rgba(0,0,0,0.25)' : palette === 'chalk' ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.1)'} strokeWidth="1" fill="none" strokeDasharray="3 3" />
              
              {/* Animated Radar Pulse Rings */}
              <circle className="radar-pulse-ring" cx="50" cy="50" r="10" stroke={palette === 'butter' ? 'rgba(0,0,0,0.4)' : palette === 'chalk' ? 'rgba(16,185,129,0.5)' : 'rgba(52,211,153,0.6)'} fill="none" />
              <circle className="radar-pulse-ring" cx="50" cy="50" r="10" stroke={palette === 'butter' ? 'rgba(245,158,11,0.6)' : palette === 'chalk' ? 'rgba(15,23,42,0.3)' : 'rgba(56,189,248,0.5)'} fill="none" />
              <circle className="radar-pulse-ring" cx="50" cy="50" r="10" stroke={palette === 'butter' ? 'rgba(16,185,129,0.5)' : palette === 'chalk' ? 'rgba(100,116,139,0.35)' : 'rgba(245,158,11,0.5)'} fill="none" />

              {/* Central Ingress Collector Core */}
              <circle cx="50" cy="50" r="5" fill={palette === 'butter' ? '#000000' : palette === 'chalk' ? '#0f172a' : '#10b981'} className="shadow-sm" />
              <circle cx="50" cy="50" r="2" fill="#ffffff" />
            </svg>
            <span className={`absolute bottom-0 text-[10px] font-mono tracking-wider font-bold ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
            }`}>
              OTEL RING BUFFER
            </span>
          </div>

          {/* Real-time Dynamic Numerical Tickers driven by Anime.js */}
          <div className="sm:col-span-2 space-y-2 font-mono text-xs">
            <div className={`p-2.5 rounded-xl flex items-center justify-between ${
              palette === 'butter'
                ? 'bg-neutral-50 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-neutral-50 border border-neutral-200'
                : 'bg-white/[0.04] border border-white/10'
            }`}>
              <span className={`flex items-center font-medium ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}>
                <Server className={`w-3.5 h-3.5 mr-1.5 ${palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-sky-600' : 'text-cyan-300'}`} />
                Live Ingest Rate:
              </span>
              <span className={`font-bold ${
                palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-300'
              }`}>
                <AnimeInteractiveCounter targetValue={14280} duration={1600} suffix=" spans/s" />
              </span>
            </div>

            <div className={`p-2.5 rounded-xl flex items-center justify-between ${
              palette === 'butter'
                ? 'bg-neutral-50 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-neutral-50 border border-neutral-200'
                : 'bg-white/[0.04] border border-white/10'
            }`}>
              <span className={`flex items-center font-medium ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}>
                <Cpu className={`w-3.5 h-3.5 mr-1.5 ${palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-amber-700' : 'text-amber-300'}`} />
                Local CPU Evaluator:
              </span>
              <span className={`font-bold ${
                palette === 'butter' ? 'text-amber-950' : palette === 'chalk' ? 'text-amber-800' : 'text-amber-300'
              }`}>
                <AnimeInteractiveCounter targetValue={54.2} decimals={1} duration={1200} suffix=" ms" />
              </span>
            </div>

            <div className={`p-2.5 rounded-xl flex items-center justify-between ${
              palette === 'butter'
                ? 'bg-neutral-50 border border-neutral-950'
                : palette === 'chalk'
                ? 'bg-neutral-50 border border-neutral-200'
                : 'bg-white/[0.04] border border-white/10'
            }`}>
              <span className={`flex items-center font-medium ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-600' : 'text-neutral-400'
              }`}>
                <ShieldCheck className={`w-3.5 h-3.5 mr-1.5 ${palette === 'butter' ? 'text-emerald-800' : palette === 'chalk' ? 'text-emerald-600' : 'text-emerald-400'}`} />
                Grounding Agreement:
              </span>
              <span className={`font-bold ${
                palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
              }`}>
                <AnimeInteractiveCounter targetValue={99.98} decimals={2} duration={1400} suffix="%" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trace Activity Stream with Anime.js Staggered Entrance */}
      <div ref={listRef} className="space-y-2.5 font-mono text-xs relative z-10">
        {filteredEvents.map((ev) => (
          <div
            key={ev.id}
            className={`telemetry-stream-item p-3 rounded-xl border transition-all duration-300 backdrop-blur-md tactile-press ${
              ev.status === 'flagged'
                ? palette === 'butter'
                  ? 'bg-rose-100 border-2 border-neutral-950 text-neutral-950 shadow-[3px_3px_0px_#000000]'
                  : palette === 'chalk'
                  ? 'bg-rose-50/90 border-rose-200 text-neutral-900 shadow-sm'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                : palette === 'butter'
                ? 'bg-white border-2 border-neutral-950 text-neutral-950 shadow-[3px_3px_0px_#000000] hover:bg-neutral-50'
                : palette === 'chalk'
                ? 'bg-white border-neutral-200 text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 shadow-sm'
                : 'bg-white/[0.04] border-white/[0.1] text-neutral-200 hover:bg-white/[0.08] hover:border-white/25'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    ev.status === 'flagged'
                      ? palette === 'butter'
                        ? 'bg-rose-200 text-rose-950 border border-neutral-950'
                        : palette === 'chalk'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-rose-500/30 text-rose-300 border border-rose-500/50'
                      : palette === 'butter'
                      ? 'bg-emerald-200 text-emerald-950 border border-neutral-950'
                      : palette === 'chalk'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {ev.status === 'flagged' ? 'NLI_CONTRADICTION' : 'FAITHFUL'}
                </span>
                <span className={`font-bold ${
                  palette === 'butter' ? 'text-amber-950' : palette === 'chalk' ? 'text-amber-800' : 'text-amber-300'
                }`}>{ev.source}</span>
              </div>
              <span className={`text-[11px] font-medium ${
                palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
              }`}>{ev.id}</span>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className={`truncate max-w-[260px] font-medium ${
                palette === 'butter' ? 'text-neutral-900' : palette === 'chalk' ? 'text-neutral-700' : 'text-neutral-300'
              }`}>{ev.action}</span>
              <span className={
                ev.status === 'flagged'
                  ? palette === 'butter'
                    ? 'text-rose-950 font-bold'
                    : palette === 'chalk'
                    ? 'text-rose-700 font-bold'
                    : 'text-rose-400 font-bold'
                  : palette === 'butter'
                  ? 'text-emerald-950 font-bold'
                  : palette === 'chalk'
                  ? 'text-emerald-700 font-bold'
                  : 'text-emerald-400'
              }>
                {ev.latency}ms · {ev.tokens} tok
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Terminal Footer Metrics Bar */}
      <div className={`mt-5 pt-4 border-t flex items-center justify-between text-xs font-mono relative z-10 ${
        palette === 'butter' ? 'border-neutral-950' : palette === 'chalk' ? 'border-neutral-200' : 'border-white/10'
      }`}>
        <div className="flex items-center space-x-4">
          <div>
            <span className={`text-[10px] block uppercase font-bold ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
            }`}>Autonomous Swarms</span>
            <span className={`font-bold ${
              palette === 'butter' ? 'text-neutral-950' : palette === 'chalk' ? 'text-amber-800' : 'text-amber-300'
            }`}>
              <AnimeInteractiveCounter targetValue={16} duration={900} suffix=" Swarms Active" />
            </span>
          </div>
          <div>
            <span className={`text-[10px] block uppercase font-bold ${
              palette === 'butter' ? 'text-neutral-800' : palette === 'chalk' ? 'text-neutral-500' : 'text-neutral-400'
            }`}>Judge Token Cost</span>
            <span className={`font-bold ${
              palette === 'butter' ? 'text-emerald-950' : palette === 'chalk' ? 'text-emerald-700' : 'text-emerald-400'
            }`}>$0.00 (100% CPU)</span>
          </div>
        </div>

        {onInspectTraces && (
          <button
            onClick={onInspectTraces}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all active:scale-95 tactile-press shadow-md ${
              palette === 'butter'
                ? 'bg-neutral-950 hover:bg-neutral-900 text-amber-300 border-2 border-neutral-950 shadow-[3px_3px_0px_#000000]'
                : palette === 'chalk'
                ? 'bg-neutral-900 hover:bg-black text-white'
                : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-[0_4px_16px_rgba(245,158,11,0.35)]'
            }`}
          >
            <span>Live Trace Stream</span>
            <Zap className="w-3.5 h-3.5 fill-current" />
          </button>
        )}
      </div>
    </div>
  );
};
