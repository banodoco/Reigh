import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024 // iPads and similar tablets

// Detect if device is a tablet (iPad-like) specifically
// This allows tablets to have different behavior than phones (e.g., pane locking)
const computeIsTablet = (): boolean => {
  if (typeof window === 'undefined') return false;

  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Tablet: wider than phone but not desktop-sized, with touch capability
  const isTabletSize = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
  const isLargeTabletSize = width >= TABLET_BREAKPOINT && width < 1200;
  
  // iPadOS 13+ detection (reports as Mac with touch)
  const maxTouchPoints = (navigator as any)?.maxTouchPoints || 0;
  const isIpadOsLike = (navigator as any)?.platform === 'MacIntel' && maxTouchPoints > 1;
  
  // Generic tablet UA hints
  const ua = (navigator as any)?.userAgent || '';
  const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);
  
  // Coarse pointer (touch device)
  const coarsePointer = (() => {
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();
  
  // Tablet if: iPad-like OR (tablet size + touch capability)
  return Boolean(isIpadOsLike || tabletUA || ((isTabletSize || isLargeTabletSize) && coarsePointer));
};

const computeIsMobile = (): boolean => {
  if (typeof window === 'undefined') return false; // SSR / safety fallback

  const widthMobile = window.innerWidth < MOBILE_BREAKPOINT;

  // Coarse pointer usually indicates touch-first devices (phones/tablets)
  const coarsePointer = (() => {
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();

  // iPadOS 13+ may report as Mac with touch; detect via maxTouchPoints
  const maxTouchPoints = (navigator as any)?.maxTouchPoints || 0;
  const isIpadOsLike = (navigator as any)?.platform === 'MacIntel' && maxTouchPoints > 1;

  // Generic tablet UA hints (best-effort, not relied upon exclusively)
  const ua = (navigator as any)?.userAgent || '';
  const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);

  return Boolean(widthMobile || coarsePointer || isIpadOsLike || tabletUA);
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => computeIsMobile());

  React.useEffect(() => {
    const mqWidth = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const mqPointer = window.matchMedia('(pointer: coarse)')

    const onChange = () => setIsMobile(computeIsMobile())

    // Listen to width and pointer changes; also handle window resize as a fallback
    mqWidth.addEventListener("change", onChange)
    mqPointer.addEventListener("change", onChange)
    window.addEventListener('resize', onChange)

    return () => {
      mqWidth.removeEventListener("change", onChange)
      mqPointer.removeEventListener("change", onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  return isMobile
}

// Hook to detect tablet specifically (iPad-like devices)
// Tablets can lock one pane at a time, unlike phones
export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(() => computeIsTablet());

  React.useEffect(() => {
    const onChange = () => setIsTablet(computeIsTablet());

    window.addEventListener('resize', onChange);
    
    return () => {
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return isTablet;
}
