/**
 * VideoEditPanel Component
 *
 * Unified video editing panel for both desktop and mobile layouts.
 * Handles Trim, Replace Portion, and Regenerate sub-modes with variant display.
 *
 * Follows the same pattern as EditModePanel with variant prop for responsive behavior.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Film, X, Scissors, RefreshCw, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// Import video editing components
import {
  TrimControlsPanel,
  VariantSelector,
} from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';
import type { TrimState } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/types';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { VideoPortionEditor } from '@/tools/edit-video/components/VideoPortionEditor';
import type { UseVideoEditingReturn } from '../hooks/useVideoEditing';

export interface VideoEditPanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  /** Current sub-mode: trim, replace (portion replacement), or regenerate (full segment) */
  videoEditSubMode: 'trim' | 'replace' | 'regenerate';

  /** Handler to switch to trim mode */
  onEnterTrimMode: () => void;

  /** Handler to switch to replace (portion) mode */
  onEnterReplaceMode: () => void;

  /** Handler to switch to regenerate mode */
  onEnterRegenerateMode: () => void;

  /** Handler to exit video edit mode */
  onClose: () => void;

  // Trim mode props
  trimState: TrimState;
  onStartTrimChange: (seconds: number) => void;
  onEndTrimChange: (seconds: number) => void;
  onResetTrim: () => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;
  onSaveTrim: () => void;
  isSavingTrim: boolean;
  trimSaveProgress: number;
  trimSaveError: string | null;
  trimSaveSuccess: boolean;
  videoUrl: string;
  trimCurrentTime: number;
  trimVideoRef: React.RefObject<HTMLVideoElement>;

  // Replace (portion) mode props
  videoEditing: UseVideoEditingReturn;
  projectId: string | undefined;

  // Regenerate mode props
  regenerateForm?: React.ReactNode;

  // Variants props
  variants: GenerationVariant[];
  activeVariantId: string | null;
  onVariantSelect: (variantId: string) => void;
  onMakePrimary: (variantId: string) => Promise<void>;
  isLoadingVariants: boolean;
}

export const VideoEditPanel: React.FC<VideoEditPanelProps> = ({
  variant,
  videoEditSubMode,
  onEnterTrimMode,
  onEnterReplaceMode,
  onEnterRegenerateMode,
  onClose,
  // Trim props
  trimState,
  onStartTrimChange,
  onEndTrimChange,
  onResetTrim,
  trimmedDuration,
  hasTrimChanges,
  onSaveTrim,
  isSavingTrim,
  trimSaveProgress,
  trimSaveError,
  trimSaveSuccess,
  videoUrl,
  trimCurrentTime,
  trimVideoRef,
  // Replace (portion) props
  videoEditing,
  projectId,
  // Regenerate props
  regenerateForm,
  // Variants props
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoadingVariants,
}) => {
  const isMobile = variant === 'mobile';

  // Responsive styling
  const variantsMaxHeight = isMobile ? 'max-h-[120px]' : 'max-h-[200px]';
  const variantsPadding = isMobile ? 'px-3 pb-2' : 'p-4 pt-2';
  const hasVariants = variants && variants.length >= 1;

  return (
    <div className="h-full flex flex-col">
      {/* Header with close button - Desktop only */}
      {!isMobile && (
        <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 z-[80] bg-background flex-shrink-0">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-light">Edit Video</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Sub-mode selector: Trim | Replace | Regenerate */}
      <div className={cn(
        "px-4 pt-4 pb-2 flex-shrink-0",
        isMobile && "border-b border-border"
      )}>
        <div className="grid grid-cols-3 gap-1 border border-border rounded-lg overflow-hidden bg-muted/30">
          <button
            onClick={onEnterTrimMode}
            className={cn(
              "flex items-center justify-center gap-1.5 px-2 py-2 text-sm transition-all",
              videoEditSubMode === 'trim'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Scissors className="h-3.5 w-3.5" />
            <span className="truncate">Trim Video</span>
          </button>
          <button
            onClick={onEnterReplaceMode}
            className={cn(
              "flex items-center justify-center gap-1.5 px-2 py-2 text-sm transition-all",
              videoEditSubMode === 'replace'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="truncate">Replace Portion</span>
          </button>
          <button
            onClick={onEnterRegenerateMode}
            className={cn(
              "flex items-center justify-center gap-1.5 px-2 py-2 text-sm transition-all",
              videoEditSubMode === 'regenerate'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="truncate">Regenerate Video</span>
          </button>
        </div>
      </div>

      {/* Sub-mode content */}
      <div className="flex-1 overflow-y-auto">
        {videoEditSubMode === 'trim' && (
          <TrimControlsPanel
            trimState={trimState}
            onStartTrimChange={onStartTrimChange}
            onEndTrimChange={onEndTrimChange}
            onResetTrim={onResetTrim}
            trimmedDuration={trimmedDuration}
            hasTrimChanges={hasTrimChanges}
            onSave={onSaveTrim}
            isSaving={isSavingTrim}
            saveProgress={trimSaveProgress}
            saveError={trimSaveError}
            saveSuccess={trimSaveSuccess}
            onClose={onClose}
            variant={variant}
            videoUrl={videoUrl}
            currentTime={trimCurrentTime}
            videoRef={trimVideoRef}
          />
        )}
        {videoEditSubMode === 'replace' && (
          <VideoPortionEditor
            gapFrames={videoEditing.editSettings.settings.gapFrameCount || 12}
            setGapFrames={(val) => videoEditing.editSettings.updateField('gapFrameCount', val)}
            contextFrames={videoEditing.editSettings.settings.contextFrameCount || 8}
            setContextFrames={(val) => {
              const maxGap = Math.max(1, 81 - (val * 2));
              const gapFrames = videoEditing.editSettings.settings.gapFrameCount || 12;
              const newGapFrames = gapFrames > maxGap ? maxGap : gapFrames;
              videoEditing.editSettings.updateFields({
                contextFrameCount: val,
                gapFrameCount: newGapFrames
              });
            }}
            maxContextFrames={videoEditing.maxContextFrames}
            negativePrompt={videoEditing.editSettings.settings.negativePrompt || ''}
            setNegativePrompt={(val) => videoEditing.editSettings.updateField('negativePrompt', val)}
            enhancePrompt={videoEditing.editSettings.settings.enhancePrompt}
            setEnhancePrompt={(val) => videoEditing.editSettings.updateField('enhancePrompt', val)}
            selections={videoEditing.selections}
            onUpdateSelectionSettings={videoEditing.handleUpdateSelectionSettings}
            availableLoras={videoEditing.availableLoras}
            projectId={projectId}
            loraManager={videoEditing.loraManager}
            onGenerate={videoEditing.handleGenerate}
            isGenerating={videoEditing.isGenerating}
            generateSuccess={videoEditing.generateSuccess}
            isGenerateDisabled={!videoEditing.isValid}
            validationErrors={videoEditing.validationErrors}
          />
        )}
        {videoEditSubMode === 'regenerate' && regenerateForm}
      </div>

      {/* Variants section */}
      {hasVariants && (
        <div className={cn(
          "flex-shrink-0 overflow-y-auto border-t border-border",
          variantsMaxHeight,
          variantsPadding,
          // Desktop has inner div wrapper for padding
          !isMobile && "p-0"
        )}>
          {!isMobile ? (
            <div className="p-4 pt-2">
              <VariantSelector
                variants={variants}
                activeVariantId={activeVariantId}
                onVariantSelect={onVariantSelect}
                onMakePrimary={onMakePrimary}
                isLoading={isLoadingVariants}
              />
            </div>
          ) : (
            <VariantSelector
              variants={variants}
              activeVariantId={activeVariantId}
              onVariantSelect={onVariantSelect}
              onMakePrimary={onMakePrimary}
              isLoading={isLoadingVariants}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default VideoEditPanel;
