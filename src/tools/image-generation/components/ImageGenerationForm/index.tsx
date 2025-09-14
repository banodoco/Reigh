import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo, Suspense } from "react";
import { LoraSelectorModal, LoraModel } from "@/shared/components/LoraSelectorModal";
import { DisplayableMetadata } from "@/shared/components/ImageGallery";
import { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { toast } from "sonner";
import { cropImageToClosestAspectRatio, CropResult } from "@/shared/lib/imageCropper";
import { useToast } from "@/shared/hooks/use-toast";
import { fileToDataURL, dataURLtoFile } from "@/shared/lib/utils";
import { useProject } from "@/shared/contexts/ProjectContext";
import { usePersistentToolState } from "@/shared/hooks/usePersistentToolState";
import { useToolSettings } from "@/shared/hooks/useToolSettings";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { ImageGenerationSettings } from "../../settings";
import { useListPublicResources } from '@/shared/hooks/useResources';
import { useListShots, useCreateShot } from "@/shared/hooks/useShots";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useQueryClient } from '@tanstack/react-query';
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { BatchImageGenerationTaskParams } from "@/shared/lib/tasks/imageGeneration";
import { processStyleReferenceForAspectRatioString } from "@/shared/lib/styleReferenceProcessor";
import { resolveProjectResolution } from "@/shared/lib/taskCreation";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";

// Import extracted components
import { PromptsSection } from "./components/PromptsSection";
import { ShotSelector } from "./components/ShotSelector";
import { ModelSection } from "./components/ModelSection";
import { GenerateControls } from "./components/GenerateControls";
import { DynamicImportErrorBoundary } from "./DynamicImportErrorBoundary";

// Import types
import {
  GenerationMode,
  ImageGenerationFormHandles,
  PromptEntry,
  PersistedFormSettings,
  ProjectImageSettings,
} from "./types";

// Lazy load modals to improve initial bundle size and performance
const LazyLoraSelectorModal = React.lazy(() => 
  import("@/shared/components/LoraSelectorModal").then(module => ({ 
    default: module.LoraSelectorModal 
  }))
);

const LazyPromptEditorModal = React.lazy(() => 
  import("@/shared/components/PromptEditorModal")
);

interface ImageGenerationFormProps {
  onGenerate: (formData: any) => void;
  isGenerating?: boolean;
  hasApiKey?: boolean;
  apiKey?: string;
  openaiApiKey?: string;
  /**
   * Indicates that the latest generate action successfully queued tasks. When
   * true, the submit button will briefly show "Added to queue!" to give the
   * user feedback that their request was accepted.
   */
  justQueued?: boolean;
}

interface LoraDataEntry {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: Array<{ url: string; alt_text: string; [key: string]: any; }>;
  "Model Files": Array<{ url: string; path: string; [key: string]: any; }>;
  [key: string]: any;
}

interface LoraData {
  models: LoraDataEntry[];
}

const defaultLorasConfig = [
  { modelId: "Shakker-Labs/FLUX.1-dev-LoRA-add-details", strength: 0.78 },
  { modelId: "Shakker-Labs/FLUX.1-dev-LoRA-AntiBlur", strength: 0.43 },
  { modelId: "kudzueye/boreal-flux-dev-v2", strength: 0.06 },
  { modelId: "strangerzonehf/Flux-Super-Realism-LoRA", strength: 0.40 },
];

export const ImageGenerationForm = forwardRef<ImageGenerationFormHandles, ImageGenerationFormProps>(({
  onGenerate,
  isGenerating = false,
  hasApiKey: incomingHasApiKey = true,
  apiKey,
  openaiApiKey,
  justQueued = false,
}, ref) => {
  // Track first-visit for this session using component state to avoid stale module-level cache
  const [hasVisitedImageGeneration, setHasVisitedImageGeneration] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.sessionStorage.getItem('hasVisitedImageGeneration') === 'true';
    } catch {
      return false;
    }
  });

  // Remember last known prompt count to show correct skeleton
  // Initialize synchronously from sessionStorage to avoid a first-render flash of 1
  const [lastKnownPromptCount, setLastKnownPromptCount] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined') {
        const globalStored = window.sessionStorage.getItem('ig:lastPromptCount');
        if (globalStored) return parseInt(globalStored, 10);
      }
    } catch {}
    return 1;
  });
  // Store prompts by shot ID (including 'none' for no shot)
  const [promptsByShot, setPromptsByShot] = useState<Record<string, PromptEntry[]>>({});
  const promptIdCounter = useRef(1);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [imagesPerPrompt, setImagesPerPrompt] = useState(1);
  const defaultsApplied = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [directFormActivePromptId, setDirectFormActivePromptId] = useState<string | null>(null);
  const [styleReferenceStrength, setStyleReferenceStrength] = useState<number>(1);
  const [isUploadingStyleReference, setIsUploadingStyleReference] = useState<boolean>(false);
  // Optimistic local override for style reference image so UI updates immediately
  // undefined => no override, use settings; string|null => explicit override
  const [styleReferenceOverride, setStyleReferenceOverride] = useState<string | null | undefined>(undefined);
  
  const { selectedProjectId } = useProject();
  
  // Project-level settings for model and style reference (shared across tools)
  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
    isUpdating: isSavingProjectSettings
  } = useToolSettings<ProjectImageSettings>('project-image-settings', {
    projectId: selectedProjectId,
    enabled: !!selectedProjectId
  });
  
  // Local optimistic override for model to avoid UI stutter while saving
  const [modelOverride, setModelOverride] = useState<GenerationMode | undefined>(undefined);

  // Extract current values with defaults (apply optimistic override first)
  const selectedModel = (modelOverride ?? projectImageSettings?.selectedModel) || 'qwen-image';
  const rawStyleReferenceImage = projectImageSettings?.styleReferenceImage || null; // For generation
  const rawStyleReferenceImageOriginal = projectImageSettings?.styleReferenceImageOriginal || null; // For display
  const currentStyleStrength = projectImageSettings?.styleReferenceStrength || 1;
  
  // Display image (use original if available, fallback to processed)
  const styleReferenceImageDisplay = useMemo(() => {
    // If we have an explicit local override (including null), use it
    if (styleReferenceOverride !== undefined) {
      return styleReferenceOverride;
    }

    // Prefer original image for display
    const imageToDisplay = rawStyleReferenceImageOriginal || rawStyleReferenceImage;
    if (!imageToDisplay) return null;
    
    // If it's already a URL, return as-is
    if (imageToDisplay.startsWith('http')) {
      return imageToDisplay;
    }
    
    // If it's base64 data, we need to convert it
    if (imageToDisplay.startsWith('data:image/')) {
      console.warn('[ImageGenerationForm] Found legacy base64 style reference, needs conversion');
      // Return null for now to trigger re-upload
      return null;
    }
    
    return imageToDisplay;
  }, [styleReferenceOverride, rawStyleReferenceImageOriginal, rawStyleReferenceImage]);

  // Generation image (always use processed version)
  const styleReferenceImageGeneration = useMemo(() => {
    if (!rawStyleReferenceImage) return null;
    
    // If it's already a URL, return as-is
    if (rawStyleReferenceImage.startsWith('http')) {
      return rawStyleReferenceImage;
    }
    
    // If it's base64 data, we need to convert it
    if (rawStyleReferenceImage.startsWith('data:image/')) {
      console.warn('[ImageGenerationForm] Found legacy base64 style reference, needs conversion');
      return null;
    }
    
    return rawStyleReferenceImage;
  }, [rawStyleReferenceImage]);

  // When the backing setting updates, drop the local override
  useEffect(() => {
    setStyleReferenceOverride(undefined);
  }, [rawStyleReferenceImage]);
  
  // Clear model override once server settings reflect the change
  useEffect(() => {
    if (modelOverride && projectImageSettings?.selectedModel === modelOverride) {
      console.log('[ModelFlipIssue] Server settings now match override. Clearing override.', {
        serverModel: projectImageSettings?.selectedModel,
        override: modelOverride,
        isUpdating: isSavingProjectSettings
      });
      setModelOverride(undefined);
    }
  }, [projectImageSettings?.selectedModel]);
  
  // Auto-migrate base64 data to URL when detected
  useEffect(() => {
    const migrateBase64ToUrl = async () => {
      if (rawStyleReferenceImage && 
          rawStyleReferenceImage.startsWith('data:image/') && 
          selectedProjectId) {
        console.log('[ImageGenerationForm] Migrating legacy base64 style reference to URL');
        
        try {
          // Convert base64 to file
          const file = dataURLtoFile(rawStyleReferenceImage, `migrated-style-reference-${Date.now()}.png`);
          if (!file) {
            console.error('[ImageGenerationForm] Failed to convert base64 to file for migration');
            return;
          }
          
          // Upload to storage (use same image for both display and generation for legacy data)
          const uploadedUrl = await uploadImageToStorage(file);
          
          // Update project settings with URL for both display and generation
          await updateProjectImageSettings('project', {
            styleReferenceImage: uploadedUrl,
            styleReferenceImageOriginal: uploadedUrl
          });
          
          console.log('[ImageGenerationForm] Successfully migrated base64 style reference to URL:', uploadedUrl);
          toast.success('Style reference image migrated to cloud storage');
        } catch (error) {
          console.error('[ImageGenerationForm] Failed to migrate base64 style reference:', error);
          toast.error('Failed to migrate style reference image');
        }
      }
    };
    
    migrateBase64ToUrl();
  }, [rawStyleReferenceImage, selectedProjectId, updateProjectImageSettings]);
  
  // Mark that we've visited this page in the session
  React.useEffect(() => {
    try {
      if (!hasVisitedImageGeneration && typeof window !== 'undefined') {
        window.sessionStorage.setItem('hasVisitedImageGeneration', 'true');
        setHasVisitedImageGeneration(true);
      }
    } catch {}
  }, [hasVisitedImageGeneration]);

  // Text to prepend/append to every prompt
  const [beforeEachPromptText, setBeforeEachPromptText] = useState("");
  const [afterEachPromptText, setAfterEachPromptText] = useState("");

  // Associated shot
  const [associatedShotId, setAssociatedShotId] = useState<string | null>(null);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);

  // Removed unused currentShotId that was causing unnecessary re-renders
  const { data: shots } = useListShots(selectedProjectId);
  const createShotMutation = useCreateShot();
  const queryClient = useQueryClient();
  const { navigateToShot } = useShotNavigation();

  // Debug project context
  useEffect(() => {
    console.log('[ImageGenerationForm] Project context - selectedProjectId:', selectedProjectId);
  }, [selectedProjectId]);

  // Debug persistence hook inputs
  useEffect(() => {
    console.log('[ImageGenerationForm] Persistence hook inputs:', {
      toolId: 'image-generation',
      context: { projectId: selectedProjectId },
      stateValues: {
        promptsByShot: Object.keys(promptsByShot).length,
        associatedShotId,
        imagesPerPrompt,
        beforeEachPromptText: beforeEachPromptText.substring(0, 20) + '...',
        afterEachPromptText: afterEachPromptText.substring(0, 20) + '...',
      }
    });
  }, [selectedProjectId, promptsByShot, associatedShotId, imagesPerPrompt, beforeEachPromptText, afterEachPromptText]);

  // Fetch public LoRAs from all users
  const { data: publicLorasData } = useListPublicResources('lora');
  const availableLoras: LoraModel[] = publicLorasData?.map(resource => resource.metadata) || [];

  // LoRA management using the modularized hook with new generalized approach
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId,
    persistenceScope: 'project', // Use new persistence scope
    enableProjectPersistence: true,
    persistenceKey: 'project-loras', // Standardized key shared across all tools
    enableTriggerWords: true,
    onPromptUpdate: setAfterEachPromptText,
    currentPrompt: afterEachPromptText,
    disableAutoLoad: true, // Disable auto-load since we handle our own default logic
  });

  // Get the effective shot ID for storage (use 'none' for null)
  const effectiveShotId = associatedShotId || 'none';
  
  // Get current prompts for the selected shot
  const prompts = promptsByShot[effectiveShotId] || [];
  
  // Helper to update prompts for the current shot
  const setPrompts = useCallback((newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => {
    console.log('[ImageGenerationForm] setPrompts called for shot:', effectiveShotId);
    setPromptsByShot(prev => {
      const currentPrompts = prev[effectiveShotId] || [];
      const updatedPrompts = typeof newPrompts === 'function' ? newPrompts(currentPrompts) : newPrompts;
      console.log('[ImageGenerationForm] Updating prompts from', currentPrompts.length, 'to', updatedPrompts.length, 'for shot:', effectiveShotId);
      return {
        ...prev,
        [effectiveShotId]: updatedPrompts
      };
    });
  }, [effectiveShotId]);

  const { ready, isSaving, markAsInteracted } = usePersistentToolState<PersistedFormSettings>(
    'image-generation',
    { projectId: selectedProjectId },
    {
      promptsByShot: [promptsByShot, setPromptsByShot],
      imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
      selectedLoras: [loraManager.selectedLoras, loraManager.setSelectedLoras],
      beforeEachPromptText: [beforeEachPromptText, setBeforeEachPromptText],
      afterEachPromptText: [afterEachPromptText, setAfterEachPromptText],
      associatedShotId: [associatedShotId, setAssociatedShotId],
    }
    // Remove enabled: !!selectedProjectId - let persistence work even without project to preserve state
  );
  
  // Sync local style strength with project settings
  useEffect(() => {
    if (projectImageSettings?.styleReferenceStrength !== undefined) {
      setStyleReferenceStrength(projectImageSettings.styleReferenceStrength);
    }
  }, [projectImageSettings?.styleReferenceStrength]);

  // Load shot-specific prompt count when shot changes
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // Try shot-specific count first
        const shotSpecificKey = `ig:lastPromptCount:${effectiveShotId}`;
        let stored = window.sessionStorage.getItem(shotSpecificKey);
        
        // Fall back to global count if no shot-specific count
        if (!stored) {
          stored = window.sessionStorage.getItem('ig:lastPromptCount');
        }
        
        const count = stored ? parseInt(stored, 10) : 1;
        setLastKnownPromptCount(count);
      }
    } catch {}
  }, [effectiveShotId]);

  // Save prompt count whenever it changes (for better skeleton display on revisit)
  React.useEffect(() => {
    if (ready && prompts.length > 0) {
      try {
        if (typeof window !== 'undefined') {
          // Use shot-specific key to remember count per shot
          const storageKey = `ig:lastPromptCount:${effectiveShotId}`;
          window.sessionStorage.setItem(storageKey, prompts.length.toString());
          // Also save globally for fallback
          window.sessionStorage.setItem('ig:lastPromptCount', prompts.length.toString());
          setLastKnownPromptCount(prompts.length);
        }
      } catch {}
    }
  }, [ready, prompts.length, effectiveShotId]);

  // Debug persistence state changes
  useEffect(() => {
    console.log('[ImageGenerationForm] Persistence state - ready:', ready, 'isSaving:', isSaving, 'associatedShotId:', associatedShotId);
    
    // Log what would be saved when isSaving becomes true
    if (isSaving) {
      console.log('[ImageGenerationForm] Currently saving settings:', {
        promptsByShot: JSON.stringify(promptsByShot),
        associatedShotId,
        selectedProjectId,
        imagesPerPrompt,
        beforeEachPromptText,
        afterEachPromptText,
      });
    }
  }, [ready, isSaving, associatedShotId, promptsByShot, selectedProjectId, imagesPerPrompt, beforeEachPromptText, afterEachPromptText]);

  // Debug prompts changes
  useEffect(() => {
    console.log('[ImageGenerationForm] Prompts for shot', effectiveShotId, ':', prompts.length, 'prompts');
    prompts.forEach((p, i) => {
      console.log(`  Prompt ${i + 1}:`, p.fullPrompt.substring(0, 50) + (p.fullPrompt.length > 50 ? '...' : ''));
    });
  }, [effectiveShotId, prompts]);

  // Debug settings hydration
  useEffect(() => {
    if (ready) {
      console.log('[ImageGenerationForm] Settings hydrated:', {
        associatedShotId,
        promptsByShot: JSON.stringify(promptsByShot, null, 2),
        effectiveShotId,
        projectId: selectedProjectId,
      });
    }
  }, [ready, associatedShotId, promptsByShot, effectiveShotId, selectedProjectId]);

  // Reset associatedShotId if the selected shot no longer exists (e.g., was deleted)
  useEffect(() => {
    if (associatedShotId && shots) {
      const shotExists = shots.some(shot => shot.id === associatedShotId);
      if (!shotExists) {
        console.log('[ImageGenerationForm] Selected shot', associatedShotId, 'no longer exists, resetting to None');
        setAssociatedShotId(null);
        markAsInteracted();
      }
    }
  }, [associatedShotId, shots, markAsInteracted]);

  // Initialize prompts for a shot if they don't exist - debounced to prevent rapid resets during hydration
  useEffect(() => {
    if (ready && !promptsByShot[effectiveShotId]) {
      // Add a small delay to prevent rapid resets during persistence hydration
      const timeoutId = setTimeout(() => {
        // Double-check that we still need to initialize after the delay
        setPromptsByShot(prev => {
          if (!prev[effectiveShotId] || prev[effectiveShotId].length === 0) {
            console.log('[ImageGenerationForm] Initializing empty prompts for shot:', effectiveShotId);
            return {
              ...prev,
              [effectiveShotId]: [{ id: generatePromptId(), fullPrompt: "", shortPrompt: "" }]
            };
          }
          return prev; // No change needed
        });
      }, 50); // 50ms delay to allow persistence hydration to complete

      return () => clearTimeout(timeoutId);
    }
  }, [ready, effectiveShotId]); // Remove promptsByShot from dependencies to avoid infinite loops

  const hasApiKey = true; // Always true for wan-local

  const generatePromptId = () => `prompt-${promptIdCounter.current++}`;

  // Memoize actionable prompts count to prevent recalculation on every render
  const actionablePromptsCount = useMemo(() => 
    prompts.filter(p => p.fullPrompt.trim() !== "").length, 
    [prompts]
  );
  
  useImperativeHandle(ref, () => ({
    applySettings: (settings: DisplayableMetadata) => {
      markAsInteracted();
      // Apply settings to the current shot's prompts
      setPrompts([{ 
        id: generatePromptId(), 
        fullPrompt: settings.prompt || '', 
        shortPrompt: settings.shortPrompt
      }]);
      setImagesPerPrompt(1);

      if (settings.activeLoras && settings.activeLoras.length > 0 && availableLoras.length > 0) {
        const newSelectedLoras: ActiveLora[] = [];
        settings.activeLoras.forEach(metaLora => {
          const foundFullLora = availableLoras.find(al => al['Model ID'] === metaLora.id);
          if (foundFullLora) {
            newSelectedLoras.push({
              id: metaLora.id,
              name: metaLora.name,
              path: metaLora.path,
              strength: metaLora.strength,
              previewImageUrl: foundFullLora.Images && foundFullLora.Images.length > 0 ? foundFullLora.Images[0].url : metaLora.previewImageUrl
            });
          }
        });
        loraManager.setSelectedLoras(newSelectedLoras);
      } else {
        loraManager.setSelectedLoras([]);
      }

      if (settings.beforeEachPromptText !== undefined) setBeforeEachPromptText(settings.beforeEachPromptText);
      if (settings.afterEachPromptText !== undefined) setAfterEachPromptText(settings.afterEachPromptText);
    },
    getAssociatedShotId: () => associatedShotId
  }));

  // Apply default LoRAs using the new generalized approach
  useEffect(() => { 
    if (
      selectedModel === 'wan-local' && 
      ready &&
      !defaultsApplied.current && 
      availableLoras.length > 0 && 
      loraManager.shouldApplyDefaults // Use the generalized check
    ) { 
      const newSelectedLoras: ActiveLora[] = [];
      for (const defaultConfig of defaultLorasConfig) {
        const foundLora = availableLoras.find(lora => lora["Model ID"] === defaultConfig.modelId);
        if (foundLora && foundLora["Model Files"] && foundLora["Model Files"].length > 0) {
          newSelectedLoras.push({
            id: foundLora["Model ID"], 
            name: foundLora.Name !== "N/A" ? foundLora.Name : foundLora["Model ID"],
            path: foundLora["Model Files"][0].url, 
            strength: defaultConfig.strength,
            previewImageUrl: foundLora.Images && foundLora.Images.length > 0 ? foundLora.Images[0].url : undefined,
            trigger_word: foundLora.trigger_word,
          });
        }
      }
      if (newSelectedLoras.length > 0) {
        loraManager.setSelectedLoras(newSelectedLoras);
        loraManager.markAsUserSet(); // Use the generalized mark function
        markAsInteracted();
        defaultsApplied.current = true;
      }
    } 
  }, [selectedModel, availableLoras, ready, loraManager.shouldApplyDefaults, markAsInteracted]);

  // Wrap loraManager handlers to maintain markAsInteracted behavior
  const handleAddLora = (loraToAdd: LoraModel) => { 
    markAsInteracted();
    loraManager.handleAddLora(loraToAdd); // markAsUserSet is now handled internally
  };
  const handleRemoveLora = (loraIdToRemove: string) => {
    markAsInteracted();
    loraManager.handleRemoveLora(loraIdToRemove); // markAsUserSet is now handled internally
  };
  const handleLoraStrengthChange = (loraId: string, newStrength: number) => {
    markAsInteracted();
    loraManager.handleLoraStrengthChange(loraId, newStrength); // markAsUserSet is now handled internally
  };

  // Wrap the load project LoRAs function to mark as interacted
  const handleLoadProjectLoras = async () => {
    await loraManager.handleLoadProjectLoras?.(); // markAsUserSet is now handled internally
    markAsInteracted();
  };

  // Handle style reference image upload
  const handleStyleReferenceUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      // Silently ignore invalid file types (no toasts for style reference flows)
      return;
    }

    try {
      setIsUploadingStyleReference(true);
      const dataURL = await fileToDataURL(file);
      
      // Upload the original image first (for display purposes)
      const originalFile = file;
      const originalUploadedUrl = await uploadImageToStorage(originalFile);
      
      // Process the image to match project aspect ratio (for generation)
      let processedDataURL = dataURL;
      if (selectedProjectId) {
        const { aspectRatio } = await resolveProjectResolution(selectedProjectId);
        console.log('[StyleRefDebug] Project resolution lookup returned aspectRatio:', aspectRatio);
        const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);
        
        if (processed) {
          processedDataURL = processed;
          console.log('[StyleRefDebug] Style reference processing completed successfully');
        } else {
          console.error('[StyleRefDebug] Style reference processing failed');
          throw new Error('Failed to process image for aspect ratio');
        }
      }
      
      // Convert processed data URL back to File for upload
      const processedFile = dataURLtoFile(processedDataURL, `style-reference-processed-${Date.now()}.png`);
      if (!processedFile) {
        throw new Error('Failed to convert processed image to file');
      }
      
      console.log('[StyleRefDebug] Processed file details:', {
        name: processedFile.name,
        size: processedFile.size,
        type: processedFile.type
      });
      
      // Check the actual dimensions of the processed file
      const tempImg = new Image();
      tempImg.onload = () => {
        console.log('[StyleRefDebug] Processed file actual dimensions:', tempImg.width, 'x', tempImg.height);
      };
      tempImg.src = processedDataURL;
      
      // Upload processed version to storage
      console.log('[StyleRefDebug] About to upload processed file to storage...');
      const processedUploadedUrl = await uploadImageToStorage(processedFile);
      console.log('[StyleRefDebug] Upload completed, URL:', processedUploadedUrl);
      
      // Save both URLs - original for display, processed for generation
      console.log('[StyleRefDebug] Saving URLs:', {
        original: originalUploadedUrl,
        processed: processedUploadedUrl
      });
      
      await updateProjectImageSettings('project', {
        styleReferenceImage: processedUploadedUrl, // Used for generation
        styleReferenceImageOriginal: originalUploadedUrl // Used for display
      });
      markAsInteracted();
      // Optimistically reflect the original uploaded image for display
      setStyleReferenceOverride(originalUploadedUrl);
      
      console.log('[StyleRefDebug] Style reference upload completed successfully!');
    } catch (error) {
      console.error('Error uploading style reference:', error);
      // No toasts on failure per request
    } finally {
      setIsUploadingStyleReference(false);
    }
  }, [updateProjectImageSettings, markAsInteracted, selectedProjectId]);

  // Handle removing style reference image
  const handleRemoveStyleReference = useCallback(async () => {
    // Optimistically clear immediately
    setStyleReferenceOverride(null);
    await updateProjectImageSettings('project', {
      styleReferenceImage: null,
      styleReferenceImageOriginal: null
    });
    markAsInteracted();
  }, [updateProjectImageSettings, markAsInteracted]);

  // Handle model change
  const handleModelChange = useCallback(async (value: GenerationMode) => {
    console.log('[ModelFlipIssue] onValueChange fired', {
      from: selectedModel,
      to: value,
      serverModel: projectImageSettings?.selectedModel,
      isUpdating: isSavingProjectSettings
    });

    // Optimistic UI flip
    setModelOverride(value);

    // Optimistically update settings cache to avoid jump-back while refetching
    try {
      queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) => {
        const next = { ...(prev || {}), selectedModel: value };
        console.log('[ModelFlipIssue] Applied optimistic cache update for selectedModel', { next });
        return next;
      });
    } catch (e) {
      console.warn('[ModelFlipIssue] Failed to set optimistic cache data', e);
    }

    // Build a single debounced update payload to avoid dropping fields
    if (value === 'qwen-image') {
      // Clear LoRAs when switching to Qwen.Image (client state)
      loraManager.setSelectedLoras([]);
      await updateProjectImageSettings('project', { selectedModel: value });
    } else {
      // Just update the model when switching to Wan 2.2, preserve style reference
      await updateProjectImageSettings('project', { selectedModel: value });
    }

    markAsInteracted();
  }, [selectedModel, projectImageSettings?.selectedModel, isSavingProjectSettings, queryClient, selectedProjectId, loraManager, updateProjectImageSettings, markAsInteracted, setStyleReferenceOverride]);
  
  // Handle style reference strength change
  const handleStyleStrengthChange = useCallback(async (value: number) => {
    setStyleReferenceStrength(value);
    await updateProjectImageSettings('project', {
      styleReferenceStrength: value
    });
    markAsInteracted();
  }, [updateProjectImageSettings, markAsInteracted]);

  const handleAddPrompt = (source: 'form' | 'modal' = 'form') => {
    markAsInteracted();
    const newId = generatePromptId();
    const newPromptNumber = prompts.length + 1;
    const newPrompt = { id: newId, fullPrompt: "", shortPrompt: `Prompt ${newPromptNumber}` };
    setPrompts(prev => [...prev, newPrompt]);
  };

  const handleUpdatePrompt = (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => {
    markAsInteracted();
    setPrompts(prev => prev.map(p => {
      if (p.id === id) {
        const updatedPrompt = { ...p, [field]: value };
        if (field === 'fullPrompt' && (updatedPrompt.shortPrompt === "" || updatedPrompt.shortPrompt?.startsWith(p.fullPrompt.substring(0,20)))) {
          updatedPrompt.shortPrompt = value.substring(0, 30) + (value.length > 30 ? "..." : "");
        }
        return updatedPrompt;
      }
      return p;
    }));
  };

  const handleRemovePrompt = (id: string) => {
    markAsInteracted();
    if (prompts.length > 1) {
      setPrompts(prev => prev.filter(p => p.id !== id));
    } else {
      toast.error("Cannot remove the last prompt.");
    }
  };
  
  const handleSavePromptsFromModal = (updatedPrompts: PromptEntry[]) => {
    markAsInteracted();
    // De-duplicate IDs and assign new ones where necessary.
    const seenIds = new Set<string>();
    const sanitizedPrompts = updatedPrompts.map(original => {
      let id = original.id && !seenIds.has(original.id) ? original.id : "";
      if (!id) {
        id = generatePromptId();
      }
      seenIds.add(id);
      return {
        ...original,
        id,
        shortPrompt: original.shortPrompt || (original.fullPrompt.substring(0, 30) + (original.fullPrompt.length > 30 ? "..." : "")),
      };
    });

    setPrompts(sanitizedPrompts);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();    

    const activePrompts = prompts.filter(p => p.fullPrompt.trim() !== "");
    if (activePrompts.length === 0) {
        console.warn("[ImageGenerationForm] handleSubmit: No active prompts. Generation aborted.");
        toast.error("Please enter at least one valid prompt.");
        return;
    }

    // Validate model-specific requirements
    if (selectedModel === 'qwen-image' && !styleReferenceImageGeneration) {
        toast.error("Please upload a style reference image for Qwen.Image model.");
        return;
    }

    // Map selected LoRAs to the format expected by the task creation (only for wan-local)
    const lorasForApi = selectedModel === 'wan-local' 
      ? loraManager.selectedLoras.map(lora => ({
          path: lora.path,
          strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0
        }))
      : [];

    // Debug: Log what style reference we're about to send
    if (selectedModel === 'qwen-image' && styleReferenceImageGeneration) {
      console.log('[ImageGenerationForm] Style reference being sent to task:', {
        isUrl: styleReferenceImageGeneration.startsWith('http'),
        isBase64: styleReferenceImageGeneration.startsWith('data:'),
        length: styleReferenceImageGeneration.length,
        preview: styleReferenceImageGeneration.substring(0, 100) + '...'
      });
    }
    
    // Build the unified task creation parameters
    const batchTaskParams: BatchImageGenerationTaskParams = {
      project_id: selectedProjectId!, // We know it's not null due to validation
      prompts: activePrompts.map(p => {
        const combinedFull = `${beforeEachPromptText ? `${beforeEachPromptText.trim()}, ` : ''}${p.fullPrompt.trim()}${afterEachPromptText ? `, ${afterEachPromptText.trim()}` : ''}`.trim();
        return {
          id: p.id,
          fullPrompt: combinedFull,
          shortPrompt: p.shortPrompt || (combinedFull.substring(0, 30) + (combinedFull.length > 30 ? "..." : ""))
        };
      }), 
      imagesPerPrompt, 
      loras: lorasForApi,
      shot_id: associatedShotId || undefined, // Convert null to undefined for the helper
      model_name: selectedModel === 'wan-local' ? 'wan-2.2' : 'qwen-image',
      // Add style reference for Qwen.Image
      ...(selectedModel === 'qwen-image' && styleReferenceImageGeneration && {
        style_reference_image: styleReferenceImageGeneration,
        style_reference_strength: currentStyleStrength
      }),
      // resolution will be resolved by the helper
    };

    // Legacy data structure for backward compatibility with existing onGenerate handler
    const legacyGenerationData = {
      prompts: batchTaskParams.prompts,
      imagesPerPrompt, 
      loras: lorasForApi, 
      fullSelectedLoras: loraManager.selectedLoras,
      generationMode: selectedModel, // Use selectedModel instead of hardcoded generationMode
      associatedShotId,
      styleReferenceImage: selectedModel === 'qwen-image' ? styleReferenceImageGeneration : null,
      styleReferenceStrength: selectedModel === 'qwen-image' ? currentStyleStrength : undefined,
      selectedModel,
      // Add the new unified params for the updated handler
      batchTaskParams
    };
    
    onGenerate(legacyGenerationData);
  };
  
  // Handle creating a new shot
  const handleCreateShot = useCallback(async (shotName: string, files: File[]) => {
    if (!selectedProjectId) {
      toast.error("No project selected");
      return;
    }

    try {
      const result = await createShotMutation.mutateAsync({
        name: shotName,
        projectId: selectedProjectId,
        shouldSelectAfterCreation: false
      });

      await queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      await queryClient.refetchQueries({ queryKey: ['shots', selectedProjectId] });
      
      // Switch to the newly created shot
      markAsInteracted();
      setAssociatedShotId(result.shot.id);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error("Failed to create shot");
    }
  }, [selectedProjectId, createShotMutation, markAsInteracted, queryClient]);

  // Optimize event handlers with useCallback to prevent recreating on each render
  const handleSliderChange = useCallback((setter: React.Dispatch<React.SetStateAction<number>>) => (value: number) => {
    markAsInteracted();
    setter(value);
  }, [markAsInteracted]);

  const handleTextChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    markAsInteracted();
    setter(e.target.value);
  }, [markAsInteracted]);

  // Ensure the `promptIdCounter` is always ahead of any existing numeric IDs.
  // This prevents duplicate IDs which caused multiple prompts to update together.
  useEffect(() => {
    let nextId = prompts.reduce((max, p) => {
      const match = /^prompt-(\d+)$/.exec(p.id || "");
      if (match) {
        const num = parseInt(match[1], 10) + 1;
        return num > max ? num : max;
      }
      return max;
    }, 1);

    // Resolve any duplicate IDs on the fly by assigning new ones.
    const seen = new Set<string>();
    let hadDuplicates = false;
    const dedupedPrompts = prompts.map(p => {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        return p;
      }
      hadDuplicates = true;
      // Duplicate found – give it a fresh ID.
      const newId = `prompt-${nextId++}`;
      seen.add(newId);
      return { ...p, id: newId };
    });

    if (hadDuplicates) {
      setPrompts(dedupedPrompts);
    }

    if (nextId > promptIdCounter.current) {
      promptIdCounter.current = nextId;
    }
  }, [prompts]);

  // Handle shot change with proper prompt initialization
  const handleShotChange = (value: string) => {
    console.log('[ImageGenerationForm] Changing shot from', associatedShotId, 'to', value);
    markAsInteracted();
    const newShotId = value === "none" ? null : value;
    setAssociatedShotId(newShotId);
    
    // Initialize prompts for the new shot if they don't exist
    const newEffectiveShotId = newShotId || 'none';
    if (!promptsByShot[newEffectiveShotId]) {
      console.log('[ImageGenerationForm] Initializing prompts for shot:', newEffectiveShotId);
      setPromptsByShot(prev => ({
        ...prev,
        [newEffectiveShotId]: [{ id: generatePromptId(), fullPrompt: "", shortPrompt: "" }]
      }));
    } else {
      console.log('[ImageGenerationForm] Shot', newEffectiveShotId, 'already has', promptsByShot[newEffectiveShotId]?.length, 'prompts');
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left Column */}
          <div className="flex-1 space-y-6">
            <PromptsSection
              prompts={prompts}
              ready={ready}
              lastKnownPromptCount={lastKnownPromptCount}
              isGenerating={isGenerating}
              hasApiKey={hasApiKey}
              actionablePromptsCount={actionablePromptsCount}
              activePromptId={directFormActivePromptId}
              onSetActive={setDirectFormActivePromptId}
              onAddPrompt={handleAddPrompt}
              onUpdatePrompt={handleUpdatePrompt}
              onRemovePrompt={handleRemovePrompt}
              onOpenPromptModal={() => setIsPromptModalOpen(true)}
              beforeEachPromptText={beforeEachPromptText}
              afterEachPromptText={afterEachPromptText}
              onBeforeEachPromptTextChange={handleTextChange(setBeforeEachPromptText)}
              onAfterEachPromptTextChange={handleTextChange(setAfterEachPromptText)}
            />

            <ShotSelector
              shots={shots}
              associatedShotId={associatedShotId}
              isGenerating={isGenerating}
              hasApiKey={hasApiKey}
              onChangeShot={handleShotChange}
              onClearShot={() => {
                markAsInteracted();
                setAssociatedShotId(null);
              }}
              onOpenCreateShot={() => setIsCreateShotModalOpen(true)}
              onJumpToShot={navigateToShot}
            />
          </div>
          
          {/* Right Column */}
          <ModelSection
            selectedModel={selectedModel}
            isGenerating={isGenerating}
            availableLoras={availableLoras}
            selectedLoras={loraManager.selectedLoras}
            styleReferenceImage={styleReferenceImageDisplay}
            styleReferenceStrength={styleReferenceStrength}
            isUploadingStyleReference={isUploadingStyleReference}
            onModelChange={handleModelChange}
            onAddLora={handleAddLora}
            onRemoveLora={handleRemoveLora}
            onLoraStrengthChange={handleLoraStrengthChange}
            onOpenLoraModal={() => loraManager.setIsLoraModalOpen(true)}
            onStyleUpload={handleStyleReferenceUpload}
            onStyleRemove={handleRemoveStyleReference}
            onStyleStrengthChange={handleStyleStrengthChange}
            renderLoraHeaderActions={loraManager.renderHeaderActions}
            onAddTriggerWord={loraManager.handleAddTriggerWord}
          />
        </div>

        <GenerateControls
          imagesPerPrompt={imagesPerPrompt}
          onChangeImagesPerPrompt={handleSliderChange(setImagesPerPrompt)}
          actionablePromptsCount={actionablePromptsCount}
          isGenerating={isGenerating}
          hasApiKey={hasApiKey}
          justQueued={justQueued}
        />
      </form>

      <Suspense fallback={<div className="sr-only">Loading...</div>}>
        <LazyLoraSelectorModal
          isOpen={loraManager.isLoraModalOpen}
          onClose={() => loraManager.setIsLoraModalOpen(false)}
          loras={availableLoras}
          onAddLora={handleAddLora}
          onRemoveLora={handleRemoveLora}
          onUpdateLoraStrength={handleLoraStrengthChange}
          selectedLoras={loraManager.selectedLoras.map(lora => {
            const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
            return {
              ...fullLora,
              "Model ID": lora.id,
              Name: lora.name,
              strength: lora.strength,
            } as LoraModel & { strength: number };
          })}
          lora_type={"Wan 2.1 14b"}
        />
      </Suspense>
        
      <Suspense fallback={<div className="sr-only">Loading...</div>}>
        <DynamicImportErrorBoundary
          fallback={() => (
            <div className="sr-only">
              Modal loading error - please refresh if needed
            </div>
          )}
        >
          <LazyPromptEditorModal
            isOpen={isPromptModalOpen}
            onClose={() => setIsPromptModalOpen(false)}
            prompts={prompts}
            onSave={handleSavePromptsFromModal}
            generatePromptId={generatePromptId}
            apiKey={openaiApiKey}
          />
        </DynamicImportErrorBoundary>
      </Suspense>

      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleCreateShot}
        isLoading={createShotMutation.isPending}
      />
    </>
  );
});

ImageGenerationForm.displayName = 'ImageGenerationForm';

// Re-export components that are used elsewhere
export { PromptInputRow } from "./components/PromptInputRow";
export type { PromptInputRowProps, PromptEntry } from "./types";

export default ImageGenerationForm;