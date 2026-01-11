import { useState, useEffect, useCallback, useRef } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import {
  VideoStructureApiParams,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
} from '@/shared/lib/tasks/travelBetweenImages';

export interface UseStructureVideoParams {
  projectId: string;
  shotId: string | undefined;
}

/**
 * Structure video configuration with snake_case fields matching API params.
 * Extends VideoStructureApiParams with UI-only fields (metadata, resource_id).
 */
export interface StructureVideoConfig extends VideoStructureApiParams {
  /** Video metadata (frame count, duration, etc.) - UI only */
  metadata?: VideoMetadata | null;
  /** Resource ID for tracking which resource this video came from - UI only */
  resource_id?: string | null;
}

/** Default structure video config */
export const DEFAULT_STRUCTURE_VIDEO_CONFIG: StructureVideoConfig = {
  structure_video_path: null,
  structure_video_treatment: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
  structure_video_motion_strength: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
  structure_video_type: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_type,
  uni3c_end_percent: 0.1, // Default 10%
  metadata: null,
  resource_id: null,
};

export interface UseStructureVideoReturn {
  /** Grouped structure video config with snake_case API params */
  structureVideoConfig: StructureVideoConfig;
  /** Update the entire structure video config */
  setStructureVideoConfig: (config: StructureVideoConfig) => void;
  /** Loading state */
  isLoading: boolean;

  // Legacy individual accessors (deprecated - use structureVideoConfig instead)
  /** @deprecated Use structureVideoConfig.structure_video_path */
  structureVideoPath: string | null;
  /** @deprecated Use structureVideoConfig.metadata */
  structureVideoMetadata: VideoMetadata | null;
  /** @deprecated Use structureVideoConfig.structure_video_treatment */
  structureVideoTreatment: 'adjust' | 'clip';
  /** @deprecated Use structureVideoConfig.structure_video_motion_strength */
  structureVideoMotionStrength: number;
  /** @deprecated Use structureVideoConfig.structure_video_type */
  structureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** @deprecated Use structureVideoConfig.resource_id */
  structureVideoResourceId: string | null;
  /** @deprecated Use setStructureVideoConfig */
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
 * Hook to manage structure video state with database persistence
 * Handles loading from settings, auto-save on changes, and shot-switching
 */
export function useStructureVideo({
  projectId,
  shotId,
}: UseStructureVideoParams): UseStructureVideoReturn {
  // Structure video persistence using separate tool settings (per-shot basis)
  // Supports both new snake_case format and legacy camelCase for migration
  const {
    settings: structureVideoSettings,
    update: updateStructureVideoSettings,
    isLoading: isStructureVideoSettingsLoading
  } = useToolSettings<{
    // New snake_case format (preferred)
    structure_video_path?: string | null;
    structure_video_treatment?: 'adjust' | 'clip';
    structure_video_motion_strength?: number;
    structure_video_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
    uni3c_end_percent?: number; // Only used when structure_video_type is 'uni3c'
    resource_id?: string | null;
    metadata?: VideoMetadata | null;
    // Legacy camelCase format (for migration)
    path?: string;
    treatment?: 'adjust' | 'clip';
    motionStrength?: number;
    structureType?: 'uni3c' | 'flow' | 'canny' | 'depth';
    resourceId?: string;
  }>('travel-structure-video', {
    projectId,
    shotId: shotId,
    enabled: !!shotId
  });

  // Single state object for structure video config (snake_case)
  const [config, setConfig] = useState<StructureVideoConfig>(DEFAULT_STRUCTURE_VIDEO_CONFIG);
  const [hasInitializedStructureVideo, setHasInitializedStructureVideo] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (shotId !== hasInitializedStructureVideo) {
      setHasInitializedStructureVideo(null);
    }
  }, [shotId, hasInitializedStructureVideo]);

  // Load structure video from settings when shot loads (with legacy migration)
  useEffect(() => {
    if (!hasInitializedStructureVideo && !isStructureVideoSettingsLoading && shotId) {
      // Check for path in either new or legacy format
      const videoPath = structureVideoSettings?.structure_video_path ?? structureVideoSettings?.path;

      if (videoPath) {
        // Migrate from legacy camelCase to snake_case
        setConfig({
          structure_video_path: videoPath,
          structure_video_treatment: structureVideoSettings?.structure_video_treatment
            ?? structureVideoSettings?.treatment
            ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
          structure_video_motion_strength: structureVideoSettings?.structure_video_motion_strength
            ?? structureVideoSettings?.motionStrength
            ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
          structure_video_type: structureVideoSettings?.structure_video_type
            ?? structureVideoSettings?.structureType
            ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_type,
          uni3c_end_percent: structureVideoSettings?.uni3c_end_percent ?? 0.1, // Default 10%
          metadata: structureVideoSettings?.metadata ?? null,
          resource_id: structureVideoSettings?.resource_id ?? structureVideoSettings?.resourceId ?? null,
        });
      } else {
        // No saved structure video - initialize with defaults
        setConfig(DEFAULT_STRUCTURE_VIDEO_CONFIG);
      }
      setHasInitializedStructureVideo(shotId);
    }
  }, [structureVideoSettings, isStructureVideoSettingsLoading, shotId, hasInitializedStructureVideo]);

  // 🎯 PERF FIX: Use refs to avoid callback instability
  const configRef = useRef(config);
  configRef.current = config;
  const updateStructureVideoSettingsRef = useRef(updateStructureVideoSettings);
  updateStructureVideoSettingsRef.current = updateStructureVideoSettings;
  const shotIdRef = useRef(shotId);
  shotIdRef.current = shotId;

  // New unified setter for structure video config
  const setStructureVideoConfig = useCallback((newConfig: StructureVideoConfig) => {
    console.log('[useStructureVideo] setStructureVideoConfig called:', {
      path: newConfig.structure_video_path ? newConfig.structure_video_path.substring(0, 50) + '...' : null,
      hasMetadata: !!newConfig.metadata,
      treatment: newConfig.structure_video_treatment,
      motionStrength: newConfig.structure_video_motion_strength,
      structureType: newConfig.structure_video_type,
      uni3cEndPercent: newConfig.uni3c_end_percent,
      resourceId: newConfig.resource_id?.substring(0, 8),
    });

    setConfig(newConfig);

    // Save to database using new snake_case format
    if (newConfig.structure_video_path) {
      console.log('[useStructureVideo] 💾 SAVING structure video to database (snake_case format)');
      updateStructureVideoSettingsRef.current('shot', {
        structure_video_path: newConfig.structure_video_path,
        structure_video_treatment: newConfig.structure_video_treatment,
        structure_video_motion_strength: newConfig.structure_video_motion_strength,
        structure_video_type: newConfig.structure_video_type,
        uni3c_end_percent: newConfig.uni3c_end_percent ?? 0.1,
        metadata: newConfig.metadata ?? null,
        resource_id: newConfig.resource_id ?? null,
      });
    } else {
      // Clear structure video
      console.log('[useStructureVideo] 🗑️  CLEARING structure video from database');
      updateStructureVideoSettingsRef.current('shot', {
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

  // Legacy handler for backwards compatibility (wraps setStructureVideoConfig)
  const handleStructureVideoChange = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => {
    console.log('[useStructureVideo] [LEGACY] handleStructureVideoChange called - converting to snake_case');
    setStructureVideoConfig({
      structure_video_path: videoPath,
      structure_video_treatment: treatment,
      structure_video_motion_strength: motionStrength,
      structure_video_type: structureType,
      metadata: metadata,
      resource_id: resourceId ?? null,
    });
  }, [setStructureVideoConfig]);

  return {
    // New grouped interface (preferred)
    structureVideoConfig: config,
    setStructureVideoConfig,
    isLoading: isStructureVideoSettingsLoading,

    // Legacy individual accessors for backwards compatibility (use constants for defaults)
    structureVideoPath: config.structure_video_path ?? null,
    structureVideoMetadata: config.metadata ?? null,
    structureVideoTreatment: config.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    structureVideoMotionStrength: config.structure_video_motion_strength ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
    structureVideoType: config.structure_video_type ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_type,
    structureVideoResourceId: config.resource_id ?? null,
    handleStructureVideoChange,
  };
}



