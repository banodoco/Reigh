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
  // Variant name editing (only for modal variant)
  generationName?: string;
  onGenerationNameChange?: (name: string) => void;
  isEditingGenerationName?: boolean;
  onEditingGenerationNameChange?: (editing: boolean) => void;
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
      imageGridCols: isMobile ? 'grid-cols-3' : inputImagesCount <= 4 ? 'grid-cols-4' : inputImagesCount <= 8 ? 'grid-cols-4' : 'grid-cols-6',
      maxImages: isMobile ? 6 : inputImagesCount <= 4 ? 4 : inputImagesCount <= 8 ? 8 : 11,
      promptLength: isMobile ? 100 : 150,
      negativePromptLength: isMobile ? 100 : 150,
      loraNameLength: 40,
      maxLoras: 10,
    },
  };
  return configs[variant];
}

/**
 * Parse task params, handling both string and object formats
 */
export function parseTaskParams(params: any): Record<string, any> {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
  return params;
}

/**
 * Derive input images from various param locations
 * Checks top-level params, orchestrator_details, and full_orchestrator_payload
 */
export function deriveInputImages(parsedParams: Record<string, any>): string[] {
  const urls: string[] = [];
  const p = parsedParams;
  const od = p?.orchestrator_details;
  const op = p?.full_orchestrator_payload;
  const isp = p?.individual_segment_params;
  
  // Image edit task paths
  if (typeof p?.image_url === 'string') urls.push(p.image_url);
  if (typeof p?.image === 'string') urls.push(p.image);
  if (typeof p?.input_image === 'string') urls.push(p.input_image);
  if (typeof p?.init_image === 'string') urls.push(p.init_image);
  if (Array.isArray(p?.images)) urls.push(...p.images.filter((x: any) => typeof x === 'string'));
  if (Array.isArray(p?.input_images)) urls.push(...p.input_images.filter((x: any) => typeof x === 'string'));
  if (typeof p?.mask_url === 'string') urls.push(p.mask_url);
  
  // Travel/video task paths (input_image_paths_resolved)
  // For individual_travel_segment, check top-level first (segment-specific images)
  if (Array.isArray(p?.input_image_paths_resolved)) {
    urls.push(...p.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  }
  // Check orchestrator_details
  if (Array.isArray(od?.input_image_paths_resolved)) {
    urls.push(...od.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  }
  // Check full_orchestrator_payload
  if (Array.isArray(op?.input_image_paths_resolved)) {
    urls.push(...op.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  }
  // Check individual_segment_params
  if (Array.isArray(isp?.input_image_paths_resolved)) {
    urls.push(...isp.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  }
  
  return Array.from(new Set(urls.filter(Boolean)));
}

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

