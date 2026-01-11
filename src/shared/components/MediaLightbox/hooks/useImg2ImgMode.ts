import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { createBatchZImageTurboI2ITasks, ZImageLoraConfig } from '@/shared/lib/tasks/zImageTurboI2I';
import { useLoraManager, UseLoraManagerReturn, ActiveLora, LoraModel } from '@/shared/hooks/useLoraManager';

export interface UseImg2ImgModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  isVideo: boolean;
  sourceUrlForTasks: string;
  toolTypeOverride?: string;
  createAsGeneration?: boolean;
  availableLoras?: LoraModel[];
  // Persisted values from editSettingsPersistence
  img2imgStrength: number;
  setImg2imgStrength: (strength: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (enabled: boolean) => void;
  // Prompt is persisted per-generation (shared with other edit modes)
  img2imgPrompt: string;
  setImg2imgPrompt: (prompt: string) => void;
  // Number of generations (shared with other edit modes)
  numGenerations: number;
}

export interface UseImg2ImgModeReturn {
  // State
  img2imgPrompt: string;
  img2imgStrength: number;
  enablePromptExpansion: boolean;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;

  // Setters
  setImg2imgPrompt: (prompt: string) => void;
  setImg2imgStrength: (strength: number) => void;
  setEnablePromptExpansion: (enabled: boolean) => void;

  // LoRA Manager (full access)
  loraManager: UseLoraManagerReturn;

  // Actions
  handleGenerateImg2Img: () => Promise<void>;
}

/**
 * Hook for managing Img2Img mode state and generation
 * Uses Z Image Turbo I2I task type with full LoRA selector support
 * 
 * Strength, enablePromptExpansion, and prompt are persisted via editSettingsPersistence
 * Prompt is persisted per-generation (shared with other edit modes, never inherited)
 */
export const useImg2ImgMode = ({
  media,
  selectedProjectId,
  isVideo,
  sourceUrlForTasks,
  toolTypeOverride,
  createAsGeneration,
  availableLoras = [],
  // Persisted values
  img2imgStrength,
  setImg2imgStrength,
  enablePromptExpansion,
  setEnablePromptExpansion,
  // Prompt is persisted per-generation
  img2imgPrompt,
  setImg2imgPrompt,
  // Number of generations (shared)
  numGenerations,
}: UseImg2ImgModeProps): UseImg2ImgModeReturn => {
  
  console.log('[EDIT_DEBUG] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓');
  console.log('[EDIT_DEBUG] 🖼️ useImg2ImgMode HOOK CALLED');
  console.log('[EDIT_DEBUG] 🖼️ mediaId:', media?.id?.substring(0, 8) || 'null');
  console.log('[EDIT_DEBUG] 🖼️ PERSISTED img2imgStrength:', img2imgStrength);
  console.log('[EDIT_DEBUG] 🖼️ PERSISTED enablePromptExpansion:', enablePromptExpansion);
  console.log('[EDIT_DEBUG] 🖼️ PERSISTED img2imgPrompt:', img2imgPrompt ? `"${img2imgPrompt.substring(0, 30)}..."` : '(empty)');
  console.log('[EDIT_DEBUG] 🖼️ availableLoras count:', availableLoras.length);
  console.log('[EDIT_DEBUG] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓');
  // Local state (not persisted)
  const [isGeneratingImg2Img, setIsGeneratingImg2Img] = useState(false);
  const [img2imgGenerateSuccess, setImg2imgGenerateSuccess] = useState(false);

  // Use the shared LoRA manager hook
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none', // Don't persist for img2img - it's a quick tool
    enableProjectPersistence: false,
    disableAutoLoad: true,
  });

  // Track generation to prevent double-submits
  const isSubmittingRef = useRef(false);

  const handleGenerateImg2Img = useCallback(async () => {
    // Validate inputs
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    if (isVideo) {
      toast.error('Img2Img is only available for images');
      return;
    }

    if (!sourceUrlForTasks) {
      toast.error('No source image URL available');
      return;
    }

    // Prevent double-submits
    if (isSubmittingRef.current) {
      console.log('[Img2Img] Already submitting, ignoring');
      return;
    }

    isSubmittingRef.current = true;
    setIsGeneratingImg2Img(true);

    try {
      // Convert selected LoRAs to the format expected by the task
      const loras: ZImageLoraConfig[] = loraManager.selectedLoras.map((lora: ActiveLora) => ({
        path: lora.path,
        scale: lora.strength,
      }));

      console.log('[Img2Img] Starting generation...', {
        mediaId: media.id,
        prompt: img2imgPrompt,
        strength: img2imgStrength,
        enablePromptExpansion,
        numGenerations,
        loraCount: loras.length,
      });

      // Get actual generation ID (handle shot_generations case)
      const actualGenerationId = (media as any).generation_id || media.id;

      // Create tasks based on numGenerations
      await createBatchZImageTurboI2ITasks({
        project_id: selectedProjectId,
        image_url: sourceUrlForTasks,
        prompt: img2imgPrompt.trim() || undefined,
        strength: img2imgStrength,
        enable_prompt_expansion: enablePromptExpansion,
        numImages: numGenerations,
        loras: loras.length > 0 ? loras : undefined,
        based_on: actualGenerationId,
        create_as_generation: createAsGeneration,
        tool_type: toolTypeOverride,
      });

      console.log('[Img2Img] ✅ Tasks created successfully');

      // Show success state
      setImg2imgGenerateSuccess(true);

      // Reset success state after 2 seconds
      setTimeout(() => {
        setImg2imgGenerateSuccess(false);
      }, 2000);

    } catch (error) {
      console.error('[Img2Img] Error creating tasks:', error);
      toast.error(`Failed to create Img2Img tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingImg2Img(false);
      isSubmittingRef.current = false;
    }
  }, [
    selectedProjectId,
    isVideo,
    sourceUrlForTasks,
    media,
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    numGenerations,
    loraManager.selectedLoras,
    createAsGeneration,
    toolTypeOverride,
  ]);

  return {
    // State
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,

    // Setters
    setImg2imgPrompt,
    setImg2imgStrength,
    setEnablePromptExpansion,

    // LoRA Manager
    loraManager,

    // Actions
    handleGenerateImg2Img,
  };
};
