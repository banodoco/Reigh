import { useState, useEffect, useMemo, useRef } from 'react';

interface UseSmoothPaginationOptions<T> {
  /** Current page data from the query */
  data: T[] | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Total number of items across all pages */
  totalCount?: number;
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  itemsPerPage: number;
  /** Function to change pages */
  onPageChange: (page: number) => void;
  /** Optional: Clear items when these dependencies change (e.g., filters) */
  clearOnChange?: any[];
  /** Optional: Show skeleton when no items and loading */
  showSkeletonWhenEmpty?: boolean;
}

interface UseSmoothPaginationReturn<T> {
  /** Current items to display (persisted during loading) */
  items: T[];
  /** Pagination metadata */
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  /** Loading states */
  loading: {
    isLoading: boolean;
    showSkeleton: boolean;
  };
  /** Page change handler with scroll restoration */
  handlePageChange: (newPage: number) => void;
  /** Scroll to top function */
  scrollToTop: () => void;
}

/**
 * A generalized hook for smooth pagination with:
 * - Local state persistence during loading (prevents empty flashes)
 * - Scroll position restoration during page changes
 * - Smart skeleton loading
 * - Filter-based clearing
 */
export function useSmoothPagination<T>({
  data,
  isLoading,
  totalCount = 0,
  page,
  itemsPerPage,
  onPageChange,
  clearOnChange = [],
  showSkeletonWhenEmpty = true
}: UseSmoothPaginationOptions<T>): UseSmoothPaginationReturn<T> {
  
  const [currentItems, setCurrentItems] = useState<T[]>([]);
  const [lastKnownTotal, setLastKnownTotal] = useState(0);
  const scrollPosRef = useRef<number>(0);

  // Update items when new data arrives
  useEffect(() => {
    if (data && data.length > 0) {
      setCurrentItems(data);
    }
  }, [data]);

  // Update last known total
  useEffect(() => {
    if (totalCount > 0) {
      setLastKnownTotal(totalCount);
    }
  }, [totalCount]);

  // Clear items when filters change
  useEffect(() => {
    setCurrentItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, clearOnChange);

  // Restore scroll position after data loads
  useEffect(() => {
    if (data && data.length > 0) {
      window.scrollTo({ top: scrollPosRef.current, behavior: 'auto' });
    }
  }, [data]);

  const handlePageChange = (newPage: number) => {
    scrollPosRef.current = window.scrollY;
    onPageChange(newPage);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pagination = useMemo(() => {
    const total = totalCount || lastKnownTotal;
    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));
    
    return {
      currentPage: page,
      totalPages,
      totalCount: total,
      itemsPerPage,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }, [totalCount, lastKnownTotal, itemsPerPage, page]);

  const loading = useMemo(() => ({
    isLoading,
    showSkeleton: showSkeletonWhenEmpty && isLoading && currentItems.length === 0
  }), [isLoading, showSkeletonWhenEmpty, currentItems.length]);

  return {
    items: currentItems,
    pagination,
    loading,
    handlePageChange,
    scrollToTop,
  };
} 