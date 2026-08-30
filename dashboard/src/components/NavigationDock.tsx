import { useState } from 'react';
import { Activity, AlertTriangle, Database, FlaskConical, History, LayoutGrid, MoreHorizontal, Route, Zap } from 'lucide-react';
import { LiquidGlass } from './LiquidGlass';

interface NavigationDockProps {
  openIncidentsCount: number;
}

/* Primary items: only currently functional destinations */
const PRIMARY_ITEMS = [
  { id: 'overview', label: 'Command', icon: LayoutGrid, available: true },
] as const;

/* Overflow items: planned but not yet implemented */
const OVERFLOW_ITEMS = [
  { id: 'traces', label: 'Traces', icon: Route },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { id: 'drift', label: 'Drift', icon: Activity },
  { id: 'replay', label: 'Replay', icon: History },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical },
  { id: 'datasets', label: 'Datasets', icon: Database },
  { id: 'telemetry', label: 'Telemetry', icon: Zap },
] as const;

export function NavigationDock({ openIncidentsCount }: NavigationDockProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <nav
      aria-label="AgentPulse sections"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { setExpanded(false); setOverflowOpen(false); }}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
          setOverflowOpen(false);
        }
      }}
    >
      <LiquidGlass elevation="dock" interactive={false} className="px-2 py-2 rounded-2xl flex items-center gap-1 border border-line-strong">
        {PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current="page"
              title={item.label}
              className="dock-item dock-item-active"
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className={`dock-label ${expanded ? 'dock-label-open' : ''}`}>{item.label}</span>
            </button>
          );
        })}

        {/* Separator */}
        <span className="w-px h-5 bg-line mx-1" aria-hidden="true" />

        {/* More / Overflow toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOverflowOpen(!overflowOpen)}
            className="dock-more"
            aria-expanded={overflowOpen}
            aria-label="More sections"
            title="More sections (planned)"
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={`dock-label ${expanded ? 'dock-label-open' : ''}`}>More</span>
          </button>

          {overflowOpen && (
            <div className="dock-overflow liquid-glass-elevated border border-line-strong">
              <p className="px-3 py-1.5 text-2xs text-ink-faint">Planned</p>
              {OVERFLOW_ITEMS.map((item) => {
                const Icon = item.icon;
                const count = item.id === 'incidents' ? openIncidentsCount : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled
                    className="dock-overflow-item"
                    title={`${item.label} — planned for a later phase`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {count > 0 && <span className="dock-badge" aria-label={`${count} open`}>{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </LiquidGlass>
    </nav>
  );
}
