import React from 'react';
import { Button } from '@/shared/components/ui/button';

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

  const isPrevDisabled = loadingButton !== null || (isServerPagination ? serverPage === 1 : currentPage === 0);
  const isNextDisabled = loadingButton !== null || (isServerPagination ? serverPage >= totalPages : currentPage >= totalPages - 1);

  return (
    <div className={`flex justify-center items-center mt-4 ${whiteText ? 'text-white' : 'text-gray-600'}`}>
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
      
      <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap mx-4`}>
        {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
      </span>
      
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
  );
}; 