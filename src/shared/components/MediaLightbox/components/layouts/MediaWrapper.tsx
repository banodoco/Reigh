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
        "relative flex items-center justify-center", // Center content
        "max-w-full", // Don't exceed parent width
        "my-auto", // Vertically center within flex container
        className
      )}
      style={{
        // Explicit height for children's h-full/max-h-full to reference
        // Without this, percentage-based heights in children resolve to auto
        height: 'calc(100vh - 220px)',
        maxHeight: 'calc(100vh - 220px)',
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};
