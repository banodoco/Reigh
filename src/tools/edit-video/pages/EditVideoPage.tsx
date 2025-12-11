import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { LayoutGrid, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/types/shots';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { InlineEditVideoView } from '../components/InlineEditVideoView';
import { useGenerations } from '@/shared/hooks/useGenerations';
import ImageGallery from '@/shared/components/ImageGallery';
import { useListShots } from '@/shared/hooks/useShots';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { extractVideoPosterFrame } from '@/shared/utils/videoPosterExtractor';
import MediaLightbox from '@/shared/components/MediaLightbox/MediaLightboxRefactored';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { parseRatio } from '@/shared/lib/aspectRatios';

const TOOL_TYPE = 'edit-video';

// Settings interface for last edited media persistence
interface EditVideoUISettings {
  lastEditedMediaId?: string;
  lastEditedMediaSegments?: PortionSelection[];
}

export default function EditVideoPage() {
  const { selectedProjectId, projects } = useProject();
  
  // Get project aspect ratio for skeleton sizing
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = selectedProject?.aspectRatio || '16:9';
  const aspectRatioValue = parseRatio(projectAspectRatio);
  const [selectedMedia, setSelectedMedia] = useState<GenerationRow | null>(null);
  const [savedSegments, setSavedSegments] = useState<PortionSelection[] | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [showResults, setShowResults] = useState(true);
  const [isLoadingPersistedMedia, setIsLoadingPersistedMedia] = useState(false);
  const isMobile = useIsMobile();
  const { data: shots } = useListShots(selectedProjectId);
  
  // Track if we've already loaded from settings to prevent re-loading
  const hasLoadedFromSettings = useRef(false);
  // Track if user has explicitly closed the editor (vs initial mount state)
  const userClosedEditor = useRef(false);
  
  // Project-level UI settings for persisting last edited media (syncs across devices)
  const { 
    settings: uiSettings, 
    update: updateUISettings,
    isLoading: isUISettingsLoading 
  } = useToolSettings<EditVideoUISettings>('edit-video-ui', { 
    projectId: selectedProjectId,
    enabled: !!selectedProjectId 
  });
  
  // Track preloaded video URLs to avoid flash on navigation
  const preloadedVideoRef = useRef<string | null>(null);
  
  // Preload video poster helper - warm up the browser cache
  const preloadVideoPoster = (posterUrl: string | undefined, videoUrl: string | undefined) => {
    const urlToPreload = posterUrl || videoUrl;
    if (!urlToPreload || preloadedVideoRef.current === urlToPreload) return;
    const img = new Image();
    img.src = urlToPreload;
    preloadedVideoRef.current = urlToPreload;
  };
  
  // Load last edited video from database settings on mount
  useEffect(() => {
    if (!selectedProjectId || isUISettingsLoading || hasLoadedFromSettings.current) return;
    
    const storedId = uiSettings?.lastEditedMediaId;
    const storedSegments = uiSettings?.lastEditedMediaSegments;
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
            // Preload the poster/thumbnail before showing the view
            const posterUrl = (data as any).thumbnail_url;
            const videoUrl = (data as any).location;
            preloadVideoPoster(posterUrl, videoUrl);
            setSelectedMedia(data as any);
            // Also restore saved segments if they exist
            if (storedSegments && storedSegments.length > 0) {
              setSavedSegments(storedSegments);
            }
          } else {
            // Clear invalid stored ID and segments
            updateUISettings('project', { lastEditedMediaId: undefined, lastEditedMediaSegments: undefined });
          }
          setIsLoadingPersistedMedia(false);
        });
    }
  }, [selectedProjectId, uiSettings?.lastEditedMediaId, uiSettings?.lastEditedMediaSegments, isUISettingsLoading, selectedMedia, updateUISettings]);
  
  // Persist selected media ID to database settings (or clear it when media is removed)
  useEffect(() => {
    if (!selectedProjectId || isUISettingsLoading || !hasLoadedFromSettings.current) return;
    
    if (selectedMedia && selectedMedia.id !== uiSettings?.lastEditedMediaId) {
      updateUISettings('project', { lastEditedMediaId: selectedMedia.id });
      userClosedEditor.current = false; // Reset close flag when new media selected
    } else if (!selectedMedia && uiSettings?.lastEditedMediaId && userClosedEditor.current) {
      // Only clear when user explicitly closed the editor, not on initial mount
      updateUISettings('project', { lastEditedMediaId: undefined, lastEditedMediaSegments: undefined });
    }
  }, [selectedMedia?.id, selectedProjectId, isUISettingsLoading, uiSettings?.lastEditedMediaId, updateUISettings]);
  
  // Callback to save segments when they change in InlineEditVideoView
  const handleSegmentsChange = useCallback((segments: PortionSelection[]) => {
    if (!selectedProjectId || isUISettingsLoading) return;
    updateUISettings('project', { lastEditedMediaSegments: segments });
  }, [selectedProjectId, isUISettingsLoading, updateUISettings]);
  
  // Lightbox state
  const [isLightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxInitialMedia, setLightboxInitialMedia] = useState<GenerationRow | null>(null);
  const [lightboxVariantId, setLightboxVariantId] = useState<string | null>(null);

  // Transform variant data to GenerationRow format for lightbox (using parent generation id)
  const transformVariantToGeneration = useCallback((media: any): GenerationRow => {
    return {
      id: media.metadata?.generation_id || media.id,
      location: media.url,
      thumbnail_url: media.thumbUrl,
      type: 'video',
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
  }, [selectedProjectId]);
  
  // Fetch results generated by this tool (video variants)
  const {
    data: resultsData,
    isLoading: isResultsLoading,
  } = useGenerations(
    selectedProjectId || null,
    resultsPage,
    12,
    true,
    {
      variantsOnly: true, // Fetch from generation_variants table
      toolType: TOOL_TYPE, // Only show variants created by edit-video tool
      mediaType: 'video', // Only show video variants
      parentsOnly: true, // Exclude child variants
    }
  );
  
  // All results for lightbox navigation (memoized to prevent callback re-creation)
  const allResults = useMemo(() => (resultsData as any)?.items || [], [resultsData]);
  
  // Navigate to previous/next in lightbox
  const handleNavigateLightbox = useCallback((direction: 'prev' | 'next') => {
    if (!lightboxInitialMedia || allResults.length === 0) return;
    // Find by variant ID since lightboxInitialMedia.id is the parent generation id
    const currentIndex = allResults.findIndex((m: any) => m.id === lightboxVariantId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'prev' 
      ? (currentIndex - 1 + allResults.length) % allResults.length
      : (currentIndex + 1) % allResults.length;
    const newMedia = allResults[newIndex];
    setLightboxVariantId(newMedia.id);
    setLightboxInitialMedia(transformVariantToGeneration(newMedia));
  }, [lightboxInitialMedia, allResults, lightboxVariantId, transformVariantToGeneration]);

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
      
      if (!file.type.startsWith('video/')) {
        toast.error("Please upload a video file");
        return;
      }
      
      // Get current user ID for storage path
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      const userId = session.user.id;

      // Extract poster frame from video
      let posterUrl = '';
      try {
        const posterBlob = await extractVideoPosterFrame(file);
        const posterFileName = `edit-video/${userId}/${Date.now()}-poster.jpg`;
        const { error: posterError } = await supabase.storage
          .from('image_uploads')
          .upload(posterFileName, posterBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/jpeg'
          });
        
        if (!posterError) {
          const { data: { publicUrl } } = supabase.storage
            .from('image_uploads')
            .getPublicUrl(posterFileName);
          posterUrl = publicUrl;
        }
      } catch (posterError) {
        console.warn('[EditVideo] Poster extraction failed:', posterError);
      }
      
      // Upload video
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `edit-video/${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('image_uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);

      const { data: generation, error: dbError } = await supabase
        .from('generations')
        .insert({
          project_id: selectedProjectId,
          location: videoUrl,
          thumbnail_url: posterUrl || videoUrl,
          type: 'video',
          params: {
            prompt: 'Uploaded video',
            status: 'completed',
            is_uploaded: true,
            model: 'upload'
          }
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setSelectedMedia(generation as any);

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload video: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const isEditingOnMobile = selectedMedia && isMobile;

  return (
    <div className={cn(
      "w-full flex flex-col",
      isEditingOnMobile ? "min-h-[calc(100dvh-96px)]" : "h-[calc(100dvh-96px)]"
    )}>
      {/* Header */}
      <div className="px-4 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Edit Videos</h1>
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
                // Mobile: Match InlineEditVideoView mobile stacked layout
                <div className="w-full flex flex-col bg-transparent">
                  <div 
                    className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
                    style={{ height: '35vh' }}
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
                  {/* Timeline skeleton */}
                  <div className="p-4 bg-background">
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                </div>
              ) : (
                // Desktop: Match InlineEditVideoView desktop layout (flex-1 + w-[400px])
                <div className="w-full h-full flex flex-row bg-transparent overflow-hidden">
                  {/* Left side: Video + Timeline stacked */}
                  <div className="flex-1 flex flex-col min-h-0 h-full">
                    {/* Video area */}
                    <div className="relative flex items-center justify-center bg-zinc-900 overflow-hidden flex-shrink rounded-t-lg p-4 pt-24">
                      <Skeleton 
                        className="rounded-lg"
                        style={{ 
                          aspectRatio: aspectRatioValue,
                          maxWidth: '90%',
                          maxHeight: '40vh',
                          width: aspectRatioValue >= 1 ? '80%' : 'auto',
                          height: aspectRatioValue >= 1 ? 'auto' : '80%'
                        }} 
                      />
                    </div>
                    {/* Spacer */}
                    <div className="h-4 bg-zinc-900" />
                    {/* Timeline skeleton */}
                    <div className="bg-zinc-900 px-4 pt-3 pb-4 rounded-b-lg flex-shrink-0">
                      <Skeleton className="h-16 w-full rounded-lg" />
                      <div className="flex justify-center mt-2">
                        <Skeleton className="h-8 w-32" />
                      </div>
                    </div>
                  </div>
                  {/* Right panel skeleton for controls - fixed 400px width */}
                  <div className="w-[400px] bg-background border-l border-border p-4 overflow-y-auto">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-16 w-full" />
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
            <div className="flex flex-col md:flex-row rounded-2xl overflow-hidden" style={{ height: isMobile ? '60vh' : '65vh' }}>
              {/* Left Panel - Placeholder */}
              <div 
                className="relative flex items-center justify-center bg-black w-full h-[30%] md:w-[60%] md:h-full md:flex-1"
              >
                 <div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 p-6 md:p-8 flex flex-col items-center justify-center space-y-4 md:space-y-6 max-w-md mx-4">
                  <div className="text-center space-y-1 md:space-y-2">
                    <p className="text-muted-foreground text-xs md:hidden">
                      Select or upload a video
                    </p>
                    <p className="text-muted-foreground text-base hidden md:block">
                      Select a video from the right or upload a new one to regenerate portions.
                    </p>
                  </div>

                  <div className="relative w-full max-w-xs">
                    <input
                      type="file"
                      accept="video/*"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <Button variant="outline" size="lg" className="w-full gap-2" disabled={isUploading}>
                      <Upload className="w-4 h-4" />
                      {isUploading ? "Uploading..." : "Upload Video"}
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
                 <VideoSelectionPanel 
                   onSelect={(media) => {
                     // Preload the poster/thumbnail before showing edit view
                     const posterUrl = (media as any).thumbnail_url || (media as any).thumbUrl;
                     const videoUrl = (media as any).location || (media as any).url;
                     preloadVideoPoster(posterUrl, videoUrl);
                     setSelectedMedia(media);
                   }} 
                 />
              </div>
            </div>
            
            {/* Results Gallery - Initial View */}
            {allResults.length > 0 && (
              <div className="mt-6 pb-6">
                <button 
                  onClick={() => setShowResults(!showResults)}
                  className="flex items-center gap-2 text-lg font-medium mb-4 hover:text-primary transition-colors"
                >
                  Edited Videos
                  {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="text-sm text-muted-foreground font-normal">
                    ({(resultsData as any)?.total || 0})
                  </span>
                </button>
                
                {showResults && (
                  <ImageGallery
                    images={allResults}
                    allShots={shots || []}
                    onImageClick={(media) => {
                      setLightboxOpen(true);
                      setLightboxVariantId(media.id);
                      setLightboxInitialMedia(transformVariantToGeneration(media));
                    }}
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
            )}
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
              <InlineEditVideoView 
                key={selectedMedia.id} // Force remount when media changes
                media={selectedMedia} 
                onClose={() => {
                  userClosedEditor.current = true;
                  setSelectedMedia(null);
                  setSavedSegments(undefined);
                }}
                onVideoSaved={async (newUrl) => {
                  console.log("Video regenerated:", newUrl);
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
                      setSavedSegments(undefined); // Clear saved segments when navigating to new generation
                    }
                  } catch (e) {
                    console.error("Failed to navigate to generation", e);
                  }
                }}
                initialSegments={savedSegments}
                onSegmentsChange={handleSegmentsChange}
              />
            </div>
            
            {/* Results Gallery */}
            {allResults.length > 0 && (
              <div className="mt-6 pb-6">
                <button 
                  onClick={() => setShowResults(!showResults)}
                  className="flex items-center gap-2 text-lg font-medium mb-4 hover:text-primary transition-colors"
                >
                  Edited Videos
                  {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="text-sm text-muted-foreground font-normal">
                    ({(resultsData as any)?.total || 0})
                  </span>
                </button>
                
                {showResults && (
                  <ImageGallery
                    images={allResults}
                    allShots={shots || []}
                    onImageClick={(media) => {
                      setLightboxOpen(true);
                      setLightboxVariantId(media.id);
                      setLightboxInitialMedia(transformVariantToGeneration(media));
                    }}
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
            )}
          </div>
        </div>
      )}
      
      {/* Media Lightbox */}
      {isLightboxOpen && lightboxInitialMedia && (
        <MediaLightbox
          media={lightboxInitialMedia}
          onClose={() => {
            setLightboxOpen(false);
            setLightboxVariantId(null);
          }}
          onNext={allResults.length > 1 ? () => handleNavigateLightbox('next') : undefined}
          onPrevious={allResults.length > 1 ? () => handleNavigateLightbox('prev') : undefined}
          showNavigation={allResults.length > 1}
          showTaskDetails={true}
          initialVariantId={lightboxVariantId || undefined}
        />
      )}
    </div>
  );
}

function VideoSelectionPanel({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
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
      mediaType: 'video', // Only show videos
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
          Select a Video
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
               initialShotFilter={shotFilter}
               onShotFilterChange={setShotFilter}
               showSearch={true}
               initialSearchTerm={searchTerm}
               onSearchChange={setSearchTerm}
               initialMediaTypeFilter="video"
               hideTopFilters={true}
               hideShotNotifier={true}
               initialExcludePositioned={false}
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
               videosAsThumbnails={true}
            />
         )}
      </div>
    </div>
  );
}
