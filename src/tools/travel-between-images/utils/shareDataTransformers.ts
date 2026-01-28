/**
 * Utility functions for transforming share page data to match component expectations.
 *
 * These transformers ensure the RPC response data is shaped correctly for
 * components that normally receive data from hooks like useAllShotGenerations.
 *
 * IMPORTANT: If hook return shapes change, update these transformers.
 */

import type { GenerationRow } from '@/types/shots';

/**
 * Transform a shared generation (video) to the GenerationRow format expected by FinalVideoSection.
 *
 * @param generation - The generation data from the share RPC
 * @returns GenerationRow compatible object, or null if no generation
 */
export function transformGenerationToParentRow(
  generation: Record<string, any> | null | undefined
): GenerationRow | null {
  if (!generation) return null;

  return {
    id: generation.id || generation.generation_id || 'shared',
    generation_id: generation.generation_id || generation.id || 'shared',
    type: 'video',
    location: generation.location,
    imageUrl: generation.location, // FinalVideoSection/VideoItem uses imageUrl
    thumbUrl: generation.thumbUrl || generation.thumbnail_url,
    created_at: generation.created_at,
    params: generation.params,
  } as GenerationRow;
}

/**
 * Transform share page images to the format expected by ShotImagesEditor.
 *
 * The images from the RPC should already be in GenerationRow format,
 * but this ensures consistency and handles any edge cases.
 *
 * @param images - Array of image data from the share RPC
 * @returns Array of GenerationRow compatible objects
 */
export function transformImagesToGenerationRows(
  images: Record<string, any>[] | null | undefined
): GenerationRow[] {
  if (!images || !Array.isArray(images)) return [];

  return images.map((img) => ({
    ...img,
    // Ensure required fields exist
    id: img.id || img.generation_id,
    generation_id: img.generation_id || img.id,
    type: img.type || 'image',
    imageUrl: img.imageUrl || img.location,
    thumbUrl: img.thumbUrl || img.thumbnail_url,
  })) as GenerationRow[];
}

/**
 * Calculate the appropriate column count for the image grid based on device type.
 *
 * Uses the same logic as ShotEditor to ensure consistent display.
 *
 * @param mobileColumns - Column count from useDeviceDetection (2-6)
 * @returns Validated column count (2, 3, 4, or 6)
 */
export function calculateColumnsForDevice(
  mobileColumns: number
): 2 | 3 | 4 | 6 {
  // Ensure we return a valid column value
  if (mobileColumns <= 2) return 2;
  if (mobileColumns === 3) return 3;
  if (mobileColumns === 4) return 4;
  return 6;
}

/**
 * Extract structure video configuration from settings.
 *
 * Handles both single structure video (legacy) and multi-video array formats.
 *
 * @param settings - The travel settings object
 * @returns Array of structure video configurations
 */
export function extractStructureVideos(
  settings: Record<string, any> | null | undefined
): Array<{
  path: string;
  start_frame: number;
  end_frame: number;
  treatment: 'adjust' | 'clip';
  motion_strength: number;
  structure_type: string;
  metadata: any;
}> {
  if (!settings) return [];

  const structureVideo = settings.structureVideo;
  const structureVideos = settings.structureVideos;

  // Prefer the array format if present
  if (structureVideos && Array.isArray(structureVideos) && structureVideos.length > 0) {
    return structureVideos;
  }

  // Fall back to single video format
  if (structureVideo?.path) {
    return [{
      path: structureVideo.path,
      start_frame: structureVideo.startFrame ?? 0,
      end_frame: structureVideo.endFrame ?? 300,
      treatment: structureVideo.treatment || 'adjust',
      motion_strength: structureVideo.motionStrength ?? 1.0,
      structure_type: structureVideo.structureType || 'uni3c',
      metadata: structureVideo.metadata || null,
    }];
  }

  return [];
}
