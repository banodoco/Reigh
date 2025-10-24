import { useRef, useCallback } from 'react';

/**
 * useDoubleTapWithSelection - Generalized double-tap pattern from ShotEditor
 * 
 * Provides optimal mobile interaction:
 * - Single tap → Waits 250ms → Triggers onSingleTap (allows time for double-tap)
 * - Double-tap (< 300ms) → Immediately triggers onDoubleTap, cancels pending single-tap
 * - Scroll detection → Ignores taps if user scrolled > 10px
 * 
 * This pattern prevents conflicts between selection and opening items.
 * 
 * @example
 * ```tsx
 * const { handleTouchStart, handleTouchEnd } = useDoubleTapWithSelection({
 *   onSingleTap: () => toggleSelection(itemId),
 *   onDoubleTap: () => openLightbox(index),
 *   itemId: image.id,
 * });
 * 
 * <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
 *   {/* content *\/}
 * </div>
 * ```
 */

interface UseDoubleTapWithSelectionProps {
  /** Called after 250ms if no double-tap occurs */
  onSingleTap: () => void;
  
  /** Called immediately on double-tap detection */
  onDoubleTap: () => void;
  
  /** Unique identifier for the item (to detect same-item taps) */
  itemId: string;
  
  /** Disable all tap handling (e.g., for read-only mode) */
  disabled?: boolean;
  
  /** Threshold in ms for double-tap detection (default: 500 for tablets, more forgiving than mobile) */
  doubleTapThreshold?: number;
  
  /** Delay in ms before executing single-tap (default: 300, should be less than doubleTapThreshold) */
  singleTapDelay?: number;
  
  /** Movement threshold in px to distinguish tap from scroll (default: 10) */
  scrollThreshold?: number;
}

export function useDoubleTapWithSelection({
  onSingleTap,
  onDoubleTap,
  itemId,
  disabled = false,
  doubleTapThreshold = 800, // Very forgiving for tablet/touch interactions with potential lag
  // singleTapDelay no longer needed - kept for backward compatibility
  scrollThreshold = 10,
}: UseDoubleTapWithSelectionProps) {
  
  // Track touch timing and position
  const lastTapTimeRef = useRef<number>(0);
  const lastTappedIdRef = useRef<string | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    console.log('[DoubleTapFlow] 👆 Touch START:', {
      itemId: itemId.substring(0, 8),
      position: { x: touch.clientX, y: touch.clientY },
      disabled,
      timestamp: Date.now()
    });
  }, [disabled, itemId]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled || !touchStartPosRef.current) {
      console.log('[DoubleTapFlow] ⚠️ Touch END ignored:', {
        reason: disabled ? 'disabled' : 'no_touch_start',
        itemId: itemId.substring(0, 8)
      });
      return;
    }
    
    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
    
    console.log('[DoubleTapFlow] 👆 Touch END:', {
      itemId: itemId.substring(0, 8),
      movement: { deltaX, deltaY },
      scrollThreshold,
      position: { x: touch.clientX, y: touch.clientY }
    });
    
    // Scroll detection: Ignore tap if user scrolled
    if (deltaX > scrollThreshold || deltaY > scrollThreshold) {
      console.log('[DoubleTapFlow] 📜 SCROLL DETECTED - Ignoring tap:', {
        itemId: itemId.substring(0, 8),
        deltaX,
        deltaY,
        threshold: scrollThreshold
      });
      touchStartPosRef.current = null;
      return;
    }
    
    
    const now = Date.now();
    const lastTapTime = lastTapTimeRef.current;
    const timeDiff = lastTapTime === 0 ? Infinity : now - lastTapTime; // Handle initial state
    const isSameItem = lastTappedIdRef.current === itemId;
    
    console.log('[DoubleTapFlow] 🔍 Tap analysis:', {
      itemId: itemId.substring(0, 8),
      timeSinceLastTap: timeDiff === Infinity ? 'FIRST_TAP' : timeDiff,
      isSameItem,
      lastTappedId: lastTappedIdRef.current?.substring(0, 8),
      lastTapTime: lastTapTime === 0 ? 'never' : lastTapTime,
      doubleTapThreshold,
      isDoubleTap: timeDiff > 10 && timeDiff < doubleTapThreshold && isSameItem
    });
    
    // Double-tap detection: < 300ms between taps on same item
    if (timeDiff > 10 && timeDiff < doubleTapThreshold && isSameItem) {
      console.log('[DoubleTapFlow] 👆👆 DOUBLE-TAP DETECTED!', {
        itemId: itemId.substring(0, 8),
        timeDiff,
        threshold: doubleTapThreshold
      });
      
      // Prevent default to avoid any unwanted behaviors
      e.preventDefault();
      
      // Execute double-tap action immediately
      onDoubleTap();
      
      // Reset refs to avoid triple taps chaining
      lastTapTimeRef.current = 0;
      lastTappedIdRef.current = null;
      touchStartPosRef.current = null;
      
      console.log('[DoubleTapFlow] ✅ Double-tap handler executed, refs reset');
      return;
    }
    
    
    // Single tap: Execute IMMEDIATELY for instant visual feedback
    console.log('[DoubleTapFlow] ✅ Executing single-tap action IMMEDIATELY', {
      itemId: itemId.substring(0, 8)
    });
    
    onSingleTap();
    
    // Still track timing for potential double-tap detection
    lastTapTimeRef.current = now;
    lastTappedIdRef.current = itemId;
    
    touchStartPosRef.current = null;
  }, [disabled, itemId, doubleTapThreshold, scrollThreshold, onSingleTap, onDoubleTap]);
  
  
  return {
    handleTouchStart,
    handleTouchEnd,
  };
}

