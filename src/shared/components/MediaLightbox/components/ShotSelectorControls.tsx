import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { CheckCircle, PlusCircle } from 'lucide-react';
import ShotSelectorWithAdd from '@/shared/components/ShotSelectorWithAdd';

interface ShotOption {
  id: string;
  name: string;
}

export interface ShotSelectorControlsProps {
  // Media info
  mediaId: string;
  imageUrl?: string;
  thumbUrl?: string;
  
  // Shot selection
  allShots: ShotOption[];
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  
  // Shot positioning
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  
  // Shot actions
  onAddToShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  
  // Optimistic updates
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  
  // UI state
  setIsSelectOpen?: (isOpen: boolean) => void;
  contentRef: React.RefObject<HTMLDivElement>;
  
  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;
  
  // Close lightbox
  onClose?: () => void;
  
  // Loading states
  isAdding?: boolean;
  isAddingWithoutPosition?: boolean;
}

/**
 * ShotSelectorControls Component
 * Consolidates the shot selector dropdown with add-to-shot buttons
 * Uses ShotSelectorWithAdd for the main selector + add button,
 * and adds an optional "add without position" button
 */
export const ShotSelectorControls: React.FC<ShotSelectorControlsProps> = ({
  mediaId,
  imageUrl,
  thumbUrl,
  allShots,
  selectedShotId,
  onShotChange,
  onCreateShot,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  showTickForImageId,
  showTickForSecondaryImageId,
  onAddToShot,
  onAddToShotWithoutPosition,
  onShowTick,
  onOptimisticPositioned,
  onShowSecondaryTick,
  onOptimisticUnpositioned,
  setIsSelectOpen,
  contentRef,
  onNavigateToShot,
  onClose,
  isAdding = false,
  isAddingWithoutPosition = false,
}) => {
  // Handle add without position
  const handleAddWithoutPosition = async () => {
    if (!onAddToShotWithoutPosition || !selectedShotId) return;
    
    try {
      const success = await onAddToShotWithoutPosition(mediaId, imageUrl, thumbUrl);
      if (success) {
        onShowSecondaryTick?.(mediaId);
        onOptimisticUnpositioned?.(mediaId, selectedShotId);
      }
    } catch (error) {
      console.error('[ShotSelectorControls] Error adding without position:', error);
    }
  };

  return (
    <>
      <ShotSelectorWithAdd
        imageId={mediaId}
        imageUrl={imageUrl}
        thumbUrl={thumbUrl}
        shots={allShots}
        selectedShotId={selectedShotId || ''}
        onShotChange={onShotChange || (() => {})}
        onAddToShot={onAddToShot}
        onCreateShot={onCreateShot ? async () => {} : undefined}
        isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
        showTick={showTickForImageId === mediaId}
        isAdding={isAdding}
        onShowTick={onShowTick}
        onOptimisticPositioned={onOptimisticPositioned}
        onClose={onClose}
        layout="horizontal"
        container={contentRef.current}
        selectorClassName="w-32 h-8 bg-black/50 border-white/20 text-white text-xs"
        buttonClassName="h-8 w-8"
      />

      {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddWithoutPosition}
              disabled={!selectedShotId || isAddingWithoutPosition}
              className={`h-8 px-3 text-white ${
                isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId
                  ? 'bg-green-600/80 hover:bg-green-600'
                  : 'bg-purple-600/80 hover:bg-purple-600'
              }`}
            >
              {isAddingWithoutPosition ? (
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
              ) : isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <PlusCircle className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">
            {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId
              ? 'Added without position. Jump to shot.'
              : 'Add to shot without position'}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
};
