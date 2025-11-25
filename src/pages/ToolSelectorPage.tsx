import { useNavigate } from 'react-router-dom';
import { AppEnv, type AppEnvValue } from '../types/env';
import { Camera, Palette, Zap, Crown, Paintbrush, Video, Edit, Sparkles, Film, Maximize2, Wand2, Layers, Eye, Users, Link2 } from 'lucide-react';
import { useEffect, useState, useRef, useCallback, createContext, useContext } from 'react';
import { toolsUIManifest, type ToolUIDefinition } from '../tools';
import { PageFadeIn, FadeInSection } from '@/shared/components/transitions';
import { useContentResponsive, useContentResponsiveDirection, useContentResponsiveColumns } from '@/shared/hooks/useContentResponsive';
import React, { memo } from 'react';

// Context to share overflow detection across tool cards
// Tracks both title and description overflow for consistent two-line display
const CardOverflowContext = createContext<{
  forceTwoLinesTitles: boolean;
  forceTwoLinesDescriptions: boolean;
  reportTitleOverflow: () => void;
  reportDescriptionOverflow: () => void;
  resizeKey: number;
}>({ 
  forceTwoLinesTitles: false, 
  forceTwoLinesDescriptions: false,
  reportTitleOverflow: () => {}, 
  reportDescriptionOverflow: () => {},
  resizeKey: 0 
});
import { time, timeEnd } from '@/shared/lib/logger';
import { useVideoGalleryPreloader } from '@/shared/hooks/useVideoGalleryPreloader';
import { useClickRipple } from '@/shared/hooks/useClickRipple';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

// Define process tools (main workflow)
const processTools = [
  {
    id: 'image-generation',
    name: 'Generate Images',
    description: 'Create images using a variety of models and styles, with support from LLMs.',
    descriptionMobile: 'Create images support from LLMs.',
    tool: toolsUIManifest.find(t => t.id === 'image-generation'),
    icon: Paintbrush,
    gradient: 'from-wes-vintage-gold via-wes-mustard to-wes-yellow',
    accent: 'wes-pink',
  },
  {
    id: 'travel-between-images',
    name: 'Travel Between Images',
    description: 'Transform static images into video sequences with controllable transitions.',
    descriptionMobile: 'Turn images into video sequences.',
    tool: toolsUIManifest.find(t => t.id === 'travel-between-images'),
    icon: Video,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    accent: 'wes-mint',
  },
  // {
  //   id: 'reinvent-videos',
  //   name: 'Reinvent Videos',
  //   description: 'Transform existing videos with AI-powered style transfer and creative effects.',
  //   tool: null, // Coming soon
  //   icon: Film,
  //   gradient: 'from-wes-coral via-wes-salmon to-wes-pink',
  //   accent: 'wes-coral',
  //   comingSoon: true,
  // },
  // {
  //   id: 'upscale-videos',
  //   name: 'Upscale Videos',
  //   description: 'Enhance video quality and resolution using advanced AI upscaling techniques.',
  //   tool: null, // Coming soon
  //   icon: Maximize2,
  //   gradient: 'from-wes-pink via-wes-lavender to-wes-dusty-blue',
  //   accent: 'wes-vintage-gold',
  //   comingSoon: true,
  // },
];

// Define assistant tools
const assistantTools = [
  {
    id: 'edit-images',
    name: 'Edit Images',
    description: 'Transform and enhance images.',
    descriptionMobile: 'Refine + enhance',
    tool: toolsUIManifest.find(t => t.id === 'edit-images'),
    icon: Edit,
    gradient: 'from-wes-yellow via-wes-salmon to-wes-pink',
    accent: 'wes-yellow',
  },
  {
    id: 'join-clips',
    name: 'Join Clips',
    description: 'Seamlessly connect video clips.',
    descriptionMobile: 'Connect seamlesly',
    tool: toolsUIManifest.find(t => t.id === 'join-clips'),
    icon: Link2,
    gradient: 'from-wes-dusty-blue via-wes-lavender to-wes-pink',
    accent: 'wes-dusty-blue',
  },
  {
    id: 'character-animate',
    name: 'Animate Characters',
    description: 'Bring characters to life.',
    descriptionMobile: 'Breathe life',
    tool: toolsUIManifest.find(t => t.id === 'character-animate'),
    icon: Users,
    gradient: 'from-wes-sage via-wes-mint to-wes-lavender',
    accent: 'wes-sage',
  },
  {
    id: 'moon-soon',
    name: 'More Soon',
    description: "We're adding more tools!",
    descriptionMobile: 'Stay tuned',
    tool: null,
    icon: Sparkles,
    gradient: 'from-wes-dusty-blue via-wes-sage to-wes-mint',
    accent: 'wes-dusty-blue',
    comingSoon: true,
  },
];

const ToolCard = memo(({ item, isSquare = false, index, isVisible }: { item: any, isSquare?: boolean, index?: number, isVisible: boolean }) => {
  const [isWiggling, setIsWiggling] = useState(false);
  const navigate = useNavigate();
  const { triggerRipple, triggerRippleAtCenter, rippleStyles, isRippleActive } = useClickRipple();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const { 
    forceTwoLinesTitles, 
    forceTwoLinesDescriptions, 
    reportTitleOverflow, 
    reportDescriptionOverflow, 
    resizeKey 
  } = useContext(CardOverflowContext);
  
  // Use content-responsive breakpoints for dynamic sizing
  const { isSm, isLg } = useContentResponsive();
  
  // Helper to check if an element would overflow on a single line
  const checkElementOverflow = useCallback((el: HTMLElement | null, reportFn: () => void, isForced: boolean) => {
    if (!el || isForced) return;
    
    // Temporarily force single line to measure true text width
    const originalWhiteSpace = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    
    // Check if text overflows container
    const overflows = el.scrollWidth > el.clientWidth;
    
    // Restore original style
    el.style.whiteSpace = originalWhiteSpace;
    
    if (overflows) {
      reportFn();
    }
  }, []);
  
  // Detect if title would overflow on a single line
  useEffect(() => {
    if (!isSquare || !titleRef.current || forceTwoLinesTitles) return;
    
    const checkOverflow = () => checkElementOverflow(titleRef.current, reportTitleOverflow, forceTwoLinesTitles);
    
    // Check after DOM has updated
    const timeoutId = setTimeout(checkOverflow, 50);
    const observer = new ResizeObserver(() => setTimeout(checkOverflow, 10));
    observer.observe(titleRef.current);
    
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [isSquare, reportTitleOverflow, item.name, resizeKey, forceTwoLinesTitles, checkElementOverflow]);
  
  // Detect if description would overflow on a single line
  useEffect(() => {
    if (!isSquare || !descriptionRef.current || forceTwoLinesDescriptions) return;
    
    const checkOverflow = () => checkElementOverflow(descriptionRef.current, reportDescriptionOverflow, forceTwoLinesDescriptions);
    
    // Check after DOM has updated
    const timeoutId = setTimeout(checkOverflow, 50);
    const observer = new ResizeObserver(() => setTimeout(checkOverflow, 10));
    observer.observe(descriptionRef.current);
    
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [isSquare, reportDescriptionOverflow, item.description, resizeKey, forceTwoLinesDescriptions, checkElementOverflow]);

  // Debug logging for tools
  useEffect(() => {
    if (item.id === 'character-animate' || item.id === 'join-clips') {
      const isDisabled = !isVisible;
      console.log(`[${item.id}Visibility] ToolCard:`,
        `isVisible=${isVisible}, isDisabled=${isDisabled}, ` +
        `hasTool=${!!item.tool}`);
    }
  }, [item.id, isVisible, item.tool]);

  const handlePointerDown = (e: React.PointerEvent) => {
    triggerRipple(e);
    time('NavPerf', `ClickLag:${item.id}`);
  };

  const handleComingSoonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerRipple(e);
    setIsWiggling(true);
    setTimeout(() => {
      setIsWiggling(false);
    }, 600); // Match animation duration
  };

  // Special handling for character-animate: show as disabled when not in cloud mode
  // For other tools, use comingSoon flag or missing tool to determine disabled state
  const isDisabled = item.id === 'character-animate' 
    ? !isVisible  // Disabled when cloud mode is off
    : (item.comingSoon || !item.tool);
  
  // Character-animate always shows (disabled if not visible)
  // Other tools show if coming soon or visible
  const shouldShow = item.id === 'character-animate' ? true : (isDisabled || isVisible);

  if (!shouldShow) return null;

  // Dynamic sizing based on content area - increased text sizes
  const iconSize = isLg ? 'w-10 h-10' : isSm ? 'w-8 h-8' : 'w-6 h-6';
  const iconContainerSize = isLg ? 'w-20 h-20' : isSm ? 'w-16 h-16' : 'w-12 h-12';
  const titleSize = isLg ? 'text-3xl' : isSm ? 'text-2xl' : 'text-xl';
  const titleSizeSquare = isLg ? 'text-2xl' : isSm ? 'text-xl' : 'text-lg';
  const descriptionSize = isSm ? 'text-base' : 'text-xs';

  const content = (
    <div 
      className={`wes-tool-card click-ripple relative ${isSquare ? '' : 'h-32 sm:h-32'} ${isDisabled ? 'opacity-40' : ''} ${isRippleActive ? 'ripple-active' : ''} h-full`}
      style={rippleStyles}
    >
      {/* Disabled/Coming Soon Badge */}
      {isDisabled && isSm && (
        <div className={`absolute ${isSquare ? 'top-1 right-2' : 'top-2 right-2'} z-10 ${isWiggling ? 'animate-subtle-wiggle' : ''}`}>
          <div className="bg-gradient-to-r from-wes-vintage-gold to-wes-mustard text-primary text-xs font-bold px-2 py-0.5 rounded-md border border-primary/20 shadow-sm">
            {item.id === 'character-animate' ? 'CLOUD MODE' : 'COMING SOON'}
          </div>
        </div>
      )}

      {/* Horizontal layout for Process tools */}
      {!isSquare ? (
        <div className="flex items-center h-full px-2 py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-2 relative">
          {/* Large subtle number in background - responsive visibility */}
          {index !== undefined && isLg && (
            <div className="absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 -translate-y-5">
              <span className="font-theme text-[8rem] lg:text-[10.5rem] font-theme-light text-wes-vintage-gold/30 select-none block w-20 lg:w-24 text-center">
                {index + 1}
              </span>
            </div>
          )}
          
          {/* Icon */}
          <div className={`flex-shrink-0 ${isSm ? 'mr-4' : 'mr-3'} ${isLg ? 'mr-6' : ''} relative z-10`}>
            <div className={`${iconContainerSize} bg-gradient-to-br ${item.gradient} rounded-xl sm:rounded-2xl flex items-center justify-center shadow-wes-deep ${!isDisabled ? 'group-hover:shadow-wes-hover group-hover:scale-110' : ''} transition-all duration-700`}>
              <item.icon className={`${iconSize} text-white drop-shadow-lg`} />
            </div>
          </div>
          
          {/* Text content */}
          <div className="flex-1 relative z-10 min-w-0">
            <h3 className={`font-theme ${titleSize} font-theme-heading text-primary mb-1 ${!isDisabled ? 'group-hover:text-primary/80' : ''} transition-colors duration-300 leading-tight`}>
              {item.name}
            </h3>
            <p className={`font-theme ${descriptionSize} font-theme-body text-muted-foreground leading-relaxed pr-2`}>
              {!isSm && item.descriptionMobile ? item.descriptionMobile : item.description}
            </p>
          </div>
        </div>
      ) : (
        /* Square layout for Assistant tools - Responsive padding and sizing */
        <div className={`${isSm ? 'px-1 py-1' : 'px-1 py-0.5'} ${isLg ? 'px-3 py-1.5' : ''} h-full flex flex-col justify-center`}>
          {/* Tool Header without icon */}
          <div className={`wes-symmetry ${isSm ? 'mb-0.5' : 'mb-0'} relative`}>
            <div className={`${isSm ? 'px-1' : 'px-0'} w-full min-w-0`}>
              <h3 
                ref={titleRef}
                className={`font-theme ${titleSizeSquare} font-theme-heading text-primary mb-1 ${!isDisabled ? 'group-hover:text-primary/80' : ''} transition-colors duration-300 text-shadow-vintage text-center leading-tight ${forceTwoLinesTitles ? 'whitespace-pre-line' : ''}`}
              >
                {forceTwoLinesTitles ? item.name.replace(' ', '\n') : item.name}
              </h3>
              <div className={`${isSm ? 'w-16' : 'w-12'} h-1 bg-gradient-to-r from-${item.accent} to-wes-vintage-gold rounded-full mx-auto ${!isDisabled ? `${isSm ? 'group-hover:w-24' : 'group-hover:w-16'}` : ''} transition-all duration-700`}></div>
            </div>
          </div>

          {/* Description - always show on mobile with adjusted styling */}
          <div className={`${isSm ? 'mt-0.5' : 'mt-1'} ${isSm ? 'px-1' : 'px-2'} overflow-hidden`}>
            <p 
              ref={descriptionRef}
              className={`font-theme font-theme-body text-muted-foreground leading-relaxed text-center ${descriptionSize} ${forceTwoLinesDescriptions ? 'whitespace-pre-line' : ''}`}
            >
              {forceTwoLinesDescriptions ? (item.descriptionMobile || item.description).replace(' ', '\n') : (item.descriptionMobile || item.description)}
            </p>
          </div>
        </div>
      )}

      {/* Decorative Elements */}
      {!isSquare && (
        <div className={`absolute ${isSm ? 'top-4 right-4' : 'top-3 right-3'} opacity-20`}>
          <Sparkles className={`${isSm ? 'w-5 h-5' : 'w-4 h-4'} text-primary animate-sway`} />
        </div>
      )}

      {/* Hover shimmer effect removed to prevent inset-0 overlay issues */}
    </div>
  );

  if (isDisabled) {
    return (
      <div className="relative w-full h-full">
        <button
          type="button"
          className="block wes-corners cursor-pointer w-full text-left h-full hover:shadow-wes-hover transition-all duration-700"
          onPointerDown={(e) => { e.stopPropagation(); time('NavPerf', `ClickLag:${item.id}`); }}
          onClick={handleComingSoonClick}
        >
          {content}
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative group cursor-pointer w-full h-full hover:shadow-wes-hover transition-all duration-700"
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={() => {
        if (item.tool?.path) {
          timeEnd('NavPerf', `ClickLag:${item.id}`);
          time('NavPerf', `PageLoad:${item.tool.path}`);
          navigate(item.tool.path);
        }
      }}
      onKeyDown={(e) => {
        if (item.tool?.path && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); // Prevent scrolling on spacebar
          triggerRippleAtCenter();
          timeEnd('NavPerf', `ClickLag:${item.id}`);
          time('NavPerf', `PageLoad:${item.tool.path}`);
          navigate(item.tool.path);
        }
      }}
    >
      <div className="block wes-corners h-full">
        {content}
      </div>
    </div>
  );
});

ToolCard.displayName = 'ToolCard';

const ToolSelectorPage: React.FC = () => {
  // Handle different environment variable formats (production, prod -> web)
  let env = import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB;
  if (env === 'production' || env === 'prod') env = AppEnv.WEB;
  const currentEnv = env as AppEnvValue;

  // Content-responsive breakpoints and layout values
  const { isSm, isLg } = useContentResponsive();
  // Remove layoutDirection hook, use Tailwind classes instead
  
  // State to force all assistant tool titles/descriptions to two lines when any overflows
  const [forceTwoLinesTitles, setForceTwoLinesTitles] = useState(false);
  const [forceTwoLinesDescriptions, setForceTwoLinesDescriptions] = useState(false);
  const [resizeKey, setResizeKey] = useState(0);
  
  const reportTitleOverflow = useCallback(() => {
    setForceTwoLinesTitles(true);
  }, []);
  
  const reportDescriptionOverflow = useCallback(() => {
    setForceTwoLinesDescriptions(true);
  }, []);
  
  // Reset overflow states on window resize so they can be re-checked
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const handleResize = () => {
      // Debounce: only reset after resize stops for 150ms
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setForceTwoLinesTitles(false);
        setForceTwoLinesDescriptions(false);
        setResizeKey(k => k + 1); // Force re-check of overflow
      }, 150);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Initialize video gallery preloader in background
  const preloaderState = useVideoGalleryPreloader();
  
  // Get generation method preferences
  const { value: generationMethods, isLoading: isLoadingGenerationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  // Allow tool if cloud generation is enabled (even if local is also enabled)
  const isCloudGenerationEnabled = generationMethods.inCloud;

  // Debug logging for character-animate visibility
  useEffect(() => {
    console.log('[CharacterAnimateVisibility] Generation methods state:', 
      `onComputer=${generationMethods.onComputer}, inCloud=${generationMethods.inCloud}, ` +
      `isLoading=${isLoadingGenerationMethods}, isCloudEnabled=${isCloudGenerationEnabled}, env=${currentEnv}`);
  }, [generationMethods, isLoadingGenerationMethods, isCloudGenerationEnabled, currentEnv]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const isToolVisible = (tool: ToolUIDefinition | null, toolId?: string) => {
    if (!tool) return false;
    
    // Character Animate only shows when using cloud generation
    // This check applies even in DEV mode
    if (toolId === 'character-animate') {
      const toolEnvironmentCheck = tool.environments.includes(currentEnv) || currentEnv === AppEnv.DEV;
      const shouldShow = toolEnvironmentCheck && isCloudGenerationEnabled;
      
      console.log('[CharacterAnimateVisibility] Visibility check:',
        `isLoading=${isLoadingGenerationMethods}, ` +
        `onComputer=${generationMethods.onComputer}, inCloud=${generationMethods.inCloud}, ` +
        `isCloudEnabled=${isCloudGenerationEnabled}, envCheck=${toolEnvironmentCheck}, ` +
        `shouldShow=${shouldShow}, FINAL=${isLoadingGenerationMethods ? true : shouldShow}`);
      
      // Show during loading (optimistic UI) to prevent layout shift/flash
      // Since default is inCloud: true, this matches the likely final state
      if (isLoadingGenerationMethods) return true;
      return shouldShow;
    }
    
    // Join Clips always shows (no cloud requirement)
    if (toolId === 'join-clips') {
      // For DEV mode, always show
      if (currentEnv === AppEnv.DEV) return true;
      // For other environments, check if tool is in environments list
      return tool.environments.includes(currentEnv);
    }
    
    // For all other tools, show in DEV mode
    if (currentEnv === AppEnv.DEV) return true;
    
    return tool.environments.includes(currentEnv);
  };

  // Dynamic spacing based on content area - fixed padding to prevent right shift
  const containerPadding = isSm ? 'px-4' : 'px-2';
  const containerSpacing = isLg ? 'pt-3 pb-2' : isSm ? 'pt-6 pb-1' : 'pt-2 pb-[0.333rem]';
  const sectionGap = isLg ? 'gap-2' : isSm ? 'gap-3' : 'gap-1';
  const itemGap = isLg ? 'gap-5' : isSm ? 'gap-6' : 'gap-3';
  const topMargin = isLg ? 'mt-0' : isSm ? 'mt-0' : 'mt-0';
  const bottomMargin = ''; // layoutDirection === 'column' ? 'mb-8' : '';

  // Filter visible assistant tools excluding "More Soon"
  const visibleAssistantTools = assistantTools.filter(t => t.id !== 'moon-soon' && isToolVisible(t.tool, t.id));
  
  // Determine if "More Soon" should be shown to avoid gaps in the grid
  // Logic adapts to the column count: 2 columns on mobile (< sm), 3 columns on desktop/tablet (>= sm)
  const columns = isSm ? 3 : 2;
  const remainder = visibleAssistantTools.length % columns;
  // Only show "More Soon" if we have exactly (columns - 1) items in the last row
  // This fills the single gap to make a complete row
  const shouldShowMoreSoon = remainder === columns - 1;
  
  // Construct final list of assistant tools to display
  const displayedAssistantTools = [...visibleAssistantTools];
  if (shouldShowMoreSoon) {
    const moreSoonTool = assistantTools.find(t => t.id === 'moon-soon');
    if (moreSoonTool) {
      displayedAssistantTools.push(moreSoonTool);
    }
  }

  return (
    <CardOverflowContext.Provider value={{ forceTwoLinesTitles, forceTwoLinesDescriptions, reportTitleOverflow, reportDescriptionOverflow, resizeKey }}>
      <PageFadeIn className="pb-4 relative">
        {/* Background elements removed to prevent inset-0 overlay issues */}
        
        {/* Reduced floating elements to prevent visual clutter */}
        <div className="absolute top-20 right-20 w-32 h-32 bg-wes-pink/8 rounded-full blur-3xl animate-parallax-float"></div>
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/8 rounded-full blur-3xl animate-parallax-float" style={{ animationDelay: '4s' }}></div>
        
        {/* Fixed container structure to prevent right shift */}
        <div className={`w-full ${containerPadding} ${containerSpacing} relative z-10`}>
          <div className="max-w-7xl mx-auto">
            {/* Content-Responsive Layout */}
            <div className={`flex flex-col c-lg:flex-row ${sectionGap}`}>
              {/* Process Column */}
              <div className="w-full c-lg:w-1/2">
                <div className={`flex flex-col ${itemGap} ${topMargin} px-2 py-2`}>
                  {processTools.map((tool, index) => {
                    const isVisible = isToolVisible(tool.tool, tool.id);
                    
                    return (
                      <FadeInSection key={tool.id}>
                        <ToolCard
                          item={tool}
                          index={index}
                          isVisible={isVisible}
                        />
                      </FadeInSection>
                    );
                  })}
                </div>
              </div>

              {/* Assistant Tools Column */}
              <div className="w-full c-lg:w-1/2">
                <div className={`grid ${itemGap} ${topMargin} grid-cols-2 sm:grid-cols-3 px-2 pt-2`}>
                  {displayedAssistantTools.map((tool, index) => {
                    const isVisible = true; // Already filtered
                    
                    return (
                      <FadeInSection key={tool.id}>
                        <ToolCard
                          item={tool}
                          isSquare
                          isVisible={isVisible}
                        />
                      </FadeInSection>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageFadeIn>
    </CardOverflowContext.Provider>
  );
};

export default ToolSelectorPage; 