import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import {
  CheckCircle,
  PlusCircle,
  Settings,
  Trash2,
} from 'lucide-react';
import ShotSelector from '@/tools/travel-between-images/components/ShotSelector';

export interface ShotOption {
  id: string;
  name: string;
}

export interface WorkflowControlsProps {
  // Media info
  mediaId: string;
  isVideo: boolean;
  
  // Mode state
  isInpaintMode: boolean;
  
  // Shot selection
  allShots: ShotOption[];
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  isSelectOpen: boolean;
  setIsSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contentRef: React.RefObject<HTMLDivElement>;
  
  // Shot positioning
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  
  // Shot creation
  isCreatingShot: boolean;
  quickCreateSuccess: {
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
  };
  handleQuickCreateAndAdd: () => Promise<void>;
  handleQuickCreateSuccess: () => void;
  
  // Shot actions
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  handleAddToShot: () => Promise<void>;
  handleAddToShotWithoutPosition: () => Promise<void>;
  
  // Other actions
  onApplySettings?: (metadata: any) => void;
  handleApplySettings: () => void;
  onDelete?: (id: string) => void;
  handleDelete: () => void;
  isDeleting?: string | null;
}

/**
 * WorkflowControls Component
 * Renders the bottom control bar with shot selection, add to shot buttons,
 * apply settings, and delete
 */
export const WorkflowControls: React.FC<WorkflowControlsProps> = ({
  mediaId,
  isVideo,
  isInpaintMode,
  allShots,
  selectedShotId,
  onShotChange,
  onCreateShot,
  isSelectOpen,
  setIsSelectOpen,
  contentRef,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  showTickForImageId,
  showTickForSecondaryImageId,
  isCreatingShot,
  quickCreateSuccess,
  handleQuickCreateAndAdd,
  handleQuickCreateSuccess,
  onAddToShot,
  onAddToShotWithoutPosition,
  handleAddToShot,
  handleAddToShotWithoutPosition,
  onApplySettings,
  handleApplySettings,
  onDelete,
  handleDelete,
  isDeleting,
}) => {
  // Don't render if no workflow actions available or in inpaint mode
  if ((! onAddToShot && !onDelete && !onApplySettings) || isInpaintMode) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
      <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
        {/* Shot Selection and Add to Shot */}
        {onAddToShot && allShots.length > 0 && !isVideo && (
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

        {/* Delete */}
        {onDelete && !isVideo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting === mediaId}
                className="bg-red-600/80 hover:bg-red-600 text-white h-8 px-3"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[100001]">Delete image</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

