/** How long after G a second key still belongs to the "G then ..." navigation chords in App.tsx. */
export const CHORD_WINDOW_MS = 1200;

/** True when a key press is the second half of a G chord, so a page-level shortcut must leave it alone. */
export const isChordFollowUp = (lastGPressAt: number, now: number): boolean =>
  lastGPressAt > 0 && now - lastGPressAt < CHORD_WINDOW_MS;

/** True when the focused element is a field the user types or picks in, so a single-letter page shortcut must not fire. */
export const isTypingTarget = (el: Element | null | undefined): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  // jsdom does not implement isContentEditable, so read the attribute as well
  const attr = el.getAttribute('contenteditable');
  return attr !== null && attr !== 'false';
};
