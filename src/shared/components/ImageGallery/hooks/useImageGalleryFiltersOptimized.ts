import { useReducer, useEffect, useMemo, useRef } from 'react';
import { GeneratedImageWithMetadata } from '../index';

// Consolidated filters state interface
export interface ImageGalleryFiltersState {
  // Filter states
  filterByToolType: boolean;
  mediaTypeFilter: 'all' | 'image' | 'video';
  shotFilter: string;
  excludePositioned: boolean;
  showStarredOnly: boolean;
  toolTypeFilterEnabled: boolean;
  
  // Search state
  searchTerm: string;
  isSearchOpen: boolean;
}

// Action types for the filters reducer
export type ImageGalleryFiltersAction =
  | { type: 'SET_FILTER_BY_TOOL_TYPE'; payload: boolean }
  | { type: 'SET_MEDIA_TYPE_FILTER'; payload: 'all' | 'image' | 'video' }
  | { type: 'SET_SHOT_FILTER'; payload: string }
  | { type: 'SET_EXCLUDE_POSITIONED'; payload: boolean }
  | { type: 'SET_SHOW_STARRED_ONLY'; payload: boolean }
  | { type: 'SET_TOOL_TYPE_FILTER_ENABLED'; payload: boolean }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_IS_SEARCH_OPEN'; payload: boolean }
  | { type: 'TOGGLE_SEARCH' }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'TOGGLE_STARRED_FILTER' }
  | { type: 'SYNC_EXTERNAL_FILTERS'; payload: Partial<ImageGalleryFiltersState> }
  | { type: 'RESET_FILTERS' };

// Initial state factory
const createInitialFiltersState = (
  initialFilterState: boolean = true,
  initialMediaTypeFilter: 'all' | 'image' | 'video' = 'all',
  initialShotFilter: string = 'all',
  initialExcludePositioned: boolean = true,
  initialSearchTerm: string = '',
  initialStarredFilter: boolean = false,
  initialToolTypeFilter: boolean = true
): ImageGalleryFiltersState => ({
  filterByToolType: initialFilterState,
  mediaTypeFilter: initialMediaTypeFilter,
  shotFilter: initialShotFilter,
  excludePositioned: initialExcludePositioned,
  showStarredOnly: initialStarredFilter,
  toolTypeFilterEnabled: initialToolTypeFilter,
  searchTerm: initialSearchTerm,
  isSearchOpen: !!initialSearchTerm,
});

// Optimized reducer with batched updates
const imageGalleryFiltersReducer = (
  state: ImageGalleryFiltersState,
  action: ImageGalleryFiltersAction
): ImageGalleryFiltersState => {
  switch (action.type) {
    case 'SET_FILTER_BY_TOOL_TYPE':
      return { ...state, filterByToolType: action.payload };
      
    case 'SET_MEDIA_TYPE_FILTER':
      return { ...state, mediaTypeFilter: action.payload };
      
    case 'SET_SHOT_FILTER':
      return { ...state, shotFilter: action.payload };
      
    case 'SET_EXCLUDE_POSITIONED':
      return { ...state, excludePositioned: action.payload };
      
    case 'SET_SHOW_STARRED_ONLY':
      return { ...state, showStarredOnly: action.payload };
      
    case 'SET_TOOL_TYPE_FILTER_ENABLED':
      return { ...state, toolTypeFilterEnabled: action.payload };
      
    case 'SET_SEARCH_TERM':
      return { 
        ...state, 
        searchTerm: action.payload,
        // Auto-open search if there's a term
        isSearchOpen: state.isSearchOpen || !!action.payload
      };
      
    case 'SET_IS_SEARCH_OPEN':
      return { ...state, isSearchOpen: action.payload };
      
    case 'TOGGLE_SEARCH':
      return {
        ...state,
        isSearchOpen: !state.isSearchOpen,
        // Clear search term if closing and no term exists
        searchTerm: !state.isSearchOpen || state.searchTerm ? state.searchTerm : '',
      };
      
    case 'CLEAR_SEARCH':
      return {
        ...state,
        searchTerm: '',
        isSearchOpen: false,
      };
      
    case 'TOGGLE_STARRED_FILTER':
      return { ...state, showStarredOnly: !state.showStarredOnly };
      
    case 'SYNC_EXTERNAL_FILTERS':
      return { ...state, ...action.payload };
      
    case 'RESET_FILTERS':
      return createInitialFiltersState();
      
    default:
      return state;
  }
};

export interface UseImageGalleryFiltersOptimizedProps {
  images: GeneratedImageWithMetadata[];
  optimisticDeletedIds: Set<string>;
  currentToolType?: string;
  initialFilterState?: boolean;
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
  initialShotFilter?: string;
  initialExcludePositioned?: boolean;
  initialSearchTerm?: string;
  initialStarredFilter?: boolean;
  initialToolTypeFilter?: boolean;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  onShotFilterChange?: (shotId: string) => void;
  onExcludePositionedChange?: (exclude: boolean) => void;
  onSearchChange?: (searchTerm: string) => void;
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onToolTypeFilterChange?: (enabled: boolean) => void;
}

export interface UseImageGalleryFiltersOptimizedReturn {
  // State
  filtersState: ImageGalleryFiltersState;
  
  // Individual state getters (for backward compatibility)
  filterByToolType: boolean;
  mediaTypeFilter: 'all' | 'image' | 'video';
  shotFilter: string;
  excludePositioned: boolean;
  showStarredOnly: boolean;
  toolTypeFilterEnabled: boolean;
  searchTerm: string;
  isSearchOpen: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
  
  // Actions
  setFilterByToolType: (enabled: boolean) => void;
  setMediaTypeFilter: (filter: 'all' | 'image' | 'video') => void;
  setShotFilter: (shotId: string) => void;
  setExcludePositioned: (exclude: boolean) => void;
  setShowStarredOnly: (starredOnly: boolean) => void;
  setToolTypeFilterEnabled: (enabled: boolean) => void;
  setSearchTerm: (term: string) => void;
  setIsSearchOpen: (open: boolean) => void;
  
  // Computed values
  filteredImages: GeneratedImageWithMetadata[];
  
  // Handlers
  handleShotFilterChange: (shotId: string) => void;
  handleExcludePositionedChange: (exclude: boolean) => void;
  handleSearchChange: (value: string) => void;
  toggleSearch: () => void;
  clearSearch: () => void;
  handleStarredFilterToggle: () => void;
}

export const useImageGalleryFiltersOptimized = ({
  images,
  optimisticDeletedIds,
  currentToolType,
  initialFilterState = true,
  initialMediaTypeFilter = 'all',
  initialShotFilter = 'all',
  initialExcludePositioned = true,
  initialSearchTerm = '',
  initialStarredFilter = false,
  initialToolTypeFilter = true,
  onServerPageChange,
  serverPage,
  onShotFilterChange,
  onExcludePositionedChange,
  onSearchChange,
  onMediaTypeFilterChange,
  onStarredFilterChange,
  onToolTypeFilterChange,
}: UseImageGalleryFiltersOptimizedProps): UseImageGalleryFiltersOptimizedReturn => {
  
  // Initialize state with useReducer instead of multiple useState calls
  const [filtersState, dispatch] = useReducer(
    imageGalleryFiltersReducer,
    createInitialFiltersState(
      initialFilterState,
      initialMediaTypeFilter,
      initialShotFilter,
      initialExcludePositioned,
      initialSearchTerm,
      initialStarredFilter,
      initialToolTypeFilter
    )
  );
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Sync external filter changes with internal state (batched)
  useEffect(() => {
    const externalUpdates: Partial<ImageGalleryFiltersState> = {};
    let hasUpdates = false;
    
    if (filtersState.shotFilter !== initialShotFilter) {
      externalUpdates.shotFilter = initialShotFilter;
      hasUpdates = true;
    }
    
    if (filtersState.excludePositioned !== initialExcludePositioned) {
      externalUpdates.excludePositioned = initialExcludePositioned;
      hasUpdates = true;
    }
    
    if (filtersState.mediaTypeFilter !== initialMediaTypeFilter) {
      externalUpdates.mediaTypeFilter = initialMediaTypeFilter;
      hasUpdates = true;
    }
    
    if (filtersState.showStarredOnly !== initialStarredFilter) {
      externalUpdates.showStarredOnly = initialStarredFilter;
      hasUpdates = true;
    }
    
    if (filtersState.toolTypeFilterEnabled !== initialToolTypeFilter) {
      externalUpdates.toolTypeFilterEnabled = initialToolTypeFilter;
      hasUpdates = true;
    }
    
    if (filtersState.searchTerm !== initialSearchTerm) {
      externalUpdates.searchTerm = initialSearchTerm;
      externalUpdates.isSearchOpen = !!initialSearchTerm; // Auto-open search if there's a term
      hasUpdates = true;
    }
    
    if (hasUpdates) {
      dispatch({ type: 'SYNC_EXTERNAL_FILTERS', payload: externalUpdates });
    }
  }, [
    initialShotFilter,
    initialExcludePositioned,
    initialMediaTypeFilter,
    initialStarredFilter,
    initialToolTypeFilter,
    initialSearchTerm,
    filtersState.shotFilter,
    filtersState.excludePositioned,
    filtersState.mediaTypeFilter,
    filtersState.showStarredOnly,
    filtersState.toolTypeFilterEnabled,
    filtersState.searchTerm
  ]);

  // Memoized action creators to prevent unnecessary re-renders
  const actions = useMemo(() => ({
    setFilterByToolType: (enabled: boolean) => 
      dispatch({ type: 'SET_FILTER_BY_TOOL_TYPE', payload: enabled }),
    setMediaTypeFilter: (filter: 'all' | 'image' | 'video') => 
      dispatch({ type: 'SET_MEDIA_TYPE_FILTER', payload: filter }),
    setShotFilter: (shotId: string) => 
      dispatch({ type: 'SET_SHOT_FILTER', payload: shotId }),
    setExcludePositioned: (exclude: boolean) => 
      dispatch({ type: 'SET_EXCLUDE_POSITIONED', payload: exclude }),
    setShowStarredOnly: (starredOnly: boolean) => 
      dispatch({ type: 'SET_SHOW_STARRED_ONLY', payload: starredOnly }),
    setToolTypeFilterEnabled: (enabled: boolean) => 
      dispatch({ type: 'SET_TOOL_TYPE_FILTER_ENABLED', payload: enabled }),
    setSearchTerm: (term: string) => 
      dispatch({ type: 'SET_SEARCH_TERM', payload: term }),
    setIsSearchOpen: (open: boolean) => 
      dispatch({ type: 'SET_IS_SEARCH_OPEN', payload: open }),
    toggleSearch: () => dispatch({ type: 'TOGGLE_SEARCH' }),
    clearSearch: () => dispatch({ type: 'CLEAR_SEARCH' }),
    handleStarredFilterToggle: () => dispatch({ type: 'TOGGLE_STARRED_FILTER' }),
  }), []);

  // Handlers with external callbacks
  const handleShotFilterChange = useMemo(() => (shotId: string) => {
    actions.setShotFilter(shotId);
    onShotFilterChange?.(shotId);
  }, [actions.setShotFilter, onShotFilterChange]);

  const handleExcludePositionedChange = useMemo(() => (exclude: boolean) => {
    actions.setExcludePositioned(exclude);
    onExcludePositionedChange?.(exclude);
  }, [actions.setExcludePositioned, onExcludePositionedChange]);

  const handleSearchChange = useMemo(() => (value: string) => {
    actions.setSearchTerm(value);
    onSearchChange?.(value);
  }, [actions.setSearchTerm, onSearchChange]);

  // Enhanced toggle search with focus management
  const toggleSearch = useMemo(() => () => {
    const wasOpen = filtersState.isSearchOpen;
    actions.toggleSearch();
    
    if (!wasOpen) {
      // Focus the input when opening
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else if (!filtersState.searchTerm) {
      // If closing and no search term, clear it
      handleSearchChange('');
    }
  }, [filtersState.isSearchOpen, filtersState.searchTerm, actions.toggleSearch, handleSearchChange]);

  // Enhanced clear search
  const clearSearch = useMemo(() => () => {
    actions.clearSearch();
    handleSearchChange('');
  }, [actions.clearSearch, handleSearchChange]);

  // Enhanced starred filter toggle with external callback
  const handleStarredFilterToggle = useMemo(() => () => {
    const newStarredOnly = !filtersState.showStarredOnly;
    actions.setShowStarredOnly(newStarredOnly);
    onStarredFilterChange?.(newStarredOnly);
  }, [filtersState.showStarredOnly, actions.setShowStarredOnly, onStarredFilterChange]);

  // Memoized computed filtered images (this is the expensive operation)
  const filteredImages = useMemo(() => {
    // Start with all images
    let currentFiltered = images;

    // 0. Apply optimistic deletion filter first
    currentFiltered = currentFiltered.filter(image => !optimisticDeletedIds.has(image.id));

    // 1. Apply tool_type filter (only in client pagination mode)
    const isServerPagination = !!(onServerPageChange && serverPage);
    if (!isServerPagination && filtersState.filterByToolType && filtersState.toolTypeFilterEnabled && currentToolType) {
      currentFiltered = currentFiltered.filter(image => {
        const metadata = image.metadata;
        if (!metadata || !metadata.tool_type) return false;
        
        if (currentToolType === 'edit-travel') {
          return metadata.tool_type.startsWith('edit-travel');
        }
        
        if (metadata.tool_type === currentToolType) return true;
        if (metadata.tool_type === `${currentToolType}-reconstructed-client`) return true;
        
        return metadata.tool_type === currentToolType;
      });
    }

    // 2. Apply mediaTypeFilter (only in client pagination mode)
    if (!isServerPagination && filtersState.mediaTypeFilter !== 'all') {
      currentFiltered = currentFiltered.filter(image => {
        const urlIsVideo = image.url && (image.url.toLowerCase().endsWith('.webm') || image.url.toLowerCase().endsWith('.mp4') || image.url.toLowerCase().endsWith('.mov'));
        const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;
        
        if (filtersState.mediaTypeFilter === 'image') {
          return !isActuallyVideo;
        }
        if (filtersState.mediaTypeFilter === 'video') {
          return isActuallyVideo;
        }
        return true;
      });
    }

    // 3. Apply starred filter (only in client pagination mode)
    if (!isServerPagination && filtersState.showStarredOnly) {
      currentFiltered = currentFiltered.filter(image => image.starred === true);
    }

    // 4. Search is now handled server-side for server pagination mode
    // For server pagination, search filtering is done in the SQL query
    // For client pagination, we still apply it here as a fallback
    if (!isServerPagination && filtersState.searchTerm.trim()) {
      currentFiltered = currentFiltered.filter(image => {
        const prompt = image.prompt || 
                      image.metadata?.prompt || 
                      (image.metadata as any)?.originalParams?.orchestrator_details?.prompt || 
                      '';
        return prompt.toLowerCase().includes(filtersState.searchTerm.toLowerCase());
      });
    }
        
    return currentFiltered;
  }, [
    images, 
    optimisticDeletedIds,
    filtersState.filterByToolType,
    filtersState.toolTypeFilterEnabled,
    filtersState.mediaTypeFilter,
    filtersState.showStarredOnly,
    filtersState.searchTerm,
    currentToolType,
    onServerPageChange,
    serverPage
  ]);

  return {
    // State
    filtersState,
    
    // Individual state getters (for backward compatibility)
    filterByToolType: filtersState.filterByToolType,
    mediaTypeFilter: filtersState.mediaTypeFilter,
    shotFilter: filtersState.shotFilter,
    excludePositioned: filtersState.excludePositioned,
    showStarredOnly: filtersState.showStarredOnly,
    toolTypeFilterEnabled: filtersState.toolTypeFilterEnabled,
    searchTerm: filtersState.searchTerm,
    isSearchOpen: filtersState.isSearchOpen,
    searchInputRef,
    
    // Actions
    ...actions,
    
    // Computed values
    filteredImages,
    
    // Handlers
    handleShotFilterChange,
    handleExcludePositionedChange,
    handleSearchChange,
    toggleSearch,
    clearSearch,
    handleStarredFilterToggle,
  };
};
