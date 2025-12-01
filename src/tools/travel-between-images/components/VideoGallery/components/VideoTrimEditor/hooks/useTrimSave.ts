/**
 * useTrimSave Hook
 * 
 * Handles saving a trimmed video as a new variant.
 * Manages the full workflow: trim video, upload, create variant record.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trimAndUploadVideo } from '../utils/videoTrimmer';
import type { TrimState, UseTrimSaveReturn } from '../types';

interface UseTrimSaveProps {
  generationId: string | null;
  projectId: string | null;
  sourceVideoUrl: string | null;
  trimState: TrimState;
  sourceVariantId?: string | null;
  /** Called with the new variant ID after successful save */
  onSuccess?: (newVariantId: string) => void;
}

export const useTrimSave = ({
  generationId,
  projectId,
  sourceVideoUrl,
  trimState,
  sourceVariantId,
  onSuccess,
}: UseTrimSaveProps): UseTrimSaveReturn => {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const resetSaveState = useCallback(() => {
    setSaveProgress(0);
    setSaveError(null);
    setSaveSuccess(false);
  }, []);

  const saveTrimmedVideo = useCallback(async () => {
    if (!generationId || !projectId || !sourceVideoUrl) {
      setSaveError('Missing required data for saving');
      toast.error('Cannot save: missing generation, project, or video');
      return;
    }

    if (!trimState.isValid) {
      setSaveError('Invalid trim settings');
      toast.error('Invalid trim settings');
      return;
    }

    const { startTrim, endTrim, videoDuration } = trimState;
    const previewEndTime = videoDuration - endTrim;

    if (startTrim === 0 && endTrim === 0) {
      setSaveError('No changes to save');
      toast.error('No trim changes to save');
      return;
    }

    console.log('[useTrimSave] Starting save:', {
      generationId: generationId.substring(0, 8),
      projectId: projectId.substring(0, 8),
      startTrim,
      endTrim,
      videoDuration,
    });

    setIsSaving(true);
    setSaveProgress(0);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Step 1: Trim and upload video + thumbnail
      const { videoUrl, thumbnailUrl, duration: actualDuration } = await trimAndUploadVideo(
        sourceVideoUrl,
        startTrim,
        previewEndTime,
        projectId,
        generationId,
        (progress) => setSaveProgress(Math.round(progress * 0.8)) // 0-80%
      );

      setSaveProgress(85);

      // Step 2: Fetch source variant params if we have a source variant ID
      let sourceVariantParams: Record<string, any> | null = null;
      if (sourceVariantId) {
        console.log('[useTrimSave] Fetching source variant params:', sourceVariantId.substring(0, 8));
        const { data: sourceVariant, error: fetchError } = await supabase
          .from('generation_variants')
          .select('params')
          .eq('id', sourceVariantId)
          .single();

        if (fetchError) {
          console.warn('[useTrimSave] Failed to fetch source variant params:', fetchError);
        } else if (sourceVariant?.params) {
          // Handle case where params might be a JSON string
          sourceVariantParams = typeof sourceVariant.params === 'string' 
            ? JSON.parse(sourceVariant.params) 
            : sourceVariant.params;
          console.log('[useTrimSave] Loaded source variant params:', Object.keys(sourceVariantParams));
        }
      }

      // Step 3: Create variant record in database
      console.log('[useTrimSave] Creating variant record');
      
      // Merge source variant params with trim-specific params
      // Trim-specific params take precedence over source params
      const trimParams = {
        trim_start: startTrim,
        trim_end: endTrim,
        original_duration: videoDuration,
        trimmed_duration: actualDuration, // Use actual duration from trimmer
        duration_seconds: actualDuration, // Store for easy access in UI
        source_variant_id: sourceVariantId || null,
      };
      
      const variantParams = sourceVariantParams 
        ? { ...sourceVariantParams, ...trimParams }
        : trimParams;
      
      console.log('[useTrimSave] Merged params keys:', Object.keys(variantParams));

      const { data: insertedVariant, error: insertError } = await supabase
        .from('generation_variants')
        .insert({
          generation_id: generationId,
          location: videoUrl,
          thumbnail_url: thumbnailUrl,
          params: variantParams,
          is_primary: true, // New trimmed version becomes primary
          variant_type: 'trimmed',
          name: null, // No naming as per user request
        })
        .select('id')
        .single();

      if (insertError || !insertedVariant) {
        console.error('[useTrimSave] Failed to create variant:', insertError);
        throw new Error(`Failed to save variant: ${insertError?.message || 'No variant returned'}`);
      }

      const newVariantId = insertedVariant.id;
      console.log('[useTrimSave] Created variant with ID:', newVariantId.substring(0, 8));

      // Also directly update the generation's params as a fallback
      // (in case the sync trigger isn't deployed yet)
      console.log('[TrimDurationFix] Directly updating generation params with duration_seconds:', actualDuration);
      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: videoUrl,
          thumbnail_url: thumbnailUrl,
          params: variantParams,
        })
        .eq('id', generationId);

      if (updateError) {
        console.warn('[useTrimSave] Failed to update generation params:', updateError);
        // Don't throw - variant was created successfully
      }

      setSaveProgress(100);
      setSaveSuccess(true);

      console.log('[TrimDurationFix] useTrimSave complete! Duration stored:', actualDuration);
      toast.success('Trimmed video saved');

      // Invalidate ALL relevant queries to ensure fresh data is fetched
      console.log('[TrimDurationFix] Invalidating queries for generationId:', generationId);
      queryClient.invalidateQueries({ queryKey: ['generation-variants'] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation'] });
      // Force refetch by removing stale data
      queryClient.removeQueries({ queryKey: ['unified-generations'], exact: false });

      // Call success callback with the new variant ID
      onSuccess?.(newVariantId);

      // Reset success state after a delay
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);

    } catch (error) {
      console.error('[useTrimSave] Save failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSaveError(errorMessage);
      toast.error(`Failed to save: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  }, [
    generationId,
    projectId,
    sourceVideoUrl,
    trimState,
    sourceVariantId,
    queryClient,
    onSuccess,
  ]);

  return {
    isSaving,
    saveProgress,
    saveError,
    saveSuccess,
    saveTrimmedVideo,
    resetSaveState,
  };
};

export default useTrimSave;

