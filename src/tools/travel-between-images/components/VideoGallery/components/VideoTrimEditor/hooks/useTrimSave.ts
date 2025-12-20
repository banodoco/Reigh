/**
 * useTrimSave Hook
 * 
 * Handles saving a trimmed video as a new variant.
 * Uses the server-side trim-video Edge Function for proper MP4 output with correct duration metadata.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { extractAndUploadThumbnailOnly } from '@/shared/utils/videoThumbnailGenerator';
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

interface TrimVideoResponse {
  success: boolean;
  video_url?: string;
  thumbnail_url?: string | null;
  duration?: number;
  format?: string;
  file_size?: number;
  processing_time_ms?: number;
  error?: string;
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
    const endTime = videoDuration - endTrim;

    if (startTrim === 0 && endTrim === 0) {
      setSaveError('No changes to save');
      toast.error('No trim changes to save');
      return;
    }

    // Get user ID for storage path
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaveError('Not authenticated');
      toast.error('Please log in to save');
      return;
    }

    console.log('[useTrimSave] Starting server-side trim:', {
      generationId: generationId.substring(0, 8),
      projectId: projectId.substring(0, 8),
      startTrim,
      endTime,
      videoDuration,
    });

    setIsSaving(true);
    setSaveProgress(10);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Step 1: Call the Edge Function to trim and convert to MP4
      console.log('[useTrimSave] Calling trim-video Edge Function...');
      setSaveProgress(20);

      const response = await supabase.functions.invoke<TrimVideoResponse>('trim-video', {
        body: {
          video_url: sourceVideoUrl,
          start_time: startTrim,
          end_time: endTime,
          project_id: projectId,
          user_id: user.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Edge Function call failed');
      }

      const result = response.data;
      if (!result?.success || !result.video_url) {
        throw new Error(result?.error || 'No video URL in response');
      }

      console.log('[useTrimSave] Edge Function completed:', {
        videoUrl: result.video_url.substring(0, 60) + '...',
        duration: result.duration,
        format: result.format,
        processingTimeMs: result.processing_time_ms,
      });

      setSaveProgress(60);

      // Step 2: Extract thumbnail from the trimmed video (client-side)
      // Use a unique ID (timestamp + random) so each variant gets its own thumbnail
      const variantThumbId = `trim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      console.log('[useTrimSave] Extracting thumbnail from trimmed video...', { variantThumbId });
      let thumbnailUrl: string | null = null;
      try {
        const thumbResult = await extractAndUploadThumbnailOnly(result.video_url, variantThumbId, projectId);
        if (thumbResult.success && thumbResult.thumbnailUrl) {
          thumbnailUrl = thumbResult.thumbnailUrl;
          console.log('[useTrimSave] Thumbnail extracted:', thumbnailUrl.substring(0, 60) + '...');
        } else {
          console.warn('[useTrimSave] Thumbnail extraction failed:', thumbResult.error);
        }
      } catch (thumbError) {
        console.warn('[useTrimSave] Thumbnail extraction error:', thumbError);
        // Don't fail the whole save, just continue without thumbnail
      }

      setSaveProgress(70);

      // Step 3: Fetch source variant params if we have a source variant ID
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
          sourceVariantParams = typeof sourceVariant.params === 'string' 
            ? JSON.parse(sourceVariant.params) 
            : sourceVariant.params;
          console.log('[useTrimSave] Loaded source variant params:', Object.keys(sourceVariantParams));
        }
      }

      setSaveProgress(80);

      // Step 4: Create variant record in database
      console.log('[useTrimSave] Creating variant record');
      
      const trimParams = {
        trim_start: startTrim,
        trim_end: endTrim,
        original_duration: videoDuration,
        trimmed_duration: result.duration,
        duration_seconds: result.duration,
        format: result.format || 'mp4',
        source_variant_id: sourceVariantId || null,
      };
      
      const variantParams = sourceVariantParams 
        ? { ...sourceVariantParams, ...trimParams }
        : trimParams;

      const { data: insertedVariant, error: insertError } = await supabase
        .from('generation_variants')
        .insert({
          generation_id: generationId,
          location: result.video_url,
          thumbnail_url: thumbnailUrl,
          params: variantParams,
          is_primary: true,
          variant_type: 'trimmed',
          name: null,
        })
        .select('id')
        .single();

      if (insertError || !insertedVariant) {
        console.error('[useTrimSave] Failed to create variant:', insertError);
        throw new Error(`Failed to save variant: ${insertError?.message || 'No variant returned'}`);
      }

      const newVariantId = insertedVariant.id;
      console.log('[useTrimSave] Created variant with ID:', newVariantId.substring(0, 8));

      setSaveProgress(90);

      // Step 5: Update the generation record directly
      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: result.video_url,
          thumbnail_url: thumbnailUrl,
          params: variantParams,
        })
        .eq('id', generationId);

      if (updateError) {
        console.warn('[useTrimSave] Failed to update generation:', updateError);
      }

      setSaveProgress(100);
      setSaveSuccess(true);

      console.log('[useTrimSave] Complete! MP4 saved with proper duration.');

      // Invalidate queries to refresh all views
      queryClient.invalidateQueries({ queryKey: ['generation-variants'] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation'] });
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations'] }); // Timeline/Batch mode
      queryClient.invalidateQueries({ queryKey: ['generations'] }); // General generations
      queryClient.removeQueries({ queryKey: ['unified-generations'], exact: false });

      // Call success callback
      onSuccess?.(newVariantId);

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
