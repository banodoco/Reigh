import React from 'react';
import { useUpdatingTimestamp } from '@/shared/hooks/useUpdatingTimestamp';

interface UpdatingTimeCellProps {
  /** Date to display */
  date: string | Date;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Table cell component that shows a live-updating relative timestamp
 * Optimized for use in tables with many rows
 */
export const UpdatingTimeCell: React.FC<UpdatingTimeCellProps> = ({
  date,
  className = ''
}) => {
  const timeAgo = useUpdatingTimestamp({ date });
  
  return (
    <span className={className}>
      {timeAgo}
    </span>
  );
};
