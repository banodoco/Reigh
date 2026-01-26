import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

import ImageGenerationForm, { PromptEntry } from "../components/ImageGenerationForm";
import { ImageGenerationFormHandles } from "../components/ImageGenerationForm/types";
import { createBatchImageGenerationTasks, BatchImageGenerationTaskParams } from "@/shared/lib/tasks/imageGeneration";
import { ImageGallery, GeneratedImageWithMetadata, DisplayableMetadata, MetadataLora } from "@/shared/components/ImageGallery";
import { useContainerDimensions } from "@/shared/components/ImageGallery/hooks";
import { getLayoutForAspectRatio } from "@/shared/components/ImageGallery/utils";
import SettingsModal from "@/shared/components/SettingsModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from '@/shared/lib/invokeWithTimeout';
import { Button } from "@/shared/components/ui/button";
import { useAddImageToShot, useAddImageToShotWithoutPosition, usePositionExistingGenerationInShot } from "@/shared/hooks/useShots";
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useProject } from "@/shared/contexts/ProjectContext";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { nanoid } from 'nanoid';
import { useGenerations, useDeleteGeneration, useUpdateGenerationLocation, useCreateGeneration, GenerationsPaginatedResponse } from "@/shared/hooks/useGenerations";
// Settings inheritance is handled by useShotCreation

import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useQueryClient } from '@tanstack/react-query';
import { usePublicLoras, usePublicStyleReferences, useMyStyleReferences } from '@/shared/hooks/useResources';

// Removed useListTasks import - was causing performance issues with 1000+ tasks
import { PageFadeIn } from '@/shared/components/transitions';
import { useSearchParams } from 'react-router-dom';
import { timeEnd } from '@/shared/lib/logger';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { fetchGenerations } from "@/shared/hooks/useGenerations";
import { getDisplayUrl } from '@/shared/lib/utils';
import { smartPreloadImages, initializePrefetchOperations, smartCleanupOldPages, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles, Settings2 } from 'lucide-react';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useStableObject } from '@/shared/hooks/useStableObject';

// Remove unnecessary environment detection - tool should work in all environments

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Per-shot page UI preferences for the image generation tool page.
 * Stored separately from form generation settings.
 */
interface ImageGenPagePrefs {
  /** Gallery filter override - which shot to filter by (or 'all') */
  galleryFilterOverride?: string;
}

// Stable empty defaults to prevent render loops in useAutoSaveSettings
const EMPTY_PAGE_PREFS: ImageGenPagePrefs = {};



// Create a proper memo comparison - since this component has no props, it should never re-render due to props
const ImageGenerationToolPage: React.FC = React.memo(() => {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageWithMetadata[]>([]);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUpscalingImageId, setIsUpscalingImageId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // Enable generations loading immediately to leverage React Query cache on revisits
  // Removing delayed load gate prevents transient loading state on revisit
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true); // Default checked
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [lastKnownTotal, setLastKnownTotal] = useState<number>(0);
  const [isPageChange, setIsPageChange] = useState(false);
  const [isPageChangeFromBottom, setIsPageChangeFromBottom] = useState(false);
  const [isFilterChange, setIsFilterChange] = useState(false);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('image'); // Default to images only
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [toolTypeFilterEnabled, setToolTypeFilterEnabled] = useState<boolean>(false); // Default to All Tools (not filtering by tool type)
  const [formAssociatedShotId, setFormAssociatedShotId] = useState<string | null>(null); // Track the associated shot from the form
  // Optimistic initial state: read last known form state from sessionStorage for instant UI on revisit
  const [isFormExpanded, setIsFormExpanded] = useState<boolean | undefined>(() => {
    try {
      const key = 'ig:formExpanded';
      const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch {}
    return true; // Default to expanded instead of undefined to avoid skeleton
  });
  const [isSticky, setIsSticky] = useState(false);
  const [isScrollingToForm, setIsScrollingToForm] = useState(false);
  const isMobile = useIsMobile();
  
  // Get pane states to adjust sticky header position
  const { 
    isShotsPaneLocked, 
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();
  
  // Early prefetch of public LoRAs to reduce loading time
  const publicLorasResult = usePublicLoras();

  // Early prefetch of style references to reduce loading time in browser modal
  const publicStyleRefsResult = usePublicStyleReferences();
  const myStyleRefsResult = useMyStyleReferences();
  
  // Use the new task queue notifier hook
  const { selectedProjectId, projects } = useProject();
  
  // Use a resilient project ID that can fall back to a global value set by ProjectContext
  const effectiveProjectId = React.useMemo(() => {
    if (selectedProjectId) return selectedProjectId;
    if (typeof window !== 'undefined') {
      const fromGlobal = (window as any).__PROJECT_CONTEXT__?.selectedProjectId;
      if (fromGlobal) return fromGlobal;
      try {
        const fromStorage = window.localStorage.getItem('lastSelectedProjectId');
        if (fromStorage) return fromStorage;
      } catch {}
    }
    return null;
  }, [selectedProjectId]);
  
  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Need queryClient for cache invalidation
  const queryClient = useQueryClient();

  // Page UI preferences (separate from form generation settings)
  // Uses shot-scoped settings with 'image-gen-page-prefs' toolId
  const pagePrefs = useAutoSaveSettings<ImageGenPagePrefs>({
    toolId: 'image-gen-page-prefs',
    shotId: formAssociatedShotId,
    projectId: selectedProjectId,
    scope: 'shot',
    defaults: EMPTY_PAGE_PREFS,
    enabled: !!formAssociatedShotId && !!selectedProjectId,
  });

  // Use stable object for task queue notifier options
  const taskQueueOptions = useStableObject(() => ({
    projectId: selectedProjectId,
    suppressPerTaskToast: true 
  }), [selectedProjectId]);
  
  // REMOVED: useTaskQueueNotifier was interfering with RealtimeProvider
  const isEnqueuing = false;
  const justQueued = false;
  const [localIsGenerating, setLocalIsGenerating] = useState(false);
  const [localJustQueued, setLocalJustQueued] = useState(false);
  const localQueuedTimeoutRef = useRef<number | null>(null);
  
  // Always use hooks - no environment-based disabling
  const { apiKeys, getApiKey } = useApiKeys();
  const imageGenerationFormRef = useRef<ImageGenerationFormHandles>(null);
  // Measure gallery container dimensions for calculating correct items per page
  // Height offset accounts for pagination controls at bottom (~80px)
  const [galleryRef, containerDimensions] = useContainerDimensions(80);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const collapsibleContainerRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  // Removed unused currentShotId that was causing unnecessary re-renders

  // Removed projectTasks tracking - was causing performance issues with 1000+ tasks
  // TaskQueueNotifier now handles task tracking internally
  // Use shots from context instead of direct hook call - this prevents loading state on revisit
  const { shots, isLoading: isLoadingShots, error: shotsError } = useShots();

  // Use stable object to prevent recreation on every render
  const persistentStateContext = useStableObject(() => ({ 
    projectId: selectedProjectId 
  }), [selectedProjectId]);
  
  // Skip persistent state hook for form expansion to avoid loading delay
  // We handle persistence manually with sessionStorage for instant UI
  const formStateReady = true; // Always ready since we handle it manually
  const markFormStateInteracted = useCallback(() => {
    // No-op since we handle persistence manually
  }, []);
  
  // Handle URL parameter to override saved state when specified (run only once)
  useEffect(() => {
    const formCollapsedParam = searchParams.get('formCollapsed');
    
    // Only run this logic once when the component mounts and state is ready
    if (formStateReady && formCollapsedParam === 'true') {
      setIsFormExpanded(false);
      try { window.sessionStorage.setItem('ig:formExpanded', 'false'); } catch {}
      
      // Clear the URL parameter after applying it
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('formCollapsed');
      const newUrl = newSearchParams.toString() 
        ? `${window.location.pathname}?${newSearchParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formStateReady]); // Only depend on formStateReady to run once when ready


  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const { createShot } = useShotCreation();

  // Sync gallery filter from page preferences when they load for a shot
  const lastAppliedPagePrefsForShotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!formAssociatedShotId || pagePrefs.status !== 'ready') return;
    // Only apply once per shot
    if (lastAppliedPagePrefsForShotRef.current === formAssociatedShotId) return;
    lastAppliedPagePrefsForShotRef.current = formAssociatedShotId;

    const override = pagePrefs.settings.galleryFilterOverride;
    if (override !== undefined) {
      // User had explicitly set a filter for this shot - restore it
      console.log('[GalleryFilter] Restoring saved override for shot:', formAssociatedShotId.substring(0, 8), '→', override);
      setSelectedShotFilter(override);
    } else {
      // No override - default to filtering by this shot
      console.log('[GalleryFilter] No override, defaulting to shot:', formAssociatedShotId.substring(0, 8));
      setSelectedShotFilter(formAssociatedShotId);
    }
  }, [formAssociatedShotId, pagePrefs.status, pagePrefs.settings.galleryFilterOverride]);

  // Handler for when user explicitly changes the gallery filter
  const handleGalleryFilterChange = useCallback((newFilter: string) => {
    setSelectedShotFilter(newFilter);

    // Save the override via page preferences
    if (formAssociatedShotId && pagePrefs.status === 'ready') {
      // Only save if user chose something OTHER than the default (current shot)
      // If they chose the current shot, clear the override
      const shouldSaveOverride = newFilter !== formAssociatedShotId;
      const valueToSave = shouldSaveOverride ? newFilter : undefined;

      console.log('[GalleryFilter] User changed filter:', {
        shot: formAssociatedShotId.substring(0, 8),
        newFilter,
        savingOverride: shouldSaveOverride,
        valueToSave,
      });

      pagePrefs.updateField('galleryFilterOverride', valueToSave);
    }
  }, [formAssociatedShotId, pagePrefs]);

  // Calculate items per page based on container dimensions
  // Columns are calculated from width, rows from available height (viewport-aware)
  const galleryLayout = useMemo(() => {
    return getLayoutForAspectRatio(
      projectAspectRatio,
      isMobile,
      containerDimensions.width,
      containerDimensions.height
    );
  }, [projectAspectRatio, isMobile, containerDimensions.width, containerDimensions.height]);

  // Lock in skeleton layout to prevent jitter during loading
  // Calculate once based on window dimensions and never change
  const stableSkeletonLayout = useRef<{ columns: number; itemsPerPage: number } | null>(null);
  if (stableSkeletonLayout.current === null) {
    // Use window dimensions estimate for stable initial value
    // Height offset of 80 matches useContainerDimensions offset for header + controls
    const estimatedWidth = typeof window !== 'undefined' ? Math.floor(window.innerWidth * 0.9) : 800;
    const estimatedHeight = typeof window !== 'undefined' ? window.innerHeight - 80 : 600;
    const stableLayout = getLayoutForAspectRatio(projectAspectRatio, isMobile, estimatedWidth, estimatedHeight);
    stableSkeletonLayout.current = {
      columns: stableLayout.columns,
      itemsPerPage: stableLayout.itemsPerPage
    };
  }

  const itemsPerPage = galleryLayout.itemsPerPage;
  
  // Use stable object for filters to prevent recreating on every render
  const generationsFilters = useStableObject(() => ({
    toolType: toolTypeFilterEnabled ? 'image-generation' : undefined, // Only filter by tool type when enabled
    mediaType: mediaTypeFilter, // Use dynamic mediaType instead of hardcoded 'image'
    shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
    excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
    starredOnly,
    searchTerm: searchTerm.trim() || undefined // Only pass if not empty
  }), [toolTypeFilterEnabled, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly, searchTerm]);
  
  // Debug logging removed for performance
  
  // Fetch generations using a resilient project ID; enable when effectiveProjectId is available
  const { data: generationsResponse, isLoading: isLoadingGenerations, isPlaceholderData } = useGenerations(
    effectiveProjectId, 
    currentPage, 
    itemsPerPage, 
    !!effectiveProjectId, 
    generationsFilters
  );

  const deleteGenerationMutation = useDeleteGeneration();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  const createGenerationMutation = useCreateGeneration();

  // 🔧 FIX: Consolidate all filter resets into ONE useEffect to prevent query cancellation cascade
  // Previously, 4 separate useEffects would fire sequentially on mount, each cancelling the previous query
  // Shot filter queries are slow (~2-3s) and would get cancelled before completing
  useEffect(() => {
    console.log('[ShotFilterPagination] 📄 ANY filter changed, resetting to page 1:', {
      selectedShotFilter,
      excludePositioned,
      mediaTypeFilter,
      starredOnly,
      searchTerm,
      toolTypeFilterEnabled
    });

    setIsFilterChange(true);
    setCurrentPage(1);
  }, [selectedShotFilter, excludePositioned, mediaTypeFilter, starredOnly, searchTerm, toolTypeFilterEnabled]);

  // Update last known total when we get valid data
  useEffect(() => {
    if (generationsResponse?.total !== undefined) {
      setLastKnownTotal(generationsResponse.total);
    }
  }, [generationsResponse?.total]);

  // Optimized: Use the memoized imagesToShow directly instead of local state duplication
  useEffect(() => {
    if (generationsResponse) {
      // Always update with new items if available, even during filter changes
      setGeneratedImages(generationsResponse.items || []);
      // Reset filter change flag
      if (isFilterChange) {
        setIsFilterChange(false);
      }
    }
    // Removed else clause - don't clear during loading to prevent jump
    // Clearing only happens explicitly elsewhere if needed
  }, [generationsResponse, isFilterChange]);

  // Removed delayed enable; query is always enabled to leverage cache on revisit

  // Handle shot change from the form (one-time update)
  const handleFormShotChange = useCallback((shotId: string | null) => {
    setFormAssociatedShotId(shotId);

    // Update the shot selection in gallery items by setting lastAffectedShotId
    if (shotId) {
      setLastAffectedShotId(shotId);
      // Also update the gallery filter
      setSelectedShotFilter(shotId);
    }
  }, [setLastAffectedShotId]);

  // Handle scrolling to gallery when coming from "View All" in GenerationsPane
  useEffect(() => {
    if (searchParams.get('scrollToGallery') === 'true') {
      // Wait for the gallery to be loaded and then scroll to it
      const checkAndScroll = () => {
        if (galleryRef.current && !isLoadingGenerations) {
          // If form is collapsed, scroll to gallery directly, otherwise to form container
          if (!isFormExpanded && galleryRef.current) {
            galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (formContainerRef.current) {
            formContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          // If not ready yet, try again in a bit
          setTimeout(checkAndScroll, 100);
        }
      };
      
      // Start checking after a small initial delay
      setTimeout(checkAndScroll, 150);
    }
  }, [searchParams, generationsResponse, isLoadingGenerations, isFormExpanded]);

  const handleDeleteImage = useCallback(async (id: string) => {
    deleteGenerationMutation?.mutate(id);
  }, [deleteGenerationMutation]);

  const handleUpscaleImage = async (imageId: string, imageUrl: string, currentMetadata?: DisplayableMetadata) => {
    setIsUpscalingImageId(imageId);
    const toastId = `upscale-${imageId}`;
    toast.info("Sending request to DEBUG upscale function...", { id: toastId });

    try {
      const functionData = await invokeWithTimeout<any>('hello-debug', {
        body: { imageUrl },
        timeoutMs: 15000,
      });

      console.log("Debug function response data:", functionData);

      if (!functionData || !functionData.upscaledImageUrl) {
        console.error("Debug Edge function returned unexpected data:", functionData);
        if (functionData && functionData.message && functionData.message.includes("imageUrl is missing")) {
          throw new Error("Debug function reports: imageUrl is missing in payload.");
        }
        throw new Error("Debug upscale completed but did not return a valid image URL or expected message.");
      }

      const upscaledImageUrl = functionData.upscaledImageUrl;
      

      const newMetadata: DisplayableMetadata = {
        ...(currentMetadata || {}),
        upscaled: true,
        original_image_url: imageUrl, 
      };

      const upscaledImage: GeneratedImageWithMetadata = {
        id: `upscaled-${Date.now()}`,
        url: upscaledImageUrl,
        prompt: currentMetadata?.prompt || "Upscaled image",
        metadata: newMetadata,
      };

      setGeneratedImages(prev => [upscaledImage, ...prev]);
    } catch (error) {
      console.error("Error upscaling image:", error);
      toast.error(`Failed to upscale image: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
    } finally {
      setIsUpscalingImageId(null);
    }
  };

  const handleNewGenerate = async (taskParams: BatchImageGenerationTaskParams): Promise<string[]> => {
    const generateStartTime = Date.now();
    const generateId = `gen-${generateStartTime}-${Math.random().toString(36).slice(2, 6)}`;

    console.log(`[GenerationDiag:${generateId}] 🚀 GENERATION START:`, {
      selectedProjectId,
      modelName: taskParams.model_name,
      promptCount: taskParams.prompts?.length,
      imagesPerPrompt: taskParams.imagesPerPrompt,
      timestamp: generateStartTime
    });

    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return [];
    }

    // Clear existing images but keep current page position
    if (taskParams.prompts.length * taskParams.imagesPerPrompt > 0) {
      setGeneratedImages([]);
    }

    setLocalIsGenerating(true);
    let createdTaskIds: string[] = [];
    try {
      console.log('[ImageGeneration] Using unified batch task creation for model:', taskParams.model_name);
      const createdTasks = await createBatchImageGenerationTasks(taskParams);
      createdTaskIds = createdTasks.map((t: any) => t.id);

      // Invalidate generations to ensure they refresh when tasks complete
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', effectiveProjectId] });

      // Invalidate tasks query so TasksPane count updates promptly
      queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });

      const generateDuration = Date.now() - generateStartTime;
      console.log(`[GenerationDiag:${generateId}] ✅ GENERATION COMPLETE:`, {
        duration: `${generateDuration}ms`,
        tasksCreated: taskParams.prompts.length * taskParams.imagesPerPrompt,
        taskIds: createdTaskIds,
        timestamp: Date.now()
      });

      console.log('[ImageGeneration] Image generation tasks created successfully');
      setLocalJustQueued(true);
      if (localQueuedTimeoutRef.current) {
        clearTimeout(localQueuedTimeoutRef.current);
      }
      localQueuedTimeoutRef.current = window.setTimeout(() => {
        setLocalJustQueued(false);
        localQueuedTimeoutRef.current = null;
      }, 3000);

      return createdTaskIds;
    } catch (error) {
      console.error('[ImageGeneration] Error creating tasks:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create tasks.');
      return [];
    } finally {
      setLocalIsGenerating(false);
    }
  };

  // Remove the old task tracking effect - it's now handled by useTaskQueueNotifier

  const falApiKey = getApiKey('fal_api_key');
  const openaiApiKey = getApiKey('openai_api_key');
  const hasValidFalApiKey = true; // Always true - let the task creation handle validation

  // Memoize target shot calculations to prevent re-renders
  const targetShotInfo = useMemo(() => {
    const targetShotIdForButton = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
    const targetShotNameForButtonTooltip = targetShotIdForButton 
      ? (shots?.find(s => s.id === targetShotIdForButton)?.name || 'Selected Shot')
      : (shots && shots.length > 0 ? shots[0].name : 'Last Shot');
    
    return { targetShotIdForButton, targetShotNameForButtonTooltip };
  }, [lastAffectedShotId, shots]);

  // Memoize validated shots array
  const validShots = useMemo(() => shots || [], [shots]);

  // Memoize images array to prevent unnecessary re-renders
  const imagesToShow = useMemo(() => {
    const images = [...(generationsResponse?.items || [])];
    return images;
  }, [generationsResponse]);

  const handleAddImageToTargetShot = useCallback(async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    if (!targetShotInfo.targetShotIdForButton) {
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
        toast.error("Image has no ID, cannot add to shot.");
        return false;
    }
    if (!selectedProjectId) {
        toast.error("No project selected. Cannot add image to shot.");
        return false;
    }

    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter !== 'all' && 
                                  selectedShotFilter === targetShotInfo.targetShotIdForButton && 
                                  excludePositioned;

    try {
      if (shouldPositionExisting) {
        // Use the position existing function for items in the filtered list
        await positionExistingGenerationMutation?.mutateAsync({
          shot_id: targetShotInfo.targetShotIdForButton,
          generation_id: generationId,
          project_id: selectedProjectId,
        });
      } else {
        // Use the regular add function
        const result = await addImageToShotMutation?.mutateAsync({
          shot_id: targetShotInfo.targetShotIdForButton,
          generation_id: generationId,
          imageUrl: imageUrl,
          thumbUrl: thumbUrl,
          project_id: selectedProjectId, 
        });
        // Debug logging removed for performance
      }
      setLastAffectedShotId(targetShotInfo.targetShotIdForButton);
      
      // Force refresh of generations data to show updated positioning
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', effectiveProjectId] });
      
      return true;
    } catch (error) {
      console.error("Error adding image to target shot:", error);
      toast.error("Failed to add image to shot.");
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, selectedProjectId, addImageToShotMutation, positionExistingGenerationMutation, setLastAffectedShotId, selectedShotFilter, excludePositioned]);

  const handleAddImageToTargetShotWithoutPosition = useCallback(async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    if (!targetShotInfo.targetShotIdForButton) {
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
        toast.error("Image has no ID, cannot add to shot.");
        return false;
    }
    if (!selectedProjectId) {
        toast.error("No project selected. Cannot add image to shot.");
        return false;
    }

    try {
      // Always use the add without position function
      const result = await addImageToShotWithoutPositionMutation?.mutateAsync({
        shot_id: targetShotInfo.targetShotIdForButton,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId, 
      });
      
      setLastAffectedShotId(targetShotInfo.targetShotIdForButton);
      
      // Force refresh of generations data to show updated association
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', effectiveProjectId] });
      
      return true;
    } catch (error) {
      console.error("Error adding image to target shot without position:", error);
      toast.error("Failed to add image to shot without position.");
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, selectedProjectId, addImageToShotWithoutPositionMutation, setLastAffectedShotId, queryClient]);

  // Drive UI from local state since we use unified task creation approach
  const isGenerating = localIsGenerating;
  const combinedJustQueued = localJustQueued;

  const scrollPosRef = useRef<number>(0);

  const handleServerPageChange = useCallback((page: number, fromBottom?: boolean) => {
    console.log('[ShotFilterPagination] 🔄 Page change requested:', {
      newPage: page,
      currentPage,
      fromBottom,
      currentFilters: {
        shotFilter: selectedShotFilter,
        excludePositioned,
        toolTypeEnabled: toolTypeFilterEnabled,
        mediaType: mediaTypeFilter
      },
      timestamp: Date.now()
    });
    
    if (!fromBottom) {
      scrollPosRef.current = window.scrollY;
    }
    setIsPageChange(true);
    setIsPageChangeFromBottom(!!fromBottom);
    setCurrentPage(page);
    // REMOVED: Don't clear images - this interferes with progressive loading
    // The gallery's internal loading state handles the transition better
    // setGeneratedImages([]);
  }, [currentPage, selectedShotFilter, excludePositioned, toolTypeFilterEnabled, mediaTypeFilter]);

  // Handle media type filter change
  const handleMediaTypeFilterChange = useCallback((newMediaType: 'all' | 'image' | 'video') => {
    setMediaTypeFilter(newMediaType);
    // Page reset is now handled in the useEffect
  }, []);

  // Handle tool type filter change
  const handleToolTypeFilterChange = useCallback((enabled: boolean) => {
    setToolTypeFilterEnabled(enabled);
    // Page reset is handled in useEffect
  }, []);

  // Handle switching to the associated shot from the form
  const handleSwitchToAssociatedShot = useCallback((shotId: string) => {
    handleGalleryFilterChange(shotId);
  }, [handleGalleryFilterChange]);

  // Handle backfill request to fill empty spaces after deletions
  const handleBackfillRequest = useCallback(async (deletedCount: number, currentPage: number, itemsPerPage: number): Promise<GeneratedImageWithMetadata[]> => {
    if (!selectedProjectId) {
      console.warn('[BackfillDebug] No project selected for backfill');
      return [];
    }

    try {
      console.log('[BackfillDebug] Triggering data refresh for backfill:', {
        deletedCount,
        currentPage,
        itemsPerPage,
        selectedProjectId,
        timestamp: Date.now()
      });

      // Instead of fetching new data, we'll trigger a refresh of the current page
      // The server will naturally return items from the next page to fill gaps
      await queryClient.invalidateQueries({ 
        queryKey: ['unified-generations', 'project', effectiveProjectId] 
      });
      
      // Refetch the current page - this will get updated data with items moved up from next page
      await queryClient.refetchQueries({ 
        queryKey: ['unified-generations', 'project', effectiveProjectId, currentPage, itemsPerPage, generationsFilters] 
      });

      console.log('[BackfillDebug] Data refresh completed for backfill');
      
      // Return empty array since the refresh will update the main data source
      return [];
    } catch (error) {
      console.error('[BackfillDebug] Failed to refresh data for backfill:', error);
      return [];
    }
  }, [selectedProjectId, queryClient, generationsFilters]);

  // Handle creating a new shot
  const handleCreateShot = useCallback(async (shotName: string, files: File[]): Promise<void> => {
    // Use unified shot creation - handles inheritance, events, lastAffected automatically
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      // Disable skeleton events for lightbox shot creation
      dispatchSkeletonEvents: files.length > 0,
      onSuccess: () => {
        // Invalidate and refetch shots to update the list
        queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
        queryClient.refetchQueries({ queryKey: ['shots', selectedProjectId] });
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      throw new Error('Shot creation failed');
    }

    console.log('[ImageGenerationToolPage] Shot created:', {
      shotId: result.shotId.substring(0, 8),
      shotName: result.shotName,
    });
    
    // Note: lastAffectedShotId is automatically updated by useShotCreation
    // Note: We're NOT changing setSelectedShotFilter here to keep the gallery populated
  }, [createShot, queryClient, selectedProjectId]);

  // Unified handler for Collapsible open/close with smooth scroll on open
  // Only perform scroll-then-open when triggered from the sticky toggle
  const handleCollapsibleOpenChange = useCallback((nextOpen: boolean, triggeredFromSticky?: boolean) => {
    const wasExpanded = isFormExpanded === true;
    
    // If we're expanding from collapsed state, scroll first, then expand
    if (nextOpen && !wasExpanded && triggeredFromSticky) {
      setIsScrollingToForm(true);
      
      // Scroll to the form container first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (collapsibleContainerRef.current) {
            try {
              const element = collapsibleContainerRef.current;
              const elementRect = element.getBoundingClientRect();
              const headerHeight = isMobile ? 80 : 96;
              const bufferSpace = 30;
              const targetScrollTop = window.scrollY + elementRect.top - headerHeight - bufferSpace;
              
              // Use smooth scroll with completion detection
              window.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
              
              // Listen for scroll completion or timeout
              let scrollTimeout: NodeJS.Timeout;
              let lastScrollTop = window.scrollY;
              let scrollStableCount = 0;
              
              const checkScrollComplete = () => {
                const currentScrollTop = window.scrollY;
                const targetReached = Math.abs(currentScrollTop - Math.max(0, targetScrollTop)) < 5;
                
                if (targetReached || currentScrollTop === lastScrollTop) {
                  scrollStableCount++;
                  if (scrollStableCount >= 3 || targetReached) {
                    // Scroll completed - now expand the form
                    setIsFormExpanded(nextOpen);
                    try { window.sessionStorage.setItem('ig:formExpanded', String(nextOpen)); } catch {}
                    setTimeout(() => { setIsScrollingToForm(false); }, 300);
                    clearTimeout(scrollTimeout);
                    return;
                  }
                } else {
                  scrollStableCount = 0;
                }
                
                lastScrollTop = currentScrollTop;
                scrollTimeout = setTimeout(checkScrollComplete, 50);
              };
              
              // Start checking for scroll completion after a brief delay
              setTimeout(checkScrollComplete, 100);
              
              // Fallback timeout - expand form after max 1.5 seconds regardless
              setTimeout(() => {
                if (!isFormExpanded) {
                  setIsFormExpanded(nextOpen);
                  try { window.sessionStorage.setItem('ig:formExpanded', String(nextOpen)); } catch {}
                  setIsScrollingToForm(false);
                }
                clearTimeout(scrollTimeout);
              }, 1500);
              
            } catch (error) {
              console.warn('Scroll calculation failed:', error);
              // Fallback - just expand immediately
              collapsibleContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setIsFormExpanded(nextOpen);
              try { window.sessionStorage.setItem('ig:formExpanded', String(nextOpen)); } catch {}
              setTimeout(() => { setIsScrollingToForm(false); }, 1000);
            }
          }
        });
      });
    } else {
      // For collapsing or immediate expanding, handle normally
      setIsFormExpanded(nextOpen);
      try { window.sessionStorage.setItem('ig:formExpanded', String(nextOpen)); } catch {}
      if (!nextOpen) {
        setIsScrollingToForm(false);
      }
    }
  }, [isFormExpanded, isMobile]);

  // Effect for sticky header (RAF + precomputed threshold to avoid layout thrash)
  useEffect(() => {
    const containerEl = collapsibleContainerRef.current;
    if (!containerEl) return;

    const stickyThresholdY = { current: 0 } as { current: number };
    const isStickyRef = { current: isSticky } as { current: boolean };
    let rafId = 0 as number | 0;

    const computeThreshold = () => {
      const rect = containerEl.getBoundingClientRect();
      const docTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      const containerDocTop = rect.top + docTop;
             const headerHeight = isMobile ? 150 : 96; // match actual header heights
       const extra = isMobile ? 0 : -40; // appears much earlier on desktop (negative value)
      stickyThresholdY.current = containerDocTop + headerHeight + extra;
    };

    const checkSticky = () => {
      rafId = 0 as number | 0;
      const shouldBeSticky = (window.pageYOffset || document.documentElement.scrollTop || 0) > stickyThresholdY.current;
      if (shouldBeSticky !== isStickyRef.current) {
        isStickyRef.current = shouldBeSticky;
        setIsSticky(shouldBeSticky);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(checkSticky) as unknown as number;
    };

    const onResize = () => {
      computeThreshold();
      // Re-evaluate stickiness immediately after layout changes
      if (rafId) cancelAnimationFrame(rafId as unknown as number);
      rafId = requestAnimationFrame(checkSticky) as unknown as number;
    };

    // Initial measure
    computeThreshold();
    // Initial state check
    checkSticky();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    // If the container layout might change due to content expansion/collapse, recompute threshold
    const ro = new ResizeObserver(() => onResize());
    ro.observe(containerEl);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId) cancelAnimationFrame(rafId as unknown as number);
      ro.disconnect();
    };
  }, [isFormExpanded, isMobile]);

  // [NavPerf] Stop timers when page has mounted
  useEffect(() => {
    timeEnd('NavPerf', 'PageLoad:/tools/image-generation');
  }, []);

  // Ref to track ongoing server-side prefetch operations
  const prefetchOperationsRef = useRef<{
    images: HTMLImageElement[];
    currentPrefetchId: string;
  }>({ images: [], currentPrefetchId: '' });

  // Prefetch adjacent pages callback for ImageGallery with cancellation
  const handlePrefetchAdjacentPages = useCallback((prevPage: number | null, nextPage: number | null) => {
    if (!effectiveProjectId) return;
    // Disable adjacent prefetch on mobile to avoid main thread/contention and slow paints
    if (isMobile) return;

    // Cancel previous image preloads immediately
    const prevOps = prefetchOperationsRef.current;
    prevOps.images.forEach(img => {
      img.onload = null;
      img.onerror = null;
      img.src = ''; // Cancel loading
    });

    // Reset tracking with new prefetch ID
    const prefetchId = `${nextPage}-${prevPage}-${Date.now()}`;
    initializePrefetchOperations(prefetchOperationsRef, prefetchId);

    // Clean up old pagination cache to prevent memory leaks
    // Use unified base key to match actual query keys in this page
    smartCleanupOldPages(queryClient, currentPage, effectiveProjectId, 'unified-generations');
    
    // Trigger image garbage collection every 10 pages to free browser memory
    if (currentPage % 10 === 0) {
      triggerImageGarbageCollection();
    }

    // Use the same memoized filters object for consistency
    const filters = generationsFilters;

    // Using centralized preload function from shared hooks

    // Prefetch next page first (higher priority)
    if (nextPage) {
      queryClient.prefetchQuery({
        queryKey: ['unified-generations', 'project', effectiveProjectId, nextPage, itemsPerPage, filters],
        queryFn: () => fetchGenerations(effectiveProjectId, itemsPerPage, (nextPage - 1) * itemsPerPage, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['unified-generations', 'project', effectiveProjectId, nextPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
        smartPreloadImages(cached, 'next', prefetchId, prefetchOperationsRef);
      });
    }

    // Prefetch previous page second (lower priority)
    if (prevPage) {
      queryClient.prefetchQuery({
        queryKey: ['unified-generations', 'project', effectiveProjectId, prevPage, itemsPerPage, filters],
        queryFn: () => fetchGenerations(effectiveProjectId, itemsPerPage, (prevPage - 1) * itemsPerPage, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cachedPrev = queryClient.getQueryData(['unified-generations', 'project', effectiveProjectId, prevPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
        smartPreloadImages(cachedPrev, 'prev', prefetchId, prefetchOperationsRef);
      });
    }
  }, [selectedProjectId, itemsPerPage, queryClient, generationsFilters, currentPage]);

  useEffect(() => {
    if (generationsResponse && isPageChange) {
      if (isPageChangeFromBottom) {
        if (galleryRef.current) {
          const rect = galleryRef.current.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + scrollTop - (isMobile ? 80 : 20); // Account for mobile nav/header
          
          window.scrollTo({
            top: Math.max(0, targetPosition), // Ensure we don't scroll above page top
            behavior: 'smooth'
          });
        }
      } else {
        // restore scroll position only for page changes, not filter changes
        window.scrollTo({ top: scrollPosRef.current, behavior: 'auto' });
      }
      setIsPageChange(false);
      setIsPageChangeFromBottom(false);
    }
  }, [generationsResponse, isPageChange, isPageChangeFromBottom]);

  useEffect(() => {
    return () => {
      if (localQueuedTimeoutRef.current) {
        clearTimeout(localQueuedTimeoutRef.current);
        localQueuedTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <PageFadeIn>
      <div className="flex flex-col space-y-6 pb-6 px-4 max-w-7xl mx-auto pt-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Image Generation</h1>
        </div>

        {/* <Button variant="ghost" onClick={() => setShowSettingsModal(true)}>
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button> */}

      {!hasValidFalApiKey && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-center text-sm text-muted-foreground">
            You need a valid API key to use this tool.
          </p>
          <Button className="mt-4">
            <a href="https://fal.ai/signup" target="_blank" rel="noopener noreferrer">
              Sign Up for Fal
            </a>
          </Button>
        </div>
      )}

      {/* Show loading state while persistent state is loading */}
      {hasValidFalApiKey && isFormExpanded === undefined && (
        <div className="p-6 border rounded-lg shadow-sm bg-card w-full max-w-full animate-pulse">
          <div className="h-4 bg-muted rounded w-48 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-muted rounded w-full"></div>
            <div className="h-3 bg-muted rounded w-3/4"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      )}

      {/* Render only if API key is valid and state is loaded */}
      {hasValidFalApiKey && isFormExpanded !== undefined && (
        <>
          <div ref={collapsibleContainerRef} className="mb-8">
            <Collapsible 
              open={isFormExpanded} 
              onOpenChange={handleCollapsibleOpenChange}
            >
              {/* Keep the trigger always visible - let it scroll naturally */}
              <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className={`${isFormExpanded ? 'w-full justify-between px-6 py-6 hover:bg-accent/50 bg-accent/10 border border-b-0 rounded-t-lg shadow-sm text-foreground' : 'w-full justify-between px-6 py-6 gradient-primary-collapsed rounded-lg'} transition-all duration-700 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]`}
                    type="button"
                  >
                    <div className="flex items-center gap-2 transition-all duration-700 ease-in-out">
                      <Settings2 className={`h-4 w-4 transition-all duration-700 ease-in-out ${!isFormExpanded ? 'text-white' : 'text-foreground'}`} />
                      <span className={`font-light flex items-center gap-1 transition-all duration-700 ease-in-out ${!isFormExpanded ? 'text-white' : 'text-foreground'}`}>
                        Make images
                        <Sparkles className={`h-3 w-3 transition-all duration-700 ease-in-out ${!isFormExpanded ? 'text-white' : 'text-foreground'}`} />
                      </span>
                    </div>
                    <div className="transition-transform duration-700 ease-in-out">
                      {isFormExpanded ? (
                        <ChevronDown className="h-4 w-4 transition-all duration-700 ease-in-out text-foreground" />
                      ) : (
                        <ChevronLeft className="h-4 w-4 text-white transition-all duration-700 ease-in-out" />
                      )}
                    </div>
                  </Button>
                </CollapsibleTrigger>
              <CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 transition-all duration-700 ease-in-out overflow-hidden">
                <div ref={formContainerRef} className="p-6 border rounded-lg shadow-sm bg-card w-full max-w-full transition-all duration-700 ease-in-out">
                  <ImageGenerationForm
                    ref={imageGenerationFormRef}
                    onGenerate={handleNewGenerate}
                    isGenerating={isGenerating}
                    hasApiKey={hasValidFalApiKey}
                    apiKey={falApiKey}
                    openaiApiKey={openaiApiKey}
                    justQueued={combinedJustQueued}
                    onShotChange={handleFormShotChange}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Sticky form toggle button (appears when scrolled past original) */}
          {(hasValidFalApiKey && isFormExpanded === false && (isSticky || isScrollingToForm)) && (() => {
            // Calculate positioning based on header and panes
            const headerHeight = isMobile ? 20 : 96; // Mobile header VERY close to top, desktop is 96px (h-24)
            const topPosition = isMobile ? headerHeight + 4 : 25; // 25px from top on desktop, minimal gap on mobile
            
            // Calculate horizontal constraints based on locked panes
            const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
            const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
            
            return (
              <div
                className={`fixed z-50 flex justify-center transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-2 pointer-events-none`}
                style={{
                  top: `${topPosition}px`,
                  left: `${leftOffset}px`,
                  right: `${rightOffset}px`,
                  paddingLeft: '16px',
                  paddingRight: '16px',
                  willChange: 'transform, opacity',
                  transform: 'translateZ(0)'
                }}
              >
                <Button
                  variant="ghost"
                  className={`justify-between ${isMobile ? 'p-3 text-sm' : 'p-4'} w-full max-w-2xl gradient-primary-collapsed backdrop-blur-md shadow-xl transition-all duration-700 ease-in-out hover:scale-105 active:scale-95 rounded-lg transform hover:shadow-2xl pointer-events-auto`}
                  onClick={() => handleCollapsibleOpenChange(true, true)}
                  type="button"
                >
                  <div className="flex items-center gap-2 transition-all duration-700 ease-in-out">
                    <Settings2 className="h-4 w-4 text-white transition-all duration-700 ease-in-out" />
                    <span className="font-light flex items-center gap-1 text-white transition-all duration-700 ease-in-out">
                      {isMobile ? 'Make images' : 'Make images'}
                      <Sparkles className="h-3 w-3 text-white transition-all duration-700 ease-in-out" />
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white transition-transform duration-700 ease-in-out" />
                </Button>
              </div>
            );
          })()}

          <div ref={galleryRef} className="pt-0">
            {/* Show SkeletonGallery on initial load or when filter changes take too long */}
            {(!effectiveProjectId || (isLoadingGenerations && imagesToShow.length === 0)) ? (
              <SkeletonGallery
                count={stableSkeletonLayout.current.itemsPerPage}
                fixedColumns={stableSkeletonLayout.current.columns}
                showControls={true}
                projectAspectRatio={projectAspectRatio}
              />
            ) : (
              <div className={isLoadingGenerations && isFilterChange ? 'opacity-60 pointer-events-none transition-opacity duration-200' : ''}>
                <ImageGallery
                reducedSpacing={true}
                images={imagesToShow}
                onDelete={handleDeleteImage}
                onAddToLastShot={handleAddImageToTargetShot}
                onAddToLastShotWithoutPosition={handleAddImageToTargetShotWithoutPosition}
                isDeleting={isDeleting}
                allShots={validShots}
                lastShotId={targetShotInfo.targetShotIdForButton}
                lastShotNameForTooltip={targetShotInfo.targetShotNameForButtonTooltip}
                currentToolType="image-generation"
                initialFilterState={true}
                initialMediaTypeFilter={mediaTypeFilter}
                itemsPerPage={itemsPerPage}
                offset={(currentPage - 1) * itemsPerPage}
                totalCount={generationsResponse?.total ?? lastKnownTotal}
                onServerPageChange={handleServerPageChange}
                serverPage={currentPage}
                showShotFilter={true}
                initialShotFilter={selectedShotFilter}
                onShotFilterChange={handleGalleryFilterChange}
                initialExcludePositioned={excludePositioned}
                onExcludePositionedChange={setExcludePositioned}
                showSearch={true}
                initialSearchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onMediaTypeFilterChange={handleMediaTypeFilterChange}
                initialStarredFilter={starredOnly}
                onStarredFilterChange={setStarredOnly}
                onToolTypeFilterChange={handleToolTypeFilterChange}
                initialToolTypeFilter={toolTypeFilterEnabled}
                currentToolTypeName="Image Generation"
                formAssociatedShotId={formAssociatedShotId}
                onSwitchToAssociatedShot={handleSwitchToAssociatedShot}
                onPrefetchAdjacentPages={handlePrefetchAdjacentPages}
                enableAdjacentPagePreloading={!isMobile}
                onCreateShot={handleCreateShot}
                onBackfillRequest={handleBackfillRequest}
                showShare={false}
                isLoading={isPlaceholderData}
              />
              </div>
            )}
          </div>
        </>
      )}


      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />
      </div>
    </PageFadeIn>
  );
}, () => true); // Always return true since component has no props

export default ImageGenerationToolPage;

