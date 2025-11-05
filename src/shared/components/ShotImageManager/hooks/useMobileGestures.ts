import { useCallback, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { DOUBLE_TAP_THRESHOLD } from '../constants';

interface UseMobileGesturesProps {
  currentImages: GenerationRow[];
  mobileSelectedIds: string[];
  onImageReorder: (orderedIds: string[]) => void;
  setMobileSelectedIds: (fn: (prev: string[]) => string[]) => void;
  setLightboxIndex: (index: number) => void;
}

export function useMobileGestures({
  currentImages,
  mobileSelectedIds,
  onImageReorder,
  setMobileSelectedIds,
  setLightboxIndex
}: UseMobileGesturesProps) {
  const lastTouchTimeRef = useRef<number>(0);
  const lastTappedImageIdRef = useRef<string | null>(null);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);
  
  // Mobile double-tap detection
  const handleMobileTap = useCallback((id: string, index: number) => {
    // Safety check
    if (!currentImages || currentImages.length === 0 || index >= currentImages.length) {
      return;
    }
    
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTimeRef.current;
    const isSameImage = lastTappedImageIdRef.current === id;
    
    // On any tap, immediately toggle the selection state
    setMobileSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
    
    // If this tap is a double-tap, also open the lightbox
    if (timeDiff < DOUBLE_TAP_THRESHOLD && timeDiff > 10 && isSameImage) {
      const image = currentImages[index];
      if (image?.imageUrl) {
        setLightboxIndex(index);
      }
      // Reset tap tracking to prevent a third tap from also triggering
      lastTouchTimeRef.current = 0;
      lastTappedImageIdRef.current = null;
    } else {
      // It's a single tap, so just update the tracking refs
      lastTouchTimeRef.current = currentTime;
      lastTappedImageIdRef.current = id;
    }
  }, [currentImages, setMobileSelectedIds, setLightboxIndex]);
  
  // Mobile move-here functionality
  const handleMobileMoveHere = useCallback(async (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) {
      return;
    }
    
    ),
      targetIndex,
      currentImagesLength: currentImages.length
    });
    
    try {
      // Get the selected images and their current indices
      const selectedItems = mobileSelectedIds.map(id => {
        const image = currentImages.find(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        const index = currentImages.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        return { id, image, currentIndex: index };
      }).filter(item => item.image && item.currentIndex !== -1);
      
      if (selectedItems.length === 0) {
        return;
      }
      
      // Sort by current index to maintain relative order
      selectedItems.sort((a, b) => a.currentIndex - b.currentIndex);
      
      // Create new order by moving selected items to target position
      const newOrder = [...currentImages];
      
      // Remove selected items from their current positions (in reverse order to maintain indices)
      selectedItems.reverse().forEach(item => {
        newOrder.splice(item.currentIndex, 1);
      });
      
      // Insert selected items at target position (maintaining their relative order)
      selectedItems.reverse().forEach((item, i) => {
        newOrder.splice(targetIndex + i, 0, item.image!);
      });
      
      // Create ordered IDs array for the unified system
      const orderedIds = newOrder.map(img => (img as any).shotImageEntryId ?? (img as any).id);
      
      .shotImageEntryId ?? (img as any).id).substring(0, 8)),
        newOrder: orderedIds.map(id => id.substring(0, 8)),
        movedItems: selectedItems.map(item => item.id.substring(0, 8)),
        targetIndex
      });
      
      // Use the unified position system
      await onImageReorder(orderedIds);
      
      // Clear selection after successful reorder
      setMobileSelectedIds(() => []);
      
      } catch (error) {
      console.error('[MobileReorder] ❌ Mobile reorder failed:', error);
    }
  }, [mobileSelectedIds, currentImages, onImageReorder, setMobileSelectedIds]);
  
  return {
    handleMobileTap,
    handleMobileMoveHere
  };
}

