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
import { useGenerations } from '@/shared/hooks/useGenerations';
import { ImageGalleryOptimized as ImageGallery } from '@/shared/components/ImageGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';

const CharacterAnimatePage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  
  // Local state for inputs
  const [characterImage, setCharacterImage] = useState<{ url: string; file?: File } | null>(null);
  const [motionVideo, setMotionVideo] = useState<{ url: string; file?: File } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localMode, setLocalMode] = useState<'animate' | 'replace'>('animate');
  
  const characterImageInputRef = useRef<HTMLInputElement>(null);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);
  
  // Track when we've just triggered a generation to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Load settings
  const { settings, update: updateSettings } = useToolSettings<CharacterAnimateSettings>(
    'character-animate',
    { projectId: selectedProjectId || null, enabled: !!selectedProjectId }
  );
  
  // Get current project for aspect ratio
  const { projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Fetch all videos generated with character-animate tool type
  const { 
    data: videosData, 
    isLoading: videosLoading,
    isFetching: videosFetching,
    error: videosError 
  } = useGenerations(
    selectedProjectId, 
    1, // page
    100, // limit
    !!selectedProjectId, // only enable when project is selected
    {
      toolType: 'character-animate',
      mediaType: 'video'
    }
  );
  
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
      
      // Set flag to indicate we just created a task
      setVideosViewJustEnabled(true);
      
      // Invalidate tasks query to show the new task
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
              {characterImage ? (
                <img
                  src={characterImage.url}
                  alt="Character"
                  className="w-full h-full object-contain"
                />
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
              {motionVideo ? (
                <video
                  src={motionVideo.url}
                  controls
                  className="w-full h-full object-contain"
                />
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
          disabled={!characterImage || !motionVideo || generateAnimationMutation.isPending}
          className="w-full"
          size="lg"
        >
          {generateAnimationMutation.isPending ? 'Creating Task...' : 'Generate'}
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
                  itemsPerPage={12}
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

