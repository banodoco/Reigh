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

export interface ContainerDimensions {
  width: number;
  height: number;
}

/**
 * Hook to measure a container's width and the full viewport height.
 * Returns dimensions and a ref to attach to the container.
 *
 * Width: measured from the container element
 * Height: full viewport height (window.innerHeight) minus an offset for controls
 *
 * This is used for calculating how many gallery rows fit in a full viewport,
 * regardless of scroll position or where the gallery is on the page.
 *
 * @param heightOffset - Pixels to subtract from viewport height (e.g., for header + pagination)
 * @returns [ref, dimensions] - Attach ref to container, dimensions update on resize
 */
export function useContainerDimensions(
  heightOffset: number = 0
): [RefObject<HTMLDivElement | null>, ContainerDimensions] {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Start with window dimensions as estimate
  const initialWidthEstimate = typeof window !== 'undefined'
    ? Math.floor(window.innerWidth * 0.9)
    : 800;
  const initialHeightEstimate = typeof window !== 'undefined'
    ? window.innerHeight - heightOffset
    : 600;

  const [dimensions, setDimensions] = useState<ContainerDimensions>({
    width: initialWidthEstimate,
    height: initialHeightEstimate,
  });
  const hasReceivedStableDimensions = useRef(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateDimensions = () => {
      const newWidth = element.getBoundingClientRect().width;
      // Use full viewport height minus offset - not dependent on scroll position
      const viewportHeight = window.innerHeight - heightOffset;

      // Only accept dimensions that are reasonable
      if (newWidth > initialWidthEstimate * 0.5 && viewportHeight > 200) {
        hasReceivedStableDimensions.current = true;
        setDimensions({
          width: newWidth,
          height: Math.max(200, viewportHeight),
        });
      }
    };

    // Set up ResizeObserver for container width changes
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(element);

    // Also listen to window resize for viewport height changes
    window.addEventListener('resize', updateDimensions);

    // Initial measurement after a short delay for layout stability
    const fallbackTimeout = setTimeout(() => {
      if (!hasReceivedStableDimensions.current) {
        updateDimensions();
      }
    }, 100);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(fallbackTimeout);
    };
  }, [initialWidthEstimate, heightOffset]);

  return [containerRef, dimensions];
}
