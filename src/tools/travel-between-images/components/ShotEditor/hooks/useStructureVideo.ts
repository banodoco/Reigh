import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import {
  VideoStructureApiParams,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
  StructureVideoConfig,
  StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';

export interface UseStructureVideoParams {
  projectId: string;
  shotId: string | undefined;
  /** Timeline frame range for auto-calculating default video ranges */
  timelineStartFrame?: number;
  timelineEndFrame?: number;
}

// Re-export types from the shared lib for convenience
export type { StructureVideoConfig, StructureVideoConfigWithMetadata };

/**
 * Legacy structure video configuration with snake_case fields matching API params.
 * @deprecated Use StructureVideoConfigWithMetadata[] array instead
 */
export interface LegacyStructureVideoConfig extends VideoStructureApiParams {
  /** Video metadata (frame count, duration, etc.) - UI only */
  metadata?: VideoMetadata | null;
  /** Resource ID for tracking which resource this video came from - UI only */
  resource_id?: string | null;
}

/** Default structure video config (legacy single-video format) */
export const DEFAULT_STRUCTURE_VIDEO_CONFIG: LegacyStructureVideoConfig = {
  structure_video_path: null,
  structure_video_treatment: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
  structure_video_motion_strength: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
  structure_video_type: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_type,
  uni3c_end_percent: 0.1, // Default 10%
  metadata: null,
  resource_id: null,
};

export interface UseStructureVideoReturn {
  // ============ NEW: Multi-video array interface ============
  /** Array of structure video configurations */
  structureVideos: StructureVideoConfigWithMetadata[];
  /** Add a new structure video to the array */
  addStructureVideo: (video: StructureVideoConfigWithMetadata) => void;
  /** Update a structure video at a specific index */
  updateStructureVideo: (index: number, video: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Remove a structure video at a specific index */
  removeStructureVideo: (index: number) => void;
  /** Clear all structure videos */
  clearAllStructureVideos: () => void;
  /** Set the entire array of structure videos */
  setStructureVideos: (videos: StructureVideoConfigWithMetadata[]) => void;
  
  // ============ Legacy single-video interface (backwards compatible) ============
  /** @deprecated Use structureVideos[0] instead */
  structureVideoConfig: LegacyStructureVideoConfig;
  /** @deprecated Use setStructureVideos instead */
  setStructureVideoConfig: (config: LegacyStructureVideoConfig) => void;
  /** Loading state */
  isLoading: boolean;

  // Legacy individual accessors (deprecated - use structureVideos instead)
  /** @deprecated Use structureVideos[0]?.path */
  structureVideoPath: string | null;
  /** @deprecated Use structureVideos[0]?.metadata */
  structureVideoMetadata: VideoMetadata | null;
  /** @deprecated Use structureVideos[0]?.treatment */
  structureVideoTreatment: 'adjust' | 'clip';
  /** @deprecated Use structureVideos[0]?.motion_strength */
  structureVideoMotionStrength: number;
  /** @deprecated Use structureVideos[0]?.structure_type */
  structureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** @deprecated Use structureVideos[0]?.resource_id */
  structureVideoResourceId: string | null;
  /** @deprecated Use addStructureVideo or updateStructureVideo */
  handleStructureVideoChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
}

/**
 * Settings storage schema - supports both legacy single-video and new array format
 */
interface StructureVideoSettings {
  // NEW: Array format (preferred)
  structure_videos?: StructureVideoConfigWithMetadata[];
  
  // Legacy single-video format (for migration)
  structure_video_path?: string | null;
  structure_video_treatment?: 'adjust' | 'clip';
  structure_video_motion_strength?: number;
  structure_video_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  uni3c_end_percent?: number;
  resource_id?: string | null;
  metadata?: VideoMetadata | null;
  // Even older legacy camelCase format
  path?: string;
  treatment?: 'adjust' | 'clip';
  motionStrength?: number;
  structureType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  resourceId?: string;
}

/**
 * Migrate legacy single-video settings to array format
 */
function migrateToArrayFormat(
  settings: StructureVideoSettings | null,
  defaultEndFrame: number
): StructureVideoConfigWithMetadata[] {
  if (!settings) return [];
  
  // Already in array format - but still migrate structure_type to 'uni3c'
  if (settings.structure_videos && settings.structure_videos.length > 0) {
    return settings.structure_videos.map(video => ({
      ...video,
      structure_type: 'uni3c',  // Always uni3c - migrate old flow/canny/depth settings
    }));
  }
  
  // Check for legacy single-video format (snake_case or camelCase)
  const videoPath = settings.structure_video_path ?? settings.path;
  if (!videoPath) return [];
  
  // Convert single video to array with one entry
  // NOTE: structure_type is hardcoded to 'uni3c' - it's the only supported option now
  // Old shots with 'flow'/'canny'/'depth' are migrated to 'uni3c'
  const singleVideo: StructureVideoConfigWithMetadata = {
    path: videoPath,
    start_frame: 0,
    end_frame: defaultEndFrame,
    treatment: settings.structure_video_treatment
      ?? settings.treatment
      ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    motion_strength: settings.structure_video_motion_strength
      ?? settings.motionStrength
      ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
    structure_type: 'uni3c',  // Always uni3c - migrate old flow/canny/depth settings
    uni3c_end_percent: settings.uni3c_end_percent ?? 0.1,
    metadata: settings.metadata ?? null,
    resource_id: settings.resource_id ?? settings.resourceId ?? null,
  };
  
  console.log('[useStructureVideo] 🔄 Migrated legacy single-video to array format:', {
    path: singleVideo.path.substring(0, 50) + '...',
    start_frame: singleVideo.start_frame,
    end_frame: singleVideo.end_frame,
  });
  
  return [singleVideo];
}

/**
 * Convert array format back to legacy single-video format (for backwards compat)
 */
function arrayToLegacyConfig(videos: StructureVideoConfigWithMetadata[]): LegacyStructureVideoConfig {
  if (videos.length === 0) {
    return DEFAULT_STRUCTURE_VIDEO_CONFIG;
  }
  
  const first = videos[0];
  return {
    structure_video_path: first.path,
    structure_video_treatment: first.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    structure_video_motion_strength: first.motion_strength ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
    structure_video_type: 'uni3c',  // Always uni3c - only supported option now
    uni3c_end_percent: first.uni3c_end_percent ?? 0.1,
    metadata: first.metadata ?? null,
    resource_id: first.resource_id ?? null,
  };
}

/**
 * Hook to manage structure video state with database persistence.
 * Supports both legacy single-video format and new multi-video array format.
 * Handles loading from settings, auto-save on changes, and shot-switching.
 */
export function useStructureVideo({
  projectId,
  shotId,
  timelineStartFrame = 0,
  timelineEndFrame = 81,
}: UseStructureVideoParams): UseStructureVideoReturn {
  // Structure video persistence using tool settings (per-shot basis)
  // NOTE: Uses 'travel-structure-video' key - MediaLightbox and useSegmentSettings must read from this same key
  const {
    settings: structureVideoSettings,
    update: updateStructureVideoSettings,
    isLoading: isStructureVideoSettingsLoading
  } = useToolSettings<StructureVideoSettings>('travel-structure-video', {
    projectId,
    shotId: shotId,
    enabled: !!shotId
  });

  // Main state: array of structure videos
  const [structureVideos, setStructureVideosState] = useState<StructureVideoConfigWithMetadata[]>([]);
  const [hasInitialized, setHasInitialized] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (shotId !== hasInitialized) {
      setHasInitialized(null);
    }
  }, [shotId, hasInitialized]);

  // Load structure videos from settings when shot loads (with migration)
  useEffect(() => {
    if (!hasInitialized && !isStructureVideoSettingsLoading && shotId) {
      const migratedVideos = migrateToArrayFormat(
        structureVideoSettings ?? null,
        timelineEndFrame
      );

      setStructureVideosState(migratedVideos);
      setHasInitialized(shotId);

      console.log('[useStructureVideo] ✅ Loaded structure videos:', {
        shotId: shotId.substring(0, 8),
        count: migratedVideos.length,
        videos: migratedVideos.map(v => ({
          path: v.path.substring(0, 30) + '...',
          start_frame: v.start_frame,
          end_frame: v.end_frame,
        }))
      });
    }
  }, [structureVideoSettings, isStructureVideoSettingsLoading, shotId, hasInitialized, timelineEndFrame]);

  // Sync local state when settings change externally (e.g., from "Set as Shot Defaults" in lightbox)
  // This runs AFTER initialization, when the underlying query data changes
  const prevSettingsRef = useRef<StructureVideoSettings | null>(null);
  useEffect(() => {
    // Only sync after initial load, when settings actually change
    if (!hasInitialized || isStructureVideoSettingsLoading) return;

    // Compare with previous settings to detect external changes
    const prevSettings = prevSettingsRef.current;
    const currentSettings = structureVideoSettings ?? null;

    // Skip if settings haven't changed (same reference or both null)
    if (prevSettings === currentSettings) return;

    // Check if structure_videos array content changed
    const prevVideos = prevSettings?.structure_videos;
    const currentVideos = currentSettings?.structure_videos;

    // Only sync if the actual video data changed (not just a re-render)
    const videosChanged = JSON.stringify(prevVideos) !== JSON.stringify(currentVideos);

    if (videosChanged && currentVideos !== undefined) {
      console.log('[useStructureVideo] 🔄 External settings change detected, syncing:', {
        shotId: shotId?.substring(0, 8),
        prevCount: prevVideos?.length ?? 0,
        newCount: currentVideos?.length ?? 0,
      });

      const migratedVideos = migrateToArrayFormat(currentSettings, timelineEndFrame);
      setStructureVideosState(migratedVideos);
    }

    prevSettingsRef.current = currentSettings;
  }, [structureVideoSettings, isStructureVideoSettingsLoading, hasInitialized, shotId, timelineEndFrame]);

  // Refs for stable callbacks
  const updateSettingsRef = useRef(updateStructureVideoSettings);
  updateSettingsRef.current = updateStructureVideoSettings;

  // Save structure videos to database
  const saveToDatabase = useCallback((videos: StructureVideoConfigWithMetadata[]) => {
    console.log('[useStructureVideo] 💾 Saving structure videos to database:', {
      count: videos.length,
    });
    
    if (videos.length > 0) {
      // Save in new array format (also save legacy format for backwards compat)
      const first = videos[0];
      updateSettingsRef.current('shot', {
        // New array format
        structure_videos: videos,
        // Legacy single-video format (for consumers that don't support array yet)
        structure_video_path: first.path,
        structure_video_treatment: first.treatment,
        structure_video_motion_strength: first.motion_strength,
        structure_video_type: first.structure_type,
        uni3c_end_percent: first.uni3c_end_percent,
        metadata: first.metadata,
        resource_id: first.resource_id,
      });
    } else {
      // Clear all
      updateSettingsRef.current('shot', {
        structure_videos: [],
        structure_video_path: null,
        structure_video_treatment: null,
        structure_video_motion_strength: null,
        structure_video_type: null,
        uni3c_end_percent: null,
        metadata: null,
        resource_id: null,
        // Also clear legacy fields
        path: null,
        treatment: null,
        motionStrength: null,
        structureType: null,
        resourceId: null,
      });
    }
  }, []);

  // ============ NEW: Array manipulation methods ============
  
  const setStructureVideos = useCallback((videos: StructureVideoConfigWithMetadata[]) => {
    console.log('[useStructureVideo] setStructureVideos:', { count: videos.length });
    setStructureVideosState(videos);
    saveToDatabase(videos);
  }, [saveToDatabase]);

  const addStructureVideo = useCallback((video: StructureVideoConfigWithMetadata) => {
    console.log('[useStructureVideo] addStructureVideo:', {
      path: video.path.substring(0, 50) + '...',
      start_frame: video.start_frame,
      end_frame: video.end_frame,
    });
    
    setStructureVideosState(prev => {
      const newVideos = [...prev, video];
      saveToDatabase(newVideos);
      return newVideos;
    });
  }, [saveToDatabase]);

  const updateStructureVideo = useCallback((index: number, updates: Partial<StructureVideoConfigWithMetadata>) => {
    console.log('[useStructureVideo] updateStructureVideo:', { index, updates });
    
    setStructureVideosState(prev => {
      if (index < 0 || index >= prev.length) {
        console.warn('[useStructureVideo] Invalid index for updateStructureVideo:', index);
        return prev;
      }
      
      const newVideos = [...prev];
      newVideos[index] = { ...newVideos[index], ...updates };
      saveToDatabase(newVideos);
      return newVideos;
    });
  }, [saveToDatabase]);

  const removeStructureVideo = useCallback((index: number) => {
    console.log('[useStructureVideo] removeStructureVideo:', { index });
    
    setStructureVideosState(prev => {
      if (index < 0 || index >= prev.length) {
        console.warn('[useStructureVideo] Invalid index for removeStructureVideo:', index);
        return prev;
      }
      
      const newVideos = prev.filter((_, i) => i !== index);
      saveToDatabase(newVideos);
      return newVideos;
    });
  }, [saveToDatabase]);

  const clearAllStructureVideos = useCallback(() => {
    console.log('[useStructureVideo] clearAllStructureVideos');
    setStructureVideosState([]);
    saveToDatabase([]);
  }, [saveToDatabase]);

  // ============ Legacy interface (backwards compatibility) ============
  
  const legacyConfig = useMemo(() => arrayToLegacyConfig(structureVideos), [structureVideos]);

  const setStructureVideoConfig = useCallback((config: LegacyStructureVideoConfig) => {
    console.log('[useStructureVideo] [LEGACY] setStructureVideoConfig called');
    
    if (config.structure_video_path) {
      // Convert legacy config to array format
      // NOTE: structure_type is hardcoded to 'uni3c' - only supported option now
      const video: StructureVideoConfigWithMetadata = {
        path: config.structure_video_path,
        start_frame: 0,
        end_frame: timelineEndFrame,
        treatment: config.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
        motion_strength: config.structure_video_motion_strength ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
        structure_type: 'uni3c',  // Always uni3c - migrate old flow/canny/depth settings
        uni3c_end_percent: config.uni3c_end_percent ?? 0.1,
        metadata: config.metadata ?? null,
        resource_id: config.resource_id ?? null,
      };
      setStructureVideos([video]);
    } else {
      clearAllStructureVideos();
    }
  }, [timelineEndFrame, setStructureVideos, clearAllStructureVideos]);

  const handleStructureVideoChange = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    _structureType: 'uni3c' | 'flow' | 'canny' | 'depth',  // Ignored - always uni3c now
    resourceId?: string
  ) => {
    console.log('[useStructureVideo] [LEGACY] handleStructureVideoChange called');
    setStructureVideoConfig({
      structure_video_path: videoPath,
      structure_video_treatment: treatment,
      structure_video_motion_strength: motionStrength,
      structure_video_type: 'uni3c',  // Always uni3c - only supported option now
      metadata: metadata,
      resource_id: resourceId ?? null,
      // Preserve existing uni3c_end_percent from current config to avoid resetting to default
      uni3c_end_percent: legacyConfig.uni3c_end_percent,
    });
  }, [setStructureVideoConfig, legacyConfig.uni3c_end_percent]);

  return {
    // NEW: Multi-video array interface
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
    
    // Legacy interface
    structureVideoConfig: legacyConfig,
    setStructureVideoConfig,
    isLoading: isStructureVideoSettingsLoading,

    // Legacy individual accessors
    structureVideoPath: legacyConfig.structure_video_path ?? null,
    structureVideoMetadata: legacyConfig.metadata ?? null,
    structureVideoTreatment: legacyConfig.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    structureVideoMotionStrength: legacyConfig.structure_video_motion_strength ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
    structureVideoType: 'uni3c' as const,  // Always uni3c - only supported option now
    structureVideoResourceId: legacyConfig.resource_id ?? null,
    handleStructureVideoChange,
  };
}
