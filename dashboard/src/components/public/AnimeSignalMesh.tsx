import React, { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

interface AnimeSignalMeshProps {
  palette: 'butter' | 'dark' | 'chalk';
}

export const AnimeSignalMesh: React.FC<AnimeSignalMeshProps> = ({ palette }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const paths = svgRef.current.querySelectorAll('.anime-signal-path');
    const dots = svgRef.current.querySelectorAll('.anime-signal-dot');

    // Smooth dashoffset drawing wave along the bezier spline telemetry curves
    const pathAnim = animate(paths, {
      strokeDashoffset: [400, 0],
      opacity: [0.15, 0.45, 0.15],
      duration: 5200,
      delay: stagger(400),
      ease: 'inOutSine',
      loop: true
    });

    // Staggered floating particles along the grid
    const dotAnim = animate(dots, {
      cy: (el: SVGElement, i: number) => {
        const base = parseFloat(el.getAttribute('cy') || '50');
        return [base - 8, base + 8, base - 8];
      },
      cx: (el: SVGElement, i: number) => {
        const base = parseFloat(el.getAttribute('cx') || '50');
        return [base - 4, base + 4, base - 4];
      },
      opacity: [0.3, 0.9, 0.3],
      duration: 3800,
      delay: stagger(250),
      ease: 'inOutQuad',
      loop: true
    });

    return () => {
      pathAnim.revert();
      dotAnim.revert();
    };
  }, []);

  if (palette === 'butter') {
    return null;
  }

  const isChalk = palette === 'chalk';

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-0 ${isChalk ? 'opacity-40' : 'opacity-60'}`}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox="0 0 1200 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="cyanAmberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            {isChalk ? (
              <>
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#475569" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </>
            )}
          </linearGradient>
          <filter id="glowBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={isChalk ? '1.5' : '3'} result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Telemetry Span Stream Connecting Splines */}
        <path
          className="anime-signal-path"
          d="M 100 280 C 320 160, 520 420, 780 260 C 940 160, 1080 320, 1180 240"
          stroke="url(#cyanAmberGrad)"
          strokeWidth={isChalk ? '1.2' : '1.5'}
          strokeDasharray="400"
          strokeDashoffset="400"
          filter="url(#glowBlur)"
        />
        <path
          className="anime-signal-path"
          d="M 60 420 C 280 480, 460 200, 720 340 C 900 440, 1060 200, 1160 380"
          stroke={isChalk ? 'rgba(2, 132, 199, 0.45)' : 'rgba(34, 211, 238, 0.4)'}
          strokeWidth="1"
          strokeDasharray="400"
          strokeDashoffset="400"
        />
        <path
          className="anime-signal-path"
          d="M 160 140 C 380 240, 620 80, 840 220 C 980 300, 1080 160, 1140 180"
          stroke={isChalk ? 'rgba(71, 85, 105, 0.4)' : 'rgba(245, 158, 11, 0.35)'}
          strokeWidth="1"
          strokeDasharray="400"
          strokeDashoffset="400"
        />

        {/* Dynamic Nodes */}
        <circle className="anime-signal-dot" cx="320" cy="160" r={isChalk ? '3' : '3.5'} fill={isChalk ? '#0284c7' : '#22d3ee'} filter="url(#glowBlur)" />
        <circle className="anime-signal-dot" cx="520" cy="420" r={isChalk ? '3.5' : '4'} fill={isChalk ? '#d97706' : '#f59e0b'} filter="url(#glowBlur)" />
        <circle className="anime-signal-dot" cx="780" cy="260" r={isChalk ? '4' : '4.5'} fill={isChalk ? '#059669' : '#10b981'} filter="url(#glowBlur)" />
        <circle className="anime-signal-dot" cx="940" cy="160" r={isChalk ? '2.5' : '3'} fill={isChalk ? '#6366f1' : '#a855f7'} filter="url(#glowBlur)" />
        <circle className="anime-signal-dot" cx="460" cy="200" r={isChalk ? '2.5' : '3'} fill={isChalk ? '#0284c7' : '#22d3ee'} filter="url(#glowBlur)" />
        <circle className="anime-signal-dot" cx="720" cy="340" r={isChalk ? '3.5' : '4'} fill={isChalk ? '#d97706' : '#f59e0b'} filter="url(#glowBlur)" />
      </svg>
    </div>
  );
};
