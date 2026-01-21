import { useLayoutEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Search, X } from 'lucide-react';
import { useToolPageHeader } from '@/shared/contexts/ToolPageHeaderContext';
import { Shot } from '@/types/shots';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface UseVideoTravelHeaderProps {
  shouldShowShotEditor: boolean;
  hashShotId: string;
  showVideosView: boolean;
  isLoading: boolean;
  shots: Shot[] | undefined;
  shotSearchQuery: string;
  onSearchQueryChange: (query: string) => void;
  clearSearch: () => void;
  shotSortMode: 'ordered' | 'newest' | 'oldest';
  onSortModeChange: (mode: 'ordered' | 'newest' | 'oldest') => void;
  onCreateNewShot: () => void;
  onToggleVideosView: (e: React.MouseEvent<HTMLButtonElement>) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  isSearchOpen?: boolean;
  onSearchToggle?: () => void;
}

/**
 * Custom hook to manage the Video Travel tool page header
 * Handles dynamic header content based on view state (shot list vs videos vs shot editor)
 */
export const useVideoTravelHeader = ({
  shouldShowShotEditor,
  hashShotId,
  showVideosView,
  isLoading,
  shots,
  shotSearchQuery,
  onSearchQueryChange,
  clearSearch,
  shotSortMode,
  onSortModeChange,
  onCreateNewShot,
  onToggleVideosView,
  searchInputRef,
  isSearchOpen = false,
  onSearchToggle,
}: UseVideoTravelHeaderProps) => {
  const { setHeader, clearHeader } = useToolPageHeader();
  const isMobile = useIsMobile();

  // Set up the page header with dynamic content based on state
  // Only show header when we're NOT viewing a specific shot
  useLayoutEffect(() => {
    if (shouldShowShotEditor || hashShotId) {
      // Clear header when viewing a specific shot
      clearHeader();
    } else {
      // Show header when in shot list or videos view
      const headerContent = (
        <div className="mb-2 sm:mb-4 mt-4 sm:mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-end gap-4">
              <h1 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl">
                {showVideosView ? 'Videos' : 'Shots'}
              </h1>
              <button
                onClick={onToggleVideosView}
                className="text-sm text-muted-foreground hover:text-foreground focus:text-foreground transition-colors underline mb-1.5 focus:outline-none"
              >
                {showVideosView ? 'See all shots' : 'See all videos'}
              </button>
            </div>
            {/* Right side: Search icon (mobile) or New Shot button */}
            <div className="flex items-center gap-2">
              {/* Mobile: Search icon button */}
              {isMobile && !showVideosView && shots && shots.length > 0 && onSearchToggle && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={onSearchToggle}
                  title={isSearchOpen ? "Close search" : "Search shots"}
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
              {/* Desktop: Always show New Shot button when available */}
              {!showVideosView && !isLoading && shots && shots.length > 0 && (
                <Button onClick={onCreateNewShot}>New Shot</Button>
              )}
            </div>
          </div>
          
          {/* Mobile: Search box appears below full width when open */}
          {isMobile && !showVideosView && shots && shots.length > 0 && (
            <div 
              className={cn(
                "overflow-hidden transition-all duration-200 ease-out",
                isSearchOpen ? "max-h-14 opacity-100 mb-4" : "max-h-0 opacity-0"
              )}
            >
              <div className="w-full">
                <div className="flex items-center space-x-2 border rounded-md px-3 py-1 h-8 bg-background w-full">
                  <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search shots..."
                    value={shotSearchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                    className="bg-transparent border-none outline-none text-base flex-1 preserve-case"
                    style={{ fontSize: '16px' }} // Prevents iOS auto-zoom on focus
                  />
                  {shotSearchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSearch}
                      className="h-auto p-0.5 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Desktop: Search box inline - only show when in shots view and there are shots */}
          {!isMobile && !showVideosView && shots && shots.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 border rounded-md px-3 py-1 h-8 bg-background w-full max-w-xs">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search shots..."
                  value={shotSearchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  className="bg-transparent border-none outline-none text-base flex-1 preserve-case"
                  style={{ fontSize: '16px' }} // Prevents iOS auto-zoom on focus
                />
                {shotSearchQuery && (
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
              
              {/* Sort mode buttons */}
              <div className="flex items-center space-x-2 mt-4 mb-1">
                <button
                  onClick={() => onSortModeChange('ordered')}
                  className={`text-base px-3 py-1 rounded-md transition-colors ${
                    shotSortMode === 'ordered' 
                      ? 'bg-foreground/20 text-foreground font-medium' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Ordered
                </button>
                <button
                  onClick={() => onSortModeChange('newest')}
                  className={`text-base px-3 py-1 rounded-md transition-colors ${
                    shotSortMode === 'newest' 
                      ? 'bg-foreground/20 text-foreground font-medium' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Newest First
                </button>
                <button
                  onClick={() => onSortModeChange('oldest')}
                  className={`text-base px-3 py-1 rounded-md transition-colors ${
                    shotSortMode === 'oldest' 
                      ? 'bg-foreground/20 text-foreground font-medium' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Oldest First
                </button>
              </div>
            </div>
          )}
          
          {/* Mobile: Sort mode buttons - show below search when search is open, or always if no search */}
          {isMobile && !showVideosView && shots && shots.length > 0 && (
            <div className={cn(
              "flex items-center space-x-2 mb-1",
              isSearchOpen ? "mt-4" : "mt-0"
            )}>
              <button
                onClick={() => onSortModeChange('ordered')}
                className={`text-base px-3 py-1 rounded-md transition-colors ${
                  shotSortMode === 'ordered' 
                    ? 'bg-foreground/20 text-foreground font-medium' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Ordered
              </button>
              <button
                onClick={() => onSortModeChange('newest')}
                className={`text-base px-3 py-1 rounded-md transition-colors ${
                  shotSortMode === 'newest' 
                    ? 'bg-foreground/20 text-foreground font-medium' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Newest First
              </button>
              <button
                onClick={() => onSortModeChange('oldest')}
                className={`text-base px-3 py-1 rounded-md transition-colors ${
                  shotSortMode === 'oldest' 
                    ? 'bg-foreground/20 text-foreground font-medium' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Oldest First
              </button>
            </div>
          )}
        </div>
      );
      setHeader(headerContent);
    }
  }, [
    setHeader,
    clearHeader,
    isLoading,
    shots,
    shouldShowShotEditor,
    hashShotId,
    showVideosView,
    shotSearchQuery,
    clearSearch,
    shotSortMode,
    onSortModeChange,
    onCreateNewShot,
    onToggleVideosView,
    onSearchQueryChange,
    searchInputRef,
    isSearchOpen,
    onSearchToggle,
    isMobile,
  ]);

  // Clean up header on component unmount
  useLayoutEffect(() => {
    return () => clearHeader();
  }, [clearHeader]);
};

