/**
 * Utility for resolving image URLs
 * 
 * NOTE: This module has been simplified. Previously it prioritized upscaled URLs,
 * but now upscaled versions are stored as the primary variant, so `location` 
 * already contains the best available URL.
 * 
 * These functions are kept for backward compatibility but now simply return the location.
 */

/**
 * Resolves the image URL - simply returns the location
 * 
 * @param location - The image location/URL
 * @returns The location or null
 * @deprecated Just use `location` directly - upscaled is now the primary variant
 */
export function resolveImageUrl(location: string | null | undefined): string | null {
  return location || null;
}

/**
 * Resolves the image URL from a generation object
 * 
 * @param generation - Generation object with location
 * @returns The location or null
 * @deprecated Just use `generation.location` directly
 */
export function resolveGenerationImageUrl(generation: {
  location?: string | null;
  [key: string]: any;
}): string | null {
  return generation.location || null;
}

/**
 * Resolves image URLs from an array of generations
 * 
 * @param generations - Array of generation objects
 * @returns Array of URLs
 * @deprecated Just map over `generation.location` directly
 */
export function resolveGenerationImageUrls(generations: Array<{
  location?: string | null;
  [key: string]: any;
}>): string[] {
  return generations
    .map(gen => gen.location)
    .filter((url): url is string => Boolean(url));
}
