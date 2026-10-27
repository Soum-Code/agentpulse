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

// In short: the class for each part of the chat. Until 27 Oct this returned different Tailwind
// colours per palette (and a dark amber chat in Butter). Now every class is one of the .rag-*
// classes in index.css, whose colours come from CSS variables set per palette, tint and Chalk
// surface on .rag-root; so the same names work in every palette and the chat follows the rest of
// the site. Calm mode is the data-rag-calm attribute on the root (RagChatbotApp). The arguments are
// kept so the callers (and the modals) need no change.
const RAG_THEME: RagThemeConfig = {
  containerBg: 'rag-page',
  headerBg: 'rag-bar',
  headerBorder: 'rag-divider',
  textColor: 'rag-text',
  subtextColor: 'rag-text-2',
  accentText: 'rag-accent-text',
  accentBg: 'rag-accent-soft',
  accentBorder: 'rag-accent-border',
  panelBorder: 'rag-divider',
  cardBg: 'rag-card',
  cardBorder: 'rag-border',
  cardActiveBorder: 'rag-card-selected',
  inputBg: 'rag-input',
  inputBorder: 'rag-border',
  inputText: 'rag-text',
  inputPlaceholder: 'rag-placeholder',
  userBubbleBg: 'rag-bubble-user',
  userBubbleText: '',
  userBubbleBorder: '',
  assistantBubbleBg: 'rag-card rag-bubble-assistant',
  assistantBubbleText: 'rag-text',
  assistantBubbleBorder: 'rag-border',
  codeBg: 'rag-well',
  codeBorder: 'rag-divider',
  statusPillBg: 'rag-accent-soft',
  statusPillBorder: 'rag-accent-border',
  statusPillText: 'rag-accent-text',
  divider: 'rag-divider',
  glowClass: '',
};

export function getRagTheme(
  _palette: ColorPalette | string = 'dark',
  _isCalmMode: boolean = false,
  _chalkSurface: ChalkSurfacePreset | string = 'classic-white'
): RagThemeConfig {
  return RAG_THEME;
}
