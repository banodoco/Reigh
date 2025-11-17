import React from "react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Star, Download, Loader2 } from "lucide-react";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { ImageGalleryPagination } from "@/shared/components/ImageGalleryPagination";
import { ShotFilter } from "@/shared/components/ShotFilter";
import { ImageGalleryFilters } from "./ImageGalleryFilters";

export interface ImageGalleryHeaderProps {
  // Pagination props
  totalPages: number;
  page: number;
  isServerPagination: boolean;
  serverPage?: number;
  rangeStart: number;
  rangeEnd: number;
  totalFilteredItems: number;
  loadingButton: 'prev' | 'next' | null;
  whiteText?: boolean;
  reducedSpacing?: boolean;
  hidePagination?: boolean;
  onPageChange: (newPage: number, direction: 'prev' | 'next', fromBottom?: boolean) => void;
  
  // Filter props
  hideTopFilters?: boolean;
  showStarredOnly: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onDownloadStarred?: () => void;
  isDownloadingStarred?: boolean;
  
  // Shot filter props
  showShotFilter?: boolean;
  allShots: Array<{ id: string; name: string }>;
  shotFilter: string;
  onShotFilterChange?: (shotId: string) => void;
  excludePositioned: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
  
  // Search props
  showSearch?: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  toggleSearch: () => void;
  clearSearch: () => void;
  handleSearchChange: (value: string) => void;
  
  // Media type filter props
  mediaTypeFilter: 'all' | 'image' | 'video';
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  
  // Tool type filter props
  toolTypeFilterEnabled?: boolean;
  onToolTypeFilterChange?: (enabled: boolean) => void;
  currentToolTypeName?: string;
  
  // Mobile props
  isMobile?: boolean;
}

export const ImageGalleryHeader: React.FC<ImageGalleryHeaderProps> = ({
  // Pagination props
  totalPages,
  page,
  isServerPagination,
  serverPage,
  rangeStart,
  rangeEnd,
  totalFilteredItems,
  loadingButton,
  whiteText = false,
  reducedSpacing = false,
  hidePagination = false,
  onPageChange,
  
  // Filter props
  hideTopFilters = false,
  showStarredOnly,
  onStarredFilterChange,
  onDownloadStarred,
  isDownloadingStarred = false,
  
  // Shot filter props
  showShotFilter = false,
  allShots,
  shotFilter,
  onShotFilterChange,
  excludePositioned,
  onExcludePositionedChange,
  
  // Search props
  showSearch = false,
  isSearchOpen,
  setIsSearchOpen,
  searchTerm,
  searchInputRef,
  toggleSearch,
  clearSearch,
  handleSearchChange,
  
  // Media type filter props
  mediaTypeFilter,
  onMediaTypeFilterChange,
  
  // Tool type filter props
  toolTypeFilterEnabled,
  onToolTypeFilterChange,
  currentToolTypeName,
  
  // Mobile props
  isMobile = false,
}) => {
  return (
    <div className="mt-0 space-y-3">
      {/* Top Pagination */}
      <div data-pagination-top>
        <ImageGalleryPagination
          totalPages={totalPages}
          currentPage={page}
          isServerPagination={isServerPagination}
          serverPage={serverPage}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalFilteredItems={totalFilteredItems}
          loadingButton={loadingButton}
          whiteText={whiteText}
          reducedSpacing={reducedSpacing}
          hidePagination={hidePagination}
          onPageChange={onPageChange}
          compact={true}
          isBottom={false}
          rightContent={!hideTopFilters ? (
            <div className="flex items-center">
              <Select value={mediaTypeFilter} onValueChange={(value: 'all' | 'image' | 'video') => {
                onMediaTypeFilterChange?.(value);
              }}>
                <SelectTrigger id="media-type-filter" className={`h-8 text-xs w-[80px] ${whiteText ? 'bg-zinc-800 border-zinc-700 text-white' : ''}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                  <SelectItem value="image" className="text-xs">Images</SelectItem>
                  <SelectItem value="video" className="text-xs">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : undefined}
        />
      </div>
      
      {/* Single page display with starred filter - only show when pagination is hidden */}
      {totalPages === 1 && !hidePagination && (
        <div className="flex justify-between items-center">
          <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
            Showing {rangeStart}-{rangeEnd} of {totalFilteredItems}
          </span>
        
          {/* Media Type Filter on the right */}
          {!hideTopFilters && (
            <div className="flex items-center">
              <Select value={mediaTypeFilter} onValueChange={(value: 'all' | 'image' | 'video') => {
                onMediaTypeFilterChange?.(value);
              }}>
                <SelectTrigger id="media-type-filter-single" className={`h-8 text-xs w-[80px] ${whiteText ? 'bg-zinc-800 border-zinc-700 text-white' : ''}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                  <SelectItem value="image" className="text-xs">Images</SelectItem>
                  <SelectItem value="video" className="text-xs">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Filters row */}
      <ImageGalleryFilters
        showShotFilter={showShotFilter}
        allShots={allShots}
        shotFilter={shotFilter}
        onShotFilterChange={onShotFilterChange}
        excludePositioned={excludePositioned}
        onExcludePositionedChange={onExcludePositionedChange}
        whiteText={whiteText}
        showSearch={showSearch}
        isSearchOpen={isSearchOpen}
        searchTerm={searchTerm}
        searchInputRef={searchInputRef}
        toggleSearch={toggleSearch}
        clearSearch={clearSearch}
        handleSearchChange={handleSearchChange}
        hideTopFilters={hideTopFilters}
        showStarredOnly={showStarredOnly}
        onStarredFilterChange={onStarredFilterChange}
        onDownloadStarred={onDownloadStarred}
        isDownloadingStarred={isDownloadingStarred}
        toolTypeFilterEnabled={toolTypeFilterEnabled}
        onToolTypeFilterChange={onToolTypeFilterChange}
        currentToolTypeName={currentToolTypeName}
        isMobile={isMobile}
      />
    </div>
  );
};
