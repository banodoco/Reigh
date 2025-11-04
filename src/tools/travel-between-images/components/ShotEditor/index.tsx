import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Info, ChevronLeft, ChevronRight, Sparkles, ArrowUp } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useProject } from "@/shared/contexts/ProjectContext";
import { toast } from "sonner";
import { useUpdateShotImageOrder, useCreateShot, useAddImageToShotWithoutPosition } from "@/shared/hooks/useShots";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
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
import { useAllShotGenerations, useUnpositionedGenerationsCount } from '@/shared/hooks/useShotGenerations';
import usePersistentState from '@/shared/hooks/usePersistentState';
import { useShots } from '@/shared/contexts/ShotsContext';
import SettingsModal from '@/shared/components/SettingsModal';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AnimatePresence, motion } from 'framer-motion';

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
import { useUpdateGenerationLocation } from '@/shared/hooks/useGenerations';
import { createTravelBetweenImagesTask, type TravelBetweenImagesTaskParams } from '@/shared/lib/tasks/travelBetweenImages';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import { resolveImageUrl } from '@/shared/lib/imageUrlResolver';
import { AdvancedMotionSettings } from './AdvancedMotionSettings';
import { CommonGenerationSettings } from './CommonGenerationSettings';
import { TimelineGenerationSettings } from './TimelineGenerationSettings';
import { BatchGenerationSettings } from './BatchGenerationSettings';
import * as ApplySettingsService from './services/applySettingsService';

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
  motionMode = 'basic',
  onMotionModeChange,
  advancedMode,
  onAdvancedModeChange,
  regenerateAnchors,
  onRegenerateAnchorsChange,
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
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  
  // Load complete shot data and images
  const { shots } = useShots(); // Get shots from context for shot metadata
  const selectedShot = shots?.find(shot => shot.id === selectedShotId);
  
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
    structureType?: 'flow' | 'canny' | 'depth';
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
  const [structureVideoType, setStructureVideoType] = useState<'flow' | 'canny' | 'depth'>('flow');
  const [hasInitializedStructureVideo, setHasInitializedStructureVideo] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (selectedShot?.id !== hasInitializedStructureVideo) {
      setHasInitializedStructureVideo(null);
    }
  }, [selectedShot?.id, hasInitializedStructureVideo]);

  // Load structure video from settings when shot loads
  useEffect(() => {
    // USE console.error so this shows in production
    console.error('[ShotEditor] 🎬 STRUCTURE VIDEO INIT CHECK:', {
      hasInitializedStructureVideo,
      isStructureVideoSettingsLoading,
      selectedShotId: selectedShot?.id?.substring(0, 8),
      hasStructureVideoSettings: !!structureVideoSettings,
      settingsPath: structureVideoSettings?.path || 'NO PATH',
      willInitialize: !hasInitializedStructureVideo && !isStructureVideoSettingsLoading && !!selectedShot?.id
    });
    
    if (!hasInitializedStructureVideo && !isStructureVideoSettingsLoading && selectedShot?.id) {
      // Only check for path - metadata is optional and can be null
      if (structureVideoSettings?.path) {
        console.error('[ShotEditor] ✅ Loading structure video from settings:', {
          path: structureVideoSettings.path,
          pathPreview: structureVideoSettings.path.substring(0, 80) + '...',
          hasMetadata: !!structureVideoSettings.metadata,
          treatment: structureVideoSettings.treatment,
          motionStrength: structureVideoSettings.motionStrength,
          structureType: structureVideoSettings.structureType
        });
        setStructureVideoPath(structureVideoSettings.path);
        setStructureVideoMetadata(structureVideoSettings.metadata || null);
        setStructureVideoTreatment(structureVideoSettings.treatment || 'adjust');
        setStructureVideoMotionStrength(structureVideoSettings.motionStrength ?? 1.0);
        setStructureVideoType(structureVideoSettings.structureType || 'flow');
      } else {
        // No saved structure video - initialize with defaults
        console.error('[ShotEditor] ⚠️  No structure video in settings, initializing to defaults:', {
          settingsRaw: structureVideoSettings,
          hasSettingsObject: !!structureVideoSettings,
          settingsKeys: structureVideoSettings ? Object.keys(structureVideoSettings) : []
        });
        setStructureVideoPath(null);
        setStructureVideoMetadata(null);
        setStructureVideoTreatment('adjust');
        setStructureVideoMotionStrength(1.0);
        setStructureVideoType('flow');
      }
      setHasInitializedStructureVideo(selectedShot.id);
    }
  }, [structureVideoSettings, isStructureVideoSettingsLoading, selectedShot?.id, hasInitializedStructureVideo]);

  // Handler for structure video changes with auto-save
  const handleStructureVideoChange = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => {
    console.log('[ShotEditor] [DEBUG] handleStructureVideoChange called:', {
      videoPath: videoPath ? videoPath.substring(0, 50) + '...' : null,
      hasMetadata: !!metadata,
      metadataDetails: metadata ? { totalFrames: metadata.total_frames, frameRate: metadata.frame_rate } : null,
      treatment,
      motionStrength,
      structureType,
      previousStructureType: structureVideoType // Show what it was before
    });
    
    setStructureVideoPath(videoPath);
    setStructureVideoMetadata(metadata); // Always update, even if null (important for clearing old metadata)
    setStructureVideoTreatment(treatment);
    setStructureVideoMotionStrength(motionStrength);
    setStructureVideoType(structureType);
    
    console.log('[ShotEditor] [DEBUG] State setters called, new structureType should be:', structureType);

    // Save to database
    if (videoPath) {
      // Save structure video (metadata is optional - can be fetched later from path)
      console.error('[ShotEditor] 💾 SAVING structure video to database:', { 
        path: videoPath,
        pathPreview: videoPath.substring(0, 80) + '...',
        hasMetadata: !!metadata,
        treatment,
        motionStrength,
        structureType,
        toolId: 'travel-structure-video',
        scope: 'shot',
        selectedShotId: selectedShot?.id?.substring(0, 8)
      });
      updateStructureVideoSettings('shot', {
        path: videoPath,
        metadata: metadata || null,
        treatment,
        motionStrength,
        structureType
      });
      console.error('[ShotEditor] ✅ Structure video save requested');
    } else {
      // Clear structure video - explicitly set fields to null to ensure deletion
      console.error('[ShotEditor] 🗑️  CLEARING structure video from database');
      updateStructureVideoSettings('shot', {
        path: null,
        metadata: null,
        treatment: null,
        motionStrength: null,
        structureType: null
      });
      console.error('[ShotEditor] ✅ Structure video clear requested');
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
  const { pairPrompts, shotGenerations, clearAllEnhancedPrompts, updatePairPromptsByIndex, loadPositions } = useEnhancedShotPositions(selectedShotId);
  
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
  
  // For UI purposes, treat tablets like desktop (show timeline toggle, etc.)
  // Only hide advanced UI on actual phones
  const isPhone = isMobile && !isTablet;
  
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
  
  // Floating CTA state and refs
  const ctaContainerRef = useRef<HTMLDivElement>(null);
  const videoGalleryRef = useRef<HTMLDivElement>(null);
  const [isCtaFloating, setIsCtaFloating] = useState(false);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
  const [showCtaElement, setShowCtaElement] = useState(true); // Start as true to show on initial load
  const ctaHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true); // Track if this is the first render
  const [refsReady, setRefsReady] = useState(0); // Increment to trigger effect re-run when refs are ready

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

      // Do not auto-save/close while actively editing; user controls save/cancel
      if (!state.isEditingName && !savedOnApproachRef.current && currentScroll > (stickyThresholdY.current - preTriggerOffset)) {
        // no-op: previously auto-saved here; now disabled during edit to prevent blur
      }

      if (shouldBeSticky !== isStickyRef.current) {
        isStickyRef.current = shouldBeSticky;
        setIsSticky(shouldBeSticky);
        // Do not force-close when sticky toggles while editing
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
    // Avoid immediate sticky check while editing to prevent instant blur
    if (!state.isEditingName) {
      checkSticky();
    }

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
  
  // Manage CTA element visibility with animation delay
  useEffect(() => {
    // After first render, mark that initial mount is complete
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
    }
    
    if (isCtaFloating) {
      // Clear any pending hide timer
      if (ctaHideTimerRef.current) {
        clearTimeout(ctaHideTimerRef.current);
        ctaHideTimerRef.current = null;
      }
      // Show immediately when it should float
      setShowCtaElement(true);
    } else if (showCtaElement && !isInitialMountRef.current) {
      // When it should hide, wait for animation to complete before removing from DOM
      // Skip this on initial mount to avoid unwanted animation
      // Clear any existing timer first
      if (ctaHideTimerRef.current) {
        clearTimeout(ctaHideTimerRef.current);
      }
      ctaHideTimerRef.current = setTimeout(() => {
        setShowCtaElement(false);
        ctaHideTimerRef.current = null;
      }, 300); // Match animation duration
    }
    
    return () => {
      if (ctaHideTimerRef.current) {
        clearTimeout(ctaHideTimerRef.current);
      }
    };
  }, [isCtaFloating, showCtaElement]);

  // Check when refs become available and trigger IntersectionObserver setup
  // useLayoutEffect runs synchronously after DOM mutations, ensuring refs are populated
  useEffect(() => {
    // Check refs are ready and notify
    const checkRefs = () => {
      if (videoGalleryRef.current && ctaContainerRef.current && refsReady === 0) {
        console.log('[ShotEditor] Refs are now ready, triggering observer setup');
        setRefsReady(1);
      }
    };
    
    // Check immediately
    checkRefs();
    
    // Also check after a short delay in case of async rendering
    const timer = setTimeout(checkRefs, 100);
    
    return () => clearTimeout(timer);
  }, []); // Run once on mount

  // Floating CTA: Track when user scrolls past video gallery and before reaching original CTA
  useEffect(() => {
    const galleryEl = videoGalleryRef.current;
    const ctaEl = ctaContainerRef.current;
    if (!galleryEl || !ctaEl) {
      console.log('[ShotEditor] Refs not ready yet, waiting...', { galleryEl: !!galleryEl, ctaEl: !!ctaEl });
      return;
    }
    
    console.log('[ShotEditor] Setting up IntersectionObservers for floating CTA');
    
    let hasScrolledPastGallery = false;
    let isOriginalCtaVisible = false;
    
    const updateFloatingState = () => {
      // Show floating CTA only when: scrolled past gallery AND original CTA is not visible AND no active selection
      const shouldFloat = hasScrolledPastGallery && !isOriginalCtaVisible && !hasActiveSelection;
      setIsCtaFloating(shouldFloat);
    };
    
    // Mobile needs smaller margins due to smaller viewport
    const galleryMargin = isMobile ? '-100px 0px 0px 0px' : '-300px 0px 0px 0px';
    const ctaMargin = isMobile ? '0px 0px -100px 0px' : '0px 0px -150px 0px';
    
    // Track video gallery - show floating CTA when it's scrolled out of view (top is above viewport)
    const galleryObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          hasScrolledPastGallery = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          updateFloatingState();
        });
      },
      {
        threshold: 0,
        rootMargin: galleryMargin,
      }
    );
    
    // Track original CTA position - hide floating CTA when reaching the bottom
    const ctaObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isOriginalCtaVisible = entry.isIntersecting;
          updateFloatingState();
        });
      },
      {
        threshold: 0,
        rootMargin: ctaMargin,
      }
    );
    
    galleryObserver.observe(galleryEl);
    ctaObserver.observe(ctaEl);
    
    // Immediately check initial state since IntersectionObserver callbacks don't fire synchronously
    const galleryRect = galleryEl.getBoundingClientRect();
    const ctaRect = ctaEl.getBoundingClientRect();
    
    // Check if gallery is above viewport (scrolled past)
    hasScrolledPastGallery = galleryRect.top < -200; // Match the rootMargin threshold
    
    // Check if original CTA is visible in viewport
    const ctaTop = ctaRect.top;
    const ctaBottom = ctaRect.bottom;
    const viewportHeight = window.innerHeight;
    isOriginalCtaVisible = ctaTop < viewportHeight && ctaBottom > 0;
    
    // Update state immediately with initial values
    updateFloatingState();
    
    console.log('[ShotEditor] Initial floating state:', { 
      hasScrolledPastGallery, 
      isOriginalCtaVisible, 
      hasActiveSelection,
      shouldFloat: hasScrolledPastGallery && !isOriginalCtaVisible && !hasActiveSelection
    });
    
    return () => {
      galleryObserver.disconnect();
      ctaObserver.disconnect();
    };
  }, [isMobile, hasActiveSelection, refsReady]);

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
    const targetModel = turboMode ? 'vace_14B_fake_cocktail_2_2' : 'lightning_baseline_2_2_2';
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
        selectedModel = 'lightning_baseline_3_3';
      } else if (numPhases === 3) {
        selectedModel = 'lightning_baseline_2_2_2';
      } else {
        // Fallback for other num_phases values
        selectedModel = 'lightning_baseline_2_2_2';
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
    const selectedModel = turboMode ? 'vace_14B_fake_cocktail_2_2' : 'lightning_baseline_2_2_2';
    
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

  const applySettingsFromTask = useCallback(async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    console.log('[ApplySettings] 🎬 === APPLY SETTINGS FROM TASK START ===', {
      taskId: taskId.substring(0, 8),
      replaceImages,
      inputImagesCount: inputImages.length,
      timestamp: Date.now()
    });
    console.error('[ApplySettings] 🚀 STARTING - Apply These Settings clicked', {
      taskId: taskId.substring(0, 8),
      replaceImages,
      inputImagesCount: inputImages.length,
      currentGenerationMode: generationMode,
      currentShotId: selectedShot?.id?.substring(0, 8)
    });
    
    try {
      // Step 1: Fetch task from database
      const taskData = await ApplySettingsService.fetchTask(taskId);
      if (!taskData) {
        return;
      }
      
      // Step 2: Extract all settings
      const settings = ApplySettingsService.extractSettings(taskData);
      
      console.log('[ApplySettings] 🔧 === APPLYING SETTINGS ===');
      
      // Step 3: Build context with all callbacks and current state
      const context: ApplySettingsService.ApplyContext = {
        // Current state
        currentGenerationMode: generationMode,
        currentAdvancedMode: advancedMode,
        
        // Callbacks
        onBatchVideoPromptChange,
        onSteerableMotionSettingsChange,
        onBatchVideoFramesChange,
        onBatchVideoContextChange,
        onBatchVideoStepsChange,
        onGenerationModeChange,
        onAdvancedModeChange,
        onMotionModeChange,
        onPhaseConfigChange,
        onPhasePresetSelect,
        onPhasePresetRemove,
        onTurboModeChange,
        onEnhancePromptChange,
        onTextBeforePromptsChange,
        onTextAfterPromptsChange,
        onAmountOfMotionChange,
        handleStructureVideoChange,
        loraManager,
        availableLoras,
        updatePairPromptsByIndex,
        
        // Current values for comparison
        steerableMotionSettings,
        batchVideoFrames,
        batchVideoContext,
        batchVideoSteps,
        textBeforePrompts,
        textAfterPrompts,
        turboMode,
        enhancePrompt,
        amountOfMotion,
        motionMode,
      };
      
      // Step 4: Apply all settings in sequence (some have dependencies)
      // CRITICAL: Replace images FIRST, then apply prompts to the new images
      const results: ApplySettingsService.ApplyResult[] = [];
      
      // Replace images first if requested (creates new images with positions)
      results.push(await ApplySettingsService.replaceImagesIfRequested(
        settings,
        replaceImages,
        inputImages,
        selectedShot,
        projectId,
        simpleFilteredImages,
        addImageToShotMutation,
        removeImageFromShotMutation
      ));
      
      // CRITICAL: Reload shotGenerations so prompts can be applied to the NEW images
      if (replaceImages && inputImages.length > 0) {
        console.error('[ApplySettings] 🔄 BEFORE RELOAD - Current shotGenerations:', {
          count: shotGenerations.length,
          ids: shotGenerations.map(sg => ({
            id: sg.id.substring(0, 8),
            timeline_frame: sg.timeline_frame,
            has_metadata: !!sg.metadata,
            has_pair_prompt: !!(sg.metadata as any)?.pair_prompt
          }))
        });
        
        console.error('[ApplySettings] 🔄 Images replaced - reloading shotGenerations...');
        await loadPositions({ silent: true });
        
        // Query DB directly to get fresh generation IDs for verification
        const { data: freshGens } = await supabase
          .from('shot_generations')
          .select('id, timeline_frame, metadata')
          .eq('shot_id', selectedShot.id)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });
        
        console.error('[ApplySettings] ✅ AFTER RELOAD - Fresh data from DB:', {
          count: freshGens?.length || 0,
          ids: freshGens?.map(sg => ({
            id: sg.id.substring(0, 8),
            timeline_frame: sg.timeline_frame,
            has_metadata: !!sg.metadata,
            has_pair_prompt: !!(sg.metadata as any)?.pair_prompt
          })) || []
        });
        
        console.error('[ApplySettings] 💡 updatePairPromptsByIndex will use current hook state (should match DB)');
      }
      
      // Now apply all other settings (including prompts to the NEW images)
      results.push(await ApplySettingsService.applyModelSettings(settings, context));
      results.push(await ApplySettingsService.applyPromptSettings(settings, context));
      results.push(await ApplySettingsService.applyGenerationSettings(settings, context));
      results.push(await ApplySettingsService.applyModeSettings(settings, context));
      results.push(await ApplySettingsService.applyAdvancedModeSettings(settings, context));
      results.push(await ApplySettingsService.applyTextPromptAddons(settings, context));
      results.push(await ApplySettingsService.applyMotionSettings(settings, context));
      results.push(await ApplySettingsService.applyLoRAs(settings, context));
      results.push(await ApplySettingsService.applyStructureVideo(settings, context, taskData));
      
      console.log('[ApplySettings] 🎉 === APPLY SETTINGS COMPLETE ===', {
        taskId: taskId.substring(0, 8),
        timestamp: Date.now()
      });
      
      // Production-friendly summary with ALL details
      const failedResults = results.filter(r => !r.success);
      const successfulResults = results.filter(r => r.success);
      
      console.error('[ApplySettings] 📊 COMPLETE SUMMARY - All values extracted and applied:', {
        taskId: taskId.substring(0, 8),
        extractedValues: {
          prompt: settings.prompt ? `"${settings.prompt.substring(0, 60)}..."` : 'undefined',
          prompts: settings.prompts ? `${settings.prompts.length} prompts` : 'undefined',
          negativePrompt: settings.negativePrompt || 'undefined',
          model: settings.model || 'undefined',
          steps: settings.steps || 'undefined',
          frames: settings.frames || 'undefined',
          context: settings.context || 'undefined',
          generationMode: settings.generationMode || 'undefined',
          advancedMode: settings.advancedMode !== undefined ? settings.advancedMode : 'undefined',
          motionMode: settings.motionMode || 'undefined',
          turboMode: settings.turboMode !== undefined ? settings.turboMode : 'undefined',
          enhancePrompt: settings.enhancePrompt !== undefined ? settings.enhancePrompt : 'undefined',
          amountOfMotion: settings.amountOfMotion || 'undefined',
          lorasCount: settings.loras?.length || 0,
          structureVideo: {
            path: settings.structureVideoPath || 'NOT SET',
            type: settings.structureVideoType || 'undefined',
            treatment: settings.structureVideoTreatment || 'undefined',
            motionStrength: settings.structureVideoMotionStrength || 'undefined',
            inOrchestrator: taskData.orchestrator.structure_video_path ? 'YES' : 'NO',
            inParams: taskData.params.structure_video_path ? 'YES' : 'NO',
          }
        },
        applicationStatus: {
          promptApplied: typeof settings.prompt === 'string' && settings.prompt.trim(),
          individualPromptsApplied: !!(settings.prompts && settings.prompts.length > 1 && generationMode === 'timeline'),
          structureVideoAttempted: !!(taskData.orchestrator.hasOwnProperty('structure_video_path') || taskData.params.hasOwnProperty('structure_video_path')),
          structureVideoApplied: !!(settings.structureVideoPath && (taskData.orchestrator.hasOwnProperty('structure_video_path') || taskData.params.hasOwnProperty('structure_video_path'))),
          imagesReplaced: replaceImages && selectedShot?.id && projectId && inputImages.length > 0
        },
        results: {
          successful: successfulResults.length,
          failed: failedResults.length,
          failures: failedResults.map(r => ({ setting: r.settingName, error: r.error }))
        },
        settings: {
          generationMode,
          replaceImages,
          inputImagesCount: inputImages.length
        }
      });
      
      // Force reload shotGenerations to show updated pair prompts in UI
      console.error('[ApplySettings] 🔄 Reloading shotGenerations to refresh UI...');
      await loadPositions({ silent: true });
      console.error('[ApplySettings] ✅ shotGenerations reloaded - pair prompts should now be visible');
    } catch (e) {
      console.error('[ApplySettings] ❌ === FAILED TO APPLY SETTINGS ===', e);
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
    onGenerationModeChange,
    generationMode,
    onAdvancedModeChange,
    advancedMode,
    onMotionModeChange,
    motionMode,
    onPhaseConfigChange,
    onPhasePresetSelect,
    onPhasePresetRemove,
    onTurboModeChange,
    turboMode,
    onEnhancePromptChange,
    enhancePrompt,
    onAmountOfMotionChange,
    amountOfMotion,
    handleStructureVideoChange,
    addImageToShotMutation,
    removeImageFromShotMutation,
    steerableMotionSettings.model_name,
    availableLoras,
    loraManager,
    onTextBeforePromptsChange,
    textBeforePrompts,
    onTextAfterPromptsChange,
    textAfterPrompts,
    batchVideoSteps,
    batchVideoFrames,
    batchVideoContext,
    updatePairPromptsByIndex,
    loadPositions,
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
  const [variantName, setVariantName] = useState('');

  // Note: Pair prompts are now managed through the database via ShotImagesEditor
  // The generation logic will need to be updated to fetch pair prompts from the database

  const isGenerationDisabled = isSteerableMotionEnqueuing;

  // Handle video generation
  const handleGenerateBatch = useCallback(async () => {
    if (!projectId) {
      toast.error('No project selected. Please select a project first.');
      return;
    }

    // Set loading state immediately to provide instant user feedback
    setIsSteerableMotionEnqueuing(true);
    setSteerableMotionJustQueued(false);

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
      setIsSteerableMotionEnqueuing(false);
      return;
    }

    let resolution: string | undefined = undefined;

    // SIMPLIFIED RESOLUTION LOGIC - Only use aspect ratios (no more custom dimensions)
    // Priority 1: Check if shot has an aspect ratio set
    if (selectedShot?.aspect_ratio) {
      resolution = ASPECT_RATIO_TO_RESOLUTION[selectedShot.aspect_ratio];
      console.log('[Resolution] Using shot aspect ratio:', {
        aspectRatio: selectedShot.aspect_ratio,
        resolution
      });
    }

    // Priority 2: If no shot aspect ratio, fall back to project aspect ratio
    if (!resolution && effectiveAspectRatio) {
      resolution = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
      console.log('[Resolution] Using project aspect ratio:', {
        aspectRatio: effectiveAspectRatio,
        resolution
      });
    }

    // Priority 3: Use default resolution if nothing else is set
    if (!resolution) {
      resolution = DEFAULT_RESOLUTION;
      console.log('[Resolution] Using default resolution:', resolution);
    }

    // Use getDisplayUrl to convert relative paths to absolute URLs
    // IMPORTANT: Query fresh data directly from database to avoid using stale cached data
    // This prevents deleted items from appearing in the task
    let absoluteImageUrls: string[];
    try {
      console.log('[TaskSubmission] Fetching fresh image data from database for task...');
      const { data: freshShotGenerations, error } = await supabase
        .from('shot_generations')
        .select(`
          id,
          generation_id,
          timeline_frame,
          metadata,
          generations:generation_id (
            id,
            location,
            upscaled_url,
            type
          )
        `)
        .eq('shot_id', selectedShotId)
        .order('timeline_frame', { ascending: true });

      if (error) {
        console.error('[TaskSubmission] Error fetching fresh shot data:', error);
        toast.error('Failed to fetch current images. Please try again.');
        setIsSteerableMotionEnqueuing(false);
        return;
      }

      // Filter and process exactly like simpleFilteredImages does
      // IMPORTANT: Now prioritizes upscaled_url when available
      const freshImages = (freshShotGenerations || [])
        .filter(sg => {
          // Has valid timeline frame
          const hasTimelineFrame = sg.timeline_frame !== null && sg.timeline_frame !== undefined;
          if (!hasTimelineFrame) return false;
          
          // Not a video
          const gen = sg.generations as any;
          const isVideo = gen?.type === 'video' ||
                         gen?.type === 'video_travel_output' ||
                         (gen?.location && gen.location.endsWith('.mp4'));
          return !isVideo;
        })
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0))
        .map(sg => {
          const gen = sg.generations as any;
          // Prioritize upscaled URL if available
          return resolveImageUrl(gen?.location, gen?.upscaled_url);
        })
        .filter((location): location is string => Boolean(location));

      absoluteImageUrls = freshImages
        .map((location) => getDisplayUrl(location))
        .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

      const upscaledCount = (freshShotGenerations || []).filter(sg => {
        const gen = sg.generations as any;
        return gen?.upscaled_url && gen.upscaled_url.trim();
      }).length;

      console.log('[TaskSubmission] Using fresh image URLs (with upscale priority):', {
        count: absoluteImageUrls.length,
        upscaledCount,
        urls: absoluteImageUrls.map(url => url.substring(0, 50) + '...')
      });
    } catch (err) {
      console.error('[TaskSubmission] Error fetching fresh image data:', err);
      toast.error('Failed to prepare task data. Please try again.');
      setIsSteerableMotionEnqueuing(false);
      return;
    }

    let basePrompts: string[];
    let segmentFrames: number[];
    let frameOverlap: number[];
    let negativePrompts: string[];
    let enhancedPromptsArray: string[] = [];

    if (generationMode === 'timeline') {
      // Timeline positions are now managed by useEnhancedShotPositions
      // Frame gaps will be extracted from the database-driven positions
      
      // Fetch shot generations with timeline positions from database for timeline generation
      let pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
      let enhancedPrompts: Record<number, string> = {};
      let sortedPositions: Array<{id: string, pos: number}> = [];
      
      try {
        const { data: shotGenerationsData, error } = await supabase
          .from('shot_generations')
          .select(`
            id,
            generation_id,
            timeline_frame,
            metadata,
            generations:generation_id (
              id,
              location,
              upscaled_url,
              type
            )
          `)
          .eq('shot_id', selectedShotId)
          .order('timeline_frame', { ascending: true });

        if (error) {
          console.error('[Generation] Error fetching shot generations:', error);
        } else if (shotGenerationsData) {
          // Build sorted positions from timeline_frame data
          // CRITICAL: Filter out videos to match absoluteImageUrls filtering
          // MUST match the UI filtering logic exactly (only filter videos, NOT timeline_frame)
          const filteredShotGenerations = shotGenerationsData.filter(sg => {
            // Must have a generation
            if (!sg.generations) return false;
            
            // Not a video - must match the filtering logic used for absoluteImageUrls above AND the UI
            const gen = sg.generations as any;
            const isVideo = gen?.type === 'video' ||
                           gen?.type === 'video_travel_output' ||
                           (gen?.location && gen.location.endsWith('.mp4'));
            return !isVideo;
          });

          // Build sorted positions ONLY from items with valid timeline_frame
          // (needed for calculating frame gaps)
          sortedPositions = filteredShotGenerations
            .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined)
            .map(sg => ({
              id: sg.generation_id || sg.id,
              pos: sg.timeline_frame!
            }))
            .sort((a, b) => a.pos - b.pos);
          
          console.log('[Generation] Timeline mode - Sorted positions from database:', sortedPositions);
          console.log('[Generation] Timeline mode - First image position:', sortedPositions[0]?.pos);
          console.log('[Generation] Timeline mode - All positions:', sortedPositions.map(sp => sp.pos));
          
          // CRITICAL FIX: Extract pair prompts from FILTERED data (not raw data)
          // This ensures pair prompt indexes match the actual image pairs being generated
          console.log('[PairPrompts-LOAD] 📚 Starting to extract pair prompts from database:', {
            totalFilteredGenerations: filteredShotGenerations.length,
            expectedPairs: filteredShotGenerations.length - 1
          });
          
          for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
            const firstItem = filteredShotGenerations[i];
            const metadata = firstItem.metadata as any;
            console.log(`[PairPrompts-LOAD] 🔍 Checking pair ${i}:`, {
              shotGenId: firstItem.id.substring(0, 8),
              timeline_frame: firstItem.timeline_frame,
              has_pair_prompt: !!metadata?.pair_prompt,
              has_pair_negative_prompt: !!metadata?.pair_negative_prompt,
              has_enhanced_prompt: !!metadata?.enhanced_prompt
            });
            
            if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
              pairPrompts[i] = {
                prompt: metadata.pair_prompt || '',
                negativePrompt: metadata.pair_negative_prompt || '',
              };
              console.log(`[PairPrompts-LOAD] ✅ Loaded pair prompt ${i} from metadata:`, {
                prompt: metadata.pair_prompt || '(none)',
                negativePrompt: metadata.pair_negative_prompt || '(none)',
                shotGenId: firstItem.id.substring(0, 8),
                timeline_frame: firstItem.timeline_frame
              });
            }
            
            // Extract enhanced prompt if present
            if (metadata?.enhanced_prompt) {
              enhancedPrompts[i] = metadata.enhanced_prompt;
              console.log(`[PairPrompts-LOAD] ✅ Loaded enhanced prompt ${i} from metadata:`, {
                enhancedPrompt: metadata.enhanced_prompt,
                shotGenId: firstItem.id.substring(0, 8),
                timeline_frame: firstItem.timeline_frame
              });
            }
          }
          
          console.log('[PairPrompts-LOAD] 📊 Pair prompts loaded from database:', {
            totalPairs: filteredShotGenerations.length - 1,
            customPairs: Object.keys(pairPrompts).length,
            pairPromptIndexes: Object.keys(pairPrompts).map(Number),
            allPairPrompts: pairPrompts,
            enhancedPromptsCount: Object.keys(enhancedPrompts).length,
            enhancedPromptIndexes: Object.keys(enhancedPrompts).map(Number),
            allEnhancedPrompts: enhancedPrompts
          });
        }
      } catch (err) {
        console.error('[Generation] Error fetching shot generations:', err);
      }
      
      // Calculate frame gaps from sorted positions
      const frameGaps = [];
      for (let i = 0; i < sortedPositions.length - 1; i++) {
        const gap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
        frameGaps.push(gap);
        console.log(`[Generation] Gap ${i}: position ${sortedPositions[i].pos} -> ${sortedPositions[i + 1].pos} = ${gap} frames`);
      }
      
      console.log('[Generation] Timeline mode - Calculated frame gaps:', frameGaps);
      console.log('[Generation] Timeline mode - Gap calculation summary:', {
        totalImages: sortedPositions.length,
        totalGaps: frameGaps.length,
        expectedGaps: sortedPositions.length - 1,
        gapsMatch: frameGaps.length === sortedPositions.length - 1
      });

      console.log('[PairPrompts-GENERATION] 🎯 Building prompts array:', {
        totalGaps: frameGaps.length,
        availablePairPrompts: Object.keys(pairPrompts).length,
        pairPromptsIndexes: Object.keys(pairPrompts).map(Number),
        batchVideoPromptDefault: batchVideoPrompt,
        fullPairPromptsObject: pairPrompts
      });

      basePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
        // CRITICAL: Only use pair-specific prompt if it exists
        // Send EMPTY STRING if no custom prompt - backend will use base_prompt (singular)
        const pairPrompt = pairPrompts[index]?.prompt;
        const finalPrompt = (pairPrompt && pairPrompt.trim()) ? pairPrompt.trim() : '';
        console.log(`[PairPrompts-GENERATION] 📝 Pair ${index}:`, {
          hasPairPrompt: !!pairPrompt,
          pairPromptRaw: pairPrompt || '(none)',
          finalPromptUsed: finalPrompt || '(empty - will use base_prompt)',
          isCustom: pairPrompt && pairPrompt.trim() ? true : false
        });
        return finalPrompt;
      }) : [''];
      
      segmentFrames = frameGaps.length > 0 ? frameGaps : [batchVideoFrames];
      frameOverlap = frameGaps.length > 0 ? frameGaps.map(() => batchVideoContext) : [batchVideoContext];
      
      negativePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
        // Use pair-specific negative prompt if available, otherwise fall back to default
        const pairNegativePrompt = pairPrompts[index]?.negativePrompt;
        const finalNegativePrompt = (pairNegativePrompt && pairNegativePrompt.trim()) ? pairNegativePrompt.trim() : steerableMotionSettings.negative_prompt;
        console.log(`[PairPrompts-GENERATION] 🚫 Pair ${index} negative:`, {
          hasPairNegativePrompt: !!pairNegativePrompt,
          pairNegativePromptRaw: pairNegativePrompt || '(none)',
          finalNegativePromptUsed: finalNegativePrompt,
          isCustom: pairNegativePrompt && pairNegativePrompt.trim() ? true : false
        });
        return finalNegativePrompt;
      }) : [steerableMotionSettings.negative_prompt];

      // Build enhanced prompts array (empty strings for pairs without enhanced prompts)
      enhancedPromptsArray = frameGaps.length > 0 ? frameGaps.map((_, index) => {
        const enhancedPrompt = enhancedPrompts[index] || '';
        console.log(`[PairPrompts-GENERATION] 🌟 Pair ${index} enhanced:`, {
          hasEnhancedPrompt: !!enhancedPrompt,
          enhancedPromptRaw: enhancedPrompt || '(none)',
          promptPreview: enhancedPrompt ? enhancedPrompt.substring(0, 50) + (enhancedPrompt.length > 50 ? '...' : '') : '(none)'
        });
        return enhancedPrompt;
      }) : [];

      console.log(`[PairPrompts-GENERATION] ✅ Final prompts array:`, {
        basePrompts,
        negativePrompts,
        enhancedPrompts: enhancedPromptsArray,
        pairPromptsObject: pairPrompts,
        summary: basePrompts.map((prompt, idx) => ({
          pairIndex: idx,
          promptPreview: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          isCustom: prompt !== batchVideoPrompt,
          hasEnhancedPrompt: !!enhancedPromptsArray[idx]
        }))
      });

      console.log(`[Generation] Timeline mode - Final prompts:`, { basePrompts, negativePrompts, pairPrompts, enhancedPrompts, enhancedPromptsArray });
    } else {
      // batch mode - send empty string, backend will use base_prompt
      basePrompts = [''];
      segmentFrames = [batchVideoFrames];
      frameOverlap = [batchVideoContext];
      negativePrompts = [steerableMotionSettings.negative_prompt];
    }

    // Use model based on turbo mode for task creation
    const actualModelName = getModelName();
    
    // Validate and debug log phase config before sending
    if (advancedMode && phaseConfig) {
      const phasesLength = phaseConfig.phases?.length || 0;
      const stepsLength = phaseConfig.steps_per_phase?.length || 0;
      const numPhases = phaseConfig.num_phases;
      
      // Final validation check before sending to backend
      if (numPhases !== phasesLength || numPhases !== stepsLength) {
        console.error('[PhaseConfigDebug] CRITICAL: Inconsistent phase config about to be sent!', {
          num_phases: numPhases,
          phases_array_length: phasesLength,
          steps_array_length: stepsLength,
          ERROR: 'This WILL cause backend validation errors!',
          phases_data: phaseConfig.phases?.map(p => ({ phase: p.phase, guidance_scale: p.guidance_scale, loras_count: p.loras?.length })),
          steps_per_phase: phaseConfig.steps_per_phase
        });
        toast.error(`Invalid phase configuration: num_phases (${numPhases}) doesn't match arrays (phases: ${phasesLength}, steps: ${stepsLength}). Please reset to defaults.`);
        return; // Don't submit invalid config
      }
      
      console.log('[PhaseConfigDebug] Preparing to send phase_config:', {
        num_phases: phaseConfig.num_phases,
        model_switch_phase: phaseConfig.model_switch_phase,
        phases_array_length: phasesLength,
        steps_array_length: stepsLength,
        phases_data: phaseConfig.phases?.map(p => ({ phase: p.phase, guidance_scale: p.guidance_scale, loras_count: p.loras?.length })),
        steps_per_phase: phaseConfig.steps_per_phase,
        VALIDATION: 'PASSED'
      });
    }
    
    // CRITICAL: Filter out empty enhanced prompts to prevent backend from duplicating base_prompt
    // Only send enhanced_prompts if we have actual non-empty enhanced prompts from metadata
    const hasValidEnhancedPrompts = enhancedPromptsArray.some(prompt => prompt && prompt.trim().length > 0);
    
    console.log('[EnhancedPrompts-Safety] Checking enhanced prompts:', {
      enhancedPromptsArrayLength: enhancedPromptsArray.length,
      hasValidEnhancedPrompts,
      enhancedPromptsPreview: enhancedPromptsArray.map((p, i) => ({ 
        index: i, 
        hasContent: !!p && p.trim().length > 0,
        preview: p ? p.substring(0, 30) + '...' : '(empty)'
      })),
      enhancePromptFlag: enhancePrompt,
      autoCreateIndividualPromptsFlag: autoCreateIndividualPrompts,
      // Show what we're sending for prompt appending
      base_prompt_singular: batchVideoPrompt,
      base_prompts_array: basePrompts,
      willAppendBasePrompt: enhancePrompt
    });
    
    const requestBody: any = {
      project_id: projectId,
      shot_id: selectedShot.id,
      image_urls: absoluteImageUrls,
      base_prompts: basePrompts,
      base_prompt: batchVideoPrompt, // Singular - the default/base prompt that gets appended when autoCreateIndividualPrompts is enabled
      segment_frames: segmentFrames,
      frame_overlap: frameOverlap,
      negative_prompts: negativePrompts,
      // CRITICAL: Only include enhanced_prompts if we have actual enhanced prompts to send
      // This prevents the backend from duplicating base_prompt into enhanced_prompts_expanded
      ...(hasValidEnhancedPrompts ? { enhanced_prompts: enhancedPromptsArray } : {}),
      model_name: actualModelName,
      seed: steerableMotionSettings.seed,
      // Only include steps if NOT in Advanced Mode (Advanced Mode uses steps_per_phase in phase_config)o
      ...(advancedMode ? {} : { steps: batchVideoSteps }),
      debug: steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
      show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
      enhance_prompt: enhancePrompt,
      // Save UI state settings (dimension_source removed - now using aspect ratios only)
      generation_mode: generationMode,
      random_seed: randomSeed,
      turbo_mode: turboMode,
      // Only include amount_of_motion if NOT in Advanced Mode
      ...(advancedMode ? {} : { amount_of_motion: amountOfMotion / 100.0 }),
      // Advanced mode flag and phase config
      advanced_mode: advancedMode,
      motion_mode: motionMode, // Motion control mode (basic/presets/advanced)
      phase_config: advancedMode && phaseConfig ? phaseConfig : undefined,
      // Include regenerate_anchors if in Advanced Mode
      ...(advancedMode && regenerateAnchors !== undefined ? { regenerate_anchors: regenerateAnchors } : {}),
      // Include selected phase preset ID for UI state restoration
      selected_phase_preset_id: advancedMode && selectedPhasePresetId ? selectedPhasePresetId : undefined,
      // Add generation name if provided
      generation_name: variantName.trim() || undefined,
      // Text before/after prompts
      ...(textBeforePrompts ? { text_before_prompts: textBeforePrompts } : {}),
      ...(textAfterPrompts ? { text_after_prompts: textAfterPrompts } : {}),
    };

    // Only add regular LoRAs if Advanced Mode is OFF
    // In Advanced Mode, LoRAs are defined per-phase in phase_config
    if (!advancedMode) {
      const loras = [];
      
      // Add user-selected LoRAs
      if (loraManager.selectedLoras && loraManager.selectedLoras.length > 0) {
        loras.push(...loraManager.selectedLoras.map(l => ({ 
          path: l.path, 
          strength: parseFloat(l.strength?.toString() ?? '0') || 0.0 
        })));
      }
      
      // In basic mode, add the motion control LoRA based on the Amount of Motion slider
      if (motionMode === 'basic' && amountOfMotion > 0) {
        loras.push({
          path: 'https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors',
          strength: amountOfMotion / 100.0
        });
      }
      
      if (loras.length > 0) {
        requestBody.loras = loras;
      }
    }

    if (resolution) {
      requestBody.resolution = resolution;
    }

    // Add structure video params if available
    console.log('[Generation] [DEBUG] Structure video state at generation time:', {
      structureVideoPath,
      structureVideoType,
      structureVideoTreatment,
      structureVideoMotionStrength,
      willAddToRequest: !!structureVideoPath
    });
    
    if (structureVideoPath) {
      console.log('[Generation] Adding structure video to task:', {
        videoPath: structureVideoPath,
        treatment: structureVideoTreatment,
        motionStrength: structureVideoMotionStrength,
        structureType: structureVideoType
      });
      requestBody.structure_video_path = structureVideoPath;
      requestBody.structure_video_treatment = structureVideoTreatment;
      requestBody.structure_video_motion_strength = structureVideoMotionStrength;
      requestBody.structure_video_type = structureVideoType;
    }
    
    // Debug logging for enhance_prompt parameter and enhanced_prompts array
    console.log("[EnhancePromptDebug] ⚠️ ShotEditor - Value being sent to task creation:", {
      enhancePrompt_from_props: enhancePrompt,
      requestBody_enhance_prompt: requestBody.enhance_prompt,
      VALUES_MATCH: enhancePrompt === requestBody.enhance_prompt,
      autoCreateIndividualPrompts,
      NOTE: 'autoCreateIndividualPrompts is DIFFERENT from enhancePrompt!',
      // CRITICAL: Verify enhanced_prompts is NOT being sent when empty
      enhanced_prompts_included_in_request: 'enhanced_prompts' in requestBody,
      enhanced_prompts_array_length: requestBody.enhanced_prompts?.length || 0,
      enhanced_prompts_preview: requestBody.enhanced_prompts?.map((p: string, i: number) => ({
        index: i,
        preview: p ? p.substring(0, 30) + '...' : '(empty)',
        length: p?.length || 0
      })) || 'NOT_INCLUDED',
      WARNING: enhancePrompt === false && requestBody.enhance_prompt === true ? '❌ MISMATCH DETECTED! requestBody has true but prop is false' : '✅ Values match'
    });
    
    try {
      // IMPORTANT: If enhance_prompt is false, clear all existing enhanced prompts
      // This ensures we don't use stale enhanced prompts from previous generations
      if (!enhancePrompt) {
        console.log("[ShotEditor] enhance_prompt is false - clearing all enhanced prompts before task submission");
        try {
          await clearAllEnhancedPrompts();
          console.log("[ShotEditor] ✅ Successfully cleared all enhanced prompts");
        } catch (clearError) {
          console.error("[ShotEditor] ⚠️ Failed to clear enhanced prompts:", clearError);
          // Continue with task submission even if clearing fails (non-critical)
        }
      }
      // Use the new client-side travel between images task creation instead of calling the edge function
      await createTravelBetweenImagesTask(requestBody as TravelBetweenImagesTaskParams);
      
      // Clear variant name field after successful submission
      setVariantName('');
      
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
    randomSeed,
    turboMode,
    amountOfMotion,
    advancedMode,
    phaseConfig,
    selectedPhasePresetId,
    variantName,
    // selectedMode removed - now hardcoded to use specific model
    loraManager.selectedLoras,
    queryClient,
    onShotImagesUpdate,
    // Structure video state - CRITICAL: must be included or callback uses stale values
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength
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
  
  // Intersection observer for sticky header (using existing ctaContainerRef from line 531)
  useEffect(() => {
    const ctaContainer = ctaContainerRef.current;
    if (!ctaContainer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSticky(!entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0,
      }
    );

    observer.observe(ctaContainer);

    return () => {
      if (ctaContainer) {
        observer.unobserve(ctaContainer);
      }
    };
  }, []);

  // Back to top button logic
  const [showBackToTop, setShowBackToTop] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col space-y-4 pb-4">
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
        projectAspectRatio={effectiveAspectRatio}
        projectId={projectId}
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
        <div className="flex flex-col w-full gap-4">
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
            batchVideoContext={batchVideoContext}
            onImageReorder={handleReorderImagesInShot}
            onImageSaved={async (imageId: string, newImageUrl: string, createNew?: boolean) => {
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
            }}
            onContextFramesChange={onBatchVideoContextChange}
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
            unpositionedGenerationsCount={unpositionedGenerationsCount}
            onOpenUnpositionedPane={openUnpositionedGenerationsPane}
            fileInputKey={state.fileInputKey}
            onImageUpload={generationActions.handleImageUploadToShot}
            isUploadingImage={state.isUploadingImage}
            uploadProgress={state.uploadProgress}
            duplicatingImageId={state.duplicatingImageId}
            duplicateSuccessImageId={state.duplicateSuccessImageId}
            projectAspectRatio={effectiveAspectRatio}
            onSelectionChange={(hasSelection) => {
              // Track selection state - floating CTA will auto-hide/show based on this
              setHasActiveSelection(hasSelection);
            }}
            defaultPrompt={batchVideoPrompt}
            onDefaultPromptChange={onBatchVideoPromptChange}
            defaultNegativePrompt={steerableMotionSettings.negative_prompt || ""}
            onDefaultNegativePromptChange={(value) => onSteerableMotionSettingsChange({ negative_prompt: value })}
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
            onShotChange={(shotId) => {
              console.log('[ShotEditor] Shot change requested to:', shotId);
              // Shot change will be handled by parent navigation
            }}
            onAddToShot={async (shotId, generationId, position) => {
              console.log('[ShotEditor] Adding generation to shot with position', { shotId, generationId, position });
              await addToShotMutation({ 
                shot_id: shotId, 
                generation_id: generationId, 
                timelineFrame: position, 
                project_id: projectId 
              });
            }}
            onAddToShotWithoutPosition={async (shotId, generationId) => {
              console.log('[ShotEditor] Adding generation to shot without position', { shotId, generationId });
              await addToShotWithoutPositionMutation({ 
                shot_id: shotId, 
                generation_id: generationId, 
                project_id: projectId 
              });
            }}
            onCreateShot={async (name) => {
              console.log('[ShotEditor] Creating new shot', { name });
              const result = await createShotMutation({ name, projectId });
              return result.shot.id;
            }}
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
                            advancedMode={advancedMode || false}
                            onAdvancedModeChange={onAdvancedModeChange || (() => {})}
                            regenerateAnchors={regenerateAnchors}
                            onRegenerateAnchorsChange={onRegenerateAnchorsChange}
                            phaseConfig={phaseConfig}
                            onPhaseConfigChange={onPhaseConfigChange || (() => {})}
                            onBlurSave={onBlurSave}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                            turboMode={turboMode}
                        />
                    </div>
                </div>

                {/* Full-width divider and generate button - Original position with ref */}
                <div ref={ctaContainerRef} className="mt-6 pt-6 border-t">
                  <div className="flex flex-col items-center">
                    {/* Variant Name Input */}
                    <div className="w-full max-w-md mb-4">
                      <input
                        id="variant-name"
                        type="text"
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value)}
                        placeholder="Variant name"
                        className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                    </div>
                    
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
        const gap = isMobile ? -16 : 8; // Negative gap on mobile to push up, small gap on desktop
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
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onPreviousShotNoScroll) onPreviousShotNoScroll();
                }}
                disabled={!hasPrevious || state.isTransitioningFromNameEdit}
                className="flex-shrink-0 pointer-events-auto opacity-60 hover:opacity-100 transition-opacity"
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
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onNextShotNoScroll) onNextShotNoScroll();
                }}
                disabled={!hasNext || state.isTransitioningFromNameEdit}
                className="flex-shrink-0 pointer-events-auto opacity-60 hover:opacity-100 transition-opacity"
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
      
      {/* Floating CTA - appears when original position is not visible */}
      {showCtaElement && (
        <div 
          className={`fixed z-[80] flex justify-center duration-300 pointer-events-none ${
            isInitialMountRef.current 
              ? '' // No animation on initial mount
              : isCtaFloating 
                ? 'animate-in slide-in-from-bottom-4 fade-in' 
                : 'animate-out slide-out-to-bottom-4 fade-out'
          }`}
          style={{
            bottom: isMobile ? '55px' : '60px', // Positioned nicely above bottom
            left: isShotsPaneLocked ? `${shotsPaneWidth + 16}px` : '16px',
            right: isTasksPaneLocked ? `${tasksPaneWidth + 16}px` : '16px',
          }}
        >
          <div className="bg-background/80 backdrop-blur-md border rounded-lg shadow-2xl px-6 py-3 w-full max-w-lg pointer-events-auto">
            <div className="flex flex-col items-center gap-2">
              {/* Variant Name Input */}
              <div className="w-full">
                <input
                  id="variant-name-floating"
                  type="text"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="Variant name"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
              
              <Button 
                size="lg" 
                className="w-full" 
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
            </div>
          </div>
        </div>
      )}

      {/* Back to Top Button */}
      {showBackToTop && (
        <Button
          variant="theme-soft"
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
          onClick={scrollToTop}
          title="Back to top"
        >
          <ArrowUp />
        </Button>
      )}
    </div>
  );
};

export default ShotEditor; 