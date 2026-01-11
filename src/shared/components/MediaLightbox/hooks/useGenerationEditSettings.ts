import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export type EditMode = 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
export type LoraMode = 'none' | 'in-scene' | 'next-scene' | 'custom';

/**
 * Settings stored per-generation in generations.params.ui.editSettings
 */
export interface GenerationEditSettings {
  editMode: EditMode;
  loraMode: LoraMode;
  customLoraUrl: string;
  numGenerations: number;
  prompt: string;
  // Img2Img specific settings
  img2imgStrength: number;
  img2imgEnablePromptExpansion: boolean;
}

export const DEFAULT_EDIT_SETTINGS: GenerationEditSettings = {
  editMode: 'text',
  loraMode: 'in-scene',
  customLoraUrl: '',
  numGenerations: 1,
  prompt: '',
  // Img2Img defaults
  img2imgStrength: 0.6,
  img2imgEnablePromptExpansion: false,
};

export interface UseGenerationEditSettingsReturn {
  // Current settings
  settings: GenerationEditSettings;
  
  // Individual setters (trigger debounced save)
  setEditMode: (mode: EditMode) => void;
  setLoraMode: (mode: LoraMode) => void;
  setCustomLoraUrl: (url: string) => void;
  setNumGenerations: (num: number) => void;
  setPrompt: (prompt: string) => void;
  // Img2Img setters
  setImg2imgStrength: (strength: number) => void;
  setImg2imgEnablePromptExpansion: (enabled: boolean) => void;
  
  // Bulk update
  updateSettings: (updates: Partial<GenerationEditSettings>) => void;
  
  // State
  isLoading: boolean;
  hasPersistedSettings: boolean;
  
  // For initialization from "last used"
  initializeFromLastUsed: (lastUsed: Omit<GenerationEditSettings, 'prompt'>) => void;
}

interface UseGenerationEditSettingsProps {
  generationId: string | null;
  enabled?: boolean;
}

/**
 * Hook for managing per-generation edit settings persistence
 * 
 * Saves to: generations.params.ui.editSettings
 * Pattern: Similar to useShotGenerationMetadata but for generations table
 */
export function useGenerationEditSettings({
  generationId,
  enabled = true,
}: UseGenerationEditSettingsProps): UseGenerationEditSettingsReturn {
  const queryClient = useQueryClient();
  
  // Local state
  const [settings, setSettings] = useState<GenerationEditSettings>(DEFAULT_EDIT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPersistedSettings, setHasPersistedSettings] = useState(false);
  
  // Track current generation to detect changes
  const currentGenerationIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const pendingInitFromLastUsedRef = useRef<Omit<GenerationEditSettings, 'prompt'> | null>(null);
  
  // Load settings from database
  const loadSettings = useCallback(async (genId: string): Promise<GenerationEditSettings | null> => {
    try {
      console.log('[EDIT_DEBUG] 📥 LOAD: Fetching from generations.params.ui.editSettings');
      console.log('[EDIT_DEBUG] 📥 LOAD: generationId:', genId.substring(0, 8));
      
      const { data, error } = await supabase
        .from('generations')
        .select('params')
        .eq('id', genId)
        .single();
      
      if (error) {
        console.warn('[EDIT_DEBUG] ❌ LOAD FAILED:', error.message);
        return null;
      }
      
      const savedSettings = (data?.params as any)?.ui?.editSettings;
      if (savedSettings) {
        console.log('[EDIT_DEBUG] ✅ LOAD SUCCESS: Found persisted settings');
        console.log('[EDIT_DEBUG] ✅ LOAD: editMode:', savedSettings.editMode);
        console.log('[EDIT_DEBUG] ✅ LOAD: loraMode:', savedSettings.loraMode);
        console.log('[EDIT_DEBUG] ✅ LOAD: customLoraUrl:', savedSettings.customLoraUrl || '(empty)');
        console.log('[EDIT_DEBUG] ✅ LOAD: numGenerations:', savedSettings.numGenerations);
        console.log('[EDIT_DEBUG] ✅ LOAD: prompt:', savedSettings.prompt ? `"${savedSettings.prompt.substring(0, 50)}..."` : '(empty)');
        return {
          ...DEFAULT_EDIT_SETTINGS,
          ...savedSettings,
        };
      }
      
      console.log('[EDIT_DEBUG] ⚠️ LOAD: No persisted settings found for this generation');
      return null;
    } catch (err) {
      console.warn('[EDIT_DEBUG] ❌ LOAD ERROR:', err);
      return null;
    }
  }, []);
  
  // Save settings to database (debounced)
  const saveSettings = useCallback(async (genId: string, newSettings: GenerationEditSettings) => {
    try {
      console.log('[EDIT_DEBUG] 💾 SAVE: Persisting to generations.params.ui.editSettings');
      console.log('[EDIT_DEBUG] 💾 SAVE: generationId:', genId.substring(0, 8));
      console.log('[EDIT_DEBUG] 💾 SAVE: editMode:', newSettings.editMode);
      console.log('[EDIT_DEBUG] 💾 SAVE: loraMode:', newSettings.loraMode);
      console.log('[EDIT_DEBUG] 💾 SAVE: customLoraUrl:', newSettings.customLoraUrl || '(empty)');
      console.log('[EDIT_DEBUG] 💾 SAVE: numGenerations:', newSettings.numGenerations);
      console.log('[EDIT_DEBUG] 💾 SAVE: prompt:', newSettings.prompt ? `"${newSettings.prompt.substring(0, 50)}..."` : '(empty)');
      console.log('[EDIT_DEBUG] 💾 SAVE: img2imgStrength:', newSettings.img2imgStrength);
      console.log('[EDIT_DEBUG] 💾 SAVE: img2imgEnablePromptExpansion:', newSettings.img2imgEnablePromptExpansion);
      
      // Fetch current params to merge
      const { data: current, error: fetchError } = await supabase
        .from('generations')
        .select('params')
        .eq('id', genId)
        .single();
      
      if (fetchError) {
        console.warn('[EDIT_DEBUG] ❌ SAVE: Failed to fetch current params:', fetchError.message);
        return;
      }
      
      // Merge with existing params
      const currentParams = (current?.params || {}) as Record<string, any>;
      const updatedParams = {
        ...currentParams,
        ui: {
          ...(currentParams.ui || {}),
          editSettings: newSettings,
          // Also save editMode at top level for backwards compatibility
          editMode: newSettings.editMode,
        }
      };
      
      const { error: updateError } = await supabase
        .from('generations')
        .update({ params: updatedParams })
        .eq('id', genId);
      
      if (updateError) {
        console.warn('[EDIT_DEBUG] ❌ SAVE FAILED:', updateError.message);
      } else {
        console.log('[EDIT_DEBUG] ✅ SAVE SUCCESS: Settings persisted to database');
        
        // Invalidate generation queries
        queryClient.invalidateQueries({ 
          queryKey: ['generation', genId] 
        });
      }
    } catch (err) {
      console.warn('[EDIT_DEBUG] ❌ SAVE ERROR:', err);
    }
  }, [queryClient]);
  
  // Debounced save trigger
  const triggerSave = useCallback((newSettings: GenerationEditSettings) => {
    if (!generationId || !isInitializedRef.current) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Schedule debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveSettings(generationId, newSettings);
    }, 500); // 500ms debounce
  }, [generationId, saveSettings]);
  
  // Load on mount / generation change
  useEffect(() => {
    if (!enabled || !generationId) {
      setIsLoading(false);
      return;
    }
    
    // Detect generation change
    if (currentGenerationIdRef.current !== generationId) {
      console.log('[EDIT_DEBUG] 🔄 Generation changed - will load settings');
      console.log('[EDIT_DEBUG] 🔄 from:', currentGenerationIdRef.current?.substring(0, 8) || 'none');
      console.log('[EDIT_DEBUG] 🔄 to:', generationId.substring(0, 8));
      
      currentGenerationIdRef.current = generationId;
      isInitializedRef.current = false;
      setIsLoading(true);
      setHasPersistedSettings(false);
      
      // Clear pending save for old generation
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }
    
    let cancelled = false;
    
    const load = async () => {
      const loaded = await loadSettings(generationId);
      
      if (cancelled) return;
      
      if (loaded) {
        setSettings(loaded);
        setHasPersistedSettings(true);
      } else {
        // No persisted settings - check if we have pending "last used" to apply
        if (pendingInitFromLastUsedRef.current) {
          console.log('[EDIT_DEBUG] 🔄 INIT: Applying pending "last used" settings (no persisted settings found)');
          console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.editMode:', pendingInitFromLastUsedRef.current.editMode);
          console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.loraMode:', pendingInitFromLastUsedRef.current.loraMode);
          setSettings({
            ...DEFAULT_EDIT_SETTINGS,
            ...pendingInitFromLastUsedRef.current,
            prompt: '', // Never inherit prompt
          });
          pendingInitFromLastUsedRef.current = null;
        } else {
          console.log('[EDIT_DEBUG] 🔄 INIT: Using defaults (no persisted or lastUsed settings)');
          setSettings(DEFAULT_EDIT_SETTINGS);
        }
        setHasPersistedSettings(false);
      }
      
      isInitializedRef.current = true;
      setIsLoading(false);
    };
    
    load();
    
    return () => { 
      cancelled = true; 
    };
  }, [generationId, enabled, loadSettings]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  // Individual setters
  const setEditMode = useCallback((mode: EditMode) => {
    setSettings(prev => {
      const updated = { ...prev, editMode: mode };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  const setLoraMode = useCallback((mode: LoraMode) => {
    setSettings(prev => {
      const updated = { ...prev, loraMode: mode };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  const setCustomLoraUrl = useCallback((url: string) => {
    setSettings(prev => {
      const updated = { ...prev, customLoraUrl: url };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  const setNumGenerations = useCallback((num: number) => {
    setSettings(prev => {
      const updated = { ...prev, numGenerations: num };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  const setPrompt = useCallback((prompt: string) => {
    setSettings(prev => {
      const updated = { ...prev, prompt };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  // Img2Img setters
  const setImg2imgStrength = useCallback((strength: number) => {
    setSettings(prev => {
      const updated = { ...prev, img2imgStrength: strength };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    setSettings(prev => {
      const updated = { ...prev, img2imgEnablePromptExpansion: enabled };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  // Bulk update
  const updateSettings = useCallback((updates: Partial<GenerationEditSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);
  
  // Initialize from "last used" - called when generation has no persisted settings
  const initializeFromLastUsed = useCallback((lastUsed: Omit<GenerationEditSettings, 'prompt'>) => {
    if (isLoading) {
      // Store for later application after load completes
      pendingInitFromLastUsedRef.current = lastUsed;
      console.log('[EDIT_DEBUG] ⏳ INIT: Queued "last used" settings for after load completes');
    } else if (!hasPersistedSettings) {
      // Apply immediately if we're loaded and have no persisted settings
      console.log('[EDIT_DEBUG] 🔄 INIT: Applying "last used" settings immediately');
      console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.editMode:', lastUsed.editMode);
      console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.loraMode:', lastUsed.loraMode);
      console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.numGenerations:', lastUsed.numGenerations);
      setSettings(prev => ({
        ...prev,
        ...lastUsed,
        prompt: '', // Never inherit prompt
      }));
    } else {
      console.log('[EDIT_DEBUG] ⏭️ INIT: Skipping "last used" - generation has persisted settings');
    }
  }, [isLoading, hasPersistedSettings]);
  
  return {
    settings,
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    setImg2imgStrength,
    setImg2imgEnablePromptExpansion,
    updateSettings,
    isLoading,
    hasPersistedSettings,
    initializeFromLastUsed,
  };
}

