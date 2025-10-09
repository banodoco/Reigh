import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Slider } from '@/shared/components/ui/slider';
import { Upload, Film } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { JoinClipsSettings } from '../settings';
import { PageFadeIn } from '@/shared/components/transitions';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useGenerations';
import { ImageGalleryOptimized as ImageGallery } from '@/shared/components/ImageGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { useIsMobile } from '@/shared/hooks/use-mobile';

const JoinClipsPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  const isMobile = useIsMobile();
  
  // Local state for inputs
  const [startingVideo, setStartingVideo] = useState<{ url: string; file?: File } | null>(null);
  const [endingVideo, setEndingVideo] = useState<{ url: string; file?: File } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Local state for generation parameters
  const [contextFrameCount, setContextFrameCount] = useState(10);
  const [gapFrameCount, setGapFrameCount] = useState(33);
  
  const startingVideoInputRef = useRef<HTMLInputElement>(null);
  const endingVideoInputRef = useRef<HTMLInputElement>(null);
  
  // Debounce timer for context frames updates (number input fires rapidly on hold)
  const contextFramesTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track when we've just triggered a generation to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Track success state for button feedback
  const [showSuccessState, setShowSuccessState] = useState(false);
  
  // Load settings
  const { settings, update: updateSettings } = useToolSettings<JoinClipsSettings>(
    'join-clips',
    { projectId: selectedProjectId || null, enabled: !!selectedProjectId }
  );
  
  // Get current project for aspect ratio
  const { projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Fetch all videos generated with join-clips tool type
  // Disable polling to prevent gallery flicker (join-clips tasks are long-running)
  const generationsQuery = useGenerations(
    selectedProjectId, 
    1, // page
    100, // limit
    !!selectedProjectId, // only enable when project is selected
    {
      toolType: 'join-clips',
      mediaType: 'video'
    },
    {
      disablePolling: true // Prevent periodic refetching that causes flicker
    }
  );
  
  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;
  const videosError = generationsQuery.error;
  
  // Clear videosViewJustEnabled flag when data loads
  useEffect(() => {
    if (videosViewJustEnabled && videosData?.items) {
      // Data has loaded, clear the flag
      setVideosViewJustEnabled(false);
      console.log('[JoinClips] Data loaded, clearing videosViewJustEnabled flag', {
        itemsCount: videosData.items.length,
        timestamp: Date.now()
      });
    }
  }, [videosViewJustEnabled, videosData?.items]);
  
  // Refresh gallery when returning to the page (since polling is disabled)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedProjectId) {
        queryClient.invalidateQueries({ 
          queryKey: ['unified-generations', 'project', selectedProjectId]
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedProjectId, queryClient]);
  
  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (contextFramesTimerRef.current) {
        clearTimeout(contextFramesTimerRef.current);
      }
    };
  }, []);
  
  // Initialize prompt and parameters from settings
  useEffect(() => {
    if (settings?.defaultPrompt) {
      setPrompt(settings.defaultPrompt);
    }
    if (settings?.contextFrameCount !== undefined) {
      setContextFrameCount(settings.contextFrameCount);
    }
    if (settings?.gapFrameCount !== undefined) {
      setGapFrameCount(settings.gapFrameCount);
    }
  }, [settings]);
  
  // Load saved input videos from settings
  useEffect(() => {
    if (settings?.startingVideoUrl && !startingVideo) {
      setStartingVideo({ url: settings.startingVideoUrl });
    }
    if (settings?.endingVideoUrl && !endingVideo) {
      setEndingVideo({ url: settings.endingVideoUrl });
    }
  }, [settings?.startingVideoUrl, settings?.endingVideoUrl]);
  
  // Handle starting video upload
  const handleStartingVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    try {
      // Upload video to Supabase storage
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `join-clips/${selectedProjectId}/${Date.now()}-starting-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('image_uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) throw error;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);
      
      setStartingVideo({ url: publicUrl, file });
      
      // Save URL to project settings for persistence
      if (selectedProjectId) {
        updateSettings('project', { ...settings, startingVideoUrl: publicUrl });
      }
      
      toast({
        title: 'Video uploaded',
        description: 'Your starting video has been saved',
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload video',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle ending video upload
  const handleEndingVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    try {
      // Upload video to Supabase storage
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `join-clips/${selectedProjectId}/${Date.now()}-ending-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('image_uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) throw error;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);
      
      setEndingVideo({ url: publicUrl, file });
      
      // Save URL to project settings for persistence
      if (selectedProjectId) {
        updateSettings('project', { ...settings, endingVideoUrl: publicUrl });
      }
      
      toast({
        title: 'Video uploaded',
        description: 'Your ending video has been saved',
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload video',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Generate join clips mutation
  const generateJoinClipsMutation = useMutation({
    mutationFn: async () => {
      if (!startingVideo) throw new Error('No starting video');
      if (!endingVideo) throw new Error('No ending video');
      if (!selectedProjectId) throw new Error('No project selected');
      
      // Create task using the join clips task creation utility
      const taskParams: import('@/shared/lib/tasks/joinClips').JoinClipsTaskParams = {
        project_id: selectedProjectId,
        starting_video_path: startingVideo.url,
        ending_video_path: endingVideo.url,
        prompt: prompt || settings?.defaultPrompt || 'smooth camera glide between scenes',
        context_frame_count: contextFrameCount,
        gap_frame_count: gapFrameCount,
        model: settings?.model || 'lightning_baseline_2_2_2',
        num_inference_steps: settings?.numInferenceSteps || 6,
        guidance_scale: settings?.guidanceScale || 3.0,
        seed: settings?.seed || -1,
        negative_prompt: settings?.negativePrompt || '',
        priority: settings?.priority || 0,
      };
      
      console.log('[JoinClips] Creating task with params:', taskParams);
      
      const result = await createJoinClipsTask(taskParams);
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: 'Task created',
        description: 'Your join clips task has been queued',
      });
      
      // Show success state on button
      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 3000);
      
      // Set flag to indicate we just created a task
      setVideosViewJustEnabled(true);
      
      // Invalidate both tasks and generations queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ 
        queryKey: ['unified-generations', 'project', selectedProjectId]
      });
    },
    onError: (error) => {
      console.error('[JoinClips] Task creation failed:', error);
      toast({
        title: 'Failed to create task',
        description: error instanceof Error ? error.message : 'Failed to create join clips task',
        variant: 'destructive',
      });
    },
  });
  
  const handleGenerate = () => {
    if (!startingVideo) {
      toast({
        title: 'Missing starting video',
        description: 'Please upload a starting video first',
        variant: 'destructive',
      });
      return;
    }
    
    if (!endingVideo) {
      toast({
        title: 'Missing ending video',
        description: 'Please upload an ending video',
        variant: 'destructive',
      });
      return;
    }
    
    generateJoinClipsMutation.mutate();
  };
  
  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project first.</p>
      </div>
    );
  }

  return (
    <PageFadeIn>
      <div className="flex flex-col space-y-6 pb-6 px-4 max-w-7xl mx-auto pt-6">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Join Clips</h1>
        
        {/* Input Videos with Frame Controls in Center */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
          {/* Starting Video */}
          <div className="space-y-3">
            <Label className="text-lg font-medium">
              🎬 Starting Video
            </Label>
            <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {startingVideo ? (
                <video
                  src={startingVideo.url}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">No starting video</p>
                  <Button
                    onClick={() => startingVideoInputRef.current?.click()}
                    disabled={isUploading}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Video
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={startingVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleStartingVideoUpload}
            />
            {startingVideo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startingVideoInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace Video
              </Button>
            )}
          </div>

          {/* Frame Controls - Centered Between Videos */}
          <div className="hidden md:flex flex-col space-y-4 px-4 min-w-[200px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="gapFrameCount" className="text-sm">
                  Gap Frames
                </Label>
                <span className="text-sm font-medium">{gapFrameCount}</span>
              </div>
              <Slider
                id="gapFrameCount"
                min={1}
                max={Math.max(1, 81 - (contextFrameCount * 2))}
                step={1}
                value={[Math.max(1, gapFrameCount)]}
                onValueChange={(values) => {
                  const val = Math.max(1, values[0]);
                  setGapFrameCount(val);
                  updateSettings('project', { ...settings, gapFrameCount: val });
                }}
              />
              <p className="text-xs text-muted-foreground text-center">to generate</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contextFrameCount" className="text-sm">
                Context Frames
              </Label>
              <Input
                id="contextFrameCount"
                type="number"
                min={1}
                max={30}
                value={contextFrameCount}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 1);
                  if (!isNaN(val) && val > 0) {
                    setContextFrameCount(val);
                    // Ensure gap frames doesn't exceed limit
                    const maxGap = Math.max(1, 81 - (val * 2));
                    const newGapFrames = gapFrameCount > maxGap ? maxGap : gapFrameCount;
                    if (gapFrameCount > maxGap) {
                      setGapFrameCount(maxGap);
                    }
                    
                    // Debounce settings update to prevent glitchiness
                    if (contextFramesTimerRef.current) {
                      clearTimeout(contextFramesTimerRef.current);
                    }
                    contextFramesTimerRef.current = setTimeout(() => {
                      updateSettings('project', { ...settings, contextFrameCount: val, gapFrameCount: newGapFrames });
                    }, 300);
                  }
                }}
                className="text-center"
              />
              <p className="text-xs text-muted-foreground text-center">from each clip</p>
            </div>
          </div>

          {/* Ending Video */}
          <div className="space-y-3">
            <Label className="text-lg font-medium">
              🎬 Ending Video
            </Label>
            <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {endingVideo ? (
                <video
                  src={endingVideo.url}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">No ending video</p>
                  <Button
                    onClick={() => endingVideoInputRef.current?.click()}
                    disabled={isUploading}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Video
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={endingVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleEndingVideoUpload}
            />
            {endingVideo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => endingVideoInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace Video
              </Button>
            )}
          </div>
        </div>

        {/* Frame Controls - Mobile Only (shown below videos) */}
        <div className="md:hidden grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="gapFrameCountMobile" className="text-sm">
                Gap Frames
              </Label>
              <span className="text-sm font-medium">{gapFrameCount}</span>
            </div>
            <Slider
              id="gapFrameCountMobile"
              min={1}
              max={Math.max(1, 81 - (contextFrameCount * 2))}
              step={1}
              value={[Math.max(1, gapFrameCount)]}
              onValueChange={(values) => {
                const val = Math.max(1, values[0]);
                setGapFrameCount(val);
                updateSettings('project', { ...settings, gapFrameCount: val });
              }}
            />
            <p className="text-xs text-muted-foreground text-center">to generate</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contextFrameCountMobile" className="text-sm">
              Context Frames
            </Label>
            <Input
              id="contextFrameCountMobile"
              type="number"
              min={1}
              max={30}
              value={contextFrameCount}
              onChange={(e) => {
                const val = Math.max(1, parseInt(e.target.value) || 1);
                if (!isNaN(val) && val > 0) {
                  setContextFrameCount(val);
                  // Ensure gap frames doesn't exceed limit
                  const maxGap = Math.max(1, 81 - (val * 2));
                  const newGapFrames = gapFrameCount > maxGap ? maxGap : gapFrameCount;
                  if (gapFrameCount > maxGap) {
                    setGapFrameCount(maxGap);
                  }
                  
                  // Debounce settings update to prevent glitchiness
                  if (contextFramesTimerRef.current) {
                    clearTimeout(contextFramesTimerRef.current);
                  }
                  contextFramesTimerRef.current = setTimeout(() => {
                    updateSettings('project', { ...settings, contextFrameCount: val, gapFrameCount: newGapFrames });
                  }, 300);
                }
              }}
              className="text-center"
            />
            <p className="text-xs text-muted-foreground text-center">from each clip</p>
          </div>
        </div>

        {/* Prompt Section */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Transition Prompt</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the transition between clips, e.g., smooth camera glide between scenes"
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!startingVideo || !endingVideo || generateJoinClipsMutation.isPending || showSuccessState}
          className="w-full"
          size="lg"
          variant={showSuccessState ? 'default' : 'default'}
        >
          {generateJoinClipsMutation.isPending 
            ? 'Creating Task...' 
            : showSuccessState 
            ? '✓ Task Created!' 
            : 'Generate'}
        </Button>

        {/* Results Gallery */}
        {(() => {
          const hasValidData = videosData?.items && videosData.items.length > 0;
          const isLoadingOrFetching = videosLoading || videosFetching;
          
          // Show skeleton only if we're loading AND we already have data (refetching)
          // This prevents showing "Previous Results" when there might not be any data yet
          const shouldShowSkeleton = (isLoadingOrFetching || videosViewJustEnabled) && hasValidData;
          
          if (shouldShowSkeleton) {
            return (
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-xl font-medium">
                  Previous Results ({videosData.items.length})
                </h2>
                <SkeletonGallery
                  count={videosData.items.length}
                  columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 3, '2xl': 3 }}
                  showControls={true}
                  projectAspectRatio={projectAspectRatio}
                />
              </div>
            );
          }
          
          if (hasValidData) {
            return (
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-xl font-medium">
                  Previous Results ({videosData.items.length})
                </h2>
                <ImageGallery
                  images={videosData.items || []}
                  allShots={[]}
                  onAddToLastShot={async () => false} // No-op for video gallery
                  onAddToLastShotWithoutPosition={async () => false} // No-op for video gallery
                  currentToolType="join-clips"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  currentToolTypeName="Join Clips"
                  showShotFilter={false}
                  initialShotFilter="all"
                  columnsPerRow={3}
                  itemsPerPage={isMobile ? 20 : 12} // Mobile: 20 (10 rows of 2), Desktop: 12 (4 rows of 3)
                  reducedSpacing={true}
                  hidePagination={videosData.items.length <= (isMobile ? 20 : 12)}
                />
              </div>
            );
          }
          
          // Only show empty state when not loading and no data
          if (!isLoadingOrFetching) {
            return (
              <div className="text-sm text-muted-foreground text-center pt-4 border-t">
                No joined clips yet. Create your first one above!
              </div>
            );
          }
          
          // While loading for the first time, don't show anything
          return null;
        })()}
      </div>
    </PageFadeIn>
  );
};

export default JoinClipsPage;

