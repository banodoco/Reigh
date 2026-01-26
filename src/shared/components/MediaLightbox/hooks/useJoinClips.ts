/**
 * useJoinClips - Handles adding videos to the join clips queue
 *
 * Manages state and handlers for adding the current video to the pending
 * join clips list (stored in localStorage) and navigating to the join-clips tool.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GenerationRow } from '@/types/shots';

export interface UseJoinClipsProps {
  media: GenerationRow;
  isVideo: boolean;
}

export interface UseJoinClipsReturn {
  isAddingToJoin: boolean;
  addToJoinSuccess: boolean;
  handleAddToJoin: () => void;
  handleGoToJoin: () => void;
}

export function useJoinClips({
  media,
  isVideo,
}: UseJoinClipsProps): UseJoinClipsReturn {
  const navigate = useNavigate();

  const [isAddingToJoin, setIsAddingToJoin] = useState(false);
  const [addToJoinSuccess, setAddToJoinSuccess] = useState(false);

  const handleAddToJoin = useCallback(() => {
    console.log('[useJoinClips] handleAddToJoin called', { mediaId: media?.id, isVideo });

    if (!media || !isVideo) {
      console.warn('[useJoinClips] Early return - no media or not video', { media: !!media, isVideo });
      return;
    }

    setIsAddingToJoin(true);
    try {
      // Get the video URL from the media object
      // For videos, 'location' is the primary storage field
      const videoUrl = media.location || (media as any).url || media.imageUrl;
      const thumbnailUrl = media.thumbUrl || (media as any).thumbnail_url;

      console.log('[useJoinClips] Extracted URLs:', {
        videoUrl,
        thumbnailUrl,
        mediaFields: {
          location: media.location,
          url: (media as any).url,
          imageUrl: media.imageUrl,
          thumbUrl: media.thumbUrl,
        }
      });

      if (!videoUrl) {
        console.error('[useJoinClips] No video URL found on media object!', media);
        setIsAddingToJoin(false);
        return;
      }

      // Get existing pending clips or start fresh
      const existingData = localStorage.getItem('pendingJoinClips');
      const pendingClips: Array<{ videoUrl: string; thumbnailUrl?: string; generationId: string; timestamp: number }> =
        existingData ? JSON.parse(existingData) : [];

      console.log('[useJoinClips] Existing pending clips:', pendingClips.length);

      // Add new clip (avoid duplicates by generationId)
      if (!pendingClips.some(clip => clip.generationId === media.id)) {
        const newClip = {
          videoUrl,
          thumbnailUrl,
          generationId: media.id,
          timestamp: Date.now(),
        };
        pendingClips.push(newClip);
        localStorage.setItem('pendingJoinClips', JSON.stringify(pendingClips));
        console.log('[useJoinClips] Added clip to localStorage:', newClip);
        console.log('[useJoinClips] Total pending clips now:', pendingClips.length);
      } else {
        console.log('[useJoinClips] Clip already in pending list, skipping');
      }

      setAddToJoinSuccess(true);
      setTimeout(() => setAddToJoinSuccess(false), 2000);
    } catch (error) {
      console.error('[useJoinClips] Failed to add to join:', error);
    } finally {
      setIsAddingToJoin(false);
    }
  }, [media, isVideo]);

  const handleGoToJoin = useCallback(() => {
    navigate('/tools/join-clips');
  }, [navigate]);

  return {
    isAddingToJoin,
    addToJoinSuccess,
    handleAddToJoin,
    handleGoToJoin,
  };
}
