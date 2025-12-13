import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface ImageGalleryPaginationProps {
  totalPages: number;
  currentPage: number;
  isServerPagination?: boolean;
  serverPage?: number;
  rangeStart: number;
  rangeEnd: number;
  totalFilteredItems: number;
  loadingButton: string | null;
  whiteText?: boolean;
  reducedSpacing?: boolean;
  hidePagination?: boolean;
  onPageChange: (page: number, direction: 'next' | 'prev', fromBottom?: boolean) => void;
  /** Show only pagination controls without range text (for top pagination) */
  compact?: boolean;
  /** Additional content to show on the right side (e.g., filters) */
  rightContent?: React.ReactNode;
  /** Whether this is positioned at the bottom (controls scroll behavior) */
  isBottom?: boolean;
}

export const ImageGalleryPagination: React.FC<ImageGalleryPaginationProps> = ({
  totalPages,
  currentPage,
  isServerPagination = false,
  serverPage,
  rangeStart,
  rangeEnd,
  totalFilteredItems,
  loadingButton,
  whiteText = false,
  reducedSpacing = false,
  hidePagination = false,
  onPageChange,
  compact = false,
  rightContent,
  isBottom = false,
}) => {
  // All hooks must be called before any early returns
  const [showStickyPagination, setShowStickyPagination] = useState(false);
  const topPaginationRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  
  // Get pane states to adjust sticky pagination position
  const { 
    isShotsPaneLocked, 
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();

  // Scroll detection for sticky pagination
  useEffect(() => {
    if (!isBottom) return;

    const handleScroll = () => {
      // Find the top pagination element
      const topPagination = document.querySelector('[data-pagination-top]');
      if (topPagination) {
        const rect = topPagination.getBoundingClientRect();
        // Show sticky pagination when top pagination is partially hidden (more responsive)
        // Using a threshold so it appears before completely scrolling past
        const threshold = 100; // Show when top pagination is 100px above viewport
        setShowStickyPagination(rect.bottom < threshold);
      }
    };

    window.addEventListener('scroll', handleScroll);
    // Use a small timeout to ensure DOM is ready
    const timeout = setTimeout(handleScroll, 100);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeout);
    };
  }, [isBottom]);

  // Don't render if conditions not met - AFTER all hooks
  if (totalPages <= 1 || hidePagination) {
    return null;
  }

  const handlePrevPage = (e: React.MouseEvent, preventScroll = false) => {
    e.preventDefault(); // Prevent any default scroll behavior
    const newPage = isServerPagination 
      ? Math.max(1, serverPage! - 1)
      : Math.max(0, currentPage - 1);
    // Don't scroll to top when using sticky pagination
    onPageChange(newPage, 'prev', isBottom && !preventScroll);
  };

  const handleNextPage = (e: React.MouseEvent, preventScroll = false) => {
    e.preventDefault(); // Prevent any default scroll behavior
    const newPage = isServerPagination 
      ? serverPage! + 1
      : Math.min(totalPages - 1, currentPage + 1);
    // Don't scroll to top when using sticky pagination
    onPageChange(newPage, 'next', isBottom && !preventScroll);
  };

  const handlePageSelect = (pageStr: string, preventScroll = false) => {
    const newPage = isServerPagination ? parseInt(pageStr) : parseInt(pageStr) - 1;
    const direction = newPage > (isServerPagination ? serverPage! : currentPage) ? 'next' : 'prev';
    // Don't scroll to top when using sticky pagination
    onPageChange(newPage, direction, isBottom && !preventScroll);
  };

  const currentDisplayPage = isServerPagination ? serverPage! : currentPage + 1;
  const isPrevDisabled = loadingButton !== null || (isServerPagination ? serverPage === 1 : currentPage === 0);
  const isNextDisabled = loadingButton !== null || (isServerPagination ? serverPage >= totalPages : currentPage >= totalPages - 1);

  // Helper to render button content - now uses icons on all devices
  const renderButtonContent = (direction: 'prev' | 'next', isLoading: boolean) => {
    if (isLoading) {
      return <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>;
    }
    
    return direction === 'prev' 
      ? <ChevronLeft className="h-4 w-4" />
      : <ChevronRight className="h-4 w-4" />;
  };

  if (compact) {
    // Compact layout for top pagination - no range text, optional right content
    return (
      <div className={`flex justify-between items-center ${whiteText ? 'text-white' : 'text-foreground'}`}>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={isPrevDisabled}
            className="px-2"
          >
            {renderButtonContent('prev', loadingButton === 'prev')}
          </Button>
          
          <div className="flex items-center gap-2">
            <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
              Page
            </span>
            <Select 
              value={currentDisplayPage.toString()} 
              onValueChange={handlePageSelect}
              disabled={loadingButton !== null}
            >
              <SelectTrigger variant={whiteText ? "retro-dark" : "retro"} colorScheme={whiteText ? "zinc" : "default"} size="sm" className="h-8 w-16 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent variant={whiteText ? "zinc" : "retro"}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <SelectItem variant={whiteText ? "zinc" : "retro"} key={i + 1} value={(i + 1).toString()} className="text-sm">
                    {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
              of {totalPages}
            </span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={isNextDisabled}
            className="px-2"
          >
            {renderButtonContent('next', loadingButton === 'next')}
          </Button>
        </div>
        
        {rightContent && (
          <div>
            {rightContent}
          </div>
        )}
      </div>
    );
  }

  // Full layout for bottom pagination
  if (isBottom) {
    return (
      <>
        {/* Sticky navigation buttons - only show when scrolled and >1 page */}
        <div 
          className={`fixed z-40 transition-all duration-300 ease-in-out ${
            showStickyPagination && totalPages > 1
              ? 'translate-y-0 opacity-100 scale-100'
              : 'translate-y-8 opacity-0 scale-95 pointer-events-none'
          }`}
          style={{
            // Calculate horizontal constraints based on locked panes
            left: `${isShotsPaneLocked ? shotsPaneWidth : 0}px`,
            right: `${isTasksPaneLocked ? tasksPaneWidth : 0}px`,
            bottom: '100px', // Higher up from bottom for better visibility
            // Center within the available space
            display: 'flex',
            justifyContent: 'center',
            paddingLeft: '16px',
            paddingRight: '16px',
          }}
        >
          <div className="bg-card/80 dark:bg-gray-900/80 backdrop-blur-md rounded-full px-4 py-2 shadow-lg border border-border/50">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => handlePrevPage(e, true)}
                disabled={isPrevDisabled}
                className="px-3 py-2 rounded-full"
              >
                {renderButtonContent('prev', loadingButton === 'prev')}
              </Button>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Page
                </span>
                <Select 
                  value={currentDisplayPage.toString()} 
                  onValueChange={(value) => handlePageSelect(value, true)}
                  disabled={loadingButton !== null}
                >
                  <SelectTrigger variant="retro" size="sm" className="h-8 w-16 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent variant="retro">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <SelectItem variant="retro" key={i + 1} value={(i + 1).toString()} className="text-sm">
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  of {totalPages}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => handleNextPage(e, true)}
                disabled={isNextDisabled}
                className="px-3 py-2 rounded-full"
              >
                {renderButtonContent('next', loadingButton === 'next')}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Regular layout for non-bottom pagination (top pagination, etc.)
  return (
    <div className={`flex justify-center items-center gap-3 mt-4 ${whiteText ? 'text-white' : 'text-gray-600'}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevPage}
        disabled={isPrevDisabled}
        className="px-2"
      >
        {renderButtonContent('prev', loadingButton === 'prev')}
      </Button>
      
      <div className="flex items-center gap-2">
        <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
          Page
        </span>
        <Select 
          value={currentDisplayPage.toString()} 
          onValueChange={handlePageSelect}
          disabled={loadingButton !== null}
        >
          <SelectTrigger variant={whiteText ? "retro-dark" : "retro"} colorScheme={whiteText ? "zinc" : "default"} size="sm" className="h-8 w-16 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent variant={whiteText ? "zinc" : "retro"}>
            {Array.from({ length: totalPages }, (_, i) => (
              <SelectItem variant={whiteText ? "zinc" : "retro"} key={i + 1} value={(i + 1).toString()} className="text-sm">
                {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
          of {totalPages}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextPage}
          disabled={isNextDisabled}
          className="px-2"
        >
          {renderButtonContent('next', loadingButton === 'next')}
        </Button>
        <span className={`text-xs ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'} whitespace-nowrap`}>
          {rangeStart}-{rangeEnd} of {totalFilteredItems}
        </span>
      </div>
    </div>
  );
}; 