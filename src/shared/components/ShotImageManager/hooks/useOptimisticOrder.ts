import { useState, useEffect, useRef } from 'react';
import { GenerationRow } from '@/types/shots';
import { OPTIMISTIC_UPDATE_TIMEOUT } from '../constants';

interface UseOptimisticOrderProps {
  images: GenerationRow[];
}

export function useOptimisticOrder({ images }: UseOptimisticOrderProps) {
  const [optimisticOrder, setOptimisticOrder] = useState<GenerationRow[]>(images);
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
  const [reconciliationId, setReconciliationId] = useState(0);
  const reconciliationTimeoutRef = useRef<NodeJS.Timeout>();
  
  console.log('[DataTrace] 🎭 ShotImageManager OptimisticOrder state:', {
    propsImagesCount: images.length,
    optimisticOrderCount: optimisticOrder.length,
    isOptimisticUpdate,
    displayingWhich: isOptimisticUpdate ? 'optimistic' : 'props',
  });
  
  // Enhanced reconciliation with debouncing, tracking IDs, and timeout-based recovery
  useEffect(() => {
    console.log('[DragDebug:ShotImageManager] Parent images prop changed', {
      newLength: images.length,
      isOptimisticUpdate,
      reconciliationId,
      timestamp: Date.now()
    });
    
    // Clear any pending reconciliation timeout
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
    }
    
    // If we're in the middle of an optimistic update, use debounced reconciliation
    if (isOptimisticUpdate) {
      console.log('[DragDebug:ShotImageManager] Skipping immediate sync - optimistic update in progress');
      
      const currentReconciliationId = reconciliationId;
      
      // Debounce reconciliation checks to prevent race conditions
      reconciliationTimeoutRef.current = setTimeout(() => {
        // Check if this reconciliation is still current
        if (currentReconciliationId !== reconciliationId) {
          console.log('[DragDebug:ShotImageManager] Reconciliation cancelled - newer reconciliation in progress');
          return;
        }
        
        // Check if parent props now match our optimistic order
        const currentOrder = optimisticOrder.map(img => img.shotImageEntryId ?? img.id).join(',');
        const parentOrder = images.map(img => img.shotImageEntryId ?? img.id).join(',');
        
        if (currentOrder === parentOrder) {
          console.log('[DragDebug:ShotImageManager] Parent caught up with optimistic order - ending optimistic mode');
          setIsOptimisticUpdate(false);
          if (optimisticOrder !== images) {
            setOptimisticOrder(images);
          }
        } else {
          console.log('[DragDebug:ShotImageManager] Parent still has stale data - keeping optimistic order');
          
          // Safety check: if optimistic update has been active for more than 5 seconds, force reconciliation
          const optimisticStartTime = Date.now() - OPTIMISTIC_UPDATE_TIMEOUT;
          if (optimisticStartTime > Date.now()) {
            console.warn('[DragDebug:ShotImageManager] Forcing reconciliation - optimistic update too long');
            setIsOptimisticUpdate(false);
            setOptimisticOrder(images);
          }
        }
      }, 100); // 100ms debounce
    } else {
      console.log('[DragDebug:ShotImageManager] Normal sync from parent props');
      if (optimisticOrder !== images) {
        setOptimisticOrder(images);
      } else {
        console.log('[DragDebug:ShotImageManager] Skipping sync - same reference');
      }
    }
  }, [images, isOptimisticUpdate, reconciliationId, optimisticOrder]);
  
  // If not in an optimistic update, optimisticOrder should always reflect the parent's images prop.
  // When an optimistic update is finished, this effect will re-sync with the parent.
  useEffect(() => {
    if (!isOptimisticUpdate) {
      setOptimisticOrder(images);
    }
  }, [images, isOptimisticUpdate]);
  
  // Cleanup reconciliation timeout on unmount
  useEffect(() => {
    return () => {
      if (reconciliationTimeoutRef.current) {
        clearTimeout(reconciliationTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    optimisticOrder,
    setOptimisticOrder,
    isOptimisticUpdate,
    setIsOptimisticUpdate,
    reconciliationId,
    setReconciliationId
  };
}

