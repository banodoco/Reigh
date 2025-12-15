import { useState, useEffect, useRef, useCallback } from 'react';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { useLocation } from 'react-router-dom';
import { PANE_CONFIG } from '@/shared/config/panes';

interface UseSlidingPaneOptions {
  side: 'left' | 'right' | 'bottom';
  isLocked: boolean;
  onToggleLock: () => void;
  additionalRefs?: React.RefObject<HTMLElement>[];
}

export const useSlidingPane = ({ side, isLocked, onToggleLock, additionalRefs }: UseSlidingPaneOptions) => {
  const [isOpen, setIsOpen] = useState(isLocked);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // On tablets, use desktop-like behavior with pane locking
  // On phones (small mobile), use simplified mobile behavior without locking
  const isSmallMobile = isMobile && !isTablet;
  const location = useLocation();

  const setOpen = useCallback((open: boolean) => {
    // On small phones (not tablets), don't use locks at all - just manage open state
    if (isSmallMobile) {
      setIsOpen(open);
      return;
    }

    // Desktop and tablet behavior (original)
    if (isLocked && !open) {
      // If locked, don't allow programmatic close via hover
      return;
    }

    setIsOpen(open);
  }, [isLocked, side, isSmallMobile]);

  // Sync open state with lock state (all devices including mobile)
  useEffect(() => {
    // Locked panes are always open, unlocked panes close
    if (isLocked) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isLocked]);

  // Close pane on route change (small phones only)
  useEffect(() => {
    if (isSmallMobile) {
      setIsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Lock body scroll when pane is open on small phones (both temporary and locked states)
  // When locked, Layout.tsx handles creating a scrollable main content area instead
  useEffect(() => {
    if (!isSmallMobile) return;
    
    if (isOpen) {
      // Store original overflow style
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      
      // Lock body scroll - Layout.tsx creates separate scroll containers for split view
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      
      return () => {
        // Restore original styles
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isSmallMobile, isOpen]);

  // Click outside handler for small phones (only when not locked)
  useEffect(() => {
    // Don't close on click outside if pane is locked
    if (!isSmallMobile || !isOpen || isLocked) return;

    const handleClickOutside = (event: MouseEvent | PointerEvent) => {
      const targetEl = event.target as HTMLElement;
      // Ignore if click is on any pane-control opener/closer
      if (targetEl.closest('[data-pane-control]')) {
        return; // allow event to proceed
      }
      
      // Ignore clicks on Radix UI portal elements (Select, Popover, Dialog, etc.)
      // These are rendered outside the pane but should be considered "inside" for interaction purposes
      if (
        targetEl.closest('[data-radix-select-content]') ||
        targetEl.closest('[data-radix-select-viewport]') ||
        targetEl.closest('[data-radix-popper-content-wrapper]') ||
        targetEl.closest('[data-radix-popover-content]') ||
        targetEl.closest('[data-radix-dialog-content]') ||
        targetEl.closest('[role="listbox"]') // fallback for select dropdowns
      ) {
        return; // allow event to proceed, don't close pane
      }

      if (paneRef.current && !paneRef.current.contains(targetEl) && !additionalRefs?.some(ref => ref.current?.contains(targetEl))) {
        // Prevent the click from triggering underlying UI actions
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => document.removeEventListener('pointerdown', handleClickOutside, true);
  }, [isSmallMobile, isOpen, isLocked, additionalRefs]);

  // Close on dragstart anywhere (small phones)
  useEffect(() => {
    if (!isSmallMobile) return;

    const handleDragStart = () => {
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('dragstart', handleDragStart);
    return () => document.removeEventListener('dragstart', handleDragStart);
  }, [isSmallMobile, isOpen]);

  // Exclusive pane coordination on small phones
  // When another pane opens, this one should close (locking the other will handle unlocking this via PanesContext)
  useEffect(() => {
    if (!isSmallMobile) return;

    const handleMobilePaneOpen = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ side: string | null }>;
      const openedSide = customEvt.detail?.side ?? null;
      if (openedSide !== side && !isLocked) {
        // Another pane (or null) requested and we're not locked – close this one
        setIsOpen(false);
      }
      // Note: If this pane IS locked, PanesContext will handle unlocking it
      // when the other pane gets locked (only one can be locked at a time on mobile)
    };

    window.addEventListener('mobilePaneOpen', handleMobilePaneOpen as EventListener);
    return () => window.removeEventListener('mobilePaneOpen', handleMobilePaneOpen as EventListener);
  }, [isSmallMobile, side, isLocked]);

  const openPane = () => {
    if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
    }

    if (isSmallMobile) {
      // Dispatch global event so other panes close immediately
      const evt = new CustomEvent('mobilePaneOpen', { detail: { side } });
      window.dispatchEvent(evt);
    }
    setOpen(true);
  }

  const handlePaneLeave = () => {
    // No hover behavior on small phones
    if (isSmallMobile) return;
    
    if (isLocked) return;
    leaveTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, PANE_CONFIG.timing.HOVER_DELAY);
  };

  const handlePaneEnter = () => {
    // No hover behavior on small phones
    if (isSmallMobile) return;
    
    if (isLocked) return;
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const toggleLock = (force?: boolean) => {
    // Allow locking on all devices including mobile
    if (force !== undefined) {
      // Force to specific state - used by UI buttons
      if (force !== isLocked) {
        onToggleLock();
      }
    } else {
      // Toggle current state
      onToggleLock();
    }
  };
  
  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  const getTransformClass = () => {
    // Pane is visible if open OR locked (all devices)
    const isVisible = isOpen || isLocked;
    
    switch (side) {
      case 'left':
        return isVisible ? 'translate-x-0' : '-translate-x-full';
      case 'right':
        return isVisible ? 'translate-x-0' : 'translate-x-full';
      case 'bottom':
        return isVisible ? 'translate-y-0' : 'translate-y-full';
      default:
        return '';
    }
  };

  const paneProps = {
    ref: paneRef,
    onMouseEnter: handlePaneEnter,
    onMouseLeave: handlePaneLeave,
  };

  return {
    isLocked, // Return actual lock state on all devices
    isOpen,
    toggleLock,
    openPane,
    paneProps,
    transformClass: getTransformClass(),
    handlePaneEnter,
    handlePaneLeave,
    isMobile, // Still return isMobile for backward compatibility
  };
}; 