// Centralized debug configuration to control logging noise
// This allows fine-grained control over different debug categories

interface DebugConfig {
  // Core performance logging
  reactProfiler: boolean;
  renderLogging: boolean;
  
  // Image loading and progressive loading
  progressiveImage: boolean;
  imageLoading: boolean;
  
  // Component-specific debugging
  shotImageDebug: boolean;
  autoplayDebugger: boolean;
  tasksPaneDebug: boolean;
  galleryPollingDebug: boolean;
  
  // UI and interaction debugging
  dragDebug: boolean;
  skeletonDebug: boolean;
  videoDebug: boolean;
  
  // Realtime and networking
  realtimeDebug: boolean;
  reconnectionDebug: boolean;
  
  // Development helpers
  devMode: boolean;
}

// Environment-based configuration
const getEnvFlag = (key: string, defaultValue: boolean = false): boolean => {
  try {
    const value = (import.meta as any)?.env?.[key];
    if (typeof value === 'string') {
      return value === 'true' || value === '1';
    }
  } catch {}
  return defaultValue;
};

// Default configuration - optimized for production-like experience
const defaultConfig: DebugConfig = {
  // Core performance - disable by default (too noisy)
  reactProfiler: getEnvFlag('VITE_DEBUG_REACT_PROFILER', false),
  renderLogging: getEnvFlag('VITE_DEBUG_RENDER_LOGGING', false),
  
  // Image loading - reduce noise significantly
  progressiveImage: getEnvFlag('VITE_DEBUG_PROGRESSIVE_IMAGE', false),
  imageLoading: getEnvFlag('VITE_DEBUG_IMAGE_LOADING', false),
  
  // Component debugging - only enable when specifically needed
  shotImageDebug: getEnvFlag('VITE_DEBUG_SHOT_IMAGES', false),
  autoplayDebugger: getEnvFlag('VITE_DEBUG_AUTOPLAY', false),
  tasksPaneDebug: getEnvFlag('VITE_DEBUG_TASKS_PANE', false),
  galleryPollingDebug: getEnvFlag('VITE_DEBUG_GALLERY_POLLING', false),
  
  // UI debugging - minimal by default
  dragDebug: getEnvFlag('VITE_DEBUG_DRAG', false),
  skeletonDebug: getEnvFlag('VITE_DEBUG_SKELETON', false),
  videoDebug: getEnvFlag('VITE_DEBUG_VIDEO', false),
  
  // Realtime - keep essential debugging only
  realtimeDebug: getEnvFlag('VITE_DEBUG_REALTIME', true), // Keep for critical issues
  reconnectionDebug: getEnvFlag('VITE_DEBUG_RECONNECTION', true), // Keep for critical issues
  
  // Development mode - enables minimal essential debugging
  devMode: getEnvFlag('VITE_DEBUG_DEV_MODE', true)
};

// Runtime configuration that can be modified
let runtimeConfig: DebugConfig = { ...defaultConfig };

// Public API for controlling debug output
export const debugConfig = {
  // Check if a specific debug category is enabled
  isEnabled: (category: keyof DebugConfig): boolean => {
    return runtimeConfig[category];
  },
  
  // Enable/disable specific categories at runtime
  enable: (category: keyof DebugConfig): void => {
    runtimeConfig[category] = true;
    },
  
  disable: (category: keyof DebugConfig): void => {
    runtimeConfig[category] = false;
    },
  
  // Bulk operations
  enableAll: (): void => {
    Object.keys(runtimeConfig).forEach(key => {
      runtimeConfig[key as keyof DebugConfig] = true;
    });
    },
  
  disableAll: (): void => {
    Object.keys(runtimeConfig).forEach(key => {
      runtimeConfig[key as keyof DebugConfig] = false;
    });
    },
  
  // Preset configurations
  setQuietMode: (): void => {
    runtimeConfig = {
      ...runtimeConfig,
      reactProfiler: false,
      renderLogging: false,
      progressiveImage: false,
      imageLoading: false,
      shotImageDebug: false,
      autoplayDebugger: false,
      tasksPaneDebug: false,
      galleryPollingDebug: false,
      dragDebug: false,
      skeletonDebug: false,
      videoDebug: false
    };
    },
  
  setDevelopmentMode: (): void => {
    runtimeConfig = {
      ...runtimeConfig,
      reactProfiler: false, // Still too noisy for dev
      renderLogging: true,
      progressiveImage: false, // Still too noisy for dev
      imageLoading: true,
      shotImageDebug: true,
      autoplayDebugger: false,
      tasksPaneDebug: true,
      galleryPollingDebug: false,
      dragDebug: true,
      skeletonDebug: true,
      videoDebug: true
    };
    },
  
  // Get current configuration
  getConfig: (): DebugConfig => ({ ...runtimeConfig }),
  
  // Status report
  status: (): void => {
    console.group('🔍 [DebugConfig] Current Configuration');
    Object.entries(runtimeConfig).forEach(([key, value]) => {
      });
    console.groupEnd();
  }
};

// Make debug config available globally for runtime control
if (typeof window !== 'undefined') {
  (window as any).debugConfig = debugConfig;
  or debugConfig.status()');
}

// Conditional logging helper
export const conditionalLog = (category: keyof DebugConfig, tag: string, ...args: any[]): void => {
  if (debugConfig.isEnabled(category)) {
    }
};

// Throttled logging helper to reduce noise
const logThrottleMap = new Map<string, number>();

export const throttledLog = (
  category: keyof DebugConfig, 
  tag: string, 
  throttleMs: number = 1000,
  ...args: any[]
): void => {
  if (!debugConfig.isEnabled(category)) return;
  
  const key = `${category}-${tag}`;
  const now = Date.now();
  const lastLog = logThrottleMap.get(key) || 0;
  
  if (now - lastLog >= throttleMs) {
    logThrottleMap.set(key, now);
    }
};
