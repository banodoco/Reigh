/**
 * DatasetBrowserModal - Modal for browsing and selecting style references from resources
 * Features: search, pagination, image selection with URL processing integration
 * Shows public references + user's own references
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Search, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { processImageUrl } from '@/shared/lib/urlToFile';
import { toast } from 'sonner';
import { useListResources, useListPublicResources, Resource, StyleReferenceMetadata } from '@/shared/hooks/useResources';
import { supabase } from '@/integrations/supabase/client';

interface DatasetBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelect?: (files: File[]) => void; // Legacy: for file upload flow
  onResourceSelect?: (resource: Resource) => void; // New: for direct resource reference
}

export const DatasetBrowserModal: React.FC<DatasetBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  onImageSelect,
  onResourceSelect,
}) => {
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });
  
  // State
  const [userId, setUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<Resource | null>(null);
  const [processingImage, setProcessingImage] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [showMyReferencesOnly, setShowMyReferencesOnly] = useState(false);
  
  // Get current user session
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    
    if (isOpen) {
      console.log('[RefBrowser] 🚪 Modal opened with callbacks:', {
        hasOnResourceSelect: !!onResourceSelect,
        hasOnImageSelect: !!onImageSelect,
        onResourceSelectType: typeof onResourceSelect,
        onImageSelectType: typeof onImageSelect
      });
      getUser();
    }
  }, [isOpen, onResourceSelect, onImageSelect]);
  
  // Fetch resources
  const publicResources = useListPublicResources('style-reference');
  const myResources = useListResources('style-reference');

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

  // Filter resources based on search term and "My References" toggle
  const filteredResources = useMemo(() => {
    if (showMyReferencesOnly) {
      let filtered = (myResources.data || []) as Resource[];
      
      // Filter by search term
      if (searchTerm.trim()) {
        const lowerSearch = searchTerm.toLowerCase();
        filtered = filtered.filter(r => {
          const metadata = r.metadata as StyleReferenceMetadata;
          return (
            metadata.name?.toLowerCase().includes(lowerSearch) ||
            metadata.subjectDescription?.toLowerCase().includes(lowerSearch) ||
            metadata.styleBoostTerms?.toLowerCase().includes(lowerSearch)
          );
        });
      }
      return filtered;
    }
    
    // Otherwise, use all resources and apply search
    let filtered = allResources;
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(r => {
        const metadata = r.metadata as StyleReferenceMetadata;
        return (
          metadata.name?.toLowerCase().includes(lowerSearch) ||
          metadata.subjectDescription?.toLowerCase().includes(lowerSearch) ||
          metadata.styleBoostTerms?.toLowerCase().includes(lowerSearch)
        );
      });
    }
    return filtered;
  }, [allResources, searchTerm, showMyReferencesOnly, myResources.data]);

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
  }, [searchTerm, showMyReferencesOnly]);

  // Handle image selection
  const handleImageClick = useCallback(async (resource: Resource) => {
    console.log('[RefBrowser] 🖱️ Item clicked:', {
      resourceId: resource.id,
      hasOnResourceSelect: !!onResourceSelect,
      hasOnImageSelect: !!onImageSelect,
      processingImage,
      metadata: resource.metadata
    });
    
    if (processingImage) {
      console.log('[RefBrowser] ⏸️ Already processing an image, ignoring click');
      return; // Prevent multiple clicks
    }
    
    setProcessingImage(resource.id);
    setSelectedImage(resource);
    console.log('[RefBrowser] 🔄 Set processing state for resource:', resource.id);

    try {
      // If onResourceSelect is provided, use it directly (no re-upload)
      if (onResourceSelect) {
        console.log('[RefBrowser] ✅ Using onResourceSelect (direct reference, no upload)');
        onResourceSelect(resource);
        console.log('[RefBrowser] 📞 Called onResourceSelect, closing modal');
        onOpenChange(false);
      } else if (onImageSelect) {
        console.log('[RefBrowser] 📤 Using onImageSelect (legacy upload flow)');
        // Legacy flow: convert to File for upload
        const metadata = resource.metadata as StyleReferenceMetadata;
        // Use the original URL (not the processed one)
        const imageUrl = metadata.styleReferenceImageOriginal;
        const filename = `${metadata.name.replace(/[^a-z0-9]/gi, '_')}.png`;
        
        console.log('[RefBrowser] 🔄 Converting URL to File:', { imageUrl, filename });
        // Convert the storage URL to a File object using our existing utility
        const file = await processImageUrl(imageUrl, filename);
        
        console.log('[RefBrowser] ✅ File created, calling onImageSelect');
        // Call the onImageSelect callback with the file
        onImageSelect([file]);
        
        // Close the modal
        console.log('[RefBrowser] 📞 Called onImageSelect, closing modal');
        onOpenChange(false);
      } else {
        console.warn('[RefBrowser] ⚠️ No callback provided (neither onResourceSelect nor onImageSelect)');
      }
    } catch (error) {
      console.error('[RefBrowser] ❌ Error processing selected image:', error);
      toast.error('Failed to process selected image');
    } finally {
      console.log('[RefBrowser] 🧹 Clearing processing state');
      setProcessingImage(null);
      setSelectedImage(null);
    }
  }, [processingImage, onImageSelect, onResourceSelect, onOpenChange]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  // Reset processing state and loaded images when modal closes (but keep other state)
  useEffect(() => {
    if (!isOpen) {
      setProcessingImage(null);
      setLoadedImages(new Set());
    }
  }, [isOpen]);

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
              <ImageIcon className="h-5 w-5" />
              Browse Style References
              {filteredResources.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredResources.length} reference{filteredResources.length !== 1 ? 's' : ''}
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
                variant={showMyReferencesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMyReferencesOnly(!showMyReferencesOnly)}
              >
                My References
              </Button>
              {showMyReferencesOnly && (
                <Badge variant="outline">
                  Showing your references only
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setShowMyReferencesOnly(false)} />
                </Badge>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search references..."
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

          {/* Images Grid - 4x4 layout */}
          {!loading && paginatedResources.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {paginatedResources.map((resource) => {
                const metadata = resource.metadata as StyleReferenceMetadata;
                const imageUrl = metadata.thumbnailUrl || metadata.styleReferenceImageOriginal;
                const isOwner = userId && resource.userId === userId;
                
                return (
                  <div
                    key={resource.id}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
                      processingImage === resource.id ? 'border-primary' : 'border-transparent'
                    }`}
                    onClick={() => handleImageClick(resource)}
                  >
                    <div className="aspect-square relative">
                      {/* Skeleton loader - shown until image loads */}
                      {!loadedImages.has(resource.id) && (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 animate-pulse">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12" />
                        </div>
                      )}
                      <img
                        src={imageUrl}
                        alt={metadata.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onLoad={() => {
                          setLoadedImages(prev => new Set(prev).add(resource.id));
                        }}
                        onError={() => {
                          // Also mark as "loaded" on error to hide skeleton
                          setLoadedImages(prev => new Set(prev).add(resource.id));
                        }}
                      />
                      {processingImage === resource.id && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                      
                      {/* Owner badge */}
                      {isOwner && (
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="text-xs">
                            Mine
                          </Badge>
                        </div>
                      )}
                    </div>
                    {/* Image info tooltip */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 transform translate-y-full group-hover:translate-y-0 transition-transform">
                      <p
                        className="text-xs truncate font-medium"
                        title={metadata.name.split('\n')[0]}
                      >
                        {metadata.name.split('\n')[0]}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* No Results */}
          {!loading && paginatedResources.length === 0 && (
            <div className="text-center py-12">
              <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {filteredResources.length === 0 
                  ? (showMyReferencesOnly 
                      ? "You don't have any references yet" 
                      : "No style references found")
                  : "No results on this page"
                }
              </p>
              {searchTerm && (
                <Button variant="ghost" onClick={clearSearch} className="mt-2">
                  Clear search to see all references
                </Button>
              )}
              {showMyReferencesOnly && (
                <Button variant="ghost" onClick={() => setShowMyReferencesOnly(false)} className="mt-2">
                  Show all references
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
            
            <Button variant="outline" onClick={() => onOpenChange(false)} className="hidden md:inline-flex">
              Cancel
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
