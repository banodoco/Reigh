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
import { ModeSelector } from './ModeSelector';
import { SegmentRegenerateForm } from './SegmentRegenerateForm';
import type { SegmentRegenerateFormProps } from './SegmentRegenerateForm';

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

  // Regenerate mode props - pass props instead of JSX for proper hook pattern
  regenerateFormProps?: SegmentRegenerateFormProps | null;

  // Task ID for copy functionality
  taskId?: string | null;

  // Variants props
  variants: GenerationVariant[];
  activeVariantId: string | null;
  onVariantSelect: (variantId: string) => void;
  onMakePrimary: (variantId: string) => Promise<void>;
  isLoadingVariants: boolean;

  /** Handler to load a variant's settings into the regenerate form */
  onLoadVariantSettings?: (variantParams: Record<string, any>) => void;

  /** Handler to delete a variant */
  onDeleteVariant?: (variantId: string) => Promise<void>;
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
  regenerateFormProps,
  // Task ID
  taskId,
  // Variants props
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoadingVariants,
  onLoadVariantSettings,
  onDeleteVariant,
}) => {
  // Mode selector items for video editing
  const modeSelectorItems = [
    {
      id: 'trim',
      label: 'Trim',
      icon: <Scissors />,
      onClick: onEnterTrimMode,
    },
    {
      id: 'replace',
      label: 'Replace',
      icon: <RefreshCw />,
      onClick: onEnterReplaceMode,
    },
    ...(regenerateFormProps ? [{
      id: 'regenerate',
      label: 'Regenerate',
      icon: <RotateCcw />,
      onClick: onEnterRegenerateMode,
    }] : []),
  ];

  const modeSelector = (
    <ModeSelector
      items={modeSelectorItems}
      activeId={videoEditSubMode}
    />
  );

  return (
    <EditPanelLayout
      variant={variant}
      onClose={onClose}
      onExitEditMode={onExitVideoEditMode}
      modeSelector={modeSelector}
      taskId={taskId}
      variants={variants}
      activeVariantId={activeVariantId}
      onVariantSelect={onVariantSelect}
      onMakePrimary={onMakePrimary}
      isLoadingVariants={isLoadingVariants}
      onLoadVariantSettings={onLoadVariantSettings}
      onDeleteVariant={onDeleteVariant}
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
      {videoEditSubMode === 'regenerate' && regenerateFormProps && (
        <SegmentRegenerateForm {...regenerateFormProps} />
      )}
    </EditPanelLayout>
  );
};

export default VideoEditPanel;
