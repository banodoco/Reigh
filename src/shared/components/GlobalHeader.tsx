import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useProject } from '@/shared/contexts/ProjectContext';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { PlusCircle, Settings, Palette, Sparkles, Crown, Star, Gem, Wrench } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProjectSettingsModal } from '@/shared/components/ProjectSettingsModal';
import { toast } from "sonner";

interface GlobalHeaderProps {
  contentOffsetRight?: number;
  contentOffsetLeft?: number;
  onOpenSettings?: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ contentOffsetRight = 0, contentOffsetLeft = 0, onOpenSettings }) => {
  const { projects, selectedProjectId, setSelectedProjectId, isLoadingProjects } = useProject();

  // Track authentication state to conditionally change the logo destination
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <>
      <header className="wes-header sticky top-0 z-50 w-full relative overflow-hidden lg:p-0" style={{ padding: 0, margin: 0 }}>
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
        
        {/* Desktop Layout (lg and up) */}
        <div 
          className="hidden lg:flex container items-center justify-between transition-all duration-300 ease-in-out relative z-10 h-24"
          style={{
            paddingRight: contentOffsetRight ? `${contentOffsetRight}px` : undefined,
            paddingLeft: contentOffsetLeft ? `${contentOffsetLeft}px` : undefined,
          }}
        >
          {/* Left side - Brand + Project Selector */}
          <div className="flex items-center space-x-6">
            {/* Brand */}
            <Link to={session ? "/tools" : "/"} className="group flex items-center space-x-4 relative">
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
                <span className="hidden sm:inline font-playfair text-3xl font-bold tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                  Reigh
                </span>
                <div className="absolute -top-1 -right-2">
                  <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                </div>
              </div>
            </Link>

            {/* Project Management */}
            <div className="wes-symmetry flex items-center space-x-4 relative">
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
                <div className="flex items-center space-x-4">
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
                      className="h-14 w-14 wes-button no-sweep bg-gradient-to-br from-wes-coral to-wes-salmon border-3 border-wes-vintage-gold/30 hover:from-wes-coral-dark hover:to-wes-salmon-dark shadow-wes-vintage hover:shadow-wes-hover wes-stamp group relative"
                      title="Project settings"
                      disabled={!selectedProject}
                    >
                      <Wrench className="h-6 w-6 text-white transition-all duration-500 group-hover:scale-110 group-hover:animate-wrench-turn" />
                      <div className="absolute -top-1 -right-1">
                        <Sparkles className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow opacity-70" />
                      </div>
                      <div className="absolute -bottom-1 -left-1">
                        <div className="w-2 h-2 bg-wes-mint rounded-full animate-vintage-pulse"></div>
                      </div>
                    </Button>
                  )}
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setIsCreateProjectModalOpen(true)} 
                    className="h-14 w-14 wes-button no-sweep bg-gradient-to-br from-wes-yellow to-wes-salmon border-3 border-wes-vintage-gold/30 hover:from-wes-yellow-dark hover:to-wes-salmon shadow-wes-vintage hover:shadow-wes-hover group wes-viewfinder"
                    title="Create new project"
                  >
                    <PlusCircle className="h-6 w-6 text-white transition-all duration-500 group-hover:animate-bubble-pop" />
                    <div className="absolute -top-2 -left-2">
                      <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow" />
                    </div>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right side - App Settings */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-14 w-14 wes-button no-sweep bg-gradient-to-br from-wes-dusty-blue to-wes-lavender border-3 border-wes-vintage-gold/40 hover:from-wes-dusty-blue-dark hover:to-wes-lavender-dark shadow-wes-vintage hover:shadow-wes-hover wes-viewfinder group relative overflow-hidden"
              title="App Settings"
            >
              {/* Animated background pattern */}
              <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain"></div>
              
              {/* Main settings icon */}
              <Settings className="h-6 w-6 text-white relative z-10 transition-transform group-hover:animate-spin" />
              
              {/* Decorative corner elements */}
              <div className="absolute -top-1 -right-1">
                <Crown className="w-3 h-3 text-wes-vintage-gold animate-bounce-gentle opacity-80" />
              </div>
              <div className="absolute -bottom-1 -left-1">
                <Star className="w-2 h-2 text-wes-coral animate-rotate-slow opacity-60" />
              </div>
            </Button>
          </div>
        </div>

        {/* Mobile Layout (below lg) */}
        <div 
          className="lg:hidden w-full"
          style={{
            position: 'relative',
            zIndex: 10,
            padding: 0,
            margin: 0,
            paddingTop: '8px',
            paddingRight: contentOffsetRight ? `${contentOffsetRight}px` : undefined,
            paddingLeft: contentOffsetLeft ? `${contentOffsetLeft}px` : undefined,
          }}
        >
          {/* Top row - Brand + Project Selector */}
                      <div className="flex items-center justify-between h-12 w-full" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
            {/* Brand - Left side (text only on mobile) */}
            <Link to={session ? "/tools" : "/"} className="group relative">
              <div className="relative">
                <span className="font-playfair text-xl font-bold tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                  Reigh
                </span>
                <div className="absolute -top-1 -right-1">
                  <Star className="w-2 h-2 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                </div>
              </div>
            </Link>

            {/* Project Selector - Right side (wider now) */}
            <div className="flex-1 ml-4">
              {isLoadingProjects && projects.length === 0 ? (
                <div className="text-center relative">
                  <div className="animate-vintage-pulse flex items-center justify-center space-x-2 p-2 wes-vintage-card">
                    <div className="w-4 h-4 bg-wes-vintage-gold rounded-full flex items-center justify-center">
                      <Sparkles className="h-2 w-2 text-primary animate-rotate-slow" />
                    </div>
                    <span className="font-crimson text-sm text-primary text-shadow-vintage">Loading...</span>
                  </div>
                </div>
              ) : projects.length === 0 && !isLoadingProjects ? (
                <div className="text-center">
                  <div className="wes-vintage-card p-2 wes-stamp">
                    <p className="font-inter text-xs text-muted-foreground">No projects</p>
                  </div>
                </div>
              ) : (
                <Select 
                  value={selectedProjectId || ''} 
                  onValueChange={handleProjectChange}
                  disabled={isLoadingProjects || projects.length === 0}
                >
                  <SelectTrigger className="w-full wes-select border-2 border-wes-vintage-gold/30 bg-white/95 font-inter text-xs shadow-wes-vintage hover:shadow-wes-hover transition-all duration-500 wes-ornate-frame h-10">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-wes-vintage-gold to-wes-coral rounded-md flex items-center justify-center">
                        <Palette className="h-3 w-3 text-white" />
                      </div>
                      <SelectValue placeholder="Select project" className="font-crimson text-primary" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="wes-vintage-card wes-ornate-frame border-2 border-wes-vintage-gold/30 shadow-wes-deep">
                    {projects.map(project => (
                      <SelectItem 
                        key={project.id} 
                        value={project.id}
                        className="font-inter hover:bg-wes-vintage-gold/20 transition-colors duration-300 p-3 wes-corners"
                      >
                        <div className="wes-symmetry">
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-gradient-to-br from-wes-mint to-wes-sage rounded-full flex items-center justify-center">
                              <Star className="h-2 w-2 text-white" />
                            </div>
                            <span className="font-crimson font-medium text-primary text-sm">{project.name}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Bottom row - App Settings + Action Buttons */}
          <div className="flex items-center justify-between h-14 w-full border-t border-wes-vintage-gold/20" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
            {/* App Settings - Left side (aligned with Reigh text) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-10 w-10 wes-button no-sweep bg-gradient-to-br from-wes-dusty-blue to-wes-lavender border-2 border-wes-vintage-gold/40 hover:from-wes-dusty-blue-dark hover:to-wes-lavender-dark shadow-wes-vintage hover:shadow-wes-hover wes-viewfinder group relative overflow-hidden"
              title="App Settings"
            >
              <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain"></div>
              <Settings className="h-4 w-4 text-white relative z-10 transition-transform group-hover:animate-spin" />
              <div className="absolute -top-1 -right-1">
                <Crown className="w-2 h-2 text-wes-vintage-gold animate-bounce-gentle opacity-80" />
              </div>
            </Button>

            {/* Action Buttons - Right side */}
            <div className="flex items-center space-x-2">
              {selectedProjectId && projects.length > 0 && ( 
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsProjectSettingsModalOpen(true)}
                  className="h-10 w-10 wes-button no-sweep bg-gradient-to-br from-wes-coral to-wes-salmon border-2 border-wes-vintage-gold/30 hover:from-wes-coral-dark hover:to-wes-salmon-dark shadow-wes-vintage hover:shadow-wes-hover wes-stamp group relative"
                  title="Project settings"
                  disabled={!selectedProject}
                >
                  <Wrench className="h-4 w-4 text-white transition-all duration-500 group-hover:scale-110 group-hover:animate-wrench-turn" />
                  <div className="absolute -top-1 -right-1">
                    <Sparkles className="w-2 h-2 text-wes-vintage-gold animate-rotate-slow opacity-70" />
                  </div>
                </Button>
              )}
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCreateProjectModalOpen(true)} 
                className="h-10 w-10 wes-button no-sweep bg-gradient-to-br from-wes-yellow to-wes-salmon border-2 border-wes-vintage-gold/30 hover:from-wes-yellow-dark hover:to-wes-salmon shadow-wes-vintage hover:shadow-wes-hover group wes-viewfinder"
                title="Create new project"
              >
                <PlusCircle className="h-4 w-4 text-white transition-all duration-500 group-hover:animate-bubble-pop" />
                <div className="absolute -top-1 -left-1">
                  <Star className="w-2 h-2 text-wes-vintage-gold animate-rotate-slow" />
                </div>
              </Button>
            </div>
          </div>
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