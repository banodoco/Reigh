import React, { useMemo } from 'react';
import { formatDistanceToNow, isValid } from 'date-fns';
import { useTimestampUpdater } from './useTimestampUpdater';

/**
 * Simple hook that returns a live-updating formatted timestamp string
 * Perfect for inline timestamps in task lists, galleries, etc.
 */

interface UseUpdatingTimestampOptions {
  /** Date to format */
  date?: string | Date | null;
  /** Custom abbreviation function */
  abbreviate?: (str: string) => string;
  /** Disable automatic updates */
  disabled?: boolean;
}

// Simple, direct abbreviation function
const defaultAbbreviate = (str: string) => {
  // Handle all variations of "1 hour" - remove "about" and use singular
  if (str.includes('1 hr') || str.includes('1 hour')) {
    return '1 hr ago';
  }
  
  // Handle all variations of "1 day" - remove "about" and use singular  
  if (str.includes('1 day')) {
    return '1 day ago';
  }
  
  // Handle "less than a minute ago"
  if (str.includes('less than a minute')) {
    return '<1 min ago';
  }
  
  // Handle other single units
  if (str.includes('1 minute')) {
    return '1 min ago';
  }
  
  if (str.includes('1 second')) {
    return '1 sec ago';
  }
  
  // Handle plurals - remove "about" prefix and abbreviate
  return str
    .replace(/^about /, '') // Remove "about" prefix
    .replace(/minutes?/, 'mins')
    .replace(/hours?/, 'hrs')
    .replace(/seconds?/, 'secs')
    .replace(/days?/, 'days');
};

/**
 * Hook that returns a formatted, live-updating timestamp string
 * 
 * @example
 * const timeAgo = useUpdatingTimestamp({ date: task.createdAt });
 * return <span>Created: {timeAgo}</span>;
 */
export function useUpdatingTimestamp({ 
  date, 
  abbreviate = defaultAbbreviate,
  disabled = false 
}: UseUpdatingTimestampOptions = {}) {
  
  const parsedDate = useMemo(() => {
    if (!date) return null;
    const parsed = typeof date === 'string' ? new Date(date) : date;
    return isValid(parsed) ? parsed : null;
  }, [date]);
  
  // Get live update trigger
  const { updateTrigger } = useTimestampUpdater({
    date: parsedDate,
    disabled,
    isVisible: true // Explicitly set to ensure TaskPane timestamps update
  });
  
  // Debug logging for task timestamps
  React.useEffect(() => {
    if (parsedDate && parsedDate.getTime() > Date.now() - 24 * 60 * 60 * 1000) { // Only log for recent tasks
      ,
        updateTrigger,
        age: Date.now() - parsedDate.getTime(),
        timestamp: Date.now()
      });
    }
  }, [updateTrigger, parsedDate]);
  
  // Format timestamp with live updates
  const formattedTime = useMemo(() => {
    if (!parsedDate) return 'Unknown';
    
    const formatted = formatDistanceToNow(parsedDate, { addSuffix: true });
    const abbreviated = abbreviate(formatted);
    
    // DEBUG: Log what date-fns returns vs what we output
    ,
      timestamp: Date.now()
    });
    
    return abbreviated;
  }, [parsedDate?.getTime(), updateTrigger, abbreviate]);
  
  return formattedTime;
}

/**
 * Hook specifically for task timestamps with consistent abbreviation
 */
export function useTaskTimestamp(date?: string | Date | null) {
  return useUpdatingTimestamp({ 
    date,
    abbreviate: defaultAbbreviate 
  });
}
