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
 * Hook to handle sharing of generations via unique slug
 */
export function useShareGeneration(
  generationId: string | undefined,
  taskId: string | null | undefined
): UseShareGenerationResult {
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const { toast } = useToast();

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

      // Share doesn't exist, fetch full data to create it
      const [generationResult, taskResult] = await Promise.all([
        supabase.from('generations').select('*').eq('id', generationId).single(),
        supabase.from('tasks').select('*').eq('id', taskId).single()
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
            cached_task_data: taskResult.data,
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
  }, [shareSlug, generationId, taskId, toast]);

  return {
    handleShare,
    isCreatingShare,
    shareCopied,
    shareSlug
  };
}







