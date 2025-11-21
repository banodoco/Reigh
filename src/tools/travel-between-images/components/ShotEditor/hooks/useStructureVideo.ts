import { useState, useEffect, useCallback } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

export interface UseStructureVideoParams {
  projectId: string;
  shotId: string | undefined;
}

export interface UseStructureVideoReturn {
  structureVideoPath: string | null;
  structureVideoMetadata: VideoMetadata | null;
  structureVideoTreatment: 'adjust' | 'clip';
  structureVideoMotionStrength: number;
  structureVideoType: 'flow' | 'canny' | 'depth';
  handleStructureVideoChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => void;
  isLoading: boolean;
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
  const { 
    settings: structureVideoSettings, 
    update: updateStructureVideoSettings,
    isLoading: isStructureVideoSettingsLoading 
  } = useToolSettings<{
    path?: string;
    metadata?: VideoMetadata;
    treatment?: 'adjust' | 'clip';
    motionStrength?: number;
    structureType?: 'flow' | 'canny' | 'depth';
  }>('travel-structure-video', { 
    projectId, 
    shotId: shotId,
    enabled: !!shotId 
  });

  // Structure video state
  const [structureVideoPath, setStructureVideoPath] = useState<string | null>(null);
  const [structureVideoMetadata, setStructureVideoMetadata] = useState<VideoMetadata | null>(null);
  const [structureVideoTreatment, setStructureVideoTreatment] = useState<'adjust' | 'clip'>('adjust');
  const [structureVideoMotionStrength, setStructureVideoMotionStrength] = useState<number>(1.0);
  const [structureVideoType, setStructureVideoType] = useState<'flow' | 'canny' | 'depth'>('flow');
  const [hasInitializedStructureVideo, setHasInitializedStructureVideo] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (shotId !== hasInitializedStructureVideo) {
      setHasInitializedStructureVideo(null);
    }
  }, [shotId, hasInitializedStructureVideo]);

  // Load structure video from settings when shot loads
  useEffect(() => {
    if (!hasInitializedStructureVideo && !isStructureVideoSettingsLoading && shotId) {
      // Only check for path - metadata is optional and can be null
      if (structureVideoSettings?.path) {
        setStructureVideoPath(structureVideoSettings.path);
        setStructureVideoMetadata(structureVideoSettings.metadata || null);
        setStructureVideoTreatment(structureVideoSettings.treatment || 'adjust');
        setStructureVideoMotionStrength(structureVideoSettings.motionStrength ?? 1.0);
        setStructureVideoType(structureVideoSettings.structureType || 'flow');
      } else {
        // No saved structure video - initialize with defaults
        setStructureVideoPath(null);
        setStructureVideoMetadata(null);
        setStructureVideoTreatment('adjust');
        setStructureVideoMotionStrength(1.0);
        setStructureVideoType('flow');
      }
      setHasInitializedStructureVideo(shotId);
    }
  }, [structureVideoSettings, isStructureVideoSettingsLoading, shotId, hasInitializedStructureVideo]);

  // Handler for structure video changes with auto-save
  const handleStructureVideoChange = useCallback((
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => {
    console.log('[useStructureVideo] [DEBUG] handleStructureVideoChange called:', {
      videoPath: videoPath ? videoPath.substring(0, 50) + '...' : null,
      hasMetadata: !!metadata,
      metadataDetails: metadata ? { totalFrames: metadata.total_frames, frameRate: metadata.frame_rate } : null,
      treatment,
      motionStrength,
      structureType,
      previousStructureType: structureVideoType // Show what it was before
    });
    
    console.error('[StructureVideoDebug] 🔄 Setting state values:', {
      videoPath: videoPath ? videoPath.substring(0, 60) + '...' : null,
      hasMetadata: !!metadata,
      treatment,
      motionStrength,
      structureType
    });
    
    setStructureVideoPath(videoPath);
    setStructureVideoMetadata(metadata); // Always update, even if null (important for clearing old metadata)
    setStructureVideoTreatment(treatment);
    setStructureVideoMotionStrength(motionStrength);
    setStructureVideoType(structureType);
    
    console.error('[StructureVideoDebug] ✅ State setters called successfully');

    // Save to database
    if (videoPath) {
      // Save structure video (metadata is optional - can be fetched later from path)
      console.error('[useStructureVideo] 💾 SAVING structure video to database:', { 
        path: videoPath,
        pathPreview: videoPath.substring(0, 80) + '...',
        hasMetadata: !!metadata,
        treatment,
        motionStrength,
        structureType,
        toolId: 'travel-structure-video',
        scope: 'shot',
        shotId: shotId?.substring(0, 8)
      });
      updateStructureVideoSettings('shot', {
        path: videoPath,
        metadata: metadata || null,
        treatment,
        motionStrength,
        structureType
      });
      console.error('[useStructureVideo] ✅ Structure video save requested');
    } else {
      // Clear structure video - explicitly set fields to null to ensure deletion
      console.error('[useStructureVideo] 🗑️  CLEARING structure video from database');
      updateStructureVideoSettings('shot', {
        path: null,
        metadata: null,
        treatment: null,
        motionStrength: null,
        structureType: null
      });
      console.error('[useStructureVideo] ✅ Structure video clear requested');
    }
  }, [updateStructureVideoSettings, structureVideoType, shotId]);

  return {
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    handleStructureVideoChange,
    isLoading: isStructureVideoSettingsLoading,
  };
}


