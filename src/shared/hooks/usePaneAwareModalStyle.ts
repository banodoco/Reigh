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
    const xOffset = (isShotsPaneLocked ? shotsPaneWidth / 2 : 0) - (isTasksPaneLocked ? tasksPaneWidth / 2 : 0);
    const yOffset = isGenerationsPaneLocked ? -(generationsPaneHeight / 2) : 0;

    // Calculate dynamic height. We subtract the bottom pane (if locked) and some padding.
    const dynamicHeight = isGenerationsPaneLocked 
      ? `calc(100vh - ${generationsPaneHeight + VERTICAL_PADDING_PX}px)` 
      : `calc(100vh - ${VERTICAL_PADDING_PX}px)`;

    return {
      transform: `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px))`,
      transition: 'transform 300ms ease-in-out, height 300ms ease-in-out',
      height: dynamicHeight,
    };
  }, [isShotsPaneLocked, shotsPaneWidth, isTasksPaneLocked, tasksPaneWidth, isGenerationsPaneLocked, generationsPaneHeight]);

  return modalStyle;
}; 