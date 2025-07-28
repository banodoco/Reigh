import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ToolSettingsGate } from "@/shared/components/ToolSettingsGate";
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
import { Settings } from "lucide-react";
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useTaskQueueNotifier } from '@/shared/hooks/useTaskQueueNotifier';
import { useQueryClient } from '@tanstack/react-query';
import { useListPublicResources } from '@/shared/hooks/useResources';

import { useListTasks } from "@/shared/hooks/useTasks";
import { PageFadeIn } from '@/shared/components/transitions';
import { useSearchParams } from 'react-router-dom';
import { ToolPageHeader } from '@/shared/components/ToolPageHeader';
import { useToolPageHeader } from '@/shared/contexts/ToolPageHeaderContext';
import { timeEnd } from '@/shared/lib/logger';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { fetchGenerations } from "@/shared/hooks/useGenerations";
import { getDisplayUrl } from '@/shared/lib/utils';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';

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
  const [isFilterChange, setIsFilterChange] = useState(false);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all'); // Add media type filter state
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [toolTypeFilterEnabled, setToolTypeFilterEnabled] = useState<boolean>(true); // State for the tool type filter checkbox
  const isMobile = useIsMobile();
  
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
  const [searchParams] = useSearchParams();
  const { setHeader, clearHeader } = useToolPageHeader();
  const { currentShotId } = useCurrentShot();

  // Set the header when component mounts and clear when unmounting
  useEffect(() => {
    setHeader(<ToolPageHeader title="Image Generation" />);
    return () => clearHeader();
  }, [setHeader, clearHeader]);

  // Track project tasks to know when they appear in the TasksPane (must be after selectedProjectId)
  const { data: projectTasks } = useListTasks({ projectId: selectedProjectId });
  const { data: shots, isLoading: isLoadingShots, error: shotsError } = useListShots(selectedProjectId);


  const addImageToShotMutation = useAddImageToShot();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const itemsPerPage = isMobile ? 24 : 25;
  const { data: generationsResponse, isLoading: isLoadingGenerations } = useGenerations(
    selectedProjectId, 
    currentPage, 
    itemsPerPage, 
    loadGenerations,
    {
      toolType: toolTypeFilterEnabled ? 'image-generation' : undefined,
      mediaType: mediaTypeFilter, // Use dynamic mediaType instead of hardcoded 'image'
      shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
      excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
      starredOnly
    }
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
  }, [toolTypeFilterEnabled]);

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

  // Handle scrolling to gallery when coming from "View All" in GenerationsPane
  useEffect(() => {
    if (searchParams.get('scrollToGallery') === 'true') {
      // Wait for the form container to be loaded and then scroll to it
      const checkAndScroll = () => {
        if (formContainerRef.current && !isLoadingGenerations) {
          // Scroll to the form container (above the gallery) instead of the gallery itself
          formContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // If not ready yet, try again in a bit
          setTimeout(checkAndScroll, 100);
        }
      };
      
      // Start checking after a small initial delay
      setTimeout(checkAndScroll, 150);
    }
  }, [searchParams, generationsResponse, isLoadingGenerations]);

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

    // Clear existing images and reset to page 1 if needed
    if (restOfFormData.prompts.length * restOfFormData.imagesPerPrompt > 0) {
      setGeneratedImages([]);
      setCurrentPage(1);
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
        await addImageToShotMutation?.mutateAsync({
          shot_id: targetShotInfo.targetShotIdForButton,
          generation_id: generationId,
          imageUrl: imageUrl,
          thumbUrl: thumbUrl,
          project_id: selectedProjectId, 
        });
      }
      setLastAffectedShotId(targetShotInfo.targetShotIdForButton);
      return true;
    } catch (error) {
      console.error("Error adding image to target shot:", error);
      toast.error("Failed to add image to shot.");
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, selectedProjectId, addImageToShotMutation, positionExistingGenerationMutation, setLastAffectedShotId, selectedShotFilter, excludePositioned]);

  const isGenerating = isEnqueuing;

  const scrollPosRef = useRef<number>(0);

  const handleServerPageChange = useCallback((page:number)=>{
    scrollPosRef.current = window.scrollY;
    setIsPageChange(true);
    setCurrentPage(page);
  },[]);

  // Handle media type filter change
  const handleMediaTypeFilterChange = useCallback((newMediaType: 'all' | 'image' | 'video') => {
    setMediaTypeFilter(newMediaType);
    // Page reset is now handled in the useEffect
  }, []);

  // [NavPerf] Stop timers when page has mounted
  useEffect(() => {
    timeEnd('NavPerf', 'PageLoad:/tools/image-generation');
  }, []);

  // Prefetch next and previous pages for smoother navigation
  useEffect(() => {
    if (!selectedProjectId || !loadGenerations) return;

    const filters = { 
      mediaType: mediaTypeFilter,
      shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
      excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
      starredOnly
    };

    const nextPage = currentPage + 1;
    
    queryClient.prefetchQuery({
      queryKey: ['generations', selectedProjectId, nextPage, itemsPerPage, filters],
      queryFn: () => fetchGenerations(selectedProjectId, itemsPerPage, (nextPage - 1) * itemsPerPage, filters),
      staleTime: 30 * 1000,
    }).then(() => {
      const cached = queryClient.getQueryData(['generations', selectedProjectId, nextPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
      cached?.items.forEach(img => {
        const preloadImg = new Image();
        preloadImg.src = getDisplayUrl(img.url);
      });
    });

    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      
      queryClient.prefetchQuery({
        queryKey: ['generations', selectedProjectId, prevPage, itemsPerPage, filters],
        queryFn: () => fetchGenerations(selectedProjectId, itemsPerPage, (prevPage - 1) * itemsPerPage, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        
        const cachedPrev = queryClient.getQueryData(['generations', selectedProjectId, prevPage, itemsPerPage, filters]) as GenerationsPaginatedResponse | undefined;
        cachedPrev?.items.forEach(img => {
          const preloadImg = new Image();
          preloadImg.src = getDisplayUrl(img.url);
        });
      });
    }
  }, [selectedProjectId, currentPage, itemsPerPage, queryClient, loadGenerations, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

  useEffect(()=>{
    if(generationsResponse && isPageChange){
      // restore scroll position only for page changes, not filter changes
      window.scrollTo({top:scrollPosRef.current,behavior:'auto'});
      setIsPageChange(false);
    }
  },[generationsResponse, isPageChange]);

  return (
    <PageFadeIn>
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

      {/* Render only if API key is valid */}
      {hasValidFalApiKey && (
        <>
          <div ref={formContainerRef} className="p-6 border rounded-lg shadow-sm bg-card w-full max-w-full">
            <ToolSettingsGate
              ready={true}
              loadingMessage="Loading image generation settings..."
            >
              <ImageGenerationForm
                ref={imageGenerationFormRef}
                onGenerate={handleNewGenerate}
                isGenerating={isGenerating}
                hasApiKey={hasValidFalApiKey}
                apiKey={falApiKey}
                openaiApiKey={openaiApiKey}
                justQueued={justQueued}
              />
            </ToolSettingsGate>
          </div>

          <div ref={galleryRef} className="mt-2">
            {/* Show SkeletonGallery only on the very first load when no images are available yet.
               During subsequent page changes we keep the existing gallery visible so its
               header/controls do not disappear. */}
            {isLoadingGenerations && imagesToShow.length === 0 ? (
              <SkeletonGallery
                count={20}
                columns={{ base: 2, sm: 3, md: 4, lg: 5 }}
                showControls={true}
              />
            ) : (
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
                initialFilterState={toolTypeFilterEnabled}
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
                onToolTypeFilterChange={setToolTypeFilterEnabled}
              />
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

