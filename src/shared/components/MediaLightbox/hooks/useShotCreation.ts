import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { QuickCreateSuccess, ShotOption } from '../types';
import { useCreateShotWithImage } from '@/shared/hooks/useShots';

export interface UseShotCreationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  allShots: ShotOption[];
  onNavigateToShot?: (shot: any) => void;
  onClose: () => void;
}

export interface UseShotCreationReturn {
  isCreatingShot: boolean;
  quickCreateSuccess: QuickCreateSuccess;
  handleQuickCreateAndAdd: () => Promise<void>;
  handleQuickCreateSuccess: () => void;
}

/**
 * Hook for managing quick shot creation with image
 * Uses atomic database function to create shot and add image in one operation
 */
export const useShotCreation = ({
  media,
  selectedProjectId,
  allShots,
  onNavigateToShot,
}: UseShotCreationProps): UseShotCreationReturn => {
  const [isCreatingShot, setIsCreatingShot] = useState(false);
  const [quickCreateSuccess, setQuickCreateSuccess] = useState<QuickCreateSuccess>({
    isSuccessful: false,
    shotId: null,
    shotName: null,
  });
  
  const createShotWithImageMutation = useCreateShotWithImage();

  // Handle quick create and add shot
  const handleQuickCreateAndAdd = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    
    // Generate automatic shot name
    const shotCount = allShots.length;
    const newShotName = `Shot ${shotCount + 1}`;
    
    setIsCreatingShot(true);
    try {
      // Use atomic database function to create shot and add image in one operation
      // This is the same approach as ImageGalleryItem
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: media.id
      });
      
      // Set success state with real shot ID
      setQuickCreateSuccess({
        isSuccessful: true,
        shotId: result.shotId,
        shotName: result.shotName
      });
      
      // Clear success state after 5 seconds
      setTimeout(() => {
        setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null });
      }, 5000);
      
    } catch (error) {
      toast.error('Failed to create shot and add image');
    } finally {
      setIsCreatingShot(false);
    }
  }, [selectedProjectId, allShots.length, media.id, createShotWithImageMutation]);

  // Handle quick create success navigation
  const handleQuickCreateSuccess = useCallback(() => {
    });

    if (quickCreateSuccess.shotId && onNavigateToShot) {
      // Try to find the shot in the list first (we only have id/name here)
      const shotOption = allShots?.find(s => s.id === quickCreateSuccess.shotId);
      
      ) || []
      });

      if (shotOption) {
        // Build a minimal Shot object compatible with navigation
        const minimalShot = {
          id: shotOption.id,
          name: shotOption.name,
          images: [],
          position: 0,
        };
        onNavigateToShot(minimalShot);
      } else {
        // Fallback when shot not in list yet
        const minimalShot = {
          id: quickCreateSuccess.shotId,
          name: quickCreateSuccess.shotName || 'Shot',
          images: [],
          position: 0,
        };
        onNavigateToShot(minimalShot);
      }
    } else {
      }
    
    // Clear the success state
    setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null });
  }, [quickCreateSuccess, onNavigateToShot, allShots]);

  return {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  };
};

