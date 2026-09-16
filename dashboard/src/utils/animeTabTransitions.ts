import { animate, stagger, spring, remove } from 'animejs';
import { prefersReducedMotion } from './liquidHoverAnime';

export interface TabRevealOptions {
  container: HTMLElement;
  tabKey?: string;
  onComplete?: () => void;
}

let activeAnimationTargets: HTMLElement[] = [];

/**
 * Clean inline animation styles so subsequent CSS transitions, hovers, and tilts remain unimpeded
 */
function cleanElementStyles(el: HTMLElement) {
  if (!el || !el.style) return;
  el.style.transform = '';
  el.style.opacity = '';
}

/**
 * Triggers a sophisticated, tactile Anime.js staggered reveal animation for cards and table rows
 * when switching between navigation tabs.
 * 
 * Design details:
 * 1. Cards Docking Phase: Cards float up from translateY(18px) and scale(0.975) with damped spring physics.
 * 2. Specular Shimmer Phase: Top specular highlight beams sweep horizontally with scaleX(0.5 -> 1.0).
 * 3. Table Rows Ledger Phase: Table/list rows cascade in with a crisp micro-stagger (translateY: 10px, translateX: -6px)
 *    giving the feel of high-precision hardware ledger items snapping into slot.
 * 4. Zero Style Residue: Inline transform/opacity styles are cleaned up on complete to ensure
 *    subsequent 3D hover tilts and CSS transitions remain unimpeded.
 * 5. Reduced Motion Compliant: Gracefully falls back to a clean 140ms opacity crossfade.
 */
export function triggerTabRevealAnimation({
  container,
  tabKey,
  onComplete
}: TabRevealOptions): void {
  if (typeof window === 'undefined' || !container) return;

  try {
    // 1. Abort any previous in-flight animations on existing elements to prevent conflicting transforms
    if (activeAnimationTargets.length > 0) {
      remove(activeAnimationTargets);
      activeAnimationTargets.forEach(el => cleanElementStyles(el));
      activeAnimationTargets = [];
    }

    const reducedMotion = prefersReducedMotion();

    // 2. Select card candidates
    // Includes explicit .anime-tab-card, standard .ios-liquid-card, interactive cards, and primary content surfaces
    const rawCards = Array.from(
      container.querySelectorAll<HTMLElement>(
        '.anime-tab-card, .ios-liquid-card, .ios-liquid-card-interactive, [data-anime-card="true"]'
      )
    );

    // Filter cards to top-level cards (don't nest cards if one card is inside another)
    const cards = rawCards.filter((card, idx, arr) => {
      const isVisible = card.offsetParent !== null || card.getBoundingClientRect().height > 0;
      if (!isVisible) return false;
      // Exclude if an ancestor in rawCards is already animating this container
      const isChildOfAnotherCard = arr.some(other => other !== card && other.contains(card));
      return !isChildOfAnotherCard;
    });

    // 3. Select table rows & list items
    // Includes explicit .anime-tab-row, table rows (tbody tr), .ios-liquid-row, and incident/stream cards
    const rawRows = Array.from(
      container.querySelectorAll<HTMLElement>(
        'table tbody tr, .anime-tab-row, .ios-liquid-row, .anime-incident-card, .telemetry-stream-item, [data-anime-row="true"]'
      )
    );

    const rows = rawRows.filter(row => {
      const isVisible = row.offsetParent !== null || row.getBoundingClientRect().height > 0;
      return isVisible;
    }).slice(0, 30); // Cap at 30 rows to guarantee snappy feel on dense data tables

    // 4. Accessibility fallback for prefers-reduced-motion
    if (reducedMotion) {
      const allTargets = [...cards, ...rows];
      activeAnimationTargets = allTargets;
      animate(allTargets, {
        opacity: [0, 1],
        duration: 140,
        ease: 'outQuad',
        complete: () => {
          allTargets.forEach(el => cleanElementStyles(el));
          activeAnimationTargets = [];
          onComplete?.();
        }
      });
      return;
    }

    // 5. Spatially sort cards (top-to-bottom, left-to-right) for an organic cascading reveal
    const sortedCards = [...cards].sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const rowDiff = rectA.top - rectB.top;
      if (Math.abs(rowDiff) < 20) {
        return rectA.left - rectB.left;
      }
      return rowDiff;
    });

    // Sort rows strictly vertically
    const sortedRows = [...rows].sort((a, b) => {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });

    const allAnimatedElements: HTMLElement[] = [...sortedCards, ...sortedRows];
    activeAnimationTargets = allAnimatedElements;

    // Track completion
    let cardsDone = sortedCards.length === 0;
    let rowsDone = sortedRows.length === 0;

    const checkAllComplete = () => {
      if (cardsDone && rowsDone) {
        allAnimatedElements.forEach(el => cleanElementStyles(el));
        activeAnimationTargets = [];
        onComplete?.();
      }
    };

    // 6. Phase 1: Animate Cards Elevation & Tactile Spring Docking
    if (sortedCards.length > 0) {
      animate(sortedCards, {
        opacity: [0, 1],
        translateY: [18, 0],
        scale: [0.978, 1],
        duration: 520,
        delay: stagger(38, { start: 15 }),
        ease: spring({ bounce: 0.14, duration: 520 }),
        complete: () => {
          cardsDone = true;
          checkAllComplete();
        }
      });

      // Animate specular highlight beams across top card rims
      const specularBeams = sortedCards
        .map(c => c.querySelector<HTMLElement>('.apple-liquid-specular, .liquid-specular-beam'))
        .filter(Boolean) as HTMLElement[];

      if (specularBeams.length > 0) {
        animate(specularBeams, {
          opacity: [0, 0.95, 0.45],
          scaleX: [0.5, 1],
          duration: 440,
          delay: stagger(38, { start: 70 }),
          ease: 'outCubic',
          complete: () => {
            specularBeams.forEach(s => cleanElementStyles(s));
          }
        });
      }
    } else {
      cardsDone = true;
    }

    // 7. Phase 2: Animate Table Rows with a Crisp Hardware Ledger Stagger
    if (sortedRows.length > 0) {
      animate(sortedRows, {
        opacity: [0, 1],
        translateY: [10, 0],
        translateX: [-8, 0],
        duration: 380,
        delay: stagger(26, { start: sortedCards.length > 0 ? 85 : 20 }),
        ease: 'outQuart',
        complete: () => {
          rowsDone = true;
          checkAllComplete();
        }
      });
    } else {
      rowsDone = true;
    }

    if (cardsDone && rowsDone) {
      checkAllComplete();
    }
  } catch (err) {
    console.debug('Anime.js tab reveal error:', err);
    onComplete?.();
  }
}

/**
 * Triggers a tactile spring button squeeze animation on click
 */
export function triggerTactileTabClick(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return;
  try {
    animate(element, {
      scale: [1, 0.88, 1.06, 1],
      duration: 340,
      ease: spring({ bounce: 0.36, duration: 340 }),
      complete: () => {
        cleanElementStyles(element);
      }
    });
  } catch {}
}
