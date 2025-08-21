import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

import ImageGenerationForm, { ImageGenerationFormHandles, PromptEntry } from "../components/ImageGenerationForm";
import { ImageGallery, GeneratedImageWithMetadata, DisplayableMetadata, MetadataLora } from "@/shared/components/ImageGallery";
import SettingsModal from "@/shared/components/SettingsModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { useAddImageToShot, useAddImageToShotWithoutPosition, usePositionExistingGenerationInShot, useCreateShot } from "@/shared/hooks/useShots";
import { useShots } from '@/shared/contexts/ShotsContext';
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useProject } from "@/shared/contexts/ProjectContext";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { nanoid } from 'nanoid';
import { useGenerations, useDeleteGeneration, useUpdateGenerationLocation, GenerationsPaginatedResponse } from "@/shared/hooks/useGenerations";

import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useTaskQueueNotifier } from '@/shared/hooks/useTaskQueueNotifier';
import { useQueryClient } from '@tanstack/react-query';
import { useListPublicResources } from '@/shared/hooks/useResources';

// Removed useListTasks import - was causing performance issues with 1000+ tasks
import { PageFadeIn } from '@/shared/components/transitions';
import { useSearchParams } from 'react-router-dom';
import { ToolPageHeader } from '@/shared/components/ToolPageHeader';
import { timeEnd } from '@/shared/lib/logger';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { fetchGenerations } from "@/shared/hooks/useGenerations";
import { getDisplayUrl } from '@/shared/lib/utils';
import { smartPreloadImages, initializePrefetchOperations, smartCleanupOldPages, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';
import { ShotFilter } from '@/shared/components/ShotFilter';
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



// Create a proper memo comparison - since this component has no props, it should never re-render due to props
const ImageGenerationToolPage: React.FC = React.memo(() => {
  
  // [ImageGenPageLoadDebug] Strategic debug logging to track timing and cache state
  const DEBUG_TAG = '[ImageGenPageLoadDebug]';
  const renderCount = useRef(0);
  const mountTime = useRef(Date.now());
  renderCount.current += 1;
  
  console.log(`${DEBUG_TAG} === RENDER START #${renderCount.current} === ${Date.now() - mountTime.current}ms since mount`);
  
  // [Strategic Debug] Track component lifecycle
  useEffect(() => {
    console.log(`${DEBUG_TAG} 🟢 COMPONENT MOUNTED at ${Date.now()}`);
    return () => {
      console.log(`${DEBUG_TAG} 🔴 COMPONENT UNMOUNTING at ${Date.now()}`);
    };
  }, []);
  
  // [Strategic Debug] Track after every render to see sequence
  useEffect(() => {
    console.log(`${DEBUG_TAG} 📋 POST-RENDER EFFECT #${renderCount.current}:`, {
      timestamp: Date.now(),
      allHookStates: {
        shots: { count: shots?.length, loading: isLoadingShots },
        generations: { loading: isLoadingGenerations, hasData: !!generationsResponse },
        form: { ready: formStateReady, expanded: isFormExpanded },
        project: { id: selectedProjectId }
      }
    });
  });
  
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
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all'); // Add media type filter state
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
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
  const publicLorasResult = useListPublicResources('lora');
  
  console.log(`${DEBUG_TAG} Render #${renderCount.current} - useListPublicResources states:`, {
    isLoading: publicLorasResult.isLoading,
    hasData: !!publicLorasResult.data,
    dataLength: publicLorasResult.data?.length,
    error: !!publicLorasResult.error
  });
  
  // Use the new task queue notifier hook
  const { selectedProjectId } = useProject();
  
  console.log(`${DEBUG_TAG} Render #${renderCount.current} - selectedProjectId:`, selectedProjectId);
  
  // Use stable object for task queue notifier options
  const taskQueueOptions = useStableObject(() => ({
    projectId: selectedProjectId,
    suppressPerTaskToast: true 
  }), [selectedProjectId]);
  
  const { enqueueTasks, isEnqueuing, justQueued } = useTaskQueueNotifier(taskQueueOptions);
  
  console.log(`${DEBUG_TAG} Render #${renderCount.current} - taskQueueNotifier states:`, {
    isEnqueuing,
    justQueued,
    taskQueueOptions
  });

  // Always use hooks - no environment-based disabling
  const { apiKeys, getApiKey } = useApiKeys();
  const imageGenerationFormRef = useRef<ImageGenerationFormHandles>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const collapsibleContainerRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  // Removed unused currentShotId that was causing unnecessary re-renders

  // Removed projectTasks tracking - was causing performance issues with 1000+ tasks
  // TaskQueueNotifier now handles task tracking internally
  // Use shots from context instead of direct hook call - this prevents loading state on revisit
  const { shots, isLoading: isLoadingShots, error: shotsError } = useShots();
  
  console.log(`${DEBUG_TAG} Render #${renderCount.current} - useShots context states:`, {
    shotsCount: shots?.length,
    isLoadingShots,
    hasError: !!shotsError,
    selectedProjectId,
    note: 'Using context instead of direct hook call'
  });

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
  
  console.log(`${DEBUG_TAG} Render #${renderCount.current} - Manual form state (bypassed usePersistentToolState):`, {
    formStateReady,
    isFormExpanded,
    note: 'Using sessionStorage directly for instant UI'
  });



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


  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const createShotMutation = useCreateShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const itemsPerPage = isMobile ? 24 : 20;
  
  // Use stable object for filters to prevent recreating on every render
  const generationsFilters = useStableObject(() => ({
    toolType: 'image-generation', // Always true
    mediaType: mediaTypeFilter, // Use dynamic mediaType instead of hardcoded 'image'
    shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
    excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
    starredOnly,
    searchTerm: searchTerm.trim() || undefined // Only pass if not empty
  }), [mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly, searchTerm]);
  
  // Debug logging removed for performance
  
  const { data: generationsResponse, isLoading: isLoadingGenerations } = useGenerations(
    selectedProjectId, 
    currentPage, 
    itemsPerPage, 
    true,
    generationsFilters
  );

  // [GalleryPollingDebug] Log when component uses the hook
  React.useEffect(() => {
    console.log('📊 [GalleryPollingDebug:ImageGenerationToolPage] useGenerations result:', {
      selectedProjectId,
      currentPage,
      itemsPerPage,
      isLoadingGenerations,
      hasData: !!generationsResponse,
      itemsCount: generationsResponse?.items?.length,
      total: generationsResponse?.total,
      generationsFilters,
      renderCount: renderCount.current,
      timestamp: Date.now()
    });
  }, [generationsResponse, isLoadingGenerations, selectedProjectId, currentPage]);
  
  console.log(`${DEBUG_TAG} Render #${renderCount.current} - useGenerations states:`, {
    isLoadingGenerations,
    hasData: !!generationsResponse,
    dataItemsCount: generationsResponse?.items?.length,
    total: generationsResponse?.total,
    currentPage,
    itemsPerPage,
    generationsFilters,
    selectedProjectId
  });
  
  const deleteGenerationMutation = useDeleteGeneration();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();

  const queryClient = useQueryClient();
  
  // [Strategic Debug] Check React Query cache state for this exact query
  const generationsQueryKey = ['generations', selectedProjectId, currentPage, itemsPerPage, generationsFilters];
  const cachedGenerationsData = queryClient.getQueryData(generationsQueryKey);
  const generationsQueryState = queryClient.getQueryState(generationsQueryKey);
  
  console.log(`${DEBUG_TAG} React Query Cache Inspection:`, {
    queryKey: generationsQueryKey,
    hasCachedData: !!cachedGenerationsData,
    cachedDataItemsCount: (cachedGenerationsData as any)?.items?.length,
    queryState: {
      status: generationsQueryState?.status,
      fetchStatus: generationsQueryState?.fetchStatus,
      dataUpdatedAt: generationsQueryState?.dataUpdatedAt,
      isLoading: generationsQueryState?.status === 'pending',
      isStale: generationsQueryState ? Date.now() - (generationsQueryState.dataUpdatedAt || 0) > 5 * 60 * 1000 : 'no-state'
    }
  });

  // Reset to page 1 when shot filter or position filter changes
  useEffect(() => {
    setIsFilterChange(true);
    setCurrentPage(1);
  }, [selectedShotFilter, excludePositioned]);

  // Reset to page 1 when media type or starred filter changes
  useEffect(() => {
    setIsFilterChange(true);
    setCurrentPage(1);
  }, [mediaTypeFilter, starredOnly]);

  // Reset to page 1 when tool type filter changes
  useEffect(() => {
    setIsFilterChange(true);
    setCurrentPage(1);
  }, []);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setIsFilterChange(true);
    setCurrentPage(1);
  }, [searchTerm]);

  // Update last known total when we get valid data
  useEffect(() => {
    if (generationsResponse?.total !== undefined && generationsResponse.total > 0) {
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

  // Track the associated shot ID from the form
  useEffect(() => {
    const interval = setInterval(() => {
      if (imageGenerationFormRef.current) {
        const associatedShotId = imageGenerationFormRef.current.getAssociatedShotId();
        setFormAssociatedShotId(associatedShotId);
      }
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []); // Remove dependency to prevent unnecessary effect recreation

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
      const { data: functionData, error: functionError } = await supabase.functions.invoke("hello-debug", {
        body: { imageUrl },
      });

      if (functionError) {
        console.error("Supabase Edge Function error:", functionError);
        let errorMessage = functionError.message;
        try {
          const parsedError = JSON.parse(functionError.message);
          if (parsedError && parsedError.error) {
            errorMessage = parsedError.error;
          }
        } catch (e) { /* Ignore if parsing fails */ }
        throw new Error(`Upscale request failed: ${errorMessage}`);
      }

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

  const handleNewGenerate = async (formData: any) => {
    console.log('[ImageGeneration] handleNewGenerate called with:', {
      selectedProjectId,
      generationMode: formData.generationMode,
      promptCount: formData.prompts?.length,
      imagesPerPrompt: formData.imagesPerPrompt,
    });

    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return;
    }

    const { generationMode, associatedShotId, ...restOfFormData } = formData;

    // Clear existing images but keep current page position
    if (restOfFormData.prompts.length * restOfFormData.imagesPerPrompt > 0) {
      setGeneratedImages([]);
      // Don't reset page - let user stay where they are
    }

    if (generationMode === 'wan-local') {
      // Process all prompts for wan-local mode
      const lorasMapped: Array<{ path: string; strength: number }> = (restOfFormData.loras || []).map((lora: any) => ({
        path: lora.path,
        strength: parseFloat(lora.scale ?? lora.strength) || 0.0,
      }));

      // Build an array of payloads – one per image task
      const taskPayloads = restOfFormData.prompts.flatMap((promptEntry: PromptEntry, promptIdx: number) => {
        return Array.from({ length: restOfFormData.imagesPerPrompt }, (_, imgIdx) => {
          const globalIndex = promptIdx * restOfFormData.imagesPerPrompt + imgIdx;
          return {
            functionName: 'single-image-generate',
            payload: {
              project_id: selectedProjectId,
              prompt: promptEntry.fullPrompt,
              resolution: restOfFormData.determinedApiImageSize || undefined,
              // Generate a random seed for each task to ensure diverse outputs (32-bit signed integer range)
              seed: Math.floor(Math.random() * 0x7fffffff),
              loras: lorasMapped,
              shot_id: associatedShotId || undefined,
            }
          };
        });
      });

      // Use the new unified task queue notifier
      try {
        await enqueueTasks(taskPayloads);
        // Also invalidate generations to ensure they refresh when tasks complete
        queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });
      } catch (error) {
        console.error('[ImageGeneration] Error creating tasks:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to create tasks.');
      }

    } else {
      // Single task for API-based modes
      try {
        await enqueueTasks([{
          functionName: 'single-image-generate',
          payload: {
            project_id: selectedProjectId,
            prompts: restOfFormData.prompts.map((p: PromptEntry) => p.fullPrompt),
            images_per_prompt: restOfFormData.imagesPerPrompt,
            loras: restOfFormData.loras,
            generation_mode: generationMode,
          }
        }]);

        // Also invalidate generations to ensure they refresh when tasks complete
        queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });

      } catch (err) {
        console.error('[ImageGeneration] Error creating task:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create task.');
      }
    }
  };

  // Remove the old task tracking effect - it's now handled by useTaskQueueNotifier

  const handleImageSaved = useCallback(async (imageId: string, newImageUrl: string) => {
    try {
      // Update the database record via Supabase
      await updateGenerationLocationMutation.mutateAsync({
        id: imageId,
        location: newImageUrl,
      });

      // Update local state
      setGeneratedImages(prevImages => {
        return prevImages.map(img => 
          img.id === imageId 
            ? { ...img, url: newImageUrl } 
            : img
        );
      });

      // Invalidate the generations query to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });
      
    } catch (error) {
      console.error("[ImageGeneration-HandleImageSaved] Error:", error);
      toast.error("Failed to update image.");
    }
  }, [updateGenerationLocationMutation, setGeneratedImages, queryClient, selectedProjectId]);

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
  const imagesToShow = useMemo(() => [...(generationsResponse?.items || [])], [generationsResponse]);

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
      queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });
      
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
      queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });
      
      return true;
    } catch (error) {
      console.error("Error adding image to target shot without position:", error);
      toast.error("Failed to add image to shot without position.");
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, selectedProjectId, addImageToShotWithoutPositionMutation, setLastAffectedShotId, queryClient]);

  const isGenerating = isEnqueuing;

  const scrollPosRef = useRef<number>(0);

  const handleServerPageChange = useCallback((page: number, fromBottom?: boolean) => {
    if (!fromBottom) {
      scrollPosRef.current = window.scrollY;
    }
    setIsPageChange(true);
    setIsPageChangeFromBottom(!!fromBottom);
    setCurrentPage(page);
    // REMOVED: Don't clear images - this interferes with progressive loading
    // The gallery's internal loading state handles the transition better
    // setGeneratedImages([]);
  }, []);

  // Handle media type filter change
  const handleMediaTypeFilterChange = useCallback((newMediaType: 'all' | 'image' | 'video') => {
    setMediaTypeFilter(newMediaType);
    // Page reset is now handled in the useEffect
  }, []);

  // Handle switching to the associated shot from the form
  const handleSwitchToAssociatedShot = useCallback((shotId: string) => {
    setSelectedShotFilter(shotId);
  }, []); // Remove dependencies to prevent stale closure issues

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

      // Invalidate and refetch shots to update the list
      await queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      await queryClient.refetchQueries({ queryKey: ['shots', selectedProjectId] });
      
      // Set the newly created shot as the target for "Add to Shot" actions
      // but don't change the gallery filter to keep existing images visible
      if (result.shot?.id) {
        setLastAffectedShotId(result.shot.id);
        // Note: We're NOT changing setSelectedShotFilter here to keep the gallery populated
      }
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error("Failed to create shot");
      throw error; // Re-throw so the modal can handle the error state
    }
  }, [selectedProjectId, createShotMutation, queryClient, setLastAffectedShotId]);

  // Handle toggling the form expand/collapse state
  const handleToggleFormExpanded = useCallback(() => {
    const wasExpanded = isFormExpanded === true;
    setIsFormExpanded(prev => prev !== true); // Explicitly toggle to boolean
    try { window.sessionStorage.setItem('ig:formExpanded', (!wasExpanded).toString()); } catch {}

    // If we're expanding (was collapsed), initiate scroll behavior
    if (!wasExpanded) {
      setIsScrollingToForm(true);
      
      // Wait longer for form expansion to complete, then use RAF for smooth scroll
      setTimeout(() => {
        // Use requestAnimationFrame to ensure DOM has fully updated
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (collapsibleContainerRef.current) {
              try {
                // Calculate a scroll position that shows the button above the form
                const element = collapsibleContainerRef.current;
                const elementRect = element.getBoundingClientRect();
                const headerHeight = isMobile ? 150 : 96;
                const bufferSpace = 30; // Increased buffer for better visibility
                
                // Calculate target scroll position
                const targetScrollTop = window.scrollY + elementRect.top - headerHeight - bufferSpace;
                
                window.scrollTo({
                  top: Math.max(0, targetScrollTop),
                  behavior: 'smooth'
                });
              } catch (error) {
                console.warn('Scroll calculation failed:', error);
                // Fallback to simple scrollIntoView
                collapsibleContainerRef.current?.scrollIntoView({ 
                  behavior: 'smooth', 
                  block: 'start' 
                });
              }
            }
            
            // Reset scrolling state after scroll completes
            setTimeout(() => {
              setIsScrollingToForm(false);
            }, 1000);
          });
        });
      }, 300); // Increased delay to let form fully expand
    } else {
      // If we're collapsing (was expanded), immediately reset scroll state
      setIsScrollingToForm(false);
    }
  }, [isFormExpanded, markFormStateInteracted]);

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
    if (!selectedProjectId) return;

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
    smartCleanupOldPages(queryClient, currentPage, selectedProjectId, 'generations');
    
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
        queryKey: ['generations', selectedProjectId, nextPage, itemsPerPage, filters],
        queryFn: () => fetchGenerations(selectedProjectId, itemsPerPage, (nextPage - 1) * itemsPerPage, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['generations', selectedProjectId, nextPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
        smartPreloadImages(cached, 'next', prefetchId, prefetchOperationsRef);
      });
    }

    // Prefetch previous page second (lower priority)
    if (prevPage) {
      queryClient.prefetchQuery({
        queryKey: ['generations', selectedProjectId, prevPage, itemsPerPage, filters],
        queryFn: () => fetchGenerations(selectedProjectId, itemsPerPage, (prevPage - 1) * itemsPerPage, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cachedPrev = queryClient.getQueryData(['generations', selectedProjectId, prevPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
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

  // [Strategic Debug] Final render decision summary
  console.log(`${DEBUG_TAG} === RENDER END #${renderCount.current} ===`, {
    finalDecision: {
      showFormSkeleton: hasValidFalApiKey && isFormExpanded === undefined,
      showGallerySkeleton: isLoadingGenerations && imagesToShow.length === 0,
      renderMainContent: hasValidFalApiKey && isFormExpanded !== undefined
    },
    keyStates: {
      hasValidFalApiKey,
      isFormExpanded,
      formStateReady,
      isLoadingGenerations,
      imagesToShowLength: imagesToShow.length,
      hasGenerationsResponse: !!generationsResponse
    },
    timingSinceMount: `${Date.now() - mountTime.current}ms`
  });

  return (
    <PageFadeIn className="pt-8">

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
      {(() => {
        const showFormSkeleton = hasValidFalApiKey && isFormExpanded === undefined;
        console.log(`${DEBUG_TAG} Render #${renderCount.current} - Form skeleton decision:`, {
          showFormSkeleton,
          hasValidFalApiKey,
          isFormExpanded,
          formStateReady
        });
        return showFormSkeleton;
      })() && (
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
          <div ref={collapsibleContainerRef}>
            <Collapsible 
              open={isFormExpanded} 
              onOpenChange={setIsFormExpanded}
            >
              {/* Keep the trigger always visible - let it scroll naturally */}
              <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className={`${isFormExpanded ? 'w-full justify-between px-6 py-6 hover:bg-accent/30 bg-accent/10 border border-b-0 rounded-t-lg shadow-sm' : 'w-full justify-between p-4 gradient-primary-collapsed rounded-lg'} transition-colors duration-300`}
                    onClick={handleToggleFormExpanded}
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className={`h-4 w-4 ${!isFormExpanded ? 'text-white' : ''}`} />
                      <span className={`font-light flex items-center gap-1 ${!isFormExpanded ? 'text-white' : ''}`}>
                        Image Generation
                        <Sparkles className={`h-3 w-3 animate-pulse ${!isFormExpanded ? 'text-white' : ''}`} />
                      </span>
                    </div>
                    {isFormExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4 text-white" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              <CollapsibleContent>
                <div ref={formContainerRef} className="p-6 border rounded-lg shadow-sm bg-card w-full max-w-full">
                  <ImageGenerationForm
                    ref={imageGenerationFormRef}
                    onGenerate={handleNewGenerate}
                    isGenerating={isGenerating}
                    hasApiKey={hasValidFalApiKey}
                    apiKey={falApiKey}
                    openaiApiKey={openaiApiKey}
                    justQueued={justQueued}
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
                className={`fixed z-50 flex justify-center transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-2`}
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
                  className={`justify-between ${isMobile ? 'p-3 text-sm' : 'p-4'} w-full max-w-2xl gradient-primary-collapsed backdrop-blur-md shadow-xl transition-all duration-300 rounded-lg`}
                  onClick={handleToggleFormExpanded}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-white" />
                    <span className="font-light flex items-center gap-1 text-white">
                      {isMobile ? 'Image Generation' : 'Image Generation'}
                      <Sparkles className="h-3 w-3 text-white animate-pulse" />
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white" />
                </Button>
              </div>
            );
          })()}

          <div ref={galleryRef} className="pt-0 pb-5">
            {/* Show SkeletonGallery on initial load or when filter changes take too long */}
            {(() => {
              const showSkeleton = isLoadingGenerations && imagesToShow.length === 0;
              console.log(`${DEBUG_TAG} Render #${renderCount.current} - Skeleton decision:`, {
                showSkeleton,
                isLoadingGenerations,
                imagesToShowLength: imagesToShow.length,
                hasGenerationsResponse: !!generationsResponse,
                formStateReady,
                isFormExpanded
              });
              return showSkeleton;
            })() ? (
              <SkeletonGallery
                count={20}
                columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 5, '2xl': 5 }}
                showControls={true}
              />
            ) : (
              <div className={isLoadingGenerations && isFilterChange ? 'opacity-60 pointer-events-none transition-opacity duration-200' : ''}>
                <ImageGallery
                images={imagesToShow}
                onDelete={handleDeleteImage}
                onImageSaved={handleImageSaved}
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
                onShotFilterChange={setSelectedShotFilter}
                initialExcludePositioned={excludePositioned}
                onExcludePositionedChange={setExcludePositioned}
                showSearch={true}
                initialSearchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onMediaTypeFilterChange={handleMediaTypeFilterChange}
                initialStarredFilter={starredOnly}
                onStarredFilterChange={setStarredOnly}
                onToolTypeFilterChange={() => {}}
                formAssociatedShotId={formAssociatedShotId}
                onSwitchToAssociatedShot={handleSwitchToAssociatedShot}
                onPrefetchAdjacentPages={handlePrefetchAdjacentPages}
                onCreateShot={handleCreateShot}
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
    </PageFadeIn>
  );
}, () => true); // Always return true since component has no props

export default ImageGenerationToolPage;

