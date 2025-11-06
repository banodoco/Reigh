import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Upload, Film, X, Play, Plus, GripVertical, Trash2 } from 'lucide-react';
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
import { LoraManager } from '@/shared/components/LoraManager';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import type { LoraModel } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';
import { extractVideoPosterFrame } from '@/shared/utils/videoPosterExtractor';

// Types for clip management
interface VideoClip {
  id: string;
  url: string;
  posterUrl?: string;
  file?: File;
  loaded: boolean;
  playing: boolean;
}

interface TransitionPrompt {
  id: string; // ID of the clip AFTER this transition (so prompt between clip N and N+1 has id of clip N+1)
  prompt: string;
}

// Video container skeleton loader
const VideoContainerSkeleton: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted animate-pulse">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
  </div>
);

// Upload loading state
const UploadingVideoState: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3"></div>
    <p className="text-sm font-medium text-foreground">Uploading video...</p>
  </div>
);

const JoinClipsPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  const isMobile = useIsMobile();
  
  // Local state for clips list
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);
  
  // Transition prompts (one for each pair)
  const [transitionPrompts, setTransitionPrompts] = useState<TransitionPrompt[]>([]);
  
  // Global settings
  const [negativePrompt, setNegativePrompt] = useState('');
  const [contextFrameCount, setContextFrameCount] = useState(10);
  const [gapFrameCount, setGapFrameCount] = useState(33);
  const [replaceMode, setReplaceMode] = useState(true);
  
  // Refs for file inputs (we'll create them dynamically)
  const fileInputRefs = useRef<{ [clipId: string]: HTMLInputElement | null }>({});
  
  // Refs for video elements
  const videoRefs = useRef<{ [clipId: string]: HTMLVideoElement | null }>({});
  
  // Debounce timer for context frames updates
  const contextFramesTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track when we've just triggered a generation
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Track success state for button feedback
  const [showSuccessState, setShowSuccessState] = useState(false);
  
  // Track drag state per clip
  const [draggingOverClipId, setDraggingOverClipId] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  
  // Load settings
  const { settings, update: updateSettings } = useToolSettings<JoinClipsSettings>(
    'join-clips',
    { projectId: selectedProjectId || null, enabled: !!selectedProjectId }
  );
  
  // Track whether settings have completed their initial load
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  useEffect(() => {
    if (settings !== undefined) {
      setSettingsLoaded(true);
    }
  }, [settings]);
  
  // Get current project for aspect ratio
  const { projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Fetch available LoRAs
  const publicLorasResult = useListPublicResources('lora');
  const availableLoras = ((publicLorasResult.data || []) as any[]).map(resource => resource.metadata || {}) as LoraModel[];
  
  // Initialize LoRA manager
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: 'join-clips',
  });
  
  // Fetch all videos
  const generationsQuery = useGenerations(
    selectedProjectId, 
    1,
    100,
    !!selectedProjectId,
    {
      toolType: 'join-clips',
      mediaType: 'video'
    },
    {
      disablePolling: true
    }
  );
  
  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;
  
  // Clear videosViewJustEnabled flag when data loads
  useEffect(() => {
    if (videosViewJustEnabled && videosData?.items) {
      setVideosViewJustEnabled(false);
    }
  }, [videosViewJustEnabled, videosData?.items]);
  
  // Refresh gallery when returning to the page
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
  
  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (contextFramesTimerRef.current) {
        clearTimeout(contextFramesTimerRef.current);
      }
    };
  }, []);
  
  // Initialize parameters from settings
  useEffect(() => {
    if (settings?.contextFrameCount !== undefined) {
      setContextFrameCount(settings.contextFrameCount);
    }
    if (settings?.gapFrameCount !== undefined) {
      setGapFrameCount(settings.gapFrameCount);
    }
    if (settings?.replaceMode !== undefined) {
      setReplaceMode(settings.replaceMode);
    }
    if (settings?.negativePrompt !== undefined) {
      setNegativePrompt(settings.negativePrompt);
    }
  }, [settings]);
  
  // Initialize clips from settings (legacy two-video support) or create 2 empty slots
  useEffect(() => {
    if (settings && settingsLoaded && clips.length === 0) {
      const initialClips: VideoClip[] = [];
      
      if (settings.startingVideoUrl) {
        initialClips.push({
          id: crypto.randomUUID(),
          url: settings.startingVideoUrl,
          posterUrl: settings.startingVideoPosterUrl,
          loaded: false,
          playing: false
        });
      }
      
      if (settings.endingVideoUrl) {
        initialClips.push({
          id: crypto.randomUUID(),
          url: settings.endingVideoUrl,
          posterUrl: settings.endingVideoPosterUrl,
          loaded: false,
          playing: false
        });
      }
      
      // If we have saved clips, use them and set prompts
      if (initialClips.length > 0) {
        setClips(initialClips);
        
        // Initialize transition prompts
        if (initialClips.length >= 2 && settings.prompt) {
          setTransitionPrompts([{
            id: initialClips[1].id,
            prompt: settings.prompt
          }]);
        }
      } else {
        // No saved clips - create 2 empty slots to start
        const emptyClip1 = {
          id: crypto.randomUUID(),
          url: '',
          loaded: false,
          playing: false
        };
        const emptyClip2 = {
          id: crypto.randomUUID(),
          url: '',
          loaded: false,
          playing: false
        };
        setClips([emptyClip1, emptyClip2]);
      }
    }
  }, [settings, settingsLoaded, clips.length]);
  
  // Auto-add empty slot when all slots are filled
  useEffect(() => {
    // Only auto-add if we have clips and ALL of them have videos
    if (clips.length > 0 && clips.every(clip => clip.url)) {
      console.log('[JoinClips] All slots filled, adding new empty slot');
      const newClipId = crypto.randomUUID();
      setClips(prev => [...prev, {
        id: newClipId,
        url: '',
        loaded: false,
        playing: false
      }]);
    }
  }, [clips]);
  
  // Prevent autoplay on mobile
  useEffect(() => {
    clips.forEach(clip => {
      const video = videoRefs.current[clip.id];
      if (video) {
        const preventPlay = () => video.pause();
        video.addEventListener('play', preventPlay);
        video.pause();
        
        return () => video.removeEventListener('play', preventPlay);
      }
    });
  }, [clips]);
  
  // Track scroll state
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      const timer = setTimeout(() => setIsScrolling(false), 200);
      return () => clearTimeout(timer);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Helper to upload video
  const uploadVideoFile = async (
    file: File,
    clipId: string
  ): Promise<{ videoUrl: string; posterUrl: string } | null> => {
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return null;
    }
    
    setUploadingClipId(clipId);
    try {
      const posterBlob = await extractVideoPosterFrame(file);
      
      const fileExt = file.name.split('.').pop() || 'mp4';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const fileName = `join-clips/${selectedProjectId}/${timestamp}-${clipId}-${randomId}.${fileExt}`;
      const posterFileName = `join-clips/${selectedProjectId}/${timestamp}-${clipId}-${randomId}-poster.jpg`;
      
      const { data: videoData, error: videoError } = await supabase.storage
        .from('image_uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (videoError) throw videoError;
      
      const { data: posterData, error: posterError } = await supabase.storage
        .from('image_uploads')
        .upload(posterFileName, posterBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        });
      
      if (posterError) throw posterError;
      
      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);
        
      const { data: { publicUrl: posterUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(posterFileName);
      
      toast({
        title: 'Video uploaded',
        description: 'Your video has been saved',
      });
      
      return { videoUrl, posterUrl };
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload video',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploadingClipId(null);
    }
  };
  
  // Add new clip slot
  const handleAddClip = () => {
    const newClipId = crypto.randomUUID();
    setClips(prev => [...prev, {
      id: newClipId,
      url: '',
      loaded: false,
      playing: false
    }]);
  };
  
  // Remove clip
  const handleRemoveClip = (clipId: string) => {
    setClips(prev => prev.filter(c => c.id !== clipId));
    // Remove any transition prompts associated with this clip
    setTransitionPrompts(prev => prev.filter(p => p.id !== clipId));
  };
  
  // Handle video upload for a specific clip
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>, clipId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const result = await uploadVideoFile(file, clipId);
    if (!result) return;
    
    setClips(prev => prev.map(clip => 
      clip.id === clipId
        ? { ...clip, url: result.videoUrl, posterUrl: result.posterUrl, file, loaded: false, playing: false }
        : clip
    ));
  };
  
  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent, clipId: string) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDragEnter = (e: React.DragEvent, clipId: string) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    
    const items = Array.from(e.dataTransfer.items);
    const hasValidVideo = items.some(item => 
      item.kind === 'file' && item.type.startsWith('video/')
    );
    
    if (hasValidVideo) {
      setDraggingOverClipId(clipId);
    }
  };
  
  const handleDragLeave = (e: React.DragEvent, clipId: string) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setDraggingOverClipId(null);
    }
  };
  
  const handleDrop = async (e: React.DragEvent, clipId: string) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingOverClipId(null);
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    
    const result = await uploadVideoFile(file, clipId);
    if (!result) return;
    
    setClips(prev => prev.map(clip => 
      clip.id === clipId
        ? { ...clip, url: result.videoUrl, posterUrl: result.posterUrl, file, loaded: false, playing: false }
        : clip
    ));
  };
  
  // Update transition prompt
  const handlePromptChange = (clipId: string, prompt: string) => {
    setTransitionPrompts(prev => {
      const existing = prev.find(p => p.id === clipId);
      if (existing) {
        return prev.map(p => p.id === clipId ? { ...p, prompt } : p);
      } else {
        return [...prev, { id: clipId, prompt }];
      }
    });
  };
  
  // Generate mutation
  const generateJoinClipsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('No project selected');
      if (clips.length < 2) throw new Error('At least 2 clips required');
      
      const validClips = clips.filter(c => c.url);
      if (validClips.length < 2) throw new Error('At least 2 clips with videos required');
      
      // Build clips array
      const clipsForTask = validClips.map(clip => ({
        url: clip.url
      }));
      
      // Build per-join settings (one for each transition)
      const perJoinSettings = validClips.slice(1).map((clip, index) => {
        const transitionPrompt = transitionPrompts.find(p => p.id === clip.id);
        return {
          prompt: transitionPrompt?.prompt || ''
        };
      });
      
      // Convert selected LoRAs
      const lorasForTask = loraManager.selectedLoras.map(lora => ({
        path: lora.path,
        strength: lora.strength,
      }));
      
      const taskParams: import('@/shared/lib/tasks/joinClips').JoinClipsTaskParams = {
        project_id: selectedProjectId,
        clips: clipsForTask,
        per_join_settings: perJoinSettings,
        context_frame_count: contextFrameCount,
        gap_frame_count: gapFrameCount,
        replace_mode: replaceMode,
        model: settings?.model || 'lightning_baseline_2_2_2',
        num_inference_steps: settings?.numInferenceSteps || 6,
        guidance_scale: settings?.guidanceScale || 3.0,
        seed: settings?.seed || -1,
        negative_prompt: negativePrompt,
        priority: settings?.priority || 0,
        ...(lorasForTask.length > 0 && { loras: lorasForTask }),
      };
      
      console.log('[JoinClips] Creating task with params:', taskParams);
      
      const result = await createJoinClipsTask(taskParams);
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Task created',
        description: 'Your join clips task has been queued',
      });
      
      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 3000);
      
      setVideosViewJustEnabled(true);
      
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
    const validClips = clips.filter(c => c.url);
    
    if (validClips.length < 2) {
      toast({
        title: 'Need at least 2 clips',
        description: 'Please upload at least 2 videos to join',
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
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Join Clips</h1>
          <Button
            onClick={handleAddClip}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Clip
          </Button>
        </div>
        
        {/* Clips Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip, index) => (
            <div key={clip.id} className="space-y-3">
              {/* Clip Card */}
              <div className="relative border rounded-lg p-3 space-y-3 bg-card">
                {/* Header with number and remove button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-muted-foreground">Clip #{index + 1}</div>
                  </div>
                  {clips.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveClip(clip.id)}
                      className="h-6 w-6 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                
                {/* Video Container */}
                <div className="space-y-2">
                    <div 
                      className={cn(
                        "aspect-video bg-muted rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative",
                        draggingOverClipId === clip.id 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border hover:border-primary/50',
                        !clip.url && uploadingClipId !== clip.id ? 'cursor-pointer' : ''
                      )}
                      onDragOver={(e) => handleDragOver(e, clip.id)}
                      onDragEnter={(e) => handleDragEnter(e, clip.id)}
                      onDragLeave={(e) => handleDragLeave(e, clip.id)}
                      onDrop={(e) => handleDrop(e, clip.id)}
                      onClick={() => !clip.url && uploadingClipId !== clip.id && fileInputRefs.current[clip.id]?.click()}
                    >
                      {uploadingClipId === clip.id ? (
                        <UploadingVideoState />
                      ) : clip.url ? (
                        <>
                          {!clip.loaded && <VideoContainerSkeleton />}
                          {!clip.playing && clip.posterUrl ? (
                            <>
                              <img
                                src={clip.posterUrl}
                                alt="Video poster"
                                className={cn(
                                  'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                                  clip.loaded ? 'opacity-100' : 'opacity-0'
                                )}
                                onLoad={() => {
                                  setClips(prev => prev.map(c => 
                                    c.id === clip.id ? { ...c, loaded: true } : c
                                  ));
                                }}
                              />
                              <div 
                                className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors z-[5]"
                                onClick={() => {
                                  setClips(prev => prev.map(c => 
                                    c.id === clip.id ? { ...c, playing: true } : c
                                  ));
                                }}
                              >
                                <div className="bg-black/50 rounded-full p-3 hover:bg-black/70 transition-colors">
                                  <Play className="h-8 w-8 text-white" fill="white" />
                                </div>
                              </div>
                            </>
                          ) : (
                            <video
                              ref={el => { videoRefs.current[clip.id] = el; }}
                              src={clip.url}
                              controls
                              autoPlay={clip.playing}
                              preload="metadata"
                              playsInline
                              muted
                              className={cn(
                                'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                                clip.loaded ? 'opacity-100' : 'opacity-0'
                              )}
                              onLoadedData={() => {
                                setClips(prev => prev.map(c => 
                                  c.id === clip.id ? { ...c, loaded: true } : c
                                ));
                              }}
                            />
                          )}
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 rounded-full shadow-lg z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setClips(prev => prev.map(c => 
                                c.id === clip.id ? { ...c, url: '', posterUrl: undefined, loaded: false, playing: false } : c
                              ));
                            }}
                            disabled={uploadingClipId === clip.id}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          {draggingOverClipId === clip.id && !isScrolling && (
                            <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                              <p className="text-sm font-medium text-foreground">Drop to replace</p>
                            </div>
                          )}
                        </>
                      ) : !settingsLoaded ? (
                        <VideoContainerSkeleton />
                      ) : (
                        <div className="text-center p-4 pointer-events-none">
                          <Film className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-xs text-muted-foreground mb-1">
                            {draggingOverClipId === clip.id ? 'Drop video here' : 'Click or drop to upload'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {draggingOverClipId === clip.id ? '' : 'MP4, WebM, MOV'}
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={el => { fileInputRefs.current[clip.id] = el; }}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleVideoUpload(e, clip.id)}
                    />
                </div>
                
                {/* Transition Prompt (if not last clip) */}
                {index < clips.length - 1 && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor={`prompt-${clips[index + 1].id}`} className="text-xs text-muted-foreground">
                      Transition to Clip #{index + 2}
                    </Label>
                    <Textarea
                      id={`prompt-${clips[index + 1].id}`}
                      value={transitionPrompts.find(p => p.id === clips[index + 1].id)?.prompt || ''}
                      onChange={(e) => handlePromptChange(clips[index + 1].id, e.target.value)}
                      placeholder="Describe transition (optional)"
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        }
        </div>

        {/* Global Settings */}
        <div className="space-y-6 pt-6 border-t">
          <h2 className="text-xl font-medium">Global Settings</h2>
            
            {/* Frame Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <p className="text-xs text-muted-foreground">Frames to generate in each transition</p>
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
                      const maxGap = Math.max(1, 81 - (val * 2));
                      const newGapFrames = gapFrameCount > maxGap ? maxGap : gapFrameCount;
                      if (gapFrameCount > maxGap) {
                        setGapFrameCount(maxGap);
                      }
                      
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
                <p className="text-xs text-muted-foreground">Context frames from each clip</p>
              </div>
              
              <div className="flex flex-col justify-center space-y-2">
                <div className="flex items-center justify-between gap-3 px-3 py-3 border rounded-lg">
                  <Label htmlFor="replaceMode" className="text-sm text-center flex-1">
                    Replace Frames
                  </Label>
                  <Switch
                    id="replaceMode"
                    checked={!replaceMode}
                    onCheckedChange={(checked) => {
                      setReplaceMode(!checked);
                      updateSettings('project', { ...settings, replaceMode: !checked });
                    }}
                  />
                  <Label htmlFor="replaceMode" className="text-sm text-center flex-1">
                    Generate New
                  </Label>
                </div>
              </div>
            </div>

            {/* Negative Prompt and LoRA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="negativePrompt">Global Negative Prompt</Label>
                <Textarea
                  id="negativePrompt"
                  value={negativePrompt}
                  onChange={(e) => {
                    const newNegativePrompt = e.target.value;
                    setNegativePrompt(newNegativePrompt);
                    updateSettings('project', { ...settings, negativePrompt: newNegativePrompt });
                  }}
                  placeholder="What to avoid in all transitions (optional)"
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <LoraManager
                  availableLoras={availableLoras}
                  projectId={selectedProjectId || undefined}
                  persistenceScope="project"
                  enableProjectPersistence={true}
                  persistenceKey="join-clips"
                  title="LoRA Models (Optional)"
                  addButtonText="Add or Manage LoRAs"
                />
              </div>
            </div>
        </div>

        {/* Generate Button */}
        <div className="flex justify-center">
            <Button
              onClick={handleGenerate}
              disabled={clips.filter(c => c.url).length < 2 || generateJoinClipsMutation.isPending || showSuccessState}
              className="w-full max-w-md"
              size="lg"
              variant={showSuccessState ? 'default' : 'default'}
            >
              {generateJoinClipsMutation.isPending 
                ? 'Creating Task...' 
                : showSuccessState 
                ? '✓ Task Created!' 
                : `Generate (${clips.filter(c => c.url).length - 1} transition${clips.filter(c => c.url).length - 1 !== 1 ? 's' : ''})`}
            </Button>
        </div>

        {/* Results Gallery */}
        {(() => {
          const hasValidData = videosData?.items && videosData.items.length > 0;
          const isLoadingOrFetching = videosLoading || videosFetching;
          const shouldShowSkeleton = (isLoadingOrFetching && !hasValidData) || videosViewJustEnabled;
          
          if (shouldShowSkeleton) {
            const skeletonCount = videosData?.items?.length || 6;
            return (
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-xl font-medium">
                  {hasValidData ? `Previous Results (${videosData.items.length})` : 'Loading Results...'}
                </h2>
                <SkeletonGallery
                  count={skeletonCount}
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
                  onAddToLastShot={async () => false}
                  onAddToLastShotWithoutPosition={async () => false}
                  currentToolType="join-clips"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  currentToolTypeName="Join Clips"
                  showShotFilter={false}
                  initialShotFilter="all"
                  columnsPerRow={3}
                  itemsPerPage={isMobile ? 20 : 12}
                  reducedSpacing={true}
                  hidePagination={videosData.items.length <= (isMobile ? 20 : 12)}
                />
              </div>
            );
          }
          
          if (!isLoadingOrFetching) {
            return (
              <div className="text-sm text-muted-foreground text-center pt-4 border-t">
                No joined clips yet. Create your first one above!
              </div>
            );
          }
          
          return null;
        })()}
      </div>
    </PageFadeIn>
  );
};

export default JoinClipsPage;
