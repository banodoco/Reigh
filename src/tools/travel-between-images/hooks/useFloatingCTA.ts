import { useState, useEffect, useRef, useCallback } from 'react';

interface UseFloatingCTAProps {
  timelineRef: React.RefObject<HTMLDivElement>;
  ctaRef: React.RefObject<HTMLDivElement>;
  hasActiveSelection: boolean;
  isMobile: boolean;
  enabled?: boolean;
}

interface UseFloatingCTAReturn {
  isFloating: boolean;
  showElement: boolean;
}

/**
 * Hook to manage floating CTA button visibility based on scroll position
 * Shows floating button when user is viewing timeline and original button is off-screen
 */
export const useFloatingCTA = ({
  timelineRef,
  ctaRef,
  hasActiveSelection,
  isMobile,
  enabled = true
}: UseFloatingCTAProps): UseFloatingCTAReturn => {
  const [isFloating, setIsFloating] = useState(false);
  const [showElement, setShowElement] = useState(true);
  const hasScrolledRef = useRef(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);
  // Track if CTA was floating before selection started (to restore after deselect)
  const wasFloatingBeforeSelectionRef = useRef(false);
  
  // Configuration constants
  const TRIGGER_BUFFER = isMobile ? 200 : 100;
  const TOP_THRESHOLD = 50;
  const PERSIST_BUFFER = 100;

  // Memoized check function that can be called immediately or on scroll
  const checkFloatingState = useCallback(() => {
    const timelineEl = timelineRef.current;
    const ctaEl = ctaRef.current;
    if (!timelineEl || !ctaEl) return;
    
    const timelineRect = timelineEl.getBoundingClientRect();
    const ctaRect = ctaEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    
    // Visibility conditions
    const userHasScrolled = hasScrolledRef.current;
    const notAtTop = scrollY > TOP_THRESHOLD;
    const timelineHasBeenViewed = timelineRect.top < (viewportHeight - TRIGGER_BUFFER);
    const ctaNotVisible = ctaRect.top > (viewportHeight - PERSIST_BUFFER);
    const noActiveSelection = !hasActiveSelection;
    
    const shouldFloat = userHasScrolled && notAtTop && timelineHasBeenViewed && ctaNotVisible && noActiveSelection;
    
    setIsFloating(shouldFloat);
  }, [timelineRef, ctaRef, hasActiveSelection, TRIGGER_BUFFER, TOP_THRESHOLD, PERSIST_BUFFER]);

  // INSTANT: Hide immediately when selection becomes active
  // This runs synchronously before any animation delays
  useEffect(() => {
    if (hasActiveSelection) {
      // Selection started - hide immediately if floating
      if (isFloating) {
        wasFloatingBeforeSelectionRef.current = true;
        setIsFloating(false);
        setShowElement(false);
        // Clear any pending timers
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      }
    } else if (!hasActiveSelection && enabled) {
      // Selection ended - check if CTA should float based on CURRENT scroll position
      // (user may have scrolled during selection)
      wasFloatingBeforeSelectionRef.current = false;
      
      const timelineEl = timelineRef.current;
      const ctaEl = ctaRef.current;
      if (timelineEl && ctaEl) {
        const timelineRect = timelineEl.getBoundingClientRect();
        const ctaRect = ctaEl.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        
        const notAtTop = scrollY > TOP_THRESHOLD;
        const timelineHasBeenViewed = timelineRect.top < (viewportHeight - TRIGGER_BUFFER);
        const ctaNotVisible = ctaRect.top > (viewportHeight - PERSIST_BUFFER);
        
        // Show instantly if conditions are met (skip hasScrolledRef check since user clearly scrolled if they're here)
        if (notAtTop && timelineHasBeenViewed && ctaNotVisible) {
          hasScrolledRef.current = true; // Mark as scrolled since we're in a scrolled position
          setIsFloating(true);
          setShowElement(true);
        }
      }
    }
  }, [hasActiveSelection, enabled, isFloating, timelineRef, ctaRef, TRIGGER_BUFFER, TOP_THRESHOLD, PERSIST_BUFFER]);

  // Manage element visibility with animation delay (for scroll-based changes)
  useEffect(() => {
    // After first render, mark that initial mount is complete
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
    }
    
    if (isFloating) {
      // Clear any pending hide timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Show immediately when it should float
      setShowElement(true);
    } else if (showElement && !isInitialMountRef.current && !hasActiveSelection) {
      // When it should hide (not due to selection), wait for animation to complete
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        setShowElement(false);
        hideTimerRef.current = null;
      }, 300); // Match animation duration
    }
    
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [isFloating, showElement, hasActiveSelection]);

  // Scroll-based detection
  useEffect(() => {
    if (!enabled) return;
    
    const timelineEl = timelineRef.current;
    const ctaEl = ctaRef.current;
    if (!timelineEl || !ctaEl) {
      return;
    }
    
    // Check on scroll (throttled)
    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      // Mark that user has scrolled
      if (!hasScrolledRef.current) {
        hasScrolledRef.current = true;
      }
      
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        checkFloatingState();
        scrollTimeout = null;
      }, 100);
    };
    
    // Check on resize
    const handleResize = () => {
      checkFloatingState();
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      // Reset scroll tracking when effect re-runs
      hasScrolledRef.current = false;
    };
  }, [enabled, checkFloatingState]);

  return {
    isFloating,
    showElement
  };
};

