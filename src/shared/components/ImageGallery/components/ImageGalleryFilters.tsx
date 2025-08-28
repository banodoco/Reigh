import React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  mediaTypeFilter: 'all' | 'image' | 'video';
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  
  // Tool type filter props
  toolTypeFilterEnabled?: boolean;
  onToolTypeFilterChange?: (enabled: boolean) => void;
  currentToolTypeName?: string;
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
  mediaTypeFilter,
  onMediaTypeFilterChange,
  toolTypeFilterEnabled = true,
  onToolTypeFilterChange,
  currentToolTypeName,
}) => {
  return (
    <div className="flex justify-between items-center flex-wrap gap-y-2">
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
            triggerWidth="w-[140px]"
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
          />
        )}
      </div>
      
      {/* Right side filters */}
      <div className="flex items-center gap-3">
        {/* Media Type Filter */}
        {!hideTopFilters && (
          <div className="flex items-center space-x-2">
            <Label htmlFor="media-type-filter" className={`text-xs ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`}>Type:</Label>
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
        )}
      </div>
    </div>
  );
};
