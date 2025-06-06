import { Link } from 'react-router-dom';
import { AppEnv, LOCAL_ENVS, type AppEnvValue } from '../types/env';
import { Palette, Video, Edit3, Sparkles, ArrowRight, Wand2 } from 'lucide-react';

interface Tool {
  name: string;
  path: string;
  description: string;
  environments: AppEnvValue[];
  icon?: React.ComponentType<any>;
  gradient?: string;
  features?: string[];
}

const tools: Tool[] = [
  {
    name: 'Generate Images with Structure',
    path: '/tools/image-generation',
    description: 'Craft and generate intricate images using a structured approach with advanced AI models and fine-tuned control.',
    environments: [AppEnv.DEV],
    icon: Palette,
    gradient: 'from-purple-500 via-pink-500 to-red-500',
    features: ['AI-Powered Generation', 'LoRA Models', 'Advanced Controls', 'Batch Processing']
  },
  {
    name: 'Travel Between Images',
    path: '/tools/video-travel',
    description: 'Create mesmerizing video sequences by defining smooth cinematic paths between existing images.',
    environments: LOCAL_ENVS,
    icon: Video,
    gradient: 'from-blue-500 via-teal-500 to-green-500',
    features: ['Video Synthesis', 'Motion Paths', 'Temporal Consistency', 'Export Options']
  },
  {
    name: 'Edit Travel (Image Edit)',
    path: '/tools/edit-travel',
    description: 'Transform existing images using intelligent text prompts with state-of-the-art editing models.',
    environments: [AppEnv.DEV],
    icon: Edit3,
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
    features: ['Text-to-Edit', 'Fal Kontext', 'Precision Control', 'Instant Preview']
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
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-surface-muted">
      {/* Hero Section */}
      <div className="container mx-auto px-6 pt-16 pb-12">
        <div className="text-center max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-artistic rounded-2xl blur-xl opacity-60 animate-gentle-pulse"></div>
              <div className="relative bg-gradient-artistic p-4 rounded-2xl shadow-artistic">
                <Wand2 className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>
          
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-bold mb-6 animate-fade-in">
            Choose Your Creative Tool
          </h1>
          
          <p className="text-lg md:text-xl text-subtle-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Unleash your artistic vision with our curated collection of AI-powered creative tools. 
            Each designed to transform your imagination into stunning visual experiences.
          </p>
          
          <div className="flex justify-center mt-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center space-x-2 glass-morphism-dark px-4 py-2 rounded-full">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm text-subtle-foreground">
                {visibleTools.length} tool{visibleTools.length !== 1 ? 's' : ''} available in <span className="text-primary font-medium">{currentEnv}</span> environment
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      {visibleTools.length > 0 ? (
        <div className="container mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {visibleTools.map((tool, index) => {
              const IconComponent = tool.icon || Palette;
              return (
                <Link
                  to={tool.path}
                  key={tool.name}
                  className="group block animate-fade-in hover:scale-[1.02] transition-all duration-500"
                  style={{ animationDelay: `${0.6 + index * 0.1}s` }}
                >
                  <div className="card-artistic p-8 h-full rounded-3xl relative overflow-hidden">
                    {/* Background gradient overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}></div>
                    
                    {/* Icon */}
                    <div className="relative mb-6">
                      <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity duration-300`}></div>
                      <div className={`relative bg-gradient-to-br ${tool.gradient} p-4 rounded-2xl w-fit shadow-artistic`}>
                        <IconComponent className="h-6 w-6 text-white" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="relative z-10">
                      <h3 className="font-serif text-2xl font-semibold mb-4 text-foreground group-hover:text-gradient-primary transition-all duration-300">
                        {tool.name}
                      </h3>
                      
                      <p className="text-subtle-foreground leading-relaxed mb-6 line-clamp-3">
                        {tool.description}
                      </p>

                      {/* Features */}
                      {tool.features && (
                        <div className="space-y-2 mb-6">
                          {tool.features.slice(0, 3).map((feature, featureIndex) => (
                            <div key={featureIndex} className="flex items-center space-x-2">
                              <div className={`w-1.5 h-1.5 bg-gradient-to-r ${tool.gradient} rounded-full`}></div>
                              <span className="text-sm text-subtle-foreground">{feature}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action */}
                      <div className="flex items-center justify-between pt-4 border-t border-border/30">
                        <span className="text-sm text-subtle-foreground">Get started</span>
                        <div className="flex items-center space-x-1 text-primary group-hover:translate-x-1 transition-transform duration-300">
                          <span className="text-sm font-medium">Launch</span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    {/* Hover effects */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-6 pb-20">
          <div className="text-center max-w-2xl mx-auto">
            <div className="glass-morphism-dark p-12 rounded-3xl animate-fade-in">
              <div className="mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-muted to-muted-foreground/20 rounded-full flex items-center justify-center mx-auto">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              
              <h2 className="font-serif text-2xl font-semibold mb-4 text-foreground">
                No Tools Available
              </h2>
              
              <p className="text-subtle-foreground mb-6">
                {currentEnv === AppEnv.DEV && tools.length > 0 ? 
                  'No tools are configured to be visible in the DEV environment. Check tool definitions in ToolSelectorPage.tsx' :
                  `No tools are available for the current environment (${currentEnv}).`
                }
              </p>
              
              {/* Provide a more helpful message if currentEnv is not DEV and no tools are showing */}
              {currentEnv !== AppEnv.DEV && !tools.some(t => t.environments.includes(currentEnv)) && (
                <div className="glass-morphism px-4 py-3 rounded-xl bg-warning/10 border border-warning/20">
                  <p className="text-sm text-warning-foreground">
                    You might want to check the `environments` array for each tool in `ToolSelectorPage.tsx` or set VITE_APP_ENV to `dev` to see all development tools.
                  </p>
                </div>
              )}
              
              {/* Message if dev env itself has no tools configured to show */}
              {currentEnv === AppEnv.DEV && !tools.some(t => t.environments.includes(AppEnv.DEV)) && tools.length > 0 && (
                <div className="glass-morphism px-4 py-3 rounded-xl bg-warning/10 border border-warning/20">
                  <p className="text-sm text-warning-foreground">
                    Ensure tools intended for development have `AppEnv.DEV` in their `environments` array in `ToolSelectorPage.tsx`.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-full blur-3xl animate-subtle-float"></div>
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-r from-accent/10 to-tertiary/10 rounded-full blur-3xl animate-subtle-float" style={{ animationDelay: '2s' }}></div>
      </div>
    </div>
  );
} 