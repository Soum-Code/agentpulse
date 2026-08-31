import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  FlaskConical,
  LayoutGrid,
  Route,
} from 'lucide-react';

export type NavTabId = 'overview' | 'traces' | 'incidents' | 'drift' | 'lab' | 'datasets';

interface NavigationDockProps {
  activeTab: NavTabId;
  onChangeTab: (tab: NavTabId) => void;
  openIncidentsCount: number;
  className?: string;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid, shortcut: '1', activeStyle: 'bg-yellow-400 text-black shadow-[3px_3px_0px_#000]' },
  { id: 'traces', label: 'Traces', icon: Route, shortcut: '2', activeStyle: 'bg-cyan-400 text-black shadow-[3px_3px_0px_#000]' },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle, shortcut: '3', activeStyle: 'bg-pink-500 text-white shadow-[3px_3px_0px_#000]' },
  { id: 'drift', label: 'Drift & ASI', icon: Activity, shortcut: '4', activeStyle: 'bg-orange-500 text-white shadow-[3px_3px_0px_#000]' },
  { id: 'lab', label: 'Telemetry Lab', icon: FlaskConical, shortcut: '5', activeStyle: 'bg-purple-400 text-black shadow-[3px_3px_0px_#000]' },
  { id: 'datasets', label: 'Datasets', icon: Database, shortcut: '6', activeStyle: 'bg-emerald-400 text-black shadow-[3px_3px_0px_#000]' },
] as const;

export function NavigationDock({
  activeTab,
  onChangeTab,
  openIncidentsCount,
  className = '',
}: NavigationDockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      aria-label="AgentPulse Command Navigation"
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] ${className}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setExpanded(false);
        }
      }}
    >
      <div className="px-3 py-2 rounded-2xl flex items-center gap-1 sm:gap-2 border-2 border-black bg-surface-2/95 backdrop-blur-2xl shadow-comic-lg">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isIncident = item.id === 'incidents';
          const hasIncidents = isIncident && openIncidentsCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={`${item.label} (${item.shortcut})`}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all duration-150 cursor-pointer select-none border-2 border-black active:translate-x-0.5 active:translate-y-0.5 ${
                isActive
                  ? item.activeStyle
                  : 'bg-surface border-transparent text-neutral-300 hover:text-white hover:border-black hover:bg-surface-3'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform ${
                  isActive ? 'scale-110' : 'text-neutral-400'
                }`}
                aria-hidden="true"
              />

              {/* Responsive Text Label */}
              <span
                className={`transition-all duration-150 whitespace-nowrap uppercase tracking-wider text-2xs ${
                  expanded
                    ? 'inline-block opacity-100 max-w-[120px]'
                    : isActive
                    ? 'inline-block opacity-100 max-w-[120px]'
                    : 'hidden sm:inline-block opacity-85 max-w-[100px]'
                }`}
              >
                {item.label}
              </span>

              {/* Incidents Comic Pill */}
              {hasIncidents && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-3xs font-black font-mono border border-black ${
                    isActive
                      ? 'bg-black text-white'
                      : 'bg-pink-500 text-white shadow-[1px_1px_0px_#000]'
                  }`}
                  aria-label={`${openIncidentsCount} open incidents`}
                >
                  {openIncidentsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

