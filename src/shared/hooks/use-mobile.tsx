import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Determine initial value synchronously so the first render already knows the viewport type.
  // This prevents an unnecessary mount/unmount cycle (e.g. DraggableImage -> static div) which
  // on slower mobile devices caused a noticeable stall where the gallery appeared to stay in its
  // skeleton state.
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false; // SSR / safety fallback
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      // Re-evaluate whenever the media query changes
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
