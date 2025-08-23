import { useState, useEffect, useMemo, useRef } from 'react';
import { GeneratedImageWithMetadata } from '../ImageGallery';

export interface UseImageGalleryFiltersProps {
  images: GeneratedImageWithMetadata[];
  optimisticDeletedIds: Set<string>;
  currentToolType?: string;
  initialFilterState?: boolean;
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
  initialShotFilter?: string;
  initialExcludePositioned?: boolean;
  initialSearchTerm?: string;
  initialStarredFilter?: boolean;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  onShotFilterChange?: (shotId: string) => void;
  onExcludePositionedChange?: (exclude: boolean) => void;
  onSearchChange?: (searchTerm: string) => void;
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onToolTypeFilterChange?: (enabled: boolean) => void;
}

export interface UseImageGalleryFiltersReturn {
  // Filter states
  filterByToolType: boolean;
  setFilterByToolType: (enabled: boolean) => void;
  mediaTypeFilter: 'all' | 'image' | 'video';
  setMediaTypeFilter: (filter: 'all' | 'image' | 'video') => void;
  shotFilter: string;
  setShotFilter: (shotId: string) => void;
  excludePositioned: boolean;
  setExcludePositioned: (exclude: boolean) => void;
  showStarredOnly: boolean;
  setShowStarredOnly: (starredOnly: boolean) => void;
  
  // Search state
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  
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

export const useImageGalleryFilters = ({
  images,
  optimisticDeletedIds,
  currentToolType,
  initialFilterState = true,
  initialMediaTypeFilter = 'all',
  initialShotFilter = 'all',
  initialExcludePositioned = true,
  initialSearchTerm = '',
  initialStarredFilter = false,
  onServerPageChange,
  serverPage,
  onShotFilterChange,
  onExcludePositionedChange,
  onSearchChange,
  onMediaTypeFilterChange,
  onStarredFilterChange,
  onToolTypeFilterChange,
}: UseImageGalleryFiltersProps): UseImageGalleryFiltersReturn => {
  
  // Filter states
  const [filterByToolType, setFilterByToolType] = useState<boolean>(initialFilterState);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>(initialMediaTypeFilter);
  const [shotFilter, setShotFilter] = useState<string>(initialShotFilter);
  const [excludePositioned, setExcludePositioned] = useState<boolean>(initialExcludePositioned);
  const [showStarredOnly, setShowStarredOnly] = useState<boolean>(initialStarredFilter);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState<string>(initialSearchTerm);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(!!initialSearchTerm);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Sync external filter changes with internal state
  useEffect(() => {
    setShotFilter(initialShotFilter);
  }, [initialShotFilter]);

  useEffect(() => {
    setExcludePositioned(initialExcludePositioned);
  }, [initialExcludePositioned]);

  useEffect(() => {
    setMediaTypeFilter(initialMediaTypeFilter);
  }, [initialMediaTypeFilter]);

  useEffect(() => {
    setShowStarredOnly(initialStarredFilter);
  }, [initialStarredFilter]);

  // Update search visibility based on search term
  useEffect(() => {
    if (searchTerm && !isSearchOpen) {
      setIsSearchOpen(true);
    }
  }, [searchTerm, isSearchOpen]);

  // Handlers
  const handleShotFilterChange = (shotId: string) => {
    setShotFilter(shotId);
    onShotFilterChange?.(shotId);
  };

  const handleExcludePositionedChange = (exclude: boolean) => {
    setExcludePositioned(exclude);
    onExcludePositionedChange?.(exclude);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onSearchChange?.(value);
  };

  // Toggle search box visibility
  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen);
    if (!isSearchOpen) {
      // Focus the input when opening
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else if (!searchTerm) {
      // If closing and no search term, clear it
      handleSearchChange('');
    }
  };

  // Clear search
  const clearSearch = () => {
    handleSearchChange('');
    setIsSearchOpen(false);
  };

  // Handle starred filter toggle
  const handleStarredFilterToggle = () => {
    setShowStarredOnly(prev => {
      const newStarredOnly = !prev;
      onStarredFilterChange?.(newStarredOnly);
      return newStarredOnly;
    });
  };

  // Computed filtered images
  const filteredImages = useMemo(() => {
    // Start with all images
    let currentFiltered = images;

    // 0. Apply optimistic deletion filter first
    currentFiltered = currentFiltered.filter(image => !optimisticDeletedIds.has(image.id));

    // 1. Apply tool_type filter (only in client pagination mode)
    const isServerPagination = !!(onServerPageChange && serverPage);
    if (!isServerPagination && filterByToolType && currentToolType) {
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
    if (!isServerPagination && mediaTypeFilter !== 'all') {
      currentFiltered = currentFiltered.filter(image => {
        const urlIsVideo = image.url && (image.url.toLowerCase().endsWith('.webm') || image.url.toLowerCase().endsWith('.mp4') || image.url.toLowerCase().endsWith('.mov'));
        const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;
        
        if (mediaTypeFilter === 'image') {
          return !isActuallyVideo;
        }
        if (mediaTypeFilter === 'video') {
          return isActuallyVideo;
        }
        return true;
      });
    }

    // 3. Apply starred filter (only in client pagination mode)
    if (!isServerPagination && showStarredOnly) {
      currentFiltered = currentFiltered.filter(image => image.starred === true);
    }

    // 4. Search is now handled server-side for server pagination mode
    // For server pagination, search filtering is done in the SQL query
    // For client pagination, we still apply it here as a fallback
    if (!isServerPagination && searchTerm.trim()) {
      currentFiltered = currentFiltered.filter(image => {
        const prompt = image.prompt || 
                      image.metadata?.prompt || 
                      (image.metadata as any)?.originalParams?.orchestrator_details?.prompt || 
                      '';
        return prompt.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }
        
    return currentFiltered;
  }, [images, filterByToolType, currentToolType, mediaTypeFilter, searchTerm, showStarredOnly, onServerPageChange, serverPage, optimisticDeletedIds]);

  return {
    // Filter states
    filterByToolType,
    setFilterByToolType,
    mediaTypeFilter,
    setMediaTypeFilter,
    shotFilter,
    setShotFilter,
    excludePositioned,
    setExcludePositioned,
    showStarredOnly,
    setShowStarredOnly,
    
    // Search state
    searchTerm,
    setSearchTerm,
    isSearchOpen,
    setIsSearchOpen,
    searchInputRef,
    
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
