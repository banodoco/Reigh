import { useState } from 'react';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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
  handleGenerationNameChange: (newName: string) => Promise<void>;
}

/**
 * Hook for managing generation (variant) name editing
 * Handles state and database updates for generation names
 */
export const useGenerationName = ({
  media,
  selectedProjectId,
}: UseGenerationNameProps): UseGenerationNameReturn => {
  const [generationName, setGenerationName] = useState<string>((media as any).name || '');
  const [isEditingGenerationName, setIsEditingGenerationName] = useState(false);
  const [isUpdatingGenerationName, setIsUpdatingGenerationName] = useState(false);
  
  const queryClient = useQueryClient();

  // Handle updating generation name
  const handleGenerationNameChange = async (newName: string) => {
    setGenerationName(newName);
    
    // Debounce the actual save
    if (isUpdatingGenerationName) return;
    
    setIsUpdatingGenerationName(true);
    try {
      const { error } = await supabase
        .from('generations')
        .update({ name: newName || null })
        .eq('id', media.id);

      if (error) {
        console.error('[VariantName] Error updating generation name:', error);
        toast.error('Failed to update variant name');
        throw error;
      }

      console.log('[VariantName] Successfully updated generation name:', {
        generationId: media.id.substring(0, 8),
        newName: newName || '(cleared)'
      });

      // Invalidate relevant queries to update UI
      if (selectedProjectId) {
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
      }
      
    } catch (error) {
      console.error('[VariantName] Failed to update generation name:', error);
    } finally {
      setIsUpdatingGenerationName(false);
    }
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

