/**
 * Utility for resolving image URLs with upscale support
 * 
 * This module provides functions to prioritize upscaled image URLs when available.
 * Use these utilities when preparing image URLs for task creation or display.
 */

/**
 * Resolves the best available image URL, prioritizing upscaled version if available
 * 
 * @param location - The original image location/URL
 * @param upscaledUrl - The upscaled image URL (if available)
 * @returns The upscaled URL if available, otherwise the original location
 */
export function resolveImageUrl(location: string | null | undefined, upscaledUrl?: string | null): string | null {
  // Prioritize upscaled URL if it exists
  if (upscaledUrl && upscaledUrl.trim()) {
    return upscaledUrl;
  }
  
  // Fall back to original location
  return location || null;
}

/**
 * Resolves the best available image URL from a generation object
 * 
 * @param generation - Generation object that may contain location and upscaled_url
 * @returns The upscaled URL if available, otherwise the original location
 */
export function resolveGenerationImageUrl(generation: {
  location?: string | null;
  upscaled_url?: string | null;
  [key: string]: any;
}): string | null {
  return resolveImageUrl(generation.location, generation.upscaled_url);
}

/**
 * Resolves best available image URLs from an array of generations
 * 
 * @param generations - Array of generation objects
 * @returns Array of resolved URLs (upscaled when available, otherwise original)
 */
export function resolveGenerationImageUrls(generations: Array<{
  location?: string | null;
  upscaled_url?: string | null;
  [key: string]: any;
}>): string[] {
  return generations
    .map(gen => resolveGenerationImageUrl(gen))
    .filter((url): url is string => Boolean(url));
}

/**
 * Type guard to check if an object has upscaled URL support
 */
export function hasUpscaledUrl(obj: any): obj is { upscaled_url: string } {
  return obj && typeof obj.upscaled_url === 'string' && obj.upscaled_url.trim().length > 0;
}

