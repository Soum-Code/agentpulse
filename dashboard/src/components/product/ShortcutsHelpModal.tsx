import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Keyboard, ArrowRight, CornerDownLeft } from 'lucide-react';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  isOpen,
  onClose
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            className="relative w-full max-w-2xl ios-liquid-card border-glow-subtle rounded-2xl p-6 shadow-2xl text-white font-mono overflow-hidden z-10"
          >
            <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />

            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-white uppercase">
                    Global Keyboard Navigation
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    High-velocity shortcuts designed for power telemetry investigation
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Close shortcuts modal (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-5 text-xs">
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
                  Trace Investigation (J/K)
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Next trace in list</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">J</kbd>
                      <span className="text-neutral-500 text-[10px]">or</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[11px]">↓</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Previous trace in list</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">K</kbd>
                      <span className="text-neutral-500 text-[10px]">or</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[11px]">↑</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Next page of traces</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">N</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Previous page of traces</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">P</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Open / inspect selected trace</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px] flex items-center space-x-1">
                      <CornerDownLeft className="w-3 h-3" />
                      <span>Enter</span>
                    </kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Switch view perspectives</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">1</kbd>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">2</kbd>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">3</kbd>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">4</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Curate span to dataset</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">C</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Focus trace search / filter</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">/</kbd>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
                  Global System & Commands
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Command Palette</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">⌘K / Ctrl+K</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Toggle shortcuts cheat sheet</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">?</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Close modals / Deselect</span>
                    <kbd className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-white font-bold text-[11px]">Esc</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Toggle Active Context panel</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">G</kbd>
                      <span className="text-neutral-500 text-[10px]">then</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">C</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Go to Overview</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">G</kbd>
                      <span className="text-neutral-500 text-[10px]">then</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">O</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Go to Traces</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">G</kbd>
                      <span className="text-neutral-500 text-[10px]">then</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">T</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Go to Incidents / Drift</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">G</kbd>
                      <span className="text-neutral-500 text-[10px]">then</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">I / D</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-neutral-300">Go to Telemetry Lab</span>
                    <div className="flex items-center space-x-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">G</kbd>
                      <span className="text-neutral-500 text-[10px]">then</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px]">L</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-neutral-400">
              <span>Shortcuts are active globally across the product workspace.</span>
              <button
                onClick={onClose}
                className="px-3 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
