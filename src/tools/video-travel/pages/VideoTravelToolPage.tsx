import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import ShotEditor, { SteerableMotionSettings } from '../components/ShotEditor';
import { useListShots, useCreateShot, useHandleExternalImageDrop } from '@/shared/hooks/useShots';
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
// import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';

// Placeholder data or logic to fetch actual data for VideoEditLayout
// This will need to be fleshed out based on VideoEditLayout's requirements
export interface ActiveLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

const VideoTravelToolPage: React.FC = () => {
  const location = useLocation();
  const viaShotClick = (location.state as { viaShotClick?: boolean } | null)?.viaShotClick;
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error, refetch: refetchShots } = useListShots(selectedProjectId);
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const queryClient = useQueryClient();
  // const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot(); // Keep for later if needed
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<LoraModel[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);

  // Use tool settings for the selected shot
  const toolSettingsContext = useMemo(() => ({
    projectId: selectedProjectId || undefined,
    shotId: selectedShot?.id,
  }), [selectedProjectId, selectedShot?.id]);

  const { settings, update: updateSettings, isLoading: isLoadingSettings, isUpdating, hasUserMadeChanges } = useToolSettings<VideoTravelSettings>(
    'video-travel',
    toolSettingsContext,
    { silent: true }
  );

  // Add state for video generation settings - initialized from tool settings
  const [videoControlMode, setVideoControlMode] = useState<'individual' | 'batch'>(settings?.videoControlMode || 'batch');
  const [batchVideoPrompt, setBatchVideoPrompt] = useState(settings?.batchVideoPrompt || '');
  const [batchVideoFrames, setBatchVideoFrames] = useState(settings?.batchVideoFrames || 30);
  const [batchVideoContext, setBatchVideoContext] = useState(settings?.batchVideoContext || 10);
  const [batchVideoSteps, setBatchVideoSteps] = useState(settings?.batchVideoSteps || 4);
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>(settings?.dimensionSource || 'firstImage');
  const [customWidth, setCustomWidth] = useState<number | undefined>(settings?.customWidth);
  const [customHeight, setCustomHeight] = useState<number | undefined>(settings?.customHeight);
  const [enhancePrompt, setEnhancePrompt] = useState<boolean>(settings?.enhancePrompt || false);
  const [videoPairConfigs, setVideoPairConfigs] = useState<any[]>(settings?.pairConfigs || []);
  const [generationMode, setGenerationMode] = useState<'batch' | 'by-pair'>(settings?.generationMode || 'batch');
  const [pairConfigs, setPairConfigs] = useState<any[]>(settings?.pairConfigs || []);
  const [steerableMotionSettings, setSteerableMotionSettings] = useState<SteerableMotionSettings>(
    settings?.steerableMotionSettings || {
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
    }
  );

  const hasLoadedInitialSettings = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteracted = useRef(false);
  const [showSkeleton, setShowSkeleton] = useState(false);

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
    setShowSkeleton(false);
    
    // Show skeleton after a small delay if settings are still loading
    const skeletonTimer = setTimeout(() => {
      if (isLoadingSettings) {
        setShowSkeleton(true);
      }
    }, 200); // 200ms delay
    
    return () => clearTimeout(skeletonTimer);
  }, [selectedShot?.id, isLoadingSettings]);

  // Hide skeleton when settings are loaded
  useEffect(() => {
    if (!isLoadingSettings) {
      setShowSkeleton(false);
    }
  }, [isLoadingSettings]);

  useEffect(() => {
    fetch('/data/loras.json')
      .then(response => response.json())
      .then(data => {
        const allLoras = Object.values(data).flat();
        setAvailableLoras(allLoras as LoraModel[]);
      })
      .catch(error => console.error("Error fetching LoRA data:", error));
  }, []);

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

  const handleBackToShotList = () => {
    setSelectedShot(null);
    setVideoPairConfigs([]);
    setCurrentShotId(null);
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
          // Find the created shot from the shots list after refetching
          const { data: updatedShots } = await refetchShots();
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
        newShot = await createShotMutation.mutateAsync({
          shotName: name,
          projectId: selectedProjectId,
        });
        
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
    console.log('[ToolSettingsDebug] Save effect triggered', {
      shotId: selectedShot?.id,
      hasSettings: !!settings,
      hasLoadedInitialSettings: hasLoadedInitialSettings.current,
      userHasInteracted: userHasInteracted.current,
      isUpdating
    });

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
        };

        if (!isUpdating && !deepEqual(sanitizeSettings(currentSettings), sanitizeSettings(settings))) {
          console.log('[ToolSettingsDebug] ► Will save', {
            shotId: selectedShot?.id,
            currentSettings,
            dbSettings: settings,
          });
          updateSettings(currentSettings, 'shot');
        } else {
          console.log('[ToolSettingsDebug] ► No change detected for shot', selectedShot?.id);
        }
      }, 500); // Wait 500ms before saving
    } else {
      console.log('[ToolSettingsDebug] ► Save conditions not met', {
        hasSelectedShot: !!selectedShot?.id,
        hasSettings: !!settings,
        hasLoadedInitialSettings: hasLoadedInitialSettings.current,
        userHasInteracted: userHasInteracted.current
      });
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
      setSelectedLoras(prevLoras => [
        ...prevLoras,
        {
          id: loraToAdd["Model ID"],
          name: loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"],
          path: loraToAdd["Model Files"][0].url,
          strength: 1.0,
          previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0 ? loraToAdd.Images[0].url : undefined,
        },
      ]);
      console.log(`LoRA added.`);
    } else {
      console.error("Selected LoRA has no model file specified.");
    }
  };

  const handleRemoveLora = (loraIdToRemove: string) => {
    setSelectedLoras(prevLoras => prevLoras.filter(lora => lora.id !== loraIdToRemove));
  };

  const handleLoraStrengthChange = (loraId: string, newStrength: number) => {
    setSelectedLoras(prevLoras =>
      prevLoras.map(lora => (lora.id === loraId ? { ...lora, strength: newStrength } : lora))
    );
  };

  if (!selectedProjectId) {
    return <div className="p-4">Please select a project first.</div>;
  }

  if (error) {
    return <div className="p-4">Error loading shots: {error.message}</div>;
  }

  return (
    <div className="container mx-auto p-4">
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
        <>
          {/* Show loading state while settings are loading for the selected shot */}
          {showSkeleton ? (
            <div className="container mx-auto p-4">
              <div className="mb-6">
                <Button 
                  variant="outline" 
                  onClick={handleBackToShotList}
                  className="mb-4"
                >
                  ← Back to Shots
                </Button>
                <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
                <div className="h-4 bg-gray-100 rounded w-32 animate-pulse"></div>
              </div>
              
              {/* Loading skeleton that matches the form structure */}
              <div className="space-y-6">
                {/* Video outputs gallery skeleton */}
                <div className="p-4 border rounded-lg bg-card shadow-md animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="aspect-video bg-gray-200 rounded"></div>
                    <div className="aspect-video bg-gray-200 rounded"></div>
                    <div className="aspect-video bg-gray-200 rounded"></div>
                  </div>
                </div>
                
                {/* Form settings skeleton */}
                <div className="p-4 border rounded-lg bg-card shadow-md animate-pulse">
                  <div className="flex justify-between items-center mb-4">
                    <div className="h-6 bg-gray-200 rounded w-36"></div>
                    <div className="h-8 bg-gray-200 rounded w-32"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                      <div className="h-20 bg-gray-100 rounded"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                      <div className="h-20 bg-gray-100 rounded"></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-6 bg-gray-100 rounded"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                      <div className="h-6 bg-gray-100 rounded"></div>
                    </div>
                  </div>
                </div>
                
                {/* Images section skeleton */}
                <div className="p-4 border rounded-lg bg-card shadow-md animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-24 mb-4"></div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="aspect-square bg-gray-200 rounded"></div>
                    <div className="aspect-square bg-gray-200 rounded"></div>
                    <div className="aspect-square bg-gray-200 rounded"></div>
                    <div className="aspect-square bg-gray-200 rounded opacity-50"></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="opacity-0 animate-[fadeIn_0.3s_ease-in_forwards]">
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
                  console.log('[ToolSettingsDebug] User changed batch prompt', prompt);
                  userHasInteracted.current = true;
                  setBatchVideoPrompt(prompt);
                }}
                onBatchVideoFramesChange={(frames) => {
                  console.log('[ToolSettingsDebug] User changed batch frames', frames);
                  userHasInteracted.current = true;
                  setBatchVideoFrames(frames);
                }}
                onBatchVideoContextChange={(context) => {
                  console.log('[ToolSettingsDebug] User changed batch context', context);
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
              />
            </div>
          )}
        </>
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