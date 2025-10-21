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
        // Position context for absolute-positioned controls
        "relative",
        // Flexible sizing
        "flex items-center justify-center",
        // Responsive sizing
        "w-full flex-shrink-0",
        // Max dimensions - responsive for different screens
        "max-w-[100vw] sm:max-w-[90vw] md:max-w-[85vw]",
        className
      )}
      style={{
        // Allow media to grow naturally while staying within viewport
        minHeight: '300px',
        maxHeight: 'min(80vh, calc(100vh - 300px))', // Flexible max height
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
};
