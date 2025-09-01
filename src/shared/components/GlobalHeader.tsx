import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useProject } from '@/shared/contexts/ProjectContext';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { PlusCircle, Settings, Palette, Sparkles, Crown, Star, Gem, Wrench, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProjectSettingsModal } from '@/shared/components/ProjectSettingsModal';
import { toast } from "sonner";
import { useProjectContextDebug } from '@/shared/hooks/useProjectContextDebug';

import { useIsMobile } from '@/shared/hooks/use-mobile';

interface GlobalHeaderProps {
  contentOffsetRight?: number;
  contentOffsetLeft?: number;
  onOpenSettings?: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ contentOffsetRight = 0, contentOffsetLeft = 0, onOpenSettings }) => {
  const { projects, selectedProjectId, setSelectedProjectId, isLoadingProjects } = useProject();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // [MobileStallFix] Enable debug monitoring
  useProjectContextDebug();

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

  // [MobileStallFix] Add mobile-specific debug logging for stalling detection
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      console.log(`[GlobalHeader:MobileDebug] State - loading: ${isLoadingProjects}, projects: ${projects.length}, selected: ${selectedProjectId}`);
      
      // Check for stall condition
      if (isLoadingProjects && projects.length === 0) {
        console.log(`[GlobalHeader:MobileDebug] Mobile showing skeleton/loading state`);
      } else if (!isLoadingProjects && projects.length === 0) {
        console.warn(`[GlobalHeader:MobileDebug] Mobile showing 'no projects' - potential stall!`);
      } else if (projects.length > 0 && !selectedProjectId) {
        console.warn(`[GlobalHeader:MobileDebug] Mobile has projects but no selection - potential issue!`);
      }
    }
  }, [isLoadingProjects, projects.length, selectedProjectId]);

  const handleProjectChange = (projectId: string) => {
    if (projectId === 'create-new') {
      setIsCreateProjectModalOpen(true);
      return;
    }
    setSelectedProjectId(projectId);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <>
      <header 
        className={cn(
          "wes-header z-50 w-full relative overflow-hidden lg:p-0",
          isMobile ? "" : "sticky top-0"
        )} 
      >
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
          className="hidden lg:flex container items-center justify-between transition-all duration-300 ease-smooth relative z-10 h-24"
          style={{
            paddingRight: `${contentOffsetRight}px`,
            paddingLeft: `${contentOffsetLeft}px`,
          }}
        >
          {/* Left side - Brand + Project Selector */}
          <div className="flex items-center space-x-6 pl-4">
            {/* Brand */}
            <div 
              role="link"
              tabIndex={0}
              aria-label="Go to homepage"
              onPointerUp={() => navigate(session ? "/tools" : "/")}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(session ? "/tools" : "/"); }}
              className="group flex items-center space-x-4 relative p-2 -m-2 cursor-pointer"
            >
              <div className="relative">
                <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue rounded-2xl border-3 border-wes-vintage-gold/40 shadow-wes-vintage group-hover:shadow-wes-hover transition-all duration-500 wes-badge animate-reigh-color-cycle">
                  <Palette className="h-8 w-8 text-white group-hover:rotate-12 transition-transform duration-500 drop-shadow-lg" />
                </div>
                <div className="absolute -inset-1 border border-wes-vintage-gold/20 rounded-2xl animate-rotate-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute -top-2 -right-2">
                  <Crown className="w-4 h-4 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
                </div>
              </div>
              
              <div className="wes-symmetry relative">
                <span className="hidden sm:inline font-theme text-3xl font-theme-bold tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                  Reigh
                </span>
                <div className="absolute -top-1 -right-2">
                  <Star className="w-3 h-3 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                </div>
              </div>
            </div>

            {/* Project Management */}
            <div className="flex items-center space-x-4 relative p-2 border-2 border-wes-vintage-gold/30 rounded-xl bg-white/50 shadow-wes-vintage">
              {isLoadingProjects && projects.length === 0 ? (
                <div className="flex items-center space-x-4">
                  {/* Project Selector Skeleton */}
                  <div className="w-[280px] h-12 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse rounded-lg border-2 border-wes-vintage-gold/30"></div>
                </div>
              ) : projects.length === 0 && !isLoadingProjects ? (
                <div className="w-[280px] text-center">
                  <div className="wes-vintage-card p-3">
                    <p className="font-cocogoose text-sm text-muted-foreground">No projects found</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <Select 
                    value={selectedProjectId || ''} 
                    onValueChange={handleProjectChange}
                    disabled={isLoadingProjects || projects.length === 0}
                  >
                    <SelectTrigger className="w-[280px] wes-select border-2 border-wes-vintage-gold/30 bg-white/95 font-cocogoose text-sm shadow-wes-vintage hover:shadow-wes-hover transition-all duration-300 h-12 [&>svg]:opacity-30">
                      <SelectValue placeholder="Select a project" className="font-crimson text-primary" />
                    </SelectTrigger>
                    <SelectContent className="wes-vintage-card border-2 border-wes-vintage-gold/30 shadow-wes-deep">
                      {projects.map(project => (
                        <SelectItem 
                          key={project.id} 
                          value={project.id}
                          className="font-cocogoose hover:bg-wes-vintage-gold/20 transition-colors duration-300 p-3 pl-3 pr-8 [&>span:first-child]:left-auto [&>span:first-child]:right-2"
                        >
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-gradient-to-br from-wes-mint to-wes-sage rounded-full flex items-center justify-center flex-shrink-0">
                              <Star className="h-2 w-2 text-white flex-shrink-0" />
                            </div>
                            <span className="font-crimson font-light text-primary truncate">
                              {project.name.length > 30 ? `${project.name.substring(0, 30)}...` : project.name}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                      {projects.length > 0 && (
                        <div className="px-2 py-2">
                          <div className="border-t-2 border-wes-vintage-gold/30 relative">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-wes-vintage-gold/60 to-transparent" />
                          </div>
                        </div>
                      )}
                      <SelectItem 
                        value="create-new"
                        className="font-cocogoose hover:bg-wes-vintage-gold/20 transition-colors duration-300 p-3 pl-3 pr-8 [&>span:first-child]:left-auto [&>span:first-child]:right-2 mt-1"
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-gradient-to-br from-wes-vintage-gold to-amber-400 rounded-full flex items-center justify-center flex-shrink-0">
                            <PlusCircle className="h-2 w-2 text-white flex-shrink-0" />
                          </div>
                          <span className="font-crimson font-light text-primary">
                            Create New Project
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Project Settings Button - Always visible but disabled when appropriate */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProjectSettingsModalOpen(true)}
                className="h-12 w-12 wes-button bg-gradient-to-br from-wes-coral to-wes-salmon border-2 border-wes-vintage-gold/30 hover:from-wes-coral-dark hover:to-wes-salmon-dark shadow-wes-vintage hover:shadow-wes-hover group [&::before]:bg-gradient-to-t [&::before]:from-transparent [&::before]:via-white/20 [&::before]:to-transparent [&::before]:translate-y-[100%] [&::before]:translate-x-0 [&::before]:transition-transform [&::before]:duration-0 [&:hover::before]:translate-y-[-100%] [&:hover::before]:translate-x-0 [&:hover::before]:duration-700 disabled:cursor-not-allowed"
                title={isLoadingProjects ? "Loading projects..." : !selectedProject ? "Select a project first" : "Project settings"}
                disabled={isLoadingProjects || !selectedProject}
              >
                <Wrench className="h-5 w-5 text-white transition-transform duration-300 group-hover:rotate-12" />
              </Button>
              
              {/* Create Project Button - Always visible */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCreateProjectModalOpen(true)} 
                className="h-12 w-12 wes-button bg-gradient-to-br from-wes-yellow to-wes-salmon border-2 border-wes-vintage-gold/30 hover:from-wes-yellow-dark hover:to-wes-salmon shadow-wes-vintage hover:shadow-wes-hover group"
                title="Create new project"
              >
                <PlusCircle className="h-5 w-5 text-white transition-transform duration-300 group-hover:scale-110" />
              </Button>
            </div>
          </div>

          {/* Right side - App Settings */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-12 w-12 wes-button bg-gradient-to-br from-wes-dusty-blue to-wes-lavender border-2 border-wes-vintage-gold/40 hover:from-wes-dusty-blue-dark hover:to-wes-lavender-dark shadow-wes-vintage hover:shadow-wes-hover group relative overflow-hidden [&::before]:bg-gradient-to-b [&::before]:from-transparent [&::before]:via-white/20 [&::before]:to-transparent [&::before]:translate-y-[-100%] [&::before]:translate-x-0 [&::before]:transition-transform [&::before]:duration-0 [&:hover::before]:translate-y-[100%] [&:hover::before]:translate-x-0 [&:hover::before]:duration-700"
              title="App Settings"
            >
              {/* Animated background pattern */}
              <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain"></div>
              
              {/* Main settings icon */}
              <Settings className="h-5 w-5 text-white relative z-10 transition-transform duration-500 group-hover:[transform:rotate(360deg)] delay-100" />
            </Button>
          </div>
        </div>

        {/* Mobile Layout (below lg) */}
        <div 
          className="lg:hidden w-full pt-1"
          style={(() => {
            const symmetricOffset = Math.max(contentOffsetLeft || 0, contentOffsetRight || 0);
            // Reduce mobile padding to 60% of the calculated offset for tighter spacing
            const mobilePadding = Math.floor(symmetricOffset * 0.6);
            return symmetricOffset
              ? { paddingLeft: `${mobilePadding}px`, paddingRight: `${mobilePadding}px` }
              : undefined;
          })()}
        >
          {/* Top row - Brand + Project Buttons + App Settings */}
          <div className="flex items-center justify-between h-16 w-full px-4">
            {/* Left side - Brand + Project Buttons */}
            <div className="flex items-center space-x-3">
              {/* Brand */}
              <div
                role="link"
                tabIndex={0}
                aria-label="Go to homepage"
                onPointerUp={() => navigate(session ? "/tools" : "/")}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(session ? "/tools" : "/"); }}
                className="group relative cursor-pointer"
              >
                <div className="relative flex items-center space-x-2">
                  <div className="relative">
                    <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue rounded-xl border-2 border-wes-vintage-gold/40 shadow-wes-vintage group-hover:shadow-wes-hover transition-all duration-300 animate-reigh-color-cycle">
                      <Palette className="h-5 w-5 text-white group-hover:rotate-12 transition-transform duration-300 drop-shadow-lg" />
                    </div>
                    <div className="absolute -top-1 -right-1">
                      <Crown className="w-2.5 h-2.5 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
                    </div>
                  </div>
                  
                  <div className="relative">
                    <span className="font-theme text-xl font-theme-bold tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                      Reigh
                    </span>
                    <div className="absolute -top-1 -right-1">
                      <Star className="w-2 h-2 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Buttons */}
              {/* Project Settings Button - Always visible but disabled when appropriate */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProjectSettingsModalOpen(true)}
                className="h-10 w-10 wes-button bg-gradient-to-br from-wes-coral to-wes-salmon border-2 border-wes-vintage-gold/30 hover:from-wes-coral-dark hover:to-wes-salmon-dark shadow-wes-vintage hover:shadow-wes-hover group [&::before]:bg-gradient-to-t [&::before]:from-transparent [&::before]:via-white/20 [&::before]:to-transparent [&::before]:translate-y-[100%] [&::before]:translate-x-0 [&::before]:transition-transform [&::before]:duration-0 [&:hover::before]:translate-y-[-100%] [&:hover::before]:translate-x-0 [&:hover::before]:duration-700 disabled:cursor-not-allowed"
                title={isLoadingProjects ? "Loading projects..." : !selectedProject ? "Select a project first" : "Project settings"}
                disabled={isLoadingProjects || !selectedProject}
              >
                <Wrench className="h-4 w-4 text-white transition-transform duration-300 group-hover:rotate-12" />
              </Button>
              
              {/* Create Project Button - Always visible */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCreateProjectModalOpen(true)} 
                className="h-10 w-10 wes-button bg-gradient-to-br from-wes-yellow to-wes-salmon border-2 border-wes-vintage-gold/30 hover:from-wes-yellow-dark hover:to-wes-salmon shadow-wes-vintage hover:shadow-wes-hover group"
                title="Create new project"
              >
                <PlusCircle className="h-4 w-4 text-white transition-transform duration-300 group-hover:scale-110" />
              </Button>
            </div>

            {/* Right side - App Settings */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-10 w-10 wes-button bg-gradient-to-br from-wes-dusty-blue to-wes-lavender border-2 border-wes-vintage-gold/40 hover:from-wes-dusty-blue-dark hover:to-wes-lavender-dark shadow-wes-vintage hover:shadow-wes-hover group relative overflow-hidden [&::before]:bg-gradient-to-b [&::before]:from-transparent [&::before]:via-white/20 [&::before]:to-transparent [&::before]:translate-y-[-100%] [&::before]:translate-x-0 [&::before]:transition-transform [&::before]:duration-0 [&:hover::before]:translate-y-[100%] [&:hover::before]:translate-x-0 [&:hover::before]:duration-700"
              title="App Settings"
            >
              <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain"></div>
              <Settings className="h-4 w-4 text-white relative z-10 transition-transform duration-500 group-hover:[transform:rotate(360deg)] delay-100" />
            </Button>
          </div>

          {/* Bottom row - Project Selector */}
          <div className="flex items-center h-20 w-full border-t border-wes-vintage-gold/20 px-4 pt-2 pb-6">
            <div className="flex-1 p-3 border-2 border-wes-vintage-gold/30 rounded-xl bg-white/50 shadow-wes-vintage">
              {isLoadingProjects && projects.length === 0 ? (
                <div className="w-full h-10 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse rounded-lg border-2 border-wes-vintage-gold/30"></div>
              ) : projects.length === 0 && !isLoadingProjects ? (
                <div className="text-center">
                  <div className="wes-vintage-card p-2">
                    <p className="font-cocogoose text-xs text-muted-foreground">No projects</p>
                  </div>
                </div>
              ) : (
                <Select 
                  value={selectedProjectId || ''} 
                  onValueChange={handleProjectChange}
                  disabled={isLoadingProjects || projects.length === 0}
                >
                  <SelectTrigger className="w-full wes-select border-2 border-wes-vintage-gold/30 bg-white/95 font-cocogoose text-xs shadow-wes-vintage hover:shadow-wes-hover transition-all duration-300 h-10 [&>svg]:opacity-30">
                    <SelectValue placeholder="Select project" className="font-crimson text-primary" />
                  </SelectTrigger>
                  <SelectContent className="wes-vintage-card border-2 border-wes-vintage-gold/30 shadow-wes-deep">
                    {projects.map(project => (
                      <SelectItem 
                        key={project.id} 
                        value={project.id}
                        className="font-cocogoose hover:bg-wes-vintage-gold/20 transition-colors duration-300 p-3 pl-3 pr-8 [&>span:first-child]:left-auto [&>span:first-child]:right-2"
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-gradient-to-br from-wes-mint to-wes-sage rounded-full flex items-center justify-center flex-shrink-0">
                            <Star className="h-2 w-2 text-white flex-shrink-0" />
                          </div>
                          <span className="font-crimson font-light text-primary text-sm truncate">
                            {project.name.length > 30 ? `${project.name.substring(0, 30)}...` : project.name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    {projects.length > 0 && (
                      <div className="px-2 py-2">
                        <div className="border-t-2 border-wes-vintage-gold/30 relative">
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-wes-vintage-gold/60 to-transparent" />
                        </div>
                      </div>
                    )}
                    <SelectItem 
                      value="create-new"
                      className="font-cocogoose hover:bg-wes-vintage-gold/20 transition-colors duration-300 p-3 pl-3 pr-8 [&>span:first-child]:left-auto [&>span:first-child]:right-2 mt-1"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-gradient-to-br from-wes-vintage-gold to-amber-400 rounded-full flex items-center justify-center flex-shrink-0">
                          <PlusCircle className="h-2 w-2 text-white flex-shrink-0" />
                        </div>
                        <span className="font-crimson font-light text-primary text-sm">
                          Create New Project
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
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