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

  // Update local state when media prop changes (e.g. after refetch)
  // Only if NOT currently editing, to avoid overwriting user input
  useEffect(() => {
    if (!isEditingGenerationName) {
      setGenerationName(media.name || '');
    }
  }, [media.name, isEditingGenerationName]);

  // Handle updating generation name
  const handleGenerationNameChange = (newName: string) => {
    // Update local state immediately
    setGenerationName(newName);
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set new timeout for debounce (1000ms)
    timeoutRef.current = setTimeout(() => {
      console.log('[VariantName] Triggering save for:', newName);
      updateGenerationNameMutation.mutate({ 
        id: media.id, 
        name: newName 
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

