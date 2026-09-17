import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  PenTool, 
  Highlighter, 
  Eraser, 
  RotateCcw, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Check, 
  Eye, 
  EyeOff,
  ChevronDown
} from 'lucide-react';
import { 
  startChalkStrokeSound, 
  updateChalkStrokeSound, 
  stopChalkStrokeSound, 
  playChalkTapSound,
  setChalkAudioMuted,
  getIsChalkAudioMuted 
} from '../../utils/chalkAudio';

export type ChalkTool = 'chalk' | 'highlighter' | 'eraser';

export interface ChalkPoint {
  x: number;
  y: number;
  pressure?: number;
  velocity?: number; // instantaneous smoothed velocity (px/ms)
  width?: number;    // dynamic stroke width at this point
  opacity?: number;  // dynamic stroke opacity at this point
  time?: number;
}

export interface ChalkStroke {
  id: string;
  tool: ChalkTool;
  color: string;
  width: number;
  points: ChalkPoint[];
}

export interface PresetAnnotation {
  id: string;
  type: 'highlight' | 'underline' | 'circle' | 'arrow' | 'note';
  text?: string;
  color?: string;
  x?: number; // percentage (0-100)
  y?: number; // percentage (0-100)
  width?: number; // percentage
  height?: number; // percentage
  label?: string;
  rotation?: number;
}

interface ChalkTactileAnnotationProps {
  cardId: string;
  className?: string;
  presets?: PresetAnnotation[];
  showPresetAnnotations?: boolean;
  onTogglePresets?: (visible: boolean) => void;
  interactive?: boolean;
}

const CHALK_COLORS = [
  { id: 'yellow', label: 'Chalk Yellow', hex: '#facc15', highlightHex: 'rgba(250, 204, 21, 0.42)' },
  { id: 'coral', label: 'Pastel Coral', hex: '#fb7185', highlightHex: 'rgba(251, 113, 133, 0.40)' },
  { id: 'cyan', label: 'Powder Cyan', hex: '#38bdf8', highlightHex: 'rgba(56, 189, 248, 0.38)' },
  { id: 'mint', label: 'Lecture Mint', hex: '#4ade80', highlightHex: 'rgba(74, 222, 128, 0.38)' },
  { id: 'white', label: 'Alabaster White', hex: '#f8fafc', highlightHex: 'rgba(255, 255, 255, 0.55)' },
];

/**
 * Calculates tactile, velocity & pressure-sensitive width and opacity.
 * - Slow / Deliberate Stroke (v < 0.3 px/ms):
 *   Contact duration is high, depositing dense chalk / deep saturated ink.
 *   Width expands (+50% to +65%), opacity approaches 0.96-0.98.
 * - Natural Writing Pace (0.6 - 1.4 px/ms):
 *   Nominal width and crisp opacity (0.80 - 0.88).
 * - High-speed Flick / Rapid Dash (v > 2.2 px/ms):
 *   Chalk skips over card texture; width tapers down to ~40-50%,
 *   and opacity drops (0.45 - 0.55), creating authentic calligraphic feathering.
 * - Pointer Pressure (hardware stylus):
 *   If hardware stylus pressure is available, it seamlessly scales width and opacity.
 */
interface DynamicStrokeStyle {
  width: number;
  opacity: number;
  velocity: number;
}

const computeDynamicStrokeStyle = (
  tool: ChalkTool,
  smoothedVelocity: number,
  pointerPressure?: number
): DynamicStrokeStyle => {
  const v = Math.min(5, Math.max(0, smoothedVelocity));

  let baseWidth: number;
  let minWidthRatio: number;
  let maxWidthRatio: number;
  let minOpacity: number;
  let maxOpacity: number;

  switch (tool) {
    case 'chalk':
      baseWidth = 4.8;
      minWidthRatio = 0.42; // Fast flick narrows down to ~2.0px
      maxWidthRatio = 1.65; // Slow hesitation widens up to ~7.9px
      minOpacity = 0.46;    // High speed skips across chalk pits
      maxOpacity = 0.98;    // Heavy slow deposit
      break;

    case 'highlighter':
      baseWidth = 22;
      minWidthRatio = 0.60; // Fast sweep narrows to ~13.2px
      maxWidthRatio = 1.35; // Lingering soak expands to ~29.7px
      minOpacity = 0.20;    // Breezy highlight
      maxOpacity = 0.58;    // Deep soaked ink
      break;

    case 'eraser':
      baseWidth = 28;
      minWidthRatio = 0.70;
      maxWidthRatio = 1.40;
      minOpacity = 0.70;
      maxOpacity = 1.0;
      break;
  }

  // Speed ratio from 0 (stationary) to 1 (high speed >= 2.4 px/ms)
  const speedRatio = Math.min(1, v / 2.4);
  // Non-linear easing for natural hand muscle dynamics
  const slowFactor = Math.pow(1 - speedRatio, 1.35); // 1.0 at v=0, 0.0 at v>=2.4

  // Interpolate width and opacity
  let computedWidth = baseWidth * (minWidthRatio + (maxWidthRatio - minWidthRatio) * slowFactor);
  let computedOpacity = minOpacity + (maxOpacity - minOpacity) * slowFactor;

  // Integrate hardware stylus pressure if available
  if (pointerPressure !== undefined && pointerPressure > 0 && Math.abs(pointerPressure - 0.5) > 0.02) {
    const pressureScale = Math.max(0.35, Math.min(1.65, pointerPressure * 2));
    computedWidth *= (0.65 + pressureScale * 0.35);
    computedOpacity = Math.min(1.0, computedOpacity * (0.7 + pressureScale * 0.3));
  }

  return {
    width: Math.round(computedWidth * 10) / 10,
    opacity: Math.round(computedOpacity * 100) / 100,
    velocity: v,
  };
};

export const ChalkTactileAnnotation: React.FC<ChalkTactileAnnotationProps> = ({
  cardId,
  className = '',
  presets = [],
  showPresetAnnotations = true,
  onTogglePresets,
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Annotation state
  const [strokes, setStrokes] = useState<ChalkStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTool, setActiveTool] = useState<ChalkTool>('highlighter');
  const [activeColor, setActiveColor] = useState(CHALK_COLORS[0]);
  const [isToolActive, setIsToolActive] = useState(false);
  const [isMuted, setIsMuted] = useState(getIsChalkAudioMuted());
  const [showPresets, setShowPresets] = useState(showPresetAnnotations);
  const [animatingPresets, setAnimatingPresets] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  // Sync external preset toggle if provided
  useEffect(() => {
    setShowPresets(showPresetAnnotations);
  }, [showPresetAnnotations]);

  // Load persisted user drawings for this specific card
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`agentpulse_chalk_strokes_${cardId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStrokes(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [cardId]);

  // Save strokes on change
  useEffect(() => {
    try {
      if (strokes.length > 0) {
        localStorage.setItem(`agentpulse_chalk_strokes_${cardId}`, JSON.stringify(strokes));
      } else {
        localStorage.removeItem(`agentpulse_chalk_strokes_${cardId}`);
      }
    } catch {
      // Ignore storage errors
    }
  }, [strokes, cardId]);

  // Current drawing stroke ref to avoid re-rendering canvas on every micro-move
  const currentStrokeRef = useRef<ChalkStroke | null>(null);
  const lastPointRef = useRef<{ 
    x: number; 
    y: number; 
    time: number; 
    velocity: number; 
    width: number; 
    opacity: number; 
  } | null>(null);

  // Render a chalk texture particle stroke with dynamic velocity-based width & opacity
  const drawChalkSegment = (
    ctx: CanvasRenderingContext2D, 
    p1: ChalkPoint, 
    p2: ChalkPoint, 
    color: string, 
    defaultWidth: number = 4.8
  ) => {
    const w1 = p1.width ?? defaultWidth;
    const w2 = p2.width ?? defaultWidth;
    const o1 = p1.opacity ?? 0.85;
    const o2 = p2.opacity ?? 0.85;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    // Micro-step count proportional to distance to create seamless smooth tapers
    const steps = Math.max(1, Math.floor(distance / 2));

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    for (let i = 0; i < steps; i++) {
      const t1 = i / steps;
      const t2 = (i + 1) / steps;
      const segX1 = p1.x + dx * t1;
      const segY1 = p1.y + dy * t1;
      const segX2 = p1.x + dx * t2;
      const segY2 = p1.y + dy * t2;
      const segWidth = w1 + (w2 - w1) * t1;
      const segOpacity = o1 + (o2 - o1) * t1;

      // Draw textured solid core
      ctx.globalAlpha = segOpacity;
      ctx.lineWidth = segWidth;
      ctx.beginPath();
      ctx.moveTo(segX1, segY1);
      ctx.lineTo(segX2, segY2);
      ctx.stroke();

      // Tactile chalk dust & porous grain scattering along the stroke
      // Dust amount and dispersion vary with velocity & opacity
      const isFast = (p2.velocity ?? 0) > 1.4;
      const speckleChance = isFast ? 0.35 : 0.65;
      
      if (Math.random() < speckleChance) {
        const speckleCount = Math.floor(Math.random() * (segOpacity > 0.8 ? 3 : 2)) + 1;
        for (let s = 0; s < speckleCount; s++) {
          const angle = Math.random() * Math.PI * 2;
          // Faster strokes scatter dust slightly further from the center line
          const scatterRadius = (Math.random() * (segWidth / 2 + (isFast ? 3.0 : 1.4)));
          const px = segX1 + Math.cos(angle) * scatterRadius;
          const py = segY1 + Math.sin(angle) * scatterRadius;
          const size = Math.random() * (segOpacity > 0.8 ? 1.8 : 1.2) + 0.35;
          const pAlpha = (Math.random() * 0.4 + 0.15) * segOpacity;

          ctx.globalAlpha = pAlpha;
          ctx.fillRect(px, py, size, size);
        }
      }
    }

    ctx.restore();
  };

  // Render a wide translucent marker / highlighter chisel ribbon with velocity taper
  const drawHighlighterSegment = (
    ctx: CanvasRenderingContext2D, 
    p1: ChalkPoint, 
    p2: ChalkPoint, 
    color: string, 
    defaultWidth: number = 22
  ) => {
    const w1 = p1.width ?? defaultWidth;
    const w2 = p2.width ?? defaultWidth;
    const o1 = p1.opacity ?? 0.40;
    const o2 = p2.opacity ?? 0.40;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(distance / 2.5));

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'square';
    ctx.lineJoin = 'bevel';

    for (let i = 0; i < steps; i++) {
      const t1 = i / steps;
      const t2 = (i + 1) / steps;
      const segX1 = p1.x + dx * t1;
      const segY1 = p1.y + dy * t1;
      const segX2 = p1.x + dx * t2;
      const segY2 = p1.y + dy * t2;
      const segWidth = w1 + (w2 - w1) * t1;
      const segOpacity = o1 + (o2 - o1) * t1;

      // Broad chisel ribbon
      ctx.strokeStyle = color;
      ctx.globalAlpha = segOpacity;
      ctx.lineWidth = segWidth;
      ctx.beginPath();
      ctx.moveTo(segX1, segY1);
      ctx.lineTo(segX2, segY2);
      ctx.stroke();

      // Subtle edge bleed for realistic marker ink soak
      ctx.globalAlpha = segOpacity * 0.32;
      ctx.lineWidth = segWidth + 2.5;
      ctx.beginPath();
      ctx.moveTo(segX1, segY1);
      ctx.lineTo(segX2, segY2);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Render eraser stroke with dynamic width
  const drawEraserSegment = (
    ctx: CanvasRenderingContext2D, 
    p1: ChalkPoint, 
    p2: ChalkPoint, 
    defaultWidth: number = 28
  ) => {
    const w1 = p1.width ?? defaultWidth;
    const w2 = p2.width ?? defaultWidth;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(distance / 2.5));

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < steps; i++) {
      const t1 = i / steps;
      const t2 = (i + 1) / steps;
      const segX1 = p1.x + dx * t1;
      const segY1 = p1.y + dy * t1;
      const segX2 = p1.x + dx * t2;
      const segY2 = p1.y + dy * t2;
      const segWidth = w1 + (w2 - w1) * t1;

      ctx.lineWidth = segWidth * 1.6;
      ctx.beginPath();
      ctx.moveTo(segX1, segY1);
      ctx.lineTo(segX2, segY2);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Re-draw all strokes onto the canvas
  const renderAllStrokes = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    for (const stroke of strokes) {
      if (stroke.points.length === 0) continue;

      // Handle single tap marks (dabs)
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        const w = p.width ?? stroke.width;
        const o = p.opacity ?? 0.85;
        if (stroke.tool === 'chalk') {
          ctx.save();
          ctx.fillStyle = stroke.color;
          ctx.globalAlpha = o;
          ctx.beginPath();
          ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (stroke.tool === 'highlighter') {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = stroke.color;
          ctx.globalAlpha = o;
          ctx.fillRect(p.x - w / 2, p.y - 6, w, 12);
          ctx.restore();
        }
        continue;
      }

      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1];
        const p2 = stroke.points[i];

        if (stroke.tool === 'highlighter') {
          drawHighlighterSegment(ctx, p1, p2, stroke.color, stroke.width);
        } else if (stroke.tool === 'eraser') {
          drawEraserSegment(ctx, p1, p2, stroke.width);
        } else {
          drawChalkSegment(ctx, p1, p2, stroke.color, stroke.width);
        }
      }
    }
  };

  // Handle Canvas Resize with pixel ratio
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set display size (css pixels).
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Set actual size in memory (scaled to account for extra pixel density).
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    // Normalize coordinate system to use css pixels.
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      renderAllStrokes(ctx, rect.width, rect.height);
    }
  }, [strokes]);

  useEffect(() => {
    setupCanvas();
    const observer = new ResizeObserver(() => {
      setupCanvas();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [setupCanvas]);

  // Pointer drawing events with velocity & pressure dynamics
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isToolActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.clientY;
    const now = performance.now();

    setIsDrawing(true);

    const initialStyle = computeDynamicStrokeStyle(activeTool, 0, e.pressure);
    lastPointRef.current = { 
      x, 
      y, 
      time: now, 
      velocity: 0, 
      width: initialStyle.width, 
      opacity: initialStyle.opacity 
    };

    const strokeColor = activeTool === 'highlighter' ? activeColor.highlightHex : activeColor.hex;

    const initialPoint: ChalkPoint = { 
      x, 
      y, 
      pressure: e.pressure, 
      velocity: 0, 
      width: initialStyle.width, 
      opacity: initialStyle.opacity, 
      time: now 
    };

    const newStroke: ChalkStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tool: activeTool,
      color: strokeColor,
      width: initialStyle.width,
      points: [initialPoint],
    };

    currentStrokeRef.current = newStroke;

    // Draw immediate tactile touch dab (so taps on canvas leave authentic marks)
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (activeTool === 'chalk') {
        ctx.save();
        ctx.fillStyle = strokeColor;
        ctx.globalAlpha = initialStyle.opacity;
        ctx.beginPath();
        ctx.arc(x, y, initialStyle.width / 2, 0, Math.PI * 2);
        ctx.fill();
        for (let s = 0; s < 3; s++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * (initialStyle.width / 2 + 1.2);
          ctx.globalAlpha = Math.random() * 0.4 + 0.2;
          ctx.fillRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 1.2, 1.2);
        }
        ctx.restore();
      } else if (activeTool === 'highlighter') {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = strokeColor;
        ctx.globalAlpha = initialStyle.opacity;
        ctx.fillRect(x - initialStyle.width / 2, y - 6, initialStyle.width, 12);
        ctx.restore();
      }
    }

    // Start acoustic simulation modulated by tactile touch
    startChalkStrokeSound(activeTool, 0.6);
    playChalkTapSound();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStrokeRef.current || !canvasRef.current || !lastPointRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.clientY;
    const now = performance.now();

    const dt = Math.max(6, now - lastPointRef.current.time);
    const dist = Math.hypot(x - lastPointRef.current.x, y - lastPointRef.current.y);

    // Skip redundant micro-jitter movements
    if (dist < 0.6) return;

    const rawVelocity = dist / dt; // px/ms
    // Smooth velocity with exponential moving average (EMA)
    const prevVelocity = lastPointRef.current.velocity;
    const smoothedVelocity = prevVelocity * 0.60 + rawVelocity * 0.40;

    // Calculate dynamic style: slow stroke = wider + more opaque; fast = tapered + lighter
    const dynamicStyle = computeDynamicStrokeStyle(activeTool, smoothedVelocity, e.pressure);

    // Update acoustic friction sound based on speed and opacity
    updateChalkStrokeSound(smoothedVelocity * 10, dynamicStyle.opacity);

    const stroke = currentStrokeRef.current;
    const prevPoint = stroke.points[stroke.points.length - 1];
    const newPoint: ChalkPoint = { 
      x, 
      y, 
      pressure: e.pressure, 
      velocity: smoothedVelocity, 
      width: dynamicStyle.width, 
      opacity: dynamicStyle.opacity, 
      time: now 
    };

    stroke.points.push(newPoint);

    // Draw segment immediately with velocity-varying thickness and opacity
    if (stroke.tool === 'highlighter') {
      drawHighlighterSegment(ctx, prevPoint, newPoint, stroke.color, stroke.width);
    } else if (stroke.tool === 'eraser') {
      drawEraserSegment(ctx, prevPoint, newPoint, stroke.width);
    } else {
      drawChalkSegment(ctx, prevPoint, newPoint, stroke.color, stroke.width);
    }

    lastPointRef.current = { 
      x, 
      y, 
      time: now, 
      velocity: smoothedVelocity, 
      width: dynamicStyle.width, 
      opacity: dynamicStyle.opacity 
    };
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    stopChalkStrokeSound();

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      setStrokes((prev) => [...prev, currentStrokeRef.current!]);
    }
    currentStrokeRef.current = null;
    lastPointRef.current = null;
  };

  // Erase all custom chalk strokes with tactile wipe
  const handleWipeAll = () => {
    startChalkStrokeSound('eraser', 1.0);
    setTimeout(() => stopChalkStrokeSound(), 350);
    setStrokes([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  // Undo last stroke
  const handleUndo = () => {
    playChalkTapSound();
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderAllStrokes(ctx, canvas.width, canvas.height);
        }
      }
      return next;
    });
  };

  const handleToggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setChalkAudioMuted(nextMuted);
    if (!nextMuted) {
      playChalkTapSound();
    }
  };

  const handleTriggerPresetReplay = () => {
    setAnimatingPresets(true);
    startChalkStrokeSound('chalk', 0.5);
    setTimeout(() => {
      stopChalkStrokeSound();
      setAnimatingPresets(false);
    }, 850);
  };

  const togglePresetsVisibility = (val: boolean) => {
    setShowPresets(val);
    onTogglePresets?.(val);
    if (val) {
      handleTriggerPresetReplay();
    } else {
      playChalkTapSound();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-10 pointer-events-none select-none overflow-hidden ${className}`}
    >
      {/* 1. Realistic Preset Handwritten Annotations Layer */}
      {showPresets && presets.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={`chalk-roughen-${cardId}`} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>

          {presets.map((preset) => {
            const color = preset.color || '#facc15';
            const strokeDashClass = animatingPresets ? 'animate-chalk-draw' : '';

            if (preset.type === 'highlight') {
              // Textured chisel highlighter bar
              return (
                <g key={preset.id} className="transition-opacity duration-300">
                  <rect
                    x={`${preset.x || 10}%`}
                    y={`${preset.y || 20}%`}
                    width={`${preset.width || 40}%`}
                    height="20px"
                    rx="3"
                    fill={color}
                    fillOpacity="0.45"
                    style={{ mixBlendMode: 'multiply' }}
                    filter={`url(#chalk-roughen-${cardId})`}
                    transform={`rotate(${preset.rotation || -0.8} ${preset.x || 10} ${preset.y || 20})`}
                  />
                  {/* Grainy chalk edge streak */}
                  <line
                    x1={`${preset.x || 10}%`}
                    y1={`${(preset.y || 20) + 1}%`}
                    x2={`${(preset.x || 10) + (preset.width || 40)}%`}
                    y2={`${(preset.y || 20) + 1}%`}
                    stroke={color}
                    strokeWidth="1.5"
                    strokeOpacity="0.75"
                    strokeDasharray="4 2 8 3"
                  />
                </g>
              );
            }

            if (preset.type === 'underline') {
              // Wavy, textured hand-drawn underline
              const xStart = preset.x || 15;
              const xEnd = xStart + (preset.width || 50);
              const yPos = preset.y || 80;
              const pathD = `M ${xStart}% ${yPos}% Q ${(xStart + xEnd) / 2}% ${yPos + 2.5}%, ${xEnd}% ${yPos + 0.5}%`;

              return (
                <g key={preset.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    filter={`url(#chalk-roughen-${cardId})`}
                    className={strokeDashClass}
                    style={{
                      strokeDasharray: '300',
                      strokeDashoffset: animatingPresets ? '300' : '0',
                    }}
                  />
                  {/* Complementary double-strike chalk flourish */}
                  <path
                    d={`M ${xStart + 4}% ${yPos + 2.2}% Q ${(xStart + xEnd) / 2}% ${yPos + 3.8}%, ${xEnd - 2}% ${yPos + 1.8}%`}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                    strokeLinecap="round"
                    strokeDasharray="5 3 10 2"
                  />
                </g>
              );
            }

            if (preset.type === 'circle') {
              // Loose, overlapping chalk loop around a stat
              const cx = preset.x || 50;
              const cy = preset.y || 50;
              const rx = (preset.width || 30) / 2;
              const ry = (preset.height || 24) / 2;

              return (
                <g key={preset.id} transform={`rotate(${preset.rotation || -2.5} ${cx} ${cy})`}>
                  <ellipse
                    cx={`${cx}%`}
                    cy={`${cy}%`}
                    rx={`${rx}%`}
                    ry={`${ry}%`}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeDasharray="380"
                    filter={`url(#chalk-roughen-${cardId})`}
                    className={strokeDashClass}
                    style={{
                      strokeDashoffset: animatingPresets ? '380' : '0',
                    }}
                  />
                  {/* Overlapping tail */}
                  <path
                    d={`M ${cx + rx * 0.7}% ${cy - ry * 0.7}% C ${cx + rx * 0.95}% ${cy}%, ${cx + rx * 0.4}% ${cy + ry * 0.95}%, ${cx - rx * 0.2}% ${cy + ry * 1.05}%`}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeOpacity="0.8"
                    strokeLinecap="round"
                    filter={`url(#chalk-roughen-${cardId})`}
                  />
                </g>
              );
            }

            if (preset.type === 'arrow') {
              // Hand-drawn arrow with chalk dust
              const sx = preset.x || 70;
              const sy = preset.y || 30;
              const ex = sx - 15;
              const ey = sy + 12;

              return (
                <g key={preset.id}>
                  <path
                    d={`M ${sx}% ${sy}% Q ${(sx + ex) / 2 - 4}% ${(sy + ey) / 2 + 6}%, ${ex}% ${ey}%`}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    filter={`url(#chalk-roughen-${cardId})`}
                  />
                  {/* Arrowhead */}
                  <path
                    d={`M ${ex + 3}% ${ey - 5}% L ${ex}% ${ey}% L ${ex + 6}% ${ey - 1}%`}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={`url(#chalk-roughen-${cardId})`}
                  />
                </g>
              );
            }

            return null;
          })}
        </svg>
      )}

      {/* Preset Handwritten Text Notes & Marginalia */}
      {showPresets && presets.map((preset) => {
        if (preset.type !== 'note' || !preset.text) return null;
        return (
          <div
            key={preset.id}
            className="absolute font-chalk text-base tracking-wide select-none pointer-events-none drop-shadow-2xs transition-all duration-300"
            style={{
              left: `${preset.x || 15}%`,
              top: `${preset.y || 15}%`,
              color: preset.color || '#f59e0b',
              transform: `rotate(${preset.rotation || -3}deg)`,
            }}
          >
            <span className="bg-amber-50/80 px-1.5 py-0.5 rounded border border-amber-200/60 shadow-2xs font-bold flex items-center gap-1 text-[13px] sm:text-[14px]">
              {preset.text}
            </span>
          </div>
        );
      })}

      {/* 2. Interactive Freehand Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`absolute inset-0 w-full h-full ${
          isToolActive 
            ? 'pointer-events-auto cursor-crosshair active:cursor-crosshair' 
            : 'pointer-events-none'
        }`}
        style={{
          touchAction: isToolActive ? 'none' : 'auto',
        }}
      />

      {/* 3. Sleek In-Card Chalk Interaction Pill & Toolset */}
      {interactive && (
        <div className="absolute top-3 right-3 z-30 pointer-events-auto flex items-center gap-1.5">
          {/* Main Quick-Action Button */}
          <button
            type="button"
            onClick={() => {
              const next = !isToolActive;
              setIsToolActive(next);
              setShowToolbar(next);
              playChalkTapSound();
            }}
            title={isToolActive ? 'Exit chalk annotation mode' : 'Annotate card with chalk & highlighter'}
            aria-label="Toggle chalk annotation mode"
            className={`px-2 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 transition-all duration-200 border shadow-xs cursor-pointer ${
              isToolActive
                ? 'bg-amber-400 text-neutral-950 border-amber-500 font-bold scale-105 ring-2 ring-amber-400/40 shadow-md'
                : 'bg-white/90 hover:bg-white text-neutral-700 hover:text-neutral-950 border-neutral-300/80 backdrop-blur-md hover:shadow-xs'
            }`}
          >
            <Highlighter className="w-3 h-3 text-amber-600" />
            <span className="hidden sm:inline">{isToolActive ? 'Chalk Active' : 'Chalk Annotate'}</span>
            <span className="sm:hidden">{isToolActive ? 'Done' : 'Draw'}</span>
            {strokes.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[9px] flex items-center justify-center font-mono font-bold">
                {strokes.length}
              </span>
            )}
          </button>

          {/* Quick Presets Toggle Badge */}
          {presets.length > 0 && (
            <button
              type="button"
              onClick={() => togglePresetsVisibility(!showPresets)}
              title={showPresets ? 'Hide handwritten annotations' : 'Show handwritten annotations'}
              aria-label="Toggle handwritten highlights"
              className={`p-1.5 rounded-full text-neutral-600 hover:text-neutral-950 border transition-all duration-200 cursor-pointer ${
                showPresets
                  ? 'bg-amber-100/90 border-amber-300 text-amber-900 shadow-2xs'
                  : 'bg-white/80 border-neutral-300/70 hover:bg-white'
              }`}
            >
              {showPresets ? <Eye className="w-3 h-3 text-amber-700" /> : <EyeOff className="w-3 h-3 text-neutral-400" />}
            </button>
          )}

          {/* Collapsible Chalk Studio Floating Panel */}
          {isToolActive && (
            <div className="absolute top-9 right-0 mt-1.5 p-2 bg-white/95 backdrop-blur-xl rounded-2xl border border-neutral-300/90 shadow-2xl flex flex-col gap-2 z-40 min-w-[220px] text-neutral-800 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-1.5 border-b border-neutral-200 text-[11px] font-mono text-neutral-500">
                <span className="flex items-center gap-1 font-bold text-neutral-800">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Tactile Chalk Tools
                </span>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  title={isMuted ? 'Unmute chalk scratch audio' : 'Mute chalk scratch audio'}
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-500 hover:text-neutral-800 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3 text-emerald-600" />}
                </button>
              </div>

              {/* Tool Pickers: Highlighter / Chalk Stick / Felt Eraser */}
              <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-xl text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('highlighter');
                    playChalkTapSound();
                  }}
                  className={`py-1 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                    activeTool === 'highlighter'
                      ? 'bg-white text-neutral-950 font-bold shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Highlighter className="w-3 h-3 text-amber-500" />
                  Highlight
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('chalk');
                    playChalkTapSound();
                  }}
                  className={`py-1 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                    activeTool === 'chalk'
                      ? 'bg-white text-neutral-950 font-bold shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <PenTool className="w-3 h-3 text-sky-500" />
                  Chalk
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('eraser');
                    playChalkTapSound();
                  }}
                  className={`py-1 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                    activeTool === 'eraser'
                      ? 'bg-white text-neutral-950 font-bold shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Eraser className="w-3 h-3 text-rose-500" />
                  Eraser
                </button>
              </div>

              {/* Color Swatches */}
              {activeTool !== 'eraser' && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono uppercase text-neutral-400 font-semibold">Chalk Color:</span>
                  <div className="flex items-center gap-1.5">
                    {CHALK_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setActiveColor(c);
                          playChalkTapSound();
                        }}
                        title={c.label}
                        className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${
                          activeColor.id === c.id
                            ? 'scale-115 border-neutral-950 shadow-xs ring-1 ring-neutral-400'
                            : 'border-neutral-300 hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {activeColor.id === c.id && (
                          <Check className={`w-2.5 h-2.5 ${c.id === 'white' || c.id === 'yellow' ? 'text-black' : 'text-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tactile Dynamics Indicator: Velocity & Pressure Sensitivity */}
              <div className="bg-neutral-50 border border-neutral-200/90 rounded-lg p-1.5 flex flex-col gap-1 text-[10px] font-mono text-neutral-600">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Tactile Dynamics
                  </span>
                  <span className="text-[9px] text-neutral-400">Velocity-Responsive</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-neutral-500 pt-0.5 border-t border-neutral-200/60">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-800/80" /> Slow: Thick & Rich
                  </span>
                  <span className="flex items-center gap-1">
                    Fast: Taper & Light <span className="inline-block w-1.5 h-0.5 rounded-full bg-neutral-400" />
                  </span>
                </div>
              </div>

              {/* Action Buttons: Undo & Wipe */}
              <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={handleWipeAll}
                  disabled={strokes.length === 0}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer font-medium"
                >
                  <Trash2 className="w-3 h-3" />
                  Wipe Clean
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
