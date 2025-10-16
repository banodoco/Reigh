import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Copy, Check, LogIn } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { ProjectSelectorModal } from '@/shared/components/ProjectSelectorModal';
import BatchSettingsForm from './BatchSettingsForm';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import ShotImagesEditor from './ShotImagesEditor';
import type { GenerationRow } from '@/types/shots';

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
      'orchestratorPayload.input_images': orchestratorPayload.input_images,
      'orchestratorDetails.input_images': orchestratorDetails.input_images,
      'p.input_images': p.input_images,
      'orchestratorPayload.input_image_paths_resolved': orchestratorPayload.input_image_paths_resolved,
      'p.input_image_paths_resolved': p.input_image_paths_resolved,
      'p.imageUrls': p.imageUrls,
    });
    
    // Try multiple possible locations for input images
    if (Array.isArray(orchestratorPayload.input_images) && orchestratorPayload.input_images.length > 0) {
      console.log('[SharedGenDebug] Found images in orchestratorPayload.input_images:', orchestratorPayload.input_images);
      return orchestratorPayload.input_images.map(cleanUrl);
    }
    if (Array.isArray(orchestratorDetails.input_images) && orchestratorDetails.input_images.length > 0) {
      console.log('[SharedGenDebug] Found images in orchestratorDetails.input_images:', orchestratorDetails.input_images);
      return orchestratorDetails.input_images.map(cleanUrl);
    }
    if (Array.isArray(p.input_images) && p.input_images.length > 0) {
      console.log('[SharedGenDebug] Found images in p.input_images:', p.input_images);
      return p.input_images.map(cleanUrl);
    }
    if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) {
      console.log('[SharedGenDebug] Found images in p.imageUrls:', p.imageUrls);
      return p.imageUrls.map(cleanUrl);
    }
    if (Array.isArray(orchestratorPayload.input_image_paths_resolved)) {
      console.log('[SharedGenDebug] Found images in orchestratorPayload.input_image_paths_resolved:', orchestratorPayload.input_image_paths_resolved);
      return orchestratorPayload.input_image_paths_resolved.map(cleanUrl);
    }
    if (Array.isArray(p.input_image_paths_resolved)) {
      console.log('[SharedGenDebug] Found images in p.input_image_paths_resolved:', p.input_image_paths_resolved);
      return p.input_image_paths_resolved.map(cleanUrl);
    }
    
    console.warn('[SharedGenDebug] No input images found in any location!');
    return [];
  }, [task]);

  // Convert input images to shot images format for ShotImagesEditor
  const shotImages = useMemo(() => {
    const images = inputImages.map((url, index) => ({
      id: `shared-image-${index}`,
      shot_id: 'shared-shot',
      generation_id: null,
      position: index,
      image_url: url,
      created_at: new Date().toISOString(),
    }));
    
    console.log('[SharedGenDebug] Created shotImages:', {
      inputImagesCount: inputImages.length,
      shotImagesCount: images.length,
      shotImages: images
    });
    
    return images;
  }, [inputImages]);

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
    
    return {
      prompt: orchestratorPayload.prompt || orchestratorDetails.prompt || params.prompt || '',
      frames: orchestratorPayload.frames || orchestratorDetails.frames || params.frames || 16,
      context_frames: orchestratorPayload.context_frames || orchestratorDetails.context_frames || params.context_frames || 0,
      steps: orchestratorPayload.steps || orchestratorDetails.steps || params.steps || 8,
      width: orchestratorPayload.width || orchestratorDetails.width || params.width || 512,
      height: orchestratorPayload.height || orchestratorDetails.height || params.height || 512,
      motion: orchestratorPayload.motion || orchestratorDetails.motion || params.motion || 127,
      seed: orchestratorPayload.seed || orchestratorDetails.seed || params.seed || -1,
      negative_prompt: orchestratorPayload.negative_prompt || orchestratorDetails.negative_prompt || params.negative_prompt || '',
      advancedMode: orchestratorPayload.phase_config || orchestratorDetails.phase_config || params.phase_config ? true : false,
      phaseConfig: orchestratorPayload.phase_config || orchestratorDetails.phase_config || params.phase_config || null,
      generationMode: orchestratorPayload.generation_mode || orchestratorDetails.generation_mode || params.generation_mode || 'batch',
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
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
                  batchVideoContext={taskSettings.context_frames}
                  onImageReorder={() => {}} // Read-only
                  onImageSaved={async () => {}} // Read-only
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
                  autoCreateIndividualPrompts={false}
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
            <div className="mb-4">
              <SectionHeader title="Settings" theme="orange" />
            </div>
            <div className="pointer-events-none opacity-75">
              <BatchSettingsForm
                batchVideoPrompt={taskSettings.prompt}
                onBatchVideoPromptChange={() => {}} // No-op
                batchVideoFrames={taskSettings.frames}
                onBatchVideoFramesChange={() => {}} // No-op
                batchVideoContext={taskSettings.context_frames}
                onBatchVideoContextChange={() => {}} // No-op
                batchVideoSteps={taskSettings.steps}
                onBatchVideoStepsChange={() => {}} // No-op
                dimensionSource="custom"
                onDimensionSourceChange={() => {}} // No-op
                customWidth={taskSettings.width}
                onCustomWidthChange={() => {}} // No-op
                customHeight={taskSettings.height}
                onCustomHeightChange={() => {}} // No-op
                steerableMotionSettings={{
                  enabled: false,
                  motion: taskSettings.motion
                }}
                onSteerableMotionSettingsChange={() => {}} // No-op
                enhancePrompt={false}
                onEnhancePromptChange={() => {}} // No-op
                turboMode={false}
                onTurboModeChange={() => {}} // No-op
                amountOfMotion="low"
                onAmountOfMotionChange={() => {}} // No-op
                advancedMode={taskSettings.advancedMode}
                onAdvancedModeChange={() => {}} // No-op
                phaseConfig={taskSettings.phaseConfig}
                onPhaseConfigChange={() => {}} // No-op
                selectedPhasePresetId={null}
                onPhasePresetSelect={() => {}} // No-op
                onPhasePresetRemove={() => {}} // No-op
                autoCreateIndividualPrompts={false}
                onAutoCreateIndividualPromptsChange={() => {}} // No-op
                projectId="shared-project"
                shotId="shared-shot"
                isCloudGenerationEnabled={true}
              />
            </div>
          </CardContent>
        </Card>

        {/* Floating CTA Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            size="lg"
            onClick={handleCopyToAccount}
            disabled={isCopying || copied}
            className={`shadow-lg transition-all ${
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

