import React, { useState, useEffect, useCallback } from 'react';
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
  const { settings, update: updateSettings, isLoading: isLoadingSettings } = useToolSettings<VideoTravelSettings>(
    'video-travel',
    { projectId: selectedProjectId || undefined, shotId: selectedShot?.id }
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

  const onBatchVideoPromptChange = useCallback((value: string) => {
    setBatchVideoPrompt(value);
    updateSettings({ batchVideoPrompt: value }, 'shot');
  }, [updateSettings]);

  const onBatchVideoFramesChange = useCallback((value: number) => {
    setBatchVideoFrames(value);
    updateSettings({ batchVideoFrames: value }, 'shot');
  }, [updateSettings]);

  const onBatchVideoContextChange = useCallback((value: number) => {
    setBatchVideoContext(value);
    updateSettings({ batchVideoContext: value }, 'shot');
  }, [updateSettings]);

  const onBatchVideoStepsChange = useCallback((value: number) => {
    setBatchVideoSteps(value);
    updateSettings({ batchVideoSteps: value }, 'shot');
  }, [updateSettings]);

  const onDimensionSourceChange = useCallback((value: 'project' | 'firstImage' | 'custom') => {
    setDimensionSource(value);
    updateSettings({ dimensionSource: value }, 'shot');
  }, [updateSettings]);

  const onCustomWidthChange = useCallback((value: number | undefined) => {
    setCustomWidth(value);
    updateSettings({ customWidth: value }, 'shot');
  }, [updateSettings]);
  
  const onCustomHeightChange = useCallback((value: number | undefined) => {
    setCustomHeight(value);
    updateSettings({ customHeight: value }, 'shot');
  }, [updateSettings]);

  const onEnhancePromptChange = useCallback((value: boolean) => {
    setEnhancePrompt(value);
    updateSettings({ enhancePrompt: value }, 'shot');
  }, [updateSettings]);

  const onGenerationModeChange = useCallback((value: 'batch' | 'by-pair') => {
    setGenerationMode(value);
    updateSettings({ generationMode: value }, 'shot');
  }, [updateSettings]);

  const onPairConfigsChange = useCallback((value: any[]) => {
    setPairConfigs(value);
    updateSettings({ pairConfigs: value }, 'shot');
  }, [updateSettings]);

  const onSteerableMotionSettingsChange = useCallback((value: Partial<SteerableMotionSettings>) => {
    const newSettings = { ...steerableMotionSettings, ...value };
    setSteerableMotionSettings(newSettings);
    updateSettings({ steerableMotionSettings: newSettings }, 'shot');
  }, [steerableMotionSettings, updateSettings]);

  // Update state when settings are loaded from database
  useEffect(() => {
    if (settings && !isLoadingSettings) {
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

  const handleModalSubmitCreateShot = async (name: string, files: File[], copySettings: boolean) => {
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
      
      // If copySettings is true, copy settings from the last shot
      if (copySettings && newShot && shots && shots.length > 0) {
        // Sort shots by creation date to find the last one (excluding the one just created)
        const sortedShots = [...shots].sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        const lastShot = sortedShots[0];
        
        if (lastShot) {
          // Fetch settings from last shot
          const response = await fetch(`/api/tool-settings/resolve?toolId=video-travel&projectId=${selectedProjectId}&shotId=${lastShot.id}`);
          if (response.ok) {
            const lastShotSettings = await response.json();
            // Apply settings to the new shot
            await fetch(`/api/tool-settings`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scope: 'shot',
                id: newShot.id,
                toolId: 'video-travel',
                patch: lastShotSettings,
              }),
            });
          }
        }
      }

      // Select the newly created shot
      if (newShot) {
        await refetchShots();
        const updatedShots = queryClient.getQueryData<Shot[]>(['shots', selectedProjectId]);
        const finalShot = updatedShots?.find(s => s.id === newShot.id);

        if (finalShot) {
          setSelectedShot(finalShot);
          setCurrentShotId(finalShot.id);
        }
      } else {
        // This case handles when a shot is created by dropping an image on a new group
        // The shot is created, and we just need to refetch to see it in the list.
        await refetchShots();
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

  const handleSteerableMotionSettingsChange = (settings: Partial<typeof steerableMotionSettings>) => {
    setSteerableMotionSettings(prev => ({
      ...prev,
      ...settings
    }));
  };

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
            setVideoControlMode(mode);
            updateSettings({ videoControlMode: mode }, 'shot');
          }}
          onPairConfigChange={(pairId, field, value) => {
            const newPairConfigs = videoPairConfigs.map(p => p.id === pairId ? { ...p, [field]: value } : p);
            setVideoPairConfigs(newPairConfigs);
            updateSettings({ pairConfigs: newPairConfigs }, 'shot');
          }}
          onBatchVideoPromptChange={onBatchVideoPromptChange}
          onBatchVideoFramesChange={onBatchVideoFramesChange}
          onBatchVideoContextChange={onBatchVideoContextChange}
          batchVideoSteps={batchVideoSteps}
          onBatchVideoStepsChange={onBatchVideoStepsChange}
          dimensionSource={dimensionSource}
          onDimensionSourceChange={onDimensionSourceChange}
          customWidth={customWidth}
          onCustomWidthChange={onCustomWidthChange}
          customHeight={customHeight}
          onCustomHeightChange={onCustomHeightChange}
          steerableMotionSettings={steerableMotionSettings}
          onSteerableMotionSettingsChange={onSteerableMotionSettingsChange}
          onGenerateAllSegments={() => {}}
          selectedLoras={selectedLoras}
          onAddLora={handleAddLora}
          onRemoveLora={handleRemoveLora}
          onLoraStrengthChange={handleLoraStrengthChange}
          availableLoras={availableLoras}
          isLoraModalOpen={isLoraModalOpen}
          setIsLoraModalOpen={setIsLoraModalOpen}
          enhancePrompt={enhancePrompt}
          onEnhancePromptChange={onEnhancePromptChange}
          generationMode={generationMode}
          onGenerationModeChange={onGenerationModeChange}
          pairConfigs={pairConfigs}
          onPairConfigsChange={onPairConfigsChange}
        />
      )}

      <CreateShotModal 
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
        hasPreviousShot={(shots?.length ?? 0) > 0}
      />
    </div>
  );
};

export default VideoTravelToolPage; 