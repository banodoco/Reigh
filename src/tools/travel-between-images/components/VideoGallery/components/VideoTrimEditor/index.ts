/**
 * VideoTrimEditor Module
 * 
 * Provides video trimming functionality for segment videos.
 * Following the MediaLightbox pattern:
 * - hooks/ for business logic
 * - components/ for UI
 * - utils/ for lower-level operations
 * - types.ts for TypeScript interfaces
 * 
 * Usage:
 * ```tsx
 * import { useVariants, useVideoTrimming, useTrimSave } from './VideoTrimEditor/hooks';
 * import { TrimControlsPanel, VariantSelector, TrimTimelineBar } from './VideoTrimEditor/components';
 * ```
 */

// Re-export hooks
export * from './hooks';

// Re-export components
export * from './components';

// Re-export utils
export * from './utils';

// Re-export types
export * from './types';

