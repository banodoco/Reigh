import React, { useState, useEffect, useRef, Suspense, useMemo, useLayoutEffect, useCallback, startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';
import { useCreateShot, useHandleExternalImageDrop, useUpdateShotName } from '@/shared/hooks/useShots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Search, X } from 'lucide-react';
import { useProject } from "@/shared/contexts/ProjectContext";
import CreateShotModal from '@/shared/components/CreateShotModal';
import ShotListDisplay from '../components/ShotListDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings } from '../settings';
import { deepEqual, sanitizeSettings } from '@/shared/lib/deepEqual';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { PageFadeIn } from '@/shared/components/transitions';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { ToolPageHeader } from '@/shared/components/ToolPageHeader';
import { useToolPageHeader } from '@/shared/contexts/ToolPageHeaderContext';
import { useContentResponsive } from '@/shared/hooks/useContentResponsive';
import { timeEnd } from '@/shared/lib/logger';

import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
// import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import ShotEditor from '../components/ShotEditor';
import { useAllShotGenerations } from '@/shared/hooks/useShotGenerations';
import { useProjectVideoCountsCache } from '@/shared/hooks/useProjectVideoCountsCache';

import { useVideoGalleryPreloader } from '@/shared/hooks/useVideoGalleryPreloader';
import { useGenerations } from '@/shared/hooks/useGenerations';
import { ImageGalleryOptimized as ImageGallery } from '@/shared/components/ImageGallery';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

// Custom hook to parallelize data fetching for better performance
const useVideoTravelData = (selectedShotId?: string, projectId?: string) => {
  // Get shots data from context (single source of truth) - full data for ShotEditor
  const { shots, isLoading: shotsLoading, error: shotsError, refetchShots } = useShots();
  
  // Note: Removed limitedShots - ShotListDisplay now uses ShotsContext directly for consistency
  
  // Fetch public LoRAs data - always call this hook
  const publicLorasQuery = useListPublicResources('lora');
  
  // Always call these hooks but disable them when parameters are missing
  // This ensures consistent hook order between renders
  const toolSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { 
      shotId: selectedShotId || null, 
      enabled: !!selectedShotId 
    }
  );

  const projectSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { 
      projectId: projectId || null, 
      enabled: !!projectId 
    }
  );

  const projectUISettingsQuery = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: projectId || null, 
    enabled: !!projectId 
  });

  return {
    // Shots data
    shots, // Full shots data for both ShotEditor and ShotListDisplay (from context)
    // Expose raw loading flags; page can decide how to combine based on context
    shotsLoading,
    shotsError,
    refetchShots,
    
    // LoRAs data
    availableLoras: ((publicLorasQuery.data || []) as any[]).map(resource => resource.metadata || {}) as LoraModel[],
    lorasLoading: publicLorasQuery.isLoading,
    
    // Settings data
    settings: toolSettingsQuery.settings,
    updateSettings: toolSettingsQuery.update,
    settingsLoading: toolSettingsQuery.isLoading,
    settingsUpdating: toolSettingsQuery.isUpdating,

    // Project settings data
    projectSettings: projectSettingsQuery.settings,
    updateProjectSettings: projectSettingsQuery.update,
    projectSettingsLoading: projectSettingsQuery.isLoading,
    projectSettingsUpdating: projectSettingsQuery.isUpdating,

    // Project UI settings data
    projectUISettings: projectUISettingsQuery.settings,
  };
};

// ShotEditor is imported eagerly to avoid dynamic import issues on certain mobile browsers.

const VideoTravelToolPage: React.FC = () => {
  // [VideoTravelDebug] Reduced logging - only log first few renders and major milestones
  const VIDEO_DEBUG_TAG = '[VideoTravelDebug]';
  const videoRenderCount = useRef(0);
  const videoMountTime = useRef(Date.now());
  videoRenderCount.current += 1;
  
  // Only log first 5 renders and every 10th render after that to reduce noise
  if (videoRenderCount.current <= 5 || videoRenderCount.current % 10 === 0) {
    console.log(`${VIDEO_DEBUG_TAG} === RENDER START #${videoRenderCount.current} === ${Date.now() - videoMountTime.current}ms since mount`);
  }
  
  const navigate = useNavigate();
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const { selectedProjectId, setSelectedProjectId, projects } = useProject();
  
  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Get generation location settings to auto-disable turbo mode when not in cloud
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudGenerationEnabled = generationMethods.inCloud && !generationMethods.onComputer;
  
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  
  // Preload all shot video counts for the project
  const { getShotVideoCount, logCacheState, isLoading: isLoadingProjectCounts, error: projectCountsError, invalidateOnVideoChanges } = useProjectVideoCountsCache(selectedProjectId);
  
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
  const {
    shots,
    shotsLoading: shotsLoadingRaw,
    shotsError: error,
    refetchShots,
    availableLoras,
    lorasLoading,
    settings,
    updateSettings,
    settingsLoading: isLoadingSettings,
    settingsUpdating: isUpdating,
    projectSettings,
    updateProjectSettings,
    projectSettingsLoading,
    projectSettingsUpdating,
    projectUISettings
  } = useVideoTravelData(selectedShot?.id, selectedProjectId);

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
  
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const updateShotNameMutation = useUpdateShotName();

  // Memoized callbacks to prevent infinite re-renders
  const noOpCallback = useCallback(() => {}, []);
  
  const handleVideoControlModeChange = useCallback((mode: 'individual' | 'batch') => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setVideoControlMode(mode);
  }, []);

  const handlePairConfigChange = useCallback((pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setVideoPairConfigs(prev => prev.map(p => p.id === pairId ? { ...p, [field]: value } : p));
  }, []);

  const handleBatchVideoPromptChange = useCallback((prompt: string) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setBatchVideoPrompt(prompt);
  }, []);

  const handleBatchVideoFramesChange = useCallback((frames: number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setBatchVideoFrames(frames);
  }, []);

  const handleBatchVideoContextChange = useCallback((context: number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setBatchVideoContext(context);
  }, []);

  const handleBatchVideoStepsChange = useCallback((steps: number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setBatchVideoSteps(steps);
  }, []);

  const handleDimensionSourceChange = useCallback((source: 'project' | 'firstImage' | 'custom') => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setDimensionSource(source);
  }, []);

  const handleCustomWidthChange = useCallback((width?: number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setCustomWidth(width);
  }, []);

  const handleCustomHeightChange = useCallback((height?: number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setCustomHeight(height);
  }, []);

  const handleEnhancePromptChange = useCallback((enhance: boolean) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setEnhancePrompt(enhance);
  }, []);

  const handleTurboModeChange = useCallback((turbo: boolean) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setTurboMode(turbo);
  }, []);

  const handleAmountOfMotionChange = useCallback((motion: number) => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setAmountOfMotion(motion);
  }, []);

  const handleGenerationModeChange = useCallback((mode: 'batch' | 'timeline') => {
    if (!hasLoadedInitialSettings.current) return;
    userHasInteracted.current = true;
    setGenerationMode(mode);
  }, []);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const queryClient = useQueryClient();
  // const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot(); // Keep for later if needed
  // const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  // const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  const { setHeader, clearHeader } = useToolPageHeader();
  
  // Use the shot navigation hook
  const { navigateToPreviousShot, navigateToNextShot, navigateToShot } = useShotNavigation();

  // Content-responsive breakpoints for dynamic layout
  const { isSm, isLg } = useContentResponsive();

  // Add ref for main container to enable scroll-to-top functionality
  const mainContainerRef = useRef<HTMLDivElement>(null);

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

  // Add state for video generation settings - wait for settings to load before initializing
  const [videoControlMode, setVideoControlMode] = useState<'individual' | 'batch'>('batch');
  const [batchVideoPrompt, setBatchVideoPrompt] = useState('');
  const [batchVideoFrames, setBatchVideoFrames] = useState(60);
  const [batchVideoContext, setBatchVideoContext] = useState(10);
  const [batchVideoSteps, setBatchVideoSteps] = useState(4);
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>('firstImage');
  const [customWidth, setCustomWidth] = useState<number | undefined>(undefined);
  const [customHeight, setCustomHeight] = useState<number | undefined>(undefined);
  const [enhancePrompt, setEnhancePrompt] = useState<boolean>(false);
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [amountOfMotion, setAmountOfMotion] = useState<number>(50); // 0-100 range for UI, defaults to 50
  const [videoPairConfigs, setVideoPairConfigs] = useState<any[]>([]);
  const [pairConfigs, setPairConfigs] = useState<any[]>([]);
  // Mode selection removed - now hardcoded to use specific model
  // const [afterEachPromptText, setAfterEachPromptText] = useState<string>(''); // Removed - not used in ShotEditor

  const isMobile = useIsMobile();
  const [generationMode, setGenerationMode] = useState<'batch' | 'timeline'>(isMobile ? 'batch' : 'timeline');
  
  // Add state for toggling between shots and videos view
  const [showVideosView, setShowVideosView] = useState<boolean>(false);
  
  // Search functionality for shots
  const [shotSearchQuery, setShotSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Search helper functions
  const clearSearch = useCallback(() => {
    setShotSearchQuery('');
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
    error: videosError 
  } = useGenerations(
    selectedProjectId, 
    1, // page
    100, // limit
    showVideosView, // only enable when showing videos view
    {
      toolType: 'travel-between-images',
      mediaType: 'video'
    }
  );

  // [VideoThumbnailIssue] Log what data we're passing to ImageGallery
  React.useEffect(() => {
    if (showVideosView && videosData?.items) {
      console.log('[VideoThumbnailIssue] VideoTravelToolPage passing to ImageGallery:', {
        itemsCount: videosData.items.length,
        sampleItems: videosData.items.slice(0, 3).map(item => ({
          id: item.id?.substring(0, 8),
          url: item.url?.substring(0, 50) + '...',
          thumbUrl: item.thumbUrl?.substring(0, 50) + '...',
          isVideo: item.isVideo,
          hasThumbnail: !!item.thumbUrl,
          urlEqualsThumbUrl: item.url === item.thumbUrl
        })),
        timestamp: Date.now()
      });
    }
  }, [showVideosView, videosData?.items]);
  
  // Memoize expensive computations
  const shouldShowShotEditor = useMemo(() => {
    // Only show editor if we actually have a valid shot to edit
    const shotExists = selectedShot || (viaShotClick && currentShotId && shots?.find(s => s.id === currentShotId));
    // Also check if we have a valid shot from hash
    const hashShotExists = hashShotId && shots?.find(s => s.id === hashShotId);
    return !!(shotExists || hashShotExists);
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId]);
  
  const shotToEdit = useMemo(() => {
    if (hashShotId && shots) {
      const hashShot = shots.find(s => s.id === hashShotId);
      if (hashShot) {
        return hashShot;
      }
    }
    const fallbackShot = selectedShot || (viaShotClick && currentShotId ? shots?.find(s => s.id === currentShotId) : null);
    return fallbackShot;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId]);
  
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
  
  // Calculate navigation state with memoization
  const navigationState = useMemo(() => {
    const currentShotIndex = shots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
    return {
      currentShotIndex,
      hasPrevious: currentShotIndex > 0,
      hasNext: currentShotIndex >= 0 && currentShotIndex < (shots?.length ?? 0) - 1,
    };
  }, [shots, selectedShot?.id]);
  // ------------------------------------------------------------------
  // URL Hash Synchronization (Combined Init + Sync)
  // ------------------------------------------------------------------
  useEffect(() => {
    
    if (isLoading || !shots) {
      return;
    }

    const hashShotId = location.hash?.replace('#', '');

    // Init: Try to select shot from hash if not already selected
    if (hashShotId && selectedShot?.id !== hashShotId) {
      const matchingShot = shots.find((s) => s.id === hashShotId);
      if (matchingShot) {
        console.log('[ShotFilterAutoSelectIssue] Setting shot from hash:', hashShotId);
        setSelectedShot(matchingShot);
        setCurrentShotId(matchingShot.id);
        // Return early to allow state update before sync
        return;
      } else {
        // Shot from hash doesn't exist - redirect to main view
        console.log(`[VideoTravelTool] Shot ${hashShotId} not found, redirecting to main view`);
        setSelectedShot(null);
        setVideoPairConfigs([]);
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
      window.history.replaceState(null, '', basePath);
    }
  }, [isLoading, shots, selectedShot, location.pathname, location.search, location.hash, navigate]);
  
  const [steerableMotionSettings, setSteerableMotionSettings] = useState<SteerableMotionSettings>(DEFAULT_STEERABLE_MOTION_SETTINGS);

  const hasLoadedInitialSettings = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteracted = useRef(false);
  const lastSavedSettingsRef = useRef<VideoTravelSettings | null>(null);
  const isLoadingSettingsRef = useRef(false);
  
  // Update loading ref to stabilize callbacks
  isLoadingSettingsRef.current = isLoadingSettings;

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

  // Set up the page header with dynamic content based on state
  // Only show header when we're NOT viewing a specific shot
  useLayoutEffect(() => {
    if (shouldShowShotEditor || hashShotId) {
      // Clear header when viewing a specific shot
      clearHeader();
    } else {
      // Show header when in shot list or videos view
      const headerContent = (
        <div className="mb-2 sm:mb-4 mt-4 sm:mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-end gap-4">
              <h1 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl">
                {showVideosView ? 'Videos' : 'Shots'}
              </h1>
              <button
                onClick={(e) => {
                  setShowVideosView(!showVideosView);
                  // Clear search when switching views
                  if (!showVideosView) {
                    setShotSearchQuery('');
                  }
                  e.currentTarget.blur(); // Remove focus immediately after click
                }}
                className="text-sm text-muted-foreground hover:text-foreground focus:text-foreground transition-colors underline mb-1.5 focus:outline-none"
              >
                {showVideosView ? 'See all shots' : 'See all videos'}
              </button>
            </div>
            {/* Always reserve space for the button to maintain consistent layout */}
            <div className="flex items-center">
              {(!showVideosView && !isLoading && shots && shots.length > 0) && (
                <Button onClick={() => setIsCreateShotModalOpen(true)}>New Shot</Button>
              )}
            </div>
          </div>
          {/* Search box - only show when in shots view and there are shots */}
          {!showVideosView && shots && shots.length > 0 && (
            <div className="px-4">
              <div className="flex items-center space-x-2 border rounded-md px-3 py-1 h-8 bg-background w-full max-w-xs">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search shots..."
                  value={shotSearchQuery}
                  onChange={(e) => setShotSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-base flex-1"
                />
                {shotSearchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSearch}
                    className="h-auto p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      );
      setHeader(headerContent);
    }
    // Only clear header on component unmount, not on every effect re-run
  }, [setHeader, clearHeader, isLoading, shots, setIsCreateShotModalOpen, shouldShowShotEditor, hashShotId, showVideosView, shotSearchQuery, clearSearch]);

  // Clean up header on component unmount
  useLayoutEffect(() => {
    return () => clearHeader();
  }, []);

  // Update state when settings are loaded from database (or confirmed absent)
  // OPTIMIZATION: Use React.startTransition to batch state updates and reduce renders
  useEffect(() => {
    if (!isLoadingSettings && !hasLoadedInitialSettings.current) {
      hasLoadedInitialSettings.current = true;
      // Reset user interaction flag when loading new settings
      userHasInteracted.current = false;

      // Start from existing settings if present, otherwise empty defaults
      let settingsToApply: VideoTravelSettings = (settings as VideoTravelSettings) || ({} as VideoTravelSettings);

      // Check if this shot needs project defaults applied
      if (selectedShot?.id) {
        const projectDefaultsKey = `apply-project-defaults-${selectedShot.id}`;
        const storedProjectDefaults = sessionStorage.getItem(projectDefaultsKey);
        
        if (storedProjectDefaults) {
          try {
            const projectDefaults = JSON.parse(storedProjectDefaults);
            // Merge project defaults with any existing shot settings, with shot settings taking precedence
            settingsToApply = { ...(projectDefaults || {}), ...(settings || {}) } as VideoTravelSettings;
            
            // Apply the merged settings to the database
            setTimeout(() => {
              updateSettings('shot', settingsToApply);
              console.log('[VideoTravelToolPage] Applied project defaults to new shot:', selectedShot.id);
            }, 100);
            
            // Clean up the session storage
            sessionStorage.removeItem(projectDefaultsKey);
          } catch (error) {
            console.warn('[VideoTravelToolPage] Failed to parse stored project defaults:', error);
            settingsToApply = (settings as VideoTravelSettings) || ({} as VideoTravelSettings);
          }
        }
      }
      
      // CRITICAL FIX: Batch all state updates using startTransition to prevent cascade renders
      startTransition(() => {
        setVideoControlMode(settingsToApply.videoControlMode || 'batch');
        setBatchVideoPrompt(settingsToApply.batchVideoPrompt || '');
        setBatchVideoFrames(settingsToApply.batchVideoFrames || 60);
        setBatchVideoContext(settingsToApply.batchVideoContext || 10);
        setBatchVideoSteps(settingsToApply.batchVideoSteps || 4);
        setDimensionSource(settingsToApply.dimensionSource || 'firstImage');
        setCustomWidth(settingsToApply.customWidth);
        setCustomHeight(settingsToApply.customHeight);
        setEnhancePrompt(settingsToApply.enhancePrompt || false);
        setTurboMode(settingsToApply.turboMode || false);
        setAmountOfMotion(settingsToApply.amountOfMotion ?? 50); // Default to 50 if not present
        setVideoPairConfigs(settingsToApply.pairConfigs || []);
        setGenerationMode(settingsToApply.generationMode === 'by-pair' ? 'batch' : (settingsToApply.generationMode || 'batch'));
        setPairConfigs(settingsToApply.pairConfigs || []);
        // selectedMode removed - now hardcoded to use specific model
        setSteerableMotionSettings({
          ...(settingsToApply.steerableMotionSettings || DEFAULT_STEERABLE_MOTION_SETTINGS),
          apply_causvid: false // Force apply_causvid to false regardless of saved settings
        });
      });
    }
  }, [settings, isLoadingSettings, selectedShot?.id, updateSettings]);

  // Reset loaded flag when switching shots
  useEffect(() => {
    hasLoadedInitialSettings.current = false;
    userHasInteracted.current = false;
    lastSavedSettingsRef.current = null;
  }, [selectedShot?.id]);

  // Auto-disable turbo mode when not using cloud generation
  useEffect(() => {
    if (!isCloudGenerationEnabled && turboMode) {
      console.log('[VideoTravelToolPage] Auto-disabling turbo mode - not using cloud generation');
      setTurboMode(false);
      userHasInteracted.current = true; // Mark as user interaction to save the change
    }
  }, [isCloudGenerationEnabled, turboMode]);



  // Memoize the selected shot update logic to prevent unnecessary re-renders
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  
  useEffect(() => {
    if (!selectedProjectId) {
      if (selectedShotRef.current) {
        setSelectedShot(null);
        setVideoPairConfigs([]);
        setCurrentShotId(null);
      }
      return;
    }
    if (shots && selectedShotRef.current) {
      const updatedShotFromList = shots.find(s => s.id === selectedShotRef.current!.id && s.project_id === selectedProjectId);
      if (updatedShotFromList) {
        if (!deepEqual(selectedShotRef.current, updatedShotFromList)) {
          setSelectedShot(updatedShotFromList);
        }
      } else {
        setSelectedShot(null);
        setVideoPairConfigs([]);
        setCurrentShotId(null);
      }
    } else if (!isLoading && shots !== undefined && selectedShotRef.current) {
      setSelectedShot(null);
      setVideoPairConfigs([]);
      setCurrentShotId(null);
    }
  }, [shots, selectedProjectId, isLoading, setCurrentShotId]);

  // Get full image data when editing a shot to avoid thumbnail limitation
  const contextImages = selectedShot?.images || [];
  
  // CRITICAL FIX: Use same logic as ShotEditor to prevent data inconsistency
  // Always load full data when in ShotEditor mode to ensure pair configs match generation logic
  const needsFullImageData = shouldShowShotEditor;
  // Always call the hook to prevent hook order issues - the hook internally handles enabling/disabling
  const { data: fullShotImages = [] } = useAllShotGenerations(
    needsFullImageData ? (selectedShot?.id || null) : null
  );
  
  // Use full images if available AND needed, otherwise fall back to context images
  // This ensures consistency with ShotEditor's image selection logic
  const shotImagesForCalculation = needsFullImageData && fullShotImages.length > 0 ? fullShotImages : contextImages;

  // Memoize video pair configs calculation using full image data
  const computedVideoPairConfigs = useMemo(() => {
    if (shotImagesForCalculation && shotImagesForCalculation.length >= 2) {
      const nonVideoImages = shotImagesForCalculation.filter(img => !img.type?.includes('video'));
      if (nonVideoImages.length >= 2) {
        const pairs = [];
        for (let i = 0; i < nonVideoImages.length - 1; i++) {
          pairs.push({
            id: `${nonVideoImages[i].id}_${nonVideoImages[i + 1].id}`,
            imageA: nonVideoImages[i],
            imageB: nonVideoImages[i + 1],
            prompt: '',
            frames: 30,
            context: 10,
          });
        }
        return pairs;
      }
    }
    return [];
  }, [shotImagesForCalculation]);

  // Update videoPairConfigs when computed configs change
  // OPTIMIZATION: Use React.startTransition to prevent blocking renders
  const videoPairConfigsRef = useRef(videoPairConfigs);
  videoPairConfigsRef.current = videoPairConfigs;
  
  useEffect(() => {
    // Only update if the configs have actually changed to prevent infinite loops
    if (!deepEqual(videoPairConfigsRef.current, computedVideoPairConfigs)) {
      startTransition(() => {
        setVideoPairConfigs(computedVideoPairConfigs);
      });
    }
  }, [computedVideoPairConfigs]);

  // Clear any previously selected shot unless this navigation explicitly came from a shot click
  // OR if there's a hash in the URL (direct navigation to a specific shot)
  useEffect(() => {
    const hasHashShotId = !!location.hash?.replace('#', '');
    if (!viaShotClick && !hasHashShotId) {
      if (currentShotId) {
        setCurrentShotId(null);
      }
      if (selectedShot) {
        setSelectedShot(null);
        setVideoPairConfigs([]);
      }
    }
    // We only want this to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CONSOLIDATED: Handle shot selection logic in one effect to prevent race conditions
  useEffect(() => {
    // Only attempt to auto-select a shot if we navigated here via a shot click
    if (!viaShotClick) {
      return;
    }

    // Case 1: No current shot ID - clear selection
    if (!currentShotId) {
      if (selectedShot) {
        startTransition(() => {
          setSelectedShot(null);
          setVideoPairConfigs([]);
        });
      }
      return;
    }

    // Case 2: Wait for shots to load
    if (!shots) {
      return;
    }

    // Case 3: Only update if we need to select a different shot
    if (selectedShot?.id !== currentShotId) {
      const shotToSelect = shots.find(shot => shot.id === currentShotId);
      if (shotToSelect) {
        setSelectedShot(shotToSelect);
      } else {
        // Shot not found, redirect to main view
        console.log(`[VideoTravelTool] Shot ${currentShotId} not found, redirecting to main view`);
        startTransition(() => {
          setSelectedShot(null);
          setVideoPairConfigs([]);
          setCurrentShotId(null);
        });
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
      }
    }
  }, [currentShotId, shots, viaShotClick, navigate, location.pathname, selectedShot, setCurrentShotId]);

  const handleShotSelect = (shot: Shot) => {
    // Reset videos view when selecting a shot
    setShowVideosView(false);
    navigateToShot(shot);
  };

  // Deselect the current shot if the global currentShotId is cleared elsewhere (e.g., "See All")
  useEffect(() => {
    if (!currentShotId && selectedShot) {
      setSelectedShot(null);
      setVideoPairConfigs([]);
    }
  }, [currentShotId, selectedShot]);

  const handleBackToShotList = () => {
    setSelectedShot(null);
    setVideoPairConfigs([]);
    setCurrentShotId(null);
    // Reset videos view when going back to shot list
    setShowVideosView(false);
    // By replacing the current entry in the history stack, we effectively reset 
    // the 'fromShotClick' state without adding a new entry to the browser history.
    // This ensures that subsequent interactions with the shot list behave as if 
    // it's the first visit, resolving the "two-click" issue on mobile.
    navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
  };

  // Navigation handlers
  const handlePreviousShot = () => {
    if (shots && selectedShot) {
      navigateToPreviousShot(shots, selectedShot, { scrollToTop: false });
    }
  };

  const handleNextShot = () => {
    if (shots && selectedShot) {
      navigateToNextShot(shots, selectedShot, { scrollToTop: false });
    }
  };

  // Navigation handlers that preserve scroll position (for sticky header)
  const handlePreviousShotNoScroll = () => {
    if (shots && selectedShot) {
      navigateToPreviousShot(shots, selectedShot, { scrollToTop: false });
    }
  };

  const handleNextShotNoScroll = () => {
    if (shots && selectedShot) {
      navigateToNextShot(shots, selectedShot, { scrollToTop: false });
    }
  };

  // Navigation state is now memoized above
  const { currentShotIndex, hasPrevious, hasNext } = navigationState;

  // Shot name update handler
  const handleUpdateShotName = (newName: string) => {
    if (selectedShot && selectedProjectId) {
      updateShotNameMutation.mutate({
        shotId: selectedShot.id,
        newName: newName,
        projectId: selectedProjectId,
      });
    }
  };

  // shouldShowShotEditor and shotToEdit are now memoized above

  // Ensure selectedShot is set when shotToEdit is available
  useEffect(() => {
    if (shotToEdit && (!selectedShot || selectedShot.id !== shotToEdit.id)) {
      setSelectedShot(shotToEdit);
    }
  }, [shotToEdit, selectedShot]);

  const handleModalSubmitCreateShot = async (name: string, files: File[], dimensionSettings: { dimensionSource: 'project' | 'firstImage' | 'custom'; customWidth?: number; customHeight?: number; }) => {
    if (!selectedProjectId) {
      console.error("[VideoTravelToolPage] Cannot create shot: No project selected");
      return;
    }

    try {
      let newShot: Shot;
      
      if (files.length > 0) {
        // Use the multi-purpose hook if there are files
        const result = await handleExternalImageDropMutation.mutateAsync({
          imageFiles: files, 
          targetShotId: null, 
          currentProjectQueryKey: selectedProjectId, 
          currentShotCount: shots?.length ?? 0
        });
        
        if (result?.shotId) {
          // Refetch shots and use fresh query cache to locate the new shot
          await refetchShots();
          const updatedShots = queryClient.getQueryData<Shot[]>(['shots', selectedProjectId]);
          const createdShot = updatedShots?.find(s => s.id === result.shotId);
          if (createdShot) {
            newShot = createdShot;
          } else {
            throw new Error("Created shot not found after refetch");
          }
        } else {
          throw new Error("Failed to create shot with files");
        }
      } else {
        // Otherwise, just create an empty shot
        const result = await createShotMutation.mutateAsync({
          name,
          projectId: selectedProjectId,
        });
        
        // Transform the database response to match Shot interface
        newShot = {
          ...result.shot,
          images: [], // New shot starts with no images
          position: 0 // New shots start at position 0, will be updated by the backend
        } as Shot;
        
        // Refetch shots to update the list
        await refetchShots();
      }
      
      // Select the newly created shot
      setSelectedShot(newShot);
      setCurrentShotId(newShot.id);
      
      // Mark this shot as needing project defaults applied with dimension settings
      if (projectSettings || projectUISettings || dimensionSettings) {
        const defaultsToApply = {
          ...(projectSettings || {}),
          // Apply dimension settings
          dimensionSource: dimensionSettings.dimensionSource,
          customWidth: dimensionSettings.customWidth,
          customHeight: dimensionSettings.customHeight,
          // Include UI settings in a special key that will be handled separately
          _uiSettings: projectUISettings || {}
        };
        // Store the new shot ID to apply defaults when settings load
        sessionStorage.setItem(`apply-project-defaults-${newShot.id}`, JSON.stringify(defaultsToApply));
        
        // Save dimension settings to project settings for future shots
        if (selectedProjectId && updateProjectSettings) {
          updateProjectSettings('project', {
            dimensionSource: dimensionSettings.dimensionSource,
            customWidth: dimensionSettings.customWidth,
            customHeight: dimensionSettings.customHeight,
          });
        }
      }
      
      // Modal will auto-close on successful submission
    } catch (error) {
      console.error("[VideoTravelToolPage] Error creating shot:", error);
    }
  };

  const handleShotImagesUpdate = () => {
    if (selectedProjectId && selectedShot?.id) {
      // Invalidate and refetch the shots query to get updated data
      queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
    }
  };
  
  // Debug: Manual refresh function
  // const handleManualRefresh = () => {
  //   if (selectedProjectId) {
  //     console.log(`[ManualRefresh] Force refreshing shots data for project ${selectedProjectId}`);
  //     queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
  //     refetchShots();
  //   }
  // };

  const handleSteerableMotionSettingsChange = useCallback((settings: Partial<typeof steerableMotionSettings>) => {
    if (isLoadingSettingsRef.current) return;
    userHasInteracted.current = true;
    setSteerableMotionSettings(prev => ({
      ...prev,
      ...settings
    }));
  }, []);

  // Mode change handler removed - now hardcoded to use specific model

  // Memoize current settings to reduce effect runs
  const currentSettings = useMemo<VideoTravelSettings>(() => ({
    videoControlMode,
    batchVideoPrompt,
    batchVideoFrames,
    batchVideoContext,
    batchVideoSteps,
    dimensionSource,
    customWidth,
    customHeight,
    steerableMotionSettings,
    enhancePrompt,
    turboMode,
    amountOfMotion,
    generationMode,
    pairConfigs,
    // selectedMode removed - now hardcoded to use specific model
    // selectedLoras removed - now managed directly in ShotEditor
  }), [
          videoControlMode,
          batchVideoPrompt,
          batchVideoFrames,
          batchVideoContext,
          batchVideoSteps,
          dimensionSource,
          customWidth,
          customHeight,
          steerableMotionSettings,
          enhancePrompt,
          turboMode,
          amountOfMotion,
          generationMode,
          pairConfigs,
          // selectedMode removed - now hardcoded to use specific model
          // selectedLoras removed - now managed directly in ShotEditor
  ]);

  // Save settings to database whenever they change (optimized)
  useEffect(() => {
    if (selectedShot?.id && hasLoadedInitialSettings.current && userHasInteracted.current) {
      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Debounce the save
      saveTimeoutRef.current = setTimeout(() => {
        // Check if we just saved these exact settings
        if (lastSavedSettingsRef.current && deepEqual(sanitizeSettings(currentSettings), sanitizeSettings(lastSavedSettingsRef.current))) {          
          return;
        }

        if (!isUpdating && !deepEqual(sanitizeSettings(currentSettings), sanitizeSettings(settings))) {
          lastSavedSettingsRef.current = currentSettings;
          // Save to both shot and project levels
          updateSettings('shot', currentSettings);
          if (selectedProjectId && updateProjectSettings) {
            updateProjectSettings('project', currentSettings);
          }
        }
      }, 200); // Reduced wait time for better performance
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [selectedShot?.id, currentSettings, settings, updateSettings, isUpdating, selectedProjectId, updateProjectSettings]);

  // LoRA handlers removed - now managed directly in ShotEditor
  // const handleAddLora = (loraToAdd: LoraModel) => { ... };
  // const handleRemoveLora = (loraIdToRemove: string) => { ... };
  // const handleLoraStrengthChange = (loraId: string, newStrength: number) => { ... };

  // Stabilized skeleton visibility to avoid rapid flicker when multiple queries resolve at different times.
  const [showStableSkeleton, setShowStableSkeleton] = useState<boolean>(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const lastLoadingStateRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Only update skeleton state if loading state actually changed
    if (isLoading !== lastLoadingStateRef.current) {
      lastLoadingStateRef.current = isLoading;
      
      if (isLoading) {
        // Immediately show the skeleton when entering loading
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        setShowStableSkeleton(true);
      } else {
        // Delay hiding slightly to prevent rapid toggle flicker
        hideTimeoutRef.current = window.setTimeout(() => {
          setShowStableSkeleton(false);
          hideTimeoutRef.current = null;
        }, 120);
      }
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [isLoading]);

  if (!selectedProjectId) {
    if (showProjectError) {
      return <div className="p-4 text-center text-muted-foreground">Please select a project first.</div>;
    }
    // If deep-linked to a shot, show an editor-style skeleton instead of the main list skeleton
    if (hashShotId) {
      return (
        <PageFadeIn className="pt-3 sm:pt-5">
          <div className="flex flex-col space-y-4 pb-16">
            <div className="flex-shrink-0 space-y-1 sm:space-y-3 pb-2">
              {/* Desktop skeleton - centered shot name navigation */}
              <div className="hidden sm:flex justify-center items-center gap-y-2 px-2">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-12 w-64" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
              
              {/* Mobile skeleton - centered shot name navigation only */}
              <div className="sm:hidden flex justify-center px-2">
                <div className="flex items-center space-x-1">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
            </div>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </PageFadeIn>
      );
    }
    // Otherwise show the main grid skeleton while the project hydrates
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="p-4">Error loading shots: {error.message}</div>;
  }

  // Show skeleton in different cases
  if (showStableSkeleton) {
    // If we have a hashShotId but shots are still loading, show editor skeleton
    if (hashShotId) {
      return (
        <PageFadeIn className="pt-3 sm:pt-5">
          <div className="flex flex-col space-y-4 pb-16">
            <div className="flex-shrink-0 space-y-1 sm:space-y-3 pb-2">
              {/* Desktop skeleton - centered shot name navigation */}
              <div className="hidden sm:flex justify-center items-center gap-y-2 px-2">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-12 w-64" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
              
              {/* Mobile skeleton - centered shot name navigation only */}
              <div className="sm:hidden flex justify-center px-2">
                <div className="flex items-center space-x-1">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
            </div>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </PageFadeIn>
      );
    }
    // Otherwise show main list skeleton
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  // If we have a hashShotId but shots have loaded and shot doesn't exist, redirect
  if (hashShotId && shots && !shots.find(s => s.id === hashShotId)) {
    // Shots have loaded but the hashShotId doesn't exist - redirect to main view
    console.log(`[VideoTravelToolPage] Hash shot ${hashShotId} not found in loaded shots, redirecting`);
    navigate('/tools/travel-between-images', { replace: true });
    return null;
  }

  return (
    <div ref={mainContainerRef} className="w-full">
      {!shouldShowShotEditor ? (
        <>
          {showVideosView ? (
            // Show SkeletonGallery when loading videos or when no data yet
            (!selectedProjectId || (videosLoading && (!videosData?.items || videosData.items.length === 0))) ? (
              <div className="px-4 pb-2">
                <SkeletonGallery
                  count={12}
                  columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 3, '2xl': 3 }}
                  showControls={true}
                  projectAspectRatio={projectAspectRatio}
                />
              </div>
            ) : (
              <div className="px-4 pb-2">
                <ImageGallery
                  images={videosData?.items || []}
                  allShots={shots || []}
                  onAddToLastShot={async () => false} // No-op for video gallery
                  onAddToLastShotWithoutPosition={async () => false} // No-op for video gallery
                  currentToolType="travel-between-images"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  currentToolTypeName="Travel Between Images"
                  showShotFilter={true}
                  initialShotFilter="all"
                  columnsPerRow={3}
                  itemsPerPage={12}
                />
              </div>
            )
          ) : (
            hasNoSearchResults ? (
              <div className="px-4 py-10 text-center text-muted-foreground">
                <p className="mb-4">No shots or parameters match your search.</p>
                <Button variant="outline" size="sm" onClick={clearSearch}>Clear search</Button>
              </div>
            ) : (
              <ShotListDisplay
                onSelectShot={handleShotSelect}
                onCreateNewShot={() => setIsCreateShotModalOpen(true)}
                shots={filteredShots}
              />
            )
          )}
        </>
      ) : (
        // Show a loading state while settings or component are being fetched
        <Suspense fallback={
          <PageFadeIn className="pt-3 sm:pt-5">
            <div className="flex flex-col space-y-4 pb-16">
              <div className="flex-shrink-0 space-y-1 sm:space-y-3 pb-2">
                {/* Desktop skeleton - centered shot name navigation */}
                <div className="hidden sm:flex justify-center items-center gap-y-2 px-2">
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-12 w-64" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
                
                {/* Mobile skeleton - centered shot name navigation only */}
                <div className="sm:hidden flex justify-center px-2">
                  <div className="flex items-center space-x-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </PageFadeIn>
        }>
          <PageFadeIn className="pt-3 sm:pt-5">
            {/* Only render ShotEditor if we have a valid shot to edit */}
            {shotToEdit ? (
              <ShotEditor
                selectedShotId={shotToEdit.id}
                projectId={selectedProjectId}
              videoPairConfigs={videoPairConfigs}
              videoControlMode={videoControlMode}
              batchVideoPrompt={batchVideoPrompt}
              batchVideoFrames={batchVideoFrames}
              batchVideoContext={batchVideoContext}
              onShotImagesUpdate={handleShotImagesUpdate}
              onBack={handleBackToShotList}
              onVideoControlModeChange={handleVideoControlModeChange}
              onPairConfigChange={handlePairConfigChange}
              onBatchVideoPromptChange={handleBatchVideoPromptChange}
              onBatchVideoFramesChange={handleBatchVideoFramesChange}
              onBatchVideoContextChange={handleBatchVideoContextChange}
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
              // LoRA props removed - now managed internally by ShotEditor
              availableLoras={availableLoras}
              enhancePrompt={enhancePrompt}
              onEnhancePromptChange={handleEnhancePromptChange}
              turboMode={turboMode}
              onTurboModeChange={handleTurboModeChange}
              amountOfMotion={amountOfMotion}
              onAmountOfMotionChange={handleAmountOfMotionChange}
              generationMode={generationMode}
              onGenerationModeChange={handleGenerationModeChange}

              onPreviousShot={handlePreviousShot}
              onNextShot={handleNextShot}
              onPreviousShotNoScroll={handlePreviousShotNoScroll}
              onNextShotNoScroll={handleNextShotNoScroll}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onUpdateShotName={handleUpdateShotName}
              settingsLoading={isLoadingSettings}
              getShotVideoCount={getShotVideoCount}
              invalidateVideoCountsCache={invalidateOnVideoChanges}
              // afterEachPromptText props removed - not in ShotEditorProps interface
            />
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
      )}

      <CreateShotModal 
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
        projectAspectRatio={projectAspectRatio}
        initialDimensionSettings={{
          dimensionSource: projectSettings?.dimensionSource || 'project',
          customWidth: projectSettings?.customWidth,
          customHeight: projectSettings?.customHeight,
        }}
      />
    </div>
  );
};

export default VideoTravelToolPage; 