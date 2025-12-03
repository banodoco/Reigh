import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import {
  CheckCircle,
  PlusCircle,
  Settings,
} from 'lucide-react';
import ShotSelectorWithAdd from '@/shared/components/ShotSelectorWithAdd';

export interface ShotOption {
  id: string;
  name: string;
}

export interface WorkflowControlsProps {
  // Media info
  mediaId: string;
  imageUrl?: string;
  thumbUrl?: string;
  isVideo: boolean;
  
  // Mode state  
  isInpaintMode?: boolean; // Optional - for defensive rendering (parent already checks)
  
  // Shot selection
  allShots: ShotOption[];
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  contentRef: React.RefObject<HTMLDivElement>;
  
  // Shot positioning
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  
  // Shot actions
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  
  // Optimistic updates
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  
  // Loading states
  isAdding?: boolean;
  isAddingWithoutPosition?: boolean;
  
  // Other actions
  onApplySettings?: (metadata: any) => void;
  handleApplySettings: () => void;
  onDelete?: (id: string) => void;
  handleDelete: () => void;
  isDeleting?: string | null;
  
  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;
  
  // Close lightbox
  onClose?: () => void;
}

/**
 * WorkflowControls Component
 * Renders the bottom control bar with shot selection, add to shot buttons,
 * apply settings, and delete
 */
export const WorkflowControls: React.FC<WorkflowControlsProps> = ({
  mediaId,
  imageUrl,
  thumbUrl,
  isVideo,
  isInpaintMode,
  allShots,
  selectedShotId,
  onShotChange,
  onCreateShot,
  contentRef,
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
  isAdding = false,
  isAddingWithoutPosition = false,
  onApplySettings,
  handleApplySettings,
  onDelete,
  handleDelete,
  isDeleting,
  onNavigateToShot,
  onClose,
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
      console.error('[WorkflowControls] Error adding without position:', error);
    }
  };

  // Don't render if no workflow actions available, in inpaint mode, or video
  if ((!onAddToShot && !onDelete && !onApplySettings) || isVideo || isInpaintMode) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-[60]">
      <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
        {/* Shot Selection and Add to Shot */}
        {onAddToShot && allShots.length > 0 && !isVideo && (
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
        )}

        {/* Apply Settings */}
        {onApplySettings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleApplySettings}
                className="bg-purple-600/80 hover:bg-purple-600 text-white h-8 px-3"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[100001]">Apply settings</TooltipContent>
          </Tooltip>
        )}

      </div>
    </div>
  );
};
