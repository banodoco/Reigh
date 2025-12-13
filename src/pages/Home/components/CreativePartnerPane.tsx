import React from 'react';
import { X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ProfitSplitBar } from '@/shared/components/ProfitSplitBar';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { useIsMobile } from '@/shared/hooks/use-mobile';

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
  isClosing,
  ecosystemTipOpen,
  ecosystemTipDisabled,
  setEcosystemTipOpen,
  setEcosystemTipDisabled,
  navigate,
}) => {
  const isMobile = useIsMobile();
  const creativeContentRef = React.useRef<HTMLDivElement | null>(null);

  const creativeScrollFade = useScrollFade({ 
    isOpen,
    debug: false,
    preloadFade: isMobile
  });

  // Attach the ref from useScrollFade and our local ref
  const setRefs = (element: HTMLDivElement | null) => {
    creativeContentRef.current = element;
    if (creativeScrollFade.scrollRef) {
      // @ts-ignore - handling multiple refs
      creativeScrollFade.scrollRef.current = element;
    }
  };

  return (
    <div className={`fixed top-0 left-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-card dark:bg-gray-900 shadow-2xl z-[100] transform transition-transform duration-300 ease-in-out overflow-visible flex flex-col ${
      isOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div ref={setRefs} className="px-4 sm:px-8 pt-2 sm:pt-4 pb-4 sm:pb-8 flex-1 overflow-y-auto overflow-x-visible min-h-0 relative z-20">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
        >
          <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
        </button>
        
        <div className="mb-8 pr-12 sm:pr-0 space-y-3 relative z-10">
          <h2 className="text-2xl sm:text-3xl font-theme-heading text-primary">reigh is an open source tool built on top of open models</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-wes-coral to-wes-pink rounded-full animate-pulse-breathe"></div>
        </div>
        
        <div className="space-y-6 text-muted-foreground">
          <p className="text-sm leading-relaxed">
            Practically for you, <strong>this means three things</strong>:
          </p>

          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-theme-light text-primary text-lg">1) You can run Reigh for free on your computer</h3>
              
              <p className="text-sm leading-relaxed">
                When you sign up to Reigh, you'll notice something strange: if you have a decent computer, you can run it for free! <strong>We make this very easy</strong>—you can use the app in any browser while the tasks process at home.
              </p>
              
              <p className="text-sm leading-relaxed">
                This isn't just possible, but <strong>we make it very easy</strong>. To run it for free, you just need to run this command:
              </p>
              
              <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                <img 
                  src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads//easy.png"
                  alt="Screenshot showing how easy it is to run Reigh locally"
                  className="w-full h-auto rounded-lg"
                />
              </div>
              
              <p className="text-sm leading-relaxed">
                We call our approach an <strong className="text-primary">Open Creative Partner Programme</strong>. In short, we open source our tool, capabilities, and models, then make it as easy as possible for people to run them for free. We hope that artists will use the free tool to create, and this in turn attracts others—many of whom won't have powerful computers or will want to pay for convenience.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-theme-light text-primary text-lg">2) Reigh is very convenient and cheap to run on the cloud</h3>
              
              <p className="text-sm leading-relaxed">
                Some open source tools can be difficult to run - you often need to go through a complicated local setup process to even start creating.
              </p>
              
              <p className="text-sm leading-relaxed">
                While we make it as easy as possible to run Reigh for free if you have a good computer, you can also run it conveniently and cheaply in the cloud. Because we use open models and run on consumer-grade hardware, <strong>our costs are a fraction of what big platforms charge.</strong>
              </p>
              
              <p className="text-sm leading-relaxed">
                Threfore, if you choose to create with Reigh, you'll be honouring the age-old truth in the sentiment expressed by Picasso:
              </p>
              
              <blockquote className="bg-wes-coral/10 border-l-4 border-wes-coral p-3 rounded-r-lg">
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
                      className="group p-2 sm:p-3 bg-wes-cream/90 border-2 border-transparent rounded-lg shadow-md"
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
                          src={`/ecosystem-embed.html?scale=1.1`}
                        />
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                , meaning we have a responsibility to help this ecosystem flourish.
              </p>

              <p className="text-sm leading-relaxed">
                To do this, we will share our profits with projects and people whose contributions enabled Reigh to exist:
              </p>
              
              <ProfitSplitBar className="space-y-2" />
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Practically, we will charge roughly twice our inference costs — because we're running on consumer hardware, we'll still be over 50 times cheaper than Veo3, for example.
                </p>
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
      </div>
      
      {/* Fade overlay for Creative Partner pane */}
      {creativeScrollFade.showFade && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
        >
          <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent" />
        </div>
      )}
    </div>
  );
};

