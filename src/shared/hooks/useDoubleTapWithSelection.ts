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
  
  /** Threshold in ms for double-tap detection (default: 300) */
  doubleTapThreshold?: number;
  
  /** Delay in ms before executing single-tap (default: 250) */
  singleTapDelay?: number;
  
  /** Movement threshold in px to distinguish tap from scroll (default: 10) */
  scrollThreshold?: number;
}

export function useDoubleTapWithSelection({
  onSingleTap,
  onDoubleTap,
  itemId,
  disabled = false,
  doubleTapThreshold = 300,
  singleTapDelay = 250,
  scrollThreshold = 10,
}: UseDoubleTapWithSelectionProps) {
  
  // Track touch timing and position
  const lastTapTimeRef = useRef<number>(0);
  const lastTappedIdRef = useRef<string | null>(null);
  const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  }, [disabled]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled || !touchStartPosRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
    
    // Scroll detection: Ignore tap if user scrolled
    if (deltaX > scrollThreshold || deltaY > scrollThreshold) {
      touchStartPosRef.current = null;
      return;
    }
    
    // Clear any pending single-tap action (if a double-tap occurs)
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
    
    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    const isSameItem = lastTappedIdRef.current === itemId;
    
    // Double-tap detection: < 300ms between taps on same item
    if (timeDiff > 10 && timeDiff < doubleTapThreshold && isSameItem) {
      // Prevent default to avoid any unwanted behaviors
      e.preventDefault();
      
      // Execute double-tap action immediately
      onDoubleTap();
      
      // Reset refs to avoid triple taps chaining
      lastTapTimeRef.current = 0;
      lastTappedIdRef.current = null;
      touchStartPosRef.current = null;
      return;
    }
    
    // Single tap: Schedule action after delay to allow time for potential double-tap
    lastTapTimeRef.current = now;
    lastTappedIdRef.current = itemId;
    
    singleTapTimeoutRef.current = setTimeout(() => {
      onSingleTap();
      singleTapTimeoutRef.current = null;
    }, singleTapDelay);
    
    touchStartPosRef.current = null;
  }, [disabled, itemId, doubleTapThreshold, singleTapDelay, scrollThreshold, onSingleTap, onDoubleTap]);
  
  // Cleanup on unmount
  useRef(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
    };
  });
  
  return {
    handleTouchStart,
    handleTouchEnd,
  };
}

