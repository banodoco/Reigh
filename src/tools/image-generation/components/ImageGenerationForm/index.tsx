import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo, Suspense } from "react";
import { createPortal } from "react-dom";
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
import { useToolSettings, extractSettingsFromCache, updateSettingsCache } from "@/shared/hooks/useToolSettings";
import { useAutoSaveSettings } from "@/shared/hooks/useAutoSaveSettings";
import { useUserUIState } from "@/shared/hooks/useUserUIState";
import { ImageGenerationSettings } from "../../settings";
import { VideoTravelSettings } from "@/tools/travel-between-images/settings";
import { usePublicLoras, useCreateResource, useUpdateResource, useDeleteResource, StyleReferenceMetadata, Resource } from '@/shared/hooks/useResources';
import { useListShots } from "@/shared/hooks/useShots";
import { useShotCreation } from "@/shared/hooks/useShotCreation";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useQueryClient } from '@tanstack/react-query';
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { BatchImageGenerationTaskParams } from "@/shared/lib/tasks/imageGeneration";
import { processStyleReferenceForAspectRatioString } from "@/shared/lib/styleReferenceProcessor";
import { ASPECT_RATIO_TO_RESOLUTION } from "@/shared/lib/aspectRatios";
import { resolveProjectResolution } from "@/shared/lib/taskCreation";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
import { generateClientThumbnail } from "@/shared/lib/clientThumbnailGenerator";
import { storagePaths, generateThumbnailFilename, MEDIA_BUCKET } from "@/shared/lib/storagePaths";
import { nanoid } from 'nanoid';
import { supabase } from "@/integrations/supabase/client";
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useSubmitButtonState } from '@/shared/hooks/useSubmitButtonState';
import { useHydratedReferences } from '../../hooks/useHydratedReferences';

// Import extracted components
import { PromptsSection } from "./components/PromptsSection";
import { ShotSelector } from "./components/ShotSelector";
import { ModelSection } from "./components/ModelSection";
import { GenerateControls } from "./components/GenerateControls";
import { GenerationSettingsSection } from "./components/GenerationSettingsSection";
import { DynamicImportErrorBoundary } from "./DynamicImportErrorBoundary";

// Import types
import {
  GenerationMode,
  ImageGenerationFormHandles,
  PromptEntry,
  PersistedFormSettings,
  ProjectImageSettings,
  ReferenceImage,
  HydratedReferenceImage,
  ReferenceMode,
  PromptMode,
  ImageGenShotSettings,
  HiresFixConfig,
  DEFAULT_HIRES_FIX_CONFIG,
  GenerationSource,
  TextToImageModel,
  LoraCategory,
  getLoraTypeForModel,
  getLoraCategoryForModel,
  getHiresFixDefaultsForModel,
  getReferenceModeDefaults,
  BY_REFERENCE_LORA_TYPE,
  ReferenceApiParams,
  DEFAULT_REFERENCE_PARAMS,
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
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[]> | string[] | void;
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
  /**
   * Called when the associated shot selection changes in the form
   */
  onShotChange?: (shotId: string | null) => void;
  /**
   * When true, the generate controls will be rendered with sticky positioning
   * at the bottom of the scroll container (for modal contexts)
   */
  stickyFooter?: boolean;
  /**
   * When provided with stickyFooter, the footer will be portaled to this element
   * (by ID) so it renders outside the scroll container
   */
  footerPortalId?: string;
  /**
   * Pre-select a specific shot when the form mounts. This takes precedence over
   * persisted settings on initial render only.
   */
  initialShotId?: string | null;
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

// Helper to build batchTaskParams - consolidates 5 duplicate constructions
interface BuildBatchTaskParamsInput {
  projectId: string;
  prompts: PromptEntry[];
  imagesPerPrompt: number;
  shotId: string | null;
  beforePromptText: string;
  afterPromptText: string;
  styleBoostTerms: string; // Appended to prompts, NOT sent to API
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  modelName: string; // Model name for task type mapping (e.g., 'qwen-image', 'qwen-image-2512', 'z-image')
  // Reference params grouped together - snake_case to match API directly
  referenceParams: ReferenceApiParams;
}

function buildBatchTaskParams(input: BuildBatchTaskParamsInput): BatchImageGenerationTaskParams {
  const styleBoostTerms = input.styleBoostTerms?.trim() ?? '';
  const effectiveAfterText = styleBoostTerms
    ? `${input.afterPromptText}${input.afterPromptText.trim() ? ', ' : ''}${styleBoostTerms}`
    : input.afterPromptText;

  return {
    project_id: input.projectId,
    prompts: input.prompts.map(p => {
      const combinedFull = `${input.beforePromptText ? `${input.beforePromptText.trim()}, ` : ''}${p.fullPrompt.trim()}${effectiveAfterText ? `, ${effectiveAfterText.trim()}` : ''}`.trim();
      return {
        id: p.id,
        fullPrompt: combinedFull,
        shortPrompt: p.shortPrompt || (combinedFull.substring(0, 30) + (combinedFull.length > 30 ? "..." : ""))
      };
    }),
    imagesPerPrompt: input.imagesPerPrompt,
    loras: [],
    shot_id: input.shotId || undefined,
    model_name: input.modelName,
    steps: input.isLocalGenerationEnabled ? input.hiresFixConfig.base_steps : undefined,
    // Reference params - spread directly (already snake_case)
    ...(input.referenceParams.style_reference_image && {
      style_reference_image: input.referenceParams.style_reference_image,
      style_reference_strength: input.referenceParams.style_reference_strength,
      subject_reference_image: input.referenceParams.style_reference_image, // Same image for both
      subject_strength: input.referenceParams.subject_strength,
      subject_description: input.referenceParams.subject_description,
      in_this_scene: input.referenceParams.in_this_scene,
      in_this_scene_strength: input.referenceParams.in_this_scene_strength,
      reference_mode: input.referenceParams.reference_mode,
    }),
    // Resolution scaling params - always sent regardless of local generation mode
    resolution_scale: input.hiresFixConfig.resolution_scale,
    resolution_mode: input.hiresFixConfig.resolution_mode,
    custom_aspect_ratio: input.hiresFixConfig.custom_aspect_ratio,
    // Phase 1 params - only for local generation
    ...(input.isLocalGenerationEnabled && {
      lightning_lora_strength_phase_1: input.hiresFixConfig.lightning_lora_strength_phase_1,
    }),
    // Phase 2 / Hires fix params - only for local generation AND when enabled
    ...(input.isLocalGenerationEnabled && input.hiresFixConfig.enabled && {
      hires_scale: input.hiresFixConfig.hires_scale,
      hires_steps: input.hiresFixConfig.hires_steps,
      hires_denoise: input.hiresFixConfig.hires_denoise,
      lightning_lora_strength_phase_2: input.hiresFixConfig.lightning_lora_strength_phase_2,
      // phaseLoraStrengths is UI structure, transform to API format
      additional_loras: Object.fromEntries(
        (input.hiresFixConfig.phaseLoraStrengths ?? []).map(lora => [
          lora.loraPath,
          `${lora.pass1Strength};${lora.pass2Strength}`
        ])
      ),
    }),
  };
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
  onShotChange,
  stickyFooter = false,
  footerPortalId,
  initialShotId,
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
  // Legacy: promptsByShot removed - now using per-shot storage via useAutoSaveSettings
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [openPromptModalWithAIExpanded, setOpenPromptModalWithAIExpanded] = useState(false);
  const [imagesPerPrompt, setImagesPerPrompt] = useState(8); // Default to 8 for automated mode
  const [promptMultiplier, setPromptMultiplier] = useState(1); // How many images per prompt in automated mode
  const [steps, setSteps] = useState(12); // Default to 12 steps for local generation
  const [hiresFixConfigRaw, setHiresFixConfig] = useState<Partial<HiresFixConfig>>({});
  // Always merge with defaults to handle incomplete persisted data
  // Also migrate legacy camelCase field names to snake_case
  const hiresFixConfig = useMemo<HiresFixConfig>(() => {
    const raw = hiresFixConfigRaw as Record<string, unknown>;
    // Migrate legacy camelCase fields if present
    const migrated: Partial<HiresFixConfig> = {
      ...hiresFixConfigRaw,
      // Map old camelCase to new snake_case (prefer new names if both exist)
      base_steps: (raw.base_steps as number) ?? (raw.baseSteps as number),
      hires_scale: (raw.hires_scale as number) ?? (raw.hiresScale as number),
      hires_steps: (raw.hires_steps as number) ?? (raw.hiresSteps as number),
      hires_denoise: (raw.hires_denoise as number) ?? (raw.hiresDenoise as number),
      // Migrate from old single lightning_lora_strength to phase_1 (phase_2 defaults to 0)
      lightning_lora_strength_phase_1: (raw.lightning_lora_strength_phase_1 as number)
        ?? (raw.lightning_lora_strength as number)
        ?? (raw.lightningLoraStrength as number),
      lightning_lora_strength_phase_2: (raw.lightning_lora_strength_phase_2 as number),
    };
    return {
      ...DEFAULT_HIRES_FIX_CONFIG,
      ...migrated,
    };
  }, [hiresFixConfigRaw]);
  const defaultsApplied = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [directFormActivePromptId, setDirectFormActivePromptId] = useState<string | null>(null);
  const [styleReferenceStrength, setStyleReferenceStrength] = useState<number>(1.0);
  const [subjectStrength, setSubjectStrength] = useState<number>(0.0);
  const [subjectDescription, setSubjectDescription] = useState<string>('');
  const [isEditingSubjectDescription, setIsEditingSubjectDescription] = useState<boolean>(false);
  const [lastSubjectDescriptionFromParent, setLastSubjectDescriptionFromParent] = useState<string>('');
  const [inThisScene, setInThisScene] = useState<boolean>(false);
  const [inThisSceneStrength, setInThisSceneStrength] = useState<number>(0.5);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('style');
  const [styleBoostTerms, setStyleBoostTerms] = useState<string>('');
  const pendingReferenceModeUpdate = useRef<ReferenceMode | null>(null);
  // Generation source toggle: by-reference or just-text
  const [generationSource, setGenerationSource] = useState<GenerationSource>('by-reference');
  const [selectedTextModel, setSelectedTextModel] = useState<TextToImageModel>('qwen-image');
  // Refs to track current values - prevents stale closure issues in callbacks
  const generationSourceRef = useRef<GenerationSource>(generationSource);
  const selectedTextModelRef = useRef<TextToImageModel>(selectedTextModel);
  useEffect(() => { generationSourceRef.current = generationSource; }, [generationSource]);
  useEffect(() => { selectedTextModelRef.current = selectedTextModel; }, [selectedTextModel]);
  const [isUploadingStyleReference, setIsUploadingStyleReference] = useState<boolean>(false);
  // Optimistic local override for style reference image so UI updates immediately
  // undefined => no override, use settings; string|null => explicit override
  const [styleReferenceOverride, setStyleReferenceOverride] = useState<string | null | undefined>(undefined);
  // Associated shot for image generation
  const [associatedShotId, setAssociatedShotId] = useState<string | null>(null);
  
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const { addIncomingTask, completeIncomingTask } = useIncomingTasks();

  // Get current task count for baseline tracking
  const { data: taskStatusCounts } = useTaskStatusCounts(selectedProjectId);

  // Derive project aspect ratio and resolution for GenerationSettingsSection
  const { projectAspectRatio, projectResolution } = useMemo(() => {
    const currentProject = projects.find(p => p.id === selectedProjectId);
    const aspectRatio = currentProject?.aspectRatio ?? '16:9';
    const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio] ?? '902x508';
    return { projectAspectRatio: aspectRatio, projectResolution: resolution };
  }, [projects, selectedProjectId]);
  
  // Access user's generation settings to detect local generation
  const {
    value: generationMethods,
    isLoading: isLoadingGenerationMethods
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
  // Privacy defaults for new resources
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });
  
  const isLocalGenerationEnabled = generationMethods.onComputer && !generationMethods.inCloud;
  
  // Project-level settings for model and style reference (shared across tools)
  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
    isUpdating: isSavingProjectSettings,
    isLoading: isLoadingProjectSettings
  } = useToolSettings<ProjectImageSettings>('project-image-settings', {
    projectId: selectedProjectId,
    enabled: !!selectedProjectId
  });

  // Local optimistic override for model to avoid UI stutter while saving
  const [modelOverride, setModelOverride] = useState<GenerationMode | undefined>(undefined);

  // Always use qwen-image model (model selector removed)
  const selectedModel = 'qwen-image';
  
  // Get the effective shot ID for storage (use 'none' for null)
  const effectiveShotId = associatedShotId || 'none';
  
  // Get reference pointers array and selected reference for current shot
  const cachedProjectSettings = selectedProjectId
    ? extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined])
      )
    : undefined;

  const referencePointers = projectImageSettings?.references ?? cachedProjectSettings?.references ?? [];
  // Reference count is simply the number of pointers - no complex tracking needed
  // Skeleton count is managed by comparing referencePointers.length vs hydratedReferences.length
  const referenceCount = referencePointers.length;
  // Use cache fallback for selection too, so selection is stable during loading
  const selectedReferenceIdByShot = projectImageSettings?.selectedReferenceIdByShot ?? cachedProjectSettings?.selectedReferenceIdByShot ?? {};
  const selectedReferenceId = selectedReferenceIdByShot[effectiveShotId] ?? null;

  // Hydrate references with data from resources table
  const { hydratedReferences, isLoading: isLoadingReferences, hasLegacyReferences } = useHydratedReferences(referencePointers);
  
  // [RefCleanup] If tool settings contain pointers to missing resources, hydration will drop them.
  // That mismatch causes skeleton count/layout shifts and selection weirdness.
  // Clean up invalid pointers once per project after hydration completes.
  const hasCleanedInvalidReferencePointersRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!selectedProjectId) return;
    if (hasCleanedInvalidReferencePointersRef.current[selectedProjectId]) return;
    if (isLoadingReferences) return;
    if (!projectImageSettings) return;
    if (!referencePointers || referencePointers.length === 0) return;

    // Count how many non-legacy pointers we have
    const nonLegacyPointers = referencePointers.filter(p => {
      const isLegacy = !p.resourceId && (p as any).styleReferenceImage;
      return !isLegacy && !!p.resourceId;
    });

    // CRITICAL: Don't run cleanup until ALL non-legacy pointers are hydrated
    // Otherwise we'd delete references that are still being fetched
    if (hydratedReferences.length < nonLegacyPointers.length) {
      return;
    }

    const hydratedPointerIds = new Set(hydratedReferences.map(r => r.id));
    const invalidPointers = referencePointers.filter(p => {
      const isLegacy = !p.resourceId && (p as any).styleReferenceImage;
      if (isLegacy) return false;
      return !!p.resourceId && !hydratedPointerIds.has(p.id);
    });

    if (invalidPointers.length === 0) {
      hasCleanedInvalidReferencePointersRef.current[selectedProjectId] = true;
      return;
    }

    const invalidIds = new Set(invalidPointers.map(p => p.id));
    const cleanedReferences = referencePointers.filter(p => !invalidIds.has(p.id));

    // NOTE: Don't reference stableSelectedReferenceId here (declared below).
    // Prefer the first hydrated reference as a safe fallback.
    const fallbackId = hydratedReferences[0]?.id ?? null;

    const currentSelections = selectedReferenceIdByShot || {};
    const cleanedSelections: Record<string, string | null> = { ...currentSelections };
    Object.keys(cleanedSelections).forEach(shotKey => {
      const selectedId = cleanedSelections[shotKey];
      if (selectedId && invalidIds.has(selectedId)) {
        cleanedSelections[shotKey] = fallbackId;
      }
    });

    console.warn('[RefCleanup] Removing invalid reference pointers:', {
      projectId: selectedProjectId.substring(0, 8),
      invalidCount: invalidPointers.length,
      invalidPointerIds: invalidPointers.map(p => p.id.substring(0, 8)),
      referencesBefore: referencePointers.length,
      referencesAfter: cleanedReferences.length,
    });

    hasCleanedInvalidReferencePointersRef.current[selectedProjectId] = true;
    updateProjectImageSettings('project', {
      references: cleanedReferences,
      selectedReferenceIdByShot: cleanedSelections,
    });
  }, [
    selectedProjectId,
    isLoadingReferences,
    projectImageSettings,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
  ]);

  // Compute displayed reference ID purely from current state.
  // Uses a ref to cache the first fallback per shot (prevents flickering as more refs hydrate).
  const fallbackCache = useRef<{ shotId: string; referenceId: string } | null>(null);

  const displayedReferenceId = useMemo(() => {
    // If we have no hydrated references yet, nothing to display
    if (hydratedReferences.length === 0) return null;

    // If the persisted selection exists in hydrated refs, use it
    if (selectedReferenceId && hydratedReferences.some(r => r.id === selectedReferenceId)) {
      // Clear any cached fallback since we have a real selection
      if (fallbackCache.current?.shotId === effectiveShotId) {
        fallbackCache.current = null;
      }
      return selectedReferenceId;
    }

    // If we have a selection but it's not hydrated yet, DON'T show a fallback
    // Wait until either: the selected ref hydrates, or all refs are hydrated (meaning selection is truly invalid)
    if (selectedReferenceId && hydratedReferences.length < referenceCount) {
      // Selected ref might still be loading - don't show fallback yet
      return null;
    }

    // Need a fallback - check if we already cached one for this shot
    if (fallbackCache.current?.shotId === effectiveShotId) {
      // Verify the cached fallback still exists in hydrated refs
      if (hydratedReferences.some(r => r.id === fallbackCache.current!.referenceId)) {
        return fallbackCache.current.referenceId;
      }
      // Cached ref no longer valid, clear it
      fallbackCache.current = null;
    }

    // Compute fallback: most recently created reference
    const sorted = [...hydratedReferences].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    const fallbackId = sorted[0]?.id ?? null;

    // Cache this fallback so it doesn't change as more refs hydrate
    if (fallbackId) {
      fallbackCache.current = { shotId: effectiveShotId, referenceId: fallbackId };
    }

    return fallbackId;
  }, [hydratedReferences, selectedReferenceId, effectiveShotId, referenceCount]);
  
  // Derive the full reference object
  const currentSelectedReference = hydratedReferences.find(ref => ref.id === displayedReferenceId) || null;
  
  // Keep last valid reference for refetch stability
  const lastValidSelectedReference = useRef<HydratedReferenceImage | null>(null);
  if (currentSelectedReference) {
    lastValidSelectedReference.current = currentSelectedReference;
  }
  const selectedReference = currentSelectedReference || lastValidSelectedReference.current;

  // Show loading state only if we don't have enough references hydrated yet
  // This prevents flickering when background queries (like isLoadingReferences) run but we already have data
  const hasEnoughReferences = referenceCount > 0 && hydratedReferences.length >= Math.floor(referenceCount * 0.9);
  
  // Also consider "loading" if:
  // 1. We have a selection ID but can't find it (stale ID, auto-selection will kick in)
  // 2. We have a selection ID but references aren't loaded yet (can't verify if valid)
  const hasStaleSelection = selectedReferenceId && !currentSelectedReference && hydratedReferences.length > 0;
  const selectionPendingValidation = selectedReferenceId && hydratedReferences.length === 0 && referenceCount > 0;

  // Only show reference skeletons when we truly have *no hydrated reference data to render yet*.
  // If we already have hydratedReferences, render them even if queries are refetching in background.
  const isReferenceDataLoading =
    hydratedReferences.length === 0 &&
    (
      ((isLoadingProjectSettings || isLoadingReferences) && !hasEnoughReferences) ||
      selectionPendingValidation
    );

  // Resource mutation hooks
  const createStyleReference = useCreateResource();
  const updateStyleReference = useUpdateResource();
  const deleteStyleReference = useDeleteResource();
  
  // Clear pending mode update when switching references
  const prevSelectedReferenceId = useRef(selectedReferenceId);
  useEffect(() => {
    if (prevSelectedReferenceId.current !== selectedReferenceId) {
      pendingReferenceModeUpdate.current = null;
      prevSelectedReferenceId.current = selectedReferenceId;
    }
  }, [selectedReferenceId, hydratedReferences]);

  // For backward compatibility with single reference (used in display)
  const rawStyleReferenceImage = selectedReference?.styleReferenceImage || projectImageSettings?.styleReferenceImage || null;
  const rawStyleReferenceImageOriginal = selectedReference?.styleReferenceImageOriginal || projectImageSettings?.styleReferenceImageOriginal || null;
  const currentStyleStrength = selectedReference?.styleReferenceStrength ?? projectImageSettings?.styleReferenceStrength ?? 1.0;
  const currentSubjectStrength = selectedReference?.subjectStrength ?? projectImageSettings?.subjectStrength ?? 0.0;
  const currentSubjectDescription = selectedReference?.subjectDescription ?? projectImageSettings?.subjectDescription ?? '';
  // Default to 'this character' when subject description is empty but subject strength is active
  const effectiveSubjectDescription = currentSubjectDescription.trim() || 'this character';
  const currentInThisScene = selectedReference?.inThisScene ?? projectImageSettings?.inThisScene ?? false;
  const currentInThisSceneStrength = selectedReference?.inThisSceneStrength ?? (selectedReference?.inThisScene ? 1.0 : 0);
  const currentReferenceMode = (selectedReference?.referenceMode ?? 'style') as ReferenceMode;
  const currentStyleBoostTerms = selectedReference?.styleBoostTerms ?? '';
  
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

  // Check if database has caught up with pending mode update
  useEffect(() => {
    // For reference mode: check if database caught up with pending update
    if (pendingReferenceModeUpdate.current && currentReferenceMode === pendingReferenceModeUpdate.current) {
      // Database now matches our pending update, clear the pending flag
      console.log('[RefSettings] ✅ Database caught up with pending mode update:', currentReferenceMode);
      pendingReferenceModeUpdate.current = null;
    }
  }, [currentReferenceMode]);

  // Sync local state from selectedReference when reference changes
  // This ensures the UI shows the correct values when switching references or loading
  const lastSyncedReferenceId = useRef<string | null>(null);
  useEffect(() => {
    // Only sync when reference ID actually changes (not on every re-render)
    if (selectedReference && selectedReference.id !== lastSyncedReferenceId.current) {
      console.log('[RefSettings] 🔄 Syncing local state from reference:', selectedReference.id, {
        mode: selectedReference.referenceMode,
        styleStrength: selectedReference.styleReferenceStrength,
        subjectStrength: selectedReference.subjectStrength,
        sceneStrength: selectedReference.inThisSceneStrength,
      });
      lastSyncedReferenceId.current = selectedReference.id;
      
      // Sync all reference settings to local state
      setReferenceMode(selectedReference.referenceMode || 'style');
      setStyleReferenceStrength(selectedReference.styleReferenceStrength ?? 1.0);
      setSubjectStrength(selectedReference.subjectStrength ?? 0.0);
      setSubjectDescription(selectedReference.subjectDescription ?? '');
      setInThisScene(selectedReference.inThisScene ?? false);
      setInThisSceneStrength(selectedReference.inThisSceneStrength ?? 0.5);
      setStyleBoostTerms(selectedReference.styleBoostTerms ?? '');
    }
  }, [selectedReference]);

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

  // Initialize generationSource and selectedTextModel from project settings
  // (LORA initialization is done separately after loraManager is created)
  const hasInitializedGenerationSource = useRef(false);
  const initializedTextModelRef = useRef<TextToImageModel | null>(null);
  useEffect(() => {
    if (isLoadingProjectSettings) return;
    if (hasInitializedGenerationSource.current) return;
    if (!projectImageSettings) return;

    if (projectImageSettings.generationSource) {
      setGenerationSource(projectImageSettings.generationSource);
    }
    const textModel = projectImageSettings.selectedTextModel || 'qwen-image';
    if (projectImageSettings.selectedTextModel) {
      setSelectedTextModel(projectImageSettings.selectedTextModel);
    }
    // Store for LORA initialization (done in separate effect after loraManager is created)
    initializedTextModelRef.current = textModel;
    hasInitializedGenerationSource.current = true;
  }, [projectImageSettings, selectedProjectId, isLoadingProjectSettings]);

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
        } catch (error) {
          console.error('[ImageGenerationForm] Failed to migrate base64 style reference:', error);
          toast.error('Failed to migrate style reference image');
        }
      }
    };
    
    migrateBase64ToUrl();
  }, [rawStyleReferenceImage, selectedProjectId, updateProjectImageSettings]);
  
  // Migrate legacy single reference to array format AND project-wide selection to shot-specific
  useEffect(() => {
    const migrateLegacyReference = async () => {
      if (!projectImageSettings || !selectedProjectId) return;
      
      let needsMigration = false;
      let updates: Partial<ProjectImageSettings> = {};
      
      // Migration 1: Flat reference properties -> references array
      const hasLegacyFlatFormat = projectImageSettings.styleReferenceImage && 
                                  !projectImageSettings.references;
      
      if (hasLegacyFlatFormat) {
        console.log('[RefSettings] 🔧 Migrating legacy flat reference to array format');
        needsMigration = true;
        
        const legacyReference: ReferenceImage = {
          id: nanoid(),
          resourceId: '', // Will be set by bulk migration
          name: "Reference 1",
          styleReferenceImage: projectImageSettings.styleReferenceImage || null,
          styleReferenceImageOriginal: projectImageSettings.styleReferenceImageOriginal || null,
          styleReferenceStrength: projectImageSettings.styleReferenceStrength ?? 1.1,
          subjectStrength: projectImageSettings.subjectStrength ?? 0.0,
          subjectDescription: projectImageSettings.subjectDescription ?? "",
          inThisScene: projectImageSettings.inThisScene ?? false,
          inThisSceneStrength: 1.0,
          referenceMode: 'style',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        updates.references = [legacyReference];
        updates.selectedReferenceIdByShot = { [effectiveShotId]: legacyReference.id };
        
        // Clear old flat properties
        updates.styleReferenceImage = undefined;
        updates.styleReferenceImageOriginal = undefined;
        updates.styleReferenceStrength = undefined;
        updates.subjectStrength = undefined;
        updates.subjectDescription = undefined;
        updates.inThisScene = undefined;
        updates.selectedReferenceId = undefined;
      }
      
      // Migration 2: Project-wide selectedReferenceId -> shot-specific selectedReferenceIdByShot
      const hasLegacyProjectWideSelection = projectImageSettings.selectedReferenceId && 
                                            !projectImageSettings.selectedReferenceIdByShot;
      
      if (hasLegacyProjectWideSelection && !hasLegacyFlatFormat) {
        console.log('[RefSettings] 🔧 Migrating project-wide selection to shot-specific');
        needsMigration = true;
        
        // Apply the old project-wide selection to the current shot
        updates.selectedReferenceIdByShot = {
          [effectiveShotId]: projectImageSettings.selectedReferenceId
        };
        updates.selectedReferenceId = undefined;
      }
      
      if (needsMigration) {
        try {
          await updateProjectImageSettings('project', updates);
          console.log('[RefSettings] ✅ Successfully migrated legacy reference settings');
        } catch (error) {
          console.error('[RefSettings] ❌ Failed to migrate legacy reference:', error);
        }
      }
    };
    
    migrateLegacyReference();
  }, [effectiveShotId, projectImageSettings, selectedProjectId, updateProjectImageSettings]);
  
  // Migrate references missing inThisSceneStrength field and old scene modes
  // Track per-project state to ensure migration runs only once
  const sceneMigrationStateRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const runSceneMigration = async () => {
      if (!projectImageSettings || !referencePointers.length || !selectedProjectId) return;
      if (sceneMigrationStateRef.current[selectedProjectId]) return; // Already migrated for this project
      
      // Check if any references still need migration
      const needsMigration = referencePointers.some(ref => 
        ref.inThisSceneStrength === undefined || 
        (ref.referenceMode as string) === 'scene-imprecise' || 
        (ref.referenceMode as string) === 'scene-precise'
      );
      
      if (!needsMigration) {
        sceneMigrationStateRef.current[selectedProjectId] = true;
        return;
      }
      
      console.log('[RefSettings] 🔧 Migrating references for scene mode updates');
      sceneMigrationStateRef.current[selectedProjectId] = true; // Prevent parallel runs
      
      const updatedReferences = referencePointers.map(ref => {
        const updates: Partial<ReferenceImage> = { ...ref };
        
        // Migrate old scene modes to new unified 'scene' mode
        if ((ref.referenceMode as string) === 'scene-imprecise' || (ref.referenceMode as string) === 'scene-precise') {
          updates.referenceMode = 'scene';
          // Keep existing inThisSceneStrength if present, otherwise set to 1.0
          updates.inThisSceneStrength = ref.inThisSceneStrength ?? 1.0;
        } else if (ref.inThisSceneStrength === undefined) {
          // Add missing inThisSceneStrength field
          updates.inThisSceneStrength = ref.inThisScene ? 1.0 : 0;
        }
        
        return updates as ReferenceImage;
      });
      
      try {
        // Only update references array to avoid clobbering selectedReferenceIdByShot
        await updateProjectImageSettings('project', { references: updatedReferences });
        console.log('[RefSettings] ✅ Successfully migrated scene settings');
      } catch (error) {
        console.error('[RefSettings] ❌ Failed to migrate scene settings:', error);
        sceneMigrationStateRef.current[selectedProjectId] = false; // Allow retry if it failed
      }
    };
    
    runSceneMigration();
  }, [projectImageSettings, referencePointers, selectedProjectId, updateProjectImageSettings]);
  
  // BULK MIGRATION: Convert legacy inline references to resource-based references
  // Use sessionStorage to persist migration state across component remounts
  const migrationCompleteRef = useRef(
    (() => {
      try {
        return typeof window !== 'undefined' && window.sessionStorage.getItem('referenceMigrationComplete') === 'true';
      } catch {
        return false;
      }
    })()
  );
  
  useEffect(() => {
    const migrateToResources = async () => {
      // Only run once per session and only if we have legacy references
      if (migrationCompleteRef.current || !hasLegacyReferences || !selectedProjectId) {
        return;
      }
      
      console.log('[RefMigration] 🔄 Starting bulk migration of', referencePointers.length, 'legacy references to resources table');
      migrationCompleteRef.current = true; // Mark as started to prevent duplicate runs
      
      // Persist to sessionStorage to prevent re-runs across component remounts
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('referenceMigrationComplete', 'true');
        }
      } catch {}
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('[RefMigration] ❌ Not authenticated');
          return;
        }
        
        const migratedPointers: ReferenceImage[] = [];
        
        for (const pointer of referencePointers) {
          // Skip if already migrated (has resourceId)
          if (pointer.resourceId) {
            migratedPointers.push(pointer);
            continue;
          }
          
          // Skip if no data to migrate
          if (!pointer.styleReferenceImage) {
            console.warn('[RefMigration] ⚠️ Skipping pointer with no image data:', pointer.id);
            migratedPointers.push(pointer);
            continue;
          }
          
          console.log('[RefMigration] 📦 Migrating reference:', pointer.id, pointer.name);
          
          // Create resource with legacy data
          const now = new Date().toISOString();
          const metadata: StyleReferenceMetadata = {
            name: pointer.name || 'Reference',
            styleReferenceImage: pointer.styleReferenceImage,
            styleReferenceImageOriginal: pointer.styleReferenceImageOriginal || pointer.styleReferenceImage,
            thumbnailUrl: pointer.thumbnailUrl || null,
            styleReferenceStrength: pointer.styleReferenceStrength ?? 1.1,
            subjectStrength: pointer.subjectStrength ?? 0.0,
            subjectDescription: pointer.subjectDescription || '',
            inThisScene: pointer.inThisScene ?? false,
            inThisSceneStrength: pointer.inThisSceneStrength ?? 1.0,
            referenceMode: pointer.referenceMode || 'style',
            styleBoostTerms: pointer.styleBoostTerms || '',
            is_public: privacyDefaults.resourcesPublic,
            created_by: {
              is_you: true,
              username: user.email || 'user',
            },
            createdAt: pointer.createdAt || now,
            updatedAt: pointer.updatedAt || now,
          };
          
          const resource = await createStyleReference.mutateAsync({
            type: 'style-reference',
            metadata,
          });
          
          console.log('[RefMigration] ✅ Created resource:', resource.id);
          
          // Create new pointer with only resourceId
          migratedPointers.push({
            id: pointer.id, // Keep same ID for selection tracking
            resourceId: resource.id,
          });
        }
        
        // Update project settings with migrated pointers
        await updateProjectImageSettings('project', {
          references: migratedPointers
        });
        
        console.log('[RefMigration] 🎉 Successfully migrated all references to resources table');
      } catch (error) {
        console.error('[RefMigration] ❌ Migration failed:', error);
        toast.error('Failed to migrate references');
        migrationCompleteRef.current = false; // Allow retry
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('referenceMigrationComplete');
          }
        } catch {}
      }
    };
    
    // Only check for legacy references once
    if (!migrationCompleteRef.current && hasLegacyReferences) {
      migrateToResources();
    }
  }, [selectedProjectId]); // Minimal dependencies - only re-run if project changes
  
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
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  
  // Prompt mode: automated vs managed (default to automated)
  const [promptMode, setPromptMode] = useState<PromptMode>('automated');
  // Local state for prompts when no shot is selected
  const [noShotPrompts, setNoShotPrompts] = useState<PromptEntry[]>([]);
  const [noShotMasterPrompt, setNoShotMasterPrompt] = useState('');

  // Optimistic button state for immediate feedback: idle → submitting → success → idle
  const automatedSubmitButton = useSubmitButtonState();

  // Removed unused currentShotId that was causing unnecessary re-renders
  const { data: shots } = useListShots(selectedProjectId);
  const { createShot, isCreating: isCreatingShot } = useShotCreation();
  const { navigateToShot } = useShotNavigation();
  
  // Define generatePromptId before using it in hooks
  const promptIdCounter = useRef(1);
  const generatePromptId = useCallback(() => `prompt-${promptIdCounter.current++}`, []);
  
  // AI interaction service for automated prompt generation
  const {
    generatePrompts: aiGeneratePrompts,
    isGenerating: isAIGenerating,
  } = useAIInteractionService({
    apiKey: openaiApiKey,
    generatePromptId,
  });

  // Debug project context
  useEffect(() => {
    console.log('[ImageGenerationForm] Project context - selectedProjectId:', selectedProjectId);
  }, [selectedProjectId]);

  // Debug persistence hook inputs (basic - detailed logging after hooks are initialized)
  useEffect(() => {
    console.log('[ImageGenerationForm] Persistence hook inputs:', {
      toolId: 'image-generation',
      context: { projectId: selectedProjectId },
      stateValues: {
        associatedShotId,
        imagesPerPrompt,
      }
    });
  }, [selectedProjectId, associatedShotId, imagesPerPrompt]);

  // Fetch public LoRAs from all users
  const { data: availableLoras } = usePublicLoras();

  // Fetch project-level settings for travel tool defaults
  const { settings: travelProjectSettings } = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { projectId: selectedProjectId, enabled: !!selectedProjectId }
  );

  const { settings: travelProjectUISettings } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: selectedProjectId, 
    enabled: !!selectedProjectId 
  });

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

  // Initialize LORAs from per-category storage (runs after loraManager is created)
  // Categories: 'qwen' (all Qwen models + by-reference) and 'z-image'
  const hasInitializedLoras = useRef(false);
  useEffect(() => {
    if (isLoadingProjectSettings) return;
    if (hasInitializedLoras.current) return;
    
    // Determine current category based on generation source and model
    const textModel = initializedTextModelRef.current || selectedTextModel;
    const currentSource = projectImageSettings?.generationSource || generationSource;
    // by-reference always uses 'qwen' category
    const category: LoraCategory = currentSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(textModel);
    
    // Try new category-based storage first, fall back to old per-model storage for migration
    let categoryLoras: ActiveLora[] = [];
    if (projectImageSettings?.selectedLorasByCategory) {
      categoryLoras = projectImageSettings.selectedLorasByCategory[category] ?? [];
    } else if (projectImageSettings?.selectedLorasByTextModel) {
      // Migration: use old per-model storage
      categoryLoras = projectImageSettings.selectedLorasByTextModel[textModel] ?? [];
    }
    
    if (categoryLoras.length > 0) {
      loraManager.setSelectedLoras(categoryLoras);
    }
    hasInitializedLoras.current = true;
  }, [projectImageSettings?.selectedLorasByCategory, projectImageSettings?.selectedLorasByTextModel, projectImageSettings?.generationSource, isLoadingProjectSettings, loraManager, selectedTextModel, generationSource]);

  // Default settings for shot prompts - recomputed when shot changes to pick up fresh localStorage
  // Inheritance chain: localStorage (last edited shot) → project-level settings → hardcoded defaults
  // Reference selection defaults to most-recent reference (handled in auto-select effect)
  // Note: beforeEachPromptText/afterEachPromptText are persisted per-shot but NOT inherited (default empty)
  const shotPromptDefaults = useMemo<ImageGenShotSettings>(() => {
    // Try to load last active shot settings for inheritance
    try {
      const stored = localStorage.getItem('image-gen-last-active-shot-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          prompts: [],
          masterPrompt: parsed.masterPrompt || '',
          promptMode: parsed.promptMode || 'automated',
          // IMPORTANT: Do NOT default this to null.
          // null is treated as an explicit override and would suppress the project-level
          // per-shot selection mapping (selectedReferenceIdByShot), leading to "no selection"
          // and jitter/jumps when the user clicks.
          // Leave undefined so we can fall back to project-level mapping until the user picks one.
        };
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    // Fall back to project-level settings if localStorage is empty
    return { 
      prompts: [], 
      masterPrompt: noShotMasterPrompt || '',
      promptMode: promptMode || 'automated',
    };
  }, [associatedShotId, noShotMasterPrompt, promptMode]);

  // Shot-specific prompts using per-shot storage
  const shotPromptSettings = useAutoSaveSettings<ImageGenShotSettings>({
    toolId: 'image-gen-prompts',
    shotId: associatedShotId,
    projectId: selectedProjectId,
    scope: 'shot',
    defaults: shotPromptDefaults,
    enabled: !!associatedShotId,
  });

  // Project-level settings (NOT shot-specific)
  // Note: promptMode here is the fallback when no shot is selected
  // beforeEachPromptText/afterEachPromptText persist but default to empty (not inherited from other shots)
  const { ready, isSaving, markAsInteracted } = usePersistentToolState<PersistedFormSettings>(
    'image-generation',
    { projectId: selectedProjectId },
    {
      imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
      selectedLoras: [loraManager.selectedLoras, loraManager.setSelectedLoras],
      beforeEachPromptText: [beforeEachPromptText, setBeforeEachPromptText],
      afterEachPromptText: [afterEachPromptText, setAfterEachPromptText],
      associatedShotId: [associatedShotId, setAssociatedShotId],
      promptMode: [promptMode, setPromptMode],
      prompts: [noShotPrompts, setNoShotPrompts], // Persist no-shot prompts
      masterPrompt: [noShotMasterPrompt, setNoShotMasterPrompt], // Persist no-shot master prompt
      hiresFixConfig: [hiresFixConfig, setHiresFixConfig],
    }
  );

  // Persist generationSource changes to project settings and apply model-specific hires defaults
  // Also swap LORAs when changing categories (e.g., by-reference → just-text z-image)
  const handleGenerationSourceChange = useCallback(async (source: GenerationSource) => {
    const previousSource = generationSource;
    console.log('[GenerationSourceDebug] handleGenerationSourceChange called:', { previousSource, newSource: source, selectedTextModel });
    setGenerationSource(source);
    markAsInteracted();

    // Apply model-specific hires fix defaults when switching modes
    const modelName = source === 'by-reference' ? 'qwen-image' : selectedTextModel;
    setHiresFixConfig(getHiresFixDefaultsForModel(modelName));

    // Determine categories for LORA swapping
    // by-reference always uses 'qwen' category
    const previousCategory: LoraCategory = previousSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);
    const newCategory: LoraCategory = source === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);

    // Only swap LORAs if changing categories
    if (previousCategory !== newCategory) {
      const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
        'qwen': [],
        'z-image': [],
      };

      // Save current LORAs to the previous category's slot
      const updatedLorasByCategory = {
        ...currentLorasByCategory,
        [previousCategory]: loraManager.selectedLoras,
      };

      // Load LORAs for the new category
      const newCategoryLoras = currentLorasByCategory[newCategory] ?? [];
      loraManager.setSelectedLoras(newCategoryLoras);

      try {
        await updateProjectImageSettings('project', { 
          generationSource: source,
          selectedLorasByCategory: updatedLorasByCategory,
        });
      } catch (error) {
        console.error('[GenerationSourcePersist] Failed to save generationSource:', error);
      }
    } else {
      try {
        await updateProjectImageSettings('project', { generationSource: source });
      } catch (error) {
        console.error('[GenerationSourcePersist] Failed to save generationSource:', error);
      }
    }
  }, [updateProjectImageSettings, markAsInteracted, selectedTextModel, generationSource, projectImageSettings?.selectedLorasByCategory, loraManager]);

  // Persist selectedTextModel changes to project settings and apply model-specific hires defaults
  // Swap LORAs only when changing categories (qwen ↔ z-image), not between Qwen variants
  const handleTextModelChange = useCallback(async (model: TextToImageModel) => {
    const previousModel = selectedTextModel;
    console.log('[GenerationSourceDebug] handleTextModelChange called:', { previousModel, newModel: model, generationSource });
    const previousCategory = getLoraCategoryForModel(previousModel);
    const newCategory = getLoraCategoryForModel(model);

    setSelectedTextModel(model);
    markAsInteracted();

    // Apply model-specific hires fix defaults when changing text model
    setHiresFixConfig(getHiresFixDefaultsForModel(model));

    // Only swap LORAs if changing categories (qwen ↔ z-image)
    if (previousCategory !== newCategory) {
      // Get current per-category LORA storage
      const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
        'qwen': [],
        'z-image': [],
      };

      // Save current LORAs to the previous category's slot
      const updatedLorasByCategory = {
        ...currentLorasByCategory,
        [previousCategory]: loraManager.selectedLoras,
      };

      // Load LORAs for the new category (or empty if none saved)
      const newCategoryLoras = currentLorasByCategory[newCategory] ?? [];
      loraManager.setSelectedLoras(newCategoryLoras);

      try {
        await updateProjectImageSettings('project', { 
          selectedTextModel: model,
          selectedLorasByCategory: updatedLorasByCategory,
        });
      } catch (error) {
        console.error('[GenerationSourcePersist] Failed to save selectedTextModel:', error);
      }
    } else {
      // Same category, just update the model selection
      try {
        await updateProjectImageSettings('project', { selectedTextModel: model });
      } catch (error) {
        console.error('[GenerationSourcePersist] Failed to save selectedTextModel:', error);
      }
    }
  }, [updateProjectImageSettings, markAsInteracted, selectedTextModel, projectImageSettings?.selectedLorasByCategory, loraManager]);

  // Single source of truth for whether shot settings are ready
  // Used by all shot-level field accessors to prevent flash of project values
  const isShotSettingsReady = useMemo(() => {
    if (!associatedShotId) return false; // No shot selected
    const settingsForCurrentShot = shotPromptSettings.entityId === associatedShotId;
    return settingsForCurrentShot &&
      (shotPromptSettings.status === 'ready' || shotPromptSettings.status === 'saving');
  }, [associatedShotId, shotPromptSettings.entityId, shotPromptSettings.status]);

  // Get current prompts - from shot settings if shot selected, otherwise local state
  const prompts = useMemo(() => {
    if (associatedShotId) {
      // Return empty while loading to avoid flash of project prompts
      return isShotSettingsReady ? (shotPromptSettings.settings.prompts || []) : [];
    }
    return noShotPrompts;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.prompts, noShotPrompts]);
  
  // Helper to update prompts - routes to shot settings or local state
  const setPrompts = useCallback((newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => {
    if (associatedShotId) {
      const currentPrompts = shotPromptSettings.settings.prompts || [];
      const updatedPrompts = typeof newPrompts === 'function' ? newPrompts(currentPrompts) : newPrompts;
      console.log('[ImageGenerationForm] setPrompts for shot:', associatedShotId.substring(0, 8), 'count:', updatedPrompts.length);
      shotPromptSettings.updateField('prompts', updatedPrompts);
      markAsInteracted();
    } else {
      console.log('[ImageGenerationForm] setPrompts for no-shot mode');
      // usePersistentToolState auto-syncs noShotPrompts to DB
      setNoShotPrompts(prev => {
        return typeof newPrompts === 'function' ? newPrompts(prev) : newPrompts;
      });
      markAsInteracted();
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted]);

  // Get current master prompt - from shot settings if shot selected, otherwise local state
  const masterPromptText = useMemo(() => {
    if (associatedShotId) {
      // Return empty while loading to avoid flash of project value
      return isShotSettingsReady ? (shotPromptSettings.settings.masterPrompt || '') : '';
    }
    return noShotMasterPrompt;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.masterPrompt, noShotMasterPrompt]);
  
  // Helper to update master prompt - routes to shot settings or local state
  const setMasterPromptText: React.Dispatch<React.SetStateAction<string>> = useCallback((newTextOrUpdater) => {
    if (associatedShotId) {
      const currentText = shotPromptSettings.settings.masterPrompt || '';
      const newText = typeof newTextOrUpdater === 'function' ? newTextOrUpdater(currentText) : newTextOrUpdater;
      shotPromptSettings.updateField('masterPrompt', newText);
      markAsInteracted();
    } else {
      // usePersistentToolState auto-syncs noShotMasterPrompt to DB
      setNoShotMasterPrompt(newTextOrUpdater);
      markAsInteracted();
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted]);
  
  // Get current prompt mode - from shot settings if shot selected, otherwise local state
  const effectivePromptMode = useMemo<PromptMode>(() => {
    if (associatedShotId) {
      // Return default while loading to avoid flash of project value
      return isShotSettingsReady ? (shotPromptSettings.settings.promptMode || 'automated') : 'automated';
    }
    return promptMode;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.promptMode, promptMode]);

  // Helper to update prompt mode - routes to shot settings or local state
  const setEffectivePromptMode = useCallback((newMode: PromptMode) => {
    console.log('[ImageGenerationForm] setEffectivePromptMode called:', {
      newMode,
      associatedShotId,
      shotSettingsStatus: shotPromptSettings.status,
      currentEffectiveMode: effectivePromptMode,
    });
    if (associatedShotId) {
      shotPromptSettings.updateField('promptMode', newMode);
      markAsInteracted();
    } else {
      // usePersistentToolState auto-syncs promptMode to DB
      setPromptMode(newMode);
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted, effectivePromptMode]);

  // Get current selected reference ID - from shot settings if shot selected, otherwise project settings
  // Note: Unlike other fields, reference ID intentionally falls back to project value while loading
  const effectiveSelectedReferenceId = useMemo<string | null>(() => {
    if (associatedShotId && isShotSettingsReady) {
      // Shot-level reference takes precedence if explicitly set
      const shotRefId = shotPromptSettings.settings.selectedReferenceId;
      if (shotRefId !== undefined) {
        return shotRefId;
      }
    }
    // Fall back to project-level selection
    return selectedReferenceId;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.selectedReferenceId, selectedReferenceId]);

  // Helper to update selected reference ID - routes to shot settings
  const setEffectiveSelectedReferenceId = useCallback((newRefId: string | null) => {
    if (associatedShotId) {
      console.log('[ImageGenerationForm] setSelectedReferenceId for shot:', associatedShotId.substring(0, 8), newRefId);
      shotPromptSettings.updateField('selectedReferenceId', newRefId);
      markAsInteracted();
    }
    // Also update the project-level per-shot mapping for backwards compatibility
    // (handled by existing handleReferenceSelection)
  }, [associatedShotId, shotPromptSettings, markAsInteracted]);

  // Get current before prompt text - from shot settings if shot selected, otherwise project state
  // Defaults to empty string for shots (not inherited from project)
  const currentBeforePromptText = useMemo(() => {
    if (associatedShotId) {
      // Return empty while loading to avoid flash of project value
      return isShotSettingsReady ? (shotPromptSettings.settings.beforeEachPromptText ?? '') : '';
    }
    return beforeEachPromptText;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.beforeEachPromptText, beforeEachPromptText]);

  // Helper to update before prompt text - routes to shot settings or project state
  const setCurrentBeforePromptText = useCallback((newText: string) => {
    if (associatedShotId) {
      shotPromptSettings.updateField('beforeEachPromptText', newText);
      markAsInteracted();
    } else {
      // usePersistentToolState auto-syncs beforeEachPromptText to DB
      setBeforeEachPromptText(newText);
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted]);

  // Get current after prompt text - from shot settings if shot selected, otherwise project state
  // Defaults to empty string for shots (not inherited from project)
  const currentAfterPromptText = useMemo(() => {
    if (associatedShotId) {
      // Return empty while loading to avoid flash of project value
      return isShotSettingsReady ? (shotPromptSettings.settings.afterEachPromptText ?? '') : '';
    }
    return afterEachPromptText;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.afterEachPromptText, afterEachPromptText]);

  // Helper to update after prompt text - routes to shot settings or project state
  const setCurrentAfterPromptText = useCallback((newText: string) => {
    if (associatedShotId) {
      shotPromptSettings.updateField('afterEachPromptText', newText);
      markAsInteracted();
    } else {
      // usePersistentToolState auto-syncs afterEachPromptText to DB
      setAfterEachPromptText(newText);
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted]);

  // Save current shot settings to localStorage for inheritance by new shots
  // Note: prompts and before/after prompt text are NOT inherited, only masterPrompt and mode settings
  // Uses status === 'ready' (not isShotSettingsReady) to only save on initial load, not during saves
  useEffect(() => {
    if (isShotSettingsReady && shotPromptSettings.status === 'ready') {
      try {
        const settingsToSave = {
          masterPrompt: shotPromptSettings.settings.masterPrompt || '',
          promptMode: shotPromptSettings.settings.promptMode || effectivePromptMode || 'automated',
        };
        localStorage.setItem('image-gen-last-active-shot-settings', JSON.stringify(settingsToSave));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }, [isShotSettingsReady, shotPromptSettings.status, shotPromptSettings.settings.masterPrompt, shotPromptSettings.settings.promptMode, effectivePromptMode]);

  // Sync local style strength with project settings
  // Legacy sync effects removed to prevent overwriting user input
  // The form state is now managed locally and only persisted to DB on change
  // It is NOT synced back from DB to avoid race conditions and jumping cursors

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
        associatedShotId,
        selectedProjectId,
        imagesPerPrompt,
        shotPromptStatus: shotPromptSettings.status,
        promptsCount: prompts.length,
      });
    }
  }, [ready, isSaving, associatedShotId, selectedProjectId, imagesPerPrompt, shotPromptSettings.status, prompts.length]);

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
        promptsCount: prompts.length,
        shotPromptStatus: shotPromptSettings.status,
        projectId: selectedProjectId,
      });
    }
  }, [ready, associatedShotId, prompts.length, shotPromptSettings.status, selectedProjectId]);

  // Apply initialShotId once after hydration (takes precedence over persisted value)
  // If initialShotId is explicitly null, reset to None (opened from outside shot context)
  // IMPORTANT: Do NOT call markAsInteracted() here - initialShotId is a temporary context
  // override (e.g., from modal opened in shot context), not a user preference to persist.
  // The tool page's persisted shot selection should only change when explicitly changed by user.
  const hasAppliedInitialShotId = useRef(false);
  useEffect(() => {
    // Only apply once, after hydration is complete
    // Only override when initialShotId is a specific shot ID (truthy string)
    // null or undefined = keep the persisted value from project settings
    if (ready && !hasAppliedInitialShotId.current && shots) {
      if (initialShotId) {
        // initialShotId was provided as a specific shot - set to that shot if it exists
        const shotExists = shots.some(shot => shot.id === initialShotId);
        if (shotExists && associatedShotId !== initialShotId) {
          setAssociatedShotId(initialShotId);
          // Don't persist - this is a temporary context override
        }
      }
      // If initialShotId is null/undefined, keep the persisted value from project settings
      hasAppliedInitialShotId.current = true;
    }
  }, [ready, initialShotId, shots, associatedShotId]);

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

  // Track which entities we've initialized to prevent infinite loops
  const initializedEntitiesRef = useRef<Set<string>>(new Set());

  // Initialize prompts when empty - handles both shot and no-shot cases
  useEffect(() => {
    const entityKey = associatedShotId || 'no-shot';
    
    // Skip if already initialized for this entity
    if (initializedEntitiesRef.current.has(entityKey)) {
      return;
    }
    
    // For shot mode: wait until shot settings are ready AND confirmed for current shot
    const settingsForCurrentShot = shotPromptSettings.entityId === associatedShotId;
    if (associatedShotId && (shotPromptSettings.status !== 'ready' || !settingsForCurrentShot)) {
      return;
    }
    
    // Check if we need to initialize
    const currentPrompts = associatedShotId ? shotPromptSettings.settings.prompts : noShotPrompts;
    if (!currentPrompts || currentPrompts.length === 0) {
      // Mark as initialized BEFORE updating to prevent loops
      initializedEntitiesRef.current.add(entityKey);
      
      // Add a small delay to prevent rapid resets during hydration
      const timeoutId = setTimeout(() => {
        const emptyPrompt = { id: generatePromptId(), fullPrompt: "", shortPrompt: "" };
        if (associatedShotId) {
          console.log('[ImageGenerationForm] Initializing empty prompts for shot:', associatedShotId.substring(0, 8));
          shotPromptSettings.updateField('prompts', [emptyPrompt]);
        } else {
          console.log('[ImageGenerationForm] Initializing empty prompts for no-shot mode');
          setNoShotPrompts([emptyPrompt]);
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    } else {
      // Prompts exist, mark as initialized
      initializedEntitiesRef.current.add(entityKey);
    }
  }, [associatedShotId, shotPromptSettings.status, shotPromptSettings.entityId, generatePromptId]); // Removed settings.prompts and noShotPrompts to prevent loops

  const hasApiKey = true; // Always true for wan-local

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
      // Note: beforeEachPromptText/afterEachPromptText are NOT restored - they reset on page load
    },
    getAssociatedShotId: () => associatedShotId,
  }));

  // Apply default LoRAs using the new generalized approach
  // NOTE: Disabled since we're now always using qwen-image model
  useEffect(() => { 
    if (
      false && // Disabled - always using qwen-image
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

  // Wrap loraManager handlers to maintain markAsInteracted behavior AND persist to per-category storage
  // Categories: 'qwen' (all Qwen models + by-reference) and 'z-image'
  const persistLorasToCategory = useCallback(async (loras: ActiveLora[]) => {
    if (!updateProjectImageSettings) return;
    // Determine current category based on generation source and model
    const category: LoraCategory = generationSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);
    
    const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
      'qwen': [],
      'z-image': [],
    };
    const updatedLorasByCategory = {
      ...currentLorasByCategory,
      [category]: loras,
    };
    try {
      await updateProjectImageSettings('project', { selectedLorasByCategory: updatedLorasByCategory });
    } catch (error) {
      console.error('[LoRAPersist] Failed to save LORAs to category slot:', error);
    }
  }, [updateProjectImageSettings, projectImageSettings?.selectedLorasByCategory, selectedTextModel, generationSource]);

  const handleAddLora = (loraToAdd: LoraModel) => { 
    markAsInteracted();
    loraManager.handleAddLora(loraToAdd); // markAsUserSet is now handled internally
    // Persist to per-model storage after adding
    const newLora: ActiveLora = {
      id: loraToAdd["Model ID"],
      name: loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"],
      path: loraToAdd.high_noise_url || loraToAdd["Model Files"]?.[0]?.url || loraToAdd["Model Files"]?.[0]?.path || '',
      strength: 1.0,
      previewImageUrl: loraToAdd.Images?.[0]?.url,
      trigger_word: loraToAdd.trigger_word,
      lowNoisePath: loraToAdd.low_noise_url,
      isMultiStage: !!(loraToAdd.high_noise_url || loraToAdd.low_noise_url),
    };
    persistLorasToCategory([...loraManager.selectedLoras, newLora]);
  };
  const handleRemoveLora = (loraIdToRemove: string) => {
    markAsInteracted();
    loraManager.handleRemoveLora(loraIdToRemove); // markAsUserSet is now handled internally
    // Persist to per-model storage after removing
    persistLorasToCategory(loraManager.selectedLoras.filter(l => l.id !== loraIdToRemove));
  };
  const handleLoraStrengthChange = (loraId: string, newStrength: number) => {
    markAsInteracted();
    loraManager.handleLoraStrengthChange(loraId, newStrength); // markAsUserSet is now handled internally
    // Persist to per-model storage after updating strength
    persistLorasToCategory(loraManager.selectedLoras.map(l => l.id === loraId ? { ...l, strength: newStrength } : l));
  };

  // Wrap the load project LoRAs function to mark as interacted
  const handleLoadProjectLoras = async () => {
    await loraManager.handleLoadProjectLoras?.(); // markAsUserSet is now handled internally
    markAsInteracted();
  };

  // Handle style reference image upload
  const handleStyleReferenceUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // GUARD: Don't add references while settings are loading
    // If we proceed with stale/empty cache, we could overwrite existing references
    if (isLoadingProjectSettings) {
      console.warn('[RefSettings] ⚠️ Cannot upload reference while settings are loading');
      toast.error('Please wait for settings to load');
      return;
    }

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
      
      // Generate and upload thumbnail for grid display
      console.log('[ThumbnailDebug] Generating thumbnail for reference image...');
      let thumbnailUrl: string | null = null;
      try {
        const thumbnailResult = await generateClientThumbnail(originalFile, 300, 0.8);
        console.log('[ThumbnailDebug] Thumbnail generated:', {
          width: thumbnailResult.thumbnailWidth,
          height: thumbnailResult.thumbnailHeight,
          size: thumbnailResult.thumbnailBlob.size
        });
        
        // Upload thumbnail to storage using centralized path utilities
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error('User not authenticated');
        }
        const thumbnailFilename = generateThumbnailFilename();
        const thumbnailPath = storagePaths.thumbnail(session.user.id, thumbnailFilename);
        
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(thumbnailPath, thumbnailResult.thumbnailBlob, {
            contentType: 'image/jpeg',
            upsert: true
          });
        
        if (thumbnailUploadError) {
          console.error('[ThumbnailDebug] Thumbnail upload error:', thumbnailUploadError);
          // Use original as fallback
          thumbnailUrl = originalUploadedUrl;
        } else {
          const { data: thumbnailUrlData } = supabase.storage
            .from(MEDIA_BUCKET)
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
          console.log('[ThumbnailDebug] Thumbnail uploaded successfully:', thumbnailUrl);
        }
      } catch (thumbnailError) {
        console.error('[ThumbnailDebug] Error generating thumbnail:', thumbnailError);
        // Use original as fallback
        thumbnailUrl = originalUploadedUrl;
      }
      
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
      
      // Get user for metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Create resource metadata
      const now = new Date().toISOString();
      const metadata: StyleReferenceMetadata = {
        name: `Reference ${(hydratedReferences.length + 1)}`,
        styleReferenceImage: processedUploadedUrl,
        styleReferenceImageOriginal: originalUploadedUrl,
        thumbnailUrl: thumbnailUrl,
        styleReferenceStrength: 1.1,
        subjectStrength: 0.0,
        subjectDescription: "",
        inThisScene: false,
        inThisSceneStrength: 1.0,
        referenceMode: 'style',
        styleBoostTerms: '',
        is_public: privacyDefaults.resourcesPublic,
        created_by: {
          is_you: true,
          username: user.email || 'user',
        },
        createdAt: now,
        updatedAt: now,
      };
      
      console.log('[RefSettings] ➕ Creating new reference resource:', metadata.name);
      
      // Create resource in resources table
      const resource = await createStyleReference.mutateAsync({
        type: 'style-reference',
        metadata,
      });
      
      console.log('[RefSettings] ✅ Created resource:', resource.id);
      
      // Create lightweight pointer with createdAt for sorting (newest first)
      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
        createdAt: new Date().toISOString(),
      };
      
      console.log('[RefSettings] ➕ Creating reference pointer:', newPointer);
      
      // Optimistic UI updates for both resources and settings
      try {
        // Update resources cache optimistically so hydration works immediately
        queryClient.setQueryData(['resources', 'style-reference'], (prev: any) => {
          const prevResources = prev || [];
          return [...prevResources, resource];
        });

        // Update settings cache to select the new reference
        // IMPORTANT: Use functional update with prev to avoid race conditions
        queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) =>
          updateSettingsCache<ProjectImageSettings>(prev, (prevSettings) => ({
            references: [...(prevSettings?.references || []), newPointer],
            selectedReferenceIdByShot: {
              ...(prevSettings?.selectedReferenceIdByShot || {}),
              [effectiveShotId]: newPointer.id
            }
          }))
        );
      } catch (e) {
        console.warn('[RefSettings] Failed to set optimistic cache data', e);
      }

      // Read from cache after optimistic update to get current state
      const currentData = extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined])
      ) || {};

      // Add the new pointer and select it for the current shot
      await updateProjectImageSettings('project', {
        references: currentData?.references || [],
        selectedReferenceIdByShot: currentData?.selectedReferenceIdByShot || {}
      });
      
      // Don't invalidate immediately - let optimistic updates do their job
      // The debounced updateProjectImageSettings will eventually persist to DB
      // and the mutation's onSuccess will handle query invalidation
      
      markAsInteracted();
      // Optimistically reflect the original uploaded image for display
      setStyleReferenceOverride(originalUploadedUrl);
      
      console.log('[RefSettings] ✅ Style reference upload completed successfully!', {
        newPointerId: newPointer.id,
        selectedForShot: effectiveShotId,
        allSelections: {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: newPointer.id
        }
      });
    } catch (error) {
      console.error('Error uploading style reference:', error);
      toast.error('Failed to upload reference image');
    } finally {
      setIsUploadingStyleReference(false);
    }
  }, [effectiveShotId, selectedReferenceIdByShot, updateProjectImageSettings, markAsInteracted, selectedProjectId, hydratedReferences, queryClient, createStyleReference, referencePointers, isLoadingProjectSettings]);

  // Handle selecting an existing resource from the browser (no upload needed)
  const handleResourceSelect = useCallback(async (resource: Resource) => {
    // GUARD: Don't add references while settings are loading
    // If we proceed with stale/empty cache, we could overwrite existing references
    if (isLoadingProjectSettings) {
      console.warn('[RefBrowser] ⚠️ Cannot add reference while settings are loading');
      toast.error('Please wait for settings to load');
      return;
    }

    try {
      // Check if we already have this resource linked
      const existingPointer = referencePointers.find(ptr => ptr.resourceId === resource.id);
      
      if (existingPointer) {
        console.log('[RefBrowser] 🔄 Resource already linked, switching to existing reference:', existingPointer.id);
        
        // Just select the existing reference for this shot
        const optimisticUpdate = {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: existingPointer.id
        };
        
        // Optimistic Update
        try {
          queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) =>
            updateSettingsCache<ProjectImageSettings>(prev, { selectedReferenceIdByShot: optimisticUpdate })
          );
        } catch (e) {
          console.warn('[RefBrowser] Failed to set optimistic cache data for existing ref switch', e);
        }

        // Persist
        await updateProjectImageSettings('project', {
          selectedReferenceIdByShot: optimisticUpdate
        });
        
        markAsInteracted();
        return;
      }

      // Create lightweight pointer to existing resource
      // Explicitly set subjectDescription and styleBoostTerms to empty strings
      // so they don't inherit from the resource's metadata
      // Preserve the current referenceMode and set corresponding strength values
      const modeDefaults = referenceMode === 'custom'
        ? { styleReferenceStrength, subjectStrength, inThisScene, inThisSceneStrength }
        : getReferenceModeDefaults(referenceMode, isLocalGenerationEnabled);

      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
        subjectDescription: '',
        styleBoostTerms: '',
        referenceMode: referenceMode,
        createdAt: new Date().toISOString(), // For sorting (newest first)
        ...modeDefaults,
      };
      
      console.log('[RefBrowser] 🔗 Linking existing resource:', {
        resourceId: resource.id,
        resourceType: resource.type,
        pointerId: newPointer.id,
        willBeSelectedForShot: effectiveShotId,
        selectedProjectId
      });
      
      // Optimistic UI update - use functional update to get current state
      try {
        queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) =>
          updateSettingsCache<ProjectImageSettings>(prev, (prevSettings) => ({
            references: [...(prevSettings?.references || []), newPointer],
            selectedReferenceIdByShot: {
              ...(prevSettings?.selectedReferenceIdByShot || {}),
              [effectiveShotId]: newPointer.id
            }
          }))
        );
      } catch (e) {
        console.error('[RefBrowser] ❌ Failed to set optimistic cache data:', e);
      }

      // Get current values for persistence
      const currentData2 = extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined])
      ) || {};
      await updateProjectImageSettings('project', {
        references: currentData2?.references || [],
        selectedReferenceIdByShot: currentData2?.selectedReferenceIdByShot || {}
      });
      
      console.log('[RefBrowser] ✅ Successfully linked existing resource and persisted to DB');
      markAsInteracted();
    } catch (error) {
      console.error('[RefBrowser] ❌ Failed to link resource:', error);
      toast.error('Failed to add reference');
    }
  }, [effectiveShotId, updateProjectImageSettings, queryClient, selectedProjectId, markAsInteracted, referencePointers, selectedReferenceIdByShot, referenceMode, styleReferenceStrength, subjectStrength, inThisScene, inThisSceneStrength, isLoadingProjectSettings]);

  // Handle selecting a reference for the current shot
  const handleSelectReference = useCallback(async (referenceId: string) => {
    console.log('[RefSettings] 🔀 Selecting reference for shot', effectiveShotId, ':', referenceId);
    
    // Also update shot-level settings for inheritance (stored in shotPromptSettings)
    if (associatedShotId) {
      shotPromptSettings.updateField('selectedReferenceId', referenceId);
    }
    
    // Optimistic UI update for project-level per-shot mapping
    const optimisticUpdate = {
      ...selectedReferenceIdByShot,
      [effectiveShotId]: referenceId
    };
    
    try {
      queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) =>
        updateSettingsCache<ProjectImageSettings>(prev, { selectedReferenceIdByShot: optimisticUpdate })
      );
    } catch (e) {
      console.warn('[RefSettings] Failed to set optimistic cache data', e);
    }

    // Persist to database (debounced)
    await updateProjectImageSettings('project', {
      selectedReferenceIdByShot: optimisticUpdate
    });
    markAsInteracted();
  }, [effectiveShotId, selectedReferenceIdByShot, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId, associatedShotId, shotPromptSettings]);
  
  // Handle deleting a reference
  const handleDeleteReference = useCallback(async (referenceId: string) => {
    console.log('[RefSettings] 🗑️ Deleting reference:', referenceId);
    
    // Find the hydrated reference to get the resourceId
    const hydratedRef = hydratedReferences.find(r => r.id === referenceId);
    if (!hydratedRef) {
      console.error('[RefSettings] ❌ Could not find reference:', referenceId);
      return;
    }
    
    // Delete the resource from resources table
    try {
      await deleteStyleReference.mutateAsync({
        id: hydratedRef.resourceId,
        type: 'style-reference',
      });
      console.log('[RefSettings] ✅ Resource deleted successfully');
    } catch (error) {
      console.error('[RefSettings] ❌ Failed to delete resource:', error);
      toast.error('Failed to delete reference');
      return;
    }
    
    // Remove pointer from settings
    const filteredPointers = referencePointers.filter(ref => ref.id !== referenceId);
    
    // Update all shot selections that had this reference selected
    const updatedSelections = { ...selectedReferenceIdByShot };
    Object.keys(updatedSelections).forEach(shotId => {
      if (updatedSelections[shotId] === referenceId) {
        // Select first remaining reference or null
        updatedSelections[shotId] = filteredPointers[0]?.id ?? null;
      }
    });
    
    // Optimistic UI update
    try {
      queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) =>
        updateSettingsCache<ProjectImageSettings>(prev, {
          references: filteredPointers,
          selectedReferenceIdByShot: updatedSelections
        })
      );
    } catch (e) {
      console.warn('[RefSettings] Failed to set optimistic cache data', e);
    }

    // Persist to database (debounced)
    await updateProjectImageSettings('project', {
      references: filteredPointers,
      selectedReferenceIdByShot: updatedSelections
    });

    markAsInteracted();
  }, [hydratedReferences, referencePointers, selectedReferenceIdByShot, deleteStyleReference, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId]);
  
  // Handle updating a reference's settings
  const handleUpdateReference = useCallback(async (referenceId: string, updates: Partial<HydratedReferenceImage>) => {
    console.log('[RefSettings] 💾 Updating reference settings (project-level):', { referenceId, updates });
    
    // Find the current pointer
    const currentPointer = referencePointers.find(r => r.id === referenceId);
    if (!currentPointer) {
      console.error('[RefSettings] ❌ Could not find reference pointer:', referenceId);
      return;
    }
    
    // Update only the project-specific usage settings in the pointer
    // These are YOUR settings for how YOU use this reference, not the resource itself
    const updatedPointer: ReferenceImage = {
      ...currentPointer,
      // Only update project-specific usage fields
      ...(updates.referenceMode !== undefined && { referenceMode: updates.referenceMode }),
      ...(updates.styleReferenceStrength !== undefined && { styleReferenceStrength: updates.styleReferenceStrength }),
      ...(updates.subjectStrength !== undefined && { subjectStrength: updates.subjectStrength }),
      ...(updates.subjectDescription !== undefined && { subjectDescription: updates.subjectDescription }),
      ...(updates.inThisScene !== undefined && { inThisScene: updates.inThisScene }),
      ...(updates.inThisSceneStrength !== undefined && { inThisSceneStrength: updates.inThisSceneStrength }),
      ...(updates.styleBoostTerms !== undefined && { styleBoostTerms: updates.styleBoostTerms }),
    };
    
    // Update the references array in project settings
    const updatedReferences = referencePointers.map(ref => 
      ref.id === referenceId ? updatedPointer : ref
    );
    
    console.log('[RefSettings] 📤 Updating project settings with new pointer:', updatedPointer);
    
    try {
      await updateProjectImageSettings('project', {
        references: updatedReferences,
      });
      console.log('[RefSettings] ✅ Project settings updated successfully');
    } catch (error) {
      console.error('[RefSettings] ❌ Failed to update project settings:', error);
      toast.error('Failed to update reference settings');
    }
    
    markAsInteracted();
  }, [referencePointers, updateProjectImageSettings, markAsInteracted]);
  
  // Handle updating a reference's name
  const handleUpdateReferenceName = useCallback(async (referenceId: string, name: string) => {
    console.log('[RefSettings] ✏️ Updating reference name:', referenceId, name);
    // Use the generic update handler which updates the resource
    await handleUpdateReference(referenceId, { name });
  }, [handleUpdateReference]);
  
  // Handle toggling visibility (is_public) of a reference
  const handleToggleVisibility = useCallback(async (resourceId: string, currentIsPublic: boolean) => {
    console.log('[RefSettings] 👁️ Toggling visibility:', { resourceId, currentIsPublic, newValue: !currentIsPublic });
    
    // Find the hydrated reference to get the full metadata
    const hydratedRef = hydratedReferences.find(r => r.resourceId === resourceId);
    if (!hydratedRef) {
      console.error('[RefSettings] ❌ Could not find reference with resourceId:', resourceId);
      return;
    }
    
    try {
      // Update the resource with the new is_public value
      const updatedMetadata: StyleReferenceMetadata = {
        name: hydratedRef.name,
        styleReferenceImage: hydratedRef.styleReferenceImage,
        styleReferenceImageOriginal: hydratedRef.styleReferenceImageOriginal,
        thumbnailUrl: hydratedRef.thumbnailUrl,
        styleReferenceStrength: hydratedRef.styleReferenceStrength,
        subjectStrength: hydratedRef.subjectStrength,
        subjectDescription: hydratedRef.subjectDescription,
        inThisScene: hydratedRef.inThisScene,
        inThisSceneStrength: hydratedRef.inThisSceneStrength,
        referenceMode: hydratedRef.referenceMode,
        styleBoostTerms: hydratedRef.styleBoostTerms,
        created_by: { is_you: true },
        is_public: !currentIsPublic,
        createdAt: hydratedRef.createdAt,
        updatedAt: new Date().toISOString(),
      };
      
      await updateStyleReference.mutateAsync({
        id: resourceId,
        type: 'style-reference',
        metadata: updatedMetadata,
      });
      
      console.log('[RefSettings] ✅ Visibility toggled successfully');
    } catch (error) {
      console.error('[RefSettings] ❌ Failed to toggle visibility:', error);
      toast.error('Failed to update visibility');
    }
  }, [hydratedReferences, updateStyleReference]);
  
  // Handle removing style reference image (legacy - now removes selected reference)
  const handleRemoveStyleReference = useCallback(async () => {
    if (!selectedReferenceId) return;
    await handleDeleteReference(selectedReferenceId);
  }, [selectedReferenceId, handleDeleteReference]);

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
      queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) =>
        updateSettingsCache<ProjectImageSettings>(prev, { selectedModel: value })
      );
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
    if (!selectedReferenceId) return;
    setStyleReferenceStrength(value);
    await handleUpdateReference(selectedReferenceId, { styleReferenceStrength: value });
  }, [selectedReferenceId, handleUpdateReference]);

  // Handle subject strength change
  const handleSubjectStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) return;
    setSubjectStrength(value);
    await handleUpdateReference(selectedReferenceId, { subjectStrength: value });
  }, [selectedReferenceId, handleUpdateReference]);

  // Handle subject description change (same pattern as PromptInputRow)
  const handleSubjectDescriptionChange = useCallback(async (value: string) => {
    if (!selectedReferenceId) return;
    
    // Update local state immediately for responsive UI
    setSubjectDescription(value);
    
    // CRITICAL: Update lastFromParent to prevent race condition with delayed DB updates
    // This ensures we don't sync back stale data when async saves complete
    setLastSubjectDescriptionFromParent(value);
    
    // Save changes to database (optimistic + debounced 300ms)
    await handleUpdateReference(selectedReferenceId, { subjectDescription: value });
  }, [selectedReferenceId, handleUpdateReference]);
  
  // Handle focus on subject description field
  const handleSubjectDescriptionFocus = useCallback(() => {
    setIsEditingSubjectDescription(true);
  }, []);
  
  // Handle blur on subject description field
  const handleSubjectDescriptionBlur = useCallback(() => {
    setIsEditingSubjectDescription(false);
  }, []);

  const handleInThisSceneChange = useCallback(async (value: boolean) => {
    if (!selectedReferenceId) return;
    setInThisScene(value);
    await handleUpdateReference(selectedReferenceId, { inThisScene: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleInThisSceneStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) return;
    setInThisSceneStrength(value);
    await handleUpdateReference(selectedReferenceId, { inThisSceneStrength: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleStyleBoostTermsChange = useCallback(async (value: string) => {
    if (!selectedReferenceId) return;
    
    // Update local state immediately for responsive UI
    setStyleBoostTerms(value);
    
    // Save changes to database (optimistic + debounced 300ms)
    await handleUpdateReference(selectedReferenceId, { styleBoostTerms: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleReferenceModeChange = useCallback(async (mode: ReferenceMode) => {
    if (!selectedReferenceId) return;
    console.log('[RefModeDebug] 🎯 User changed mode to:', mode);

    // Get defaults for this mode and generation environment
    const defaults = getReferenceModeDefaults(mode, isLocalGenerationEnabled);

    // Build update object with mode AND auto-set strength values
    const updates: Partial<ReferenceImage> = {
      referenceMode: mode,
      ...defaults,
    };

    // For custom mode, only apply defaults if current strengths are too low
    if (mode === 'custom') {
      const currentTotal = styleReferenceStrength + subjectStrength;
      if (currentTotal >= 0.5) {
        // Keep current values, just update the mode
        delete updates.styleReferenceStrength;
        delete updates.subjectStrength;
        delete updates.inThisScene;
        delete updates.inThisSceneStrength;
      } else {
        console.log('[RefModeDebug] ⚠️ Custom mode selected but strengths are too low. Resetting to defaults.');
      }
    }
    
    console.log('[RefModeDebug] 🎯 Batched update for mode change:', updates);
    console.log('[RefModeDebug] updates.styleReferenceStrength:', updates.styleReferenceStrength);
    console.log('[RefModeDebug] updates.subjectStrength:', updates.subjectStrength);
    console.log('[RefModeDebug] updates.inThisSceneStrength:', updates.inThisSceneStrength);
    
    // Optimistic local updates
    pendingReferenceModeUpdate.current = mode;
    setReferenceMode(mode);
    console.log('[RefModeDebug] Setting local state:');
    if (updates.styleReferenceStrength !== undefined) {
      console.log('[RefModeDebug] → setStyleReferenceStrength:', updates.styleReferenceStrength);
      setStyleReferenceStrength(updates.styleReferenceStrength);
    }
    if (updates.subjectStrength !== undefined) {
      console.log('[RefModeDebug] → setSubjectStrength:', updates.subjectStrength);
      setSubjectStrength(updates.subjectStrength);
    }
    if (updates.inThisScene !== undefined) {
      console.log('[RefModeDebug] → setInThisScene:', updates.inThisScene);
      setInThisScene(updates.inThisScene);
    }
    if (updates.inThisSceneStrength !== undefined) {
      console.log('[RefModeDebug] → setInThisSceneStrength:', updates.inThisSceneStrength);
      setInThisSceneStrength(updates.inThisSceneStrength);
    }

    // Set denoise to 0.5 for Subject and Scene modes
    if (mode === 'subject' || mode === 'scene') {
      setHiresFixConfig(prev => ({ ...prev, hires_denoise: 0.5 }));
    }

    // Single batched update to avoid race conditions
    console.log('[RefModeDebug] Calling handleUpdateReference with:', { referenceId: selectedReferenceId, updates });
    await handleUpdateReference(selectedReferenceId, updates);
  }, [selectedReferenceId, handleUpdateReference, styleReferenceStrength, subjectStrength, isLocalGenerationEnabled]);

  const handleAddPrompt = (source: 'form' | 'modal' = 'form') => {
    markAsInteracted();
    const newId = generatePromptId();
    const newPromptNumber = prompts.length + 1;
    const newPrompt = { id: newId, fullPrompt: "", shortPrompt: `Prompt ${newPromptNumber}` };
    setPrompts(prev => [...prev, newPrompt]);
  };

  const handleOpenMagicPrompt = useCallback(() => {
    setOpenPromptModalWithAIExpanded(true);
    setIsPromptModalOpen(true);
  }, []);

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
  
  const handleDeleteAllPrompts = () => {
    markAsInteracted();
    const newId = generatePromptId();
    setPrompts([{ id: newId, fullPrompt: "", shortPrompt: "Prompt 1" }]);
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

  // Build BatchImageGenerationTaskParams from current form state
  // This is the single source of truth for task param construction
  const getTaskParams = useCallback((
    promptsToUse: PromptEntry[],
    options?: { imagesPerPromptOverride?: number }
  ): BatchImageGenerationTaskParams | null => {
    const activePrompts = promptsToUse.filter(p => p.fullPrompt.trim() !== "");

    if (activePrompts.length === 0) {
      toast.error("Please enter at least one valid prompt.");
      return null;
    }

    // Use refs to ensure we always get the latest value (prevents stale closure bugs)
    const currentGenerationSource = generationSourceRef.current;
    const currentTextModel = selectedTextModelRef.current;

    // Validate: require style reference for by-reference mode
    if (currentGenerationSource === 'by-reference' && !styleReferenceImageGeneration) {
      toast.error("Please upload a style reference image for by-reference mode.");
      return null;
    }

    // Only include reference params for by-reference mode
    console.log('[GenerationSourceDebug] getTaskParams building params:', {
      generationSource,
      generationSourceRef: currentGenerationSource,
      selectedTextModel,
      selectedTextModelRef: currentTextModel,
      styleReferenceImageGeneration,
      willIncludeReferenceParams: currentGenerationSource === 'by-reference'
    });
    const referenceParams: ReferenceApiParams = currentGenerationSource === 'by-reference' ? {
      style_reference_image: styleReferenceImageGeneration ?? undefined,
      style_reference_strength: currentStyleStrength,
      subject_strength: currentSubjectStrength,
      subject_description: effectiveSubjectDescription,
      in_this_scene: currentInThisScene,
      in_this_scene_strength: currentInThisSceneStrength,
      reference_mode: referenceMode,
    } : {};

    return buildBatchTaskParams({
      projectId: selectedProjectId!,
      prompts: activePrompts,
      imagesPerPrompt: options?.imagesPerPromptOverride ?? imagesPerPrompt,
      shotId: associatedShotId,
      beforePromptText: currentBeforePromptText,
      afterPromptText: currentAfterPromptText,
      styleBoostTerms: currentStyleBoostTerms,
      isLocalGenerationEnabled,
      hiresFixConfig,
      modelName: currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image',
      referenceParams,
    });
  }, [
    generationSource,
    styleReferenceImageGeneration,
    currentStyleStrength,
    currentSubjectStrength,
    effectiveSubjectDescription,
    currentInThisScene,
    currentInThisSceneStrength,
    referenceMode,
    selectedProjectId,
    imagesPerPrompt,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    currentStyleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    selectedTextModel,
  ]);

  const handleGenerateAndQueue = useCallback((updatedPrompts: PromptEntry[]) => {
    console.log('[ImageGenerationForm] Generate & Queue: Received', updatedPrompts.length, 'prompts, saving and queuing');

    // Save the prompts to state for future use
    handleSavePromptsFromModal(updatedPrompts);

    // Close the modal
    setIsPromptModalOpen(false);
    setOpenPromptModalWithAIExpanded(false);

    // Build task params (includes validation)
    const taskParams = getTaskParams(updatedPrompts);
    if (!taskParams) return;

    onGenerate(taskParams);
  }, [handleSavePromptsFromModal, getTaskParams, onGenerate]);

  // Handler for "Use Existing Prompts" button in automated mode
  // Uses the already-inputted prompts directly to generate images
  const handleUseExistingPrompts = useCallback(async () => {
    console.log('[ImageGenerationForm] Use Existing Prompts: Using', prompts.length, 'existing prompts');

    // Build task params with promptMultiplier override (includes validation)
    const taskParams = getTaskParams(prompts, { imagesPerPromptOverride: promptMultiplier });
    if (!taskParams) return;

    console.log('[ImageGenerationForm] Use Existing Prompts: Queuing', taskParams.prompts.length, 'images');
    onGenerate(taskParams);
  }, [prompts, promptMultiplier, getTaskParams, onGenerate]);

  // Handler for "New Prompts Like Existing" button in automated mode
  // Uses existing prompts as context to generate similar new prompts, then generates images
  const handleNewPromptsLikeExisting = useCallback(async () => {
    const activePrompts = prompts.filter(p => p.fullPrompt.trim() !== "");
    if (activePrompts.length === 0) {
      toast.error("No prompts available. Please add prompts first.");
      return;
    }

    // Validate early before AI call (use ref to ensure latest value)
    if (generationSourceRef.current === 'by-reference' && !styleReferenceImageGeneration) {
      toast.error("Please upload a style reference image for by-reference mode.");
      return;
    }

    try {
      setIsGeneratingAutomatedPrompts(true);

      console.log('[ImageGenerationForm] New Prompts Like Existing: Using', activePrompts.length, 'prompts as context');

      // Generate new prompts using existing ones as context (like remix mode)
      const rawResults = await aiGeneratePrompts({
        overallPromptText: "Make me more prompts like this.",
        numberToGenerate: imagesPerPrompt, // Slider value = number of prompts
        existingPrompts: activePrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt })),
        addSummaryForNewPrompts: true,
        replaceCurrentPrompts: true,
        temperature: 0.8,
        rulesToRememberText: '',
      });

      console.log('[ImageGenerationForm] New Prompts Like Existing: Generated', rawResults.length, 'new prompts');

      // Convert to PromptEntry format
      const newPrompts: PromptEntry[] = rawResults.map(item => ({
        id: item.id,
        fullPrompt: item.text,
        shortPrompt: item.shortText || item.text.substring(0, 30) + (item.text.length > 30 ? "..." : ""),
      }));

      // Save generated prompts to state
      setPrompts(newPrompts);

      // Build task params with the new prompts (includes validation)
      const taskParams = getTaskParams(newPrompts, { imagesPerPromptOverride: promptMultiplier });
      if (!taskParams) return;

      console.log('[ImageGenerationForm] New Prompts Like Existing: Queuing', newPrompts.length, 'images');
      onGenerate(taskParams);
    } catch (error) {
      console.error('[ImageGenerationForm] New Prompts Like Existing: Error generating prompts:', error);
      toast.error("Failed to generate prompts. Please try again.");
    } finally {
      setIsGeneratingAutomatedPrompts(false);
    }
  }, [
    prompts,
    styleReferenceImageGeneration,
    generationSource,
    imagesPerPrompt,
    promptMultiplier,
    getTaskParams,
    onGenerate,
    aiGeneratePrompts,
    setPrompts,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('[ImageGenerationForm] handleSubmit called:', {
      effectivePromptMode,
      promptsCount: prompts.length,
      actionablePromptsCount,
      masterPromptText: masterPromptText?.substring(0, 50),
      isGenerating,
      hasApiKey,
      selectedProjectId,
    });

    // Handle automated mode: generate prompts first, then images
    if (effectivePromptMode === 'automated') {
      if (!masterPromptText.trim()) {
        toast.error("Please enter a master prompt.");
        return;
      }

      // Capture current values for the background operation (necessary because async runs in background)
      // Use refs to ensure we always get the latest value (prevents stale closure bugs)
      const currentGenerationSource = generationSourceRef.current;
      const currentTextModel = selectedTextModelRef.current;

      // Validate early before starting background operation
      if (currentGenerationSource === 'by-reference' && !styleReferenceImageGeneration) {
        toast.error("Please upload a style reference image for by-reference mode.");
        return;
      }
      console.log('[GenerationSourceDebug] Automated mode capturing values:', {
        generationSource,
        generationSourceRef: currentGenerationSource,
        selectedTextModel,
        selectedTextModelRef: currentTextModel,
        styleReferenceImageGeneration,
        computedModelName: currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image'
      });
      const capturedMasterPrompt = masterPromptText;
      const capturedImagesPerPrompt = imagesPerPrompt;
      const capturedPromptMultiplier = promptMultiplier;
      const capturedProjectId = selectedProjectId!;
      const capturedAssociatedShotId = associatedShotId;
      const capturedGenerationSource = currentGenerationSource;
      const capturedStyleRef = styleReferenceImageGeneration;
      const capturedStyleStrength = currentStyleStrength;
      const capturedSubjectStrength = currentSubjectStrength;
      const capturedSubjectDescription = effectiveSubjectDescription;
      const capturedInThisScene = currentInThisScene;
      const capturedInThisSceneStrength = currentInThisSceneStrength;
      const capturedReferenceMode = referenceMode;
      const capturedBeforePromptText = currentBeforePromptText;
      const capturedAfterPromptText = currentAfterPromptText;
      const capturedStyleBoostTerms = currentStyleBoostTerms;
      const capturedIsLocalGenerationEnabled = isLocalGenerationEnabled;
      const capturedHiresFixConfig = hiresFixConfig;
      const capturedModelName = currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image';

      // Trigger button state: submitting (1s) → success (2s) → idle
      automatedSubmitButton.trigger();

      // Add incoming task immediately - appears as filler in TasksPane
      const truncatedPrompt = capturedMasterPrompt.length > 50
        ? capturedMasterPrompt.substring(0, 50) + '...'
        : capturedMasterPrompt;
      const currentBaseline = taskStatusCounts?.processing ?? 0;
      const incomingTaskId = addIncomingTask({
        taskType: 'image_generation',
        label: truncatedPrompt,
        expectedCount: capturedImagesPerPrompt * capturedPromptMultiplier,
        baselineCount: currentBaseline,
      });

      console.log('[ImageGenerationForm] Automated mode: Starting background prompt generation for:', truncatedPrompt);

      // Fire-and-forget: run prompt generation and task creation in background
      (async () => {
        try {
          // Generate prompts using AI (this is the slow part - up to 20 seconds)
          const rawResults = await aiGeneratePrompts({
            overallPromptText: capturedMasterPrompt,
            numberToGenerate: capturedImagesPerPrompt,
            includeExistingContext: false,
            addSummaryForNewPrompts: true,
            replaceCurrentPrompts: true,
            temperature: 0.8,
            rulesToRememberText: '',
          });

          console.log('[ImageGenerationForm] Automated mode: Generated', rawResults.length, 'prompts');

          // Convert to PromptEntry format
          const newPrompts: PromptEntry[] = rawResults.map(item => ({
            id: item.id,
            fullPrompt: item.text,
            shortPrompt: item.shortText || item.text.substring(0, 30) + (item.text.length > 30 ? "..." : ""),
          }));

          // Save generated prompts to state (for user to see/edit later)
          setPrompts(newPrompts);

          // Build batch task params using captured values (can't use getTaskParams as it uses current state)
          const referenceParams: ReferenceApiParams = capturedGenerationSource === 'by-reference' ? {
            style_reference_image: capturedStyleRef ?? undefined,
            style_reference_strength: capturedStyleStrength,
            subject_strength: capturedSubjectStrength,
            subject_description: capturedSubjectDescription,
            in_this_scene: capturedInThisScene,
            in_this_scene_strength: capturedInThisSceneStrength,
            reference_mode: capturedReferenceMode,
          } : {};

          const taskParams = buildBatchTaskParams({
            projectId: capturedProjectId,
            prompts: newPrompts,
            imagesPerPrompt: capturedPromptMultiplier,
            shotId: capturedAssociatedShotId,
            beforePromptText: capturedBeforePromptText,
            afterPromptText: capturedAfterPromptText,
            styleBoostTerms: capturedStyleBoostTerms,
            isLocalGenerationEnabled: capturedIsLocalGenerationEnabled,
            hiresFixConfig: capturedHiresFixConfig,
            modelName: capturedModelName,
            referenceParams,
          });

          console.log('[ImageGenerationForm] Automated mode: Queuing', newPrompts.length, 'images');
          await onGenerate(taskParams);

          // Note: We immediately remove the incoming task filler after onGenerate completes.
          // Real tasks will appear via realtime subscriptions. Previously we used waitForTasksInCache
          // to wait for tasks to appear in cache before removing the filler, but this caused
          // both the filler AND real tasks to show simultaneously (duplicate visibility).
        } catch (error) {
          console.error('[ImageGenerationForm] Automated mode: Error generating prompts:', error);
          toast.error("Failed to generate prompts. Please try again.");
        } finally {
          // Wait for task queries to refetch, then do a clean swap
          await queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'] });
          await queryClient.refetchQueries({ queryKey: ['task-status-counts'] });
          const newCount = queryClient.getQueryData<{ processing: number }>(['task-status-counts', selectedProjectId])?.processing ?? 0;
          completeIncomingTask(incomingTaskId, newCount);
        }
      })();

      // Return immediately - don't block the UI
      return;
    }

    // Managed mode: use getTaskParams (includes validation)
    const taskParams = getTaskParams(prompts);
    if (!taskParams) return;

    // Trigger button state: submitting (1s) → success (2s) → idle
    automatedSubmitButton.trigger();

    // Add incoming task immediately - appears as filler in TasksPane
    const firstPrompt = prompts.find(p => p.fullPrompt.trim())?.fullPrompt || 'Generating...';
    const truncatedPrompt = firstPrompt.length > 50
      ? firstPrompt.substring(0, 50) + '...'
      : firstPrompt;
    const managedBaseline = taskStatusCounts?.processing ?? 0;
    const incomingTaskId = addIncomingTask({
      taskType: 'image_generation',
      label: truncatedPrompt,
      expectedCount: actionablePromptsCount * imagesPerPrompt,
      baselineCount: managedBaseline,
    });

    console.log('[ImageGenerationForm] Managed mode: Starting task creation for:', truncatedPrompt);

    // Fire-and-forget: run task creation in background
    (async () => {
      try {
        await onGenerate(taskParams);
      } catch (error) {
        console.error('[ImageGenerationForm] Managed mode: Error creating tasks:', error);
        toast.error("Failed to create tasks. Please try again.");
      } finally {
        // Wait for task queries to refetch, then do a clean swap
        await queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'] });
        await queryClient.refetchQueries({ queryKey: ['task-status-counts'] });
        const newCount = queryClient.getQueryData<{ processing: number }>(['task-status-counts', selectedProjectId])?.processing ?? 0;
        completeIncomingTask(incomingTaskId, newCount);
      }
    })();
  };

  // Handle creating a new shot
  const handleCreateShot = useCallback(async (shotName: string, files: File[]) => {
    // Use unified shot creation - handles inheritance, events, lastAffected automatically
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      dispatchSkeletonEvents: false, // No skeleton needed in form context
      onSuccess: () => {
        // Invalidate and refetch shots to update the list
        queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
        queryClient.refetchQueries({ queryKey: ['shots', selectedProjectId] });
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      return;
    }

    console.log('[ImageGenerationForm] Shot created:', {
      shotId: result.shotId.substring(0, 8),
      shotName: result.shotName,
    });

    // Note: Settings inheritance is handled automatically by useShotCreation
    
    // Switch to the newly created shot
    markAsInteracted();
    setAssociatedShotId(result.shotId);
    setIsCreateShotModalOpen(false);
  }, [createShot, markAsInteracted, queryClient, selectedProjectId]);

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
    markAsInteracted();
    const newShotId = value === "none" ? null : value;

    // usePersistentToolState auto-syncs associatedShotId to DB
    setAssociatedShotId(newShotId);

    // Call the parent callback if provided
    if (onShotChange) {
      onShotChange(newShotId);
    }

    // Note: Prompts for the new shot will be loaded automatically via useAutoSaveSettings
    // and initialized if empty via the initialization effect
    markAsInteracted();
  };

  // Note: Form fields are NOT automatically synced when selecting a reference
  // This allows users to maintain their current settings when switching references

  // Form fields maintain their current values independent of selected reference
  // This allows users to keep their settings when switching references

  return (
    <>
      <form id="image-generation-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex gap-6 flex-col md:flex-row pb-4">
          {/* Left Column - Prompts and Shot Selector */}
          <div className="flex-1 space-y-6">
            <PromptsSection
              prompts={prompts}
              ready={ready}
              lastKnownPromptCount={lastKnownPromptCount}
              isGenerating={automatedSubmitButton.isSubmitting}
              hasApiKey={hasApiKey}
              actionablePromptsCount={actionablePromptsCount}
              activePromptId={directFormActivePromptId}
              onSetActive={setDirectFormActivePromptId}
              onAddPrompt={handleAddPrompt}
              onUpdatePrompt={handleUpdatePrompt}
              onRemovePrompt={handleRemovePrompt}
              onOpenPromptModal={() => setIsPromptModalOpen(true)}
              onOpenMagicPrompt={handleOpenMagicPrompt}
              beforeEachPromptText={currentBeforePromptText}
              afterEachPromptText={currentAfterPromptText}
              onBeforeEachPromptTextChange={(e) => setCurrentBeforePromptText(e.target.value)}
              onAfterEachPromptTextChange={(e) => setCurrentAfterPromptText(e.target.value)}
              onClearBeforeEachPromptText={() => {
                markAsInteracted();
                setCurrentBeforePromptText('');
              }}
              onClearAfterEachPromptText={() => {
                markAsInteracted();
                setCurrentAfterPromptText('');
              }}
              onDeleteAllPrompts={handleDeleteAllPrompts}
              promptMode={effectivePromptMode}
              onPromptModeChange={(mode) => {
                markAsInteracted();
                setEffectivePromptMode(mode);
                // Auto-set imagesPerPrompt based on mode
                if (mode === 'automated') {
                  setImagesPerPrompt(8);
                } else if (mode === 'managed') {
                  setImagesPerPrompt(1);
                }
              }}
              masterPromptText={masterPromptText}
              onMasterPromptTextChange={handleTextChange(setMasterPromptText)}
              onClearMasterPromptText={() => {
                markAsInteracted();
                setMasterPromptText('');
              }}
            />

            <ShotSelector
              shots={shots}
              associatedShotId={associatedShotId}
              isGenerating={automatedSubmitButton.isSubmitting}
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
          
          {/* Right Column - Reference Image and Settings */}
          <ModelSection
            isGenerating={automatedSubmitButton.isSubmitting}
            styleReferenceImage={styleReferenceImageDisplay}
            styleReferenceStrength={styleReferenceStrength}
            subjectStrength={subjectStrength}
            subjectDescription={subjectDescription}
            inThisScene={inThisScene}
            inThisSceneStrength={inThisSceneStrength}
            isUploadingStyleReference={isUploadingStyleReference}
            onStyleUpload={handleStyleReferenceUpload}
            onStyleRemove={handleRemoveStyleReference}
            onStyleStrengthChange={handleStyleStrengthChange}
            onSubjectStrengthChange={handleSubjectStrengthChange}
            onSubjectDescriptionChange={handleSubjectDescriptionChange}
            onSubjectDescriptionFocus={handleSubjectDescriptionFocus}
            onSubjectDescriptionBlur={handleSubjectDescriptionBlur}
            onInThisSceneChange={handleInThisSceneChange}
            onInThisSceneStrengthChange={handleInThisSceneStrengthChange}
            referenceMode={referenceMode}
            onReferenceModeChange={handleReferenceModeChange}
            styleBoostTerms={styleBoostTerms}
            onStyleBoostTermsChange={handleStyleBoostTermsChange}
            // New multiple references props
            references={hydratedReferences}
            selectedReferenceId={displayedReferenceId}
            onSelectReference={handleSelectReference}
            onDeleteReference={handleDeleteReference}
            onUpdateReferenceName={handleUpdateReferenceName}
            onResourceSelect={handleResourceSelect}
            onToggleVisibility={handleToggleVisibility}
            // Loading state - show placeholders while hydrating
            isLoadingReferenceData={isReferenceDataLoading}
            referenceCount={referenceCount}
            // Generation source toggle props (both local and cloud modes)
            generationSource={generationSource}
            onGenerationSourceChange={handleGenerationSourceChange}
            // Just-text mode props
            selectedTextModel={selectedTextModel}
            onTextModelChange={handleTextModelChange}
            selectedLoras={loraManager.selectedLoras}
            onOpenLoraModal={() => loraManager.setIsLoraModalOpen(true)}
            onRemoveLora={handleRemoveLora}
            onUpdateLoraStrength={handleLoraStrengthChange}
          />
        </div>

        {/* Generation Settings (dimensions always, phase config for local only) */}
        <div className="md:col-span-2 mt-2">
          <GenerationSettingsSection
            hiresFixConfig={hiresFixConfig}
            onHiresFixConfigChange={setHiresFixConfig}
            projectResolution={projectResolution}
            projectAspectRatio={projectAspectRatio}
            disabled={automatedSubmitButton.isSubmitting || !hasApiKey}
            isLocalGeneration={isLocalGenerationEnabled}
          />
        </div>

        {/* Spacer to ensure content can scroll above sticky footer (only when not using portal) */}
        {stickyFooter && !footerPortalId && <div className="h-4" />}

        {/* Footer: portaled when footerPortalId provided, sticky when stickyFooter without portal, inline otherwise */}
        {(() => {
          const footerContent = (
            <div className={
              stickyFooter
                ? footerPortalId
                  ? "px-6 py-3 bg-background border-t border-zinc-700" // Portaled footer
                  : "sticky bottom-0 z-50 !mt-0 -mx-6 px-6 py-3 bg-background border-t border-zinc-700" // Sticky footer
                : "border-t border-border pt-6 mt-2" // Inline footer (tool page)
            }>
              <GenerateControls
                imagesPerPrompt={imagesPerPrompt}
                onChangeImagesPerPrompt={handleSliderChange(setImagesPerPrompt)}
                actionablePromptsCount={actionablePromptsCount}
                isGenerating={automatedSubmitButton.isSubmitting}
                hasApiKey={hasApiKey}
                justQueued={automatedSubmitButton.isSuccess}
                promptMode={effectivePromptMode}
                onUseExistingPrompts={handleUseExistingPrompts}
                onNewPromptsLikeExisting={handleNewPromptsLikeExisting}
                promptMultiplier={promptMultiplier}
                onChangePromptMultiplier={setPromptMultiplier}
              />
            </div>
          );

          // Portal footer outside scroll container when footerPortalId is provided
          if (stickyFooter && footerPortalId) {
            const portalTarget = document.getElementById(footerPortalId);
            return portalTarget ? createPortal(footerContent, portalTarget) : footerContent;
          }
          return footerContent;
        })()}
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
          lora_type={generationSource === 'just-text' ? getLoraTypeForModel(selectedTextModel) : BY_REFERENCE_LORA_TYPE}
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
            onClose={() => {
              setIsPromptModalOpen(false);
              setOpenPromptModalWithAIExpanded(false);
            }}
            prompts={prompts}
            onSave={handleSavePromptsFromModal}
            generatePromptId={generatePromptId}
            apiKey={openaiApiKey}
            openWithAIExpanded={openPromptModalWithAIExpanded}
            onGenerateAndQueue={handleGenerateAndQueue}
          />
        </DynamicImportErrorBoundary>
      </Suspense>

      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleCreateShot}
        isLoading={isCreatingShot}
        projectId={selectedProjectId}
      />
    </>
  );
});

ImageGenerationForm.displayName = 'ImageGenerationForm';

// Re-export components that are used elsewhere
export { PromptInputRow } from "./components/PromptInputRow";
export type { PromptInputRowProps, PromptEntry } from "./types";

export default ImageGenerationForm;