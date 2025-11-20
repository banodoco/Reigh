import { useState, useCallback, useEffect, useRef } from "react";
import { pixelToFrame } from "../utils/timeline-utils";

interface UseZoomProps {
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export const useZoom = ({ fullMin, fullMax, fullRange, containerRef }: UseZoomProps) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0);
  const [isZooming, setIsZooming] = useState(false);
  
  // Track previous coordinate system to detect changes
  const prevCoordinateSystemRef = useRef({ fullMin, fullMax, fullRange });

  // Calculate zoom viewport
  const getZoomViewport = useCallback(() => {
    const zoomedRange = fullRange / zoomLevel;
    const halfZoomedRange = zoomedRange / 2;
    const clampedCenter = Math.max(
      fullMin + halfZoomedRange,
      Math.min(fullMax - halfZoomedRange, zoomCenter)
    );

    return {
      min: clampedCenter - halfZoomedRange,
      max: clampedCenter + halfZoomedRange,
      range: zoomedRange
    };
  }, [fullMin, fullMax, fullRange, zoomLevel, zoomCenter]);

  // Zoom controls
  const handleZoomIn = (centerFrame?: number) => {
    setIsZooming(true);
    if (typeof centerFrame === 'number') {
      setZoomCenter(centerFrame);
    }
    setZoomLevel(prev => Math.min(prev * 1.5, 10));
  }
  const handleZoomOut = (centerFrame?: number) => {
    setIsZooming(true);
    if (typeof centerFrame === 'number') {
      setZoomCenter(centerFrame);
    }
    setZoomLevel(prev => Math.max(prev / 1.5, 1));
  }
  const handleZoomReset = () => {
    setIsZooming(true);
    setZoomLevel(1);
    setZoomCenter(0);
  };
  const handleZoomToStart = () => {
    setIsZooming(true);
    setZoomLevel(2);
    setZoomCenter(fullMin + fullRange / 4);
  };

  const handleTimelineDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>, containerRef: React.RefObject<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeX = e.clientX - rect.left;
    const clickFrame = pixelToFrame(relativeX, rect.width, fullMin, fullRange);
    
    // Progressive zoom: each double-click zooms in more (1.5x multiplier, max 10x)
    setIsZooming(true);
    setZoomLevel(prev => Math.min(prev * 1.5, 10));
    setZoomCenter(clickFrame);
  }, [fullMin, fullRange]);

  // Attach wheel event listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
    if (zoomLevel <= 1) return;
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!isHorizontal && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const pan = (e.deltaY * fullRange) / 2000;
      setIsZooming(true);
      setZoomCenter(z => z + pan);
    }
    };

    // Attach with { passive: false } to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, fullRange, containerRef]);
  
  useEffect(() => {
    if (isZooming) {
      const timer = setTimeout(() => setIsZooming(false), 100); // Reset after a short delay
      return () => clearTimeout(timer);
    }
  }, [isZooming]);
  
  // Preserve zoom when coordinate system changes (items added/deleted)
  useEffect(() => {
    const prev = prevCoordinateSystemRef.current;
    
    // Check if coordinate system actually changed (not just initial mount)
    const coordinateSystemChanged = prev.fullMin !== fullMin || prev.fullMax !== fullMax || prev.fullRange !== fullRange;
    
    if (coordinateSystemChanged) {
      // Only adjust if we're currently zoomed in and this isn't the initial mount
      if (zoomLevel > 1 && prev.fullRange > 0) {
        // FIX: Don't scale relatively! This causes drift when adding items.
        // Instead, just clamp the current zoomCenter to the new bounds.
        // This ensures if we're looking at Frame 50, we STAY looking at Frame 50 (unless it's now out of bounds).
        
        const newZoomCenter = Math.max(fullMin, Math.min(fullMax, zoomCenter));
        
        if (newZoomCenter !== zoomCenter) {
          console.log('[ZoomPreserve] Clamping zoom center to new bounds:', {
            oldCenter: zoomCenter,
            newCenter: newZoomCenter,
            bounds: { min: fullMin, max: fullMax }
          });
          setZoomCenter(newZoomCenter);
        }
      }
      
      // Update ref for next comparison
      prevCoordinateSystemRef.current = { fullMin, fullMax, fullRange };
    }
  }, [fullMin, fullMax, fullRange, zoomLevel, zoomCenter]);

  const viewport = getZoomViewport();

  return {
    zoomLevel,
    zoomCenter,
    viewport,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    setZoomCenter, // Export for external control
    isZooming,
  };
}; 