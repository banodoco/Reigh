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
  
  // Setters (each triggers persistence)
  setEditMode: (mode: EditMode) => void;
  setLoraMode: (mode: LoraMode) => void;
  setCustomLoraUrl: (url: string) => void;
  setNumGenerations: (num: number) => void;
  setPrompt: (prompt: string) => void;
  
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
  
  // Initialize from "last used" when generation loads without persisted settings
  useEffect(() => {
    if (
      !generationSettings.isLoading && 
      !hasInitializedRef.current &&
      !generationSettings.hasPersistedSettings &&
      generationId
    ) {
      hasInitializedRef.current = true;
      
      console.log('[EditSettingsPersist] 🎯 COORDINATOR: No persisted settings, initializing from "last used"');
      console.log('[EditSettingsPersist] 🎯 COORDINATOR: generationId:', generationId.substring(0, 8));
      console.log('[EditSettingsPersist] 🎯 COORDINATOR: lastUsed.editMode:', lastUsedSettings.lastUsed.editMode);
      console.log('[EditSettingsPersist] 🎯 COORDINATOR: lastUsed.loraMode:', lastUsedSettings.lastUsed.loraMode);
      console.log('[EditSettingsPersist] 🎯 COORDINATOR: lastUsed.numGenerations:', lastUsedSettings.lastUsed.numGenerations);
      
      // Apply "last used" settings (without prompt)
      generationSettings.initializeFromLastUsed(lastUsedSettings.lastUsed);
      
      // Mark as ready - the values will be computed from lastUsed below
      setIsReady(true);
    } else if (!generationSettings.isLoading && !hasInitializedRef.current && generationSettings.hasPersistedSettings) {
      hasInitializedRef.current = true;
      setIsReady(true);
      console.log('[EditSettingsPersist] ✅ COORDINATOR: Using persisted settings from DB');
      console.log('[EditSettingsPersist] ✅ COORDINATOR: generationId:', generationId?.substring(0, 8));
      console.log('[EditSettingsPersist] ✅ COORDINATOR: editMode:', generationSettings.settings.editMode);
      console.log('[EditSettingsPersist] ✅ COORDINATOR: loraMode:', generationSettings.settings.loraMode);
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
    
    // No persisted settings - use lastUsed values (with empty prompt)
    return {
      editMode: lastUsedSettings.lastUsed.editMode,
      loraMode: lastUsedSettings.lastUsed.loraMode,
      customLoraUrl: lastUsedSettings.lastUsed.customLoraUrl,
      numGenerations: lastUsedSettings.lastUsed.numGenerations,
      prompt: '', // Never inherit prompt
    };
  }, [
    generationSettings.isLoading,
    generationSettings.hasPersistedSettings,
    generationSettings.settings,
    lastUsedSettings.lastUsed,
  ]);
  
  // Wrapper setters that also update "last used" (except prompt)
  // IMPORTANT: memoize these so downstream effects don't fire every render.
  const setEditMode = useCallback((mode: EditMode) => {
    console.log('[EditSettingsPersist] 🔧 SET: editMode →', mode);
    generationSettings.setEditMode(mode);
    lastUsedSettings.updateLastUsed({ editMode: mode });
  }, [generationSettings, lastUsedSettings]);
  
  const setLoraMode = useCallback((mode: LoraMode) => {
    console.log('[EditSettingsPersist] 🔧 SET: loraMode →', mode);
    generationSettings.setLoraMode(mode);
    lastUsedSettings.updateLastUsed({ loraMode: mode });
  }, [generationSettings, lastUsedSettings]);
  
  const setCustomLoraUrl = useCallback((url: string) => {
    console.log('[EditSettingsPersist] 🔧 SET: customLoraUrl →', url || '(empty)');
    generationSettings.setCustomLoraUrl(url);
    lastUsedSettings.updateLastUsed({ customLoraUrl: url });
  }, [generationSettings, lastUsedSettings]);
  
  const setNumGenerations = useCallback((num: number) => {
    console.log('[EditSettingsPersist] 🔧 SET: numGenerations →', num);
    generationSettings.setNumGenerations(num);
    lastUsedSettings.updateLastUsed({ numGenerations: num });
  }, [generationSettings, lastUsedSettings]);
  
  // Prompt only saves to generation (never to "last used")
  const setPrompt = useCallback((prompt: string) => {
    console.log('[EditSettingsPersist] 🔧 SET: prompt →', prompt ? `"${prompt.substring(0, 30)}..."` : '(empty)');
    generationSettings.setPrompt(prompt);
  }, [generationSettings]);
  
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
    
    // Setters
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    
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

