import React, { useRef, useState, useCallback, ReactNode } from 'react';

interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevation?: 'flat' | 'default' | 'elevated' | 'dock' | 'pill';
  interactive?: boolean;
  className?: string;
  glowOnHover?: boolean;
  onClick?: () => void;
}

export function LiquidGlass({
  children,
  elevation = 'default',
  interactive = true,
  className = '',
  glowOnHover = false,
  onClick,
  ...props
}: LiquidGlassProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, [interactive]);

  const elevationClass = {
    flat: 'bg-surface/50 border border-line',
    default: 'liquid-glass',
    elevated: 'liquid-glass-elevated',
    dock: 'liquid-glass-dock',
    pill: 'liquid-glass-pill rounded-full',
  }[elevation];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`relative overflow-hidden transition-spatial ${elevationClass} ${
        interactive ? 'cursor-default' : ''
      } ${
        glowOnHover && isHovered ? 'border-signal/40 shadow-signal' : ''
      } ${className}`}
      {...props}
    >
      {/* Specular light highlight following pointer */}
      {interactive && isHovered && (
        <div
          className="pointer-events-none absolute -inset-px opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(280px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.11), transparent 65%)`,
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
