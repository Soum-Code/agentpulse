import {
  LayoutGrid, Route, AlertTriangle, History, Activity,
  FlaskConical, Database, Zap, Command, Radio,
} from 'lucide-react';
import { cx, Eyebrow } from './ui';

export type NavPage =
  | 'overview' | 'traces' | 'incidents' | 'drift'
  | 'telemetry-lab' | 'incident-replay' | 'experiments' | 'datasets';

type Item = { id: NavPage; label: string; icon: typeof LayoutGrid; badge?: number };

/* Grouped by what the operator is trying to do, rather than one flat list of
   eight peers — monitoring, investigating an incident, and running research
   are distinct tasks with distinct urgency. */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutGrid },
      { id: 'traces', label: 'Traces', icon: Route },
      { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
    ],
  },
  {
    title: 'Investigate',
    items: [
      { id: 'incident-replay', label: 'Replay Debugger', icon: History },
      { id: 'drift', label: 'Drift & Stability', icon: Activity },
    ],
  },
  {
    title: 'Research',
    items: [
      { id: 'experiments', label: 'Experiments', icon: FlaskConical },
      { id: 'datasets', label: 'Datasets', icon: Database },
      { id: 'telemetry-lab', label: 'Telemetry Lab', icon: Zap },
    ],
  },
];

export function SideRail({
  current, onNavigate, openIncidents, isConnected, onOpenPalette,
}: {
  current: NavPage;
  onNavigate: (p: NavPage) => void;
  openIncidents: number;
  isConnected: boolean;
  onOpenPalette: () => void;
}) {
  return (
    <aside className="w-[212px] shrink-0 border-r border-line bg-surface flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-line">
        <div className="relative w-7 h-7 rounded bg-signal/12 border border-signal/35 grid place-items-center">
          <Radio className="w-3.5 h-3.5 text-signal" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-ink">AgentPulse</div>
          <div className="text-2xs font-mono text-ink-faint">CONTROL PLANE</div>
        </div>
      </div>

      <div className="pulse-rail" aria-hidden="true" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <Eyebrow className="px-2">{group.title}</Eyebrow>
            <ul className="mt-1.5 space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = current === item.id;
                const badge = item.id === 'incidents' ? openIncidents : 0;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onNavigate(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'group w-full flex items-center gap-2.5 px-2 py-[7px] rounded text-[13px] cursor-pointer',
                        'transition-colors duration-150 relative',
                        active
                          ? 'bg-signal/10 text-ink font-medium'
                          : 'text-ink-dim hover:text-ink hover:bg-surface-3',
                      )}
                    >
                      {/* Active marker rail */}
                      <span
                        className={cx(
                          'absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-150',
                          active ? 'h-4 bg-signal' : 'h-0 bg-transparent',
                        )}
                        aria-hidden="true"
                      />
                      <Icon
                        className={cx('w-4 h-4 shrink-0', active ? 'text-signal' : 'text-ink-faint group-hover:text-ink-dim')}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className="ml-auto px-1.5 py-px rounded-full bg-state-bad/15 text-state-bad text-2xs font-mono font-semibold tnum">
                          {badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: command palette + live link state */}
      <div className="border-t border-line p-2.5 space-y-2">
        <button
          onClick={onOpenPalette}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-line bg-surface-2 text-ink-dim hover:text-ink hover:border-line-strong transition-colors cursor-pointer text-xs"
        >
          <Command className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Command</span>
          <kbd className="ml-auto font-mono text-2xs text-ink-faint border border-line rounded px-1 py-px">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-2 px-2 py-1">
          <span
            className={cx(
              'w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-state-ok live-dot text-state-ok' : 'bg-state-bad',
            )}
            aria-hidden="true"
          />
          <span className="text-2xs font-mono text-ink-faint">
            {isConnected ? 'STREAM LIVE' : 'STREAM DOWN'}
          </span>
        </div>
      </div>
    </aside>
  );
}
