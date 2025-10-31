import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Settings } from 'lucide-react';
import { ShotSelectorControls } from './ShotSelectorControls';

interface ShotOption {
  id: string;
  name: string;
}

export interface WorkflowControlsBarProps {
  // Visibility
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: any) => void;
  isSpecialEditMode: boolean;
  isVideo: boolean;
  
  // Shot selector props
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
  
  // Apply settings
  handleApplySettings: () => void;
}

/**
 * WorkflowControlsBar Component
 * The bottom bar containing shot selector controls and apply settings button
 * Used across all layout variants (Desktop Side Panel, Mobile Stacked, Regular)
 */
export const WorkflowControlsBar: React.FC<WorkflowControlsBarProps> = ({
  onAddToShot,
  onDelete,
  onApplySettings,
  isSpecialEditMode,
  isVideo,
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
  handleApplySettings,
}) => {
  // Debug logging
  console.log('[ShotSelectorDebug] WorkflowControlsBar render check', {
    component: 'WorkflowControlsBar',
    hasOnAddToShot: !!onAddToShot,
    hasOnDelete: !!onDelete,
    hasOnApplySettings: !!onApplySettings,
    passedFirstCheck: !!(onAddToShot || onDelete || onApplySettings),
    allShotsLength: allShots?.length || 0,
    isVideo,
    isSpecialEditMode,
    willRenderShotSelector: !!(onAddToShot && allShots?.length > 0 && !isVideo),
    selectedShotId: selectedShotId,
    mediaId: mediaId
  });

  // Don't render if no workflow actions available
  if (!(onAddToShot || onDelete || onApplySettings)) {
    console.log('[ShotSelectorDebug] WorkflowControlsBar NOT rendering - no workflow actions', {
      component: 'WorkflowControlsBar',
      hasOnAddToShot: !!onAddToShot,
      hasOnDelete: !!onDelete,
      hasOnApplySettings: !!onApplySettings
    });
    return null;
  }

  return (
    <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-[60]">
      <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
        {/* Shot Selection and Add to Shot */}
        {onAddToShot && allShots.length > 0 && !isVideo && (
          <ShotSelectorControls
            allShots={allShots}
            selectedShotId={selectedShotId}
            onShotChange={onShotChange}
            onCreateShot={onCreateShot}
            isCreatingShot={isCreatingShot}
            quickCreateSuccess={quickCreateSuccess}
            handleQuickCreateAndAdd={handleQuickCreateAndAdd}
            handleQuickCreateSuccess={handleQuickCreateSuccess}
            isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
            isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
            showTickForImageId={showTickForImageId}
            showTickForSecondaryImageId={showTickForSecondaryImageId}
            mediaId={mediaId}
            onAddToShotWithoutPosition={onAddToShotWithoutPosition}
            handleAddToShot={handleAddToShot}
            handleAddToShotWithoutPosition={handleAddToShotWithoutPosition}
            setIsSelectOpen={setIsSelectOpen}
            contentRef={contentRef}
          />
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

