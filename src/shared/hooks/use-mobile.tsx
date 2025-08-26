import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Determine initial value synchronously so the first render already knows the viewport type.
  // Expanded to include tablets (iPad, Android tablets) using pointer/touch heuristics in addition to width.
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
