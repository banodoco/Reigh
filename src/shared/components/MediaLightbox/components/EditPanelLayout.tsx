/**
 * EditPanelLayout Component
 *
 * Shared layout for edit panels (images and videos).
 * Provides consistent header, mode selector, scrollable content area, and variants section.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { VariantSelector } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/components/VariantSelector';
import type { GenerationVariant } from '@/shared/hooks/useVariants';

export interface EditPanelLayoutProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  /** Handler to close the lightbox */
  onClose: () => void;

  /** Handler to exit edit mode (switch to info view) */
  onExitEditMode: () => void;

  /** Whether to hide the Info/Edit toggle */
  hideInfoEditToggle?: boolean;

  /** Mode selector content (the toggle buttons) */
  modeSelector: React.ReactNode;

  /** Main content below the mode selector */
  children: React.ReactNode;

  /** Variants props */
  variants?: GenerationVariant[];
  activeVariantId?: string | null;
  onVariantSelect?: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  isLoadingVariants?: boolean;

  /** Variant promotion (only for images) */
  onPromoteToGeneration?: (variantId: string) => Promise<void>;
  isPromoting?: boolean;
}

export const EditPanelLayout: React.FC<EditPanelLayoutProps> = ({
  variant,
  onClose,
  onExitEditMode,
  hideInfoEditToggle = false,
  modeSelector,
  children,
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoadingVariants,
  onPromoteToGeneration,
  isPromoting,
}) => {
  const isMobile = variant === 'mobile';
  const hasVariants = variants && variants.length >= 1 && onVariantSelect;
  const padding = isMobile ? 'p-3' : 'p-6';
  const spacing = isMobile ? 'space-y-2' : 'space-y-4';

  return (
    <div className="h-full flex flex-col">
      {/* Header with Info/Edit toggle and close button */}
      <div className={cn(
        "flex items-center justify-end border-b border-border bg-background flex-shrink-0",
        isMobile ? "px-3 py-2 gap-2" : "p-4 gap-3"
      )}>
        {!hideInfoEditToggle && (
          <SegmentedControl
            value="edit"
            onValueChange={(value) => {
              if (value === 'info') {
                onExitEditMode();
              }
            }}
          >
            <SegmentedControlItem value="info">Info</SegmentedControlItem>
            <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
          </SegmentedControl>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn("p-0 hover:bg-muted", isMobile ? "h-7 w-7" : "h-8 w-8")}
        >
          <X className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </Button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Mode selector section */}
        <div className={cn("border-b border-border", isMobile ? "p-2" : "px-6 py-3")}>
          {modeSelector}
        </div>

        {/* Main content */}
        <div className={cn(padding, spacing)}>
          {children}
        </div>

        {/* Variants section - inside scroll area */}
        {hasVariants && (
          <div className={cn("border-t border-border", isMobile ? "pt-2 mt-2 px-3 pb-2" : "pt-4 mt-4 p-4")}>
            <VariantSelector
              variants={variants}
              activeVariantId={activeVariantId || null}
              onVariantSelect={onVariantSelect}
              onMakePrimary={onMakePrimary}
              isLoading={isLoadingVariants}
              onPromoteToGeneration={onPromoteToGeneration}
              isPromoting={isPromoting}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default EditPanelLayout;
