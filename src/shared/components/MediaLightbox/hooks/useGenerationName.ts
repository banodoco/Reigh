import { useState, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { useUpdateGenerationName } from '@/shared/hooks/useGenerations';

export interface UseGenerationNameProps {
  media: GenerationRow;
  selectedProjectId: string | null;
}

export interface UseGenerationNameReturn {
  generationName: string;
  isEditingGenerationName: boolean;
  isUpdatingGenerationName: boolean;
  setGenerationName: (name: string) => void;
  setIsEditingGenerationName: (isEditing: boolean) => void;
  handleGenerationNameChange: (newName: string) => void;
}

/**
 * Hook for managing generation (variant) name editing
 * Handles state and database updates for generation names
 */
export const useGenerationName = ({
  media,
  selectedProjectId,
}: UseGenerationNameProps): UseGenerationNameReturn => {
  // Initialize with media.name, defaulting to empty string if undefined
  const [generationName, setGenerationName] = useState<string>(media.name || '');
  const [isEditingGenerationName, setIsEditingGenerationName] = useState(false);
  
  // Use the mutation hook which handles optimistic updates and cache invalidation
  const updateGenerationNameMutation = useUpdateGenerationName();
  const isUpdatingGenerationName = updateGenerationNameMutation.isPending;
  
  // Ref for debounce timeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track if we have a pending debounce operation (to prevent sync on blur)
  const isDebouncingRef = useRef(false);
  // Ref to track if we have triggered a mutation but React Query state hasn't updated yet
  const isSubmittingRef = useRef(false);

  // Debug render
  console.log('[VariantName] 🎨 Render hook:', {
    generationName,
    isEditingGenerationName,
    isUpdatingGenerationName,
    isDebouncing: isDebouncingRef.current,
    isSubmitting: isSubmittingRef.current,
    mediaName: media.name
  });

  // Update local state when media prop changes (e.g. after refetch)
  // Only if NOT currently editing, to avoid overwriting user input
  // AND only if we don't have a pending local update (debounce or mutation)
  useEffect(() => {
    const hasPendingUpdate = isDebouncingRef.current || isUpdatingGenerationName || isSubmittingRef.current;
    
    console.log('[VariantName] 🔄 useEffect sync triggered:', {
      propMediaName: media.name,
      localGenerationName: generationName,
      isEditingGenerationName,
      hasPendingUpdate,
      isDebouncing: isDebouncingRef.current,
      isUpdating: isUpdatingGenerationName,
      isSubmitting: isSubmittingRef.current,
      willUpdate: !isEditingGenerationName && !hasPendingUpdate && media.name !== generationName
    });
    
    if (!isEditingGenerationName && !hasPendingUpdate) {
      if (media.name !== generationName) {
        console.log('[VariantName] 📥 Syncing local state from props:', media.name);
        setGenerationName(media.name || '');
      }
    } else {
      console.log('[VariantName] 🛡️ Skipping sync - user is editing or update pending');
    }
  }, [media.name, isEditingGenerationName, isUpdatingGenerationName]);

  // Handle updating generation name
  const handleGenerationNameChange = (newName: string) => {
    console.log('[VariantName] ⌨️ handleGenerationNameChange:', newName);
    // Update local state immediately
    setGenerationName(newName);
    isDebouncingRef.current = true;
    
    // Clear existing timeout
    if (timeoutRef.current) {
      console.log('[VariantName] ⏱️ Clearing previous timeout');
      clearTimeout(timeoutRef.current);
    }
    
    // Set new timeout for debounce (1000ms)
    timeoutRef.current = setTimeout(() => {
      console.log('[VariantName] 💾 Debounce timer fired, triggering mutation for:', newName);
      // Mark as submitting to bridge the gap until isUpdatingGenerationName becomes true
      isSubmittingRef.current = true;
      isDebouncingRef.current = false;
      
      updateGenerationNameMutation.mutate({ 
        id: media.id, 
        name: newName 
      }, {
        onSuccess: () => console.log('[VariantName] ✅ Mutation success'),
        onError: (err) => console.error('[VariantName] ❌ Mutation error:', err),
        onSettled: () => {
          console.log('[VariantName] 🏁 Mutation settled');
          isSubmittingRef.current = false;
        }
      });
    }, 1000);
  };

  return {
    generationName,
    isEditingGenerationName,
    isUpdatingGenerationName,
    setGenerationName,
    setIsEditingGenerationName,
    handleGenerationNameChange,
  };
};

