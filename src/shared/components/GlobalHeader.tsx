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
      <header className="nav-artistic sticky top-0 z-50 w-full">
        <div 
          className="container flex h-16 max-w-screen-2xl items-center justify-between transition-all duration-500 ease-out px-6"
          style={{
            paddingRight: `${Math.max(24, contentOffsetRight)}px`,
          }}
        >
          {/* Logo and Brand */}
          <div className="flex items-center space-x-8">
            <Link to="/" className="group flex items-center space-x-3 transition-all duration-300 hover:scale-105">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-artistic rounded-full blur-sm opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>
                <div className="relative bg-gradient-artistic p-2 rounded-full shadow-artistic">
                  <Palette className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-serif text-xl font-bold text-gradient-primary tracking-tight">
                  Artful Pane Craft
                </span>
                <span className="text-xs text-subtle-foreground tracking-wider uppercase">
                  Creative Studio
                </span>
              </div>
            </Link>

            {/* Project Selector */}
            <div className="flex items-center space-x-3">
              {isLoadingProjects && projects.length === 0 ? (
                <div className="glass-morphism-dark px-4 py-2 rounded-xl animate-gentle-pulse">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-primary/30 rounded-full animate-pulse"></div>
                    <span className="text-sm text-subtle-foreground">Loading projects...</span>
                  </div>
                </div>
              ) : projects.length === 0 && !isLoadingProjects ? (
                <div className="glass-morphism-dark px-4 py-2 rounded-xl">
                  <span className="text-sm text-subtle-foreground">No projects found</span>
                </div>
              ) : (
                <div className="relative">
                  <Select 
                    value={selectedProjectId || ''} 
                    onValueChange={handleProjectChange}
                    disabled={isLoadingProjects || projects.length === 0}
                  >
                    <SelectTrigger className="glass-morphism-dark border-0 min-w-[220px] h-11 px-4 text-foreground hover:bg-white/10 transition-all duration-300 focus:ring-2 focus:ring-primary/50 rounded-xl">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <SelectValue placeholder="Select a project" className="text-foreground" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="glass-morphism-dark border-border/30 rounded-xl">
                      {projects.map(project => (
                        <SelectItem 
                          key={project.id} 
                          value={project.id}
                          className="hover:bg-primary/20 focus:bg-primary/20 text-foreground rounded-lg mx-1 my-0.5"
                        >
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-gradient-artistic rounded-full"></div>
                            <span>{project.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Project Actions */}
              <div className="flex items-center space-x-2">
                {selectedProjectId && projects.length > 0 && ( 
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsProjectSettingsModalOpen(true)}
                    className="glass-morphism-dark hover:bg-primary/20 border-0 h-11 w-11 rounded-xl transition-all duration-300 hover:scale-105 group"
                    title="Project settings"
                    disabled={!selectedProject}
                  >
                    <Settings className="h-4 w-4 text-subtle-foreground group-hover:text-primary transition-colors duration-300" />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsCreateProjectModalOpen(true)} 
                  className="btn-artistic h-11 w-11 rounded-xl border-0 text-white hover:scale-110 transition-all duration-300 relative overflow-hidden group"
                  title="Create new project"
                >
                  <PlusCircle className="h-4 w-4 relative z-10" />
                  <div className="absolute inset-0 bg-gradient-accent opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                </Button>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              onClick={() => alert('Generations clicked (dummy)')}
              className="glass-morphism-dark hover:bg-primary/20 border-0 px-6 h-11 rounded-xl text-foreground hover:text-primary transition-all duration-300 font-medium"
            >
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-secondary rounded-full animate-gentle-pulse"></div>
                <span>Generations</span>
              </div>
            </Button>
            <Button 
              asChild 
              variant="ghost"
              className="glass-morphism-dark hover:bg-primary/20 border-0 px-6 h-11 rounded-xl text-foreground hover:text-primary transition-all duration-300 font-medium"
            >
              <Link to="/shots">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-tertiary rounded-full animate-gentle-pulse"></div>
                  <span>Shots</span>
                </div>
              </Link>
            </Button>
          </nav>
        </div>

        {/* Subtle gradient border at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-artistic opacity-30"></div>
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