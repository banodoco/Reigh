import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { createImageUpscaleTask } from '@/shared/lib/tasks/imageUpscale';
import { getDisplayUrl } from '@/shared/lib/utils';

export interface UseUpscaleProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  isVideo: boolean;
}

export interface UseUpscaleReturn {
  isUpscaling: boolean;
  showingUpscaled: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  upscaledUrl: string | null;
  effectiveImageUrl: string;
  sourceUrlForTasks: string;
  handleUpscale: () => Promise<void>;
  handleToggleUpscaled: () => void;
}

/**
 * Hook for managing image upscaling functionality
 * Handles upscale task creation, state persistence, and version toggling
 */
export const useUpscale = ({
  media,
  selectedProjectId,
  isVideo,
}: UseUpscaleProps): UseUpscaleReturn => {
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [showingUpscaled, setShowingUpscaled] = useState(true); // Default to showing upscaled if available
  const hasUpscaledVersion = !!(media as any).upscaled_url;
  const upscaledUrl = (media as any).upscaled_url || null;
  // FIX: The media object uses 'url', not 'imageUrl' or 'location'
  const originalUrl = (media as any).url || media.imageUrl || media.location || '';
  
  // Track pending upscale tasks using localStorage
  const [isPendingUpscale, setIsPendingUpscale] = useState(() => {
    try {
      const pending = localStorage.getItem(`upscale-pending-${media.id}`);
      console.log('[ImageUpscale] Initial pending state from localStorage:', {
        mediaId: media.id,
        pending,
        isPending: pending === 'true'
      });
      return pending === 'true';
    } catch {
      return false;
    }
  });

  // Log upscale state changes
  useEffect(() => {
    console.log('[ImageUpscale] State update:', {
      mediaId: media.id,
      hasUpscaledVersion,
      upscaledUrl,
      isPendingUpscale,
      isUpscaling,
      showingUpscaled,
      mediaKeys: Object.keys(media),
      timestamp: Date.now()
    });
  }, [media.id, hasUpscaledVersion, isPendingUpscale, isUpscaling, showingUpscaled, media, upscaledUrl]);

  // Clear pending state when upscaled version becomes available
  useEffect(() => {
    console.log('[ImageUpscale] Checking if should clear pending state:', {
      hasUpscaledVersion,
      isPendingUpscale,
      upscaledUrl,
      shouldClear: hasUpscaledVersion && isPendingUpscale
    });
    
    if (hasUpscaledVersion && isPendingUpscale) {
      console.log('[ImageUpscale] ✅ Upscaled version now available, clearing pending state');
      setIsPendingUpscale(false);
      try {
        localStorage.removeItem(`upscale-pending-${media.id}`);
        console.log('[ImageUpscale] ✅ Successfully removed pending state from localStorage');
      } catch (e) {
        console.error('[ImageUpscale] ❌ Error removing pending state:', e);
      }
    } else {
      console.log('[ImageUpscale] Not clearing pending state because:', {
        reason: !hasUpscaledVersion ? 'no upscaled version yet' : 'not in pending state'
      });
    }
  }, [hasUpscaledVersion, isPendingUpscale, media.id, upscaledUrl]);

  // Handle upscale
  const handleUpscale = async () => {
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot upscale videos');
      return;
    }

    setIsUpscaling(true);
    try {
      // FIX: Use 'url' field which is what the media object actually has
      const imageUrl = (media as any).url || media.location || media.imageUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      console.log('[ImageUpscale] Starting upscale for generation:', media.id);

      // Create upscale task
      await createImageUpscaleTask({
        project_id: selectedProjectId,
        image_url: imageUrl,
        generation_id: media.id,
      });

      console.log('[ImageUpscale] ✅ Upscale task created successfully');
      
      // Mark as pending in localStorage so it persists across component remounts
      setIsPendingUpscale(true);
      try {
        localStorage.setItem(`upscale-pending-${media.id}`, 'true');
        console.log('[ImageUpscale] ✅ Set pending state in localStorage:', {
          mediaId: media.id,
          key: `upscale-pending-${media.id}`
        });
      } catch (e) {
        console.error('[ImageUpscale] ❌ Error setting pending state:', e);
      }
      
    } catch (error) {
      console.error('[ImageUpscale] Error creating upscale task:', error);
      toast.error('Failed to create upscale task');
    } finally {
      setIsUpscaling(false);
    }
  };

  // Handle toggling between upscaled and original
  const handleToggleUpscaled = () => {
    setShowingUpscaled(!showingUpscaled);
  };

  // Compute effective image URL based on upscale state
  const effectiveImageUrl = (showingUpscaled && upscaledUrl) ? upscaledUrl : originalUrl;
  
  // Debug logging for URL issues - ALL TOP LEVEL
  console.log('[MediaDisplay] 🖼️ ========== URL COMPUTATION ==========');
  console.log('[MediaDisplay] mediaId:', media.id.substring(0, 8));
  console.log('[MediaDisplay] effectiveImageUrl:', effectiveImageUrl);
  console.log('[MediaDisplay] originalUrl:', originalUrl);
  console.log('[MediaDisplay] upscaledUrl:', upscaledUrl);
  console.log('[MediaDisplay] showingUpscaled:', showingUpscaled);
  console.log('[MediaDisplay] hasUpscaledVersion:', hasUpscaledVersion);
  console.log('[MediaDisplay] media.url:', (media as any).url);
  console.log('[MediaDisplay] media.imageUrl:', media.imageUrl);
  console.log('[MediaDisplay] media.location:', media.location);
  console.log('[MediaDisplay] media.thumbUrl:', (media as any).thumbUrl);
  console.log('[MediaDisplay] media.type:', media.type);
  console.log('[MediaDisplay] isEmpty:', !effectiveImageUrl);
  console.log('[MediaDisplay] ALL media keys:', Object.keys(media));
  console.log('[MediaDisplay] ========================================');
  
  // Source URL for tasks (always use upscaled if available, otherwise get display URL)
  const sourceUrlForTasks = upscaledUrl ? getDisplayUrl(upscaledUrl) : getDisplayUrl(originalUrl);

  return {
    isUpscaling,
    showingUpscaled,
    isPendingUpscale,
    hasUpscaledVersion,
    upscaledUrl,
    effectiveImageUrl,
    sourceUrlForTasks,
    handleUpscale,
    handleToggleUpscaled,
  };
};

