import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  useGenerationEditSettings,
  type GenerationEditSettings,
  type EditMode,
  type LoraMode,
  type QwenEditModel,
  type EditAdvancedSettings,
  DEFAULT_EDIT_SETTINGS,
  DEFAULT_ADVANCED_SETTINGS,
} from './useGenerationEditSettings';
import {
  useLastUsedEditSettings,
  type LastUsedEditSettings,
  type VideoEditSubMode,
  type PanelMode,
} from './useLastUsedEditSettings';

export interface UseEditSettingsPersistenceProps {
  generationId: string | null;
  projectId: string | null;
  enabled?: boolean;
}

export interface UseEditSettingsPersistenceReturn {
  // Current settings values
  editMode: EditMode;
  loraMode: LoraMode;
  customLoraUrl: string;
  numGenerations: number;
  prompt: string;
  // Img2Img values
  img2imgPrompt: string;
  img2imgPromptHasBeenSet: boolean;
  img2imgStrength: number;
  img2imgEnablePromptExpansion: boolean;
  // Advanced settings for two-pass generation
  advancedSettings: EditAdvancedSettings;
  // Model selection for cloud mode
  qwenEditModel: QwenEditModel;

  // Setters (each triggers persistence)
  setEditMode: (mode: EditMode) => void;
  setLoraMode: (mode: LoraMode) => void;
  setCustomLoraUrl: (url: string) => void;
  setNumGenerations: (num: number) => void;
  setPrompt: (prompt: string) => void;
  setQwenEditModel: (model: QwenEditModel) => void;
  // Img2Img setters
  setImg2imgPrompt: (prompt: string) => void;
  setImg2imgStrength: (strength: number) => void;
  setImg2imgEnablePromptExpansion: (enabled: boolean) => void;
  // Advanced settings setter
  setAdvancedSettings: (updates: Partial<EditAdvancedSettings>) => void;

  // Video/Panel mode settings (persisted to "last used" only)
  videoEditSubMode: VideoEditSubMode;
  panelMode: PanelMode;
  setVideoEditSubMode: (mode: VideoEditSubMode) => void;
  setPanelMode: (mode: PanelMode) => void;

  // Computed LoRAs for task creation
  editModeLoRAs: Array<{ url: string; strength: number }> | undefined;
  
  // Legacy compatibility
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;
  
  // State
  isLoading: boolean;
  isReady: boolean; // True when initialization is complete
  hasPersistedSettings: boolean;
}

// LoRA URL constants (moved from useEditModeLoRAs)
const LORA_URLS = {
  'in-scene': 'https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors',
  'next-scene': 'https://huggingface.co/lovis93/next-scene-qwen-image-lora-2509/resolve/main/next-scene_lora-v2-3000.safetensors',
} as const;

/**
 * Unified edit settings persistence hook
 * 
 * Coordinates:
 * 1. Per-generation settings (generations.params.ui.editSettings)
 * 2. "Last used" settings (useToolSettings + localStorage)
 * 
 * Loading behavior:
 * - If generation has persisted settings → use those (including prompt)
 * - If no persisted settings → use "last used" (prompt = '')
 * 
 * Saving behavior:
 * - All changes save to generation
 * - Non-prompt changes also update "last used"
 */
export function useEditSettingsPersistence({
  generationId,
  projectId,
  enabled = true,
}: UseEditSettingsPersistenceProps): UseEditSettingsPersistenceReturn {
  // Per-generation settings
  const generationSettings = useGenerationEditSettings({
    generationId,
    enabled,
  });
  
  // "Last used" settings
  const lastUsedSettings = useLastUsedEditSettings({
    projectId,
    enabled,
  });
  
  // Track initialization state
  const hasInitializedRef = useRef(false);
  const lastGenerationIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Reset initialization on generation change
  useEffect(() => {
    if (generationId !== lastGenerationIdRef.current) {
      hasInitializedRef.current = false;
      lastGenerationIdRef.current = generationId;
      setIsReady(false);
    }
  }, [generationId]);
  
  // Extract stable references for the initialization effect
  const { isLoading: genIsLoading, hasPersistedSettings, initializeFromLastUsed } = generationSettings;
  const { lastUsed } = lastUsedSettings;

  // Initialize from "last used" when generation loads without persisted settings
  useEffect(() => {
    if (!genIsLoading && !hasInitializedRef.current && !hasPersistedSettings && generationId) {
      hasInitializedRef.current = true;
      // Apply "last used" settings (without prompt)
      initializeFromLastUsed(lastUsed);
      setIsReady(true);
    } else if (!genIsLoading && !hasInitializedRef.current && hasPersistedSettings) {
      hasInitializedRef.current = true;
      setIsReady(true);
    }
  }, [generationId, genIsLoading, hasPersistedSettings, initializeFromLastUsed, lastUsed]);
  
  // Compute effective values
  // editMode is ALWAYS from lastUsed (user-level, not per-generation) so it stays consistent across images/videos
  // Other settings like prompt, loraMode are per-generation
  const effectiveSettings = useMemo(() => {
    if (generationSettings.isLoading) {
      // Still loading, use defaults but editMode from lastUsed
      return {
        ...DEFAULT_EDIT_SETTINGS,
        editMode: lastUsedSettings.lastUsed.editMode,
      };
    }

    if (generationSettings.hasPersistedSettings) {
      // Has persisted settings, use them BUT override editMode with lastUsed (user-level)
      return {
        ...generationSettings.settings,
        editMode: lastUsedSettings.lastUsed.editMode,
      };
    }

    // No persisted settings yet.
    // Before the coordinator finishes initialization, we use lastUsed as defaults.
    // After initialization, always prefer the live generationSettings state so controls
    // (like the Img2Img strength slider) never feel "locked" while the debounced save runs.
    if (!isReady) {
      return {
        editMode: lastUsedSettings.lastUsed.editMode,
        loraMode: lastUsedSettings.lastUsed.loraMode,
        customLoraUrl: lastUsedSettings.lastUsed.customLoraUrl,
        numGenerations: lastUsedSettings.lastUsed.numGenerations,
        prompt: generationSettings.settings.prompt || '',
        img2imgPrompt: generationSettings.settings.img2imgPrompt || '',
        img2imgPromptHasBeenSet: generationSettings.settings.img2imgPromptHasBeenSet || false,
        img2imgStrength: lastUsedSettings.lastUsed.img2imgStrength,
        img2imgEnablePromptExpansion: lastUsedSettings.lastUsed.img2imgEnablePromptExpansion,
        advancedSettings: lastUsedSettings.lastUsed.advancedSettings ?? DEFAULT_ADVANCED_SETTINGS,
      };
    }

    // Initialized: use the live per-generation state BUT override editMode with lastUsed (user-level)
    return {
      ...generationSettings.settings,
      editMode: lastUsedSettings.lastUsed.editMode,
    };
  }, [
    isReady,
    generationSettings.isLoading,
    generationSettings.hasPersistedSettings,
    generationSettings.settings,
    lastUsedSettings.lastUsed,
  ]);
  
  // Extract stable function references to avoid recreating callbacks on every render
  // (the parent objects are recreated each render, but these functions are stable)
  const { updateLastUsed } = lastUsedSettings;
  const {
    setLoraMode: genSetLoraMode,
    setCustomLoraUrl: genSetCustomLoraUrl,
    setNumGenerations: genSetNumGenerations,
    setPrompt: genSetPrompt,
    setQwenEditModel: genSetQwenEditModel,
    setImg2imgPrompt: genSetImg2imgPrompt,
    setImg2imgStrength: genSetImg2imgStrength,
    setImg2imgEnablePromptExpansion: genSetImg2imgEnablePromptExpansion,
    setAdvancedSettings: genSetAdvancedSettings,
  } = generationSettings;

  // Wrapper setters that also update "last used" (except prompt)
  // editMode is user-level only (not per-generation) so it stays consistent across images/videos
  const setEditMode = useCallback((mode: EditMode) => {
    updateLastUsed({ editMode: mode });
  }, [updateLastUsed]);

  const setLoraMode = useCallback((mode: LoraMode) => {
    genSetLoraMode(mode);
    updateLastUsed({ loraMode: mode });
  }, [genSetLoraMode, updateLastUsed]);

  const setCustomLoraUrl = useCallback((url: string) => {
    genSetCustomLoraUrl(url);
    updateLastUsed({ customLoraUrl: url });
  }, [genSetCustomLoraUrl, updateLastUsed]);

  const setNumGenerations = useCallback((num: number) => {
    genSetNumGenerations(num);
    updateLastUsed({ numGenerations: num });
  }, [genSetNumGenerations, updateLastUsed]);

  // Prompt only saves to generation (never to "last used")
  const setPrompt = useCallback((prompt: string) => {
    genSetPrompt(prompt);
  }, [genSetPrompt]);

  // Model selection (saves to generation, cloud mode only)
  const setQwenEditModel = useCallback((model: QwenEditModel) => {
    genSetQwenEditModel(model);
  }, [genSetQwenEditModel]);

  // Img2Img prompt only saves to generation (never to "last used")
  const setImg2imgPrompt = useCallback((prompt: string) => {
    genSetImg2imgPrompt(prompt);
  }, [genSetImg2imgPrompt]);

  // Img2Img setters (save to both generation and "last used")
  const setImg2imgStrength = useCallback((strength: number) => {
    genSetImg2imgStrength(strength);
    updateLastUsed({ img2imgStrength: strength });
  }, [genSetImg2imgStrength, updateLastUsed]);

  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    genSetImg2imgEnablePromptExpansion(enabled);
    updateLastUsed({ img2imgEnablePromptExpansion: enabled });
  }, [genSetImg2imgEnablePromptExpansion, updateLastUsed]);

  // Advanced settings setter (merges with existing, saves to both generation and "last used")
  const setAdvancedSettings = useCallback((updates: Partial<EditAdvancedSettings>) => {
    genSetAdvancedSettings(updates);
    // Merge updates with current advancedSettings for lastUsed
    const currentAdvanced = effectiveSettings.advancedSettings ?? DEFAULT_ADVANCED_SETTINGS;
    updateLastUsed({ advancedSettings: { ...currentAdvanced, ...updates } });
  }, [genSetAdvancedSettings, updateLastUsed, effectiveSettings.advancedSettings]);

  // Video/Panel mode setters (only save to "last used", not per-generation)
  const setVideoEditSubMode = useCallback((mode: VideoEditSubMode) => {
    updateLastUsed({ videoEditSubMode: mode });
  }, [updateLastUsed]);

  const setPanelMode = useCallback((mode: PanelMode) => {
    updateLastUsed({ panelMode: mode });
  }, [updateLastUsed]);

  // Computed LoRAs based on mode (replaces useEditModeLoRAs logic)
  const editModeLoRAs = useMemo(() => {
    const { loraMode, customLoraUrl } = effectiveSettings;
    
    switch (loraMode) {
      case 'in-scene':
        return [{ url: LORA_URLS['in-scene'], strength: 1.0 }];
      case 'next-scene':
        return [{ url: LORA_URLS['next-scene'], strength: 1.0 }];
      case 'custom':
        return customLoraUrl.trim() 
          ? [{ url: customLoraUrl.trim(), strength: 1.0 }] 
          : undefined;
      case 'none':
      default:
        return undefined;
    }
  }, [effectiveSettings.loraMode, effectiveSettings.customLoraUrl]);
  
  // Legacy compatibility
  const isInSceneBoostEnabled = effectiveSettings.loraMode !== 'none';
  const setIsInSceneBoostEnabled = (enabled: boolean) => {
    setLoraMode(enabled ? 'in-scene' : 'none');
  };

  return {
    // Current values (using effective settings to avoid race condition)
    editMode: effectiveSettings.editMode,
    loraMode: effectiveSettings.loraMode,
    customLoraUrl: effectiveSettings.customLoraUrl,
    numGenerations: effectiveSettings.numGenerations,
    prompt: effectiveSettings.prompt,
    // Img2Img values
    img2imgPrompt: effectiveSettings.img2imgPrompt,
    img2imgPromptHasBeenSet: effectiveSettings.img2imgPromptHasBeenSet,
    img2imgStrength: effectiveSettings.img2imgStrength,
    img2imgEnablePromptExpansion: effectiveSettings.img2imgEnablePromptExpansion,
    // Advanced settings (hires fix config)
    advancedSettings: effectiveSettings.advancedSettings ?? DEFAULT_ADVANCED_SETTINGS,
    // Model selection for cloud mode
    qwenEditModel: effectiveSettings.qwenEditModel ?? 'qwen-edit',

    // Setters
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    setQwenEditModel,
    // Img2Img setters
    setImg2imgPrompt,
    setImg2imgStrength,
    setImg2imgEnablePromptExpansion,
    // Advanced settings setter
    setAdvancedSettings,

    // Video/Panel mode (from "last used")
    videoEditSubMode: lastUsedSettings.lastUsed.videoEditSubMode,
    panelMode: lastUsedSettings.lastUsed.panelMode,
    setVideoEditSubMode,
    setPanelMode,

    // Computed
    editModeLoRAs,
    
    // Legacy
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    
    // State
    isLoading: generationSettings.isLoading,
    isReady,
    hasPersistedSettings: generationSettings.hasPersistedSettings,
  };
}

// Re-export types for convenience
export type { EditMode, LoraMode, QwenEditModel, EditAdvancedSettings, GenerationEditSettings, LastUsedEditSettings, VideoEditSubMode, PanelMode };
export { DEFAULT_EDIT_SETTINGS, DEFAULT_ADVANCED_SETTINGS };

