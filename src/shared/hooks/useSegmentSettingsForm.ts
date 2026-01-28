/**
 * useSegmentSettingsForm - Combines useSegmentSettings with form-ready props
 *
 * This hook wraps useSegmentSettings and returns props that can be spread
 * directly onto SegmentSettingsForm, reducing duplication across the 3+
 * components that render segment settings forms.
 *
 * Usage:
 * ```tsx
 * const { formProps, getSettingsForTaskCreation, saveSettings } = useSegmentSettingsForm({
 *   pairShotGenerationId,
 *   shotId,
 *   defaults: { prompt: '', negativePrompt: '', numFrames: 25 },
 * });
 *
 * const handleSubmit = async () => {
 *   await saveSettings();
 *   const settings = getSettingsForTaskCreation();
 *   const taskParams = buildTaskParams(settings, context);
 *   await createTask(taskParams);
 * };
 *
 * return <SegmentSettingsForm {...formProps} onSubmit={handleSubmit} />;
 * ```
 */

import { useMemo } from 'react';
import { useSegmentSettings, UseSegmentSettingsOptions } from './useSegmentSettings';
import type { SegmentSettingsFormProps } from '@/shared/components/SegmentSettingsForm';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

export interface UseSegmentSettingsFormOptions extends UseSegmentSettingsOptions {
  // These are passed through to the form
  segmentIndex?: number;
  startImageUrl?: string;
  endImageUrl?: string;
  modelName?: string;
  resolution?: string;
  isRegeneration?: boolean;
  buttonLabel?: string;
  showHeader?: boolean;
  queryKeyPrefix?: string;
  maxFrames?: number;
  // Structure video context
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  /**
   * Callback to update structure video defaults when "Save as Shot Defaults" is clicked.
   * Structure videos are stored separately from tool settings, so the parent must provide this.
   * Returns a Promise so we can await it before showing success.
   */
  onUpdateStructureVideoDefaults?: (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }) => Promise<void>;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to add a structure video for this segment */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;
}

export interface UseSegmentSettingsFormReturn {
  /**
   * Props to spread onto SegmentSettingsForm.
   * Includes: settings, onChange, hasOverride, shotDefaults,
   * onRestoreDefaults, onSaveAsShotDefaults, and display props.
   *
   * Does NOT include: onSubmit, isSubmitting, onFrameCountChange
   * (these are context-specific and must be provided by the parent)
   */
  formProps: Omit<SegmentSettingsFormProps, 'onSubmit' | 'isSubmitting' | 'onFrameCountChange'>;

  /**
   * Get effective settings for task creation (merged with shot defaults).
   * Call this when building task params.
   */
  getSettingsForTaskCreation: ReturnType<typeof useSegmentSettings>['getSettingsForTaskCreation'];

  /**
   * Save current settings to database.
   * Call this before creating a task.
   */
  saveSettings: ReturnType<typeof useSegmentSettings>['saveSettings'];

  /**
   * Update settings (for external triggers like loading variant params).
   */
  updateSettings: ReturnType<typeof useSegmentSettings>['updateSettings'];

  /**
   * Current settings (for reading values outside the form).
   */
  settings: ReturnType<typeof useSegmentSettings>['settings'];

  /**
   * Loading state.
   */
  isLoading: boolean;

  /**
   * Whether settings have been modified.
   */
  isDirty: boolean;
}

export function useSegmentSettingsForm(
  options: UseSegmentSettingsFormOptions
): UseSegmentSettingsFormReturn {
  const {
    // useSegmentSettings options
    pairShotGenerationId,
    shotId,
    defaults,
    structureVideoDefaults,
    onUpdateStructureVideoDefaults,
    // Form display options
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration = false,
    buttonLabel,
    showHeader = false,
    queryKeyPrefix,
    maxFrames,
    structureVideoType,
    structureVideoUrl,
    structureVideoFrameRange,
    // Per-segment structure video management
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
  } = options;

  // Get all segment settings data
  const {
    settings,
    updateSettings,
    saveSettings,
    resetSettings,
    saveAsShotDefaults,
    saveFieldAsDefault,
    getSettingsForTaskCreation,
    isLoading,
    isDirty,
    hasOverride,
    shotDefaults,
    enhancedPrompt,
    basePromptForEnhancement,
    clearEnhancedPrompt,
    enhancePromptEnabled,
    saveEnhancePromptEnabled,
  } = useSegmentSettings({
    pairShotGenerationId,
    shotId,
    defaults,
    structureVideoDefaults,
    onUpdateStructureVideoDefaults,
  });

  // Build form props that can be spread onto SegmentSettingsForm
  const formProps = useMemo(() => ({
    // Core controlled form props
    settings,
    onChange: updateSettings,

    // Override indicators
    hasOverride,
    shotDefaults,
    isDirty,

    // Actions
    onRestoreDefaults: resetSettings,
    onSaveAsShotDefaults: saveAsShotDefaults,
    onSaveFieldAsDefault: saveFieldAsDefault,

    // Enhanced prompt (AI-generated, stored separately)
    enhancedPrompt,
    basePromptForEnhancement,
    onClearEnhancedPrompt: clearEnhancedPrompt,
    // Persisted enhance prompt toggle preference
    persistedEnhancePromptEnabled: enhancePromptEnabled,
    onSaveEnhancePromptEnabled: saveEnhancePromptEnabled,

    // Display context
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration,
    buttonLabel,
    showHeader,
    queryKeyPrefix,
    maxFrames,

    // Structure video
    structureVideoType,
    structureVideoDefaults,
    structureVideoUrl,
    structureVideoFrameRange,

    // Per-segment structure video management
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
  }), [
    settings,
    updateSettings,
    hasOverride,
    shotDefaults,
    isDirty,
    resetSettings,
    saveAsShotDefaults,
    saveFieldAsDefault,
    enhancedPrompt,
    basePromptForEnhancement,
    clearEnhancedPrompt,
    enhancePromptEnabled,
    saveEnhancePromptEnabled,
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration,
    buttonLabel,
    showHeader,
    queryKeyPrefix,
    maxFrames,
    structureVideoType,
    structureVideoDefaults,
    structureVideoUrl,
    structureVideoFrameRange,
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
  ]);

  return {
    formProps,
    getSettingsForTaskCreation,
    saveSettings,
    updateSettings,
    settings,
    isLoading,
    isDirty,
  };
}
