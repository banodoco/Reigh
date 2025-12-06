import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Image, LayoutGrid, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { InlineEditView } from '../components/InlineEditView';
import { useGenerations } from '@/shared/hooks/useGenerations';
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

const TOOL_TYPE = 'edit-images';
const TOOL_TYPE_NAME = 'Edit Images';

// Settings interface for last edited media persistence
interface EditImagesUISettings {
  lastEditedMediaId?: string;
}

export default function EditImagesPage() {
  const { selectedProjectId } = useProject();
  const [selectedMedia, setSelectedMedia] = useState<GenerationRow | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<GenerationRow | null>(null); // For viewing results in lightbox
  const [isUploading, setIsUploading] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [showResults, setShowResults] = useState(true);
  const isMobile = useIsMobile();
  const { data: shots } = useListShots(selectedProjectId);
  
  // Track if we've already loaded from settings to prevent re-loading
  const hasLoadedFromSettings = useRef(false);
  
  // Project-level UI settings for persisting last edited media (syncs across devices)
  const { 
    settings: uiSettings, 
    update: updateUISettings,
    isLoading: isUISettingsLoading 
  } = useToolSettings<EditImagesUISettings>('edit-images-ui', { 
    projectId: selectedProjectId,
    enabled: !!selectedProjectId 
  });
  
  // Load last edited image from database settings on mount
  useEffect(() => {
    if (!selectedProjectId || isUISettingsLoading || hasLoadedFromSettings.current) return;
    
    const storedId = uiSettings?.lastEditedMediaId;
    if (storedId && !selectedMedia) {
      hasLoadedFromSettings.current = true;
      // Fetch the generation from the database
      supabase
        .from('generations')
        .select('*')
        .eq('id', storedId)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            setSelectedMedia(data as any);
          } else {
            // Clear invalid stored ID
            updateUISettings('project', { lastEditedMediaId: undefined });
          }
        });
    }
  }, [selectedProjectId, uiSettings?.lastEditedMediaId, isUISettingsLoading, selectedMedia, updateUISettings]);
  
  // Persist selected media ID to database settings (or clear it when media is removed)
  useEffect(() => {
    if (!selectedProjectId || isUISettingsLoading) return;
    
    if (selectedMedia && selectedMedia.id !== uiSettings?.lastEditedMediaId) {
      updateUISettings('project', { lastEditedMediaId: selectedMedia.id });
    } else if (!selectedMedia && uiSettings?.lastEditedMediaId) {
      // Clear the stored ID when media is removed/closed
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
            currentToolType={TOOL_TYPE}
            currentToolTypeName={TOOL_TYPE_NAME}
            itemsPerPage={12}
            offset={(resultsPage - 1) * 12}
            totalCount={(resultsData as any)?.total || 0}
            onServerPageChange={setResultsPage}
            serverPage={resultsPage}
            showDelete={false}
            showDownload={true}
            showShare={false}
            showEdit={false}
            showStar={true}
            showAddToShot={true}
            enableSingleClick={true}
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
      
      {!selectedMedia ? (
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
                    <p className="text-muted-foreground text-xs md:text-base hidden md:block">
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
                 onSelect={(media) => setSelectedMedia(media)} 
               />
              </div>
            </div>
            
            {/* Results Gallery - visible in main view */}
            {renderResultsGallery()}
          </div>
        </div>
      ) : (
        <div className="w-full px-4 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden",
              isEditingOnMobile ? "flex flex-col min-h-[60vh]" : "h-[70vh]"
            )}>
              <InlineEditView 
                media={selectedMedia} 
                onClose={() => setSelectedMedia(null)}
                onImageSaved={async (newUrl, createNew) => {
                  console.log("Image saved:", newUrl, createNew);
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
  const [activeTab, setActiveTab] = useState("gallery");
  const [shotFilter, setShotFilter] = useState<string>("all");
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>("image");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: shots } = useListShots(selectedProjectId);
  const isMobile = useIsMobile();
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
      mediaType: mediaTypeFilter,
      searchTerm: searchTerm.trim() || undefined
    } 
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [shotFilter, searchTerm, mediaTypeFilter]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-2 border-b">
        <TabsList className="w-full justify-start bg-transparent p-0 h-auto gap-6">
          <TabsTrigger 
            value="gallery" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3"
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            All Images
          </TabsTrigger>
          <TabsTrigger 
            value="shots" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3"
          >
            <Image className="w-4 h-4 mr-2" />
            Shots
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="gallery" className="flex-1 overflow-y-auto p-0 m-0 relative pt-4 px-4 md:px-6">
         {isGalleryLoading && !generationsData ? (
            <ReighLoading />
         ) : (
            <ImageGallery 
               images={(generationsData as any)?.items || []}
               onImageClick={(media) => onSelect(media as any)}
               allShots={shots || []}
               currentToolType={TOOL_TYPE}
               currentToolTypeName={TOOL_TYPE_NAME}
               showShotFilter={true}
               initialShotFilter={shotFilter}
               onShotFilterChange={setShotFilter}
               showSearch={true}
               initialSearchTerm={searchTerm}
               onSearchChange={setSearchTerm}
               initialMediaTypeFilter={mediaTypeFilter}
               onMediaTypeFilterChange={setMediaTypeFilter}
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
      </TabsContent>

      <TabsContent value="shots" className="flex-1 overflow-y-auto p-4 m-0">
        <ShotsView onSelect={onSelect} />
      </TabsContent>
    </Tabs>
  );
}

function ShotsView({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading } = useListShots(selectedProjectId);
  
  if (isLoading) return <ReighLoading />;

  return (
    <div className="space-y-8">
      {shots?.map((shot) => (
        <div key={shot.id} className="space-y-3">
           <h3 className="font-medium text-lg flex items-center gap-2">
             {shot.name}
             <span className="text-xs text-muted-foreground font-normal">({shot.images?.length || 0} items)</span>
           </h3>
           <ShotImagesRow images={shot.images} onSelect={onSelect} />
        </div>
      ))}
      {(!shots || shots.length === 0) && (
         <div className="text-center py-10 text-muted-foreground">No shots found.</div>
      )}
    </div>
  );
}

function ShotImagesRow({ images, onSelect }: { images: any[], onSelect: (media: GenerationRow) => void }) {
  if (!images || images.length === 0) return <div className="text-xs text-muted-foreground italic pl-2">No images in shot</div>;

  return (
      <div className="flex gap-3 overflow-x-auto pb-4">
          {images.map(img => (
              <div 
                key={img.id} 
                className="w-32 h-32 flex-shrink-0 relative cursor-pointer rounded overflow-hidden border border-border/50 hover:border-primary"
                onClick={() => onSelect(img)}
              >
                  <img src={img.imageUrl || img.url || img.location} className="w-full h-full object-cover" alt="" />
              </div>
          ))}
      </div>
  );
}
