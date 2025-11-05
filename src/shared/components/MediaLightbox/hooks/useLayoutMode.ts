import { useState, useEffect, useMemo } from 'react';

interface UseLayoutModeParams {
  isMobile: boolean;
  showTaskDetails: boolean;
  isSpecialEditMode: boolean;
  isVideo: boolean;
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
}

interface UseLayoutModeReturn {
  isTabletOrLarger: boolean;
  isTouchLikeDevice: boolean;
  shouldShowSidePanel: boolean;
  isUnifiedEditMode: boolean;
}

/**
 * Hook to detect layout mode and device capabilities
 * Determines which layout variant to use (desktop/mobile/tablet)
 */
export const useLayoutMode = ({
  isMobile,
  showTaskDetails,
  isSpecialEditMode,
  isVideo,
  isInpaintMode,
  isMagicEditMode
}: UseLayoutModeParams): UseLayoutModeReturn => {
  // Detect iPad/tablet size (768px+) for inpaint side-by-side layout
  // Also detect orientation - treat portrait tablets as mobile for better UX
  const [isTabletOrLarger, setIsTabletOrLarger] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );
  
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  
  useEffect(() => {
    const handleResize = () => {
      setIsTabletOrLarger(window.innerWidth >= 768);
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Detect touch-capable devices
  const isTouchLikeDevice = useMemo(() => {
    if (typeof window === 'undefined') return !!isMobile;
    try {
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const ua = (navigator as any)?.userAgent || '';
      const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);
      const maxTouchPoints = (navigator as any)?.maxTouchPoints || 0;
      const isIpadOsLike = (navigator as any)?.platform === 'MacIntel' && maxTouchPoints > 1;
      return Boolean(isMobile || coarsePointer || tabletUA || isIpadOsLike);
    } catch {
      return !!isMobile;
    }
  }, [isMobile]);

  // Unified special mode check - both inpaint and magic edit use the same layout
  const isUnifiedEditMode = isInpaintMode || isMagicEditMode;

  // Show sidebar on tablet/larger for: task details (even if loading), special edit modes, OR videos (always on iPad)
  // Note: We show sidebar immediately for showTaskDetails to prevent layout jump while task loads
  // Exception: On portrait tablets (like vertical iPad), use mobile layout for better UX
  const shouldShowSidePanel = !isPortrait && ((showTaskDetails && isTabletOrLarger) || (isSpecialEditMode && isTabletOrLarger) || (isVideo && isTabletOrLarger));

  // Debug layout
  useEffect(() => {
    if (isSpecialEditMode) {
      }
  }, [isInpaintMode, isMagicEditMode, isSpecialEditMode, isTabletOrLarger, isPortrait, shouldShowSidePanel]);

  return {
    isTabletOrLarger,
    isTouchLikeDevice,
    shouldShowSidePanel,
    isUnifiedEditMode
  };
};

