import { useState, useCallback } from "react";
import { pixelToFrame } from "../utils/timeline-utils";

interface UseZoomProps {
  fullMin: number;
  fullMax: number;
  fullRange: number;
}

export const useZoom = ({ fullMin, fullMax, fullRange }: UseZoomProps) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0);

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
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.5, 10));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.5, 1));
  const handleZoomReset = () => {
    setZoomLevel(1);
    setZoomCenter(0);
  };
  const handleZoomToStart = () => {
    setZoomLevel(2);
    setZoomCenter(fullMin + fullRange / 4);
  };

  const handleTimelineDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>, containerRef: React.RefObject<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeX = e.clientX - rect.left;
    const clickFrame = pixelToFrame(relativeX, rect.width, fullMin, fullRange);
    setZoomLevel(3);
    setZoomCenter(clickFrame);
  }, [fullMin, fullRange]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!isHorizontal && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const pan = (e.deltaY * fullRange) / 2000;
      setZoomCenter(z => z + pan);
    }
  }, [zoomLevel, fullRange]);

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
  };
}; 