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
    .shotImageEntryId,
      shot_generation_id: (media as any).shot_generation_id,
      starredProp: starred,
      mediaStarred: (media as any).starred,
      hasStarredProp: typeof starred === 'boolean',
      hasMediaStarred: typeof (media as any).starred === 'boolean',
      allMediaKeys: Object.keys(media),
      fullMediaObject: media,
      timestamp: Date.now()
    });
    
    if (typeof starred === 'boolean') {
      return starred;
    }
    // @ts-ignore – media may include starred even if not in type
    if (typeof (media as any).starred === 'boolean') {
      .starred);
      return (media as any).starred;
    }
    ');
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
    
    });
    
    // Only sync if:
    // 1. Media changed (navigated to different image), OR
    // 2. Haven't recently mutated (prevents stale prop from overriding optimistic update)
    if (willSync) {
      setLocalStarred(initialStarred);
    } else {
      }
    
    prevMediaIdRef.current = media.id;
  }, [initialStarred, media.id, localStarred]);

  // Handler that records mutation time to prevent stale prop syncing
  const handleToggleStar = () => {
    const newStarred = !localStarred;
    .shotImageEntryId,
      shot_generation_id: (media as any).shot_generation_id,
      oldLocalStarred: localStarred,
      newStarred,
      willMutateWithId: media.id,
      timestamp: Date.now()
    });
    
    // Record mutation time BEFORE updating state
    lastMutationTimeRef.current = Date.now();
    // Optimistically update UI
    setLocalStarred(newStarred);
    // Trigger mutation
    toggleStarMutation.mutate({ id: media.id, starred: newStarred, shotId });
  };

  return {
    localStarred,
    setLocalStarred,
    toggleStarMutation,
    handleToggleStar,
  };
};

