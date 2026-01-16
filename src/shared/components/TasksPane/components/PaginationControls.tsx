import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { FilterGroup, ITEMS_PER_PAGE } from '../constants';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  isLoading?: boolean;
  filterType: FilterGroup;
  recentCount?: number;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems,
  isLoading = false,
  filterType,
  recentCount
}) => {
  // Only show pagination when there are multiple pages
  if (totalPages <= 1) return null;

  const getFilterLabel = () => {
    switch (filterType) {
      case 'Processing':
        return 'processing tasks';
      case 'Succeeded':
        return 'succeeded tasks';
      case 'Failed':
        return 'failed tasks';
      default:
        return 'tasks';
    }
  };

  // Show recent count info if available and it's a filter that has recent data
  const showRecentInfo = recentCount && recentCount > 0 && (filterType === 'Succeeded' || filterType === 'Failed');

  return (
    <div className="flex items-center justify-between px-4 py-2 text-[11px] text-zinc-400">
      <span>
        {showRecentInfo ? (
          filterType === 'Succeeded' ? 
            `${recentCount} succeeded in the past hour, ${totalItems} in total.` :
            `${recentCount} fails in the past hour, ${totalItems} in total.`
        ) : (
          `${totalItems} ${getFilterLabel()}, showing ${ITEMS_PER_PAGE} per page`
        )}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {/* Page selector dropdown */}
        <Select 
          value={currentPage.toString()} 
          onValueChange={(value) => onPageChange(parseInt(value))}
          disabled={isLoading}
        >
          <SelectTrigger variant="retro-dark" colorScheme="zinc" size="sm" className="h-6 w-9 text-xs px-1" hideIcon>
            <SelectValue />
          </SelectTrigger>
          <SelectContent variant="zinc">
            {Array.from({ length: totalPages }, (_, i) => (
              <SelectItem variant="zinc" key={i + 1} value={(i + 1).toString()} className="text-xs">
                {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-zinc-300 text-[11px]">
          of {totalPages}
        </span>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PaginationControls;



