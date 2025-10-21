import { GenerationRow } from '@/types/shots';

/**
 * Video loading phase determination
 */
export const determineVideoPhase = (
  shouldLoad: boolean,
  videoPosterLoaded: boolean,
  videoMetadataLoaded: boolean,
  thumbnailLoaded: boolean,
  hasThumbnail: boolean
): { phase: string; readyToShow: boolean } => {
  let phase = 'INITIAL';
  let readyToShow = false;
  
  if (hasThumbnail && thumbnailLoaded && !videoPosterLoaded) {
    phase = 'THUMBNAIL_READY';
    readyToShow = true;
  } else if (!hasThumbnail && !shouldLoad) {
    phase = 'WAITING_TO_LOAD';
  } else if (shouldLoad && !videoPosterLoaded && !hasThumbnail) {
    phase = 'VIDEO_LOADING';
  } else if (shouldLoad && !videoPosterLoaded && hasThumbnail && thumbnailLoaded) {
    phase = 'VIDEO_LOADING_WITH_THUMBNAIL';
  } else if (videoPosterLoaded) {
    phase = 'VIDEO_READY';
    readyToShow = true;
  }
  
  return { phase, readyToShow };
};

/**
 * Create loading summary for debugging
 */
export const createLoadingSummary = (hasThumbnail: boolean, thumbnailLoaded: boolean, videoPosterLoaded: boolean, shouldLoad: boolean): string => {
  return hasThumbnail 
    ? `Thumbnail: ${thumbnailLoaded ? '✅' : '⏳'} | Video: ${videoPosterLoaded ? '✅' : '⏳'}`
    : `Video: ${videoPosterLoaded ? '✅' : shouldLoad ? '⏳' : '⏸️'}`;
};

/**
 * Sort video outputs by creation date
 */
export const sortVideoOutputsByDate = (videoOutputs: GenerationRow[]): GenerationRow[] => {
  return [...videoOutputs]
    .map(v => ({ v, time: new Date(v.createdAt || (v as { created_at?: string | null }).created_at || 0).getTime() }))
    .sort((a, b) => b.time - a.time)
    .map(({ v }) => v);
};

/**
 * Transform unified generations data to GenerationRow format
 */
export const transformUnifiedGenerationsData = (items: any[]): GenerationRow[] => {
  if (!items) return [];
  
  return items.map((item: any) => ({
    id: item.id,
    imageUrl: item.url,
    location: item.url,
    thumbUrl: item.thumbUrl,
    type: item.isVideo ? 'video_travel_output' : 'single_image',
    created_at: item.createdAt,
    metadata: item.metadata,
    shotImageEntryId: item.shotImageEntryId,
    position: item.position,
    name: item.name, // Include variant name
    starred: item.starred ?? false, // 🌟 Preserve starred state from cache
    // Include task data if available
    ...(item.taskId && { taskId: item.taskId }),
  })) as GenerationRow[];
};

/**
 * Log video loading strategy for debugging
 */
export const logVideoLoadingStrategy = (currentVideoOutputs: GenerationRow[], currentPage: number) => {
  if (currentVideoOutputs.length > 0 && process.env.NODE_ENV === 'development') {
    console.log('🎬 [VideoLifecycle] PAGE_LOADING_STRATEGY:', {
      currentPage,
      totalVideosOnPage: currentVideoOutputs.length,
      loadingPlan: currentVideoOutputs.map((video, index) => ({
        videoNum: index + 1,
        videoId: video.id,
        strategy: index === 0 ? 'IMMEDIATE (priority)' : `DELAYED (${200 + (index * 150)}ms)`,
        preload: index === 0 ? 'metadata' : 'none',
        posterStrategy: 'video-first-frame'
      })),
      timestamp: Date.now()
    });
  }
};
