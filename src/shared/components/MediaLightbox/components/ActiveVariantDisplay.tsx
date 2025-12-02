/**
 * ActiveVariantDisplay Component
 * 
 * Shows info when viewing a non-primary variant:
 * - "Viewing variant: [type]" indicator
 * - "Based on: [primary/original]" with primary thumbnail (click to switch)
 * 
 * Note: The "Make main" button is shown at the top of the panel, not here.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';

export interface VariantInfo {
  id: string;
  location: string;
  thumbnail_url: string | null;
  variant_type: string | null;
  is_primary: boolean;
}

interface ActiveVariantDisplayProps {
  activeVariant: VariantInfo;
  primaryVariant: VariantInfo | null;
  onSwitchToPrimary?: () => void;
  variant?: 'desktop' | 'mobile';
}

// Get a friendly label for variant type
const getVariantTypeLabel = (variantType: string | null): string => {
  switch (variantType) {
    case 'magic_edit':
      return 'Magic Edit';
    case 'inpaint':
      return 'Inpaint';
    case 'annotated_edit':
      return 'Annotated Edit';
    case 'trimmed':
      return 'Trimmed';
    case 'upscaled':
      return 'Upscaled';
    case 'clip_join':
      return 'Clip Join';
    case 'child_promoted':
      return 'Promoted';
    case 'original':
      return 'Original';
    default:
      return variantType || 'Variant';
  }
};

export const ActiveVariantDisplay: React.FC<ActiveVariantDisplayProps> = ({
  activeVariant,
  primaryVariant,
  onSwitchToPrimary,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';

  // Only show if viewing a non-primary variant
  if (activeVariant.is_primary) {
    return null;
  }

  console.log('[VariantClickDebug] ActiveVariantDisplay render:', {
    activeVariantId: activeVariant.id?.substring(0, 8),
    activeVariantType: activeVariant.variant_type,
    hasPrimaryVariant: !!primaryVariant,
    primaryVariantId: primaryVariant?.id?.substring(0, 8),
  });

  const activeLabel = getVariantTypeLabel(activeVariant.variant_type);
  const primaryThumbnail = primaryVariant?.thumbnail_url || primaryVariant?.location;

  return (
    <div className={`border-b border-border ${isMobile ? 'p-3' : 'p-4'}`}>
      {/* Currently viewing indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
          Viewing:
        </span>
        <span className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-purple-400`}>
          {activeLabel} variant
        </span>
      </div>

      {/* Based on (primary/original) */}
      {primaryVariant && onSwitchToPrimary && (
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToPrimary}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Based on:</span>
            <div className={`relative ${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded border border-border overflow-hidden group-hover:border-primary transition-colors`}>
              {primaryThumbnail ? (
                <img
                  src={primaryThumbnail}
                  alt="Original version"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-[8px] text-muted-foreground">
                  Original
                </div>
              )}
            </div>
            <span className="text-muted-foreground group-hover:text-foreground">
              (click to view)
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ActiveVariantDisplay;

