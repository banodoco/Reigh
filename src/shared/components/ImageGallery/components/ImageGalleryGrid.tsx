import React from "react";
import { Filter, Sparkles } from "lucide-react";
import { ProgressiveLoadingManager } from "@/shared/components/ProgressiveLoadingManager";
import { ImagePreloadManager } from "@/shared/components/ImagePreloadManager";
import { ImageGalleryItem } from "@/shared/components/ImageGalleryItem";
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { GeneratedImageWithMetadata } from '../ImageGallery';

export interface ImageGalleryGridProps {
  // Data props
  images: GeneratedImageWithMetadata[];
  paginatedImages: GeneratedImageWithMetadata[];
  filteredImages: GeneratedImageWithMetadata[];
  
  // Layout props
  reducedSpacing?: boolean;
  whiteText?: boolean;
  gridColumnClasses: string;
  
  // Loading props
  isGalleryLoading: boolean;
  setIsGalleryLoading: (loading: boolean) => void;
  isServerPagination: boolean;
  setLoadingButton: (button: 'prev' | 'next' | null) => void;
  safetyTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  
  // Progressive loading props
  effectivePage: number;
  isMobile: boolean;
  
  // Preloading props
  enableAdjacentPagePreloading?: boolean;
  page: number;
  serverPage?: number;
  totalFilteredItems: number;
  itemsPerPage: number;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  selectedProjectId?: string;
  
  // Filter state for empty states
  hasFilters: boolean;
  
  // ImageGalleryItem props - passing through all the props it needs
  [key: string]: any; // This allows passing through all other props
}

export const ImageGalleryGrid: React.FC<ImageGalleryGridProps> = ({
  // Data props
  images,
  paginatedImages,
  filteredImages,
  
  // Layout props
  reducedSpacing = false,
  whiteText = false,
  gridColumnClasses,
  
  // Loading props
  isGalleryLoading,
  setIsGalleryLoading,
  isServerPagination,
  setLoadingButton,
  safetyTimeoutRef,
  
  // Progressive loading props
  effectivePage,
  isMobile,
  
  // Preloading props
  enableAdjacentPagePreloading = true,
  page,
  serverPage,
  totalFilteredItems,
  itemsPerPage,
  onPrefetchAdjacentPages,
  selectedProjectId,
  
  // Filter state
  hasFilters,
  
  // Pass through all other props for ImageGalleryItem
  ...itemProps
}) => {
  
  return (
    <>
      {/* Adjacent Page Preloading Manager - handles preloading in background */}
      <ImagePreloadManager
        enabled={enableAdjacentPagePreloading}
        isServerPagination={isServerPagination}
        page={page}
        serverPage={serverPage}
        totalFilteredItems={totalFilteredItems}
        itemsPerPage={itemsPerPage}
        onPrefetchAdjacentPages={onPrefetchAdjacentPages}
        allImages={filteredImages}
        projectId={selectedProjectId}
      />

      {/* Gallery content wrapper with minimum height to prevent layout jump when there are images */}
      <div className={paginatedImages.length > 0 && !reducedSpacing ? "min-h-[400px] sm:min-h-[500px] lg:min-h-[600px]" : ""}>
        {/* No items match filters message */}
        {images.length > 0 && filteredImages.length === 0 && hasFilters && !isGalleryLoading && (
          <div className={`text-center py-10 mt-6 rounded-lg ${
            whiteText 
              ? "text-zinc-400 border-zinc-700 bg-zinc-800/50" 
              : "text-muted-foreground border bg-card shadow-sm"
          }`}>
            <Filter className={`mx-auto h-10 w-10 mb-3 opacity-60 ${whiteText ? "text-zinc-500" : ""}`} />
            <p className={`font-light ${whiteText ? "text-zinc-300" : ""}`}>No items match the current filters.</p>
            <p className={`text-sm ${whiteText ? "text-zinc-400" : ""}`}>Adjust the filters or clear the search to see all items.</p>
          </div>
        )}

        {/* No images generated yet message */}
        {images.length === 0 && !isGalleryLoading && (
           <div className={`text-center py-12 mt-8 rounded-lg ${
             whiteText 
               ? "text-zinc-400 border-zinc-700 bg-zinc-800/50" 
               : "text-muted-foreground border bg-card shadow-sm"
           }`}>
             <Sparkles className={`mx-auto h-10 w-10 mb-3 opacity-60 ${whiteText ? "text-zinc-500" : ""}`} />
             <p className={`font-light ${whiteText ? "text-zinc-300" : ""}`}>No images generated yet.</p>
             <p className={`text-sm ${whiteText ? "text-zinc-400" : ""}`}>Use the controls above to generate some images.</p>
           </div>
        )}

        {/* Images grid */}
        {paginatedImages.length > 0 && (
          <ProgressiveLoadingManager
            images={paginatedImages}
            page={effectivePage}
            enabled={true}
            isMobile={isMobile}
            onImagesReady={() => {
              console.log(`🎯 [PAGELOADINGDEBUG] [GALLERY] Images ready - clearing gallery loading state`);
              setIsGalleryLoading(false);
              
              // Only clear button loading for server pagination - client pagination handles this separately
              if (isServerPagination) {
                console.log(`🔘 [PAGELOADINGDEBUG] [GALLERY] Server pagination - also clearing button loading`);
                setLoadingButton(null);
              }
              
              // Clear the gallery safety timeout since loading completed successfully
              if (safetyTimeoutRef.current) {
                clearTimeout(safetyTimeoutRef.current);
                safetyTimeoutRef.current = null;
              }
            }}
          >
            {(showImageIndices) => (
              <div>
                <div className={`grid ${reducedSpacing ? 'gap-2 sm:gap-4' : 'gap-4'} ${reducedSpacing ? 'mb-4' : 'mb-12'} ${gridColumnClasses}`}>
                  {paginatedImages.map((image, index) => {
                    const shouldShow = showImageIndices.has(index);
                    
                    // Use unified loading strategy system
                    const loadingStrategy = getImageLoadingStrategy(index, {
                      isMobile,
                      totalImages: paginatedImages.length,
                      isPreloaded: false // Will be checked inside the component
                    });
                    
                    // Debug logging for first few images AND any that should show but don't
                    if (index < 8 || (loadingStrategy.shouldLoadInInitialBatch && !shouldShow)) {
                      console.log(`[GalleryDebug] 🖼️ Image ${index} render:`, {
                        imageId: image.id?.substring(0, 8),
                        shouldShow,
                        batchGroup: loadingStrategy.batchGroup,
                        shouldLoadInInitialBatch: loadingStrategy.shouldLoadInInitialBatch,
                        showImageIndicesSize: showImageIndices.size,
                        showImageIndicesArray: Array.from(showImageIndices).slice(0, 10),
                        isGalleryLoading
                      });
                    }
                    
                    return (
                      <ImageGalleryItem
                        key={image.id || `image-${index}`}
                        image={image}
                        index={index}
                        shouldLoad={shouldShow}
                        isPriority={loadingStrategy.shouldLoadInInitialBatch}
                        isGalleryLoading={isGalleryLoading}
                        {...itemProps}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </ProgressiveLoadingManager>
        )}
      </div>
    </>
  );
};
