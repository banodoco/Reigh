/**
 * Metadata stored on shot_generations for timeline and prompt management
 * This is the single source of truth for pair prompts, enhanced prompts, and position metadata
 */
export interface GenerationMetadata {
  // Timeline positioning
  frame_spacing?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;

  // Pair prompts (stored on the first item of each pair)
  pair_prompt?: string;
  pair_negative_prompt?: string;
  enhanced_prompt?: string;

  // Allow additional metadata fields without losing type safety on known keys
  [key: string]: any;
}

/**
 * Base type for all generation data
 * Used throughout the app for galleries, lightboxes, and general image display
 * 
 * IMPORTANT ID FIELDS:
 * - `id` is the shot_generations.id (unique per entry in a shot)
 * - `generation_id` is the generations.id (the actual generation record)
 * 
 * When the same generation appears twice in a shot:
 * - Both have the SAME `generation_id`
 * - Each has a DIFFERENT `id` (their shot_generations entry IDs)
 * 
 * For operations:
 * - Use `id` for delete, reorder, position updates (targets the shot entry)
 * - Use `generation_id` for fetching generation data, lineage tracking
 * 
 * @deprecated shotImageEntryId - Use `id` instead (same value)
 * @deprecated shot_generation_id - Use `id` instead (same value)
 */
export interface GenerationRow {
  id: string; // shot_generations.id - unique per entry in shot
  generation_id?: string; // generations.id - the actual generation record
  // Add other relevant properties from your generations table
  imageUrl?: string; // May specifically be for image previews
  thumbUrl?: string;
  location?: string | null;
  type?: string | null;
  contentType?: string; // MIME type for proper download file extensions (e.g., 'video/mp4', 'image/png')
  createdAt?: string;
  metadata?: GenerationMetadata; // Typed metadata field
  isOptimistic?: boolean;
  /** @deprecated Use `id` instead - this is the same value */
  shotImageEntryId?: string; // Deprecated: ID from the shot_generations table
  /** @deprecated Use `id` instead - this is the same value */
  shot_generation_id?: string; // Deprecated: alias for shotImageEntryId
  name?: string; // Optional variant name
  timeline_frame?: number; // Position in timeline (from shot_generations table)
  starred?: boolean; // Whether this generation is starred
  derivedCount?: number; // Number of generations based on this one
  based_on?: string | null; // ID of source generation for lineage tracking (magic edits, variations)
  params?: any; // JSON parameters for the generation (prompt, settings, etc.)
  created_at?: string; // DB column name
  parent_generation_id?: string | null;
  variant_name?: string;
  is_child?: boolean;
  child_order?: number | null;
}

/**
 * Type for timeline-specific images that guarantees required fields
 * Use this type when you need to read pair prompts or timeline positions
 * 
 * @example
 * ```typescript
 * const timelineImages = images.filter(isTimelineGeneration);
 * // Now TypeScript knows timelineImages[0].metadata exists
 * const pairPrompt = timelineImages[0].metadata.pair_prompt;
 * ```
 */
export interface TimelineGenerationRow extends GenerationRow {
  timeline_frame: number; // Required for timeline positioning
  metadata: GenerationMetadata; // Required for pair prompts and timeline metadata
}

export interface Shot {
  id: string;
  name: string;
  images: GenerationRow[]; // This will be populated by joining data
  created_at?: string; // Optional, matches the DB schema
  updated_at?: string | null; // Optional, matches the DB schema
  project_id?: string; // Add project_id here
  aspect_ratio?: string | null; // Aspect ratio for shot video generation
  position: number; // Position for manual ordering
  
  // Pre-computed stats (computed in useListShots, used to avoid reactive flicker)
  imageCount?: number;
  positionedImageCount?: number;
  unpositionedImageCount?: number;
  hasUnpositionedImages?: boolean;
}

export interface ShotImage {
  shot_id: string;
  generation_id: string; // Assuming generation_id is a string. If it's BIGINT, this might be number.
  timeline_frame?: number;
} 