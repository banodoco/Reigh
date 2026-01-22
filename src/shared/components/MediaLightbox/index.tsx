/**
 * MediaLightbox - Modular Component
 *
 * Available Hooks (all in ./hooks/):
 * - useUpscale: Image upscaling with localStorage persistence
 * - useInpainting: Canvas-based inpainting with mask generation
 * - useRepositionMode: Image repositioning, scaling, rotation, and flipping
 * - useGenerationName: Generation name editing with database sync
 * - useReferences: Adding images to project references with processing
 * - useGenerationLineage: Fetching source/derived generations
 * - useShotCreation: Atomic shot creation with images
 * - useLightboxNavigation: Keyboard controls and safe closing
 * - useStarToggle: Star toggle with optimistic UI updates
 * - useShotPositioning: Shot positioning checks and navigation
 *
 * Available Components (all in ./components/):
 * - MediaDisplay: Image/video rendering with progressive loading
 * - NavigationButtons: Left/right navigation arrows
 * - InpaintControlsPanel: Inpainting UI
 * - TaskDetailsSection: Generation lineage display
 * - MediaControls: Top control bar
 * - WorkflowControls: Bottom control bar
 *
 * Available Utils (all in ./utils/):
 * - downloadMedia: Media download with timeout handling
 */

// Export the main implementation
export { default } from './MediaLightbox';
export type { MediaLightboxProps, ShotOption } from './MediaLightbox';

// Re-export hooks for use in other components
export {
  useUpscale,
  useInpainting,
  useGenerationName,
  useReferences,
  useGenerationLineage,
  useShotCreation,
  useLightboxNavigation,
  useStarToggle,
  useShotPositioning,
} from './hooks';

// Re-export components for use elsewhere
export {
  MediaDisplay,
  NavigationButtons,
  InpaintControlsPanel,
  TaskDetailsSection,
} from './components';

// Re-export utils
export { downloadMedia } from './utils';
