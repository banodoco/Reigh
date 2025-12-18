import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useProject } from "@/shared/contexts/ProjectContext";
import { toast } from "sonner";
import { useUpdateShotImageOrder, useCreateShot, useAddImageToShotWithoutPosition } from "@/shared/hooks/useShots";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useDeviceDetection } from "@/shared/hooks/useDeviceDetection";
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import { GenerationRow } from '@/types/shots';
import VideoOutputsGallery from "../VideoOutputsGallery";
import BatchSettingsForm from "../BatchSettingsForm";
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { MotionControl } from '../MotionControl';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { usePanes } from '@/shared/contexts/PanesContext';
import ShotImagesEditor from '../ShotImagesEditor';
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useAllShotGenerations, useTimelineImages, useUnpositionedImages, useVideoOutputs } from '@/shared/hooks/useShotGenerations';
import usePersistentState from '@/shared/hooks/usePersistentState';
import { useShots } from '@/shared/contexts/ShotsContext';
import SettingsModal from '@/shared/components/SettingsModal';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Import modular components and hooks
import { ShotEditorProps, GenerationsPaneSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './state/types';
import { useShotEditorState } from './state/useShotEditorState';
import { useGenerationActions } from './hooks/useGenerationActions';
import { useLoraSync } from './hooks/useLoraSync';
import { useApplySettingsHandler } from './hooks/useApplySettingsHandler';
import { useStructureVideo } from './hooks/useStructureVideo';
import { Header } from './ui/Header';
import { ImageManagerSkeleton } from './ui/Skeleton';
import { filterAndSortShotImages, getNonVideoImages, getVideoOutputs } from './utils/generation-utils';
import { isVideoGeneration, isPositioned, sortByTimelineFrame } from '@/shared/lib/typeGuards';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/useShots';
import { useUpdateGenerationLocation } from '@/shared/hooks/useGenerations';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import * as ApplySettingsService from './services/applySettingsService';
import { generateVideo } from './services/generateVideoService';
import { GenerateVideoCTA } from '../GenerateVideoCTA';
import { useRenderCount } from '@/shared/components/debug/RefactorMetricsCollector';

const ShotEditor: React.FC<ShotEditorProps> = ({
  selectedShotId,
  projectId,
  optimisticShotData,
  videoPairConfigs,
  videoControlMode,
  batchVideoPrompt,
  batchVideoFrames,
  // batchVideoContext, // Removed
  onShotImagesUpdate,
  onBack,
  onVideoControlModeChange,
  // Refs from parent for floating UI
  headerContainerRef: parentHeaderRef,
  timelineSectionRef: parentTimelineRef,
  ctaContainerRef: parentCtaRef,
  onSelectionChange: parentOnSelectionChange,
  getGenerationDataRef: parentGetGenerationDataRef,
  generateVideoRef: parentGenerateVideoRef,
  nameClickRef: parentNameClickRef,
  // CTA state from parent
  variantName: parentVariantName,
  onVariantNameChange: parentOnVariantNameChange,
  isGeneratingVideo: parentIsGeneratingVideo,
  videoJustQueued: parentVideoJustQueued,
  onPairConfigChange,
  onBatchVideoPromptChange,
  onBatchVideoFramesChange,
  // onBatchVideoContextChange, // Removed
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
  selectedLoras: selectedLorasFromProps,
  onSelectedLorasChange: onSelectedLorasChangeFromProps,
  enhancePrompt,
  onEnhancePromptChange,
  turboMode,
  onTurboModeChange,
  amountOfMotion,
  onAmountOfMotionChange,
  motionMode = 'basic',
  onMotionModeChange,
  generationTypeMode = 'i2v',
  onGenerationTypeModeChange,
  phaseConfig,
  onPhaseConfigChange,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  onBlurSave,
  onRestoreDefaults,
  generationMode,
  onGenerationModeChange,
  // selectedMode and onModeChange removed - now hardcoded to use specific model
  textBeforePrompts,
  onTextBeforePromptsChange,
  textAfterPrompts,
  onTextAfterPromptsChange,
  onPreviousShot,
  onNextShot,
  onPreviousShotNoScroll,
  onNextShotNoScroll,
  hasPrevious,
  hasNext,
  onUpdateShotName,
  settingsLoading,
  getShotVideoCount,
  invalidateVideoCountsCache,
}) => {
  // [RefactorMetrics] Track render count for baseline measurements
  useRenderCount('ShotEditor');
  
  // Derive advancedMode from motionMode - single source of truth
  const advancedMode = motionMode === 'advanced';
  
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  
  // Load complete shot data and images
  const { shots } = useShots(); // Get shots from context for shot metadata
  
  // [FlickerFix] Persist the last valid shot object to prevent UI flickering during refetches
  // When duplicating items, the shots list might briefly refetch, causing selectedShot to be undefined
  const foundShot = useMemo(() => shots?.find(shot => shot.id === selectedShotId), [shots, selectedShotId]);
  const lastValidShotRef = useRef<typeof foundShot>();
  
  // Update ref if we found the shot
  if (foundShot) {
    lastValidShotRef.current = foundShot;
  }
  
  // Use found shot if available, otherwise fallback to:
  // 1. Optimistic shot data (for newly created shots not in cache yet)
  // 2. Cached version if shots list is loading/refreshing
  // Only use cache fallback if shots is undefined/null (loading), not if it's an empty array (loaded but missing)
  const selectedShot = foundShot || optimisticShotData || (shots === undefined ? lastValidShotRef.current : undefined);
  
  // [SelectorDebug] Track shot selection changes
  React.useEffect(() => {
    console.log('[SelectorDebug] 🎯 Shot selection state:', {
      selectedShotId: selectedShotId?.substring(0, 8),
      foundShotId: foundShot?.id?.substring(0, 8),
      optimisticShotId: optimisticShotData?.id?.substring(0, 8),
      lastValidShotId: lastValidShotRef.current?.id?.substring(0, 8),
      resolvedShotId: selectedShot?.id?.substring(0, 8),
      shotsArrayLength: shots?.length,
      shotsUndefined: shots === undefined,
      foundShotImagesCount: foundShot?.images?.length,
    });
  }, [selectedShotId, foundShot, optimisticShotData, selectedShot, shots]);
  
  // 🎯 PERF FIX: Create refs for values that are used in callbacks but shouldn't cause callback recreation
  // This prevents the cascade of 22+ callback recreations on every shot/settings change
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Shot management hooks for external generation viewing
  const { mutateAsync: createShotMutation } = useCreateShot();
  const { mutateAsync: addToShotMutation } = useAddImageToShot();
  const { mutateAsync: addToShotWithoutPositionMutation } = useAddImageToShotWithoutPosition();

  // 🎯 PERF FIX: Refs for mutation functions to prevent callback recreation
  // React Query mutations change reference on state changes (idle → pending → success)
  const createShotMutationRef = useRef(createShotMutation);
  createShotMutationRef.current = createShotMutation;
  const addToShotMutationRef = useRef(addToShotMutation);
  addToShotMutationRef.current = addToShotMutation;
  const addToShotWithoutPositionMutationRef = useRef(addToShotWithoutPositionMutation);
  addToShotWithoutPositionMutationRef.current = addToShotWithoutPositionMutation;

  // 🎯 PERF FIX: Refs for parent callbacks to prevent child callback recreation
  const parentOnSelectionChangeRef = useRef(parentOnSelectionChange);
  parentOnSelectionChangeRef.current = parentOnSelectionChange;
  const onSteerableMotionSettingsChangeRef = useRef(onSteerableMotionSettingsChange);
  onSteerableMotionSettingsChangeRef.current = onSteerableMotionSettingsChange;
  
  // Compute effective aspect ratio: prioritize shot-level over project-level
  // This ensures videos in VideoOutputsGallery, items in Timeline, and other components
  // use the shot's aspect ratio when set, otherwise fall back to project aspect ratio
  const effectiveAspectRatio = useMemo(() => {
    const projectAspectRatio = projects.find(p => p.id === projectId)?.aspectRatio;
    return selectedShot?.aspect_ratio || projectAspectRatio;
  }, [selectedShot?.aspect_ratio, projects, projectId]);
  
  // Structure video management (extracted to hook)
  const {
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    handleStructureVideoChange,
    isLoading: isStructureVideoSettingsLoading,
  } = useStructureVideo({
    projectId,
    shotId: selectedShot?.id,
  });

  // Auto-switch generationTypeMode when structure video is added/removed
  // When structure video is added, switch to VACE; when removed, switch to I2V
  const prevStructureVideoPath = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Skip if handler is not available
    if (!onGenerationTypeModeChange) return;
    
    // Skip on first render (undefined -> initial value)
    if (prevStructureVideoPath.current === undefined) {
      prevStructureVideoPath.current = structureVideoPath;
      return;
    }
    
    const wasAdded = !prevStructureVideoPath.current && structureVideoPath;
    const wasRemoved = prevStructureVideoPath.current && !structureVideoPath;
    
    if (wasAdded && generationTypeMode !== 'vace') {
      console.log('[GenerationTypeMode] Auto-switching to VACE because structure video was added');
      onGenerationTypeModeChange('vace');
    } else if (wasRemoved && generationTypeMode !== 'i2v') {
      console.log('[GenerationTypeMode] Auto-switching to I2V because structure video was removed');
      onGenerationTypeModeChange('i2v');
    }
    
    prevStructureVideoPath.current = structureVideoPath;
  }, [structureVideoPath, generationTypeMode, onGenerationTypeModeChange]);

  // PERFORMANCE OPTIMIZATION: Prefetch adjacent shots for faster navigation
  React.useEffect(() => {
    if (!shots || !selectedShotId) return;
    
    const currentIndex = shots.findIndex(shot => shot.id === selectedShotId);
    if (currentIndex === -1) return;
    
    // Prefetch previous and next shot data in background
    const prefetchShots = [];
    if (currentIndex > 0) prefetchShots.push(shots[currentIndex - 1].id); // Previous
    if (currentIndex < shots.length - 1) prefetchShots.push(shots[currentIndex + 1].id); // Next
    
    // Only prefetch if not already in context
    prefetchShots.forEach(shotId => {
      const shot = shots.find(s => s.id === shotId);
      if (shot && shot.images && shot.images.length === 0) {
        // This shot doesn't have images loaded yet - could prefetch here
        console.log('[PERF] Could prefetch shot data for:', shotId);
      }
    });
  }, [shots, selectedShotId]);
  
  // PERFORMANCE OPTIMIZATION: Use context images when available since they're already loaded
  // Only fall back to detailed query if context data is insufficient
  const contextImages = selectedShot?.images || [];
  
  // [VideoLoadSpeedIssue] AGGRESSIVE OPTIMIZATION: Use memoized values to prevent re-render loops
  const hasContextData = React.useMemo(() => contextImages.length > 0, [contextImages.length]);
  
  // [ShotNavPerf] PERFORMANCE FIX: Always fetch full data in background, but don't block UI
  // We'll use context images immediately while the query runs asynchronously
  const shouldLoadDetailedData = React.useMemo(() => 
    !!selectedShotId, // Always load full data in editor mode for pair prompts, mutations, etc.
    [selectedShotId]
  );
  
  // Always enable query to get full data (needed for mutations and pair prompts)
  const queryKey = shouldLoadDetailedData ? selectedShotId : null;
  
  console.log('[VideoLoadSpeedIssue] ShotEditor optimization decision:', {
    selectedShotId,
    contextImagesCount: contextImages.length,
    hasContextData,
    shouldLoadDetailedData,
    queryKey,
    willQueryDatabase: shouldLoadDetailedData,
    timestamp: Date.now()
  });
  
  // CRITICAL: Only call useAllShotGenerations when we genuinely need detailed data
  // Using disabled query when context data is available
  console.log('[ShotNavPerf] 🎬 ShotEditor calling useAllShotGenerations', {
    queryKey: queryKey?.substring(0, 8) || 'null',
    selectedShotId: selectedShotId?.substring(0, 8),
    hasContextImages: contextImages.length > 0,
    timestamp: Date.now()
  });
  
  // [ShotNavPerf] CRITICAL FIX: Pass disableRefetch during initial load to prevent query storm
  // The query will still run once, but won't refetch on every render
  const fullImagesQueryResult = useAllShotGenerations(queryKey, {
    disableRefetch: false // Let it fetch normally, we'll use context images as placeholder
  });
  
  const fullShotImages = fullImagesQueryResult.data || [];
  const isLoadingFullImages = fullImagesQueryResult.isLoading;
  
  console.log('[ShotNavPerf] ✅ ShotEditor useAllShotGenerations result:', {
    imagesCount: fullShotImages.length,
    isLoading: fullImagesQueryResult.isLoading,
    isFetching: fullImagesQueryResult.isFetching,
    isError: fullImagesQueryResult.isError,
    error: fullImagesQueryResult.error?.message,
    dataUpdatedAt: fullImagesQueryResult.dataUpdatedAt,
    fetchStatus: fullImagesQueryResult.fetchStatus,
    timestamp: Date.now()
  });

  // Query for the most recent video generation for this shot (for preset sample)
  const { data: lastVideoGeneration } = useQuery({
    queryKey: ['last-video-generation', selectedShotId],
    queryFn: async () => {
      if (!selectedShotId) return null;
      
      // Query through shot_generations join table since shot_data column doesn't exist on generations
      const { data, error } = await supabase
        .from('shot_generations')
        .select(`
          generation:generations!inner (
            id,
            location,
            type,
            created_at
          )
        `)
        .eq('shot_id', selectedShotId);
      
      if (error) {
        console.log('[PresetAutoPopulate] No last video found for shot:', error);
        return null;
      }
      
      // Filter to video types and sort by created_at in JS
      const videos = (data || [])
        .filter(sg => (sg.generation as any)?.type?.includes('video'))
        .sort((a, b) => {
          const dateA = new Date((a.generation as any)?.created_at || 0).getTime();
          const dateB = new Date((b.generation as any)?.created_at || 0).getTime();
          return dateB - dateA; // Descending
        });
      
      return videos[0] ? (videos[0].generation as any)?.location : null;
    },
    enabled: !!selectedShotId,
    staleTime: 30000, // Cache for 30 seconds
  });
  
    // CRITICAL FIX: Always use full images when available in editor mode to ensure consistency
  // This prevents video pair config mismatches between VideoTravelToolPage and ShotEditor
  
  // [SelectorPattern] Use selector hooks for filtered views of shot data.
  // Cache is primed by VideoTravelToolPage, so selectors have data immediately.
  // Optimistic updates in mutations update the cache; selectors automatically reflect changes.
  const timelineImagesQuery = useTimelineImages(selectedShotId);
  const unpositionedImagesQuery = useUnpositionedImages(selectedShotId);
  const videoOutputsQuery = useVideoOutputs(selectedShotId);
  
  // Selector data (or empty arrays while loading)
  const timelineImages = timelineImagesQuery.data || [];
  const unpositionedImages = unpositionedImagesQuery.data || [];
  const videoOutputs = videoOutputsQuery.data || [];
  
  // All shot images - with cache priming, fullShotImages has data immediately
  // This is passed to children that need all data (not just filtered views)
  const allShotImages = fullShotImages;
  
  console.log('[SelectorPattern] Shot data from selectors:', {
    shotId: selectedShotId?.substring(0, 8),
    allImages: allShotImages.length,
    timelineImages: timelineImages.length,
    unpositionedImages: unpositionedImages.length,
    videoOutputs: videoOutputs.length,
    cacheStatus: fullImagesQueryResult.isFetching ? 'fetching' : 'ready',
  });

  // Refs for stable access inside callbacks (avoid callback recreation on data changes)
  const allShotImagesRef = useRef<GenerationRow[]>(allShotImages);
  allShotImagesRef.current = allShotImages;
  const batchVideoFramesRef = useRef(batchVideoFrames);
  batchVideoFramesRef.current = batchVideoFrames;

  
  // [SelectorPattern] Track image data loading progress
  React.useEffect(() => {
    console.log('[SelectorPattern] ShotEditor image data update:', {
      selectedShotId,
      allShotImagesCount: allShotImages.length,
      timelineImagesCount: timelineImages.length,
      unpositionedImagesCount: unpositionedImages.length,
      videoOutputsCount: videoOutputs.length,
      isLoadingFullImages,
      hasContextData,
      timestamp: Date.now(),
    });
  }, [selectedShotId, allShotImages.length, timelineImages.length, unpositionedImages.length, videoOutputs.length, isLoadingFullImages, hasContextData]);
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  
  // Flag to skip next prop sync after successful operations
  const skipNextSyncRef = useRef(false);
  
  // Shot-specific UI settings stored in database
  const { 
    settings: shotUISettings, 
    update: updateShotUISettings,
    isLoading: isShotUISettingsLoading 
  } = useToolSettings<{
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
  
  // Timeline positions now come directly from database via useEnhancedShotPositions
  // No local caching needed
  
  // Timeline positions are now managed directly by the database via useEnhancedShotPositions
  // No local caching or debouncing needed
  
  // Get pair prompts data for checking if all pairs have prompts
  const { pairPrompts, shotGenerations, clearAllEnhancedPrompts, updatePairPromptsByIndex, loadPositions } = useEnhancedShotPositions(selectedShotId);
  
  // Wrap onBatchVideoPromptChange to also clear all enhanced prompts when base prompt changes
  const handleBatchVideoPromptChangeWithClear = useCallback(async (newPrompt: string) => {
    console.log('[PromptClearLog] 🔔 BASE PROMPT CHANGED - Starting clear process', {
      trigger: 'base_prompt_change',
      oldPrompt: batchVideoPrompt,
      newPrompt: newPrompt,
      shotId: selectedShotId?.substring(0, 8)
    });
    
    // First update the base prompt
    onBatchVideoPromptChange(newPrompt);
    
    // Then clear all enhanced prompts for the shot
    try {
      await clearAllEnhancedPrompts();
      console.log('[PromptClearLog] ✅ BASE PROMPT CHANGED - Successfully cleared all enhanced prompts', {
        trigger: 'base_prompt_change',
        shotId: selectedShotId?.substring(0, 8)
      });
    } catch (error) {
      console.error('[PromptClearLog] ❌ BASE PROMPT CHANGED - Error clearing enhanced prompts:', error);
    }
  }, [onBatchVideoPromptChange, clearAllEnhancedPrompts, batchVideoPrompt, selectedShotId]);
  
  // Check if all pairs (except the last one) have custom prompts
  const allPairsHavePrompts = React.useMemo(() => {
    if (generationMode !== 'timeline' || !shotGenerations?.length) {
      return false;
    }
    
    // Calculate number of pairs (frames - 1)
    const numPairs = Math.max(0, shotGenerations.length - 1);
    if (numPairs === 0) return false;
    
    // Check if all pairs have custom prompts
    for (let i = 0; i < numPairs; i++) {
      const pairPrompt = pairPrompts[i]?.prompt;
      if (!pairPrompt || !pairPrompt.trim()) {
        return false; // This pair doesn't have a custom prompt
      }
    }
    
    return true; // All pairs have custom prompts
  }, [generationMode, shotGenerations, pairPrompts]);
  
  const isMobile = useIsMobile();
  
  // Device detection (extracted to shared hook)
  const { isTablet, isPhone, orientation, mobileColumns } = useDeviceDetection();
  const { 
    setIsGenerationsPaneLocked,
    isShotsPaneLocked,
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();

  // Effective generation mode: phones always use batch mode locally (even if saved setting is timeline)
  // This ensures Duration per Pair slider works on mobile
  const effectiveGenerationMode = isPhone ? 'batch' : generationMode;

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

  // 🎯 PERF FIX: Refs for context/hook values to prevent callback recreation
  const setIsGenerationsPaneLockedRef = useRef(setIsGenerationsPaneLocked);
  setIsGenerationsPaneLockedRef.current = setIsGenerationsPaneLocked;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const updateShotGenerationsPaneSettingsRef = useRef(updateShotGenerationsPaneSettings);
  updateShotGenerationsPaneSettingsRef.current = updateShotGenerationsPaneSettings;

  // [SelectorPattern] Timeline-ready images come directly from selector
  // Cache priming ensures instant data; optimistic updates keep it fresh
  const timelineReadyImages = timelineImages;

  // Sticky header visibility similar to ImageGenerationToolPage
  // ============================================================================
  // REFS FOR PARENT-CONTROLLED FLOATING UI
  // ============================================================================
  // Parent provides callback refs for floating UI elements
  // These refs notify the parent when DOM elements are attached
  // (No local fallback needed - floating UI is parent's responsibility)
  
  // Other local refs
  const centerSectionRef = useRef<HTMLDivElement>(null);
  const videoGalleryRef = useRef<HTMLDivElement>(null);
  const generateVideosCardRef = useRef<HTMLDivElement>(null);
  
  // Selection state (forwarded to parent for floating button control)
  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const handleSelectionChange = useCallback((hasSelection: boolean) => {
    parentOnSelectionChangeRef.current?.(hasSelection);
  }, []);

  // STICKY HEADER & FLOATING CTA LOGIC MOVED TO PARENT (VideoTravelToolPage)
  // Parent manages:
  // - Scroll detection via useStickyHeader and useFloatingCTA hooks
  // - Rendering of floating elements
  // - Element visibility and positioning
  // - Click handlers for floating UI that scroll and trigger actions

  // Use the LoRA sync hook with props from parent
  // These props connect to VideoTravelSettings for persistence
  const { loraManager } = useLoraSync({
    selectedLoras: selectedLorasFromProps || [],
    onSelectedLorasChange: onSelectedLorasChangeFromProps || (() => {}),
    projectId: selectedProjectId,
    availableLoras,
    batchVideoPrompt,
    onBatchVideoPromptChange,
  });
  
  // LoRA loading state - set to false since the new hook doesn't have async loading
  // (the old implementation had shot-specific LoRA settings from database)
  const isShotLoraSettingsLoading = false;

  // Expose shot-specific generation data to parent via mutable ref
  // This is called by parent (VideoTravelToolPage) when generating video
  useEffect(() => {
    if (parentGetGenerationDataRef) {
      // Store the callback that returns current generation data
      parentGetGenerationDataRef.current = () => {
        return {
          structureVideo: {
            path: structureVideoPath,
            type: structureVideoType === 'flow' ? null : structureVideoType,
            treatment: structureVideoTreatment === 'adjust' ? 'image' : structureVideoTreatment === 'clip' ? 'video' : 'image',
            motionStrength: structureVideoMotionStrength
          },
          aspectRatio: effectiveAspectRatio,
          loras: loraManager.selectedLoras.map(lora => ({
            id: lora.id,
            path: lora.path,
            strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
            name: lora.name
          })),
          clearEnhancedPrompts: clearAllEnhancedPrompts
        };
      };
    }
  }, [
    parentGetGenerationDataRef,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    effectiveAspectRatio,
    loraManager.selectedLoras,
    clearAllEnhancedPrompts
  ]);

  // Use generation actions hook
  const generationActions = useGenerationActions({
    state,
    actions,
    selectedShot: selectedShot || {} as any,
    projectId,
    batchVideoFrames,
    onShotImagesUpdate,
    orderedShotImages: allShotImages, // Pass all images; hook uses ref for stability
    skipNextSyncRef,
  });

  // REMOVED: Local optimistic list sync - no longer needed with two-phase loading

  // Function to update GenerationsPane settings for current shot
  // 🎯 STABILITY FIX: Wrap in useCallback to prevent recreation on every render
  const selectedShotIdRef = useRef(selectedShotId);
  selectedShotIdRef.current = selectedShotId;
  
  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const updateGenerationsPaneSettings = useCallback((settings: Partial<GenerationsPaneSettings>) => {
    const shotId = selectedShotIdRef.current;
    if (shotId) {
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter: settings.selectedShotFilter || shotId,
        excludePositioned: settings.excludePositioned ?? true,
        userHasCustomized: true // Mark as customized since this is being called programmatically
      };
      console.log('[ShotEditor] Updating GenerationsPane settings:', updatedSettings);
      updateShotGenerationsPaneSettingsRef.current('shot', updatedSettings);
    }
  }, []); // Uses refs for all dependencies

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

  // CRITICAL FIX: Reset mode readiness when shot changes ONLY if we don't have context images yet
  // If we have context images, stay ready and let settings refetch in the background
  // This prevents the unmount/remount cascade that was canceling image loads
  // 
  // [ZoomDebug] IMPORTANT: Only trigger on shot ID change, NOT on contextImages.length change!
  // contextImages can temporarily become empty during cache updates, which was causing
  // isModeReady to flip false->true and unmount/remount the Timeline (resetting zoom).
  const prevShotIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const shotId = selectedShot?.id;
    const shotIdChanged = shotId !== prevShotIdRef.current;
    
    if (shotId && shotIdChanged) {
      prevShotIdRef.current = shotId;
      const hasContextImages = contextImages.length > 0;
      if (hasContextImages) {
        // We have images - stay ready, let settings update in background
        console.log('[ShotNavPerf] 🚀 Shot changed but keeping ready state - we have context images', {
          shotId: shotId.substring(0, 8),
          contextImagesCount: contextImages.length
        });
        actions.setModeReady(true);
      } else {
        // No images yet - reset to loading state
        console.log('[ShotNavPerf] ⏳ Shot changed - resetting to loading state', {
          shotId: shotId.substring(0, 8)
        });
        actions.setModeReady(false);
      }
    }
    // Note: We intentionally DON'T include contextImages.length in deps
    // to prevent mode flipping when cache updates temporarily clear images
  }, [selectedShot?.id, actions]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle generation mode setup and readiness - AGGRESSIVE OPTIMIZATION for faster ready state
  const readinessState = React.useMemo(() => ({
    hasImageData: contextImages.length > 0,
    criticalSettingsReady: !settingsLoading, // Only wait for main settings, not UI/LoRA
    modeCorrect: !isPhone || generationMode === 'batch', // Tablets can use timeline mode
    hasError: !!state.settingsError,
    shotId: selectedShot?.id,
    isReady: state.isModeReady
  }), [contextImages.length, settingsLoading, isPhone, generationMode, state.settingsError, selectedShot?.id, state.isModeReady]);

  // Track if we've applied the mobile mode override to prevent re-triggering
  const mobileOverrideAppliedRef = useRef(false);
  
  // Reset mobile override flag when shot changes
  useEffect(() => {
    mobileOverrideAppliedRef.current = false;
  }, [selectedShot?.id]);
  
  useEffect(() => {
    const { hasImageData, criticalSettingsReady, modeCorrect, hasError, isReady } = readinessState;
    
    // Skip if already ready
    if (isReady) return;

    // Handle mobile mode correction - LOCAL OVERRIDE ONLY, don't save to database
    // This ensures opening a shot on mobile doesn't change the saved settings
    if (!modeCorrect && !mobileOverrideAppliedRef.current) {
      console.log('[MobileMode] Phone detected with timeline mode - applying local batch override (not saving to DB)');
      mobileOverrideAppliedRef.current = true;
      // Don't call onGenerationModeChange as that saves to DB
      // Just mark as ready - the UI will use batch mode based on isPhone check
      actions.setModeReady(true);
      return;
    }

    // Handle error recovery
    if (hasError) {
      actions.setModeReady(true);
      return;
    }

    // PERFORMANCE BOOST: Allow ready state if we have images + critical settings
    // Don't wait for UI/LoRA settings to prevent 8+ second delays
    if (hasImageData && criticalSettingsReady) {
      console.log('[PERF] Fast-track ready state - images available', {
        shotId: selectedShot?.id,
        imagesCount: contextImages.length
      });
      actions.setModeReady(true);
      return;
    }

    // For shots without images, wait for all settings
    if (!hasImageData && !settingsLoading && !isShotUISettingsLoading && !isShotLoraSettingsLoading) {
      actions.setModeReady(true);
    }
  }, [readinessState, onGenerationModeChange, actions, selectedShot?.id, contextImages.length, isShotUISettingsLoading, isShotLoraSettingsLoading]);

  // Accelerated mode and random seed from database settings
  // Default accelerated mode to false when it has never been explicitly set for this shot
  const accelerated = shotUISettings?.acceleratedMode ?? false;
  const randomSeed = shotUISettings?.randomSeed ?? false;
  
  // Always use 6 steps for the hardcoded model
  const getRecommendedSteps = useCallback((modelName: string, isAccelerated: boolean) => {
    return 6; // Always use 6 steps for the hardcoded model
  }, []);

  const updateStepsForCurrentSettings = useCallback(() => {
    const recommendedSteps = getRecommendedSteps(steerableMotionSettings.model_name, accelerated);
    onBatchVideoStepsChange(recommendedSteps);
  }, [getRecommendedSteps, steerableMotionSettings.model_name, accelerated, onBatchVideoStepsChange]);

  // Track previous values to detect changes
  const prevAcceleratedRef = useRef(accelerated);
  const prevModelRef = useRef(steerableMotionSettings.model_name);
  const hasInitializedStepsRef = useRef(false);
  
  useEffect(() => {
    // CRITICAL: Wait until settings finish loading before tracking changes
    // This prevents treating initial load changes as user actions
    if (isShotUISettingsLoading || settingsLoading) {
      console.log('[PromptRetentionDebug] [ShotEditor] Settings still loading - skipping step auto-adjustment');
      return;
    }
    
    // Skip on first mount after settings load - just record initial state
    if (!hasInitializedStepsRef.current) {
      hasInitializedStepsRef.current = true;
      prevAcceleratedRef.current = accelerated;
      prevModelRef.current = steerableMotionSettings.model_name;
      console.log('[PromptRetentionDebug] [ShotEditor] Settings loaded - recording initial state, NOT auto-adjusting steps');
      return;
    }
    
    const acceleratedChanged = prevAcceleratedRef.current !== accelerated;
    const modelChanged = prevModelRef.current !== steerableMotionSettings.model_name;
    
    // Only auto-adjust steps when accelerated mode or model changes (not manual user input)
    if (acceleratedChanged || modelChanged) {
      console.log('[PromptRetentionDebug] [ShotEditor] Model/accelerated changed - auto-adjusting steps', {
        acceleratedChanged,
        modelChanged,
        from: prevAcceleratedRef.current,
        to: accelerated
      });
      updateStepsForCurrentSettings();
    }
    
    // Update refs
    prevAcceleratedRef.current = accelerated;
    prevModelRef.current = steerableMotionSettings.model_name;
  }, [accelerated, steerableMotionSettings.model_name, updateStepsForCurrentSettings, isShotUISettingsLoading, settingsLoading]);
  
  // Reset initialization flag when shot changes
  useEffect(() => {
    hasInitializedStepsRef.current = false;
    console.log('[PromptRetentionDebug] [ShotEditor] Shot changed - resetting step adjustment initialization');
  }, [selectedShot?.id]);
  
  const setAccelerated = useCallback((value: boolean) => {
    // Only save to shot level - project settings inherit automatically via useToolSettings merge
    updateShotUISettings('shot', { acceleratedMode: value });
  }, [updateShotUISettings]);
  
  const setRandomSeed = useCallback((value: boolean) => {
    // Only save to shot level - project settings inherit automatically via useToolSettings merge
    updateShotUISettings('shot', { randomSeed: value });
  }, [updateShotUISettings]);

  // Handle random seed changes
  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const handleRandomSeedChange = useCallback((value: boolean) => {
    setRandomSeed(value);
    if (value) {
      // Generate a random seed
      const newSeed = Math.floor(Math.random() * 1000000);
      onSteerableMotionSettingsChangeRef.current({ seed: newSeed });
    } else {
      // Set to default seed
      onSteerableMotionSettingsChangeRef.current({ seed: DEFAULT_STEERABLE_MOTION_SETTINGS.seed });
    }
  }, [setRandomSeed]);

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
    // Show notification if manually changing steps away from recommended value for any mode
    if (steps !== recommendedSteps) {
      actions.setShowStepsNotification(true);
      // Hide notification after 5 seconds
      setTimeout(() => actions.setShowStepsNotification(false), 5000);
    } else {
      actions.setShowStepsNotification(false);
    }
  }, [accelerated, steerableMotionSettings.model_name, getRecommendedSteps, onBatchVideoStepsChange, actions]);

  // Set model based on turbo mode
  useEffect(() => {
    const targetModel = turboMode ? 'vace_14B_fake_cocktail_2_2' : 'wan_2_2_i2v_lightning_baseline_2_2_2';
    if (steerableMotionSettings.model_name !== targetModel) {
      console.log(`[ShotEditor] Setting model based on turbo mode: ${targetModel} (turbo: ${turboMode})`);
      onSteerableMotionSettingsChange({ 
        model_name: targetModel
      });
    }
  }, [turboMode, steerableMotionSettings.model_name, onSteerableMotionSettingsChange]);

  // Update editing name when selected shot changes
  useEffect(() => {
    actions.setEditingNameValue(selectedShot?.name || '');
    actions.setEditingName(false);
  }, [selectedShot?.id, selectedShot?.name, actions]);

  const handleNameClick = useCallback(() => {
    if (onUpdateShotName) {
      actions.setEditingName(true);
    }
  }, [onUpdateShotName, actions]);

  const handleNameSave = useCallback(() => {
    if (onUpdateShotName && state.editingName.trim() && state.editingName.trim() !== selectedShot?.name) {
      onUpdateShotName(state.editingName.trim());
    }
    actions.setEditingName(false);
  }, [onUpdateShotName, state.editingName, selectedShot?.name, actions]);

  const handleNameCancel = useCallback((e?: React.MouseEvent) => {
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
  }, [selectedShot?.name, actions]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  }, [handleNameSave, handleNameCancel]);

  // [SelectorPattern] Filtered views now come from selector hooks defined above.
  // simpleFilteredImages is replaced by timelineImages (same filtering logic)
  // unpositionedImagesCount is replaced by unpositionedImages.length
  const simpleFilteredImages = timelineImages;
  const unpositionedImagesCount = unpositionedImages.length;

  // Auto-disable turbo mode when there are more than 2 images
  useEffect(() => {
    if (simpleFilteredImages.length > 2 && turboMode) {
      console.log(`[ShotEditor] Auto-disabling turbo mode - too many images (${simpleFilteredImages.length} > 2)`);
      onTurboModeChange(false);
    }
  }, [simpleFilteredImages.length, turboMode, onTurboModeChange]);

  // All modes are always available - no restrictions based on image count

  // Get model based on advanced mode (num_phases) or turbo mode
  const getModelName = () => {
    // In advanced mode, use num_phases to determine model
    if (advancedMode && phaseConfig) {
      const numPhases = phaseConfig.num_phases;
      let selectedModel: string;
      
      if (numPhases === 2) {
        selectedModel = 'wan_2_2_i2v_lightning_baseline_3_3';
      } else if (numPhases === 3) {
        selectedModel = 'wan_2_2_i2v_lightning_baseline_2_2_2';
      } else {
        // Fallback for other num_phases values
        selectedModel = 'wan_2_2_i2v_lightning_baseline_2_2_2';
      }
      
      console.log('[ModelSelection] Advanced Mode - Selected model based on phases:', {
        numPhases,
        selectedModel,
        advancedMode,
        timestamp: Date.now()
      });
      
      return selectedModel;
    }
    
    // In normal mode, use turbo mode setting
    const selectedModel = turboMode ? 'vace_14B_fake_cocktail_2_2' : 'wan_2_2_i2v_lightning_baseline_2_2_2';
    
    console.log('[ModelSelection] Normal Mode - Selected model based on turbo:', {
      turboMode,
      selectedModel,
      advancedMode: false,
      timestamp: Date.now()
    });
    
    return selectedModel;
  };

  // Mode synchronization removed - now hardcoded to use specific model
  // videoOutputs now comes from useVideoOutputs selector (defined above)

  // Mutations for applying settings/images from a task
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();

  // Import the stable callback hook at the top if not already done
  // This will be added to imports
  
  // Use stable callback hook to prevent VideoItem re-renders
  const applySettingsFromTask = useApplySettingsHandler({
    projectId,
    selectedShotId: selectedShot?.id || '',
    simpleFilteredImages,
    selectedShot,
    availableLoras,
    onBatchVideoPromptChange,
    onSteerableMotionSettingsChange,
    onBatchVideoFramesChange,
    // onBatchVideoContextChange, // Removed
    onBatchVideoStepsChange,
    onDimensionSourceChange,
    onCustomWidthChange,
    onCustomHeightChange,
    onGenerationModeChange,
    // onAdvancedModeChange now derived - convert to motionMode change
    onAdvancedModeChange: (advanced: boolean) => onMotionModeChange?.(advanced ? 'advanced' : 'basic'),
    onMotionModeChange,
    onGenerationTypeModeChange: onGenerationTypeModeChange || (() => {}),
    onPhaseConfigChange,
    onPhasePresetSelect,
    onPhasePresetRemove,
    onTurboModeChange,
    onEnhancePromptChange,
    onAmountOfMotionChange,
    onTextBeforePromptsChange,
    onTextAfterPromptsChange,
    handleStructureVideoChange,
    generationMode,
    generationTypeMode,
    advancedMode,
    motionMode,
    turboMode,
    enhancePrompt,
    amountOfMotion,
    textBeforePrompts,
    textAfterPrompts,
    batchVideoSteps,
    batchVideoFrames,
    // batchVideoContext, // Removed
    steerableMotionSettings,
    loraManager,
    addImageToShotMutation,
    removeImageFromShotMutation,
    updatePairPromptsByIndex,
    loadPositions,
  });

  // Early return check moved to end of component


  // 🎯 PERF FIX: Use refs to avoid callback recreation on shot/project changes
  const updateShotImageOrderMutationRef = useRef(updateShotImageOrderMutation);
  updateShotImageOrderMutationRef.current = updateShotImageOrderMutation;
  
  const handleReorderImagesInShot = useCallback((orderedShotGenerationIds: string[], draggedItemId?: string) => {
    // DragDebug: handleReorderImagesInShot called
    // NOTE: draggedItemId is currently unused here as this function recalculates all positions
    // It's passed through for interface compatibility
    const shot = selectedShotRef.current;
    const projId = projectIdRef.current;
    
    if (!shot || !projId) {
      console.error('Cannot reorder images: No shot or project selected.');
      return;
    }

    console.log('[ShotEditor] Reordering images in shot', {
      shotId: shot.id,
      projectId: projId,
      orderedShotGenerationIds: orderedShotGenerationIds,
      timestamp: Date.now()
    });

    // Update the order on the server
    // NOTE: useUpdateShotImageOrder expects `updates`, not `orderedShotGenerationIds`.
    // Convert ordered IDs into timeline_frame updates using existing frame spacing rules.
    const updates = orderedShotGenerationIds.map((shotGenerationId, index) => ({
      // useUpdateShotImageOrder's mutationFn matches on shot_id + generation_id (see useShots.ts).
      // Our IDs here are shot_generations.id, so we must look up generation_id from current data.
      shot_id: shot.id,
      generation_id: (() => {
        const img = allShotImagesRef.current?.find((i: any) => i.id === shotGenerationId);
        return (img as any)?.generation_id ?? (img as any)?.generationId ?? shotGenerationId;
      })(),
      timeline_frame: index * batchVideoFramesRef.current,
    }));

    updateShotImageOrderMutationRef.current.mutate({
      shotId: shot.id,
      projectId: projId,
      updates,
    }, {
      onError: (error) => {
        console.error('[ShotEditor] Failed to reorder images:', error);
        // The mutation's onError will handle showing the error message and reverting optimistic updates
      }
    });
  }, []); // Empty deps - uses refs

  // 🎯 PERF FIX: Use ref to avoid unstable dependency on pendingFramePositions Map
  const pendingFramePositionsRef = useRef(state.pendingFramePositions);
  pendingFramePositionsRef.current = state.pendingFramePositions;
  
  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const handlePendingPositionApplied = useCallback((generationId: string) => {
    const newMap = new Map(pendingFramePositionsRef.current);
    if (newMap.has(generationId)) {
      newMap.delete(generationId);
      console.log(`[ShotEditor] Cleared pending position for gen ${generationId}`);
    }
    actionsRef.current.setPendingFramePositions(newMap);
  }, []);

  // Local state for steerable motion task creation
  const [isSteerableMotionEnqueuing, setIsSteerableMotionEnqueuing] = useState(false);
  const [steerableMotionJustQueued, setSteerableMotionJustQueued] = useState(false);

  // Note: variantName is now managed by parent (VideoTravelToolPage)
  // and passed as parameter to handleGenerateBatch

  const isGenerationDisabled = isSteerableMotionEnqueuing;

  // Handle video generation - accepts variantName as parameter from parent
  // Now uses generateVideoService for the complex logic
  const handleGenerateBatch = useCallback(async (variantNameParam: string) => {
    // Set loading state immediately to provide instant user feedback
    setIsSteerableMotionEnqueuing(true);
    setSteerableMotionJustQueued(false);

    // Call the service with all required parameters
    const result = await generateVideo({
      projectId,
      selectedShotId,
      selectedShot,
      queryClient,
      onShotImagesUpdate,
      effectiveAspectRatio,
      generationMode,
      batchVideoPrompt,
      textBeforePrompts,
      textAfterPrompts,
      batchVideoFrames,
      // batchVideoContext, // Removed
      batchVideoSteps,
      steerableMotionSettings,
      getModelName,
      randomSeed,
      turboMode,
      enhancePrompt,
      amountOfMotion,
      motionMode,
      generationTypeMode,
      advancedMode,
      phaseConfig,
      selectedPhasePresetId,
      selectedLoras: loraManager.selectedLoras.map(lora => ({
        id: lora.id,
        path: lora.path,
        strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
        name: lora.name
      })),
      structureVideoPath,
      structureVideoType,
      structureVideoTreatment,
      structureVideoMotionStrength,
      variantNameParam,
      clearAllEnhancedPrompts,
    });

    // Handle the result
    if (result.success) {
      // Show success feedback and update state
      setSteerableMotionJustQueued(true);
      
      // Reset success state after 2 seconds
      setTimeout(() => setSteerableMotionJustQueued(false), 2000);
    }
    
    // Always reset loading state
    setIsSteerableMotionEnqueuing(false);
  }, [
    projectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate,
    effectiveAspectRatio,
    generationMode,
    batchVideoPrompt,
    textBeforePrompts,
    textAfterPrompts,
    batchVideoFrames,
    // batchVideoContext, // Removed
    batchVideoSteps,
    steerableMotionSettings,
    getModelName,
    randomSeed,
    turboMode,
    enhancePrompt,
    amountOfMotion,
    motionMode,
    generationTypeMode,
    advancedMode,
    phaseConfig,
    selectedPhasePresetId,
    loraManager.selectedLoras,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    clearAllEnhancedPrompts,
  ]);

  // Expose generateVideo function and state to parent via mutable ref
  useEffect(() => {
    if (parentGenerateVideoRef) {
      parentGenerateVideoRef.current = handleGenerateBatch;
    }
  }, [parentGenerateVideoRef, handleGenerateBatch]);
  
  // Expose name click handler to parent for floating header
  useEffect(() => {
    if (parentNameClickRef) {
      parentNameClickRef.current = handleNameClick;
    }
  }, [parentNameClickRef, handleNameClick]);

  // Opens the Generations pane focused on un-positioned images for the current shot
  // 🎯 PERF FIX: Use selectedShotRef to avoid recreation when shot data changes
  // 🎯 PERF FIX: Uses refs to prevent callback recreation
  const openUnpositionedGenerationsPane = useCallback(() => {
    const shotId = selectedShotRef.current?.id;
    console.log('[ShotFilterAutoSelectIssue] Opening generations pane for shot:', shotId);
    
    if (shotId) {
      console.log('[ShotFilterAutoSelectIssue] Updating generations pane settings:', {
        selectedShotFilter: shotId,
        excludePositioned: true,
      });
      updateGenerationsPaneSettings({
        selectedShotFilter: shotId,
        excludePositioned: true,
      });
    }

    if (isMobile) {
      console.log('[ShotFilterAutoSelectIssue] Dispatching openGenerationsPane event (mobile)');
      // Dispatch a global event to request the Generations pane to open
      window.dispatchEvent(new CustomEvent('openGenerationsPane'));
    } else {
      console.log('[ShotFilterAutoSelectIssue] Setting generations pane locked (desktop)');
      setIsGenerationsPaneLockedRef.current(true);
    }
  }, [isMobile, updateGenerationsPaneSettings]);
  
  // 🎯 PERF FIX: Refs for stable callbacks  
  const onShotImagesUpdateRef = useRef(onShotImagesUpdate);
  onShotImagesUpdateRef.current = onShotImagesUpdate;

  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const handleSelectionChangeLocal = useCallback((hasSelection: boolean) => {
    // Track selection state - forward to parent for floating CTA control
    parentOnSelectionChangeRef.current?.(hasSelection);
  }, []);

  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const handleDefaultNegativePromptChange = useCallback((value: string) => {
    onSteerableMotionSettingsChangeRef.current({ negative_prompt: value });
  }, []);

  const handleShotChange = useCallback((shotId: string) => {
    console.log('[ShotEditor] Shot change requested to:', shotId);
    // Shot change will be handled by parent navigation
  }, []);

  // 🎯 PERF FIX: Uses refs to prevent callback recreation
  const handleAddToShot = useCallback(async (shotId: string, generationId: string, position?: number) => {
    // If position is 0, undefined, or we're adding to a different shot than currently viewed,
    // let the mutation calculate the correct position by querying the target shot
    const shouldAutoPosition = position === undefined || position === 0 || position === -1;
    
    console.log('[ShotEditor] Adding generation to shot', { 
      shotId: shotId?.substring(0, 8), 
      generationId: generationId?.substring(0, 8), 
      position,
      shouldAutoPosition,
      note: shouldAutoPosition ? 'Letting mutation query target shot for position' : 'Using provided position'
    });
    
    await addToShotMutationRef.current({ 
      shot_id: shotId, 
      generation_id: generationId, 
      // Only pass timelineFrame if we have a valid position, otherwise let mutation auto-calculate
      timelineFrame: shouldAutoPosition ? undefined : position, 
      project_id: projectIdRef.current 
    });
  }, []);

  // 🎯 PERF FIX: Uses refs to prevent callback recreation
  const handleAddToShotWithoutPosition = useCallback(async (shotId: string, generationId: string) => {
    console.log('[AddWithoutPosDebug] 🎯 ShotEditor.handleAddToShotWithoutPosition CALLED');
    console.log('[AddWithoutPosDebug] shotId:', shotId?.substring(0, 8));
    console.log('[AddWithoutPosDebug] generationId:', generationId?.substring(0, 8));
    console.log('[AddWithoutPosDebug] projectId:', projectIdRef.current?.substring(0, 8));
    
    try {
      console.log('[AddWithoutPosDebug] 🚀 Calling addToShotWithoutPositionMutation...');
      await addToShotWithoutPositionMutationRef.current({ 
        shot_id: shotId, 
        generation_id: generationId, 
        project_id: projectIdRef.current 
      });
      console.log('[AddWithoutPosDebug] ✅ Mutation completed successfully');
      return true; // Signal success so the caller can show tick and enable navigation
    } catch (error) {
      console.error('[AddWithoutPosDebug] ❌ Mutation failed:', error);
      throw error;
    }
  }, []);

  // 🎯 PERF FIX: Uses refs to prevent callback recreation
  const handleCreateShot = useCallback(async (name: string) => {
    console.log('[ShotEditor] Creating new shot', { name });
    const result = await createShotMutationRef.current({ name, projectId: projectIdRef.current });
    return result.shot.id;
  }, []);
  

  // Calculate current settings for MotionControl
  const currentMotionSettings = useMemo(() => {
    const settings = {
        textBeforePrompts,
        textAfterPrompts,
        basePrompt: batchVideoPrompt,
        negativePrompt: steerableMotionSettings.negative_prompt,
        enhancePrompt,
        durationFrames: batchVideoFrames,
        lastGeneratedVideoUrl: lastVideoGeneration || undefined,
        selectedLoras: loraManager.selectedLoras.map(lora => ({
            id: lora.id,
            name: lora.name,
            strength: lora.strength
        }))
    };
    return settings;
  }, [textBeforePrompts, textAfterPrompts, batchVideoPrompt, steerableMotionSettings.negative_prompt, enhancePrompt, batchVideoFrames, lastVideoGeneration, loraManager.selectedLoras]);

  if (!selectedShot) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Shot not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 pb-4">
      {/* Header - hide when sticky header is visible */}
      <div ref={parentHeaderRef}>
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
        projectAspectRatio={effectiveAspectRatio}
        projectId={projectId}
        centerSectionRef={centerSectionRef}
      />
      </div>

      {/* Output Videos Section - Always at top, both desktop and mobile */}
      <div ref={videoGalleryRef} className="flex flex-col gap-4">
        <VideoOutputsGallery 
          projectId={projectId}
          shotId={selectedShotId}
          onDelete={generationActions.handleDeleteVideoOutput}
          deletingVideoId={state.deletingVideoId}
          onApplySettingsFromTask={applySettingsFromTask}
          shotKey={selectedShotId}
          getShotVideoCount={getShotVideoCount}
          invalidateVideoCountsCache={invalidateVideoCountsCache}
          projectAspectRatio={effectiveAspectRatio}
          localZeroHint={videoOutputs.length === 0}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-4">
        
        {/* Image Manager / Timeline */}
        <div ref={parentTimelineRef} className="flex flex-col w-full gap-4">
            <ShotImagesEditor
            isModeReady={state.isModeReady}
            settingsError={state.settingsError}
            isMobile={isPhone}
            generationMode={generationMode}
            onGenerationModeChange={onGenerationModeChange}
            selectedShotId={selectedShot.id}
            projectId={projectId}
            shotName={selectedShot.name}
            batchVideoFrames={batchVideoFrames}
            // batchVideoContext={batchVideoContext} // Removed
            preloadedImages={allShotImages}
            onImageReorder={handleReorderImagesInShot}
            onFramePositionsChange={undefined}
            onImageDrop={generationActions.handleTimelineImageDrop}
            onGenerationDrop={generationActions.handleTimelineGenerationDrop}
            onBatchFileDrop={generationActions.handleBatchImageDrop}
            onBatchGenerationDrop={generationActions.handleBatchGenerationDrop}
            pendingPositions={state.pendingFramePositions}
            onPendingPositionApplied={handlePendingPositionApplied}
            onImageDelete={generationActions.handleDeleteImageFromShot}
            onBatchImageDelete={generationActions.handleBatchDeleteImages}
            onImageDuplicate={generationActions.handleDuplicateImage}
            columns={mobileColumns as 2 | 3 | 4 | 6}
            skeleton={
              <ImageManagerSkeleton 
                isMobile={isMobile}
                {...({ columns: mobileColumns } as any)}
                shotImages={contextImages}
                projectAspectRatio={effectiveAspectRatio}
              />
            }
            unpositionedGenerationsCount={unpositionedImagesCount}
            onOpenUnpositionedPane={openUnpositionedGenerationsPane}
            fileInputKey={state.fileInputKey}
            onImageUpload={generationActions.handleImageUploadToShot}
            isUploadingImage={state.isUploadingImage}
            uploadProgress={state.uploadProgress}
            duplicatingImageId={state.duplicatingImageId}
            duplicateSuccessImageId={state.duplicateSuccessImageId}
            projectAspectRatio={effectiveAspectRatio}
            onSelectionChange={handleSelectionChangeLocal}
            defaultPrompt={batchVideoPrompt}
            onDefaultPromptChange={onBatchVideoPromptChange}
            defaultNegativePrompt={steerableMotionSettings.negative_prompt || ""}
            onDefaultNegativePromptChange={handleDefaultNegativePromptChange}
            // Structure video props
            structureVideoPath={structureVideoPath}
            structureVideoMetadata={structureVideoMetadata}
            structureVideoTreatment={structureVideoTreatment}
            structureVideoMotionStrength={structureVideoMotionStrength}
            structureVideoType={structureVideoType}
            onStructureVideoChange={handleStructureVideoChange}
            // Shot management for external generation viewing
            allShots={shots}
            onShotChange={handleShotChange}
            onAddToShot={handleAddToShot}
            onAddToShotWithoutPosition={handleAddToShotWithoutPosition}
            onCreateShot={handleCreateShot}
          />
        </div>

        {/* Generation Settings */}
        <div className="w-full" ref={generateVideosCardRef}>
          <Card>
            <CardHeader>
                <CardTitle className="text-base sm:text-lg font-light">Generate Videos</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column: Main Settings */}
                    <div className="lg:w-1/2 order-2 lg:order-1">
                        <div className="mb-4">
                            <SectionHeader title="Settings" theme="orange" />
                        </div>
                        <BatchSettingsForm
                            batchVideoPrompt={batchVideoPrompt}
                            onBatchVideoPromptChange={handleBatchVideoPromptChangeWithClear}
                            batchVideoFrames={batchVideoFrames}
                            onBatchVideoFramesChange={onBatchVideoFramesChange}
                            // batchVideoContext={batchVideoContext} // Removed
                            // onBatchVideoContextChange={onBatchVideoContextChange} // Removed
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
                            isTimelineMode={effectiveGenerationMode === 'timeline'}
                            accelerated={accelerated}
                            onAcceleratedChange={handleAcceleratedChange}
                            showStepsNotification={state.showStepsNotification}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                            turboMode={turboMode}
                            onTurboModeChange={onTurboModeChange}
                            amountOfMotion={amountOfMotion}
                            onAmountOfMotionChange={onAmountOfMotionChange}
                            imageCount={simpleFilteredImages.length}
                            enhancePrompt={enhancePrompt}
                            onEnhancePromptChange={onEnhancePromptChange}
                            advancedMode={advancedMode}
                            phaseConfig={phaseConfig}
                            onPhaseConfigChange={onPhaseConfigChange}
                            selectedPhasePresetId={selectedPhasePresetId}
                            onPhasePresetSelect={onPhasePresetSelect}
                            onPhasePresetRemove={onPhasePresetRemove}
                            onBlurSave={onBlurSave}
                            onClearEnhancedPrompts={clearAllEnhancedPrompts}
                            videoControlMode={videoControlMode}
                            textBeforePrompts={textBeforePrompts}
                            onTextBeforePromptsChange={onTextBeforePromptsChange}
                            textAfterPrompts={textAfterPrompts}
                            onTextAfterPromptsChange={onTextAfterPromptsChange}
                        />
                    </div>

                    {/* Right Column: Motion Control */}
                    <div className="lg:w-1/2 order-1 lg:order-2">
                        <div className="mb-4">
                            <SectionHeader title="Motion" theme="purple" />
                        </div>
                        <MotionControl
                            // motionMode is typed as 'basic' | 'advanced'. Older code used a 'presets' branch.
                            motionMode={motionMode || 'basic'}
                            onMotionModeChange={onMotionModeChange || (() => {})}
                            generationTypeMode={generationTypeMode}
                            onGenerationTypeModeChange={onGenerationTypeModeChange}
                            hasStructureVideo={!!structureVideoPath}
                            selectedLoras={loraManager.selectedLoras}
                            availableLoras={availableLoras}
                            onAddLoraClick={() => loraManager.setIsLoraModalOpen(true)}
                            onRemoveLora={loraManager.handleRemoveLora}
                            onLoraStrengthChange={loraManager.handleLoraStrengthChange}
                            onAddTriggerWord={loraManager.handleAddTriggerWord}
                            renderLoraHeaderActions={loraManager.renderHeaderActions}
                            selectedPhasePresetId={selectedPhasePresetId}
                            onPhasePresetSelect={onPhasePresetSelect || (() => {})}
                            onPhasePresetRemove={onPhasePresetRemove || (() => {})}
                            currentSettings={currentMotionSettings}
                            phaseConfig={phaseConfig}
                            onPhaseConfigChange={onPhaseConfigChange || (() => {})}
                            onBlurSave={onBlurSave}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                            turboMode={turboMode}
                            settingsLoading={settingsLoading}
                            onRestoreDefaults={onRestoreDefaults}
                        />
                    </div>
                </div>

                {/* Full-width divider and generate button - Original position with ref */}
                <div 
                  ref={parentCtaRef} 
                  className="mt-6 pt-6 border-t"
                >
                  <GenerateVideoCTA
                    variantName={parentVariantName || ''}
                    onVariantNameChange={parentOnVariantNameChange || (() => {})}
                    onGenerate={() => handleGenerateBatch(parentVariantName || '')}
                    isGenerating={parentIsGeneratingVideo || isSteerableMotionEnqueuing}
                    justQueued={parentVideoJustQueued || steerableMotionJustQueued}
                    disabled={isGenerationDisabled}
                    inputId="variant-name"
                  />
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* STICKY HEADER NOW RENDERED BY PARENT (VideoTravelToolPage) */}

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