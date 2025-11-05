import { useState, useCallback, useRef } from 'react';

/**
 * useTapToMove - Tablet-specific tap-to-select and tap-to-place interaction
 * 
 * Provides a two-tap interaction for tablets:
 * 1. First tap: Select an item (shows visual indicator)
 * 2. Second tap: Move item to the tapped location or deselect if tapping same item
 * 
 * Features:
 * - Visual feedback for selected state
 * - Auto-deselect after placing
 * - Cancel selection by tapping same item
 * - Only active on tablets (not phones or desktop)
 */
interface UseTapToMoveProps {
  isEnabled: boolean; // Should be true for tablets, false for phones and desktop
  onMove: (imageId: string, targetFrame: number) => void;
  framePositions: Map<string, number>;
  fullMin: number;
  fullRange: number;
  timelineWidth: number;
}

interface TapToMoveState {
  selectedItemId: string | null;
  isItemSelected: (imageId: string) => boolean;
  handleItemTap: (imageId: string) => void;
  handleTimelineTap: (clientX: number, containerRef: React.RefObject<HTMLDivElement>) => void;
  clearSelection: () => void;
}

export const useTapToMove = ({
  isEnabled,
  onMove,
  framePositions,
  fullMin,
  fullRange,
  timelineWidth
}: UseTapToMoveProps): TapToMoveState => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if an item is currently selected
  const isItemSelected = useCallback((imageId: string): boolean => {
    return isEnabled && selectedItemId === imageId;
  }, [isEnabled, selectedItemId]);

  // Handle tap on a timeline item
  const handleItemTap = useCallback((imageId: string) => {
    ,
      isEnabled,
      currentlySelected: selectedItemId?.substring(0, 8),
      willToggle: selectedItemId === imageId ? 'DESELECT' : 'SELECT'
    });
    
    if (!isEnabled) {
      return;
    }

    // If tapping the same item, deselect it
    if (selectedItemId === imageId) {
      ');
      setSelectedItemId(null);
      return;
    }

    // Otherwise, select this item
    setSelectedItemId(imageId);

    // Auto-clear selection after 30 seconds if no action taken
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }
    tapTimeoutRef.current = setTimeout(() => {
      setSelectedItemId(null);
    }, 30000);
  }, [isEnabled, selectedItemId]);

  // Handle tap on the timeline (to place selected item)
  const handleTimelineTap = useCallback((clientX: number, containerRef: React.RefObject<HTMLDivElement>) => {
    if (!isEnabled || !selectedItemId || !containerRef.current) return;

    // Calculate target frame from tap position
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    
    // Account for padding (same logic as useTimelineDrag)
    const effectiveWidth = timelineWidth - (32 * 2); // 32px padding on each side
    const adjustedX = relativeX - 32; // Account for left padding
    const normalizedX = Math.max(0, Math.min(1, adjustedX / effectiveWidth));
    const targetFrame = Math.round(fullMin + (normalizedX * fullRange));

    ,
      clientX,
      relativeX,
      targetFrame,
      currentFrame: framePositions.get(selectedItemId)
    });

    // Move the item
    onMove(selectedItemId, targetFrame);

    // Clear selection after placing
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }
    setSelectedItemId(null);
  }, [isEnabled, selectedItemId, onMove, fullMin, fullRange, timelineWidth, framePositions]);

  // Clear selection manually
  const clearSelection = useCallback(() => {
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }
    setSelectedItemId(null);
  }, []);

  return {
    selectedItemId,
    isItemSelected,
    handleItemTap,
    handleTimelineTap,
    clearSelection
  };
};

