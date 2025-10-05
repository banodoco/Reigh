import { useState, useCallback, useEffect } from "react";
import { pixelToFrame } from "../utils/timeline-utils";

interface UseZoomProps {
  fullMin: number;
  fullMax: number;
  fullRange: number;
}

export const useZoom = ({ fullMin, fullMax, fullRange }: UseZoomProps) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0);
  const [isZooming, setIsZooming] = useState(false);

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

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!isHorizontal && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const pan = (e.deltaY * fullRange) / 2000;
      setIsZooming(true);
      setZoomCenter(z => z + pan);
    }
  }, [zoomLevel, fullRange]);
  
  useEffect(() => {
    if (isZooming) {
      const timer = setTimeout(() => setIsZooming(false), 100); // Reset after a short delay
      return () => clearTimeout(timer);
    }
  }, [isZooming]);

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
    handleWheel,
    setZoomCenter, // Export for external control
    isZooming,
  };
}; 