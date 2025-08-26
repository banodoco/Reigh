import React, { useCallback, useRef } from 'react';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { fetchGenerations } from '@/shared/hooks/useGenerations';
import { getDisplayUrl } from '@/shared/lib/utils';
import { smartPreloadImages, initializePrefetchOperations, smartCleanupOldPages, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';

const GENERATIONS_PER_PAGE = 30; // 30 items per page for consistency

const GenerationsPage: React.FC = () => {
  // [UPSTREAM DEBUG] Track GenerationsPage component rendering
  console.log('[GalleryRenderDebug] 📄 GenerationsPage component rendering');
  
  const { isLoadingProjects } = useProject();
  const queryClient = useQueryClient();
  // Add state for media type filter
  const [mediaTypeFilter, setMediaTypeFilter] = React.useState<'all' | 'image' | 'video'>('all');
  
  const {
    selectedProjectId,
    shotsData,
    paginatedData,
    lastAffectedShotId,
    totalCount,
    selectedShotFilter,
    excludePositioned,
    searchTerm,
    starredOnly,
    isLoading,
    isFetching,
    isError,
    error,
    isDeleting,
    setSelectedShotFilter,
    setExcludePositioned,
    setSearchTerm,
    setStarredOnly,
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    handleToggleStar,
    page
  } = useGenerationsPageLogic({
    itemsPerPage: GENERATIONS_PER_PAGE,
    mediaType: mediaTypeFilter // Pass dynamic mediaType instead of hardcoded 'image'
  });

  // [UPSTREAM DEBUG] Track data from useGenerationsPageLogic
  console.log('[GalleryRenderDebug] 📊 GenerationsPageLogic data:', {
    selectedProjectId,
    paginatedItemsCount: paginatedData?.items?.length || 0,
    totalCount,
    isLoading,
    isFetching,
    isError,
    errorMessage: error?.message,
    page,
    timestamp: Date.now()
  });

  // Handle media type filter change
  const handleMediaTypeFilterChange = (newMediaType: 'all' | 'image' | 'video') => {
    setMediaTypeFilter(newMediaType);
    // Page reset is now handled in the hook via useEffect
  };

  // Ref to track ongoing server-side prefetch operations
  const prefetchOperationsRef = useRef<{
    images: HTMLImageElement[];
    currentPrefetchId: string;
  }>({ images: [], currentPrefetchId: '' });

  // Prefetch adjacent pages callback for ImageGallery with cancellation
  const handlePrefetchAdjacentPages = useCallback((prevPage: number | null, nextPage: number | null) => {
    if (!selectedProjectId) return;

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
    smartCleanupOldPages(queryClient, page, selectedProjectId, 'generations');
    
    // Trigger image garbage collection every 10 pages to free browser memory
    if (page % 10 === 0) {
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
        queryKey: ['generations', selectedProjectId, nextPage, GENERATIONS_PER_PAGE, filters],
        queryFn: () => fetchGenerations(selectedProjectId, GENERATIONS_PER_PAGE, (nextPage - 1) * GENERATIONS_PER_PAGE, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['generations', selectedProjectId, nextPage, GENERATIONS_PER_PAGE, filters]) as any;
        smartPreloadImages(cached, 'next', prefetchId, prefetchOperationsRef);
      });
    }

    // Prefetch previous page second (lower priority)
    if (prevPage) {
      queryClient.prefetchQuery({
        queryKey: ['generations', selectedProjectId, prevPage, GENERATIONS_PER_PAGE, filters],
        queryFn: () => fetchGenerations(selectedProjectId, GENERATIONS_PER_PAGE, (prevPage - 1) * GENERATIONS_PER_PAGE, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['generations', selectedProjectId, prevPage, GENERATIONS_PER_PAGE, filters]) as any;
        smartPreloadImages(cached, 'prev', prefetchId, prefetchOperationsRef);
      });
    }
  }, [selectedProjectId, queryClient, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);


    // EARLY SKELETON GATE: Show skeleton immediately if we're in any loading state
  // This prevents any UI flash (header, filters, empty state) during initial load
  if (
    isLoadingProjects ||
    (paginatedData.items.length === 0 && (isLoading || isFetching || totalCount == null))
  ) {
    console.log('[GalleryRenderDebug] 🔄 EARLY SKELETON GATE: Preventing all UI flash', {
      isLoadingProjects,
      itemsLength: paginatedData.items.length,
      isLoading,
      isFetching,
      totalCount,
      timestamp: Date.now()
    });
    return (
      <div className="container mx-auto p-4 flex flex-col h-full">
        <SkeletonGallery 
          count={GENERATIONS_PER_PAGE}
          columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6, '2xl': 6 }}
          showControls={true}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-light">All Generations</h1>
      </div>
      
      {(() => {
        if (!selectedProjectId) {
          console.log('[GalleryRenderDebug] ❌ No project selected');
          return <div className="text-center py-10">Please select a project to view generations.</div>;
        }
        
        if (isError) {
          console.log('[GalleryRenderDebug] ❌ Error state:', error?.message);
          return <div className="text-center py-10 text-red-500">Error loading generations: {error?.message}</div>;
        }
        
        // Explicit empty state (true zero results)
        if (paginatedData.items.length === 0 && totalCount === 0) {
          console.log('[GalleryRenderDebug] 📭 True empty state: no generations exist');
          return <div className="text-center py-10">No generations found.</div>;
        }
        
        console.log('[GalleryRenderDebug] ✅ Rendering ImageGallery with:', {
          itemsCount: paginatedData.items.length,
          totalCount,
          page
        });
        return (
        <ImageGallery
          images={paginatedData.items}
          onDelete={handleDeleteGeneration}
          isDeleting={isDeleting}
          allShots={shotsData || []}
          lastShotId={lastAffectedShotId || undefined}
          onAddToLastShot={handleAddToShot}
          offset={(page - 1) * GENERATIONS_PER_PAGE}
          totalCount={totalCount}
          columnsPerRow={6}
          whiteText={false}
          initialMediaTypeFilter={mediaTypeFilter}
          showShotFilter={true}
          initialShotFilter={selectedShotFilter}
          onShotFilterChange={setSelectedShotFilter}
          initialExcludePositioned={excludePositioned}
          onExcludePositionedChange={setExcludePositioned}
          showSearch={true}
          initialSearchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onServerPageChange={handleServerPageChange}
          serverPage={page}
          onMediaTypeFilterChange={handleMediaTypeFilterChange}
          onToggleStar={handleToggleStar}
          initialStarredFilter={starredOnly}
          onStarredFilterChange={setStarredOnly}
          onPrefetchAdjacentPages={handlePrefetchAdjacentPages}
        />
        );
      })()}
    </div>
  );
};

export default GenerationsPage; 