import React, { useState, useRef, useEffect } from 'react';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Info, CornerDownLeft, Check, Share2, Copy, Loader2, Layers, Film } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { TimeStamp } from '@/shared/components/TimeStamp';
import { useVideoLoader, useThumbnailLoader, useVideoElementIntegration } from '../hooks';
import { determineVideoPhase, createLoadingSummary } from '../utils/video-loading-utils';
import { getDisplayUrl } from '@/shared/lib/utils';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Input } from '@/shared/components/ui/input';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';

interface VideoItemProps {
  video: GenerationRow;
  index: number;
  originalIndex: number;
  shouldPreload: string;
  isMobile: boolean;
  projectAspectRatio?: string;
  onLightboxOpen: (index: number) => void;
  onMobileTap: (index: number) => void;
  onMobilePreload?: (index: number) => void;
  onDelete: (id: string) => void;
  deletingVideoId: string | null;
  onHoverStart: (video: GenerationRow, event: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onMobileModalOpen: (video: GenerationRow) => void;
  selectedVideoForDetails: GenerationRow | null;
  showTaskDetailsModal: boolean;
  onApplySettingsFromTask: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  existingShareSlug?: string;
  onShareCreated?: (videoId: string, shareSlug: string) => void;
  onViewSegments?: (video: GenerationRow) => void;
  projectId?: string | null;
  hideActions?: boolean;
  /** Custom tooltip text for the delete button */
  deleteTooltip?: string;
  /** Optional data-tour attribute for product tour targeting */
  dataTour?: string;
}

export const VideoItem = React.memo<VideoItemProps>(({
  video,
  index,
  originalIndex,
  shouldPreload,
  isMobile,
  projectAspectRatio,
  onLightboxOpen,
  onMobileTap,
  onMobilePreload,
  onDelete,
  deletingVideoId,
  onHoverStart,
  onHoverEnd,
  onMobileModalOpen,
  selectedVideoForDetails,
  showTaskDetailsModal,
  onApplySettingsFromTask,
  existingShareSlug,
  onShareCreated,
  onViewSegments,
  projectId,
  hideActions = false,
  deleteTooltip,
  dataTour
}) => {
  // Get task mapping for this video to enable Apply Settings button
  const { data: taskMapping } = useTaskFromUnifiedCache(video.id || '');
  const queryClient = useQueryClient();

  // Track success state for Apply Settings button
  const [settingsApplied, setSettingsApplied] = useState(false);

  // Track share state
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Toast notifications
  const { toast } = useToast();

  // State for join clips feature
  const [childGenerations, setChildGenerations] = useState<GenerationRow[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const [isJoiningClips, setIsJoiningClips] = useState(false);
  const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  
  // Join settings state (matches JoinClipsPage defaults)
  const [joinPrompt, setJoinPrompt] = useState('');
  const [joinNegativePrompt, setJoinNegativePrompt] = useState('');
  const [joinContextFrames, setJoinContextFrames] = useState(8);
  const [joinGapFrames, setJoinGapFrames] = useState(12);
  const [joinReplaceMode, setJoinReplaceMode] = useState(true);
  const [keepBridgingImages, setKeepBridgingImages] = useState(false);

  // Initialize share slug from prop (batch fetched by parent)
  useEffect(() => {
    if (existingShareSlug) {
      setShareSlug(existingShareSlug);
    }
  }, [existingShareSlug]);

  // Fetch child generations when video has no location but might have segments
  useEffect(() => {
    const shouldCheckForChildren = !video.parent_generation_id && !video.location && video.id;
    
    if (shouldCheckForChildren) {
      setIsLoadingChildren(true);

      let cancelled = false;

      const fetchChildren = async () => {
        try {
          // Fetch child generations ordered by child_order
          const { data, error } = await supabase
            .from('generations')
            .select('*')
            .eq('parent_generation_id', video.id)
            .order('child_order', { ascending: true })
            .order('created_at', { ascending: false }); // Within same child_order, newest first

          if (cancelled) return;

          if (error) {
            console.error('[JoinClips] Error fetching child generations:', error);
            return;
          }

          if (!data) {
            setChildGenerations([]);
            return;
          }

          // Transform to GenerationRow format
          const allChildren = data.map(gen => ({
            id: gen.id,
            location: gen.location || '',
            imageUrl: gen.location || '',
            thumbUrl: gen.thumbnail_url || '',
            type: gen.type || 'video',
            created_at: gen.created_at || new Date().toISOString(),
            createdAt: gen.created_at || new Date().toISOString(),
            params: gen.params as any,
            parent_generation_id: gen.parent_generation_id,
            child_order: (gen as any).child_order,
          })) as GenerationRow[];

          // Deduplicate by child_order - keep the newest (first) for each unique child_order
          // This handles the case where a segment was regenerated (creating a variant with the same child_order)
          const seenChildOrders = new Set<number>();
          const uniqueChildren = allChildren.filter(child => {
            const rawChildOrder = (child as any).child_order;
            if (rawChildOrder === undefined || rawChildOrder === null) {
              return true; // Keep children without child_order (shouldn't happen but be safe)
            }
            const childOrder = typeof rawChildOrder === 'number' ? rawChildOrder : parseInt(String(rawChildOrder), 10);
            if (Number.isNaN(childOrder)) {
              return true;
            }
            if (seenChildOrders.has(childOrder)) {
              return false; // Skip duplicates
            }
            seenChildOrders.add(childOrder);
            return true;
          });

          console.log('[JoinClips] Found child generations:', {
            parentId: video.id?.substring(0, 8),
            totalChildren: allChildren.length,
            uniqueSegments: uniqueChildren.length,
            deduplicatedCount: allChildren.length - uniqueChildren.length,
            allHaveLocations: uniqueChildren.every(c => c.location),
          });

          setChildGenerations(uniqueChildren);
        } finally {
          if (!cancelled) {
            setIsLoadingChildren(false);
          }
        }
      };

      fetchChildren();

      return () => {
        cancelled = true;
      };
    }
  }, [video.id, video.parent_generation_id, video.location]);

  // Determine if we should show "Join clips" button (always show for parent generations without output)
  const shouldShowJoinButton = !video.parent_generation_id && !video.location;
  
  // Determine if join is ready (all conditions met)
  const canJoinClips = shouldShowJoinButton && 
                       childGenerations.length >= 2 && 
                       childGenerations.every(child => child.location);
  
  // Generate helpful tooltip message
  const getJoinTooltipMessage = () => {
    if (joinClipsSuccess) {
      return 'Join task created!';
    }
    if (isJoiningClips) {
      return 'Creating join task...';
    }
    if (isLoadingChildren) {
      return 'Checking for segments...';
    }
    if (childGenerations.length === 0) {
      return 'No segments found - generate segments first';
    }
    if (childGenerations.length === 1) {
      return 'Need at least 2 segments to join';
    }
    const segmentsWithoutOutput = childGenerations.filter(c => !c.location).length;
    if (segmentsWithoutOutput > 0) {
      return `Waiting for ${segmentsWithoutOutput} segment${segmentsWithoutOutput > 1 ? 's' : ''} to finish generating`;
    }
    return `Join ${childGenerations.length} segments into one video`;
  };

  // Handler for opening join modal
  const handleJoinClipsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!canJoinClips) {
      return;
    }
    
    setShowJoinModal(true);
  };
  
  // Handler for confirming join with settings
  const handleConfirmJoin = async () => {
    if (!projectId || !canJoinClips) {
      return;
    }
    
    setIsJoiningClips(true);
    setShowJoinModal(false);
    
    try {
      // Create clips array from child generations
      const clips = childGenerations.map((child, index) => ({
        url: child.location,
        name: `Segment ${index + 1}`,
      }));
      
      // Calculate resolution from project's aspect ratio
      let resolutionTuple: [number, number] | undefined;
      if (projectAspectRatio) {
        const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
        if (resolutionStr) {
          const [width, height] = resolutionStr.split('x').map(Number);
          if (width && height) {
            resolutionTuple = [width, height];
          }
        }
      }
      
      console.log('[JoinClips] Creating join task for segments:', {
        parentId: video.id?.substring(0, 8),
        clipCount: clips.length,
        prompt: joinPrompt,
        contextFrames: joinContextFrames,
        gapFrames: joinGapFrames,
        replaceMode: joinReplaceMode,
        keepBridgingImages: keepBridgingImages,
        clips: clips.map(c => ({ name: c.name, url: c.url?.substring(0, 50) + '...' })),
        projectAspectRatio,
        resolution: resolutionTuple,
      });
      
      // Create the join clips task with user settings
      await createJoinClipsTask({
        project_id: projectId,
        clips,
        prompt: joinPrompt,
        negative_prompt: joinNegativePrompt,
        context_frame_count: joinContextFrames,
        gap_frame_count: joinGapFrames,
        replace_mode: joinReplaceMode,
        keep_bridging_images: keepBridgingImages,
        model: 'wan_2_2_vace_lightning_baseline_2_2_2',
        num_inference_steps: 6,
        guidance_scale: 3.0,
        seed: -1,
        parent_generation_id: video.id,
        // IMPORTANT: This join is initiated from within Travel Between Images,
        // so the resulting output should be attributed to this tool for filtering/counting.
        tool_type: 'travel-between-images',
        ...(resolutionTuple && { resolution: resolutionTuple }),
      });
      
      toast({
        title: 'Join task created',
        description: `Joining ${clips.length} segments into one video`,
      });
      
      // Show success state
      setJoinClipsSuccess(true);
      setTimeout(() => setJoinClipsSuccess(false), 3000);
      
      // Invalidate queries to refresh task list
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ 
        queryKey: ['unified-generations', 'project', projectId]
      });
      
    } catch (error) {
      console.error('[JoinClips] Error creating join task:', error);
      toast({
        title: 'Failed to create join task',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsJoiningClips(false);
    }
  };


  // ===============================================================================
  // HOOKS - Use extracted hooks for cleaner separation of concerns
  // ===============================================================================

  const videoLoader = useVideoLoader(video, index, shouldPreload);
  const thumbnailLoader = useThumbnailLoader(video);

  // Destructure for easier access
  const { shouldLoad, videoMetadataLoaded, videoPosterLoaded, logVideoEvent } = videoLoader;
  const {
    thumbnailLoaded,
    setThumbnailLoaded,
    thumbnailError,
    setThumbnailError,
    hasThumbnail,
    isInitiallyCached,
    inPreloaderCache,
    inBrowserCache
  } = thumbnailLoader;

  // DEEP DEBUG: Log thumbnail state changes
  useEffect(() => {
    console.log(`[VideoGalleryPreload] VIDEO_ITEM_THUMBNAIL_STATE:`, {
      videoId: video.id?.substring(0, 8),
      thumbnailLoaded,
      thumbnailError,
      hasThumbnail,
      isInitiallyCached,
      inPreloaderCache,
      inBrowserCache,
      timestamp: Date.now()
    });
  }, [video.id, thumbnailLoaded, thumbnailError, hasThumbnail, isInitiallyCached, inPreloaderCache, inBrowserCache]);

  // Hook for video element integration
  const containerRef = useRef<HTMLDivElement>(null);
  useVideoElementIntegration(video, index, shouldLoad, shouldPreload, videoLoader, isMobile, containerRef);

  // ===============================================================================
  // VIDEO TRANSITION STATE - Smooth transition from thumbnail to video
  // ===============================================================================

  // Track when video is fully visible to prevent flashing
  const [videoFullyVisible, setVideoFullyVisible] = useState(false);

  // Reset transition state when video changes to prevent cross-video state contamination
  const prevVideoIdRef = useRef(video.id);
  useEffect(() => {
    if (prevVideoIdRef.current !== video.id) {
      setVideoFullyVisible(false);
      prevVideoIdRef.current = video.id;
    }
  }, [video.id]);

  // ===============================================================================
  // MOBILE PRELOADING STATE - Video preloading on first tap
  // ===============================================================================

  // Track mobile video preloading state
  const [isMobilePreloading, setIsMobilePreloading] = useState(false);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);

  // ===============================================================================
  // MOBILE VIDEO PRELOADING FUNCTION
  // ===============================================================================

  const startMobileVideoPreload = React.useCallback(() => {
    if (!isMobile || isMobilePreloading || preloadVideoRef.current) {
      console.log('[MobilePreload] Skipping preload', {
        videoId: video.id?.substring(0, 8),
        isMobile,
        isMobilePreloading,
        hasExistingPreloadVideo: !!preloadVideoRef.current,
        timestamp: Date.now()
      });
      return;
    }

    console.log('[MobilePreload] Starting video preload', {
      videoId: video.id?.substring(0, 8),
      videoSrc: video.location?.substring(video.location.lastIndexOf('/') + 1) || 'no-src',
      timestamp: Date.now()
    });

    setIsMobilePreloading(true);

    // Create hidden video element for preloading
    const preloadVideo = document.createElement('video');
    const resolvedSrc = getDisplayUrl((video.location || video.imageUrl || '') as string);
    preloadVideo.src = resolvedSrc;
    preloadVideo.preload = 'auto';
    preloadVideo.muted = true;
    preloadVideo.playsInline = true;
    preloadVideo.style.display = 'none';
    preloadVideo.style.position = 'absolute';
    preloadVideo.style.top = '-9999px';
    preloadVideo.style.left = '-9999px';

    // Add event listeners for preload tracking
    const handleCanPlay = () => {
      console.log('[MobilePreload] Video can play - preload successful', {
        videoId: video.id?.substring(0, 8),
        readyState: preloadVideo.readyState,
        timestamp: Date.now()
      });
    };

    const handleLoadedData = () => {
      console.log('[MobilePreload] Video data loaded - preload progressing', {
        videoId: video.id?.substring(0, 8),
        readyState: preloadVideo.readyState,
        timestamp: Date.now()
      });
    };

    const handleError = () => {
      console.warn('[MobilePreload] Video preload failed', {
        videoId: video.id?.substring(0, 8),
        error: preloadVideo.error,
        timestamp: Date.now()
      });
    };

    preloadVideo.addEventListener('canplay', handleCanPlay);
    preloadVideo.addEventListener('loadeddata', handleLoadedData);
    preloadVideo.addEventListener('error', handleError);

    // Store ref and append to DOM (hidden)
    preloadVideoRef.current = preloadVideo;
    document.body.appendChild(preloadVideo);

    // Cleanup function
    const cleanup = () => {
      if (preloadVideoRef.current) {
        preloadVideoRef.current.removeEventListener('canplay', handleCanPlay);
        preloadVideoRef.current.removeEventListener('loadeddata', handleLoadedData);
        preloadVideoRef.current.removeEventListener('error', handleError);
        if (preloadVideoRef.current.parentNode) {
          preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        }
        preloadVideoRef.current = null;
      }
    };

    // Auto-cleanup after 30 seconds if video not opened
    const timeoutId = setTimeout(() => {
      console.log('[MobilePreload] Auto-cleanup preload video after timeout', {
        videoId: video.id?.substring(0, 8),
        timestamp: Date.now()
      });
      cleanup();
      setIsMobilePreloading(false);
    }, 30000);

    // Store cleanup function for manual cleanup
    preloadVideo.dataset.cleanupTimeoutId = timeoutId.toString();

    return cleanup;
  }, [isMobile, isMobilePreloading, video.id, video.location, video.imageUrl]);

  // Cleanup preload video on unmount or video change
  useEffect(() => {
    return () => {
      if (preloadVideoRef.current) {
        const timeoutId = preloadVideoRef.current.dataset.cleanupTimeoutId;
        if (timeoutId) {
          clearTimeout(parseInt(timeoutId));
        }
        if (preloadVideoRef.current.parentNode) {
          preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        }
        preloadVideoRef.current = null;
      }
    };
  }, [video.id]);

  // ===============================================================================
  // MOBILE PRELOAD TRIGGER - Connect to parent callback
  // ===============================================================================

  // Create stable preload handler for this video item
  const handleMobilePreload = React.useCallback(() => {
    startMobileVideoPreload();
  }, [startMobileVideoPreload]);

  // Expose preload function to parent via callback effect
  React.useEffect(() => {
    if (onMobilePreload) {
      // Store this video's preload function globally so parent can call it
      // We'll use a map keyed by originalIndex
      if (!window.mobileVideoPreloadMap) {
        window.mobileVideoPreloadMap = new Map();
      }
      window.mobileVideoPreloadMap.set(originalIndex, handleMobilePreload);

      return () => {
        window.mobileVideoPreloadMap?.delete(originalIndex);
      };
    }
  }, [originalIndex, handleMobilePreload, onMobilePreload]);

  // ===============================================================================
  // SHARE FUNCTIONALITY
  // ===============================================================================

  /**
   * Generate a short, URL-friendly random string (like nanoid)
   */
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

  /**
   * Sanitize task data before caching in shared_generations
   * Removes potentially sensitive fields from params
   */
  const sanitizeTaskDataForSharing = (taskData: any): any => {
    if (!taskData) return null;
    
    const sanitized = { ...taskData };
    
    if (sanitized.params) {
      const sanitizedParams = { ...sanitized.params };
      delete sanitizedParams.api_key;
      delete sanitizedParams.internal_config;
      delete sanitizedParams.worker_config;
      sanitized.params = sanitizedParams;
    }
    
    delete sanitized.error_message;
    return sanitized;
  };

  /**
   * Handle share button click - create share link or copy existing
   * Optimized to avoid Edge Function - handles everything client-side
   */
  const handleShare = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!taskMapping?.taskId) {
      toast({
        title: "Cannot create share",
        description: "Task information not available",
        variant: "destructive"
      });
      return;
    }

    // If share already exists, copy to clipboard
    if (shareSlug) {
      const shareUrl = `${window.location.origin}/share/${shareSlug}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        toast({
          title: "Link copied!",
          description: "Share link copied to clipboard"
        });

        // Reset copied state after 2 seconds
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

    // Create new share (client-side)
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

      // First, check if share already exists
      const { data: existingShare, error: existingError } = await supabase
        .from('shared_generations' as any)
        .select('share_slug')
        .eq('generation_id', video.id as string)
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
        // Share already exists, just copy it
        setShareSlug(existingShare.share_slug);
        const shareUrl = `${window.location.origin}/share/${existingShare.share_slug}`;

        try {
          await navigator.clipboard.writeText(shareUrl);
          toast({
            title: "Link copied!",
            description: "Existing share link copied to clipboard"
          });
        } catch (clipboardError) {
          toast({
            title: "Share found",
            description: "Click the copy button to copy the link",
          });
        }

        setIsCreatingShare(false);
        return;
      }

      // Fetch only the fields needed for display (not sensitive data)
      const [generationResult, taskResult] = await Promise.all([
        supabase.from('generations')
          .select('id, location, thumbnail_url, type, params, created_at, name')
          .eq('id', video.id as string)
          .single(),
        supabase.from('tasks')
          .select('id, task_type, params, status, created_at')
          .eq('id', taskMapping.taskId)
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

        // Try to insert - unique constraint will prevent duplicates
        const { data: newShare, error: insertError } = await supabase
          .from('shared_generations' as any)
          .insert({
            share_slug: candidateSlug,
            task_id: taskMapping.taskId,
            generation_id: video.id as string,
            creator_id: session.session.user.id,
            creator_username: (creatorRow as any)?.username ?? null,
            creator_name: (creatorRow as any)?.name ?? null,
            creator_avatar_url: (creatorRow as any)?.avatar_url ?? null,
            cached_generation_data: generationResult.data,
            cached_task_data: sanitizeTaskDataForSharing(taskResult.data),
          })
          .select('share_slug')
          .single();

        if (!insertError && newShare) {
          newSlug = newShare.share_slug;
          break;
        }

        // If error is unique constraint violation, retry with new slug
        if (insertError?.code === '23505') { // Unique constraint violation
          attempts++;
          continue;
        }

        // Other error - fail
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

      // Notify parent to update batch cache
      if (video.id) {
        onShareCreated?.(video.id, newSlug);
      }

      // Automatically copy to clipboard
      const shareUrl = `${window.location.origin}/share/${newSlug}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Share created!",
          description: "Share link copied to clipboard"
        });
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
  }, [shareSlug, taskMapping, video.id, toast, onShareCreated]);

  // Use ref to persist timeout across re-renders and prevent race conditions
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing timeout to prevent stale callbacks
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (videoPosterLoaded) {
      // Delay hiding thumbnail until video transition completes
      transitionTimeoutRef.current = setTimeout(() => {
        setVideoFullyVisible(true);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - TRANSITION_COMPLETE:`, {
            videoId: video.id,
            phase: 'TRANSITION_COMPLETE',
            thumbnailWillHide: true,
            videoFullyVisible: true,
            timestamp: Date.now()
          });
        }
        transitionTimeoutRef.current = null;
      }, 350); // Slightly longer than the 200ms transition

      return () => {
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
          transitionTimeoutRef.current = null;
        }
      };
    } else {
      setVideoFullyVisible(false);
    }
  }, [videoPosterLoaded, index, video.id]);

  // ===============================================================================
  // STATE TRACKING - Unified video lifecycle logging
  // ===============================================================================

  const lastLoggedStateRef = useRef<string>('');
  useEffect(() => {
    const currentState = `${shouldLoad}-${videoPosterLoaded}-${videoMetadataLoaded}-${thumbnailLoaded}-${hasThumbnail}`;
    if (currentState !== lastLoggedStateRef.current && process.env.NODE_ENV === 'development') {
      const { phase, readyToShow } = determineVideoPhase(shouldLoad, videoPosterLoaded, videoMetadataLoaded, thumbnailLoaded, hasThumbnail);

      logVideoEvent(phase, {
        readyToShow,
        shouldLoad,
        videoPosterLoaded,
        videoMetadataLoaded,
        hasThumbnail,
        thumbnailLoaded,
        thumbnailError,
        thumbnailUrl: video.thumbUrl,
        videoUrl: video.location,
        summary: createLoadingSummary(hasThumbnail, thumbnailLoaded, videoPosterLoaded, shouldLoad)
      });

      lastLoggedStateRef.current = currentState;
    }
  }, [shouldLoad, videoPosterLoaded, videoMetadataLoaded, thumbnailLoaded, hasThumbnail, thumbnailError, logVideoEvent, video.thumbUrl, video.location]);

  // ===============================================================================
  // ASPECT RATIO CALCULATION - Dynamic aspect ratio based on project settings
  // ===============================================================================

  // Calculate aspect ratio for video container based on project dimensions
  const aspectRatioStyle = React.useMemo(() => {
    if (!projectAspectRatio) {
      return { aspectRatio: '16/9' }; // Default to 16:9 if no project aspect ratio
    }

    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      return { aspectRatio: `${width}/${height}` };
    }

    return { aspectRatio: '16/9' }; // Fallback to 16:9
  }, [projectAspectRatio]);

  // ===============================================================================
  // GRID LAYOUT CALCULATION - Dynamic grid based on project aspect ratio
  // ===============================================================================

  // Calculate grid classes based on project aspect ratio
  // ===============================================================================
  // RENDER - Clean component rendering
  // ===============================================================================

  // MOBILE OPTIMIZATION: Use poster images instead of video elements on mobile to prevent autoplay budget exhaustion
  // ALL gallery videos use posters on mobile to leave maximum budget for lightbox autoplay
  const shouldUsePosterOnMobile = isMobile;

  // Determine poster image source: prefer thumbnail, fallback to video poster frame
  const posterImageSrc = (() => {
    if (video.thumbUrl) return video.thumbUrl; // Use thumbnail if available
    if (video.imageUrl) return video.imageUrl; // Try imageUrl next
    if (video.location) return video.location; // Use video URL as final fallback (browser will extract first frame)
    return null; // No source available
  })();

  // NEW: Check if we should show collage (parent with no output but has segments)
  const showCollage = !video.location && childGenerations.length > 0;

  // ALWAYS log to help diagnose autoplay issues
  console.log('[MobileAutoplayDebug]', {
    videoId: video.id?.substring(0, 8),
    index,
    isMobile,
    shouldUsePosterOnMobile,
    hasThumbnail: !!video.thumbUrl,
    hasImageUrl: !!video.imageUrl,
    posterImageSrc: posterImageSrc ? 'exists' : 'NULL',
    showCollage,
    childCount: childGenerations.length,
    willRender: showCollage ? 'COLLAGE' : (shouldUsePosterOnMobile ? (posterImageSrc ? 'STATIC_IMG' : 'PLACEHOLDER_ICON') : 'VIDEO_ELEMENT_WITH_SCRUBBING'),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 50) : 'no-ua',
    timestamp: Date.now()
  });

  // Normalize URLs - don't add query parameters as they break browser caching
  const resolvedPosterUrl = posterImageSrc ? getDisplayUrl(posterImageSrc) : '/placeholder.svg';
  const posterSrcStable = resolvedPosterUrl;

  const resolvedThumbUrl = video.thumbUrl ? getDisplayUrl(video.thumbUrl) : null;
  const thumbSrcStable = resolvedThumbUrl;

  if (process.env.NODE_ENV === 'development' && shouldUsePosterOnMobile) {
    console.log('[AutoplayDebugger:GALLERY] 📱 Using poster optimization', {
      videoId: video.id?.substring(0, 8),
      hasThumbnail,
      posterSrc: posterImageSrc?.substring(posterImageSrc.lastIndexOf('/') + 1) || 'none',
      reason: 'Mobile optimization - ALL gallery videos use posters to maximize lightbox autoplay budget',
      timestamp: Date.now()
    });
  }

  return (
    <div className="relative group" style={{ contain: 'layout style paint' }} data-tour={dataTour}>
      <div
        className="bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative"
        style={aspectRatioStyle}
      >

        {showCollage ? (
          // COLLAGE MODE: Show grid of segments for parents without output
          <div
            className="absolute inset-0 w-full h-full cursor-pointer bg-black/5 grid grid-cols-2 gap-0.5 overflow-hidden"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onViewSegments) onViewSegments(video);
            }}
            // On mobile/touch devices, use onTouchEnd for immediate response (no double-tap needed)
            onTouchEnd={isMobile ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onViewSegments) onViewSegments(video);
            } : undefined}
          >
            {childGenerations.slice(0, 4).map((child, idx) => (
              <div key={child.id || idx} className="relative w-full h-full overflow-hidden bg-black/20">
                {(child.thumbUrl || child.imageUrl) && (
                  <img
                    src={getDisplayUrl(child.thumbUrl || child.imageUrl || '')}
                    className="w-full h-full object-cover transition-opacity duration-300"
                    alt={`Segment ${idx + 1}`}
                    loading="lazy"
                    style={{ opacity: 0 }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '0.8';
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '0.8';
                    }}
                  />
                )}
              </div>
            ))}
            {/* Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/5 transition-colors group-hover:bg-black/20">
              <div className="bg-black/70 backdrop-blur-md text-white px-2 py-1 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 shadow-lg border border-white/10 transform transition-transform group-hover:scale-105">
                <Layers className="w-3 h-3 md:w-4 md:h-4" />
                View {childGenerations.length} Segments
              </div>
            </div>
          </div>
        ) : shouldUsePosterOnMobile ? (
          // MOBILE POSTER MODE: Show static image - clickable to open lightbox
          <div
            className="absolute inset-0 w-full h-full cursor-pointer bg-gray-100"
            onClick={(e) => {
              // Don't interfere with touches inside action buttons
              const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
              const isInsideButton = path ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button')) : !!(e.target as HTMLElement).closest('button');
              if (isInsideButton) {
                console.log('[MobileTapFlow:VideoItem] onClick - SKIPPED (inside button)', {
                  videoId: video.id?.substring(0, 8),
                  originalIndex,
                  timestamp: Date.now()
                });
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              console.log('[MobileTapFlow:VideoItem] onClick - calling onMobileTap', {
                videoId: video.id?.substring(0, 8),
                originalIndex,
                onMobileTapType: typeof onMobileTap,
                timestamp: Date.now()
              });
              onMobileTap(originalIndex);
              console.log('[MobileTapFlow:VideoItem] onClick - onMobileTap RETURNED', {
                videoId: video.id?.substring(0, 8),
                originalIndex,
                timestamp: Date.now()
              });
            }}
            onTouchEnd={isMobile ? (e) => {
              // Don't interfere with touches inside action buttons
              const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
              const isInsideButton = path ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button')) : !!(e.target as HTMLElement).closest('button');
              if (isInsideButton) {
                console.log('[MobileTapFlow:VideoItem] onTouchEnd - SKIPPED (inside button)', {
                  videoId: video.id?.substring(0, 8),
                  originalIndex,
                  timestamp: Date.now()
                });
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              console.log('[MobileTapFlow:VideoItem] onTouchEnd - calling onMobileTap', {
                videoId: video.id?.substring(0, 8),
                originalIndex,
                onMobileTapType: typeof onMobileTap,
                timestamp: Date.now()
              });
              onMobileTap(originalIndex);
              console.log('[MobileTapFlow:VideoItem] onTouchEnd - onMobileTap RETURNED', {
                videoId: video.id?.substring(0, 8),
                originalIndex,
                timestamp: Date.now()
              });
            } : undefined}
          >
            {posterImageSrc ? (
              <img
                key={`poster-${video.id}`}
                src={posterSrcStable || resolvedPosterUrl}
                alt="Video poster"
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover transition-opacity duration-200"
                style={{ opacity: 0 }}
                onLoad={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '1';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <Film className="h-8 w-8" />
              </div>
            )}
          </div>
        ) : (
          // DESKTOP OR PRIORITY VIDEO MODE: Use actual video element
          <>
            {/* Thumbnail - shows immediately if available, stays visible until video fully transitions */}
            {hasThumbnail && !thumbnailError && (
              <img
                key={`thumb-${video.id}`}
                src={thumbSrcStable || resolvedThumbUrl || ''}
                alt="Video thumbnail"
                loading="eager"
                decoding="async"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${videoFullyVisible ? 'opacity-0' : 'opacity-100'
                  }`}
                onLoad={() => {
                  setThumbnailLoaded(true);
                }}
                onError={() => {
                  setThumbnailError(true);
                }}
              />
            )}

            {/* Loading placeholder - shows until thumbnail or video poster is ready */}
            {/* Only show spinner if we truly have nothing to display yet */}
            {!thumbnailLoaded && !videoPosterLoaded && !isInitiallyCached && hasThumbnail && (
              <div className={`absolute inset-0 bg-gray-200 flex items-center justify-center z-10 transition-opacity duration-300 pointer-events-none ${videoFullyVisible ? 'opacity-0' : 'opacity-100'}`}>
                <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></div>
              </div>
            )}

            {/* Only render video when it's time to load */}
            {shouldLoad && (
              <div ref={containerRef} className="relative w-full h-full">
                {/* HoverScrubVideo with loading optimization integration */}
                <HoverScrubVideo
                  key={`video-${video.id}`}
                  src={video.location || video.imageUrl}
                  preload={shouldPreload as 'auto' | 'metadata' | 'none'}
                  loadOnDemand={true}
                  className={`w-full h-full transition-opacity duration-500 ${videoPosterLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                  videoClassName="object-cover cursor-pointer"
                  poster={thumbSrcStable || video.thumbUrl}
                  data-video-id={video.id}
                  // Interaction events
                  onDoubleClick={isMobile ? undefined : () => {
                    onLightboxOpen(originalIndex);
                  }}
                  onTouchEnd={isMobile ? (e) => {
                    // Don't interfere with touches inside action buttons
                    const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
                    const isInsideButton = path ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button')) : !!(e.target as HTMLElement).closest('button');
                    if (isInsideButton) return;
                    e.preventDefault();
                    onMobileTap(originalIndex);
                  } : undefined}
                />
              </div>
            )}
          </>
        )}


        {/* Top Overlay - Timestamp in top-left (always visible on mobile, hover-only on desktop) */}
        <div className="absolute top-0 left-0 p-3 transition-opacity duration-300 z-20 pointer-events-none">
          <div className="pointer-events-auto inline-flex whitespace-nowrap">
            <TimeStamp createdAt={video.created_at} showOnHover={!isMobile} />
          </div>
        </div>

        {/* Bottom Overlay - View Segments Button & Variant Name */}
        <div className="absolute bottom-0 left-0 right-0 pb-2 pl-3 pr-3 pt-6 flex justify-between items-end bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <div className="flex flex-col items-start gap-2 pointer-events-auto">
            {/* View Segments Button */}
            {onViewSegments && !video.parent_generation_id && !hideActions && !showCollage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 bg-black/80 hover:bg-black text-white rounded-full backdrop-blur-md border border-white/20 shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewSegments) {
                          onViewSegments(video);
                        }
                      }}
                    >
                      <Layers className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View segments</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}


            {/* Variant Name Display */}
            {video.variant_name && (
              <div className="text-[10px] font-medium text-white/90 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm border border-white/10 max-w-[120px] truncate">
                {video.variant_name}
              </div>
            )}
          </div>
        </div>
        
        {/* Join Clips Settings Modal */}
        <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Join {childGenerations.length} Segments</DialogTitle>
            <DialogDescription>
              Configure settings for joining the segments into a single video
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Prompts */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="join-prompt">Prompt: (Optional)</Label>
                <Textarea
                  id="join-prompt"
                  value={joinPrompt}
                  onChange={(e) => setJoinPrompt(e.target.value)}
                  placeholder="Describe what you want for the transitions between segments"
                  rows={3}
                  className="resize-none"
                  clearable
                  onClear={() => setJoinPrompt('')}
                  voiceInput
                  voiceContext="This is a prompt for video segment transitions. Describe the motion, style, or visual effect you want when joining video clips together. Focus on how elements should move or transform."
                  onVoiceResult={(result) => {
                    setJoinPrompt(result.prompt || result.transcription);
                  }}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="join-negative-prompt">Negative Prompt: (Optional)</Label>
                <Textarea
                  id="join-negative-prompt"
                  value={joinNegativePrompt}
                  onChange={(e) => setJoinNegativePrompt(e.target.value)}
                  placeholder="What to avoid in the transitions"
                  rows={2}
                  className="resize-none"
                  clearable
                  onClear={() => setJoinNegativePrompt('')}
                  voiceInput
                  voiceContext="This is a negative prompt - things to AVOID in video transitions. List unwanted qualities like 'jerky, flickering, blurry'. Keep it as a comma-separated list."
                  onVoiceResult={(result) => {
                    setJoinNegativePrompt(result.prompt || result.transcription);
                  }}
                />
              </div>
            </div>
            
            {/* Frame Controls */}
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="join-gap-frames" className="text-sm">
                    Gap Frames
                  </Label>
                  <span className="text-sm font-medium">{joinGapFrames}</span>
                </div>
                <Slider
                  id="join-gap-frames"
                  min={1}
                  max={Math.max(1, 81 - (joinContextFrames * 2))}
                  step={1}
                  value={[Math.max(1, joinGapFrames)]}
                  onValueChange={(values) => {
                    const val = Math.max(1, values[0]);
                    setJoinGapFrames(val);
                  }}
                />
                <p className="text-xs text-muted-foreground">Frames to generate in each transition</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="join-context-frames" className="text-sm">
                  Context Frames
                </Label>
                <Input
                  id="join-context-frames"
                  type="number"
                  min={1}
                  max={30}
                  value={joinContextFrames}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    if (!isNaN(val) && val > 0) {
                      const maxGap = Math.max(1, 81 - (val * 2));
                      const newGapFrames = joinGapFrames > maxGap ? maxGap : joinGapFrames;
                      setJoinContextFrames(val);
                      setJoinGapFrames(newGapFrames);
                    }
                  }}
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">Context frames from each clip</p>
              </div>
              
              <div className="flex items-center justify-between gap-3 px-3 py-3 border rounded-lg">
                <Label htmlFor="join-replace-mode" className="text-sm text-center flex-1 cursor-pointer">
                  Replace Frames
                </Label>
                <Switch
                  id="join-replace-mode"
                  checked={!joinReplaceMode}
                  onCheckedChange={(checked) => {
                    setJoinReplaceMode(!checked);
                  }}
                />
                <Label htmlFor="join-replace-mode" className="text-sm text-center flex-1 cursor-pointer">
                  Generate New
                </Label>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowJoinModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmJoin}
              disabled={isJoiningClips}
            >
              {isJoiningClips ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Task...
                </>
              ) : (
                `Join ${childGenerations.length} Segments`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* Action buttons – positioned directly on the video/poster container */}
        {!hideActions && (
          <div className="absolute top-1/2 right-2 sm:right-3 flex flex-col items-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity -translate-y-1/2 z-20 pointer-events-auto">
            {/* Share Button */}
            {taskMapping?.taskId && (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={handleShare}
                      disabled={isCreatingShare}
                      className={`h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full text-white transition-all ${shareCopied
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-black/50 hover:bg-black/70'
                        }`}
                    >
                      {isCreatingShare ? (
                        <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
                      ) : shareCopied ? (
                        <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      ) : shareSlug ? (
                        <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      ) : (
                        <Share2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{shareCopied ? 'Link copied!' : shareSlug ? 'Copy share link' : 'Share this video'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Variant Count - positioned above Info button */}
            {(video as any).derivedCount > 1 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-black/50 text-white text-[10px] font-medium flex items-center justify-center backdrop-blur-sm cursor-help">
                      {(video as any).derivedCount}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{(video as any).derivedCount} variant{(video as any).derivedCount !== 1 ? 's' : ''}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button
              variant="secondary"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                console.log('[MobileButtonDebug] [InfoButton] Button clicked START:', {
                  isMobile,
                  videoId: video.id,
                  timestamp: Date.now()
                });

                if (isMobile) {
                  // On mobile, open the modal
                  console.log('[MobileButtonDebug] [InfoButton] Setting modal state...');
                  onMobileModalOpen(video);
                } else {
                  // On desktop, open the lightbox
                  console.log('[MobileButtonDebug] [InfoButton] Desktop - opening lightbox');
                  onLightboxOpen(originalIndex);
                }
              }}
              onMouseEnter={(e) => onHoverStart(video, e)}
              onMouseLeave={onHoverEnd}
              className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
            >
              <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </Button>



            {/* Apply Settings Button */}
            {taskMapping?.taskId && (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('[ApplySettings] Button clicked:', {
                          videoId: video.id?.substring(0, 8),
                          taskId: taskMapping.taskId,
                          settingsApplied,
                          onApplySettingsFromTaskType: typeof onApplySettingsFromTask,
                          timestamp: Date.now()
                        });
                        if (taskMapping.taskId && !settingsApplied) {
                          console.log('[ApplySettings] Calling onApplySettingsFromTask...');
                          // Call with replaceImages=true to include source images, empty array will be populated from task data
                          onApplySettingsFromTask(taskMapping.taskId, true, []);
                          // Show success state
                          setSettingsApplied(true);
                          // Reset after 2 seconds
                          setTimeout(() => {
                            setSettingsApplied(false);
                          }, 2000);
                        } else {
                          console.log('[ApplySettings] Click ignored:', {
                            hasTaskId: !!taskMapping.taskId,
                            settingsApplied
                          });
                        }
                      }}
                      disabled={settingsApplied}
                      className={`h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full text-white transition-all ${settingsApplied
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-black/50 hover:bg-black/70'
                        }`}
                    >
                      {settingsApplied ? (
                        <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      ) : (
                        <CornerDownLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{settingsApplied ? 'Settings applied!' : 'Apply settings & images from this video to the current shot'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('[MobileButtonDebug] [DeleteButton] Button clicked:', {
                        videoId: video.id,
                        deletingVideoId,
                        isDisabled: deletingVideoId === video.id,
                        timestamp: Date.now()
                      });
                      onDelete(video.id);
                      console.log('[MobileButtonDebug] [DeleteButton] onDelete called');
                    }}
                    disabled={deletingVideoId === video.id}
                    className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full"
                  >
                    <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>{deleteTooltip || 'Delete video'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>

  );
}, (prevProps, nextProps) => {
  // ============================================================================
  // CUSTOM MEMO COMPARISON - FIX FOR HOVER STATE ISSUE
  // ============================================================================
  // 
  // ROOT CAUSE: The useUnifiedGenerations hook constantly refetches data (every 5s),
  // causing VideoOutputsGallery to re-render. Without a custom comparison function,
  // React.memo would allow VideoItem to re-render on every parent render, which:
  // 1. Recreates event handlers (breaking reference equality)
  // 2. Potentially disrupts hover state, especially on the first item
  // 3. Causes unnecessary work and DOM updates
  //
  // FIX: This custom comparison function prevents re-renders unless meaningful
  // props have actually changed. Combined with memoized event handlers in the
  // parent, this ensures the hover state remains stable even during frequent
  // query refetches.
  //
  // TESTING: Watch for "[HoverIssue] 🔄 VideoItem re-render" logs - with this fix,
  // the first item should NOT re-render on every query refetch.
  // ============================================================================

  // Only re-render if meaningful props have changed
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.location === nextProps.video.location &&
    prevProps.video.thumbUrl === nextProps.video.thumbUrl &&
    (prevProps.video as any).name === (nextProps.video as any).name && // Check variant name changes
    (prevProps.video as any).derivedCount === (nextProps.video as any).derivedCount && // Check variant count changes
    prevProps.index === nextProps.index &&
    prevProps.originalIndex === nextProps.originalIndex &&
    prevProps.shouldPreload === nextProps.shouldPreload &&
    prevProps.isMobile === nextProps.isMobile &&
    prevProps.projectAspectRatio === nextProps.projectAspectRatio &&
    prevProps.projectId === nextProps.projectId &&
    prevProps.deletingVideoId === nextProps.deletingVideoId &&
    prevProps.selectedVideoForDetails?.id === nextProps.selectedVideoForDetails?.id &&
    prevProps.showTaskDetailsModal === nextProps.showTaskDetailsModal &&
    // Handler functions should be stable via useCallback, so reference equality is fine
    prevProps.onLightboxOpen === nextProps.onLightboxOpen &&
    prevProps.onMobileTap === nextProps.onMobileTap &&
    prevProps.onMobilePreload === nextProps.onMobilePreload &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onHoverStart === nextProps.onHoverStart &&
    prevProps.onHoverEnd === nextProps.onHoverEnd &&
    prevProps.onMobileModalOpen === nextProps.onMobileModalOpen &&
    prevProps.onApplySettingsFromTask === nextProps.onApplySettingsFromTask &&
    prevProps.deleteTooltip === nextProps.deleteTooltip
  );
});
