import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSlidingPaneOptions {
  onLockStateChange?: (isLocked: boolean) => void;
  side: 'left' | 'right' | 'bottom';
  isInitiallyLocked?: boolean;
}

export const useSlidingPane = ({ onLockStateChange, side, isInitiallyLocked = false }: UseSlidingPaneOptions) => {
  const [isOpen, setIsOpen] = useState(isInitiallyLocked);
  const [isLocked, setIsLocked] = useState(isInitiallyLocked);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setOpen = useCallback((open: boolean) => {
    if (isLocked && !open) {
      // If locked, don't allow programmatic close via hover (unless unlocking)
      return;
    }
    setIsOpen(open);
  }, [isLocked]);

  useEffect(() => {
    onLockStateChange?.(isLocked);
  }, [isLocked, onLockStateChange]);

  const handleHotZoneEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (!isLocked) {
      setOpen(true);
    }
  };

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
    setOpen(true);
  };

  const toggleLock = () => {
    const newLockState = !isLocked;
    setIsLocked(newLockState);
    if (newLockState) {
      setOpen(true); // Ensure pane is open when locked
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

  const hotZoneProps = {
    onMouseEnter: handleHotZoneEnter,
  };

  const paneProps = {
    onMouseEnter: handlePaneEnter,
    onMouseLeave: handlePaneLeave,
  };

  return {
    isLocked,
    isOpen,
    toggleLock,
    hotZoneProps,
    paneProps,
    transformClass: getTransformClass(),
  };
}; 