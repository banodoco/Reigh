/**
 * Videos Gallery Component for VideoTravelToolPage
 * 
 * Renders the videos gallery view with skeleton/loading states.
 * Handles the "should show skeleton" decision and ImageGallery wiring.
 * 
 * @see VideoTravelToolPage.tsx - Parent page component
 */

import React from 'react';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { SKELETON_COLUMNS } from '@/shared/components/ImageGallery/utils';
import { Shot } from '@/types/shots';

// =============================================================================
// PROP TYPES (grouped for clarity)
// =============================================================================

export interface VideosQueryProps {
  videosData: any;
  videosLoading: boolean;
  videosFetching: boolean;
  selectedProjectId: string | null | undefined;
  projectAspectRatio: string | null | undefined;
  itemsPerPage: number;
  shots: Shot[] | undefined;
}

export interface VideosFiltersProps {
  videoPage: number;
  setVideoPage: (page: number) => void;
  videoShotFilter: string;
  setVideoShotFilter: (filter: string) => void;
  videoExcludePositioned: boolean;
  setVideoExcludePositioned: (exclude: boolean) => void;
  videoSearchTerm: string;
  setVideoSearchTerm: (term: string) => void;
  videoMediaTypeFilter: 'all' | 'image' | 'video';
  setVideoMediaTypeFilter: (filter: 'all' | 'image' | 'video') => void;
  videoToolTypeFilter: boolean;
  setVideoToolTypeFilter: (enabled: boolean) => void;
  videoStarredOnly: boolean;
  setVideoStarredOnly: (starred: boolean) => void;
}

export interface AddToShotProps {
  targetShotIdForButton: string | undefined;
  targetShotNameForButtonTooltip: string;
  handleAddVideoToTargetShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  handleAddVideoToTargetShotWithoutPosition: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
}

export interface VideoTravelVideosGalleryProps {
  query: VideosQueryProps;
  filters: VideosFiltersProps;
  addToShot: AddToShotProps;
  /** Flag to show skeleton during view transition */
  videosViewJustEnabled: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const VideoTravelVideosGallery: React.FC<VideoTravelVideosGalleryProps> = ({
  query,
  filters,
  addToShot,
  videosViewJustEnabled,
}) => {
  const {
    videosData,
    videosLoading,
    videosFetching,
    selectedProjectId,
    projectAspectRatio,
    itemsPerPage,
    shots,
  } = query;

  const {
    videoPage,
    setVideoPage,
    videoShotFilter,
    setVideoShotFilter,
    videoExcludePositioned,
    setVideoExcludePositioned,
    videoSearchTerm,
    setVideoSearchTerm,
    videoMediaTypeFilter,
    setVideoMediaTypeFilter,
    videoToolTypeFilter,
    setVideoToolTypeFilter,
    videoStarredOnly,
    setVideoStarredOnly,
  } = filters;

  const {
    targetShotIdForButton,
    targetShotNameForButtonTooltip,
    handleAddVideoToTargetShot,
    handleAddVideoToTargetShotWithoutPosition,
  } = addToShot;

  // Determine if we should show skeleton
  const vd: any = videosData as any;
  const hasValidData = vd?.items && vd.items.length > 0;
  const isLoadingOrFetching = videosLoading || videosFetching;
  
  // Show skeleton if:
  // 1. No project selected, OR
  // 2. Currently loading/fetching and no valid data, OR
  // 3. We just switched to videos view (videosViewJustEnabled flag)
  const shouldShowSkeleton = !selectedProjectId || (isLoadingOrFetching && !hasValidData) || videosViewJustEnabled;
  
  // Use actual count if available, otherwise default to 12
  const skeletonCount = (vd?.total) || 12;
  
  console.log('[VideoSkeletonDebug] === RENDER DECISION ===', {
    selectedProjectId,
    videosLoading,
    videosFetching,
    hasValidData,
    videosViewJustEnabled,
    shouldShowSkeleton,
    skeletonCount,
    videosDataTotal: vd?.total,
    videosDataItemsLength: vd?.items?.length,
    decisionBreakdown: {
      condition1_noProject: !selectedProjectId,
      condition2_loadingNoData: isLoadingOrFetching && !hasValidData,
      condition3_justEnabled: videosViewJustEnabled,
      result: `${!selectedProjectId} || (${isLoadingOrFetching} && ${!hasValidData}) || ${videosViewJustEnabled} = ${shouldShowSkeleton}`
    },
    willRender: shouldShowSkeleton ? 'SKELETON' : 'GALLERY',
    timestamp: Date.now()
  });

  if (shouldShowSkeleton) {
    return (
      <div className="px-4 max-w-7xl mx-auto">
        <div className="pb-2">
          <SkeletonGallery
            count={skeletonCount}
            columns={SKELETON_COLUMNS[3]}
            showControls={true}
            projectAspectRatio={projectAspectRatio}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 max-w-7xl mx-auto">
      <div className="pb-2">
        <ImageGallery
          images={(videosData as any)?.items || []}
          allShots={shots || []}
          // Add to Shot functionality
          onAddToLastShot={handleAddVideoToTargetShot}
          onAddToLastShotWithoutPosition={handleAddVideoToTargetShotWithoutPosition}
          lastShotId={targetShotIdForButton}
          lastShotNameForTooltip={targetShotNameForButtonTooltip}
          currentToolType="travel-between-images"
          currentToolTypeName="Travel Between Images"
          // Pagination props
          totalCount={(videosData as any)?.total}
          serverPage={videoPage}
          onServerPageChange={(page) => setVideoPage(page)}
          itemsPerPage={itemsPerPage}
          // Filter props
          initialMediaTypeFilter={videoMediaTypeFilter}
          onMediaTypeFilterChange={(val) => { setVideoMediaTypeFilter(val); setVideoPage(1); }}
          initialToolTypeFilter={videoToolTypeFilter}
          onToolTypeFilterChange={(val) => { setVideoToolTypeFilter(val); setVideoPage(1); }}
          showShotFilter={true}
          initialShotFilter={videoShotFilter}
          onShotFilterChange={(val) => { setVideoShotFilter(val); setVideoPage(1); }}
          initialExcludePositioned={videoExcludePositioned}
          onExcludePositionedChange={(val) => { setVideoExcludePositioned(val); setVideoPage(1); }}
          showSearch={false}
          initialSearchTerm={videoSearchTerm}
          onSearchChange={(val) => { setVideoSearchTerm(val); setVideoPage(1); }}
          initialStarredFilter={videoStarredOnly}
          onStarredFilterChange={(val) => { setVideoStarredOnly(val); setVideoPage(1); }}
          columnsPerRow={3}
          showShare={false}
        />
      </div>
    </div>
  );
};

export default VideoTravelVideosGallery;
