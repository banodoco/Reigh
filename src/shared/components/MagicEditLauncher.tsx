import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/shared/components/ui/tooltip';
import MagicEditModal from '@/shared/components/MagicEditModal';

interface MagicEditLauncherProps {
  imageUrl: string;
  imageDimensions?: { width: number; height: number } | null;
  toolTypeOverride?: string;
}

/**
 * MagicEditLauncher encapsulates the UI for opening the Magic-Edit flow:
 * 1. A sparkles button shown in the lightbox controls
 * 2. The MagicEditModal component handles its own dialog
 */
const MagicEditLauncher: React.FC<MagicEditLauncherProps> = ({ imageUrl, imageDimensions, toolTypeOverride }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Trigger */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="bg-black/50 hover:bg-black/70 text-white"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="z-[100001]">Magic Edit</TooltipContent>
      </Tooltip>

      {/* Modal */}
      <MagicEditModal
        isOpen={isOpen}
        imageUrl={imageUrl}
        imageDimensions={imageDimensions ?? undefined}
        onClose={() => setIsOpen(false)}
        toolTypeOverride={toolTypeOverride}
      />
    </>
  );
};

export default MagicEditLauncher; 