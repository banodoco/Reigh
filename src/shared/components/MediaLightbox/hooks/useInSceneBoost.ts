import { useState, useMemo } from 'react';

export type LoraMode = 'none' | 'in-scene' | 'next-scene' | 'custom';

interface UseInSceneBoostReturn {
  // Legacy boolean support for backward compatibility
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;
  // New lora mode support
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  inpaintLoras: Array<{ url: string; strength: number }> | undefined;
}

/**
 * Hook to manage Lora mode state and generate loras array
 * Supports: In-Scene, Next Scene, Custom, or None
 * Used by both inpainting and magic edit modes
 */
export const useInSceneBoost = (): UseInSceneBoostReturn => {
  const [loraMode, setLoraMode] = useState<LoraMode>('in-scene');
  const [customLoraUrl, setCustomLoraUrl] = useState<string>('');

  // Legacy boolean support - map to new lora mode
  const isInSceneBoostEnabled = loraMode !== 'none';
  const setIsInSceneBoostEnabled = (enabled: boolean) => {
    setLoraMode(enabled ? 'in-scene' : 'none');
  };

  // Build loras array based on selected mode
  const inpaintLoras = useMemo(() => {
    switch (loraMode) {
      case 'in-scene':
        return [{
          url: 'https://huggingface.co/peteromallet/ad_motion_loras/resolve/main/in_scene_different_perspective_000019000.safetensors',
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
    // Legacy boolean support
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    // New lora mode support
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    inpaintLoras
  };
};

