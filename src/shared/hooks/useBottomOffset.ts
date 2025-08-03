import { usePanes } from '@/shared/contexts/PanesContext';

/**
 * Custom hook to calculate the bottom offset for pane positioning.
 * This offset is used to position side pane handles above the generations pane
 * when it's open or locked.
 * 
 * @returns The calculated bottom offset in pixels
 */
export const useBottomOffset = (): number => {
  const { 
    isGenerationsPaneLocked, 
    isGenerationsPaneOpen, 
    generationsPaneHeight 
  } = usePanes();
  
  return (isGenerationsPaneLocked || isGenerationsPaneOpen) 
    ? generationsPaneHeight 
    : 0;
}; 