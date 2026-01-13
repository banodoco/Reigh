import { useState, useCallback } from 'react';
import { useToast } from '@/shared/hooks/use-toast';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useShotCreation } from '@/shared/hooks/useShotCreation';

export interface QuickCreateSuccessState {
  isSuccessful: boolean;
  shotId: string | null;
  shotName: string | null;
  isLoading?: boolean;
}

export interface ShotOption {
  id: string;
  name: string;
}

export interface UseQuickShotCreateProps {
  /** The generation ID to add to the new shot */
  generationId: string;
  /** Optional preview data for optimistic UI (helps shots list feel instant) */
  generationPreview?: {
    imageUrl?: string;
    thumbUrl?: string;
    type?: string | null;
    location?: string | null;
  };
  /** Available shots (used for naming and navigation) */
  shots: ShotOption[];
  /** Callback when shot selection should change (to select the new shot) */
  onShotChange?: (shotId: string) => void;
  /** Callback to close parent UI (lightbox, modal, etc.) before navigation */
  onClose?: () => void;
  /** Optional callback when loading starts (for external state sync) */
  onLoadingStart?: () => void;
  /** Optional callback when loading ends (for external state sync) */
  onLoadingEnd?: () => void;
}

export interface UseQuickShotCreateReturn {
  /** Whether shot creation is in progress */
  isCreatingShot: boolean;
  /** Success state for showing "Visit" button */
  quickCreateSuccess: QuickCreateSuccessState;
  /** Main function to create shot and add image atomically. Optionally pass a shot name. */
  handleQuickCreateAndAdd: (shotName?: string) => Promise<void>;
  /** Navigate to the newly created shot */
  handleQuickCreateSuccess: () => void;
  /** Clear the success state manually */
  clearQuickCreateSuccess: () => void;
}

/**
 * Hook for quick shot creation with image (UI wrapper around useShotCreation)
 * 
 * Used by:
 * - ShotSelectorWithAdd
 * - ImageGalleryItem
 * - MediaLightbox (via useShotCreation wrapper)
 * 
 * This is a thin wrapper that adds:
 * - Success state management (for "Visit Shot" button)
 * - Navigation handling
 * - External loading state sync
 * 
 * Core shot creation logic is delegated to useShotCreation.
 */
export const useQuickShotCreate = ({
  generationId,
  generationPreview,
  shots,
  onShotChange,
  onClose,
  onLoadingStart,
  onLoadingEnd,
}: UseQuickShotCreateProps): UseQuickShotCreateReturn => {
  const { toast } = useToast();
  const { navigateToShot } = useShotNavigation();
  const { createShot, isCreating } = useShotCreation();

  const [quickCreateSuccess, setQuickCreateSuccess] = useState<QuickCreateSuccessState>({
    isSuccessful: false,
    shotId: null,
    shotName: null,
    isLoading: false,
  });

  const clearQuickCreateSuccess = useCallback(() => {
    setQuickCreateSuccess({
      isSuccessful: false,
      shotId: null,
      shotName: null,
      isLoading: false,
    });
  }, []);

  const handleQuickCreateAndAdd = useCallback(async (shotName?: string) => {
    console.log('[useQuickShotCreate] Starting quick shot creation:', {
      generationId: generationId?.substring(0, 8),
      shotName: shotName || '(auto)',
    });

    onLoadingStart?.();
    
    try {
      // Use unified shot creation hook
      const result = await createShot({
        generationId,
        generationPreview,
        // Use provided name or let useShotCreation auto-generate
        name: shotName || undefined,
        // Settings inheritance and lastAffectedShot are handled automatically
      });

      if (!result) {
        // Error already shown by useShotCreation
        return;
      }

      console.log('[useQuickShotCreate] Shot creation successful:', result);

      // Select the newly created shot in the dropdown
      onShotChange?.(result.shotId);

      // Set success state with loading=true initially while cache syncs
      setQuickCreateSuccess({
        isSuccessful: true,
        shotId: result.shotId,
        shotName: result.shotName,
        isLoading: true,
      });

      // After a brief delay for UI/cache to settle, show the Visit button as ready
      setTimeout(() => {
        setQuickCreateSuccess(prev =>
          prev.shotId === result.shotId
            ? { ...prev, isLoading: false }
            : prev
        );
      }, 150);

      // Clear success state after 5 seconds
      setTimeout(() => {
        clearQuickCreateSuccess();
      }, 5000);

    } catch (error) {
      console.error('[useQuickShotCreate] Error:', error);
      toast({
        title: "Error",
        description: "Failed to create shot and add image. Please try again.",
        variant: "destructive",
      });
    } finally {
      onLoadingEnd?.();
    }
  }, [
    generationId,
    generationPreview,
    createShot,
    onShotChange,
    onLoadingStart,
    onLoadingEnd,
    toast,
    clearQuickCreateSuccess,
  ]);

  const handleQuickCreateSuccess = useCallback(() => {
    if (!quickCreateSuccess.shotId) return;

    // Close parent UI before navigating (if callback provided)
    onClose?.();

    // Try to find the shot in the list first
    const shot = shots.find(s => s.id === quickCreateSuccess.shotId);
    
    if (shot) {
      // Shot found in list
      navigateToShot({
        id: shot.id,
        name: shot.name,
        images: [],
        position: 0,
      }, { isNewlyCreated: true });
    } else {
      // Shot not in list yet, navigate with stored data
      console.log('[useQuickShotCreate] Shot not in list yet, navigating with stored data');
      navigateToShot({
        id: quickCreateSuccess.shotId,
        name: quickCreateSuccess.shotName || 'Shot',
        images: [],
        position: 0,
      }, { isNewlyCreated: true });
    }

    // Clear the success state
    clearQuickCreateSuccess();
  }, [quickCreateSuccess, shots, navigateToShot, onClose, clearQuickCreateSuccess]);

  return {
    isCreatingShot: isCreating,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
    clearQuickCreateSuccess,
  };
};

export default useQuickShotCreate;
