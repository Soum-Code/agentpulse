import { animate, spring } from 'animejs';

/**
 * Timing-controlled Anime.js spring animation, 3D perspective tilt, Magnetic Snap,
 * automated 400ms hover vertical expansion, and floating entrance animations for .ios-liquid-card-interactive elements.
 * 
 * Interactivity features:
 * - Reduced Motion Awareness: Complies with 'prefers-reduced-motion: reduce' media query, disabling tilt & spring physics for clean, reduced-duration opacity transitions.
 * - Staggered Sequential Cascade: Soft spatial top-down/left-right sequential entrance with Anime.js spring physics.
 * - 3D Perspective Tilt: Rotates card axes (rotateX, rotateY) and raises on Z plane.
 * - Magnetic Snap: Dynamically shifts internal card content towards the cursor position in 3D space.
 * - Dynamic 400ms Hover Expansion: Auto-expands truncated text (line-clamps/truncations) when hovered > 400ms.
 * - Liquid Spring Physics: Damped spring recovery with physics restitution on exit.
 */

let hoverExpansionTimer: ReturnType<typeof setTimeout> | null = null;
let currentHoveredCard: HTMLElement | null = null;

/**
 * Checks whether the user/system has enabled 'prefers-reduced-motion'.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Triggers an Anime.js sequential staggered entrance animation for .ios-liquid-card-interactive elements.
 * Sorts elements by spatial grid position (top-to-bottom, left-to-right) and applies a cascading
 * spring float from translateY(22px) and scale(0.965) to 1.0 with liquid specular shimmer.
 * If 'prefers-reduced-motion' is active, bypasses spring/scale/translate physics and executes
 * a lightweight, fast opacity transition for full accessibility compliance.
 */
export function triggerCardEntranceAnimation(container?: HTMLElement | null, forceAll = false) {
  if (typeof window === 'undefined') return;

  try {
    const root = container || document;
    const allCards = Array.from(root.querySelectorAll<HTMLElement>('.ios-liquid-card-interactive'));
    
    // Filter visible cards that haven't animated yet (or force re-animation if requested)
    const targetCards = allCards.filter(card => {
      const isVisible = card.offsetParent !== null || card.getBoundingClientRect().height > 0;
      return isVisible && (forceAll || card.dataset.animeEntered !== 'true');
    });

    if (targetCards.length === 0) return;

    const reducedMotion = prefersReducedMotion();

    // Spatially sort cards based on viewport position (top-to-bottom, then left-to-right)
    // to create an organic liquid wave cascade across bento grids & columns
    const sortedCards = [...targetCards].sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const rowDiff = rectA.top - rectB.top;
      // If items are roughly on the same row (within 18px), sort by left position
      if (Math.abs(rowDiff) < 18) {
        return rectA.left - rectB.left;
      }
      return rowDiff;
    });

    // Mark as entered
    sortedCards.forEach(card => {
      card.dataset.animeEntered = 'true';
    });

    // Accessibility fallback: Simple, rapid opacity transition without motion or spring bounce
    if (reducedMotion) {
      animate(sortedCards, {
        opacity: [0, 1],
        duration: 150,
        ease: 'easeOutQuad',
        complete: () => {
          sortedCards.forEach(card => {
            card.style.transform = '';
            card.style.opacity = '';
          });
        }
      });
      return;
    }

    // 1. Primary Card Cascade: Immediate upward float + spring expansion without artificial delay
    animate(sortedCards, {
      opacity: [0, 1],
      translateY: [14, 0],
      scale: [0.985, 1],
      duration: 260,
      delay: 0,
      ease: spring({ bounce: 0.10, duration: 260 }),
      complete: () => {
        // Clear inline styles once settled so 3D perspective hover tilt operates cleanly
        sortedCards.forEach(card => {
          card.style.transform = '';
          card.style.opacity = '';
        });
      }
    });

    // 2. Liquid Specular Beam Sweep: Immediate shimmer across top card rims
    const specularElements = sortedCards
      .map(card => card.querySelector<HTMLElement>('.apple-liquid-specular'))
      .filter(Boolean) as HTMLElement[];

    if (specularElements.length > 0) {
      animate(specularElements, {
        opacity: [0, 0.9, 0.45],
        scaleX: [0.8, 1],
        duration: 260,
        delay: 0,
        ease: 'easeOutCubic',
        complete: () => {
          specularElements.forEach(spec => {
            spec.style.transform = '';
            spec.style.opacity = '';
          });
        }
      });
    }

    // 3. Internal Badges & Focal Nodes: Immediate crisp fade-in
    sortedCards.forEach((card) => {
      const subBadges = card.querySelectorAll<HTMLElement>('.rounded-md, .rounded-lg, nav, [class*="badge"]');
      if (subBadges.length > 0) {
        animate(subBadges, {
          opacity: [0.4, 1],
          translateY: [4, 0],
          duration: 200,
          delay: 0,
          ease: 'easeOutQuad',
          complete: () => {
            subBadges.forEach(b => {
              b.style.transform = '';
              b.style.opacity = '';
            });
          }
        });
      }
    });

  } catch (err) {
    console.debug('Anime.js card stagger entrance error:', err);
  }
}

/**
 * Inspects the card for truncated text and smoothly animates vertical expansion if present.
 */
export function checkAndExpandCardContent(card: HTMLElement) {
  try {
    if (!card || !document.body.contains(card)) return;

    // Find candidate truncated / clamped elements
    const candidates = card.querySelectorAll<HTMLElement>(
      '[class*="line-clamp"], .truncate, .liquid-card-label, .liquid-card-title'
    );

    let hasExpandedAny = false;
    const reducedMotion = prefersReducedMotion();

    candidates.forEach((el) => {
      // Check if already unclamped
      if (el.classList.contains('ios-liquid-text-unclamped')) return;

      const initialHeight = el.offsetHeight;
      if (initialHeight <= 0) return;

      // Temporarily mark as unclamped to measure natural expanded height
      el.classList.add('ios-liquid-text-unclamped');
      const expandedHeight = el.scrollHeight;

      // If the content is indeed truncated (natural expanded height > clamped height)
      if (expandedHeight > initialHeight + 2) {
        hasExpandedAny = true;
        el.dataset.origHeight = String(initialHeight);
        el.style.overflow = 'hidden';

        // Animate vertical text expansion using anime.js (spring easing or reduced duration)
        animate(el, {
          height: [initialHeight, expandedHeight],
          duration: reducedMotion ? 140 : 320,
          ease: reducedMotion ? 'easeOutQuad' : spring({ bounce: 0.12, duration: 320 }),
          complete: () => {
            if (card.dataset.cardExpanded === 'true') {
              el.style.height = 'auto';
              el.style.overflow = 'visible';
            }
          }
        });
      } else {
        // Not truncated, remove temporary class
        el.classList.remove('ios-liquid-text-unclamped');
      }
    });

    if (hasExpandedAny) {
      card.classList.add('ios-liquid-card-expanded');
      card.dataset.cardExpanded = 'true';

      // Subtle specular shimmer pulse to accentuate the expanded information surface
      const specular = card.querySelector<HTMLElement>('.apple-liquid-specular');
      if (specular && !reducedMotion) {
        animate(specular, {
          opacity: [0.7, 1.0, 0.85],
          duration: 350,
          ease: 'easeOutQuad'
        });
      }
    }
  } catch (err) {
    console.debug('Anime.js expansion error:', err);
  }
}

/**
 * Collapses any previously expanded text elements back to their original clamped state.
 */
export function collapseCardContent(card: HTMLElement) {
  try {
    if (!card) return;

    if (hoverExpansionTimer !== null) {
      clearTimeout(hoverExpansionTimer);
      hoverExpansionTimer = null;
    }

    const reducedMotion = prefersReducedMotion();

    if (card.dataset.cardExpanded === 'true') {
      card.dataset.cardExpanded = 'false';
      card.classList.remove('ios-liquid-card-expanded');

      const unclampedElements = card.querySelectorAll<HTMLElement>('.ios-liquid-text-unclamped');
      unclampedElements.forEach((el) => {
        const origHeight = parseFloat(el.dataset.origHeight || '0');
        const currentHeight = el.offsetHeight;
        el.style.overflow = 'hidden';

        if (origHeight > 0) {
          animate(el, {
            height: [currentHeight, origHeight],
            duration: reducedMotion ? 120 : 260,
            ease: 'easeOutQuad',
            complete: () => {
              el.classList.remove('ios-liquid-text-unclamped');
              el.style.height = '';
              el.style.overflow = '';
              delete el.dataset.origHeight;
            }
          });
        } else {
          el.classList.remove('ios-liquid-text-unclamped');
          el.style.height = '';
          el.style.overflow = '';
          delete el.dataset.origHeight;
        }
      });
    }
  } catch (err) {
    console.debug('Anime.js collapse error:', err);
  }
}

export function animateCardHoverEnter(el: HTMLElement) {
  try {
    currentHoveredCard = el;

    // Clear any pending expansion timer
    if (hoverExpansionTimer !== null) {
      clearTimeout(hoverExpansionTimer);
      hoverExpansionTimer = null;
    }

    // Schedule 400ms hover vertical expansion check
    hoverExpansionTimer = setTimeout(() => {
      if (currentHoveredCard === el) {
        checkAndExpandCardContent(el);
      }
    }, 400);

    const reducedMotion = prefersReducedMotion();

    if (reducedMotion) {
      // Accessibility mode: Clean opacity and border transition without 3D translation or spring bounce
      animate(el, {
        opacity: [parseFloat(getComputedStyle(el).opacity) || 0.94, 1.0],
        borderColor: 'rgba(255, 255, 255, 0.38)',
        filter: 'brightness(1.04)',
        duration: 140,
        ease: 'easeOutQuad'
      });
      return;
    }

    animate(el, {
      opacity: [parseFloat(getComputedStyle(el).opacity) || 0.94, 1.0],
      scale: 1.01,
      translateY: -3,
      translateZ: 14,
      borderColor: 'rgba(255, 255, 255, 0.38)',
      filter: 'brightness(1.08)',
      boxShadow:
        '0 38px 72px -12px rgba(0, 0, 0, 0.88), 0 16px 32px -4px rgba(0, 0, 0, 0.55), inset 0 2px 2.5px 0 rgba(255, 255, 255, 0.70), inset 0 0 0 1px rgba(255, 255, 255, 0.20), 0 0 35px -2px rgba(255, 255, 255, 0.12)',
      backdropFilter: 'blur(80px) saturate(250%) contrast(112%)',
      webkitBackdropFilter: 'blur(80px) saturate(250%) contrast(112%)',
      duration: 160,
      ease: 'easeOutQuad'
    });
  } catch (err) {
    console.debug('Anime.js spring enter:', err);
  }
}

export function animateCardTilt(el: HTMLElement, mouseX: number, mouseY: number) {
  try {
    // If reduced motion is requested, disable 3D tilt and magnetic parallax entirely
    if (prefersReducedMotion()) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Relative coordinates (-1 to 1 from center of card)
    const relX = ((mouseX - rect.left) / rect.width - 0.5) * 2;
    const relY = ((mouseY - rect.top) / rect.height - 0.5) * 2;

    // Clamp range
    const clampedX = Math.max(-1, Math.min(1, relX));
    const clampedY = Math.max(-1, Math.min(1, relY));

    // Calculate 3D tilt angles (max ~9.5 degrees on X and Y)
    const tiltX = -clampedY * 8.5; // Up/down tilt
    const tiltY = clampedX * 9.5;  // Left/right tilt

    // Dynamic light reflection / brightness based on elevation & tilt proximity
    const distanceToCenter = Math.sqrt(clampedX * clampedX + clampedY * clampedY);
    const dynamicBrightness = 1.06 + Math.min(0.08, distanceToCenter * 0.06);

    // Dynamic directional shadow cast based on 3D tilt
    const shadowOffsetX = -clampedX * 14;
    const shadowOffsetY = 32 - clampedY * 12;
    const dynamicBoxShadow = `${shadowOffsetX}px ${shadowOffsetY}px 70px -10px rgba(0, 0, 0, 0.90), ${shadowOffsetX * 0.5}px ${shadowOffsetY * 0.5}px 32px -4px rgba(0, 0, 0, 0.60), inset 0 2.5px 3px 0 rgba(255, 255, 255, 0.75), inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 36px -2px rgba(255, 255, 255, 0.14)`;

    // 1. Animate Outer Card 3D Tilt with dynamic shadow casting & brightness amplification (immediate response)
    animate(el, {
      rotateX: tiltX,
      rotateY: tiltY,
      translateZ: 18,
      translateY: -5,
      scale: 1.016,
      opacity: 1.0,
      filter: `brightness(${dynamicBrightness.toFixed(3)})`,
      boxShadow: dynamicBoxShadow,
      duration: 80,
      ease: 'easeOutQuad'
    });

    // 2. Magnetic Snap: Pull internal content layers towards cursor with spatial parallax
    const contentChildren = el.querySelectorAll<HTMLElement>(':scope > *:not(.apple-liquid-specular)');
    if (contentChildren.length > 0) {
      const magX = clampedX * 8.0;
      const magY = clampedY * 6.5;

      animate(contentChildren, {
        translateX: magX,
        translateY: magY,
        translateZ: 22,
        duration: 90,
        ease: 'easeOutQuad'
      });
    }

    // 3. Deeper magnetic pull for badges, icons, and micro-metrics
    const focalElements = el.querySelectorAll<HTMLElement>('svg, .rounded-lg, .rounded-md, [class*="font-mono"]');
    if (focalElements.length > 0) {
      const focalMagX = clampedX * 11.0;
      const focalMagY = clampedY * 8.5;

      animate(focalElements, {
        translateX: focalMagX,
        translateY: focalMagY,
        translateZ: 28,
        duration: 90,
        ease: 'easeOutQuad'
      });
    }
  } catch (err) {
    console.debug('Anime.js tilt error:', err);
  }
}

export function animateCardHoverLeave(el: HTMLElement) {
  try {
    if (currentHoveredCard === el) {
      currentHoveredCard = null;
    }

    // Cancel timer and collapse any expanded content
    collapseCardContent(el);

    const reducedMotion = prefersReducedMotion();

    if (reducedMotion) {
      // Accessibility mode: reset opacity and borders smoothly without spring bounce
      animate(el, {
        opacity: [parseFloat(getComputedStyle(el).opacity) || 1.0, 0.94],
        filter: 'brightness(1.0)',
        borderColor: 'rgba(255, 255, 255, 0.16)',
        rotateX: 0,
        rotateY: 0,
        translateZ: 0,
        translateY: 0,
        scale: 1.0,
        duration: 100,
        ease: 'easeOutQuad',
        complete: () => {
          el.style.transform = '';
        }
      });
      return;
    }

    // 1. Reset Card 3D transform and spring back to rest immediately
    animate(el, {
      rotateX: 0,
      rotateY: 0,
      translateZ: 0,
      translateY: 0,
      scale: 1.0,
      opacity: [parseFloat(getComputedStyle(el).opacity) || 1.0, 0.94],
      filter: 'brightness(1.0)',
      borderColor: 'rgba(255, 255, 255, 0.16)',
      boxShadow:
        '0 24px 54px -12px rgba(0, 0, 0, 0.75), 0 10px 20px -4px rgba(0, 0, 0, 0.4), inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.42), inset 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 -1.5px 2px 0 rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(64px) saturate(230%) contrast(108%)',
      webkitBackdropFilter: 'blur(64px) saturate(230%) contrast(108%)',
      duration: 180,
      ease: 'easeOutQuad',
      complete: () => {
        el.style.transform = '';
      }
    });

    // 2. Magnetic Snap Reset: Spring internal content back to true center
    const contentChildren = el.querySelectorAll<HTMLElement>(':scope > *:not(.apple-liquid-specular)');
    if (contentChildren.length > 0) {
      animate(contentChildren, {
        translateX: 0,
        translateY: 0,
        translateZ: 0,
        duration: 180,
        ease: 'easeOutQuad',
        complete: () => {
          contentChildren.forEach(child => {
            child.style.transform = '';
          });
        }
      });
    }

    // 3. Reset focal icons and badges
    const focalElements = el.querySelectorAll<HTMLElement>('svg, .rounded-lg, .rounded-md, [class*="font-mono"]');
    if (focalElements.length > 0) {
      animate(focalElements, {
        translateX: 0,
        translateY: 0,
        translateZ: 0,
        duration: 520,
        ease: spring({ bounce: 0.28, duration: 520 }),
        complete: () => {
          focalElements.forEach(focal => {
            focal.style.transform = '';
          });
        }
      });
    }
  } catch (err) {
    console.debug('Anime.js spring leave:', err);
  }
}

/**
 * Initializes global event delegation and entrance animations for all .ios-liquid-card-interactive elements
 * across the application, executing anime.js floating entrance, 3D perspective tilt, magnetic snap,
 * 400ms hover vertical expansion, & spring transitions.
 */
export function initLiquidCardSpringListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  let currentCard: HTMLElement | null = null;
  let rafId: number | null = null;
  let entranceDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Trigger entrance on initial mount
  requestAnimationFrame(() => {
    triggerCardEntranceAnimation();
  });

  // Watch for newly mounted cards when views or tabs switch
  const mutationObserver = new MutationObserver((mutations) => {
    let hasInteractiveCards = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (node.classList.contains('ios-liquid-card-interactive') || node.querySelector('.ios-liquid-card-interactive')) {
              hasInteractiveCards = true;
              break;
            }
          }
        }
      }
      if (hasInteractiveCards) break;
    }

    if (hasInteractiveCards) {
      if (entranceDebounceTimer !== null) clearTimeout(entranceDebounceTimer);
      entranceDebounceTimer = setTimeout(() => {
        triggerCardEntranceAnimation();
      }, 30);
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Listen to OS prefers-reduced-motion preference change dynamically
  const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const handleMediaChange = () => {
    if (prefersReducedMotion()) {
      // Clear any remaining transform styles immediately
      document.querySelectorAll<HTMLElement>('.ios-liquid-card-interactive').forEach(card => {
        card.style.transform = '';
      });
    }
  };

  if (mediaQuery?.addEventListener) {
    mediaQuery.addEventListener('change', handleMediaChange);
  } else if (mediaQuery?.addListener) {
    mediaQuery.addListener(handleMediaChange);
  }

  const handlePointerOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const card = target.closest<HTMLElement>('.ios-liquid-card-interactive');
    if (card && card !== currentCard) {
      if (currentCard && !card.contains(currentCard)) {
        animateCardHoverLeave(currentCard);
      }
      currentCard = card;
      animateCardHoverEnter(card);
    }
  };

  const handlePointerMove = (e: MouseEvent) => {
    if (!currentCard) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      currentCard = target.closest<HTMLElement>('.ios-liquid-card-interactive');
    }

    if (currentCard) {
      if (prefersReducedMotion()) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (currentCard) {
          animateCardTilt(currentCard, e.clientX, e.clientY);
        }
      });
    }
  };

  const handlePointerOut = (e: MouseEvent) => {
    if (!currentCard) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !currentCard.contains(relatedTarget)) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      animateCardHoverLeave(currentCard);
      currentCard = null;
    }
  };

  document.addEventListener('mouseover', handlePointerOver, { passive: true });
  document.addEventListener('mousemove', handlePointerMove, { passive: true });
  document.addEventListener('mouseout', handlePointerOut, { passive: true });

  return () => {
    mutationObserver.disconnect();
    if (mediaQuery?.removeEventListener) {
      mediaQuery.removeEventListener('change', handleMediaChange);
    } else if (mediaQuery?.removeListener) {
      mediaQuery.removeListener(handleMediaChange);
    }
    if (entranceDebounceTimer !== null) {
      clearTimeout(entranceDebounceTimer);
      entranceDebounceTimer = null;
    }
    if (hoverExpansionTimer !== null) {
      clearTimeout(hoverExpansionTimer);
      hoverExpansionTimer = null;
    }
    if (rafId !== null) cancelAnimationFrame(rafId);
    document.removeEventListener('mouseover', handlePointerOver);
    document.removeEventListener('mousemove', handlePointerMove);
    document.removeEventListener('mouseout', handlePointerOut);
  };
}

