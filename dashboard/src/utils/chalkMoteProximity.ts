/**
 * Chalk Tactile Surface: Ambient Dust-Mote Mouse-Proximity Physics
 * 
 * Provides interactive cursor proximity dispersion for .chalk-tactile-card pseudo-elements (::before & ::after).
 * When the user moves their cursor over a chalk card:
 * 1. Particles dynamically disperse away from the cursor coordinate in 2D space.
 * 2. Fine dust motes (::before) respond with swift, low-mass displacement and micro-rotation.
 * 3. Ambient larger motes (::after) respond with deeper parallax repulsion and subtle scale dilation.
 * 4. A localized radial clearance pocket gently disperses particles directly beneath the cursor.
 * 5. Clicks trigger a subtle tactile dust disturbance puff.
 * 6. Smoothly eases back to undisturbed Brownian drift when the cursor exits.
 * 7. Fully complies with prefers-reduced-motion accessibility standards.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initChalkMoteProximityListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  let currentCard: HTMLElement | null = null;
  let currentRect: DOMRect | null = null;
  let rafId: number | null = null;
  let isPressed = false;

  const resetCardMotes = (card: HTMLElement) => {
    card.style.setProperty('--mote-disperse-x1', '0px');
    card.style.setProperty('--mote-disperse-y1', '0px');
    card.style.setProperty('--mote-disperse-x2', '0px');
    card.style.setProperty('--mote-disperse-y2', '0px');
    card.style.setProperty('--mote-scale1', '1');
    card.style.setProperty('--mote-scale2', '1');
    card.style.setProperty('--mote-rot1', '0deg');
    card.style.setProperty('--mote-rot2', '0deg');
    card.style.setProperty('--mouse-x', '-9999px');
    card.style.setProperty('--mouse-y', '-9999px');
    card.style.setProperty('--mote-active', '0');
  };

  const updateMotePhysics = (card: HTMLElement, clientX: number, clientY: number, forceBurst = false) => {
    if (prefersReducedMotion()) return;

    if (!currentRect) {
      currentRect = card.getBoundingClientRect();
    }

    const rect = currentRect;
    if (rect.width === 0 || rect.height === 0) return;

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Normalized position from center (-1 to 1)
    const rawNormX = (mouseX - centerX) / (rect.width / 2);
    const rawNormY = (mouseY - centerY) / (rect.height / 2);
    const normX = Math.max(-1.1, Math.min(1.1, rawNormX));
    const normY = Math.max(-1.1, Math.min(1.1, rawNormY));

    // Distance factor (0 at center, ~1.41 at corners)
    const dist = Math.sqrt(normX * normX + normY * normY);

    // Repulsion vector: particles shift AWAY from cursor
    const pushX = -normX;
    const pushY = -normY;

    // Amplitude multipliers (increased during click burst)
    const multiplier = forceBurst ? 1.55 : 1.0;

    // Layer 1 (fine particles): swift, subtle repulsion
    const disperseX1 = (pushX * 18 * multiplier).toFixed(2);
    const disperseY1 = (pushY * 18 * multiplier).toFixed(2);
    const scale1 = (1 + Math.min(dist, 1) * 0.028 * multiplier).toFixed(3);
    const rot1 = (-normX * 1.8 * multiplier).toFixed(2);

    // Layer 2 (larger motes): deeper parallax repulsion
    const disperseX2 = (pushX * 32 * multiplier).toFixed(2);
    const disperseY2 = (pushY * 32 * multiplier).toFixed(2);
    const scale2 = (1 + Math.min(dist, 1) * 0.048 * multiplier).toFixed(3);
    const rot2 = (normY * 2.4 * multiplier).toFixed(2);

    card.style.setProperty('--mote-disperse-x1', `${disperseX1}px`);
    card.style.setProperty('--mote-disperse-y1', `${disperseY1}px`);
    card.style.setProperty('--mote-disperse-x2', `${disperseX2}px`);
    card.style.setProperty('--mote-disperse-y2', `${disperseY2}px`);
    card.style.setProperty('--mote-scale1', scale1);
    card.style.setProperty('--mote-scale2', scale2);
    card.style.setProperty('--mote-rot1', `${rot1}deg`);
    card.style.setProperty('--mote-rot2', `${rot2}deg`);
    card.style.setProperty('--mouse-x', `${mouseX.toFixed(1)}px`);
    card.style.setProperty('--mouse-y', `${mouseY.toFixed(1)}px`);
    card.style.setProperty('--mote-active', '1');
  };

  const handlePointerOver = (e: PointerEvent | MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const card = target.closest<HTMLElement>('.chalk-tactile-card');
    if (card && card !== currentCard) {
      if (currentCard && !card.contains(currentCard)) {
        resetCardMotes(currentCard);
      }
      currentCard = card;
      currentRect = card.getBoundingClientRect();
      updateMotePhysics(card, e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: PointerEvent | MouseEvent) => {
    if (!currentCard) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      currentCard = target.closest<HTMLElement>('.chalk-tactile-card');
      if (currentCard) {
        currentRect = currentCard.getBoundingClientRect();
      }
    }

    if (currentCard) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const card = currentCard;
      const clientX = e.clientX;
      const clientY = e.clientY;

      rafId = requestAnimationFrame(() => {
        updateMotePhysics(card, clientX, clientY, isPressed);
      });
    }
  };

  const handlePointerOut = (e: PointerEvent | MouseEvent) => {
    if (!currentCard) return;
    const relatedTarget = (e as MouseEvent).relatedTarget as HTMLElement | null;
    if (!relatedTarget || !currentCard.contains(relatedTarget)) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      resetCardMotes(currentCard);
      currentCard = null;
      currentRect = null;
      isPressed = false;
    }
  };

  const handlePointerDown = (e: PointerEvent | MouseEvent) => {
    if (!currentCard) return;
    isPressed = true;
    updateMotePhysics(currentCard, e.clientX, e.clientY, true);
  };

  const handlePointerUp = (e: PointerEvent | MouseEvent) => {
    if (!currentCard) return;
    isPressed = false;
    updateMotePhysics(currentCard, e.clientX, e.clientY, false);
  };

  const handleScrollOrResize = () => {
    // Invalidate cached rect on scroll/resize
    currentRect = null;
  };

  // Add passive event listeners for best scroll & pointer performance
  window.addEventListener('pointerover', handlePointerOver, { passive: true });
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerout', handlePointerOut, { passive: true });
  window.addEventListener('pointerdown', handlePointerDown, { passive: true });
  window.addEventListener('pointerup', handlePointerUp, { passive: true });
  window.addEventListener('scroll', handleScrollOrResize, { passive: true });
  window.addEventListener('resize', handleScrollOrResize, { passive: true });

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (currentCard) {
      resetCardMotes(currentCard);
    }
    window.removeEventListener('pointerover', handlePointerOver);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerout', handlePointerOut);
    window.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('scroll', handleScrollOrResize);
    window.removeEventListener('resize', handleScrollOrResize);
  };
}
