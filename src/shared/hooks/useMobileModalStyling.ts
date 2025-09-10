import { useIsMobile } from "@/shared/hooks/use-mobile";

// Centralized theme constants
const MOBILE_SPACING = {
  edge: '4', // 16px
  top: '8',  // 32px 
  bottom: '8', // 32px
} as const;

const MODAL_BASE_CLASSES = {
  common: 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 rounded-lg z-[11000]',
  layout: 'flex flex-col',
  closeButton: '[&>button:last-child]:right-7',
  // Special cases for existing modals
  settingsSpecial: '[&>button:last-child]:top-[1.5rem]',
} as const;

// Predefined modal configurations that match existing usage exactly
export type ModalSize = 'small' | 'medium' | 'medium-wide' | 'large' | 'extra-large';

export const MODAL_PRESETS = {
  small: {
    maxWidth: 'sm:max-w-sm',
    mobileLayout: 'centered' as const,
    baseClasses: MODAL_BASE_CLASSES.common,
  },
  medium: {
    maxWidth: 'sm:max-w-[425px]',
    mobileLayout: 'edge-buffered' as const,
    baseClasses: `${MODAL_BASE_CLASSES.common} ${MODAL_BASE_CLASSES.layout}`,
  },
  'medium-wide': {
    maxWidth: 'sm:max-w-[500px]',
    mobileLayout: 'edge-buffered' as const,
    baseClasses: `${MODAL_BASE_CLASSES.common} ${MODAL_BASE_CLASSES.layout}`,
  },
  large: {
    maxWidth: 'sm:max-w-2xl',
    mobileLayout: 'fullscreen' as const,
    baseClasses: `max-h-[90vh] ${MODAL_BASE_CLASSES.common} ${MODAL_BASE_CLASSES.layout}`,
    extraClasses: MODAL_BASE_CLASSES.settingsSpecial,
  },
  'extra-large': {
    maxWidth: 'max-w-4xl',
    mobileLayout: 'fullscreen' as const,
    baseClasses: `max-h-[90vh] ${MODAL_BASE_CLASSES.common} ${MODAL_BASE_CLASSES.layout}`,
    specialCases: {
      promptEditor: 'p-0', // PromptEditorModal has special padding
      loraSelector: 'overflow-hidden', // LoraSelectorModal has special overflow
    }
  },
} as const;

type MobileLayout = 'centered' | 'edge-buffered' | 'fullscreen';

// Improved configuration interface (maintains backward compatibility)
export interface MobileModalConfig {
  /** Predefined modal size with appropriate mobile behavior */
  size?: ModalSize;
  /** Override mobile layout behavior (use sparingly) */
  mobileLayout?: MobileLayout;
  /** Additional custom classes */
  extraClasses?: string;
  /** Special case identifier for unique modal needs */
  specialCase?: string;
  
  // Legacy support - these will map to size presets
  /** @deprecated Use size: 'large' | 'extra-large' instead */
  enableMobileFullscreen?: boolean;
  /** @deprecated Use size: 'medium' | 'medium-wide' instead */
  enableMobileEdgeBuffers?: boolean;
  /** @deprecated Automatically handled by size presets */
  disableCenteringOnMobile?: boolean;
}

export interface MobileModalStyling {
  dialogContentClassName: string;
  dialogContentStyle: Record<string, any>;
  headerContainerClassName: string;
  footerContainerClassName: string;
  scrollContainerClassName: string;
  isMobile: boolean;
  // Additional convenience properties
  baseClasses: string;
  fullClassName: string;
}

// Strategy pattern for mobile layouts - maintains exact same output as current system
const createMobileLayoutStrategy = (layout: MobileLayout, isMobile: boolean) => {
  if (!isMobile) {
    return {
      classes: '',
      centeringOverrides: [],
      customStyles: undefined,
    };
  }

  const strategies = {
    centered: () => ({
      classes: '',
      centeringOverrides: [],
      customStyles: undefined,
    }),
    
    'edge-buffered': () => ({
      // Keep horizontal centering from DialogContent and set width via inline style
      // to ensure consistent behavior across devices (especially iPad Safari).
      classes: '',
      centeringOverrides: [MODAL_BASE_CLASSES.closeButton],
      customStyles: {
        // 2 * 1rem (Tailwind spacing.4) side buffers
        width: 'calc(100vw - 2rem)',
        // Always keep some vertical buffer above and below
        maxHeight: 'min(90vh, calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 20px) - 64px))'
      },
    }),
    
    fullscreen: () => ({
      // Keep horizontal and vertical centering from DialogContent.
      // Only constrain width and max height to respect side buffers and safe areas.
      classes: '',
      centeringOverrides: [MODAL_BASE_CLASSES.closeButton],
      customStyles: {
        // 2 * 1rem (Tailwind spacing.4) side buffers
        width: 'calc(100vw - 2rem)',
        // Provide more conservative vertical buffer - 80vh max height ensures 20vh total buffer
        maxHeight: 'min(80vh, calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 20px) - 80px))',
      },
    }),
  };

  return strategies[layout]();
};

// Legacy compatibility mapper
const mapLegacyConfigToSize = (config: MobileModalConfig): ModalSize => {
  if (config.size) return config.size;
  
  if (config.enableMobileFullscreen) {
    return 'large'; // Default to large for fullscreen
  }
  
  if (config.enableMobileEdgeBuffers) {
    return 'medium'; // Default to medium for edge buffers
  }
  
  return 'small'; // Default centered behavior
};

export const useMobileModalStyling = (config: MobileModalConfig = {}): MobileModalStyling => {
  const isMobile = useIsMobile();
  
  // Handle legacy configurations
  const size = mapLegacyConfigToSize(config);
  const preset = MODAL_PRESETS[size];
  
  // Determine mobile layout
  const finalMobileLayout = config.mobileLayout || preset.mobileLayout;
  
  // Build base classes - handle special cases
  let baseClasses = `${preset.maxWidth} ${preset.baseClasses}`;
  
  // Add special case classes
  if (config.specialCase && preset.specialCases) {
    const specialCaseClasses = preset.specialCases[config.specialCase as keyof typeof preset.specialCases];
    if (specialCaseClasses) {
      baseClasses += ` ${specialCaseClasses}`;
    }
  }
  
  // Add preset extra classes
  if (preset.extraClasses) {
    baseClasses += ` ${preset.extraClasses}`;
  }
  
  // Add user extra classes
  if (config.extraClasses) {
    baseClasses += ` ${config.extraClasses}`;
  }

  // Get mobile-specific classes
  const { classes: mobileClasses, centeringOverrides, customStyles } = createMobileLayoutStrategy(finalMobileLayout, isMobile);
  
  const dialogContentClassName = [
    mobileClasses,
    ...centeringOverrides,
  ].filter(Boolean).join(' ');

  const fullClassName = isMobile && dialogContentClassName 
    ? `${baseClasses} ${dialogContentClassName}`
    : baseClasses;

  // Standard container classes - exactly same as current system
  const containerClasses = {
    headerContainerClassName: 'flex-shrink-0',
    footerContainerClassName: 'flex-shrink-0', 
    scrollContainerClassName: 'flex-1 overflow-y-auto min-h-0',
  };

  return {
    dialogContentClassName,
    dialogContentStyle: (isMobile && customStyles) ? customStyles : {},
    ...containerClasses,
    isMobile,
    baseClasses,
    fullClassName,
  };
};

// Backward compatible helper function
export const mergeMobileModalClasses = (baseClasses: string, mobileClasses: string, isMobile: boolean): string => {
  if (!isMobile || !mobileClasses) {
    return baseClasses;
  }
  return `${baseClasses} ${mobileClasses}`;
};

// Enhanced mobile props with better typing - same as current system
export const createMobileModalProps = (isMobile: boolean) => {
  if (!isMobile) {
    return {};
  }
  
  return {
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
  } as const;
};

// New convenience hooks for cleaner API
export const useModalStyling = (size: ModalSize, extraClasses?: string, specialCase?: string) => {
  return useMobileModalStyling({ size, extraClasses, specialCase });
};

// Type-safe preset selector
export const createModalPreset = (size: ModalSize, overrides?: Partial<MobileModalConfig>) => {
  return { size, ...overrides };
};

// Specific preset functions for common patterns
export const useSmallModal = (extraClasses?: string) => useModalStyling('small', extraClasses);
export const useMediumModal = (extraClasses?: string) => useModalStyling('medium', extraClasses);
export const useLargeModal = (extraClasses?: string) => useModalStyling('large', extraClasses);
export const useExtraLargeModal = (specialCase?: string, extraClasses?: string) => useModalStyling('extra-large', extraClasses, specialCase);
