import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

import ImageGenerationForm, { ImageGenerationFormHandles, PromptEntry } from "../components/ImageGenerationForm";
import { ImageGallery, GeneratedImageWithMetadata, DisplayableMetadata, MetadataLora } from "@/shared/components/ImageGallery";
import SettingsModal from "@/shared/components/SettingsModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { useListShots, useAddImageToShot, usePositionExistingGenerationInShot } from "@/shared/hooks/useShots";
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
import { preloadImagesWithCancel, initializePrefetchOperations, cleanupOldPaginationCache, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, ChevronRight, Sparkles, Settings2 } from 'lucide-react';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { usePanes } from '@/shared/contexts/PanesContext';

// Remove unnecessary environment detection - tool should work in all environments

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]



const ImageGenerationToolPage: React.FC = React.memo(() => {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageWithMetadata[]>([]);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUpscalingImageId, setIsUpscalingImageId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [loadGenerations, setLoadGenerations] = useState(false);
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
  const [isFormExpanded, setIsFormExpanded] = useState<boolean | undefined>(undefined); // No default - wait for persistence
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
  useListPublicResources('lora');
  
  // Use the new task queue notifier hook
  const { selectedProjectId } = useProject();
  const { enqueueTasks, isEnqueuing, justQueued } = useTaskQueueNotifier({ 
    projectId: selectedProjectId,
    suppressPerTaskToast: true 
  });

  // Always use hooks - no environment-based disabling
  const { apiKeys, getApiKey } = useApiKeys();
  const imageGenerationFormRef = useRef<ImageGenerationFormHandles>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const collapsibleContainerRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const { currentShotId } = useCurrentShot();

  // Removed projectTasks tracking - was causing performance issues with 1000+ tasks
  // TaskQueueNotifier now handles task tracking internally
  const { data: shots, isLoading: isLoadingShots, error: shotsError } = useListShots(selectedProjectId);

  // Persistent state for form collapse
  const { ready: formStateReady, markAsInteracted: markFormStateInteracted } = usePersistentToolState(
    'image-generation-ui',
    { projectId: selectedProjectId },
    {
      isFormExpanded: [isFormExpanded, setIsFormExpanded],
    }
  );



  // Handle URL parameter to override saved state when specified (run only once)
  useEffect(() => {
    const formCollapsedParam = searchParams.get('formCollapsed');
    
    // Only run this logic once when the component mounts and state is ready
    if (formStateReady && formCollapsedParam === 'true') {
      setIsFormExpanded(false);
      markFormStateInteracted(); // Save this preference
      
      // Clear the URL parameter after applying it
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('formCollapsed');
      const newUrl = newSearchParams.toString() 
        ? `${window.location.pathname}?${newSearchParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
    // Set default only if no saved state exists and no URL param
    else if (formStateReady && isFormExpanded === undefined && !formCollapsedParam) {
      setIsFormExpanded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formStateReady]); // Only depend on formStateReady to run once when ready


  const addImageToShotMutation = useAddImageToShot();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const itemsPerPage = isMobile ? 24 : 25;
  const generationsFilters = {
    toolType: 'image-generation', // Always true
    mediaType: mediaTypeFilter, // Use dynamic mediaType instead of hardcoded 'image'
    shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
    excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
    starredOnly
  };
  
  // Debug logging removed for performance
  
  const { data: generationsResponse, isLoading: isLoadingGenerations } = useGenerations(
    selectedProjectId, 
    currentPage, 
    itemsPerPage, 
    loadGenerations,
    generationsFilters
  );
  const deleteGenerationMutation = useDeleteGeneration();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();

  const queryClient = useQueryClient();

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadGenerations(true);
    }, 300); // Delay fetching to allow for page transition
    return () => clearTimeout(timer);
  }, []);

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

  const isGenerating = isEnqueuing;

  const scrollPosRef = useRef<number>(0);

  const handleServerPageChange = useCallback((page: number, fromBottom?: boolean) => {
    if (!fromBottom) {
      scrollPosRef.current = window.scrollY;
    }
    setIsPageChange(true);
    setIsPageChangeFromBottom(!!fromBottom);
    setCurrentPage(page);
    // Clear existing images to show immediate loading feedback
    setGeneratedImages([]);
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

  // Handle toggling the form expand/collapse state
  const handleToggleFormExpanded = useCallback(() => {
    const wasExpanded = isFormExpanded === true;
    setIsFormExpanded(prev => prev !== true); // Explicitly toggle to boolean
    markFormStateInteracted();

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
    }
  }, [isFormExpanded, markFormStateInteracted]);

  // Effect for sticky header
  useEffect(() => {
    const collapsibleDiv = collapsibleContainerRef.current;
    let throttleTimer: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (throttleTimer) return; // Throttle to prevent excessive calls
      
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        
        if (collapsibleDiv) {
          const rect = collapsibleDiv.getBoundingClientRect();
          // Sticky when the top of the container is scrolled past the header
          const headerHeight = isMobile ? 150 : 96; // Match actual header heights
          // Account for header height when determining if we've scrolled past
          const shouldBeSticky = rect.top < headerHeight;
          
          // Only update state if it actually changed
          if (shouldBeSticky !== isSticky) {
            setIsSticky(shouldBeSticky);
          }
        }
      }, 16); // ~60fps throttling
    };

    // Also check on mount
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
    };
  }, [isFormExpanded, isMobile, isSticky]);

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
    if (!selectedProjectId || !loadGenerations) return;

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
    cleanupOldPaginationCache(queryClient, currentPage, selectedProjectId, 10, 'generations');
    
    // Trigger image garbage collection every 10 pages to free browser memory
    if (currentPage % 10 === 0) {
      triggerImageGarbageCollection();
    }

    const filters = { 
      mediaType: mediaTypeFilter,
      shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
      excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
      starredOnly
    };

    // Using centralized preload function from shared hooks

    // Prefetch next page first (higher priority)
    if (nextPage) {
      queryClient.prefetchQuery({
        queryKey: ['generations', selectedProjectId, nextPage, itemsPerPage, filters],
        queryFn: () => fetchGenerations(selectedProjectId, itemsPerPage, (nextPage - 1) * itemsPerPage, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['generations', selectedProjectId, nextPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
        preloadImagesWithCancel(cached, 'next', prefetchId, prefetchOperationsRef);
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
        preloadImagesWithCancel(cachedPrev, 'prev', prefetchId, prefetchOperationsRef);
      });
    }
  }, [selectedProjectId, itemsPerPage, queryClient, loadGenerations, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

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

  return (
    <PageFadeIn>
      <ToolPageHeader title="Image Generation" />
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
          <div ref={collapsibleContainerRef}>
            <Collapsible 
              open={isFormExpanded} 
              onOpenChange={setIsFormExpanded}
            >
              {/* This trigger is only visible when the form is expanded OR when it's collapsed but not sticky */}
              {!(!isFormExpanded && isSticky) && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className={`${isFormExpanded ? 'w-full justify-between p-4 mb-4 hover:bg-accent/50' : 'w-full justify-between p-4 mb-4 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 border border-blue-400/40 hover:from-blue-500/30 hover:to-pink-500/30'} transition-colors duration-300`}
                    onClick={handleToggleFormExpanded}
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      <span className="font-medium flex items-center gap-1">
                        Image Generation Settings
                        {!isFormExpanded && <Sparkles className="h-3 w-3 text-blue-400 animate-pulse" />}
                      </span>
                    </div>
                    {isFormExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              )}
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

          {/* Sticky form toggle button (only when collapsed and scrolled past) */}
          {(hasValidFalApiKey && isFormExpanded === false && (isSticky || isScrollingToForm)) && (() => {
            // Calculate positioning based on header and panes
            const headerHeight = isMobile ? 150 : 96; // Mobile header adjusted to 150px, desktop is 96px (h-24)
            const topPosition = headerHeight + 12; // Add 12px gap below header
            
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
                }}
              >
                <Button
                  variant="ghost"
                  className={`justify-between ${isMobile ? 'p-3 text-sm' : 'p-4'} w-full max-w-2xl bg-gradient-to-r from-blue-500/60 via-purple-500/60 to-pink-500/60 border border-blue-400/80 hover:from-blue-500/70 hover:to-pink-500/70 backdrop-blur-md shadow-xl transition-all duration-300 rounded-lg`}
                  onClick={handleToggleFormExpanded}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    <span className="font-medium flex items-center gap-1">
                      {isMobile ? 'Image Settings' : 'Image Generation Settings'}
                      <Sparkles className="h-3 w-3 text-blue-400 animate-pulse" />
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            );
          })()}

          <div ref={galleryRef} className="mt-2">
            {/* Show SkeletonGallery on initial load or when filter changes take too long */}
            {isLoadingGenerations && imagesToShow.length === 0 ? (
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
});

export default ImageGenerationToolPage;

