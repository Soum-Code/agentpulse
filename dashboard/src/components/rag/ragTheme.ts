import type { ColorPalette, ChalkSurfacePreset } from '../../types';

export interface RagThemeConfig {
  containerBg: string;
  headerBg: string;
  headerBorder: string;
  textColor: string;
  subtextColor: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  panelBorder: string;
  cardBg: string;
  cardBorder: string;
  cardActiveBorder: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  userBubbleBg: string;
  userBubbleText: string;
  userBubbleBorder: string;
  assistantBubbleBg: string;
  assistantBubbleText: string;
  assistantBubbleBorder: string;
  codeBg: string;
  codeBorder: string;
  statusPillBg: string;
  statusPillBorder: string;
  statusPillText: string;
  divider: string;
  glowClass: string;
}

export function getRagTheme(
  palette: ColorPalette | string = 'dark',
  isCalmMode: boolean = false,
  chalkSurface: ChalkSurfacePreset | string = 'classic-white'
): RagThemeConfig {
  if (isCalmMode) {
    return {
      containerBg: 'bg-[#09090b]',
      headerBg: 'bg-[#121215]',
      headerBorder: 'border-zinc-800',
      textColor: 'text-zinc-200',
      subtextColor: 'text-zinc-400',
      accentText: 'text-zinc-100',
      accentBg: 'bg-zinc-800',
      accentBorder: 'border-zinc-700',
      panelBorder: 'border-zinc-800',
      cardBg: 'bg-[#18181b]/90',
      cardBorder: 'border-zinc-800',
      cardActiveBorder: 'border-zinc-500',
      inputBg: 'bg-[#121215]',
      inputBorder: 'border-zinc-700',
      inputText: 'text-zinc-100',
      inputPlaceholder: 'placeholder:text-zinc-500',
      userBubbleBg: 'bg-zinc-800',
      userBubbleText: 'text-zinc-100',
      userBubbleBorder: 'border-zinc-700',
      assistantBubbleBg: 'bg-[#18181b]',
      assistantBubbleText: 'text-zinc-200',
      assistantBubbleBorder: 'border-zinc-800',
      codeBg: 'bg-[#0e0e11]',
      codeBorder: 'border-zinc-800',
      statusPillBg: 'bg-zinc-800/80',
      statusPillBorder: 'border-zinc-700',
      statusPillText: 'text-zinc-300',
      divider: 'border-zinc-800',
      glowClass: 'shadow-[0_0_12px_rgba(255,255,255,0.04)]',
    };
  }

  if (palette === 'butter') {
    return {
      containerBg: 'bg-[#121008]',
      headerBg: 'bg-[#1a170a]',
      headerBorder: 'border-amber-500/30',
      textColor: 'text-amber-50',
      subtextColor: 'text-amber-200/70',
      accentText: 'text-amber-300',
      accentBg: 'bg-amber-400/15',
      accentBorder: 'border-amber-400/50',
      panelBorder: 'border-amber-500/25',
      cardBg: 'bg-[#1e1a0c]/90',
      cardBorder: 'border-amber-500/25',
      cardActiveBorder: 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.2)]',
      inputBg: 'bg-[#181509]',
      inputBorder: 'border-amber-500/35 focus:border-amber-400',
      inputText: 'text-amber-100',
      inputPlaceholder: 'placeholder:text-amber-300/40',
      userBubbleBg: 'bg-amber-400 text-neutral-950 font-medium shadow-md',
      userBubbleText: 'text-neutral-950',
      userBubbleBorder: 'border-amber-300',
      assistantBubbleBg: 'bg-[#1c180b]',
      assistantBubbleText: 'text-amber-50',
      assistantBubbleBorder: 'border-amber-500/30',
      codeBg: 'bg-[#0f0d06]',
      codeBorder: 'border-amber-500/30',
      statusPillBg: 'bg-amber-400/20',
      statusPillBorder: 'border-amber-400/40',
      statusPillText: 'text-amber-300',
      divider: 'border-amber-500/20',
      glowClass: 'shadow-[0_0_20px_rgba(251,191,36,0.15)]',
    };
  }

  if (palette === 'chalk') {
    let chalkBg = 'bg-[#ffffff]';
    let chalkCard = 'bg-[#ffffff]';
    let chalkHeader = 'bg-white/95';
    let chalkBorder = 'border-slate-200';

    if (chalkSurface === 'sepia-slate') {
      chalkBg = 'bg-[#f5efe6]';
      chalkCard = 'bg-[#faf6ee]';
      chalkHeader = 'bg-[#f5efe6]/95';
      chalkBorder = 'border-[#dfd4c3]';
    } else if (chalkSurface === 'emerald-graphite') {
      chalkBg = 'bg-[#eaf2ec]';
      chalkCard = 'bg-[#f3f9f5]';
      chalkHeader = 'bg-[#eaf2ec]/95';
      chalkBorder = 'border-[#c2dccb]';
    }

    return {
      containerBg: chalkBg,
      headerBg: chalkHeader,
      headerBorder: chalkBorder,
      textColor: 'text-slate-900',
      subtextColor: 'text-slate-600',
      accentText: 'text-cyan-700',
      accentBg: 'bg-cyan-50',
      accentBorder: 'border-cyan-300',
      panelBorder: chalkBorder,
      cardBg: chalkCard,
      cardBorder: chalkBorder,
      cardActiveBorder: 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.18)]',
      inputBg: 'bg-white',
      inputBorder: `${chalkBorder} focus:border-cyan-600`,
      inputText: 'text-slate-900',
      inputPlaceholder: 'placeholder:text-slate-400',
      userBubbleBg: 'bg-slate-900 text-white shadow-sm',
      userBubbleText: 'text-white',
      userBubbleBorder: 'border-slate-800',
      assistantBubbleBg: chalkCard,
      assistantBubbleText: 'text-slate-900',
      assistantBubbleBorder: chalkBorder,
      codeBg: 'bg-slate-100/90',
      codeBorder: chalkBorder,
      statusPillBg: 'bg-cyan-50',
      statusPillBorder: 'border-cyan-200',
      statusPillText: 'text-cyan-800',
      divider: chalkBorder,
      glowClass: 'shadow-sm',
    };
  }

  // Default: Dark (Cyber Obsidian)
  return {
    containerBg: 'bg-[#06070a]',
    headerBg: 'bg-[#080b11]',
    headerBorder: 'border-white/10',
    textColor: 'text-neutral-100',
    subtextColor: 'text-neutral-400',
    accentText: 'text-cyan-300',
    accentBg: 'bg-cyan-500/15',
    accentBorder: 'border-cyan-500/40',
    panelBorder: 'border-white/10',
    cardBg: 'bg-white/[0.03]',
    cardBorder: 'border-white/10',
    cardActiveBorder: 'border-cyan-500/50 shadow-[0_0_16px_rgba(6,182,212,0.15)]',
    inputBg: 'bg-[#090d15]',
    inputBorder: 'border-white/10 focus:border-cyan-500/50',
    inputText: 'text-neutral-100',
    inputPlaceholder: 'placeholder:text-neutral-500',
    userBubbleBg: 'bg-cyan-500/15 border-cyan-500/40 text-neutral-100',
    userBubbleText: 'text-neutral-100',
    userBubbleBorder: 'border-cyan-500/40',
    assistantBubbleBg: 'bg-[#0c1017]',
    assistantBubbleText: 'text-neutral-200',
    assistantBubbleBorder: 'border-white/10',
    codeBg: 'bg-[#040609]',
    codeBorder: 'border-white/10',
    statusPillBg: 'bg-cyan-950/80',
    statusPillBorder: 'border-cyan-500/40',
    statusPillText: 'text-cyan-300',
    divider: 'border-white/10',
    glowClass: 'shadow-[0_0_16px_rgba(6,182,212,0.2)]',
  };
}
