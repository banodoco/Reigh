import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { CheckCircle, PlusCircle } from 'lucide-react';
import ShotSelector from '@/shared/components/ShotSelector';

interface ShotOption {
  id: string;
  name: string;
}

export interface ShotSelectorControlsProps {
  // Shot selection
  allShots: ShotOption[];
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  
  // Shot creation
  isCreatingShot: boolean;
  quickCreateSuccess: {
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
  };
  handleQuickCreateAndAdd: () => Promise<void>;
  handleQuickCreateSuccess: () => void;
  
  // Shot positioning
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  mediaId: string;
  
  // Shot actions
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  handleAddToShot: () => Promise<void>;
  handleAddToShotWithoutPosition: () => Promise<void>;
  
  // UI state
  setIsSelectOpen: (isOpen: boolean) => void;
  contentRef: React.RefObject<HTMLDivElement>;
  
  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;
}

/**
 * ShotSelectorControls Component
 * Consolidates the shot selector dropdown with add-to-shot buttons
 * Used in workflow controls across all layout variants
 */
export const ShotSelectorControls: React.FC<ShotSelectorControlsProps> = ({
  allShots,
  selectedShotId,
  onShotChange,
  onCreateShot,
  isCreatingShot,
  quickCreateSuccess,
  handleQuickCreateAndAdd,
  handleQuickCreateSuccess,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  showTickForImageId,
  showTickForSecondaryImageId,
  mediaId,
  onAddToShotWithoutPosition,
  handleAddToShot,
  handleAddToShotWithoutPosition,
  setIsSelectOpen,
  contentRef,
  onNavigateToShot,
}) => {
  return (
    <>
      <ShotSelector
        value={selectedShotId || ''}
        onValueChange={onShotChange || (() => {})}
        shots={allShots}
        placeholder="Select shot"
        triggerClassName="w-32 h-8 bg-black/50 border-white/20 text-white text-xs"
        onOpenChange={setIsSelectOpen}
        showAddShot={!!onCreateShot}
        onCreateShot={handleQuickCreateAndAdd}
        isCreatingShot={isCreatingShot}
        quickCreateSuccess={quickCreateSuccess}
        onQuickCreateSuccess={handleQuickCreateSuccess}
        container={contentRef.current}
        onNavigateToShot={onNavigateToShot}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddToShot}
            disabled={!selectedShotId}
            className={`h-8 px-3 text-white ${
              isAlreadyPositionedInSelectedShot || showTickForImageId === mediaId
                ? 'bg-green-600/80 hover:bg-green-600'
                : 'bg-blue-600/80 hover:bg-blue-600'
            }`}
          >
            {isAlreadyPositionedInSelectedShot || showTickForImageId === mediaId ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="z-[100001]">
          {isAlreadyPositionedInSelectedShot || showTickForImageId === mediaId
            ? 'Added with position. Jump to shot.'
            : 'Add to shot with position'}
        </TooltipContent>
      </Tooltip>

      {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddToShotWithoutPosition}
              disabled={!selectedShotId}
              className={`h-8 px-3 text-white ${
                isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId
                  ? 'bg-green-600/80 hover:bg-green-600'
                  : 'bg-purple-600/80 hover:bg-purple-600'
              }`}
            >
              {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId ? (
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

