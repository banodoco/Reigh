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
  /** Hide on hover - visible normally, hidden when hovering (default: false) */
  hideOnHover?: boolean;
}

export const TimeStamp: React.FC<TimeStampProps> = ({
  createdAt,
  className = '',
  position = 'top-left',
  showOnHover = true,
  hideOnHover = false
}) => {
  const isMobile = useIsMobile();
  const [isHovered, setIsHovered] = React.useState(false);
  const elementRef = React.useRef<HTMLSpanElement>(null);
  
  // Parse date early (but hooks must be called unconditionally below)
  const date = React.useMemo(() => {
    if (!createdAt) return null;
    const parsed = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    return isValid(parsed) ? parsed : null;
  }, [createdAt]);

  // Track visibility for performance (only update visible timestamps)
  // ⚠️ CRITICAL: All hooks must be called unconditionally (React rules of hooks)
  const isVisible = useTimestampVisibility(elementRef);
  
  // Determine if we should enable updates
  const shouldUpdate = isVisible && (!isMobile || !showOnHover || isHovered) && !!date;
  
  // Get live-updating timestamp trigger
  const { updateTrigger } = useTimestampUpdater({
    date,
    isVisible: shouldUpdate,
    disabled: !date // Disable if no valid date
  });
  
  // Debug logging for timestamp updates (development only)
  // ⚠️ Must be before early return to comply with React hooks rules
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && updateTrigger > 0 && date) {
      console.log('[TimeStamp] Update triggered:', {
        updateTrigger,
        isVisible,
        shouldUpdate,
        isMobile,
        showOnHover,
        isHovered,
        date: date.toISOString(),
        timestamp: Date.now()
      });
    }
  }, [updateTrigger, isVisible, shouldUpdate, isMobile, showOnHover, isHovered, date]);
  
  // Early return AFTER all hooks are called
  if (!date) return null;

  const positionClasses = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2'
  };

  // Visibility classes based on hover behavior
  // hideOnHover: visible normally, hidden on hover
  // showOnHover: hidden normally, shown on hover
  const hoverClass = hideOnHover
    ? 'opacity-100 group-hover:opacity-0 transition-opacity'
    : showOnHover
      ? 'opacity-0 group-hover:opacity-100 transition-opacity'
      : 'opacity-100';

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