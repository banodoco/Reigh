import React, { useCallback, useRef } from 'react';
import { ImageGalleryOptimized as ImageGallery } from '@/shared/components/ImageGallery';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { fetchGenerations } from '@/shared/hooks/useGenerations';
import { getDisplayUrl } from '@/shared/lib/utils';
import { smartPreloadImages, initializePrefetchOperations, smartCleanupOldPages, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';

const GENERATIONS_PER_PAGE = 30; // 30 items per page for consistency

const GenerationsPage: React.FC = () => {
  
  const { isLoadingProjects, selectedProjectId: currentProjectId, projects } = useProject();
  
  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === currentProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
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
    smartCleanupOldPages(queryClient, page, selectedProjectId, 'unified-generations');
    
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
        queryKey: ['unified-generations', 'project', selectedProjectId, nextPage, GENERATIONS_PER_PAGE, filters],
        queryFn: () => fetchGenerations(selectedProjectId, GENERATIONS_PER_PAGE, (nextPage - 1) * GENERATIONS_PER_PAGE, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['unified-generations', 'project', selectedProjectId, nextPage, GENERATIONS_PER_PAGE, filters]) as any;
        smartPreloadImages(cached, 'next', prefetchId, prefetchOperationsRef);
      });
    }

    // Prefetch previous page second (lower priority)
    if (prevPage) {
      queryClient.prefetchQuery({
        queryKey: ['unified-generations', 'project', selectedProjectId, prevPage, GENERATIONS_PER_PAGE, filters],
        queryFn: () => fetchGenerations(selectedProjectId, GENERATIONS_PER_PAGE, (prevPage - 1) * GENERATIONS_PER_PAGE, filters),
        staleTime: 30 * 1000,
      }).then(() => {
        const cached = queryClient.getQueryData(['unified-generations', 'project', selectedProjectId, prevPage, GENERATIONS_PER_PAGE, filters]) as any;
        smartPreloadImages(cached, 'prev', prefetchId, prefetchOperationsRef);
      });
    }
  }, [selectedProjectId, queryClient, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

  // Handle backfill request to fill empty spaces after deletions
  const handleBackfillRequest = useCallback(async (deletedCount: number, currentPage: number, itemsPerPage: number) => {
    if (!selectedProjectId) {
      return [];
    }

    try {
      });

      const filters = { 
        mediaType: mediaTypeFilter,
        shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
        excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
        starredOnly
      };

      // Trigger a refresh of the current page - this will get updated data with items moved up from next page
      await queryClient.invalidateQueries({ 
        queryKey: ['unified-generations', 'project', selectedProjectId] 
      });
      
      await queryClient.refetchQueries({ 
        queryKey: ['unified-generations', 'project', selectedProjectId, currentPage, itemsPerPage, filters] 
      });

      // Return empty array since the refresh will update the main data source
      return [];
    } catch (error) {
      return [];
    }
  }, [selectedProjectId, queryClient, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

    // EARLY SKELETON GATE: Show skeleton immediately if we're in any loading state
  // This prevents any UI flash (header, filters, empty state) during initial load
  if (
    isLoadingProjects ||
    (paginatedData.items.length === 0 && (isLoading || isFetching || totalCount == null))
  ) {
    return (
      <div className="container mx-auto p-4 flex flex-col h-full">
        <SkeletonGallery 
          count={GENERATIONS_PER_PAGE}
          columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6, '2xl': 6 }}
          showControls={true}
          projectAspectRatio={projectAspectRatio}
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
          return <div className="text-center py-10">Please select a project to view generations.</div>;
        }
        
        if (isError) {
          return <div className="text-center py-10 text-red-500">Error loading generations: {error?.message}</div>;
        }
        
        // Explicit empty state (true zero results)
        if (paginatedData.items.length === 0 && totalCount === 0) {
          return <div className="text-center py-10">No generations found.</div>;
        }
        
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
          onBackfillRequest={handleBackfillRequest}
        />
        );
      })()}
    </div>
  );
};

export default GenerationsPage; 