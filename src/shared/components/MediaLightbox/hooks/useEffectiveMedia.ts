/**
 * useEffectiveMedia - Computes effective URLs and dimensions for media display
 *
 * Handles:
 * - effectiveVideoUrl: Video URL respecting active variant
 * - effectiveMediaUrl: Image URL respecting active variant
 * - effectiveImageDimensions: Guaranteed dimensions with fallbacks
 */

import { useMemo } from 'react';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';

export interface UseEffectiveMediaProps {
  isVideo: boolean;
  activeVariant: {
    id: string;
    location: string;
    thumbnail_url?: string;
    is_primary?: boolean;
  } | null;
  effectiveImageUrl: string | undefined;
  imageDimensions: { width: number; height: number } | null;
  projectAspectRatio: string | undefined;
}

export interface UseEffectiveMediaReturn {
  effectiveVideoUrl: string | undefined;
  effectiveMediaUrl: string | undefined;
  effectiveImageDimensions: { width: number; height: number };
}

export function useEffectiveMedia({
  isVideo,
  activeVariant,
  effectiveImageUrl,
  imageDimensions,
  projectAspectRatio,
}: UseEffectiveMediaProps): UseEffectiveMediaReturn {
  // Get the effective video URL (active variant or current media)
  const effectiveVideoUrl = useMemo(() => {
    if (isVideo && activeVariant) {
      return activeVariant.location;
    }
    return effectiveImageUrl;
  }, [isVideo, activeVariant, effectiveImageUrl]);

  // For images, use the active variant's location when a variant is explicitly selected
  const effectiveMediaUrl = useMemo(() => {
    console.log('[VariantClickDebug] effectiveMediaUrl computing:', {
      hasActiveVariant: !!activeVariant,
      activeVariantId: activeVariant?.id?.substring(0, 8),
      activeVariantIsPrimary: activeVariant?.is_primary,
      activeVariantLocation: activeVariant?.location?.substring(0, 50),
      effectiveImageUrl: effectiveImageUrl?.substring(0, 50),
    });

    // If an active variant is set (any variant, including primary), use its location
    if (activeVariant && activeVariant.location) {
      console.log('[VariantClickDebug] ✅ Using active variant location:', activeVariant.location.substring(0, 50));
      return activeVariant.location;
    }
    // Otherwise use the standard effective image URL
    console.log('[VariantClickDebug] Using effectiveImageUrl:', effectiveImageUrl?.substring(0, 50));
    return effectiveImageUrl;
  }, [activeVariant, effectiveImageUrl]);

  // Compute effective dimensions that are GUARANTEED to have a value
  // This is computed synchronously during render, so there's no flicker
  // Priority: extracted/loaded dimensions > project aspect ratio > 16:9 default
  const effectiveImageDimensions = useMemo(() => {
    // Use actual dimensions if we have them
    if (imageDimensions) {
      return imageDimensions;
    }

    // Fallback to project aspect ratio
    if (projectAspectRatio) {
      const resolution = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
      if (resolution && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
          console.log('[LightboxDimensions] Using project aspect ratio for effective dims:', {
            projectAspectRatio,
            resolution,
          });
          return { width: w, height: h };
        }
      }
    }

    // Absolute last resort: 16:9 default
    console.log('[LightboxDimensions] Using 16:9 default for effective dims');
    return { width: 1920, height: 1080 };
  }, [imageDimensions, projectAspectRatio]);

  return {
    effectiveVideoUrl,
    effectiveMediaUrl,
    effectiveImageDimensions,
  };
}
