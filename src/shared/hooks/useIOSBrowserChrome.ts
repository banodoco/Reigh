import { useEffect, useState } from 'react';

/**
 * Hook to detect iOS browser chrome visibility state
 *
 * On iOS Safari and Chrome, the browser UI (address bar, toolbars) can hide when scrolling down,
 * causing a white line to appear at the bottom of fixed elements.
 *
 * This hook detects when the browser chrome is hiding and returns:
 * - isIOSBrowserChromeHiding: true when the viewport is expanding (chrome hiding)
 * - bottomOffset: the amount of pixels to nudge content up to prevent white line
 *
 * Detection method:
 * - Compares window.innerHeight changes during scroll
 * - On iOS, window.innerHeight increases when browser chrome hides
 * - Uses visualViewport API as fallback for better accuracy
 *
 * References:
 * - https://nicolas-hoizey.com/articles/2015/02/18/viewport-height-is-taller-than-the-visible-part-of-the-document-in-some-mobile-browsers/
 * - https://gist.github.com/claus/622a938d21d80f367251dc2eaaa1b2a9
 * - https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
 */
export function useIOSBrowserChrome() {
  const [isIOSBrowserChromeHiding, setIsIOSBrowserChromeHiding] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    // Only run on iOS devices (Safari or Chrome)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isIOSChrome = /CriOS/.test(navigator.userAgent);
    const isIOSSafari = /Safari/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);

    if (!isIOS || (!isIOSChrome && !isIOSSafari)) {
      return;
    }

    let initialHeight = window.innerHeight;
    let lastScrollY = window.scrollY;
    let rafId: number | null = null;

    const checkBrowserChrome = () => {
      const currentHeight = window.innerHeight;
      const currentScrollY = window.scrollY;

      // When scrolling down on iOS, browser chrome hides and innerHeight increases
      const isScrollingDown = currentScrollY > lastScrollY;
      const heightIncreased = currentHeight > initialHeight;

      // Chrome is hiding when scrolling down and height is increasing
      const chromeHiding = isScrollingDown && heightIncreased;

      // Calculate the offset (difference between current and initial height)
      const offset = chromeHiding ? Math.max(0, currentHeight - initialHeight) : 0;

      setIsIOSBrowserChromeHiding(chromeHiding);
      setBottomOffset(offset);

      // Update tracking variables
      lastScrollY = currentScrollY;

      rafId = null;
    };

    const handleScroll = () => {
      // Debounce using requestAnimationFrame for smooth updates
      if (rafId === null) {
        rafId = requestAnimationFrame(checkBrowserChrome);
      }
    };

    const handleResize = () => {
      // Update initial height on resize (e.g., orientation change)
      initialHeight = window.innerHeight;
      checkBrowserChrome();
    };

    // Use visualViewport API if available (more accurate)
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleResize);
      visualViewport.addEventListener('scroll', handleScroll);
    } else {
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Initial check
    checkBrowserChrome();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleResize);
        visualViewport.removeEventListener('scroll', handleScroll);
      } else {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return {
    isIOSBrowserChromeHiding,
    bottomOffset,
  };
}
