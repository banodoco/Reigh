import { useNavigate } from 'react-router-dom';
import { AppEnv, type AppEnvValue } from '../types/env';
import { Camera, Palette, Zap, Star, Crown, Gem, Paintbrush, Video, Edit, Sparkles, Film, Maximize2, Wand2, Layers, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toolsUIManifest, type ToolUIDefinition } from '../tools';

// Define process tools (main workflow)
const processTools = [
  {
    id: 'image-generation',
    name: 'Generate Images',
    description: 'Create stunning images with AI-powered generation using structured prompts and artistic control.',
    tool: toolsUIManifest.find(t => t.id === 'image-generation'),
    icon: Paintbrush,
    gradient: 'from-wes-pink via-wes-lavender to-wes-dusty-blue',
    accent: 'wes-pink',
  },
  {
    id: 'video-travel',
    name: 'Travel Between Images',
    description: 'Transform static images into dynamic video sequences with smooth, artistic transitions.',
    tool: toolsUIManifest.find(t => t.id === 'video-travel'),
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
    description: 'Professional video editing with AI-assisted cuts, transitions, and effects.',
    tool: null, // Coming soon
    icon: Wand2,
    gradient: 'from-wes-dusty-blue via-wes-sage to-wes-mint',
    accent: 'wes-dusty-blue',
    comingSoon: true,
  },
  {
    id: 'edit-images',
    name: 'Edit\nImages',
    description: 'Transform and enhance images with text-based editing and artistic reimagining.',
    tool: null, // Marked as coming soon
    icon: Edit,
    gradient: 'from-wes-yellow via-wes-salmon to-wes-pink',
    accent: 'wes-yellow',
    comingSoon: true,
  },
  {
    id: 'generate-perspectives',
    name: 'Different\nPerspectives',
    description: 'Create multiple viewpoints and angles from a single image using AI technology.',
    tool: null, // Coming soon
    icon: Eye,
    gradient: 'from-wes-lavender via-wes-pink to-wes-coral',
    accent: 'wes-lavender',
    comingSoon: true,
  },
  {
    id: 'train-lora',
    name: 'Train\nLoRA',
    description: 'Fine-tune custom LoRA models using your own image datasets for unique styles.',
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

  const handleComingSoonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWiggling(true);
    setTimeout(() => setIsWiggling(false), 500); // Match animation duration
  };

  const isComingSoon = item.comingSoon || (!item.tool);
  const shouldShow = isComingSoon || isVisible;

  if (!shouldShow) return null;

  const content = (
    <div className={`wes-tool-card relative overflow-hidden ${isSquare ? 'h-full !p-0' : 'h-32'} wes-polaroid ${isComingSoon ? 'opacity-75' : ''}`}>
      {/* Coming Soon Badge */}
      {isComingSoon && (
        <div className={`absolute ${isSquare ? 'top-1 right-2' : 'top-2 right-2'} z-10 ${isWiggling ? 'animate-subtle-wiggle' : ''}`}>
          <div className="bg-gradient-to-r from-wes-vintage-gold to-wes-mustard text-primary text-xs font-bold px-2 py-0.5 rounded-md border border-primary/20 shadow-sm">
            COMING SOON
          </div>
        </div>
      )}

      {/* Horizontal layout for Process tools */}
      {!isSquare ? (
        <div className="flex items-center h-full p-6 relative">
          {/* Large subtle number in background */}
          {index !== undefined && (
            <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center pr-4">
              <span className="font-playfair text-[5rem] font-bold text-wes-vintage-gold/10 select-none">
                {index + 1}
              </span>
            </div>
          )}
          
          {/* Icon */}
          <div className="flex-shrink-0 mr-6 relative z-10">
            <div className={`w-20 h-20 bg-gradient-to-br ${item.gradient} rounded-2xl flex items-center justify-center shadow-wes-deep ${!isComingSoon ? 'group-hover:shadow-wes-hover group-hover:scale-110' : ''} transition-all duration-700`}>
              <item.icon className="w-10 h-10 text-white drop-shadow-lg" />
            </div>
          </div>
          
          {/* Text content */}
          <div className="flex-1 relative z-10">
            <h3 className={`font-playfair text-2xl font-bold text-primary mb-1 ${!isComingSoon ? 'group-hover:text-primary/80' : ''} transition-colors duration-300`}>
              {item.name}
            </h3>
            <p className="font-inter text-sm text-muted-foreground leading-relaxed">
              {item.description}
            </p>
          </div>
        </div>
      ) : (
        /* Square layout for Assistant tools */
        <div className="p-6 h-full flex flex-col">
          {/* Tool Header without icon */}
          <div className="wes-symmetry mb-3 relative">
            <div className="">
              <h3 className={`font-playfair text-2xl font-bold text-primary mb-2 ${!isComingSoon ? 'group-hover:text-primary/80' : ''} transition-colors duration-300 text-shadow-vintage text-center leading-tight whitespace-pre-line`}>
                {item.name}
              </h3>
              <div className={`w-16 h-1 bg-gradient-to-r from-${item.accent} to-wes-vintage-gold rounded-full mx-auto ${!isComingSoon ? 'group-hover:w-24' : ''} transition-all duration-700`}></div>
            </div>
          </div>

          {/* Description */}
          <div className="flex-1">
            <p className="font-inter text-muted-foreground leading-relaxed text-center text-sm">
              {item.description}
            </p>
          </div>
        </div>
      )}

      {/* Decorative Elements */}
      <div className="absolute top-4 right-4 opacity-20">
        <Sparkles className="w-5 h-5 text-primary animate-sway" />
      </div>

      {/* Hover shimmer effect (only for active tools) */}
      {!isComingSoon && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-wes-vintage-gold/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1200 ease-out"></div>
      )}
    </div>
  );

  if (isComingSoon) {
    return (
      <div className="relative">
        {/* Stable hover area to prevent flicker */}
        <div className="absolute inset-0 -m-4 z-0 pointer-events-none" />
        <button
          type="button"
          className="block animate-fade-in-up wes-corners cursor-pointer relative z-10 w-full text-left"
          onClick={handleComingSoonClick}
        >
          {content}
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative group cursor-pointer"
      onClick={() => {
        if (item.tool?.path) {
          navigate(item.tool.path);
        }
      }}
    >
      {/* Stable hover area to prevent flicker */}
      <div className="absolute inset-0 -m-4 z-0 pointer-events-none" />
      <div className="block animate-fade-in-up wes-corners relative z-10">
        {content}
      </div>
    </div>
  );
};

export default function ToolSelectorPage() {
  const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.DEV) as AppEnvValue;

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const isToolVisible = (tool: ToolUIDefinition | null) => {
    if (!tool) return false;
    if (currentEnv === AppEnv.DEV) return true;
    return tool.environments.includes(currentEnv);
  };

  return (
    <div className="min-h-screen wes-texture relative overflow-hidden">
      {/* Enhanced background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-60"></div>
      <div className="absolute inset-0 wes-chevron-pattern opacity-30"></div>
      {/* Top gradient bar removed to reduce visual clutter */}
      
      {/* Floating ornamental elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-wes-pink/10 rounded-full blur-3xl animate-parallax-float"></div>
      <div className="absolute top-40 right-20 w-24 h-24 bg-wes-yellow/15 rounded-full blur-2xl animate-parallax-float" style={{ animationDelay: '2s' }}></div>
      <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/10 rounded-full blur-3xl animate-parallax-float" style={{ animationDelay: '4s' }}></div>
      
      <div className="container mx-auto px-4 pt-4 pb-16 relative z-10">
        {/* Two Column Layout */}
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
          {/* Process Column (2/3 width) */}
          <div className="lg:w-2/3">
            <div className="mb-4">
              {/* Enhanced header with distinct styling */}
              <div className="inline-flex items-center space-x-3 bg-gradient-to-r from-wes-coral/20 to-wes-vintage-gold/20 px-6 py-3 rounded-full border border-wes-vintage-gold/30">
                <div className="relative">
                  <h2 className="font-inter text-lg font-semibold text-wes-coral uppercase tracking-wider">
                    Process
                  </h2>
                </div>
                <Crown className="w-4 h-4 text-wes-vintage-gold animate-bounce-gentle opacity-80" />
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              {processTools.map((tool, index) => (
                <div key={tool.id} style={{ animationDelay: `${index * 100}ms` }}>
                  <ToolCard item={tool} index={index} isVisible={isToolVisible(tool.tool)} />
                </div>
              ))}
            </div>
          </div>

          {/* Assistant Tools Column (1/3 width) */}
          <div className="lg:w-1/3">
            <div className="mb-4">
              {/* Enhanced header with distinct styling */}
              <div className="inline-flex items-center space-x-3 bg-gradient-to-r from-wes-dusty-blue/20 to-wes-lavender/20 px-6 py-3 rounded-full border border-wes-dusty-blue/30">
                <h2 className="font-inter text-lg font-semibold text-wes-dusty-blue uppercase tracking-wider">
                  Assistants
                </h2>
                <Sparkles className="w-4 h-4 text-wes-dusty-blue animate-rotate-slow opacity-80" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {assistantTools.map((tool, index) => (
                <div key={tool.id} style={{ animationDelay: `${(index + 4) * 100}ms` }}>
                  <ToolCard item={tool} isSquare isVisible={isToolVisible(tool.tool)} />
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Enhanced footer decorative line */}
        <div className="mt-32 flex items-center justify-center">
          <div className="flex items-center space-x-6">
            <div className="w-32 h-px bg-gradient-to-r from-transparent to-wes-vintage-gold/60"></div>
            <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow" />
            <div className="w-4 h-4 bg-wes-dusty-blue rounded-full animate-vintage-pulse wes-badge"></div>
            <Gem className="w-4 h-4 text-wes-coral animate-bounce-gentle" />
            <div className="w-20 h-px bg-wes-vintage-gold/60"></div>
            <div className="text-wes-vintage-gold text-xl animate-sway">❋</div>
            <div className="w-20 h-px bg-wes-vintage-gold/60"></div>
            <Gem className="w-4 h-4 text-wes-mint animate-bounce-gentle" style={{ animationDelay: '1s' }} />
            <div className="w-4 h-4 bg-wes-pink rounded-full animate-vintage-pulse wes-badge" style={{ animationDelay: '2s' }}></div>
            <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow" style={{ animationDelay: '1s' }} />
            <div className="w-32 h-px bg-gradient-to-l from-transparent to-wes-vintage-gold/60"></div>
          </div>
        </div>
      </div>
    </div>
  );
} 