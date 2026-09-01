import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Bot,
  Activity,
  AlertTriangle,
  TrendingDown,
  Play,
  FlaskConical,
  Database,
  Cpu,
  Settings,
  Command,
  ChevronUp,
  MoreHorizontal,
  Keyboard
} from 'lucide-react';
import { ProductTab } from '../../types';

interface FloatingDockProps {
  currentTab: ProductTab;
  onSelectTab: (tab: ProductTab) => void;
  onOpenCommandPalette: () => void;
  onOpenShortcutsModal?: () => void;
  incidentCount?: number;
  driftWarningCount?: number;
}

export const FloatingDock: React.FC<FloatingDockProps> = ({
  currentTab,
  onSelectTab,
  onOpenCommandPalette,
  onOpenShortcutsModal,
  incidentCount = 2,
  driftWarningCount = 1
}) => {
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const mainItems: { id: ProductTab; label: string; icon: React.FC<{ className?: string }>; badge?: number; badgeColor?: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'traces', label: 'Traces', icon: Activity },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle, badge: incidentCount, badgeColor: 'bg-rose-500 text-white' },
    { id: 'drift', label: 'Drift', icon: TrendingDown, badge: driftWarningCount, badgeColor: 'bg-amber-500 text-black' },
  ];

  const secondaryItems: { id: ProductTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'replay', label: 'Replay & Trace Time-Travel', icon: Play },
    { id: 'experiments', label: 'Experiments (Braintrust/Langfuse)', icon: FlaskConical },
    { id: 'datasets', label: 'Curated Golden Datasets', icon: Database },
    { id: 'telemetry-lab', label: 'Telemetry Lab & Live Simulator', icon: Cpu },
    { id: 'settings', label: 'Settings & Evaluators', icon: Settings },
  ];

  const isSecondaryActive = secondaryItems.some(item => item.id === currentTab);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dockRef.current) {
      const rect = dockRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setMousePos(null);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none">
      <AnimatePresence>
        {showSecondaryMenu && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            className="mb-3.5 apple-liquid-dock ios-ultra-thin ios-ultra-thin-dock rounded-2xl p-2 min-w-[290px] shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-[1px] apple-liquid-specular pointer-events-none" />

            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 px-3 py-1.5 border-b border-white/[0.08] flex items-center justify-between">
              <span>Secondary Research Surfaces</span>
              <span className="text-[9px] text-neutral-500">Liquid Stack</span>
            </div>
            <div className="space-y-1 pt-1.5">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <motion.button
                    key={item.id}
                    whileHover={{ scale: 1.02, x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    onClick={() => {
                      onSelectTab(item.id);
                      setShowSecondaryMenu(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-mono text-left transition-colors relative overflow-hidden ${
                      active
                        ? 'apple-liquid-pill-active font-semibold'
                        : 'text-neutral-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-neutral-950' : 'text-neutral-400'}`} />
                    <span>{item.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        ref={dockRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="apple-liquid-dock ios-ultra-thin ios-ultra-thin-dock rounded-2xl p-1.5 flex items-center space-x-1 relative overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        
        {mousePos && (
          <div
            className="absolute pointer-events-none rounded-full w-28 h-28 -translate-x-1/2 -translate-y-1/2 blur-xl bg-white/[0.08] transition-opacity duration-200"
            style={{
              left: `${mousePos.x}px`,
              top: `${mousePos.y}px`
            }}
          />
        )}

        {mainItems.map((item, idx) => {
          const Icon = item.icon;
          const active = currentTab === item.id;

          let scale = 1;
          if (hoveredIndex !== null) {
            const distance = Math.abs(hoveredIndex - idx);
            if (distance === 0) scale = 1.08;
            else if (distance === 1) scale = 1.03;
          }

          return (
            <motion.button
              key={item.id}
              animate={{ scale }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              onMouseEnter={() => setHoveredIndex(idx)}
              onClick={() => {
                onSelectTab(item.id);
                setShowSecondaryMenu(false);
              }}
              className="relative flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-mono transition-colors z-10"
            >
              {active && (
                <motion.div
                  layoutId="apple-liquid-active-pill"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 34,
                    mass: 0.65
                  }}
                  className="absolute inset-0 rounded-xl apple-liquid-pill-active z-[-1]"
                />
              )}

              <Icon
                className={`w-3.5 h-3.5 transition-colors duration-150 ${
                  active ? 'text-neutral-950' : 'text-neutral-400 group-hover:text-neutral-200'
                }`}
              />
              <span
                className={`hidden sm:inline transition-colors duration-150 ${
                  active ? 'text-neutral-950 font-semibold' : 'text-neutral-300'
                }`}
              >
                {item.label}
              </span>

              {item.badge !== undefined && item.badge > 0 && (
                <motion.span
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow-sm ${item.badgeColor}`}
                >
                  {item.badge}
                </motion.span>
              )}
            </motion.button>
          );
        })}

        <div className="w-[1px] h-5 bg-white/[0.14] mx-1 relative z-10 shadow-[0_0_1px_rgba(255,255,255,0.2)]" />

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 450, damping: 28 }}
          onClick={() => setShowSecondaryMenu(!showSecondaryMenu)}
          className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-mono transition-all z-10 ${
            isSecondaryActive || showSecondaryMenu
              ? 'bg-white/[0.14] text-white border border-white/[0.2] shadow-inner'
              : 'text-neutral-300 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="More surfaces: Replay, Experiments, Datasets, Telemetry Lab, Settings"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">More</span>
          <ChevronUp
            className={`w-3 h-3 transition-transform duration-200 ${
              showSecondaryMenu ? 'rotate-180' : ''
            }`}
          />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 450, damping: 28 }}
          onClick={onOpenCommandPalette}
          className="p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-colors z-10"
          title="Command Palette (Cmd+K / Ctrl+K)"
        >
          <Command className="w-4 h-4" />
        </motion.button>

        {onOpenShortcutsModal && (
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            onClick={onOpenShortcutsModal}
            className="p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-colors z-10"
            title="Global Keyboard Shortcuts (Press ?)"
          >
            <Keyboard className="w-4 h-4" />
          </motion.button>
        )}
      </motion.div>
    </div>
  );
};
