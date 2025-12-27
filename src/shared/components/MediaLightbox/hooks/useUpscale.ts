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
 * 
 * NOTE: With generation_variants system, upscaled versions become the primary variant.
 * When upscale completes:
 * 1. A new variant with variant_type='upscaled' is created as is_primary=true
 * 2. This syncs to generations.location automatically via trigger
 * 3. So media.url already IS the upscaled version after upscale completes
 * 
 * The toggle functionality is kept for backward compatibility but may need
 * to be updated to use the variant switching system in the future.
 */
export const useUpscale = ({
  media,
  selectedProjectId,
  isVideo,
}: UseUpscaleProps): UseUpscaleReturn => {
  const [isUpscaling, setIsUpscaling] = useState(false);

  // With variants, the media.url IS already the best version (primary variant)
  // We can detect if it's been upscaled by checking the name or variant info
  // For now, check if name includes 'Upscaled' as a heuristic
  const hasUpscaledVersion = (media as any).name === 'Upscaled' ||
                             (media as any).variant_type === 'upscaled';

  // The URL from media is already the primary variant (upscaled if available)
  const primaryUrl = (media as any).url || media.imageUrl || media.location || '';

  // Track pending upscale tasks using localStorage
  const [isPendingUpscale, setIsPendingUpscale] = useState(false);

  // Reset state when media.id changes (navigation between items)
  useEffect(() => {
    // Reset isUpscaling when navigating to a new item
    setIsUpscaling(false);

    // Check localStorage for pending state for this specific media item
    try {
      const pending = localStorage.getItem(`upscale-pending-${media.id}`);
      console.log('[ImageUpscale] Media changed, checking pending state:', {
        mediaId: media.id,
        pending,
        isPending: pending === 'true'
      });
      setIsPendingUpscale(pending === 'true');
    } catch {
      setIsPendingUpscale(false);
    }
  }, [media.id]);

  // Log upscale state changes
  useEffect(() => {
    console.log('[ImageUpscale] State update:', {
      mediaId: media.id,
      hasUpscaledVersion,
      isPendingUpscale,
      isUpscaling,
      mediaName: (media as any).name,
      timestamp: Date.now()
    });
  }, [media.id, hasUpscaledVersion, isPendingUpscale, isUpscaling, media]);

  // Clear pending state when upscaled version becomes available
  // With variants, we detect this by checking if the media name changed to 'Upscaled'
  useEffect(() => {
    console.log('[ImageUpscale] Checking if should clear pending state:', {
      hasUpscaledVersion,
      isPendingUpscale,
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
  }, [hasUpscaledVersion, isPendingUpscale, media.id]);

  // Handle upscale
  const handleUpscale = async () => {
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot upscale videos');
      return;
    }

    setIsUpscaling(true);
    try {
      // Use the current primary URL as the source
      const imageUrl = primaryUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
      // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
      const actualGenerationId = (media as any).generation_id || media.id;
      
      console.log('[ImageUpscale] Starting upscale for generation:', actualGenerationId);

      // Create upscale task - this will create a new variant that becomes primary
      await createImageUpscaleTask({
        project_id: selectedProjectId,
        image_url: imageUrl,
        generation_id: actualGenerationId,
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

  // Toggle functionality removed - always show the best version (upscaled if available)
  // The variant system means media.location already points to the primary (upscaled) version
  const handleToggleUpscaled = () => {
    // No-op - toggle removed, keeping for API compatibility
    console.log('[ImageUpscale] Toggle removed - always showing best version');
  };

  // The effective URL is always the primary URL (which is upscaled if that's primary)
  const effectiveImageUrl = primaryUrl;
  
  // Debug logging for URL issues
  console.log('[MediaDisplay] 🖼️ URL COMPUTATION:', {
    mediaId: media.id.substring(0, 8),
    effectiveImageUrl: effectiveImageUrl?.substring(0, 50),
    hasUpscaledVersion,
    mediaName: (media as any).name,
  });
  
  // Source URL for tasks is always the current primary
  const sourceUrlForTasks = getDisplayUrl(primaryUrl);

  return {
    isUpscaling,
    showingUpscaled: true, // Always show best version (toggle removed)
    isPendingUpscale,
    hasUpscaledVersion,
    upscaledUrl: hasUpscaledVersion ? primaryUrl : null, // If upscaled is primary, the URL is the upscaled one
    effectiveImageUrl,
    sourceUrlForTasks,
    handleUpscale,
    handleToggleUpscaled,
  };
};
