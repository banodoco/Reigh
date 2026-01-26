/**
 * Dimension extraction utilities for media objects
 *
 * Provides helpers to extract width/height from various sources:
 * - Direct dimensions
 * - Resolution strings (e.g., "1920x1080")
 * - Aspect ratio strings (e.g., "16:9")
 */

import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio, parseRatio } from './aspectRatios';

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Convert a resolution string (e.g., "1920x1080") to dimensions
 */
export function resolutionToDimensions(resolution: string): Dimensions | null {
  if (!resolution || typeof resolution !== 'string' || !resolution.includes('x')) return null;
  const [w, h] = resolution.split('x').map(Number);
  if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return null;
}

/**
 * Convert an aspect ratio string (e.g., "16:9") to standard dimensions
 * Falls back to closest standard aspect ratio if exact match not found
 */
export function aspectRatioToDimensions(aspectRatio: string): Dimensions | null {
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
}

/**
 * Media object type for dimension extraction
 * Supports various shapes from generations, variants, etc.
 */
interface MediaLike {
  width?: number;
  height?: number;
  metadata?: Record<string, any> | null;
  params?: Record<string, any> | null;
}

/**
 * Extract dimensions from a media object, checking multiple sources
 *
 * Priority order:
 * 1. Top-level width/height (from generations table)
 * 2. metadata.width/height
 * 3. Resolution strings from params/metadata
 * 4. Aspect ratio strings converted to standard dimensions
 *
 * @param mediaObj - Media object with potential dimension data
 * @returns Dimensions or null if not found
 */
export function extractDimensionsFromMedia(mediaObj: MediaLike | null | undefined): Dimensions | null {
  if (!mediaObj) return null;

  const params = mediaObj.params;
  const metadata = mediaObj.metadata;

  // 1. Check top-level width/height first (from generations table)
  if (mediaObj.width && mediaObj.height) {
    return { width: mediaObj.width, height: mediaObj.height };
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
}
