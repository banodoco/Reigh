import React, { useState, useEffect, useRef, Suspense, useMemo, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SteerableMotionSettings } from '../components/ShotEditor';
import { useListShots, useCreateShot, useHandleExternalImageDrop, useUpdateShotName } from '@/shared/hooks/useShots';
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
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { useToolPageHeader } from '@/shared/contexts/ToolPageHeaderContext';
import { useContentResponsive, useContentResponsiveColumns } from '@/shared/hooks/useContentResponsive';
import { timeEnd } from '@/shared/lib/logger';
// import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';

// Custom hook to parallelize data fetching for better performance
const useVideoTravelData = (selectedProjectId: string | null, selectedShotId?: string) => {
  // Fetch shots data
  const shotsQuery = useListShots(selectedProjectId);
  
  // Fetch public LoRAs data
  const publicLorasQuery = useListPublicResources('lora');
  
  // Fetch tool settings only when we have a selected shot
  const toolSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { shotId: selectedShotId, enabled: !!selectedShotId }
  );

  return {
    // Shots data
    shots: shotsQuery.data,
    shotsLoading: shotsQuery.isLoading,
    shotsError: shotsQuery.error,
    refetchShots: shotsQuery.refetch,
    
    // LoRAs data
    availableLoras: (publicLorasQuery.data?.map(resource => resource.metadata) || []) as LoraModel[],
    lorasLoading: publicLorasQuery.isLoading,
    
    // Settings data
    settings: toolSettingsQuery.settings,
    updateSettings: toolSettingsQuery.update,
    settingsLoading: toolSettingsQuery.isLoading,
    settingsUpdating: toolSettingsQuery.isUpdating,
  };
};

// Lazy load the heavy ShotEditor component
const LazyShotEditor = React.lazy(() => import('../components/ShotEditor'));

const VideoTravelToolPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const { selectedProjectId } = useProject();
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  
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
    settingsUpdating: isUpdating
  } = useVideoTravelData(selectedProjectId, selectedShot?.id);
  
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const updateShotNameMutation = useUpdateShotName();
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const queryClient = useQueryClient();
  // const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot(); // Keep for later if needed
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  const { setHeader, clearHeader } = useToolPageHeader();

  // Content-responsive breakpoints for dynamic layout
  const { isSm, isLg } = useContentResponsive();
  const skeletonGridCols = useContentResponsiveColumns({
    base: 1,
    md: 2,
    lg: 3,
  });

  // Add ref for main container to enable scroll-to-top functionality
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Function to smoothly scroll the window all the way to the very top.
  // Using window.scrollTo guarantees we align with the absolute top of the page,
  // eliminating the slight offset seen with scrollIntoView.
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Data fetching is now handled by the useVideoTravelData hook above

  // Add state for video generation settings - wait for settings to load before initializing
  const [videoControlMode, setVideoControlMode] = useState<'individual' | 'batch'>('batch');
  const [batchVideoPrompt, setBatchVideoPrompt] = useState('');
  const [batchVideoFrames, setBatchVideoFrames] = useState(30);
  const [batchVideoContext, setBatchVideoContext] = useState(10);
  const [batchVideoSteps, setBatchVideoSteps] = useState(4);
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>('firstImage');
  const [customWidth, setCustomWidth] = useState<number | undefined>(undefined);
  const [customHeight, setCustomHeight] = useState<number | undefined>(undefined);
  const [enhancePrompt, setEnhancePrompt] = useState<boolean>(false);
  const [videoPairConfigs, setVideoPairConfigs] = useState<any[]>([]);
  const [generationMode, setGenerationMode] = useState<'batch' | 'by-pair' | 'timeline'>('batch');
  const [pairConfigs, setPairConfigs] = useState<any[]>([]);
  
  // Memoize expensive computations
  const shouldShowShotEditor = useMemo(() => {
    // If we have a selected shot, definitely show editor
    if (selectedShot) return true;
    
    // If we navigated here via shot click and have a currentShotId, show editor immediately
    // even before shots data loads to prevent header flash
    if (viaShotClick && currentShotId) return true;
    
    // Otherwise, check if the shot exists in loaded shots data
    return shots?.some(s => s.id === currentShotId) || false;
  }, [selectedShot, viaShotClick, currentShotId, shots]);
  
  const shotToEdit = useMemo(() => {
    return selectedShot || (viaShotClick && currentShotId ? shots?.find(s => s.id === currentShotId) : null);
  }, [selectedShot, viaShotClick, currentShotId, shots]);
  
  // Calculate navigation state with memoization
  const navigationState = useMemo(() => {
    const currentShotIndex = shots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
    return {
      currentShotIndex,
      hasPrevious: currentShotIndex > 0,
      hasNext: currentShotIndex >= 0 && currentShotIndex < (shots?.length ?? 0) - 1,
    };
  }, [shots, selectedShot?.id]);
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
        <ToolPageHeader title="Travel Between Images">
          {/* Only show header button when there are shots */}
          {(!isLoading && shots && shots.length > 0) && (
            <Button onClick={() => setIsCreateShotModalOpen(true)}>New Shot</Button>
          )}
        </ToolPageHeader>
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
      
      setVideoControlMode(settings.videoControlMode || 'batch');
      setBatchVideoPrompt(settings.batchVideoPrompt || '');
      setBatchVideoFrames(settings.batchVideoFrames || 30);
      setBatchVideoContext(settings.batchVideoContext || 10);
      setBatchVideoSteps(settings.batchVideoSteps || 4);
      setDimensionSource(settings.dimensionSource || 'firstImage');
      setCustomWidth(settings.customWidth);
      setCustomHeight(settings.customHeight);
      setEnhancePrompt(settings.enhancePrompt || false);
      setVideoPairConfigs(settings.pairConfigs || []);
      setGenerationMode(settings.generationMode || 'batch');
      setPairConfigs(settings.pairConfigs || []);
      setSelectedLoras(settings.selectedLoras || []);
      setSteerableMotionSettings(settings.steerableMotionSettings || {
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
  }, [settings, isLoadingSettings]);

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
  useEffect(() => {
    if (!viaShotClick) {
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
        // Shot not found, clear selection
        setSelectedShot(null);
        setVideoPairConfigs([]);
      }
    }
  }, [currentShotId, shots, viaShotClick]); // Removed selectedShot from deps to avoid loops

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
    setSelectedShot(shot);
    setCurrentShotId(shot.id);
    // Scroll to top when selecting a shot
    scrollToTop();
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
    if (!shots || !selectedShot) return;
    const currentIndex = shots.findIndex(shot => shot.id === selectedShot.id);
    if (currentIndex > 0) {
      const previousShot = shots[currentIndex - 1];
      setSelectedShot(previousShot);
      setCurrentShotId(previousShot.id);
      // Scroll to the very top of the page
      scrollToTop();
    }
  };

  const handleNextShot = () => {
    if (!shots || !selectedShot) return;
    const currentIndex = shots.findIndex(shot => shot.id === selectedShot.id);
    if (currentIndex < shots.length - 1) {
      const nextShot = shots[currentIndex + 1];
      setSelectedShot(nextShot);
      setCurrentShotId(nextShot.id);
      // Scroll to the very top of the page
      scrollToTop();
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
    selectedLoras,
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
          selectedLoras,
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
          updateSettings('shot', currentSettings);
        }
      }, 200); // Reduced wait time for better performance
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [selectedShot?.id, currentSettings, settings, updateSettings, isUpdating]);

  const handleAddLora = (loraToAdd: LoraModel) => {
    if (selectedLoras.find(sl => sl.id === loraToAdd["Model ID"])) {
      console.log(`LoRA already added.`);
      return;
    }
    if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
      userHasInteracted.current = true;
      setSelectedLoras(prevLoras => [
        ...prevLoras,
        {
          id: loraToAdd["Model ID"],
          name: loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"],
          path: loraToAdd["Model Files"][0].url,
          strength: 1.0,
          previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0 ? loraToAdd.Images[0].url : undefined,
          trigger_word: loraToAdd.trigger_word,
        },
      ]);
    } else {
      console.error("Selected LoRA has no model file specified.");
    }
  };

  const handleRemoveLora = (loraIdToRemove: string) => {
    userHasInteracted.current = true;
    setSelectedLoras(prevLoras => prevLoras.filter(lora => lora.id !== loraIdToRemove));
  };

  const handleLoraStrengthChange = (loraId: string, newStrength: number) => {
    userHasInteracted.current = true;
    setSelectedLoras(prevLoras =>
      prevLoras.map(lora => (lora.id === loraId ? { ...lora, strength: newStrength } : lora))
    );
  };

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
          <PageFadeIn className="pt-5">
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
          <PageFadeIn className="pt-5">
            <LazyShotEditor
              selectedShot={shotToEdit}
              projectId={selectedProjectId}
              videoPairConfigs={videoPairConfigs}
              videoControlMode={isLoadingSettings ? 'batch' : videoControlMode}
              batchVideoPrompt={isLoadingSettings ? '' : batchVideoPrompt}
              batchVideoFrames={isLoadingSettings ? 30 : batchVideoFrames}
              batchVideoContext={isLoadingSettings ? 10 : batchVideoContext}
              orderedShotImages={shotToEdit?.images || []}
              onShotImagesUpdate={handleShotImagesUpdate}
              onBack={handleBackToShotList}
              onVideoControlModeChange={isLoadingSettings ? () => {} : (mode) => {
                userHasInteracted.current = true;
                setVideoControlMode(mode);
              }}
              onPairConfigChange={isLoadingSettings ? () => {} : (pairId, field, value) => {
                userHasInteracted.current = true;
                setVideoPairConfigs(prev => prev.map(p => p.id === pairId ? { ...p, [field]: value } : p));
              }}
              onBatchVideoPromptChange={isLoadingSettings ? () => {} : (prompt) => {
                userHasInteracted.current = true;
                setBatchVideoPrompt(prompt);
              }}
              onBatchVideoFramesChange={isLoadingSettings ? () => {} : (frames) => {
                userHasInteracted.current = true;
                setBatchVideoFrames(frames);
              }}
              onBatchVideoContextChange={isLoadingSettings ? () => {} : (context) => {
                userHasInteracted.current = true;
                setBatchVideoContext(context);
              }}
              batchVideoSteps={isLoadingSettings ? 4 : batchVideoSteps}
              onBatchVideoStepsChange={isLoadingSettings ? () => {} : (steps) => {
                userHasInteracted.current = true;
                setBatchVideoSteps(steps);
              }}
              dimensionSource={isLoadingSettings ? 'firstImage' : dimensionSource}
              onDimensionSourceChange={isLoadingSettings ? () => {} : (source) => {
                userHasInteracted.current = true;
                setDimensionSource(source);
              }}
              customWidth={isLoadingSettings ? undefined : customWidth}
              onCustomWidthChange={isLoadingSettings ? () => {} : (width) => {
                userHasInteracted.current = true;
                setCustomWidth(width);
              }}
              customHeight={isLoadingSettings ? undefined : customHeight}
              onCustomHeightChange={isLoadingSettings ? () => {} : (height) => {
                userHasInteracted.current = true;
                setCustomHeight(height);
              }}
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
              onSteerableMotionSettingsChange={isLoadingSettings ? () => {} : handleSteerableMotionSettingsChange}
              onGenerateAllSegments={() => {}}
              selectedLoras={isLoadingSettings ? [] : selectedLoras}
              onAddLora={isLoadingSettings ? () => {} : handleAddLora}
              onRemoveLora={isLoadingSettings ? () => {} : handleRemoveLora}
              onLoraStrengthChange={isLoadingSettings ? () => {} : handleLoraStrengthChange}
              availableLoras={availableLoras}
              isLoraModalOpen={isLoraModalOpen}
              setIsLoraModalOpen={setIsLoraModalOpen}
              enhancePrompt={isLoadingSettings ? false : enhancePrompt}
              onEnhancePromptChange={isLoadingSettings ? () => {} : (enhance) => {
                userHasInteracted.current = true;
                setEnhancePrompt(enhance);
              }}
              generationMode={isLoadingSettings ? 'batch' : generationMode}
              onGenerationModeChange={isLoadingSettings ? () => {} : (mode) => {
                userHasInteracted.current = true;
                setGenerationMode(mode);
              }}
              pairConfigs={isLoadingSettings ? [] : pairConfigs}
              onPairConfigsChange={isLoadingSettings ? () => {} : (configs) => {
                userHasInteracted.current = true;
                setPairConfigs(configs);
              }}
              onPreviousShot={handlePreviousShot}
              onNextShot={handleNextShot}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onUpdateShotName={handleUpdateShotName}
              settingsLoading={isLoadingSettings}
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