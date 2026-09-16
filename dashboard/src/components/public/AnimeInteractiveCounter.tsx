import React, { useEffect, useRef } from 'react';
import { animate } from 'animejs';

interface AnimeInteractiveCounterProps {
  targetValue: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const AnimeInteractiveCounter: React.FC<AnimeInteractiveCounterProps> = ({
  targetValue,
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = ''
}) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const valRef = useRef<{ value: number }>({ value: 0 });

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const anim = animate(valRef.current, {
      value: targetValue,
      duration,
      ease: 'outExpo',
      onUpdate: () => {
        if (el) {
          el.textContent = `${prefix}${valRef.current.value.toFixed(decimals)}${suffix}`;
        }
      }
    });

    return () => {
      anim.revert();
    };
  }, [targetValue, duration, decimals, prefix, suffix]);

  return (
    <span ref={spanRef} className={className}>
      {prefix}{targetValue.toFixed(decimals)}{suffix}
    </span>
  );
};
