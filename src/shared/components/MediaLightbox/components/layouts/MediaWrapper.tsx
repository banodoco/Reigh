import React from 'react';
import { cn } from '@/shared/lib/utils';

interface MediaWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * MediaWrapper - Wraps media content and its controls
 * 
 * Provides:
 * - Relative positioning context for absolute-positioned controls
 * - Flexible sizing to accommodate media of any aspect ratio
 * - Proper overflow handling
 */
export const MediaWrapper: React.FC<MediaWrapperProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center", // Shrink-wrap the content
        "max-w-full", // Don't exceed parent width
        className
      )}
      style={{
        // Leave room for padding: calc(100% - top padding - bottom padding)
        // py-4 = 16px, py-6 = 24px, py-8 = 32px on different screen sizes
        // Use a value that works across all sizes (64px total for padding)
        maxHeight: 'calc(100% - 64px)',
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};
