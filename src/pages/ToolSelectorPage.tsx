import { Link } from 'react-router-dom';
import { AppEnv, LOCAL_ENVS, type AppEnvValue } from '../types/env';
import { Paintbrush, Video, Edit, Sparkles, Camera, Palette, Zap } from 'lucide-react';

interface Tool {
  name: string;
  path: string;
  description: string;
  environments: AppEnvValue[];
  icon: React.ComponentType<any>;
  gradient: string;
  accent: string;
}

const tools: Tool[] = [
  {
    name: 'Generate Images with Structure',
    path: '/tools/image-generation',
    description: 'Craft and generate intricate images using a structured approach with precision and artistic flair.',
    environments: [AppEnv.DEV],
    icon: Paintbrush,
    gradient: 'from-wes-pink via-wes-lavender to-wes-dusty-blue',
    accent: 'wes-pink',
  },
  {
    name: 'Travel Between Images',
    path: '/tools/video-travel',
    description: 'Create mesmerizing video sequences by defining elegant paths between existing images.',
    environments: LOCAL_ENVS,
    icon: Video,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    accent: 'wes-mint',
  },
  {
    name: 'Edit Travel (Image Edit)',
    path: '/tools/edit-travel',
    description: 'Transform existing images using poetic text prompts with the sophisticated Fal Kontext model.',
    environments: [AppEnv.DEV],
    icon: Edit,
    gradient: 'from-wes-yellow via-wes-salmon to-wes-pink',
    accent: 'wes-yellow',
  },
  // Placeholder examples if you add more tools:
  // { name: 'Placeholder Tool 1', path: '#', description: 'Future tool placeholder.', environments: [AppEnv.DEV, AppEnv.WEB] }, // DEV and WEB
  // { name: 'Placeholder Tool 2', path: '#', description: 'Another future tool placeholder.', environments: [AppEnv.LOCAL, AppEnv.WEB] }, // LOCAL and WEB
];

export default function ToolSelectorPage() {
  const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.DEV) as AppEnvValue;

  const visibleTools = tools.filter(tool => {
    if (currentEnv === AppEnv.DEV) {
      return true; // Show all tools if current environment is DEV
    }
    // For other environments (local, web), respect the tool's specific environments array
    return tool.environments.includes(currentEnv);
  });

  return (
    <div className="min-h-screen wes-texture relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-50"></div>
      <div className="absolute top-20 left-10 w-32 h-32 bg-wes-pink/20 rounded-full blur-3xl animate-wes-float"></div>
      <div className="absolute top-40 right-20 w-24 h-24 bg-wes-yellow/20 rounded-full blur-2xl animate-wes-float" style={{ animationDelay: '2s' }}></div>
      <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/20 rounded-full blur-3xl animate-wes-float" style={{ animationDelay: '4s' }}></div>
      
      <div className="container mx-auto px-4 py-16 relative z-10">
        {/* Hero Section */}
        <div className="wes-symmetry mb-20 animate-wes-appear">
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gradient-to-br from-wes-burgundy to-primary rounded-2xl flex items-center justify-center shadow-wes">
                <Palette className="w-8 h-8 text-wes-cream" />
              </div>
              <div className="w-2 h-16 bg-gradient-to-b from-wes-pink to-wes-lavender rounded-full"></div>
              <div className="w-12 h-12 bg-gradient-to-br from-wes-mint to-wes-sage rounded-xl flex items-center justify-center shadow-wes">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>
          
          <h1 className="font-crimson text-6xl md:text-7xl font-semibold text-primary mb-6 tracking-wide">
            Select Your
            <span className="block bg-gradient-to-r from-wes-burgundy via-wes-dusty-blue to-wes-forest bg-clip-text text-transparent">
              Creative Tool
            </span>
          </h1>
          
          <div className="max-w-2xl mx-auto">
            <p className="font-inter text-lg text-muted-foreground leading-relaxed tracking-wide">
              Choose from our carefully curated collection of artistic instruments, 
              each designed to bring your creative vision to life with precision and elegance.
            </p>
            
            <div className="flex items-center justify-center mt-8 space-x-8">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-wes-pink rounded-full animate-pulse"></div>
                <span className="font-inter text-sm tracking-widest uppercase text-muted-foreground">Artistic</span>
              </div>
              <div className="w-px h-6 bg-border"></div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-wes-mint rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                <span className="font-inter text-sm tracking-widest uppercase text-muted-foreground">Elegant</span>
              </div>
              <div className="w-px h-6 bg-border"></div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-wes-yellow rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
                <span className="font-inter text-sm tracking-widest uppercase text-muted-foreground">Precise</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        {visibleTools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {visibleTools.map((tool, index) => {
              const IconComponent = tool.icon;
              return (
                <Link
                  to={tool.path}
                  key={tool.name}
                  className="group block animate-wes-appear"
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  <div className="wes-tool-card relative overflow-hidden h-full">
                    {/* Tool Icon & Header */}
                    <div className="wes-symmetry mb-6">
                      <div className={`w-20 h-20 bg-gradient-to-br ${tool.gradient} rounded-2xl flex items-center justify-center shadow-wes group-hover:shadow-wes-hover transition-all duration-500 group-hover:scale-110 group-hover:rotate-6`}>
                        <IconComponent className="w-10 h-10 text-white drop-shadow-lg" />
                      </div>
                      
                      <div className="mt-4">
                        <h2 className="font-crimson text-2xl font-semibold text-primary mb-2 group-hover:text-primary/80 transition-colors duration-300">
                          {tool.name}
                        </h2>
                        <div className={`w-16 h-1 bg-${tool.accent} rounded-full mx-auto group-hover:w-24 transition-all duration-500`}></div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="font-inter text-muted-foreground leading-relaxed text-center px-2">
                      {tool.description}
                    </p>

                    {/* Decorative Elements */}
                    <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity duration-300">
                      <Zap className="w-6 h-6 text-primary" />
                    </div>
                    
                    <div className="absolute bottom-4 left-4 opacity-10 group-hover:opacity-30 transition-opacity duration-300">
                      <div className="w-8 h-8 border-2 border-primary rounded-full"></div>
                    </div>

                    {/* Hover shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="wes-symmetry py-20 animate-wes-appear">
            <div className="wes-card max-w-2xl mx-auto p-12">
              <div className="mb-8">
                <Camera className="w-16 h-16 text-muted-foreground mx-auto opacity-50" />
              </div>
              
              <h2 className="font-crimson text-3xl font-semibold text-primary mb-4">
                No Tools Available
              </h2>
              
              <p className="font-inter text-lg text-muted-foreground mb-6">
                {currentEnv === AppEnv.DEV && tools.length > 0 ? 
                  'No tools are configured to be visible in the DEV environment. Check tool definitions in ToolSelectorPage.tsx' :
                  `No tools available for the current environment (${currentEnv}).`
                }
              </p>
              
              {/* Provide a more helpful message if currentEnv is not DEV and no tools are showing */}
              {currentEnv !== AppEnv.DEV && !tools.some(t => t.environments.includes(currentEnv)) && (
                <p className="font-inter text-sm text-muted-foreground bg-wes-yellow/20 p-4 rounded-lg border border-wes-yellow/30">
                  You might want to check the `environments` array for each tool in `ToolSelectorPage.tsx` or set VITE_APP_ENV to `dev` to see all development tools.
                </p>
              )}
               
              {/* Message if dev env itself has no tools configured to show */}
              {currentEnv === AppEnv.DEV && !tools.some(t => t.environments.includes(AppEnv.DEV)) && tools.length > 0 && (
                <p className="font-inter text-sm text-muted-foreground bg-wes-pink/20 p-4 rounded-lg border border-wes-pink/30">
                  Ensure tools intended for development have `AppEnv.DEV` in their `environments` array in `ToolSelectorPage.tsx`.
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* Footer decorative line */}
        <div className="mt-20 flex items-center justify-center">
          <div className="flex items-center space-x-4">
            <div className="w-24 h-px bg-gradient-to-r from-transparent to-primary/30"></div>
            <div className="w-2 h-2 bg-wes-dusty-blue rounded-full"></div>
            <div className="w-16 h-px bg-primary/30"></div>
            <div className="w-2 h-2 bg-wes-pink rounded-full"></div>
            <div className="w-24 h-px bg-gradient-to-l from-transparent to-primary/30"></div>
          </div>
        </div>
      </div>
    </div>
  );
} 