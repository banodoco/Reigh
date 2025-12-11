/**
 * Background Thumbnail Generator Hook
 * 
 * Automatically generates thumbnails for videos that don't have them.
 * Processes videos one at a time in the background without blocking the UI.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/types/shots';
import { generateAndUploadThumbnail } from '@/shared/utils/videoThumbnailGenerator';

interface UseBackgroundThumbnailGeneratorOptions {
  videos: GenerationRow[];
  projectId: string | null;
  enabled?: boolean;
}

interface GenerationStatus {
  generationId: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export function useBackgroundThumbnailGenerator({
  videos,
  projectId,
  enabled = true,
}: UseBackgroundThumbnailGeneratorOptions) {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<string, GenerationStatus>>({});
  const processingRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  // Identify videos without thumbnails
  useEffect(() => {
    // ALWAYS log hook state
    console.log('[BackgroundThumbnailGenerator] Hook running:', {
      enabled,
      projectId: projectId?.substring(0, 8) || 'none',
      videosCount: videos.length,
      videosWithUrl: videos.filter(v => v.location || v.url).length,
      videosWithIsVideo: videos.filter(v => v.isVideo).length,
      timestamp: Date.now()
    });

    if (!enabled || !projectId) {
      console.log('[BackgroundThumbnailGenerator] Hook disabled:', { enabled, hasProjectId: !!projectId });
      return;
    }

    const videosWithoutThumbnails = videos.filter(video => {
      // Debug each video
      const videoUrl = video.location || video.url;
      const hasUrl = !!videoUrl;
      
      // Check if it's a video by looking at the URL extension or isVideo property
      const urlLooksLikeVideo = videoUrl && /\.(mp4|mov|avi|webm|mkv)$/i.test(videoUrl);
      const isDefinitelyVideo = video.isVideo === true || urlLooksLikeVideo;
      
      // A "real thumbnail" is an image file (jpg/png/webp), not another video file
      const thumbIsImageFile = video.thumbUrl && /\.(jpg|jpeg|png|webp|gif)$/i.test(video.thumbUrl);
      const thumbIsDifferentFromVideo = video.thumbUrl && video.thumbUrl !== video.location && video.thumbUrl !== video.url;
      const hasRealThumbnail = thumbIsImageFile && thumbIsDifferentFromVideo;
      
      const currentStatus = statuses[video.id]?.status;
      
      console.log('[BackgroundThumbnailGenerator] Checking video:', {
        id: video.id?.substring(0, 8),
        isVideo: video.isVideo,
        urlLooksLikeVideo,
        isDefinitelyVideo,
        hasUrl,
        hasThumbUrl: !!video.thumbUrl,
        thumbUrl: video.thumbUrl?.substring(video.thumbUrl.lastIndexOf('/') + 1) || 'none',
        thumbIsImageFile,
        thumbIsDifferentFromVideo,
        location: videoUrl?.substring(videoUrl.lastIndexOf('/') + 1) || 'none',
        hasRealThumbnail,
        currentStatus: currentStatus || 'none',
        passesFilter: isDefinitelyVideo && hasUrl && !hasRealThumbnail && currentStatus !== 'processing' && currentStatus !== 'success' && currentStatus !== 'error'
      });
      
      // Must be a video (check isVideo property or URL extension)
      if (!isDefinitelyVideo) return false;
      
      // Must have a video URL
      if (!hasUrl) return false;
      
      // Must NOT have a real image thumbnail (if thumbUrl is .mp4, it's not a real thumbnail!)
      if (hasRealThumbnail) return false;
      
      // Must not already be processed, processing, or errored (avoid retry loops)
      if (currentStatus === 'processing' || currentStatus === 'success' || currentStatus === 'error') return false;
      
      return true;
    });

    if (videosWithoutThumbnails.length > 0) {
      console.log('[BackgroundThumbnailGenerator] Found videos without thumbnails:', {
        count: videosWithoutThumbnails.length,
        videoIds: videosWithoutThumbnails.map(v => v.id?.substring(0, 8)),
        timestamp: Date.now()
      });

      // Add to queue (avoid duplicates)
      const newVideoIds = videosWithoutThumbnails
        .map(v => v.id)
        .filter(id => !queueRef.current.includes(id));
      
      if (newVideoIds.length > 0) {
        queueRef.current = [...queueRef.current, ...newVideoIds];
        
        // Mark as pending
        const newStatuses: Record<string, GenerationStatus> = {};
        newVideoIds.forEach(id => {
          newStatuses[id] = { generationId: id, status: 'pending' };
        });
        setStatuses(prev => ({ ...prev, ...newStatuses }));
      }
    }
  }, [videos, projectId, enabled, statuses]);

  // Process queue
  useEffect(() => {
    if (!enabled || !projectId || processingRef.current || queueRef.current.length === 0) {
      return;
    }

    const processNextVideo = async () => {
      processingRef.current = true;
      
      const generationId = queueRef.current[0];
      const video = videos.find(v => v.id === generationId);
      
      if (!video) {
        console.warn('[BackgroundThumbnailGenerator] Video not found in list:', {
          generationId: generationId?.substring(0, 8),
          timestamp: Date.now()
        });
        queueRef.current.shift();
        processingRef.current = false;
        return;
      }

      const videoUrl = video.location || video.url;
      if (!videoUrl) {
        console.warn('[BackgroundThumbnailGenerator] Video has no URL:', {
          generationId: generationId?.substring(0, 8),
          timestamp: Date.now()
        });
        queueRef.current.shift();
        processingRef.current = false;
        return;
      }

      console.log('[BackgroundThumbnailGenerator] Processing video:', {
        generationId: generationId.substring(0, 8),
        queuePosition: 1,
        remainingInQueue: queueRef.current.length - 1,
        timestamp: Date.now()
      });

      // Update status to processing
      setStatuses(prev => ({
        ...prev,
        [generationId]: { generationId, status: 'processing' }
      }));

      // Generate and upload thumbnail
      const result = await generateAndUploadThumbnail(videoUrl, generationId, projectId);

      if (result.success && result.thumbnailUrl) {
        console.log('[BackgroundThumbnailGenerator] Success:', {
          generationId: generationId.substring(0, 8),
          thumbnailUrl: result.thumbnailUrl.substring(0, 50) + '...',
          timestamp: Date.now()
        });

        // Update status
        setStatuses(prev => ({
          ...prev,
          [generationId]: { generationId, status: 'success' }
        }));

        // Invalidate React Query cache to refresh the UI
        // This will trigger a refetch and show the new thumbnail
        queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
        
        // Also update the cache directly for immediate UI update
        queryClient.setQueriesData(
          { queryKey: ['unified-generations'] },
          (oldData: any) => {
            if (!oldData?.items) return oldData;
            
            return {
              ...oldData,
              items: oldData.items.map((item: any) => 
                item.id === generationId 
                  ? { ...item, thumbUrl: result.thumbnailUrl }
                  : item
              )
            };
          }
        );
      } else {
        console.error('[BackgroundThumbnailGenerator] Failed:', {
          generationId: generationId.substring(0, 8),
          error: result.error,
          timestamp: Date.now()
        });

        // Update status to error
        setStatuses(prev => ({
          ...prev,
          [generationId]: { 
            generationId, 
            status: 'error',
            error: result.error 
          }
        }));
      }

      // Remove from queue
      queueRef.current.shift();
      processingRef.current = false;

      // Wait a bit before processing next (to avoid overwhelming the system)
      setTimeout(() => {
        if (queueRef.current.length > 0) {
          processNextVideo();
        }
      }, 2000); // 2 second delay between generations
    };

    processNextVideo();
  }, [enabled, projectId, videos, queryClient, queueRef.current.length]);

  return {
    statuses,
    queueLength: queueRef.current.length,
    isProcessing: processingRef.current,
  };
}

