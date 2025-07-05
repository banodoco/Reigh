import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ShotEditor, { SteerableMotionSettings } from '../components/ShotEditor';
import { useListShots, useCreateShot, useHandleExternalImageDrop, useUpdateShotName } from '@/shared/hooks/useShots';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { useProject } from "@/shared/contexts/ProjectContext";
import CreateShotModal from '../components/CreateShotModal';
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
// import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';

// Placeholder data or logic to fetch actual data for VideoEditLayout
// This will need to be fleshed out based on VideoEditLayout's requirements
export interface ActiveLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
  trigger_word?: string;
}

const VideoTravelToolPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error, refetch: refetchShots } = useListShots(selectedProjectId);
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const updateShotNameMutation = useUpdateShotName();
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const queryClient = useQueryClient();
  // const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot(); // Keep for later if needed
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<LoraModel[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);

  // Use tool settings for the selected shot - no need to pass userId, server knows it from auth
  const { settings, update: updateSettings, isLoading: isLoadingSettings, isUpdating } = useToolSettings<VideoTravelSettings>(
    'video-travel',
    { shotId: selectedShot?.id, enabled: !!selectedShot }
  );

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
  const [generationMode, setGenerationMode] = useState<'batch' | 'by-pair'>('batch');
  const [pairConfigs, setPairConfigs] = useState<any[]>([]);
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

  useEffect(() => {
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
        setVideoPairConfigs(pairs);
      }
    }
  }, [selectedShot?.images]);

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

  const handleShotSelect = (shot: Shot) => {
    setSelectedShot(shot);
    setCurrentShotId(shot.id);
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
  };

  // Navigation handlers
  const handlePreviousShot = () => {
    if (!shots || !selectedShot) return;
    const currentIndex = shots.findIndex(shot => shot.id === selectedShot.id);
    if (currentIndex > 0) {
      const previousShot = shots[currentIndex - 1];
      setSelectedShot(previousShot);
      setCurrentShotId(previousShot.id);
    }
  };

  const handleNextShot = () => {
    if (!shots || !selectedShot) return;
    const currentIndex = shots.findIndex(shot => shot.id === selectedShot.id);
    if (currentIndex < shots.length - 1) {
      const nextShot = shots[currentIndex + 1];
      setSelectedShot(nextShot);
      setCurrentShotId(nextShot.id);
    }
  };

  // Calculate navigation state
  const currentShotIndex = shots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
  const hasPrevious = currentShotIndex > 0;
  const hasNext = currentShotIndex >= 0 && currentShotIndex < (shots?.length ?? 0) - 1;

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

  // Save settings to database whenever they change
  useEffect(() => {
    if (selectedShot?.id && settings && hasLoadedInitialSettings.current && userHasInteracted.current) {
      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Debounce the save
      saveTimeoutRef.current = setTimeout(() => {
        const currentSettings: VideoTravelSettings = {
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
        };

        // Check if we just saved these exact settings
        if (lastSavedSettingsRef.current && deepEqual(sanitizeSettings(currentSettings), sanitizeSettings(lastSavedSettingsRef.current))) {          
          return;
        }

        if (!isUpdating && !deepEqual(sanitizeSettings(currentSettings), sanitizeSettings(settings))) {

          lastSavedSettingsRef.current = currentSettings;
          updateSettings('shot', currentSettings);
        } else {          
        }
      }, 500); // Wait 500ms before saving
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    selectedShot?.id,
    videoControlMode,
    batchVideoPrompt,
    batchVideoFrames,
    batchVideoContext,
    batchVideoSteps,
    dimensionSource,
    customWidth,
    customHeight,
    JSON.stringify(steerableMotionSettings),
    enhancePrompt,
    generationMode,
    JSON.stringify(pairConfigs),
    JSON.stringify(selectedLoras),
    settings,
    updateSettings,
    isUpdating
  ]);

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
      console.log(`LoRA added.`);
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
      <div className="p-4 space-y-4">
        {/* Header skeleton */}
        <Skeleton className="h-9 w-40" />

        {/* List skeleton – resembles shot tiles */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-4">Error loading shots: {error.message}</div>;
  }

  return (
    <PageFadeIn className="container mx-auto p-4">
      {!selectedShot ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Video Travel Tool</h1>
            <Button onClick={() => setIsCreateShotModalOpen(true)}>Create New Shot</Button>
          </div>
          <ShotListDisplay
            shots={shots || []}
            onSelectShot={handleShotSelect}
            currentProjectId={selectedProjectId}
          />
        </>
      ) : (
        // Show a loading state while settings are being fetched
        isLoadingSettings ? (
          <ShotEditor
            selectedShot={selectedShot}
            projectId={selectedProjectId}
            videoPairConfigs={videoPairConfigs}
            videoControlMode={'batch'}
            batchVideoPrompt={''}
            batchVideoFrames={30}
            batchVideoContext={10}
            orderedShotImages={selectedShot.images || []}
            onShotImagesUpdate={handleShotImagesUpdate}
            onBack={handleBackToShotList}
            onVideoControlModeChange={() => {}}
            onPairConfigChange={() => {}}
            onBatchVideoPromptChange={() => {}}
            onBatchVideoFramesChange={() => {}}
            onBatchVideoContextChange={() => {}}
            batchVideoSteps={4}
            onBatchVideoStepsChange={() => {}}
            dimensionSource={'firstImage'}
            onDimensionSourceChange={() => {}}
            customWidth={undefined}
            onCustomWidthChange={() => {}}
            customHeight={undefined}
            onCustomHeightChange={() => {}}
            steerableMotionSettings={{
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
            }}
            onSteerableMotionSettingsChange={() => {}}
            onGenerateAllSegments={() => {}}
            selectedLoras={[]}
            onAddLora={() => {}}
            onRemoveLora={() => {}}
            onLoraStrengthChange={() => {}}
            availableLoras={availableLoras}
            isLoraModalOpen={false}
            setIsLoraModalOpen={() => {}}
            enhancePrompt={false}
            onEnhancePromptChange={() => {}}
            generationMode={'batch'}
            onGenerationModeChange={() => {}}
            pairConfigs={[]}
            onPairConfigsChange={() => {}}
            onPreviousShot={handlePreviousShot}
            onNextShot={handleNextShot}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            onUpdateShotName={handleUpdateShotName}
          />
        ) : (
          <ShotEditor
            selectedShot={selectedShot}
            projectId={selectedProjectId}
            videoPairConfigs={videoPairConfigs}
            videoControlMode={videoControlMode}
            batchVideoPrompt={batchVideoPrompt}
            batchVideoFrames={batchVideoFrames}
            batchVideoContext={batchVideoContext}
            orderedShotImages={selectedShot.images || []}
            onShotImagesUpdate={handleShotImagesUpdate}
            onBack={handleBackToShotList}
            onVideoControlModeChange={(mode) => {
              userHasInteracted.current = true;
              setVideoControlMode(mode);
            }}
            onPairConfigChange={(pairId, field, value) => {
              userHasInteracted.current = true;
              setVideoPairConfigs(prev => prev.map(p => p.id === pairId ? { ...p, [field]: value } : p));
            }}
            onBatchVideoPromptChange={(prompt) => {
              userHasInteracted.current = true;
              setBatchVideoPrompt(prompt);
            }}
            onBatchVideoFramesChange={(frames) => {
              userHasInteracted.current = true;
              setBatchVideoFrames(frames);
            }}
            onBatchVideoContextChange={(context) => {
              userHasInteracted.current = true;
              setBatchVideoContext(context);
            }}
            batchVideoSteps={batchVideoSteps}
            onBatchVideoStepsChange={(steps) => {
              userHasInteracted.current = true;
              setBatchVideoSteps(steps);
            }}
            dimensionSource={dimensionSource}
            onDimensionSourceChange={(source) => {
              userHasInteracted.current = true;
              setDimensionSource(source);
            }}
            customWidth={customWidth}
            onCustomWidthChange={(width) => {
              userHasInteracted.current = true;
              setCustomWidth(width);
            }}
            customHeight={customHeight}
            onCustomHeightChange={(height) => {
              userHasInteracted.current = true;
              setCustomHeight(height);
            }}
            steerableMotionSettings={steerableMotionSettings}
            onSteerableMotionSettingsChange={handleSteerableMotionSettingsChange}
            onGenerateAllSegments={() => {}}
            selectedLoras={selectedLoras}
            onAddLora={handleAddLora}
            onRemoveLora={handleRemoveLora}
            onLoraStrengthChange={handleLoraStrengthChange}
            availableLoras={availableLoras}
            isLoraModalOpen={isLoraModalOpen}
            setIsLoraModalOpen={setIsLoraModalOpen}
            enhancePrompt={enhancePrompt}
            onEnhancePromptChange={(enhance) => {
              userHasInteracted.current = true;
              setEnhancePrompt(enhance);
            }}
            generationMode={generationMode}
            onGenerationModeChange={(mode) => {
              userHasInteracted.current = true;
              setGenerationMode(mode);
            }}
            pairConfigs={pairConfigs}
            onPairConfigsChange={(configs) => {
              userHasInteracted.current = true;
              setPairConfigs(configs);
            }}
            onPreviousShot={handlePreviousShot}
            onNextShot={handleNextShot}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            onUpdateShotName={handleUpdateShotName}
          />
        )
      )}

      <CreateShotModal 
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
      />
    </PageFadeIn>
  );
};

export default VideoTravelToolPage; 