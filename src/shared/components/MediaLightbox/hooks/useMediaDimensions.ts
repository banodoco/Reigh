import { useState, useCallback } from 'react';
import { parseRatio, findClosestAspectRatio, ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { GenerationRow } from '@/types/shots';

interface UseMediaDimensionsProps {
  media: GenerationRow | null | undefined;
}

interface UseMediaDimensionsReturn {
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number } | null) => void;
  extractDimensionsFromMedia: (mediaObj: GenerationRow | null | undefined) => { width: number; height: number } | null;
}

/**
 * Hook to manage media dimensions extraction and state.
 * Extracts dimensions from multiple sources in priority order:
 * 1. Exact width/height on media object
 * 2. Resolution strings (e.g., "1920x1080")
 * 3. Aspect ratio converted to standard dimensions
 */
export function useMediaDimensions({ media }: UseMediaDimensionsProps): UseMediaDimensionsReturn {
  // Helper to convert resolution string to dimensions
  const resolutionToDimensions = useCallback((resolution: string): { width: number; height: number } | null => {
    if (!resolution || typeof resolution !== 'string' || !resolution.includes('x')) return null;
    const [w, h] = resolution.split('x').map(Number);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
    return null;
  }, []);

  // Helper to convert aspect ratio string to standard dimensions
  const aspectRatioToDimensions = useCallback((aspectRatio: string): { width: number; height: number } | null => {
    if (!aspectRatio) return null;

    // Direct lookup in our standard aspect ratios
    const directResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio];
    if (directResolution) {
      return resolutionToDimensions(directResolution);
    }

    // Try to parse and find closest standard aspect ratio
    const ratio = parseRatio(aspectRatio);
    if (!isNaN(ratio)) {
      const closestAspectRatio = findClosestAspectRatio(ratio);
      const closestResolution = ASPECT_RATIO_TO_RESOLUTION[closestAspectRatio];
      if (closestResolution) {
        return resolutionToDimensions(closestResolution);
      }
    }

    return null;
  }, [resolutionToDimensions]);

  // Helper to extract dimensions from media object (checks multiple sources)
  // Priority: exact dimensions > resolution string > aspect_ratio > null
  const extractDimensionsFromMedia = useCallback((mediaObj: GenerationRow | null | undefined): { width: number; height: number } | null => {
    if (!mediaObj) return null;

    const params = (mediaObj as any)?.params;
    const metadata = mediaObj?.metadata as any;

    // 1. Check top-level width/height first (from generations table)
    if ((mediaObj as any)?.width && (mediaObj as any)?.height) {
      return { width: (mediaObj as any).width, height: (mediaObj as any).height };
    }

    // 2. Check metadata.width/height
    if (metadata?.width && metadata?.height) {
      return { width: metadata.width, height: metadata.height };
    }

    // 3. Check resolution strings in multiple locations
    const resolutionSources = [
      params?.resolution,
      params?.originalParams?.resolution,
      params?.orchestrator_details?.resolution,
      metadata?.resolution,
      metadata?.originalParams?.resolution,
      metadata?.originalParams?.orchestrator_details?.resolution,
    ];

    for (const res of resolutionSources) {
      const dims = resolutionToDimensions(res);
      if (dims) return dims;
    }

    // 4. Check for aspect_ratio in params and convert to standard dimensions
    // This is faster than falling back to project aspect ratio since data is already loaded
    const aspectRatioSources = [
      params?.aspect_ratio,
      params?.custom_aspect_ratio,
      params?.originalParams?.aspect_ratio,
      params?.orchestrator_details?.aspect_ratio,
      metadata?.aspect_ratio,
      metadata?.originalParams?.aspect_ratio,
      metadata?.originalParams?.orchestrator_details?.aspect_ratio,
    ];

    for (const ar of aspectRatioSources) {
      if (ar) {
        const dims = aspectRatioToDimensions(ar);
        if (dims) return dims;
      }
    }

    return null;
  }, [resolutionToDimensions, aspectRatioToDimensions]);

  // Image dimensions state (needed by inpainting hook)
  // Initialize from media to prevent size jump during progressive loading
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media);
  });

  return {
    imageDimensions,
    setImageDimensions,
    extractDimensionsFromMedia,
  };
}
