/**
 * VideoTrimEditor Module
 * 
 * Provides video trimming functionality for segment videos.
 * Uses server-side Edge Function (trim-video) for MP4 conversion with proper duration metadata.
 * 
 * Following the MediaLightbox pattern:
 * - hooks/ for business logic
 * - components/ for UI
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

// Re-export types
export * from './types';

