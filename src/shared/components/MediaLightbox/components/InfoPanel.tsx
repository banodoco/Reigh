/**
 * InfoPanel Component
 *
 * Unified info panel for both desktop and mobile layouts.
 * Shows task details, variants, and Info/Edit toggle controls.
 *
 * Follows the same pattern as EditModePanel and VideoEditPanel with variant prop.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

import { TaskDetailsPanelWrapper } from './TaskDetailsPanelWrapper';
import { VariantSelector } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/components/VariantSelector';
import type { GenerationVariant } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/types';
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
  generationName: string;
  onGenerationNameChange: (name: string) => void;
  isEditingGenerationName: boolean;
  onEditingGenerationNameChange: (editing: boolean) => void;
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
  generationName,
  onGenerationNameChange,
  isEditingGenerationName,
  onEditingGenerationNameChange,
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
}) => {
  const isMobile = variant === 'mobile';
  const hasVariants = variants && variants.length >= 1;

  // Responsive styles
  const variantsMaxHeight = isMobile ? 'max-h-[120px]' : 'max-h-[200px]';

  // Render the Info/Edit toggle for images
  const renderImageToggle = () => {
    if (!showImageEditTools || readOnly || isVideo) return null;

    return (
      <div className="flex items-center gap-1 bg-muted rounded-md p-1">
        <button
          onClick={() => {
            if (isInpaintMode) {
              onExitInpaintMode();
            }
          }}
          className={cn(
            "px-3 py-1.5 text-sm rounded transition-colors",
            !isInpaintMode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          Info
        </button>
        <button
          onClick={() => {
            if (!isInpaintMode) {
              onEnterInpaintMode();
            }
          }}
          className={cn(
            "px-3 py-1.5 text-sm rounded transition-colors",
            isInpaintMode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          Edit
        </button>
      </div>
    );
  };

  // Render the Info/Edit toggle for videos
  const renderVideoToggle = () => {
    if (!isVideo || readOnly) return null;

    return (
      <div className="flex items-center gap-1 bg-muted rounded-md p-1">
        <button
          onClick={onExitVideoEditMode}
          className={cn(
            "px-3 py-1.5 text-sm rounded transition-colors",
            !isInVideoEditMode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          Info
        </button>
        <button
          onClick={() => {
            if (!isInVideoEditMode) {
              onEnterVideoEditMode();
            }
          }}
          className={cn(
            "px-3 py-1.5 text-sm rounded transition-colors",
            isInVideoEditMode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          Edit
        </button>
      </div>
    );
  };

  // Render the header
  const renderHeader = () => (
    <div className={cn(
      "flex-shrink-0 flex items-center justify-between border-b border-border p-4 bg-background",
      isMobile && "sticky top-0 z-[80]"
    )}>
      {/* Left side - variant count on mobile, empty on desktop */}
      {isMobile && hasVariants ? (
        <button
          onClick={() => variantsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span>{variants.length} variants</span>
          <svg className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      ) : (
        <div></div>
      )}

      {/* Right side - toggles and close button */}
      <div className="flex items-center gap-3">
        {renderImageToggle()}
        {renderVideoToggle()}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // Render task details wrapper
  const renderTaskDetails = () => (
    <TaskDetailsPanelWrapper
      taskDetailsData={taskDetailsData}
      generationName={generationName}
      onGenerationNameChange={onGenerationNameChange}
      isEditingGenerationName={isEditingGenerationName}
      onEditingGenerationNameChange={onEditingGenerationNameChange}
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

  // Render variants section
  const renderVariants = () => {
    if (!hasVariants) return null;

    if (isMobile) {
      return (
        <div
          ref={variantsSectionRef}
          className="px-3 pb-2 -mt-2 max-h-[120px] overflow-y-auto flex-shrink-0"
        >
          <VariantSelector
            variants={variants}
            activeVariantId={activeVariant?.id || null}
            onVariantSelect={onVariantSelect}
            onMakePrimary={onMakePrimary}
            isLoading={isLoadingVariants}
          />
        </div>
      );
    }

    return (
      <div
        ref={variantsSectionRef}
        className="flex-shrink-0 overflow-y-auto max-h-[200px]"
      >
        <div className="p-4 pt-2">
          <VariantSelector
            variants={variants}
            activeVariantId={activeVariant?.id || null}
            onVariantSelect={onVariantSelect}
            onMakePrimary={onMakePrimary}
            isLoading={isLoadingVariants}
          />
        </div>
      </div>
    );
  };

  // Desktop layout: split when variants, full height otherwise
  if (!isMobile) {
    return (
      <div className="w-full h-full flex flex-col">
        {renderHeader()}

        {hasVariants ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Task details - takes remaining space, scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {renderTaskDetails()}
            </div>
            {/* Variants section */}
            {renderVariants()}
          </div>
        ) : (
          /* No variants - full height for task details */
          <div className="flex-1 overflow-y-auto">
            {renderTaskDetails()}
          </div>
        )}
      </div>
    );
  }

  // Mobile layout: simple flow
  return (
    <div className="w-full">
      {renderHeader()}
      {renderTaskDetails()}
      {renderVariants()}
    </div>
  );
};

export default InfoPanel;
