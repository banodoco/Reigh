import { useState, useEffect, useRef } from 'react';

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

  // Manage element visibility with animation delay
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
    } else if (showElement && !isInitialMountRef.current) {
      // When it should hide, wait for animation to complete before removing from DOM
      // Clear any existing timer first
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
  }, [isFloating, showElement]);

  // Scroll-based detection
  useEffect(() => {
    if (!enabled) return;
    
    const timelineEl = timelineRef.current;
    const ctaEl = ctaRef.current;
    if (!timelineEl || !ctaEl) {
      console.log('[FloatingCTA] 🔍 Refs not ready yet, waiting...');
      return;
    }
    
    console.log('[FloatingCTA] ✅ Setting up scroll-based floating CTA detection');
    
    // Configuration
    const TRIGGER_BUFFER = isMobile ? 200 : 100; // Delay before showing (px)
    const TOP_THRESHOLD = 50; // Hide when near top (px)
    const PERSIST_BUFFER = 100; // Hide when original CTA this far into viewport (px)
    
    const checkFloatingState = () => {
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
      
      console.log('[FloatingCTA] 📊 Check:', {
        shouldFloat,
        conditions: {
          userHasScrolled,
          notAtTop,
          timelineHasBeenViewed,
          ctaNotVisible,
          noActiveSelection
        },
        metrics: {
          scrollY: scrollY.toFixed(0),
          timelineTop: timelineRect.top.toFixed(0),
          ctaTop: ctaRect.top.toFixed(0)
        }
      });
      
      if (shouldFloat !== isFloating) {
        console.log('[FloatingCTA] 🔄 Changing floating state from', isFloating, 'to', shouldFloat);
        setIsFloating(shouldFloat);
      }
    };
    
    // Check on scroll (throttled)
    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      // Mark that user has scrolled
      if (!hasScrolledRef.current) {
        hasScrolledRef.current = true;
        console.log('[FloatingCTA] ✅ User has scrolled, enabling floating CTA detection');
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
  }, [isMobile, hasActiveSelection, isFloating, enabled]);

  return {
    isFloating,
    showElement
  };
};

