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
import { useUserUIState } from "@/shared/hooks/useUserUIState";
import { ImageGenerationSettings } from "../../settings";
import { VideoTravelSettings } from "@/tools/travel-between-images/settings";
import { useListPublicResources, useCreateResource, useUpdateResource, useDeleteResource, StyleReferenceMetadata, Resource } from '@/shared/hooks/useResources';
import { useListShots, useCreateShot } from "@/shared/hooks/useShots";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useQueryClient } from '@tanstack/react-query';
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { BatchImageGenerationTaskParams } from "@/shared/lib/tasks/imageGeneration";
import { processStyleReferenceForAspectRatioString } from "@/shared/lib/styleReferenceProcessor";
import { resolveProjectResolution } from "@/shared/lib/taskCreation";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
import { generateClientThumbnail } from "@/shared/lib/clientThumbnailGenerator";
import { nanoid } from 'nanoid';
import { supabase } from "@/integrations/supabase/client";
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { useHydratedReferences } from '../../hooks/useHydratedReferences';

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
  ReferenceImage,
  HydratedReferenceImage,
  ReferenceMode,
  PromptMode,
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
  /**
   * Called when the associated shot selection changes in the form
   */
  onShotChange?: (shotId: string | null) => void;
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
  onShotChange,
}, ref) => {
  
  // Debug logging for callback prop
  console.log('[ShotChangeDebug] 🏗️ ImageGenerationForm rendered with onShotChange:', {
    hasCallback: !!onShotChange,
    callbackType: typeof onShotChange,
    timestamp: Date.now()
  });
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
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [openPromptModalWithAIExpanded, setOpenPromptModalWithAIExpanded] = useState(false);
  const [imagesPerPrompt, setImagesPerPrompt] = useState(8); // Default to 8 for automated mode
  const [steps, setSteps] = useState(12); // Default to 12 steps for local generation
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
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('custom');
  const [styleBoostTerms, setStyleBoostTerms] = useState<string>('');
  const pendingReferenceModeUpdate = useRef<ReferenceMode | null>(null);
  const [isUploadingStyleReference, setIsUploadingStyleReference] = useState<boolean>(false);
  // Optimistic local override for style reference image so UI updates immediately
  // undefined => no override, use settings; string|null => explicit override
  const [styleReferenceOverride, setStyleReferenceOverride] = useState<string | null | undefined>(undefined);
  // Associated shot for image generation
  const [associatedShotId, setAssociatedShotId] = useState<string | null>(null);
  
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();
  
  // Access user's generation settings to detect local generation
  const {
    value: generationMethods,
    isLoading: isLoadingGenerationMethods
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
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
  
  // Debug log to track when projectImageSettings changes
  useEffect(() => {
    console.log('[AddToRefDebug:Form] 📦 projectImageSettings updated', {
      hasSettings: !!projectImageSettings,
      referencesCount: projectImageSettings?.references?.length,
      selectedReferenceIdByShot: projectImageSettings?.selectedReferenceIdByShot,
      isLoading: isLoadingProjectSettings,
      timestamp: Date.now()
    });
  }, [projectImageSettings, isLoadingProjectSettings]);
  
  // Local optimistic override for model to avoid UI stutter while saving
  const [modelOverride, setModelOverride] = useState<GenerationMode | undefined>(undefined);

  // Always use qwen-image model (model selector removed)
  const selectedModel = 'qwen-image';
  
  // Get the effective shot ID for storage (use 'none' for null)
  const effectiveShotId = associatedShotId || 'none';
  
  // Get reference pointers array and selected reference for current shot
  const cachedProjectSettings = selectedProjectId
    ? queryClient.getQueryData<ProjectImageSettings>(['toolSettings', 'project-image-settings', selectedProjectId, undefined])
    : undefined;
  const referenceCountFromCache = cachedProjectSettings?.references?.length ?? 0;
  
  // Track the highest reference count we've seen - once we know we have N references, never drop below that
  const lastKnownReferenceCount = useRef<number>(0);
  const currentCount = projectImageSettings?.references?.length ?? referenceCountFromCache;
  if (currentCount > lastKnownReferenceCount.current) {
    lastKnownReferenceCount.current = currentCount;
  }
  const referenceCount = Math.max(currentCount, lastKnownReferenceCount.current);
  
  const referencePointers = projectImageSettings?.references ?? cachedProjectSettings?.references ?? [];
  const selectedReferenceIdByShot = projectImageSettings?.selectedReferenceIdByShot ?? {};
  const selectedReferenceId = selectedReferenceIdByShot[effectiveShotId] ?? null;
  
  // Debug log for reference selection tracking
  useEffect(() => {
    console.log('[AddToRefDebug:Form] 📋 Reference selection state', {
      effectiveShotId,
      selectedReferenceId,
      selectedReferenceIdByShot,
      referencePointersCount: referencePointers.length,
      hasProjectImageSettings: !!projectImageSettings,
      timestamp: Date.now()
    });
  }, [effectiveShotId, selectedReferenceId, selectedReferenceIdByShot, referencePointers.length, projectImageSettings]);
  
  // Hydrate references with data from resources table
  const { hydratedReferences, isLoading: isLoadingReferences, hasLegacyReferences } = useHydratedReferences(referencePointers);
  
  // Keep a stable reference to prevent flickering during refetches
  // Only update when we have a valid new selectedReference
  const lastValidSelectedReference = useRef<HydratedReferenceImage | null>(null);
  const currentSelectedReference = hydratedReferences.find(ref => ref.id === selectedReferenceId) || null;
  
  if (currentSelectedReference) {
    lastValidSelectedReference.current = currentSelectedReference;
  }
  
  // Use the current reference if available, otherwise fall back to last valid one
  // This prevents the UI from showing "nothing" during refetches
  const selectedReference = currentSelectedReference || lastValidSelectedReference.current;
  
  // Debug log for final selected reference
  useEffect(() => {
    console.log('[AddToRefDebug:Form] 🎯 Final selected reference determined', {
      selectedReferenceId,
      currentSelectedReference: currentSelectedReference ? { id: currentSelectedReference.id, name: currentSelectedReference.name, resourceId: currentSelectedReference.resourceId } : null,
      selectedReference: selectedReference ? { id: selectedReference.id, name: selectedReference.name, resourceId: selectedReference.resourceId } : null,
      hydratedReferencesCount: hydratedReferences.length,
      hydratedReferenceIds: hydratedReferences.map(r => r.id),
      timestamp: Date.now()
    });
  }, [selectedReferenceId, currentSelectedReference, selectedReference, hydratedReferences]);
  
  // Show loading state only if we don't have enough references hydrated yet
  // This prevents flickering when background queries (like isLoadingReferences) run but we already have data
  const hasEnoughReferences = referenceCount > 0 && hydratedReferences.length >= Math.floor(referenceCount * 0.9);
  const isReferenceDataLoading = (isLoadingProjectSettings || isLoadingReferences) && !hasEnoughReferences;
  
  // Debug logging for reference loading state
  useEffect(() => {
    const threshold = Math.floor(referenceCount * 0.9);
    console.log('[RefLoadingDebug] 📊 Reference loading state:', {
      isLoadingProjectSettings,
      referenceCount,
      hydratedReferencesLength: hydratedReferences.length,
      referencePointersLength: referencePointers.length,
      isLoadingReferences,
      threshold,
      needsMoreRefs: hydratedReferences.length < threshold,
      isReferenceDataLoading,
      calculationBreakdown: {
        condition1_loadingSettings: isLoadingProjectSettings,
        condition2_loadingReferences: isLoadingReferences,
        condition3_notEnoughHydrated: !hasEnoughReferences,
        finalResult: (isLoadingProjectSettings || isLoadingReferences) && !hasEnoughReferences
      },
      cachedReferenceCount: referenceCountFromCache,
      hasCachedSettings: !!cachedProjectSettings,
      hasProjectSettings: !!projectImageSettings,
      timestamp: Date.now()
    });
  }, [isLoadingProjectSettings, referenceCount, hydratedReferences.length, referencePointers.length, isReferenceDataLoading, isLoadingReferences, referenceCountFromCache, cachedProjectSettings, projectImageSettings]);
  
  // Resource mutation hooks
  const createStyleReference = useCreateResource();
  const updateStyleReference = useUpdateResource();
  const deleteStyleReference = useDeleteResource();
  
  // Clear pending mode update when switching references
  const prevSelectedReferenceId = useRef(selectedReferenceId);
  useEffect(() => {
    const hasChanged = prevSelectedReferenceId.current !== selectedReferenceId;
    const prevId = prevSelectedReferenceId.current;
    
    if (hasChanged) {
      console.log('[RefSettings] 🔄 Reference changed from', prevId, 'to', selectedReferenceId);
      console.log('[RefSettings] 🔄 Clearing pending mode update');
      pendingReferenceModeUpdate.current = null;
      
      prevSelectedReferenceId.current = selectedReferenceId;
    }
  }, [selectedReferenceId, hydratedReferences]);
  
  // Debug logging for reference state
  useEffect(() => {
    console.log('[RefSettings] 📊 Current state:', {
      effectiveShotId,
      referencesCount: hydratedReferences.length,
      selectedReferenceId,
      hasSelectedReference: !!selectedReference,
      selectedReferenceName: selectedReference?.name,
      selectedReferenceStrength: selectedReference?.styleReferenceStrength,
      selectedSubjectStrength: selectedReference?.subjectStrength,
      selectedReferenceMode: selectedReference?.referenceMode,
      allReferenceIds: hydratedReferences.map(r => r.id),
      allReferenceModes: hydratedReferences.map(r => ({ id: r.id, name: r.name, mode: r.referenceMode })),
      allShotSelections: selectedReferenceIdByShot
    });
  }, [effectiveShotId, hydratedReferences, selectedReferenceId, selectedReference, selectedReferenceIdByShot]);
  
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
  const currentReferenceMode = (selectedReference?.referenceMode ?? 'custom') as ReferenceMode;
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

  // Auto-select first reference if we have references but no valid selected reference for this shot
  useEffect(() => {
    if (hydratedReferences.length > 0 && projectImageSettings) {
      // Case 1: No selectedReferenceId for this shot
      if (!selectedReferenceId) {
        console.log('[RefSettings] 🔄 Auto-selecting first reference for shot', effectiveShotId, '(no ID set)');
        updateProjectImageSettings('project', {
          selectedReferenceIdByShot: {
            ...selectedReferenceIdByShot,
            [effectiveShotId]: hydratedReferences[0].id
          }
        });
      }
      // Case 2: selectedReferenceId exists but doesn't match any reference (stale/corrupted)
      else if (!selectedReference) {
        console.log('[RefSettings] 🔄 Auto-selecting first reference for shot', effectiveShotId, '(stale ID)');
        updateProjectImageSettings('project', {
          selectedReferenceIdByShot: {
            ...selectedReferenceIdByShot,
            [effectiveShotId]: hydratedReferences[0].id
          }
        });
      }
    }
  }, [effectiveShotId, hydratedReferences, selectedReferenceId, selectedReference, selectedReferenceIdByShot, projectImageSettings, updateProjectImageSettings]);

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
      setReferenceMode(selectedReference.referenceMode || 'custom');
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
            is_public: false,
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
  const [masterPromptText, setMasterPromptText] = useState("");
  const [isGeneratingAutomatedPrompts, setIsGeneratingAutomatedPrompts] = useState(false);

  // Removed unused currentShotId that was causing unnecessary re-renders
  const { data: shots } = useListShots(selectedProjectId);
  const createShotMutation = useCreateShot();
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
  const availableLoras: LoraModel[] = (Array.isArray(publicLorasData) ? publicLorasData.map(resource => resource.metadata) : []) || [];

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
      promptMode: [promptMode, setPromptMode],
      masterPromptText: [masterPromptText, setMasterPromptText],
    }
    // Remove enabled: !!selectedProjectId - let persistence work even without project to preserve state
  );
  
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
        
        // Upload thumbnail to storage
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const thumbnailFilename = `thumb_${timestamp}_${randomString}.jpg`;
        const thumbnailPath = `files/thumbnails/${thumbnailFilename}`;
        
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabase.storage
          .from('image_uploads')
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
            .from('image_uploads')
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
        is_public: false, // Always private for user uploads
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
      
      // Create lightweight pointer
      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
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
        queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) => {
          const next = { 
            ...(prev || {}), 
            references: [...referencePointers, newPointer],
            selectedReferenceIdByShot: {
              ...selectedReferenceIdByShot,
              [effectiveShotId]: newPointer.id
            }
          };
          console.log('[RefSettings] ⚡ Applied optimistic cache update for new reference', { next });
          return next;
        });
      } catch (e) {
        console.warn('[RefSettings] Failed to set optimistic cache data', e);
      }
      
      // Add the new pointer and select it for the current shot
      await updateProjectImageSettings('project', {
        references: [...referencePointers, newPointer],
        selectedReferenceIdByShot: {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: newPointer.id
        }
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
  }, [effectiveShotId, selectedReferenceIdByShot, updateProjectImageSettings, markAsInteracted, selectedProjectId, hydratedReferences, queryClient, createStyleReference, referencePointers]);

  // Handle selecting an existing resource from the browser (no upload needed)
  const handleResourceSelect = useCallback(async (resource: Resource) => {
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
          queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) => {
            return { 
              ...(prev || {}), 
              selectedReferenceIdByShot: optimisticUpdate
            };
          });
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
      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
        subjectDescription: '',
        styleBoostTerms: '',
        referenceMode: referenceMode,
        // Set strength values based on mode (same logic as handleReferenceModeChange)
        ...(referenceMode === 'style' && {
          styleReferenceStrength: 1.1,
          subjectStrength: 0,
          inThisScene: false,
          inThisSceneStrength: 0,
        }),
        ...(referenceMode === 'subject' && {
          styleReferenceStrength: 1.1,
          subjectStrength: 0.4,
          inThisScene: false,
          inThisSceneStrength: 0,
        }),
        ...(referenceMode === 'scene' && {
          styleReferenceStrength: 1.1,
          subjectStrength: 0,
          inThisScene: true,
          inThisSceneStrength: 0.4,
        }),
        ...(referenceMode === 'custom' && {
          styleReferenceStrength: styleReferenceStrength,
          subjectStrength: subjectStrength,
          inThisScene: inThisScene,
          inThisSceneStrength: inThisSceneStrength,
        }),
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
        queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) => {
          const currentReferences = prev?.references || [];
          const currentSelections = prev?.selectedReferenceIdByShot || {};
          
          const updatedReferences = [...currentReferences, newPointer];
          const updatedSelections = {
            ...currentSelections,
            [effectiveShotId]: newPointer.id
          };
          
          console.log('[RefBrowser] ⚡ Applied optimistic cache update for resource link', { 
            prevReferencesLength: currentReferences.length,
            nextReferencesLength: updatedReferences.length,
            previouslySelectedForShot: currentSelections[effectiveShotId],
            nowSelectedForShot: newPointer.id
          });
          
          return { 
            ...(prev || {}), 
            references: updatedReferences,
            selectedReferenceIdByShot: updatedSelections
          };
        });
      } catch (e) {
        console.error('[RefBrowser] ❌ Failed to set optimistic cache data:', e);
      }
      
      // Get current values for persistence using functional pattern
      const currentData = queryClient.getQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined]) as any;
      
      console.log('[RefBrowser] 💾 Persisting to database...');
      await updateProjectImageSettings('project', {
        references: currentData?.references || [],
        selectedReferenceIdByShot: currentData?.selectedReferenceIdByShot || {}
      });
      
      console.log('[RefBrowser] ✅ Successfully linked existing resource and persisted to DB');
      markAsInteracted();
    } catch (error) {
      console.error('[RefBrowser] ❌ Failed to link resource:', error);
      toast.error('Failed to add reference');
    }
  }, [effectiveShotId, updateProjectImageSettings, queryClient, selectedProjectId, markAsInteracted, referencePointers, selectedReferenceIdByShot, referenceMode, styleReferenceStrength, subjectStrength, inThisScene, inThisSceneStrength]);

  // Handle selecting a reference for the current shot
  const handleSelectReference = useCallback(async (referenceId: string) => {
    console.log('[RefSettings] 🔀 Selecting reference for shot', effectiveShotId, ':', referenceId);
    
    // Optimistic UI update
    const optimisticUpdate = {
      ...selectedReferenceIdByShot,
      [effectiveShotId]: referenceId
    };
    
    try {
      queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) => {
        const next = { 
          ...(prev || {}), 
          selectedReferenceIdByShot: optimisticUpdate
        };
        console.log('[RefSettings] ⚡ Applied optimistic cache update for reference selection', { next });
        return next;
      });
    } catch (e) {
      console.warn('[RefSettings] Failed to set optimistic cache data', e);
    }
    
    // Persist to database (debounced)
    await updateProjectImageSettings('project', {
      selectedReferenceIdByShot: optimisticUpdate
    });
    markAsInteracted();
  }, [effectiveShotId, selectedReferenceIdByShot, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId]);
  
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
      queryClient.setQueryData(['toolSettings', 'project-image-settings', selectedProjectId, undefined], (prev: any) => {
        const next = { 
          ...(prev || {}), 
          references: filteredPointers,
          selectedReferenceIdByShot: updatedSelections
        };
        console.log('[RefSettings] ⚡ Applied optimistic cache update for reference deletion', { next });
        return next;
      });
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
    
    // Build update object with mode AND auto-set strength values
    const updates: Partial<ReferenceImage> = {
      referenceMode: mode
    };
    
    // Auto-set strength values based on mode (same logic as RadioGroup)
    if (mode === 'style') {
      updates.styleReferenceStrength = 1.1;
      updates.subjectStrength = 0;
      updates.inThisScene = false;
      updates.inThisSceneStrength = 0;
    } else if (mode === 'subject') {
      updates.styleReferenceStrength = 1.1;
      updates.subjectStrength = 0.4;
      updates.inThisScene = false;
      updates.inThisSceneStrength = 0;
    } else if (mode === 'scene') {
      updates.styleReferenceStrength = 1.1;
      updates.subjectStrength = 0;
      updates.inThisScene = true;
      updates.inThisSceneStrength = 0.4;
    } else if (mode === 'custom') {
      // Ensure we have valid starting values if coming from a mode with low strength (like scene)
      const currentTotal = styleReferenceStrength + subjectStrength;
      if (currentTotal < 0.5) {
        console.log('[RefModeDebug] ⚠️ Custom mode selected but strengths are too low. Resetting to defaults.');
        updates.styleReferenceStrength = 0.8;
        updates.subjectStrength = 0.8;
        updates.inThisScene = false;
        updates.inThisSceneStrength = 0;
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
    
    // Single batched update to avoid race conditions
    console.log('[RefModeDebug] Calling handleUpdateReference with:', { referenceId: selectedReferenceId, updates });
    await handleUpdateReference(selectedReferenceId, updates);
  }, [selectedReferenceId, handleUpdateReference, styleReferenceStrength, subjectStrength]);

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
  
  const handleGenerateAndQueue = useCallback((updatedPrompts: PromptEntry[]) => {
    console.log('[ImageGenerationForm] Generate & Queue: Received', updatedPrompts.length, 'prompts, saving and queuing');
    
    // Save the prompts to state for future use
    handleSavePromptsFromModal(updatedPrompts);
    
    // Close the modal
    setIsPromptModalOpen(false);
    setOpenPromptModalWithAIExpanded(false);
    
    // Generate immediately with the updated prompts (don't wait for state)
    // This ensures we use the exact prompts the user just created
    const activePrompts = updatedPrompts.filter(p => p.fullPrompt.trim() !== "");
    
    if (activePrompts.length === 0) {
      console.warn("[ImageGenerationForm] Generate & Queue: No active prompts. Generation aborted.");
      toast.error("Please enter at least one valid prompt.");
      return;
    }

    // Validate model-specific requirements
    if (selectedModel === 'qwen-image' && !styleReferenceImageGeneration) {
      toast.error("Please upload a style reference image for Qwen.Image model.");
      return;
    }

    // Map selected LoRAs (disabled for qwen-image)
    const lorasForApi: any[] = [];

    // Debug: Log what style reference we're about to send
    if (styleReferenceImageGeneration) {
      console.log('[ImageGenerationForm] Generate & Queue - Style reference being sent to task:', {
        isUrl: styleReferenceImageGeneration.startsWith('http'),
        isBase64: styleReferenceImageGeneration.startsWith('data:'),
        length: styleReferenceImageGeneration.length,
        preview: styleReferenceImageGeneration.substring(0, 100) + '...'
      });
    }
    
    // Build the unified task creation parameters
    // Append styleBoostTerms to afterEachPromptText if present
    const effectiveAfterEachPromptText = currentStyleBoostTerms.trim() 
      ? `${afterEachPromptText}${afterEachPromptText.trim() ? ', ' : ''}${currentStyleBoostTerms.trim()}`
      : afterEachPromptText;
    
    const batchTaskParams: BatchImageGenerationTaskParams = {
      project_id: selectedProjectId!,
      prompts: activePrompts.map(p => {
        const combinedFull = `${beforeEachPromptText ? `${beforeEachPromptText.trim()}, ` : ''}${p.fullPrompt.trim()}${effectiveAfterEachPromptText ? `, ${effectiveAfterEachPromptText.trim()}` : ''}`.trim();
        return {
          id: p.id,
          fullPrompt: combinedFull,
          shortPrompt: p.shortPrompt || (combinedFull.substring(0, 30) + (combinedFull.length > 30 ? "..." : ""))
        };
      }), 
      imagesPerPrompt, 
      loras: lorasForApi,
      shot_id: associatedShotId || undefined,
      model_name: 'qwen-image',
      steps: isLocalGenerationEnabled ? steps : undefined,
      ...(styleReferenceImageGeneration && {
        style_reference_image: styleReferenceImageGeneration,
        style_reference_strength: currentStyleStrength,
        subject_reference_image: styleReferenceImageGeneration,
        subject_strength: currentSubjectStrength,
        subject_description: effectiveSubjectDescription,
        in_this_scene: currentInThisScene,
        in_this_scene_strength: currentInThisSceneStrength,
        reference_mode: referenceMode // Pass reference mode to filter settings properly
      }),
    };

    console.log('[ImageGenerationForm] Generate & Queue: Calling onGenerate with', activePrompts.length, 'prompts');

    // Legacy data structure for backward compatibility
    const legacyGenerationData = {
      prompts: batchTaskParams.prompts,
      imagesPerPrompt, 
      loras: lorasForApi, 
      fullSelectedLoras: loraManager.selectedLoras,
      generationMode: selectedModel,
      associatedShotId,
      styleReferenceImage: selectedModel === 'qwen-image' ? styleReferenceImageGeneration : null,
      styleReferenceStrength: selectedModel === 'qwen-image' ? currentStyleStrength : undefined,
      subjectStrength: selectedModel === 'qwen-image' ? currentSubjectStrength : undefined,
      subjectDescription: selectedModel === 'qwen-image' ? effectiveSubjectDescription : undefined,
      selectedModel,
      batchTaskParams
    };
    
    onGenerate(legacyGenerationData);
  }, [
    handleSavePromptsFromModal, 
    selectedModel, 
    styleReferenceImageGeneration,
    selectedProjectId,
    beforeEachPromptText,
    afterEachPromptText,
    imagesPerPrompt,
    associatedShotId,
    isLocalGenerationEnabled,
    steps,
    currentStyleStrength,
    currentSubjectStrength,
    effectiveSubjectDescription,
    currentInThisScene,
    loraManager.selectedLoras,
    onGenerate
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Handle automated mode: generate prompts first, then images
    if (promptMode === 'automated') {
      if (!masterPromptText.trim()) {
        toast.error("Please enter a master prompt.");
        return;
      }
      
      if (!styleReferenceImageGeneration) {
        toast.error("Please upload a style reference image for Qwen.Image model.");
        return;
      }
      
      try {
        setIsGeneratingAutomatedPrompts(true);
        
        console.log('[ImageGenerationForm] Automated mode: Generating prompts from master prompt:', masterPromptText);
        
        // Generate prompts using AI
        const rawResults = await aiGeneratePrompts({
          overallPromptText: masterPromptText,
          numberToGenerate: imagesPerPrompt, // Slider value = number of prompts
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
        
        // Save generated prompts to state
        setPrompts(newPrompts);
        
        // Now generate images with these prompts (1 image per prompt)
        const lorasForApi: any[] = [];
        
        // Append styleBoostTerms to afterEachPromptText if present
        const effectiveAfterEachPromptText = currentStyleBoostTerms.trim() 
          ? `${afterEachPromptText}${afterEachPromptText.trim() ? ', ' : ''}${currentStyleBoostTerms.trim()}`
          : afterEachPromptText;
        
        const batchTaskParams: BatchImageGenerationTaskParams = {
          project_id: selectedProjectId!,
          prompts: newPrompts.map(p => {
            const combinedFull = `${beforeEachPromptText ? `${beforeEachPromptText.trim()}, ` : ''}${p.fullPrompt.trim()}${effectiveAfterEachPromptText ? `, ${effectiveAfterEachPromptText.trim()}` : ''}`.trim();
            return {
              id: p.id,
              fullPrompt: combinedFull,
              shortPrompt: p.shortPrompt || (combinedFull.substring(0, 30) + (combinedFull.length > 30 ? "..." : ""))
            };
          }), 
          imagesPerPrompt: 1, // Always 1 image per prompt in automated mode
          loras: lorasForApi,
          shot_id: associatedShotId || undefined,
          model_name: 'qwen-image',
          steps: isLocalGenerationEnabled ? steps : undefined,
          style_reference_image: styleReferenceImageGeneration,
          style_reference_strength: currentStyleStrength,
          subject_reference_image: styleReferenceImageGeneration,
          subject_strength: currentSubjectStrength,
          subject_description: effectiveSubjectDescription,
          in_this_scene: currentInThisScene,
          in_this_scene_strength: currentInThisSceneStrength,
          reference_mode: referenceMode // Pass reference mode to filter settings properly
        };
        
        const legacyGenerationData = {
          prompts: batchTaskParams.prompts,
          imagesPerPrompt: 1,
          loras: lorasForApi,
          fullSelectedLoras: loraManager.selectedLoras,
          generationMode: selectedModel,
          associatedShotId,
          styleReferenceImage: styleReferenceImageGeneration,
          styleReferenceStrength: currentStyleStrength,
          subjectStrength: currentSubjectStrength,
          subjectDescription: effectiveSubjectDescription,
          selectedModel,
          batchTaskParams
        };
        
        console.log('[ImageGenerationForm] Automated mode: Queuing', newPrompts.length, 'images (1 per prompt)');
        onGenerate(legacyGenerationData);
        
        return;
      } catch (error) {
        console.error('[ImageGenerationForm] Automated mode: Error generating prompts:', error);
        toast.error("Failed to generate prompts. Please try again.");
        return;
      } finally {
        setIsGeneratingAutomatedPrompts(false);
      }
    }
    
    // Managed mode: use existing prompts
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
    // NOTE: Disabled since we're now always using qwen-image model (which doesn't support LoRAs)
    const lorasForApi: any[] = [];

    // Debug: Log what style reference we're about to send
    if (styleReferenceImageGeneration) {
      console.log('[ImageGenerationForm] Style reference being sent to task:', {
        isUrl: styleReferenceImageGeneration.startsWith('http'),
        isBase64: styleReferenceImageGeneration.startsWith('data:'),
        length: styleReferenceImageGeneration.length,
        preview: styleReferenceImageGeneration.substring(0, 100) + '...'
      });
    }
    
    // Build the unified task creation parameters
    // Append styleBoostTerms to afterEachPromptText if present
    const effectiveAfterEachPromptText = currentStyleBoostTerms.trim() 
      ? `${afterEachPromptText}${afterEachPromptText.trim() ? ', ' : ''}${currentStyleBoostTerms.trim()}`
      : afterEachPromptText;
    
    const batchTaskParams: BatchImageGenerationTaskParams = {
      project_id: selectedProjectId!, // We know it's not null due to validation
      prompts: activePrompts.map(p => {
        const combinedFull = `${beforeEachPromptText ? `${beforeEachPromptText.trim()}, ` : ''}${p.fullPrompt.trim()}${effectiveAfterEachPromptText ? `, ${effectiveAfterEachPromptText.trim()}` : ''}`.trim();
        return {
          id: p.id,
          fullPrompt: combinedFull,
          shortPrompt: p.shortPrompt || (combinedFull.substring(0, 30) + (combinedFull.length > 30 ? "..." : ""))
        };
      }), 
      imagesPerPrompt, 
      loras: lorasForApi,
      shot_id: associatedShotId || undefined, // Convert null to undefined for the helper
      model_name: 'qwen-image', // Always qwen-image now
      // Set steps: user-selected value for local generation (including Qwen), or undefined for cloud defaults
      steps: isLocalGenerationEnabled ? steps : undefined,
      // Add style reference for Qwen.Image
      ...(styleReferenceImageGeneration && {
        style_reference_image: styleReferenceImageGeneration,
        style_reference_strength: currentStyleStrength,
        subject_reference_image: styleReferenceImageGeneration, // Same image for now
        subject_strength: currentSubjectStrength,
        subject_description: effectiveSubjectDescription,
        in_this_scene: currentInThisScene,
        in_this_scene_strength: currentInThisSceneStrength,
        reference_mode: referenceMode // Pass reference mode to filter settings properly
      }),
      // resolution will be resolved by the helper
    };

    // Debug logging to verify steps parameter flow
    console.log('[StepsDebug] Form submission debug:', {
      selectedModel,
      isLocalGenerationEnabled,
      userSelectedSteps: steps,
      finalStepsInBatchParams: batchTaskParams.steps,
      logic: isLocalGenerationEnabled ? 'Using user-selected steps for local generation' : 'Using backend defaults for cloud generation',
      timestamp: Date.now()
    });

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
      subjectStrength: selectedModel === 'qwen-image' ? currentSubjectStrength : undefined,
      subjectDescription: selectedModel === 'qwen-image' ? effectiveSubjectDescription : undefined,
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
      
      // Apply settings inheritance logic for travel tool
      if (result.shot.id) {
        // Find latest shot to inherit from
        let settingsSource: any = null;
        if (shots && shots.length > 0) {
           const sortedShots = [...shots].sort((a: any, b: any) => {
             const dateA = new Date(a.created_at || 0).getTime();
             const dateB = new Date(b.created_at || 0).getTime();
             return dateB - dateA;
           });
           // Filter out the just-created shot if it's already in the list (though we just invalidated, refetch might be async)
           const potentialSourceShots = sortedShots.filter(s => s.id !== result.shot.id);
           const latestShot = potentialSourceShots[0];
           
           if (latestShot && (latestShot as any).settings?.['travel-between-images']) {
             settingsSource = (latestShot as any).settings['travel-between-images'];
             console.log('[ImageGenerationForm] Inheriting travel settings from latest shot:', latestShot.name);
           }
        }
        
        // Fallback to project settings
        settingsSource = settingsSource || travelProjectSettings;
        
        if (settingsSource || travelProjectUISettings) {
           const defaultsToApply = {
             ...(settingsSource || {}),
             _uiSettings: travelProjectUISettings || {}
           };
           sessionStorage.setItem(`apply-project-defaults-${result.shot.id}`, JSON.stringify(defaultsToApply));
        }
      }
      
      // Switch to the newly created shot
      markAsInteracted();
      setAssociatedShotId(result.shot.id);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error("Failed to create shot");
    }
  }, [selectedProjectId, createShotMutation, markAsInteracted, queryClient, shots, travelProjectSettings, travelProjectUISettings]);

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
    console.log('[ShotChangeDebug] 🔄 handleShotChange called:', {
      fromShotId: associatedShotId,
      toValue: value,
      hasOnShotChangeCallback: !!onShotChange,
      timestamp: Date.now()
    });
    
    markAsInteracted();
    const newShotId = value === "none" ? null : value;
    
    console.log('[ShotChangeDebug] 📝 Setting new shot ID:', {
      newShotId,
      previousShotId: associatedShotId,
      valueWasNone: value === "none"
    });
    
    setAssociatedShotId(newShotId);
    
    // Call the parent callback if provided
    if (onShotChange) {
      console.log('[ShotChangeDebug] 📞 Calling parent onShotChange callback with:', newShotId);
      onShotChange(newShotId);
      console.log('[ShotChangeDebug] ✅ Parent callback called successfully');
    } else {
      console.log('[ShotChangeDebug] ❌ No onShotChange callback provided');
    }
    
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

  // Note: Form fields are NOT automatically synced when selecting a reference
  // This allows users to maintain their current settings when switching references

  // Form fields maintain their current values independent of selected reference
  // This allows users to keep their settings when switching references

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex gap-6 flex-col md:flex-row">
          {/* Left Column - Prompts and Shot Selector */}
          <div className="flex-1 space-y-6">
            <PromptsSection
              prompts={prompts}
              ready={ready}
              lastKnownPromptCount={lastKnownPromptCount}
              isGenerating={isGenerating || isGeneratingAutomatedPrompts}
              hasApiKey={hasApiKey}
              actionablePromptsCount={actionablePromptsCount}
              activePromptId={directFormActivePromptId}
              onSetActive={setDirectFormActivePromptId}
              onAddPrompt={handleAddPrompt}
              onUpdatePrompt={handleUpdatePrompt}
              onRemovePrompt={handleRemovePrompt}
              onOpenPromptModal={() => setIsPromptModalOpen(true)}
              onOpenMagicPrompt={handleOpenMagicPrompt}
              beforeEachPromptText={beforeEachPromptText}
              afterEachPromptText={afterEachPromptText}
              onBeforeEachPromptTextChange={handleTextChange(setBeforeEachPromptText)}
              onAfterEachPromptTextChange={handleTextChange(setAfterEachPromptText)}
              onClearBeforeEachPromptText={() => {
                markAsInteracted();
                setBeforeEachPromptText('');
              }}
              onClearAfterEachPromptText={() => {
                markAsInteracted();
                setAfterEachPromptText('');
              }}
              onDeleteAllPrompts={handleDeleteAllPrompts}
              promptMode={promptMode}
              onPromptModeChange={(mode) => {
                markAsInteracted();
                setPromptMode(mode);
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
          
          {/* Right Column - Reference Image and Settings */}
          <ModelSection
            isGenerating={isGenerating}
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
            selectedReferenceId={selectedReferenceId}
            onSelectReference={handleSelectReference}
            onDeleteReference={handleDeleteReference}
            onUpdateReferenceName={handleUpdateReferenceName}
            onResourceSelect={handleResourceSelect}
            // Loading state - show placeholders while hydrating
            isLoadingReferenceData={isReferenceDataLoading}
            referenceCount={referenceCount}
          />
        </div>

        <GenerateControls
          imagesPerPrompt={imagesPerPrompt}
          onChangeImagesPerPrompt={handleSliderChange(setImagesPerPrompt)}
          actionablePromptsCount={actionablePromptsCount}
          isGenerating={isGenerating || isGeneratingAutomatedPrompts}
          hasApiKey={hasApiKey}
          justQueued={justQueued}
          steps={steps}
          onChangeSteps={setSteps}
          showStepsDropdown={isLocalGenerationEnabled}
          promptMode={promptMode}
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
        isLoading={createShotMutation.isPending}
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