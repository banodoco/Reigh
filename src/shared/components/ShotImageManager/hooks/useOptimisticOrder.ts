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
  
  // Enhanced reconciliation with debouncing, tracking IDs, and timeout-based recovery
  useEffect(() => {
    });
    
    // Clear any pending reconciliation timeout
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
    }
    
    // If we're in the middle of an optimistic update, use debounced reconciliation
    if (isOptimisticUpdate) {
      const currentReconciliationId = reconciliationId;
      
      // Debounce reconciliation checks to prevent race conditions
      reconciliationTimeoutRef.current = setTimeout(() => {
        // Check if this reconciliation is still current
        if (currentReconciliationId !== reconciliationId) {
          return;
        }
        
        // Check if parent props now match our optimistic order
        const currentOrder = optimisticOrder.map(img => img.shotImageEntryId).join(',');
        const parentOrder = images.map(img => img.shotImageEntryId).join(',');
        
        if (currentOrder === parentOrder) {
          setIsOptimisticUpdate(false);
          if (optimisticOrder !== images) {
            setOptimisticOrder(images);
          }
        } else {
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
      if (optimisticOrder !== images) {
        setOptimisticOrder(images);
      } else {
        }
    }
  }, [images, isOptimisticUpdate, reconciliationId, optimisticOrder]);
  
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

