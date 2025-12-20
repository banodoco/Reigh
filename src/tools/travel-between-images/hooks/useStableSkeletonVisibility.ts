/**
 * Stable Skeleton Visibility Hook
 * 
 * Prevents rapid skeleton flicker when multiple queries resolve at different times.
 * Shows skeleton immediately when loading starts, delays hiding slightly to prevent toggle flicker.
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Hook that stabilizes skeleton visibility to avoid rapid flicker.
 * 
 * @param isLoading - Current loading state from queries
 * @param hideDelay - Delay in ms before hiding skeleton (default: 120ms)
 * @returns Whether to show the skeleton (stabilized)
 */
export const useStableSkeletonVisibility = (
  isLoading: boolean,
  hideDelay: number = 120
): boolean => {
  const [showStableSkeleton, setShowStableSkeleton] = useState<boolean>(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const lastLoadingStateRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Only update skeleton state if loading state actually changed
    if (isLoading !== lastLoadingStateRef.current) {
      lastLoadingStateRef.current = isLoading;
      
      if (isLoading) {
        // Immediately show the skeleton when entering loading
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        setShowStableSkeleton(true);
      } else {
        // Delay hiding slightly to prevent rapid toggle flicker
        hideTimeoutRef.current = window.setTimeout(() => {
          setShowStableSkeleton(false);
          hideTimeoutRef.current = null;
        }, hideDelay);
      }
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [isLoading, hideDelay]);

  return showStableSkeleton;
};
