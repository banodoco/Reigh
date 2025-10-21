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
        "relative",
        "flex items-center justify-center",
        "w-full h-full flex-grow", // Allow wrapper to grow and fill space
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
