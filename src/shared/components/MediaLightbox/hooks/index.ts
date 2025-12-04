export { useUpscale } from './useUpscale';
export type { UseUpscaleProps, UseUpscaleReturn } from './useUpscale';

export { useInpainting } from './useInpainting';
export type { UseInpaintingProps, UseInpaintingReturn } from './useInpainting';

export { useImageFlip } from './useImageFlip';
export type { UseImageFlipProps, UseImageFlipReturn } from './useImageFlip';

export { useGenerationName } from './useGenerationName';
export type { UseGenerationNameProps, UseGenerationNameReturn } from './useGenerationName';

export { useReferences } from './useReferences';
export type { UseReferencesProps, UseReferencesReturn } from './useReferences';

export { useGenerationLineage } from './useGenerationLineage';
export type { UseGenerationLineageProps, UseGenerationLineageReturn } from './useGenerationLineage';

export { useShotCreation } from './useShotCreation';
export type { UseShotCreationProps, UseShotCreationReturn } from './useShotCreation';

export { useLightboxNavigation } from './useLightboxNavigation';
export type { UseLightboxNavigationProps, UseLightboxNavigationReturn } from './useLightboxNavigation';

export { useStarToggle } from './useStarToggle';
export type { UseStarToggleProps, UseStarToggleReturn } from './useStarToggle';

export { useShotPositioning } from './useShotPositioning';
export type { UseShotPositioningProps, UseShotPositioningReturn } from './useShotPositioning';

export { useEditModeLoRAs } from './useEditModeLoRAs';
export type { LoraMode } from './useEditModeLoRAs';
export { useSourceGeneration } from './useSourceGeneration';
export { useLayoutMode } from './useLayoutMode';
export { useMagicEditMode } from './useMagicEditMode';

// New edit settings persistence hooks
export { useGenerationEditSettings } from './useGenerationEditSettings';
export type { 
  GenerationEditSettings, 
  UseGenerationEditSettingsReturn,
  EditMode,
} from './useGenerationEditSettings';

export { useLastUsedEditSettings } from './useLastUsedEditSettings';
export type { 
  LastUsedEditSettings, 
  UseLastUsedEditSettingsReturn,
} from './useLastUsedEditSettings';

export { useEditSettingsPersistence } from './useEditSettingsPersistence';
export type { 
  UseEditSettingsPersistenceProps, 
  UseEditSettingsPersistenceReturn,
} from './useEditSettingsPersistence';

export { useVideoEditing } from './useVideoEditing';
export type { 
  UseVideoEditingProps, 
  UseVideoEditingReturn,
} from './useVideoEditing';
