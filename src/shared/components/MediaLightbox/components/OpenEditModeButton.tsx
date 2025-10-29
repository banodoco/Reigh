import React from 'react';
import { Button } from '@/shared/components/ui/button';

export interface OpenEditModeButtonProps {
  readOnly: boolean;
  showImageEditTools: boolean;
  onOpenEditMode: () => void;
  variant?: 'desktop' | 'mobile';
}

/**
 * OpenEditModeButton Component
 * Button to open the edit mode panel (inpaint/annotate/text)
 * Displayed in the side panel when not in edit mode
 */
export const OpenEditModeButton: React.FC<OpenEditModeButtonProps> = ({
  readOnly,
  showImageEditTools,
  onOpenEditMode,
  variant = 'desktop',
}) => {
  if (readOnly || !showImageEditTools) {
    return null;
  }

  const isMobile = variant === 'mobile';
  const padding = isMobile ? 'p-4 pb-3' : 'p-6 pb-4';
  const textSize = isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpenEditMode}
      className={`${textSize} md:flex md:flex-col md:items-center md:leading-tight hover:bg-transparent active:bg-transparent`}
    >
      <span className="md:hidden">Open edit mode</span>
      <span className="hidden md:block">Open</span>
      <span className="hidden md:block">Edit Mode</span>
    </Button>
  );
};

