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
    if (!media || !isVideo) return;

    setIsAddingToJoin(true);
    try {
      // Get the video URL from the media object
      const videoUrl = (media as any).url || media.imageUrl || media.location;
      const thumbnailUrl = (media as any).thumbUrl || (media as any).thumbnail_url;

      // Get existing pending clips or start fresh
      const existingData = localStorage.getItem('pendingJoinClips');
      const pendingClips: Array<{ videoUrl: string; thumbnailUrl?: string; generationId: string; timestamp: number }> =
        existingData ? JSON.parse(existingData) : [];

      // Add new clip (avoid duplicates by generationId)
      if (!pendingClips.some(clip => clip.generationId === media.id)) {
        pendingClips.push({
          videoUrl,
          thumbnailUrl,
          generationId: media.id,
          timestamp: Date.now(),
        });
        localStorage.setItem('pendingJoinClips', JSON.stringify(pendingClips));
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
