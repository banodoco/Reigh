import { useState, useEffect, useRef, RefObject } from 'react';

/**
 * Hook to measure a container's width using ResizeObserver.
 * Returns the current width and a ref to attach to the container.
 *
 * Uses window.innerWidth as initial estimate to avoid layout shift on first render.
 * Only updates width when layout is stable (avoids intermediate states during mount).
 *
 * @returns [ref, width] - Attach ref to container, width updates on resize
 */
export function useContainerWidth(): [RefObject<HTMLDivElement | null>, number] {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Start with window width as estimate to avoid 0 on first render
  const initialEstimate = typeof window !== 'undefined'
    ? Math.floor(window.innerWidth * 0.9)
    : 800;
  const [width, setWidth] = useState(initialEstimate);
  const hasReceivedStableWidth = useRef(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Set up ResizeObserver - this is the source of truth for width
    // We skip the initial offsetWidth read because it may fire before layout is complete
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        // Only accept widths that are reasonable (at least 50% of estimate)
        // This filters out intermediate layout states
        if (newWidth > initialEstimate * 0.5) {
          hasReceivedStableWidth.current = true;
          setWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(element);

    // Fallback: if ResizeObserver hasn't fired after a short delay, use offsetWidth
    const fallbackTimeout = setTimeout(() => {
      if (!hasReceivedStableWidth.current && element.offsetWidth > 0) {
        setWidth(element.offsetWidth);
      }
    }, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(fallbackTimeout);
    };
  }, [initialEstimate]);

  return [containerRef, width];
}
