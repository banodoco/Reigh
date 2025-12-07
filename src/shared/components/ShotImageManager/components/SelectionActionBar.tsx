import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MOBILE_BOTTOM_OFFSET, DESKTOP_BOTTOM_OFFSET } from '../constants';

interface SelectionActionBarProps {
  selectedCount: number;
  onDeselect: () => void;
  onDelete: () => void;
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
  selectedCount,
  onDeselect,
  onDelete
}) => {
  const {
    isShotsPaneLocked,
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();
  const isMobile = useIsMobile();
  
  const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
  const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
  const bottomOffset = isMobile ? MOBILE_BOTTOM_OFFSET : DESKTOP_BOTTOM_OFFSET;
  
  return (
    <div
      className="fixed z-[90] flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{
        left: `${leftOffset}px`,
        right: `${rightOffset}px`,
        paddingLeft: '16px',
        paddingRight: '16px',
        bottom: `${bottomOffset}px`,
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <span className="text-sm font-light text-gray-700 dark:text-gray-300">
          {selectedCount} selected
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDeselect}
            className="text-sm"
          >
            {selectedCount === 1 ? 'Deselect' : 'Deselect All'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            className="text-sm"
          >
            {selectedCount === 1 ? 'Delete' : 'Delete All'}
          </Button>
        </div>
      </div>
    </div>
  );
};

