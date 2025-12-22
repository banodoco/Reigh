import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ProfitSplitBar } from '@/shared/components/ProfitSplitBar';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { GlassSidePane } from './GlassSidePane';

interface CreativePartnerPaneProps {
  isOpen: boolean;
  onClose: () => void;
  isClosing: boolean;
  isOpening: boolean;
  ecosystemTipOpen: boolean;
  ecosystemTipDisabled: boolean;
  setEcosystemTipOpen: (open: boolean) => void;
  setEcosystemTipDisabled: (disabled: boolean) => void;
  navigate: (path: string) => void;
}

export const CreativePartnerPane: React.FC<CreativePartnerPaneProps> = ({
  isOpen,
  onClose,
  ecosystemTipOpen,
  ecosystemTipDisabled,
  setEcosystemTipOpen,
  setEcosystemTipDisabled,
  navigate,
}) => {
  const isMobile = useIsMobile();

  return (
    <GlassSidePane isOpen={isOpen} onClose={onClose} side="left" zIndex={100}>
      <div className="mt-8 sm:mt-10 mb-6 pr-10 sm:pr-0 relative z-10">
        <h2 className="text-2xl sm:text-3xl font-theme-heading text-primary leading-tight mb-5">reigh is an open source tool built on top of open models</h2>
        <div className="w-20 h-1.5 bg-gradient-to-r from-wes-vintage-gold to-wes-vintage-gold/50 rounded-full animate-pulse-breathe opacity-90"></div>
      </div>
      
      <div className="space-y-6 text-foreground/70">
        <p className="text-sm leading-relaxed">
          Practically for you, <strong>this means three things</strong>:
        </p>

        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm leading-6 clearfix">
              <span
                aria-hidden
                className="float-left mr-3 mt-1.5 w-9 h-9 flex items-center justify-center rounded-full border border-muted-foreground/30 font-theme-heading text-lg text-foreground/90"
              >
                1
              </span>
              If you have a decent computer, <span className="text-wes-vintage-gold">you can run Reigh for free</span>. We make it very easy - you can use the app in any browser while tasks process locally. Just run this command:
            </p>
            
            <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              <img 
                src="/gpu.webp"
                alt="Screenshot showing how easy it is to run Reigh locally"
                className="w-full h-auto rounded-lg"
              />
            </div>
            
  
          </div>

          <div className="space-y-3">
            <p className="text-sm leading-6 clearfix">
              <span
                aria-hidden
                className="float-left mr-3 mt-1.5 w-9 h-9 flex items-center justify-center rounded-full border border-muted-foreground/30 font-theme-heading text-lg text-foreground/90"
              >
                2
              </span>
              Because we use open models on consumer-grade hardware, <span className="text-wes-vintage-gold">you can also run Reigh conveniently and cheaply in the cloud</span>. By being the least expensive place to run leading open models, we aim to honour this quote by Picasso:
            </p>
            
            <blockquote className="bg-muted/30 border-l-4 border-muted/60 p-3 rounded-r-lg">
              <p className="text-sm italic text-foreground/80 font-theme-light">
                "...when artists get together they talk about where you can buy cheap turpentine."
              </p>
            </blockquote>
          </div>

          <div className="space-y-3">
            <p className="text-sm leading-6 clearfix">
              <span
                aria-hidden
                className="float-left mr-3 mt-1.5 w-9 h-9 flex items-center justify-center rounded-full border border-muted-foreground/30 font-theme-heading text-lg text-foreground/90"
              >
                3
              </span>
              We have a responsibility to help the{' '}
              <TooltipProvider>
                <Tooltip
                  open={ecosystemTipOpen}
                  onOpenChange={(o) => {
                    console.log('[EcosystemTooltip] onOpenChange:', o, 'disabled:', ecosystemTipDisabled);
                    if (!ecosystemTipDisabled) setEcosystemTipOpen(o);
                  }}
                >
                  <TooltipTrigger asChild>
                    <span
                      onMouseEnter={() => {
                        console.log('[EcosystemTooltip] Mouse enter, disabled:', ecosystemTipDisabled);
                      }}
                      onMouseLeave={() => {
                        console.log('[EcosystemTooltip] Mouse leave, disabled:', ecosystemTipDisabled);
                        if (ecosystemTipDisabled) setEcosystemTipDisabled(false);
                      }}
                      onClick={() => {
                        console.log('[EcosystemTooltip] Click/Touch, current state:', ecosystemTipOpen, 'disabled:', ecosystemTipDisabled);
                        if (isMobile) {
                          // On mobile, toggle the tooltip on click
                          if (ecosystemTipOpen) {
                            setEcosystemTipOpen(false);
                            setEcosystemTipDisabled(false);
                          } else {
                            setEcosystemTipOpen(true);
                            setEcosystemTipDisabled(true);
                          }
                        }
                      }}
                      className={`sparkle-underline cursor-pointer transition-colors duration-200 hover:text-primary ${ecosystemTipOpen ? 'tooltip-open text-primary' : 'text-foreground/70'} ${ecosystemTipDisabled ? 'pointer-events-none' : ''}`}
                    >
                      open source ecosystem
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="center"
                    className="group p-2 sm:p-3 rounded-lg border border-border/25 bg-popover/45 text-popover-foreground shadow-sm backdrop-blur-md"
                    onPointerEnter={() => {
                      console.log('[EcosystemTooltip] Pointer entered content – holding open');
                      if (!isMobile) {
                        setEcosystemTipDisabled(true);
                        setEcosystemTipOpen(true);
                      }
                    }}
                    onPointerLeave={() => {
                      console.log('[EcosystemTooltip] Pointer left content – releasing hold');
                      if (!isMobile) {
                        setEcosystemTipDisabled(false);
                        setEcosystemTipOpen(false);
                      }
                    }}
                  >
                    <div className="w-[360px] h-[270px] overflow-hidden rounded border relative bg-card dark:bg-gray-800">
                      <iframe
                        title="Open Source Ecosystem"
                        style={{ width: '360px', height: '270px', border: 0 }}
                        onLoad={() => console.log('[EcosystemTooltip] Iframe loaded')}
                        onError={() => console.log('[EcosystemTooltip] Iframe error')}
                        src={`/ecosystem-embed.html?scale=1.1&dark=true`}
                      />
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {' '}flourish, so <span className="text-wes-vintage-gold">we share our profits with those whose work makes Reigh possible</span>.
            </p>
            
            <p className="mt-3 text-sm leading-relaxed">
              After other costs like hosting, we'll <strong>split the profit three ways</strong>:
            </p>

            <ProfitSplitBar className="space-y-2" />
          </div>
        </div>
        
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            We'd like to show a model for how others can build successful tools while supporting this ecosystem that makes them possible.
          </p>
        </div>
        
        {/* Divider */}
        <div className="w-12 h-px bg-muted/30"></div>

        {/* CTA */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate('/tools')}
            className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
          >
            Start creating for free
          </button>
          <span className="text-muted-foreground/50">|</span>
          <a
            href="https://discord.gg/D5K2c6kfhy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
          >
            Join the community
          </a>
        </div>
      </div>
    </GlassSidePane>
  );
};
