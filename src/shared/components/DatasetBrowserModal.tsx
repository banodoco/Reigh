/**
 * DatasetBrowserModal - Modal for browsing and selecting resources (style references or structure videos)
 * Features: search, pagination, resource selection with URL processing integration
 * Shows public resources + user's own resources
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { Search, ChevronLeft, ChevronRight, Image as ImageIcon, Video, Loader2, X, Globe, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { processImageUrl } from '@/shared/lib/urlToFile';
import { toast } from 'sonner';
import { useListResources, useListPublicResources, useUpdateResource, Resource, StyleReferenceMetadata, StructureVideoMetadata, ResourceType } from '@/shared/hooks/useResources';
import { supabase } from '@/integrations/supabase/client';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

// Video item component with scrubbing support using HoverScrubVideo
interface VideoResourceItemProps {
  resource: Resource;
  isOwner: boolean;
  isProcessing: boolean;
  isLoaded: boolean;
  onLoaded: () => void;
  onClick: () => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
}

const VideoResourceItem: React.FC<VideoResourceItemProps> = ({
  resource,
  isOwner,
  isProcessing,
  isLoaded,
  onLoaded,
  onClick,
  onToggleVisibility,
}) => {
  const metadata = resource.metadata as StructureVideoMetadata;
  const videoUrl = metadata.videoUrl;
  const thumbnailUrl = metadata.thumbnailUrl;
  const isPublic = metadata.is_public ?? false;
  const durationInfo = metadata.videoMetadata
    ? `${Math.round(metadata.videoMetadata.duration_seconds)}s • ${metadata.videoMetadata.total_frames}f`
    : null;

  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
        isProcessing ? 'border-primary' : 'border-transparent'
      }`}
      onClick={onClick}
    >
      {/* Video thumbnail */}
      <div className="aspect-square relative">
        {/* Skeleton loader - shown until thumbnail loads */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 animate-pulse z-10">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12" />
          </div>
        )}

        {/* HoverScrubVideo - shows first frame by default, scrubs on hover */}
        <HoverScrubVideo
          src={videoUrl}
          poster={thumbnailUrl || undefined}
          className="w-full h-full"
          videoClassName="object-cover"
          preload="metadata"
          onLoadedData={onLoaded}
          onVideoError={onLoaded}
        />

        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
        
        {/* Overlay info bar at bottom of video */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/60 backdrop-blur-sm z-10">
          {/* Left: Duration badge */}
          {durationInfo ? (
            <span className="text-xs text-white/90">
              {durationInfo}
            </span>
          ) : <div />}
          
          {/* Right: Owner visibility toggle */}
          {isOwner && onToggleVisibility ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onToggleVisibility(resource.id, isPublic);
                    }}
                    className={`rounded-full p-1 transition-colors focus:outline-none ${
                      isPublic
                        ? "bg-green-500 text-white hover:bg-green-600"
                        : "bg-gray-400 text-white hover:bg-gray-500"
                    }`}
                  >
                    {isPublic ? (
                      <Globe className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isPublic 
                    ? "Public - visible to others. Click to make private." 
                    : "Private - only you can see this. Click to make public."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
};

interface DatasetBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType?: 'style-reference' | 'structure-video'; // Type of resources to browse
  title?: string; // Optional custom title
  onImageSelect?: (files: File[]) => void; // Legacy: for file upload flow (style-reference only)
  onResourceSelect?: (resource: Resource) => void; // New: for direct resource reference
}

export const DatasetBrowserModal: React.FC<DatasetBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  resourceType = 'style-reference',
  title,
  onImageSelect,
  onResourceSelect,
}) => {
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });
  
  // Determine if we're browsing videos
  const isVideoMode = resourceType === 'structure-video';
  
  // State
  const [userId, setUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [processingResource, setProcessingResource] = useState<string | null>(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState<Set<string>>(new Set());
  const [showMyResourcesOnly, setShowMyResourcesOnly] = useState(false);
  
  // Get current user session
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    
    if (isOpen) {
      console.log('[ResourceBrowser] 🚪 Modal opened:', {
        resourceType,
        hasOnResourceSelect: !!onResourceSelect,
        hasOnImageSelect: !!onImageSelect,
      });
      getUser();
    }
  }, [isOpen, onResourceSelect, onImageSelect, resourceType]);
  
  // Fetch resources based on type
  const publicResources = useListPublicResources(resourceType);
  const myResources = useListResources(resourceType);
  const updateResource = useUpdateResource();

  // Combine and filter resources
  const allResources = useMemo(() => {
    const publicRefs = (publicResources.data || []) as Resource[];
    const myRefs = (myResources.data || []) as Resource[];
    
    // Combine: public refs + user's own refs (deduplicated by id)
    const combined = [...publicRefs];
    const publicIds = new Set(publicRefs.map(r => r.id));
    
    // Add user's refs that aren't already in the public list
    myRefs.forEach(ref => {
      if (!publicIds.has(ref.id)) {
        combined.push(ref);
      }
    });
    
    return combined;
  }, [publicResources.data, myResources.data]);

  // Helper to get searchable text from resource metadata
  const getSearchableText = useCallback((resource: Resource): string => {
    if (isVideoMode) {
      const metadata = resource.metadata as StructureVideoMetadata;
      return metadata.name?.toLowerCase() || '';
    } else {
      const metadata = resource.metadata as StyleReferenceMetadata;
      return [
        metadata.name,
        metadata.subjectDescription,
        metadata.styleBoostTerms,
      ].filter(Boolean).join(' ').toLowerCase();
    }
  }, [isVideoMode]);

  // Filter resources based on search term and "My Resources" toggle
  const filteredResources = useMemo(() => {
    if (showMyResourcesOnly) {
      let filtered = (myResources.data || []) as Resource[];
      
      // Filter by search term
      if (searchTerm.trim()) {
        const lowerSearch = searchTerm.toLowerCase();
        filtered = filtered.filter(r => getSearchableText(r).includes(lowerSearch));
      }
      return filtered;
    }
    
    // Otherwise, use all resources and apply search
    let filtered = allResources;
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(r => getSearchableText(r).includes(lowerSearch));
    }
    return filtered;
  }, [allResources, searchTerm, showMyResourcesOnly, myResources.data, getSearchableText]);

  // Pagination
  const ITEMS_PER_PAGE = 16;
  const totalPages = Math.ceil(filteredResources.length / ITEMS_PER_PAGE);
  const paginatedResources = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredResources.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredResources, currentPage]);

  const loading = publicResources.isLoading || myResources.isLoading;

  // Handle search
  const handleSearch = useCallback((newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
    setCurrentPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showMyResourcesOnly]);

  // Handle toggling visibility of a resource
  const handleToggleVisibility = useCallback(async (resourceId: string, currentIsPublic: boolean) => {
    console.log('[ResourceBrowser] 👁️ Toggling visibility:', { resourceId, currentIsPublic, newValue: !currentIsPublic });
    
    // Find the resource
    const resource = allResources.find(r => r.id === resourceId);
    if (!resource) {
      console.error('[ResourceBrowser] ❌ Could not find resource:', resourceId);
      return;
    }
    
    try {
      // Update the resource with the new is_public value
      const updatedMetadata = {
        ...resource.metadata,
        is_public: !currentIsPublic,
      };
      
      await updateResource.mutateAsync({
        id: resourceId,
        type: resourceType,
        metadata: updatedMetadata as any,
      });
      
      console.log('[ResourceBrowser] ✅ Visibility toggled successfully');
    } catch (error) {
      console.error('[ResourceBrowser] ❌ Failed to toggle visibility:', error);
      toast.error('Failed to update visibility');
    }
  }, [allResources, updateResource, resourceType]);

  // Handle resource selection
  const handleResourceClick = useCallback(async (resource: Resource) => {
    console.log('[ResourceBrowser] 🖱️ Item clicked:', {
      resourceId: resource.id,
      resourceType,
      hasOnResourceSelect: !!onResourceSelect,
      hasOnImageSelect: !!onImageSelect,
      processingResource,
    });
    
    if (processingResource) {
      console.log('[ResourceBrowser] ⏸️ Already processing, ignoring click');
      return; // Prevent multiple clicks
    }
    
    setProcessingResource(resource.id);
    setSelectedResource(resource);
    console.log('[ResourceBrowser] 🔄 Set processing state for resource:', resource.id);

    try {
      // If onResourceSelect is provided, use it directly (no re-upload)
      if (onResourceSelect) {
        console.log('[ResourceBrowser] ✅ Using onResourceSelect (direct reference)');
        onResourceSelect(resource);
        console.log('[ResourceBrowser] 📞 Called onResourceSelect, closing modal');
        onOpenChange(false);
      } else if (onImageSelect && !isVideoMode) {
        console.log('[ResourceBrowser] 📤 Using onImageSelect (legacy upload flow)');
        // Legacy flow for images: convert to File for upload
        const metadata = resource.metadata as StyleReferenceMetadata;
        const imageUrl = metadata.styleReferenceImageOriginal;
        const filename = `${metadata.name.replace(/[^a-z0-9]/gi, '_')}.png`;
        
        console.log('[ResourceBrowser] 🔄 Converting URL to File:', { imageUrl, filename });
        const file = await processImageUrl(imageUrl, filename);
        
        console.log('[ResourceBrowser] ✅ File created, calling onImageSelect');
        onImageSelect([file]);
        
        console.log('[ResourceBrowser] 📞 Called onImageSelect, closing modal');
        onOpenChange(false);
      } else {
        console.warn('[ResourceBrowser] ⚠️ No callback provided');
      }
    } catch (error) {
      console.error('[ResourceBrowser] ❌ Error processing selected resource:', error);
      toast.error('Failed to process selected resource');
    } finally {
      console.log('[ResourceBrowser] 🧹 Clearing processing state');
      setProcessingResource(null);
      setSelectedResource(null);
    }
  }, [processingResource, onImageSelect, onResourceSelect, onOpenChange, isVideoMode, resourceType]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  // Reset processing state and loaded thumbnails when modal closes (but keep other state)
  useEffect(() => {
    if (!isOpen) {
      setProcessingResource(null);
      setLoadedThumbnails(new Set());
    }
  }, [isOpen]);
  
  // Dynamic title based on resource type
  const modalTitle = title || (isVideoMode ? 'Browse Guidance Videos' : 'Browse Style References');
  const resourceLabel = isVideoMode ? 'video' : 'reference';
  const resourceLabelPlural = isVideoMode ? 'videos' : 'references';
  const myResourcesLabel = isVideoMode ? 'My Videos' : 'My References';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
        {...modal.props}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isVideoMode ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
              {modalTitle}
              {filteredResources.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredResources.length} {filteredResources.length !== 1 ? resourceLabelPlural : resourceLabel}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant={showMyResourcesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMyResourcesOnly(!showMyResourcesOnly)}
              >
                {myResourcesLabel}
              </Button>
              {showMyResourcesOnly && (
                <Badge variant="outline">
                  Showing your {resourceLabelPlural} only
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setShowMyResourcesOnly(false)} />
                </Badge>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${resourceLabelPlural}...`}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Active search indicator */}
            {searchTerm && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  Search: "{searchTerm}"
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSearchTerm('')} />
                </Badge>
                <Button variant="ghost" size="sm" onClick={clearSearch}>
                  Clear search
                </Button>
              </div>
            )}
          </div>

          {/* Loading State - Skeleton Grid */}
          {loading && (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 16 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="relative rounded-lg overflow-hidden border-2 border-transparent"
                >
                  <div className="aspect-square bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 animate-pulse relative">
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Resources Grid - 4x4 layout */}
          {!loading && paginatedResources.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {paginatedResources.map((resource) => {
                // Check both camelCase (interface) and snake_case (database) for owner
                const resourceOwnerId = resource.userId || (resource as any).user_id;
                const isOwner = userId && resourceOwnerId === userId;
                
                // For videos, use the VideoResourceItem component with scrubbing
                if (isVideoMode) {
                  return (
                    <VideoResourceItem
                      key={resource.id}
                      resource={resource}
                      isOwner={!!isOwner}
                      isProcessing={processingResource === resource.id}
                      isLoaded={loadedThumbnails.has(resource.id)}
                      onLoaded={() => setLoadedThumbnails(prev => new Set(prev).add(resource.id))}
                      onClick={() => handleResourceClick(resource)}
                      onToggleVisibility={isOwner ? handleToggleVisibility : undefined}
                    />
                  );
                }
                
                // For images, use the original rendering
                const metadata = resource.metadata as StyleReferenceMetadata;
                const thumbnailUrl = metadata.thumbnailUrl || metadata.styleReferenceImageOriginal;
                const resourceName = metadata.name;
                const isPublic = metadata.is_public ?? false;
                
                return (
                  <div
                    key={resource.id}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
                      processingResource === resource.id ? 'border-primary' : 'border-transparent'
                    }`}
                    onClick={() => handleResourceClick(resource)}
                  >
                    {/* Image thumbnail */}
                    <div className="aspect-square relative">
                      {/* Skeleton loader - shown until thumbnail loads */}
                      {!loadedThumbnails.has(resource.id) && (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 animate-pulse">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12" />
                        </div>
                      )}
                      
                      <img
                        src={thumbnailUrl}
                        alt={resourceName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onLoad={() => {
                          setLoadedThumbnails(prev => new Set(prev).add(resource.id));
                        }}
                        onError={() => {
                          setLoadedThumbnails(prev => new Set(prev).add(resource.id));
                        }}
                      />
                      
                      {processingResource === resource.id && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all pointer-events-none" />
                      
                      {/* Overlay info bar at bottom of image */}
                      {isOwner && (
                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/60 backdrop-blur-sm z-10">
                          <span className="text-xs text-white/90">Mine</span>
                          
                          {/* Visibility toggle */}
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleToggleVisibility(resource.id, isPublic);
                                  }}
                                  className={`rounded-full p-1 transition-colors focus:outline-none ${
                                    isPublic
                                      ? "bg-green-500 text-white hover:bg-green-600"
                                      : "bg-gray-400 text-white hover:bg-gray-500"
                                  }`}
                                >
                                  {isPublic ? (
                                    <Globe className="h-3 w-3" />
                                  ) : (
                                    <Lock className="h-3 w-3" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {isPublic 
                                  ? "Public - visible to others. Click to make private." 
                                  : "Private - only you can see this. Click to make public."}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* No Results */}
          {!loading && paginatedResources.length === 0 && (
            <div className="text-center py-12">
              {isVideoMode ? (
                <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              ) : (
                <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              )}
              <p className="text-muted-foreground">
                {filteredResources.length === 0 
                  ? (showMyResourcesOnly 
                      ? `You don't have any ${resourceLabelPlural} yet` 
                      : `No ${resourceLabelPlural} found`)
                  : "No results on this page"
                }
              </p>
              {searchTerm && (
                <Button variant="ghost" onClick={clearSearch} className="mt-2">
                  Clear search to see all {resourceLabelPlural}
                </Button>
              )}
              {showMyResourcesOnly && (
                <Button variant="ghost" onClick={() => setShowMyResourcesOnly(false)} className="mt-2">
                  Show all {resourceLabelPlural}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <DialogFooter className="border-t relative z-20 pt-4">
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2 w-full md:w-auto md:mr-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex-1 md:flex-initial"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex-1 md:flex-initial"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            <Button variant="retro" size="retro-sm" onClick={() => onOpenChange(false)} className="hidden md:inline-flex">
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
