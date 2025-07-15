import { useMemo } from 'react';
import { usePanes } from '@/shared/contexts/PanesContext';

// Vertical padding in pixels to keep the modal from touching the screen edges
const VERTICAL_PADDING_PX = 64;

export const usePaneAwareModalStyle = () => {
  const { 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isTasksPaneLocked, 
    tasksPaneWidth, 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();

  const modalStyle = useMemo(() => {
    // Calculate horizontal offset to center modal in available space
    // We want to shift the modal to center it between the left and right panes
    const leftPaneWidth = isShotsPaneLocked ? shotsPaneWidth : 0;
    const rightPaneWidth = isTasksPaneLocked ? tasksPaneWidth : 0;
    const horizontalShift = (leftPaneWidth - rightPaneWidth) / 2;
    
    // Calculate vertical offset to account for bottom pane
    const bottomPaneHeight = isGenerationsPaneLocked ? generationsPaneHeight : 0;
    const verticalShift = -bottomPaneHeight / 2;

    // Calculate dynamic height. We subtract the bottom pane (if locked) and some padding.
    const dynamicHeight = isGenerationsPaneLocked 
      ? `calc(100vh - ${generationsPaneHeight + VERTICAL_PADDING_PX}px)` 
      : `calc(100vh - ${VERTICAL_PADDING_PX}px)`;

    return {
      transform: `translate(calc(-50% + ${horizontalShift}px), calc(-50% + ${verticalShift}px))`,
      transition: 'transform 300ms ease-in-out, height 300ms ease-in-out',
      height: dynamicHeight,
      maxHeight: dynamicHeight,
      // Ensure modal doesn't get cut off by constraining its position
      maxWidth: `calc(100vw - ${leftPaneWidth + rightPaneWidth + 32}px)`, // 32px for padding
    };
  }, [isShotsPaneLocked, shotsPaneWidth, isTasksPaneLocked, tasksPaneWidth, isGenerationsPaneLocked, generationsPaneHeight]);

  return modalStyle;
}; 