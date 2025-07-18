import { useNavigate } from 'react-router-dom';
import { AppEnv, type AppEnvValue } from '../types/env';
import { Camera, Palette, Zap, Crown, Paintbrush, Video, Edit, Sparkles, Film, Maximize2, Wand2, Layers, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toolsUIManifest, type ToolUIDefinition } from '../tools';
import { PageFadeIn, FadeInSection } from '@/shared/components/transitions';
import { useContentResponsive, useContentResponsiveDirection, useContentResponsiveColumns } from '@/shared/hooks/useContentResponsive';
import React from 'react';

// Define process tools (main workflow)
const processTools = [
  {
    id: 'image-generation',
    name: 'Generate Images',
    description: 'Create images using a variety of models and styles, with support from LLMs.',
    tool: toolsUIManifest.find(t => t.id === 'image-generation'),
    icon: Paintbrush,
    gradient: 'from-wes-pink via-wes-lavender to-wes-dusty-blue',
    accent: 'wes-pink',
  },
  {
    id: 'travel-between-images',
    name: 'Travel Between Images',
    description: 'Transform static images into video sequences with controllable transitions.',
    tool: toolsUIManifest.find(t => t.id === 'travel-between-images'),
    icon: Video,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    accent: 'wes-mint',
  },
  {
    id: 'reinvent-videos',
    name: 'Reinvent Videos',
    description: 'Transform existing videos with AI-powered style transfer and creative effects.',
    tool: null, // Coming soon
    icon: Film,
    gradient: 'from-wes-coral via-wes-salmon to-wes-pink',
    accent: 'wes-coral',
    comingSoon: true,
  },
  {
    id: 'upscale-videos',
    name: 'Upscale Videos',
    description: 'Enhance video quality and resolution using advanced AI upscaling techniques.',
    tool: null, // Coming soon
    icon: Maximize2,
    gradient: 'from-wes-vintage-gold via-wes-mustard to-wes-yellow',
    accent: 'wes-vintage-gold',
    comingSoon: true,
  },
];

// Define assistant tools
const assistantTools = [
  {
    id: 'edit-videos',
    name: 'Edit\nVideos',
    description: 'AI-assisted cuts, transitions, and effects.',
    tool: null, // Coming soon
    icon: Wand2,
    gradient: 'from-wes-dusty-blue via-wes-sage to-wes-mint',
    accent: 'wes-dusty-blue',
    comingSoon: true,
  },
  {
    id: 'edit-images',
    name: 'Edit\nImages',
    description: 'Transform, reimagine, and enhance images.',
    tool: null, // Marked as coming soon
    icon: Edit,
    gradient: 'from-wes-yellow via-wes-salmon to-wes-pink',
    accent: 'wes-yellow',
    comingSoon: true,
  },
  {
    id: 'generate-perspectives',
    name: 'Different\nPerspectives',
    description: 'Create images from different perspectives.',
    tool: null, // Coming soon
    icon: Eye,
    gradient: 'from-wes-lavender via-wes-pink to-wes-coral',
    accent: 'wes-lavender',
    comingSoon: true,
  },
  {
    id: 'train-lora',
    name: 'Train\nLoRA',
    description: 'Fine-tune LoRAs for unique styles & motion.',
    tool: null, // Coming soon
    icon: Layers,
    gradient: 'from-wes-sage via-wes-mint to-wes-dusty-blue',
    accent: 'wes-sage',
    comingSoon: true,
  },
];

const ToolCard = ({ item, isSquare = false, index, isVisible }: { item: any, isSquare?: boolean, index?: number, isVisible: boolean }) => {
  const [isWiggling, setIsWiggling] = useState(false);
  const navigate = useNavigate();
  
  // Use content-responsive breakpoints for dynamic sizing
  const { isSm, isLg } = useContentResponsive();

  const handleComingSoonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWiggling(true);
    setTimeout(() => setIsWiggling(false), 500); // Match animation duration
  };

  const isComingSoon = item.comingSoon || (!item.tool);
  const shouldShow = isComingSoon || isVisible;

  if (!shouldShow) return null;

  // Dynamic sizing based on content area
  const iconSize = isLg ? 'w-10 h-10' : isSm ? 'w-8 h-8' : 'w-6 h-6';
  const iconContainerSize = isLg ? 'w-20 h-20' : isSm ? 'w-16 h-16' : 'w-12 h-12';
  const titleSize = isLg ? 'text-2xl' : isSm ? 'text-xl' : 'text-lg';
  const descriptionSize = isSm ? 'text-sm' : 'text-xs';

  const content = (
    <div className={`wes-tool-card relative overflow-hidden ${isSquare ? 'min-h-48' : 'h-32 sm:h-32'} ${isComingSoon ? 'opacity-40' : ''} h-full`}>
      {/* Coming Soon Badge */}
      {isComingSoon && isSm && (
        <div className={`absolute ${isSquare ? 'top-1 right-2' : 'top-2 right-2'} z-10 ${isWiggling ? 'animate-subtle-wiggle' : ''}`}>
          <div className="bg-gradient-to-r from-wes-vintage-gold to-wes-mustard text-primary text-xs font-bold px-2 py-0.5 rounded-md border border-primary/20 shadow-sm">
            COMING SOON
          </div>
        </div>
      )}

      {/* Horizontal layout for Process tools */}
      {!isSquare ? (
        <div className="flex items-center h-full p-1 sm:p-2 lg:p-3 relative">
          {/* Large subtle number in background - responsive visibility */}
          {index !== undefined && isLg && (
            <div className="absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 -translate-y-5">
              <span className="font-playfair text-[8rem] lg:text-[10.5rem] font-bold text-wes-vintage-gold/50 select-none block w-20 lg:w-24 text-center">
                {index + 1}
              </span>
            </div>
          )}
          
          {/* Icon */}
          <div className={`flex-shrink-0 ${isSm ? 'mr-4' : 'mr-3'} ${isLg ? 'mr-6' : ''} relative z-10`}>
            <div className={`${iconContainerSize} bg-gradient-to-br ${item.gradient} rounded-xl sm:rounded-2xl flex items-center justify-center shadow-wes-deep ${!isComingSoon ? 'group-hover:shadow-wes-hover group-hover:scale-110' : ''} transition-all duration-700`}>
              <item.icon className={`${iconSize} text-white drop-shadow-lg`} />
            </div>
          </div>
          
          {/* Text content */}
          <div className="flex-1 relative z-10 min-w-0">
            <h3 className={`font-playfair ${titleSize} font-bold text-primary mb-1 ${!isComingSoon ? 'group-hover:text-primary/80' : ''} transition-colors duration-300 leading-tight`}>
              {item.name}
            </h3>
            <p className={`font-inter ${descriptionSize} text-muted-foreground leading-relaxed pr-2`}>
              {item.description}
            </p>
          </div>
        </div>
      ) : (
        /* Square layout for Assistant tools - Responsive padding and sizing */
        <div className={`${isSm ? 'p-2' : 'p-1'} ${isLg ? 'p-3' : ''} h-full flex flex-col`}>
          {/* Tool Header without icon */}
          <div className={`wes-symmetry ${isSm ? 'mb-3' : 'mb-2'} relative`}>
            <div className="">
              <h3 className={`font-playfair ${titleSize} font-bold text-primary mb-2 ${!isComingSoon ? 'group-hover:text-primary/80' : ''} transition-colors duration-300 text-shadow-vintage text-center leading-tight whitespace-pre-line`}>
                {item.name}
              </h3>
              <div className={`${isSm ? 'w-16' : 'w-12'} h-1 bg-gradient-to-r from-${item.accent} to-wes-vintage-gold rounded-full mx-auto ${!isComingSoon ? `${isSm ? 'group-hover:w-24' : 'group-hover:w-16'}` : ''} transition-all duration-700`}></div>
            </div>
          </div>

          {/* Description - hidden on mobile to save space */}
          {isSm && (
            <div className="flex-1">
              <p className={`font-inter text-muted-foreground leading-relaxed text-center ${descriptionSize}`}>
                {item.description}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Decorative Elements */}
      <div className={`absolute ${isSm ? 'top-4 right-4' : 'top-3 right-3'} opacity-20`}>
        <Sparkles className={`${isSm ? 'w-5 h-5' : 'w-4 h-4'} text-primary animate-sway`} />
      </div>

      {/* Hover shimmer effect (only for active tools) */}
      {!isComingSoon && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-wes-vintage-gold/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1200 ease-out"></div>
      )}
    </div>
  );

  if (isComingSoon) {
    return (
      <div className="relative w-full h-full">
        <button
          type="button"
          className="block wes-corners cursor-pointer w-full text-left h-full"
          onClick={handleComingSoonClick}
        >
          {content}
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative group cursor-pointer w-full h-full"
      onClick={() => {
        if (item.tool?.path) {
          navigate(item.tool.path);
        }
      }}
    >
      <div className="block wes-corners h-full">
        {content}
      </div>
    </div>
  );
};

const ToolSelectorPage: React.FC = () => {
  const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB) as AppEnvValue;

  // Content-responsive breakpoints and layout values
  const { isSm, isLg } = useContentResponsive();
  // Remove layoutDirection hook, use Tailwind classes instead

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const isToolVisible = (tool: ToolUIDefinition | null) => {
    if (!tool) return false;
    if (currentEnv === AppEnv.DEV) return true;
    return tool.environments.includes(currentEnv);
  };

  // Dynamic spacing based on content area - fixed padding to prevent right shift
  const containerPadding = isSm ? 'px-4' : 'px-2';
  const containerSpacing = isLg ? 'pt-6 pb-4' : isSm ? 'pt-4 pb-2' : 'pt-3 pb-[0.333rem]';
  const sectionGap = isLg ? 'gap-8' : isSm ? 'gap-6' : 'gap-4';
  const itemGap = isSm ? 'gap-4' : 'gap-3';
  const topMargin = isSm ? 'mt-4' : 'mt-2';
  const bottomMargin = ''; // layoutDirection === 'column' ? 'mb-8' : '';

  return (
    <PageFadeIn className="min-h-[70vh] relative overflow-hidden">
      {/* Simplified background - reduced layering to prevent conflicts */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-70"></div>
      
      {/* Single subtle pattern instead of multiple conflicting ones */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `
          linear-gradient(45deg, transparent 40%, hsl(var(--wes-coral) / 0.08) 40%, hsl(var(--wes-coral) / 0.08) 60%, transparent 60%),
          linear-gradient(-45deg, transparent 40%, hsl(var(--wes-mint) / 0.08) 40%, hsl(var(--wes-mint) / 0.08) 60%, transparent 60%)
        `,
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 12px 12px'
      }}></div>
      
      {/* Reduced floating elements to prevent visual clutter */}
      <div className="absolute top-20 right-20 w-32 h-32 bg-wes-pink/8 rounded-full blur-3xl animate-parallax-float"></div>
      <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/8 rounded-full blur-3xl animate-parallax-float" style={{ animationDelay: '4s' }}></div>
      
      {/* Fixed container structure to prevent right shift */}
      <div className={`w-full ${containerPadding} ${containerSpacing} relative z-10`}>
        <div className="max-w-7xl mx-auto">
          {/* Content-Responsive Layout */}
          <div className={`flex flex-col c-lg:flex-row ${sectionGap}`}>
            {/* Process Column */}
            <div className="w-full c-lg:w-2/3">
              <div className={`flex flex-col ${itemGap} ${topMargin}`}>
                {processTools.map((tool, index) => (
                  <FadeInSection key={tool.id} delayMs={index * 50}>
                    <ToolCard
                      item={tool}
                      index={index}
                      isVisible={isToolVisible(tool.tool)}
                    />
                  </FadeInSection>
                ))}
              </div>
            </div>

            {/* Assistant Tools Column */}
            <div className="w-full c-lg:w-1/3">
              <div className={`grid ${itemGap} ${topMargin} grid-cols-2`}>
                {assistantTools.map((tool, index) => (
                  <FadeInSection key={tool.id} delayMs={index * 50}>
                    <ToolCard
                      item={tool}
                      isSquare
                      isVisible={isToolVisible(tool.tool)}
                    />
                  </FadeInSection>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageFadeIn>
  );
};

export default ToolSelectorPage; 