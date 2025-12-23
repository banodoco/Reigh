import { useEffect, useState } from 'react';

/**
 * Hook to detect mobile browser chrome visibility state
 *
 * Note: Despite the name, this hook now handles ALL mobile browsers with address bar
 * hiding behavior, including:
 * - iOS Safari and Chrome (iPhone, iPad, iPod)
 * - Android Chrome and Firefox
 *
 * On these browsers, the browser UI (address bar, toolbars) can hide when scrolling
 * down, causing a white line to appear at the bottom of fixed elements.
 *
 * This hook detects when the browser chrome is hiding and returns:
 * - isIOSBrowserChromeHiding: true when the viewport is expanding (chrome hiding)
 * - bottomOffset: the amount of pixels to nudge content up to prevent white line
 *
 * Detection method:
 * - Compares window.innerHeight changes during scroll
 * - On mobile browsers, window.innerHeight increases when browser chrome hides
 * - Uses visualViewport API for better accuracy where available
 *
 * Note: The CSS dvh units handle most cases automatically, but this hook provides
 * fine-grained control for edge cases where JavaScript detection is needed.
 *
 * Supported devices:
 * - iPhone (all models with Safari or Chrome)
 * - iPad (all models with Safari or Chrome)
 * - Android phones/tablets (Chrome, Firefox)
 *
 * References:
 * - https://nicolas-hoizey.com/articles/2015/02/18/viewport-height-is-taller-than-the-visible-part-of-the-document-in-some-mobile-browsers/
 * - https://gist.github.com/claus/622a938d21d80f367251dc2eaaa1b2a9
 * - https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
 * - https://developer.chrome.com/blog/url-bar-resizing
 * - https://medium.com/@tharunbalaji110/understanding-mobile-viewport-units-a-complete-guide-to-svh-lvh-and-dvh-0c905d96e21a
 */
export function useIOSBrowserChrome() {
  const [isIOSBrowserChromeHiding, setIsIOSBrowserChromeHiding] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    // Detect mobile browsers that exhibit address bar hiding behavior
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isIOSChrome = /CriOS/.test(navigator.userAgent);
    const isIOSSafari = /Safari/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);

    // Android detection (Chrome, Firefox, and other browsers)
    const isAndroid = /Android/.test(navigator.userAgent);
    const isAndroidChrome = isAndroid && /Chrome/.test(navigator.userAgent) && !/Edge|EdgA/.test(navigator.userAgent);
    const isAndroidFirefox = isAndroid && /Firefox/.test(navigator.userAgent);

    // Only run on devices with address bar hiding behavior
    const isMobileBrowserWithAddressBar =
      (isIOS && (isIOSChrome || isIOSSafari)) ||
      isAndroidChrome ||
      isAndroidFirefox;

    if (!isMobileBrowserWithAddressBar) {
      return;
    }

    let initialHeight = window.innerHeight;
    let lastScrollY = window.scrollY;
    let rafId: number | null = null;

    const checkBrowserChrome = () => {
      const currentHeight = window.innerHeight;
      const currentScrollY = window.scrollY;

      // When scrolling down on mobile, browser chrome hides and innerHeight increases
      const isScrollingDown = currentScrollY > lastScrollY;
      const heightIncreased = currentHeight > initialHeight;

      // Chrome/address bar is hiding when scrolling down and height is increasing
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
