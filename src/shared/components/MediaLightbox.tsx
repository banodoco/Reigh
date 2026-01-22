/**
 * MediaLightbox Export
 *
 * Re-exports from the modular structure in ./MediaLightbox/
 *
 * The component has been refactored into:
 * - ./MediaLightbox/hooks/ - Custom hooks for business logic
 * - ./MediaLightbox/components/ - UI components
 * - ./MediaLightbox/utils/ - Utility functions
 * - ./MediaLightbox/types.ts - TypeScript types
 * - ./MediaLightbox/MediaLightbox.tsx - Main implementation
 *
 * Usage:
 * import MediaLightbox from '@/shared/components/MediaLightbox';
 */

export { default } from './MediaLightbox/MediaLightbox';
export type { MediaLightboxProps, ShotOption } from './MediaLightbox/MediaLightbox';
