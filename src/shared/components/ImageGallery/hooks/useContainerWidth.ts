import { useState, useEffect, useRef, RefObject } from 'react';

/**
 * Hook to measure a container's width using ResizeObserver.
 * Returns the current width and a ref to attach to the container.
 *
 * @returns [ref, width] - Attach ref to container, width updates on resize
 */
export function useContainerWidth(): [RefObject<HTMLDivElement | null>, number] {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Get initial width
    setWidth(element.offsetWidth);

    // Set up ResizeObserver for dynamic updates
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentRect for the inner content width (excludes padding)
        const newWidth = entry.contentRect.width;
        setWidth(newWidth);
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return [containerRef, width];
}
