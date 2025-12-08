import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { QuickCreateSuccess, ShotOption } from '../types';
import { useCreateShotWithImage } from '@/shared/hooks/useShots';
import { inheritSettingsForNewShot } from '@/shared/lib/shotSettingsInheritance';

export interface UseShotCreationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  allShots: ShotOption[];
  onNavigateToShot?: (shot: any, options?: { isNewlyCreated?: boolean }) => void;
  onClose: () => void;
  onShotChange?: (shotId: string) => void;
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
  onClose,
  onShotChange,
}: UseShotCreationProps): UseShotCreationReturn => {
  const [isCreatingShot, setIsCreatingShot] = useState(false);
  const [quickCreateSuccess, setQuickCreateSuccess] = useState<QuickCreateSuccess>({
    isSuccessful: false,
    shotId: null,
    shotName: null,
    isLoading: false,
  });
  
  const createShotWithImageMutation = useCreateShotWithImage();

  // Handle quick create and add shot
  const handleQuickCreateAndAdd = useCallback(async () => {
    console.warn('[ShotSettingsInherit] 🚀 handleQuickCreateAndAdd called from ImageGallery');
    
    // CRITICAL: When viewing from ShotImagesEditor, media.id is the shot_generations.id (join table ID)
    // We need to use media.generation_id (actual generations table ID) for creating new shot associations
    const actualGenerationId = (media as any).generation_id || media.id;
    
    console.log('[VisitShotDebug] handleQuickCreateAndAdd called', {
      hasSelectedProjectId: !!selectedProjectId,
      allShotsLength: allShots.length,
      mediaId: media.id,
      generationId: (media as any).generation_id,
      actualGenerationId,
      usingGenerationIdField: !!(media as any).generation_id
    });
    
    if (!selectedProjectId) {
      console.error('[VisitShotDebug] No project selected');
      console.warn('[ShotSettingsInherit] ❌ No project selected, aborting');
      return;
    }
    
    // Generate automatic shot name
    const shotCount = allShots.length;
    const newShotName = `Shot ${shotCount + 1}`;
    
    console.warn('[ShotSettingsInherit] 📝 Creating shot:', newShotName);
    
    setIsCreatingShot(true);
    try {
      console.log('[VisitShotDebug] Creating shot WITH image using atomic operation:', {
        shotName: newShotName,
        projectId: selectedProjectId,
        generationId: actualGenerationId
      });
      
      // Use atomic database function to create shot and add image in one operation
      // This is the same approach as ImageGalleryItem
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: actualGenerationId
      });
      
      console.log('[VisitShotDebug] Atomic shot creation result:', result);
      
      // Apply standardized settings inheritance
      if (result.shotId && selectedProjectId) {
        await inheritSettingsForNewShot({
          newShotId: result.shotId,
          projectId: selectedProjectId,
          shots: allShots as any[]
        });
      }
      
      // Update the selected shot ID (same as ImageGalleryItem does)
      if (result.shotId && onShotChange) {
        console.log('[VisitShotDebug] Updating selected shot ID to:', result.shotId);
        onShotChange(result.shotId);
      }
      
      // Set success state with loading=true initially while cache syncs
      setQuickCreateSuccess({
        isSuccessful: true,
        shotId: result.shotId,
        shotName: result.shotName,
        isLoading: true
      });
      
      // After a brief delay for cache to sync, show the Visit button as ready
      setTimeout(() => {
        setQuickCreateSuccess(prev => 
          prev.shotId === result.shotId 
            ? { ...prev, isLoading: false } 
            : prev
        );
      }, 600);
      
      // Clear success state after 5 seconds
      setTimeout(() => {
        setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null, isLoading: false });
      }, 5000);
      
    } catch (error) {
      console.error('[VisitShotDebug] Error in atomic shot creation:', error);
      toast.error('Failed to create shot and add image');
    } finally {
      setIsCreatingShot(false);
    }
  }, [selectedProjectId, allShots, media.id, (media as any).generation_id, createShotWithImageMutation, onShotChange]);

  // Handle quick create success navigation
  const handleQuickCreateSuccess = useCallback(() => {
    console.log('[VisitShotDebug] 2. MediaLightbox handleQuickCreateSuccess called', {
      quickCreateSuccess,
      hasOnNavigateToShot: !!onNavigateToShot,
      allShotsCount: allShots?.length || 0,
      timestamp: Date.now()
    });

    if (quickCreateSuccess.shotId && onNavigateToShot) {
      // Try to find the shot in the list first (we only have id/name here)
      const shotOption = allShots?.find(s => s.id === quickCreateSuccess.shotId);
      
      console.log('[VisitShotDebug] 3. MediaLightbox shot search result', {
        shotId: quickCreateSuccess.shotId,
        foundInList: !!shotOption,
        shotOption: shotOption ? { id: shotOption.id, name: shotOption.name } : null,
        allShots: allShots?.map(s => ({ id: s.id, name: s.name })) || []
      });

      // Close the lightbox first
      onClose();

      if (shotOption) {
        // Build a minimal Shot object compatible with navigation
        const minimalShot = {
          id: shotOption.id,
          name: shotOption.name,
          images: [],
          position: 0,
        };
        console.log('[VisitShotDebug] 4a. MediaLightbox calling onNavigateToShot with found shot', minimalShot);
        onNavigateToShot(minimalShot, { isNewlyCreated: true });
      } else {
        // Fallback when shot not in list yet
        const minimalShot = {
          id: quickCreateSuccess.shotId,
          name: quickCreateSuccess.shotName || 'Shot',
          images: [],
          position: 0,
        };
        console.log('[VisitShotDebug] 4b. MediaLightbox calling onNavigateToShot with fallback shot', minimalShot);
        onNavigateToShot(minimalShot, { isNewlyCreated: true });
      }
    } else {
      console.log('[VisitShotDebug] 4c. MediaLightbox not navigating - missing requirements', {
        hasShotId: !!quickCreateSuccess.shotId,
        hasOnNavigateToShot: !!onNavigateToShot
      });
    }
    
    // Clear the success state
    console.log('[VisitShotDebug] 5. MediaLightbox clearing success state');
    setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null, isLoading: false });
  }, [quickCreateSuccess, onNavigateToShot, onClose, allShots]);

  return {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  };
};

