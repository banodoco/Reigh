import { useState, useRef, useCallback } from 'react';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { fal } from '@fal-ai/client';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { GeneratedImageWithMetadata, DisplayableMetadata, MetadataLora } from '@/shared/components/ImageGallery';
import { PromptEntry } from '@/tools/image-generation/components/ImageGenerationForm'; // Assuming this path, adjust if needed
import { nanoid } from 'nanoid';

// Local type definition
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Types for the hook
export interface FalImageGenerationParams {
  prompts: PromptEntry[];
  imagesPerPrompt: number;
  falModelId?: string; // e.g., "fal-ai/flux-general"
  numInferenceSteps?: number;
  enableSafetyChecker?: boolean;
  guidanceScale?: number;
  realCfgScale?: number;
  baseShift?: number;
  maxShift?: number;
  scheduler?: string;
  imageSize?: string; // e.g., "portrait_16_9"
  loras?: { path: string; scale: string }[];
  controlnets?: { path: string; end_percentage: number; conditioning_scale: number; control_image_url: string }[]; // control_image_url might be prepared by the hook
  controlLoras?: { path: string; preprocess: string; control_image_url: string; scale: string }[]; // control_image_url might be prepared by the hook
  startingImageFile?: File | null;
  appliedStartingImageUrl?: string | null; // If image already uploaded
  fullSelectedLorasForMetadata?: MetadataLora[]; // This seems more for metadata AFTER generation, review if needed in task params
  depthStrength?: number;
  softEdgeStrength?: number;
  toolType: string; // e.g., 'image_generation_flux', 'edit_travel_flux'. Used for task_type.
  originalFrameTimestamp?: number;
  original_image_filename?: string;
  customMetadataFields?: Record<string, any>;
  // Add projectId here if we decide to pass it to the hook directly instead of generateImages
}

// Remove FalGenerationProgress - progress will be tracked via task status
// export interface FalGenerationProgress { ... }

export interface CreatedTaskInfo {
  taskId: string;
  // Potentially include other task details if needed by the caller immediately
}

export interface UseFalImageGenerationResult {
  isCreatingTask: boolean; // Renamed from isGenerating
  // Remove generationProgress
  // generateImages function signature changes
  createGenerationTask: (params: FalImageGenerationParams, selectedProjectId: string) => Promise<CreatedTaskInfo | null>;
  // cancelGeneration might be removed or re-purposed if we can cancel task creation itself,
  // but cancelling a pending task in DB is a different operation. For now, remove.
  // cancelGeneration: () => void; 
}

const defaultFalModelId = "fal-ai/flux-general";

// Updated helper function to map aspect ratio strings to Fal-compatible image_size values
const mapAspectRatioToFalImageSize = (aspectRatio?: string): string | undefined => {
  if (!aspectRatio) {
    console.log("[mapAspectRatioToFalImageSize] No aspect ratio provided, using Fal default for image_size.");
    return undefined; 
  }

  const normalizedRatio = aspectRatio.replace(/\s+/g, '');

  // Exact enum values from Fal documentation for FLUX models:
  // square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9

  switch (normalizedRatio) {
    case "1:1":
      return "square_hd"; // Or "square" for potentially smaller default
    case "16:9": // Landscape
      return "landscape_16_9";
    case "9:16": // Portrait
      return "portrait_16_9"; // Fal uses width-based naming for portrait (e.g. 9 wide, 16 high for portrait_16_9)
    case "4:3": // Landscape
      return "landscape_4_3";
    case "3:4": // Portrait
      return "portrait_4_3";
    // Add other direct mappings if your UI explicitly offers them and they match enums
    // For example, if your UI had an option that directly translated to "square"
    // case "custom_square_low_res":
    //   return "square";
  }

  // If it's already a valid-looking Fal enum (e.g., passed directly from a more advanced form)
  if (["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"].includes(normalizedRatio)) {
    return normalizedRatio;
  }
  
  // Fallback for unmapped ratios (e.g., "21:9", "2:3" etc.)
  // Option 1: Let Fal use its default by returning undefined
  console.warn(`[mapAspectRatioToFalImageSize] Aspect ratio "${aspectRatio}" does not map to a standard Fal enum. Using Fal default for image_size.`);
  return undefined; 

  // Option 2: Try to parse W:H and construct a {width, height} object - this is more complex
  // and requires knowing the actual pixel dimensions from the source, ensuring they are multiples of 32.
  // For now, Option 1 is safer with current information.
};

export const useFalImageGeneration = (): UseFalImageGenerationResult => {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  // const cancelGenerationRef = useRef(false); // Remove, task cancellation is different
  // const currentSubscriptionRef = useRef<any>(null); // Remove

  // Retrieve API keys (Fal, etc.) via persistent user settings
  const { getApiKey } = useApiKeys();

  // Remove old cancelGeneration based on Fal subscription
  // const cancelGeneration = useCallback(() => { ... }, []);

  const createGenerationTask = useCallback(
    async (params: FalImageGenerationParams, selectedProjectId: string): Promise<CreatedTaskInfo | null> => {
      console.log("[useFalImageGeneration] createGenerationTask CALLED for API.");
      if (!selectedProjectId) {
        toast.error("No project selected. Cannot create task.");
        return null;
      }
      if (!params.toolType) {
        toast.error("Task type (toolType) not specified in params. Cannot create task.");
        return null;
      }

      setIsCreatingTask(true);
      let userImageUrl: string | null = params.appliedStartingImageUrl || null;

      const {
        // Destructure params as before, but exclude startingImageFile for the final taskDbParamsForApi
        prompts: submittedPrompts,
        imagesPerPrompt,
        falModelId = defaultFalModelId,
        numInferenceSteps = 28,
        enableSafetyChecker = false,
        guidanceScale = 3.5,
        realCfgScale = 3.5,
        baseShift = 0.5,
        maxShift = 1.15,
        scheduler = "euler",
        imageSize: rawImageSize,
        loras: lorasForApi = [],
        controlnets: controlnetsFromParams = [],
        controlLoras: controlLorasFromParams = [],
        startingImageFile, // Keep for upload logic
        depthStrength,
        softEdgeStrength,
        toolType, // This will be task_type for the API payload
        originalFrameTimestamp,
        original_image_filename,
        customMetadataFields,
      } = params;

      try {
        if (startingImageFile && !userImageUrl) {
          toast.info("Uploading starting image for task...");
          try {
            userImageUrl = await uploadImageToStorage(startingImageFile);
            if (userImageUrl) {
              toast.success("Starting image uploaded successfully!");
            } else {
              toast.error("Starting image upload failed. Task creation via API might fail or proceed without it if allowed by worker.");
            }
          } catch (uploadError: any) {
            console.error("[useFalImageGeneration] Error uploading starting image:", uploadError);
            toast.error(`Failed to upload starting image: ${uploadError.message}`);
            setIsCreatingTask(false);
            return null;
          }
        }
        
        const finalControlnets = controlnetsFromParams.map(cn => ({ 
            ...cn, 
            control_image_url: cn.control_image_url || userImageUrl || ""
        }));
        const finalControlLoras = controlLorasFromParams.map(cl => ({ 
            ...cl, 
            control_image_url: cl.control_image_url || userImageUrl || ""
        }));
        
        const activeControlnets: any[] = [...finalControlnets];
        const activeControlLoras: any[] = [...finalControlLoras];

        if (userImageUrl && softEdgeStrength && softEdgeStrength > 0) {
            activeControlnets.push({
                path: "https://huggingface.co/XLabs-AI/flux-controlnet-hed-v3/resolve/main/flux-hed-controlnet-v3.safetensors",
                control_image_url: userImageUrl,
                conditioning_scale: softEdgeStrength,
            });
        }
        if (userImageUrl && depthStrength && depthStrength > 0) {
            activeControlLoras.push({
                path: "https://huggingface.co/black-forest-labs/FLUX.1-Depth-dev-lora/resolve/main/flux1-depth-dev-lora.safetensors",
                control_image_url: userImageUrl, 
                scale: depthStrength,
                preprocess: "depth",
            });
        }

        const falCompatibleImageSize = mapAspectRatioToFalImageSize(rawImageSize);

        const taskDbParamsForApi: Omit<FalImageGenerationParams, 'startingImageFile' | 'appliedStartingImageUrl' | 'toolType'> & { 
            input_image_url?: string | null;
            controlnets?: any[]; 
            control_loras?: any[];
            image_size?: string | undefined; 
        } = {
          prompts: submittedPrompts,
          imagesPerPrompt,
          falModelId,
          numInferenceSteps,
          enableSafetyChecker,
          guidanceScale,
          realCfgScale,
          baseShift,
          maxShift,
          scheduler,
          image_size: falCompatibleImageSize,
          loras: lorasForApi,
          controlnets: activeControlnets.length > 0 ? activeControlnets : undefined,
          control_loras: activeControlLoras.length > 0 ? activeControlLoras : undefined,
          input_image_url: userImageUrl,
          depthStrength, 
          softEdgeStrength, 
          originalFrameTimestamp,
          original_image_filename,
          customMetadataFields,
        };
        
        Object.keys(taskDbParamsForApi).forEach(key => (taskDbParamsForApi as any)[key] === undefined && delete (taskDbParamsForApi as any)[key]);

        const apiPayload = {
            project_id: selectedProjectId,
            task_type: toolType, // toolType from params is used as task_type for API
            params: taskDbParamsForApi as unknown as Json,
            status: 'Queued',
        };

        // Optionally include API key in request headers if backend expects it
        const falApiKey = getApiKey('fal_api_key');
        toast.info(`Creating '${toolType}' task via API...`);

        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(falApiKey ? { 'X-Fal-Key': falApiKey } : {}) },
            body: JSON.stringify(apiPayload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `HTTP error ${response.status}`);
        }

        const newTask = await response.json();

        if (newTask && newTask.id) {
          const taskIdStr = String(newTask.id);
          console.log(`[useFalImageGeneration] Task created via API (type: ${toolType}):`, newTask);
          toast.success(`Task '${toolType}' (ID: ${taskIdStr.substring(0,8)}) created successfully via API.`);
          return { taskId: taskIdStr };
        } else {
          toast.error("Task creation via API returned no data or task ID.");
          return null;
        }

      } catch (err: any) {
        console.error(`[useFalImageGeneration] Exception during API task creation (type: ${params.toolType}):`, err);
        toast.error(`An unexpected error occurred with API: ${err.message}`);
        return null;
      } finally {
        setIsCreatingTask(false);
      }
    },
    [] 
  );

  return {
    isCreatingTask,
    createGenerationTask,
  };
};

// initializeGlobalFalClient is likely not needed anymore if this hook doesn't use fal directly
// Or it should only be called if fal is used elsewhere. For now, let's assume it might be removed.
// Comment it out for now.
/*
export const initializeGlobalFalClient = () => {
  const API_KEY = localStorage.getItem('fal_api_key');
  if (API_KEY) {
    try {
      fal.config({ credentials: API_KEY });
      console.log("[FalClientConfig] Fal client configured globally (e.g., by useFalImageGeneration or EditTravel).");
    } catch (e) {
      console.error("[FalClientConfig] Error configuring Fal client globally:", e);
    }
  }
  return API_KEY;
};
*/

// Legacy Fal client initialization removed – API keys are now resolved via useApiKeys and passed per request.

// If fal is not used in this file anymore, the import can be removed.
// import { fal } from '@fal-ai/client'; // Check if still needed after all changes

// Helper to initialize Fal client - now uses database-based API keys
// This is deprecated in favor of per-request API key resolution via useApiKeys
let falInitialized = false;
export const initializeGlobalFalClient = () => {
  if (falInitialized) return;
  
  // Note: This function is deprecated and should not be used for new code.
  // Use useApiKeys hook to get database-stored API keys instead of localStorage.
  // Keeping this for backward compatibility but it will use fallback API key.
  
  const FALLBACK_API_KEY = '0b6f1876-0aab-4b56-b821-b384b64768fa:121392c885a381f93de56d701e3d532f';
  
  try {
    fal.config({ credentials: FALLBACK_API_KEY });
    console.warn("[FalClientConfig] Using fallback API key. Consider migrating to useApiKeys hook for database-based storage.");
    falInitialized = true;
  } catch (e) {
    console.error("[FalClientConfig] Error configuring Fal client globally:", e);
  }
}; 