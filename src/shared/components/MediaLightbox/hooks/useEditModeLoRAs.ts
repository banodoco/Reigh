import { useState, useMemo } from 'react';

export type LoraMode = 'none' | 'in-scene' | 'next-scene' | 'custom';

interface UseEditModeLoRAsReturn {
  // Mode selection for automatic LoRAs
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  
  // Custom URL support
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  
  // The computed LoRAs based on mode
  editModeLoRAs: Array<{ url: string; strength: number }> | undefined;
  
  // Legacy boolean support for backward compatibility
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;
}

/**
 * Hook to manage LoRA mode state for image editing operations
 * Supports: In-Scene, Next Scene, Custom, or None
 * Used by both inpainting and magic edit modes
 */
export const useEditModeLoRAs = (): UseEditModeLoRAsReturn => {
  const [loraMode, setLoraMode] = useState<LoraMode>('in-scene');
  const [customLoraUrl, setCustomLoraUrl] = useState<string>('');

  // Legacy boolean support - map to new lora mode
  const isInSceneBoostEnabled = loraMode !== 'none';
  const setIsInSceneBoostEnabled = (enabled: boolean) => {
    setLoraMode(enabled ? 'in-scene' : 'none');
  };

  // Build loras array based on selected mode
  const editModeLoRAs = useMemo(() => {
    switch (loraMode) {
      case 'in-scene':
        return [{
          url: 'https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors',
          strength: 1.0
        }];
      case 'next-scene':
        return [{
          url: 'https://huggingface.co/lovis93/next-scene-qwen-image-lora-2509/resolve/main/next-scene_lora-v2-3000.safetensors',
          strength: 1.0
        }];
      case 'custom':
        // Only return custom lora if URL is provided
        return customLoraUrl.trim() ? [{
          url: customLoraUrl.trim(),
          strength: 1.0
        }] : undefined;
      case 'none':
      default:
        return undefined;
    }
  }, [loraMode, customLoraUrl]);

  return {
    // Mode selection
    loraMode,
    setLoraMode,
    // Custom URL
    customLoraUrl,
    setCustomLoraUrl,
    // Computed LoRAs
    editModeLoRAs,
    // Legacy boolean support
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
  };
};

