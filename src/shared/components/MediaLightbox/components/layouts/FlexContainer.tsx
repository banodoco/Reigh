import React from 'react';
import { cn } from '@/shared/lib/utils';

interface FlexContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * FlexContainer - Mobile/Tablet layout wrapper
 * 
 * Provides:
 * - Responsive padding (increases on larger screens like iPad)
 * - Flexbox column layout for vertical stacking
 * - Flexible height to accommodate any media size
 */
export const FlexContainer: React.FC<FlexContainerProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        // Flexbox layout
        "flex flex-col items-center justify-start gap-3 sm:gap-4 md:gap-6",
        // Responsive padding that increases on tablets
        "px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8",
        // Container sizing - allow full height with scrolling if needed
        "w-full h-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
