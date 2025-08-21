import { useState, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';

/**
 * Hook to manage gallery pagination state and logic
 */
export const useGalleryPagination = (sortedVideoOutputs: GenerationRow[], itemsPerPage: number = 6) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(sortedVideoOutputs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentVideoOutputs = sortedVideoOutputs.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const resetToFirstPage = () => {
    setCurrentPage(1);
  };

  return {
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    currentVideoOutputs,
    handlePageChange,
    resetToFirstPage
  };
};
