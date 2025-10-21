import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

export interface NavigationButtonsProps {
  showNavigation: boolean;
  readOnly: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  isInpaintMode: boolean;
  variant: 'desktop' | 'mobile' | 'regular';
}

/**
 * Navigation arrow buttons for MediaLightbox
 * Renders left/right chevron buttons for navigating between media items
 */
export const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  showNavigation,
  readOnly,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isInpaintMode,
  variant,
}) => {
  if (readOnly || isInpaintMode) return null;

  const isMobileVariant = variant === 'mobile';
  const isDesktopVariant = variant === 'desktop';

  return (
    <>
      {/* Previous Button */}
      {showNavigation && onPrevious && hasPrevious && (
        <Button
          variant="secondary"
          size="lg"
          onClick={onPrevious}
          className={
            isMobileVariant
              ? "absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
              : isDesktopVariant
              ? "bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute left-4 top-1/2 -translate-y-1/2"
              : "hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute left-2 top-1/2 -translate-y-1/2"
          }
        >
          <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
        </Button>
      )}

      {/* Next Button */}
      {showNavigation && onNext && hasNext && (
        <Button
          variant="secondary"
          size="lg"
          onClick={onNext}
          className={
            isMobileVariant
              ? "absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
              : isDesktopVariant
              ? "bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute right-4 top-1/2 -translate-y-1/2"
              : "hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute right-2 top-1/2 -translate-y-1/2"
          }
        >
          <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
        </Button>
      )}
    </>
  );
};

