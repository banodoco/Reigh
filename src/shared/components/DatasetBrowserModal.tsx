/**
 * DatasetBrowserModal - Modal for browsing and selecting images from dataset_id = 1
 * Features: search, pagination, image selection with URL processing integration
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { fetchDatasetImages, DatasetImage, DatasetSearchParams } from '@/shared/services/datasetService';
import { verifyDatasetConnection } from '@/integrations/supabase/datasetClient';
import { processImageUrl } from '@/shared/lib/urlToFile';
import { toast } from 'sonner';

interface DatasetBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelect: (files: File[]) => void;
}

export const DatasetBrowserModal: React.FC<DatasetBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  onImageSelect,
}) => {
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });

  // State
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedImage, setSelectedImage] = useState<DatasetImage | null>(null);
  const [processingImage, setProcessingImage] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  

  // Fetch images
  const fetchImages = useCallback(async (params: DatasetSearchParams = {}) => {
    setLoading(true);
    setConnectionError(null);
    try {
      const result = await fetchDatasetImages({
        searchTerm,
        page: currentPage,
        limit: 16,
        ...params,
      });

      setImages(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
      setLoadedImages(new Set()); // Reset loaded images when new data arrives
    } catch (error) {
      console.error('Error fetching dataset images:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnectionError(errorMessage);
      
      if (errorMessage.includes('Invalid API key')) {
        toast.error('Dataset access unavailable: Invalid API key configuration');
      } else {
        toast.error('Failed to load images from dataset');
      }
    } finally {
      setLoading(false);
    }
  }, [searchTerm, currentPage]);


  // Load data when modal opens or filters change
  useEffect(() => {
    if (isOpen) {
      // Verify connection first (for debugging)
      verifyDatasetConnection().then(result => {
        if (!result.success) {
          console.error('Dataset connection failed:', result.error);
          toast.error(`Dataset connection failed: ${result.error}`);
        } else {
          }
      });
      
      fetchImages();
    }
  }, [isOpen, fetchImages]);

  // Handle search
  const handleSearch = useCallback((newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
    setCurrentPage(1);
  }, []);


  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  useEffect(() => {
    if (currentPage > 1) {
      fetchImages({ page: currentPage });
    }
  }, [currentPage, fetchImages]);

  // Handle image selection
  const handleImageClick = useCallback(async (image: DatasetImage) => {
    if (processingImage) return; // Prevent multiple clicks
    
    setProcessingImage(image.id);
    setSelectedImage(image);

    try {
      // Convert the storage URL to a File object using our existing utility
      const file = await processImageUrl(image.storage_url, image.filename);
      
      // Call the onImageSelect callback with the file
      onImageSelect([file]);
      
      // Close the modal
      onOpenChange(false);
    } catch (error) {
      console.error('Error processing selected image:', error);
      toast.error('Failed to process selected image');
    } finally {
      setProcessingImage(null);
      setSelectedImage(null);
    }
  }, [processingImage, onImageSelect, onOpenChange]);

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
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Browse Dataset Images
              {total > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {total} images
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts and parameters..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Active search and clear button */}
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
          {!loading && !connectionError && images.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
                    processingImage === image.id ? 'border-primary' : 'border-transparent'
                  }`}
                  onClick={() => handleImageClick(image)}
                >
                  <div className="aspect-square relative">
                    {/* Skeleton loader - shown until image loads */}
                    {!loadedImages.has(image.id) && (
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 animate-pulse">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12" />
                      </div>
                    )}
                    <img
                      src={image.storage_url}
                      alt={image.prompt || image.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onLoad={() => {
                        setLoadedImages(prev => new Set(prev).add(image.id));
                      }}
                      onError={() => {
                        // Also mark as "loaded" on error to hide skeleton
                        setLoadedImages(prev => new Set(prev).add(image.id));
                      }}
                    />
                    {processingImage === image.id && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                  </div>
                  {/* Image info tooltip */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 transform translate-y-full group-hover:translate-y-0 transition-transform">
                    <p className="text-xs truncate" title={image.prompt}>
                      {image.prompt || image.filename}
                    </p>
                    {image.params && (
                      <p className="text-xs text-gray-300 truncate mt-1" title={image.params}>
                        {image.params}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connection Error */}
          {!loading && connectionError && (
            <div className="text-center py-12">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mx-auto max-w-md">
                <div className="text-red-600 dark:text-red-400 mb-2">
                  <svg className="h-8 w-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="font-medium">Dataset Connection Failed</p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  {connectionError.includes('Invalid API key') 
                    ? 'The dataset API key needs to be configured correctly.'
                    : connectionError
                  }
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fetchImages()}
                  className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  Retry Connection
                </Button>
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && !connectionError && images.length === 0 && (
            <div className="text-center py-12">
              <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No images found matching your search</p>
              {searchTerm && (
                <Button variant="ghost" onClick={clearSearch} className="mt-2">
                  Clear search to see all images
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
