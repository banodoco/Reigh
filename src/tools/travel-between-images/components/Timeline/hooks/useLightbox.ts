import { useState, useRef, useEffect, useCallback } from 'react';
import { GenerationRow } from '@/types/shots';
import { timelineDebugger } from '../utils/timeline-debug';

interface LightboxProps {
  images: GenerationRow[];
  shotId: string;
  isMobile?: boolean;
}

export function useLightbox({ images, shotId, isMobile = false }: LightboxProps) {
  
  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [autoEnterInpaint, setAutoEnterInpaint] = useState(false);
  
  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  // Navigation functions
  const goNext = useCallback(() => {
    setLightboxIndex(i => {
      if (i === null) return null;
      const nextIndex = (i + 1) % images.length;
      
      timelineDebugger.logEvent('Lightbox navigation: next', {
        shotId,
        from: i,
        to: nextIndex,
        totalImages: images.length
      });
      
      return nextIndex;
    });
  }, [images.length, shotId]);

  const goPrev = useCallback(() => {
    setLightboxIndex(i => {
      if (i === null) return null;
      const prevIndex = (i - 1 + images.length) % images.length;
      
      timelineDebugger.logEvent('Lightbox navigation: previous', {
        shotId,
        from: i,
        to: prevIndex,
        totalImages: images.length
      });
      
      return prevIndex;
    });
  }, [images.length, shotId]);

  const openLightbox = useCallback((index: number) => {
    console.log('[DoubleTapFlow] 🎭 openLightbox called:', {
      shotId: shotId.substring(0, 8),
      requestedIndex: index,
      totalImages: images.length,
      isValidIndex: index >= 0 && index < images.length,
      imageId: images[index]?.shotImageEntryId?.substring(0, 8)
    });
    
    if (index >= 0 && index < images.length) {
      console.log('[DoubleTapFlow] ✅ LIGHTBOX OPENING:', {
        shotId: shotId.substring(0, 8),
        index,
        imageId: images[index]?.shotImageEntryId?.substring(0, 8)
      });
      
      timelineDebugger.logEvent('Lightbox opened', {
        shotId,
        imageIndex: index,
        imageId: images[index]?.shotImageEntryId?.substring(0, 8),
        totalImages: images.length
      });
      setLightboxIndex(index);
    } else {
      console.log('[DoubleTapFlow] ❌ INVALID INDEX - Cannot open lightbox:', {
        index,
        totalImages: images.length
      });
    }
  }, [images, shotId]);

  const openLightboxWithInpaint = useCallback((index: number) => {
    if (index >= 0 && index < images.length) {
      timelineDebugger.logEvent('Lightbox opened with inpaint mode', {
        shotId,
        imageIndex: index,
        imageId: images[index]?.shotImageEntryId?.substring(0, 8),
        totalImages: images.length
      });
      setAutoEnterInpaint(true);
      setLightboxIndex(index);
    }
  }, [images, shotId]);

  const closeLightbox = useCallback(() => {
    timelineDebugger.logEvent('Lightbox closed', {
      shotId,
      previousIndex: lightboxIndex
    });
    setLightboxIndex(null);
    setAutoEnterInpaint(false); // Reset auto-enter flag when closing
  }, [shotId, lightboxIndex]);

  // Handle mobile tap - now called by useDoubleTapWithSelection hook
  const handleMobileTap = useCallback((idx: number) => {
    console.log('[DoubleTapFlow] 🎭 useLightbox handleMobileTap called:', {
      shotId: shotId.substring(0, 8),
      imageIndex: idx,
      isMobile,
      imagesCount: images.length
    });
    
    if (!isMobile) {
      console.log('[DoubleTapFlow] ⚠️ Not mobile - ignoring tap');
      return;
    }

    // Since this is now called by useDoubleTapWithSelection, we don't need
    // double-tap detection here anymore - just open the lightbox
    console.log('[DoubleTapFlow] ✅ Opening lightbox at index:', idx);
    openLightbox(idx);
  }, [isMobile, shotId, openLightbox, images.length]);

  // Desktop double-click handler
  const handleDesktopDoubleClick = useCallback((idx: number) => {
    if (isMobile) return;
    
    timelineDebugger.logEvent('Desktop double-click detected', {
      shotId,
      imageIndex: idx
    });
    
    openLightbox(idx);
  }, [isMobile, shotId, openLightbox]);

  // Get current lightbox image
  const currentLightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  // Navigation availability
  const hasNext = lightboxIndex !== null && lightboxIndex < images.length - 1;
  const hasPrevious = lightboxIndex !== null && lightboxIndex > 0;
  const showNavigation = images.length > 1;

  return {
    // State
    lightboxIndex,
    setLightboxIndex, // Expose raw setter for external hooks
    currentLightboxImage,
    autoEnterInpaint,
    
    // Navigation
    goNext,
    goPrev,
    openLightbox,
    openLightboxWithInpaint,
    closeLightbox,
    
    // Event handlers
    handleMobileTap,
    handleDesktopDoubleClick,
    
    // Navigation state
    hasNext,
    hasPrevious,
    showNavigation
  };
}
