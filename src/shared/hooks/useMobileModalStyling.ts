import { useIsMobile } from "@/shared/hooks/use-mobile";

export interface MobileModalConfig {
  /** Enable near-fullscreen mobile layout with edge gaps (16px sides, 32px top/bottom) and rounded corners */
  enableMobileFullscreen?: boolean;
  /** Whether to disable default desktop centering on mobile */
  disableCenteringOnMobile?: boolean;
  /** Enable only left/right edge buffers without forcing full height */
  enableMobileEdgeBuffers?: boolean;
}

export interface MobileModalStyling {
  dialogContentClassName: string;
  dialogContentStyle: Record<string, any>;
  headerContainerClassName: string;
  footerContainerClassName: string;
  scrollContainerClassName: string;
  isMobile: boolean;
}

export const useMobileModalStyling = (config: MobileModalConfig = {}): MobileModalStyling => {
  const isMobile = useIsMobile();
  const {
    enableMobileFullscreen = false,
    disableCenteringOnMobile = false,
    enableMobileEdgeBuffers = false,
  } = config;

  if (!isMobile) {
    return {
      dialogContentClassName: '',
      dialogContentStyle: {},
      headerContainerClassName: 'flex-shrink-0',
      footerContainerClassName: 'flex-shrink-0',
      scrollContainerClassName: 'flex-1 overflow-y-auto min-h-0',
      isMobile,
    };
  }

  // Mobile edge buffers only - left/right positioning without forcing height
  if (enableMobileEdgeBuffers && !enableMobileFullscreen) {
    const edgeBufferPositioning = [
      'left-4',   // 16px - left buffer
      'right-4',  // 16px - right buffer
      'w-auto',
      'rounded-lg', // Add rounded corners
    ];

    const centeringOverrides = disableCenteringOnMobile ? [
      'translate-x-0',
      '[&>button:last-child]:right-7', // Close button adjustment
    ] : [];

    const dialogContentClassName = [...edgeBufferPositioning, ...centeringOverrides].join(' ');

    return {
      dialogContentClassName,
      dialogContentStyle: {},
      headerContainerClassName: 'flex-shrink-0',
      footerContainerClassName: 'flex-shrink-0',
      scrollContainerClassName: 'flex-1 overflow-y-auto min-h-0',
      isMobile,
    };
  }

  // Mobile near-fullscreen positioning using safe Tailwind classes (matching SettingsModal)
  if (enableMobileFullscreen) {
    const mobilePositioning = [
      'left-4',   // 16px - matching SettingsModal for proper visual buffer
      'right-4',  // 16px - matching SettingsModal for proper visual buffer
      'top-8',    // 32px - matching SettingsModal for status bar clearance
      'bottom-8', // 32px - matching SettingsModal for navigation clearance
      'w-auto',
      'max-h-none',
      'rounded-lg', // Add rounded corners like SettingsModal
    ];

    const centeringOverrides = disableCenteringOnMobile ? [
      'translate-x-0',
      'translate-y-0',
      '[&>button:last-child]:right-7', // Close button adjustment
    ] : [];

    const dialogContentClassName = [...mobilePositioning, ...centeringOverrides].join(' ');

    return {
      dialogContentClassName,
      dialogContentStyle: {},
      headerContainerClassName: 'flex-shrink-0',
      footerContainerClassName: 'flex-shrink-0',
      scrollContainerClassName: 'flex-1 overflow-y-auto min-h-0',
      isMobile,
    };
  }

  // Default mobile behavior (no special positioning)
  return {
    dialogContentClassName: '',
    dialogContentStyle: {},
    headerContainerClassName: 'flex-shrink-0',
    footerContainerClassName: 'flex-shrink-0',
    scrollContainerClassName: 'flex-1 overflow-y-auto min-h-0',
    isMobile,
  };
};

export const mergeMobileModalClasses = (baseClasses: string, mobileClasses: string, isMobile: boolean): string => {
  if (!isMobile || !mobileClasses) {
    return baseClasses;
  }
  return `${baseClasses} ${mobileClasses}`;
};

export const createMobileModalProps = (isMobile: boolean) => {
  if (!isMobile) {
    return {};
  }
  
  return {
    // Prevent auto-focus on mobile to avoid keyboard popup
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
  };
};