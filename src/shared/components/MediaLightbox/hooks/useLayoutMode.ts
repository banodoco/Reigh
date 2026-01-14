import { useState, useEffect, useMemo } from 'react';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';

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
  isPortraitMode: boolean;
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
  // Use shared device detection hook for all device/orientation detection
  const { isTabletOrLarger, isPortraitMode: isPortrait, isTouchDevice: isTouchLikeDevice } = useDeviceDetection();

  // Unified special mode check - both inpaint and magic edit use the same layout
  const isUnifiedEditMode = isInpaintMode || isMagicEditMode;

  // Show sidebar on tablet/larger for: task details (even if loading), special edit modes, OR videos (always on iPad)
  // Note: We show sidebar immediately for showTaskDetails to prevent layout jump while task loads
  // Exception: On portrait tablets (like vertical iPad), use mobile layout for better UX
  const shouldShowSidePanel = !isPortrait && ((showTaskDetails && isTabletOrLarger) || (isSpecialEditMode && isTabletOrLarger) || (isVideo && isTabletOrLarger));

  // Debug layout
  useEffect(() => {
    if (isSpecialEditMode) {
      console.log('[TaskDetailsSidebar] 🎨 Special edit mode layout:', {
        isInpaintMode,
        isMagicEditMode,
        isSpecialEditMode,
        isTabletOrLarger,
        isPortrait,
        shouldShowSidePanel,
        windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'unknown',
        windowHeight: typeof window !== 'undefined' ? window.innerHeight : 'unknown'
      });
    }
  }, [isInpaintMode, isMagicEditMode, isSpecialEditMode, isTabletOrLarger, isPortrait, shouldShowSidePanel]);

  return {
    isTabletOrLarger,
    isTouchLikeDevice,
    shouldShowSidePanel,
    isUnifiedEditMode,
    isPortraitMode: isPortrait
  };
};

