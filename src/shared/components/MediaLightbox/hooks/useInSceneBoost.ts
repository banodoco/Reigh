import { useState, useMemo } from 'react';

interface UseInSceneBoostReturn {
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;
  inpaintLoras: Array<{ url: string; strength: number }> | undefined;
}

/**
 * Hook to manage In-Scene Boost state and generate loras array
 * Used by both inpainting and magic edit modes
 */
export const useInSceneBoost = (): UseInSceneBoostReturn => {
  const [isInSceneBoostEnabled, setIsInSceneBoostEnabled] = useState(true);

  // Build loras array for inpainting if In-Scene boost is enabled
  const inpaintLoras = useMemo(() => {
    if (isInSceneBoostEnabled) {
      return [{
        url: 'https://huggingface.co/peteromallet/ad_motion_loras/resolve/main/in_scene_different_perspective_000019000.safetensors',
        strength: 1.0
      }];
    }
    return undefined;
  }, [isInSceneBoostEnabled]);

  return {
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    inpaintLoras
  };
};

