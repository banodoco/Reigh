/**
 * VideoTrimEditor Hooks
 *
 * Re-exports all hooks for easy importing.
 */

// Re-export useVariants from shared location (canonical source)
export { useVariants, type GenerationVariant, type UseVariantsReturn, VARIANTS_QUERY_KEY } from '@/shared/hooks/useVariants';

export { useVideoTrimming } from './useVideoTrimming';
export { useTrimSave } from './useTrimSave';

