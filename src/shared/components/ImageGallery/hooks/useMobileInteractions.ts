import { useCallback, useEffect } from 'react';
import { GeneratedImageWithMetadata } from '../ImageGallery';

export interface UseMobileInteractionsProps {
  isMobile: boolean;
  mobileActiveImageId: string | null;
  setMobileActiveImageId: (id: string | null) => void;
  mobilePopoverOpenImageId: string | null;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  lastTouchTimeRef: React.MutableRefObject<number>;
  lastTappedImageIdRef: React.MutableRefObject<string | null>;
  doubleTapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
}

export interface UseMobileInteractionsReturn {
  handleMobileTap: (image: GeneratedImageWithMetadata) => void;
}

export const useMobileInteractions = ({
  isMobile,
  mobileActiveImageId,
  setMobileActiveImageId,
  mobilePopoverOpenImageId,
  setMobilePopoverOpenImageId,
  lastTouchTimeRef,
  lastTappedImageIdRef,
  doubleTapTimeoutRef,
  onOpenLightbox,
}: UseMobileInteractionsProps): UseMobileInteractionsReturn => {
  
  // Handle mobile double-tap detection
  const handleMobileTap = useCallback((image: GeneratedImageWithMetadata) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    const lastTappedImageId = lastTappedImageIdRef.current;
    const isSameImage = lastTappedImageId === image.id;
    
    ,
      lastTappedImageId: lastTappedImageId?.substring(0, 8),
      isSameImage,
      currentTime,
      lastTouchTime: lastTouchTimeRef.current,
      timeSinceLastTap,
      isDoubleTap: timeSinceLastTap < 800 && timeSinceLastTap > 10 && lastTouchTimeRef.current > 0 && isSameImage,
      hasTimeout: !!doubleTapTimeoutRef.current
    });
    
    if (timeSinceLastTap < 800 && timeSinceLastTap > 10 && lastTouchTimeRef.current > 0 && isSameImage) {
      // This is a double-tap on the same image, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      onOpenLightbox(image);
    } else {
      // This is a single tap or tap on different image, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap (mobile): reveal action controls for this image
        // Close any existing popover if tapping a different image
        if (mobilePopoverOpenImageId && mobilePopoverOpenImageId !== image.id) {
          setMobilePopoverOpenImageId(null);
        }
        setMobileActiveImageId(image.id);
        doubleTapTimeoutRef.current = null;
      }, 800);
    }
    
    // Update the last tapped image and time
    lastTappedImageIdRef.current = image.id;
    lastTouchTimeRef.current = currentTime;
  }, [lastTouchTimeRef, lastTappedImageIdRef, doubleTapTimeoutRef, onOpenLightbox, mobilePopoverOpenImageId, setMobilePopoverOpenImageId, setMobileActiveImageId]);

  // Close mobile popover on scroll or when clicking outside
  useEffect(() => {
    if (!isMobile || !mobilePopoverOpenImageId) return;

    const handleScroll = () => {
      setMobilePopoverOpenImageId(null);
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Close if clicking outside any popover content
      const target = event.target as Element;
      if (!target.closest('[data-radix-popover-content]')) {
        setMobilePopoverOpenImageId(null);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobile, mobilePopoverOpenImageId, setMobilePopoverOpenImageId]);

  return {
    handleMobileTap,
  };
};
