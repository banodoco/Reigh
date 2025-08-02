import React, { useState, useEffect, useRef, Suspense, useMemo, useLayoutEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SteerableMotionSettings } from '../components/ShotEditor';
import { useCreateShot, useHandleExternalImageDrop, useUpdateShotName } from '@/shared/hooks/useShots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
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
import { PageFadeIn } from '@/shared/components/transitions';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { ToolPageHeader } from '@/shared/components/ToolPageHeader';
import { useToolPageHeader } from '@/shared/contexts/ToolPageHeaderContext';
import { useContentResponsive, useContentResponsiveColumns } from '@/shared/hooks/useContentResponsive';
import { timeEnd } from '@/shared/lib/logger';

import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
// import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import ShotEditor from '../components/ShotEditor';

// Custom hook to parallelize data fetching for better performance
const useVideoTravelData = (selectedShotId?: string, projectId?: string) => {
  // Get shots data from context (single source of truth)
  const { shots, isLoading: shotsLoading, error: shotsError, refetchShots } = useShots();
  
  // Fetch public LoRAs data
  const publicLorasQuery = useListPublicResources('lora');
  
  // Fetch tool settings only when we have a selected shot
  const toolSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { shotId: selectedShotId, enabled: !!selectedShotId }
  );

  // Fetch project-level settings for defaults and saving
  const projectSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { projectId: projectId, enabled: !!projectId }
  );

  // Fetch project-level UI settings for defaults
  const projectUISettingsQuery = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: projectId, 
    enabled: !!projectId 
  });

  return {
    // Shots data
    shots,
    shotsLoading,
    shotsError,
    refetchShots,
    
    // LoRAs data
    availableLoras: (publicLorasQuery.data?.map(resource => resource.metadata) || []) as LoraModel[],
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
  const navigate = useNavigate();
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const { selectedProjectId } = useProject();
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  
  // Task queue notifier is now handled inside ShotEditor component
  
  // Use parallelized data fetching for better performance
  const {
    shots,
    shotsLoading: isLoading,
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
  
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const updateShotNameMutation = useUpdateShotName();

  // Memoized callbacks to prevent infinite re-renders
  const noOpCallback = useCallback(() => {}, []);
  
  const handleVideoControlModeChange = useCallback((mode: 'individual' | 'batch') => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setVideoControlMode(mode);
  }, [isLoadingSettings]);

  const handlePairConfigChange = useCallback((pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setVideoPairConfigs(prev => prev.map(p => p.id === pairId ? { ...p, [field]: value } : p));
  }, [isLoadingSettings]);

  const handleBatchVideoPromptChange = useCallback((prompt: string) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setBatchVideoPrompt(prompt);
  }, [isLoadingSettings]);

  const handleBatchVideoFramesChange = useCallback((frames: number) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setBatchVideoFrames(frames);
  }, [isLoadingSettings]);

  const handleBatchVideoContextChange = useCallback((context: number) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setBatchVideoContext(context);
  }, [isLoadingSettings]);

  const handleBatchVideoStepsChange = useCallback((steps: number) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setBatchVideoSteps(steps);
  }, [isLoadingSettings]);

  const handleDimensionSourceChange = useCallback((source: 'project' | 'firstImage' | 'custom') => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setDimensionSource(source);
  }, [isLoadingSettings]);

  const handleCustomWidthChange = useCallback((width?: number) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setCustomWidth(width);
  }, [isLoadingSettings]);

  const handleCustomHeightChange = useCallback((height?: number) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setCustomHeight(height);
  }, [isLoadingSettings]);

  const handleEnhancePromptChange = useCallback((enhance: boolean) => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setEnhancePrompt(enhance);
  }, [isLoadingSettings]);

  const handleGenerationModeChange = useCallback((mode: 'batch' | 'timeline') => {
    if (isLoadingSettings) return;
    userHasInteracted.current = true;
    setGenerationMode(mode);
  }, [isLoadingSettings]);
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
  const skeletonGridCols = useContentResponsiveColumns({
    base: 1,
    md: 2,
    lg: 3,
  });

  // Add ref for main container to enable scroll-to-top functionality
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Data fetching is now handled by the useVideoTravelData hook above
  
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
  const [videoPairConfigs, setVideoPairConfigs] = useState<any[]>([]);
  const [generationMode, setGenerationMode] = useState<'batch' | 'timeline'>('batch');
  const [pairConfigs, setPairConfigs] = useState<any[]>([]);
  // const [afterEachPromptText, setAfterEachPromptText] = useState<string>(''); // Removed - not used in ShotEditor
  
  // Memoize expensive computations
  const shouldShowShotEditor = useMemo(() => {
    // Check if we have a hash in the URL (direct navigation to a shot)
    const hashShotId = location.hash?.replace('#', '');
    
    if (hashShotId && !isLoading && shots) {
      // Only show editor if the hash shot actually exists
      const hashShot = shots.find(s => s.id === hashShotId);
      return !!hashShot;
    }
    
    // Only show editor if we actually have a shot to edit
    const shotExists = selectedShot || (viaShotClick && currentShotId && shots?.find(s => s.id === currentShotId));
    
    const result = !!shotExists;
    return result;
  }, [selectedShot, viaShotClick, currentShotId, shots, location.hash, isLoading]);
  
  const shotToEdit = useMemo(() => {
    // Check if we have a hash in the URL
    const hashShotId = location.hash?.replace('#', '');
    
    if (hashShotId && shots) {
      const hashShot = shots.find(s => s.id === hashShotId);
      if (hashShot) {
        return hashShot;
      }
    }
    
    const fallbackShot = selectedShot || (viaShotClick && currentShotId ? shots?.find(s => s.id === currentShotId) : null);
    return fallbackShot;
  }, [selectedShot, viaShotClick, currentShotId, shots, location.hash]);
  
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
  
  const [steerableMotionSettings, setSteerableMotionSettings] = useState<SteerableMotionSettings>({
    negative_prompt: '',
    model_name: 'vace_14B',
    seed: 789,
    debug: true,
    apply_reward_lora: false,
    colour_match_videos: true,
    apply_causvid: true,
    use_lighti2x_lora: false,
    fade_in_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
    fade_out_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
    after_first_post_generation_saturation: 1,
    after_first_post_generation_brightness: 0,
    show_input_images: false,
  });

  const hasLoadedInitialSettings = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteracted = useRef(false);
  const lastSavedSettingsRef = useRef<VideoTravelSettings | null>(null);

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
    if (shouldShowShotEditor) {
      // Clear header when viewing a specific shot
      clearHeader();
    } else {
      // Show header when in shot list view
      const headerContent = (
        <div className="flex items-center justify-between">
          <ToolPageHeader title="Travel Between Images" />
          {/* Only show header button when there are shots */}
          {(!isLoading && shots && shots.length > 0) && (
            <Button onClick={() => setIsCreateShotModalOpen(true)}>New Shot</Button>
          )}
        </div>
      );
      setHeader(headerContent);
    }
    // Only clear header on component unmount, not on every effect re-run
  }, [setHeader, isLoading, shots, setIsCreateShotModalOpen, shouldShowShotEditor]);

  // Clean up header on component unmount
  useLayoutEffect(() => {
    return () => clearHeader();
  }, []);

  // Update state when settings are loaded from database
  useEffect(() => {
    if (settings && !isLoadingSettings && !hasLoadedInitialSettings.current) {
      hasLoadedInitialSettings.current = true;
      // Reset user interaction flag when loading new settings
      userHasInteracted.current = false;
      
      // Check if this shot needs project defaults applied
      let settingsToApply = settings;
      if (selectedShot?.id) {
        const projectDefaultsKey = `apply-project-defaults-${selectedShot.id}`;
        const storedProjectDefaults = sessionStorage.getItem(projectDefaultsKey);
        
        if (storedProjectDefaults) {
          try {
            const projectDefaults = JSON.parse(storedProjectDefaults);
            // Merge project defaults with any existing shot settings, with shot settings taking precedence
            settingsToApply = { ...projectDefaults, ...settings };
            
            // Apply the merged settings to the database
            setTimeout(() => {
              updateSettings('shot', settingsToApply);
              console.log('[VideoTravelToolPage] Applied project defaults to new shot:', selectedShot.id);
            }, 100);
            
            // Clean up the session storage
            sessionStorage.removeItem(projectDefaultsKey);
          } catch (error) {
            console.warn('[VideoTravelToolPage] Failed to parse stored project defaults:', error);
            settingsToApply = settings;
          }
        }
      }
      
      setVideoControlMode(settingsToApply.videoControlMode || 'batch');
      setBatchVideoPrompt(settingsToApply.batchVideoPrompt || '');
      setBatchVideoFrames(settingsToApply.batchVideoFrames || 60);
      setBatchVideoContext(settingsToApply.batchVideoContext || 10);
      setBatchVideoSteps(settingsToApply.batchVideoSteps || 4);
      setDimensionSource(settingsToApply.dimensionSource || 'firstImage');
      setCustomWidth(settingsToApply.customWidth);
      setCustomHeight(settingsToApply.customHeight);
      setEnhancePrompt(settingsToApply.enhancePrompt || false);
      setVideoPairConfigs(settingsToApply.pairConfigs || []);
      setGenerationMode(settingsToApply.generationMode === 'by-pair' ? 'batch' : (settingsToApply.generationMode || 'batch'));
      setPairConfigs(settingsToApply.pairConfigs || []);
      setSteerableMotionSettings(settingsToApply.steerableMotionSettings || {
    negative_prompt: '',
    model_name: 'vace_14B',
    seed: 789,
    debug: true,
    apply_reward_lora: false,
    colour_match_videos: true,
    apply_causvid: true,
    use_lighti2x_lora: false,
    fade_in_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
    fade_out_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
    after_first_post_generation_saturation: 1,
    after_first_post_generation_brightness: 0,
    show_input_images: false,
  });
    }
  }, [settings, isLoadingSettings, selectedShot?.id, updateSettings]);

  // Reset loaded flag when switching shots
  useEffect(() => {
    hasLoadedInitialSettings.current = false;
    userHasInteracted.current = false;
    lastSavedSettingsRef.current = null;
  }, [selectedShot?.id]);



  useEffect(() => {
    if (!selectedProjectId) {
      if (selectedShot) {
        setSelectedShot(null);
        setVideoPairConfigs([]);
        setCurrentShotId(null);
      }
      return;
    }
    if (shots) {
      if (selectedShot) {
        const updatedShotFromList = shots.find(s => s.id === selectedShot.id && s.project_id === selectedProjectId);
        if (updatedShotFromList) {
          if (JSON.stringify(selectedShot) !== JSON.stringify(updatedShotFromList)) {
            setSelectedShot(updatedShotFromList);
          }
        } else {
          setSelectedShot(null);
          setVideoPairConfigs([]);
          setCurrentShotId(null);
        }
      }
    } else if (!isLoading && selectedShot) {
      setSelectedShot(null);
      setVideoPairConfigs([]);
      setCurrentShotId(null);
    }
  }, [shots, selectedShot, selectedProjectId, isLoading, setCurrentShotId]);

  // Memoize video pair configs calculation
  const computedVideoPairConfigs = useMemo(() => {
    if (selectedShot?.images && selectedShot.images.length >= 2) {
      const nonVideoImages = selectedShot.images.filter(img => !img.type?.includes('video'));
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
  }, [selectedShot?.images]);

  // Update videoPairConfigs when computed configs change
  useEffect(() => {
    setVideoPairConfigs(computedVideoPairConfigs);
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

  useEffect(() => {
    // Only attempt to auto-select a shot if we navigated here via a shot click
    if (!viaShotClick) {
      return;
    }

    // Case 1: No current shot ID - clear selection
    if (!currentShotId) {
      if (selectedShot) {
        setSelectedShot(null);
        setVideoPairConfigs([]);
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
        setSelectedShot(null);
        setVideoPairConfigs([]);
        setCurrentShotId(null);
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
      }
    }
  }, [currentShotId, shots, viaShotClick, navigate, location.pathname]); // Removed selectedShot from deps to avoid loops

  // NEW: Immediately select shot on mount if we have the data
  useEffect(() => {
    if (viaShotClick && currentShotId && shots && !selectedShot) {
      const shotToSelect = shots.find(shot => shot.id === currentShotId);
      if (shotToSelect) {
        setSelectedShot(shotToSelect);
      }
    }
  }, [viaShotClick, currentShotId, shots, selectedShot]);

  const handleShotSelect = (shot: Shot) => {
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
    // By replacing the current entry in the history stack, we effectively reset 
    // the 'fromShotClick' state without adding a new entry to the browser history.
    // This ensures that subsequent interactions with the shot list behave as if 
    // it's the first visit, resolving the "two-click" issue on mobile.
    navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
  };

  // Navigation handlers
  const handlePreviousShot = () => {
    if (shots && selectedShot) {
      navigateToPreviousShot(shots, selectedShot);
    }
  };

  const handleNextShot = () => {
    if (shots && selectedShot) {
      navigateToNextShot(shots, selectedShot);
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

  const handleModalSubmitCreateShot = async (name: string, files: File[]) => {
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
        
        newShot = result.shot;
        
        // Refetch shots to update the list
        await refetchShots();
      }
      
      // Select the newly created shot
      setSelectedShot(newShot);
      setCurrentShotId(newShot.id);
      
      // Mark this shot as needing project defaults applied
      if (projectSettings || projectUISettings) {
        const defaultsToApply = {
          ...(projectSettings || {}),
          // Include UI settings in a special key that will be handled separately
          _uiSettings: projectUISettings || {}
        };
        // Store the new shot ID to apply defaults when settings load
        sessionStorage.setItem(`apply-project-defaults-${newShot.id}`, JSON.stringify(defaultsToApply));
      }
      
      // Close the modal
      setIsCreateShotModalOpen(false);
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

  const handleSteerableMotionSettingsChange = (settings: Partial<typeof steerableMotionSettings>) => {
    userHasInteracted.current = true;
    setSteerableMotionSettings(prev => ({
      ...prev,
      ...settings
    }));
  };

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
    generationMode,
    pairConfigs,
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
          generationMode,
          pairConfigs,
          // selectedLoras removed - now managed directly in ShotEditor
  ]);

  // Save settings to database whenever they change (optimized)
  useEffect(() => {
    if (selectedShot?.id && settings && hasLoadedInitialSettings.current && userHasInteracted.current) {
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

  if (!selectedProjectId) {
    if (showProjectError) {
      return <div className="p-4 text-center text-muted-foreground">Please select a project first.</div>;
    }
    // Skeleton while we wait for ProjectContext to hydrate
    return (
      <div 
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${skeletonGridCols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: 8 }).map((_, idx) => (
          <Skeleton key={idx} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="p-4">Error loading shots: {error.message}</div>;
  }

  // Show consistent skeleton for both project loading and shots loading
  if (isLoading) {
    return (
      <div 
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${skeletonGridCols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: 8 }).map((_, idx) => (
          <Skeleton key={idx} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div ref={mainContainerRef} className="w-full">
      {!shouldShowShotEditor ? (
        <>
          <ShotListDisplay
            shots={shots || []}
            onSelectShot={handleShotSelect}
            currentProjectId={selectedProjectId}
            onCreateNewShot={() => setIsCreateShotModalOpen(true)}
          />
        </>
      ) : (
        // Show a loading state while settings or component are being fetched
        <Suspense fallback={
          <PageFadeIn className="pt-2 sm:pt-5">
            <div className="flex flex-col space-y-4 pb-16">
              <div className="flex-shrink-0 flex flex-wrap justify-between items-center gap-y-2 px-2">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-8 w-64" />
                <div className="flex space-x-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </PageFadeIn>
        }>
          <PageFadeIn className="pt-2 sm:pt-5">
            <ShotEditor
              selectedShotId={shotToEdit?.id || ''}
              projectId={selectedProjectId}
              videoPairConfigs={videoPairConfigs}
              videoControlMode={isLoadingSettings ? 'batch' : videoControlMode}
              batchVideoPrompt={isLoadingSettings ? '' : batchVideoPrompt}
              batchVideoFrames={isLoadingSettings ? 60 : batchVideoFrames}
              batchVideoContext={isLoadingSettings ? 10 : batchVideoContext}
              onShotImagesUpdate={handleShotImagesUpdate}
              onBack={handleBackToShotList}
              onVideoControlModeChange={handleVideoControlModeChange}
              onPairConfigChange={handlePairConfigChange}
              onBatchVideoPromptChange={handleBatchVideoPromptChange}
              onBatchVideoFramesChange={handleBatchVideoFramesChange}
              onBatchVideoContextChange={handleBatchVideoContextChange}
              batchVideoSteps={isLoadingSettings ? 4 : batchVideoSteps}
              onBatchVideoStepsChange={handleBatchVideoStepsChange}
              dimensionSource={isLoadingSettings ? 'firstImage' : dimensionSource}
              onDimensionSourceChange={handleDimensionSourceChange}
              customWidth={isLoadingSettings ? undefined : customWidth}
              onCustomWidthChange={handleCustomWidthChange}
              customHeight={isLoadingSettings ? undefined : customHeight}
              onCustomHeightChange={handleCustomHeightChange}
              steerableMotionSettings={isLoadingSettings ? {
                negative_prompt: '',
                model_name: 'vace_14B',
                seed: 789,
                debug: true,
                apply_reward_lora: false,
                colour_match_videos: true,
                apply_causvid: true,
                use_lighti2x_lora: false,
                fade_in_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
                fade_out_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
                after_first_post_generation_saturation: 1,
                after_first_post_generation_brightness: 0,
                show_input_images: false,
              } : steerableMotionSettings}
              onSteerableMotionSettingsChange={isLoadingSettings ? noOpCallback : handleSteerableMotionSettingsChange}
              onGenerateAllSegments={noOpCallback}
              // LoRA props removed - now managed internally by ShotEditor
              availableLoras={availableLoras}
              enhancePrompt={isLoadingSettings ? false : enhancePrompt}
              onEnhancePromptChange={handleEnhancePromptChange}
              generationMode={isLoadingSettings ? 'batch' : generationMode}
              onGenerationModeChange={handleGenerationModeChange}

              onPreviousShot={handlePreviousShot}
              onNextShot={handleNextShot}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onUpdateShotName={handleUpdateShotName}
              settingsLoading={isLoadingSettings}
              // afterEachPromptText props removed - not in ShotEditorProps interface
            />
          </PageFadeIn>
        </Suspense>
      )}

      <CreateShotModal 
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
      />
    </div>
  );
};

export default VideoTravelToolPage; 