import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/shared/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import MagicEditForm from '@/shared/components/MagicEditForm';

interface MagicEditLauncherProps {
  imageUrl: string;
  imageDimensions?: { width: number; height: number } | null;
}

/**
 * MagicEditLauncher encapsulates the UI for opening the Magic-Edit flow:
 * 1. A sparkles button shown in the lightbox controls
 * 2. A Radix Dialog containing the <MagicEditForm />
 */
const MagicEditLauncher: React.FC<MagicEditLauncherProps> = ({ imageUrl, imageDimensions }) => {
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
        <TooltipContent>Magic Edit</TooltipContent>
      </Tooltip>

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent 
          className="sm:max-w-[500px]"
          onOpenAutoFocus={(event) => {
            // Prevent auto-focus on mobile to avoid keyboard opening
            event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Magic Edit
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            <MagicEditForm
              imageUrl={imageUrl}
              imageDimensions={imageDimensions ?? undefined}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MagicEditLauncher; 