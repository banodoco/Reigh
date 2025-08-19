import { useState, useEffect, useRef } from 'react';

interface UseScrollDirectionOptions {
  threshold?: number;
  initialDirection?: 'up' | 'down';
  enabled?: boolean;
}

interface ScrollDirectionState {
  scrollDirection: 'up' | 'down';
  scrollY: number;
  isScrolling: boolean;
  isAtTop: boolean;
}

export const useScrollDirection = (options: UseScrollDirectionOptions = {}): ScrollDirectionState => {
  const {
    threshold = 10,
    initialDirection = 'up',
    enabled = true
  } = options;

  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>(initialDirection);
  const [scrollY, setScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const updateScrollDirection = () => {
      const currentScrollY = window.scrollY;
      
      setScrollY(currentScrollY);
      setIsAtTop(currentScrollY < 5);
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }

      // Only update direction if we've scrolled past the threshold
      if (Math.abs(currentScrollY - lastScrollY.current) >= threshold) {
        const newDirection = currentScrollY > lastScrollY.current ? 'down' : 'up';
        
        // Only update if direction actually changed
        if (newDirection !== scrollDirection) {
          setScrollDirection(newDirection);
        }
        
        lastScrollY.current = currentScrollY;
      }

      // Set isScrolling to false after scroll ends
      scrollTimeout.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);

      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(updateScrollDirection);
        ticking.current = true;
      }
    };

    // Initialize
    lastScrollY.current = window.scrollY;
    setScrollY(window.scrollY);
    setIsAtTop(window.scrollY < 5);

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, [threshold, enabled, scrollDirection]);

  return {
    scrollDirection,
    scrollY,
    isScrolling,
    isAtTop
  };
};


