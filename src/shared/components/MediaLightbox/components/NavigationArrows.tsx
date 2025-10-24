import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface NavigationArrowsProps {
  // Visibility
  showNavigation: boolean;
  readOnly: boolean;
  
  // Handlers
  onPrevious?: () => void;
  onNext?: () => void;
  
  // Availability
  hasPrevious?: boolean;
  hasNext?: boolean;
  
  // Variant for different layouts
  variant?: 'desktop' | 'mobile';
}

/**
 * NavigationArrows Component
 * Left and right navigation arrows for the lightbox
 * Supports desktop (larger buttons) and mobile (smaller buttons) variants
 */
export const NavigationArrows: React.FC<NavigationArrowsProps> = ({
  showNavigation,
  readOnly,
  onPrevious,
  onNext,
  hasPrevious = true,
  hasNext = true,
  variant = 'desktop',
}) => {
  if (!showNavigation || readOnly) {
    return null;
  }

  const isDesktop = variant === 'desktop';
  const buttonSize = isDesktop ? 'h-10 w-10 sm:h-12 sm:w-12' : 'h-12 w-12';
  const iconSize = isDesktop ? 'h-6 w-6 sm:h-8 sm:w-8' : 'h-6 w-6';
  const leftPosition = isDesktop ? 'left-4' : 'left-2';
  const rightPosition = isDesktop ? 'right-4' : 'right-2';

  return (
    <>
      {/* Left Arrow */}
      {onPrevious && hasPrevious && (
        <Button
          variant="secondary"
          size="lg"
          onClick={onPrevious}
          className={`bg-black/50 hover:bg-black/70 text-white z-[80] ${buttonSize} absolute ${leftPosition} top-1/2 -translate-y-1/2`}
        >
          <ChevronLeft className={iconSize} />
        </Button>
      )}

      {/* Right Arrow */}
      {onNext && hasNext && (
        <Button
          variant="secondary"
          size="lg"
          onClick={onNext}
          className={`bg-black/50 hover:bg-black/70 text-white z-[80] ${buttonSize} absolute ${rightPosition} top-1/2 -translate-y-1/2`}
        >
          <ChevronRight className={iconSize} />
        </Button>
      )}
    </>
  );
};

