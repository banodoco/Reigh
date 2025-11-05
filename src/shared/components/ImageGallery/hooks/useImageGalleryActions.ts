import { useCallback, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { useToast } from '@/shared/hooks/use-toast';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { getDisplayUrl } from '@/shared/lib/utils';
import { GeneratedImageWithMetadata, DisplayableMetadata } from '../index';

export interface UseImageGalleryActionsProps {
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onAddToLastShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onToggleStar?: (id: string, starred: boolean) => void;
  onImageSaved?: (imageId: string, newImageUrl: string) => void;
  activeLightboxMedia: GenerationRow | null;
  setActiveLightboxMedia: (media: GenerationRow | null) => void;
  setAutoEnterEditMode: (value: boolean) => void;
  markOptimisticDeleted: (imageId: string) => void;
  removeOptimisticDeleted: (imageId: string) => void;
  setDownloadingImageId: (id: string | null) => void;
  setShowTickForImageId: (id: string | null) => void;
  setShowTickForSecondaryImageId: (id: string | null) => void;
  mainTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  secondaryTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  onBackfillRequest?: (deletedCount: number, currentPage: number, itemsPerPage: number) => Promise<GeneratedImageWithMetadata[]>;
  serverPage?: number;
  itemsPerPage: number;
  isServerPagination: boolean;
  setIsBackfillLoading: (loading: boolean) => void;
  setBackfillSkeletonCount: (count: number) => void;
  filteredImages: GeneratedImageWithMetadata[];
  setIsDownloadingStarred: (downloading: boolean) => void;
  setSelectedShotIdLocal: (shotId: string) => void;
}

export interface UseImageGalleryActionsReturn {
  handleOptimisticDelete: (imageId: string) => Promise<void>;
  handleOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  handleCloseLightbox: () => void;
  handleImageSaved: (newImageUrl: string, createNew?: boolean) => Promise<void>;
  handleDownloadImage: (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => Promise<void>;
  handleDownloadStarred: () => Promise<void>;
  handleShowTick: (imageId: string) => void;
  handleShowSecondaryTick: (imageId: string) => void;
  handleShotChange: (shotId: string) => void;
  handleSkeletonCleared: () => void;
}

export const useImageGalleryActions = ({
  onDelete,
  onApplySettings,
  onAddToLastShot,
  onAddToLastShotWithoutPosition,
  onToggleStar,
  onImageSaved,
  activeLightboxMedia,
  setActiveLightboxMedia,
  setAutoEnterEditMode,
  markOptimisticDeleted,
  removeOptimisticDeleted,
  setDownloadingImageId,
  setShowTickForImageId,
  setShowTickForSecondaryImageId,
  mainTickTimeoutRef,
  secondaryTickTimeoutRef,
  onBackfillRequest,
  serverPage,
  itemsPerPage,
  isServerPagination,
  setIsBackfillLoading,
  setBackfillSkeletonCount,
  filteredImages,
  setIsDownloadingStarred,
  setSelectedShotIdLocal,
}: UseImageGalleryActionsProps): UseImageGalleryActionsReturn => {
  
  const { toast } = useToast();
  const { setLastAffectedShotId } = useLastAffectedShot();
  
  // Track deletions per page for backfilling
  const deletionsCountRef = useRef<Map<number, number>>(new Map());
  const backfillTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Optimistic delete handler with backfill logic
  const handleOptimisticDelete = useCallback(async (imageId: string) => {
    // Immediately mark as optimistically deleted
    markOptimisticDeleted(imageId);
    
    // Close lightbox if this image is currently open
    if (activeLightboxMedia?.id === imageId) {
      setActiveLightboxMedia(null);
    }
    
    try {
      // Call the original delete handler
      if (onDelete) {
        await onDelete(imageId);
      }
      
      // Debug: Check if we're in server pagination mode
      ,
        timestamp: Date.now()
      });
      
      // Track deletion for backfill logic (only for server pagination)
      if (isServerPagination && serverPage && onBackfillRequest) {
        const currentPageNum = serverPage;
        const currentCount = deletionsCountRef.current.get(currentPageNum) || 0;
        const newCount = currentCount + 1;
        deletionsCountRef.current.set(currentPageNum, newCount);
        
        ,
          page: currentPageNum,
          previousCount: currentCount,
          deletionsCount: newCount,
          itemsPerPage,
          isServerPagination,
          hasServerPage: !!serverPage,
          hasBackfillRequest: !!onBackfillRequest,
          deletionsMapSize: deletionsCountRef.current.size,
          timestamp: Date.now()
        });
        
        // Show skeleton loading immediately for any deletion in server pagination mode
        });
        setIsBackfillLoading(true);
        setBackfillSkeletonCount(newCount);
        
        // Clear any existing timeout and set a new one
        if (backfillTimeoutRef.current) {
          clearTimeout(backfillTimeoutRef.current);
        }
        
        // Debounce backfill requests to handle multiple rapid deletions
        backfillTimeoutRef.current = setTimeout(async () => {
          const deletionsCount = deletionsCountRef.current.get(currentPageNum) || 0;
          
          // Only trigger backfill if we've deleted a significant number of items
          // or if we've deleted more than half the page
          const backfillThreshold = Math.min(3, Math.ceil(itemsPerPage / 2));
          
          if (deletionsCount >= backfillThreshold) {
            });
            
            try {
              // Skeleton loading state is already set immediately upon deletion
              const backfillItems = await onBackfillRequest(deletionsCount, currentPageNum, itemsPerPage);
              });
              
              // Clear skeleton immediately when backfill request completes
              setIsBackfillLoading(false);
              setBackfillSkeletonCount(0);
              
              // Reset deletion count for this page since we've backfilled
              deletionsCountRef.current.delete(currentPageNum);
              
              } catch (error) {
              // Clear skeleton even if backfill fails
              setIsBackfillLoading(false);
              setBackfillSkeletonCount(0);
              // Reset deletion count even if backfill fails
              deletionsCountRef.current.delete(currentPageNum);
              :', currentPageNum);
              // Don't show error to user as this is a nice-to-have feature
            } finally {
              }
          }
        }, 500); // 500ms debounce
      }
      
      // If successful, the image will be removed from the server response
      // and our reconciliation effect will clean up the optimistic state
    } catch (error) {
      console.error('Delete failed, reverting optimistic state:', error);
      // If delete fails, remove from optimistic deleted state to show the image again
      removeOptimisticDeleted(imageId);
      
      // Clear skeleton loading state if delete fails
      if (isServerPagination && serverPage && onBackfillRequest) {
        const currentPageNum = serverPage;
        const currentCount = deletionsCountRef.current.get(currentPageNum) || 0;
        if (currentCount > 0) {
          deletionsCountRef.current.set(currentPageNum, currentCount - 1);
          const newCount = currentCount - 1;
          if (newCount === 0) {
            setIsBackfillLoading(false);
            setBackfillSkeletonCount(0);
          } else {
            setBackfillSkeletonCount(newCount);
          }
        }
      }
      
      // Show error toast
      toast({
        title: "Delete Failed",
        description: "Could not delete the image. Please try again.",
        variant: "destructive"
      });
    }
  }, [markOptimisticDeleted, removeOptimisticDeleted, onDelete, activeLightboxMedia, setActiveLightboxMedia, toast, isServerPagination, serverPage, onBackfillRequest, itemsPerPage, setIsBackfillLoading, setBackfillSkeletonCount]);

  const handleOpenLightbox = useCallback((image: GeneratedImageWithMetadata, autoEnterEditMode = false) => {
    );
    );
    );
    : 'no metadata');
    );
    
    // We need to map the partial `GeneratedImageWithMetadata` to a `GenerationRow` for the lightbox
    const mediaRow: GenerationRow = {
      id: image.id,
      imageUrl: image.url,
      location: image.url, // Assuming url is the location
      type: image.isVideo ? 'video_travel_output' : 'single_image', // Infer type
      createdAt: image.createdAt || new Date().toISOString(),
      metadata: {
        ...image.metadata,
        __autoEnterEditMode: autoEnterEditMode, // Store the flag in metadata
        based_on: image.based_on, // Include based_on in metadata for MediaLightbox
      },
      thumbUrl: image.isVideo ? image.url : undefined, // simple fallback
      upscaled_url: image.upscaled_url, // Pass through upscaled version URL if available
      based_on: image.based_on, // Include based_on field directly on the GenerationRow
    } as GenerationRow;
    
    );
    .based_on);
    .based_on);
    ?.based_on);
    ?.based_on);
    );
    : 'no metadata');
    );
    
    setActiveLightboxMedia(mediaRow);
    setAutoEnterEditMode(autoEnterEditMode);
    
    }, [setActiveLightboxMedia, setAutoEnterEditMode]);

  const handleCloseLightbox = useCallback(() => {
    setActiveLightboxMedia(null);
    setAutoEnterEditMode(false); // Reset edit mode flag when closing lightbox
  }, [setActiveLightboxMedia, setAutoEnterEditMode]);

  // Conform to MediaLightbox signature: returns Promise<void> and accepts optional createNew flag
  const handleImageSaved = useCallback(async (newImageUrl: string, _createNew?: boolean): Promise<void> => {
    });
    
    if (activeLightboxMedia?.id && onImageSaved) {
      });
      
      // Wrap the potentially synchronous parent handler in Promise.resolve to always return a Promise
      await Promise.resolve(onImageSaved(activeLightboxMedia.id, newImageUrl));
      
      });
    } else {
        hasActiveLightboxMediaId: !!activeLightboxMedia?.id,
        hasOnImageSaved: !!onImageSaved,
        activeLightboxMedia,
        timestamp: Date.now()
      });
    }
  }, [activeLightboxMedia?.id, onImageSaved]);

  const handleDownloadImage = useCallback(async (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => {
    const currentDownloadId = imageId || filename;
    setDownloadingImageId(currentDownloadId);
    const accessibleImageUrl = getDisplayUrl(rawUrl); // Use display URL for download

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', accessibleImageUrl, true); // Use accessibleImageUrl
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (this.status === 200) {
          const blobContentType = this.getResponseHeader('content-type') || originalContentType || (isVideo ? 'video/webm' : 'image/png');
          const blob = new Blob([this.response], { type: blobContentType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          
          // Attempt to get a better filename extension
          let fileExtension = blobContentType.split('/')[1];
          if (!fileExtension || fileExtension === 'octet-stream') {
            // Fallback to guessing from URL or defaulting
            const urlParts = accessibleImageUrl.split('.');
            fileExtension = urlParts.length > 1 ? urlParts.pop()! : (isVideo ? 'webm' : 'png');
          }
          const downloadFilename = filename.includes('.') ? filename : `${filename}.${fileExtension}`;
          a.download = downloadFilename;

          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
          toast({ title: "Download Started", description: filename });
        } else {
          throw new Error(`Failed to fetch image: ${this.status} ${this.statusText}`);
        }
      };

      xhr.onerror = function() {
        throw new Error('Network request failed');
      };

      xhr.send();
    } catch (error) {
      console.error("Error downloading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({ 
        title: "Download Failed", 
        description: `Could not download ${filename}. ${errorMessage}`,
        variant: "destructive" 
      });
    } finally {
      setDownloadingImageId(null);
    }
  }, [setDownloadingImageId, toast]);

  const handleShowTick = useCallback((imageId: string) => {
    setShowTickForImageId(imageId);
    if (mainTickTimeoutRef.current) clearTimeout(mainTickTimeoutRef.current);
    mainTickTimeoutRef.current = setTimeout(() => {
      setShowTickForImageId(null);
    }, 1000);
  }, [setShowTickForImageId, mainTickTimeoutRef]);

  const handleShowSecondaryTick = useCallback((imageId: string) => {
    setShowTickForSecondaryImageId(imageId);
    if (secondaryTickTimeoutRef.current) clearTimeout(secondaryTickTimeoutRef.current);
    secondaryTickTimeoutRef.current = setTimeout(() => {
      setShowTickForSecondaryImageId(null);
    }, 1000);
  }, [setShowTickForSecondaryImageId, secondaryTickTimeoutRef]);

  const handleShotChange = useCallback((shotId: string) => {
    setLastAffectedShotId(shotId);
    setSelectedShotIdLocal(shotId);
  }, [setLastAffectedShotId, setSelectedShotIdLocal]);

  // Handle skeleton cleared callback - reset deletion count
  const handleSkeletonCleared = useCallback(() => {
    if (isServerPagination && serverPage) {
      deletionsCountRef.current.delete(serverPage);
    }
  }, [isServerPagination, serverPage]);

  const handleDownloadStarred = useCallback(async () => {
    // Get starred images from filtered images
    const starredImages = filteredImages.filter(image => image.starred);
    
    if (starredImages.length === 0) {
      toast({
        title: "No starred images",
        description: "No starred images found to download.",
        variant: "destructive"
      });
      return;
    }

    // Sort chronologically by createdAt, fallback to id for deterministic ordering
    const sortedImages = [...starredImages].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      
      if (dateA !== dateB) {
        return dateA - dateB; // Ascending order (oldest first)
      }
      
      // Fallback to ID comparison for consistent ordering
      return a.id.localeCompare(b.id);
    });

    setIsDownloadingStarred(true);
    
    try {
      // Dynamic import JSZip
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();
      
      toast({
        title: "Starting download",
        description: `Processing ${sortedImages.length} starred images...`
      });

      // Process images sequentially to avoid overwhelming the server
      for (let i = 0; i < sortedImages.length; i++) {
        const image = sortedImages[i];
        const accessibleImageUrl = getDisplayUrl(image.url);
        
        try {
          // Fetch the image blob
          const response = await fetch(accessibleImageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          // Determine file extension
          let fileExtension = 'png'; // Default fallback
          const contentType = blob.type || image.metadata?.content_type;
          
          if (contentType) {
            if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              fileExtension = 'jpg';
            } else if (contentType.includes('png')) {
              fileExtension = 'png';
            } else if (contentType.includes('webp')) {
              fileExtension = 'webp';
            } else if (contentType.includes('gif')) {
              fileExtension = 'gif';
            } else if (image.isVideo) {
              if (contentType.includes('mp4')) {
                fileExtension = 'mp4';
              } else if (contentType.includes('webm')) {
                fileExtension = 'webm';
              } else {
                fileExtension = 'mp4'; // Default for videos
              }
            }
          } else if (image.isVideo) {
            fileExtension = 'mp4'; // Default for videos when no content type
          }
          
          // Generate zero-padded filename
          const paddedNumber = String(i + 1).padStart(3, '0');
          const filename = `${paddedNumber}.${fileExtension}`;
          
          // Add to zip
          zip.file(filename, blob);
          
          // Update progress
          if ((i + 1) % 5 === 0 || i === sortedImages.length - 1) {
            toast({
              title: "Processing images",
              description: `Processed ${i + 1}/${sortedImages.length} images...`
            });
          }
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          // Continue with other images, don't fail the entire operation
          toast({
            title: "Image processing error",
            description: `Failed to process image ${i + 1}, continuing with others...`,
            variant: "destructive"
          });
        }
      }
      
      // Generate zip file
      toast({
        title: "Creating zip file",
        description: "Finalizing download..."
      });
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      a.download = `starred-images-${dateStr}.zip`;
      
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download complete",
        description: `Successfully downloaded ${sortedImages.length} starred images.`
      });
      
    } catch (error) {
      console.error("Error downloading starred images:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Download failed",
        description: `Could not create zip file. ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsDownloadingStarred(false);
    }
  }, [filteredImages, toast, setIsDownloadingStarred]);

  // Cleanup backfill timeout on unmount
  useEffect(() => {
    return () => {
      if (backfillTimeoutRef.current) {
        clearTimeout(backfillTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleOptimisticDelete,
    handleOpenLightbox,
    handleCloseLightbox,
    handleImageSaved,
    handleDownloadImage,
    handleDownloadStarred,
    handleShowTick,
    handleShowSecondaryTick,
    handleShotChange,
    handleSkeletonCleared,
  };
};
