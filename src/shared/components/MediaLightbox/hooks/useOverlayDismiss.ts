import { useRef, useCallback } from 'react';

interface UseOverlayDismissProps {
  onClose: () => void;
  isInpaintMode: boolean;
}

interface UseOverlayDismissReturn {
  /** Ref to track where pointer down started */
  pointerDownTargetRef: React.MutableRefObject<EventTarget | null>;
  /** Ref to track last tap time for double-tap detection */
  lastTapTimeRef: React.MutableRefObject<number>;
  /** Ref to track last tap target */
  lastTapTargetRef: React.MutableRefObject<EventTarget | null>;
  /** Ref to track where touch started */
  touchStartTargetRef: React.MutableRefObject<EventTarget | null>;
  /** Ref to track if touch started on overlay background */
  touchStartedOnOverlayRef: React.MutableRefObject<boolean>;
  /** Double tap delay constant in ms */
  DOUBLE_TAP_DELAY: number;
  /** Handler for pointer down on overlay */
  handleOverlayPointerDown: (e: React.PointerEvent) => void;
  /** Handler for click on overlay - closes if click started and ended on overlay */
  handleOverlayClick: (e: React.MouseEvent) => void;
  /** Handler for double click on overlay */
  handleOverlayDoubleClick: (e: React.MouseEvent) => void;
  /** Handler for touch start on overlay */
  handleOverlayTouchStart: (e: React.TouchEvent) => void;
  /** Handler for touch end on overlay - handles double-tap to close on mobile */
  handleOverlayTouchEnd: (e: React.TouchEvent) => void;
  /** Check if a higher z-index dialog is open (to avoid closing when nested dialogs are open) */
  hasHigherZIndexDialog: () => boolean;
}

/**
 * Hook to manage overlay click/tap dismissal behavior.
 * Handles both desktop (click) and mobile (double-tap) dismissal patterns.
 * Prevents accidental closure when dragging from inside the modal.
 */
export function useOverlayDismiss({
  onClose,
  isInpaintMode,
}: UseOverlayDismissProps): UseOverlayDismissReturn {
  // Track where pointer/click started to prevent accidental modal closure on drag
  const pointerDownTargetRef = useRef<EventTarget | null>(null);

  // Track double-tap on mobile/iPad
  const lastTapTimeRef = useRef<number>(0);
  const lastTapTargetRef = useRef<EventTarget | null>(null);
  const touchStartTargetRef = useRef<EventTarget | null>(null);
  const touchStartedOnOverlayRef = useRef<boolean>(false);

  const DOUBLE_TAP_DELAY = 300; // ms

  // Check if a higher z-index dialog is open
  const hasHigherZIndexDialog = useCallback((): boolean => {
    const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
    return Array.from(dialogOverlays).some((overlay) => {
      const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
      return zIndex > 100000;
    });
  }, []);

  const handleOverlayPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownTargetRef.current = e.target;
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // Check if a higher z-index dialog is open
    if (hasHigherZIndexDialog()) {
      return;
    }

    // Prevent closing when in inpaint mode to avoid accidental data loss
    if (isInpaintMode) {
      pointerDownTargetRef.current = null;
      return;
    }

    // Close on single click if both pointer down and click are on the overlay itself
    // This prevents accidental closure when dragging from inside the modal
    const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
    const clickEndedOnOverlay = e.target === e.currentTarget;

    if (clickStartedOnOverlay && clickEndedOnOverlay) {
      onClose();
    }

    pointerDownTargetRef.current = null;
  }, [onClose, isInpaintMode, hasHigherZIndexDialog]);

  const handleOverlayDoubleClick = useCallback((e: React.MouseEvent) => {
    if (hasHigherZIndexDialog()) {
      return;
    }

    if (isInpaintMode) {
      return;
    }

    // Only close if BOTH the click started AND ended on the overlay
    const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
    const clickEndedOnOverlay = e.target === e.currentTarget;

    if (clickStartedOnOverlay && clickEndedOnOverlay) {
      onClose();
    }
  }, [onClose, isInpaintMode, hasHigherZIndexDialog]);

  const handleOverlayTouchStart = useCallback((e: React.TouchEvent) => {
    // Track where touch started for double-tap detection
    touchStartTargetRef.current = e.target;

    // Check if touch started directly on overlay (for double-tap to close)
    const touchedDirectlyOnOverlay = e.target === e.currentTarget;
    touchStartedOnOverlayRef.current = touchedDirectlyOnOverlay;

    console.log('[TouchDebug] 👆 Touch started on OVERLAY:', {
      directlyOnOverlay: touchedDirectlyOnOverlay,
      targetTagName: (e.target as HTMLElement).tagName,
      targetClassName: (e.target as HTMLElement).className?.substring?.(0, 50),
      isInpaintMode,
      timestamp: Date.now()
    });
  }, [isInpaintMode]);

  const handleOverlayTouchEnd = useCallback((e: React.TouchEvent) => {
    if (hasHigherZIndexDialog()) {
      return;
    }

    // Prevent double-tap close when in inpaint mode
    if (isInpaintMode) {
      return;
    }

    // Only handle double-tap if touch started AND ended on overlay
    if (!touchStartedOnOverlayRef.current) {
      return;
    }

    const touchEndedOnOverlay = e.target === e.currentTarget;
    if (!touchEndedOnOverlay) {
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    const isSameTarget = lastTapTargetRef.current === e.currentTarget;

    console.log('[TouchDebug] 👆 Touch ended on OVERLAY:', {
      timeSinceLastTap,
      isSameTarget,
      isDoubleTap: timeSinceLastTap < DOUBLE_TAP_DELAY && isSameTarget,
      timestamp: now
    });

    if (timeSinceLastTap < DOUBLE_TAP_DELAY && isSameTarget) {
      console.log('[MediaLightbox] 📱 Double-tap detected on overlay, closing...');
      onClose();
      lastTapTimeRef.current = 0;
      lastTapTargetRef.current = null;
    } else {
      lastTapTimeRef.current = now;
      lastTapTargetRef.current = e.currentTarget;
    }
  }, [onClose, isInpaintMode, hasHigherZIndexDialog]);

  return {
    pointerDownTargetRef,
    lastTapTimeRef,
    lastTapTargetRef,
    touchStartTargetRef,
    touchStartedOnOverlayRef,
    DOUBLE_TAP_DELAY,
    handleOverlayPointerDown,
    handleOverlayClick,
    handleOverlayDoubleClick,
    handleOverlayTouchStart,
    handleOverlayTouchEnd,
    hasHigherZIndexDialog,
  };
}
