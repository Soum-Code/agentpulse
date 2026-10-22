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
