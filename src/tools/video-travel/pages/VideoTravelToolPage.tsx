import React, { useState, useEffect } from 'react';
import VideoEditLayout from '../components/VideoEditLayout';
import { useListShots, useCreateShot } from '@/shared/hooks/useShots';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { useProject } from "@/shared/contexts/ProjectContext";
import CreateShotModal from '../components/CreateShotModal';
import ShotListDisplay from '../components/ShotListDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { PageLoading } from '@/shared/components/ui/loading';
// import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';

// Placeholder data or logic to fetch actual data for VideoEditLayout
// This will need to be fleshed out based on VideoEditLayout's requirements

const VideoTravelToolPage: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error, refetch: refetchShots } = useListShots(selectedProjectId);
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const createShotMutation = useCreateShot();
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const queryClient = useQueryClient();
  // const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot(); // Keep for later if needed

  useEffect(() => {
    if (!selectedProjectId) {
      if (selectedShot) {
        setSelectedShot(null);
        setVideoPairConfigs([]); 
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
        }
      }
    } else if (!isLoading && selectedShot) {
      setSelectedShot(null);
      setVideoPairConfigs([]);
    }
  }, [shots, selectedShot, selectedProjectId, isLoading]);

  useEffect(() => {
    if (selectedShot && selectedShot.images) {
      if (selectedShot.images.length >= 2) {
        const newPairs = [];
        for (let i = 0; i < selectedShot.images.length - 1; i++) {
          newPairs.push({
            id: `pair-${selectedShot.images[i].id}-${selectedShot.images[i+1].id}`,
            imageA: selectedShot.images[i],
            imageB: selectedShot.images[i+1],
            prompt: '', 
            frames: 50,  
            context: 18, 
          });
        }
        setVideoPairConfigs(newPairs);
      } else {
        setVideoPairConfigs([]);
      }
    } else if (!selectedShot) {
      setVideoPairConfigs([]);
    }
  }, [selectedShot]);

  // Mocking or preparing props for VideoEditLayout - these might need to be dynamic based on selectedShot
  const [videoPairConfigs, setVideoPairConfigs] = useState<any[]>([]); // Changed to any[] for now for setVideoPairConfigs type
  const [videoControlMode, setVideoControlMode] = useState<'individual' | 'batch'>('batch');
  const [batchVideoPrompt, setBatchVideoPrompt] = useState("");
  const [batchVideoFrames, setBatchVideoFrames] = useState(81);
  const [batchVideoContext, setBatchVideoContext] = useState(16);
  const [batchVideoSteps, setBatchVideoSteps] = useState(9);

  const [steerableMotionSettings, setSteerableMotionSettings] = useState({
    negative_prompt: '',
    model_name: 'vace_14B',
    seed: 789,
    debug: true,
    booster_loras: true,
    fade_in_duration: '{"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}',
    fade_out_duration: '{"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}',
    after_first_post_generation_saturation: 0.75,
    after_first_post_generation_brightness: 0.0,
  });

  const handleSteerableMotionSettingsChange = (newSettings: Partial<typeof steerableMotionSettings>) => {
    setSteerableMotionSettings(prev => ({ ...prev, ...newSettings }));
  };

  const handleOpenCreateShotModal = () => {
    if (!selectedProjectId) {
      alert('Please select a project first to create a shot.'); // Or use toast
      return;
    }
    setIsCreateShotModalOpen(true);
  };

  const handleModalSubmitCreateShot = async (shotName: string) => {
    if (!selectedProjectId) { // Should be redundant due to check in handleOpenCreateShotModal
      console.error("Project ID missing at modal submission, this shouldn't happen.");
      return;
    }
    try {
      await createShotMutation.mutateAsync({
        shotName: shotName, // Already trimmed by modal
        projectId: selectedProjectId,
      });
      // Toast notification for success is handled within useCreateShot
      setIsCreateShotModalOpen(false); // Close modal on success
    } catch (e) {
      // Toast notification for error is handled within useCreateShot
      console.error("Failed to create shot from modal", e);
      // Optionally keep modal open on error, or display error in modal
    }
  };

  const handleSelectShotForEditingUI = (shot: Shot) => {
    setSelectedShot(shot);
  };

  const handleBackToShotList = () => {
    setSelectedShot(null);
  };

  // Callback for VideoEditLayout to trigger data refresh
  const handleShotImagesUpdate = () => {
    if (selectedProjectId) {
      // Invalidate and refetch the shots list for the current project
      // This will cause useListShots to get fresh data,
      // which in turn will update selectedShot via the useEffect, then videoPairConfigs.
      queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      // Optionally, could call refetchShots() directly if preferred and it correctly updates the list
      // refetchShots(); 
    } else {
      console.warn("[VideoTravelToolPage] Attempted to update shot images without a selected project ID.");
    }
  };

  if (isLoading) return <PageLoading text="Loading Art Voyages..." />;
  if (error) return <div className="container mx-auto p-4">Error loading shots: {error.message}</div>;
  if (!selectedProjectId) return <div className="container mx-auto p-4">Please select a project from the global header to manage video travel shots.</div>;

  return (
    <div className="art-voyage-theme container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-6 text-center text-art-voyage-text">Art Voyage Tool</h1>
      
      {!selectedShot ? (
        <>
          <div className="flex justify-center items-center mb-8">
            <Button onClick={handleOpenCreateShotModal} disabled={createShotMutation.isPending || !selectedProjectId} className="art-voyage-button">
              Create New Piece
            </Button>
          </div>
          <ShotListDisplay 
            shots={shots}
            onSelectShot={handleSelectShotForEditingUI}
            currentProjectId={selectedProjectId}
          />
        </>
      ) : (
        <VideoEditLayout
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
          onVideoControlModeChange={setVideoControlMode}
          onPairConfigChange={(pairId, field, value) => {
            setVideoPairConfigs(prev => prev.map(p => p.id === pairId ? { ...p, [field]: value } : p));
          }}
          onBatchVideoPromptChange={setBatchVideoPrompt}
          onBatchVideoFramesChange={setBatchVideoFrames}
          onBatchVideoContextChange={setBatchVideoContext}
          batchVideoSteps={batchVideoSteps}
          onBatchVideoStepsChange={setBatchVideoSteps}
          steerableMotionSettings={steerableMotionSettings}
          onSteerableMotionSettingsChange={handleSteerableMotionSettingsChange}
        />
      )}

      <CreateShotModal 
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={createShotMutation.isPending}
      />
    </div>
  );
};

export default VideoTravelToolPage; 