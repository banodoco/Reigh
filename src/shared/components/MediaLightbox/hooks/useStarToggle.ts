import { useState, useEffect, useMemo, useRef } from 'react';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { GenerationRow } from '@/types/shots';

export interface UseStarToggleProps {
  media: GenerationRow;
  starred?: boolean;
  shotId?: string;
}

export interface UseStarToggleReturn {
  localStarred: boolean;
  setLocalStarred: React.Dispatch<React.SetStateAction<boolean>>;
  toggleStarMutation: any; // From useToggleGenerationStar
  handleToggleStar: () => void;
}

/**
 * Hook for managing star toggle state
 * Maintains local state for immediate UI updates while syncing with server
 */
export const useStarToggle = ({ media, starred, shotId }: UseStarToggleProps): UseStarToggleReturn => {
  const toggleStarMutation = useToggleGenerationStar();
  
  // Track when we last mutated to prevent stale prop syncing
  const lastMutationTimeRef = useRef<number>(0);
  const prevMediaIdRef = useRef<string>(media.id);

  // Local starred state to ensure UI reflects updates immediately even if parent data is stale
  const initialStarred = useMemo(() => {
    // Prefer explicit prop, fall back to media.starred if available
    console.log('[StarPersist] 📥 Calculating initialStarred from props', {
      mediaId: media.id, // shot_generations.id
      shotId,
      generation_id: (media as any).generation_id,
      starredProp: starred,
      mediaStarred: (media as any).starred,
      hasStarredProp: typeof starred === 'boolean',
      hasMediaStarred: typeof (media as any).starred === 'boolean',
      allMediaKeys: Object.keys(media),
      fullMediaObject: media,
      timestamp: Date.now()
    });
    
    if (typeof starred === 'boolean') {
      console.log('[StarPersist] 📥 Using starred prop:', starred);
      return starred;
    }
    // @ts-ignore – media may include starred even if not in type
    if (typeof (media as any).starred === 'boolean') {
      console.log('[StarPersist] 📥 Using media.starred:', (media as any).starred);
      return (media as any).starred;
    }
    console.log('[StarPersist] 📥 Defaulting to false (no starred data)');
    return false;
  }, [starred, media, shotId]);

  const [localStarred, setLocalStarred] = useState<boolean>(initialStarred);

  // Keep local state in sync when parent updates (e.g., after query refetch or navigating to different image)
  // BUT: Don't sync if we recently performed a mutation (prevents stale prop from resetting UI)
  useEffect(() => {
    const mediaChanged = prevMediaIdRef.current !== media.id;
    const timeSinceMutation = Date.now() - lastMutationTimeRef.current;
    const recentlyMutated = timeSinceMutation < 2000; // 2 second grace period
    const willSync = mediaChanged || !recentlyMutated;
    
    console.log('[StarPersist] 🔄 Sync effect triggered', {
      mediaId: media.id,
      oldLocalStarred: localStarred,
      newInitialStarred: initialStarred,
      mediaChanged,
      recentlyMutated,
      timeSinceMutation,
      gracePeriod: 2000,
      willSync,
      reason: !willSync 
        ? 'Grace period active - blocking sync'
        : mediaChanged 
          ? 'Media changed - syncing' 
          : 'Grace period expired - syncing',
      timestamp: Date.now()
    });
    
    // Only sync if:
    // 1. Media changed (navigated to different image), OR
    // 2. Haven't recently mutated (prevents stale prop from overriding optimistic update)
    if (willSync) {
      console.log('[StarPersist] 🔄 Syncing localStarred from prop', {
        mediaId: media.id,
        from: localStarred,
        to: initialStarred
      });
      setLocalStarred(initialStarred);
    } else {
      console.log('[StarPersist] 🛡️ Grace period: Blocked sync to preserve user action', {
        mediaId: media.id,
        timeSinceMutation,
        gracePeriod: 2000,
        localStarred,
        propValue: initialStarred
      });
    }
    
    prevMediaIdRef.current = media.id;
  }, [initialStarred, media.id, localStarred]);

  // Handler that records mutation time to prevent stale prop syncing
  const handleToggleStar = () => {
    const newStarred = !localStarred;
    console.log('[StarPersist] 🖱️ Star button clicked in UI', {
      mediaId: media.id, // shot_generations.id
      shotId,
      generation_id: (media as any).generation_id,
      oldLocalStarred: localStarred,
      newStarred,
      willMutateWithId: media.id,
      timestamp: Date.now()
    });
    
    // Record mutation time BEFORE updating state
    lastMutationTimeRef.current = Date.now();
    console.log('[StarPersist] 🕐 Recorded mutation timestamp for grace period', {
      mediaId: media.id,
      mutationTime: lastMutationTimeRef.current
    });
    
    // Optimistically update UI
    setLocalStarred(newStarred);
    console.log('[StarPersist] 🎨 Updated local UI state optimistically', {
      mediaId: media.id,
      newLocalStarred: newStarred
    });
    
    // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
    // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
    // For variants, generation_id is in metadata.generation_id (the parent generation)
    const actualGenerationId = (media as any).generation_id || (media as any).metadata?.generation_id || media.id;
    
    // Trigger mutation
    console.log('[StarPersist] 🚀 Triggering database mutation', {
      mutatingGenerationId: actualGenerationId,
      starred: newStarred,
      shotId,
      note: 'Passing shotId so mutation can target the exact all-shot-generations cache'
    });
    toggleStarMutation.mutate({ id: actualGenerationId, starred: newStarred, shotId });
  };

  return {
    localStarred,
    setLocalStarred,
    toggleStarMutation,
    handleToggleStar,
  };
};

