import React from 'react';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { useProject } from '@/shared/contexts/ProjectContext';

const GENERATIONS_PER_PAGE = 30; // 30 items per page for consistency

const GenerationsPage: React.FC = () => {
  const { isLoadingProjects } = useProject();
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


    return (
    <div className="container mx-auto p-4 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">All Generations</h1>
      </div>
      
      {isLoadingProjects ? (
        <SkeletonGallery 
          count={GENERATIONS_PER_PAGE}
          columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
          showControls={true}
        />
      ) : !selectedProjectId ? (
        <div className="text-center py-10">Please select a project to view generations.</div>
      ) : isError ? (
        <div className="text-center py-10 text-red-500">Error loading generations: {error?.message}</div>
      ) : isLoading && paginatedData.items.length === 0 ? (
        <SkeletonGallery 
          count={GENERATIONS_PER_PAGE}
          columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
          showControls={true}
        />
      ) : (
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
        />
      )}
    </div>
  );
};

export default GenerationsPage; 