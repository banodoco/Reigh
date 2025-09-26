import React from "react";
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
            <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                    <Checkbox 
                        id="starred-filter-gallery"
                        checked={showStarredOnly}
                        onCheckedChange={(checked) => {
                            const newStarredOnly = Boolean(checked);
                            onStarredFilterChange?.(newStarredOnly);
                        }}
                        className={whiteText ? "border-zinc-600 data-[state=checked]:bg-zinc-600" : ""}
                    />
                    <Label 
                        htmlFor="starred-filter-gallery" 
                        className={`text-xs cursor-pointer flex items-center space-x-1 ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`}
                    >
                        <Star className="h-3 w-3" />
                        <span>Starred</span>
                    </Label>
                </div>
                {onDownloadStarred && showStarredOnly && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDownloadStarred}
                        disabled={isDownloadingStarred}
                        className={`text-xs h-6 px-2 ${whiteText ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {isDownloadingStarred ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                            <Download className="h-3 w-3 mr-1" />
                        )}
                        <span>Download all starred</span>
                    </Button>
                )}
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
        
          {/* Starred Filter on the right */}
          {!hideTopFilters && (
            <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                    <Checkbox 
                        id="starred-filter-gallery-single"
                        checked={showStarredOnly}
                        onCheckedChange={(checked) => {
                            const newStarredOnly = Boolean(checked);
                            onStarredFilterChange?.(newStarredOnly);
                        }}
                        className={whiteText ? "border-zinc-600 data-[state=checked]:bg-zinc-600" : ""}
                    />
                    <Label 
                        htmlFor="starred-filter-gallery-single" 
                        className={`text-xs cursor-pointer flex items-center space-x-1 ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`}
                    >
                        <Star className="h-3 w-3" />
                        <span>Starred</span>
                    </Label>
                </div>
                {onDownloadStarred && showStarredOnly && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDownloadStarred}
                        disabled={isDownloadingStarred}
                        className={`text-xs h-6 px-2 ${whiteText ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {isDownloadingStarred ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                            <Download className="h-3 w-3 mr-1" />
                        )}
                        <span>Download all starred</span>
                    </Button>
                )}
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
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeFilterChange={onMediaTypeFilterChange}
        toolTypeFilterEnabled={toolTypeFilterEnabled}
        onToolTypeFilterChange={onToolTypeFilterChange}
        currentToolTypeName={currentToolTypeName}
        isMobile={isMobile}
      />
    </div>
  );
};
