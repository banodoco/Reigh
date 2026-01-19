/**
 * VideoEditPanel Component
 *
 * Unified video editing panel for both desktop and mobile layouts.
 * Handles Trim, Replace Portion, and Regenerate sub-modes with variant display.
 *
 * Uses shared EditPanelLayout for consistent header and variants handling.
 */

import React from 'react';
import { Scissors, RefreshCw, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// Import video editing components
import {
  TrimControlsPanel,
} from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';
import type { TrimState } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/types';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { VideoPortionEditor } from '@/tools/edit-video/components/VideoPortionEditor';
import { DEFAULT_VACE_PHASE_CONFIG } from '@/shared/lib/vaceDefaults';
import type { UseVideoEditingReturn } from '../hooks/useVideoEditing';
import { EditPanelLayout } from './EditPanelLayout';

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

  /** Handler to close the lightbox entirely */
  onClose: () => void;

  /** Handler to exit video edit mode (switch to info view) */
  onExitVideoEditMode: () => void;

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
  onExitVideoEditMode,
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
  // Mode selector for video editing - text hidden when container < 200px
  const modeSelector = (
    <div className="flex gap-0.5 border border-border rounded-lg overflow-hidden bg-muted/30 p-0.5 @[200px]:p-1 @[200px]:gap-1">
      <button
        onClick={onEnterTrimMode}
        className={cn(
          "flex-1 min-w-0 flex items-center justify-center transition-all rounded overflow-hidden p-2 @[200px]:gap-1 @[200px]:px-3 @[200px]:py-1.5 @[200px]:text-sm",
          videoEditSubMode === 'trim'
            ? "bg-background text-foreground font-medium shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        title="Trim Video"
      >
        <Scissors className="h-4 w-4 @[200px]:h-3.5 @[200px]:w-3.5 flex-shrink-0" />
        <span className="hidden @[200px]:inline truncate">Trim</span>
      </button>
      <button
        onClick={onEnterReplaceMode}
        className={cn(
          "flex-1 min-w-0 flex items-center justify-center transition-all rounded overflow-hidden p-2 @[200px]:gap-1 @[200px]:px-3 @[200px]:py-1.5 @[200px]:text-sm",
          videoEditSubMode === 'replace'
            ? "bg-background text-foreground font-medium shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        title="Replace Portion"
      >
        <RefreshCw className="h-4 w-4 @[200px]:h-3.5 @[200px]:w-3.5 flex-shrink-0" />
        <span className="hidden @[200px]:inline truncate">Replace</span>
      </button>
      {regenerateForm && (
        <button
          onClick={onEnterRegenerateMode}
          className={cn(
            "flex-1 min-w-0 flex items-center justify-center transition-all rounded overflow-hidden p-2 @[200px]:gap-1 @[200px]:px-3 @[200px]:py-1.5 @[200px]:text-sm",
            videoEditSubMode === 'regenerate'
              ? "bg-background text-foreground font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          title="Regenerate Video"
        >
          <RotateCcw className="h-4 w-4 @[200px]:h-3.5 @[200px]:w-3.5 flex-shrink-0" />
          <span className="hidden @[200px]:inline truncate">Regenerate</span>
        </button>
      )}
    </div>
  );

  return (
    <EditPanelLayout
      variant={variant}
      onClose={onClose}
      onExitEditMode={onExitVideoEditMode}
      modeSelector={modeSelector}
      variants={variants}
      activeVariantId={activeVariantId}
      onVariantSelect={onVariantSelect}
      onMakePrimary={onMakePrimary}
      isLoadingVariants={isLoadingVariants}
    >
      {/* Sub-mode content */}
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
          hideHeader
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
          onAddSelection={videoEditing.handleAddSelection}
          onRemoveSelection={videoEditing.handleRemoveSelection}
          videoUrl={videoUrl}
          fps={16}
          availableLoras={videoEditing.availableLoras}
          projectId={projectId}
          loraManager={videoEditing.loraManager}
          // Motion settings
          motionMode={(videoEditing.editSettings.settings.motionMode || 'basic') as 'basic' | 'advanced'}
          onMotionModeChange={(mode) => videoEditing.editSettings.updateField('motionMode', mode)}
          phaseConfig={videoEditing.editSettings.settings.phaseConfig ?? DEFAULT_VACE_PHASE_CONFIG}
          onPhaseConfigChange={(config) => videoEditing.editSettings.updateField('phaseConfig', config)}
          randomSeed={videoEditing.editSettings.settings.randomSeed ?? true}
          onRandomSeedChange={(val) => videoEditing.editSettings.updateField('randomSeed', val)}
          selectedPhasePresetId={videoEditing.editSettings.settings.selectedPhasePresetId ?? null}
          onPhasePresetSelect={(presetId, config) => {
            videoEditing.editSettings.updateFields({
              selectedPhasePresetId: presetId,
              phaseConfig: config,
            });
          }}
          onPhasePresetRemove={() => {
            videoEditing.editSettings.updateField('selectedPhasePresetId', null);
          }}
          // Actions
          onGenerate={videoEditing.handleGenerate}
          isGenerating={videoEditing.isGenerating}
          generateSuccess={videoEditing.generateSuccess}
          isGenerateDisabled={!videoEditing.isValid}
          validationErrors={videoEditing.validationErrors}
          hideHeader
        />
      )}
      {videoEditSubMode === 'regenerate' && regenerateForm}
    </EditPanelLayout>
  );
};

export default VideoEditPanel;
