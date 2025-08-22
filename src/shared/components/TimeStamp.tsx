import React from 'react';
import { formatDistanceToNow, isValid } from 'date-fns';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useTimestampUpdater, useTimestampVisibility } from '@/shared/hooks/useTimestampUpdater';

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
  const isMobile = useIsMobile();
  const [isHovered, setIsHovered] = React.useState(false);
  const elementRef = React.useRef<HTMLSpanElement>(null);
  
  if (!createdAt) return null;

  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  
  if (!isValid(date)) return null;

  // Track visibility for performance (only update visible timestamps)
  const isVisible = useTimestampVisibility(elementRef);
  
  // Get live-updating timestamp trigger
  const { updateTrigger } = useTimestampUpdater({
    date,
    isVisible: isVisible && (!isMobile || !showOnHover || isHovered),
    disabled: false
  });

  const positionClasses = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2'
  };

  const hoverClass = showOnHover ? 'opacity-0 group-hover:opacity-100 transition-opacity' : 'opacity-100';

  // Format time with live updates - triggers recalculation when updateTrigger changes
  const formattedTime = React.useMemo(() => {
    if (isMobile && showOnHover && !isHovered) {
      return null; // Skip formatting until hovered
    }
    
    return formatDistanceToNow(date, { addSuffix: true })
      .replace("about ", "")
      .replace("less than a minute", "<1 min")
      .replace(" minutes", " mins")
      .replace(" minute", " min")
      .replace(" hours", " hrs")
      .replace(" hour", " hr")
      .replace(" seconds", " secs")
      .replace(" second", " sec");
  }, [date.getTime(), isMobile, showOnHover, isHovered, updateTrigger]);

  // On mobile, don't render until we have the formatted time or it's always shown
  if (isMobile && showOnHover && formattedTime === null) {
    return null;
  }

  return (
    <span 
      ref={elementRef}
      className={`absolute ${positionClasses[position]} text-xs text-white bg-black/50 px-1.5 py-0.5 rounded-md ${hoverClass} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {formattedTime}
    </span>
  );
}; 