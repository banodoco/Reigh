import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Upload, Film } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { CharacterAnimateSettings } from '../settings';
import { PageFadeIn } from '@/shared/components/transitions';
import { createCharacterAnimateTask } from '@/shared/lib/tasks/characterAnimate';
import { useGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useGenerations';
import { ImageGalleryOptimized as ImageGallery } from '@/shared/components/ImageGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { cn } from '@/shared/lib/utils';

// Image/Video container skeleton loader
const MediaContainerSkeleton: React.FC = () => (
  <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
    <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
    </div>
  </div>
);

// Upload loading state
const UploadingMediaState: React.FC<{ type: 'image' | 'video' }> = ({ type }) => (
  <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
    <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3"></div>
      <p className="text-sm font-medium text-foreground">
        Uploading {type === 'image' ? 'image' : 'video'}...
      </p>
    </div>
  </div>
);

const CharacterAnimatePage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  const isMobile = useIsMobile();
  
  // Local state for inputs
  const [characterImage, setCharacterImage] = useState<{ url: string; file?: File } | null>(null);
  const [motionVideo, setMotionVideo] = useState<{ url: string; file?: File } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localMode, setLocalMode] = useState<'animate' | 'replace'>('animate');
  
  // Loading states for smooth transitions
  const [characterImageLoaded, setCharacterImageLoaded] = useState(false);
  const [motionVideoLoaded, setMotionVideoLoaded] = useState(false);
  
  const characterImageInputRef = useRef<HTMLInputElement>(null);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);
  
  // Track when we've just triggered a generation to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Track success state for button feedback
  const [showSuccessState, setShowSuccessState] = useState(false);
  
  // Load settings
  const { settings, update: updateSettings } = useToolSettings<CharacterAnimateSettings>(
    'character-animate',
    { projectId: selectedProjectId || null, enabled: !!selectedProjectId }
  );
  
  // Track whether settings have completed their initial load
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  useEffect(() => {
    // Mark settings as loaded after initial mount
    if (settings !== undefined) {
      setSettingsLoaded(true);
    }
  }, [settings]);
  
  // Get current project for aspect ratio
  const { projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Fetch all videos generated with character-animate tool type
  // Disable polling to prevent gallery flicker (character-animate tasks are long-running)
  const generationsQuery = useGenerations(
    selectedProjectId, 
    1, // page
    100, // limit
    !!selectedProjectId, // only enable when project is selected
    {
      toolType: 'character-animate',
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
      console.log('[CharacterAnimate] Data loaded, clearing videosViewJustEnabled flag', {
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
  
  // Initialize prompt from settings
  useEffect(() => {
    if (settings?.defaultPrompt) {
      setPrompt(settings.defaultPrompt);
    }
  }, [settings?.defaultPrompt]);
  
  // Load saved input image and video from settings, and sync mode
  useEffect(() => {
    if (settings?.inputImageUrl && !characterImage) {
      setCharacterImage({ url: settings.inputImageUrl });
    }
    if (settings?.inputVideoUrl && !motionVideo) {
      setMotionVideo({ url: settings.inputVideoUrl });
    }
    if (settings?.mode) {
      setLocalMode(settings.mode);
    }
  }, [settings?.inputImageUrl, settings?.inputVideoUrl, settings?.mode]);
  
  // Add timeout fallback for image loading on mobile
  useEffect(() => {
    if (characterImage && !characterImageLoaded) {
      const timer = setTimeout(() => {
        setCharacterImageLoaded(true);
      }, 2000); // Show image after 2 seconds even if not fully loaded
      return () => clearTimeout(timer);
    }
  }, [characterImage, characterImageLoaded]);
  
  // Add timeout fallback for video loading on mobile
  useEffect(() => {
    if (motionVideo && !motionVideoLoaded) {
      const timer = setTimeout(() => {
        setMotionVideoLoaded(true);
      }, 3000); // Show video after 3 seconds even if not fully loaded
      return () => clearTimeout(timer);
    }
  }, [motionVideo, motionVideoLoaded]);
  
  // Always generate a random seed for each generation
  const generateRandomSeed = useCallback(() => {
    return Math.floor(Math.random() * 1000000);
  }, []);
  
  // Handle mode change with optimistic update
  const handleModeChange = useCallback((newMode: 'animate' | 'replace') => {
    setLocalMode(newMode); // Immediate UI update
    updateSettings('project', { ...settings, mode: newMode }); // Background persist
  }, [settings, updateSettings]);
  
  // Handle character image upload
  const handleCharacterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG or JPG image (avoid WEBP)',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    try {
      // Upload to Supabase storage
      const uploadedUrl = await uploadImageToStorage(file);
      
      // Reset loaded state to show skeleton during image load
      setCharacterImageLoaded(false);
      setCharacterImage({ url: uploadedUrl, file });
      
      // Save URL to project settings for persistence
      if (selectedProjectId) {
        updateSettings('project', { ...settings, inputImageUrl: uploadedUrl });
      }
      
      toast({
        title: 'Image uploaded',
        description: 'Your character image has been saved',
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle motion video selection
  const handleMotionVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const fileName = `character-animate/${selectedProjectId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
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
      
      // Reset loaded state to show skeleton during video load
      setMotionVideoLoaded(false);
      setMotionVideo({ url: publicUrl, file });
      
      // Save URL to project settings for persistence
      if (selectedProjectId) {
        updateSettings('project', { ...settings, inputVideoUrl: publicUrl });
      }
      
      toast({
        title: 'Video uploaded',
        description: 'Your motion video has been saved',
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
  
  // Generate animation mutation
  const generateAnimationMutation = useMutation({
    mutationFn: async () => {
      if (!characterImage) throw new Error('No character image');
      if (!motionVideo) throw new Error('No motion video');
      if (!selectedProjectId) throw new Error('No project selected');
      
      // Create task using the character animate task creation utility
      const taskParams: import('@/shared/lib/tasks/characterAnimate').CharacterAnimateTaskParams = {
        project_id: selectedProjectId,
        character_image_url: characterImage.url,
        motion_video_url: motionVideo.url,
        prompt: prompt || settings?.defaultPrompt || 'natural expression; preserve outfit details',
        mode: localMode, // Use optimistic local mode
        resolution: '480p', // Always use 480p
        seed: generateRandomSeed(), // Always use a random seed
        random_seed: true, // Always random
      };
      
      console.log('[CharacterAnimate] Creating task with params:', taskParams);
      
      const result = await createCharacterAnimateTask(taskParams);
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: 'Task created',
        description: 'Your character animation task has been queued',
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
      console.error('[CharacterAnimate] Task creation failed:', error);
      toast({
        title: 'Failed to create task',
        description: error instanceof Error ? error.message : 'Failed to create animation task',
        variant: 'destructive',
      });
    },
  });
  
  const handleGenerate = () => {
    if (!characterImage) {
      toast({
        title: 'Missing character image',
        description: 'Please upload a character image first',
        variant: 'destructive',
      });
      return;
    }
    
    if (!motionVideo) {
      toast({
        title: 'Missing motion video',
        description: 'Please select a motion video',
        variant: 'destructive',
      });
      return;
    }
    
    generateAnimationMutation.mutate();
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
        <h1 className="text-3xl font-light tracking-tight text-foreground">Animate Characters</h1>
        
        {/* Mode Selection - First */}
        <div className="space-y-2">
          <Label>Mode</Label>
          <div className="flex items-center gap-4">
            <div className="flex space-x-2 flex-1">
              <Button
                variant={localMode === 'animate' ? 'default' : 'outline'}
                onClick={() => handleModeChange('animate')}
                className="flex-1"
              >
                Animate
              </Button>
              <Button
                variant={localMode === 'replace' ? 'default' : 'outline'}
                onClick={() => handleModeChange('replace')}
                className="flex-1"
              >
                Replace
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex-1">
              {localMode === 'animate' 
                ? 'Animate the character in input image with movements from the input video'
                : 'Replace the character in input video with the character in input image'
              }
            </p>
          </div>
        </div>
        
        {/* Input Image | Input Video */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Character Image */}
          <div className="space-y-3">
            <Label className="text-lg font-medium">
              {localMode === 'animate' 
                ? '✨ Character to animate'
                : '✨ Character to insert'
              }
            </Label>
            <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {isUploading ? (
                <UploadingMediaState type="image" />
              ) : characterImage ? (
                <>
                  {!characterImageLoaded && <MediaContainerSkeleton />}
                  <img
                    src={characterImage.url}
                    alt="Character"
                    className={cn(
                      'w-full h-full object-contain transition-all duration-300',
                      characterImageLoaded ? 'opacity-100' : 'opacity-0 absolute'
                    )}
                    onLoad={() => setCharacterImageLoaded(true)}
                  />
                </>
              ) : !settingsLoaded ? (
                // Show skeleton while settings are loading
                <MediaContainerSkeleton />
              ) : (
                <div className="text-center p-6">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">No input image</p>
                  <Button
                    onClick={() => characterImageInputRef.current?.click()}
                    disabled={isUploading}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Image
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={characterImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={handleCharacterImageUpload}
            />
            {characterImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => characterImageInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace Image
              </Button>
            )}
          </div>

          {/* Motion Video */}
          <div className="space-y-3">
            <Label className="text-lg font-medium">
              {localMode === 'animate' 
                ? '🎬 Source of movement'
                : '🎬 Video to replace character in'
              }
            </Label>
            <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {isUploading ? (
                <UploadingMediaState type="video" />
              ) : motionVideo ? (
                <>
                  {!motionVideoLoaded && <MediaContainerSkeleton />}
                  <video
                    src={motionVideo.url}
                    controls
                    preload="metadata"
                    playsInline
                    className={cn(
                      'w-full h-full object-contain transition-all duration-300',
                      motionVideoLoaded ? 'opacity-100' : 'opacity-0 absolute'
                    )}
                    onLoadedMetadata={() => setMotionVideoLoaded(true)}
                    onCanPlay={() => setMotionVideoLoaded(true)}
                  />
                </>
              ) : !settingsLoaded ? (
                // Show skeleton while settings are loading
                <MediaContainerSkeleton />
              ) : (
                <div className="text-center p-6">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">No input video</p>
                  <Button
                    onClick={() => motionVideoInputRef.current?.click()}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Video
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={motionVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleMotionVideoSelect}
            />
            {motionVideo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => motionVideoInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace Video
              </Button>
            )}
          </div>
        </div>

        {/* Settings Section */}
        <div className="space-y-5">
          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt (Optional)</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Brief rules, e.g., preserve outfit; natural expression; no background changes"
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!characterImage || !motionVideo || generateAnimationMutation.isPending || showSuccessState}
          className="w-full"
          size="lg"
          variant={showSuccessState ? 'default' : 'default'}
        >
          {generateAnimationMutation.isPending 
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
                  currentToolType="character-animate"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  currentToolTypeName="Animate Characters"
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
                No animations yet. Create your first one above!
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

export default CharacterAnimatePage;

