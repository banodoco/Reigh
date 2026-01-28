import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';

interface UseShareGenerationResult {
  handleShare: (e: React.MouseEvent) => Promise<void>;
  isCreatingShare: boolean;
  shareCopied: boolean;
  shareSlug: string | null;
}

/**
 * Sanitize task data before caching in shared_generations
 * Removes potentially sensitive fields from params
 */
function sanitizeTaskDataForSharing(taskData: any): any {
  if (!taskData) return null;
  
  const sanitized = { ...taskData };

  const redactDeep = (value: any, depth: number = 0): any => {
    if (depth > 6) return null;
    if (value == null) return value;
    if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
    if (typeof value !== 'object') return value;

    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      // Strip any obviously sensitive keys
      if (/(api[_-]?key|token|secret|password|service_role|authorization|stripe)/i.test(k)) {
        continue;
      }
      out[k] = redactDeep(v, depth + 1);
    }
    return out;
  };
  
  // Remove or sanitize sensitive fields from params
  if (sanitized.params) {
    sanitized.params = redactDeep(sanitized.params);
  }
  
  // Remove fields that shouldn't be exposed
  delete sanitized.error_message; // Could contain internal details
  
  return sanitized;
}

/**
 * Hook to handle sharing of generations via unique slug
 *
 * @param generationId - The generation to share
 * @param taskId - The task associated with the generation
 * @param shotId - Optional shot ID for final videos (to fetch input images and settings)
 */
export function useShareGeneration(
  generationId: string | undefined,
  taskId: string | null | undefined,
  shotId?: string | null
): UseShareGenerationResult {
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const { toast } = useToast();

  // Reset share state when shot/generation changes
  useEffect(() => {
    setShareSlug(null);
    setShareCopied(false);
  }, [generationId, shotId]);

  // Generate a short, URL-friendly random string
  const generateShareSlug = (length: number = 10): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length];
    }
    
    return result;
  };

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!generationId || !taskId) {
      toast({
        title: "Cannot create share",
        description: "Generation or Task information not available",
        variant: "destructive"
      });
      return;
    }
    
    // If share already exists (in local state), copy to clipboard
    if (shareSlug) {
      const shareUrl = `${window.location.origin}/share/${shareSlug}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        toast({
          title: "Link copied!",
          description: "Share link copied to clipboard"
        });
        
        setTimeout(() => {
          setShareCopied(false);
        }, 2000);
      } catch (error) {
        console.error('[Share] Failed to copy to clipboard:', error);
        toast({
          title: "Copy failed",
          description: "Please try again",
          variant: "destructive"
        });
      }
      return;
    }
    
    // Create new share (client-side) or fetch existing
    setIsCreatingShare(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.access_token) {
        toast({
          title: "Authentication required",
          description: "Please sign in to create share links",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }
      
      // First, check if share already exists in DB
      const { data: existingShare, error: existingError } = await supabase
        .from('shared_generations')
        .select('share_slug')
        .eq('generation_id', generationId)
        .eq('creator_id', session.session.user.id)
        .maybeSingle();

      if (existingError && existingError.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('[Share] Failed to check existing share:', existingError);
        toast({
          title: "Share failed",
          description: "Please try again",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      if (existingShare) {
        // Share already exists, store it and copy it
        setShareSlug(existingShare.share_slug);
        const shareUrl = `${window.location.origin}/share/${existingShare.share_slug}`;
        
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast({
            title: "Link copied!",
            description: "Existing share link copied to clipboard"
          });
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2000);
        } catch (clipboardError) {
          toast({
            title: "Share found",
            description: "Click the copy button to copy the link",
          });
        }
        
        setIsCreatingShare(false);
        return;
      }

      // Share doesn't exist, fetch only the fields needed for display
      const [generationResult, taskResult] = await Promise.all([
        supabase.from('generations')
          .select('id, location, thumbnail_url, type, params, created_at, name')
          .eq('id', generationId)
          .single(),
        supabase.from('tasks')
          .select('id, task_type, params, status, created_at')
          .eq('id', taskId)
          .single()
      ]);

      if (generationResult.error || taskResult.error) {
        console.error('[Share] Failed to fetch data:', {
          generationError: generationResult.error,
          taskError: taskResult.error
        });
        toast({
          title: "Share failed",
          description: "Failed to load generation data",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      // For join_clips tasks, fetch shot data to cache in a standardized format
      let augmentedTaskData = taskResult.data;
      let cachedShotData: any = null;
      const taskType = taskResult.data?.task_type;

      if (shotId && (taskType === 'join_clips_orchestrator' || taskType === 'join_clips')) {
        console.log('[Share] Fetching shot data for final video share:', { shotId: shotId.substring(0, 8), taskType });

        try {
          // Fetch shot with settings
          const { data: shotData, error: shotError } = await supabase
            .from('shots')
            .select('id, name, settings')
            .eq('id', shotId)
            .single();

          // Fetch shot generations (input images) - only images, not videos
          const { data: shotGenerations, error: genError } = await supabase
            .from('shot_generations')
            .select(`
              timeline_frame,
              generation:generations!shot_generations_generation_id_generations_id_fk(
                id,
                location,
                thumbnail_url,
                type
              )
            `)
            .eq('shot_id', shotId)
            .order('timeline_frame', { ascending: true });

          if (!shotError && !genError && shotData && shotGenerations) {
            // Get generation mode from shot settings
            const travelSettings = (shotData.settings as any)?.travel_between_images || {};
            const generationMode = travelSettings.generationMode || 'batch';

            // Extract images with their timeline positions
            const images = shotGenerations
              .filter((sg: any) => sg.generation?.type === 'image' && sg.generation?.location)
              .map((sg: any) => ({
                url: sg.generation.location,
                thumbnail_url: sg.generation.thumbnail_url,
                timeline_frame: sg.timeline_frame,
              }));

            // Store shot data in a clean, standardized format
            // This is the SOURCE OF TRUTH for the share page
            cachedShotData = {
              shot_id: shotId,
              shot_name: shotData.name,
              generation_mode: generationMode,
              images: images,
              settings: {
                prompt: travelSettings.batchVideoPrompt || '',
                negative_prompt: travelSettings.negativePrompt || '',
                frames: travelSettings.batchVideoFrames || 38,
                steps: travelSettings.batchVideoSteps || 6,
                motion: travelSettings.amountOfMotion || 50,
                enhance_prompt: travelSettings.enhancePrompt || false,
                phase_config: travelSettings.phaseConfig || null,
                context_frames: travelSettings.contextFrames || 0,
              },
            };

            console.log('[Share] Cached shot data:', {
              generationMode: cachedShotData.generation_mode,
              imagesCount: cachedShotData.images.length,
              settings: cachedShotData.settings,
            });
          } else {
            console.warn('[Share] Failed to fetch shot data:', { shotError, genError });
          }
        } catch (shotFetchError) {
          console.warn('[Share] Error fetching shot data (non-fatal):', shotFetchError);
        }
      }

      // Augment task data with cached_shot_data field
      if (cachedShotData) {
        augmentedTaskData = {
          ...taskResult.data,
          cached_shot_data: cachedShotData,
        };
      }

      // Generate unique slug with retry logic
      let attempts = 0;
      const maxAttempts = 5;
      let newSlug: string | null = null;

      while (attempts < maxAttempts && !newSlug) {
        const candidateSlug = generateShareSlug(10);
        
        // Fetch creator profile basics
        const { data: creatorRow } = await supabase
          .from('users')
          .select('username, name, avatar_url')
          .eq('id', session.session.user.id)
          .maybeSingle();

        // Try to insert
        const { data: newShare, error: insertError } = await supabase
          .from('shared_generations')
          .insert({
            share_slug: candidateSlug,
            task_id: taskId,
            generation_id: generationId,
            creator_id: session.session.user.id,
            creator_username: (creatorRow as any)?.username ?? null,
            creator_name: (creatorRow as any)?.name ?? null,
            creator_avatar_url: (creatorRow as any)?.avatar_url ?? null,
            cached_generation_data: generationResult.data,
            cached_task_data: sanitizeTaskDataForSharing(augmentedTaskData),
            // Store shot_id for live data lookups (enables refreshing share page with current shot data)
            shot_id: shotId || null,
          })
          .select('share_slug')
          .single();

        if (!insertError && newShare) {
          newSlug = newShare.share_slug;
          break;
        }

        // If error is unique constraint violation, retry with new slug
        if (insertError?.code === '23505') { 
          attempts++;
          continue;
        }

        // Other error
        if (insertError) {
          console.error('[Share] Failed to create share:', insertError);
          toast({
            title: "Share failed",
            description: insertError.message || "Please try again",
            variant: "destructive"
          });
          setIsCreatingShare(false);
          return;
        }
      }

      if (!newSlug) {
        toast({
          title: "Share failed",
          description: "Failed to generate unique link. Please try again.",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      setShareSlug(newSlug);
      
      // Copy to clipboard
      const shareUrl = `${window.location.origin}/share/${newSlug}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Share created!",
          description: "Share link copied to clipboard"
        });
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch (clipboardError) {
        toast({
          title: "Share created",
          description: "Click the copy button to copy the link",
        });
      }
    } catch (error) {
      console.error('[Share] Unexpected error:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsCreatingShare(false);
    }
  }, [shareSlug, generationId, taskId, shotId, toast]);

  return {
    handleShare,
    isCreatingShare,
    shareCopied,
    shareSlug
  };
}







