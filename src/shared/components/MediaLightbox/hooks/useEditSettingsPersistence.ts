import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { 
  useGenerationEditSettings, 
  type GenerationEditSettings,
  type EditMode,
  type LoraMode,
  DEFAULT_EDIT_SETTINGS,
} from './useGenerationEditSettings';
import { 
  useLastUsedEditSettings,
  type LastUsedEditSettings,
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
  
  // Setters (each triggers persistence)
  setEditMode: (mode: EditMode) => void;
  setLoraMode: (mode: LoraMode) => void;
  setCustomLoraUrl: (url: string) => void;
  setNumGenerations: (num: number) => void;
  setPrompt: (prompt: string) => void;
  // Img2Img setters
  setImg2imgPrompt: (prompt: string) => void;
  setImg2imgStrength: (strength: number) => void;
  setImg2imgEnablePromptExpansion: (enabled: boolean) => void;
  
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
  
  console.log('[EDIT_DEBUG] ═══════════════════════════════════════════════════════════════');
  console.log('[EDIT_DEBUG] 🚀 useEditSettingsPersistence HOOK CALLED');
  console.log('[EDIT_DEBUG] 🚀 generationId:', generationId?.substring(0, 8) || 'null');
  console.log('[EDIT_DEBUG] 🚀 projectId:', projectId?.substring(0, 8) || 'null');
  console.log('[EDIT_DEBUG] 🚀 enabled:', enabled);
  console.log('[EDIT_DEBUG] ═══════════════════════════════════════════════════════════════');
  
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
  
  // Initialize from "last used" when generation loads without persisted settings
  useEffect(() => {
    if (
      !generationSettings.isLoading && 
      !hasInitializedRef.current &&
      !generationSettings.hasPersistedSettings &&
      generationId
    ) {
      hasInitializedRef.current = true;
      
      console.log('[EDIT_DEBUG] 🎯 COORDINATOR: No persisted settings, initializing from "last used"');
      console.log('[EDIT_DEBUG] 🎯 COORDINATOR: generationId:', generationId.substring(0, 8));
      console.log('[EDIT_DEBUG] 🎯 COORDINATOR: lastUsed.editMode:', lastUsedSettings.lastUsed.editMode);
      console.log('[EDIT_DEBUG] 🎯 COORDINATOR: lastUsed.loraMode:', lastUsedSettings.lastUsed.loraMode);
      console.log('[EDIT_DEBUG] 🎯 COORDINATOR: lastUsed.numGenerations:', lastUsedSettings.lastUsed.numGenerations);
      
      // Apply "last used" settings (without prompt)
      generationSettings.initializeFromLastUsed(lastUsedSettings.lastUsed);
      
      // Mark as ready - the values will be computed from lastUsed below
      setIsReady(true);
    } else if (!generationSettings.isLoading && !hasInitializedRef.current && generationSettings.hasPersistedSettings) {
      hasInitializedRef.current = true;
      setIsReady(true);
      console.log('[EDIT_DEBUG] ✅ COORDINATOR: Using persisted settings from DB');
      console.log('[EDIT_DEBUG] ✅ COORDINATOR: generationId:', generationId?.substring(0, 8));
      console.log('[EDIT_DEBUG] ✅ COORDINATOR: editMode:', generationSettings.settings.editMode);
      console.log('[EDIT_DEBUG] ✅ COORDINATOR: loraMode:', generationSettings.settings.loraMode);
    }
  }, [
    generationId,
    generationSettings.isLoading, 
    generationSettings.hasPersistedSettings,
    generationSettings.initializeFromLastUsed,
    lastUsedSettings.lastUsed,
    generationSettings.settings.editMode,
    generationSettings.settings.loraMode,
  ]);
  
  // Compute effective values
  // When no persisted settings, use lastUsed values (not defaults from generationSettings)
  // This fixes the race condition where generationSettings.settings hasn't been updated yet
  const effectiveSettings = useMemo(() => {
    if (generationSettings.isLoading) {
      // Still loading, use defaults
      return DEFAULT_EDIT_SETTINGS;
    }
    
    if (generationSettings.hasPersistedSettings) {
      // Has persisted settings, use them
      return generationSettings.settings;
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
      };
    }

    // Initialized: use the live per-generation state (it already has lastUsed applied,
    // with prompts intentionally blank).
    return generationSettings.settings;
  }, [
    isReady,
    generationSettings.isLoading,
    generationSettings.hasPersistedSettings,
    generationSettings.settings,
    lastUsedSettings.lastUsed,
  ]);
  
  // Wrapper setters that also update "last used" (except prompt)
  // IMPORTANT: memoize these so downstream effects don't fire every render.
  const setEditMode = useCallback((mode: EditMode) => {
    console.log('[EDIT_DEBUG] 🔧 SET: editMode →', mode);
    generationSettings.setEditMode(mode);
    lastUsedSettings.updateLastUsed({ editMode: mode });
  }, [generationSettings, lastUsedSettings]);
  
  const setLoraMode = useCallback((mode: LoraMode) => {
    console.log('[EDIT_DEBUG] 🔧 SET: loraMode →', mode);
    generationSettings.setLoraMode(mode);
    lastUsedSettings.updateLastUsed({ loraMode: mode });
  }, [generationSettings, lastUsedSettings]);
  
  const setCustomLoraUrl = useCallback((url: string) => {
    console.log('[EDIT_DEBUG] 🔧 SET: customLoraUrl →', url || '(empty)');
    generationSettings.setCustomLoraUrl(url);
    lastUsedSettings.updateLastUsed({ customLoraUrl: url });
  }, [generationSettings, lastUsedSettings]);
  
  const setNumGenerations = useCallback((num: number) => {
    console.log('[EDIT_DEBUG] 🔧 SET: numGenerations →', num);
    generationSettings.setNumGenerations(num);
    lastUsedSettings.updateLastUsed({ numGenerations: num });
  }, [generationSettings, lastUsedSettings]);
  
  // Prompt only saves to generation (never to "last used")
  const setPrompt = useCallback((prompt: string) => {
    console.log('[EDIT_DEBUG] 🔧 SET: prompt →', prompt ? `"${prompt.substring(0, 30)}..."` : '(empty)');
    generationSettings.setPrompt(prompt);
  }, [generationSettings]);
  
  // Img2Img prompt only saves to generation (never to "last used")
  const setImg2imgPrompt = useCallback((prompt: string) => {
    console.log('[EDIT_DEBUG] 🔧 SET: img2imgPrompt →', prompt ? `"${prompt.substring(0, 30)}..."` : '(empty)');
    generationSettings.setImg2imgPrompt(prompt);
  }, [generationSettings]);

  // Img2Img setters (save to both generation and "last used")
  const setImg2imgStrength = useCallback((strength: number) => {
    console.log('[EDIT_DEBUG] 🔧 SET: img2imgStrength →', strength);
    generationSettings.setImg2imgStrength(strength);
    lastUsedSettings.updateLastUsed({ img2imgStrength: strength });
  }, [generationSettings, lastUsedSettings]);
  
  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    console.log('[EDIT_DEBUG] 🔧 SET: img2imgEnablePromptExpansion →', enabled);
    generationSettings.setImg2imgEnablePromptExpansion(enabled);
    lastUsedSettings.updateLastUsed({ img2imgEnablePromptExpansion: enabled });
  }, [generationSettings, lastUsedSettings]);
  
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
  
  // Log the final effective values being returned
  console.log('[EDIT_DEBUG] ───────────────────────────────────────────────────────────────');
  console.log('[EDIT_DEBUG] 📊 useEditSettingsPersistence RETURNING:');
  console.log('[EDIT_DEBUG] 📊 isLoading:', generationSettings.isLoading);
  console.log('[EDIT_DEBUG] 📊 isReady:', isReady);
  console.log('[EDIT_DEBUG] 📊 hasPersistedSettings:', generationSettings.hasPersistedSettings);
  console.log('[EDIT_DEBUG] 📊 editMode:', effectiveSettings.editMode);
  console.log('[EDIT_DEBUG] 📊 loraMode:', effectiveSettings.loraMode);
  console.log('[EDIT_DEBUG] 📊 numGenerations:', effectiveSettings.numGenerations);
  console.log('[EDIT_DEBUG] 📊 prompt:', effectiveSettings.prompt ? `"${effectiveSettings.prompt.substring(0, 30)}..."` : '(empty)');
  console.log('[EDIT_DEBUG] 📊 img2imgPrompt:', effectiveSettings.img2imgPrompt ? `"${effectiveSettings.img2imgPrompt.substring(0, 30)}..."` : '(empty)');
  console.log('[EDIT_DEBUG] 📊 img2imgPromptHasBeenSet:', effectiveSettings.img2imgPromptHasBeenSet);
  console.log('[EDIT_DEBUG] 📊 img2imgStrength:', effectiveSettings.img2imgStrength);
  console.log('[EDIT_DEBUG] 📊 img2imgEnablePromptExpansion:', effectiveSettings.img2imgEnablePromptExpansion);
  console.log('[EDIT_DEBUG] ───────────────────────────────────────────────────────────────');

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
    
    // Setters
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    // Img2Img setters
    setImg2imgPrompt,
    setImg2imgStrength,
    setImg2imgEnablePromptExpansion,
    
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
export type { EditMode, LoraMode, GenerationEditSettings, LastUsedEditSettings };
export { DEFAULT_EDIT_SETTINGS };

