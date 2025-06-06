import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useProject } from '@/shared/contexts/ProjectContext';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { PlusCircle, Settings, Palette, Sparkles, Crown, Star, Gem } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProjectSettingsModal } from '@/shared/components/ProjectSettingsModal';

interface GlobalHeaderProps {
  contentOffsetRight?: number;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ contentOffsetRight = 0 }) => {
  const { projects, selectedProjectId, setSelectedProjectId, isLoadingProjects } = useProject();
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <>
      <header className="wes-header sticky top-0 z-50 w-full relative overflow-hidden">
        {/* Enhanced background patterns */}
        <div className="wes-deco-pattern absolute inset-0 opacity-20"></div>
        <div className="absolute inset-0 wes-diamond-pattern opacity-10"></div>
        
        {/* Vintage film grain overlay */}
        <div className="absolute inset-0 bg-film-grain opacity-10 animate-film-grain"></div>
        
        {/* Ornate top border with animated elements */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-wes-vintage-gold via-wes-coral via-wes-mint via-wes-yellow to-wes-vintage-gold animate-vintage-glow"></div>
        
        {/* Decorative corner elements */}
        <div className="absolute top-2 left-4 text-wes-vintage-gold text-xs animate-sway">❋</div>
        <div className="absolute top-2 right-4 text-wes-coral text-xs animate-sway" style={{ animationDelay: '1s' }}>◆</div>
        
        <div 
          className="container flex h-24 max-w-screen-2xl items-center justify-between transition-all duration-300 ease-in-out relative z-10"
          style={{
            paddingRight: `${contentOffsetRight}px`,
          }}
        >
          {/* Enhanced Left side - Brand */}
          <div className="flex items-center space-x-8">
            <Link to="/" className="group flex items-center space-x-4 wes-nav-item relative">
              <div className="relative">
                <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue rounded-2xl border-3 border-wes-vintage-gold/40 shadow-wes-vintage group-hover:shadow-wes-hover transition-all duration-500 wes-badge">
                  <Palette className="h-8 w-8 text-white group-hover:rotate-12 transition-transform duration-500 drop-shadow-lg" />
                </div>
                <div className="absolute -inset-1 border border-wes-vintage-gold/20 rounded-2xl animate-rotate-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute -top-2 -right-2">
                  <Crown className="w-4 h-4 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
                </div>
              </div>
              
              <div className="wes-symmetry relative">
                <span className="font-playfair text-3xl font-bold tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                  Reigh
                </span>
                <div className="absolute -top-1 -right-2">
                  <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                </div>
              </div>
            </Link>
          </div>

          {/* Enhanced Center - Project Management */}
          <div className="wes-symmetry flex items-center space-x-6 relative">
            {/* Decorative frame around project selector */}
            <div className="absolute -inset-4 border border-wes-vintage-gold/20 rounded-2xl wes-corners opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            {isLoadingProjects && projects.length === 0 ? (
              <div className="w-[280px] text-center relative group">
                <div className="animate-vintage-pulse flex items-center justify-center space-x-3 p-4 wes-vintage-card">
                  <div className="w-6 h-6 bg-wes-vintage-gold rounded-full flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-primary animate-rotate-slow" />
                  </div>
                  <span className="font-crimson text-lg text-primary text-shadow-vintage">Loading projects...</span>
                  <div className="w-6 h-6 bg-wes-coral rounded-full flex items-center justify-center animate-bounce-gentle">
                    <Gem className="h-3 w-3 text-white" />
                  </div>
                </div>
              </div>
            ) : projects.length === 0 && !isLoadingProjects ? (
              <div className="w-[280px] text-center">
                <div className="wes-vintage-card p-4 wes-stamp">
                  <p className="font-inter text-sm text-muted-foreground">No projects found</p>
                  <div className="mt-2 flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-wes-pink rounded-full animate-vintage-pulse"></div>
                    <div className="w-2 h-2 bg-wes-mint rounded-full animate-vintage-pulse" style={{ animationDelay: '0.5s' }}></div>
                    <div className="w-2 h-2 bg-wes-yellow rounded-full animate-vintage-pulse" style={{ animationDelay: '1s' }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-4 group">
                <Select 
                  value={selectedProjectId || ''} 
                  onValueChange={handleProjectChange}
                  disabled={isLoadingProjects || projects.length === 0}
                >
                  <SelectTrigger className="w-[280px] wes-select border-3 border-wes-vintage-gold/30 bg-white/95 font-inter text-sm shadow-wes-vintage hover:shadow-wes-hover transition-all duration-500 wes-ornate-frame h-12">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-wes-vintage-gold to-wes-coral rounded-lg flex items-center justify-center">
                        <Palette className="h-4 w-4 text-white" />
                      </div>
                      <SelectValue placeholder="Select a project" className="font-crimson text-primary" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="wes-vintage-card wes-ornate-frame border-3 border-wes-vintage-gold/30 shadow-wes-deep">
                    {projects.map(project => (
                      <SelectItem 
                        key={project.id} 
                        value={project.id}
                        className="font-inter hover:bg-wes-vintage-gold/20 transition-colors duration-300 p-4 wes-corners"
                      >
                        <div className="wes-symmetry">
                          <div className="flex items-center space-x-3">
                            <div className="w-6 h-6 bg-gradient-to-br from-wes-mint to-wes-sage rounded-full flex items-center justify-center">
                              <Star className="h-3 w-3 text-white" />
                            </div>
                            <span className="font-crimson font-medium text-primary">{project.name}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedProjectId && projects.length > 0 && ( 
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsProjectSettingsModalOpen(true)}
                    className="h-14 w-14 wes-button bg-gradient-to-br from-wes-mint to-wes-sage border-3 border-wes-vintage-gold/30 hover:from-wes-mint-dark hover:to-wes-sage shadow-wes-vintage hover:shadow-wes-hover wes-stamp group"
                    title="Project settings"
                    disabled={!selectedProject}
                  >
                    <Settings className="h-6 w-6 text-white group-hover:rotate-90 transition-transform duration-500" />
                    <div className="absolute -top-1 -right-1">
                      <Gem className="w-3 h-3 text-wes-vintage-gold animate-bounce-gentle" />
                    </div>
                  </Button>
                )}
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsCreateProjectModalOpen(true)} 
                  className="h-14 w-14 wes-button bg-gradient-to-br from-wes-yellow to-wes-salmon border-3 border-wes-vintage-gold/30 hover:from-wes-yellow-dark hover:to-wes-salmon shadow-wes-vintage hover:shadow-wes-hover group wes-viewfinder"
                  title="Create new project"
                >
                  <PlusCircle className="h-6 w-6 text-white group-hover:rotate-90 transition-transform duration-500" />
                  <div className="absolute -top-2 -left-2">
                    <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow" />
                  </div>
                </Button>
              </div>
            )}
          </div>

          {/* Enhanced Right side - Navigation */}
          <nav className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              onClick={() => alert('Generations clicked (dummy)')}
              className="wes-nav-item px-8 py-4 font-inter font-medium text-sm tracking-ultra-wide uppercase hover:bg-wes-vintage-gold/20 transition-all duration-500 relative group"
            >
              <span className="relative flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-primary group-hover:animate-rotate-slow transition-all duration-300" />
                <span>Generations</span>
                <div className="absolute -top-2 -right-2 w-3 h-3 bg-wes-yellow rounded-full animate-vintage-pulse group-hover:opacity-100 opacity-0 transition-opacity duration-300">
                  <div className="absolute inset-0 bg-wes-yellow rounded-full animate-ping opacity-30"></div>
                </div>
              </span>
            </Button>
            
            <Button 
              asChild 
              variant="ghost"
              className="wes-nav-item px-8 py-4 font-inter font-medium text-sm tracking-ultra-wide uppercase hover:bg-wes-vintage-gold/20 transition-all duration-500 relative group"
            >
              <Link to="/shots">
                <span className="relative flex items-center space-x-2">
                  <Crown className="w-4 h-4 text-primary group-hover:animate-bounce-gentle transition-all duration-300" />
                  <span>Shots</span>
                  <div className="absolute -top-2 -right-2 w-3 h-3 bg-wes-mint rounded-full animate-vintage-pulse group-hover:opacity-100 opacity-0 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-wes-mint rounded-full animate-ping opacity-30"></div>
                  </div>
                </span>
              </Link>
            </Button>
          </nav>
        </div>
        
        {/* Enhanced decorative bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent"></div>
        <div className="absolute bottom-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-wes-coral/30 to-transparent"></div>
        
        {/* Floating decorative elements */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center space-x-4">
            <div className="w-1 h-1 bg-wes-vintage-gold rounded-full animate-vintage-pulse"></div>
            <div className="text-wes-vintage-gold text-xs animate-sway">◆</div>
            <div className="w-1 h-1 bg-wes-coral rounded-full animate-vintage-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
        </div>
      </header>
      
      <CreateProjectModal 
        isOpen={isCreateProjectModalOpen} 
        onOpenChange={setIsCreateProjectModalOpen} 
      />
      {selectedProject && (
        <ProjectSettingsModal
          isOpen={isProjectSettingsModalOpen}
          onOpenChange={setIsProjectSettingsModalOpen}
          project={selectedProject}
        />
      )}
    </>
  );
}; 