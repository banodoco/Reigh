import React from 'react';
import { formatDistanceToNow, isValid } from 'date-fns';

interface TimeStampProps {
  /** ISO date string or Date object */
  createdAt?: string | Date | null;
  /** Additional CSS classes */
  className?: string;
  /** Position of the timestamp (default: 'top-left') */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Show only on hover (default: true) */
  showOnHover?: boolean;
}

export const TimeStamp: React.FC<TimeStampProps> = ({
  createdAt,
  className = '',
  position = 'top-left',
  showOnHover = true
}) => {
  if (!createdAt) return null;

  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  
  if (!isValid(date)) return null;

  const positionClasses = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2'
  };

  const hoverClass = showOnHover ? 'opacity-0 group-hover:opacity-100 transition-opacity' : 'opacity-100';

  const formattedTime = formatDistanceToNow(date, { addSuffix: true })
    .replace("about ", "")
    .replace("less than a minute", "<1 min")
    .replace(" minutes", " mins")
    .replace(" minute", " min")
    .replace(" hours", " hrs")
    .replace(" hour", " hr")
    .replace(" seconds", " secs")
    .replace(" second", " sec");

  return (
    <span 
      className={`absolute ${positionClasses[position]} text-xs text-white bg-black/50 px-1.5 py-0.5 rounded-md ${hoverClass} ${className}`}
      title={date.toLocaleString()}
    >
      {formattedTime}
    </span>
  );
}; 