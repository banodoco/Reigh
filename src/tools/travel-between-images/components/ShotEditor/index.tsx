import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Info } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useProject } from "@/shared/contexts/ProjectContext";
import { toast } from "sonner";
import { useUpdateShotImageOrder } from "@/shared/hooks/useShots";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import VideoOutputsGallery from "../VideoOutputsGallery";
import BatchSettingsForm from "../BatchSettingsForm";
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { usePanes } from '@/shared/contexts/PanesContext';
import ShotImagesEditor from '../ShotImagesEditor';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useAllShotGenerations, useUnpositionedGenerationsCount } from '@/shared/hooks/useShotGenerations';
import usePersistentState from '@/shared/hooks/usePersistentState';
import { useShots } from '@/shared/contexts/ShotsContext';
import SettingsModal from '@/shared/components/SettingsModal';

// Import modular components and hooks
import { ShotEditorProps, GenerationsPaneSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './state/types';
import { useShotEditorState } from './state/useShotEditorState';
import { useGenerationActions } from './hooks/useGenerationActions';
import { useLoraSync } from './hooks/useLoraSync';
import { Header } from './ui/Header';
import { ImageManagerSkeleton } from './ui/Skeleton';
import { filterAndSortShotImages, getNonVideoImages, getVideoOutputs } from './utils/generation-utils';
import { getDimensions, DEFAULT_RESOLUTION } from './utils/dimension-utils';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import { supabase } from '@/integrations/supabase/client';
import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/useShots';

const ShotEditor: React.FC<ShotEditorProps> = ({
  selectedShotId,
  projectId,
  videoPairConfigs,
  videoControlMode,
  batchVideoPrompt,
  batchVideoFrames,
  batchVideoContext,
  onShotImagesUpdate,
  onBack,
  onVideoControlModeChange,
  onPairConfigChange,
  onBatchVideoPromptChange,
  onBatchVideoFramesChange,
  onBatchVideoContextChange,
  batchVideoSteps,
  onBatchVideoStepsChange,
  dimensionSource,
  onDimensionSourceChange,
  steerableMotionSettings,
  onSteerableMotionSettingsChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  onGenerateAllSegments,
  availableLoras,
  enhancePrompt,
  onEnhancePromptChange,
  generationMode,
  onGenerationModeChange,
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onUpdateShotName,
  settingsLoading,
  getShotVideoCount,
  invalidateVideoCountsCache,
}) => {
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const { getApiKey } = useApiKeys();
  
  // Load complete shot data and images
  const { shots } = useShots(); // Get shots from context for shot metadata
  const selectedShot = shots?.find(shot => shot.id === selectedShotId);
  
  // Use context images when available (thumbnails for most cases), fall back to full query for editing
  const contextImages = selectedShot?.images || [];
  
  // Always load full data when in ShotEditor for complete editing functionality
  // Context images (5 thumbnails) are shown immediately while full data loads
  const { data: fullShotImages = [], isLoading: isLoadingFullImages } = useAllShotGenerations(selectedShotId);
  
  // Use full data if available, otherwise use context images
  // Keep context images visible while full data loads for better UX
  const orderedShotImages = fullShotImages.length > 0 ? fullShotImages : contextImages;
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  
  // Flag to skip next prop sync after successful operations
  const skipNextSyncRef = useRef(false);
  
  // Shot-specific UI settings stored in database
  const { 
    settings: shotUISettings, 
    update: updateShotUISettings,
    isLoading: isShotUISettingsLoading 
  } = useToolSettings<{
    timelineFramePositions?: Array<[string, number]>;
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: selectedProjectId, 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });

  // Project-level UI settings for defaults and saving
  const { 
    settings: projectUISettings,
    update: updateProjectUISettings
  } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: selectedProjectId,
    enabled: !!selectedProjectId 
  });
  
  // Convert timeline positions to Map for component usage
  const timelineFramePositions = useMemo(() => {
    try {
      const positions = shotUISettings?.timelineFramePositions;
      if (Array.isArray(positions)) {
        return new Map(positions);
      }
      return new Map<string, number>();
    } catch (error) {
      console.warn('[ShotEditor] Failed to create Map from timeline positions:', error);
      return new Map<string, number>();
    }
  }, [shotUISettings?.timelineFramePositions]);
  
  // Debounced ref for timeline position updates to prevent cascading
  const timelineUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const setTimelineFramePositions = useCallback((newMap: Map<string, number>) => {
    try {
      // Clear any existing debounce timer
      if (timelineUpdateTimeoutRef.current) {
        clearTimeout(timelineUpdateTimeoutRef.current);
      }
      
      // Debounce timeline position updates to prevent cascading during task cancellation
      timelineUpdateTimeoutRef.current = setTimeout(() => {
        updateShotUISettings('shot', { timelineFramePositions: [...newMap.entries()] });
      }, 1000); // 1 second debounce to reduce noise during rapid changes
    } catch (error) {
      console.warn('[ShotEditor] Failed to save timeline positions:', error);
    }
  }, [updateShotUISettings]);
  
  // Cleanup timeline update timeout on unmount
  useEffect(() => {
    return () => {
      if (timelineUpdateTimeoutRef.current) {
        clearTimeout(timelineUpdateTimeoutRef.current);
      }
    };
  }, []);
  
  const isMobile = useIsMobile();
  const { setIsGenerationsPaneLocked } = usePanes();

  // Use shots.settings to store GenerationsPane settings (shared with useGenerationsPageLogic)
  const { 
    settings: shotGenerationsPaneSettings, 
    update: updateShotGenerationsPaneSettings 
  } = useToolSettings<GenerationsPaneSettings>('generations-pane', { 
    shotId: selectedShotId, 
    enabled: !!selectedShotId 
  });

  // Use the new modular state management
  const { state, actions } = useShotEditorState();

  // Use the LoRA sync hook
  const { loraManager, isShotLoraSettingsLoading, hasInitializedShot: loraInitialized } = useLoraSync({
    selectedShot,
    projectId: selectedProjectId,
    availableLoras,
    batchVideoPrompt,
    onBatchVideoPromptChange,
  });

  // Use generation actions hook
  const generationActions = useGenerationActions({
    state,
    actions,
    selectedShot: selectedShot!,
    projectId,
    batchVideoFrames,
    onShotImagesUpdate,
    orderedShotImages,
    skipNextSyncRef,
  });

  // Function to update GenerationsPane settings for current shot
  const updateGenerationsPaneSettings = (settings: Partial<GenerationsPaneSettings>) => {
    if (selectedShotId) {
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter: settings.selectedShotFilter || selectedShotId,
        excludePositioned: settings.excludePositioned ?? true,
        userHasCustomized: true // Mark as customized since this is being called programmatically
      };
      console.log('[ShotEditor] Updating GenerationsPane settings:', updatedSettings);
      updateShotGenerationsPaneSettings('shot', updatedSettings);
    }
  };

    // Enhanced settings loading timeout with mobile-specific recovery
  useEffect(() => {
    const anySettingsLoading = settingsLoading || isShotUISettingsLoading || isShotLoraSettingsLoading;
    
    if (!anySettingsLoading) {
      // Reset any existing error once all settings loading completes successfully
      actions.setSettingsError(null);
      return;
    }
    
    // Conservative timeouts to handle poor network conditions gracefully
    // Only trigger recovery for genuinely stuck queries, not slow networks
    const timeoutMs = isMobile ? 8000 : 6000;
    
    console.log(`[ShotEditor] Settings loading timeout started: ${timeoutMs}ms for shot ${selectedShot?.id}`, {
      settingsLoading,
      isShotUISettingsLoading,
      isShotLoraSettingsLoading,
      isMobile,
      shotId: selectedShot?.id
    });
    
    // Give ALL settings queries a reasonable grace period before timing-out
    const fallbackTimer = setTimeout(() => {
      console.warn('[ShotEditor] SETTINGS TIMEOUT RECOVERY - One or more settings queries failed to complete within expected time. Forcing ready state to prevent infinite loading.', {
        settingsLoading,
        isShotUISettingsLoading,
        isShotLoraSettingsLoading,
        isMobile,
        shotId: selectedShot?.id,
        timeoutMs
      });
      
      // Force recovery - this prevents endless loading states
      // Don't show error to users since fallback defaults work fine
      actions.setSettingsError(null);
      actions.setModeReady(true);
      
      // Mobile-specific: Also dispatch a custom event to notify other components
      if (isMobile) {
        window.dispatchEvent(new CustomEvent('shotEditorRecovery', { 
          detail: { shotId: selectedShot?.id, reason: 'settings_timeout' }
        }));
      }
    }, timeoutMs);

    return () => clearTimeout(fallbackTimer);
  }, [settingsLoading, isShotUISettingsLoading, isShotLoraSettingsLoading, actions, isMobile, selectedShot?.id]);

  // Reset mode readiness when shot changes
  useEffect(() => {
    if (selectedShot?.id) {
      actions.setModeReady(false);
    }
  }, [selectedShot?.id, actions]);

  // Handle generation mode setup and readiness with mobile stall prevention
  useEffect(() => {
    // Wait for settings to load (main settings, UI settings, and LoRA settings)
    if (settingsLoading || isShotUISettingsLoading || isShotLoraSettingsLoading) {
      return;
    }

    // If we previously bailed out due to a settings load error, we're already ready
    if (state.settingsError) {
      // Double-check that we're actually ready in case of settings error recovery
      if (!state.isModeReady) {
        console.log('[ShotEditor] Settings error recovery - forcing ready state');
        actions.setModeReady(true);
      }
      return;
    }

    // For mobile users, ensure batch mode
    if (isMobile && generationMode !== 'batch') {
      console.log('[ShotEditor] Mobile mode correction - switching to batch mode');
      onGenerationModeChange('batch');
      // Don't set ready yet - the mode change will trigger this effect again
      return;
    }

    // At this point, settings are loaded and mode is correct (or we're not on desktop)
    // Use a small timeout to prevent flicker but make it consistent
    const timer = setTimeout(() => {
      const currentShotId = selectedShot?.id ?? null;
      console.log('[ShotEditor] Setting mode ready after settings loaded', {
        shotId: currentShotId,
        isMobile,
        generationMode
      });
      actions.setModeReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [isMobile, generationMode, settingsLoading, isShotUISettingsLoading, isShotLoraSettingsLoading, onGenerationModeChange, state.settingsError, actions, selectedShot?.id, state.isModeReady]);

  // Accelerated mode and random seed from database settings
  // Default accelerated mode to true when it has never been explicitly set for this shot
  const accelerated = shotUISettings?.acceleratedMode ?? true;
  const randomSeed = shotUISettings?.randomSeed ?? false;
  
  // Unified step management system
  const getRecommendedSteps = useCallback((modelName: string, isAccelerated: boolean) => {
    if (modelName === 'vace_14B_fake_cocktail_2_2') {
      return 10; // Wan 2.2 always uses 10 steps
    }
    return isAccelerated ? 8 : 20; // Wan 2.1 uses 8 for accelerated, 20 for normal
  }, []);

  const updateStepsForCurrentSettings = useCallback(() => {
    const recommendedSteps = getRecommendedSteps(steerableMotionSettings.model_name, accelerated);
    onBatchVideoStepsChange(recommendedSteps);
  }, [getRecommendedSteps, steerableMotionSettings.model_name, accelerated, onBatchVideoStepsChange]);

  // Track previous values to detect changes
  const prevAcceleratedRef = useRef(accelerated);
  const prevModelRef = useRef(steerableMotionSettings.model_name);
  
  useEffect(() => {
    const acceleratedChanged = prevAcceleratedRef.current !== accelerated;
    const modelChanged = prevModelRef.current !== steerableMotionSettings.model_name;
    
    // Only auto-adjust steps when accelerated mode or model changes (not manual user input)
    if (acceleratedChanged || modelChanged) {
      updateStepsForCurrentSettings();
    }
    
    // Update refs
    prevAcceleratedRef.current = accelerated;
    prevModelRef.current = steerableMotionSettings.model_name;
  }, [accelerated, steerableMotionSettings.model_name, updateStepsForCurrentSettings]);
  
  const setAccelerated = useCallback((value: boolean) => {
    updateShotUISettings('shot', { acceleratedMode: value });
    // Also save to project level for new shot defaults
    if (updateProjectUISettings) {
      updateProjectUISettings('project', { acceleratedMode: value });
    }
  }, [updateShotUISettings, updateProjectUISettings]);
  
  const setRandomSeed = useCallback((value: boolean) => {
    updateShotUISettings('shot', { randomSeed: value });
    // Also save to project level for new shot defaults
    if (updateProjectUISettings) {
      updateProjectUISettings('project', { randomSeed: value });
    }
  }, [updateShotUISettings, updateProjectUISettings]);

  // Handle random seed changes
  const handleRandomSeedChange = useCallback((value: boolean) => {
    setRandomSeed(value);
    if (value) {
      // Generate a random seed
      const newSeed = Math.floor(Math.random() * 1000000);
      onSteerableMotionSettingsChange({ seed: newSeed });
    } else {
      // Set to default seed
      onSteerableMotionSettingsChange({ seed: DEFAULT_STEERABLE_MOTION_SETTINGS.seed });
    }
  }, [setRandomSeed, onSteerableMotionSettingsChange]);

  // Handle accelerated mode changes
  const handleAcceleratedChange = useCallback((value: boolean) => {
    setAccelerated(value);
    actions.setShowStepsNotification(false); // Reset notification
    // Note: Step changes are handled automatically by the useEffect above
  }, [setAccelerated, actions]);
  
  // Handle manual steps change
  const handleStepsChange = useCallback((steps: number) => {
    onBatchVideoStepsChange(steps);
    
    // Show notification if manually changing steps away from recommended value
    const recommendedSteps = getRecommendedSteps(steerableMotionSettings.model_name, accelerated);
    const isWan21 = steerableMotionSettings.model_name === 'vace_14B';
    
    if (isWan21 && accelerated && steps !== recommendedSteps) {
      actions.setShowStepsNotification(true);
      // Hide notification after 5 seconds
      setTimeout(() => actions.setShowStepsNotification(false), 5000);
    } else {
      actions.setShowStepsNotification(false);
    }
  }, [accelerated, steerableMotionSettings.model_name, getRecommendedSteps, onBatchVideoStepsChange, actions]);

  // Handle model changes with automatic settings adjustment
  const handleModelChange = useCallback((modelName: string) => {
    if (modelName === 'vace_14B_fake_cocktail_2_2') {
      // Wan 2.2 specific settings - select vace_14B_fake_cocktail_2_2 as the actual model_name
      onSteerableMotionSettingsChange({ 
        model_name: 'vace_14B_fake_cocktail_2_2',
        apply_causvid: false // Disable causvid for Wan 2.2
      });
      
      // Disable accelerated mode for Wan 2.2 (which controls lighti2x LoRA)
      setAccelerated(false);
    } else {
      // Wan 2.1 (default settings)
      onSteerableMotionSettingsChange({ 
        model_name: modelName,
        apply_causvid: false // Keep causvid disabled for Wan 2.1 as well
      });
      
      // Restore accelerated mode to default (true) for Wan 2.1 (which controls lighti2x LoRA)
      setAccelerated(true);
    }
    // Note: Steps are automatically handled by the unified system when model changes
  }, [onSteerableMotionSettingsChange, setAccelerated]);

  // Ensure a valid model is always selected - default to Wan 2.1 if invalid/missing
  useEffect(() => {
    const validModels = ['vace_14B', 'vace_14B_fake_cocktail_2_2'];
    if (!validModels.includes(steerableMotionSettings.model_name)) {
      console.log(`[ShotEditor] Invalid model name "${steerableMotionSettings.model_name}", defaulting to Wan 2.1`);
      handleModelChange('vace_14B');
    }
  }, [steerableMotionSettings.model_name, handleModelChange]);

  // Update editing name when selected shot changes
  useEffect(() => {
    actions.setEditingNameValue(selectedShot?.name || '');
    actions.setEditingName(false);
  }, [selectedShot?.id, selectedShot?.name, actions]);

  const handleNameClick = () => {
    if (onUpdateShotName) {
      actions.setEditingName(true);
    }
  };

  const handleNameSave = () => {
    if (onUpdateShotName && state.editingName.trim() && state.editingName.trim() !== selectedShot?.name) {
      onUpdateShotName(state.editingName.trim());
    }
    actions.setEditingName(false);
  };

  const handleNameCancel = (e?: React.MouseEvent) => {
    // Prevent event propagation to avoid clicking elements that appear after layout change
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    actions.setEditingNameValue(selectedShot?.name || '');
    
    // Set transition flag to temporarily disable navigation buttons
    actions.setTransitioningFromNameEdit(true);
    
    // Add a small delay before hiding the editing mode to prevent click-through
    // to elements that appear in the same position
    setTimeout(() => {
      actions.setEditingName(false);
      // Clear transition flag after a slightly longer delay to ensure UI has settled
      setTimeout(() => {
        actions.setTransitioningFromNameEdit(false);
      }, 200);
    }, 100);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  // Use state from the hook for optimistic updates on image list
  const localOrderedShotImages = state.localOrderedShotImages;
  
  // Remove debug logs for production

  // Filter out generations without position and sort by position
  const filteredOrderedShotImages = useMemo(() => {
    return filterAndSortShotImages(localOrderedShotImages);
  }, [localOrderedShotImages]);
  
  // Count unpositioned generations for this shot (excluding videos, which are expected to have null positions)
  const { data: unpositionedGenerationsCount = 0 } = useUnpositionedGenerationsCount(selectedShot?.id);
  
  // Track the last synced data to prevent unnecessary updates
  const lastSyncedDataRef = useRef<string>('');
  
  // Sync local state with props, but skip if we're uploading or have skipNextSyncRef set
  useEffect(() => {
    // Production build - debug logs removed

    // Skip sync if we just finished uploading to prevent flicker
    if (skipNextSyncRef.current) {
      // Skip sync due to skipNextSyncRef
      skipNextSyncRef.current = false;
      return;
    }
    
    // Only sync from props if we are not in the middle of an upload
    if (!state.isUploadingImage) {
      const newData = orderedShotImages || [];
      
      // First check: avoid updating if the reference is already the same
      if (state.localOrderedShotImages === newData) {
        // Skipping sync - same reference
        return;
      }
      
      // Second check: compare by content (IDs) to avoid unnecessary updates
      const newDataKey = JSON.stringify(newData.map(img => img.id));
      if (newDataKey !== lastSyncedDataRef.current) {
        // Syncing localOrderedShotImages from props - data changed
        actions.setLocalOrderedShotImages(newData);
        lastSyncedDataRef.current = newDataKey;
      } else {
        // Skipping sync - data unchanged
      }
    } else {
      // Skipping props sync - upload in progress
    }
  }, [orderedShotImages, state.isUploadingImage]);

  const nonVideoImages = useMemo(() => {
    return getNonVideoImages(filteredOrderedShotImages);
  }, [filteredOrderedShotImages]);
  
  // Auto-set context frames to 8 when hidden (<=2 images)
  useEffect(() => {
    if (nonVideoImages.length <= 2 && batchVideoContext !== 8) {
      onBatchVideoContextChange(8);
    }
  }, [nonVideoImages.length, batchVideoContext, onBatchVideoContextChange]);
  
  const videoOutputs = useMemo(() => {
    return getVideoOutputs(filteredOrderedShotImages);
  }, [filteredOrderedShotImages]);

  // Mutations for applying settings/images from a task
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();

  const applySettingsFromTask = useCallback(async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    try {
      // Fetch the task to extract params
      const { data: taskRow, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      if (error || !taskRow) {
        return;
      }

      const params: any = taskRow.params || {};
      const orchestrator: any = params.full_orchestrator_payload || {};

      // Extract settings with sensible fallbacks
      const newPrompt: string | undefined = orchestrator.base_prompts_expanded?.[0] ?? params.prompt;
      const newNegativePrompt: string | undefined = orchestrator.negative_prompts_expanded?.[0] ?? params.negative_prompt;
      const newSteps: number | undefined = orchestrator.steps ?? params.num_inference_steps;
      const newFrames: number | undefined = orchestrator.segment_frames_expanded?.[0] ?? params.segment_frames_expanded;
      const newContext: number | undefined = (params.frame_overlap_settings_expanded?.[0]) ?? orchestrator.frame_overlap_expanded?.[0] ?? params.frame_overlap_expanded;
      const newModel: string | undefined = params.model_name || orchestrator.model_name;
      const parsedResolution: string | undefined = params.parsed_resolution_wh;

      if (newModel && newModel !== steerableMotionSettings.model_name) {
        // Apply model first so we can override steps after
        handleModelChange(newModel);
      }

      if (typeof newPrompt === 'string') {
        onBatchVideoPromptChange(newPrompt);
      }
      if (typeof newNegativePrompt === 'string') {
        onSteerableMotionSettingsChange({ negative_prompt: newNegativePrompt });
      }
      if (typeof newFrames === 'number' && !Number.isNaN(newFrames)) {
        onBatchVideoFramesChange(newFrames);
      }
      if (typeof newContext === 'number' && !Number.isNaN(newContext)) {
        onBatchVideoContextChange(newContext);
      }
      if (typeof newSteps === 'number' && !Number.isNaN(newSteps)) {
        // Override any model-based defaults with the exact task steps
        onBatchVideoStepsChange(newSteps);
      }

      if (typeof parsedResolution === 'string' && /^(\d+)x(\d+)$/.test(parsedResolution)) {
        const match = parsedResolution.match(/^(\d+)x(\d+)$/);
        if (match) {
          const [, w, h] = match;
          onDimensionSourceChange('custom');
          onCustomWidthChange(parseInt(w, 10));
          onCustomHeightChange(parseInt(h, 10));
        }
      }

      // Replace images if requested
      if (replaceImages && selectedShot?.id && projectId) {
        try {
          // Remove existing non-video images
          const deletions = nonVideoImages
            .filter(img => !!img.shotImageEntryId)
            .map(img => removeImageFromShotMutation.mutateAsync({
              shot_id: selectedShot.id,
              shotImageEntryId: img.shotImageEntryId!,
              project_id: projectId,
            }));
          if (deletions.length > 0) {
            await Promise.allSettled(deletions);
          }

          // Add input images in order
          const additions = (inputImages || []).map(url => addImageToShotMutation.mutateAsync({
            shot_id: selectedShot.id,
            generation_id: '',
            project_id: projectId,
            imageUrl: url,
            thumbUrl: url,
          }));
          if (additions.length > 0) {
            await Promise.allSettled(additions);
          }
        } catch (e) {
          console.error('Error replacing images from task:', e);
        }
      }
    } catch (e) {
      console.error('Failed to apply settings from task:', e);
    }
  }, [
    projectId,
    selectedShot?.id,
    nonVideoImages,
    handleModelChange,
    onBatchVideoPromptChange,
    onSteerableMotionSettingsChange,
    onBatchVideoFramesChange,
    onBatchVideoContextChange,
    onBatchVideoStepsChange,
    onDimensionSourceChange,
    onCustomWidthChange,
    onCustomHeightChange,
    addImageToShotMutation,
    removeImageFromShotMutation,
  ]);

  const applySettingsDirect = useCallback((settings: any) => {
    try {
      const orchestrator: any = settings?.full_orchestrator_payload || {};
      const newPrompt: string | undefined = orchestrator.base_prompts_expanded?.[0] ?? settings?.prompt;
      const newNegativePrompt: string | undefined = orchestrator.negative_prompts_expanded?.[0] ?? settings?.negative_prompt;
      const newSteps: number | undefined = orchestrator.steps ?? settings?.num_inference_steps;
      const newFrames: number | undefined = orchestrator.segment_frames_expanded?.[0] ?? settings?.segment_frames_expanded;
      const newContext: number | undefined = (settings?.frame_overlap_settings_expanded?.[0]) ?? orchestrator.frame_overlap_expanded?.[0] ?? settings?.frame_overlap_expanded;
      const newModel: string | undefined = settings?.model_name || orchestrator.model_name;
      const parsedResolution: string | undefined = settings?.parsed_resolution_wh;

      if (newModel && newModel !== steerableMotionSettings.model_name) {
        handleModelChange(newModel);
      }
      if (typeof newPrompt === 'string') {
        onBatchVideoPromptChange(newPrompt);
      }
      if (typeof newNegativePrompt === 'string') {
        onSteerableMotionSettingsChange({ negative_prompt: newNegativePrompt });
      }
      if (typeof newFrames === 'number' && !Number.isNaN(newFrames)) {
        onBatchVideoFramesChange(newFrames);
      }
      if (typeof newContext === 'number' && !Number.isNaN(newContext)) {
        onBatchVideoContextChange(newContext);
      }
      if (typeof newSteps === 'number' && !Number.isNaN(newSteps)) {
        onBatchVideoStepsChange(newSteps);
      }
      if (typeof parsedResolution === 'string' && /^(\d+)x(\d+)$/.test(parsedResolution)) {
        const match = parsedResolution.match(/^(\d+)x(\d+)$/);
        if (match) {
          const [, w, h] = match;
          onDimensionSourceChange('custom');
          onCustomWidthChange(parseInt(w, 10));
          onCustomHeightChange(parseInt(h, 10));
        }
      }

    } catch (e) {
      console.error('Failed to apply settings:', e);
    }
  }, [
    handleModelChange,
    onBatchVideoPromptChange,
    onSteerableMotionSettingsChange,
    onBatchVideoFramesChange,
    onBatchVideoContextChange,
    onBatchVideoStepsChange,
    onDimensionSourceChange,
    onCustomWidthChange,
    onCustomHeightChange,
    steerableMotionSettings.model_name,
  ]);

  // Early return check after all hooks are called (Rules of Hooks)
  if (!selectedShot) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Shot not found</p>
      </div>
    );
  }

  const handleReorderImagesInShot = useCallback((orderedShotGenerationIds: string[]) => {
    // DragDebug: handleReorderImagesInShot called
    
    if (!selectedShot || !projectId) {
      console.error('Cannot reorder images: No shot or project selected.');
      return;
    }

    console.log('[ShotEditor] Reordering images in shot', {
      shotId: selectedShot.id,
      projectId: projectId,
      orderedShotGenerationIds: orderedShotGenerationIds,
      timestamp: Date.now()
    });

    // Update the order on the server
    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedShotGenerationIds: orderedShotGenerationIds,
      projectId: projectId
    }, {
      onError: (error) => {
        console.error('[ShotEditor] Failed to reorder images:', error);
        // The mutation's onError will handle showing the error message and reverting optimistic updates
      }
    });
  }, [selectedShot?.id, projectId, updateShotImageOrderMutation]);

  const handlePendingPositionApplied = useCallback((generationId: string) => {
    const newMap = new Map(state.pendingFramePositions);
    if (newMap.has(generationId)) {
      newMap.delete(generationId);
      console.log(`[ShotEditor] Cleared pending position for gen ${generationId}`);
    }
    actions.setPendingFramePositions(newMap);
  }, [actions, state.pendingFramePositions]);

  // Check if generation should be disabled due to missing OpenAI API key for enhance prompt
  const openaiApiKey = getApiKey('openai_api_key');
  const isGenerationDisabledDueToApiKey = enhancePrompt && (!openaiApiKey || openaiApiKey.trim() === '');
  const isGenerationDisabled = generationActions.isEnqueuing || isGenerationDisabledDueToApiKey;

  // Handle video generation
  const handleGenerateBatch = useCallback(async () => {
    if (!projectId) {
      toast.error('No project selected. Please select a project first.');
      return;
    }

    let resolution: string | undefined = undefined;

    if ((dimensionSource || 'project') === 'firstImage' && nonVideoImages.length > 0) {
      try {
        const firstImage = nonVideoImages[0];
        const imageUrl = getDisplayUrl(firstImage.imageUrl);
        if (imageUrl) {          
          const { width, height } = await getDimensions(imageUrl);
          const imageAspectRatio = width / height;
          const closestRatioKey = findClosestAspectRatio(imageAspectRatio);
          resolution = ASPECT_RATIO_TO_RESOLUTION[closestRatioKey] || DEFAULT_RESOLUTION;
        } else {
          toast.warning("Could not get URL for the first image. Using project default resolution.");
        }
      } catch (error) {
        console.error("Error getting first image dimensions:", error);
        toast.warning("Could not determine first image dimensions. Using project default resolution.");
      }
    }

    if (dimensionSource === 'custom') {
      if (customWidth && customHeight) {
        resolution = `${customWidth}x${customHeight}`;        
      } else {
        toast.error('Custom dimensions are selected, but width or height is not set.');
        return;
      }
    }

    // Use getDisplayUrl to convert relative paths to absolute URLs
    // IMPORTANT: Use nonVideoImages to exclude generated video outputs
    const absoluteImageUrls = nonVideoImages
      .map((img) => getDisplayUrl(img.imageUrl)) // Use getDisplayUrl here
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

    let basePrompts: string[];
    let segmentFrames: number[];
    let frameOverlap: number[];
    let negativePrompts: string[];

    if (generationMode === 'timeline') {
      // Extract frame gaps from timeline positions
      const sortedPositions = [...timelineFramePositions.entries()]
        .map(([id, pos]) => ({ id, pos }))
        .sort((a, b) => a.pos - b.pos);
      
      const frameGaps = [];
      for (let i = 0; i < sortedPositions.length - 1; i++) {
        const gap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
        frameGaps.push(gap);
      }
      
      basePrompts = frameGaps.length > 0 ? frameGaps.map(() => batchVideoPrompt) : [batchVideoPrompt];
      segmentFrames = frameGaps.length > 0 ? frameGaps : [batchVideoFrames];
      frameOverlap = frameGaps.length > 0 ? frameGaps.map(() => batchVideoContext) : [batchVideoContext];
      negativePrompts = frameGaps.length > 0 ? frameGaps.map(() => steerableMotionSettings.negative_prompt) : [steerableMotionSettings.negative_prompt];
    } else {
      // batch mode
      basePrompts = [batchVideoPrompt];
      segmentFrames = [batchVideoFrames];
      frameOverlap = [batchVideoContext];
      negativePrompts = [steerableMotionSettings.negative_prompt];
    }

    const requestBody: any = {
      project_id: projectId,
      shot_id: selectedShot.id,
      image_urls: absoluteImageUrls,
      base_prompts: basePrompts,
      segment_frames: segmentFrames,
      frame_overlap: frameOverlap,
      negative_prompts: negativePrompts,
      model_name: steerableMotionSettings.model_name,
      seed: steerableMotionSettings.seed,
      steps: batchVideoSteps,
      debug: steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
      // Force these settings to consistent defaults, except use_lighti2x_lora which follows accelerated mode (unless Wan 2.2)
      apply_reward_lora: DEFAULT_STEERABLE_MOTION_SETTINGS.apply_reward_lora,
      apply_causvid: steerableMotionSettings.apply_causvid,
      use_lighti2x_lora: steerableMotionSettings.model_name === 'vace_14B_fake_cocktail_2_2' ? false : accelerated,
      use_styleboost_loras: steerableMotionSettings.use_styleboost_loras ?? DEFAULT_STEERABLE_MOTION_SETTINGS.use_styleboost_loras,
      show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
      colour_match_videos: DEFAULT_STEERABLE_MOTION_SETTINGS.colour_match_videos, // Force to false, ignore saved settings
      fade_in_duration: steerableMotionSettings.fade_in_duration ?? DEFAULT_STEERABLE_MOTION_SETTINGS.fade_in_duration,
      fade_out_duration: steerableMotionSettings.fade_out_duration ?? DEFAULT_STEERABLE_MOTION_SETTINGS.fade_out_duration,
      after_first_post_generation_saturation: steerableMotionSettings.after_first_post_generation_saturation ?? DEFAULT_STEERABLE_MOTION_SETTINGS.after_first_post_generation_saturation,
      after_first_post_generation_brightness: steerableMotionSettings.after_first_post_generation_brightness ?? DEFAULT_STEERABLE_MOTION_SETTINGS.after_first_post_generation_brightness,
      enhance_prompt: enhancePrompt,
      openai_api_key: enhancePrompt ? openaiApiKey : '',
      // Save UI state settings
      dimension_source: dimensionSource,
      generation_mode: generationMode,
      accelerated_mode: accelerated,
      random_seed: randomSeed,
    };

    if (loraManager.selectedLoras && loraManager.selectedLoras.length > 0) {
      requestBody.loras = loraManager.selectedLoras.map(l => ({ 
        path: l.path, 
        strength: parseFloat(l.strength?.toString() ?? '0') || 0.0 
      }));
    }

    if (resolution) {
      requestBody.resolution = resolution;
    }
    
    try {
      await generationActions.enqueueTasks([{
        functionName: 'steerable-motion',
        payload: requestBody,
      }]);
      
      // Success feedback is now handled by useTaskQueueNotifier
    } catch (error) {
      console.error('Error creating video generation task:', error);
    }
  }, [
    projectId,
    dimensionSource,
    nonVideoImages,
    customWidth,
    customHeight,
    generationMode,
    timelineFramePositions,
    batchVideoPrompt,
    batchVideoFrames,
    batchVideoContext,
    steerableMotionSettings,
    batchVideoSteps,
    accelerated,
    selectedShot,
    enhancePrompt,
    openaiApiKey,
    randomSeed,
    loraManager.selectedLoras,
    generationActions.enqueueTasks
  ]);

  // Opens the Generations pane focused on un-positioned images for the current shot
  const openUnpositionedGenerationsPane = useCallback(() => {
    console.log('[ShotFilterAutoSelectIssue] Opening generations pane for shot:', selectedShot?.id);
    
    if (selectedShot?.id) {
      console.log('[ShotFilterAutoSelectIssue] Updating generations pane settings:', {
        selectedShotFilter: selectedShot.id,
        excludePositioned: true,
      });
      updateGenerationsPaneSettings({
        selectedShotFilter: selectedShot.id,
        excludePositioned: true,
      });
    }

    if (isMobile) {
      console.log('[ShotFilterAutoSelectIssue] Dispatching openGenerationsPane event (mobile)');
      // Dispatch a global event to request the Generations pane to open
      window.dispatchEvent(new CustomEvent('openGenerationsPane'));
    } else {
      console.log('[ShotFilterAutoSelectIssue] Setting generations pane locked (desktop)');
      setIsGenerationsPaneLocked(true);
    }
      }, [selectedShot, isMobile, updateGenerationsPaneSettings, setIsGenerationsPaneLocked]);
  
    return (
    <div className="flex flex-col space-y-4 pb-16">
      {/* Header */}
      <Header
        selectedShot={selectedShot}
        isEditingName={state.isEditingName}
        editingName={state.editingName}
        isTransitioningFromNameEdit={state.isTransitioningFromNameEdit}
        onBack={onBack}
        onUpdateShotName={onUpdateShotName}
        onPreviousShot={onPreviousShot}
        onNextShot={onNextShot}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onNameClick={handleNameClick}
        onNameSave={handleNameSave}
        onNameCancel={handleNameCancel}
        onNameKeyDown={handleNameKeyDown}
        onEditingNameChange={actions.setEditingNameValue}
      />

      {/* Output Videos Section - Now at the top */}
      <div className="">
        <VideoOutputsGallery 
          projectId={projectId}
          shotId={selectedShotId}
          onDelete={generationActions.handleDeleteVideoOutput}
          deletingVideoId={state.deletingVideoId}
          onApplySettings={applySettingsDirect}
          onApplySettingsFromTask={applySettingsFromTask}
          shotKey={selectedShotId}
          getShotVideoCount={getShotVideoCount}
          invalidateVideoCountsCache={invalidateVideoCountsCache}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-4">
        
        {/* Image Manager */}
        <div className="flex flex-col w-full gap-4">
          <ShotImagesEditor
            isModeReady={state.isModeReady}
            settingsError={state.settingsError}
            isMobile={isMobile}
            generationMode={generationMode}
            onGenerationModeChange={onGenerationModeChange}
            images={nonVideoImages}
            selectedShotId={selectedShot.id}
            batchVideoFrames={batchVideoFrames}
            batchVideoContext={batchVideoContext}
            onImageReorder={handleReorderImagesInShot}
            onImageSaved={async () => {}} // TODO: implement
            onContextFramesChange={onBatchVideoContextChange}
            onFramePositionsChange={setTimelineFramePositions}
            onImageDrop={generationActions.handleTimelineImageDrop}
            pendingPositions={state.pendingFramePositions}
            onPendingPositionApplied={handlePendingPositionApplied}
            onImageDelete={generationActions.handleDeleteImageFromShot}
            onImageDuplicate={generationActions.handleDuplicateImage}
            columns={(isMobile ? 2 : 6) as 2 | 6}
            skeleton={<ImageManagerSkeleton isMobile={isMobile} />}
            unpositionedGenerationsCount={unpositionedGenerationsCount}
            onOpenUnpositionedPane={openUnpositionedGenerationsPane}
            fileInputKey={state.fileInputKey}
            onImageUpload={generationActions.handleImageUploadToShot}
            isUploadingImage={state.isUploadingImage}
            duplicatingImageId={state.duplicatingImageId}
            duplicateSuccessImageId={state.duplicateSuccessImageId}
            projectAspectRatio={projects.find(p => p.id === projectId)?.aspectRatio}
          />
        </div>

        {/* Generation Settings */}
        <div className="w-full">
          <Card>
            <CardHeader>
                <CardTitle>Travel Between Images</CardTitle>
                <p className="text-sm text-muted-foreground pt-1">Configure and generate video segments between the images in this shot.</p>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column: Main Settings */}
                    <div className="flex-1 order-2 lg:order-1">
                        <BatchSettingsForm
                            batchVideoPrompt={batchVideoPrompt}
                            onBatchVideoPromptChange={onBatchVideoPromptChange}
                            batchVideoFrames={batchVideoFrames}
                            onBatchVideoFramesChange={onBatchVideoFramesChange}
                            batchVideoContext={batchVideoContext}
                            onBatchVideoContextChange={onBatchVideoContextChange}
                            batchVideoSteps={batchVideoSteps}
                            onBatchVideoStepsChange={handleStepsChange}
                            dimensionSource={dimensionSource}
                            onDimensionSourceChange={onDimensionSourceChange}
                            customWidth={customWidth}
                            onCustomWidthChange={onCustomWidthChange}
                            customHeight={customHeight}
                            onCustomHeightChange={onCustomHeightChange}
                            steerableMotionSettings={steerableMotionSettings}
                            onSteerableMotionSettingsChange={onSteerableMotionSettingsChange}
                            projects={projects}
                            selectedProjectId={selectedProjectId}
                            selectedLoras={loraManager.selectedLoras}
                            availableLoras={availableLoras}
                            isTimelineMode={generationMode === 'timeline'}
                            accelerated={accelerated}
                            onAcceleratedChange={handleAcceleratedChange}
                            showStepsNotification={state.showStepsNotification}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                            imageCount={nonVideoImages.length}
                        />
                        
                        {/* Model Selection (Mobile) */}
                        <div className="block lg:hidden mt-6">
                            <div className="space-y-4 p-4 border rounded-lg bg-card mb-4">
                                <h3 className="font-light text-sm">Which model would you like to use:</h3>
                                <div className="space-y-2">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="model-mobile"
                                            value="vace_14B"
                                            checked={steerableMotionSettings.model_name === 'vace_14B' || !['vace_14B', 'vace_14B_fake_cocktail_2_2'].includes(steerableMotionSettings.model_name)}
                                            onChange={() => handleModelChange('vace_14B')}
                                            className="w-4 h-4 text-primary"
                                        />
                                        <span className="text-sm">Wan 2.1</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="model-mobile"
                                            value="vace_14B_fake_cocktail_2_2"
                                            checked={steerableMotionSettings.model_name === 'vace_14B_fake_cocktail_2_2'}
                                            onChange={() => handleModelChange('vace_14B_fake_cocktail_2_2')}
                                            className="w-4 h-4 text-primary"
                                        />
                                        <span className="text-sm">Wan 2.2</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        {/* LoRA Settings (Mobile) */}
                        <div className="block lg:hidden mt-6">
                            <div className="space-y-4 p-4 border rounded-lg bg-card">
                                <h3 className="font-light text-sm">LoRA Models</h3>
                                
                                <Button type="button" variant="outline" className="w-full" onClick={() => loraManager.setIsLoraModalOpen(true)}>
                                    Add or Manage LoRAs
                                </Button>
                                
                                <ActiveLoRAsDisplay
                                    selectedLoras={loraManager.selectedLoras}
                                    onRemoveLora={loraManager.handleRemoveLora}
                                    onLoraStrengthChange={loraManager.handleLoraStrengthChange}
                                    availableLoras={availableLoras}
                                    className="mt-4"
                                    onAddTriggerWord={loraManager.handleAddTriggerWord}
                                    renderHeaderActions={loraManager.renderHeaderActions}
                                />
                            </div>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t">
                            <Button 
                                size="lg" 
                                className="w-full" 
                                variant={generationActions.justQueued ? "success" : "default"}
                                onClick={handleGenerateBatch}
                                disabled={isGenerationDisabled}
                            >
                                {generationActions.justQueued
                                  ? "Added to queue!"
                                  : generationActions.isEnqueuing 
                                    ? 'Creating Tasks...' 
                                    : 'Generate Video'}
                            </Button>
                            {isGenerationDisabledDueToApiKey && (
                              <p className="text-xs text-center text-muted-foreground mt-2">
                                If Enhance Prompt is enabled, you must add an{' '}
                                <button 
                                  onClick={() => actions.setSettingsModalOpen(true)}
                                  className="underline text-blue-600 hover:text-blue-800 cursor-pointer"
                                >
                                  OpenAI API key
                                </button>
                              </p>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Model & LoRA Settings (Desktop) */}
                    <div className="hidden lg:block lg:w-80 order-1 lg:order-2">
                        {/* Model Selection */}
                        <div className="space-y-4 p-4 border rounded-lg bg-card mb-4">
                            <h3 className="font-light text-sm">Which model would you like to use:</h3>
                            <div className="space-y-2">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="model"
                                        value="vace_14B"
                                        checked={steerableMotionSettings.model_name === 'vace_14B' || !['vace_14B', 'vace_14B_fake_cocktail_2_2'].includes(steerableMotionSettings.model_name)}
                                        onChange={() => handleModelChange('vace_14B')}
                                        className="w-4 h-4 text-primary"
                                    />
                                    <span className="text-sm">Wan 2.1</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="model"
                                        value="vace_14B_fake_cocktail_2_2"
                                        checked={steerableMotionSettings.model_name === 'vace_14B_fake_cocktail_2_2'}
                                        onChange={() => handleModelChange('vace_14B_fake_cocktail_2_2')}
                                        className="w-4 h-4 text-primary"
                                    />
                                    <span className="text-sm">Wan 2.2</span>
                                </label>
                            </div>
                            
                            {/* Wan 2.2 Warning */}
                            {steerableMotionSettings.model_name === 'vace_14B_fake_cocktail_2_2' && (
                              <div className="p-3 border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-md">
                                <div className="flex items-start">
                                  <Info className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5 flex-shrink-0" />
                                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                    <strong>Wan 2.2 is a work in progress.</strong> It currently has better motion and resolution but inferior image adherence.
                                  </p>
                                </div>
                              </div>
                            )}
                        </div>
                        
                        {/* LoRA Settings */}
                        <div className="space-y-4 p-4 border rounded-lg bg-card">
                            <h3 className="font-light text-sm">LoRA Models</h3>
                            
                            <Button type="button" variant="outline" className="w-full" onClick={() => loraManager.setIsLoraModalOpen(true)}>
                                Add or Manage LoRAs
                            </Button>
                            
                            <ActiveLoRAsDisplay
                                selectedLoras={loraManager.selectedLoras}
                                onRemoveLora={loraManager.handleRemoveLora}
                                onLoraStrengthChange={loraManager.handleLoraStrengthChange}
                                availableLoras={availableLoras}
                                className="mt-4"
                                onAddTriggerWord={loraManager.handleAddTriggerWord}
                                renderHeaderActions={loraManager.renderHeaderActions}
                            />
                        </div>
                    </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <LoraSelectorModal
        isOpen={loraManager.isLoraModalOpen}
        onClose={() => loraManager.setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={loraManager.handleAddLora}
        onRemoveLora={loraManager.handleRemoveLora}
        onUpdateLoraStrength={loraManager.handleLoraStrengthChange}
        selectedLoras={loraManager.selectedLoras.map(lora => {
          const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
          return {
            ...fullLora,
            "Model ID": lora.id,
            Name: lora.name,
            strength: lora.strength,
          } as any;
        })}
        lora_type="Wan 2.1 14b"
      />
      
      <SettingsModal
        isOpen={state.isSettingsModalOpen}
        onOpenChange={actions.setSettingsModalOpen}
      />
    </div>
  );
};

export default ShotEditor; 