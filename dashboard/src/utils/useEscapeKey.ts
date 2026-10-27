import { useEffect } from 'react';

/**
 * Calls `onEscape` when Escape is pressed while `active` is true. Used by dialogs that had no keyboard
 * way out (sign-in, project list). stopPropagation keeps the same key press from also reaching page
 * shortcuts that listen on window (for example the Traces search clear).
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [active, onEscape]);
}
