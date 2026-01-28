/**
 * InfoPanel Component
 *
 * Unified info panel for both desktop and mobile layouts.
 * Shows task details, variants, and Info/Edit toggle controls.
 *
 * Follows the same pattern as EditModePanel and VideoEditPanel with variant prop.
 */

import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

import { TaskDetailsPanelWrapper } from './TaskDetailsPanelWrapper';
import { VariantSelector } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/components/VariantSelector';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { GenerationRow } from '@/types/shots';

export interface InfoPanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  // Header toggle state & handlers
  isVideo: boolean;
  showImageEditTools: boolean;
  readOnly: boolean;
  isInpaintMode: boolean;
  isInVideoEditMode: boolean;
  onExitInpaintMode: () => void;
  onEnterInpaintMode: () => void;
  onExitVideoEditMode: () => void;
  onEnterVideoEditMode: () => void;
  onClose: () => void;

  // TaskDetailsPanelWrapper props
  taskDetailsData: any;
  derivedItems: any[];
  derivedGenerations: GenerationRow[] | null;
  paginatedDerived: GenerationRow[];
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  onNavigateToGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  currentMediaId: string;
  currentShotId?: string;
  replaceImages: boolean;
  onReplaceImagesChange: (value: boolean) => void;
  activeVariant: GenerationVariant | null;
  primaryVariant: GenerationVariant | null;
  onSwitchToPrimary?: () => void;

  // Variants props
  variants: GenerationVariant[];
  onVariantSelect: (variantId: string) => void;
  onMakePrimary: (variantId: string) => Promise<void>;
  isLoadingVariants: boolean;
  variantsSectionRef?: React.RefObject<HTMLDivElement>;
  // Variant promotion
  onPromoteToGeneration?: (variantId: string) => Promise<void>;
  isPromoting?: boolean;
  // Variant deletion
  onDeleteVariant?: (variantId: string) => Promise<void>;

  // Load variant settings into edit form
  onLoadVariantSettings?: (variantParams: Record<string, any>) => void;

  /** Task ID for copy functionality (fallback when not in taskDetailsData) */
  taskId?: string | null;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  variant,
  // Header props
  isVideo,
  showImageEditTools,
  readOnly,
  isInpaintMode,
  isInVideoEditMode,
  onExitInpaintMode,
  onEnterInpaintMode,
  onExitVideoEditMode,
  onEnterVideoEditMode,
  onClose,
  // TaskDetails props
  taskDetailsData,
  derivedItems,
  derivedGenerations,
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  onSetDerivedPage,
  onNavigateToGeneration,
  currentMediaId,
  currentShotId,
  replaceImages,
  onReplaceImagesChange,
  activeVariant,
  primaryVariant,
  onSwitchToPrimary,
  // Variants props
  variants,
  onVariantSelect,
  onMakePrimary,
  isLoadingVariants,
  variantsSectionRef,
  // Variant promotion
  onPromoteToGeneration,
  isPromoting,
  // Variant deletion
  onDeleteVariant,
  // Load variant settings
  onLoadVariantSettings,
  // Task ID fallback
  taskId: taskIdProp,
}) => {
  const isMobile = variant === 'mobile';
  const hasVariants = variants && variants.length >= 1;
  const [idCopied, setIdCopied] = useState(false);

  // Get task ID for copy functionality - use prop as fallback for videos
  const taskId = taskDetailsData?.taskId || taskIdProp;

  // Responsive styles
  const variantsMaxHeight = isMobile ? 'max-h-[120px]' : 'max-h-[200px]';

  // Render the Info/Edit toggle for images
  const renderImageToggle = () => {
    if (!showImageEditTools || readOnly || isVideo) return null;

    return (
      <SegmentedControl
        value={isInpaintMode ? 'edit' : 'info'}
        onValueChange={(value) => {
          if (value === 'info' && isInpaintMode) {
            onExitInpaintMode();
          } else if (value === 'edit' && !isInpaintMode) {
            onEnterInpaintMode();
          }
        }}
      >
        <SegmentedControlItem value="info">Info</SegmentedControlItem>
        <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
      </SegmentedControl>
    );
  };

  // Render the Info/Edit toggle for videos
  const renderVideoToggle = () => {
    if (!isVideo || readOnly) return null;

    return (
      <SegmentedControl
        value={isInVideoEditMode ? 'edit' : 'info'}
        onValueChange={(value) => {
          if (value === 'info' && isInVideoEditMode) {
            onExitVideoEditMode();
          } else if (value === 'edit' && !isInVideoEditMode) {
            onEnterVideoEditMode();
          }
        }}
      >
        <SegmentedControlItem value="info">Info</SegmentedControlItem>
        <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
      </SegmentedControl>
    );
  };

  // Handle ID copy with simple approach that works on all devices
  // Set state immediately (synchronously) for instant feedback, don't wait for clipboard promise
  const handleCopyId = () => {
    if (!taskId) return;
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
    // Copy to clipboard async - don't block on it
    navigator.clipboard.writeText(taskId).catch(() => {
      // Silently fail - we already showed feedback
    });
  };

  // Render the header - consistent single row layout for both mobile and desktop
  const renderHeader = () => (
    <div className={cn(
      "flex-shrink-0 border-b border-border bg-background",
      isMobile ? "sticky top-0 z-[80] px-3 py-2" : "p-4"
    )}>
      {/* Single row: ID + variants on left, toggle + close on right */}
      <div className={cn(
        "flex items-center justify-between",
        isMobile ? "gap-2" : "gap-3"
      )}>
        {/* Left side - copy id + variants link */}
        <div className="flex items-center gap-2">
          {taskId && (
            <button
              onClick={handleCopyId}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors touch-manipulation",
                idCopied
                  ? "text-green-400 bg-green-400/10"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
              )}
            >
              {idCopied ? 'copied' : 'id'}
            </button>
          )}
          {hasVariants && (
            <button
              onClick={() => variantsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors touch-manipulation"
            >
              <span>{variants.length} variants</span>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          )}
        </div>

        {/* Right side - toggles and close button */}
        <div className="flex items-center gap-3">
          {renderImageToggle()}
          {renderVideoToggle()}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className={cn("p-0 hover:bg-muted", isMobile ? "h-7 w-7" : "h-8 w-8")}
          >
            <X className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </Button>
        </div>
      </div>
    </div>
  );

  // Render task details wrapper
  const renderTaskDetails = () => (
    <TaskDetailsPanelWrapper
      taskDetailsData={taskDetailsData}
      derivedItems={derivedItems}
      derivedGenerations={derivedGenerations}
      paginatedDerived={paginatedDerived}
      derivedPage={derivedPage}
      derivedTotalPages={derivedTotalPages}
      onSetDerivedPage={onSetDerivedPage}
      onNavigateToGeneration={onNavigateToGeneration}
      onVariantSelect={onVariantSelect}
      currentMediaId={currentMediaId}
      currentShotId={currentShotId}
      replaceImages={replaceImages}
      onReplaceImagesChange={onReplaceImagesChange}
      onClose={onClose}
      variant={variant}
      activeVariant={activeVariant}
      primaryVariant={primaryVariant}
      onSwitchToPrimary={onSwitchToPrimary}
    />
  );

  // Render variants section - matches EditPanelLayout styling
  const renderVariants = () => {
    if (!hasVariants) return null;

    // Match EditPanelLayout: border-t, consistent padding
    const variantPadding = isMobile ? 'pt-2 mt-2 px-3 pb-2' : 'pt-4 mt-4 p-6';

    return (
      <div
        ref={variantsSectionRef}
        className={cn("border-t border-border", variantPadding)}
      >
        <VariantSelector
          variants={variants}
          activeVariantId={activeVariant?.id || null}
          onVariantSelect={onVariantSelect}
          onMakePrimary={onMakePrimary}
          isLoading={isLoadingVariants}
          onPromoteToGeneration={onPromoteToGeneration}
          isPromoting={isPromoting}
          onDeleteVariant={onDeleteVariant}
          onLoadVariantSettings={onLoadVariantSettings}
          readOnly={readOnly}
        />
      </div>
    );
  };

  // Both desktop and mobile: variants inside scroll area (matches EditPanelLayout)
  return (
    <div className={cn("w-full flex flex-col", !isMobile && "h-full")}>
      {renderHeader()}

      {/* Scrollable content area - contains both task details and variants */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {renderTaskDetails()}
        {renderVariants()}
      </div>
    </div>
  );
};

export default InfoPanel;
