import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface ProfitSplitBarProps {
  className?: string;
}

export const ProfitSplitBar: React.FC<ProfitSplitBarProps> = ({ className }) => {
  const isMobile = useIsMobile();

  // Controlled tooltip states to mirror HomePage behavior exactly
  const [engLeftOpen, setEngLeftOpen] = useState(false);
  const [engRightOpen, setEngRightOpen] = useState(false);
  const [artLeftOpen, setArtLeftOpen] = useState(false);
  const [artRightOpen, setArtRightOpen] = useState(false);
  const [banoOpen, setBanoOpen] = useState(false);

  return (
    <div className={className}>
      {/* Labels */}
      <div className="grid grid-cols-3 text-center text-sm font-theme-light text-primary">
        <div>Engineers</div>
        <div>Artists</div>
        <div>Banodoco</div>
      </div>
      {/* Thin split bar */}
      <div className="flex h-4 overflow-visible rounded-full">
        {/* Engineers (1/3) with two equal sub-splits and per-half hover labels */}
        <div className="relative flex-1 cursor-default select-none rounded-l-full bg-transparent">
          <div className="flex h-full overflow-visible">
            {/* Left half: Technical contributors to workflows and LoRAs */}
            <div className="relative flex-1">
              <TooltipProvider>
                <Tooltip open={engLeftOpen} onOpenChange={setEngLeftOpen}>
                  <TooltipTrigger asChild>
                    <div
                      className="h-full w-full bg-wes-yellow-dark transition-all duration-200 hover:brightness-90"
                      onClick={() => { if (isMobile) setEngLeftOpen((v) => !v); }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" className="px-2 py-1 whitespace-nowrap text-center text-[11px] leading-tight z-[100010]">
                    Technical contributors to workflows and LoRAs
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* Right half: Fund to train models and build extensions */}
            <div className="relative flex-1">
              <TooltipProvider>
                <Tooltip open={engRightOpen} onOpenChange={setEngRightOpen}>
                  <TooltipTrigger asChild>
                    <div
                      className="h-full w-full bg-wes-yellow transition-all duration-200 hover:brightness-95"
                      onClick={() => { if (isMobile) setEngRightOpen((v) => !v); }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" className="px-2 py-1 whitespace-nowrap text-center text-[11px] leading-tight z-[100010]">
                    Fund to train models and build extensions
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        {/* Artists (1/3) with two equal sub-splits and per-half hover labels */}
        <div className="relative flex-1 cursor-default select-none bg-transparent">
          <div className="flex h-full overflow-visible">
            {/* Left half: Artists who refer people... */}
            <div className="relative flex-1">
              <TooltipProvider>
                <Tooltip open={artLeftOpen} onOpenChange={setArtLeftOpen}>
                  <TooltipTrigger asChild>
                    <div
                      className="h-full w-full bg-wes-mint-dark transition-all duration-200 hover:brightness-110"
                      onClick={() => { if (isMobile) setArtLeftOpen((v) => !v); }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" className="px-2 py-1 whitespace-nowrap text-center text-[11px] leading-tight z-[100010]">
                    Artists who refer people will receive a share of their lifetime spend
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* Right half: Fund art competitions */}
            <div className="relative flex-1">
              <TooltipProvider>
                <Tooltip open={artRightOpen} onOpenChange={setArtRightOpen}>
                  <TooltipTrigger asChild>
                    <div
                      className="h-full w-full bg-wes-mint transition-all duration-200 hover:brightness-110"
                      onClick={() => { if (isMobile) setArtRightOpen((v) => !v); }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" className="px-2 py-1 whitespace-nowrap text-center text-[11px] leading-tight z-[100010]">
                    We will fund art competitions with our profits
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        {/* Banodoco (1/3) */}
        <div className="relative flex-1 cursor-default select-none rounded-r-full bg-transparent">
          <TooltipProvider>
            <Tooltip open={banoOpen} onOpenChange={setBanoOpen}>
              <TooltipTrigger asChild>
                <div
                  className="h-full w-full bg-wes-pink hover:bg-wes-pink-dark transition-all duration-200"
                  aria-label="Banodoco"
                  onClick={() => { if (isMobile) setBanoOpen((v) => !v); }}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" className="px-2 py-1 whitespace-nowrap text-center text-[11px] leading-tight z-[100010]">
                Yeah, we like money too
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default ProfitSplitBar;
