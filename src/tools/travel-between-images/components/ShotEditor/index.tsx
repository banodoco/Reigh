import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
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
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useAllShotGenerations, useUnpositionedGenerationsCount } from '@/shared/hooks/useShotGenerations';
import usePersistentState from '@/shared/hooks/usePersistentState';
import { useShots } from '@/shared/contexts/ShotsContext';
import SettingsModal from '@/shared/components/SettingsModal';
import { useQueryClient } from '@tanstack/react-query';

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
import { createTravelBetweenImagesTask, type TravelBetweenImagesTaskParams } from '@/shared/lib/tasks/travelBetweenImages';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

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
  turboMode,
  onTurboModeChange,
  amountOfMotion,
  onAmountOfMotionChange,
  generationMode,
  onGenerationModeChange,
  // selectedMode and onModeChange removed - now hardcoded to use specific model
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
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();
  
  // Load complete shot data and images
  const { shots } = useShots(); // Get shots from context for shot metadata
  const selectedShot = shots?.find(shot => shot.id === selectedShotId);
  
  // Structure video persistence using separate tool settings (per-shot basis)
  const { 
    settings: structureVideoSettings, 
    update: updateStructureVideoSettings,
    isLoading: isStructureVideoSettingsLoading 
  } = useToolSettings<{
    path?: string;
    metadata?: VideoMetadata;
    treatment?: 'adjust' | 'clip';
    motionStrength?: number;
  }>('travel-structure-video', { 
    projectId, 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });

  // Structure video state
  const [structureVideoPath, setStructureVideoPath] = useState<string | null>(null);
  const [structureVideoMetadata, setStructureVideoMetadata] = useState<VideoMetadata | null>(null);
  const [structureVideoTreatment, setStructureVideoTreatment] = useState<'adjust' | 'clip'>('adjust');
  const [structureVideoMotionStrength, setStructureVideoMotionStrength] = useState<number>(1.0);
  const [hasInitializedStructureVideo, setHasInitializedStructureVideo] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (selectedShot?.id !== hasInitializedStructureVideo) {
      setHasInitializedStructureVideo(null);
    }
  }, [selectedShot?.id, hasInitializedStructureVideo]);

  // Load structure video from settings when shot loads
  useEffect(() => {
    if (!hasInitializedStructureVideo && !isStructureVideoSettingsLoading && selectedShot?.id) {
      if (structureVideoSettings?.path && structureVideoSettings?.metadata) {
        console.log('[ShotEditor] Loading structure video from settings:', structureVideoSettings);
        setStructureVideoPath(structureVideoSettings.path);
        setStructureVideoMetadata(structureVideoSettings.metadata);
        setStructureVideoTreatment(structureVideoSettings.treatment || 'adjust');
        setStructureVideoMotionStrength(structureVideoSettings.motionStrength ?? 1.0);
      } else {
        // No saved structure video - initialize with defaults
        setStructureVideoPath(null);
        setStructureVideoMetadata(null);
        setStructureVideoTreatment('adjust');
        setStructureVideoMotionStrength(1.0);
      }
      setHasInitializedStructureVideo(selectedShot.id);
    }
  }, [structureVideoSettings, isStructureVideoSettingsLoading, selectedShot?.id, hasInitializedStructureVideo]);

  // Handler for structure video changes with auto-save
  const handleStructureVideoChange = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number
  ) => {
    console.log('[ShotEditor] Structure video changed:', {
      videoPath: videoPath ? videoPath.substring(0, 50) + '...' : null,
      metadata,
      treatment,
      motionStrength
    });
    
    setStructureVideoPath(videoPath);
    if (metadata) {
      setStructureVideoMetadata(metadata);
    }
    setStructureVideoTreatment(treatment);
    setStructureVideoMotionStrength(motionStrength);

    // Save to database
    if (videoPath && metadata) {
      updateStructureVideoSettings('shot', {
        path: videoPath,
        metadata,
        treatment,
        motionStrength
      });
    } else {
      // Clear structure video
      updateStructureVideoSettings('shot', {});
    }
  }, [updateStructureVideoSettings]);

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
  // CRITICAL FIX: Always load detailed data in ShotEditor to ensure consistency with VideoTravelToolPage
  // This prevents video pair config mismatches when context data is limited (e.g., 5 images vs 10 total)
  const shouldLoadDetailedData = React.useMemo(() => 
    !!selectedShotId, // Always load full data in editor mode
    [selectedShotId]
  );
  
  // [VideoLoadSpeedIssue] CRITICAL: Completely disable hook when context data exists
  // Use a stable null value to prevent React Query from re-executing
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
  const { data: fullShotImages = [], isLoading: isLoadingFullImages } = useAllShotGenerations(queryKey);
  
  // CRITICAL FIX: Always use full images when available in editor mode to ensure consistency
  // This prevents video pair config mismatches between VideoTravelToolPage and ShotEditor
  const orderedShotImages = React.useMemo(() => 
    fullShotImages.length > 0 ? fullShotImages : contextImages,
    [fullShotImages, contextImages]
  );

  
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
  const { pairPrompts, shotGenerations } = useEnhancedShotPositions(selectedShotId);
  
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
  
  // Detect tablets (iPad, Android tablets, etc.) and track orientation for better column layout
  const [isTablet, setIsTablet] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const nav: any = navigator || {};
    const ua: string = nav.userAgent || '';
    const platform: string = nav.platform || '';
    const maxTouchPoints: number = nav.maxTouchPoints || 0;
    
    // iPad detection (including iPadOS 13+ that masquerades as Mac)
    const isIpadUA = /iPad/i.test(ua);
    const isIpadOsLike = platform === 'MacIntel' && maxTouchPoints > 1;
    
    // Android tablets and other tablets (similar to use-mobile.tsx logic)
    const isAndroidTablet = /Android(?!.*Mobile)/i.test(ua);
    const isOtherTablet = /Tablet|Silk|Kindle|PlayBook/i.test(ua);
    
    // Width-based tablet detection (devices between phone and desktop)
    const screenWidth = window.innerWidth;
    const isTabletWidth = screenWidth >= 768 && screenWidth <= 1024;
    
    // Coarse pointer usually indicates touch devices (phones/tablets)
    const hasCoarsePointer = (() => {
      try {
        return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      } catch {
        return false;
      }
    })();
    
    return Boolean(
      isIpadUA || isIpadOsLike || isAndroidTablet || isOtherTablet || 
      (isTabletWidth && hasCoarsePointer && maxTouchPoints > 0)
    );
  });
  
  const [orientation, setOrientation] = React.useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    try {
      return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
    } catch {
      return 'portrait';
    }
  });
  
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(orientation: portrait)');
    const handleOrientation = () => setOrientation(mq.matches ? 'portrait' : 'landscape');
    const handleResize = () => {
      const nav: any = navigator || {};
      const ua: string = nav.userAgent || '';
      const platform: string = nav.platform || '';
      const maxTouchPoints: number = nav.maxTouchPoints || 0;
      
      // Re-detect tablet on resize (handles rotation, window resizing)
      const isIpadUA = /iPad/i.test(ua);
      const isIpadOsLike = platform === 'MacIntel' && maxTouchPoints > 1;
      const isAndroidTablet = /Android(?!.*Mobile)/i.test(ua);
      const isOtherTablet = /Tablet|Silk|Kindle|PlayBook/i.test(ua);
      const screenWidth = window.innerWidth;
      const isTabletWidth = screenWidth >= 768 && screenWidth <= 1024;
      const hasCoarsePointer = (() => {
        try {
          return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        } catch {
          return false;
        }
      })();
      
      setIsTablet(Boolean(
        isIpadUA || isIpadOsLike || isAndroidTablet || isOtherTablet || 
        (isTabletWidth && hasCoarsePointer && maxTouchPoints > 0)
      ));
    };
    try { mq.addEventListener('change', handleOrientation); } catch { /* no-op */ }
    window.addEventListener('resize', handleResize);
    return () => {
      try { mq.removeEventListener('change', handleOrientation); } catch { /* no-op */ }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const mobileColumns = React.useMemo(() => {
    if (!isMobile) return 6 as 6;
    if (isTablet) return (orientation === 'portrait' ? 3 : 4) as 3 | 4;
    return 2 as 2;
  }, [isMobile, isTablet, orientation]);
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

  // Timeline warmup: Use optimistic local state for initial render to prevent order jumping
  const timelineReadyImages = React.useMemo(() => {
    if (state.localOrderedShotImages.length > 0) {
      const optimizedImages = state.localOrderedShotImages
        .filter(img => img.timeline_frame !== undefined && img.timeline_frame !== null);
      if (optimizedImages.length === state.localOrderedShotImages.length) {
        console.log('[TimelineWarmup] Using cached localOrderedShotImages for initial render', {
          shotId: selectedShotId,
          count: optimizedImages.length
        });
        return optimizedImages;
      }
      const fallback = orderedShotImages.map(serverImg => {
        const localMatch = state.localOrderedShotImages.find(img => img.id === serverImg.id);
        return localMatch ? { ...localMatch, timeline_frame: serverImg.timeline_frame } : serverImg;
      });
      console.log('[TimelineWarmup] Merging local and server images for initial render', {
        shotId: selectedShotId,
        count: fallback.length
      });
      return fallback;
    }
    return orderedShotImages;
  }, [state.localOrderedShotImages, orderedShotImages, selectedShotId]);

  // Sticky header visibility similar to ImageGenerationToolPage
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const savedOnApproachRef = useRef(false);

  useEffect(() => {
    const containerEl = headerContainerRef.current;
    if (!containerEl) return;

    const stickyThresholdY = { current: 0 } as { current: number };
    const isStickyRef = { current: isSticky } as { current: boolean };
    let rafId = 0 as number | 0;

    const computeThreshold = () => {
      const rect = containerEl.getBoundingClientRect();
      const docTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      const containerDocTop = rect.top + docTop;
      
      // More aggressive threshold - trigger as soon as the shot name starts to go out of view
      // Use the actual header height from the global header plus minimal buffer
      const globalHeaderHeight = isMobile ? 60 : 96; // Actual global header heights
      const buffer = isMobile ? 5 : 10; // Small buffer to ensure smooth transition
      
      // Trigger when the shot name would be at the global header position
      stickyThresholdY.current = containerDocTop - globalHeaderHeight - buffer;
    };

    const checkSticky = () => {
      rafId = 0 as number | 0;
      const currentScroll = (window.pageYOffset || document.documentElement.scrollTop || 0);
      const preTriggerOffset = isMobile ? 16 : 24; // Save/close just before sticky shows
      const shouldBeSticky = currentScroll > stickyThresholdY.current;

      // Save/close slightly before sticky activates to avoid visual jump
      if (state.isEditingName && !savedOnApproachRef.current && currentScroll > (stickyThresholdY.current - preTriggerOffset)) {
        if (onUpdateShotName && state.editingName.trim() && state.editingName.trim() !== selectedShot?.name) {
          onUpdateShotName(state.editingName.trim());
        }
        actions.setEditingName(false);
        actions.setEditingNameValue(selectedShot?.name || '');
        savedOnApproachRef.current = true;
      }

      if (shouldBeSticky !== isStickyRef.current) {
        isStickyRef.current = shouldBeSticky;
        setIsSticky(shouldBeSticky);
        
        // Failsafe: if we somehow missed the pre-trigger, save/close when sticky activates
        if (shouldBeSticky && state.isEditingName && !savedOnApproachRef.current) {
          if (onUpdateShotName && state.editingName.trim() && state.editingName.trim() !== selectedShot?.name) {
            onUpdateShotName(state.editingName.trim());
          }
          actions.setEditingName(false);
          actions.setEditingNameValue(selectedShot?.name || '');
          savedOnApproachRef.current = true;
        }
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(checkSticky) as unknown as number;
    };

    const onResize = () => {
      computeThreshold();
      if (rafId) cancelAnimationFrame(rafId as unknown as number);
      rafId = requestAnimationFrame(checkSticky) as unknown as number;
    };

    computeThreshold();
    checkSticky();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const ro = new ResizeObserver(() => onResize());
    ro.observe(containerEl);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId) cancelAnimationFrame(rafId as unknown as number);
      ro.disconnect();
    };
  }, [isMobile, isSticky, state.isEditingName, state.editingName, onUpdateShotName, selectedShot?.name, actions]);

  // Reset the pre-trigger guard whenever user enters edit mode
  useEffect(() => {
    if (state.isEditingName) {
      savedOnApproachRef.current = false;
    }
  }, [state.isEditingName]);

  const handleStickyNameClick = useCallback(() => {
    const containerEl = headerContainerRef.current;
    if (!containerEl) {
      actions.setEditingName(true);
      return;
    }
    try {
      const rect = containerEl.getBoundingClientRect();
      const headerHeight = isMobile ? 60 : 96; // Match the global header heights
      const bufferSpace = 30;
      const targetScrollTop = (window.scrollY || window.pageYOffset || 0) + rect.top - headerHeight - bufferSpace;
      window.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });

      let scrollTimeout: number;
      let lastScrollTop = window.scrollY;
      let scrollStableCount = 0;
      const checkScrollComplete = () => {
        const currentScrollTop = window.scrollY;
        const targetReached = Math.abs(currentScrollTop - Math.max(0, targetScrollTop)) < 5;
        if (targetReached || currentScrollTop === lastScrollTop) {
          scrollStableCount++;
          if (scrollStableCount >= 3 || targetReached) {
            actions.setEditingName(true);
            if (scrollTimeout) window.clearTimeout(scrollTimeout);
            return;
          }
        } else {
          scrollStableCount = 0;
        }
        lastScrollTop = currentScrollTop;
        scrollTimeout = window.setTimeout(checkScrollComplete, 50);
      };
      window.setTimeout(checkScrollComplete, 100);
      window.setTimeout(() => actions.setEditingName(true), 1500);
    } catch {
      actions.setEditingName(true);
    }
  }, [actions, isMobile]);

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

  // Keep local optimistic list in sync with server-provided images
  // unless we're explicitly skipping due to an optimistic mutation
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    actions.setLocalOrderedShotImages(orderedShotImages);
  }, [orderedShotImages, actions]);

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

    // Handle generation mode setup and readiness - AGGRESSIVE OPTIMIZATION for faster ready state
  const readinessState = React.useMemo(() => ({
    hasImageData: contextImages.length > 0,
    criticalSettingsReady: !settingsLoading, // Only wait for main settings, not UI/LoRA
    modeCorrect: !isMobile || generationMode === 'batch',
    hasError: !!state.settingsError,
    shotId: selectedShot?.id,
    isReady: state.isModeReady
  }), [contextImages.length, settingsLoading, isMobile, generationMode, state.settingsError, selectedShot?.id, state.isModeReady]);

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
    const targetModel = turboMode ? 'vace_14B_fake_cocktail_2_2' : 'lightning_baseline_2_2_2';
    if (steerableMotionSettings.model_name !== targetModel) {
      console.log(`[ShotEditor] Setting model based on turbo mode: ${targetModel} (turbo: ${turboMode})`);
      onSteerableMotionSettingsChange({ 
        model_name: targetModel,
        apply_causvid: false
      });
    }
  }, [turboMode, steerableMotionSettings.model_name, onSteerableMotionSettingsChange]);

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
  
  // [VideoLoadSpeedIssue] OPTIMIZED: Only log significant data flow changes
  const dataFlowKey = `${selectedShotId}-${orderedShotImages.length}-${localOrderedShotImages.length}`;
  const lastDataFlowKeyRef = React.useRef('');
  const lastProcessingKeyRef = React.useRef('');
  const lastFilteringKeyRef = React.useRef('');
  
  React.useEffect(() => {
    if (dataFlowKey !== lastDataFlowKeyRef.current) {
      console.log('[VideoLoadSpeedIssue] ShotEditor data flow change:', {
        selectedShotId,
        orderedShotImagesCount: orderedShotImages.length,
        localOrderedShotImagesCount: localOrderedShotImages.length,
        timestamp: Date.now()
      });
      lastDataFlowKeyRef.current = dataFlowKey;
    }
  }, [dataFlowKey, selectedShotId, orderedShotImages.length, localOrderedShotImages.length]);
  
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
  
  // Count unpositioned generations for this shot (excluding videos, which are expected to have null positions)
  const { data: unpositionedGenerationsCount = 0 } = useUnpositionedGenerationsCount(selectedShot?.id);
  
  // Auto-set context frames to 8 when hidden (<=2 images)
  useEffect(() => {
    if (simpleFilteredImages.length <= 2 && batchVideoContext !== 8) {
      onBatchVideoContextChange(8);
    }
  }, [simpleFilteredImages.length, batchVideoContext, onBatchVideoContextChange]);

  // Auto-disable turbo mode when there are more than 2 images
  useEffect(() => {
    if (simpleFilteredImages.length > 2 && turboMode) {
      console.log(`[ShotEditor] Auto-disabling turbo mode - too many images (${simpleFilteredImages.length} > 2)`);
      onTurboModeChange(false);
    }
  }, [simpleFilteredImages.length, turboMode, onTurboModeChange]);

  // All modes are always available - no restrictions based on image count

  // Get model based on turbo mode
  const getModelName = () => {
    return turboMode ? 'vace_14B_fake_cocktail_2_2' : 'lightning_baseline_2_2_2';
  };

  // Mode synchronization removed - now hardcoded to use specific model
  
  const videoOutputs = useMemo(() => {
    return getVideoOutputs(orderedShotImages);
  }, [orderedShotImages]);

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
        // Apply model directly to settings
        onSteerableMotionSettingsChange({ 
          model_name: newModel,
          apply_causvid: false
        });
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
          const deletions = simpleFilteredImages
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
    simpleFilteredImages,
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
        onSteerableMotionSettingsChange({ 
          model_name: newModel,
          apply_causvid: false
        });
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

  // Local state for steerable motion task creation
  const [isSteerableMotionEnqueuing, setIsSteerableMotionEnqueuing] = useState(false);
  const [steerableMotionJustQueued, setSteerableMotionJustQueued] = useState(false);

  // Note: Pair prompts are now managed through the database via ShotImagesEditor
  // The generation logic will need to be updated to fetch pair prompts from the database

  // Check if generation should be disabled due to missing OpenAI API key for enhance prompt
  const openaiApiKey = getApiKey('openai_api_key');
  const isGenerationDisabledDueToApiKey = enhancePrompt && (!openaiApiKey || openaiApiKey.trim() === '');
  const isGenerationDisabled = isSteerableMotionEnqueuing || isGenerationDisabledDueToApiKey;

  // Handle video generation
  const handleGenerateBatch = useCallback(async () => {
    if (!projectId) {
      toast.error('No project selected. Please select a project first.');
      return;
    }

    // CRITICAL: Refresh shot data from database before task submission to ensure we have the latest images
    console.log('[TaskSubmission] Refreshing shot data before video generation...');
    try {
      // Invalidate and wait for fresh data
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      await queryClient.refetchQueries({ queryKey: ['shots', projectId] });
      
      // Also refresh the shot-specific data if we have the hook available
      if (onShotImagesUpdate) {
        onShotImagesUpdate();
      }
      
      console.log('[TaskSubmission] Shot data refreshed successfully');
      
      // Small delay to ensure state propagation completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('[TaskSubmission] Failed to refresh shot data:', error);
      toast.error('Failed to refresh image data. Please try again.');
      return;
    }

    let resolution: string | undefined = undefined;

    if ((dimensionSource || 'project') === 'firstImage' && simpleFilteredImages.length > 0) {
      try {
        const firstImage = simpleFilteredImages[0];
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
    // IMPORTANT: Use simpleFilteredImages to exclude generated video outputs
    const absoluteImageUrls = simpleFilteredImages
      .map((img) => getDisplayUrl(img.imageUrl)) // Use getDisplayUrl here
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

    let basePrompts: string[];
    let segmentFrames: number[];
    let frameOverlap: number[];
    let negativePrompts: string[];

    if (generationMode === 'timeline') {
      // Timeline positions are now managed by useEnhancedShotPositions
      // Frame gaps will be extracted from the database-driven positions
      const sortedPositions: Array<{id: string, pos: number}> = [];
      
      const frameGaps = [];
      for (let i = 0; i < sortedPositions.length - 1; i++) {
        const gap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
        frameGaps.push(gap);
      }
      
      // Fetch pair prompts from database for timeline generation
      let pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
      
      try {
        const { data: shotGenerationsData, error } = await supabase
          .from('shot_generations')
          .select('id, generation_id, timeline_frame, metadata')
          .eq('shot_id', selectedShotId)
          .order('timeline_frame', { ascending: true });

        if (error) {
          console.error('[Generation] Error fetching pair prompts:', error);
        } else if (shotGenerationsData) {
          // Extract pair prompts from metadata
          for (let i = 0; i < shotGenerationsData.length - 1; i++) {
            const firstItem = shotGenerationsData[i];
            const metadata = firstItem.metadata as any;
            if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
              pairPrompts[i] = {
                prompt: metadata.pair_prompt || '',
                negativePrompt: metadata.pair_negative_prompt || '',
              };
            }
          }
        }
      } catch (err) {
        console.error('[Generation] Error fetching pair prompts:', err);
      }

      basePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
        // Use pair-specific prompt if available, otherwise fall back to default
        const pairPrompt = pairPrompts[index]?.prompt;
        const finalPrompt = (pairPrompt && pairPrompt.trim()) ? pairPrompt.trim() : batchVideoPrompt;
        console.log(`[Generation] Pair ${index}: Using ${pairPrompt ? 'custom' : 'default'} prompt:`, finalPrompt);
        return finalPrompt;
      }) : [batchVideoPrompt];
      segmentFrames = frameGaps.length > 0 ? frameGaps : [batchVideoFrames];
      frameOverlap = frameGaps.length > 0 ? frameGaps.map(() => batchVideoContext) : [batchVideoContext];
      negativePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
        // Use pair-specific negative prompt if available, otherwise fall back to default
        const pairNegativePrompt = pairPrompts[index]?.negativePrompt;
        const finalNegativePrompt = (pairNegativePrompt && pairNegativePrompt.trim()) ? pairNegativePrompt.trim() : steerableMotionSettings.negative_prompt;
        console.log(`[Generation] Pair ${index}: Using ${pairNegativePrompt ? 'custom' : 'default'} negative prompt:`, finalNegativePrompt);
        return finalNegativePrompt;
      }) : [steerableMotionSettings.negative_prompt];

      console.log(`[Generation] Timeline mode - Final prompts:`, { basePrompts, negativePrompts, pairPrompts });
    } else {
      // batch mode
      basePrompts = [batchVideoPrompt];
      segmentFrames = [batchVideoFrames];
      frameOverlap = [batchVideoContext];
      negativePrompts = [steerableMotionSettings.negative_prompt];
    }

    // Use model based on turbo mode for task creation
    const actualModelName = getModelName();
    
    const requestBody: any = {
      project_id: projectId,
      shot_id: selectedShot.id,
      image_urls: absoluteImageUrls,
      base_prompts: basePrompts,
      segment_frames: segmentFrames,
      frame_overlap: frameOverlap,
      negative_prompts: negativePrompts,
      model_name: actualModelName,
      seed: steerableMotionSettings.seed,
      steps: batchVideoSteps,
      debug: steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
      // Force these settings to consistent defaults, except use_lighti2x_lora which follows accelerated mode (unless Wan 2.2)
      apply_reward_lora: DEFAULT_STEERABLE_MOTION_SETTINGS.apply_reward_lora,
      apply_causvid: steerableMotionSettings.apply_causvid,
      use_lighti2x_lora: accelerated,
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
      turbo_mode: turboMode,
      // Convert UI amount of motion (0-100) to task value (0.0-1.0)
      amount_of_motion: amountOfMotion / 100.0,
      // selected_mode removed - now hardcoded to use specific model
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

    // Add structure video params if available
    if (structureVideoPath) {
      console.log('[Generation] Adding structure video to task:', {
        videoPath: structureVideoPath,
        treatment: structureVideoTreatment,
        motionStrength: structureVideoMotionStrength
      });
      requestBody.structure_video_path = structureVideoPath;
      requestBody.structure_video_treatment = structureVideoTreatment;
      requestBody.structure_video_motion_strength = structureVideoMotionStrength;
    }
    
    setIsSteerableMotionEnqueuing(true);
    setSteerableMotionJustQueued(false);
    
    try {
      // Use the new client-side travel between images task creation instead of calling the edge function
      await createTravelBetweenImagesTask(requestBody as TravelBetweenImagesTaskParams);
      
      // Show success feedback and update state
      setSteerableMotionJustQueued(true);
      
      // Reset success state after 2 seconds
      setTimeout(() => setSteerableMotionJustQueued(false), 2000);
      
    } catch (error) {
      console.error('Error creating video generation task:', error);
      toast.error(`Failed to create video generation task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSteerableMotionEnqueuing(false);
    }
  }, [
    projectId,
    dimensionSource,
    simpleFilteredImages,
    customWidth,
    customHeight,
    generationMode,
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
    turboMode,
    amountOfMotion,
    // selectedMode removed - now hardcoded to use specific model
    loraManager.selectedLoras,
    queryClient,
    onShotImagesUpdate
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
      <div ref={headerContainerRef}>
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
      </div>

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
          projectAspectRatio={projects.find(p => p.id === projectId)?.aspectRatio}
          localZeroHint={videoOutputs.length === 0}
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
            selectedShotId={selectedShot.id}
            projectId={projectId}
            shotName={selectedShot.name}
            batchVideoFrames={batchVideoFrames}
            batchVideoContext={batchVideoContext}
            onImageReorder={handleReorderImagesInShot}
            onImageSaved={async () => {}} // TODO: implement
            onContextFramesChange={onBatchVideoContextChange}
            onFramePositionsChange={undefined}
            onImageDrop={generationActions.handleTimelineImageDrop}
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
                projectAspectRatio={projects.find(p => p.id === projectId)?.aspectRatio}
              />
            }
            unpositionedGenerationsCount={unpositionedGenerationsCount}
            onOpenUnpositionedPane={openUnpositionedGenerationsPane}
            fileInputKey={state.fileInputKey}
            onImageUpload={generationActions.handleImageUploadToShot}
            isUploadingImage={state.isUploadingImage}
            duplicatingImageId={state.duplicatingImageId}
            duplicateSuccessImageId={state.duplicateSuccessImageId}
            projectAspectRatio={projects.find(p => p.id === projectId)?.aspectRatio}
            defaultPrompt={batchVideoPrompt}
            onDefaultPromptChange={onBatchVideoPromptChange}
            defaultNegativePrompt={steerableMotionSettings.negative_prompt || ""}
            onDefaultNegativePromptChange={(value) => onSteerableMotionSettingsChange({ negative_prompt: value })}
            // Structure video props
            structureVideoPath={structureVideoPath}
            structureVideoMetadata={structureVideoMetadata}
            structureVideoTreatment={structureVideoTreatment}
            structureVideoMotionStrength={structureVideoMotionStrength}
            onStructureVideoChange={handleStructureVideoChange}
          />
        </div>

        {/* Generation Settings */}
        <div className="w-full">
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
                            turboMode={turboMode}
                            onTurboModeChange={onTurboModeChange}
                            amountOfMotion={amountOfMotion}
                            onAmountOfMotionChange={onAmountOfMotionChange}
                            imageCount={simpleFilteredImages.length}
                        />
                        
                        
                        {/* LoRA Settings (Mobile) */}
                        <div className="block lg:hidden">
                            <div className="mb-4">
                                <SectionHeader title="LoRAs" theme="purple" />
                            </div>
                            <div className="space-y-4">
                                
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

                    {/* Right Column: Model & LoRA Settings (Desktop) */}
                    <div className="hidden lg:block lg:w-1/2 order-1 lg:order-2">
                        
                        {/* LoRA Settings */}
                        <div className="mb-4">
                            <SectionHeader title="LoRAs" theme="purple" />
                        </div>
                        <div className="space-y-4">
                            
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

                {/* Full-width divider and generate button */}
                <div className="mt-6 pt-6 border-t">
                  <div className="flex flex-col items-center">
                    <Button 
                      size="lg" 
                      className="w-full max-w-md" 
                      variant={steerableMotionJustQueued ? "success" : "default"}
                      onClick={handleGenerateBatch}
                      disabled={isGenerationDisabled}
                    >
                      {steerableMotionJustQueued
                        ? "Added to queue!"
                        : isSteerableMotionEnqueuing 
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
                    {!batchVideoPrompt.trim() && !allPairsHavePrompts && (
                      <p className="text-xs text-center text-red-600 mt-2">
                        Having a prompt is very important for directing the video
                      </p>
                    )}
                  </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Sticky shot header - appears when original header is out of view */}
      {(!state.isEditingName) && isSticky && (() => {
        // Position right below the global header with minimal gap
        const globalHeaderHeight = isMobile ? 60 : 96; // Match actual global header heights
        const gap = isMobile ? 4 : 8; // Small positive gap on both mobile and desktop
        const topPosition = globalHeaderHeight + gap;
        
        // Calculate horizontal constraints based on locked panes
        const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
        const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
        
        return (
          <div
            className={`fixed z-50 flex justify-center transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-2 pointer-events-none`}
            style={{
              top: `${topPosition}px`,
              left: `${leftOffset}px`,
              right: `${rightOffset}px`,
              paddingLeft: '16px',
              paddingRight: '16px',
              willChange: 'transform, opacity',
              transform: 'translateZ(0)'
            }}
          >
            {/* Center-aligned compact design with slightly transparent background */}
            <div className={`relative overflow-hidden flex items-center justify-center space-x-2 ${isMobile ? 'p-3' : 'p-3'} bg-background/80 backdrop-blur-md shadow-xl transition-all duration-500 ease-out rounded-lg border border-border`}>
              {/* Subtle grain overlay to match GlobalHeader vibe */}
              <div className="pointer-events-none absolute inset-0 bg-film-grain opacity-10 animate-film-grain"></div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onPreviousShotNoScroll) onPreviousShotNoScroll();
                }}
                disabled={!hasPrevious || state.isTransitioningFromNameEdit}
                className="flex-shrink-0 pointer-events-auto"
                title="Previous shot"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span
                className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-primary truncate px-2 ${isMobile ? 'w-[135px]' : 'w-[200px]'} text-center ${onUpdateShotName ? 'cursor-pointer hover:underline transition-all duration-200' : ''} pointer-events-auto`}
                onClick={handleStickyNameClick}
                title={onUpdateShotName ? "Click to edit shot name" : selectedShot?.name || 'Untitled Shot'}
              >
                {selectedShot?.name || 'Untitled Shot'}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onNextShotNoScroll) onNextShotNoScroll();
                }}
                disabled={!hasNext || state.isTransitioningFromNameEdit}
                className="flex-shrink-0 pointer-events-auto"
                title="Next shot"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })()}

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