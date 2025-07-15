import { useMemo } from 'react';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useIsMobile } from '@/shared/hooks/use-mobile';

// Vertical padding in pixels to keep the modal from touching the screen edges
const VERTICAL_PADDING_PX = 64;
const MOBILE_VERTICAL_PADDING_PX = 20; // Smaller buffer on mobile
const MOBILE_HORIZONTAL_PADDING_PX = 8; // Tiny side buffer on mobile

export const usePaneAwareModalStyle = () => {
  const { 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();
  const isMobile = useIsMobile();

  const modalStyle = useMemo(() => {
    // On mobile, panes are never locked, so we use simpler logic
    if (isMobile) {
      return {
        maxHeight: `calc(100vh - ${MOBILE_VERTICAL_PADDING_PX * 2}px)`,
        maxWidth: `calc(100vw - ${MOBILE_HORIZONTAL_PADDING_PX * 2}px)`,
        margin: `${MOBILE_VERTICAL_PADDING_PX}px ${MOBILE_HORIZONTAL_PADDING_PX}px`,
      };
    }

    // Desktop behavior: only adjust maxHeight for bottom pane
    // Modal should be centered on full screen and appear ABOVE all panes
    // Use maxHeight instead of height so modal can shrink with less content
    const dynamicMaxHeight = isGenerationsPaneLocked 
      ? `calc(100vh - ${generationsPaneHeight + VERTICAL_PADDING_PX}px)` 
      : `calc(100vh - ${VERTICAL_PADDING_PX}px)`;

    return {
      // No transform adjustments - let the default dialog centering work
      maxHeight: dynamicMaxHeight,
    };
  }, [isGenerationsPaneLocked, generationsPaneHeight, isMobile]);

  return modalStyle;
}; 