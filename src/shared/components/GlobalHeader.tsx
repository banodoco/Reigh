import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useProject } from '@/shared/contexts/ProjectContext';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { PlusCircle, Settings, Palette, Sparkles } from 'lucide-react';
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
      <header className="wes-header sticky top-0 z-50 w-full">
        <div className="wes-pattern absolute inset-0 opacity-5"></div>
        <div 
          className="container flex h-20 max-w-screen-2xl items-center justify-between transition-all duration-300 ease-in-out relative z-10"
          style={{
            paddingRight: `${contentOffsetRight}px`,
          }}
        >
          {/* Left side - Brand */}
          <div className="flex items-center space-x-6">
            <Link to="/" className="group flex items-center space-x-3 wes-nav-item">
              <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-wes-pink to-wes-lavender rounded-xl border-2 border-primary/20 shadow-wes group-hover:shadow-wes-hover transition-all duration-300">
                <Palette className="h-6 w-6 text-primary group-hover:rotate-12 transition-transform duration-300" />
              </div>
              <div className="wes-symmetry">
                <span className="font-crimson text-2xl font-semibold tracking-wide text-primary">Artful Pane</span>
                <span className="font-inter text-xs tracking-widest uppercase text-muted-foreground">Craft Studio</span>
              </div>
            </Link>
          </div>

          {/* Center - Project Management */}
          <div className="wes-symmetry flex items-center space-x-4">
            {isLoadingProjects && projects.length === 0 ? (
              <div className="w-[220px] text-center">
                <div className="animate-pulse flex items-center justify-center space-x-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground animate-spin" />
                  <span className="font-inter text-sm text-muted-foreground">Loading projects...</span>
                </div>
              </div>
            ) : projects.length === 0 && !isLoadingProjects ? (
              <div className="w-[220px] text-center">
                <p className="font-inter text-sm text-muted-foreground">No projects found</p>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Select 
                  value={selectedProjectId || ''} 
                  onValueChange={handleProjectChange}
                  disabled={isLoadingProjects || projects.length === 0}
                >
                  <SelectTrigger className="w-[220px] wes-select border-2 border-primary/20 bg-white/90 font-inter text-sm shadow-wes hover:shadow-wes-hover transition-all duration-300">
                    <SelectValue placeholder="Select a project" className="font-crimson" />
                  </SelectTrigger>
                  <SelectContent className="wes-card border-2 border-primary/20">
                    {projects.map(project => (
                      <SelectItem 
                        key={project.id} 
                        value={project.id}
                        className="font-inter hover:bg-accent/30 transition-colors duration-200"
                      >
                        <div className="wes-symmetry">
                          <span className="font-crimson font-medium">{project.name}</span>
                          {project.aspectRatio && (
                            <span className="text-xs text-muted-foreground tracking-wider">{project.aspectRatio}</span>
                          )}
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
                    className="h-11 w-11 wes-button bg-gradient-to-br from-wes-mint to-wes-sage border-2 border-primary/20 hover:from-wes-mint-dark hover:to-wes-sage"
                    title="Project settings"
                    disabled={!selectedProject}
                  >
                    <Settings className="h-5 w-5 text-primary" />
                  </Button>
                )}
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsCreateProjectModalOpen(true)} 
                  className="h-11 w-11 wes-button bg-gradient-to-br from-wes-yellow to-wes-salmon border-2 border-primary/20 hover:from-wes-yellow-dark hover:to-wes-salmon group"
                  title="Create new project"
                >
                  <PlusCircle className="h-5 w-5 text-primary group-hover:rotate-90 transition-transform duration-300" />
                </Button>
              </div>
            )}
          </div>

          {/* Right side - Navigation */}
          <nav className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              onClick={() => alert('Generations clicked (dummy)')}
              className="wes-nav-item px-6 py-3 font-inter font-medium text-sm tracking-wider uppercase hover:bg-accent/30 transition-all duration-300"
            >
              <span className="relative">
                Generations
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-wes-yellow rounded-full animate-pulse"></span>
              </span>
            </Button>
            <Button 
              asChild 
              variant="ghost"
              className="wes-nav-item px-6 py-3 font-inter font-medium text-sm tracking-wider uppercase hover:bg-accent/30 transition-all duration-300"
            >
              <Link to="/shots">
                <span className="relative">
                  Shots
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-wes-mint rounded-full animate-pulse"></span>
                </span>
              </Link>
            </Button>
          </nav>
        </div>
        
        {/* Decorative border */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
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