/**
 * Shared Generation Data Transformers
 * 
 * SINGLE SOURCE OF TRUTH for transforming generation data from database to UI format.
 * 
 * This eliminates the need to manually update transformation logic in multiple places
 * when adding new fields (like upscaled_url). Instead, update once here and all
 * consumers automatically get the new field.
 * 
 * Architecture Benefits:
 * - DRY: No duplicated transformation logic across hooks/components
 * - Type Safety: Centralized TypeScript types ensure consistency
 * - Maintainability: Add new fields in one place instead of 5+
 * - Testability: Can unit test transformations in isolation
 */

import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { GenerationRow } from '@/types/shots';

/**
 * Raw generation record from database (before transformation)
 */
export interface RawGeneration {
  id: string;
  location: string;
  thumbnail_url?: string | null;
  type?: string | null;
  created_at: string;
  params?: any;
  starred?: boolean | null;
  tasks?: any[] | any | null;
  based_on?: string | null;
  upscaled_url?: string | null;
  name?: string | null;
  shot_generations?: Array<{
    shot_id: string;
    timeline_frame: number | null;
  }>;
}

/**
 * Raw shot_generation record from database (before transformation)
 */
export interface RawShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  timeline_frame: number | null;
  metadata?: any;
  created_at?: string;
  generation?: RawGeneration | RawGeneration[] | null;
  generations?: RawGeneration | RawGeneration[] | null;
}

/**
 * Options for transformation customization
 */
export interface TransformOptions {
  /** Shot image entry ID (from shot_generations table) */
  shotImageEntryId?: string;
  /** Timeline frame position */
  timeline_frame?: number | null;
  /** Additional metadata to merge */
  metadata?: any;
  /** Shot ID for filtering */
  shotId?: string;
  /** Whether to include verbose logging */
  verbose?: boolean;
}

/**
 * Extract prompt from various nested param structures
 */
function extractPrompt(params: any): string {
  if (!params) return 'No prompt';
  
  return (
    params.originalParams?.orchestrator_details?.prompt ||
    params.prompt ||
    params.metadata?.prompt ||
    'No prompt'
  );
}

/**
 * Extract thumbnail URL with fallback logic
 * Handles special case for travel-between-images videos where thumbnail might be in params
 */
function extractThumbnailUrl(item: RawGeneration, mainUrl: string): string {
  // Start with database thumbnail_url field
  let thumbnailUrl = item.thumbnail_url;
  
  // If no thumbnail in database, check params for travel-between-images videos
  if (!thumbnailUrl && item.params?.tool_type === 'travel-between-images') {
    thumbnailUrl = 
      item.params?.thumbnailUrl ||
      item.params?.originalParams?.orchestrator_details?.thumbnail_url ||
      item.params?.full_orchestrator_payload?.thumbnail_url ||
      item.params?.originalParams?.full_orchestrator_payload?.thumbnail_url;
  }
  
  // Final fallback to main URL
  return thumbnailUrl || mainUrl;
}

/**
 * Extract task ID from tasks field (handles both array and single value)
 */
function extractTaskId(tasks: any[] | any | null | undefined): string | null {
  if (Array.isArray(tasks) && tasks.length > 0) {
    return tasks[0];
  }
  return null;
}

/**
 * Normalize timeline_frame to position (divide by 50)
 */
function normalizePosition(timelineFrame: number | null | undefined): number | null {
  if (timelineFrame === null || timelineFrame === undefined) return null;
  return Math.floor(timelineFrame / 50);
}

/**
 * Transform a raw generation record from database to UI format
 * 
 * This is the MAIN transformation function used by most hooks/components
 * 
 * @param item - Raw generation from database query
 * @param options - Optional customization (shot context, metadata, etc.)
 * @returns Transformed generation ready for UI display
 */
export function transformGeneration(
  item: RawGeneration,
  options: TransformOptions = {}
): GeneratedImageWithMetadata {
  const mainUrl = item.location;
  const thumbnailUrl = extractThumbnailUrl(item, mainUrl);
  const taskId = extractTaskId(item.tasks);
  const prompt = extractPrompt(item.params);
  
  // Base transformation - fields common to all generations
  const baseItem: GeneratedImageWithMetadata = {
    id: item.id,
    url: mainUrl,
    thumbUrl: thumbnailUrl,
    prompt,
    metadata: {
      ...(item.params || {}),
      taskId, // Include task ID in metadata for ImageGalleryItem
      based_on: item.based_on, // Include based_on for lineage tracking
      upscaled_url: item.upscaled_url, // Include upscaled_url for upscale feature
      ...(options.metadata || {}), // Merge any additional metadata
    },
    createdAt: item.created_at,
    isVideo: item.type?.includes('video') || false,
    starred: item.starred || false,
    based_on: item.based_on, // Top level for easy access
    upscaled_url: item.upscaled_url, // Top level for MediaLightbox
    position: null, // Will be set if shot context provided
    timeline_frame: null, // Will be set if shot context provided
  };

  // [UpscaleDebug] Preserve existing debug logging
  if (item.upscaled_url && options.verbose) {
    ,
      hasUpscaledUrl: !!baseItem.upscaled_url,
      upscaled_url: baseItem.upscaled_url?.substring(0, 60)
    });
  }

  // Handle shot associations from LEFT JOIN
  const shotGenerations = item.shot_generations || [];
  
  // If shot context is provided via options, use it
  if (options.shotImageEntryId || options.timeline_frame !== undefined) {
    return {
      ...baseItem,
      shotImageEntryId: options.shotImageEntryId,
      timeline_frame: options.timeline_frame ?? null,
      position: normalizePosition(options.timeline_frame),
    };
  }

  // Otherwise, process shot associations from query data
  if (shotGenerations.length > 0) {
    // Single shot optimization
    if (shotGenerations.length === 1) {
      const singleShot = shotGenerations[0];
      return {
        ...baseItem,
        shot_id: singleShot.shot_id,
        position: normalizePosition(singleShot.timeline_frame),
        timeline_frame: singleShot.timeline_frame,
      };
    }
    
    // Multiple shots: include all associations
    const allAssociations = shotGenerations.map(sg => ({
      shot_id: sg.shot_id,
      timeline_frame: sg.timeline_frame,
      position: normalizePosition(sg.timeline_frame),
    }));
    
    // When filtering by specific shot, use that shot as primary
    let primaryShot = shotGenerations[0];
    if (options.shotId) {
      const matchingShot = shotGenerations.find(sg => sg.shot_id === options.shotId);
      if (matchingShot) {
        primaryShot = matchingShot;
      }
    }

    return {
      ...baseItem,
      shot_id: primaryShot.shot_id,
      position: normalizePosition(primaryShot.timeline_frame),
      timeline_frame: primaryShot.timeline_frame,
      all_shot_associations: allAssociations,
    };
  }
  
  return baseItem;
}

/**
 * Transform a shot_generation record (with nested generation data)
 * 
 * Used by hooks that query shot_generations table with JOIN to generations
 * 
 * @param shotGen - Raw shot_generation from database
 * @param options - Optional customization
 * @returns Transformed generation with timeline context
 */
export function transformShotGeneration(
  shotGen: RawShotGeneration,
  options: TransformOptions = {}
): GeneratedImageWithMetadata & { timeline_frame: number | null } {
  // Handle both 'generation' and 'generations' field names (Supabase inconsistency)
  let gen = shotGen.generation || shotGen.generations;
  
  // If it's an array, take the first item
  if (Array.isArray(gen)) {
    gen = gen[0];
  }
  
  if (!gen) {
    // Fallback for missing generation data
    console.warn('[TransformerWarning] Shot generation missing nested generation:', shotGen.id);
    return {
      id: shotGen.generation_id,
      url: '',
      thumbUrl: '',
      prompt: 'Missing generation data',
      metadata: {},
      createdAt: shotGen.created_at || new Date().toISOString(),
      isVideo: false,
      starred: false,
      shotImageEntryId: shotGen.id,
      timeline_frame: shotGen.timeline_frame,
      position: normalizePosition(shotGen.timeline_frame),
    };
  }
  
  // Transform using the base transformer with shot context
  const transformed = transformGeneration(gen, {
    ...options,
    shotImageEntryId: shotGen.id,
    timeline_frame: shotGen.timeline_frame,
    metadata: {
      ...shotGen.metadata,
      ...(options.metadata || {}),
    },
  });
  
  return {
    ...transformed,
    timeline_frame: shotGen.timeline_frame,
  };
}

/**
 * Transform for Timeline component's specific needs
 * Maps to GenerationRow format expected by Timeline
 */
export function transformForTimeline(
  shotGen: RawShotGeneration
): GenerationRow & { timeline_frame?: number } {
  const gen = shotGen.generation || shotGen.generations;
  const genData = Array.isArray(gen) ? gen[0] : gen;
  
  if (!genData) {
    return {
      id: shotGen.generation_id,
      shotImageEntryId: shotGen.id,
      timeline_frame: shotGen.timeline_frame ?? undefined,
    };
  }
  
  return {
    id: shotGen.generation_id,
    shotImageEntryId: shotGen.id,
    imageUrl: genData.location,
    thumbUrl: genData.location,
    location: genData.location,
    type: genData.type ?? undefined,
    createdAt: genData.created_at,
    timeline_frame: shotGen.timeline_frame ?? undefined,
    metadata: shotGen.metadata,
    upscaled_url: genData.upscaled_url ?? undefined, // 🚀 Pass through upscaled_url
    starred: genData.starred ?? false, // ⭐ Pass through starred status
    based_on: genData.based_on ?? undefined, // 🔗 Pass through based_on for lineage tracking
  };
}

/**
 * Transform for useUnifiedGenerations (VideoOutputsGallery)
 * Returns format with taskId for task tracking
 */
export function transformForUnifiedGenerations(
  shotGen: RawShotGeneration,
  includeTaskData: boolean = false
): GeneratedImageWithMetadata {
  const gen = shotGen.generation || shotGen.generations;
  const genData = Array.isArray(gen) ? gen[0] : gen;
  
  if (!genData) {
    return {
      id: shotGen.generation_id,
      url: '',
      thumbUrl: '',
      prompt: 'No prompt',
      metadata: {},
      createdAt: shotGen.created_at || new Date().toISOString(),
      isVideo: false,
      starred: false,
      shotImageEntryId: shotGen.id,
      position: normalizePosition(shotGen.timeline_frame),
      taskId: null,
    };
  }
  
  const baseTransform = transformGeneration(genData, {
    shotImageEntryId: shotGen.id,
    timeline_frame: shotGen.timeline_frame,
  });
  
  // Extract taskId if needed
  const taskId = includeTaskData && genData.tasks 
    ? (Array.isArray(genData.tasks) ? genData.tasks[0] : genData.tasks)
    : null;
  
  return {
    ...baseTransform,
    shotImageEntryId: shotGen.id,
    position: normalizePosition(shotGen.timeline_frame),
    taskId,
    name: genData.name || undefined,
  };
}

