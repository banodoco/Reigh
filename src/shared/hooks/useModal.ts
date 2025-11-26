import { useIsMobile } from "@/shared/hooks/use-mobile";

export type ModalSize = 'small' | 'medium' | 'large' | 'extra-large';

interface ModalStyling {
  className: string;
  style: Record<string, any>;
  props: Record<string, any>;
  isMobile: boolean;
  // Container classes - keeping same names for compatibility
  headerClass: string;
  scrollClass: string;
  footerClass: string;
}

/**
 * Simplified modal hook that replaces the complex useMobileModalStyling system
 * Provides the same functionality with much less complexity
 */
export const useModal = (size: ModalSize = 'medium'): ModalStyling => {
  const isMobile = useIsMobile();
  
  // Base classes that all modals need - removed z-index from classes since we apply it via inline style
  const baseClasses = 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 rounded-lg flex flex-col';
  
  // Size-specific max widths and heights
  const sizeClasses = {
    small: 'sm:max-w-sm',
    medium: 'sm:max-w-[425px] max-h-[85vh]', 
    large: 'sm:max-w-2xl max-h-[90vh]',
    'extra-large': 'max-w-4xl max-h-[90vh]'
  }[size];
  
  // Mobile-specific styles (only for medium and larger modals)
  const mobileStyle = isMobile && size !== 'small' ? {
    width: 'calc(100vw - 2rem)', // 16px edges
    maxHeight: (size === 'large' || size === 'extra-large')
      ? 'min(80vh, calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 20px) - 80px))'
      : 'min(90vh, calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 20px) - 64px))',
    // Apply z-index via inline style to ensure it takes precedence
    // 50001 puts it above the DialogOverlay (50000) and other normal UI elements
    // but below MediaLightbox (100000) and GuidanceVideoStrip preview (999999)
    zIndex: 50001
  } : {
    // Apply same z-index on desktop for consistency
    zIndex: 50001
  };

  // Mobile props to prevent auto-focus (prevents keyboard popup)
  const mobileProps = isMobile ? { 
    onOpenAutoFocus: (e: Event) => e.preventDefault() 
  } : {};

  return {
    className: `${sizeClasses} ${baseClasses}`,
    style: mobileStyle,
    props: mobileProps,
    isMobile,
    // Standard container classes - these never change
    headerClass: 'flex-shrink-0',
    scrollClass: 'flex-1 overflow-y-auto min-h-0',
    footerClass: 'flex-shrink-0'
  };
};

// Convenience functions for common sizes
export const useSmallModal = () => useModal('small');
export const useMediumModal = () => useModal('medium');
export const useLargeModal = () => useModal('large');
export const useExtraLargeModal = (specialCase?: string) => {
  // For now, ignore specialCase - the old system had 'promptEditor' and 'loraSelector' but they don't seem to do much
  return useModal('extra-large');
};
