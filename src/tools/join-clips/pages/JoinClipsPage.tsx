import React, { useState, useCallback, useEffect, useRef, Suspense, useMemo } from 'react';
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
import { storagePaths, getFileExtension, generateUniqueFilename, MEDIA_BUCKET } from '@/shared/lib/storagePaths';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { JoinClipsSettings } from '../settings';
import { PageFadeIn } from '@/shared/components/transitions';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useGenerations, useDeleteGeneration, type GenerationsPaginatedResponse } from '@/shared/hooks/useGenerations';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SKELETON_COLUMNS } from '@/shared/components/ImageGallery/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { LoraManager } from '@/shared/components/LoraManager';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import type { LoraModel } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { Card } from '@/shared/components/ui/card';
import { extractVideoPosterFrame, extractVideoFinalFrame } from '@/shared/utils/videoPosterExtractor';
import { extractVideoMetadataFromUrl } from '@/shared/lib/videoUploader';
import { 
  validateClipsForJoin, 
  calculateEffectiveFrameCount,
  type ClipFrameInfo,
  type ValidationResult,
} from '../utils/validation';
import { useJoinClipsSettings } from '../hooks/useJoinClipsSettings';
import { generateUUID } from '@/shared/lib/taskCreation';
import { JoinClipsSettingsForm, type ClipPairInfo } from '@/tools/join-clips/components/JoinClipsSettingsForm';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types for clip management
interface VideoClip {
  id: string;
  url: string;
  posterUrl?: string;
  finalFrameUrl?: string;
  file?: File;
  loaded: boolean;
  playing: boolean;
  // Duration/frame info for validation
  durationSeconds?: number;
  metadataLoading?: boolean;
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

// Sortable clip wrapper component
interface SortableClipProps {
  clip: VideoClip;
  index: number;
  clips: VideoClip[];
  uploadingClipId: string | null;
  draggingOverClipId: string | null;
  isScrolling: boolean;
  settingsLoaded: boolean;
  videoRefs: React.MutableRefObject<{ [clipId: string]: HTMLVideoElement | null }>;
  fileInputRefs: React.MutableRefObject<{ [clipId: string]: HTMLInputElement | null }>;
  transitionPrompts: TransitionPrompt[];
  useIndividualPrompts: boolean;
  onRemoveClip: (clipId: string) => void;
  onClearVideo: (clipId: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, clipId: string) => void;
  onDragOver: (e: React.DragEvent, clipId: string) => void;
  onDragEnter: (e: React.DragEvent, clipId: string) => void;
  onDragLeave: (e: React.DragEvent, clipId: string) => void;
  onDrop: (e: React.DragEvent, clipId: string) => void;
  onPromptChange: (clipId: string, prompt: string) => void;
  setClips: React.Dispatch<React.SetStateAction<VideoClip[]>>;
}

const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  index,
  clips,
  uploadingClipId,
  draggingOverClipId,
  isScrolling,
  settingsLoaded,
  videoRefs,
  fileInputRefs,
  transitionPrompts,
  useIndividualPrompts,
  onRemoveClip,
  onClearVideo,
  onVideoUpload,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onPromptChange,
  setClips,
}) => {
  // Check if this is the last clip and it's empty
  const isLastClip = index === clips.length - 1;
  const isEmptyClip = !clip.url;
  const isAddAnotherClip = isLastClip && isEmptyClip;
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: clip.id,
    disabled: isAddAnotherClip, // Disable dragging for the "Add another clip" slot
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-3">
      {/* Clip Card */}
      <div className="relative border rounded-lg p-3 space-y-3 bg-card">
        {/* Header with number/title, drag handle, and remove button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isAddAnotherClip && (
              <div 
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-muted rounded transition-colors"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="text-sm font-medium text-muted-foreground">
              {isAddAnotherClip ? 'Add another clip' : `Clip #${index + 1}`}
            </div>
          </div>
          {clip.url && !isAddAnotherClip && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (clips.length > 2) {
                  onRemoveClip(clip.id);
                } else {
                  onClearVideo(clip.id);
                }
              }}
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
            onDragOver={(e) => onDragOver(e, clip.id)}
            onDragEnter={(e) => onDragEnter(e, clip.id)}
            onDragLeave={(e) => onDragLeave(e, clip.id)}
            onDrop={(e) => onDrop(e, clip.id)}
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
                {/* Final frame thumbnail in bottom right corner */}
                {clip.finalFrameUrl && (
                  <div className="absolute bottom-2 right-2 w-16 h-10 rounded border-2 border-white shadow-lg overflow-hidden z-10">
                    <img
                      src={clip.finalFrameUrl}
                      alt="Final frame"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
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
            onChange={(e) => onVideoUpload(e, clip.id)}
          />
        </div>

        {/* Transition Prompt (if not last clip and individual prompts enabled) */}
        {index < clips.length - 1 && useIndividualPrompts && (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor={`prompt-${clips[index + 1].id}`} className="text-xs text-muted-foreground">
              Transition to Clip #{index + 2}
            </Label>
            <Textarea
              id={`prompt-${clips[index + 1].id}`}
              value={transitionPrompts.find(p => p.id === clips[index + 1].id)?.prompt || ''}
              onChange={(e) => onPromptChange(clips[index + 1].id, e.target.value)}
              placeholder="Additional details for this transition (optional)"
              rows={2}
              className="resize-none text-sm"
              clearable
              onClear={() => onPromptChange(clips[index + 1].id, '')}
              voiceInput
              voiceContext={`This is a prompt for the transition between Clip #${index + 1} and Clip #${index + 2}. Describe the specific motion or visual transformation you want for this particular transition between clips.`}
              onVoiceResult={(result) => {
                onPromptChange(clips[index + 1].id, result.prompt || result.transcription);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const JoinClipsPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  const isMobile = useIsMobile();
  
  // Local state for clips list
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);
  
  // Track if we've already loaded from settings to prevent re-loading
  const hasLoadedFromSettings = useRef(false);
  // Track the project we loaded settings for
  const loadedForProjectRef = useRef<string | null>(null);
  // Track if we're still preloading persisted media
  const [isLoadingPersistedMedia, setIsLoadingPersistedMedia] = useState(false);
  // Track preloaded poster URLs to avoid flash on navigation
  const preloadedPostersRef = useRef<Set<string>>(new Set());
  
  // Get cached clips count from localStorage for instant skeleton sizing
  const getLocalStorageKey = (projectId: string) => `join-clips-count-${projectId}`;
  const getCachedClipsCount = (projectId: string | null): number => {
    if (!projectId) return 0;
    try {
      const cached = localStorage.getItem(getLocalStorageKey(projectId));
      return cached ? parseInt(cached, 10) : 0;
    } catch {
      return 0;
    }
  };
  const setCachedClipsCount = (projectId: string | null, count: number) => {
    if (!projectId) return;
    try {
      if (count > 0) {
        localStorage.setItem(getLocalStorageKey(projectId), count.toString());
      } else {
        localStorage.removeItem(getLocalStorageKey(projectId));
      }
    } catch {
      // Ignore localStorage errors
    }
  };
  
  // Initial cached count for skeleton sizing (read once on mount/project change)
  const [cachedClipsCount, setCachedClipsCountState] = useState(() => getCachedClipsCount(selectedProjectId));
  
  // Reset loading state when project changes
  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== loadedForProjectRef.current) {
      hasLoadedFromSettings.current = false;
      loadedForProjectRef.current = selectedProjectId;
      setClips([]);
      setTransitionPrompts([]);
      preloadedPostersRef.current.clear();
      // Update cached count for new project
      setCachedClipsCountState(getCachedClipsCount(selectedProjectId));
    }
  }, [selectedProjectId]);
  
  // Transition prompts (one for each pair) - still managed locally as they're tied to clip IDs
  const [transitionPrompts, setTransitionPrompts] = useState<TransitionPrompt[]>([]);
  
  // Use settings hook for all persisted settings
  const joinSettings = useJoinClipsSettings(selectedProjectId);
  
  // Derive all settings from hook
  const {
    prompt: globalPrompt = '',
    negativePrompt = '',
    contextFrameCount = 8,
    gapFrameCount = 12,
    replaceMode = true,
    keepBridgingImages,
    useIndividualPrompts = false,
    enhancePrompt = true,
    useInputVideoResolution = false,
    useInputVideoFps = false,
    noisedInputVideo = 0,
  } = joinSettings.settings;
  
  // Debug: Log enhancePrompt value
  useEffect(() => {
    console.log('[JoinClipsPage] enhancePrompt from settings:', enhancePrompt, 'raw value:', joinSettings.settings.enhancePrompt);
  }, [enhancePrompt, joinSettings.settings.enhancePrompt]);
  
  // Track whether settings have completed their initial load
  const settingsLoaded = joinSettings.status !== 'idle' && joinSettings.status !== 'loading';
  
  // Preload poster images helper - warm up the browser cache
  const preloadPosters = useCallback((posterUrls: string[]): Promise<void[]> => {
    const promises = posterUrls.filter(url => url && !preloadedPostersRef.current.has(url)).map(url => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          preloadedPostersRef.current.add(url);
          resolve();
        };
        img.onerror = () => resolve(); // Resolve even on error to not block
        img.src = url;
      });
    });
    return Promise.all(promises);
  }, []);
  
  // Initialize keepBridgingImages to false if undefined (new field for existing projects)
  useEffect(() => {
    if (keepBridgingImages === undefined && settingsLoaded) {
      console.log('[JoinClips] Initializing keepBridgingImages to false');
      joinSettings.updateField('keepBridgingImages', false);
    }
  }, [keepBridgingImages, settingsLoaded, joinSettings]);
  
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
  
  // Sync loraManager.selectedLoras → joinSettings.loras for persistence
  // This ensures LoRA selections are saved to the database
  const lorasSyncStateRef = useRef<{ lastSyncedKey: string }>({ lastSyncedKey: '' });
  useEffect(() => {
    if (!settingsLoaded) return;
    
    const lorasKey = loraManager.selectedLoras.map(l => `${l.id}:${l.strength}`).sort().join(',');
    if (lorasKey === lorasSyncStateRef.current.lastSyncedKey) return;
    
    lorasSyncStateRef.current.lastSyncedKey = lorasKey;
    joinSettings.updateField('loras', loraManager.selectedLoras.map(l => ({
      id: l.id,
      strength: l.strength,
    })));
  }, [loraManager.selectedLoras, joinSettings, settingsLoaded]);
  
  // Fetch all videos
  const generationsQuery = useGenerations(
    selectedProjectId, 
    1,
    100,
    !!selectedProjectId,
    {
      toolType: 'join-clips',
      mediaType: 'video',
      includeChildren: true  // Include child generations (e.g., when join-clips outputs are linked to source clips)
    },
    {
      disablePolling: true
    }
  );
  
  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;
  
  // Delete mutation for gallery items
  const deleteGenerationMutation = useDeleteGeneration();
  const handleDeleteGeneration = useCallback((id: string) => {
    deleteGenerationMutation.mutate(id);
  }, [deleteGenerationMutation]);
  
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
  
  // Settings sync is now handled automatically by useJoinClipsSettings hook
  
  // Initialize clips from settings or create 2 empty slots
  useEffect(() => {
    if (!selectedProjectId || !settingsLoaded || hasLoadedFromSettings.current) return;
    
    hasLoadedFromSettings.current = true; // Mark as attempted
    
    const initialClips: VideoClip[] = [];
    const posterUrlsToPreload: string[] = [];
    
    // First, try loading from new multi-clip format
    if (joinSettings.settings?.clips && joinSettings.settings.clips.length > 0) {
      joinSettings.settings.clips.forEach((clip) => {
        if (clip.url) {
          initialClips.push({
            id: generateUUID(),
            url: clip.url,
            posterUrl: clip.posterUrl,
            finalFrameUrl: clip.finalFrameUrl,
            durationSeconds: clip.durationSeconds,
            loaded: false,
            playing: false
          });
          if (clip.posterUrl) posterUrlsToPreload.push(clip.posterUrl);
        }
      });
      
      // Load transition prompts
      if (joinSettings.settings.transitionPrompts && joinSettings.settings.transitionPrompts.length > 0) {
        const prompts = joinSettings.settings.transitionPrompts.map((tp) => ({
          id: initialClips[tp.clipIndex]?.id || '',
          prompt: tp.prompt
        })).filter(p => p.id); // Filter out invalid ones
        setTransitionPrompts(prompts);
      }
    }
    // Fallback to legacy two-video format
    else if (joinSettings.settings?.startingVideoUrl || joinSettings.settings?.endingVideoUrl) {
      if (joinSettings.settings.startingVideoUrl) {
        initialClips.push({
          id: generateUUID(),
          url: joinSettings.settings.startingVideoUrl,
          posterUrl: joinSettings.settings.startingVideoPosterUrl,
          // Legacy format doesn't have finalFrameUrl
          loaded: false,
          playing: false
        });
        if (joinSettings.settings.startingVideoPosterUrl) {
          posterUrlsToPreload.push(joinSettings.settings.startingVideoPosterUrl);
        }
      }
      
      if (joinSettings.settings.endingVideoUrl) {
        initialClips.push({
          id: generateUUID(),
          url: joinSettings.settings.endingVideoUrl,
          posterUrl: joinSettings.settings.endingVideoPosterUrl,
          // Legacy format doesn't have finalFrameUrl
          loaded: false,
          playing: false
        });
        if (joinSettings.settings.endingVideoPosterUrl) {
          posterUrlsToPreload.push(joinSettings.settings.endingVideoPosterUrl);
        }
      }
      
      // Initialize transition prompts from legacy format
      if (initialClips.length >= 2 && joinSettings.settings.prompt) {
        setTransitionPrompts([{
          id: initialClips[1].id,
          prompt: joinSettings.settings.prompt
        }]);
      }
    }
    
    // If we have saved clips, preload posters then show them
    if (initialClips.length > 0) {
      // Set loading state while preloading posters
      if (posterUrlsToPreload.length > 0) {
        setIsLoadingPersistedMedia(true);
      }
      
      // Ensure we always have at least 2 clips
      let clipsToSet: VideoClip[];
      if (initialClips.length < 2) {
        const clipsToAdd = 2 - initialClips.length;
        const emptyClips = Array.from({ length: clipsToAdd }, () => ({
          id: generateUUID(),
          url: '',
          loaded: false,
          playing: false
        }));
        clipsToSet = [...initialClips, ...emptyClips];
      } else {
        // Add one empty slot for "Add another clip" if all slots have content
        clipsToSet = [...initialClips, {
          id: generateUUID(),
          url: '',
          loaded: false,
          playing: false
        }];
      }
      
      // Preload posters before showing content
      if (posterUrlsToPreload.length > 0) {
        preloadPosters(posterUrlsToPreload).then(() => {
          setClips(clipsToSet);
          setIsLoadingPersistedMedia(false);
        });
      } else {
        setClips(clipsToSet);
      }
    } else {
      // No saved clips - create 2 empty slots to start
      const emptyClip1 = {
        id: generateUUID(),
        url: '',
        loaded: false,
        playing: false
      };
      const emptyClip2 = {
        id: generateUUID(),
        url: '',
        loaded: false,
        playing: false
      };
      setClips([emptyClip1, emptyClip2]);
    }
  }, [selectedProjectId, joinSettings.settings, settingsLoaded, preloadPosters]);
  
  // Persist clips to settings whenever they change
  useEffect(() => {
    if (!settingsLoaded) return;
    
    // Only persist clips that have videos
    const clipsToSave = clips
      .filter(clip => clip.url)
      .map(clip => ({
        url: clip.url,
        posterUrl: clip.posterUrl,
        finalFrameUrl: clip.finalFrameUrl,
        durationSeconds: clip.durationSeconds
      }));
    
    // Cache the count to localStorage for instant skeleton sizing on next visit
    setCachedClipsCount(selectedProjectId, clipsToSave.length);
    
    // Convert transitionPrompts to indexed format for persistence
    const promptsToSave = transitionPrompts
      .map(tp => {
        const clipIndex = clips.findIndex(c => c.id === tp.id);
        if (clipIndex > 0 && tp.prompt) { // clipIndex > 0 because prompts are for transitions (clip 1->2, etc)
          return { clipIndex, prompt: tp.prompt };
        }
        return null;
      })
      .filter((p): p is { clipIndex: number; prompt: string } => p !== null);
    
    // Check if values actually changed before updating
    const currentClipsJson = JSON.stringify(joinSettings.settings.clips || []);
    const newClipsJson = JSON.stringify(clipsToSave);
    const currentPromptsJson = JSON.stringify(joinSettings.settings.transitionPrompts || []);
    const newPromptsJson = JSON.stringify(promptsToSave);
    
    if (currentClipsJson !== newClipsJson || currentPromptsJson !== newPromptsJson) {
      joinSettings.updateFields({
        clips: clipsToSave,
        transitionPrompts: promptsToSave
      });
    }
  }, [clips, transitionPrompts, settingsLoaded, joinSettings]);
  
  // Lazy-load duration for clips that have URLs but no duration (e.g., loaded from settings)
  useEffect(() => {
    const clipsNeedingDuration = clips.filter(
      clip => clip.url && clip.durationSeconds === undefined && !clip.metadataLoading
    );
    
    if (clipsNeedingDuration.length === 0) return;
    
    console.log('[JoinClips] Loading duration for', clipsNeedingDuration.length, 'clips');
    
    // Mark clips as loading
    setClips(prev => prev.map(clip => 
      clipsNeedingDuration.some(c => c.id === clip.id)
        ? { ...clip, metadataLoading: true }
        : clip
    ));
    
    // Load duration for each clip
    clipsNeedingDuration.forEach(async (clip) => {
      try {
        const metadata = await extractVideoMetadataFromUrl(clip.url);
        console.log('[JoinClips] Loaded duration for clip:', clip.id.substring(0, 8), metadata.duration_seconds, 'seconds');
        
        setClips(prev => prev.map(c => 
          c.id === clip.id
            ? { ...c, durationSeconds: metadata.duration_seconds, metadataLoading: false }
            : c
        ));
      } catch (error) {
        console.error('[JoinClips] Failed to load duration for clip:', clip.id, error);
        setClips(prev => prev.map(c => 
          c.id === clip.id
            ? { ...c, durationSeconds: 0, metadataLoading: false }
            : c
        ));
      }
    });
  }, [clips]);
  
  // Calculate validation result based on current settings and clip durations
  const validationResult = useMemo((): ValidationResult | null => {
    const validClips = clips.filter(c => c.url);
    if (validClips.length < 2) return null;
    
    // Check if any clips are still loading duration
    const stillLoading = validClips.some(c => c.metadataLoading || c.durationSeconds === undefined);
    if (stillLoading) return null;
    
    // Build clip frame info array
    const clipFrameInfos: ClipFrameInfo[] = validClips.map((clip, index) => {
      const frameCount = clip.durationSeconds 
        ? calculateEffectiveFrameCount(clip.durationSeconds, useInputVideoFps)
        : 0;
      
      return {
        index,
        name: `Clip #${index + 1}`,
        frameCount,
        durationSeconds: clip.durationSeconds,
        source: clip.durationSeconds ? 'estimated' : 'unknown',
      };
    });
    
    return validateClipsForJoin(
      clipFrameInfos,
      contextFrameCount,
      gapFrameCount,
      replaceMode
    );
  }, [clips, contextFrameCount, gapFrameCount, replaceMode, useInputVideoFps]);
  
  // Build clip pairs for visualization
  const clipPairs = useMemo((): ClipPairInfo[] => {
    const validClips = clips.filter(c => c.url);
    if (validClips.length < 2) return [];
    
    const pairs: ClipPairInfo[] = [];
    for (let i = 0; i < validClips.length - 1; i++) {
      const clipA = validClips[i];
      const clipB = validClips[i + 1];
      
      const clipAFrameCount = clipA.durationSeconds 
        ? calculateEffectiveFrameCount(clipA.durationSeconds, useInputVideoFps)
        : 0;
      const clipBFrameCount = clipB.durationSeconds 
        ? calculateEffectiveFrameCount(clipB.durationSeconds, useInputVideoFps)
        : 0;
      
      pairs.push({
        pairIndex: i,
        clipA: {
          name: `Clip ${i + 1}`,
          frameCount: clipAFrameCount,
          finalFrameUrl: clipA.finalFrameUrl,
        },
        clipB: {
          name: `Clip ${i + 2}`,
          frameCount: clipBFrameCount,
          posterUrl: clipB.posterUrl,
        },
      });
    }
    return pairs;
  }, [clips, useInputVideoFps]);
  
  // Ensure minimum of 2 clips, auto-add empty slot when all slots are filled, and remove extra trailing empty slots
  useEffect(() => {
    if (clips.length === 0) return;
    
    // Ensure minimum of 2 clips
    if (clips.length < 2) {
      console.log('[JoinClips] Less than 2 clips, adding empty slots to reach minimum');
      const clipsToAdd = 2 - clips.length;
      const newClips = Array.from({ length: clipsToAdd }, () => ({
        id: generateUUID(),
        url: '',
        loaded: false,
        playing: false
      }));
      setClips(prev => [...prev, ...newClips]);
      return; // Prevent running other logic in the same effect run
    }
    
    // Find trailing empty slots (consecutive empty slots at the end)
    let lastNonEmptyIndex = -1;
    for (let i = clips.length - 1; i >= 0; i--) {
      if (clips[i].url) {
        lastNonEmptyIndex = i;
        break;
      }
    }
    
    // Count trailing empty slots
    const trailingEmptyCount = clips.length - lastNonEmptyIndex - 1;
    
    // If all slots are filled (no trailing empty), add one
    if (clips.every(clip => clip.url)) {
      console.log('[JoinClips] All slots filled, adding new empty slot');
      const newClipId = generateUUID();
      setClips(prev => [...prev, {
        id: newClipId,
        url: '',
        loaded: false,
        playing: false
      }]);
      return; // Prevent running the cleanup logic in the same effect run
    }
    
    // If we have more than one trailing empty slot, remove extras (keeping only one)
    // But ensure we always have at least 2 clips total
    if (trailingEmptyCount > 1) {
      console.log('[JoinClips] Multiple trailing empty slots detected, keeping only one');
      const targetLength = Math.max(2, lastNonEmptyIndex + 2); // Keep all non-empty + 1 empty, but minimum 2
      
      // Only update if we actually need to remove clips
      if (clips.length !== targetLength) {
        const newClips = clips.slice(0, targetLength);
        setClips(newClips);
        
        // Clean up transition prompts for removed clips
        const removedClipIds = clips.slice(targetLength).map(c => c.id);
        if (removedClipIds.length > 0) {
          setTransitionPrompts(prev => prev.filter(p => !removedClipIds.includes(p.id)));
        }
      }
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
  ): Promise<{ videoUrl: string; posterUrl: string; finalFrameUrl: string; durationSeconds: number } | null> => {
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
      // Extract video metadata (duration) and both first and final frames in parallel
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';
      const durationPromise = new Promise<number>((resolve) => {
        videoElement.onloadedmetadata = () => {
          resolve(videoElement.duration);
          URL.revokeObjectURL(videoElement.src);
        };
        videoElement.onerror = () => {
          resolve(0); // Fallback to 0 if we can't get duration
          URL.revokeObjectURL(videoElement.src);
        };
        videoElement.src = URL.createObjectURL(file);
      });
      
      const [posterBlob, finalFrameBlob, durationSeconds] = await Promise.all([
        extractVideoPosterFrame(file),
        extractVideoFinalFrame(file),
        durationPromise
      ]);
      
      // Get userId for storage path
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      const userId = session.user.id;

      // Generate storage paths using centralized utilities
      const fileExt = getFileExtension(file.name, file.type, 'mp4');
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const fileName = storagePaths.upload(userId, `${timestamp}-${clipId}-${randomId}.${fileExt}`);
      const posterFileName = storagePaths.thumbnail(userId, `${timestamp}-${clipId}-${randomId}-poster.jpg`);
      const finalFrameFileName = storagePaths.thumbnail(userId, `${timestamp}-${clipId}-${randomId}-final.jpg`);
      
      // Upload video and both frames in parallel
      const [videoUpload, posterUpload, finalFrameUpload] = await Promise.all([
        supabase.storage.from(MEDIA_BUCKET).upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        }),
        supabase.storage.from(MEDIA_BUCKET).upload(posterFileName, posterBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        }),
        supabase.storage.from(MEDIA_BUCKET).upload(finalFrameFileName, finalFrameBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        })
      ]);
      
      if (videoUpload.error) throw videoUpload.error;
      if (posterUpload.error) throw posterUpload.error;
      if (finalFrameUpload.error) throw finalFrameUpload.error;
      
      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(fileName);
        
      const { data: { publicUrl: posterUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(posterFileName);
        
      const { data: { publicUrl: finalFrameUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(finalFrameFileName);
      
      toast({
        title: 'Video uploaded',
        description: 'Your video has been saved',
      });
      
      console.log('[JoinClips] Video uploaded with duration:', durationSeconds, 'seconds');
      return { videoUrl, posterUrl, finalFrameUrl, durationSeconds };
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
    const newClipId = generateUUID();
    setClips(prev => [...prev, {
      id: newClipId,
      url: '',
      loaded: false,
      playing: false
    }]);
  };
  
  // Remove clip (but ensure minimum of 2 clips)
  const handleRemoveClip = (clipId: string) => {
    setClips(prev => {
      // Ensure we always have at least 2 clips
      if (prev.length <= 2) {
        return prev;
      }
      return prev.filter(c => c.id !== clipId);
    });
    // Remove any transition prompts associated with this clip
    setTransitionPrompts(prev => prev.filter(p => p.id !== clipId));
  };
  
  // Clear video content from a clip (keeps the slot)
  const handleClearVideo = (clipId: string) => {
    setClips(prev => prev.map(clip => 
      clip.id === clipId
        ? { ...clip, url: '', posterUrl: undefined, finalFrameUrl: undefined, file: undefined, loaded: false, playing: false }
        : clip
    ));
    // Reset the file input so it can accept a new file
    const fileInput = fileInputRefs.current[clipId];
    if (fileInput) {
      fileInput.value = '';
    }
    // Reset the video element
    const videoElement = videoRefs.current[clipId];
    if (videoElement) {
      videoElement.pause();
      videoElement.src = '';
      videoElement.load();
    }
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
        ? { 
            ...clip, 
            url: result.videoUrl, 
            posterUrl: result.posterUrl, 
            finalFrameUrl: result.finalFrameUrl, 
            durationSeconds: result.durationSeconds,
            file, 
            loaded: false, 
            playing: false 
          }
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
        ? { 
            ...clip, 
            url: result.videoUrl, 
            posterUrl: result.posterUrl, 
            finalFrameUrl: result.finalFrameUrl, 
            durationSeconds: result.durationSeconds,
            file, 
            loaded: false, 
            playing: false 
          }
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
        let finalPrompt = '';
        
        if (useIndividualPrompts) {
          // Individual prompts mode: combine individual + global
          const individualPrompt = transitionPrompts.find(p => p.id === clip.id)?.prompt || '';
          if (individualPrompt && globalPrompt) {
            finalPrompt = `${individualPrompt}. ${globalPrompt}`;
          } else if (individualPrompt) {
            finalPrompt = individualPrompt;
          } else {
            finalPrompt = globalPrompt;
          }
        } else {
          // Global prompt only mode
          finalPrompt = globalPrompt;
        }
        
        return {
          prompt: finalPrompt
        };
      });
      
      // Convert selected LoRAs
      const lorasForTask = loraManager.selectedLoras.map(lora => ({
        path: lora.path,
        strength: lora.strength,
      }));
      
      // Calculate resolution from project's aspect ratio
      let resolutionTuple: [number, number] | undefined;
      if (projectAspectRatio) {
        const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
        if (resolutionStr) {
          const [width, height] = resolutionStr.split('x').map(Number);
          if (width && height) {
            resolutionTuple = [width, height];
          }
        }
      }
      
      console.log('[JoinClips] Resolution from project:', {
        projectAspectRatio,
        resolutionTuple
      });
      
      const taskParams: import('@/shared/lib/tasks/joinClips').JoinClipsTaskParams = {
        project_id: selectedProjectId,
        clips: clipsForTask,
        per_join_settings: perJoinSettings,
        context_frame_count: contextFrameCount,
        gap_frame_count: gapFrameCount,
        replace_mode: replaceMode,
        keep_bridging_images: keepBridgingImages ?? false,
        enhance_prompt: enhancePrompt,
        model: joinSettings.settings.model || 'wan_2_2_vace_lightning_baseline_2_2_2',
        num_inference_steps: joinSettings.settings.numInferenceSteps || 6,
        guidance_scale: joinSettings.settings.guidanceScale || 3.0,
        seed: joinSettings.settings.seed || -1,
        negative_prompt: negativePrompt,
        priority: joinSettings.settings.priority || 0,
        use_input_video_resolution: useInputVideoResolution,
        use_input_video_fps: useInputVideoFps,
        ...(lorasForTask.length > 0 && { loras: lorasForTask }),
        ...(resolutionTuple && { resolution: resolutionTuple }),
        ...(noisedInputVideo > 0 && { vid2vid_init_strength: noisedInputVideo }),
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
  
  // Set up drag and drop sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // 150ms delay before drag starts on touch
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Handle drag end to reorder clips
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }
    
    setClips((prevClips) => {
      const oldIndex = prevClips.findIndex((clip) => clip.id === active.id);
      const newIndex = prevClips.findIndex((clip) => clip.id === over.id);
      
      if (oldIndex === -1 || newIndex === -1) {
        return prevClips;
      }
      
      const reorderedClips = arrayMove(prevClips, oldIndex, newIndex);
      
      console.log('[JoinClips] Clips reordered:', {
        from: oldIndex,
        to: newIndex,
        newOrder: reorderedClips.map((c, i) => `${i + 1}: ${c.url ? 'video' : 'empty'}`)
      });
      
      return reorderedClips;
    });
    
    // Update transition prompts to match new order if needed
    setTransitionPrompts((prevPrompts) => {
      const newClipsOrder = arrayMove(
        clips,
        clips.findIndex((clip) => clip.id === active.id),
        clips.findIndex((clip) => clip.id === over.id)
      );
      
      // Remap prompts to maintain correct associations after reorder
      return prevPrompts.map(prompt => {
        const oldClipIndex = clips.findIndex(c => c.id === prompt.id);
        if (oldClipIndex !== -1 && oldClipIndex > 0) {
          // Find where this clip moved to in the new order
          const newClipIndex = newClipsOrder.findIndex(c => c.id === clips[oldClipIndex].id);
          if (newClipIndex > 0) {
            return {
              ...prompt,
              id: newClipsOrder[newClipIndex].id
            };
          }
        }
        return prompt;
      });
    });
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Join Clips</h1>
        </div>
        
        {/* Clips Grid */}
        {/* Show skeleton when loading settings, loading persisted media, OR we have stored clips but haven't loaded them yet */}
        {(joinSettings.status === 'loading' || isLoadingPersistedMedia || (settingsLoaded && joinSettings.settings?.clips?.length > 0 && clips.length === 0)) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Use localStorage-cached count for instant correct skeleton sizing
                +1 for "Add another clip" slot, minimum 2 clips */}
            {Array.from({ length: Math.max(2, cachedClipsCount) + 1 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="relative border rounded-lg p-3 space-y-3 bg-card">
                  {/* Header skeleton */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                  
                  {/* Video container skeleton */}
                  <div className="space-y-2">
                    <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                        <Skeleton className="h-4 w-32 mx-auto" />
                        <Skeleton className="h-3 w-24 mx-auto" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={clips.map(c => c.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clips.map((clip, index) => (
                  <SortableClip
                    key={clip.id}
                    clip={clip}
                    index={index}
                    clips={clips}
                    uploadingClipId={uploadingClipId}
                    draggingOverClipId={draggingOverClipId}
                    isScrolling={isScrolling}
                    settingsLoaded={settingsLoaded}
                    videoRefs={videoRefs}
                    fileInputRefs={fileInputRefs}
                    transitionPrompts={transitionPrompts}
                    useIndividualPrompts={useIndividualPrompts}
                    onRemoveClip={handleRemoveClip}
                    onClearVideo={handleClearVideo}
                    onVideoUpload={handleVideoUpload}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onPromptChange={handlePromptChange}
                    setClips={setClips}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Global Settings using JoinClipsSettingsForm */}
        <Card className="p-6 sm:p-8 shadow-sm border">
                          <JoinClipsSettingsForm
                            gapFrames={gapFrameCount}
                            setGapFrames={(val) => joinSettings.updateField('gapFrameCount', val)}
                            contextFrames={contextFrameCount}
                            setContextFrames={(val) => joinSettings.updateField('contextFrameCount', val)}
                            replaceMode={replaceMode}
                            setReplaceMode={(val) => joinSettings.updateField('replaceMode', val)}
                            keepBridgingImages={keepBridgingImages}
                            setKeepBridgingImages={(val) => joinSettings.updateField('keepBridgingImages', val)}
                            prompt={globalPrompt}
                            setPrompt={(val) => joinSettings.updateField('prompt', val)}
                            negativePrompt={negativePrompt}
                            setNegativePrompt={(val) => joinSettings.updateField('negativePrompt', val)}
                            useIndividualPrompts={useIndividualPrompts}
                            setUseIndividualPrompts={(val) => joinSettings.updateField('useIndividualPrompts', val)}
                            clipCount={clips.filter(c => c.url).length}
                            enhancePrompt={enhancePrompt}
                            setEnhancePrompt={(val) => {
                              console.log('[JoinClipsPage] setEnhancePrompt called with:', val);
                              joinSettings.updateField('enhancePrompt', val);
                            }}
                            useInputVideoResolution={useInputVideoResolution}
                            setUseInputVideoResolution={(val) => joinSettings.updateField('useInputVideoResolution', val)}
                            showResolutionToggle={true}
                            useInputVideoFps={useInputVideoFps}
                            setUseInputVideoFps={(val) => joinSettings.updateField('useInputVideoFps', val)}
                            showFpsToggle={true}
                            noisedInputVideo={noisedInputVideo}
                            setNoisedInputVideo={(val) => joinSettings.updateField('noisedInputVideo', val)}
                            availableLoras={availableLoras}
                            projectId={selectedProjectId}
                            loraPersistenceKey="join-clips"
                            loraManager={loraManager}
                            onGenerate={handleGenerate}
                            isGenerating={generateJoinClipsMutation.isPending}
                            generateSuccess={showSuccessState}
                            generateButtonText={(() => {
                              const validClipsCount = clips.filter(c => c.url).length;
                              const transitionCount = Math.max(0, validClipsCount - 1);
                              return `Generate (${transitionCount} transition${transitionCount !== 1 ? 's' : ''})`;
                            })()}
                            isGenerateDisabled={clips.filter(c => c.url).length < 2 || clips.some(c => c.url && c.metadataLoading)}
                            onRestoreDefaults={() => {
                              // Default values (scaled for 16fps)
                              let context = 10;
                              let gap = 13;
                              const replaceMode = true;
                              
                              // Scale down proportionally if constraint is violated
                              // In REPLACE mode: each clip needs context + ceil(gap/2) frames
                              const shortestFrames = validationResult?.shortestClipFrames;
                              if (shortestFrames && shortestFrames > 0) {
                                const framesNeeded = context + Math.ceil(gap / 2);
                                if (framesNeeded > shortestFrames) {
                                  // Scale down proportionally
                                  const scale = shortestFrames / framesNeeded;
                                  context = Math.max(4, Math.floor(context * scale));
                                  gap = Math.max(1, Math.floor(gap * scale));
                                  console.log('[JoinClips] Scaled defaults to fit constraint:', { context, gap, shortestFrames });
                                }
                              }
                              
                              joinSettings.updateFields({
                                contextFrameCount: context,
                                gapFrameCount: gap,
                                replaceMode,
                                keepBridgingImages: false,
                                prompt: '',
                                negativePrompt: '',
                                useIndividualPrompts: false,
                                enhancePrompt: true,
                                useInputVideoResolution: false,
                                useInputVideoFps: false,
                                noisedInputVideo: 0,
                              });
                              // Clear LoRAs
                              loraManager.setSelectedLoras([]);
                            }}
                            shortestClipFrames={validationResult?.shortestClipFrames}
                            clipPairs={clipPairs}
                          />
        </Card>

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
                  columns={SKELETON_COLUMNS[3]}
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
                  onDelete={handleDeleteGeneration}
                  isDeleting={deleteGenerationMutation.isPending ? deleteGenerationMutation.variables as string : null}
                  currentToolType="join-clips"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  showShotFilter={false}
                  initialShotFilter="all"
                  columnsPerRow={3}
                  itemsPerPage={isMobile ? 20 : 12}
                  reducedSpacing={true}
                  hidePagination={videosData.items.length <= (isMobile ? 20 : 12)}
                  hideBottomPagination={true}
                  hideMediaTypeFilter={true}
                  showShare={false}
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
