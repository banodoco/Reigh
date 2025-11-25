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
import { useAllShotGenerations } from '@/shared/hooks/useShotGenerations';
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
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/useShots';
import { useUpdateGenerationLocation } from '@/shared/hooks/useGenerations';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import * as ApplySettingsService from './services/applySettingsService';
import { generateVideo } from './services/generateVideoService';
import { GenerateVideoCTA } from '../GenerateVideoCTA';

const ShotEditor: React.FC<ShotEditorProps> = ({
  selectedShotId,
  projectId,
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
  enhancePrompt,
  onEnhancePromptChange,
  turboMode,
  onTurboModeChange,
  amountOfMotion,
  onAmountOfMotionChange,
  motionMode = 'basic',
  onMotionModeChange,
  advancedMode,
  onAdvancedModeChange,
  phaseConfig,
  onPhaseConfigChange,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  onBlurSave,
  autoCreateIndividualPrompts,
  onAutoCreateIndividualPromptsChange,
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
  // [ShotNavPerf] TEST LOG - Component is rendering
  const renderStartTime = performance.now();
  const renderCount = useRef(0);
  renderCount.current += 1;
  
  console.log('[ShotNavPerf] 🚀 ShotEditor RENDERING START', {
    selectedShotId: selectedShotId?.substring(0, 8),
    renderNumber: renderCount.current,
    timestamp: Date.now()
  });
  
  // [PROFILING] Track which props changed to cause this render
  const prevPropsRef = useRef<any>(null);
  useEffect(() => {
    if (prevPropsRef.current) {
      const changedProps: string[] = [];
      const changedCallbacks: string[] = [];
      
      // Check primitive props
      if (prevPropsRef.current.selectedShotId !== selectedShotId) changedProps.push('selectedShotId');
      if (prevPropsRef.current.projectId !== projectId) changedProps.push('projectId');
      if (prevPropsRef.current.generationMode !== generationMode) changedProps.push('generationMode');
      if (prevPropsRef.current.batchVideoFrames !== batchVideoFrames) changedProps.push('batchVideoFrames');
      // if (prevPropsRef.current.batchVideoContext !== batchVideoContext) changedProps.push('batchVideoContext'); // Removed
      if (prevPropsRef.current.enhancePrompt !== enhancePrompt) changedProps.push('enhancePrompt');
      if (prevPropsRef.current.turboMode !== turboMode) changedProps.push('turboMode');
      if (prevPropsRef.current.advancedMode !== advancedMode) changedProps.push('advancedMode');
      if (prevPropsRef.current.settingsLoading !== settingsLoading) changedProps.push('settingsLoading');
      
      // Check callback props (these are the likely culprits)
      if (prevPropsRef.current.onShotImagesUpdate !== onShotImagesUpdate) changedCallbacks.push('onShotImagesUpdate');
      if (prevPropsRef.current.onBack !== onBack) changedCallbacks.push('onBack');
      if (prevPropsRef.current.onGenerationModeChange !== onGenerationModeChange) changedCallbacks.push('onGenerationModeChange');
      if (prevPropsRef.current.onBatchVideoFramesChange !== onBatchVideoFramesChange) changedCallbacks.push('onBatchVideoFramesChange');
      // if (prevPropsRef.current.onBatchVideoContextChange !== onBatchVideoContextChange) changedCallbacks.push('onBatchVideoContextChange'); // Removed
      if (prevPropsRef.current.onEnhancePromptChange !== onEnhancePromptChange) changedCallbacks.push('onEnhancePromptChange');
      if (prevPropsRef.current.onTurboModeChange !== onTurboModeChange) changedCallbacks.push('onTurboModeChange');
      if (prevPropsRef.current.onAdvancedModeChange !== onAdvancedModeChange) changedCallbacks.push('onAdvancedModeChange');
      if (prevPropsRef.current.onGenerateAllSegments !== onGenerateAllSegments) changedCallbacks.push('onGenerateAllSegments');
      if (prevPropsRef.current.onPreviousShot !== onPreviousShot) changedCallbacks.push('onPreviousShot');
      if (prevPropsRef.current.onNextShot !== onNextShot) changedCallbacks.push('onNextShot');
      if (prevPropsRef.current.onUpdateShotName !== onUpdateShotName) changedCallbacks.push('onUpdateShotName');
      if (prevPropsRef.current.getShotVideoCount !== getShotVideoCount) changedCallbacks.push('getShotVideoCount');
      if (prevPropsRef.current.invalidateVideoCountsCache !== invalidateVideoCountsCache) changedCallbacks.push('invalidateVideoCountsCache');
      
      if (changedProps.length > 0 || changedCallbacks.length > 0) {
        console.warn('[ShotEditor:Profiling] 🔄 Props changed causing ShotEditor rerender:', {
          renderNumber: renderCount.current,
          changedProps,
          changedCallbacks,
          callbackCount: changedCallbacks.length,
          timestamp: Date.now()
        });
      } else {
        console.warn('[ShotEditor:Profiling] ⚠️ ShotEditor rerendered with NO PROP CHANGES (parent rerender):', {
          renderNumber: renderCount.current,
          timestamp: Date.now()
        });
      }
    }
    
    // Save current props for next comparison
    prevPropsRef.current = {
      selectedShotId, projectId, generationMode, batchVideoFrames,
      // batchVideoContext, // Removed
      enhancePrompt, turboMode, advancedMode, settingsLoading,
      onShotImagesUpdate, onBack, onGenerationModeChange, onBatchVideoFramesChange,
      // onBatchVideoContextChange, // Removed
      onEnhancePromptChange, onTurboModeChange,
      onAdvancedModeChange, onGenerateAllSegments, onPreviousShot, onNextShot,
      onUpdateShotName, getShotVideoCount, invalidateVideoCountsCache
    };
  });
  
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
  
  // Use found shot if available, otherwise fallback to cached version if shots list is loading/refreshing
  // Only fallback if shots is undefined/null (loading), not if it's an empty array (loaded but missing)
  const selectedShot = foundShot || (shots === undefined ? lastValidShotRef.current : undefined);
  
  // Shot management hooks for external generation viewing
  const { mutateAsync: createShotMutation } = useCreateShot();
  const { mutateAsync: addToShotMutation } = useAddImageToShot();
  const { mutateAsync: addToShotWithoutPositionMutation } = useAddImageToShotWithoutPosition();
  
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
      
      const { data, error } = await supabase
        .from('generations')
        .select('id, location, type, created_at')
        .not(`shot_data->${selectedShotId}`, 'is', null)
        .like('type', '%video%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        console.log('[PresetAutoPopulate] No last video found for shot:', error);
        return null;
      }
      
      return data?.location || null;
    },
    enabled: !!selectedShotId,
    staleTime: 30000, // Cache for 30 seconds
  });
  
    // CRITICAL FIX: Always use full images when available in editor mode to ensure consistency
  // This prevents video pair config mismatches between VideoTravelToolPage and ShotEditor
  
  // [FlickerFix] Persist last valid images list to prevent empty flashes during refetches
  const lastValidImagesRef = useRef<GenerationRow[]>([]);

  const orderedShotImages = React.useMemo(() => {
    // [ShotNavPerf] PERFORMANCE FIX: Prioritize showing content immediately
    // Use context images when query is fetching to prevent blank screen during navigation
    const hasValidFullImages = fullShotImages.length > 0;
    const hasValidContextImages = contextImages.length > 0;
    const isQueryFetchingNewData = fullImagesQueryResult.isFetching && !fullImagesQueryResult.data;
    
    // Priority: fullImages > contextImages (while fetching) > empty
    // This ensures instant display when navigating via arrows
    let result: typeof contextImages = [];
    let dataSource: string;
    
    if (hasValidFullImages) {
      result = fullShotImages;
      dataSource = 'fullImages (query complete)';
    } else if (hasValidContextImages && (isQueryFetchingNewData || fullImagesQueryResult.isLoading)) {
      result = contextImages;
      dataSource = 'contextImages (query pending)';
    } else if (hasValidContextImages) {
      result = contextImages;
      dataSource = 'contextImages (no query)';
    } else {
      result = fullShotImages; // Fallback to query result even if empty
      dataSource = 'fullImages (fallback)';
    }

    // [FlickerFix] Persist last valid state if result is empty OR PARTIAL during refetch
    // This prevents the timeline from disappearing or showing incomplete data during duplications/updates
    const isRefetching = fullImagesQueryResult.isFetching || fullImagesQueryResult.isLoading;
    
    console.log('[DUPLICATE_UI] 🔍 ShotEditor data flow:', {
      resultCount: result.length,
      cachedCount: lastValidImagesRef.current.length,
      isRefetching,
      dataSource,
      fullImagesCount: fullShotImages.length,
      contextImagesCount: contextImages.length,
      queryStatus: fullImagesQueryResult.status,
      queryFetchStatus: fullImagesQueryResult.fetchStatus
    });
    
    if (result.length > 0 && !isRefetching) {
      // Only update cache when we have data AND are not currently refetching
      // This prevents caching partial/transitional data
      console.log('[DUPLICATE_UI] 💾 Updating lastValidImagesRef cache');
      lastValidImagesRef.current = result;
    } else if (lastValidImagesRef.current.length > 0 && isRefetching) {
       // If we are refetching and result is LESS than cache, it's likely partial/stale data
       // Use cached data to maintain stability
       if (result.length < lastValidImagesRef.current.length || result.length === 0) {
         console.log('[DUPLICATE_UI] ⚠️ Partial/empty result during refetch - using cached images', {
           resultCount: result.length,
           cachedCount: lastValidImagesRef.current.length,
           isRefetching,
           dataSource: dataSource,
           difference: lastValidImagesRef.current.length - result.length
         });
         result = lastValidImagesRef.current;
         dataSource = 'cached (partial data prevention)';
       }
    }
    
    console.log('[ShotNavPerf] 🔄 Data source decision:', {
      hasValidFullImages,
      hasValidContextImages,
      isQueryFetchingNewData,
      isQueryLoading: fullImagesQueryResult.isLoading,
      contextImagesCount: contextImages.length,
      fullImagesCount: fullShotImages.length,
      resultCount: result.length,
      dataSource
    });
    
    // Check for duplicates by ID
    const idCounts = new Map<string, number>();
    result.forEach(img => {
      const count = idCounts.get(img.id) || 0;
      idCounts.set(img.id, count + 1);
    });
    const duplicates = Array.from(idCounts.entries()).filter(([id, count]) => count > 1);
    
    console.log('[UnifiedDataFlow] ShotEditor data preparation:', {
      selectedShotId: selectedShotId?.substring(0, 8),
      fullShotImagesCount: fullShotImages.length,
      contextImagesCount: contextImages.length,
      resultCount: result.length,
      usingTwoPhase: fullShotImages.length > 0,
      willPassToChildren: true,
      hasDuplicateIds: duplicates.length > 0,
      duplicateIds: duplicates.length > 0 ? duplicates.map(([id, count]) => ({ id: id.substring(0, 8), count })) : [],
    });
    
    console.log('[DataTrace] 📤 ShotEditor → passing to children:', {
      shotId: selectedShotId?.substring(0, 8),
      total: result.length,
      positioned: result.filter(r => r.timeline_frame != null && r.timeline_frame >= 0).length,
      unpositioned: result.filter(r => r.timeline_frame == null).length,
      duplicates: duplicates.length,
    });
    
    return result;
  }, [
    fullShotImages, // Need full array for the actual data
    contextImages,  // Need full array for the actual data
    fullImagesQueryResult.isFetching,
    fullImagesQueryResult.isLoading,
    fullImagesQueryResult.data,
    selectedShotId
  ]);

  
  // [VideoLoadSpeedIssue] Track image data loading progress
  React.useEffect(() => {
    console.log('[VideoLoadSpeedIssue] ShotEditor image data update:', {
      selectedShotId,
      contextImagesCount: contextImages.length,
      fullShotImagesCount: fullShotImages.length,
      orderedShotImagesCount: orderedShotImages.length,
      isLoadingFullImages,
      hasContextData,
      shouldLoadDetailedData,
      timestamp: Date.now(),
      dataSource: hasContextData ? 'context' : 'detailed_query',
      optimizationActive: hasContextData,
      // [VideoLoadSpeedIssue] DEBUG: Check if context images are being filtered somewhere
      contextImagesSample: contextImages.slice(0, 3).map(img => ({
        id: img.id,
        position: Math.floor(((img as any).timeline_frame ?? 0) / 50),
        imageUrl: !!img.imageUrl
      })),
      orderedImagesSample: orderedShotImages.slice(0, 3).map(img => ({
        id: img.id,
        position: Math.floor(((img as any).timeline_frame ?? 0) / 50),
        imageUrl: !!img.imageUrl
      }))
    });
  }, [selectedShotId, contextImages.length, fullShotImages.length, orderedShotImages.length, isLoadingFullImages, hasContextData, shouldLoadDetailedData]);
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

  // REMOVED: localOrderedShotImages layer - no longer needed with fast two-phase loading
  // Two-phase loading (~300ms) is fast enough that we don't need local caching
  // ShotImageManager's optimisticOrder handles drag operations
  const timelineReadyImages = orderedShotImages;

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
  const handleSelectionChange = useCallback((hasSelection: boolean) => {
    parentOnSelectionChange?.(hasSelection);
  }, [parentOnSelectionChange]);

  // STICKY HEADER & FLOATING CTA LOGIC MOVED TO PARENT (VideoTravelToolPage)
  // Parent manages:
  // - Scroll detection via useStickyHeader and useFloatingCTA hooks
  // - Rendering of floating elements
  // - Element visibility and positioning
  // - Click handlers for floating UI that scroll and trigger actions

  // Use the LoRA sync hook
  const { loraManager, isShotLoraSettingsLoading, hasInitializedShot: loraInitialized } = useLoraSync({
    selectedShot,
    projectId: selectedProjectId,
    availableLoras,
    batchVideoPrompt,
    onBatchVideoPromptChange,
  });

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
    orderedShotImages,
    skipNextSyncRef,
  });

  // REMOVED: Local optimistic list sync - no longer needed with two-phase loading

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

  // CRITICAL FIX: Reset mode readiness when shot changes ONLY if we don't have context images yet
  // If we have context images, stay ready and let settings refetch in the background
  // This prevents the unmount/remount cascade that was canceling image loads
  useEffect(() => {
    if (selectedShot?.id) {
      const hasContextImages = contextImages.length > 0;
      if (hasContextImages) {
        // We have images - stay ready, let settings update in background
        console.log('[ShotNavPerf] 🚀 Shot changed but keeping ready state - we have context images', {
          shotId: selectedShot.id.substring(0, 8),
          contextImagesCount: contextImages.length
        });
        actions.setModeReady(true);
      } else {
        // No images yet - reset to loading state
        console.log('[ShotNavPerf] ⏳ Shot changed - resetting to loading state', {
          shotId: selectedShot.id.substring(0, 8)
        });
        actions.setModeReady(false);
      }
    }
  }, [selectedShot?.id, contextImages.length, actions]);

    // Handle generation mode setup and readiness - AGGRESSIVE OPTIMIZATION for faster ready state
  const readinessState = React.useMemo(() => ({
    hasImageData: contextImages.length > 0,
    criticalSettingsReady: !settingsLoading, // Only wait for main settings, not UI/LoRA
    modeCorrect: !isPhone || generationMode === 'batch', // Tablets can use timeline mode
    hasError: !!state.settingsError,
    shotId: selectedShot?.id,
    isReady: state.isModeReady
  }), [contextImages.length, settingsLoading, isPhone, generationMode, state.settingsError, selectedShot?.id, state.isModeReady]);

  useEffect(() => {
    const { hasImageData, criticalSettingsReady, modeCorrect, hasError, isReady } = readinessState;
    
    // Skip if already ready
    if (isReady) return;

    // Handle mobile mode correction
    if (!modeCorrect) {
      onGenerationModeChange('batch');
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

  // REMOVED: localOrderedShotImages - redundant with two-phase loading + ShotImageManager's optimisticOrder
  
  // [VideoLoadSpeedIssue] OPTIMIZED: Only log significant data flow changes
  const dataFlowKey = `${selectedShotId}-${orderedShotImages.length}`;
  const lastDataFlowKeyRef = React.useRef('');
  const lastProcessingKeyRef = React.useRef('');
  const lastFilteringKeyRef = React.useRef('');
  
  React.useEffect(() => {
    if (dataFlowKey !== lastDataFlowKeyRef.current) {
      console.log('[VideoLoadSpeedIssue] ShotEditor data flow change:', {
        selectedShotId,
        orderedShotImagesCount: orderedShotImages.length,
        timestamp: Date.now()
      });
      lastDataFlowKeyRef.current = dataFlowKey;
    }
  }, [dataFlowKey, selectedShotId, orderedShotImages.length]);
  
  // Remove debug logs for production

  // [VideoLoadSpeedIssue] CRITICAL FIX: Use EXACT same logic as ShotsPane
  // Apply both position filtering AND video filtering like ShotsPane
  const simpleFilteredImages = useMemo(() => {
    // CRITICAL FIX: Always use orderedShotImages for consistency with VideoTravelToolPage
    // This ensures timeline positions and video generation use the same dataset
    const sourceImages = orderedShotImages || [];
    
    // OPTIMIZED: Only log when significant changes occur
    const processingKey = `${selectedShotId}-${sourceImages.length}`;
    if (processingKey !== lastProcessingKeyRef.current) {
      console.log('[PROFILING] ShotEditor - Image processing decision:', {
        selectedShotId,
        sourceImagesCount: sourceImages.length,
        contextImagesCount: contextImages.length,
        isModeReady: state.isModeReady,
        timestamp: Date.now()
      });
      lastProcessingKeyRef.current = processingKey;
    }
    
    // EXACT same logic as ShotsPane:
    // 1. Filter by position (has valid position)
    // 2. Filter out videos (like ShotsPane does)
    // 3. Sort by position
    const filtered = sourceImages
      .filter(img => {
        const hasTimelineFrame = (img as any).timeline_frame !== null && (img as any).timeline_frame !== undefined;
        
        // [MagicEditTaskDebug] Log magic edit generations to see their timeline_frame values
        if (img.type === 'image_edit' || (img as any).params?.tool_type === 'magic-edit') {
          console.log('[MagicEditTaskDebug] Magic edit generation filtering:', {
            id: img.id.substring(0, 8),
            shotImageEntryId: img.shotImageEntryId?.substring(0, 8),
            timeline_frame: (img as any).timeline_frame,
            hasTimelineFrame,
            willBeIncludedInTimeline: hasTimelineFrame,
            type: img.type,
            tool_type: (img as any).params?.tool_type
          });
        }
        
        return hasTimelineFrame;
      })
      .filter(img => {
        // EXACT same video detection as ShotsPane's ShotGroup component
        const isVideo = img.type === 'video' ||
                       img.type === 'video_travel_output' ||
                       (img.location && img.location.endsWith('.mp4')) ||
                       (img.imageUrl && img.imageUrl.endsWith('.mp4'));
        return !isVideo; // Exclude videos, just like ShotsPane
      })
      .sort((a, b) => {
        const frameA = (a as any).timeline_frame ?? 0;
        const frameB = (b as any).timeline_frame ?? 0;
        return frameA - frameB;
      });
    
    // OPTIMIZED: Only log filtering results when they change significantly
    const filteringKey = `${selectedShotId}-${sourceImages.length}-${filtered.length}`;
    if (filteringKey !== lastFilteringKeyRef.current) {
      console.log('[VideoLoadSpeedIssue] EXACT ShotsPane filtering results:', {
        selectedShotId,
        sourceCount: sourceImages.length,
        filteredCount: filtered.length,
        timestamp: Date.now()
      });
      lastFilteringKeyRef.current = filteringKey;
    }
    
    return filtered;
  }, [orderedShotImages, selectedShotId]);
  
  // Calculate unpositioned images count locally to match "Input Images" logic
  // 1. Must be unpositioned (no timeline_frame)
  // 2. Must be an image (not video)
  const unpositionedImagesCount = useMemo(() => {
    const sourceImages = orderedShotImages || [];
    return sourceImages
      .filter(img => {
        const hasTimelineFrame = (img as any).timeline_frame !== null && (img as any).timeline_frame !== undefined;
        return !hasTimelineFrame;
      })
      .filter(img => {
        const isVideo = img.type === 'video' ||
                       img.type === 'video_travel_output' ||
                       (img.location && img.location.endsWith('.mp4')) ||
                       (img.imageUrl && img.imageUrl.endsWith('.mp4'));
        return !isVideo;
      }).length;
  }, [orderedShotImages]);

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
  
  const videoOutputs = useMemo(() => {
    return getVideoOutputs(orderedShotImages);
  }, [orderedShotImages]);

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
    onAdvancedModeChange,
    onMotionModeChange,
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
      autoCreateIndividualPrompts,
      amountOfMotion,
      motionMode,
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
    autoCreateIndividualPrompts,
    amountOfMotion,
    motionMode,
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
  
  // [PERFORMANCE] Stable callbacks for ShotImagesEditor to prevent re-renders
  const handleImageSaved = useCallback(async (imageId: string, newImageUrl: string, createNew?: boolean) => {
    console.log('[ImageFlipDebug] [ShotEditor] onImageSaved called', {
      imageId,
      newImageUrl,
      createNew,
      timestamp: Date.now()
    });
    
    try {
      if (createNew) {
        // TODO: Create new generation if needed
        console.log('[ImageFlipDebug] [ShotEditor] Create new not implemented yet');
        return;
      }
      
      console.log('[ImageFlipDebug] [ShotEditor] Updating generation location and thumbnail', {
        imageId,
        newImageUrl,
        timestamp: Date.now()
      });
      
      // Update both location and thumbnail_url in the database
      await updateGenerationLocationMutation.mutateAsync({
        id: imageId,
        location: newImageUrl,
        thumbUrl: newImageUrl, // Also update thumbnail
        projectId: projectId
      });
      
      console.log('[ImageFlipDebug] [ShotEditor] Generation location updated successfully', {
        timestamp: Date.now()
      });
      
      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['shot-generations', selectedShotId] });
      await queryClient.invalidateQueries({ queryKey: ['all-shot-generations', selectedShotId] });
      await queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', selectedShotId] });
      // IMPORTANT: Also invalidate two-phase cache keys
      await queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', selectedShotId] });
      await queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', selectedShotId] });
      
      console.log('[ImageFlipDebug] [ShotEditor] Queries invalidated', {
        timestamp: Date.now()
      });
      
      // Call parent callback to update other related data
      onShotImagesUpdate();
      
      console.log('[ImageFlipDebug] [ShotEditor] onImageSaved completed successfully', {
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[ImageFlipDebug] [ShotEditor] Error in onImageSaved:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        imageId,
        newImageUrl,
        timestamp: Date.now()
      });
      toast.error('Failed to save flipped image.');
    }
  }, [updateGenerationLocationMutation, projectId, selectedShotId, queryClient, onShotImagesUpdate]);

  const handleSelectionChangeLocal = useCallback((hasSelection: boolean) => {
    // Track selection state - forward to parent for floating CTA control
    parentOnSelectionChange?.(hasSelection);
  }, [parentOnSelectionChange]);

  const handleDefaultNegativePromptChange = useCallback((value: string) => {
    onSteerableMotionSettingsChange({ negative_prompt: value });
  }, [onSteerableMotionSettingsChange]);

  const handleShotChange = useCallback((shotId: string) => {
    console.log('[ShotEditor] Shot change requested to:', shotId);
    // Shot change will be handled by parent navigation
  }, []);

  const handleAddToShot = useCallback(async (shotId: string, generationId: string, position: number) => {
    console.log('[ShotEditor] Adding generation to shot with position', { shotId, generationId, position });
    await addToShotMutation({ 
      shot_id: shotId, 
      generation_id: generationId, 
      timelineFrame: position, 
      project_id: projectId 
    });
  }, [addToShotMutation, projectId]);

  const handleAddToShotWithoutPosition = useCallback(async (shotId: string, generationId: string) => {
    console.log('[ShotEditor] Adding generation to shot without position', { shotId, generationId });
    await addToShotWithoutPositionMutation({ 
      shot_id: shotId, 
      generation_id: generationId, 
      project_id: projectId 
    });
  }, [addToShotWithoutPositionMutation, projectId]);

  const handleCreateShot = useCallback(async (name: string) => {
    console.log('[ShotEditor] Creating new shot', { name });
    const result = await createShotMutation({ name, projectId });
    return result.shot.id;
  }, [createShotMutation, projectId]);
  

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
    console.log('[PresetAutoPopulate] ShotEditor creating currentSettings:', settings);
    return settings;
  }, [textBeforePrompts, textAfterPrompts, batchVideoPrompt, steerableMotionSettings.negative_prompt, enhancePrompt, batchVideoFrames, lastVideoGeneration, loraManager.selectedLoras]);

  // [ShotNavPerf] Log render completion time
  const renderEndTime = performance.now();
  const renderDuration = renderEndTime - renderStartTime;
  console.log('[ShotNavPerf] ⏱️ ShotEditor RENDER COMPLETE', {
    selectedShotId: selectedShotId?.substring(0, 8),
    renderDuration: `${renderDuration.toFixed(2)}ms`,
    timestamp: Date.now()
  });

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
            preloadedImages={orderedShotImages}
            onImageReorder={handleReorderImagesInShot}
            onImageSaved={handleImageSaved}
            onContextFramesChange={() => {}} // No-op as context frames removed
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
            autoCreateIndividualPrompts={autoCreateIndividualPrompts}
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
                            isTimelineMode={generationMode === 'timeline'}
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
                            autoCreateIndividualPrompts={autoCreateIndividualPrompts}
                            onAutoCreateIndividualPromptsChange={onAutoCreateIndividualPromptsChange}
                            enhancePrompt={enhancePrompt}
                            onEnhancePromptChange={onEnhancePromptChange}
                            advancedMode={advancedMode}
                            onAdvancedModeChange={onAdvancedModeChange}
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
                            motionMode={motionMode}
                            onMotionModeChange={onMotionModeChange || (() => {})}
                            amountOfMotion={amountOfMotion || 50}
                            onAmountOfMotionChange={onAmountOfMotionChange || (() => {})}
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
                            advancedMode={advancedMode || false}
                            onAdvancedModeChange={onAdvancedModeChange || (() => {})}
                            phaseConfig={phaseConfig}
                            onPhaseConfigChange={onPhaseConfigChange || (() => {})}
                            onBlurSave={onBlurSave}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                            turboMode={turboMode}
                            settingsLoading={settingsLoading}
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