/**
 * List Header Component for VideoTravelToolPage
 * 
 * Renders the header controls for the list view:
 * - Shots/Videos segmented control
 * - Search (desktop inline, mobile collapsible)
 * - Sort toggle
 * 
 * @see VideoTravelToolPage.tsx - Parent page component
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { Search, ArrowDown, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// =============================================================================
// PROP TYPES (grouped for clarity)
// =============================================================================

export interface ViewModeProps {
  showVideosView: boolean;
  setViewMode: (mode: 'shots' | 'videos', opts?: { blurTarget?: HTMLElement | null }) => void;
}

export interface SearchProps {
  isMobile: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  handleSearchToggle: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  // Shots search
  shotSearchQuery: string;
  setShotSearchQuery: (query: string) => void;
  // Videos search
  videoSearchTerm: string;
  setVideoSearchTerm: (term: string) => void;
  setVideoPage: (page: number) => void;
}

export interface SortProps {
  showVideosView: boolean;
  shotSortMode: 'ordered' | 'newest' | 'oldest';
  setShotSortMode: (mode: 'ordered' | 'newest' | 'oldest') => void;
  videoSortMode: 'newest' | 'oldest';
  setVideoSortMode: (mode: 'newest' | 'oldest') => void;
  setVideoPage: (page: number) => void;
}

export interface VideoTravelListHeaderProps {
  viewMode: ViewModeProps;
  search: SearchProps;
  sort: SortProps;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const VideoTravelListHeader: React.FC<VideoTravelListHeaderProps> = ({
  viewMode,
  search,
  sort,
}) => {
  const { showVideosView, setViewMode } = viewMode;
  
  const {
    isMobile,
    isSearchOpen,
    setIsSearchOpen,
    handleSearchToggle,
    searchInputRef,
    shotSearchQuery,
    setShotSearchQuery,
    videoSearchTerm,
    setVideoSearchTerm,
    setVideoPage: setVideoPageSearch,
  } = search;

  const {
    shotSortMode,
    setShotSortMode,
    videoSortMode,
    setVideoSortMode,
    setVideoPage: setVideoPageSort,
  } = sort;

  return (
    <div className="px-4 max-w-7xl mx-auto pt-6 pb-4">
      {/* Controls row - all on one line */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Left side: Shots vs Videos Toggle - styled as header */}
        <SegmentedControl
          value={showVideosView ? 'videos' : 'shots'}
          onValueChange={(value) => {
            console.log('[ViewToggleDebug] onValueChange fired', { value, showVideosView });
            setViewMode(value === 'videos' ? 'videos' : 'shots');
          }}
          onClick={(e) => {
            console.log('[ViewToggleDebug] SegmentedControl onClick', { target: (e.target as HTMLElement)?.textContent });
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1"
        >
          <SegmentedControlItem
            value="shots"
            className="text-lg font-light px-5 py-0"
            onClick={(e) => {
              console.log('[ViewToggleDebug] Shots item onClick FIRED', { showVideosView });
              e.stopPropagation();
              setViewMode('shots', { blurTarget: e.currentTarget });
            }}
          >
            Shots
          </SegmentedControlItem>
          <SegmentedControlItem
            value="videos"
            className="text-lg font-light px-5 py-0"
            onClick={(e) => {
              console.log('[ViewToggleDebug] Videos item onClick FIRED', { showVideosView, willSwitchTo: showVideosView ? 'shots' : 'videos' });
              e.stopPropagation();
              setViewMode(showVideosView ? 'shots' : 'videos', { blurTarget: e.currentTarget });
            }}
          >
            Videos
          </SegmentedControlItem>
        </SegmentedControl>

        {/* Mobile: Search icon button */}
        {isMobile && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-1"
            onClick={handleSearchToggle}
            title={isSearchOpen ? "Close search" : (showVideosView ? "Search videos" : "Search shots")}
          >
            <Search className="h-4 w-4" />
          </Button>
        )}

        {/* Desktop: Search - Shots view */}
        {!isMobile && !showVideosView && (
          <div className="relative w-28 sm:w-52">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Search className="h-3.5 w-3.5" />
            </div>
            <Input
              ref={searchInputRef}
              placeholder="Search..."
              value={shotSearchQuery}
              onChange={(e) => setShotSearchQuery(e.target.value)}
              className="h-8 text-xs pl-8"
            />
          </div>
        )}

        {/* Desktop: Search - Videos view */}
        {!isMobile && showVideosView && (
          <div className="relative w-28 sm:w-52">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Search className="h-3.5 w-3.5" />
            </div>
            <Input
              placeholder="Search..."
              value={videoSearchTerm}
              onChange={(e) => {
                setVideoSearchTerm(e.target.value);
                setVideoPageSearch(1);
              }}
              className="h-8 text-xs pl-8"
            />
          </div>
        )}

        {/* Right side: Sort toggle - always right-aligned */}
        {!showVideosView && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs ml-auto"
            onClick={() => setShotSortMode(shotSortMode === 'oldest' ? 'newest' : 'oldest')}
            title={`Currently showing ${shotSortMode === 'ordered' ? 'newest' : shotSortMode} first. Click to toggle.`}
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1" />
            {(shotSortMode === 'oldest') ? 'Oldest first' : 'Newest first'}
          </Button>
        )}

        {showVideosView && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs ml-auto"
            onClick={() => {
              setVideoSortMode(videoSortMode === 'oldest' ? 'newest' : 'oldest');
              setVideoPageSort(1);
            }}
            title={`Currently showing ${videoSortMode} first. Click to toggle.`}
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1" />
            {videoSortMode === 'oldest' ? 'Oldest first' : 'Newest first'}
          </Button>
        )}
      </div>
      
      {/* Mobile: Search box appears below full width when open */}
      {isMobile && (
        <div 
          className={cn(
            "overflow-hidden transition-all duration-200 ease-out w-full",
            isSearchOpen ? "max-h-14 opacity-100 mt-3" : "max-h-0 opacity-0"
          )}
        >
          <div className="flex items-center space-x-2 border rounded-md px-3 py-1 h-8 bg-background w-full">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={showVideosView ? "Search videos..." : "Search shots..."}
              value={showVideosView ? videoSearchTerm : shotSearchQuery}
              onChange={(e) => {
                if (showVideosView) {
                  setVideoSearchTerm(e.target.value);
                  setVideoPageSearch(1);
                } else {
                  setShotSearchQuery(e.target.value);
                }
              }}
              className="bg-transparent border-none outline-none text-base flex-1"
              style={{ fontSize: '16px' }} // Prevents iOS auto-zoom on focus
            />
            {(showVideosView ? videoSearchTerm : shotSearchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (showVideosView) {
                    setVideoSearchTerm('');
                  } else {
                    setShotSearchQuery('');
                  }
                  setIsSearchOpen(false);
                }}
                className="h-auto p-0.5 flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoTravelListHeader;
