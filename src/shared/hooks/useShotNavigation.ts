import { useNavigate } from 'react-router-dom';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Shot } from '@/types/shots';

interface ShotNavigationOptions {
  /** Whether to scroll to top after navigation */
  scrollToTop?: boolean;
  /** Whether to close mobile panes after navigation */
  closeMobilePanes?: boolean;
  /** Whether to replace the current history entry instead of pushing */
  replace?: boolean;
  /** Custom scroll behavior */
  scrollBehavior?: 'auto' | 'smooth';
  /** Delay before scrolling (useful for waiting for navigation to complete) */
  scrollDelay?: number;
  /** Whether this shot was just created (show loading instead of "not found" while cache syncs) */
  isNewlyCreated?: boolean;
}

interface ShotNavigationResult {
  /** Navigate to a specific shot */
  navigateToShot: (shot: Shot, options?: ShotNavigationOptions) => void;
  /** Navigate to the shot editor without a specific shot (shows shot list) */
  navigateToShotEditor: (options?: ShotNavigationOptions) => void;
  /** Navigate to the next shot in a list */
  navigateToNextShot: (shots: Shot[], currentShot: Shot, options?: ShotNavigationOptions) => boolean;
  /** Navigate to the previous shot in a list */
  navigateToPreviousShot: (shots: Shot[], currentShot: Shot, options?: ShotNavigationOptions) => boolean;
}

export const useShotNavigation = (): ShotNavigationResult => {
  const navigate = useNavigate();
  const { setCurrentShotId } = useCurrentShot();
  const isMobile = useIsMobile();

  const defaultOptions: Required<ShotNavigationOptions> = {
    scrollToTop: true,
    closeMobilePanes: true,
    replace: false,
    scrollBehavior: 'smooth',
    scrollDelay: 200, // Increased to 200ms to ensure DOM has updated
    isNewlyCreated: false,
  };

  const performScroll = (options: Required<ShotNavigationOptions>) => {
    if (options.scrollToTop) {
      const scrollFn = () => {
        // Use requestAnimationFrame to ensure DOM has painted
        requestAnimationFrame(() => {
          // Always scroll the window - containerRef is just a wrapper div, not a scroll container
          console.log('[ShotNavPerf] 📜 Scrolling window to top');
          window.scrollTo({ top: 0, behavior: options.scrollBehavior });
          console.log('[ShotNavPerf] 📜 Scroll to top executed');
        });
      };
      
      if (options.scrollDelay > 0) {
        setTimeout(scrollFn, options.scrollDelay);
      } else {
        scrollFn();
      }
    }
  };

  const closePanes = (options: Required<ShotNavigationOptions>) => {
    if (options.closeMobilePanes && isMobile) {
      window.dispatchEvent(new CustomEvent('mobilePaneOpen', { detail: { side: null } }));
    }
  };

  const navigateToShot = (shot: Shot, options: ShotNavigationOptions = {}) => {
    const opts = { ...defaultOptions, ...options };
    
    console.log('[ShotNavPerf] 🧭 navigateToShot called', {
      shotId: shot.id.substring(0, 8),
      shotName: shot.name,
      options: opts,
      currentUrl: window.location.href,
      timestamp: Date.now()
    });
    
    // Update the current shot context
    console.log('[ShotNavPerf] 🎯 Setting current shot ID:', shot.id.substring(0, 8));
    const contextStart = Date.now();
    setCurrentShotId(shot.id);
    console.log('[ShotNavPerf] ✅ Context updated in', Date.now() - contextStart, 'ms');
    
    // Navigate to the shot with hash
    const targetUrl = `/tools/travel-between-images#${shot.id}`;
    console.log('[ShotNavPerf] 🚀 Navigating to:', targetUrl);
    const navStart = Date.now();
    navigate(targetUrl, {
      state: { 
        fromShotClick: true, 
        shotData: shot,
        isNewlyCreated: opts.isNewlyCreated 
      },
      replace: opts.replace,
    });
    console.log('[ShotNavPerf] ✅ Navigation called in', Date.now() - navStart, 'ms');
    
    console.log('[ShotNavPerf] 🎬 Handling side effects (scroll/panes)');
    
    // Handle side effects
    performScroll(opts);
    closePanes(opts);
    
    console.log('[ShotNavPerf] ✨ navigateToShot completed');
  };

  const navigateToShotEditor = (options: ShotNavigationOptions = {}) => {
    const opts = { ...defaultOptions, ...options };
    
    // Clear current shot selection
    setCurrentShotId(null);
    
    // Navigate to the shot editor without a specific shot
    navigate('/tools/travel-between-images', {
      state: { fromShotClick: false },
      replace: opts.replace,
    });
    
    // Handle side effects
    performScroll(opts);
    closePanes(opts);
  };

  const navigateToNextShot = (shots: Shot[], currentShot: Shot, options: ShotNavigationOptions = {}): boolean => {
    console.log('[ShotNavPerf] 🔍 navigateToNextShot called', {
      timestamp: Date.now(),
      currentShotId: currentShot.id.substring(0, 8),
      currentShotName: currentShot.name,
      totalShots: shots.length
    });
    const currentIndex = shots.findIndex(shot => shot.id === currentShot.id);
    if (currentIndex >= 0 && currentIndex < shots.length - 1) {
      const nextShot = shots[currentIndex + 1];
      console.log('[ShotNavPerf] ➡️ Next shot found, calling navigateToShot', {
        nextShotId: nextShot.id.substring(0, 8),
        nextShotName: nextShot.name,
        currentIndex,
        nextIndex: currentIndex + 1
      });
      navigateToShot(nextShot, { ...options, replace: true });
      return true;
    }
    console.log('[ShotNavPerf] ⚠️ No next shot available');
    return false;
  };

  const navigateToPreviousShot = (shots: Shot[], currentShot: Shot, options: ShotNavigationOptions = {}): boolean => {
    console.log('[ShotNavPerf] 🔍 navigateToPreviousShot called', {
      timestamp: Date.now(),
      currentShotId: currentShot.id.substring(0, 8),
      currentShotName: currentShot.name,
      totalShots: shots.length
    });
    const currentIndex = shots.findIndex(shot => shot.id === currentShot.id);
    if (currentIndex > 0) {
      const previousShot = shots[currentIndex - 1];
      console.log('[ShotNavPerf] ⬅️ Previous shot found, calling navigateToShot', {
        prevShotId: previousShot.id.substring(0, 8),
        prevShotName: previousShot.name,
        currentIndex,
        prevIndex: currentIndex - 1
      });
      navigateToShot(previousShot, { ...options, replace: true });
      return true;
    }
    console.log('[ShotNavPerf] ⚠️ No previous shot available');
    return false;
  };

  return {
    navigateToShot,
    navigateToShotEditor,
    navigateToNextShot,
    navigateToPreviousShot,
  };
}; 