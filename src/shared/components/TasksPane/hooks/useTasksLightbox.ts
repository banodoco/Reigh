import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { Task } from '@/types/tasks';
import { deriveInputImages } from '../utils/task-utils';
import { usePrefetchTaskData } from '@/shared/hooks/useUnifiedGenerations';

interface LightboxData {
  type: 'image' | 'video';
  task: Task;
  media: GenerationRow | GenerationRow[];
  videoIndex?: number;
  initialVariantId?: string;
}

interface UseTasksLightboxOptions {
  selectedProjectId: string | null;
  currentShotId: string | null;
  lastAffectedShotId: string | null;
  setActiveTaskId: (taskId: string | null) => void;
  setIsTasksPaneOpen: (isOpen: boolean) => void;
}

export function useTasksLightbox({
  selectedProjectId,
  currentShotId,
  lastAffectedShotId,
  setActiveTaskId,
  setIsTasksPaneOpen,
}: UseTasksLightboxOptions) {
  // Lightbox state
  const [lightboxData, setLightboxData] = useState<LightboxData | null>(null);
  
  // Local state for shot selector dropdown (separate from the shot being viewed)
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(undefined);

  // Build task details data directly from lightbox task
  const taskDetailsData = lightboxData?.task ? {
    task: lightboxData.task,
    isLoading: false,
    error: null,
    inputImages: deriveInputImages(lightboxData.task),
    taskId: lightboxData.task.id,
    onApplySettingsFromTask: undefined,
    onClose: undefined
  } : null;

  // Handlers for opening lightbox
  const handleOpenImageLightbox = useCallback((task: Task, media: GenerationRow, initialVariantId?: string) => {
    setLightboxData({ type: 'image', task, media, initialVariantId });
    setActiveTaskId(task.id);
    setIsTasksPaneOpen(true);
  }, [setActiveTaskId, setIsTasksPaneOpen]);

  const handleOpenVideoLightbox = useCallback((task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => {
    setLightboxData({ type: 'video', task, media, videoIndex, initialVariantId });
    setActiveTaskId(task.id);
    setIsTasksPaneOpen(true);
  }, [setActiveTaskId, setIsTasksPaneOpen]);

  const handleCloseLightbox = useCallback(() => {
    // Reset dropdown to current shot when closing
    setLightboxSelectedShotId(currentShotId || lastAffectedShotId || undefined);
    setLightboxData(null);
    setActiveTaskId(null);
  }, [currentShotId, lastAffectedShotId, setActiveTaskId]);

  // Handler for opening external generation (for "Based On" navigation)
  const handleOpenExternalGeneration = useCallback(async (
    generationId: string,
    _derivedContext?: string[]
  ) => {
    try {
      // Fetch the generation from the database with its shot associations
      const { data, error } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
        `)
        .eq('id', generationId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        // The database field is 'based_on' at the top level
        const basedOnValue = (data as any).based_on || (data as any).metadata?.based_on || null;
        
        // Transform the data to match GenerationRow format
        const shotGenerations = (data as any).shot_generations || [];
        
        // Database fields: location (full image), thumbnail_url (thumb)
        const imageUrl = (data as any).location || (data as any).thumbnail_url;
        const thumbUrl = (data as any).thumbnail_url || (data as any).location;
        
        const transformedData: GenerationRow = {
          id: data.id,
          location: (data as any).location,
          imageUrl,
          thumbUrl,
          videoUrl: (data as any).video_url || null,
          createdAt: data.created_at,
          taskId: (data as any).task_id,
          metadata: (data as any).metadata,
          starred: (data as any).starred || false,
          // CRITICAL: Include based_on at TOP LEVEL for MediaLightbox
          based_on: basedOnValue,
          // Also include as sourceGenerationId for compatibility
          sourceGenerationId: basedOnValue,
          // Add shot associations
          shotIds: shotGenerations.map((sg: any) => sg.shot_id),
          timelineFrames: shotGenerations.reduce((acc: any, sg: any) => {
            acc[sg.shot_id] = sg.timeline_frame;
            return acc;
          }, {}),
        } as any;
        
        // Update lightbox to show this generation
        // We don't have the original task, so we'll use a minimal task object
        const minimalTask: Task = {
          id: (data as any).task_id || 'unknown',
          status: 'Complete',
          taskType: 'unknown',
          createdAt: data.created_at,
          updatedAt: data.created_at,
          projectId: selectedProjectId || '',
        } as Task;
        
        setLightboxData({
          type: (transformedData as any).videoUrl ? 'video' : 'image',
          task: minimalTask,
          media: transformedData,
        });
      }
    } catch (error) {
      console.error('[useTasksLightbox] Failed to fetch external generation:', error);
      sonnerToast.error('Failed to load generation');
    }
  }, [selectedProjectId]);

  // Prefetch task data for adjacent videos when navigating
  const prefetchTaskData = usePrefetchTaskData();

  useEffect(() => {
    if (lightboxData?.type !== 'video' || !Array.isArray(lightboxData.media)) return;

    const currentIndex = lightboxData.videoIndex ?? 0;
    const mediaArray = lightboxData.media as GenerationRow[];

    // Prefetch previous item
    if (currentIndex > 0 && mediaArray[currentIndex - 1]?.id) {
      prefetchTaskData(mediaArray[currentIndex - 1].id);
    }

    // Prefetch next item
    if (currentIndex < mediaArray.length - 1 && mediaArray[currentIndex + 1]?.id) {
      prefetchTaskData(mediaArray[currentIndex + 1].id);
    }
  }, [lightboxData, prefetchTaskData]);

  // Video navigation handlers
  const handleVideoNext = useCallback(() => {
    if (lightboxData?.type !== 'video' || !Array.isArray(lightboxData.media)) return;
    const currentIndex = lightboxData.videoIndex ?? 0;
    const mediaArray = lightboxData.media as GenerationRow[];
    if (currentIndex < mediaArray.length - 1) {
      setLightboxData({ ...lightboxData, videoIndex: currentIndex + 1 });
    }
  }, [lightboxData]);

  const handleVideoPrevious = useCallback(() => {
    if (lightboxData?.type !== 'video' || !Array.isArray(lightboxData.media)) return;
    const currentIndex = lightboxData.videoIndex ?? 0;
    if (currentIndex > 0) {
      setLightboxData({ ...lightboxData, videoIndex: currentIndex - 1 });
    }
  }, [lightboxData]);

  // Computed values for MediaLightbox props
  const lightboxProps = lightboxData ? (() => {
    const actualMedia = lightboxData.type === 'video' && Array.isArray(lightboxData.media)
      ? lightboxData.media[lightboxData.videoIndex ?? 0]
      : lightboxData.media;
    
    const currentIndex = lightboxData.videoIndex ?? 0;
    const totalVideos = Array.isArray(lightboxData.media) ? lightboxData.media.length : 1;
    const isVideoWithNavigation = lightboxData.type === 'video' && totalVideos > 1;

    return {
      media: actualMedia as GenerationRow,
      showNavigation: isVideoWithNavigation,
      hasNext: isVideoWithNavigation && currentIndex < totalVideos - 1,
      hasPrevious: isVideoWithNavigation && currentIndex > 0,
      onNext: isVideoWithNavigation ? handleVideoNext : undefined,
      onPrevious: isVideoWithNavigation ? handleVideoPrevious : undefined,
      showImageEditTools: lightboxData.type === 'image',
      showMagicEdit: lightboxData.type === 'image',
      initialVariantId: lightboxData.initialVariantId,
      // For video tasks (especially individual segments), fetch variants for the video itself
      // not from its parent - this ensures we show the correct video in the lightbox
      fetchVariantsForSelf: lightboxData.type === 'video',
    };
  })() : null;

  return {
    // State
    lightboxData,
    lightboxSelectedShotId,
    setLightboxSelectedShotId,
    taskDetailsData,
    lightboxProps,
    
    // Handlers
    handleOpenImageLightbox,
    handleOpenVideoLightbox,
    handleCloseLightbox,
    handleOpenExternalGeneration,
  };
}



