import React, { useRef, useEffect } from 'react';
import { triggerTabRevealAnimation } from '../../utils/animeTabTransitions';
import { animate } from 'animejs';
import { prefersReducedMotion } from '../../utils/liquidHoverAnime';

interface AnimeTabTransitionContainerProps {
  activeTab: string;
  triggerKey?: string | number;
  children: React.ReactNode;
  className?: string;
}

/**
 * AnimeTabTransitionContainer
 * 
 * High-performance orchestrator that triggers a sophisticated Anime.js staggered
 * reveal for cards and table rows whenever the active navigation tab switches.
 * Also renders a subtle top tactile laser pulse during the tab transition.
 */
export const AnimeTabTransitionContainer: React.FC<AnimeTabTransitionContainerProps> = ({
  activeTab,
  triggerKey,
  children,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const laserPulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use requestAnimationFrame to ensure React has flushed child DOM nodes
    const rafId = requestAnimationFrame(() => {
      // 1. Trigger the staggered reveal animation for cards and table rows
      triggerTabRevealAnimation({
        container,
        tabKey: activeTab
      });

      // 2. Animate the tactile laser beam pulse across the top container rim
      const laserEl = laserPulseRef.current;
      if (laserEl && !prefersReducedMotion()) {
        animate(laserEl, {
          opacity: [0, 0.9, 0],
          translateX: ['-30%', '100%'],
          scaleX: [0.3, 1.2, 0.4],
          duration: 650,
          ease: 'outQuart'
        });
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [activeTab, triggerKey]);

  return (
    <div
      ref={containerRef}
      key={activeTab}
      className={`relative min-w-0 w-full ${className}`}
      data-active-tab={activeTab}
    >
      {/* Tactile Laser Beam Pulse that sweeps across container top during tab switch */}
      <div
        ref={laserPulseRef}
        className="pointer-events-none absolute -top-1 left-0 right-0 h-[2px] opacity-0 bg-gradient-to-r from-transparent via-emerald-400 to-transparent z-20 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
      />
      {children}
    </div>
  );
};
