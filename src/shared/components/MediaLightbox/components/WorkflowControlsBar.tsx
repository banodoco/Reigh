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
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: any) => void;
  isSpecialEditMode: boolean;
  isVideo: boolean;
  
  // Media info
  mediaId: string;
  imageUrl?: string;
  thumbUrl?: string;
  
  // Shot selector props
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
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  
  // Optimistic updates
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  
  // Loading states
  isAdding?: boolean;
  isAddingWithoutPosition?: boolean;

  // UI state
  setIsSelectOpen?: (isOpen: boolean) => void;
  contentRef: React.RefObject<HTMLDivElement>;

  // Apply settings
  handleApplySettings: () => void;

  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;

  // Close lightbox
  onClose?: () => void;

  // Variant promotion - for adding a variant as a new generation to a shot
  onAddVariantAsNewGeneration?: (shotId: string, variantId: string, currentTimelineFrame?: number, nextTimelineFrame?: number) => Promise<boolean>;
  activeVariantId?: string | null;
  currentTimelineFrame?: number;
  nextTimelineFrame?: number;
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
  onAddToShotWithoutPosition,
  onShowTick,
  onOptimisticPositioned,
  onShowSecondaryTick,
  onOptimisticUnpositioned,
  isAdding = false,
  isAddingWithoutPosition = false,
  setIsSelectOpen,
  contentRef,
  handleApplySettings,
  onNavigateToShot,
  onClose,
  onAddVariantAsNewGeneration,
  activeVariantId,
  currentTimelineFrame,
  nextTimelineFrame,
}) => {
  // Track if shots loaded after initial render (race condition detection)
  const prevShotsLengthRef = React.useRef(allShots?.length || 0);
  const currentShotsLength = allShots?.length || 0;
  
  React.useEffect(() => {
    const prevLength = prevShotsLengthRef.current;
    if (prevLength === 0 && currentShotsLength > 0) {
      console.log('[ShotSelectorDebug] ⚠️ WorkflowControlsBar: Shots loaded AFTER initial render (race condition)!', {
        prevLength,
        currentShotsLength,
        willNowShowSelector: !!(onAddToShot && !isVideo),
        timestamp: Date.now()
      });
    }
    prevShotsLengthRef.current = currentShotsLength;
  }, [currentShotsLength, onAddToShot, isVideo]);
  
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
            mediaId={mediaId}
            imageUrl={imageUrl}
            thumbUrl={thumbUrl}
            allShots={allShots}
            selectedShotId={selectedShotId}
            onShotChange={onShotChange}
            onCreateShot={onCreateShot}
            isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
            isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
            showTickForImageId={showTickForImageId}
            showTickForSecondaryImageId={showTickForSecondaryImageId}
            onAddToShot={onAddToShot}
            onAddToShotWithoutPosition={onAddToShotWithoutPosition}
            onAddVariantAsNewGeneration={onAddVariantAsNewGeneration}
            activeVariantId={activeVariantId}
            currentTimelineFrame={currentTimelineFrame}
            nextTimelineFrame={nextTimelineFrame}
            onShowTick={onShowTick}
            onOptimisticPositioned={onOptimisticPositioned}
            onShowSecondaryTick={onShowSecondaryTick}
            onOptimisticUnpositioned={onOptimisticUnpositioned}
            isAdding={isAdding}
            isAddingWithoutPosition={isAddingWithoutPosition}
            setIsSelectOpen={setIsSelectOpen}
            contentRef={contentRef}
            onNavigateToShot={onNavigateToShot}
            onClose={onClose}
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
