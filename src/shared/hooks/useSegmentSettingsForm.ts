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
  } = options;

  // Get all segment settings data
  const {
    settings,
    updateSettings,
    saveSettings,
    resetSettings,
    saveAsShotDefaults,
    getSettingsForTaskCreation,
    isLoading,
    isDirty,
    hasOverride,
    shotDefaults,
    enhancedPrompt,
    clearEnhancedPrompt,
  } = useSegmentSettings({
    pairShotGenerationId,
    shotId,
    defaults,
    structureVideoDefaults,
  });

  // Build form props that can be spread onto SegmentSettingsForm
  const formProps = useMemo(() => ({
    // Core controlled form props
    settings,
    onChange: updateSettings,

    // Override indicators
    hasOverride,
    shotDefaults,

    // Actions
    onRestoreDefaults: resetSettings,
    onSaveAsShotDefaults: saveAsShotDefaults,

    // Enhanced prompt (AI-generated, stored separately)
    enhancedPrompt,
    onClearEnhancedPrompt: clearEnhancedPrompt,

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
  }), [
    settings,
    updateSettings,
    hasOverride,
    shotDefaults,
    resetSettings,
    saveAsShotDefaults,
    enhancedPrompt,
    clearEnhancedPrompt,
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
