import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { LayoutGrid, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/types/shots';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { InlineEditView } from '../components/InlineEditView';
import { useGenerations, useDeleteGeneration } from '@/shared/hooks/useGenerations';
import ImageGallery from '@/shared/components/ImageGallery';
import { useListShots } from '@/shared/hooks/useShots';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useGetTask } from '@/shared/hooks/useTasks';
import { deriveInputImages } from '@/shared/components/ImageGallery/utils';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { parseRatio } from '@/shared/lib/aspectRatios';

const TOOL_TYPE = 'edit-images';
const TOOL_TYPE_NAME = 'Edit Images';

// Settings interface for last edited media persistence
interface EditImagesUISettings {
  lastEditedMediaId?: string;
}

export default function EditImagesPage() {
  const { selectedProjectId, projects } = useProject();
  
  // Get project aspect ratio for skeleton sizing
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = selectedProject?.aspectRatio || '16:9';
  const aspectRatioValue = parseRatio(projectAspectRatio);
  const [selectedMedia, setSelectedMedia] = useState<GenerationRow | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<GenerationRow | null>(null); // For viewing results in lightbox
  const [isUploading, setIsUploading] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [showResults, setShowResults] = useState(true);
  const [isLoadingPersistedMedia, setIsLoadingPersistedMedia] = useState(false);
  const isMobile = useIsMobile();
  const { data: shots } = useListShots(selectedProjectId);
  
  // Delete mutation for gallery items
  const deleteGenerationMutation = useDeleteGeneration();
  const handleDeleteGeneration = useCallback((id: string) => {
    deleteGenerationMutation.mutate(id);
  }, [deleteGenerationMutation]);
  
  // Track if we've already loaded from settings to prevent re-loading
  const hasLoadedFromSettings = useRef(false);
  // Track if user has explicitly closed the editor (vs initial mount state)
  const userClosedEditor = useRef(false);
  
  // Project-level UI settings for persisting last edited media (syncs across devices)
  const { 
    settings: uiSettings, 
    update: updateUISettings,
    isLoading: isUISettingsLoading 
  } = useToolSettings<EditImagesUISettings>('edit-images-ui', { 
    projectId: selectedProjectId,
    enabled: !!selectedProjectId 
  });
  
  // Track preloaded image URLs to avoid flash on navigation
  const preloadedImageRef = useRef<string | null>(null);
  
  // Preload image helper - warm up the browser cache
  const preloadImage = (url: string) => {
    if (!url || preloadedImageRef.current === url) return;
    const img = new Image();
    img.src = url;
    preloadedImageRef.current = url;
  };
  
  // Load last edited image from database settings on mount
  useEffect(() => {
    if (!selectedProjectId || isUISettingsLoading || hasLoadedFromSettings.current) return;
    
    const storedId = uiSettings?.lastEditedMediaId;
    hasLoadedFromSettings.current = true; // Mark as attempted even if no stored ID
    
    if (storedId && !selectedMedia) {
      setIsLoadingPersistedMedia(true);
      // Fetch the generation from the database
      supabase
        .from('generations')
        .select('*')
        .eq('id', storedId)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            // Preload the image before showing the view to prevent flash
            const imageUrl = (data as any).location || (data as any).thumbnail_url;
            if (imageUrl) preloadImage(imageUrl);
            setSelectedMedia(data as any);
          } else {
            // Clear invalid stored ID
            updateUISettings('project', { lastEditedMediaId: undefined });
          }
          setIsLoadingPersistedMedia(false);
        });
    }
  }, [selectedProjectId, uiSettings?.lastEditedMediaId, isUISettingsLoading, selectedMedia, updateUISettings]);

  // Persist selected media ID to database settings (or clear it when media is removed)
  useEffect(() => {
    if (!selectedProjectId || isUISettingsLoading || !hasLoadedFromSettings.current) return;
    
    if (selectedMedia && selectedMedia.id !== uiSettings?.lastEditedMediaId) {
      updateUISettings('project', { lastEditedMediaId: selectedMedia.id });
      userClosedEditor.current = false; // Reset close flag when new media selected
    } else if (!selectedMedia && uiSettings?.lastEditedMediaId && userClosedEditor.current) {
      // Only clear when user explicitly closed the editor, not on initial mount
      updateUISettings('project', { lastEditedMediaId: undefined });
    }
  }, [selectedMedia?.id, selectedProjectId, isUISettingsLoading, uiSettings?.lastEditedMediaId, updateUISettings]);
  
  // Fetch edit variants created by this tool
  const {
    data: resultsData,
    isLoading: isResultsLoading,
  } = useGenerations(
    selectedProjectId || null,
    resultsPage,
    12,
    true,
    {
      variantsOnly: true, // Fetch edit variants from generation_variants table
      toolType: TOOL_TYPE, // Filter to only show variants created by edit-images tool
    }
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!selectedProjectId) {
      toast.error("Please select a project first");
      return;
    }

    setIsUploading(true);
    try {
      const file = files[0];
      
      // Generate and upload thumbnail
      let publicUrl = '';
      let thumbnailUrl = '';
      
      try {
        // Get current user ID for storage path
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error('User not authenticated');
        }
        const userId = session.user.id;

        // Generate thumbnail client-side
        const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
        console.log('[EditImages] Thumbnail generated:', {
          width: thumbnailResult.thumbnailWidth,
          height: thumbnailResult.thumbnailHeight,
          size: thumbnailResult.thumbnailBlob.size
        });
        
        // Upload both main image and thumbnail
        const uploadResult = await uploadImageWithThumbnail(file, thumbnailResult.thumbnailBlob, userId);
        publicUrl = uploadResult.imageUrl;
        thumbnailUrl = uploadResult.thumbnailUrl;
        
        console.log('[EditImages] Upload complete - Image:', publicUrl, 'Thumbnail:', thumbnailUrl);
      } catch (thumbnailError) {
        console.warn('[EditImages] Client-side thumbnail generation failed:', thumbnailError);
        // Fallback to original upload flow without thumbnail
        publicUrl = await uploadImageToStorage(file, 3);
        thumbnailUrl = publicUrl; // Use main image as fallback
      }

      const { data: generation, error: dbError } = await supabase
        .from('generations')
        .insert({
          project_id: selectedProjectId,
          location: publicUrl,
          thumbnail_url: thumbnailUrl,
          type: 'image',
          params: {
            prompt: 'Uploaded image',
            status: 'completed',
            is_uploaded: true,
            width: 1024,
            height: 1024,
            model: 'upload'
          }
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setSelectedMedia(generation as any);
      // Toast removed as per user request

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const isEditingOnMobile = selectedMedia && isMobile;

  // Get results items for navigation
  const resultsItems = (resultsData as any)?.items || [];
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);

  // Store the variant ID separately for lightbox
  const [lightboxVariantId, setLightboxVariantId] = useState<string | null>(null);

  // Transform variant data to GenerationRow format for lightbox
  const transformVariantToGeneration = (media: any): GenerationRow => {
    return {
      id: media.metadata?.generation_id || media.id,
      location: media.url,
      thumbnail_url: media.thumbUrl,
      type: 'image',
      created_at: media.createdAt,
      params: {
        prompt: media.metadata?.prompt,
        tool_type: media.metadata?.tool_type,
        variant_type: media.metadata?.variant_type,
        variant_id: media.id,
      },
      project_id: selectedProjectId || '',
      starred: media.starred || false,
    } as GenerationRow;
  };

  const handleResultClick = (media: any) => {
    const index = resultsItems.findIndex((item: any) => item.id === media.id);
    setLightboxIndex(index);
    setLightboxVariantId(media.id); // Store the variant ID to pre-select it
    setLightboxMedia(transformVariantToGeneration(media));
  };

  const handleLightboxNext = () => {
    if (lightboxIndex < resultsItems.length - 1) {
      const nextIndex = lightboxIndex + 1;
      const nextItem = resultsItems[nextIndex];
      setLightboxIndex(nextIndex);
      setLightboxVariantId(nextItem.id);
      setLightboxMedia(transformVariantToGeneration(nextItem));
    }
  };

  const handleLightboxPrevious = () => {
    if (lightboxIndex > 0) {
      const prevIndex = lightboxIndex - 1;
      const prevItem = resultsItems[prevIndex];
      setLightboxIndex(prevIndex);
      setLightboxVariantId(prevItem.id);
      setLightboxMedia(transformVariantToGeneration(prevItem));
    }
  };

  const handleLightboxClose = () => {
    setLightboxMedia(null);
    setLightboxIndex(-1);
    setLightboxVariantId(null);
  };

  // Get task ID from current lightbox variant for task details
  const currentTaskId = useMemo(() => {
    if (lightboxIndex >= 0 && resultsItems[lightboxIndex]) {
      const item = resultsItems[lightboxIndex];
      // Task ID is stored in metadata.source_task_id (from variant params)
      return item.metadata?.source_task_id || null;
    }
    return null;
  }, [lightboxIndex, resultsItems]);

  // Fetch task data for the current lightbox item
  const { data: taskData, isLoading: isLoadingTask, error: taskError } = useGetTask(currentTaskId);

  // Derive input images from task params
  const inputImages = useMemo(() => {
    if (!taskData?.params) return [];
    return deriveInputImages(taskData.params as Record<string, unknown>);
  }, [taskData]);

  // Helper to render the results gallery (used in both views)
  const renderResultsGallery = () => {
    if (!(resultsData as any)?.items?.length) return null;
    
    return (
      <div className="mt-6 pb-6">
        <button 
          onClick={() => setShowResults(!showResults)}
          className="flex items-center gap-2 text-lg font-medium mb-4 hover:text-primary transition-colors"
        >
          Edited Images
          {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="text-sm text-muted-foreground font-normal">
            ({(resultsData as any)?.total || 0})
          </span>
        </button>
        
        {showResults && (
          <ImageGallery
            images={(resultsData as any)?.items || []}
            allShots={shots || []}
            onImageClick={handleResultClick}
            itemsPerPage={12}
            offset={(resultsPage - 1) * 12}
            totalCount={(resultsData as any)?.total || 0}
            onServerPageChange={setResultsPage}
            serverPage={resultsPage}
            onDelete={handleDeleteGeneration}
            isDeleting={deleteGenerationMutation.isPending ? deleteGenerationMutation.variables as string : null}
            showDownload={true}
            showShare={false}
            showEdit={false}
            showStar={true}
            showAddToShot={true}
            enableSingleClick={true}
            initialToolTypeFilter={false}
            hideMediaTypeFilter={true}
            hideBottomPagination={true}
          />
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "w-full flex flex-col",
      isEditingOnMobile ? "min-h-[calc(100dvh-96px)]" : "min-h-[calc(100dvh-96px)]"
    )}>
      {/* Header */}
      <div className="px-4 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Edit Images</h1>
      </div>
      
      {/* Show skeleton when loading settings, loading persisted media, OR we have a stored ID but no media yet */}
      {(isUISettingsLoading || isLoadingPersistedMedia || (uiSettings?.lastEditedMediaId && !selectedMedia)) && (
        <div className="w-full px-4 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden bg-black",
              isEditingOnMobile ? "flex flex-col min-h-[60vh]" : "h-[70vh]"
            )}>
              {isMobile ? (
                // Mobile: Match InlineEditView mobile layout (45dvh height)
                <div 
                  className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
                  style={{ height: '45dvh' }}
                >
                  <Skeleton 
                    className="rounded-lg"
                    style={{ 
                      aspectRatio: aspectRatioValue,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: aspectRatioValue >= 1 ? '90%' : 'auto',
                      height: aspectRatioValue >= 1 ? 'auto' : '90%'
                    }} 
                  />
                </div>
              ) : (
                // Desktop: Match InlineEditView desktop layout (60% width, 100% height)
                <div className="w-full h-full flex bg-transparent overflow-hidden">
                  <div 
                    className="flex-1 flex items-center justify-center relative bg-black rounded-l-xl overflow-hidden"
                    style={{ width: '60%', height: '100%' }}
                  >
                    <Skeleton 
                      className="rounded-lg"
                      style={{ 
                        aspectRatio: aspectRatioValue,
                        maxWidth: '90%',
                        maxHeight: '90%',
                        width: aspectRatioValue >= 1 ? '80%' : 'auto',
                        height: aspectRatioValue >= 1 ? 'auto' : '80%'
                      }} 
                    />
                  </div>
                  {/* Right panel skeleton for controls */}
                  <div className="w-[40%] bg-background border-l border-border p-4">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {!selectedMedia && !isUISettingsLoading && !isLoadingPersistedMedia && !uiSettings?.lastEditedMediaId && (
        <div className="w-full px-4 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {/* Selection UI - reduced height */}
            <div className="flex flex-col md:flex-row rounded-2xl overflow-hidden" style={{ height: isMobile ? '60vh' : '65vh' }}>
              {/* Left Panel - Placeholder */}
              <div 
                className="relative flex items-center justify-center bg-black w-full h-[30%] md:w-[60%] md:h-full md:flex-1"
              >
               <div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 p-6 md:p-8 flex flex-col items-center justify-center space-y-4 md:space-y-6 max-w-md mx-4">
                  <div className="text-center space-y-1 md:space-y-2">
                    <p className="text-muted-foreground text-xs md:hidden">
                      Select or upload an image
                    </p>
                    <p className="text-muted-foreground text-base hidden md:block">
                      Select an image from the right or upload a new one to start editing.
                    </p>
                  </div>

                  <div className="relative w-full max-w-xs">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <Button variant="outline" size="lg" className="w-full gap-2" disabled={isUploading}>
                      <Upload className="w-4 h-4" />
                      {isUploading ? "Uploading..." : "Upload Image"}
                    </Button>
                  </div>
               </div>
            </div>

            {/* Right Panel - Selection UI */}
            <div 
              className={cn(
                "bg-background border-t md:border-t-0 md:border-l border-border overflow-hidden relative z-[60] flex flex-col w-full h-[70%] md:w-[40%] md:h-full"
              )}
            >
               <ImageSelectionModal 
                 onSelect={(media) => {
                   // Preload the image before showing edit view to prevent flash
                   const imageUrl = (media as any).location || (media as any).url || (media as any).thumbnail_url;
                   if (imageUrl) preloadImage(imageUrl);
                   setSelectedMedia(media);
                 }} 
               />
              </div>
            </div>
            
            {/* Results Gallery - visible in main view */}
            {renderResultsGallery()}
          </div>
        </div>
      )}
      
      {selectedMedia && (
        <div className="w-full px-4 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden",
              isEditingOnMobile ? "flex flex-col min-h-[60vh]" : "h-[70vh]"
            )}>
              <InlineEditView 
                media={selectedMedia} 
                onClose={() => {
                  userClosedEditor.current = true;
                  setSelectedMedia(null);
                }}
                onNavigateToGeneration={async (generationId) => {
                  try {
                    const { data, error } = await supabase
                      .from('generations')
                      .select('*')
                      .eq('id', generationId)
                      .single();
                    
                    if (data && !error) {
                      setSelectedMedia(data as any);
                    }
                  } catch (e) {
                    console.error("Failed to navigate to generation", e);
                  }
                }}
              />
            </div>
            
            {/* Results Gallery - also visible when editing */}
            {renderResultsGallery()}
          </div>
        </div>
      )}
      
      {/* MediaLightbox for viewing results */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          onClose={handleLightboxClose}
          toolTypeOverride="edit-images"
          starred={lightboxMedia.starred ?? false}
          showMagicEdit={true}
          showNavigation={true}
          allShots={shots || []}
          onNext={lightboxIndex < resultsItems.length - 1 ? handleLightboxNext : undefined}
          onPrevious={lightboxIndex > 0 ? handleLightboxPrevious : undefined}
          hasNext={lightboxIndex < resultsItems.length - 1}
          hasPrevious={lightboxIndex > 0}
          showTaskDetails={true}
          taskDetailsData={{
            task: taskData,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: currentTaskId,
          }}
          initialVariantId={lightboxVariantId || undefined}
        />
      )}
    </div>
  );
}

function ImageSelectionModal({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  const { selectedProjectId } = useProject();
  const [shotFilter, setShotFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: shots } = useListShots(selectedProjectId);
  const itemsPerPage = 15;
  
  const {
    data: generationsData,
    isLoading: isGalleryLoading,
  } = useGenerations(
    selectedProjectId || null,
    currentPage,
    itemsPerPage,
    true,
    {
      shotId: shotFilter === 'all' ? undefined : shotFilter,
      mediaType: 'image', // Only show images
      searchTerm: searchTerm.trim() || undefined
    } 
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [shotFilter, searchTerm]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-4 pb-2 border-b">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <LayoutGrid className="w-4 h-4" />
          Select an Image
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-0 m-0 relative pt-4 px-4 md:px-6">
         {isGalleryLoading && !generationsData ? (
            <ReighLoading />
         ) : (
            <ImageGallery 
               images={(generationsData as any)?.items || []}
               onImageClick={(media) => onSelect(media as any)}
               allShots={shots || []}
               showShotFilter={true}
               initialToolTypeFilter={false}
               initialShotFilter={shotFilter}
               onShotFilterChange={setShotFilter}
               initialExcludePositioned={false}
               showSearch={true}
               initialSearchTerm={searchTerm}
               onSearchChange={setSearchTerm}
               initialMediaTypeFilter="image"
               hideTopFilters={true}
               hideShotNotifier={true}
               itemsPerPage={itemsPerPage}
               offset={(currentPage - 1) * itemsPerPage}
               totalCount={(generationsData as any)?.total || 0}
               onServerPageChange={setCurrentPage}
               serverPage={currentPage}
               showDelete={false}
               showDownload={false}
               showShare={false}
               showEdit={false}
               showStar={false}
               showAddToShot={false}
               enableSingleClick={true}
               hideBottomPagination={true}
            />
         )}
      </div>
    </div>
  );
}

