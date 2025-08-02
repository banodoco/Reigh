import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { ShotEditorProps, GenerationsPaneSettings } from './state/types';
import { useShotEditorState } from './state/useShotEditorState';
import { useGenerationActions } from './hooks/useGenerationActions';
import { useLoraSync } from './hooks/useLoraSync';
import { Header } from './ui/Header';
import { ImageManagerSkeleton } from './ui/Skeleton';
import { filterAndSortShotImages, getNonVideoImages, getVideoOutputs } from './utils/generation-utils';
import { getDimensions, DEFAULT_RESOLUTION } from './utils/dimension-utils';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';

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
}) => {
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const { getApiKey } = useApiKeys();
  
  // Load complete shot data and images
  const { shots } = useShots(); // Get shots from context for shot metadata
  const selectedShot = shots?.find(shot => shot.id === selectedShotId);
  const { data: orderedShotImages = [] } = useAllShotGenerations(selectedShotId);
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
  
  const setTimelineFramePositions = useCallback((newMap: Map<string, number>) => {
    try {
      updateShotUISettings('shot', { timelineFramePositions: [...newMap.entries()] });
    } catch (error) {
      console.warn('[ShotEditor] Failed to save timeline positions:', error);
    }
  }, [updateShotUISettings]);
  
  const isMobile = useIsMobile();
  const { setIsGenerationsPaneLocked } = usePanes();

  // Persistent state for GenerationsPane settings (shared with useGenerationsPageLogic)
  const [shotSettings, setShotSettings] = usePersistentState<Record<string, GenerationsPaneSettings>>(
    'generations-pane-shot-settings',
    {}
  );

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
  const updateGenerationsPaneSettings = (settings: GenerationsPaneSettings) => {
    if (selectedShot?.id) {
    setShotSettings(prev => ({
      ...prev,
      [selectedShot.id]: settings
    }));
    }
  };

  // Detect if settings never finish loading (e.g., network hiccup on mobile)
  useEffect(() => {
    if (!settingsLoading) {
      // Reset any existing error once loading completes successfully
      actions.setSettingsError(null);
      return;
    }

    // Give the settings query a reasonable grace period before timing-out
    const fallbackTimer = setTimeout(() => {
      console.warn('[ShotEditor] Settings failed to load within expected time. Falling back to defaults.');
      actions.setSettingsError('Failed to load saved settings – using defaults.');
      actions.setModeReady(true);
    }, 5000); // 5s timeout - now reasonable with optimized queries and retry logic

    return () => clearTimeout(fallbackTimer);
  }, [settingsLoading, actions]);

  // Reset mode readiness when shot changes
  useEffect(() => {
    if (selectedShot?.id) {
      actions.setModeReady(false);
    }
  }, [selectedShot?.id, actions]);

  // Handle generation mode setup and readiness
  useEffect(() => {
    // Wait for settings to load (main settings, UI settings, and LoRA settings)
    if (settingsLoading || isShotUISettingsLoading || isShotLoraSettingsLoading) {
      return;
    }

    // If we previously bailed out due to a settings load error, we're already ready
    if (state.settingsError) {
      return;
    }

    // For mobile users, ensure batch mode
    if (isMobile && generationMode !== 'batch') {
      onGenerationModeChange('batch');
      // Don't set ready yet - the mode change will trigger this effect again
      return;
    }

    // At this point, settings are loaded and mode is correct (or we're not on mobile)
    // Use a small timeout to prevent flicker but make it consistent
    const timer = setTimeout(() => {
      actions.setModeReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [isMobile, generationMode, settingsLoading, isShotUISettingsLoading, isShotLoraSettingsLoading, onGenerationModeChange, state.settingsError, actions]);

  // Accelerated mode and random seed from database settings
  // Default accelerated mode to true when it has never been explicitly set for this shot
  const accelerated = shotUISettings?.acceleratedMode ?? true;
  const randomSeed = shotUISettings?.randomSeed ?? false;
  
  // Jump to appropriate step count when accelerated mode changes (but don't enforce afterward)
  const prevAcceleratedRef = useRef(accelerated);
  useEffect(() => {
    // Only change steps when accelerated mode actually changes, not on every render
    if (prevAcceleratedRef.current !== accelerated) {
      prevAcceleratedRef.current = accelerated;
      
      if (accelerated) {
        onBatchVideoStepsChange(8);
      } else {
        onBatchVideoStepsChange(20);
      }
    }
  }, [accelerated, onBatchVideoStepsChange]);
  
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
      onSteerableMotionSettingsChange({ seed: 789 });
    }
  }, [setRandomSeed, onSteerableMotionSettingsChange]);

  // Handle accelerated mode changes
  const handleAcceleratedChange = useCallback((value: boolean) => {
    setAccelerated(value);
    actions.setShowStepsNotification(false); // Reset notification
    // Note: Step changes are handled automatically by the useEffect above
  }, [setAccelerated, actions]);
  
  // Handle manual steps change in accelerated mode
  const handleStepsChange = useCallback((steps: number) => {
    onBatchVideoStepsChange(steps);
    
    // Show notification if manually changing steps in accelerated mode (but allow the change)
    if (accelerated && steps !== 8) {
      actions.setShowStepsNotification(true);
      // Hide notification after 5 seconds
      setTimeout(() => actions.setShowStepsNotification(false), 5000);
    } else {
      actions.setShowStepsNotification(false);
    }
  }, [accelerated, onBatchVideoStepsChange, actions]);

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

  const handleNameCancel = () => {
    actions.setEditingNameValue(selectedShot?.name || '');
    actions.setEditingName(false);
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
  }, [selectedShot, projectId, updateShotImageOrderMutation]);

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
      debug: steerableMotionSettings.debug,
      // Force these settings to false always, except apply_causvid which follows accelerated mode
      apply_reward_lora: false,
      apply_causvid: accelerated,
      use_lighti2x_lora: false,
      show_input_images: false,
      colour_match_videos: steerableMotionSettings.colour_match_videos ?? true,
      fade_in_duration: steerableMotionSettings.fade_in_duration,
      fade_out_duration: steerableMotionSettings.fade_out_duration,
      after_first_post_generation_saturation: steerableMotionSettings.after_first_post_generation_saturation,
      after_first_post_generation_brightness: steerableMotionSettings.after_first_post_generation_brightness,
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
    if (selectedShot?.id) {
      updateGenerationsPaneSettings({
        selectedShotFilter: selectedShot.id,
        excludePositioned: true,
      });
    }

    if (isMobile) {
      // Dispatch a global event to request the Generations pane to open
      window.dispatchEvent(new CustomEvent('openGenerationsPane'));
    } else {
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
          videoOutputs={videoOutputs} 
          onDelete={generationActions.handleDeleteVideoOutput}
          deletingVideoId={state.deletingVideoId}
          onApplySettings={() => {}} // TODO: implement
          onApplySettingsFromTask={() => {}} // TODO: implement
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
                        
                        {/* LoRA Settings (Mobile) */}
                        <div className="block lg:hidden mt-6">
                            <div className="space-y-4 p-4 border rounded-lg bg-card">
                                <h3 className="font-semibold text-sm">LoRA Models</h3>
                                
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

                    {/* Right Column: LoRA Settings (Desktop) */}
                    <div className="hidden lg:block lg:w-80 order-1 lg:order-2">
                        <div className="space-y-4 p-4 border rounded-lg bg-card">
                            <h3 className="font-semibold text-sm">LoRA Models</h3>
                            
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