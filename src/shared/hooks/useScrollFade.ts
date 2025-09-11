import { useState, useEffect, useRef } from 'react';

interface UseScrollFadeOptions {
  /** Whether the modal is open (to trigger re-checks) */
  isOpen?: boolean;
  /** Threshold in pixels from bottom to consider "scrolled to bottom" */
  bottomThreshold?: number;
  /** Whether to enable debug logging */
  debug?: boolean;
}

interface UseScrollFadeReturn {
  /** Whether to show the fade overlay */
  showFade: boolean;
  /** Ref to attach to the scrollable container */
  scrollRef: React.RefObject<HTMLDivElement>;
}

/**
 * Hook for smart scroll-aware fade effect that appears above footer borders
 * Only shows when content is scrollable and user hasn't reached the bottom
 */
export const useScrollFade = ({
  isOpen = true,
  bottomThreshold = 5,
  debug = false
}: UseScrollFadeOptions = {}): UseScrollFadeReturn => {
  const [showFade, setShowFade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) {
        return;
      }

    const checkScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrolledToBottom = scrollTop + clientHeight >= scrollHeight - bottomThreshold;
      const hasScrollableContent = scrollHeight > clientHeight;
      
      // Only show fade when:
      // 1. Content is scrollable (overflows container)
      // 2. User hasn't reached the bottom
      const shouldShowFade = hasScrollableContent && !isScrolledToBottom;
      
      setShowFade(shouldShowFade);
    };

    // Initial check
    checkScroll();

    // Check on scroll
    container.addEventListener('scroll', checkScroll, { passive: true });
    
    // Check when container size changes
    const resizeObserver = new ResizeObserver(() => {
      // Use setTimeout to ensure layout is complete
      setTimeout(checkScroll, 0);
    });
    resizeObserver.observe(container);
    
    // Check when content changes (dynamic loading, etc.)
    const mutationObserver = new MutationObserver(() => {
      setTimeout(checkScroll, 0);
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false
    });

      return () => {
        container.removeEventListener('scroll', checkScroll);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
      };
    }, 100); // 100ms delay

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, bottomThreshold, debug, showFade]);


  return {
    showFade,
    scrollRef
  };
};
