/**
 * Unified Shot Creation Hook
 * 
 * Single source of truth for ALL shot creation in the app.
 * Handles:
 * - Empty shots (name only)
 * - Shots with a generation (atomic RPC)
 * - Shots with files (upload + add)
 * 
 * Automatically handles:
 * - Settings inheritance (runs in background)
 * - Last affected shot tracking
 * - Optimistic UI events (skeleton display)
 * - Error handling with cleanup
 * 
 * @see CLAUDE.md - Settings/persistence → settings_system.md
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { 
  useCreateShot, 
  useCreateShotWithImage, 
  useHandleExternalImageDrop 
} from '@/shared/hooks/useShots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { inheritSettingsForNewShot } from '@/shared/lib/shotSettingsInheritance';
import { GenerationRow, Shot } from '@/types/shots';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

export interface ShotCreationResult {
  /** The created shot's ID */
  shotId: string;
  /** The created shot's name */
  shotName: string;
  /** The full shot object (if available) */
  shot?: Shot;
  /** IDs of generations added to the shot */
  generationIds?: string[];
}

export interface CreateShotOptions {
  /** Shot name (auto-generated if not provided) */
  name?: string;
  
  /** 
   * Generation ID to add to the shot atomically.
   * If provided, uses the atomic RPC for better performance.
   */
  generationId?: string;

  /**
   * Optional preview data for the generation being added (used for optimistic UI).
   * When provided, we can update the shots cache immediately without waiting for a full refetch.
   */
  generationPreview?: {
    imageUrl?: string;
    thumbUrl?: string;
    type?: string | null;
    location?: string | null;
  };
  
  /**
   * Files to upload and add to the shot.
   * Uses the file upload flow which handles cropping.
   */
  files?: File[];
  
  /** Aspect ratio for the shot (optional) */
  aspectRatio?: string;
  
  /**
   * Whether to inherit settings from the last active shot.
   * Runs in background to avoid blocking UI.
   * @default true
   */
  inheritSettings?: boolean;
  
  /**
   * Whether to update the "last affected shot" tracker.
   * Used by GenerationsPane to default to the most recent shot.
   * @default true
   */
  updateLastAffected?: boolean;
  
  /**
   * Whether to dispatch skeleton events for optimistic UI.
   * @default true
   */
  dispatchSkeletonEvents?: boolean;
  
  /**
   * Whether to switch sort mode to "newest" after creation.
   * @default false
   */
  switchToNewestSort?: boolean;
  
  /**
   * Callback for file upload progress.
   * Only used when files are provided.
   */
  onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  
  /**
   * Callback after successful shot creation.
   * Called after all side effects (inheritance, lastAffected) are applied.
   */
  onSuccess?: (result: ShotCreationResult) => void;
}

export interface UseShotCreationReturn {
  /**
   * Create a new shot with optional generation or files.
   * 
   * @example
   * // Empty shot
   * await createShot({ name: 'Shot 1' });
   * 
   * // Shot with generation (atomic)
   * await createShot({ generationId: '...' });
   * 
   * // Shot with files
   * await createShot({ files: [...] });
   */
  createShot: (options?: CreateShotOptions) => Promise<ShotCreationResult | null>;
  
  /** Whether any shot creation is in progress */
  isCreating: boolean;
  
  /** The last successfully created shot */
  lastCreatedShot: { id: string; name: string } | null;
  
  /** Clear the last created shot state */
  clearLastCreated: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useShotCreation(): UseShotCreationReturn {
  const { selectedProjectId } = useProject();
  const { shots } = useShots();
  const { setLastAffectedShotId } = useLastAffectedShot();
  const queryClient = useQueryClient();
  
  // Mutations
  const createShotMutation = useCreateShot();
  const createShotWithImageMutation = useCreateShotWithImage();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  
  // State
  const [isCreating, setIsCreating] = useState(false);
  const [lastCreatedShot, setLastCreatedShot] = useState<{ id: string; name: string } | null>(null);
  
  const clearLastCreated = useCallback(() => {
    setLastCreatedShot(null);
  }, []);
  
  /**
   * Generate automatic shot name based on current shot count
   */
  const generateShotName = useCallback(() => {
    const count = shots?.length ?? 0;
    return `Shot ${count + 1}`;
  }, [shots]);
  
  /**
   * Apply post-creation side effects
   */
  const applyPostCreationEffects = useCallback((
    result: ShotCreationResult,
    options: CreateShotOptions
  ) => {
    const {
      inheritSettings = true,
      updateLastAffected = true,
    } = options;
    
    // 1. Update last affected shot
    if (updateLastAffected) {
      setLastAffectedShotId(result.shotId);
    }
    
    // 2. Apply settings inheritance (background, don't await)
    if (inheritSettings && selectedProjectId) {
      inheritSettingsForNewShot({
        newShotId: result.shotId,
        projectId: selectedProjectId,
        shots: shots || [],
      });
    }
    
    // 3. Update last created shot state
    setLastCreatedShot({ id: result.shotId, name: result.shotName });
    
    console.log('[useShotCreation] Post-creation effects applied:', {
      shotId: result.shotId.substring(0, 8),
      inheritSettings,
      updateLastAffected,
    });
  }, [selectedProjectId, shots, setLastAffectedShotId]);
  
  /**
   * Dispatch optimistic skeleton event
   */
  const dispatchSkeletonEvent = useCallback((imageCount: number = 1) => {
    window.dispatchEvent(new CustomEvent('shot-pending-create', {
      detail: { imageCount }
    }));
  }, []);
  
  /**
   * Clear optimistic skeleton event on error
   */
  const clearSkeletonEvent = useCallback(() => {
    window.dispatchEvent(new CustomEvent('shot-pending-create-clear'));
  }, []);
  
  /**
   * Main shot creation function
   */
  const createShot = useCallback(async (
    options: CreateShotOptions = {}
  ): Promise<ShotCreationResult | null> => {
    if (!selectedProjectId) {
      console.warn('[useShotCreation] No project selected');
      toast.error('No project selected');
      return null;
    }
    
    const {
      name,
      generationId,
      generationPreview,
      files,
      aspectRatio,
      dispatchSkeletonEvents = true,
      onProgress,
    } = options;
    
    const shotName = name || generateShotName();
    
    console.log('[useShotCreation] Starting shot creation:', {
      shotName,
      hasGenerationId: !!generationId,
      hasFiles: !!files?.length,
      projectId: selectedProjectId.substring(0, 8),
    });
    
    // Dispatch skeleton event before starting
    if (dispatchSkeletonEvents) {
      const imageCount = files?.length || (generationId ? 1 : 0);
      if (imageCount > 0) {
        dispatchSkeletonEvent(imageCount);
      }
    }
    
    setIsCreating(true);
    
    try {
      let result: ShotCreationResult;
      
      // ========================================
      // PATH 1: Shot with Generation (Atomic RPC)
      // ========================================
      if (generationId && !files?.length) {
        console.log('[useShotCreation] Using atomic shot+image creation');
        
        const rpcResult = await createShotWithImageMutation.mutateAsync({
          projectId: selectedProjectId,
          shotName,
          generationId,
        });

        // Optimistic cache update:
        // The atomic RPC doesn't (currently) insert into the heavy `useListShots` cache,
        // which makes the UI feel slow while it waits for a full shots refetch.
        // Patch the shots cache immediately so:
        // - the new shot appears right away
        // - the pending skeleton transfers to the real shot card
        // - selectors can resolve the new shot name immediately
        if (rpcResult?.shotId) {
          const newShotId = rpcResult.shotId;
          const newShotName = rpcResult.shotName || shotName;
          const shotGenerationId = rpcResult.shotGenerationId;

          const updateShotCache = (oldShots: Shot[] = []) => {
            if (oldShots.some(s => s.id === newShotId)) return oldShots;

            const maxPosition = oldShots.reduce((max, s) => {
              const pos = typeof s.position === 'number' ? s.position : 0;
              return Math.max(max, pos);
            }, 0);

            const optimisticImage: GenerationRow | null = shotGenerationId ? {
              id: shotGenerationId,
              generation_id: generationId,
              imageUrl: generationPreview?.imageUrl,
              thumbUrl: generationPreview?.thumbUrl,
              type: generationPreview?.type ?? undefined,
              location: generationPreview?.location ?? generationPreview?.imageUrl ?? undefined,
              timeline_frame: 0,
              createdAt: new Date().toISOString(),
              isOptimistic: true,
            } : null;

            const newShot: Shot = {
              id: newShotId,
              name: newShotName,
              images: optimisticImage ? [optimisticImage] : [],
              project_id: selectedProjectId,
              position: maxPosition + 1,
              created_at: new Date().toISOString(),
            };

            return [...oldShots, newShot];
          };

          // Keep the common cache variants in sync (ShotsContext uses maxImagesPerShot=0)
          queryClient.setQueryData<Shot[]>(['shots', selectedProjectId, 0], updateShotCache);
          queryClient.setQueryData<Shot[]>(['shots', selectedProjectId, 5], updateShotCache);
          queryClient.setQueryData<Shot[]>(['shots', selectedProjectId], updateShotCache);
          queryClient.setQueryData(['shot', newShotId], (old: Shot | undefined) => old ?? ({
            id: newShotId,
            name: newShotName,
            images: [],
            project_id: selectedProjectId,
            position: (shots?.reduce((max, s) => Math.max(max, s.position || 0), 0) ?? 0) + 1,
            created_at: new Date().toISOString(),
          } as Shot));
        }
        
        result = {
          shotId: rpcResult.shotId,
          shotName: rpcResult.shotName,
          generationIds: [generationId],
        };
      }
      // ========================================
      // PATH 2: Shot with Files (Upload Flow)
      // ========================================
      else if (files?.length) {
        console.log('[useShotCreation] Creating shot then uploading files (preserves name)');

        // 1) Create the shot first so we can preserve the caller-provided name
        const created = await createShotMutation.mutateAsync({
          name: shotName,
          projectId: selectedProjectId,
          aspectRatio: aspectRatio || undefined,
          shouldSelectAfterCreation: false,
        });

        const newShotId = created?.shot?.id;
        if (!newShotId) {
          throw new Error('Shot creation failed - no ID returned');
        }

        // 2) Upload and add files to that shot (cropping logic remains inside this mutation)
        const uploadResult = await handleExternalImageDropMutation.mutateAsync({
          imageFiles: files,
          targetShotId: newShotId, // Add to newly created shot
          currentProjectQueryKey: selectedProjectId,
          currentShotCount: shots?.length ?? 0,
          onProgress,
        });

        if (!uploadResult?.shotId) {
          // Note: this mutation can return null if no files were successfully processed
          throw new Error('File upload failed - no images processed');
        }

        result = {
          shotId: newShotId,
          shotName: created.shot.name || shotName,
          shot: created.shot,
          generationIds: uploadResult.generationIds,
        };
      }
      // ========================================
      // PATH 3: Empty Shot
      // ========================================
      else {
        console.log('[useShotCreation] Creating empty shot');
        
        const createResult = await createShotMutation.mutateAsync({
          name: shotName,
          projectId: selectedProjectId,
          aspectRatio: aspectRatio || undefined,
          shouldSelectAfterCreation: false,
        });
        
        if (!createResult?.shot?.id) {
          throw new Error('Shot creation failed - no ID returned');
        }
        
        result = {
          shotId: createResult.shot.id,
          shotName: createResult.shot.name || shotName,
          shot: createResult.shot,
        };
      }
      
      // Apply post-creation effects
      applyPostCreationEffects(result, options);
      
      // Call custom success handler if provided
      options.onSuccess?.(result);
      
      console.log('[useShotCreation] Shot creation successful:', {
        shotId: result.shotId.substring(0, 8),
        shotName: result.shotName,
      });
      
      return result;
      
    } catch (error) {
      console.error('[useShotCreation] Shot creation failed:', error);
      
      // Clear skeleton on error
      if (dispatchSkeletonEvents) {
        clearSkeletonEvent();
      }
      
      toast.error(`Failed to create shot: ${(error as Error).message}`);
      return null;
      
    } finally {
      setIsCreating(false);
    }
  }, [
    selectedProjectId,
    shots,
    generateShotName,
    createShotMutation,
    createShotWithImageMutation,
    handleExternalImageDropMutation,
    applyPostCreationEffects,
    dispatchSkeletonEvent,
    clearSkeletonEvent,
    queryClient,
  ]);
  
  return {
    createShot,
    isCreating,
    lastCreatedShot,
    clearLastCreated,
  };
}

export default useShotCreation;
