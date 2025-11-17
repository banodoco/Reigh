import { useState, useEffect, useMemo } from 'react';
import { useIsMobile } from './use-mobile';

export interface UseDeviceDetectionReturn {
  // Tablet detection
  isTablet: boolean;
  isPhone: boolean;
  
  // Width-based detection (simpler check, useful for layout decisions)
  isTabletOrLarger: boolean; // width >= 768px
  
  // Touch capability detection
  isTouchDevice: boolean; // Any touch-capable device (broader than tablet)
  
  // Orientation tracking (two methods for compatibility)
  orientation: 'portrait' | 'landscape'; // Media query based
  isPortraitMode: boolean; // height > width (simpler, more reliable)
  
  // Column calculations for responsive grids
  mobileColumns: 2 | 3 | 4 | 6;
}

/**
 * Comprehensive device detection hook
 * 
 * Detects:
 * - Tablet vs phone (iPad, Android tablets, etc.)
 * - Screen width breakpoints (isTabletOrLarger)
 * - Touch capability (isTouchDevice)
 * - Orientation (two methods: media query and height/width comparison)
 * - Responsive column counts
 * 
 * Useful for responsive layouts that need to distinguish between device types
 * and adapt UI accordingly.
 * 
 * @returns Comprehensive device detection state
 */
export function useDeviceDetection(): UseDeviceDetectionReturn {
  const isMobile = useIsMobile();
  
  // Detect tablets (iPad, Android tablets, etc.) - full user agent + width-based detection
  const [isTablet, setIsTablet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return detectTablet();
  });
  
  // Width-based tablet detection (768px+) - simpler check for layout decisions
  const [isTabletOrLarger, setIsTabletOrLarger] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768;
  });
  
  // Track orientation using media query
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    try {
      return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
    } catch {
      return 'portrait';
    }
  });
  
  // Track portrait mode using height/width comparison (alternative to media query)
  const [isPortraitMode, setIsPortraitMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });
  
  // Listen for orientation and resize changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mq = window.matchMedia('(orientation: portrait)');
    const handleOrientation = () => setOrientation(mq.matches ? 'portrait' : 'landscape');
    
    const handleResize = () => {
      // Update all size-dependent states
      setIsTablet(detectTablet());
      setIsTabletOrLarger(window.innerWidth >= 768);
      setIsPortraitMode(window.innerHeight > window.innerWidth);
    };
    
    try { 
      mq.addEventListener('change', handleOrientation); 
    } catch { 
      /* no-op */ 
    }
    window.addEventListener('resize', handleResize);
    
    return () => {
      try { 
        mq.removeEventListener('change', handleOrientation); 
      } catch { 
        /* no-op */ 
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // For UI purposes, treat tablets like desktop (show advanced UI)
  // Only hide advanced UI on actual phones
  const isPhone = isMobile && !isTablet;
  
  // Detect touch-capable devices (broader than just tablets)
  // Includes phones, tablets, and any device with coarse pointer or touch points
  const isTouchDevice = useMemo(() => {
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
  
  // Calculate mobile columns based on device type and orientation
  const mobileColumns = useMemo(() => {
    if (!isMobile) return 6 as 6;
    if (isTablet) return (orientation === 'portrait' ? 3 : 4) as 3 | 4;
    return 2 as 2;
  }, [isMobile, isTablet, orientation]);

  return {
    isTablet,
    isPhone,
    isTabletOrLarger,
    isTouchDevice,
    orientation,
    isPortraitMode,
    mobileColumns,
  };
}

/**
 * Helper function to detect if the current device is a tablet
 */
function detectTablet(): boolean {
  if (typeof window === 'undefined') return false;
  
  const nav: any = navigator || {};
  const ua: string = nav.userAgent || '';
  const platform: string = nav.platform || '';
  const maxTouchPoints: number = nav.maxTouchPoints || 0;
  
  // iPad detection (including iPadOS 13+ that masquerades as Mac)
  const isIpadUA = /iPad/i.test(ua);
  const isIpadOsLike = platform === 'MacIntel' && maxTouchPoints > 1;
  
  // Android tablets and other tablets (similar to use-mobile.tsx logic)
  const isAndroidTablet = /Android(?!.*Mobile)/i.test(ua);
  const isOtherTablet = /Tablet|Silk|Kindle|PlayBook/i.test(ua);
  
  // Width-based tablet detection (devices between phone and desktop)
  const screenWidth = window.innerWidth;
  const isTabletWidth = screenWidth >= 768 && screenWidth <= 1024;
  
  // Coarse pointer usually indicates touch devices (phones/tablets)
  const hasCoarsePointer = (() => {
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();
  
  return Boolean(
    isIpadUA || isIpadOsLike || isAndroidTablet || isOtherTablet || 
    (isTabletWidth && hasCoarsePointer && maxTouchPoints > 0)
  );
}

