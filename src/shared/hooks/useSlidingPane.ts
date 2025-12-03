import { useState, useEffect, useRef, useCallback } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
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
  const location = useLocation();

  const setOpen = useCallback((open: boolean) => {
    // On mobile, don't use locks at all - just manage open state
    if (isMobile) {
      setIsOpen(open);
      return;
    }

    // Desktop behavior (original)
    if (isLocked && !open) {
      // If locked, don't allow programmatic close via hover
      return;
    }

    setIsOpen(open);
  }, [isLocked, side, isMobile]);

  // Sync open state with lock state (desktop only)
  useEffect(() => {
    if (isMobile) {
      // On mobile, always start closed
      setIsOpen(false);
      return;
    }

    // Desktop behavior (original)
    if (isLocked) {
      setIsOpen(true); // Locked panes are always open
    } else {
      setIsOpen(false); // Unlocked panes should close immediately
    }
  }, [isLocked, isMobile]);

  // Close pane on route change (mobile)
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Lock body scroll when pane is open on mobile to prevent scroll bleed-through
  useEffect(() => {
    if (!isMobile) return;
    
    if (isOpen) {
      // Store original overflow style
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      
      // Lock body scroll
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      
      return () => {
        // Restore original styles
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isMobile, isOpen]);

  // Click outside handler for mobile
  useEffect(() => {
    if (!isMobile || !isOpen) return;

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
  }, [isMobile, isOpen, additionalRefs]);

  // Close on dragstart anywhere (mobile)
  useEffect(() => {
    if (!isMobile) return;

    const handleDragStart = () => {
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('dragstart', handleDragStart);
    return () => document.removeEventListener('dragstart', handleDragStart);
  }, [isMobile, isOpen]);

  // Exclusive pane coordination on mobile
  useEffect(() => {
    if (!isMobile) return;

    const handleMobilePaneOpen = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ side: string | null }>;
      const openedSide = customEvt.detail?.side ?? null;
      if (openedSide !== side) {
        // Another pane (or null) requested – close this one
        setIsOpen(false);
      }
    };

    window.addEventListener('mobilePaneOpen', handleMobilePaneOpen as EventListener);
    return () => window.removeEventListener('mobilePaneOpen', handleMobilePaneOpen as EventListener);
  }, [isMobile, side]);

  const openPane = () => {
    if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
    }

    if (isMobile) {
      // Dispatch global event so other panes close immediately
      const evt = new CustomEvent('mobilePaneOpen', { detail: { side } });
      window.dispatchEvent(evt);
    }
    setOpen(true);
  }

  const handlePaneLeave = () => {
    // No hover behavior on mobile
    if (isMobile) return;
    
    if (isLocked) return;
    leaveTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, PANE_CONFIG.timing.HOVER_DELAY);
  };

  const handlePaneEnter = () => {
    // No hover behavior on mobile
    if (isMobile) return;
    
    if (isLocked) return;
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const toggleLock = (force?: boolean) => {
    // On mobile, don't use locks at all
    if (isMobile) return;

    // Desktop behavior (original)
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
    // On mobile, only use isOpen state
    const isVisible = isMobile ? isOpen : (isOpen || isLocked);
    
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
    isLocked: isMobile ? false : isLocked, // Always false on mobile
    isOpen,
    toggleLock,
    openPane,
    paneProps,
    transformClass: getTransformClass(),
    handlePaneEnter,
    handlePaneLeave,
    isMobile,
  };
}; 