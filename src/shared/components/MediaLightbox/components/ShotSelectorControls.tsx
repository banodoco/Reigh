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
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  
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
  // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
  const handleAddWithoutPosition = async () => {
    console.log('[AddWithoutPosDebug] 1️⃣ handleAddWithoutPosition CALLED');
    console.log('[AddWithoutPosDebug] selectedShotId:', selectedShotId);
    console.log('[AddWithoutPosDebug] mediaId:', mediaId);
    console.log('[AddWithoutPosDebug] hasOnAddToShotWithoutPosition:', !!onAddToShotWithoutPosition);
    
    if (!selectedShotId) {
      console.log('[AddWithoutPosDebug] ❌ No selectedShotId, returning early');
      return;
    }

    // Check if we should jump instead of add
    const isAlreadyAdded = isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId;
    
    console.log('[AddWithoutPosDebug] 2️⃣ State check:');
    console.log('[AddWithoutPosDebug] isAlreadyAssociatedWithoutPosition:', isAlreadyAssociatedWithoutPosition);
    console.log('[AddWithoutPosDebug] showTickForSecondaryImageId:', showTickForSecondaryImageId);
    console.log('[AddWithoutPosDebug] isAlreadyAdded:', isAlreadyAdded);
    console.log('[AddWithoutPosDebug] hasOnNavigateToShot:', !!onNavigateToShot);

    if (isAlreadyAdded) {
      console.log('[AddWithoutPosDebug] 3️⃣ Already added - will navigate');
      if (onNavigateToShot) {
        const targetShot = allShots.find(s => s.id === selectedShotId);
        console.log('[AddWithoutPosDebug] Navigating to shot:', targetShot?.name);
        if (targetShot) {
          onNavigateToShot(targetShot);
        }
      }
      return;
    }

    if (!onAddToShotWithoutPosition) {
      console.log('[AddWithoutPosDebug] ❌ No onAddToShotWithoutPosition callback, returning');
      return;
    }
    
    try {
      console.log('[AddWithoutPosDebug] 4️⃣ Calling onAddToShotWithoutPosition...');
      console.log('[AddWithoutPosDebug] Args: shotId=', selectedShotId?.substring(0, 8), ', mediaId=', mediaId?.substring(0, 8));
      const success = await onAddToShotWithoutPosition(selectedShotId, mediaId, imageUrl, thumbUrl);
      console.log('[AddWithoutPosDebug] 5️⃣ onAddToShotWithoutPosition returned:', success);
      if (success) {
        console.log('[AddWithoutPosDebug] 6️⃣ Success! Calling onShowSecondaryTick');
        console.log('[AddWithoutPosDebug] hasOnShowSecondaryTick:', !!onShowSecondaryTick);
        onShowSecondaryTick?.(mediaId);
        onOptimisticUnpositioned?.(mediaId, selectedShotId);
      } else {
        console.log('[AddWithoutPosDebug] ⚠️ Success was falsy:', success);
      }
    } catch (error) {
      console.error('[AddWithoutPosDebug] ❌ Error adding without position:', error);
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

      {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (() => {
        const isShowingTick = isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId;
        const isDisabled = !selectedShotId || isAddingWithoutPosition;
        
        console.log('[AddWithoutPosDebug] 🔘 Button render state:');
        console.log('[AddWithoutPosDebug] showTickForSecondaryImageId:', showTickForSecondaryImageId);
        console.log('[AddWithoutPosDebug] mediaId:', mediaId?.substring(0, 8));
        console.log('[AddWithoutPosDebug] isAlreadyAssociatedWithoutPosition:', isAlreadyAssociatedWithoutPosition);
        console.log('[AddWithoutPosDebug] isShowingTick:', isShowingTick);
        console.log('[AddWithoutPosDebug] isDisabled:', isDisabled);
        console.log('[AddWithoutPosDebug] isAddingWithoutPosition:', isAddingWithoutPosition);
        
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddWithoutPosition}
                disabled={isDisabled}
                className={`h-8 px-3 text-white ${
                  isShowingTick
                    ? 'bg-green-600/80 hover:bg-green-600'
                    : 'bg-purple-600/80 hover:bg-purple-600'
                }`}
              >
                {isAddingWithoutPosition ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                ) : isShowingTick ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <PlusCircle className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[100001]">
              {isShowingTick
                ? 'Added without position. Jump to shot.'
                : 'Add to shot without position'}
            </TooltipContent>
          </Tooltip>
        );
      })()}
    </>
  );
};
