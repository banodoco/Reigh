import React from "react";
import { Search, X, Star, Download, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { ShotFilter } from "@/shared/components/ShotFilter";
import { ToolTypeFilter } from "./ToolTypeFilter";

export interface ImageGalleryFiltersProps {
  // Shot filter props
  showShotFilter?: boolean;
  allShots: Array<{ id: string; name: string }>;
  shotFilter: string;
  onShotFilterChange?: (shotId: string) => void;
  excludePositioned: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
  whiteText?: boolean;
  
  // Search props
  showSearch?: boolean;
  isSearchOpen: boolean;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  toggleSearch: () => void;
  clearSearch: () => void;
  handleSearchChange: (value: string) => void;
  
  // Media type filter props
  hideTopFilters?: boolean;
  showStarredOnly: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onDownloadStarred?: () => void;
  isDownloadingStarred?: boolean;
  
  // Tool type filter props
  toolTypeFilterEnabled?: boolean;
  onToolTypeFilterChange?: (enabled: boolean) => void;
  currentToolTypeName?: string;
  
  // Mobile props
  isMobile?: boolean;
}

export const ImageGalleryFilters: React.FC<ImageGalleryFiltersProps> = ({
  showShotFilter = false,
  allShots,
  shotFilter,
  onShotFilterChange,
  excludePositioned,
  onExcludePositionedChange,
  whiteText = false,
  showSearch = false,
  isSearchOpen,
  searchTerm,
  searchInputRef,
  toggleSearch,
  clearSearch,
  handleSearchChange,
  hideTopFilters = false,
  showStarredOnly,
  onStarredFilterChange,
  onDownloadStarred,
  isDownloadingStarred,
  toolTypeFilterEnabled = true,
  onToolTypeFilterChange,
  currentToolTypeName,
  isMobile = false,
}) => {
  return (
    <div className="flex justify-between items-center w-full gap-3">
      {/* Left side filters */}
      <div className="flex items-center gap-3">
        {/* Shot Filter */}
        {showShotFilter && (
          <ShotFilter
            shots={allShots || []}
            selectedShotId={shotFilter}
            onShotChange={onShotFilterChange}
            excludePositioned={excludePositioned}
            onExcludePositionedChange={onExcludePositionedChange}
            size="sm"
            whiteText={whiteText}
            checkboxId="exclude-positioned-image-gallery"
            triggerWidth="w-[120px] sm:w-[140px]"
            triggerClassName={`h-8 text-xs ${whiteText ? 'bg-zinc-800 border-zinc-600 text-white' : ''}`}
          />
        )}

        {/* Search */}
        {showSearch && (
          <div className="flex items-center">
            {!isSearchOpen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSearch}
                className={`h-8 px-2 ${whiteText ? 'text-white border-zinc-600 hover:bg-zinc-700' : ''}`}
                aria-label="Search prompts"
              >
                <Search className="h-4 w-4" />
              </Button>
            ) : (
              <div className={`flex items-center space-x-2 border rounded-md px-3 py-1 h-8 ${whiteText ? 'bg-zinc-800 border-zinc-600' : 'bg-background'}`}>
                <Search className={`h-4 w-4 ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search prompts..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`bg-transparent border-none outline-none text-base w-32 sm:w-40 ${whiteText ? 'text-white placeholder-zinc-400' : ''}`}
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSearch}
                    className="h-auto p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tool Type Filter - Show only when currentToolTypeName is provided */}
        {currentToolTypeName && (
          <ToolTypeFilter
            enabled={toolTypeFilterEnabled}
            onToggle={onToolTypeFilterChange || (() => {})}
            toolTypeName={currentToolTypeName}
            whiteText={whiteText}
            isMobile={isMobile}
          />
        )}
      </div>
      
      {/* Right side filters */}
      <div className="flex items-center gap-3">
        {/* Starred Filter */}
        {!hideTopFilters && (
          <div className="flex items-center space-x-3">
              <Button
                  variant="ghost"
                  size="sm"
                  className={`p-1 h-8 w-8 ${whiteText ? 'text-zinc-400 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => onStarredFilterChange?.(!showStarredOnly)}
                  aria-label={showStarredOnly ? "Hide starred items" : "Show only starred items"}
              >
                  <Star
                      className="h-5 w-5"
                      fill={showStarredOnly ? 'currentColor' : 'none'}
                  />
              </Button>
              {/* {onDownloadStarred && showStarredOnly && (
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
              )} */}
          </div>
        )}
      </div>
    </div>
  );
};
