/**
 * Helper functions for timeline image drop operations
 * Extracted from useGenerationActions for better maintainability
 */

import { toast } from "sonner";
import { Shot } from "@/types/shots";
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { supabase } from "@/integrations/supabase/client";
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';
import { 
  ensureUniqueFrame, 
  calculateNextAvailableFrame as calculateNextAvailableFrameSync 
} from '@/shared/utils/timelinePositionCalculator';

// ============================================================================
// Types
// ============================================================================

interface Project {
  id: string;
  aspectRatio?: string;
  settings?: { aspectRatio?: string };
}

interface UploadSettings {
  cropToProjectSize?: boolean;
}

interface ShotGenerationRecord {
  id: string;
  generation_id: string;
  timeline_frame: number | null;
}

interface GenerationData {
  id?: string;
  type?: string;
  location?: string;
}

interface ShotGenerationWithGeneration extends ShotGenerationRecord {
  generations?: GenerationData | GenerationData[] | null;
}

interface PositionUpdateResult {
  success: boolean;
  genId: string;
  shotGenId?: string;
  framePosition?: number;
  error?: any;
}

// ============================================================================
// Image Processing
// ============================================================================

/**
 * Crop images to match the shot's aspect ratio
 * @returns Processed files (cropped or original if cropping fails/disabled)
 */
export const cropImagesToShotAspectRatio = async (
  files: File[],
  selectedShot: Shot | undefined,
  projectId: string,
  projects: Project[],
  uploadSettings: UploadSettings | undefined
): Promise<File[]> => {
  // Skip cropping if disabled
  if (uploadSettings?.cropToProjectSize === false) {
    return files;
  }

  // Determine aspect ratio (prioritize shot over project)
  const currentProject = projects.find(p => p.id === projectId);
  const aspectRatioStr = selectedShot?.aspect_ratio || 
                        currentProject?.aspectRatio || 
                        (currentProject as any)?.settings?.aspectRatio;
  
  if (!aspectRatioStr) {
    console.log('[ImageCrop] No aspect ratio found, skipping crop');
    return files;
  }

  const targetAspectRatio = parseRatio(aspectRatioStr);
  
  if (isNaN(targetAspectRatio)) {
    console.warn('[ImageCrop] Invalid aspect ratio:', aspectRatioStr);
    return files;
  }

  console.log('[ImageCrop] Cropping images to aspect ratio:', aspectRatioStr);

  // Crop each file
  const cropPromises = files.map(async (file) => {
    try {
      const result = await cropImageToProjectAspectRatio(file, targetAspectRatio);
      if (result) {
        return result.croppedFile;
      }
      return file; // Return original if cropping fails
    } catch (error) {
      console.error(`[ImageCrop] Failed to crop image ${file.name}:`, error);
      return file; // Return original on error
    }
  });

  return await Promise.all(cropPromises);
};

// ============================================================================
// Position Calculation
// ============================================================================

// Note: ensureUniqueFrame is now imported from @/shared/utils/timelinePositionCalculator

export const calculateNextAvailableFrame = async (
  shotId: string,
  targetFrame: number | undefined
): Promise<number> => {
  console.log('[AddImagesDebug] 🔍 Querying database for existing positions...');
  
  // Query shot_generations directly from database to get current positions
  const { data: shotGenerationsData, error } = await supabase
    .from('shot_generations')
    .select(`
      id,
      generation_id,
      timeline_frame,
      generations:generation_id (
        id,
        location,
        type
      )
    `)
    .eq('shot_id', shotId)
    .order('timeline_frame', { ascending: true });

  console.log('[AddImagesDebug] 📊 Database query result:', {
    hasError: !!error,
    error: error?.message,
    dataCount: shotGenerationsData?.length,
    sampleData: shotGenerationsData?.slice(0, 3).map(sg => ({
      id: sg.id.substring(0, 8),
      generation_id: sg.generation_id?.substring(0, 8),
      timeline_frame: sg.timeline_frame,
      hasGenerations: !!sg.generations,
      generationType: (sg.generations as any)?.type
    }))
  });

  if (error) {
    console.error('[AddImagesDebug] ❌ Error fetching shot generations for position calculation:', error);
    // Default to 0 if query fails
    return targetFrame !== undefined ? targetFrame : 0;
  }

  if (!shotGenerationsData) {
    console.log('[AddImagesDebug] 🆕 No shot generations data, starting at 0');
    return targetFrame !== undefined ? targetFrame : 0;
  }

  // Filter out videos using canonical function from typeGuards
  const filteredShotGenerations = shotGenerationsData.filter(sg => 
    sg.generations && !isVideoShotGenerations(sg as ShotGenerationsLike)
  );

  console.log('[AddImagesDebug] 🔍 After filtering videos:', {
    originalCount: shotGenerationsData.length,
    filteredCount: filteredShotGenerations.length,
    removedCount: shotGenerationsData.length - filteredShotGenerations.length
  });

  // Get positions only from items with valid timeline_frame
  const existingPositions = filteredShotGenerations
    .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined && sg.timeline_frame !== -1)
    .map(sg => sg.timeline_frame!);
  
  console.log('[AddImagesDebug] 📍 Valid timeline_frame positions:', {
    count: existingPositions.length,
    positions: existingPositions,
    sorted: [...existingPositions].sort((a, b) => a - b)
  });

  // If target frame provided, ensure it's unique
  if (targetFrame !== undefined) {
    const uniqueFrame = ensureUniqueFrame(targetFrame, existingPositions);
    console.log('[AddImagesDebug] 🎯 Using provided targetFrame (with collision check):', {
      original: targetFrame,
      resolved: uniqueFrame,
      hadCollision: targetFrame !== uniqueFrame
    });
    return uniqueFrame;
  }

  // Use centralized function to calculate next available frame (50 frames after highest)
  const calculatedTargetFrame = calculateNextAvailableFrameSync(existingPositions);
  console.log('[AddImagesDebug] ✅ Calculated target frame using centralized function:', {
    maxPosition: existingPositions.length > 0 ? Math.max(...existingPositions) : 'none',
    calculatedTargetFrame,
    existingPositionsCount: existingPositions.length,
    allPositions: existingPositions
  });
  return calculatedTargetFrame;
};

/**
 * Create a map of generation IDs to their timeline positions
 */
export const createPositionMap = (
  generationIds: string[],
  startFrame: number,
  frameSpacing: number
): Map<string, number> => {
  const newPending = new Map<string, number>();
  
  generationIds.forEach((genId, index) => {
    const framePosition = startFrame + (index * frameSpacing);
    newPending.set(genId, framePosition);
    console.log('[AddImagesDebug] 📌 Setting pending position:', {
      generationId: genId.substring(0, 8),
      index,
      framePosition,
      calculation: `${startFrame} + (${index} * ${frameSpacing})`
    });
  });

  return newPending;
};

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Query shot_generation records for the given generation IDs
 * Includes retry logic with 500ms delay
 */
export const queryShotGenerationRecords = async (
  shotId: string,
  generationIds: string[]
): Promise<ShotGenerationRecord[]> => {
  console.log('[AddImagesDebug] 🔍 Querying for shot_generation records...');
  
  const { data: shotGenRecords, error: queryError } = await supabase
    .from('shot_generations')
    .select('id, generation_id, timeline_frame')
    .eq('shot_id', shotId)
    .in('generation_id', generationIds);
  
  if (queryError) {
    console.error('[AddImagesDebug] ❌ Error querying shot_generation records:', queryError);
    throw queryError;
  }
  
  console.log('[AddImagesDebug] 📋 Found shot_generation records:', {
    requested: generationIds.length,
    found: shotGenRecords?.length,
    records: shotGenRecords?.map(r => ({
      shotGenId: r.id.substring(0, 8),
      genId: r.generation_id.substring(0, 8),
      currentTimelineFrame: r.timeline_frame
    }))
  });
  
  // Check if records already have positions (they shouldn't with skipAutoPosition: true)
  const recordsWithPositions = shotGenRecords?.filter(
    r => r.timeline_frame !== null && r.timeline_frame !== undefined
  );
  
  if (recordsWithPositions && recordsWithPositions.length > 0) {
    console.warn('[AddImagesDebug] ⚠️ UNEXPECTED: Records have timeline_frame values despite skipAutoPosition!', {
      count: recordsWithPositions.length,
      unexpectedPositions: recordsWithPositions.map(r => r.timeline_frame)
    });
  } else if (shotGenRecords && shotGenRecords.length > 0) {
    console.log('[AddImagesDebug] ✅ Records have NULL timeline_frame as expected (skipAutoPosition worked!)');
  }
  
  // If no records found, retry once after 500ms
  if (!shotGenRecords || shotGenRecords.length === 0) {
    console.warn('[AddImagesDebug] ⚠️ No shot_generation records found yet, retrying...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const { data: retryRecords, error: retryQueryError } = await supabase
      .from('shot_generations')
      .select('id, generation_id, timeline_frame')
      .eq('shot_id', shotId)
      .in('generation_id', generationIds);
    
    if (retryQueryError) {
      console.error('[AddImagesDebug] ❌ Retry query error:', retryQueryError);
      throw retryQueryError;
    }
    
    if (!retryRecords || retryRecords.length === 0) {
      console.error('[AddImagesDebug] ❌ Still no records found after retry');
      throw new Error('Shot generation records not found after retry');
    }
    
    console.log('[AddImagesDebug] ✅ Retry found records:', {
      count: retryRecords.length,
      records: retryRecords.map(r => ({
        shotGenId: r.id.substring(0, 8),
        genId: r.generation_id.substring(0, 8),
        currentTimelineFrame: r.timeline_frame
      }))
    });
    
    // Check retry records for unexpected positions
    const retryRecordsWithPositions = retryRecords.filter(
      r => r.timeline_frame !== null && r.timeline_frame !== undefined
    );
    
    if (retryRecordsWithPositions.length > 0) {
      console.warn('[AddImagesDebug] ⚠️ Retry: Records already have AUTO-ASSIGNED timeline_frame values!', {
        count: retryRecordsWithPositions.length,
        autoAssignedPositions: retryRecordsWithPositions.map(r => r.timeline_frame)
      });
    }
    
    return retryRecords;
  }
  
  return shotGenRecords;
};

/**
 * Batch update timeline_frame values for shot_generation records
 */
export const batchUpdateTimelineFrames = async (
  shotGenRecords: ShotGenerationRecord[],
  generationIds: string[],
  calculatedTargetFrame: number,
  batchVideoFrames: number
): Promise<PositionUpdateResult[]> => {
  console.log('[AddImagesDebug] 🔄 Starting batch update of timeline_frame values...');
  
  const updatePromises = generationIds.map(async (genId, index) => {
    const shotGenRecord = shotGenRecords.find(r => r.generation_id === genId);
    
    if (!shotGenRecord) {
      console.warn('[AddImagesDebug] ⚠️ No shot_generation found for generation:', genId.substring(0, 8));
      return { 
        success: false, 
        genId, 
        error: 'Record not found' 
      };
    }
    
    const framePosition = calculatedTargetFrame + (index * batchVideoFrames);
    console.log('[AddImagesDebug] 💾 Updating shot_generation:', {
      shotGenId: shotGenRecord.id.substring(0, 8),
      genId: genId.substring(0, 8),
      framePosition,
      index
    });
    
    const updateResult = await supabase
      .from('shot_generations')
      .update({ timeline_frame: framePosition })
      .eq('id', shotGenRecord.id);
    
    console.log('[AddImagesDebug] 📤 Update result for', genId.substring(0, 8), ':', {
      hasError: !!updateResult.error,
      error: updateResult.error,
      status: updateResult.status,
      statusText: updateResult.statusText
    });
    
    return { 
      success: !updateResult.error, 
      genId, 
      shotGenId: shotGenRecord.id,
      framePosition,
      error: updateResult.error 
    };
  });
  
  console.log('[AddImagesDebug] ⏳ Awaiting all updates...');
  const results = await Promise.all(updatePromises);
  
  console.log('[AddImagesDebug] 📊 Batch update results summary:', {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results.map(r => ({
      genId: r.genId.substring(0, 8),
      shotGenId: r.shotGenId?.substring(0, 8),
      framePosition: r.framePosition,
      success: r.success,
      error: typeof r.error === 'object' && r.error && 'message' in r.error 
        ? r.error.message 
        : r.error
    }))
  });
  
  return results;
};

/**
 * Verify that timeline positions were correctly written to database
 */
export const verifyPositionUpdates = async (
  shotId: string,
  generationIds: string[]
): Promise<void> => {
  console.log('[AddImagesDebug] 🔍 Verifying updates by querying records back...');
  
  const { data: verifyData, error: verifyError } = await supabase
    .from('shot_generations')
    .select('id, generation_id, timeline_frame')
    .eq('shot_id', shotId)
    .in('generation_id', generationIds);
  
  console.log('[AddImagesDebug] ✔️ Verification query result:', {
    hasError: !!verifyError,
    error: verifyError,
    recordsFound: verifyData?.length,
    records: verifyData?.map(r => ({
      shotGenId: r.id.substring(0, 8),
      genId: r.generation_id.substring(0, 8),
      timeline_frame: r.timeline_frame
    }))
  });
};

/**
 * Persist timeline positions to database
 * This is the main orchestrator for database operations
 */
export const persistTimelinePositions = async (
  shotId: string,
  generationIds: string[],
  calculatedTargetFrame: number,
  batchVideoFrames: number
): Promise<void> => {
  console.log('[AddImagesDebug] 💿 Overwriting auto-assigned positions immediately...');
  
  try {
    // 1. Query shot_generation records (with retry)
    const shotGenRecords = await queryShotGenerationRecords(shotId, generationIds);
    
    // 2. Batch update timeline_frame values
    const results = await batchUpdateTimelineFrames(
      shotGenRecords,
      generationIds,
      calculatedTargetFrame,
      batchVideoFrames
    );
    
    // 3. Check for errors
    const errors = results.filter(r => !r.success);
    
    if (errors.length > 0) {
      console.error('[AddImagesDebug] ❌ Errors updating positions:', errors);
      toast.error(`Failed to set ${errors.length} timeline position(s)`);
      throw new Error(`Failed to update ${errors.length} position(s)`);
    }
    
    console.log('[AddImagesDebug] ✅ Successfully updated all positions!');
    
    // 4. Verify updates
    await verifyPositionUpdates(shotId, generationIds);
    
  } catch (dbError) {
    console.error('[AddImagesDebug] ❌ Exception writing positions to database:', dbError);
    throw dbError;
  }
};

