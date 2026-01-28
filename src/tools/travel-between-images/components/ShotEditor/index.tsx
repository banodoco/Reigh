import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Sparkles, ArrowLeftRight, ChevronDown, Settings } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Slider } from "@/shared/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { useProject } from "@/shared/contexts/ProjectContext";
import { toast } from "sonner";
import { useUpdateShotImageOrder, useAddImageToShotWithoutPosition } from "@/shared/hooks/useShots";
import { useShotCreation } from "@/shared/hooks/useShotCreation";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useDeviceDetection } from "@/shared/hooks/useDeviceDetection";
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import { GenerationRow } from '@/types/shots';
import FinalVideoSection from "../FinalVideoSection";
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
import { useAudio } from './hooks/useAudio';
import { Header } from './ui/Header';
import { ImageManagerSkeleton } from './ui/Skeleton';
import { filterAndSortShotImages, getNonVideoImages, getVideoOutputs } from './utils/generation-utils';
import { isVideoGeneration, isPositioned, sortByTimelineFrame } from '@/shared/lib/typeGuards';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/useShots';
import { useUpdateGenerationLocation, useDeleteGeneration } from '@/shared/hooks/useGenerations';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import * as ApplySettingsService from './services/applySettingsService';
import { generateVideo } from './services/generateVideoService';
import { GenerateVideoCTA } from '../GenerateVideoCTA';
import { useRenderCount } from '@/shared/components/debug/RefactorMetricsCollector';
import { JoinClipsSettingsForm, DEFAULT_JOIN_CLIPS_PHASE_CONFIG, BUILTIN_JOIN_CLIPS_DEFAULT_ID } from '@/tools/join-clips/components/JoinClipsSettingsForm';
import { useJoinSegmentsSettings } from '../../hooks/useJoinSegmentsSettings';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useSegmentOutputsForShot } from '../../hooks/useSegmentOutputsForShot';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useDemoteOrphanedVariants } from '@/shared/hooks/useDemoteOrphanedVariants';

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
  negativePrompt = '',
  onNegativePromptChange,
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
  smoothContinuations,
  onSmoothContinuationsChange,
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
  getFinalVideoCount,
  invalidateVideoCountsCache,
  onDragStateChange,
}) => {
  // [RefactorMetrics] Track render count for baseline measurements
  useRenderCount('ShotEditor');
  
  // Derive advancedMode from motionMode - single source of truth
  const advancedMode = motionMode === 'advanced';
  
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const { data: taskStatusCounts } = useTaskStatusCounts(selectedProjectId);
  const { getApiKey } = useApiKeys();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  const deleteGenerationMutation = useDeleteGeneration();

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
  const { createShot } = useShotCreation();
  const { mutateAsync: addToShotMutation } = useAddImageToShot();
  const { mutateAsync: addToShotWithoutPositionMutation } = useAddImageToShotWithoutPosition();

  // Orphaned variant detection - demotes videos when source images change
  const { demoteOrphanedVariants } = useDemoteOrphanedVariants();

  // 🎯 PERF FIX: Refs for mutation functions to prevent callback recreation
  // React Query mutations change reference on state changes (idle → pending → success)
  const createShotRef = useRef(createShot);
  createShotRef.current = createShot;
  const addToShotMutationRef = useRef(addToShotMutation);
  addToShotMutationRef.current = addToShotMutation;
  const addToShotWithoutPositionMutationRef = useRef(addToShotWithoutPositionMutation);
  addToShotWithoutPositionMutationRef.current = addToShotWithoutPositionMutation;

  // 🎯 PERF FIX: Refs for parent callbacks to prevent child callback recreation
  const parentOnSelectionChangeRef = useRef(parentOnSelectionChange);
  parentOnSelectionChangeRef.current = parentOnSelectionChange;
  const onSteerableMotionSettingsChangeRef = useRef(onSteerableMotionSettingsChange);
  onSteerableMotionSettingsChangeRef.current = onSteerableMotionSettingsChange;

  // Track local drag state to suppress hook reloads during drag operations
  // This is forwarded via onDragStateChange but we also need it locally for useEnhancedShotPositions
  const [isDragInProgress, setIsDragInProgress] = useState(false);

  // Wrapper to track drag state locally AND forward to parent
  const handleDragStateChange = useCallback((isDragging: boolean) => {
    setIsDragInProgress(isDragging);
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);
  
  // Compute effective aspect ratio: prioritize shot-level over project-level
  // This ensures videos in VideoOutputsGallery, items in Timeline, and other components
  // use the shot's aspect ratio when set, otherwise fall back to project aspect ratio
  const effectiveAspectRatio = useMemo(() => {
    const projectAspectRatio = projects.find(p => p.id === projectId)?.aspectRatio;
    return selectedShot?.aspect_ratio || projectAspectRatio;
  }, [selectedShot?.aspect_ratio, projects, projectId]);
  
  // Structure video management (extracted to hook)
  const {
    // New grouped config (preferred for generateVideo)
    structureVideoConfig,
    setStructureVideoConfig,
    // Legacy individual accessors (for UI components that haven't migrated)
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    handleStructureVideoChange,
    isLoading: isStructureVideoSettingsLoading,
    // NEW: Multi-video array support
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    setStructureVideos,
  } = useStructureVideo({
    projectId,
    shotId: selectedShot?.id,
  });

  // Handler for changing uni3c end percent
  const handleUni3cEndPercentChange = useCallback((value: number) => {
    setStructureVideoConfig({
      ...structureVideoConfig,
      uni3c_end_percent: value,
    });
  }, [structureVideoConfig, setStructureVideoConfig]);

  // Handler for changing just the structure video motion strength (from MotionControl)
  const handleStructureVideoMotionStrengthChange = useCallback((strength: number) => {
    if (structureVideoPath && structureVideoMetadata) {
      handleStructureVideoChange(
        structureVideoPath,
        structureVideoMetadata,
        structureVideoTreatment,
        strength,
        structureVideoType
      );
    }
  }, [structureVideoPath, structureVideoMetadata, structureVideoTreatment, structureVideoType, handleStructureVideoChange]);

  // Handler for changing just the structure video type (from MotionControl)
  const handleStructureTypeChangeFromMotionControl = useCallback((type: 'uni3c' | 'flow' | 'canny' | 'depth') => {
    // Update legacy single-video config
    handleStructureVideoChange(
      structureVideoPath,
      structureVideoMetadata,
      structureVideoTreatment,
      structureVideoMotionStrength,
      type
    );

    // Also update ALL videos in the structureVideos array to keep them in sync
    structureVideos.forEach((_, index) => {
      updateStructureVideo(index, { structure_type: type });
    });

    // Auto-switch generation type mode based on structure type
    if (onGenerationTypeModeChange) {
      if (type === 'uni3c') {
        if (generationTypeMode !== 'i2v') {
          console.log('[GenerationTypeMode] Auto-switching to I2V because uni3c structure type was selected');
          onGenerationTypeModeChange('i2v');
        }
      } else {
        if (generationTypeMode !== 'vace') {
          console.log('[GenerationTypeMode] Auto-switching to VACE because VACE structure type was selected:', type);
          onGenerationTypeModeChange('vace');
        }
      }
    }
  }, [structureVideoPath, structureVideoMetadata, structureVideoTreatment, structureVideoMotionStrength, handleStructureVideoChange, structureVideos, updateStructureVideo, onGenerationTypeModeChange, generationTypeMode]);

  // Wrapper for structure video change that also auto-switches generation type mode
  const handleStructureVideoChangeWithModeSwitch = useCallback((
    videoPath: string | null,
    metadata: import("@/shared/lib/videoUploader").VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => {
    // Call the original handler
    handleStructureVideoChange(videoPath, metadata, treatment, motionStrength, structureType, resourceId);
    
    // Auto-switch generation type mode based on structure type
    if (onGenerationTypeModeChange && videoPath) {
      if (structureType === 'uni3c') {
        // Uni3C uses I2V mode
        if (generationTypeMode !== 'i2v') {
          console.log('[GenerationTypeMode] Auto-switching to I2V because uni3c structure type was selected');
          onGenerationTypeModeChange('i2v');
        }
      } else {
        // flow, canny, depth use VACE mode
        if (generationTypeMode !== 'vace') {
          console.log('[GenerationTypeMode] Auto-switching to VACE because VACE structure type was selected:', structureType);
          onGenerationTypeModeChange('vace');
        }
      }
    }
  }, [handleStructureVideoChange, onGenerationTypeModeChange, generationTypeMode]);

  // Audio management (extracted to hook)
  const {
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isLoading: isAudioSettingsLoading,
  } = useAudio({
    projectId,
    shotId: selectedShot?.id,
  });

  // Auto-switch generationTypeMode when structure video is added/removed
  // When structure video is added: switch to VACE (unless uni3c selected) or I2V (if uni3c)
  // When removed: switch to I2V
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
    
    if (wasAdded) {
      // When adding structure video, switch to appropriate mode based on structure type
      const targetMode = structureVideoType === 'uni3c' ? 'i2v' : 'vace';
      if (generationTypeMode !== targetMode) {
        console.log(`[GenerationTypeMode] Auto-switching to ${targetMode.toUpperCase()} because structure video was added (type: ${structureVideoType})`);
        onGenerationTypeModeChange(targetMode);
      }
    } else if (wasRemoved && generationTypeMode !== 'i2v') {
      console.log('[GenerationTypeMode] Auto-switching to I2V because structure video was removed');
      onGenerationTypeModeChange('i2v');
    }
    
    prevStructureVideoPath.current = structureVideoPath;
  }, [structureVideoPath, structureVideoType, generationTypeMode, onGenerationTypeModeChange]);

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
          generation:generations!shot_generations_generation_id_generations_id_fk (
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
  
  // All shot images - use query data when available, fall back to context images during transition
  // This prevents the "flash to empty" when navigating between shots
  // PERF: Memoize to prevent ShotImagesEditor re-renders when reference doesn't actually change
  const allShotImages = React.useMemo(() => {
    return fullShotImages.length > 0 ? fullShotImages : contextImages;
  }, [fullShotImages, contextImages]);
  
  // Selector data with fallbacks derived from contextImages during transitions
  // This prevents UI flicker when navigating between shots
  const timelineImages = React.useMemo(() => {
    if (timelineImagesQuery.data && timelineImagesQuery.data.length > 0) {
      return timelineImagesQuery.data;
    }
    // Fallback: filter contextImages the same way the selector does
    return contextImages
      .filter(g => g.timeline_frame != null && g.timeline_frame >= 0 && !g.type?.includes('video'))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  }, [timelineImagesQuery.data, contextImages]);
  
  const unpositionedImages = React.useMemo(() => {
    if (unpositionedImagesQuery.data && unpositionedImagesQuery.data.length > 0) {
      return unpositionedImagesQuery.data;
    }
    // Fallback: filter contextImages the same way the selector does
    return contextImages.filter(g => g.timeline_frame == null && !g.type?.includes('video'));
  }, [unpositionedImagesQuery.data, contextImages]);
  
  const videoOutputs = React.useMemo(() => {
    if (videoOutputsQuery.data && videoOutputsQuery.data.length > 0) {
      return videoOutputsQuery.data;
    }
    // Fallback: filter contextImages the same way the selector does
    return contextImages.filter(g => g.type?.includes('video'));
  }, [videoOutputsQuery.data, contextImages]);
  
  console.log('[SelectorPattern] Shot data from selectors:', {
    shotId: selectedShotId?.substring(0, 8),
    allImages: allShotImages.length,
    fullQueryImages: fullShotImages.length,
    contextImages: contextImages.length,
    sources: {
      all: fullShotImages.length > 0 ? 'query' : 'context',
      timeline: timelineImagesQuery.data?.length ? 'query' : 'context',
      unpositioned: unpositionedImagesQuery.data?.length ? 'query' : 'context',
      videos: videoOutputsQuery.data?.length ? 'query' : 'context',
    },
    counts: { timelineImages: timelineImages.length, unpositionedImages: unpositionedImages.length, videoOutputs: videoOutputs.length },
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
  // CRITICAL: Pass isDragInProgress to suppress realtime/query reloads during drag operations
  const { pairPrompts, shotGenerations, clearAllEnhancedPrompts, updatePairPromptsByIndex, loadPositions } = useEnhancedShotPositions(selectedShotId, isDragInProgress);
  
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

  // Adjust columns based on aspect ratio - portrait images are narrower so we can fit more
  const aspectAdjustedColumns = useMemo(() => {
    if (!effectiveAspectRatio) return mobileColumns;

    const [w, h] = effectiveAspectRatio.split(':').map(Number);
    if (!w || !h) return mobileColumns;

    const ratio = w / h;

    // Portrait (ratio < 1): images are narrow, fit more columns
    // Landscape (ratio > 1): images are wide, fit fewer columns
    // Square (ratio = 1): use base columns

    if (ratio < 0.7) {
      // Very portrait (e.g., 9:16 = 0.56) - add 2 columns
      return Math.min(mobileColumns + 2, 8) as 2 | 3 | 4 | 6;
    } else if (ratio < 1) {
      // Slightly portrait (e.g., 3:4 = 0.75) - add 1 column
      return Math.min(mobileColumns + 1, 7) as 2 | 3 | 4 | 6;
    } else if (ratio > 1.5) {
      // Very landscape (e.g., 16:9 = 1.78) - reduce by 1 column (min 2)
      return Math.max(mobileColumns - 1, 2) as 2 | 3 | 4 | 6;
    }

    // Square or slightly landscape - use base columns
    return mobileColumns;
  }, [mobileColumns, effectiveAspectRatio]);
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
  const joinSegmentsSectionRef = useRef<HTMLDivElement>(null);
  const swapButtonRef = useRef<HTMLButtonElement>(null);
  
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

  // ============================================================================
  // GENERATE MODE TOGGLE (Batch Generate vs Join Segments) - PERSISTED PER SHOT
  // ============================================================================
  // Join Segments settings (shot-level persistence)
  // Settings are persisted per-shot, similar to video generation settings
  // Includes: generateMode toggle, all join settings, and LoRAs for join mode
  const joinSettings = useJoinSegmentsSettings(selectedShotId, projectId);
  const {
    prompt: joinPrompt = '',
    negativePrompt: joinNegativePrompt = '',
    contextFrameCount: joinContextFrames = 15,
    gapFrameCount: joinGapFrames = 23,
    replaceMode: joinReplaceMode = true,
    keepBridgingImages: joinKeepBridgingImages = false,
    enhancePrompt: joinEnhancePrompt = true,
    // Model settings (for stitch config)
    model: joinModel = 'wan_2_2_vace_lightning_baseline_2_2_2',
    numInferenceSteps: joinNumInferenceSteps = 6,
    guidanceScale: joinGuidanceScale = 3.0,
    seed: joinSeed = -1,
    // Motion preset settings
    motionMode: joinMotionMode = 'basic',
    phaseConfig: joinPhaseConfig,
    selectedPhasePresetId: joinSelectedPhasePresetId,
    randomSeed: joinRandomSeed = true,
    // Optional settings with defaults
    priority: joinPriority = 0,
    useInputVideoResolution: joinUseInputVideoResolution = false,
    useInputVideoFps: joinUseInputVideoFps = false,
    noisedInputVideo: joinNoisedInputVideo = 0,
    loopFirstClip: joinLoopFirstClip = false,
    // NEW: Persisted generate mode and LoRAs
    generateMode = 'batch',
    selectedLoras: joinSelectedLoras = [],
    stitchAfterGenerate = false,
  } = joinSettings.settings;
  
  // Setter for generate mode (persisted)
  const setGenerateMode = useCallback((mode: 'batch' | 'join') => {
    joinSettings.updateField('generateMode', mode);
  }, [joinSettings]);

  // Toggle mode while preserving scroll position (prevents page jump when form height changes)
  const toggleGenerateModePreserveScroll = useCallback((newMode: 'batch' | 'join') => {
    const button = swapButtonRef.current;
    if (!button) {
      setGenerateMode(newMode);
      return;
    }
    // Capture button's position relative to viewport before mode change
    const rectBefore = button.getBoundingClientRect();
    const offsetFromTop = rectBefore.top;

    setGenerateMode(newMode);

    // After DOM updates, restore scroll so the (new) swap button stays in the same place
    requestAnimationFrame(() => {
      const newButton = swapButtonRef.current;
      if (!newButton) return;
      const rectAfter = newButton.getBoundingClientRect();
      const scrollDelta = rectAfter.top - offsetFromTop;
      if (Math.abs(scrollDelta) > 1) {
        window.scrollBy({ top: scrollDelta, behavior: 'instant' });
      }
    });
  }, [setGenerateMode]);

  // Join clips state
  const [isJoiningClips, setIsJoiningClips] = useState(false);
  const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);
  
  // ============================================================================
  // SHARED OUTPUT SELECTION STATE (PERSISTED PER SHOT)
  // ============================================================================
  // This state is shared between FinalVideoSection and SegmentOutputStrip (via Timeline)
  // so selecting a different output updates both the final video display and the segment strip.
  // Persisted to shot settings so selection survives page refreshes and shot switching.
  const { 
    settings: outputSelectionSettings, 
    update: updateOutputSelectionSettings,
    isLoading: isOutputSelectionLoading 
  } = useToolSettings<{
    selectedParentGenerationId?: string | null;
  }>('travel-selected-output', { 
    projectId: selectedProjectId, 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });
  
  // Internal state for immediate UI updates
  const [selectedOutputId, setSelectedOutputIdState] = useState<string | null>(null);
  const hasInitializedOutputSelection = useRef<string | null>(null);
  // Track if we're currently persisting to avoid re-loading our own writes
  const isPersistingRef = useRef(false);

  // Track pending parent ID for main generations within the same shot
  // When a main generation is submitted without a parent, the newly created parent ID is stored here
  // Subsequent submissions for the same shot will reuse this parent instead of creating a new one
  const pendingMainParentRef = useRef<{ shotId: string; parentId: string; timestamp: number } | null>(null);
  
  // Load persisted selection when shot loads (one-time init per shot)
  useEffect(() => {
    // Skip if still loading, no shot, or we're persisting
    if (isOutputSelectionLoading || !selectedShot?.id || isPersistingRef.current) return;
    if (hasInitializedOutputSelection.current === selectedShot.id) return;
    
    const persistedId = outputSelectionSettings?.selectedParentGenerationId ?? null;
    setSelectedOutputIdState(persistedId);
    hasInitializedOutputSelection.current = selectedShot.id;
  }, [isOutputSelectionLoading, outputSelectionSettings, selectedShot?.id]);
  
  // Reset initialization flag when shot changes
  useEffect(() => {
    if (selectedShot?.id !== hasInitializedOutputSelection.current) {
      hasInitializedOutputSelection.current = null;
    }
  }, [selectedShot?.id]);
  
  // Setter that updates both state and persists to DB
  const setSelectedOutputId = useCallback((id: string | null) => {
    setSelectedOutputIdState(id);
    // Mark that we're persisting to avoid re-loading our own write
    isPersistingRef.current = true;
    updateOutputSelectionSettings('shot', { selectedParentGenerationId: id });
    // Clear the flag after a short delay
    setTimeout(() => { isPersistingRef.current = false; }, 100);
  }, [updateOutputSelectionSettings]);
  
  // LoRA manager interface for Join Segments (shot-level persistence via joinSettings)
  // This creates a compatible interface with useLoraManager for the JoinClipsSettingsForm
  const joinLoraManager = useMemo(() => ({
    selectedLoras: joinSelectedLoras,
    setSelectedLoras: (loras: typeof joinSelectedLoras) => {
      joinSettings.updateField('selectedLoras', loras);
    },
    isLoraModalOpen: false,
    setIsLoraModalOpen: () => {},
    handleAddLora: (loraToAdd: any, _isManualAction = true, initialStrength?: number) => {
      if (joinSelectedLoras.find(sl => sl.id === loraToAdd["Model ID"])) {
        return; // Already exists
      }
      if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
        const loraName = loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"];
        const hasHighNoise = !!loraToAdd.high_noise_url;
        const hasLowNoise = !!loraToAdd.low_noise_url;
        const isMultiStage = hasHighNoise || hasLowNoise;
        const primaryPath = isMultiStage
          ? (loraToAdd.high_noise_url || loraToAdd.low_noise_url)
          : (loraToAdd["Model Files"][0].url || loraToAdd["Model Files"][0].path);
        
        const newLora = {
          id: loraToAdd["Model ID"],
          name: loraName,
          path: hasHighNoise ? loraToAdd.high_noise_url : primaryPath,
          strength: initialStrength || 1.0,
          previewImageUrl: loraToAdd.Images?.[0]?.url,
          trigger_word: loraToAdd.trigger_word,
          lowNoisePath: hasLowNoise ? loraToAdd.low_noise_url : undefined,
          isMultiStage,
        };
        joinSettings.updateField('selectedLoras', [...joinSelectedLoras, newLora]);
      }
    },
    handleRemoveLora: (loraId: string) => {
      joinSettings.updateField('selectedLoras', joinSelectedLoras.filter(l => l.id !== loraId));
    },
    handleLoraStrengthChange: (loraId: string, newStrength: number) => {
      joinSettings.updateField('selectedLoras', 
        joinSelectedLoras.map(l => l.id === loraId ? { ...l, strength: newStrength } : l)
      );
    },
    hasEverSetLoras: joinSelectedLoras.length > 0,
    shouldApplyDefaults: false,
    markAsUserSet: () => {},
  }), [joinSelectedLoras, joinSettings]);
  
  // Get properly ordered segment outputs from useSegmentOutputsForShot
  // This hook correctly orders videos by their pair_shot_generation_id → timeline position
  // Unlike videoOutputs which requires position field (never set for videos)
  // Uses controlled selectedOutputId so selection is shared with FinalVideoSection and SegmentOutputStrip
  // IMPORTANT: Only pass controlled state AFTER persistence has loaded to avoid race conditions
  const outputSelectionReady = hasInitializedOutputSelection.current === selectedShot?.id;
  const {
    segmentSlots: joinSegmentSlots,
    segments: joinSegments,
    selectedParent: joinSelectedParent,
    parentGenerations,
    segmentProgress,
    isLoading: isSegmentOutputsLoading,
  } = useSegmentOutputsForShot(
    selectedShotId,
    projectId,
    undefined, // localShotGenPositions not needed here
    outputSelectionReady ? selectedOutputId : undefined,
    outputSelectionReady ? setSelectedOutputId : undefined
  );

  // Auto-select first parent generation when controlled mode is ready but no selection exists
  useEffect(() => {
    console.log('[ParentReuseDebug] Auto-select effect running:', {
      outputSelectionReady,
      parentGenerationsCount: parentGenerations.length,
      parentGenerationIds: parentGenerations.slice(0, 3).map(p => p.id.substring(0, 8)),
      selectedOutputId: selectedOutputId?.substring(0, 8) || 'null'
    });

    if (!outputSelectionReady) {
      console.log('[ParentReuseDebug] Auto-select: skipping - not ready');
      return;
    }
    if (parentGenerations.length === 0) {
      console.log('[ParentReuseDebug] Auto-select: skipping - no parents');
      return;
    }

    // Select first if nothing selected or current selection doesn't exist
    const selectionExists = selectedOutputId && parentGenerations.some(p => p.id === selectedOutputId);
    if (!selectionExists) {
      console.log('[ParentReuseDebug] Auto-select: ✅ Setting selectedOutputId to:', parentGenerations[0].id.substring(0, 8));
      setSelectedOutputId(parentGenerations[0].id);
    } else {
      console.log('[ParentReuseDebug] Auto-select: already have valid selection');
    }
  }, [outputSelectionReady, parentGenerations, selectedOutputId, setSelectedOutputId]);

  // Calculate shortest clip frame count for join clips validation
  // Uses segmentSlots which properly excludes videos at invalid positions (e.g., last image)
  const joinValidationData = useMemo(() => {
    // Count segments that are in valid slots AND have a location (completed videos)
    const readySlots = joinSegmentSlots.filter(
      slot => slot.type === 'child' && Boolean((slot.child as any).location)
    );
    
    if (readySlots.length < 2) {
      return { shortestClipFrames: undefined, videoCount: readySlots.length };
    }
    
    // Get frame counts from video params or metadata
    const frameCounts = readySlots.map(slot => {
      const child = (slot as any).child;
      const params = child.params as any;
      const metadata = child.metadata as any;
      // Try params.frame_count first (set during generation), then metadata
      return params?.frame_count || params?.num_frames || metadata?.frame_count || metadata?.frameCount || 61;
    });
    
    return {
      shortestClipFrames: Math.min(...frameCounts),
      videoCount: readySlots.length,
    };
  }, [joinSegmentSlots]);

  // [JoinSegmentsDebug] Explain why the "Join Segments" UI is (or isn't) available.
  // Now uses useSegmentOutputsForShot which correctly orders videos by pair position.
  useEffect(() => {
    if (!selectedShotId) return;

    const readySegments = joinSegments.filter(seg => Boolean(seg.location));

    // Sample segments to see their state
    const sample = joinSegments.slice(0, 8).map(seg => {
      const params = seg.params as any;
      // Prefer FK column, fall back to params for legacy data
      const pairShotGenId = (seg as any).pair_shot_generation_id
        || params?.individual_segment_params?.pair_shot_generation_id
        || params?.pair_shot_generation_id;
      return {
        id: seg.id?.substring(0, 8),
        type: seg.type,
        hasLocation: Boolean(seg.location),
        pairShotGenId: pairShotGenId?.substring(0, 8) || null,
        segmentIndex: params?.segment_index,
        childOrder: (seg as any).child_order,
      };
    });

    console.log('[JoinSegmentsDebug] Eligibility summary (via useSegmentOutputsForShot):', {
      shotId: selectedShotId.substring(0, 8),
      totals: {
        totalSegments: joinSegments.length,
        readyToJoin: readySegments.length,
        segmentSlots: joinSegmentSlots.length,
        hasParent: !!joinSelectedParent,
      },
      computed: joinValidationData,
      sample,
      hint:
        readySegments.length < 2
          ? 'Join Segments requires >= 2 completed video segments with locations.'
          : 'Join Segments should be available.',
    });
  }, [selectedShotId, joinSegments, joinSegmentSlots, joinSelectedParent, joinValidationData]);

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

  // ============================================================================
  // JOIN SEGMENTS HANDLER
  // ============================================================================
  const handleJoinSegments = useCallback(async () => {
    if (!projectId || joinValidationData.videoCount < 2) {
      toast.error('Need at least 2 completed video segments to join');
      return;
    }

    // Add incoming task immediately for instant TasksPane feedback
    const taskLabel = joinPrompt
      ? (joinPrompt.length > 50 ? joinPrompt.substring(0, 50) + '...' : joinPrompt)
      : `Join ${joinValidationData.videoCount} segments`;
    const currentBaseline = taskStatusCounts?.processing ?? 0;
    const incomingTaskId = addIncomingTask({
      taskType: 'join_clips_orchestrator',
      label: taskLabel,
      baselineCount: currentBaseline,
    });

    setIsJoiningClips(true);

    try {
      // Get ordered segments from segmentSlots (already sorted by pair position)
      // Filter to only child slots with locations
      const orderedSegments = joinSegmentSlots
        .filter((slot): slot is { type: 'child'; child: GenerationRow; index: number } => 
          slot.type === 'child' && Boolean(slot.child.location)
        )
        .map(slot => slot.child);

      // Fetch fresh URLs from database to ensure we get current video locations
      const videoIds = orderedSegments.map(v => v.id).filter(Boolean);
      const { data: freshVideos, error: fetchError } = await supabase
        .from('generations')
        .select('id, location')
        .in('id', videoIds);
      
      if (fetchError) {
        console.error('[JoinSegments] Error fetching fresh video URLs:', fetchError);
        throw new Error('Failed to fetch video URLs');
      }

      // Build a map of id -> fresh location
      const freshUrlMap = new Map(freshVideos?.map(v => [v.id, v.location]) || []);
      
      console.log('[JoinSegments] Fresh URL fetch:', {
        requestedIds: videoIds.length,
        receivedIds: freshVideos?.length || 0,
        urlsChanged: orderedSegments.filter(v => v.location !== freshUrlMap.get(v.id)).length,
      });

      const clips = orderedSegments.map((video, index) => ({
        url: freshUrlMap.get(video.id) || video.location || '',
        name: `Segment ${index + 1}`,
      })).filter(c => c.url);

      // Convert selected LoRAs
      const lorasForTask = joinLoraManager.selectedLoras.map(lora => ({
        path: lora.path,
        strength: lora.strength,
      }));

      // Parse resolution from aspect ratio
      let resolutionTuple: [number, number] | undefined;
      if (effectiveAspectRatio && ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio]) {
        const res = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
        const [w, h] = res.split('x').map(Number);
        if (w && h) {
          resolutionTuple = [w, h];
        }
      }

      console.log('[JoinSegments] Creating join task:', {
        clipCount: clips.length,
        clipUrls: clips.map(c => c.url.substring(c.url.lastIndexOf('/') + 1)),
        prompt: joinPrompt,
        contextFrames: joinContextFrames,
        gapFrames: joinGapFrames,
        replaceMode: joinReplaceMode,
        keepBridgingImages: joinKeepBridgingImages,
        loras: lorasForTask.length,
        resolution: resolutionTuple,
        shotId: selectedShotId,
      });

      await createJoinClipsTask({
        project_id: projectId,
        shot_id: selectedShotId, // For "Visit Shot" button in TasksPane
        clips,
        prompt: joinPrompt,
        negative_prompt: joinNegativePrompt,
        context_frame_count: joinContextFrames,
        gap_frame_count: joinGapFrames,
        replace_mode: joinReplaceMode,
        keep_bridging_images: joinKeepBridgingImages,
        enhance_prompt: joinEnhancePrompt,
        model: 'wan_2_2_vace_lightning_baseline_2_2_2',
        num_inference_steps: 6,
        guidance_scale: 3.0,
        seed: -1,
        // Use the root parent generation so the joined video updates the Final Video display
        parent_generation_id: joinSelectedParent?.id,
        // Attribute to travel-between-images tool
        tool_type: 'travel-between-images',
        use_input_video_resolution: false,
        use_input_video_fps: false,
        motion_mode: joinMotionMode,
        selected_phase_preset_id: joinSelectedPhasePresetId ?? null,
        ...(lorasForTask.length > 0 && { loras: lorasForTask }),
        ...(resolutionTuple && { resolution: resolutionTuple }),
        // Pass audio URL from timeline if available
        ...(audioUrl && { audio_url: audioUrl }),
        // Pass phase config for motion presets
        ...(joinPhaseConfig && { phase_config: joinPhaseConfig }),
      });

      // Remove incoming task placeholder - real task should now appear
      removeIncomingTask(incomingTaskId);

      setJoinClipsSuccess(true);
      setTimeout(() => setJoinClipsSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error: any) {
      console.error('[JoinSegments] Error creating join task:', error);
      toast.error(error.message || 'Failed to create join task');
      // Remove incoming task on error too
      removeIncomingTask(incomingTaskId);
    } finally {
      setIsJoiningClips(false);
    }
  }, [
    projectId,
    joinValidationData.videoCount,
    joinSegmentSlots,
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinEnhancePrompt,
    joinMotionMode,
    joinSelectedPhasePresetId,
    joinLoraManager.selectedLoras,
    effectiveAspectRatio,
    selectedShotId,
    audioUrl,
    joinPhaseConfig,
    joinSelectedParent,
    queryClient,
    taskStatusCounts,
    addIncomingTask,
    removeIncomingTask,
  ]);

  // Handler to restore join clips defaults
  // Note: Does NOT reset generateMode (that's a mode toggle, not a setting)
  const handleRestoreJoinDefaults = useCallback(() => {
    // Default values
    let context = 15;
    let gap = 23;

    // Scale down proportionally if constraint is violated
    // REPLACE mode constraint: min_clip_frames ≥ gap + 2*context
    const shortestFrames = joinValidationData.shortestClipFrames;
    if (shortestFrames && shortestFrames > 0) {
      const framesNeeded = gap + 2 * context;
      if (framesNeeded > shortestFrames) {
        // Scale down proportionally while maintaining gap:context ratio
        const scale = shortestFrames / framesNeeded;
        context = Math.max(4, Math.floor(context * scale));
        gap = Math.max(1, Math.floor(gap * scale));
        console.log('[ShotEditor] Scaled join defaults to fit constraint:', { context, gap, shortestFrames, framesNeeded });
      }
    }

    joinSettings.updateFields({
      prompt: '',
      negativePrompt: '',
      contextFrameCount: context,
      gapFrameCount: gap,
      replaceMode: true,
      keepBridgingImages: false,
      enhancePrompt: true,
      motionMode: 'basic',
      phaseConfig: DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
      selectedPhasePresetId: BUILTIN_JOIN_CLIPS_DEFAULT_ID,
      randomSeed: true,
      selectedLoras: [], // Also reset LoRAs
    });
  }, [joinSettings, joinValidationData.shortestClipFrames]);

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

  // State to track final video clearing operation
  const [isClearingFinalVideo, setIsClearingFinalVideo] = useState(false);

  // Handler for clearing the final video output (not deleting the entire generation)
  // This clears the location/thumbnail and deletes ALL variants,
  // but keeps the generation so it can be regenerated
  const handleDeleteFinalVideo = useCallback(async (generationId: string) => {
    console.log('[FinalVideoDelete] handleDeleteFinalVideo (clear output) called', {
      generationId: generationId?.substring(0, 8),
      selectedShotId: selectedShot?.id?.substring(0, 8),
      projectId: projectId?.substring(0, 8),
    });

    setIsClearingFinalVideo(true);

    try {
      // 1. Clear the generation's location and thumbnail_url (keeps the generation record)
      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: null,
          thumbnail_url: null
        })
        .eq('id', generationId);

      if (updateError) {
        console.error('[FinalVideoDelete] Error clearing generation location:', updateError);
        toast.error('Failed to clear final video output');
        return;
      }

      console.log('[FinalVideoDelete] Cleared generation location');

      // 2. Delete ALL variants of this generation (not just primary)
      const { data: deletedVariants, error: deleteVariantError } = await supabase
        .from('generation_variants')
        .delete()
        .eq('generation_id', generationId)
        .select('id');

      if (deleteVariantError) {
        console.error('[FinalVideoDelete] Error deleting variants:', deleteVariantError);
        // Don't fail the whole operation if variant delete fails
      } else {
        console.log('[FinalVideoDelete] Deleted all variants:', deletedVariants?.length || 0);
      }

      console.log('[FinalVideoDelete] Clear output SUCCESS - invalidating queries');

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['segment-parent-generations', selectedShot?.id, projectId] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['project-video-counts', projectId] });

      // Note: Don't clear selection - the generation still exists, just without an output
    } catch (error) {
      console.error('[FinalVideoDelete] Unexpected error:', error);
      toast.error('Failed to clear final video output');
    } finally {
      setIsClearingFinalVideo(false);
    }
  }, [queryClient, selectedShot?.id, projectId]);

  // Early return check moved to end of component


  // 🎯 PERF FIX: Use refs to avoid callback recreation on shot/project changes
  const updateShotImageOrderMutationRef = useRef(updateShotImageOrderMutation);
  updateShotImageOrderMutationRef.current = updateShotImageOrderMutation;

  const demoteOrphanedVariantsRef = useRef(demoteOrphanedVariants);
  demoteOrphanedVariantsRef.current = demoteOrphanedVariants;
  
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
      onSuccess: () => {
        // Check for orphaned video variants after reorder
        // Videos whose source images have changed positions will be demoted
        console.log('[DemoteOrphaned] 🎯 Triggering from handleReorderImagesInShot', {
          shotId: shot.id.substring(0, 8),
          newOrderCount: orderedShotGenerationIds.length,
          newOrder: orderedShotGenerationIds.map(id => id.substring(0, 8)),
        });
        demoteOrphanedVariantsRef.current(shot.id, 'image-reorder');
      },
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
  // Uses fire-and-forget pattern: returns immediately, task creation happens in background
  const handleGenerateBatch = useCallback((variantNameParam: string) => {
    // Add incoming task immediately for instant TasksPane feedback
    const taskLabel = variantNameParam || selectedShot?.name || 'Travel video';
    const currentBaseline = taskStatusCounts?.processing ?? 0;
    const incomingTaskId = addIncomingTask({
      taskType: 'travel_orchestrator',
      label: taskLabel.length > 50 ? taskLabel.substring(0, 50) + '...' : taskLabel,
      baselineCount: currentBaseline,
    });

    // Show success feedback immediately (task is being created)
    setSteerableMotionJustQueued(true);
    setTimeout(() => setSteerableMotionJustQueued(false), 2000);

    // Fire-and-forget: run task creation in background
    (async () => {
      try {
        // Determine the parent generation ID to use:
        // 1. If user has selected an output, use that (selectedOutputId)
        // 2. If there's a recent pending parent for this shot (within 10s), reuse it
        // 3. Otherwise, let the service create a new parent
        let effectiveParentId = selectedOutputId ?? undefined;

        // [ParentReuseDebug] Log initial state
        console.log('[ParentReuseDebug] === handleGenerateBatch START ===');
        console.log('[ParentReuseDebug] selectedOutputId:', selectedOutputId?.substring(0, 8) || 'null');
        console.log('[ParentReuseDebug] selectedShotId:', selectedShotId?.substring(0, 8) || 'null');
        console.log('[ParentReuseDebug] pendingMainParentRef.current:', pendingMainParentRef.current ? {
          shotId: pendingMainParentRef.current.shotId.substring(0, 8),
          parentId: pendingMainParentRef.current.parentId.substring(0, 8),
          timestamp: pendingMainParentRef.current.timestamp,
          age: Date.now() - pendingMainParentRef.current.timestamp + 'ms'
        } : 'null');

        if (!effectiveParentId && selectedShotId) {
          const pending = pendingMainParentRef.current;

          // [ParentReuseDebug] Log the reuse check
          if (pending) {
            const age = Date.now() - pending.timestamp;
            const shotIdMatches = pending.shotId === selectedShotId;
            console.log('[ParentReuseDebug] Checking pending parent:', {
              pendingParentId: pending.parentId.substring(0, 8),
              pendingShotId: pending.shotId.substring(0, 8),
              currentShotId: selectedShotId.substring(0, 8),
              shotIdMatches,
              age: age + 'ms',
              willReuse: shotIdMatches
            });
          } else {
            console.log('[ParentReuseDebug] No pending parent to check');
          }

          // Always reuse pending parent for the same shot (no TTL - parent is valid indefinitely)
          if (pending && pending.shotId === selectedShotId) {
            console.log('[ParentReuseDebug] ✅ REUSING pending parent:', pending.parentId.substring(0, 8));
            effectiveParentId = pending.parentId;
          } else {
            console.log('[ParentReuseDebug] ❌ NOT reusing - will create new parent');
          }
        } else {
          console.log('[ParentReuseDebug] Using selectedOutputId or no shotId:', effectiveParentId?.substring(0, 8) || 'none');
        }

        // Call the service with all required parameters
        const result = await generateVideo({
          projectId,
          selectedShotId,
          selectedShot,
          queryClient,
          onShotImagesUpdate,
          effectiveAspectRatio,
          generationMode,
          // Grouped configs (snake_case matching API)
          promptConfig: {
            base_prompt: batchVideoPrompt,
            enhance_prompt: enhancePrompt,
            text_before_prompts: textBeforePrompts,
            text_after_prompts: textAfterPrompts,
            default_negative_prompt: negativePrompt,
          },
          motionConfig: {
            amount_of_motion: amountOfMotion,
            motion_mode: motionMode || 'basic',
            advanced_mode: advancedMode,
            phase_config: phaseConfig,
            selected_phase_preset_id: selectedPhasePresetId,
          },
          modelConfig: {
            seed: steerableMotionSettings.seed,
            random_seed: randomSeed,
            turbo_mode: turboMode,
            debug: steerableMotionSettings.debug || false,
            generation_type_mode: generationTypeMode || 'i2v',
            // HARDCODED: SVI (smooth continuations) feature has been removed from UX
            // Always set to false regardless of persisted shot settings
            use_svi: false,
          },
          structureVideoConfig,
          structureVideos, // NEW: Multi-video array support
          batchVideoFrames,
          selectedLoras: loraManager.selectedLoras.map(lora => ({
            id: lora.id,
            path: lora.path,
            strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
            name: lora.name
          })),
          variantNameParam,
          clearAllEnhancedPrompts,
          // Uni3C end percent (from structure video config)
          uni3cEndPercent: structureVideoConfig.uni3c_end_percent,
          // Pass the effective parent ID (either selected, pending, or undefined for new)
          parentGenerationId: effectiveParentId,
          // Stitch config - if enabled, orchestrator will create join task after segments complete
          // Contains ALL settings needed independently from travel generation
          stitchConfig: stitchAfterGenerate ? {
            // Frame settings
            context_frame_count: joinContextFrames,
            gap_frame_count: joinGapFrames,
            replace_mode: joinReplaceMode,
            keep_bridging_images: joinKeepBridgingImages,
            // Prompt settings
            prompt: joinPrompt,
            negative_prompt: joinNegativePrompt,
            enhance_prompt: joinEnhancePrompt,
            // Model settings (independent from travel generation)
            model: joinModel,
            num_inference_steps: joinNumInferenceSteps,
            guidance_scale: joinGuidanceScale,
            seed: joinSeed,
            random_seed: joinRandomSeed,
            // Motion settings
            motion_mode: joinMotionMode,
            phase_config: joinPhaseConfig,
            selected_phase_preset_id: joinSelectedPhasePresetId,
            loras: joinSelectedLoras.map(l => ({ path: l.path, strength: l.strength })),
            // Optional settings
            priority: joinPriority,
            use_input_video_resolution: joinUseInputVideoResolution,
            use_input_video_fps: joinUseInputVideoFps,
            vid2vid_init_strength: joinNoisedInputVideo,
            loop_first_clip: joinLoopFirstClip,
          } : undefined,
        });

        // [ParentReuseDebug] Log the result
        console.log('[ParentReuseDebug] generateVideo result:', {
          success: result.success,
          parentGenerationId: result.parentGenerationId?.substring(0, 8) || 'undefined',
          effectiveParentIdUsed: effectiveParentId?.substring(0, 8) || 'undefined',
          parentWasProvided: !!effectiveParentId,
          newParentCreated: result.parentGenerationId && result.parentGenerationId !== effectiveParentId
        });

        // If a new parent was created (no prior selection), store it and invalidate the query
        if (result.success && result.parentGenerationId && !selectedOutputId && selectedShotId) {
          console.log('[ParentReuseDebug] ✅ STORING pending parent for future reuse:', {
            parentId: result.parentGenerationId.substring(0, 8),
            shotId: selectedShotId.substring(0, 8),
            timestamp: Date.now()
          });
          pendingMainParentRef.current = {
            shotId: selectedShotId,
            parentId: result.parentGenerationId,
            timestamp: Date.now(),
          };

          // Invalidate segment-parent-generations so the auto-select effect picks up the new parent
          // This is the proper fix - the pendingMainParentRef is just a fallback for rapid submissions
          console.log('[ParentReuseDebug] Invalidating segment-parent-generations query');
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'segment-parent-generations'
          });
        } else {
          console.log('[ParentReuseDebug] NOT storing pending parent:', {
            success: result.success,
            hasParentGenerationId: !!result.parentGenerationId,
            hasSelectedOutputId: !!selectedOutputId,
            hasSelectedShotId: !!selectedShotId,
            reason: !result.success ? 'not successful' :
                    !result.parentGenerationId ? 'no parent ID returned' :
                    selectedOutputId ? 'user had selected output' :
                    !selectedShotId ? 'no shot ID' : 'unknown'
          });
        }
        console.log('[ParentReuseDebug] === handleGenerateBatch END ===');

      } catch (error) {
        console.error('[handleGenerateBatch] Error creating task:', error);
        toast.error('Failed to create video task. Please try again.');
      } finally {
        // Wait for task queries to refetch, then remove placeholder
        await queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'] });
        await queryClient.refetchQueries({ queryKey: ['task-status-counts'] });
        console.log('[handleGenerateBatch] Removing incoming task placeholder:', incomingTaskId);
        removeIncomingTask(incomingTaskId);
      }
    })();
  }, [
    projectId,
    selectedProjectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate,
    effectiveAspectRatio,
    generationMode,
    // PromptConfig deps
    batchVideoPrompt,
    textBeforePrompts,
    textAfterPrompts,
    enhancePrompt,
    steerableMotionSettings, // for negative_prompt, seed, debug
    // MotionConfig deps
    amountOfMotion,
    motionMode,
    advancedMode,
    phaseConfig,
    selectedPhasePresetId,
    // ModelConfig deps
    randomSeed,
    turboMode,
    generationTypeMode,
    smoothContinuations,
    // Other deps
    batchVideoFrames,
    loraManager.selectedLoras,
    structureVideoConfig,
    clearAllEnhancedPrompts,
    selectedOutputId,
    // Stitch config deps (all settings for independent join generation)
    stitchAfterGenerate,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinPrompt,
    joinNegativePrompt,
    joinEnhancePrompt,
    joinModel,
    joinNumInferenceSteps,
    joinGuidanceScale,
    joinSeed,
    joinRandomSeed,
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinSelectedLoras,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    // IncomingTasks deps
    addIncomingTask,
    removeIncomingTask,
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
    // Use unified shot creation - handles inheritance, events, lastAffected automatically
    const result = await createShotRef.current({ name });
    if (!result) {
      throw new Error('Failed to create shot');
    }
    return result.shotId;
  }, []);
  

  // Calculate current settings for MotionControl
  const currentMotionSettings = useMemo(() => {
    const settings = {
        textBeforePrompts,
        textAfterPrompts,
        basePrompt: batchVideoPrompt,
        negativePrompt,
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
  }, [textBeforePrompts, textAfterPrompts, batchVideoPrompt, negativePrompt, enhancePrompt, batchVideoFrames, lastVideoGeneration, loraManager.selectedLoras]);

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

      {/* Final Video Section - Shows selected output with dropdown to switch between generations */}
      <div ref={videoGalleryRef} className="flex flex-col gap-4">
        <FinalVideoSection
          shotId={selectedShotId}
          projectId={projectId}
          projectAspectRatio={effectiveAspectRatio}
          onApplySettingsFromTask={applySettingsFromTask}
          onJoinSegmentsClick={() => {
            setGenerateMode('join');

            // Scroll to the generate card - use double RAF to ensure DOM is fully updated after mode switch
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const target = generateVideosCardRef.current;
                if (target) {
                  const rect = target.getBoundingClientRect();
                  const scrollTop = window.scrollY + rect.top - 20; // 20px padding above
                  window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                }
              });
            });
          }}
          selectedParentId={selectedOutputId}
          onSelectedParentChange={setSelectedOutputId}
          parentGenerations={parentGenerations}
          segmentProgress={segmentProgress}
          isParentLoading={isSegmentOutputsLoading}
          getFinalVideoCount={getFinalVideoCount}
          onDelete={handleDeleteFinalVideo}
          isDeleting={isClearingFinalVideo}
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
            columns={aspectAdjustedColumns as 2 | 3 | 4 | 6}
            skeleton={
              <ImageManagerSkeleton
                isMobile={isMobile}
                {...({ columns: aspectAdjustedColumns } as any)}
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
            defaultNegativePrompt={negativePrompt}
            onDefaultNegativePromptChange={onNegativePromptChange}
            // Structure video props (legacy single-video)
            structureVideoPath={structureVideoPath}
            structureVideoMetadata={structureVideoMetadata}
            structureVideoTreatment={structureVideoTreatment}
            structureVideoMotionStrength={structureVideoMotionStrength}
            structureVideoType={structureVideoType}
            onStructureVideoChange={handleStructureVideoChangeWithModeSwitch}
            uni3cEndPercent={structureVideoConfig.uni3c_end_percent}
            onUni3cEndPercentChange={handleUni3cEndPercentChange}
            // NEW: Multi-video array props
            structureVideos={structureVideos}
            onAddStructureVideo={addStructureVideo}
            onUpdateStructureVideo={updateStructureVideo}
            onRemoveStructureVideo={removeStructureVideo}
            onSetStructureVideos={setStructureVideos}
            // Audio strip props
            audioUrl={audioUrl}
            audioMetadata={audioMetadata}
            onAudioChange={handleAudioChange}
            // Shot management for external generation viewing
            allShots={shots}
            onShotChange={handleShotChange}
            onAddToShot={handleAddToShot}
            onAddToShotWithoutPosition={handleAddToShotWithoutPosition}
            onCreateShot={handleCreateShot}
            onDragStateChange={handleDragStateChange}
            // Single image duration - updates batchVideoFrames when endpoint is dragged
            onSingleImageDurationChange={onBatchVideoFramesChange}
            // Frame limit (77 with smooth continuations, 81 otherwise)
            maxFrameLimit={smoothContinuations ? 77 : 81}
            // Pass smoothContinuations to trigger timeline gap compaction when enabled
            smoothContinuations={smoothContinuations}
            // Shared output selection (syncs FinalVideoSection with SegmentOutputStrip)
            selectedOutputId={(() => {
              console.log('[BatchModeSelection] ShotEditor passing to ShotImagesEditor:', {
                selectedOutputId: selectedOutputId?.substring(0, 8) || 'null',
                hasSetSelectedOutputId: !!setSelectedOutputId,
                generationMode: effectiveGenerationMode,
              });
              return selectedOutputId;
            })()}
            onSelectedOutputChange={setSelectedOutputId}
          />
        </div>

        {/* Generation Settings */}
        <div className="w-full" ref={generateVideosCardRef} style={{ overflowAnchor: 'none' }}>
          <Card>
            <CardHeader className="pb-2">
                {/* Toggle header - selected option on left, swap icon, other option on right */}
                {/* Hidden when stitchAfterGenerate is enabled OR when there are 2 or fewer images */}
                {stitchAfterGenerate || simpleFilteredImages.length <= 2 ? (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-base sm:text-lg font-light text-foreground">
                      {simpleFilteredImages.length <= 1 ? 'Generate' : 'Batch Generate'}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs bg-primary/15 text-primary px-2.5 py-1 rounded-full font-medium cursor-help">
                          Shot Defaults
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>These settings are used as defaults for individual<br />segment generation and batch generation.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {/* Left position: active option */}
                      <span className="text-base sm:text-lg font-light text-foreground">
                        {generateMode === 'batch' ? 'Batch Generate' : 'Join Segments'}
                      </span>

                      {/* Swap button with arrows */}
                    <button
                      onClick={() => {
                        console.log('[JoinSegmentsDebug] Toggle clicked (swap button):', {
                          shotId: selectedShotId?.substring(0, 8),
                          from: generateMode,
                          to: generateMode === 'batch' ? 'join' : 'batch',
                          joinValidationData,
                          videoOutputsCount: videoOutputs.length,
                        });
                        setGenerateMode(generateMode === 'batch' ? 'join' : 'batch');
                      }}
                      className={`p-1 rounded-full transition-colors ${
                        (generateMode === 'batch' && joinValidationData.videoCount < 2)
                          ? 'text-muted-foreground/30 cursor-not-allowed'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer'
                      }`}
                      title={generateMode === 'batch' ? 'Switch to Join Segments' : 'Switch to Batch Generate'}
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>

                    {/* Right position: inactive option (clickable) */}
                    <button
                      onClick={() => {
                        console.log('[JoinSegmentsDebug] Toggle clicked (label button):', {
                          shotId: selectedShotId?.substring(0, 8),
                          from: generateMode,
                          to: generateMode === 'batch' ? 'join' : 'batch',
                          joinValidationData,
                          videoOutputsCount: videoOutputs.length,
                        });
                        setGenerateMode(generateMode === 'batch' ? 'join' : 'batch');
                      }}
                      className={`text-sm transition-colors ${
                        (generateMode === 'batch' && joinValidationData.videoCount < 2)
                          ? 'text-muted-foreground/30 cursor-not-allowed'
                          : 'text-muted-foreground hover:text-foreground cursor-pointer'
                      }`}
                    >
                      {generateMode === 'batch'
                        ? 'Join Segments'
                        : 'Batch Generate'
                      }
                    </button>
                    </div>

                    {/* Shot Defaults badge - only show in batch mode, far right */}
                    {generateMode === 'batch' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs bg-primary/15 text-primary px-2.5 py-1 rounded-full font-medium cursor-help">
                            Shot Defaults
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>These settings are used as defaults for individual<br />segment generation and batch generation.</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
            </CardHeader>
            <CardContent>
              {generateMode === 'batch' ? (
                <>
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
                            negativePrompt={negativePrompt}
                            onNegativePromptChange={onNegativePromptChange || (() => {})}
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
                            smoothContinuations={smoothContinuations}
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

                    {/* Right Column: Motion Control (includes Camera Guidance when structure video exists) */}
                    <div className="lg:w-1/2 order-1 lg:order-2">
                        <div className="mb-4">
                            <SectionHeader title="Motion" theme="purple" />
                        </div>

                        {/* Camera Guidance - shown only when structure video is present */}
                        {structureVideoPath && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-muted-foreground mb-3">Camera Guidance:</h4>
                            <div className="space-y-4">
                              {/* Strength and End side by side (uni3c hardcoded) */}
                              <div className="grid grid-cols-2 gap-4">
                                {/* Strength slider */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-sm">Strength:</Label>
                                    <span className="text-sm font-medium">{structureVideoMotionStrength.toFixed(1)}x</span>
                                  </div>
                                  <Slider
                                    value={[structureVideoMotionStrength]}
                                    onValueChange={([value]) => handleStructureVideoMotionStrengthChange(value)}
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    className="w-full"
                                  />
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>0x</span>
                                    <span>1x</span>
                                    <span>2x</span>
                                  </div>
                                </div>

                                {/* Uni3C End Percent - shown only when uni3c is selected */}
                                {structureVideoType === 'uni3c' && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-sm">End:</Label>
                                      <span className="text-sm font-medium">{((structureVideoConfig.uni3c_end_percent || 0.1) * 100).toFixed(0)}%</span>
                                    </div>
                                    <Slider
                                      value={[structureVideoConfig.uni3c_end_percent || 0.1]}
                                      onValueChange={([value]) => handleUni3cEndPercentChange(value)}
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      className="w-full"
                                    />
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                      <span>0%</span>
                                      <span>50%</span>
                                      <span>100%</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Model Guidance - subheader only shown when Camera Guidance is also present */}
                        {structureVideoPath && (
                          <h4 className="text-sm font-medium text-muted-foreground mb-3">Model Guidance:</h4>
                        )}
                        <MotionControl
                            // motionMode is typed as 'basic' | 'advanced'. Older code used a 'presets' branch.
                            motionMode={motionMode || 'basic'}
                            onMotionModeChange={onMotionModeChange || (() => {})}
                            generationTypeMode={generationTypeMode}
                            onGenerationTypeModeChange={onGenerationTypeModeChange}
                            hasStructureVideo={!!structureVideoPath}
                            structureType={structureVideoType}
                            // Structure video controls
                            structureVideoMotionStrength={structureVideoMotionStrength}
                            onStructureVideoMotionStrengthChange={handleStructureVideoMotionStrengthChange}
                            onStructureTypeChange={handleStructureTypeChangeFromMotionControl}
                            uni3cEndPercent={structureVideoConfig.uni3c_end_percent}
                            onUni3cEndPercentChange={handleUni3cEndPercentChange}
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
                            smoothContinuations={smoothContinuations}
                            onSmoothContinuationsChange={onSmoothContinuationsChange}
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
                    videoCount={Math.max(0, simpleFilteredImages.length - 1)}
                    stitchEnabled={stitchAfterGenerate}
                    middleContent={
                      /* Only show stitch options when there are more than 2 images (multiple segments to stitch) */
                      simpleFilteredImages.length > 2 ? (
                        stitchAfterGenerate ? (
                          <Collapsible className="mb-6 w-full">
                            {/* Stitch toggle + settings trigger on same row */}
                            <div className="flex items-center justify-center gap-4">
                              <div className="flex items-center gap-2">
                                <Switch
                                  id="stitch-after-generate"
                                  checked={stitchAfterGenerate}
                                  onCheckedChange={(checked) => joinSettings.updateField('stitchAfterGenerate', checked)}
                                />
                                <Label
                                  htmlFor="stitch-after-generate"
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  Stitch generated clips
                                </Label>
                              </div>
                              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
                                <Settings className="w-4 h-4" />
                                <span>Settings</span>
                                <ChevronDown className="w-3 h-3 transition-transform group-data-[state=open]:rotate-180" />
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent className="mt-4 pt-4 border-t">
                                <JoinClipsSettingsForm
                                  gapFrames={joinGapFrames}
                                  setGapFrames={(val) => joinSettings.updateField('gapFrameCount', val)}
                                  contextFrames={joinContextFrames}
                                  setContextFrames={(val) => joinSettings.updateField('contextFrameCount', val)}
                                  replaceMode={joinReplaceMode}
                                  setReplaceMode={(val) => joinSettings.updateField('replaceMode', val)}
                                  keepBridgingImages={joinKeepBridgingImages}
                                  setKeepBridgingImages={(val) => joinSettings.updateField('keepBridgingImages', val)}
                                  prompt={joinPrompt}
                                  setPrompt={(val) => joinSettings.updateField('prompt', val)}
                                  negativePrompt={joinNegativePrompt}
                                  setNegativePrompt={(val) => joinSettings.updateField('negativePrompt', val)}
                                  enhancePrompt={joinEnhancePrompt}
                                  setEnhancePrompt={(val) => joinSettings.updateField('enhancePrompt', val)}
                                  availableLoras={availableLoras}
                                  projectId={projectId}
                                  loraPersistenceKey="join-clips-shot-editor-stitch"
                                  loraManager={joinLoraManager}
                                  onGenerate={() => {}} // No-op since generate is handled by main button
                                  isGenerating={false}
                                  generateSuccess={false}
                                  generateButtonText=""
                                  showGenerateButton={false}
                                  onRestoreDefaults={handleRestoreJoinDefaults}
                                  shortestClipFrames={joinValidationData.shortestClipFrames}
                                  motionMode={joinMotionMode}
                                  onMotionModeChange={(mode) => joinSettings.updateField('motionMode', mode)}
                                  phaseConfig={joinPhaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG}
                                  onPhaseConfigChange={(config) => joinSettings.updateField('phaseConfig', config)}
                                  randomSeed={joinRandomSeed}
                                  onRandomSeedChange={(val) => joinSettings.updateField('randomSeed', val)}
                                  selectedPhasePresetId={joinSelectedPhasePresetId ?? BUILTIN_JOIN_CLIPS_DEFAULT_ID}
                                  onPhasePresetSelect={(presetId, config) => {
                                    joinSettings.updateFields({
                                      selectedPhasePresetId: presetId,
                                      phaseConfig: config,
                                    });
                                  }}
                                  onPhasePresetRemove={() => {
                                    joinSettings.updateField('selectedPhasePresetId', null);
                                  }}
                                />
                              </CollapsibleContent>
                          </Collapsible>
                        ) : (
                          /* Just the toggle when stitch is disabled */
                          <div className="mb-6 flex items-center justify-center gap-2">
                            <Switch
                              id="stitch-after-generate"
                              checked={stitchAfterGenerate}
                              onCheckedChange={(checked) => joinSettings.updateField('stitchAfterGenerate', checked)}
                            />
                            <Label
                              htmlFor="stitch-after-generate"
                              className="text-sm font-normal cursor-pointer"
                            >
                              Stitch generated clips
                            </Label>
                          </div>
                        )
                      ) : undefined
                    }
                    bottomContent={
                      /* Only show swap button when there are more than 2 images and stitch is disabled */
                      simpleFilteredImages.length > 2 && !stitchAfterGenerate ? (
                        <button
                          ref={swapButtonRef}
                          onClick={() => toggleGenerateModePreserveScroll('join')}
                          className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                          <span>Swap to Join Segments</span>
                        </button>
                      ) : undefined
                    }
                  />
                </div>
                </>
              ) : (
                /* Join Segments Mode */
                <div ref={joinSegmentsSectionRef}>
                  <JoinClipsSettingsForm
                    gapFrames={joinGapFrames}
                    setGapFrames={(val) => joinSettings.updateField('gapFrameCount', val)}
                    contextFrames={joinContextFrames}
                    setContextFrames={(val) => joinSettings.updateField('contextFrameCount', val)}
                    replaceMode={joinReplaceMode}
                    setReplaceMode={(val) => joinSettings.updateField('replaceMode', val)}
                    keepBridgingImages={joinKeepBridgingImages}
                    setKeepBridgingImages={(val) => joinSettings.updateField('keepBridgingImages', val)}
                    prompt={joinPrompt}
                    setPrompt={(val) => joinSettings.updateField('prompt', val)}
                    negativePrompt={joinNegativePrompt}
                    setNegativePrompt={(val) => joinSettings.updateField('negativePrompt', val)}
                    enhancePrompt={joinEnhancePrompt}
                    setEnhancePrompt={(val) => joinSettings.updateField('enhancePrompt', val)}
                    availableLoras={availableLoras}
                    projectId={projectId}
                    loraPersistenceKey="join-clips-shot-editor"
                    loraManager={joinLoraManager}
                    onGenerate={handleJoinSegments}
                    isGenerating={isJoiningClips}
                    generateSuccess={joinClipsSuccess}
                    generateButtonText="Join Segments"
                    isGenerateDisabled={joinValidationData.videoCount < 2}
                    onRestoreDefaults={handleRestoreJoinDefaults}
                    shortestClipFrames={joinValidationData.shortestClipFrames}
                    // Motion preset settings
                    motionMode={joinMotionMode}
                    onMotionModeChange={(mode) => joinSettings.updateField('motionMode', mode)}
                    phaseConfig={joinPhaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG}
                    onPhaseConfigChange={(config) => joinSettings.updateField('phaseConfig', config)}
                    randomSeed={joinRandomSeed}
                    onRandomSeedChange={(val) => joinSettings.updateField('randomSeed', val)}
                    selectedPhasePresetId={joinSelectedPhasePresetId ?? BUILTIN_JOIN_CLIPS_DEFAULT_ID}
                    onPhasePresetSelect={(presetId, config) => {
                      joinSettings.updateFields({
                        selectedPhasePresetId: presetId,
                        phaseConfig: config,
                      });
                    }}
                    onPhasePresetRemove={() => {
                      joinSettings.updateField('selectedPhasePresetId', null);
                    }}
                  />

                  {/* Swap to Batch Generate */}
                  <button
                    ref={swapButtonRef}
                    onClick={() => toggleGenerateModePreserveScroll('batch')}
                    className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Swap to Batch Generate</span>
                  </button>
                </div>
              )}
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