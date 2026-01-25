import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Copy, Check, LogIn } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { ProjectSelectorModal } from '@/shared/components/ProjectSelectorModal';
import BatchSettingsForm from './BatchSettingsForm';
import { MotionControl } from './MotionControl';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import ShotImagesEditor from './ShotImagesEditor';
import type { GenerationRow } from '@/types/shots';
import { PhaseConfig } from '../settings';

interface SharedGenerationViewProps {
  shareData: {
    generation: any;
    task: any;
    creator_id: string | null;
    view_count: number;
  };
  shareSlug: string;
}

/**
 * SharedGenerationView - Displays a shared generation with video and settings
 * 
 * Features:
 * - Video player with thumbnail fallback
 * - Task settings details (reusing SharedTaskDetails)
 * - Floating "Copy to My Account" CTA
 * - Authentication flow handling
 */
export const SharedGenerationView: React.FC<SharedGenerationViewProps> = ({
  shareData,
  shareSlug
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);

  const generation = shareData.generation;
  const task = shareData.task;
  const isMobile = useIsMobile();

  // Extract generation mode and frames early for shotImages calculation
  const params = task?.params || {};
  const orchestratorPayload = params.full_orchestrator_payload || {};
  const orchestratorDetails = params.orchestrator_details || {};
  const generationMode = orchestratorDetails.generation_mode || orchestratorPayload.generation_mode || params.generation_mode || 'batch';
  
  // Calculate total frames from segment_frames_expanded (sum of all segment durations)
  const segmentFramesEarly = orchestratorDetails.segment_frames_expanded 
    || orchestratorPayload.segment_frames_expanded 
    || [];
  const frames = segmentFramesEarly.length > 0 
    ? segmentFramesEarly.reduce((sum: number, val: number) => sum + val, 0)
    : (orchestratorPayload.frames || orchestratorDetails.frames || params.frames || 16);

  // Extract input images from task params
  const inputImages = useMemo(() => {
    console.log('[SharedGenDebug] Extracting input images from task:', {
      hasTask: !!task,
      taskParams: task?.params,
      fullTask: task
    });
    
    const cleanUrl = (url: string): string => {
      if (typeof url !== 'string') return url;
      return url.replace(/^["']|["']$/g, '');
    };
    
    const p = task?.params || {};
    const orchestratorPayload = p.full_orchestrator_payload || {};
    const orchestratorDetails = p.orchestrator_details || {};
    
    console.log('[SharedGenDebug] Checking locations:', {
      'orchestratorDetails.input_image_paths_resolved': orchestratorDetails.input_image_paths_resolved,
      'orchestratorPayload.input_image_paths_resolved': orchestratorPayload.input_image_paths_resolved,
      'p.input_image_paths_resolved': p.input_image_paths_resolved,
      'p.input_images': p.input_images,
      'p.imageUrls': p.imageUrls,
    });
    
    // Try multiple possible locations for input images
    // Primary location: orchestrator_details.input_image_paths_resolved (current task structure)
    if (Array.isArray(orchestratorDetails.input_image_paths_resolved) && orchestratorDetails.input_image_paths_resolved.length > 0) {
      console.log('[SharedGenDebug] Found images in orchestratorDetails.input_image_paths_resolved:', orchestratorDetails.input_image_paths_resolved);
      return orchestratorDetails.input_image_paths_resolved.map(cleanUrl);
    }
    // Legacy location: full_orchestrator_payload.input_image_paths_resolved
    if (Array.isArray(orchestratorPayload.input_image_paths_resolved) && orchestratorPayload.input_image_paths_resolved.length > 0) {
      console.log('[SharedGenDebug] Found images in orchestratorPayload.input_image_paths_resolved:', orchestratorPayload.input_image_paths_resolved);
      return orchestratorPayload.input_image_paths_resolved.map(cleanUrl);
    }
    // Direct params location
    if (Array.isArray(p.input_image_paths_resolved) && p.input_image_paths_resolved.length > 0) {
      console.log('[SharedGenDebug] Found images in p.input_image_paths_resolved:', p.input_image_paths_resolved);
      return p.input_image_paths_resolved.map(cleanUrl);
    }
    // Alternative names
    if (Array.isArray(p.input_images) && p.input_images.length > 0) {
      console.log('[SharedGenDebug] Found images in p.input_images:', p.input_images);
      return p.input_images.map(cleanUrl);
    }
    if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) {
      console.log('[SharedGenDebug] Found images in p.imageUrls:', p.imageUrls);
      return p.imageUrls.map(cleanUrl);
    }
    
    console.warn('[SharedGenDebug] No input images found in any location!');
    return [];
  }, [task]);

  // Convert input images to shot images format for ShotImagesEditor
  const shotImages = useMemo(() => {
    // Extract segment_frames_expanded from task params
    const p = task?.params || {};
    const orchestratorPayload = p.full_orchestrator_payload || {};
    const orchestratorDetails = p.orchestrator_details || {};
    const segmentFrames = orchestratorDetails.segment_frames_expanded 
      || orchestratorPayload.segment_frames_expanded 
      || p.segment_frames_expanded
      || [];
    
    // In timeline mode, first image is ALWAYS at frame 0
    // segment_frames_expanded contains frame COUNTS per segment (e.g., [38, 38])
    // We need to convert to cumulative positions (e.g., [0, 38, 76])
    // For n images, we have n-1 segments
    const timelineFrames: number[] = [];
    if (generationMode === 'timeline' && segmentFrames.length > 0) {
      let cumulativePosition = 0;
      timelineFrames.push(0); // First image always at frame 0
      for (const frameCount of segmentFrames) {
        cumulativePosition += frameCount;
        timelineFrames.push(cumulativePosition);
      }
    }
    
    console.log('[SharedGenDebug] Segment frames from task:', {
      rawSegmentFrames: segmentFrames,
      timelineFramesWithZero: timelineFrames,
      orchestratorPayload_segment_frames: orchestratorPayload.segment_frames_expanded,
      orchestratorDetails_segment_frames: orchestratorDetails.segment_frames_expanded,
      params_segment_frames: p.segment_frames_expanded,
    });

    const images = inputImages.map((url, index) => ({
      id: `shared-image-${index}`,
      shotImageEntryId: `shared-image-${index}`, // Required for Timeline component
      shot_id: 'shared-shot',
      generation_id: null,
      position: index,
      imageUrl: url,
      image_url: url,
      location: url,
      // Use actual timeline frames (with 0 prepended) if available, otherwise calculate
      timeline_frame: generationMode === 'timeline' 
        ? (timelineFrames[index] !== undefined 
            ? timelineFrames[index] 
            : Math.round(index * (frames / (inputImages.length - 1 || 1))))
        : undefined,
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }));
    
    console.log('[SharedGenDebug] Created shotImages:', {
      inputImagesCount: inputImages.length,
      shotImagesCount: images.length,
      shotImages: images,
      generationMode: generationMode,
      usedSegmentFrames: timelineFrames.length > 0,
      framePositions: images.map(img => img.timeline_frame),
    });
    
    return images;
  }, [inputImages, generationMode, frames, task]);

  // Check authentication status
  useEffect(() => {
    checkAuth();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      
      // If user just signed in, check for pending share
      if (event === 'SIGNED_IN') {
        checkPendingShare();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
  };

  const checkPendingShare = () => {
    const pendingShare = sessionStorage.getItem('pending_share');
    if (pendingShare) {
      sessionStorage.removeItem('pending_share');
      // Automatically trigger copy
      handleCopyToAccount();
    }
  };

  const handleCopyToAccount = async () => {
    if (!isAuthenticated) {
      // Store share slug in session storage
      sessionStorage.setItem('pending_share', shareSlug);
      
      // Redirect to sign in/up
      toast({
        title: "Sign in required",
        description: "Please sign in to copy this to your account"
      });
      
      // Redirect to home which will show auth
      navigate('/?action=copy-share');
      return;
    }

    // Show project selector for authenticated users
    setShowProjectSelector(true);
  };

  const handleProjectSelected = async (projectId: string) => {
    setShowProjectSelector(false);
    setIsCopying(true);

    try {
      // All client-side! RLS policies protect against unauthorized writes
      
      // Copy task data (excluding id and project-specific fields)
      const taskData = { ...task };
      delete taskData.id;
      delete taskData.created_at;
      delete taskData.updated_at;
      
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          ...taskData,
          project_id: projectId,
          copied_from_share: shareSlug,
        })
        .select('id')
        .single();

      if (taskError) {
        console.error('[SharedGenerationView] Failed to copy task:', taskError);
        toast({
          title: "Copy failed",
          description: taskError.message || "Failed to copy task settings",
          variant: "destructive"
        });
        setIsCopying(false);
        return;
      }

      // Copy generation data (excluding id and system fields)
      const generationData = { ...generation };
      delete generationData.id;
      delete generationData.created_at;
      delete generationData.updated_at;
      
      // generations.tasks is JSONB array, update it with the new task ID
      const tasksArray = [newTask.id];
      
      const { data: newGeneration, error: genError } = await supabase
        .from('generations')
        .insert({
          ...generationData,
          tasks: tasksArray, // JSONB array of task IDs
          project_id: projectId, // Ensure project_id is set correctly
          copied_from_share: shareSlug,
        })
        .select('id')
        .single();

      if (genError) {
        console.error('[SharedGenerationView] Failed to copy generation:', genError);
        toast({
          title: "Copy failed",
          description: genError.message || "Failed to copy generation",
          variant: "destructive"
        });
        setIsCopying(false);
        return;
      }

      // Create the original variant for the copied generation
      if (generationData.location) {
        await supabase.from('generation_variants').insert({
          generation_id: newGeneration.id,
          location: generationData.location,
          thumbnail_url: generationData.thumbnail_url || generationData.location,
          is_primary: true,
          variant_type: 'original',
          name: 'Original',
          params: generationData.params || {},
        });
      }

      console.log('[SharedGenerationView] Successfully copied:', {
        newTaskId: newTask.id,
        newGenerationId: newGeneration.id,
        projectId
      });

      setCopied(true);
      toast({
        title: "Copied to your account!",
        description: "You can now find this in your generations"
      });

      setTimeout(() => {
        navigate('/generations');
      }, 1500);

    } catch (error) {
      console.error('[SharedGenerationView] Unexpected error:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive"
      });
      setIsCopying(false);
    }
  };

  // Extract task settings from cached task data
  const taskSettings = useMemo(() => {
    const params = task?.params || {};
    const orchestratorPayload = params.full_orchestrator_payload || {};
    const orchestratorDetails = params.orchestrator_details || {};
    
    // Get frames from segment_frames_expanded if available (first value represents frames per segment)
    const segmentFrames = orchestratorDetails.segment_frames_expanded || orchestratorPayload.segment_frames_expanded || [];
    const framesValue = segmentFrames[0] || orchestratorPayload.frames || orchestratorDetails.frames || params.frames || 16;
    
    // Extract steps - could be in steps_per_phase for advanced mode
    const phaseConfigData = orchestratorDetails.phase_config || orchestratorPayload.phase_config || params.phase_config || null;
    const stepsPerPhase = phaseConfigData?.steps_per_phase;
    const stepsValue = stepsPerPhase?.[0] || orchestratorPayload.steps || orchestratorDetails.steps || params.steps || 6;
    
    // Parse resolution
    const resolutionStr = orchestratorDetails.parsed_resolution_wh || orchestratorPayload.parsed_resolution_wh || '';
    let width = 512, height = 512;
    if (resolutionStr && resolutionStr.includes('x')) {
      const [w, h] = resolutionStr.split('x').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    }
    
    // Get negative prompts from expanded array
    const negativePromptsExpanded = orchestratorDetails.negative_prompts_expanded || orchestratorPayload.negative_prompts_expanded || [];
    const negativePrompt = negativePromptsExpanded[0] || orchestratorPayload.negative_prompt || orchestratorDetails.negative_prompt || params.negative_prompt || '';
    
    return {
      prompt: orchestratorDetails.base_prompt || orchestratorPayload.base_prompt || params.prompt || '',
      frames: framesValue,
      context_frames: orchestratorPayload.context_frames || orchestratorDetails.context_frames || params.context_frames || 0,
      steps: stepsValue,
      width,
      height,
      motion: orchestratorPayload.amount_of_motion || orchestratorDetails.amount_of_motion || params.amount_of_motion || 50,
      seed: orchestratorDetails.seed_base || orchestratorPayload.seed_base || params.seed || -1,
      negative_prompt: negativePrompt,
      advancedMode: phaseConfigData ? true : false,
      phaseConfig: phaseConfigData as PhaseConfig | null,
      generationMode: orchestratorDetails.generation_mode || orchestratorPayload.generation_mode || params.generation_mode || 'batch',
      textBeforePrompts: orchestratorPayload.text_before_prompts || orchestratorDetails.text_before_prompts || params.text_before_prompts || '',
      textAfterPrompts: orchestratorPayload.text_after_prompts || orchestratorDetails.text_after_prompts || params.text_after_prompts || '',
      enhancePrompt: orchestratorDetails.enhance_prompt || orchestratorPayload.enhance_prompt || params.enhance_prompt || false,
      turboMode: params.turbo_mode || false,
      motionMode: phaseConfigData ? 'advanced' as const : 'basic' as const,
    };
  }, [task]);

  const videoUrl = getDisplayUrl((generation?.location || generation?.imageUrl || '') as string);
  const thumbnailUrl = generation?.thumbUrl ? getDisplayUrl(generation.thumbUrl as string) : null;

  console.log('[SharedGenDebug] Rendering component with:', {
    shotImagesLength: shotImages.length,
    shotImages: shotImages,
    videoUrl,
    thumbnailUrl,
    taskSettingsPrompt: taskSettings.prompt?.substring(0, 50),
    taskSettingsContextFrames: taskSettings.context_frames,
  });

  return (
    <div className="container mx-auto px-4 pt-8 pb-24 sm:pb-28 max-w-6xl">
      <div className="space-y-6">
        {/* Output Video Display - FIRST */}
        <Card className="overflow-hidden">
          <div className="relative bg-black w-full flex items-center justify-center min-h-[300px] max-h-[70vh]">
            {/* Thumbnail (shown until video loads) */}
            {thumbnailUrl && !videoLoaded && (
              <img 
                src={thumbnailUrl}
                alt="Generation preview"
                className="w-full h-full object-contain max-h-[70vh]"
              />
            )}
            
            {/* Video */}
            {videoUrl && (
              <video
                src={videoUrl}
                controls
                loop
                playsInline
                className="w-full h-full object-contain max-h-[70vh]"
                onLoadedData={() => setVideoLoaded(true)}
                poster={thumbnailUrl || undefined}
              />
            )}
            
            {!videoUrl && !thumbnailUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                No preview available
              </div>
            )}
          </div>
        </Card>

        {/* Input Images - Timeline/Batch Editor (Read-Only) - SECOND */}
        {shotImages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-light">
                {taskSettings.generationMode === 'timeline' ? 'Timeline View' : 'Batch View'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="pointer-events-none select-none opacity-90">
                <ShotImagesEditor
                  isModeReady={true}
                  settingsError={null}
                  isMobile={isMobile}
                  generationMode={taskSettings.generationMode as 'batch' | 'timeline'}
                  onGenerationModeChange={() => {}} // Read-only
                  selectedShotId="shared-shot"
                  preloadedImages={shotImages}
                  readOnly={true}
                  projectId="shared-project"
                  shotName="Shared Generation"
                  batchVideoFrames={taskSettings.frames}
                  onImageReorder={() => {}} // Read-only
                  onContextFramesChange={() => {}} // Read-only
                  onFramePositionsChange={() => {}} // Read-only
                  onImageDrop={async () => {}} // Read-only
                  pendingPositions={new Map()}
                  onPendingPositionApplied={() => {}} // Read-only
                  onImageDelete={() => {}} // Read-only
                  onBatchImageDelete={() => {}} // Read-only
                  onImageDuplicate={() => {}} // Read-only
                  columns={isMobile ? 2 : 3}
                  skeleton={null}
                  unpositionedGenerationsCount={0}
                  onOpenUnpositionedPane={() => {}} // Read-only
                  fileInputKey={0}
                  onImageUpload={async () => {}} // Read-only
                  isUploadingImage={false}
                  duplicatingImageId={null}
                  duplicateSuccessImageId={null}
                  projectAspectRatio={undefined}
                  defaultPrompt={taskSettings.prompt}
                  onDefaultPromptChange={() => {}} // Read-only
                  defaultNegativePrompt={taskSettings.negative_prompt}
                  onDefaultNegativePromptChange={() => {}} // Read-only
                  structureVideoPath={null}
                  structureVideoMetadata={null}
                  structureVideoTreatment="motion"
                  structureVideoMotionStrength={taskSettings.motion}
                  structureVideoType="flow"
                  onStructureVideoChange={() => {}} // Read-only
                  onSelectionChange={() => {}} // Read-only
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Section - Mirroring ShotEditor structure, all disabled */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-light">Generation Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left Column: Main Settings */}
              <div className="lg:w-1/2 order-2 lg:order-1">
                <div className="mb-4">
                  <SectionHeader title="Settings" theme="orange" />
                </div>
                <div className="pointer-events-none opacity-75">
                  <BatchSettingsForm
                    batchVideoPrompt={taskSettings.prompt}
                    onBatchVideoPromptChange={() => {}} // No-op
                    batchVideoFrames={taskSettings.frames}
                    onBatchVideoFramesChange={() => {}} // No-op
                    batchVideoSteps={taskSettings.steps}
                    onBatchVideoStepsChange={() => {}} // No-op
                    dimensionSource="custom"
                    onDimensionSourceChange={() => {}} // No-op
                    customWidth={taskSettings.width}
                    onCustomWidthChange={() => {}} // No-op
                    customHeight={taskSettings.height}
                    onCustomHeightChange={() => {}} // No-op
                    negativePrompt={taskSettings.negative_prompt || ''}
                    onNegativePromptChange={() => {}} // No-op
                    projects={[]}
                    selectedProjectId={null}
                    enhancePrompt={taskSettings.enhancePrompt}
                    onEnhancePromptChange={() => {}} // No-op
                    turboMode={taskSettings.turboMode}
                    onTurboModeChange={() => {}} // No-op
                    amountOfMotion={taskSettings.motion}
                    onAmountOfMotionChange={() => {}} // No-op
                    advancedMode={taskSettings.advancedMode}
                    phaseConfig={taskSettings.phaseConfig}
                    onPhaseConfigChange={() => {}} // No-op
                    selectedPhasePresetId={null}
                    onPhasePresetSelect={() => {}} // No-op
                    onPhasePresetRemove={() => {}} // No-op
                    accelerated={false}
                    onAcceleratedChange={() => {}} // No-op
                    randomSeed={true}
                    onRandomSeedChange={() => {}} // No-op
                  />
                </div>
              </div>

              {/* Right Column: Motion Control */}
              <div className="lg:w-1/2 order-1 lg:order-2">
                <div className="mb-4">
                  <SectionHeader title="Motion" theme="purple" />
                </div>
                <div className="pointer-events-none opacity-75">
                  <MotionControl
                    motionMode={taskSettings.advancedMode ? 'advanced' : (taskSettings.motionMode === 'presets' ? 'basic' : (taskSettings.motionMode || 'basic'))}
                    onMotionModeChange={() => {}} // No-op
                    selectedLoras={[]}
                    availableLoras={[]}
                    onAddLoraClick={() => {}} // No-op
                    onRemoveLora={() => {}} // No-op
                    onLoraStrengthChange={() => {}} // No-op
                    selectedPhasePresetId={null}
                    onPhasePresetSelect={() => {}} // No-op
                    onPhasePresetRemove={() => {}} // No-op
                    currentSettings={{
                      basePrompt: taskSettings.prompt,
                      negativePrompt: taskSettings.negative_prompt,
                      enhancePrompt: taskSettings.enhancePrompt,
                      durationFrames: taskSettings.frames,
                    }}
                    phaseConfig={taskSettings.phaseConfig || undefined}
                    onPhaseConfigChange={() => {}} // No-op
                    randomSeed={false}
                    onRandomSeedChange={() => {}} // No-op
                    turboMode={taskSettings.turboMode}
                    settingsLoading={false}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Floating CTA Button - Fixed at bottom with safe area spacing */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="container mx-auto max-w-6xl px-4 pb-4 sm:pb-6">
          <div className="flex justify-end pointer-events-auto">
            <Button
              size="lg"
              onClick={handleCopyToAccount}
              disabled={isCopying || copied}
              className={`shadow-xl transition-all ${
                copied 
                  ? 'bg-green-500 hover:bg-green-600' 
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {isCopying ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Copying...
                </>
              ) : copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : isAuthenticated ? (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to My Account
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In to Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Project Selector Modal */}
      <ProjectSelectorModal
        open={showProjectSelector}
        onOpenChange={setShowProjectSelector}
        onSelect={handleProjectSelected}
        title="Copy to Project"
        description="Choose which project to add this generation to"
      />
    </div>
  );
};

