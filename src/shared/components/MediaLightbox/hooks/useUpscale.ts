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
  const originalUrl = media.imageUrl || media.location || '';
  
  // Track pending upscale tasks using localStorage
  const [isPendingUpscale, setIsPendingUpscale] = useState(() => {
    try {
      const pending = localStorage.getItem(`upscale-pending-${media.id}`);
      return pending === 'true';
    } catch {
      return false;
    }
  });

  // Log upscale state changes
  useEffect(() => {
    ,
      timestamp: Date.now()
    });
  }, [media.id, hasUpscaledVersion, isPendingUpscale, isUpscaling, showingUpscaled, media, upscaledUrl]);

  // Clear pending state when upscaled version becomes available
  useEffect(() => {
    if (hasUpscaledVersion && isPendingUpscale) {
      setIsPendingUpscale(false);
      try {
        localStorage.removeItem(`upscale-pending-${media.id}`);
        } catch (e) {
        console.error('[ImageUpscale] ❌ Error removing pending state:', e);
      }
    } else {
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
      const imageUrl = media.location || media.imageUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      // Create upscale task
      await createImageUpscaleTask({
        project_id: selectedProjectId,
        image_url: imageUrl,
        generation_id: media.id,
      });

      // Mark as pending in localStorage so it persists across component remounts
      setIsPendingUpscale(true);
      try {
        localStorage.setItem(`upscale-pending-${media.id}`, 'true');
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

