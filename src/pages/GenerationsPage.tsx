import React from 'react';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { useProject } from '@/shared/contexts/ProjectContext';

const GENERATIONS_PER_PAGE = 45; // 45 items per page for consistency

const GenerationsPage: React.FC = () => {
  const { isLoadingProjects } = useProject();
  const {
    selectedProjectId,
    shotsData,
    paginatedData,
    lastAffectedShotId,
    totalCount,
    selectedShotFilter,
    excludePositioned,
    searchTerm,
    isLoading,
    isError,
    error,
    isDeleting,
    setSelectedShotFilter,
    setExcludePositioned,
    setSearchTerm,
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    page
  } = useGenerationsPageLogic({
    itemsPerPage: GENERATIONS_PER_PAGE,
    mediaType: 'image'
  });



    return (
    <div className="container mx-auto p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">All Generations</h1>
      </div>
      
      {isLoadingProjects ? (
        <SkeletonGallery 
          count={GENERATIONS_PER_PAGE}
          columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
        />
      ) : !selectedProjectId ? (
        <div className="text-center py-10">Please select a project to view generations.</div>
      ) : isError ? (
        <div className="text-center py-10 text-red-500">Error loading generations: {error?.message}</div>
      ) : isLoading && paginatedData.items.length === 0 ? (
        <SkeletonGallery 
          count={GENERATIONS_PER_PAGE}
          columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
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
          initialMediaTypeFilter="image"
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
        />
      )}
    </div>
  );
};

export default GenerationsPage; 