import React from 'react';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/shared/components/ui/pagination';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface GalleryPaginationProps {
  totalPages: number;
  currentPage: number;
  isLoadingGenerations: boolean;
  isFetchingGenerations: boolean;
  onPageChange: (page: number) => void;
}

export const GalleryPagination = React.memo<GalleryPaginationProps>(({
  totalPages,
  currentPage,
  isLoadingGenerations,
  isFetchingGenerations,
  onPageChange
}) => {
  const isMobile = useIsMobile();

  // Only hide pagination during initial loading, not during background fetches
  // This prevents pagination from disappearing when ShotEditor triggers refetches
  if (totalPages <= 1 || isLoadingGenerations) {
    return null;
  }

  return (
    <Pagination className="mt-4 sm:mt-6">
      <PaginationContent>
        {(() => {
          if (!isMobile || totalPages <= 5) {
            // Desktop or few pages: show all pages
            return Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => onPageChange(page)}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ));
          }
          
          // Mobile with many pages: show smart pagination
          const items = [];
          
          // Always show page 1
          items.push(
            <PaginationItem key={1}>
              <PaginationLink
                onClick={() => onPageChange(1)}
                isActive={currentPage === 1}
                className="cursor-pointer"
              >
                1
              </PaginationLink>
            </PaginationItem>
          );
          
          // Show ellipsis if current page is far from start
          if (currentPage > 3) {
            items.push(
              <PaginationItem key="start-ellipsis">
                <span className="px-3 py-2 text-sm text-muted-foreground">...</span>
              </PaginationItem>
            );
          }
          
          // Show current page and adjacent pages (if not already shown)
          const start = Math.max(2, currentPage - 1);
          const end = Math.min(totalPages - 1, currentPage + 1);
          
          for (let page = start; page <= end; page++) {
            if (page !== 1 && page !== totalPages) {
              items.push(
                <PaginationItem key={page}>
                  <PaginationLink
                    onClick={() => onPageChange(page)}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              );
            }
          }
          
          // Show ellipsis if current page is far from end
          if (currentPage < totalPages - 2) {
            items.push(
              <PaginationItem key="end-ellipsis">
                <span className="px-3 py-2 text-sm text-muted-foreground">...</span>
              </PaginationItem>
            );
          }
          
          // Always show last page (if more than 1 page)
          if (totalPages > 1) {
            items.push(
              <PaginationItem key={totalPages}>
                <PaginationLink
                  onClick={() => onPageChange(totalPages)}
                  isActive={currentPage === totalPages}
                  className="cursor-pointer"
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            );
          }
          
          return items;
        })()}
      </PaginationContent>
    </Pagination>
  );
});
