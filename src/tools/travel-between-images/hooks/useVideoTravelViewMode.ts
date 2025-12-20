/**
 * View Mode Hook for VideoTravelToolPage
 * 
 * Manages the shots vs videos toggle and all associated filter/search state.
 * Extracted from VideoTravelToolPage.tsx to reduce component size.
 * 
 * Responsibilities:
 * - Shots vs videos view toggle
 * - Video gallery filter state (page, filters, sort)
 * - Search state for both views
 * - Shot sort mode with persistence
 * - Navigation reset on tool root visit
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 */

import { useState, useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';

export interface VideoGalleryFilters {
  videoPage: number;
  videoShotFilter: string;
  videoExcludePositioned: boolean;
  videoSearchTerm: string;
  videoMediaTypeFilter: 'all' | 'image' | 'video';
  videoToolTypeFilter: boolean;
  videoStarredOnly: boolean;
  videoSortMode: 'newest' | 'oldest';
}

export interface UseVideoTravelViewModeParams {
  /** Project ID - used to reset video page on project change */
  selectedProjectId: string | null | undefined;
  /** Initial shot sort mode from persisted settings */
  initialShotSortMode?: 'ordered' | 'newest' | 'oldest';
  /** Callback to persist shot sort mode changes */
  onShotSortModeChange?: (mode: 'ordered' | 'newest' | 'oldest') => void;
}

export interface UseVideoTravelViewModeReturn {
  // View mode
  showVideosView: boolean;
  /**
   * Low-level setter for the raw boolean (no side effects).
   * Useful for cases where the legacy behavior was to only flip the view flag
   * without clearing search / resetting filters.
   */
  setShowVideosViewRaw: Dispatch<SetStateAction<boolean>>;
  setViewMode: (mode: 'shots' | 'videos', opts?: { blurTarget?: HTMLElement | null }) => void;
  handleToggleVideosView: (e?: React.MouseEvent<HTMLElement>) => void;
  
  // Videos view transition state (for skeleton display)
  videosViewJustEnabled: boolean;
  setVideosViewJustEnabled: (value: boolean) => void;
  
  // Video gallery filters
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
  videoSortMode: 'newest' | 'oldest';
  setVideoSortMode: (mode: 'newest' | 'oldest') => void;
  
  // Shot search
  shotSearchQuery: string;
  setShotSearchQuery: (query: string) => void;
  clearSearch: () => void;
  
  // Search UI state
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  handleSearchToggle: () => void;
  searchInputRef: RefObject<HTMLInputElement>;
  
  // Shot sort mode (persisted)
  shotSortMode: 'ordered' | 'newest' | 'oldest';
  setShotSortMode: (mode: 'ordered' | 'newest' | 'oldest') => void;
}

/**
 * Hook that manages view mode (shots vs videos) and all associated filter state.
 */
export const useVideoTravelViewMode = ({
  selectedProjectId,
  initialShotSortMode,
  onShotSortModeChange,
}: UseVideoTravelViewModeParams): UseVideoTravelViewModeReturn => {
  const location = useLocation();
  
  // =============================================================================
  // VIEW MODE STATE
  // =============================================================================
  const [showVideosViewRaw, setShowVideosViewRaw] = useState<boolean>(false);
  
  // Wrapper with debug logging
  const setShowVideosView = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    console.log('[ViewToggleDebug] setShowVideosView called', { 
      newValue: typeof value === 'function' ? 'function' : value,
      stack: new Error().stack?.split('\n').slice(1, 4).join(' <- '),
    });
    setShowVideosViewRaw(value);
  }, []);
  
  const showVideosView = showVideosViewRaw;
  
  // Track when we've just switched to videos view to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Debug: log whenever showVideosView actually changes
  useEffect(() => {
    console.log('[ViewToggleDebug] showVideosView STATE CHANGED to:', showVideosView);
  }, [showVideosView]);
  
  // =============================================================================
  // VIDEO GALLERY FILTER STATE
  // =============================================================================
  const [videoPage, setVideoPage] = useState<number>(1);
  const [videoShotFilter, setVideoShotFilter] = useState<string>('all');
  const [videoExcludePositioned, setVideoExcludePositioned] = useState<boolean>(false);
  const [videoSearchTerm, setVideoSearchTerm] = useState<string>('');
  const [videoMediaTypeFilter, setVideoMediaTypeFilter] = useState<'all' | 'image' | 'video'>('video');
  const [videoToolTypeFilter, setVideoToolTypeFilter] = useState<boolean>(true);
  const [videoStarredOnly, setVideoStarredOnly] = useState<boolean>(false);
  const [videoSortMode, setVideoSortMode] = useState<'newest' | 'oldest'>('newest');
  
  // =============================================================================
  // SEARCH STATE
  // =============================================================================
  const [shotSearchQuery, setShotSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen(prev => {
      const newValue = !prev;
      if (!newValue) {
        // Clear search when closing
        if (showVideosView) {
          setVideoSearchTerm('');
          setVideoPage(1);
        } else {
          setShotSearchQuery('');
        }
      }
      return newValue;
    });
  }, [showVideosView]);
  
  const clearSearch = useCallback(() => {
    setShotSearchQuery('');
  }, []);
  
  // =============================================================================
  // SHOT SORT MODE (with persistence)
  // =============================================================================
  const [localShotSortMode, setLocalShotSortMode] = useState<'ordered' | 'newest' | 'oldest'>(
    initialShotSortMode ?? 'newest'
  );
  
  // Sync local state with persisted settings when they load
  useEffect(() => {
    if (initialShotSortMode) {
      setLocalShotSortMode(initialShotSortMode);
    }
  }, [initialShotSortMode]);
  
  const shotSortMode = localShotSortMode;
  const setShotSortMode = useCallback((mode: 'ordered' | 'newest' | 'oldest') => {
    setLocalShotSortMode(mode); // Immediate local update
    onShotSortModeChange?.(mode); // Persist async
  }, [onShotSortModeChange]);
  
  // =============================================================================
  // NAVIGATION RESET EFFECT
  // Reset to Shots view and scroll to top when navigating to the tool root
  // =============================================================================
  const prevLocationKeyRef = useRef<string | undefined>(location.key);
  useEffect(() => {
    const hasHash = location.hash && location.hash.length > 1;
    const isActualNavigation = prevLocationKeyRef.current !== location.key;
    
    // When navigating to tool root (no hash):
    if (isActualNavigation && !hasHash) {
      // Always scroll to top when clicking logo/nav to tool root
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Reset videos view to shots if currently in videos
      if (showVideosViewRaw) {
        console.log('[ViewToggleDebug] Resetting to Shots view (navigated to tool root)');
        setShowVideosViewRaw(false);
      }
    }
    
    prevLocationKeyRef.current = location.key;
  }, [location.key, location.hash, showVideosViewRaw]);
  
  // Reset video page when project changes
  useEffect(() => {
    setVideoPage(1);
  }, [selectedProjectId]);
  
  // =============================================================================
  // VIEW MODE SWITCHER
  // Centralize side-effects so every switch behaves the same
  // =============================================================================
  const setViewMode = useCallback((mode: 'shots' | 'videos', opts?: { blurTarget?: HTMLElement | null }) => {
    const willShowVideos = mode === 'videos';

    console.log('[ViewToggleDebug] setViewMode called', {
      requestedMode: mode,
      currentShowVideosView: showVideosView,
      willShowVideos,
      isNoOp: willShowVideos === showVideosView,
      timestamp: Date.now()
    });

    // Set the view mode
    setShowVideosView(willShowVideos);

    // Clear search state when switching views
    setIsSearchOpen(false);

    if (willShowVideos) {
      // Prevent empty state flash while the gallery query spins up
      setVideosViewJustEnabled(true);
      console.log('[VideoSkeletonDebug] Setting videosViewJustEnabled=true to show skeletons during transition');

      // Reset video filters when entering videos view
      setVideoPage(1);
      setVideoShotFilter('all');
      setVideoExcludePositioned(false);
      setVideoSearchTerm('');
      setVideoMediaTypeFilter('video');
      setVideoToolTypeFilter(true);
      setVideoStarredOnly(false);
    } else {
      // Clear shot search when switching to shots view
      setShotSearchQuery('');
    }

    opts?.blurTarget?.blur?.();
  }, [showVideosView, setShowVideosView]);

  // Toggle helper for callers that want toggle semantics
  const handleToggleVideosView = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    setViewMode(showVideosView ? 'shots' : 'videos', { blurTarget: (e?.currentTarget as HTMLElement | null) ?? null });
  }, [setViewMode, showVideosView]);

  return {
    // View mode
    showVideosView,
    setShowVideosViewRaw,
    setViewMode,
    handleToggleVideosView,
    
    // Videos view transition state
    videosViewJustEnabled,
    setVideosViewJustEnabled,
    
    // Video gallery filters
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
    videoSortMode,
    setVideoSortMode,
    
    // Shot search
    shotSearchQuery,
    setShotSearchQuery,
    clearSearch,
    
    // Search UI state
    isSearchOpen,
    setIsSearchOpen,
    handleSearchToggle,
    searchInputRef,
    
    // Shot sort mode
    shotSortMode,
    setShotSortMode,
  };
};
