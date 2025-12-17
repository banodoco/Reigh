import { useState, useRef, useCallback } from 'react';

/**
 * useSwipeNavigation - Horizontal swipe gesture for lightbox navigation
 * 
 * Provides touch/pointer-based swipe navigation for mobile and iPad devices.
 * Features:
 * - Horizontal swipe detection with threshold and velocity
 * - Visual offset feedback during swipe
 * - Automatic detection of interactive elements to avoid conflicts
 * - Vertical scroll detection to avoid interfering with scrollable areas
 * - Elastic resistance when no next/previous available
 * 
 * @example
 * ```tsx
 * const swipe = useSwipeNavigation({
 *   onSwipeLeft: () => goNext(),
 *   onSwipeRight: () => goPrevious(),
 *   disabled: isEditMode,
 *   hasNext: true,
 *   hasPrevious: true,
 * });
 * 
 * <div {...swipe.swipeHandlers} style={{ transform: `translateX(${swipe.swipeOffset}px)` }}>
 *   {content}
 * </div>
 * ```
 */

export interface UseSwipeNavigationProps {
  /** Called when user swipes left (navigate to next) */
  onSwipeLeft?: () => void;
  /** Called when user swipes right (navigate to previous) */
  onSwipeRight?: () => void;
  /** Disable swipe gestures entirely */
  disabled?: boolean;
  /** Minimum distance in pixels to trigger navigation (default: 50) */
  threshold?: number;
  /** Minimum velocity (px/ms) for quick flick gestures (default: 0.3) */
  velocityThreshold?: number;
  /** Whether there's a next item (affects elastic resistance) */
  hasNext?: boolean;
  /** Whether there's a previous item (affects elastic resistance) */
  hasPrevious?: boolean;
  /** Maximum offset for elastic resistance when at edge (default: 80) */
  maxElasticOffset?: number;
}

export interface UseSwipeNavigationReturn {
  /** Handlers to spread on the swipeable element */
  swipeHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Current horizontal offset for visual feedback (in pixels) */
  swipeOffset: number;
  /** Whether the user is actively swiping */
  isSwiping: boolean;
}

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  pointerId: number;
  isLocked: boolean; // Once we determine direction, lock it
  isHorizontal: boolean | null; // null = undetermined, true = horizontal, false = vertical
}

/**
 * Check if an element or its ancestors should block swipe gestures
 */
function isInteractiveElement(el: HTMLElement | null): boolean {
  const interactiveTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'VIDEO'];
  const interactiveRoles = ['button', 'slider', 'textbox', 'link', 'scrollbar'];
  
  let current: HTMLElement | null = el;
  while (current) {
    // Check tag name
    if (interactiveTags.includes(current.tagName)) {
      return true;
    }
    
    // Check role attribute
    const role = current.getAttribute('role');
    if (role && interactiveRoles.includes(role)) {
      return true;
    }
    
    // Check for explicit no-swipe marker
    if (current.getAttribute('data-no-swipe') === 'true') {
      return true;
    }
    
    // Check for scrollable containers
    if (current.getAttribute('data-scrollable') === 'true') {
      return true;
    }
    
    // Check if element has overflow scroll
    const style = window.getComputedStyle(current);
    if (
      (style.overflowY === 'scroll' || style.overflowY === 'auto') &&
      current.scrollHeight > current.clientHeight
    ) {
      return true;
    }
    
    // Check for canvas (drawing surfaces)
    if (current.tagName === 'CANVAS') {
      return true;
    }
    
    // Check for radix primitives that should block swipe
    if (current.getAttribute('data-radix-scroll-area-viewport')) {
      return true;
    }
    
    current = current.parentElement;
  }
  
  return false;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
  threshold = 50,
  velocityThreshold = 0.3,
  hasNext = true,
  hasPrevious = true,
  maxElasticOffset = 80,
}: UseSwipeNavigationProps): UseSwipeNavigationReturn {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeStateRef = useRef<SwipeState | null>(null);
  
  // Apply elastic resistance at edges
  const applyElasticResistance = useCallback((deltaX: number): number => {
    // Swiping right (showing previous) but no previous
    if (deltaX > 0 && !hasPrevious) {
      // Apply strong resistance - logarithmic falloff
      return Math.sign(deltaX) * Math.min(maxElasticOffset, Math.abs(deltaX) * 0.3);
    }
    
    // Swiping left (showing next) but no next
    if (deltaX < 0 && !hasNext) {
      return Math.sign(deltaX) * Math.min(maxElasticOffset, Math.abs(deltaX) * 0.3);
    }
    
    // Normal case - apply mild resistance for visual feedback
    // Cap at a reasonable distance to indicate swipe direction
    const maxNormalOffset = 150;
    if (Math.abs(deltaX) > maxNormalOffset) {
      const excess = Math.abs(deltaX) - maxNormalOffset;
      return Math.sign(deltaX) * (maxNormalOffset + excess * 0.2);
    }
    
    return deltaX;
  }, [hasNext, hasPrevious, maxElasticOffset]);
  
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    
    // Only handle primary pointer (first finger/mouse button)
    if (!e.isPrimary) return;
    
    // Check if we should skip swipe for this target
    const target = e.target as HTMLElement;
    if (isInteractiveElement(target)) {
      console.log('[SwipeNav] Skipping - interactive element:', target.tagName);
      return;
    }
    
    console.log('[SwipeNav] Pointer down:', {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    });
    
    swipeStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      currentX: e.clientX,
      pointerId: e.pointerId,
      isLocked: false,
      isHorizontal: null,
    };
    
    // Capture the pointer for reliable tracking outside the element
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {
      // setPointerCapture may fail in some edge cases
      console.log('[SwipeNav] Could not capture pointer:', err);
    }
  }, [disabled]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const state = swipeStateRef.current;
    if (!state || !e.isPrimary || state.pointerId !== e.pointerId) return;
    
    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    // If direction not determined yet, check once we have enough movement
    if (!state.isLocked && (absDeltaX > 10 || absDeltaY > 10)) {
      // Determine if this is a horizontal or vertical gesture
      // Use a ratio to decide - if vertical movement is dominant, it's a scroll
      state.isHorizontal = absDeltaX > absDeltaY * 0.8;
      state.isLocked = true;
      
      console.log('[SwipeNav] Direction locked:', {
        isHorizontal: state.isHorizontal,
        deltaX,
        deltaY,
        ratio: absDeltaX / Math.max(absDeltaY, 1),
      });
      
      // If vertical, abort swipe and let normal scroll happen
      if (!state.isHorizontal) {
        swipeStateRef.current = null;
        setSwipeOffset(0);
        setIsSwiping(false);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }
    }
    
    // Only process horizontal swipes
    if (state.isLocked && state.isHorizontal) {
      // Prevent default to stop any scrolling
      e.preventDefault();
      
      state.currentX = e.clientX;
      
      // Apply elastic resistance and update offset
      const resistedOffset = applyElasticResistance(deltaX);
      setSwipeOffset(resistedOffset);
      setIsSwiping(true);
    }
  }, [applyElasticResistance]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const state = swipeStateRef.current;
    if (!state || !e.isPrimary || state.pointerId !== e.pointerId) return;
    
    const deltaX = e.clientX - state.startX;
    const duration = Math.max(Date.now() - state.startTime, 1);
    const velocity = Math.abs(deltaX) / duration;
    const absDeltaX = Math.abs(deltaX);
    
    console.log('[SwipeNav] Pointer up:', {
      deltaX,
      duration,
      velocity,
      threshold,
      velocityThreshold,
      isHorizontal: state.isHorizontal,
    });
    
    // Only trigger if we had a horizontal swipe
    if (state.isLocked && state.isHorizontal) {
      // Check if swipe meets threshold (distance or velocity)
      const metDistanceThreshold = absDeltaX >= threshold;
      const metVelocityThreshold = velocity >= velocityThreshold && absDeltaX > 20;
      
      if (metDistanceThreshold || metVelocityThreshold) {
        if (deltaX < 0 && hasNext) {
          // Swiped left -> go to next
          console.log('[SwipeNav] ✓ Triggering swipe LEFT (next)');
          onSwipeLeft?.();
        } else if (deltaX > 0 && hasPrevious) {
          // Swiped right -> go to previous
          console.log('[SwipeNav] ✓ Triggering swipe RIGHT (previous)');
          onSwipeRight?.();
        } else {
          console.log('[SwipeNav] ✗ Swipe direction blocked (no prev/next)');
        }
      } else {
        console.log('[SwipeNav] ✗ Swipe did not meet threshold');
      }
    }
    
    // Release pointer capture
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    
    // Reset state
    swipeStateRef.current = null;
    setSwipeOffset(0);
    setIsSwiping(false);
  }, [threshold, velocityThreshold, hasNext, hasPrevious, onSwipeLeft, onSwipeRight]);
  
  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    console.log('[SwipeNav] Pointer cancelled');
    
    // Release pointer capture
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    
    swipeStateRef.current = null;
    setSwipeOffset(0);
    setIsSwiping(false);
  }, []);
  
  return {
    swipeHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
    swipeOffset,
    isSwiping,
  };
}










