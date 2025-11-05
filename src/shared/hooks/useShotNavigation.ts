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
    scrollDelay: 100,
  };

  const performScroll = (options: Required<ShotNavigationOptions>) => {
    if (options.scrollToTop) {
      const scrollFn = () => {
        window.scrollTo({ top: 0, behavior: options.scrollBehavior });
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
    
    });
    
    // Update the current shot context
    setCurrentShotId(shot.id);
    
    // Navigate to the shot with hash
    const targetUrl = `/tools/travel-between-images#${shot.id}`;
    navigate(targetUrl, {
      state: { fromShotClick: true },
      replace: opts.replace,
    });
    
    // Handle side effects
    performScroll(opts);
    closePanes(opts);
    
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
    const currentIndex = shots.findIndex(shot => shot.id === currentShot.id);
    if (currentIndex >= 0 && currentIndex < shots.length - 1) {
      const nextShot = shots[currentIndex + 1];
      navigateToShot(nextShot, { ...options, replace: true });
      return true;
    }
    return false;
  };

  const navigateToPreviousShot = (shots: Shot[], currentShot: Shot, options: ShotNavigationOptions = {}): boolean => {
    const currentIndex = shots.findIndex(shot => shot.id === currentShot.id);
    if (currentIndex > 0) {
      const previousShot = shots[currentIndex - 1];
      navigateToShot(previousShot, { ...options, replace: true });
      return true;
    }
    return false;
  };

  return {
    navigateToShot,
    navigateToShotEditor,
    navigateToNextShot,
    navigateToPreviousShot,
  };
}; 