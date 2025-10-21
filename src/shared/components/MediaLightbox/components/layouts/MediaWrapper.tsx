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
 * - Flexible sizing to fill available space
 * - Proper aspect ratio handling
 */
export const MediaWrapper: React.FC<MediaWrapperProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        // Position context for absolute-positioned controls
        "relative",
        // Flexible sizing
        "flex items-center justify-center",
        // Responsive sizing
        "w-full flex-shrink-0",
        // Max dimensions
        "max-w-[100vw] sm:max-w-[90vw] md:max-w-[85vw]",
        className
      )}
      style={{
        maxHeight: 'calc(95vh - 200px)', // Leave room for padding + workflow controls
        aspectRatio: 'auto',
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};
