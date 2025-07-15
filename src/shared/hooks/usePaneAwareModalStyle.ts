import { useMemo } from 'react';
import { usePanes } from '@/shared/contexts/PanesContext';

// Vertical padding in pixels to keep the modal from touching the screen edges
const VERTICAL_PADDING_PX = 64;

export const usePaneAwareModalStyle = () => {
  const { 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();

  const modalStyle = useMemo(() => {
    // Only adjust height for bottom pane - modal should be centered on full screen
    // and appear ABOVE all panes (z-index handled by dialog component)
    const dynamicHeight = isGenerationsPaneLocked 
      ? `calc(100vh - ${generationsPaneHeight + VERTICAL_PADDING_PX}px)` 
      : `calc(100vh - ${VERTICAL_PADDING_PX}px)`;

    return {
      // No transform adjustments - let the default dialog centering work
      height: dynamicHeight,
      maxHeight: dynamicHeight,
    };
  }, [isGenerationsPaneLocked, generationsPaneHeight]);

  return modalStyle;
}; 