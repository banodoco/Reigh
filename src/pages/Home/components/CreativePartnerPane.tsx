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
            <h3 className="font-theme-light text-primary text-lg">1) You can run Reigh for free on your computer</h3>
            
            <p className="text-sm leading-relaxed">
              If you have a decent computer, you can run Reigh for free. We make it easy—you can use the app in any browser while tasks process at home. Just run this command:
            </p>
            
            <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              <img 
                src="/gpu.png"
                alt="Screenshot showing how easy it is to run Reigh locally"
                className="w-full h-auto rounded-lg"
              />
            </div>
            
            <p className="text-sm leading-relaxed">
              We call our approach an <strong className="text-primary">Open Creative Partner Programme</strong>. We open source our tool and models so artists can create for free, hoping this attracts others who choose to pay for convenience.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-theme-light text-primary text-lg">2) Reigh is very convenient and cheap to run on the cloud</h3>
            
            <p className="text-sm leading-relaxed">
              While we make it as easy as possible to run Reigh for free, you can also run it conveniently and cheaply in the cloud. Because we use open models on consumer-grade hardware, <strong>our costs are a fraction of what big platforms charge.</strong>
            </p>
            
            <p className="text-sm leading-relaxed">
              Therefore, if you choose to create with Reigh, you'll be honouring the age-old truth in the sentiment expressed by Picasso:
            </p>
            
            <blockquote className="bg-wes-vintage-gold/10 border-l-4 border-wes-vintage-gold/60 p-3 rounded-r-lg">
              <p className="text-sm italic text-primary font-theme-light">
                "...when artists get together they talk about where you can buy cheap turpentine."
              </p>
            </blockquote>
          </div>

          <div className="space-y-3">
            <h3 className="font-theme-light text-primary text-lg">3) We're part of the open source ecosystem, and will systematically support this & the people within it</h3>
            
            <p className="text-sm leading-relaxed">
              We're part of the{' '}
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
                      className={`sparkle-underline cursor-pointer transition-all duration-300 ease-out ${ecosystemTipOpen ? 'tooltip-open font-bold scale-110' : 'scale-100'} ${ecosystemTipDisabled ? 'pointer-events-none' : ''}`}
                    >
                      open source ecosystem
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="center"
                    className="group p-2 sm:p-3 bg-wes-cream/90 dark:bg-gray-950 dark:border-gray-700 border-2 border-transparent rounded-lg shadow-md"
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
              . We have a responsibility to help this ecosystem flourish, so we share our profits with the people and projects that make Reigh possible:
            </p>
            
            <ProfitSplitBar className="space-y-2" />
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>After other costs like hosting, we'll <strong>split the profit three ways</strong>:</p>
              <div className="space-y-2">
                <div>
                  <p className="text-primary font-theme-light">A) Artists — 1/3:</p>
                  <p className="mt-1 text-sm text-muted-foreground">We'll share 1/3 with artists, of which half will go to those who refer others to Reigh, while half will go towards art competitions and support for arts.</p>
                </div>
                <div>
                  <p className="text-primary font-theme-light">B) Engineers — 1/3:</p>
                  <p className="mt-1 text-sm text-muted-foreground">We'll share 1/3 with engineers, of which half will go to developers whose LoRAs/workflows are used in Reigh, while half will fund open source projects (model training, extensions, etc.).</p>
                </div>
                <div>
                  <p className="text-primary font-theme-light">C) Banodoco — 1/3:</p>
                  <p className="mt-1 text-sm text-muted-foreground">A further third will go towards our company, to fund this and further projects.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Divider */}
        <div className="w-full h-px bg-muted/30"></div>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            We believe that the open source art ecosystem can be a beautiful place that helps humanity's relationship with AI flourish. We would like Reigh to support this as much as possible, and show a model for how others can build successful tools that support this ecosystem. 
            <br />
            <br />
            We hugely appreciate your support.
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
