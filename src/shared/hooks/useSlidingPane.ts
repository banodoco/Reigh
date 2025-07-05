import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSlidingPaneOptions {
  side: 'left' | 'right' | 'bottom';
  isLocked: boolean;
  onToggleLock: () => void;
}

export const useSlidingPane = ({ side, isLocked, onToggleLock }: UseSlidingPaneOptions) => {
  const [isOpen, setIsOpen] = useState(isLocked);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setOpen = useCallback((open: boolean) => {
    if (isLocked && !open) {
      // If locked, don't allow programmatic close via hover
      return;
    }
    console.log(`[PaneLockDebug] [${side}] setOpen(${open}) called (isLocked: ${isLocked})`);
    setIsOpen(open);
  }, [isLocked, side]);

  // Sync open state with lock state
  useEffect(() => {
    if (isLocked) {
      setIsOpen(true); // Locked panes are always open
    } else {
      setIsOpen(false); // Unlocked panes should close immediately
    }
  }, [isLocked]);

  const openPane = () => {
    if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
    }
    console.log(`[PaneLockDebug] [${side}] openPane()`);
    setOpen(true);
  }

  const handlePaneLeave = () => {
    if (isLocked) return;
    leaveTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 300);
  };

  const handlePaneEnter = () => {
    if (isLocked) return;
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const toggleLock = (force?: boolean) => {
    if (force !== undefined) {
      // Force to specific state - used by UI buttons
      if (force !== isLocked) {
        console.log(`[PaneLockDebug] [${side}] toggleLock -> ${force}`);
        onToggleLock();
      }
    } else {
      // Toggle current state
      console.log(`[PaneLockDebug] [${side}] toggleLock -> ${!isLocked}`);
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
    onMouseEnter: handlePaneEnter,
    onMouseLeave: handlePaneLeave,
  };

  return {
    isLocked,
    isOpen,
    toggleLock,
    openPane,
    paneProps,
    transformClass: getTransformClass(),
    handlePaneEnter,
    handlePaneLeave,
  };
}; 