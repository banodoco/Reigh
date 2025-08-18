import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

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
}) => {
  // Don't render if conditions not met
  if (totalPages <= 1 || reducedSpacing || hidePagination) {
    return null;
  }

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent any default scroll behavior
    const newPage = isServerPagination 
      ? Math.max(1, serverPage! - 1)
      : Math.max(0, currentPage - 1);
    onPageChange(newPage, 'prev', true); // fromBottom = true for bottom buttons
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent any default scroll behavior
    const newPage = isServerPagination 
      ? serverPage! + 1
      : Math.min(totalPages - 1, currentPage + 1);
    onPageChange(newPage, 'next', true); // fromBottom = true for bottom buttons
  };

  const handlePageSelect = (pageStr: string) => {
    const newPage = isServerPagination ? parseInt(pageStr) : parseInt(pageStr) - 1;
    const direction = newPage > (isServerPagination ? serverPage! : currentPage) ? 'next' : 'prev';
    onPageChange(newPage, direction, true);
  };

  const currentDisplayPage = isServerPagination ? serverPage! : currentPage + 1;
  const isPrevDisabled = loadingButton !== null || (isServerPagination ? serverPage === 1 : currentPage === 0);
  const isNextDisabled = loadingButton !== null || (isServerPagination ? serverPage >= totalPages : currentPage >= totalPages - 1);

  if (compact) {
    // Compact layout for top pagination - no range text, optional right content
    return (
      <div className={`flex justify-between items-center ${whiteText ? 'text-white' : 'text-gray-600'}`}>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={isPrevDisabled}
          >
            {loadingButton === 'prev' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>
            ) : (
              'Prev'
            )}
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
              <SelectTrigger className={`h-8 w-16 text-sm ${whiteText ? 'bg-zinc-800 border-zinc-600 text-white' : ''}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalPages }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()} className="text-sm">
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
          >
            {loadingButton === 'next' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>
            ) : (
              'Next'
            )}
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
  return (
    <div className={`flex justify-center items-center gap-3 mt-4 ${whiteText ? 'text-white' : 'text-gray-600'}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevPage}
        disabled={isPrevDisabled}
      >
        {loadingButton === 'prev' ? (
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>
        ) : (
          'Prev'
        )}
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
          <SelectTrigger className={`h-8 w-16 text-sm ${whiteText ? 'bg-zinc-800 border-zinc-600 text-white' : ''}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: totalPages }, (_, i) => (
              <SelectItem key={i + 1} value={(i + 1).toString()} className="text-sm">
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
        >
          {loadingButton === 'next' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>
          ) : (
            'Next'
          )}
        </Button>
        <span className={`text-xs ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'} whitespace-nowrap`}>
          {rangeStart}-{rangeEnd} of {totalFilteredItems}
        </span>
      </div>
    </div>
  );
}; 