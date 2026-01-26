import { LoraModel } from '@/shared/components/LoraSelectorModal';

/**
 * Shared types and configuration for task details components
 */

export interface TaskDetailsProps {
  task: any;
  inputImages: string[];
  variant: 'hover' | 'modal' | 'panel';
  isMobile?: boolean;
  showAllImages?: boolean;
  onShowAllImagesChange?: (show: boolean) => void;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  // Available LoRAs for proper name display
  availableLoras?: LoraModel[];
}

export interface VariantConfig {
  textSize: string;
  fontWeight: string;
  iconSize: string;
  labelCase: string;
  gridCols: string;
  imageGridCols: string;
  maxImages: number;
  promptLength: number;
  negativePromptLength: number;
  loraNameLength: number;
  maxLoras: number;
}

/**
 * Get size configuration based on variant
 */
export function getVariantConfig(
  variant: 'hover' | 'modal' | 'panel',
  isMobile: boolean,
  inputImagesCount: number
): VariantConfig {
  const configs: Record<'hover' | 'modal' | 'panel', VariantConfig> = {
    hover: {
      textSize: 'text-xs',
      fontWeight: 'font-light',
      iconSize: 'h-2.5 w-2.5',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: 'grid-cols-6',
      maxImages: 5,
      promptLength: 100,
      negativePromptLength: 80,
      loraNameLength: 25,
      maxLoras: 2,
    },
    modal: {
      textSize: 'text-sm',
      fontWeight: 'font-light',
      iconSize: 'h-3 w-3',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: 'grid-cols-6',
      maxImages: 5,
      promptLength: 150,
      negativePromptLength: 150,
      loraNameLength: 30,
      maxLoras: 10,
    },
    panel: {
      textSize: 'text-sm',
      fontWeight: 'font-light',
      iconSize: 'h-3 w-3',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: isMobile ? 'grid-cols-6' : inputImagesCount <= 4 ? 'grid-cols-4' : inputImagesCount <= 8 ? 'grid-cols-4' : 'grid-cols-6',
      maxImages: isMobile ? 6 : inputImagesCount <= 4 ? 4 : inputImagesCount <= 8 ? 8 : 11,
      promptLength: isMobile ? 100 : 150,
      negativePromptLength: isMobile ? 100 : 150,
      loraNameLength: 40,
      maxLoras: 10,
    },
  };
  return configs[variant];
}

// Re-export shared utilities for backward compatibility
export { parseTaskParams, deriveInputImages, derivePrompt } from '@/shared/utils/taskParamsUtils';

/**
 * Extract LoRAs from task params (checks multiple locations)
 */
export interface LoraInfo {
  url: string;
  strength: number;
  displayName: string;
}

export function extractLoras(parsedParams: Record<string, any>): LoraInfo[] {
  const p = parsedParams;
  const od = p?.orchestrator_details;
  const op = p?.full_orchestrator_payload;
  
  // Check for array format (image edit tasks use this)
  const lorasArray = p?.loras || od?.loras || op?.loras;
  if (Array.isArray(lorasArray) && lorasArray.length > 0) {
    return lorasArray.map((lora: any) => ({
      url: lora.url || '',
      strength: lora.strength ?? lora.multiplier ?? 1,
      displayName: extractLoraDisplayName(lora.url || ''),
    }));
  }
  
  // Check for object format (video tasks use additional_loras)
  const additionalLoras = p?.additional_loras || od?.additional_loras || op?.additional_loras;
  if (additionalLoras && typeof additionalLoras === 'object' && Object.keys(additionalLoras).length > 0) {
    return Object.entries(additionalLoras).map(([url, strength]) => ({
      url,
      strength: strength as number,
      displayName: extractLoraDisplayName(url),
    }));
  }
  
  return [];
}

function extractLoraDisplayName(url: string): string {
  const fileName = url.split('/').pop() || 'Unknown';
  return fileName.replace(/\.(safetensors|ckpt|pt)$/i, '').replace(/_/g, ' ');
}

/**
 * Image edit task types
 */
export const IMAGE_EDIT_TASK_TYPES = [
  'z_image_turbo_i2i',
  'image_inpaint',
  'qwen_image_edit',
  'magic_edit',
  'kontext_image_edit',
  'flux_image_edit',
  'annotated_image_edit',
];

export function isImageEditTaskType(taskType: string | undefined): boolean {
  return IMAGE_EDIT_TASK_TYPES.includes(taskType || '');
}

