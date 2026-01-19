import React, { useState, useEffect, useRef, Suspense, useMemo, useLayoutEffect, useCallback, startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';
import { useHandleExternalImageDrop, useUpdateShotName, useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/useShots';
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useProject } from "@/shared/contexts/ProjectContext";
import CreateShotModal from '@/shared/components/CreateShotModal';
import ShotListDisplay from '../components/ShotListDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { VideoTravelSettings } from '../settings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
// Settings inheritance is handled by useShotCreation
import { PageFadeIn } from '@/shared/components/transitions';
import { useContentResponsive } from '@/shared/hooks/useContentResponsive';
import { timeEnd } from '@/shared/lib/logger';

import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import ShotEditor from '../components/ShotEditor';
import { useAllShotGenerations, usePrimeShotGenerationsCache } from '@/shared/hooks/useShotGenerations';
import { useProjectVideoCountsCache } from '@/shared/hooks/useProjectVideoCountsCache';
import { useProjectGenerationModesCache } from '@/shared/hooks/useProjectGenerationModesCache';
import { useShotSettings } from '../hooks/useShotSettings';
import { useVideoTravelSettingsHandlers } from '../hooks/useVideoTravelSettingsHandlers';
import { useVideoTravelViewMode } from '../hooks/useVideoTravelViewMode';
import { useVideoTravelData } from '../hooks/useVideoTravelData';
import { useVideoTravelDropHandlers } from '../hooks/useVideoTravelDropHandlers';
import { useVideoTravelAddToShot } from '../hooks/useVideoTravelAddToShot';
import { useStableSkeletonVisibility } from '../hooks/useStableSkeletonVisibility';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';

import { useVideoGalleryPreloader } from '@/shared/hooks/useVideoGalleryPreloader';
import { useGenerations, useDeleteGeneration } from '@/shared/hooks/useGenerations';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useRenderCount } from '@/shared/components/debug/RefactorMetricsCollector';
import { VideoTravelListHeader } from '../components/VideoTravelListHeader';
import { VideoTravelVideosGallery } from '../components/VideoTravelVideosGallery';

// ShotEditor is imported eagerly to avoid dynamic import issues on certain mobile browsers.
// useVideoTravelData moved to hooks/useVideoTravelData.ts

const VideoTravelToolPage: React.FC = () => {
  // [RefactorMetrics] Track render count for baseline measurements
  useRenderCount('VideoTravelToolPage');
  
  // [VideoTravelDebug] Reduced logging - only log first few renders and major milestones
  const VIDEO_DEBUG_TAG = '[VideoTravelDebug]';
  const videoRenderCount = useRef(0);
  const videoMountTime = useRef(Date.now());
  videoRenderCount.current += 1;
  
  // Only log first 5 renders and every 10th render after that to reduce noise
  if (videoRenderCount.current <= 5 || videoRenderCount.current % 10 === 0) {
    console.log(`${VIDEO_DEBUG_TAG} === RENDER START #${videoRenderCount.current} === ${Date.now() - videoMountTime.current}ms since mount`);
  }
  
  // [PROFILING] Track what's causing VideoTravelToolPage rerenders
  const prevStateRef = useRef<any>(null);
  useEffect(() => {
    if (prevStateRef.current && (videoRenderCount.current <= 10 || videoRenderCount.current % 10 === 0)) {
      const changes: string[] = [];
      
      // Track key state changes
      if (prevStateRef.current.locationKey !== location.key) changes.push(`location.key(${location.key})`);
      if (prevStateRef.current.locationHash !== location.hash) changes.push(`location.hash(${location.hash?.substring(0, 12)})`);
      if (prevStateRef.current.selectedProjectId !== selectedProjectId) changes.push('selectedProjectId');
      if (prevStateRef.current.currentShotId !== currentShotId) changes.push('currentShotId');
      if (prevStateRef.current.selectedShotId !== selectedShot?.id) changes.push('selectedShot.id');
      
      if (changes.length > 0) {
        console.warn(`[VideoTravelToolPage:Profiling] 🔄 Render #${videoRenderCount.current} caused by:`, {
          changes,
          timeSinceMount: Date.now() - videoMountTime.current,
          timestamp: Date.now()
        });
      } else {
        console.warn(`[VideoTravelToolPage:Profiling] ⚠️ Render #${videoRenderCount.current} with NO STATE CHANGES (context/parent rerender)`, {
          timeSinceMount: Date.now() - videoMountTime.current,
          timestamp: Date.now()
        });
      }
    }
    
    prevStateRef.current = {
      locationKey: location.key,
      locationHash: location.hash,
      selectedProjectId,
      currentShotId,
      selectedShotId: selectedShot?.id
    };
  });
  
  const navigate = useNavigate();
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const shotFromState = location.state?.shotData;
  const isNewlyCreatedShot = location.state?.isNewlyCreated === true;
  const { selectedProjectId, setSelectedProjectId, projects } = useProject();
  
  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Get generation location settings to auto-disable turbo mode when not in cloud
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudGenerationEnabled = generationMethods.inCloud;
  
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  
  // Get setLastAffectedShotId to update the default shot in GenerationsPane when creating new shots
  const { setLastAffectedShotId } = useLastAffectedShot();

  // Scroll to top on initial mount and when returning to main view (hash cleared)
  const prevHashRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const hasHash = location.hash && location.hash.length > 1;
    const hadHash = prevHashRef.current !== null && prevHashRef.current.length > 1;
    
    // Scroll to top:
    // 1. On mount without a hash (handles redirects from / and /tools)
    // 2. When hash is cleared (returning from shot view to main view)
    if (!hasHash && (prevHashRef.current === null || hadHash)) {
      window.scrollTo(0, 0);
      window.dispatchEvent(new CustomEvent('app:scrollToTop', { detail: { behavior: 'auto' } }));
    }
    
    prevHashRef.current = location.hash;
  }, [location.hash]);
  
  // NOTE: selectedShot is derived below, after useVideoTravelData provides the shots array
  
  // Mobile detection for mode handling
  const isMobile = useIsMobile();
  const itemsPerPage = isMobile ? 20 : 12; // Mobile: 20 (10 rows of 2), Desktop: 12 (4 rows of 3)
  
  // Preload all shot video counts for the project
  const { getShotVideoCount, getFinalVideoCount, logCacheState, isLoading: isLoadingProjectCounts, error: projectCountsError, invalidateOnVideoChanges } = useProjectVideoCountsCache(selectedProjectId);
  
  // Preload all shot generation modes for the project
  const { getShotGenerationMode, updateShotMode, isLoading: isLoadingProjectModes, error: projectModesError } = useProjectGenerationModesCache(selectedProjectId);
  
  // Debug project video counts cache - reduced logging
  const hasLoggedCacheState = useRef(false);
  React.useEffect(() => {
    if (!hasLoggedCacheState.current && selectedProjectId && getShotVideoCount) {
      hasLoggedCacheState.current = true;
      console.log('[ProjectVideoCountsDebug] Cache state in VideoTravelToolPage:', {
        selectedProjectId,
        isLoadingProjectCounts,
        projectCountsError: projectCountsError?.message,
        getShotVideoCountExists: !!getShotVideoCount,
        timestamp: Date.now()
      });
    }
  }, [selectedProjectId, getShotVideoCount, isLoadingProjectCounts, projectCountsError]);
  
  // Task queue notifier is now handled inside ShotEditor component
  
  // Use parallelized data fetching for better performance
  // NOTE: Using currentShotId instead of selectedShot?.id since currentShotId is the source of truth
  console.log('[ShotNavPerf] 📡 Calling useVideoTravelData with shotId:', currentShotId?.substring(0, 8) || 'none');
  const videoTravelDataStart = Date.now();
  const {
    shots,
    shotsLoading: shotsLoadingRaw,
    shotsError: error,
    refetchShots,
    availableLoras,
    lorasLoading,
    settingsUpdating: isUpdating,
    projectSettings,
    updateProjectSettings,
    projectSettingsLoading,
    projectSettingsUpdating,
    projectUISettings,
    updateProjectUISettings,
    uploadSettings,
  } = useVideoTravelData(currentShotId || undefined, selectedProjectId);
  console.log('[ShotNavPerf] ✅ useVideoTravelData returned in', Date.now() - videoTravelDataStart, 'ms');
  
  // CONSOLIDATION: selectedShot is now DERIVED from currentShotId + shots + shotFromState
  // This eliminates sync issues between selectedShot and currentShotId
  // Priority: 1) shots array (source of truth), 2) shotFromState (for optimistic updates)
  const selectedShot = useMemo(() => {
    if (!currentShotId) return null;
    // First try shots array (the source of truth once cached)
    if (shots) {
      const found = shots.find(s => s.id === currentShotId);
      if (found) return found;
    }
    // Fallback to shotFromState for newly created shots not yet in cache
    if (shotFromState && shotFromState.id === currentShotId) {
      return shotFromState as Shot;
    }
    return null;
  }, [currentShotId, shots, shotFromState]);
  
  // [ShotNavPerf] Track when selectedShot changes
  const prevSelectedShotRef = useRef<Shot | null>(null);
  useEffect(() => {
    if (prevSelectedShotRef.current?.id !== selectedShot?.id) {
      console.log('[ShotNavPerf] 🔄 selectedShot CHANGED', {
        timestamp: Date.now(),
        from: prevSelectedShotRef.current?.name || 'none',
        fromId: prevSelectedShotRef.current?.id?.substring(0, 8) || 'none',
        to: selectedShot?.name || 'none',
        toId: selectedShot?.id?.substring(0, 8) || 'none',
        source: viaShotClick ? 'ShotListDisplay' : 'Navigation'
      });
      prevSelectedShotRef.current = selectedShot;
    }
  }, [selectedShot, viaShotClick]);
  
  // NEW: Modern settings management using dedicated hook
  // IMPORTANT: Use currentShotId (from context) instead of selectedShot?.id
  // This ensures useShotSettings reacts immediately when navigating to a new shot,
  // even before the shots array is updated and selectedShot is set.
  // This is critical for settings inheritance to work on newly created shots.
  const shotSettings = useShotSettings(currentShotId || undefined, selectedProjectId);
  
  // NOTE: previously this file had a profiling effect that logged on every render
  // when `shotSettings` changed identity. That created massive console spam during
  // normal navigation, so it has been removed.
  
  // Ref to always access latest shotSettings without triggering effects
  const shotSettingsRef = useRef(shotSettings);
  shotSettingsRef.current = shotSettings;

  // Track the settings of the last active shot to inherit when creating a new shot
  const lastActiveShotSettingsRef = useRef<VideoTravelSettings | null>(null);
  
  useEffect(() => {
    // Only update if we have a selected shot and settings are loaded AND confirmed for this shot
    if (selectedShot?.id && shotSettings.settings && 
        shotSettings.status === 'ready' && shotSettings.shotId === selectedShot.id) {
      console.log('[ShotSettingsInherit] 📝 Updating lastActiveShotSettingsRef for shot:', selectedShot.id.substring(0, 8));
      console.log('[ShotSettingsInherit] motionMode:', shotSettings.settings.motionMode);
      console.log('[ShotSettingsInherit] amountOfMotion:', shotSettings.settings.amountOfMotion);
      console.log('[ShotSettingsInherit] advancedMode:', shotSettings.settings.advancedMode);
      console.log('[ShotSettingsInherit] phaseConfig:', shotSettings.settings.phaseConfig ? 'HAS DATA' : 'NULL');
      console.log('[ShotSettingsInherit] steerableMotionSettings:', shotSettings.settings.steerableMotionSettings);
      lastActiveShotSettingsRef.current = shotSettings.settings;
    }
  }, [selectedShot?.id, shotSettings.settings, shotSettings.status, shotSettings.shotId]);

  // [VideoTravelDebug] Log the data loading states - reduced frequency
  if (videoRenderCount.current <= 5 || videoRenderCount.current % 10 === 0) {
    console.log(`${VIDEO_DEBUG_TAG} Data loading states:`, {
      shotsCount: shots?.length,
      shotsLoadingRaw,
      selectedProjectId,
      fromContext: 'useVideoTravelData->useShots(context)'
    });
  }

  // [VideoTravelDebug] Log what shots we're passing to ShotListDisplay - only once when shots first load
  const hasLoggedShots = useRef(false);
  React.useEffect(() => {
    if (shots && shots.length > 0 && !hasLoggedShots.current) {
      hasLoggedShots.current = true;
      console.log(`${VIDEO_DEBUG_TAG} === SHOTS BEING PASSED TO DISPLAY ===`, {
        shotsArrayLength: shots.length,
        querySource: 'useVideoTravelData->useShots()',
        timestamp: Date.now()
      });
      
      // [VideoTravelDebug] Log first 3 shots only to reduce noise
      shots.slice(0, 3).forEach((shot, index) => {
        console.log(`${VIDEO_DEBUG_TAG} Passing ${index}: ${shot.name} (ID: ${shot.id.substring(0, 8)}) - Position: ${shot.position}`);
      });
    }
  }, [shots]);

  // isLoading is computed after deep-link initialization guard is set
  
  // Unified shot creation hook - handles inheritance, events, lastAffected automatically
  const { createShot } = useShotCreation();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const updateShotNameMutation = useUpdateShotName();
  const addImageToShotMutation = useAddImageToShot();
  const deleteGenerationMutation = useDeleteGeneration();

  // =============================================================================
  // SETTINGS HANDLERS (extracted to useVideoTravelSettingsHandlers hook)
  // =============================================================================
  const {
    noOpCallback,
    handleVideoControlModeChange,
    handlePairConfigChange,
    handleBatchVideoPromptChange,
    handleBatchVideoFramesChange,
    handleBatchVideoStepsChange,
    handleTextBeforePromptsChange,
    handleTextAfterPromptsChange,
    handleBlurSave,
    handleEnhancePromptChange,
    handleTurboModeChange,
    handleSmoothContinuationsChange,
    handleAmountOfMotionChange,
    handleMotionModeChange,
    handleGenerationTypeModeChange,
    handleSteerableMotionSettingsChange,
    handlePhaseConfigChange,
    handlePhasePresetSelect,
    handlePhasePresetRemove,
    handleRestoreDefaults,
    handleGenerationModeChange,
    handleSelectedLorasChange,
  } = useVideoTravelSettingsHandlers({
    shotSettingsRef,
    currentShotId,
    selectedShot,
    updateShotMode,
  });

  // Dimension source handlers - local state, not persisted to shot settings
  const handleDimensionSourceChange = useCallback((source: 'project' | 'firstImage' | 'custom') => {
    setDimensionSource(source);
  }, []);

  const handleCustomWidthChange = useCallback((width?: number) => {
    setCustomWidth(width);
  }, []);

  const handleCustomHeightChange = useCallback((height?: number) => {
    setCustomHeight(height);
  }, []);

  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const [isCreatingShot, setIsCreatingShot] = useState(false);
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  
  // Skeleton setup functions from ShotListDisplay (for instant modal close)
  const skeletonSetupRef = useRef<((imageCount: number) => void) | null>(null);
  const skeletonClearRef = useRef<(() => void) | null>(null);
  const handleSkeletonSetupReady = useCallback((setup: (imageCount: number) => void, clear: () => void) => {
    skeletonSetupRef.current = setup;
    skeletonClearRef.current = clear;
  }, []);
  // const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  // const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  
  // Add ref for main container
  const mainContainerRef = useRef<HTMLDivElement>(null);
  
  // Use the shot navigation hook
  const { navigateToPreviousShot, navigateToNextShot, navigateToShot } = useShotNavigation();

  // Content-responsive breakpoints for dynamic layout
  const { isSm, isLg } = useContentResponsive();

  // Track hash changes for loading grace period
  // When navigating to a new hash, show loading for a brief period before showing "not found"
  const lastHashRef = useRef<string>('');
  const hashChangeTimeRef = useRef<number>(0);
  const [hashLoadingGrace, setHashLoadingGrace] = useState(false);

  // Extract and validate hash shot id once for reuse
  const hashShotId = useMemo(() => {
    const fromLocation = (location.hash?.replace('#', '') || '');
    if (fromLocation) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(fromLocation)) {
        return fromLocation;
      } else {
        console.warn('[VideoTravelToolPage] Invalid shot ID format in URL hash:', fromLocation);
        return '';
      }
    }
    if (typeof window !== 'undefined' && window.location?.hash) {
      const windowHash = window.location.hash.replace('#', '');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(windowHash)) {
        return windowHash;
      } else {
        console.warn('[VideoTravelToolPage] Invalid shot ID format in window hash:', windowHash);
        return '';
      }
    }
    return '';
  }, [location.hash]);

  // When hash changes to a new value, set a loading grace period
  // This handles the case where navigation state hasn't arrived yet
  useEffect(() => {
    if (hashShotId && hashShotId !== lastHashRef.current) {
      lastHashRef.current = hashShotId;
      hashChangeTimeRef.current = Date.now();
      setHashLoadingGrace(true);
    }
  }, [hashShotId]);

  // Clear grace period only when we have definitive information:
  // 1. Shot is found in cache, OR
  // 2. Shots have loaded AND isNewlyCreatedShot is false AND enough time has passed
  useEffect(() => {
    if (!hashLoadingGrace) return;
    
    // Case 1: Shot found in cache - clear immediately
    if (shots?.find(s => s.id === hashShotId)) {
      setHashLoadingGrace(false);
      return;
    }
    
    // Case 2: Shots have loaded, it's a newly created shot (state arrived), and shotFromState matches
    // In this case, shotToEdit should be populated via shotFromState
    if (isNewlyCreatedShot && shotFromState?.id === hashShotId) {
      setHashLoadingGrace(false);
      return;
    }
    
    // Case 3: Shots have loaded, NOT a newly created shot, and shot not found - it truly doesn't exist
    // Add a small delay to ensure we're not in a transient state
    const timeSinceHashChange = Date.now() - hashChangeTimeRef.current;
    if (shots && !shotsLoadingRaw && !isNewlyCreatedShot && timeSinceHashChange > 5000) {
      setHashLoadingGrace(false);
      return;
    }
  }, [hashLoadingGrace, shots, shotsLoadingRaw, hashShotId, isNewlyCreatedShot, shotFromState]);

  // Stabilize initial deep-link loading to avoid flicker when project resolves after mount
  const [initializingFromHash, setInitializingFromHash] = useState<boolean>(false);
  const initializingFromHashRef = useRef<boolean>(false);

  useEffect(() => {
    // When deep-linking to a shot, consider the page "initializing" until:
    // - a project is selected AND
    // - shots have begun and finished loading
    if (hashShotId) {
      const stillInitializing = !selectedProjectId || shotsLoadingRaw || !shots;
      // Only update state if the initializing status actually changed
      if (initializingFromHashRef.current !== stillInitializing) {
        initializingFromHashRef.current = stillInitializing;
        setInitializingFromHash(stillInitializing);
      }
    } else if (initializingFromHashRef.current) {
      initializingFromHashRef.current = false;
      setInitializingFromHash(false);
    }
  }, [hashShotId, selectedProjectId, shotsLoadingRaw, shots]);

  // CONSOLIDATED: Handle hash-based shot selection and project resolution in one effect
  // This prevents race conditions between multiple effects competing to set state
  useEffect(() => {
    if (!hashShotId) return;
    
    // Set current shot ID immediately if not already set
    if (!currentShotId) {
      setCurrentShotId(hashShotId);
    }
    
    // If we already have a project selected, we're done
    if (selectedProjectId) return;
    
    // Resolve project from shot when deep-linking
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('shots')
          .select('project_id')
          .eq('id', hashShotId)
          .single();
        
        if (error) {
          console.error('[VideoTravelToolPage] Error fetching shot:', error);
          // Shot doesn't exist or user doesn't have access - redirect to main view
          if (!cancelled) {
            console.log(`[VideoTravelToolPage] Shot ${hashShotId} not accessible, redirecting to main view`);
            navigate('/tools/travel-between-images', { replace: true });
          }
          return;
        }
        
        if (!cancelled && data?.project_id) {
          setSelectedProjectId(data.project_id);
        }
      } catch (err) {
        console.error('[VideoTravelToolPage] Unexpected error fetching shot:', err);
        if (!cancelled) {
          navigate('/tools/travel-between-images', { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [hashShotId, currentShotId, selectedProjectId, setSelectedProjectId, navigate, setCurrentShotId]);

  // Data fetching is now handled by the useVideoTravelData hook above
  
  // Final loading flag used by the page - memoized to prevent rapid changes
  // Track loading state changes to reduce logging noise
  const lastLoadingState = useRef<string>('');
  const isLoading = useMemo(() => {
    const loading = shotsLoadingRaw || initializingFromHash;
    // Only log loading decision changes, not every render
    const loadingStateKey = `${loading}-${shotsLoadingRaw}-${initializingFromHash}`;
    if (lastLoadingState.current !== loadingStateKey) {
      lastLoadingState.current = loadingStateKey;
      console.log(`${VIDEO_DEBUG_TAG} Final loading decision:`, {
        loading,
        shotsLoadingRaw,
        initializingFromHash
      });
    }
    return loading;
  }, [shotsLoadingRaw, initializingFromHash]);

  const {
    videoControlMode = 'batch',
    batchVideoPrompt = '',
    batchVideoFrames = 61, // Must be 4N+1 format for Wan model compatibility
    batchVideoSteps = 6,
    enhancePrompt = false,
    turboMode = false,
    amountOfMotion: rawAmountOfMotion,
    advancedMode = false,
    motionMode = 'basic',
    generationTypeMode = 'i2v', // I2V by default, switches to VACE when structure video is added
    smoothContinuations = false, // SVI for smoother transitions
    phaseConfig,
    selectedPhasePresetId,
    pairConfigs = [],
    generationMode: rawGenerationMode = 'timeline', // Default to 'timeline', inheritance will override if needed
    steerableMotionSettings = DEFAULT_STEERABLE_MOTION_SETTINGS,
    textBeforePrompts = '',
    textAfterPrompts = '',
    selectedLoras = [], // LoRAs now synced with all other settings
  } = shotSettings.settings || {};

  // [SmoothContinuationsDebug] Log the value to trace where it comes from
  console.log('[SmoothContinuationsDebug] Value from settings:', {
    smoothContinuations,
    rawFromSettings: shotSettings.settings?.smoothContinuations,
    shotId: shotSettings.shotId?.substring(0, 8),
    settingsStatus: shotSettings.status,
    timestamp: Date.now()
  });
  
  // CRITICAL: Ensure amountOfMotion has a valid default (destructuring default doesn't apply when value is explicitly undefined)
  const amountOfMotion = rawAmountOfMotion ?? 50;

  // [GenerationModeDebug] Track generationMode through its lifecycle
  // Use cached value during loading to prevent flash of wrong mode
  // CRITICAL: Use currentShotId (not selectedShot?.id) for cache lookup - it updates immediately on navigation
  const cachedGenerationMode = getShotGenerationMode(currentShotId ?? null);
  
  // [ShotNavDebug] RENDER-TIME logging to catch timing issues
  // Log values directly (not nested) so they're visible without expanding
  const shotNavDebugRef = useRef<string | null>(null);
  const shotJustChanged = currentShotId !== shotNavDebugRef.current;
  if (shotJustChanged) {
    console.log('[ShotNavDebug] 🔍 RENDER - shotId:', currentShotId?.substring(0, 8) || 'none',
      '| prevShotId:', shotNavDebugRef.current?.substring(0, 8) || 'none',
      '| selectedShotId:', selectedShot?.id?.substring(0, 8) || 'none',
      '| idsMatch:', currentShotId === selectedShot?.id);
    console.log('[ShotNavDebug] 🎯 MODE - cachedMode:', cachedGenerationMode,
      '| rawMode:', rawGenerationMode,
      '| settingsStatus:', shotSettings.status,
      '| settingsFor:', shotSettings.shotId?.substring(0, 8) || 'none');
    console.log('[ShotNavDebug] 📊 CACHE - videoCount:', getShotVideoCount(currentShotId),
      '| isLoadingCounts:', isLoadingProjectCounts,
      '| isLoadingModes:', isLoadingProjectModes,
      '| shotsInArray:', shots?.length ?? 0);
    shotNavDebugRef.current = currentShotId;
  }
  
  // CLEAN FIX: Use cached mode unless settings are ready AND confirmed for current shot
  // shotSettings.shotId tells us exactly which shot the settings are for (from useAutoSaveSettings)
  const settingsReadyForCurrentShot = 
    shotSettings.status === 'ready' && 
    shotSettings.shotId === currentShotId;
  
  const generationMode: 'batch' | 'timeline' | 'by-pair' = 
    settingsReadyForCurrentShot
      ? rawGenerationMode
      : (cachedGenerationMode ?? rawGenerationMode);
  React.useEffect(() => {
    if (selectedShot?.id) {
      console.log('[GenerationModeDebug] 🎯 MODE COMPARISON:', {
        shotId: selectedShot.id.substring(0, 8),
        shotName: selectedShot.name,
        effectiveMode: generationMode,
        rawFromSettings: rawGenerationMode,
        fromCache: cachedGenerationMode,
        settingsStatus: shotSettings.status,
        usingCache: shotSettings.status === 'loading' || shotSettings.status === 'idle',
        timestamp: Date.now()
      });
    }
  }, [selectedShot?.id, selectedShot?.name, generationMode, rawGenerationMode, cachedGenerationMode, shotSettings.status]);
  
  // Debug: Log amountOfMotion value to track if default is being applied
  React.useEffect(() => {
    if (rawAmountOfMotion === undefined || rawAmountOfMotion === null) {
      console.log('[AmountOfMotionDebug] ⚠️ rawAmountOfMotion was undefined/null, defaulted to 50:', {
        rawAmountOfMotion,
        amountOfMotion,
        shotId: selectedShot?.id?.substring(0, 8),
        motionMode,
        timestamp: Date.now()
      });
    }
  }, [rawAmountOfMotion, amountOfMotion, selectedShot?.id, motionMode]);
  
  // Debug: Log enhance_prompt value whenever it changes
  React.useEffect(() => {
    console.log('[EnhancePromptDebug] 🔍 Current enhancePrompt value from shotSettings:', {
      enhancePrompt,
      shotId: selectedShot?.id?.substring(0, 8),
      shotSettingsRaw: shotSettings.settings?.enhancePrompt,
      advancedMode,
      timestamp: Date.now()
    });
  }, [enhancePrompt, selectedShot?.id, shotSettings.settings?.enhancePrompt, advancedMode]);
  
  // These remain as local state (not persisted per-shot)
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>('firstImage');
  const [customWidth, setCustomWidth] = useState<number | undefined>(undefined);
  const [customHeight, setCustomHeight] = useState<number | undefined>(undefined);
  // DEPRECATED: videoPairConfigs removed - pair prompts now stored in shot_generations.metadata.pair_prompt
  
  // =============================================================================
  // VIEW MODE & FILTERS (extracted to useVideoTravelViewMode hook)
  // =============================================================================
  const persistShotSortMode = useCallback((mode: 'ordered' | 'newest' | 'oldest') => {
    updateProjectUISettings?.('project', { shotSortMode: mode });
  }, [updateProjectUISettings]);

  const {
    showVideosView,
    setShowVideosViewRaw,
    setViewMode,
    handleToggleVideosView,
    videosViewJustEnabled,
    setVideosViewJustEnabled,
    videoPage,
    setVideoPage,
    videoShotFilter,
    setVideoShotFilter,
    videoExcludePositioned,
    setVideoExcludePositioned,
    videoSearchTerm,
    setVideoSearchTerm,
    videoMediaTypeFilter,
    setVideoMediaTypeFilter,
    videoToolTypeFilter,
    setVideoToolTypeFilter,
    videoStarredOnly,
    setVideoStarredOnly,
    videoSortMode,
    setVideoSortMode,
    shotSearchQuery,
    setShotSearchQuery,
    clearSearch,
    isSearchOpen,
    setIsSearchOpen,
    handleSearchToggle,
    searchInputRef,
    shotSortMode,
    setShotSortMode,
  } = useVideoTravelViewMode({
    selectedProjectId,
    initialShotSortMode: projectUISettings?.shotSortMode,
    onShotSortModeChange: persistShotSortMode,
  });
  
  // Memoize create shot handler to prevent infinite loops in useVideoTravelHeader
  const handleCreateNewShot = useCallback(() => {
    setIsCreateShotModalOpen(true);
  }, []);
  
  // Filter shots based on search query
  const filteredShots = useMemo(() => {
    if (!shots || !shotSearchQuery.trim()) {
      return shots;
    }
    
    const query = shotSearchQuery.toLowerCase().trim();
    
    // First, try to match shot names
    const nameMatches = shots.filter(shot => 
      shot.name.toLowerCase().includes(query)
    );
    
    // If no shot name matches, search through generation parameters
    if (nameMatches.length === 0) {
      return shots.filter(shot => {
        return shot.images?.some(image => {
          // Search in metadata
          if (image.metadata) {
            const metadataStr = JSON.stringify(image.metadata).toLowerCase();
            if (metadataStr.includes(query)) return true;
          }
          
          // Search in params (if available via metadata or other fields)
          if ((image as any).params) {
            const paramsStr = JSON.stringify((image as any).params).toLowerCase();
            if (paramsStr.includes(query)) return true;
          }
          
          // Search in type field
          if (image.type && image.type.toLowerCase().includes(query)) {
            return true;
          }
          
          // Search in location field
          if (image.location && image.location.toLowerCase().includes(query)) {
            return true;
          }
          
          return false;
        });
      });
    } else {
      return nameMatches;
    }
  }, [shots, shotSearchQuery]);
  
  // Search state helpers
  const isSearchActive = useMemo(() => shotSearchQuery.trim().length > 0, [shotSearchQuery]);
  const hasNoSearchResults = isSearchActive && ((filteredShots?.length || 0) === 0);
  
  // Fetch all videos generated with travel-between-images tool type
  const { 
    data: videosData, 
    isLoading: videosLoading,
    isFetching: videosFetching,
    error: videosError 
  } = useGenerations(
    selectedProjectId, 
    videoPage, // page
    itemsPerPage, // limit
    showVideosView, // only enable when showing videos view
    {
      toolType: videoToolTypeFilter ? 'travel-between-images' : undefined,
      mediaType: videoMediaTypeFilter,
      shotId: videoShotFilter !== 'all' ? videoShotFilter : undefined,
      excludePositioned: videoExcludePositioned,
      starredOnly: videoStarredOnly,
      searchTerm: videoSearchTerm,
      sort: videoSortMode,
      includeChildren: false // Only show parent generations, not derived/child generations
    }
  );

  // [VideoSkeletonDebug] Log query state changes to understand skeleton logic
  React.useEffect(() => {
    const vd: any = videosData as any;
    console.log('[VideoSkeletonDebug] useGenerations state changed:', {
      showVideosView,
      videosLoading,
      videosFetching,
      hasVideosData: !!vd,
      videosDataTotal: vd?.total,
      videosDataItemsLength: vd?.items?.length,
      videosError: videosError?.message,
      timestamp: Date.now()
    });
  }, [showVideosView, videosLoading, videosFetching, videosData, videosError]);

  // Clear videosViewJustEnabled flag when data loads
  React.useEffect(() => {
    const vd: any = videosData as any;
    if (showVideosView && videosViewJustEnabled && vd?.items) {
      // Data has loaded, clear the flag
      setVideosViewJustEnabled(false);
      console.log('[VideoSkeletonDebug] Data loaded, clearing videosViewJustEnabled flag', {
        itemsCount: vd.items.length,
        videosDataTotal: vd.total,
        timestamp: Date.now()
      });
    }
  }, [showVideosView, videosViewJustEnabled, videosData]);
  
  // [VideoThumbnailIssue] Log what data we're passing to ImageGallery
  React.useEffect(() => {
    const vd: any = videosData as any;
    if (showVideosView && vd?.items) {
      console.log('[VideoThumbnailIssue] VideoTravelToolPage passing to ImageGallery:', {
        itemsCount: vd.items.length,
        sampleItems: vd.items.slice(0, 3).map((item: any) => ({
          id: item.id?.substring(0, 8),
          url: item.url?.substring(0, 50) + '...',
          thumbUrl: item.thumbUrl?.substring(0, 50) + '...',
          isVideo: item.isVideo,
          hasThumbnail: !!item.thumbUrl,
          urlEqualsThumbUrl: item.url === item.thumbUrl
        })),
        timestamp: Date.now()
      });
      
      // [VideoTravelAddToShot] Log shot associations for first 3 items
      console.log('[VideoTravelAddToShot] 📊 Sample items shot associations:', 
        vd.items.slice(0, 3).map((item: any) => ({
          id: item.id?.substring(0, 8),
          shot_id: item.shot_id?.substring(0, 8),
          position: item.position,
          all_shot_associations: item.all_shot_associations?.map((a: any) => ({
            shot_id: a.shot_id?.substring(0, 8),
            position: a.position
          }))
        }))
      );
    }
  }, [showVideosView, videosData]);
  
  // Memoize expensive computations
  const shouldShowShotEditor = useMemo(() => {
    // Only show editor if we actually have a valid shot to edit
    const shotExists = selectedShot || (viaShotClick && currentShotId && shots?.find(s => s.id === currentShotId));
    // Also check if we have a valid shot from hash
    const hashShotExists = hashShotId && shots?.find(s => s.id === hashShotId);
    // CRITICAL: Also check shotFromState for newly created shots that aren't in the cache yet
    const shotFromStateExists = viaShotClick && shotFromState && shotFromState.id === currentShotId;
    // ALSO: Show the section (with loading state) if this is a newly created shot waiting for cache
    // OR if we're in the hash loading grace period
    const result = !!(shotExists || hashShotExists || shotFromStateExists || isNewlyCreatedShot || hashLoadingGrace);
    console.log('[ShotNavPerf] 🎯 shouldShowShotEditor computed:', {
      result,
      shotExists: !!shotExists,
      hashShotExists: !!hashShotExists,
      shotFromStateExists: !!shotFromStateExists,
      isNewlyCreatedShot,
      hashLoadingGrace,
      selectedShotId: selectedShot?.id?.substring(0, 8) || 'none'
    });
    return result;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId, shotFromState, isNewlyCreatedShot, hashLoadingGrace]);
  
  const shotToEdit = useMemo(() => {
    // Priority 1: Use shotFromState for newly created shots (not in cache yet)
    // This ensures instant display when navigating from ShotsPane after creating a shot
    // Check against both currentShotId AND hashShotId since context might not have updated yet
    const shotFromStateMatches = shotFromState && (
      shotFromState.id === currentShotId || 
      shotFromState.id === hashShotId
    );
    
    if (viaShotClick && shotFromStateMatches) {
      return shotFromState as Shot;
    }
    // Priority 2: Use shot from hash if available in shots array
    if (hashShotId && shots) {
      const hashShot = shots.find(s => s.id === hashShotId);
      if (hashShot) {
        console.log('[ShotNavPerf] 📝 shotToEdit: Using hash shot', hashShot.name);
        return hashShot;
      }
    }
    // Priority 3: Use selectedShot or find from shots array
    const fallbackShot = selectedShot || (viaShotClick && currentShotId ? shots?.find(s => s.id === currentShotId) : null);
    console.log('[ShotNavPerf] 📝 shotToEdit: Using fallback shot', fallbackShot?.name || 'none');
    return fallbackShot;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId, shotFromState]);

  // Get pane widths for positioning floating elements
  const { 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isTasksPaneLocked, 
    tasksPaneWidth 
  } = usePanes();

  // Initialize video gallery thumbnail preloader (after dependencies are defined)
  const preloaderState = useVideoGalleryPreloader({
    selectedShot,
    shouldShowShotEditor
  });

  // [VideoTravelDebug] Log preloader state - only on significant changes
  const lastPreloaderState = useRef<string>('');
  React.useEffect(() => {
    if (selectedProjectId) {
      const currentState = `${preloaderState.isProcessingQueue}-${preloaderState.queueLength}-${preloaderState.cacheUtilization}`;
      if (lastPreloaderState.current !== currentState) {
        lastPreloaderState.current = currentState;
        console.log(`${VIDEO_DEBUG_TAG} Preloader state:`, {
          isProcessing: preloaderState.isProcessingQueue,
          queueLength: preloaderState.queueLength,
          cacheUtilization: `${preloaderState.preloadedProjectUrls}/${preloaderState.targetCacheSize} (${preloaderState.cacheUtilization}%)`,
          selectedProjectId
        });
      }
    }
  }, [preloaderState.isProcessingQueue, preloaderState.queueLength, preloaderState.cacheUtilization, selectedProjectId]);
  
  // Sort shots based on shotSortMode for navigation (respects Newest/Oldest toggle)
  const sortedShots = useMemo(() => {
    if (!shots) return shots;
    
    if (shotSortMode === 'newest') {
      return [...shots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else if (shotSortMode === 'oldest') {
      return [...shots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB; // Oldest first
      });
    } else {
      // 'ordered' mode - sort by position
      return [...shots].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
  }, [shots, shotSortMode]);
  
  // Calculate navigation state with memoization (uses sortedShots to respect sort order)
  const navigationState = useMemo(() => {
    const currentShotIndex = sortedShots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
    return {
      currentShotIndex,
      hasPrevious: currentShotIndex > 0,
      hasNext: currentShotIndex >= 0 && currentShotIndex < (sortedShots?.length ?? 0) - 1,
    };
  }, [sortedShots, selectedShot?.id]);
  // ------------------------------------------------------------------
  // URL Hash Synchronization (Combined Init + Sync)
  // ------------------------------------------------------------------
  useEffect(() => {
    
    if (isLoading || !shots) {
      return;
    }

    const hashShotId = location.hash?.replace('#', '') || '';

    // URL is the source of truth:
    // If we are on the tool root (no hash) but we still have a selected shot in state,
    // it means something navigated here without clearing selection (e.g. clicking a top-left
    // tool icon / nav item). Previously, the "sync hash to selection" logic below would
    // immediately re-add `#<shotId>` via replaceState, making it appear like navigation failed.
    //
    // In this case, treat "no hash" as "back to shot list" and clear selection.
    if (!hashShotId && selectedShot && !viaShotClick) {
      setCurrentShotId(null);
      return;
    }

    // Init: Try to select shot from hash if not already selected
    if (hashShotId && selectedShot?.id !== hashShotId) {
      const matchingShot = shots.find((s) => s.id === hashShotId);
      
      // FIX: Also check if we have the shot in navigation state (newly created)
      // This prevents redirecting away from a newly created shot before the cache updates
      const matchingShotFromState = shotFromState && shotFromState.id === hashShotId ? (shotFromState as Shot) : null;
      
      if (matchingShot || matchingShotFromState) {
        console.log('[ShotFilterAutoSelectIssue] Setting shot from hash/state:', hashShotId);
        // selectedShot is now derived from currentShotId + shots/shotFromState
        setCurrentShotId(hashShotId);
        // Return early to allow state update before sync
        return;
      } else {
        // Shot from hash doesn't exist - redirect to main view
        console.log(`[VideoTravelTool] Shot ${hashShotId} not found, redirecting to main view`);
        setCurrentShotId(null);
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
        return;
      }
    }

    // Sync: Update URL hash to match current selection
    const basePath = location.pathname + (location.search || '');

    if (selectedShot) {
      const desiredHash = `#${selectedShot.id}`;
      if (location.hash !== desiredHash) {
        window.history.replaceState(null, '', `${basePath}${desiredHash}`);
      }
    } else if (location.hash) {
      // Only clear hash if we are NOT in the middle of an optimistic update
      const isOptimisticUpdate = shotFromState && shotFromState.id === hashShotId;
      if (!isOptimisticUpdate) {
        window.history.replaceState(null, '', basePath);
      }
    }
  }, [
    isLoading,
    shots,
    selectedShot,
    viaShotClick,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    shotFromState,
    setCurrentShotId,
  ]);

  // If we have a hashShotId but shots have loaded and shot doesn't exist, redirect
  // Moved here to be before early returns
  useEffect(() => {
    // FIX: Don't redirect if we have valid shot data from state, even if not in shots array yet
    const shotFromStateValid = shotFromState && shotFromState.id === hashShotId;
    
    // FIX: Don't redirect if this is a newly created shot or in grace period - wait for cache to sync
    if (hashShotId && shots && !shots.find(s => s.id === hashShotId) && !shotFromStateValid && !isNewlyCreatedShot && !hashLoadingGrace) {
      console.log(`[VideoTravelToolPage] Hash shot ${hashShotId} not found in loaded shots, redirecting`);
      navigate('/tools/travel-between-images', { replace: true });
    }
  }, [hashShotId, shots, navigate, shotFromState, isNewlyCreatedShot, hashLoadingGrace]);

  // [NavPerf] Stop timers once the page mounts
  useEffect(() => {
    timeEnd('NavPerf', 'ClickLag:travel-between-images');
    timeEnd('NavPerf', 'PageLoad:/tools/travel-between-images');
  }, []);

  /* ------------------------------------------------------------------
     Handle rare case where no project is selected. We optimistically
     assume a project *will* be selected after context hydration and
     show a skeleton meanwhile. If, after a short delay, there is still
     no project we fall back to an error message.  */
  const [showProjectError, setShowProjectError] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) {
      const t = setTimeout(() => setShowProjectError(true), 1500);
      return () => clearTimeout(t);
    }
    // A project became available – reset flag
    setShowProjectError(false);
  }, [selectedProjectId]);

  // Header is now inline in the page content instead of using external hook
  // useVideoTravelHeader({ ... });

  // Auto-disable turbo mode when cloud generation is disabled
  // CRITICAL: Skip during settings loading or if settings aren't for current shot
  // to prevent race condition where loaded settings get immediately overwritten
  useEffect(() => {
    if (shotSettings.status !== 'ready' || shotSettings.shotId !== currentShotId) {
      return; // Don't auto-disable while settings are loading/idle or stale
    }

    if (!isCloudGenerationEnabled && turboMode) {
      console.log('[VideoTravelToolPage] Auto-disabling turbo mode - cloud generation is disabled');
      shotSettingsRef.current.updateField('turboMode', false);
    }
  }, [isCloudGenerationEnabled, turboMode, shotSettings.status, shotSettings.shotId, currentShotId]);

  // Auto-disable advanced mode when turbo mode is on
  // CRITICAL: Skip during settings loading or if settings aren't for current shot
  // to prevent race condition where loaded settings get immediately overwritten
  useEffect(() => {
    if (shotSettings.status !== 'ready' || shotSettings.shotId !== currentShotId) {
      return; // Don't auto-disable while settings are loading/idle or stale
    }

    if (turboMode && advancedMode) {
      console.log('[VideoTravelToolPage] Auto-disabling advanced mode - turbo mode is active');
      shotSettingsRef.current.updateFields({
        advancedMode: false,
        motionMode: 'basic'
      });
    }
  }, [turboMode, advancedMode, shotSettings.status, shotSettings.shotId, currentShotId]);

  // Memoize the selected shot update logic to prevent unnecessary re-renders
  // Note: selectedShotRef is already declared earlier in the component
  
  // Clear currentShotId if project changes or shot is removed from shots array
  // selectedShot is now derived, so we only need to manage the ID
  useEffect(() => {
    if (!selectedProjectId) {
      if (currentShotId) {
        console.log('[SelectorDebug] ⚠️ Clearing currentShotId - no selectedProjectId:', {
          currentShotId: currentShotId?.substring(0, 8),
        });
        setCurrentShotId(null);
      }
      return;
    }
    // If we have a currentShotId but it's not in the shots array (and not loading),
    // clear it - the shot was likely deleted
    if (currentShotId && !isLoading && shots !== undefined) {
      const shotStillExists = shots.find(s => s.id === currentShotId && s.project_id === selectedProjectId);
      // Also check shotFromState for newly created shots not yet in cache
      const inShotFromState = shotFromState && shotFromState.id === currentShotId;
      
      // [SelectorDebug] Log shot existence check
      console.log('[SelectorDebug] 🔍 Shot existence check:', {
        currentShotId: currentShotId?.substring(0, 8),
        shotStillExists: !!shotStillExists,
        inShotFromState: !!inShotFromState,
        shotsCount: shots?.length,
        willClear: !shotStillExists && !inShotFromState,
      });
      
      if (!shotStillExists && !inShotFromState) {
        console.log('[SelectorDebug] ⚠️ Clearing currentShotId - shot not found in shots array:', {
          currentShotId: currentShotId?.substring(0, 8),
          shotsInArray: shots?.map(s => s.id?.substring(0, 8)),
        });
        setCurrentShotId(null);
      }
    }
  }, [shots, selectedProjectId, isLoading, setCurrentShotId, currentShotId, shotFromState]);

  // Get full image data when editing a shot to avoid thumbnail limitation
  const contextImages = selectedShot?.images || [];
  
  console.log('[ShotNavPerf] 📦 Context images available:', {
    selectedShotId: selectedShot?.id?.substring(0, 8) || 'none',
    selectedShotName: selectedShot?.name || 'none',
    contextImagesCount: contextImages.length,
    hasSelectedShot: !!selectedShot,
    shotHasImagesProperty: selectedShot ? 'images' in selectedShot : false,
    timestamp: Date.now()
  });
  
  // [CachePrime] Prime the shot generations cache from ShotsContext for instant selector data.
  // This enables selectors to have data immediately when switching shots, eliminating
  // the need for dual-source fallback logic in components.
  usePrimeShotGenerationsCache(selectedShot?.id ?? null, contextImages);
  
  // STAGE 2: Track when shot operations are in progress to prevent query race conditions
  // This flag is set when mutations complete and cleared after a safe period
  // Prevents timeline position resets and "signal is aborted" errors
  const [isShotOperationInProgress, setIsShotOperationInProgress] = useState(false);
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track drag state to suppress query refetches during drag operations
  // This prevents the "AbortError" and lag caused by realtime invalidations during drag
  const [isDraggingInTimeline, setIsDraggingInTimeline] = useState(false);
  
  // Helper to signal that a shot operation has occurred
  // This is called after mutations complete to prevent immediate query refetch
  const signalShotOperation = useCallback(() => {
    console.log('[OperationTracking] Shot operation detected, disabling query refetch for 100ms');
    
    // Clear any existing timeout
    if (operationTimeoutRef.current) {
      clearTimeout(operationTimeoutRef.current);
    }
    
    // Set flag to disable query
    setIsShotOperationInProgress(true);
    
    // Clear flag after timeline has had time to complete position updates
    // 100ms is enough for React's batch updates + timeline's immediate state updates
    // Much faster than the previous 1000ms approach
    operationTimeoutRef.current = setTimeout(() => {
      console.log('[OperationTracking] Re-enabling query refetch after safe period');
      setIsShotOperationInProgress(false);
      operationTimeoutRef.current = null;
    }, 100);
  }, []);
  
  // STAGE 1: Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (operationTimeoutRef.current) {
        clearTimeout(operationTimeoutRef.current);
      }
    };
  }, []);
  
  // [REMOVED] shot-mutation-complete listener was dead code - event was never dispatched
  // React Query cache + optimistic updates handle cross-component synchronization
  
  // CRITICAL FIX: Use same logic as ShotEditor to prevent data inconsistency
  // Always load full data when in ShotEditor mode to ensure pair configs match generation logic
  const needsFullImageData = shouldShowShotEditor;
  console.log('[ShotNavPerf] 📸 Calling useAllShotGenerations', {
    needsFullImageData,
    shotId: selectedShot?.id?.substring(0, 8) || 'none',
    willFetch: needsFullImageData && !!selectedShot?.id
  });
  const fullImagesStart = Date.now();
  // Always call the hook to prevent hook order issues - the hook internally handles enabling/disabling
  const fullImagesQuery = useAllShotGenerations(
    needsFullImageData ? (selectedShot?.id || null) : null,
    {
      // Disable refetch during shot operations or drag to prevent race conditions
      // This fixes the "AbortError" and lag caused by realtime invalidations during drag
      disableRefetch: isShotOperationInProgress || isDraggingInTimeline
    }
  );
  const fullShotImages = fullImagesQuery.data || [];
  console.log('[ShotNavPerf] ✅ useAllShotGenerations returned in', Date.now() - fullImagesStart, 'ms', {
    imagesCount: fullShotImages.length,
    isShotOperationInProgress,
    queryState: {
      isLoading: fullImagesQuery.isLoading,
      isFetching: fullImagesQuery.isFetching,
      isError: fullImagesQuery.isError,
      error: fullImagesQuery.error?.message,
      dataStatus: fullImagesQuery.dataUpdatedAt ? 'has-data' : 'no-data',
      dataUpdatedAt: fullImagesQuery.dataUpdatedAt,
      fetchStatus: fullImagesQuery.fetchStatus
    }
  });
  
  // [REMOVED] shotImagesForCalculation was dead code (never used)
  // Cache priming now handles fast navigation; selectors read from primed cache

  // DEPRECATED: videoPairConfigs computation removed
  // Pair prompts are now stored directly in shot_generations.metadata.pair_prompt
  // and accessed via useEnhancedShotPositions hook

  // Clear any previously selected shot unless this navigation explicitly came from a shot click
  // OR if there's a hash in the URL (direct navigation to a specific shot)
  useEffect(() => {
    const hasHashShotId = !!location.hash?.replace('#', '');
    if (!viaShotClick && !hasHashShotId) {
      if (currentShotId) {
        setCurrentShotId(null);
      }
    }
    // We only want this to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety timeout: If we have a currentShotId but it never appears in shots array,
  // clear it and redirect (the shot may have been deleted)
  // selectedShot is now derived, so we only need to manage currentShotId
  useEffect(() => {
    // Only run safety check when navigating via shot click
    if (!viaShotClick || !currentShotId || !shots) {
      return;
    }

    // If shot exists in array or shotFromState, we're good
    const shotExists = shots.find(s => s.id === currentShotId);
    const inShotFromState = shotFromState && shotFromState.id === currentShotId;
    if (shotExists || inShotFromState) {
      return;
    }

    // Shot not found - wait a bit then redirect
    console.log(`[VideoTravelTool] Shot ${currentShotId} not found in shots array, waiting...`);
    const timeoutId = setTimeout(() => {
      // Re-check in case it appeared
      if (!shots.find(s => s.id === currentShotId)) {
        console.log(`[VideoTravelTool] Shot ${currentShotId} still not found after timeout, redirecting`);
        startTransition(() => {
          setCurrentShotId(null);
        });
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [currentShotId, shots, viaShotClick, navigate, location.pathname, setCurrentShotId, shotFromState]);

  // ============================================================================
  // ADD TO SHOT HANDLERS (extracted to useVideoTravelAddToShot hook)
  // ============================================================================
  const {
    targetShotInfo,
    handleAddVideoToTargetShot,
    handleAddVideoToTargetShotWithoutPosition,
  } = useVideoTravelAddToShot({
    selectedProjectId,
    shots,
    addImageToShotMutation,
    addImageToShotWithoutPositionMutation,
  });

  // ============================================================================
  // DELETE GENERATION HANDLER
  // ============================================================================
  const handleDeleteGeneration = useCallback(async (id: string) => {
    deleteGenerationMutation.mutate(id);
  }, [deleteGenerationMutation]);

  // ============================================================================
  // DROP HANDLERS FOR GENERATIONS FROM GENERATIONSPANE
  // (extracted to useVideoTravelDropHandlers hook)
  // ============================================================================
  const {
    handleGenerationDropOnShot,
    handleGenerationDropForNewShot,
    handleFilesDropForNewShot,
    handleFilesDropOnShot,
  } = useVideoTravelDropHandlers({
    selectedProjectId,
    shots,
    addImageToShotMutation,
    addImageToShotWithoutPositionMutation,
    handleExternalImageDropMutation,
    refetchShots,
    setShotSortMode,
  });

  const handleShotSelect = (shot: Shot) => {
    console.log('[ShotNavPerf] === SHOT CLICKED FROM LIST ===', {
      timestamp: Date.now(),
      shotId: shot.id.substring(0, 8),
      shotName: shot.name
    });
    // Reset videos view when selecting a shot
    setShowVideosViewRaw(false);
    // Jump to top immediately (no smooth scroll) so the shot opens "starting at top".
    navigateToShot(shot, { scrollBehavior: 'auto', scrollDelay: 0 });
  };

  // NOTE: The old "deselect if currentShotId cleared" effect is no longer needed
  // because selectedShot is now derived from currentShotId

  const handleBackToShotList = useCallback(() => {
    setCurrentShotId(null);
    // Reset videos view when going back to shot list
    setShowVideosViewRaw(false);
    // By replacing the current entry in the history stack, we effectively reset 
    // the 'fromShotClick' state without adding a new entry to the browser history.
    // This ensures that subsequent interactions with the shot list behave as if 
    // it's the first visit, resolving the "two-click" issue on mobile.
    navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
  }, [setCurrentShotId, setShowVideosViewRaw, navigate, location.pathname]);

  // Navigation handlers (use sortedShots to respect Newest/Oldest sort order)
  const handlePreviousShot = useCallback(() => {
    console.log('[ShotNavPerf] === PREVIOUS SHOT CLICKED ===', {
      timestamp: Date.now(),
      currentShotId: selectedShot?.id?.substring(0, 8),
      currentShotName: selectedShot?.name,
      sortMode: shotSortMode
    });
    if (sortedShots && selectedShot) {
      navigateToPreviousShot(sortedShots, selectedShot, { scrollToTop: true });
    }
  }, [sortedShots, selectedShot, navigateToPreviousShot, shotSortMode]);

  const handleNextShot = useCallback(() => {
    console.log('[ShotNavPerf] === NEXT SHOT CLICKED ===', {
      timestamp: Date.now(),
      currentShotId: selectedShot?.id?.substring(0, 8),
      currentShotName: selectedShot?.name,
      sortMode: shotSortMode
    });
    if (sortedShots && selectedShot) {
      navigateToNextShot(sortedShots, selectedShot, { scrollToTop: true });
    }
  }, [sortedShots, selectedShot, navigateToNextShot, shotSortMode]);

  // Navigation handlers that preserve scroll position (for sticky header)
  const handlePreviousShotNoScroll = useCallback(() => {
    if (sortedShots && selectedShot) {
      navigateToPreviousShot(sortedShots, selectedShot, { scrollToTop: false });
    }
  }, [sortedShots, selectedShot, navigateToPreviousShot]);

  const handleNextShotNoScroll = useCallback(() => {
    if (sortedShots && selectedShot) {
      navigateToNextShot(sortedShots, selectedShot, { scrollToTop: false });
    }
  }, [sortedShots, selectedShot, navigateToNextShot]);

  // Navigation state is now memoized above
  const { currentShotIndex, hasPrevious, hasNext } = navigationState;

  // Shot name update handler
  const handleUpdateShotName = useCallback((newName: string) => {
    if (selectedShot && selectedProjectId) {
      updateShotNameMutation.mutate({
        shotId: selectedShot.id,
        newName: newName,
        projectId: selectedProjectId,
      });
    }
  }, [selectedShot, selectedProjectId, updateShotNameMutation]);

  // shouldShowShotEditor and shotToEdit are now memoized above

  // Ensure currentShotId is set when shotToEdit is available (e.g., from hash or state)
  // This syncs the context with the derived shotToEdit
  useEffect(() => {
    if (shotToEdit && currentShotId !== shotToEdit.id) {
      console.log('[ShotNavPerf] ⚙️ Syncing currentShotId with shotToEdit', {
        shotToEditId: shotToEdit.id.substring(0, 8),
        shotToEditName: shotToEdit.name,
        previousCurrentShotId: currentShotId?.substring(0, 8) || 'none'
      });
      setCurrentShotId(shotToEdit.id);
    }
  }, [shotToEdit, currentShotId, setCurrentShotId]);

  const handleModalSubmitCreateShot = async (name: string, files: File[], aspectRatio: string | null) => {
    if (!selectedProjectId) {
      console.error("[VideoTravelToolPage] Cannot create shot: No project selected");
      return;
    }

    // Show skeleton immediately (modal will close right after this returns)
    // Even for empty shots (0 images), show skeleton so user sees immediate feedback
    const imageCount = files.length;
    if (skeletonSetupRef.current) {
      skeletonSetupRef.current(imageCount);
    }

    // Switch to "Newest First" so the new shot appears at the top
    setShotSortMode('newest');

    // Run creation in background (don't await - modal closes immediately)
    (async () => {
      setIsCreatingShot(true);
      try {
        // Use unified shot creation - handles inheritance, events, lastAffected automatically
        const result = await createShot({
          name,
          files: files.length > 0 ? files : undefined,
          aspectRatio: aspectRatio || undefined,
          // For the travel tool, we already drive the optimistic skeleton via refs
          // (and we want empty-shot skeletons too), so don't also dispatch global events.
          dispatchSkeletonEvents: false,
          onSuccess: async (creationResult) => {
            // Refetch shots to update the list
            await refetchShots();
          },
        });

        if (!result) {
          // Error already handled by useShotCreation, clear skeleton
          if (skeletonClearRef.current) {
            skeletonClearRef.current();
          }
          return;
        }

        console.log('[VideoTravelToolPage] Shot created via modal:', {
          shotId: result.shotId.substring(0, 8),
          shotName: result.shotName,
        });
        
        // Don't auto-navigate into the shot - user stays on shot list
      } catch (error) {
        console.error("[VideoTravelToolPage] Error creating shot:", error);
        toast.error(`Failed to create shot: ${(error as Error).message}`);
        // Clear skeleton on error
        if (skeletonClearRef.current) {
          skeletonClearRef.current();
        }
      } finally {
        setIsCreatingShot(false);
      }
    })();
  };

  const handleShotImagesUpdate = useCallback(async () => {
    if (selectedProjectId && selectedShot?.id) {
      // Invalidate both the main shots list (context) AND the detailed generations for this shot
      // This ensures all views (Timeline, ShotList, etc.) get fresh data
      invalidateGenerations(selectedShot.id, {
        reason: 'shot-operation-complete',
        scope: 'all',
        includeShots: true,
        projectId: selectedProjectId
      });
      
      // STAGE 2: Signal that a shot operation occurred
      // This prevents the shot-specific query from refetching immediately
      // Gives timeline time to complete position updates without interference
      signalShotOperation();
    }
  }, [selectedProjectId, selectedShot?.id, invalidateGenerations, signalShotOperation]);
  
  // Debug: Manual refresh function
  // const handleManualRefresh = () => {
  //   if (selectedProjectId) {
  //     console.log(`[ManualRefresh] Force refreshing shots data for project ${selectedProjectId}`);
  //     queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
  //     refetchShots();
  //   }
  // };

  // handleSteerableMotionSettingsChange - now provided by useVideoTravelSettingsHandlers hook

  // Memoize current settings to reduce effect runs


  // LoRA handlers removed - now managed directly in ShotEditor
  // const handleAddLora = (loraToAdd: LoraModel) => { ... };
  // const handleRemoveLora = (loraIdToRemove: string) => { ... };
  // const handleLoraStrengthChange = (loraId: string, newStrength: number) => { ... };

  // Stabilized skeleton visibility to avoid rapid flicker when multiple queries resolve at different times.
  const showStableSkeleton = useStableSkeletonVisibility(isLoading);

  if (!selectedProjectId) {
    if (showProjectError) {
      return <div className="p-4 text-center text-muted-foreground">Please select a project first.</div>;
    }
    // If deep-linked to a shot, show an editor-style skeleton instead of the main list skeleton
    if (hashShotId) {
      return <LoadingSkeleton type="editor" />;
    }
    // Otherwise show the main grid skeleton while the project hydrates
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  if (error) {
    return <div className="p-4">Error loading shots: {error.message}</div>;
  }

  // Show skeleton in different cases
  if (showStableSkeleton) {
    // If we have a hashShotId but shots are still loading, show editor skeleton
    if (hashShotId) {
      return <LoadingSkeleton type="editor" />;
    }
    // Otherwise show main list skeleton
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  return (
    <div ref={mainContainerRef} className="w-full">
      {!shouldShowShotEditor ? (
        <>
          {/* Shot List Header */}
          <VideoTravelListHeader
            viewMode={{
              showVideosView,
              setViewMode,
            }}
            search={{
              isMobile,
              isSearchOpen,
              setIsSearchOpen,
              handleSearchToggle,
              searchInputRef,
              shotSearchQuery,
              setShotSearchQuery,
              videoSearchTerm,
              setVideoSearchTerm,
              setVideoPage,
            }}
            sort={{
              showVideosView,
              shotSortMode,
              setShotSortMode,
              videoSortMode,
              setVideoSortMode,
              setVideoPage,
            }}
          />
          
          {/* Content Area */}
          {showVideosView ? (
            <VideoTravelVideosGallery
              query={{
                videosData,
                videosLoading,
                videosFetching,
                selectedProjectId,
                projectAspectRatio,
                itemsPerPage,
                shots,
              }}
              filters={{
                videoPage,
                setVideoPage,
                videoShotFilter,
                setVideoShotFilter,
                videoExcludePositioned,
                setVideoExcludePositioned,
                videoSearchTerm,
                setVideoSearchTerm,
                videoMediaTypeFilter,
                setVideoMediaTypeFilter,
                videoToolTypeFilter,
                setVideoToolTypeFilter,
                videoStarredOnly,
                setVideoStarredOnly,
              }}
              addToShot={{
                targetShotIdForButton: targetShotInfo.targetShotIdForButton,
                targetShotNameForButtonTooltip: targetShotInfo.targetShotNameForButtonTooltip,
                handleAddVideoToTargetShot,
                handleAddVideoToTargetShotWithoutPosition,
              }}
              deletion={{
                onDelete: handleDeleteGeneration,
                isDeleting: deleteGenerationMutation.isPending,
              }}
              videosViewJustEnabled={videosViewJustEnabled}
            />
          ) : (
            hasNoSearchResults ? (
              <div className="px-4 max-w-7xl mx-auto py-10 text-center text-muted-foreground">
                <p className="mb-4">No shots or parameters match your search.</p>
                <Button variant="outline" size="sm" onClick={clearSearch}>Clear search</Button>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto">
              <ShotListDisplay
                onSelectShot={handleShotSelect}
                onCreateNewShot={handleCreateNewShot}
                shots={filteredShots}
                sortMode={shotSortMode}
                onSortModeChange={setShotSortMode}
                onGenerationDropOnShot={handleGenerationDropOnShot}
                onGenerationDropForNewShot={handleGenerationDropForNewShot}
                onFilesDropForNewShot={handleFilesDropForNewShot}
                onFilesDropOnShot={handleFilesDropOnShot}
                onSkeletonSetupReady={handleSkeletonSetupReady}
              />
              </div>
            )
          )}
        </>
      ) : (
        // Show a loading state while settings or component are being fetched
        <div className="px-4 max-w-7xl mx-auto pt-4">
        <Suspense fallback={<LoadingSkeleton type="editor" />}>
          <PageFadeIn>
            {/* Only render ShotEditor if we have a valid shot to edit */}
            {shotToEdit ? (
              <>
                {console.log('[ShotNavPerf] 🎨 RENDERING ShotEditor for shot:', {
                  shotId: shotToEdit.id.substring(0, 8),
                  shotName: shotToEdit.name,
                  timestamp: Date.now()
                })}
              <ShotEditor
                selectedShotId={shotToEdit.id}
                projectId={selectedProjectId}
                optimisticShotData={isNewlyCreatedShot ? shotFromState : undefined}
              videoControlMode={videoControlMode}
              batchVideoPrompt={batchVideoPrompt}
              batchVideoFrames={batchVideoFrames}
              onShotImagesUpdate={handleShotImagesUpdate}
              onBack={handleBackToShotList}
              onVideoControlModeChange={handleVideoControlModeChange}
              onPairConfigChange={handlePairConfigChange}
              onBatchVideoPromptChange={handleBatchVideoPromptChange}
              textBeforePrompts={textBeforePrompts}
              onTextBeforePromptsChange={handleTextBeforePromptsChange}
              textAfterPrompts={textAfterPrompts}
              onTextAfterPromptsChange={handleTextAfterPromptsChange}
              onBatchVideoFramesChange={handleBatchVideoFramesChange}
              batchVideoSteps={batchVideoSteps}
              onBatchVideoStepsChange={handleBatchVideoStepsChange}
              dimensionSource={dimensionSource}
              onDimensionSourceChange={handleDimensionSourceChange}
              customWidth={customWidth}
              onCustomWidthChange={handleCustomWidthChange}
              customHeight={customHeight}
              onCustomHeightChange={handleCustomHeightChange}
              steerableMotionSettings={steerableMotionSettings}
              onSteerableMotionSettingsChange={handleSteerableMotionSettingsChange}
              onGenerateAllSegments={noOpCallback}
              // LoRAs now synced with all other settings
              availableLoras={availableLoras}
              selectedLoras={selectedLoras}
              onSelectedLorasChange={handleSelectedLorasChange}
              enhancePrompt={enhancePrompt}
              onEnhancePromptChange={handleEnhancePromptChange}
              turboMode={turboMode}
              onTurboModeChange={handleTurboModeChange}
              smoothContinuations={smoothContinuations}
              onSmoothContinuationsChange={handleSmoothContinuationsChange}
              amountOfMotion={amountOfMotion}
              onAmountOfMotionChange={handleAmountOfMotionChange}
              motionMode={motionMode}
              onMotionModeChange={handleMotionModeChange}
              generationTypeMode={generationTypeMode}
              onGenerationTypeModeChange={handleGenerationTypeModeChange}
              phaseConfig={phaseConfig}
              onPhaseConfigChange={handlePhaseConfigChange}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={handlePhasePresetSelect}
              onPhasePresetRemove={handlePhasePresetRemove}
              onBlurSave={handleBlurSave}
              onRestoreDefaults={handleRestoreDefaults}
              generationMode={generationMode === 'by-pair' ? 'batch' : generationMode}
              onGenerationModeChange={handleGenerationModeChange}

              onPreviousShot={handlePreviousShot}
              onNextShot={handleNextShot}
              onPreviousShotNoScroll={handlePreviousShotNoScroll}
              onNextShotNoScroll={handleNextShotNoScroll}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onUpdateShotName={handleUpdateShotName}
              settingsLoading={shotSettings.status !== 'ready' || shotSettings.shotId !== currentShotId}
              getShotVideoCount={getShotVideoCount}
              getFinalVideoCount={getFinalVideoCount}
              invalidateVideoCountsCache={invalidateOnVideoChanges}
              onDragStateChange={setIsDraggingInTimeline}
            />
              </>
            ) : (isNewlyCreatedShot || hashLoadingGrace) ? (
              // Show loading state for newly created shots or during hash navigation grace period
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading shot...</p>
                </div>
              </div>
            ) : (
              // Show error message when shot is not found
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">Shot not found</p>
                  <Button onClick={handleBackToShotList} variant="outline" size="sm">
                    Back to Shots
                  </Button>
                </div>
              </div>
            )}
          </PageFadeIn>
        </Suspense>
        </div>
      )}

      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={false} // Modal closes instantly, no loading state needed
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
        projectAspectRatio={projectAspectRatio}
        initialAspectRatio={null}
        projectId={selectedProjectId}
        cropToProjectSize={uploadSettings?.cropToProjectSize ?? true}
      />
      
    </div>
  );
};

export default VideoTravelToolPage; 