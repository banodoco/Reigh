/**
 * useVideoRegenerateMode - Manages video segment regeneration
 *
 * Handles:
 * - Fetching shot data (aspect ratio, structure videos)
 * - Computing effective resolution for regeneration
 * - Determining if regeneration is available
 * - Extracting segment images
 * - Building structure guidance from shot settings
 * - Computing all props for SegmentRegenerateForm
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { extractSegmentImages } from '@/tools/travel-between-images/components/VideoGallery/utils/gallery-utils';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import type { SegmentRegenerateFormProps } from '../components/SegmentRegenerateForm';
import type { SegmentSlotModeData } from '../types';

export interface CurrentSegmentImages {
  startUrl?: string;
  endUrl?: string;
  startGenerationId?: string;
  endGenerationId?: string;
  startShotGenerationId?: string;
  activeChildGenerationId?: string;
}

export interface TaskDetailsData {
  task?: {
    id: string;
    params: Record<string, unknown>;
  };
  inputImages?: string[];
}

export interface UseVideoRegenerateModeProps {
  isVideo: boolean;
  media: {
    id: string;
    metadata?: Record<string, unknown>;
    params?: Record<string, unknown>;
    parent_generation_id?: string;
  };
  shotId: string | undefined;
  selectedProjectId: string | undefined;
  actualGenerationId: string;
  adjustedTaskDetailsData: TaskDetailsData | undefined;
  primaryVariant: {
    id: string;
    params?: Record<string, unknown>;
  } | null;
  currentSegmentImages?: CurrentSegmentImages;
  segmentSlotMode?: SegmentSlotModeData | null;
  // For loading variant settings
  variantParamsToLoad: Record<string, unknown> | null;
  setVariantParamsToLoad: (params: Record<string, unknown> | null) => void;
  // For frame count updates
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  currentFrameCount?: number;
}

export interface UseVideoRegenerateModeReturn {
  /** Whether regeneration is available for this video */
  canRegenerate: boolean;
  /** Props to pass to SegmentRegenerateForm (null if can't regenerate) */
  regenerateFormProps: SegmentRegenerateFormProps | null;
  /** Whether shot data is still loading */
  isLoadingShotData: boolean;
}

export function useVideoRegenerateMode({
  isVideo,
  media,
  shotId,
  selectedProjectId,
  actualGenerationId,
  adjustedTaskDetailsData,
  primaryVariant,
  currentSegmentImages,
  segmentSlotMode,
  variantParamsToLoad,
  setVariantParamsToLoad,
  onSegmentFrameCountChange,
  currentFrameCount,
}: UseVideoRegenerateModeProps): UseVideoRegenerateModeReturn {
  const queryClient = useQueryClient();

  // Fetch shot's aspect ratio AND structure videos for regeneration
  const { data: shotDataForRegen, isLoading: isLoadingShotData } = useQuery({
    queryKey: ['shot-regen-data', shotId],
    queryFn: async () => {
      if (!shotId) return null;
      console.log('[StructureVideoFix] 🔍 [useVideoRegenerateMode] Fetching shot data for:', shotId?.substring(0, 8));
      const { data, error } = await supabase
        .from('shots')
        .select('aspect_ratio, settings')
        .eq('id', shotId)
        .single();
      if (error) {
        console.warn('[StructureVideoFix] ❌ [useVideoRegenerateMode] Query failed:', error);
        return null;
      }

      const allSettings = data?.settings as Record<string, unknown>;
      // Structure videos are stored under 'travel-structure-video' key
      const structureVideoSettings = (allSettings?.['travel-structure-video'] ?? {}) as Record<string, unknown>;

      return {
        aspect_ratio: data?.aspect_ratio,
        structure_videos: (structureVideoSettings.structure_videos as unknown[]) ?? null,
        structure_guidance: structureVideoSettings.structure_guidance ?? null,
      };
    },
    enabled: !!shotId && isVideo,
    staleTime: 60000,
  });

  // Callback to update structure video defaults when "Set as Shot Defaults" is clicked
  const handleUpdateStructureVideoDefaults = useCallback(async (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }): Promise<void> => {
    if (!shotId) return;

    const shotStructureVideos = shotDataForRegen?.structure_videos as Array<Record<string, unknown>> | null;
    if (!shotStructureVideos || shotStructureVideos.length === 0) {
      console.warn('[useVideoRegenerateMode] No structure videos to update');
      return;
    }

    // Update the first structure video (or all if needed)
    const updatedVideos = shotStructureVideos.map((video, index) => {
      // Only update the first video for now (most common case)
      if (index === 0) {
        return {
          ...video,
          ...(updates.motionStrength !== undefined && { motion_strength: updates.motionStrength }),
          ...(updates.treatment !== undefined && { treatment: updates.treatment }),
          ...(updates.uni3cEndPercent !== undefined && { uni3c_end_percent: updates.uni3cEndPercent }),
        };
      }
      return video;
    });

    console.log('[useVideoRegenerateMode] 🎬 Updating structure video defaults:', {
      shotId: shotId.substring(0, 8),
      updates,
      updatedVideosCount: updatedVideos.length,
    });

    // Update structure video settings and await completion
    await updateToolSettingsSupabase({
      scope: 'shot',
      id: shotId,
      toolId: 'travel-structure-video',
      patch: {
        structure_videos: updatedVideos,
        // Also update legacy single-video fields for backwards compat
        structure_video_motion_strength: updates.motionStrength ?? shotStructureVideos[0]?.motion_strength,
        structure_video_treatment: updates.treatment ?? shotStructureVideos[0]?.treatment,
        uni3c_end_percent: updates.uni3cEndPercent ?? shotStructureVideos[0]?.uni3c_end_percent,
      },
    }, undefined, 'immediate');

    // Refetch to update UI - await so caller knows when complete
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['shot-regen-data', shotId] }),
      queryClient.refetchQueries({ queryKey: ['toolSettings', 'travel-structure-video'] }),
    ]);

    console.log('[useVideoRegenerateMode] ✅ Structure video defaults updated and caches refreshed');
  }, [shotId, shotDataForRegen?.structure_videos, queryClient]);

  // Compute effective resolution for regeneration
  const effectiveRegenerateResolution = useMemo(() => {
    const aspectRatio = typeof shotDataForRegen?.aspect_ratio === 'string'
      ? shotDataForRegen.aspect_ratio
      : undefined;

    if (aspectRatio) {
      const shotResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio];
      if (shotResolution) {
        return shotResolution;
      }
    }
    return undefined;
  }, [shotDataForRegen?.aspect_ratio]);

  // Determine if regenerate mode is available
  const canRegenerate = useMemo(() => {
    if (!isVideo) return false;

    // Root parent videos cannot be regenerated
    const isRootParent = !media.parent_generation_id;
    if (isRootParent) return false;

    // Join-clips outputs cannot be regenerated
    const mediaParams = media.params as Record<string, unknown> | undefined;
    const toolType = (media.metadata as Record<string, unknown>)?.tool_type || mediaParams?.tool_type;
    if (toolType === 'join-clips') return false;

    // Need task params to regenerate
    const taskDataParams = adjustedTaskDetailsData?.task?.params;
    if (!taskDataParams && !mediaParams) return false;

    return true;
  }, [isVideo, media, adjustedTaskDetailsData]);

  // Build regenerate form props
  const regenerateFormProps = useMemo((): SegmentRegenerateFormProps | null => {
    if (!canRegenerate || !isVideo) return null;

    const mediaParams = media.params as Record<string, unknown> | undefined;
    const taskDataParams = adjustedTaskDetailsData?.task?.params;

    // Prefer primary variant's params if it has task data
    const primaryParams = primaryVariant?.params as Record<string, unknown> | undefined;
    const primaryHasTaskData = primaryParams && (
      primaryParams.source_task_id ||
      primaryParams.orchestrator_details ||
      primaryParams.additional_loras
    );

    let taskParams = primaryHasTaskData
      ? primaryParams
      : ((taskDataParams ?? mediaParams) as Record<string, unknown>);

    if (!taskParams) return null;

    // Inject shot's structure videos/guidance
    const shotStructureVideos = shotDataForRegen?.structure_videos as Array<Record<string, unknown>> | null;
    let shotStructureGuidance: Record<string, unknown> | null = null;

    if (shotStructureVideos && shotStructureVideos.length > 0) {
      const firstVideo = shotStructureVideos[0];
      const isUni3cTarget = firstVideo.structure_type === 'uni3c';

      const cleanedVideos = shotStructureVideos.map((v) => ({
        path: v.path,
        start_frame: v.start_frame ?? 0,
        end_frame: v.end_frame ?? null,
        treatment: v.treatment ?? 'adjust',
        ...(v.metadata ? { metadata: v.metadata } : {}),
        ...(v.resource_id ? { resource_id: v.resource_id } : {}),
      }));

      shotStructureGuidance = {
        target: isUni3cTarget ? 'uni3c' : 'vace',
        videos: cleanedVideos,
        strength: (firstVideo.motion_strength as number) ?? 1.0,
      };

      if (isUni3cTarget) {
        shotStructureGuidance.step_window = [
          (firstVideo.uni3c_start_percent as number) ?? 0,
          (firstVideo.uni3c_end_percent as number) ?? 1.0,
        ];
        shotStructureGuidance.frame_policy = 'fit';
        shotStructureGuidance.zero_empty_frames = true;
      } else {
        const preprocessingMap: Record<string, string> = {
          'flow': 'flow',
          'canny': 'canny',
          'depth': 'depth',
          'raw': 'none',
        };
        shotStructureGuidance.preprocessing = preprocessingMap[(firstVideo.structure_type as string) ?? 'flow'] ?? 'flow';
      }

      // Inject structure guidance into params
      const cleanedOrchestratorDetails = { ...((taskParams.orchestrator_details as Record<string, unknown>) || {}) };
      const legacyStructureParams = [
        'structure_type', 'structure_videos', 'structure_video_path', 'structure_video_treatment',
        'structure_video_motion_strength', 'structure_video_type', 'structure_canny_intensity',
        'structure_depth_contrast', 'structure_guidance_video_url', 'structure_guidance_frame_offset',
        'use_uni3c', 'uni3c_guide_video', 'uni3c_strength', 'uni3c_start_percent',
        'uni3c_end_percent', 'uni3c_guidance_frame_offset',
      ];
      for (const param of legacyStructureParams) {
        delete cleanedOrchestratorDetails[param];
      }

      taskParams = {
        ...taskParams,
        structure_guidance: shotStructureGuidance,
        orchestrator_details: {
          ...cleanedOrchestratorDetails,
          structure_guidance: shotStructureGuidance,
        },
      };
    }

    const orchestratorDetails = (taskParams.orchestrator_details || {}) as Record<string, unknown>;

    // Extract segment images
    // CRITICAL: In segment slot mode, ALWAYS use pairData from timeline (fresh data).
    // Task params are stale and may have different images from when the video was generated.
    const segmentIndex = (taskParams.segment_index as number) ?? 0;
    let segmentImageInfo: {
      startUrl?: string;
      endUrl?: string;
      startGenId?: string;
      endGenId?: string;
      hasImages: boolean;
    };

    if (segmentSlotMode?.pairData) {
      // Segment slot mode: Use timeline pairData (source of truth for current pair)
      segmentImageInfo = {
        startUrl: segmentSlotMode.pairData.startImage?.url,
        endUrl: segmentSlotMode.pairData.endImage?.url,
        startGenId: segmentSlotMode.pairData.startImage?.generationId,
        endGenId: segmentSlotMode.pairData.endImage?.generationId,
        hasImages: !!(segmentSlotMode.pairData.startImage?.url || segmentSlotMode.pairData.endImage?.url),
      };
      console.log('[SegmentImageFix] Using pairData from timeline:', {
        pairIndex: segmentSlotMode.pairData.index,
        startUrl: segmentImageInfo.startUrl?.substring(segmentImageInfo.startUrl.lastIndexOf('/') + 1),
        endUrl: segmentImageInfo.endUrl?.substring(segmentImageInfo.endUrl.lastIndexOf('/') + 1),
      });
    } else if (currentSegmentImages && (currentSegmentImages.startUrl || currentSegmentImages.endUrl)) {
      // Non-slot mode with currentSegmentImages prop (fresh timeline data)
      segmentImageInfo = {
        startUrl: currentSegmentImages.startUrl,
        endUrl: currentSegmentImages.endUrl,
        startGenId: currentSegmentImages.startGenerationId,
        endGenId: currentSegmentImages.endGenerationId,
        hasImages: !!(currentSegmentImages.startUrl || currentSegmentImages.endUrl),
      };
    } else {
      // Fallback: Extract from task params (only when not in segment slot mode)
      segmentImageInfo = extractSegmentImages(taskParams, segmentIndex);

      // Last resort: Fall back to inputImages from task details
      if (!segmentImageInfo.hasImages && adjustedTaskDetailsData?.inputImages?.length) {
        const passedImages = adjustedTaskDetailsData.inputImages;
        segmentImageInfo = {
          startUrl: passedImages[0],
          endUrl: passedImages.length > 1 ? passedImages[passedImages.length - 1] : passedImages[0],
          startGenId: undefined,
          endGenId: undefined,
          hasImages: passedImages.length > 0,
        };
      }
    }

    // Extract pair_shot_generation_id
    const orchPairIds = orchestratorDetails.pair_shot_generation_ids as string[] | undefined;
    const pairShotGenerationId = [
      segmentSlotMode?.pairData?.startImage?.id,
      currentSegmentImages?.startShotGenerationId,
      taskParams.pair_shot_generation_id,
      (taskParams.individual_segment_params as Record<string, unknown>)?.pair_shot_generation_id,
      Array.isArray(orchPairIds) ? orchPairIds[segmentIndex] : undefined,
    ].find((v): v is string => typeof v === 'string') || undefined;

    // Get childGenerationId
    const parentGenerationId = media.parent_generation_id ||
      (orchestratorDetails.parent_generation_id as string) ||
      (taskParams.parent_generation_id as string) ||
      actualGenerationId;

    const isChildSegment = parentGenerationId !== actualGenerationId;
    const videoPairShotGenId = (taskParams.pair_shot_generation_id as string) ||
      (taskParams.individual_segment_params as Record<string, unknown>)?.pair_shot_generation_id as string;
    const videoMatchesCurrentSlot = !pairShotGenerationId || !videoPairShotGenId ||
      pairShotGenerationId === videoPairShotGenId;

    const childGenerationId = videoMatchesCurrentSlot
      ? (currentSegmentImages?.activeChildGenerationId || (isChildSegment ? actualGenerationId : undefined))
      : undefined;

    // Extract structure video props
    // In Timeline Mode with segmentSlotMode, prefer segment-level structure video data
    // over shot-level defaults (since segmentSlotMode has per-segment coverage info)
    const firstStructureVideo = shotStructureVideos?.[0];
    const shotStructureVideoType = firstStructureVideo?.structure_type as 'uni3c' | 'flow' | 'canny' | 'depth' | undefined;
    const shotStructureVideoDefaults = firstStructureVideo ? {
      motionStrength: (firstStructureVideo.motion_strength as number) ?? 1.2,
      treatment: ((firstStructureVideo.treatment as string) ?? 'adjust') as 'adjust' | 'clip',
      uni3cEndPercent: (firstStructureVideo.uni3c_end_percent as number) ?? 0.1,
    } : undefined;
    const shotStructureVideoUrl = firstStructureVideo?.path as string | undefined;

    // Use segment-level data from segmentSlotMode when available (Timeline Mode),
    // falling back to shot-level data
    const structureVideoType = segmentSlotMode?.structureVideoType ?? shotStructureVideoType;
    const structureVideoDefaults = segmentSlotMode?.structureVideoDefaults ?? shotStructureVideoDefaults;
    const structureVideoUrl = segmentSlotMode?.structureVideoUrl ?? shotStructureVideoUrl;

    return {
      params: taskParams as Record<string, any>,
      projectId: selectedProjectId || null,
      generationId: parentGenerationId,
      shotId,
      childGenerationId,
      segmentIndex,
      startImageUrl: segmentImageInfo.startUrl,
      endImageUrl: segmentImageInfo.endUrl,
      startImageGenerationId: segmentImageInfo.startGenId,
      endImageGenerationId: segmentImageInfo.endGenId,
      projectResolution: effectiveRegenerateResolution,
      pairShotGenerationId,
      onFrameCountChange: onSegmentFrameCountChange,
      currentFrameCount,
      variantParamsToLoad: variantParamsToLoad as Record<string, any> | null,
      onVariantParamsLoaded: () => setVariantParamsToLoad(null),
      structureVideoType,
      structureVideoDefaults,
      structureVideoUrl,
      structureVideoFrameRange: segmentSlotMode?.structureVideoFrameRange,
      onUpdateStructureVideoDefaults: handleUpdateStructureVideoDefaults,
      // Per-segment structure video management (from segmentSlotMode)
      isTimelineMode: segmentSlotMode?.isTimelineMode,
      onAddSegmentStructureVideo: segmentSlotMode?.onAddSegmentStructureVideo,
      onUpdateSegmentStructureVideo: segmentSlotMode?.onUpdateSegmentStructureVideo,
      onRemoveSegmentStructureVideo: segmentSlotMode?.onRemoveSegmentStructureVideo,
      // Whether segment has a primary variant (null primaryVariant = orphaned segment)
      hasPrimaryVariant: !!primaryVariant,
    };
  }, [
    canRegenerate,
    isVideo,
    media,
    adjustedTaskDetailsData,
    primaryVariant,
    shotDataForRegen,
    selectedProjectId,
    actualGenerationId,
    effectiveRegenerateResolution,
    currentSegmentImages,
    segmentSlotMode,
    variantParamsToLoad,
    setVariantParamsToLoad,
    onSegmentFrameCountChange,
    currentFrameCount,
    shotId,
    handleUpdateStructureVideoDefaults,
  ]);

  return {
    canRegenerate,
    regenerateFormProps,
    isLoadingShotData,
  };
}
