import { useState, useRef, useCallback } from 'react';
import { GenerationRow } from '@/types/shots';

/**
 * Hook to manage video hover preview functionality
 */
export const useVideoHover = (isMobile: boolean) => {
  const [hoveredVideo, setHoveredVideo] = useState<GenerationRow | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number; positioning?: 'above' | 'below' } | null>(null);
  const [isInitialHover, setIsInitialHover] = useState(false);
  const isHoveringPreviewRef = useRef(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleHoverStart = useCallback((video: GenerationRow, event: React.MouseEvent) => {
    if (isMobile) return; // Don't show hover preview on mobile
    
    console.log('[VideoGenMissing] Starting hover for video:', video.id);
    
    // Clear any existing timeout and reset preview hover state
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    isHoveringPreviewRef.current = false;
    
    // Calculate smart position for tooltip
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Estimated tooltip dimensions (based on our min-w-80 = 320px and typical height)
    const tooltipWidth = 320;
    const tooltipHeight = 450; // Estimated height for enhanced content
    const margin = 20; // Margin from viewport edge
    
    // Calculate initial position (centered above button)
    let x = rect.left + rect.width / 2;
    let y = rect.top;
    let positioning: 'above' | 'below' = 'above'; // Default: show above
    
    // Check if tooltip would be cut off at the top
    if (y - tooltipHeight - margin < 0) {
      // Not enough space above, position below
      y = rect.bottom;
      positioning = 'below';
    }
    
    // Check horizontal boundaries
    const halfTooltipWidth = tooltipWidth / 2;
    if (x - halfTooltipWidth < margin) {
      // Too close to left edge, align to left with margin
      x = margin + halfTooltipWidth;
    } else if (x + halfTooltipWidth > viewportWidth - margin) {
      // Too close to right edge, align to right with margin
      x = viewportWidth - margin - halfTooltipWidth;
    }
    
    setHoverPosition({ x, y, positioning });
    setHoveredVideo(video);
    
    console.log('[VideoGenMissing] Set hovered video:', video.id, 'positioning:', positioning);
  }, [isMobile]);

  const handleHoverEnd = useCallback(() => {
    console.log('[VideoGenMissing] Hover end requested, isHoveringPreview:', isHoveringPreviewRef.current);
    
    // If user is hovering over the preview, don't close it
    if (isHoveringPreviewRef.current) {
      console.log('[VideoGenMissing] Keeping hover open - user is hovering preview');
      return;
    }
    
    // Add a small delay to allow transition to the preview
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      // Double-check if still not hovering preview after delay
      if (!isHoveringPreviewRef.current) {
        console.log('[VideoGenMissing] Ending hover after delay');
        setHoveredVideo(null);
        setHoverPosition(null);
        setIsInitialHover(false);
      }
    }, 100); // Small delay to allow mouse to move to preview
  }, []);

  const handlePreviewEnter = useCallback(() => {
    console.log('[VideoGenMissing] Mouse entered preview');
    isHoveringPreviewRef.current = true;
    // Clear any pending close timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handlePreviewLeave = useCallback(() => {
    console.log('[VideoGenMissing] Mouse left preview');
    isHoveringPreviewRef.current = false;
    // Close the preview after a brief delay
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      console.log('[VideoGenMissing] Closing preview after leaving');
      setHoveredVideo(null);
      setHoverPosition(null);
      setIsInitialHover(false);
    }, 100);
  }, []);

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    isHoveringPreviewRef.current = false;
  }, []);

  return {
    hoveredVideo,
    hoverPosition,
    isInitialHover,
    hoverTimeoutRef,
    handleHoverStart,
    handleHoverEnd,
    handlePreviewEnter,
    handlePreviewLeave,
    clearHoverTimeout,
    setIsInitialHover
  };
};
